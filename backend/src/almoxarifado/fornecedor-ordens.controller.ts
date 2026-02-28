import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  ParseUUIDPipe,
  ForbiddenException,
  BadRequestException,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { OrdemFornecimentoService } from './ordem-fornecimento.service';
import { NotaFiscalFornecedorService } from './nota-fiscal-fornecedor.service';
import { JwtPayload, UserType } from '../auth/auth.service';
import { StatusOrdemFornecimento } from './entities/ordem-fornecimento.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('fornecedor/ordens')
export class FornecedorOrdensController {
  constructor(
    private readonly ordemService: OrdemFornecimentoService,
    private readonly nfService: NotaFiscalFornecedorService,
  ) {}

  private getFornecedorId(user: JwtPayload): string {
    if (user.type !== UserType.FORNECEDOR) {
      throw new ForbiddenException('Apenas fornecedores podem acessar ordens');
    }
    return user.sub;
  }

  @Get()
  async listarOrdens(
    @Req() request: { user: JwtPayload },
    @Query('status') status?: StatusOrdemFornecimento,
  ) {
    const fornecedorId = this.getFornecedorId(request.user);
    return this.ordemService.findByFornecedor(fornecedorId, status);
  }

  @Get(':id')
  async getOrdem(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const fornecedorId = this.getFornecedorId(request.user);
    const ordem = await this.ordemService.findOne(id);

    if (ordem.fornecedor_id !== fornecedorId) {
      throw new ForbiddenException('Esta ordem não pertence ao seu cadastro');
    }

    return ordem;
  }

  @Post(':id/ciencia-recebimento')
  async cienciaRecebimento(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @Body() body: { observacao?: string },
  ) {
    const fornecedorId = this.getFornecedorId(request.user);
    return this.ordemService.fornecedorCienciaRecebimento(
      id,
      fornecedorId,
      body.observacao,
    );
  }

  @Post(':id/ciencia-entrega')
  async cienciaEntrega(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @Body() body: { data_entrega: string; observacao?: string },
  ) {
    const fornecedorId = this.getFornecedorId(request.user);

    if (!body.data_entrega) {
      throw new BadRequestException('Data de entrega é obrigatória');
    }

    const dataEntrega = new Date(body.data_entrega);
    if (isNaN(dataEntrega.getTime())) {
      throw new BadRequestException('Data de entrega inválida');
    }

    return this.ordemService.fornecedorCienciaEntrega(
      id,
      fornecedorId,
      dataEntrega,
      body.observacao,
    );
  }

  @Post(':id/nota-fiscal')
  @UseInterceptors(
    FilesInterceptor('arquivos', 10, {
      storage: multer.diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = path.join(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'), 'notas-fiscais');
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `nf-${uniqueSuffix}${path.extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowed = [
          'text/xml', 'application/xml',
          'application/pdf',
          'image/jpeg', 'image/png', 'image/jpg',
        ];
        if (allowed.includes(file.mimetype) || file.originalname.endsWith('.xml')) {
          cb(null, true);
        } else {
          cb(new Error('Tipo de arquivo não permitido. Aceitos: XML, PDF, JPG, PNG'), false);
        }
      },
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  async uploadNotaFiscal(
    @Param('id', ParseUUIDPipe) ordemId: string,
    @Req() request: { user: JwtPayload },
    @UploadedFiles() arquivos: Express.Multer.File[],
  ) {
    const fornecedorId = this.getFornecedorId(request.user);

    const xmlFile = arquivos?.find(f => 
      f.mimetype.includes('xml') || f.originalname.endsWith('.xml')
    );
    const pdfFile = arquivos?.find(f => f.mimetype === 'application/pdf');
    const outrosArquivos = arquivos?.filter(f => 
      f !== xmlFile && f !== pdfFile
    ) || [];

    if (!xmlFile) {
      throw new BadRequestException('Arquivo XML é obrigatório');
    }
    if (!pdfFile) {
      throw new BadRequestException('Arquivo PDF da nota fiscal é obrigatório');
    }

    const ordem = await this.ordemService.findOne(ordemId);
    if (ordem.fornecedor_id !== fornecedorId) {
      throw new ForbiddenException('Esta ordem não pertence ao seu cadastro');
    }

    return this.nfService.upload(
      ordemId,
      fornecedorId,
      ordem.orgao_id,
      xmlFile,
      pdfFile,
      outrosArquivos,
    );
  }

  @Get(':id/nota-fiscal')
  async getNotaFiscal(
    @Param('id', ParseUUIDPipe) ordemId: string,
    @Req() request: { user: JwtPayload },
  ) {
    const fornecedorId = this.getFornecedorId(request.user);
    const ordem = await this.ordemService.findOne(ordemId);
    if (ordem.fornecedor_id !== fornecedorId) {
      throw new ForbiddenException('Esta ordem não pertence ao seu cadastro');
    }
    return this.nfService.findByOrdem(ordemId);
  }
}
