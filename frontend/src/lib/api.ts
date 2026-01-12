/**
 * Configuração centralizada da API
 */

// Remove barra final da URL para evitar barras duplicadas
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');

/**
 * Obtém o token de autenticação do localStorage
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token') || localStorage.getItem('orgao_token');
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
