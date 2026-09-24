import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SessaoService } from './sessao.service';
import { RecursosService } from './recursos.service';
import { AcessoLicitacaoService, ehUuid } from '../auth/acesso/acesso-licitacao.service';
import {
  AtorAtual,
  AutenticacaoOpcional,
  OrgaoOuFornecedor,
  SomenteFornecedor,
  SomenteOrgao,
} from '../auth/acesso/acesso.decorators';
import { ehFornecedor } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';
import { SigiloDisputaService } from '../disputa-v2/sigilo-disputa.service';
import { licitacaoParaPublico } from '../licitacoes/licitacao-visao.util';
import { StatusSessao } from './entities/sessao-disputa.entity';

/**
 * SESSÃO PÚBLICA (legado da sala /sessao + etapas pós-disputa).
 *
 * AUTORIZAÇÃO (E1a):
 *  - atos do pregoeiro (criar/iniciar/suspender/encerrar, itens, negociação,
 *    habilitação, recursos — abrir/encerrar prazo, admitir/recusar, decidir —,
 *    ME/EPP convocar, adjudicar, homologar) → @SomenteOrgao + órgão DONO;
 *  - atos do fornecedor (intenção de recurso, ME/EPP aceitar/recusar) →
 *    @SomenteFornecedor, fornecedor = token (id da rota/corpo tem de conferir)
 *    e com proposta válida;
 *  - razões/contrarrazões: o próprio fornecedor (token) ou o órgão dono
 *    registrando em nome dele (painel do pregoeiro);
 *  - leituras: órgão dono vê tudo; demais recebem as identidades dos outros
 *    licitantes trocadas pelo código anônimo. Habilitação: só o órgão dono (o
 *    fornecedor convocado vê só a própria convocação);
 *  - lance por LOTE nesta API: DESATIVADO (duplicava o lance da disputa-v2 sem
 *    trava; o motor único vem na E2).
 */
@Controller('sessao')
export class SessaoController {
  constructor(
    private readonly sessaoService: SessaoService,
    private readonly recursosService: RecursosService,
    private readonly acesso: AcessoLicitacaoService,
    private readonly sigilo: SigiloDisputaService,
  ) {}

  /** Licitação da sessão (404 se não existe). */
  private async licitacaoDaSessao(sessaoId: string): Promise<string> {
    const dono = await this.acesso.donoDaSessao(sessaoId);
    if (!dono) throw new NotFoundException('Sessao nao encontrada');
    return dono.licitacaoId;
  }

  /** Órgão dono (escrita) de um recurso administrativo. */
  private async assertOrgaoDoRecurso(ator: Ator, recursoId: string) {
    const recurso = await this.recursosService.buscar(recursoId);
    await this.acesso.assertOrgaoDaSessao(ator, recurso.sessao_id);
    return recurso;
  }

  // ========================================
  // ENDPOINTS PARA SALA DE DISPUTA DO FORNECEDOR (legado)
  // ========================================

  @SomenteFornecedor()
  @Get('fornecedor/:fornecedorId/licitacoes-ativas')
  async getLicitacoesAtivasFornecedor(@Param('fornecedorId') fornecedorId: string, @AtorAtual() ator: Ator) {
    const fid = this.acesso.fornecedorDoToken(ator, fornecedorId);
    return this.sessaoService.getLicitacoesAtivasFornecedor(fid);
  }

  /** Itens na visão do fornecedor: ele mesmo (token) ou o órgão dono. */
  @OrgaoOuFornecedor()
  @Get(':sessaoId/itens/fornecedor/:fornecedorId')
  async getItensSessaoFornecedor(
    @Param('sessaoId') sessaoId: string,
    @Param('fornecedorId') fornecedorId: string,
    @AtorAtual() ator: Ator,
  ) {
    if (ehFornecedor(ator)) {
      const fid = this.acesso.fornecedorDoToken(ator, fornecedorId);
      const licitacaoId = await this.licitacaoDaSessao(sessaoId);
      await this.acesso.assertFornecedorParticipa(ator, licitacaoId);
      const dados = await this.sessaoService.getItensSessaoFornecedor(sessaoId, fid);
      return this.sigilo.aplicarVisao(dados, licitacaoId, { tipo: 'FORNECEDOR', fornecedorId: fid }, { sessaoId });
    }
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId, 'leitura');
    return this.sessaoService.getItensSessaoFornecedor(sessaoId, fornecedorId);
  }

  /** Lances do item na visão do fornecedor: ele mesmo (token) ou o órgão dono. */
  @OrgaoOuFornecedor()
  @Get('item/:itemId/lances/fornecedor/:fornecedorId')
  async getLancesItem(
    @Param('itemId') itemId: string,
    @Param('fornecedorId') fornecedorId: string,
    @AtorAtual() ator: Ator,
  ) {
    const dono = await this.acesso.donoDoItem(itemId);
    if (!dono) throw new NotFoundException('Item não encontrado');
    if (ehFornecedor(ator)) {
      const fid = this.acesso.fornecedorDoToken(ator, fornecedorId);
      await this.acesso.assertFornecedorParticipa(ator, dono.licitacaoId);
      const dados = await this.sessaoService.getLancesItem(itemId, fid);
      // Só o próprio id sai; o dos concorrentes vira o código anônimo
      return this.sigilo.aplicarVisao(dados, dono.licitacaoId, { tipo: 'FORNECEDOR', fornecedorId: fid });
    }
    await this.acesso.assertOrgaoDoItem(ator, itemId, 'leitura');
    return this.sessaoService.getLancesItem(itemId, fornecedorId);
  }

  /** Chat/eventos da sessão: órgão dono completo; participantes anonimizados. */
  @OrgaoOuFornecedor()
  @Get(':sessaoId/mensagens')
  async getMensagensSessao(@Param('sessaoId') sessaoId: string, @AtorAtual() ator: Ator) {
    const licitacaoId = await this.licitacaoDaSessao(sessaoId);
    const visao = await this.sigilo.visaoDoAtor(ator, licitacaoId);
    if (visao.tipo === 'PUBLICO') throw new NotFoundException('Sessao nao encontrada');
    const mensagens = await this.sessaoService.getMensagensSessao(sessaoId);
    const reveladas = await this.sigilo.identidadesReveladas(sessaoId);
    return this.sigilo.aplicarVisao(mensagens, licitacaoId, visao, { sessaoId, identidades: !reveladas });
  }

  // ========================================
  // ENDPOINTS PARA SALA DE DISPUTA DO PREGOEIRO
  // ========================================

  /** Sessões ativas do pregoeiro — só as do órgão do usuário. */
  @SomenteOrgao()
  @Get('pregoeiro/:pregoeiroId/sessoes-ativas')
  async getSessoesAtivasPregoeiro(@Param('pregoeiroId') pregoeiroId: string, @AtorAtual() ator: Ator) {
    const r = await this.sessaoService.getSessoesAtivasPregoeiro(pregoeiroId);
    if (ator.admin) return r;
    const doOrgao = [];
    for (const s of r.sessoes) {
      if ((await this.acesso.orgaoDaLicitacao(s.licitacaoId)) === ator.orgaoId) doOrgao.push(s);
    }
    return { sessoes: doOrgao };
  }

  @SomenteOrgao()
  @Get(':sessaoId/itens/pregoeiro')
  async getItensSessaoPregoeiro(@Param('sessaoId') sessaoId: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId, 'leitura');
    return this.sessaoService.getItensSessaoPregoeiro(sessaoId);
  }

  @SomenteOrgao()
  @Get('item/:itemId/lances/pregoeiro')
  async getLancesItemPregoeiro(@Param('itemId') itemId: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDoItem(ator, itemId, 'leitura');
    return this.sessaoService.getLancesItemPregoeiro(itemId);
  }

  // ========================================
  // ENDPOINTS GERAIS
  // ========================================

  @SomenteOrgao()
  @Post(':licitacaoId')
  async criarSessao(
    @Param('licitacaoId') licitacaoId: string,
    @Body() body: { pregoeiroId: string; pregoeiroNome: string },
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId);
    return this.sessaoService.criarSessao(licitacaoId, body.pregoeiroId, body.pregoeiroNome);
  }

  // Rota mais específica primeiro para evitar conflito
  @SomenteOrgao()
  @Get('licitacao/:licitacaoId/preparar')
  async prepararDadosSessao(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId, 'leitura');
    return this.sessaoService.prepararDadosSessao(licitacaoId);
  }

  /** Sessão da licitação (metadados). Não-dono: sem identidades de licitantes. */
  @AutenticacaoOpcional()
  @Get('licitacao/:licitacaoId')
  async getSessaoPorLicitacao(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator | null) {
    if (!ehUuid(licitacaoId)) return null;
    const sessao = await this.sessaoService.getSessaoPorLicitacao(licitacaoId);
    if (!sessao) return sessao;
    const visao = await this.sigilo.visaoDoAtor(ator, licitacaoId);
    return this.sigilo.aplicarVisao(sessao, licitacaoId, visao, { sessaoId: sessao.id });
  }

  @SomenteOrgao()
  @Put(':id/iniciar')
  async iniciarSessao(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaSessao(ator, id);
    return this.sessaoService.iniciarSessao(id);
  }

  @SomenteOrgao()
  @Put(':id/reabrir')
  async reabrirSessao(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaSessao(ator, id);
    return this.sessaoService.reabrirSessao(id);
  }

  @SomenteOrgao()
  @Put(':id/avancar-disputa')
  async avancarParaDisputa(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaSessao(ator, id);
    return this.sessaoService.avancarParaDisputa(id);
  }

  @SomenteOrgao()
  @Put(':id/iniciar-item/:itemId')
  async iniciarDisputaItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @AtorAtual() ator: Ator,
  ) {
    const dono = await this.acesso.assertOrgaoDaSessao(ator, id);
    await this.assertItemDaLicitacao(itemId, dono.licitacaoId);
    return this.sessaoService.iniciarDisputaItem(id, itemId);
  }

  /**
   * Inicia disputa de TODOS os itens simultaneamente
   * Cada item terá seu próprio cronômetro
   */
  @SomenteOrgao()
  @Put(':id/iniciar-todos-itens')
  async iniciarDisputaTodosItens(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaSessao(ator, id);
    return this.sessaoService.iniciarDisputaTodosItens(id);
  }

  /**
   * Lance por LOTE nesta API legada — DESATIVADO (E1a). Duplicava o registro de
   * lance da disputa-v2 (sem trava, identidade do corpo). O lance por lote passa
   * ao motor único na E2.
   */
  @SomenteFornecedor()
  @Post(':id/lance-lote')
  async registrarLanceLote() {
    throw new ForbiddenException(
      'Lance por esta rota foi desativado. Use a sala de disputa (disputa-v2).',
    );
  }

  @SomenteOrgao()
  @Put(':id/encerrar-item')
  async encerrarDisputaItem(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaSessao(ator, id);
    return this.sessaoService.encerrarDisputaItem(id);
  }

  /**
   * Estado da habilitação: ranking completo (cnpj, valores) só para o órgão
   * dono. O fornecedor participante vê só a etapa e, se for o convocado, a
   * própria convocação.
   */
  @OrgaoOuFornecedor()
  @Get(':id/habilitacao')
  async getHabilitacaoStatus(@Param('id') id: string, @AtorAtual() ator: Ator) {
    if (ehFornecedor(ator)) {
      const licitacaoId = await this.licitacaoDaSessao(id);
      await this.acesso.assertFornecedorParticipa(ator, licitacaoId);
      const hab = await this.sessaoService.getHabilitacaoStatus(id);
      const meu = hab.convocado && hab.convocado.fornecedorId === ator.fornecedorId ? hab.convocado : null;
      return {
        sessaoId: hab.sessaoId,
        licitacaoId: hab.licitacaoId,
        etapa: hab.etapa,
        souConvocado: !!meu,
        convocado: meu,
      };
    }
    await this.acesso.assertOrgaoDaSessao(ator, id, 'leitura');
    return this.sessaoService.getHabilitacaoStatus(id);
  }

  @SomenteOrgao()
  @Get(':id/negociacao')
  async getNegociacaoStatus(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaSessao(ator, id, 'leitura');
    return this.sessaoService.getNegociacaoStatus(id);
  }

  @SomenteOrgao()
  @Put(':id/negociacao/:fornecedorId')
  async iniciarNegociacao(
    @Param('id') id: string,
    @Param('fornecedorId') fornecedorId: string,
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaSessao(ator, id);
    return this.sessaoService.iniciarNegociacao(id, fornecedorId);
  }

  @SomenteOrgao()
  @Put(':id/negociacao/encerrar')
  async encerrarNegociacao(
    @Param('id') id: string,
    @Body() body: { valorFinal?: number },
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaSessao(ator, id);
    return this.sessaoService.encerrarNegociacao(id, body.valorFinal);
  }

  @SomenteOrgao()
  @Put(':id/habilitacao/convocar/:fornecedorId')
  async convocarHabilitacao(
    @Param('id') id: string,
    @Param('fornecedorId') fornecedorId: string,
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaSessao(ator, id);
    return this.sessaoService.convocarParaHabilitacao(id, fornecedorId);
  }

  @SomenteOrgao()
  @Put(':id/habilitacao/aprovar/:fornecedorId')
  async aprovarHabilitacao(
    @Param('id') id: string,
    @Param('fornecedorId') fornecedorId: string,
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaSessao(ator, id);
    return this.sessaoService.aprovarHabilitacao(id, fornecedorId);
  }

  @SomenteOrgao()
  @Put(':id/habilitacao/reprovar/:fornecedorId')
  async reprovarHabilitacao(
    @Param('id') id: string,
    @Param('fornecedorId') fornecedorId: string,
    @Body() body: { motivo: string },
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaSessao(ator, id);
    return this.sessaoService.reprovarHabilitacao(id, fornecedorId, body.motivo);
  }

  @SomenteOrgao()
  @Put(':id/recursos/abrir-prazo')
  async abrirPrazoRecurso(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaSessao(ator, id);
    return this.sessaoService.abrirPrazoIntencaoRecurso(id);
  }

  @SomenteOrgao()
  @Get(':id/recursos/intencoes')
  async getIntencaoRecursoStatus(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaSessao(ator, id, 'leitura');
    return this.sessaoService.getIntencaoRecursoStatus(id);
  }

  /** Intenção de recurso do fornecedor do token (id do corpo, se vier, tem de conferir). */
  @SomenteFornecedor()
  @Post(':id/recursos/intencao')
  async registrarIntencaoRecurso(
    @Param('id') id: string,
    @Body() body: { fornecedorId?: string; motivacao: string },
    @AtorAtual() ator: Ator,
  ) {
    const fid = this.acesso.fornecedorDoToken(ator, body?.fornecedorId);
    await this.acesso.assertFornecedorParticipa(ator, await this.licitacaoDaSessao(id));
    return this.sessaoService.registrarIntencaoRecurso(id, fid, body.motivacao);
  }

  @SomenteOrgao()
  @Put(':id/recursos/encerrar-prazo')
  async encerrarPrazoIntencaoRecurso(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaSessao(ator, id);
    return this.sessaoService.encerrarPrazoIntencaoRecurso(id);
  }

  // === BENEFÍCIO ME/EPP (LC 123, art. 44/45) ===

  @SomenteOrgao()
  @Put(':id/mpe/convocar/:fornecedorId')
  async convocarMPE(@Param('id') id: string, @Param('fornecedorId') fornecedorId: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaSessao(ator, id);
    return this.sessaoService.convocarMPEParaLance(id, fornecedorId);
  }

  /** A ME/EPP convocada (token) exerce a preferência. */
  @SomenteFornecedor()
  @Put(':id/mpe/aceitar/:fornecedorId')
  async aceitarLanceMPE(
    @Param('id') id: string,
    @Param('fornecedorId') fornecedorId: string,
    @Body() body: { itemId: string; valor: number },
    @AtorAtual() ator: Ator,
  ) {
    const fid = this.acesso.fornecedorDoToken(ator, fornecedorId);
    const licitacaoId = await this.licitacaoDaSessao(id);
    await this.acesso.assertFornecedorParticipa(ator, licitacaoId);
    await this.assertItemDaLicitacao(body?.itemId, licitacaoId);
    return this.sessaoService.aceitarLanceMPE(id, fid, body.itemId, body.valor);
  }

  @SomenteFornecedor()
  @Put(':id/mpe/recusar/:fornecedorId')
  async recusarLanceMPE(
    @Param('id') id: string,
    @Param('fornecedorId') fornecedorId: string,
    @Body() body: { itemId: string },
    @AtorAtual() ator: Ator,
  ) {
    const fid = this.acesso.fornecedorDoToken(ator, fornecedorId);
    const licitacaoId = await this.licitacaoDaSessao(id);
    await this.acesso.assertFornecedorParticipa(ator, licitacaoId);
    await this.assertItemDaLicitacao(body?.itemId, licitacaoId);
    return this.sessaoService.recusarLanceMPE(id, fid, body.itemId);
  }

  // === RECURSOS FORMAIS (Art. 165) ===

  @SomenteOrgao()
  @Get(':id/recursos')
  async listarRecursos(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaSessao(ator, id, 'leitura');
    return this.recursosService.listarPorSessao(id);
  }

  @SomenteOrgao()
  @Post(':id/recursos/:fornecedorId/admitir')
  async admitirIntencao(
    @Param('id') id: string,
    @Param('fornecedorId') fornecedorId: string,
    @Body() body: { fornecedorNome?: string; itemId?: string; motivacao?: string },
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaSessao(ator, id);
    return this.recursosService.admitirIntencao(id, fornecedorId, body);
  }

  @SomenteOrgao()
  @Post(':id/recursos/:fornecedorId/recusar')
  async recusarIntencao(
    @Param('id') id: string,
    @Param('fornecedorId') fornecedorId: string,
    @Body() body: { motivo: string; fornecedorNome?: string; itemId?: string },
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaSessao(ator, id);
    return this.recursosService.recusarIntencao(id, fornecedorId, body.motivo, body);
  }

  /**
   * Razões do recurso: o próprio recorrente (token) ou o órgão dono
   * registrando-as em nome dele (painel do pregoeiro).
   */
  @OrgaoOuFornecedor()
  @Put('recursos/:recursoId/razoes')
  async apresentarRazoes(
    @Param('recursoId') recursoId: string,
    @Body() body: { razoes: string },
    @AtorAtual() ator: Ator,
  ) {
    if (ehFornecedor(ator)) {
      const recurso = await this.recursosService.buscar(recursoId);
      if (recurso.fornecedor_id !== ator.fornecedorId) {
        throw new ForbiddenException('Apenas o recorrente apresenta as razões do recurso');
      }
    } else {
      await this.assertOrgaoDoRecurso(ator, recursoId);
    }
    return this.recursosService.apresentarRazoes(recursoId, body.razoes);
  }

  /**
   * Contrarrazões: fornecedor participante (token — o `fornecedorId` do corpo,
   * se vier, tem de conferir) ou o órgão dono registrando em nome de um licitante.
   */
  @OrgaoOuFornecedor()
  @Put('recursos/:recursoId/contrarrazoes')
  async apresentarContrarrazoes(
    @Param('recursoId') recursoId: string,
    @Body() body: { fornecedorId?: string; fornecedorNome?: string; texto: string },
    @AtorAtual() ator: Ator,
  ) {
    if (ehFornecedor(ator)) {
      const fid = this.acesso.fornecedorDoToken(ator, body?.fornecedorId);
      const recurso = await this.recursosService.buscar(recursoId);
      await this.acesso.assertFornecedorParticipa(ator, recurso.licitacao_id);
      return this.recursosService.apresentarContrarrazoes(recursoId, {
        fornecedorId: fid,
        fornecedorNome: body?.fornecedorNome,
        texto: body?.texto,
      });
    }
    await this.assertOrgaoDoRecurso(ator, recursoId);
    return this.recursosService.apresentarContrarrazoes(recursoId, body as any);
  }

  @SomenteOrgao()
  @Put('recursos/:recursoId/decidir')
  async decidirRecurso(
    @Param('recursoId') recursoId: string,
    @Body()
    body: { provido: boolean; decisao: string; decididoPor?: string; decididoPorCargo?: string },
    @AtorAtual() ator: Ator,
  ) {
    await this.assertOrgaoDoRecurso(ator, recursoId);
    return this.recursosService.decidir(recursoId, body);
  }

  // === HOMOLOGAÇÃO (Art. 71) ===

  @SomenteOrgao()
  @Put(':id/homologar')
  async homologar(
    @Param('id') id: string,
    @Body() body: { nome?: string; cargo?: string },
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaSessao(ator, id);
    return this.sessaoService.homologar(id, body);
  }

  @SomenteOrgao()
  @Get(':id/adjudicacao')
  async getAdjudicacaoStatus(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaSessao(ator, id, 'leitura');
    return this.sessaoService.getAdjudicacaoStatus(id);
  }

  @SomenteOrgao()
  @Put(':id/adjudicar/:itemId')
  async adjudicarItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: { fornecedorId: string; valor: number },
    @AtorAtual() ator: Ator,
  ) {
    const dono = await this.acesso.assertOrgaoDaSessao(ator, id);
    await this.assertItemDaLicitacao(itemId, dono.licitacaoId);
    return this.sessaoService.adjudicarItem(id, itemId, body.fornecedorId, body.valor);
  }

  @SomenteOrgao()
  @Put(':id/adjudicar-todos')
  async adjudicarTodos(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaSessao(ator, id);
    return this.sessaoService.adjudicarTodos(id);
  }

  @SomenteOrgao()
  @Put(':id/encerrar')
  async encerrarSessao(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaSessao(ator, id);
    return this.sessaoService.encerrarSessao(id);
  }

  @SomenteOrgao()
  @Put(':id/suspender')
  async suspenderSessao(
    @Param('id') id: string,
    @Body() body: { motivo: string },
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaSessao(ator, id);
    return this.sessaoService.suspenderSessao(id, body.motivo);
  }

  /**
   * Gera a ATA completa da sessão de disputa
   * Conforme Art. 17, §2º da Lei 14.133/2021
   * Órgão dono: a qualquer momento. Demais: só com a sessão ENCERRADA (a ata
   * identifica os licitantes).
   */
  @AutenticacaoOpcional()
  @Get(':id/ata')
  async gerarAtaSessao(@Param('id') id: string, @AtorAtual() ator: Ator | null) {
    const licitacaoId = await this.licitacaoDaSessao(id);
    const visao = await this.sigilo.visaoDoAtor(ator, licitacaoId);
    if (visao.tipo !== 'ORGAO') {
      const sessao = await this.sessaoService.getSessao(id);
      if (sessao.status !== StatusSessao.ENCERRADA) {
        throw new ForbiddenException('A ata da sessão fica disponível após o encerramento da sessão');
      }
    }
    return this.sessaoService.gerarAtaSessao(id);
  }

  // ROTAS GENÉRICAS - DEVEM FICAR POR ÚLTIMO para não conflitar com rotas específicas

  /**
   * Eventos da sessão: órgão dono completo; demais com as identidades
   * anonimizadas enquanto durar a fase de lances.
   */
  @AutenticacaoOpcional()
  @Get(':id/eventos')
  async getEventos(@Param('id') id: string, @AtorAtual() ator: Ator | null) {
    const licitacaoId = await this.licitacaoDaSessao(id);
    const visao = await this.sigilo.visaoDoAtor(ator, licitacaoId);
    const eventos = await this.sessaoService.getEventosSessao(id);
    // Depois da fase de lances (habilitação em diante) a identidade é pública
    const reveladas = await this.sigilo.identidadesReveladas(id);
    return this.sigilo.aplicarVisao(eventos, licitacaoId, visao, { sessaoId: id, identidades: !reveladas });
  }

  /** Sessão (com licitação e item atual). Não-dono: visão pública da licitação, sem identidades. */
  @AutenticacaoOpcional()
  @Get(':id')
  async getSessao(@Param('id') id: string, @AtorAtual() ator: Ator | null) {
    const licitacaoId = await this.licitacaoDaSessao(id);
    const visao = await this.sigilo.visaoDoAtor(ator, licitacaoId);
    const sessao: any = await this.sessaoService.getSessao(id);
    if (visao.tipo === 'ORGAO') return sessao;
    const publica = {
      ...sessao,
      licitacao: sessao.licitacao ? licitacaoParaPublico(sessao.licitacao) : sessao.licitacao,
      item_atual: sessao.item_atual ? { ...sessao.item_atual, melhor_lance_fornecedor_id: null } : sessao.item_atual,
    };
    return this.sigilo.aplicarVisao(publica, licitacaoId, visao, { sessaoId: id });
  }

  private async assertItemDaLicitacao(itemId: string | undefined, licitacaoId: string): Promise<void> {
    const dono = ehUuid(itemId) ? await this.acesso.donoDoItem(itemId) : null;
    if (!dono || dono.licitacaoId !== licitacaoId) {
      throw new NotFoundException('Item não encontrado nesta licitação');
    }
  }
}
