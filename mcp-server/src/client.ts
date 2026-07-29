import FormData from 'form-data';
import { createReadStream, existsSync } from 'fs';
import { basename } from 'path';

const BASE_URL = process.env.PORTALDCP_URL || 'https://portaldcp.com.br';
const API_KEY = process.env.PORTALDCP_API_KEY || '';

if (!API_KEY) {
  process.stderr.write('[portaldcp-mcp] AVISO: PORTALDCP_API_KEY não definida\n');
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const url = `${BASE_URL}/api/ext/v1${path}`;
  const headers: Record<string, string> = {
    'X-Api-Key': API_KEY,
    ...(options.headers as Record<string, string> || {}),
  };

  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const err = await res.json() as any;
      errMsg = err.message || err.error || JSON.stringify(err);
    } catch {
      errMsg = await res.text();
    }
    throw new Error(`Erro na API Portal DCP: ${errMsg}`);
  }

  const text = await res.text();
  if (!text) return {};
  return JSON.parse(text);
}

export async function listContracts(): Promise<any[]> {
  return apiFetch('/contratos');
}

export async function getContract(contractId: string): Promise<any> {
  return apiFetch(`/contratos/${contractId}`);
}

export async function createMeasurement(
  contractId: string,
  dados: {
    periodo_inicio: string;
    periodo_fim: string;
    nota_fiscal_numero?: string;
    nota_fiscal_valor?: number;
    nota_fiscal_data?: string;
    observacoes?: string;
    valor_medido?: number;
    itens?: Array<{ item_cronograma_id: string; quantidade_medida: number }>;
    equipe?: MeasurementTeamInput;
    enviar_imediatamente?: boolean;
  },
): Promise<any> {
  return apiFetch(`/contratos/${contractId}/medicoes`, {
    method: 'POST',
    body: JSON.stringify(dados),
  });
}

export interface MeasurementEmployeeInput {
  item_cronograma_id: string;
  nome: string;
  posto_numero?: number;
  inicio_prestacao_servicos?: string;
  lotacao?: string;
  situacao?: string;
  carga_horaria_semanal?: number;
  dias_trabalhados: number;
}

export interface MeasurementTeamInput {
  fechamento_fatura?: string;
  responsavel_legal?: string;
  data_emissao?: string;
  percentual_iss?: number;
  percentual_ir?: number;
  retencao_inss?: number;
  funcionarios: MeasurementEmployeeInput[];
}

export async function getPreviousTeam(contractId: string): Promise<any> {
  return apiFetch(`/contratos/${contractId}/equipe/ultima`);
}

export async function saveMeasurementTeam(
  measurementId: string,
  equipe: MeasurementTeamInput,
): Promise<any> {
  return apiFetch(`/medicoes/${measurementId}/equipe`, {
    method: 'PUT',
    body: JSON.stringify(equipe),
  });
}

export async function submitMeasurement(measurementId: string): Promise<any> {
  return apiFetch(`/medicoes/${measurementId}/enviar`, { method: 'POST' });
}

export async function uploadDocument(
  measurementId: string,
  filePath: string,
  tipo: string,
  descricao?: string,
): Promise<any> {
  if (!existsSync(filePath)) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }

  const form = new FormData();
  form.append('file', createReadStream(filePath), { filename: basename(filePath) });
  form.append('tipo', tipo);
  if (descricao) form.append('descricao', descricao);

  const url = `${BASE_URL}/api/ext/v1/medicoes/${measurementId}/documentos`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Api-Key': API_KEY,
      ...form.getHeaders(),
    },
    body: form.getBuffer(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro no upload: ${errText}`);
  }
  return res.json();
}

export async function getMeasurementStatus(measurementId: string): Promise<any> {
  return apiFetch(`/medicoes/${measurementId}`);
}
