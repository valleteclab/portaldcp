import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappAgentSession } from './entities/whatsapp-agent-session.entity';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { IaService } from '../ia/ia.service';
import { FornecedoresService } from '../fornecedores/fornecedores.service';
import { CnpjService } from '../fornecedores/cnpj.service';
import { SystemConfigService } from '../system-config/system-config.service';

const ESTADOS = {
  INICIO: 'INICIO',
  AGUARDANDO_INTENCAO: 'AGUARDANDO_INTENCAO',
  CADASTRO_CNPJ: 'CADASTRO_CNPJ',
  CADASTRO_CONFIRMAR_DADOS: 'CADASTRO_CONFIRMAR_DADOS',
  CADASTRO_EMAIL: 'CADASTRO_EMAIL',
  CADASTRO_CONCLUIDO: 'CADASTRO_CONCLUIDO',
  FAQ_ATIVO: 'FAQ_ATIVO',
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
  ) {}

  async processarMensagem(phone: string, mensagem: string, nomeContato?: string, orgaoId?: string): Promise<void> {
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
        default:
          resposta = await this.handleInicio(session);
      }
    } catch (err: any) {
      this.logger.error(`Erro ao processar mensagem de ${phone}: ${err.message}`);
      resposta = '⚠️ Ocorreu um erro interno. Por favor, tente novamente em instantes.';
      session.estado = ESTADOS.AGUARDANDO_INTENCAO;
    }

    await this.sessionRepo.save(session);

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
