import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import type { Ator } from '../../auth/acesso/ator';
import { ehUuid } from '../../auth/acesso/acesso-licitacao.service';
import { fundamentoEfetivo, textoDoFundamento } from '../../licitacoes/fundamento-legal';
import { ehFaseInterna } from '../../licitacoes/transicoes/fases';
import { IaService } from '../../ia/ia.service';
import { AuditLogService } from '../audit-log.service';
import { DocumentoFaseInterna, OrigemDocumento, StatusDocumento, TipoDocumentoFaseInterna } from '../entities/documento-fase-interna.entity';
import { AcaoLogFaseInterna } from '../entities/log-fase-interna.entity';
import { FaseInternaService } from '../fase-interna.service';
import { ModeloDocumentoService } from '../modelo-documento.service';
import { MODELOS_PADRAO } from '../modelos-padrao';
import { rotuloModalidade } from '../textos-documento';
import { MovimentacaoTramitacao, TramitacaoService } from '../tramitacao.service';
import { PapelFaseInterna } from '../tarefas/etapas-fase-interna';
import { ResultadoSincronizacao, TarefasService } from '../tarefas/tarefas.service';
import { situacaoDaAutorizacao } from '../telas/autorizacao-regras';
import { secoesDaPeca } from '../telas/minutas-regras';
import { MinutasTelaService } from '../telas/minutas-tela.service';
import { ParecerTelaService } from '../telas/parecer-tela.service';
import {
  CampoRascunho,
  DadosContexto,
  DEFINICOES_RASCUNHO,
  DefinicaoRascunho,
  ORIENTACAO_REGISTRO,
  PecaRascunho,
  camposDoRascunho,
  ehPecaRascunho,
  etapaDaPeca,
  interpretarResposta,
  montarContexto,
  montarPrompt,
  rascunhosAoChegar,
  secoesParaAplicar,
  situacaoVisivel,
} from './rascunho-ia-regras';
import { RascunhoIaFaseInterna } from './rascunho-ia.entity';
import { AutorRevisao, RevisaoIaService } from './revisao-ia.service';

type Autor = AutorRevisao;

/** Peças por seção: o aceite preenche as seções vazias da peça. */
const TIPO_DA_PECA: Partial<Record<PecaRascunho, TipoDocumentoFaseInterna>> = {
  DFD: TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA,
  ETP: TipoDocumentoFaseInterna.ESTUDO_TECNICO_PRELIMINAR,
  TR: TipoDocumentoFaseInterna.TERMO_REFERENCIA,
  AA: TipoDocumentoFaseInterna.AUTORIZACAO_ABERTURA,
  PJ: TipoDocumentoFaseInterna.PARECER_JURIDICO,
  MCI: TipoDocumentoFaseInterna.MANIFESTACAO_CONTROLE_INTERNO,
};
/** Peças cujo texto vai ao contexto das seguintes (as demais, só "pronta/juntada": sem dados de fornecedor). */
const TIPOS_COM_TEXTO_NO_CONTEXTO = ['DFD', 'ETP', 'TR', 'DO'];
const SITUACOES_VIVAS = ['ATIVA', 'SUSPENSA'];
const VIGENTES: RascunhoIaFaseInterna['status'][] = ['GERANDO', 'GERADO', 'FALHOU', 'ACEITO'];

/**
 * IA EM TODA ETAPA (F4a — entrega T4 do plano PLANO-FLUXO-TRAMITACAO.md).
 * Princípio do dono: "sempre com IA para fazer e humano revisar".
 *
 *  - GERAR: monta o contexto do processo (objeto, itens, valor da pesquisa,
 *    fundamento, modalidade, peças anteriores prontas — só do processo, sem
 *    fornecedor e sem dados pessoais) e pede à IA um rascunho ESTRUTURADO nas
 *    seções que o modelo da peça usa. O rascunho fica em
 *    `rascunhos_ia_fase_interna` (origem IA, modelo, data, quem disparou) e
 *    NÃO é peça: nada fica "pronto" por causa dele.
 *  - AO CHEGAR: depois da sincronização (etapa disponível para o
 *    setor/pessoa) e com `ia_rascunho` ligado no modelo de fluxo, o rascunho
 *    é pedido em SEGUNDO PLANO — fora da fila do processo e de qualquer
 *    transação, com limite de concorrência, idempotente (uma vez por
 *    etapa/peça e ciclo de reabertura). Falhou: fica registrado e a tela
 *    oferece "Gerar com IA". IA sem chave ou desligada: não pede nada.
 *  - REVISÃO: "Aceitar como base" (só seções vazias; texto humano nunca é
 *    sobrescrito), "Descartar", "Gerar de novo". Na emissão da peça, quem
 *    revisou fica registrado (RevisaoIaService).
 *
 * Desligar: FASE_INTERNA_IA_RASCUNHO=false. Concorrência do segundo plano:
 * FASE_INTERNA_IA_RASCUNHO_CONCORRENCIA (padrão 2).
 */
@Injectable()
export class RascunhoIaService {
  private readonly logger = new Logger(RascunhoIaService.name);
  private rodando = 0;
  private readonly esperando: Array<() => void> = [];
  private readonly pendentes = new Set<Promise<void>>();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(RascunhoIaFaseInterna) private readonly repo: Repository<RascunhoIaFaseInterna>,
    @InjectRepository(DocumentoFaseInterna) private readonly docRepo: Repository<DocumentoFaseInterna>,
    private readonly ia: IaService,
    private readonly auditLog: AuditLogService,
    private readonly faseInterna: FaseInternaService,
    private readonly modelos: ModeloDocumentoService,
    private readonly minutas: MinutasTelaService,
    private readonly parecer: ParecerTelaService,
    private readonly tarefas: TarefasService,
    private readonly revisao: RevisaoIaService,
    tramitacao: TramitacaoService,
  ) {
    tarefas.registrarDepoisDeSincronizar((r) => this.aoSincronizar(r));
    tramitacao.registrarAoMovimentar((m) => this.aoMovimentar(m));
  }

  ativo(): boolean {
    return process.env.FASE_INTERNA_IA_RASCUNHO !== 'false';
  }

  private concorrencia(): number {
    return Math.max(1, Math.min(10, Number(process.env.FASE_INTERNA_IA_RASCUNHO_CONCORRENCIA) || 2));
  }

  /** IA disponível agora (ligada e com chave)? */
  async disponivel(): Promise<{ ok: boolean; motivo: string | null }> {
    if (!this.ativo()) return { ok: false, motivo: 'O rascunho pela IA está desligado neste ambiente.' };
    if (!(await this.ia.configurada())) return { ok: false, motivo: 'A IA não está configurada (Admin › Configurações de IA).' };
    return { ok: true, motivo: null };
  }

  // ==========================================================================
  // AO CHEGAR (depois da sincronização, na fila do processo — só enfileira)
  // ==========================================================================

  async aoSincronizar(r: ResultadoSincronizacao): Promise<void> {
    // Migração de boot (notificar = false): nada se move sozinho — nem a IA
    if (!this.ativo() || !r.notificar) return;
    if (!ehFaseInterna(r.lic.fase) || !SITUACOES_VIVAS.includes(r.lic.situacao ?? 'ATIVA')) return;
    const pedidos = rascunhosAoChegar(r.lic.id, r.passos);
    if (!pedidos.length) return;
    if (!(await this.ia.configurada())) return; // sem IA: a tela explica e oferece o botão
    for (const p of pedidos) {
      // Já há rascunho vivo desta peça/etapa (manual ou automático): não pede outro
      const [vivo] = await this.ds.query(
        `SELECT 1 FROM rascunhos_ia_fase_interna
          WHERE licitacao_id::text = $1 AND peca = $2 AND COALESCE(etapa, '') = $3
            AND (status IN ('GERANDO', 'GERADO') OR (status = 'ACEITO' AND revisado_em IS NULL)) LIMIT 1`,
        [r.lic.id, p.peca, p.etapa],
      );
      if (vivo) continue;
      const ins = await this.repo
        .createQueryBuilder()
        .insert()
        .into(RascunhoIaFaseInterna)
        .values({ licitacao_id: r.lic.id, orgao_id: r.lic.orgao_id, peca: p.peca, etapa: p.etapa, chave: p.chave, status: 'GERANDO', disparo: 'AUTOMATICO', origem_rascunho: 'IA' })
        .orIgnore()
        .returning(['id'])
        .execute();
      const id = ins.raw?.[0]?.id as string | undefined;
      if (id) this.enfileirar(id); // idempotente: a chave já existia → nada
    }
  }

  /** Segundo plano: começa depois do tick atual, com limite de concorrência. */
  private enfileirar(id: string) {
    const p: Promise<void> = new Promise<void>((res) => setImmediate(res))
      .then(() => this.comVaga(() => this.executar(id, null)))
      .catch((e: any) => this.logger.warn(`Rascunho da IA ${id} não gerado: ${e?.message ?? e}`))
      .finally(() => this.pendentes.delete(p));
    this.pendentes.add(p);
  }

  private async comVaga<T>(fn: () => Promise<T>): Promise<T> {
    while (this.rodando >= this.concorrencia()) await new Promise<void>((res) => this.esperando.push(res));
    this.rodando++;
    try {
      return await fn();
    } finally {
      this.rodando--;
      this.esperando.shift()?.();
    }
  }

  /** Espera os rascunhos em segundo plano (testes e leitura logo depois). */
  async aguardarPendentes(): Promise<void> {
    for (let i = 0; i < 20 && this.pendentes.size; i++) await Promise.allSettled([...this.pendentes]);
  }

  // ==========================================================================
  // GERAR (pede à IA)
  // ==========================================================================

  /**
   * Pede o rascunho à IA e grava o resultado (GERADO) ou a falha (FALHOU).
   * Só mexe na linha do rascunho — nunca na peça.
   */
  private async executar(id: string, autor: Autor | null): Promise<void> {
    const r = await this.repo.findOne({ where: { id } });
    if (!r || r.status !== 'GERANDO') return;
    const def = DEFINICOES_RASCUNHO[r.peca as PecaRascunho];
    try {
      const lic = await this.licitacao(r.licitacao_id);
      if (lic.orgao_id !== r.orgao_id) throw new Error('processo de outro órgão');
      const campos = await this.camposDe(def, lic.orgao_id);
      if (!campos.length) throw new Error('o modelo da peça não tem seções para a IA preencher');
      const dados = await this.dadosDoContexto(lic, r.peca as PecaRascunho, r.etapa, r.parametros ?? {});
      const orientacao =
        r.peca === 'REGISTRO'
          ? ORIENTACAO_REGISTRO[r.etapa ?? ''] ?? `Etapa: ${r.etapa ?? '—'}.`
          : r.peca === 'AA' && !dados.processo.contratacao_direta
            ? 'Licitação: a autoridade autoriza a abertura do procedimento licitatório (não é contratação direta).'
            : null;
      const pedido = montarPrompt(def, campos, montarContexto(dados), orientacao);
      const resposta = await this.ia.gerarRascunhoJson(pedido.sistema, pedido.usuario, { maxTokens: ['ETP', 'TR'].includes(r.peca) ? 7000 : 3000 });
      const lido = interpretarResposta(def, campos, resposta.texto);
      const upd = await this.repo.update(
        { id, status: 'GERANDO' },
        { status: 'GERADO', secoes: lido.secoes, extras: lido.extras as any, modelo_ia: resposta.modelo, gerado_em: new Date(), erro: null },
      );
      if (!upd.affected) return; // substituído por um "Gerar de novo" enquanto a IA respondia
      await this.auditLog
        .log({
          licitacao_id: r.licitacao_id,
          acao: AcaoLogFaseInterna.IA_RASCUNHO_GERADO,
          descricao: `Rascunho do(a) ${def.titulo} gerado pela IA (modelo ${resposta.modelo}) — ${
            r.disparo === 'AUTOMATICO' ? 'automático, ao chegar à etapa' : `pedido por ${autor?.nome ?? r.gerado_por_nome ?? 'usuário'}`
          }. Aguarda revisão humana.`,
          dados_depois: { rascunho_id: id, peca: r.peca, etapa: r.etapa, modelo_ia: resposta.modelo, disparo: r.disparo, secoes: Object.keys(lido.secoes) },
          contexto: autor ? { usuario_id: autor.id ?? undefined, usuario_nome: autor.nome ?? undefined } : { usuario_nome: 'Sistema' },
        })
        .catch(() => undefined);
    } catch (e: any) {
      const motivo = String(e?.message ?? e).slice(0, 500);
      await this.repo.update({ id, status: 'GERANDO' }, { status: 'FALHOU', erro: motivo }).catch(() => undefined);
      this.logger.warn(`Rascunho da IA (${r.peca}) do processo ${r.licitacao_id} falhou: ${motivo}`);
      await this.auditLog
        .log({
          licitacao_id: r.licitacao_id,
          acao: AcaoLogFaseInterna.IA_INVOCADA,
          descricao: `Rascunho do(a) ${def.titulo} pela IA não foi gerado (${motivo}) — use "Gerar com IA" na tela.`,
          dados_depois: { rascunho_id: id, peca: r.peca, etapa: r.etapa, disparo: r.disparo, erro: motivo },
          contexto: autor ? { usuario_id: autor.id ?? undefined, usuario_nome: autor.nome ?? undefined } : { usuario_nome: 'Sistema' },
        })
        .catch(() => undefined);
    }
  }

  /** "Gerar com IA" / "Gerar de novo": o vigente vira SUBSTITUIDO e a IA responde nesta requisição. */
  async gerarManual(licitacaoId: string, body: any, autor: Autor) {
    const peca = String(body?.peca ?? '').toUpperCase();
    if (!ehPecaRascunho(peca)) throw new BadRequestException('Peça inválida para o rascunho da IA.');
    const etapa = this.etapaDoPedido(peca, body?.etapa);
    const disp = await this.disponivel();
    if (!disp.ok) throw new ConflictException(disp.motivo);
    const lic = await this.licitacao(licitacaoId);
    if (peca !== 'TRAMITACAO' && !ehFaseInterna(lic.fase)) throw new ConflictException('A fase interna foi encerrada — o rascunho da IA não se aplica mais.');
    const parametros = peca === 'TRAMITACAO' ? this.parametrosDoEnvio(body) : null;
    await this.repo.update(
      { licitacao_id: licitacaoId, peca, etapa: etapa ?? IsNull(), status: In(['GERANDO', 'GERADO', 'FALHOU']) } as any,
      { status: 'SUBSTITUIDO' },
    );
    const novo = await this.repo.save(
      this.repo.create({
        licitacao_id: licitacaoId,
        orgao_id: lic.orgao_id,
        peca,
        etapa,
        chave: null,
        status: 'GERANDO',
        disparo: 'MANUAL',
        origem_rascunho: 'IA',
        parametros,
        gerado_por_id: autor.id,
        gerado_por_nome: autor.nome,
      }),
    );
    await this.executar(novo.id, autor);
    return this.obter(licitacaoId, peca, etapa);
  }

  private etapaDoPedido(peca: PecaRascunho, etapaInformada: unknown): string | null {
    if (peca === 'REGISTRO') {
      const e = String(etapaInformada ?? '').toUpperCase();
      if (!/^[A-Z0-9_]{1,40}$/.test(e)) throw new BadRequestException('Informe a etapa do despacho (código do modelo).');
      return e;
    }
    if (peca === 'TRAMITACAO') return null;
    return etapaDaPeca(peca);
  }

  private parametrosDoEnvio(body: any): Record<string, string> {
    const destino = String(body?.destino ?? '').trim().slice(0, 200);
    const finalidade = String(body?.finalidade ?? '').trim().slice(0, 300);
    const despacho = String(body?.despacho ?? '').trim().slice(0, 1000);
    if (!destino) throw new BadRequestException('Informe o destino do envio.');
    return { destino, finalidade, despacho };
  }

  // ==========================================================================
  // LEITURA (tela)
  // ==========================================================================

  async obter(licitacaoId: string, pecaParam: unknown, etapaParam?: unknown) {
    const peca = String(pecaParam ?? '').toUpperCase();
    if (!ehPecaRascunho(peca)) throw new BadRequestException('Peça inválida para o rascunho da IA.');
    const def = DEFINICOES_RASCUNHO[peca];
    const lic = await this.licitacao(licitacaoId);
    const etapa = peca === 'REGISTRO' ? this.etapaDoPedido(peca, etapaParam) : peca === 'TRAMITACAO' ? null : etapaDaPeca(peca);
    const disp = await this.disponivel();
    let r = await this.repo.findOne({
      where: { licitacao_id: licitacaoId, peca, ...(etapa ? { etapa } : {}), status: In(VIGENTES) },
      order: { created_at: 'DESC' },
    });
    // Peça com texto próprio (DFD, ETP, TR, despacho): o aceite só "vale" enquanto a peça atual veio
    // dele (regerar pelo modelo ou juntar feita fora apaga a marca — a tela volta a oferecer a IA)
    if (r?.status === 'ACEITO' && ['DFD', 'ETP', 'TR', 'AA'].includes(peca)) {
      const [d] = await this.ds.query(
        `SELECT dados_estruturados->'_ia_rascunho'->>'rascunho_id' AS rid FROM documentos_fase_interna
          WHERE licitacao_id::text = $1 AND tipo::text = $2 AND versao_atual = true LIMIT 1`,
        [licitacaoId, TIPO_DA_PECA[peca]],
      );
      if (d?.rid !== r.id) r = null;
    }
    const campos = await this.camposDe(def, lic.orgao_id).catch(() => [] as CampoRascunho[]);
    const atual = r && ['GERADO', 'ACEITO'].includes(r.status) ? await this.textoAtualNaPeca(licitacaoId, peca) : null;
    return {
      peca,
      etapa,
      titulo: def.titulo,
      aviso: def.aviso,
      ia_disponivel: disp.ok,
      motivo_indisponivel: disp.motivo,
      fase_interna: ehFaseInterna(lic.fase),
      rascunho: r ? this.paraTela(r, campos, atual) : null,
    };
  }

  private paraTela(r: RascunhoIaFaseInterna, campos: CampoRascunho[], atual: Record<string, unknown> | null) {
    const titulos = new Map(campos.map((c) => [c.id, c.titulo]));
    const ordem = campos.map((c) => c.id);
    const ids = Object.keys(r.secoes ?? {}).sort((a, b) => (ordem.indexOf(a) + 1 || 999) - (ordem.indexOf(b) + 1 || 999));
    return {
      id: r.id,
      status: situacaoVisivel(r.status, r.updated_at),
      origem_rascunho: r.origem_rascunho,
      disparo: r.disparo,
      modelo_ia: r.modelo_ia,
      gerado_em: r.gerado_em,
      gerado_por_nome: r.gerado_por_nome,
      erro: r.status === 'GERANDO' && situacaoVisivel(r.status, r.updated_at) === 'FALHOU' ? 'A IA não respondeu a tempo.' : r.erro,
      secoes: ids.map((id) => ({
        id,
        titulo: titulos.get(id) ?? id,
        texto: r.secoes![id],
        // Na peça (ou no rascunho do jurídico) já há texto nesta seção? O aceite não o substitui.
        ja_preenchida_na_peca: atual ? !!String(atual[id] ?? '').replace(/<[^>]+>/g, '').trim() : null,
      })),
      conclusao_sugerida: (r.extras?.conclusao_sugerida as string | undefined) ?? null,
      decidido_por_nome: r.decidido_por_nome,
      decidido_em: r.decidido_em,
      secoes_aplicadas: r.secoes_aplicadas,
      revisado_por_nome: r.revisado_por_nome,
      revisado_em: r.revisado_em,
    };
  }

  /** Texto que já está na peça (ou no rascunho do jurídico) — para dizer o que o aceite preenche. */
  private async textoAtualNaPeca(licitacaoId: string, peca: PecaRascunho): Promise<Record<string, unknown> | null> {
    if (peca === 'PJ') {
      const [a] = await this.ds.query(`SELECT fundamentacao, ressalvas FROM analises_juridicas WHERE licitacao_id::text = $1 AND fase = 'PREVIA'`, [licitacaoId]);
      return { fundamentacao: a?.fundamentacao ?? '', relatorio: a?.fundamentacao ?? '', ressalvas: a?.ressalvas ?? '' };
    }
    if (!['DFD', 'ETP', 'TR'].includes(peca)) return null;
    const doc = await this.docRepo.findOne({ where: { licitacao_id: licitacaoId, tipo: TIPO_DA_PECA[peca]!, versao_atual: true } });
    return secoesDaPeca(doc?.dados_estruturados);
  }

  // ==========================================================================
  // REVISÃO HUMANA: aceitar como base / descartar
  // ==========================================================================

  private async rascunhoDoProcesso(licitacaoId: string, rascunhoId: string): Promise<RascunhoIaFaseInterna> {
    const r = ehUuid(rascunhoId) ? await this.repo.findOne({ where: { id: rascunhoId, licitacao_id: licitacaoId } }) : null;
    if (!r) throw new NotFoundException('Rascunho não encontrado.');
    return r;
  }

  /**
   * "Aceitar como base". Só o rascunho GERADO. Peças por seção: preenche as
   * seções VAZIAS da peça (texto dela, origem IA_ACEITA). Despacho (AA): gera
   * o despacho com o texto revisado. Parecer: preenche o rascunho do jurídico
   * (fundamentação/ressalvas vazias; a conclusão é sempre do jurídico).
   * Controle interno, despacho da etapa e envio: devolve os campos para o
   * formulário da tela.
   */
  async aceitar(licitacaoId: string, rascunhoId: string, ator: Ator, autor: Autor) {
    const r = await this.rascunhoDoProcesso(licitacaoId, rascunhoId);
    if (r.status !== 'GERADO') throw new ConflictException(r.status === 'ACEITO' ? 'Este rascunho já foi aceito.' : 'Só o rascunho gerado pode ser aceito.');
    const peca = r.peca as PecaRascunho;
    const lic = await this.licitacao(licitacaoId);
    if (peca !== 'TRAMITACAO' && !ehFaseInterna(lic.fase)) throw new ConflictException('A fase interna foi encerrada — o rascunho da IA não se aplica mais.');
    const secoes = r.secoes ?? {};
    let aplicadas: string[] = [];
    let mantidas: string[] = [];
    let documentoId: string | null = null;
    let campos: Record<string, string | null> | null = null;

    if (peca === 'DFD' || peca === 'ETP' || peca === 'TR') {
      ({ aplicadas, mantidas, documentoId } = await this.aplicarNaPeca(licitacaoId, TIPO_DA_PECA[peca]!, r, lic.orgao_id, autor));
    } else if (peca === 'AA') {
      documentoId = await this.gerarDespachoComTexto(licitacaoId, r, autor);
      aplicadas = Object.keys(secoes);
    } else if (peca === 'PJ') {
      await this.parecer.exigirPapel(ator, lic.orgao_id, PapelFaseInterna.JURIDICO, 'aceita a minuta do parecer');
      ({ aplicadas, mantidas } = await this.aplicarNoParecer(licitacaoId, r, ator, autor));
    } else {
      if (peca === 'MCI') await this.parecer.exigirPapel(ator, lic.orgao_id, PapelFaseInterna.CONTROLE_INTERNO, 'aceita o rascunho da manifestação');
      campos = { ...secoes, conclusao_sugerida: (r.extras?.conclusao_sugerida as string) ?? null };
      aplicadas = Object.keys(secoes);
    }

    const agora = new Date();
    const upd = await this.repo.update(
      { id: r.id, status: 'GERADO' },
      { status: 'ACEITO', decidido_por_id: autor.id, decidido_por_nome: autor.nome, decidido_em: agora, secoes_aplicadas: aplicadas, documento_id: documentoId },
    );
    if (!upd.affected) throw new ConflictException('O rascunho mudou enquanto era aceito — recarregue a tela.');
    const def = DEFINICOES_RASCUNHO[peca];
    const nomes = new Map((await this.camposDe(def, lic.orgao_id).catch(() => [] as CampoRascunho[])).map((c) => [c.id, c.titulo] as const));
    const nomesParecer: Record<string, string> = { fundamentacao: 'Fundamentação', ressalvas: 'Ressalvas' };
    const titulo = (id: string) => (peca === 'PJ' ? nomesParecer[id] : nomes.get(id)) ?? id;
    await this.auditLog
      .log({
        licitacao_id: licitacaoId,
        documento_id: documentoId ?? undefined,
        acao: AcaoLogFaseInterna.IA_RASCUNHO_ACEITO,
        descricao:
          `Rascunho da IA do(a) ${def.titulo} aceito como base por ${autor.nome ?? 'usuário'}` +
          (['DFD', 'ETP', 'TR', 'PJ'].includes(peca)
            ? aplicadas.length
              ? ` — seções preenchidas: ${aplicadas.map(titulo).join(', ')}${mantidas.length ? `; mantido o texto já escrito em: ${mantidas.map(titulo).join(', ')}` : ''}`
              : ' — nenhuma seção estava vazia: nada foi alterado'
            : peca === 'AA'
              ? ' — despacho gerado com o texto revisado (vale depois de assinado)'
              : ''),
        dados_depois: { rascunho_id: r.id, peca, etapa: r.etapa, modelo_ia: r.modelo_ia, aplicadas, mantidas },
        contexto: { usuario_id: autor.id ?? undefined, usuario_nome: autor.nome ?? undefined },
      })
      .catch(() => undefined);
    // O despacho da autoridade foi GERADO agora com o texto revisado: quem aceitou é quem revisou
    if (peca === 'AA' && documentoId) await this.revisao.registrarNaEmissao(licitacaoId, 'AA', { documentoId, autor, ato: 'gerado' });
    return { ...(await this.obter(licitacaoId, peca, r.etapa)), aceite: { aplicadas, mantidas, documento_id: documentoId, campos } };
  }

  async descartar(licitacaoId: string, rascunhoId: string, autor: Autor) {
    const r = await this.rascunhoDoProcesso(licitacaoId, rascunhoId);
    if (!['GERADO', 'FALHOU', 'GERANDO'].includes(r.status)) throw new ConflictException('Este rascunho não pode mais ser descartado.');
    await this.repo.update(r.id, { status: 'DESCARTADO', decidido_por_id: autor.id, decidido_por_nome: autor.nome, decidido_em: new Date() });
    await this.auditLog
      .log({
        licitacao_id: licitacaoId,
        acao: AcaoLogFaseInterna.IA_RASCUNHO_DESCARTADO,
        descricao: `Rascunho da IA do(a) ${DEFINICOES_RASCUNHO[r.peca as PecaRascunho]?.titulo ?? r.peca} descartado por ${autor.nome ?? 'usuário'}`,
        dados_depois: { rascunho_id: r.id, peca: r.peca, etapa: r.etapa },
        contexto: { usuario_id: autor.id ?? undefined, usuario_nome: autor.nome ?? undefined },
      })
      .catch(() => undefined);
    return this.obter(licitacaoId, r.peca, r.etapa);
  }

  /** Seções vazias da peça ← rascunho (texto registrado como do usuário: IA_ACEITA). */
  private async aplicarNaPeca(licitacaoId: string, tipo: TipoDocumentoFaseInterna, r: RascunhoIaFaseInterna, orgaoId: string, autor: Autor) {
    const atual = await this.docRepo.findOne({ where: { licitacao_id: licitacaoId, tipo, versao_atual: true } });
    if (atual && atual.origem !== OrigemDocumento.INTERNO) {
      throw new ConflictException('A peça foi juntada (feita fora). O rascunho da IA não substitui a peça juntada.');
    }
    if (atual && [StatusDocumento.ASSINADO, StatusDocumento.AGUARDANDO_ASSINATURA].includes(atual.status)) {
      throw new ConflictException('A peça está assinada ou em assinatura — o rascunho da IA não entra nela. Para usar o texto, edite a peça (abre uma versão nova).');
    }
    if (atual?.dados_estruturados?.nao_se_aplica) throw new ConflictException('A peça está marcada como "não se aplica" — desfaça antes de usar o rascunho.');
    // Só as seções que o modelo da peça pede à IA (nada além delas entra)
    const permitidas = new Set((await this.camposDe(DEFINICOES_RASCUNHO[r.peca as PecaRascunho], orgaoId)).map((c) => c.id));
    const doRascunho = Object.fromEntries(Object.entries(r.secoes ?? {}).filter(([id]) => permitidas.has(id)));
    const { aplicar, mantidas } = secoesParaAplicar(secoesDaPeca(atual?.dados_estruturados), doRascunho);
    for (const [id, html] of Object.entries(aplicar)) {
      await this.faseInterna.atualizarSecao(licitacaoId, tipo, id, html, { autor, origem: 'IA_ACEITA' });
    }
    const doc = await this.docRepo.findOne({ where: { licitacao_id: licitacaoId, tipo, versao_atual: true } });
    const aplicadas = Object.keys(aplicar);
    if (doc && aplicadas.length) await this.revisao.gravarMetaNaPeca(doc.id, RevisaoIaService.meta(r, autor, aplicadas));
    return { aplicadas, mantidas, documentoId: doc?.id ?? null };
  }

  /** Despacho da autoridade com o texto revisado (o modelo dá local, data e autoridade). */
  private async gerarDespachoComTexto(licitacaoId: string, r: RascunhoIaFaseInterna, autor: Autor): Promise<string> {
    const atual = await this.minutas.docAtual(licitacaoId, TipoDocumentoFaseInterna.AUTORIZACAO_ABERTURA);
    if (atual?.status === StatusDocumento.AGUARDANDO_ASSINATURA) throw new ConflictException('O despacho está com a autoridade para assinatura — aguarde ou peça a devolução.');
    if (situacaoDaAutorizacao(atual) === 'AUTORIZADA') {
      throw new ConflictException('A autorização já foi dada — o despacho assinado não é regerado. Para mudar, use "Nova autorização" na tela da autorização.');
    }
    const corpo = String(r.secoes?.autorizacao ?? '').trim();
    if (!corpo) throw new ConflictException('O rascunho não tem o texto da autorização.');
    const contexto = await this.modelos.montarContextoVariaveis(licitacaoId);
    const fechamento = this.modelos.substituirVariaveis('<p>{{local_data}}.</p><p>{{autoridade.nome}}</p>', contexto);
    const meta = RevisaoIaService.meta(r, autor, ['autorizacao']);
    const doc = await this.minutas.gerarPorModelo(licitacaoId, TipoDocumentoFaseInterna.AUTORIZACAO_ABERTURA, autor, {
      motivo: 'texto do rascunho da IA revisado',
      substituirSecoes: { autorizacao: `${corpo}${fechamento}` },
      extras: { _ia_rascunho: meta, ...(atual?.dados_estruturados?._devolucoes ? { _devolucoes: atual.dados_estruturados._devolucoes } : {}) },
    });
    return doc.id;
  }

  /** Rascunho do jurídico (analise): só fundamentação e ressalvas vazias. A conclusão nunca é preenchida. */
  private async aplicarNoParecer(licitacaoId: string, r: RascunhoIaFaseInterna, ator: Ator, autor: Autor) {
    const [a] = await this.ds.query(`SELECT status, fundamentacao, ressalvas FROM analises_juridicas WHERE licitacao_id::text = $1 AND fase = 'PREVIA'`, [licitacaoId]);
    if (a?.status === 'EMITIDO') throw new ConflictException('O parecer já foi emitido — a minuta da IA não se aplica mais.');
    const s = r.secoes ?? {};
    const fundamentacao = [s.relatorio ? `Relatório. ${s.relatorio}` : null, s.fundamentacao ?? null].filter(Boolean).join('\n\n');
    const { aplicar, mantidas } = secoesParaAplicar(
      { fundamentacao: a?.fundamentacao ?? '', ressalvas: a?.ressalvas ?? '' },
      { ...(fundamentacao ? { fundamentacao } : {}), ...(s.ressalvas ? { ressalvas: s.ressalvas } : {}) },
    );
    if (Object.keys(aplicar).length) await this.parecer.salvar(licitacaoId, { fase: 'PREVIA', ...aplicar }, ator, autor);
    return { aplicadas: Object.keys(aplicar), mantidas };
  }

  // ==========================================================================
  // ENVIO (tramitação): o despacho sugerido pela IA e aceito foi enviado
  // ==========================================================================

  private async aoMovimentar(m: MovimentacaoTramitacao): Promise<void> {
    if (m.tipo !== 'ENVIO' || m.automatico) return;
    await this.revisao.registrarNaEmissao(m.licitacao_id, 'TRAMITACAO', { autor: { id: m.por.id, nome: m.por.nome }, ato: 'enviado' });
  }

  // ==========================================================================
  // CONTEXTO (só do processo — o órgão é o do JWT, garantido pelo guard)
  // ==========================================================================

  private async licitacao(licitacaoId: string) {
    const [lic] = await this.ds.query(
      `SELECT id::text AS id, orgao_id::text AS orgao_id, numero_processo, objeto, modalidade::text AS modalidade, fase::text AS fase,
              situacao::text AS situacao, fundamento_legal, valor_total_estimado, sigilo_orcamento
         FROM licitacoes WHERE id::text = $1`,
      [licitacaoId],
    );
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    return lic;
  }

  private async camposDe(def: DefinicaoRascunho, orgaoId: string): Promise<CampoRascunho[]> {
    if (!def.usa_modelo_de_documento) return camposDoRascunho(def, []);
    const tipo = TIPO_DA_PECA[def.peca]!;
    const modelo = await this.modelos.resolverModelo(orgaoId, tipo).catch(() => null);
    const secoes = modelo?.secoes?.length ? modelo.secoes : MODELOS_PADRAO.find((m) => m.tipo === tipo)?.secoes ?? [];
    return camposDoRascunho(def, secoes);
  }

  private async dadosDoContexto(lic: any, peca: PecaRascunho, etapa: string | null, parametros: Record<string, unknown>): Promise<DadosContexto> {
    const instrucao = await this.faseInterna.getInstrucao(lic.id);
    const itens: any[] = await this.ds.query(
      `SELECT numero_item, descricao_resumida, quantidade, unidade_medida::text AS unidade, valor_unitario_estimado,
              COALESCE(valor_total_estimado, quantidade * COALESCE(valor_unitario_estimado, 0)) AS total
         FROM itens_licitacao WHERE licitacao_id::text = $1 AND status::text <> 'CANCELADO' ORDER BY numero_item`,
      [lic.id],
    );
    const total = itens.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const [orgao] = await this.ds.query(`SELECT nome FROM orgaos WHERE id::text = $1`, [lic.orgao_id]);
    const vars = await this.modelos.montarContextoVariaveis(lic.id).catch(() => ({}) as Record<string, string>);
    const tipoAtual = TIPO_DA_PECA[peca] ?? null;

    // Peças prontas: texto só de DFD/ETP/TR/reserva feitos no sistema; das demais, só "pronta/juntada"
    const prontas = instrucao.itens.filter((i) => i.status === 'OK' && i.tipo !== tipoAtual);
    const docs = prontas.length
      ? await this.docRepo.find({ where: { licitacao_id: lic.id, versao_atual: true, tipo: In(prontas.map((i) => i.tipo)) } })
      : [];
    const pecas_prontas: DadosContexto['pecas_prontas'] = [];
    for (const item of prontas) {
      const doc = docs.find((d) => d.tipo === item.tipo);
      if (!doc) continue;
      const anexada = doc.origem !== OrigemDocumento.INTERNO;
      if (anexada) {
        pecas_prontas.push({ tipo: item.tipo, titulo: item.titulo, anexada: true, numero: doc.numero_peca ?? null, data: doc.data_documento ? new Date(doc.data_documento).toISOString().slice(0, 10) : null });
      } else if (TIPOS_COM_TEXTO_NO_CONTEXTO.includes(item.tipo)) {
        pecas_prontas.push({ tipo: item.tipo, titulo: item.titulo, anexada: false, secoes: secoesDaPeca(doc.dados_estruturados) });
      }
    }
    // Rascunho da própria peça em elaboração (preserva o que já foi escrito)
    const extra: Record<string, string | null> = {};
    if (tipoAtual && ['DFD', 'ETP', 'TR'].includes(peca)) {
      const propria = await this.docRepo.findOne({ where: { licitacao_id: lic.id, tipo: tipoAtual, versao_atual: true } });
      const escrito = Object.entries(secoesDaPeca(propria?.dados_estruturados))
        .filter(([, v]) => String(v).replace(/<[^>]+>/g, '').trim())
        .map(([k, v]) => `[${k}] ${String(v).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800)}`);
      if (escrito.length) extra['Já escrito nesta peça (preserve os fatos)'] = escrito.join(' | ');
    }
    if (peca === 'MCI') {
      const [pj] = await this.ds.query(
        `SELECT dados_estruturados->'_parecer'->>'conclusao' AS conclusao FROM documentos_fase_interna WHERE licitacao_id::text = $1 AND tipo::text = 'PJ' AND versao_atual = true`,
        [lic.id],
      );
      extra['Conclusão do parecer jurídico'] = pj?.conclusao ?? 'parecer ainda não emitido';
    }
    if (peca === 'AA' || peca === 'REGISTRO') {
      const cfg = await this.tarefas.configuracao(lic.orgao_id).catch(() => null);
      extra['Autoridade competente (cargo)'] = cfg?.autoridade_rotulo ?? null;
    }
    if (peca === 'REGISTRO' && etapa) extra['Etapa'] = etapa;
    if (peca === 'TRAMITACAO') {
      extra['Destino do envio'] = String(parametros.destino ?? '') || null;
      extra['Finalidade do envio'] = String(parametros.finalidade ?? '') || null;
      extra['Despacho sugerido pelo sistema'] = String(parametros.despacho ?? '') || null;
    }
    return {
      processo: {
        numero_processo: lic.numero_processo,
        objeto: lic.objeto,
        modalidade: rotuloModalidade(lic.modalidade),
        contratacao_direta: instrucao.contratacao_direta,
        fundamento: textoDoFundamento(fundamentoEfetivo(lic)) || null,
        sigiloso: lic.sigilo_orcamento === 'SIGILOSO',
        valor_estimado: total > 0 ? Math.round(total * 100) / 100 : Number(lic.valor_total_estimado) || null,
        orgao: orgao?.nome ?? null,
      },
      itens: itens.map((i) => ({
        numero_item: Number(i.numero_item),
        descricao: String(i.descricao_resumida ?? ''),
        quantidade: Number(i.quantidade),
        unidade: i.unidade ?? null,
        valor_unitario: i.valor_unitario_estimado === null ? null : Number(i.valor_unitario_estimado),
      })),
      reserva: { dotacao: vars['reserva.dotacao'] ?? null, situacao: vars['reserva.situacao'] ?? null, leis: vars['reserva.leis'] ?? null },
      pecas_prontas,
      instrucao: ['PJ', 'MCI', 'AA'].includes(peca) ? instrucao.itens.map((i) => ({ titulo: i.titulo, status: i.status })) : undefined,
      extra,
    };
  }
}
