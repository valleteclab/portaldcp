import { Injectable, Logger } from '@nestjs/common';
import { join } from 'path';
import { existsSync, unlinkSync, mkdirSync } from 'fs';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  // Permite configurar o diretório via variável de ambiente (para Railway volume persistente)
  private readonly uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');

  constructor() {
    // Garante que o diretório existe na inicialização
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
      this.logger.log(`Diretório de uploads criado: ${this.uploadDir}`);
    }
    this.logger.log(`Upload dir: ${this.uploadDir}`);
  }

  getFilePath(tipo: string, filename: string): string {
    return join(this.uploadDir, tipo, filename);
  }

  getFileUrl(tipo: string, filename: string): string {
    return `/api/uploads/${tipo}/${filename}`;
  }

  deleteFile(tipo: string, filename: string): boolean {
    const filePath = this.getFilePath(tipo, filename);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      return true;
    }
    return false;
  }

  fileExists(tipo: string, filename: string): boolean {
    return existsSync(this.getFilePath(tipo, filename));
  }
}
