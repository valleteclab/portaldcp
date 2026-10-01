import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Ator } from '../auth/acesso/ator';
import { Processo, TipoProcesso } from './entities/processo.entity';
import { ProcessoService } from './processo.service';
import { ProcessoTramitacaoService } from './processo-tramitacao.service';
import { temTramitacaoPropria } from './processo-tramitacao-regras';

export interface PosseResumida {
  setor_nome: string | null;
  usuario_nome: string | null;
  recebida: boolean;
}

/**
 * ADAPTADORES do processo para as capacidades genéricas que hoje vivem na
 * fase interna da licitação (acoplamento por compatibilidade — ver
 * docs/processo/PLANO-PROCESSO-ELETRONICO.md):
 *  - AUTOS: livro de juntadas (`JuntadaAutosService.juntadas`) e regime;
 *  - TRAMITAÇÃO: com quem está, atual, movimentações, linha do tempo
 *    (`TramitacaoService`);
 *  - FLUXO: retrato do processo (`fluxos_processo_fase_interna`) e as etapas
 *    calculadas (`TarefasService.etapasDoProcesso`);
 *  - TAREFAS e DOCUMENTOS: leitura direta pelas tabelas (já têm `processo_id`).
 *
 * Tudo é LEITURA: o mesmo dado que as rotas `/fase-interna/:licitacaoId/...`
 * devolvem, só que endereçado pelo processo. Os serviços da fase interna são
 * resolvidos pelo ModuleRef (o FaseInternaModule importa este módulo; sem
 * ciclo). Processo sem licitação: ADITIVO/RENOVACAO/AVULSO delegam para a
 * tramitação própria (`ProcessoTramitacaoService`); os demais (PAGAMENTO,
 * esqueleto) devolvem estruturas vazias com `disponivel: false`.
 */
@Injectable()
export class ProcessoConteudoService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly moduleRef: ModuleRef,
    private readonly processos: ProcessoService,
    private readonly tramitacaoPropria: ProcessoTramitacaoService,
  ) {}

  private servico<T>(caminho: string, nome: string): T | null {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(caminho);
    try {
      return (this.moduleRef.get(mod[nome], { strict: false }) as T) ?? null;
    } catch {
      return null;
    }
  }

  private licitacaoIdOuNull(p: Processo): string | null {
    return p.tipo === TipoProcesso.CONTRATACAO && p.referencia_tipo === 'LICITACAO' && p.referencia_id ? p.referencia_id : null;
  }

  private indisponivel(p: Processo, capacidade: string) {
    return {
      processo_id: p.id,
      disponivel: false,
      motivo: `${capacidade} de processo ${p.tipo === TipoProcesso.AVULSO ? 'avulso' : 'deste tipo'} entra na próxima etapa do processo eletrônico.`,
    };
  }

  async autos(p: Processo) {
    if (temTramitacaoPropria(p.tipo)) return this.tramitacaoPropria.autos(p);
    const licId = this.licitacaoIdOuNull(p);
    if (!licId) return { ...this.indisponivel(p, 'Autos'), regime: 'CRONOLOGICO', juntadas: [] };
    const juntadas = this.servico<any>('../fase-interna/juntada-autos.service', 'JuntadaAutosService');
    const [reg] = await this.ds.query(`SELECT regime FROM autos_processo WHERE licitacao_id::text = $1`, [licId]);
    return {
      processo_id: p.id,
      disponivel: true,
      licitacao_id: licId,
      regime: reg?.regime ?? 'CRONOLOGICO',
      juntadas: juntadas ? await juntadas.juntadas(licId) : [],
    };
  }

  async tramitacao(p: Processo, ator?: Ator) {
    if (temTramitacaoPropria(p.tipo)) return this.tramitacaoPropria.tramitacao(p, ator);
    const licId = this.licitacaoIdOuNull(p);
    if (!licId) return { ...this.indisponivel(p, 'Tramitação'), com_quem_esta: null, atual: null, movimentacoes: [], linha_do_tempo: [] };
    const tram = this.servico<any>('../fase-interna/tramitacao.service', 'TramitacaoService');
    if (!tram) return { ...this.indisponivel(p, 'Tramitação'), com_quem_esta: null, atual: null, movimentacoes: [], linha_do_tempo: [] };
    const [com_quem_esta, atual, movimentacoes, linha_do_tempo] = await Promise.all([
      tram.comQuemEsta(licId),
      tram.tramitacaoAtual(licId),
      tram.listarPorProcesso(licId),
      tram.linhaDoTempo(licId),
    ]);
    return { processo_id: p.id, disponivel: true, licitacao_id: licId, com_quem_esta, atual, movimentacoes, linha_do_tempo };
  }

  /** "Está com" de vários processos do mesmo órgão em duas consultas (lista), sem uma chamada por linha. */
  async comPosse(lista: Processo[]): Promise<Array<Processo & { esta_com: PosseResumida | null }>> {
    if (!lista.length) return [];
    const orgaoId = lista[0].orgao_id;
    const posse = new Map<string, PosseResumida>();

    const proprios = lista.filter((p) => temTramitacaoPropria(p.tipo)).map((p) => p.id);
    if (proprios.length) {
      const linhas: Array<{ processo_id: string; para_setor_nome: string | null; para_usuario_nome: string | null; recebida_em: Date | null }> = await this.ds.query(
        `SELECT DISTINCT ON (processo_id) processo_id::text AS processo_id, para_setor_nome, para_usuario_nome, recebida_em
           FROM processo_movimentacoes WHERE orgao_id::text = $1 AND processo_id::text = ANY($2::text[])
          ORDER BY processo_id, sequencia DESC`,
        [orgaoId, proprios],
      );
      for (const l of linhas) posse.set(l.processo_id, { setor_nome: l.para_setor_nome, usuario_nome: l.para_usuario_nome, recebida: !!l.recebida_em });
    }

    const comLicitacao = lista.filter((p) => this.licitacaoIdOuNull(p));
    const tram = comLicitacao.length ? this.servico<any>('../fase-interna/tramitacao.service', 'TramitacaoService') : null;
    if (tram) {
      const porLic: Map<string, any> = await tram.comQuemEstaEmLote(orgaoId, comLicitacao.map((p) => p.referencia_id as string));
      for (const p of comLicitacao) {
        const c = porLic.get(p.referencia_id as string);
        if (c && c.status !== 'SEM_TRAMITACAO') posse.set(p.id, { setor_nome: c.setor?.nome ?? null, usuario_nome: c.usuario?.nome ?? null, recebida: !!c.recebido_em });
      }
    }

    return lista.map((p) => Object.assign(p, { esta_com: posse.get(p.id) ?? null }));
  }

  async fluxo(p: Processo, ator: Ator) {
    if (temTramitacaoPropria(p.tipo)) return this.tramitacaoPropria.fluxo(p);
    const licId = this.licitacaoIdOuNull(p);
    if (!licId) return { ...this.indisponivel(p, 'Fluxo'), tem_fluxo: false, retrato: null, etapas: null };
    const [retrato] = await this.ds.query(
      `SELECT id::text AS id, processo_id::text AS processo_id, tipo_processo, modelo_id::text AS modelo_id, modelo_versao, modelo_nome,
              snapshot, snapshot_em, legado, demanda_aprovada, aprovacao_demanda, reabertas, a_revisar, registros, decisoes, retornos
         FROM fluxos_processo_fase_interna WHERE licitacao_id::text = $1`,
      [licId],
    );
    const tarefas = this.servico<any>('../fase-interna/tarefas/tarefas.service', 'TarefasService');
    const etapas = tarefas ? await tarefas.etapasDoProcesso(licId, ator) : null;
    return { processo_id: p.id, disponivel: true, tem_fluxo: true, licitacao_id: licId, retrato: retrato ?? null, etapas };
  }

  async tarefas(p: Processo) {
    if (temTramitacaoPropria(p.tipo)) return this.tramitacaoPropria.tarefas(p);
    const licId = this.licitacaoIdOuNull(p);
    if (!licId) return { ...this.indisponivel(p, 'Tarefas'), tarefas: [] };
    const tarefas = await this.ds.query(
      `SELECT id::text AS id, processo_id::text AS processo_id, titulo, descricao, tipo, origem, etapa, passo, chave, tipo_peca, status,
              responsavel_usuario_id::text AS responsavel_usuario_id, responsavel_papel, responsavel_setor_id::text AS responsavel_setor_id,
              prazo_dias_uteis, prazo, concluida_em, created_at
         FROM tarefas WHERE licitacao_id::text = $1 ORDER BY created_at ASC`,
      [licId],
    );
    return { processo_id: p.id, disponivel: true, licitacao_id: licId, tarefas };
  }

  /** Peças (versão atual) — origem INTERNO (feita no sistema) ou ARQUIVO (anexada). */
  async documentos(p: Processo) {
    if (temTramitacaoPropria(p.tipo)) return this.tramitacaoPropria.documentos(p);
    const licId = this.licitacaoIdOuNull(p);
    if (!licId) return { ...this.indisponivel(p, 'Documentos'), documentos: [] };
    const documentos = await this.ds.query(
      `SELECT id::text AS id, processo_id::text AS processo_id, tipo::text AS tipo, titulo, status::text AS status, origem::text AS origem,
              versao, versao_atual, folha_inicial, folha_final, data_documento, numero_peca, totalmente_assinado, criado_por_nome, created_at
         FROM documentos_fase_interna WHERE licitacao_id::text = $1 AND versao_atual = true ORDER BY created_at ASC`,
      [licId],
    );
    return { processo_id: p.id, disponivel: true, licitacao_id: licId, documentos };
  }

  /** Visão do processo: autuação + resumo do conteúdo (licitação) quando houver. */
  async visao(p: Processo) {
    const licId = this.licitacaoIdOuNull(p);
    let conteudo: any = null;
    if (licId) {
      const [lic] = await this.ds.query(
        `SELECT id::text AS id, numero_processo, numero_edital, modalidade::text AS modalidade, fase::text AS fase, situacao::text AS situacao,
                valor_total_estimado, fundamento_legal
           FROM licitacoes WHERE id::text = $1`,
        [licId],
      );
      conteudo = lic ?? null;
    }
    if (p.tipo === TipoProcesso.ADITIVO || p.tipo === TipoProcesso.RENOVACAO) {
      const [contrato] = p.contrato_id
        ? await this.ds.query(`SELECT id::text AS id, numero_contrato, objeto, fornecedor_razao_social FROM contratos WHERE id::text = $1`, [p.contrato_id])
        : [];
      const [termo] =
        p.referencia_tipo === 'TERMO_ADITIVO' && p.referencia_id
          ? await this.ds.query(`SELECT id::text AS id, numero_termo, tipo::text AS tipo, status::text AS status, objeto, data_assinatura, renovacao_ciclo FROM termos_aditivos WHERE id::text = $1`, [p.referencia_id])
          : [];
      conteudo = { contrato: contrato ?? null, termo: termo ?? null };
    }
    return { ...p, conteudo };
  }

  /** Garante a existência do processo da licitação e devolve-o (uso interno das rotas por referência). */
  garantir(licitacaoId: string) {
    return this.processos.garantirDaLicitacao(licitacaoId);
  }
}
