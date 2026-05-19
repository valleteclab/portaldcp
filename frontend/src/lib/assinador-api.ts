'use client';

import { API_URL } from './api';

export const ASSINADOR_TOKEN_KEY = 'assinador_token';
export const ASSINADOR_USER_KEY = 'assinador_user';

export function getAssinadorToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ASSINADOR_TOKEN_KEY);
}

export function getAssinadorUser(): any | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ASSINADOR_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setAssinadorAuth(token: string, user: any): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ASSINADOR_TOKEN_KEY, token);
  localStorage.setItem(ASSINADOR_USER_KEY, JSON.stringify(user));
}

export function logoutAssinador(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ASSINADOR_TOKEN_KEY);
  localStorage.removeItem(ASSINADOR_USER_KEY);
  window.location.href = '/assinador/login';
}

export async function assinadorFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getAssinadorToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const url = path.startsWith('http') ? path : `${API_URL}${path}`;
  return fetch(url, { ...options, headers });
}

export async function assinadorGet<T>(path: string): Promise<T> {
  const res = await assinadorFetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function assinadorPost<T>(path: string, body?: any): Promise<T> {
  const res = await assinadorFetch(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}
