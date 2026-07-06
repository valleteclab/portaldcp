import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Param,
  Query,
  Body,
} from '@nestjs/common';
import { ParametrosLicitacaoService } from './parametros-licitacao.service';
import { ParametroLicitacao } from './entities/parametro-licitacao.entity';
import { LimiteLegal } from './entities/limite-legal.entity';

@Controller('parametros-licitacao')
export class ParametrosLicitacaoController {
  constructor(private readonly service: ParametrosLicitacaoService) {}

  // === PARÂMETROS ===

  /** Parâmetros efetivos (do órgão, ou default do sistema). */
  @Get()
  resolver(@Query('orgaoId') orgaoId?: string) {
    return this.service.resolver(orgaoId);
  }

  /** Salva os parâmetros de um órgão. */
  @Put(':orgaoId')
  salvar(
    @Param('orgaoId') orgaoId: string,
    @Body() dados: Partial<ParametroLicitacao>,
  ) {
    return this.service.salvar(orgaoId, dados);
  }

  /** Restaura os parâmetros do órgão para o default do sistema. */
  @Delete(':orgaoId')
  restaurar(@Param('orgaoId') orgaoId: string) {
    return this.service.restaurarPadrao(orgaoId);
  }

  // === LIMITES LEGAIS ===

  @Get('limites/lista')
  listarLimites(@Query('orgaoId') orgaoId?: string) {
    return this.service.listarLimites(orgaoId);
  }

  @Get('limites/vigente')
  valorVigente(
    @Query('chave') chave: string,
    @Query('orgaoId') orgaoId?: string,
    @Query('data') data?: string,
  ) {
    return this.service
      .valorVigente(chave, orgaoId, data ? new Date(data) : undefined)
      .then((valor) => ({ chave, valor }));
  }

  @Post('limites')
  salvarLimite(@Body() dados: Partial<LimiteLegal>) {
    return this.service.salvarLimite(dados);
  }

  @Delete('limites/:id')
  removerLimite(@Param('id') id: string) {
    return this.service.removerLimite(id);
  }
}
