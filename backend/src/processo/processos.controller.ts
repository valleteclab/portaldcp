import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { AtorAtual, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import type { Ator } from '../auth/acesso/ator';
import { ProcessoConteudoService } from './processo-conteudo.service';
import { ProcessoTiposService } from './processo-tipos.service';
import { ProcessoService } from './processo.service';
import { ProcessoTramitacaoService } from './processo-tramitacao.service';
import { validarAberturaDireta } from './processo-regras';

/**
 * PROCESSO ELETRÔNICO — API genérica (`/api/processos`).
 *
 * Só o lado da Administração (`@SomenteOrgao`: anônimo 401, fornecedor 403).
 * O órgão é SEMPRE o do token; processo de outro órgão responde 404 (como se
 * não existisse). Admin da plataforma: `?orgao_id=`.
 *
 * Nada aqui muda o comportamento das telas existentes: são rotas novas,
 * de leitura (e a abertura do processo AVULSO), endereçadas pelo processo.
 */
@Controller('processos')
@SomenteOrgao()
export class ProcessosController {
  constructor(
    private readonly processos: ProcessoService,
    private readonly conteudo: ProcessoConteudoService,
    private readonly tipos: ProcessoTiposService,
    private readonly tramite: ProcessoTramitacaoService,
  ) {}

  /** Tipos de processo (registro em dados + catálogo de documentos e campos de condição de cada um). */
  @Get('tipos')
  listarTipos() {
    return this.tipos.listar();
  }

  /** Lista do órgão do token: `?tipo=`, `?situacao=ABERTO|ENCERRADO`, `?contrato_id=`, `?q=` (número ou objeto), `?limit=`. */
  @Get()
  async listar(@AtorAtual() ator: Ator, @Query() query: any) {
    return this.conteudo.comPosse(await this.processos.listar(ator, query ?? {}));
  }

  /**
   * Abre um processo SEM objeto de conteúdo: AVULSO ou ADITIVO (este ligado a um contrato do órgão).
   * Corpo: { tipo?: 'AVULSO' | 'ADITIVO', objeto, numero?, setor_origem_id?, contrato_id? (obrigatório no ADITIVO) }.
   * CONTRATACAO nasce pelo módulo de licitações → 400.
   */
  @Post()
  async abrir(@AtorAtual() ator: Ator, @Body() body: any, @Query('orgao_id') orgaoInformado?: string) {
    const r = validarAberturaDireta(body ?? {}, this.tipos.tiposComAberturaDireta());
    if ('erro' in r) throw new BadRequestException(r.erro);
    const orgaoId = this.processos.orgaoDaConsulta(ator, orgaoInformado);
    if (!orgaoId) throw new BadRequestException('Informe orgao_id');
    if (r.dados.setor_origem_id && !(await this.processos.setorEhDoOrgao(orgaoId, r.dados.setor_origem_id))) {
      throw new BadRequestException('Setor de origem não pertence ao órgão');
    }
    if (r.dados.contrato_id && !(await this.processos.contratoEhDoOrgao(orgaoId, r.dados.contrato_id))) {
      throw new NotFoundException('Contrato não encontrado');
    }
    const p = await this.processos.abrir({
      orgaoId,
      tipo: r.dados.tipo,
      contratoId: r.dados.contrato_id,
      objeto: r.dados.objeto,
      numero: r.dados.numero,
      setorOrigemId: r.dados.setor_origem_id,
      abertoPor: ProcessoService.autorDoAtor(ator),
      origem: r.dados.contrato_id ? 'CONTRATO' : 'AVULSO',
    });
    await this.tramite.iniciarPosse(p, ator);
    return this.conteudo.visao(p);
  }

  /** Processo pela referência de conteúdo (`/processos/referencia/LICITACAO/:id` ou `/TERMO_ADITIVO/:id`). */
  @Get('referencia/:tipo/:id')
  async porReferencia(@AtorAtual() ator: Ator, @Param('tipo') tipo: string, @Param('id') id: string) {
    if (String(tipo).toUpperCase() === 'TERMO_ADITIVO') return this.conteudo.visao(await this.processos.porTermoAditivo(ator, id));
    return this.conteudo.visao(await this.processos.porReferencia(ator, tipo, id));
  }

  @Get(':id')
  async obter(@AtorAtual() ator: Ator, @Param('id') id: string) {
    return this.conteudo.visao(await this.processos.obter(ator, id));
  }

  /** Autos: regime e livro de juntadas (folhas na ordem de juntada). */
  @Get(':id/autos')
  async autos(@AtorAtual() ator: Ator, @Param('id') id: string) {
    return this.conteudo.autos(await this.processos.obter(ator, id));
  }

  /** Tramitação: com quem está, movimentação atual, todas as movimentações e a linha do tempo. */
  @Get(':id/tramitacao')
  async tramitacao(@AtorAtual() ator: Ator, @Param('id') id: string) {
    return this.conteudo.tramitacao(await this.processos.obter(ator, id), ator);
  }

  /** Fluxo: retrato (modelo, versão, marcas) e etapas calculadas — o mesmo de `/fase-interna/:id/etapas`. */
  @Get(':id/fluxo')
  async fluxo(@AtorAtual() ator: Ator, @Param('id') id: string) {
    return this.conteudo.fluxo(await this.processos.obter(ator, id), ator);
  }

  @Get(':id/tarefas')
  async tarefas(@AtorAtual() ator: Ator, @Param('id') id: string) {
    return this.conteudo.tarefas(await this.processos.obter(ator, id));
  }

  /** Peças/documentos (versão atual), com a origem INTERNO ou ARQUIVO. */
  @Get(':id/documentos')
  async documentos(@AtorAtual() ator: Ator, @Param('id') id: string) {
    return this.conteudo.documentos(await this.processos.obter(ator, id));
  }

  /** Setores e pessoas do órgão para escolher o destino + sugestão para a etapa atual (ADITIVO, RENOVACAO, AVULSO). */
  @Get(':id/destinos')
  destinos(@AtorAtual() ator: Ator, @Param('id') id: string) {
    return this.tramite.destinos(ator, id);
  }

  /** Envia o processo adiante. Corpo: { para_setor_id?, para_usuario_id?, despacho }. Só quem está com ele. */
  @Post(':id/enviar')
  enviar(@AtorAtual() ator: Ator, @Param('id') id: string, @Body() body: any) {
    return this.tramite.enviar(ator, id, body);
  }

  /** Recebe o processo que chegou para o setor/pessoa. */
  @Post(':id/receber')
  receber(@AtorAtual() ator: Ator, @Param('id') id: string) {
    return this.tramite.receber(ator, id);
  }

  /** Devolve a quem enviou. Corpo: { despacho }. */
  @Post(':id/devolver')
  devolver(@AtorAtual() ator: Ator, @Param('id') id: string, @Body() body: any) {
    return this.tramite.devolver(ator, id, body);
  }

  /**
   * Junta uma peça aos autos. Corpo: { titulo, texto?, arquivo_url?, arquivo_nome?, paginas?, etapa?, tipo_peca? }.
   * Com `etapa` (a atual), a peça conclui a etapa. Arquivo: enviar antes por POST /uploads.
   */
  @Post(':id/pecas')
  juntar(@AtorAtual() ator: Ator, @Param('id') id: string, @Body() body: any) {
    return this.tramite.juntar(ator, id, body);
  }

  /** Modelo da peça da etapa (`?etapa=`), com o contexto do processo aplicado, para começar no editor. */
  @Get(':id/pecas/modelo')
  modeloDaPeca(@AtorAtual() ator: Ator, @Param('id') id: string, @Query('etapa') etapa?: string) {
    return this.tramite.modelo(ator, id, String(etapa ?? '').trim() || null);
  }

  /** Salva o texto do editor como modelo do órgão. Corpo: { etapa?, nome, html }. */
  @Post(':id/pecas/modelos')
  salvarModeloDaPeca(@AtorAtual() ator: Ator, @Param('id') id: string, @Body() body: any) {
    return this.tramite.salvarModelo(ator, id, body);
  }

  /** Rascunho da peça pela IA. Corpo: { etapa?, orientacao? }. Devolve html com <mark> nas lacunas; não junta nada. */
  @Post(':id/pecas/rascunho')
  rascunhoDaPeca(@AtorAtual() ator: Ator, @Param('id') id: string, @Body() body: any) {
    return this.tramite.rascunhoIa(ator, id, body);
  }

  /** Encerra um processo sem conteúdo. Corpo: { motivo? }. Só quem está com ele (ou o administrador do órgão). */
  @Post(':id/encerrar')
  async encerrar(@AtorAtual() ator: Ator, @Param('id') id: string, @Body() body: any) {
    return this.conteudo.visao(await this.tramite.encerrar(ator, id, body?.motivo ?? null));
  }
}
