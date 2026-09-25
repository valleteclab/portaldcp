import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AcessoLicitacaoService, ehUuid } from '../auth/acesso/acesso-licitacao.service';
import type { Ator } from '../auth/acesso/ator';
import { itemEmFaseComAnonimizacaoObrigatoria } from './disputa-anonimizacao-helpers';
import { EtapaSessao, StatusSessao } from '../sessao/entities/sessao-disputa.entity';

/** Etapas em que a disputa de lances acabou e a identidade dos licitantes é pública. */
export const ETAPAS_IDENTIDADE_REVELADA: string[] = [
  // Aceitação (E3): só existe com TODAS as unidades fora da etapa de lances
  // (fase JULGAMENTO) — sem risco de conluio entre itens; é também a etapa a
  // que a sala volta depois de uma inabilitação (identidades já públicas)
  EtapaSessao.ACEITACAO_PROPOSTA,
  EtapaSessao.CONVOCACAO_HABILITACAO,
  EtapaSessao.ANALISE_HABILITACAO,
  EtapaSessao.INTENCAO_RECURSO,
  EtapaSessao.PRAZO_RECURSAL,
  EtapaSessao.ANALISE_RECURSOS,
  EtapaSessao.ADJUDICACAO,
  EtapaSessao.ENCERRAMENTO,
];

/**
 * SIGILO DA IDENTIDADE DOS LICITANTES (E1a — blindagem de acesso).
 *
 * Durante a disputa ninguém além do órgão dono vê quem é quem (IN 73, art. 21):
 * nem o público, nem os outros fornecedores. Várias saídas antigas (eventos da
 * sessão, chat, entidade da sessão, lances do /sessao) carregam id, razão
 * social ou CNPJ em campos variados — inclusive dentro de textos ("Fornecedor
 * <razão social> convocado..."). Em vez de caçar campo a campo, a saída para
 * quem NÃO é o órgão dono passa por uma substituição de todas as ocorrências
 * da identidade de cada licitante da licitação (id, CNPJ, razão social, nome
 * fantasia) pelo código anônimo da sessão ("Fornecedor A" / "anonimo-a").
 *
 * O próprio fornecedor (`exceto`) continua vendo a sua identidade.
 *
 * Stateless (só DataSource): registrado como provider em cada módulo que usa.
 */

export interface SubstituicaoIdentidade {
  de: string;
  para: string;
  /** Fornecedor a quem a identidade pertence. */
  dono?: string;
}

interface ParticipanteRow {
  id: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  cpf_cnpj: string | null;
}

/** Código anônimo → id anônimo no formato já usado pela disputa-v2 ("Fornecedor B" → "anonimo-b"). */
export function idAnonimo(codigo: string): string {
  return `anonimo-${codigo.replace('Fornecedor ', '').toLowerCase()}`;
}

/** Texto do JSON de uma string (para buscar dentro do payload serializado). */
function noJson(s: string): string {
  return JSON.stringify(s).slice(1, -1);
}

/** Substitui, no payload inteiro (qualquer profundidade), cada `de` por `para`. */
export function anonimizarPayload<T>(payload: T, subs: SubstituicaoIdentidade[]): T {
  if (payload === null || payload === undefined || subs.length === 0) return payload;
  let texto = JSON.stringify(payload);
  if (texto === undefined) return payload;
  for (const s of subs) {
    const de = noJson(s.de);
    if (!de || !texto.includes(de)) continue;
    texto = texto.split(de).join(noJson(s.para));
  }
  return JSON.parse(texto);
}

@Injectable()
export class SigiloDisputaService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  /**
   * Substituições para esconder os licitantes da licitação (todos que têm
   * proposta, em qualquer status) — menos o `exceto` (o fornecedor que olha).
   */
  async substituicoes(
    licitacaoId: string | null | undefined,
    opts: { sessaoId?: string | null; exceto?: string | null } = {},
  ): Promise<SubstituicaoIdentidade[]> {
    if (!ehUuid(licitacaoId)) return [];
    const participantes: ParticipanteRow[] = await this.dataSource.query(
      `SELECT DISTINCT f.id, f.razao_social, f.nome_fantasia, f.cpf_cnpj
         FROM propostas p JOIN fornecedores f ON f.id = p.fornecedor_id
        WHERE p.licitacao_id = $1`,
      [licitacaoId],
    );

    let sessaoId = opts.sessaoId;
    if (!ehUuid(sessaoId)) {
      const s = await this.dataSource.query(
        `SELECT id FROM sessoes_disputa WHERE licitacao_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [licitacaoId],
      );
      sessaoId = s[0]?.id ?? null;
    }
    const codigos = new Map<string, string>();
    if (ehUuid(sessaoId)) {
      const rows: Array<{ fornecedor_id: string; codigo_anonimo: string }> = await this.dataSource.query(
        `SELECT fornecedor_id, codigo_anonimo FROM mapeamento_anonimo WHERE sessao_id = $1`,
        [sessaoId],
      );
      for (const r of rows) codigos.set(String(r.fornecedor_id), r.codigo_anonimo);
    }

    const subs: SubstituicaoIdentidade[] = [];
    for (const p of participantes) {
      const id = String(p.id);
      if (opts.exceto && id === opts.exceto) continue;
      const codigo = codigos.get(id) || 'Fornecedor (anônimo)';
      subs.push({ de: id, para: codigos.has(id) ? idAnonimo(codigo) : 'anonimo', dono: id });
      const nomes = [p.razao_social, p.nome_fantasia].filter((n): n is string => !!n && n.trim().length >= 4);
      for (const n of nomes) subs.push({ de: n, para: codigo, dono: id });
      if (p.cpf_cnpj) {
        subs.push({ de: p.cpf_cnpj, para: codigo, dono: id });
        const digitos = p.cpf_cnpj.replace(/\D/g, '');
        if (digitos.length >= 11 && digitos !== p.cpf_cnpj) subs.push({ de: digitos, para: codigo, dono: id });
      }
    }
    // Mais longos primeiro (razão social que contém o nome fantasia etc.)
    subs.sort((a, b) => b.de.length - a.de.length);
    return subs;
  }

  /** Atalho: substituições da licitação aplicadas ao payload. */
  async anonimizar<T>(
    payload: T,
    licitacaoId: string | null | undefined,
    opts: { sessaoId?: string | null; exceto?: string | null } = {},
  ): Promise<T> {
    const subs = await this.substituicoes(licitacaoId, opts);
    return anonimizarPayload(payload, subs);
  }

  /**
   * A fase de lances da sessão já terminou (habilitação em diante, ou sessão
   * encerrada)? A partir daí a identidade dos licitantes é pública (ata,
   * habilitação, recursos) — mesma regra do chat da sessão.
   */
  async identidadesReveladas(sessaoId: string): Promise<boolean> {
    if (!ehUuid(sessaoId)) return false;
    const r = await this.dataSource.query(`SELECT etapa, status FROM sessoes_disputa WHERE id = $1`, [sessaoId]);
    if (!r[0]) return false;
    return r[0].status === StatusSessao.ENCERRADA || ETAPAS_IDENTIDADE_REVELADA.includes(r[0].etapa);
  }

  /** Razão social do fornecedor (do cadastro). */
  async nomeDoFornecedor(fornecedorId: string): Promise<string | null> {
    if (!ehUuid(fornecedorId)) return null;
    const r = await this.dataSource.query(`SELECT razao_social FROM fornecedores WHERE id = $1`, [fornecedorId]);
    return r[0]?.razao_social ?? null;
  }

  /** Código anônimo já atribuído ao fornecedor na sessão (só leitura); 'Licitante' se não houver. */
  async codigoDe(sessaoId: string, fornecedorId: string): Promise<string> {
    if (!ehUuid(sessaoId) || !fornecedorId) return 'Licitante';
    const r = await this.dataSource.query(
      `SELECT codigo_anonimo FROM mapeamento_anonimo WHERE sessao_id = $1 AND fornecedor_id = $2`,
      [sessaoId, fornecedorId],
    );
    return r[0]?.codigo_anonimo || 'Licitante';
  }

  /** Orçamento sigiloso (art. 24)? — valor de referência fora das visões não-dono. */
  async orcamentoSigiloso(licitacaoId: string | null | undefined): Promise<boolean> {
    if (!ehUuid(licitacaoId)) return false;
    const r = await this.dataSource.query(`SELECT sigilo_orcamento FROM licitacoes WHERE id = $1`, [licitacaoId]);
    return r[0]?.sigilo_orcamento === 'SIGILOSO';
  }

  /**
   * A etapa de lances da LICITAÇÃO inteira acabou (nenhum item aguardando ou em
   * disputa)? Só então as identidades de um item encerrado podem ser
   * reveladas a quem não é o órgão dono — revelar o vencedor de um item com
   * outros ainda em disputa abre espaço a conluio entre itens (E1a → E2).
   */
  async etapaDeLancesEncerrada(licitacaoId: string | null | undefined): Promise<boolean> {
    if (!ehUuid(licitacaoId)) return false;
    const [r] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status_disputa IS NULL
                                  OR status_disputa::text IN ('AGUARDANDO','EM_DISPUTA','TEMPO_ALEATORIO'))::int AS abertos
         FROM itens_licitacao WHERE licitacao_id = $1`,
      [licitacaoId],
    );
    return Number(r?.total) > 0 && Number(r?.abertos) === 0;
  }

  /** Identidades do item podem aparecer? Item encerrado E etapa de lances da licitação encerrada. */
  async identidadesReveladasNoItem(itemId: string): Promise<boolean> {
    if (!ehUuid(itemId)) return false;
    let r = await this.dataSource.query(`SELECT status_disputa, licitacao_id FROM itens_licitacao WHERE id = $1`, [itemId]);
    // Unidade LOTE (disputa por lote): mesmo critério, pelo status do lote
    if (!r[0]) r = await this.dataSource.query(`SELECT status_disputa, licitacao_id FROM lotes_licitacao WHERE id = $1`, [itemId]);
    if (!r[0] || itemEmFaseComAnonimizacaoObrigatoria(r[0].status_disputa)) return false;
    return this.etapaDeLancesEncerrada(r[0].licitacao_id);
  }

  /**
   * Quem está lendo: 'ORGAO' (órgão dono ou admin — dados completos),
   * 'FORNECEDOR' (participante — vê a própria identidade) ou 'PUBLICO'
   * (anônimo, ou logado sem relação com a licitação).
   */
  async visaoDoAtor(ator: Ator | null | undefined, licitacaoId: string): Promise<VisaoDisputa> {
    const relacao = await this.acesso.relacaoComLicitacao(ator, licitacaoId);
    if (relacao === 'ADMIN' || relacao === 'ORGAO_DONO') return { tipo: 'ORGAO' };
    if (relacao === 'FORNECEDOR_PARTICIPANTE' && ator?.fornecedorId) {
      return { tipo: 'FORNECEDOR', fornecedorId: ator.fornecedorId };
    }
    return { tipo: 'PUBLICO' };
  }

  /**
   * Prepara a visão de uma licitação UMA vez (participantes, códigos, sigilo)
   * e devolve uma função síncrona — para broadcasts a muitos sockets.
   */
  async aplicador(licitacaoId: string, sessaoId?: string | null): Promise<AplicadorVisao> {
    const todas = await this.substituicoes(licitacaoId, { sessaoId });
    const sigiloso = await this.orcamentoSigiloso(licitacaoId);
    return <T>(payload: T, visao: VisaoDisputa, opts: { identidades?: boolean } = {}): T => {
      if (visao.tipo === 'ORGAO') return payload;
      let saida = payload;
      if (opts.identidades !== false) {
        const subs = visao.tipo === 'FORNECEDOR' ? todas.filter((s) => s.dono !== visao.fornecedorId) : todas;
        saida = anonimizarPayload(saida, subs);
      }
      return sigiloso ? semValorReferencia(saida) : saida;
    };
  }

  /**
   * Aplica a visão ao payload: órgão dono recebe tudo; os demais recebem as
   * identidades dos outros licitantes trocadas pelo código anônimo e, se o
   * orçamento for sigiloso, sem `valorReferencia`.
   */
  async aplicarVisao<T>(
    payload: T,
    licitacaoId: string,
    visao: VisaoDisputa,
    opts: { sessaoId?: string | null; identidades?: boolean } = {},
  ): Promise<T> {
    if (visao.tipo === 'ORGAO') return payload;
    let saida = payload;
    if (opts.identidades !== false) {
      saida = await this.anonimizar(saida, licitacaoId, {
        sessaoId: opts.sessaoId,
        exceto: visao.tipo === 'FORNECEDOR' ? visao.fornecedorId : null,
      });
    }
    if (await this.orcamentoSigiloso(licitacaoId)) saida = semValorReferencia(saida);
    return saida;
  }
}

export type AplicadorVisao = <T>(payload: T, visao: VisaoDisputa, opts?: { identidades?: boolean }) => T;

export type VisaoDisputa =
  | { tipo: 'ORGAO' }
  | { tipo: 'FORNECEDOR'; fornecedorId: string }
  | { tipo: 'PUBLICO' };

/** Remove (null) `valorReferencia` em qualquer profundidade — orçamento sigiloso. */
export function semValorReferencia<T>(payload: T): T {
  const visitar = (v: any): any => {
    if (Array.isArray(v)) return v.map(visitar);
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const out: any = {};
      for (const [k, val] of Object.entries(v)) {
        out[k] = k === 'valorReferencia' || k === 'valor_unitario_estimado' || k === 'valor_total_estimado' ? null : visitar(val);
      }
      return out;
    }
    return v;
  };
  return visitar(payload);
}
