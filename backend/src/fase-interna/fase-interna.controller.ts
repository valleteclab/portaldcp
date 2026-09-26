import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UseGuards,
  NotFoundException,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import { DataSource } from 'typeorm';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { extname, join } from 'path';
import { FaseInternaService } from './fase-interna.service';
import { PreparacaoAutomaticaService } from './preparacao-automatica.service';
import { DerivacaoService } from './derivacao.service';
import { TipoDocumentoFaseInterna } from './entities/documento-fase-interna.entity';
import { ANEXO_MAX_BYTES, PecasFaseInternaService } from './pecas-fase-interna.service';
import { ConsumoLimiteService } from '../parametros-licitacao/consumo-limite.service';
import { PesquisaPrecosAgentService } from './pesquisa-precos-agent.service';
import { GeradorPpService } from './gerador-pp.service';
import { FontePesquisaTipo } from './types/pesquisa-precos.type';
import { Public } from '../auth/public.decorator';
import { AtorAtual } from '../auth/acesso/acesso.decorators';
import type { Ator } from '../auth/acesso/ator';
import { DonoFaseInternaGuard, DonoPor } from './dono-fase-interna.guard';
import { ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { licitacaoEhPublica } from '../licitacoes/licitacao-visao.util';
import { atorTransicaoDe } from '../licitacoes/transicoes/transicoes.tipos';

/**
 * AUTORIZAÇÃO (E1a): DonoFaseInternaGuard na classe — toda rota exige órgão;
 * com `:licitacaoId` (ou documento por id, via @DonoPor) exige o órgão DONO
 * da licitação (leitura de outro órgão → 404; ato → 403). Listas agregadas
 * usam o órgão do token (?orgao_id= só vale para o admin da plataforma).
 */

@Controller('fase-interna')
@UseGuards(DonoFaseInternaGuard)
export class FaseInternaController {
  constructor(
    private readonly faseInternaService: FaseInternaService,
    private readonly preparacaoAutomaticaService: PreparacaoAutomaticaService,
    private readonly derivacaoService: DerivacaoService,
    private readonly pesquisaPrecosAgentService: PesquisaPrecosAgentService,
    private readonly geradorPpService: GeradorPpService,
    private readonly dataSource: DataSource,
    private readonly pecas: PecasFaseInternaService,
    private readonly consumoLimite: ConsumoLimiteService,
  ) {}

  private enviarPdf(res: Response, arq: { caminho: string; nome: string }) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${arq.nome}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    // Pasta privada tem ponto no nome (`.privado`) — sendFile recusaria; envia o conteúdo
    res.send(fs.readFileSync(arq.caminho));
  }

  // === PEÇA: FAZER AQUI OU ANEXAR (Entrega 1) ===

  /**
   * "Anexar PDF": peça feita fora do sistema. Multipart: `arquivo` (só PDF,
   * limite FASE_INTERNA_ANEXO_MAX_MB), `data_documento` (AAAA-MM-DD,
   * obrigatória, não futura), `numero_peca`, `signatarios` (JSON [{nome,cargo}]),
   * `observacao`. Grava SHA-256, nova versão (a anterior vira SUBSTITUIDO) e as
   * folhas dos autos; conta como peça pronta no checklist.
   */
  @Post(':licitacaoId/documentos/:tipo/anexo')
  @UseInterceptors(FileInterceptor('arquivo', { storage: memoryStorage(), limits: { fileSize: ANEXO_MAX_BYTES, files: 1 } }))
  async anexarPeca(
    @Param('licitacaoId') licitacaoId: string,
    @Param('tipo') tipo: string,
    @UploadedFile() arquivo: Express.Multer.File,
    @Body() body: { numero_peca?: string; data_documento?: string; signatarios?: string; observacao?: string; titulo?: string },
    @AtorAtual() ator: Ator,
  ) {
    return this.pecas.anexarPeca(licitacaoId, tipo, arquivo, body ?? {}, ator);
  }

  /** Arquivo da peça (anexo, PDF gerado ou assinado) — só o órgão dono. */
  @Get('documento/:id/arquivo')
  @DonoPor('documento', 'id')
  async arquivoDaPeca(@Param('id') id: string, @Res() res: Response) {
    this.enviarPdf(res, await this.pecas.arquivoDaPeca(id));
  }

  /**
   * Envia a peça feita no sistema para assinatura com VÁRIOS signatários
   * (ex.: Mesa Diretora). Corpo: { signatarios: [{ usuario_id, papel }] }.
   */
  @Post(':licitacaoId/documentos/:tipo/assinatura')
  async enviarParaAssinatura(
    @Param('licitacaoId') licitacaoId: string,
    @Param('tipo') tipo: string,
    @Body() body: { signatarios?: Array<{ usuario_id?: string; papel?: string }> },
    @AtorAtual() ator: Ator,
  ) {
    return this.pecas.enviarParaAssinatura(licitacaoId, tipo, body ?? {}, ator);
  }

  @Get(':licitacaoId/documentos/:tipo/assinatura')
  async situacaoAssinatura(@Param('licitacaoId') licitacaoId: string, @Param('tipo') tipo: string) {
    return this.pecas.situacaoAssinatura(licitacaoId, tipo);
  }

  /** Consumo do limite da dispensa no exercício (art. 75, §1º) — leitura para o painel. */
  @Get(':licitacaoId/consumo-limite')
  async consumoDoLimite(@Param('licitacaoId') licitacaoId: string) {
    return this.consumoLimite.consumoDoProcesso(licitacaoId);
  }

  // === PORTARIA DE DESIGNAÇÃO (documento do ÓRGÃO, vigência anual) ===

  private orgaoDoAtor(ator: Ator, orgaoIdAdmin?: string): string {
    if (ator.admin) {
      if (!orgaoIdAdmin) throw new BadRequestException('Informe ?orgao_id= (administrador da plataforma)');
      return orgaoIdAdmin;
    }
    return ator.orgaoId!;
  }

  /** Portarias do órgão do token (?todas=true inclui versões substituídas). */
  @Get('orgao/portarias')
  async listarPortarias(@AtorAtual() ator: Ator, @Query('orgao_id') orgaoId?: string, @Query('todas') todas?: string) {
    return this.pecas.listarPortarias(this.orgaoDoAtor(ator, orgaoId), todas === 'true');
  }

  /** Anexa a portaria do exercício (substitui a vigente do mesmo exercício — nova versão). */
  @Post('orgao/portarias')
  @UseInterceptors(FileInterceptor('arquivo', { storage: memoryStorage(), limits: { fileSize: ANEXO_MAX_BYTES, files: 1 } }))
  async anexarPortaria(
    @UploadedFile() arquivo: Express.Multer.File,
    @Body() body: Record<string, any>,
    @AtorAtual() ator: Ator,
    @Query('orgao_id') orgaoId?: string,
  ) {
    return this.pecas.anexarPortaria(this.orgaoDoAtor(ator, orgaoId), arquivo, body ?? {}, ator);
  }

  @Get('orgao/portarias/:id/arquivo')
  async arquivoDaPortaria(@Param('id') id: string, @AtorAtual() ator: Ator, @Res() res: Response) {
    if (!ehUuid(id)) throw new NotFoundException('Portaria não encontrada');
    this.enviarPdf(res, await this.pecas.arquivoDaPortaria(id, ator.orgaoId, ator.admin));
  }

  /** Junta ao processo a portaria vigente do órgão (peça DP). Corpo opcional: { portaria_id }. */
  @Post(':licitacaoId/portaria-designacao')
  async vincularPortaria(
    @Param('licitacaoId') licitacaoId: string,
    @Body() body: { portaria_id?: string },
    @AtorAtual() ator: Ator,
  ) {
    const id = body?.portaria_id;
    if (id && !ehUuid(id)) throw new NotFoundException('Portaria não encontrada');
    return this.pecas.vincularPortaria(licitacaoId, id, ator);
  }

  /**
   * MODO CO-WORK: prepara o processo inteiro em background (pesquisa de
   * preços real + rascunhos IA) e deixa tudo sugerido p/ revisão.
   * Acompanhe por licitacao.preparacao_automatica (processo-completo).
   */
  @Post(':licitacaoId/preparar-automatico')
  async prepararAutomatico(@Param('licitacaoId') licitacaoId: string) {
    return this.preparacaoAutomaticaService.iniciar(licitacaoId);
  }

  // === DOCUMENTOS ===

  @Post(':licitacaoId/documento')
  async criarDocumento(
    @Param('licitacaoId') licitacaoId: string,
    @Body()
    body: {
      tipo: TipoDocumentoFaseInterna;
      titulo: string;
      descricao?: string;
      criadorId?: string;
      criadorNome?: string;
    },
  ) {
    return this.faseInternaService.criarDocumento(
      licitacaoId,
      body.tipo,
      body.titulo,
      body.descricao,
      body.criadorId,
      body.criadorNome,
    );
  }

  @Post('importar-processo')
  async importarProcessoCompleto(
    @Body()
    body: {
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
      itens?: Array<{
        numero_item?: number;
        descricao: string;
        quantidade: number;
        unidade_medida?: string;
        valor_unitario_estimado: number;
        tipo_item?: 'MATERIAL' | 'SERVICO';
      }>;
    },
    @AtorAtual() ator: Ator,
  ) {
    return this.faseInternaService.importarProcessoCompleto(body, atorTransicaoDe(ator));
  }

  @Get(':licitacaoId/contexto')
  async buscarContexto(@Param('licitacaoId') licitacaoId: string) {
    return this.faseInternaService.buscarContexto(licitacaoId);
  }

  @Get(':licitacaoId/documentos')
  async getDocumentos(@Param('licitacaoId') licitacaoId: string) {
    return this.faseInternaService.getDocumentos(licitacaoId);
  }

  @Get(':licitacaoId/documentos/:tipo')
  async getDocumentosPorTipo(
    @Param('licitacaoId') licitacaoId: string,
    @Param('tipo') tipo: TipoDocumentoFaseInterna,
  ) {
    return this.faseInternaService.getDocumentosPorTipo(licitacaoId, tipo);
  }

  /**
   * Auto-save do editor (conteúdo HTML inteiro).
   * Mantido para compatibilidade com o DocumentEditor legado.
   */
  @Patch(':licitacaoId/documentos/:tipo/conteudo')
  async atualizarConteudo(
    @Param('licitacaoId') licitacaoId: string,
    @Param('tipo') tipo: TipoDocumentoFaseInterna,
    @Body() body: { html: string },
  ) {
    return this.faseInternaService.atualizarConteudo(licitacaoId, tipo, body.html);
  }

  /**
   * Auto-save de uma seção específica do editor de seções guiadas.
   * Atualiza dados_estruturados[secaoId] = html.
   * SEM validação — permite salvar rascunhos incompletos.
   */
  @Patch(':licitacaoId/documentos/:tipo/secao/:secaoId')
  async atualizarSecao(
    @Param('licitacaoId') licitacaoId: string,
    @Param('tipo') tipo: TipoDocumentoFaseInterna,
    @Param('secaoId') secaoId: string,
    @Body() body: { html: string },
  ) {
    return this.faseInternaService.atualizarSecao(
      licitacaoId,
      tipo,
      secaoId,
      body.html || '',
    );
  }

  @Get(':licitacaoId/documentos/:tipo/seed')
  async montarSeed(@Param('licitacaoId') licitacaoId: string, @Param('tipo') tipo: string) {
    return this.derivacaoService.montarSeed(licitacaoId, tipo);
  }

  @Post(':licitacaoId/documentos/:tipo/aplicar-seed')
  async aplicarSeed(
    @Param('licitacaoId') licitacaoId: string,
    @Param('tipo') tipo: string,
    @Body() body: { secoes: string[]; sobrescrever?: boolean },
  ) {
    return this.derivacaoService.aplicarSeed(licitacaoId, tipo, body.secoes || [], body.sobrescrever ?? false);
  }

  @Get('documento/:id')
  @DonoPor('documento', 'id')
  async getDocumento(@Param('id') id: string) {
    return this.faseInternaService.getDocumento(id);
  }

  // O envio para aprovação é pelo fluxo por etapa (`documento/:id/submeter-fluxo`,
  // `aprovacoes/etapa/:id/{aprovar,reprovar}`); a aprovação por documento
  // (submeter/aprovar/reprovar e GET aprovacoes) foi apagada na E9.

  /** Preço de referência rápido por código CATMAT/CATSER (dados abertos) */
  @Get('preco-referencia')
  async precoReferencia(
    @Query('codigo') codigo: string,
    @Query('tipo') tipo?: string,
  ) {
    return this.faseInternaService.consultarPrecoReferencia(codigo, tipo);
  }

  // === INSTRUÇÃO DO PROCESSO (Art. 72 — contratação direta) ===

  @Get(':licitacaoId/instrucao')
  async getInstrucao(@Param('licitacaoId') licitacaoId: string) {
    return this.faseInternaService.getInstrucao(licitacaoId);
  }

  @Post(':licitacaoId/instrucao/:tipo/nao-se-aplica')
  async marcarNaoSeAplica(
    @Param('licitacaoId') licitacaoId: string,
    @Param('tipo') tipo: TipoDocumentoFaseInterna,
    @Body()
    body: {
      justificativa?: string;
      desfazer?: boolean;
      usuarioId?: string;
      usuarioNome?: string;
    },
  ) {
    return this.faseInternaService.marcarNaoSeAplica(
      licitacaoId,
      tipo,
      body?.justificativa || '',
      { id: body?.usuarioId, nome: body?.usuarioNome },
      body?.desfazer,
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

  /**
   * Conclui a etapa interna atual (rito completo) ou a instrução (contratação
   * direta) pelos atos da máquina de estados — mesmo gate documental do
   * PUT /licitacoes/:id/avancar-fase. 400 traz `pendencias` (lista).
   */
  @Put(':licitacaoId/avancar')
  async avancarFaseInterna(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator) {
    return this.faseInternaService.avancarFaseInterna(licitacaoId, atorTransicaoDe(ator));
  }

  // === DASHBOARD ===

  @Get('dashboard')
  async getDashboard(@Query('orgao_id') orgaoId: string, @AtorAtual() ator: Ator) {
    return this.faseInternaService.getDashboard(ator.admin ? orgaoId : ator.orgaoId!);
  }

  // === RISCOS ===

  @Get(':licitacaoId/riscos')
  async getRiscos(@Param('licitacaoId') licitacaoId: string) {
    return this.faseInternaService.getRiscos(licitacaoId);
  }

  @Post(':licitacaoId/riscos')
  async adicionarRisco(
    @Param('licitacaoId') licitacaoId: string,
    @Body()
    body: {
      descricao: string;
      categoria: string;
      probabilidade: 1 | 2 | 3 | 4 | 5;
      impacto: 1 | 2 | 3 | 4 | 5;
      mitigacao: string;
      responsavel?: string;
      prazo?: string;
    },
  ) {
    return this.faseInternaService.adicionarRisco(licitacaoId, body);
  }

  @Put(':licitacaoId/riscos/:riscoId')
  async atualizarRisco(
    @Param('licitacaoId') licitacaoId: string,
    @Param('riscoId') riscoId: string,
    @Body()
    body: Partial<{
      descricao: string;
      categoria: string;
      probabilidade: 1 | 2 | 3 | 4 | 5;
      impacto: 1 | 2 | 3 | 4 | 5;
      mitigacao: string;
      responsavel: string;
      prazo: string;
      status: 'identificado' | 'mitigado' | 'aceito';
    }>,
  ) {
    return this.faseInternaService.atualizarRisco(licitacaoId, riscoId, body);
  }

  @Delete(':licitacaoId/riscos/:riscoId')
  async removerRisco(
    @Param('licitacaoId') licitacaoId: string,
    @Param('riscoId') riscoId: string,
  ) {
    return this.faseInternaService.removerRisco(licitacaoId, riscoId);
  }

  // === PESQUISA DE PRECOS ===

  /**
   * Relatório público da pesquisa de preços (link/QR impresso no PDF da PP).
   * Só existe publicamente depois que a licitação é divulgada (fase externa)
   * e se o orçamento NÃO é sigiloso (art. 24); senão 404. Fontes e
   * fornecedores das cotações ficam (a tela pública os mostra — art. 23),
   * mas sem o caminho/hash do comprovante no servidor.
   */
  @Public()
  @Get('publico/precos/:licitacaoId')
  async getPrecosPublicos(@Param('licitacaoId') licitacaoId: string) {
    const r = ehUuid(licitacaoId)
      ? await this.dataSource.query(
          `SELECT fase, data_publicacao_edital, sigilo_orcamento FROM licitacoes WHERE id = $1`,
          [licitacaoId],
        )
      : [];
    const lic = r[0];
    if (!lic || !licitacaoEhPublica(lic) || lic.sigilo_orcamento === 'SIGILOSO') {
      throw new NotFoundException('Pesquisa de preços não encontrada');
    }
    const publico = await this.faseInternaService.getPrecosPublicos(licitacaoId);
    const itens = (publico.dados?.itens || []).map((item: any) => ({
      ...item,
      cotacoes: (item.cotacoes || []).map(
        ({ documento_comprobatorio_path: _p, documento_hash: _h, ...cotacao }: any) => cotacao,
      ),
    }));
    return { ...publico, dados: { ...publico.dados, itens } };
  }

  @Get(':licitacaoId/precos')
  async getPrecos(@Param('licitacaoId') licitacaoId: string) {
    return this.faseInternaService.getPrecos(licitacaoId);
  }

  @Post(':licitacaoId/precos/item')
  async adicionarItemPesquisa(
    @Param('licitacaoId') licitacaoId: string,
    @Body()
    body: {
      descricao: string;
      quantidade: number;
      unidade: string;
      codigo_catalogo?: string;
      codigo_catmat?: string;
      codigo_catser?: string;
      tipo_catalogo?: 'MATERIAL' | 'SERVICO';
    },
  ) {
    const dados = await this.faseInternaService.getPrecos(licitacaoId);
    const proximoNumero = (dados.dados?.itens?.length ?? 0) + 1;
    const codigoCatalogo =
      body.codigo_catalogo || body.codigo_catmat || body.codigo_catser;
    return this.faseInternaService.adicionarItemPesquisa(licitacaoId, {
      item_numero: proximoNumero,
      descricao: body.descricao,
      quantidade: body.quantidade || 1,
      unidade: body.unidade || 'UN',
      codigo_catalogo: codigoCatalogo,
      codigo_catmat:
        body.codigo_catmat ||
        (body.tipo_catalogo === 'MATERIAL' ? codigoCatalogo : undefined),
      codigo_catser:
        body.codigo_catser ||
        (body.tipo_catalogo === 'SERVICO' ? codigoCatalogo : undefined),
      tipo_catalogo: body.tipo_catalogo,
      cotacoes: [],
      metodologia: 'MEDIANA',
      valor_referencial: 0,
    });
  }

  @Delete(':licitacaoId/precos/item/:itemNumero')
  async removerItemPesquisa(
    @Param('licitacaoId') licitacaoId: string,
    @Param('itemNumero') itemNumero: string,
  ) {
    return this.faseInternaService.removerItemPesquisa(
      licitacaoId,
      parseInt(itemNumero),
    );
  }

  @Put(':licitacaoId/precos/metodologia')
  async salvarMetodologia(
    @Param('licitacaoId') licitacaoId: string,
    @Body()
    body: {
      metodologia: 'MEDIA' | 'MEDIANA' | 'MENOR_VALOR' | 'OUTRA';
      justificativa?: string;
      outliers?: Array<{
        item_numero: number;
        cotacao_index: number;
        motivo: string;
      }>;
    },
  ) {
    return this.faseInternaService.salvarMetodologiaPP(
      licitacaoId,
      body.metodologia,
      body.justificativa,
      body.outliers,
    );
  }

  @Put(':licitacaoId/precos/responsavel')
  async salvarResponsavel(
    @Param('licitacaoId') licitacaoId: string,
    @Body()
    body: {
      nome: string;
      cargo: string;
      matricula?: string;
      observacoes?: string;
      data_pesquisa?: string;
    },
  ) {
    return this.faseInternaService.salvarResponsavelPP(
      licitacaoId,
      body,
      body.observacoes,
      body.data_pesquisa,
    );
  }

  @Post(':licitacaoId/precos/fonte')
  async adicionarFontePreco(
    @Param('licitacaoId') licitacaoId: string,
    @Body()
    body: {
      itemNumero: number;
      cotacao: any & {
        fonte: string;
        tipo:
          | 'PNCP'
          | 'PAINEL_PRECOS'
          | 'COTACAO_DIRETA'
          | 'CATALOGO'
          | 'ORCAMENTO';
        valor_unitario: number;
        data_pesquisa: string;
        fornecedor?: string;
        url_referencia?: string;
        observacao?: string;
        valida?: boolean;
      };
    },
  ) {
    return this.faseInternaService.adicionarFontePreco(
      licitacaoId,
      body.itemNumero,
      body.cotacao,
    );
  }

  @Delete(':licitacaoId/precos/fonte')
  async removerFontePreco(
    @Param('licitacaoId') licitacaoId: string,
    @Query('item') itemNumero: string,
    @Query('index') cotacaoIndex: string,
  ) {
    return this.faseInternaService.removerFontePreco(
      licitacaoId,
      parseInt(itemNumero),
      parseInt(cotacaoIndex),
    );
  }

  @Post(':licitacaoId/precos/agente/executar')
  async executarAgentePrecos(
    @Param('licitacaoId') licitacaoId: string,
    @Body()
    body: {
      itemNumero?: number;
      itemNumeros?: number[];
      fontes?: FontePesquisaTipo[];
      maxPorFonte?: number;
      usarBrowserFallback?: boolean;
      autoAprovar?: boolean;
      iniciadoPorId?: string;
      iniciadoPorNome?: string;
    },
  ) {
    const b = body || {};
    // aceita itemNumero singular como alias
    const itemNumeros = b.itemNumeros?.length
      ? b.itemNumeros
      : b.itemNumero != null
        ? [b.itemNumero]
        : undefined;

    const execucao = await this.pesquisaPrecosAgentService.executar(
      licitacaoId,
      { ...b, itemNumeros },
    );

    if (b.autoAprovar && execucao.candidatos?.length) {
      for (const candidato of execucao.candidatos) {
        try {
          await this.pesquisaPrecosAgentService.aprovarCandidato(
            licitacaoId,
            candidato.id,
            { id: b.iniciadoPorId, nome: b.iniciadoPorNome },
          );
        } catch {
          // candidato inválido ou duplicado — ignora
        }
      }
    }

    await this.faseInternaService.removerCotacoesEstimadasDoAgente(licitacaoId);
    return this.faseInternaService.getPrecos(licitacaoId);
  }

  @Post(':licitacaoId/precos/item/:itemNumero/agente/executar')
  async executarAgentePrecosItem(
    @Param('licitacaoId') licitacaoId: string,
    @Param('itemNumero') itemNumero: string,
    @Body()
    body: {
      fontes?: FontePesquisaTipo[];
      maxPorFonte?: number;
      usarBrowserFallback?: boolean;
      autoAprovar?: boolean;
      iniciadoPorId?: string;
      iniciadoPorNome?: string;
    },
  ) {
    return this.executarAgentePrecos(licitacaoId, {
      ...(body || {}),
      itemNumeros: [parseInt(itemNumero)],
    });
  }

  @Get(':licitacaoId/precos/agente/execucoes')
  async listarExecucoesAgentePrecos(@Param('licitacaoId') licitacaoId: string) {
    return this.pesquisaPrecosAgentService.listarExecucoes(licitacaoId);
  }

  @Get(':licitacaoId/precos/agente/execucoes/:execucaoId')
  async obterExecucaoAgentePrecos(
    @Param('licitacaoId') licitacaoId: string,
    @Param('execucaoId') execucaoId: string,
  ) {
    return this.pesquisaPrecosAgentService.obterExecucao(
      licitacaoId,
      execucaoId,
    );
  }

  @Post(':licitacaoId/precos/agente/candidatos/:candidateId/aprovar')
  async aprovarCandidatoPreco(
    @Param('licitacaoId') licitacaoId: string,
    @Param('candidateId') candidateId: string,
    @Body() body: { decisorId?: string; decisorNome?: string },
  ) {
    return this.pesquisaPrecosAgentService.aprovarCandidato(
      licitacaoId,
      candidateId,
      {
        id: body?.decisorId,
        nome: body?.decisorNome,
      },
    );
  }

  @Post(':licitacaoId/precos/agente/candidatos/:candidateId/rejeitar')
  async rejeitarCandidatoPreco(
    @Param('licitacaoId') licitacaoId: string,
    @Param('candidateId') candidateId: string,
    @Body() body: { motivo?: string; decisorId?: string; decisorNome?: string },
  ) {
    return this.pesquisaPrecosAgentService.rejeitarCandidato(
      licitacaoId,
      candidateId,
      body?.motivo || 'Rejeitado pelo usuario',
      { id: body?.decisorId, nome: body?.decisorNome },
    );
  }

  @Post(':licitacaoId/precos/agente/nfe/importar')
  async importarNfeAgentePrecos(
    @Param('licitacaoId') licitacaoId: string,
    @Body()
    body: {
      itemNumero: number;
      descricaoFonte?: string;
      urlReferencia?: string;
      fornecedorCnpj?: string;
      fornecedorRazaoSocial?: string;
      valorUnitario: number;
      dataPesquisa?: string;
      documentoPath?: string;
      documentoHash?: string;
    },
  ) {
    return this.pesquisaPrecosAgentService.importarNfe(licitacaoId, body);
  }

  @Post(':licitacaoId/precos/fonte-precos/csv')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const uploadPath =
            process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
          const destPath = join(
            uploadPath,
            'pesquisa-precos',
            req.params.licitacaoId,
          );
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const fs = require('fs');
          if (!fs.existsSync(destPath))
            fs.mkdirSync(destPath, { recursive: true });
          cb(null, destPath);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(
            null,
            `fonte-precos-${unique}${extname(file.originalname) || '.csv'}`,
          );
        },
      }),
      fileFilter: (_req, file, cb) => {
        const nome = file.originalname.toLowerCase();
        const allowed = [
          'text/csv',
          'application/csv',
          'application/vnd.ms-excel',
          'text/plain',
        ];
        if (!nome.endsWith('.csv') && !allowed.includes(file.mimetype)) {
          return cb(
            new BadRequestException(
              'Apenas arquivos CSV da Fonte de Precos sao aceitos',
            ),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  async importarCsvFontePrecos(
    @Param('licitacaoId') licitacaoId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Arquivo CSV nao enviado');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    const buffer = fs.readFileSync(file.path);
    const relPath = join('pesquisa-precos', licitacaoId, file.filename);
    return this.faseInternaService.importarCsvFontePrecos(
      licitacaoId,
      buffer,
      relPath,
    );
  }

  // === WIZARD ===

  @Post(':licitacaoId/wizard')
  async salvarWizard(
    @Param('licitacaoId') licitacaoId: string,
    @Body()
    body: {
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
    },
  ) {
    return this.faseInternaService.salvarWizard(licitacaoId, body);
  }

  // === UPLOAD DE COMPROVANTE POR COTAÇÃO ===

  @Post(':licitacaoId/precos/comprovante')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const uploadPath =
            process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
          const destPath = join(
            uploadPath,
            'pesquisa-precos',
            req.params.licitacaoId,
          );
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const fs = require('fs');
          if (!fs.existsSync(destPath))
            fs.mkdirSync(destPath, { recursive: true });
          cb(null, destPath);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `comprovante-${unique}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'application/pdf',
          'image/jpeg',
          'image/png',
          'image/jpg',
        ];
        if (!allowed.includes(file.mimetype)) {
          return cb(
            new BadRequestException('Apenas PDF, JPG e PNG são aceitos'),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadComprovante(
    @Param('licitacaoId') licitacaoId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { itemNumero: string; cotacaoIndex: string },
  ) {
    if (!file) throw new BadRequestException('Arquivo não enviado');
    const relPath = join('pesquisa-precos', licitacaoId, file.filename);
    await this.faseInternaService.salvarComprovanteCotacao(
      licitacaoId,
      parseInt(body.itemNumero),
      parseInt(body.cotacaoIndex),
      relPath,
    );
    return { url: `/uploads/${relPath}`, path: relPath };
  }

  // === GERAÇÃO DO DOCUMENTO PP (PDF FORMAL) ===

  @Post(':licitacaoId/precos/gerar-documento')
  async gerarDocumentoPP(
    @Param('licitacaoId') licitacaoId: string,
    @Body()
    body: {
      responsavel: { nome: string; cargo: string; matricula?: string };
      metodologia: 'MEDIA' | 'MEDIANA' | 'MENOR_VALOR' | 'OUTRA';
      justificativaMetodologia?: string;
    },
  ) {
    const precosData = await this.faseInternaService.getPrecos(licitacaoId);
    const path = await this.geradorPpService.gerarDocumentoPP(licitacaoId, {
      numeroProcesso: '',
      objeto: '',
      orgao: '',
      itens: precosData.dados?.itens || [],
      metodologia: body.metodologia,
      justificativaMetodologia: body.justificativaMetodologia,
      valorTotalEstimado: precosData.estatisticas?.valorTotal || 0,
      responsavel: body.responsavel,
      dataAssinatura: new Date().toISOString().split('T')[0],
    });
    // O PDF vira o documento PP da instrução (e o mapa comparativo); na fase
    // interna o valor referencial de cada item vira o valor estimado do item.
    await this.faseInternaService.registrarDocumentoPPGerado(licitacaoId, path, precosData.estatisticas?.valorTotal || 0);
    return { url: `/uploads/${path}`, path };
  }
}
