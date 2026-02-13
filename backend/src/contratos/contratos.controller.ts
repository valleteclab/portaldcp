import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContratosService } from './contratos.service';
import { Contrato, StatusContrato, TipoContrato } from './entities/contrato.entity';
import { TermoAditivo } from './entities/termo-aditivo.entity';
import { AnexoMedicao } from './entities/anexo-medicao.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Public } from '../auth/public.decorator';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { JwtPayload, UserType } from '../auth/auth.service';

@Controller('contratos')
@RequireModule(ModuloSistema.CONTRATOS)
export class ContratosController {
  constructor(
    private readonly contratosService: ContratosService,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    @InjectRepository(AnexoMedicao)
    private readonly anexoRepository: Repository<AnexoMedicao>,
  ) {}

  // ============ CRUD CONTRATOS ============

  @Post()
  async criar(@Body() dados: Partial<Contrato>) {
    return this.contratosService.criar(dados);
  }

  @Post('importar')
  async importarContratos(
    @Body() body: { orgaoId: string; contratos: any[] }
  ) {
    if (!body.orgaoId || !body.contratos || !Array.isArray(body.contratos)) {
      throw new Error('Dados inválidos. Envie orgaoId e contratos (array).');
    }
    return this.contratosService.importarContratos(body.orgaoId, body.contratos);
  }

  @Post('licitacao/:licitacaoId')
  async criarAPartirDaLicitacao(
    @Param('licitacaoId') licitacaoId: string,
    @Body() dados: Partial<Contrato>
  ) {
    return this.contratosService.criarAPartirDaLicitacao(licitacaoId, dados);
  }

  @Get()
  async findAll(
    @Query('orgaoId') orgaoId?: string,
    @Query('fornecedorId') fornecedorId?: string,
    @Query('status') status?: StatusContrato,
    @Query('tipo') tipo?: TipoContrato,
    @Query('ano') ano?: string,
    @Query('vigentes') vigentes?: string
  ) {
    return this.contratosService.findAll({
      orgaoId,
      fornecedorId,
      status,
      tipo,
      ano: ano ? parseInt(ano) : undefined,
      vigentes: vigentes === 'true'
    });
  }

  @Get('estatisticas/status')
  async estatisticasPorStatus(@Query('orgaoId') orgaoId: string) {
    return this.contratosService.contarPorStatus(orgaoId);
  }

  @Get('estatisticas/a-vencer')
  async contratosAVencer(
    @Query('orgaoId') orgaoId: string,
    @Query('dias') dias?: string
  ) {
    return this.contratosService.contratosAVencer(orgaoId, dias ? parseInt(dias) : 30);
  }

  @Get('estatisticas/valor-total')
  async valorTotal(
    @Query('orgaoId') orgaoId: string,
    @Query('ano') ano?: string
  ) {
    const valor = await this.contratosService.valorTotalContratado(
      orgaoId,
      ano ? parseInt(ano) : undefined
    );
    return { valor_total: valor };
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const contrato = await this.contratosService.findOne(id);
    this.validarPropriedade(request.user, contrato.orgao_id);
    return contrato;
  }

  @Get('numero/:numero')
  async findByNumero(
    @Param('numero') numero: string,
    @Query('orgaoId') orgaoId: string
  ) {
    return this.contratosService.findByNumero(numero, orgaoId);
  }

  @Put(':id')
  async atualizar(
    @Param('id') id: string,
    @Body() dados: Partial<Contrato>,
    @Req() request: { user: JwtPayload },
  ) {
    const contrato = await this.contratosService.findOne(id);
    this.validarPropriedade(request.user, contrato.orgao_id);
    const userName = await this.resolveUserName(request.user);
    return this.contratosService.atualizar(id, dados, request.user.sub, userName);
  }

  @Patch(':id/status')
  async alterarStatus(
    @Param('id') id: string,
    @Body('status') status: StatusContrato,
    @Req() request: { user: JwtPayload },
  ) {
    const contrato = await this.contratosService.findOne(id);
    this.validarPropriedade(request.user, contrato.orgao_id);
    const userName = await this.resolveUserName(request.user);
    return this.contratosService.alterarStatus(id, status, request.user.sub, userName);
  }

  // ============ LIBERAÇÃO DE CONTRATOS ============

  @Post(':id/liberar')
  async liberarContrato(
    @Param('id') id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const contrato = await this.contratosService.findOne(id);
    this.validarPropriedade(request.user, contrato.orgao_id);

    // Verifica permissão: órgão (login direto) pode liberar, ou usuário com permissão
    if (request.user.type === UserType.USUARIO) {
      const usuario = await this.usuarioRepository.findOne({ where: { id: request.user.sub } });
      if (!usuario?.pode_liberar_contratos) {
        throw new ForbiddenException('Você não tem permissão para liberar contratos');
      }
      return this.contratosService.liberarContrato(id, usuario.id, usuario.nome);
    }

    // Órgão ou Admin podem liberar diretamente
    const nome = request.user.type === UserType.ADMIN ? 'Administrador' : 'Órgão';
    return this.contratosService.liberarContrato(id, request.user.sub, nome);
  }

  @Post(':id/rejeitar-liberacao')
  async rejeitarLiberacao(
    @Param('id') id: string,
    @Body('motivo') motivo: string,
    @Req() request: { user: JwtPayload },
  ) {
    const contrato = await this.contratosService.findOne(id);
    this.validarPropriedade(request.user, contrato.orgao_id);

    // Mesma verificação de permissão
    if (request.user.type === UserType.USUARIO) {
      const usuario = await this.usuarioRepository.findOne({ where: { id: request.user.sub } });
      if (!usuario?.pode_liberar_contratos) {
        throw new ForbiddenException('Você não tem permissão para rejeitar liberação de contratos');
      }
    }

    const userName = await this.resolveUserName(request.user);
    return this.contratosService.rejeitarLiberacao(id, motivo, request.user.sub, userName);
  }

  // ============ HISTÓRICO ============

  @Get(':id/historico')
  async listarHistorico(
    @Param('id') id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const contrato = await this.contratosService.findOne(id);
    this.validarPropriedade(request.user, contrato.orgao_id);
    return this.contratosService.listarHistorico(id);
  }

  // ============ TERMOS ADITIVOS ============

  @Post(':contratoId/termos')
  async criarTermoAditivo(
    @Param('contratoId') contratoId: string,
    @Body() dados: Partial<TermoAditivo>,
    @Req() request: { user: JwtPayload },
  ) {
    const contrato = await this.contratosService.findOne(contratoId);
    this.validarPropriedade(request.user, contrato.orgao_id);
    return this.contratosService.criarTermoAditivo(contratoId, dados);
  }

  @Get(':contratoId/termos')
  async findTermosAditivos(
    @Param('contratoId') contratoId: string,
    @Req() request: { user: JwtPayload },
  ) {
    const contrato = await this.contratosService.findOne(contratoId);
    this.validarPropriedade(request.user, contrato.orgao_id);
    return this.contratosService.findTermosAditivos(contratoId);
  }

  @Get('termos/:id')
  async findTermoAditivo(@Param('id') id: string) {
    return this.contratosService.findTermoAditivo(id);
  }

  // ============ HELPERS ============

  private async resolveUserName(user: JwtPayload): Promise<string> {
    if (user.type === UserType.ADMIN) return 'Administrador';
    if (user.type === UserType.ORGAO) return 'Órgão';
    if (user.type === UserType.USUARIO) {
      const usuario = await this.usuarioRepository.findOne({ where: { id: user.sub } });
      return usuario?.nome || 'Usuário';
    }
    return 'Sistema';
  }

  private getOrgaoId(user: JwtPayload): string {
    if (user.type === UserType.ORGAO) return user.sub;
    if (user.type === UserType.ADMIN) return ''; // Admin acessa tudo
    const orgaoId = user.orgaoId || (user as any).orgao_id;
    if (orgaoId) return orgaoId;
    throw new ForbiddenException('Órgão não identificado');
  }

  private validarPropriedade(user: JwtPayload, orgaoIdRecurso: string): void {
    if (user.type === UserType.ADMIN) return; // Admin acessa tudo
    const orgaoId = this.getOrgaoId(user);
    if (orgaoId !== orgaoIdRecurso) {
      throw new ForbiddenException('Você não tem permissão para acessar este recurso');
    }
  }

  // ============ ENDPOINTS PÚBLICOS ============

  // ============ ANEXOS DE MEDIÇÃO ============

  /**
   * Lista anexos (fotos/documentos) de uma medição.
   * GET /api/contratos/medicoes/:medicaoId/anexos
   */
  @Get('medicoes/:medicaoId/anexos')
  async listarAnexosMedicao(@Param('medicaoId') medicaoId: string) {
    return this.anexoRepository.find({
      where: { medicao_id: medicaoId },
      order: { created_at: 'DESC' },
    });
  }

  // ============ ROTAS PÚBLICAS ============

  @Public()
  @Get('publicos/lista')
  async listarPublicos(
    @Query('orgaoId') orgaoId?: string,
    @Query('fornecedorCnpj') fornecedorCnpj?: string,
    @Query('ano') ano?: string,
    @Query('vigentes') vigentes?: string
  ) {
    return this.contratosService.findPublicos({
      orgaoId,
      fornecedorCnpj,
      ano: ano ? parseInt(ano) : undefined,
      vigentes: vigentes === 'true'
    });
  }

  @Public()
  @Get('publicos/:id')
  async findPublicoById(@Param('id') id: string) {
    return this.contratosService.findPublicoById(id);
  }
}
