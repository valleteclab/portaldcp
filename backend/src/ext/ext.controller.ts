import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { createReadStream } from 'fs';
import type { Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { Public } from '../auth/public.decorator';
import {
  ApiErrorResponseDto,
  CienciaEntregaRequestDto,
  CienciaRecebimentoRequestDto,
  ContratoDetalheResponseDto,
  ContratoResumoResponseDto,
  CriarMedicaoRequestDto,
  FornecedorMeResponseDto,
  MedicaoResponseDto,
  OrdemResponseDto,
  UploadMedicaoDocumentoDto,
  UploadNotaFiscalOrdemDto,
} from './dto/fornecedor-api.dto';
import { FornecedorApiService } from './fornecedor-api.service';
import { StatusOrdemFornecimento } from '../almoxarifado/entities/ordem-fornecimento.entity';

const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
const MEDICAO_ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/png'];
const MEDICAO_ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];
const NF_ALLOWED_MIMES = [
  'text/xml',
  'application/xml',
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/jpg',
];

@Public()
@ApiTags('Fornecedor API')
@ApiSecurity('X-Api-Key')
@ApiHeader({
  name: 'X-Api-Key',
  required: true,
  description: 'Chave de API do fornecedor.',
})
@ApiUnauthorizedResponse({ description: 'API key ausente, invalida ou revogada.', type: ApiErrorResponseDto })
@ApiForbiddenResponse({ description: 'Recurso nao pertence ao fornecedor autenticado.', type: ApiErrorResponseDto })
@Controller('ext/v1')
@UseGuards(ApiKeyGuard)
export class ExtController {
  constructor(private readonly fornecedorApi: FornecedorApiService) {}

  @Get('me')
  @ApiOperation({ summary: 'Valida a API key e retorna o fornecedor autenticado' })
  @ApiOkResponse({ type: FornecedorMeResponseDto })
  getMe(@Req() req: any) {
    return this.fornecedorApi.getMe(req.fornecedor);
  }

  @Get('contratos')
  @ApiTags('Contratos')
  @ApiOperation({ summary: 'Lista contratos vinculados ao fornecedor autenticado' })
  @ApiOkResponse({ type: [ContratoResumoResponseDto] })
  listarContratos(@Req() req: any) {
    return this.fornecedorApi.listarContratos(req.fornecedor.id);
  }

  @Get('contratos/:id')
  @ApiTags('Contratos')
  @ApiOperation({ summary: 'Retorna detalhes de contrato, cronograma e ultimas medicoes' })
  @ApiParam({ name: 'id', description: 'UUID do contrato' })
  @ApiOkResponse({ type: ContratoDetalheResponseDto })
  @ApiNotFoundResponse({ description: 'Contrato nao encontrado.', type: ApiErrorResponseDto })
  getContrato(@Param('id') id: string, @Req() req: any) {
    return this.fornecedorApi.getContrato(id, req.fornecedor.id);
  }

  @Post('contratos/:id/medicoes')
  @ApiTags('Medições')
  @ApiOperation({ summary: 'Cria uma medicao para o contrato autenticado' })
  @ApiParam({ name: 'id', description: 'UUID do contrato' })
  @ApiBody({ type: CriarMedicaoRequestDto })
  @ApiOkResponse({ type: MedicaoResponseDto })
  @ApiBadRequestResponse({ description: 'Dados invalidos para criacao de medicao.', type: ApiErrorResponseDto })
  criarMedicao(
    @Param('id') contratoId: string,
    @Body() body: CriarMedicaoRequestDto,
    @Req() req: any,
  ) {
    return this.fornecedorApi.criarMedicao(contratoId, req.fornecedor, body);
  }

  @Post('medicoes/:id/enviar')
  @ApiTags('Medições')
  @ApiOperation({ summary: 'Assina programaticamente e submete a medicao ao fiscal' })
  @ApiParam({ name: 'id', description: 'UUID da medicao' })
  @ApiOkResponse({ type: MedicaoResponseDto })
  enviarMedicao(@Param('id') medicaoId: string, @Req() req: any) {
    return this.fornecedorApi.submeterMedicao(
      medicaoId,
      req.fornecedor,
      undefined,
      req.headers['x-api-key'],
    );
  }

  @Get('medicoes/:id')
  @ApiTags('Medições')
  @ApiOperation({ summary: 'Consulta o status e dados principais de uma medicao' })
  @ApiParam({ name: 'id', description: 'UUID da medicao' })
  @ApiOkResponse({ type: MedicaoResponseDto })
  getMedicao(@Param('id') medicaoId: string, @Req() req: any) {
    return this.fornecedorApi.getMedicao(medicaoId, req.fornecedor.id);
  }

  @Post('medicoes/:id/documentos')
  @ApiTags('Medições')
  @ApiOperation({ summary: 'Anexa documento, foto ou nota fiscal a uma medicao' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadMedicaoDocumentoDto })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const pasta = join(uploadDir, `medicoes/${req.params.id}`);
          fs.mkdirSync(pasta, { recursive: true });
          cb(null, pasta);
        },
        filename: (req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, cb: any) => {
        const ext = extname(file.originalname).toLowerCase();
        if (!MEDICAO_ALLOWED_MIMES.includes(file.mimetype) || !MEDICAO_ALLOWED_EXTENSIONS.includes(ext)) {
          return cb(new BadRequestException('Tipo de arquivo nao permitido. Use PDF, JPG ou PNG.'), false);
        }
        cb(null, true);
      },
    }),
  )
  uploadDocumento(
    @Param('id') medicaoId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('tipo') tipo: string,
    @Body('descricao') descricao: string,
    @Req() req: any,
  ) {
    return this.fornecedorApi.salvarDocumentoMedicao(
      medicaoId,
      req.fornecedor,
      file,
      tipo,
      descricao,
    );
  }

  @Get('medicoes/:id/documentos')
  @ApiTags('Medições')
  @ApiOperation({ summary: 'Lista anexos de uma medicao' })
  @ApiParam({ name: 'id', description: 'UUID da medicao' })
  listarDocumentosMedicao(@Param('id') medicaoId: string, @Req() req: any) {
    return this.fornecedorApi.listarAnexosMedicao(medicaoId, req.fornecedor.id);
  }

  @Get('medicoes/:id/boletim-pdf')
  @ApiTags('Medições')
  @ApiOperation({ summary: 'Download do boletim de medicao em PDF' })
  @ApiParam({ name: 'id', description: 'UUID da medicao' })
  async downloadBoletimPdf(
    @Param('id') medicaoId: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { filePath, numero_medicao } = await this.fornecedorApi.getBoletimPdf(
      medicaoId,
      req.fornecedor.id,
    );
    const filename = `boletim_medicao_${numero_medicao || medicaoId}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    const stream = createReadStream(filePath);
    stream.pipe(res);
  }

  @Get('ordens')
  @ApiTags('Ordens')
  @ApiOperation({ summary: 'Lista ordens do fornecedor autenticado' })
  @ApiQuery({ name: 'status', required: false, enum: StatusOrdemFornecimento })
  @ApiQuery({ name: 'contratoId', required: false })
  @ApiOkResponse({ type: [OrdemResponseDto] })
  listarOrdens(
    @Req() req: any,
    @Query('status') status?: StatusOrdemFornecimento,
    @Query('contratoId') contratoId?: string,
  ) {
    return this.fornecedorApi.listarOrdens(req.fornecedor.id, status, contratoId);
  }

  @Get('ordens/:id')
  @ApiTags('Ordens')
  @ApiOperation({ summary: 'Consulta uma ordem do fornecedor autenticado' })
  @ApiParam({ name: 'id', description: 'UUID da ordem' })
  @ApiOkResponse({ type: OrdemResponseDto })
  getOrdem(@Param('id') ordemId: string, @Req() req: any) {
    return this.fornecedorApi.getOrdem(ordemId, req.fornecedor.id);
  }

  @Post('ordens/:id/ciencia-recebimento')
  @ApiTags('Ordens')
  @ApiOperation({ summary: 'Registra ciencia de recebimento da ordem' })
  @ApiBody({ type: CienciaRecebimentoRequestDto })
  cienciaRecebimento(
    @Param('id') ordemId: string,
    @Body() body: CienciaRecebimentoRequestDto,
    @Req() req: any,
  ) {
    return this.fornecedorApi.cienciaRecebimento(ordemId, req.fornecedor.id, body.observacao);
  }

  @Post('ordens/:id/ciencia-entrega')
  @ApiTags('Ordens')
  @ApiOperation({ summary: 'Registra ciencia de entrega da ordem' })
  @ApiBody({ type: CienciaEntregaRequestDto })
  cienciaEntrega(
    @Param('id') ordemId: string,
    @Body() body: CienciaEntregaRequestDto,
    @Req() req: any,
  ) {
    return this.fornecedorApi.cienciaEntrega(
      ordemId,
      req.fornecedor.id,
      body.data_entrega,
      body.observacao,
    );
  }

  @Post('ordens/:id/nota-fiscal')
  @ApiTags('Notas Fiscais')
  @ApiOperation({ summary: 'Envia XML, PDF e anexos de nota fiscal para uma ordem' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadNotaFiscalOrdemDto })
  @UseInterceptors(
    FilesInterceptor('arquivos', 10, {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const pasta = join(uploadDir, 'notas-fiscais');
          fs.mkdirSync(pasta, { recursive: true });
          cb(null, pasta);
        },
        filename: (req, file, cb) => {
          cb(null, `nf-${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 15 * 1024 * 1024 },
      fileFilter: (req, file, cb: any) => {
        if (NF_ALLOWED_MIMES.includes(file.mimetype) || file.originalname.toLowerCase().endsWith('.xml')) {
          return cb(null, true);
        }
        cb(new BadRequestException('Tipo de arquivo nao permitido. Aceitos: XML, PDF, JPG, PNG'), false);
      },
    }),
  )
  uploadNotaFiscal(
    @Param('id') ordemId: string,
    @UploadedFiles() arquivos: Express.Multer.File[],
    @Req() req: any,
  ) {
    return this.fornecedorApi.uploadNotaFiscalOrdem(ordemId, req.fornecedor.id, arquivos);
  }

  @Get('ordens/:id/nota-fiscal')
  @ApiTags('Notas Fiscais')
  @ApiOperation({ summary: 'Consulta a nota fiscal mais recente de uma ordem' })
  getNotaFiscal(@Param('id') ordemId: string, @Req() req: any) {
    return this.fornecedorApi.getNotaFiscalOrdem(ordemId, req.fornecedor.id);
  }

  @Get('ordens/:id/notas-fiscais')
  @ApiTags('Notas Fiscais')
  @ApiOperation({ summary: 'Lista todas as notas fiscais de uma ordem' })
  getNotasFiscais(@Param('id') ordemId: string, @Req() req: any) {
    return this.fornecedorApi.listarNotasFiscaisOrdem(ordemId, req.fornecedor.id);
  }
}
