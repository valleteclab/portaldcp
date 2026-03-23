import { API_URL, authFetch } from '@/lib/api';

function getOrgaoId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const orgao = JSON.parse(localStorage.getItem('orgao') || '{}');
    return orgao.id || '';
  } catch {
    return '';
  }
}

function baseUrl() {
  return `${API_URL}/api/orgaos/${getOrgaoId()}/patrimonio`;
}

// ─── BENS ──────────────────────────────────────────────

export async function listarBens(filtros?: {
  tipo?: string;
  status?: string;
  categoria_id?: string;
  busca?: string;
}) {
  const params = new URLSearchParams();
  if (filtros?.tipo) params.set('tipo', filtros.tipo);
  if (filtros?.status) params.set('status', filtros.status);
  if (filtros?.categoria_id) params.set('categoria_id', filtros.categoria_id);
  if (filtros?.busca) params.set('busca', filtros.busca);
  const qs = params.toString();
  const res = await authFetch(`${baseUrl()}${qs ? '?' + qs : ''}`);
  if (!res.ok) throw new Error('Erro ao listar bens');
  return res.json();
}

export async function obterBem(id: string) {
  const res = await authFetch(`${baseUrl()}/bem/${id}`);
  if (!res.ok) throw new Error('Erro ao obter bem');
  return res.json();
}

export async function criarBem(data: any) {
  const res = await authFetch(`${baseUrl()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erro ao criar bem');
  return res.json();
}

export async function atualizarBem(id: string, data: any) {
  const res = await authFetch(`${baseUrl()}/bem/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erro ao atualizar bem');
  return res.json();
}

export async function excluirBem(id: string) {
  const res = await authFetch(`${baseUrl()}/bem/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Erro ao excluir bem');
  return res.json();
}

// ─── CATEGORIAS ────────────────────────────────────────

export async function listarCategorias() {
  const res = await authFetch(`${baseUrl()}/categorias`);
  if (!res.ok) throw new Error('Erro ao listar categorias');
  return res.json();
}

export async function criarCategoria(data: { nome: string }) {
  const res = await authFetch(`${baseUrl()}/categorias`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erro ao criar categoria');
  return res.json();
}

// ─── MANUTENÇÕES ───────────────────────────────────────

export async function listarManutencoes(status?: string) {
  const qs = status ? `?status=${status}` : '';
  const res = await authFetch(`${baseUrl()}/manutencoes${qs}`);
  if (!res.ok) throw new Error('Erro ao listar manutenções');
  return res.json();
}

export async function criarManutencao(bemId: string, data: any) {
  const res = await authFetch(`${baseUrl()}/bem/${bemId}/manutencoes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erro ao criar manutenção');
  return res.json();
}

export async function atualizarManutencao(manutId: string, data: any) {
  const res = await authFetch(`${baseUrl()}/manutencoes/${manutId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erro ao atualizar manutenção');
  return res.json();
}

// ─── LOCAÇÕES ──────────────────────────────────────────

export async function listarLocacoes() {
  const res = await authFetch(`${baseUrl()}/locacoes`);
  if (!res.ok) throw new Error('Erro ao listar locações');
  return res.json();
}

export async function criarLocacao(bemId: string, data: any) {
  const res = await authFetch(`${baseUrl()}/bem/${bemId}/locacoes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erro ao criar locação');
  return res.json();
}

// ─── SERVIDORES ────────────────────────────────────────

export async function listarServidores() {
  const res = await authFetch(`${baseUrl()}/servidores`);
  if (!res.ok) throw new Error('Erro ao listar bens de servidores');
  return res.json();
}

export async function criarServidorBem(bemId: string, data: any) {
  const res = await authFetch(`${baseUrl()}/bem/${bemId}/servidores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erro ao vincular bem a servidor');
  return res.json();
}

// ─── COMODATOS ─────────────────────────────────────────

export async function listarComodatos() {
  const res = await authFetch(`${baseUrl()}/comodatos`);
  if (!res.ok) throw new Error('Erro ao listar comodatos');
  return res.json();
}

export async function criarComodato(bemId: string, data: any) {
  const res = await authFetch(`${baseUrl()}/bem/${bemId}/comodatos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erro ao criar comodato');
  return res.json();
}

// ─── ETIQUETAS ─────────────────────────────────────────

export async function gerarEtiquetas(data: {
  tipo: string;
  bem_ids: string[];
  formato: 'individual' | 'folha_a4';
}) {
  const res = await authFetch(`${baseUrl()}/etiquetas/gerar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erro ao gerar etiquetas');
  return res.blob();
}

// ─── RELATÓRIOS ────────────────────────────────────────

export async function relatorioResumo() {
  const res = await authFetch(`${baseUrl()}/relatorios/resumo`);
  if (!res.ok) throw new Error('Erro ao obter relatório');
  return res.json();
}

export async function relatorioManutencoes(dataInicio?: string, dataFim?: string) {
  const params = new URLSearchParams();
  if (dataInicio) params.set('data_inicio', dataInicio);
  if (dataFim) params.set('data_fim', dataFim);
  const qs = params.toString();
  const res = await authFetch(`${baseUrl()}/relatorios/manutencoes${qs ? '?' + qs : ''}`);
  if (!res.ok) throw new Error('Erro ao obter relatório de manutenções');
  return res.json();
}

export async function relatorioLocacoesVencendo() {
  const res = await authFetch(`${baseUrl()}/relatorios/locacoes-vencendo`);
  if (!res.ok) throw new Error('Erro ao obter locações vencendo');
  return res.json();
}
