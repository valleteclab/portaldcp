import { Injectable } from '@nestjs/common';
import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';

@Injectable()
export class UploadService {
  private readonly uploadDir = join(process.cwd(), 'uploads');

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
