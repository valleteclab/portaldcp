import { Body, Controller, Delete, Get, NotFoundException, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AtorAtual } from '../../auth/acesso/acesso.decorators';
import type { Ator } from '../../auth/acesso/ator';
import { DonoFaseInternaGuard } from '../dono-fase-interna.guard';
import { TarefasService } from '../tarefas/tarefas.service';
import { ConstrutorFluxoService } from './construtor-fluxo.service';
import { TipoProcessoFluxo, tipoProcessoValido } from './modelo-fluxo';
import { alvo, exigirAdminDoOrgao, tipoDaRota } from './modelo-fluxo.controller';
import { ModeloFluxoService } from './modelo-fluxo.service';

/**
 * Alvo do construtor: o órgão do token. Usuário comum que pede outro órgão
 * (`?orgao_id=`) recebe 404 — nem a existência do modelo alheio é revelada.
 * Admin da plataforma: `?orgao_id=` (um órgão) ou `?sistema=true` (o modelo do sistema).
 */
function alvoDoConstrutor(ator: Ator, orgaoId?: string, sistema?: string): string | null {
  if (!ator.admin && orgaoId && orgaoId !== ator.orgaoId) throw new NotFoundException('Modelo de fluxo não encontrado');
  return alvo(ator, orgaoId, sistema);
}

/**
 * CONSTRUTOR DE FLUXO (API para o editor de arrastar e soltar — PR 2;
 * docs/licitacao/PLANO-CONSTRUTOR-FLUXO.md). Leitura, conferência e teste:
 * qualquer usuário do órgão. Rascunho, ativar, restaurar, modelos prontos e
 * IA: o administrador do órgão (ou o login do órgão). Modelo do sistema: só
 * o admin da plataforma (`?sistema=true`).
 */
@Controller('fluxo-fase-interna/construtor')
@UseGuards(DonoFaseInternaGuard)
export class ConstrutorFluxoController {
  constructor(
    private readonly construtor: ConstrutorFluxoService,
    private readonly modelos: ModeloFluxoService,
    private readonly tarefas: TarefasService,
  ) {}

  /** Modelos prontos (pontos de partida): ?tipo= filtra. */
  @Get('modelos-prontos')
  modelosProntos(@Query('tipo') tipo?: string) {
    const t = tipo ? String(tipo).toUpperCase() : undefined;
    return this.construtor.modelosProntos(t && tipoProcessoValido(t) ? (t as TipoProcessoFluxo) : undefined);
  }

  /** Versão ativa + rascunho + conferência + catálogo (peças, campos de condição) + setores/papéis/pessoas. */
  @Get(':tipo')
  tela(@Param('tipo') tipo: string, @AtorAtual() ator: Ator, @Query('orgao_id') orgaoId?: string, @Query('sistema') sistema?: string) {
    return this.construtor.tela(alvoDoConstrutor(ator, orgaoId, sistema), tipoDaRota(tipo));
  }

  /** Salva o RASCUNHO: { grafo, nome?, descricao?, aprovacao_demanda?, exigir_posse_pecas? } (não ativa). */
  @Put(':tipo/rascunho')
  async salvarRascunho(@Param('tipo') tipo: string, @Body() body: any, @AtorAtual() ator: Ator, @Query('orgao_id') orgaoId?: string, @Query('sistema') sistema?: string) {
    exigirAdminDoOrgao(ator);
    const o = alvoDoConstrutor(ator, orgaoId, sistema);
    return this.construtor.salvarRascunho(o, tipoDaRota(tipo), body ?? {}, await this.tarefas.autor(ator));
  }

  /** Descarta o rascunho (a versão ativa continua). */
  @Delete(':tipo/rascunho')
  descartarRascunho(@Param('tipo') tipo: string, @AtorAtual() ator: Ator, @Query('orgao_id') orgaoId?: string, @Query('sistema') sistema?: string) {
    exigirAdminDoOrgao(ator);
    return this.construtor.descartarRascunho(alvoDoConstrutor(ator, orgaoId, sistema), tipoDaRota(tipo));
  }

  /** Conferência (estrutura + lei) sem gravar: do corpo; sem corpo, do rascunho. */
  @Post(':tipo/conferir')
  conferir(@Param('tipo') tipo: string, @Body() body: any, @AtorAtual() ator: Ator, @Query('orgao_id') orgaoId?: string, @Query('sistema') sistema?: string) {
    return this.construtor.conferir(alvoDoConstrutor(ator, orgaoId, sistema), tipoDaRota(tipo), body ?? {});
  }

  /** ATIVA o rascunho: 400 com os erros (e o artigo) quando não confere; senão, nova versão. */
  @Post(':tipo/ativar')
  async ativar(@Param('tipo') tipo: string, @AtorAtual() ator: Ator, @Query('orgao_id') orgaoId?: string, @Query('sistema') sistema?: string) {
    exigirAdminDoOrgao(ator);
    return this.construtor.ativar(alvoDoConstrutor(ator, orgaoId, sistema), tipoDaRota(tipo), await this.tarefas.autor(ator));
  }

  /** Histórico de versões (quem ativou e quando). */
  @Get(':tipo/versoes')
  versoes(@Param('tipo') tipo: string, @AtorAtual() ator: Ator, @Query('orgao_id') orgaoId?: string, @Query('sistema') sistema?: string) {
    return this.modelos.versoes(alvoDoConstrutor(ator, orgaoId, sistema), tipoDaRota(tipo));
  }

  /** Uma versão, com o grafo. */
  @Get(':tipo/versoes/:versao')
  async versao(
    @Param('tipo') tipo: string,
    @Param('versao', ParseIntPipe) versao: number,
    @AtorAtual() ator: Ator,
    @Query('orgao_id') orgaoId?: string,
    @Query('sistema') sistema?: string,
  ) {
    const v = await this.modelos.versao(alvoDoConstrutor(ator, orgaoId, sistema), tipoDaRota(tipo), versao);
    if (!v) throw new NotFoundException('Versão não encontrada');
    return { versao: v.versao, nome: v.nome, origem: v.origem, ativado_por_nome: v.ativado_por_nome, ativado_em: v.ativado_em, grafo: v.grafo, aprovacao_demanda: v.aprovacao_demanda, exigir_posse_pecas: v.exigir_posse_pecas };
  }

  /** "Restaurar o modelo padrão" no RASCUNHO (ative para valer). */
  @Post(':tipo/restaurar')
  async restaurar(@Param('tipo') tipo: string, @AtorAtual() ator: Ator, @Query('orgao_id') orgaoId?: string, @Query('sistema') sistema?: string) {
    exigirAdminDoOrgao(ator);
    return this.construtor.restaurar(alvoDoConstrutor(ator, orgaoId, sistema), tipoDaRota(tipo), await this.tarefas.autor(ator));
  }

  /** Carrega um modelo pronto no RASCUNHO (ative para valer). */
  @Post(':tipo/modelos-prontos/:codigo')
  async usarModeloPronto(
    @Param('tipo') tipo: string,
    @Param('codigo') codigo: string,
    @AtorAtual() ator: Ator,
    @Query('orgao_id') orgaoId?: string,
    @Query('sistema') sistema?: string,
  ) {
    exigirAdminDoOrgao(ator);
    return this.construtor.usarModeloPronto(alvoDoConstrutor(ator, orgaoId, sistema), tipoDaRota(tipo), codigo, await this.tarefas.autor(ator));
  }

  /** "Testar": { grafo?, estado?, acao: { tipo, no?, resposta?, para? }, dados? } → novo estado + o que aconteceu. Nada é gravado. */
  @Post(':tipo/simular')
  simular(@Param('tipo') tipo: string, @Body() body: any, @AtorAtual() ator: Ator, @Query('orgao_id') orgaoId?: string, @Query('sistema') sistema?: string) {
    return this.construtor.simular(alvoDoConstrutor(ator, orgaoId, sistema), tipoDaRota(tipo), body ?? {});
  }

  /** "Montar com IA": { descricao, salvar? } → o grafo vira RASCUNHO (nunca ativa) + a conferência. */
  @Post(':tipo/gerar-com-ia')
  async gerarComIa(@Param('tipo') tipo: string, @Body() body: any, @AtorAtual() ator: Ator, @Query('orgao_id') orgaoId?: string, @Query('sistema') sistema?: string) {
    exigirAdminDoOrgao(ator);
    return this.construtor.gerarComIa(alvoDoConstrutor(ator, orgaoId, sistema), tipoDaRota(tipo), body ?? {}, await this.tarefas.autor(ator));
  }
}
