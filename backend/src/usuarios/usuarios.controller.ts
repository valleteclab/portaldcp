import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Logger,
  Req,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsuariosService } from './usuarios.service';
import { RoleUsuario } from './entities/usuario.entity';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { Public } from '../auth/public.decorator';
import type { JwtPayload } from '../auth/auth.service';

@Controller('usuarios')
export class UsuariosController {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly jwtService: JwtService,
  ) {}

  @Post()
  async create(
    @Body() body: {
      nome: string;
      email: string;
      senha: string;
      cpf?: string;
      telefone?: string;
      cargo?: string;
      matricula?: string;
      portaria_fiscal?: string;
      role?: RoleUsuario;
      orgao_id?: string;
      pode_receber_patrimonio?: boolean;
    },
  ) {
    const usuario = await this.usuariosService.create(body);
    const { senha_hash, ...result } = usuario;
    return result;
  }

  @Public()
  @Post('login')
  async login(@Body() body: { email: string; senha: string }) {
    const usuario = await this.usuariosService.login(body.email, body.senha);
    const { senha_hash, ...result } = usuario;
    
    // Gerar token JWT
    const payload = {
      sub: usuario.id,
      email: usuario.email,
      type: 'USUARIO',
      role: usuario.role,
      orgaoId: usuario.orgao_id, // Usar camelCase para compatibilidade com JwtPayload
    };
    const access_token = this.jwtService.sign(payload);
    
    return {
      success: true,
      access_token,
      usuario: result,
    };
  }

  @Get()
  async findAll(@Query('orgao_id') orgaoId?: string) {
    const usuarios = await this.usuariosService.findAll(orgaoId);
    return usuarios.map(({ senha_hash, ...u }) => u);
  }

  @Get('pregoeiros/:orgaoId')
  async findPregoeiros(@Param('orgaoId') orgaoId: string) {
    const pregoeiros = await this.usuariosService.findPregoeiros(orgaoId);
    return pregoeiros.map(({ senha_hash, ...u }) => u);
  }

  /**
   * Retorna os dados completos do usuário logado atual
   * SEMPRE busca do banco de dados (fonte da verdade)
   */
  @Get('me')
  async getMe(@Req() request: { user: JwtPayload }) {
    const user = request.user;
    if (!user || !user.sub) {
      throw new Error('Usuário não autenticado');
    }
    const usuario = await this.usuariosService.findById(user.sub);
    const { senha_hash, ...result } = usuario;
    return result;
  }

  @Get('pendentes')
  async listarPendentesTop(@Query('orgao_id') orgaoId?: string) {
    const usuarios = await this.usuariosService.listarPendentes(orgaoId);
    return usuarios.map(({ senha_hash, ...u }) => u);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const usuario = await this.usuariosService.findById(id);
    const { senha_hash, ...result } = usuario;
    return result;
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: Partial<{
      nome: string;
      email: string;
      cpf: string;
      telefone: string;
      cargo: string;
      matricula: string;
      portaria_fiscal: string;
      role: RoleUsuario;
      orgao_id: string;
      ativo: boolean;
      pode_aprovar_requisicoes: boolean;
      pode_cancelar_estornar: boolean;
      pode_liberar_contratos: boolean;
      pode_excluir_medicao: boolean;
      eh_fiscal_contrato: boolean;
      pode_gerenciar_os: boolean;
      pode_receber_patrimonio: boolean;
    }>,
  ) {
    const usuario = await this.usuariosService.update(id, body);
    const { senha_hash, ...result } = usuario;
    return result;
  }

  @Put(':id/senha')
  async alterarSenha(
    @Param('id') id: string,
    @Body() body: { senha_atual: string; nova_senha: string },
  ) {
    await this.usuariosService.alterarSenha(id, body.senha_atual, body.nova_senha);
    return { success: true, message: 'Senha alterada com sucesso' };
  }

  @Put(':id/desativar')
  async desativar(@Param('id') id: string) {
    const usuario = await this.usuariosService.desativar(id);
    const { senha_hash, ...result } = usuario;
    return result;
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.usuariosService.delete(id);
    return { success: true, message: 'Usuário removido' };
  }

  // ============ MÓDULOS DO USUÁRIO ============

  @Get(':id/modulos')
  async getModulos(@Param('id') id: string) {
    return this.usuariosService.getModulosUsuario(id);
  }

  @Put(':id/modulos')
  async updateModulos(
    @Param('id') id: string,
    @Body() body: { modulos: ModuloSistema[] },
  ) {
    const usuario = await this.usuariosService.atualizarModulos(id, body.modulos);
    const { senha_hash, ...result } = usuario;
    return {
      success: true,
      message: 'Módulos do usuário atualizados',
      usuario: result,
    };
  }

  // ============ APROVAÇÃO GOOGLE OAUTH ============

  @Put(':id/aprovar')
  async aprovar(
    @Param('id') id: string,
    @Req() request: { user: JwtPayload },
    @Body() body: {
      role?: RoleUsuario;
      pode_aprovar_requisicoes?: boolean;
      pode_cancelar_estornar?: boolean;
      pode_liberar_contratos?: boolean;
      pode_excluir_medicao?: boolean;
      eh_fiscal_contrato?: boolean;
      pode_gerenciar_os?: boolean;
      pode_receber_patrimonio?: boolean;
    },
  ) {
    const adminId = request.user.sub;
    const usuario = await this.usuariosService.aprovar(id, adminId, body);
    const { senha_hash, ...result } = usuario;
    return { success: true, usuario: result };
  }

  @Put(':id/rejeitar')
  async rejeitar(
    @Param('id') id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const adminId = request.user.sub;
    const usuario = await this.usuariosService.rejeitar(id, adminId);
    const { senha_hash, ...result } = usuario;
    return { success: true, usuario: result };
  }
}
