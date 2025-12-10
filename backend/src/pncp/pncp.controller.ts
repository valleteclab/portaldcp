import { 
  Controller, 
  Get, 
  Post, 
  Put,
  Delete,
  Param, 
  Body, 
  Query,
  UseInterceptors,
  UploadedFile,
  HttpException,
  HttpStatus,
  Req
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PncpService } from './pncp.service';
import { ResultadoItemDto, ContratoDto, TIPO_DOCUMENTO } from './dto/pncp.dto';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Controller('pncp')
export class PncpController {
  constructor(private readonly pncpService: PncpService) {
    console.log('[PncpController] Controller initialized');
  }

  // ============ CREDENCIAIS PNCP DA PLATAFORMA ============

  @Get('credentials')
  getPlatformCredentials() {
    return this.pncpService.getPlatformCredentials();
  }

  @Put('credentials')
  setPlatformCredentials(@Body() body: {
    apiUrl?: string;
    login?: string;
    senha?: string;
    cnpjOrgao?: string;
  }) {
    this.pncpService.setPlatformCredentials(body);
    return { success: true, message: 'Credenciais PNCP da plataforma atualizadas!' };
  }

  @Post('credentials/test')
  async testPlatformConnection() {
    return this.pncpService.testPlatformConnection();
  }

  // ============ COMPRA/LICITAÇÃO ============

  @Get('compras/:licitacaoId/validar')
  async validarLicitacao(@Param('licitacaoId') licitacaoId: string) {
    return this.pncpService.validarLicitacaoParaPNCP(licitacaoId);
  }

  @Post('compras/:licitacaoId')
  async enviarCompra(@Param('licitacaoId') licitacaoId: string) {
    return this.pncpService.enviarCompra(licitacaoId);
  }

  @Post('compras/:licitacaoId/itens')
  async enviarItens(@Param('licitacaoId') licitacaoId: string) {
    return this.pncpService.enviarItens(licitacaoId);
  }

  @Post('compras/:licitacaoId/completo')
  async enviarCompraCompleta(@Param('licitacaoId') licitacaoId: string) {
    // Envia compra + itens em sequência
    const resultadoCompra = await this.pncpService.enviarCompra(licitacaoId);
    
    console.log('[PNCP] Resultado enviarCompra:', JSON.stringify(resultadoCompra));
    
    if (resultadoCompra.sucesso) {
      let numeroControlePNCP = resultadoCompra.numeroControlePNCP;
      let link = resultadoCompra.link;
      let ano = resultadoCompra.ano;
      let sequencial = resultadoCompra.sequencial;
      
      // Se não veio o número de controle, consultar no PNCP
      if (!numeroControlePNCP && ano && sequencial) {
        try {
          const consulta = await this.pncpService.consultarCompra(String(ano), String(sequencial));
          if (consulta?.numeroControlePNCP) {
            numeroControlePNCP = consulta.numeroControlePNCP;
            // Atualizar na licitação
            await this.pncpService.atualizarNumeroControleLicitacao(
              licitacaoId, 
              consulta.numeroControlePNCP, 
              ano as number, 
              sequencial as number
            );
          }
        } catch (e) {
          console.log('Não foi possível consultar compra após envio:', e.message);
        }
      }
      
      try {
        const resultadoItens = await this.pncpService.enviarItens(licitacaoId);
        const resposta = {
          sucesso: true,
          numeroControlePNCP,
          ano,
          sequencial,
          link,
          compra: resultadoCompra,
          itens: resultadoItens
        };
        console.log('[PNCP] Resposta final ao frontend:', JSON.stringify(resposta));
        return resposta;
      } catch (error) {
        const resposta = {
          sucesso: true,
          numeroControlePNCP,
          ano,
          sequencial,
          link,
          compra: resultadoCompra,
          itens: { sucesso: false, erro: error.message }
        };
        console.log('[PNCP] Resposta final ao frontend (erro itens):', JSON.stringify(resposta));
        return resposta;
      }
    }
    
    console.log('[PNCP] Retornando resultadoCompra direto:', JSON.stringify(resultadoCompra));
    return resultadoCompra;
  }

  // Vincular manualmente uma licitação já enviada ao PNCP
  @Post('compras/:licitacaoId/vincular')
  async vincularLicitacaoPNCP(
    @Param('licitacaoId') licitacaoId: string,
    @Body() body: {
      numeroControlePNCP: string;
      anoCompra: number;
      sequencialCompra: number;
    }
  ) {
    return this.pncpService.vincularLicitacaoExistente(
      licitacaoId,
      body.numeroControlePNCP,
      body.anoCompra,
      body.sequencialCompra
    );
  }

  // ============ DOCUMENTOS ============

  @Post('compras/:licitacaoId/documentos/:tipoDocumento')
  @UseInterceptors(FileInterceptor('arquivo'))
  async enviarDocumento(
    @Param('licitacaoId') licitacaoId: string,
    @Param('tipoDocumento') tipoDocumento: string,
    @UploadedFile() arquivo: Express.Multer.File
  ) {
    if (!arquivo) {
      throw new HttpException('Arquivo não enviado', HttpStatus.BAD_REQUEST);
    }

    const tipoDocumentoId = this.mapearTipoDocumento(tipoDocumento);
    
    return this.pncpService.enviarDocumento(
      licitacaoId,
      tipoDocumentoId,
      arquivo.buffer,
      arquivo.originalname
    );
  }

  @Post('compras/:licitacaoId/edital')
  @UseInterceptors(FileInterceptor('arquivo'))
  async enviarEdital(
    @Param('licitacaoId') licitacaoId: string,
    @UploadedFile() arquivo: Express.Multer.File
  ) {
    if (!arquivo) {
      throw new HttpException('Arquivo do edital não enviado', HttpStatus.BAD_REQUEST);
    }

    return this.pncpService.enviarDocumento(
      licitacaoId,
      TIPO_DOCUMENTO.EDITAL,
      arquivo.buffer,
      arquivo.originalname
    );
  }

  @Post('compras/:licitacaoId/termo-referencia')
  @UseInterceptors(FileInterceptor('arquivo'))
  async enviarTermoReferencia(
    @Param('licitacaoId') licitacaoId: string,
    @UploadedFile() arquivo: Express.Multer.File
  ) {
    if (!arquivo) {
      throw new HttpException('Arquivo do TR não enviado', HttpStatus.BAD_REQUEST);
    }

    return this.pncpService.enviarDocumento(
      licitacaoId,
      TIPO_DOCUMENTO.TERMO_REFERENCIA,
      arquivo.buffer,
      arquivo.originalname
    );
  }

  // ============ RESULTADO ============

  @Post('compras/:licitacaoId/itens/:itemNumero/resultado')
  async enviarResultado(
    @Param('licitacaoId') licitacaoId: string,
    @Param('itemNumero') itemNumero: number,
    @Body() resultado: ResultadoItemDto
  ) {
    return this.pncpService.enviarResultado(licitacaoId, itemNumero, resultado);
  }

  // ============ CONTRATO ============

  @Post('contratos')
  async enviarContrato(@Body() contrato: ContratoDto) {
    return this.pncpService.enviarContrato(contrato);
  }

  // ============ CONSULTAS ============

  @Get('status/:licitacaoId')
  async consultarStatus(@Param('licitacaoId') licitacaoId: string) {
    return this.pncpService.consultarStatusSincronizacao(licitacaoId);
  }

  @Get('pendentes')
  async listarPendentes() {
    return this.pncpService.listarPendentes();
  }

  @Get('erros')
  async listarErros() {
    return this.pncpService.listarErros();
  }

  @Post('reenviar/:syncId')
  async reenviar(@Param('syncId') syncId: string) {
    return this.pncpService.reenviar(syncId);
  }

  // ============ PCA - INCLUSÃO / RETIFICAÇÃO / EXCLUSÃO ============

  @Post('pca/:pcaId')
  async enviarPCA(
    @Param('pcaId') pcaId: string,
    @Body() pca: any
  ) {
    return this.pncpService.enviarPCA(pcaId, pca);
  }

  @Put('pca/:anoPca/:sequencialPca')
  async retificarPCA(
    @Param('anoPca') anoPca: string,
    @Param('sequencialPca') sequencialPca: string,
    @Body() pca: any
  ) {
    return this.pncpService.retificarPCA(anoPca, sequencialPca, pca);
  }

  @Delete('pca/:anoPca/:sequencialPca')
  async excluirPCA(
    @Param('anoPca') anoPca: string,
    @Param('sequencialPca') sequencialPca: string,
    @Body() body?: { justificativa?: string }
  ) {
    return this.pncpService.excluirPCA(anoPca, sequencialPca, body?.justificativa);
  }

  @Post('pca/:pcaId/itens')
  async enviarItemPCA(
    @Param('pcaId') pcaId: string,
    @Body() item: any
  ) {
    return this.pncpService.enviarItemPCA(pcaId, item);
  }

  @Put('pca/:anoPca/:sequencialPca/itens/:numeroItem')
  async retificarItemPCA(
    @Param('anoPca') anoPca: string,
    @Param('sequencialPca') sequencialPca: string,
    @Param('numeroItem') numeroItem: string,
    @Body() item: any
  ) {
    return this.pncpService.retificarItemPCA(anoPca, sequencialPca, numeroItem, item);
  }

  @Delete('pca/:anoPca/:sequencialPca/itens/:numeroItem')
  async excluirItemPCA(
    @Param('anoPca') anoPca: string,
    @Param('sequencialPca') sequencialPca: string,
    @Param('numeroItem') numeroItem: string
  ) {
    return this.pncpService.excluirItemPCA(anoPca, sequencialPca, numeroItem);
  }

  @Get('pca/:pcaId/status')
  async consultarStatusPCA(@Param('pcaId') pcaId: string) {
    return this.pncpService.consultarStatusPCA(pcaId);
  }

  @Get('pca/orgao/listar')
  async listarPCAsNoOrgao() {
    return this.pncpService.consultarPCAsNoOrgao();
  }

  // ============ COMPRAS/EDITAIS - INCLUSÃO / RETIFICAÇÃO / EXCLUSÃO ============

  @Post('compras')
  async incluirCompra(@Body() compra: any) {
    return this.pncpService.incluirCompra(compra);
  }

  @Put('compras/:anoCompra/:sequencialCompra')
  async retificarCompra(
    @Param('anoCompra') anoCompra: string,
    @Param('sequencialCompra') sequencialCompra: string,
    @Body() compra: any
  ) {
    return this.pncpService.retificarCompra(anoCompra, sequencialCompra, compra);
  }

  @Delete('compras/:anoCompra/:sequencialCompra')
  async excluirCompra(
    @Param('anoCompra') anoCompra: string,
    @Param('sequencialCompra') sequencialCompra: string,
    @Body() body: { justificativa: string; licitacaoId?: string }
  ) {
    return this.pncpService.excluirCompra(anoCompra, sequencialCompra, body);
  }

  @Get('compras/:anoCompra/:sequencialCompra')
  async consultarCompra(
    @Param('anoCompra') anoCompra: string,
    @Param('sequencialCompra') sequencialCompra: string
  ) {
    return this.pncpService.consultarCompra(anoCompra, sequencialCompra);
  }

  // ============ ITENS DA COMPRA ============

  @Get('compras/:anoCompra/:sequencialCompra/itens/quantidade')
  async consultarQuantidadeItens(
    @Param('anoCompra') anoCompra: string,
    @Param('sequencialCompra') sequencialCompra: string
  ) {
    return this.pncpService.consultarQuantidadeItens(anoCompra, sequencialCompra);
  }

  @Post('compras/:anoCompra/:sequencialCompra/itens')
  async incluirItemCompra(
    @Param('anoCompra') anoCompra: string,
    @Param('sequencialCompra') sequencialCompra: string,
    @Body() item: any
  ) {
    return this.pncpService.incluirItemCompra(anoCompra, sequencialCompra, item);
  }

  @Put('compras/:anoCompra/:sequencialCompra/itens/:numeroItem')
  async retificarItemCompra(
    @Param('anoCompra') anoCompra: string,
    @Param('sequencialCompra') sequencialCompra: string,
    @Param('numeroItem') numeroItem: string,
    @Body() item: any
  ) {
    return this.pncpService.retificarItemCompra(anoCompra, sequencialCompra, numeroItem, item);
  }

  @Delete('compras/:anoCompra/:sequencialCompra/itens/:numeroItem')
  async excluirItemCompra(
    @Param('anoCompra') anoCompra: string,
    @Param('sequencialCompra') sequencialCompra: string,
    @Param('numeroItem') numeroItem: string,
    @Body() body?: { justificativa?: string }
  ) {
    return this.pncpService.excluirItemCompra(anoCompra, sequencialCompra, numeroItem, body?.justificativa);
  }

  // ============ RESULTADO DE ITENS DA COMPRA ============

  @Post('compras/:anoCompra/:sequencialCompra/itens/:numeroItem/resultado')
  async incluirResultadoItem(
    @Param('anoCompra') anoCompra: string,
    @Param('sequencialCompra') sequencialCompra: string,
    @Param('numeroItem') numeroItem: string,
    @Body() resultado: any
  ) {
    return this.pncpService.incluirResultadoItem(anoCompra, sequencialCompra, numeroItem, resultado);
  }

  @Put('compras/:anoCompra/:sequencialCompra/itens/:numeroItem/resultado')
  async retificarResultadoItem(
    @Param('anoCompra') anoCompra: string,
    @Param('sequencialCompra') sequencialCompra: string,
    @Param('numeroItem') numeroItem: string,
    @Body() resultado: any
  ) {
    return this.pncpService.retificarResultadoItem(anoCompra, sequencialCompra, numeroItem, resultado);
  }

  // ============ ATA DE REGISTRO DE PREÇO ============

  @Post('compras/:anoCompra/:sequencialCompra/atas')
  async incluirAtaRegistroPreco(
    @Param('anoCompra') anoCompra: string,
    @Param('sequencialCompra') sequencialCompra: string,
    @Body() ata: any
  ) {
    return this.pncpService.incluirAtaRegistroPreco(anoCompra, sequencialCompra, ata);
  }

  @Put('compras/:anoCompra/:sequencialCompra/atas/:sequencialAta')
  async retificarAtaRegistroPreco(
    @Param('anoCompra') anoCompra: string,
    @Param('sequencialCompra') sequencialCompra: string,
    @Param('sequencialAta') sequencialAta: string,
    @Body() ata: any
  ) {
    return this.pncpService.retificarAtaRegistroPreco(anoCompra, sequencialCompra, sequencialAta, ata);
  }

  @Delete('compras/:anoCompra/:sequencialCompra/atas/:sequencialAta')
  async excluirAtaRegistroPreco(
    @Param('anoCompra') anoCompra: string,
    @Param('sequencialCompra') sequencialCompra: string,
    @Param('sequencialAta') sequencialAta: string,
    @Body() body: { justificativa: string }
  ) {
    return this.pncpService.excluirAtaRegistroPreco(anoCompra, sequencialCompra, sequencialAta, body.justificativa);
  }

  // ============ CONTRATOS - INCLUSÃO / RETIFICAÇÃO / EXCLUSÃO ============

  @Post('contratos')
  async incluirContrato(@Body() contrato: any) {
    return this.pncpService.incluirContrato(contrato);
  }

  @Put('contratos/:anoContrato/:sequencialContrato')
  async retificarContrato(
    @Param('anoContrato') anoContrato: string,
    @Param('sequencialContrato') sequencialContrato: string,
    @Body() contrato: any
  ) {
    return this.pncpService.retificarContrato(anoContrato, sequencialContrato, contrato);
  }

  @Delete('contratos/:anoContrato/:sequencialContrato')
  async excluirContrato(
    @Param('anoContrato') anoContrato: string,
    @Param('sequencialContrato') sequencialContrato: string,
    @Body() body: { justificativa: string }
  ) {
    return this.pncpService.excluirContrato(anoContrato, sequencialContrato, body.justificativa);
  }

  @Get('contratos/:anoContrato/:sequencialContrato')
  async consultarContrato(
    @Param('anoContrato') anoContrato: string,
    @Param('sequencialContrato') sequencialContrato: string
  ) {
    return this.pncpService.consultarContrato(anoContrato, sequencialContrato);
  }

  // ============ ÓRGÃOS E UNIDADES ============

  @Get('orgaos/:cnpj')
  async consultarOrgao(@Param('cnpj') cnpj: string) {
    return this.pncpService.consultarOrgao(cnpj);
  }

  @Post('orgaos')
  async cadastrarOrgao(@Body() orgao: any) {
    return this.pncpService.cadastrarOrgao(orgao);
  }

  @Get('orgaos/:cnpj/unidades')
  async listarUnidades(@Param('cnpj') cnpj: string) {
    return this.pncpService.listarUnidades(cnpj);
  }

  @Post('orgaos/:cnpj/unidades')
  async cadastrarUnidade(@Param('cnpj') cnpj: string, @Body() unidade: any) {
    return this.pncpService.cadastrarUnidade(cnpj, unidade);
  }

  // ============ USUÁRIO E ENTES AUTORIZADOS ============

  @Get('usuario')
  async consultarUsuario(@Req() request: any) {
    return this.pncpService.consultarUsuario(request);
  }

  @Put('usuario/entes-autorizados')
  async atualizarEntesAutorizados(@Body() body: { cnpjs: string[] }) {
    return this.pncpService.atualizarEntesAutorizados(body.cnpjs);
  }

  @Post('usuario/vincular-ente/:cnpj')
  async vincularEnte(@Param('cnpj') cnpj: string) {
    return this.pncpService.vincularEnte(cnpj);
  }

  // ============ CONFIGURAÇÃO ============

  @Get('config/status')
  async verificarConfiguracao() {
    console.log('[CONTROLLER] verificarConfiguracao chamado');
    return this.pncpService.verificarConfiguracao();
  }

  @Post('config/testar-conexao')
  async testarConexao(@Req() request: any) {
    return this.pncpService.testarConexao(request);
  }

  @Post('config-update')
  async atualizarConfiguracao(@Body() config: any) {
    console.log('[CONTROLLER] atualizarConfiguracao chamado com:', config);
    return this.pncpService.atualizarConfiguracao(config);
  }

  @Post('test-endpoint')
  async testEndpoint() {
    console.log('[CONTROLLER] testEndpoint chamado');
    return { message: 'Test endpoint working!' };
  }

  // ============ IMPORTAÇÃO DE PCAs DO PNCP ============

  @Get('importar/pcas/:cnpj')
  async consultarPCAsNoPncp(
    @Param('cnpj') cnpj: string,
    @Query('ano') ano?: string
  ) {
    return this.pncpService.consultarPCAsNoPncp(cnpj, ano ? parseInt(ano) : undefined);
  }

  @Get('importar/pca/:cnpj/:ano/:sequencial')
  async consultarPCADetalhado(
    @Param('cnpj') cnpj: string,
    @Param('ano') ano: string,
    @Param('sequencial') sequencial: string
  ) {
    return this.pncpService.consultarPCADetalhado(cnpj, parseInt(ano), parseInt(sequencial));
  }

  @Post('importar/pca')
  async importarPCADoPncp(
    @Body() body: { orgaoId: string; cnpj: string; ano: number; sequencial: number }
  ) {
    return this.pncpService.importarPCADoPncp(body.orgaoId, body.cnpj, body.ano, body.sequencial);
  }

  @Post('importar/pcas/todos')
  async sincronizarTodosPCAsDoPncp(
    @Body() body: { orgaoId: string; cnpj: string }
  ) {
    return this.pncpService.sincronizarTodosPCAsDoPncp(body.orgaoId, body.cnpj);
  }

  // ============ UNIDADES DO ÓRGÃO ============

  @Get('orgao/:cnpj/unidades')
  async consultarUnidadesOrgao(@Param('cnpj') cnpj: string) {
    return this.pncpService.consultarUnidadesOrgao(cnpj);
  }

  // ============ HELPERS ============

  private mapearTipoDocumento(tipo: string): number {
    const mapa: Record<string, number> = {
      'edital': TIPO_DOCUMENTO.EDITAL,
      'termo-referencia': TIPO_DOCUMENTO.TERMO_REFERENCIA,
      'tr': TIPO_DOCUMENTO.TERMO_REFERENCIA,
      'etp': TIPO_DOCUMENTO.ETP,
      'minuta-contrato': TIPO_DOCUMENTO.MINUTA_CONTRATO,
      'ata': TIPO_DOCUMENTO.ATA_REGISTRO_PRECO,
      'outros': TIPO_DOCUMENTO.OUTROS
    };

    return mapa[tipo.toLowerCase()] || TIPO_DOCUMENTO.OUTROS;
  }
}
