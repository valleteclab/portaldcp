import { Injectable, Logger } from '@nestjs/common';
import { join } from 'path';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { caminhoLogico, diretorioPrivado, diretorioUploads, resolverArquivo } from '../common/arquivos/arquivos';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  // Permite configurar o diretório via variável de ambiente (para Railway volume persistente)
  private readonly uploadDir = diretorioUploads();

  constructor() {
    // Tenta criar diretório (pode falhar no Railway se volume ainda não estiver montado)
    for (const dir of [this.uploadDir, diretorioPrivado()]) {
      try {
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
          this.logger.log(`Diretório de uploads criado: ${dir}`);
        }
      } catch (e) {
        this.logger.warn(`Não foi possível criar ${dir} na inicialização (será criado sob demanda): ${(e as any).message}`);
      }
    }
    this.logger.log(`Upload dir: ${this.uploadDir} | privado: ${diretorioPrivado()}`);
  }

  /** Caminho no diretório LEGADO (público). Para ler, prefira `resolverArquivo`. */
  getFilePath(tipo: string, filename: string): string {
    return join(this.uploadDir, tipo, filename);
  }

  getFileUrl(tipo: string, filename: string): string {
    return `/api/uploads/${tipo}/${filename}`;
  }

  /** Apaga o arquivo onde ele estiver (privado ou legado). `tipo` pode ter subpasta (`medicoes/<id>`). */
  deleteFile(tipo: string, filename: string): boolean {
    const c = caminhoLogico([...String(tipo).split('/'), filename]);
    const filePath = resolverArquivo(c);
    if (filePath && existsSync(filePath)) {
      unlinkSync(filePath);
      return true;
    }
    return false;
  }

  fileExists(tipo: string, filename: string): boolean {
    return !!resolverArquivo(caminhoLogico([...String(tipo).split('/'), filename]));
  }
}
