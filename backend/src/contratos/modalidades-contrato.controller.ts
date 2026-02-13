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
} from '@nestjs/common';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { MedicaoService } from './medicao.service';
import { AtestacaoService } from './atestacao.service';
import { LicencaControleService } from './licenca-controle.service';
import { OrdemServicoContratoService } from './ordem-servico-contrato.service';
import { StatusOrdemServico } from './entities/ordem-servico-contrato.entity';

@Controller('contratos')
@RequireModule(ModuloSistema.CONTRATOS)
export class ModalidadesContratoController {
  constructor(
    private readonly medicaoService: MedicaoService,
    private readonly atestacaoService: AtestacaoService,
    private readonly licencaService: LicencaControleService,
    private readonly osService: OrdemServicoContratoService,
  ) {}

  // ============================================================================
  // MEDIÇÃO — Consulta de OS (criação/aprovação via módulo centralizado de Requisições)
  // ============================================================================

  @Get(':contratoId/os-medicao')
  async listarOSMedicao(@Param('contratoId') contratoId: string) {
    return this.medicaoService.listarOS(contratoId);
  }

  @Get(':contratoId/os-medicao/ativa')
  async getOSAtivaMedicao(@Param('contratoId') contratoId: string) {
    return this.medicaoService.getOSAtiva(contratoId);
  }

  // ============================================================================
  // MEDIÇÃO — Etapas do Cronograma
  // ============================================================================

  @Post(':contratoId/etapas')
  async criarEtapa(
    @Param('contratoId') contratoId: string,
    @Body() dados: any,
  ) {
    return this.medicaoService.criarEtapa(contratoId, dados);
  }

  @Get(':contratoId/etapas')
  async listarEtapas(@Param('contratoId') contratoId: string) {
    return this.medicaoService.listarEtapas(contratoId);
  }

  @Put('etapas/:etapaId')
  async atualizarEtapa(
    @Param('etapaId') etapaId: string,
    @Body() dados: any,
  ) {
    return this.medicaoService.atualizarEtapa(etapaId, dados);
  }

  @Delete('etapas/:etapaId')
  async excluirEtapa(@Param('etapaId') etapaId: string) {
    return this.medicaoService.excluirEtapa(etapaId);
  }

  // ============================================================================
  // MEDIÇÃO — Boletins de Medição
  // ============================================================================

  @Post(':contratoId/medicoes')
  async criarMedicao(
    @Param('contratoId') contratoId: string,
    @Body() dados: any,
  ) {
    return this.medicaoService.criarMedicao(contratoId, dados);
  }

  @Get(':contratoId/medicoes')
  async listarMedicoes(@Param('contratoId') contratoId: string) {
    return this.medicaoService.listarMedicoes(contratoId);
  }

  @Get('medicoes/:medicaoId')
  async buscarMedicao(@Param('medicaoId') medicaoId: string) {
    return this.medicaoService.buscarMedicao(medicaoId);
  }

  @Patch('medicoes/:medicaoId/submeter')
  async submeterMedicao(
    @Param('medicaoId') medicaoId: string,
    @Body() body: {
      fornecedor_id: string;
      fornecedor_observacoes?: string;
      nota_fiscal_numero?: string;
      nota_fiscal_valor?: number;
      nota_fiscal_data?: string;
    },
  ) {
    return this.medicaoService.submeterMedicao(medicaoId, body.fornecedor_id, body);
  }

  @Patch('medicoes/:medicaoId/atestar')
  async atestarMedicao(
    @Param('medicaoId') medicaoId: string,
    @Body() body: { fiscal_id: string; fiscal_nome: string; observacoes?: string; verificado_in_loco?: boolean },
  ) {
    return this.medicaoService.atestarMedicao(medicaoId, body.fiscal_id, body.fiscal_nome, body);
  }

  @Patch('medicoes/:medicaoId/atestar-itens')
  async atestarItensMedicao(
    @Param('medicaoId') medicaoId: string,
    @Body() body: {
      fiscal_id: string;
      fiscal_nome: string;
      itens: Array<{ item_id: string; observacoes?: string }>;
      observacoes_gerais?: string;
      verificado_in_loco?: boolean;
    },
  ) {
    return this.medicaoService.atestarItensMedicao(medicaoId, body.fiscal_id, body.fiscal_nome, {
      itens: body.itens,
      observacoes_gerais: body.observacoes_gerais,
      verificado_in_loco: body.verificado_in_loco,
    });
  }

  @Patch('medicoes/:medicaoId/devolver')
  async devolverMedicao(
    @Param('medicaoId') medicaoId: string,
    @Body() body: { fiscal_id: string; fiscal_nome: string; motivo: string },
  ) {
    return this.medicaoService.devolverMedicao(medicaoId, body.fiscal_id, body.fiscal_nome, body.motivo);
  }

  @Delete('medicoes/:medicaoId')
  async excluirMedicao(
    @Param('medicaoId') medicaoId: string,
    @Query('podeExcluirMedicao') podeExcluirMedicao?: string,
  ) {
    return this.medicaoService.excluirMedicao(medicaoId, undefined, {
      isAdmin: podeExcluirMedicao === 'true',
    });
  }

  @Patch('medicoes/:medicaoId/enviar-aprovacao')
  async enviarMedicaoParaAprovacao(
    @Param('medicaoId') medicaoId: string,
    @Body() body: { fiscal_id: string; fiscal_nome: string },
  ) {
    return this.medicaoService.enviarParaAprovacao(medicaoId, body.fiscal_id, body.fiscal_nome);
  }

  @Patch('medicoes/:medicaoId/aprovar')
  async aprovarMedicao(
    @Param('medicaoId') medicaoId: string,
    @Body() body: { aprovador_id: string; aprovador_nome: string },
  ) {
    return this.medicaoService.aprovarMedicao(medicaoId, body.aprovador_id, body.aprovador_nome);
  }

  @Patch('medicoes/:medicaoId/rejeitar')
  async rejeitarMedicao(
    @Param('medicaoId') medicaoId: string,
    @Body() body: { aprovador_id: string; aprovador_nome: string; observacao: string },
  ) {
    return this.medicaoService.rejeitarMedicao(medicaoId, body.aprovador_id, body.aprovador_nome, body.observacao);
  }

  @Get('medicoes/pendentes-ateste')
  async listarPendentesAteste(@Query('orgaoId') orgaoId: string) {
    return this.medicaoService.listarPendentesAteste(orgaoId);
  }

  @Get('medicoes/pendentes-aprovacao')
  async listarPendentesAprovacao(@Query('orgaoId') orgaoId: string) {
    return this.medicaoService.listarPendentesAprovacao(orgaoId);
  }

  @Get(':contratoId/medicoes/resumo')
  async resumoMedicoes(@Param('contratoId') contratoId: string) {
    return this.medicaoService.resumoMedicoes(contratoId);
  }

  // ============================================================================
  // ATESTAÇÃO MENSAL (Serviços Continuados)
  // ============================================================================

  @Post(':contratoId/atestacoes')
  async criarAtestacao(
    @Param('contratoId') contratoId: string,
    @Body() dados: any,
  ) {
    return this.atestacaoService.criarAtestacao(contratoId, dados);
  }

  @Get(':contratoId/atestacoes')
  async listarAtestacoes(@Param('contratoId') contratoId: string) {
    return this.atestacaoService.listarAtestacoes(contratoId);
  }

  @Get('atestacoes/:atestacaoId')
  async buscarAtestacao(@Param('atestacaoId') atestacaoId: string) {
    return this.atestacaoService.buscarAtestacao(atestacaoId);
  }

  @Patch('atestacoes/:atestacaoId/atestar')
  async atestar(
    @Param('atestacaoId') atestacaoId: string,
    @Body() dados: any,
  ) {
    return this.atestacaoService.atestar(atestacaoId, dados);
  }

  @Patch('atestacoes/:atestacaoId/rejeitar')
  async rejeitarAtestacao(
    @Param('atestacaoId') atestacaoId: string,
    @Body() dados: { fiscal_id: string; fiscal_nome: string; observacoes: string },
  ) {
    return this.atestacaoService.rejeitarAtestacao(atestacaoId, dados);
  }

  @Get(':contratoId/atestacoes/resumo')
  async resumoAtestacoes(@Param('contratoId') contratoId: string) {
    return this.atestacaoService.resumoAtestacoes(contratoId);
  }

  // ============================================================================
  // LICENÇAS (Software/SaaS)
  // ============================================================================

  @Post(':contratoId/licencas')
  async criarLicenca(
    @Param('contratoId') contratoId: string,
    @Body() dados: any,
  ) {
    return this.licencaService.criarLicenca(contratoId, dados);
  }

  @Get(':contratoId/licencas')
  async listarLicencas(@Param('contratoId') contratoId: string) {
    return this.licencaService.listarLicencas(contratoId);
  }

  @Get('licencas/:licencaId')
  async buscarLicenca(@Param('licencaId') licencaId: string) {
    return this.licencaService.buscarLicenca(licencaId);
  }

  @Put('licencas/:licencaId')
  async atualizarLicenca(
    @Param('licencaId') licencaId: string,
    @Body() dados: any,
  ) {
    return this.licencaService.atualizarLicenca(licencaId, dados);
  }

  @Delete('licencas/:licencaId')
  async excluirLicenca(@Param('licencaId') licencaId: string) {
    return this.licencaService.excluirLicenca(licencaId);
  }

  @Patch('licencas/:licencaId/ativar')
  async ativarLicencas(
    @Param('licencaId') licencaId: string,
    @Body('quantidade') quantidade: number,
  ) {
    return this.licencaService.ativarLicencas(licencaId, quantidade);
  }

  @Patch('licencas/:licencaId/desativar')
  async desativarLicencas(
    @Param('licencaId') licencaId: string,
    @Body('quantidade') quantidade: number,
  ) {
    return this.licencaService.desativarLicencas(licencaId, quantidade);
  }

  @Patch('licencas/:licencaId/suspender')
  async suspenderLicenca(@Param('licencaId') licencaId: string) {
    return this.licencaService.suspenderLicenca(licencaId);
  }

  @Patch('licencas/:licencaId/reativar')
  async reativarLicenca(@Param('licencaId') licencaId: string) {
    return this.licencaService.reativarLicenca(licencaId);
  }

  @Get(':contratoId/licencas/resumo')
  async resumoLicencas(@Param('contratoId') contratoId: string) {
    return this.licencaService.resumoLicencas(contratoId);
  }

  @Post(':contratoId/licencas/verificar-expiracoes')
  async verificarExpiracoes(@Param('contratoId') contratoId: string) {
    return this.licencaService.verificarExpiracoes(contratoId);
  }

  // ============================================================================
  // ORDENS DE SERVIÇO (Demanda)
  // ============================================================================

  // Banco de Métricas
  @Post(':contratoId/banco-metricas')
  async criarBancoMetricas(
    @Param('contratoId') contratoId: string,
    @Body() dados: any,
  ) {
    return this.osService.criarBancoMetricas(contratoId, dados);
  }

  @Get(':contratoId/banco-metricas')
  async listarBancoMetricas(@Param('contratoId') contratoId: string) {
    return this.osService.listarBancoMetricas(contratoId);
  }

  @Put('banco-metricas/:bancoId')
  async atualizarBancoMetricas(
    @Param('bancoId') bancoId: string,
    @Body() dados: any,
  ) {
    return this.osService.atualizarBancoMetricas(bancoId, dados);
  }

  // Ordens de Serviço
  @Post(':contratoId/ordens-servico')
  async criarOS(
    @Param('contratoId') contratoId: string,
    @Body() dados: any,
  ) {
    return this.osService.criarOS(contratoId, dados);
  }

  @Get(':contratoId/ordens-servico')
  async listarOS(
    @Param('contratoId') contratoId: string,
    @Query('status') status?: StatusOrdemServico,
  ) {
    return this.osService.listarOS(contratoId, status);
  }

  @Get('ordens-servico/:osId')
  async buscarOS(@Param('osId') osId: string) {
    return this.osService.buscarOS(osId);
  }

  @Put('ordens-servico/:osId')
  async atualizarOS(
    @Param('osId') osId: string,
    @Body() dados: any,
  ) {
    return this.osService.atualizarOS(osId, dados);
  }

  @Patch('ordens-servico/:osId/iniciar')
  async iniciarExecucao(@Param('osId') osId: string) {
    return this.osService.iniciarExecucao(osId);
  }

  @Patch('ordens-servico/:osId/entregar')
  async registrarEntrega(
    @Param('osId') osId: string,
    @Body('data_entrega') dataEntrega?: string,
  ) {
    return this.osService.registrarEntrega(osId, dataEntrega);
  }

  @Patch('ordens-servico/:osId/aceitar')
  async aceitarOS(
    @Param('osId') osId: string,
    @Body() dados: any,
  ) {
    return this.osService.aceitarOS(osId, dados);
  }

  @Patch('ordens-servico/:osId/rejeitar')
  async rejeitarOS(
    @Param('osId') osId: string,
    @Body() dados: any,
  ) {
    return this.osService.rejeitarOS(osId, dados);
  }

  @Patch('ordens-servico/:osId/cancelar')
  async cancelarOS(
    @Param('osId') osId: string,
    @Body('observacao') observacao: string,
  ) {
    return this.osService.cancelarOS(osId, observacao);
  }

  @Get(':contratoId/ordens-servico/resumo')
  async resumoOS(@Param('contratoId') contratoId: string) {
    return this.osService.resumoOS(contratoId);
  }
}
