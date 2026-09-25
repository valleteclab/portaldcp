import { HttpException, INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { extname } from 'path';
import type { Ator } from '../auth/acesso/ator';
import { WsAutenticador } from '../auth/acesso/ws-autenticador';
import { CaminhoLogico, caminhoLogico, tipoPublico } from '../common/arquivos/arquivos';
import { AcessoArquivosService } from './acesso-arquivos.service';

const TIPOS_INLINE: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/**
 * Envia o arquivo com cabeçalhos seguros: PDF/imagem abrem no navegador; o
 * resto (xml, html, svg, docx...) sai como ANEXO — nunca é interpretado na
 * origem da API. Sensível não fica em cache compartilhado.
 */
export function enviarArquivo(res: Response, fisico: string, publico: boolean): Promise<void> {
  const ext = extname(fisico).toLowerCase();
  const inline = TIPOS_INLINE[ext];
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', publico ? 'public, max-age=86400' : 'private, max-age=3600');
  if (inline) {
    res.type(inline);
    res.setHeader('Content-Disposition', 'inline');
  } else {
    res.attachment();
    if (ext === '.xml') res.type('application/xml');
  }
  return new Promise((ok) => {
    res.sendFile(fisico, { dotfiles: 'allow' }, (err: any) => {
      if (err && !res.headersSent) res.status(err.status || 404).json({ statusCode: err.status || 404, message: 'Arquivo não encontrado' });
      ok();
    });
  });
}

/** Segmentos do caminho da URL (decodificados). Null se malformado. */
export function segmentosDaUrl(caminho: string): string[] | null {
  try {
    return caminho
      .split('?')[0]
      .split('/')
      .filter((s) => s.length > 0)
      .map((s) => decodeURIComponent(s));
  } catch {
    return null;
  }
}

/**
 * ROTA ESTÁTICA `/uploads/*` (fora do prefixo /api — usada por links antigos):
 * substitui o `useStaticAssets` da pasta inteira. Pasta PÚBLICA → sem login;
 * qualquer outra → URL assinada ou Bearer com checagem de dono (mesma regra do
 * GET /api/uploads). Registrar ANTES do resto das rotas (main.ts e e2e).
 */
export function instalarRotaUploads(app: INestApplication): void {
  // resolvidos no 1º pedido (o app já está inicializado)
  let acesso: AcessoArquivosService | undefined;
  let wsAuth: WsAutenticador | undefined;
  const obterAcesso = (): AcessoArquivosService => {
    if (!acesso) acesso = app.get(AcessoArquivosService, { strict: false });
    return acesso as AcessoArquivosService;
  };
  const obterAutenticador = (): WsAutenticador => {
    if (!wsAuth) wsAuth = app.get(WsAutenticador, { strict: false });
    return wsAuth as WsAutenticador;
  };

  app.use('/uploads', async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const segs = segmentosDaUrl(req.path);
    const c: CaminhoLogico | null = segs ? caminhoLogico(segs) : null;
    try {
      const servico = obterAcesso();
      const autenticador = obterAutenticador();
      let ator: Ator | null = null;
      const m = String(req.headers.authorization || '').match(/^Bearer\s+(\S+)/i);
      if (m && c && !tipoPublico(c.tipo)) {
        try {
          ator = await autenticador.atorDoToken(m[1]);
        } catch {
          ator = null; // token inválido: segue como anônimo
        }
      }
      const fisico = await servico.autorizarLeitura(c, {
        ator,
        expira: typeof req.query.expira === 'string' ? req.query.expira : null,
        assinatura: typeof req.query.assinatura === 'string' ? req.query.assinatura : null,
      });
      await enviarArquivo(res, fisico, !!c && tipoPublico(c.tipo));
    } catch (e: any) {
      const status = e instanceof HttpException ? e.getStatus() : 500;
      if (status === 500) console.error('[uploads] erro ao servir arquivo:', e?.message ?? e);
      res.status(status).json({ statusCode: status, message: status === 500 ? 'Erro ao obter o arquivo' : e.message });
    }
  });
}
