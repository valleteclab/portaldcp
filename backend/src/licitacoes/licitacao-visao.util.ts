import { FaseLicitacao } from './entities/licitacao.entity';

/**
 * VISÕES DA LICITAÇÃO POR PÚBLICO (E1a — blindagem de acesso).
 *
 *  - órgão dono / admin: entidade completa, mas o órgão relacionado vai SEM
 *    credenciais (senha, PNCP, SMTP, WhatsApp...);
 *  - fornecedor e rotas públicas: só licitações já divulgadas, órgão com dados
 *    de contato públicos, orçamento sigiloso (art. 24) mascarado e sem o id do
 *    melhor lance (identidade de licitante durante a disputa).
 */

/** Fases em que a licitação já é pública (edital/aviso divulgado). */
export const FASES_PUBLICAS: FaseLicitacao[] = [
  FaseLicitacao.PUBLICADO,
  FaseLicitacao.IMPUGNACAO,
  FaseLicitacao.ACOLHIMENTO_PROPOSTAS,
  FaseLicitacao.ANALISE_PROPOSTAS,
  FaseLicitacao.EM_DISPUTA,
  FaseLicitacao.JULGAMENTO,
  FaseLicitacao.HABILITACAO,
  FaseLicitacao.RECURSO,
  FaseLicitacao.ADJUDICACAO,
  FaseLicitacao.HOMOLOGACAO,
  FaseLicitacao.CONCLUIDO,
  FaseLicitacao.DESERTO,
  FaseLicitacao.FRACASSADO,
  FaseLicitacao.REVOGADO,
  FaseLicitacao.ANULADO,
];

/** Pública = fase externa, ou SUSPENSA depois de divulgada. */
export function licitacaoEhPublica(lic: { fase?: any; data_publicacao_edital?: any } | null | undefined): boolean {
  if (!lic) return false;
  if (FASES_PUBLICAS.includes(lic.fase)) return true;
  return lic.fase === FaseLicitacao.SUSPENSO && !!lic.data_publicacao_edital;
}

/** Campos do órgão que nunca saem da API da licitação. */
const SEGREDOS_ORGAO = [
  'senha_hash',
  'pncp_login',
  'pncp_senha',
  'email_smtp_user',
  'email_smtp_senha',
  'email_resend_api_key',
  'email_imap_user',
  'email_imap_senha',
  'whatsapp_token',
  'whatsapp_client_token',
  'whatsapp_instance_id',
];

/** Dados de contato do órgão que são públicos. */
const CAMPOS_PUBLICOS_ORGAO = [
  'id',
  'nome',
  'cnpj',
  'cidade',
  'uf',
  'logradouro',
  'numero',
  'bairro',
  'cep',
  'telefone',
  'email',
  'logo_url',
  'esfera',
  'tipo',
];

export function orgaoSemSegredos<T extends Record<string, any> | null | undefined>(orgao: T): T {
  if (!orgao || typeof orgao !== 'object') return orgao;
  const copia: Record<string, any> = { ...orgao };
  for (const k of SEGREDOS_ORGAO) delete copia[k];
  return copia as T;
}

export function orgaoPublico(orgao: Record<string, any> | null | undefined): Record<string, any> | null {
  if (!orgao || typeof orgao !== 'object') return orgao ?? null;
  const pub: Record<string, any> = {};
  for (const k of CAMPOS_PUBLICOS_ORGAO) if (k in orgao) pub[k] = orgao[k];
  return pub;
}

/** Licitação para o órgão dono/admin: tudo, exceto as credenciais do órgão. */
export function licitacaoParaOrgao<T extends Record<string, any>>(lic: T): T {
  if (!lic || typeof lic !== 'object') return lic;
  return lic.orgao ? ({ ...lic, orgao: orgaoSemSegredos(lic.orgao) } as T) : lic;
}

export function orcamentoSigiloso(lic: { sigilo_orcamento?: string | null } | null | undefined): boolean {
  return lic?.sigilo_orcamento === 'SIGILOSO';
}

function mascararValoresEstimados(obj: Record<string, any>): Record<string, any> {
  const copia: Record<string, any> = { ...obj };
  for (const k of Object.keys(copia)) {
    if (/^valor_.*estimado$/.test(k)) copia[k] = null;
  }
  return copia;
}

/**
 * Licitação para fornecedor / público: órgão só com contato público, sem o
 * id do melhor lance nos itens e, com orçamento SIGILOSO, sem valores estimados
 * (licitação, itens e lotes).
 */
export function licitacaoParaPublico<T extends Record<string, any>>(lic: T): T {
  if (!lic || typeof lic !== 'object') return lic;
  const sigiloso = orcamentoSigiloso(lic);
  const saida: Record<string, any> = sigiloso ? mascararValoresEstimados(lic) : { ...lic };
  if ('orgao' in saida) saida.orgao = orgaoPublico(saida.orgao);
  if (Array.isArray(saida.itens)) {
    saida.itens = saida.itens.map((i: any) => {
      const item = sigiloso ? mascararValoresEstimados(i) : { ...i };
      delete item.melhor_lance_fornecedor_id;
      return item;
    });
  }
  if (Array.isArray(saida.lotes) && sigiloso) {
    saida.lotes = saida.lotes.map((l: any) => mascararValoresEstimados(l));
  }
  return saida as T;
}
