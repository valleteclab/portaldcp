import { WorkflowService } from '../workflow/workflow.service';
import { Injectable, ConflictException, NotFoundException, BadRequestException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  Licitacao,
  FaseLicitacao,
  ModalidadeLicitacao,
  TipoContratacao,
  CriterioJulgamento,
  SituacaoLicitacao,
  SITUACOES_TERMINAIS,
} from './entities/licitacao.entity';
import { CreateLicitacaoDto, PublicarEditalDto } from './dto/create-licitacao.dto';
import { CreateFromDemandaDto } from './dto/create-from-demanda.dto';
import { ItemLicitacao, UnidadeMedida, StatusItem } from '../itens/entities/item-licitacao.entity';
import { gerarAtaDispensaPdf, DadosAtaDispensa } from './ata-dispensa-pdf';
import { JanelaDispensaService, LeitorChat } from '../disputa/janela-dispensa.service';
import { FaseInternaService } from '../fase-interna/fase-interna.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { TipoNotificacao } from '../notificacoes/entities/notificacao.entity';
import { LoteLicitacao } from '../lotes/entities/lote-licitacao.entity';
import { normalizarBeneficioMpeLote } from '../lotes/lotes.service';
import { normalizarBeneficioMpeLicitacao } from '../julgamento/me-epp/regras-me-epp';
import { Demanda, StatusDemanda } from '../demandas/entities/demanda.entity';
import { ContratosService } from '../contratos/contratos.service';
import { FASES_PUBLICAS, licitacaoParaPublico } from './licitacao-visao.util';
import { TransicoesService } from './transicoes/transicoes.service';
import { AtoLicitacao, AtorTransicao, atorSistema } from './transicoes/transicoes.tipos';
import { MAPA_SITUACAO_LEGADA } from './transicoes/migracao-situacao';
import { LicitacaoTransicao } from './transicoes/licitacao-transicao.entity';
import { ProcessoService } from '../processo/processo.service';
import { REFERENCIA_LICITACAO } from '../processo/entities/processo.entity';
import { ehFaseInterna, ROTULO_FASE } from './transicoes/fases';
import { camposDoEditalAlterados, mesmoValor, normalizarNaturezaObjeto } from '../publicacao/regras-publicacao';
import { motivoModoCriterioInvalido } from '../disputa/modos-disputa';
import { motivoModalidadeCriterioInvalido } from '../modalidades-especiais/perfil-modalidade';
import { motivoInversaoInvalida } from '../habilitacao/regras-habilitacao';
import { desempatarNoAto } from '../julgamento/desempate.sql';
import { ResultadoService, EntradaAdjudicacao } from '../resultado/resultado.service';
import { valorAdjudicadoDoUnitario } from '../resultado/regras-resultado';
import type { Ator } from '../auth/acesso/ator';
import { aplicarEstadoCompraPncp, estadoCompraPncp } from '../pncp/estado-compra-pncp';
import { fundamentoLegalTexto } from '../pncp/mapeamento-pncp';
import { fundamentoEfetivo, fundamentoPadrao, motivoFundamentoInvalido } from './fundamento-legal';
import { classificacaoPorItem, valoresFinaisDispensa } from './classificacao-dispensa';
import { dispensaSemLances, modoDisputaDaDispensa, vencedoresSemLances } from './modo-disputa-dispensa';
import { resolverAutoridade } from '../resultado/formalizacao/regras-formalizacao';
import { nomeDoPregoeiro, nomeDoPregoeiroSql } from './migracao-legado-e9';
import { comoErro } from '../common/erros';
import { colunasTipadasDosMetadados, mensagemCamposInvalidos, normalizarCamposTipados } from './normalizar-campos-edicao';
import { DfdConsolidadoService } from '../demandas/dfd/dfd-consolidado.service';
import { textoDoAlerta } from '../demandas/dfd/consolidacao-dfd';
import { AuditLogService } from '../fase-interna/audit-log.service';
import { AcaoLogFaseInterna } from '../fase-interna/entities/log-fase-interna.entity';
import { NumeroProcessoService } from '../numero-processo/numero-processo.service';
import { ATOS_DE_EXTINCAO, PapelNoProcesso, exigirExtincao, exigirQuemConduz, papelNoProcesso } from './permissao-atos-processo';

// Formata Date para string ISO local (sem conversão UTC)
// Garante que 21:00 em Brasília seja retornado como "2025-12-10T21:00:00"
function formatarDataLocal(date: Date | null | undefined): string | null {
  if (!date) return null;
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  const hora = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const seg = String(date.getSeconds()).padStart(2, '0');
  return `${ano}-${mes}-${dia}T${hora}:${min}:${seg}`;
}

/** Itens do corpo diferem dos gravados (número, descrição, quantidade, valor)? — E7a. */
function itensAlterados(atuais: any[], corpo: any): boolean {
  if (!Array.isArray(corpo)) return false;
  if (corpo.length !== atuais.length) return true;
  const porNumero = new Map(atuais.map((i: any) => [Number(i.numero_item), i]));
  return corpo.some((c: any, idx: number) => {
    const a = porNumero.get(Number(c.numero ?? c.numero_item ?? idx + 1));
    if (!a) return true;
    const desc = c.descricao ?? c.descricao_resumida;
    const valor = c.valor_unitario ?? c.valor_unitario_estimado;
    return (
      (desc !== undefined && !mesmoValor(desc, a.descricao_resumida)) ||
      (c.quantidade !== undefined && !mesmoValor(c.quantidade, a.quantidade)) ||
      (valor !== undefined && !mesmoValor(valor, a.valor_unitario_estimado))
    );
  });
}

@Injectable()
export class LicitacoesService {
  private readonly logger = new Logger(LicitacoesService.name);

  constructor(
    @InjectRepository(Licitacao)
    private readonly licitacaoRepository: Repository<Licitacao>,
    @InjectRepository(ItemLicitacao)
    private readonly itemRepository: Repository<ItemLicitacao>,
    @InjectRepository(LoteLicitacao)
    private readonly loteRepository: Repository<LoteLicitacao>,
    @InjectRepository(Demanda)
    private readonly demandaRepository: Repository<Demanda>,
    // Sala da dispensa (janela de lances, chat, tempo real) = motor único (E2 item 7)
    private readonly janelaDispensa: JanelaDispensaService,
    @Inject(forwardRef(() => ContratosService))
    private readonly contratosService: ContratosService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly faseInternaService: FaseInternaService,
    private readonly notificacoesService: NotificacoesService,
    private readonly transicoes: TransicoesService,
    // Resultado único (E6): julgamento da dispensa e resultado externo gravam
    // a adjudicação pelo mesmo serviço; homologar é só dele.
    private readonly resultado: ResultadoService,
    // DFD consolidado (unidade de planejamento): o processo nasce do DFD (N demandas)
    private readonly dfds: DfdConsolidadoService,
    // Processo eletrônico: a licitação é o primeiro TIPO de processo — nasce com a autuação, na mesma transação
    private readonly processos: ProcessoService,
    private readonly workflow: WorkflowService,
    private readonly auditLog: AuditLogService,
    // Gerador único do nº do processo administrativo (sequencial por órgão/ano)
    private readonly numeros: NumeroProcessoService,
  ) {}

  /**
   * Marco do ciclo da demanda de origem (transparência p/ o requisitante):
   * avisa o setor que pediu quando a contratação avança. Best-effort.
   */
  private async notificarDemandaOrigem(
    licitacao: Licitacao,
    tipo: TipoNotificacao,
    titulo: string,
    mensagem: string,
  ): Promise<void> {
    try {
      // Todas as demandas do processo: o vínculo antigo e as do DFD consolidado
      const ids = await this.dfds.demandasDoProcesso(licitacao.id);
      if (!ids.length) return;
      const demandas = await this.demandaRepository.find({ where: ids.map((id) => ({ id })) });
      for (const demanda of demandas) {
        await this.notificacoesService.criar({
          orgao_id: licitacao.orgao_id,
          usuario_id: licitacao.orgao_id,
          usuario_email: demanda.responsavel_email || undefined,
          tipo,
          titulo,
          mensagem,
          entidade_tipo: 'DEMANDA',
          entidade_id: demanda.id,
          link: `/orgao/demandas/${demanda.id}`,
        } as any);
      }
    } catch (eCapturado: unknown) {
      const e = comoErro(eCapturado);
      this.logger.warn(`Notificação da demanda de origem não enviada: ${e.message}`);
    }
  }

  /** `natureza_objeto` normalizada (COMUM | ESPECIAL | null) ou 400. */
  private naturezaValida(v: unknown): 'COMUM' | 'ESPECIAL' | null {
    try {
      return normalizarNaturezaObjeto(v);
    } catch (motivo) {
      throw new BadRequestException(String(motivo));
    }
  }

  // === CRUD ===
  /**
   * `opcoes` (entrada "fase interna feita fora"): `id` pré-gerado (a agenda
   * das tarefas do processo é suspensa antes de o processo existir), a demanda
   * de origem (já conferida por `demandaParaProcesso`) e o registro do ato
   * CRIAR (histórico: "fase interna feita fora do sistema").
   */
  async create(
    createDto: CreateLicitacaoDto,
    ator: AtorTransicao = atorSistema('api'),
    opcoes: {
      id?: string;
      demanda_id?: string | null;
      registro?: Record<string, any>;
      fase_interna_externa?: Record<string, any> | null;
      /** DFD consolidado já reservado (`DfdConsolidadoService.reservarParaProcesso`): grava a ligação antes do status das demandas. */
      dfd_consolidado?: { id: string; ator: Ator | null } | null;
    } = {},
  ): Promise<Licitacao> {
    // Modo de disputa × critério de julgamento (Lei 14.133 art. 56 §§1º e 2º)
    const vedacao = motivoModoCriterioInvalido(createDto.modo_disputa, createDto.criterio_julgamento);
    if (vedacao) throw new BadRequestException(vedacao);
    // Modalidade × critério (leilão = maior lance; concurso = melhor técnica/conteúdo artístico — E7c)
    const vedacaoModalidade = motivoModalidadeCriterioInvalido(createDto.modalidade, createDto.criterio_julgamento, createDto.modo_disputa);
    if (vedacaoModalidade) throw new BadRequestException(vedacaoModalidade);
    // Natureza do objeto (art. 6º XIII/XIV — prazo do art. 55, II; E7a)
    if (createDto.natureza_objeto !== undefined) {
      createDto.natureza_objeto = this.naturezaValida(createDto.natureza_objeto);
    }
    // Inversão de fases (art. 17 §1º; plano E4): só concorrência
    const vedacaoInversao = motivoInversaoInvalida({
      inversaoFinal: !!(createDto as any).inversao_fases,
      inversaoAtual: !!(createDto as any).inversao_fases,
      modalidadeFinal: createDto.modalidade,
    });
    if (vedacaoInversao) throw new BadRequestException(vedacaoInversao.mensagem);
    // Nº do processo administrativo: digitado (único no órgão → 409) ou gerado
    // pelo gerador único, na transação da gravação (ver abaixo)
    const numeroDigitado = this.numeros.normalizar(createDto.numero_processo);
    if (numeroDigitado) await this.numeros.exigirLivre(createDto.orgao_id, numeroDigitado);

    // Gera ano e sequencial
    const ano = new Date().getFullYear();
    const count = await this.licitacaoRepository.count({
      where: { ano }
    });

    // Benefício ME/EPP (LC 123 art. 48): fonte da verdade = tipo_beneficio_mpe; legado derivado
    let beneficioMpe: ReturnType<typeof normalizarBeneficioMpeLicitacao>;
    try {
      beneficioMpe = normalizarBeneficioMpeLicitacao(createDto as any);
    } catch (eCapturado: unknown) {
      const e = comoErro(eCapturado);
      throw new BadRequestException(e?.message ?? 'Benefício ME/EPP inválido');
    }

    // Fundamento legal (fonte única — fundamento-legal.ts): informado e
    // compatível com a modalidade, ou o padrão da modalidade.
    const vedacaoFundamento = motivoFundamentoInvalido(createDto.modalidade, createDto.fundamento_legal);
    if (vedacaoFundamento) throw new BadRequestException(vedacaoFundamento);
    const licitacao = this.licitacaoRepository.create({
      ...createDto,
      ...(opcoes.id ? { id: opcoes.id } : {}),
      ...(opcoes.demanda_id ? { demanda_id: opcoes.demanda_id } : {}),
      // só pela entrada "fase interna feita fora" (nunca pelo corpo do POST)
      fase_interna_externa: opcoes.fase_interna_externa ?? null,
      fundamento_legal: createDto.fundamento_legal || fundamentoPadrao(createDto.modalidade, createDto.tipo_contratacao),
      ano,
      sequencial: count + 1,
      // Estado inicial é sempre este — fase/situação nunca vêm do corpo
      fase: FaseLicitacao.PLANEJAMENTO,
      situacao: SituacaoLicitacao.ATIVA,
      fase_anterior: null,
      fase_interna_concluida: false, // só pelo ato CONCLUIR_FASE_INTERNA (gate E1.7)
      data_abertura_processo: new Date(),
    });
    Object.assign(licitacao, beneficioMpe);

    const salva = await this.licitacaoRepository.manager.transaction(async (m) => {
      // PROCESSO ELETRÔNICO: a autuação nasce primeiro (consome o nº do gerador único
      // ou confere o digitado); a licitação recebe o MESMO número e é ligada ao processo.
      const processo = await this.processos.abrirContratacao(m, {
        orgaoId: createDto.orgao_id,
        numeroDigitado,
        objeto: createDto.objeto,
        abertoPor: { tipo: ator.tipo, id: ator.id },
        origem: opcoes.fase_interna_externa ? 'FEITA_FORA' : opcoes.dfd_consolidado ? 'DFD' : opcoes.demanda_id ? 'DEMANDA' : 'ASSISTENTE',
      });
      licitacao.numero_processo = processo.numero;
      let gravada: Licitacao;
      try {
        gravada = await m.getRepository(Licitacao).save(licitacao);
      } catch (e) {
        throw this.numeros.traduzirViolacao(e, licitacao.numero_processo);
      }
      await this.processos.vincularReferencia(m, processo.id, REFERENCIA_LICITACAO, gravada.id);
      return gravada;
    });
    if (opcoes.dfd_consolidado) await this.dfds.vincularProcesso(opcoes.dfd_consolidado.id, salva.id, opcoes.dfd_consolidado.ator, salva.numero_processo);
    await this.transicoes.registrarCriacao(salva, ator, undefined, opcoes.registro);
    // E6.5: vinculada ao item do PCA / às demandas → item LICITACAO_INICIADA, demandas EM_CONTRATACAO
    if (salva.item_pca_id || salva.demanda_id || opcoes.dfd_consolidado) await this.resultado.aoCriarProcesso(salva.id);
    return salva;
  }

  // === CRIAÇÃO A PARTIR DE DEMANDA APROVADA ===
  /**
   * Demanda que pode originar um processo: do órgão do ator (outro órgão → 404,
   * sem confirmar que existe), APROVADA ou CONSOLIDADA e que ainda não originou
   * processo (409). Usada pela criação a partir da demanda (guiada) e pela
   * entrada "fase interna feita fora".
   */
  async demandaParaProcesso(demandaId: string, orgaoIdDoAtor?: string | null): Promise<Demanda> {
    const demanda = await this.demandaRepository.findOne({
      where: { id: demandaId },
      relations: ['itens'],
    });

    if (!demanda || (orgaoIdDoAtor && demanda.orgao_id !== orgaoIdDoAtor)) {
      throw new NotFoundException('Demanda não encontrada');
    }

    // Exige status APROVADA ou CONSOLIDADA
    if (
      demanda.status !== StatusDemanda.APROVADA &&
      demanda.status !== StatusDemanda.CONSOLIDADA
    ) {
      throw new BadRequestException(
        'Apenas demandas aprovadas podem originar um processo',
      );
    }

    // Uma demanda origina UM processo — evita duplicar por clique repetido
    const jaExiste = await this.licitacaoRepository.findOne({
      where: { demanda_id: demandaId },
    });
    if (jaExiste) {
      throw new ConflictException(
        `Esta demanda já originou o processo ${jaExiste.numero_processo}`,
      );
    }
    // Juntada num DFD consolidado: o processo sai do DFD (não da demanda sozinha)
    const noDfd = await this.dfds.dfdDaDemanda(demandaId);
    if (noDfd) {
      const ids = await this.dfds.idsDasDemandas(noDfd.id);
      if (noDfd.status === 'EM_PROCESSO' || ids.length > 1) {
        throw new ConflictException(
          `Esta demanda já está no DFD nº ${noDfd.numero}/${noDfd.ano} (consolidado pela unidade de planejamento) — o processo é aberto pelo DFD.`,
        );
      }
    }
    return demanda;
  }

  /**
   * Mapeia a string livre de unidade de medida usada nas demandas
   * para o enum UnidadeMedida usado nos itens da licitação.
   * Fallback: UnidadeMedida.UNIDADE
   */
  private mapUnidade(u: string): UnidadeMedida {
    if (!u) return UnidadeMedida.UNIDADE;
    const v = u.toString().trim().toUpperCase();
    const mapa: Record<string, UnidadeMedida> = {
      UN: UnidadeMedida.UNIDADE,
      UND: UnidadeMedida.UNIDADE,
      UNID: UnidadeMedida.UNIDADE,
      UNIDADE: UnidadeMedida.UNIDADE,
      PC: UnidadeMedida.PECA,
      PECA: UnidadeMedida.PECA,
      'PEÇA': UnidadeMedida.PECA,
      CX: UnidadeMedida.CAIXA,
      CAIXA: UnidadeMedida.CAIXA,
      PCT: UnidadeMedida.PACOTE,
      PACOTE: UnidadeMedida.PACOTE,
      M: UnidadeMedida.METRO,
      METRO: UnidadeMedida.METRO,
      M2: UnidadeMedida.METRO_QUADRADO,
      'M²': UnidadeMedida.METRO_QUADRADO,
      METRO_QUADRADO: UnidadeMedida.METRO_QUADRADO,
      M3: UnidadeMedida.METRO_CUBICO,
      'M³': UnidadeMedida.METRO_CUBICO,
      METRO_CUBICO: UnidadeMedida.METRO_CUBICO,
      L: UnidadeMedida.LITRO,
      LT: UnidadeMedida.LITRO,
      LITRO: UnidadeMedida.LITRO,
      KG: UnidadeMedida.QUILOGRAMA,
      QUILOGRAMA: UnidadeMedida.QUILOGRAMA,
      QUILO: UnidadeMedida.QUILOGRAMA,
      T: UnidadeMedida.TONELADA,
      TON: UnidadeMedida.TONELADA,
      TONELADA: UnidadeMedida.TONELADA,
      H: UnidadeMedida.HORA,
      HORA: UnidadeMedida.HORA,
      HR: UnidadeMedida.HORA,
      DIARIA: UnidadeMedida.DIARIA,
      'DIÁRIA': UnidadeMedida.DIARIA,
      MES: UnidadeMedida.MES,
      'MÊS': UnidadeMedida.MES,
      MESES: UnidadeMedida.MES,
      ANO: UnidadeMedida.ANO,
      ANOS: UnidadeMedida.ANO,
      SERVICO: UnidadeMedida.SERVICO,
      'SERVIÇO': UnidadeMedida.SERVICO,
      SERV: UnidadeMedida.SERVICO,
      GLOBAL: UnidadeMedida.GLOBAL,
    };
    return mapa[v] ?? UnidadeMedida.UNIDADE;
  }

  /**
   * "Iniciar contratação" a partir de UMA demanda (só a unidade de
   * planejamento): por baixo, um DFD de 1 demanda e o mesmo caminho do DFD
   * consolidado (`criarAPartirDeDfd`).
   * @param orgaoIdDoAtor órgão do usuário autenticado (null/undefined = admin da
   *        plataforma). Demanda de outro órgão → 404 (não confirma que existe).
   */
  async criarAPartirDeDemanda(
    dto: CreateFromDemandaDto,
    orgaoIdDoAtor?: string | null,
    ator: AtorTransicao = atorSistema('api'),
    atorAcesso?: Ator | null,
  ): Promise<Licitacao> {
    // 1–2. Demanda do órgão, aprovada e ainda sem processo (mensagens de sempre)
    const demanda = await this.demandaParaProcesso(dto.demanda_id, orgaoIdDoAtor);
    if (!atorAcesso) throw new BadRequestException('Autenticação necessária');
    await this.dfds.exigirMontar(atorAcesso, demanda.orgao_id);
    this.conferirModalidadeCriterio(dto);
    const dfd = await this.dfds.criarDeUmaDemanda(demanda.id, demanda.orgao_id, atorAcesso);
    const r = await this.criarAPartirDeDfd(dfd.id, dto, demanda.orgao_id, ator, atorAcesso);
    return r.licitacao;
  }

  /** Modo (padrão ABERTO) × critério e modalidade × critério — Lei 14.133 art. 56 §§1º e 2º. */
  private conferirModalidadeCriterio(dto: { modalidade?: ModalidadeLicitacao; criterio_julgamento?: CriterioJulgamento }) {
    const vedacaoModo = motivoModoCriterioInvalido(undefined, dto.criterio_julgamento ?? CriterioJulgamento.MENOR_PRECO);
    if (vedacaoModo) throw new BadRequestException(vedacaoModo);
    const vedacaoModalidade = motivoModalidadeCriterioInvalido(dto.modalidade ?? ModalidadeLicitacao.PREGAO_ELETRONICO, dto.criterio_julgamento ?? CriterioJulgamento.MENOR_PRECO);
    if (vedacaoModalidade) throw new BadRequestException(vedacaoModalidade);
  }

  /**
   * ABRE O PROCESSO a partir do DFD consolidado (unidade de planejamento):
   * itens somados do DFD, ligação processo ↔ DFD ↔ demandas (N:1 pela tabela
   * de ligação; `demanda_id` só quando é 1 demanda, por compatibilidade) e a
   * PEÇA DFD do processo nasce preenchida (unidade requisitante, responsável,
   * data pretendida, prioridade, item do PCA comum) — nada de redigitar.
   * Com a 2ª aprovação ligada, só abre com o DFD aprovado. Devolve também o
   * alerta de parecidos (atenção — art. 12, VII; art. 75, §1º).
   */
  async criarAPartirDeDfd(
    dfdId: string,
    dto: Partial<CreateFromDemandaDto>,
    orgaoIdDoAtor: string | null | undefined,
    ator: AtorTransicao = atorSistema('api'),
    atorAcesso?: Ator | null,
  ): Promise<{ licitacao: Licitacao; alertas: any[]; alerta: string | null }> {
    this.conferirModalidadeCriterio(dto);
    // Nº do processo digitado: único no órgão do DFD (409 antes de reservar)
    const numeroDigitado = this.numeros.normalizar(dto.numero_processo);
    if (numeroDigitado && orgaoIdDoAtor) await this.numeros.exigirLivre(orgaoIdDoAtor, numeroDigitado);
    // Reserva (ninguém abre dois; confere aprovação, itens e demandas)
    const { dfd, anterior, demandas } = await this.dfds.reservarParaProcesso(dfdId, orgaoIdDoAtor ?? null);
    const itens = dfd.itens;
    const ano = new Date().getFullYear();
    let licitacaoSalva: Licitacao;
    try {
      // 3. Número do processo: o gerador único (órgão/ano), dentro da transação da gravação
      const countParaSeq = await this.licitacaoRepository.count({ where: { ano } });
      // 4–5. Objeto e valor (do DFD)
      const objeto = dto.objeto || dfd.objeto || (itens.length === 1 ? itens[0].descricao : `Contratação referente ao DFD nº ${dfd.numero}/${dfd.ano}`);
      const valor_total_estimado = itens.reduce((acc, it) => acc + (Number(it.valor_total_estimado) || 0), 0);
      // 6. Processo
      const licitacao = this.licitacaoRepository.create({
        orgao_id: dfd.orgao_id,
        objeto,
        valor_total_estimado,
        // compatibilidade: processo de 1 demanda mantém o vínculo antigo
        demanda_id: demandas.length === 1 ? demandas[0].id : (null as any),
        item_pca_id: dfd.item_pca_id ?? (undefined as any),
        modalidade: dto.modalidade ?? ModalidadeLicitacao.PREGAO_ELETRONICO,
        tipo_contratacao: dto.tipo_contratacao ?? (itens.some((i) => i.categoria === 'SERVICO') ? TipoContratacao.SERVICO : TipoContratacao.COMPRA),
        criterio_julgamento: dto.criterio_julgamento ?? CriterioJulgamento.MENOR_PRECO,
        fase: FaseLicitacao.PLANEJAMENTO,
        situacao: SituacaoLicitacao.ATIVA,
        ano,
        sequencial: countParaSeq + 1,
        data_abertura_processo: new Date(),
      });
      licitacaoSalva = await this.licitacaoRepository.manager.transaction(async (m) => {
        // PROCESSO ELETRÔNICO: autuação primeiro (mesmo número), licitação ligada em seguida
        const processo = await this.processos.abrirContratacao(m, {
          orgaoId: dfd.orgao_id,
          numeroDigitado,
          objeto,
          abertoPor: atorAcesso ? ProcessoService.autorDoAtor(atorAcesso) : { tipo: ator.tipo, id: ator.id },
          origem: 'DFD',
        });
        licitacao.numero_processo = processo.numero;
        let gravada: Licitacao;
        try {
          gravada = await m.getRepository(Licitacao).save(licitacao);
        } catch (e) {
          throw this.numeros.traduzirViolacao(e, licitacao.numero_processo);
        }
        await this.processos.vincularReferencia(m, processo.id, REFERENCIA_LICITACAO, gravada.id);
        return gravada;
      });
    } catch (e) {
      await this.dfds.liberarReserva(dfdId, anterior);
      throw e;
    }
    await this.dfds.vincularProcesso(dfdId, licitacaoSalva.id, atorAcesso ?? null, licitacaoSalva.numero_processo);
    await this.transicoes.registrarCriacao(licitacaoSalva, ator, undefined, {
      demanda_id: licitacaoSalva.demanda_id ?? null,
      dfd_consolidado_id: dfd.id,
      demandas: demandas.map((d) => d.id),
    });
    // E6.5: demandas → EM_CONTRATACAO (todas as do DFD); item do PCA → LICITACAO_INICIADA
    await this.resultado.aoCriarProcesso(licitacaoSalva.id);
    // Fluxo desenhado (07/10/2026): a contratação aberta pelo DFD já nasce seguindo o fluxo de Contratação ativo
    try {
      const [proc] = await this.dataSource.query(
        `SELECT id::text AS id FROM processos WHERE referencia_tipo = 'LICITACAO' AND referencia_id::text = $1 AND orgao_id::text = $2`,
        [licitacaoSalva.id, licitacaoSalva.orgao_id],
      );
      if (proc) await this.workflow.iniciarFluxoDaContratacao(licitacaoSalva.orgao_id, proc.id, String(atorAcesso?.usuarioId ?? atorAcesso?.id ?? ator.id ?? ""));
    } catch (e) {
      this.logger.warn(`Fluxo da contratação ${licitacaoSalva.id} não iniciou sozinho: ${e instanceof Error ? e.message : e}`);
    }

    // 7. Itens do processo = itens consolidados do DFD
    const itensLicitacao = itens.map((item, i) =>
      this.itemRepository.create({
        licitacao_id: licitacaoSalva.id,
        numero_item: i + 1,
        descricao_resumida: item.descricao,
        descricao_detalhada: item.descricao,
        quantidade: Number(item.quantidade),
        unidade_medida: this.mapUnidade(item.unidade_medida),
        valor_unitario_estimado: Number(item.valor_unitario_estimado) || 0,
        valor_total_estimado: Number(item.valor_total_estimado) || 0,
        codigo_catalogo: item.codigo_item_catalogo ?? undefined,
        codigo_catmat: item.categoria === 'MATERIAL' ? item.codigo_classe ?? undefined : undefined,
        codigo_catser: item.categoria === 'MATERIAL' ? undefined : item.codigo_classe ?? undefined,
        classe_catalogo: item.nome_classe ?? undefined,
        nome_pdm: item.nome_classe ?? undefined,
        nome_grupo: item.categoria,
        item_pca_id: item.item_pca_id ?? undefined,
        sem_pca: !item.item_pca_id,
        justificativa_sem_pca: item.item_pca_id ? undefined : item.justificativa ?? undefined,
      }),
    );
    if (itensLicitacao.length > 0) await this.itemRepository.save(itensLicitacao);

    // 7.5 Peça DFD do processo, preenchida a partir do DFD consolidado
    const alertas = await this.dfds.alertas(dfd.orgao_id, dfd.ano, itens, { dfdId: dfd.id, demandaIds: demandas.map((d) => d.id), licitacaoId: licitacaoSalva.id });
    const alerta = textoDoAlerta(alertas);
    try {
      const pc = await this.dfds.camposDaPeca(dfd, demandas);
      const dados = { ...pc.secoes, _dfd: pc._dfd, _dfd_consolidado: pc._dfd_consolidado };
      const descricao = Object.values(pc.secoes)
        .filter((v) => typeof v === 'string' && v.trim())
        .join('\n');
      await this.dataSource.query(
        `INSERT INTO documentos_fase_interna
           (licitacao_id, tipo, titulo, descricao, dados_estruturados, status, origem, versao, versao_atual, obrigatorio)
         VALUES ($1, 'DFD', 'Formalização da Demanda (DFD)', $2, $3, 'EM_ELABORACAO', 'INTERNO', 1, true, true)`,
        [licitacaoSalva.id, descricao, JSON.stringify(dados)],
      );
      const setores = [...new Set(demandas.map((d) => d.unidade_requisitante))];
      await this.auditLog
        .log({
          licitacao_id: licitacaoSalva.id,
          acao: AcaoLogFaseInterna.DOCUMENTO_CRIADO,
          descricao:
            `DFD do processo preenchido a partir do DFD consolidado nº ${dfd.numero}/${dfd.ano} (${demandas.length} demanda(s): ${setores.join(', ')})` +
            (alerta ? `. ${alerta}` : ''),
          dados_depois: { dfd_consolidado_id: dfd.id, demandas: demandas.map((d) => d.id), alertas },
          contexto: atorAcesso?.usuarioId ? { usuario_id: atorAcesso.usuarioId } : undefined,
        })
        .catch(() => undefined);
    } catch (eCapturado: unknown) {
      const e = comoErro(eCapturado);
      this.logger.warn(`DFD automático do DFD consolidado não gerado: ${e.message}`);
    }

    // 8. Processo recarregado com os itens
    const resultado = await this.licitacaoRepository.findOne({ where: { id: licitacaoSalva.id }, relations: ['itens'] });
    return { licitacao: resultado!, alertas, alerta };
  }

  async findAll(filtros?: {
    fase?: FaseLicitacao;
    situacao?: SituacaoLicitacao;
    orgao_id?: string;
    demanda_id?: string;
  }): Promise<Licitacao[]> {
    const where: any = {};
    // Filtro legado ?fase=REVOGADO etc. = filtro por situação (E1)
    const situacaoLegada = filtros?.fase ? MAPA_SITUACAO_LEGADA[filtros.fase] : undefined;
    if (situacaoLegada) where.situacao = situacaoLegada;
    else if (filtros?.fase) where.fase = filtros.fase;
    if (filtros?.situacao) where.situacao = filtros.situacao;
    if (filtros?.orgao_id) where.orgao_id = filtros.orgao_id;
    if (filtros?.demanda_id) where.demanda_id = filtros.demanda_id;

    const lista = await this.licitacaoRepository.find({
      where,
      relations: ['orgao'],
      order: { created_at: 'DESC' }
    });
    // Estado da compra no PNCP vem da fila (E9); mesmos campos para as telas
    return aplicarEstadoCompraPncp(this.dataSource.manager, lista);
  }

  async findOne(id: string): Promise<any> {
    const licitacao = await this.licitacaoRepository.findOne({
      where: { id },
      relations: ['orgao', 'itens', 'itens.item_pca', 'itens.item_pca.pca', 'lotes', 'lotes.item_pca', 'lotes.item_pca.pca', 'item_pca', 'item_pca.pca']
    });
    if (!licitacao) {
      throw new NotFoundException(`Licitação com ID ${id} não encontrada`);
    }
    
    // Formatar datas do cronograma como strings ISO locais (sem conversão UTC)
    // Isso garante que o frontend receba exatamente o horário de Brasília
    const resultado = {
      ...licitacao,
      data_publicacao_edital: formatarDataLocal(licitacao.data_publicacao_edital),
      data_limite_impugnacao: formatarDataLocal(licitacao.data_limite_impugnacao),
      data_inicio_acolhimento: formatarDataLocal(licitacao.data_inicio_acolhimento),
      data_fim_acolhimento: formatarDataLocal(licitacao.data_fim_acolhimento),
      data_abertura_sessao: formatarDataLocal(licitacao.data_abertura_sessao),
    };
    
    return resultado;
  }

  /**
   * Leitura para as telas: `findOne` + estado da compra no PNCP vindo da fila
   * (E9). Não usar o retorno para gravar (o `update` usa `findOne`).
   */
  async findOneParaLeitura(id: string): Promise<any> {
    const resultado = await this.findOne(id);
    await aplicarEstadoCompraPncp(this.dataSource.manager, [resultado]);
    // Pregoeiro: usuário vinculado é a fonte; texto livre só sem vínculo (E9)
    resultado.pregoeiro_nome = await nomeDoPregoeiroSql(this.dataSource.manager, id);
    return resultado;
  }

  async update(id: string, updateData: Partial<CreateLicitacaoDto> & { itens?: any[]; lotes?: any[] }): Promise<Licitacao> {
    const licitacao = await this.findOne(id);
    
    // Não permite alterar se já está em fase externa avançada
    const fasesProtegidas = [
      FaseLicitacao.EM_DISPUTA,
      FaseLicitacao.JULGAMENTO,
      FaseLicitacao.HABILITACAO,
      FaseLicitacao.ADJUDICACAO,
      FaseLicitacao.HOMOLOGACAO,
    ];

    if (fasesProtegidas.includes(licitacao.fase)) {
      throw new BadRequestException('Não é possível alterar licitação nesta fase');
    }
    if (SITUACOES_TERMINAIS.includes(licitacao.situacao)) {
      throw new ConflictException(`Licitação encerrada (situação ${licitacao.situacao}) — não pode ser alterada`);
    }

    // Extrair itens e lotes do updateData. Estado do processo (fase,
    // situação, fase anterior) só muda por ato do TransicoesService — o corpo
    // da edição não altera (sem ValidationPipe com whitelist, filtramos aqui).
    const { itens, lotes, ...dadosLicitacao } = updateData as any;
    // Ignorados já aqui (antes da conferência do edital publicado, que não deve
    // acusá-los); `fase_interna_concluida` também: só o ato CONCLUIR_FASE_INTERNA
    // (gate documental, E1.7) ou o PUBLICAR a marcam.
    // `dispensa_com_lances`: só pela escolha própria (PUT /fase-interna/:id/modo-disputa),
    // que confere a fase, registra quem escolheu e não deixa mudar depois de publicar.
    // `fase_interna_externa`: só pela entrada/juntada da fase interna feita fora.
    for (const campo of ['id', 'fase', 'situacao', 'fase_anterior', 'fase_interna_concluida', 'data_homologacao', 'data_adjudicacao', 'dispensa_com_lances', 'fase_interna_externa']) {
      delete dadosLicitacao[campo];
    }

    // Campos tipados (datas, números, UUID, booleanos): vazio → NULL; inválido → 400.
    // O corpo não passa por validação de classe (Partial<DTO>): sem isto, a data
    // vazia do cronograma virava "Invalid Date" no banco → 500 (homologação E1).
    const invalidos = normalizarCamposTipados(
      dadosLicitacao,
      colunasTipadasDosMetadados((this.licitacaoRepository.metadata?.columns ?? []) as any),
    );
    if (invalidos.length) {
      throw new BadRequestException({ message: mensagemCamposInvalidos(invalidos), campos_invalidos: invalidos });
    }

    // Pregoeiro/agente (E9): só usuário ATIVO do próprio órgão da licitação
    // (a tela escolhe da lista de usuários; id de outro órgão → 400).
    if (dadosLicitacao.pregoeiro_id !== undefined) {
      if (!dadosLicitacao.pregoeiro_id) {
        dadosLicitacao.pregoeiro_id = null;
      } else {
        const [usuario] = await this.licitacaoRepository.query(
          `SELECT id FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2 AND ativo = true`,
          [String(dadosLicitacao.pregoeiro_id), String(licitacao.orgao_id)],
        );
        if (!usuario) throw new BadRequestException('Pregoeiro/agente de contratação deve ser um usuário ativo do órgão');
      }
    }

    // EDITAL PUBLICADO (plano E7a — Lei 14.133/2021, art. 55 §1º): regra do
    // edital (cronograma, critério, objeto, itens...) só muda pela RETIFICAÇÃO
    // (nova versão do edital, reabertura de prazos quando afeta as propostas).
    // Campos internos (equipe, observações, PNCP) continuam livres; o
    // formulário inteiro reenviado sem mudança passa.
    // Processo antigo sem o campo gravado: o formulário devolve o fundamento
    // EFETIVO (padrão) — não é alteração do enquadramento.
    if (!licitacao.fundamento_legal && dadosLicitacao.fundamento_legal && dadosLicitacao.fundamento_legal === fundamentoEfetivo(licitacao as any)) {
      licitacao.fundamento_legal = dadosLicitacao.fundamento_legal;
    }
    if (!ehFaseInterna(licitacao.fase)) {
      const alterados = camposDoEditalAlterados(licitacao, dadosLicitacao);
      if (itens !== undefined && itensAlterados(licitacao.itens ?? [], itens)) alterados.push('itens');
      if (lotes !== undefined && Array.isArray(lotes) && lotes.length !== (licitacao.lotes ?? []).length) alterados.push('lotes');
      if (alterados.length) {
        throw new ConflictException({
          message:
            `Edital já publicado: ${alterados.join(', ')} só se altera(m) por RETIFICAÇÃO do edital (art. 55, §1º, Lei 14.133/2021) — ` +
            `use "Retificar edital" (POST /publicacao/licitacao/:id/retificar).`,
          campos: alterados,
        });
      }
    }

    // Fundamento legal (fonte única): informado → tem de caber na modalidade
    // final; modalidade/tipo trocados sem informar → volta ao padrão se o
    // gravado deixou de caber.
    {
      const modalidadeFinal = dadosLicitacao.modalidade ?? licitacao.modalidade;
      const tipoFinal = dadosLicitacao.tipo_contratacao ?? licitacao.tipo_contratacao;
      if (dadosLicitacao.fundamento_legal !== undefined) {
        const vedacao = motivoFundamentoInvalido(modalidadeFinal, dadosLicitacao.fundamento_legal);
        if (vedacao) throw new BadRequestException(vedacao);
        dadosLicitacao.fundamento_legal = dadosLicitacao.fundamento_legal || fundamentoPadrao(modalidadeFinal, tipoFinal);
      } else if (motivoFundamentoInvalido(modalidadeFinal, licitacao.fundamento_legal) || !licitacao.fundamento_legal) {
        dadosLicitacao.fundamento_legal = fundamentoPadrao(modalidadeFinal, tipoFinal);
      } else if (
        dadosLicitacao.tipo_contratacao !== undefined &&
        licitacao.fundamento_legal === fundamentoPadrao(licitacao.modalidade, licitacao.tipo_contratacao)
      ) {
        // estava no padrão (ex.: 75, II) e o tipo mudou (obra) → acompanha o padrão (75, I)
        dadosLicitacao.fundamento_legal = fundamentoPadrao(modalidadeFinal, tipoFinal);
      }
    }

    // Natureza do objeto (art. 6º XIII/XIV — prazo do art. 55, II; E7a)
    if (dadosLicitacao.natureza_objeto !== undefined) {
      dadosLicitacao.natureza_objeto = this.naturezaValida(dadosLicitacao.natureza_objeto);
    }

    // Atualizar dados da licitação
    // Modo de disputa × critério (Lei 14.133 art. 56 §§1º e 2º) — combinação FINAL
    const vedacaoModo = motivoModoCriterioInvalido(
      dadosLicitacao.modo_disputa ?? licitacao.modo_disputa,
      dadosLicitacao.criterio_julgamento ?? licitacao.criterio_julgamento,
    );
    if (vedacaoModo) throw new BadRequestException(vedacaoModo);
    const vedacaoModalidade = motivoModalidadeCriterioInvalido(
      dadosLicitacao.modalidade ?? licitacao.modalidade,
      dadosLicitacao.criterio_julgamento ?? licitacao.criterio_julgamento,
      dadosLicitacao.modo_disputa ?? licitacao.modo_disputa,
    );
    if (vedacaoModalidade) throw new BadRequestException(vedacaoModalidade);
    // Inversão de fases (art. 17 §1º; plano E4): só concorrência, definida antes da publicação
    if (dadosLicitacao.inversao_fases !== undefined) {
      dadosLicitacao.inversao_fases = dadosLicitacao.inversao_fases === true || dadosLicitacao.inversao_fases === 'true';
    }
    const vedacaoInversao = motivoInversaoInvalida({
      inversaoFinal: !!(dadosLicitacao.inversao_fases ?? licitacao.inversao_fases),
      inversaoAtual: !!licitacao.inversao_fases,
      modalidadeFinal: dadosLicitacao.modalidade ?? licitacao.modalidade,
      faseAtual: licitacao.fase,
    });
    if (vedacaoInversao) {
      if (vedacaoInversao.status === 409) throw new ConflictException(vedacaoInversao.mensagem);
      throw new BadRequestException(vedacaoInversao.mensagem);
    }
    // Benefício ME/EPP (LC 123 art. 48): fonte da verdade = tipo_beneficio_mpe; legado derivado
    try {
      Object.assign(dadosLicitacao, normalizarBeneficioMpeLicitacao(dadosLicitacao, licitacao as any));
    } catch (eCapturado: unknown) {
      const e = comoErro(eCapturado);
      throw new BadRequestException(e?.message ?? 'Benefício ME/EPP inválido');
    }
    // Nº do processo administrativo: vazio = mantém; outro = único no órgão (409)
    if (dadosLicitacao.numero_processo !== undefined) {
      const novo = this.numeros.normalizar(dadosLicitacao.numero_processo);
      if (!novo || novo === licitacao.numero_processo) delete dadosLicitacao.numero_processo;
      else {
        await this.numeros.exigirLivre(licitacao.orgao_id, novo, undefined, licitacao.id);
        dadosLicitacao.numero_processo = novo;
      }
    }
    const numeroMudou = dadosLicitacao.numero_processo !== undefined;
    const objetoMudou = dadosLicitacao.objeto !== undefined && dadosLicitacao.objeto !== licitacao.objeto;
    Object.assign(licitacao, dadosLicitacao);
    try {
      await this.licitacaoRepository.save(licitacao);
    } catch (e) {
      throw this.numeros.traduzirViolacao(e, licitacao.numero_processo);
    }
    // Processo eletrônico: a autuação acompanha o nº e o objeto da licitação
    if (numeroMudou) await this.processos.atualizarNumeroDaLicitacao(licitacao.id, licitacao.numero_processo);
    if (objetoMudou) await this.processos.atualizarObjetoDaLicitacao(licitacao.id, licitacao.objeto);

    // Função auxiliar para validar UUID
    const isValidUUID = (str: string): boolean => {
      if (!str) return false;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      return uuidRegex.test(str);
    };

    // Salvar itens se fornecidos
    if (itens && Array.isArray(itens)) {
      // Buscar itens existentes
      const itensExistentes = await this.itemRepository.find({ where: { licitacao_id: id } });
      
      // Verificar se há propostas vinculadas aos itens (via proposta_itens)
      // Se houver, não podemos deletar - apenas atualizar
      let temPropostasVinculadas = false;
      if (itensExistentes.length > 0) {
        const idsItens = itensExistentes.map(i => i.id);
        const countPropostas = await this.itemRepository.manager
          .createQueryBuilder()
          .select('COUNT(*)', 'count')
          .from('proposta_itens', 'pi')
          .where('pi.item_licitacao_id IN (:...ids)', { ids: idsItens })
          .getRawOne();
        temPropostasVinculadas = parseInt(countPropostas?.count || '0') > 0;
      }
      
      if (temPropostasVinculadas) {
        // Há propostas vinculadas - atualizar itens existentes ao invés de deletar/recriar
        for (let i = 0; i < itens.length; i++) {
          const item = itens[i];
          const valorUnitario = item.valor_unitario || item.valor_unitario_estimado || 0;
          const quantidade = item.quantidade || 1;
          const loteId = isValidUUID(item.lote_id) ? item.lote_id : undefined;
          const numeroItem = item.numero || item.numero_item || (i + 1);
          
          // Buscar item existente pelo número ou id
          let itemExistente = itensExistentes.find(ie => 
            ie.id === item.id || ie.numero_item === numeroItem
          );
          
          if (itemExistente) {
            // Atualizar item existente
            Object.assign(itemExistente, {
              numero_item: numeroItem,
              descricao_resumida: item.descricao || item.descricao_resumida || itemExistente.descricao_resumida,
              descricao_detalhada: item.descricao_detalhada ?? itemExistente.descricao_detalhada,
              quantidade: quantidade,
              unidade_medida: item.unidade || item.unidade_medida || itemExistente.unidade_medida,
              valor_unitario_estimado: valorUnitario,
              valor_total_estimado: quantidade * valorUnitario,
              codigo_catalogo: item.codigo_catalogo || item.codigo_catmat || item.codigo_catser,
              codigo_catmat: item.codigo_catmat,
              codigo_catser: item.codigo_catser,
              codigo_pdm: item.codigo_pdm,
              nome_pdm: item.nome_pdm,
              classe_catalogo: item.classe_catalogo,
              codigo_grupo: item.codigo_grupo,
              nome_grupo: item.nome_grupo,
              lote_id: loteId,
              numero_lote: item.lote_numero || item.numero_lote,
              item_pca_id: isValidUUID(item.item_pca_id) ? item.item_pca_id : undefined,
              sem_pca: item.sem_pca || false,
              justificativa_sem_pca: item.justificativa_sem_pca,
              tipo_participacao: item.tipo_participacao || 'AMPLA',
              ...(item.tipo_item === 'MATERIAL' || item.tipo_item === 'SERVICO' ? { tipo_item: item.tipo_item } : {}),
              margem_preferencia: item.margem_preferencia || false,
              percentual_margem: item.percentual_margem,
              status: item.status || 'ATIVO',
              observacoes: item.observacoes,
            });
            await this.itemRepository.save(itemExistente);
          }
          // Nota: não criamos novos itens quando há propostas vinculadas
          // para evitar inconsistências
        }
      } else {
        // Não há propostas vinculadas - comportamento original (deletar e recriar)
        await this.itemRepository.delete({ licitacao_id: id });
        
        // Criar novos itens com mapeamento de campos
        for (let i = 0; i < itens.length; i++) {
          const item = itens[i];
          const valorUnitario = item.valor_unitario || item.valor_unitario_estimado || 0;
          const quantidade = item.quantidade || 1;
          
          // Validar lote_id - só usar se for UUID válido
          const loteId = isValidUUID(item.lote_id) ? item.lote_id : undefined;
          
          const novoItem = this.itemRepository.create({
            licitacao_id: id,
            numero_item: item.numero || item.numero_item || (i + 1),
            descricao_resumida: item.descricao || item.descricao_resumida || 'Item sem descrição',
            descricao_detalhada: item.descricao_detalhada,
            quantidade: quantidade,
            unidade_medida: item.unidade || item.unidade_medida || 'UNIDADE',
            valor_unitario_estimado: valorUnitario,
            valor_total_estimado: quantidade * valorUnitario,
            // Dados do Catálogo de Compras (compras.gov.br)
            codigo_catalogo: item.codigo_catalogo || item.codigo_catmat || item.codigo_catser,
            codigo_catmat: item.codigo_catmat,
            codigo_catser: item.codigo_catser,
            codigo_pdm: item.codigo_pdm,
            nome_pdm: item.nome_pdm,
            classe_catalogo: item.classe_catalogo,
            codigo_grupo: item.codigo_grupo,
            nome_grupo: item.nome_grupo,
            // Vinculação com lote e PCA
            lote_id: loteId,
            numero_lote: item.lote_numero || item.numero_lote,
            item_pca_id: isValidUUID(item.item_pca_id) ? item.item_pca_id : undefined,
            sem_pca: item.sem_pca || false,
            justificativa_sem_pca: item.justificativa_sem_pca,
            tipo_participacao: item.tipo_participacao || 'AMPLA',
            ...(item.tipo_item === 'MATERIAL' || item.tipo_item === 'SERVICO' ? { tipo_item: item.tipo_item } : {}),
            margem_preferencia: item.margem_preferencia || false,
            percentual_margem: item.percentual_margem,
            status: item.status || 'ATIVO',
            observacoes: item.observacoes,
          });
          await this.itemRepository.save(novoItem);
        }
      }
    }

    // Salvar lotes se fornecidos (upsert por id/número + vínculo dos itens pelo
    // número do lote — antes, apagar e recriar os lotes soltava os itens: E2)
    if (lotes && Array.isArray(lotes)) {
      await this.salvarLotesDaEdicao(id, lotes);
    }

    // Retornar licitação atualizada com itens
    const result = await this.licitacaoRepository.findOne({
      where: { id },
      relations: ['itens', 'lotes']
    });
    return result!;
  }

  /**
   * Lotes enviados pela edição da licitação (wizard): o frontend identifica o
   * lote pelo NÚMERO (ids temporários) e o item aponta para o lote pelo
   * `numero_lote`. Upsert por id (se for de um lote desta licitação) ou por
   * número; lotes que saíram da lista são apagados; depois cada item é ligado
   * ao lote do seu `numero_lote` (um item pertence a no máximo um lote — é
   * uma coluna só). Campos de sistema (estado da disputa, totais) não vêm do
   * corpo; o benefício ME/EPP do lote é normalizado (tipo_beneficio_mpe).
   */
  private async salvarLotesDaEdicao(licitacaoId: string, lotes: any[]): Promise<void> {
    const existentes = await this.loteRepository.find({ where: { licitacao_id: licitacaoId } });
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const numeros = new Set<number>();
    const mantidos = new Set<string>();
    for (const l of lotes) {
      const numero = Number(l?.numero);
      if (!Number.isInteger(numero) || numero < 1) throw new BadRequestException('Lote sem número válido');
      if (numeros.has(numero)) throw new BadRequestException(`Número de lote repetido: ${numero}`);
      numeros.add(numero);
      const dados: Record<string, any> = {
        numero,
        descricao: String(l.descricao ?? '').trim() || `Lote ${numero}`,
        item_pca_id: typeof l.item_pca_id === 'string' && uuid.test(l.item_pca_id) ? l.item_pca_id : null,
        sem_pca: !!l.sem_pca,
        justificativa_sem_pca: l.justificativa_sem_pca ?? null,
        criterio_julgamento: l.criterio_julgamento ?? null,
        observacoes: l.observacoes ?? null,
        ...normalizarBeneficioMpeLote(l),
      };
      const atual =
        (typeof l.id === 'string' && uuid.test(l.id) ? existentes.find((e) => e.id === l.id) : undefined) ??
        existentes.find((e) => e.numero === numero && !mantidos.has(e.id));
      if (atual) {
        await this.loteRepository.update(atual.id, dados);
        mantidos.add(atual.id);
      } else {
        const novo = await this.loteRepository.save(this.loteRepository.create({ ...dados, licitacao_id: licitacaoId } as any));
        mantidos.add((novo as any).id);
      }
    }
    const remover = existentes.filter((e) => !mantidos.has(e.id)).map((e) => e.id);
    if (remover.length) await this.loteRepository.delete(remover);

    // Itens ↔ lotes pelo número do lote (item com número de lote inexistente
    // fica solto; item sem número de lote mantém o vínculo que tinha)
    const atuais = await this.loteRepository.find({ where: { licitacao_id: licitacaoId } });
    await this.itemRepository
      .createQueryBuilder()
      .update()
      .set({ lote_id: null as any })
      .where('licitacao_id = :licitacaoId AND numero_lote IS NOT NULL', { licitacaoId })
      .andWhere(atuais.length ? 'numero_lote NOT IN (:...numeros)' : '1=1', { numeros: atuais.map((l) => l.numero) })
      .execute();
    for (const lote of atuais) {
      await this.itemRepository.update({ licitacao_id: licitacaoId, numero_lote: lote.numero }, { lote_id: lote.id });
      const itens = await this.itemRepository.find({ where: { lote_id: lote.id }, select: ['id', 'valor_total_estimado'] });
      await this.loteRepository.update(lote.id, {
        quantidade_itens: itens.length,
        valor_total_estimado: itens.reduce((acc, i) => acc + (Number(i.valor_total_estimado) || 0), 0),
      });
    }
  }

  // === GESTÃO DE FASES (E1: atos nomeados do TransicoesService) ===

  /**
   * Compatibilidade com o PUT avancar-fase da tela antiga: executa o ATO
   * PRINCIPAL da fase atual (ex.: ACOLHIMENTO → encerrar acolhimento,
   * ADJUDICACAO → homologar). Não existe mais "próxima fase" genérica: cada
   * passo é um ato com as suas pré-condições.
   */
  async avancarFase(id: string, observacao: string | undefined, ator: AtorTransicao, atorJwt?: Ator): Promise<Licitacao> {
    const { licitacao, def } = await this.transicoes.atoPrincipalDe(id);
    if (!def) {
      throw new ConflictException(
        `Não há ato de avanço a partir da fase ${ROTULO_FASE[licitacao.fase] ?? licitacao.fase}` +
          (licitacao.situacao && licitacao.situacao !== SituacaoLicitacao.ATIVA ? ` (licitação ${licitacao.situacao.toLowerCase()})` : '') +
          '.',
      );
    }
    await this.executarAto(id, def.ato, { motivo: observacao }, ator, atorJwt);
    return this.carregarBruta(id);
  }

  /**
   * Compatibilidade com o PUT retroceder-fase: só há retorno onde a lei/o rito
   * prevê (devolver etapa interna; voltar ao julgamento por inabilitação ou
   * recurso provido) — sempre com motivo.
   */
  async retrocederFase(id: string, motivo: string, ator: AtorTransicao): Promise<Licitacao> {
    const { licitacao, def } = await this.transicoes.atoDeRetornoDe(id);
    if (!def) {
      throw new ConflictException(
        `Não há ato de retorno a partir da fase ${ROTULO_FASE[licitacao.fase] ?? licitacao.fase} — use suspender, revogar ou anular.`,
      );
    }
    return this.transicoes.executar(id, def.ato, { ator, motivo });
  }

  /**
   * Executa um ATO NOMEADO (POST /licitacoes/:id/atos/:ato e avancar-fase).
   * Atos com efeitos próprios (homologar, julgar dispensa, suspender...) vão
   * ao método que cuida dos efeitos; os demais, direto ao TransicoesService.
   */
  async executarAto(
    id: string,
    ato: AtoLicitacao,
    corpo: { motivo?: string; dados?: Record<string, any> },
    ator: AtorTransicao,
    atorJwt?: Ator,
  ): Promise<{ licitacao: Licitacao; resultado?: any }> {
    const motivo = corpo?.motivo;
    switch (ato) {
      case AtoLicitacao.PUBLICAR:
        throw new BadRequestException(
          'Publicar exige o cronograma do edital — use PUT /licitacoes/:id/publicar-edital.',
        );
      case AtoLicitacao.REGISTRAR_RESULTADO_EXTERNO:
        throw new BadRequestException(
          'Registrar resultado externo exige os vencedores por item — use POST /licitacoes/:id/resultado-externo.',
        );
      case AtoLicitacao.CANCELAR_PUBLICACAO:
        throw new BadRequestException('A publicação é cancelada pela exclusão da compra no PNCP.');
      case AtoLicitacao.CONFIRMAR_DIVULGACAO:
        throw new BadRequestException(
          'A divulgação oficial é confirmada pelo PNCP (número de controle da compra devolvido pela fila) — ou, para órgão sem PNCP, pelo registro da publicação no diário oficial: POST /publicacao/licitacao/:id/divulgacao-oficial.',
        );
      // Publicação (E7a): atos com arquivo/prazo próprios
      case AtoLicitacao.RETIFICAR_EDITAL:
        throw new BadRequestException('Retificar o edital exige a nova versão do arquivo — use POST /publicacao/licitacao/:id/retificar.');
      case AtoLicitacao.INTENCAO_REVOGAR:
      case AtoLicitacao.INTENCAO_ANULAR:
        throw new BadRequestException('A intenção de revogar/anular abre o prazo de manifestação — use POST /publicacao/licitacao/:id/intencao-extincao.');
      // Credenciamento (E7b): atos com regra própria (habilitação, distribuição, contrato)
      case AtoLicitacao.DEFERIR_CREDENCIAMENTO:
      case AtoLicitacao.INDEFERIR_CREDENCIAMENTO:
      case AtoLicitacao.DECIDIR_RECURSO_CREDENCIAMENTO:
      case AtoLicitacao.CONTRATAR_CREDENCIADO:
      case AtoLicitacao.DESCREDENCIAR:
        throw new BadRequestException('Ato do credenciamento — use as rotas de /credenciamento (inscrições, contratações, descredenciamento).');
      // Modalidades especiais (E7c): atos com arquivo/regra própria
      case AtoLicitacao.JULGAR_CONCURSO:
        throw new BadRequestException('O julgamento do concurso publica as notas da banca e revela a autoria — use POST /concurso/licitacao/:id/julgar.');
      case AtoLicitacao.CONCLUIR_DIALOGO:
      case AtoLicitacao.ABRIR_FASE_COMPETITIVA:
        throw new BadRequestException('Ato do diálogo competitivo — use as rotas de /dialogo-competitivo (conclusão motivada e edital da fase competitiva).');
      // Resultado único (E6): adjudicar/homologar só pelo ResultadoService
      // (valor homologado calculado — nunca do corpo; autoridade do token).
      case AtoLicitacao.HOMOLOGAR: {
        if (!atorJwt) throw new BadRequestException('Homologar: use POST /resultado/licitacao/:id/homologar.');
        const resultado = await this.resultado.homologar(id, atorJwt);
        return { licitacao: await this.carregarBruta(id), resultado };
      }
      case AtoLicitacao.ADJUDICAR:
      case AtoLicitacao.DECIDIR_RECURSOS: {
        if (!atorJwt) throw new BadRequestException('Adjudicar: use POST /resultado/licitacao/:id/adjudicar.');
        const resultado = await this.resultado.adjudicar(id, atorJwt, { motivo });
        return { licitacao: await this.carregarBruta(id), resultado };
      }
      case AtoLicitacao.JULGAR_DISPENSA: {
        const resultado = await this.julgarDispensa(id, ator);
        return { licitacao: await this.carregarBruta(id), resultado };
      }
      case AtoLicitacao.SUSPENDER:
        return { licitacao: await this.suspender(id, motivo as string, ator) };
      case AtoLicitacao.RETOMAR:
        return { licitacao: await this.retomar(id, corpo?.dados, ator) };
      case AtoLicitacao.REVOGAR:
        return { licitacao: await this.revogar(id, motivo as string, ator) };
      case AtoLicitacao.ANULAR:
        return { licitacao: await this.anular(id, motivo as string, ator) };
      default:
        return {
          licitacao: await this.transicoes.executar(id, ato, { ator, motivo, dados: corpo?.dados }),
        };
    }
  }

  /** Atos disponíveis agora (com pendências) — botões do cockpit. */
  async atosDisponiveis(id: string) {
    return this.transicoes.atosDisponiveis(id);
  }

  /**
   * Classificação por item da dispensa (tela do processo — julgamento): valor
   * final de cada fornecedor = menor entre a proposta e os próprios lances
   * (a mesma regra do julgamento). Durante o recebimento, nada (sigilo — Lei
   * 14.133 art. 13 par. único, I; IN SEGES 67/2021 art. 13).
   */
  async classificacaoDispensa(id: string) {
    const licitacao = await this.findOne(id);
    if (licitacao.modalidade !== ModalidadeLicitacao.DISPENSA_ELETRONICA) {
      throw new BadRequestException('Classificação por item disponível apenas para a dispensa eletrônica');
    }
    const corte = licitacao.data_fim_acolhimento || licitacao.data_abertura_sessao;
    if (!corte || new Date() < new Date(corte)) return { em_sigilo: true, itens: [] };
    const linhas = await this.dataSource.query(
      `SELECT pi.item_licitacao_id::text AS item_licitacao_id, pi.valor_unitario, p.id AS proposta_id,
              p.fornecedor_id::text AS fornecedor_id, f.razao_social
       FROM proposta_itens pi
       JOIN propostas p ON p.id = pi.proposta_id
       JOIN fornecedores f ON f.id = p.fornecedor_id
       WHERE p.licitacao_id = $1
         AND p.status NOT IN ('RASCUNHO','DESCLASSIFICADA','CANCELADA')
       ORDER BY pi.item_licitacao_id, pi.valor_unitario ASC, p.data_envio ASC NULLS LAST`,
      [id],
    );
    // Sem etapa de lances (Entrega 5): só as propostas; empate → a registrada primeiro (ordem da consulta)
    const lances = dispensaSemLances(licitacao) ? [] : await this.janelaDispensa.lancesDaJanela(id);
    const porItem = classificacaoPorItem(valoresFinaisDispensa(linhas, lances as any));
    const itens = await this.itemRepository.find({ where: { licitacao_id: id }, order: { numero_item: 'ASC' } });
    return {
      em_sigilo: false,
      itens: itens.map((i) => ({
        item_licitacao_id: i.id,
        numero_item: i.numero_item,
        descricao: (i as any).descricao_resumida || (i as any).descricao,
        status: i.status,
        fornecedor_vencedor_id: i.fornecedor_vencedor_id ?? null,
        classificacao: porItem.get(String(i.id)) ?? [],
      })),
    };
  }

  /** Checklist de pré-publicação (Etapa B da tela do processo). */
  async conferenciaPrePublicacao(id: string) {
    return this.transicoes.conferenciaPrePublicacao(id);
  }

  /** Histórico de transições (GET /licitacoes/:id/transicoes). */
  /** Histórico LEGÍVEL: rótulos dos atos/fases e nome de quem praticou (campos originais preservados). */
  async historicoTransicoes(id: string): Promise<Array<Record<string, any>>> {
    return this.transicoes.historicoLegivel(id);
  }

  /** Suspensa/encerrada (E1): nenhum ato de disputa acontece. */
  private exigirAtiva(licitacao: { situacao?: SituacaoLicitacao | null }, acao: string): void {
    if (licitacao.situacao && licitacao.situacao !== SituacaoLicitacao.ATIVA) {
      throw new ConflictException(`Licitação ${licitacao.situacao.toLowerCase()} — não é possível ${acao}`);
    }
  }

  /** Licitação sem formatação de datas (resposta dos atos). */
  private async carregarBruta(id: string): Promise<Licitacao> {
    const lic = await this.licitacaoRepository.findOne({ where: { id } });
    if (!lic) throw new NotFoundException(`Licitação com ID ${id} não encontrada`);
    return lic;
  }

  async publicarEdital(
    id: string,
    dados: PublicarEditalDto,
    ator: AtorTransicao = atorSistema('api'),
  ): Promise<Licitacao> {
    // Ato PUBLICAR: fase APROVACAO_INTERNA; contratação direta exige a
    // instrução do Art. 72 (DFD, estimativa e autorização — igual ao card de
    // pendências do Compras.gov); dispensa exige 3 dias úteis de propostas
    // (art. 75 §3º). O cronograma é gravado pelo efeito do ato.
    const salva = await this.transicoes.executar(id, AtoLicitacao.PUBLICAR, {
      ator,
      dados: { ...dados },
    });
    const licitacao = salva;

    // Avisa o setor requisitante da demanda de origem (fire-and-forget)
    this.notificarDemandaOrigem(
      licitacao,
      TipoNotificacao.DEMANDA_EM_CONTRATACAO,
      'Sua demanda entrou em contratação 📢',
      `O processo ${licitacao.numero_processo} foi divulgado — prazo de propostas aberto até ${new Date(dados.data_fim_acolhimento || licitacao.data_fim_acolhimento).toLocaleString('pt-BR')}.`,
    ).catch(() => undefined);

    // PNCP (E7): o ato PUBLICAR enfileira compra + itens + edital/aviso para
    // TODAS as modalidades (PncpFilaService.aoTransitar) — sem fire-and-forget.

    return salva;
  }

  async iniciarDisputa(id: string, ator: AtorTransicao = atorSistema('api')): Promise<Licitacao> {
    // Ato INICIAR_DISPUTA: ANALISE_PROPOSTAS, abertura alcançada, propostas aptas
    return this.transicoes.executar(id, AtoLicitacao.INICIAR_DISPUTA, { ator });
  }

  async encerrarDisputa(id: string, ator: AtorTransicao = atorSistema('api')): Promise<Licitacao> {
    // Ato ENCERRAR_DISPUTA: EM_DISPUTA → JULGAMENTO (data_fim_disputa)
    return this.transicoes.executar(id, AtoLicitacao.ENCERRAR_DISPUTA, { ator });
  }

  // ============================================================================
  // DEGRAU 1 — COCKPIT DO PROCESSO + SELEÇÃO EXTERNA
  // ============================================================================

  /**
   * Visão agregada do processo de contratação inteiro (o "fio condutor"):
   * demanda/PCA → fase interna (documentos) → seleção → contratos → atas.
   * Alimenta a tela /orgao/processos/[id].
   */
  /** Quem conduz / é a autoridade do processo (atos de exclusão e extinção — homologação multiusuário). */
  papelNoProcesso(ator: Ator, licitacaoId: string): Promise<PapelNoProcesso> {
    return papelNoProcesso(this.dataSource, ator, licitacaoId);
  }

  exigirQuemConduz(ator: Ator, licitacaoId: string, acao: string): Promise<void> {
    return exigirQuemConduz(this.dataSource, ator, licitacaoId, acao);
  }

  exigirExtincao(ator: Ator, licitacaoId: string): Promise<void> {
    return exigirExtincao(this.dataSource, ator, licitacaoId);
  }

  async processoCompleto(id: string, ator?: Ator): Promise<any> {
    const licitacao = await this.licitacaoRepository.findOne({
      where: { id },
      relations: ['item_pca', 'demanda'],
    });
    if (!licitacao) throw new NotFoundException('Processo não encontrado');

    const itens = await this.itemRepository.find({
      where: { licitacao_id: id },
      order: { numero_item: 'ASC' },
    });

    const [documentos, contratos, atas, propostas] = await Promise.all([
      this.dataSource.query(
        `SELECT id, tipo, titulo, status, origem, created_at
         FROM documentos_fase_interna WHERE licitacao_id = $1 ORDER BY created_at ASC`,
        [id],
      ),
      this.dataSource.query(
        `SELECT c.id, c.numero_contrato, c.fornecedor_razao_social, c.valor_global, c.status,
                c.data_vigencia_inicio, c.data_vigencia_fim, c.data_assinatura,
                c.arquivo_contrato, c.documento_assinatura_id,
                da.status AS assinatura_status, da.arquivo_assinado_url,
                (SELECT COUNT(*) FROM signatarios_documento s
                  WHERE s.documento_id = da.id AND s.status = 'ASSINADO') AS assinados,
                (SELECT COUNT(*) FROM signatarios_documento s
                  WHERE s.documento_id = da.id) AS total_signatarios,
                (SELECT string_agg(s.nome || CASE WHEN s.status = 'ASSINADO' THEN ' ✓' ELSE ' ⏳' END, ' · ' ORDER BY s.created_at)
                  FROM signatarios_documento s WHERE s.documento_id = da.id) AS signatarios_resumo
         FROM contratos c
         LEFT JOIN documentos_assinatura da ON da.id = c.documento_assinatura_id
         WHERE c.licitacao_id = $1 ORDER BY c.numero_contrato ASC`,
        [id],
      ),
      this.dataSource.query(
        `SELECT id, numero_ata, fornecedor_razao_social, valor_total, status
         FROM atas_registro_preco WHERE licitacao_id = $1 ORDER BY numero_ata ASC`,
        [id],
      ),
      this.dataSource.query(
        `SELECT p.id, p.status, p.valor_total_proposta, p.data_envio, f.razao_social
         FROM propostas p JOIN fornecedores f ON f.id = p.fornecedor_id
         WHERE p.licitacao_id = $1 AND p.status <> 'RASCUNHO'
         ORDER BY p.valor_total_proposta ASC NULLS LAST`,
        [id],
      ),
    ]);

    // Status das publicações no PNCP (D5): compra, itens, resultados…
    const pncp = await this.dataSource.query(
      // Fila do PNCP (E7): uma linha por operação, com próximo envio e o erro do PNCP
      `SELECT id, tipo, status, numero_controle_pncp, erro_mensagem, tentativas, max_tentativas, proximo_envio, enviado_em, updated_at
       FROM pncp_sync WHERE licitacao_id = $1 AND tipo::text <> 'PCA' ORDER BY ordem, created_at LIMIT 30`,
      [id],
    );

    // Dados da contratação (cockpit — Etapa B): compra no PNCP, agente e autoridade
    const compraPncp = (await estadoCompraPncp(this.dataSource.manager, [licitacao.id])).get(licitacao.id);
    const agente = await nomeDoPregoeiroSql(this.dataSource.manager, licitacao.id);
    const autoridade = await this.autoridadeDoProcesso(licitacao);
    // Modo da dispensa (fase interna, Entrega 5): configuração do órgão até
    // publicar; depois, o valor congelado no processo
    const [cfgModo] = licitacao.orgao_id
      ? await this.dataSource.query(`SELECT dispensa_com_lances FROM configuracoes_fase_interna WHERE orgao_id::text = $1`, [licitacao.orgao_id]).catch(() => [])
      : [];
    const modoDisputa = modoDisputaDaDispensa(licitacao as any, cfgModo?.dispensa_com_lances);

    // Checklist do processo (o que está feito / o que falta)
    const fasesInternas = [
      FaseLicitacao.PLANEJAMENTO,
      FaseLicitacao.TERMO_REFERENCIA,
      FaseLicitacao.PESQUISA_PRECOS,
      FaseLicitacao.ANALISE_JURIDICA,
      FaseLicitacao.APROVACAO_INTERNA,
    ];
    const itensComVencedor = itens.filter((i) => i.fornecedor_vencedor_id).length;
    const checklist = {
      vinculado_pca: !!licitacao.item_pca_id || licitacao.sem_pca === true,
      possui_itens: itens.length > 0,
      possui_documentos: documentos.length > 0,
      fase_interna_concluida: !fasesInternas.includes(licitacao.fase),
      resultado_registrado: itensComVencedor > 0,
      homologado: !!licitacao.data_homologacao,
      contrato_gerado: contratos.length > 0,
    };

    return {
      licitacao: {
        id: licitacao.id,
        numero_processo: licitacao.numero_processo,
        numero_edital: licitacao.numero_edital,
        objeto: licitacao.objeto,
        modalidade: licitacao.modalidade,
        criterio_julgamento: licitacao.criterio_julgamento,
        fase: licitacao.fase,
        situacao: licitacao.situacao ?? SituacaoLicitacao.ATIVA,
        fase_anterior: licitacao.fase_anterior ?? null,
        srp: licitacao.srp ?? false,
        valor_total_estimado: licitacao.valor_total_estimado,
        valor_homologado: licitacao.valor_homologado,
        data_homologacao: licitacao.data_homologacao,
        selecao_externa: licitacao.selecao_externa,
        plataforma_externa: licitacao.plataforma_externa,
        numero_processo_externo: licitacao.numero_processo_externo,
        url_externa: licitacao.url_externa,
        tipo_contratacao: licitacao.tipo_contratacao,
        data_fim_acolhimento: licitacao.data_fim_acolhimento,
        data_abertura_sessao: licitacao.data_abertura_sessao,
        // Divulgação oficial (PNCP — arts. 54 e 174): o prazo corre desta data
        data_divulgacao_oficial: licitacao.data_divulgacao_oficial ?? null,
        meio_divulgacao_oficial: licitacao.meio_divulgacao_oficial ?? null,
        dispensa_lances_inicio: licitacao.dispensa_lances_inicio,
        dispensa_lances_fim: licitacao.dispensa_lances_fim,
        // Dispensa com/sem etapa de lances (Entrega 5 — decisão 5 do dono)
        modo_disputa_dispensa: modoDisputa.aplica ? modoDisputa : null,
        link_pncp: compraPncp?.link_pncp ?? licitacao.link_pncp ?? null,
        numero_controle_pncp: compraPncp?.numero_controle_pncp ?? null,
        preparacao_automatica: licitacao.preparacao_automatica ?? null,
        // Fase interna feita fora do sistema (etiqueta no cabeçalho do processo)
        fase_interna_externa: licitacao.fase_interna_externa
          ? { modo: licitacao.fase_interna_externa.modo ?? 'EXTERNA', por_nome: licitacao.fase_interna_externa.por_nome ?? null, em: licitacao.fase_interna_externa.em ?? null }
          : null,
        // Cabeçalho e "Dados da contratação" (Etapa B)
        created_at: licitacao.created_at,
        data_publicacao_edital: licitacao.data_publicacao_edital ?? null,
        data_inicio_acolhimento: licitacao.data_inicio_acolhimento ?? null,
        data_limite_impugnacao: licitacao.data_limite_impugnacao ?? null,
        natureza_objeto: licitacao.natureza_objeto ?? null,
        fundamento_legal: fundamentoLegalTexto(licitacao as any),
        fundamento_legal_codigo: fundamentoEfetivo(licitacao as any),
        unidade_compradora: licitacao.nome_unidade_compradora ?? null,
        agente_contratacao: agente,
        autoridade,
        sem_pca: licitacao.sem_pca ?? false,
      },
      item_pca: licitacao.item_pca
        ? {
            id: licitacao.item_pca.id,
            numero_item: licitacao.item_pca.numero_item,
            descricao_objeto: licitacao.item_pca.descricao_objeto,
            valor_estimado: licitacao.item_pca.valor_estimado,
          }
        : null,
      demanda: licitacao.demanda
        ? {
            id: licitacao.demanda.id,
            titulo: (licitacao.demanda as any).titulo,
            status: licitacao.demanda.status,
          }
        : null,
      itens: itens.map((i) => ({
        id: i.id,
        numero_item: i.numero_item,
        descricao: (i as any).descricao,
        quantidade: i.quantidade,
        unidade_medida: i.unidade_medida,
        valor_unitario_estimado: i.valor_unitario_estimado,
        valor_unitario_homologado: i.valor_unitario_homologado,
        valor_total_homologado: i.valor_total_homologado,
        fornecedor_vencedor_id: i.fornecedor_vencedor_id,
        fornecedor_vencedor_nome: i.fornecedor_vencedor_nome,
        status: i.status,
      })),
      documentos,
      contratos,
      atas,
      pncp,
      // Sigilo (Lei 14.133 art. 13 par. único, I; IN SEGES 67/2021 art. 13):
      // enquanto o recebimento está aberto o órgão vê só QUANTAS propostas
      // chegaram — nem quem propôs, nem os valores (evita direcionamento).
      propostas: (() => {
        const corte = licitacao.data_fim_acolhimento || licitacao.data_abertura_sessao;
        const emSigilo = corte ? new Date() < new Date(corte) : false;
        return emSigilo
          ? propostas.map((p: any) => ({ id: null, status: p.status, data_envio: null, razao_social: null, valor_total_proposta: null, sigilo: true }))
          : propostas;
      })(),
      propostas_em_sigilo: (() => {
        const corte = licitacao.data_fim_acolhimento || licitacao.data_abertura_sessao;
        return corte ? new Date() < new Date(corte) : false;
      })(),
      checklist,
      // E1: atos que o cockpit pode oferecer agora (com pendências de cada um)
      atos_disponiveis: await this.transicoes.atosDisponiveis(licitacao),
      // Etapa B: menu "Mais ações" (disponíveis e bloqueadas, com o motivo).
      // Homologação multiusuário: revogar/anular só para quem conduz ou a
      // autoridade (art. 71); excluir só para quem conduz — os demais nem veem.
      ...(await (async () => {
        const papel = ator ? await this.papelNoProcesso(ator, id) : { conduz: true, autoridade: true };
        const extinguir = papel.conduz || papel.autoridade;
        const menu = await this.transicoes.acoesDoMenu(licitacao);
        return {
          acoes_menu: extinguir ? menu : menu.filter((a: any) => !ATOS_DE_EXTINCAO.includes(a.ato)),
          permissoes_processo: { excluir: papel.conduz, revogar_anular: extinguir, conduz: papel.conduz, autoridade: papel.autoridade },
        };
      })()),
    };
  }

  /**
   * Autoridade do processo para a tela: a que homologou (gravada no ato) ou,
   * antes disso, a autoridade padrão do órgão (cadastro de autoridades; sem
   * cadastro, o responsável do órgão) — a mesma regra da formalização (E6).
   */
  private async autoridadeDoProcesso(l: Licitacao): Promise<{ nome: string; cargo: string | null; origem: 'HOMOLOGACAO' | 'CONFIGURACAO' | 'CADASTRO' } | null> {
    if (l.homologacao_autoridade_nome) {
      return { nome: l.homologacao_autoridade_nome, cargo: l.homologacao_autoridade_cargo ?? null, origem: 'HOMOLOGACAO' };
    }
    // Homologação multiusuário (27/09/2026): antes da homologação, a autoridade
    // do processo é quem ASSINA A AUTORIZAÇÃO na configuração da fase interna
    // (signatários da autorização; cargo = o papel informado ali, ou o nome da
    // autoridade da configuração) — só depois o cadastro de autoridades e o
    // responsável do órgão. Antes aparecia o responsável do cadastro do órgão
    // (ex.: "Prefeito") embora o signatário configurado fosse outro.
    try {
      const [cfg] = await this.dataSource.query(
        `SELECT signatarios_autorizacao, autoridade_rotulo FROM configuracoes_fase_interna WHERE orgao_id::text = $1`,
        [l.orgao_id],
      );
      const signatarios: Array<{ usuario_id?: string; papel?: string }> = Array.isArray(cfg?.signatarios_autorizacao) ? cfg.signatarios_autorizacao : [];
      for (const sig of signatarios) {
        if (!sig?.usuario_id) continue;
        const [u] = await this.dataSource.query(
          `SELECT nome, cargo FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2 AND ativo = true`,
          [sig.usuario_id, l.orgao_id],
        );
        if (u?.nome) return { nome: u.nome, cargo: String(sig.papel ?? '').trim() || cfg?.autoridade_rotulo || u.cargo || null, origem: 'CONFIGURACAO' };
      }
    } catch {
      /* sem configuração: segue para o cadastro */
    }
    try {
      const cadastro = await this.dataSource.query(
        `SELECT id, nome, cargo, cpf, email, ato_delegacao_numero, ato_delegacao_data, padrao, ativo
           FROM autoridades_orgao WHERE orgao_id::text = $1 AND ativo = true`,
        [l.orgao_id],
      );
      const [orgao] = await this.dataSource.query(
        `SELECT nome, responsavel_nome, responsavel_cargo, responsavel_cpf FROM orgaos WHERE id::text = $1`,
        [l.orgao_id],
      );
      const a = resolverAutoridade(cadastro, null, orgao ?? null);
      return { nome: a.nome, cargo: a.cargo ?? null, origem: 'CADASTRO' };
    } catch {
      return null;
    }
  }

  /**
   * Registra o resultado de uma seleção realizada FORA do sistema
   * (pregão em outra plataforma): marca vencedor e valor por item
   * (status ADJUDICADO) e leva a licitação à fase ADJUDICACAO.
   * Depois, a homologação (ResultadoService — E6) gera o contrato.
   */
  async registrarResultadoExterno(
    id: string,
    dto: {
      plataforma_externa?: string;
      numero_processo_externo?: string;
      url_externa?: string;
      itens: Array<{
        item_id: string;
        fornecedor_id: string;
        valor_unitario: number;
      }>;
    },
    ator: AtorTransicao = atorSistema('api'),
  ): Promise<any> {
    const licitacao = await this.findOne(id);
    if (!dto.itens?.length) {
      throw new BadRequestException('Informe ao menos um item com vencedor');
    }
    if (licitacao.data_homologacao) {
      throw new BadRequestException(
        'Licitação já homologada — não é possível alterar o resultado',
      );
    }

    // Valida tudo ANTES de gravar; a gravação dos itens acontece dentro da
    // transição (mesma transação e lock da licitação).
    const alteracoes: Array<{ item: ItemLicitacao; fornecedor_id: string; razao_social: string; valorUnit: number }> = [];
    for (const r of dto.itens) {
      const item = await this.itemRepository.findOne({
        where: { id: r.item_id, licitacao_id: id },
      });
      if (!item) {
        throw new BadRequestException(`Item ${r.item_id} não pertence a esta licitação`);
      }
      const valorUnit = Number(r.valor_unitario);
      if (!(valorUnit > 0)) {
        throw new BadRequestException(
          `Valor unitário inválido para o item ${item.numero_item}`,
        );
      }
      const forn = await this.dataSource.query(
        `SELECT id, razao_social FROM fornecedores WHERE id = $1`,
        [r.fornecedor_id],
      );
      if (!forn.length) {
        throw new BadRequestException(`Fornecedor ${r.fornecedor_id} não encontrado`);
      }
      alteracoes.push({ item, fornecedor_id: r.fornecedor_id, razao_social: forn[0].razao_social, valorUnit });
    }

    // E6: o MESMO dado da sala — vencedor VENCEDOR na unidade (item) e item
    // ADJUDICADO com o valor registrado da plataforma de origem — gravado pelo
    // ResultadoService dentro do ato (mesma transação e lock).
    const entradas: EntradaAdjudicacao[] = alteracoes.map((a) => ({
      tipo: 'ITEM',
      unidadeId: a.item.id,
      numero: Number(a.item.numero_item),
      fornecedorId: a.fornecedor_id,
      valores: [
        valorAdjudicadoDoUnitario(
          { itemId: a.item.id, numero: Number(a.item.numero_item), quantidade: Number(a.item.quantidade || 0) },
          a.valorUnit,
        ),
      ],
    }));
    let resultados: Array<{ item: string; fornecedor: string; valor_total: number }> = [];
    const salva = await this.transicoes.executar(id, AtoLicitacao.REGISTRAR_RESULTADO_EXTERNO, {
      ator,
      registro: {
        plataforma_externa: dto.plataforma_externa ?? null,
        numero_processo_externo: dto.numero_processo_externo ?? null,
        itens: dto.itens.length,
      },
      aplicar: async (lic, manager) => {
        const gravadas = await this.resultado.gravarAdjudicacao(manager, id, entradas, ator, 'SELECAO_EXTERNA');
        resultados = gravadas.map((g) => ({
          item: String(g.numero),
          fornecedor: g.razaoSocial,
          valor_total: g.valorTotal,
        }));
        lic.selecao_externa = true;
        if (dto.plataforma_externa !== undefined) lic.plataforma_externa = dto.plataforma_externa || null;
        if (dto.numero_processo_externo !== undefined)
          lic.numero_processo_externo = dto.numero_processo_externo || null;
        if (dto.url_externa !== undefined) lic.url_externa = dto.url_externa || null;
      },
    });

    this.logger.log(
      `Resultado externo registrado na licitação ${licitacao.numero_processo}: ${resultados.length} item(ns) adjudicado(s)`,
    );

    return { licitacao_id: id, fase: salva.fase, resultados };
  }

  /**
   * DEGRAU 2 — DISPENSA ELETRÔNICA (Lei 14.133, art. 75 §3º).
   * Julga as propostas recebidas por MENOR PREÇO UNITÁRIO por item e adjudica:
   * grava vencedor/valor homologado em cada item (status ADJUDICADO), marca as
   * propostas vencedoras e leva a licitação à fase ADJUDICACAO. Depois, a
   * homologação (ResultadoService — E6) gera o(s) contrato(s).
   */
  async julgarDispensa(id: string, ator: AtorTransicao = atorSistema('api')): Promise<any> {
    const licitacao = await this.findOne(id);

    if (licitacao.modalidade !== ModalidadeLicitacao.DISPENSA_ELETRONICA) {
      throw new BadRequestException(
        'Julgamento automático por menor preço disponível apenas para Dispensa Eletrônica',
      );
    }
    // Fase/situação (já homologada → 409), fim do acolhimento (art. 75 §3º) e
    // fim da janela de lances: validados ANTES do cálculo (mensagens claras)
    // e de novo dentro da transição, com lock.
    await this.transicoes.verificar(id, AtoLicitacao.JULGAR_DISPENSA, { ator });

    // Propostas válidas (por item), ordenadas por menor valor unitário
    const linhas: Array<{
      item_licitacao_id: string;
      valor_unitario: string;
      proposta_id: string;
      fornecedor_id: string;
      razao_social: string;
      registrada_em: Date | null;
    }> = await this.dataSource.query(
      `SELECT pi.item_licitacao_id, pi.valor_unitario, p.id AS proposta_id,
              p.fornecedor_id, f.razao_social, COALESCE(p.data_envio, p.created_at) AS registrada_em
       FROM proposta_itens pi
       JOIN propostas p ON p.id = pi.proposta_id
       JOIN fornecedores f ON f.id = p.fornecedor_id
       WHERE p.licitacao_id = $1
         AND p.status NOT IN ('RASCUNHO','DESCLASSIFICADA','CANCELADA')
       ORDER BY pi.item_licitacao_id, pi.valor_unitario ASC, p.data_envio ASC NULLS LAST`,
      [id],
    );
    if (linhas.length === 0) {
      throw new BadRequestException(
        'Nenhuma proposta válida recebida para julgamento — declare a dispensa deserta (ato "Declarar deserta").',
      );
    }

    const itens = await this.itemRepository.find({ where: { licitacao_id: id } });

    // Modo congelado na publicação (fase interna, Entrega 5 — decisão 5):
    // SEM etapa de lances (regulamento do órgão) → menor preço das PROPOSTAS;
    // empate → a registrada primeiro (como o aviso real da Câmara de LEM).
    const semLances = dispensaSemLances(licitacao);
    // Fase de lances: o valor final de cada fornecedor no item é o MENOR entre
    // a proposta inicial e os seus próprios lances (modelo IN SEGES 67/2021).
    // Lances da janela: tabela única do motor (origem JANELA_DISPENSA, valor unitário)
    const lances = semLances ? [] : await this.janelaDispensa.lancesDaJanela(id);
    const melhorPorItemFornecedor = valoresFinaisDispensa(linhas, lances);
    // vencedor do item = menor valor final entre os fornecedores
    const vencedorPorItem = new Map<string, Omit<(typeof linhas)[number], 'registrada_em'>>();
    if (semLances) {
      for (const [itemId, v] of vencedoresSemLances(linhas)) vencedorPorItem.set(itemId, v);
    }
    for (const cand of semLances ? [] : melhorPorItemFornecedor.values()) {
      const atual = vencedorPorItem.get(cand.item_licitacao_id);
      if (!atual || Number(cand.valor_unitario) < Number(atual.valor_unitario)) {
        vencedorPorItem.set(cand.item_licitacao_id, cand);
      }
    }
    // Empate no menor valor (Lei 14.133 art. 60; IN 73 art. 28 §2º): critérios II..§1º IV
    // e, persistindo, sorteio auditável no próprio ato do julgamento. A disputa final
    // (art. 60 I) não se aplica ao julgamento automático da dispensa (IN 67/2021 não a
    // prevê; a janela de lances já é a oportunidade de nova oferta) — decisão documentada.
    // Sem etapa de lances o empate já foi decidido pela ordem de registro (regulamento).
    for (const [itemId, venc] of semLances ? [] : [...vencedorPorItem.entries()]) {
      const empatados = [...melhorPorItemFornecedor.values()].filter(
        (c) =>
          c.item_licitacao_id === itemId &&
          Math.round(Number(c.valor_unitario) * 10_000) === Math.round(Number(venc.valor_unitario) * 10_000),
      );
      if (empatados.length < 2) continue;
      const [sessaoDispensa] = await this.dataSource.query(
        `SELECT id FROM sessoes_disputa WHERE licitacao_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [id],
      );
      const r = await desempatarNoAto(this.dataSource, {
        licitacaoId: id,
        sessaoId: sessaoDispensa?.id ?? null,
        tipoUnidade: 'ITEM',
        unidadeId: itemId,
        grupo: empatados.map((c) => c.fornecedor_id),
        valorEmpatado: Number(venc.valor_unitario),
        motivoSemDisputaFinal:
          'Não aplicada — julgamento automático da dispensa eletrônica (IN SEGES 67/2021); a janela de lances é a oportunidade de nova oferta.',
        ator,
      });
      const escolhido = empatados.find((c) => String(c.fornecedor_id) === r.ordem[0]);
      if (escolhido) vencedorPorItem.set(itemId, escolhido);
    }

    const adjudicados: Array<{ item: number; fornecedor: string; valor_unitario: number; valor_total: number }> = [];
    const semProposta: number[] = [];
    const propostasVencedoras = new Set<string>();
    // E6: valor adjudicado da dispensa = melhor oferta final do vencedor
    // (proposta ou lance da janela — IN 67/2021; a dispensa não tem a etapa de
    // aceitação da proposta adequada do pregão) × quantidade. Decisão documentada.
    const entradas: EntradaAdjudicacao[] = [];

    for (const item of itens) {
      const v = vencedorPorItem.get(item.id);
      if (!v) {
        semProposta.push(item.numero_item);
        continue;
      }
      const valor = valorAdjudicadoDoUnitario(
        { itemId: item.id, numero: Number(item.numero_item), quantidade: Number(item.quantidade || 0) },
        Number(v.valor_unitario),
      );
      entradas.push({ tipo: 'ITEM', unidadeId: item.id, numero: valor.numero, fornecedorId: v.fornecedor_id, valores: [valor] });
      propostasVencedoras.add(v.proposta_id);
      adjudicados.push({
        item: item.numero_item,
        fornecedor: v.razao_social,
        valor_unitario: valor.valorUnitario,
        valor_total: valor.valorTotal,
      });
    }

    if (adjudicados.length === 0) {
      throw new BadRequestException('Nenhum item pôde ser adjudicado (itens sem proposta válida)');
    }

    // Ato JULGAR_DISPENSA: adjudicação (vencedor + itens, pelo ResultadoService)
    // e propostas na MESMA transação (com lock) da mudança de fase.
    const salva = await this.transicoes.executar(id, AtoLicitacao.JULGAR_DISPENSA, {
      ator,
      registro: {
        itens_adjudicados: adjudicados.length,
        itens_sem_proposta: semProposta,
        modo: semLances ? 'SEM_LANCES (regulamento do órgão — empate: proposta registrada primeiro)' : 'COM_LANCES (IN SEGES 67/2021)',
      },
      aplicar: async (_lic, manager) => {
        await this.resultado.gravarAdjudicacao(manager, id, entradas, ator, 'DISPENSA');
        // Marca propostas vencedoras (ao menos 1 item) e classifica as demais válidas
        if (propostasVencedoras.size > 0) {
          await manager.query(
            `UPDATE propostas SET status = 'VENCEDORA' WHERE id = ANY($1::uuid[])`,
            [[...propostasVencedoras]],
          );
          await manager.query(
            `UPDATE propostas SET status = 'CLASSIFICADA'
             WHERE licitacao_id = $1 AND status IN ('ENVIADA','RECEBIDA','EM_ANALISE')`,
            [id],
          );
        }
      },
    });

    this.logger.log(
      `Dispensa ${licitacao.numero_processo} julgada: ${adjudicados.length} item(ns) adjudicado(s), ${semProposta.length} sem proposta`,
    );

    return {
      licitacao_id: id,
      fase: salva.fase,
      adjudicados,
      itens_sem_proposta: semProposta,
      com_lances: !semLances,
    };
  }

  /**
   * Abre a fase de LANCES da dispensa (opcional — modelo IN SEGES 67/2021).
   * Camada de PROCESSO aqui (modalidade, situação, homologação, fim do
   * acolhimento); a janela em si é do motor único (JanelaDispensaService:
   * sala, relógio, chat, tempo real no gateway /disputa).
   */
  async abrirLancesDispensa(
    id: string,
    duracaoMinutos: number,
    prorrogacaoMinutos?: number,
  ): Promise<any> {
    const licitacao = await this.findOne(id);
    if (licitacao.modalidade !== ModalidadeLicitacao.DISPENSA_ELETRONICA) {
      throw new BadRequestException('Fase de lances disponível apenas para Dispensa Eletrônica');
    }
    this.exigirAtiva(licitacao, 'abrir a fase de lances');
    // Modo congelado na publicação (fase interna, Entrega 5): sem etapa de lances
    if (dispensaSemLances(licitacao)) {
      throw new ConflictException(
        'Esta dispensa foi publicada SEM disputa de lances (Lei 14.133, art. 75, §3º): só as propostas recebidas no prazo do aviso — julgue pelo menor preço.',
      );
    }
    if (licitacao.data_homologacao) {
      throw new BadRequestException('Licitação já homologada');
    }
    // IN SEGES 67/2021: aviso divulgado no PNCP (arts. 6º e 7º) → prazo de
    // propostas → etapa de lances (art. 11) → julgamento (art. 15). Não há
    // lances antes da divulgação confirmada nem depois do julgamento.
    if (ehFaseInterna(licitacao.fase) || licitacao.fase === FaseLicitacao.AGUARDANDO_DIVULGACAO) {
      throw new ConflictException('Aviso ainda não publicado no PNCP — não há prazo de propostas nem etapa de lances.');
    }
    if ([FaseLicitacao.ADJUDICACAO, FaseLicitacao.HOMOLOGACAO].includes(licitacao.fase)) {
      throw new ConflictException('Julgamento já realizado — a etapa de lances (IN SEGES 67/2021, art. 11) precede o julgamento (art. 15).');
    }
    const corte = licitacao.data_fim_acolhimento || licitacao.data_abertura_sessao;
    if (corte && new Date() < new Date(corte)) {
      throw new BadRequestException(
        'A fase de lances só pode ser aberta após o fim do recebimento de propostas',
      );
    }
    const [{ n }] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS n FROM propostas WHERE licitacao_id = $1 AND status::text NOT IN ('RASCUNHO','DESCLASSIFICADA','CANCELADA')`,
      [id],
    );
    if (!n) {
      throw new BadRequestException('Nenhuma proposta válida — não há lances a abrir (declare a dispensa deserta ou fracassada).');
    }
    return this.janelaDispensa.abrir(id, duracaoMinutos, prorrogacaoMinutos);
  }

  /**
   * Lance do fornecedor na dispensa — pelo MOTOR ÚNICO (registrarLance, origem
   * JANELA_DISPENSA): proposta válida, janela aberta pelo relógio único, valor
   * MENOR que o próprio valor atual (proposta ou lance anterior), trava no
   * item e prorrogação da janela na mesma transação. Fornecedor = o do token.
   */
  async registrarLanceDispensa(
    id: string,
    dto: { item_licitacao_id: string; fornecedor_id: string; valor_unitario: number },
  ): Promise<any> {
    const licitacao = await this.findOne(id);
    if (licitacao.modalidade !== ModalidadeLicitacao.DISPENSA_ELETRONICA) {
      throw new BadRequestException('Fase de lances disponível apenas para Dispensa Eletrônica');
    }
    this.exigirAtiva(licitacao, 'registrar lance');
    return this.janelaDispensa.registrarLance(id, {
      itemId: dto.item_licitacao_id,
      fornecedorId: dto.fornecedor_id,
      valorUnitario: Number(dto.valor_unitario),
    });
  }

  /**
   * ATA DA SESSÃO da dispensa em PDF — gerada automaticamente dos registros
   * (propostas, lances com autoria, chat e resultado). Disponível após o
   * julgamento (antes disso os dados são sigilosos/incompletos). Lances e chat
   * vêm do armazenamento único do motor (tabela `lances`, eventos da sala).
   */
  /**
   * Ata da dispensa. A negociação com o vencedor (IN SEGES 67/2021, art. 16)
   * não é acompanhada pelos demais: antes da homologação, só o órgão dono vê a
   * ata com ela (a ata é anexada aos autos — art. 16 §2º); depois, é pública.
   */
  async gerarAtaDispensa(id: string, orgaoDono = false): Promise<Buffer> {
    return gerarAtaDispensaPdf(await this.dadosAtaDispensa(id, orgaoDono));
  }

  /** Dados da ata da dispensa (o PDF é função pura deles). */
  async dadosAtaDispensa(id: string, orgaoDono = true): Promise<DadosAtaDispensa> {
    const licitacao = await this.findOne(id);
    if (licitacao.modalidade !== ModalidadeLicitacao.DISPENSA_ELETRONICA) {
      throw new BadRequestException('Ata de dispensa disponível apenas para Dispensa Eletrônica');
    }
    const itens = await this.itemRepository.find({
      where: { licitacao_id: id },
      order: { numero_item: 'ASC' },
    });
    const houveJulgamento =
      !!licitacao.data_homologacao || itens.some((i) => i.fornecedor_vencedor_id);
    if (!houveJulgamento) {
      throw new BadRequestException('A ata fica disponível após o julgamento das propostas');
    }

    const [orgaoRow, propostas, sala] = await Promise.all([
      this.dataSource.query(`SELECT nome FROM orgaos WHERE id = $1`, [licitacao.orgao_id]),
      this.dataSource.query(
        `SELECT f.razao_social, f.cpf_cnpj, p.valor_total_proposta, p.status,
                p.data_envio, p.motivo_desclassificacao
         FROM propostas p JOIN fornecedores f ON f.id = p.fornecedor_id
         WHERE p.licitacao_id = $1 AND p.status <> 'RASCUNHO'
         ORDER BY p.valor_total_proposta ASC NULLS LAST`,
        [id],
      ),
      this.janelaDispensa.dadosAta(id, orgaoDono || !!licitacao.data_homologacao),
    ]);

    return {
      orgao_nome: orgaoRow?.[0]?.nome || 'Órgão',
      licitacao,
      itens,
      propostas,
      lances: sala.lances,
      mensagens: sala.mensagens,
    };
  }

  /** Chat da dispensa — lista pública (autoria do fornecedor anônima durante os lances). */
  async listarMensagensDispensa(id: string, leitor: LeitorChat = null): Promise<any[]> {
    await this.findOne(id);
    return this.janelaDispensa.listarMensagens(id, leitor);
  }

  /** Regras do chat da dispensa na fase atual (IN SEGES 67/2021). */
  async regrasChatDispensa(id: string, leitor: LeitorChat = null): Promise<any> {
    const lic = await this.findOne(id);
    if (lic.modalidade !== ModalidadeLicitacao.DISPENSA_ELETRONICA) throw new BadRequestException('Chat disponível apenas para Dispensa Eletrônica');
    return this.janelaDispensa.regrasChat(id, leitor);
  }

  /** Chat da dispensa — envio (órgão ou fornecedor com proposta válida). Registrado nos autos (chat único da sala). */
  async enviarMensagemDispensa(
    id: string,
    dto: {
      autor_tipo: 'ORGAO' | 'FORNECEDOR';
      fornecedor_id?: string;
      autor_nome?: string;
      mensagem: string;
      assunto?: string;
      fornecedor_destino_id?: string;
    },
  ): Promise<any> {
    await this.findOne(id);
    return this.janelaDispensa.enviarMensagem(id, dto);
  }

  /**
   * Painel público (ANÔNIMO) da fase de lances: menor valor atual e nº de
   * lances por item. Com fornecedorId, inclui o valor atual DAQUELE fornecedor
   * — o controller só passa o id do fornecedor AUTENTICADO (nunca da query).
   * Sigilo: antes do fim do acolhimento o menor valor não é exposto.
   */
  async painelLancesDispensa(id: string, fornecedorId?: string): Promise<any> {
    await this.findOne(id);
    return this.janelaDispensa.painel(id, fornecedorId);
  }

  /**
   * SUSPENDER: situação SUSPENSA, fase preservada (retomar volta exatamente
   * ao ponto). Motivo obrigatório — vai para o histórico e é ACRESCENTADO às
   * observações (antes sobrescrevia).
   */
  async suspender(id: string, motivo: string, ator: AtorTransicao = atorSistema('api')): Promise<Licitacao> {
    return this.transicoes.executar(id, AtoLicitacao.SUSPENDER, { ator, motivo });
  }

  /** REVOGAR (art. 71, II): motivo obrigatório; bloqueado com contrato assinado. */
  async revogar(id: string, motivo: string, ator: AtorTransicao = atorSistema('api')): Promise<Licitacao> {
    return this.transicoes.executar(id, AtoLicitacao.REVOGAR, { ator, motivo });
  }

  /** ANULAR (art. 71, III): motivo obrigatório; bloqueado com contrato assinado. */
  async anular(id: string, motivo: string, ator: AtorTransicao = atorSistema('api')): Promise<Licitacao> {
    return this.transicoes.executar(id, AtoLicitacao.ANULAR, { ator, motivo });
  }

  /**
   * RETOMAR: volta a ATIVA na MESMA fase em que foi suspensa. Opcionalmente
   * reabre prazos (data_limite_impugnacao, data_inicio/fim_acolhimento,
   * data_abertura_sessao). `fase_destino` (API antiga) não é mais aceito.
   */
  async retomar(
    id: string,
    dados: Record<string, any> | undefined,
    ator: AtorTransicao = atorSistema('api'),
    motivo?: string,
  ): Promise<Licitacao> {
    return this.transicoes.executar(id, AtoLicitacao.RETOMAR, { ator, dados, motivo });
  }

  async delete(id: string): Promise<void> {
    const licitacao = await this.licitacaoRepository.findOne({ where: { id } });
    if (!licitacao) {
      throw new NotFoundException(`Licitação com ID ${id} não encontrada`);
    }
    
    // Regras de exclusão conforme Lei 14.133/2021
    // Só pode excluir se estiver em fase interna (antes da publicação)
    const fasesPermitidas = [
      FaseLicitacao.PLANEJAMENTO,
      FaseLicitacao.TERMO_REFERENCIA,
      FaseLicitacao.PESQUISA_PRECOS,
      FaseLicitacao.ANALISE_JURIDICA,
      FaseLicitacao.APROVACAO_INTERNA,
    ];

    if (!fasesPermitidas.includes(licitacao.fase)) {
      throw new BadRequestException(
        'Não é possível excluir uma licitação após a publicação do edital. Use as opções de Revogar ou Anular.'
      );
    }

    await this.licitacaoRepository.manager.transaction(async (manager) => {
      // Registros da fase interna podem ter FKs sem cascade em bancos existentes.
      // Remover filhos primeiro evita erro 500 por violação de constraint.
      //
      // Ordem correta para respeitar as FKs:
      //   pesquisa_preco_candidatos → FK para pesquisa_preco_execucoes (sem guarantee de cascade no DB)
      //   pesquisa_preco_execucoes  → FK para documentos_fase_interna (sem cascade)
      //   logs_fase_interna         → FK para licitacao
      //   documentos_fase_interna   → FK para licitacao
      await manager.query(
        `DELETE FROM pesquisa_preco_candidatos WHERE execucao_id IN (
          SELECT id FROM pesquisa_preco_execucoes WHERE licitacao_id = $1
        )`,
        [id],
      );
      await manager.delete('pesquisa_preco_execucoes', { licitacao_id: id });
      await manager.delete('logs_fase_interna', { licitacao_id: id });
      await manager.delete('documentos_fase_interna', { licitacao_id: id });
      await manager.delete('documentos_licitacao', { licitacao_id: id });
      await manager.delete('pncp_sync', { licitacao_id: id });
      await manager.delete(LicitacaoTransicao, { licitacao_id: id });
      await manager.delete(ItemLicitacao, { licitacao_id: id });
      await manager.delete(LoteLicitacao, { licitacao_id: id });
      // Processo eletrônico: a autuação sai junto (libera o número no órgão)
      await this.processos.aoExcluirLicitacao(id, manager);
      await manager.delete(Licitacao, id);
    });
  }

  // === CONSULTAS PÚBLICAS ===
  async findPublicas(filtros?: { 
    modalidade?: string; 
    orgao_id?: string; 
    uf?: string 
  }): Promise<Licitacao[]> {
    // Apenas licitações em fases públicas (após publicação do edital). A
    // situação (suspensa, revogada, deserta...) não muda a fase: continuam
    // públicas e a lista mostra a situação.
    const fasesPublicas = FASES_PUBLICAS;

    const query = this.licitacaoRepository.createQueryBuilder('licitacao')
      .leftJoinAndSelect('licitacao.orgao', 'orgao')
      .select([
        'licitacao.id',
        'licitacao.numero_processo',
        'licitacao.numero_edital',
        'licitacao.ano',
        'licitacao.sequencial',
        'licitacao.objeto',
        'licitacao.modalidade',
        'licitacao.tipo_contratacao',
        'licitacao.criterio_julgamento',
        'licitacao.modo_disputa',
        'licitacao.fase',
        'licitacao.situacao',
        'licitacao.valor_total_estimado',
        'licitacao.sigilo_orcamento',
        'licitacao.data_publicacao_edital',
        'licitacao.data_abertura_sessao',
        'licitacao.srp',
        'orgao.id',
        'orgao.nome',
        'orgao.cnpj',
        'orgao.cidade',
        'orgao.uf',
      ])
      .where('licitacao.fase IN (:...fases)', { fases: fasesPublicas });

    if (filtros?.modalidade) {
      query.andWhere('licitacao.modalidade = :modalidade', { modalidade: filtros.modalidade });
    }

    if (filtros?.orgao_id) {
      query.andWhere('licitacao.orgao_id = :orgao_id', { orgao_id: filtros.orgao_id });
    }

    if (filtros?.uf) {
      query.andWhere('orgao.uf = :uf', { uf: filtros.uf });
    }

    const lista = await query.orderBy('licitacao.data_abertura_sessao', 'DESC').getMany();
    // Orçamento sigiloso (art. 24) não sai em rota pública
    return lista.map((l) => licitacaoParaPublico(l));
  }

  async findPublicaById(id: string): Promise<Licitacao> {
    const fasesPublicas = FASES_PUBLICAS;

    const licitacao = await this.licitacaoRepository
      .createQueryBuilder('licitacao')
      .leftJoinAndSelect('licitacao.orgao', 'orgao')
      .leftJoinAndSelect('licitacao.itens', 'itens')
      .leftJoin('licitacao.pregoeiro', 'pregoeiro')
      .select([
        'licitacao.id',
        'licitacao.numero_processo',
        'licitacao.numero_edital',
        'licitacao.ano',
        'licitacao.sequencial',
        'licitacao.objeto',
        'licitacao.objeto_detalhado',
        'licitacao.modalidade',
        'licitacao.tipo_contratacao',
        'licitacao.criterio_julgamento',
        'licitacao.modo_disputa',
        'licitacao.fase',
        'licitacao.situacao',
        'licitacao.valor_total_estimado',
        'licitacao.sigilo_orcamento',
        'licitacao.data_publicacao_edital',
        'licitacao.data_limite_impugnacao',
        'licitacao.data_inicio_acolhimento',
        'licitacao.data_fim_acolhimento',
        'licitacao.data_abertura_sessao',
        'licitacao.pregoeiro_nome',
        'pregoeiro.id',
        'pregoeiro.nome',
        'licitacao.exclusivo_mpe', // derivado de tipo_beneficio_mpe (a tela pública já usa tipo_beneficio_mpe — E9b)
        'licitacao.tipo_beneficio_mpe',
        'licitacao.modo_beneficio_mpe',
        'licitacao.percentual_cota_reservada',
        'licitacao.tratamento_diferenciado_mpe',
        'licitacao.srp',
        'orgao.id',
        'orgao.nome',
        'orgao.cnpj',
        'orgao.cidade',
        'orgao.uf',
        'orgao.logradouro',
        'orgao.numero',
        'orgao.bairro',
        'orgao.cep',
        'orgao.telefone',
        'orgao.email',
        'itens.id',
        'itens.numero_item',
        'itens.numero_lote',
        'itens.descricao_resumida',
        'itens.descricao_detalhada',
        'itens.unidade_medida',
        'itens.quantidade',
        'itens.valor_unitario_estimado',
        'itens.valor_total_estimado',
        'itens.codigo_catmat',
        'itens.codigo_catser',
        'itens.codigo_catalogo',
        'itens.tipo_participacao',
      ])
      .where('licitacao.id = :id', { id })
      .andWhere('licitacao.fase IN (:...fases)', { fases: fasesPublicas })
      .getOne();

    if (!licitacao) {
      throw new NotFoundException('Licitação pública não encontrada');
    }

    // Pregoeiro: usuário vinculado (fonte, E9); o texto livre só sem vínculo.
    // Só o NOME sai na rota pública.
    licitacao.pregoeiro_nome = nomeDoPregoeiro(licitacao) as string;
    delete (licitacao as Partial<Licitacao>).pregoeiro;

    // Orçamento sigiloso (art. 24) não sai em rota pública
    return licitacaoParaPublico(licitacao);
  }
}
