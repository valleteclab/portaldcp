import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Criptografia dos segredos guardados no banco (senha do PNCP, API key da IA,
 * tokens do WhatsApp, senhas SMTP/IMAP dos órgãos).
 *
 * Todos usam a MESMA chave (PNCP_ENCRYPTION_KEY), então trocar a chave sem
 * cuidado inutilizaria tudo de uma vez. Por isso o decrypt tenta a chave atual
 * e, se falhar, a chave legada — o valor antigo continua legível até ser
 * regravado, e o que for gravado daqui pra frente já usa a chave nova.
 */

/** Fallback histórico. Está no código-fonte, logo não protege nada. */
const CHAVE_LEGADA = 'licitafacil-pncp-encryption-key-32';

const normalizar = (chave: string) =>
  Buffer.from(chave.padEnd(32, '0').substring(0, 32));

export const chaveDeCriptografiaConfigurada = (): boolean =>
  !!process.env.PNCP_ENCRYPTION_KEY;

const chaveAtual = (): string =>
  process.env.PNCP_ENCRYPTION_KEY || CHAVE_LEGADA;

/**
 * Cifra em AES-256-CBC. Em produção recusa gravar enquanto a chave própria não
 * estiver no ambiente — cifrar com a chave do repositório equivale a gravar em
 * texto claro. A recusa é só na escrita: o boot nunca falha por causa disso.
 */
export function encryptText(texto: string): string {
  if (!chaveDeCriptografiaConfigurada() && process.env.NODE_ENV === 'production') {
    throw new Error(
      'PNCP_ENCRYPTION_KEY não configurada no servidor: defina uma chave própria de 32 caracteres antes de gravar credenciais.',
    );
  }
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', normalizar(chaveAtual()), iv);
  let encrypted = cipher.update(texto, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decifrarCom(chave: string, encryptedText: string): string | null {
  try {
    const partes = encryptedText.split(':');
    const iv = Buffer.from(partes.shift()!, 'hex');
    const decipher = createDecipheriv('aes-256-cbc', normalizar(chave), iv);
    let decrypted = decipher.update(partes.join(':'), 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null;
  }
}

/** Decifra tentando a chave atual e, como fallback, a legada. Null se nenhuma serve. */
export function decryptTextOrNull(encryptedText: string): string | null {
  if (!encryptedText || !encryptedText.includes(':')) return null;

  const comAtual = decifrarCom(chaveAtual(), encryptedText);
  if (comAtual !== null) return comAtual;

  if (chaveDeCriptografiaConfigurada()) {
    // Valor gravado antes da chave própria entrar no ambiente.
    return decifrarCom(CHAVE_LEGADA, encryptedText);
  }
  return null;
}

/**
 * Versão tolerante para quem já tratava falha devolvendo o texto original
 * (email, imap, whatsapp): mantém esse comportamento.
 */
export function decryptTextOrRaw(encryptedText: string): string {
  if (!encryptedText || !encryptedText.includes(':')) return encryptedText;
  return decryptTextOrNull(encryptedText) ?? encryptedText;
}
