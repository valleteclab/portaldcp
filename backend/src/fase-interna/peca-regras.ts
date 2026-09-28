/**
 * REGRAS DA PEÇA DA FASE INTERNA (Entrega 1) — funções puras.
 *
 *  - Data da peça: gerada e assinada no sistema → momento da (última)
 *    assinatura, nunca digitada; anexada (feita fora) → informada por quem
 *    anexa, obrigatória e nunca futura (o sistema guarda também o envio).
 *  - Versões: substituir cria versão nova; a anterior vira SUBSTITUIDO.
 *  - Folhas: sequência única por processo, atribuída quando a peça é
 *    finalizada (anexo recebido ou assinatura concluída).
 */
import { createHash } from 'crypto';

/** Data de hoje no fuso de Brasília (YYYY-MM-DD) — convenção do projeto (UTC-3). */
export function hojeEmBrasilia(agora: Date = new Date()): string {
  return new Date(agora.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

export type ResultadoData = { ok: true; data: Date; dia: string } | { ok: false; erro: string };

/**
 * Data do documento ANEXADO. Aceita "YYYY-MM-DD" (ou ISO completo — vale o
 * dia). Guardada ao meio-dia de Brasília: nenhuma tela ou PDF "volta um dia"
 * por causa do fuso.
 */
export function validarDataDocumentoAnexo(valor: unknown, agora: Date = new Date()): ResultadoData {
  const texto = String(valor ?? '').trim();
  if (!texto) return { ok: false, erro: 'Informe a data do documento (a data que consta na peça, não a do envio).' };
  const m = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return { ok: false, erro: 'Data do documento inválida — use o formato AAAA-MM-DD.' };
  const dia = `${m[1]}-${m[2]}-${m[3]}`;
  const data = new Date(`${dia}T12:00:00-03:00`);
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== dia) {
    return { ok: false, erro: 'Data do documento inválida.' };
  }
  if (Number(m[1]) < 1990) return { ok: false, erro: 'Data do documento inválida (anterior a 1990).' };
  if (dia > hojeEmBrasilia(agora)) return { ok: false, erro: 'A data do documento não pode ser futura.' };
  return { ok: true, data, dia };
}

/** Data da peça assinada no sistema: a da ÚLTIMA assinatura (todas colhidas). */
export function dataDocumentoDaAssinatura(datas: Array<Date | string | null | undefined>): Date | null {
  const validas = datas.map((d) => (d ? new Date(d) : null)).filter((d): d is Date => !!d && !Number.isNaN(d.getTime()));
  if (!validas.length) return null;
  return new Date(Math.max(...validas.map((d) => d.getTime())));
}

/** Próxima faixa de folhas dos autos, depois da última já atribuída no processo. */
export function proximaFaixaDeFolhas(ultimaFolha: number | null | undefined, paginas: number): { folha_inicial: number; folha_final: number } {
  const n = Math.max(1, Math.floor(Number(paginas) || 1));
  const inicio = Math.max(0, Math.floor(Number(ultimaFolha) || 0)) + 1;
  return { folha_inicial: inicio, folha_final: inicio + n - 1 };
}

/** Versão nova de uma peça: número e a que ela substitui. */
export function planoNovaVersao(atual: { id: string; versao?: number | null } | null | undefined): { versao: number; versao_anterior_id: string | null } {
  if (!atual) return { versao: 1, versao_anterior_id: null };
  return { versao: (Number(atual.versao) || 1) + 1, versao_anterior_id: atual.id };
}

/** Signatários informados no anexo: aceita JSON (multipart) ou lista; nome obrigatório. */
export function normalizarSignatariosInformados(valor: unknown): Array<{ nome: string; cargo: string | null }> {
  let lista: unknown = valor;
  if (typeof valor === 'string') {
    const t = valor.trim();
    if (!t) return [];
    try {
      lista = JSON.parse(t);
    } catch {
      // "Fulano - Procurador; Beltrano - Presidente"
      lista = t.split(/[;\n]/).map((p) => {
        const [nome, ...cargo] = p.split(/\s[-–—]\s/);
        return { nome, cargo: cargo.join(' - ') };
      });
    }
  }
  if (!Array.isArray(lista)) return [];
  return lista
    .map((x: any) => ({
      nome: String(x?.nome ?? '').trim().slice(0, 200),
      cargo: String(x?.cargo ?? '').trim().slice(0, 200) || null,
    }))
    .filter((x) => x.nome)
    .slice(0, 20);
}

/** O arquivo é PDF de verdade (assinatura "%PDF-" nos primeiros bytes)? */
export function pareceSerPdf(buffer: Buffer | null | undefined): boolean {
  if (!buffer || buffer.length < 5) return false;
  const inicio = buffer.subarray(0, Math.min(1024, buffer.length)).toString('latin1');
  return inicio.includes('%PDF-');
}

/** JSON com as chaves em ordem (a impressão não depende da ordem de gravação). */
function jsonEstavel(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (Array.isArray(v)) return `[${v.map(jsonEstavel).join(',')}]`;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${jsonEstavel(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

/**
 * IMPRESSÃO DO CONTEÚDO da peça feita no sistema: o texto (`descricao`) e os
 * dados das seções/estrutura — sem as chaves internas (`_…`: autor da edição,
 * registro de emissão, marcações). Qualquer edição depois da emissão muda a
 * impressão, e a peça volta a "em elaboração".
 */
export function impressaoConteudoPeca(doc: { descricao?: string | null; dados_estruturados?: any }): string {
  const dados = doc.dados_estruturados && typeof doc.dados_estruturados === 'object' ? doc.dados_estruturados : {};
  const conteudo: Record<string, unknown> = {};
  for (const k of Object.keys(dados)) if (!k.startsWith('_')) conteudo[k] = dados[k];
  return createHash('sha256')
    .update(jsonEstavel([String(doc.descricao ?? '').trim(), conteudo]))
    .digest('hex');
}

/** Registro da EMISSÃO (`dados_estruturados._emitido`): o documento foi gerado/emitido com este conteúdo. */
export interface RegistroEmissao {
  impressao?: string;
  em: string;
  por_id?: string | null;
  por_nome?: string | null;
  /** Peça pronta pela regra anterior (texto bastava), em processo já divulgado — migração de boot. */
  legado?: boolean;
  motivo?: string | null;
}

export function registroDeEmissao(
  doc: { descricao?: string | null; dados_estruturados?: any },
  autor?: { id?: string | null; nome?: string | null } | null,
  agora: Date = new Date(),
): RegistroEmissao {
  return { impressao: impressaoConteudoPeca(doc), em: agora.toISOString(), por_id: autor?.id ?? null, por_nome: autor?.nome ?? null };
}

/**
 * A peça feita no sistema está EMITIDA com o conteúdo atual? (gerada/emitida
 * e não editada depois). Sem registro de emissão: o PDF gerado antes desta
 * regra conta (não "desprontar" o que já foi emitido); só texto, não.
 */
export function pecaEmitida(doc: { caminho_arquivo?: string | null; arquivo_pdf_path?: string | null; descricao?: string | null; dados_estruturados?: any }): boolean {
  const emitido = doc.dados_estruturados?._emitido as RegistroEmissao | undefined;
  if (emitido && typeof emitido === 'object') {
    if (emitido.legado) return true;
    return !!emitido.impressao && emitido.impressao === impressaoConteudoPeca(doc);
  }
  return !!(doc.caminho_arquivo || doc.arquivo_pdf_path);
}

/**
 * A peça CONTA como pronta no checklist (sem fluxo de aprovação configurado)?
 *  - Anexada (IMPORTADO), aprovada ou assinada: sim.
 *  - Aguardando assinatura, em aprovação, pendente, reprovada ou substituída: não.
 *  - Feita no sistema: SÓ depois de GERADA/EMITIDA (DFD/ETP/TR/minutas
 *    gerados, mapa da pesquisa emitido, informação orçamentária emitida…) e
 *    sem edição posterior. O rascunho salvo automaticamente é "em elaboração"
 *    — mesmo com texto (homologação 26/09/2026, E4: o DFD ficava "Pronta"
 *    só com o autosave; a pesquisa, antes do mapa).
 */
export function pecaContaComoPronta(doc: {
  tipo: string;
  status: string;
  caminho_arquivo?: string | null;
  arquivo_pdf_path?: string | null;
  descricao?: string | null;
  dados_estruturados?: any;
}): boolean {
  // Em aprovação interna (fluxo de aprovação do órgão): ainda não é ato
  if (['REPROVADO', 'PENDENTE', 'AGUARDANDO_ASSINATURA', 'AGUARDANDO_APROVACAO', 'SUBSTITUIDO'].includes(doc.status)) return false;
  if (['APROVADO', 'IMPORTADO', 'ASSINADO'].includes(doc.status)) return true;
  // Entrega 3B: peça gerada que SÓ vale assinada (despacho de autorização,
  // parecer, controle interno) — o texto pronto ainda não é o ato.
  if (doc.dados_estruturados?._exige_assinatura) return false;
  return pecaEmitida(doc);
}

/**
 * Regra ANTERIOR (texto bastava) — só para a migração de boot, que marca como
 * emitidas as peças que já contavam como prontas em processos já divulgados
 * (os autos e as etapas desses processos não mudam).
 */
export function pecaProntaPelaRegraAnterior(doc: {
  tipo: string;
  status: string;
  caminho_arquivo?: string | null;
  arquivo_pdf_path?: string | null;
  descricao?: string | null;
  dados_estruturados?: any;
}): boolean {
  if (['REPROVADO', 'PENDENTE', 'AGUARDANDO_ASSINATURA', 'SUBSTITUIDO'].includes(doc.status)) return false;
  if (['APROVADO', 'IMPORTADO', 'ASSINADO'].includes(doc.status)) return true;
  const dados = doc.dados_estruturados;
  if (dados?._exige_assinatura) return false;
  if (doc.caminho_arquivo || doc.arquivo_pdf_path || (doc.descricao && doc.descricao.trim())) return true;
  if (doc.tipo === 'PP' && dados && Array.isArray(dados.itens)) {
    return dados.itens.some((i: any) => (i?.cotacoes?.length ?? 0) > 0);
  }
  return Boolean(dados && typeof dados === 'object' && Object.keys(dados).length > 0);
}

/** Seções (conteúdo) da peça feita no sistema — sem as chaves internas (`_…`) nem o "não se aplica". */
export function conteudoEditavel(dados: unknown): Record<string, any> {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return {};
  const r: Record<string, any> = {};
  for (const [k, v] of Object.entries(dados as Record<string, any>)) {
    if (k.startsWith('_') || k === 'nao_se_aplica' || k === 'justificativa_nao_se_aplica') continue;
    if (typeof v === 'string' ? v.replace(/<[^>]+>/g, '').trim() : v != null) r[k] = v;
  }
  return r;
}

/** O texto salvo da seção é o mesmo (ignorando só espaços nas pontas e o parágrafo vazio)? */
export function mesmoTextoDaSecao(antes: unknown, depois: unknown): boolean {
  const n = (v: unknown) => {
    const t = typeof v === 'string' ? v.trim() : '';
    return t === '<p></p>' ? '' : t;
  };
  return typeof antes === 'string' && n(antes) === n(depois);
}
