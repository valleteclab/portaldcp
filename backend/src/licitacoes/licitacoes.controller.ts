import { Controller, Get, Post, Put, Delete, Body, Param, Query, ValidationPipe } from '@nestjs/common';
import { LicitacoesService } from './licitacoes.service';
import { CreateLicitacaoDto, PublicarEditalDto } from './dto/create-licitacao.dto';
import { Licitacao, FaseLicitacao } from './entities/licitacao.entity';

@Controller('licitacoes')
export class LicitacoesController {
  constructor(private readonly licitacoesService: LicitacoesService) {}

  // === CRUD ===
  @Post()
  async create(@Body(new ValidationPipe()) createDto: CreateLicitacaoDto): Promise<Licitacao> {
    return await this.licitacoesService.create(createDto);
  }

  @Get()
  async findAll(
    @Query('fase') fase?: FaseLicitacao,
    @Query('orgao_id') orgao_id?: string
  ): Promise<Licitacao[]> {
    return await this.licitacoesService.findAll({ fase, orgao_id });
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Licitacao> {
    return await this.licitacoesService.findOne(id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ skipMissingProperties: true })) updateData: Partial<CreateLicitacaoDto>
  ): Promise<Licitacao> {
    return await this.licitacoesService.update(id, updateData);
  }

  // === GESTÃO DE FASES ===
  @Put(':id/avancar-fase')
  async avancarFase(
    @Param('id') id: string,
    @Body() body: { observacao?: string }
  ): Promise<Licitacao> {
    return await this.licitacoesService.avancarFase(id, body.observacao);
  }

  @Put(':id/retroceder-fase')
  async retrocederFase(
    @Param('id') id: string,
    @Body() body: { motivo: string }
  ): Promise<Licitacao> {
    return await this.licitacoesService.retrocederFase(id, body.motivo);
  }

  @Put(':id/publicar-edital')
  async publicarEdital(
    @Param('id') id: string,
    @Body(new ValidationPipe()) dados: PublicarEditalDto
  ): Promise<Licitacao> {
    return await this.licitacoesService.publicarEdital(id, dados);
  }

  @Put(':id/iniciar-disputa')
  async iniciarDisputa(@Param('id') id: string): Promise<Licitacao> {
    return await this.licitacoesService.iniciarDisputa(id);
  }

  @Put(':id/encerrar-disputa')
  async encerrarDisputa(@Param('id') id: string): Promise<Licitacao> {
    return await this.licitacoesService.encerrarDisputa(id);
  }

  @Put(':id/homologar')
  async homologar(
    @Param('id') id: string,
    @Body() body: { valor_homologado: number }
  ): Promise<Licitacao> {
    return await this.licitacoesService.homologar(id, body.valor_homologado);
  }

  @Put(':id/suspender')
  async suspender(
    @Param('id') id: string,
    @Body() body: { motivo: string }
  ): Promise<Licitacao> {
    return await this.licitacoesService.suspender(id, body.motivo);
  }

  @Put(':id/revogar')
  async revogar(
    @Param('id') id: string,
    @Body() body: { motivo: string }
  ): Promise<Licitacao> {
    return await this.licitacoesService.revogar(id, body.motivo);
  }

  @Put(':id/anular')
  async anular(
    @Param('id') id: string,
    @Body() body: { motivo: string }
  ): Promise<Licitacao> {
    return await this.licitacoesService.anular(id, body.motivo);
  }

  @Put(':id/retomar')
  async retomar(
    @Param('id') id: string,
    @Body() body: { fase_destino?: string }
  ): Promise<Licitacao> {
    return await this.licitacoesService.retomar(id, body.fase_destino);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<{ message: string }> {
    await this.licitacoesService.delete(id);
    return { message: 'Licitação excluída com sucesso' };
  }

  // === ENDPOINTS PÚBLICOS ===
  @Get('publicas')
  async findPublicas(
    @Query('modalidade') modalidade?: string,
    @Query('orgao_id') orgao_id?: string,
    @Query('uf') uf?: string
  ): Promise<Licitacao[]> {
    return await this.licitacoesService.findPublicas({ modalidade, orgao_id, uf });
  }
}
