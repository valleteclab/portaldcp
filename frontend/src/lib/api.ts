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
  
  // Se receber 401, limpa tokens
  if (response.status === 401 && typeof window !== 'undefined') {
    localStorage.removeItem('access_token');
    localStorage.removeItem('orgao_token');
  }
  
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
