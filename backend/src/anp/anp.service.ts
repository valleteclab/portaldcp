import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import axios from 'axios';

const ANP_BASE =
  'https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/arquivos-lpc';

export interface PrecoAnp {
  produto: string;
  unidade_medida: string;
  preco_medio_revenda: number;
  preco_minimo_revenda: number;
  preco_maximo_revenda: number;
  numero_postos: number;
  data_inicial: string;
  data_final: string;
}

export interface PrecosBarreirasResponse {
  municipio: string;
  estado: string;
  data_inicial: string;
  data_final: string;
  precos: PrecoAnp[];
  /** URL para download da planilha Excel no site da ANP */
  url_planilha?: string;
}

export interface PrecosBarreirasMultiploResponse {
  semanas: PrecosBarreirasResponse[];
}

/**
 * ANP usa semanas de domingo a sábado (sempre 7 dias).
 * Ex: 28/12 a 03/01, 04/01 a 10/01, 11/01 a 17/01. Última semana de jan: 29/01 a 04/02.
 */
function getSemanasParaTentar(): { inicio: string; fim: string }[] {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const semanas: { inicio: string; fim: string }[] = [];
  const hoje = new Date();

  // Último sábado (fim da última semana completa). Dom=0, Seg=1, ..., Sáb=6
  const diasParaSabado = (hoje.getDay() + 1) % 7; // 0 se hoje é sábado
  const ultimoSabado = new Date(hoje);
  ultimoSabado.setDate(hoje.getDate() - diasParaSabado);
  const ultimoDomingo = new Date(ultimoSabado);
  ultimoDomingo.setDate(ultimoSabado.getDate() - 6);

  for (let n = 0; n <= 4; n++) {
    const inicio = new Date(ultimoDomingo);
    inicio.setDate(ultimoDomingo.getDate() - n * 7);
    const fim = new Date(ultimoSabado);
    fim.setDate(ultimoSabado.getDate() - n * 7);
    semanas.push({ inicio: fmt(inicio), fim: fmt(fim) });
  }
  return semanas;
}

function formatarData(val: unknown): string {
  if (val == null || val === '') return '';
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const num = typeof val === 'number' ? val : (typeof val === 'string' && /^\d+(\.\d+)?$/.test(val) ? parseFloat(val) : NaN);
  if (!Number.isNaN(num) && num > 1000) {
    // Excel serial date
    const dt = new Date((num - 25569) * 86400 * 1000);
    return dt.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? '' : dt.toISOString().slice(0, 10);
}

function parseBufferToPrecos(buffer: Buffer): PrecosBarreirasResponse {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets['MUNICIPIOS'];
  if (!sheet) {
    throw new Error('Planilha MUNICIPIOS não encontrada no arquivo.');
  }

  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 }) as unknown[][];
  const headerRow = 9;
  const headers = rows[headerRow] as string[];
  const dataStart = headerRow + 1;

  const idx = {
    dataInicial: headers.findIndex((h) => h?.includes('DATA INICIAL')),
    dataFinal: headers.findIndex((h) => h?.includes('DATA FINAL')),
    estado: headers.findIndex((h) => h?.includes('ESTADO')),
    municipio: headers.findIndex((h) => h?.includes('MUNICÍPIO')),
    produto: headers.findIndex((h) => h?.includes('PRODUTO')),
    postos: headers.findIndex((h) => h?.includes('POSTOS')),
    unidade: headers.findIndex((h) => h?.includes('UNIDADE')),
    precoMedio: headers.findIndex((h) => h?.includes('PREÇO MÉDIO')),
    precoMin: headers.findIndex((h) => h?.includes('PREÇO MÍNIMO')),
    precoMax: headers.findIndex((h) => h?.includes('PREÇO MÁXIMO')),
  };

  const precos: PrecoAnp[] = [];
  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const municipio = String(row[idx.municipio] ?? '').trim().toUpperCase();
    const estado = String(row[idx.estado] ?? '').trim().toUpperCase();

    if (municipio !== 'BARREIRAS' || !estado.includes('BAHIA')) continue;

    const produto = String(row[idx.produto] ?? '').trim();
    const precoMedio = Number(row[idx.precoMedio]) || 0;
    const precoMin = Number(row[idx.precoMin]) || 0;
    const precoMax = Number(row[idx.precoMax]) || 0;
    const postos = Number(row[idx.postos]) || 0;
    const unidade = String(row[idx.unidade] ?? '').trim();
    const dataInicial = formatarData(row[idx.dataInicial]);
    const dataFinal = formatarData(row[idx.dataFinal]);

    precos.push({
      produto,
      unidade_medida: unidade,
      preco_medio_revenda: precoMedio,
      preco_minimo_revenda: precoMin,
      preco_maximo_revenda: precoMax,
      numero_postos: postos,
      data_inicial: dataInicial,
      data_final: dataFinal,
    });
  }

  if (precos.length === 0) {
    throw new Error('Nenhum preço encontrado para Barreiras-BA no arquivo.');
  }

  const dataInicial = precos[0].data_inicial;
  const dataFinal = precos[0].data_final;
  const ano = dataInicial.slice(0, 4);
  const urlPlanilha = `${ANP_BASE}/${ano}/resumo_semanal_lpc_${dataInicial}_${dataFinal}.xlsx`;

  return {
    municipio: 'Barreiras',
    estado: 'Bahia',
    data_inicial: dataInicial,
    data_final: dataFinal,
    precos,
    url_planilha: urlPlanilha,
  };
}

async function fetchWeekBuffer(inicio: string, fim: string): Promise<Buffer | null> {
  const ano = inicio.slice(0, 4);
  const urls = [
    `${ANP_BASE}/${ano}/resumo_semanal_lpc_${inicio}_${fim}.xlsx`,
    `${ANP_BASE}/${ano}/resumo_semanal_lpc_${inicio}_${fim}-1.xlsx`,
  ];

  for (const url of urls) {
    try {
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        validateStatus: (s) => s === 200,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      });
      if (res.data && res.data.byteLength > 0) {
        return Buffer.from(res.data);
      }
    } catch {
      continue;
    }
  }
  return null;
}

@Injectable()
export class AnpService {
  /**
   * Busca preços das últimas 2 semanas para Barreiras-BA.
   * Faz download do Excel da ANP, parseia e filtra por município/estado.
   */
  async getPrecosBarreirasBa(): Promise<PrecosBarreirasMultiploResponse> {
    const semanasParaTentar = getSemanasParaTentar();
    const semanas: PrecosBarreirasResponse[] = [];
    const urlsTentadas: string[] = [];

    for (let i = 0; i < Math.min(2, semanasParaTentar.length); i++) {
      const { inicio, fim } = semanasParaTentar[i];
      urlsTentadas.push(`${ANP_BASE}/${inicio.slice(0, 4)}/resumo_semanal_lpc_${inicio}_${fim}.xlsx`);

      const buffer = await fetchWeekBuffer(inicio, fim);
      if (buffer) {
        try {
          const dados = parseBufferToPrecos(buffer);
          semanas.push(dados);
        } catch {
          // ignora semana com parse falho
        }
      }
    }

    if (semanas.length === 0) {
      const links = urlsTentadas.join('\n');
      throw new Error(
        `Não foi possível baixar o arquivo da ANP. URLs tentadas:\n${links}`,
      );
    }

    return { semanas };
  }

  /**
   * Processa arquivo Excel enviado manualmente (fallback quando download automático falha).
   */
  async processarArquivoExcel(buffer: Buffer): Promise<PrecosBarreirasResponse> {
    return parseBufferToPrecos(buffer);
  }
}
