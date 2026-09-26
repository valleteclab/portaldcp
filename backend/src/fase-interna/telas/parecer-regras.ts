/**
 * PARECER JURÍDICO COM DILIGÊNCIAS (etapa 7 — Entrega 3B) — regras puras.
 *
 *  - ROTEIRO DE ANÁLISE (mockup Parecer): checklist do art. 72, enquadramento
 *    no mesmo inciso em todas as peças (art. 75), marca (art. 41, I), sigilo
 *    (art. 24), cláusulas do art. 92 na minuta do contrato e vinculação ao
 *    processo correto. Cada item traz uma conferência AUTOMÁTICA (sugestão) e
 *    a marcação da Procuradoria prevalece; diligência aberta sobre o item o
 *    deixa em "Diligência".
 *  - DILIGÊNCIA: ABERTA → SANADA (responsável corrigiu a peça: nova versão,
 *    ou respondeu sem alterar) → o processo volta para a Procuradoria. Nada
 *    que já foi assinado depois é desfeito: a peça-alvo ganha versão nova.
 *    Pode ser reaberta ou cancelada pela Procuradoria.
 *  - EMISSÃO: favorável (sem diligência aberta), favorável com ressalvas
 *    (condicionado ao saneamento — exige as ressalvas) ou desfavorável
 *    (exige a fundamentação).
 */
import { situacaoDasPecasDoArt72, type LinhaInstrucaoPortao } from '../conformidade/art72';
import type { AchadoCalculado, AvaliacaoRegra } from '../conformidade/tipos';

// Cláusulas do art. 92: a implementação é a do motor (regra ART92-01), reexportada aqui.
export { CLAUSULAS_ART92, clausulasArt92Faltantes } from '../conformidade/regras';

export type FaseParecer = 'PREVIA' | 'EXTERNA';
export type ConclusaoParecer = 'FAVORAVEL' | 'FAVORAVEL_COM_RESSALVAS' | 'DESFAVORAVEL';
export const CONCLUSOES: ConclusaoParecer[] = ['FAVORAVEL', 'FAVORAVEL_COM_RESSALVAS', 'DESFAVORAVEL'];
export const ROTULO_CONCLUSAO: Record<ConclusaoParecer, string> = {
  FAVORAVEL: 'Favorável',
  FAVORAVEL_COM_RESSALVAS: 'Favorável, condicionado ao saneamento das ressalvas',
  DESFAVORAVEL: 'Desfavorável',
};

export type SituacaoItem = 'CONFORME' | 'ATENCAO' | 'PENDENTE' | 'DILIGENCIA' | 'RESSALVA' | 'NAO_SE_APLICA';
export const SITUACOES_MARCAVEIS: SituacaoItem[] = ['CONFORME', 'RESSALVA', 'NAO_SE_APLICA', 'PENDENTE'];

export interface ItemRoteiro {
  id: string;
  ref: string;
  texto: string;
  /** Peças a que o item se refere (clicar abre a peça). */
  tipos: string[];
  automatico: { situacao: SituacaoItem; detalhe: string };
}

export interface ItemRoteiroFinal extends ItemRoteiro {
  situacao: SituacaoItem;
  observacao: string | null;
  marcado_pela_procuradoria: boolean;
  diligencias_abertas: number;
}

const PRONTA = new Set(['OK', 'NAO_SE_APLICA']);

/** Situação das peças do inciso — a mesma função das regras A72-* do motor. */
const pecas = (itens: LinhaInstrucaoPortao[], tipos: string[], rotulo: string) => {
  const r = situacaoDasPecasDoArt72(itens, tipos, rotulo);
  return { situacao: r.situacao as SituacaoItem, detalhe: r.detalhe };
};

const doMotor = (avaliacoes: AvaliacaoRegra[], codigo: string) => avaliacoes.find((a) => a.regra.codigo === codigo) ?? null;
const tiposDos = (achados: AchadoCalculado[]) => [...new Set(achados.flatMap((a) => a.evidencias.map((e) => e.tipo).filter((t): t is string => !!t)))];

/**
 * ROTEIRO DO PARECER PRÉVIO (art. 53 c/c art. 72, III). A conferência
 * automática de cada item LÊ O MOTOR DE CONFORMIDADE (Entrega 4): art. 72
 * pelas peças da instrução (mesma função das regras A72-*); art. 75 pela
 * ENQ-01; art. 41, I pela MARCA-01; art. 24 pela SIGILO-01; art. 92 pela
 * ART92-01; vinculação pela VINC-01. São sugestões — a marcação da
 * Procuradoria prevalece.
 */
export function roteiroPrevio(e: {
  contratacao_direta: boolean;
  instrucao: LinhaInstrucaoPortao[];
  fundamento_referencia: string | null;
  numero_processo: string | null;
  avaliacoes: AvaliacaoRegra[];
}): ItemRoteiro[] {
  const itens: ItemRoteiro[] = [];
  const I = e.instrucao;
  itens.push({ id: 'A72_I', ref: 'Art. 72, I', texto: 'DFD e, se for o caso, ETP, riscos e TR juntados', tipos: ['DFD', 'ETP', 'AR', 'TR'], automatico: pecas(I, ['DFD', 'ETP', 'AR', 'TR'], 'Planejamento') });
  itens.push({ id: 'A72_II', ref: 'Art. 72, II', texto: 'Estimativa de despesa conforme o art. 23', tipos: ['PP', 'MCP'], automatico: pecas(I, ['PP'], 'Pesquisa de preços') });
  itens.push({ id: 'A72_IV', ref: 'Art. 72, IV', texto: 'Compatibilidade orçamentária', tipos: ['DO'], automatico: pecas(I, ['DO'], 'Informação orçamentária') });
  itens.push({ id: 'A72_VI_VII', ref: 'Art. 72, VI e VII', texto: 'Razão da escolha e justificativa do preço (relatório do agente)', tipos: ['RAG', 'JC'], automatico: pecas(I, ['RAG'], 'Relatório do agente') });
  itens.push({ id: 'A72_VIII', ref: 'Art. 72, VIII', texto: 'Autorização da autoridade competente', tipos: ['AA'], automatico: pecas(I, ['AA'], 'Autorização') });

  // Enquadramento (ENQ-01): o inciso citado nas peças é o do processo?
  const enq = doMotor(e.avaliacoes, 'ENQ-01');
  if (enq?.aplicavel) {
    const incisos = enq.achados.flatMap((a) => a.evidencias.map((ev) => `${ev.tipo} (inciso ${a.chave.replace('inciso:', '')})`));
    itens.push({
      id: 'ART75',
      ref: 'Art. 75',
      texto: `Enquadramento no mesmo inciso em todas as peças (${e.fundamento_referencia ?? 'fundamento do processo'})`,
      tipos: tiposDos(enq.achados),
      automatico: enq.achados.length
        ? { situacao: 'ATENCAO', detalhe: `Inciso diferente do processo em: ${[...new Set(incisos)].join('; ')}` }
        : { situacao: 'CONFORME', detalhe: 'As peças citam o inciso do processo (as anexadas sem texto: conferir no PDF)' },
    });
  }
  const marca = doMotor(e.avaliacoes, 'MARCA-01');
  const bloqueioMarca = !!marca?.achados.some((a) => a.severidade === 'BLOQUEIO');
  const atencaoMarca = !!marca?.achados.some((a) => a.severidade === 'ATENCAO');
  itens.push({
    id: 'ART41',
    ref: 'Art. 41, I',
    texto: 'Indicação de marca justificada',
    tipos: ['ETP', 'TR'],
    automatico: bloqueioMarca
      ? { situacao: 'ATENCAO', detalhe: 'Marca citada sem "apenas como referência" e sem justificativa' }
      : atencaoMarca
        ? { situacao: 'ATENCAO', detalhe: 'Marca citada como referência — falta a justificativa do art. 41, I' }
        : { situacao: 'CONFORME', detalhe: 'Sem marca sem justificativa nas peças' },
  });
  const sigilo = doMotor(e.avaliacoes, 'SIGILO-01');
  itens.push({
    id: 'ART24',
    ref: 'Art. 24',
    texto: 'Sigilo do orçamento justificado',
    tipos: ['TR', 'ME'],
    automatico: !sigilo?.aplicavel
      ? { situacao: 'NAO_SE_APLICA', detalhe: 'Orçamento público' }
      : sigilo.achados.length
        ? { situacao: 'ATENCAO', detalhe: 'Orçamento sigiloso sem justificativa' }
        : { situacao: 'CONFORME', detalhe: 'Sigilo decidido com justificativa' },
  });
  const mc = I.find((x) => x.tipo === 'MC')?.status ?? null;
  const art92 = doMotor(e.avaliacoes, 'ART92-01');
  itens.push({
    id: 'ART92',
    ref: 'Art. 92',
    texto: 'Cláusulas obrigatórias da minuta do contrato',
    tipos: ['MC'],
    automatico:
      mc === null
        ? { situacao: 'NAO_SE_APLICA', detalhe: 'Sem minuta de contrato na instrução' }
        : mc === 'NAO_SE_APLICA'
          ? { situacao: 'NAO_SE_APLICA', detalhe: 'Minuta do contrato: não se aplica (instrumento substituído — art. 95)' }
          : !PRONTA.has(mc)
            ? { situacao: 'PENDENTE', detalhe: 'Minuta do contrato não elaborada' }
            : !art92?.aplicavel
              ? { situacao: 'ATENCAO', detalhe: 'Minuta anexada — conferir as cláusulas no PDF' }
              : art92.achados.length
                ? { situacao: 'ATENCAO', detalhe: art92.achados[0].mensagem }
                : { situacao: 'CONFORME', detalhe: 'Cláusulas necessárias presentes' },
  });
  const vinc = doMotor(e.avaliacoes, 'VINC-01');
  const vincAchados = vinc?.achados ?? [];
  itens.push({
    id: 'VINC',
    ref: 'Vinculação',
    texto: `Vinculação ao processo correto (PA ${e.numero_processo ?? '—'})`,
    tipos: vincAchados.length ? tiposDos(vincAchados) : ['ME', 'MC'],
    automatico: vincAchados.length
      ? { situacao: 'ATENCAO', detalhe: `Outro processo citado: ${vincAchados.map((a) => a.mensagem.split(', que não é')[0]).join('; ')}` }
      : { situacao: 'CONFORME', detalhe: 'As peças citam o número deste processo' },
  });
  if (!e.contratacao_direta) {
    // Rito completo: o parecer do art. 53 analisa a minuta do edital
    itens.push({ id: 'ART53', ref: 'Art. 53', texto: 'Minuta do edital e anexos', tipos: ['ME'], automatico: pecas(I, ['ME'], 'Minuta do edital') });
  }
  return itens;
}

/** ROTEIRO DO PARECER DA FASE EXTERNA (antes da adjudicação). */
export function roteiroFaseExterna(e: { parecer_previo: string | null; tem_vencedor: boolean; valor_vencedor: number | null; valor_estimado: number | null }): ItemRoteiro[] {
  const acimaDoEstimado = e.valor_vencedor != null && e.valor_estimado != null && e.valor_vencedor > e.valor_estimado + 0.005;
  return [
    {
      id: 'PREVIO',
      ref: 'Art. 53',
      texto: 'Parecer prévio favorável (ressalvas atendidas)',
      tipos: ['PJ'],
      automatico: e.parecer_previo === 'OK' ? { situacao: 'CONFORME', detalhe: 'Parecer prévio juntado' } : { situacao: 'ATENCAO', detalhe: 'Parecer prévio não juntado' },
    },
    { id: 'DIVULGACAO', ref: 'Art. 54 · Art. 75, §3º', texto: 'Divulgação e prazo mínimo das propostas', tipos: [], automatico: { situacao: 'PENDENTE', detalhe: 'Conferir a publicação e o prazo' } },
    {
      id: 'JULGAMENTO',
      ref: 'Art. 71',
      texto: 'Julgamento e vencedor',
      tipos: [],
      automatico: e.tem_vencedor ? { situacao: 'CONFORME', detalhe: 'Há vencedor declarado' } : { situacao: 'PENDENTE', detalhe: 'Sem vencedor registrado' },
    },
    {
      id: 'PRECO',
      ref: 'Art. 59, III',
      texto: 'Preço vencedor dentro do estimado',
      tipos: ['PP'],
      automatico: acimaDoEstimado ? { situacao: 'ATENCAO', detalhe: 'Valor vencedor acima do estimado' } : { situacao: 'CONFORME', detalhe: 'Valor dentro do estimado' },
    },
    { id: 'HABILITACAO', ref: 'Art. 62 · Art. 72, V', texto: 'Habilitação do vencedor', tipos: [], automatico: { situacao: 'PENDENTE', detalhe: 'Conferir os documentos de habilitação' } },
    { id: 'RECURSOS', ref: 'Art. 165', texto: 'Recursos decididos', tipos: [], automatico: { situacao: 'PENDENTE', detalhe: 'Conferir o prazo e as decisões' } },
  ];
}

/** Situação final dos itens: diligência aberta > marcação da Procuradoria > automático. */
export function aplicarMarcacoes(
  itens: ItemRoteiro[],
  marcacoes: Record<string, { situacao?: string; observacao?: string | null }> | null | undefined,
  diligencias: Array<{ item_roteiro: string | null; status: string }>,
): ItemRoteiroFinal[] {
  return itens.map((i) => {
    const abertas = diligencias.filter((d) => d.item_roteiro === i.id && d.status === 'ABERTA').length;
    const m = marcacoes?.[i.id];
    const marcada = !!m?.situacao && SITUACOES_MARCAVEIS.includes(m.situacao as SituacaoItem);
    const situacao: SituacaoItem = abertas ? 'DILIGENCIA' : marcada ? (m!.situacao as SituacaoItem) : i.automatico.situacao;
    return { ...i, situacao, observacao: m?.observacao ?? null, marcado_pela_procuradoria: marcada, diligencias_abertas: abertas };
  });
}

/** Valida as marcações do roteiro enviadas pela Procuradoria. */
export function validarMarcacoes(corpo: unknown, idsValidos: string[]): { ok: true; valores: Record<string, { situacao: SituacaoItem; observacao: string | null }> } | { ok: false; erro: string } {
  if (corpo === undefined || corpo === null) return { ok: true, valores: {} };
  if (typeof corpo !== 'object' || Array.isArray(corpo)) return { ok: false, erro: 'Roteiro inválido.' };
  const valores: Record<string, { situacao: SituacaoItem; observacao: string | null }> = {};
  for (const [id, v] of Object.entries(corpo as Record<string, any>)) {
    if (!idsValidos.includes(id)) return { ok: false, erro: `Item do roteiro desconhecido: ${id}` };
    const s = String(v?.situacao ?? '').toUpperCase();
    if (!SITUACOES_MARCAVEIS.includes(s as SituacaoItem)) return { ok: false, erro: `Situação inválida em ${id} (use CONFORME, RESSALVA, NAO_SE_APLICA ou PENDENTE).` };
    valores[id] = { situacao: s as SituacaoItem, observacao: String(v?.observacao ?? '').trim().slice(0, 2000) || null };
  }
  return { ok: true, valores };
}

// ---------------------------------------------------------------------------
// DILIGÊNCIA
// ---------------------------------------------------------------------------

export type StatusDiligencia = 'ABERTA' | 'SANADA' | 'CANCELADA';

export function validarNovaDiligencia(e: { descricao: unknown; tipo_alvo: unknown; tipos_do_processo: string[]; item_roteiro?: unknown; itens_roteiro: string[] }): string | null {
  const descricao = String(e.descricao ?? '').trim();
  if (descricao.length < 10) return 'Descreva a diligência (o que precisa ser corrigido ou esclarecido).';
  const tipo = String(e.tipo_alvo ?? '').toUpperCase();
  if (!tipo) return 'Informe a peça a corrigir.';
  if (!e.tipos_do_processo.includes(tipo)) return 'A peça indicada não existe neste processo — a diligência aponta uma peça dos autos.';
  if (e.item_roteiro !== undefined && e.item_roteiro !== null && e.item_roteiro !== '' && !e.itens_roteiro.includes(String(e.item_roteiro))) {
    return 'Item do roteiro desconhecido.';
  }
  return null;
}

/**
 * Pode SANAR? A diligência precisa estar aberta e a peça-alvo ter VERSÃO NOVA
 * pronta (corrigida) — ou o responsável responde que não há o que alterar
 * (esclarecimento), com texto.
 */
export function podeSanar(
  d: { status: string; documento_alvo_id: string | null },
  e: { documento_atual_id: string | null; atual_pronta: boolean; sem_alteracao: boolean; resposta: string },
): { ok: true; corrigida: boolean } | { ok: false; erro: string } {
  if (d.status !== 'ABERTA') return { ok: false, erro: 'A diligência não está aberta.' };
  const corrigida = !!e.documento_atual_id && e.documento_atual_id !== d.documento_alvo_id && e.atual_pronta;
  if (corrigida) return { ok: true, corrigida: true };
  if (e.sem_alteracao) {
    if (e.resposta.trim().length < 10) return { ok: false, erro: 'Explique por que a peça não precisa ser alterada (esclarecimento à Procuradoria).' };
    return { ok: true, corrigida: false };
  }
  return { ok: false, erro: 'Corrija a peça (nova versão feita aqui ou anexada) antes de sanar — ou responda que não há o que alterar, com a explicação.' };
}

export function podeReabrir(d: { status: string }): string | null {
  return d.status === 'SANADA' ? null : 'Só a diligência sanada pode ser reaberta.';
}

export function podeCancelar(d: { status: string }): string | null {
  return d.status === 'ABERTA' ? null : 'Só a diligência aberta pode ser cancelada.';
}

// ---------------------------------------------------------------------------
// EMISSÃO
// ---------------------------------------------------------------------------

export function validarEmissao(e: {
  conclusao: unknown;
  fundamentacao: unknown;
  ressalvas: unknown;
  diligencias: Array<{ status: string }>;
}): { ok: true; conclusao: ConclusaoParecer } | { ok: false; erro: string } {
  const c = String(e.conclusao ?? '').toUpperCase() as ConclusaoParecer;
  if (!CONCLUSOES.includes(c)) return { ok: false, erro: 'Escolha a conclusão: favorável, favorável com ressalvas ou desfavorável.' };
  const abertas = e.diligencias.filter((d) => d.status === 'ABERTA').length;
  if (c === 'FAVORAVEL' && abertas) {
    return { ok: false, erro: `Há ${abertas} diligência(s) aberta(s): aguarde o saneamento ou emita "favorável com ressalvas".` };
  }
  if (c === 'FAVORAVEL_COM_RESSALVAS' && !abertas && String(e.ressalvas ?? '').trim().length < 10) {
    return { ok: false, erro: 'Descreva as ressalvas (ou mantenha diligências abertas como condição).' };
  }
  if (c === 'DESFAVORAVEL' && String(e.fundamentacao ?? '').trim().length < 20) {
    return { ok: false, erro: 'O parecer desfavorável precisa da fundamentação.' };
  }
  return { ok: true, conclusao: c };
}

const esc = (s: unknown) => String(s ?? '').replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[ch]!);

const ROTULO_SITUACAO: Record<SituacaoItem, string> = {
  CONFORME: 'Conforme',
  ATENCAO: 'Atenção',
  PENDENTE: 'Pendente',
  DILIGENCIA: 'Diligência',
  RESSALVA: 'Ressalva',
  NAO_SE_APLICA: 'Não se aplica',
};

/** Texto do parecer montado a partir do roteiro (o jurista pode editar depois — nova versão). */
export function textoDoParecer(e: {
  fase: FaseParecer;
  numero_processo: string;
  objeto: string;
  fundamento_texto: string | null;
  itens: ItemRoteiroFinal[];
  diligencias: Array<{ descricao: string; tipo_alvo: string; status: string; resposta?: string | null }>;
  conclusao: ConclusaoParecer;
  fundamentacao: string | null;
  ressalvas: string | null;
  jurista: string;
  cidade: string;
  data: string;
}): string {
  const partes: string[] = [];
  partes.push(
    `<p><strong>Relatório.</strong> Trata-se do Processo Administrativo nº ${esc(e.numero_processo)}, cujo objeto é ${esc(e.objeto)}${e.fundamento_texto ? `, com fundamento na ${esc(e.fundamento_texto)}` : ''}. ` +
      (e.fase === 'PREVIA'
        ? 'Os autos vêm à Procuradoria para o controle prévio de legalidade (art. 53 da Lei nº 14.133/2021).'
        : 'Os autos retornam à Procuradoria após a fase externa, antes da adjudicação e da homologação.') +
      '</p>',
  );
  partes.push('<p><strong>Análise.</strong></p><table><tr><th>Referência</th><th>Item</th><th>Situação</th><th>Observação</th></tr>');
  for (const i of e.itens) {
    partes.push(`<tr><td>${esc(i.ref)}</td><td>${esc(i.texto)}</td><td>${ROTULO_SITUACAO[i.situacao]}</td><td>${esc(i.observacao ?? i.automatico.detalhe)}</td></tr>`);
  }
  partes.push('</table>');
  if (e.diligencias.length) {
    partes.push('<p><strong>Diligências.</strong></p><ul>');
    for (const d of e.diligencias) {
      partes.push(`<li>${esc(d.tipo_alvo)} — ${esc(d.descricao)} (${d.status === 'SANADA' ? `sanada${d.resposta ? `: ${esc(d.resposta)}` : ''}` : d.status === 'ABERTA' ? 'pendente de saneamento' : 'cancelada'})</li>`);
    }
    partes.push('</ul>');
  }
  if (e.fundamentacao) partes.push(`<p><strong>Fundamentação.</strong> ${esc(e.fundamentacao)}</p>`);
  if (e.ressalvas) partes.push(`<p><strong>Ressalvas.</strong> ${esc(e.ressalvas)}</p>`);
  partes.push(`<p><strong>Conclusão.</strong> Parecer ${ROTULO_CONCLUSAO[e.conclusao].toUpperCase()}${e.conclusao === 'FAVORAVEL_COM_RESSALVAS' ? '' : ''}.</p>`);
  partes.push(`<p>${esc(e.cidade)}${e.cidade ? ', ' : ''}${esc(e.data)}.</p><p>${esc(e.jurista)}</p>`);
  return partes.join('');
}
