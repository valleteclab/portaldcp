import { BadRequestException, ConflictException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import type { Ator } from '../../auth/acesso/ator';
import { ehUuid } from '../../auth/acesso/acesso-licitacao.service';
import { LicitacoesService } from '../../licitacoes/licitacoes.service';
import { CriterioJulgamento, ModoDisputa, SITUACOES_TERMINAIS } from '../../licitacoes/entities/licitacao.entity';
import { ItemLicitacao } from '../../itens/entities/item-licitacao.entity';
import { ehFaseInterna } from '../../licitacoes/transicoes/fases';
import { atorTransicaoDe } from '../../licitacoes/transicoes/transicoes.tipos';
import { motivoFundamentoInvalido } from '../../licitacoes/fundamento-legal';
import { motivoModoCriterioInvalido } from '../../disputa/modos-disputa';
import { motivoModalidadeCriterioInvalido } from '../../modalidades-especiais/perfil-modalidade';
import { OPCOES_MODO_DISPUTA } from '../../licitacoes/modo-disputa-dispensa';
import { AuditLogService } from '../audit-log.service';
import { MODALIDADES_CONTRATACAO_DIRETA, linhasDoChecklist } from '../documentos-obrigatorios';
import { AcaoLogFaseInterna } from '../entities/log-fase-interna.entity';
import { FaseInternaService } from '../fase-interna.service';
import { JuntadaPecasService } from '../juntada-pecas.service';
import { ArquivoRecebido, PecasFaseInternaService, tituloDaPeca } from '../pecas-fase-interna.service';
import { pecaContaComoPronta } from '../peca-regras';
import { TarefasService } from '../tarefas/tarefas.service';
import { MinutasTelaService } from '../telas/minutas-tela.service';
import { PublicacaoTelaService } from '../telas/publicacao-tela.service';
import { TipoDocumentoFaseInterna } from '../entities/documento-fase-interna.entity';
import {
  AcaoJuntada,
  ChecklistIncremental,
  ErroExterno,
  LinhaChecklistExterna,
  OPCOES_PECA_EXTERNA,
  checklistIncremental,
  criterioPadraoDaModalidade,
  lerClassificacao,
  mensagemDosErros,
  planejarJuntada,
  rotuloDaPecaExterna,
  validarDadosExternos,
  validarItensExternos,
  valorDosItensExternos,
} from './externa-regras';

/** Soma dos PDFs de um envio (FASE_INTERNA_EXTERNA_MAX_TOTAL_MB, padrão 200). */
const MAX_TOTAL_BYTES = Math.max(1, Number(process.env.FASE_INTERNA_EXTERNA_MAX_TOTAL_MB) || 200) * 1024 * 1024;

type Autor = { id: string | null; nome: string | null };

export interface PendenciaJuntada {
  tipo: string;
  titulo: string;
  /** Nome do arquivo que não entrou (null: "não se aplica" ou portaria do órgão). */
  arquivo: string | null;
  indice: number | null;
  erro: string;
  em: string;
}

export interface ResultadoJuntada {
  licitacao_id: string;
  numero_processo: string;
  modo: 'EXTERNA' | 'MISTA';
  juntadas: Array<{ tipo: string; titulo: string; arquivo: string | null; documento_id: string; versao: number; folha_inicial: number | null; folha_final: number | null }>;
  nao_se_aplica: string[];
  pendencias: PendenciaJuntada[];
  tarefas_concluidas: number;
  checklist: ChecklistIncremental;
  destino: string;
  conformidade: string;
}

/** Mensagem legível de um erro do Nest (400/409 com `message` string ou lista). */
function mensagemDoErro(e: unknown): string {
  if (e instanceof HttpException) {
    const r: any = e.getResponse();
    const m = typeof r === 'string' ? r : r?.message;
    return Array.isArray(m) ? m.join('; ') : String(m ?? e.message);
  }
  return e instanceof Error ? e.message : String(e);
}

/** 400 com a lista de erros por passo (a tela volta para o passo do primeiro). */
function erroDeValidacao(erros: ErroExterno[]): BadRequestException {
  return new BadRequestException({ message: mensagemDosErros(erros), erros, passo: erros[0]?.passo ?? 'DADOS' });
}

/**
 * ENTRADA "FASE INTERNA FEITA FORA DO SISTEMA" (plano §"Entrada: fase interna
 * feita fora"). Reaproveita tudo o que existe:
 *  - a criação do processo (`LicitacoesService.create` — enquadramento,
 *    critério, histórico do ato CRIAR, demanda de origem);
 *  - o anexo por peça da Entrega 1 (`JuntadaPecasService.anexar` — PDF,
 *    data não futura, versão, folhas, SHA-256, portão B no despacho, efeitos);
 *  - "não se aplica" (`FaseInternaService.marcarNaoSeAplica`), a portaria do
 *    órgão (`PecasFaseInternaService.vincularPortaria`), a escolha com/sem
 *    lances (`PublicacaoTelaService.definirModoDisputa`) e o sigilo
 *    (`MinutasTelaService.salvarSigilo`);
 *  - o checklist (`linhasDoChecklist`/`getInstrucao`) e as tarefas da E2 —
 *    as dos passos cumpridos NASCEM concluídas (`registrarPassosCumpridosFora`).
 *
 * Consistência (sem processo pela metade sem aviso):
 *  1. TUDO é conferido antes de gravar (dados, itens, cada PDF, a
 *     classificação, "não se aplica", art. 72 antes do despacho) — erro
 *     previsível → 400 e nada é gravado;
 *  2. processo + itens + escolhas: falha inesperada DESFAZ a criação;
 *  3. peças: juntadas uma a uma, na ordem lógica; a que falhar (ex.: portão B
 *     pelo limite da dispensa) vira PENDÊNCIA registrada no processo
 *     (`fase_interna_externa.pendencias`), devolvida na resposta e mostrada na
 *     tela do processo, com retomada pela juntada de documentos.
 */
@Injectable()
export class FaseInternaExternaService {
  private readonly logger = new Logger(FaseInternaExternaService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly licitacoes: LicitacoesService,
    private readonly faseInterna: FaseInternaService,
    private readonly pecas: PecasFaseInternaService,
    private readonly juntada: JuntadaPecasService,
    private readonly tarefas: TarefasService,
    private readonly auditLog: AuditLogService,
    private readonly publicacao: PublicacaoTelaService,
    private readonly minutas: MinutasTelaService,
  ) {}

  // ==========================================================================
  // CHECKLIST (antes de criar e na juntada num processo existente)
  // ==========================================================================

  private orgaoDoAtor(ator: Ator, orgaoIdAdmin?: string | null): string {
    if (ator.admin) {
      if (!orgaoIdAdmin || !ehUuid(orgaoIdAdmin)) throw new BadRequestException('Informe o órgão (orgao_id) — administrador da plataforma.');
      return orgaoIdAdmin;
    }
    return ator.orgaoId!;
  }

  private async controleInternoAtivo(orgaoId: string): Promise<boolean> {
    const [c] = await this.ds.query(`SELECT controle_interno_ativo FROM configuracoes_fase_interna WHERE orgao_id::text = $1`, [orgaoId]).catch(() => []);
    return !!c?.controle_interno_ativo;
  }

  private async linhasParaNovo(orgaoId: string, modalidade: string): Promise<{ direta: boolean; linhas: LinhaChecklistExterna[] }> {
    const direta = MODALIDADES_CONTRATACAO_DIRETA.includes(modalidade);
    const linhas = linhasDoChecklist({ contratacao_direta: direta, controle_interno_ativo: await this.controleInternoAtivo(orgaoId) });
    return { direta, linhas };
  }

  /** Linhas da instrução do processo + o que já está pronto / "não se aplica". */
  private async instrucaoDoProcesso(licitacaoId: string) {
    const instr = await this.faseInterna.getInstrucao(licitacaoId);
    const linhas: LinhaChecklistExterna[] = instr.itens.map((i) => ({
      tipo: i.tipo,
      titulo: i.titulo,
      obrigatorio: i.obrigatorio,
      fundamento: i.fundamento,
      pode_nao_se_aplicar: i.pode_nao_se_aplicar,
    }));
    return {
      direta: instr.contratacao_direta,
      linhas,
      prontas: instr.itens.filter((i) => i.status === 'OK').map((i) => i.tipo as string),
      naoSeAplica: instr.itens.filter((i) => i.status === 'NAO_SE_APLICA').map((i) => i.tipo as string),
    };
  }

  private async portariaDoOrgao(orgaoId: string) {
    const [p] = await this.ds
      .query(
        `SELECT numero, exercicio FROM documentos_orgao WHERE orgao_id::text = $1 AND tipo = 'PORTARIA_DESIGNACAO' AND ativo = true
          ORDER BY exercicio DESC, versao DESC LIMIT 1`,
        [orgaoId],
      )
      .catch(() => []);
    return p ? { numero: p.numero as string, exercicio: Number(p.exercicio) } : null;
  }

  /** O que a tela mostra ao lado dos arquivos: catálogo de peças e checklist incremental. */
  private async quadro(orgaoId: string, direta: boolean, linhas: LinhaChecklistExterna[], corpo: any, ja?: { prontas: string[]; naoSeAplica: string[] }) {
    const classificadas = Array.isArray(corpo?.classificadas) ? corpo.classificadas.map((t: unknown) => String(t).toUpperCase()) : [];
    const nsa = Array.isArray(corpo?.nao_se_aplica) ? corpo.nao_se_aplica.map((t: unknown) => String(t).toUpperCase()) : [];
    return {
      contratacao_direta: direta,
      opcoes: OPCOES_PECA_EXTERNA,
      checklist: checklistIncremental({
        contratacao_direta: direta,
        checklist: linhas,
        classificadas,
        nao_se_aplica: nsa,
        usar_portaria_orgao: corpo?.usar_portaria_orgao === true,
        ja_prontas: ja?.prontas,
        ja_nao_se_aplica: ja?.naoSeAplica,
      }),
      portaria_do_orgao: await this.portariaDoOrgao(orgaoId),
    };
  }

  /** POST /fase-interna/externa/checklist — processo ainda não criado (modalidade do corpo). */
  async checklistParaNovo(ator: Ator, corpo: any) {
    const orgaoId = this.orgaoDoAtor(ator, corpo?.orgao_id);
    const modalidade = String(corpo?.modalidade ?? '').toUpperCase();
    const { direta, linhas } = await this.linhasParaNovo(orgaoId, modalidade);
    const [cfg] = await this.ds.query(`SELECT dispensa_com_lances FROM configuracoes_fase_interna WHERE orgao_id::text = $1`, [orgaoId]).catch(() => []);
    return {
      ...(await this.quadro(orgaoId, direta, linhas, corpo)),
      // Dispensa: as opções da disputa (mesmos rótulos da escolha no processo) e o padrão sugerido do órgão
      disputa: modalidade === 'DISPENSA_ELETRONICA' ? { opcoes: OPCOES_MODO_DISPUTA, padrao_do_orgao: cfg?.dispensa_com_lances ?? true } : null,
    };
  }

  /** POST /fase-interna/:id/externa/checklist — juntada num processo existente. */
  async checklistDoProcesso(licitacaoId: string, corpo: any) {
    const [lic] = await this.ds.query(`SELECT orgao_id::text AS orgao_id FROM licitacoes WHERE id::text = $1`, [licitacaoId]);
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    const i = await this.instrucaoDoProcesso(licitacaoId);
    return this.quadro(lic.orgao_id, i.direta, i.linhas, corpo, { prontas: i.prontas, naoSeAplica: i.naoSeAplica });
  }

  // ==========================================================================
  // CONFERÊNCIA DOS PDFs (antes de gravar)
  // ==========================================================================

  private async conferirPdfs(arquivos: ArquivoRecebido[]): Promise<ErroExterno[]> {
    const erros: ErroExterno[] = [];
    let total = 0;
    for (let i = 0; i < arquivos.length; i++) {
      total += arquivos[i]?.buffer?.length ?? 0;
      try {
        await this.pecas.validarPdf(arquivos[i]);
      } catch (e) {
        erros.push({ passo: 'DOCUMENTOS', indice: i, mensagem: `"${arquivos[i]?.originalname || `arquivo ${i + 1}`}": ${mensagemDoErro(e)}` });
      }
    }
    if (total > MAX_TOTAL_BYTES) {
      erros.push({ passo: 'DOCUMENTOS', mensagem: `Os PDFs somam mais de ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)} MB — envie em mais de uma vez (juntar documentos no processo).` });
    }
    return erros;
  }

  // ==========================================================================
  // CRIAR O PROCESSO FEITO FORA
  // ==========================================================================

  /**
   * POST /fase-interna/externa/processo (multipart): `dados` (JSON — dados
   * básicos, `itens` e `classificacao`) e `arquivos` (os PDFs, na ordem que a
   * classificação usa). Cria o processo, grava os itens e junta as peças numa
   * operação só (ver o cabeçalho da classe).
   */
  async criarProcesso(ator: Ator, corpo: any, arquivos: ArquivoRecebido[]): Promise<ResultadoJuntada> {
    let dadosBrutos: any;
    try {
      dadosBrutos = typeof corpo?.dados === 'string' ? JSON.parse(corpo.dados) : corpo?.dados ?? corpo ?? {};
    } catch {
      throw new BadRequestException({ message: 'Dados do processo ilegíveis (JSON inválido).', passo: 'DADOS' });
    }
    const orgaoId = this.orgaoDoAtor(ator, dadosBrutos?.orgao_id);
    const d = validarDadosExternos(dadosBrutos);
    const it = validarItensExternos(dadosBrutos?.itens);
    let classificacao;
    try {
      classificacao = lerClassificacao(corpo?.classificacao ?? dadosBrutos?.classificacao);
    } catch (e) {
      throw erroDeValidacao([{ passo: 'DOCUMENTOS', mensagem: mensagemDoErro(e) }]);
    }
    const erros: ErroExterno[] = [...d.erros, ...it.erros];
    const dados = d.dados;

    // Mesmas regras da criação (LicitacoesService.create), conferidas ANTES de gravar
    const criterio = dados.criterio_julgamento || criterioPadraoDaModalidade(dados.modalidade);
    const modo = dados.modo_disputa || undefined;
    if (d.ok) {
      for (const motivo of [
        motivoFundamentoInvalido(dados.modalidade, dados.fundamento_legal),
        motivoModalidadeCriterioInvalido(dados.modalidade, criterio as any, modo as any),
        motivoModoCriterioInvalido(modo, criterio),
      ]) {
        if (motivo) erros.push({ passo: 'DADOS', mensagem: motivo });
      }
      const [dup] = await this.ds.query(`SELECT 1 FROM licitacoes WHERE numero_processo = $1 LIMIT 1`, [dados.numero_processo]);
      if (dup) erros.push({ passo: 'DADOS', mensagem: `Já existe um processo com o número ${dados.numero_processo}.` });
    }
    // Item do PCA: só do próprio órgão
    const pcas = it.itens.map((i) => i.item_pca_id).filter((x): x is string => !!x);
    if (pcas.length) {
      const doOrgao: Array<{ id: string }> = await this.ds.query(
        `SELECT i.id::text AS id FROM itens_pca i JOIN planos_contratacao_anual p ON p.id = i.pca_id WHERE i.id::text = ANY($1::text[]) AND p.orgao_id::text = $2`,
        [pcas, orgaoId],
      );
      const ok = new Set(doOrgao.map((x) => x.id));
      it.itens.forEach((i, idx) => {
        if (i.item_pca_id && !ok.has(i.item_pca_id)) erros.push({ passo: 'ITENS', indice: idx, mensagem: `Item ${idx + 1}: item do PCA não encontrado.` });
      });
    }
    // Demanda de origem: do órgão, aprovada, sem processo (mesma conferência da criação guiada)
    let demandaStatus: string | null = null;
    if (dados.demanda_id) {
      try {
        const dem = await this.licitacoes.demandaParaProcesso(dados.demanda_id, orgaoId);
        demandaStatus = dem.status as string;
      } catch (e) {
        erros.push({ passo: 'DADOS', mensagem: mensagemDoErro(e) });
      }
    }

    const { direta, linhas } = await this.linhasParaNovo(orgaoId, dados.modalidade);
    const plano = planejarJuntada({
      arquivos: arquivos.map((a) => ({ nome: a.originalname || '' })),
      classificacao,
      contratacao_direta: direta,
      checklist: linhas,
      exigir_arquivo: true,
    });
    erros.push(...plano.erros, ...(await this.conferirPdfs(arquivos)));
    if (erros.length) throw erroDeValidacao(erros);

    // ---- gravação ----
    const autor = await this.tarefas.autor(ator);
    const id = randomUUID();
    const agora = new Date().toISOString();
    // A agenda das tarefas fica suspensa: as dos passos cumpridos nascem concluídas no fim
    this.tarefas.suspender(id);
    let resultado: ResultadoJuntada;
    try {
      try {
        await this.licitacoes.create(
          {
            numero_processo: dados.numero_processo,
            numero_edital: dados.numero_edital ?? undefined,
            orgao_id: orgaoId,
            objeto: dados.objeto,
            modalidade: dados.modalidade,
            tipo_contratacao: dados.tipo_contratacao,
            fundamento_legal: dados.fundamento_legal,
            criterio_julgamento: criterio as CriterioJulgamento,
            ...(modo ? { modo_disputa: modo as ModoDisputa } : {}),
            valor_total_estimado: valorDosItensExternos(it.itens),
          },
          atorTransicaoDe(ator),
          {
            id,
            demanda_id: dados.demanda_id,
            registro: { fase_interna: 'EXTERNA' },
            fase_interna_externa: {
              modo: 'EXTERNA',
              por_id: autor.id,
              por_nome: autor.nome,
              em: agora,
              area_demandante: dados.area_demandante,
              juntadas: [],
              pendencias: [],
            },
          },
        );
      } catch (e) {
        // A criação confere as mesmas regras (recusou antes de gravar); se falhou
        // depois de gravar a linha (histórico, demanda), desfaz o que ficou
        const [ficou] = await this.ds.query(`SELECT 1 FROM licitacoes WHERE id::text = $1`, [id]);
        if (ficou) await this.desfazerCriacao(id, dados.demanda_id, demandaStatus);
        if (e instanceof HttpException) throw new BadRequestException({ message: mensagemDoErro(e), passo: 'DADOS' });
        throw e;
      }
      try {
        await this.gravarItens(id, it.itens);
        if (dados.dispensa_com_lances !== null) await this.publicacao.definirModoDisputa(id, { com_lances: dados.dispensa_com_lances }, autor);
        if (dados.sigilo.sigiloso) await this.minutas.salvarSigilo(id, { sigiloso: true, justificativa: dados.sigilo.justificativa }, autor);
      } catch (e) {
        await this.desfazerCriacao(id, dados.demanda_id, demandaStatus);
        throw e instanceof HttpException
          ? e
          : new ConflictException(`Não foi possível gravar os itens do processo — nada foi criado (${mensagemDoErro(e)}). Tente de novo.`);
      }
      resultado = await this.executar(id, plano.acoes, arquivos, ator, autor, { novo: true, area: dados.area_demandante });
    } finally {
      await this.tarefas.retomar(id);
    }
    resultado.tarefas_concluidas = await this.tarefas.registrarPassosCumpridosFora(id);
    return resultado;
  }

  /** Itens do processo (mesmo cálculo do cadastro de itens: total = quantidade × unitário). */
  protected async gravarItens(licitacaoId: string, itens: ReturnType<typeof validarItensExternos>['itens']): Promise<void> {
    await this.ds.transaction(async (m) => {
      const repo = m.getRepository(ItemLicitacao);
      await repo.save(
        itens.map((i) =>
          repo.create({
            licitacao_id: licitacaoId,
            numero_item: i.numero_item,
            descricao_resumida: i.descricao_resumida,
            quantidade: i.quantidade,
            unidade_medida: i.unidade_medida,
            valor_unitario_estimado: i.valor_unitario_estimado,
            valor_total_estimado: Math.round(i.quantidade * i.valor_unitario_estimado * 100) / 100,
            tipo_item: i.tipo_item,
            codigo_catalogo: i.codigo_catalogo ?? undefined,
            codigo_catmat: i.codigo_catmat ?? undefined,
            codigo_catser: i.codigo_catser ?? undefined,
            classe_catalogo: i.classe_catalogo ?? undefined,
            item_pca_id: i.item_pca_id ?? undefined,
            sem_pca: !i.item_pca_id,
            justificativa_sem_pca: i.item_pca_id ? undefined : i.justificativa_sem_pca ?? undefined,
          } as Partial<ItemLicitacao>),
        ),
      );
    });
  }

  /**
   * Desfaz a criação quando algo falha ANTES das peças (itens, disputa,
   * sigilo): apaga o processo e o que nasceu com ele e devolve a demanda de
   * origem à situação anterior. Falhou o desfazer: o erro diz qual processo
   * sobrou (nada fica "sem aviso").
   */
  private async desfazerCriacao(licitacaoId: string, demandaId: string | null, demandaStatus: string | null) {
    try {
      await this.ds.transaction(async (m) => {
        for (const t of ['logs_fase_interna', 'tarefas', 'itens_licitacao', 'documentos_fase_interna', 'licitacao_transicoes']) {
          await m.query(`DELETE FROM ${t} WHERE licitacao_id::text = $1`, [licitacaoId]);
        }
        await m.query(`DELETE FROM licitacoes WHERE id::text = $1`, [licitacaoId]);
        if (demandaId && demandaStatus) await m.query(`UPDATE demandas SET status = $2 WHERE id::text = $1`, [demandaId, demandaStatus]);
      });
    } catch (e) {
      this.logger.error(`Criação do processo ${licitacaoId} (fase interna feita fora) não foi desfeita: ${mensagemDoErro(e)}`);
      throw new ConflictException(
        `A gravação falhou no meio e o processo criado (id ${licitacaoId}) não pôde ser desfeito automaticamente — abra-o e revogue/exclua antes de tentar de novo.`,
      );
    }
  }

  // ==========================================================================
  // JUNTAR DOCUMENTOS FEITOS FORA NUM PROCESSO EXISTENTE
  // ==========================================================================

  /**
   * POST /fase-interna/:id/externa/documentos (multipart): `classificacao`
   * (JSON) e `arquivos`. Para quem começou guiado e decidiu anexar o resto, e
   * para a retomada das pendências da criação. Mesmo plano e mesma juntada.
   */
  async juntarNoProcesso(licitacaoId: string, ator: Ator, corpo: any, arquivos: ArquivoRecebido[]): Promise<ResultadoJuntada> {
    const [lic] = await this.ds.query(
      `SELECT id::text AS id, fase::text AS fase, situacao::text AS situacao FROM licitacoes WHERE id::text = $1`,
      [licitacaoId],
    );
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    if (SITUACOES_TERMINAIS.includes(lic.situacao)) throw new ConflictException(`Processo encerrado (situação ${lic.situacao}) — as peças não mudam mais.`);
    if (!ehFaseInterna(lic.fase)) throw new ConflictException('A fase interna deste processo já foi encerrada (processo divulgado) — as peças não podem mais ser juntadas.');
    let classificacao;
    try {
      classificacao = lerClassificacao(corpo?.classificacao);
    } catch (e) {
      throw erroDeValidacao([{ passo: 'DOCUMENTOS', mensagem: mensagemDoErro(e) }]);
    }
    const i = await this.instrucaoDoProcesso(licitacaoId);
    const plano = planejarJuntada({
      arquivos: arquivos.map((a) => ({ nome: a.originalname || '' })),
      classificacao,
      contratacao_direta: i.direta,
      checklist: i.linhas,
      ja_prontas: i.prontas,
      ja_nao_se_aplica: i.naoSeAplica,
    });
    const erros = [...plano.erros, ...(await this.conferirPdfs(arquivos))];
    if (!erros.length && !plano.acoes.length) erros.push({ passo: 'DOCUMENTOS', mensagem: 'Nada para juntar — envie os PDFs ou marque o que não se aplica.' });
    if (erros.length) throw erroDeValidacao(erros);

    const autor = await this.tarefas.autor(ator);
    this.tarefas.suspender(licitacaoId);
    let resultado: ResultadoJuntada;
    try {
      resultado = await this.executar(licitacaoId, plano.acoes, arquivos, ator, autor, { novo: false, area: null });
    } finally {
      await this.tarefas.retomar(licitacaoId);
    }
    resultado.tarefas_concluidas = await this.tarefas.registrarPassosCumpridosFora(licitacaoId);
    return resultado;
  }

  // ==========================================================================
  // EXECUÇÃO DA JUNTADA (peça a peça, pendência em vez de processo pela metade)
  // ==========================================================================

  private async executar(
    licitacaoId: string,
    acoes: AcaoJuntada[],
    arquivos: ArquivoRecebido[],
    ator: Ator,
    autor: Autor,
    opcoes: { novo: boolean; area: string | null },
  ): Promise<ResultadoJuntada> {
    const agora = new Date().toISOString();
    const juntadas: ResultadoJuntada['juntadas'] = [];
    const naoSeAplica: string[] = [];
    const pendencias: PendenciaJuntada[] = [];
    for (const a of acoes) {
      const nome = a.acao === 'ANEXAR' ? arquivos[a.arquivo]?.originalname || `arquivo ${a.arquivo + 1}` : null;
      try {
        if (a.acao === 'ANEXAR') {
          const doc = await this.juntada.anexar(
            licitacaoId,
            a.tipo,
            arquivos[a.arquivo],
            {
              numero_peca: a.numero_peca ?? undefined,
              data_documento: a.data_documento,
              signatarios: a.signatarios,
              observacao: a.observacao ?? undefined,
            },
            ator,
          );
          juntadas.push({ tipo: a.tipo, titulo: tituloDaPeca(a.tipo as TipoDocumentoFaseInterna), arquivo: nome, documento_id: doc.id, versao: doc.versao, folha_inicial: doc.folha_inicial ?? null, folha_final: doc.folha_final ?? null });
        } else if (a.acao === 'NAO_SE_APLICA') {
          await this.faseInterna.marcarNaoSeAplica(licitacaoId, a.tipo as TipoDocumentoFaseInterna, a.justificativa, {
            id: ator.admin ? undefined : autor.id ?? undefined,
            nome: autor.nome ?? undefined,
          });
          naoSeAplica.push(a.tipo);
        } else {
          const doc = await this.pecas.vincularPortaria(licitacaoId, null, ator);
          juntadas.push({ tipo: 'DP', titulo: tituloDaPeca(TipoDocumentoFaseInterna.DESIGNACAO_PREGOEIRO), arquivo: null, documento_id: doc.id, versao: doc.versao, folha_inicial: doc.folha_inicial ?? null, folha_final: doc.folha_final ?? null });
        }
      } catch (e) {
        pendencias.push({
          tipo: a.tipo,
          titulo: rotuloDaPecaExterna(a.tipo),
          arquivo: nome,
          indice: a.acao === 'ANEXAR' ? a.arquivo : null,
          erro: mensagemDoErro(e),
          em: agora,
        });
      }
    }

    // Área demandante informada nos dados → unidade requisitante do DFD juntado
    // (capa dos autos e cartão da autorização leem `_dfd.unidade_requisitante_nome`)
    const dfd = juntadas.find((j) => j.tipo === 'DFD');
    if (opcoes.area && dfd) {
      const [setor] = await this.ds.query(
        `SELECT s.id::text AS id FROM setores s JOIN licitacoes l ON l.orgao_id = s.orgao_id WHERE l.id::text = $1 AND lower(s.nome) = lower($2) LIMIT 1`,
        [licitacaoId, opcoes.area],
      );
      await this.ds.query(
        `UPDATE documentos_fase_interna SET dados_estruturados = COALESCE(dados_estruturados, '{}'::jsonb) || jsonb_build_object('_dfd', $2::jsonb) WHERE id::text = $1`,
        [dfd.documento_id, JSON.stringify({ unidade_requisitante_id: setor?.id ?? null, unidade_requisitante_nome: opcoes.area })],
      );
    }

    // Registro no processo (etiqueta + pendências abertas) e no histórico da fase interna
    const [lic] = await this.ds.query(`SELECT numero_processo, fase_interna_externa FROM licitacoes WHERE id::text = $1`, [licitacaoId]);
    const anterior = (lic?.fase_interna_externa ?? null) as Record<string, any> | null;
    const tiposFeitos = new Set([...juntadas.map((j) => j.tipo), ...naoSeAplica]);
    const modo: 'EXTERNA' | 'MISTA' = anterior?.modo === 'EXTERNA' || opcoes.novo ? 'EXTERNA' : 'MISTA';
    const registro = {
      ...(anterior ?? {}),
      modo,
      por_id: anterior?.por_id ?? autor.id,
      por_nome: anterior?.por_nome ?? autor.nome,
      em: anterior?.em ?? agora,
      juntadas: [
        ...((anterior?.juntadas as any[]) ?? []),
        ...juntadas.map((j) => ({ tipo: j.tipo, documento_id: j.documento_id, arquivo: j.arquivo, em: agora, por_nome: autor.nome })),
        ...naoSeAplica.map((t) => ({ tipo: t, nao_se_aplica: true, em: agora, por_nome: autor.nome })),
      ],
      pendencias: [...((anterior?.pendencias as PendenciaJuntada[]) ?? []).filter((p) => !tiposFeitos.has(p.tipo) && !pendencias.some((n) => n.tipo === p.tipo)), ...pendencias],
    };
    await this.ds.query(`UPDATE licitacoes SET fase_interna_externa = $2::jsonb WHERE id::text = $1`, [licitacaoId, JSON.stringify(registro)]);
    await this.auditLog
      .log({
        licitacao_id: licitacaoId,
        acao: AcaoLogFaseInterna.DOCUMENTO_IMPORTADO,
        descricao:
          `${opcoes.novo ? 'Fase interna feita fora do sistema — processo criado com os documentos anexados' : 'Documentos feitos fora do sistema juntados ao processo'}` +
          ` por ${autor.nome ?? 'usuário do órgão'}: ${juntadas.length} peça(s) juntada(s)` +
          `${naoSeAplica.length ? `, ${naoSeAplica.length} "não se aplica"` : ''}` +
          `${pendencias.length ? `; ${pendencias.length} pendência(s): ${pendencias.map((p) => `${p.titulo} — ${p.erro}`).join('; ')}` : ''}`,
        dados_antes: anterior ? { modo: anterior.modo ?? null } : null,
        dados_depois: {
          fase_interna_externa: true,
          modo,
          juntadas: juntadas.map((j) => ({ tipo: j.tipo, documento_id: j.documento_id, arquivo: j.arquivo })),
          nao_se_aplica: naoSeAplica,
          pendencias: pendencias.map((p) => ({ tipo: p.tipo, arquivo: p.arquivo, erro: p.erro })),
        },
        contexto: { usuario_id: autor.id ?? undefined, usuario_nome: autor.nome ?? undefined },
      })
      .catch((e: any) => this.logger.warn(`Histórico da juntada não gravado: ${e?.message ?? e}`));

    const i = await this.instrucaoDoProcesso(licitacaoId);
    return {
      licitacao_id: licitacaoId,
      numero_processo: lic?.numero_processo ?? '',
      modo,
      juntadas,
      nao_se_aplica: naoSeAplica,
      pendencias,
      tarefas_concluidas: 0,
      checklist: checklistIncremental({ contratacao_direta: i.direta, checklist: i.linhas, classificadas: [], ja_prontas: i.prontas, ja_nao_se_aplica: i.naoSeAplica }),
      destino: `/orgao/processos/${licitacaoId}`,
      conformidade: `/orgao/processos/${licitacaoId}/fase-interna/conformidade`,
    };
  }

  // ==========================================================================
  // SITUAÇÃO (tela do processo)
  // ==========================================================================

  /**
   * GET /fase-interna/:id/externa — se a fase interna foi feita fora (quem e
   * quando) e as pendências da juntada AINDA abertas (a que já foi resolvida
   * por qualquer caminho — anexo, "não se aplica", fazer aqui — sai da lista).
   */
  async situacao(licitacaoId: string) {
    const [lic] = await this.ds.query(`SELECT fase_interna_externa, fase::text AS fase FROM licitacoes WHERE id::text = $1`, [licitacaoId]);
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    const r = (lic.fase_interna_externa ?? null) as Record<string, any> | null;
    const pend: PendenciaJuntada[] = Array.isArray(r?.pendencias) ? r!.pendencias : [];
    let abertas: PendenciaJuntada[] = [];
    if (pend.length) {
      const docs: any[] = await this.ds.query(
        `SELECT tipo::text AS tipo, status::text AS status, origem::text AS origem, descricao, dados_estruturados, caminho_arquivo, arquivo_pdf_path
           FROM documentos_fase_interna WHERE licitacao_id::text = $1 AND versao_atual = true AND tipo::text = ANY($2::text[])`,
        [licitacaoId, pend.map((p) => p.tipo)],
      );
      abertas = pend.filter((p) => {
        const doc = docs.find((x) => x.tipo === p.tipo);
        return !(doc && (doc.dados_estruturados?.nao_se_aplica || pecaContaComoPronta(doc)));
      });
    }
    return {
      externa: !!r,
      modo: r?.modo ?? null,
      por_nome: r?.por_nome ?? null,
      em: r?.em ?? null,
      area_demandante: r?.area_demandante ?? null,
      juntadas: Array.isArray(r?.juntadas) ? r!.juntadas.length : 0,
      pendencias: ehFaseInterna(lic.fase) ? abertas : [],
      pode_juntar: ehFaseInterna(lic.fase),
    };
  }
}
