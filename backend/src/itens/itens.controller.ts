import { Controller, Get, Post, Put, Delete, Body, Param, ValidationPipe } from '@nestjs/common';
import { ItensService } from './itens.service';
import { CreateItemDto, UpdateItemDto, AdjudicarItemDto } from './dto/create-item.dto';
import { ItemLicitacao } from './entities/item-licitacao.entity';

@Controller('itens')
export class ItensController {
  constructor(private readonly itensService: ItensService) {}

  @Post()
  async create(@Body(new ValidationPipe()) createDto: CreateItemDto): Promise<ItemLicitacao> {
    return await this.itensService.create(createDto);
  }

  @Post('licitacao/:licitacaoId/batch')
  async createBatch(
    @Param('licitacaoId') licitacaoId: string,
    @Body() itens: CreateItemDto[]
  ): Promise<ItemLicitacao[]> {
    return await this.itensService.createBatch(licitacaoId, itens);
  }

  @Get('licitacao/:licitacaoId')
  async findByLicitacao(@Param('licitacaoId') licitacaoId: string): Promise<ItemLicitacao[]> {
    return await this.itensService.findByLicitacao(licitacaoId);
  }

  @Get('licitacao/:licitacaoId/resumo')
  async getResumo(@Param('licitacaoId') licitacaoId: string) {
    return await this.itensService.getResumoLicitacao(licitacaoId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<ItemLicitacao> {
    return await this.itensService.findOne(id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ skipMissingProperties: true })) updateDto: UpdateItemDto
  ): Promise<ItemLicitacao> {
    return await this.itensService.update(id, updateDto);
  }

  @Put(':id/cancelar')
  async cancelar(
    @Param('id') id: string,
    @Body() body: { motivo: string }
  ): Promise<ItemLicitacao> {
    return await this.itensService.cancelar(id, body.motivo);
  }

  @Put(':id/deserto')
  async marcarDeserto(@Param('id') id: string): Promise<ItemLicitacao> {
    return await this.itensService.marcarDeserto(id);
  }

  @Put(':id/fracassado')
  async marcarFracassado(
    @Param('id') id: string,
    @Body() body: { motivo: string }
  ): Promise<ItemLicitacao> {
    return await this.itensService.marcarFracassado(id, body.motivo);
  }

  @Put(':id/adjudicar')
  async adjudicar(
    @Param('id') id: string,
    @Body(new ValidationPipe()) dados: AdjudicarItemDto
  ): Promise<ItemLicitacao> {
    return await this.itensService.adjudicar(id, dados);
  }

  @Put(':id/homologar')
  async homologar(@Param('id') id: string): Promise<ItemLicitacao> {
    return await this.itensService.homologar(id);
  }
}
