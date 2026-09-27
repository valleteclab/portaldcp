/**
 * FASE INTERNA FEITA FORA DO SISTEMA — regras puras (sem banco).
 * docs/licitacao/PLANO-FASE-INTERNA.md, "Entrada: fase interna feita fora".
 *
 * O órgão que já fez a fase interna fora (Word, outro sistema, papel) cria o
 * processo em 3 passos — dados, itens e documentos (vários PDFs de uma vez,
 * cada um classificado como uma peça). Aqui ficam:
 *  - o catálogo de peças que podem ser juntadas (`OPCOES_PECA_EXTERNA`), na
 *    ordem LÓGICA de juntada (o despacho de autorização vem depois das peças
 *    que o art. 72 exige antes dele — portão B);
 *  - a leitura e a validação do pedido (arquivo → peça, "não se aplica",
 *    portaria do órgão) — `planejarJuntada`;
 *  - o checklist incremental do art. 72 / art. 18 conforme os arquivos são
 *    classificados — `checklistIncremental`;
 *  - a validação dos dados e dos itens (unidade obrigatória e valor unitário:
 *    decisão 2 do dono — a pesquisa feita fora vira o valor do item).
 * Nada de regra nova de instrução: o checklist é o `linhasDoChecklist` (fonte
 * única) e o portão B é o `portaoBArt72` (conformidade/art72.ts).
 */
import { UnidadeMedida } from '../../itens/entities/item-licitacao.entity';
import { ModalidadeLicitacao, TipoContratacao } from '../../licitacoes/entities/licitacao.entity';
import { portaoBArt72 } from '../conformidade/art72';
import { normalizarSignatariosInformados, validarDataDocumentoAnexo } from '../peca-regras';
import { motivoSigiloInvalido } from '../telas/minutas-regras';

/** Passo do fluxo curto onde o erro deve ser corrigido (a tela volta para ele). */
export type PassoExterno = 'DADOS' | 'ITENS' | 'DOCUMENTOS';

export interface ErroExterno {
  passo: PassoExterno;
  mensagem: string;
  /** Índice do arquivo (passo DOCUMENTOS) ou do item (passo ITENS), quando o erro é de um só. */
  indice?: number;
}

/**
 * Peças que podem ser juntadas de fora, na ORDEM de juntada (lógica dos autos:
 * planejamento → preço → orçamento → decisão → minutas → análise). O despacho
 * de autorização (AA) vem depois de DFD, ETP, riscos, TR, pesquisa e
 * informação orçamentária — é a ordem que o portão B (art. 72, I, II e IV)
 * exige. Peças da fase externa (parecer nº 2, Diário Oficial) não entram aqui.
 */
export const OPCOES_PECA_EXTERNA: ReadonlyArray<{ tipo: string; rotulo: string }> = [
  { tipo: 'DFD', rotulo: 'DFD — formalização da demanda' },
  { tipo: 'ETP', rotulo: 'Estudo técnico preliminar (ETP)' },
  { tipo: 'AR', rotulo: 'Análise de riscos' },
  { tipo: 'TR', rotulo: 'Termo de referência (TR)' },
  { tipo: 'PB', rotulo: 'Projeto básico' },
  { tipo: 'PP', rotulo: 'Pesquisa de preços (mapa / certidão)' },
  { tipo: 'MCP', rotulo: 'Mapa comparativo de preços' },
  { tipo: 'DO', rotulo: 'Informação orçamentária (dotação)' },
  { tipo: 'JC', rotulo: 'Justificativa da contratação' },
  { tipo: 'AA', rotulo: 'Despacho de autorização' },
  { tipo: 'DP', rotulo: 'Portaria de designação do agente' },
  { tipo: 'RAG', rotulo: 'Relatório do agente de contratação' },
  { tipo: 'ME', rotulo: 'Minuta do aviso / edital' },
  { tipo: 'MC', rotulo: 'Minuta do contrato' },
  { tipo: 'PT', rotulo: 'Parecer técnico' },
  { tipo: 'PJ', rotulo: 'Parecer jurídico' },
  { tipo: 'MCI', rotulo: 'Manifestação do controle interno' },
  { tipo: 'OUT', rotulo: 'Outro documento' },
];

const ORDEM = new Map(OPCOES_PECA_EXTERNA.map((o, i) => [o.tipo, i]));
export const TIPOS_JUNTAVEIS = new Set(OPCOES_PECA_EXTERNA.map((o) => o.tipo));
export const rotuloDaPecaExterna = (tipo: string) => OPCOES_PECA_EXTERNA.find((o) => o.tipo === tipo)?.rotulo ?? tipo;

/** Modalidades aceitas na entrada "feita fora" (credenciamento tem cadastro próprio). */
export const MODALIDADES_FEITA_FORA: string[] = [
  ModalidadeLicitacao.PREGAO_ELETRONICO,
  ModalidadeLicitacao.CONCORRENCIA,
  ModalidadeLicitacao.CONCURSO,
  ModalidadeLicitacao.LEILAO,
  ModalidadeLicitacao.DIALOGO_COMPETITIVO,
  ModalidadeLicitacao.DISPENSA_ELETRONICA,
  ModalidadeLicitacao.INEXIGIBILIDADE,
];

/** Limite de arquivos por envio (FASE_INTERNA_EXTERNA_MAX_ARQUIVOS, padrão 30). */
export const MAX_ARQUIVOS_EXTERNOS = Math.max(1, Number(process.env.FASE_INTERNA_EXTERNA_MAX_ARQUIVOS) || 30);

// ============================================================================
// PEDIDO DE JUNTADA (arquivo → peça)
// ============================================================================

export interface PecaDoArquivo {
  /** Índice do arquivo no envio (campo multipart `arquivos`, na ordem). */
  arquivo: number;
  tipo: string;
  numero_peca?: string;
  data_documento?: string;
  signatarios?: unknown;
  observacao?: string;
}

export interface ClassificacaoJuntada {
  pecas: PecaDoArquivo[];
  nao_se_aplica: Array<{ tipo: string; justificativa: string }>;
  /** Junta a portaria de designação vigente do órgão (peça DP) — sem arquivo. */
  usar_portaria_orgao: boolean;
}

/** Lê a classificação do corpo (JSON em texto, no multipart, ou objeto). Inválida → erro. */
export function lerClassificacao(bruto: unknown): ClassificacaoJuntada {
  let v: any = bruto;
  if (typeof bruto === 'string') {
    try {
      v = bruto.trim() ? JSON.parse(bruto) : {};
    } catch {
      throw new Error('Classificação dos documentos ilegível (JSON inválido).');
    }
  }
  v = v && typeof v === 'object' ? v : {};
  const pecas = Array.isArray(v.pecas) ? v.pecas : [];
  const nsa = Array.isArray(v.nao_se_aplica) ? v.nao_se_aplica : [];
  return {
    pecas: pecas.map((p: any) => ({
      arquivo: Number(p?.arquivo),
      tipo: String(p?.tipo ?? '').trim().toUpperCase(),
      numero_peca: p?.numero_peca == null ? undefined : String(p.numero_peca),
      data_documento: p?.data_documento == null ? undefined : String(p.data_documento),
      signatarios: p?.signatarios,
      observacao: p?.observacao == null ? undefined : String(p.observacao),
    })),
    nao_se_aplica: nsa.map((n: any) => ({ tipo: String(n?.tipo ?? '').trim().toUpperCase(), justificativa: String(n?.justificativa ?? '').trim() })),
    usar_portaria_orgao: v.usar_portaria_orgao === true || v.usar_portaria_orgao === 'true',
  };
}

/** Linha do checklist da instrução (a de `linhasDoChecklist`/`getInstrucao`). */
export interface LinhaChecklistExterna {
  tipo: string;
  titulo: string;
  obrigatorio: boolean;
  fundamento: string;
  pode_nao_se_aplicar: boolean;
}

export type AcaoJuntada =
  | { acao: 'ANEXAR'; tipo: string; arquivo: number; numero_peca: string | null; data_documento: string; signatarios: Array<{ nome: string; cargo: string | null }>; observacao: string | null }
  | { acao: 'NAO_SE_APLICA'; tipo: string; justificativa: string }
  | { acao: 'PORTARIA_ORGAO'; tipo: 'DP' };

export interface SituacaoLinha extends LinhaChecklistExterna {
  /** OK (pronta: juntada agora ou já no processo) | NAO_SE_APLICA | PENDENTE. */
  status: 'OK' | 'NAO_SE_APLICA' | 'PENDENTE';
  origem: 'ARQUIVO' | 'PORTARIA_ORGAO' | 'JA_NO_PROCESSO' | 'NAO_SE_APLICA' | null;
}

export interface ChecklistIncremental {
  contratacao_direta: boolean;
  linhas: SituacaoLinha[];
  /** Obrigatórias ainda pendentes ("Formalização da demanda (DFD) (Art. 72, I)"). */
  obrigatorias_pendentes: string[];
  /** Peças classificadas que não estão no checklist (entram nos autos do mesmo jeito). */
  fora_do_checklist: string[];
  /** Contratação direta: o que o art. 72 (I, II e IV) ainda exige antes do despacho de autorização. */
  antes_da_autorizacao: string[];
  completo: boolean;
}

/**
 * CHECKLIST INCREMENTAL: a situação de cada linha da instrução conforme os
 * arquivos são classificados (e o que o processo já tem, quando é a juntada
 * num processo existente). Usa o portão B de verdade (`portaoBArt72`) para
 * dizer o que falta antes do despacho de autorização.
 */
export function checklistIncremental(entrada: {
  contratacao_direta: boolean;
  checklist: LinhaChecklistExterna[];
  /** Tipos com arquivo classificado neste envio. */
  classificadas: Iterable<string>;
  nao_se_aplica?: Iterable<string>;
  usar_portaria_orgao?: boolean;
  /** Processo existente: tipos já prontos (status OK) e já "não se aplica". */
  ja_prontas?: Iterable<string>;
  ja_nao_se_aplica?: Iterable<string>;
}): ChecklistIncremental {
  const classificadas = new Set(entrada.classificadas);
  const nsa = new Set(entrada.nao_se_aplica ?? []);
  const jaProntas = new Set(entrada.ja_prontas ?? []);
  const jaNsa = new Set(entrada.ja_nao_se_aplica ?? []);
  const linhas: SituacaoLinha[] = entrada.checklist.map((l) => {
    let origem: SituacaoLinha['origem'] = null;
    let status: SituacaoLinha['status'] = 'PENDENTE';
    if (classificadas.has(l.tipo)) [status, origem] = ['OK', 'ARQUIVO'];
    else if (l.tipo === 'DP' && entrada.usar_portaria_orgao) [status, origem] = ['OK', 'PORTARIA_ORGAO'];
    else if (nsa.has(l.tipo) && l.pode_nao_se_aplicar) [status, origem] = ['NAO_SE_APLICA', 'NAO_SE_APLICA'];
    else if (jaProntas.has(l.tipo)) [status, origem] = ['OK', 'JA_NO_PROCESSO'];
    else if (jaNsa.has(l.tipo)) [status, origem] = ['NAO_SE_APLICA', 'JA_NO_PROCESSO'];
    return { ...l, status, origem };
  });
  const noChecklist = new Set(entrada.checklist.map((l) => l.tipo));
  const obrigatoriasPendentes = linhas.filter((l) => l.obrigatorio && l.status !== 'OK').map((l) => `${l.titulo} (${l.fundamento})`);
  const antes = entrada.contratacao_direta
    ? portaoBArt72(linhas.map((l) => ({ tipo: l.tipo, titulo: l.titulo, status: l.status, obrigatorio: l.obrigatorio })))
    : null;
  const antesDaAutorizacao = antes
    ? antes.linhas
        .filter((x) => x.exigido && x.situacao !== 'OK')
        .map((x) => `${x.referencia} — ${x.pecas.filter((p) => p.status !== 'OK' && p.status !== 'NAO_SE_APLICA').map((p) => p.titulo).join(', ')}`)
    : [];
  return {
    contratacao_direta: entrada.contratacao_direta,
    linhas,
    obrigatorias_pendentes: obrigatoriasPendentes,
    fora_do_checklist: [...classificadas].filter((t) => !noChecklist.has(t)),
    antes_da_autorizacao: antesDaAutorizacao,
    completo: obrigatoriasPendentes.length === 0,
  };
}

/**
 * PLANO DA JUNTADA: confere o pedido inteiro ANTES de gravar qualquer coisa
 * (nada de processo pela metade por erro previsível) e devolve as ações na
 * ordem lógica. Erros: arquivo sem peça ou com duas; peça desconhecida; dois
 * arquivos para a mesma peça; data do documento ausente/futura; "não se
 * aplica" onde a lei não permite ou sem justificativa; despacho de
 * autorização sem o que o art. 72 exige antes dele (portão B).
 */
export function planejarJuntada(entrada: {
  arquivos: Array<{ nome: string }>;
  classificacao: ClassificacaoJuntada;
  contratacao_direta: boolean;
  checklist: LinhaChecklistExterna[];
  ja_prontas?: Iterable<string>;
  ja_nao_se_aplica?: Iterable<string>;
  /** Processo novo: ao menos um PDF. */
  exigir_arquivo?: boolean;
  agora?: Date;
}): { ok: boolean; erros: ErroExterno[]; acoes: AcaoJuntada[]; checklist: ChecklistIncremental } {
  const { arquivos, classificacao: c } = entrada;
  const erros: ErroExterno[] = [];
  const erro = (mensagem: string, indice?: number) => erros.push({ passo: 'DOCUMENTOS', mensagem, ...(indice !== undefined ? { indice } : {}) });
  const nomeDo = (i: number) => `"${arquivos[i]?.nome || `arquivo ${i + 1}`}"`;
  const acoes: AcaoJuntada[] = [];
  const jaProntas = new Set(entrada.ja_prontas ?? []);
  const jaNsa = new Set(entrada.ja_nao_se_aplica ?? []);

  if (entrada.exigir_arquivo && !arquivos.length) erro('Envie os PDFs da fase interna (ao menos um).');
  if (arquivos.length > MAX_ARQUIVOS_EXTERNOS) erro(`No máximo ${MAX_ARQUIVOS_EXTERNOS} arquivos por envio.`);

  const porArquivo = new Map<number, PecaDoArquivo[]>();
  for (const p of c.pecas) {
    if (!Number.isInteger(p.arquivo) || p.arquivo < 0 || p.arquivo >= arquivos.length) {
      erro('Classificação aponta para um arquivo que não foi enviado.');
      continue;
    }
    porArquivo.set(p.arquivo, [...(porArquivo.get(p.arquivo) ?? []), p]);
  }
  const tiposComArquivo = new Map<string, number>();
  arquivos.forEach((_, i) => {
    const lista = porArquivo.get(i) ?? [];
    if (!lista.length) return void erro(`Escolha qual peça é o arquivo ${nomeDo(i)}.`, i);
    if (lista.length > 1) return void erro(`O arquivo ${nomeDo(i)} foi classificado mais de uma vez.`, i);
    const p = lista[0];
    if (!TIPOS_JUNTAVEIS.has(p.tipo)) return void erro(`Peça desconhecida para o arquivo ${nomeDo(i)}: ${p.tipo || '(vazia)'}.`, i);
    const anterior = tiposComArquivo.get(p.tipo);
    if (anterior !== undefined) {
      return void erro(
        `Dois arquivos para a mesma peça (${rotuloDaPecaExterna(p.tipo)}): ${nomeDo(anterior)} e ${nomeDo(i)}. Junte num PDF só ou escolha outra peça.`,
        i,
      );
    }
    tiposComArquivo.set(p.tipo, i);
    const data = validarDataDocumentoAnexo(p.data_documento, entrada.agora);
    if (!data.ok) return void erro(`${rotuloDaPecaExterna(p.tipo)} (${nomeDo(i)}): ${data.erro}`, i);
    acoes.push({
      acao: 'ANEXAR',
      tipo: p.tipo,
      arquivo: i,
      numero_peca: String(p.numero_peca ?? '').trim().slice(0, 120) || null,
      data_documento: data.dia,
      signatarios: normalizarSignatariosInformados(p.signatarios),
      observacao: String(p.observacao ?? '').trim().slice(0, 4000) || null,
    });
  });

  if (c.usar_portaria_orgao) {
    if (tiposComArquivo.has('DP')) erro('A portaria de designação foi enviada em PDF e também marcada "usar a portaria do órgão" — escolha uma das duas.');
    else acoes.push({ acao: 'PORTARIA_ORGAO', tipo: 'DP' });
  }

  const linhaDo = new Map(entrada.checklist.map((l) => [l.tipo, l]));
  const nsaVistos = new Set<string>();
  for (const n of c.nao_se_aplica) {
    const l = linhaDo.get(n.tipo);
    const rotulo = l?.titulo ?? rotuloDaPecaExterna(n.tipo);
    if (!l || !l.pode_nao_se_aplicar) {
      erro(`"${rotulo}" não admite "não se aplica" neste processo${l?.obrigatorio ? ` — é obrigatória (${l.fundamento})` : ''}.`);
      continue;
    }
    if (nsaVistos.has(n.tipo)) continue;
    nsaVistos.add(n.tipo);
    if (tiposComArquivo.has(n.tipo) || (n.tipo === 'DP' && c.usar_portaria_orgao)) {
      erro(`"${rotulo}" foi juntada e também marcada "não se aplica" — escolha uma das duas.`);
      continue;
    }
    if (jaProntas.has(n.tipo)) {
      erro(`"${rotulo}" já está pronta no processo — não pode ser marcada "não se aplica".`);
      continue;
    }
    if (!n.justificativa) {
      erro(`Justifique por que "${rotulo}" não se aplica (a justificativa fica nos autos — art. 72).`);
      continue;
    }
    if (!jaNsa.has(n.tipo)) acoes.push({ acao: 'NAO_SE_APLICA', tipo: n.tipo, justificativa: n.justificativa.slice(0, 4000) });
  }

  const checklist = checklistIncremental({
    contratacao_direta: entrada.contratacao_direta,
    checklist: entrada.checklist,
    classificadas: tiposComArquivo.keys(),
    nao_se_aplica: nsaVistos,
    usar_portaria_orgao: c.usar_portaria_orgao,
    ja_prontas: jaProntas,
    ja_nao_se_aplica: jaNsa,
  });
  // Portão B (art. 72, I, II e IV) — o despacho de autorização só entra com a
  // instrução anterior a ele pronta (anexada agora, já no processo ou "não se aplica")
  if (entrada.contratacao_direta && tiposComArquivo.has('AA') && checklist.antes_da_autorizacao.length) {
    erro(
      `Para juntar o despacho de autorização, o art. 72 exige antes (junte o PDF ou marque "não se aplica", quando a lei permite): ${checklist.antes_da_autorizacao.join('; ')}.`,
      tiposComArquivo.get('AA'),
    );
  }

  acoes.sort((a, b) => (ORDEM.get(a.tipo) ?? 99) - (ORDEM.get(b.tipo) ?? 99) || (a.acao === 'NAO_SE_APLICA' ? -1 : 0));
  return { ok: erros.length === 0, erros, acoes, checklist };
}

// ============================================================================
// DADOS E ITENS
// ============================================================================

export interface ItemExterno {
  numero_item: number;
  descricao_resumida: string;
  quantidade: number;
  unidade_medida: UnidadeMedida;
  valor_unitario_estimado: number;
  tipo_item: 'MATERIAL' | 'SERVICO' | null;
  codigo_catalogo: string | null;
  codigo_catmat: string | null;
  codigo_catser: string | null;
  classe_catalogo: string | null;
  item_pca_id: string | null;
  justificativa_sem_pca: string | null;
}

const UNIDADES = new Set<string>(Object.values(UnidadeMedida));
const texto = (v: unknown, max: number) => {
  const t = String(v ?? '').trim();
  return t ? t.slice(0, max) : null;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Itens do processo feito fora: descrição, quantidade, UNIDADE (obrigatória)
 * e VALOR UNITÁRIO (decisão 2 do dono — a pesquisa foi feita fora, o mapa é
 * anexado e o valor vai para o item: o PNCP exige o valor por item).
 */
export function validarItensExternos(bruto: unknown): { ok: boolean; erros: ErroExterno[]; itens: ItemExterno[] } {
  const erros: ErroExterno[] = [];
  const lista = Array.isArray(bruto) ? bruto : [];
  if (!lista.length) erros.push({ passo: 'ITENS', mensagem: 'Informe ao menos um item (descrição, quantidade, unidade e valor unitário).' });
  if (lista.length > 1000) erros.push({ passo: 'ITENS', mensagem: 'No máximo 1000 itens por processo.' });
  const itens: ItemExterno[] = [];
  lista.forEach((i: any, idx) => {
    const n = idx + 1;
    const e = (mensagem: string) => erros.push({ passo: 'ITENS', mensagem: `Item ${n}: ${mensagem}`, indice: idx });
    const descricao = texto(i?.descricao ?? i?.descricao_resumida, 500);
    const quantidade = Number(i?.quantidade);
    const unidade = String(i?.unidade ?? i?.unidade_medida ?? '').trim().toUpperCase();
    const valor = Number(i?.valor_unitario ?? i?.valor_unitario_estimado);
    if (!descricao) e('informe a descrição.');
    if (!(quantidade > 0)) e('a quantidade deve ser maior que zero.');
    if (!unidade) e('informe a unidade de medida.');
    else if (!UNIDADES.has(unidade)) e(`unidade de medida inválida (${unidade}).`);
    if (!(valor > 0)) e('informe o valor unitário (a pesquisa de preços feita fora vira o valor do item — o PNCP exige).');
    const tipo = String(i?.tipo_item ?? '').toUpperCase();
    const pca = texto(i?.item_pca_id, 60);
    itens.push({
      numero_item: n,
      descricao_resumida: descricao ?? '',
      quantidade,
      unidade_medida: unidade as UnidadeMedida,
      valor_unitario_estimado: Math.round(valor * 10000) / 10000,
      tipo_item: tipo === 'MATERIAL' || tipo === 'SERVICO' ? tipo : null,
      codigo_catalogo: texto(i?.codigo_catalogo ?? i?.codigo_catmat ?? i?.codigo_catser, 60),
      codigo_catmat: texto(i?.codigo_catmat, 60),
      codigo_catser: texto(i?.codigo_catser, 60),
      classe_catalogo: texto(i?.classe_catalogo, 250),
      item_pca_id: pca && UUID.test(pca) ? pca : null,
      justificativa_sem_pca: texto(i?.justificativa_sem_pca, 2000),
    });
  });
  return { ok: erros.length === 0, erros, itens };
}

/** Soma dos itens (valor estimado do processo), em centavos arredondados. */
export const valorDosItensExternos = (itens: ItemExterno[]) =>
  Math.round(itens.reduce((s, i) => s + i.quantidade * i.valor_unitario_estimado, 0) * 100) / 100;

export interface DadosExternos {
  modalidade: ModalidadeLicitacao;
  tipo_contratacao: TipoContratacao;
  fundamento_legal: string | null;
  criterio_julgamento: string | null;
  modo_disputa: string | null;
  objeto: string;
  numero_processo: string;
  numero_edital: string | null;
  area_demandante: string | null;
  dispensa_com_lances: boolean | null;
  sigilo: { sigiloso: boolean; justificativa: string | null };
  demanda_id: string | null;
  /** DFD consolidado de origem (unidade de planejamento — N demandas). */
  dfd_id: string | null;
  orgao_id: string | null;
}

/**
 * Dados básicos do processo feito fora. Enquadramento, critério × modalidade
 * e modo × critério são conferidos pelas MESMAS regras da criação
 * (`LicitacoesService.create`) no serviço — aqui só a forma.
 */
export function validarDadosExternos(bruto: any): { ok: boolean; erros: ErroExterno[]; dados: DadosExternos } {
  const erros: ErroExterno[] = [];
  const e = (mensagem: string) => erros.push({ passo: 'DADOS', mensagem });
  const modalidade = String(bruto?.modalidade ?? '').trim().toUpperCase();
  if (!MODALIDADES_FEITA_FORA.includes(modalidade)) e('Escolha a modalidade (credenciamento tem cadastro próprio).');
  const tipo = String(bruto?.tipo_contratacao ?? '').trim().toUpperCase();
  if (!(Object.values(TipoContratacao) as string[]).includes(tipo)) e('Escolha a natureza do objeto (compra, serviço, obra…).');
  const objeto = texto(bruto?.objeto, 4000);
  if (!objeto || objeto.length < 5) e('Descreva o objeto da contratação.');
  const numeroProcesso = texto(bruto?.numero_processo, 60);
  if (!numeroProcesso) e('Informe o número do processo administrativo (o dos autos feitos fora).');
  let comLances: boolean | null = null;
  if (bruto?.dispensa_com_lances === true || bruto?.dispensa_com_lances === false) {
    if (modalidade !== ModalidadeLicitacao.DISPENSA_ELETRONICA) e('Com ou sem disputa de lances é escolha da dispensa eletrônica.');
    else comLances = bruto.dispensa_com_lances;
  }
  const sigiloso = bruto?.sigilo?.sigiloso === true;
  const justificativaSigilo = texto(bruto?.sigilo?.justificativa, 4000);
  const motivoSigilo = motivoSigiloInvalido(sigiloso, justificativaSigilo);
  if (motivoSigilo) e(motivoSigilo);
  const demanda = texto(bruto?.demanda_id, 60);
  if (demanda && !UUID.test(demanda)) e('Demanda de origem inválida.');
  const dfd = texto(bruto?.dfd_id, 60);
  if (dfd && !UUID.test(dfd)) e('DFD de origem inválido.');
  if (dfd && demanda) e('Informe o DFD ou a demanda de origem — não os dois.');
  const orgao = texto(bruto?.orgao_id, 60);
  return {
    ok: erros.length === 0,
    erros,
    dados: {
      modalidade: modalidade as ModalidadeLicitacao,
      tipo_contratacao: tipo as TipoContratacao,
      fundamento_legal: texto(bruto?.fundamento_legal, 20),
      criterio_julgamento: texto(bruto?.criterio_julgamento, 40),
      modo_disputa: texto(bruto?.modo_disputa, 40),
      objeto: objeto ?? '',
      numero_processo: numeroProcesso ?? '',
      numero_edital: texto(bruto?.numero_edital, 60),
      area_demandante: texto(bruto?.area_demandante, 200),
      dispensa_com_lances: comLances,
      sigilo: { sigiloso, justificativa: sigiloso ? justificativaSigilo : null },
      demanda_id: demanda,
      dfd_id: dfd,
      orgao_id: orgao && UUID.test(orgao) ? orgao : null,
    },
  };
}

/** Critério padrão da modalidade quando não informado (leilão: maior lance; concurso: melhor técnica). */
export function criterioPadraoDaModalidade(modalidade: string): string {
  if (modalidade === ModalidadeLicitacao.LEILAO) return 'MAIOR_LANCE';
  if (modalidade === ModalidadeLicitacao.CONCURSO) return 'MELHOR_TECNICA';
  return 'MENOR_PRECO';
}

/** Mensagem única (400) a partir da lista de erros. */
export const mensagemDosErros = (erros: ErroExterno[]) => (erros.length === 1 ? erros[0].mensagem : erros.map((e) => e.mensagem).join(' | '));
