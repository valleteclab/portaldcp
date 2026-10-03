import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Ator } from '../auth/acesso/ator';
import { TipoProcesso } from './entities/processo.entity';
import { diasEntre, estadoPeloTempo, EstadoAndamento, EtapaDoCaminho, etapasDaLicitacao, etapasDoPedido, etapasDoProcessoProprio, rotuloTipoProcesso } from './painel-gestor-regras';

/**
 * PAINEL DO GESTOR (mockup aprovado 03/10/2026): todos os processos do órgão
 * numa fila — licitações, aditivos, renovações, avulsos e pedidos (demandas)
 * — com o caminho de cada um, com quem está, há quanto tempo, prazos e os
 * gargalos por setor. Leitura só por SQL (sem calcular o fluxo da fase
 * interna): a fase da licitação dá a etapa; a última tramitação dá a posse.
 */
export interface LinhaDoPainel {
  id: string;
  tipo: string;
  rotulo_tipo: string;
  numero: string;
  objeto: string;
  situacao: 'ABERTO' | 'ENCERRADO';
  estado: EstadoAndamento;
  etapas: EtapaDoCaminho[];
  etapa_atual: string | null;
  esta_com: { setor_id: string | null; setor_nome: string | null; usuario_nome: string | null; recebida: boolean; desde: string | null; dias: number; despacho: string | null; limite_dias: number | null } | null;
  valor: number | null;
  prazo: { rotulo: string; data: string | null; vencido: boolean } | null;
  link: string;
  aberto_em: string | null;
}

@Injectable()
export class PainelGestorService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  private orgaoDe(ator: Ator, informado?: string): string {
    const id = ator.admin ? informado || ator.orgaoId : ator.orgaoId;
    if (!id) throw new NotFoundException('Órgão não identificado');
    return id;
  }

  async painel(ator: Ator, orgaoInformado?: string) {
    const orgaoId = this.orgaoDe(ator, orgaoInformado);
    const agora = new Date();
    const [processos, pedidos] = await Promise.all([this.linhasDosProcessos(orgaoId, agora), this.linhasDosPedidos(orgaoId, agora)]);
    const linhas = [...processos, ...pedidos].sort((a, b) => pesoEstado(b.estado) - pesoEstado(a.estado) || (b.esta_com?.dias ?? 0) - (a.esta_com?.dias ?? 0));
    const abertos = linhas.filter((l) => l.situacao === 'ABERTO');
    const inicioDoMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const [concluidosMes] = await this.ds.query(
      `SELECT COUNT(*)::int AS n FROM processos WHERE orgao_id::text = $1 AND situacao = 'ENCERRADO' AND encerrado_em >= $2`,
      [orgaoId, inicioDoMes.toISOString()],
    );
    return {
      gerado_em: agora.toISOString(),
      kpis: {
        em_andamento: abertos.length,
        parados: abertos.filter((l) => l.estado === 'PARADO').length,
        aguardando_recebimento: abertos.filter((l) => l.esta_com && !l.esta_com.recebida).length,
        pedidos_aguardando_dfd: pedidos.filter((l) => l.etapa_atual === 'DFD').length,
        concluidos_mes: Number(concluidosMes?.n ?? 0),
      },
      por_tipo: contar(abertos.map((l) => l.tipo)),
      gargalos: this.gargalos(abertos),
      prazos: abertos
        .filter((l) => l.prazo?.data)
        .sort((a, b) => String(a.prazo!.data).localeCompare(String(b.prazo!.data)))
        .slice(0, 12)
        .map((l) => ({ id: l.id, tipo: l.tipo, numero: l.numero, objeto: l.objeto, prazo: l.prazo, esta_com: l.esta_com?.setor_nome ?? null, link: l.link })),
      linhas,
    };
  }

  private async linhasDosProcessos(orgaoId: string, agora: Date): Promise<LinhaDoPainel[]> {
    const procs: Array<{
      id: string; tipo: string; numero: string; objeto: string; situacao: string; referencia_tipo: string | null; referencia_id: string | null; contrato_id: string | null; aberto_em: Date; encerrado_em: Date | null;
      lic_fase: string | null; lic_situacao: string | null; lic_valor: string | null; lic_sessao: Date | null; lic_impugnacao: Date | null;
      contrato_numero: string | null; contrato_valor: string | null; contrato_fim: Date | null;
      mov_setor_id: string | null; mov_setor_nome: string | null; mov_usuario_nome: string | null; mov_recebida_em: Date | null; mov_despacho: string | null; mov_em: Date | null;
      tr_setor_id: string | null; tr_setor_nome: string | null; tr_usuario_nome: string | null; tr_status: string | null; tr_recebido_em: Date | null; tr_despacho: string | null; tr_em: Date | null; tr_prazo_dias: number | null;
    }> = await this.ds.query(
      `SELECT p.id::text AS id, p.tipo::text AS tipo, p.numero, p.objeto, p.situacao::text AS situacao, p.referencia_tipo, p.referencia_id::text AS referencia_id,
              p.contrato_id::text AS contrato_id, p.aberto_em, p.encerrado_em,
              l.fase::text AS lic_fase, l.situacao::text AS lic_situacao, l.valor_total_estimado::text AS lic_valor, l.data_abertura_sessao AS lic_sessao, l.data_limite_impugnacao AS lic_impugnacao,
              c.numero_contrato AS contrato_numero, c.valor_global::text AS contrato_valor, c.data_vigencia_fim AS contrato_fim,
              m.para_setor_id::text AS mov_setor_id, m.para_setor_nome AS mov_setor_nome, m.para_usuario_nome AS mov_usuario_nome, m.recebida_em AS mov_recebida_em, m.despacho AS mov_despacho, m.created_at AS mov_em,
              t.para_setor_id::text AS tr_setor_id, t.para_setor_nome AS tr_setor_nome, t.para_usuario_nome AS tr_usuario_nome, t.status::text AS tr_status, t.data_recebimento AS tr_recebido_em, t.despacho AS tr_despacho, COALESCE(t.data_ocorrencia, t.data_envio) AS tr_em, t.prazo_dias_uteis AS tr_prazo_dias
         FROM processos p
         LEFT JOIN licitacoes l ON p.referencia_tipo = 'LICITACAO' AND l.id::text = p.referencia_id::text
         LEFT JOIN contratos c ON c.id = p.contrato_id
         LEFT JOIN LATERAL (SELECT * FROM processo_movimentacoes x WHERE x.processo_id = p.id ORDER BY x.sequencia DESC LIMIT 1) m ON p.tipo::text IN ('ADITIVO','RENOVACAO','AVULSO')
         LEFT JOIN LATERAL (SELECT * FROM tramitacoes_processo y WHERE y.licitacao_id::text = p.referencia_id::text ORDER BY y.sequencia DESC LIMIT 1) t ON p.referencia_tipo = 'LICITACAO'
        WHERE p.orgao_id::text = $1 AND (p.situacao = 'ABERTO' OR p.encerrado_em >= now() - interval '90 days')
        ORDER BY p.aberto_em DESC`,
      [orgaoId],
    );
    const ids = procs.filter((p) => p.tipo === 'ADITIVO' || p.tipo === 'RENOVACAO').map((p) => p.id);
    const pecas: Array<{ processo_id: string; etapa: string }> = ids.length
      ? await this.ds.query(`SELECT processo_id::text AS processo_id, etapa FROM processo_pecas WHERE processo_id::text = ANY($1::text[]) AND etapa IS NOT NULL`, [ids])
      : [];
    const etapasPorProcesso = new Map<string, Set<string>>();
    for (const pc of pecas) {
      if (!etapasPorProcesso.has(pc.processo_id)) etapasPorProcesso.set(pc.processo_id, new Set());
      etapasPorProcesso.get(pc.processo_id)!.add(pc.etapa);
    }
    return procs.map((p) => {
      const encerrado = p.situacao === 'ENCERRADO';
      const licitacao = p.referencia_tipo === 'LICITACAO' && !!p.referencia_id;
      const etapas = licitacao
        ? etapasDaLicitacao(p.lic_fase, encerrado || ['CONCLUIDA', 'HOMOLOGADA'].includes(String(p.lic_situacao)))
        : etapasDoProcessoProprio(p.tipo as TipoProcesso, etapasPorProcesso.get(p.id) ?? new Set(), !!p.referencia_id && p.referencia_tipo === 'TERMO_ADITIVO', encerrado);
      const posse = licitacao
        ? p.tr_em
          ? { setor_id: p.tr_setor_id, setor_nome: p.tr_setor_nome, usuario_nome: p.tr_usuario_nome, recebida: p.tr_status === 'RECEBIDA' || !!p.tr_recebido_em, desde: iso(p.tr_recebido_em ?? p.tr_em), dias: diasEntre(p.tr_em, agora), despacho: p.tr_despacho, limite_dias: p.tr_prazo_dias }
          : null
        : p.mov_em
          ? { setor_id: p.mov_setor_id, setor_nome: p.mov_setor_nome, usuario_nome: p.mov_usuario_nome, recebida: !!p.mov_recebida_em, desde: iso(p.mov_recebida_em ?? p.mov_em), dias: diasEntre(p.mov_em, agora), despacho: p.mov_despacho, limite_dias: null }
          : null;
      const prazo = prazoDaLinha(p, agora);
      return {
        id: p.id,
        tipo: p.tipo,
        rotulo_tipo: rotuloTipoProcesso(p.tipo),
        numero: p.numero,
        objeto: p.objeto,
        situacao: encerrado ? 'ENCERRADO' : 'ABERTO',
        estado: estadoPeloTempo(posse?.dias ?? diasEntre(p.aberto_em, agora), posse?.limite_dias, encerrado),
        etapas,
        etapa_atual: etapas.find((e) => e.estado === 'ATUAL')?.rotulo ?? null,
        esta_com: posse,
        valor: numeroOuNulo(p.lic_valor ?? p.contrato_valor),
        prazo,
        link: `/orgao/processo/${p.id}`,
        aberto_em: iso(p.aberto_em),
      };
    });
  }

  private async linhasDosPedidos(orgaoId: string, agora: Date): Promise<LinhaDoPainel[]> {
    const ds: Array<{ id: string; status: string; unidade_requisitante: string; objeto: string | null; created_at: Date; updated_at: Date | null; valor: string | null; tem_dfd: boolean; tem_processo: boolean }> = await this.ds.query(
      `SELECT d.id::text AS id, d.status::text AS status, d.unidade_requisitante, d.descricao_sucinta_objeto AS objeto, d.created_at, d.updated_at,
              (SELECT SUM(i.valor_total_estimado)::text FROM itens_demanda i WHERE i.demanda_id = d.id) AS valor,
              EXISTS (SELECT 1 FROM dfds_consolidados_demandas fd WHERE fd.demanda_id = d.id) AS tem_dfd,
              EXISTS (SELECT 1 FROM licitacoes l WHERE l.demanda_id = d.id) AS tem_processo
         FROM demandas d
        WHERE d.orgao_id::text = $1 AND d.status::text IN ('ENVIADA','EM_ANALISE','APROVADA','CONSOLIDADA')
          AND NOT EXISTS (SELECT 1 FROM licitacoes l WHERE l.demanda_id = d.id)
        ORDER BY d.created_at DESC`,
      [orgaoId],
    );
    return ds.map((d) => {
      const etapas = etapasDoPedido(d.status, d.tem_dfd, d.tem_processo);
      const atual = etapas.find((e) => e.estado === 'ATUAL');
      const dias = diasEntre(d.updated_at ?? d.created_at, agora);
      const com = atual?.chave === 'ENVIADA' ? 'Aprovação de demandas' : atual?.chave === 'DFD' || atual?.chave === 'APROVADA' ? 'Planejamento (DFD)' : d.unidade_requisitante;
      return {
        id: d.id,
        tipo: 'DEMANDA',
        rotulo_tipo: 'Pedido',
        numero: d.unidade_requisitante,
        objeto: d.objeto || '(sem descrição)',
        situacao: 'ABERTO',
        estado: estadoPeloTempo(dias, null, false),
        etapas,
        etapa_atual: atual?.rotulo ?? null,
        esta_com: { setor_id: null, setor_nome: com, usuario_nome: null, recebida: true, desde: iso(d.updated_at ?? d.created_at), dias, despacho: null, limite_dias: null },
        valor: numeroOuNulo(d.valor),
        prazo: null,
        link: `/orgao/demandas/${d.id}`,
        aberto_em: iso(d.created_at),
      };
    });
  }

  private gargalos(abertos: LinhaDoPainel[]) {
    const porSetor = new Map<string, { setor_id: string | null; setor_nome: string; processos: number; dias: number[]; parados: number }>();
    for (const l of abertos) {
      if (!l.esta_com?.setor_nome) continue;
      const chave = l.esta_com.setor_id ?? l.esta_com.setor_nome;
      const g = porSetor.get(chave) ?? { setor_id: l.esta_com.setor_id, setor_nome: l.esta_com.setor_nome, processos: 0, dias: [], parados: 0 };
      g.processos += 1;
      g.dias.push(l.esta_com.dias);
      if (l.estado === 'PARADO') g.parados += 1;
      porSetor.set(chave, g);
    }
    return Array.from(porSetor.values())
      .map((g) => ({ setor_id: g.setor_id, setor_nome: g.setor_nome, processos: g.processos, parados: g.parados, media_dias: g.dias.length ? Math.round(g.dias.reduce((s, d) => s + d, 0) / g.dias.length) : 0 }))
      .sort((a, b) => b.parados - a.parados || b.media_dias - a.media_dias || b.processos - a.processos);
  }
}

function prazoDaLinha(p: { tipo: string; lic_fase: string | null; lic_sessao: Date | null; lic_impugnacao: Date | null; contrato_fim: Date | null; contrato_numero: string | null }, agora: Date) {
  if ((p.tipo === 'ADITIVO' || p.tipo === 'RENOVACAO') && p.contrato_fim) {
    return { rotulo: `Vigência do contrato ${p.contrato_numero ?? ''}`.trim(), data: iso(p.contrato_fim), vencido: new Date(p.contrato_fim).getTime() < agora.getTime() };
  }
  if (p.tipo === 'CONTRATACAO' && p.lic_sessao && ['PUBLICADO', 'IMPUGNACAO', 'ACOLHIMENTO_PROPOSTAS', 'AGUARDANDO_DIVULGACAO'].includes(String(p.lic_fase))) {
    return { rotulo: 'Abertura da sessão', data: iso(p.lic_sessao), vencido: false };
  }
  return null;
}

function pesoEstado(e: EstadoAndamento): number {
  return e === 'PARADO' ? 3 : e === 'LENTO' ? 2 : e === 'OK' ? 1 : 0;
}

function contar(valores: string[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const v of valores) r[v] = (r[v] ?? 0) + 1;
  return r;
}

function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const x = new Date(d);
  return Number.isFinite(x.getTime()) ? x.toISOString() : null;
}

function numeroOuNulo(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
