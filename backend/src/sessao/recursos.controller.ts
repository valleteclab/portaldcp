import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AcessoLicitacaoService, ehUuid } from '../auth/acesso/acesso-licitacao.service';
import {
  AtorAtual,
  AutenticacaoOpcional,
  OrgaoOuFornecedor,
  SomenteFornecedor,
  SomenteOrgao,
} from '../auth/acesso/acesso.decorators';
import { ehFornecedor } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';
import { atorTransicaoDe } from '../licitacoes/transicoes/transicoes.tipos';
import { AtorRecurso, RecursosService, TAMANHO_MAXIMO_ARQUIVO_RECURSO, VisaoRecursos } from './recursos.service';

const UPLOAD = FileInterceptor('arquivo', {
  storage: memoryStorage(),
  limits: { fileSize: TAMANHO_MAXIMO_ARQUIVO_RECURSO, files: 1 },
});

/**
 * RECURSOS ADMINISTRATIVOS (plano E5 — Lei 14.133/2021 arts. 165 e 168; IN
 * SEGES 73/2022 art. 40). Rotas em /api/recursos.
 *
 * AUTORIZAÇÃO:
 *  - agente de contratação (órgão DONO): abrir a janela de intenção, admitir /
 *    não admitir, reconsiderar ou manter;
 *  - autoridade superior (conta do órgão dono ou usuário ADMIN do órgão, nunca
 *    quem manteve a decisão): decidir o recurso encaminhado;
 *  - licitante (fornecedor do TOKEN, com proposta na licitação): manifestar a
 *    intenção, razões (só o recorrente), contrarrazões (só os demais);
 *  - leitura: órgão dono e licitantes veem todo o processo recursal e baixam
 *    os arquivos; o público (e outros órgãos) vê só os recursos decididos.
 *  O órgão NÃO registra razões/contrarrazões em nome de licitante (E1a → E5).
 */
@Controller('recursos')
export class RecursosController {
  constructor(
    private readonly recursos: RecursosService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  private async licitacaoDaSessao(sessaoId: string): Promise<string> {
    const dono = ehUuid(sessaoId) ? await this.acesso.donoDaSessao(sessaoId) : null;
    if (!dono) throw new NotFoundException('Sessão não encontrada');
    return dono.licitacaoId;
  }

  private async atorRecurso(ator: Ator): Promise<AtorRecurso & { role?: string | null; admin?: boolean }> {
    const t = atorTransicaoDe(ator);
    return { ...t, nome: await this.recursos.nomeDoAtor(t), role: ator.role, admin: ator.admin };
  }

  /** Recurso + órgão dono (escrita) — 404 se não existe, 403 se de outro órgão. */
  private async recursoDoOrgao(ator: Ator, recursoId: string) {
    const r = await this.recursos.buscar(recursoId);
    await this.acesso.assertOrgaoDaSessao(ator, r.sessao_id);
    return r;
  }

  /** Quem lê: órgão dono → tudo; licitante → processo recursal; demais → só decididos. */
  private async visao(ator: Ator | null, licitacaoId: string): Promise<VisaoRecursos> {
    if (!ator) return { tipo: 'PUBLICO' };
    const relacao = await this.acesso.relacaoComLicitacao(ator, licitacaoId);
    if (relacao === 'ADMIN' || relacao === 'ORGAO_DONO') return { tipo: 'ORGAO' };
    if (ehFornecedor(ator) && (await this.recursos.ehLicitante(licitacaoId, ator.fornecedorId))) {
      return { tipo: 'FORNECEDOR', fornecedorId: ator.fornecedorId };
    }
    return { tipo: 'PUBLICO' };
  }

  // --------------------------------------------------------------------------
  // Leitura
  // --------------------------------------------------------------------------

  @AutenticacaoOpcional()
  @Get('sessao/:sessaoId')
  async painel(@Param('sessaoId') sessaoId: string, @AtorAtual() ator: Ator | null) {
    const licitacaoId = await this.licitacaoDaSessao(sessaoId);
    return this.recursos.painel(sessaoId, await this.visao(ator, licitacaoId));
  }

  /** Arquivo das razões: órgão dono ou licitante da licitação. */
  @OrgaoOuFornecedor()
  @Get(':recursoId/razoes/arquivo')
  async arquivoRazoes(@Param('recursoId') recursoId: string, @AtorAtual() ator: Ator) {
    const r = await this.recursos.buscar(recursoId);
    if ((await this.visao(ator, r.licitacao_id)).tipo === 'PUBLICO') throw new NotFoundException('Recurso não encontrado');
    const a = await this.recursos.arquivoRazoes(recursoId);
    return new StreamableFile(a.conteudo, { type: a.mime, disposition: `inline; filename="${encodeURIComponent(a.nome)}"` });
  }

  /** Arquivo das contrarrazões: órgão dono ou licitante da licitação. */
  @OrgaoOuFornecedor()
  @Get(':recursoId/contrarrazoes/:contrarrazaoId/arquivo')
  async arquivoContrarrazao(
    @Param('recursoId') recursoId: string,
    @Param('contrarrazaoId') contrarrazaoId: string,
    @AtorAtual() ator: Ator,
  ) {
    if (!ehUuid(contrarrazaoId)) throw new NotFoundException('Contrarrazões não encontradas');
    const r = await this.recursos.buscar(recursoId);
    if ((await this.visao(ator, r.licitacao_id)).tipo === 'PUBLICO') throw new NotFoundException('Recurso não encontrado');
    const a = await this.recursos.arquivoContrarrazao(recursoId, contrarrazaoId);
    return new StreamableFile(a.conteudo, { type: a.mime, disposition: `inline; filename="${encodeURIComponent(a.nome)}"` });
  }

  // --------------------------------------------------------------------------
  // Agente de contratação (órgão dono)
  // --------------------------------------------------------------------------

  /** Abre a janela de intenção de recurso (≥ 10 min — IN 73 art. 40). */
  @SomenteOrgao()
  @Post('sessao/:sessaoId/janela')
  async abrirJanela(@Param('sessaoId') sessaoId: string, @Body() body: { minutos?: number }, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId);
    return this.recursos.abrirJanela(sessaoId, { minutos: body?.minutos ?? null }, await this.atorRecurso(ator));
  }

  @SomenteOrgao()
  @Post(':recursoId/admitir')
  async admitir(@Param('recursoId') recursoId: string, @AtorAtual() ator: Ator) {
    await this.recursoDoOrgao(ator, recursoId);
    return this.recursos.admitir(recursoId, await this.atorRecurso(ator));
  }

  /** Não admissão: `{ pressuposto: LEGITIMIDADE|INTERESSE|MOTIVACAO|TEMPESTIVIDADE, motivo }`. */
  @SomenteOrgao()
  @Post(':recursoId/recusar')
  async recusar(@Param('recursoId') recursoId: string, @Body() body: { pressuposto?: string; motivo?: string }, @AtorAtual() ator: Ator) {
    await this.recursoDoOrgao(ator, recursoId);
    return this.recursos.recusar(recursoId, body ?? {}, await this.atorRecurso(ator));
  }

  /** Juízo de reconsideração (art. 165 §2º): `{ reconsiderar: boolean, fundamentacao }`. */
  @SomenteOrgao()
  @Post(':recursoId/reconsiderar')
  async reconsiderar(
    @Param('recursoId') recursoId: string,
    @Body() body: { reconsiderar?: boolean; fundamentacao?: string },
    @AtorAtual() ator: Ator,
  ) {
    await this.recursoDoOrgao(ator, recursoId);
    return this.recursos.reconsiderar(recursoId, body ?? {}, await this.atorRecurso(ator));
  }

  /** Decisão da autoridade superior (art. 165 §2º): `{ provido, fundamentacao, nome, cargo }`. */
  @SomenteOrgao()
  @Post(':recursoId/decisao-autoridade')
  async decidirAutoridade(
    @Param('recursoId') recursoId: string,
    @Body() body: { provido?: boolean; fundamentacao?: string; nome?: string; cargo?: string },
    @AtorAtual() ator: Ator,
  ) {
    await this.recursoDoOrgao(ator, recursoId);
    return this.recursos.decidirAutoridade(recursoId, body ?? {}, await this.atorRecurso(ator));
  }

  // --------------------------------------------------------------------------
  // Licitante (fornecedor do token)
  // --------------------------------------------------------------------------

  /** Intenção de recurso: `{ motivacao, atoRecorrido, fornecedorAlvoId?, unidadeId? }`. */
  @SomenteFornecedor()
  @Post('sessao/:sessaoId/intencao')
  async registrarIntencao(
    @Param('sessaoId') sessaoId: string,
    @Body() body: { fornecedorId?: string; motivacao?: string; atoRecorrido?: string; fornecedorAlvoId?: string; unidadeId?: string },
    @AtorAtual() ator: Ator,
  ) {
    const fid = this.acesso.fornecedorDoToken(ator, body?.fornecedorId);
    await this.licitacaoDaSessao(sessaoId);
    return this.recursos.registrarIntencao(sessaoId, fid, body ?? {});
  }

  /** Razões (só o recorrente): multipart `texto` + `arquivo` (opcional; PDF/JPG/PNG até 10 MB). */
  @SomenteFornecedor()
  @Post(':recursoId/razoes')
  @UseInterceptors(UPLOAD)
  async razoes(
    @Param('recursoId') recursoId: string,
    @UploadedFile() arquivo: Express.Multer.File,
    @Body() body: { texto?: string; fornecedorId?: string },
    @AtorAtual() ator: Ator,
  ) {
    const fid = this.acesso.fornecedorDoToken(ator, body?.fornecedorId);
    return this.recursos.apresentarRazoes(recursoId, fid, { texto: body?.texto, arquivo: arquivo ?? null });
  }

  /** Contrarrazões (demais licitantes): multipart `texto` + `arquivo` (opcional). */
  @SomenteFornecedor()
  @Post(':recursoId/contrarrazoes')
  @UseInterceptors(UPLOAD)
  async contrarrazoes(
    @Param('recursoId') recursoId: string,
    @UploadedFile() arquivo: Express.Multer.File,
    @Body() body: { texto?: string; fornecedorId?: string },
    @AtorAtual() ator: Ator,
  ) {
    const fid = this.acesso.fornecedorDoToken(ator, body?.fornecedorId);
    return this.recursos.apresentarContrarrazoes(recursoId, fid, { texto: body?.texto, arquivo: arquivo ?? null });
  }
}
