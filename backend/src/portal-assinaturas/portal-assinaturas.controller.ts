import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ParseUUIDPipe,
  Ip,
  Headers,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { PortalAssinaturasService } from './portal-assinaturas.service';
import { CriarDocumentoDto } from './dto/criar-documento.dto';

// Configuração de upload para PDFs
const pdfStorage = diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
    const docPath = join(uploadPath, 'documentos_assinatura_avulsos');
    const fs = require('fs');
    if (!fs.existsSync(docPath)) {
      fs.mkdirSync(docPath, { recursive: true });
    }
    cb(null, docPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `doc-${uniqueSuffix}${extname(file.originalname)}`);
  },
});

@Controller('portal-assinaturas')
@UseGuards(JwtAuthGuard)
@RequireModule(ModuloSistema.PORTAL_ASSINATURAS)
export class PortalAssinaturasController {
  constructor(private readonly portalAssinaturasService: PortalAssinaturasService) {}

  @Get()
  async listar(@Request() req: any) {
    const orgaoId = req.user.orgao_id;
    return this.portalAssinaturasService.listarDocumentos(orgaoId);
  }

  @Get('meus/pendentes')
  async listarMeusPendentes(@Request() req: any) {
    const orgaoId = req.user.orgao_id;
    const usuarioEmail = req.user.email;
    return this.portalAssinaturasService.listarPendentesDoUsuario(orgaoId, usuarioEmail);
  }

  @Get(':id')
  async obter(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const orgaoId = req.user.orgao_id;
    return this.portalAssinaturasService.obterDocumento(id, orgaoId);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('arquivo', {
      storage: pdfStorage,
      fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          return cb(new BadRequestException('Apenas arquivos PDF são permitidos!'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  async criar(
    @Request() req: any,
    @UploadedFile() arquivo: Express.Multer.File,
    @Body('dados') dadosString: string,
  ) {
    if (!arquivo) {
      throw new BadRequestException('O arquivo PDF é obrigatório.');
    }

    if (!dadosString) {
      throw new BadRequestException('Os dados do documento são obrigatórios.');
    }

    let dados: CriarDocumentoDto;
    try {
      dados = JSON.parse(dadosString);
    } catch (e) {
      throw new BadRequestException('Formato de dados inválido (deve ser JSON JSON.stringify).');
    }

    const orgaoId = req.user.orgao_id;
    const usuarioId = req.user.sub;
    
    // Caminho relativo a partir da pasta uploads
    const arquivoUrl = `documentos_assinatura_avulsos/${arquivo.filename}`;

    const documento = await this.portalAssinaturasService.criarDocumento(
      orgaoId,
      usuarioId,
      dados,
      arquivoUrl,
    );

    // Disparar notificações (assíncrono)
    this.portalAssinaturasService.dispararNotificacoesAssinatura(documento.id).catch(e => 
      console.error(`Erro ao disparar notificações: ${e.message}`)
    );

    return documento;
  }

  @Post(':documentoId/signatarios/:signatarioId/assinar')
  async assinarComoOrgaoUser(
    @Request() req: any,
    @Param('documentoId', ParseUUIDPipe) documentoId: string,
    @Param('signatarioId', ParseUUIDPipe) signatarioId: string,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    const usuarioId = req.user.sub;
    return this.portalAssinaturasService.assinarComoOrgaoUser(
      documentoId,
      signatarioId,
      usuarioId,
      ip,
      userAgent || '',
    );
  }
}