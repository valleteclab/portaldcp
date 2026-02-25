import {
  Controller, Post, Req, Body, UseGuards, UseInterceptors, UploadedFile,
  BadRequestException, ForbiddenException, Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ImportarContratoIaService } from './importar-contrato-ia.service';
import { ConfirmarImportacaoDto } from './dto/importar-ia.dto';
import { Orgao } from '../orgaos/entities/orgao.entity';

const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

@UseGuards(JwtAuthGuard)
@Controller('contratos/importar-ia')
export class ImportarContratoIaController {
  private readonly logger = new Logger(ImportarContratoIaController.name);

  constructor(
    private readonly importarService: ImportarContratoIaService,
    @InjectRepository(Orgao)
    private readonly orgaoRepo: Repository<Orgao>,
  ) {}

  private getOrgaoId(req: any): string {
    return req.user?.orgaoId || req.user?.sub;
  }

  private async verificarModuloHabilitado(orgaoId: string): Promise<void> {
    const orgao = await this.orgaoRepo.findOne({ where: { id: orgaoId }, select: ['id', 'modulos_habilitados'] });
    if (!orgao) throw new ForbiddenException('Órgão não encontrado.');
    const modulos: string[] = orgao.modulos_habilitados || [];
    if (!modulos.includes('IA_CONTRATOS')) {
      throw new ForbiddenException(
        'O módulo "IA — Importação de Contratos" não está habilitado para este órgão. ' +
        'Solicite a ativação ao administrador do sistema.',
      );
    }
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
    await this.verificarModuloHabilitado(orgaoId);
    this.logger.log(`Upload IA contrato: orgaoId=${orgaoId}, arquivo=${file.originalname}`);
    return this.importarService.extrairDadosContrato(file, orgaoId);
  }

  @Post('confirmar')
  async confirmarImportacao(@Req() req: any, @Body() body: ConfirmarImportacaoDto) {
    const orgaoId = this.getOrgaoId(req);
    await this.verificarModuloHabilitado(orgaoId);
    this.logger.log(`Confirmar importação IA: orgaoId=${orgaoId}`);
    return this.importarService.confirmarImportacao(body, orgaoId);
  }
}
