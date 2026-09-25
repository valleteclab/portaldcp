import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Ator, ehFornecedor, ehOrgao } from './ator';

/**
 * Modo do acesso — define o status da recusa a quem NÃO é dono:
 *  - 'leitura': 404 (não confirma que o recurso existe para quem é de fora);
 *  - 'escrita': 403 (ato proibido; o recurso já é conhecido de quem tenta agir).
 * Recurso inexistente é sempre 404. Papel errado (ex.: fornecedor num ato do
 * órgão) é sempre 403. Sem ator (anônimo) é sempre 401.
 */
export type ModoAcesso = 'leitura' | 'escrita';

/** Status de proposta que NÃO contam como participação. */
export const STATUS_PROPOSTA_INVALIDA = ['RASCUNHO', 'DESCLASSIFICADA', 'CANCELADA'];

export interface DonoLicitacao {
  licitacaoId: string;
  orgaoId: string;
}

/**
 * Checagens de DONO reutilizáveis (licitação, sessão, ata, credenciamento,
 * documento, órgão) e de PARTICIPAÇÃO do fornecedor.
 *
 * Uso típico no controller:
 *
 *   @Put(':id/homologar')
 *   @SomenteOrgao()
 *   async homologar(@Param('id') id: string, @AtorAtual() ator: Ator) {
 *     await this.acesso.assertOrgaoDaLicitacao(ator, id);          // escrita → 403
 *     ...
 *   }
 *
 *   @Get(':id/processo-completo')
 *   @SomenteOrgao()
 *   async pc(@Param('id') id: string, @AtorAtual() ator: Ator) {
 *     await this.acesso.assertOrgaoDaLicitacao(ator, id, 'leitura'); // outro órgão → 404
 *   }
 *
 * ADMIN da plataforma passa em todas as checagens de órgão (não em participação
 * de fornecedor). Consultas por SQL simples para não acoplar módulos.
 */
@Injectable()
export class AcessoLicitacaoService {
  constructor(private readonly dataSource: DataSource) {}

  // ---------------------------------------------------------------------------
  // Consultas (sem exceção)
  // ---------------------------------------------------------------------------

  /** orgao_id da licitação (null se não existe). */
  async orgaoDaLicitacao(licitacaoId: string): Promise<string | null> {
    if (!ehUuid(licitacaoId)) return null;
    const r = await this.dataSource.query(`SELECT orgao_id FROM licitacoes WHERE id = $1`, [licitacaoId]);
    return r[0]?.orgao_id ?? null;
  }

  /** Licitação e órgão da sessão de disputa (null se não existe). */
  async donoDaSessao(sessaoId: string): Promise<DonoLicitacao | null> {
    if (!ehUuid(sessaoId)) return null;
    const r = await this.dataSource.query(
      `SELECT s.licitacao_id, l.orgao_id FROM sessoes_disputa s JOIN licitacoes l ON l.id = s.licitacao_id WHERE s.id = $1`,
      [sessaoId],
    );
    return r[0] ? { licitacaoId: r[0].licitacao_id, orgaoId: r[0].orgao_id } : null;
  }

  /** Licitação e órgão de um item de licitação (null se não existe). */
  async donoDoItem(itemId: string): Promise<DonoLicitacao | null> {
    if (!ehUuid(itemId)) return null;
    const r = await this.dataSource.query(
      `SELECT i.licitacao_id, l.orgao_id FROM itens_licitacao i JOIN licitacoes l ON l.id = i.licitacao_id WHERE i.id = $1`,
      [itemId],
    );
    return r[0] ? { licitacaoId: r[0].licitacao_id, orgaoId: r[0].orgao_id } : null;
  }

  /** Licitação e órgão de um lote de licitação (null se não existe). */
  async donoDoLote(loteId: string): Promise<DonoLicitacao | null> {
    if (!ehUuid(loteId)) return null;
    const r = await this.dataSource.query(
      `SELECT lt.licitacao_id, l.orgao_id FROM lotes_licitacao lt JOIN licitacoes l ON l.id = lt.licitacao_id WHERE lt.id = $1`,
      [loteId],
    );
    return r[0] ? { licitacaoId: r[0].licitacao_id, orgaoId: r[0].orgao_id } : null;
  }

  /** Unidade de disputa (item ou lote — a sala usa o mesmo id): licitação e órgão. */
  async donoDaUnidade(id: string): Promise<DonoLicitacao | null> {
    return (await this.donoDoItem(id)) ?? (await this.donoDoLote(id));
  }

  async assertOrgaoDoLote(ator: Ator | null | undefined, loteId: string, modo: ModoAcesso = 'escrita'): Promise<DonoLicitacao> {
    const dono = await this.donoDoLote(loteId);
    this.assertMesmoOrgao(ator, dono?.orgaoId, modo, 'Lote');
    return dono!;
  }

  /** Fornecedor tem proposta válida (enviada, não desclassificada/cancelada) na licitação? */
  async fornecedorParticipa(fornecedorId: string, licitacaoId: string): Promise<boolean> {
    if (!ehUuid(fornecedorId) || !ehUuid(licitacaoId)) return false;
    const r = await this.dataSource.query(
      `SELECT 1 FROM propostas WHERE licitacao_id = $1 AND fornecedor_id = $2 AND status::text <> ALL($3::text[]) LIMIT 1`,
      [licitacaoId, fornecedorId, STATUS_PROPOSTA_INVALIDA],
    );
    return r.length > 0;
  }

  /**
   * Relação do ator com a licitação (para gateways e leituras mistas):
   * 'ADMIN' | 'ORGAO_DONO' | 'FORNECEDOR_PARTICIPANTE' | null (nenhuma / não existe).
   */
  async relacaoComLicitacao(
    ator: Ator | null | undefined,
    licitacaoId: string,
  ): Promise<'ADMIN' | 'ORGAO_DONO' | 'FORNECEDOR_PARTICIPANTE' | null> {
    if (!ator) return null;
    const orgaoId = await this.orgaoDaLicitacao(licitacaoId);
    if (!orgaoId) return null;
    if (ator.admin) return 'ADMIN';
    if (ehOrgao(ator)) return ator.orgaoId === orgaoId ? 'ORGAO_DONO' : null;
    if (ehFornecedor(ator)) {
      return (await this.fornecedorParticipa(ator.fornecedorId, licitacaoId)) ? 'FORNECEDOR_PARTICIPANTE' : null;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Asserções (lançam 401/403/404)
  // ---------------------------------------------------------------------------

  /**
   * O ator é do órgão `orgaoIdDoRecurso` (ou ADMIN). Base das demais.
   * `recurso` só compõe a mensagem de 404 ("Licitação não encontrada").
   */
  assertMesmoOrgao(
    ator: Ator | null | undefined,
    orgaoIdDoRecurso: string | null | undefined,
    modo: ModoAcesso = 'escrita',
    recurso = 'Recurso',
  ): void {
    if (!ator) throw new UnauthorizedException('Autenticação necessária');
    if (!orgaoIdDoRecurso) throw new NotFoundException(`${recurso} não encontrado(a)`);
    if (ator.admin) return;
    if (!ehOrgao(ator)) throw new ForbiddenException('Ação exclusiva do órgão');
    if (ator.orgaoId !== orgaoIdDoRecurso) {
      if (modo === 'leitura') throw new NotFoundException(`${recurso} não encontrado(a)`);
      throw new ForbiddenException(`Acesso negado: ${recurso.toLowerCase()} pertence a outro órgão`);
    }
  }

  /** Rotas com `:orgaoId` (ex.: parâmetros do órgão): só o próprio órgão ou ADMIN. */
  assertProprioOrgao(ator: Ator | null | undefined, orgaoId: string, modo: ModoAcesso = 'escrita'): void {
    if (!ator) throw new UnauthorizedException('Autenticação necessária');
    if (ator.admin) return;
    if (!ehOrgao(ator)) throw new ForbiddenException('Ação exclusiva do órgão');
    if (ator.orgaoId !== orgaoId) {
      if (modo === 'leitura') throw new NotFoundException('Órgão não encontrado');
      throw new ForbiddenException('Acesso negado: você não pertence a este órgão');
    }
  }

  async assertOrgaoDaLicitacao(ator: Ator | null | undefined, licitacaoId: string, modo: ModoAcesso = 'escrita'): Promise<DonoLicitacao> {
    const orgaoId = await this.orgaoDaLicitacao(licitacaoId);
    this.assertMesmoOrgao(ator, orgaoId, modo, 'Licitação');
    return { licitacaoId, orgaoId: orgaoId! };
  }

  async assertOrgaoDaSessao(ator: Ator | null | undefined, sessaoId: string, modo: ModoAcesso = 'escrita'): Promise<DonoLicitacao> {
    const dono = await this.donoDaSessao(sessaoId);
    this.assertMesmoOrgao(ator, dono?.orgaoId, modo, 'Sessão');
    return dono!;
  }

  async assertOrgaoDoItem(ator: Ator | null | undefined, itemId: string, modo: ModoAcesso = 'escrita'): Promise<DonoLicitacao> {
    const dono = await this.donoDoItem(itemId);
    this.assertMesmoOrgao(ator, dono?.orgaoId, modo, 'Item');
    return dono!;
  }

  async assertOrgaoDaAta(ator: Ator | null | undefined, ataId: string, modo: ModoAcesso = 'escrita'): Promise<{ orgaoId: string }> {
    const orgaoId = await this.orgaoPorTabela('atas_registro_preco', ataId);
    this.assertMesmoOrgao(ator, orgaoId, modo, 'Ata');
    return { orgaoId: orgaoId! };
  }

  async assertOrgaoDoCredenciamento(ator: Ator | null | undefined, credenciamentoId: string, modo: ModoAcesso = 'escrita'): Promise<{ orgaoId: string }> {
    const orgaoId = await this.orgaoPorTabela('credenciamentos', credenciamentoId);
    this.assertMesmoOrgao(ator, orgaoId, modo, 'Credenciamento');
    return { orgaoId: orgaoId! };
  }

  /** Documento da licitação → órgão da licitação. */
  async assertOrgaoDoDocumento(ator: Ator | null | undefined, documentoId: string, modo: ModoAcesso = 'escrita'): Promise<DonoLicitacao> {
    let dono: DonoLicitacao | null = null;
    if (ehUuid(documentoId)) {
      const r = await this.dataSource.query(
        `SELECT d.licitacao_id, l.orgao_id FROM documentos_licitacao d JOIN licitacoes l ON l.id = d.licitacao_id WHERE d.id = $1`,
        [documentoId],
      );
      dono = r[0] ? { licitacaoId: r[0].licitacao_id, orgaoId: r[0].orgao_id } : null;
    }
    this.assertMesmoOrgao(ator, dono?.orgaoId, modo, 'Documento');
    return dono!;
  }

  /**
   * Fornecedor autenticado COM proposta válida na licitação. Devolve o id do
   * fornecedor (do token). 401 sem ator; 403 se não é fornecedor ou não participa.
   */
  async assertFornecedorParticipa(ator: Ator | null | undefined, licitacaoId: string): Promise<string> {
    if (!ator) throw new UnauthorizedException('Autenticação necessária');
    if (!ehFornecedor(ator)) throw new ForbiddenException('Ação exclusiva de fornecedor');
    if (!(await this.fornecedorParticipa(ator.fornecedorId, licitacaoId))) {
      throw new ForbiddenException('Apenas fornecedores com proposta válida nesta licitação');
    }
    return ator.fornecedorId;
  }

  /**
   * Id do fornecedor para ações "em nome próprio": sempre o do token. Se o
   * cliente mandou um id (corpo/query legado) diferente, recusa com 403 em vez
   * de ignorar em silêncio (tentativa de agir por outro fica visível).
   */
  fornecedorDoToken(ator: Ator | null | undefined, idInformado?: string | null): string {
    if (!ator) throw new UnauthorizedException('Autenticação necessária');
    if (!ehFornecedor(ator)) throw new ForbiddenException('Ação exclusiva de fornecedor');
    if (idInformado && idInformado !== ator.fornecedorId) {
      throw new ForbiddenException('O fornecedor informado não confere com o usuário autenticado');
    }
    return ator.fornecedorId;
  }

  // ---------------------------------------------------------------------------

  private async orgaoPorTabela(tabela: 'atas_registro_preco' | 'credenciamentos', id: string): Promise<string | null> {
    if (!ehUuid(id)) return null;
    const r = await this.dataSource.query(`SELECT orgao_id FROM ${tabela} WHERE id = $1`, [id]);
    return r[0]?.orgao_id ?? null;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Evita 500 do Postgres com id malformado (vira 404). */
export function ehUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}
