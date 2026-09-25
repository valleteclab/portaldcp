import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectDataSource } from '@nestjs/typeorm';
import { memoryStorage } from 'multer';
import { DataSource } from 'typeorm';
import { AcessoLicitacaoService, ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { AtorAtual, AutenticacaoOpcional, SomenteFornecedor, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import { ehFornecedor } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';
import { calendarioDoOrgao } from '../common/prazos/calendario';
import { FeriadosService } from '../feriados/feriados.service';
import { formatarRelogioBrasilia } from '../impugnacoes/prazo-manifestacao.util';
import { licitacaoEhPublica } from '../licitacoes/licitacao-visao.util';
import { atorTransicaoDe } from '../licitacoes/transicoes/transicoes.tipos';
import { EditalService, TAMANHO_MAXIMO_EDITAL } from './edital.service';
import { ExtincaoService } from './extincao.service';
import { avaliarPrazosDePublicacao, exigeNaturezaDoObjeto, naturezaEfetiva } from './regras-publicacao';
import { RetificacaoService } from './retificacao.service';

const UPLOAD_EDITAL = FileInterceptor('arquivo', {
  storage: memoryStorage(),
  limits: { fileSize: TAMANHO_MAXIMO_EDITAL, files: 1 },
});

function json(v: any): any {
  if (v == null || v === '') return undefined;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(String(v));
  } catch {
    throw new BadRequestException('Campo JSON inválido');
  }
}

/**
 * PUBLICAÇÃO (plano E7a) — /api/publicacao.
 *  - prazos: prazo mínimo do art. 55 e data mínima de abertura no calendário
 *    do órgão (órgão dono) — a tela de "Publicar" mostra e bloqueia;
 *  - edital: anexar (fase interna), versão vigente e histórico (público
 *    depois da divulgação), download de cada versão;
 *  - retificação (art. 55 §1º): órgão dono, multipart com a nova versão;
 *    licitante confirma a proposta;
 *  - revogação/anulação em dois tempos (art. 71 §3º): intenção (órgão dono),
 *    manifestação (licitante), leitura por papel.
 */
@Controller('publicacao')
export class PublicacaoController {
  constructor(
    private readonly acesso: AcessoLicitacaoService,
    private readonly edital: EditalService,
    private readonly retificacao: RetificacaoService,
    private readonly extincao: ExtincaoService,
    private readonly feriados: FeriadosService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private validarId(id: string) {
    if (!ehUuid(id)) throw new NotFoundException('Licitação não encontrada');
  }

  private async licitacao(id: string): Promise<any> {
    const [l] = await this.dataSource.query(
      `SELECT id::text AS id, orgao_id::text AS orgao_id, fase::text AS fase, modalidade::text AS modalidade,
              tipo_contratacao::text AS tipo_contratacao, criterio_julgamento::text AS criterio_julgamento,
              regime_execucao::text AS regime_execucao, natureza_objeto, selecao_externa,
              data_publicacao_edital, data_limite_impugnacao, data_inicio_acolhimento, data_fim_acolhimento, data_abertura_sessao
         FROM licitacoes WHERE id::text = $1`,
      [id],
    );
    if (!l) throw new NotFoundException('Licitação não encontrada');
    return l;
  }

  /** Leitura: órgão dono/admin sempre; os demais só depois da divulgação. */
  private async podeLer(ator: Ator | null, id: string): Promise<{ dono: boolean; lic: any }> {
    const lic = await this.licitacao(id);
    const relacao = ator ? await this.acesso.relacaoComLicitacao(ator, id) : null;
    const dono = relacao === 'ADMIN' || relacao === 'ORGAO_DONO';
    if (!dono && !licitacaoEhPublica(lic)) throw new NotFoundException('Licitação não encontrada');
    return { dono, lic };
  }

  // ---------------------------------------------------------------------------
  // Prazos (art. 55)
  // ---------------------------------------------------------------------------

  @Get('licitacao/:id/prazos')
  @SomenteOrgao()
  async prazos(
    @Param('id') id: string,
    @AtorAtual() ator: Ator,
    @Query() q: Record<string, string>,
  ) {
    this.validarId(id);
    await this.acesso.assertOrgaoDaLicitacao(ator, id, 'leitura');
    const lic = await this.licitacao(id);
    const agora = new Date();
    const cronograma: Record<string, any> = {};
    for (const c of ['data_publicacao_edital', 'data_limite_impugnacao', 'data_inicio_acolhimento', 'data_fim_acolhimento', 'data_abertura_sessao']) {
      cronograma[c] = q[c] || lic[c] || null;
    }
    const dados = {
      modalidade: lic.modalidade,
      tipo_contratacao: q.tipo_contratacao || lic.tipo_contratacao,
      criterio_julgamento: q.criterio_julgamento || lic.criterio_julgamento,
      regime_execucao: q.regime_execucao || lic.regime_execucao,
      natureza_objeto: q.natureza_objeto || lic.natureza_objeto,
      orgao_id: lic.orgao_id,
    };
    const av = avaliarPrazosDePublicacao(dados, cronograma, agora, { exigirDatas: false });
    const ate = av.minimo_abertura ?? agora;
    return {
      modalidade: lic.modalidade,
      dias_uteis: av.prazo.dias,
      fundamento: av.prazo.fundamento,
      descricao: av.prazo.descricao,
      hipoteses: av.prazo.hipoteses,
      natureza_objeto: naturezaEfetiva(dados),
      exige_natureza_objeto: exigeNaturezaDoObjeto(dados) && !naturezaEfetiva(dados),
      divulgacao: formatarRelogioBrasilia(av.divulgacao),
      vencimento_prazo: av.vencimento ? formatarRelogioBrasilia(av.vencimento) : null,
      data_minima_abertura: av.minimo_abertura ? formatarRelogioBrasilia(av.minimo_abertura) : null,
      pendencias: av.pendencias,
      feriados_no_periodo: this.feriados.diasSemExpediente(lic.orgao_id, av.divulgacao, ate),
      contagem:
        'Art. 183: exclui o dia da divulgação e inclui o do vencimento; só contam dias com expediente no órgão (feriados e pontos facultativos adotados não contam). A abertura pode ocorrer a partir das 00:00 do último dia útil do prazo.',
      calendario_orgao: !!calendarioDoOrgao(lic.orgao_id),
    };
  }

  // ---------------------------------------------------------------------------
  // Edital
  // ---------------------------------------------------------------------------

  @Get('licitacao/:id/edital')
  @AutenticacaoOpcional()
  async editalDaLicitacao(@Param('id') id: string, @AtorAtual() ator: Ator | null) {
    this.validarId(id);
    const { dono } = await this.podeLer(ator, id);
    const vigente = await this.edital.metaVigente(id);
    const versoes = await this.edital.versoes(id);
    const visiveis = dono ? versoes : versoes.filter((v: any) => v.status !== 'RASCUNHO');
    return {
      vigente: vigente && (dono || vigente.status !== 'RASCUNHO')
        ? { documento_id: vigente.documento_id, origem: vigente.origem, tipo: vigente.tipo, versao: vigente.versao, hash: vigente.hash, nome: vigente.nome_original, status: vigente.status }
        : null,
      versoes: visiveis,
      retificacoes: await this.retificacao.listar(id),
    };
  }

  @Get('licitacao/:id/edital/:documentoId/arquivo')
  @AutenticacaoOpcional()
  async arquivoEdital(@Param('id') id: string, @Param('documentoId') documentoId: string, @AtorAtual() ator: Ator | null) {
    this.validarId(id);
    if (!ehUuid(documentoId)) throw new NotFoundException('Versão do edital não encontrada');
    const { dono } = await this.podeLer(ator, id);
    const a = await this.edital.arquivoDaVersao(id, documentoId);
    if (!dono && a.status === 'RASCUNHO') throw new NotFoundException('Versão do edital não encontrada');
    return new StreamableFile(a.bytes, {
      type: 'application/pdf',
      disposition: `inline; filename="${encodeURIComponent(a.nome)}"`,
    });
  }

  @Post('licitacao/:id/edital')
  @SomenteOrgao()
  @UseInterceptors(UPLOAD_EDITAL)
  async anexarEdital(@Param('id') id: string, @UploadedFile() arquivo: Express.Multer.File, @AtorAtual() ator: Ator) {
    this.validarId(id);
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    const doc = await this.edital.anexar(id, arquivo as any, { id: ator.usuarioId ?? ator.id, nome: null });
    return { id: doc.id, versao: doc.versao, hash: doc.hash_arquivo, status: doc.status };
  }

  // ---------------------------------------------------------------------------
  // Retificação (art. 55 §1º)
  // ---------------------------------------------------------------------------

  @Post('licitacao/:id/retificar')
  @SomenteOrgao()
  @UseInterceptors(UPLOAD_EDITAL)
  async retificar(
    @Param('id') id: string,
    @UploadedFile() arquivo: Express.Multer.File,
    @Body() body: Record<string, any>,
    @AtorAtual() ator: Ator,
  ) {
    this.validarId(id);
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    const r = await this.retificacao.retificar(
      id,
      {
        motivo: body?.motivo,
        alteracoes: body?.alteracoes,
        afeta_propostas: body?.afeta_propostas,
        justificativa_nao_afeta: body?.justificativa_nao_afeta ?? null,
        cronograma: json(body?.cronograma) ?? null,
        campos: json(body?.campos) ?? null,
      },
      arquivo as any,
      atorTransicaoDe(ator),
    );
    return { retificacao: r.retificacao, fase: r.licitacao.fase, situacao: r.licitacao.situacao };
  }

  @Get('licitacao/:id/retificacoes')
  @AutenticacaoOpcional()
  async retificacoes(@Param('id') id: string, @AtorAtual() ator: Ator | null) {
    this.validarId(id);
    await this.podeLer(ator, id);
    return this.retificacao.listar(id);
  }

  @Get('licitacao/:id/minha-proposta')
  @SomenteFornecedor()
  async minhaSituacao(@Param('id') id: string, @AtorAtual() ator: Ator) {
    this.validarId(id);
    const fornecedorId = this.acesso.fornecedorDoToken(ator);
    return this.retificacao.situacaoDoLicitante(id, fornecedorId);
  }

  @Post('licitacao/:id/confirmar-proposta')
  @SomenteFornecedor()
  async confirmarProposta(@Param('id') id: string, @AtorAtual() ator: Ator) {
    this.validarId(id);
    const fornecedorId = this.acesso.fornecedorDoToken(ator);
    return this.retificacao.confirmarProposta(id, fornecedorId);
  }

  // ---------------------------------------------------------------------------
  // Revogação / anulação em dois tempos (art. 71 §3º)
  // ---------------------------------------------------------------------------

  @Post('licitacao/:id/intencao-extincao')
  @SomenteOrgao()
  async abrirIntencao(@Param('id') id: string, @Body() body: { tipo: string; motivo: string; prazo_dias_uteis?: number }, @AtorAtual() ator: Ator) {
    this.validarId(id);
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    return this.extincao.abrirIntencao(id, body ?? ({} as any), atorTransicaoDe(ator));
  }

  @Post('licitacao/:id/intencao-extincao/cancelar')
  @SomenteOrgao()
  async cancelarIntencao(@Param('id') id: string, @Body() body: { motivo: string }, @AtorAtual() ator: Ator) {
    this.validarId(id);
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    return this.extincao.cancelarIntencao(id, body?.motivo, atorTransicaoDe(ator));
  }

  @Get('licitacao/:id/extincao')
  @AutenticacaoOpcional()
  async consultarExtincao(@Param('id') id: string, @AtorAtual() ator: Ator | null) {
    this.validarId(id);
    const { dono } = await this.podeLer(ator, id);
    if (dono) return this.extincao.consultar(id, { tipo: 'ORGAO' });
    if (ehFornecedor(ator)) return this.extincao.consultar(id, { tipo: 'FORNECEDOR', fornecedorId: ator.fornecedorId });
    return this.extincao.consultar(id, { tipo: 'PUBLICO' });
  }

  @Post('licitacao/:id/extincao/manifestacao')
  @SomenteFornecedor()
  async manifestar(@Param('id') id: string, @Body() body: { texto: string }, @AtorAtual() ator: Ator) {
    this.validarId(id);
    const fornecedorId = this.acesso.fornecedorDoToken(ator);
    return this.extincao.manifestar(id, fornecedorId, body?.texto);
  }
}
