/**
 * MODELO DE FLUXO DA FASE INTERNA EM DADOS (F1 — docs/licitacao/PLANO-FLUXO-TRAMITACAO.md §10 e §11).
 * Tipos e funções PURAS (sem banco).
 *
 * "Nada de regras hardcoded": quais etapas existem, as dependências entre
 * elas, quem faz, os prazos, o que é opcional, se a IA prepara o rascunho e se
 * há aprovação interna ficam em DADOS (tabelas `modelos_fluxo_fase_interna` e
 * `modelos_fluxo_etapas`), com o modelo "Câmara — Portaria 089" semeado no
 * boot (`semente-fluxo.ts`). O que continua em código é o CATÁLOGO do que o
 * sistema sabe fazer (`catalogo-fluxo.ts`: a tela de cada etapa, os tipos de
 * peça que ela produz e como ela conclui) — o mesmo princípio do motor de
 * conformidade (o "como verificar" em código; o "quais valem" em dados).
 *
 * Requisitos mínimos da lei (`requisitos_legais_fluxo`) validam o modelo:
 * etapa obrigatória, dependência mínima e segregação de funções (aviso).
 */

export type TipoProcessoFluxo = 'DISPENSA' | 'INEXIGIBILIDADE' | 'LICITACAO';
export const TIPOS_PROCESSO_FLUXO: TipoProcessoFluxo[] = ['DISPENSA', 'INEXIGIBILIDADE', 'LICITACAO'];

export const ROTULO_TIPO_PROCESSO: Record<TipoProcessoFluxo, string> = {
  DISPENSA: 'Dispensa (contratação direta — art. 75)',
  INEXIGIBILIDADE: 'Inexigibilidade (contratação direta — art. 74)',
  LICITACAO: 'Licitação (pregão, concorrência e demais — art. 18)',
};

export function tipoProcessoValido(v: unknown): v is TipoProcessoFluxo {
  return typeof v === 'string' && (TIPOS_PROCESSO_FLUXO as string[]).includes(v);
}

/**
 * Tipo do processo para o modelo de fluxo — a MESMA classificação que o código
 * já usa para escolher o rito (contratação direta × licitação —
 * `MODALIDADES_CONTRATACAO_DIRETA`), separando a inexigibilidade (art. 74) da
 * dispensa (art. 75). Credenciamento é inexigibilidade (art. 74, IV).
 */
export function tipoDoProcesso(modalidade: string | null | undefined, contratacaoDireta: boolean): TipoProcessoFluxo {
  if (!contratacaoDireta) return 'LICITACAO';
  const m = String(modalidade ?? '');
  return m === 'INEXIGIBILIDADE' || m === 'CREDENCIAMENTO' ? 'INEXIGIBILIDADE' : 'DISPENSA';
}

export const ehContratacaoDireta = (tipo: TipoProcessoFluxo) => tipo !== 'LICITACAO';

/**
 * Como a etapa conclui:
 *  - PECAS: todas as peças dela prontas (anexada, assinada, OK ou "não se aplica");
 *  - DIVULGACAO: a publicação confirmada (PNCP/diário oficial) — etapa 8;
 *  - REGISTRO: um despacho registrado no processo (etapas sem peça própria:
 *    "autorização de início", "indicação da modalidade").
 */
export type ConclusaoEtapa = 'PECAS' | 'DIVULGACAO' | 'REGISTRO';

export interface ResponsavelEtapa {
  papel: string | null;
  setor_id: string | null;
  usuario_id: string | null;
}

export interface EtapaDoModelo {
  /** Código do catálogo (= passo: DFD, ETP, …, AUTORIZACAO_INICIO). */
  codigo: string;
  /** Etapa da tela (agrupa passos: a etapa 7 tem minutas e parecer). */
  grupo: string;
  grupo_titulo: string;
  titulo: string;
  /** Ordem SUGERIDA (a trava é a dependência). */
  ordem: number;
  tipos_peca: string[];
  tela: string | null;
  conclusao: ConclusaoEtapa;
  fase_maquina: string;
  portao: string | null;
  fundamento: string | null;
  responsavel: ResponsavelEtapa;
  /** Dias úteis pelo calendário do órgão; null = sem prazo. */
  prazo_dias_uteis: number | null;
  obrigatoria: boolean;
  ligada: boolean;
  ia_rascunho: boolean;
  /** A peça feita no sistema só conta depois de aprovada (fluxo de aprovação) ou assinada. */
  aprovacao_interna: boolean;
  /** Pode ser dispensada NO PROCESSO informando o ato da autoridade (parecer — art. 53, §5º). */
  dispensavel_por_ato: boolean;
  depende_de: string[];
  /**
   * Só no modelo do PROCESSO: etapa opcional ligada no modelo vigente depois
   * que o processo nasceu (no snapshot estava desligada). Entra no processo só
   * se nenhuma etapa que depende dela começou — o caminho já percorrido não muda.
   */
  entrou_depois?: boolean;
}

export type TipoAprovador = 'PERMISSAO' | 'PAPEL' | 'SETOR' | 'USUARIO';

export interface AprovacaoDemandaModelo {
  /** O processo só segue depois da aprovação da demanda (pedido do dono, 26/09/2026). */
  exigida: boolean;
  /** Etapa que carrega a aprovação (a demanda — DFD). */
  etapa: string;
  /** Quem aprova. PERMISSAO = quem tem "pode aprovar demandas" (e o login do órgão / administrador). */
  aprovador: { tipo: TipoAprovador; valor: string | null };
  /** DFD juntada (feita fora): a aprovação consta da própria peça. */
  aceita_peca_externa: boolean;
}

export interface ModeloFluxo {
  id: string | null;
  orgao_id: string | null;
  tipo_processo: TipoProcessoFluxo;
  codigo: string;
  nome: string;
  descricao: string | null;
  versao: number;
  aprovacao_demanda: AprovacaoDemandaModelo;
  etapas: EtapaDoModelo[];
}

// ---------------------------------------------------------------------------
// Requisitos mínimos da lei (dados — `requisitos_legais_fluxo`)
// ---------------------------------------------------------------------------

export type TipoRequisito = 'ETAPA_OBRIGATORIA' | 'DEPENDENCIA' | 'SEGREGACAO';
/** A que tipo de processo o requisito se aplica. */
export type AlcanceRequisito = 'CONTRATACAO_DIRETA' | 'LICITACAO' | 'TODOS';

export interface RequisitoLegal {
  codigo: string;
  alcance: AlcanceRequisito;
  tipo: TipoRequisito;
  /** ETAPA_OBRIGATORIA: a etapa; DEPENDENCIA: a que depende; SEGREGACAO: uma das funções. */
  etapa: string;
  /** DEPENDENCIA: da qual depende; SEGREGACAO: a outra função. */
  outra_etapa: string | null;
  /** ETAPA_OBRIGATORIA: pode ser dispensada no processo por ato (art. 53, §5º). */
  permite_dispensa_por_ato: boolean;
  fundamento: string;
  mensagem: string;
  ativo: boolean;
}

export function requisitoSeAplica(r: Pick<RequisitoLegal, 'alcance' | 'ativo'>, tipo: TipoProcessoFluxo): boolean {
  if (!r.ativo) return false;
  if (r.alcance === 'TODOS') return true;
  return r.alcance === (ehContratacaoDireta(tipo) ? 'CONTRATACAO_DIRETA' : 'LICITACAO');
}

// ---------------------------------------------------------------------------
// Grafo
// ---------------------------------------------------------------------------

/** Ciclo nas dependências (lista de códigos, fechando no primeiro) ou null. */
export function cicloNasDependencias(etapas: Pick<EtapaDoModelo, 'codigo' | 'depende_de'>[]): string[] | null {
  const deps = new Map(etapas.map((e) => [e.codigo, e.depende_de]));
  const cor = new Map<string, 0 | 1 | 2>();
  const pilha: string[] = [];
  let achado: string[] | null = null;
  const visitar = (c: string): boolean => {
    cor.set(c, 1);
    pilha.push(c);
    for (const d of deps.get(c) ?? []) {
      if (!deps.has(d)) continue;
      const k = cor.get(d) ?? 0;
      if (k === 1) {
        achado = [...pilha.slice(pilha.indexOf(d)), d];
        return true;
      }
      if (k === 0 && visitar(d)) return true;
    }
    pilha.pop();
    cor.set(c, 2);
    return false;
  };
  for (const e of etapas) if ((cor.get(e.codigo) ?? 0) === 0 && visitar(e.codigo)) break;
  return achado;
}

/**
 * Ordem topológica (dependências antes), desempate pela ordem sugerida.
 * Com ciclo, os que sobram vão no fim pela ordem sugerida (a validação recusa
 * o modelo; aqui só não se trava).
 */
export function ordemTopologica<T extends Pick<EtapaDoModelo, 'codigo' | 'depende_de' | 'ordem'>>(etapas: T[]): T[] {
  const porCodigo = new Map(etapas.map((e) => [e.codigo, e]));
  const pendentes = new Map(etapas.map((e) => [e.codigo, new Set(e.depende_de.filter((d) => porCodigo.has(d) && d !== e.codigo))]));
  const saida: T[] = [];
  const porOrdem = (a: T, b: T) => a.ordem - b.ordem || a.codigo.localeCompare(b.codigo);
  while (pendentes.size) {
    const livres = [...pendentes.entries()].filter(([, s]) => s.size === 0).map(([c]) => porCodigo.get(c)!);
    if (!livres.length) {
      saida.push(...[...pendentes.keys()].map((c) => porCodigo.get(c)!).sort(porOrdem));
      break;
    }
    const prox = livres.sort(porOrdem)[0];
    saida.push(prox);
    pendentes.delete(prox.codigo);
    for (const s of pendentes.values()) s.delete(prox.codigo);
  }
  return saida;
}

/** X depende (direta ou indiretamente) de Y? Só pelas etapas informadas. */
export function dependeTransitivamente(etapas: Pick<EtapaDoModelo, 'codigo' | 'depende_de'>[], x: string, y: string): boolean {
  const deps = new Map(etapas.map((e) => [e.codigo, e.depende_de]));
  const vistos = new Set<string>();
  const fila = [...(deps.get(x) ?? [])];
  while (fila.length) {
    const c = fila.shift()!;
    if (c === y) return true;
    if (vistos.has(c)) continue;
    vistos.add(c);
    fila.push(...(deps.get(c) ?? []));
  }
  return false;
}

/**
 * Dependências EFETIVAS entre as etapas ligadas: uma dependência de etapa
 * desligada é substituída pelas dependências dela (o caminho não se perde —
 * ex.: ETP → autorização de início (desligada) → DFD vira ETP → DFD).
 */
export function dependenciasEfetivas(etapas: Pick<EtapaDoModelo, 'codigo' | 'depende_de' | 'ligada'>[]): Map<string, string[]> {
  const porCodigo = new Map(etapas.map((e) => [e.codigo, e]));
  const r = new Map<string, string[]>();
  for (const e of etapas) {
    if (!e.ligada) continue;
    // As dependências ligadas ficam como estão (na ordem do modelo)
    const saida: string[] = e.depende_de.filter((d) => d !== e.codigo && porCodigo.get(d)?.ligada);
    // As desligadas são atravessadas: entram as ligadas que estão atrás delas,
    // salvo se já são exigidas por outra dependência (não duplica o caminho)
    const substitutas: string[] = [];
    const vistos = new Set<string>([e.codigo]);
    const fila = e.depende_de.filter((d) => porCodigo.has(d) && !porCodigo.get(d)!.ligada);
    while (fila.length) {
      const c = fila.shift()!;
      if (vistos.has(c)) continue;
      vistos.add(c);
      const d = porCodigo.get(c);
      if (!d) continue;
      if (d.ligada) substitutas.push(c);
      else fila.push(...d.depende_de);
    }
    for (const x of substitutas) {
      if (!saida.some((y) => y === x || dependeTransitivamente(etapas, y, x))) saida.push(x);
    }
    r.set(e.codigo, saida);
  }
  return r;
}

/**
 * NÍVEIS do desenho (colunas do diagrama): nível 1 = sem dependência; senão
 * 1 + o maior nível das dependências. Etapas do mesmo nível podem correr em
 * paralelo. Só as etapas ligadas.
 */
export function niveisDoGrafo(etapas: Pick<EtapaDoModelo, 'codigo' | 'depende_de' | 'ligada' | 'ordem'>[]): Array<{ nivel: number; etapas: string[] }> {
  const efetivas = dependenciasEfetivas(etapas);
  const ligadas = ordemTopologica(etapas.filter((e) => e.ligada).map((e) => ({ ...e, depende_de: efetivas.get(e.codigo) ?? [] })));
  const nivel = new Map<string, number>();
  for (const e of ligadas) nivel.set(e.codigo, 1 + Math.max(0, ...e.depende_de.map((d) => nivel.get(d) ?? 0)));
  const max = Math.max(0, ...nivel.values());
  const colunas: Array<{ nivel: number; etapas: string[] }> = [];
  for (let n = 1; n <= max; n++) colunas.push({ nivel: n, etapas: ligadas.filter((e) => nivel.get(e.codigo) === n).map((e) => e.codigo) });
  return colunas;
}

// ---------------------------------------------------------------------------
// Validação do modelo (erros com o artigo; avisos de segregação)
// ---------------------------------------------------------------------------

export interface ErroModelo {
  codigo: string;
  etapa: string | null;
  fundamento: string | null;
  mensagem: string;
}

export interface UsuarioParaSegregacao {
  id: string;
  nome: string;
  papeis: string[];
  setor_id: string | null;
  ativo?: boolean;
}

export interface ResultadoValidacao {
  ok: boolean;
  erros: ErroModelo[];
  avisos: ErroModelo[];
}

const nomeDa = (m: Pick<ModeloFluxo, 'etapas'>, codigo: string) => m.etapas.find((e) => e.codigo === codigo)?.titulo ?? codigo;

/**
 * VALIDA o modelo contra o catálogo e os requisitos mínimos da lei:
 *  - só etapas do catálogo; dependências entre etapas do modelo; sem ciclo;
 *  - etapa obrigatória por lei presente, ligada e marcada obrigatória;
 *  - só a etapa opcional pode ser desligada;
 *  - "dispensável por ato" só onde o requisito permite (art. 53, §5º);
 *  - dependência mínima (ex.: autorização depois da pesquisa e da reserva);
 *  - responsável: papel válido, setor e usuário do órgão; prazo 0 a 365;
 *  - aviso (não bloqueio) de segregação de funções (art. 7º, §1º).
 */
export function validarModelo(
  modelo: ModeloFluxo,
  requisitos: RequisitoLegal[],
  opcoes: {
    catalogo: string[];
    papeis: string[];
    setores?: string[];
    usuarios?: UsuarioParaSegregacao[];
  },
): ResultadoValidacao {
  const erros: ErroModelo[] = [];
  const avisos: ErroModelo[] = [];
  const codigos = new Set(modelo.etapas.map((e) => e.codigo));
  const vistos = new Set<string>();

  for (const e of modelo.etapas) {
    if (!opcoes.catalogo.includes(e.codigo)) erros.push({ codigo: 'ETAPA_DESCONHECIDA', etapa: e.codigo, fundamento: null, mensagem: `Etapa desconhecida: ${e.codigo}.` });
    if (vistos.has(e.codigo)) erros.push({ codigo: 'ETAPA_REPETIDA', etapa: e.codigo, fundamento: null, mensagem: `Etapa repetida: ${e.titulo}.` });
    vistos.add(e.codigo);
    for (const d of e.depende_de) {
      if (d === e.codigo) erros.push({ codigo: 'DEPENDENCIA_PROPRIA', etapa: e.codigo, fundamento: null, mensagem: `${e.titulo} não pode depender de si mesma.` });
      else if (!codigos.has(d)) erros.push({ codigo: 'DEPENDENCIA_DESCONHECIDA', etapa: e.codigo, fundamento: null, mensagem: `${e.titulo} depende de uma etapa que não existe no modelo (${d}).` });
    }
    if (!e.ligada && e.obrigatoria) {
      erros.push({ codigo: 'OBRIGATORIA_DESLIGADA', etapa: e.codigo, fundamento: null, mensagem: `${e.titulo} é obrigatória e não pode ser desligada — só as etapas opcionais podem.` });
    }
    const r = e.responsavel ?? { papel: null, setor_id: null, usuario_id: null };
    if (r.papel && !opcoes.papeis.includes(r.papel)) erros.push({ codigo: 'PAPEL_INVALIDO', etapa: e.codigo, fundamento: null, mensagem: `Papel inválido em ${e.titulo}: ${r.papel}.` });
    if (r.setor_id && opcoes.setores && !opcoes.setores.includes(r.setor_id)) {
      erros.push({ codigo: 'SETOR_DE_OUTRO_ORGAO', etapa: e.codigo, fundamento: null, mensagem: `O setor de ${e.titulo} não pertence ao órgão.` });
    }
    if (r.usuario_id && opcoes.usuarios && !opcoes.usuarios.some((u) => u.id === r.usuario_id && u.ativo !== false)) {
      erros.push({ codigo: 'USUARIO_DE_OUTRO_ORGAO', etapa: e.codigo, fundamento: null, mensagem: `O responsável por ${e.titulo} deve ser usuário ativo do órgão.` });
    }
    if (e.prazo_dias_uteis !== null && (!Number.isInteger(e.prazo_dias_uteis) || e.prazo_dias_uteis < 0 || e.prazo_dias_uteis > 365)) {
      erros.push({ codigo: 'PRAZO_INVALIDO', etapa: e.codigo, fundamento: null, mensagem: `Prazo de ${e.titulo} inválido (0 a 365 dias úteis; vazio = sem prazo).` });
    }
    if (e.conclusao === 'PECAS' && e.aprovacao_interna && !e.tipos_peca.length) {
      erros.push({ codigo: 'APROVACAO_SEM_PECA', etapa: e.codigo, fundamento: null, mensagem: `${e.titulo} não produz peça — a aprovação interna não se aplica.` });
    }
  }

  const ciclo = cicloNasDependencias(modelo.etapas);
  if (ciclo) {
    erros.push({ codigo: 'CICLO', etapa: ciclo[0], fundamento: null, mensagem: `Ciclo nas dependências: ${ciclo.map((c) => nomeDa(modelo, c)).join(' → ')}. Uma etapa não pode esperar por ela mesma.` });
  }

  const aplicaveis = requisitos.filter((r) => requisitoSeAplica(r, modelo.tipo_processo));
  const obrigatorias = aplicaveis.filter((r) => r.tipo === 'ETAPA_OBRIGATORIA');
  for (const r of obrigatorias) {
    const e = modelo.etapas.find((x) => x.codigo === r.etapa);
    if (!e || !e.ligada || !e.obrigatoria) {
      erros.push({ codigo: r.codigo, etapa: r.etapa, fundamento: r.fundamento, mensagem: `${r.mensagem} (${r.fundamento}).` });
    }
  }
  for (const e of modelo.etapas.filter((x) => x.dispensavel_por_ato)) {
    const permite = obrigatorias.some((r) => r.etapa === e.codigo && r.permite_dispensa_por_ato);
    const exigida = obrigatorias.some((r) => r.etapa === e.codigo);
    if (exigida && !permite) {
      const r = obrigatorias.find((x) => x.etapa === e.codigo)!;
      erros.push({
        codigo: 'DISPENSA_NAO_PERMITIDA',
        etapa: e.codigo,
        fundamento: r.fundamento,
        mensagem: `${e.titulo} não pode ser dispensada por ato neste tipo de processo (${r.fundamento}).`,
      });
    }
  }
  if (!ciclo) {
    for (const r of aplicaveis.filter((x) => x.tipo === 'DEPENDENCIA')) {
      if (!r.outra_etapa || !codigos.has(r.etapa) || !codigos.has(r.outra_etapa)) continue;
      if (!dependeTransitivamente(modelo.etapas, r.etapa, r.outra_etapa)) {
        erros.push({ codigo: r.codigo, etapa: r.etapa, fundamento: r.fundamento, mensagem: `${r.mensagem} (${r.fundamento}).` });
      }
    }
  }

  // Aprovação da demanda
  const ap = modelo.aprovacao_demanda;
  if (ap?.exigida) {
    if (!codigos.has(ap.etapa)) erros.push({ codigo: 'APROVACAO_SEM_ETAPA', etapa: ap.etapa, fundamento: null, mensagem: `A aprovação da demanda aponta para uma etapa que não existe (${ap.etapa}).` });
    if (ap.aprovador.tipo !== 'PERMISSAO' && !ap.aprovador.valor) {
      erros.push({ codigo: 'APROVADOR_VAZIO', etapa: ap.etapa, fundamento: null, mensagem: 'Informe quem aprova a demanda (papel, setor ou pessoa).' });
    }
    if (ap.aprovador.tipo === 'PAPEL' && ap.aprovador.valor && !opcoes.papeis.includes(ap.aprovador.valor)) {
      erros.push({ codigo: 'APROVADOR_PAPEL_INVALIDO', etapa: ap.etapa, fundamento: null, mensagem: `Papel do aprovador inválido: ${ap.aprovador.valor}.` });
    }
    if (ap.aprovador.tipo === 'SETOR' && ap.aprovador.valor && opcoes.setores && !opcoes.setores.includes(ap.aprovador.valor)) {
      erros.push({ codigo: 'APROVADOR_SETOR', etapa: ap.etapa, fundamento: null, mensagem: 'O setor que aprova a demanda não pertence ao órgão.' });
    }
    if (ap.aprovador.tipo === 'USUARIO' && ap.aprovador.valor && opcoes.usuarios && !opcoes.usuarios.some((u) => u.id === ap.aprovador.valor && u.ativo !== false)) {
      erros.push({ codigo: 'APROVADOR_USUARIO', etapa: ap.etapa, fundamento: null, mensagem: 'Quem aprova a demanda deve ser usuário ativo do órgão.' });
    }
  }

  if (opcoes.usuarios) avisos.push(...avisosDeSegregacao(modelo, aplicaveis.filter((r) => r.tipo === 'SEGREGACAO'), opcoes.usuarios));
  return { ok: erros.length === 0, erros, avisos };
}

/** Pessoas que podem cair na etapa pelo responsável configurado (papel/setor/usuário). */
export function pessoasDoResponsavel(r: ResponsavelEtapa, usuarios: UsuarioParaSegregacao[]): UsuarioParaSegregacao[] {
  const ativos = usuarios.filter((u) => u.ativo !== false);
  if (r.usuario_id) return ativos.filter((u) => u.id === r.usuario_id);
  return ativos.filter((u) => (!!r.papel && u.papeis.includes(r.papel)) || (!!r.setor_id && u.setor_id === r.setor_id));
}

/**
 * SEGREGAÇÃO DE FUNÇÕES (art. 7º, §1º) — AVISO, não bloqueio: a mesma pessoa
 * pode cair em duas funções que se controlam (ex.: faz a pesquisa e autoriza;
 * é o agente e a autoridade).
 */
export function avisosDeSegregacao(modelo: ModeloFluxo, requisitos: RequisitoLegal[], usuarios: UsuarioParaSegregacao[]): ErroModelo[] {
  const avisos: ErroModelo[] = [];
  for (const r of requisitos) {
    if (!r.outra_etapa) continue;
    const a = modelo.etapas.find((e) => e.codigo === r.etapa && e.ligada);
    const b = modelo.etapas.find((e) => e.codigo === r.outra_etapa && e.ligada);
    if (!a || !b) continue;
    const pa = pessoasDoResponsavel(a.responsavel, usuarios);
    const pb = new Set(pessoasDoResponsavel(b.responsavel, usuarios).map((u) => u.id));
    const mesmas = pa.filter((u) => pb.has(u.id));
    if (!mesmas.length) continue;
    const nomes = mesmas.slice(0, 5).map((u) => u.nome).join(', ');
    avisos.push({
      codigo: r.codigo,
      etapa: r.etapa,
      fundamento: r.fundamento,
      mensagem: `${r.mensagem}: ${nomes} ${mesmas.length === 1 ? 'está' : 'estão'} em "${a.titulo}" e em "${b.titulo}" (${r.fundamento}).`,
    });
  }
  return avisos;
}

// ---------------------------------------------------------------------------
// Edição (só os campos editáveis; o resto vem do catálogo/modelo atual)
// ---------------------------------------------------------------------------

const normalizarPrazo = (v: unknown): number | null | 'INVALIDO' => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 365) return 'INVALIDO';
  const k = Math.floor(n);
  return k > 0 ? k : null;
};

const texto = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

/**
 * Aplica o corpo do PUT sobre o modelo atual. Editáveis por etapa: título,
 * ordem, responsável, prazo, obrigatória, ligada, IA, aprovação interna,
 * dispensável por ato e dependências. Código, peças, tela e conclusão são do
 * catálogo. Devolve o modelo novo e os erros de formato.
 */
export function aplicarEdicao(atual: ModeloFluxo, corpo: any): { modelo: ModeloFluxo; erros: ErroModelo[] } {
  const erros: ErroModelo[] = [];
  const etapas = atual.etapas.map((e) => ({ ...e, responsavel: { ...e.responsavel }, depende_de: [...e.depende_de] }));
  const lista: any[] = Array.isArray(corpo?.etapas) ? corpo.etapas : [];
  for (const x of lista) {
    const codigo = String(x?.codigo ?? '');
    const e = etapas.find((y) => y.codigo === codigo);
    if (!e) {
      erros.push({ codigo: 'ETAPA_DESCONHECIDA', etapa: codigo || null, fundamento: null, mensagem: `Etapa desconhecida: ${codigo || '(sem código)'}.` });
      continue;
    }
    if (x.titulo !== undefined) e.titulo = texto(x.titulo, 200) || e.titulo;
    if (x.ordem !== undefined) {
      const n = Number(x.ordem);
      if (Number.isFinite(n)) e.ordem = Math.max(0, Math.min(9999, Math.floor(n)));
    }
    if (x.responsavel !== undefined) {
      const r = x.responsavel ?? {};
      e.responsavel = {
        papel: r.papel ? String(r.papel) : null,
        setor_id: r.setor_id ? String(r.setor_id) : null,
        usuario_id: r.usuario_id ? String(r.usuario_id) : null,
      };
    }
    if (x.prazo_dias_uteis !== undefined) {
      const p = normalizarPrazo(x.prazo_dias_uteis);
      if (p === 'INVALIDO') erros.push({ codigo: 'PRAZO_INVALIDO', etapa: codigo, fundamento: null, mensagem: `Prazo de ${e.titulo} inválido (0 a 365 dias úteis; vazio = sem prazo).` });
      else e.prazo_dias_uteis = p;
    }
    for (const campo of ['obrigatoria', 'ligada', 'ia_rascunho', 'aprovacao_interna', 'dispensavel_por_ato'] as const) {
      if (x[campo] === undefined) continue;
      if (typeof x[campo] !== 'boolean') erros.push({ codigo: 'CAMPO_INVALIDO', etapa: codigo, fundamento: null, mensagem: `${campo} de ${e.titulo} deve ser verdadeiro ou falso.` });
      else e[campo] = x[campo];
    }
    if (x.depende_de !== undefined) {
      if (!Array.isArray(x.depende_de)) erros.push({ codigo: 'CAMPO_INVALIDO', etapa: codigo, fundamento: null, mensagem: `Dependências de ${e.titulo}: envie uma lista de códigos.` });
      else e.depende_de = [...new Set<string>((x.depende_de as unknown[]).map((d) => String(d)))];
    }
  }
  const aprovacao = { ...atual.aprovacao_demanda, aprovador: { ...atual.aprovacao_demanda.aprovador } };
  const ap = corpo?.aprovacao_demanda;
  if (ap && typeof ap === 'object') {
    if (ap.exigida !== undefined) aprovacao.exigida = ap.exigida === true;
    if (ap.aceita_peca_externa !== undefined) aprovacao.aceita_peca_externa = ap.aceita_peca_externa !== false;
    if (ap.aprovador !== undefined) {
      const tipo = String(ap.aprovador?.tipo ?? 'PERMISSAO');
      if (!['PERMISSAO', 'PAPEL', 'SETOR', 'USUARIO'].includes(tipo)) {
        erros.push({ codigo: 'APROVADOR_INVALIDO', etapa: aprovacao.etapa, fundamento: null, mensagem: 'Aprovador da demanda inválido — use PERMISSAO, PAPEL, SETOR ou USUARIO.' });
      } else {
        aprovacao.aprovador = { tipo: tipo as TipoAprovador, valor: tipo === 'PERMISSAO' ? null : ap.aprovador?.valor ? String(ap.aprovador.valor) : null };
      }
    }
  }
  return {
    modelo: {
      ...atual,
      nome: corpo?.nome !== undefined ? texto(corpo.nome, 200) || atual.nome : atual.nome,
      descricao: corpo?.descricao !== undefined ? texto(corpo.descricao, 2000) || null : atual.descricao,
      aprovacao_demanda: aprovacao,
      etapas,
    },
    erros,
  };
}

// ---------------------------------------------------------------------------
// Modelo do processo (snapshot + operacional vigente)
// ---------------------------------------------------------------------------

/**
 * SNAPSHOT do modelo gravado no processo quando ele nasce: o CAMINHO (quais
 * etapas, dependências, obrigatórias, peças, exigência de aprovação e
 * dispensa por ato) fica fixo — editar o modelo depois não bagunça o processo
 * em andamento.
 */
export interface SnapshotModelo {
  modelo_id: string | null;
  orgao_id: string | null;
  codigo: string;
  nome: string;
  versao: number;
  tipo_processo: TipoProcessoFluxo;
  aprovacao_demanda: AprovacaoDemandaModelo;
  etapas: EtapaDoModelo[];
}

export function snapshotDoModelo(m: ModeloFluxo): SnapshotModelo {
  return {
    modelo_id: m.id,
    orgao_id: m.orgao_id,
    codigo: m.codigo,
    nome: m.nome,
    versao: m.versao,
    tipo_processo: m.tipo_processo,
    aprovacao_demanda: JSON.parse(JSON.stringify(m.aprovacao_demanda)),
    etapas: JSON.parse(JSON.stringify(m.etapas)),
  };
}

/**
 * MODELO EFETIVO DO PROCESSO = o caminho do SNAPSHOT + o OPERACIONAL do
 * modelo VIGENTE do órgão (quem faz, prazo, IA, aprovação interna e o
 * liga/desliga das etapas OPCIONAIS). O operacional segue vivo porque é o
 * contrato da configuração desde a Entrega 2 (trocar o responsável reatribui
 * as tarefas abertas; ligar/desligar o controle interno vale para o processo
 * em andamento) e não muda o caminho legal. Etapa obrigatória no snapshot
 * continua ligada; opcional ligada depois (`entrou_depois`) só entra se o
 * processo ainda não passou por ela (ver `etapasDaFaseInterna`).
 */
export function modeloEfetivoDoProcesso(snapshot: SnapshotModelo, vigente: ModeloFluxo | null): ModeloFluxo {
  const etapas = snapshot.etapas.map((e) => {
    const v = vigente?.etapas.find((x) => x.codigo === e.codigo);
    if (!v) return { ...e };
    return {
      ...e,
      titulo: v.titulo || e.titulo,
      responsavel: { ...v.responsavel },
      prazo_dias_uteis: v.prazo_dias_uteis,
      ia_rascunho: v.ia_rascunho,
      aprovacao_interna: v.aprovacao_interna,
      ligada: e.obrigatoria ? true : v.ligada,
      entrou_depois: !e.obrigatoria && !e.ligada && v.ligada,
    };
  });
  return {
    id: snapshot.modelo_id,
    orgao_id: snapshot.orgao_id,
    tipo_processo: snapshot.tipo_processo,
    codigo: snapshot.codigo,
    nome: snapshot.nome,
    descricao: null,
    versao: snapshot.versao,
    aprovacao_demanda: vigente ? { ...snapshot.aprovacao_demanda, aprovador: { ...vigente.aprovacao_demanda.aprovador } } : snapshot.aprovacao_demanda,
    etapas,
  };
}

/** Etapas das quais `codigo` é pré-requisito (transitivamente), pelas dependências efetivas. */
export function dependentesDe(etapas: Pick<EtapaDoModelo, 'codigo' | 'depende_de' | 'ligada'>[], codigo: string): string[] {
  const efetivas = dependenciasEfetivas(etapas);
  const r = new Set<string>();
  const fila = [codigo];
  while (fila.length) {
    const c = fila.shift()!;
    for (const [e, deps] of efetivas) {
      if (deps.includes(c) && !r.has(e)) {
        r.add(e);
        fila.push(e);
      }
    }
  }
  r.delete(codigo);
  return [...r];
}
