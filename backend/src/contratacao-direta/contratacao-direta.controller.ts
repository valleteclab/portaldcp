import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query
} from '@nestjs/common';
import { ContratacaoDiretaService } from './contratacao-direta.service';
import { ContratacaoDireta, ItemContratacaoDireta, TipoContratacaoDireta, StatusContratacaoDireta } from './entities/contratacao-direta.entity';

@Controller('contratacao-direta')
export class ContratacaoDiretaController {
  constructor(private readonly service: ContratacaoDiretaService) {}

  // ============ CRUD ============

  @Post()
  async criar(@Body() dados: Partial<ContratacaoDireta>) {
    return this.service.criar(dados);
  }

  @Get()
  async findAll(
    @Query('orgaoId') orgaoId?: string,
    @Query('tipo') tipo?: TipoContratacaoDireta,
    @Query('status') status?: StatusContratacaoDireta,
    @Query('ano') ano?: string
  ) {
    return this.service.findAll({
      orgaoId,
      tipo,
      status,
      ano: ano ? parseInt(ano) : undefined
    });
  }

  @Get('publicos')
  async findPublicos(
    @Query('tipo') tipo?: TipoContratacaoDireta,
    @Query('uf') uf?: string,
    @Query('dispensaEletronica') dispensaEletronica?: string
  ) {
    return this.service.findPublicos({
      tipo,
      uf,
      dispensaEletronica: dispensaEletronica === 'true'
    });
  }

  @Get('estatisticas')
  async getEstatisticas(
    @Query('orgaoId') orgaoId: string,
    @Query('ano') ano?: string
  ) {
    return this.service.getEstatisticas(orgaoId, ano ? parseInt(ano) : undefined);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  async atualizar(@Param('id') id: string, @Body() dados: Partial<ContratacaoDireta>) {
    return this.service.atualizar(id, dados);
  }

  // ============ FLUXO ============

  @Patch(':id/enviar-aprovacao')
  async enviarParaAprovacao(@Param('id') id: string) {
    return this.service.enviarParaAprovacao(id);
  }

  @Patch(':id/aprovar')
  async aprovar(
    @Param('id') id: string,
    @Body() body: { autoridade: string }
  ) {
    return this.service.aprovar(id, body.autoridade);
  }

  @Patch(':id/publicar')
  async publicar(@Param('id') id: string) {
    return this.service.publicar(id);
  }

  @Patch(':id/adjudicar')
  async adjudicar(
    @Param('id') id: string,
    @Body() dados: {
      fornecedor_id: string;
      fornecedor_cnpj: string;
      fornecedor_razao_social: string;
      valor_contratado: number;
    }
  ) {
    return this.service.adjudicar(id, dados);
  }

  @Patch(':id/homologar')
  async homologar(@Param('id') id: string) {
    return this.service.homologar(id);
  }

  @Patch(':id/cancelar')
  async cancelar(
    @Param('id') id: string,
    @Body() body: { motivo: string }
  ) {
    return this.service.cancelar(id, body.motivo);
  }

  // ============ ITENS ============

  @Post(':id/itens')
  async adicionarItem(
    @Param('id') id: string,
    @Body() dados: Partial<ItemContratacaoDireta>
  ) {
    return this.service.adicionarItem(id, dados);
  }

  @Get(':id/itens')
  async findItens(@Param('id') id: string) {
    return this.service.findItens(id);
  }

  @Delete('itens/:itemId')
  async removerItem(@Param('itemId') itemId: string) {
    await this.service.removerItem(itemId);
    return { message: 'Item removido com sucesso' };
  }
}
