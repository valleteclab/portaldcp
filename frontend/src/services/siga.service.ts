import { API_URL, authFetch } from '@/lib/api';

/** Integração por arquivo com o SIGA do TCM-BA (compartilhado por Patrimônio e Frota). */

export function getOrgaoIdSiga(): string {
  if (typeof window === 'undefined') return '';
  try {
    const orgao = JSON.parse(localStorage.getItem('orgao') || '{}');
    return orgao.id || '';
  } catch {
    return '';
  }
}

export function baseSiga() {
  return `${API_URL}/api/orgaos/${getOrgaoIdSiga()}`;
}

export interface ConfigSiga {
  codigo_unidade: string | null;
  codigo_orgao: string | null;
  codigo_unidade_orcamentaria: string | null;
  data_inicio: string | null;
  nome_unidade: string;
  pendencias: string[];
}

async function lerErro(res: Response, padrao: string) {
  try {
    const json = await res.json();
    return Array.isArray(json.message) ? json.message.join(' ') : json.message || padrao;
  } catch {
    return padrao;
  }
}

export async function obterConfigSiga(): Promise<ConfigSiga> {
  const res = await authFetch(`${baseSiga()}/siga/config`);
  if (!res.ok) throw new Error(await lerErro(res, 'Não foi possível carregar a configuração do SIGA.'));
  return res.json();
}

export async function salvarConfigSiga(dados: Partial<Omit<ConfigSiga, 'pendencias' | 'nome_unidade'>>): Promise<ConfigSiga> {
  const res = await authFetch(`${baseSiga()}/siga/config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) throw new Error(await lerErro(res, 'Não foi possível salvar a configuração do SIGA.'));
  return res.json();
}

/**
 * Baixa um arquivo gerado pelo backend (texto do SIGA). O nome vem do header
 * Content-Disposition; `padrao` é usado se ele faltar.
 */
export async function baixarArquivoSiga(url: string, padrao: string, init?: RequestInit) {
  const res = await authFetch(url, init);
  if (!res.ok) throw new Error(await lerErro(res, 'Não foi possível gerar o arquivo.'));
  const blob = await res.blob();
  const disp = res.headers.get('Content-Disposition') || '';
  const nome = disp.match(/filename="?([^";]+)"?/)?.[1] || padrao;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}
