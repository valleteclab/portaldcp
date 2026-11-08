import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import { DespachoEtapaService } from './despacho-etapa.service';
import { DonoFaseInternaGuard, DonoPor } from './dono-fase-interna.guard';

/**
 * PDF do despacho de uma etapa de registro (folha dos autos). Isolamento:
 * `DonoFaseInternaGuard` — despacho de outro órgão → 404; fornecedor 403;
 * anônimo 401. (Antes morava no controller da integração tramitação ↔ tarefas
 * do motor antigo, removido em 11/2026.)
 */
@Controller('fase-interna')
@UseGuards(DonoFaseInternaGuard)
export class DespachoEtapaController {
  constructor(private readonly despachos: DespachoEtapaService) {}

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
