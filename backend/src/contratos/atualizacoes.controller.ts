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
import { AcessoLicitacaoService, AtorAtual, SomenteFornecedor } from '../auth/acesso';
import type { Ator } from '../auth/acesso';

@Controller('atualizacoes')
export class AtualizacoesController {
  constructor(
    private readonly service: AtualizacoesService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  /**
   * Fornecedor busca a última atualização não lida.
   * GET /api/atualizacoes/nao-lida?fornecedorId=X
   */
  @Get('nao-lida')
  @SomenteFornecedor()
  async buscarNaoLida(
    @Query('fornecedorId') fornecedorIdInformado: string,
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.acesso.fornecedorDoToken(ator, fornecedorIdInformado);
    return this.service.buscarUltimaNaoLida(fornecedorId);
  }

  /**
   * Fornecedor marca atualização como lida.
   * POST /api/atualizacoes/:atualizacaoId/marcar-lida
   */
  @Post(':atualizacaoId/marcar-lida')
  @SomenteFornecedor()
  async marcarComoLida(
    @Param('atualizacaoId') atualizacaoId: string,
    @Body() body: { fornecedor_id?: string },
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.acesso.fornecedorDoToken(ator, body?.fornecedor_id);
    return this.service.marcarComoLida(fornecedorId, atualizacaoId);
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
