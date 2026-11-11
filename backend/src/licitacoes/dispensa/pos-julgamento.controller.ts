import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AcessoLicitacaoService } from '../../auth/acesso/acesso-licitacao.service';
import { AtorAtual, SomenteFornecedor, SomenteOrgao } from '../../auth/acesso/acesso.decorators';
import type { Ator } from '../../auth/acesso/ator';
import { DispensaPosJulgamentoService } from './pos-julgamento.service';
import { RequireModule } from '../../auth/require-module.decorator';
import { ModuloSistema } from '../../orgaos/enums/modulos.enum';

/**
 * Dispensa eletrônica depois do julgamento: habilitação do vencedor (art. 72,
 * V; IN 67 art. 17) e negociação com aceite do fornecedor (IN 67 art. 16).
 * Órgão: só o DONO da licitação. Fornecedor: só as próprias contrapropostas.
 */
@Controller('licitacoes')
@RequireModule(ModuloSistema.LICITACOES)
export class DispensaPosJulgamentoController {
  constructor(
    private readonly servico: DispensaPosJulgamentoService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  @Get(':id/dispensa/pos-julgamento')
  @SomenteOrgao()
  async painel(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id, 'leitura');
    return this.servico.painel(id);
  }

  @Post(':id/dispensa/habilitacao')
  @SomenteOrgao()
  async habilitacao(@Param('id') id: string, @Body() body: any, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id, 'escrita');
    return this.servico.registrarHabilitacao(id, ator, body ?? {});
  }

  /** Desclassifica a proposta do vencedor só em um item (ele segue nos demais). */
  @Post(':id/dispensa/desclassificar-item')
  @SomenteOrgao()
  async desclassificarItem(@Param('id') id: string, @Body() body: any, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id, 'escrita');
    return this.servico.desclassificarNoItem(id, ator, body ?? {});
  }

  @Post(':id/dispensa/negociacao')
  @SomenteOrgao()
  async propor(@Param('id') id: string, @Body() body: any, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id, 'escrita');
    return this.servico.proporValor(id, ator, body ?? {});
  }

  @Get(':id/dispensa/negociacao/minhas')
  @SomenteFornecedor()
  minhas(@Param('id') id: string, @AtorAtual() ator: Ator) {
    return this.servico.pendentesDoFornecedor(id, this.acesso.fornecedorDoToken(ator, null));
  }

  @Post(':id/dispensa/negociacao/:negociacaoId/responder')
  @SomenteFornecedor()
  responder(@Param('id') id: string, @Param('negociacaoId') negociacaoId: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.servico.responder(id, negociacaoId, this.acesso.fornecedorDoToken(ator, null), body ?? {});
  }
}
