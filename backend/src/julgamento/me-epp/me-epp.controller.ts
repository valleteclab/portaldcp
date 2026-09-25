import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { AcessoLicitacaoService, ehUuid } from '../../auth/acesso/acesso-licitacao.service';
import { AtorAtual, OrgaoOuFornecedor, SomenteFornecedor, SomenteOrgao } from '../../auth/acesso/acesso.decorators';
import { ehFornecedor } from '../../auth/acesso/ator';
import type { Ator } from '../../auth/acesso/ator';
import { atorTransicaoDe } from '../../licitacoes/transicoes/transicoes.tipos';
import { MeEppService } from './me-epp.service';

/**
 * BENEFÍCIO ME/EPP (plano E3 item 3 — LC 123/2006 arts. 44–48).
 *
 * AUTORIZAÇÃO (E1a):
 *  - painel do desempate, conferência do art. 48 e geração das cotas →
 *    @SomenteOrgao + órgão DONO;
 *  - a ME/EPP convocada responde SOZINHA (exercer/declinar) → @SomenteFornecedor,
 *    sempre o fornecedor do TOKEN e só a própria convocação (a de outra
 *    licitante responde 404). O agente de contratação NÃO responde pela ME/EPP.
 */
@Controller('julgamento')
export class MeEppController {
  constructor(
    private readonly meEpp: MeEppService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  private async licitacaoDaSessao(sessaoId: string): Promise<string> {
    const dono = ehUuid(sessaoId) ? await this.acesso.donoDaSessao(sessaoId) : null;
    if (!dono) throw new NotFoundException('Sessão não encontrada');
    return dono.licitacaoId;
  }

  /** Órgão dono → painel (intervalo, fila, convocação, histórico); licitante → só as próprias convocações. */
  @OrgaoOuFornecedor()
  @Get('sessao/:sessaoId/me-epp')
  async painel(@Param('sessaoId') sessaoId: string, @AtorAtual() ator: Ator) {
    const licitacaoId = await this.licitacaoDaSessao(sessaoId);
    if (ehFornecedor(ator)) {
      const fid = await this.acesso.assertFornecedorParticipa(ator, licitacaoId);
      return this.meEpp.minhas(sessaoId, fid);
    }
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId, 'leitura');
    return this.meEpp.painel(sessaoId);
  }

  /** A ME/EPP convocada oferece valor inferior à melhor oferta (art. 45 I). */
  @SomenteFornecedor()
  @Post('sessao/:sessaoId/me-epp/:convocacaoId/exercer')
  async exercer(
    @Param('sessaoId') sessaoId: string,
    @Param('convocacaoId') convocacaoId: string,
    @Body() body: { valor?: number | string },
    @AtorAtual() ator: Ator,
  ) {
    if (!ehUuid(convocacaoId)) throw new NotFoundException('Convocação não encontrada nesta sessão');
    const licitacaoId = await this.licitacaoDaSessao(sessaoId);
    const fid = await this.acesso.assertFornecedorParticipa(ator, licitacaoId);
    return this.meEpp.exercer(sessaoId, convocacaoId, fid, body?.valor);
  }

  /** A ME/EPP convocada declina: a seguinte do intervalo é convocada (art. 45 II). */
  @SomenteFornecedor()
  @Post('sessao/:sessaoId/me-epp/:convocacaoId/declinar')
  async declinar(@Param('sessaoId') sessaoId: string, @Param('convocacaoId') convocacaoId: string, @AtorAtual() ator: Ator) {
    if (!ehUuid(convocacaoId)) throw new NotFoundException('Convocação não encontrada nesta sessão');
    const licitacaoId = await this.licitacaoDaSessao(sessaoId);
    const fid = await this.acesso.assertFornecedorParticipa(ator, licitacaoId);
    return this.meEpp.declinar(sessaoId, convocacaoId, fid);
  }

  /** Participação do fornecedor (token) por item: exclusivo/cota exigem ME/EPP (tela da proposta). */
  @SomenteFornecedor()
  @Get('licitacao/:licitacaoId/me-epp/participacao')
  async participacao(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator) {
    if (!ehUuid(licitacaoId)) throw new NotFoundException('Licitação não encontrada');
    return this.meEpp.participacao(licitacaoId, this.acesso.fornecedorDoToken(ator));
  }

  /** Conferência do art. 48 (exclusivo até o limite do inciso I; cotas pendentes). */
  @SomenteOrgao()
  @Get('licitacao/:licitacaoId/me-epp/conferencia')
  async conferencia(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator) {
    if (!ehUuid(licitacaoId)) throw new NotFoundException('Licitação não encontrada');
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId, 'leitura');
    return this.meEpp.conferencia(licitacaoId);
  }

  /** Gera as unidades-COTA reservadas a ME/EPP (art. 48 III) — idempotente, antes das propostas. */
  @SomenteOrgao()
  @Post('licitacao/:licitacaoId/me-epp/cotas')
  async gerarCotas(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator) {
    if (!ehUuid(licitacaoId)) throw new NotFoundException('Licitação não encontrada');
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId);
    return this.meEpp.gerarCotas(licitacaoId, atorTransicaoDe(ator));
  }
}
