import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { createReadStream } from 'fs';
import { AcessoLicitacaoService, ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { AtorAtual, AutenticacaoOpcional, OrgaoOuFornecedor, SomenteFornecedor, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import { ehFornecedor, ehOrgao } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';
import { atorTransicaoDe } from '../licitacoes/transicoes/transicoes.tipos';
import { DialogoService, TAMANHO_MAXIMO_GRAVACAO, VisaoDialogo } from './dialogo.service';

/**
 * DIÁLOGO COMPETITIVO (Lei 14.133 art. 32; plano E7c) — `/api/dialogo-competitivo/licitacao/:id/...`
 *
 * AUTORIZAÇÃO (E1a) e SIGILO (§1º III e IV):
 *  - edital, comissão, pré-seleção, reuniões (agenda/registro/cancelamento),
 *    conclusão e fase competitiva → órgão DONO;
 *  - manifestação de interesse e soluções → o licitante do TOKEN;
 *  - leituras: órgão dono (tudo); licitante (o seu registro, as suas reuniões,
 *    atas, gravações e soluções); público (edital, etapa e contagens).
 */
@Controller('dialogo-competitivo/licitacao/:licitacaoId')
export class DialogoController {
  constructor(
    private readonly dialogo: DialogoService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  private async existe(id: string): Promise<string> {
    if (!ehUuid(id) || !(await this.acesso.orgaoDaLicitacao(id))) throw new NotFoundException('Diálogo competitivo não encontrado');
    return id;
  }

  private async visao(ator: Ator | null, id: string): Promise<VisaoDialogo> {
    if (ator?.admin) return { tipo: 'ORGAO' };
    if (ator && ehOrgao(ator) && (await this.acesso.orgaoDaLicitacao(id)) === ator.orgaoId) return { tipo: 'ORGAO' };
    if (ator && ehFornecedor(ator)) return { tipo: 'FORNECEDOR', fornecedorId: ator.fornecedorId };
    return { tipo: 'PUBLICO' };
  }

  @AutenticacaoOpcional()
  @Get()
  async painel(@Param('licitacaoId') id: string, @AtorAtual() ator: Ator | null) {
    return this.dialogo.painel(await this.existe(id), await this.visao(ator, id));
  }

  @SomenteOrgao()
  @Put('configuracao')
  async configuracao(@Param('licitacaoId') id: string, @Body() body: Record<string, any>, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    return this.dialogo.salvarConfiguracao(id, body ?? {});
  }

  @SomenteOrgao()
  @Put('comissao')
  async comissao(@Param('licitacaoId') id: string, @Body() body: { membros?: any[] }, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    return this.dialogo.definirComissao(id, body?.membros ?? []);
  }

  // --- Manifestação e pré-seleção --------------------------------------------

  @SomenteFornecedor()
  @Post('manifestacao')
  @UseInterceptors(FileInterceptor('documento', { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  async manifestar(@Param('licitacaoId') id: string, @Body() body: { manifestacao?: string }, @UploadedFile() arquivo: Express.Multer.File, @AtorAtual() ator: Ator) {
    return this.dialogo.manifestarInteresse(await this.existe(id), this.acesso.fornecedorDoToken(ator), body ?? {}, arquivo ?? null);
  }

  @SomenteOrgao()
  @Post('participantes/:participanteId/pre-selecao')
  async preSelecao(@Param('licitacaoId') id: string, @Param('participanteId') pid: string, @Body() body: Record<string, any>, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    if (!ehUuid(pid)) throw new NotFoundException('Interessado não encontrado');
    return this.dialogo.decidirPreSelecao(id, pid, body ?? {}, atorTransicaoDe(ator));
  }

  /** Pedido de reconsideração da não seleção (art. 165, II) — só o próprio interessado (token). */
  @SomenteFornecedor()
  @Post('reconsideracao')
  @UseInterceptors(FileInterceptor('arquivo', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async reconsideracao(@Param('licitacaoId') id: string, @Body() body: { razoes?: string }, @UploadedFile() arquivo: Express.Multer.File, @AtorAtual() ator: Ator) {
    return this.dialogo.pedirReconsideracao(await this.existe(id), this.acesso.fornecedorDoToken(ator), body ?? {}, arquivo ?? null);
  }

  @SomenteOrgao()
  @Post('participantes/:participanteId/reconsideracao/decisao')
  async decidirReconsideracao(@Param('licitacaoId') id: string, @Param('participanteId') pid: string, @Body() body: { provido?: boolean; fundamentacao?: string }, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    if (!ehUuid(pid)) throw new NotFoundException('Interessado não encontrado');
    return this.dialogo.decidirReconsideracao(id, pid, body ?? {}, atorTransicaoDe(ator));
  }

  @SomenteOrgao()
  @Post('iniciar-dialogo')
  async iniciar(@Param('licitacaoId') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    return this.dialogo.iniciarDialogo(id);
  }

  // --- Reuniões e soluções ---------------------------------------------------

  @SomenteOrgao()
  @Post('reunioes')
  async agendar(@Param('licitacaoId') id: string, @Body() body: Record<string, any>, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    return this.dialogo.agendarReuniao(id, body ?? {});
  }

  @SomenteOrgao()
  @Post('reunioes/:reuniaoId/registro')
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'ata', maxCount: 1 }, { name: 'gravacao', maxCount: 1 }], { storage: memoryStorage(), limits: { fileSize: TAMANHO_MAXIMO_GRAVACAO, files: 2 } }),
  )
  async registrar(
    @Param('licitacaoId') id: string,
    @Param('reuniaoId') rid: string,
    @Body() body: Record<string, any>,
    @UploadedFiles() arquivos: { ata?: Express.Multer.File[]; gravacao?: Express.Multer.File[] },
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    if (!ehUuid(rid)) throw new NotFoundException('Reunião não encontrada');
    return this.dialogo.registrarReuniao(id, rid, body ?? {}, { ata: arquivos?.ata?.[0] ?? null, gravacao: arquivos?.gravacao?.[0] ?? null }, atorTransicaoDe(ator));
  }

  @SomenteOrgao()
  @Post('reunioes/:reuniaoId/cancelar')
  async cancelar(@Param('licitacaoId') id: string, @Param('reuniaoId') rid: string, @Body() body: { motivo?: string }, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    if (!ehUuid(rid)) throw new NotFoundException('Reunião não encontrada');
    return this.dialogo.cancelarReuniao(id, rid, body?.motivo ?? '');
  }

  @SomenteFornecedor()
  @Post('documentos')
  @UseInterceptors(FileInterceptor('arquivo', { storage: memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 1 } }))
  async documento(@Param('licitacaoId') id: string, @Body() body: Record<string, any>, @UploadedFile() arquivo: Express.Multer.File, @AtorAtual() ator: Ator) {
    return this.dialogo.enviarDocumento(await this.existe(id), this.acesso.fornecedorDoToken(ator), body ?? {}, arquivo ?? null);
  }

  /** tipo = ata | gravacao | documento | manifestacao | reconsideracao — órgão dono ou o próprio licitante (sigilo). */
  @OrgaoOuFornecedor()
  @Get('arquivos/:tipo/:arquivoId')
  async arquivo(@Param('licitacaoId') id: string, @Param('tipo') tipo: string, @Param('arquivoId') aid: string, @AtorAtual() ator: Ator) {
    if (!ehUuid(aid)) throw new NotFoundException('Arquivo não encontrado');
    const a = await this.dialogo.arquivo(await this.existe(id), tipo, aid, await this.visao(ator, id));
    if (a.conteudo) return new StreamableFile(a.conteudo, { type: a.mime ?? 'application/octet-stream', disposition: `inline; filename="${encodeURIComponent(a.nome)}"` });
    return new StreamableFile(createReadStream(a.caminho!), { disposition: `inline; filename="${encodeURIComponent(a.nome)}"` });
  }

  // --- Conclusão e fase competitiva -----------------------------------------

  @SomenteOrgao()
  @Post('concluir-dialogo')
  async concluir(@Param('licitacaoId') id: string, @Body() body: { motivacao?: string; solucao_identificada?: string }, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    return this.dialogo.concluirDialogo(id, body ?? {}, atorTransicaoDe(ator));
  }

  @SomenteOrgao()
  @Post('fase-competitiva')
  @UseInterceptors(FileInterceptor('edital', { storage: memoryStorage(), limits: { fileSize: 30 * 1024 * 1024, files: 1 } }))
  async faseCompetitiva(@Param('licitacaoId') id: string, @Body() body: Record<string, any>, @UploadedFile() edital: Express.Multer.File, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    return this.dialogo.abrirFaseCompetitiva(id, body ?? {}, edital ?? null, atorTransicaoDe(ator));
  }

  @AutenticacaoOpcional()
  @Get('edital-fase-competitiva')
  async edital(@Param('licitacaoId') id: string, @AtorAtual() ator: Ator | null) {
    const e = await this.dialogo.editalCompetitivo(await this.existe(id), await this.visao(ator, id));
    return new StreamableFile(createReadStream(e.caminho), { type: 'application/pdf', disposition: `inline; filename="${e.nome}"` });
  }
}
