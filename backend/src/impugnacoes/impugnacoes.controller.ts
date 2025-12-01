import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { ImpugnacoesService } from './impugnacoes.service';
import { StatusImpugnacao } from './impugnacao.entity';

@Controller('impugnacoes')
export class ImpugnacoesController {
  constructor(private readonly impugnacoesService: ImpugnacoesService) {}

  @Get('licitacao/:licitacaoId')
  findByLicitacao(@Param('licitacaoId') licitacaoId: string) {
    return this.impugnacoesService.findByLicitacao(licitacaoId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.impugnacoesService.findOne(id);
  }

  @Post()
  create(@Body() data: {
    licitacao_id: string;
    fornecedor_id?: string;
    nome_impugnante?: string;
    cpf_cnpj_impugnante?: string;
    email_impugnante?: string;
    is_cidadao?: boolean;
    texto_impugnacao: string;
    item_edital_impugnado?: string;
    fundamentacao_legal?: string;
  }) {
    return this.impugnacoesService.create(data);
  }

  @Put(':id/responder')
  responder(
    @Param('id') id: string,
    @Body() data: {
      resposta: string;
      status: StatusImpugnacao;
      respondido_por: string;
      altera_edital?: boolean;
      alteracoes_edital?: string;
    }
  ) {
    return this.impugnacoesService.responder(id, data);
  }

  @Put(':id/em-analise')
  marcarEmAnalise(@Param('id') id: string) {
    return this.impugnacoesService.marcarEmAnalise(id);
  }

  @Get('licitacao/:licitacaoId/pendentes/count')
  countPendentes(@Param('licitacaoId') licitacaoId: string) {
    return this.impugnacoesService.countPendentes(licitacaoId);
  }
}
