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
  Res,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  UseInterceptors,
  UploadedFile,
  StreamableFile,
  InternalServerErrorException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream, existsSync } from 'fs';
import * as path from 'path';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JwtPayload, UserType } from '../auth/auth.service';
import { MedicaoService } from './medicao.service';
import { Requisicao, StatusRequisicao, TipoRequisicao } from '../almoxarifado/entities/requisicao.entity';
import { OrdemFornecimento, StatusOrdemFornecimento, TipoOrdem } from '../almoxarifado/entities/ordem-fornecimento.entity';
import { AtestacaoService } from './atestacao.service';
import { LicencaControleService } from './licenca-controle.service';
import { OrdemServicoContratoService } from './ordem-servico-contrato.service';
import { FatorTransparenciaService } from './fator-transparencia.service';
import { casarPagamentosComOrdens, ROTULO_CRITERIO } from './ordem-paga.util';
import { ConciliacaoFatorService } from './conciliacao-fator.service';
import { ConciliacaoFatorScheduler } from './conciliacao-fator.scheduler';
import { OrdemServicoContrato, StatusOrdemServico } from './entities/ordem-servico-contrato.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Contrato, ModalidadeExecucao } from './entities/contrato.entity';
import { Medicao, StatusMedicao } from './entities/medicao.entity';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { MedicaoEquipeService } from './medicao-equipe.service';

@Controller('contratos')
@RequireModule(ModuloSistema.CONTRATOS)
export class ModalidadesContratoController {
  constructor(
    private readonly medicaoService: MedicaoService,
    private readonly medicaoEquipeService: MedicaoEquipeService,
    private readonly atestacaoService: AtestacaoService,
    private readonly licencaService: LicencaControleService,
    private readonly osService: OrdemServicoContratoService,
    private readonly fatorTransparencia: FatorTransparenciaService,
    private readonly conciliacaoFator_: ConciliacaoFatorService,
    private readonly conciliacaoScheduler: ConciliacaoFatorScheduler,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    @InjectRepository(Contrato)
    private readonly contratoRepository: Repository<Contrato>,
    @InjectRepository(Medicao)
    private readonly medicaoRepository: Repository<Medicao>,
    @InjectRepository(Requisicao)
    private readonly requisicaoRepository: Repository<Requisicao>,
    @InjectRepository(OrdemFornecimento)
    private readonly ordemFornecimentoRepository: Repository<OrdemFornecimento>,
    @InjectRepository(OrdemServicoContrato)
    private readonly ordemServicoContratoRepository: Repository<OrdemServicoContrato>,
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
    throw new ForbiddenException('NÃ£o foi possÃ­vel identificar o Ã³rgÃ£o do usuÃ¡rio');
  }

  private async validarAcessoMedicaoOrgao(
    medicaoId: string,
    user: JwtPayload,
    orgaoIdParam?: string,
  ): Promise<Medicao> {
    const medicao = await this.medicaoService.buscarMedicao(medicaoId);
    const contrato = await this.contratoRepository.findOne({
      where: { id: medicao.contrato_id },
    });
    if (!contrato) {
      throw new NotFoundException('Contrato não encontrado');
    }
    if (contrato.orgao_id !== this.getOrgaoId(user, orgaoIdParam)) {
      throw new ForbiddenException('Você não tem acesso a esta medição');
    }
    return medicao;
  }

  private parseNumerosEmpenhos(valor: unknown): string[] {
    if (Array.isArray(valor)) {
      return valor
        .map(item => String(item ?? '').trim())
        .filter(Boolean);
    }

    if (typeof valor === 'string' && valor.trim()) {
      try {
        const parsed = JSON.parse(valor);
        if (Array.isArray(parsed)) {
          return parsed
            .map(item => String(item ?? '').trim())
            .filter(Boolean);
        }
      } catch {
        return valor
          .split(',')
          .map(item => item.trim())
          .filter(Boolean);
      }
    }

    return [];
  }

  private async carregarRequisicoesRelatorio(contratoId: string) {
    try {
      return await this.requisicaoRepository.find({
        where: { contrato_id: contratoId },
        select: [
          'id',
          'numero',
          'tipo',
          'status',
          'valor_total_estimado',
          'data_solicitacao',
          'created_at',
          'numeros_empenhos',
        ],
        order: { data_solicitacao: 'DESC', created_at: 'DESC' },
      });
    } catch (error) {
      console.warn(
        `[relatorio-pedidos] fallback requisições ${contratoId}: ${(error as Error).message}`,
      );
      return await this.requisicaoRepository.find({
        where: { contrato_id: contratoId },
        select: [
          'id',
          'numero',
          'tipo',
          'status',
          'valor_total_estimado',
          'data_solicitacao',
          'created_at',
        ],
        order: { data_solicitacao: 'DESC', created_at: 'DESC' },
      });
    }
  }

  private async carregarOrdensFornecimentoRelatorio(contratoId: string) {
    try {
      return await this.ordemFornecimentoRepository.find({
        where: { contrato_id: contratoId },
        select: [
          'id',
          'numero',
          'tipo',
          'status',
          'valor_total',
          'data_emissao',
          'created_at',
          'requisicao_id',
          'numeros_empenhos',
        ],
        order: { data_emissao: 'DESC', created_at: 'DESC' },
      });
    } catch (error) {
      console.warn(
        `[relatorio-pedidos] fallback ordens fornecimento ${contratoId}: ${(error as Error).message}`,
      );
      return await this.ordemFornecimentoRepository.find({
        where: { contrato_id: contratoId },
        select: [
          'id',
          'numero',
          'tipo',
          'status',
          'valor_total',
          'data_emissao',
          'created_at',
          'requisicao_id',
        ],
        order: { data_emissao: 'DESC', created_at: 'DESC' },
      });
    }
  }

  private async carregarOrdensServicoRelatorio(contratoId: string) {
    try {
      return await this.ordemServicoContratoRepository.find({
        where: { contrato_id: contratoId },
        select: [
          'id',
          'numero_os',
          'status',
          'valor_total',
          'data_abertura',
          'data_prazo',
          'created_at',
          'numero_empenho',
          'numeros_empenhos',
        ],
        order: { data_abertura: 'DESC', created_at: 'DESC' },
      });
    } catch (error) {
      console.warn(
        `[relatorio-pedidos] fallback ordens serviço ${contratoId}: ${(error as Error).message}`,
      );
      return await this.ordemServicoContratoRepository.find({
        where: { contrato_id: contratoId },
        select: [
          'id',
          'numero_os',
          'status',
          'valor_total',
          'data_abertura',
          'data_prazo',
          'created_at',
          'numero_empenho',
        ],
        order: { data_abertura: 'DESC', created_at: 'DESC' },
      });
    }
  }

  // ============================================================================
  // MEDIÃ‡ÃƒO â€” Consulta de OS (criaÃ§Ã£o/aprovaÃ§Ã£o via mÃ³dulo centralizado de RequisiÃ§Ãµes)
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
  // MEDIÃ‡ÃƒO â€” Etapas do Cronograma
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
  // MEDIÃ‡ÃƒO â€” Itens do Cronograma (ServiÃ§os por quantidade)
  // ============================================================================

  @Get('unidades-cronograma')
  getUnidadesCronograma() {
    const { UNIDADES_CRONOGRAMA } = require('./entities/item-cronograma.entity');
    return { unidades: UNIDADES_CRONOGRAMA };
  }

  @Post(':contratoId/itens-cronograma')
  async criarItemCronograma(
    @Param('contratoId') contratoId: string,
    @Body() dados: any,
  ) {
    return this.medicaoService.criarItemCronograma(contratoId, dados);
  }

  @Get(':contratoId/itens-cronograma')
  async listarItensCronograma(@Param('contratoId') contratoId: string) {
    return this.medicaoService.listarItensCronograma(contratoId);
  }

  @Put('itens-cronograma/:itemId')
  async atualizarItemCronograma(
    @Param('itemId') itemId: string,
    @Body() dados: any,
  ) {
    return this.medicaoService.atualizarItemCronograma(itemId, dados);
  }

  @Delete('itens-cronograma/:itemId')
  async excluirItemCronograma(@Param('itemId') itemId: string) {
    await this.medicaoService.excluirItemCronograma(itemId);
    return { success: true };
  }

  @Patch(':contratoId/itens-cronograma/:itemId/quantidade-migracao')
  async atualizarQuantidadeMedidaMigracao(
    @Param('contratoId') contratoId: string,
    @Param('itemId') itemId: string,
    @Body() body: { quantidade_medida: number; valor_migracao_reais?: number | null },
    @Req() request: { user: JwtPayload },
  ) {
    const isAdmin = request.user.type === UserType.ADMIN || request.user.role === 'ADMIN';
    if (!isAdmin) {
      throw new ForbiddenException('Apenas administradores podem informar quantidade medida em ajuste de migraÃ§Ã£o');
    }
    const contrato = await this.contratoRepository.findOne({ where: { id: contratoId } });
    if (!contrato) throw new NotFoundException('Contrato nÃ£o encontrado');
    return this.medicaoService.atualizarQuantidadeMedidaMigracao(
      contratoId,
      itemId,
      Number(body.quantidade_medida) || 0,
      body.valor_migracao_reais != null ? Number(body.valor_migracao_reais) : null,
    );
  }

  // ============================================================================
  // MEDIÃ‡ÃƒO â€” Rotas estÃ¡ticas DEVEM vir ANTES das rotas com :parametro
  //           para evitar que NestJS interprete "resumo-fiscal" como :medicaoId
  // ============================================================================

  @Get('medicoes/fiscais')
  async listarFiscaisOrgao(
    @Query('orgaoId') orgaoId: string,
    @Req() request: { user: JwtPayload },
  ) {
    const oid = orgaoId || this.getOrgaoId(request.user, undefined);
    return this.medicaoService.listarFiscaisOrgao(oid);
  }

  @Post('medicoes/:medicaoId/solicitar-assinatura-fiscal')
  async solicitarAssinaturaFiscal(
    @Param('medicaoId') medicaoId: string,
    @Body() body: { fiscalUsuarioId: string; itensSelecionadosIds?: string[] },
    @Req() request: { user: JwtPayload },
  ) {
    return this.medicaoService.solicitarAssinaturaFiscalWhatsApp(
      medicaoId,
      body.fiscalUsuarioId,
      request.user.sub,
      { itensSelecionadosIds: body.itensSelecionadosIds },
    );
  }

  @Get('medicoes/:medicaoId/status-assinatura-fiscal')
  async statusAssinaturaFiscal(@Param('medicaoId') medicaoId: string) {
    return this.medicaoService.statusAssinaturaFiscal(medicaoId);
  }

  @Post('medicoes/:medicaoId/solicitar-assinatura-engenheiro')
  async solicitarAssinaturaEngenheiro(
    @Param('medicaoId') medicaoId: string,
    @Req() request: { user: JwtPayload },
  ) {
    return this.medicaoService.solicitarAssinaturaEngenheiroWhatsApp(
      medicaoId,
      request.user.sub,
    );
  }

  @Get('medicoes/:medicaoId/status-assinatura-engenheiro')
  async statusAssinaturaEngenheiro(@Param('medicaoId') medicaoId: string) {
    return this.medicaoService.statusAssinaturaEngenheiro(medicaoId);
  }

  @Get('medicoes/pendentes-ateste')
  async listarPendentesAteste(
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user, orgaoIdParam);
    return this.medicaoService.listarPendentesAteste(orgaoId);
  }

  @Get('medicoes/aprovadas')
  async listarAprovadas(
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user, orgaoIdParam);
    return this.medicaoService.listarAprovadas(orgaoId);
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
   * Resumo de mediÃ§Ãµes por contrato para o painel do fiscal.
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
  // MEDIÃ‡ÃƒO â€” Rotas parametrizadas (medicoes/:medicaoId e :contratoId/medicoes)
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
   * Solicita ao fornecedor o envio da mediÃ§Ã£o do mÃªs.
   * ValidaÃ§Ã£o multiorgÃ£o: contrato deve pertencer ao Ã³rgÃ£o do usuÃ¡rio.
   */
  @Post(':contratoId/medicoes/solicitar')
  async solicitarMedicao(
    @Param('contratoId') contratoId: string,
    @Body() body: { mes_referencia: string; mensagem?: string; enviar_whatsapp?: boolean; telefone_whatsapp?: string },
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    const contrato = await this.contratoRepository.findOne({ where: { id: contratoId } });
    if (!contrato) throw new NotFoundException('Contrato nÃ£o encontrado');
    if (contrato.orgao_id !== orgaoId) {
      throw new ForbiddenException('VocÃª nÃ£o tem permissÃ£o para acessar este contrato');
    }
    const modalidadesComMedicao = [ModalidadeExecucao.MEDICAO, ModalidadeExecucao.CONTINUADO, ModalidadeExecucao.LICENCA];
    if (!modalidadesComMedicao.includes(contrato.modalidade_execucao)) {
      throw new BadRequestException('Contrato nÃ£o suporta mediÃ§Ãµes');
    }
    if (!body.mes_referencia?.trim()) {
      throw new BadRequestException('mes_referencia Ã© obrigatÃ³rio (formato YYYY-MM)');
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
   * Solicita mediÃ§Ã£o em lote para mÃºltiplos contratos de uma vez.
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
      throw new BadRequestException('mes_referencia Ã© obrigatÃ³rio (formato YYYY-MM)');
    }

    const usuario = await this.usuarioRepository.findOne({ where: { id: request.user.sub } });
    const fiscalNome = usuario?.nome || 'Fiscal';

    const resultados: { contrato_id: string; numero_contrato?: string; fornecedor_nome?: string; sucesso: boolean; erro?: string; whatsapp_tentado?: boolean; whatsapp_telefone?: string | null; whatsapp_sem_telefone?: boolean }[] = [];

    for (const contratoId of body.contrato_ids) {
      try {
        const contrato = await this.contratoRepository.findOne({ where: { id: contratoId }, relations: ['fornecedor'] });
        if (!contrato) {
          resultados.push({ contrato_id: contratoId, sucesso: false, erro: 'Contrato nÃ£o encontrado' });
          continue;
        }
        if (contrato.orgao_id !== orgaoId) {
          resultados.push({ contrato_id: contratoId, numero_contrato: contrato.numero_contrato, sucesso: false, erro: 'Sem permissÃ£o' });
          continue;
        }
        const modalidadesComMedicao = [ModalidadeExecucao.MEDICAO, ModalidadeExecucao.CONTINUADO, ModalidadeExecucao.LICENCA];
        if (!modalidadesComMedicao.includes(contrato.modalidade_execucao)) {
          resultados.push({ contrato_id: contratoId, numero_contrato: contrato.numero_contrato, sucesso: false, erro: 'NÃ£o Ã© modalidade com mediÃ§Ã£o' });
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
      message: `SolicitaÃ§Ãµes enviadas: ${enviados} sucesso, ${erros} erro(s)`,
      total: body.contrato_ids.length,
      enviados,
      erros,
      resultados,
    };
  }

  /**
   * HistÃ³rico de solicitaÃ§Ãµes de mediÃ§Ã£o enviadas pelo Ã³rgÃ£o.
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
  // DISCRIMINAÃ‡ÃƒO DE DESPESAS â€” Ã“rgÃ£o (fiscal/gestor)
  // ============================================================================

  /**
   * SugestÃ£o de discriminaÃ§Ãµes (da Ãºltima mediÃ§Ã£o do contrato).
   * GET /api/contratos/medicoes/:medicaoId/discriminacoes/sugestao
   */
  @Get('medicoes/:medicaoId/discriminacoes/sugestao')
  async sugestaoDiscriminacoes(@Param('medicaoId') medicaoId: string) {
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
      relations: ['contrato'],
    });
    if (!medicao) throw new NotFoundException('MediÃ§Ã£o nÃ£o encontrada');
    const ignorarAtual =
      medicao.status === StatusMedicao.RASCUNHO ||
      medicao.status === StatusMedicao.DEVOLVIDA
        ? medicao.id
        : undefined;
    return this.medicaoService.sugerirDiscriminacoes(
      medicao.contrato_id,
      ignorarAtual,
    );
  }

  /**
   * Lista discriminaÃ§Ãµes de despesa de uma mediÃ§Ã£o.
   * GET /api/contratos/medicoes/:medicaoId/discriminacoes
   */
  @Get('medicoes/:medicaoId/discriminacoes')
  async listarDiscriminacoes(
    @Param('medicaoId') medicaoId: string,
  ) {
    return this.medicaoService.listarDiscriminacoes(medicaoId);
  }

  /**
   * Lista assinaturas digitais de uma mediÃ§Ã£o.
   * GET /api/contratos/medicoes/:medicaoId/assinaturas
   */
  @Get('medicoes/:medicaoId/assinaturas')
  async listarAssinaturasMedicao(
    @Param('medicaoId') medicaoId: string,
  ) {
    return this.medicaoService.listarAssinaturasMedicao(medicaoId);
  }

  /**
   * Fiscal corrige um item de discriminaÃ§Ã£o.
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
   * Fiscal substitui todas as discriminaÃ§Ãµes (correÃ§Ã£o em massa).
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
  // EXECUÃ‡ÃƒO FISCAL/FINANCEIRA (auto-calculada)
  // ============================================================================

  /**
   * Retorna o resumo de execuÃ§Ã£o fiscal/financeira por item do contrato.
   * GET /api/contratos/:contratoId/execucao-financeira?medicaoId=xxx
   */
  @Get(':contratoId/execucao-financeira')
  async execucaoFinanceira(
    @Param('contratoId') contratoId: string,
    @Query('medicaoId') medicaoId: string,
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    const contrato = await this.contratoRepository.findOne({ where: { id: contratoId } });
    if (!contrato) throw new NotFoundException('Contrato nÃ£o encontrado');
    const usarItensCronograma = await this.medicaoService.usarItensCronograma(contratoId);
    if (usarItensCronograma && contrato.fornecedor_id) {
      return this.medicaoService.calcularExecucaoFinanceiraFornecedor(contratoId, medicaoId || undefined);
    }
    return this.medicaoService.calcularExecucaoFinanceira(contratoId, orgaoId, medicaoId || undefined);
  }

  @Get('medicoes/:medicaoId')
  async buscarMedicao(@Param('medicaoId') medicaoId: string) {
    return this.medicaoService.buscarMedicao(medicaoId);
  }

  @Get('medicoes/:medicaoId/equipe')
  async buscarEquipeMedicao(
    @Param('medicaoId') medicaoId: string,
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    await this.validarAcessoMedicaoOrgao(
      medicaoId,
      request.user,
      orgaoIdParam,
    );
    return this.medicaoEquipeService.buscarPorMedicao(medicaoId);
  }

  @Get('medicoes/:medicaoId/equipe/xlsx')
  async baixarEquipeXlsx(
    @Param('medicaoId') medicaoId: string,
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    const medicao = await this.validarAcessoMedicaoOrgao(
      medicaoId,
      request.user,
      orgaoIdParam,
    );
    const arquivo = await this.medicaoEquipeService.gerarXlsx(medicaoId);
    return new StreamableFile(arquivo, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="relacao-funcionarios-medicao-${medicao.numero_medicao}.xlsx"`,
    });
  }

  @Get('medicoes/:medicaoId/equipe/pdf')
  async baixarEquipePdf(
    @Param('medicaoId') medicaoId: string,
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    const medicao = await this.validarAcessoMedicaoOrgao(
      medicaoId,
      request.user,
      orgaoIdParam,
    );
    const arquivo = await this.medicaoEquipeService.gerarPdf(medicaoId);
    return new StreamableFile(arquivo, {
      type: 'application/pdf',
      disposition: `attachment; filename="relacao-funcionarios-medicao-${medicao.numero_medicao}.pdf"`,
    });
  }

  @Get('medicoes/:medicaoId/boletim-oficial/download')
  async downloadBoletimOficial(
    @Param('medicaoId') medicaoId: string,
    @Req() request: { user: JwtPayload },
    @Res({ passthrough: true }) res: Response,
    @Query('orgaoId') orgaoIdParam?: string,
  ): Promise<StreamableFile> {
    const medicao = await this.medicaoService.buscarMedicao(medicaoId);
    const contrato = await this.contratoRepository.findOne({ where: { id: medicao.contrato_id } });
    if (!contrato) throw new NotFoundException('Contrato nÃ£o encontrado');

    const orgaoId = this.getOrgaoId(request.user, orgaoIdParam);
    if (contrato.orgao_id !== orgaoId) {
      throw new ForbiddenException('VocÃª nÃ£o tem acesso a esta mediÃ§Ã£o');
    }

    await this.medicaoService.obterOuGerarPdfOficialMedicao(medicaoId);
    const filePath = this.medicaoService.getBoletimPdfFilePath(medicaoId);
    if (!filePath || !existsSync(filePath)) {
      throw new NotFoundException('Boletim PDF nÃ£o encontrado');
    }

    const filename = `boletim_medicao_${medicao.numero_medicao || medicaoId}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(createReadStream(filePath));
  }

  /** Boletim de obra no modelo 2 (leitura), gerado na hora; o oficial não muda. */
  @Get('medicoes/:medicaoId/boletim-obra-v2')
  async boletimObraV2(
    @Param('medicaoId') medicaoId: string,
    @Req() request: { user: JwtPayload },
    @Res({ passthrough: true }) res: Response,
    @Query('orgaoId') orgaoIdParam?: string,
  ): Promise<StreamableFile> {
    const medicao = await this.medicaoService.buscarMedicao(medicaoId);
    const contrato = await this.contratoRepository.findOne({ where: { id: medicao.contrato_id } });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    if (contrato.orgao_id !== this.getOrgaoId(request.user, orgaoIdParam)) {
      throw new ForbiddenException('Você não tem acesso a esta medição');
    }
    const { buffer, filename } = await this.medicaoService.gerarBoletimObraV2(medicaoId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }

  @Get('medicoes/:medicaoId/boletim-oficial')
  async obterBoletimOficial(
    @Param('medicaoId') medicaoId: string,
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    const medicao = await this.medicaoService.buscarMedicao(medicaoId);
    const contrato = await this.contratoRepository.findOne({ where: { id: medicao.contrato_id } });
    if (!contrato) throw new NotFoundException('Contrato nÃ£o encontrado');

    const orgaoId = this.getOrgaoId(request.user, orgaoIdParam);
    if (contrato.orgao_id !== orgaoId) {
      throw new ForbiddenException('VocÃª nÃ£o tem acesso a esta mediÃ§Ã£o');
    }

    return this.medicaoService.obterOuGerarPdfOficialMedicao(medicaoId);
  }

  @Patch('medicoes/:medicaoId/corrigir')
  async corrigirCabecalhoMedicao(
    @Param('medicaoId') medicaoId: string,
    @Body() body: {
      competencia?: string;
      periodo_inicio?: string;
      periodo_fim?: string;
      valor_medido?: number | null;
      nota_fiscal_numero?: string;
      nota_fiscal_valor?: number | null;
      nota_fiscal_data?: string | null;
      data_emissao?: string | null;
      objeto_contrato?: string;
    },
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    const usuario = await this.usuarioRepository.findOne({ where: { id: request.user.sub } });
    const fiscalNome = usuario?.nome || 'Fiscal';
    return this.medicaoService.corrigirCabecalho(medicaoId, body, request.user.sub, fiscalNome, orgaoId);
  }

  /**
   * Lista as OS do contrato para o seletor de troca de OS da medição.
   * GET /api/contratos/:contratoId/ordens-servico-requisicao
   */
  @Get(':contratoId/ordens-servico-requisicao')
  async listarOrdensServicoRequisicao(
    @Param('contratoId') contratoId: string,
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user, orgaoIdParam);
    return this.medicaoService.listarOrdensServicoDoContrato(contratoId, orgaoId);
  }

  /**
   * Troca (ou desvincula) a ordem de serviço consumida por uma medição.
   * PATCH /api/contratos/medicoes/:medicaoId/os
   */
  @Patch('medicoes/:medicaoId/os')
  async trocarOrdemServicoMedicao(
    @Param('medicaoId') medicaoId: string,
    @Body() body: { requisicao_id: string | null; motivo: string },
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    const usuario = await this.usuarioRepository.findOne({ where: { id: request.user.sub } });
    const fiscalNome = usuario?.nome || 'Fiscal';
    return this.medicaoService.trocarOrdemServico(
      medicaoId,
      body?.requisicao_id ?? null,
      body?.motivo || '',
      request.user.sub,
      fiscalNome,
      orgaoId,
    );
  }

  /**
   * Contexto da tela de lançamento retroativo de medição (suporte).
   * GET /api/contratos/:contratoId/medicoes/retroativa/contexto
   */
  @Get(':contratoId/medicoes/retroativa/contexto')
  async contextoMedicaoRetroativa(
    @Param('contratoId') contratoId: string,
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user, orgaoIdParam);
    return this.medicaoService.getContextoMedicaoRetroativa(contratoId, orgaoId);
  }

  /**
   * Registra uma medição retroativa JÁ APROVADA (execução liquidada e paga na
   * contabilidade sem medição no sistema). Porta de suporte: exige a mesma
   * permissão especial do cancelamento/estorno.
   * POST /api/contratos/:contratoId/medicoes/retroativa
   */
  /**
   * Renumera as medições do contrato pela competência (depois de lançamentos
   * retroativos). `?simular=true` devolve o que mudaria, sem alterar.
   */
  @Post(':contratoId/medicoes/reordenar')
  async reordenarMedicoes(
    @Param('contratoId') contratoId: string,
    @Req() request: { user: JwtPayload },
    @Query('simular') simular?: string,
  ) {
    const usuario = await this.usuarioRepository.findOne({
      where: { id: request.user.sub },
    });
    if (!usuario) throw new BadRequestException('Usuário não encontrado');
    if (!usuario.pode_cancelar_estornar) {
      throw new BadRequestException(
        'Você não tem permissão para esta ação. Apenas usuários autorizados a cancelar/estornar podem renumerar medições.',
      );
    }
    return this.medicaoService.reordenarMedicoesPorCompetencia(
      contratoId,
      this.getOrgaoId(request.user),
      usuario.nome || usuario.email,
      simular === 'true' || simular === '1',
    );
  }

  @Post(':contratoId/medicoes/retroativa')
  async registrarMedicaoRetroativa(
    @Param('contratoId') contratoId: string,
    @Body()
    body: {
      requisicao_id?: string | null;
      periodo_inicio: string;
      periodo_fim: string;
      competencia?: string;
      nota_fiscal_numero?: string;
      nota_fiscal_valor?: number | null;
      nota_fiscal_data?: string | null;
      valor_medido?: number;
      itens?: Array<{ item_cronograma_id: string; quantidade_medida: number }>;
      motivo: string;
    },
    @Req() request: { user: JwtPayload },
  ) {
    const usuario = await this.usuarioRepository.findOne({
      where: { id: request.user.sub },
    });
    if (!usuario) {
      throw new BadRequestException('Usuário não encontrado');
    }
    if (!usuario.pode_cancelar_estornar) {
      throw new BadRequestException(
        'Você não tem permissão para esta ação. Apenas usuários autorizados a cancelar/estornar podem registrar medição retroativa.',
      );
    }
    const orgaoId = this.getOrgaoId(request.user);
    const medicao = await this.medicaoService.registrarMedicaoRetroativa(
      contratoId,
      body,
      usuario.id,
      usuario.nome || usuario.email,
      orgaoId,
    );
    // `aviso` vem preenchido quando o período informado é anterior ao corte do
    // ciclo vigente — a medição vale, mas não consome o saldo do ciclo atual.
    return {
      ...medicao,
      mensagem: medicao.aviso
        ? `Medição registrada retroativamente já aprovada, mas ATENÇÃO: ${medicao.aviso}`
        : 'Medição registrada retroativamente já aprovada. O saldo foi consumido e o motivo ficou registrado no histórico do contrato.',
    };
  }

  /**
   * Fiscal corrige as datas das assinaturas digitais do boletim.
   * PATCH /api/contratos/medicoes/:medicaoId/assinaturas/datas
   */
  @Patch('medicoes/:medicaoId/assinaturas/datas')
  async corrigirDatasAssinaturasMedicao(
    @Param('medicaoId') medicaoId: string,
    @Body() body: {
      assinaturas: Array<{ id: string; data_assinatura: string }>;
      motivo?: string;
    },
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    const usuario = await this.usuarioRepository.findOne({ where: { id: request.user.sub } });
    const fiscalNome = usuario?.nome || 'Fiscal';
    return this.medicaoService.corrigirDatasAssinaturas(medicaoId, body, fiscalNome, orgaoId);
  }

  @Patch('medicoes/:medicaoId/execucao-fiscal')
  async corrigirExecucaoFiscalMedicao(
    @Param('medicaoId') medicaoId: string,
    @Body() body: {
      vigencia_inicio?: string;
      vigencia_fim?: string;
      dias_executados?: number;
      dias_restantes?: number;
      meses_executados?: number;
      dias_executados_extra?: number;
      meses_restantes?: number;
      dias_restantes_extra?: number;
      totais_financeiros?: {
        no_periodo?: number;
        ate_periodo?: number;
        a_executar?: number;
      };
      item_overrides?: Array<{ item_cronograma_id: string; no_periodo?: number; ate_periodo?: number; a_executar?: number; descricao?: string; unidade?: string; fin_no_periodo?: number; fin_ate_periodo?: number; fin_a_executar?: number }>;
    },
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.medicaoService.corrigirExecucaoFiscal(medicaoId, body, orgaoId);
  }

  @Post('medicoes/:medicaoId/regenerar-boletim')
  async regenerarBoletimMedicao(
    @Param('medicaoId') medicaoId: string,
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    try {
      return await this.medicaoService.regenerarBoletim(medicaoId, orgaoId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao regenerar boletim';
      throw new InternalServerErrorException(message);
    }
  }

  @Patch('medicoes/:medicaoId/marcar-enviado-contabilidade')
  async marcarEnviadoContabilidade(
    @Param('medicaoId') medicaoId: string,
    @Req() request: { user: JwtPayload },
  ) {
    const usuario = await this.usuarioRepository.findOne({ where: { id: request.user.sub } });
    if (request.user.type === UserType.USUARIO && !usuario?.pode_enviar_contabilidade) {
      throw new ForbiddenException('VocÃª nÃ£o tem permissÃ£o para marcar envio para contabilidade');
    }
    const orgaoId = this.getOrgaoId(request.user);
    const nomeUsuario = usuario?.nome || request.user.email || '';
    return this.medicaoService.marcarEnviadoContabilidade(medicaoId, orgaoId, nomeUsuario);
  }

  @Get('medicoes/:medicaoId/download-zip')
  async downloadZipMedicao(
    @Param('medicaoId') medicaoId: string,
    @Req() request: { user: JwtPayload },
    @Res() res: Response,
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    const buffer = await this.medicaoService.gerarZipMedicao(medicaoId, orgaoId);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="medicao_${medicaoId}.zip"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
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

  @Patch('medicoes/:medicaoId/submeter-fiscal')
  async submeterMedicaoFiscal(
    @Param('medicaoId') medicaoId: string,
    @Body() body: { fiscal_id: string; fiscal_nome: string },
    @Req() request: { user: JwtPayload },
  ) {
    const medicao = await this.medicaoService.buscarMedicao(medicaoId);
    const contrato = await this.contratoRepository.findOne({ where: { id: medicao.contrato_id } });
    if (!contrato) throw new NotFoundException('Contrato nÃ£o encontrado');
    const orgaoId = this.getOrgaoId(request.user);
    if (contrato.orgao_id !== orgaoId) throw new ForbiddenException('Sem acesso a esta mediÃ§Ã£o');
    return this.medicaoService.submeterMedicaoFiscal(medicaoId, body.fiscal_id, body.fiscal_nome);
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
    // Verificar permissÃ£o real no banco de dados (nÃ£o confiar em query params)
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
  // ATESTAÃ‡ÃƒO MENSAL (ServiÃ§os Continuados)
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
  // LICENÃ‡AS (Software/SaaS)
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
  // ORDENS DE SERVIÃ‡O â€” MÃ³dulo Unificado
  // ============================================================================

  // Banco de MÃ©tricas (apenas ORDEM_SERVICO)
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

  // --- Listagem geral de OS (por Ã³rgÃ£o) ---

  @Get('ordens-servico/pendentes-aprovacao')
  async listarOSPendentesAprovacao(
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user, orgaoIdParam);
    return this.osService.listarPendentesAprovacao(orgaoId);
  }

  @Get('ordens-servico/listar')
  async listarOSPorOrgao(
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
    @Query('status') status?: StatusOrdemServico,
    @Query('contratoId') contratoId?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user, orgaoIdParam);
    return this.osService.listarOSPorOrgao(orgaoId, { status, contratoId });
  }

  // --- CRUD por contrato ---

  @Post(':contratoId/ordens-servico')
  async criarOS(
    @Param('contratoId') contratoId: string,
    @Body() dados: any,
    @Req() request: { user: JwtPayload },
  ) {
    const usuario = await this.usuarioRepository.findOne({ where: { id: request.user.sub } });
    return this.osService.criarOS(contratoId, {
      ...dados,
      usuario_cadastro_id: request.user.sub,
      usuario_cadastro_nome: usuario?.nome || 'UsuÃ¡rio',
    });
  }

  @Get(':contratoId/ordens-servico')
  async listarOS(
    @Param('contratoId') contratoId: string,
    @Query('status') status?: StatusOrdemServico,
  ) {
    return this.osService.listarOS(contratoId, status);
  }

  @Get(':contratoId/ordens-servico/resumo')
  async resumoOS(@Param('contratoId') contratoId: string) {
    return this.osService.resumoOS(contratoId);
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

  // --- Fluxo de aprovaÃ§Ã£o ---

  @Patch('ordens-servico/:osId/submeter')
  async submeterAprovacaoOS(@Param('osId') osId: string) {
    return this.osService.submeterAprovacao(osId);
  }

  @Patch('ordens-servico/:osId/aprovar')
  async aprovarOS(
    @Param('osId') osId: string,
    @Body() body: { observacao?: string },
    @Req() request: { user: JwtPayload },
  ) {
    const usuario = await this.usuarioRepository.findOne({ where: { id: request.user.sub } });
    return this.osService.aprovarOS(osId, request.user.sub, usuario?.nome || 'Aprovador', body.observacao);
  }

  @Patch('ordens-servico/:osId/rejeitar-aprovacao')
  async rejeitarAprovacaoOS(
    @Param('osId') osId: string,
    @Body() body: { observacao: string },
    @Req() request: { user: JwtPayload },
  ) {
    const usuario = await this.usuarioRepository.findOne({ where: { id: request.user.sub } });
    return this.osService.rejeitarAprovacaoOS(osId, request.user.sub, usuario?.nome || 'Aprovador', body.observacao);
  }

  // --- Fluxo de execuÃ§Ã£o ---

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

  @Patch('ordens-servico/:osId/concluir')
  async concluirOS(@Param('osId') osId: string) {
    return this.osService.concluirOS(osId);
  }

  @Patch('ordens-servico/:osId/cancelar')
  async cancelarOS(
    @Param('osId') osId: string,
    @Body('observacao') observacao: string,
  ) {
    return this.osService.cancelarOS(osId, observacao);
  }

  @Get('ordens-servico/:osId/saldo')
  async saldoOS(@Param('osId') osId: string) {
    const saldo = await this.osService.calcularSaldoOS(osId);
    return { saldo };
  }

  // ============================================================================
  // ASSINATURA DIGITAL â€” Boletim de MediÃ§Ã£o
  // ============================================================================

  /**
   * Registra uma assinatura digital para um Boletim de MediÃ§Ã£o.
   * Usa o mesmo mÃ³dulo de assinaturas das OS/OF (assinaturas_digitais).
   * Retorna o cÃ³digo de validaÃ§Ã£o formatado para inclusÃ£o no PDF.
   */
  @Post('medicoes/:medicaoId/solicitar-otp-fiscal')
  async solicitarOtpFiscal(
    @Param('medicaoId') medicaoId: string,
    @Body() body: { telefone: string },
  ) {
    return this.medicaoService.solicitarOtpAssinaturaFiscal(medicaoId, body.telefone);
  }

  /**
   * Envia OTP para o telefone do fornecedor (quando o Ã³rgÃ£o cria a mediÃ§Ã£o).
   * A assinatura serÃ¡ do fornecedor, no campo FORNECEDOR do boletim.
   */
  @Post('medicoes/:medicaoId/solicitar-otp-fornecedor')
  async solicitarOtpFornecedor(@Param('medicaoId') medicaoId: string) {
    return this.medicaoService.solicitarOtpAssinaturaFornecedor(medicaoId);
  }

  @Post('medicoes/:medicaoId/validar-otp-fornecedor')
  async validarOtpFornecedor(
    @Param('medicaoId') medicaoId: string,
    @Body() body: { codigo: string },
  ) {
    return this.medicaoService.validarOtpAssinaturaFornecedor(medicaoId, body.codigo);
  }

  @Post('medicoes/:medicaoId/validar-otp-fiscal')
  async validarOtpFiscal(
    @Param('medicaoId') medicaoId: string,
    @Body() body: { codigo: string },
    @Req() request: { user: JwtPayload },
  ) {
    const usuario = await this.usuarioRepository.findOne({ where: { id: request.user.sub } });
    const orgaoId = request.user.type === UserType.ORGAO
      ? request.user.sub
      : usuario?.orgao_id || '';

    return this.medicaoService.validarOtpAssinaturaFiscal(medicaoId, body.codigo, {
      usuario_id: request.user.sub,
      usuario_nome: usuario?.nome || '',
      usuario_cpf_cnpj: usuario?.cpf || '',
      usuario_cargo: usuario?.cargo || 'Fiscal',
      orgao_id: orgaoId,
    });
  }

  @Post('medicoes/:medicaoId/upload-boletim-oficial')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadBoletimOficial(
    @Param('medicaoId') medicaoId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Arquivo PDF Ã© obrigatÃ³rio');
    const pdfUrl = await this.medicaoService.salvarBoletimPdf(medicaoId, file.buffer);
    return { url: pdfUrl };
  }

  @Post('medicoes/:medicaoId/assinar')
  async assinarMedicao(
    @Param('medicaoId') medicaoId: string,
    @Body() body: {
      papel: 'FORNECEDOR' | 'FISCAL' | 'GESTOR';
      usuario_nome: string;
      usuario_cpf_cnpj?: string;
      usuario_cargo?: string;
    },
    @Req() request: { user: JwtPayload },
  ) {
    const usuario = await this.usuarioRepository.findOne({ where: { id: request.user.sub } });
    const orgaoId = request.user.type === UserType.ORGAO
      ? request.user.sub
      : usuario?.orgao_id || '';

    return this.medicaoService.registrarAssinaturaMedicao(medicaoId, {
      orgao_id: orgaoId,
      papel: body.papel,
      usuario_id: request.user.sub,
      usuario_nome: body.usuario_nome || usuario?.nome || '',
      usuario_cpf_cnpj: body.usuario_cpf_cnpj || usuario?.cpf || '',
      usuario_cargo: body.usuario_cargo || usuario?.cargo || '',
    });
  }

  // ============================================================
  // EMPENHOS â€” Portal Fator TransparÃªncia
  // ============================================================

  @Get(':contratoId/relatorio-pedidos')
  async relatorioPedidos(@Param('contratoId') contratoId: string) {
    const contrato = await this.contratoRepository.findOne({
      where: { id: contratoId },
      select: [
        'id',
        'orgao_id',
        'numero_contrato',
        'ano',
        'objeto',
        'fornecedor_razao_social',
        'fornecedor_cnpj',
        'data_vigencia_inicio',
        'data_vigencia_fim',
      ],
    });

    if (!contrato) {
      throw new NotFoundException('Contrato nao encontrado');
    }

    const orgao = await this.contratoRepository.manager.getRepository(Orgao).findOne({
      where: { id: contrato.orgao_id },
      select: ['nome', 'cnpj', 'cidade', 'uf'],
    });

    const [requisicoes, ordensFornecimento, ordensServico] = await Promise.all([
      this.carregarRequisicoesRelatorio(contratoId),
      this.carregarOrdensFornecimentoRelatorio(contratoId),
      this.carregarOrdensServicoRelatorio(contratoId),
    ]);

    const secoes = {
      ordens_fornecimento: ordensFornecimento
        .filter(ordem => ordem.tipo === TipoOrdem.FORNECIMENTO)
        .map(ordem => ({
          id: ordem.id,
          numero: ordem.numero,
          tipo: ordem.tipo,
          status: ordem.status,
          valor_total: Number(ordem.valor_total ?? 0),
          data_documento: ordem.data_emissao
            ? new Date(ordem.data_emissao).toISOString()
            : ordem.created_at?.toISOString?.() ?? null,
          requisicao_origem_id: ordem.requisicao_id,
          empenhos: this.parseNumerosEmpenhos(ordem.numeros_empenhos),
        })),
      requisicoes: requisicoes
        .filter(requisicao => requisicao.tipo !== TipoRequisicao.ORDEM_SERVICO)
        .map(requisicao => ({
          id: requisicao.id,
          numero: requisicao.numero,
          tipo: requisicao.tipo,
          status: requisicao.status,
          valor_total: Number(requisicao.valor_total_estimado ?? 0),
          data_documento: requisicao.data_solicitacao
            ? new Date(requisicao.data_solicitacao).toISOString()
            : requisicao.created_at?.toISOString?.() ?? null,
          empenhos: this.parseNumerosEmpenhos(requisicao.numeros_empenhos),
        })),
      ordens_servico: ordensServico.map(ordem => ({
        id: ordem.id,
        numero: ordem.numero_os,
        tipo: 'ORDEM_SERVICO',
        status: ordem.status,
        valor_total: Number(ordem.valor_total ?? 0),
        data_documento: ordem.data_abertura
          ? new Date(ordem.data_abertura).toISOString()
          : ordem.created_at?.toISOString?.() ?? null,
        data_prazo: ordem.data_prazo ? new Date(ordem.data_prazo).toISOString() : null,
        empenhos: Array.from(new Set([
          ...this.parseNumerosEmpenhos(ordem.numeros_empenhos),
          ...this.parseNumerosEmpenhos(ordem.numero_empenho ? [ordem.numero_empenho] : []),
        ])),
      })),
    };

    return {
      contrato: {
        id: contrato.id,
        numero_contrato: contrato.numero_contrato,
        ano: contrato.ano,
        objeto: contrato.objeto,
        data_vigencia_inicio: contrato.data_vigencia_inicio,
        data_vigencia_fim: contrato.data_vigencia_fim,
        fornecedor_razao_social: contrato.fornecedor_razao_social,
        fornecedor_cnpj: contrato.fornecedor_cnpj,
        orgao: orgao
          ? {
              nome: orgao.nome,
              cnpj: orgao.cnpj,
              cidade: orgao.cidade,
              uf: orgao.uf,
            }
          : null,
      },
      resumo: {
        total_ordens_fornecimento: secoes.ordens_fornecimento.length,
        total_requisicoes: secoes.requisicoes.length,
        total_ordens_servico: secoes.ordens_servico.length,
        total_documentos:
          secoes.ordens_fornecimento.length +
          secoes.requisicoes.length +
          secoes.ordens_servico.length,
        total_empenhos_vinculados: new Set([
          ...secoes.ordens_fornecimento.flatMap(item => item.empenhos),
          ...secoes.requisicoes.flatMap(item => item.empenhos),
          ...secoes.ordens_servico.flatMap(item => item.empenhos),
        ]).size,
      },
      secoes,
    };
  }

  /**
   * Conciliação sistema × Fator (liquidado por exercício) + checagens internas.
   * Usado pelo painel da aba Medição.
   */
  @Get(':contratoId/conciliacao-fator')
  async conciliacaoFator(
    @Param('contratoId') contratoId: string,
    @Query('exercicio') exercicio?: string,
  ) {
    return this.conciliacaoFator_.conciliarContrato(
      contratoId,
      exercicio ? parseInt(exercicio, 10) : undefined,
    );
  }

  /**
   * Auditoria em lote dos contratos de MEDICAO do órgão: checagens internas
   * de saldo/migração (e opcionalmente conciliação Fator com ?fator=1).
   */
  @Get('auditoria/saldos')
  async auditoriaSaldos(@Req() req: any, @Query('fator') fator?: string) {
    const user = req.user as JwtPayload;
    const orgaoId = this.getOrgaoId(user, req.query?.orgaoId);
    return this.conciliacaoFator_.auditarContratos(orgaoId, { comFator: fator === '1' });
  }

  /** Medições aprovadas há >N dias sem liquidação no portal (badge/lista). */
  @Get('auditoria/medicoes-nao-liquidadas')
  async medicoesNaoLiquidadas(@Req() req: any, @Query('dias') dias?: string) {
    const user = req.user as JwtPayload;
    const orgaoId = this.getOrgaoId(user, req.query?.orgaoId);
    return this.conciliacaoFator_.verificarMedicoesNaoLiquidadas(
      orgaoId,
      dias ? parseInt(dias, 10) : 15,
    );
  }

  /** Dispara a verificação/notificação agora (mesmo fluxo do job diário). */
  @Post('auditoria/medicoes-nao-liquidadas/notificar')
  async notificarMedicoesNaoLiquidadas(@Req() req: any) {
    const user = req.user as JwtPayload;
    const orgaoId = this.getOrgaoId(user, req.query?.orgaoId);
    const enviadas = await this.conciliacaoScheduler.verificarOrgao(orgaoId);
    return { notificacoes_enviadas: enviadas };
  }

  /**
   * OS autorizadas sem medição, com o pagamento correspondente no portal da
   * transparência quando existir. É o que libera o lançamento retroativo da
   * medição: sem pagamento confirmado, o sistema não registra a execução.
   */
  @Get(':contratoId/ordens-sem-medicao-pagas')
  async ordensSemMedicaoPagas(
    @Param('contratoId') contratoId: string,
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user, orgaoIdParam);
    const contrato = await this.contratoRepository.findOne({
      where: { id: contratoId },
      select: [
        'id',
        'orgao_id',
        'numero_contrato',
        'fornecedor_cnpj',
        'ano',
        'processo_licitatorio_portal',
      ],
    });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    if (contrato.orgao_id !== orgaoId) {
      throw new ForbiddenException('Você não tem acesso a este contrato');
    }

    const contexto = await this.medicaoService.getContextoMedicaoRetroativa(
      contratoId,
      orgaoId,
    );
    const ordens = contexto.ordens_sem_medicao;
    if (!ordens.length) {
      return { ordens: [], consulta_portal_ok: true };
    }

    // Empenhos anotados em cada OS (o portal nem sempre cita o nº da OS)
    const requisicoes = await this.requisicaoRepository.find({
      where: { id: In(ordens.map((o) => o.id)) },
      select: ['id', 'numeros_empenhos'],
    });
    const empenhosPorOrdem = new Map<string, string[]>();
    for (const r of requisicoes) {
      const bruto: any = (r as any).numeros_empenhos;
      const lista = Array.isArray(bruto)
        ? bruto
        : typeof bruto === 'string' && bruto.trim()
          ? (() => {
              try {
                const json = JSON.parse(bruto);
                return Array.isArray(json) ? json : [bruto];
              } catch {
                return bruto.split(/[;,]/);
              }
            })()
          : [];
      empenhosPorOrdem.set(r.id, lista.map((v: any) => String(v)).filter(Boolean));
    }

    let pagamentos: any[] = [];
    let consultaOk = true;
    try {
      const empenhos = await this.fatorTransparencia.buscarEmpenhos({
        nContrato: contrato.numero_contrato,
        cpfcnpj: contrato.fornecedor_cnpj,
        ano: contrato.ano ?? new Date().getFullYear(),
        processoLicitatorioPortal: contrato.processo_licitatorio_portal ?? undefined,
      });
      pagamentos = empenhos.filter(
        (e) => e.fase_tipo === 'PAGAMENTO' && e.confirmacao !== 'NAO_CONFIRMADO',
      );
    } catch (err: any) {
      consultaOk = false;
      console.warn(
        `[ordens-sem-medicao-pagas] Portal da transparência indisponível para o contrato ${contrato.numero_contrato}: ${err?.message}`,
      );
    }

    const casados = casarPagamentosComOrdens(
      ordens.map((o) => ({
        id: o.id,
        numero: o.numero,
        valor: Number(o.valor_total_estimado || 0),
        numeros_empenhos: empenhosPorOrdem.get(o.id) || [],
      })),
      pagamentos.map((p) => ({
        numero_empenho: p.numero_empenho,
        data: p.data,
        valor: Number(p.valor || 0),
        os_citada: p.os_citada,
        bem_servico: p.bem_servico,
      })),
    );

    return {
      consulta_portal_ok: consultaOk,
      ordens: ordens.map((o) => {
        const pagamento = casados.get(o.id) || null;
        return {
          requisicao_id: o.id,
          numero: o.numero,
          data_solicitacao: o.data_solicitacao,
          valor_total_estimado: o.valor_total_estimado,
          periodo_sugerido: o.periodo_sugerido,
          pagamento: pagamento
            ? { ...pagamento, motivo: ROTULO_CRITERIO[pagamento.criterio] }
            : null,
        };
      }),
    };
  }

  @Get(':contratoId/empenhos')
  async buscarEmpenhos(
    @Param('contratoId') contratoId: string,
    @Query('ano') ano?: string,
  ) {
    const contrato = await this.contratoRepository.findOne({
      where: { id: contratoId },
      select: [
        'id',
        'numero_contrato',
        'fornecedor_cnpj',
        'ano',
        'valor_global',
        'processo_licitatorio_portal',
      ],
    });
    if (!contrato) {
      throw new NotFoundException('Contrato nÃ£o encontrado');
    }

    // Usa o ano do contrato como padrÃ£o quando nÃ£o informado pelo frontend
    const anoConsulta = ano ? parseInt(ano, 10) : (contrato.ano ?? new Date().getFullYear());

    const empenhos = await this.fatorTransparencia.buscarEmpenhos({
      nContrato: contrato.numero_contrato,
      cpfcnpj: contrato.fornecedor_cnpj,
      ano: anoConsulta,
      processoLicitatorioPortal:
        contrato.processo_licitatorio_portal ?? undefined,
    });

    const resumo = this.fatorTransparencia.calcularResumo(empenhos, {
      valor_global: Number(contrato.valor_global ?? 0),
      ano_contrato: contrato.ano ?? anoConsulta,
    });

    // Calcular comprometido por empenho (valor das requisiÃ§Ãµes ativas vinculadas)
    // Regra FIFO: debitar do empenho mais antigo primeiro; se faltar saldo, passar ao prÃ³ximo
    const statusAtivos = [
      StatusRequisicao.RASCUNHO,
      StatusRequisicao.AGUARDANDO_AUTORIZACAO,
      StatusRequisicao.AUTORIZADA,
      StatusRequisicao.ORDEM_GERADA,
      StatusRequisicao.ATENDIDA_PARCIAL,
      StatusRequisicao.ATENDIDA,
    ];
    const requisicoes = await this.requisicaoRepository.find({
      where: { contrato_id: contratoId, status: In(statusAtivos) },
      select: ['id', 'numero', 'tipo', 'numeros_empenhos', 'valor_total_estimado', 'status', 'created_at'],
      order: { created_at: 'ASC' },
    });

    // Buscar tambÃ©m ordens de fornecimento com empenhos vinculados
    const statusAtivosOrdem = [
      StatusOrdemFornecimento.EMITIDA,
      StatusOrdemFornecimento.ENVIADA,
      StatusOrdemFornecimento.EM_ATENDIMENTO,
      StatusOrdemFornecimento.ATENDIDA_PARCIAL,
      StatusOrdemFornecimento.ATENDIDA,
    ];
    const ordens = await this.ordemFornecimentoRepository.find({
      where: { contrato_id: contratoId, status: In(statusAtivosOrdem) },
      select: ['id', 'numero', 'tipo', 'numeros_empenhos', 'valor_total', 'status', 'created_at'],
      order: { created_at: 'ASC' },
    });

    // Combinar requisiÃ§Ãµes e ordens em lista unificada para cÃ¡lculo FIFO e vinculadas
    type ItemVinculado = { id: string; numero: string; tipo: string; numeros_empenhos: string[] | null; valor: number; status: string; created_at: Date; origem: 'requisicao' | 'ordem' };
    const todosItens: ItemVinculado[] = [
      ...requisicoes.map(r => ({
        id: r.id,
        numero: r.numero || '',
        tipo: r.tipo || 'MATERIAL',
        numeros_empenhos: (() => { try { const p = JSON.parse(r.numeros_empenhos || '[]'); return Array.isArray(p) ? p : null; } catch { return null; } })(),
        valor: Number(r.valor_total_estimado ?? 0),
        status: r.status,
        created_at: r.created_at,
        origem: 'requisicao' as const,
      })),
      ...ordens.map(o => ({
        id: o.id,
        numero: o.numero || '',
        tipo: o.tipo === 'SERVICO' ? 'ORDEM_SERVICO' : (o.tipo || 'FORNECIMENTO'),
        numeros_empenhos: Array.isArray(o.numeros_empenhos) ? o.numeros_empenhos : null,
        valor: Number(o.valor_total ?? 0),
        status: o.status,
        created_at: o.created_at,
        origem: 'ordem' as const,
      })),
    ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    // Mapa: numero_empenho â†’ { saldo_base (portal), comprometido acumulado }
    // Comprometido Ã© calculado por alocaÃ§Ã£o FIFO (empenho mais antigo primeiro)
    const alocacaoMap = new Map<string, { saldo_base: number; comprometido: number }>();
    for (const grupo of resumo.grupos_exercicio) {
      for (const comp of grupo.empenhos_compostos) {
        alocacaoMap.set(comp.numero_empenho, {
          saldo_base: comp.saldo_a_liquidar,
          comprometido: 0,
        });
      }
    }

    // Processar itens (requisiÃ§Ãµes + ordens) em ordem cronolÃ³gica (mais antiga primeiro)
    for (const item of todosItens) {
      if (!item.numeros_empenhos || item.numeros_empenhos.length === 0) continue;
      const nums = item.numeros_empenhos;

      // Normalizar: "534-2026" â†’ "534" para matching com numero_empenho do portal
      const numsBase = nums.map(n => n.replace(/[-/]\d{4}$/, ''));

      // Ordenar numeros_empenhos por data do empenho (mais antigo primeiro)
      const numsOrdenados = numsBase.slice().sort((a, b) => {
        const idxA = resumo.grupos_exercicio.flatMap(g => g.empenhos_compostos).findIndex(c => c.numero_empenho === a);
        const idxB = resumo.grupos_exercicio.flatMap(g => g.empenhos_compostos).findIndex(c => c.numero_empenho === b);
        return idxA - idxB;
      });

      // DÃ©bito FIFO: descontar do empenho mais antigo primeiro
      let restante = item.valor;
      for (const num of numsOrdenados) {
        if (restante <= 0.01) break;
        const alloc = alocacaoMap.get(num);
        if (!alloc) continue;
        const saldoDisponivel = alloc.saldo_base - alloc.comprometido;
        if (saldoDisponivel > 0.01) {
          const debito = Math.min(saldoDisponivel, restante);
          alloc.comprometido += debito;
          restante -= debito;
        }
      }
      // Se ainda sobrou valor (todos os empenhos sem saldo), distribuir proporcionalmente
      if (restante > 0.01) {
        const excedentePorEmpenho = restante / numsOrdenados.length;
        for (const num of numsOrdenados) {
          const alloc = alocacaoMap.get(num);
          if (alloc) alloc.comprometido += excedentePorEmpenho;
        }
      }
    }

    // Mapa: numero_empenho â†’ lista de itens vinculados (requisiÃ§Ãµes + ordens)
    const vinculadasPorEmpenho = new Map<string, Array<{ id: string; numero: string; tipo: string; status: string; valor_total_estimado: number; created_at: string }>>();
    for (const item of todosItens) {
      if (!item.numeros_empenhos || item.numeros_empenhos.length === 0) continue;
      const numsBase = item.numeros_empenhos.map(n => n.replace(/[-/]\d{4}$/, ''));
      for (const num of numsBase) {
        if (!vinculadasPorEmpenho.has(num)) vinculadasPorEmpenho.set(num, []);
        vinculadasPorEmpenho.get(num)!.push({
          id: item.id,
          numero: item.numero,
          tipo: item.tipo,
          status: item.status,
          valor_total_estimado: item.valor,
          created_at: item.created_at?.toISOString?.() ?? String(item.created_at),
        });
      }
    }

    // Adicionar comprometido, saldo_virtual e requisicoes_vinculadas em cada empenho_composto
    for (const grupo of resumo.grupos_exercicio) {
      for (const comp of grupo.empenhos_compostos) {
        const alloc = alocacaoMap.get(comp.numero_empenho);
        const comprometido = alloc?.comprometido ?? 0;
        (comp as any).comprometido = Math.round(comprometido * 100) / 100;
        (comp as any).saldo_virtual = Math.round((comp.saldo_a_liquidar - comprometido) * 100) / 100;
        (comp as any).requisicoes_vinculadas = vinculadasPorEmpenho.get(comp.numero_empenho) || [];
      }
    }

    return resumo;
  }
}
