import { Controller, Get, Post } from '@nestjs/common';
import { AtorAtual, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import type { Ator } from '../auth/acesso/ator';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { GuiaService } from './guia.service';

/**
 * GUIA DE PRIMEIROS PASSOS (`/api/guia`) — botão "Guia" do cabeçalho.
 * Órgão sempre o do token; faz parte do módulo Processo Eletrônico.
 */
@Controller('guia')
@SomenteOrgao()
@RequireModule(ModuloSistema.PROCESSOS)
export class GuiaController {
  constructor(private readonly guia: GuiaService) {}

  /** Os dois roteiros com o passo de cada um, deduzidos dos dados do órgão. */
  @Get()
  progresso(@AtorAtual() ator: Ator) {
    return this.guia.progresso(ator);
  }

  /** Começa (ou recomeça) o roteiro da dispensa: a próxima demanda criada passa a ser a de teste. */
  @Post('dispensa/comecar')
  comecarDispensa(@AtorAtual() ator: Ator) {
    return this.guia.comecarDispensa(ator);
  }
}
