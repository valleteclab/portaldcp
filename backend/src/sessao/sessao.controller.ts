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
import { SigiloDisputaService } from '../disputa/sigilo-disputa.service';
import { licitacaoParaPublico } from '../licitacoes/licitacao-visao.util';
import { StatusSessao } from './entities/sessao-disputa.entity';
import { atorTransicaoDe } from '../licitacoes/transicoes/transicoes.tipos';
import { filtrarEventosVisiveis, VisaoEvento } from '../julgamento/regras-negociacao';

/**
 * SESSÃO PÚBLICA (legado da sala /sessao + etapas pós-disputa).
 *
 * AUTORIZAÇÃO (E1a):
 *  - atos do pregoeiro (criar/iniciar/suspender, itens, negociação,
 *    habilitação — /api/habilitacao —, recursos — /api/recursos (E5) —,
 *    adjudicação/homologação — /api/resultado (E6)) → @SomenteOrgao + órgão DONO;
 *  - atos do fornecedor (ME/EPP aceitar/recusar; intenção de recurso em /api/recursos) →
 *    @SomenteFornecedor, fornecedor = token (id da rota/corpo tem de conferir)
 *    e com proposta válida;
 *  - razões/contrarrazões: só o próprio licitante (token), em /api/recursos (E5);
 *  - leituras: órgão dono vê tudo; demais recebem as identidades dos outros
 *    licitantes trocadas pelo código anônimo. Habilitação: só o órgão dono (o
 *    fornecedor convocado vê só a própria convocação);
 *  - lance: só pelo motor (disputa); por LOTE → 501 até o motor de lote (E2);
 *  - as leituras da antiga sala /sessao (sala-disputa) foram removidas na E2
 *    (as telas usam disputa (REST /api/disputa)).
 */
@Controller('sessao')
export class SessaoController {
  constructor(
    private readonly sessaoService: SessaoService,
    private readonly acesso: AcessoLicitacaoService,
    private readonly sigilo: SigiloDisputaService,
  ) {}

  /** Licitação da sessão (404 se não existe). */
  private async licitacaoDaSessao(sessaoId: string): Promise<string> {
    const dono = await this.acesso.donoDaSessao(sessaoId);
    if (!dono) throw new NotFoundException('Sessao nao encontrada');
    return dono.licitacaoId;
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

  /**
   * Todas as sessões da licitação (órgão dono) — seletor da sala única
   * /orgao/processos/[id]/sessao quando houver mais de uma (ex.: sessão refeita).
   */
  @SomenteOrgao()
  @Get('licitacao/:licitacaoId/sessoes')
  async listarSessoesDaLicitacao(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator) {
    if (!ehUuid(licitacaoId)) throw new NotFoundException('Licitação não encontrada');
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId, 'leitura');
    return this.sessaoService.listarSessoesDaLicitacao(licitacaoId);
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
    return this.sessaoService.iniciarSessao(id, atorTransicaoDe(ator));
  }

  // REMOVIDOS NA E2 (item 8 — canal único): PUT :id/reabrir, :id/avancar-disputa,
  // :id/iniciar-item/:itemId, :id/iniciar-todos-itens e :id/encerrar-item. Eram o
  // par REST dos atos do antigo socket /sessao, sem chamador nas telas; iniciar e
  // encerrar itens é do motor: POST /disputa/sessao/:id/iniciar-itens e
  // /encerrar-item/:itemId (ou o socket /disputa).

  // REMOVIDO NA E2 (item 5 — lote no motor único): POST :id/lance-lote. O lance
  // por lote é o lance do motor com o id do lote: POST /disputa/sessao/:id/lance
  // { loteId, valor } (ou o socket /disputa `enviar_lance` com o id do lote).

  // HABILITAÇÃO (plano E4): rotas em /api/habilitacao (habilitacao/habilitacao.controller.ts).
  // REMOVIDOS: GET :id/habilitacao e PUT :id/habilitacao/{convocar,aprovar,reprovar}/:fornecedorId
  // (checklist só no navegador, sem documentos). NEGOCIAÇÃO (art. 61): /api/julgamento/sessao/:id/negociacao.

  // === BENEFÍCIO ME/EPP (LC 123, art. 44/45) ===
  // E3: rotas em /api/julgamento/sessao/:id/me-epp (MeEppController) — a ME/EPP
  // convocada responde sozinha pelo token; o pregoeiro não responde por ela.

  // === RECURSOS (Art. 165) — plano E5: rotas em /api/recursos (recursos.controller.ts).
  // REMOVIDOS: PUT :id/recursos/abrir-prazo|encerrar-prazo, GET :id/recursos/intencoes,
  // POST :id/recursos/intencao (fluxo paralelo por eventos), GET :id/recursos,
  // POST :id/recursos/:fornecedorId/admitir|recusar e PUT recursos/:recursoId/
  // razoes|contrarrazoes|decidir (o órgão registrava razões/contrarrazões em nome
  // do licitante — pendência da E1a).

  // === RESULTADO (Art. 71) — plano E6: rotas em /api/resultado (resultado.controller.ts).
  // REMOVIDOS: PUT :id/homologar (autoridade digitada no corpo), GET :id/adjudicacao,
  // PUT :id/adjudicar/:itemId (só gravava evento — B1), PUT :id/adjudicar-todos e
  // PUT :id/encerrar (adjudicava a licitação sem gravar os itens). A homologação
  // encerra a sessão.

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
    // A negociação (IN 73 art. 30 §§2º–3º) entra inteira na ata: registro público depois de concluída
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
    // Negociação (E3): mensagens/contrapropostas acompanhadas só pelo órgão dono e participantes (IN 73 art. 30 §2º)
    const eventos = filtrarEventosVisiveis(await this.sessaoService.getEventosSessao(id), visao as VisaoEvento);
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
    };
    return this.sigilo.aplicarVisao(publica, licitacaoId, visao, { sessaoId: id });
  }
}
