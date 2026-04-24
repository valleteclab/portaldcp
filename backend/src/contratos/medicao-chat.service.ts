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
import { Medicao } from './entities/medicao.entity';
import { ItemCronograma } from './entities/item-cronograma.entity';
import { EtapaCronograma } from './entities/etapa-cronograma.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { MedicaoService } from './medicao.service';
import { IaService } from '../ia/ia.service';
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
};

type MedicaoChatDraft = {
  contrato_id: string;
  fornecedor_id: string;
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
    }

    return this.montarRespostaSessao(session, contrato);
  }

  async obterSessao(sessionId: string, fornecedorId: string) {
    const session = await this.buscarSessao(sessionId, fornecedorId);
    const contrato = await this.validarContexto(
      session.contrato_id,
      fornecedorId,
    );
    return this.montarRespostaSessao(session, contrato);
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
    const historico = [...(session.historico_ia || [])];
    historico.push({
      role: 'user',
      content: mensagem,
      created_at: new Date().toISOString(),
    });

    let respostaAssistente = '';

    if (session.confirmacao_pendente) {
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
      session.confirmacao_pendente = {
        tipo: 'ANEXO_NF',
        temp_path: tempPath,
        nf_sugerida: nfSugerida,
        nome_original: file.originalname,
      };
    session.historico_ia = [
      ...(session.historico_ia || []),
        {
          role: 'assistant',
          content: nfSugerida
          ? `Analisei o arquivo **${file.originalname}** e encontrei dados de nota fiscal.${resumoNf ? ` ${resumoNf}` : ''} Posso aplicar essa NF ao rascunho e deixar o arquivo pronto para anexar ao boletim quando a medição estiver materializada?`
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
    const draft: MedicaoChatDraft = {
      contrato_id: contrato.id,
      fornecedor_id: fornecedorId,
      anexos_pendentes: [],
      discriminacoes: [],
      itens: [],
    };

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

  private determinarEtapaAtual(draft: MedicaoChatDraft, contrato: Contrato) {
    const pendencias = this.calcularPendencias(draft, contrato);
    return pendencias[0] || 'REVISAO';
  }

  private calcularPendencias(draft: MedicaoChatDraft, contrato: Contrato) {
    const pendencias: string[] = [];
    if (!draft.periodo_inicio || !draft.periodo_fim) pendencias.push('PERIODO');
    if (!draft.competencia) pendencias.push('COMPETENCIA');
    if (draft.nota_fiscal_numero == null && draft.nota_fiscal_valor == null) {
      pendencias.push('NF');
    }

    if (this.medicaoService.isServicoContinuado(contrato)) {
      if (!draft.valor_medido || draft.valor_medido <= 0) pendencias.push('MEDICAO');
    } else if (Array.isArray(draft.itens) && draft.itens.length === 0) {
      pendencias.push('MEDICAO');
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
    const pendenciaPrincipal = this.calcularPendencias(draft, contrato)[0];
    const resumoContrato = this.montarResumoContextoContrato(contexto);
    return `Vamos montar a medição assistida do contrato **${contrato.numero_contrato}**. Identifiquei que este contrato usa **${tipoFluxo}**.${resumoContrato ? ` ${resumoContrato}` : ''} Vou preencher o rascunho em tempo real e te avisar o que ainda falta. Primeiro, me informe o **período da medição** no formato "01/04/2026 a 30/04/2026".${pendenciaPrincipal && pendenciaPrincipal !== 'PERIODO' ? ' Se preferir, você também pode começar anexando a nota fiscal em XML ou PDF.' : ''}`;
  }

  private async aplicarMensagemNaEtapa(
    etapaAtual: string,
    mensagem: string,
    contrato: Contrato,
    draft: MedicaoChatDraft,
    fornecedorId: string,
  ): Promise<ResultadoEtapaChat> {
    switch (etapaAtual) {
      case 'PERIODO':
        return this.aplicarPeriodo(mensagem, draft);
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

  private aplicarPeriodo(
    mensagem: string,
    draft: MedicaoChatDraft,
  ): ResultadoEtapaChat {
    const parsed = this.extrairPeriodoTexto(mensagem);
    if (!parsed) {
      return {
        resposta:
          'Não consegui entender o período. Me envie no formato "01/04/2026 a 30/04/2026" ou "2026-04-01 a 2026-04-30".',
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
    if (!competencia) {
      return {
        resposta:
          'Não consegui validar a competência. Me envie algo como **ABRIL/2026**.',
      };
    }
    draft.competencia = competencia;
    return {
      resposta:
        'Competência registrada. Agora me informe os dados da NF (por exemplo: "NF 105, valor 36598,50, data 13/04/2026") ou diga "sem NF por enquanto".',
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

    const numero = this.extrairNumeroNF(mensagem);
    const valor = this.extrairMoeda(mensagem);
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
          'Valor medido registrado. Agora me informe as **discriminações de despesa** em linhas como "Serviços - 30000" ou diga "reaproveitar última".',
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
          'Itens da medição registrados. Agora me informe as **discriminações de despesa** ou diga "reaproveitar última".',
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
        'Execução por etapas registrada. Agora me informe as **discriminações de despesa** ou diga "reaproveitar última".',
    };
  }

  private async aplicarDiscriminacoes(
    mensagem: string,
    contrato: Contrato,
    draft: MedicaoChatDraft,
    fornecedorId: string,
  ): Promise<ResultadoEtapaChat> {
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
          'Não consegui entender as discriminações. Me envie em linhas como "Serviços - 30000" e "Tributos - 6598,50".',
      };
    }
    draft.discriminacoes = discriminacoes;
    return {
      resposta:
        'Discriminações registradas. Por fim, me envie as observações do boletim ou responda "sem observações".',
    };
  }

  private aplicarObservacoes(
    mensagem: string,
    draft: MedicaoChatDraft,
  ): ResultadoEtapaChat {
    draft.observacoes = /sem observ/i.test(mensagem)
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

    const ultimaMedicao =
      medicoes.length > 0 ? medicoes[medicoes.length - 1] : null;

    return {
      resumo,
      medicoes,
      usar_itens_cronograma: usarItensCronograma,
      itens_cronograma: itensCronograma,
      etapas_cronograma: etapasCronograma,
      ultima_medicao: ultimaMedicao,
    };
  }

  private montarResumoContextoContrato(contexto: ContextoAssistidoContrato) {
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
          ? ' Se quiser, responda **reaproveitar última**.'
          : '';
      return `${resumoContrato ? `${resumoContrato} ` : ''}Agora preciso das **discriminações da despesa**.${sugestaoUltima}`;
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

      if (quantidadeSugerida > 0) {
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

  private extrairPeriodoTexto(texto: string) {
    const matches = [...texto.matchAll(/(\d{2}[\/-]\d{2}[\/-]\d{4}|\d{4}-\d{2}-\d{2})/g)];
    if (matches.length < 2) return null;
    const inicio = this.normalizarData(matches[0][0]);
    const fim = this.normalizarData(matches[1][0]);
    if (!inicio || !fim) return null;
    return { inicio, fim };
  }

  private extrairNumeroNF(texto: string) {
    const match = texto.match(/\b(?:nf|nota)\s*#?\s*(\d{1,20})\b/i);
    return match?.[1] || null;
  }

  private extrairMoeda(texto: string) {
    const matches = texto.match(/\d{1,3}(?:\.\d{3})*,\d{2}|\d+\.\d{2}|\d+/g);
    if (!matches || matches.length === 0) return null;
    const last = matches[matches.length - 1];
    return Number(last.replace(/\./g, '').replace(',', '.'));
  }

  private extrairDataAvulsa(texto: string) {
    const match = texto.match(/(\d{2}[\/-]\d{2}[\/-]\d{4}|\d{4}-\d{2}-\d{2})/);
    return match ? this.normalizarData(match[1]) : null;
  }

  private normalizarData(valor?: string | null) {
    if (!valor) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
    if (/^\d{2}[\/-]\d{2}[\/-]\d{4}$/.test(valor)) {
      const [d, m, y] = valor.split(/[\/-]/);
      return `${y}-${m}-${d}`;
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
    const resultado: DraftDiscriminacao[] = [];
    for (const linha of linhas) {
      const match = linha.match(/^(.+?)\s*[-:=]\s*([\d.,]+)\s*%?$/);
      if (!match) continue;
      resultado.push({
        descricao: match[1].trim(),
        valor: Number(match[2].replace(/\./g, '').replace(',', '.')),
      });
    }
    if (resultado.length > 0) {
      return this.recalcularPercentuais(resultado, valorBase);
    }

    try {
      const response = await this.iaService.chatComSistemaPersonalizado(
        [
          {
            role: 'user',
            content:
              `Mensagem do fornecedor:\n${mensagem}\n\nValor base: ${valorBase}\n\nRetorne apenas JSON no formato {"discriminacoes":[{"descricao":"Serviços","valor":1000}]}.`,
          },
        ],
        'Extraia discriminações de despesa e valores de uma instrução curta. Retorne apenas JSON válido.',
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
