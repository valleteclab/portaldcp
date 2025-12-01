import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Body,
  Query
} from '@nestjs/common';
import { CredenciamentoService } from './credenciamento.service';
import { Credenciamento, StatusCredenciamento, StatusCredenciado, TipoCredenciamento } from './entities/credenciamento.entity';

@Controller('credenciamento')
export class CredenciamentoController {
  constructor(private readonly service: CredenciamentoService) {}

  // ============ CRUD ============

  @Post()
  async criar(@Body() dados: Partial<Credenciamento>) {
    return this.service.criar(dados);
  }

  @Get()
  async findAll(
    @Query('orgaoId') orgaoId?: string,
    @Query('status') status?: StatusCredenciamento,
    @Query('tipo') tipo?: TipoCredenciamento
  ) {
    return this.service.findAll({ orgaoId, status, tipo });
  }

  @Get('publicos')
  async findPublicos(
    @Query('tipo') tipo?: TipoCredenciamento,
    @Query('uf') uf?: string
  ) {
    return this.service.findPublicos({ tipo, uf });
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
