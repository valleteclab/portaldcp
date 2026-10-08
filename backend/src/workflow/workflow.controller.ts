import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { AtorAtual } from '../auth/acesso/acesso.decorators';
import type { Ator } from '../auth/acesso/ator';
import { WorkflowService } from './workflow.service';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { CATALOGO_NOS } from './nos/catalogo-nos';
import { TeamsService } from './avisos/teams.service';
import { DesenhoFluxoService } from './desenho/desenho-fluxo.service';
import { ChecklistEtapaService } from './checklist/checklist-etapa.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { TempoEtapasService } from './tempo/tempo-etapas.service';

const orgaoDo = (ator: Ator) => { if (!ator?.orgaoId) throw new BadRequestException('Acesso exclusivo do órgão'); return ator.orgaoId; };
/** Canal do Teams é configuração do órgão: só o login do órgão ou o usuário ADMIN dele cadastra, remove ou testa. */
const ehAdminDoOrgao = (ator: Ator) => ator.tipo === 'ORGAO' || !!ator.admin || String(ator.role ?? '').toUpperCase() === 'ADMIN';
const adminDoOrgao = (ator: Ator) => { const orgaoId = orgaoDo(ator); if (ehAdminDoOrgao(ator)) return orgaoId; throw new ForbiddenException('Só o administrador do órgão altera esta configuração'); };

/** Fluxos de processo: desenho e execução. Parte do Processo Eletrônico — desliga junto com ele. */
@Controller('workflows')
@RequireModule(ModuloSistema.PROCESSOS)
export class WorkflowController {
  constructor(private readonly service: WorkflowService, private readonly teams: TeamsService, private readonly whatsapp: WhatsAppService, private readonly desenhos: DesenhoFluxoService, private readonly checklist: ChecklistEtapaService, private readonly tempo: TempoEtapasService) {}
  /** Etapas que podem ser arrastadas para o desenho (paleta), com a trava legal de cada uma. */
  @Get('catalogo-nos') catalogo() { return CATALOGO_NOS; }
  /** "Canais de aviso do órgão" da tela de desenho: o que já está conectado. */
  @Get('canais-aviso') async canaisAviso(@AtorAtual() ator: Ator) {
    const orgaoId = orgaoDo(ator);
    const [whatsappConectado, teamsCanais] = await Promise.all([this.whatsapp.isConfigurado(orgaoId), this.teams.listar(orgaoId)]);
    return { whatsapp: whatsappConectado, teams: teamsCanais };
  }
  @Get('teams-canais') teamsCanais(@AtorAtual() ator: Ator) { return this.teams.listar(orgaoDo(ator)); }
  @Post('teams-canais') criarTeamsCanal(@AtorAtual() ator: Ator, @Body() body: any) { return this.teams.criar(adminDoOrgao(ator), ator.usuarioId ?? ator.id, body); }
  @Delete('teams-canais/:canalId') removerTeamsCanal(@AtorAtual() ator: Ator, @Param('canalId') canalId: string) { return this.teams.remover(adminDoOrgao(ator), canalId); }
  @Post('teams-canais/:canalId/testar') testarTeamsCanal(@AtorAtual() ator: Ator, @Param('canalId') canalId: string) { return this.teams.testar(adminDoOrgao(ator), canalId); }
  // --- Desenho do fluxo (tela "Desenhar o fluxo"): ler é para todos do órgão; criar, alterar e ativar só o administrador ---
  /** Andamento › Tempo por etapa (antes de ':id'): versões com o que medir, visão geral e detalhe de uma etapa. Média por pessoa só para o administrador. */
  @Get('tempo-etapas/opcoes') opcoesTempo(@AtorAtual() ator: Ator) { return this.tempo.opcoes(orgaoDo(ator)); }
  @Get('tempo-etapas/etapa') detalheTempo(@AtorAtual() ator: Ator, @Query('fluxo') fluxo: string, @Query('etapa') etapa: string, @Query('dias') dias: string) { return this.tempo.detalhe(orgaoDo(ator), String(fluxo ?? ''), String(etapa ?? ''), dias, ehAdminDoOrgao(ator)); }
  @Get('tempo-etapas') resumoTempo(@AtorAtual() ator: Ator, @Query('fluxo') fluxo: string, @Query('dias') dias: string) { return this.tempo.resumo(orgaoDo(ator), String(fluxo ?? ''), dias); }
  @Get('desenhos/modelos') modelosDesenho(@AtorAtual() ator: Ator, @Query('tipo') tipo: string) { return this.desenhos.modelos(orgaoDo(ator), String(tipo ?? '').toUpperCase()); }
  @Get('desenhos/opcoes') opcoesDesenho(@AtorAtual() ator: Ator) { return this.desenhos.opcoes(orgaoDo(ator)); }
  @Get('desenhos') listarDesenhos(@AtorAtual() ator: Ator) { return this.desenhos.listar(orgaoDo(ator)); }
  @Post('desenhos') criarDesenho(@AtorAtual() ator: Ator, @Body() body: any) { return this.desenhos.criar(adminDoOrgao(ator), ator.usuarioId ?? ator.id, body); }
  @Get(':id/desenho') desenho(@AtorAtual() ator: Ator, @Param('id') id: string) { return this.desenhos.desenho(orgaoDo(ator), id); }
  @Put(':id/desenho') salvarDesenho(@AtorAtual() ator: Ator, @Param('id') id: string, @Body() body: any) { return this.desenhos.salvar(adminDoOrgao(ator), id, body); }
  @Post(':id/nova-versao') novaVersao(@AtorAtual() ator: Ator, @Param('id') id: string) { return this.desenhos.novaVersao(adminDoOrgao(ator), id, ator.usuarioId ?? ator.id); }
  @Post(':id/ativar') ativar(@AtorAtual() ator: Ator, @Param('id') id: string) { return this.desenhos.ativar(adminDoOrgao(ator), id); }
  @Get() listar(@AtorAtual() ator: Ator) { return this.service.listar(orgaoDo(ator)); }
  @Post() criar(@AtorAtual() ator: Ator, @Body() body: any) { return this.service.criar(orgaoDo(ator), ator.usuarioId ?? ator.id, body); }
  @Post('modelos-prontos/aditivo') modeloAditivo(@AtorAtual() ator: Ator) { return this.service.criarModeloAditivo(orgaoDo(ator), ator.usuarioId ?? ator.id); }
  @Post('modelos-prontos/demanda-dfd') modeloDemandaDfd(@AtorAtual() ator: Ator) { return this.service.criarModeloDemandaDfd(orgaoDo(ator), ator.usuarioId ?? ator.id); }
  /** Etapas abertas do fluxo que dependem de quem está logado (?tipo=APROVACAO para a Central de Aprovações). */
  @Get('minhas-etapas') minhasEtapas(@AtorAtual() ator: Ator, @Query('tipo') tipo?: string) { return this.service.minhasEtapas(orgaoDo(ator), ator, tipo ?? null); }
  @Get('execucoes/listar') execucoes(@AtorAtual() ator: Ator) { return this.service.listarInstancias(orgaoDo(ator)); }
  @Get('execucoes/:instanciaId') execucao(@AtorAtual() ator: Ator, @Param('instanciaId') instanciaId: string) { return this.service.obterInstancia(orgaoDo(ator), instanciaId); }
  @Post('execucoes/:instanciaId/tarefas/:tarefaId/concluir') concluir(@AtorAtual() ator: Ator, @Param('instanciaId') instanciaId: string, @Param('tarefaId') tarefaId: string, @Body() body: any) { return this.service.concluirTarefa(orgaoDo(ator), instanciaId, tarefaId, ator, body); }
  @Post('execucoes/:instanciaId/tarefas/:tarefaId/devolver') devolver(@AtorAtual() ator: Ator, @Param('instanciaId') instanciaId: string, @Param('tarefaId') tarefaId: string, @Body() body: any) { return this.service.devolverTarefa(orgaoDo(ator), instanciaId, tarefaId, ator, body); }
  // Checklist do documento da etapa (ETP: art. 18, § 1º): ver, marcar e pedir a leitura do documento pela IA
  @Get('execucoes/:instanciaId/tarefas/:tarefaId/checklist') verChecklist(@AtorAtual() ator: Ator, @Param('instanciaId') instanciaId: string, @Param('tarefaId') tarefaId: string) { return this.checklist.obter(orgaoDo(ator), instanciaId, tarefaId); }
  @Put('execucoes/:instanciaId/tarefas/:tarefaId/checklist') marcarChecklist(@AtorAtual() ator: Ator, @Param('instanciaId') instanciaId: string, @Param('tarefaId') tarefaId: string, @Body() body: any) { return this.checklist.marcar(orgaoDo(ator), instanciaId, tarefaId, ator, body); }
  @Post('execucoes/:instanciaId/tarefas/:tarefaId/checklist/analisar') analisarChecklist(@AtorAtual() ator: Ator, @Param('instanciaId') instanciaId: string, @Param('tarefaId') tarefaId: string) { return this.checklist.analisar(orgaoDo(ator), instanciaId, tarefaId, ator); }
  @Post('execucoes/:instanciaId/tarefas/:tarefaId/indeferir') indeferir(@AtorAtual() ator: Ator, @Param('instanciaId') instanciaId: string, @Param('tarefaId') tarefaId: string, @Body() body: any) { return this.service.indeferirTarefa(orgaoDo(ator), instanciaId, tarefaId, ator, body); }
  @Get(':id') obter(@AtorAtual() ator: Ator, @Param('id') id: string) { return this.service.obter(orgaoDo(ator), id); }
  @Patch(':id') atualizar(@AtorAtual() ator: Ator, @Param('id') id: string, @Body() body: any) { return this.service.atualizar(orgaoDo(ator), id, body); }
  @Post(':id/iniciar') iniciar(@AtorAtual() ator: Ator, @Param('id') id: string, @Body() body: any) { return this.service.iniciar(orgaoDo(ator), id, ator.usuarioId ?? ator.id, body); }
  @Post(':id/fases') fase(@AtorAtual() ator: Ator, @Param('id') id: string, @Body() body: any) { return this.service.adicionarFase(orgaoDo(ator), id, body); }
  @Post(':id/formularios') formulario(@AtorAtual() ator: Ator, @Param('id') id: string, @Body() body: any) { return this.service.adicionarFormulario(orgaoDo(ator), id, body); }
  @Post(':id/formularios/:formularioId/campos') campo(@AtorAtual() ator: Ator, @Param('id') id: string, @Param('formularioId') formularioId: string, @Body() body: any) { return this.service.adicionarCampo(orgaoDo(ator), id, formularioId, body); }
  @Post(':id/fases/:faseId/acoes') acao(@AtorAtual() ator: Ator, @Param('id') id: string, @Param('faseId') faseId: string, @Body() body: any) { return this.service.adicionarAcao(orgaoDo(ator), id, faseId, body); }
  @Patch(':id/acoes/:acaoId') atualizarAcao(@AtorAtual() ator: Ator, @Param('id') id: string, @Param('acaoId') acaoId: string, @Body() body: any) { return this.service.atualizarAcao(orgaoDo(ator), id, acaoId, body); }
  @Post(':id/acoes/:acaoId/reacoes') reacao(@AtorAtual() ator: Ator, @Param('id') id: string, @Param('acaoId') acaoId: string, @Body() body: any) { return this.service.adicionarReacao(orgaoDo(ator), id, acaoId, body); }
  @Patch(':id/reacoes/:reacaoId') atualizarReacao(@AtorAtual() ator: Ator, @Param('id') id: string, @Param('reacaoId') reacaoId: string, @Body() body: any) { return this.service.atualizarReacao(orgaoDo(ator), id, reacaoId, body); }
}
