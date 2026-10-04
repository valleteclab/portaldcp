import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { AtorAtual } from '../auth/acesso/acesso.decorators';
import type { Ator } from '../auth/acesso/ator';
import { WorkflowService } from './workflow.service';

const orgaoDo = (ator: Ator) => { if (!ator?.orgaoId) throw new BadRequestException('Acesso exclusivo do órgão'); return ator.orgaoId; };

@Controller('workflows')
export class WorkflowController {
  constructor(private readonly service: WorkflowService) {}
  @Get() listar(@AtorAtual() ator: Ator) { return this.service.listar(orgaoDo(ator)); }
  @Post() criar(@AtorAtual() ator: Ator, @Body() body: any) { return this.service.criar(orgaoDo(ator), ator.usuarioId ?? ator.id, body); }
  @Post('modelos-prontos/aditivo') modeloAditivo(@AtorAtual() ator: Ator) { return this.service.criarModeloAditivo(orgaoDo(ator), ator.usuarioId ?? ator.id); }
  @Get('execucoes/listar') execucoes(@AtorAtual() ator: Ator) { return this.service.listarInstancias(orgaoDo(ator)); }
  @Get('execucoes/:instanciaId') execucao(@AtorAtual() ator: Ator, @Param('instanciaId') instanciaId: string) { return this.service.obterInstancia(orgaoDo(ator), instanciaId); }
  @Post('execucoes/:instanciaId/tarefas/:tarefaId/concluir') concluir(@AtorAtual() ator: Ator, @Param('instanciaId') instanciaId: string, @Param('tarefaId') tarefaId: string, @Body() body: any) { return this.service.concluirTarefa(orgaoDo(ator), instanciaId, tarefaId, ator, body); }
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
