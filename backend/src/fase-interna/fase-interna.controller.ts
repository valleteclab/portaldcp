import { Controller, Get, Post, Put, Delete, Param, Body, Query } from '@nestjs/common';
import { FaseInternaService } from './fase-interna.service';
import { TipoDocumentoFaseInterna, OrigemDocumento } from './entities/documento-fase-interna.entity';

@Controller('fase-interna')
export class FaseInternaController {
  constructor(private readonly faseInternaService: FaseInternaService) {}

  // === DOCUMENTOS ===

  @Post(':licitacaoId/documento')
  async criarDocumento(
    @Param('licitacaoId') licitacaoId: string,
    @Body() body: {
      tipo: TipoDocumentoFaseInterna;
      titulo: string;
      descricao?: string;
      criadorId?: string;
      criadorNome?: string;
    }
  ) {
    return this.faseInternaService.criarDocumento(
      licitacaoId,
      body.tipo,
      body.titulo,
      body.descricao,
      body.criadorId,
      body.criadorNome
    );
  }

  @Post(':licitacaoId/importar-documento')
  async importarDocumento(
    @Param('licitacaoId') licitacaoId: string,
    @Body() body: {
      tipo: TipoDocumentoFaseInterna;
      titulo: string;
      origem: OrigemDocumento;
      sistemaOrigem: string;
      idExterno: string;
      nomeArquivo?: string;
      caminhoArquivo?: string;
      hashArquivo?: string;
    }
  ) {
    return this.faseInternaService.importarDocumento(
      licitacaoId,
      body.tipo,
      body.titulo,
      body.origem,
      body.sistemaOrigem,
      body.idExterno,
      body.nomeArquivo,
      body.caminhoArquivo,
      body.hashArquivo
    );
  }

  @Post('importar-processo')
  async importarProcessoCompleto(
    @Body() body: {
      sistemaOrigem: string;
      idExterno: string;
      numero_processo: string;
      objeto: string;
      modalidade: string;
      orgaoId: string;
      documentos: Array<{
        tipo: TipoDocumentoFaseInterna;
        titulo: string;
        idExterno: string;
        caminhoArquivo?: string;
      }>;
    }
  ) {
    return this.faseInternaService.importarProcessoCompleto(body);
  }

  @Get(':licitacaoId/documentos')
  async getDocumentos(@Param('licitacaoId') licitacaoId: string) {
    return this.faseInternaService.getDocumentos(licitacaoId);
  }

  @Get(':licitacaoId/documentos/:tipo')
  async getDocumentosPorTipo(
    @Param('licitacaoId') licitacaoId: string,
    @Param('tipo') tipo: TipoDocumentoFaseInterna
  ) {
    return this.faseInternaService.getDocumentosPorTipo(licitacaoId, tipo);
  }

  @Get('documento/:id')
  async getDocumento(@Param('id') id: string) {
    return this.faseInternaService.getDocumento(id);
  }

  // === APROVACAO ===

  @Put('documento/:id/submeter')
  async submeterParaAprovacao(@Param('id') id: string) {
    return this.faseInternaService.submeterParaAprovacao(id);
  }

  @Put('documento/:id/aprovar')
  async aprovarDocumento(
    @Param('id') id: string,
    @Body() body: { aprovadorId: string; aprovadorNome: string; observacao?: string }
  ) {
    return this.faseInternaService.aprovarDocumento(
      id,
      body.aprovadorId,
      body.aprovadorNome,
      body.observacao
    );
  }

  @Put('documento/:id/reprovar')
  async reprovarDocumento(
    @Param('id') id: string,
    @Body() body: { aprovadorId: string; aprovadorNome: string; observacao: string }
  ) {
    return this.faseInternaService.reprovarDocumento(
      id,
      body.aprovadorId,
      body.aprovadorNome,
      body.observacao
    );
  }

  // === VERIFICACAO E AVANCO ===

  @Get(':licitacaoId/verificar')
  async verificarFaseCompleta(@Param('licitacaoId') licitacaoId: string) {
    return this.faseInternaService.verificarFaseCompleta(licitacaoId);
  }

  @Get(':licitacaoId/resumo')
  async getResumoFaseInterna(@Param('licitacaoId') licitacaoId: string) {
    return this.faseInternaService.getResumoFaseInterna(licitacaoId);
  }

  @Put(':licitacaoId/avancar')
  async avancarFaseInterna(@Param('licitacaoId') licitacaoId: string) {
    return this.faseInternaService.avancarFaseInterna(licitacaoId);
  }

  // === DASHBOARD ===

  @Get('dashboard')
  async getDashboard(@Query('orgao_id') orgaoId: string) {
    return this.faseInternaService.getDashboard(orgaoId);
  }

  // === RISCOS ===

  @Get(':licitacaoId/riscos')
  async getRiscos(@Param('licitacaoId') licitacaoId: string) {
    return this.faseInternaService.getRiscos(licitacaoId);
  }

  @Post(':licitacaoId/riscos')
  async adicionarRisco(
    @Param('licitacaoId') licitacaoId: string,
    @Body() body: {
      descricao: string;
      categoria: string;
      probabilidade: 1 | 2 | 3 | 4 | 5;
      impacto: 1 | 2 | 3 | 4 | 5;
      mitigacao: string;
      responsavel?: string;
      prazo?: string;
    }
  ) {
    return this.faseInternaService.adicionarRisco(licitacaoId, body);
  }

  @Put(':licitacaoId/riscos/:riscoId')
  async atualizarRisco(
    @Param('licitacaoId') licitacaoId: string,
    @Param('riscoId') riscoId: string,
    @Body() body: Partial<{
      descricao: string;
      categoria: string;
      probabilidade: 1 | 2 | 3 | 4 | 5;
      impacto: 1 | 2 | 3 | 4 | 5;
      mitigacao: string;
      responsavel: string;
      prazo: string;
      status: 'identificado' | 'mitigado' | 'aceito';
    }>
  ) {
    return this.faseInternaService.atualizarRisco(licitacaoId, riscoId, body);
  }

  @Delete(':licitacaoId/riscos/:riscoId')
  async removerRisco(
    @Param('licitacaoId') licitacaoId: string,
    @Param('riscoId') riscoId: string
  ) {
    return this.faseInternaService.removerRisco(licitacaoId, riscoId);
  }

  // === PESQUISA DE PRECOS ===

  @Get(':licitacaoId/precos')
  async getPrecos(@Param('licitacaoId') licitacaoId: string) {
    return this.faseInternaService.getPrecos(licitacaoId);
  }

  @Post(':licitacaoId/precos/fonte')
  async adicionarFontePreco(
    @Param('licitacaoId') licitacaoId: string,
    @Body() body: {
      itemNumero: number;
      cotacao: {
        fonte: string;
        tipo: 'PNCP' | 'PAINEL_PRECOS' | 'COTACAO_DIRETA' | 'CATALOGO' | 'ORCAMENTO';
        valor_unitario: number;
        data_pesquisa: string;
        fornecedor?: string;
        url_referencia?: string;
        observacao?: string;
        valida?: boolean;
      };
    }
  ) {
    return this.faseInternaService.adicionarFontePreco(licitacaoId, body.itemNumero, body.cotacao);
  }

  @Delete(':licitacaoId/precos/fonte')
  async removerFontePreco(
    @Param('licitacaoId') licitacaoId: string,
    @Query('item') itemNumero: string,
    @Query('index') cotacaoIndex: string
  ) {
    return this.faseInternaService.removerFontePreco(
      licitacaoId,
      parseInt(itemNumero),
      parseInt(cotacaoIndex)
    );
  }

  // === APROVACOES AGREGADAS ===

  @Get('aprovacoes')
  async getAprovacoes(@Query('orgao_id') orgaoId: string) {
    return this.faseInternaService.getAprovacoesOrgao(orgaoId);
  }

  // === WIZARD ===

  @Post(':licitacaoId/wizard')
  async salvarWizard(
    @Param('licitacaoId') licitacaoId: string,
    @Body() body: {
      dfd?: string;
      etp?: Record<string, any>;
      riscos?: Array<any>;
      pesquisaPrecos?: Array<any>;
      tr?: Record<string, any>;
      autorizacao?: string;
      edital?: string;
      parecerJuridico?: string;
      criadorId?: string;
      criadorNome?: string;
    }
  ) {
    return this.faseInternaService.salvarWizard(licitacaoId, body);
  }
}
