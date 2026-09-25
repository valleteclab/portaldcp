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
  Req,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { createReadStream } from 'fs';
import { AcessoLicitacaoService, ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { AtorAtual, AutenticacaoOpcional, OrgaoOuFornecedor, SomenteFornecedor, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import { ehFornecedor, ehOrgao } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';
import { atorTransicaoDe } from '../licitacoes/transicoes/transicoes.tipos';
import { ConcursoService, VisaoConcurso } from './concurso.service';

const LIMITE_UPLOAD = 60 * 1024 * 1024; // teto técnico; o regulamento fixa o máximo (padrão 20 MB)

/**
 * CONCURSO (Lei 14.133 art. 30; plano E7c) — `/api/concurso/licitacao/:id/...`
 *
 * AUTORIZAÇÃO (E1a) e SIGILO DE AUTORIA:
 *  - regulamento, julgamento (publicação), qualificação, pagamento do prêmio → órgão DONO;
 *  - banca: só membros designados registram notas; o painel da banca mostra só CÓDIGOS;
 *  - inscrição/retirada/cessão → o participante do TOKEN (o próprio trabalho);
 *  - arquivo do trabalho: autor; órgão depois do fim das inscrições (por código);
 *    envelope de identificação: autor; órgão só depois do julgamento publicado;
 *  - painel público: regulamento (edital publicado) e classificação depois do julgamento.
 */
@Controller('concurso/licitacao/:licitacaoId')
export class ConcursoController {
  constructor(
    private readonly concurso: ConcursoService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  private async existe(id: string): Promise<string> {
    if (!ehUuid(id) || !(await this.acesso.orgaoDaLicitacao(id))) throw new NotFoundException('Concurso não encontrado');
    return id;
  }

  private async visao(ator: Ator | null, id: string): Promise<VisaoConcurso> {
    if (ator?.admin) return { tipo: 'ORGAO' };
    if (ator && ehOrgao(ator) && (await this.acesso.orgaoDaLicitacao(id)) === ator.orgaoId) return { tipo: 'ORGAO', usuarioId: ator.usuarioId };
    if (ator && ehFornecedor(ator)) return { tipo: 'FORNECEDOR', fornecedorId: ator.fornecedorId };
    return { tipo: 'PUBLICO' };
  }

  @AutenticacaoOpcional()
  @Get()
  async painel(@Param('licitacaoId') id: string, @AtorAtual() ator: Ator | null) {
    return this.concurso.painel(await this.existe(id), await this.visao(ator, id));
  }

  @SomenteOrgao()
  @Put('regulamento')
  async regulamento(@Param('licitacaoId') id: string, @Body() body: Record<string, any>, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    return this.concurso.salvarRegulamento(id, body ?? {});
  }

  // --- Participante ---------------------------------------------------------

  @SomenteFornecedor()
  @Post('trabalho')
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'trabalho', maxCount: 1 }, { name: 'identificacao', maxCount: 1 }], { storage: memoryStorage(), limits: { fileSize: LIMITE_UPLOAD, files: 2 } }),
  )
  async inscrever(
    @Param('licitacaoId') id: string,
    @UploadedFiles() arquivos: { trabalho?: Express.Multer.File[]; identificacao?: Express.Multer.File[] },
    @Body() body: Record<string, any>,
    @AtorAtual() ator: Ator,
  ) {
    return this.concurso.inscrever(
      await this.existe(id),
      this.acesso.fornecedorDoToken(ator),
      { trabalho: arquivos?.trabalho?.[0] ?? null, identificacao: arquivos?.identificacao?.[0] ?? null },
      body ?? {},
    );
  }

  @SomenteFornecedor()
  @Delete('trabalho')
  async retirar(@Param('licitacaoId') id: string, @AtorAtual() ator: Ator) {
    return this.concurso.retirar(await this.existe(id), this.acesso.fornecedorDoToken(ator));
  }

  @SomenteFornecedor()
  @Post('premiacao/cessao')
  async cessao(@Param('licitacaoId') id: string, @AtorAtual() ator: Ator, @Req() req: any) {
    return this.concurso.aceitarCessao(await this.existe(id), this.acesso.fornecedorDoToken(ator), req?.ip ?? null);
  }

  @OrgaoOuFornecedor()
  @Get('trabalhos/:trabalhoId/arquivo')
  async arquivo(@Param('licitacaoId') id: string, @Param('trabalhoId') tid: string, @AtorAtual() ator: Ator) {
    if (!ehUuid(tid)) throw new NotFoundException('Trabalho não encontrado');
    const a = await this.concurso.arquivoTrabalho(await this.existe(id), tid, await this.visao(ator, id));
    return new StreamableFile(a.conteudo, { type: a.mime, disposition: `inline; filename="${a.nome}"` });
  }

  @OrgaoOuFornecedor()
  @Get('trabalhos/:trabalhoId/identificacao')
  async identificacao(@Param('licitacaoId') id: string, @Param('trabalhoId') tid: string, @AtorAtual() ator: Ator) {
    if (!ehUuid(tid)) throw new NotFoundException('Identificação não encontrada');
    const a = await this.concurso.arquivoIdentificacao(await this.existe(id), tid, await this.visao(ator, id));
    return new StreamableFile(a.conteudo, { type: a.mime, disposition: `inline; filename="${encodeURIComponent(a.nome)}"` });
  }

  // --- Banca (sigilo de autoria) ---------------------------------------------

  @SomenteOrgao()
  @Get('banca')
  async banca(@Param('licitacaoId') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id, 'leitura');
    return this.concurso.painelBanca(id, ator.usuarioId ?? null);
  }

  @SomenteOrgao()
  @Put('banca/notas')
  async notas(@Param('licitacaoId') id: string, @Body() body: { notas?: any[] }, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    if (!ator.usuarioId) throw new BadRequestException('As notas são atribuídas pelo usuário membro da banca (login do servidor).');
    return this.concurso.registrarNotas(id, ator.usuarioId, body?.notas ?? []);
  }

  @SomenteOrgao()
  @Post('julgar')
  async julgar(@Param('licitacaoId') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    return this.concurso.julgar(id, atorTransicaoDe(ator));
  }

  @SomenteOrgao()
  @Post('trabalhos/:trabalhoId/qualificacao')
  async qualificacao(@Param('licitacaoId') id: string, @Param('trabalhoId') tid: string, @Body() body: { qualificado?: boolean; motivo?: string }, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    if (!ehUuid(tid)) throw new NotFoundException('Trabalho não encontrado');
    return this.concurso.qualificar(id, tid, body ?? {}, atorTransicaoDe(ator));
  }

  // --- Premiação ------------------------------------------------------------

  @SomenteOrgao()
  @Post('premiacao')
  async premiacao(@Param('licitacaoId') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    return this.concurso.gerarPremiacao(id, atorTransicaoDe(ator));
  }

  @SomenteOrgao()
  @Post('premiacao/:premiacaoId/pagamento')
  async pagamento(@Param('licitacaoId') id: string, @Param('premiacaoId') pid: string, @Body() body: { observacao?: string }, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    if (!ehUuid(pid)) throw new NotFoundException('Premiação não encontrada');
    return this.concurso.registrarPagamento(id, pid, body?.observacao ?? null, atorTransicaoDe(ator));
  }

  @OrgaoOuFornecedor()
  @Get('premiacao/:premiacaoId/termo')
  async termo(@Param('licitacaoId') id: string, @Param('premiacaoId') pid: string, @AtorAtual() ator: Ator) {
    if (!ehUuid(pid)) throw new NotFoundException('Termo não encontrado');
    const t = await this.concurso.arquivoTermo(await this.existe(id), pid, await this.visao(ator, id));
    return new StreamableFile(createReadStream(t.caminho), { type: 'application/pdf', disposition: `inline; filename="${t.nome}"` });
  }
}
