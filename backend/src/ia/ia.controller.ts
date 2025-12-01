import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
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

@Controller('ia')
export class IaController {
  constructor(private readonly iaService: IaService) {}

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
}
