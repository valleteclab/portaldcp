import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { AtorAtual, SomenteOrgao } from '../../auth/acesso/acesso.decorators';
import type { Ator } from '../../auth/acesso/ator';
import { RequireModule } from '../../auth/require-module.decorator';
import { ModuloSistema } from '../../orgaos/enums/modulos.enum';
import { AreaTrabalhoService } from './area-trabalho.service';

/**
 * ÁREA DE TRABALHO do agente de contratação/pregoeiro — `GET /api/area-de-trabalho`.
 * Órgão dono (token); faz parte do módulo de Licitações.
 */
@Controller('area-de-trabalho')
@RequireModule(ModuloSistema.LICITACOES)
export class AreaTrabalhoController {
  constructor(private readonly servico: AreaTrabalhoService) {}

  @Get()
  @SomenteOrgao()
  async listar(@AtorAtual() ator: Ator, @Query('meus') meus?: string) {
    if (!ator.orgaoId) throw new ForbiddenException('Disponível para usuários do órgão');
    return this.servico.listar(ator.orgaoId, ator.usuarioId ?? null, { soMeus: meus === '1' || meus === 'true' });
  }
}
