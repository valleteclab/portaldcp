/**
 * ETAPAS DA FASE INTERNA (Entrega 2 — docs/licitacao/PLANO-FASE-INTERNA.md,
 * SPEC §3; F1 — docs/licitacao/PLANO-FLUXO-TRAMITACAO.md §10) — funções PURAS,
 * sem banco.
 *
 * Desde a F1 as etapas, as dependências, o que é opcional e a aprovação da
 * demanda vêm do MODELO DE FLUXO (dados — `fluxo/modelo-fluxo.ts`), recebido
 * como parâmetro; nada disso fica mais em constantes. Não há coluna com o
 * status de cada etapa: a situação é DERIVADA das peças (instrução do
 * processo — `getInstrucao`: peça pronta = anexada, assinada, OK ou "não se
 * aplica"), das dependências e do ESTADO do fluxo do processo (aprovação da
 * demanda, etapa reaberta, etapa a revisar, despacho registrado).
 *
 * Decisão do dono (26/09/2026): a ordem é SUGESTÃO; o que trava são as
 * dependências (etapas independentes correm em paralelo). As dependências
 * decidem QUANDO a tarefa nasce; a peça pode ser feita a qualquer momento e
 * conta na hora. Os atos são travados pelos portões (travas da lei).
 */
import { FaseLicitacao } from '../../licitacoes/entities/licitacao.entity';
import { CATALOGO_ETAPAS, FASE_MAQUINA_DA_ETAPA, TITULO_ETAPA } from '../fluxo/catalogo-fluxo';
import { EtapaFaseInterna, PapelFaseInterna, PassoFaseInterna } from '../fluxo/codigos';
import { ConclusaoEtapa, EtapaDoModelo, ModeloFluxo, dependenciasEfetivas, dependentesDe, ordemTopologica } from '../fluxo/modelo-fluxo';
import { dependenciasPadrao, etapasSemente } from '../fluxo/semente-fluxo';

export { EtapaFaseInterna, PapelFaseInterna, PassoFaseInterna, ROTULO_PAPEL } from '../fluxo/codigos';
export { FASE_MAQUINA_DA_ETAPA, TITULO_ETAPA } from '../fluxo/catalogo-fluxo';

export type SituacaoPasso =
  | 'AGUARDANDO' // dependências ainda não cumpridas (a peça pode ser feita mesmo assim)
  | 'DISPONIVEL' // dependências cumpridas, nada começado
  | 'EM_ANDAMENTO' // alguma peça em elaboração/aprovação/assinatura, parte pronta, reaberta ou aguardando a aprovação da demanda
  | 'A_REVISAR' // F1: estava concluída, mas uma etapa de que depende foi reaberta
  | 'CONCLUIDO' // todas as peças prontas (ou "não se aplica"); publicação: divulgação CONFIRMADA (PNCP/diário oficial)
  | 'NAO_REALIZADO' // a fase interna acabou (processo divulgado) sem a peça
  | 'CANCELADO'; // processo revogado/anulado na fase interna

export type SituacaoEtapa =
  | 'AGUARDANDO'
  | 'DISPONIVEL'
  | 'EM_ANDAMENTO'
  | 'A_REVISAR'
  | 'CONCLUIDA'
  | 'NAO_REALIZADA'
  | 'CANCELADA';

/**
 * Portão (trava da lei) ligado ao passo: A (limite e fracionamento) na
 * pesquisa; B (art. 72) na autorização; C (conformidade) na publicação. O
 * portão A também segura a CONCLUSÃO do passo da pesquisa.
 */
export type Portao = 'A_LIMITE' | 'B_ART72' | 'MINUTAS_ANTES_DO_PARECER' | 'C_CONFORMIDADE';

export interface DefinicaoPasso {
  passo: PassoFaseInterna;
  etapa: EtapaFaseInterna;
  titulo: string;
  papel_padrao: PapelFaseInterna;
  prazo_padrao: number | null;
  portao?: Portao;
}

/**
 * Definição de cada passo NO MODELO PADRÃO (semente) — só para rótulos e
 * como reserva de quem não tem o modelo do processo à mão. O processo usa o
 * modelo dele.
 */
export const DEFINICAO_PASSO: Record<PassoFaseInterna, DefinicaoPasso> = Object.fromEntries(
  etapasSemente('DISPENSA').map((e) => [
    e.codigo,
    {
      passo: e.codigo as PassoFaseInterna,
      etapa: e.grupo as EtapaFaseInterna,
      titulo: e.titulo,
      papel_padrao: e.responsavel.papel as PapelFaseInterna,
      prazo_padrao: e.prazo_dias_uteis,
      ...(e.portao ? { portao: e.portao as Portao } : {}),
    },
  ]),
) as Record<PassoFaseInterna, DefinicaoPasso>;

/** Dependências EFETIVAS do passo no modelo padrão (reserva das regras puras sem modelo). */
export function dependenciasDoPasso(passo: PassoFaseInterna | string, contratacaoDireta: boolean): string[] {
  return dependenciasPadrao(contratacaoDireta).get(passo) ?? [];
}

/**
 * Passo a que a peça pertence: o do modelo (tipos de peça de cada etapa) ou,
 * sem modelo, o do catálogo. Na contratação direta a justificativa (JC — art.
 * 72 VI e VII) vai com o relatório do agente; no rito completo, com o TR.
 * Peças da fase externa (parecer nº 2) e genéricas não entram.
 */
export function passoDaPeca(tipo: string, contratacaoDireta: boolean, modelo?: Pick<ModeloFluxo, 'etapas'> | null): PassoFaseInterna | null {
  if (modelo) {
    const e = modelo.etapas.find((x) => x.tipos_peca.includes(tipo));
    return e ? (e.codigo as PassoFaseInterna) : null;
  }
  const c = CATALOGO_ETAPAS.find((x) => (contratacaoDireta ? x.tipos_peca.direta : x.tipos_peca.licitacao).includes(tipo));
  return c ? c.codigo : null;
}

// ---------------------------------------------------------------------------
// Entrada e saída da função
// ---------------------------------------------------------------------------

export interface ProcessoParaEtapas {
  contratacao_direta: boolean;
  fase: string;
  situacao?: string | null;
}

/** Linha da instrução (`FaseInternaService.getInstrucao().itens`). */
export interface PecaParaEtapas {
  tipo: string;
  titulo: string;
  obrigatorio: boolean;
  /** OK | NAO_SE_APLICA | PENDENTE | EM_ELABORACAO | EM_APROVACAO | EM_ASSINATURA */
  status: string;
  documento_id?: string;
}

/** Modelo que a função precisa (o modelo efetivo do processo). */
export type ModeloParaEtapas = Pick<ModeloFluxo, 'etapas' | 'aprovacao_demanda'>;

/** Marca registrada no estado do fluxo do processo (quem, quando, por quê). */
export interface MarcaEtapa {
  em: string;
  por_id?: string | null;
  por_nome?: string | null;
  motivo?: string | null;
  texto?: string | null;
  origem?: string | null;
  /** F3: despacho da etapa de registro nos autos (folha). */
  despacho?: { id: string; folha_inicial: number | null; folha_final: number | null; url: string } | null;
}

/**
 * ESTADO DO FLUXO DO PROCESSO (F1 — tabela `fluxos_processo_fase_interna`):
 *  - demanda_aprovada: sem ela, a etapa da demanda não conclui e as demais aguardam;
 *  - reabertas: etapa reaberta ("voltar") — não conclui até ser revista;
 *  - a_revisar: estava concluída e depende de uma reaberta;
 *  - registros: despacho das etapas que concluem por registro.
 * Ausente = sem marcas e demanda aprovada (comportamento de antes da F1).
 */
export interface EstadoFluxoParaEtapas {
  demanda_aprovada?: boolean;
  reabertas?: Record<string, MarcaEtapa>;
  a_revisar?: Record<string, MarcaEtapa>;
  registros?: Record<string, MarcaEtapa>;
}

/** Pendências de portão por passo: ex.: { PESQUISA: ['LIM-01 …'] }. */
export type BloqueiosDePortao = Partial<Record<string, string[]>>;

export interface PecaDoPasso {
  tipo: string;
  titulo: string;
  obrigatorio: boolean;
  status: string;
  pronta: boolean;
  documento_id: string | null;
}

export interface PassoCalculado {
  passo: PassoFaseInterna;
  etapa: EtapaFaseInterna;
  titulo: string;
  situacao: SituacaoPasso;
  pecas: PecaDoPasso[];
  /** Dependências (efetivas, entre as etapas ativas do processo). */
  depende_de: PassoFaseInterna[];
  /** Dependências ainda não cumpridas. */
  pendencias: PassoFaseInterna[];
  /**
   * Pode iniciar? Todas as dependências cumpridas E — antes de tudo — a
   * demanda aprovada (só a etapa da demanda anda antes da aprovação; pedido do
   * dono, 26/09/2026). Etapas independentes correm em paralelo.
   */
  pode_iniciar: boolean;
  /** Etapa que espera a aprovação da demanda (qualquer uma, menos a da própria demanda). */
  aguardando_demanda: boolean;
  /** Primeira peça ainda não pronta (destino do botão da tarefa). */
  peca_pendente: string | null;
  portao: Portao | null;
  /** Pendências do portão que seguram a conclusão do passo (portão A). */
  bloqueio_portao: string[];
  /** Do modelo (F1). */
  conclusao: ConclusaoEtapa;
  obrigatoria: boolean;
  opcional: boolean;
  fundamento: string | null;
  tela: string | null;
  ia_rascunho: boolean;
  aprovacao_interna: boolean;
  dispensavel_por_ato: boolean;
  /** A peça está pronta mas a demanda ainda não foi aprovada (etapa da aprovação). */
  aguardando_aprovacao: boolean;
  reaberta: MarcaEtapa | null;
  a_revisar: MarcaEtapa | null;
  registro: MarcaEtapa | null;
}

export interface EtapaCalculada {
  etapa: EtapaFaseInterna;
  numero: number;
  titulo: string;
  situacao: SituacaoEtapa;
  /** Todas as peças da etapa marcadas "não se aplica". */
  nao_se_aplica: boolean;
  fase_maquina: FaseLicitacao;
  passos: PassoCalculado[];
}

const STATUS_PRONTA = new Set(['OK', 'NAO_SE_APLICA']);
const STATUS_EM_ANDAMENTO = new Set(['EM_ELABORACAO', 'EM_APROVACAO', 'EM_ASSINATURA']);
const SITUACOES_CANCELAM = new Set(['REVOGADA', 'ANULADA']);
const FASES_INTERNAS = new Set<string>([
  FaseLicitacao.PLANEJAMENTO,
  FaseLicitacao.TERMO_REFERENCIA,
  FaseLicitacao.PESQUISA_PRECOS,
  FaseLicitacao.ANALISE_JURIDICA,
  FaseLicitacao.APROVACAO_INTERNA,
]);
/** Situações que cumprem a dependência (a etapa seguinte pode começar). */
const CUMPRE_DEPENDENCIA = new Set<SituacaoPasso>(['CONCLUIDO', 'NAO_REALIZADO']);

/** A peça conta como pronta para a etapa (anexada, assinada, OK ou não se aplica)? */
export function pecaProntaParaEtapa(status: string): boolean {
  return STATUS_PRONTA.has(status);
}

/**
 * ETAPAS DA FASE INTERNA — situação de cada etapa e passo, derivada das peças
 * (instrução), das dependências do MODELO e do estado do fluxo. Pura: mesmo
 * resultado para a mesma entrada.
 *
 *  - Passo com peças: CONCLUIDO quando todas estão prontas; EM_ANDAMENTO quando
 *    alguma começou; senão DISPONIVEL (dependências cumpridas) ou AGUARDANDO.
 *  - Passo sem peça na instrução do processo (ex.: minutas no rito completo)
 *    não aparece; dependência dele conta como cumprida. Etapa DESLIGADA no
 *    modelo não aparece e é "atravessada" (quem dependia dela passa a
 *    depender das dependências dela).
 *  - Etapa de REGISTRO (sem peça própria): CONCLUIDO com o despacho registrado.
 *  - Publicação (DIVULGACAO): EM_ANDAMENTO enquanto aguarda a confirmação do
 *    PNCP; CONCLUIDO com a divulgação confirmada.
 *  - Aprovação da demanda exigida e ainda não dada: a etapa da demanda fica
 *    EM_ANDAMENTO (aguardando_aprovacao) e as demais aguardam.
 *  - Reaberta: não conclui (EM_ANDAMENTO); a revisar: A_REVISAR.
 *  - Processo divulgado: o que não ficou pronto vira NAO_REALIZADO; revogado
 *    ou anulado na fase interna: CANCELADO.
 */
export function etapasDaFaseInterna(
  processo: ProcessoParaEtapas,
  pecas: PecaParaEtapas[],
  modelo: ModeloParaEtapas,
  bloqueios: BloqueiosDePortao = {},
  estado: EstadoFluxoParaEtapas = {},
): EtapaCalculada[] {
  const faseInterna = FASES_INTERNAS.has(processo.fase);
  // Entrega 5: PUBLICAR leva a AGUARDANDO_DIVULGACAO — a publicação só conclui
  // com a CONFIRMAÇÃO do PNCP (ou do diário oficial, sem PNCP).
  const aguardandoDivulgacao = processo.fase === FaseLicitacao.AGUARDANDO_DIVULGACAO;
  const cancelado = SITUACOES_CANCELAM.has(String(processo.situacao ?? '')) && (faseInterna || aguardandoDivulgacao);
  const divulgado = !faseInterna;
  // Marcas do fluxo (reaberta, a revisar, aprovação) só valem com o processo andando na fase interna
  const vivo = faseInterna && !cancelado;
  const reabertas = vivo ? estado.reabertas ?? {} : {};
  const aRevisar = vivo ? estado.a_revisar ?? {} : {};
  const registros = estado.registros ?? {};
  const aprovacao = modelo.aprovacao_demanda;
  const faltaAprovacao = vivo && !!aprovacao?.exigida && estado.demanda_aprovada === false;

  // Peças por passo (na ordem da instrução); peça de etapa desligada não entra
  const pecasPorPasso = new Map<string, PecaDoPasso[]>();
  for (const p of pecas) {
    const e = modelo.etapas.find((x) => x.tipos_peca.includes(p.tipo));
    if (!e || !e.ligada) continue;
    const lista = pecasPorPasso.get(e.codigo) ?? [];
    lista.push({
      tipo: p.tipo,
      titulo: p.titulo,
      obrigatorio: !!p.obrigatorio,
      status: p.status,
      pronta: pecaProntaParaEtapa(p.status),
      documento_id: p.documento_id ?? null,
    });
    pecasPorPasso.set(e.codigo, lista);
  }

  // Opcional ligada DEPOIS que o processo nasceu: só entra se nenhuma etapa
  // que depende dela começou (o caminho já percorrido não muda)
  const comecou = (c: string) => (pecasPorPasso.get(c) ?? []).some((x) => x.pronta || STATUS_EM_ANDAMENTO.has(x.status)) || !!registros[c];
  let etapasModelo = modelo.etapas;
  const tardias = etapasModelo.filter((e) => e.ligada && e.entrou_depois && !comecou(e.codigo));
  if (tardias.length) {
    const fora = new Set(tardias.filter((e) => dependentesDe(etapasModelo, e.codigo).some(comecou)).map((e) => e.codigo));
    if (fora.size) {
      etapasModelo = etapasModelo.map((e) => (fora.has(e.codigo) ? { ...e, ligada: false } : e));
      for (const c of fora) pecasPorPasso.delete(c);
    }
  }

  const ativa = (e: EtapaDoModelo) => e.ligada && (e.conclusao !== 'PECAS' || (pecasPorPasso.get(e.codigo) ?? []).length > 0);
  const efetivas = dependenciasEfetivas(etapasModelo);
  const passosAtivos = ordemTopologica(etapasModelo.filter(ativa).map((e) => ({ ...e, depende_de: efetivas.get(e.codigo) ?? [] })));
  const ativos = new Set(passosAtivos.map((e) => e.codigo));

  const calculados = new Map<string, PassoCalculado>();
  for (const def of passosAtivos) {
    const codigo = def.codigo;
    const lista = pecasPorPasso.get(codigo) ?? [];
    const depende = def.depende_de.filter((d) => ativos.has(d)) as PassoFaseInterna[];
    const pendencias = depende.filter((d) => !CUMPRE_DEPENDENCIA.has(calculados.get(d)?.situacao as SituacaoPasso));
    const reaberta = reabertas[codigo] ?? null;
    const revisar = aRevisar[codigo] ?? null;
    let aguardandoAprovacao = false;
    // Antes da aprovação da demanda, só a etapa da demanda anda
    const aguardandoDemanda = faltaAprovacao && codigo !== aprovacao.etapa;
    const livre = pendencias.length === 0 && !aguardandoDemanda;

    let situacao: SituacaoPasso;
    if (def.conclusao === 'DIVULGACAO') {
      situacao = cancelado
        ? 'CANCELADO'
        : aguardandoDivulgacao
          ? 'EM_ANDAMENTO'
          : divulgado
            ? 'CONCLUIDO'
            : reaberta
              ? 'EM_ANDAMENTO'
              : livre
                ? 'DISPONIVEL'
                : 'AGUARDANDO';
    } else if (def.conclusao === 'REGISTRO') {
      const registrado = !!registros[codigo] && !reaberta;
      if (registrado) situacao = revisar ? 'A_REVISAR' : 'CONCLUIDO';
      else if (cancelado && faseInterna) situacao = 'CANCELADO';
      else if (divulgado) situacao = 'NAO_REALIZADO';
      else if (reaberta) situacao = 'EM_ANDAMENTO';
      else situacao = livre ? 'DISPONIVEL' : 'AGUARDANDO';
    } else {
      // Portão A: com LIM-01 aberto a pesquisa não conclui, mesmo com a peça pronta
      const barrado = (bloqueios[codigo] ?? []).length > 0 && !divulgado && !cancelado;
      const todas = lista.every((x) => x.pronta) && !barrado;
      aguardandoAprovacao = todas && faltaAprovacao && codigo === aprovacao.etapa;
      const comecou = lista.some((x) => x.pronta || STATUS_EM_ANDAMENTO.has(x.status));
      if (todas && !aguardandoAprovacao && !reaberta) situacao = revisar ? 'A_REVISAR' : 'CONCLUIDO';
      else if (cancelado && faseInterna) situacao = 'CANCELADO';
      else if (divulgado) situacao = 'NAO_REALIZADO';
      else if (comecou || aguardandoAprovacao || reaberta) situacao = 'EM_ANDAMENTO';
      else situacao = livre ? 'DISPONIVEL' : 'AGUARDANDO';
    }

    calculados.set(codigo, {
      passo: codigo as PassoFaseInterna,
      etapa: def.grupo as EtapaFaseInterna,
      titulo: def.titulo,
      situacao,
      pecas: lista,
      depende_de: depende,
      pendencias,
      pode_iniciar: livre,
      aguardando_demanda: aguardandoDemanda,
      peca_pendente: lista.find((x) => !x.pronta)?.tipo ?? null,
      portao: (def.portao as Portao) ?? null,
      bloqueio_portao: bloqueios[codigo] ?? [],
      conclusao: def.conclusao,
      obrigatoria: def.obrigatoria,
      opcional: !def.obrigatoria,
      fundamento: def.fundamento ?? null,
      tela: def.tela ?? null,
      ia_rascunho: !!def.ia_rascunho,
      aprovacao_interna: !!def.aprovacao_interna,
      dispensavel_por_ato: !!def.dispensavel_por_ato,
      aguardando_aprovacao: aguardandoAprovacao,
      reaberta,
      a_revisar: situacao === 'A_REVISAR' ? revisar : null,
      registro: registros[codigo] ?? null,
    });
  }

  // Etapas (grupos) na ordem sugerida: a menor ordem dos passos ativos do grupo
  const grupos = new Map<string, { ordem: number; titulo: string; fase: string }>();
  for (const e of passosAtivos) {
    const g = grupos.get(e.grupo);
    if (!g || e.ordem < g.ordem) grupos.set(e.grupo, { ordem: e.ordem, titulo: e.grupo_titulo, fase: e.fase_maquina });
  }
  const ordemGrupos = [...grupos.entries()].sort((a, b) => a[1].ordem - b[1].ordem || a[0].localeCompare(b[0]));
  const etapas: EtapaCalculada[] = [];
  for (const [grupo, info] of ordemGrupos) {
    const passos = passosAtivos.filter((p) => p.grupo === grupo).map((p) => calculados.get(p.codigo)!);
    if (!passos.length) continue;
    const todasPecas = passos.flatMap((p) => p.pecas);
    etapas.push({
      etapa: grupo as EtapaFaseInterna,
      numero: etapas.length + 1,
      titulo: info.titulo || TITULO_ETAPA[grupo as EtapaFaseInterna] || grupo,
      situacao: situacaoDaEtapa(passos.map((p) => p.situacao)),
      nao_se_aplica: todasPecas.length > 0 && todasPecas.every((x) => x.status === 'NAO_SE_APLICA'),
      fase_maquina: (info.fase as FaseLicitacao) ?? FASE_MAQUINA_DA_ETAPA[grupo as EtapaFaseInterna],
      passos,
    });
  }
  return etapas;
}

export function situacaoDaEtapa(passos: SituacaoPasso[]): SituacaoEtapa {
  if (passos.every((s) => s === 'CONCLUIDO')) return 'CONCLUIDA';
  if (passos.some((s) => s === 'CANCELADO')) return 'CANCELADA';
  if (passos.every((s) => s === 'CONCLUIDO' || s === 'NAO_REALIZADO')) return 'NAO_REALIZADA';
  if (passos.some((s) => s === 'A_REVISAR')) return 'A_REVISAR';
  if (passos.some((s) => s === 'EM_ANDAMENTO' || s === 'CONCLUIDO')) return 'EM_ANDAMENTO';
  if (passos.some((s) => s === 'DISPONIVEL')) return 'DISPONIVEL';
  return 'AGUARDANDO';
}

/**
 * ETAPA ATUAL (derivada, nunca gravada): a primeira, na ordem sugerida, que
 * está em andamento, a revisar ou disponível. null = nada a fazer.
 */
export function etapaAtual(etapas: EtapaCalculada[]): EtapaCalculada | null {
  return etapas.find((e) => e.situacao === 'EM_ANDAMENTO' || e.situacao === 'A_REVISAR' || e.situacao === 'DISPONIVEL') ?? null;
}

/** Todos os passos, na ordem das etapas. */
export function passosDasEtapas(etapas: EtapaCalculada[]): PassoCalculado[] {
  return etapas.flatMap((e) => e.passos);
}
