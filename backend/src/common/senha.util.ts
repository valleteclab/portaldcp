import * as bcrypt from 'bcrypt';
import { createHash, timingSafeEqual } from 'crypto';

/**
 * Senhas (auditoria de 13/11/2026 — lote 3): tudo que é gravado novo vai em
 * bcrypt. Hashes antigos em SHA-256 sem sal continuam ACEITOS na conferência,
 * e quem confere recebe o hash novo para regravar (migração no primeiro login).
 */
const CUSTO = 10;

export function hashSenha(senha: string): string {
  return bcrypt.hashSync(String(senha), CUSTO);
}

export function ehHashForte(hash: string | null | undefined): boolean {
  return typeof hash === 'string' && hash.startsWith('$2');
}

/** `ok`: senha confere. `novoHash`: preenchido quando o hash guardado era o antigo e deve ser regravado. */
export function conferirSenha(digitada: string, guardado: string | null | undefined): { ok: boolean; novoHash?: string } {
  if (!guardado || typeof digitada !== 'string') return { ok: false };
  if (ehHashForte(guardado)) return { ok: bcrypt.compareSync(digitada, guardado) };
  const sha = Buffer.from(createHash('sha256').update(digitada).digest('hex'));
  const alvo = Buffer.from(guardado);
  if (sha.length !== alvo.length || !timingSafeEqual(sha, alvo)) return { ok: false };
  return { ok: true, novoHash: hashSenha(digitada) };
}

/** Comparação de segredos em tempo constante (senha do admin em variável de ambiente etc.). */
export function segredosIguais(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = createHash('sha256').update(String(a ?? '')).digest();
  const y = createHash('sha256').update(String(b ?? '')).digest();
  return timingSafeEqual(x, y);
}
