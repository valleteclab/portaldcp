import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Public } from '../auth/public.decorator';
import { AcessoLicitacaoService, ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { AtorAtual, OrgaoOuFornecedor, SomenteFornecedor, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import { ehFornecedor, ehOrgao } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';
import { atorTransicaoDe } from '../licitacoes/transicoes/transicoes.tipos';
import { HabilitacaoService } from '../habilitacao/habilitacao.service';
import { CredenciamentoService } from './credenciamento.service';
import type { ArquivoRecurso, DadosCredenciamento, PedidoContratacao } from './credenciamento.service';

/**
 * CREDENCIAMENTO COMO PROCESSO (plano E7b) — rotas em /api/credenciamento.
 * O `:id` do credenciamento é o id da LICITAÇÃO (modalidade CREDENCIAMENTO).
 *
 * AUTORIZAÇÃO (camada E1a):
 *  - cadastro, painel, análise, contratações e descredenciamento: só o órgão
 *    DONO (leitura de outro órgão → 404; ato → 403);
 *  - inscrição, "minha inscrição", recurso e denúncia: só FORNECEDOR, sempre o
 *    do TOKEN; inscrição de outro → 404. Documentos da inscrição: rotas da
 *    habilitação (/api/habilitacao — envio, entrega, diligência);
 *  - publicos/*: só credenciamentos DIVULGADOS (fase externa), com o edital,
 *    as regras, a tabela de valores, as exigências e a relação de credenciados.
 */
@Controller('credenciamento')
export class CredenciamentoController {
  constructor(
    private readonly service: CredenciamentoService,
    private readonly habilitacao: HabilitacaoService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  private orgaoDaLista(ator: Ator, orgaoIdParam?: string): string {
    if (ator?.admin && orgaoIdParam) return orgaoIdParam;
    if (ehOrgao(ator)) return ator.orgaoId;
    throw new ForbiddenException('Não foi possível identificar o órgão do usuário');
  }

  private async donoDaInscricao(ator: Ator, inscricaoId: string, modo: 'leitura' | 'escrita' = 'escrita') {
    const dono = await this.service.donoDaInscricao(inscricaoId);
    if (!dono) throw new NotFoundException('Inscrição não encontrada');
    await this.acesso.assertOrgaoDoCredenciamento(ator, dono.licitacaoId, modo);
    return dono;
  }

  // ============ CADASTRO (órgão) ============

  @Post()
  @SomenteOrgao()
  async criar(@Body() dados: DadosCredenciamento & { orgao_id?: string }, @AtorAtual() ator: Ator) {
    let orgaoId = ator.orgaoId;
    if (ator.admin) orgaoId = dados?.orgao_id ?? null;
    else if (dados?.orgao_id && dados.orgao_id !== ator.orgaoId) {
      throw new ForbiddenException('Acesso negado: não é possível criar credenciamento para outro órgão');
    }
    if (!orgaoId) throw new BadRequestException('Órgão não identificado');
    return this.service.criar(dados || {}, orgaoId, atorTransicaoDe(ator));
  }

  @Get()
  @SomenteOrgao()
  async listar(@AtorAtual() ator: Ator, @Query('orgaoId') orgaoIdParam?: string, @Query('status') status?: string) {
    return this.service.listarDoOrgao(this.orgaoDaLista(ator, orgaoIdParam), { status });
  }

  // ============ PÚBLICO ============

  @Public()
  @Get('publicos')
  async publicos(@Query('tipo') tipo?: string, @Query('uf') uf?: string) {
    return this.service.listarPublicos({ tipo, uf });
  }

  @Public()
  @Get('publicos/:id')
  async publico(@Param('id') id: string) {
    if (!ehUuid(id)) throw new NotFoundException('Credenciamento não encontrado');
    return this.service.publicoPorId(id);
  }

  // ============ FORNECEDOR (identidade do token) ============

  @Get('fornecedor/minhas')
  @SomenteFornecedor()
  async minhas(@AtorAtual() ator: Ator) {
    return this.service.minhasInscricoes(this.acesso.fornecedorDoToken(ator));
  }

  @Post(':id/inscrever')
  @SomenteFornecedor()
  async inscrever(@Param('id') id: string, @Body() dados: { fornecedor_id?: string }, @AtorAtual() ator: Ator) {
    const fornecedorId = this.acesso.fornecedorDoToken(ator, dados?.fornecedor_id);
    if (!ehUuid(id)) throw new NotFoundException('Credenciamento não encontrado');
    return this.service.inscrever(id, fornecedorId);
  }

  @Get(':id/minha-inscricao')
  @SomenteFornecedor()
  async minhaInscricao(@Param('id') id: string, @AtorAtual() ator: Ator) {
    if (!ehUuid(id)) throw new NotFoundException('Credenciamento não encontrado');
    return this.service.minhaInscricao(id, this.acesso.fornecedorDoToken(ator));
  }

  /** Razões do recurso (art. 165 I "a"): texto + arquivo opcional (multipart `arquivo`), só o próprio interessado. */
  @Post('inscricoes/:inscricaoId/recurso')
  @SomenteFornecedor()
  @UseInterceptors(FileInterceptor('arquivo', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  async recorrer(
    @Param('inscricaoId') inscricaoId: string,
    @Body() body: { razoes?: string },
    @UploadedFile() arquivo: ArquivoRecurso | undefined,
    @AtorAtual() ator: Ator,
  ) {
    if (!ehUuid(inscricaoId)) throw new NotFoundException('Inscrição não encontrada');
    return this.service.recorrer(inscricaoId, this.acesso.fornecedorDoToken(ator), body?.razoes, arquivo);
  }

  /** Arquivo das razões: órgão dono ou o próprio recorrente; público nunca. */
  @Get('inscricoes/:inscricaoId/recurso/arquivo')
  @OrgaoOuFornecedor()
  async arquivoDoRecurso(@Param('inscricaoId') inscricaoId: string, @AtorAtual() ator: Ator) {
    const dono = await this.service.donoDaInscricao(inscricaoId);
    if (!dono) throw new NotFoundException('Inscrição não encontrada');
    if (ehFornecedor(ator)) {
      if (ator.fornecedorId !== dono.fornecedorId) throw new NotFoundException('Inscrição não encontrada');
    } else {
      await this.acesso.assertOrgaoDoCredenciamento(ator, dono.licitacaoId, 'leitura');
    }
    const a = await this.service.arquivoDoRecurso(inscricaoId);
    return new StreamableFile(a.conteudo, { type: a.mime, disposition: `attachment; filename="${encodeURIComponent(a.nome)}"` });
  }

  @Post('inscricoes/:inscricaoId/denunciar')
  @SomenteFornecedor()
  async denunciar(@Param('inscricaoId') inscricaoId: string, @Body() body: { motivo?: string }, @AtorAtual() ator: Ator) {
    if (!ehUuid(inscricaoId)) throw new NotFoundException('Inscrição não encontrada');
    return this.service.denunciar(inscricaoId, this.acesso.fornecedorDoToken(ator), body?.motivo);
  }

  // ============ PROCESSO (órgão dono) ============

  @Get(':id')
  @SomenteOrgao()
  async detalhe(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDoCredenciamento(ator, id, 'leitura');
    return this.service.visaoOrgao(id);
  }

  @Get(':id/estatisticas')
  @SomenteOrgao()
  async estatisticas(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDoCredenciamento(ator, id, 'leitura');
    return this.service.estatisticas(id);
  }

  @Put(':id')
  @SomenteOrgao()
  async atualizar(@Param('id') id: string, @Body() dados: DadosCredenciamento, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDoCredenciamento(ator, id);
    const { orgao_id: _o, orgao: _org, credenciados: _c, ...resto } = (dados || {}) as any;
    return this.service.atualizar(id, resto);
  }

  @Patch(':id/publicar')
  @SomenteOrgao()
  async publicar(@Param('id') id: string, @Body() dados: Partial<DadosCredenciamento>, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDoCredenciamento(ator, id);
    return this.service.publicar(id, dados, atorTransicaoDe(ator));
  }

  @Patch(':id/iniciar-inscricoes')
  @SomenteOrgao()
  async iniciarInscricoes(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDoCredenciamento(ator, id);
    return this.service.iniciarInscricoes(id, atorTransicaoDe(ator));
  }

  @Patch(':id/encerrar')
  @SomenteOrgao()
  async encerrar(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDoCredenciamento(ator, id);
    return this.service.encerrar(id, atorTransicaoDe(ator));
  }

  @Get(':id/credenciados')
  @SomenteOrgao()
  async credenciados(@Param('id') id: string, @AtorAtual() ator: Ator, @Query('status') status?: string) {
    await this.acesso.assertOrgaoDoCredenciamento(ator, id, 'leitura');
    const v = await this.service.visaoOrgao(id);
    return status ? v.inscricoes.filter((i: any) => i.status === status) : v.inscricoes;
  }

  // ============ ANÁLISE DAS INSCRIÇÕES (órgão dono) ============

  @Get('inscricoes/:inscricaoId/habilitacao')
  @SomenteOrgao()
  async habilitacaoDaInscricao(@Param('inscricaoId') inscricaoId: string, @AtorAtual() ator: Ator) {
    const dono = await this.donoDaInscricao(ator, inscricaoId, 'leitura');
    const habilitacaoId = await this.service.habilitacaoDaInscricao(inscricaoId);
    return {
      inscricaoId,
      licitacaoId: dono.licitacaoId,
      habilitacao: habilitacaoId ? await this.habilitacao.visaoPorId(habilitacaoId, 'ORGAO') : null,
    };
  }

  @Post('inscricoes/:inscricaoId/deferir')
  @SomenteOrgao()
  async deferir(@Param('inscricaoId') inscricaoId: string, @Body() body: { observacao?: string }, @AtorAtual() ator: Ator) {
    await this.donoDaInscricao(ator, inscricaoId);
    return this.service.deferir(inscricaoId, body?.observacao, atorTransicaoDe(ator));
  }

  @Post('inscricoes/:inscricaoId/indeferir')
  @SomenteOrgao()
  async indeferir(@Param('inscricaoId') inscricaoId: string, @Body() body: { motivo?: string }, @AtorAtual() ator: Ator) {
    await this.donoDaInscricao(ator, inscricaoId);
    return this.service.indeferir(inscricaoId, body?.motivo, atorTransicaoDe(ator));
  }

  /** Reconsideração pelo agente (art. 165 §2º): reconsidera (provido) ou mantém e encaminha à autoridade. */
  @Post('inscricoes/:inscricaoId/recurso/reconsiderar')
  @SomenteOrgao()
  async reconsiderar(@Param('inscricaoId') inscricaoId: string, @Body() body: { reconsiderar?: boolean; fundamentacao?: string }, @AtorAtual() ator: Ator) {
    await this.donoDaInscricao(ator, inscricaoId);
    return this.service.reconsiderarRecurso(inscricaoId, body || {}, atorTransicaoDe(ator));
  }

  /** Decisão da autoridade superior (art. 165 §2º) sobre o recurso mantido pelo agente. */
  @Post('inscricoes/:inscricaoId/recurso/decisao-autoridade')
  @SomenteOrgao()
  async decisaoAutoridade(
    @Param('inscricaoId') inscricaoId: string,
    @Body() body: { provido?: boolean; fundamentacao?: string; nome?: string; cargo?: string },
    @AtorAtual() ator: Ator,
  ) {
    await this.donoDaInscricao(ator, inscricaoId);
    return this.service.decidirRecursoAutoridade(inscricaoId, body || {}, ator);
  }

  @Post('inscricoes/:inscricaoId/descredenciar')
  @SomenteOrgao()
  async descredenciar(@Param('inscricaoId') inscricaoId: string, @Body() body: { motivo?: string; iniciativa?: string }, @AtorAtual() ator: Ator) {
    await this.donoDaInscricao(ator, inscricaoId);
    return this.service.descredenciar(inscricaoId, body || {}, atorTransicaoDe(ator));
  }

  /** Rota antiga da tela: APROVADO → deferir; REPROVADO → indeferir (motivo). */
  @Patch('credenciados/:credenciadoId/analisar')
  @SomenteOrgao()
  async analisarLegado(
    @Param('credenciadoId') inscricaoId: string,
    @Body() dados: { status?: string; parecer?: string; motivo_reprovacao?: string },
    @AtorAtual() ator: Ator,
  ) {
    await this.donoDaInscricao(ator, inscricaoId);
    if (dados?.status === 'APROVADO') return this.service.deferir(inscricaoId, dados.parecer, atorTransicaoDe(ator));
    if (dados?.status === 'REPROVADO') return this.service.indeferir(inscricaoId, dados.motivo_reprovacao || dados.parecer, atorTransicaoDe(ator));
    throw new BadRequestException('Decisão: APROVADO (deferir) ou REPROVADO (indeferir, com motivo)');
  }

  // ============ CONTRATAÇÕES (órgão dono) ============

  @Get(':id/contratacoes')
  @SomenteOrgao()
  async contratacoes(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDoCredenciamento(ator, id, 'leitura');
    return this.service.listarContratacoes(id);
  }

  @Post(':id/contratacoes')
  @SomenteOrgao()
  async contratar(@Param('id') id: string, @Body() pedido: PedidoContratacao, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDoCredenciamento(ator, id);
    return this.service.contratar(id, pedido || {}, ator);
  }

  @Post('contratacoes/:contratacaoId/contrato')
  @SomenteOrgao()
  async gerarContrato(@Param('contratacaoId') contratacaoId: string, @AtorAtual() ator: Ator) {
    const dono = await this.service.donoDaContratacao(contratacaoId);
    if (!dono) throw new NotFoundException('Contratação não encontrada');
    await this.acesso.assertOrgaoDoCredenciamento(ator, dono.licitacaoId);
    return this.service.gerarContrato(contratacaoId, atorTransicaoDe(ator));
  }

  /** Conferência do sorteio: órgão dono ou fornecedor inscrito no credenciamento. */
  @Get('contratacoes/:contratacaoId/sorteio')
  @OrgaoOuFornecedor()
  async conferirSorteio(@Param('contratacaoId') contratacaoId: string, @AtorAtual() ator: Ator) {
    const dono = await this.service.donoDaContratacao(contratacaoId);
    if (!dono) throw new NotFoundException('Contratação não encontrada');
    if (ehFornecedor(ator)) {
      if (!(await this.service.fornecedorInscrito(dono.licitacaoId, ator.fornecedorId))) throw new NotFoundException('Contratação não encontrada');
    } else {
      await this.acesso.assertOrgaoDoCredenciamento(ator, dono.licitacaoId, 'leitura');
    }
    return this.service.conferirSorteioDaContratacao(contratacaoId);
  }
}
