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
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtPayload, UserType } from '../auth/auth.service';
import { MedicaoService } from './medicao.service';
import { AtestacaoService } from './atestacao.service';
import { LicencaControleService } from './licenca-controle.service';
import { OrdemServicoContratoService } from './ordem-servico-contrato.service';
import { StatusOrdemServico } from './entities/ordem-servico-contrato.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Contrato, ModalidadeExecucao } from './entities/contrato.entity';

@Controller('contratos')
@RequireModule(ModuloSistema.CONTRATOS)
export class ModalidadesContratoController {
  constructor(
    private readonly medicaoService: MedicaoService,
    private readonly atestacaoService: AtestacaoService,
    private readonly licencaService: LicencaControleService,
    private readonly osService: OrdemServicoContratoService,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    @InjectRepository(Contrato)
    private readonly contratoRepository: Repository<Contrato>,
  ) {}

  /**
   * Extrai o orgaoId do JWT de forma segura.
   * Prioriza o token JWT, usa query param apenas como fallback para admin.
   */
  private getOrgaoId(user: JwtPayload, orgaoIdParam?: string): string {
    if (user.type === UserType.ORGAO) {
      return user.sub;
    }
    if (user.type === UserType.ADMIN && orgaoIdParam) {
      return orgaoIdParam;
    }
    const orgaoId = user.orgaoId || (user as any).orgao_id;
    if (orgaoId) {
      return orgaoId;
    }
    throw new ForbiddenException('Não foi possível identificar o órgão do usuário');
  }

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
  // MEDIÇÃO — Rotas estáticas DEVEM vir ANTES das rotas com :parametro
  //           para evitar que NestJS interprete "resumo-fiscal" como :medicaoId
  // ============================================================================

  @Get('medicoes/pendentes-ateste')
  async listarPendentesAteste(
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user, orgaoIdParam);
    return this.medicaoService.listarPendentesAteste(orgaoId);
  }

  @Get('medicoes/devolvidas')
  async listarDevolvidas(
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user, orgaoIdParam);
    return this.medicaoService.listarDevolvidas(orgaoId);
  }

  @Get('medicoes/pendentes-aprovacao')
  async listarPendentesAprovacao(
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user, orgaoIdParam);
    return this.medicaoService.listarPendentesAprovacao(orgaoId);
  }

  /**
   * Resumo de medições por contrato para o painel do fiscal.
   * Se mes=YYYY-MM for informado, inclui enviou_mes por contrato.
   */
  @Get('medicoes/resumo-fiscal')
  async resumoFiscal(
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
    @Query('mes') mes?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user, orgaoIdParam);
    if (mes?.match(/^\d{4}-\d{2}$/)) {
      return this.medicaoService.resumoFiscalPorContratoComMes(orgaoId, mes);
    }
    return this.medicaoService.resumoFiscalPorContrato(orgaoId);
  }

  // ============================================================================
  // MEDIÇÃO — Rotas parametrizadas (medicoes/:medicaoId e :contratoId/medicoes)
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

  @Get(':contratoId/medicoes/resumo')
  async resumoMedicoes(@Param('contratoId') contratoId: string) {
    return this.medicaoService.resumoMedicoes(contratoId);
  }

  /**
   * Solicita ao fornecedor o envio da medição do mês.
   * Validação multiorgão: contrato deve pertencer ao órgão do usuário.
   */
  @Post(':contratoId/medicoes/solicitar')
  async solicitarMedicao(
    @Param('contratoId') contratoId: string,
    @Body() body: { mes_referencia: string; mensagem?: string; enviar_whatsapp?: boolean; telefone_whatsapp?: string },
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    const contrato = await this.contratoRepository.findOne({ where: { id: contratoId } });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    if (contrato.orgao_id !== orgaoId) {
      throw new ForbiddenException('Você não tem permissão para acessar este contrato');
    }
    if (contrato.modalidade_execucao !== ModalidadeExecucao.MEDICAO) {
      throw new BadRequestException('Contrato não é da modalidade MEDICAO');
    }
    if (!body.mes_referencia?.trim()) {
      throw new BadRequestException('mes_referencia é obrigatório (formato YYYY-MM)');
    }

    const usuario = await this.usuarioRepository.findOne({ where: { id: request.user.sub } });
    const fiscalNome = usuario?.nome || 'Fiscal';

    return this.medicaoService.solicitarMedicao(
      contratoId,
      body.mes_referencia.trim(),
      fiscalNome,
      request.user.sub,
      body.mensagem,
      body.enviar_whatsapp,
      body.telefone_whatsapp,
    );
  }

  /**
   * Solicita medição em lote para múltiplos contratos de uma vez.
   */
  @Post('medicoes/solicitar-lote')
  async solicitarMedicaoLote(
    @Body() body: { contrato_ids: string[]; mes_referencia: string; mensagem?: string; enviar_whatsapp?: boolean; telefone_overrides?: Record<string, string> },
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    if (!body.contrato_ids || body.contrato_ids.length === 0) {
      throw new BadRequestException('Selecione pelo menos um contrato');
    }
    if (!body.mes_referencia?.trim()) {
      throw new BadRequestException('mes_referencia é obrigatório (formato YYYY-MM)');
    }

    const usuario = await this.usuarioRepository.findOne({ where: { id: request.user.sub } });
    const fiscalNome = usuario?.nome || 'Fiscal';

    const resultados: { contrato_id: string; numero_contrato?: string; fornecedor_nome?: string; sucesso: boolean; erro?: string; whatsapp_tentado?: boolean; whatsapp_telefone?: string | null; whatsapp_sem_telefone?: boolean }[] = [];

    for (const contratoId of body.contrato_ids) {
      try {
        const contrato = await this.contratoRepository.findOne({ where: { id: contratoId }, relations: ['fornecedor'] });
        if (!contrato) {
          resultados.push({ contrato_id: contratoId, sucesso: false, erro: 'Contrato não encontrado' });
          continue;
        }
        if (contrato.orgao_id !== orgaoId) {
          resultados.push({ contrato_id: contratoId, numero_contrato: contrato.numero_contrato, sucesso: false, erro: 'Sem permissão' });
          continue;
        }
        if (contrato.modalidade_execucao !== ModalidadeExecucao.MEDICAO) {
          resultados.push({ contrato_id: contratoId, numero_contrato: contrato.numero_contrato, sucesso: false, erro: 'Não é modalidade medição' });
          continue;
        }
        const telefoneOverride = body.telefone_overrides?.[contratoId];
        const resultado = await this.medicaoService.solicitarMedicao(
          contratoId,
          body.mes_referencia.trim(),
          fiscalNome,
          request.user.sub,
          body.mensagem,
          body.enviar_whatsapp,
          telefoneOverride,
        );
        const semTelefone = body.enviar_whatsapp && !resultado.whatsapp_telefone;
        resultados.push({
          contrato_id: contratoId,
          numero_contrato: contrato.numero_contrato,
          fornecedor_nome: contrato.fornecedor_razao_social,
          sucesso: true,
          whatsapp_tentado: resultado.whatsapp_tentado,
          whatsapp_telefone: resultado.whatsapp_telefone,
          whatsapp_sem_telefone: semTelefone,
        });
      } catch (e) {
        resultados.push({
          contrato_id: contratoId,
          sucesso: false,
          erro: e instanceof Error ? e.message : 'Erro desconhecido',
        });
      }
    }

    const enviados = resultados.filter(r => r.sucesso).length;
    const erros = resultados.filter(r => !r.sucesso).length;
    return {
      message: `Solicitações enviadas: ${enviados} sucesso, ${erros} erro(s)`,
      total: body.contrato_ids.length,
      enviados,
      erros,
      resultados,
    };
  }

  /**
   * Histórico de solicitações de medição enviadas pelo órgão.
   */
  @Get('medicoes/solicitacoes-enviadas')
  async listarSolicitacoesEnviadas(
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
    @Query('contratoId') contratoId?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user, orgaoIdParam);
    return this.medicaoService.listarSolicitacoesEnviadas(orgaoId, contratoId);
  }

  // ============================================================================
  // DISCRIMINAÇÃO DE DESPESAS — Órgão (fiscal/gestor)
  // ============================================================================

  /**
   * Lista discriminações de despesa de uma medição.
   * GET /api/contratos/medicoes/:medicaoId/discriminacoes
   */
  @Get('medicoes/:medicaoId/discriminacoes')
  async listarDiscriminacoes(
    @Param('medicaoId') medicaoId: string,
  ) {
    return this.medicaoService.listarDiscriminacoes(medicaoId);
  }

  /**
   * Fiscal corrige um item de discriminação.
   * PATCH /api/contratos/medicoes/:medicaoId/discriminacoes/:discriminacaoId
   */
  @Patch('medicoes/:medicaoId/discriminacoes/:discriminacaoId')
  async corrigirDiscriminacao(
    @Param('medicaoId') medicaoId: string,
    @Param('discriminacaoId') discriminacaoId: string,
    @Body() body: { descricao?: string; valor?: number; percentual?: number; motivo_correcao: string },
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    const usuario = await this.usuarioRepository.findOne({ where: { id: request.user.sub } });
    const fiscalNome = usuario?.nome || 'Fiscal';
    return this.medicaoService.corrigirDiscriminacao(
      medicaoId,
      discriminacaoId,
      body,
      request.user.sub,
      fiscalNome,
      orgaoId,
    );
  }

  /**
   * Fiscal substitui todas as discriminações (correção em massa).
   * PUT /api/contratos/medicoes/:medicaoId/discriminacoes
   */
  @Put('medicoes/:medicaoId/discriminacoes')
  async corrigirTodasDiscriminacoes(
    @Param('medicaoId') medicaoId: string,
    @Body() body: {
      itens: { descricao: string; valor: number; percentual: number }[];
      motivo_correcao: string;
    },
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    const usuario = await this.usuarioRepository.findOne({ where: { id: request.user.sub } });
    const fiscalNome = usuario?.nome || 'Fiscal';
    return this.medicaoService.corrigirTodasDiscriminacoes(
      medicaoId,
      body.itens || [],
      body.motivo_correcao,
      request.user.sub,
      fiscalNome,
      orgaoId,
    );
  }

  // ============================================================================
  // EXECUÇÃO FISCAL/FINANCEIRA (auto-calculada)
  // ============================================================================

  /**
   * Retorna o resumo de execução fiscal/financeira por item do contrato.
   * GET /api/contratos/:contratoId/execucao-financeira?medicaoId=xxx
   */
  @Get(':contratoId/execucao-financeira')
  async execucaoFinanceira(
    @Param('contratoId') contratoId: string,
    @Query('medicaoId') medicaoId: string,
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.medicaoService.calcularExecucaoFinanceira(contratoId, orgaoId, medicaoId || undefined);
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
      itens_cancelar_ateste?: string[];
      observacoes_gerais?: string;
      verificado_in_loco?: boolean;
      motivo_devolucao?: string;
    },
  ) {
    return this.medicaoService.atestarItensMedicao(medicaoId, body.fiscal_id, body.fiscal_nome, {
      itens: body.itens,
      itens_cancelar_ateste: body.itens_cancelar_ateste,
      observacoes_gerais: body.observacoes_gerais,
      verificado_in_loco: body.verificado_in_loco,
      motivo_devolucao: body.motivo_devolucao,
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
    @Req() request: { user: JwtPayload },
  ) {
    // Verificar permissão real no banco de dados (não confiar em query params)
    let isAdmin = request.user.type === UserType.ADMIN;
    if (!isAdmin && request.user.type === UserType.USUARIO) {
      const usuario = await this.usuarioRepository.findOne({
        where: { id: request.user.sub },
      });
      isAdmin = usuario?.pode_excluir_medicao === true;
    }
    return this.medicaoService.excluirMedicao(medicaoId, undefined, { isAdmin });
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

  // ============================================================================
  // ATESTAÇÃO MENSAL (Serviços Continuados)
  // ============================================================================

  @Post(':contratoId/atestacoes/pre-criar')
  async preCriarAtestacoes(
    @Param('contratoId') contratoId: string,
    @Body() body: {
      valor_mensal: number;
      data_inicio: string;
      data_fim: string;
      empenho?: string;
      data_empenho?: string;
      tipo_empenho?: 'GLOBAL' | 'ESTIMATIVO';
    },
  ) {
    return this.atestacaoService.preCriarAtestacoesEmLote(contratoId, body);
  }

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

  @Patch('atestacoes/:atestacaoId/reabrir')
  async reabrirAtestacao(@Param('atestacaoId') atestacaoId: string) {
    return this.atestacaoService.reabrirAtestacao(atestacaoId);
  }

  @Patch('atestacoes/:atestacaoId/cancelar')
  async cancelarAtestacao(@Param('atestacaoId') atestacaoId: string) {
    return this.atestacaoService.cancelarAtestacao(atestacaoId);
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
