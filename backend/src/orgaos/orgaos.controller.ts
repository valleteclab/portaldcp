import { Controller, Get, Post, Put, Delete, Body, Param, Query, ValidationPipe, UnauthorizedException, Req, Logger, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrgaosService } from './orgaos.service';
import { EmailService } from '../email/email.service';
import { ImapService } from '../imap/imap.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { CreateOrgaoDto } from './dto/create-orgao.dto';
import { Orgao } from './entities/orgao.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { ModuloSistema } from './enums/modulos.enum';
import { createHash } from 'crypto';
import { AuthService } from '../auth/auth.service';
import { Public } from '../auth/public.decorator';
import { JwtPayload, UserType } from '../auth/auth.service';

@Controller('orgaos')
export class OrgaosController {
  private readonly logger = new Logger(OrgaosController.name);

  constructor(
    private readonly orgaosService: OrgaosService,
    private readonly emailService: EmailService,
    private readonly imapService: ImapService,
    private readonly whatsappService: WhatsAppService,
    private readonly authService: AuthService,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
  ) {}

  private podeAcessarOrgao(user: JwtPayload, orgaoId: string): boolean {
    if (user.type === UserType.ADMIN) return true;
    const userOrgaoId = user.orgaoId || (user as any).orgao_id || (user.type === UserType.ORGAO ? user.sub : null);
    return userOrgaoId === orgaoId;
  }

  @Post()
  async create(@Body(new ValidationPipe({ transform: true, whitelist: true })) createOrgaoDto: CreateOrgaoDto): Promise<Orgao> {
    return await this.orgaosService.create(createOrgaoDto);
  }

  @Public()
  @Post('login')
  async login(@Body() body: { email: string; senha: string }) {
    const { email, senha } = body;
    
    if (!email || !senha) {
      throw new UnauthorizedException('Email e senha são obrigatórios');
    }

    const result = await this.authService.loginOrgao(email, senha);
    
    return {
      success: true,
      orgao: result.orgao,
      token: result.token,
    };
  }

  @Public()
  @Post('registro')
  async registro(@Body() body: { email: string; senha: string; nome: string; cnpj: string; codigo: string }) {
    const { email, senha, nome, cnpj, codigo } = body;
    
    // Verifica se email já existe
    const existente = await this.orgaosService.findByEmail(email);
    if (existente) {
      throw new UnauthorizedException('Email já cadastrado');
    }

    const senhaHash = createHash('sha256').update(senha).digest('hex');
    
    const orgao = await this.orgaosService.create({
      email_login: email,
      senha_hash: senhaHash,
      nome,
      cnpj,
      codigo,
      tipo: 'PREFEITURA',
      esfera: 'MUNICIPAL',
      logradouro: 'A definir',
      bairro: 'A definir',
      cidade: 'A definir',
      uf: 'SP',
      cep: '00000000',
      responsavel_nome: 'A definir',
      responsavel_cpf: '000.000.000-00',
    } as any);

    const { senha_hash: _, ...orgaoSemSenha } = orgao;
    
    return {
      success: true,
      orgao: orgaoSemSenha,
    };
  }

  @Public()
  @Post('reset-credenciais')
  async resetCredenciais(@Body() body: { cnpj: string; email: string; senha: string }) {
    const { cnpj, email, senha } = body;

    if (!cnpj || !email || !senha) {
      throw new UnauthorizedException('CNPJ, email e senha são obrigatórios');
    }

    const orgao = await this.orgaosService.resetCredenciais(cnpj, email, senha);

    return {
      success: true,
      orgaoId: orgao.id,
    };
  }

  @Public()
  @Get('publico')
  async findAllPublico(): Promise<{ id: string; nome: string; cnpj: string }[]> {
    const orgaos = await this.orgaosService.findAll();
    return orgaos
      .filter((o: any) => o.ativo !== false)
      .map((o: any) => ({ id: o.id, nome: o.nome, cnpj: o.cnpj }));
  }

  @Get()
  async findAll(): Promise<any[]> {
    const orgaos = await this.orgaosService.findAll();
    // Mapeia modulos_habilitados para modulos_ativos para compatibilidade com frontend
    return orgaos.map(orgao => {
      const { senha_hash, ...orgaoSemSenha } = orgao;
      const modulos = orgao.modulos_habilitados || [];
      return {
        ...orgaoSemSenha,
        modulos_ativos: modulos,
        modulos_habilitados: modulos,
        fluxo_os: orgao.fluxo_os || 'REQUISICAO',
      };
    });
  }

  /**
   * Retorna o órgão logado atual com módulos atualizados do banco de dados
   * Usa o JWT para identificar o órgão
   * SEMPRE busca módulos do banco (fonte da verdade)
   * Para usuários: calcula módulos efetivos (interseção órgão + usuário)
   */
  @Get('me')
  async getMe(@Req() request: { user: JwtPayload }) {
    const user = request.user;
    
    if (!user) {
      throw new UnauthorizedException('Usuário não autenticado');
    }

    let orgaoId: string;
    let usuarioId: string | null = null;
    
    // Se for login direto do órgão
    if (user.type === UserType.ORGAO) {
      orgaoId = user.sub;
    } 
    // Se for usuário vinculado a um órgão
    else if (user.type === UserType.USUARIO) {
      orgaoId = user.orgaoId || (user as any).orgao_id;
      usuarioId = user.sub;
    }
    // Fallback para outros tipos
    else if (user.orgaoId || (user as any).orgao_id) {
      orgaoId = user.orgaoId || (user as any).orgao_id;
    } 
    else {
      this.logger.warn(`[GET /me] Órgão não identificado para usuário: ${JSON.stringify({
        type: user.type,
        sub: user.sub,
        orgaoId: user.orgaoId,
        orgao_id: (user as any).orgao_id,
      })}`);
      throw new UnauthorizedException('Órgão não identificado');
    }

    // Busca módulos do órgão
    const modulosOrgao = await this.orgaosService.getModulosOrgao(orgaoId);
    const orgao = await this.orgaosService.findOne(orgaoId);
    
    // Calcula módulos efetivos
    let modulosEfetivos: ModuloSistema[] = modulosOrgao;
    let herdaDoOrgao = true;

    // Se for um usuário, verifica se tem módulos específicos configurados
    if (usuarioId) {
      const usuario = await this.usuarioRepository.findOne({
        where: { id: usuarioId },
      });
      
      if (usuario?.modulos_habilitados && usuario.modulos_habilitados.length > 0) {
        // Usuário tem módulos específicos: faz interseção com módulos do órgão
        modulosEfetivos = usuario.modulos_habilitados.filter(m => 
          modulosOrgao.includes(m)
        );
        herdaDoOrgao = false;
        this.logger.log(`[GET /me] Usuário ${usuarioId} com módulos personalizados: ${JSON.stringify(modulosEfetivos)}`);
      }
    }
    
    this.logger.log(`[GET /me] Módulos efetivos para ${user.type} ${user.sub}: ${JSON.stringify(modulosEfetivos)}`);
    
    // Remove senha do retorno
    const { senha_hash, ...orgaoSemSenha } = orgao;
    
    return {
      ...orgaoSemSenha,
      modulos_ativos: modulosEfetivos,
      modulos_habilitados: modulosEfetivos,
      modulos_orgao: modulosOrgao,
      herda_modulos_orgao: herdaDoOrgao,
      fluxo_os: orgao.fluxo_os || 'REQUISICAO',
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Orgao> {
    return await this.orgaosService.findOne(id);
  }

  @Get('codigo/:codigo')
  async findByCodigo(@Param('codigo') codigo: string): Promise<Orgao> {
    return await this.orgaosService.findByCodigo(codigo);
  }

  @Post(':id/logo')
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const baseDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
          const uploadPath = path.join(baseDir, 'logos');
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const orgaoId = req.params?.id || 'org';
          const ext = path.extname(file.originalname || '.png').toLowerCase() || '.png';
          cb(null, `logo_${orgaoId}_${Date.now()}${ext}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowed = ['image/png', 'image/jpeg', 'image/jpg'];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Apenas PNG ou JPG, máx 2MB'), false);
        }
      },
      limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    }),
  )
  async uploadLogo(
    @Param('id') id: string,
    @Req() req: { user: JwtPayload },
    @UploadedFile() file: Express.Multer.File,
  ): Promise<Orgao> {
    if (!this.podeAcessarOrgao(req.user, id)) {
      throw new UnauthorizedException('Sem permissão para alterar este órgão');
    }
    if (!file) {
      throw new BadRequestException('Arquivo de logo é obrigatório');
    }
    return await this.orgaosService.uploadLogo(id, file);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ skipMissingProperties: true })) updateData: Partial<CreateOrgaoDto>
  ): Promise<Orgao> {
    return await this.orgaosService.update(id, updateData);
  }

  @Delete(':id')
  async deactivate(@Param('id') id: string): Promise<Orgao> {
    return await this.orgaosService.deactivate(id);
  }

  // ============ VINCULAÇÃO PNCP ============
  // A plataforma LicitaFácil tem UMA credencial no PNCP
  // Aqui gerenciamos quais órgãos estão vinculados à plataforma

  @Put(':id/pncp')
  async vincularPNCP(
    @Param('id') id: string,
    @Body() config: {
      pncp_vinculado: boolean;
      pncp_codigo_unidade: string;
      pncp_cnpj_orgao?: string;
    }
  ): Promise<Orgao> {
    return await this.orgaosService.vincularPNCP(id, config);
  }

  @Get(':id/pncp/status')
  async statusPNCP(@Param('id') id: string) {
    return await this.orgaosService.statusPNCP(id);
  }

  // ============ GESTÃO DE MÓDULOS ============

  @Get('modulos/disponiveis')
  async getModulosDisponiveis() {
    return await this.orgaosService.getModulosDisponiveis();
  }

  @Get(':id/modulos')
  async getModulosOrgao(@Param('id') id: string) {
    const modulos = await this.orgaosService.getModulosOrgao(id);
    return { modulos };
  }

  @Put(':id/modulos')
  async atualizarModulos(
    @Param('id') id: string,
    @Body() body: { modulos: string[]; fluxo_os?: 'REQUISICAO' | 'MODULO_OS'; envio_automatico_os?: boolean },
  ) {
    const { ModuloSistema } = require('./enums/modulos.enum');
    const modulos = body.modulos.map(m => m as typeof ModuloSistema[keyof typeof ModuloSistema]);
    const orgao = await this.orgaosService.atualizarModulos(id, modulos, body.fluxo_os, body.envio_automatico_os);

    return {
      success: true,
      orgao: {
        ...orgao,
        modulos_ativos: orgao.modulos_habilitados || [],
        modulos_habilitados: orgao.modulos_habilitados || [],
        fluxo_os: orgao.fluxo_os || 'REQUISICAO',
      },
    };
  }

  // ============ CONFIGURAÇÃO EMAIL (SMTP) ============

  @Get(':id/email-config')
  async getEmailConfig(@Param('id') id: string) {
    return await this.orgaosService.getEmailConfig(id);
  }

  @Put(':id/email-config')
  async atualizarEmailConfig(
    @Param('id') id: string,
    @Body() config: {
      email_metodo?: 'SMTP' | 'RESEND';
      email_smtp_host?: string;
      email_smtp_port?: number;
      email_smtp_secure?: boolean;
      email_smtp_user?: string;
      email_smtp_senha?: string;
      email_from?: string;
      email_imap_host?: string;
      email_imap_port?: number;
      email_imap_user?: string;
      email_imap_senha?: string;
      email_resend_api_key?: string;
      email_resend_from?: string;
    }
  ) {
    const orgao = await this.orgaosService.atualizarEmailConfig(id, config);
    return {
      success: true,
      config: await this.orgaosService.getEmailConfig(id),
    };
  }

  @Post(':id/email-config/testar')
  async testarEmailConfig(
    @Param('id') id: string,
    @Body() body: { email: string }
  ) {
    return await this.emailService.testarConexao(id, body?.email);
  }

  @Post(':id/email-config/testar-imap')
  async testarImapConfig(@Param('id') id: string) {
    return await this.imapService.testarConexao(id);
  }

  // ============ CONFIGURAÇÃO WHATSAPP ============

  @Get(':id/whatsapp-config')
  async getWhatsAppConfig(@Param('id') id: string) {
    return await this.orgaosService.getWhatsAppConfig(id);
  }

  @Put(':id/whatsapp-config')
  async atualizarWhatsAppConfig(
    @Param('id') id: string,
    @Body() config: {
      whatsapp_provider?: string;
      whatsapp_instance_id?: string;
      whatsapp_token?: string;
      whatsapp_client_token?: string;
    }
  ) {
    const orgao = await this.orgaosService.atualizarWhatsAppConfig(id, config);
    return {
      success: true,
      config: await this.orgaosService.getWhatsAppConfig(id),
    };
  }

  @Post(':id/whatsapp-config/testar')
  async testarWhatsAppConfig(
    @Param('id') id: string,
    @Body() body: { numero: string }
  ) {
    return await this.whatsappService.testarConexao(id, body?.numero || '');
  }

  // ============ CAIXA DE ENTRADA (IMAP) ============

  @Get(':id/emails')
  async listarEmails(
    @Param('id') id: string,
    @Req() req: { user: JwtPayload },
    @Query('pasta') pasta?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    if (!this.podeAcessarOrgao(req.user, id)) {
      throw new UnauthorizedException('Sem permissão para acessar este órgão');
    }
    const lim = limit ? parseInt(limit, 10) : 50;
    const off = offset ? parseInt(offset, 10) : 0;
    return await this.imapService.listarEmails(id, pasta || 'INBOX', lim, off);
  }

  @Get(':id/emails/:uid')
  async obterEmail(
    @Param('id') id: string,
    @Param('uid') uid: string,
    @Req() req: { user: JwtPayload }
  ) {
    if (!this.podeAcessarOrgao(req.user, id)) {
      throw new UnauthorizedException('Sem permissão para acessar este órgão');
    }
    const email = await this.imapService.obterEmail(id, parseInt(uid, 10));
    await this.imapService.marcarComoLido(id, parseInt(uid, 10));
    return email;
  }

  // ============ CONVITE WHATSAPP ============

  @Post('convite-whatsapp')
  async enviarConviteWhatsApp(
    @Req() req: { user: JwtPayload },
    @Body() body: { telefone: string; nome?: string; orgaoId: string }
  ) {
    if (req.user.type !== UserType.ADMIN) {
      throw new UnauthorizedException('Apenas administradores podem enviar convites');
    }

    const { telefone, nome, orgaoId } = body;
    if (!telefone || !orgaoId) {
      throw new UnauthorizedException('Telefone e órgão são obrigatórios');
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://www.portaldcp.com.br';
    const mensagem =
      `Olá${nome ? `, ${nome}` : ''}! 👋\n\n` +
      `Você foi convidado(a) para acessar o *Portal DCP* – sistema de gestão de contratações públicas.\n\n` +
      `📋 *Como funciona:*\n` +
      `1️⃣ Acesse o link abaixo\n` +
      `2️⃣ Clique em *"Entrar com Google"* e use sua conta Google\n` +
      `3️⃣ Selecione o órgão ao qual pertence\n` +
      `4️⃣ Aguarde a aprovação do administrador\n` +
      `5️⃣ Você receberá uma notificação aqui no WhatsApp quando seu acesso for liberado ✅\n\n` +
      `🔗 *Link de acesso:*\n${frontendUrl}/orgao-login\n\n` +
      `Em caso de dúvidas, entre em contato com o administrador do sistema.`;

    const enviado = await this.whatsappService.enviar(orgaoId, { to: telefone, mensagem });

    return {
      success: enviado,
      mensagem: enviado ? 'Convite enviado com sucesso!' : 'Falha ao enviar. Verifique se o WhatsApp está configurado para este órgão.',
    };
  }

  @Post('convite-fornecedor-whatsapp')
  async enviarConviteFornecedorWhatsApp(
    @Req() req: { user: JwtPayload },
    @Body() body: { telefone: string; nome?: string; orgaoId: string }
  ) {
    if (req.user.type !== UserType.ADMIN) {
      throw new UnauthorizedException('Apenas administradores podem enviar convites');
    }

    const { telefone, nome, orgaoId } = body;
    if (!telefone || !orgaoId) {
      throw new UnauthorizedException('Telefone e órgão são obrigatórios');
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://www.portaldcp.com.br';
    const mensagem =
      `Olá${nome ? `, ${nome}` : ''}! 👋\n\n` +
      `Você está recebendo esta mensagem porque a *Câmara Municipal de Luís Eduardo Magalhães – BA* identificou contratos em seu nome ou empresa em nossos registros.\n\n` +
      `Gostaríamos de convidá-lo(a) a se cadastrar no nosso *Portal de Compras Públicas*, onde você poderá acompanhar contratos, processos licitatórios e receber comunicações oficiais de forma rápida e segura.\n\n` +
      `📋 *Como se cadastrar:*\n` +
      `1️⃣ Acesse o link abaixo\n` +
      `2️⃣ Clique em *"Criar conta"* e preencha seus dados\n` +
      `3️⃣ Informe o CNPJ da sua empresa para vincular seus contratos\n` +
      `4️⃣ Aguarde a confirmação de cadastro ✅\n\n` +
      `🔗 *Acesse o portal:*\n${frontendUrl}/login\n\n` +
      `💾 *IMPORTANTE:* Salve este número em seus contatos! As notificações oficiais da Câmara Municipal de Luís Eduardo Magalhães serão enviadas pelo WhatsApp por este número.\n\n` +
      `Em caso de dúvidas, entre em contato diretamente por este WhatsApp.`;

    const enviado = await this.whatsappService.enviar(orgaoId, { to: telefone, mensagem });

    return {
      success: enviado,
      mensagem: enviado ? 'Convite enviado com sucesso!' : 'Falha ao enviar. Verifique se o WhatsApp está configurado para este órgão.',
    };
  }

  @Post(':id/emails/:uid/responder')
  async responderEmail(
    @Param('id') id: string,
    @Param('uid') uid: string,
    @Req() req: { user: JwtPayload },
    @Body() body: { subject: string; text: string; replyTo: string }
  ) {
    if (!this.podeAcessarOrgao(req.user, id)) {
      throw new UnauthorizedException('Sem permissão para acessar este órgão');
    }
    const email = await this.imapService.obterEmail(id, parseInt(uid, 10));
    const toRaw = body.replyTo || email.from;
    const emailAddr = toRaw.match(/<([^>]+)>/)?.[1] || toRaw;
    await this.emailService.enviar(id, {
      to: emailAddr,
      subject: body.subject || `Re: ${email.subject}`,
      text: body.text,
      replyTo: emailAddr,
    });
    return { success: true, mensagem: 'Resposta enviada' };
  }
}
