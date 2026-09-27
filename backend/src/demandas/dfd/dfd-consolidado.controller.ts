import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RequireModule } from '../../auth/require-module.decorator';
import { ModuloSistema } from '../../orgaos/enums/modulos.enum';
import { AcessoLicitacaoService, AtorAtual, ModoAcesso, SomenteOrgao } from '../../auth/acesso';
import type { Ator } from '../../auth/acesso/ator';
import { LicitacoesService } from '../../licitacoes/licitacoes.service';
import { licitacaoParaOrgao } from '../../licitacoes/licitacao-visao.util';
import { CriterioJulgamento, ModalidadeLicitacao, TipoContratacao } from '../../licitacoes/entities/licitacao.entity';
import { atorTransicaoDe } from '../../licitacoes/transicoes/transicoes.tipos';
import { DemandasService } from '../demandas.service';
import { DfdConsolidadoService } from './dfd-consolidado.service';

/**
 * DFD CONSOLIDADO (unidade de planejamento) — `/api/dfds-consolidados`.
 * Isolamento (padrão `assertMesmoOrgao`, PR #524): órgão SEMPRE do token;
 * DFD/demanda de outro órgão por id → 404 na leitura e 403 na escrita;
 * demanda de outro órgão no corpo → 403 (nada gravado). Fornecedor → 403;
 * sem login → 401. Montar/abrir processo: só a unidade de planejamento
 * (modelo de fluxo); 2ª aprovação: só o aprovador configurado.
 */
@Controller('dfds-consolidados')
@RequireModule(ModuloSistema.DEMANDAS)
@SomenteOrgao()
export class DfdConsolidadoController {
  constructor(
    private readonly dfds: DfdConsolidadoService,
    private readonly demandas: DemandasService,
    private readonly licitacoes: LicitacoesService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  /** Órgão do token (o admin da plataforma informa ?orgao_id=). */
  private orgao(ator: Ator | null, informado?: string): string {
    if (!ator) throw new ForbiddenException('Autenticação necessária');
    if (ator.admin) return this.acesso.orgaoParaCriacao(ator, informado);
    if (!ator.orgaoId) throw new ForbiddenException('Ação exclusiva do órgão');
    return ator.orgaoId;
  }

  private async exigirDfd(ator: Ator | null, id: string, modo: ModoAcesso = 'escrita'): Promise<string> {
    const orgaoId = await this.dfds.orgaoDoDfd(id);
    this.acesso.assertMesmoOrgao(ator, orgaoId, modo, 'DFD');
    return orgaoId!;
  }

  /** Demandas do corpo: todas do órgão do token (outro órgão → 403; inexistente → 404) — antes de qualquer gravação. */
  private async exigirDemandas(ator: Ator | null, ids: unknown): Promise<string[]> {
    const lista = [...new Set((Array.isArray(ids) ? ids : []).map(String))];
    for (const id of lista) {
      const orgaoId = await this.demandas.orgaoDaDemanda(id);
      this.acesso.assertMesmoOrgao(ator, orgaoId, 'escrita', 'Demanda');
    }
    return lista;
  }

  // --- leitura ---

  @Get()
  listar(@AtorAtual() ator: Ator, @Query('ano') ano?: string, @Query('orgao_id') orgaoId?: string) {
    return this.dfds.listar(this.orgao(ator, orgaoId), ano ? Number(ano) : undefined);
  }

  /** O que quem consulta pode fazer (montar, aprovar demanda, aprovar DFD) e as regras do modelo de fluxo. */
  @Get('permissoes')
  permissoes(@AtorAtual() ator: Ator, @Query('orgao_id') orgaoId?: string) {
    return this.dfds.permissoes(ator, this.orgao(ator, orgaoId));
  }

  /** Demandas aprovadas do exercício, livres (sem DFD e sem processo). */
  @Get('demandas-disponiveis')
  disponiveis(@AtorAtual() ator: Ator, @Query('ano') ano: string, @Query('orgao_id') orgaoId?: string) {
    return this.dfds.demandasDisponiveis(this.orgao(ator, orgaoId), Number(ano) || new Date().getFullYear());
  }

  /** Central de Aprovações: o que ESTE usuário aprova (demandas, DFDs e a aprovação da demanda dos processos). */
  @Get('central')
  central(@AtorAtual() ator: Ator, @Query('orgao_id') orgaoId?: string) {
    return this.dfds.pendentesDaCentral(ator, this.orgao(ator, orgaoId));
  }

  /** Consolida sem gravar: { demanda_ids, ajustes? } → itens somados, sugestões e alerta de parecidos. */
  @Post('previa')
  async previa(@AtorAtual() ator: Ator, @Body() body: any) {
    const ids = await this.exigirDemandas(ator, body?.demanda_ids);
    const orgaoId = this.orgao(ator, body?.orgao_id);
    await this.dfds.exigirMontar(ator, orgaoId);
    return this.dfds.previa(orgaoId, ids, body?.ajustes ?? {});
  }

  @Get(':id')
  async obter(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.exigirDfd(ator, id, 'leitura');
    return this.dfds.obter(id, ator);
  }

  @Get(':id/pdf')
  async pdf(@Param('id') id: string, @AtorAtual() ator: Ator, @Res() res: Response) {
    await this.exigirDfd(ator, id, 'leitura');
    const { buffer, nome } = await this.dfds.pdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nome}"`);
    res.send(buffer);
  }

  // --- escrita (unidade de planejamento) ---

  /** { demanda_ids, objeto?, justificativa?, unidade_planejamento_id?, responsavel_id?, data_pretendida?, prioridade?, item_pca_id?, ajustes? } */
  @Post()
  async criar(@AtorAtual() ator: Ator, @Body() body: any) {
    const ids = await this.exigirDemandas(ator, body?.demanda_ids);
    const orgaoId = this.orgao(ator, body?.orgao_id);
    await this.dfds.exigirMontar(ator, orgaoId);
    const dfd = await this.dfds.criar(orgaoId, { ...body, demanda_ids: ids }, ator);
    return this.dfds.obter(dfd.id, ator);
  }

  /** "Iniciar contratação" de UMA demanda: DFD de 1 demanda (só a unidade de planejamento). */
  @Post('a-partir-de-demanda/:demandaId')
  async deUmaDemanda(@Param('demandaId') demandaId: string, @AtorAtual() ator: Ator) {
    const [id] = await this.exigirDemandas(ator, [demandaId]);
    const orgaoId = (await this.demandas.orgaoDaDemanda(id))!;
    await this.dfds.exigirMontar(ator, orgaoId);
    const dfd = await this.dfds.criarDeUmaDemanda(id, orgaoId, ator);
    return this.dfds.obter(dfd.id, ator);
  }

  @Put(':id')
  async atualizar(@Param('id') id: string, @AtorAtual() ator: Ator, @Body() body: any) {
    const orgaoId = await this.exigirDfd(ator, id);
    await this.dfds.exigirMontar(ator, orgaoId);
    const corpo = { ...(body ?? {}) };
    if (corpo.demanda_ids !== undefined) corpo.demanda_ids = await this.exigirDemandas(ator, corpo.demanda_ids);
    await this.dfds.atualizar(id, corpo, ator);
    return this.dfds.obter(id, ator);
  }

  @Post(':id/enviar-aprovacao')
  async enviar(@Param('id') id: string, @AtorAtual() ator: Ator) {
    const orgaoId = await this.exigirDfd(ator, id);
    await this.dfds.exigirMontar(ator, orgaoId);
    await this.dfds.enviarParaAprovacao(id, ator);
    return this.dfds.obter(id, ator);
  }

  /** 2ª aprovação: { observacao? } — só o aprovador configurado (403). */
  @Post(':id/aprovar')
  async aprovar(@Param('id') id: string, @AtorAtual() ator: Ator, @Body() body: any) {
    await this.exigirDfd(ator, id);
    await this.dfds.aprovar(id, ator, body ?? {});
    return this.dfds.obter(id, ator);
  }

  /** { motivo } — volta a rascunho para o planejamento ajustar. */
  @Post(':id/devolver')
  async devolver(@Param('id') id: string, @AtorAtual() ator: Ator, @Body() body: any) {
    await this.exigirDfd(ator, id);
    await this.dfds.devolver(id, ator, body ?? {});
    return this.dfds.obter(id, ator);
  }

  /** { motivo } — desfaz o DFD (antes do processo): as demandas voltam a ficar livres. */
  @Post(':id/cancelar')
  async cancelar(@Param('id') id: string, @AtorAtual() ator: Ator, @Body() body: any) {
    const orgaoId = await this.exigirDfd(ator, id);
    await this.dfds.exigirMontar(ator, orgaoId);
    await this.dfds.cancelar(id, ator, body ?? {});
    return this.dfds.obter(id, ator);
  }

  /**
   * ABRE O PROCESSO (fase interna guiada): { modalidade, numero_processo?,
   * objeto?, tipo_contratacao?, criterio_julgamento? }. Devolve o processo e o
   * alerta de parecidos (atenção). "Fase interna feita fora": a tela usa
   * `POST /api/fase-interna/externa/processo` com `dfd_id`.
   */
  @Post(':id/abrir-processo')
  async abrirProcesso(@Param('id') id: string, @AtorAtual() ator: Ator, @Body() body: any) {
    const orgaoId = await this.exigirDfd(ator, id);
    await this.dfds.exigirMontar(ator, orgaoId);
    const enumOk = (v: unknown, e: object, rotulo: string) => {
      if (v && !(Object.values(e) as string[]).includes(String(v))) throw new BadRequestException(`${rotulo} inválido(a).`);
    };
    enumOk(body?.modalidade, ModalidadeLicitacao, 'Modalidade');
    enumOk(body?.tipo_contratacao, TipoContratacao, 'Natureza do objeto');
    enumOk(body?.criterio_julgamento, CriterioJulgamento, 'Critério de julgamento');
    const r = await this.licitacoes.criarAPartirDeDfd(
      id,
      {
        numero_processo: body?.numero_processo || undefined,
        objeto: body?.objeto || undefined,
        modalidade: body?.modalidade || undefined,
        tipo_contratacao: body?.tipo_contratacao || undefined,
        criterio_julgamento: body?.criterio_julgamento || undefined,
      },
      orgaoId,
      atorTransicaoDe(ator),
      ator,
    );
    return { licitacao: licitacaoParaOrgao(r.licitacao), alertas: r.alertas, alerta: r.alerta };
  }
}
