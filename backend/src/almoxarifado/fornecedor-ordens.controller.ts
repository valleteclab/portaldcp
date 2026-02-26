import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  ParseUUIDPipe,
  ForbiddenException,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { OrdemFornecimentoService } from './ordem-fornecimento.service';
import { JwtPayload, UserType } from '../auth/auth.service';
import { StatusOrdemFornecimento } from './entities/ordem-fornecimento.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('fornecedor/ordens')
export class FornecedorOrdensController {
  constructor(private readonly ordemService: OrdemFornecimentoService) {}

  private getFornecedorId(user: JwtPayload): string {
    if (user.type !== UserType.FORNECEDOR) {
      throw new ForbiddenException('Apenas fornecedores podem acessar ordens');
    }
    return user.sub;
  }

  @Get()
  async listarOrdens(
    @Req() request: { user: JwtPayload },
    @Query('status') status?: StatusOrdemFornecimento,
  ) {
    const fornecedorId = this.getFornecedorId(request.user);
    return this.ordemService.findByFornecedor(fornecedorId, status);
  }

  @Get(':id')
  async getOrdem(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const fornecedorId = this.getFornecedorId(request.user);
    const ordem = await this.ordemService.findOne(id);

    if (ordem.fornecedor_id !== fornecedorId) {
      throw new ForbiddenException('Esta ordem não pertence ao seu cadastro');
    }

    return ordem;
  }

  @Post(':id/ciencia-recebimento')
  async cienciaRecebimento(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @Body() body: { observacao?: string },
  ) {
    const fornecedorId = this.getFornecedorId(request.user);
    return this.ordemService.fornecedorCienciaRecebimento(
      id,
      fornecedorId,
      body.observacao,
    );
  }

  @Post(':id/ciencia-entrega')
  async cienciaEntrega(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @Body() body: { data_entrega: string; observacao?: string },
  ) {
    const fornecedorId = this.getFornecedorId(request.user);

    if (!body.data_entrega) {
      throw new BadRequestException('Data de entrega é obrigatória');
    }

    const dataEntrega = new Date(body.data_entrega);
    if (isNaN(dataEntrega.getTime())) {
      throw new BadRequestException('Data de entrega inválida');
    }

    return this.ordemService.fornecedorCienciaEntrega(
      id,
      fornecedorId,
      dataEntrega,
      body.observacao,
    );
  }
}
