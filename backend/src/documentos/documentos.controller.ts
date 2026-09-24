import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseInterceptors,
  UploadedFile,
  Res,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { DocumentosService } from './documentos.service';
import { DocumentoLicitacao, StatusDocumento, TipoDocumentoLicitacao } from './entities/documento-licitacao.entity';
import { Public } from '../auth/public.decorator';
import { AcessoLicitacaoService, ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { AtorAtual, AutenticacaoOpcional, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import { ehOrgao } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';
import { licitacaoEhPublica } from '../licitacoes/licitacao-visao.util';

/**
 * AUTORIZAÇÃO (E1a):
 *  - upload, vincular, publicar, excluir, estatísticas, listas completas e
 *    por tipo: somente o órgão DONO da licitação (leitura de fora → 404; ato → 403);
 *  - documento por id / download / visualizar: órgão dono; qualquer um se o
 *    documento é público (publicado) E a licitação já foi divulgada; senão 404;
 *  - lista por licitação para quem não é o dono: só os públicos, e só se a
 *    licitação já foi divulgada;
 *  - endpoints públicos: só documentos públicos de licitação divulgada.
 */
@Controller('documentos')
export class DocumentosController {
  constructor(
    private readonly documentosService: DocumentosService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  /** Ator é o órgão dono (ou admin) da licitação `orgaoIdDaLicitacao`? */
  private ehDono(ator: Ator | null, orgaoIdDaLicitacao: string | null | undefined): boolean {
    if (!ator || !orgaoIdDaLicitacao) return false;
    return ator.admin || (ehOrgao(ator) && ator.orgaoId === orgaoIdDaLicitacao);
  }

  /** Documento aberto ao público: público, publicado e de licitação divulgada. */
  private ehPublico(doc: DocumentoLicitacao): boolean {
    return !!doc.publico && doc.status === StatusDocumento.PUBLICADO && licitacaoEhPublica(doc.licitacao);
  }

  /**
   * Documento que o ator pode ler: o órgão dono vê qualquer um; os demais só
   * o público de licitação divulgada. Fora disso → 404 (não confirma existência).
   */
  private async documentoLegivel(id: string, ator: Ator | null): Promise<{ doc: DocumentoLicitacao; dono: boolean }> {
    if (!ehUuid(id)) throw new NotFoundException('Documento não encontrado');
    const doc = await this.documentosService.findOne(id);
    const dono = this.ehDono(ator, doc.licitacao?.orgao_id);
    if (!dono && !this.ehPublico(doc)) throw new NotFoundException('Documento não encontrado');
    return { doc, dono };
  }

  /** Visão pública do documento (sem caminho no servidor nem a licitação completa). */
  private visaoPublica(doc: DocumentoLicitacao) {
    const { caminho_arquivo: _c, nome_arquivo: _n, licitacao: _l, ...resto } = doc as any;
    return resto;
  }

  private enviarArquivo(res: Response, buffer: Buffer, doc: DocumentoLicitacao, disposicao: 'attachment' | 'inline') {
    res.set({
      'Content-Type': doc.mime_type,
      'Content-Disposition': `${disposicao}; filename="${doc.nome_original}"`,
      'Content-Length': buffer.length,
    });
    res.status(HttpStatus.OK).send(buffer);
  }

  // Upload de documento
  @Post('licitacao/:licitacaoId')
  @SomenteOrgao()
  @UseInterceptors(FileInterceptor('arquivo'))
  async upload(
    @Param('licitacaoId') licitacaoId: string,
    @UploadedFile() arquivo: Express.Multer.File,
    @Body() body: {
      tipo: TipoDocumentoLicitacao;
      titulo: string;
      descricao?: string;
      numero_documento?: string;
      data_documento?: string;
      publico?: string;
    },
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId);
    return this.documentosService.upload(licitacaoId, body.tipo, arquivo, {
      titulo: body.titulo,
      descricao: body.descricao,
      numero_documento: body.numero_documento,
      data_documento: body.data_documento ? new Date(body.data_documento) : undefined,
      publico: body.publico === 'true'
    });
  }

  /**
   * Documentos de uma licitação. Órgão dono: todos (ou só os públicos com
   * ?publicos=true). Demais autenticados: só os públicos de licitação divulgada.
   */
  @Get('licitacao/:licitacaoId')
  async findByLicitacao(
    @Param('licitacaoId') licitacaoId: string,
    @AtorAtual() ator: Ator,
    @Query('publicos') apenasPublicos?: string
  ) {
    const orgaoId = await this.acesso.orgaoDaLicitacao(licitacaoId);
    if (this.ehDono(ator, orgaoId)) {
      return this.documentosService.findByLicitacao(licitacaoId, apenasPublicos === 'true');
    }
    return this.publicosDaLicitacao(licitacaoId);
  }

  // Listar documentos públicos de uma licitação (público)
  @Public()
  @Get('licitacao/:licitacaoId/publicos')
  async findByLicitacaoPublicos(@Param('licitacaoId') licitacaoId: string) {
    return this.publicosDaLicitacao(licitacaoId);
  }

  /** Públicos da licitação, só se ela já foi divulgada (senão 404). */
  private async publicosDaLicitacao(licitacaoId: string) {
    const lic = ehUuid(licitacaoId) ? await this.documentosService.faseDaLicitacao(licitacaoId) : null;
    if (!lic || !licitacaoEhPublica(lic)) throw new NotFoundException('Licitação não encontrada');
    return this.documentosService.findByLicitacaoPublicos(licitacaoId);
  }

  // Listar documentos por tipo
  @Get('licitacao/:licitacaoId/tipo/:tipo')
  @SomenteOrgao()
  async findByTipo(
    @Param('licitacaoId') licitacaoId: string,
    @Param('tipo') tipo: TipoDocumentoLicitacao,
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId, 'leitura');
    return this.documentosService.findByTipo(licitacaoId, tipo);
  }

  // Estatísticas de documentos
  @Get('licitacao/:licitacaoId/estatisticas')
  @SomenteOrgao()
  async estatisticas(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId, 'leitura');
    return this.documentosService.contarPorTipo(licitacaoId);
  }

  // Vincular documento já existente (arquivo já foi enviado via /uploads)
  @Post('licitacao/:licitacaoId/vincular')
  @SomenteOrgao()
  async vincular(
    @Param('licitacaoId') licitacaoId: string,
    @Body() body: {
      tipo: TipoDocumentoLicitacao;
      titulo: string;
      nome_original: string;
      caminho: string;
      descricao?: string;
      publico?: boolean;
    },
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId);
    return this.documentosService.vincularDocumentoExistente(licitacaoId, {
      tipo: body.tipo,
      titulo: body.titulo,
      nome_original: body.nome_original,
      caminho: body.caminho,
      descricao: body.descricao,
      publico: body.publico ?? true
    });
  }

  // ============ ENDPOINTS PÚBLICOS ============
  // (antes de ':id' para "publicos" não ser tratado como id)

  // Listar documentos públicos (para portal) — só de licitações divulgadas
  @Public()
  @Get('publicos/lista')
  async listarPublicos(
    @Query('licitacaoId') licitacaoId?: string,
    @Query('tipo') tipo?: TipoDocumentoLicitacao,
    @Query('orgaoId') orgaoId?: string
  ) {
    if (licitacaoId && !ehUuid(licitacaoId)) return [];
    const docs = await this.documentosService.findPublicos({ licitacaoId, tipo, orgaoId });
    return docs.filter((d) => licitacaoEhPublica(d.licitacao));
  }

  // Download público (documento público de licitação divulgada; senão 404)
  @Public()
  @Get('publicos/:id/download')
  async downloadPublico(@Param('id') id: string, @Res() res: Response) {
    const { doc } = await this.documentoLegivel(id, null);
    const { buffer } = await this.documentosService.getArquivo(id);
    this.enviarArquivo(res, buffer, doc, 'attachment');
  }

  // ============ DOCUMENTO POR ID ============

  // Buscar documento específico
  @AutenticacaoOpcional()
  @Get(':id')
  async findOne(@Param('id') id: string, @AtorAtual() ator: Ator | null) {
    const { doc, dono } = await this.documentoLegivel(id, ator);
    return dono ? doc : this.visaoPublica(doc);
  }

  // Download do arquivo
  @AutenticacaoOpcional()
  @Get(':id/download')
  async download(@Param('id') id: string, @AtorAtual() ator: Ator | null, @Res() res: Response) {
    const { doc } = await this.documentoLegivel(id, ator);
    const { buffer } = await this.documentosService.getArquivo(id);
    this.enviarArquivo(res, buffer, doc, 'attachment');
  }

  // Visualizar arquivo (inline)
  @AutenticacaoOpcional()
  @Get(':id/visualizar')
  async visualizar(@Param('id') id: string, @AtorAtual() ator: Ator | null, @Res() res: Response) {
    const { doc } = await this.documentoLegivel(id, ator);
    const { buffer } = await this.documentosService.getArquivo(id);
    this.enviarArquivo(res, buffer, doc, 'inline');
  }

  // Publicar documento
  @Put(':id/publicar')
  @SomenteOrgao()
  async publicar(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDoDocumento(ator, id);
    return this.documentosService.publicar(id);
  }

  // Excluir documento
  @Delete(':id')
  @SomenteOrgao()
  async delete(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDoDocumento(ator, id);
    await this.documentosService.delete(id);
    return { message: 'Documento excluído com sucesso' };
  }
}
