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
} from '@nestjs/common';
import { ContratosService } from './contratos.service';
import { Contrato, StatusContrato, TipoContrato } from './entities/contrato.entity';
import { TermoAditivo } from './entities/termo-aditivo.entity';
import { Public } from '../auth/public.decorator';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { JwtPayload, UserType } from '../auth/auth.service';

@Controller('contratos')
@RequireModule(ModuloSistema.CONTRATOS)
export class ContratosController {
  constructor(private readonly contratosService: ContratosService) {}

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
    return this.contratosService.atualizar(id, dados);
  }

  @Patch(':id/status')
  async alterarStatus(
    @Param('id') id: string,
    @Body('status') status: StatusContrato,
    @Req() request: { user: JwtPayload },
  ) {
    const contrato = await this.contratosService.findOne(id);
    this.validarPropriedade(request.user, contrato.orgao_id);
    return this.contratosService.alterarStatus(id, status);
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
