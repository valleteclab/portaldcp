import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { IaService } from '../../ia/ia.service';
import { extrairJson } from '../ia-rascunho/rascunho-ia-regras';
import { TarefasService } from '../tarefas/tarefas.service';
import { PAPEIS_FASE_INTERNA, ROTULO_PAPEL } from './codigos';
import { AjusteGrafo, GrafoFluxo, ROTULOS_ARESTA, TIPOS_NO, catalogoDoConstrutor, ehNoDeEtapa, normalizarGrafo } from './grafo-fluxo';
import { grafoDaRespostaIa, pedidoAoConstrutor } from './ia-construtor-fluxo';
import { RascunhoModeloFluxo } from './modelo-fluxo.entities';
import { ModeloFluxo, ROTULO_TIPO_PROCESSO, TipoProcessoFluxo, aplicarEdicao, requisitoSeAplica } from './modelo-fluxo';
import { ModeloFluxoService, grafoGravado } from './modelo-fluxo.service';
import { MODELOS_PRONTOS, modeloPronto } from './modelos-prontos-fluxo';
import { AcaoSimulacao, CAMPOS_CONDICAO, DadosCondicao, EstadoSimulacao, ResultadoConferencia, alvosNoGrafo, simular } from './motor-grafo';

type Autor = { id: string | null; nome: string | null };

/** Erros de ESTRUTURA do desenho (impedem o "Testar"); os da lei, não. */
const ESTRUTURA = /^(GRAFO_|CICLO$|ETAPA_REPETIDA$|ETAPA_DESCONHECIDA$|DEPENDENCIA_)/;

/**
 * CONSTRUTOR DE FLUXO — o modelo da fase interna como GRAFO desenhado pelo
 * órgão (docs/licitacao/PLANO-CONSTRUTOR-FLUXO.md):
 *  - RASCUNHO × VERSÃO ATIVA: o órgão edita o rascunho à vontade (a
 *    conferência aponta o que falta); "Ativar" confere e publica a nova
 *    versão (histórico com quem ativou e quando). Processos novos usam a
 *    versão ativa; os em andamento mantêm o retrato;
 *  - modelos prontos e "restaurar o modelo padrão" carregam o RASCUNHO;
 *  - simulação ("Testar") com a mesma regra do motor, sem gravar nada;
 *  - "Montar com IA": a descrição vira um rascunho (nunca ativa sozinha).
 * Isolamento: o órgão vem sempre do token (o controller resolve o alvo).
 */
@Injectable()
export class ConstrutorFluxoService {
  private readonly logger = new Logger(ConstrutorFluxoService.name);

  constructor(
    @InjectRepository(RascunhoModeloFluxo) private readonly rascunhoRepo: Repository<RascunhoModeloFluxo>,
    private readonly modelos: ModeloFluxoService,
    private readonly tarefas: TarefasService,
    private readonly ia: IaService,
  ) {}

  // ==========================================================================
  // LEITURA
  // ==========================================================================

  private ativo(orgaoId: string | null, tipo: TipoProcessoFluxo): Promise<ModeloFluxo> {
    return orgaoId ? this.modelos.modeloVigente(orgaoId, tipo) : this.modelos.modeloDoSistema(tipo);
  }

  private rascunho(orgaoId: string | null, tipo: TipoProcessoFluxo): Promise<RascunhoModeloFluxo | null> {
    return this.rascunhoRepo.findOne({ where: { orgao_id: orgaoId ?? IsNull(), tipo_processo: tipo } });
  }

  /** O modelo que o rascunho descreve (configurações do modelo + grafo), sobre o ativo. */
  private modeloDoRascunho(ativo: ModeloFluxo, r: RascunhoModeloFluxo | null): ModeloFluxo {
    if (!r) return ativo;
    const d = r.dados ?? {};
    const grafo = grafoGravado(d.grafo) ?? ativo.grafo!;
    return {
      ...ativo,
      nome: d.nome ?? ativo.nome,
      descricao: d.descricao !== undefined ? d.descricao : ativo.descricao,
      aprovacao_demanda: d.aprovacao_demanda ?? ativo.aprovacao_demanda,
      exigir_posse_pecas: d.exigir_posse_pecas ?? ativo.exigir_posse_pecas,
      grafo,
      etapas: this.modelos.etapasDoGrafo(ativo.tipo_processo, grafo),
    };
  }

  /** Nome de quem faz (papel, setor ou pessoa do órgão) — para o "Testar" e a tela. */
  private async rotulador(orgaoId: string | null) {
    const ctx = await this.modelos.contextoDoOrgao(orgaoId);
    const setores = new Map(ctx.setores.map((s) => [s.id, s.nome]));
    const pessoas = new Map(ctx.usuarios.map((u) => [u.id, u.nome]));
    return {
      ctx,
      quem: (n: { responsavel?: { papel: string | null; setor_id: string | null; usuario_id: string | null } | null }): string | null => {
        const r = n.responsavel;
        if (!r) return null;
        if (r.usuario_id) return pessoas.get(r.usuario_id) ?? 'pessoa designada';
        if (r.setor_id) return setores.get(r.setor_id) ?? 'setor designado';
        if (r.papel) return ROTULO_PAPEL[r.papel as keyof typeof ROTULO_PAPEL] ?? r.papel;
        return null;
      },
    };
  }

  /** TELA do construtor: versão ativa, rascunho, conferência, catálogo e o que o editor precisa. */
  async tela(orgaoId: string | null, tipo: TipoProcessoFluxo, extra: Record<string, unknown> = {}) {
    const ativo = await this.ativo(orgaoId, tipo);
    const r = await this.rascunho(orgaoId, tipo);
    const emEdicao = this.modeloDoRascunho(ativo, r);
    const conferencia = await this.modelos.validar(orgaoId, emEdicao);
    const { ctx } = await this.rotulador(orgaoId);
    const versaoAtiva = await this.modelos.versao(ativo.orgao_id, tipo, ativo.versao).catch(() => null);
    const requisitos = (await this.modelos.requisitos()).filter((x) => requisitoSeAplica(x, tipo));
    return {
      tipo,
      rotulo_tipo: ROTULO_TIPO_PROCESSO[tipo],
      sistema: !orgaoId,
      proprio: !!ativo.orgao_id,
      ativo: {
        versao: ativo.versao,
        nome: ativo.nome,
        descricao: ativo.descricao,
        aprovacao_demanda: ativo.aprovacao_demanda,
        exigir_posse_pecas: ativo.exigir_posse_pecas,
        grafo: ativo.grafo,
        ativado_em: versaoAtiva?.ativado_em ?? null,
        ativado_por_nome: versaoAtiva?.ativado_por_nome ?? null,
      },
      rascunho: r
        ? {
            nome: emEdicao.nome,
            descricao: emEdicao.descricao,
            aprovacao_demanda: emEdicao.aprovacao_demanda,
            exigir_posse_pecas: emEdicao.exigir_posse_pecas,
            grafo: emEdicao.grafo,
            base_versao: r.base_versao,
            /** A versão ativa mudou depois que o rascunho começou (outra pessoa ativou). */
            desatualizado: r.base_versao !== null && r.base_versao !== ativo.versao,
            origem: r.origem,
            atualizado_em: r.updated_at,
            atualizado_por_nome: r.atualizado_por_nome,
          }
        : null,
      /** Conferência do que está em edição (o rascunho; sem ele, a versão ativa). */
      conferencia,
      catalogo: {
        etapas: catalogoDoConstrutor(tipo),
        tipos_no: TIPOS_NO,
        rotulos_aresta: ROTULOS_ARESTA,
        campos_condicao: CAMPOS_CONDICAO,
      },
      requisitos,
      papeis: PAPEIS_FASE_INTERNA.map((codigo) => ({ codigo, rotulo: ROTULO_PAPEL[codigo as keyof typeof ROTULO_PAPEL] })),
      setores: ctx.setores,
      usuarios: ctx.usuarios.filter((u) => u.ativo !== false).map((u) => ({ id: u.id, nome: u.nome })),
      modelos_prontos: this.modelosProntos(tipo),
      processos_em_andamento: orgaoId ? await this.modelos.processosEmAndamento(orgaoId, tipo) : 0,
      ia_disponivel: await this.ia.configurada().catch(() => false),
      ...extra,
    };
  }

  modelosProntos(tipo?: TipoProcessoFluxo) {
    return MODELOS_PRONTOS.filter((m) => !tipo || m.tipos.includes(tipo)).map((m) => ({ codigo: m.codigo, nome: m.nome, descricao: m.descricao, tipos: m.tipos }));
  }

  // ==========================================================================
  // RASCUNHO
  // ==========================================================================

  /**
   * Normaliza o que chegou (grafo e configurações do modelo) sobre o que está
   * em edição. Devolve o modelo e os ajustes (entrada corrigida/descartada).
   */
  private async montar(orgaoId: string | null, tipo: TipoProcessoFluxo, corpo: any): Promise<{ modelo: ModeloFluxo; ajustes: AjusteGrafo[] }> {
    const ativo = await this.ativo(orgaoId, tipo);
    const atual = this.modeloDoRascunho(ativo, await this.rascunho(orgaoId, tipo));
    const ajustes: AjusteGrafo[] = [];
    let grafo = atual.grafo!;
    if (corpo?.grafo !== undefined) {
      if (!corpo.grafo || typeof corpo.grafo !== 'object') throw new BadRequestException('Envie o desenho em "grafo": { nos: [...], arestas: [...] }.');
      const { ctx } = await this.rotulador(orgaoId);
      const n = normalizarGrafo(corpo.grafo, { tipo, setores: ctx.setores.map((s) => s.id), usuarios: ctx.usuarios.map((u) => u.id) });
      grafo = n.grafo;
      ajustes.push(...n.ajustes);
    }
    // Configurações do modelo: as mesmas regras da tela antiga (aprovação da demanda, posse, nome)
    const { modelo, erros } = aplicarEdicao(atual, {
      ...(corpo?.nome !== undefined ? { nome: corpo.nome } : {}),
      ...(corpo?.descricao !== undefined ? { descricao: corpo.descricao } : {}),
      ...(corpo?.aprovacao_demanda !== undefined ? { aprovacao_demanda: corpo.aprovacao_demanda } : {}),
      ...(corpo?.exigir_posse_pecas !== undefined ? { exigir_posse_pecas: corpo.exigir_posse_pecas } : {}),
    });
    if (erros.length) throw new BadRequestException({ message: erros.map((e) => e.mensagem).join(' '), erros });
    return { modelo: { ...modelo, grafo, etapas: this.modelos.etapasDoGrafo(tipo, grafo) }, ajustes };
  }

  private async gravarRascunho(orgaoId: string | null, tipo: TipoProcessoFluxo, m: ModeloFluxo, autor: Autor, origem: string): Promise<void> {
    const ativo = await this.ativo(orgaoId, tipo);
    const dados = { nome: m.nome, descricao: m.descricao, aprovacao_demanda: m.aprovacao_demanda, exigir_posse_pecas: m.exigir_posse_pecas, grafo: m.grafo };
    const existente = await this.rascunho(orgaoId, tipo);
    if (existente) {
      await this.rascunhoRepo.update(existente.id, { dados: dados as any, origem, atualizado_por_id: autor.id, atualizado_por_nome: autor.nome });
      return;
    }
    await this.rascunhoRepo
      .createQueryBuilder()
      .insert()
      .into(RascunhoModeloFluxo)
      .values({ orgao_id: orgaoId, tipo_processo: tipo, dados: dados as any, base_versao: ativo.versao, origem, atualizado_por_id: autor.id, atualizado_por_nome: autor.nome })
      .orIgnore()
      .execute();
    // Duas gravações ao mesmo tempo: a segunda cai no índice único e atualiza
    const r = await this.rascunho(orgaoId, tipo);
    if (r && (r.origem !== origem || JSON.stringify(r.dados) !== JSON.stringify(dados))) {
      await this.rascunhoRepo.update(r.id, { dados: dados as any, origem, atualizado_por_id: autor.id, atualizado_por_nome: autor.nome });
    }
  }

  /** Salva o RASCUNHO (não ativa; o que não fecha fica na conferência). */
  async salvarRascunho(orgaoId: string | null, tipo: TipoProcessoFluxo, corpo: any, autor: Autor) {
    const { modelo, ajustes } = await this.montar(orgaoId, tipo, corpo ?? {});
    await this.gravarRascunho(orgaoId, tipo, modelo, autor, 'EDICAO');
    return this.tela(orgaoId, tipo, { ajustes });
  }

  async descartarRascunho(orgaoId: string | null, tipo: TipoProcessoFluxo) {
    await this.rascunhoRepo.delete({ orgao_id: orgaoId ?? IsNull(), tipo_processo: tipo });
    return this.tela(orgaoId, tipo);
  }

  /** CONFERÊNCIA sem gravar: do corpo (grafo/configurações) sobre o que está em edição; sem corpo, do rascunho. */
  async conferir(orgaoId: string | null, tipo: TipoProcessoFluxo, corpo: any): Promise<ResultadoConferencia & { ajustes: AjusteGrafo[] }> {
    const { modelo, ajustes } = await this.montar(orgaoId, tipo, corpo ?? {});
    return { ...(await this.modelos.validar(orgaoId, modelo)), ajustes };
  }

  /**
   * ATIVAR: confere o rascunho (erros → 400 com o artigo) e publica a nova
   * versão. Processos novos passam a usá-la; os em andamento mantêm o retrato
   * (quem faz e prazos seguem o modelo vigente, como sempre).
   */
  async ativar(orgaoId: string | null, tipo: TipoProcessoFluxo, autor: Autor) {
    const r = await this.rascunho(orgaoId, tipo);
    if (!r) throw new ConflictException('Não há rascunho para ativar: salve o desenho primeiro.');
    const ativo = await this.ativo(orgaoId, tipo);
    const modelo = this.modeloDoRascunho(ativo, r);
    const conferencia = await this.modelos.validar(orgaoId, modelo);
    if (!conferencia.ok) {
      throw new BadRequestException({
        message: `O fluxo não foi ativado: ${conferencia.erros.map((e) => e.mensagem).join(' ')}`,
        erros: conferencia.erros,
        avisos: conferencia.avisos,
        lei: conferencia.lei,
      });
    }
    const salvo = await this.modelos.ativarVersao(orgaoId, tipo, { ...modelo, id: ativo.orgao_id === orgaoId ? ativo.id : null, orgao_id: orgaoId }, autor, 'CONSTRUTOR');
    await this.rascunhoRepo.delete({ id: r.id });
    if (orgaoId) await this.tarefas.sincronizarOrgao(orgaoId);
    this.logger.log(`Fluxo ${tipo} ${orgaoId ? `do órgão ${orgaoId}` : 'do sistema'} ativado na versão ${salvo.versao} por ${autor.nome ?? autor.id}.`);
    return this.tela(orgaoId, tipo, { ativado: { versao: salvo.versao } });
  }

  /** "Restaurar o modelo padrão": o RASCUNHO passa a ser o modelo do sistema (ative para valer). */
  async restaurar(orgaoId: string | null, tipo: TipoProcessoFluxo, autor: Autor) {
    const sistema = await this.modelos.modeloDoSistema(tipo);
    await this.gravarRascunho(orgaoId, tipo, sistema, autor, 'RESTAURAR');
    return this.tela(orgaoId, tipo);
  }

  /** MODELO PRONTO no RASCUNHO (ative para valer). */
  async usarModeloPronto(orgaoId: string | null, tipo: TipoProcessoFluxo, codigo: string, autor: Autor) {
    const m = modeloPronto(codigo);
    if (!m || !m.tipos.includes(tipo)) throw new NotFoundException('Modelo pronto não encontrado para este tipo de processo.');
    const { modelo, ajustes } = await this.montar(orgaoId, tipo, { grafo: m.grafo(tipo), nome: m.nome, descricao: m.descricao });
    await this.gravarRascunho(orgaoId, tipo, modelo, autor, `MODELO_PRONTO:${m.codigo}`);
    return this.tela(orgaoId, tipo, { ajustes });
  }

  // ==========================================================================
  // SIMULAÇÃO ("Testar") — a mesma regra do motor, sem gravar
  // ==========================================================================

  async simular(orgaoId: string | null, tipo: TipoProcessoFluxo, corpo: any) {
    const { modelo } = await this.montar(orgaoId, tipo, corpo?.grafo !== undefined ? { grafo: corpo.grafo } : {});
    const grafo = modelo.grafo!;
    const conferencia = await this.modelos.validar(orgaoId, modelo);
    const estrutura = conferencia.erros.filter((e) => ESTRUTURA.test(e.codigo));
    if (estrutura.length) {
      return { estado: null, log: [], erro: 'Ajuste o desenho antes de testar (veja a conferência).', ativos: [], fim: false, conferencia: { erros: estrutura } };
    }
    const acao = this.acao(corpo?.acao, grafo);
    const estado = acao.tipo === 'iniciar' ? null : this.estado(corpo?.estado, grafo);
    if (acao.tipo !== 'iniciar' && !estado) throw new BadRequestException('Envie o "estado" devolvido pela ação anterior (ou comece com { acao: { tipo: "iniciar" } }).');
    const { quem } = await this.rotulador(orgaoId);
    const r = simular(grafo, estado, acao, { dados: this.dados(corpo?.dados), quem });
    const porId = new Map(grafo.nos.map((n) => [n.id, n]));
    return {
      ...r,
      fim: r.estado.fim,
      ativos: r.estado.ativos.map((id) => {
        const n = porId.get(id)!;
        return {
          id,
          nome: n.nome,
          tipo: n.tipo,
          quem: n.tipo === 'condicao' ? 'quem conduz' : quem(n),
          pecas: n.pecas ?? [],
          pergunta: n.tipo === 'condicao',
          pode_devolver: n.tipo === 'aprovacao',
          devolve_para: n.tipo === 'aprovacao' ? alvosNoGrafo(grafo, id) : [],
        };
      }),
      conferencia: { erros: [] },
    };
  }

  private acao(a: any, grafo: GrafoFluxo): AcaoSimulacao {
    const tipo = String(a?.tipo ?? 'iniciar');
    if (tipo === 'iniciar') return { tipo: 'iniciar' };
    const no = String(a?.no ?? '');
    if (!grafo.nos.some((n) => n.id === no)) throw new BadRequestException('Informe em "acao.no" o id de uma caixa do desenho.');
    if (tipo === 'concluir') return { tipo, no };
    if (tipo === 'responder') {
      const r = String(a?.resposta ?? '').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
      if (r !== 'sim' && r !== 'nao') throw new BadRequestException('Responda "sim" ou "nao".');
      return { tipo, no, resposta: r };
    }
    if (tipo === 'devolver') return { tipo, no, para: Array.isArray(a?.para) ? a.para.map((x: unknown) => String(x)) : undefined };
    throw new BadRequestException('Ação do teste: iniciar, concluir, responder ou devolver.');
  }

  /** Estado do teste vindo do editor: só ids que existem no desenho. */
  private estado(e: any, grafo: GrafoFluxo): EstadoSimulacao | null {
    if (!e || typeof e !== 'object') return null;
    const ids = new Set(grafo.nos.map((n) => n.id));
    const lista = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x)).filter((x) => ids.has(x)) : []);
    const mapa = <T>(v: unknown, ok: (x: unknown) => x is T): Record<string, T> =>
      v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k, x]) => ids.has(k) && ok(x))) as Record<string, T> : {};
    return {
      ativos: lista(e.ativos),
      feitos: lista(e.feitos),
      retornos: mapa<string>(e.retornos, (x): x is string => typeof x === 'string' && ids.has(x)),
      decisoes: mapa<'sim' | 'nao'>(e.decisoes, (x): x is 'sim' | 'nao' => x === 'sim' || x === 'nao'),
      fim: e.fim === true,
    };
  }

  private dados(d: any): DadosCondicao | null {
    if (!d || typeof d !== 'object') return null;
    const v = d.valor_total_estimado === undefined || d.valor_total_estimado === null || d.valor_total_estimado === '' ? null : Number(d.valor_total_estimado);
    const t = (x: unknown) => (x === undefined || x === null || x === '' ? null : String(x).slice(0, 200));
    return { valor_total_estimado: v !== null && Number.isFinite(v) ? v : null, tipo_contratacao: t(d.tipo_contratacao), modalidade: t(d.modalidade), fundamento_legal: t(d.fundamento_legal) };
  }

  // ==========================================================================
  // MONTAR COM IA
  // ==========================================================================

  /**
   * A descrição do órgão vira um RASCUNHO (nunca ativa sozinho): a IA devolve
   * o grafo em JSON; o sistema confere setores e papéis do órgão e os
   * códigos das peças, posiciona as caixas e devolve a conferência.
   */
  async gerarComIa(orgaoId: string | null, tipo: TipoProcessoFluxo, corpo: any, autor: Autor) {
    const descricao = String(corpo?.descricao ?? '').trim();
    if (descricao.length < 15) throw new BadRequestException('Descreva como o fluxo funciona no seu órgão (pelo menos 15 caracteres).');
    if (!(await this.ia.configurada().catch(() => false))) throw new ServiceUnavailableException('A IA não está configurada nesta instalação. Use um modelo pronto.');
    const { ctx } = await this.rotulador(orgaoId);
    const contexto = { tipo, setores: ctx.setores, usuarios: ctx.usuarios.filter((u) => u.ativo !== false).map((u) => u.id) };
    const pedido = pedidoAoConstrutor(contexto, descricao);
    let resposta: { texto: string; modelo: string };
    try {
      resposta = await this.ia.gerarRascunhoJson(pedido.sistema, pedido.usuario, { maxTokens: 6000 });
    } catch (e: any) {
      this.logger.warn(`Montar com IA (${tipo}) falhou: ${e?.message ?? e}`);
      throw new ServiceUnavailableException('A IA não respondeu agora. Tente de novo em instantes ou use um modelo pronto.');
    }
    const lido = grafoDaRespostaIa(extrairJson(resposta.texto), contexto);
    if (!lido || !lido.grafo.nos.some(ehNoDeEtapa)) throw new BadRequestException('A IA não devolveu um fluxo que dê para desenhar. Descreva de outro jeito.');
    const { modelo } = await this.montar(orgaoId, tipo, { grafo: lido.grafo });
    if (corpo?.salvar !== false) await this.gravarRascunho(orgaoId, tipo, modelo, autor, 'IA');
    const conferencia = await this.modelos.validar(orgaoId, modelo);
    return {
      ...(await this.tela(orgaoId, tipo)),
      ia: { modelo: resposta.modelo, ajustes: lido.ajustes, grafo: modelo.grafo, conferencia, salvo_no_rascunho: corpo?.salvar !== false },
    };
  }
}
