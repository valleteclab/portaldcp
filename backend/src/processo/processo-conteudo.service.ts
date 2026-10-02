import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(ProcessoConteudoService.name);

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
    const [com_quem_esta, atual, movimentacoes, linha_do_tempo, permissao] = await Promise.all([
      tram.comQuemEsta(licId),
      tram.tramitacaoAtual(licId),
      tram.listarPorProcesso(licId),
      tram.linhaDoTempo(licId),
      ator ? tram.permissaoDeEnvio(licId, ator).catch(() => ({ pode: false, motivo: null })) : Promise.resolve({ pode: false, motivo: null }),
    ]);
    // Mesma leitura da tela genérica: "pode agir" = quem está com o processo (ou admin); "pode receber" = envio pendente para ele
    const pode_agir = !!permissao?.pode;
    const pode_receber = pode_agir && com_quem_esta?.status === 'PENDENTE';
    return { processo_id: p.id, disponivel: true, licitacao_id: licId, com_quem_esta, atual, movimentacoes, linha_do_tempo, pode_agir, pode_receber, motivo_sem_acao: permissao?.motivo ?? null };
  }

  // --------------------------------------------------------------------------
  // CONTRATACAO: ações de tramitação pela rota do processo (motor da fase interna)
  // --------------------------------------------------------------------------

  private tramitacaoDaLicitacao(p: Processo): { licId: string; tram: any } {
    const licId = this.licitacaoIdOuNull(p);
    const tram = licId ? this.servico<any>('../fase-interna/tramitacao.service', 'TramitacaoService') : null;
    if (!licId || !tram) throw new BadRequestException('Este processo não tramita pela licitação.');
    return { licId, tram };
  }

  async enviarLicitacao(p: Processo, ator: Ator, body: any) {
    const { licId, tram } = this.tramitacaoDaLicitacao(p);
    return tram.tramitar(
      licId,
      { para_setor_id: body?.para_setor_id ?? null, para_usuario_id: body?.para_usuario_id ?? null, despacho: body?.despacho ?? null, prazo_dias_uteis: body?.prazo_dias_uteis ?? null },
      ator,
    );
  }

  async receberLicitacao(p: Processo, ator: Ator) {
    const { licId, tram } = this.tramitacaoDaLicitacao(p);
    const atual = await tram.tramitacaoAtual(licId);
    if (!atual) throw new BadRequestException('Não há envio pendente para receber.');
    return tram.receber(atual.id, ator, {});
  }

  async devolverLicitacao(p: Processo, ator: Ator, body: any) {
    const { licId, tram } = this.tramitacaoDaLicitacao(p);
    const atual = await tram.tramitacaoAtual(licId);
    if (!atual) throw new BadRequestException('Não há tramitação para devolver.');
    return tram.devolver(atual.id, String(body?.motivo ?? body?.despacho ?? '').trim(), ator, {});
  }

  /** Setores e pessoas do órgão + o destino sugerido pelo fluxo da fase interna (sugestão, nunca trava). */
  async destinosLicitacao(p: Processo, ator: Ator) {
    const { licId } = this.tramitacaoDaLicitacao(p);
    const [setores, usuarios] = await Promise.all([
      this.ds.query(`SELECT id::text AS id, nome, chefe_usuario_id::text AS chefe_usuario_id FROM setores WHERE orgao_id::text = $1 ORDER BY nome ASC`, [p.orgao_id]),
      this.ds.query(`SELECT id::text AS id, nome, cargo, setor_id::text AS setor_id FROM usuarios WHERE orgao_id::text = $1 AND ativo = true ORDER BY nome ASC LIMIT 500`, [p.orgao_id]),
    ]);
    let sugerido: { setor_id: string | null; setor_nome: string | null; usuario_id: string | null; motivo: string } | null = null;
    let despacho_sugerido: string | null = null;
    const integracao = this.servico<any>('../fase-interna/fluxo/integracao-fluxo.service', 'IntegracaoFluxoService');
    if (integracao) {
      try {
        const s = await integracao.sugestaoEnvio(licId, ator);
        const d = (s?.destinos ?? []).find((x: any) => x.principal) ?? (s?.destinos ?? [])[0] ?? null;
        if (d) {
          const setor = d.setor_id ? setores.find((x: any) => x.id === String(d.setor_id)) : null;
          const etapas = Array.isArray(d.etapas) && d.etapas.length ? ` Costuma fazer: ${d.etapas.join(', ')}.` : '';
          sugerido = { setor_id: d.setor_id ? String(d.setor_id) : null, setor_nome: setor?.nome ?? d.rotulo ?? null, usuario_id: d.usuario_id ? String(d.usuario_id) : null, motivo: `Próximo passo do fluxo.${etapas}` };
        }
        despacho_sugerido = s?.despacho_sugerido ?? null;
      } catch (e) {
        this.logger.warn(`Sugestão de envio da licitação ${licId} indisponível: ${e instanceof Error ? e.message : e}`);
      }
    }
    return { processo_id: p.id, setores, usuarios, sugerido, despacho_sugerido };
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
    const calculo = tarefas ? await tarefas.etapasDoProcesso(licId, ator) : null;
    // Mesma forma da tela genérica (chave/rotulo/estado + peças da etapa); o cálculo completo vai em `fase_interna`
    const lista: any[] = Array.isArray(calculo?.etapas) ? calculo.etapas : [];
    const atualCodigo: string | null = calculo?.etapa_atual?.etapa ?? lista.find((e) => ['EM_ANDAMENTO', 'A_REVISAR', 'DISPONIVEL'].includes(e.situacao))?.etapa ?? null;
    const etapas = lista.map((e, i) => ({
      chave: String(e.etapa),
      rotulo: String(e.titulo ?? e.etapa),
      ordem: Number(e.numero ?? i + 1),
      estado: ['CONCLUIDA', 'NAO_REALIZADA', 'CANCELADA'].includes(e.situacao) ? 'CONCLUIDA' : e.etapa === atualCodigo ? 'ATUAL' : 'FUTURA',
      situacao_fase_interna: e.situacao,
      tipo_peca: null,
      titulo_peca: null,
      setor_sugerido: null,
      pecas: (e.passos ?? []).flatMap((passo: any) =>
        (passo.pecas ?? []).map((pc: any) => ({
          tipo: pc.tipo,
          titulo: pc.titulo,
          obrigatorio: !!pc.obrigatorio,
          status: pc.status,
          pronta: !!pc.pronta,
          documento_id: pc.documento_id ?? null,
          passo: passo.passo,
          passo_titulo: passo.titulo,
          situacao_passo: passo.situacao,
          pode_iniciar: !!passo.pode_iniciar,
          tela: passo.tela ?? null,
        })),
      ),
    }));
    return {
      processo_id: p.id,
      disponivel: true,
      tem_fluxo: etapas.length > 0,
      fluxo_padrao: false,
      licitacao_id: licId,
      retrato: retrato ?? null,
      etapas,
      etapa_atual: etapas.find((e) => e.estado === 'ATUAL') ?? null,
      fase_interna: calculo,
    };
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
