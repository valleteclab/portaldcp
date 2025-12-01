import { Controller, Get, Post, Put, Param, Body, Query } from '@nestjs/common';
import { SessaoService } from './sessao.service';

@Controller('sessao')
export class SessaoController {
  constructor(private readonly sessaoService: SessaoService) {}

  @Post(':licitacaoId')
  async criarSessao(
    @Param('licitacaoId') licitacaoId: string,
    @Body() body: { pregoeiroId: string; pregoeiroNome: string }
  ) {
    return this.sessaoService.criarSessao(licitacaoId, body.pregoeiroId, body.pregoeiroNome);
  }

  @Get(':id')
  async getSessao(@Param('id') id: string) {
    return this.sessaoService.getSessao(id);
  }

  @Get('licitacao/:licitacaoId')
  async getSessaoPorLicitacao(@Param('licitacaoId') licitacaoId: string) {
    return this.sessaoService.getSessaoPorLicitacao(licitacaoId);
  }

  @Get(':id/eventos')
  async getEventos(@Param('id') id: string) {
    return this.sessaoService.getEventosSessao(id);
  }

  @Put(':id/iniciar')
  async iniciarSessao(@Param('id') id: string) {
    return this.sessaoService.iniciarSessao(id);
  }

  @Put(':id/avancar-disputa')
  async avancarParaDisputa(@Param('id') id: string) {
    return this.sessaoService.avancarParaDisputa(id);
  }

  @Put(':id/iniciar-item/:itemId')
  async iniciarDisputaItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string
  ) {
    return this.sessaoService.iniciarDisputaItem(id, itemId);
  }

  @Put(':id/encerrar-item')
  async encerrarDisputaItem(@Param('id') id: string) {
    return this.sessaoService.encerrarDisputaItem(id);
  }

  @Put(':id/negociacao/:fornecedorId')
  async iniciarNegociacao(
    @Param('id') id: string,
    @Param('fornecedorId') fornecedorId: string
  ) {
    return this.sessaoService.iniciarNegociacao(id, fornecedorId);
  }

  @Put(':id/habilitacao/convocar/:fornecedorId')
  async convocarHabilitacao(
    @Param('id') id: string,
    @Param('fornecedorId') fornecedorId: string
  ) {
    return this.sessaoService.convocarParaHabilitacao(id, fornecedorId);
  }

  @Put(':id/habilitacao/aprovar/:fornecedorId')
  async aprovarHabilitacao(
    @Param('id') id: string,
    @Param('fornecedorId') fornecedorId: string
  ) {
    return this.sessaoService.aprovarHabilitacao(id, fornecedorId);
  }

  @Put(':id/habilitacao/reprovar/:fornecedorId')
  async reprovarHabilitacao(
    @Param('id') id: string,
    @Param('fornecedorId') fornecedorId: string,
    @Body() body: { motivo: string }
  ) {
    return this.sessaoService.reprovarHabilitacao(id, fornecedorId, body.motivo);
  }

  @Put(':id/recursos/abrir-prazo')
  async abrirPrazoRecurso(@Param('id') id: string) {
    return this.sessaoService.abrirPrazoIntencaoRecurso(id);
  }

  @Post(':id/recursos/intencao')
  async registrarIntencaoRecurso(
    @Param('id') id: string,
    @Body() body: { fornecedorId: string; motivacao: string }
  ) {
    return this.sessaoService.registrarIntencaoRecurso(id, body.fornecedorId, body.motivacao);
  }

  @Put(':id/adjudicar/:itemId')
  async adjudicarItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: { fornecedorId: string; valor: number }
  ) {
    return this.sessaoService.adjudicarItem(id, itemId, body.fornecedorId, body.valor);
  }

  @Put(':id/encerrar')
  async encerrarSessao(@Param('id') id: string) {
    return this.sessaoService.encerrarSessao(id);
  }

  @Put(':id/suspender')
  async suspenderSessao(
    @Param('id') id: string,
    @Body() body: { motivo: string }
  ) {
    return this.sessaoService.suspenderSessao(id, body.motivo);
  }
}
