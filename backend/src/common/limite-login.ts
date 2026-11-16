import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Bloqueio de login por CONTA (não só por IP): o limite global é de 100
 * requisições por minuto por IP, o que deixava testar senhas à vontade trocando
 * de IP. Aqui, 8 erros seguidos na mesma conta em 15 minutos bloqueiam novas
 * tentativas nessa conta por 15 minutos. Em memória (por instância) — basta
 * para frear a força bruta; um login correto zera a contagem.
 */
const MAX_FALHAS = 8;
const JANELA_MS = 15 * 60 * 1000;
const falhas = new Map<string, { n: number; ate: number }>();

function chaveDe(tipo: string, conta: string | null | undefined): string {
  return `${tipo}:${String(conta ?? '').trim().toLowerCase()}`;
}

export async function comLimiteDeLogin<T>(tipo: string, conta: string | null | undefined, entrar: () => Promise<T>): Promise<T> {
  const chave = chaveDe(tipo, conta);
  const agora = Date.now();
  const atual = falhas.get(chave);
  if (atual && atual.ate <= agora) falhas.delete(chave);
  else if (atual && atual.n >= MAX_FALHAS) {
    const minutos = Math.max(1, Math.ceil((atual.ate - agora) / 60000));
    throw new HttpException(
      `Muitas tentativas de acesso com erro nesta conta. Aguarde ${minutos} minuto(s) ou use "Esqueci minha senha".`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  try {
    const r = await entrar();
    falhas.delete(chave);
    return r;
  } catch (e) {
    const status = e instanceof HttpException ? e.getStatus() : 0;
    if (status === 400 || status === 401) {
      const f = falhas.get(chave);
      falhas.set(chave, { n: (f?.n ?? 0) + 1, ate: agora + JANELA_MS });
      if (falhas.size > 20000) for (const [k, v] of falhas) if (v.ate <= agora) falhas.delete(k);
    }
    throw e;
  }
}

/** Só para testes. */
export function zerarLimiteDeLogin(): void {
  falhas.clear();
}
