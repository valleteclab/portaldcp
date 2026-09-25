import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Campos de credencial que nunca podem sair numa resposta da API.
 * Várias entidades (fornecedor, órgão, usuário) carregam esses campos e são
 * devolvidas inteiras por relações (ex.: proposta → fornecedor), então a
 * proteção fica na saída, para todas as rotas.
 */
export const CAMPOS_CREDENCIAIS = new Set([
  'senha',
  'senha_hash',
  'api_key_hash',
  'spedy_api_key',
  'spedy_api_key_encrypted',
  'pncp_senha',
  'email_smtp_senha',
  'email_imap_senha',
  'email_resend_api_key',
]);

/** Valor devolvido no lugar da credencial preenchida (a tela de admin usa '***' como "já configurado"). */
export const MASCARA_CREDENCIAL = '***';

/**
 * Devolve uma CÓPIA com as credenciais mascaradas — nunca altera o objeto original,
 * que pode estar em cache e ainda ser usado para enviar e-mail/PNCP.
 */
export function mascararCredenciais<T>(valor: T, vistos = new WeakMap<object, unknown>()): T {
  if (valor === null || typeof valor !== 'object') return valor;
  if (valor instanceof Date || Buffer.isBuffer(valor) || ArrayBuffer.isView(valor)) return valor;
  if (valor instanceof StreamableFile) return valor; // downloads
  if (typeof (valor as any).pipe === 'function') return valor; // streams
  if (typeof (valor as any).subscribe === 'function' || typeof (valor as any).then === 'function') return valor; // SSE/observable/promise
  if (typeof (valor as any).toJSON === 'function') return valor; // serialização própria
  if (vistos.has(valor as object)) return vistos.get(valor as object) as T;

  if (Array.isArray(valor)) {
    const copia: unknown[] = [];
    vistos.set(valor, copia);
    for (const item of valor) copia.push(mascararCredenciais(item, vistos));
    return copia as T;
  }

  const copia: Record<string, unknown> = {};
  vistos.set(valor as object, copia);
  for (const chave of Object.keys(valor as object)) {
    const atual = (valor as any)[chave];
    if (CAMPOS_CREDENCIAIS.has(chave)) {
      copia[chave] = atual !== null && atual !== undefined && atual !== '' ? MASCARA_CREDENCIAL : atual;
    } else {
      copia[chave] = mascararCredenciais(atual, vistos);
    }
  }
  return copia as T;
}

@Injectable()
export class MascararCredenciaisInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((dados) => mascararCredenciais(dados)));
  }
}
