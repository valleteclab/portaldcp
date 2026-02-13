import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { Request } from 'express';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

// Usa UPLOAD_DIR env var para Railway volume persistente, fallback para cwd/uploads
const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
// Tenta criar diretório (pode falhar no Railway se volume ainda não estiver montado)
try {
  if (!existsSync(uploadDir)) {
    mkdirSync(uploadDir, { recursive: true });
  }
} catch (e) {
  console.warn(`[UploadModule] Não foi possível criar ${uploadDir} na inicialização (será criado sob demanda): ${(e as any).message}`);
}

// Extensões permitidas (validação dupla: MIME + extensão)
const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

@Module({
  imports: [
    MulterModule.register({
      storage: diskStorage({
        destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
          try {
            // Organiza por tipo de documento
            const tipo = (req.body as any).tipo || 'geral';
            // Sanitizar nome da pasta (evitar path traversal)
            const safeTipo = tipo.replace(/[^a-zA-Z0-9_-]/g, '_');
            const dir = join(uploadDir, safeTipo);
            if (!existsSync(dir)) {
              mkdirSync(dir, { recursive: true });
            }
            cb(null, dir);
          } catch (e) {
            cb(e as Error, uploadDir);
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
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
