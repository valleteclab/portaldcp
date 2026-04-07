import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MedicaoIaService } from './medicao-ia.service';
import { CriarRascunhoDto } from './dto/medicao-ia.dto';

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
 */
@Controller('medicao-ia')
export class MedicaoIaController {
  constructor(private readonly medicaoIaService: MedicaoIaService) {}

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
    @Body('fornecedor_id') _fornecedorId: string,
    @Body('fornecedor_cnpj') fornecedorCnpj: string,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo da NF é obrigatório');
    }
    if (!contratoId) {
      throw new BadRequestException('contrato_id é obrigatório');
    }

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
  async criarRascunho(@Body() dto: CriarRascunhoDto) {
    if (!dto.contrato_id || !dto.fornecedor_id) {
      throw new BadRequestException('contrato_id e fornecedor_id são obrigatórios');
    }
    if (!dto.periodo_inicio || !dto.periodo_fim) {
      throw new BadRequestException('Período de início e fim são obrigatórios');
    }

    return this.medicaoIaService.criarRascunho(dto);
  }
}
