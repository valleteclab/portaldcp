import { Controller, Get, Post, Put, Delete, Body, Param, Query, ValidationPipe, Res, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { LicitacoesService } from './licitacoes.service';
import { LicitacoesSchedulerService } from './licitacoes-scheduler.service';
import { ProcessoPdfService } from './processo-pdf.service';
import { CreateLicitacaoDto, PublicarEditalDto } from './dto/create-licitacao.dto';
import { CreateFromDemandaDto } from './dto/create-from-demanda.dto';
import { Licitacao, FaseLicitacao } from './entities/licitacao.entity';
import { Public } from '../auth/public.decorator';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { AcessoLicitacaoService } from '../auth/acesso/acesso-licitacao.service';
import { AtorAtual, AutenticacaoOpcional, OrgaoOuFornecedor, SomenteFornecedor, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import { ehFornecedor, ehOrgao } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';
import { licitacaoEhPublica, licitacaoParaOrgao, licitacaoParaPublico } from './licitacao-visao.util';

/**
 * AUTORIZAÇÃO (E1a):
 *  - atos e leituras internas: @SomenteOrgao() + órgão DONO da licitação
 *    (AcessoLicitacaoService). Leitura de outro órgão → 404; ato → 403;
 *  - fornecedor: identidade SEMPRE do token (fornecedor_id/fornecedorId do
 *    corpo/query é ignorado ou, se divergir, recusado com 403);
 *  - leituras públicas (@Public): só dados públicos (orçamento sigiloso
 *    mascarado, painel anônimo e com sigilo até o fim do acolhimento).
 */

@Controller('licitacoes')
@RequireModule(ModuloSistema.LICITACOES)
export class LicitacoesController {
  constructor(
    private readonly licitacoesService: LicitacoesService,
    private readonly schedulerService: LicitacoesSchedulerService,
    private readonly processoPdfService: ProcessoPdfService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  /** Ato do órgão dono sobre a licitação (403 para outro órgão). */
  private dono(ator: Ator, id: string) {
    return this.acesso.assertOrgaoDaLicitacao(ator, id, 'escrita');
  }

  // === CRUD ===
  @Post()
  @SomenteOrgao()
  async create(
    @Body(new ValidationPipe()) createDto: CreateLicitacaoDto,
    @AtorAtual() ator: Ator,
  ): Promise<Licitacao> {
    // Órgão só cria no próprio nome (admin da plataforma escolhe o órgão)
    if (!ator.admin) {
      if (createDto.orgao_id && createDto.orgao_id !== ator.orgaoId) {
        throw new ForbiddenException('Acesso negado: não é possível criar licitação para outro órgão');
      }
      createDto.orgao_id = ator.orgaoId!;
    }
    return licitacaoParaOrgao(await this.licitacoesService.create(createDto));
  }

  @Post('a-partir-de-demanda')
  @SomenteOrgao()
  async createFromDemanda(
    @Body(new ValidationPipe()) dto: CreateFromDemandaDto,
    @AtorAtual() ator: Ator,
  ): Promise<Licitacao> {
    return licitacaoParaOrgao(
      await this.licitacoesService.criarAPartirDeDemanda(dto, ator.admin ? null : ator.orgaoId),
    );
  }

  /**
   * Órgão: SEMPRE as licitações do próprio órgão (?orgao_id= de outro é ignorado).
   * Fornecedor: só as já divulgadas (visão pública). Admin: filtro livre.
   */
  @Get()
  async findAll(
    @AtorAtual() ator: Ator,
    @Query('fase') fase?: FaseLicitacao | 'HOMOLOGADA',
    @Query('orgao_id') orgao_id?: string,
    @Query('orgaoId') orgaoId?: string,
    @Query('demanda_id') demanda_id?: string
  ): Promise<Licitacao[]> {
    const faseNormalizada =
      fase === 'HOMOLOGADA' ? FaseLicitacao.HOMOLOGACAO : fase;
    if (ator?.admin) {
      const todas = await this.licitacoesService.findAll({ fase: faseNormalizada, orgao_id: orgao_id || orgaoId, demanda_id });
      return todas.map((l) => licitacaoParaOrgao(l));
    }
    if (ehOrgao(ator)) {
      const doOrgao = await this.licitacoesService.findAll({ fase: faseNormalizada, orgao_id: ator.orgaoId, demanda_id });
      return doOrgao.map((l) => licitacaoParaOrgao(l));
    }
    if (ehFornecedor(ator)) {
      const publicas = await this.licitacoesService.findPublicas({ orgao_id: orgao_id || orgaoId });
      return faseNormalizada ? publicas.filter((l) => l.fase === faseNormalizada) : publicas;
    }
    throw new ForbiddenException('Acesso negado para este perfil');
  }

  // ⚠️ Rotas literais precisam vir ANTES de ':id' — senão "publicas" é tratado
  // como um id (uuid inválido → 500). Bug corrigido em 25/07/2026.
  @Public()
  @Get('publicas')
  async findPublicas(
    @Query('modalidade') modalidade?: string,
    @Query('orgao_id') orgao_id?: string,
    @Query('uf') uf?: string
  ): Promise<Licitacao[]> {
    return await this.licitacoesService.findPublicas({ modalidade, orgao_id, uf });
  }

  @Public()
  @Get('publicas/:id')
  async findPublicaById(@Param('id') id: string): Promise<Licitacao> {
    return await this.licitacoesService.findPublicaById(id);
  }

  /**
   * Órgão dono / admin: licitação completa. Fornecedor: visão pública (só se
   * já divulgada; orçamento sigiloso mascarado). Outro órgão: 404.
   */
  @Get(':id')
  async findOne(@Param('id') id: string, @AtorAtual() ator: Ator): Promise<Licitacao> {
    if (ehFornecedor(ator)) {
      const lic = await this.licitacoesService.findOne(id);
      if (!licitacaoEhPublica(lic)) throw new NotFoundException(`Licitação com ID ${id} não encontrada`);
      return licitacaoParaPublico(lic);
    }
    await this.acesso.assertOrgaoDaLicitacao(ator, id, 'leitura');
    return licitacaoParaOrgao(await this.licitacoesService.findOne(id));
  }

  @Put(':id')
  @SomenteOrgao()
  async update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ skipMissingProperties: true })) updateData: Partial<CreateLicitacaoDto>,
    @AtorAtual() ator: Ator,
  ): Promise<Licitacao> {
    await this.dono(ator, id);
    // A licitação não muda de órgão pela edição (só o admin da plataforma)
    if (!ator.admin) delete (updateData as any).orgao_id;
    return licitacaoParaOrgao(await this.licitacoesService.update(id, updateData));
  }

  // === GESTÃO DE FASES ===
  @Put(':id/avancar-fase')
  @SomenteOrgao()
  async avancarFase(
    @Param('id') id: string,
    @AtorAtual() ator: Ator,
    @Body() body: { observacao?: string }
  ): Promise<Licitacao> {
    await this.dono(ator, id);
    return await this.licitacoesService.avancarFase(id, body.observacao);
  }

  @Put(':id/retroceder-fase')
  @SomenteOrgao()
  async retrocederFase(
    @Param('id') id: string,
    @AtorAtual() ator: Ator,
    @Body() body: { motivo: string }
  ): Promise<Licitacao> {
    await this.dono(ator, id);
    return await this.licitacoesService.retrocederFase(id, body.motivo);
  }

  @Put(':id/publicar-edital')
  @SomenteOrgao()
  async publicarEdital(
    @Param('id') id: string,
    @AtorAtual() ator: Ator,
    @Body(new ValidationPipe()) dados: PublicarEditalDto
  ): Promise<Licitacao> {
    await this.dono(ator, id);
    return await this.licitacoesService.publicarEdital(id, dados);
  }

  @Put(':id/iniciar-disputa')
  @SomenteOrgao()
  async iniciarDisputa(@Param('id') id: string, @AtorAtual() ator: Ator): Promise<Licitacao> {
    await this.dono(ator, id);
    return await this.licitacoesService.iniciarDisputa(id);
  }

  @Put(':id/encerrar-disputa')
  @SomenteOrgao()
  async encerrarDisputa(@Param('id') id: string, @AtorAtual() ator: Ator): Promise<Licitacao> {
    await this.dono(ator, id);
    return await this.licitacoesService.encerrarDisputa(id);
  }

  @Put(':id/homologar')
  @SomenteOrgao()
  async homologar(
    @Param('id') id: string,
    @AtorAtual() ator: Ator,
    @Body() body: { valor_homologado: number }
  ): Promise<Licitacao> {
    await this.dono(ator, id);
    return await this.licitacoesService.homologar(id, body.valor_homologado);
  }

  /** Cockpit: visão agregada do processo inteiro (demanda/PCA → docs → seleção → contratos) */
  @Get(':id/processo-completo')
  @SomenteOrgao()
  async processoCompleto(@Param('id') id: string, @AtorAtual() ator: Ator): Promise<any> {
    await this.acesso.assertOrgaoDaLicitacao(ator, id, 'leitura');
    return await this.licitacoesService.processoCompleto(id);
  }

  /** Dispensa eletrônica: julga propostas por menor preço por item e adjudica (art. 75 §3º) */
  @Post(':id/julgar-dispensa')
  @SomenteOrgao()
  async julgarDispensa(@Param('id') id: string, @AtorAtual() ator: Ator): Promise<any> {
    await this.dono(ator, id);
    return await this.licitacoesService.julgarDispensa(id);
  }

  /** Dispensa: abre a fase de lances (opcional, modelo IN SEGES 67/2021) */
  @Post(':id/dispensa/abrir-lances')
  @SomenteOrgao()
  async abrirLancesDispensa(
    @Param('id') id: string,
    @AtorAtual() ator: Ator,
    @Body() body: { duracao_minutos?: number; prorrogacao_minutos?: number },
  ): Promise<any> {
    await this.dono(ator, id);
    return await this.licitacoesService.abrirLancesDispensa(
      id,
      body?.duracao_minutos ?? 360,
      body?.prorrogacao_minutos,
    );
  }

  /**
   * Dispensa: fornecedor registra lance (menor que o próprio valor atual).
   * Fornecedor = o do TOKEN; `fornecedor_id` no corpo é legado — se vier
   * diferente do token, 403.
   */
  @Post(':id/dispensa/lances')
  @SomenteFornecedor()
  async registrarLanceDispensa(
    @Param('id') id: string,
    @Body() body: { item_licitacao_id: string; fornecedor_id?: string; valor_unitario: number },
    @AtorAtual() ator: Ator,
  ): Promise<any> {
    const fornecedorId = this.acesso.fornecedorDoToken(ator, body?.fornecedor_id);
    return await this.licitacoesService.registrarLanceDispensa(id, {
      item_licitacao_id: body?.item_licitacao_id,
      valor_unitario: body?.valor_unitario,
      fornecedor_id: fornecedorId,
    });
  }

  /**
   * Dispensa: painel anônimo da fase de lances (menor valor por item).
   * Público; o fornecedor LOGADO recebe também o próprio valor (`meu_valor`).
   * `?fornecedorId=` (legado) nunca revela o valor de ninguém: só é aceito
   * se for o do próprio token — diferente disso, o painel sai sem `meu_valor`.
   */
  @AutenticacaoOpcional()
  @Get(':id/dispensa/lances/painel')
  async painelLancesDispensa(
    @Param('id') id: string,
    @AtorAtual() ator: Ator | null,
    @Query('fornecedorId') fornecedorIdInformado?: string,
  ): Promise<any> {
    const proprio =
      ehFornecedor(ator) && (!fornecedorIdInformado || fornecedorIdInformado === ator.fornecedorId)
        ? ator.fornecedorId
        : undefined;
    return await this.licitacoesService.painelLancesDispensa(id, proprio);
  }

  /** AUTOS DO PROCESSO: compilação completa em PDF único (capa + sumário + peças) */
  @Get(':id/processo-pdf')
  @SomenteOrgao()
  async processoPdf(@Param('id') id: string, @AtorAtual() ator: Ator, @Res() res: Response): Promise<void> {
    await this.acesso.assertOrgaoDaLicitacao(ator, id, 'leitura');
    const pdf = await this.processoPdfService.gerarProcessoCompleto(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="processo-${id}.pdf"`,
      'Content-Length': String(pdf.length),
    });
    res.send(pdf);
  }

  /** Dispensa: ATA DA SESSÃO em PDF (gerada dos registros; disponível após o julgamento) */
  @Public()
  @Get(':id/dispensa/ata')
  async ataDispensa(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const pdf = await this.licitacoesService.gerarAtaDispensa(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="ata-dispensa-${id}.pdf"`,
      'Content-Length': String(pdf.length),
    });
    res.send(pdf);
  }

  /** Dispensa: chat registrado nos autos (autoria anônima durante os lances) */
  @Public()
  @Get(':id/dispensa/mensagens')
  async listarMensagensDispensa(@Param('id') id: string): Promise<any[]> {
    return await this.licitacoesService.listarMensagensDispensa(id);
  }

  /**
   * Dispensa: envia mensagem no chat (órgão dono ou fornecedor com proposta
   * válida). Autoria vem do TOKEN: `autor_tipo`/`fornecedor_id` do corpo são
   * legado — fornecedor que tenta falar como órgão ou como outro → 403.
   */
  @Post(':id/dispensa/mensagens')
  @OrgaoOuFornecedor()
  async enviarMensagemDispensa(
    @Param('id') id: string,
    @Body()
    body: {
      autor_tipo?: 'ORGAO' | 'FORNECEDOR';
      fornecedor_id?: string;
      autor_nome?: string;
      mensagem: string;
    },
    @AtorAtual() ator: Ator,
  ): Promise<any> {
    if (ehFornecedor(ator)) {
      if (body?.autor_tipo && body.autor_tipo !== 'FORNECEDOR') {
        throw new ForbiddenException('Fornecedor não envia mensagem como órgão');
      }
      const fornecedorId = this.acesso.fornecedorDoToken(ator, body?.fornecedor_id);
      return await this.licitacoesService.enviarMensagemDispensa(id, {
        autor_tipo: 'FORNECEDOR',
        fornecedor_id: fornecedorId,
        mensagem: body?.mensagem,
      });
    }
    await this.dono(ator, id);
    return await this.licitacoesService.enviarMensagemDispensa(id, {
      autor_tipo: 'ORGAO',
      autor_nome: body?.autor_nome,
      mensagem: body?.mensagem,
    });
  }

  /** Seleção externa: registra vencedores/valores de disputa realizada fora do sistema */
  @Post(':id/resultado-externo')
  @SomenteOrgao()
  async registrarResultadoExterno(
    @Param('id') id: string,
    @AtorAtual() ator: Ator,
    @Body()
    body: {
      plataforma_externa?: string;
      numero_processo_externo?: string;
      url_externa?: string;
      itens: Array<{ item_id: string; fornecedor_id: string; valor_unitario: number }>;
    },
  ): Promise<any> {
    await this.dono(ator, id);
    return await this.licitacoesService.registrarResultadoExterno(id, body);
  }

  @Put(':id/suspender')
  @SomenteOrgao()
  async suspender(
    @Param('id') id: string,
    @AtorAtual() ator: Ator,
    @Body() body: { motivo: string }
  ): Promise<Licitacao> {
    await this.dono(ator, id);
    return await this.licitacoesService.suspender(id, body.motivo);
  }

  @Put(':id/revogar')
  @SomenteOrgao()
  async revogar(
    @Param('id') id: string,
    @AtorAtual() ator: Ator,
    @Body() body: { motivo: string }
  ): Promise<Licitacao> {
    await this.dono(ator, id);
    return await this.licitacoesService.revogar(id, body.motivo);
  }

  @Put(':id/anular')
  @SomenteOrgao()
  async anular(
    @Param('id') id: string,
    @AtorAtual() ator: Ator,
    @Body() body: { motivo: string }
  ): Promise<Licitacao> {
    await this.dono(ator, id);
    return await this.licitacoesService.anular(id, body.motivo);
  }

  @Put(':id/retomar')
  @SomenteOrgao()
  async retomar(
    @Param('id') id: string,
    @AtorAtual() ator: Ator,
    @Body() body: { fase_destino?: string }
  ): Promise<Licitacao> {
    await this.dono(ator, id);
    return await this.licitacoesService.retomar(id, body.fase_destino);
  }

  /**
   * Atualiza a fase da licitação baseado nas datas do cronograma
   * Útil após editar o cronograma ou para forçar atualização
   */
  @Put(':id/atualizar-fase')
  @SomenteOrgao()
  async atualizarFase(@Param('id') id: string, @AtorAtual() ator: Ator): Promise<Licitacao> {
    await this.dono(ator, id);
    return await this.schedulerService.atualizarFaseLicitacao(id);
  }

  @Delete(':id')
  @SomenteOrgao()
  async delete(@Param('id') id: string, @AtorAtual() ator: Ator): Promise<{ message: string }> {
    await this.dono(ator, id);
    await this.licitacoesService.delete(id);
    return { message: 'Licitação excluída com sucesso' };
  }

  // === ENDPOINTS PÚBLICOS ===
  // (rota 'publicas' movida para ANTES de ':id' — ver comentário lá em cima)
}
