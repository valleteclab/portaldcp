import { Controller, Get, Post, Put, Param, Body, Query } from '@nestjs/common';
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
}
