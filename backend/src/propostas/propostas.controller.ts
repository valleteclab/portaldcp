import { Controller, Get, Post, Put, Body, Param, ValidationPipe } from '@nestjs/common';
import { PropostasService } from './propostas.service';
import { CreatePropostaDto, DesclassificarPropostaDto } from './dto/create-proposta.dto';
import { Proposta } from './entities/proposta.entity';
import { PropostaItem } from './entities/proposta-item.entity';

@Controller('propostas')
export class PropostasController {
  constructor(private readonly propostasService: PropostasService) {}

  @Post()
  async create(@Body(new ValidationPipe()) createDto: CreatePropostaDto): Promise<Proposta> {
    return await this.propostasService.create(createDto);
  }

  @Get('licitacao/:licitacaoId')
  async findByLicitacao(@Param('licitacaoId') licitacaoId: string): Promise<Proposta[]> {
    return await this.propostasService.findByLicitacao(licitacaoId);
  }

  @Get('fornecedor/:fornecedorId')
  async findByFornecedor(@Param('fornecedorId') fornecedorId: string): Promise<Proposta[]> {
    return await this.propostasService.findByFornecedor(fornecedorId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Proposta> {
    return await this.propostasService.findOne(id);
  }

  @Get(':id/itens')
  async getItens(@Param('id') id: string): Promise<PropostaItem[]> {
    return await this.propostasService.getItens(id);
  }

  @Get('ranking/item/:itemId')
  async getRankingPorItem(@Param('itemId') itemId: string) {
    return await this.propostasService.getRankingPorItem(itemId);
  }

  @Put(':id/enviar')
  async enviar(@Param('id') id: string): Promise<Proposta> {
    return await this.propostasService.enviar(id);
  }

  @Put(':id/classificar')
  async classificar(@Param('id') id: string): Promise<Proposta> {
    return await this.propostasService.classificar(id);
  }

  @Put(':id/desclassificar')
  async desclassificar(
    @Param('id') id: string,
    @Body(new ValidationPipe()) dados: DesclassificarPropostaDto
  ): Promise<Proposta> {
    return await this.propostasService.desclassificar(id, dados);
  }

  @Put(':id/vencedora')
  async marcarVencedora(@Param('id') id: string): Promise<Proposta> {
    return await this.propostasService.marcarVencedora(id);
  }

  @Put(':id/cancelar')
  async cancelar(@Param('id') id: string): Promise<Proposta> {
    return await this.propostasService.cancelar(id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dados: { valor_total_proposta?: number }
  ): Promise<Proposta> {
    return await this.propostasService.update(id, dados);
  }

  @Put('item/:itemId')
  async updateItem(
    @Param('itemId') itemId: string,
    @Body() dados: { valor_unitario?: number; marca?: string; modelo?: string }
  ): Promise<PropostaItem> {
    return await this.propostasService.updateItem(itemId, dados);
  }
}
