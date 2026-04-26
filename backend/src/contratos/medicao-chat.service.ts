import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { extname, join } from 'path';
import * as fs from 'fs';
import { XMLParser } from 'fast-xml-parser';
import { Contrato } from './entities/contrato.entity';
import {
  MedicaoChatSession,
  StatusMedicaoChatSession,
} from './entities/medicao-chat-session.entity';
import { Medicao, StatusMedicao } from './entities/medicao.entity';
import { ItemCronograma } from './entities/item-cronograma.entity';
import { EtapaCronograma } from './entities/etapa-cronograma.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { MedicaoService } from './medicao.service';
import { IaService } from '../ia/ia.service';
import { MedicaoChatAgentService } from './medicao-chat-agent.service';
import { XmlNfeParserService } from '../almoxarifado/xml-nfe-parser.service';
import { UploadService } from '../upload/upload.service';
import {
  AnexoMedicao,
  TipoAnexoMedicao,
} from './entities/anexo-medicao.entity';

type DraftItemQuantidade = {
  item_cronograma_id: string;
  numero_item: number;
  descricao?: string;
  quantidade_medida: number;
};

type DraftItemEtapa = {
  etapa_id: string;
  numero_etapa: number;
  descricao?: string;
  percentual_executado_atual?: number;
  valor_executado_atual?: number;
};

type DraftDiscriminacao = {
  descricao: string;
  valor: number;
  percentual?: number;
};

type ResultadoEtapaChat = {
  resposta: string;
  confirmacao_pendente?: Record<string, unknown>;
};

type ResultadoAgente = {
  handled: boolean;
  resposta?: string;
  confirmacao_pendente?: Record<string, unknown>;
  plano_agente?: Record<string, any> | null;
  ultima_analise_agente?: Record<string, any> | null;
};

type AcaoAgenteStatus = 'planned' | 'applied' | 'blocked' | 'skipped';

type AcaoAgente = {
  id: string;
  titulo: string;
  status: AcaoAgenteStatus;
  confianca: 'high' | 'medium' | 'low';
  motivo?: string;
  blocker?: string;
};

type MedicaoCompletaChat = Medicao & {
  itens?: Array<Record<string, any>>;
};

type ContextoAssistidoContrato = {
  resumo: Awaited<ReturnType<MedicaoService['resumoMedicoes']>>;
  medicoes: Medicao[];
  usar_itens_cronograma: boolean;
  itens_cronograma: ItemCronograma[];
  etapas_cronograma: EtapaCronograma[];
  ultima_medicao: Medicao | null;
  rascunho_aberto: Medicao | null;
};

type PlanejamentoLlmMedicao = {
  resumo_intencao?: string;
  acoes?: Array<{
    ferramenta?: string;
    objetivo?: string;
    confianca?: 'high' | 'medium' | 'low';
    parametros?: Record<string, any>;
    bloqueio?: string | null;
  }>;
  resposta_sugerida?: string;
};

type MedicaoChatDraft = {
  contrato_id: string;
  fornecedor_id: string;
  fornecedor_nome_informado?: string | null;
  fornecedor_cnpj_informado?: string | null;
  rascunho_ignorado_id?: string | null;
  periodo_inicio?: string | null;
  periodo_fim?: string | null;
  competencia?: string | null;
  observacoes?: string | null;
  nota_fiscal_numero?: string | null;
  nota_fiscal_valor?: number | null;
  nota_fiscal_data?: string | null;
  valor_medido?: number | null;
  itens?: DraftItemQuantidade[] | DraftItemEtapa[];
  discriminacoes?: DraftDiscriminacao[];
  anexos_pendentes?: Array<{
    temp_path: string;
    nome_original: string;
    mime_type: string;
    tamanho_bytes: number;
    descricao?: string | null;
    aplicar_nf_sugerida?: boolean;
    nf_sugerida?: Record<string, any> | null;
    anexar_ao_boletim?: boolean;
  }>;
};

type PeriodoParseContext = {
  contrato?: Contrato;
  draft?: MedicaoChatDraft;
  ultimaMedicao?: Medicao | null;
};

const ALLOWED_MIMES = [
  'application/pdf',
  'application/xml',
  'text/xml',
  'image/jpeg',
  'image/jpg',
  'image/png',
];

const MESES_PT = [
  '',
  'JANEIRO',
  'FEVEREIRO',
  'MARCO',
  'ABRIL',
  'MAIO',
  'JUNHO',
  'JULHO',
  'AGOSTO',
  'SETEMBRO',
  'OUTUBRO',
  'NOVEMBRO',
  'DEZEMBRO',
];

@Injectable()
export class MedicaoChatService {
  private readonly logger = new Logger(MedicaoChatService.name);
  private readonly uploadDir =
    process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');

  constructor(
    @InjectRepository(MedicaoChatSession)
    private readonly sessionRepository: Repository<MedicaoChatSession>,
    @InjectRepository(Contrato)
    private readonly contratoRepository: Repository<Contrato>,
    @InjectRepository(Medicao)
    private readonly medicaoRepository: Repository<Medicao>,
    @InjectRepository(ItemCronograma)
    private readonly itemCronogramaRepository: Repository<ItemCronograma>,
    @InjectRepository(EtapaCronograma)
    private readonly etapaRepository: Repository<EtapaCronograma>,
    @InjectRepository(Fornecedor)
    private readonly fornecedorRepository: Repository<Fornecedor>,
    @InjectRepository(AnexoMedicao)
    private readonly anexoRepository: Repository<AnexoMedicao>,
    private readonly medicaoService: MedicaoService,
    private readonly medicaoChatAgentService: MedicaoChatAgentService,
    private readonly iaService: IaService,
    private readonly xmlNfeParserService: XmlNfeParserService,
    private readonly uploadService: UploadService,
  ) {}

  async iniciarOuRetomarSessao(
    contratoId: string,
    fornecedorId: string,
    medicaoId?: string,
  ) {
    const contrato = await this.validarContexto(contratoId, fornecedorId);
    const sessoesAtivas = await this.sessionRepository.find({
      where: {
        contrato_id: contratoId,
        fornecedor_id: fornecedorId,
        status: StatusMedicaoChatSession.ATIVA,
      },
      order: { updated_at: 'DESC' },
    });
    let session =
      sessoesAtivas.find(
        (item) => (item.medicao_id || null) === (medicaoId || null),
      ) || null;

    if (!session) {
      const medicao =
        medicaoId != null
          ? await this.medicaoRepository.findOne({ where: { id: medicaoId } })
          : null;
      const draft = await this.prepararDraftInicial(
        contrato,
        fornecedorId,
        medicao,
      );
      session = this.sessionRepository.create({
        contrato_id: contratoId,
        fornecedor_id: fornecedorId,
        medicao_id: medicao?.id || null,
        status: StatusMedicaoChatSession.ATIVA,
        etapa_atual: this.determinarEtapaAtual(draft, contrato),
        draft,
        pendencias: this.calcularPendencias(draft, contrato),
        historico_ia: [],
      });
      session = await this.sessionRepository.save(session);

      const mensagemInicial = await this.montarMensagemInicial(contrato, draft);
      session.historico_ia = [
        {
          role: 'assistant',
          content: mensagemInicial,
          created_at: new Date().toISOString(),
        },
      ];
      session = await this.sessionRepository.save(session);
    } else {
      const draft = (session.draft || {}) as MedicaoChatDraft;
      if (await this.preencherIdentificacaoFornecedor(draft, fornecedorId)) {
        session.draft = draft;
        session.pendencias = this.calcularPendencias(draft, contrato);
        session.etapa_atual = this.determinarEtapaAtual(draft, contrato);
        session = await this.sessionRepository.save(session);
      }
    }

    return this.montarRespostaSessao(session, contrato);
  }

  async obterSessao(sessionId: string, fornecedorId: string) {
    let session = await this.buscarSessao(sessionId, fornecedorId);
    const contrato = await this.validarContexto(
      session.contrato_id,
      fornecedorId,
    );
    const draft = (session.draft || {}) as MedicaoChatDraft;
    if (await this.preencherIdentificacaoFornecedor(draft, fornecedorId)) {
      session.draft = draft;
      session.pendencias = this.calcularPendencias(draft, contrato);
      session.etapa_atual = this.determinarEtapaAtual(draft, contrato);
      session = await this.sessionRepository.save(session);
    }
    return this.montarRespostaSessao(session, contrato);
  }

  async resetarConversa(
    sessionId: string,
    fornecedorId: string,
    limparRascunho = false,
  ) {
    const session = await this.buscarSessao(sessionId, fornecedorId);
    const contrato = await this.validarContexto(
      session.contrato_id,
      fornecedorId,
    );

    session.confirmacao_pendente = null;
    session.plano_agente = null;
    session.ultima_analise_agente = null;
    session.ultimo_snapshot_draft = null;
    if (limparRascunho) {
      const draft = this.criarDraftVazio(contrato.id, fornecedorId);
      await this.preencherIdentificacaoFornecedor(draft, fornecedorId);
      session.draft = draft;
      session.medicao_id = null;
    }

    session.status = StatusMedicaoChatSession.ATIVA;
    session.etapa_atual = this.determinarEtapaAtual(
      (session.draft || {}) as MedicaoChatDraft,
      contrato,
    );
    session.pendencias = this.calcularPendencias(
      (session.draft || {}) as MedicaoChatDraft,
      contrato,
    );
    session.historico_ia = [
      {
        role: 'assistant',
        content: await this.montarMensagemReset(
          contrato,
          (session.draft || {}) as MedicaoChatDraft,
          limparRascunho,
        ),
        created_at: new Date().toISOString(),
      },
    ];

    const saved = await this.sessionRepository.save(session);
    return this.montarRespostaSessao(saved, contrato);
  }

  async processarMensagem(
    sessionId: string,
    fornecedorId: string,
    mensagem: string,
  ) {
    const session = await this.buscarSessao(sessionId, fornecedorId);
    const contrato = await this.validarContexto(
      session.contrato_id,
      fornecedorId,
    );
    const draft = (session.draft || {}) as MedicaoChatDraft;
    await this.preencherIdentificacaoFornecedor(draft, fornecedorId);
    const historico = [...(session.historico_ia || [])];
    historico.push({
      role: 'user',
      content: mensagem,
      created_at: new Date().toISOString(),
    });

    let respostaAssistente = '';
    const decisaoRascunho = await this.processarDecisaoRascunhoAberto(
      session,
      contrato,
      draft,
      fornecedorId,
      mensagem,
    );
    if (decisaoRascunho) {
      respostaAssistente = decisaoRascunho.resposta;
    } else if (session.confirmacao_pendente) {
      const confirmou = this.interpretarConfirmacao(mensagem);
      if (confirmou == null) {
        respostaAssistente =
          'Preciso só da sua confirmação para continuar. Responda com "sim" ou "não".';
      } else {
        const resultadoConfirmacao = await this.processarConfirmacaoPendente(
          session,
          contrato,
          draft,
          confirmou,
        );
        respostaAssistente = resultadoConfirmacao.resposta;
      }
    } else {
      const resultadoAgente = await this.processarMensagemComoAgenteV3(
        session,
        mensagem,
        contrato,
        draft,
        fornecedorId,
      );
      session.plano_agente = resultadoAgente.plano_agente || null;
      session.ultima_analise_agente =
        resultadoAgente.ultima_analise_agente || null;
      if (resultadoAgente.handled) {
        respostaAssistente = resultadoAgente.resposta || '';
        if (resultadoAgente.confirmacao_pendente) {
          session.confirmacao_pendente = resultadoAgente.confirmacao_pendente;
        }
      } else {
        const etapaAtual = this.determinarEtapaAtual(draft, contrato);
        const resultado = await this.aplicarMensagemNaEtapa(
          etapaAtual,
          mensagem,
          contrato,
          draft,
          fornecedorId,
        );
        respostaAssistente = resultado.resposta;
        if (resultado.confirmacao_pendente) {
          session.confirmacao_pendente = resultado.confirmacao_pendente;
        }
      }
    }

    session.draft = draft;
    session.pendencias = this.calcularPendencias(draft, contrato);
    session.etapa_atual = this.determinarEtapaAtual(draft, contrato);
    session.medicao_id = await this.materializarDraft(session, contrato, fornecedorId);

    if (!session.confirmacao_pendente && session.pendencias.length === 0) {
      session.status = StatusMedicaoChatSession.CONCLUIDA;
    }

    historico.push({
      role: 'assistant',
      content: respostaAssistente,
      created_at: new Date().toISOString(),
    });
    session.historico_ia = historico;
    const saved = await this.sessionRepository.save(session);

    return this.montarRespostaSessao(saved, contrato);
  }

  async anexarArquivo(
    sessionId: string,
    fornecedorId: string,
    file: Express.Multer.File,
    descricao?: string,
  ) {
    const session = await this.buscarSessao(sessionId, fornecedorId);
    const contrato = await this.validarContexto(
      session.contrato_id,
      fornecedorId,
    );

    if (!file) {
      throw new BadRequestException('Arquivo é obrigatório');
    }
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Tipo de arquivo não suportado. Use PDF, XML ou imagem.',
      );
    }

    const draft = ((session.draft || {}) as MedicaoChatDraft);
    draft.anexos_pendentes = draft.anexos_pendentes || [];

    const tempDir = join(this.uploadDir, 'medicao-chat', session.id);
    fs.mkdirSync(tempDir, { recursive: true });
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname).toLowerCase()}`;
    const tempPath = join(tempDir, filename);
    fs.writeFileSync(tempPath, file.buffer);

    let nfSugerida: Record<string, any> | null = null;
    try {
      nfSugerida = await this.extrairSugestaoNotaFiscal(
        file,
        contrato.id,
        fornecedorId,
      );
    } catch (error: any) {
      this.logger.warn(
        `Falha ao extrair sugestão da NF no chat ${session.id}: ${error.message}`,
      );
    }

    draft.anexos_pendentes.push({
      temp_path: tempPath,
      nome_original: file.originalname,
      mime_type: file.mimetype,
      tamanho_bytes: file.size,
      descricao: descricao || null,
      nf_sugerida: nfSugerida,
      aplicar_nf_sugerida: !!nfSugerida,
      anexar_ao_boletim: true,
    });

    session.draft = draft;
    const resumoNf = this.formatarResumoNfSugerida(nfSugerida);
    if (nfSugerida && !nfSugerida.conflito_cnpj) {
      if (nfSugerida.nota_fiscal_numero) {
        draft.nota_fiscal_numero = nfSugerida.nota_fiscal_numero;
      }
      if (nfSugerida.nota_fiscal_valor != null) {
        draft.nota_fiscal_valor = Number(nfSugerida.nota_fiscal_valor);
      }
      if (nfSugerida.nota_fiscal_data) {
        draft.nota_fiscal_data = nfSugerida.nota_fiscal_data;
      }
      if (!draft.competencia && nfSugerida.competencia) {
        draft.competencia = nfSugerida.competencia;
      }
      await this.aplicarPreenchimentoAutomaticoPosNf(contrato, draft, nfSugerida);
      session.draft = draft;
      session.pendencias = this.calcularPendencias(draft, contrato);
      session.etapa_atual = this.determinarEtapaAtual(draft, contrato);
      session.medicao_id = await this.materializarDraft(
        session,
        contrato,
        fornecedorId,
      );
      const orientacao = await this.montarOrientacaoProximaEtapa(contrato, draft);
      session.historico_ia = [
        ...(session.historico_ia || []),
        {
          role: 'assistant',
          content: `Analisei o arquivo **${file.originalname}** e apliquei automaticamente os dados da nota fiscal ao rascunho.${resumoNf ? ` ${resumoNf}` : ''}${orientacao ? ` ${orientacao}` : ''}`,
          created_at: new Date().toISOString(),
        },
      ];
      const saved = await this.sessionRepository.save(session);
      return this.montarRespostaSessao(saved, contrato);
    }

    if (nfSugerida?.conflito_cnpj) {
      session.confirmacao_pendente = {
        tipo: 'ANEXO_NF',
        temp_path: tempPath,
        nf_sugerida: nfSugerida,
        nome_original: file.originalname,
      };
    }
    session.historico_ia = [
      ...(session.historico_ia || []),
        {
          role: 'assistant',
          content: nfSugerida
            ? `Analisei o arquivo **${file.originalname}** e encontrei dados de nota fiscal.${resumoNf ? ` ${resumoNf}` : ''}${nfSugerida.conflito_cnpj ? ' O CNPJ do emissor parece diferente do fornecedor do contrato. Posso aplicar essa NF mesmo assim?' : ' Posso aplicar essa NF ao rascunho e deixar o arquivo pronto para anexar ao boletim quando a medição estiver materializada?'}`
            : `Recebi o arquivo **${file.originalname}**. Posso deixá-lo pendente para anexar ao boletim assim que o rascunho estiver pronto?`,
          created_at: new Date().toISOString(),
        },
    ];
    const saved = await this.sessionRepository.save(session);
    return this.montarRespostaSessao(saved, contrato);
  }

  private async buscarSessao(sessionId: string, fornecedorId: string) {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, fornecedor_id: fornecedorId },
    });
    if (!session) {
      throw new NotFoundException('Sessão de medição assistida não encontrada');
    }
    return session;
  }

  private async validarContexto(contratoId: string, fornecedorId: string) {
    const contrato = await this.contratoRepository.findOne({
      where: { id: contratoId },
      relations: ['orgao'],
    });
    if (!contrato) {
      throw new NotFoundException('Contrato não encontrado');
    }
    if (contrato.fornecedor_id !== fornecedorId) {
      throw new BadRequestException('Fornecedor sem acesso a este contrato');
    }
    return contrato;
  }

  private async prepararDraftInicial(
    contrato: Contrato,
    fornecedorId: string,
    medicao?: Medicao | null,
  ): Promise<MedicaoChatDraft> {
    const draft = this.criarDraftVazio(contrato.id, fornecedorId);
    await this.preencherIdentificacaoFornecedor(draft, fornecedorId);

    if (medicao) {
      draft.periodo_inicio = this.formatDateOnly(medicao.periodo_inicio);
      draft.periodo_fim = this.formatDateOnly(medicao.periodo_fim);
      draft.competencia = medicao.competencia || null;
      draft.observacoes =
        medicao.fornecedor_observacoes || medicao.observacoes || null;
      draft.nota_fiscal_numero = medicao.nota_fiscal_numero || null;
      draft.nota_fiscal_valor = medicao.nota_fiscal_valor
        ? Number(medicao.nota_fiscal_valor)
        : null;
      draft.nota_fiscal_data = this.formatDateOnly(medicao.nota_fiscal_data);
      draft.valor_medido = Number(medicao.valor_medido) || null;

      if (await this.medicaoService.usarItensCronograma(contrato.id)) {
        const itens = (await this.medicaoService.buscarMedicao(
          medicao.id,
        )) as MedicaoCompletaChat;
        draft.itens =
          (itens.itens || []).map((item: any) => ({
            item_cronograma_id: item.item_cronograma_id,
            numero_item: item.itemCronograma?.numero_item || item.numero_item,
            descricao: item.itemCronograma?.descricao || item.descricao,
            quantidade_medida: Number(item.quantidade_medida) || 0,
          })) || [];
      } else if (!this.medicaoService.isServicoContinuado(contrato)) {
        const itens = (await this.medicaoService.buscarMedicao(
          medicao.id,
        )) as MedicaoCompletaChat;
        draft.itens =
          (itens.itens || []).map((item: any) => ({
            etapa_id: item.etapa_id,
            numero_etapa: item.etapa?.numero_etapa || item.numero_etapa,
            descricao: item.etapa?.descricao || item.descricao,
            percentual_executado_atual:
              Number(item.percentual_executado_atual) || 0,
            valor_executado_atual: Number(item.valor_medido) || 0,
          })) || [];
      }

      draft.discriminacoes = (
        await this.medicaoService.listarDiscriminacoes(medicao.id)
      ).map((item) => ({
        descricao: item.descricao,
        valor: Number(item.valor),
        percentual: Number(item.percentual),
      }));

      return draft;
    }

    const sugestoes = await this.medicaoService.sugerirDiscriminacoes(contrato.id);
    if (sugestoes.length > 0) {
      draft.discriminacoes = sugestoes;
    }
    return draft;
  }

  private async preencherIdentificacaoFornecedor(
    draft: MedicaoChatDraft,
    fornecedorId: string,
  ): Promise<boolean> {
    if (draft.fornecedor_nome_informado && draft.fornecedor_cnpj_informado) {
      return false;
    }

    const fornecedor = await this.fornecedorRepository.findOne({
      where: { id: fornecedorId },
    });
    if (!fornecedor) return false;

    let alterou = false;
    if (!draft.fornecedor_nome_informado) {
      draft.fornecedor_nome_informado =
        fornecedor.razao_social || fornecedor.nome_fantasia || null;
      alterou = Boolean(draft.fornecedor_nome_informado);
    }
    if (!draft.fornecedor_cnpj_informado) {
      draft.fornecedor_cnpj_informado = fornecedor.cpf_cnpj || null;
      alterou = Boolean(draft.fornecedor_cnpj_informado) || alterou;
    }
    return alterou;
  }

  private criarDraftVazio(
    contratoId: string,
    fornecedorId: string,
  ): MedicaoChatDraft {
    return {
      contrato_id: contratoId,
      fornecedor_id: fornecedorId,
      fornecedor_nome_informado: null,
      fornecedor_cnpj_informado: null,
      rascunho_ignorado_id: null,
      anexos_pendentes: [],
      discriminacoes: [],
      itens: [],
    };
  }

  private draftSemMedicaoPreenchida(draft: MedicaoChatDraft) {
    return (
      !draft.periodo_inicio &&
      !draft.periodo_fim &&
      !draft.competencia &&
      !draft.nota_fiscal_numero &&
      !draft.nota_fiscal_valor &&
      !draft.valor_medido &&
      (!Array.isArray(draft.itens) || draft.itens.length === 0)
    );
  }

  private async processarDecisaoRascunhoAberto(
    session: MedicaoChatSession,
    contrato: Contrato,
    draft: MedicaoChatDraft,
    fornecedorId: string,
    mensagem: string,
  ): Promise<ResultadoEtapaChat | null> {
    const contexto = await this.carregarContextoAssistido(contrato);
    const rascunho = contexto.rascunho_aberto;
    if (
      !rascunho ||
      session.medicao_id ||
      draft.rascunho_ignorado_id === rascunho.id ||
      !this.draftSemMedicaoPreenchida(draft)
    ) {
      return null;
    }

    if (/continuar|retomar|usar|aproveitar|seguir/i.test(mensagem)) {
      const draftRascunho = await this.prepararDraftInicial(
        contrato,
        fornecedorId,
        rascunho,
      );
      this.substituirDraft(draft, draftRascunho);
      session.medicao_id = rascunho.id;
      return {
        resposta: `Perfeito, retomei o **rascunho da medição #${rascunho.numero_medicao}**. Revisei os dados que já estavam salvos e vou continuar a partir dele. ${await this.montarPerguntaObjetivaProximaEtapa(contrato, draft)}`,
      };
    }

    if (/recome[cç]ar|come[cç]ar do zero|novo|nova|zerar|ignorar/i.test(mensagem)) {
      draft.rascunho_ignorado_id = rascunho.id;
      return {
        resposta:
          'Combinado, vou ignorar esse rascunho nesta conversa e começar uma nova medição do zero. Informe o **período da medição** no formato "01/04/2026 a 30/04/2026".',
      };
    }

    return null;
  }

  private determinarEtapaAtual(draft: MedicaoChatDraft, contrato: Contrato) {
    const pendencias = this.calcularPendencias(draft, contrato);
    return pendencias[0] || 'REVISAO';
  }

  private calcularPendencias(draft: MedicaoChatDraft, contrato: Contrato) {
    const pendencias: string[] = [];
    if (!draft.fornecedor_nome_informado || !draft.fornecedor_cnpj_informado) {
      pendencias.push('IDENTIFICACAO');
    }
    if (!draft.periodo_inicio || !draft.periodo_fim) pendencias.push('PERIODO');
    if (!draft.competencia) pendencias.push('COMPETENCIA');

    if (this.medicaoService.isServicoContinuado(contrato)) {
      if (!draft.valor_medido || draft.valor_medido <= 0) pendencias.push('MEDICAO');
    } else if (Array.isArray(draft.itens) && draft.itens.length === 0) {
      pendencias.push('MEDICAO');
    }

    if (draft.nota_fiscal_numero == null && draft.nota_fiscal_valor == null) {
      pendencias.push('NF');
    }

    if (!draft.discriminacoes || draft.discriminacoes.length === 0) {
      pendencias.push('DISCRIMINACOES');
    }
    if (draft.observacoes == null) pendencias.push('OBSERVACOES');
    return pendencias;
  }

  private async montarMensagemInicial(
    contrato: Contrato,
    draft: MedicaoChatDraft,
  ) {
    const contexto = await this.carregarContextoAssistido(contrato);
    const tipoFluxo = this.medicaoService.isServicoContinuado(contrato)
      ? 'serviço continuado'
      : 'medição por cronograma';
    const resumoContrato = this.montarResumoContextoContrato(contexto, false);
    if (
      contexto.rascunho_aberto?.numero_medicao &&
      draft.rascunho_ignorado_id !== contexto.rascunho_aberto.id &&
      !draft.periodo_inicio
    ) {
      return `Olá! Sou o Assistente de Medição do Portal DCP IA. Encontrei um **rascunho da medição #${contexto.rascunho_aberto.numero_medicao}** em andamento para o contrato **${contrato.numero_contrato}**.${resumoContrato ? ` ${resumoContrato}` : ''}\n\nVocê quer **continuar esse rascunho** ou **recomeçar do zero**?`;
    }

    if (!draft.fornecedor_nome_informado || !draft.fornecedor_cnpj_informado) {
      return `Olá! Sou o Assistente de Medição do Portal DCP IA. Vou te guiar no preenchimento do boletim de medição do contrato **${contrato.numero_contrato}**. Identifiquei que este contrato usa **${tipoFluxo}**.${resumoContrato ? ` ${resumoContrato}` : ''}\n\nPara começar, pode me informar seu **nome** e o **CNPJ da empresa**?`;
    }

    return `Olá! Sou o Assistente de Medição do Portal DCP IA. Vou te guiar no preenchimento do boletim de medição do contrato **${contrato.numero_contrato}**. Identifiquei que este contrato usa **${tipoFluxo}**.${resumoContrato ? ` ${resumoContrato}` : ''}\n\nJá encontrei a identificação do fornecedor no cadastro. Para começar, pode me informar o **período da medição**? Pode usar "01/04/2026 a 30/04/2026" ou "01 04 a 30 04" quando o ano estiver claro pela vigência.`;
  }

  private async montarMensagemReset(
    contrato: Contrato,
    draft: MedicaoChatDraft,
    limpouRascunho = false,
  ) {
    const orientacao = await this.montarPerguntaObjetivaProximaEtapa(
      contrato,
      draft,
    );
    if (limpouRascunho) {
      return `Reiniciei a conversa assistida e limpei também o rascunho da medição. Vamos começar do zero. ${orientacao}`;
    }
    return `Reiniciei a conversa assistida e limpei o contexto do chat. Mantive o rascunho atual para você não perder dados. ${orientacao}`;
  }

  private async aplicarMensagemNaEtapa(
    etapaAtual: string,
    mensagem: string,
    contrato: Contrato,
    draft: MedicaoChatDraft,
    fornecedorId: string,
  ): Promise<ResultadoEtapaChat> {
    switch (etapaAtual) {
      case 'IDENTIFICACAO':
        return this.aplicarIdentificacao(mensagem, draft);
      case 'PERIODO':
        return this.aplicarPeriodo(mensagem, draft, contrato);
      case 'COMPETENCIA':
        return this.aplicarCompetencia(mensagem, draft);
      case 'NF':
        return this.aplicarNotaFiscal(mensagem, contrato, draft);
      case 'MEDICAO':
        return this.aplicarMedicao(mensagem, contrato, draft);
      case 'DISCRIMINACOES':
        return this.aplicarDiscriminacoes(mensagem, contrato, draft, fornecedorId);
      case 'OBSERVACOES':
        return this.aplicarObservacoes(mensagem, draft);
      default:
        return {
          resposta:
            'Seu rascunho já está praticamente completo. Se quiser, você pode revisar, anexar arquivos ou complementar observações antes de enviar manualmente para ateste.',
        };
    }
  }

  private async processarMensagemComoAgente(
    mensagem: string,
    contrato: Contrato,
    draft: MedicaoChatDraft,
    fornecedorId: string,
  ): Promise<ResultadoAgente> {
    const aplicacoes: string[] = [];
    let nfAtualizada = false;
    let handled = false;

    const periodo = this.extrairPeriodoTexto(mensagem, { contrato, draft });
    if (
      periodo &&
      (!draft.periodo_inicio || !draft.periodo_fim || this.extrairDatasCount(mensagem) >= 2)
    ) {
      if (!draft.periodo_inicio || !draft.periodo_fim) {
        draft.periodo_inicio = periodo.inicio;
        draft.periodo_fim = periodo.fim;
        draft.competencia = draft.competencia || this.derivarCompetencia(periodo.fim);
        aplicacoes.push(
          `registrei o período ${this.formatDateBr(periodo.inicio)} a ${this.formatDateBr(periodo.fim)}`,
        );
        handled = true;
      }
    }

    const competencia = this.normalizarCompetencia(mensagem);
    if (
      competencia &&
      draft.competencia !== competencia
    ) {
      draft.competencia = competencia;
      aplicacoes.push(`defini a competência como ${competencia}`);
      handled = true;
    } else if (
      /automatic|auto|pode usar|usar/i.test(mensagem) &&
      draft.periodo_fim &&
      !draft.competencia
    ) {
      draft.competencia = this.derivarCompetencia(draft.periodo_fim);
      aplicacoes.push(`defini a competência automática como ${draft.competencia}`);
      handled = true;
    }

    const numeroNf = this.extrairNumeroNF(mensagem);
    const dataNf = this.extrairDataAvulsa(mensagem);
    const valorNf =
      /\bnf\b|\bnota\b/i.test(mensagem) || this.determinarEtapaAtual(draft, contrato) === 'NF'
        ? this.extrairMoeda(mensagem)
        : null;
    if (numeroNf || dataNf || valorNf != null) {
      if (numeroNf) draft.nota_fiscal_numero = numeroNf;
      if (dataNf) draft.nota_fiscal_data = dataNf;
      if (valorNf != null) draft.nota_fiscal_valor = valorNf;
      nfAtualizada = numeroNf != null || dataNf != null || valorNf != null;
      if (nfAtualizada) {
        aplicacoes.push('atualizei os dados da nota fiscal');
        handled = true;
      }
    }

    if (/reaproveitar|última|ultima/i.test(mensagem) && /discrimin/i.test(mensagem)) {
      draft.discriminacoes = await this.medicaoService.sugerirDiscriminacoes(
        contrato.id,
      );
      if ((draft.discriminacoes || []).length > 0) {
        aplicacoes.push('reaproveitei as discriminações da última medição');
        handled = true;
      }
    } else {
      const valorBase = Number(draft.nota_fiscal_valor || draft.valor_medido || 0);
      const discriminacoes = await this.extrairDiscriminacoesDaMensagem(
        mensagem,
        valorBase,
      );
      if (discriminacoes.length > 0) {
        draft.discriminacoes = discriminacoes;
        aplicacoes.push('atualizei as discriminações');
        handled = true;
      }
    }

    if (this.medicaoService.isServicoContinuado(contrato)) {
      if (
        /valor medido|valor do período|valor do periodo|medição|medicao/i.test(
          mensagem,
        ) ||
          this.determinarEtapaAtual(draft, contrato) === 'MEDICAO'
      ) {
        const valorMedido = this.extrairMoeda(mensagem);
        if (valorMedido != null && valorMedido > 0) {
          draft.valor_medido = valorMedido;
          aplicacoes.push(`defini o valor medido em ${this.formatCurrency(valorMedido)}`);
          handled = true;
        }
      }
    } else if (
      /item\s*\d+\s*[:=]/i.test(mensagem) ||
      /^\s*\d+\s*[:=]/im.test(mensagem)
    ) {
      const itensDisponiveis = await this.itemCronogramaRepository.find({
        where: { contrato_id: contrato.id },
        order: { numero_item: 'ASC' },
      });
      const itensExtraidos = await this.extrairItensCronogramaDaMensagem(
        mensagem,
        itensDisponiveis,
      );
      if (itensExtraidos.length > 0) {
        draft.itens = itensExtraidos;
        aplicacoes.push(`preenchi ${itensExtraidos.length} item(ns) da medição`);
        handled = true;
      }
    } else if (/etapa\s*\d+\s*[:=]/i.test(mensagem)) {
      const etapasDisponiveis = await this.etapaRepository.find({
        where: { contrato_id: contrato.id },
        order: { numero_etapa: 'ASC' },
      });
      const etapasExtraidas = await this.extrairEtapasDaMensagem(
        mensagem,
        etapasDisponiveis,
      );
      if (etapasExtraidas.length > 0) {
        draft.itens = etapasExtraidas;
        aplicacoes.push(`preenchi ${etapasExtraidas.length} etapa(s) da medição`);
        handled = true;
      }
    }

    if (/sem observ/i.test(mensagem)) {
      draft.observacoes = '';
      aplicacoes.push('registrei que não há observações adicionais');
      handled = true;
    } else if (
      /observa/i.test(mensagem) ||
      (this.determinarEtapaAtual(draft, contrato) === 'OBSERVACOES' &&
        mensagem.trim().length > 6)
    ) {
      const observacoes = mensagem
        .replace(/^.*observa(?:ç|c)[aã]o(?:es)?[:\s-]*/i, '')
        .trim();
      if (observacoes) {
        draft.observacoes = observacoes;
        aplicacoes.push('atualizei as observações do boletim');
        handled = true;
      }
    }

    if (nfAtualizada) {
      await this.aplicarPreenchimentoAutomaticoPosNf(contrato, draft, null);
      if (
        this.medicaoService.isServicoContinuado(contrato) &&
        Number(draft.valor_medido || 0) > 0
      ) {
        aplicacoes.push('usei a nota para preencher automaticamente o valor medido');
      } else if ((draft.itens || []).length > 0) {
        aplicacoes.push('usei a nota para sugerir automaticamente a execução da medição');
      }
    }

    if (!handled) {
      return { handled: false };
    }

    const orientacao = await this.montarOrientacaoProximaEtapa(contrato, draft);
    return {
      handled: true,
      resposta: this.montarRespostaAgente(aplicacoes, orientacao, draft, contrato),
    };
  }

  private montarRespostaAgente(
    aplicacoes: string[],
    orientacao: string,
    draft: MedicaoChatDraft,
    contrato: Contrato,
    resumo?: Record<string, any> | null,
  ) {
    const pendencias = this.calcularPendencias(draft, contrato);
    const avisos = this.validarConformidadeContrato(draft, contrato, resumo);
    const prefixo =
      aplicacoes.length > 0
        ? `Entendi sua mensagem e já atualizei o rascunho: ${this.listarNatural(aplicacoes)}.`
        : 'Analisei sua mensagem e mantive o rascunho atualizado.';
    const blocos: string[] = [prefixo];
    if (avisos.length > 0) {
      blocos.push(`⚠️ ${avisos.join(' ')}`);
    }
    if (pendencias.length === 0) {
      blocos.push('O boletim ficou **praticamente pronto**. Revise os dados ao lado e siga para o envio manual ao ateste.');
      return blocos.join(' ');
    }
    blocos.push(orientacao);
    const labels = this.pendenciasParaLabels(pendencias);
    blocos.push(`Ainda falta preencher: ${labels}.`);
    return blocos.join(' ');
  }

  private readonly PENDENCIA_LABELS: Record<string, string> = {
    PERIODO: 'Período da medição',
    COMPETENCIA: 'Competência',
    NF: 'Nota Fiscal',
    MEDICAO: 'Valores/itens da medição',
    DISCRIMINACOES: 'Discriminações',
    OBSERVACOES: 'Observações',
  };

  private pendenciasParaLabels(pendencias: string[]): string {
    return pendencias
      .map((p) => `**${this.PENDENCIA_LABELS[p] || p}**`)
      .join(', ');
  }

  private validarConformidadeContrato(
    draft: MedicaoChatDraft,
    contrato: Contrato,
    resumo?: Record<string, any> | null,
  ): string[] {
    const avisos: string[] = [];
    if (draft.periodo_fim && contrato.data_vigencia_fim) {
      const fim = new Date(draft.periodo_fim);
      const vigFim = new Date(contrato.data_vigencia_fim);
      if (fim > vigFim) {
        avisos.push('Período ultrapassa a vigência do contrato.');
      }
    }
    if (draft.periodo_inicio && contrato.data_vigencia_inicio) {
      const inicio = new Date(draft.periodo_inicio);
      const vigInicio = new Date(contrato.data_vigencia_inicio);
      if (inicio < vigInicio) {
        avisos.push('Período começa antes da vigência do contrato.');
      }
    }
    if (resumo?.saldo_disponivel != null && draft.valor_medido != null) {
      if (Number(draft.valor_medido) > Number(resumo.saldo_disponivel)) {
        avisos.push('Valor medido ultrapassa o saldo disponível.');
      }
    }
    return avisos;
  }

  private async processarMensagemComoAgenteV2(
    session: MedicaoChatSession,
    mensagem: string,
    contrato: Contrato,
    draft: MedicaoChatDraft,
    fornecedorId: string,
  ): Promise<ResultadoAgente> {
    void fornecedorId;
    const contexto = await this.carregarContextoAssistido(contrato);
    const planejamentoAgente =
      await this.medicaoChatAgentService.planejarTurno({
        contrato: {
          id: contrato.id,
          numero_contrato: contrato.numero_contrato,
          modalidade_execucao: contrato.modalidade_execucao,
          categoria: contrato.categoria,
        },
        resumo: contexto.resumo as Record<string, any>,
        draft,
        contexto: {
          usar_itens_cronograma: contexto.usar_itens_cronograma,
          itens_cronograma: contexto.itens_cronograma.slice(0, 10).map((item) => ({
            numero_item: item.numero_item,
            unidade_medida: item.unidade_medida,
            valor_mensal: Number(item.valor_mensal || 0),
            valor_total: Number(item.valor_total || 0),
            valor_unitario: Number(item.valor_unitario || 0),
          })),
          etapas_cronograma: contexto.etapas_cronograma.slice(0, 10).map((item) => ({
            numero_etapa: item.numero_etapa,
            valor_previsto: Number(item.valor_previsto || 0),
            percentual_fisico: Number(item.percentual_fisico || 0),
          })),
          ultima_medicao: contexto.ultima_medicao
            ? {
                numero_medicao: contexto.ultima_medicao.numero_medicao,
                valor_medido: Number(contexto.ultima_medicao.valor_medido || 0),
                competencia: contexto.ultima_medicao.competencia,
              }
            : null,
        },
        mensagem,
        tem_snapshot_draft: Boolean(session.ultimo_snapshot_draft),
      });
    const aplicacoes: string[] = [];
    const plano: AcaoAgente[] = [];
    const draftAntesEscrita = this.clonarJson(draft);
    const etapaAntesDaMensagem = this.determinarEtapaAtual(draft, contrato);
    let confirmacaoPendente: Record<string, unknown> | undefined;
    let nfAtualizada = false;
    let handled = false;
    let houveEscrita = false;

    if (
      planejamentoAgente.intencao === 'negative_feedback' &&
      planejamentoAgente.deve_reverter_ultima_inferencia &&
      session.ultimo_snapshot_draft
    ) {
      this.substituirDraft(
        draft,
        (session.ultimo_snapshot_draft || {}) as MedicaoChatDraft,
      );
      session.ultimo_snapshot_draft = null;
      const orientacao = await this.montarPerguntaObjetivaProximaEtapa(
        contrato,
        draft,
      );
      return {
        handled: true,
        resposta: `${planejamentoAgente.resposta_base} ${orientacao}`,
        plano_agente: planejamentoAgente as unknown as Record<string, any>,
        ultima_analise_agente:
          (planejamentoAgente.llm as Record<string, any> | null) || null,
      };
    }

    if (
      planejamentoAgente.intencao === 'greeting' ||
      planejamentoAgente.intencao === 'help' ||
      planejamentoAgente.intencao === 'negative_feedback'
    ) {
      const orientacao = await this.montarOrientacaoProximaEtapa(contrato, draft);
      return {
        handled: true,
        resposta: `${planejamentoAgente.resposta_base} ${orientacao}`,
        plano_agente: planejamentoAgente as unknown as Record<string, any>,
        ultima_analise_agente:
          (planejamentoAgente.llm as Record<string, any> | null) || null,
      };
    }

    const ferramentasPermitidas = new Set(
      (planejamentoAgente.ferramentas || []).map((item) => item.nome),
    );
    const permiteTudo = ferramentasPermitidas.size === 0;
    const podeUsarFerramenta = (...nomes: string[]) =>
      permiteTudo || nomes.some((nome) => ferramentasPermitidas.has(nome));

    for (const acao of planejamentoAgente.llm?.acoes || []) {
      plano.push({
        id: `llm_${acao.ferramenta || plano.length}`,
        titulo: acao.objetivo || acao.ferramenta || 'ação planejada',
        status: acao.bloqueio ? 'blocked' : 'planned',
        confianca: acao.confianca || 'medium',
        motivo: acao.ferramenta || undefined,
        blocker: acao.bloqueio || undefined,
      });
    }

    if (etapaAntesDaMensagem === 'IDENTIFICACAO') {
      const cnpj = this.extrairCnpj(mensagem);
      const nome = this.extrairNomeFornecedorInformado(mensagem);
      if (nome) draft.fornecedor_nome_informado = nome;
      if (cnpj) draft.fornecedor_cnpj_informado = cnpj;
      if (draft.fornecedor_nome_informado && draft.fornecedor_cnpj_informado) {
        aplicacoes.push('registrei a identificação do fornecedor');
        handled = true;
        houveEscrita = true;
      }
    }

    const periodo = this.extrairPeriodoTexto(mensagem, {
      contrato,
      draft,
      ultimaMedicao: contexto.ultima_medicao,
    });
    const podeAtualizarPeriodo =
      podeUsarFerramenta('atualizar_periodo') ||
      etapaAntesDaMensagem === 'PERIODO';
    plano.push({
      id: 'periodo',
      titulo: 'interpretar período da medição',
      status:
        periodo && podeAtualizarPeriodo ? 'planned' : 'skipped',
      confianca: periodo ? 'high' : 'low',
      motivo: periodo
        ? 'Encontrei duas datas na mensagem'
        : 'Nenhum período completo foi identificado',
    });
    if (periodo && podeAtualizarPeriodo) {
      if (!draft.periodo_inicio || !draft.periodo_fim) {
        draft.periodo_inicio = periodo.inicio;
        draft.periodo_fim = periodo.fim;
        draft.competencia =
          draft.competencia || this.derivarCompetencia(periodo.fim);
        aplicacoes.push(
          `registrei o período ${this.formatDateBr(periodo.inicio)} a ${this.formatDateBr(periodo.fim)}`,
        );
        this.marcarAcao(plano, 'periodo', 'applied');
        handled = true;
        houveEscrita = true;
      } else if (
        draft.periodo_inicio !== periodo.inicio ||
        draft.periodo_fim !== periodo.fim
      ) {
        this.marcarAcao(
          plano,
          'periodo',
          'blocked',
          'Já existe período preenchido; preciso confirmação para trocar.',
        );
      }
    }

    const competencia = this.normalizarCompetencia(mensagem);
    const competenciaPorMes = !competencia
      ? this.normalizarCompetenciaComAnoDoPeriodo(mensagem, draft)
      : null;
    plano.push({
      id: 'competencia',
      titulo: 'interpretar competência',
      status:
        (competencia || /automatic|auto|pode usar|usar/i.test(mensagem)) &&
        podeUsarFerramenta('atualizar_competencia')
          ? 'planned'
          : 'skipped',
      confianca: competencia ? 'high' : 'medium',
    });
    if (competencia && draft.competencia !== competencia) {
      draft.competencia = competencia;
      aplicacoes.push(`defini a competência como ${competencia}`);
      this.marcarAcao(plano, 'competencia', 'applied');
      handled = true;
      houveEscrita = true;
      if (
        draft.periodo_inicio &&
        draft.periodo_fim &&
        this.periodoPareceMesCheio(draft.periodo_inicio, draft.periodo_fim)
      ) {
        confirmacaoPendente = { tipo: 'CONFIRMAR_MES_CHEIO' };
      }
    } else if (competenciaPorMes && draft.competencia !== competenciaPorMes) {
      this.marcarAcao(plano, 'competencia', 'planned');
      confirmacaoPendente = {
        tipo: 'CONFIRMAR_COMPETENCIA',
        competencia: competenciaPorMes,
      };
      handled = true;
    } else if (
      /automatic|auto|pode usar|usar/i.test(mensagem) &&
      draft.periodo_fim &&
      !draft.competencia
    ) {
      draft.competencia = this.derivarCompetencia(draft.periodo_fim);
      aplicacoes.push(`defini a competência automática como ${draft.competencia}`);
      this.marcarAcao(plano, 'competencia', 'applied');
      handled = true;
      houveEscrita = true;
    } else if (
      /automatic|auto|pode usar|usar/i.test(mensagem) &&
      !draft.periodo_fim
    ) {
      this.marcarAcao(
        plano,
        'competencia',
        'blocked',
        'Preciso do período para calcular a competência automática.',
      );
    }

    const numeroNf =
      this.extrairNumeroNF(mensagem) ||
      (etapaAntesDaMensagem === 'NF'
        ? this.extrairNumeroNfAvulso(mensagem)
        : null);
    const podeInterpretarNotaFiscal =
      /\bnf\b|\bnota\b/i.test(mensagem) || etapaAntesDaMensagem === 'NF';
    const valorNfExplicito = /\b(valor|total|bruto|r\$)\b/i.test(mensagem);
    const dataNf = podeInterpretarNotaFiscal
      ? this.extrairDataAvulsa(mensagem)
      : null;
    const valorNf =
      podeInterpretarNotaFiscal && valorNfExplicito
        ? this.extrairMoedaIgnorandoDatas(mensagem)
        : null;
    plano.push({
      id: 'nf',
      titulo: 'atualizar dados da nota fiscal',
      status:
        (numeroNf || dataNf || valorNf != null) &&
        podeUsarFerramenta('atualizar_nota_fiscal')
          ? 'planned'
          : 'skipped',
      confianca: numeroNf || dataNf || valorNf != null ? 'medium' : 'low',
    });
    if (
      (numeroNf || dataNf || valorNf != null) &&
      podeUsarFerramenta('atualizar_nota_fiscal')
    ) {
      if (numeroNf) draft.nota_fiscal_numero = numeroNf;
      if (dataNf) draft.nota_fiscal_data = dataNf;
      if (valorNf != null) draft.nota_fiscal_valor = valorNf;
      nfAtualizada = numeroNf != null || dataNf != null || valorNf != null;
      if (nfAtualizada) {
        aplicacoes.push('atualizei os dados da nota fiscal');
        this.marcarAcao(plano, 'nf', 'applied');
        handled = true;
        houveEscrita = true;
      }
    }

    plano.push({
      id: 'discriminacoes',
      titulo: 'atualizar discriminações',
      status:
        /reaproveitar|última|ultima/i.test(mensagem) ||
        /[-:=]\s*[\d.,]+/.test(mensagem) &&
        podeUsarFerramenta('atualizar_discriminacoes')
          ? 'planned'
          : 'skipped',
      confianca: 'medium',
    });
    if (
      /reaproveitar|Ãºltima|ultima/i.test(mensagem) &&
      /discrimin/i.test(mensagem) &&
      podeUsarFerramenta('atualizar_discriminacoes')
    ) {
      draft.discriminacoes = await this.medicaoService.sugerirDiscriminacoes(
        contrato.id,
      );
      if ((draft.discriminacoes || []).length > 0) {
        aplicacoes.push('reaproveitei as discriminações da última medição');
        this.marcarAcao(plano, 'discriminacoes', 'applied');
        handled = true;
      } else {
        this.marcarAcao(
          plano,
          'discriminacoes',
          'blocked',
          'Não encontrei discriminações anteriores para reaproveitar.',
        );
      }
    } else {
      const valorBase = Number(
        draft.nota_fiscal_valor || draft.valor_medido || 0,
      );
      const discriminacoes = await this.extrairDiscriminacoesDaMensagem(
        mensagem,
        valorBase,
      );
      if (
        discriminacoes.length > 0 &&
        podeUsarFerramenta('atualizar_discriminacoes')
      ) {
        draft.discriminacoes = discriminacoes;
        aplicacoes.push('atualizei as discriminações');
        this.marcarAcao(plano, 'discriminacoes', 'applied');
        handled = true;
        houveEscrita = true;
      }
    }

    plano.push({
      id: 'medicao',
      titulo: 'preencher execução da medição',
      status: 'skipped',
      confianca: 'medium',
    });
    if (this.medicaoService.isServicoContinuado(contrato)) {
      if (
        /valor medido|valor do per[ií]odo|medi[cç][aã]o/i.test(mensagem) ||
        this.determinarEtapaAtual(draft, contrato) === 'MEDICAO'
      ) {
        const valorMedido = this.extrairMoeda(mensagem);
        if (valorMedido != null && valorMedido > 0) {
          draft.valor_medido = valorMedido;
          aplicacoes.push(
            `defini o valor medido em ${this.formatCurrency(valorMedido)}`,
          );
          this.marcarAcao(plano, 'medicao', 'applied');
          handled = true;
        } else {
          this.marcarAcao(
            plano,
            'medicao',
            'blocked',
            'Identifiquei intenção de informar a medição, mas sem um valor válido.',
          );
        }
      }
    } else if (
      /item\s*\d+\s*[:=]/i.test(mensagem) ||
      /^\s*\d+\s*[:=]/im.test(mensagem)
    ) {
      const itensDisponiveis = await this.itemCronogramaRepository.find({
        where: { contrato_id: contrato.id },
        order: { numero_item: 'ASC' },
      });
      const itensExtraidos = await this.extrairItensCronogramaDaMensagem(
        mensagem,
        itensDisponiveis,
      );
      if (itensExtraidos.length > 0) {
        draft.itens = itensExtraidos;
        aplicacoes.push(`preenchi ${itensExtraidos.length} item(ns) da medição`);
        this.marcarAcao(plano, 'medicao', 'applied');
        handled = true;
      } else {
        this.marcarAcao(
          plano,
          'medicao',
          'blocked',
          'A mensagem parece citar itens, mas não consegui fechar quantidades válidas.',
        );
      }
    } else if (/etapa\s*\d+\s*[:=]/i.test(mensagem)) {
      const etapasDisponiveis = await this.etapaRepository.find({
        where: { contrato_id: contrato.id },
        order: { numero_etapa: 'ASC' },
      });
      const etapasExtraidas = await this.extrairEtapasDaMensagem(
        mensagem,
        etapasDisponiveis,
      );
      if (etapasExtraidas.length > 0) {
        draft.itens = etapasExtraidas;
        aplicacoes.push(`preenchi ${etapasExtraidas.length} etapa(s) da medição`);
        this.marcarAcao(plano, 'medicao', 'applied');
        handled = true;
      } else {
        this.marcarAcao(
          plano,
          'medicao',
          'blocked',
          'A mensagem parece citar etapas, mas não consegui fechar percentuais ou valores válidos.',
        );
      }
    }

    plano.push({
      id: 'observacoes',
      titulo: 'atualizar observações finais',
      status:
        /observa/i.test(mensagem) || /sem observ/i.test(mensagem)
          ? 'planned'
          : 'skipped',
      confianca: 'medium',
    });
    if (/sem observ/i.test(mensagem)) {
      draft.observacoes = '';
      aplicacoes.push('registrei que não há observações adicionais');
      this.marcarAcao(plano, 'observacoes', 'applied');
      handled = true;
    } else if (
      /observa/i.test(mensagem) ||
      (this.determinarEtapaAtual(draft, contrato) === 'OBSERVACOES' &&
        mensagem.trim().length > 6)
    ) {
      const observacoes = mensagem
        .replace(/^.*observa(?:Ã§|c)[aÃ£]o(?:es)?[:\s-]*/i, '')
        .trim();
      if (observacoes) {
        draft.observacoes = observacoes;
        aplicacoes.push('atualizei as observações do boletim');
        this.marcarAcao(plano, 'observacoes', 'applied');
        handled = true;
      }
    }

    if (nfAtualizada) {
      plano.push({
        id: 'auto_nf',
        titulo: 'usar contexto do contrato para completar a medição com base na NF',
        status: 'planned',
        confianca: 'medium',
      });
      await this.aplicarPreenchimentoAutomaticoPosNf(contrato, draft, null);
      if (
        this.medicaoService.isServicoContinuado(contrato) &&
        Number(draft.valor_medido || 0) > 0
      ) {
        aplicacoes.push(
          'usei a nota para preencher automaticamente o valor medido',
        );
        this.marcarAcao(plano, 'auto_nf', 'applied');
      } else if ((draft.itens || []).length > 0) {
        aplicacoes.push(
          'usei a nota para sugerir automaticamente a execução da medição',
        );
        this.marcarAcao(plano, 'auto_nf', 'applied');
      } else {
        this.marcarAcao(
          plano,
          'auto_nf',
          'blocked',
          'Ainda não consegui inferir a execução completa só a partir da NF e da estrutura do contrato.',
        );
      }
    }

    if (!handled) {
      return {
        handled: false,
        plano_agente: {
          ...(planejamentoAgente as unknown as Record<string, any>),
          acoes: plano,
        },
        ultima_analise_agente:
          (planejamentoAgente.llm as Record<string, any> | null) || null,
      };
    }

    const orientacao = await this.montarOrientacaoProximaEtapa(contrato, draft);
    let resposta = this.montarRespostaAgenteV2(
      aplicacoes,
      orientacao,
      draft,
      contrato,
      plano,
      contexto.resumo as Record<string, any> | null,
    );
    if (confirmacaoPendente?.tipo === 'CONFIRMAR_COMPETENCIA') {
      resposta = `Entendido. Para completar o formato correto, confirme a competência **${confirmacaoPendente.competencia}**. Está correto?`;
    } else if (confirmacaoPendente?.tipo === 'CONFIRMAR_MES_CHEIO') {
      resposta = `Ótimo! Competência registrada: **${draft.competencia}**.\n\nConsiderando que o período é de **${this.formatDateBr(draft.periodo_inicio!)} a ${this.formatDateBr(draft.periodo_fim!)}** (mês integral), a quantidade é **1 mês**. Confirma?`;
    }
    return {
      handled: true,
      resposta,
      confirmacao_pendente: confirmacaoPendente,
      plano_agente: {
        ...(planejamentoAgente as unknown as Record<string, any>),
        acoes: plano,
      },
      ultima_analise_agente:
        (planejamentoAgente.llm as Record<string, any> | null) || null,
    };
  }

  private async processarMensagemComoAgenteV3(
    session: MedicaoChatSession,
    mensagem: string,
    contrato: Contrato,
    draft: MedicaoChatDraft,
    fornecedorId: string,
  ): Promise<ResultadoAgente> {
    const contexto = await this.carregarContextoAssistido(contrato);
    const planoAgente = await this.medicaoChatAgentService.planejarTurno({
      contrato: {
        id: contrato.id,
        numero_contrato: contrato.numero_contrato,
        modalidade_execucao: contrato.modalidade_execucao,
        categoria: contrato.categoria,
      },
      resumo: contexto.resumo as Record<string, any>,
      draft,
      contexto: {
        usar_itens_cronograma: contexto.usar_itens_cronograma,
        itens_cronograma: contexto.itens_cronograma.slice(0, 10).map((item) => ({
          numero_item: item.numero_item,
          unidade_medida: item.unidade_medida,
          valor_mensal: Number(item.valor_mensal || 0),
          valor_total: Number(item.valor_total || 0),
          valor_unitario: Number(item.valor_unitario || 0),
        })),
        etapas_cronograma: contexto.etapas_cronograma
          .slice(0, 10)
          .map((item) => ({
            numero_etapa: item.numero_etapa,
            valor_previsto: Number(item.valor_previsto || 0),
            percentual_fisico: Number(item.percentual_fisico || 0),
          })),
        ultima_medicao: contexto.ultima_medicao
          ? {
              numero_medicao: contexto.ultima_medicao.numero_medicao,
              valor_medido: Number(contexto.ultima_medicao.valor_medido || 0),
              competencia: contexto.ultima_medicao.competencia,
            }
          : null,
      },
      mensagem,
      tem_snapshot_draft: Boolean(session.ultimo_snapshot_draft),
    });

    if (
      planoAgente.intencao === 'negative_feedback' &&
      planoAgente.deve_reverter_ultima_inferencia &&
      session.ultimo_snapshot_draft
    ) {
      this.substituirDraft(
        draft,
        (session.ultimo_snapshot_draft || {}) as MedicaoChatDraft,
      );
      session.ultimo_snapshot_draft = null;
      const orientacao = await this.montarOrientacaoProximaEtapa(contrato, draft);
      const resposta = await this.montarRespostaConversacionalChat({
        mensagem,
        contrato,
        draft,
        contexto,
        planoAgente,
        respostaBase: `${planoAgente.resposta_base} ${orientacao}`,
        houveEscrita: false,
        historico: session.historico_ia || [],
      });
      return {
        handled: true,
        resposta,
        plano_agente: planoAgente as unknown as Record<string, any>,
        ultima_analise_agente:
          (planoAgente.llm as Record<string, any> | null) || null,
      };
    }

    if (
      planoAgente.intencao === 'greeting' ||
      planoAgente.intencao === 'help' ||
      planoAgente.intencao === 'negative_feedback' ||
      planoAgente.intencao === 'unknown'
    ) {
      const orientacao = await this.montarPerguntaObjetivaProximaEtapa(
        contrato,
        draft,
      );
      const resposta = await this.montarRespostaConversacionalChat({
        mensagem,
        contrato,
        draft,
        contexto,
        planoAgente,
        respostaBase: `${planoAgente.resposta_base} ${orientacao}`,
        houveEscrita: false,
        historico: session.historico_ia || [],
      });
      return {
        handled: true,
        resposta,
        plano_agente: planoAgente as unknown as Record<string, any>,
        ultima_analise_agente:
          (planoAgente.llm as Record<string, any> | null) || null,
      };
    }

    const draftAntes = this.clonarJson(draft);
    const resultado = await this.processarMensagemComoAgenteV2(
      session,
      mensagem,
      contrato,
      draft,
      fornecedorId,
    );
    const houveMudanca =
      JSON.stringify(draftAntes) !== JSON.stringify(this.clonarJson(draft));

    if (resultado.handled && houveMudanca) {
      session.ultimo_snapshot_draft = draftAntes as Record<string, any>;
    }

    if (resultado.handled) {
      resultado.resposta = await this.montarRespostaConversacionalChat({
        mensagem,
        contrato,
        draft,
        contexto,
        planoAgente,
        respostaBase: resultado.resposta || '',
        houveEscrita: houveMudanca,
        historico: session.historico_ia || [],
      });
    }

    return {
      ...resultado,
      plano_agente: {
        ...(planoAgente as unknown as Record<string, any>),
        legado: resultado.plano_agente || null,
      },
      ultima_analise_agente:
        (planoAgente.llm as Record<string, any> | null) ||
        resultado.ultima_analise_agente ||
        null,
    };
  }

  private montarRespostaAgenteV2(
    aplicacoes: string[],
    orientacao: string,
    draft: MedicaoChatDraft,
    contrato: Contrato,
    plano: AcaoAgente[],
    resumo?: Record<string, any> | null,
  ) {
    const pendencias = this.calcularPendencias(draft, contrato);
    const avisos = this.validarConformidadeContrato(draft, contrato, resumo);
    const aplicadas = plano
      .filter((item) => item.status === 'applied')
      .map((item) => item.titulo.toLowerCase());
    const bloqueios = plano
      .filter((item) => item.status === 'blocked' && item.blocker)
      .map((item) => item.blocker as string);
    const blocos: string[] = [];

    blocos.push(
      aplicacoes.length > 0
        ? `Entendi sua mensagem e já atualizei o rascunho: ${this.listarNatural(aplicacoes)}.`
        : 'Analisei sua mensagem e mantive o rascunho atualizado.',
    );
    if (avisos.length > 0) {
      blocos.push(`⚠️ ${avisos.join(' ')}`);
    }
    if (aplicadas.length > 0) {
      blocos.push(
        `Plano executado neste turno: ${this.listarNatural(aplicadas)}.`,
      );
    }
    if (bloqueios.length > 0) {
      blocos.push(
        `O que eu ainda bloqueei por segurança: ${this.listarNatural(bloqueios)}.`,
      );
    }
    if (pendencias.length === 0) {
      blocos.push(
        'O boletim ficou **praticamente pronto**. Revise os dados ao lado e siga para o envio manual ao ateste.',
      );
      return blocos.join(' ');
    }
    blocos.push(`O que ainda falta: ${orientacao}`);
    blocos.push(`Ainda falta preencher: ${this.pendenciasParaLabels(pendencias)}.`);
    return blocos.join(' ');
  }

  private async montarRespostaConversacionalChat(input: {
    mensagem: string;
    contrato: Contrato;
    draft: MedicaoChatDraft;
    contexto: ContextoAssistidoContrato;
    planoAgente: Record<string, any>;
    respostaBase: string;
    houveEscrita: boolean;
    historico: Array<{ role: 'assistant' | 'user' | 'system'; content: string; created_at: string }>;
  }): Promise<string> {
    const pendencias = this.calcularPendencias(input.draft, input.contrato);
    const avisos = this.validarConformidadeContrato(
      input.draft,
      input.contrato,
      input.contexto.resumo as Record<string, any> | null,
    );
    const resumoContrato = this.montarResumoContextoContrato(input.contexto);
    const historicoCurto = input.historico
      .slice(-6)
      .map((item) => ({
        role: item.role,
        content: String(item.content || '').slice(0, 900),
      }));

    const payload = {
      mensagem_usuario: input.mensagem,
      resposta_base_obrigatoria: input.respostaBase,
      houve_escrita_no_rascunho: input.houveEscrita,
      contrato: {
        numero_contrato: input.contrato.numero_contrato,
        objeto: input.contrato.objeto,
        modalidade_execucao: input.contrato.modalidade_execucao,
        categoria: input.contrato.categoria,
        vigencia_inicio: this.formatDateOnly(input.contrato.data_vigencia_inicio),
        vigencia_fim: this.formatDateOnly(input.contrato.data_vigencia_fim),
      },
      resumo_contrato: resumoContrato,
      rascunho_atual: {
        periodo_inicio: input.draft.periodo_inicio || null,
        periodo_fim: input.draft.periodo_fim || null,
        competencia: input.draft.competencia || null,
        nota_fiscal_numero: input.draft.nota_fiscal_numero || null,
        nota_fiscal_valor: input.draft.nota_fiscal_valor ?? null,
        nota_fiscal_data: input.draft.nota_fiscal_data || null,
        valor_medido: input.draft.valor_medido ?? null,
        itens_count: Array.isArray(input.draft.itens) ? input.draft.itens.length : 0,
        discriminacoes_count: Array.isArray(input.draft.discriminacoes)
          ? input.draft.discriminacoes.length
          : 0,
        observacoes_preenchidas: input.draft.observacoes != null,
      },
      pendencias,
      avisos,
      plano_agente: {
        intencao: input.planoAgente?.intencao,
        resumo_intencao: input.planoAgente?.resumo_intencao,
        ferramentas: input.planoAgente?.ferramentas,
        acoes_legado: input.planoAgente?.legado?.acoes,
      },
      contexto_execucao: {
        usar_itens_cronograma: input.contexto.usar_itens_cronograma,
        ultima_medicao: input.contexto.ultima_medicao
          ? {
              numero_medicao: input.contexto.ultima_medicao.numero_medicao,
              valor_medido: Number(input.contexto.ultima_medicao.valor_medido || 0),
              competencia: input.contexto.ultima_medicao.competencia,
            }
          : null,
        amostra_itens_cronograma: input.contexto.itens_cronograma
          .slice(0, 8)
          .map((item) => ({
            numero_item: item.numero_item,
            descricao: item.descricao,
            unidade_medida: item.unidade_medida,
            valor_mensal: Number(item.valor_mensal || 0),
            valor_unitario: Number(item.valor_unitario || 0),
          })),
        amostra_etapas: input.contexto.etapas_cronograma
          .slice(0, 8)
          .map((item) => ({
            numero_etapa: item.numero_etapa,
            descricao: item.descricao,
            valor_previsto: Number(item.valor_previsto || 0),
          })),
      },
      historico_recente: historicoCurto,
    };

    const systemPrompt = `Você é o chat de IA de medição do Portal DCP.
Converse em português brasileiro, de forma natural, objetiva e útil para um fornecedor preencher uma medição de contrato público.

Regras obrigatórias:
- Use os fatos do JSON. Não invente valores, datas, anexos, itens, percentuais ou permissões.
- Se resposta_base_obrigatoria disser que algo foi aplicado, preserva esse fato.
- Se houve_escrita_no_rascunho for false, diga claramente que não alterou o rascunho quando isso for relevante.
- Só informe "valor medido" atual quando rascunho_atual.valor_medido estiver preenchido ou quando resposta_base_obrigatoria trouxer esse valor explicitamente. Não use ultima_medicao como valor da medição atual.
- "Discriminações da despesa" são a composição financeira do boletim, como ISS, impostos/taxas, despesas operacionais, serviços/mão de obra, materiais, etc. Não trate esse campo como descrição do objeto executado.
- Quando a pendência for DISCRIMINACOES, peça percentuais ou valores da composição financeira, por exemplo "ISS 2%, Despesas Operacionais 48%, Serviços 50%", ou ofereça reaproveitar a última medição se existir.
- Não prometa submissão automática, ateste, aprovação ou assinatura. O envio final continua manual.
- Quando houver pendências, faça uma única pergunta ou pedido de próximo passo, com exemplo curto.
- Quando houver avisos, destaque sem alarmismo.
- Evite linguagem robótica como "plano executado" ou "ferramenta". O usuário quer conversar, não ver logs internos.
- Responda em markdown simples, com no máximo 3 parágrafos curtos.`;

    try {
      const resposta = await this.iaService.chatComSistemaPersonalizado(
        [
          {
            role: 'user',
            content: JSON.stringify(payload),
          },
        ],
        systemPrompt,
      );
      const normalizada = this.normalizarRespostaChatIa(resposta);
      return normalizada || input.respostaBase;
    } catch (error: any) {
      this.logger.warn(
        `Falha ao gerar resposta conversacional da medição: ${error.message}`,
      );
      return input.respostaBase;
    }
  }

  private normalizarRespostaChatIa(resposta: string) {
    const texto = String(resposta || '')
      .replace(/^```(?:markdown|md)?/i, '')
      .replace(/```$/i, '')
      .trim();
    if (!texto) return '';
    return texto.length > 1800 ? `${texto.slice(0, 1800).trim()}...` : texto;
  }

  private marcarAcao(
    plano: AcaoAgente[],
    id: string,
    status: AcaoAgenteStatus,
    blocker?: string,
  ) {
    const alvo = plano.find((item) => item.id === id);
    if (!alvo) return;
    alvo.status = status;
    if (blocker) {
      alvo.blocker = blocker;
    }
  }

  private substituirDraft(destino: MedicaoChatDraft, origem: MedicaoChatDraft) {
    for (const chave of Object.keys(destino)) {
      delete (destino as Record<string, any>)[chave];
    }
    Object.assign(destino, this.clonarJson(origem));
  }

  private clonarJson<T>(valor: T): T {
    return JSON.parse(JSON.stringify(valor));
  }

  private aplicarIdentificacao(
    mensagem: string,
    draft: MedicaoChatDraft,
  ): ResultadoEtapaChat {
    const cnpj = this.extrairCnpj(mensagem);
    const nome = this.extrairNomeFornecedorInformado(mensagem);

    if (nome) draft.fornecedor_nome_informado = nome;
    if (cnpj) draft.fornecedor_cnpj_informado = cnpj;

    if (!draft.fornecedor_nome_informado || !draft.fornecedor_cnpj_informado) {
      return {
        resposta:
          'Para iniciar, preciso da identificação completa. Pode me informar o **nome/razão social** e o **CNPJ da empresa**?',
      };
    }

    return {
      resposta: `Obrigado! Identificação registrada:\n\n**Empresa:** ${draft.fornecedor_nome_informado}\n**CNPJ:** ${this.formatarCnpj(draft.fornecedor_cnpj_informado)}\n\nAgora, por favor, informe as **datas de início e fim do período de medição**. Pode enviar como "01/04/2026 a 30/04/2026" ou "01 04 a 30 04" quando o ano estiver claro pela vigência.`,
    };
  }

  private aplicarPeriodo(
    mensagem: string,
    draft: MedicaoChatDraft,
    contrato?: Contrato,
  ): ResultadoEtapaChat {
    const parsed = this.extrairPeriodoTexto(mensagem, { contrato, draft });
    if (!parsed) {
      return {
        resposta:
          'Não consegui entender o período. Me envie como "01/04/2026 a 30/04/2026", "2026-04-01 a 2026-04-30" ou, quando o ano estiver claro pela vigência, "01 04 a 30 04".',
      };
    }

    if (
      (draft.periodo_inicio && draft.periodo_inicio !== parsed.inicio) ||
      (draft.periodo_fim && draft.periodo_fim !== parsed.fim)
    ) {
      return {
        resposta:
          `Você está alterando o período para **${this.formatDateBr(parsed.inicio)} a ${this.formatDateBr(parsed.fim)}**. Responda "sim" para confirmar a troca.`,
        confirmacao_pendente: {
          tipo: 'ALTERAR_PERIODO',
          periodo_inicio: parsed.inicio,
          periodo_fim: parsed.fim,
        },
      };
    }

    draft.periodo_inicio = parsed.inicio;
    draft.periodo_fim = parsed.fim;
    if (!draft.competencia) {
      draft.competencia = this.derivarCompetencia(parsed.fim);
    }
    return {
      resposta: `Período registrado: **${this.formatDateBr(parsed.inicio)} a ${this.formatDateBr(parsed.fim)}**. Agora me confirme a **competência** no formato MÊS/ANO ou responda "usar automática" para manter **${draft.competencia}**.`,
    };
  }

  private aplicarCompetencia(
    mensagem: string,
    draft: MedicaoChatDraft,
  ): ResultadoEtapaChat {
    if (/automatic|auto|pode usar|usar/i.test(mensagem) && draft.periodo_fim) {
      draft.competencia = this.derivarCompetencia(draft.periodo_fim);
      return {
        resposta: `Competência definida como **${draft.competencia}**. Se quiser, já me informe os dados da NF (número, valor e data) ou envie o arquivo da nota.`,
      };
    }

    const competencia = this.normalizarCompetencia(mensagem);
    const competenciaPorMes = !competencia
      ? this.normalizarCompetenciaComAnoDoPeriodo(mensagem, draft)
      : null;
    if (competenciaPorMes) {
      return {
        resposta: `Entendido. Para completar o formato correto, confirme a competência **${competenciaPorMes}**. Está correto?`,
        confirmacao_pendente: {
          tipo: 'CONFIRMAR_COMPETENCIA',
          competencia: competenciaPorMes,
        },
      };
    }
    if (!competencia) {
      return {
        resposta:
          'Não consegui validar a competência. Me envie algo como **ABRIL/2026**.',
      };
    }
    draft.competencia = competencia;
    return this.respostaAposCompetencia(draft);
  }

  private respostaAposCompetencia(draft: MedicaoChatDraft): ResultadoEtapaChat {
    if (
      draft.periodo_inicio &&
      draft.periodo_fim &&
      this.periodoPareceMesCheio(draft.periodo_inicio, draft.periodo_fim)
    ) {
      return {
        resposta: `Ótimo! Competência registrada: **${draft.competencia}**.\n\nConsiderando que o período é de **${this.formatDateBr(draft.periodo_inicio)} a ${this.formatDateBr(draft.periodo_fim)}** (mês integral), a quantidade é **1 mês**. Confirma?`,
        confirmacao_pendente: {
          tipo: 'CONFIRMAR_MES_CHEIO',
        },
      };
    }

    return {
      resposta:
        'Competência registrada. Agora informe a **quantidade medida** do período. Para mês cheio, responda **1 mês**.',
    };
  }

  private async aplicarNotaFiscal(
    mensagem: string,
    contrato: Contrato,
    draft: MedicaoChatDraft,
  ): Promise<ResultadoEtapaChat> {
    if (/sem nf|sem nota|depois|pular/i.test(mensagem)) {
      draft.nota_fiscal_numero = draft.nota_fiscal_numero || null;
      draft.nota_fiscal_valor = draft.nota_fiscal_valor || null;
      draft.nota_fiscal_data = draft.nota_fiscal_data || null;
      const orientacao = await this.montarOrientacaoProximaEtapa(contrato, draft);
      return {
        resposta: `Tudo bem. Vamos seguir sem preencher a NF agora.${orientacao ? ` ${orientacao}` : ''}`,
      };
    }

    const numero =
      this.extrairNumeroNF(mensagem) || this.extrairNumeroNfAvulso(mensagem);
    const valor = /\b(valor|total|bruto|r\$)\b/i.test(mensagem)
      ? this.extrairMoedaIgnorandoDatas(mensagem)
      : null;
    const data = this.extrairDataAvulsa(mensagem);

    if (!numero && valor == null && !data) {
      return {
        resposta:
          'Não consegui reconhecer os dados da nota. Você pode me mandar em um texto mais direto ou enviar o PDF/XML/imagem da NF.',
      };
    }

    if (numero) draft.nota_fiscal_numero = numero;
    if (valor != null) draft.nota_fiscal_valor = valor;
    if (data) draft.nota_fiscal_data = data;
    const orientacao = await this.montarOrientacaoProximaEtapa(contrato, draft);

    return {
      resposta: `Dados da NF atualizados.${orientacao ? ` ${orientacao}` : ' Agora me informe a execução desta medição. Para itens/etapas, pode mandar linhas como "item 1 = 2,5" ou "etapa 2 = 35%".'}`,
    };
  }

  private async aplicarMedicao(
    mensagem: string,
    contrato: Contrato,
    draft: MedicaoChatDraft,
  ): Promise<ResultadoEtapaChat> {
    if (/^(sim|confirmo|pode|ok|isso|correto)\b/i.test(mensagem.trim())) {
      const aplicado = await this.aplicarQuantidadeMesCheioSePossivel(
        contrato,
        draft,
      );
      if (aplicado) {
        return {
          resposta:
            'Perfeito! Quantidade registrada: **1 mês**.\n\nAgora, por favor, informe o **número da Nota Fiscal** correspondente a esta medição.',
        };
      }
    }

    if (this.medicaoService.isServicoContinuado(contrato)) {
      const valor = this.extrairMoeda(mensagem);
      if (valor == null || valor <= 0) {
        return {
          resposta:
            'Para este contrato, preciso do **valor medido no período**. Exemplo: "valor 36598,50".',
        };
      }
      draft.valor_medido = valor;
      return {
        resposta:
          'Valor medido registrado. Agora me informe a **composição financeira da despesa**, como "ISS 2%, Despesas Operacionais 48%, Serviços 50%", ou diga "reaproveitar última".',
      };
    }

    if (await this.medicaoService.usarItensCronograma(contrato.id)) {
      const itensDisponiveis = await this.itemCronogramaRepository.find({
        where: { contrato_id: contrato.id },
        order: { numero_item: 'ASC' },
      });
      const itensExtraidos = await this.extrairItensCronogramaDaMensagem(
        mensagem,
        itensDisponiveis,
      );
      if (itensExtraidos.length === 0) {
        return {
          resposta:
            'Não consegui identificar itens e quantidades. Me envie algo como "item 1 = 2, item 3 = 4,5".',
        };
      }
      draft.itens = itensExtraidos;
      return {
        resposta:
          'Itens da medição registrados. Agora me informe a **composição financeira da despesa**, como "ISS 2%, Despesas Operacionais 48%, Serviços 50%", ou diga "reaproveitar última".',
      };
    }

    const etapasDisponiveis = await this.etapaRepository.find({
      where: { contrato_id: contrato.id },
      order: { numero_etapa: 'ASC' },
    });
    const etapasExtraidas = await this.extrairEtapasDaMensagem(
      mensagem,
      etapasDisponiveis,
    );
    if (etapasExtraidas.length === 0) {
      return {
        resposta:
          'Não consegui identificar etapas e percentuais/valores. Me envie algo como "etapa 1 = 20%" ou "etapa 2 = 15000".',
      };
    }
    draft.itens = etapasExtraidas;
    return {
      resposta:
        'Execução por etapas registrada. Agora me informe a **composição financeira da despesa**, como "ISS 2%, Despesas Operacionais 48%, Serviços 50%", ou diga "reaproveitar última".',
    };
  }

  private async aplicarDiscriminacoes(
    mensagem: string,
    contrato: Contrato,
    draft: MedicaoChatDraft,
    fornecedorId: string,
  ): Promise<ResultadoEtapaChat> {
    const confirmouReaproveitar =
      /^(sim|confirmo|pode|ok|isso|replicar|mesmo|igual)\b/i.test(
        mensagem.trim(),
      );

    if (confirmouReaproveitar) {
      const sugestoes = await this.medicaoService.sugerirDiscriminacoes(
        contrato.id,
      );
      if (sugestoes.length > 0) {
        draft.discriminacoes = sugestoes;
        return {
          resposta: `Perfeito! Percentuais registrados:\n${this.formatarDiscriminacoesResumo(sugestoes)}\n\nHá alguma **observação** sobre a execução dos serviços no período? Campo opcional; pode responder "nenhuma".`,
        };
      }

      return {
        resposta:
          'Ainda não encontrei discriminações anteriores para reaproveitar. Me envie em linhas como "ISS 2%, Despesas Operacionais 48%, Serviços 50%".',
      };
    }

    if (/reaproveitar|última|ultima/i.test(mensagem)) {
      return {
        resposta:
          'Posso reaproveitar em bloco as discriminações da última medição deste contrato. Responda "sim" para confirmar.',
        confirmacao_pendente: {
          tipo: 'REAPROVEITAR_DISCRIMINACOES',
        },
      };
    }

    const valorBase = Number(draft.nota_fiscal_valor || draft.valor_medido || 0);
    const discriminacoes = await this.extrairDiscriminacoesDaMensagem(
      mensagem,
      valorBase,
    );
    if (discriminacoes.length === 0) {
      return {
        resposta:
          'Não consegui entender a composição financeira. Me envie percentuais ou valores, como "ISS 2%, Despesas Operacionais 48%, Serviços 50%".',
      };
    }
    draft.discriminacoes = discriminacoes;
    return {
      resposta:
        'Discriminações registradas. Por fim, me envie as observações do boletim ou responda "sem observações".',
    };
  }

  private formatarDiscriminacoesResumo(discriminacoes: any[]) {
    return discriminacoes
      .map((item) => {
        const percentual =
          item.percentual != null ? `${Number(item.percentual)}%` : null;
        const valor =
          item.valor != null ? this.formatCurrency(Number(item.valor)) : null;
        const detalhe = percentual || valor || 'registrado';
        return `- **${item.descricao}:** ${detalhe}`;
      })
      .join('\n');
  }

  private aplicarObservacoes(
    mensagem: string,
    draft: MedicaoChatDraft,
  ): ResultadoEtapaChat {
    draft.observacoes = /sem observ|nenhuma|n[aã]o\b|nao\b/i.test(mensagem)
      ? ''
      : mensagem.trim();
    return {
      resposta:
        'Observações registradas. O rascunho está atualizado. Revise o painel ao lado e, quando estiver tudo certo, use o envio manual para ateste.',
    };
  }

  private async processarConfirmacaoPendente(
    session: MedicaoChatSession,
    contrato: Contrato,
    draft: MedicaoChatDraft,
    confirmou: boolean,
  ): Promise<ResultadoEtapaChat> {
    const pendente = session.confirmacao_pendente || {};
    session.confirmacao_pendente = null;

    if (!confirmou) {
      return {
        resposta:
          'Tudo bem, mantive o que já estava preenchido. Pode me mandar a informação corrigida quando quiser.',
      };
    }

    switch (pendente.tipo) {
      case 'ALTERAR_PERIODO':
        draft.periodo_inicio = pendente.periodo_inicio;
        draft.periodo_fim = pendente.periodo_fim;
        draft.competencia = draft.competencia || this.derivarCompetencia(pendente.periodo_fim);
        return {
          resposta:
            `Período alterado para **${this.formatDateBr(pendente.periodo_inicio)} a ${this.formatDateBr(pendente.periodo_fim)}**. Agora me confirme a competência.`,
        };
      case 'CONFIRMAR_COMPETENCIA':
        draft.competencia = String(pendente.competencia || '');
        return this.respostaAposCompetencia(draft);
      case 'CONFIRMAR_MES_CHEIO':
        await this.aplicarQuantidadeMesCheioSePossivel(contrato, draft);
        return {
          resposta:
            'Perfeito! Quantidade registrada: **1 mês**.\n\nAgora, por favor, informe o **número da Nota Fiscal** correspondente a esta medição.',
        };
      case 'REAPROVEITAR_DISCRIMINACOES':
        draft.discriminacoes = await this.medicaoService.sugerirDiscriminacoes(
          contrato.id,
        );
        return {
          resposta:
            'Reaproveitei as discriminações da última medição. Se quiser ajustar algum valor depois, me envie as novas linhas normalmente. Agora você pode informar as observações finais.',
        };
      case 'ANEXO_NF': {
        const anexos = draft.anexos_pendentes || [];
        const alvo = anexos.find((item) => item.temp_path === pendente.temp_path);
        if (alvo && pendente.nf_sugerida) {
          if (pendente.nf_sugerida.nota_fiscal_numero) {
            draft.nota_fiscal_numero = pendente.nf_sugerida.nota_fiscal_numero;
          }
          if (pendente.nf_sugerida.nota_fiscal_valor != null) {
            draft.nota_fiscal_valor = Number(
              pendente.nf_sugerida.nota_fiscal_valor,
            );
          }
          if (pendente.nf_sugerida.nota_fiscal_data) {
            draft.nota_fiscal_data = pendente.nf_sugerida.nota_fiscal_data;
          }
          if (!draft.competencia && pendente.nf_sugerida.competencia) {
            draft.competencia = pendente.nf_sugerida.competencia;
          }
        }
        await this.aplicarPreenchimentoAutomaticoPosNf(
          contrato,
          draft,
          pendente.nf_sugerida || null,
        );
        const proximaOrientacao = await this.montarOrientacaoProximaEtapa(
          contrato,
          draft,
        );
        return {
          resposta:
            `Perfeito. A sugestão da NF foi aplicada ao rascunho e o arquivo ficou reservado para anexação ao boletim assim que a medição estiver materializada.${proximaOrientacao ? ` ${proximaOrientacao}` : ''}`,
        };
      }
      default:
        return {
          resposta: 'Confirmação aplicada ao rascunho.',
        };
    }
  }

  private async materializarDraft(
    session: MedicaoChatSession,
    contrato: Contrato,
    fornecedorId: string,
  ) {
    const draft = (session.draft || {}) as MedicaoChatDraft;
    const payload = this.converterDraftParaPayload(contrato, draft, fornecedorId);

    if (!this.podeMaterializar(contrato, payload)) {
      return session.medicao_id || null;
    }

    let medicaoId = session.medicao_id || null;

    if (!medicaoId) {
      const medicao = await this.medicaoService.criarMedicao(contrato.id, payload);
      medicaoId = medicao.id;
    } else {
      const medicao = await this.medicaoService.atualizarRascunhoAssistido(
        medicaoId,
        payload,
      );
      medicaoId = medicao.id;
    }

    if ((draft.discriminacoes || []).length > 0) {
      await this.medicaoService.salvarDiscriminacoes(
        medicaoId,
        fornecedorId,
        (draft.discriminacoes || []).map((item) => ({
          descricao: item.descricao,
          valor: Number(item.valor) || 0,
          percentual: Number(item.percentual) || 0,
        })),
      );
    }

    await this.materializarAnexosPendentes(medicaoId, session, fornecedorId);

    return medicaoId;
  }

  private converterDraftParaPayload(
    contrato: Contrato,
    draft: MedicaoChatDraft,
    fornecedorId: string,
  ) {
    return {
      periodo_inicio: draft.periodo_inicio!,
      periodo_fim: draft.periodo_fim!,
      competencia: draft.competencia || undefined,
      fornecedor_id: fornecedorId,
      fornecedor_nome: undefined,
      fornecedor_observacoes: draft.observacoes || undefined,
      observacoes: draft.observacoes || undefined,
      nota_fiscal_numero: draft.nota_fiscal_numero || undefined,
      nota_fiscal_valor: draft.nota_fiscal_valor ?? undefined,
      nota_fiscal_data: draft.nota_fiscal_data || undefined,
      valor_medido: draft.valor_medido ?? undefined,
      itens: (draft.itens || []) as any[],
    };
  }

  private podeMaterializar(contrato: Contrato, payload: any) {
    if (!payload.periodo_inicio || !payload.periodo_fim) return false;
    if (this.medicaoService.isServicoContinuado(contrato)) {
      return Number(payload.valor_medido) > 0;
    }
    return Array.isArray(payload.itens) && payload.itens.length > 0;
  }

  private async materializarAnexosPendentes(
    medicaoId: string,
    session: MedicaoChatSession,
    fornecedorId: string,
  ) {
    const draft = (session.draft || {}) as MedicaoChatDraft;
    const pendentes = draft.anexos_pendentes || [];
    if (pendentes.length === 0) return;

    const destinoDir = join(this.uploadDir, 'medicoes', medicaoId);
    fs.mkdirSync(destinoDir, { recursive: true });
    const restantes: typeof pendentes = [];

    for (const anexo of pendentes) {
      if (!anexo.anexar_ao_boletim) {
        restantes.push(anexo);
        continue;
      }
      if (!fs.existsSync(anexo.temp_path)) continue;

      const ext = extname(anexo.nome_original).toLowerCase();
      const nomeArquivo = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      const destino = join(destinoDir, nomeArquivo);
      fs.copyFileSync(anexo.temp_path, destino);

      const tipo =
        anexo.mime_type === 'application/pdf'
          ? TipoAnexoMedicao.DOCUMENTO
          : TipoAnexoMedicao.FOTO;
      const url = this.uploadService.getFileUrl(`medicoes/${medicaoId}`, nomeArquivo);

      const registro = this.anexoRepository.create({
        medicao_id: medicaoId,
        tipo,
        nome_original: anexo.nome_original,
        nome_arquivo: nomeArquivo,
        mime_type: anexo.mime_type,
        tamanho_bytes: anexo.tamanho_bytes,
        url,
        descricao: anexo.descricao || undefined,
        enviado_por_id: fornecedorId,
        enviado_por_nome: 'Assistente IA',
        origem: 'fornecedor',
      });
      await this.anexoRepository.save(registro);
    }

    draft.anexos_pendentes = restantes;
    session.draft = draft;
  }

  private async montarRespostaSessao(
    session: MedicaoChatSession,
    contrato: Contrato,
  ) {
    const draft = (session.draft || {}) as MedicaoChatDraft;
    const medicao =
      session.medicao_id != null
        ? await this.medicaoService.buscarMedicao(session.medicao_id)
        : null;
    const resumo = await this.medicaoService.resumoMedicoes(contrato.id);
    const preview = medicao
      ? {
          modo: 'medicao',
          medicao,
          discriminacoes: await this.medicaoService.listarDiscriminacoes(
            medicao.id,
          ),
        }
      : {
          modo: 'draft',
          draft,
        };

    return {
      session: {
        id: session.id,
        status: session.status,
        etapa_atual: session.etapa_atual,
        medicao_id: session.medicao_id,
        pendencias: session.pendencias || [],
        historico_ia: session.historico_ia || [],
        confirmacao_pendente: session.confirmacao_pendente || null,
        plano_agente: session.plano_agente || null,
        ultima_analise_agente: session.ultima_analise_agente || null,
      },
      contrato: {
        id: contrato.id,
        numero_contrato: contrato.numero_contrato,
        objeto: contrato.objeto,
        modalidade_execucao: contrato.modalidade_execucao,
        categoria: contrato.categoria,
        data_vigencia_inicio: contrato.data_vigencia_inicio,
        data_vigencia_fim: contrato.data_vigencia_fim,
      },
      resumo,
      preview,
      contexto_assistido: await this.carregarContextoAssistido(contrato),
    };
  }

  private async carregarContextoAssistido(
    contrato: Contrato,
  ): Promise<ContextoAssistidoContrato> {
    const [resumo, medicoes, usarItensCronograma] = await Promise.all([
      this.medicaoService.resumoMedicoes(contrato.id),
      this.medicaoService.listarMedicoes(contrato.id),
      this.medicaoService.usarItensCronograma(contrato.id),
    ]);

    const [itensCronograma, etapasCronograma] = await Promise.all([
      usarItensCronograma
        ? this.itemCronogramaRepository.find({
            where: { contrato_id: contrato.id },
            order: { numero_item: 'ASC' },
          })
        : Promise.resolve([]),
      !usarItensCronograma && !this.medicaoService.isServicoContinuado(contrato)
        ? this.etapaRepository.find({
            where: { contrato_id: contrato.id },
            order: { numero_etapa: 'ASC' },
          })
        : Promise.resolve([]),
    ]);

    const medicoesRegistradas = medicoes.filter(
      (medicao) => medicao.status !== StatusMedicao.RASCUNHO,
    );
    const rascunhos = medicoes.filter(
      (medicao) => medicao.status === StatusMedicao.RASCUNHO,
    );
    const ultimaMedicao =
      medicoesRegistradas.length > 0
        ? medicoesRegistradas[medicoesRegistradas.length - 1]
        : null;
    const rascunhoAberto =
      rascunhos.length > 0 ? rascunhos[rascunhos.length - 1] : null;

    return {
      resumo,
      medicoes,
      usar_itens_cronograma: usarItensCronograma,
      itens_cronograma: itensCronograma,
      etapas_cronograma: etapasCronograma,
      ultima_medicao: ultimaMedicao,
      rascunho_aberto: rascunhoAberto,
    };
  }

  private async planejarComLlm(
    contrato: Contrato,
    draft: MedicaoChatDraft,
    mensagem: string,
  ): Promise<PlanejamentoLlmMedicao | null> {
    const contexto = await this.carregarContextoAssistido(contrato);
    return this.iaService.planejarAcoesMedicaoAssistida({
      contrato: {
        id: contrato.id,
        numero_contrato: contrato.numero_contrato,
        modalidade_execucao: contrato.modalidade_execucao,
        categoria: contrato.categoria,
      },
      resumo: contexto.resumo as Record<string, any>,
      draft: {
        periodo_inicio: draft.periodo_inicio,
        periodo_fim: draft.periodo_fim,
        competencia: draft.competencia,
        nota_fiscal_numero: draft.nota_fiscal_numero,
        nota_fiscal_valor: draft.nota_fiscal_valor,
        valor_medido: draft.valor_medido,
        observacoes: draft.observacoes,
        itens_count: Array.isArray(draft.itens) ? draft.itens.length : 0,
        discriminacoes_count: Array.isArray(draft.discriminacoes)
          ? draft.discriminacoes.length
          : 0,
      },
      contexto: {
        usar_itens_cronograma: contexto.usar_itens_cronograma,
        itens_cronograma: contexto.itens_cronograma.slice(0, 10).map((item) => ({
          numero_item: item.numero_item,
          unidade_medida: item.unidade_medida,
          valor_mensal: Number(item.valor_mensal || 0),
          valor_total: Number(item.valor_total || 0),
          valor_unitario: Number(item.valor_unitario || 0),
        })),
        etapas_cronograma: contexto.etapas_cronograma.slice(0, 10).map((item) => ({
          numero_etapa: item.numero_etapa,
          valor_previsto: Number(item.valor_previsto || 0),
          percentual_fisico: Number(item.percentual_fisico || 0),
        })),
        ultima_medicao: contexto.ultima_medicao
          ? {
              numero_medicao: contexto.ultima_medicao.numero_medicao,
              valor_medido: Number(contexto.ultima_medicao.valor_medido || 0),
              competencia: contexto.ultima_medicao.competencia,
            }
          : null,
      },
      mensagem,
    });
  }

  private montarResumoContextoContrato(
    contexto: ContextoAssistidoContrato,
    incluirRascunho = false,
  ) {
    const partes: string[] = [];
    if (contexto.resumo?.saldo_disponivel != null) {
      partes.push(
        `Saldo disponível atual: **${this.formatCurrency(contexto.resumo.saldo_disponivel)}**.`,
      );
    }
    if ((contexto.resumo?.valor_em_analise || 0) > 0) {
      partes.push(
        `Já existe **${this.formatCurrency(contexto.resumo.valor_em_analise)}** em análise.`,
      );
    }
    if (incluirRascunho && contexto.rascunho_aberto?.numero_medicao) {
      partes.push(
        `Há um rascunho da medição **#${contexto.rascunho_aberto.numero_medicao}** em andamento.`,
      );
    }
    if (contexto.ultima_medicao?.numero_medicao) {
      partes.push(
        `A última medição registrada é a **#${contexto.ultima_medicao.numero_medicao}**.`,
      );
    }
    return partes.join(' ');
  }

  private async montarOrientacaoProximaEtapa(
    contrato: Contrato,
    draft: MedicaoChatDraft,
  ): Promise<string> {
    const pendencia = this.determinarEtapaAtual(draft, contrato);
    const contexto = await this.carregarContextoAssistido(contrato);
    const resumoContrato = this.montarResumoContextoContrato(contexto);

    if (pendencia === 'MEDICAO') {
      if (this.medicaoService.isServicoContinuado(contrato)) {
        if ((draft.nota_fiscal_valor || 0) > 0) {
          return `${resumoContrato ? `${resumoContrato} ` : ''}Como este contrato é continuado, o próximo passo é informar o **valor medido**. Se a NF representa o período cheio, você pode responder: **valor ${this.formatNumberBr(draft.nota_fiscal_valor || 0)}**.`;
        }
        return `${resumoContrato ? `${resumoContrato} ` : ''}Agora preciso do **valor medido do período**.`;
      }

      if (contexto.usar_itens_cronograma) {
        const sugestaoItens = this.montarSugestaoItensCronograma(
          contexto.itens_cronograma,
          draft,
        );
        return `${resumoContrato ? `${resumoContrato} ` : ''}${sugestaoItens}`;
      }

      if (contexto.etapas_cronograma.length > 0) {
        const exemplos = contexto.etapas_cronograma
          .slice(0, 3)
          .map((item) => `etapa ${item.numero_etapa} = 20%`)
          .join(', ');
        return `${resumoContrato ? `${resumoContrato} ` : ''}Agora preciso da execução das etapas. Você pode responder algo como: **${exemplos}**.`;
      }
    }

    if (pendencia === 'DISCRIMINACOES') {
      const sugestaoUltima =
        contexto.ultima_medicao != null
          ? ' Se mantiver a mesma composição da medição anterior, responda **reaproveitar última**.'
          : '';
      return `${resumoContrato ? `${resumoContrato} ` : ''}Agora preciso das **discriminações da despesa**, ou seja, a composição financeira com impostos/taxas e serviços. Exemplo: **ISS 2%, Despesas Operacionais 48%, Serviços 50%**.${sugestaoUltima}`;
    }

    if (pendencia === 'OBSERVACOES') {
      return `${resumoContrato ? `${resumoContrato} ` : ''}Falta só registrar as **observações finais**. Se não houver nada a acrescentar, responda **sem observações**.`;
    }

    if (pendencia === 'NF') {
      return `${resumoContrato ? `${resumoContrato} ` : ''}Se preferir, envie primeiro o **XML da NF**. Se não tiver, pode mandar o **PDF**.`;
    }

    if (pendencia === 'COMPETENCIA') {
      return `Agora confirme a **competência** no formato **MÊS/ANO** ou responda **usar automática**.`;
    }

    if (pendencia === 'PERIODO') {
      return `Me informe o **período da medição** no formato **01/04/2026 a 30/04/2026**.`;
    }

    return `${resumoContrato ? `${resumoContrato} ` : ''}O rascunho ficou **praticamente pronto**. Revise os dados ao lado e, se estiver tudo certo, siga para o envio manual ao ateste.`;
  }

  private async montarPerguntaObjetivaProximaEtapa(
    contrato: Contrato,
    draft: MedicaoChatDraft,
  ): Promise<string> {
    const pendencia = this.determinarEtapaAtual(draft, contrato);

    if (pendencia === 'IDENTIFICACAO') {
      return 'Preciso confirmar a identificação do fornecedor. Informe nome/razão social e CNPJ.';
    }

    if (pendencia === 'PERIODO') {
      return 'Primeiro, me informe o período da medição no formato "01/04/2026 a 30/04/2026".';
    }

    if (pendencia === 'COMPETENCIA') {
      return 'Agora me confirme a competência no formato MÊS/ANO, por exemplo: "ABRIL/2026".';
    }

    if (pendencia === 'NF') {
      return 'Agora me envie a NF em XML/PDF ou informe número, data e valor bruto da nota.';
    }

    if (pendencia === 'MEDICAO') {
      if (this.medicaoService.isServicoContinuado(contrato)) {
        return 'Agora me informe o valor medido do período.';
      }

      const usarItens = await this.medicaoService.usarItensCronograma(contrato.id);
      if (usarItens) {
        const itensCronograma = await this.itemCronogramaRepository.find({
          where: { contrato_id: contrato.id },
          order: { numero_item: 'ASC' },
        });
        if (itensCronograma.length === 1) {
          const item = itensCronograma[0];
          const dicaMensal =
            item.unidade_medida === 'MENSAL'
              ? ` Se foi mês cheio, você pode responder "item ${item.numero_item} = 1".`
              : '';
          return `Agora me informe a execução do item ${item.numero_item} neste período.${dicaMensal}`;
        }
        return 'Agora me informe as quantidades medidas por item, por exemplo: "item 1 = 2".';
      }

      return 'Agora me informe a execução das etapas, por exemplo: "etapa 1 = 20%".';
    }

    if (pendencia === 'DISCRIMINACOES') {
      return 'Agora me informe a composição financeira da despesa, por exemplo "ISS 2%, Despesas Operacionais 48%, Serviços 50%", ou diga "reaproveitar última".';
    }

    if (pendencia === 'OBSERVACOES') {
      return 'Por fim, me informe as observações finais ou responda "sem observações".';
    }

    return 'Revise o rascunho ao lado e siga para o envio manual quando estiver tudo certo.';
  }

  private async aplicarPreenchimentoAutomaticoPosNf(
    contrato: Contrato,
    draft: MedicaoChatDraft,
    nfSugerida?: Record<string, any> | null,
  ) {
    const valorBruto =
      Number(nfSugerida?.nota_fiscal_valor) ||
      Number(draft.nota_fiscal_valor) ||
      0;

    if (!draft.observacoes || draft.observacoes.trim() === '') {
      draft.observacoes = this.gerarObservacaoAutomatica(draft, nfSugerida);
    }

    if (this.medicaoService.isServicoContinuado(contrato)) {
      if (!draft.valor_medido && valorBruto > 0) {
        draft.valor_medido = valorBruto;
      }
      return;
    }

    const usarItensCronograma = await this.medicaoService.usarItensCronograma(
      contrato.id,
    );

    if (!usarItensCronograma || (draft.itens || []).length > 0) {
      return;
    }

    const itensCronograma = await this.itemCronogramaRepository.find({
      where: { contrato_id: contrato.id },
      order: { numero_item: 'ASC' },
    });

    if (itensCronograma.length === 0 || valorBruto <= 0) {
      return;
    }

    const itemMensalExato = itensCronograma.find((item) => {
      const valorReferencia =
        Number(item.valor_mensal) || Number(item.valor_total) || 0;
      return (
        item.unidade_medida === 'MENSAL' &&
        valorReferencia > 0 &&
        Math.abs(valorReferencia - valorBruto) <= 0.05
      );
    });

    if (itemMensalExato) {
      draft.itens = [
        {
          item_cronograma_id: itemMensalExato.id,
          numero_item: itemMensalExato.numero_item,
          descricao: itemMensalExato.descricao,
          quantidade_medida: 1,
        },
      ];
      return;
    }

    if (itensCronograma.length === 1) {
      const item = itensCronograma[0];
      const baseQuantidade =
        Number(item.valor_mensal) || Number(item.valor_unitario) || 0;
      if (baseQuantidade > 0) {
        const quantidadeSugerida =
          Math.round((valorBruto / baseQuantidade) * 10000) / 10000;
        if (quantidadeSugerida > 0) {
          draft.itens = [
            {
              item_cronograma_id: item.id,
              numero_item: item.numero_item,
              descricao: item.descricao,
              quantidade_medida: quantidadeSugerida,
            },
          ];
        }
      }
    }
  }

  private async aplicarQuantidadeMesCheioSePossivel(
    contrato: Contrato,
    draft: MedicaoChatDraft,
  ) {
    if (this.medicaoService.isServicoContinuado(contrato)) {
      const valorReferencia =
        Number(draft.nota_fiscal_valor) ||
        Number((contrato as any).valor_mensal) ||
        Number(contrato.valor_global) ||
        0;
      if (!draft.valor_medido && valorReferencia > 0) {
        draft.valor_medido = valorReferencia;
      }
      return Number(draft.valor_medido || 0) > 0;
    }

    const usarItensCronograma = await this.medicaoService.usarItensCronograma(
      contrato.id,
    );
    if (!usarItensCronograma) return false;

    const itensCronograma = await this.itemCronogramaRepository.find({
      where: { contrato_id: contrato.id },
      order: { numero_item: 'ASC' },
    });
    const itensMesCheio =
      itensCronograma.filter((item) => item.unidade_medida === 'MENSAL') ||
      [];
    const itensParaMedir =
      itensMesCheio.length > 0 ? itensMesCheio : itensCronograma.slice(0, 1);
    if (itensParaMedir.length === 0) return false;

    draft.itens = itensParaMedir.map((item) => ({
      item_cronograma_id: item.id,
      numero_item: item.numero_item,
      descricao: item.descricao,
      quantidade_medida: 1,
    }));
    return true;
  }

  private gerarObservacaoAutomatica(
    draft: MedicaoChatDraft,
    nfSugerida?: Record<string, any> | null,
  ) {
    const partes: string[] = [];
    if (draft.competencia) {
      partes.push(`Medição referente à competência ${draft.competencia}`);
    } else {
      partes.push('Medição assistida preenchida com base na nota fiscal');
    }
    if (draft.nota_fiscal_numero || nfSugerida?.nota_fiscal_numero) {
      partes.push(
        `NF nº ${draft.nota_fiscal_numero || nfSugerida?.nota_fiscal_numero}`,
      );
    }
    if (draft.nota_fiscal_data || nfSugerida?.nota_fiscal_data) {
      partes.push(
        `emitida em ${this.formatDateBr(
          draft.nota_fiscal_data || nfSugerida?.nota_fiscal_data,
        )}`,
      );
    }
    return `${partes.join(', ')}.`;
  }

  private montarSugestaoItensCronograma(
    itensCronograma: ItemCronograma[],
    draft: MedicaoChatDraft,
  ) {
    if (itensCronograma.length === 0) {
      return 'Agora preciso das quantidades medidas por item.';
    }

    if (itensCronograma.length === 1) {
      const item = itensCronograma[0];
      const valorBase =
        Number(draft.nota_fiscal_valor) || Number(item.valor_mensal) || 0;
      const valorComparacao =
        Number(item.valor_mensal) || Number(item.valor_unitario) || 0;
      const quantidadeSugerida =
        valorComparacao > 0 ? valorBase / valorComparacao : 0;

      if (
        item.unidade_medida === 'MENSAL' &&
        valorComparacao > 0 &&
        Math.abs(valorBase - valorComparacao) <= 0.05
      ) {
        return `O contrato tem um único item mensal (**item ${item.numero_item}**) com valor de **${this.formatCurrency(valorComparacao)}**. Se esta NF corresponde ao mês cheio, responda: **item ${item.numero_item} = 1**.`;
      }

      if (
        quantidadeSugerida > 0 &&
        Math.abs(quantidadeSugerida - Math.round(quantidadeSugerida)) <= 0.02
      ) {
        return `O contrato tem um único item (**item ${item.numero_item}**). Pela NF, a sugestão é responder: **item ${item.numero_item} = ${this.formatNumberBr(quantidadeSugerida, 4)}**.`;
      }
    }

    const exemplos = itensCronograma
      .slice(0, 3)
      .map((item) => `item ${item.numero_item} = 1`)
      .join(', ');
    return `Agora preciso das quantidades medidas por item. Você pode responder algo como: **${exemplos}**.`;
  }

  private formatarResumoNfSugerida(nfSugerida?: Record<string, any> | null) {
    if (!nfSugerida) return '';
    const partes: string[] = [];
    if (nfSugerida.nota_fiscal_numero) {
      partes.push(`NF **${nfSugerida.nota_fiscal_numero}**`);
    }
    if (nfSugerida.nota_fiscal_data) {
      partes.push(`data **${this.formatDateBr(nfSugerida.nota_fiscal_data)}**`);
    }
    if (nfSugerida.nota_fiscal_valor != null) {
      partes.push(`valor bruto **${this.formatCurrency(Number(nfSugerida.nota_fiscal_valor))}**`);
    }
    if (nfSugerida.competencia) {
      partes.push(`competência **${nfSugerida.competencia}**`);
    }
    return partes.length > 0 ? ` Identifiquei ${partes.join(', ')}.` : '';
  }

  private formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  private formatNumberBr(value: number, maximumFractionDigits = 2) {
    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits,
    });
  }

  private listarNatural(itens: string[]) {
    if (itens.length <= 1) return itens[0] || '';
    if (itens.length === 2) return `${itens[0]} e ${itens[1]}`;
    return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
  }

  private interpretarConfirmacao(mensagem: string) {
    if (
      /^\s*(sim|confirmo|pode|ok|yes|seguir|prosseguir|continuar)\b/i.test(
        mensagem,
      ) ||
      /\b(pode seguir|pode prosseguir|pode continuar|segue)\b/i.test(mensagem)
    ) {
      return true;
    }
    if (/^\s*(nao|não|cancelar|deixa|no)\b/i.test(mensagem)) return false;
    return null;
  }

  private extrairCnpj(texto: string) {
    const match = texto.match(/\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/);
    return match?.[1]?.replace(/\D/g, '') || null;
  }

  private extrairNomeFornecedorInformado(texto: string) {
    const semCnpj = texto
      .replace(/\bcnpj\b/gi, ' ')
      .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!semCnpj || semCnpj.length < 2) return null;
    return semCnpj
      .split(' ')
      .map((parte) =>
        parte.length <= 3
          ? parte.toUpperCase()
          : `${parte.charAt(0).toUpperCase()}${parte.slice(1)}`,
      )
      .join(' ');
  }

  private formatarCnpj(cnpj: string) {
    const digits = cnpj.replace(/\D/g, '');
    if (digits.length !== 14) return cnpj;
    return digits.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      '$1.$2.$3/$4-$5',
    );
  }

  private extrairPeriodoTexto(
    texto: string,
    contexto: PeriodoParseContext = {},
  ) {
    const matches = [
      ...texto.matchAll(
        /(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/g,
      ),
    ];
    if (matches.length >= 2) {
      const inicio = this.normalizarData(matches[0][0]);
      const fim = this.normalizarData(matches[1][0]);
      if (inicio && fim && inicio <= fim) return { inicio, fim };
    }

    return this.extrairPeriodoCurtoTexto(texto, contexto);
  }

  private extrairPeriodoCurtoTexto(
    texto: string,
    contexto: PeriodoParseContext,
  ) {
    const match = texto
      .replace(/[“”"]/g, ' ')
      .match(
        /(?:^|[^\d])(\d{1,2})\s*[\/.\-\s]\s*(\d{1,2})(?:\s*[\/.\-\s]\s*(\d{2,4}))?\s*(?:a|ate|até|ao|à|-|–|—)\s*(\d{1,2})\s*[\/.\-\s]\s*(\d{1,2})(?:\s*[\/.\-\s]\s*(\d{2,4}))?(?=$|[^\d])/i,
      );
    if (!match) return null;

    const inicioDia = Number(match[1]);
    const inicioMes = Number(match[2]);
    const inicioAno = match[3] ? this.normalizarAno(match[3]) : null;
    const fimDia = Number(match[4]);
    const fimMes = Number(match[5]);
    const fimAno = match[6] ? this.normalizarAno(match[6]) : null;

    const anosBase =
      inicioAno || fimAno
        ? [inicioAno || fimAno!]
        : this.inferirAnosBasePeriodo(contexto);
    const candidatos = anosBase
      .map((anoBase) =>
        this.montarPeriodoComAno({
          inicioDia,
          inicioMes,
          inicioAno,
          fimDia,
          fimMes,
          fimAno,
          anoBase,
        }),
      )
      .filter((item): item is { inicio: string; fim: string } => Boolean(item));

    if (candidatos.length === 0) return null;

    return candidatos.sort(
      (a, b) =>
        this.pontuarPeriodoInferido(b, contexto) -
        this.pontuarPeriodoInferido(a, contexto),
    )[0];
  }

  private extrairDatasCount(texto: string) {
    const completas = [
      ...texto.matchAll(
        /(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/g,
      ),
    ].length;
    if (completas >= 2) return completas;
    return /(?:^|[^\d])\d{1,2}\s*[\/.\-\s]\s*\d{1,2}(?:\s*[\/.\-\s]\s*\d{2,4})?\s*(?:a|ate|até|ao|à|-|–|—)\s*\d{1,2}\s*[\/.\-\s]\s*\d{1,2}/i.test(
      texto,
    )
      ? 2
      : completas;
  }

  private normalizarAno(valor: string) {
    const ano = Number(valor);
    if (valor.length === 2) return 2000 + ano;
    return ano;
  }

  private inferirAnosBasePeriodo(contexto: PeriodoParseContext) {
    const anos: number[] = [];
    const adicionarAno = (ano?: number | null) => {
      if (ano && ano >= 1900 && ano <= 2200 && !anos.includes(ano)) {
        anos.push(ano);
      }
    };
    const adicionarAnoDeData = (data?: Date | string | null) => {
      const iso = this.formatDateOnly(data);
      if (iso) adicionarAno(Number(iso.substring(0, 4)));
    };
    const adicionarAnoDeCompetencia = (competencia?: string | null) => {
      const match = String(competencia || '').match(/(\d{4})/);
      if (match) adicionarAno(Number(match[1]));
    };

    adicionarAnoDeCompetencia(contexto.draft?.competencia);
    adicionarAnoDeData(contexto.draft?.periodo_fim);
    adicionarAnoDeData(contexto.draft?.periodo_inicio);
    adicionarAnoDeCompetencia(contexto.ultimaMedicao?.competencia);
    adicionarAnoDeData(contexto.ultimaMedicao?.periodo_fim);
    adicionarAnoDeData(contexto.ultimaMedicao?.periodo_inicio);

    const vigenciaInicio = this.formatDateOnly(
      contexto.contrato?.data_vigencia_inicio,
    );
    const vigenciaFim = this.formatDateOnly(contexto.contrato?.data_vigencia_fim);
    if (vigenciaInicio && vigenciaFim) {
      const anoInicio = Number(vigenciaInicio.substring(0, 4));
      const anoFim = Number(vigenciaFim.substring(0, 4));
      for (let ano = anoInicio; ano <= anoFim && ano <= anoInicio + 10; ano++) {
        adicionarAno(ano);
      }
    }

    if (anos.length === 0) adicionarAno(new Date().getFullYear());
    return anos;
  }

  private montarPeriodoComAno(input: {
    inicioDia: number;
    inicioMes: number;
    inicioAno: number | null;
    fimDia: number;
    fimMes: number;
    fimAno: number | null;
    anoBase: number;
  }) {
    let anoInicio = input.inicioAno ?? input.anoBase;
    let anoFim = input.fimAno ?? input.inicioAno ?? input.anoBase;

    if (!input.inicioAno && input.fimAno) {
      anoInicio = input.fimAno;
      if (
        input.inicioMes > input.fimMes ||
        (input.inicioMes === input.fimMes && input.inicioDia > input.fimDia)
      ) {
        anoInicio = input.fimAno - 1;
      }
    }

    if (
      !input.fimAno &&
      (input.inicioMes > input.fimMes ||
        (input.inicioMes === input.fimMes && input.inicioDia > input.fimDia))
    ) {
      anoFim = anoInicio + 1;
    }

    const inicio = this.montarDataIso(input.inicioDia, input.inicioMes, anoInicio);
    const fim = this.montarDataIso(input.fimDia, input.fimMes, anoFim);
    if (!inicio || !fim || inicio > fim) return null;
    return { inicio, fim };
  }

  private montarDataIso(dia: number, mes: number, ano: number) {
    if (!(dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12 && ano >= 1900)) {
      return null;
    }
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    if (
      data.getUTCFullYear() !== ano ||
      data.getUTCMonth() !== mes - 1 ||
      data.getUTCDate() !== dia
    ) {
      return null;
    }
    return `${ano.toString().padStart(4, '0')}-${mes
      .toString()
      .padStart(2, '0')}-${dia.toString().padStart(2, '0')}`;
  }

  private pontuarPeriodoInferido(
    periodo: { inicio: string; fim: string },
    contexto: PeriodoParseContext,
  ) {
    let score = 0;
    const vigenciaInicio = this.formatDateOnly(
      contexto.contrato?.data_vigencia_inicio,
    );
    const vigenciaFim = this.formatDateOnly(contexto.contrato?.data_vigencia_fim);
    if (vigenciaInicio && vigenciaFim) {
      score += periodo.inicio >= vigenciaInicio && periodo.fim <= vigenciaFim ? 100 : -100;
    }

    const ultimaFim = this.formatDateOnly(contexto.ultimaMedicao?.periodo_fim);
    if (ultimaFim) {
      score += periodo.inicio > ultimaFim ? 30 : -10;
      if (periodo.inicio === this.adicionarDiasIso(ultimaFim, 1)) {
        score += 50;
      }
    }

    const competenciaAno = String(contexto.draft?.competencia || '').match(
      /(\d{4})/,
    )?.[1];
    if (competenciaAno && periodo.fim.startsWith(competenciaAno)) score += 20;

    return score;
  }

  private adicionarDiasIso(iso: string, dias: number) {
    const [ano, mes, dia] = iso.split('-').map(Number);
    const data = new Date(Date.UTC(ano, mes - 1, dia + dias));
    return `${data.getUTCFullYear()}-${(data.getUTCMonth() + 1)
      .toString()
      .padStart(2, '0')}-${data.getUTCDate().toString().padStart(2, '0')}`;
  }

  private extrairNumeroNF(texto: string) {
    const match = texto.match(/\b(?:nf|nota)\s*#?\s*(\d{1,20})\b/i);
    return match?.[1] || null;
  }

  private extrairNumeroNfAvulso(texto: string) {
    const limpo = texto.trim();
    if (!/^\d{1,20}$/.test(limpo)) return null;
    return limpo;
  }

  private extrairMoeda(texto: string) {
    const matches = texto.match(/\d{1,3}(?:\.\d{3})*,\d{2}|\d+\.\d{2}|\d+/g);
    if (!matches || matches.length === 0) return null;
    const last = matches[matches.length - 1];
    return Number(last.replace(/\./g, '').replace(',', '.'));
  }

  private extrairMoedaIgnorandoDatas(texto: string) {
    const semDatas = texto
      .replace(/\d{2}[\/-]\d{2}[\/-]\d{4}/g, ' ')
      .replace(/\d{4}-\d{2}-\d{2}/g, ' ');
    return this.extrairMoeda(semDatas);
  }

  private extrairDataAvulsa(texto: string) {
    const match = texto.match(/(\d{2}[\/-]\d{2}[\/-]\d{4}|\d{4}-\d{2}-\d{2})/);
    return match ? this.normalizarData(match[1]) : null;
  }

  private normalizarData(valor?: string | null) {
    if (!valor) return null;
    const texto = String(valor).trim().substring(0, 10);
    const iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) {
      return this.montarDataIso(Number(iso[3]), Number(iso[2]), Number(iso[1]));
    }
    const br = texto.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if (br) {
      return this.montarDataIso(
        Number(br[1]),
        Number(br[2]),
        this.normalizarAno(br[3]),
      );
    }
    return null;
  }

  private normalizarCompetencia(texto: string) {
    const match = texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .match(
        /(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)[\s/-]*(\d{4})/,
      );
    if (!match) return null;
    return `${match[1]}/${match[2]}`;
  }

  private normalizarCompetenciaComAnoDoPeriodo(
    texto: string,
    draft: MedicaoChatDraft,
  ) {
    if (!draft.periodo_fim) return null;
    const textoNormalizado = texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
    const mes = MESES_PT.find(
      (nome) => nome && new RegExp(`\\b${nome}\\b`).test(textoNormalizado),
    );
    if (!mes) return null;
    return `${mes}/${draft.periodo_fim.substring(0, 4)}`;
  }

  private periodoPareceMesCheio(inicio: string, fim: string) {
    const [iy, im, id] = inicio.split('-').map(Number);
    const [fy, fm, fd] = fim.split('-').map(Number);
    if (iy !== fy || im !== fm || id !== 1) return false;
    return fd === new Date(fy, fm, 0).getDate();
  }

  private derivarCompetencia(data: string) {
    const month = Number(data.substring(5, 7));
    const year = data.substring(0, 4);
    return `${MESES_PT[month]}/${year}`;
  }

  private formatDateOnly(date?: Date | string | null) {
    if (!date) return null;
    const value = date instanceof Date ? date.toISOString() : String(date);
    return value.substring(0, 10);
  }

  private formatDateBr(value: string) {
    const [y, m, d] = value.split('-');
    return `${d}/${m}/${y}`;
  }

  private async extrairItensCronogramaDaMensagem(
    mensagem: string,
    itens: ItemCronograma[],
  ): Promise<DraftItemQuantidade[]> {
    const regexItems = [
      ...mensagem.matchAll(/item\s*(\d+)\s*[:=]\s*([\d.,]+)/gi),
      ...mensagem.matchAll(/^(\d+)\s*[:=]\s*([\d.,]+)/gim),
    ];
    const encontrados = new Map<number, number>();
    for (const match of regexItems) {
      const numeroItem = Number(match[1]);
      const quantidade = Number(match[2].replace(/\./g, '').replace(',', '.'));
      if (numeroItem > 0 && quantidade > 0) {
        encontrados.set(numeroItem, quantidade);
      }
    }

    if (encontrados.size > 0) {
      return itens
        .filter((item) => encontrados.has(item.numero_item))
        .map((item) => ({
          item_cronograma_id: item.id,
          numero_item: item.numero_item,
          descricao: item.descricao,
          quantidade_medida: encontrados.get(item.numero_item)!,
        }));
    }

    try {
      const contextoItens = itens
        .slice(0, 80)
        .map((item) => `${item.numero_item}: ${item.descricao}`)
        .join('\n');
      const response = await this.iaService.chatComSistemaPersonalizado(
        [
          {
            role: 'user',
            content:
              `Itens disponíveis:\n${contextoItens}\n\nMensagem do fornecedor:\n${mensagem}\n\nRetorne apenas JSON no formato {"itens":[{"numero_item":1,"quantidade_medida":2.5}]}.`,
          },
        ],
        'Extraia números de item e quantidades de uma instrução curta de medição. Retorne apenas JSON válido.',
      );
      const parsed = this.safeParseJson(response);
      const lista = Array.isArray(parsed?.itens) ? parsed.itens : [];
      return itens
        .filter((item) =>
          lista.some((x: any) => Number(x.numero_item) === item.numero_item),
        )
        .map((item) => {
          const achado = lista.find(
            (x: any) => Number(x.numero_item) === item.numero_item,
          );
          return {
            item_cronograma_id: item.id,
            numero_item: item.numero_item,
            descricao: item.descricao,
            quantidade_medida: Number(achado?.quantidade_medida || 0),
          };
        })
        .filter((item) => item.quantidade_medida > 0);
    } catch {
      return [];
    }
  }

  private async extrairEtapasDaMensagem(
    mensagem: string,
    etapas: EtapaCronograma[],
  ): Promise<DraftItemEtapa[]> {
    const matches = [
      ...mensagem.matchAll(/etapa\s*(\d+)\s*[:=]\s*([\d.,]+)\s*(%?)/gi),
      ...mensagem.matchAll(/^(\d+)\s*[:=]\s*([\d.,]+)\s*(%?)/gim),
    ];
    const encontrados: DraftItemEtapa[] = [];
    for (const match of matches) {
      const numero = Number(match[1]);
      const valor = Number(match[2].replace(/\./g, '').replace(',', '.'));
      const etapa = etapas.find((item) => item.numero_etapa === numero);
      if (!etapa || !(valor > 0)) continue;
      if (match[3] === '%') {
        encontrados.push({
          etapa_id: etapa.id,
          numero_etapa: etapa.numero_etapa,
          descricao: etapa.descricao,
          percentual_executado_atual: valor,
        });
      } else {
        encontrados.push({
          etapa_id: etapa.id,
          numero_etapa: etapa.numero_etapa,
          descricao: etapa.descricao,
          valor_executado_atual: valor,
        });
      }
    }
    return encontrados;
  }

  private async extrairDiscriminacoesDaMensagem(
    mensagem: string,
    valorBase: number,
  ): Promise<DraftDiscriminacao[]> {
    const linhas = mensagem
      .split('\n')
      .map((linha) => linha.trim())
      .filter(Boolean);

    // Tentativa 1: padrão "label: valor" (valor absoluto)
    const resultadoAbsoluto: DraftDiscriminacao[] = [];
    for (const linha of linhas) {
      const match = linha.match(/^(.+?)\s*[-:=]\s*([\d.,]+)\s*%?$/);
      if (!match) continue;
      resultadoAbsoluto.push({
        descricao: match[1].trim(),
        valor: Number(match[2].replace(/\./g, '').replace(',', '.')),
      });
    }
    if (resultadoAbsoluto.length > 0) {
      return this.recalcularPercentuais(resultadoAbsoluto, valorBase);
    }

    // Tentativa 2: padrões baseados em percentual — "label X%" ou "X% label"
    const resultadoPercent: Array<{ descricao: string; percentual: number }> = [];
    // Padrão inline: vírgula/ponto e vírgula separando itens numa linha só
    const textoUnico = mensagem.replace(/\n/g, ', ');
    const regexes = [
      // "label N%" — e.g. "ISS 2%"
      /([a-zA-ZÀ-ú][a-zA-ZÀ-ú\s/()-]{1,60}?)\s+(\d+(?:[.,]\d+)?)\s*%/g,
      // "N% label" — e.g. "2% ISS"
      /(\d+(?:[.,]\d+)?)\s*%\s+([a-zA-ZÀ-ú][a-zA-ZÀ-ú\s/()-]{1,60})/g,
    ];

    let matchPercent;
    // Regex "label N%"
    regexes[0].lastIndex = 0;
    while ((matchPercent = regexes[0].exec(textoUnico)) !== null) {
      const descricao = matchPercent[1].trim().replace(/,\s*$/, '');
      const perc = Number(matchPercent[2].replace(',', '.'));
      if (descricao && perc > 0) {
        resultadoPercent.push({ descricao, percentual: perc });
      }
    }
    // Regex "N% label"
    if (resultadoPercent.length === 0) {
      regexes[1].lastIndex = 0;
      while ((matchPercent = regexes[1].exec(textoUnico)) !== null) {
        const perc = Number(matchPercent[1].replace(',', '.'));
        const descricao = matchPercent[2].trim().replace(/,\s*$/, '');
        if (descricao && perc > 0) {
          resultadoPercent.push({ descricao, percentual: perc });
        }
      }
    }

    if (resultadoPercent.length > 0 && valorBase > 0) {
      const somaPercentuais = resultadoPercent.reduce((acc, item) => acc + item.percentual, 0);
      const resultado = resultadoPercent.map((item) => ({
        descricao: item.descricao,
        valor: Math.round((item.percentual / 100) * valorBase * 100) / 100,
        percentual: item.percentual,
      }));
      if (Math.abs(somaPercentuais - 100) > 0.01) {
        this.logger.warn(
          `[extrairDiscriminacoesDaMensagem] Percentuais somam ${somaPercentuais}% (esperado 100%) — aplicando mesmo assim`,
        );
      }
      return resultado;
    }

    try {
      const response = await this.iaService.chatComSistemaPersonalizado(
        [
          {
            role: 'user',
            content:
              `Mensagem do fornecedor:\n${mensagem}\n\nValor base: ${valorBase}\n\nExtraia apenas a composição financeira da despesa, como ISS, impostos/taxas, despesas operacionais, serviços, mão de obra ou materiais. Não extraia descrição da execução/objeto do contrato como discriminação.\n\nRetorne apenas JSON no formato {"discriminacoes":[{"descricao":"ISS","valor":1000}]}.`,
          },
        ],
        'Extraia discriminações financeiras de despesa e valores/percentuais de uma instrução curta. Discriminação não é descrição do serviço executado. Retorne apenas JSON válido.',
      );
      const parsed = this.safeParseJson(response);
      const lista = Array.isArray(parsed?.discriminacoes)
        ? parsed.discriminacoes
        : [];
      return this.recalcularPercentuais(
        lista.map((item: any) => ({
          descricao: String(item.descricao || '').trim(),
          valor: Number(item.valor || 0),
        })),
        valorBase,
      ).filter((item) => item.descricao && item.valor > 0);
    } catch {
      return [];
    }
  }

  private recalcularPercentuais(
    itens: Array<{ descricao: string; valor: number }>,
    valorBase: number,
  ) {
    return itens.map((item) => ({
      descricao: item.descricao,
      valor: item.valor,
      percentual:
        valorBase > 0 ? Math.round((item.valor / valorBase) * 10000) / 100 : 0,
    }));
  }

  private safeParseJson(raw: string) {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
  }

  private async extrairSugestaoNotaFiscal(
    file: Express.Multer.File,
    contratoId: string,
    fornecedorId: string,
  ) {
    const fornecedor = await this.fornecedorRepository.findOne({
      where: { id: fornecedorId },
    });
    const fornecedorCnpj = fornecedor?.cpf_cnpj || '';
    const isXml =
      file.mimetype === 'application/xml' ||
      file.mimetype === 'text/xml' ||
      file.originalname.toLowerCase().endsWith('.xml');

    if (isXml) {
      const xml = file.buffer.toString('utf-8');
      const nfse = this.extrairSugestaoNfseXml(xml, fornecedorCnpj);
      if (nfse) {
        return nfse;
      }
      const parsed = this.xmlNfeParserService.parse(xml);
      const data = this.normalizarData(parsed.header.dataEmissao);
      return {
        nota_fiscal_numero: parsed.header.numero || null,
        nota_fiscal_valor: parsed.header.valorTotal || null,
        nota_fiscal_data: data,
        competencia: data ? this.derivarCompetencia(data) : null,
        cnpj_emitente: parsed.header.cnpjEmitente || null,
        conflito_cnpj:
          !!fornecedorCnpj &&
          parsed.header.cnpjEmitente.replace(/\D/g, '') !==
            fornecedorCnpj.replace(/\D/g, ''),
      };
    }

    const SYSTEM_PROMPT = `Extraia APENAS JSON válido de uma nota fiscal.
Priorize sempre o VALOR BRUTO DO SERVIÇO/NOTA. Não use valor líquido quando houver retenções.
Campos:
- numero
- data_emissao (YYYY-MM-DD ou null)
- valor_bruto (number ou null)
- valor_liquido (number ou null)
- competencia (MÊS/ANO ou null)
- descricao_servico (string ou null)
Retorne exatamente:
{"numero":"","data_emissao":null,"valor_bruto":null,"valor_liquido":null,"competencia":null,"descricao_servico":null}`;

    let resposta = '';
    if (file.mimetype === 'application/pdf') {
      const texto = await this.iaService.extrairTextoDoPdf(file.buffer);
      if (texto.trim().length >= 80) {
        resposta = await this.iaService.chatComArquivo(
          SYSTEM_PROMPT,
          undefined,
          undefined,
          texto,
          1000,
        );
      } else {
        resposta = await this.iaService.chatComPdfEscaneado(
          SYSTEM_PROMPT,
          file.buffer,
        );
      }
    } else {
      resposta = await this.iaService.chatComArquivo(
        SYSTEM_PROMPT,
        file.buffer.toString('base64'),
        file.mimetype,
        undefined,
        1000,
      );
    }
    const parsed = this.safeParseJson(resposta) || {};
    const dataEmissao = this.normalizarData(parsed.data_emissao);
    const valorBruto =
      parsed.valor_bruto != null
        ? Number(parsed.valor_bruto)
        : parsed.valor_total != null
          ? Number(parsed.valor_total)
          : null;
    return {
      nota_fiscal_numero: parsed.numero || null,
      nota_fiscal_valor: valorBruto,
      nota_fiscal_data: dataEmissao || null,
      competencia:
        parsed.competencia ||
        (dataEmissao
          ? this.derivarCompetencia(dataEmissao)
          : null),
      valor_liquido:
        parsed.valor_liquido != null ? Number(parsed.valor_liquido) : null,
      descricao_servico:
        parsed.descricao_servico != null
          ? String(parsed.descricao_servico)
          : null,
    };
  }

  private extrairSugestaoNfseXml(xml: string, fornecedorCnpj: string) {
    if (!/<NFSe[\s>]/i.test(xml) && !/<infNFSe[\s>]/i.test(xml)) {
      return null;
    }

    try {
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        parseTagValue: true,
        trimValues: true,
        removeNSPrefix: true,
      });
      const parsed = parser.parse(xml);
      const infNFSe = parsed?.NFSe?.infNFSe || parsed?.infNFSe;
      const infDPS = infNFSe?.DPS?.infDPS || {};
      const emit = infNFSe?.emit || {};
      const valoresNfse = infNFSe?.valores || {};
      const valoresDps = infDPS?.valores || {};
      const valorBruto =
        Number(valoresDps?.vServPrest?.vServ) ||
        Number(valoresDps?.vServPrest?.vServPrest) ||
        Number(valoresNfse?.vServ) ||
        null;
      const valorLiquido = Number(valoresNfse?.vLiq) || null;
      const dataEmissao =
        this.normalizarData(infDPS?.dCompet) ||
        this.normalizarData(infDPS?.dhEmi) ||
        this.normalizarData(infNFSe?.dhProc);
      const cnpjEmitente = String(emit?.CNPJ || infDPS?.prest?.CNPJ || '');
      const descricaoServico =
        infDPS?.serv?.cServ?.xDescServ ||
        infDPS?.serv?.xDescServ ||
        null;

      return {
        nota_fiscal_numero: String(infNFSe?.nNFSe || infDPS?.nDPS || ''),
        nota_fiscal_valor: valorBruto,
        nota_fiscal_data: dataEmissao || null,
        competencia:
          this.extrairCompetenciaDaDescricao(descricaoServico) ||
          (dataEmissao ? this.derivarCompetencia(dataEmissao) : null),
        cnpj_emitente: cnpjEmitente || null,
        conflito_cnpj:
          !!fornecedorCnpj &&
          !!cnpjEmitente &&
          cnpjEmitente.replace(/\D/g, '') !== fornecedorCnpj.replace(/\D/g, ''),
        valor_liquido: valorLiquido,
        descricao_servico: descricaoServico,
      };
    } catch (error: any) {
      this.logger.warn(`Falha ao interpretar NFSe XML: ${error.message}`);
      return null;
    }
  }

  private extrairCompetenciaDaDescricao(texto?: string | null) {
    if (!texto) return null;
    const competencia = this.normalizarCompetencia(texto);
    if (competencia) return competencia;
    const data = this.extrairDataAvulsa(texto);
    return data ? this.derivarCompetencia(data) : null;
  }
}
