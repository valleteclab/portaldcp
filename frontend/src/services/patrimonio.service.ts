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
  setor_id?: string;
  busca?: string;
}) {
  const params = new URLSearchParams();
  if (filtros?.tipo) params.set('tipo', filtros.tipo);
  if (filtros?.status) params.set('status', filtros.status);
  if (filtros?.categoria_id) params.set('categoria_id', filtros.categoria_id);
  if (filtros?.setor_id) params.set('setor_id', filtros.setor_id);
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
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || 'Erro ao criar bem');
  return json;
}

export async function atualizarBem(id: string, data: any) {
  const res = await authFetch(`${baseUrl()}/bem/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || 'Erro ao atualizar bem');
  return json;
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

export async function gerarZpl(data: { bem_ids: string[]; largura_mm?: number; altura_mm?: number; dpi?: number }) {
  const res = await authFetch(`${baseUrl()}/etiquetas/zpl`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erro ao gerar ZPL');
  return res.text();
}

// ─── CADASTRO: PLAQUETA, PLANILHA, FOTO, SETORES ───────

export async function proximaPlaqueta(): Promise<string> {
  const res = await authFetch(`${baseUrl()}/proxima-plaqueta`);
  if (!res.ok) throw new Error('Erro ao obter próxima plaqueta');
  return (await res.json()).plaqueta;
}

export async function importarPlanilha(file: File) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await authFetch(`${baseUrl()}/importar`, { method: 'POST', body: fd });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || 'Erro ao importar planilha');
  return json as { total: number; criados: number; atualizados: number; erros: { linha: number; erro: string }[] };
}

export async function enviarFotoBem(bemId: string, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await authFetch(`${baseUrl()}/bem/${bemId}/foto`, { method: 'POST', body: fd });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || 'Erro ao enviar foto');
  return json as { foto_url: string };
}

export async function listarSetores() {
  const res = await authFetch(`${API_URL}/api/orgaos/${getOrgaoId()}/setores`);
  if (!res.ok) throw new Error('Erro ao listar setores');
  return res.json() as Promise<{ id: string; codigo: string; nome: string }[]>;
}

// ─── INVENTÁRIOS (campanhas de conferência) ────────────

export async function listarInventarios() {
  const res = await authFetch(`${baseUrl()}/inventarios`);
  if (!res.ok) throw new Error('Erro ao listar inventários');
  return res.json();
}

export async function criarInventario(data: {
  nome: string;
  ano: number;
  comissao?: string;
  observacoes?: string;
  setores: { setor_id?: string; setor_nome?: string; responsavel_nome?: string; responsavel_telefone?: string }[];
}) {
  const res = await authFetch(`${baseUrl()}/inventarios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || 'Erro ao criar inventário');
  return json;
}

export async function obterInventario(id: string) {
  const res = await authFetch(`${baseUrl()}/inventarios/${id}`);
  if (!res.ok) throw new Error('Erro ao obter inventário');
  return res.json();
}

export async function divergenciasInventario(id: string) {
  const res = await authFetch(`${baseUrl()}/inventarios/${id}/divergencias`);
  if (!res.ok) throw new Error('Erro ao obter divergências');
  return res.json();
}

export async function fecharInventario(id: string, forcar = false) {
  const res = await authFetch(`${baseUrl()}/inventarios/${id}/fechar${forcar ? '?forcar=true' : ''}`, { method: 'POST' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || 'Erro ao fechar inventário');
  return json;
}

export async function atualizarSetorInventario(id: string, setorId: string, data: { responsavel_nome?: string; responsavel_telefone?: string; observacoes?: string }) {
  const res = await authFetch(`${baseUrl()}/inventarios/${id}/setores/${setorId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erro ao atualizar setor');
  return res.json();
}

export async function enviarLinkSetorInventario(id: string, setorId: string) {
  const res = await authFetch(`${baseUrl()}/inventarios/${id}/setores/${setorId}/enviar-link`, { method: 'POST' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || 'Erro ao enviar link');
  return json as { enviado: boolean; link: string; motivo?: string };
}

export async function reabrirSetorInventario(id: string, setorId: string) {
  const res = await authFetch(`${baseUrl()}/inventarios/${id}/setores/${setorId}/reabrir`, { method: 'POST' });
  if (!res.ok) throw new Error('Erro ao reabrir setor');
  return res.json();
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
