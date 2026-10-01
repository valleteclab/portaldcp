import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { Ator } from '../auth/acesso/ator';
import { ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { NumeroProcessoService } from '../numero-processo/numero-processo.service';
import { Processo, REFERENCIA_LICITACAO, ReferenciaProcesso, SituacaoProcesso, TipoProcesso } from './entities/processo.entity';
import { normalizarFiltrosListagem, situacaoDoProcessoPelaLicitacao } from './processo-regras';

/** Quem abre o processo (do JWT ou do ator do histórico — nunca do corpo). */
export interface AutorAbertura {
  /** ORGAO, USUARIO, ADMIN ou SISTEMA. */
  tipo: string;
  id: string | null;
  nome?: string | null;
}

export interface DadosAbertura {
  orgaoId: string;
  tipo: TipoProcesso;
  objeto: string;
  /** Nº digitado (único no órgão → 409) ou vazio → o gerador único (órgão/ano). */
  numero?: unknown;
  referencia?: { tipo: ReferenciaProcesso; id: string } | null;
  setorOrigemId?: string | null;
  abertoPor?: AutorAbertura | null;
  origem?: string | null;
  abertoEm?: Date | null;
}

/** Tabelas da fase interna que ganharam `processo_id` (ligação preenchida pela migração de boot). */
export const TABELAS_COM_PROCESSO_ID = [
  'tramitacoes_processo',
  'juntadas_autos',
  'documentos_fase_interna',
  'despachos_fase_interna',
  'fluxos_processo_fase_interna',
  'tarefas',
] as const;

/**
 * PROCESSO ELETRÔNICO — a API genérica (abrir um processo de um tipo, obter,
 * listar por órgão/tipo, ligar/desligar a referência). Os serviços da
 * licitação chamam isto por baixo ao criar/renumerar/excluir a licitação.
 *
 * Isolamento: toda leitura recebe o ator; processo de outro órgão → 404 (como
 * se não existisse). O admin da plataforma enxerga qualquer órgão.
 */
@Injectable()
export class ProcessoService {
  private readonly logger = new Logger(ProcessoService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(Processo) private readonly repo: Repository<Processo>,
    private readonly numeros: NumeroProcessoService,
  ) {}

  // ==========================================================================
  // Abertura
  // ==========================================================================

  /**
   * Abre um processo. Passe o `EntityManager` da transação de quem cria o
   * conteúdo (licitação): o número é consumido nessa transação e volta se a
   * criação falhar (o mesmo contrato do NumeroProcessoService).
   */
  async abrir(dados: DadosAbertura, m?: EntityManager): Promise<Processo> {
    if (!dados.orgaoId) throw new BadRequestException('Órgão não identificado para abrir o processo.');
    const exec = m ?? this.ds.manager;
    const numero = await this.numeros.numeroParaCriacao(dados.orgaoId, dados.numero, m);
    const autor = await this.resolverAutor(exec, dados.abertoPor ?? null);
    const repo = exec.getRepository(Processo);
    const p = repo.create({
      orgao_id: dados.orgaoId,
      tipo: dados.tipo,
      numero,
      objeto: String(dados.objeto ?? '').trim() || '(sem objeto)',
      situacao: 'ABERTO',
      referencia_tipo: dados.referencia?.tipo ?? null,
      referencia_id: dados.referencia?.id ?? null,
      setor_origem_id: dados.setorOrigemId ?? autor.setor_id ?? null,
      aberto_por_id: autor.id,
      aberto_por_nome: autor.nome,
      origem: dados.origem ?? null,
      aberto_em: dados.abertoEm ?? new Date(),
      encerrado_em: null,
      motivo_encerramento: null,
    });
    try {
      return await repo.save(p);
    } catch (e) {
      throw this.numeros.traduzirViolacao(e, numero);
    }
  }

  /**
   * Processo de CONTRATACAO aberto DENTRO da transação que grava a licitação:
   * o número do processo é o da autuação; a licitação recebe o mesmo número
   * (`licitacoes.numero_processo`, mantido por compatibilidade) e, gravada,
   * é ligada por `vincularReferencia`.
   */
  abrirContratacao(
    m: EntityManager,
    dados: { orgaoId: string; numeroDigitado?: unknown; objeto: string; abertoPor?: AutorAbertura | null; origem: string },
  ): Promise<Processo> {
    return this.abrir(
      { orgaoId: dados.orgaoId, tipo: TipoProcesso.CONTRATACAO, numero: dados.numeroDigitado, objeto: dados.objeto, abertoPor: dados.abertoPor, origem: dados.origem },
      m,
    );
  }

  async vincularReferencia(m: EntityManager | null, processoId: string, tipo: ReferenciaProcesso, id: string): Promise<void> {
    await (m ?? this.ds.manager).query(`UPDATE processos SET referencia_tipo = $2, referencia_id = $3, updated_at = now() WHERE id = $1`, [processoId, tipo, id]);
  }

  /**
   * Garante o processo de uma licitação que ainda não tem (dado anterior à
   * migração, ou criado por caminho que a migração ainda não alcançou —
   * ex.: migração legada do credenciamento no mesmo boot). Idempotente.
   */
  async garantirDaLicitacao(licitacaoId: string, m?: EntityManager): Promise<Processo | null> {
    const exec = m ?? this.ds.manager;
    const existente = await exec.getRepository(Processo).findOne({ where: { referencia_tipo: REFERENCIA_LICITACAO, referencia_id: licitacaoId } });
    if (existente) return existente;
    const [lic] = await exec.query(
      `SELECT id::text AS id, orgao_id::text AS orgao_id, numero_processo, objeto, situacao::text AS situacao,
              COALESCE(data_abertura_processo, created_at) AS aberto_em
         FROM licitacoes WHERE id::text = $1`,
      [licitacaoId],
    );
    if (!lic || !lic.orgao_id || !lic.numero_processo) return null;
    const repo = exec.getRepository(Processo);
    await exec.query(
      `INSERT INTO processos (orgao_id, tipo, numero, objeto, situacao, referencia_tipo, referencia_id, origem, aberto_em, encerrado_em)
       VALUES ($1::uuid, $2::varchar, $3::varchar, $4::text, $5::varchar, $6::varchar, $7::uuid, 'MIGRACAO', $8, CASE WHEN $5::varchar = 'ENCERRADO' THEN now() ELSE NULL END)
       ON CONFLICT DO NOTHING`,
      [lic.orgao_id, TipoProcesso.CONTRATACAO, lic.numero_processo, lic.objeto ?? '(sem objeto)', situacaoDoProcessoPelaLicitacao(lic.situacao), REFERENCIA_LICITACAO, lic.id, lic.aberto_em],
    );
    const p = await repo.findOne({ where: { referencia_tipo: REFERENCIA_LICITACAO, referencia_id: licitacaoId } });
    if (p) await this.vincularFilhosDaLicitacao(licitacaoId, exec);
    return p;
  }

  /** Renumeração da licitação (edição do nº): o processo acompanha. */
  async atualizarNumeroDaLicitacao(licitacaoId: string, numero: string, m?: EntityManager): Promise<void> {
    await (m ?? this.ds.manager).query(
      `UPDATE processos SET numero = $2, updated_at = now() WHERE referencia_tipo = $3 AND referencia_id::text = $1 AND numero <> $2`,
      [licitacaoId, numero, REFERENCIA_LICITACAO],
    );
  }

  /** Objeto da licitação alterado: o processo acompanha (sem tocar no resto). */
  async atualizarObjetoDaLicitacao(licitacaoId: string, objeto: string, m?: EntityManager): Promise<void> {
    const texto = String(objeto ?? '').trim();
    if (!texto) return;
    await (m ?? this.ds.manager).query(
      `UPDATE processos SET objeto = $2, updated_at = now() WHERE referencia_tipo = $3 AND referencia_id::text = $1 AND objeto <> $2`,
      [licitacaoId, texto, REFERENCIA_LICITACAO],
    );
  }

  /** Licitação excluída (só na fase interna): o processo sai junto, na mesma transação. */
  async aoExcluirLicitacao(licitacaoId: string, m: EntityManager): Promise<void> {
    await m.query(`DELETE FROM processos WHERE referencia_tipo = $2 AND referencia_id::text = $1`, [licitacaoId, REFERENCIA_LICITACAO]);
  }

  /**
   * Preenche `processo_id` nas tabelas da fase interna de UMA licitação (linhas
   * ainda sem ligação). Usado pela migração de boot e por `garantirDaLicitacao`.
   */
  async vincularFilhosDaLicitacao(licitacaoId: string, m?: EntityManager): Promise<number> {
    const exec = m ?? this.ds.manager;
    let total = 0;
    for (const tabela of TABELAS_COM_PROCESSO_ID) {
      const r = await exec.query(
        `UPDATE ${tabela} t SET processo_id = p.id FROM processos p
          WHERE p.referencia_tipo = $2 AND p.referencia_id::text = t.licitacao_id::text
            AND t.licitacao_id::text = $1 AND t.processo_id IS NULL`,
        [licitacaoId, REFERENCIA_LICITACAO],
      );
      total += Number(Array.isArray(r) ? r[1] ?? 0 : 0);
    }
    return total;
  }

  // ==========================================================================
  // Leitura (sempre pelo ator)
  // ==========================================================================

  /** Órgão que a consulta enxerga: o do token; admin da plataforma pode informar outro. */
  orgaoDaConsulta(ator: Ator, informado?: string | null): string | null {
    if (ator.admin) return informado && ehUuid(informado) ? informado : null;
    return ator.orgaoId;
  }

  /** Processo do órgão do ator; outro órgão (ou inexistente) → 404. */
  async obter(ator: Ator, id: string): Promise<Processo> {
    const p = ehUuid(id) ? await this.repo.findOne({ where: { id } }) : null;
    if (!p || (!ator.admin && p.orgao_id !== ator.orgaoId)) throw new NotFoundException('Processo não encontrado');
    return p;
  }

  /** Processo pela referência de conteúdo (ex.: LICITACAO + id). Cria sob demanda para licitação antiga. */
  async porReferencia(ator: Ator, tipo: string, id: string): Promise<Processo> {
    const t = String(tipo ?? '').toUpperCase();
    if (t !== REFERENCIA_LICITACAO || !ehUuid(id)) throw new NotFoundException('Processo não encontrado');
    let p = await this.repo.findOne({ where: { referencia_tipo: REFERENCIA_LICITACAO, referencia_id: id } });
    if (!p) {
      // Só cria se a licitação for do órgão do ator (não revela licitação alheia)
      const [lic] = await this.ds.query(`SELECT orgao_id::text AS orgao_id FROM licitacoes WHERE id::text = $1`, [id]);
      if (!lic || (!ator.admin && lic.orgao_id !== ator.orgaoId)) throw new NotFoundException('Processo não encontrado');
      p = await this.garantirDaLicitacao(id);
    }
    if (!p || (!ator.admin && p.orgao_id !== ator.orgaoId)) throw new NotFoundException('Processo não encontrado');
    return p;
  }

  async listar(ator: Ator, query: any): Promise<Processo[]> {
    const orgaoId = this.orgaoDaConsulta(ator, query?.orgao_id);
    if (!orgaoId) return [];
    const f = normalizarFiltrosListagem(query);
    const qb = this.repo.createQueryBuilder('p').where('p.orgao_id = :orgaoId', { orgaoId });
    if (f.tipo) qb.andWhere('p.tipo = :tipo', { tipo: f.tipo });
    if (f.situacao) qb.andWhere('p.situacao = :situacao', { situacao: f.situacao });
    if (f.busca) qb.andWhere('(p.numero ILIKE :busca OR p.objeto ILIKE :busca)', { busca: `%${f.busca}%` });
    return qb.orderBy('p.aberto_em', 'DESC').addOrderBy('p.numero', 'DESC').limit(f.limite).getMany();
  }

  /** Id da licitação de um processo de CONTRATACAO (400 nos demais tipos). */
  licitacaoIdDe(p: Processo): string {
    if (p.tipo !== TipoProcesso.CONTRATACAO || p.referencia_tipo !== REFERENCIA_LICITACAO || !p.referencia_id) {
      throw new BadRequestException('Este processo não é de contratação (não tem licitação associada).');
    }
    return p.referencia_id;
  }

  async encerrar(ator: Ator, id: string, motivo: string | null): Promise<Processo> {
    const p = await this.obter(ator, id);
    if (p.tipo === TipoProcesso.CONTRATACAO) {
      throw new BadRequestException('O processo de contratação encerra pelos atos da licitação (revogar, anular, concluir).');
    }
    if (p.situacao === 'ENCERRADO') return p;
    p.situacao = 'ENCERRADO' as SituacaoProcesso;
    p.encerrado_em = new Date();
    p.motivo_encerramento = motivo ? String(motivo).slice(0, 2000) : null;
    return this.repo.save(p);
  }

  // ==========================================================================
  // Apoio
  // ==========================================================================

  async setorEhDoOrgao(orgaoId: string, setorId: string): Promise<boolean> {
    if (!ehUuid(setorId)) return false;
    const [s] = await this.ds.query(`SELECT orgao_id::text AS orgao_id FROM setores WHERE id::text = $1`, [setorId]);
    return !!s && s.orgao_id === orgaoId;
  }

  /** Nome e lotação de quem abre (usuário do órgão ou o próprio órgão); sistema → só a origem. */
  private async resolverAutor(exec: EntityManager, a: AutorAbertura | null): Promise<{ id: string | null; nome: string | null; setor_id: string | null }> {
    if (!a || !a.id) return { id: null, nome: null, setor_id: null };
    const id = String(a.id).slice(0, 100);
    if (a.tipo === 'USUARIO' && ehUuid(id)) {
      const [u] = await exec.query(`SELECT nome, setor_id::text AS setor_id FROM usuarios WHERE id::text = $1`, [id]);
      return { id, nome: a.nome ?? u?.nome ?? null, setor_id: u?.setor_id ?? null };
    }
    if (a.tipo === 'ORGAO' && ehUuid(id)) {
      const [o] = await exec.query(`SELECT nome FROM orgaos WHERE id::text = $1`, [id]);
      return { id, nome: a.nome ?? o?.nome ?? null, setor_id: null };
    }
    return { id, nome: a.nome ?? (a.tipo === 'SISTEMA' ? `Sistema (${id})` : null), setor_id: null };
  }

  /** Ator do JWT → autor da abertura. */
  static autorDoAtor(ator: Ator | null | undefined): AutorAbertura | null {
    if (!ator) return null;
    if (ator.tipo === 'USUARIO') return { tipo: 'USUARIO', id: ator.usuarioId };
    if (ator.tipo === 'ORGAO') return { tipo: 'ORGAO', id: ator.orgaoId };
    if (ator.admin) return { tipo: 'ADMIN', id: 'admin', nome: 'Administrador da plataforma' };
    return null;
  }
}
