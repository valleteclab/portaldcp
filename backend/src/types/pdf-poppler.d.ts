// Declaração de tipos para pdf-poppler (módulo sem tipos oficiais)
declare module 'pdf-poppler' {
  export function convert(
    filePath: string,
    options: {
      format: string;
      out_dir: string;
      out_prefix: string;
      page?: number | null;
    }
  ): Promise<string[]>;
}
