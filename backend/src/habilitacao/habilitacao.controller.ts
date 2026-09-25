import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AcessoLicitacaoService, ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { AtorAtual, AutenticacaoOpcional, OrgaoOuFornecedor, SomenteFornecedor, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import { ehFornecedor } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';
import { atorTransicaoDe } from '../licitacoes/transicoes/transicoes.tipos';
import { HabilitacaoService, TAMANHO_MAXIMO_DOCUMENTO } from './habilitacao.service';

/**
 * HABILITAÇÃO (plano E4) — rotas em /api/habilitacao.
 *
 * AUTORIZAÇÃO (E1a):
 *  - exigências do edital: leitura pública (integram o edital); edição só do
 *    órgão DONO, e só na fase interna;
 *  - atos do agente (convocar, prorrogar, analisar documento, diligência,
 *    habilitar, inabilitar) e o painel completo → @SomenteOrgao + órgão DONO;
 *  - atos do licitante (enviar/retirar documento, entregar, responder
 *    diligência) → @SomenteFornecedor, sempre o fornecedor do TOKEN e só a
 *    própria habilitação (a de outro responde 404);
 *  - arquivo: órgão dono ou o próprio licitante; público nunca.
 */
@Controller('habilitacao')
export class HabilitacaoController {
  constructor(
    private readonly habilitacao: HabilitacaoService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  private exigirIds(...ids: string[]) {
    if (ids.some((i) => !ehUuid(i))) throw new NotFoundException('Não encontrado');
  }

  /** Órgão dono da licitação da habilitação (404 se não existe). */
  private async orgaoDaHabilitacao(ator: Ator, habilitacaoId: string, modo: 'leitura' | 'escrita' = 'escrita') {
    this.exigirIds(habilitacaoId);
    const dono = await this.habilitacao.donoDaHabilitacao(habilitacaoId);
    if (!dono) throw new NotFoundException('Habilitação não encontrada');
    await this.acesso.assertOrgaoDaLicitacao(ator, dono.licitacaoId, modo);
    return dono;
  }

  /** Fornecedor do token envolvido na licitação (proposta enviada ou habilitação). */
  private async fornecedorDaLicitacao(ator: Ator, licitacaoId: string): Promise<string> {
    this.exigirIds(licitacaoId);
    const fid = this.acesso.fornecedorDoToken(ator);
    if (!(await this.habilitacao.fornecedorEnvolvido(licitacaoId, fid))) {
      throw new ForbiddenException('Apenas licitantes desta licitação');
    }
    return fid;
  }

  // --------------------------------------------------------------------------
  // Exigências do edital
  // --------------------------------------------------------------------------

  /** Modelos padrão (bens, serviços, obras, dispensa) e categorias. */
  @AutenticacaoOpcional()
  @Get('modelos')
  modelos() {
    return { modelos: this.habilitacao.modelos(), categorias: this.habilitacao.categorias() };
  }

  /** Exigências de habilitação do edital (públicas). */
  @AutenticacaoOpcional()
  @Get('licitacao/:licitacaoId/exigencias')
  async exigencias(@Param('licitacaoId') licitacaoId: string) {
    this.exigirIds(licitacaoId);
    if (!(await this.acesso.orgaoDaLicitacao(licitacaoId))) throw new NotFoundException('Licitação não encontrada');
    return this.habilitacao.exigencias(licitacaoId);
  }

  @SomenteOrgao()
  @Put('licitacao/:licitacaoId/exigencias')
  async salvarExigencias(@Param('licitacaoId') licitacaoId: string, @Body() body: { exigencias?: unknown }, @AtorAtual() ator: Ator) {
    this.exigirIds(licitacaoId);
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId);
    return this.habilitacao.salvarExigencias(licitacaoId, body?.exigencias);
  }

  @SomenteOrgao()
  @Post('licitacao/:licitacaoId/exigencias/modelo')
  async aplicarModelo(@Param('licitacaoId') licitacaoId: string, @Body() body: { modelo?: string }, @AtorAtual() ator: Ator) {
    this.exigirIds(licitacaoId);
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId);
    return this.habilitacao.aplicarModelo(licitacaoId, body?.modelo ?? null);
  }

  // --------------------------------------------------------------------------
  // Painel
  // --------------------------------------------------------------------------

  /** Órgão dono → painel completo; licitante → só a própria habilitação. */
  @OrgaoOuFornecedor()
  @Get('licitacao/:licitacaoId')
  async painel(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator) {
    this.exigirIds(licitacaoId);
    if (ehFornecedor(ator)) {
      const fid = await this.fornecedorDaLicitacao(ator, licitacaoId);
      return this.habilitacao.painelFornecedor(licitacaoId, fid);
    }
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId, 'leitura');
    return this.habilitacao.painelOrgao(licitacaoId);
  }

  // --------------------------------------------------------------------------
  // Atos do agente de contratação (órgão dono)
  // --------------------------------------------------------------------------

  @SomenteOrgao()
  @Post('licitacao/:licitacaoId/convocar')
  async convocar(
    @Param('licitacaoId') licitacaoId: string,
    @Body() body: { fornecedorId?: string; prazoHoras?: number },
    @AtorAtual() ator: Ator,
  ) {
    this.exigirIds(licitacaoId);
    if (!ehUuid(body?.fornecedorId)) throw new NotFoundException('Licitante não encontrado');
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId);
    return this.habilitacao.convocar(licitacaoId, body.fornecedorId!, { prazoHoras: body?.prazoHoras ?? null }, atorTransicaoDe(ator));
  }

  @SomenteOrgao()
  @Post(':habilitacaoId/prorrogar')
  async prorrogar(@Param('habilitacaoId') id: string, @Body() body: { motivo?: string }, @AtorAtual() ator: Ator) {
    await this.orgaoDaHabilitacao(ator, id);
    return this.habilitacao.prorrogar(id, body?.motivo, atorTransicaoDe(ator));
  }

  /** Análise de documento: { resultado: 'ATENDE' | 'NAO_ATENDE', motivo }. */
  @SomenteOrgao()
  @Post('documentos/:documentoId/analisar')
  async analisar(
    @Param('documentoId') documentoId: string,
    @Body() body: { resultado?: string; motivo?: string },
    @AtorAtual() ator: Ator,
  ) {
    this.exigirIds(documentoId);
    const dono = await this.habilitacao.donoDoDocumento(documentoId);
    if (!dono) throw new NotFoundException('Documento não encontrado');
    await this.acesso.assertOrgaoDaLicitacao(ator, dono.licitacaoId);
    return this.habilitacao.analisarDocumento(documentoId, body?.resultado, body?.motivo, atorTransicaoDe(ator));
  }

  @SomenteOrgao()
  @Post(':habilitacaoId/diligencia')
  async diligencia(
    @Param('habilitacaoId') id: string,
    @Body() body: { motivo?: string; prazoHoras?: number; exigenciaIds?: string[] },
    @AtorAtual() ator: Ator,
  ) {
    await this.orgaoDaHabilitacao(ator, id);
    return this.habilitacao.abrirDiligencia(id, body ?? {}, atorTransicaoDe(ator));
  }

  @SomenteOrgao()
  @Post(':habilitacaoId/habilitar')
  async habilitar(@Param('habilitacaoId') id: string, @Body() body: { observacao?: string }, @AtorAtual() ator: Ator) {
    await this.orgaoDaHabilitacao(ator, id);
    return this.habilitacao.habilitar(id, atorTransicaoDe(ator), undefined, body?.observacao ?? null);
  }

  @SomenteOrgao()
  @Post(':habilitacaoId/inabilitar')
  async inabilitar(@Param('habilitacaoId') id: string, @Body() body: { motivo?: string }, @AtorAtual() ator: Ator) {
    await this.orgaoDaHabilitacao(ator, id);
    return this.habilitacao.inabilitar(id, body?.motivo, atorTransicaoDe(ator));
  }

  // --------------------------------------------------------------------------
  // Atos do licitante (fornecedor do token)
  // --------------------------------------------------------------------------

  /** Documento para uma exigência: multipart com `arquivo`, `validade` (AAAA-MM-DD, opcional) e `observacao`. */
  @SomenteFornecedor()
  @Post('licitacao/:licitacaoId/exigencias/:exigenciaId/documentos')
  @UseInterceptors(FileInterceptor('arquivo', { storage: memoryStorage(), limits: { fileSize: TAMANHO_MAXIMO_DOCUMENTO, files: 1 } }))
  async enviarDocumento(
    @Param('licitacaoId') licitacaoId: string,
    @Param('exigenciaId') exigenciaId: string,
    @UploadedFile() arquivo: Express.Multer.File,
    @Body() body: { validade?: string; observacao?: string },
    @AtorAtual() ator: Ator,
  ) {
    this.exigirIds(exigenciaId);
    const fid = await this.fornecedorDaLicitacao(ator, licitacaoId);
    return this.habilitacao.enviarDocumento(licitacaoId, exigenciaId, fid, {
      arquivo: arquivo ?? null,
      validade: body?.validade ?? null,
      observacao: body?.observacao ?? null,
    });
  }

  @SomenteFornecedor()
  @Delete('documentos/:documentoId')
  async removerDocumento(@Param('documentoId') documentoId: string, @AtorAtual() ator: Ator) {
    this.exigirIds(documentoId);
    return this.habilitacao.removerDocumento(documentoId, this.acesso.fornecedorDoToken(ator));
  }

  /** Entrega da documentação (encerra o envio — depois, só complementação em diligência). */
  @SomenteFornecedor()
  @Post('licitacao/:licitacaoId/entregar')
  async entregar(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator) {
    const fid = await this.fornecedorDaLicitacao(ator, licitacaoId);
    return this.habilitacao.concluirEnvio(licitacaoId, fid);
  }

  @SomenteFornecedor()
  @Post('diligencias/:diligenciaId/responder')
  async responderDiligencia(@Param('diligenciaId') diligenciaId: string, @Body() body: { resposta?: string }, @AtorAtual() ator: Ator) {
    this.exigirIds(diligenciaId);
    return this.habilitacao.responderDiligencia(diligenciaId, this.acesso.fornecedorDoToken(ator), body?.resposta ?? null);
  }

  // --------------------------------------------------------------------------
  // Arquivo
  // --------------------------------------------------------------------------

  /** Arquivo do documento: órgão dono ou o próprio licitante. */
  @OrgaoOuFornecedor()
  @Get('documentos/:documentoId/arquivo')
  async arquivo(@Param('documentoId') documentoId: string, @AtorAtual() ator: Ator) {
    this.exigirIds(documentoId);
    const dono = await this.habilitacao.donoDoDocumento(documentoId);
    if (!dono) throw new NotFoundException('Documento não encontrado');
    if (ehFornecedor(ator)) {
      // documento de outro licitante: 404 (não revela a existência)
      if (this.acesso.fornecedorDoToken(ator) !== dono.fornecedorId) throw new NotFoundException('Documento não encontrado');
    } else {
      await this.acesso.assertOrgaoDaLicitacao(ator, dono.licitacaoId, 'leitura');
    }
    const a = await this.habilitacao.arquivo(documentoId);
    return new StreamableFile(a.conteudo, { type: a.mime, disposition: `inline; filename="${encodeURIComponent(a.nome)}"` });
  }
}
