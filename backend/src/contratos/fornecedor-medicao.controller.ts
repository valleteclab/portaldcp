import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MedicaoService } from './medicao.service';
import { ContratosService } from './contratos.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contrato } from './entities/contrato.entity';

/**
 * Controller para o Portal do Fornecedor — Medições.
 * Todos os endpoints garantem que o fornecedor só acessa seus próprios contratos.
 * Rota base: /api/fornecedor/contratos
 */
@Controller('fornecedor/contratos')
export class FornecedorMedicaoController {
  constructor(
    private readonly medicaoService: MedicaoService,
    private readonly contratosService: ContratosService,
    @InjectRepository(Contrato)
    private readonly contratoRepository: Repository<Contrato>,
  ) {}

  /**
   * Valida que o fornecedor é dono do contrato.
   */
  private async validarAcessoFornecedor(contratoId: string, fornecedorId: string): Promise<Contrato> {
    const contrato = await this.contratoRepository.findOne({
      where: { id: contratoId },
      relations: ['orgao'],
    });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    if (contrato.fornecedor_id !== fornecedorId) {
      throw new ForbiddenException('Você não tem acesso a este contrato');
    }
    return contrato;
  }

  // ============================================================================
  // CONTRATOS DO FORNECEDOR (com dados de medição)
  // ============================================================================

  /**
   * Lista contratos de medição do fornecedor com resumo.
   * GET /api/fornecedor/contratos/:fornecedorId/medicao
   */
  @Get(':fornecedorId/medicao')
  async listarContratosMedicao(@Param('fornecedorId') fornecedorId: string) {
    const contratos = await this.contratoRepository.find({
      where: {
        fornecedor_id: fornecedorId,
        modalidade_execucao: 'MEDICAO' as any,
      },
      relations: ['orgao'],
      order: { created_at: 'DESC' },
    });

    // Para cada contrato, buscar resumo de medições
    const resultado = [];
    for (const contrato of contratos) {
      try {
        const resumo = await this.medicaoService.resumoMedicoes(contrato.id);
        resultado.push({
          ...contrato,
          resumo_medicoes: resumo,
        });
      } catch {
        resultado.push({
          ...contrato,
          resumo_medicoes: null,
        });
      }
    }

    return resultado;
  }

  // ============================================================================
  // CONTRATO INDIVIDUAL DO FORNECEDOR
  // ============================================================================

  /**
   * Busca um contrato individual do fornecedor.
   * GET /api/fornecedor/contratos/:contratoId/detalhe?fornecedorId=X
   */
  @Get(':contratoId/detalhe')
  async buscarContrato(
    @Param('contratoId') contratoId: string,
    @Query('fornecedorId') fornecedorId: string,
  ) {
    const contrato = await this.contratoRepository.findOne({
      where: { id: contratoId },
      relations: ['orgao'],
    });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    if (fornecedorId && contrato.fornecedor_id !== fornecedorId) {
      throw new ForbiddenException('Você não tem acesso a este contrato');
    }
    return contrato;
  }

  // ============================================================================
  // ETAPAS DO CRONOGRAMA (read-only para fornecedor)
  // ============================================================================

  /**
   * Lista etapas do cronograma de um contrato.
   * GET /api/fornecedor/contratos/:contratoId/etapas?fornecedorId=X
   */
  @Get(':contratoId/etapas')
  async listarEtapas(
    @Param('contratoId') contratoId: string,
    @Query('fornecedorId') fornecedorId: string,
  ) {
    if (fornecedorId) {
      await this.validarAcessoFornecedor(contratoId, fornecedorId);
    }
    return this.medicaoService.listarEtapas(contratoId);
  }

  // ============================================================================
  // MEDIÇÕES DO FORNECEDOR
  // ============================================================================

  /**
   * Lista medições de um contrato (filtrado pelo fornecedor).
   * GET /api/fornecedor/contratos/:contratoId/medicoes?fornecedorId=X
   */
  @Get(':contratoId/medicoes')
  async listarMedicoes(
    @Param('contratoId') contratoId: string,
  ) {
    return this.medicaoService.listarMedicoes(contratoId);
  }

  /**
   * Busca detalhe de uma medição.
   * GET /api/fornecedor/contratos/medicoes/:medicaoId
   */
  @Get('medicoes/:medicaoId')
  async buscarMedicao(@Param('medicaoId') medicaoId: string) {
    return this.medicaoService.buscarMedicao(medicaoId);
  }

  /**
   * Fornecedor cria um rascunho de medição.
   * POST /api/fornecedor/contratos/:contratoId/medicoes
   */
  @Post(':contratoId/medicoes')
  async criarMedicao(
    @Param('contratoId') contratoId: string,
    @Body() dados: any,
  ) {
    // Validar acesso
    if (dados.fornecedor_id) {
      await this.validarAcessoFornecedor(contratoId, dados.fornecedor_id);
    }

    return this.medicaoService.criarMedicao(contratoId, {
      ...dados,
      usuario_cadastro_id: dados.fornecedor_id,
      usuario_cadastro_nome: dados.fornecedor_nome,
    });
  }

  /**
   * Fornecedor submete a medição para análise do fiscal.
   * PATCH /api/fornecedor/contratos/medicoes/:medicaoId/submeter
   */
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

  /**
   * Resumo de medições de um contrato.
   * GET /api/fornecedor/contratos/:contratoId/medicoes/resumo
   */
  @Get(':contratoId/medicoes/resumo')
  async resumoMedicoes(@Param('contratoId') contratoId: string) {
    return this.medicaoService.resumoMedicoes(contratoId);
  }
}
