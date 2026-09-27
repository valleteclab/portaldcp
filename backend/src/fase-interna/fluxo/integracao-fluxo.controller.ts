import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import { AtorAtual } from '../../auth/acesso/acesso.decorators';
import type { Ator } from '../../auth/acesso/ator';
import { DespachoEtapaService } from '../despacho-etapa.service';
import { DonoFaseInternaGuard, DonoPor } from '../dono-fase-interna.guard';
import { IntegracaoFluxoService } from './integracao-fluxo.service';

/**
 * TRAMITAÇÃO ↔ FLUXO (F3a). Isolamento: `DonoFaseInternaGuard` — órgão do
 * JWT; `:licitacaoId`/despacho de outro órgão → 404 (leitura); fornecedor
 * 403; anônimo 401.
 */
@Controller('fase-interna')
@UseGuards(DonoFaseInternaGuard)
export class IntegracaoFluxoController {
  constructor(
    private readonly integracao: IntegracaoFluxoService,
    private readonly despachos: DespachoEtapaService,
  ) {}

  /**
   * Para onde o processo vai a seguir: `{ destinos: [{ setor_id, usuario_id,
   * rotulo, etapas: [codigo, nome][], principal }], despacho_sugerido,
   * finalidade, pode_enviar, motivo_bloqueio? }` (+ extras: modo, com_quem,
   * pendentes_do_detentor, etapas_sem_destino).
   */
  @Get(':licitacaoId/tramitacao/sugestao-envio')
  sugestaoEnvio(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator) {
    return this.integracao.sugestaoEnvio(licitacaoId, ator);
  }

  /** PDF do despacho de uma etapa de registro (folha dos autos). */
  @Get('despachos/:id/pdf')
  @DonoPor('despacho', 'id')
  async despachoPdf(@Param('id') id: string, @Res() res: Response) {
    const arq = await this.despachos.arquivo(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${arq.nome}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(fs.readFileSync(arq.caminho));
  }
}
