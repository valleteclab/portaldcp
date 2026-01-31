/**
 * Configuração centralizada da API
 */

// Remove barra final da URL para evitar barras duplicadas
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/$/, '');

/**
 * Obtém o token de autenticação do localStorage
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token') || localStorage.getItem('orgao_token');
}

/**
 * Obtém o token de admin do localStorage
 */
export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('admin_token');
}

/**
 * Obtém os headers de autenticação
 */
export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (token) {
    return { 'Authorization': `Bearer ${token}` };
  }
  return {};
}

/**
 * Função helper para fazer requisições à API
 * Inclui automaticamente o token JWT se disponível
 */
export async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    
    // Se receber 401, limpa o token e redireciona para login
    if (response.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('orgao_token');
      // Não redireciona automaticamente para evitar loops
    }
    
    throw new Error(error.message || 'Erro na requisição');
  }

  return response.json();
}

/**
 * Verifica se o usuário está autenticado
 */
export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

/**
 * Faz logout limpando os tokens
 */
export function logout(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('access_token');
  localStorage.removeItem('orgao_token');
  localStorage.removeItem('usuario');
  localStorage.removeItem('orgao');
  localStorage.removeItem('fornecedor');
}

/**
 * Fetch autenticado - substitui fetch() com autenticação automática
 * Uso: const response = await authFetch(`${API_URL}/api/licitacoes`, { method: 'POST', body: JSON.stringify(data) })
 */
export async function authFetch(url: string, options?: RequestInit): Promise<Response> {
  const headers = new Headers(options?.headers);
  
  // Adiciona Content-Type se não existir e não for FormData
  if (!headers.has('Content-Type') && !(options?.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  
  // Adiciona token de autenticação
  const token = getAuthToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  const response = await fetch(url, {
    ...options,
    headers,
  });
  
  // NOTA: Não limpamos tokens automaticamente em 401 porque:
  // - Fornecedores podem receber 401 em rotas de órgão
  // - O token pode ser válido, apenas o endpoint específico não é autorizado
  // A lógica de logout deve ser tratada pelo componente que faz a requisição
  
  return response;
}

/**
 * Fetch autenticado para área admin
 * Usa o token admin_token do localStorage
 */
export async function adminFetch(url: string, options?: RequestInit): Promise<Response> {
  const headers = new Headers(options?.headers);
  
  // Adiciona Content-Type se não existir e não for FormData
  if (!headers.has('Content-Type') && !(options?.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  
  // Adiciona token de admin
  const token = getAdminToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  const response = await fetch(url, {
    ...options,
    headers,
  });
  
  // Se receber 401, redireciona para login admin
  if (response.status === 401 && typeof window !== 'undefined') {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    window.location.href = '/admin/login';
  }
  
  return response;
}

// ============ FUNÇÕES DE DATA (HORÁRIO DE BRASÍLIA) ============

/**
 * Formata uma data ISO (YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss) para exibição brasileira (DD/MM/YYYY)
 * IMPORTANTE: Não usa new Date() para evitar conversão de fuso horário
 */
export function formatarDataBR(dataISO: string | null | undefined): string {
  if (!dataISO) return '-';
  
  // Extrai componentes da data diretamente da string
  const match = String(dataISO).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  
  // Fallback para formato já brasileiro
  if (dataISO.includes('/')) {
    return dataISO.split('T')[0];
  }
  
  return dataISO;
}

/**
 * Formata uma data ISO com hora para exibição brasileira (DD/MM/YYYY HH:mm)
 * IMPORTANTE: Não usa new Date() para evitar conversão de fuso horário
 */
export function formatarDataHoraBR(dataISO: string | null | undefined): string {
  if (!dataISO) return '-';
  
  // Extrai componentes da data e hora diretamente da string
  const match = String(dataISO).match(/(\d{4})-(\d{2})-(\d{2})T?(\d{2})?:?(\d{2})?/);
  if (match) {
    const data = `${match[3]}/${match[2]}/${match[1]}`;
    if (match[4] && match[5]) {
      return `${data} ${match[4]}:${match[5]}`;
    }
    return data;
  }
  
  return dataISO;
}

/**
 * Converte data brasileira (DD/MM/YYYY) para ISO (YYYY-MM-DD)
 * Útil para enviar datas ao backend
 */
export function dataBRparaISO(dataBR: string): string {
  if (!dataBR) return '';
  
  const match = dataBR.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    const dia = match[1].padStart(2, '0');
    const mes = match[2].padStart(2, '0');
    const ano = match[3];
    return `${ano}-${mes}-${dia}`;
  }
  
  // Se já estiver em formato ISO, retorna como está
  if (dataBR.match(/\d{4}-\d{2}-\d{2}/)) {
    return dataBR.split('T')[0];
  }
  
  return dataBR;
}

/**
 * Métodos de conveniência para requisições comuns
 */
export const api = {
  get: <T>(endpoint: string) => apiRequest<T>(endpoint, { method: 'GET' }),
  
  post: <T>(endpoint: string, data?: unknown) => apiRequest<T>(endpoint, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  }),
  
  put: <T>(endpoint: string, data?: unknown) => apiRequest<T>(endpoint, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  }),
  
  patch: <T>(endpoint: string, data?: unknown) => apiRequest<T>(endpoint, {
    method: 'PATCH',
    body: data ? JSON.stringify(data) : undefined,
  }),
  
  delete: <T>(endpoint: string) => apiRequest<T>(endpoint, { method: 'DELETE' }),
};
