import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AtorAtual } from '../../auth/acesso/acesso.decorators';
import type { Ator } from '../../auth/acesso/ator';
import { DonoFaseInternaGuard } from '../dono-fase-interna.guard';
import { TarefasService } from '../tarefas/tarefas.service';
import { ConformidadeService } from './conformidade.service';

/**
 * CONFORMIDADE ANTES DA PUBLICAÇÃO (Entrega 4; mockup Conformidade).
 * DonoFaseInternaGuard na classe: anônimo 401, fornecedor 403; `:licitacaoId`
 * exige o órgão DONO (leitura de outro órgão 404; escrita 403). Autor sempre
 * do JWT. Achado de outro processo: 404.
 */
@Controller('fase-interna')
@UseGuards(DonoFaseInternaGuard)
export class ConformidadeController {
  constructor(
    private readonly conformidade: ConformidadeService,
    private readonly tarefas: TarefasService,
  ) {}

  /** Tela: contagens, achados com evidências e ação, regras, quadro do aviso, assinaturas e o botão de publicar. */
  @Get(':licitacaoId/conformidade')
  async obter(@Param('licitacaoId') id: string) {
    await this.tarefas.aguardarPendentes();
    return this.conformidade.obter(id);
  }

  /** Painel do processo: contagens e os achados abertos. */
  @Get(':licitacaoId/conformidade/resumo')
  async resumo(@Param('licitacaoId') id: string) {
    await this.tarefas.aguardarPendentes();
    return this.conformidade.resumo(id);
  }

  /** "Revisar agora": roda o motor, grava os achados (idempotente) e as tarefas. */
  @Post(':licitacaoId/conformidade/revisar')
  async revisar(@Param('licitacaoId') id: string, @AtorAtual() ator: Ator) {
    await this.conformidade.revisar(id, { origem: 'MANUAL', autor: await this.tarefas.autor(ator) });
    // as etapas (portão A da pesquisa) e as tarefas acompanham
    await this.tarefas.agendar(id);
    return this.conformidade.obter(id);
  }

  /** Justificar achado ATENÇÃO: { justificativa } (vai para os autos). BLOQUEIO: 409. */
  @Post(':licitacaoId/conformidade/achados/:achadoId/justificar')
  async justificar(@Param('licitacaoId') id: string, @Param('achadoId') achadoId: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.conformidade.justificar(id, achadoId, body ?? {}, await this.tarefas.autor(ator));
  }
}
