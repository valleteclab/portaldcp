import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { Request } from 'express';
import { UploadController } from './upload.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { UploadService } from './upload.service';
import { AcessoArquivosService } from './acesso-arquivos.service';
import { ArquivosUrlInterceptor } from './arquivos-url.interceptor';
import { ArquivoUpload } from './entities/arquivo-upload.entity';
import { MigracaoArquivosPrivadosBootService } from './migracao-arquivos-privados-boot.service';
import { diretorioPrivado } from '../common/arquivos/arquivos';

// Recepção do Multer: pasta PRIVADA de trânsito (o `tipo` pode chegar depois
// do arquivo no multipart). O controller move para a pasta final (privada se o
// tipo é sensível — ver common/arquivos). Nunca servida (começa com ponto).
function pastaDeRecepcao(): string {
  const dir = join(diretorioPrivado(), '.recebendo');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

// Extensões permitidas (validação dupla: MIME + extensão)
const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

@Module({
  imports: [
    TypeOrmModule.forFeature([ArquivoUpload]),
    MulterModule.register({
      storage: diskStorage({
        destination: (_req: Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
          try {
            cb(null, pastaDeRecepcao());
          } catch (e) {
            cb(e as Error, diretorioPrivado());
          }
        },
        filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
          // Gera nome único para o arquivo (impede nomes maliciosos)
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `${uniqueSuffix}${ext}`);
        },
      }),
      fileFilter: (req: Request, file: Express.Multer.File, cb: any) => {
        // Validação 1: MIME type
        if (!ALLOWED_MIMES.includes(file.mimetype)) {
          return cb(new Error('Tipo de arquivo não permitido. Use PDF, JPG ou PNG.'), false);
        }
        // Validação 2: Extensão do arquivo (evitar spoofing de MIME)
        const ext = extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          return cb(new Error(`Extensão ${ext} não permitida. Use .pdf, .jpg ou .png.`), false);
        }
        // Validação 3: Nome do arquivo não pode conter caracteres perigosos
        if (/[<>:"/\\|?*\x00-\x1f]/.test(file.originalname)) {
          return cb(new Error('Nome do arquivo contém caracteres inválidos.'), false);
        }
        cb(null, true);
      },
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB (reduzido de 25MB)
        files: 5, // Máximo 5 arquivos por request
      },
    }),
  ],
  controllers: [UploadController],
  providers: [
    UploadService,
    AcessoArquivosService,
    MigracaoArquivosPrivadosBootService,
    // Assina (curta duração) as URLs de arquivos sensíveis nas respostas e
    // tira a assinatura das URLs que voltam no corpo das requisições.
    { provide: APP_INTERCEPTOR, useClass: ArquivosUrlInterceptor },
  ],
  exports: [UploadService, AcessoArquivosService],
})
export class UploadModule {}
