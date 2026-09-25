import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FASES_LEGADAS_DE_SITUACAO } from './entities/licitacao.entity';
import { FASES_PUBLICAS } from './licitacao-visao.util';

/**
 * PORTAL DO FORNECEDOR (plano E8, itens 7 e 8).
 *
 *  - "Licitações": filtro NO SERVIDOR (antes a tela baixava tudo e escondia
 *    IMPUGNACAO/RECURSO/ADJUDICACAO/HOMOLOGACAO). Só licitações já divulgadas
 *    (mesma regra de `licitacaoEhPublica`) + as em que o fornecedor tem
 *    proposta; só campos públicos (orçamento sigiloso mascarado).
 *  - "Minhas participações": propostas do fornecedor do TOKEN por licitação,
 *    com fase, situação, sessão, próxima ação e — depois da homologação — o
 *    resultado dele (itens vencidos, valor) e os instrumentos (contrato/ARP).
 *
 * Identidade SEMPRE do token (E1a): o controller passa o fornecedorId do ator.
 */

export interface FiltrosOportunidades {
  busca?: string;
  modalidade?: string;
  fase?: string;
  situacao?: string;
  uf?: string;
  /** true: só as licitações com proposta do fornecedor */
  participando?: boolean;
  pagina: number;
  limite: number;
}

const LIMITE_MAXIMO = 100;
const LIMITE_PADRAO = 20;
const RE_CODIGO = /^[A-Z_]{2,40}$/;

/** Normaliza a query (valores fora do formato são ignorados, nunca vão ao SQL). */
export function normalizarFiltrosOportunidades(q: Record<string, unknown> = {}): FiltrosOportunidades {
  const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const codigo = (v: unknown) => {
    const s = txt(v)?.toUpperCase();
    return s && s !== 'ALL' && RE_CODIGO.test(s) ? s : undefined;
  };
  const inteiro = (v: unknown, padrao: number) => {
    const n = Number.parseInt(String(v ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? n : padrao;
  };
  const uf = txt(q.uf)?.toUpperCase();
  return {
    busca: txt(q.busca)?.slice(0, 120),
    modalidade: codigo(q.modalidade),
    fase: codigo(q.fase),
    situacao: codigo(q.situacao),
    uf: uf && /^[A-Z]{2}$/.test(uf) ? uf : undefined,
    participando: q.participando === 'true' || q.participando === true,
    pagina: inteiro(q.pagina, 1),
    limite: Math.min(inteiro(q.limite, LIMITE_PADRAO), LIMITE_MAXIMO),
  };
}

export interface ProximaAcao {
  codigo:
    | 'CONFIRMAR_PROPOSTA'
    | 'ENVIAR_PROPOSTA'
    | 'AGUARDAR_SESSAO'
    | 'ENTRAR_SALA'
    | 'ASSINAR_CONTRATO'
    | 'ACOMPANHAR_CONTRATO'
    | 'VER_RESULTADO'
    | 'NENHUMA';
  texto: string;
}

/** Fases em que a sala da sessão é o lugar do fornecedor (ANALISE_PROPOSTAS → HOMOLOGACAO). */
export const FASES_DA_SALA = ['ANALISE_PROPOSTAS', 'EM_DISPUTA', 'JULGAMENTO', 'HABILITACAO', 'RECURSO', 'ADJUDICACAO'];

/**
 * Próxima ação do licitante numa participação — regra do backend (a tela só
 * mostra). Ordem: situação extinta > confirmação exigida (edital retificado,
 * art. 55 §1º) > contrato a assinar > sala (dispensa com janela aberta ou
 * fases da sessão) > resultado > aguardar.
 */
export function proximaAcaoParticipacao(p: {
  fase: string;
  situacao?: string | null;
  statusProposta: string;
  requerConfirmacao?: boolean;
  homologada: boolean;
  contratoAguardandoAssinatura?: boolean;
  temInstrumento?: boolean;
  modalidade?: string;
  janelaDispensaAberta?: boolean;
}): ProximaAcao {
  const situacao = p.situacao || 'ATIVA';
  if (['REVOGADA', 'ANULADA', 'DESERTA', 'FRACASSADA'].includes(situacao)) {
    return { codigo: 'NENHUMA', texto: `Licitação ${situacao.toLowerCase()} — processo encerrado` };
  }
  if (p.statusProposta === 'CANCELADA') return { codigo: 'NENHUMA', texto: 'Proposta cancelada' };
  if (p.statusProposta === 'RASCUNHO') {
    return p.fase === 'ACOLHIMENTO_PROPOSTAS' || p.fase === 'PUBLICADO' || p.fase === 'IMPUGNACAO'
      ? { codigo: 'ENVIAR_PROPOSTA', texto: 'Proposta em rascunho — conclua e envie antes do prazo' }
      : { codigo: 'NENHUMA', texto: 'Proposta não enviada no prazo' };
  }
  if (p.requerConfirmacao) {
    return { codigo: 'CONFIRMAR_PROPOSTA', texto: 'Edital retificado — confirme ou atualize a proposta' };
  }
  if (p.contratoAguardandoAssinatura) return { codigo: 'ASSINAR_CONTRATO', texto: 'Contrato aguardando a sua assinatura' };
  if (situacao === 'SUSPENSA') return { codigo: 'AGUARDAR_SESSAO', texto: 'Licitação suspensa — aguarde a retomada' };
  if (p.homologada || p.fase === 'HOMOLOGACAO') {
    return p.temInstrumento
      ? { codigo: 'ACOMPANHAR_CONTRATO', texto: 'Resultado homologado — acompanhe o contrato/ata' }
      : { codigo: 'VER_RESULTADO', texto: 'Resultado homologado' };
  }
  if (p.statusProposta === 'DESCLASSIFICADA') return { codigo: 'VER_RESULTADO', texto: 'Proposta desclassificada — acompanhe o resultado' };
  if (p.modalidade === 'DISPENSA_ELETRONICA' && p.janelaDispensaAberta) {
    return { codigo: 'ENTRAR_SALA', texto: 'Janela de lances aberta — entre na sala' };
  }
  if (FASES_DA_SALA.includes(p.fase)) return { codigo: 'ENTRAR_SALA', texto: 'Acompanhe a sessão na sala' };
  return { codigo: 'AGUARDAR_SESSAO', texto: 'Proposta enviada — aguarde a abertura da sessão' };
}

@Injectable()
export class PortalFornecedorService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Lista de licitações do fornecedor (divulgadas + as em que participa), paginada e filtrada no servidor. */
  async oportunidades(fornecedorId: string, f: FiltrosOportunidades) {
    const params: unknown[] = [fornecedorId, FASES_PUBLICAS, FASES_LEGADAS_DE_SITUACAO];
    const cond: string[] = [
      `(l.fase::text = ANY($2::text[])
        OR (l.fase::text = ANY($3::text[]) AND l.data_publicacao_edital IS NOT NULL)
        OR mp.id IS NOT NULL)`,
    ];
    const add = (sql: string, valor: unknown) => {
      params.push(valor);
      cond.push(sql.replace('?', `$${params.length}`));
    };
    if (f.modalidade) add('l.modalidade::text = ?', f.modalidade);
    if (f.fase) add('l.fase::text = ?', f.fase);
    if (f.situacao) add(`COALESCE(l.situacao::text, 'ATIVA') = ?`, f.situacao);
    if (f.uf) add('o.uf = ?', f.uf);
    if (f.participando) cond.push('mp.id IS NOT NULL');
    if (f.busca) {
      params.push(`%${f.busca.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      const n = `$${params.length}`;
      cond.push(`(l.objeto ILIKE ${n} OR l.numero_processo ILIKE ${n} OR l.numero_edital ILIKE ${n} OR o.nome ILIKE ${n})`);
    }
    const from = `
      FROM licitacoes l
      LEFT JOIN orgaos o ON o.id = l.orgao_id
      LEFT JOIN LATERAL (
        SELECT p.id, p.status::text AS status, p.requer_confirmacao
          FROM propostas p
         WHERE p.licitacao_id = l.id AND p.fornecedor_id::text = $1::text
         ORDER BY p.created_at DESC LIMIT 1
      ) mp ON true
      WHERE ${cond.join(' AND ')}`;
    const [{ total }] = await this.dataSource.query(`SELECT COUNT(*)::int AS total ${from}`, params);
    const offset = (f.pagina - 1) * f.limite;
    const linhas: any[] = await this.dataSource.query(
      `SELECT l.id::text AS id, l.numero_processo, l.numero_edital, l.objeto, l.modalidade::text AS modalidade,
              l.criterio_julgamento::text AS criterio_julgamento, l.fase::text AS fase, l.situacao::text AS situacao,
              l.valor_total_estimado, l.sigilo_orcamento::text AS sigilo_orcamento, l.data_publicacao_edital,
              l.data_abertura_sessao, l.data_fim_acolhimento, l.srp,
              o.id::text AS orgao_id, o.nome AS orgao_nome, o.cidade AS orgao_cidade, o.uf AS orgao_uf,
              mp.id::text AS proposta_id, mp.status AS proposta_status, mp.requer_confirmacao
       ${from}
       ORDER BY l.data_publicacao_edital DESC NULLS LAST, l.created_at DESC
       LIMIT ${f.limite} OFFSET ${offset}`,
      params,
    );
    return {
      total: Number(total),
      pagina: f.pagina,
      limite: f.limite,
      itens: linhas.map((l) => ({
        id: l.id,
        numero_processo: l.numero_processo,
        numero_edital: l.numero_edital,
        objeto: l.objeto,
        modalidade: l.modalidade,
        criterio_julgamento: l.criterio_julgamento,
        fase: l.fase,
        situacao: l.situacao || 'ATIVA',
        sigilo_orcamento: l.sigilo_orcamento,
        // Orçamento sigiloso (art. 24) não sai para o fornecedor
        valor_total_estimado: l.sigilo_orcamento === 'SIGILOSO' ? null : Number(l.valor_total_estimado ?? 0),
        data_publicacao_edital: l.data_publicacao_edital,
        data_abertura_sessao: l.data_abertura_sessao,
        data_fim_acolhimento: l.data_fim_acolhimento,
        srp: !!l.srp,
        orgao: l.orgao_id ? { id: l.orgao_id, nome: l.orgao_nome, cidade: l.orgao_cidade, uf: l.orgao_uf } : null,
        minha_proposta: l.proposta_id
          ? { id: l.proposta_id, status: l.proposta_status, requer_confirmacao: !!l.requer_confirmacao }
          : null,
      })),
    };
  }

  /** Participações do fornecedor: uma linha por proposta, com sessão, próxima ação, resultado e instrumentos. */
  async participacoes(fornecedorId: string) {
    const linhas: any[] = await this.dataSource.query(
      `SELECT p.id::text AS proposta_id, p.status::text AS proposta_status, p.valor_total_proposta, p.data_envio,
              p.motivo_desclassificacao, p.requer_confirmacao, p.created_at,
              l.id::text AS licitacao_id, l.numero_processo, l.numero_edital, l.objeto, l.modalidade::text AS modalidade,
              l.fase::text AS fase, l.situacao::text AS situacao, l.data_abertura_sessao, l.data_homologacao,
              l.dispensa_lances_inicio, l.dispensa_lances_fim, l.srp,
              o.nome AS orgao_nome,
              s.id::text AS sessao_id, s.status::text AS sessao_status, s.etapa::text AS sessao_etapa
         FROM propostas p
         JOIN licitacoes l ON l.id = p.licitacao_id
         LEFT JOIN orgaos o ON o.id = l.orgao_id
         LEFT JOIN LATERAL (
           SELECT id, status, etapa FROM sessoes_disputa WHERE licitacao_id = l.id ORDER BY created_at DESC LIMIT 1
         ) s ON true
        WHERE p.fornecedor_id::text = $1::text
        ORDER BY COALESCE(p.data_envio, p.created_at) DESC`,
      [fornecedorId],
    );
    if (linhas.length === 0) return [];
    const ids = [...new Set(linhas.map((l) => l.licitacao_id))];

    // Resultado do próprio fornecedor: itens que venceu (gravados pela adjudicação)
    const vencidos: any[] = await this.dataSource.query(
      `SELECT licitacao_id::text AS licitacao_id, numero_item, descricao_resumida, valor_total_homologado
         FROM itens_licitacao
        WHERE licitacao_id::text = ANY($1::text[]) AND fornecedor_vencedor_id::text = $2::text
          AND status::text IN ('ADJUDICADO', 'HOMOLOGADO')
        ORDER BY numero_item`,
      [ids, fornecedorId],
    );
    const contratos: any[] = await this.dataSource.query(
      `SELECT id::text AS id, licitacao_id::text AS licitacao_id, numero_contrato, status::text AS status, valor_global, valor_inicial
         FROM contratos
        WHERE licitacao_id::text = ANY($1::text[]) AND fornecedor_id::text = $2::text AND status::text <> 'RASCUNHO'`,
      [ids, fornecedorId],
    );
    const atas: any[] = await this.dataSource.query(
      `SELECT id::text AS id, licitacao_id::text AS licitacao_id, numero_ata, status::text AS status, valor_total
         FROM atas_registro_preco
        WHERE licitacao_id::text = ANY($1::text[]) AND fornecedor_id::text = $2::text`,
      [ids, fornecedorId],
    );
    const porLic = <T extends { licitacao_id: string }>(rows: T[]) => {
      const m = new Map<string, T[]>();
      for (const r of rows) m.set(r.licitacao_id, [...(m.get(r.licitacao_id) ?? []), r]);
      return m;
    };
    const vencidosPorLic = porLic(vencidos);
    const contratosPorLic = porLic(contratos);
    const atasPorLic = porLic(atas);
    const agora = Date.now();

    return linhas.map((l) => {
      const homologada = !!l.data_homologacao;
      // Resultado do fornecedor: só depois da homologação (antes, a sala mostra o andamento)
      const meusItens = homologada ? vencidosPorLic.get(l.licitacao_id) ?? [] : [];
      const meusContratos = (contratosPorLic.get(l.licitacao_id) ?? []).map((c) => ({
        id: c.id,
        numero: c.numero_contrato,
        status: c.status,
        valor: Number(c.valor_global ?? c.valor_inicial ?? 0),
      }));
      const minhasAtas = (atasPorLic.get(l.licitacao_id) ?? []).map((a) => ({
        id: a.id,
        numero: a.numero_ata,
        status: a.status,
        valor: Number(a.valor_total ?? 0),
      }));
      const janelaDispensaAberta =
        !!l.dispensa_lances_inicio && !!l.dispensa_lances_fim &&
        new Date(l.dispensa_lances_inicio).getTime() <= agora && new Date(l.dispensa_lances_fim).getTime() > agora;
      return {
        proposta: {
          id: l.proposta_id,
          status: l.proposta_status,
          valorTotal: l.valor_total_proposta != null ? Number(l.valor_total_proposta) : null,
          dataEnvio: l.data_envio,
          motivoDesclassificacao: l.motivo_desclassificacao,
          requerConfirmacao: !!l.requer_confirmacao,
        },
        licitacao: {
          id: l.licitacao_id,
          numeroProcesso: l.numero_processo,
          numeroEdital: l.numero_edital,
          objeto: l.objeto,
          modalidade: l.modalidade,
          fase: l.fase,
          situacao: l.situacao || 'ATIVA',
          orgao: l.orgao_nome,
          dataAberturaSessao: l.data_abertura_sessao,
          dataHomologacao: l.data_homologacao,
          srp: !!l.srp,
        },
        sessao: l.sessao_id ? { id: l.sessao_id, status: l.sessao_status, etapa: l.sessao_etapa } : null,
        resultado: homologada
          ? {
              venceu: meusItens.length > 0,
              itens: meusItens.map((i) => ({
                numero: Number(i.numero_item),
                descricao: i.descricao_resumida,
                valorTotal: i.valor_total_homologado != null ? Number(i.valor_total_homologado) : null,
              })),
              valorTotal: meusItens.reduce((s, i) => s + Number(i.valor_total_homologado ?? 0), 0),
            }
          : null,
        contratos: meusContratos,
        atas: minhasAtas,
        proximaAcao: proximaAcaoParticipacao({
          fase: l.fase,
          situacao: l.situacao,
          statusProposta: l.proposta_status,
          requerConfirmacao: !!l.requer_confirmacao,
          homologada,
          contratoAguardandoAssinatura: meusContratos.some((c) => c.status === 'AGUARDANDO_ASSINATURA'),
          temInstrumento: meusContratos.length > 0 || minhasAtas.length > 0,
          modalidade: l.modalidade,
          janelaDispensaAberta,
        }),
      };
    });
  }
}
