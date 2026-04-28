import { Controller, Get, Res } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import type { Response } from 'express';

@Public()
@ApiTags('Documentacao')
@Controller('ext')
export class ApiDocsController {
  private readonly docsPath: string;

  constructor() {
    this.docsPath = path.resolve(process.cwd(), 'docs', 'API_FORNECEDORES.md');
  }

  @Get('docs')
  @ApiOperation({ summary: 'Documentacao da API de Fornecedores em HTML' })
  getDocsHtml(@Res() res: Response) {
    const md = this.readMarkdown();
    const html = this.renderHtml(md);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Get('docs.md')
  @ApiOperation({ summary: 'Documentacao da API de Fornecedores em Markdown' })
  getDocsMarkdown(@Res() res: Response) {
    const md = this.readMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(md);
  }

  private readMarkdown(): string {
    try {
      return fs.readFileSync(this.docsPath, 'utf-8');
    } catch {
      return '# Documentacao nao encontrada\n\nO arquivo `docs/API_FORNECEDORES.md` nao esta disponivel no servidor.';
    }
  }

  private renderHtml(md: string): string {
    const escaped = md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>API de Fornecedores - Portal DCP</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown.min.css">
  <style>
    body { background: #f6f8fa; margin: 0; padding: 24px; }
    .markdown-body { max-width: 980px; margin: 0 auto; padding: 32px; background: #fff; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    pre { background: #f6f8fa; border-radius: 6px; padding: 16px; overflow-x: auto; }
    code { font-size: 85%; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d0d7de; padding: 8px 13px; }
    th { background: #f6f8fa; font-weight: 600; }
    tr:nth-child(even) { background: #f6f8fa; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/marked@12/marked.min.js"></script>
</head>
<body>
  <article class="markdown-body" id="content"></article>
  <script>
    const md = ${JSON.stringify(md)};
    document.getElementById('content').innerHTML = marked.parse(md);
  </script>
</body>
</html>`;
  }
}
