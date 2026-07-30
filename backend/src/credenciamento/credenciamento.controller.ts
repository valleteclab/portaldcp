import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Body,
  Query,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { CredenciamentoService } from './credenciamento.service';
import { Credenciamento, StatusCredenciamento, StatusCredenciado, TipoCredenciamento } from './entities/credenciamento.entity';
import { Public } from '../auth/public.decorator';
import { JwtPayload, UserType } from '../auth/auth.service';

@Controller('credenciamento')
export class CredenciamentoController {
  constructor(private readonly service: CredenciamentoService) {}

  private getOrgaoId(user: JwtPayload, orgaoIdParam?: string): string {
    if (user.type === UserType.ORGAO) return user.sub;
    if (user.type === UserType.ADMIN && orgaoIdParam) return orgaoIdParam;
    const orgaoId = user.orgaoId || (user as any).orgao_id;
    if (orgaoId) return orgaoId;
    throw new ForbiddenException('Não foi possível identificar o órgão do usuário');
  }

  // ============ CRUD ============

  @Post()
  async criar(@Body() dados: Partial<Credenciamento>) {
    return this.service.criar(dados);
  }

  @Get()
  async findAll(
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
    @Query('status') status?: StatusCredenciamento,
    @Query('tipo') tipo?: TipoCredenciamento
  ) {
    const orgaoId = this.getOrgaoId(request.user, orgaoIdParam);
    return this.service.findAll({ orgaoId, status, tipo });
  }

  @Public()
  @Get('publicos')
  async findPublicos(
    @Query('tipo') tipo?: TipoCredenciamento,
    @Query('uf') uf?: string
  ) {
    return this.service.findPublicos({ tipo, uf });
  }

  @Public()
  @Get('publicos/:id')
  async findPublicoById(@Param('id') id: string) {
    return this.service.findPublicoById(id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/estatisticas')
  async getEstatisticas(@Param('id') id: string) {
    return this.service.getEstatisticas(id);
  }

  @Put(':id')
  async atualizar(@Param('id') id: string, @Body() dados: Partial<Credenciamento>) {
    return this.service.atualizar(id, dados);
  }

  @Patch(':id/publicar')
  async publicar(@Param('id') id: string) {
    return this.service.publicar(id);
  }

  @Patch(':id/iniciar-inscricoes')
  async iniciarInscricoes(@Param('id') id: string) {
    return this.service.iniciarInscricoes(id);
  }

  @Patch(':id/encerrar')
  async encerrar(@Param('id') id: string) {
    return this.service.encerrar(id);
  }

  // ============ CREDENCIADOS ============

  @Post(':id/inscrever')
  async inscreverFornecedor(
    @Param('id') id: string,
    @Body() dados: {
      fornecedor_id: string;
      fornecedor_cnpj: string;
      fornecedor_razao_social: string;
      documentos_enviados?: any;
    }
  ) {
    return this.service.inscreverFornecedor(id, dados);
  }

  @Get(':id/credenciados')
  async findCredenciados(
    @Param('id') id: string,
    @Query('status') status?: StatusCredenciado
  ) {
    return this.service.findCredenciados(id, status);
  }

  @Patch('credenciados/:credenciadoId/analisar')
  async analisarCredenciado(
    @Param('credenciadoId') credenciadoId: string,
    @Body() dados: {
      status: StatusCredenciado;
      parecer: string;
      analista_nome: string;
      motivo_reprovacao?: string;
    }
  ) {
    return this.service.analisarCredenciado(credenciadoId, dados);
  }
}
