import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Body,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AcessoLicitacaoService, AtorAtual, SomenteFornecedor, ehUuid } from '../auth/acesso';
import type { Ator } from '../auth/acesso';
import { Contrato } from '../contratos/entities/contrato.entity';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MedicaoIaService } from './medicao-ia.service';
import type { CriarRascunhoDto } from './dto/medicao-ia.dto';

const ALLOWED_MIMES = [
  'application/pdf',
  'application/xml',
  'text/xml',
  'image/jpeg',
  'image/jpg',
  'image/png',
];

/**
 * Módulo piloto: Extração de dados de Nota Fiscal por IA para auto-preenchimento
 * do boletim de medição.
 *
 * Rota base: /api/medicao-ia
 *
 * SEGURANÇA: só fornecedor; identidade = token (fornecedor_id do corpo só é
 * aceito se igual ao do token) e o contrato precisa ser dele (senão 404).
 */
@Controller('medicao-ia')
@SomenteFornecedor()
export class MedicaoIaController {
  constructor(
    private readonly medicaoIaService: MedicaoIaService,
    private readonly acesso: AcessoLicitacaoService,
    @InjectRepository(Contrato)
    private readonly contratoRepo: Repository<Contrato>,
  ) {}

  /** Contrato do fornecedor do token (senão 404). */
  private async assertContratoDoFornecedor(contratoId: string, fornecedorId: string) {
    const existe = ehUuid(contratoId)
      ? (await this.contratoRepo.count({ where: { id: contratoId, fornecedor_id: fornecedorId } })) > 0
      : false;
    if (!existe) throw new NotFoundException('Contrato não encontrado');
  }

  /**
   * Extrai dados de uma Nota Fiscal (PDF DANFE ou XML NF-e) usando IA.
   * Retorna campos pré-preenchidos, validações e sugestões de discriminação.
   *
   * POST /api/medicao-ia/extrair-nf
   * Body: multipart/form-data
   *   file: PDF, XML ou imagem da NF
   *   contrato_id: ID do contrato
   *   fornecedor_id: ID do fornecedor
   *   fornecedor_cnpj: CNPJ do fornecedor para validação
   */
  @Post('extrair-nf')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: (_, file, cb) => {
        if (ALLOWED_MIMES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException(`Tipo de arquivo não suportado: ${file.mimetype}. Use PDF, XML ou imagem.`), false);
        }
      },
    }),
  )
  async extrairNF(
    @UploadedFile() file: Express.Multer.File,
    @Body('contrato_id') contratoId: string,
    @Body('fornecedor_id') fornecedorIdInformado: string,
    @Body('fornecedor_cnpj') fornecedorCnpj: string,
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.acesso.fornecedorDoToken(ator, fornecedorIdInformado);
    if (!file) {
      throw new BadRequestException('Arquivo da NF é obrigatório');
    }
    if (!contratoId) {
      throw new BadRequestException('contrato_id é obrigatório');
    }
    await this.assertContratoDoFornecedor(contratoId, fornecedorId);

    return this.medicaoIaService.extrairNF(file, contratoId, fornecedorCnpj || '');
  }

  /**
   * Cria um rascunho de medição com os dados extraídos/revisados pelo fornecedor.
   * O rascunho ficará com status RASCUNHO e o fornecedor poderá continuar pelo
   * fluxo normal em /fornecedor/contratos/:id.
   *
   * POST /api/medicao-ia/criar-rascunho
   */
  @Post('criar-rascunho')
  async criarRascunho(@Body() dto: CriarRascunhoDto, @AtorAtual() ator: Ator) {
    const fornecedorId = this.acesso.fornecedorDoToken(ator, dto?.fornecedor_id);
    if (!dto.contrato_id) {
      throw new BadRequestException('contrato_id é obrigatório');
    }
    await this.assertContratoDoFornecedor(dto.contrato_id, fornecedorId);
    dto.fornecedor_id = fornecedorId;
    if (!dto.periodo_inicio || !dto.periodo_fim) {
      throw new BadRequestException('Período de início e fim são obrigatórios');
    }

    return this.medicaoIaService.criarRascunho(dto);
  }
}
