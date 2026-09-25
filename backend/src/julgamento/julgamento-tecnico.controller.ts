import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { JulgamentoTecnicoService, TAMANHO_MAXIMO_DOCUMENTO_TECNICO } from './julgamento-tecnico.service';

/**
 * JULGAMENTO TÉCNICO (Lei 14.133 arts. 35–37) e MAIOR RETORNO (art. 39) —
 * rotas por licitação: `/api/julgamento/licitacao/:id/tecnica/...`.
 *
 * AUTORIZAÇÃO (E1a):
 *  - configuração (quesitos, pesos, banca), notas e publicação → órgão DONO;
 *    notas só pelo membro da banca (usuário do token);
 *  - proposta técnica / de trabalho → fornecedor do TOKEN (a própria);
 *  - documentos: o licitante vê os seus; os dos demais só depois da
 *    publicação das notas (e se participa); o órgão, depois do acolhimento;
 *  - configuração do edital e resultado publicado → leitura pública.
 */
@Controller('julgamento/licitacao/:licitacaoId')
export class JulgamentoTecnicoController {
  constructor(
    private readonly tecnico: JulgamentoTecnicoService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  private async licitacao(id: string): Promise<string> {
    if (!ehUuid(id) || !(await this.acesso.orgaoDaLicitacao(id))) throw new NotFoundException('Licitação não encontrada');
    return id;
  }

  private exigirId(id: string) {
    if (!ehUuid(id)) throw new NotFoundException('Não encontrado');
  }

  // --- Edital: configuração e banca ------------------------------------------

  /** Quesitos, pesos e banca (dados do edital — leitura pública). */
  @AutenticacaoOpcional()
  @Get('tecnica/configuracao')
  async configuracao(@Param('licitacaoId') id: string) {
    return this.tecnico.configuracao(await this.licitacao(id));
  }

  @SomenteOrgao()
  @Put('tecnica/configuracao')
  async salvarConfiguracao(
    @Param('licitacaoId') id: string,
    @Body() body: { pesoTecnica?: number | null; notaMinima?: number | null; quesitos?: any[] },
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    return this.tecnico.salvarConfiguracao(id, body ?? {}, atorTransicaoDe(ator));
  }

  @SomenteOrgao()
  @Put('tecnica/comissao')
  async comissao(@Param('licitacaoId') id: string, @Body() body: { usuarioIds?: string[]; presidenteId?: string | null }, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    return this.tecnico.designarComissao(id, body?.usuarioIds ?? [], atorTransicaoDe(ator), body?.presidenteId ?? null);
  }

  /** Usuários ativos do órgão (candidatos à banca). */
  @SomenteOrgao()
  @Get('tecnica/usuarios-elegiveis')
  async elegiveis(@Param('licitacaoId') id: string, @AtorAtual() ator: Ator) {
    const dono = await this.acesso.assertOrgaoDaLicitacao(ator, id, 'leitura');
    return this.tecnico.usuariosDoOrgao(dono.orgaoId);
  }

  // --- Banca: notas e publicação ----------------------------------------------

  @SomenteOrgao()
  @Get('tecnica/notas')
  async notas(@Param('licitacaoId') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id, 'leitura');
    return this.tecnico.painelNotas(id, ator.usuarioId ?? null);
  }

  @SomenteOrgao()
  @Put('tecnica/notas')
  async registrarNotas(@Param('licitacaoId') id: string, @Body() body: { notas?: any[] }, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    if (!ator.usuarioId) throw new BadRequestException('Notas técnicas são atribuídas pelo usuário membro da banca (login do servidor)');
    return this.tecnico.registrarNotas(id, ator.usuarioId, body?.notas ?? []);
  }

  @SomenteOrgao()
  @Post('tecnica/publicar')
  async publicar(@Param('licitacaoId') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    return this.tecnico.publicar(id, atorTransicaoDe(ator));
  }

  /** Notas técnicas publicadas (público; antes da publicação: `publicado: false`). */
  @AutenticacaoOpcional()
  @Get('tecnica/resultado')
  async resultado(@Param('licitacaoId') id: string) {
    return this.tecnico.resultadoPublico(await this.licitacao(id));
  }

  // --- Proposta técnica do licitante ------------------------------------------

  @SomenteFornecedor()
  @Post('tecnica/documentos')
  @UseInterceptors(FileInterceptor('arquivo', { storage: memoryStorage(), limits: { fileSize: TAMANHO_MAXIMO_DOCUMENTO_TECNICO, files: 1 } }))
  async enviarDocumento(
    @Param('licitacaoId') id: string,
    @UploadedFile() arquivo: Express.Multer.File,
    @Body() body: { descricao?: string },
    @AtorAtual() ator: Ator,
  ) {
    const fid = this.acesso.fornecedorDoToken(ator);
    return this.tecnico.enviarDocumento(await this.licitacao(id), fid, arquivo ?? null, body?.descricao ?? null);
  }

  @SomenteFornecedor()
  @Delete('tecnica/documentos/:documentoId')
  async removerDocumento(@Param('licitacaoId') id: string, @Param('documentoId') documentoId: string, @AtorAtual() ator: Ator) {
    this.exigirId(documentoId);
    return this.tecnico.removerDocumento(await this.licitacao(id), this.acesso.fornecedorDoToken(ator), documentoId);
  }

  private async quem(ator: Ator, id: string): Promise<{ orgao?: boolean; fornecedorId?: string; participa?: boolean }> {
    if (ehFornecedor(ator)) {
      return { fornecedorId: ator.fornecedorId, participa: await this.acesso.fornecedorParticipa(ator.fornecedorId, id) };
    }
    await this.acesso.assertOrgaoDaLicitacao(ator, id, 'leitura');
    return { orgao: true };
  }

  @OrgaoOuFornecedor()
  @Get('tecnica/documentos')
  async documentos(@Param('licitacaoId') id: string, @AtorAtual() ator: Ator) {
    return this.tecnico.documentos(await this.licitacao(id), await this.quem(ator, id));
  }

  @OrgaoOuFornecedor()
  @Get('tecnica/documentos/:documentoId/arquivo')
  async arquivo(@Param('licitacaoId') id: string, @Param('documentoId') documentoId: string, @AtorAtual() ator: Ator) {
    this.exigirId(documentoId);
    const a = await this.tecnico.arquivoDocumento(await this.licitacao(id), documentoId, await this.quem(ator, id));
    return new StreamableFile(a.conteudo, { type: a.mime, disposition: `inline; filename="${encodeURIComponent(a.nome)}"` });
  }

  // --- Maior retorno econômico (art. 39) --------------------------------------

  @SomenteFornecedor()
  @Put('retorno-economico')
  async enviarRetorno(@Param('licitacaoId') id: string, @Body() body: { itens?: any[] }, @AtorAtual() ator: Ator) {
    return this.tecnico.enviarRetorno(await this.licitacao(id), this.acesso.fornecedorDoToken(ator), body?.itens ?? []);
  }

  @OrgaoOuFornecedor()
  @Get('retorno-economico')
  async retornos(@Param('licitacaoId') id: string, @AtorAtual() ator: Ator) {
    const q = await this.quem(ator, id);
    return this.tecnico.retornos(await this.licitacao(id), q.orgao ? { orgao: true } : { fornecedorId: q.fornecedorId });
  }
}
