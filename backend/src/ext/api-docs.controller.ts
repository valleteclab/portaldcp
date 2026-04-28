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
    // Prioridade: 1) src/ext/api-docs-content.md (embutido no build, funciona em producao)
    //             2) docs/ na raiz do repo (dev local)
    const candidates = [
      path.resolve(__dirname, 'api-docs-content.md'),
      path.resolve(process.cwd(), 'docs', 'API_FORNECEDORES.md'),
      path.resolve(process.cwd(), '..', 'docs', 'API_FORNECEDORES.md'),
      path.resolve(__dirname, '..', '..', '..', 'docs', 'API_FORNECEDORES.md'),
    ];
    this.docsPath = candidates.find((p) => fs.existsSync(p)) || '';
  }

  @Get('docs')
  @ApiOperation({ summary: 'Documentacao da API de Fornecedores em HTML' })
  getDocsHtml(@Res() res: Response) {
    const md = this.readMarkdown();
    const mdJson = JSON.stringify(md);
    const html = [
      '<!DOCTYPE html>',
      '<html lang="pt-BR">',
      '<head>',
      '  <meta charset="utf-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1">',
      '  <title>API de Fornecedores - Portal DCP</title>',
      '  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown.min.css">',
      '  <style>',
      '    body { background: #f6f8fa; margin: 0; padding: 24px; }',
      '    .markdown-body { max-width: 980px; margin: 0 auto; padding: 32px; background: #fff; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }',
      '    pre { background: #f6f8fa; border-radius: 6px; padding: 16px; overflow-x: auto; }',
      '    code { font-size: 85%; }',
      '    table { border-collapse: collapse; width: 100%; }',
      '    th, td { border: 1px solid #d0d7de; padding: 8px 13px; }',
      '    th { background: #f6f8fa; font-weight: 600; }',
      '    tr:nth-child(even) { background: #f6f8fa; }',
      '  </style>',
      '  <script src="https://cdn.jsdelivr.net/npm/marked@12/marked.min.js"><\/script>',
      '</head>',
      '<body>',
      '  <article class="markdown-body" id="content"></article>',
      '  <script>',
      '    const md = ' + mdJson + ';',
      '    document.getElementById("content").innerHTML = marked.parse(md);',
      '  <\/script>',
      '</body>',
      '</html>',
    ].join('\n');
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
      if (this.docsPath) {
        return fs.readFileSync(this.docsPath, 'utf-8');
      }
    } catch {
      // fallback abaixo
    }
    return [
      '# API de Fornecedores - Portal DCP',
      '',
      'A documentacao completa esta disponivel em:',
      '- Swagger: https://compras.cmlem.ba.gov.br/api/docs',
      '- OpenAPI JSON: https://compras.cmlem.ba.gov.br/api/docs-json',
      '',
      'O arquivo markdown nao esta disponivel no servidor.',
      'Consulte o repositorio do projeto para a documentacao atualizada.',
    ].join('\n');
  }
}
