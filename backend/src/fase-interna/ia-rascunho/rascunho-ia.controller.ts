import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AtorAtual } from '../../auth/acesso/acesso.decorators';
import type { Ator } from '../../auth/acesso/ator';
import { DonoFaseInternaGuard, DonoModo } from '../dono-fase-interna.guard';
import { TarefasService } from '../tarefas/tarefas.service';
import { RascunhoIaService } from './rascunho-ia.service';
import { TrabalhoNaEtapa, TrabalhoNaEtapaGuard } from '../fluxo/trabalho-na-etapa.guard';

/**
 * RASCUNHO DA IA POR ETAPA (F4a). DonoFaseInternaGuard na classe: anônimo
 * 401, fornecedor 403; processo de OUTRO órgão → 404 também na escrita
 * (@DonoModo('leitura')): nem a existência do processo alheio é revelada. O
 * rascunho é sempre procurado pelo par (processo, rascunho) — id de rascunho
 * de outro processo → 404. Autor sempre do JWT.
 */
@Controller('fase-interna')
@UseGuards(DonoFaseInternaGuard, TrabalhoNaEtapaGuard)
export class RascunhoIaController {
  constructor(
    private readonly rascunhos: RascunhoIaService,
    private readonly tarefas: TarefasService,
  ) {}

  /** ?peca=DFD|ETP|TR|AA|PJ|MCI|REGISTRO|TRAMITACAO[&etapa=CODIGO] — o rascunho vigente e se a IA está disponível. */
  @Get(':licitacaoId/rascunho-ia')
  obter(@Param('licitacaoId') id: string, @Query('peca') peca: string, @Query('etapa') etapa?: string) {
    return this.rascunhos.obter(id, peca, etapa);
  }

  /** "Gerar com IA" / "Gerar de novo": { peca, etapa?, destino?, finalidade?, despacho? } (os três últimos só no envio). */
  @Post(':licitacaoId/rascunho-ia/gerar')
  @DonoModo('leitura')
  async gerar(@Param('licitacaoId') id: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.rascunhos.gerarManual(id, body ?? {}, await this.tarefas.autor(ator));
  }

  /** "Aceitar como base" — só seções vazias; devolve o que entrou e o que foi mantido. */
  @TrabalhoNaEtapa({ rascunhoParam: 'rascunhoId', acao: 'aceitar o rascunho da IA' })
  @Post(':licitacaoId/rascunho-ia/:rascunhoId/aceitar')
  @DonoModo('leitura')
  async aceitar(@Param('licitacaoId') id: string, @Param('rascunhoId') rascunhoId: string, @AtorAtual() ator: Ator) {
    return this.rascunhos.aceitar(id, rascunhoId, ator, await this.tarefas.autor(ator));
  }

  @Post(':licitacaoId/rascunho-ia/:rascunhoId/descartar')
  @DonoModo('leitura')
  async descartar(@Param('licitacaoId') id: string, @Param('rascunhoId') rascunhoId: string, @AtorAtual() ator: Ator) {
    return this.rascunhos.descartar(id, rascunhoId, await this.tarefas.autor(ator));
  }
}
