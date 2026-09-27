import { Body, Controller, Get, Param, Post, Put, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AtorAtual } from '../../auth/acesso/acesso.decorators';
import type { Ator } from '../../auth/acesso/ator';
import { atorTransicaoDe } from '../../licitacoes/transicoes/transicoes.tipos';
import { DonoFaseInternaGuard } from '../dono-fase-interna.guard';
import { ANEXO_MAX_BYTES } from '../pecas-fase-interna.service';
import { TarefasService } from '../tarefas/tarefas.service';
import { PublicacaoTelaService } from '../telas/publicacao-tela.service';
import { ConformidadeService } from './conformidade.service';

/**
 * CONFORMIDADE ANTES DA PUBLICAÇÃO (Entrega 4; mockup Conformidade) e a
 * PUBLICAÇÃO da etapa 8 (Entrega 5).
 * DonoFaseInternaGuard na classe: anônimo 401, fornecedor 403; `:licitacaoId`
 * exige o órgão DONO (leitura de outro órgão 404; escrita 403). Autor sempre
 * do JWT. Achado de outro processo: 404.
 */
@Controller('fase-interna')
@UseGuards(DonoFaseInternaGuard)
export class ConformidadeController {
  constructor(
    private readonly conformidade: ConformidadeService,
    private readonly tarefas: TarefasService,
    private readonly publicacao: PublicacaoTelaService,
  ) {}

  /** A tela: conformidade + o quadro da publicação (modo da dispensa, canais, Diário Oficial, controle interno). */
  private async tela(id: string) {
    const t = await this.conformidade.obter(id);
    const pub = await this.publicacao.quadro(id, { impedem: t.contagem.impedem_publicar });
    return {
      ...t,
      aviso: { ...t.aviso, canais: pub.canais, modo_disputa: pub.modo_disputa },
      publicacao: pub,
    };
  }

  /** Tela: contagens, achados com evidências e ação, regras, quadro do aviso, assinaturas e o botão de publicar. */
  @Get(':licitacaoId/conformidade')
  async obter(@Param('licitacaoId') id: string) {
    await this.tarefas.aguardarPendentes();
    return this.tela(id);
  }

  /** Painel do processo: contagens e os achados abertos. */
  @Get(':licitacaoId/conformidade/resumo')
  async resumo(@Param('licitacaoId') id: string) {
    await this.tarefas.aguardarPendentes();
    return this.conformidade.resumo(id);
  }

  /** "Revisar agora": roda o motor, grava os achados (idempotente) e as tarefas. */
  @Post(':licitacaoId/conformidade/revisar')
  async revisar(@Param('licitacaoId') id: string, @AtorAtual() ator: Ator) {
    await this.conformidade.revisar(id, { origem: 'MANUAL', autor: await this.tarefas.autor(ator) });
    // as etapas (portão A da pesquisa) e as tarefas acompanham — sem refazer a
    // revisão (a automática sobrescrevia a manual: "Última revisão" não mudava)
    await this.tarefas.agendar(id, 0, { semRotinasAntes: true });
    return this.tela(id);
  }

  /** Justificar achado ATENÇÃO: { justificativa } (vai para os autos). BLOQUEIO: 409. */
  @Post(':licitacaoId/conformidade/achados/:achadoId/justificar')
  async justificar(@Param('licitacaoId') id: string, @Param('achadoId') achadoId: string, @Body() body: any, @AtorAtual() ator: Ator) {
    await this.conformidade.justificar(id, achadoId, body ?? {}, await this.tarefas.autor(ator));
    return this.tela(id);
  }

  // === PUBLICAÇÃO (etapa 8 — Entrega 5) ===

  /** Quadro da publicação: estado (etapa 8), modo da dispensa, canais, Diário Oficial e controle interno. */
  @Get(':licitacaoId/publicacao')
  async quadro(@Param('licitacaoId') id: string) {
    await this.tarefas.aguardarPendentes();
    return this.publicacao.quadro(id);
  }

  /**
   * Escolha da disputa da dispensa no processo: { com_lances: boolean }. Só na
   * fase interna (depois de publicar, 409); registra quem escolheu.
   */
  @Put(':licitacaoId/modo-disputa')
  async definirModoDisputa(@Param('licitacaoId') id: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.publicacao.definirModoDisputa(id, body ?? {}, await this.tarefas.autor(ator));
  }

  /**
   * Registro da publicação no Diário Oficial do órgão (peça PDO). Multipart:
   * `numero_edicao` (obrigatório), `data_publicacao` (AAAA-MM-DD, não futura),
   * `pagina`, `link`, `observacao` e, opcional, `arquivo` (a página em PDF).
   * Órgão sem PNCP aguardando a divulgação: confirma a divulgação oficial
   * (art. 176, par. único). Só depois de publicar (409 antes).
   */
  @Post(':licitacaoId/publicacao/diario-oficial')
  @UseInterceptors(FileInterceptor('arquivo', { storage: memoryStorage(), limits: { fileSize: ANEXO_MAX_BYTES, files: 1 } }))
  async registrarDiarioOficial(
    @Param('licitacaoId') id: string,
    @UploadedFile() arquivo: Express.Multer.File,
    @Body() body: { numero_edicao?: string; data_publicacao?: string; pagina?: string; link?: string; observacao?: string },
    @AtorAtual() ator: Ator,
  ) {
    return this.publicacao.registrarDiarioOficial(id, arquivo ?? null, body ?? {}, ator, atorTransicaoDe(ator));
  }
}
