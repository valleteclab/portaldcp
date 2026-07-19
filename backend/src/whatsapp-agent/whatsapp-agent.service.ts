import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappAgentSession } from './entities/whatsapp-agent-session.entity';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { IaService } from '../ia/ia.service';
import { FornecedoresService } from '../fornecedores/fornecedores.service';
import { CnpjService } from '../fornecedores/cnpj.service';
import { SystemConfigService } from '../system-config/system-config.service';
import {
  WhatsappMedicaoBotService,
  MidiaWhatsApp,
} from './whatsapp-medicao-bot.service';

const ESTADOS = {
  INICIO: 'INICIO',
  AGUARDANDO_INTENCAO: 'AGUARDANDO_INTENCAO',
  CADASTRO_CNPJ: 'CADASTRO_CNPJ',
  CADASTRO_CONFIRMAR_DADOS: 'CADASTRO_CONFIRMAR_DADOS',
  CADASTRO_EMAIL: 'CADASTRO_EMAIL',
  CADASTRO_CONCLUIDO: 'CADASTRO_CONCLUIDO',
  FAQ_ATIVO: 'FAQ_ATIVO',
  MEDICAO_CONTRATO: 'MEDICAO_CONTRATO',
  MEDICAO_ATIVA: 'MEDICAO_ATIVA',
  MEDICAO_OTP: 'MEDICAO_OTP',
} as const;

const SESSION_TTL_HOURS = 24;
const MAX_HISTORICO_IA = 10;

@Injectable()
export class WhatsappAgentService {
  private readonly logger = new Logger(WhatsappAgentService.name);

  private getPortalUrl(): string {
    const baseUrl =
      process.env.FRONTEND_URL ||
      process.env.APP_URL ||
      'https://compras.cmlem.ba.gov.br';

    return baseUrl.replace(/\/$/, '');
  }

  private getFaqSystemPrompt(): string {
    const portalUrl = this.getPortalUrl();

    return `Você é o Assistente Virtual da Câmara de Vereadores de Luís Eduardo Magalhães - BA, responsável pelo atendimento a fornecedores no portal ${portalUrl}.

Você atende fornecedores pelo WhatsApp. Seja objetivo, cordial, institucional e responda sempre em português brasileiro.

CONTEXTO DO PORTAL:
- O portal de compras e contratos da Câmara está disponível em ${portalUrl}
- O sistema é usado por fornecedores para cadastro, credenciamento, acesso a contratos, medições, ordens e mensagens
- Quando mencionar acesso ao sistema, sempre use o domínio ${portalUrl}

FUNCIONALIDADES DISPONÍVEIS PARA FORNECEDORES:

1. CADASTRO E ACESSO
   - Cadastro: acesse ${portalUrl} e informe o CNPJ da empresa
   - Login: acesse ${portalUrl} com e-mail e senha cadastrados
   - Recuperação de senha: use a opção "Esqueci minha senha" na tela de login

2. CREDENCIAMENTO
   - O fornecedor deve completar as etapas de habilitação documental no portal
   - Podem ser exigidos documentos jurídicos, fiscais, trabalhistas, técnicos e econômico-financeiros

3. CONTRATOS E EXECUÇÃO
   - O fornecedor pode consultar contratos ativos no portal
   - Também pode acompanhar ordens, medições, anexos e mensagens do fiscal

4. MEDIÇÕES E ENTREGAS
   - Em contratos de obras/serviços: enviar medição com itens executados e anexos comprobatórios
   - Em contratos de materiais: registrar entregas e anexar Nota Fiscal quando aplicável

REGRAS IMPORTANTES:
- Não invente informações sobre contratos, valores, prazos ou documentos específicos se isso não estiver disponível na conversa
- Se a dúvida depender de dados internos do contrato, oriente o fornecedor a acessar o portal ou falar com o setor responsável da Câmara
- Documentos geralmente aceitos no portal: JPG, PNG e PDF
- Para voltar ao início, o fornecedor pode digitar "menu"

Seu objetivo é ajudar o fornecedor a usar corretamente o portal da Câmara de Vereadores de Luís Eduardo Magalhães - BA.`;
  }

  private getMenuMessage(): string {
    return `Olá! 👋 Sou o assistente virtual da *Câmara de Vereadores de Luís Eduardo Magalhães - BA*.

Posso ajudar você com o portal de compras em produção:
*${this.getPortalUrl()}*

1️⃣ Cadastrar minha empresa no portal
2️⃣ Tirar dúvidas sobre o sistema
3️⃣ Enviar medição (mandar a nota fiscal) 📸
4️⃣ Consultar minhas medições

Digite o número da opção desejada.`;
  }

  constructor(
    @InjectRepository(WhatsappAgentSession)
    private readonly sessionRepo: Repository<WhatsappAgentSession>,
    private readonly whatsappService: WhatsAppService,
    private readonly iaService: IaService,
    private readonly fornecedoresService: FornecedoresService,
    private readonly cnpjService: CnpjService,
    private readonly systemConfigService: SystemConfigService,
    private readonly medicaoBot: WhatsappMedicaoBotService,
  ) {}

  async processarMensagem(phone: string, mensagem: string, nomeContato?: string, orgaoId?: string, midia?: MidiaWhatsApp): Promise<void> {
    // Verificar se o agente está ativo
    const { ativo } = await this.systemConfigService.getWhatsAppAgentConfig();
    if (!ativo) {
      this.logger.debug(`Agente inativo, ignorando mensagem de ${phone}`);
      return;
    }

    const texto = mensagem.trim();
    const session = await this.obterOuCriarSessao(phone, nomeContato);

    // Verificar expiração da sessão
    if (session.expires_at && new Date() > session.expires_at) {
      session.estado = ESTADOS.INICIO;
      session.dados = {};
      session.historico_ia = [];
    }

    // Atualizar expiração
    const novaExpiracao = new Date();
    novaExpiracao.setHours(novaExpiracao.getHours() + SESSION_TTL_HOURS);
    session.expires_at = novaExpiracao;

    let resposta: string;

    try {
      // Mídia (foto/PDF): só faz sentido dentro do fluxo de medição
      if (midia) {
        const legenda =
          texto && !texto.startsWith('📷') && !texto.startsWith('📎')
            ? texto
            : undefined;
        if (session.estado === ESTADOS.MEDICAO_ATIVA) {
          resposta = await this.medicaoBot.tratarMidiaMedicao(
            session,
            midia,
            legenda,
          );
          await this.sessionRepo.save(session);
          await this.responder(orgaoId, phone, resposta);
          return;
        }
        // Atalho: fornecedor mandou a NF direto — tenta iniciar o fluxo
        resposta = await this.iniciarFluxoMedicao(session, phone, midia);
        await this.sessionRepo.save(session);
        await this.responder(orgaoId, phone, resposta);
        return;
      }

      switch (session.estado) {
        case ESTADOS.INICIO:
          resposta = await this.handleInicio(session);
          break;
        case ESTADOS.AGUARDANDO_INTENCAO:
          resposta = await this.handleAguardandoIntencao(texto, session);
          break;
        case ESTADOS.CADASTRO_CNPJ:
          resposta = await this.handleCadastroCnpj(texto, session);
          break;
        case ESTADOS.CADASTRO_CONFIRMAR_DADOS:
          resposta = await this.handleCadastroConfirmarDados(texto, session);
          break;
        case ESTADOS.CADASTRO_EMAIL:
          resposta = await this.handleCadastroEmail(texto, session, phone);
          break;
        case ESTADOS.CADASTRO_CONCLUIDO:
          resposta = await this.handleInicio(session);
          break;
        case ESTADOS.FAQ_ATIVO:
          resposta = await this.handleFaqAtivo(texto, session);
          break;
        case ESTADOS.MEDICAO_CONTRATO:
          resposta = await this.handleMedicaoContrato(texto, session);
          break;
        case ESTADOS.MEDICAO_ATIVA:
          resposta = await this.handleMedicaoAtiva(texto, session);
          break;
        case ESTADOS.MEDICAO_OTP:
          resposta = await this.handleMedicaoOtp(texto, session);
          break;
        default:
          resposta = await this.handleInicio(session);
      }
    } catch (err: any) {
      this.logger.error(`Erro ao processar mensagem de ${phone}: ${err.message}`);
      resposta = '⚠️ Ocorreu um erro interno. Por favor, tente novamente em instantes.';
      session.estado = ESTADOS.AGUARDANDO_INTENCAO;
    }

    await this.sessionRepo.save(session);
    await this.responder(orgaoId, phone, resposta);
  }

  private async responder(orgaoId: string | undefined, phone: string, resposta: string): Promise<void> {
    if (orgaoId) {
      const enviado = await this.whatsappService.enviar(orgaoId, { to: phone, mensagem: resposta });
      if (!enviado) {
        this.logger.warn(`Falha ao responder pelo orgão ${orgaoId}; tentando fallback sistema para ${phone}`);
        await this.whatsappService.enviarSistema(phone, resposta);
      }
      return;
    }
    await this.whatsappService.enviarSistema(phone, resposta);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MEDIÇÃO PELO WHATSAPP (ponte com o fluxo de medição assistida)
  // ──────────────────────────────────────────────────────────────────────────

  /** Verifica o telefone, resolve o contrato e abre a sessão de medição. */
  private async iniciarFluxoMedicao(
    session: WhatsappAgentSession,
    phone: string,
    midiaInicial?: MidiaWhatsApp,
  ): Promise<string> {
    const fornecedor = await this.medicaoBot.identificarFornecedorPorTelefone(phone);
    if (!fornecedor) {
      session.estado = ESTADOS.AGUARDANDO_INTENCAO;
      return (
        '🔒 Por segurança, o envio de medições só é liberado para o *telefone cadastrado* do fornecedor.\n\n' +
        `Não encontrei nenhum fornecedor com este número. Atualize o telefone do representante no portal *${this.getPortalUrl()}* (menu Perfil) e tente novamente.\n\n` +
        this.getMenuMessage()
      );
    }

    const contratos = await this.medicaoBot.listarContratosMediveis(fornecedor.id);
    if (contratos.length === 0) {
      session.estado = ESTADOS.AGUARDANDO_INTENCAO;
      return `Não encontrei contratos vigentes de medição para *${fornecedor.razao_social}*.\n\nEm caso de dúvida, fale com o órgão.\n\n${this.getMenuMessage()}`;
    }

    if (contratos.length === 1) {
      const abertura = await this.medicaoBot.iniciarSessaoMedicao(
        session,
        contratos[0],
        fornecedor.id,
      );
      session.estado = ESTADOS.MEDICAO_ATIVA;
      let resposta = `✅ Identifiquei: *${fornecedor.razao_social}*\n\n${abertura}`;
      if (midiaInicial) {
        const respostaNf = await this.medicaoBot.tratarMidiaMedicao(session, midiaInicial);
        resposta = `✅ Identifiquei: *${fornecedor.razao_social}* — contrato ${contratos[0].numero_contrato}\n\n${respostaNf}`;
      }
      return resposta;
    }

    session.dados = {
      ...session.dados,
      medicao_fornecedor_id: fornecedor.id,
      medicao_contratos: contratos.map((c) => ({ id: c.id, numero: c.numero_contrato, objeto: (c.objeto || '').slice(0, 60) })),
      medicao_midia_pendente: midiaInicial || null,
    };
    session.estado = ESTADOS.MEDICAO_CONTRATO;
    const lista = contratos
      .map((c, i) => `${i + 1}️⃣ *${c.numero_contrato}* — ${(c.objeto || '').slice(0, 60)}`)
      .join('\n');
    return `✅ Identifiquei: *${fornecedor.razao_social}*\n\nQual contrato você quer medir?\n\n${lista}\n\nDigite o número da opção.`;
  }

  private async handleMedicaoContrato(texto: string, session: WhatsappAgentSession): Promise<string> {
    if (texto.toLowerCase().trim() === 'menu') return this.handleInicio(session);
    const dados = session.dados || {};
    const contratos: Array<{ id: string; numero: string }> = dados.medicao_contratos || [];
    const escolha = parseInt(texto.trim(), 10);
    if (!escolha || escolha < 1 || escolha > contratos.length) {
      return `Não entendi. Digite o número do contrato (1 a ${contratos.length}) ou *menu* para voltar.`;
    }
    const contrato = await this.medicaoBot.buscarContrato(contratos[escolha - 1].id);
    if (!contrato) return 'Contrato não encontrado. Digite *menu* para recomeçar.';
    const abertura = await this.medicaoBot.iniciarSessaoMedicao(session, contrato, dados.medicao_fornecedor_id);
    session.estado = ESTADOS.MEDICAO_ATIVA;
    const midiaPendente = dados.medicao_midia_pendente as MidiaWhatsApp | null;
    if (midiaPendente) {
      session.dados = { ...session.dados, medicao_midia_pendente: null };
      return this.medicaoBot.tratarMidiaMedicao(session, midiaPendente);
    }
    return abertura;
  }

  private async handleMedicaoAtiva(texto: string, session: WhatsappAgentSession): Promise<string> {
    const comando = texto.toLowerCase().trim();
    if (comando === 'menu' || comando === 'sair' || comando === 'cancelar') {
      return this.handleInicio(session);
    }
    if (comando === 'status' || comando === 'resumo') {
      return this.medicaoBot.statusResumo(session);
    }
    if (comando === 'enviar' || comando === 'finalizar' || comando === 'assinar') {
      const otp = await this.medicaoBot.solicitarOtp(session);
      if (otp.ok) session.estado = ESTADOS.MEDICAO_OTP;
      return otp.mensagem;
    }
    return this.medicaoBot.tratarMensagemMedicao(session, texto);
  }

  private async handleMedicaoOtp(texto: string, session: WhatsappAgentSession): Promise<string> {
    const comando = texto.toLowerCase().trim();
    if (comando === 'menu' || comando === 'cancelar') {
      session.estado = ESTADOS.MEDICAO_ATIVA;
      return 'Assinatura cancelada. Você continua na medição — digite *enviar* quando quiser assinar, ou *menu* para sair.';
    }
    const codigo = texto.replace(/\D/g, '');
    if (codigo.length < 4) {
      return 'Digite o código de verificação recebido (somente números), ou *cancelar* para voltar.';
    }
    const resultado = await this.medicaoBot.validarOtp(session, codigo);
    if (resultado.ok) {
      session.estado = ESTADOS.AGUARDANDO_INTENCAO;
      session.dados = {};
    }
    return resultado.mensagem;
  }

  private async obterOuCriarSessao(phone: string, nomeContato?: string): Promise<WhatsappAgentSession> {
    let session = await this.sessionRepo.findOne({ where: { phone } });
    if (!session) {
      session = this.sessionRepo.create({
        phone,
        estado: ESTADOS.INICIO,
        dados: {},
        historico_ia: [],
      });
    }
    return session;
  }

  private async handleInicio(session: WhatsappAgentSession): Promise<string> {
    session.estado = ESTADOS.AGUARDANDO_INTENCAO;
    session.dados = {};
    session.historico_ia = [];
    return this.getMenuMessage();
  }

  private async handleAguardandoIntencao(texto: string, session: WhatsappAgentSession): Promise<string> {
    const normalizado = texto.toLowerCase().replace(/[^\w\s]/g, '').trim();

    if (normalizado === '1' || normalizado.includes('cadastr')) {
      session.estado = ESTADOS.CADASTRO_CNPJ;
      return '📋 Vamos cadastrar sua empresa!\n\nPor favor, informe o *CNPJ* da sua empresa (somente números ou com pontuação):';
    }

    if (normalizado === '2' || normalizado.includes('d\u00favida') || normalizado.includes('ajuda') || normalizado.includes('help')) {
      session.estado = ESTADOS.FAQ_ATIVO;
      session.historico_ia = [];
      return '💬 Estou aqui para ajudar!\n\nQual é a sua dúvida sobre o Portal DCP?\n\n_(Digite "menu" a qualquer momento para voltar ao início)_';
    }

    if (normalizado === '3' || normalizado.includes('medic') || normalizado.includes('nota fiscal')) {
      return this.iniciarFluxoMedicao(session, session.phone);
    }

    if (normalizado === '4' || normalizado.includes('consult')) {
      const fornecedor = await this.medicaoBot.identificarFornecedorPorTelefone(session.phone);
      if (!fornecedor) {
        return (
          '🔒 A consulta de medições só é liberada para o *telefone cadastrado* do fornecedor.\n\n' +
          `Atualize o telefone do representante no portal *${this.getPortalUrl()}* e tente novamente.\n\n` +
          this.getMenuMessage()
        );
      }
      return this.medicaoBot.listarMedicoesFornecedor(fornecedor.id);
    }

    return `Não entendi sua escolha. Por favor, responda com:\n\n${this.getMenuMessage()}`;
  }

  private async handleCadastroCnpj(texto: string, session: WhatsappAgentSession): Promise<string> {
    const cnpjLimpo = texto.replace(/\D/g, '');

    if (cnpjLimpo.length !== 14) {
      return '❌ CNPJ inválido. Por favor, informe os 14 dígitos do CNPJ (com ou sem pontuação):';
    }

    // Verificar se já está cadastrado
    const verificacao = await this.fornecedoresService.verificarCnpjExistente(cnpjLimpo);
    if (verificacao.existe) {
      session.estado = ESTADOS.AGUARDANDO_INTENCAO;
      return `⚠️ Este CNPJ já possui cadastro no portal da Câmara.\n\nAcesse *${this.getPortalUrl()}* para fazer login ou recuperar sua senha.\n\n${this.getMenuMessage()}`;
    }

    // Consultar dados do CNPJ na API
    let dadosCnpj: any;
    try {
      dadosCnpj = await this.cnpjService.consultarCnpj(cnpjLimpo);
    } catch {
      return '❌ Não foi possível consultar os dados deste CNPJ. Verifique se o número está correto e tente novamente:';
    }

    session.dados = { cnpj: cnpjLimpo, dados_cnpj: dadosCnpj };
    session.estado = ESTADOS.CADASTRO_CONFIRMAR_DADOS;

    const cidade = dadosCnpj.endereco?.cidade || '';
    const uf = dadosCnpj.endereco?.uf || '';
    const cnpjFormatado = cnpjLimpo.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');

    return `Encontrei os dados da sua empresa:\n\n🏢 *Razão Social:* ${dadosCnpj.razao_social}\n📋 *CNPJ:* ${cnpjFormatado}\n📍 *Cidade/UF:* ${cidade} - ${uf}\n\n✅ Os dados estão corretos?\n\nDigite *1* para SIM ou *2* para NÃO (informar outro CNPJ):`;
  }

  private async handleCadastroConfirmarDados(texto: string, session: WhatsappAgentSession): Promise<string> {
    const normalizado = texto.toLowerCase().trim();

    if (normalizado === '1' || normalizado.includes('sim') || normalizado.includes('confirmar') || normalizado.includes('ok')) {
      session.estado = ESTADOS.CADASTRO_EMAIL;
      return '📧 Ótimo! Agora informe o *e-mail* para acesso ao portal:\n\n_(Você receberá neste e-mail o link para definir sua senha)_';
    }

    if (normalizado === '2' || normalizado.includes('n\u00e3o') || normalizado.includes('errado')) {
      session.estado = ESTADOS.CADASTRO_CNPJ;
      session.dados = {};
      return '↩️ Tudo bem! Informe o CNPJ correto da sua empresa:';
    }

    return 'Por favor, responda com *1* para confirmar ou *2* para informar outro CNPJ:';
  }

  private async handleCadastroEmail(texto: string, session: WhatsappAgentSession, phone: string): Promise<string> {
    const email = texto.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return '❌ E-mail inválido. Por favor, informe um endereço de e-mail válido:';
    }

    const dadosCnpj = session.dados?.dados_cnpj;
    if (!dadosCnpj) {
      session.estado = ESTADOS.CADASTRO_CNPJ;
      return '⚠️ Sessão expirada. Por favor, informe o CNPJ novamente:';
    }

    try {
      const { fornecedor, resetLink } = await this.fornecedoresService.cadastrarViaWhatsapp(email, dadosCnpj, phone);

      session.estado = ESTADOS.CADASTRO_CONCLUIDO;
      session.fornecedor_id = fornecedor.id;
      session.dados = {};

      return `✅ *Cadastro realizado com sucesso!*\n\n🏢 ${dadosCnpj.razao_social}\n📧 ${email}\n\nUm e-mail foi enviado com o link para definir sua senha.\n\nApós definir a senha, acesse *${this.getPortalUrl()}* para completar o credenciamento e enviar os documentos necessários.\n\nPrecisa de mais ajuda? ${this.getMenuMessage()}`;
    } catch (err: any) {
      if (err.message?.includes('E-mail já cadastrado') || err.message?.includes('CNPJ já cadastrado')) {
        if (err.message.includes('E-mail')) {
          return `❌ Este e-mail já está em uso por outro cadastro.\n\nPor favor, informe um e-mail diferente:`;
        }
        session.estado = ESTADOS.AGUARDANDO_INTENCAO;
        return `❌ ${err.message}\n\nAcesse *${this.getPortalUrl()}* para fazer login ou recuperar a senha.\n\n${this.getMenuMessage()}`;
      }
      this.logger.error(`Erro ao cadastrar via WhatsApp: ${err.message}`);
      return `❌ Ocorreu um erro ao criar o cadastro. Tente novamente ou acesse ${this.getPortalUrl()} para se cadastrar diretamente.`;
    }
  }

  private async handleFaqAtivo(texto: string, session: WhatsappAgentSession): Promise<string> {
    const normalizado = texto.toLowerCase().trim();

    if (normalizado === 'menu' || normalizado === 'voltar' || normalizado === 'sair' || normalizado === '0') {
      session.estado = ESTADOS.AGUARDANDO_INTENCAO;
      session.historico_ia = [];
      return this.getMenuMessage();
    }

    // Adiciona mensagem do usuário ao histórico
    const historico = session.historico_ia || [];
    historico.push({ role: 'user', content: texto });

    // Limita o histórico para evitar tokens excessivos
    const historicoLimitado = historico.slice(-MAX_HISTORICO_IA);

    let resposta: string;
    try {
      resposta = await this.iaService.chatComSistemaPersonalizado(historicoLimitado, this.getFaqSystemPrompt());
    } catch {
      resposta = 'Não consegui processar sua pergunta agora. Por favor, tente novamente.';
    }

    // Adiciona resposta da IA ao histórico
    historicoLimitado.push({ role: 'assistant', content: resposta });
    session.historico_ia = historicoLimitado;

    return `${resposta}\n\n_(Digite "menu" para voltar ao início)_`;
  }
}
