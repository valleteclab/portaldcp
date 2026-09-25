import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { AcessoLicitacaoService } from '../auth/acesso/acesso-licitacao.service';
import { AtorAtual, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import type { Ator } from '../auth/acesso/ator';
import { Public } from '../auth/public.decorator';
import { atorTransicaoDe } from '../licitacoes/transicoes/transicoes.tipos';
import { ResultadoService } from './resultado.service';
import type { ArquivoEnviado, OpcoesRegistroAto } from './resultado.service';
import { FormalizacaoService } from './formalizacao/formalizacao.service';
import { TAMANHO_MAX_TERMO_EXTERNO } from './formalizacao/regras-formalizacao';

/** Campos do corpo (JSON ou multipart) de quem registra o ato. */
function opcoesDoCorpo(body: any, arquivo?: ArquivoEnviado | null): OpcoesRegistroAto {
  const b = body ?? {};
  const txt = (v: unknown) => (v == null || v === '' ? null : String(v));
  return {
    motivo: txt(b.motivo),
    autoridadeId: txt(b.autoridade_id ?? b.autoridadeId),
    arquivo: arquivo ?? null,
    publicacao: { veiculo: txt(b.publicacao_veiculo), data: txt(b.publicacao_data) },
  };
}

const interceptorTermo = FileInterceptor('termo', { storage: memoryStorage(), limits: { fileSize: TAMANHO_MAX_TERMO_EXTERNO, files: 1 } });

function enviarPdf(res: Response, caminho: string, nome: string) {
  res.setHeader('Content-Disposition', `inline; filename="${nome.replace(/[^\w.-]/g, '_')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  return res.sendFile(caminho, { dotfiles: 'allow' });
}

/**
 * RESULTADO (plano E6) — rotas em /api/resultado. Um ato, um caminho:
 *  - GET  licitacao/:id               painel (unidades, vencedores, valores, atos, formalização, instrumentos)
 *  - POST licitacao/:id/adjudicar     adjudicação pela sala (pregão/concorrência)
 *  - POST licitacao/:id/homologar     homologação (todas as modalidades) — sem valor no corpo
 *      corpo (JSON ou multipart): { autoridade_id?, motivo?, publicacao_veiculo?, publicacao_data? } + arquivo `termo` (TERMO_EXTERNO)
 *  - GET  licitacao/:id/termo/previa?tipo=ADJUDICACAO|HOMOLOGACAO&autoridade_id=   PDF sem efeito
 *  - POST licitacao/:id/instrumentos  (re)gera contrato/ARP da licitação homologada (idempotente)
 *  - GET  formalizacao/:fid/arquivo?versao=termo|oficial · POST formalizacao/:fid/cancelar · POST formalizacao/:fid/reprocessar
 *  - configuracao: GET · PUT modo · POST/PUT/DELETE autoridades[/:aid]
 *  - PÚBLICO: GET publico/licitacao/:id/termos · GET publico/formalizacao/:fid/arquivo (só depois da homologação)
 *
 * AUTORIZAÇÃO: só o órgão DONO (@SomenteOrgao + dono). Adjudicar/homologar:
 * o OPERADOR (conta do órgão, ADMIN, pregoeiro/agente de contratação) registra
 * em nome da AUTORIDADE escolhida do cadastro (art. 71 IV) — regras em
 * formalizacao/regras-formalizacao.ts. Configuração: conta do órgão ou ADMIN.
 */
@Controller('resultado')
export class ResultadoController {
  constructor(
    private readonly resultado: ResultadoService,
    private readonly formalizacao: FormalizacaoService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  // ---------------------------------------------------------------- público
  @Public()
  @Get('publico/licitacao/:id/termos')
  termosPublicos(@Param('id') id: string) {
    return this.resultado.termosPublicos(id);
  }

  @Public()
  @Get('publico/formalizacao/:fid/arquivo')
  async arquivoPublico(@Param('fid') fid: string, @Res() res: Response) {
    const a = await this.resultado.arquivoPublico(fid);
    return enviarPdf(res, a.caminho, a.nome);
  }

  // --------------------------------------------------------- configuração
  private orgaoDoAtor(ator: Ator): string {
    if (!ator?.orgaoId) throw new BadRequestException('Configuração da formalização: entre com a conta ou um usuário do órgão.');
    return ator.orgaoId;
  }

  @Get('configuracao')
  @SomenteOrgao()
  configuracao(@AtorAtual() ator: Ator) {
    return this.formalizacao.configuracao(this.orgaoDoAtor(ator));
  }

  @Put('configuracao/modo')
  @SomenteOrgao()
  definirModo(@AtorAtual() ator: Ator, @Body() body: { modo?: string }) {
    return this.formalizacao.definirModo(this.orgaoDoAtor(ator), body?.modo, ator);
  }

  @Post('configuracao/autoridades')
  @SomenteOrgao()
  criarAutoridade(@AtorAtual() ator: Ator, @Body() body: any) {
    return this.formalizacao.salvarAutoridade(this.orgaoDoAtor(ator), body ?? {}, ator);
  }

  @Put('configuracao/autoridades/:aid')
  @SomenteOrgao()
  editarAutoridade(@AtorAtual() ator: Ator, @Param('aid') aid: string, @Body() body: any) {
    return this.formalizacao.salvarAutoridade(this.orgaoDoAtor(ator), body ?? {}, ator, aid);
  }

  @Delete('configuracao/autoridades/:aid')
  @SomenteOrgao()
  removerAutoridade(@AtorAtual() ator: Ator, @Param('aid') aid: string) {
    return this.formalizacao.removerAutoridade(this.orgaoDoAtor(ator), aid, ator);
  }

  // ------------------------------------------------------------- licitação
  @Get('licitacao/:id')
  @SomenteOrgao()
  async painel(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id, 'leitura');
    return this.resultado.painel(id, ator);
  }

  @Post('licitacao/:id/adjudicar')
  @HttpCode(200)
  @SomenteOrgao()
  @UseInterceptors(interceptorTermo)
  async adjudicar(@Param('id') id: string, @AtorAtual() ator: Ator, @Body() body: any, @UploadedFile() termo?: ArquivoEnviado) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id, 'escrita');
    return this.resultado.adjudicar(id, ator, opcoesDoCorpo(body, termo));
  }

  @Post('licitacao/:id/homologar')
  @HttpCode(200)
  @SomenteOrgao()
  @UseInterceptors(interceptorTermo)
  async homologar(@Param('id') id: string, @AtorAtual() ator: Ator, @Body() body: any, @UploadedFile() termo?: ArquivoEnviado) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id, 'escrita');
    return this.resultado.homologar(id, ator, opcoesDoCorpo(body, termo));
  }

  @Get('licitacao/:id/termo/previa')
  @SomenteOrgao()
  async previa(
    @Param('id') id: string,
    @AtorAtual() ator: Ator,
    @Query('tipo') tipo: string,
    @Query('autoridade_id') autoridadeId: string | undefined,
    @Res() res: Response,
  ) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id, 'leitura');
    const buffer = await this.resultado.previaTermo(id, ator, String(tipo || '').toUpperCase(), autoridadeId || null);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="previa-termo.pdf"');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(buffer);
  }

  @Post('licitacao/:id/instrumentos')
  @HttpCode(200)
  @SomenteOrgao()
  async instrumentos(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id, 'escrita');
    return this.resultado.gerarInstrumentos(id, atorTransicaoDe(ator));
  }

  // ---------------------------------------------------------- formalização
  @Get('formalizacao/:fid/arquivo')
  @SomenteOrgao()
  async arquivo(@Param('fid') fid: string, @AtorAtual() ator: Ator, @Query('versao') versao: string | undefined, @Res() res: Response) {
    const a = await this.resultado.arquivoFormalizacao(fid, ator, versao === 'termo' ? 'termo' : 'oficial');
    return enviarPdf(res, a.caminho, a.nome);
  }

  @Post('formalizacao/:fid/cancelar')
  @HttpCode(200)
  @SomenteOrgao()
  cancelar(@Param('fid') fid: string, @AtorAtual() ator: Ator, @Body() body: { motivo?: string }) {
    return this.resultado.cancelarFormalizacao(fid, ator, body?.motivo ?? null);
  }

  @Post('formalizacao/:fid/reprocessar')
  @HttpCode(200)
  @SomenteOrgao()
  reprocessar(@Param('fid') fid: string, @AtorAtual() ator: Ator) {
    return this.resultado.reprocessarFormalizacao(fid, ator);
  }
}
