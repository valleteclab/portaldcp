import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { AtorAtual, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import type { Ator } from '../auth/acesso/ator';
import { ProcessoConteudoService } from './processo-conteudo.service';
import { ProcessoTiposService } from './processo-tipos.service';
import { ProcessoService } from './processo.service';
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
  ) {}

  /** Tipos de processo (registro em dados + catálogo de documentos e campos de condição de cada um). */
  @Get('tipos')
  listarTipos() {
    return this.tipos.listar();
  }

  /** Lista do órgão do token: `?tipo=`, `?situacao=ABERTO|ENCERRADO`, `?contrato_id=`, `?q=` (número ou objeto), `?limit=`. */
  @Get()
  listar(@AtorAtual() ator: Ator, @Query() query: any) {
    return this.processos.listar(ator, query ?? {});
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
    return this.conteudo.tramitacao(await this.processos.obter(ator, id));
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

  /** Encerra um processo sem conteúdo (AVULSO). Corpo: { motivo? }. */
  @Post(':id/encerrar')
  async encerrar(@AtorAtual() ator: Ator, @Param('id') id: string, @Body() body: any) {
    return this.conteudo.visao(await this.processos.encerrar(ator, id, body?.motivo ?? null));
  }
}
