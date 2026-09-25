import { Controller, Get, Query } from '@nestjs/common';
import { AcessoLicitacaoService } from '../auth/acesso/acesso-licitacao.service';
import { AtorAtual, SomenteFornecedor } from '../auth/acesso/acesso.decorators';
import type { Ator } from '../auth/acesso/ator';
import { PortalFornecedorService, normalizarFiltrosOportunidades } from './portal-fornecedor.service';

/**
 * Portal do fornecedor (plano E8): lista de licitações filtrada no servidor e
 * "Minhas participações". Só fornecedor; identidade SEMPRE do token (E1a) —
 * nenhum id de fornecedor é aceito na query.
 */
@Controller('portal-fornecedor')
export class PortalFornecedorController {
  constructor(
    private readonly portal: PortalFornecedorService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  /** ?busca=&modalidade=&fase=&situacao=&uf=&participando=true&pagina=1&limite=20 */
  @Get('licitacoes')
  @SomenteFornecedor()
  licitacoes(@AtorAtual() ator: Ator, @Query() query: Record<string, unknown>) {
    return this.portal.oportunidades(this.acesso.fornecedorDoToken(ator), normalizarFiltrosOportunidades(query));
  }

  @Get('participacoes')
  @SomenteFornecedor()
  participacoes(@AtorAtual() ator: Ator) {
    return this.portal.participacoes(this.acesso.fornecedorDoToken(ator));
  }
}
