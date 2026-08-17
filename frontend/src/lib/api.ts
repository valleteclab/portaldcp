/**
 * Configuração centralizada da API
 */

/**
 * URL base da API. Em produção, use NEXT_PUBLIC_API_URL=https://www.portaldcp.com.br
 * Se não definido no browser, usa window.location.origin (same-origin).
 */
function getApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:3000';
}
export const API_URL = getApiUrl();

/**
 * Retorna a URL completa para um asset da API (ex: logo do órgão).
 * Funciona com API_URL vazio (same-origin) ou com URL completa.
 */
export function getAssetUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const base = typeof window !== 'undefined' 
    ? (API_URL || window.location.origin) 
    : API_URL;
  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : '/' + path}`;
}

/**
 * Obtém o token de autenticação do localStorage
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token') || localStorage.getItem('orgao_token');
}

/**
 * Lê o `exp` do JWT sem chamar a API. Retorna null se o token for ilegível.
 */
function getTokenExp(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(
      decodeURIComponent(
        atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join(''),
      ),
    );
    return typeof json?.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}

/**
 * Sessão válida = token presente E dentro da validade.
 *
 * Antes bastava existir o objeto do usuário no localStorage — e esse objeto não
 * expira. Com o token vencido (7 dias), a pessoa continuava entrando sem pedir
 * login e via todas as telas vazias, porque cada requisição voltava 401.
 */
export function hasValidSession(): boolean {
  const token = getAuthToken();
  if (!token) return false;
  const exp = getTokenExp(token);
  if (exp === null) return true; // token opaco: deixa a API decidir
  return exp * 1000 > Date.now();
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
  
  // 401 com token VENCIDO = sessão expirada: limpa tudo e manda para o login.
  // Quando o token ainda está dentro da validade, o 401 é da rota (fornecedor
  // batendo em rota de órgão, por exemplo) e não pode derrubar a sessão — era
  // esse caso que impedia qualquer limpeza aqui. Sem essa distinção, o usuário
  // ficava "meio logado": sem token válido, mas com o objeto do usuário no
  // navegador, vendo todas as telas vazias e sem nunca voltar ao login.
  if (
    response.status === 401 &&
    typeof window !== 'undefined' &&
    !hasValidSession()
  ) {
    const path = window.location.pathname;
    const naTelaPublica = /\/login|\/orgao-login|\/cadastro/.test(path);
    logout();
    if (!naTelaPublica) {
      const destino = path.startsWith('/orgao') ? '/orgao-login' : '/login';
      window.location.replace(`${destino}?sessao=expirada`);
    }
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

// ============ FUNÇÕES DE DATA (HORÁRIO DE BRASÍLIA) ============

/** Fuso horário padrão: Brasília (America/Sao_Paulo) */
export const TIMEZONE_BRASILIA = 'America/Sao_Paulo';

/**
 * Formata uma data ISO (YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss) para exibição brasileira (DD/MM/YYYY)
 * Usa horário de Brasília para conversão correta quando a string inclui hora
 */
export function formatarDataBR(dataISO: string | null | undefined): string {
  if (!dataISO) return '-';
  // Data "pura" (coluna DATE, sem hora): formata direto, SEM conversão de fuso,
  // para não voltar 1 dia em UTC-3 (Brasília). Ex.: "2026-05-21" -> "21/05/2026".
  const dataPura = /^\d{4}-\d{2}-\d{2}$/.exec(dataISO);
  if (dataPura) return `${dataPura[3]}/${dataPura[2]}/${dataPura[1]}`;
  try {
    // Se a string tem hora mas não tem timezone (Z ou +HH:mm), força UTC
    const normalized = /T\d{2}:\d{2}/.test(dataISO) && !/Z$|[+-]\d{2}:?\d{2}$/.test(dataISO)
      ? dataISO + 'Z'
      : dataISO;
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return dataISO;
    return d.toLocaleDateString('pt-BR', { timeZone: TIMEZONE_BRASILIA });
  } catch {
    const match = String(dataISO).match(/(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    return dataISO;
  }
}

/**
 * Converte uma data UTC para Brasília (UTC-3) de forma robusta,
 * sem depender de Intl.DateTimeFormat com timeZone (que pode falhar em SSR/Node).
 */
function utcParaBrasilia(d: Date): Date {
  // Brasília é UTC-3 fixo (sem horário de verão desde 2019)
  return new Date(d.getTime() - 3 * 60 * 60 * 1000);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Formata uma data ISO com hora para exibição em horário de Brasília (DD/MM/YYYY, HH:mm:ss)
 * Converte corretamente de UTC para America/Sao_Paulo (UTC-3)
 */
export function formatarDataHoraBR(dataISO: string | null | undefined): string {
  if (!dataISO) return '-';
  try {
    // Se a string tem hora mas não tem timezone (Z ou +HH:mm), força UTC
    const normalized = /T\d{2}:\d{2}/.test(dataISO) && !/Z$|[+-]\d{2}:?\d{2}$/.test(dataISO)
      ? dataISO + 'Z'
      : dataISO;
    const utc = new Date(normalized);
    if (isNaN(utc.getTime())) return dataISO;
    const br = utcParaBrasilia(utc);
    const dia = pad2(br.getUTCDate());
    const mes = pad2(br.getUTCMonth() + 1);
    const ano = br.getUTCFullYear();
    const h = pad2(br.getUTCHours());
    const m = pad2(br.getUTCMinutes());
    const s = pad2(br.getUTCSeconds());
    return `${dia}/${mes}/${ano}, ${h}:${m}:${s}`;
  } catch {
    return dataISO;
  }
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
