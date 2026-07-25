import { Controller, Get, Post, Put, Delete, Body, Param, Query, ValidationPipe } from '@nestjs/common';
import { LicitacoesService } from './licitacoes.service';
import { LicitacoesSchedulerService } from './licitacoes-scheduler.service';
import { CreateLicitacaoDto, PublicarEditalDto } from './dto/create-licitacao.dto';
import { CreateFromDemandaDto } from './dto/create-from-demanda.dto';
import { Licitacao, FaseLicitacao } from './entities/licitacao.entity';
import { Public } from '../auth/public.decorator';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';

@Controller('licitacoes')
@RequireModule(ModuloSistema.LICITACOES)
export class LicitacoesController {
  constructor(
    private readonly licitacoesService: LicitacoesService,
    private readonly schedulerService: LicitacoesSchedulerService,
  ) {}

  // === CRUD ===
  @Post()
  async create(@Body(new ValidationPipe()) createDto: CreateLicitacaoDto): Promise<Licitacao> {
    return await this.licitacoesService.create(createDto);
  }

  @Post('a-partir-de-demanda')
  async createFromDemanda(@Body(new ValidationPipe()) dto: CreateFromDemandaDto): Promise<Licitacao> {
    return this.licitacoesService.criarAPartirDeDemanda(dto);
  }

  @Public()
  @Get()
  async findAll(
    @Query('fase') fase?: FaseLicitacao | 'HOMOLOGADA',
    @Query('orgao_id') orgao_id?: string,
    @Query('orgaoId') orgaoId?: string
  ): Promise<Licitacao[]> {
    const faseNormalizada =
      fase === 'HOMOLOGADA' ? FaseLicitacao.HOMOLOGACAO : fase;
    return await this.licitacoesService.findAll({ fase: faseNormalizada, orgao_id: orgao_id || orgaoId });
  }

  @Public()
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

  /** Cockpit: visão agregada do processo inteiro (demanda/PCA → docs → seleção → contratos) */
  @Get(':id/processo-completo')
  async processoCompleto(@Param('id') id: string): Promise<any> {
    return await this.licitacoesService.processoCompleto(id);
  }

  /** Dispensa eletrônica: julga propostas por menor preço por item e adjudica (art. 75 §3º) */
  @Post(':id/julgar-dispensa')
  async julgarDispensa(@Param('id') id: string): Promise<any> {
    return await this.licitacoesService.julgarDispensa(id);
  }

  /** Dispensa: abre a fase de lances (opcional, modelo IN SEGES 67/2021) */
  @Post(':id/dispensa/abrir-lances')
  async abrirLancesDispensa(
    @Param('id') id: string,
    @Body() body: { duracao_minutos?: number },
  ): Promise<any> {
    return await this.licitacoesService.abrirLancesDispensa(id, body?.duracao_minutos ?? 360);
  }

  /** Dispensa: fornecedor registra lance (menor que o próprio valor atual) */
  @Post(':id/dispensa/lances')
  async registrarLanceDispensa(
    @Param('id') id: string,
    @Body() body: { item_licitacao_id: string; fornecedor_id: string; valor_unitario: number },
  ): Promise<any> {
    return await this.licitacoesService.registrarLanceDispensa(id, body);
  }

  /** Dispensa: painel anônimo da fase de lances (menor valor por item) */
  @Public()
  @Get(':id/dispensa/lances/painel')
  async painelLancesDispensa(
    @Param('id') id: string,
    @Query('fornecedorId') fornecedorId?: string,
  ): Promise<any> {
    return await this.licitacoesService.painelLancesDispensa(id, fornecedorId);
  }

  /** Dispensa: chat registrado nos autos (autoria anônima durante os lances) */
  @Public()
  @Get(':id/dispensa/mensagens')
  async listarMensagensDispensa(@Param('id') id: string): Promise<any[]> {
    return await this.licitacoesService.listarMensagensDispensa(id);
  }

  /** Dispensa: envia mensagem no chat (órgão ou fornecedor com proposta válida) */
  @Post(':id/dispensa/mensagens')
  async enviarMensagemDispensa(
    @Param('id') id: string,
    @Body()
    body: {
      autor_tipo: 'ORGAO' | 'FORNECEDOR';
      fornecedor_id?: string;
      autor_nome?: string;
      mensagem: string;
    },
  ): Promise<any> {
    return await this.licitacoesService.enviarMensagemDispensa(id, body);
  }

  /** Seleção externa: registra vencedores/valores de disputa realizada fora do sistema */
  @Post(':id/resultado-externo')
  async registrarResultadoExterno(
    @Param('id') id: string,
    @Body()
    body: {
      plataforma_externa?: string;
      numero_processo_externo?: string;
      url_externa?: string;
      itens: Array<{ item_id: string; fornecedor_id: string; valor_unitario: number }>;
    },
  ): Promise<any> {
    return await this.licitacoesService.registrarResultadoExterno(id, body);
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

  /**
   * Atualiza a fase da licitação baseado nas datas do cronograma
   * Útil após editar o cronograma ou para forçar atualização
   */
  @Put(':id/atualizar-fase')
  async atualizarFase(@Param('id') id: string): Promise<Licitacao> {
    return await this.schedulerService.atualizarFaseLicitacao(id);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<{ message: string }> {
    await this.licitacoesService.delete(id);
    return { message: 'Licitação excluída com sucesso' };
  }

  // === ENDPOINTS PÚBLICOS ===
  @Public()
  @Get('publicas')
  async findPublicas(
    @Query('modalidade') modalidade?: string,
    @Query('orgao_id') orgao_id?: string,
    @Query('uf') uf?: string
  ): Promise<Licitacao[]> {
    return await this.licitacoesService.findPublicas({ modalidade, orgao_id, uf });
  }
}
