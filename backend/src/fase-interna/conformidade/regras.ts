/**
 * MOTOR DE CONFORMIDADE — AS REGRAS (Entrega 4; SPEC §4 com as correções do
 * plano §5.1). Cada regra é uma função PURA `(contexto) => AchadoCalculado[]`,
 * registrada em `REGRAS` com código, descrição, severidade, etapa e portão.
 *
 *  Portão A — limite e fracionamento (etapa 4, pesquisa): LIM-01, LIM-02.
 *  Portão B — art. 72 (etapa 6, autorização): A72-I, A72-II, A72-IV (V e VI
 *            são da fase externa e não bloqueiam; III, VII e VIII conferidos
 *            antes de publicar).
 *  Portão C — antes de publicar (etapa 8): ENQ-01, VINC-01, MARCA-01,
 *            PRECO-01..04, CRONO-01, LEI-01, EXERC-01, DUP-01, ASS-01,
 *            PRAZO-01, MINUTA-DESAT, SIGILO-01, ART92-01, DISP-01 (Entrega 5).
 *
 * Reaproveita, sem duplicar: `detectarIndicacaoMarca` (E3A), os alertas da
 * cotação (`alertasDaCotacao`/`propostasDiretas`, E3A), `portaoBArt72` e as
 * conferências de texto (E3B, movidas para `art72.ts`/`texto.ts`), as
 * dependências das etapas (E2) e `avaliarPrazosDePublicacao` (calendário do
 * órgão — a mesma função da pré-condição do PUBLICAR).
 */
import { diasUteisEntre } from '../../common/prazos/dias-uteis';
import { avaliarPrazosDePublicacao, fimDoRecebimento, formatarDataBrasilia } from '../../publicacao/regras-publicacao';
import { detectarIndicacaoMarca } from '../telas/etp-analise';
import { propostasDiretas } from '../telas/pesquisa-regras';
import { PassoFaseInterna, dependenciasDoPasso, passoDaPeca } from '../tarefas/etapas-fase-interna';
import { INCISOS_ART72, PRONTA, descreverFaltantes, situacaoDasPecasDoArt72 } from './art72';
import { leisOrcamentariasCitadas, ocorrenciasDeOutroProcesso, ocorrenciasDoArt75, textoPuro } from './texto';
import type { AchadoCalculado, ContextoConformidade, Evidencia, PecaConformidade, Regra } from './tipos';

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export const BRL = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** AAAA-MM-DD → DD/MM/AAAA. */
export const diaBr = (dia: string | null | undefined) => {
  const m = String(dia ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};

const pct = (n: number) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** "1141/2024" → "1.141/2024". */
const numeroLeiBr = (n: string) => {
  const [num, ano] = n.split('/');
  return `${Number(num).toLocaleString('pt-BR')}/${ano}`;
};

/** Peças ativas (fora as "não se aplica"). */
const ativas = (ctx: ContextoConformidade) => ctx.pecas.filter((p) => !p.nao_se_aplica);
const doTipo = (ctx: ContextoConformidade, ...tipos: string[]) => ativas(ctx).filter((p) => tipos.includes(p.tipo));

/** Rótulo curto da folha: "fl. 12" / "fls. 12–15". */
export const rotuloFolhas = (p: { folha_inicial: number | null; folha_final: number | null }) =>
  p.folha_inicial == null ? '' : p.folha_final && p.folha_final !== p.folha_inicial ? `fls. ${p.folha_inicial}–${p.folha_final}` : `fl. ${p.folha_inicial}`;

export function evidenciaDaPeca(p: PecaConformidade, folha?: number | null, trecho?: string | null): Evidencia {
  return { documento_id: p.documento_id, tipo: p.tipo, titulo: p.titulo, folha: folha ?? p.folha_inicial ?? null, trecho: trecho ?? null };
}

/** "Relatório do agente (fl. 39)". */
const ondeEsta = (e: Evidencia) => `${e.titulo}${e.folha != null ? ` (fl. ${e.folha})` : ''}`;

/** A autorização (AA) já foi dada (assinada ou anexada)? */
export const autorizacaoPraticada = (ctx: ContextoConformidade) => {
  const aa = ctx.instrucao.find((i) => i.tipo === 'AA');
  return !!aa && PRONTA.has(aa.status);
};

const naoDireta = (ctx: ContextoConformidade) =>
  ctx.processo.contratacao_direta ? null : 'Rito completo: a instrução é a do art. 18 (cobrada pelas etapas da fase interna).';

/** Divulgação prevista (AAAA-MM-DD): a data do cronograma, a da pesquisa ou nenhuma. */
export function publicacaoPrevista(ctx: ContextoConformidade): string | null {
  const c = ctx.processo.cronograma.data_publicacao_edital;
  if (c) return diaEmBrasiliaIso(c);
  return ctx.pesquisa?.publicacao_prevista ?? null;
}

export function diaEmBrasiliaIso(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// PORTÃO A — limite e fracionamento (etapa 4)
// ---------------------------------------------------------------------------

const rotuloRamo = (classe: string, ug: string) => {
  const [tipo, resto] = classe.split(':');
  const natureza = tipo === 'SERVICO' ? 'serviços' : 'materiais';
  const codigo = String(resto ?? '');
  const cls = codigo === 'SEM_CODIGO' ? `sem código CATMAT/CATSER (${natureza})` : codigo.startsWith('COD:') ? `código ${codigo.slice(4)} (${natureza})` : `classe ${codigo} (${natureza})`;
  return `${cls}${ug ? `, unidade gestora ${ug}` : ''}`;
};

const limiteNaoAplicavel = (ctx: ContextoConformidade) => {
  if (!ctx.limite) return 'Consumo do limite indisponível.';
  if (!ctx.limite.aplicavel) return ctx.limite.motivo ?? 'Não é dispensa por valor (art. 75, I ou II).';
  if (!ctx.limite.limite) return 'Sem o limite do exercício cadastrado.';
  return null;
};

const evidenciasDaPesquisa = (ctx: ContextoConformidade) => doTipo(ctx, 'PP').slice(0, 1).map((p) => evidenciaDaPeca(p));

export const LIM_01: Regra = {
  codigo: 'LIM-01',
  descricao: 'Soma das dispensas do órgão no exercício, no mesmo ramo (classe CATMAT/CATSER + unidade gestora), dentro do limite do inciso (art. 75, §1º)',
  severidade: 'BLOQUEIO',
  etapa: 'PESQUISA',
  portao: 'A',
  aplicavel: limiteNaoAplicavel,
  avaliar(ctx) {
    const l = ctx.limite!;
    const lim = l.limite!;
    return l.ramos
      .filter((r) => r.excede)
      .map((r) => ({
        regra: 'LIM-01',
        chave: `ramo:${r.ramo.classe}|${r.ramo.unidade_gestora}`,
        severidade: 'BLOQUEIO' as const,
        titulo: 'Limite da dispensa ultrapassado no ramo (fracionamento)',
        mensagem:
          `Soma das dispensas do órgão em ${l.exercicio} no ramo ${rotuloRamo(r.ramo.classe, r.ramo.unidade_gestora)}: ${BRL(r.total)} ` +
          `(${r.quantidade_processos} processo(s), este incluído — deste: ${BRL(r.deste_processo)}; dos demais: ${BRL(r.outros_processos)}), ` +
          `acima do limite do ${l.fundamento_referencia ?? `art. 75, ${l.inciso}`} de ${BRL(lim.valor)} (${lim.ato_normativo}${lim.provisorio ? ', provisório' : ''}). ` +
          'O fracionamento é vedado (art. 75, §1º): reveja o objeto e as quantidades ou adote a licitação.',
        evidencias: evidenciasDaPesquisa(ctx),
        tipo_peca_responsavel: 'PP',
        acao: 'CORRIGIR_PECA' as const,
      }));
  },
};

export const LIM_02: Regra = {
  codigo: 'LIM-02',
  descricao: 'Consumo do limite da dispensa acima de 80% no ramo',
  severidade: 'ATENCAO',
  etapa: 'PESQUISA',
  portao: 'A',
  aplicavel: limiteNaoAplicavel,
  avaliar(ctx) {
    const l = ctx.limite!;
    const lim = l.limite!;
    return l.ramos
      .filter((r) => !r.excede && r.percentual > 80)
      .map((r) => ({
        regra: 'LIM-02',
        chave: `ramo:${r.ramo.classe}|${r.ramo.unidade_gestora}`,
        severidade: 'ATENCAO' as const,
        titulo: 'Limite da dispensa quase esgotado no ramo',
        mensagem:
          `${pct(r.percentual)} de ${BRL(lim.valor)} — ${lim.ato_normativo} (${l.fundamento_referencia ?? `art. 75, ${l.inciso}`}, exercício ${l.exercicio}). ` +
          `Ramo ${rotuloRamo(r.ramo.classe, r.ramo.unidade_gestora)}: ${BRL(r.total)} somados (${r.quantidade_processos} processo(s)). ` +
          'Novas dispensas do mesmo ramo no exercício podem configurar fracionamento (art. 75, §1º).',
        evidencias: evidenciasDaPesquisa(ctx),
        tipo_peca_responsavel: 'PP',
        acao: 'JUSTIFICAR' as const,
      }));
  },
};

// ---------------------------------------------------------------------------
// PORTÃO B — art. 72 (etapa 6)
// ---------------------------------------------------------------------------

function regraArt72(inciso: string, opcoes: { severidade: 'BLOQUEIO' | 'ATENCAO'; etapa: 'AUTORIZACAO' | 'PUBLICACAO'; portao: 'B' | 'C'; tipos?: string[]; garantida_no_ato?: boolean }): Regra {
  const def = INCISOS_ART72.find((i) => i.inciso === inciso)!;
  const tipos = opcoes.tipos ?? def.tipos;
  const codigo = `A72-${inciso}`;
  const antesDeAutorizar = def.momento === 'ANTES';
  return {
    codigo,
    descricao: `Art. 72, ${inciso} — ${def.texto}`,
    severidade: opcoes.severidade,
    etapa: opcoes.etapa,
    portao: opcoes.portao,
    garantida_no_ato: opcoes.garantida_no_ato,
    // A peça pendente já é a tarefa da etapa (E2): o achado não cria outra
    sem_tarefa: true,
    aplicavel(ctx) {
      const rito = naoDireta(ctx);
      if (rito) return rito;
      if (def.momento === 'FASE_EXTERNA' && !opcoes.tipos) return 'Fase externa — não bloqueia a fase interna.';
      // Portão B: vale para o ATO de autorizar; autorização já dada = portão superado
      if (antesDeAutorizar && autorizacaoPraticada(ctx) && ctx.ato_pretendido !== 'AUTORIZAR') return 'A autorização já foi dada (o portão B é conferido antes de autorizar).';
      // Depois da autorização: parecer e justificativa de preço (III e VII)
      if (!antesDeAutorizar && inciso !== 'VIII' && !autorizacaoPraticada(ctx) && ctx.ato_pretendido !== 'PUBLICAR') return 'Conferido depois da autorização, antes de publicar.';
      return null;
    },
    avaliar(ctx) {
      const s = situacaoDasPecasDoArt72(ctx.instrucao, tipos, def.texto);
      if (s.situacao !== 'PENDENTE') return [];
      const evid: Evidencia[] = s.faltam.map((f) => {
        const p = ctx.pecas.find((x) => x.tipo === f.tipo);
        return p ? evidenciaDaPeca(p) : { documento_id: f.documento_id ?? null, tipo: f.tipo, titulo: f.titulo, folha: null, trecho: null };
      });
      const falta = descreverFaltantes(s.faltam);
      const complemento =
        inciso === 'VIII'
          ? 'Sem a autorização não se publica.'
          : antesDeAutorizar
            ? 'Sem isso a autoridade não autoriza (portão B): faça, anexe ou marque "não se aplica" quando a lei permitir.'
            : 'Junte a peça ou registre por que não se aplica.';
      return [
        {
          regra: codigo,
          chave: `inciso:${inciso}`,
          severidade: opcoes.severidade,
          titulo: `Art. 72, ${inciso} incompleto`,
          mensagem: `Art. 72, ${inciso} — ${def.texto}: falta ${falta}. ${complemento}`,
          evidencias: evid,
          tipo_peca_responsavel: s.faltam[0]?.tipo ?? null,
          acao: 'CORRIGIR_PECA',
        },
      ];
    },
  };
}

export const A72_I = regraArt72('I', { severidade: 'BLOQUEIO', etapa: 'AUTORIZACAO', portao: 'B' });
export const A72_II = regraArt72('II', { severidade: 'BLOQUEIO', etapa: 'AUTORIZACAO', portao: 'B' });
export const A72_III = regraArt72('III', { severidade: 'ATENCAO', etapa: 'PUBLICACAO', portao: 'C' });
export const A72_IV = regraArt72('IV', { severidade: 'BLOQUEIO', etapa: 'AUTORIZACAO', portao: 'B' });
export const A72_V = regraArt72('V', { severidade: 'ATENCAO', etapa: 'PUBLICACAO', portao: 'C' });
export const A72_VI = regraArt72('VI', { severidade: 'ATENCAO', etapa: 'PUBLICACAO', portao: 'C' });
/** Justificativa de preço (relatório do agente / justificativa): conferida antes de publicar, sem bloquear. */
export const A72_VII = regraArt72('VII', { severidade: 'ATENCAO', etapa: 'PUBLICACAO', portao: 'C', tipos: ['RAG', 'JC'] });
/** A autorização é peça obrigatória: a pré-condição de instrução do PUBLICAR já a exige (uma mensagem só). */
export const A72_VIII = regraArt72('VIII', { severidade: 'BLOQUEIO', etapa: 'PUBLICACAO', portao: 'C', garantida_no_ato: true });

// ---------------------------------------------------------------------------
// PORTÃO C — antes de publicar (etapa 8)
// ---------------------------------------------------------------------------

/** ENQ-01 — o inciso do art. 75 citado em cada peça é o do processo. */
export const ENQ_01: Regra = {
  codigo: 'ENQ-01',
  descricao: 'Mesmo inciso do art. 75 em todas as peças e no fundamento legal do processo',
  severidade: 'BLOQUEIO',
  etapa: 'PUBLICACAO',
  portao: 'C',
  aplicavel: (ctx) => (ctx.processo.inciso_art75 ? null : `Fundamento fora do art. 75 (${ctx.processo.fundamento_referencia ?? 'sem fundamento'}).`),
  avaliar(ctx) {
    const proprio = ctx.processo.inciso_art75!;
    const porInciso = new Map<string, Evidencia[]>();
    for (const p of ativas(ctx)) {
      for (const o of ocorrenciasDoArt75(p.paginas)) {
        if (o.inciso === proprio) continue;
        const lista = porInciso.get(o.inciso) ?? [];
        if (!lista.some((e) => e.documento_id === p.documento_id && e.folha === o.folha)) lista.push(evidenciaDaPeca(p, o.folha, o.trecho));
        porInciso.set(o.inciso, lista);
      }
    }
    const certas = ativas(ctx)
      .filter((p) => ocorrenciasDoArt75(p.paginas).some((o) => o.inciso === proprio))
      .map((p) => `${p.titulo}${p.folha_inicial != null ? ` (fl. ${p.folha_inicial})` : ''}`);
    return [...porInciso.entries()].map(([inciso, evid]) => ({
      regra: 'ENQ-01',
      chave: `inciso:${inciso}`,
      severidade: 'BLOQUEIO' as const,
      titulo: 'Enquadramento divergente entre as peças',
      mensagem:
        `O processo é do ${ctx.processo.fundamento_referencia} (fundamento legal do processo), mas ${evid.length === 1 ? 'uma peça cita' : `${evid.length} trechos citam`} o inciso ${inciso}: ` +
        `${evid.map(ondeEsta).join('; ')}${certas.length ? ` — × ${certas.join('; ')} (inciso ${proprio})` : ''}. ` +
        'Todas as peças devem citar o mesmo inciso: as geradas pelo modelo leem o fundamento do processo (regere); corrija as editadas e as anexadas.',
      evidencias: evid,
      tipo_peca_responsavel: evid[0]?.tipo ?? null,
      acao: 'CORRIGIR_PECA' as const,
    }));
  },
};

/** Peças que vinculam o ato ao processo (a ETP/TR/DFD podem citar contratações anteriores legitimamente). */
export const TIPOS_VINCULADOS = ['AA', 'DO', 'RAG', 'ME', 'MC', 'PJ', 'MCI', 'JC'];

/** VINC-01 — peça cita número de PA ou de dispensa de OUTRO processo. */
export const VINC_01: Regra = {
  codigo: 'VINC-01',
  descricao: 'As peças citam o número deste processo (PA e dispensa), nunca o de outro',
  severidade: 'BLOQUEIO',
  etapa: 'PUBLICACAO',
  portao: 'C',
  aplicavel: (ctx) => (ctx.processo.numero_processo ? null : 'Processo sem número.'),
  avaliar(ctx) {
    const proprios = { numero_processo: ctx.processo.numero_processo, numero_dispensa: ctx.processo.numero_dispensa };
    const porTipo = new Map<string, { refs: Set<string>; evid: Evidencia[]; titulo: string }>();
    for (const p of doTipo(ctx, ...TIPOS_VINCULADOS)) {
      for (const o of ocorrenciasDeOutroProcesso(p.paginas, proprios)) {
        const g = porTipo.get(p.tipo) ?? { refs: new Set<string>(), evid: [], titulo: p.titulo };
        g.refs.add(o.referencia);
        if (!g.evid.some((e) => e.documento_id === p.documento_id && e.folha === o.folha && e.trecho === o.trecho)) g.evid.push(evidenciaDaPeca(p, o.folha, o.trecho));
        porTipo.set(p.tipo, g);
      }
    }
    const proprio = `PA ${ctx.processo.numero_processo}${ctx.processo.numero_dispensa ? ` · nº ${ctx.processo.numero_dispensa}` : ''}`;
    return [...porTipo.entries()].map(([tipo, g]) => ({
      regra: 'VINC-01',
      chave: `peca:${tipo}`,
      severidade: 'BLOQUEIO' as const,
      titulo: 'Peça vinculada a outro processo',
      mensagem: `${g.titulo} cita ${[...g.refs].join(' e ')}, que não é este processo (${proprio}) — resto de outro processo. Corrija a vinculação (ou regere a peça pelo modelo).`,
      evidencias: g.evid,
      tipo_peca_responsavel: tipo,
      acao: 'CORRIGIR_PECA' as const,
    }));
  },
};

/** MARCA-01 — marca citada: sem a forma de referência e sem justificativa → bloqueio; "ou similar/equivalente" → atenção com justificativa. */
export const MARCA_01: Regra = {
  codigo: 'MARCA-01',
  descricao: 'Indicação de marca só como referência ("ou similar/equivalente") e justificada (art. 41, I)',
  severidade: 'BLOQUEIO',
  etapa: 'PUBLICACAO',
  portao: 'C',
  aplicavel: (ctx) => (doTipo(ctx, 'ETP', 'TR').some((p) => p.paginas.length) ? null : 'Sem ETP/TR com texto para conferir.'),
  avaliar(ctx) {
    const justificativa = doTipo(ctx, 'ETP').find((p) => p.justificativa_marca)?.justificativa_marca ?? null;
    const grupos: Record<'BLOQUEIO' | 'ATENCAO', { marcas: Set<string>; evid: Evidencia[]; mensagens: string[] }> = {
      BLOQUEIO: { marcas: new Set(), evid: [], mensagens: [] },
      ATENCAO: { marcas: new Set(), evid: [], mensagens: [] },
    };
    for (const p of doTipo(ctx, 'ETP', 'TR')) {
      // Seções da peça feita aqui; página a página na anexada (a folha vira a chave da seção)
      const secoes: Record<string, string> = {};
      const folhaDaSecao = new Map<string, number | null>();
      p.paginas.forEach((pg, i) => {
        const k = pg.secao ?? `p${i + 1}`;
        secoes[k] = pg.texto;
        folhaDaSecao.set(k, pg.folha);
      });
      for (const a of detectarIndicacaoMarca(secoes, { justificativa })) {
        if (a.severidade === 'JUSTIFICADO') continue;
        const g = grupos[a.severidade];
        g.marcas.add(a.marca);
        g.evid.push(evidenciaDaPeca(p, folhaDaSecao.get(a.secao_id) ?? p.folha_inicial, a.trecho));
        if (!g.mensagens.includes(a.mensagem)) g.mensagens.push(a.mensagem);
      }
    }
    const r: AchadoCalculado[] = [];
    for (const sev of ['BLOQUEIO', 'ATENCAO'] as const) {
      const g = grupos[sev];
      if (!g.marcas.size) continue;
      const marcas = [...g.marcas].sort((a, b) => a.localeCompare(b));
      const onde = [...new Set(g.evid.map((e) => e.tipo))].join(' e ');
      r.push({
        regra: 'MARCA-01',
        chave: `${sev === 'BLOQUEIO' ? 'bloqueio' : 'referencia'}:${marcas.map((m) => m.toLowerCase()).join('|')}`,
        severidade: sev,
        titulo: sev === 'BLOQUEIO' ? 'Indicação de marca sem justificativa (art. 41, I)' : 'Marca citada como referência — justifique (art. 41, I)',
        mensagem:
          sev === 'BLOQUEIO'
            ? `${onde} cita(m) ${marcas.map((m) => `"${m}"`).join(', ')} sem "apenas como referência, ou similar/equivalente" e sem a justificativa do art. 41, I: restringe a competição. Reescreva pela função ou registre a justificativa técnica no ETP.`
            : `${onde} cita(m) ${marcas.map((m) => `"${m}"`).join(', ')} como referência ("ou similar/equivalente"). O art. 41, I exige a justificativa formal (padronização, compatibilidade, única que atende ou referência): registre-a no ETP ou justifique aqui.`,
        evidencias: g.evid,
        exige_justificativa: sev === 'ATENCAO',
        tipo_peca_responsavel: g.evid[0]?.tipo ?? 'ETP',
        acao: sev === 'BLOQUEIO' ? 'CORRIGIR_PECA' : 'JUSTIFICAR',
      });
    }
    return r;
  },
};

const refPesquisa = (ctx: ContextoConformidade) => ({ hoje: ctx.hoje, publicacao_prevista: publicacaoPrevista(ctx) });
const semPesquisa = (ctx: ContextoConformidade) => (ctx.pesquisa?.itens?.length ? null : 'Sem pesquisa de preços registrada no sistema (anexada: conferir no PDF).');
const semPropostas = (ctx: ContextoConformidade) => semPesquisa(ctx) ?? (propostasDiretas(ctx.pesquisa!.itens, refPesquisa(ctx)).length ? null : 'Sem cotações diretas (propostas) na pesquisa.');

/** PRECO-01 — o valor estimado é o de UMA cotação, sem média/mediana e sem justificativa do método. */
export const PRECO_01: Regra = {
  codigo: 'PRECO-01',
  descricao: 'Valor estimado igual a uma única cotação só com a justificativa do método (art. 23; IN SEGES 65/2021)',
  severidade: 'ATENCAO',
  etapa: 'PUBLICACAO',
  portao: 'C',
  aplicavel: semPropostas,
  avaliar(ctx) {
    const metodo = ctx.pesquisa!.metodo;
    if (metodo === 'MEDIA' || metodo === 'MEDIANA') return [];
    if (String(ctx.pesquisa!.justificativa_metodo ?? '').trim().length >= 10) return [];
    const valor = Number(ctx.processo.valor_estimado) || 0;
    if (valor <= 0) return [];
    const iguais = propostasDiretas(ctx.pesquisa!.itens, refPesquisa(ctx)).filter((p) => Math.abs(p.total - valor) <= 0.01);
    return iguais.slice(0, 1).map((p) => ({
      regra: 'PRECO-01',
      chave: `forn:${(p.cnpj || p.fornecedor).replace(/\W/g, '').toLowerCase()}`,
      severidade: 'ATENCAO' as const,
      titulo: 'Estimativa adotou uma única cotação',
      mensagem: `O valor estimado (${BRL(valor)}) coincide com a proposta de ${p.fornecedor}${metodo === 'MENOR' ? ' (método: menor preço)' : ''}, sem a justificativa do método. Registre o método e a justificativa na pesquisa (art. 23; IN SEGES 65/2021, art. 6º) ou justifique aqui.`,
      evidencias: [...evidenciasDaPesquisa(ctx).map((e) => ({ ...e, trecho: `Proposta ${p.fornecedor}: ${BRL(p.total)}` }))],
      exige_justificativa: true,
      tipo_peca_responsavel: 'PP',
      acao: 'JUSTIFICAR' as const,
    }));
  },
};

function regraAlertaCotacao(codigo: 'PRECO-02' | 'PRECO-03', alertas: string[], descricao: string, titulo: string): Regra {
  return {
    codigo,
    descricao,
    severidade: 'ATENCAO',
    etapa: 'PUBLICACAO',
    portao: 'C',
    aplicavel: semPropostas,
    avaliar(ctx) {
      return propostasDiretas(ctx.pesquisa!.itens, refPesquisa(ctx))
        .map((p) => ({ p, a: p.alertas.find((x) => alertas.includes(x.codigo)) }))
        .filter((x) => !!x.a)
        .map(({ p, a }) => ({
          regra: codigo,
          chave: `cot:${(p.cnpj || p.fornecedor).replace(/\W/g, '').toLowerCase()}`,
          severidade: 'ATENCAO' as const,
          titulo,
          mensagem: `${p.fornecedor}: ${a!.mensagem}`,
          evidencias: evidenciasDaPesquisa(ctx).map((e) => ({ ...e, trecho: `Proposta ${p.fornecedor} — emissão ${diaBr(p.data_emissao)}, validade ${diaBr(p.validade_ate)}` })),
          tipo_peca_responsavel: 'PP',
          acao: 'JUSTIFICAR' as const,
        }));
    },
  };
}

export const PRECO_02 = regraAlertaCotacao('PRECO-02', ['VENCE_ANTES_DA_PUBLICACAO', 'VENCIDA'], 'Cotação válida até a publicação prevista', 'Cotação vence antes da publicação');
export const PRECO_03 = regraAlertaCotacao('PRECO-03', ['EMITIDA_HA_MAIS_DE_6_MESES'], 'Cotação emitida há no máximo 6 meses (art. 23, §1º, IV)', 'Cotação com mais de 6 meses');

/** Total apurado pela pesquisa emitida (Σ valor de referência × quantidade) — null sem pesquisa emitida. */
export function totalDaPesquisa(itens: Array<{ valor_referencial?: number | null; quantidade?: number | null }> | null | undefined): number | null {
  const com = (itens ?? []).filter((i) => Number(i?.valor_referencial) > 0 && Number(i?.quantidade) > 0);
  if (!com.length) return null;
  return Math.round(com.reduce((s, i) => s + Math.round(Number(i.valor_referencial) * Number(i.quantidade) * 100) / 100, 0) * 100) / 100;
}

/** Valores em reais citados num texto ("R$ 24.000,00" → 24000). */
export function valoresEmReais(texto: string): number[] {
  return [...String(texto ?? '').matchAll(/R\$\s?(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/g)].map((m) => Number(`${m[1].replace(/\./g, '')}.${m[2]}`));
}

/**
 * PRECO-04 (homologação de 26/09/2026) — o TR feito no sistema cita um valor
 * estimado diferente do apurado na pesquisa de preços. O valor estimado do TR
 * é o da pesquisa (art. 6º, XXIII, "i", e art. 23): TR gerado antes da
 * pesquisa precisa ser gerado de novo. Só atenção (o TR pode citar o valor
 * de outra forma); no sigilo (art. 24) o TR não traz o valor.
 */
export const PRECO_04: Regra = {
  codigo: 'PRECO-04',
  descricao: 'Valor estimado do termo de referência igual ao da pesquisa de preços (art. 6º, XXIII, "i"; art. 23)',
  severidade: 'ATENCAO',
  etapa: 'PUBLICACAO',
  portao: 'C',
  aplicavel(ctx) {
    if (ctx.processo.sigiloso) return 'Orçamento sigiloso: o TR não traz o valor (art. 24).';
    if (totalDaPesquisa(ctx.pesquisa?.itens) === null) return 'Sem pesquisa de preços emitida no sistema.';
    const tr = doTipo(ctx, 'TR')[0];
    if (!tr) return 'Sem termo de referência (ou "não se aplica").';
    if (tr.anexada) return 'TR anexado — conferir o valor no PDF.';
    return null;
  },
  avaliar(ctx) {
    const tr = doTipo(ctx, 'TR')[0];
    const total = totalDaPesquisa(ctx.pesquisa?.itens)!;
    const texto = String(tr.secoes?.estimativa_valor_tr ?? '');
    const citados = valoresEmReais(texto);
    if (!citados.length || citados.some((v) => Math.abs(v - total) <= 0.05)) return [];
    return [
      {
        regra: 'PRECO-04',
        chave: 'TR',
        severidade: 'ATENCAO',
        titulo: 'TR com valor diferente da pesquisa',
        mensagem: `O termo de referência cita ${citados.map((v) => BRL(v)).join(', ')} como valor estimado, mas a pesquisa de preços apurou ${BRL(total)}. Gere o TR de novo (versão nova, com o valor da pesquisa) ou justifique.`,
        evidencias: [evidenciaDaPeca(tr, null, textoPuro(texto).slice(0, 200))],
        tipo_peca_responsavel: 'TR',
        acao: 'CORRIGIR_PECA',
      },
    ];
  },
};

/** Peças que não entram na cronologia (documento do órgão reaproveitado em todos os processos). */
const FORA_DA_CRONOLOGIA = new Set(['DP', 'DEA', 'PJE']);

/** CRONO-01 — peça com data anterior à peça que a solicitou (a que vem antes no processo — dependências da E2). */
export const CRONO_01: Regra = {
  codigo: 'CRONO-01',
  descricao: 'Nenhuma peça datada antes da peça que a solicitou',
  severidade: 'ATENCAO',
  etapa: 'PUBLICACAO',
  portao: 'C',
  aplicavel: (ctx) => (ativas(ctx).filter((p) => p.data_documento).length >= 2 ? null : 'Menos de duas peças datadas.'),
  avaliar(ctx) {
    const direta = ctx.processo.contratacao_direta;
    const datadas = ativas(ctx).filter((p) => p.data_documento && !FORA_DA_CRONOLOGIA.has(p.tipo));
    const r: AchadoCalculado[] = [];
    for (const p of datadas) {
      const passo = passoDaPeca(p.tipo, direta);
      if (!passo) continue;
      for (const dep of dependenciasDoPasso(passo, direta)) {
        for (const q of datadas.filter((x) => passoDaPeca(x.tipo, direta) === dep && x.tipo !== p.tipo)) {
          if (p.data_documento! >= q.data_documento!) continue;
          r.push({
            regra: 'CRONO-01',
            chave: `${p.tipo}<${q.tipo}`,
            severidade: 'ATENCAO',
            titulo: 'Cronologia: peça anterior à que a solicitou',
            mensagem: `${p.titulo} tem data ${diaBr(p.data_documento)}, anterior à ${q.titulo} (${diaBr(q.data_documento)}), que vem antes no processo. Confira as datas — a peça anexada guarda a data do documento, não a do envio.`,
            evidencias: [evidenciaDaPeca(p), evidenciaDaPeca(q)],
            tipo_peca_responsavel: p.tipo,
            acao: 'JUSTIFICAR',
          });
        }
      }
    }
    return r;
  },
};

/** LEI-01 — LDO, LOA e PPA com o mesmo número no despacho, na informação orçamentária e no parecer (e na tabela única). */
export const LEI_01: Regra = {
  codigo: 'LEI-01',
  descricao: 'Mesmos números de LDO, LOA e PPA no despacho, na informação orçamentária e no parecer',
  severidade: 'ATENCAO',
  etapa: 'PUBLICACAO',
  portao: 'C',
  aplicavel: (ctx) => (doTipo(ctx, 'AA', 'DO', 'PJ').some((p) => p.paginas.length) ? null : 'Sem despacho, informação orçamentária ou parecer com texto.'),
  avaliar(ctx) {
    const porTipo = new Map<string, Map<string, Evidencia[]>>();
    for (const p of doTipo(ctx, 'AA', 'DO', 'PJ')) {
      for (const c of leisOrcamentariasCitadas(p.paginas)) {
        const m = porTipo.get(c.tipo) ?? new Map<string, Evidencia[]>();
        const lista = m.get(c.numero) ?? [];
        if (!lista.some((e) => e.documento_id === p.documento_id)) lista.push(evidenciaDaPeca(p, c.folha, c.trecho));
        m.set(c.numero, lista);
        porTipo.set(c.tipo, m);
      }
    }
    const r: AchadoCalculado[] = [];
    for (const [tipo, numeros] of porTipo) {
      const tabela = ctx.reserva?.leis?.[tipo as 'LDO' | 'LOA' | 'PPA'] ?? null;
      const todos = new Set([...numeros.keys(), ...(tabela ? [tabela] : [])]);
      if (todos.size < 2) continue;
      const partes = [...numeros.entries()].map(([n, ev]) => `${numeroLeiBr(n)} em ${ev.map(ondeEsta).join(', ')}`);
      r.push({
        regra: 'LEI-01',
        chave: `lei:${tipo}`,
        severidade: 'ATENCAO',
        titulo: `${tipo} citada com números diferentes`,
        mensagem: `${tipo} citada com números diferentes: ${partes.join('; ')}${tabela ? `; tabela do órgão (reserva): ${numeroLeiBr(tabela)}` : ''}. Use sempre a lei da tabela única (escolhida na reserva).`,
        evidencias: [...numeros.values()].flat(),
        tipo_peca_responsavel: [...numeros.values()].flat()[0]?.tipo ?? 'DO',
        acao: 'CORRIGIR_PECA',
      });
    }
    return r;
  },
};

/** Datas previstas da publicação e da contratação (a maior decide o exercício da contratação). */
export function datasPrevistas(ctx: ContextoConformidade): Array<{ rotulo: string; dia: string }> {
  const c = ctx.processo.cronograma;
  const r: Array<{ rotulo: string; dia: string }> = [];
  const add = (rotulo: string, v: string | null | undefined) => {
    const d = diaEmBrasiliaIso(v ?? null);
    if (d) r.push({ rotulo, dia: d });
  };
  add('publicação prevista', publicacaoPrevista(ctx));
  add('fim do recebimento de propostas', c.data_fim_acolhimento);
  add('sessão', c.data_abertura_sessao);
  add('contratação pretendida', ctx.processo.data_pretendida);
  return r;
}

/** EXERC-01 — reserva do exercício N com publicação/contrato previstos para N+1 (cria a tarefa da Contabilidade). */
export const EXERC_01: Regra = {
  codigo: 'EXERC-01',
  descricao: 'Reserva do exercício em que a contratação vai ocorrer (virada do exercício)',
  severidade: 'ATENCAO',
  etapa: 'PUBLICACAO',
  portao: 'C',
  aplicavel: (ctx) => (ctx.reserva?.status === 'EMITIDA' && ctx.reserva.exercicio_base ? null : 'Sem informação orçamentária emitida.'),
  avaliar(ctx) {
    const base = ctx.reserva!.exercicio_base!;
    const depois = datasPrevistas(ctx).filter((d) => Number(d.dia.slice(0, 4)) > base).sort((a, b) => a.dia.localeCompare(b.dia));
    if (!depois.length) return [];
    const d = depois[0];
    const ano = Number(d.dia.slice(0, 4));
    const doc = doTipo(ctx, 'DO')[0];
    return [
      {
        regra: 'EXERC-01',
        chave: `${base}>${ano}`,
        severidade: 'ATENCAO',
        titulo: 'Virada de exercício',
        mensagem: `A reserva é de ${base} e a ${d.rotulo} é ${diaBr(d.dia)} (${ano}): prever a nova dotação — renovar a informação orçamentária para ${ano} — antes do contrato. Tarefa criada para a Contabilidade.`,
        evidencias: doc ? [evidenciaDaPeca(doc)] : [],
        tipo_peca_responsavel: 'DO',
        acao: 'AGENDAR',
      },
    ];
  },
};

/** DUP-01 — duas peças ativas do mesmo tipo com textos diferentes (ex.: relatório juntado 2 vezes). */
export const DUP_01: Regra = {
  codigo: 'DUP-01',
  descricao: 'Uma peça válida por tipo (sem a mesma peça juntada duas vezes com textos diferentes)',
  severidade: 'ATENCAO',
  etapa: 'PUBLICACAO',
  portao: 'C',
  avaliar(ctx) {
    const porTipo = new Map<string, Array<{ ev: Evidencia; impressao: string | null }>>();
    for (const p of ativas(ctx)) {
      const l = porTipo.get(p.tipo) ?? [];
      l.push({ ev: { ...evidenciaDaPeca(p), trecho: rotuloFolhas(p) || null }, impressao: p.impressao });
      porTipo.set(p.tipo, l);
    }
    for (const a of ctx.anexos_avulsos) {
      const l = porTipo.get(a.tipo);
      if (!l) continue; // sem peça do tipo: o avulso não é "segunda via"
      l.push({ ev: { documento_id: null, tipo: a.tipo, titulo: `${a.titulo} (aba Documentos)`, folha: null, trecho: null }, impressao: a.impressao });
    }
    const r: AchadoCalculado[] = [];
    for (const [tipo, l] of porTipo) {
      if (l.length < 2) continue;
      const distintas = new Set(l.map((x) => x.impressao ?? `sem:${x.ev.documento_id ?? x.ev.titulo}`));
      if (distintas.size < 2) continue;
      const titulo = ctx.pecas.find((p) => p.tipo === tipo)?.titulo ?? tipo;
      const folhas = l.map((x) => x.ev.trecho).filter(Boolean);
      r.push({
        regra: 'DUP-01',
        chave: `tipo:${tipo}`,
        severidade: 'ATENCAO',
        titulo: `${titulo} juntado ${l.length} vezes`,
        mensagem: `${titulo} aparece ${l.length} vezes nos autos com textos diferentes${folhas.length ? ` (${folhas.join(' e ')})` : ''}. Mantenha só a válida e anule a outra por despacho.`,
        evidencias: l.map((x) => x.ev),
        tipo_peca_responsavel: tipo,
        acao: 'RESOLVER',
      });
    }
    return r;
  },
};

/** ASS-01 — peça nos autos sem data ou com assinaturas faltantes. */
export const ASS_01: Regra = {
  codigo: 'ASS-01',
  descricao: 'Toda peça dos autos datada e com as assinaturas exigidas',
  severidade: 'BLOQUEIO',
  etapa: 'PUBLICACAO',
  portao: 'C',
  avaliar(ctx) {
    const r: AchadoCalculado[] = [];
    for (const p of ativas(ctx)) {
      if (p.status === 'AGUARDANDO_ASSINATURA') {
        r.push({
          regra: 'ASS-01',
          chave: `${p.tipo}:assinaturas`,
          severidade: 'BLOQUEIO',
          titulo: `${p.titulo}: assinaturas faltantes`,
          mensagem: `${p.titulo} está aguardando assinaturas${p.signatarios_faltantes.length ? ` — faltam: ${p.signatarios_faltantes.join(', ')}` : ''}. A peça só vale assinada por todos.`,
          evidencias: [evidenciaDaPeca(p)],
          tipo_peca_responsavel: p.tipo,
          acao: 'ABRIR',
          // os signatários já foram avisados pelo portal de assinaturas
          sem_tarefa: true,
        });
        continue;
      }
      // Na peça feita aqui que só vale assinada (AA, PJ, MCI), o rascunho ainda não está nos autos
      const nosAutos = p.anexada || p.status === 'ASSINADO';
      if (nosAutos && !p.data_documento) {
        r.push({
          regra: 'ASS-01',
          chave: `${p.tipo}:data`,
          severidade: 'BLOQUEIO',
          titulo: `${p.titulo} sem data`,
          mensagem: `${p.titulo} está nos autos sem data. ${p.anexada ? 'Anexe de novo informando a data que consta no documento (a data do envio não serve).' : 'A data da peça assinada é a da última assinatura.'}`,
          evidencias: [evidenciaDaPeca(p)],
          tipo_peca_responsavel: p.tipo,
          acao: 'CORRIGIR_PECA',
        });
      }
    }
    return r;
  },
};

/** PRAZO-01 — janela de propostas com o mínimo de dias úteis (art. 75, §3º; IN 67, art. 6º, p.ú.), no calendário do órgão. */
export const PRAZO_01: Regra = {
  codigo: 'PRAZO-01',
  descricao: 'Janela de propostas com o prazo mínimo de dias úteis contado no calendário do órgão (art. 75, §3º; art. 55)',
  severidade: 'BLOQUEIO',
  etapa: 'PUBLICACAO',
  portao: 'C',
  // O PUBLICAR aplica a mesma função (`prazosDePublicacao`) às datas do pedido
  garantida_no_ato: true,
  sem_tarefa: true,
  aplicavel(ctx) {
    if (ctx.processo.selecao_externa) return 'Seleção feita em plataforma externa (os prazos são os dela).';
    if (!fimDoRecebimento(ctx.processo.cronograma)) return 'Sem o fim do recebimento de propostas (conferido ao publicar).';
    return null;
  },
  avaliar(ctx) {
    const av = avaliacaoDoPrazo(ctx);
    if (!av || !av.minimo_abertura || !av.recebimento || av.recebimento.getTime() >= av.minimo_abertura.getTime()) return [];
    return [
      {
        regra: 'PRAZO-01',
        chave: `recebimento:${av.recebimento.toISOString()}`,
        severidade: 'BLOQUEIO',
        titulo: 'Janela de propostas abaixo do mínimo',
        mensagem:
          `Janela de propostas com ${av.dias_uteis} dia(s) útil(eis) (divulgação ${formatarDataBrasilia(av.divulgacao, false)}, fim do recebimento ${formatarDataBrasilia(av.recebimento)}): ` +
          `o mínimo é de ${av.minimo} dias úteis (${av.fundamento}), contados no calendário do órgão — o fim do recebimento vai a partir de ${formatarDataBrasilia(av.minimo_abertura, false)}.`,
        evidencias: doTipo(ctx, 'ME').slice(0, 1).map((p) => evidenciaDaPeca(p)),
        tipo_peca_responsavel: 'ME',
        acao: 'CORRIGIR_PECA',
      },
    ];
  },
};

/** Prazo de divulgação do aviso (quadro da tela e PRAZO-01): mesma função da pré-condição do PUBLICAR. */
export function avaliacaoDoPrazo(ctx: ContextoConformidade) {
  const c = ctx.processo.cronograma;
  const recebimento = fimDoRecebimento(c);
  const prevista = publicacaoPrevista(ctx);
  const divulgacaoInformada = c.data_publicacao_edital ?? (prevista ? `${prevista}T09:00:00-03:00` : null);
  const av = avaliarPrazosDePublicacao(
    {
      modalidade: ctx.processo.modalidade,
      tipo_contratacao: ctx.processo.tipo_contratacao,
      criterio_julgamento: ctx.processo.criterio_julgamento,
      regime_execucao: ctx.processo.regime_execucao,
      natureza_objeto: ctx.processo.natureza_objeto,
    },
    { ...c, data_publicacao_edital: divulgacaoInformada },
    ctx.agora,
    { cal: ctx.calendario },
  );
  if (!av.prazo.dias) return null;
  return {
    divulgacao: av.divulgacao,
    recebimento,
    minimo_abertura: av.minimo_abertura,
    minimo: av.prazo.dias,
    fundamento: av.prazo.fundamento,
    dias_uteis: recebimento ? diasUteisEntre(av.divulgacao, recebimento, ctx.calendario) : null,
    atende: !recebimento || !av.minimo_abertura || recebimento.getTime() >= av.minimo_abertura.getTime(),
  };
}

/** MINUTA-DESAT — minuta gerada pelo modelo que ficou para trás quando o processo mudou (E3B). */
export const MINUTA_DESAT: Regra = {
  codigo: 'MINUTA-DESAT',
  descricao: 'Minutas atualizadas com os dados do processo (fundamento, número, sigilo)',
  severidade: 'ATENCAO',
  etapa: 'PUBLICACAO',
  portao: 'C',
  avaliar(ctx) {
    return ativas(ctx)
      .filter((p) => p.desatualizada)
      .map((p) => ({
        regra: 'MINUTA-DESAT',
        chave: `peca:${p.tipo}`,
        severidade: 'ATENCAO' as const,
        titulo: `${p.titulo} desatualizada`,
        mensagem: p.desatualizada!.texto,
        evidencias: [evidenciaDaPeca(p)],
        tipo_peca_responsavel: p.tipo,
        acao: 'CORRIGIR_PECA' as const,
      }));
  },
};

/** SIGILO-01 — orçamento sigiloso com a justificativa do art. 24. */
export const SIGILO_01: Regra = {
  codigo: 'SIGILO-01',
  descricao: 'Orçamento sigiloso justificado (art. 24)',
  severidade: 'ATENCAO',
  etapa: 'PUBLICACAO',
  portao: 'C',
  aplicavel: (ctx) => (ctx.processo.sigiloso ? null : 'Orçamento público.'),
  avaliar(ctx) {
    if (String(ctx.processo.justificativa_sigilo ?? '').trim().length >= 20) return [];
    return [
      {
        regra: 'SIGILO-01',
        chave: 'sigilo',
        severidade: 'ATENCAO',
        titulo: 'Orçamento sigiloso sem justificativa',
        mensagem: 'O orçamento está marcado como sigiloso sem a justificativa do art. 24 da Lei 14.133/2021. Decida o sigilo com a justificativa (tela das minutas).',
        evidencias: doTipo(ctx, 'ME', 'TR').slice(0, 1).map((p) => evidenciaDaPeca(p)),
        tipo_peca_responsavel: 'ME',
        acao: 'CORRIGIR_PECA',
      },
    ];
  },
};

/**
 * DISP-01 (Entrega 5) — dispensa escolhida SEM disputa de lances num órgão
 * cujo regulamento local ADOTA a IN SEGES 67/2021 (que prevê a etapa de
 * lances). Só atenção: a Lei 14.133 (art. 75, §3º) admite a dispensa só com
 * propostas; o aviso é para o agente confirmar a escolha. Sem o dado do
 * regulamento (padrão false), não avisa.
 */
export const DISP_01: Regra = {
  codigo: 'DISP-01',
  descricao: 'Dispensa sem disputa de lances em órgão que adota a IN 67',
  severidade: 'ATENCAO',
  etapa: 'PUBLICACAO',
  portao: 'C',
  aplicavel: (ctx) =>
    ctx.processo.modalidade !== 'DISPENSA_ELETRONICA'
      ? 'Só na dispensa eletrônica.'
      : !ctx.processo.regulamento_adota_in67
        ? 'O regulamento do órgão não adota a IN 67 (configuração).'
        : null,
  avaliar(ctx) {
    if (ctx.processo.dispensa_com_lances !== false) return [];
    return [
      {
        regra: 'DISP-01',
        chave: 'sem-lances',
        severidade: 'ATENCAO',
        titulo: 'Dispensa sem disputa de lances, mas o regulamento do órgão adota a IN 67',
        mensagem:
          'O processo foi definido SEM disputa de lances (Lei 14.133/2021, art. 75, §3º — só propostas no prazo do aviso), mas o regulamento do órgão adota a IN SEGES 67/2021, que prevê a sessão de lances. Confirme a escolha no processo (Editar processo › Classificação) ou registre a justificativa.',
        evidencias: [],
        tipo_peca_responsavel: 'ME',
      },
    ];
  },
};

/** Cláusulas obrigatórias (art. 92) — ids das seções do modelo da minuta do contrato. */
export const CLAUSULAS_ART92: Array<{ id: string; ref: string }> = [
  { id: 'objeto', ref: 'I' },
  { id: 'vinculacao', ref: 'II' },
  { id: 'legislacao', ref: 'III' },
  { id: 'regime_execucao', ref: 'IV' },
  { id: 'preco', ref: 'V' },
  { id: 'pagamento', ref: 'VI' },
  { id: 'prazos', ref: 'VII' },
  { id: 'dotacao', ref: 'VIII' },
  { id: 'obrigacoes', ref: 'XIV' },
  { id: 'penalidades', ref: 'XIV' },
  { id: 'habilitacao', ref: 'XVI' },
  { id: 'gestao', ref: 'XVIII' },
  { id: 'extincao', ref: 'XIX' },
  { id: 'foro', ref: '§1º' },
];

/** Cláusulas do art. 92 vazias na minuta do contrato feita no sistema. */
export function clausulasArt92Faltantes(secoesMc: Record<string, string> | null): string[] {
  if (!secoesMc) return [];
  return CLAUSULAS_ART92.filter((c) => textoPuro(secoesMc[c.id]).length < 5).map((c) => `art. 92, ${c.ref} (${c.id})`);
}

/** ART92-01 — cláusulas necessárias do art. 92 presentes na minuta do contrato feita no sistema. */
export const ART92_01: Regra = {
  codigo: 'ART92-01',
  descricao: 'Cláusulas necessárias do art. 92 na minuta do contrato',
  severidade: 'ATENCAO',
  etapa: 'PUBLICACAO',
  portao: 'C',
  aplicavel(ctx) {
    const mc = doTipo(ctx, 'MC')[0];
    if (!mc) return 'Sem minuta do contrato (ou "não se aplica").';
    if (mc.anexada) return 'Minuta anexada — conferir as cláusulas no PDF.';
    return null;
  },
  avaliar(ctx) {
    const mc = doTipo(ctx, 'MC')[0];
    const faltam = clausulasArt92Faltantes(mc.secoes);
    if (!faltam.length) return [];
    return [
      {
        regra: 'ART92-01',
        chave: 'MC',
        severidade: 'ATENCAO',
        titulo: 'Cláusulas do art. 92 vazias na minuta do contrato',
        mensagem: `Cláusulas vazias: ${faltam.join('; ')}.`,
        evidencias: [evidenciaDaPeca(mc)],
        tipo_peca_responsavel: 'MC',
        acao: 'CORRIGIR_PECA',
      },
    ];
  },
};

/** TODAS AS REGRAS, na ordem da tela (portão A, B e C). */
export const REGRAS: Regra[] = [
  LIM_01,
  LIM_02,
  A72_I,
  A72_II,
  A72_III,
  A72_IV,
  A72_V,
  A72_VI,
  A72_VII,
  A72_VIII,
  ENQ_01,
  VINC_01,
  MARCA_01,
  PRECO_01,
  PRECO_02,
  PRECO_03,
  PRECO_04,
  CRONO_01,
  LEI_01,
  EXERC_01,
  DUP_01,
  ASS_01,
  PRAZO_01,
  MINUTA_DESAT,
  SIGILO_01,
  ART92_01,
  DISP_01,
];

export const regraPorCodigo = (codigo: string) => REGRAS.find((r) => r.codigo === codigo) ?? null;

/** Passo da tarefa do achado: o do passo da peça (o responsável por ela). */
export function passoDoAchado(a: Pick<AchadoCalculado, 'regra' | 'tipo_peca_responsavel'>, contratacaoDireta: boolean): PassoFaseInterna {
  const pelaPeca = a.tipo_peca_responsavel ? passoDaPeca(a.tipo_peca_responsavel, contratacaoDireta) : null;
  if (pelaPeca) return pelaPeca;
  const r = regraPorCodigo(a.regra);
  if (r?.etapa === 'PESQUISA') return PassoFaseInterna.PESQUISA;
  if (r?.etapa === 'AUTORIZACAO') return PassoFaseInterna.AUTORIZACAO;
  return PassoFaseInterna.PUBLICACAO;
}
