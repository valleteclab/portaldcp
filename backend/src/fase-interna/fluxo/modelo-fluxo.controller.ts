import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../auth/admin.guard';
import { AtorAtual } from '../../auth/acesso/acesso.decorators';
import type { Ator } from '../../auth/acesso/ator';
import { REGRAS } from '../conformidade/regras';
import { DonoFaseInternaGuard } from '../dono-fase-interna.guard';
import { TarefasService } from '../tarefas/tarefas.service';
import { CATALOGO_ETAPAS } from './catalogo-fluxo';
import { ROTULO_PAPEL } from './codigos';
import { FluxoProcessoService } from './fluxo-processo.service';
import { ModeloFluxo, ROTULO_TIPO_PROCESSO, TIPOS_PROCESSO_FLUXO, TipoProcessoFluxo, niveisDoGrafo, requisitoSeAplica, tipoProcessoValido } from './modelo-fluxo';
import { ModeloFluxoService } from './modelo-fluxo.service';
import { PlanejamentoFluxoService } from './planejamento-fluxo.service';
import { ATOS_PROTEGIDOS, ROTULO_ATO } from './travas';

/** Administração do órgão: login do órgão, usuário com papel ADMIN ou admin da plataforma. */
export function exigirAdminDoOrgao(ator: Ator) {
  if (ator.admin || ator.tipo === 'ORGAO' || (ator.tipo === 'USUARIO' && ator.role === 'ADMIN')) return;
  throw new ForbiddenException('Só o administrador do órgão altera o modelo de fluxo da fase interna');
}

/** Órgão do token; o admin da plataforma informa ?orgao_id= (ou ?sistema=true para o modelo do sistema). */
export function alvo(ator: Ator, orgaoId?: string, sistema?: string): string | null {
  if (sistema === 'true' || sistema === '1') {
    if (!ator.admin) throw new ForbiddenException('Só o administrador da plataforma altera o modelo do sistema');
    return null;
  }
  if (ator.admin) {
    if (!orgaoId) throw new BadRequestException('Informe orgao_id (ou sistema=true)');
    return orgaoId;
  }
  return ator.orgaoId!;
}

export function tipoDaRota(tipo: string): TipoProcessoFluxo {
  const t = String(tipo ?? '').toUpperCase();
  if (!tipoProcessoValido(t)) throw new BadRequestException(`Tipo de processo inválido — use ${TIPOS_PROCESSO_FLUXO.join(', ')}.`);
  return t;
}

/**
 * MODELO DE FLUXO DA FASE INTERNA (F1). Leitura: qualquer usuário do órgão
 * (sempre o órgão do token). Escrita: o administrador do órgão. Modelo do
 * sistema, requisitos da lei e travas por ato: só o admin da plataforma.
 */
@Controller('fluxo-fase-interna')
@UseGuards(DonoFaseInternaGuard)
export class ModeloFluxoController {
  constructor(
    private readonly modelos: ModeloFluxoService,
    private readonly tarefas: TarefasService,
    private readonly planejamento: PlanejamentoFluxoService,
  ) {}

  private async tela(orgaoId: string | null, tipo: TipoProcessoFluxo, modelo?: ModeloFluxo, validacao?: any) {
    const m = modelo ?? (orgaoId ? await this.modelos.modeloVigente(orgaoId, tipo) : await this.modelos.modeloDoSistema(tipo));
    const v = validacao ?? (await this.modelos.validar(orgaoId, m));
    const ctx = await this.modelos.contextoDoOrgao(orgaoId);
    const requisitos = (await this.modelos.requisitos()).filter((r) => requisitoSeAplica(r, tipo));
    const n = orgaoId ? await this.modelos.processosEmAndamento(orgaoId, tipo) : 0;
    return {
      tipo,
      rotulo_tipo: ROTULO_TIPO_PROCESSO[tipo],
      sistema: !orgaoId,
      proprio: !!m.orgao_id,
      modelo: m,
      validacao: v,
      desenho: niveisDoGrafo(m.etapas),
      catalogo: CATALOGO_ETAPAS.map((c) => ({ codigo: c.codigo, grupo: c.grupo, titulo: c.titulo, tela: c.tela, conclusao: c.conclusao, fundamento: c.fundamento })),
      requisitos,
      papeis: Object.entries(ROTULO_PAPEL).map(([codigo, rotulo]) => ({ codigo, rotulo })),
      setores: ctx.setores,
      usuarios: ctx.usuarios.filter((u) => u.ativo !== false).map((u) => ({ id: u.id, nome: u.nome })),
      processos_em_andamento: n,
    };
  }

  /** Resumo dos modelos do órgão (um por tipo de processo). */
  @Get('modelos')
  async listar(@AtorAtual() ator: Ator, @Query('orgao_id') orgaoId?: string, @Query('sistema') sistema?: string) {
    const o = alvo(ator, orgaoId, sistema);
    const r = [];
    for (const tipo of TIPOS_PROCESSO_FLUXO) {
      const m = o ? await this.modelos.modeloVigente(o, tipo) : await this.modelos.modeloDoSistema(tipo);
      r.push({ tipo, rotulo_tipo: ROTULO_TIPO_PROCESSO[tipo], nome: m.nome, versao: m.versao, proprio: !!m.orgao_id, etapas_ligadas: m.etapas.filter((e) => e.ligada).length });
    }
    return r;
  }

  @Get('modelos/:tipo')
  obter(@Param('tipo') tipo: string, @AtorAtual() ator: Ator, @Query('orgao_id') orgaoId?: string, @Query('sistema') sistema?: string) {
    return this.tela(alvo(ator, orgaoId, sistema), tipoDaRota(tipo));
  }

  /** Pré-visualização: aplica a edição e valida, sem gravar (erros com o artigo). */
  @Post('modelos/:tipo/validar')
  async validar(@Param('tipo') tipo: string, @Body() body: any, @AtorAtual() ator: Ator, @Query('orgao_id') orgaoId?: string, @Query('sistema') sistema?: string) {
    const o = alvo(ator, orgaoId, sistema);
    const t = tipoDaRota(tipo);
    const { modelo, validacao } = await this.modelos.simular(o, t, body ?? {});
    return this.tela(o, t, modelo, validacao);
  }

  /** Grava (400 com o artigo quando a lei não permite). Processos em andamento: o caminho não muda; quem faz e prazos sim. */
  @Put('modelos/:tipo')
  async salvar(@Param('tipo') tipo: string, @Body() body: any, @AtorAtual() ator: Ator, @Query('orgao_id') orgaoId?: string, @Query('sistema') sistema?: string) {
    exigirAdminDoOrgao(ator);
    const o = alvo(ator, orgaoId, sistema);
    const t = tipoDaRota(tipo);
    const { modelo, validacao } = await this.modelos.salvar(o, t, body ?? {}, await this.tarefas.autor(ator));
    if (o) await this.tarefas.sincronizarOrgao(o);
    return this.tela(o, t, modelo, validacao);
  }

  /** "Restaurar modelo padrão": volta à cópia do modelo do sistema. */
  @Post('modelos/:tipo/restaurar')
  async restaurar(@Param('tipo') tipo: string, @AtorAtual() ator: Ator, @Query('orgao_id') orgaoId?: string) {
    exigirAdminDoOrgao(ator);
    const o = alvo(ator, orgaoId);
    if (!o) throw new BadRequestException('Informe o órgão');
    const t = tipoDaRota(tipo);
    await this.modelos.restaurarPadrao(o, t, await this.tarefas.autor(ator));
    await this.tarefas.sincronizarOrgao(o);
    return this.tela(o, t);
  }

  // --- Planejamento (antes do processo): demanda → DFD consolidado → processo ---

  /** Quem aprova a demanda, quem monta o DFD (unidade de planejamento) e a 2ª aprovação do DFD. */
  @Get('planejamento')
  planejamentoDoOrgao(@AtorAtual() ator: Ator, @Query('orgao_id') orgaoId?: string, @Query('sistema') sistema?: string) {
    return this.planejamento.tela(alvo(ator, orgaoId, sistema));
  }

  @Put('planejamento')
  async salvarPlanejamento(@Body() body: any, @AtorAtual() ator: Ator, @Query('orgao_id') orgaoId?: string, @Query('sistema') sistema?: string) {
    exigirAdminDoOrgao(ator);
    return this.planejamento.salvar(alvo(ator, orgaoId, sistema), body ?? {}, await this.tarefas.autor(ator));
  }

  @Post('planejamento/restaurar')
  async restaurarPlanejamento(@AtorAtual() ator: Ator, @Query('orgao_id') orgaoId?: string) {
    exigirAdminDoOrgao(ator);
    const o = alvo(ator, orgaoId);
    if (!o) throw new BadRequestException('Informe o órgão');
    return this.planejamento.restaurar(o);
  }

  // --- Requisitos mínimos da lei (leitura: órgão; escrita: admin da plataforma) ---

  @Get('requisitos')
  requisitos() {
    return this.modelos.requisitos();
  }

  @Put('requisitos/:codigo')
  @UseGuards(AdminGuard)
  async atualizarRequisito(@Param('codigo') codigo: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.modelos.atualizarRequisito(codigo, body ?? {}, await this.tarefas.autor(ator));
  }

  // --- Travas da lei por ato (leitura: órgão; escrita: admin da plataforma) ---

  @Get('travas')
  async travas() {
    const travas = await this.modelos.travas();
    return ATOS_PROTEGIDOS.map((ato) => ({
      ato,
      rotulo: ROTULO_ATO[ato],
      regras: travas
        .filter((t) => t.ato === ato)
        .map((t) => {
          const r = REGRAS.find((x) => x.codigo === t.regra);
          return { ...t, descricao: r?.descricao ?? t.regra, severidade_da_regra: r?.severidade ?? null, garantida_no_ato: !!r?.garantida_no_ato };
        }),
    }));
  }

  @Put('travas/:ato/:regra')
  @UseGuards(AdminGuard)
  async atualizarTrava(@Param('ato') ato: string, @Param('regra') regra: string, @Body() body: any, @AtorAtual() ator: Ator) {
    await this.modelos.atualizarTrava(ato, regra, body ?? {}, await this.tarefas.autor(ator));
    return this.travas();
  }
}

/**
 * AÇÕES DO FLUXO NO PROCESSO (F1): voltar/avançar etapa, aprovar a demanda e
 * dispensar o parecer por ato. `:licitacaoId` → DonoFaseInternaGuard (outro
 * órgão: 403 na escrita); permissão no processo conferida no serviço (403).
 */
@Controller('fase-interna')
@UseGuards(DonoFaseInternaGuard)
export class FluxoProcessoController {
  constructor(private readonly fluxo: FluxoProcessoService) {}

  /** Voltar: { motivo } — a etapa reabre e as dependentes concluídas ficam "a revisar". */
  @Post(':licitacaoId/etapas/:codigo/reabrir')
  reabrir(@Param('licitacaoId') id: string, @Param('codigo') codigo: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.fluxo.reabrir(id, codigo, body ?? {}, ator);
  }

  /**
   * Avançar: { texto } — registra a etapa de registro ou confirma a revisão (reaberta / a revisar).
   * Construtor de fluxo: condição → { resposta: 'sim' | 'nao', texto? }.
   */
  @Post(':licitacaoId/etapas/:codigo/concluir')
  concluir(@Param('licitacaoId') id: string, @Param('codigo') codigo: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.fluxo.concluir(id, codigo, body ?? {}, ator);
  }

  /**
   * Construtor de fluxo: a APROVAÇÃO devolve { motivo, para?: códigos } — a
   * etapa devolvida corrige e o processo volta direto para quem devolveu.
   */
  @Post(':licitacaoId/etapas/:codigo/devolver')
  devolver(@Param('licitacaoId') id: string, @Param('codigo') codigo: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.fluxo.devolver(id, codigo, body ?? {}, ator);
  }

  /** { observacao? } — só quem o modelo designa (padrão: "pode aprovar demandas"). */
  @Post(':licitacaoId/demanda/aprovar')
  aprovarDemanda(@Param('licitacaoId') id: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.fluxo.aprovarDemanda(id, body ?? {}, ator);
  }

  /** { numero_ato, data_ato (AAAA-MM-DD), hipotese? } — art. 53, §5º. */
  @Post(':licitacaoId/parecer/dispensar')
  dispensarParecer(@Param('licitacaoId') id: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.fluxo.dispensarParecer(id, body ?? {}, ator);
  }
}
