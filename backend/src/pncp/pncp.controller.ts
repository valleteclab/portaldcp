import { 
  Controller, 
  Get, 
  Post, 
  Put,
  Param, 
  Body, 
  Query,
  UseInterceptors,
  UploadedFile,
  HttpException,
  HttpStatus
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PncpService } from './pncp.service';
import { ResultadoItemDto, ContratoDto, TIPO_DOCUMENTO } from './dto/pncp.dto';

@Controller('pncp')
export class PncpController {
  constructor(private readonly pncpService: PncpService) {}

  // ============ COMPRA/LICITAÇÃO ============

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
    
    if (resultadoCompra.sucesso) {
      try {
        const resultadoItens = await this.pncpService.enviarItens(licitacaoId);
        return {
          sucesso: true,
          compra: resultadoCompra,
          itens: resultadoItens
        };
      } catch (error) {
        return {
          sucesso: true,
          compra: resultadoCompra,
          itens: { sucesso: false, erro: error.message }
        };
      }
    }
    
    return resultadoCompra;
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

  // ============ PCA ============

  @Post('pca/:pcaId')
  async enviarPCA(
    @Param('pcaId') pcaId: string,
    @Body() pca: any
  ) {
    return this.pncpService.enviarPCA(pcaId, pca);
  }

  @Post('pca/:pcaId/itens')
  async enviarItemPCA(
    @Param('pcaId') pcaId: string,
    @Body() item: any
  ) {
    return this.pncpService.enviarItemPCA(pcaId, item);
  }

  @Get('pca/:pcaId/status')
  async consultarStatusPCA(@Param('pcaId') pcaId: string) {
    return this.pncpService.consultarStatusPCA(pcaId);
  }

  // ============ CONFIGURAÇÃO ============

  @Get('config/status')
  async verificarConfiguracao() {
    return this.pncpService.verificarConfiguracao();
  }

  @Post('config/testar-conexao')
  async testarConexao() {
    return this.pncpService.testarConexao();
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
