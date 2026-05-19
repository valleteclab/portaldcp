import {
  Controller,
  Post,
  Get,
  Delete,
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
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { AssinadorService } from './assinador.service';

const pdfStorage = diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
    const docPath = join(uploadPath, 'documentos_assinatura_avulsos');
    const fs = require('fs');
    if (!fs.existsSync(docPath)) fs.mkdirSync(docPath, { recursive: true });
    cb(null, docPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `doc-${uniqueSuffix}${extname(file.originalname)}`);
  },
});

@Controller('assinador')
@UseGuards(JwtAuthGuard)
export class AssinadorController {
  constructor(private readonly assinadorService: AssinadorService) {}

  private getOrgaoId(user: any): string {
    if (user.type === 'ORGAO') return user.sub;
    return user.orgaoId || user.orgao_id || user.sub;
  }

  @Get('kpis')
  async kpis(@Request() req: any) {
    return this.assinadorService.obterKpis(this.getOrgaoId(req.user), req.user.email);
  }

  @Get('meus/pendentes')
  async pendentes(@Request() req: any) {
    return this.assinadorService.listarPendentes(this.getOrgaoId(req.user), req.user.email);
  }

  @Get('auditoria')
  async auditoria(
    @Request() req: any,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.assinadorService.obterAuditoria(this.getOrgaoId(req.user), +page, +limit);
  }

  @Get('usuarios')
  async usuarios(@Request() req: any, @Query('q') q?: string) {
    return this.assinadorService.buscarUsuariosOrg(this.getOrgaoId(req.user), q);
  }

  @Get('validar/:codigo')
  @Public()
  async validar(@Param('codigo') codigo: string) {
    return this.assinadorService.validarDocumentoPorCodigo(codigo);
  }

  @Get(':id')
  async obter(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.assinadorService.obterDocumento(id, this.getOrgaoId(req.user));
  }

  @Get()
  async listar(@Request() req: any) {
    return this.assinadorService.listarDocumentos(this.getOrgaoId(req.user));
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
      limits: { fileSize: 25 * 1024 * 1024 }, // 25MB (design spec)
    }),
  )
  async criar(
    @Request() req: any,
    @UploadedFile() arquivo: Express.Multer.File,
    @Body('dados') dadosString: string,
  ) {
    if (!arquivo) throw new BadRequestException('O arquivo PDF é obrigatório.');
    if (!dadosString) throw new BadRequestException('Os dados do documento são obrigatórios.');

    let dados: any;
    try {
      dados = JSON.parse(dadosString);
    } catch {
      throw new BadRequestException('Formato de dados inválido.');
    }

    const orgaoId = this.getOrgaoId(req.user);
    const usuarioId = req.user.sub;
    const arquivoUrl = `documentos_assinatura_avulsos/${arquivo.filename}`;

    const documento = await this.assinadorService.criarDocumento(orgaoId, usuarioId, dados, arquivoUrl);

    this.assinadorService.dispararNotificacoes(documento.id).catch(e =>
      console.error(`Erro ao disparar notificações: ${e.message}`),
    );

    return documento;
  }

  @Post(':documentoId/signatarios/:signatarioId/solicitar-otp')
  async solicitarOtp(
    @Request() req: any,
    @Param('documentoId', ParseUUIDPipe) documentoId: string,
    @Param('signatarioId', ParseUUIDPipe) signatarioId: string,
  ) {
    return this.assinadorService.solicitarOtp(documentoId, signatarioId, req.user);
  }

  @Post(':documentoId/signatarios/:signatarioId/assinar')
  async assinar(
    @Request() req: any,
    @Param('documentoId', ParseUUIDPipe) documentoId: string,
    @Param('signatarioId', ParseUUIDPipe) signatarioId: string,
    @Body() body: { codigo_otp?: string },
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.assinadorService.assinarDocumento(
      documentoId, signatarioId, req.user, ip, userAgent || '', body?.codigo_otp,
    );
  }

  @Delete(':id')
  async excluir(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.assinadorService.excluirDocumento(id, this.getOrgaoId(req.user));
  }

  @Delete(':id/cancelar')
  async cancelar(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.assinadorService.cancelarDocumento(id, this.getOrgaoId(req.user));
  }

  @Post(':id/reenviar')
  async reenviar(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.assinadorService.reenviarNotificacoes(id, this.getOrgaoId(req.user));
  }

  @Post(':id/signatarios')
  async adicionarSignatario(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: any,
  ) {
    return this.assinadorService.adicionarSignatario(id, this.getOrgaoId(req.user), body);
  }
}
