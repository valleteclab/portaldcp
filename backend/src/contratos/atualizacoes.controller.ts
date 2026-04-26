import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Req,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { JwtPayload, UserType } from '../auth/auth.service';
import { AtualizacoesService } from './atualizacoes.service';
import { AtualizacaoSistema } from './entities/atualizacao-sistema.entity';

@Controller('atualizacoes')
export class AtualizacoesController {
  constructor(private readonly service: AtualizacoesService) {}

  /**
   * Fornecedor busca a última atualização não lida.
   * GET /api/atualizacoes/nao-lida?fornecedorId=X
   */
  @Get('nao-lida')
  async buscarNaoLida(
    @Query('fornecedorId') fornecedorId: string,
    @Req() request: { user: JwtPayload },
  ) {
    if (!fornecedorId) throw new BadRequestException('fornecedorId é obrigatório');
    if (request.user.type === UserType.FORNECEDOR && request.user.sub !== fornecedorId) {
      throw new ForbiddenException('Acesso negado');
    }
    return this.service.buscarUltimaNaoLida(fornecedorId);
  }

  /**
   * Fornecedor marca atualização como lida.
   * POST /api/atualizacoes/:atualizacaoId/marcar-lida
   */
  @Post(':atualizacaoId/marcar-lida')
  async marcarComoLida(
    @Param('atualizacaoId') atualizacaoId: string,
    @Body() body: { fornecedor_id: string },
    @Req() request: { user: JwtPayload },
  ) {
    if (!body.fornecedor_id) throw new BadRequestException('fornecedor_id é obrigatório');
    if (request.user.type === UserType.FORNECEDOR && request.user.sub !== body.fornecedor_id) {
      throw new ForbiddenException('Acesso negado');
    }
    return this.service.marcarComoLida(body.fornecedor_id, atualizacaoId);
  }

  // === Rotas admin ===

  /**
   * Admin lista todas as atualizações.
   * GET /api/atualizacoes
   */
  @Get()
  async listar() {
    return this.service.listar();
  }

  /**
   * Admin cria nova atualização.
   * POST /api/atualizacoes
   */
  @Post()
  async criar(
    @Body() body: { titulo: string; conteudo: string; publico_alvo?: string },
    @Req() request: { user: JwtPayload },
  ) {
    if (request.user.type !== UserType.ADMIN && request.user.type !== UserType.ORGAO) {
      throw new ForbiddenException('Apenas administradores podem criar atualizações');
    }
    if (!body.titulo || !body.conteudo) {
      throw new BadRequestException('titulo e conteudo são obrigatórios');
    }
    return this.service.criar(body);
  }

  /**
   * Admin remove atualização.
   * DELETE /api/atualizacoes/:id
   */
  @Delete(':id')
  async remover(
    @Param('id') id: string,
    @Req() request: { user: JwtPayload },
  ) {
    if (request.user.type !== UserType.ADMIN && request.user.type !== UserType.ORGAO) {
      throw new ForbiddenException('Apenas administradores podem remover atualizações');
    }
    return this.service.remover(id);
  }
}
