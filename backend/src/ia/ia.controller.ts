import { Controller, Post, Body, HttpException, HttpStatus, Get, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IaService } from './ia.service';

interface GerarConteudoDto {
  tipoDocumento: string;
  contexto: string;
  objeto?: string;
}

interface ChatDto {
  mensagens: Array<{ role: string; content: string }>;
  tipoDocumento?: string;
}

interface SugerirMelhoriasDto {
  tipoDocumento: string;
  conteudoAtual: string;
}

interface AnalisarContratoDto {
  pergunta: string;
  pdfBase64: string;
  pdfTexto?: string;
  historico?: Array<{ role: string; content: string }>;
}

interface GerarEstruturadoDto {
  tipo: 'ETP' | 'TR' | 'PP' | 'MR';
  objeto: string;
  contexto?: string;
}

@Controller('ia')
export class IaController {
  constructor(private readonly iaService: IaService) {}

  @Get('status')
  async verificarStatus() {
    try {
      // Tenta obter a chave via service (que usa ConfigService)
      const testResult = await this.iaService.testarConexao();
      return testResult;
    } catch (error: any) {
      return {
        configurado: false,
        mensagem: error.message || 'Erro ao verificar configuração'
      };
    }
  }

  @Post('gerar')
  async gerarConteudo(@Body() dto: GerarConteudoDto) {
    try {
      const conteudo = await this.iaService.gerarConteudo(
        dto.tipoDocumento,
        dto.contexto,
        dto.objeto,
      );
      return { sucesso: true, conteudo };
    } catch (error) {
      console.error('Erro ao gerar conteúdo:', error);
      throw new HttpException(
        'Erro ao gerar conteúdo com IA',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('chat')
  async chat(@Body() dto: ChatDto) {
    try {
      const resposta = await this.iaService.chat(dto.mensagens, dto.tipoDocumento);
      return { sucesso: true, resposta };
    } catch (error) {
      console.error('Erro no chat:', error);
      throw new HttpException(
        'Erro ao processar mensagem',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('sugerir-melhorias')
  async sugerirMelhorias(@Body() dto: SugerirMelhoriasDto) {
    try {
      const sugestoes = await this.iaService.sugerirMelhorias(
        dto.tipoDocumento,
        dto.conteudoAtual,
      );
      return { sucesso: true, sugestoes };
    } catch (error) {
      console.error('Erro ao sugerir melhorias:', error);
      throw new HttpException(
        'Erro ao analisar documento',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('extrair-texto-pdf')
  @UseInterceptors(FileInterceptor('pdf'))
  async extrairTextoPdf(@UploadedFile() file: Express.Multer.File) {
    try {
      if (!file) {
        throw new HttpException('Nenhum arquivo enviado', HttpStatus.BAD_REQUEST);
      }

      const texto = await this.iaService.extrairTextoDoPdf(file.buffer);
      
      return { 
        sucesso: true, 
        texto,
        tamanho: texto.length,
        mensagem: texto.length > 0 ? 'Texto extraído com sucesso' : 'PDF sem texto (pode ser escaneado)'
      };
    } catch (error) {
      console.error('Erro ao extrair texto do PDF:', error);
      throw new HttpException(
        'Erro ao processar PDF',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('analisar-contrato')
  async analisarContrato(@Body() dto: AnalisarContratoDto) {
    try {
      const resposta = await this.iaService.analisarContrato(
        dto.pergunta,
        dto.pdfBase64,
        dto.pdfTexto,
        dto.historico,
      );
      return { sucesso: true, resposta };
    } catch (error) {
      console.error('Erro ao analisar contrato:', error);
      throw new HttpException(
        'Erro ao analisar contrato',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Gera documento estruturado (JSON tipado) via IA.
   * Usado pelo frontend quando "Modo Estruturado" está ativo + "Gerar com IA".
   * Retorna { dados } com o JSON tipado conforme EtpDados / TrDados / etc.
   */
  @Post('gerar-estruturado')
  async gerarEstruturado(@Body() dto: GerarEstruturadoDto) {
    const contexto = [dto.objeto, dto.contexto].filter(Boolean).join('\n\n');
    try {
      let dados: any;
      switch (dto.tipo) {
        case 'ETP':
          dados = await this.iaService.gerarEtpEstruturado(contexto);
          break;
        case 'TR':
          dados = await this.iaService.gerarTrEstruturado(contexto);
          break;
        case 'PP':
          dados = await this.iaService.gerarPesquisaPrecosEstruturada(contexto);
          break;
        case 'MR':
          dados = await this.iaService.gerarMatrizRiscosEstruturada(contexto);
          break;
        default:
          throw new HttpException(`Tipo '${dto.tipo}' não suportado`, HttpStatus.BAD_REQUEST);
      }
      return { sucesso: true, dados };
    } catch (error: any) {
      console.error('Erro ao gerar estruturado:', error);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error?.message || 'Erro ao gerar documento estruturado com IA',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
