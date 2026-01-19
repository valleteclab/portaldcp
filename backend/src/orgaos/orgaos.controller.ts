import { Controller, Get, Post, Put, Delete, Body, Param, ValidationPipe, UnauthorizedException, Req } from '@nestjs/common';
import { OrgaosService } from './orgaos.service';
import { CreateOrgaoDto } from './dto/create-orgao.dto';
import { Orgao } from './entities/orgao.entity';
import { createHash } from 'crypto';
import { AuthService } from '../auth/auth.service';
import { Public } from '../auth/public.decorator';
import { JwtPayload, UserType } from '../auth/auth.service';

@Controller('orgaos')
export class OrgaosController {
  constructor(
    private readonly orgaosService: OrgaosService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  async create(@Body(new ValidationPipe()) createOrgaoDto: CreateOrgaoDto): Promise<Orgao> {
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
   */
  @Get('me')
  async getMe(@Req() request: { user: JwtPayload }) {
    const user = request.user;
    
    if (!user) {
      throw new UnauthorizedException('Usuário não autenticado');
    }

    let orgaoId: string;
    
    // Se for login direto do órgão
    if (user.type === UserType.ORGAO) {
      orgaoId = user.sub;
    } 
    // Se for usuário vinculado a um órgão (verifica ambos formatos: camelCase e snake_case)
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

    // Busca módulos diretamente do banco de dados
    const modulos = await this.orgaosService.getModulosOrgao(orgaoId);
    const orgao = await this.orgaosService.findOne(orgaoId);
    
    this.logger.log(`[GET /me] Retornando módulos para órgão ${orgaoId}: ${JSON.stringify(modulos)}`);
    
    // Remove senha do retorno
    const { senha_hash, ...orgaoSemSenha } = orgao;
    
    return {
      ...orgaoSemSenha,
      modulos_ativos: modulos, // Módulos sempre vêm do banco de dados
      modulos_habilitados: modulos, // Compatibilidade
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
}
