import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { AcessoLicitacaoService, ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { AtorAtual, OrgaoOuFornecedor, SomenteFornecedor, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import { ehFornecedor } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';
import { atorTransicaoDe } from '../licitacoes/transicoes/transicoes.tipos';
import { DesempateService } from './desempate.service';

/**
 * DESEMPATE (Lei 14.133 art. 60; IN 73 art. 28) —
 * `/api/julgamento/sessao/:sessaoId/desempate/...`.
 *
 * AUTORIZAÇÃO (E1a): iniciar (disputa final), encerrar e sortear → órgão DONO;
 * nova proposta da disputa final → fornecedor do TOKEN, só no grupo em que foi
 * convocado; leitura: órgão dono (painel) ou licitante participante (os seus
 * desempates, sem valores de terceiros antes do encerramento); conferência do
 * sorteio → órgão dono ou licitante participante.
 */
@Controller('julgamento/sessao/:sessaoId/desempate')
export class DesempateController {
  constructor(
    private readonly desempate: DesempateService,
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

  @OrgaoOuFornecedor()
  @Get()
  async painel(@Param('sessaoId') sessaoId: string, @AtorAtual() ator: Ator) {
    const licitacaoId = await this.licitacaoDaSessao(sessaoId);
    if (ehFornecedor(ator)) {
      const fid = await this.acesso.assertFornecedorParticipa(ator, licitacaoId);
      return this.desempate.minhas(sessaoId, fid);
    }
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId, 'leitura');
    return this.desempate.painel(sessaoId);
  }

  @SomenteOrgao()
  @Post('unidade/:unidadeId/iniciar')
  async iniciar(
    @Param('sessaoId') sessaoId: string,
    @Param('unidadeId') unidadeId: string,
    @Body() body: { prazoMinutos?: number | null },
    @AtorAtual() ator: Ator,
  ) {
    this.exigirIds(unidadeId);
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId);
    return this.desempate.iniciar(sessaoId, unidadeId, { prazoMinutos: body?.prazoMinutos ?? null }, atorTransicaoDe(ator));
  }

  @SomenteOrgao()
  @Post(':desempateId/encerrar-disputa-final')
  async encerrar(@Param('sessaoId') sessaoId: string, @Param('desempateId') desempateId: string, @AtorAtual() ator: Ator) {
    this.exigirIds(desempateId);
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId);
    return this.desempate.encerrarDisputaFinal(sessaoId, desempateId, atorTransicaoDe(ator));
  }

  @SomenteOrgao()
  @Post(':desempateId/sortear')
  async sortear(@Param('sessaoId') sessaoId: string, @Param('desempateId') desempateId: string, @AtorAtual() ator: Ator) {
    this.exigirIds(desempateId);
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId);
    return this.desempate.sortear(sessaoId, desempateId, atorTransicaoDe(ator));
  }

  @SomenteFornecedor()
  @Post(':desempateId/oferta')
  async oferta(
    @Param('sessaoId') sessaoId: string,
    @Param('desempateId') desempateId: string,
    @Body() body: { valor?: number },
    @AtorAtual() ator: Ator,
  ) {
    this.exigirIds(desempateId);
    const fid = await this.acesso.assertFornecedorParticipa(ator, await this.licitacaoDaSessao(sessaoId));
    return this.desempate.enviarOferta(sessaoId, desempateId, fid, Number(body?.valor));
  }

  /** Refaz o sorteio a partir da entrada pública e confere o resultado registrado. */
  @OrgaoOuFornecedor()
  @Get(':desempateId/conferir')
  async conferir(@Param('sessaoId') sessaoId: string, @Param('desempateId') desempateId: string, @AtorAtual() ator: Ator) {
    this.exigirIds(desempateId);
    const licitacaoId = await this.licitacaoDaSessao(sessaoId);
    if (ehFornecedor(ator)) await this.acesso.assertFornecedorParticipa(ator, licitacaoId);
    else await this.acesso.assertOrgaoDaSessao(ator, sessaoId, 'leitura');
    return this.desempate.conferir(sessaoId, desempateId);
  }
}
