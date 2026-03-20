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

const FAQ_SYSTEM_PROMPT = `Você é o Assistente Virtual do Portal DCP (Diário de Compras Públicas), sistema de gestão de contratos públicos conforme a Lei 14.133/2021.

Atende fornecedores pelo WhatsApp. Seja objetivo, amigável e responda em português brasileiro.

FUNCIONALIDADES DISPONÍVEIS PARA FORNECEDORES NO PORTAL:

1. CADASTRO E ACESSO
   - Cadastrar: acesse portaldcp.com.br → "Cadastrar" → informe o CNPJ
   - Login: portaldcp.com.br → "Entrar" → e-mail e senha cadastrados
   - Esqueceu a senha: use "Esqueci minha senha" na tela de login

2. CREDENCIAMENTO (obrigatório para operar)
   - Nível I: Dados básicos da empresa (já preenchido no cadastro)
   - Nível II: Habilitação Jurídica (contrato social, atos constitutivos)
   - Nível III: Regularidade Fiscal Federal (certidões RFB, FGTS, Trabalhista)
   - Nível IV: Regularidade Fiscal Estadual/Municipal
   - Nível V: Qualificação Técnica (atestados de capacidade)
   - Nível VI: Qualificação Econômico-Financeira (balanço, certidão de falência)

3. GESTÃO DE CONTRATOS
   - Acesse "Contratos" no menu para ver seus contratos ativos
   - Cada contrato exibe: valor, vigência, fiscal responsável, resumo financeiro

4. MEDIÇÕES (contratos de obras e serviços)
   - Criar medição: Contratos → selecione o contrato → "Nova Medição"
   - Preencha os itens executados com quantidades e valores
   - Anexe fotos e documentos como comprovação
   - Submeta para atesto do fiscal
   - Acompanhe o status: RASCUNHO → SUBMETIDA → AGUARDANDO ATESTE → APROVADA
   - Em caso de devolução, corrija e resubmeta

5. ORDENS DE FORNECIMENTO (contratos de materiais)
   - Acesse "Ordens" no menu para ver ordens recebidas
   - Registre "Ciência de Recebimento" ao receber a ordem
   - Informe a "Ciência de Entrega" com a data prevista de entrega
   - Anexe a Nota Fiscal (XML + PDF) após a entrega

6. ORDENS DE SERVIÇO (contratos de serviços)
   - Gerencie ordens de serviço recebidas do órgão
   - Atualize o status de execução
   - Registre entrega ao concluir

7. MENSAGENS / CAIXA DE ENTRADA
   - O fiscal pode enviar solicitações e orientações pelo portal
   - Acesse "Mensagens" no menu para visualizar

REGRAS IMPORTANTES:
- Não é possível editar uma medição já submetida; aguarde a devolução pelo fiscal
- Documentos aceitos: JPG, PNG, PDF (máx. 10MB por arquivo)
- Nota Fiscal: envie o XML e o PDF juntos

Se a dúvida for muito específica sobre um contrato (valores, prazos, fiscal responsável), oriente o fornecedor a contatar diretamente o órgão público responsável pelo contrato.

Para voltar ao menu principal, o fornecedor pode digitar "menu".`;

const MSG_MENU = `Olá! 👋 Sou o assistente virtual do *Portal DCP*.

Como posso ajudar você hoje?

1️⃣ Cadastrar minha empresa no portal
2️⃣ Tirar dúvidas sobre o sistema

Digite o número da opção desejada.`;

@Injectable()
export class WhatsappAgentService {
  private readonly logger = new Logger(WhatsappAgentService.name);

  constructor(
    @InjectRepository(WhatsappAgentSession)
    private readonly sessionRepo: Repository<WhatsappAgentSession>,
    private readonly whatsappService: WhatsAppService,
    private readonly iaService: IaService,
    private readonly fornecedoresService: FornecedoresService,
    private readonly cnpjService: CnpjService,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  async processarMensagem(phone: string, mensagem: string, nomeContato?: string): Promise<void> {
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
    return MSG_MENU;
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

    return `Não entendi sua escolha. Por favor, responda com:\n\n${MSG_MENU}`;
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
      return `⚠️ Este CNPJ já possui cadastro no Portal DCP.\n\nAcesse o portal em *portaldcp.com.br* para fazer login ou recuperar sua senha.\n\n${MSG_MENU}`;
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

      return `✅ *Cadastro realizado com sucesso!*\n\n🏢 ${dadosCnpj.razao_social}\n📧 ${email}\n\nUm e-mail foi enviado com o link para definir sua senha.\n\nApós definir a senha, acesse *portaldcp.com.br* para completar o credenciamento e enviar os documentos necessários.\n\nPrecisa de mais ajuda? ${MSG_MENU}`;
    } catch (err: any) {
      if (err.message?.includes('E-mail já cadastrado') || err.message?.includes('CNPJ já cadastrado')) {
        if (err.message.includes('E-mail')) {
          return `❌ Este e-mail já está em uso por outro cadastro.\n\nPor favor, informe um e-mail diferente:`;
        }
        session.estado = ESTADOS.AGUARDANDO_INTENCAO;
        return `❌ ${err.message}\n\nAcesse *portaldcp.com.br* para fazer login ou recuperar a senha.\n\n${MSG_MENU}`;
      }
      this.logger.error(`Erro ao cadastrar via WhatsApp: ${err.message}`);
      return '❌ Ocorreu um erro ao criar o cadastro. Tente novamente ou acesse portaldcp.com.br para se cadastrar diretamente.';
    }
  }

  private async handleFaqAtivo(texto: string, session: WhatsappAgentSession): Promise<string> {
    const normalizado = texto.toLowerCase().trim();

    if (normalizado === 'menu' || normalizado === 'voltar' || normalizado === 'sair' || normalizado === '0') {
      session.estado = ESTADOS.AGUARDANDO_INTENCAO;
      session.historico_ia = [];
      return MSG_MENU;
    }

    // Adiciona mensagem do usuário ao histórico
    const historico = session.historico_ia || [];
    historico.push({ role: 'user', content: texto });

    // Limita o histórico para evitar tokens excessivos
    const historicoLimitado = historico.slice(-MAX_HISTORICO_IA);

    let resposta: string;
    try {
      resposta = await this.iaService.chatComSistemaPersonalizado(historicoLimitado, FAQ_SYSTEM_PROMPT);
    } catch {
      resposta = 'Não consegui processar sua pergunta agora. Por favor, tente novamente.';
    }

    // Adiciona resposta da IA ao histórico
    historicoLimitado.push({ role: 'assistant', content: resposta });
    session.historico_ia = historicoLimitado;

    return `${resposta}\n\n_(Digite "menu" para voltar ao início)_`;
  }
}
