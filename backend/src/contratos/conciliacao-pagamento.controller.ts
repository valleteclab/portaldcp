import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { IsNumber, IsString, IsUUID, Length } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { JwtPayload } from '../auth/auth.service';
import { ConciliacaoPagamentoService } from './conciliacao-pagamento.service';

class VincularPagamentoDto {
  @IsString() @Length(64, 64) pagamento_chave: string;
  @IsUUID() medicao_id: string;
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  valor: number;
  @IsString() @Length(5, 2000) justificativa: string;
}
class CancelarVinculoDto {
  @IsString() @Length(5, 2000) justificativa: string;
}

@Controller('contratos/:contratoId/conciliacao-pagamentos')
@UseGuards(JwtAuthGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
@RequireModule(ModuloSistema.CONTRATOS)
export class ConciliacaoPagamentoController {
  constructor(private readonly service: ConciliacaoPagamentoService) {}
  @Get()
  listar(
    @Param('contratoId', ParseUUIDPipe) id: string,
    @Req() req: { user: JwtPayload },
  ) {
    return this.service.listar(id, req.user);
  }
  @Post()
  vincular(
    @Param('contratoId', ParseUUIDPipe) id: string,
    @Req() req: { user: JwtPayload },
    @Body() dto: VincularPagamentoDto,
  ) {
    return this.service.vincular(id, req.user, dto);
  }
  @Post(':vinculoId/cancelar')
  cancelar(
    @Param('contratoId', ParseUUIDPipe) id: string,
    @Param('vinculoId', ParseUUIDPipe) vinculo: string,
    @Req() req: { user: JwtPayload },
    @Body() dto: CancelarVinculoDto,
  ) {
    return this.service.cancelar(id, vinculo, req.user, dto.justificativa);
  }
}
