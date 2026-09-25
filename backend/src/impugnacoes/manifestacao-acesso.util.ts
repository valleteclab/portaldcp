import { DataSource } from 'typeorm';
import { ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { ehFornecedor, ehOrgao } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';
import { licitacaoEhPublica } from '../licitacoes/licitacao-visao.util';

/**
 * VISÕES DE IMPUGNAÇÕES E ESCLARECIMENTOS (E1a — "manifestações" do edital).
 *
 *  - DONO   (órgão da licitação / admin): tudo (fornecedor resumido, sem senha);
 *  - AUTOR  (fornecedor que enviou): a própria manifestação e a resposta;
 *  - PUBLICO (qualquer um, licitação divulgada): só manifestações JÁ
 *    RESPONDIDAS, sem identificar quem as enviou (nome, CPF/CNPJ, e-mail,
 *    fornecedor) nem o arquivo anexado — evita revelar interessados/licitantes.
 *  - null: não enxerga (404).
 */
export type VisaoManifestacao = 'DONO' | 'AUTOR' | 'PUBLICO';

export interface LicitacaoResumo {
  id: string;
  orgao_id: string;
  fase: any;
  data_publicacao_edital: any;
}

/** Órgão e fase da licitação (null se não existe / id inválido). */
export async function licitacaoResumo(ds: DataSource, licitacaoId: string): Promise<LicitacaoResumo | null> {
  if (!ehUuid(licitacaoId)) return null;
  const r = await ds.query(`SELECT id, orgao_id, fase, data_publicacao_edital FROM licitacoes WHERE id = $1`, [licitacaoId]);
  return r[0] ?? null;
}

export function ehDonoDaLicitacao(ator: Ator | null | undefined, lic: LicitacaoResumo | null): boolean {
  if (!ator || !lic) return false;
  return ator.admin || (ehOrgao(ator) && ator.orgaoId === lic.orgao_id);
}

interface ManifestacaoBase {
  fornecedor_id?: string | null;
  resposta?: string | null;
  data_resposta?: any;
}

export function manifestacaoRespondida(m: ManifestacaoBase): boolean {
  return !!m.data_resposta || !!(m.resposta && String(m.resposta).trim());
}

export function visaoDaManifestacao(
  ator: Ator | null | undefined,
  lic: LicitacaoResumo | null,
  m: ManifestacaoBase,
): VisaoManifestacao | null {
  if (!lic) return null;
  if (ehDonoDaLicitacao(ator, lic)) return 'DONO';
  if (ehFornecedor(ator) && m.fornecedor_id && m.fornecedor_id === ator.fornecedorId) return 'AUTOR';
  if (licitacaoEhPublica(lic) && manifestacaoRespondida(m)) return 'PUBLICO';
  return null;
}

/** Fornecedor relacionado sem senha e demais dados de cadastro. */
function fornecedorResumido(f: any) {
  if (!f || typeof f !== 'object') return f ?? null;
  return { id: f.id, razao_social: f.razao_social, nome_fantasia: f.nome_fantasia, cpf_cnpj: f.cpf_cnpj };
}

/**
 * Aplica a visão. `camposIdentidade` = campos que identificam quem enviou
 * (nome/CPF-CNPJ/e-mail do impugnante ou solicitante).
 */
export function aplicarVisao<T extends Record<string, any>>(m: T, visao: VisaoManifestacao, camposIdentidade: string[]): T {
  const copia: Record<string, any> = { ...m };
  if ('fornecedor' in copia) copia.fornecedor = fornecedorResumido(copia.fornecedor);
  if (visao === 'DONO') return copia as T;

  delete copia.licitacao;
  delete copia.documento_caminho;
  if (visao === 'AUTOR') return copia as T;

  for (const k of camposIdentidade) delete copia[k];
  delete copia.fornecedor;
  copia.fornecedor_id = null;
  delete copia.documento_nome;
  delete copia.documento_tamanho;
  delete copia.documento_mime_type;
  return copia as T;
}
