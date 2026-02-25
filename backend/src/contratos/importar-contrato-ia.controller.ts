import {
  Controller, Post, Req, Body, UseGuards, UseInterceptors, UploadedFile,
  BadRequestException, Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ImportarContratoIaService } from './importar-contrato-ia.service';
import { ConfirmarImportacaoDto } from './dto/importar-ia.dto';

const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

@UseGuards(JwtAuthGuard)
@Controller('contratos/importar-ia')
export class ImportarContratoIaController {
  private readonly logger = new Logger(ImportarContratoIaController.name);

  constructor(private readonly importarService: ImportarContratoIaService) {}

  private getOrgaoId(req: any): string {
    return req.user?.orgaoId || req.user?.sub;
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('arquivo', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIMES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Tipo de arquivo inválido. Envie PDF, JPG ou PNG.'), false);
        }
      },
    }),
  )
  async uploadContrato(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');
    const orgaoId = this.getOrgaoId(req);
    this.logger.log(`Upload IA contrato: orgaoId=${orgaoId}, arquivo=${file.originalname}`);
    return this.importarService.extrairDadosContrato(file, orgaoId);
  }

  @Post('confirmar')
  async confirmarImportacao(@Req() req: any, @Body() body: ConfirmarImportacaoDto) {
    const orgaoId = this.getOrgaoId(req);
    this.logger.log(`Confirmar importação IA: orgaoId=${orgaoId}`);
    return this.importarService.confirmarImportacao(body, orgaoId);
  }
}
