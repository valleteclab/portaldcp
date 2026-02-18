import { Controller, Get, Post, Put, Delete, Body, Param, Query, ValidationPipe, UnauthorizedException, Req, Logger } from '@nestjs/common';
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

  @Get()
  async findAll(): Promise<any[]> {
    const orgaos = await this.orgaosService.findAll();
    // Mapeia modulos_habilitados para modulos_ativos para compatibilidade com frontend
    return orgaos.map(orgao => {
      const { senha_hash, ...orgaoSemSenha } = orgao;
      // Busca módulos atualizados do banco para garantir consistência
      const modulos = orgao.modulos_habilitados || [];
      return {
        ...orgaoSemSenha,
        modulos_ativos: modulos,
        modulos_habilitados: modulos, // Compatibilidade
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
      modulos_ativos: modulosEfetivos, // Módulos efetivos para o usuário
      modulos_habilitados: modulosEfetivos, // Compatibilidade
      modulos_orgao: modulosOrgao, // Todos os módulos do órgão (para referência)
      herda_modulos_orgao: herdaDoOrgao, // Indica se está herdando ou tem personalização
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
    @Body() body: { modulos: string[] }
  ) {
    const { ModuloSistema } = require('./enums/modulos.enum');
    const modulos = body.modulos.map(m => m as typeof ModuloSistema[keyof typeof ModuloSistema]);
    
    // Debug: log dos módulos recebidos
    console.log(`[OrgaosController] Atualizando módulos para órgão ${id}:`, modulos);
    
    const orgao = await this.orgaosService.atualizarModulos(id, modulos);
    
    // Debug: log dos módulos salvos
    console.log(`[OrgaosController] Módulos salvos no banco:`, orgao.modulos_habilitados);
    
    return {
      success: true,
      orgao: {
        ...orgao,
        modulos_ativos: orgao.modulos_habilitados || [], // Compatibilidade com frontend
        modulos_habilitados: orgao.modulos_habilitados || [], // Garantir que sempre retorna array
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
