import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { PatrimonioInventarioService } from './patrimonio-inventario.service';
import { PatrimonioMovimentacaoService } from './patrimonio-movimentacao.service';

/**
 * Rotas públicas do patrimônio (sem JWT):
 * - /p/<id> do QR da plaqueta → dados básicos do bem;
 * - conferência do inventário pelo link com token do setor (app no celular);
 * - aceite de transferência pelo link com token do lote.
 * O token de 64 hex é a credencial; as rotas têm limite por IP.
 */
@Controller('patrimonio-pub')
@Public()
export class PatrimonioPublicController {
  constructor(
    private readonly inventario: PatrimonioInventarioService,
    private readonly movimentacao: PatrimonioMovimentacaoService,
  ) {}

  @Get('movimentacao/:token')
  lote(@Param('token') token: string) {
    return this.movimentacao.obterLotePorToken(token);
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('movimentacao/:token/responder')
  responder(@Param('token') token: string, @Body() body: any) {
    return this.movimentacao.responderLote(token, { nome: body?.nome, aceitar: !!body?.aceitar, motivo: body?.motivo });
  }

  @Get('bem/:id')
  bem(@Param('id') id: string) {
    return this.inventario.bemPublico(id);
  }

  @Get('inventario/:token')
  setor(@Param('token') token: string) {
    return this.inventario.obterPorToken(token);
  }

  @Throttle({ default: { limit: 240, ttl: 60000 } })
  @Post('inventario/:token/leitura')
  leitura(@Param('token') token: string, @Body() body: any) {
    return this.inventario.registrarLeitura(token, {
      codigo: body?.codigo,
      origem: body?.origem,
      estado_conservacao: body?.estado_conservacao,
      observacao: body?.observacao,
      lido_por: body?.lido_por,
    });
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('inventario/:token/sem-plaqueta')
  semPlaqueta(@Param('token') token: string, @Body() body: any) {
    return this.inventario.cadastrarSemPlaqueta(token, {
      descricao: body?.descricao,
      categoria_id: body?.categoria_id,
      estado_conservacao: body?.estado_conservacao,
      observacao: body?.observacao,
      lido_por: body?.lido_por,
      marca: body?.marca,
      modelo: body?.modelo,
      numero_serie: body?.numero_serie,
    });
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('inventario/:token/fechar')
  fechar(@Param('token') token: string, @Body() body: any) {
    return this.inventario.fecharSetor(token, { nome: body?.nome, observacoes: body?.observacoes });
  }
}
