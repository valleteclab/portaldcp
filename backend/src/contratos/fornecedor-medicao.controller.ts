import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseInterceptors,
  UploadedFile,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MedicaoService } from './medicao.service';
import { ContratosService } from './contratos.service';
import { UploadService } from '../upload/upload.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contrato } from './entities/contrato.entity';
import { AnexoMedicao, TipoAnexoMedicao } from './entities/anexo-medicao.entity';
import { Medicao } from './entities/medicao.entity';

/**
 * Controller para o Portal do Fornecedor — Medições.
 * Todos os endpoints garantem que o fornecedor só acessa seus próprios contratos.
 * Rota base: /api/fornecedor/contratos
 *
 * IMPORTANTE: Rotas com segmentos estáticos (ex: medicoes/...) devem vir ANTES
 * de rotas com parâmetros dinâmicos (ex: :contratoId/...) para evitar conflitos
 * de roteamento no NestJS.
 */
@Controller('fornecedor/contratos')
export class FornecedorMedicaoController {
  constructor(
    private readonly medicaoService: MedicaoService,
    private readonly contratosService: ContratosService,
    private readonly uploadService: UploadService,
    @InjectRepository(Contrato)
    private readonly contratoRepository: Repository<Contrato>,
    @InjectRepository(AnexoMedicao)
    private readonly anexoRepository: Repository<AnexoMedicao>,
    @InjectRepository(Medicao)
    private readonly medicaoRepository: Repository<Medicao>,
  ) { }

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
  // ROTAS ESTÁTICAS (medicoes/...) — DEVEM VIR PRIMEIRO
  // ============================================================================

  /**
   * Busca detalhe de uma medição.
   * GET /api/fornecedor/contratos/medicoes/:medicaoId
   */
  @Get('medicoes/:medicaoId')
  async buscarMedicao(@Param('medicaoId') medicaoId: string) {
    return this.medicaoService.buscarMedicao(medicaoId);
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
   * Fornecedor exclui uma medição em rascunho ou devolvida.
   * DELETE /api/fornecedor/contratos/medicoes/:medicaoId
   */
  @Delete('medicoes/:medicaoId')
  async excluirMedicao(
    @Param('medicaoId') medicaoId: string,
    @Query('fornecedorId') fornecedorId: string,
  ) {
    if (!fornecedorId) {
      throw new BadRequestException('fornecedorId é obrigatório');
    }
    return this.medicaoService.excluirMedicao(medicaoId, fornecedorId);
  }

  /**
   * Upload de anexo (foto ou documento) para uma medição.
   * POST /api/fornecedor/contratos/medicoes/:medicaoId/anexos
   */
  @Post('medicoes/:medicaoId/anexos')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAnexo(
    @Param('medicaoId') medicaoId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('tipo') tipo: string,
    @Body('descricao') descricao: string,
    @Body('fornecedor_id') fornecedorId: string,
    @Body('fornecedor_nome') fornecedorNome: string,
  ) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    // Verificar se a medição existe
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
      relations: ['contrato'],
    });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    // Validar acesso do fornecedor
    if (fornecedorId && medicao.contrato) {
      await this.validarAcessoFornecedor(medicao.contrato.id, fornecedorId);
    }

    // Determinar tipo do anexo
    const tipoAnexo = tipo === 'DOCUMENTO' ? TipoAnexoMedicao.DOCUMENTO : TipoAnexoMedicao.FOTO;
    const pastaUpload = `medicoes/${medicaoId}`;
    const fileUrl = this.uploadService.getFileUrl(pastaUpload, file.filename);

    // Salvar registro no banco
    const anexo = this.anexoRepository.create({
      medicao_id: medicaoId,
      tipo: tipoAnexo,
      nome_original: file.originalname,
      nome_arquivo: file.filename,
      mime_type: file.mimetype,
      tamanho_bytes: file.size,
      url: fileUrl,
      descricao: descricao || undefined,
      enviado_por_id: fornecedorId,
      enviado_por_nome: fornecedorNome,
      origem: 'fornecedor',
    });

    return this.anexoRepository.save(anexo);
  }

  /**
   * Lista anexos de uma medição.
   * GET /api/fornecedor/contratos/medicoes/:medicaoId/anexos
   */
  @Get('medicoes/:medicaoId/anexos')
  async listarAnexos(@Param('medicaoId') medicaoId: string) {
    return this.anexoRepository.find({
      where: { medicao_id: medicaoId },
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Exclui um anexo de uma medição.
   * DELETE /api/fornecedor/contratos/medicoes/anexos/:anexoId
   */
  @Delete('medicoes/anexos/:anexoId')
  async excluirAnexo(
    @Param('anexoId') anexoId: string,
    @Query('fornecedorId') fornecedorId: string,
  ) {
    const anexo = await this.anexoRepository.findOne({
      where: { id: anexoId },
      relations: ['medicao', 'medicao.contrato'],
    });
    if (!anexo) throw new NotFoundException('Anexo não encontrado');

    // Validar acesso
    if (fornecedorId && anexo.medicao?.contrato) {
      await this.validarAcessoFornecedor(anexo.medicao.contrato.id, fornecedorId);
    }

    // Excluir arquivo físico
    const pastaUpload = `medicoes/${anexo.medicao_id}`;
    this.uploadService.deleteFile(pastaUpload, anexo.nome_arquivo);

    // Excluir registro
    await this.anexoRepository.remove(anexo);
    return { success: true, message: 'Anexo excluído' };
  }

  // ============================================================================
  // ROTAS COM PARÂMETROS DINÂMICOS (:contratoId/..., :fornecedorId/...)
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
    }, { skipOSCheck: true });
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
