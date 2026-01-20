import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  Query,
  Req,
  ValidationPipe,
  ParseUUIDPipe,
  Logger,
} from '@nestjs/common';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { JwtPayload, UserType } from '../auth/auth.service';
import { RequisicaoService } from './requisicao.service';
import { ItemContratoService } from './item-contrato.service';
import { OrdemFornecimentoService } from './ordem-fornecimento.service';
import { RecebimentoService } from './recebimento.service';
import { GerarOrdemDto, CriarRecebimentoDto, AceitarRecebimentoDto } from './dto/ordem-fornecimento.dto';
import { 
  CriarRequisicaoDto, 
  AtualizarRequisicaoDto,
  AutorizarRequisicaoDto,
  NegarRequisicaoDto,
} from './dto/criar-requisicao.dto';
import { CriarItemContratoDto, AtualizarItemContratoDto } from './dto/criar-item-contrato.dto';
import { StatusRequisicao } from './entities/requisicao.entity';
import { StatusOrdemFornecimento } from './entities/ordem-fornecimento.entity';
import { StatusRecebimento } from './entities/recebimento.entity';

@Controller('almoxarifado')
@RequireModule(ModuloSistema.ALMOXARIFADO)
export class AlmoxarifadoController {
  private readonly logger = new Logger(AlmoxarifadoController.name);

  constructor(
    private readonly requisicaoService: RequisicaoService,
    private readonly itemContratoService: ItemContratoService,
    private readonly ordemService: OrdemFornecimentoService,
    private readonly recebimentoService: RecebimentoService,
  ) {}

  // ============================================================================
  // ITENS DO CONTRATO
  // ============================================================================

  @Get('contratos/:contratoId/itens')
  async listarItensContrato(@Param('contratoId', ParseUUIDPipe) contratoId: string) {
    return this.itemContratoService.findByContrato(contratoId);
  }

  @Get('contratos/:contratoId/itens/disponiveis')
  async listarItensComSaldo(@Param('contratoId', ParseUUIDPipe) contratoId: string) {
    return this.itemContratoService.findComSaldoDisponivel(contratoId);
  }

  @Get('contratos/:contratoId/saldos')
  async getResumoSaldos(@Param('contratoId', ParseUUIDPipe) contratoId: string) {
    return this.itemContratoService.getResumoSaldos(contratoId);
  }

  @Post('contratos/:contratoId/itens')
  async criarItemContrato(
    @Param('contratoId', ParseUUIDPipe) contratoId: string,
    @Body(new ValidationPipe()) dto: CriarItemContratoDto,
  ) {
    return this.itemContratoService.criar({ ...dto, contrato_id: contratoId });
  }

  @Post('contratos/:contratoId/itens/lote')
  async criarItensEmLote(
    @Param('contratoId', ParseUUIDPipe) contratoId: string,
    @Body(new ValidationPipe()) itens: CriarItemContratoDto[],
  ) {
    return this.itemContratoService.criarEmLote(contratoId, itens);
  }

  @Get('itens-contrato/:id')
  async getItemContrato(@Param('id', ParseUUIDPipe) id: string) {
    return this.itemContratoService.findOne(id);
  }

  @Put('itens-contrato/:id')
  async atualizarItemContrato(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationPipe()) dto: AtualizarItemContratoDto,
  ) {
    return this.itemContratoService.atualizar(id, dto);
  }

  @Delete('itens-contrato/:id')
  async removerItemContrato(@Param('id', ParseUUIDPipe) id: string) {
    await this.itemContratoService.remover(id);
    return { message: 'Item removido com sucesso' };
  }

  // ============================================================================
  // REQUISIÇÕES
  // ============================================================================

  @Get('requisicoes')
  async listarRequisicoes(
    @Req() request: { user: JwtPayload },
    @Query('status') status?: StatusRequisicao,
    @Query('contratoId') contratoId?: string,
    @Query('setor') setor?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.requisicaoService.findAll({
      orgaoId,
      status,
      contratoId,
      setor,
    });
  }

  @Get('requisicoes/pendentes')
  async listarPendentesAutorizacao(@Req() request: { user: JwtPayload }) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.requisicaoService.findPendentesAutorizacao(orgaoId);
  }

  @Get('requisicoes/estatisticas')
  async getEstatisticasRequisicoes(@Req() request: { user: JwtPayload }) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.requisicaoService.getEstatisticas(orgaoId);
  }

  @Get('requisicoes/:id')
  async getRequisicao(@Param('id', ParseUUIDPipe) id: string) {
    return this.requisicaoService.findOne(id);
  }

  @Post('requisicoes')
  async criarRequisicao(
    @Req() request: { user: JwtPayload },
    @Body(new ValidationPipe()) dto: CriarRequisicaoDto,
  ) {
    const user = request.user;
    const orgaoId = this.getOrgaoId(user);
    
    return this.requisicaoService.criar(
      orgaoId,
      dto,
      user.sub,
      user.email || 'Usuário',
      user.email,
    );
  }

  @Put('requisicoes/:id')
  async atualizarRequisicao(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationPipe()) dto: AtualizarRequisicaoDto,
  ) {
    return this.requisicaoService.atualizar(id, dto);
  }

  @Post('requisicoes/:id/enviar')
  async enviarParaAutorizacao(@Param('id', ParseUUIDPipe) id: string) {
    return this.requisicaoService.enviarParaAutorizacao(id);
  }

  @Post('requisicoes/:id/autorizar')
  async autorizarRequisicao(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @Body(new ValidationPipe()) dto: AutorizarRequisicaoDto,
  ) {
    const user = request.user;
    return this.requisicaoService.autorizar(
      id,
      dto,
      user.sub,
      user.email || 'Autorizador',
    );
  }

  @Post('requisicoes/:id/negar')
  async negarRequisicao(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @Body(new ValidationPipe()) dto: NegarRequisicaoDto,
  ) {
    const user = request.user;
    return this.requisicaoService.negar(
      id,
      dto,
      user.sub,
      user.email || 'Autorizador',
    );
  }

  @Post('requisicoes/:id/cancelar')
  async cancelarRequisicao(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('motivo') motivo: string,
  ) {
    return this.requisicaoService.cancelar(id, motivo || 'Cancelado pelo usuário');
  }

  // ============================================================================
  // ORDENS DE FORNECIMENTO
  // ============================================================================

  @Get('ordens')
  async listarOrdens(
    @Req() request: { user: JwtPayload },
    @Query('status') status?: StatusOrdemFornecimento,
    @Query('contratoId') contratoId?: string,
    @Query('fornecedorId') fornecedorId?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.ordemService.findAll({
      orgaoId,
      status,
      contratoId,
      fornecedorId,
    });
  }

  @Get('ordens/pendentes-envio')
  async listarPendentesEnvio(@Req() request: { user: JwtPayload }) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.ordemService.findPendentesEnvio(orgaoId);
  }

  @Get('ordens/em-andamento')
  async listarEmAndamento(@Req() request: { user: JwtPayload }) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.ordemService.findEmAndamento(orgaoId);
  }

  @Get('ordens/estatisticas')
  async getEstatisticasOrdens(@Req() request: { user: JwtPayload }) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.ordemService.getEstatisticas(orgaoId);
  }

  @Get('ordens/:id')
  async getOrdem(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordemService.findOne(id);
  }

  @Post('ordens/gerar')
  async gerarOrdem(
    @Req() request: { user: JwtPayload },
    @Body(new ValidationPipe()) dto: GerarOrdemDto,
  ) {
    const user = request.user;
    return this.ordemService.gerarOrdem(
      dto,
      user.sub,
      user.email || 'Usuário',
    );
  }

  @Post('ordens/:id/enviar')
  async enviarOrdem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('email_fornecedor') emailFornecedor?: string,
    @Body('observacoes') observacoes?: string,
  ) {
    return this.ordemService.enviarOrdem(id, emailFornecedor, observacoes);
  }

  @Post('ordens/:id/cancelar')
  async cancelarOrdem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('motivo') motivo: string,
  ) {
    return this.ordemService.cancelarOrdem(id, motivo || 'Cancelada pelo usuário');
  }

  // ============================================================================
  // RECEBIMENTOS
  // ============================================================================

  @Get('recebimentos')
  async listarRecebimentos(
    @Req() request: { user: JwtPayload },
    @Query('status') status?: StatusRecebimento,
    @Query('ordemId') ordemId?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.recebimentoService.findAll({
      orgaoId,
      status,
      ordemId,
    });
  }

  @Get('recebimentos/pendentes-conferencia')
  async listarPendentesConferencia(@Req() request: { user: JwtPayload }) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.recebimentoService.findPendentesConferencia(orgaoId);
  }

  @Get('recebimentos/pendentes-aceite')
  async listarPendentesAceite(@Req() request: { user: JwtPayload }) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.recebimentoService.findPendentesAceite(orgaoId);
  }

  @Get('recebimentos/:id')
  async getRecebimento(@Param('id', ParseUUIDPipe) id: string) {
    return this.recebimentoService.findOne(id);
  }

  @Post('recebimentos')
  async criarRecebimento(
    @Req() request: { user: JwtPayload },
    @Body(new ValidationPipe()) dto: CriarRecebimentoDto,
  ) {
    const user = request.user;
    const orgaoId = this.getOrgaoId(user);
    return this.recebimentoService.criar(
      orgaoId,
      dto,
      user.sub,
      user.email || 'Usuário',
    );
  }

  @Post('recebimentos/:id/conferir')
  async conferirRecebimento(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const user = request.user;
    return this.recebimentoService.conferir(
      id,
      user.sub,
      user.email || 'Conferente',
    );
  }

  @Post('recebimentos/:id/aceitar')
  async aceitarRecebimento(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @Body(new ValidationPipe()) dto: AceitarRecebimentoDto,
  ) {
    const user = request.user;
    return this.recebimentoService.aceitar(
      id,
      dto,
      user.sub,
      user.email || 'Fiscal',
    );
  }

  @Post('recebimentos/:id/rejeitar')
  async rejeitarRecebimento(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('motivo') motivo: string,
  ) {
    return this.recebimentoService.rejeitar(id, motivo);
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private getOrgaoId(user: JwtPayload): string {
    if (user.type === UserType.ORGAO) {
      return user.sub;
    }
    const orgaoId = user.orgaoId || (user as any).orgao_id;
    if (orgaoId) {
      return orgaoId;
    }
    throw new Error('Órgão não identificado');
  }
}
