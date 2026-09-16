import * as XLSX from 'xlsx';
import { EstadoConservacao } from './entities/enums';

/** Chave comparável: sem acento, minúscula, separadores viram "_". */
export function normalizarChave(s: any): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Lê as linhas da primeira aba. CSV é lido como TEXTO: senão o SheetJS
 * converte "000101225" em 101225, "106/2020" em data e "3631.27" em número,
 * e a nota fiscal/referência perdem o formato original. Aceita UTF-8 (com ou
 * sem BOM) e cai para Latin-1 quando o arquivo veio do Excel antigo.
 */
export function lerLinhasPlanilha(arquivo: Buffer): Record<string, any>[] {
  const ehZip = arquivo.length > 1 && arquivo[0] === 0x50 && arquivo[1] === 0x4b; // xlsx
  const ehOle = arquivo.length > 1 && arquivo[0] === 0xd0 && arquivo[1] === 0xcf; // xls
  let wb: XLSX.WorkBook;
  if (ehZip || ehOle) {
    wb = XLSX.read(arquivo, { type: 'buffer', cellDates: true });
  } else {
    let texto = arquivo.toString('utf8');
    if (texto.includes('�')) texto = arquivo.toString('latin1');
    wb = XLSX.read(texto.replace(/^﻿/, ''), { type: 'string', raw: true });
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: ehZip || ehOle });
}

/**
 * Valor monetário em formato brasileiro ("1.234,56", "R$ 260,00") ou com
 * ponto decimal ("3631.27", vindo de exportação). Ponto seguido de grupos de
 * 3 dígitos sem vírgula é milhar ("1.500" = 1500).
 */
export function parseValorPlanilha(v: any): number | null {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[R$\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Taxa anual de depreciação (%) → vida útil em anos (100 / taxa).
 * Taxa zero = o sistema anterior não depreciava: sem vida útil (o bem fica
 * fora do cálculo) e com observação, em vez de um residual de 100% que
 * apareceria como "totalmente depreciado".
 */
export function vidaUtilPorTaxa(v: any): { vida_util_anos?: number; observacao?: string } {
  const taxa = parseValorPlanilha(v);
  if (taxa == null || taxa < 0) return {};
  if (taxa === 0) return { observacao: 'Sem depreciação no sistema anterior (taxa 0%).' };
  const anos = Math.round(100 / taxa);
  return anos >= 1 ? { vida_util_anos: anos } : {};
}

/**
 * "Setores" do sistema anterior que na verdade são situações do bem.
 * O bem continua no setor de mesmo nome (para a comissão tratar), e a
 * situação vira dado: conservação, categoria ou observação.
 */
export function situacaoPorSetor(nomeSetor: any): {
  estado?: EstadoConservacao;
  categoria?: string;
  observacao?: string;
} {
  const s = normalizarChave(nomeSetor);
  if (!s) return {};
  if (s.includes('inservive')) {
    return { estado: EstadoConservacao.INSERVIVEL, observacao: 'Em processo de devolução/inservível no sistema anterior.' };
  }
  if (s.includes('localizacao')) return { observacao: 'Em processo de localização no sistema anterior.' };
  if (s.includes('cedido')) return { observacao: 'Bem cedido, conforme o sistema anterior.' };
  if (s.includes('imoveis') || s.includes('imovel')) return { categoria: 'Bens imóveis' };
  return {};
}

/** Junta observações sem repetir nem deixar texto vazio. */
export function juntarObservacoes(...partes: any[]): string | undefined {
  const unicas = [...new Set(partes.map((p) => String(p ?? '').trim()).filter(Boolean))];
  return unicas.length ? unicas.join(' ') : undefined;
}
