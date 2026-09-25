/**
 * Campos que NUNCA saem na resposta (hash de senha e credenciais — mesmo
 * criptografadas). A configuração de e-mail/WhatsApp tem rota própria que
 * devolve só o que é exibível (`getEmailConfig`/`getWhatsAppConfig`).
 */
const CAMPOS_SECRETOS_ORGAO = [
  'senha_hash',
  'pncp_senha',
  'email_smtp_senha',
  'email_imap_senha',
  'email_resend_api_key',
  'whatsapp_token',
  'whatsapp_client_token',
] as const;

export function orgaoSemSegredos<T extends object>(orgao: T): T {
  if (!orgao) return orgao;
  const copia: any = { ...orgao };
  for (const campo of CAMPOS_SECRETOS_ORGAO) delete copia[campo];
  return copia;
}

/** Usuário sem o hash de senha e com o órgão embutido (relação) sem credenciais. */
export function usuarioSemSegredos<T extends object>(usuario: T): Omit<T, 'senha_hash'> {
  if (!usuario) return usuario;
  const { senha_hash: _hash, ...resto } = usuario as any;
  if (resto.orgao) resto.orgao = orgaoSemSegredos(resto.orgao);
  return resto;
}
