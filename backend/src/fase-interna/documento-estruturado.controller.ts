import { Controller, Param, Body, Put, Post, Get, UseGuards } from '@nestjs/common';
import { DonoFaseInternaGuard, DonoPor } from './dono-fase-interna.guard';
import { DocumentoEstruturadoService } from './documento-estruturado.service';
import { ContextoUsuario } from './audit-log.service';
import { DocumentoFaseInterna } from './entities/documento-fase-interna.entity';
import { FaseInternaService } from './fase-interna.service';

/**
 * Endpoints para manipulacao dos dados estruturados (jsonb)
 * dos documentos da Fase Interna (ETP, TR, PP, MR, etc.).
 */
/** AUTORIZAÇÃO (E1a): só o órgão dono da licitação do documento (DonoFaseInternaGuard). */
@Controller('fase-interna/estruturado')
@UseGuards(DonoFaseInternaGuard)
export class DocumentoEstruturadoController {
  constructor(
    private readonly documentoEstruturadoService: DocumentoEstruturadoService,
    private readonly faseInternaService: FaseInternaService,
  ) {}

  @Put(':documentoId/dados')
  @DonoPor('documento', 'documentoId')
  async salvarDados(
    @Param('documentoId') documentoId: string,
    @Body() body: { dados: any; contexto?: ContextoUsuario },
  ): Promise<DocumentoFaseInterna> {
    return this.documentoEstruturadoService.salvarDadosEstruturados(
      documentoId,
      body?.dados,
      body?.contexto,
    );
  }

  @Post(':documentoId/validar')
  @DonoPor('documento', 'documentoId')
  async validar(
    @Param('documentoId') documentoId: string,
    @Body() body: { dados: any },
  ): Promise<{ valido: boolean; erros: string[] }> {
    return this.documentoEstruturadoService.validarPorDocumentoId(
      documentoId,
      body?.dados,
    );
  }

  @Put(':documentoId/submeter')
  @DonoPor('documento', 'documentoId')
  async submeter(
    @Param('documentoId') documentoId: string,
    @Body() body: { contexto?: ContextoUsuario },
  ): Promise<DocumentoFaseInterna> {
    return this.documentoEstruturadoService.submeterParaAprovacao(
      documentoId,
      body?.contexto,
    );
  }

  @Put(':documentoId/recalcular')
  @DonoPor('documento', 'documentoId')
  async recalcular(
    @Param('documentoId') documentoId: string,
  ): Promise<DocumentoFaseInterna> {
    return this.documentoEstruturadoService.recalcularEstatisticas(documentoId);
  }

  @Get(':documentoId/conformidade')
  @DonoPor('documento', 'documentoId')
  async buscarConformidade(
    @Param('documentoId') documentoId: string,
  ): Promise<{
    itens: Array<{
      campo: string;
      fundamentoLegal: string;
      ok: boolean;
      erro: string | null;
    }>;
    tipo: string;
    total: number;
    aprovados: number;
  }> {
    return this.faseInternaService.buscarConformidade(documentoId);
  }
}
