/**
 * FUNDAMENTO LEGAL DO PROCESSO — fonte ÚNICA da verdade (Entrega 1 da fase
 * interna, docs/licitacao/PLANO-FASE-INTERNA.md §5.1).
 *
 * Antes o enquadramento era deduzido da modalidade + tipo de contratação
 * (dispensa → art. 75, I ou II; inexigibilidade → art. 74, caput) e cada peça
 * repetia o inciso em texto livre — foi assim que a Dispensa 029/2025 da
 * Câmara de LEM saiu com "art. 75, I" no extrato e "art. 75, II" no aviso.
 * Agora o processo guarda UM código (`licitacoes.fundamento_legal`) e tudo
 * deriva dele: o amparo legal do PNCP, o texto dos modelos de documento e do
 * aviso, o inciso do limite de dispensa.
 *
 * Os códigos espelham, um a um, a tabela de domínio "Amparo Legal" do PNCP
 * (docs/Tabelas de Domínio e Regras de Conformid.md) — por isso o id do PNCP
 * sai da tabela abaixo, sem regra paralela.
 *
 * Módulo puro: sem TypeORM e sem importar a entidade (a modalidade é lida como
 * string), para poder ser usado por entidades, mapeamento do PNCP e migrações.
 */

export enum FundamentoLegal {
  // Licitação (art. 28) — um por modalidade
  ART28_I = 'ART28_I', // pregão
  ART28_II = 'ART28_II', // concorrência
  ART28_III = 'ART28_III', // concurso
  ART28_IV = 'ART28_IV', // leilão
  ART28_V = 'ART28_V', // diálogo competitivo
  // Inexigibilidade (art. 74)
  ART74_CAPUT = 'ART74_CAPUT',
  ART74_I = 'ART74_I',
  ART74_II = 'ART74_II',
  ART74_III_A = 'ART74_III_A',
  ART74_III_B = 'ART74_III_B',
  ART74_III_C = 'ART74_III_C',
  ART74_III_D = 'ART74_III_D',
  ART74_III_E = 'ART74_III_E',
  ART74_III_F = 'ART74_III_F',
  ART74_III_G = 'ART74_III_G',
  ART74_III_H = 'ART74_III_H',
  ART74_IV = 'ART74_IV',
  ART74_V = 'ART74_V',
  // Dispensa (art. 75)
  ART75_I = 'ART75_I',
  ART75_II = 'ART75_II',
  ART75_III_A = 'ART75_III_A',
  ART75_III_B = 'ART75_III_B',
  ART75_IV_A = 'ART75_IV_A',
  ART75_IV_B = 'ART75_IV_B',
  ART75_IV_C = 'ART75_IV_C',
  ART75_IV_D = 'ART75_IV_D',
  ART75_IV_E = 'ART75_IV_E',
  ART75_IV_F = 'ART75_IV_F',
  ART75_IV_G = 'ART75_IV_G',
  ART75_IV_H = 'ART75_IV_H',
  ART75_IV_I = 'ART75_IV_I',
  ART75_IV_J = 'ART75_IV_J',
  ART75_IV_K = 'ART75_IV_K',
  ART75_IV_L = 'ART75_IV_L',
  ART75_IV_M = 'ART75_IV_M',
  ART75_V = 'ART75_V',
  ART75_VI = 'ART75_VI',
  ART75_VII = 'ART75_VII',
  ART75_VIII = 'ART75_VIII',
  ART75_IX = 'ART75_IX',
  ART75_X = 'ART75_X',
  ART75_XI = 'ART75_XI',
  ART75_XII = 'ART75_XII',
  ART75_XIII = 'ART75_XIII',
  ART75_XIV = 'ART75_XIV',
  ART75_XV = 'ART75_XV',
  ART75_XVI = 'ART75_XVI',
  // Procedimentos auxiliares (art. 78)
  ART78_I = 'ART78_I', // credenciamento
  ART78_II = 'ART78_II',
  ART78_III = 'ART78_III',
}

export type FamiliaFundamento = 'ART28' | 'ART74' | 'ART75' | 'ART78';

/** Inciso do art. 75 cujo LIMITE DE VALOR se aplica (dispensa por valor). */
export type IncisoLimiteDispensa = 'I' | 'II';

export interface DefinicaoFundamento {
  codigo: FundamentoLegal;
  /** Id na tabela "Amparo Legal" do PNCP. */
  amparoPncp: number;
  /** Referência curta, como vai nas peças: "art. 75, II". */
  referencia: string;
  /** Resumo da hipótese (para o select da tela). */
  descricao: string;
  familia: FamiliaFundamento;
  /** Só art. 75, I e II: dispensa em razão do valor (limite por exercício). */
  incisoLimite?: IncisoLimiteDispensa;
}

const f = (
  codigo: FundamentoLegal,
  amparoPncp: number,
  referencia: string,
  descricao: string,
  incisoLimite?: IncisoLimiteDispensa,
): DefinicaoFundamento => ({
  codigo,
  amparoPncp,
  referencia,
  descricao,
  familia: codigo.slice(0, 5) as FamiliaFundamento,
  ...(incisoLimite ? { incisoLimite } : {}),
});

const F = FundamentoLegal;

/** Tabela única (ordem = ordem do select). Ids do PNCP: tabela "Amparo Legal". */
export const FUNDAMENTOS_LEGAIS: readonly DefinicaoFundamento[] = [
  f(F.ART28_I, 1, 'art. 28, I', 'Pregão'),
  f(F.ART28_II, 2, 'art. 28, II', 'Concorrência'),
  f(F.ART28_III, 3, 'art. 28, III', 'Concurso'),
  f(F.ART28_IV, 4, 'art. 28, IV', 'Leilão'),
  f(F.ART28_V, 5, 'art. 28, V', 'Diálogo competitivo'),
  f(F.ART74_CAPUT, 50, 'art. 74, caput', 'Inviabilidade de competição (hipótese não enumerada)'),
  f(F.ART74_I, 6, 'art. 74, I', 'Fornecedor exclusivo'),
  f(F.ART74_II, 7, 'art. 74, II', 'Profissional do setor artístico'),
  f(F.ART74_III_A, 8, 'art. 74, III, "a"', 'Serviço técnico especializado — estudos, planejamentos e projetos'),
  f(F.ART74_III_B, 9, 'art. 74, III, "b"', 'Serviço técnico especializado — pareceres, perícias e avaliações'),
  f(F.ART74_III_C, 10, 'art. 74, III, "c"', 'Serviço técnico especializado — assessorias ou consultorias'),
  f(F.ART74_III_D, 11, 'art. 74, III, "d"', 'Serviço técnico especializado — fiscalização, supervisão ou gerenciamento de obras'),
  f(F.ART74_III_E, 12, 'art. 74, III, "e"', 'Serviço técnico especializado — patrocínio ou defesa de causas'),
  f(F.ART74_III_F, 13, 'art. 74, III, "f"', 'Serviço técnico especializado — treinamento e aperfeiçoamento de pessoal'),
  f(F.ART74_III_G, 14, 'art. 74, III, "g"', 'Serviço técnico especializado — restauração de obras de arte e bens de valor histórico'),
  f(F.ART74_III_H, 15, 'art. 74, III, "h"', 'Serviço técnico especializado — controles de qualidade e tecnológico'),
  f(F.ART74_IV, 16, 'art. 74, IV', 'Objetos contratados por credenciamento'),
  f(F.ART74_V, 17, 'art. 74, V', 'Aquisição ou locação de imóvel'),
  f(F.ART75_I, 18, 'art. 75, I', 'Dispensa por valor — obras, serviços de engenharia e manutenção de veículos', 'I'),
  f(F.ART75_II, 19, 'art. 75, II', 'Dispensa por valor — outros serviços e compras', 'II'),
  f(F.ART75_III_A, 20, 'art. 75, III, "a"', 'Licitação anterior deserta (sem licitantes interessados)'),
  f(F.ART75_III_B, 21, 'art. 75, III, "b"', 'Licitação anterior fracassada (propostas inválidas ou acima do mercado)'),
  f(F.ART75_IV_A, 22, 'art. 75, IV, "a"', 'Bens/serviços com garantia técnica exigida pelo fornecedor'),
  f(F.ART75_IV_B, 23, 'art. 75, IV, "b"', 'Acordo internacional'),
  f(F.ART75_IV_C, 24, 'art. 75, IV, "c"', 'Produtos para pesquisa e desenvolvimento'),
  f(F.ART75_IV_D, 25, 'art. 75, IV, "d"', 'Transferência de tecnologia (ICT)'),
  f(F.ART75_IV_E, 26, 'art. 75, IV, "e"', 'Hortifrutigranjeiros, pães e perecíveis'),
  f(F.ART75_IV_F, 27, 'art. 75, IV, "f"', 'Bens ou serviços produzidos no País de alta complexidade tecnológica e defesa'),
  f(F.ART75_IV_G, 28, 'art. 75, IV, "g"', 'Materiais de uso das Forças Armadas'),
  f(F.ART75_IV_H, 29, 'art. 75, IV, "h"', 'Contingentes militares em operações de paz'),
  f(F.ART75_IV_I, 30, 'art. 75, IV, "i"', 'Abastecimento de embarcações, aeronaves ou tropas em trânsito'),
  f(F.ART75_IV_J, 31, 'art. 75, IV, "j"', 'Coleta e reciclagem por associações de catadores'),
  f(F.ART75_IV_K, 32, 'art. 75, IV, "k"', 'Obras de arte e objetos históricos'),
  f(F.ART75_IV_L, 33, 'art. 75, IV, "l"', 'Serviços especializados ou equipamentos para investigação sigilosa'),
  f(F.ART75_IV_M, 34, 'art. 75, IV, "m"', 'Medicamentos para doenças raras'),
  f(F.ART75_V, 35, 'art. 75, V', 'Inovação e pesquisa científica e tecnológica'),
  f(F.ART75_VI, 36, 'art. 75, VI', 'Comprometimento da segurança nacional'),
  f(F.ART75_VII, 37, 'art. 75, VII', 'Guerra, estado de defesa, estado de sítio, intervenção federal ou grave perturbação da ordem'),
  f(F.ART75_VIII, 38, 'art. 75, VIII', 'Emergência ou calamidade pública'),
  f(F.ART75_IX, 39, 'art. 75, IX', 'Órgão ou entidade da Administração criado para esse fim'),
  f(F.ART75_X, 40, 'art. 75, X', 'Intervenção no domínio econômico'),
  f(F.ART75_XI, 41, 'art. 75, XI', 'Contrato de programa'),
  f(F.ART75_XII, 42, 'art. 75, XII', 'Transferência de tecnologia de produtos estratégicos para o SUS'),
  f(F.ART75_XIII, 43, 'art. 75, XIII', 'Profissionais para comissão de avaliação de concurso'),
  f(F.ART75_XIV, 44, 'art. 75, XIV', 'Associação de pessoas com deficiência'),
  f(F.ART75_XV, 45, 'art. 75, XV', 'Instituição de pesquisa, ensino ou desenvolvimento institucional'),
  f(F.ART75_XVI, 46, 'art. 75, XVI', 'Insumos estratégicos para a saúde (fundação pública)'),
  f(F.ART78_I, 47, 'art. 78, I', 'Credenciamento'),
  f(F.ART78_II, 48, 'art. 78, II', 'Pré-qualificação'),
  f(F.ART78_III, 49, 'art. 78, III', 'Procedimento de manifestação de interesse'),
];

const POR_CODIGO = new Map<string, DefinicaoFundamento>(FUNDAMENTOS_LEGAIS.map((d) => [d.codigo, d]));

export const LEI_14133 = 'Lei 14.133/2021';

const up = (v: unknown) => String(v ?? '').toUpperCase();

export function ehFundamentoLegal(v: unknown): v is FundamentoLegal {
  return typeof v === 'string' && POR_CODIGO.has(v);
}

export function definicaoDoFundamento(codigo: FundamentoLegal | string | null | undefined): DefinicaoFundamento | null {
  return codigo ? (POR_CODIGO.get(String(codigo)) ?? null) : null;
}

/** Fundamentos admitidos para a modalidade (a tela oferece só estes). */
export function fundamentosDaModalidade(modalidade: string | null | undefined): DefinicaoFundamento[] {
  const m = up(modalidade);
  const fam = (familia: FamiliaFundamento) => FUNDAMENTOS_LEGAIS.filter((d) => d.familia === familia);
  if (m.startsWith('PREGAO')) return [POR_CODIGO.get(F.ART28_I)!];
  if (m.startsWith('CONCORRENCIA')) return [POR_CODIGO.get(F.ART28_II)!];
  if (m === 'CONCURSO') return [POR_CODIGO.get(F.ART28_III)!];
  if (m.startsWith('LEILAO')) return [POR_CODIGO.get(F.ART28_IV)!];
  if (m === 'DIALOGO_COMPETITIVO') return [POR_CODIGO.get(F.ART28_V)!];
  if (m.startsWith('DISPENSA')) return fam('ART75');
  if (m === 'INEXIGIBILIDADE') return fam('ART74');
  if (m === 'CREDENCIAMENTO') return [POR_CODIGO.get(F.ART78_I)!];
  return [];
}

/**
 * Enquadramento PADRÃO quando o processo ainda não tem o campo (o mesmo que o
 * sistema sempre deduziu): dispensa → art. 75, I (obra/engenharia) ou II;
 * inexigibilidade → art. 74, caput; licitações → art. 28 pela modalidade.
 */
export function fundamentoPadrao(modalidade: string | null | undefined, tipoContratacao?: string | null): FundamentoLegal | null {
  const m = up(modalidade);
  if (m.startsWith('DISPENSA')) {
    const tc = up(tipoContratacao);
    return tc.includes('OBRA') || tc.includes('ENGENHARIA') ? F.ART75_I : F.ART75_II;
  }
  if (m === 'INEXIGIBILIDADE') return F.ART74_CAPUT;
  const lista = fundamentosDaModalidade(m);
  return lista.length === 1 ? lista[0].codigo : null;
}

/** Motivo da recusa (ou null) de um fundamento para a modalidade. */
export function motivoFundamentoInvalido(modalidade: string | null | undefined, fundamento: unknown): string | null {
  if (fundamento === null || fundamento === undefined || fundamento === '') return null;
  if (!ehFundamentoLegal(fundamento)) return `Fundamento legal desconhecido: ${String(fundamento)}`;
  const admitidos = fundamentosDaModalidade(modalidade);
  if (!admitidos.some((d) => d.codigo === fundamento)) {
    const def = POR_CODIGO.get(fundamento)!;
    return `O fundamento ${def.referencia} não se aplica à modalidade ${modalidade} — escolha entre: ${admitidos.map((d) => d.referencia).join('; ') || 'nenhum'}`;
  }
  return null;
}

export interface LicitacaoComFundamento {
  modalidade?: string | null;
  tipo_contratacao?: string | null;
  fundamento_legal?: string | null;
}

/**
 * Fundamento EFETIVO: o gravado no processo quando é válido para a
 * modalidade; senão o padrão. Toda leitura (PNCP, peças, limite) passa aqui.
 */
export function fundamentoEfetivo(lic: LicitacaoComFundamento): FundamentoLegal | null {
  const gravado = lic.fundamento_legal;
  if (ehFundamentoLegal(gravado) && !motivoFundamentoInvalido(lic.modalidade, gravado)) return gravado;
  return fundamentoPadrao(lic.modalidade, lic.tipo_contratacao);
}

/** "Lei 14.133/2021, art. 75, II" (ou null). */
export function textoDoFundamento(codigo: FundamentoLegal | string | null | undefined): string | null {
  const d = definicaoDoFundamento(codigo);
  return d ? `${LEI_14133}, ${d.referencia}` : null;
}

/** Id do amparo legal no PNCP (ou null). */
export function amparoPncpDoFundamento(codigo: FundamentoLegal | string | null | undefined): number | null {
  return definicaoDoFundamento(codigo)?.amparoPncp ?? null;
}

/** Inciso do limite de valor (só art. 75, I e II). */
export function incisoLimiteDoFundamento(codigo: FundamentoLegal | string | null | undefined): IncisoLimiteDispensa | null {
  return definicaoDoFundamento(codigo)?.incisoLimite ?? null;
}

// ---------------------------------------------------------------------------
// Leitura de texto livre (migração dos processos existentes)
// ---------------------------------------------------------------------------

const ROMANOS = 'XVI|XV|XIV|XIII|XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I';

/**
 * Lê "art. 75, II", "Art. 74, inciso III, alínea c", "artigo 75, IV, 'e'" de
 * um texto livre e devolve o código — só se for admitido pela modalidade.
 * Usado pela migração de boot (peças/contratos antigos com amparo em texto).
 */
export function fundamentoDoTexto(texto: string | null | undefined, modalidade?: string | null): FundamentoLegal | null {
  if (!texto) return null;
  const limpo = String(texto)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
  const re = new RegExp(
    `\\bart(?:igo)?\\.?\\s*(7[458]|28)\\s*(?:,|\\s)\\s*(?:inc(?:iso|\\.)?\\s*)?(${ROMANOS})\\b(?:\\s*,?\\s*(?:al[íi]nea\\s*)?["“'‘]?([a-m])["”'’]?\\b)?`,
    'gi',
  );
  const admitidos = modalidade ? new Set(fundamentosDaModalidade(modalidade).map((d) => d.codigo)) : null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(limpo))) {
    const artigo = m[1];
    const inciso = m[2].toUpperCase();
    const alinea = m[3] ? m[3].toUpperCase() : null;
    const candidatos = [alinea ? `ART${artigo}_${inciso}_${alinea}` : null, `ART${artigo}_${inciso}`].filter(Boolean) as string[];
    for (const c of candidatos) {
      if (ehFundamentoLegal(c) && (!admitidos || admitidos.has(c))) return c;
    }
  }
  if (/\bart(?:igo)?\.?\s*74\s*,?\s*caput\b/i.test(limpo)) {
    if (!admitidos || admitidos.has(F.ART74_CAPUT)) return F.ART74_CAPUT;
  }
  return null;
}
