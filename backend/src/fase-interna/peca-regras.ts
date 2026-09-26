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

/**
 * A peça CONTA como pronta no checklist (sem fluxo de aprovação configurado)?
 * Anexada (IMPORTADO), aprovada ou assinada: sim. Aguardando assinatura,
 * pendente ou reprovada: não. Elaborada no sistema: basta ter conteúdo ou
 * arquivo — na pesquisa de preços, ao menos uma cotação.
 */
export function pecaContaComoPronta(doc: {
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
  if (doc.caminho_arquivo || doc.arquivo_pdf_path || (doc.descricao && doc.descricao.trim())) return true;
  // Pesquisa de preços: o módulo cria o documento (itens sem cotação) só de
  // abrir a tela — conta quando há ao menos uma cotação registrada.
  if (doc.tipo === 'PP' && dados && Array.isArray(dados.itens)) {
    return dados.itens.some((i: any) => (i?.cotacoes?.length ?? 0) > 0);
  }
  return Boolean(dados && typeof dados === 'object' && Object.keys(dados).length > 0);
}
