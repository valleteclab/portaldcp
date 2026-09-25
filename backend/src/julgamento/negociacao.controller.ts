import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { AcessoLicitacaoService, ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { AtorAtual, OrgaoOuFornecedor, SomenteFornecedor, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import { ehFornecedor } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';
import { atorTransicaoDe } from '../licitacoes/transicoes/transicoes.tipos';
import { NegociacaoService } from './negociacao.service';

/**
 * NEGOCIAÇÃO (plano E3 item 4 — Lei 14.133 art. 61; IN SEGES 73/2022 art. 30).
 * Rotas explícitas (fim do B8: nada de `:fornecedorId` competindo com
 * `encerrar`), todas sob `/api/julgamento/sessao/:sessaoId/negociacao`.
 *
 * AUTORIZAÇÃO (E1a):
 *  - atos do agente (abrir, contraproposta, encerrar, desclassificar) e o
 *    painel → @SomenteOrgao + órgão DONO da sessão;
 *  - resposta à contraproposta → @SomenteFornecedor, sempre o fornecedor do
 *    TOKEN e só a própria negociação (a de outro responde 404);
 *  - mensagem privada e leitura → órgão dono ou o próprio licitante.
 */
@Controller('julgamento')
export class NegociacaoController {
  constructor(
    private readonly negociacao: NegociacaoService,
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

  /** Órgão dono → painel por unidade; licitante participante → só as próprias negociações. */
  @OrgaoOuFornecedor()
  @Get('sessao/:sessaoId/negociacao')
  async painel(@Param('sessaoId') sessaoId: string, @AtorAtual() ator: Ator) {
    const licitacaoId = await this.licitacaoDaSessao(sessaoId);
    if (ehFornecedor(ator)) {
      const fid = await this.acesso.assertFornecedorParticipa(ator, licitacaoId);
      return this.negociacao.minhas(sessaoId, fid);
    }
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId, 'leitura');
    return this.negociacao.painel(sessaoId);
  }

  // --------------------------------------------------------------------------
  // Agente de contratação (órgão dono)
  // --------------------------------------------------------------------------

  @SomenteOrgao()
  @Post('sessao/:sessaoId/negociacao/unidade/:unidadeId/abrir')
  async abrir(
    @Param('sessaoId') sessaoId: string,
    @Param('unidadeId') unidadeId: string,
    @Body() body: { mensagem?: string },
    @AtorAtual() ator: Ator,
  ) {
    this.exigirIds(unidadeId);
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId);
    return this.negociacao.abrir(sessaoId, unidadeId, { mensagem: body?.mensagem ?? null }, atorTransicaoDe(ator));
  }

  @SomenteOrgao()
  @Post('sessao/:sessaoId/negociacao/:negociacaoId/contraproposta')
  async contraproposta(
    @Param('sessaoId') sessaoId: string,
    @Param('negociacaoId') negociacaoId: string,
    @Body() body: { valor?: number | string; mensagem?: string },
    @AtorAtual() ator: Ator,
  ) {
    this.exigirIds(negociacaoId);
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId);
    return this.negociacao.contraproposta(sessaoId, negociacaoId, { valor: body?.valor, mensagem: body?.mensagem }, atorTransicaoDe(ator));
  }

  @SomenteOrgao()
  @Post('sessao/:sessaoId/negociacao/:negociacaoId/encerrar')
  async encerrar(
    @Param('sessaoId') sessaoId: string,
    @Param('negociacaoId') negociacaoId: string,
    @Body() body: { motivo?: string },
    @AtorAtual() ator: Ator,
  ) {
    this.exigirIds(negociacaoId);
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId);
    return this.negociacao.encerrar(sessaoId, negociacaoId, body?.motivo, atorTransicaoDe(ator));
  }

  @SomenteOrgao()
  @Post('sessao/:sessaoId/negociacao/:negociacaoId/desclassificar')
  async desclassificar(
    @Param('sessaoId') sessaoId: string,
    @Param('negociacaoId') negociacaoId: string,
    @Body() body: { motivo?: string },
    @AtorAtual() ator: Ator,
  ) {
    this.exigirIds(negociacaoId);
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId);
    return this.negociacao.desclassificar(sessaoId, negociacaoId, body?.motivo, atorTransicaoDe(ator));
  }

  // --------------------------------------------------------------------------
  // Mensagem privada (agente ou o próprio licitante) e resposta do licitante
  // --------------------------------------------------------------------------

  @OrgaoOuFornecedor()
  @Post('sessao/:sessaoId/negociacao/:negociacaoId/mensagem')
  async mensagem(
    @Param('sessaoId') sessaoId: string,
    @Param('negociacaoId') negociacaoId: string,
    @Body() body: { texto?: string },
    @AtorAtual() ator: Ator,
  ) {
    this.exigirIds(negociacaoId);
    const licitacaoId = await this.licitacaoDaSessao(sessaoId);
    if (ehFornecedor(ator)) {
      const fid = await this.acesso.assertFornecedorParticipa(ator, licitacaoId);
      return this.negociacao.mensagem(sessaoId, negociacaoId, { tipo: 'LICITANTE', fornecedorId: fid }, body?.texto);
    }
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId);
    return this.negociacao.mensagem(sessaoId, negociacaoId, { tipo: 'AGENTE', ator: atorTransicaoDe(ator) }, body?.texto);
  }

  @SomenteFornecedor()
  @Post('sessao/:sessaoId/negociacao/:negociacaoId/responder')
  async responder(
    @Param('sessaoId') sessaoId: string,
    @Param('negociacaoId') negociacaoId: string,
    @Body() body: { aceitar?: boolean; motivo?: string },
    @AtorAtual() ator: Ator,
  ) {
    this.exigirIds(negociacaoId);
    const fid = await this.acesso.assertFornecedorParticipa(ator, await this.licitacaoDaSessao(sessaoId));
    return this.negociacao.responder(sessaoId, negociacaoId, fid, { aceitar: body?.aceitar, motivo: body?.motivo ?? null });
  }
}
