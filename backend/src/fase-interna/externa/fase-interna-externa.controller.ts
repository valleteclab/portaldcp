import { Body, Controller, Get, Param, Post, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AtorAtual } from '../../auth/acesso/acesso.decorators';
import type { Ator } from '../../auth/acesso/ator';
import { RequireModule } from '../../auth/require-module.decorator';
import { ModuloSistema } from '../../orgaos/enums/modulos.enum';
import { DonoFaseInternaGuard } from '../dono-fase-interna.guard';
import { ANEXO_MAX_BYTES } from '../pecas-fase-interna.service';
import { MAX_ARQUIVOS_EXTERNOS } from './externa-regras';
import { FaseInternaExternaService } from './fase-interna-externa.service';

const UPLOAD = FilesInterceptor('arquivos', MAX_ARQUIVOS_EXTERNOS, {
  storage: memoryStorage(),
  limits: { fileSize: ANEXO_MAX_BYTES, files: MAX_ARQUIVOS_EXTERNOS },
});

/**
 * ENTRADA "FASE INTERNA FEITA FORA DO SISTEMA" (plano §"Entrada: fase
 * interna feita fora"). Registrado no LicitacoesModule (usa a criação de
 * processo do LicitacoesService).
 *
 * AUTORIZAÇÃO: DonoFaseInternaGuard (anônimo 401; fornecedor 403; com
 * `:licitacaoId`, só o órgão DONO — leitura de outro órgão 404, escrita 403;
 * roda antes do upload: arquivo de quem não é dono nem é lido). O órgão do
 * processo novo é SEMPRE o do token (admin da plataforma informa `orgao_id`).
 */
@Controller('fase-interna')
@UseGuards(DonoFaseInternaGuard)
@RequireModule(ModuloSistema.LICITACOES)
export class FaseInternaExternaController {
  constructor(private readonly servico: FaseInternaExternaService) {}

  /**
   * Checklist do art. 72 / art. 18 conforme os arquivos são classificados —
   * processo ainda não criado. Corpo: { modalidade, classificadas: [tipos],
   * nao_se_aplica: [tipos], usar_portaria_orgao }.
   */
  @Post('externa/checklist')
  async checklistParaNovo(@Body() corpo: any, @AtorAtual() ator: Ator) {
    return this.servico.checklistParaNovo(ator, corpo ?? {});
  }

  /**
   * Cria o processo com a fase interna feita fora, grava os itens e junta as
   * peças numa operação só. Multipart: `dados` (JSON: modalidade, natureza,
   * fundamento, objeto, nº do processo e da dispensa/licitação, área
   * demandante, disputa da dispensa, sigilo, `itens`, `classificacao`) e
   * `arquivos` (PDFs). 400 (com `erros` e `passo`) = nada foi gravado; 201 com
   * `pendencias` = processo criado, peças que não entraram listadas.
   */
  @Post('externa/processo')
  @UseInterceptors(UPLOAD)
  async criarProcesso(@UploadedFiles() arquivos: Express.Multer.File[], @Body() corpo: any, @AtorAtual() ator: Ator) {
    return this.servico.criarProcesso(ator, corpo ?? {}, arquivos ?? []);
  }

  /** Situação da fase interna feita fora do processo (etiqueta, quem/quando, pendências abertas). */
  @Get(':licitacaoId/externa')
  async situacao(@Param('licitacaoId') licitacaoId: string) {
    return this.servico.situacao(licitacaoId);
  }

  /** Checklist incremental da juntada num processo existente (considera o que ele já tem). */
  @Post(':licitacaoId/externa/checklist')
  async checklistDoProcesso(@Param('licitacaoId') licitacaoId: string, @Body() corpo: any) {
    return this.servico.checklistDoProcesso(licitacaoId, corpo ?? {});
  }

  /**
   * "Juntar documentos feitos fora (vários PDFs)" num processo já criado.
   * Multipart: `classificacao` (JSON) e `arquivos`.
   */
  @Post(':licitacaoId/externa/documentos')
  @UseInterceptors(UPLOAD)
  async juntar(
    @Param('licitacaoId') licitacaoId: string,
    @UploadedFiles() arquivos: Express.Multer.File[],
    @Body() corpo: any,
    @AtorAtual() ator: Ator,
  ) {
    return this.servico.juntarNoProcesso(licitacaoId, ator, corpo ?? {}, arquivos ?? []);
  }
}
