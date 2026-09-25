/**
 * Erro capturado em `catch` (E9 — fim do `catch (e: any)` nos serviços da
 * licitação): o valor é `unknown`; estas funções dão a forma mínima que o
 * código usa (mensagem e, nas chamadas HTTP, a resposta do servidor).
 */
export interface ErroCapturado {
  message?: string;
  code?: string;
  status?: number;
  response?: {
    status?: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- corpo livre da resposta de um sistema externo
    data?: any;
    headers?: Record<string, unknown>;
  };
}

export function comoErro(e: unknown): ErroCapturado {
  return (e && typeof e === 'object' ? e : { message: String(e) }) as ErroCapturado;
}

export function mensagemDoErro(e: unknown): string {
  if (e instanceof Error) return e.message;
  const m = comoErro(e).message;
  return m ?? String(e);
}
