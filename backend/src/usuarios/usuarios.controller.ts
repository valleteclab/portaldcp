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
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsuariosService } from './usuarios.service';
import { RoleUsuario, Usuario } from './entities/usuario.entity';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { Public } from '../auth/public.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { usuarioSemSegredos } from '../orgaos/orgao-sem-segredos';
import { AcessoLicitacaoService, Ator, AtorAtual, SomenteOrgao } from '../auth/acesso';

@Controller('usuarios')
export class UsuariosController {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly jwtService: JwtService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  // ============ ACESSO (E9b) ============
  // Gestor do órgão = login do próprio órgão ou usuário do órgão com papel
  // ADMIN (do órgão); o admin da plataforma gere todos. Um usuário comum só lê
  // o próprio cadastro, altera os próprios dados de perfil e a própria senha.
  // Usuário de outro órgão: leitura → 404, escrita → 403. Fornecedor → 403.
  // `role` só aceita os papéis do órgão (ADMIN/PREGOEIRO/EQUIPE_APOIO) — não
  // existe caminho daqui para admin da plataforma (tipo de token ADMIN).

  private static readonly CAMPOS_PERFIL = ['nome', 'cpf', 'telefone', 'cargo', 'matricula', 'crea'] as const;

  private ehGestorDoOrgao(ator: Ator | null, orgaoId: string | null | undefined): boolean {
    if (!ator) return false;
    if (ator.admin) return true;
    if (!orgaoId || ator.orgaoId !== orgaoId) return false;
    return ator.tipo === 'ORGAO' || (ator.tipo === 'USUARIO' && ator.role === RoleUsuario.ADMIN);
  }

  private exigirGestor(ator: Ator | null, orgaoId: string | null | undefined): void {
    if (!this.ehGestorDoOrgao(ator, orgaoId)) {
      throw new ForbiddenException('Somente o administrador do órgão pode gerenciar usuários');
    }
  }

  private validarRole(role: unknown): void {
    if (role === undefined || role === null) return;
    if (!Object.values(RoleUsuario).includes(role as RoleUsuario)) {
      throw new BadRequestException(`Papel inválido: use ${Object.values(RoleUsuario).join(', ')}`);
    }
  }

  /** Carrega o usuário-alvo e decide o acesso do ator. */
  private async alvo(
    ator: Ator | null,
    id: string,
    modo: 'leitura' | 'escrita',
  ): Promise<{ usuario: Usuario; proprio: boolean; gestor: boolean }> {
    if (!ator) throw new UnauthorizedException('Autenticação necessária');
    if (ator.tipo === 'FORNECEDOR') throw new ForbiddenException('Ação exclusiva do órgão');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new NotFoundException('Usuário não encontrado');
    }
    const usuario = await this.usuariosService.findById(id);
    const proprio = ator.tipo === 'USUARIO' && ator.usuarioId === usuario.id;
    const gestor = this.ehGestorDoOrgao(ator, usuario.orgao_id);
    if (proprio || gestor) return { usuario, proprio, gestor };
    const mesmoOrgao = !!ator.orgaoId && ator.orgaoId === usuario.orgao_id;
    if (modo === 'leitura' && !mesmoOrgao) throw new NotFoundException('Usuário não encontrado');
    throw new ForbiddenException(
      mesmoOrgao ? 'Somente o administrador do órgão pode gerenciar outros usuários' : 'Acesso negado: usuário de outro órgão',
    );
  }

  @Post()
  @SomenteOrgao()
  async create(
    @AtorAtual() ator: Ator | null,
    @Body() body: {
      nome: string;
      email: string;
      senha: string;
      cpf?: string;
      telefone?: string;
      cargo?: string;
      matricula?: string;
      portaria_fiscal?: string;
      crea?: string;
      contrato_designacao?: string;
      role?: RoleUsuario;
      orgao_id?: string;
      pode_receber_patrimonio?: boolean;
    },
  ) {
    // Órgão do novo usuário: do token (o admin da plataforma informa orgao_id)
    const orgaoId = ator?.admin ? body?.orgao_id : ator?.orgaoId ?? undefined;
    if (!ator?.admin && body?.orgao_id && body.orgao_id !== orgaoId) {
      throw new ForbiddenException('Acesso negado: o usuário só pode ser criado no seu órgão');
    }
    this.exigirGestor(ator, orgaoId);
    this.validarRole(body?.role);
    const usuario = await this.usuariosService.create({ ...body, orgao_id: orgaoId });
    const result = usuarioSemSegredos(usuario);
    return result;
  }

  @Public()
  @Post('login')
  async login(@Body() body: { email: string; senha: string }) {
    const usuario = await this.usuariosService.login(body.email, body.senha);
    const result = usuarioSemSegredos(usuario);
    
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

  /**
   * Usuários do órgão. O órgão vem do TOKEN: órgão/usuário só lista o próprio
   * (o `orgao_id` da consulta é ignorado); só o admin da plataforma escolhe o
   * órgão ou lista todos. Fornecedor → 403.
   */
  @Get()
  @SomenteOrgao()
  async findAll(@AtorAtual() ator: Ator | null, @Query('orgao_id') orgaoId?: string) {
    const alvo = ator?.admin ? orgaoId : (ator?.orgaoId as string);
    const usuarios = await this.usuariosService.findAll(alvo);
    return usuarios.map((u) => usuarioSemSegredos(u));
  }

  @Get('pregoeiros/:orgaoId')
  @SomenteOrgao()
  async findPregoeiros(@Param('orgaoId') orgaoId: string, @AtorAtual() ator: Ator | null) {
    this.acesso.assertProprioOrgao(ator, orgaoId, 'leitura');
    const pregoeiros = await this.usuariosService.findPregoeiros(orgaoId);
    return pregoeiros.map((u) => usuarioSemSegredos(u));
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
    const result = usuarioSemSegredos(usuario);
    return result;
  }

  @Get('pendentes')
  @SomenteOrgao()
  async listarPendentesTop(@AtorAtual() ator: Ator | null, @Query('orgao_id') orgaoIdParam?: string) {
    const orgaoId = ator?.admin ? orgaoIdParam : (ator?.orgaoId as string);
    this.exigirGestor(ator, ator?.admin ? orgaoId ?? null : orgaoId);
    const usuarios = await this.usuariosService.listarPendentes(orgaoId);
    return usuarios.map((u) => usuarioSemSegredos(u));
  }

  @Get(':id')
  async findById(@Param('id') id: string, @AtorAtual() ator: Ator | null) {
    const { usuario } = await this.alvo(ator, id, 'leitura');
    const result = usuarioSemSegredos(usuario);
    return result;
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @AtorAtual() ator: Ator | null,
    @Body() body: Partial<{
      nome: string;
      email: string;
      cpf: string;
      telefone: string;
      cargo: string;
      matricula: string;
      portaria_fiscal: string;
      crea: string;
      contrato_designacao: string;
      role: RoleUsuario;
      orgao_id: string;
      ativo: boolean;
      pode_aprovar_requisicoes: boolean;
      pode_cancelar_estornar: boolean;
      pode_liberar_contratos: boolean;
      pode_excluir_medicao: boolean;
      pode_excluir_requisicao_combustivel: boolean;
      eh_fiscal_contrato: boolean;
      pode_gerenciar_os: boolean;
      pode_receber_patrimonio: boolean;
    }>,
  ) {
    const { gestor } = await this.alvo(ator, id, 'escrita');
    let dados: Record<string, unknown>;
    if (gestor) {
      dados = { ...(body || {}) };
      // Troca de órgão só pelo admin da plataforma
      if (!ator?.admin) delete dados.orgao_id;
      this.validarRole(dados.role);
    } else {
      // Próprio usuário: só os dados de perfil (papel, órgão, permissões e
      // ativação ficam com o gestor; senha pela rota :id/senha)
      dados = {};
      for (const campo of UsuariosController.CAMPOS_PERFIL) {
        if (body && (body as Record<string, unknown>)[campo] !== undefined) dados[campo] = (body as Record<string, unknown>)[campo];
      }
    }
    const usuario = await this.usuariosService.update(id, dados as any);
    const result = usuarioSemSegredos(usuario);
    return result;
  }

  @Put(':id/senha')
  async alterarSenha(
    @Param('id') id: string,
    @AtorAtual() ator: Ator | null,
    @Body() body: { senha_atual: string; nova_senha: string },
  ) {
    const { proprio } = await this.alvo(ator, id, 'escrita');
    if (!proprio) throw new ForbiddenException('A senha só é alterada pelo próprio usuário');
    await this.usuariosService.alterarSenha(id, body.senha_atual, body.nova_senha);
    return { success: true, message: 'Senha alterada com sucesso' };
  }

  @Put(':id/desativar')
  async desativar(@Param('id') id: string, @AtorAtual() ator: Ator | null) {
    const { gestor } = await this.alvo(ator, id, 'escrita');
    if (!gestor) throw new ForbiddenException('Somente o administrador do órgão pode desativar usuários');
    const usuario = await this.usuariosService.desativar(id);
    const result = usuarioSemSegredos(usuario);
    return result;
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @AtorAtual() ator: Ator | null) {
    const { gestor } = await this.alvo(ator, id, 'escrita');
    if (!gestor) throw new ForbiddenException('Somente o administrador do órgão pode remover usuários');
    await this.usuariosService.delete(id);
    return { success: true, message: 'Usuário removido' };
  }

  // ============ MÓDULOS DO USUÁRIO ============

  @Get(':id/modulos')
  async getModulos(@Param('id') id: string, @AtorAtual() ator: Ator | null) {
    await this.alvo(ator, id, 'leitura');
    return this.usuariosService.getModulosUsuario(id);
  }

  @Put(':id/modulos')
  async updateModulos(
    @Param('id') id: string,
    @AtorAtual() ator: Ator | null,
    @Body() body: { modulos: ModuloSistema[] },
  ) {
    const { gestor } = await this.alvo(ator, id, 'escrita');
    if (!gestor) throw new ForbiddenException('Somente o administrador do órgão altera os módulos do usuário');
    const usuario = await this.usuariosService.atualizarModulos(id, body.modulos);
    const result = usuarioSemSegredos(usuario);
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
    @AtorAtual() ator: Ator | null,
    @Body() body: {
      role?: RoleUsuario;
      pode_aprovar_requisicoes?: boolean;
      pode_cancelar_estornar?: boolean;
      pode_liberar_contratos?: boolean;
      pode_excluir_medicao?: boolean;
      pode_excluir_requisicao_combustivel?: boolean;
      eh_fiscal_contrato?: boolean;
      pode_gerenciar_os?: boolean;
      pode_receber_patrimonio?: boolean;
    },
  ) {
    const { gestor } = await this.alvo(ator, id, 'escrita');
    if (!gestor) throw new ForbiddenException('Somente o administrador do órgão aprova usuários');
    this.validarRole(body?.role);
    const adminId = request.user.sub;
    const usuario = await this.usuariosService.aprovar(id, adminId, body);
    const result = usuarioSemSegredos(usuario);
    return { success: true, usuario: result };
  }

  @Put(':id/rejeitar')
  async rejeitar(
    @Param('id') id: string,
    @Req() request: { user: JwtPayload },
    @AtorAtual() ator: Ator | null,
  ) {
    const { gestor } = await this.alvo(ator, id, 'escrita');
    if (!gestor) throw new ForbiddenException('Somente o administrador do órgão rejeita usuários');
    const adminId = request.user.sub;
    const usuario = await this.usuariosService.rejeitar(id, adminId);
    const result = usuarioSemSegredos(usuario);
    return { success: true, usuario: result };
  }
}
