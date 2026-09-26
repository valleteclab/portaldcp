import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Param,
  Query,
  Body,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { FUNDAMENTOS_LEGAIS, fundamentoPadrao, fundamentosDaModalidade } from '../licitacoes/fundamento-legal';
import { ParametrosLicitacaoService } from './parametros-licitacao.service';
import { ParametroLicitacao } from './entities/parametro-licitacao.entity';
import { LimiteLegal } from './entities/limite-legal.entity';
import { AcessoLicitacaoService } from '../auth/acesso/acesso-licitacao.service';
import { AtorAtual, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import type { Ator } from '../auth/acesso/ator';

/**
 * AUTORIZAÇÃO (E1a): leituras seguem abertas a quem está logado (são regras de
 * sessão/limites legais, sem dado sigiloso). Escritas só para o PRÓPRIO órgão;
 * valores do sistema/nacionais (orgao_id nulo) só para o ADMIN da plataforma.
 */
@Controller('parametros-licitacao')
export class ParametrosLicitacaoController {
  constructor(
    private readonly service: ParametrosLicitacaoService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  // === PARÂMETROS ===

  /** Parâmetros efetivos (do órgão, ou default do sistema). */
  @Get()
  resolver(@Query('orgaoId') orgaoId?: string) {
    return this.service.resolver(orgaoId);
  }

  /** Salva os parâmetros de um órgão. */
  @Put(':orgaoId')
  @SomenteOrgao()
  salvar(
    @Param('orgaoId') orgaoId: string,
    @Body() dados: Partial<ParametroLicitacao>,
    @AtorAtual() ator: Ator,
  ) {
    this.acesso.assertProprioOrgao(ator, orgaoId);
    return this.service.salvar(orgaoId, dados);
  }

  /** Restaura os parâmetros do órgão para o default do sistema. */
  @Delete(':orgaoId')
  @SomenteOrgao()
  restaurar(@Param('orgaoId') orgaoId: string, @AtorAtual() ator: Ator) {
    this.acesso.assertProprioOrgao(ator, orgaoId);
    return this.service.restaurarPadrao(orgaoId);
  }

  // === FUNDAMENTO LEGAL (catálogo do select "Fundamento legal") ===

  /**
   * Fundamentos admitidos para a modalidade (ou todos), com o padrão. Leitura
   * de quem está logado (tabela da lei, sem dado de órgão).
   */
  @Get('fundamentos-legais')
  fundamentosLegais(@Query('modalidade') modalidade?: string, @Query('tipo_contratacao') tipoContratacao?: string) {
    const lista = modalidade ? fundamentosDaModalidade(modalidade) : [...FUNDAMENTOS_LEGAIS];
    return {
      padrao: modalidade ? fundamentoPadrao(modalidade, tipoContratacao) : null,
      fundamentos: lista.map((d) => ({
        codigo: d.codigo,
        referencia: d.referencia,
        texto: `Lei 14.133/2021, ${d.referencia}`,
        descricao: d.descricao,
        inciso_limite: d.incisoLimite ?? null,
        amparo_pncp: d.amparoPncp,
      })),
    };
  }

  // === LIMITES DA DISPENSA POR EXERCÍCIO (art. 75, I e II) ===

  /** Limites dos incisos I e II no exercício (padrão: o ano corrente), com o ato normativo. */
  @Get('limites-dispensa')
  async limitesDispensa(@Query('exercicio') exercicio?: string) {
    const ano = Number(exercicio) || new Date().getFullYear();
    return {
      exercicio: ano,
      I: await this.service.limiteDispensa(ano, 'I'),
      II: await this.service.limiteDispensa(ano, 'II'),
    };
  }

  /** Tabela inteira (todos os exercícios cadastrados). */
  @Get('limites-dispensa/tabela')
  tabelaLimitesDispensa() {
    return this.service.tabelaLimitesDispensa();
  }

  /**
   * Cadastra (ou corrige) os limites de um exercício — só o ADMIN da
   * plataforma (o valor é nacional, por decreto). Órgão/fornecedor → 403.
   */
  @Post('limites-dispensa')
  @UseGuards(AdminGuard)
  cadastrarLimitesDispensa(
    @Body() dados: { exercicio: number; valor_inciso_i: number; valor_inciso_ii: number; ato_normativo: string },
  ) {
    return this.service.cadastrarLimitesDoExercicio(dados);
  }

  // === LIMITES LEGAIS ===

  @Get('limites/lista')
  listarLimites(@Query('orgaoId') orgaoId?: string) {
    return this.service.listarLimites(orgaoId);
  }

  @Get('limites/vigente')
  valorVigente(
    @Query('chave') chave: string,
    @Query('orgaoId') orgaoId?: string,
    @Query('data') data?: string,
  ) {
    return this.service
      .valorVigente(chave, orgaoId, data ? new Date(data) : undefined)
      .then((valor) => ({ chave, valor }));
  }

  /**
   * Limite do próprio órgão (orgao_id do token). Limite nacional (orgao_id
   * nulo) ou de outro órgão: só o ADMIN da plataforma altera — o órgão que
   * "edita" o nacional ganha um valor próprio.
   */
  @Post('limites')
  @SomenteOrgao()
  async salvarLimite(@Body() dados: Partial<LimiteLegal>, @AtorAtual() ator: Ator) {
    if (!ator.admin) {
      if (dados.id) {
        const existente = await this.service.buscarLimite(dados.id);
        if (existente && !existente.orgao_id) {
          // Editar o valor nacional pelo órgão = criar o valor PRÓPRIO do órgão
          // (sobrepõe o nacional só para ele; o nacional fica intacto).
          delete dados.id;
        } else if (existente) {
          this.assertLimiteDoOrgao(ator, existente.orgao_id);
        }
      }
      if (dados.orgao_id && dados.orgao_id !== ator.orgaoId) {
        throw new ForbiddenException('Acesso negado: você não pertence a este órgão');
      }
      dados.orgao_id = ator.orgaoId;
    }
    return this.service.salvarLimite(dados);
  }

  @Delete('limites/:id')
  @SomenteOrgao()
  async removerLimite(@Param('id') id: string, @AtorAtual() ator: Ator) {
    if (!ator.admin) {
      const existente = await this.service.buscarLimite(id);
      if (existente) this.assertLimiteDoOrgao(ator, existente.orgao_id);
    }
    return this.service.removerLimite(id);
  }

  /** Limite nacional (orgao_id nulo) → só admin; de outro órgão → 403. */
  private assertLimiteDoOrgao(ator: Ator, orgaoIdDoLimite: string | null) {
    if (!orgaoIdDoLimite) {
      throw new ForbiddenException('Limite nacional: alteração restrita ao administrador da plataforma');
    }
    this.acesso.assertProprioOrgao(ator, orgaoIdDoLimite);
  }
}
