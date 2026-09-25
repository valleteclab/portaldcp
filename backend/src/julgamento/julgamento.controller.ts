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
import { AtorAtual, OrgaoOuFornecedor, SomenteFornecedor, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import { ehFornecedor } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';
import { atorTransicaoDe } from '../licitacoes/transicoes/transicoes.tipos';
import { AceitacaoService, TAMANHO_MAXIMO_ARQUIVO } from './aceitacao.service';
import { RankingService } from './ranking.service';

/**
 * JULGAMENTO (plano E3) — ranking único e ACEITAÇÃO da proposta.
 *
 * AUTORIZAÇÃO (E1a):
 *  - atos do agente de contratação (convocar, prorrogar, aceitar, recusar) e
 *    leitura do ranking/painel → @SomenteOrgao + órgão DONO da sessão;
 *  - atos do licitante (enviar a proposta adequada, pedir prorrogação) →
 *    @SomenteFornecedor, sempre o fornecedor do TOKEN e só a própria
 *    convocação (a de outro licitante responde 404);
 *  - arquivo da proposta: órgão dono ou o próprio licitante.
 */
@Controller('julgamento')
export class JulgamentoController {
  constructor(
    private readonly aceitacao: AceitacaoService,
    private readonly ranking: RankingService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  private async licitacaoDaSessao(sessaoId: string): Promise<string> {
    const dono = ehUuid(sessaoId) ? await this.acesso.donoDaSessao(sessaoId) : null;
    if (!dono) throw new NotFoundException('Sessão não encontrada');
    return dono.licitacaoId;
  }

  private exigirIds(...ids: string[]) {
    if (ids.some((i) => !ehUuid(i))) throw new NotFoundException('Não encontrado');
  }

  // --------------------------------------------------------------------------
  // Leituras
  // --------------------------------------------------------------------------

  /**
   * Aceitação: órgão dono → painel completo (ranking por unidade, situação,
   * convocação atual, histórico); licitante participante → só as próprias
   * convocações.
   */
  @OrgaoOuFornecedor()
  @Get('sessao/:sessaoId/aceitacao')
  async painel(@Param('sessaoId') sessaoId: string, @AtorAtual() ator: Ator) {
    const licitacaoId = await this.licitacaoDaSessao(sessaoId);
    if (ehFornecedor(ator)) {
      const fid = await this.acesso.assertFornecedorParticipa(ator, licitacaoId);
      return this.aceitacao.minhas(sessaoId, fid);
    }
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId, 'leitura');
    return this.aceitacao.painel(sessaoId);
  }

  /** Ranking único por unidade (com a situação de cada licitante) — órgão dono. */
  @SomenteOrgao()
  @Get('sessao/:sessaoId/ranking')
  async rankingDaSessao(@Param('sessaoId') sessaoId: string, @AtorAtual() ator: Ator) {
    const dono = await this.acesso.assertOrgaoDaSessao(ator, sessaoId, 'leitura');
    const { porUnidade, agregado } = await this.ranking.rankingAgregado(dono.licitacaoId);
    return {
      licitacaoId: dono.licitacaoId,
      unidades: porUnidade.map(({ unidade, ranking }) => ({
        tipo: unidade.tipo,
        id: unidade.id,
        numero: unidade.numero,
        descricao: unidade.descricao,
        encerrada: unidade.encerrada,
        ranking,
      })),
      licitantes: agregado,
    };
  }

  /** Arquivo da proposta adequada: órgão dono ou o próprio licitante. */
  @OrgaoOuFornecedor()
  @Get('sessao/:sessaoId/aceitacao/:aceitacaoId/arquivo')
  async arquivo(@Param('sessaoId') sessaoId: string, @Param('aceitacaoId') aceitacaoId: string, @AtorAtual() ator: Ator) {
    this.exigirIds(aceitacaoId);
    const licitacaoId = await this.licitacaoDaSessao(sessaoId);
    let fornecedorId: string | undefined;
    if (ehFornecedor(ator)) {
      fornecedorId = await this.acesso.assertFornecedorParticipa(ator, licitacaoId);
    } else {
      await this.acesso.assertOrgaoDaSessao(ator, sessaoId, 'leitura');
    }
    const a = await this.aceitacao.arquivo(sessaoId, aceitacaoId, fornecedorId);
    return new StreamableFile(a.conteudo, {
      type: a.mime,
      disposition: `inline; filename="${encodeURIComponent(a.nome)}"`,
    });
  }

  // --------------------------------------------------------------------------
  // Atos do agente de contratação (órgão dono)
  // --------------------------------------------------------------------------

  @SomenteOrgao()
  @Post('sessao/:sessaoId/aceitacao/unidade/:unidadeId/convocar')
  async convocar(
    @Param('sessaoId') sessaoId: string,
    @Param('unidadeId') unidadeId: string,
    @Body() body: { prazoHoras?: number },
    @AtorAtual() ator: Ator,
  ) {
    this.exigirIds(unidadeId);
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId);
    return this.aceitacao.convocar(sessaoId, unidadeId, { prazoHoras: body?.prazoHoras ?? null }, atorTransicaoDe(ator));
  }

  @SomenteOrgao()
  @Post('sessao/:sessaoId/aceitacao/:aceitacaoId/prorrogar')
  async prorrogar(
    @Param('sessaoId') sessaoId: string,
    @Param('aceitacaoId') aceitacaoId: string,
    @Body() body: { motivo?: string },
    @AtorAtual() ator: Ator,
  ) {
    this.exigirIds(aceitacaoId);
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId);
    return this.aceitacao.prorrogar(sessaoId, aceitacaoId, body?.motivo, atorTransicaoDe(ator));
  }

  @SomenteOrgao()
  @Post('sessao/:sessaoId/aceitacao/:aceitacaoId/aceitar')
  async aceitar(
    @Param('sessaoId') sessaoId: string,
    @Param('aceitacaoId') aceitacaoId: string,
    @Body() body: { justificativaExequibilidade?: string; justificativaPrecoAcimaEstimado?: string },
    @AtorAtual() ator: Ator,
  ) {
    this.exigirIds(aceitacaoId);
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId);
    return this.aceitacao.aceitar(
      sessaoId,
      aceitacaoId,
      {
        justificativaExequibilidade: body?.justificativaExequibilidade ?? null,
        justificativaPrecoAcimaEstimado: body?.justificativaPrecoAcimaEstimado ?? null,
      },
      atorTransicaoDe(ator),
    );
  }

  @SomenteOrgao()
  @Post('sessao/:sessaoId/aceitacao/:aceitacaoId/recusar')
  async recusar(
    @Param('sessaoId') sessaoId: string,
    @Param('aceitacaoId') aceitacaoId: string,
    @Body() body: { motivo?: string },
    @AtorAtual() ator: Ator,
  ) {
    this.exigirIds(aceitacaoId);
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId);
    return this.aceitacao.recusar(sessaoId, aceitacaoId, body?.motivo, atorTransicaoDe(ator));
  }

  // --------------------------------------------------------------------------
  // Atos do licitante (fornecedor do token, só a própria convocação)
  // --------------------------------------------------------------------------

  /** Proposta adequada ao último lance: multipart com `arquivo`, `valores` (JSON [{itemId, valorUnitario}]) e `observacao`. */
  @SomenteFornecedor()
  @Post('sessao/:sessaoId/aceitacao/:aceitacaoId/proposta')
  @UseInterceptors(FileInterceptor('arquivo', { storage: memoryStorage(), limits: { fileSize: TAMANHO_MAXIMO_ARQUIVO, files: 1 } }))
  async enviarProposta(
    @Param('sessaoId') sessaoId: string,
    @Param('aceitacaoId') aceitacaoId: string,
    @UploadedFile() arquivo: Express.Multer.File,
    @Body() body: { valores?: string; observacao?: string },
    @AtorAtual() ator: Ator,
  ) {
    this.exigirIds(aceitacaoId);
    const fid = await this.acesso.assertFornecedorParticipa(ator, await this.licitacaoDaSessao(sessaoId));
    return this.aceitacao.enviarProposta(sessaoId, aceitacaoId, fid, {
      arquivo: arquivo ?? null,
      valores: body?.valores ?? null,
      observacao: body?.observacao ?? null,
    });
  }

  @SomenteFornecedor()
  @Post('sessao/:sessaoId/aceitacao/:aceitacaoId/pedir-prorrogacao')
  async pedirProrrogacao(
    @Param('sessaoId') sessaoId: string,
    @Param('aceitacaoId') aceitacaoId: string,
    @Body() body: { motivo?: string },
    @AtorAtual() ator: Ator,
  ) {
    this.exigirIds(aceitacaoId);
    const fid = await this.acesso.assertFornecedorParticipa(ator, await this.licitacaoDaSessao(sessaoId));
    return this.aceitacao.pedirProrrogacao(sessaoId, aceitacaoId, fid, body?.motivo);
  }
}
