import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { AcessoLicitacaoService } from '../auth/acesso/acesso-licitacao.service';
import { AtorAtual, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import type { Ator } from '../auth/acesso/ator';
import { atorTransicaoDe } from '../licitacoes/transicoes/transicoes.tipos';
import { ResultadoService } from './resultado.service';

/**
 * RESULTADO (plano E6) — rotas em /api/resultado. Um ato, um caminho:
 *  - GET  licitacao/:id               painel (unidades, vencedores, valores, atos, instrumentos)
 *  - POST licitacao/:id/adjudicar     adjudicação pela sala (pregão/concorrência)
 *  - POST licitacao/:id/homologar     homologação (todas as modalidades) — sem valor no corpo
 *  - POST licitacao/:id/instrumentos  (re)gera contrato/ARP da licitação homologada (idempotente)
 *
 * AUTORIZAÇÃO: só o órgão DONO (@SomenteOrgao + dono); homologar exige a
 * autoridade (conta do órgão ou usuário ADMIN — regras-resultado.ts).
 * Dispensa e seleção externa adjudicam pelos próprios atos
 * (julgar-dispensa, resultado-externo), que gravam pelo mesmo serviço.
 */
@Controller('resultado')
export class ResultadoController {
  constructor(
    private readonly resultado: ResultadoService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  @Get('licitacao/:id')
  @SomenteOrgao()
  async painel(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id, 'leitura');
    return this.resultado.painel(id, ator);
  }

  @Post('licitacao/:id/adjudicar')
  @HttpCode(200)
  @SomenteOrgao()
  async adjudicar(@Param('id') id: string, @AtorAtual() ator: Ator, @Body() body: { motivo?: string }) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id, 'escrita');
    return this.resultado.adjudicar(id, ator, { motivo: body?.motivo ?? null });
  }

  @Post('licitacao/:id/homologar')
  @HttpCode(200)
  @SomenteOrgao()
  async homologar(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id, 'escrita');
    return this.resultado.homologar(id, ator);
  }

  @Post('licitacao/:id/instrumentos')
  @HttpCode(200)
  @SomenteOrgao()
  async instrumentos(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id, 'escrita');
    return this.resultado.gerarInstrumentos(id, atorTransicaoDe(ator));
  }
}
