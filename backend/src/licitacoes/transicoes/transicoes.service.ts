import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { Licitacao, SituacaoLicitacao } from '../entities/licitacao.entity';
import { definicaoDoAto } from './definicoes';
import { LicitacaoTransicao } from './licitacao-transicao.entity';
import {
  aplicarNoEstado,
  atoDeRetorno,
  atoPrincipal,
  avaliarAtosDisponiveis,
  conflitoDeEstado,
  jaAplicado,
  pendenciasDoAto,
  situacaoDe,
} from './maquina';
import { avaliarRollupItens } from './rollup';
import { TransicoesEventos } from './transicoes-eventos';
import {
  AtoDisponivel,
  AtoLicitacao,
  AtorTransicao,
  ConsultasTransicao,
  ContextoTransicao,
  DefinicaoAto,
  OpcoesExecucao,
  REGISTRO_CRIACAO,
} from './transicoes.tipos';
import { conferenciaArt48Sql } from '../../julgamento/me-epp/beneficio-mpe.sql';
import { habilitacaoPreviaPendenteSql, unidadesSemHabilitadoSql } from '../../habilitacao/habilitacao.sql';
import { estadoRecursalSql } from '../../sessao/recursos.sql';

/**
 * ============================================================================
 * TRANSIÇÕES DA LICITAÇÃO — máquina de estados ÚNICA (plano E1)
 * ============================================================================
 *
 * Toda mudança de `licitacao.fase` / `licitacao.situacao` passa por `executar`:
 *   1. transação + lock pessimista na linha da licitação (cron × usuário não
 *      fazem transição dupla: quem chega depois relê o estado e recebe 409);
 *   2. valida fase + situação (409) e pré-condições (400, com as pendências);
 *   3. aplica destino + efeitos (datas) + alterações do chamador (`aplicar`);
 *   4. grava `licitacao_transicoes` na mesma transação;
 *   5. depois do commit, emite o evento (TransicoesEventos).
 *
 * Os efeitos colaterais externos (PNCP, contrato, notificações) continuam,
 * por ora, nos métodos do LicitacoesService, chamados DEPOIS da transição.
 *
 * Métodos pensados para os próximos passos da E1 (sessao, pncp, fase-interna,
 * scheduler, admin-testes): `executar` (com `ignorarSeJaAplicado` para pedidos
 * idempotentes do cron/PNCP e `manager` para participar da transação do
 * chamador), `registrarCriacao`, `aplicarRollup`, `atosDisponiveis`.
 */
@Injectable()
export class TransicoesService {
  private readonly logger = new Logger(TransicoesService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly eventos: TransicoesEventos,
    private readonly moduleRef: ModuleRef,
  ) {}

  // ---------------------------------------------------------------------------
  // Execução
  // ---------------------------------------------------------------------------

  async executar(licitacaoId: string, ato: AtoLicitacao, opcoes: OpcoesExecucao): Promise<Licitacao> {
    const pendentesEmitir: Array<() => void> = [];
    const rodar = async (manager: EntityManager): Promise<Licitacao> => {
      const lic = await manager
        .getRepository(Licitacao)
        .createQueryBuilder('l')
        .setLock('pessimistic_write')
        .where('l.id = :id', { id: licitacaoId })
        .getOne();
      if (!lic) throw new NotFoundException(`Licitação com ID ${licitacaoId} não encontrada`);

      const def = definicaoDoAto(lic.modalidade, ato);
      if (def && opcoes.ignorarSeJaAplicado && jaAplicado(def, lic)) return lic;

      const ctx = await this.validar(lic, def, ato, manager, opcoes);

      const r = aplicarNoEstado(def!, lic, ctx);
      if (opcoes.aplicar) await opcoes.aplicar(lic, manager);
      const salva = await manager.getRepository(Licitacao).save(lic);

      const motivo = (opcoes.motivo || '').trim() || null;
      const registro = await manager.getRepository(LicitacaoTransicao).save(
        manager.getRepository(LicitacaoTransicao).create({
          licitacao_id: lic.id,
          fase_de: r.fase_de,
          fase_para: r.fase_para,
          situacao_de: r.situacao_de,
          situacao_para: r.situacao_para,
          ato,
          motivo,
          ator_tipo: opcoes.ator.tipo,
          ator_id: opcoes.ator.id,
          dados: this.dadosDoRegistro(opcoes),
        }),
      );

      pendentesEmitir.push(() =>
        this.eventos.emitir({
          transicao_id: registro.id,
          licitacao_id: lic.id,
          orgao_id: lic.orgao_id ?? null,
          modalidade: lic.modalidade,
          ato,
          fase_de: r.fase_de,
          fase_para: r.fase_para,
          situacao_de: r.situacao_de,
          situacao_para: r.situacao_para,
          motivo,
          ator: opcoes.ator,
          ocorrido_em: registro.created_at ?? new Date(),
        }),
      );
      this.logger.log(
        `[${lic.numero_processo}] ${ato}: ${r.fase_de}/${r.situacao_de} → ${r.fase_para}/${r.situacao_para} (${opcoes.ator.tipo}:${opcoes.ator.id ?? '-'})`,
      );
      return salva;
    };

    const resultado = opcoes.manager
      ? await rodar(opcoes.manager)
      : await this.dataSource.transaction((m) => rodar(m));
    // Com transação do chamador o commit é dele: emitimos ao sair daqui
    // (o chamador que precisar de "após commit" estrito deve emitir depois).
    for (const emitir of pendentesEmitir) emitir();
    return resultado;
  }

  /**
   * Confere se o ato pode ser praticado AGORA, sem aplicar nada (409 estado /
   * 400 pendências). Útil para validar antes de um cálculo caro; a execução
   * valida de novo, com lock.
   */
  async verificar(licitacaoId: string, ato: AtoLicitacao, opcoes: Omit<OpcoesExecucao, 'aplicar' | 'manager'>): Promise<void> {
    const lic = await this.carregar(licitacaoId);
    await this.validar(lic, definicaoDoAto(lic.modalidade, ato), ato, this.dataSource.manager, opcoes);
  }

  private async validar(
    lic: Licitacao,
    def: DefinicaoAto | undefined,
    ato: AtoLicitacao,
    manager: EntityManager,
    opcoes: Pick<OpcoesExecucao, 'ator' | 'motivo' | 'dados'>,
  ): Promise<ContextoTransicao> {
    const conflito = conflitoDeEstado(def, lic, ato);
    if (conflito) throw new ConflictException({ message: conflito, ato, fase: lic.fase, situacao: situacaoDe(lic) });
    const ctx = this.contexto(lic, def!, manager, opcoes);
    const pendencias = await pendenciasDoAto(def!, ctx);
    if (pendencias.length) {
      throw new BadRequestException({
        message: pendencias.length === 1 ? pendencias[0] : `Pendências para "${def!.rotulo}": ${pendencias.join(' | ')}`,
        ato,
        pendencias,
      });
    }
    return ctx;
  }

  /** Ato do PUT avancar-fase (compatibilidade): o "próximo" ato da fase atual. */
  async atoPrincipalDe(licitacaoId: string): Promise<{ licitacao: Licitacao; def: DefinicaoAto | undefined }> {
    const lic = await this.carregar(licitacaoId);
    return { licitacao: lic, def: atoPrincipal(lic) };
  }

  /** Ato do PUT retroceder-fase (compatibilidade). */
  async atoDeRetornoDe(licitacaoId: string): Promise<{ licitacao: Licitacao; def: DefinicaoAto | undefined }> {
    const lic = await this.carregar(licitacaoId);
    return { licitacao: lic, def: atoDeRetorno(lic) };
  }

  /**
   * Registra a CRIAÇÃO da licitação no histórico (fase inicial). Para quem
   * cria licitação: licitacoes.create/criarAPartirDeDemanda e, na sequência
   * da E1, a importação da fase-interna (que hoje nasce em APROVACAO_INTERNA).
   */
  async registrarCriacao(
    lic: Pick<Licitacao, 'id' | 'fase' | 'situacao'>,
    ator: AtorTransicao,
    manager?: EntityManager,
    registro?: Record<string, any>,
  ): Promise<void> {
    const repo = (manager ?? this.dataSource.manager).getRepository(LicitacaoTransicao);
    await repo.save(
      repo.create({
        licitacao_id: lic.id,
        fase_de: null,
        fase_para: lic.fase,
        situacao_de: null,
        situacao_para: lic.situacao ?? SituacaoLicitacao.ATIVA,
        ato: REGISTRO_CRIACAO,
        motivo: null,
        ator_tipo: ator.tipo,
        ator_id: ator.id,
        dados: registro ?? null,
      }),
    );
  }

  /**
   * ROLL-UP dos itens: se todos os itens estão desertos → DECLARAR_DESERTA;
   * se nenhum tem vencedor e há fracassado → DECLARAR_FRACASSADA. Só age com a
   * licitação ATIVA numa fase em que o ato é permitido; senão, não faz nada.
   * Devolve o ato praticado (ou null).
   */
  async aplicarRollup(licitacaoId: string, ator: AtorTransicao): Promise<AtoLicitacao | null> {
    const itens: Array<{ status: string; fornecedor_vencedor_id: string | null }> = await this.dataSource.query(
      `SELECT status::text AS status, fornecedor_vencedor_id FROM itens_licitacao WHERE licitacao_id = $1`,
      [licitacaoId],
    );
    const alvo = avaliarRollupItens(itens);
    if (!alvo) return null;
    const ato = alvo === SituacaoLicitacao.DESERTA ? AtoLicitacao.DECLARAR_DESERTA : AtoLicitacao.DECLARAR_FRACASSADA;

    const lic = await this.carregar(licitacaoId);
    const def = definicaoDoAto(lic.modalidade, ato);
    if (!def || conflitoDeEstado(def, lic, ato)) return null;
    const motivo =
      alvo === SituacaoLicitacao.DESERTA
        ? 'Roll-up automático: todos os itens foram declarados desertos.'
        : 'Roll-up automático: nenhum item com vencedor (itens fracassados/desertos).';
    try {
      await this.executar(licitacaoId, ato, { ator, motivo, registro: { rollup: true, itens: itens.length } });
      return ato;
    } catch (e: any) {
      // Corrida/pendência: o roll-up é uma conveniência, nunca derruba o ato do item
      this.logger.warn(`Roll-up ${ato} não aplicado na licitação ${licitacaoId}: ${e?.message ?? e}`);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Consultas
  // ---------------------------------------------------------------------------

  /** Atos que a tela pode oferecer agora, com as pendências de cada um. */
  async atosDisponiveis(licitacaoOuId: string | Licitacao): Promise<AtoDisponivel[]> {
    const lic = typeof licitacaoOuId === 'string' ? await this.carregar(licitacaoOuId) : licitacaoOuId;
    return avaliarAtosDisponiveis(lic, (def) => this.contexto(lic, def, this.dataSource.manager, {}));
  }

  /** Histórico de transições (mais antigo primeiro). */
  async historico(licitacaoId: string): Promise<LicitacaoTransicao[]> {
    return this.dataSource.getRepository(LicitacaoTransicao).find({
      where: { licitacao_id: licitacaoId },
      order: { created_at: 'ASC' },
    });
  }

  /**
   * Julgamento (plano E3): unidades de disputa — itens, ou lotes quando a
   * licitação disputa por lote — que tiveram lances, têm resultado possível
   * (não DESERTO/FRACASSADO/CANCELADO) e ainda NÃO têm licitante com proposta
   * aceita (ACEITO/HABILITADO/VENCEDOR em `licitantes_unidade`). Rótulos
   * "Item N"/"Lote N". Usado pela pré-condição do INICIAR_HABILITACAO.
   */
  async unidadesSemPropostaAceita(licitacaoId: string, manager?: EntityManager): Promise<string[]> {
    const rows: any[] = await (manager ?? this.dataSource.manager).query(
      `WITH lic AS (SELECT COALESCE(base_lance, 'TOTAL_ITEM') AS base FROM licitacoes WHERE id = $1),
       unidades AS (
         SELECT i.id::text AS unidade_id, 'Item ' || i.numero_item AS rotulo, i.numero_item AS ordem
           FROM itens_licitacao i, lic
          WHERE i.licitacao_id = $1 AND lic.base <> 'TOTAL_LOTE'
            AND i.status::text NOT IN ('DESERTO','FRACASSADO','CANCELADO')
            AND EXISTS (SELECT 1 FROM lances l WHERE l.item_id = i.id AND l.cancelado = false AND l.fornecedor_id IS NOT NULL)
         UNION ALL
         SELECT lt.id::text, 'Lote ' || lt.numero, lt.numero
           FROM lotes_licitacao lt, lic
          WHERE lt.licitacao_id = $1 AND lic.base = 'TOTAL_LOTE'
            AND EXISTS (SELECT 1 FROM itens_licitacao i WHERE i.lote_id = lt.id AND i.status::text NOT IN ('DESERTO','FRACASSADO','CANCELADO'))
            AND EXISTS (SELECT 1 FROM lances l WHERE l.lote_id = lt.id AND l.item_id IS NULL AND l.cancelado = false AND l.fornecedor_id IS NOT NULL)
       )
       SELECT u.rotulo FROM unidades u
        WHERE NOT EXISTS (
          SELECT 1 FROM licitantes_unidade lu
           WHERE lu.unidade_id::text = u.unidade_id AND lu.situacao IN ('ACEITO','HABILITADO','VENCEDOR'))
        ORDER BY u.ordem`,
      [licitacaoId],
    );
    return rows.map((r) => String(r.rotulo));
  }

  // ---------------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------------

  private async carregar(licitacaoId: string): Promise<Licitacao> {
    const lic = await this.dataSource.getRepository(Licitacao).findOne({ where: { id: licitacaoId } });
    if (!lic) throw new NotFoundException(`Licitação com ID ${licitacaoId} não encontrada`);
    return lic;
  }

  private contexto(
    lic: Licitacao,
    def: DefinicaoAto,
    manager: EntityManager,
    opcoes: Pick<OpcoesExecucao, 'motivo' | 'dados'>,
  ): ContextoTransicao {
    return {
      licitacao: lic,
      ato: def.ato,
      motivo: opcoes.motivo,
      dados: opcoes.dados,
      agora: new Date(),
      consultas: this.consultas(lic.id, manager),
    };
  }

  private consultas(licitacaoId: string, manager: EntityManager): ConsultasTransicao {
    const contar = async (sql: string): Promise<number> => {
      const r = await manager.query(sql, [licitacaoId]);
      return Number(r?.[0]?.total ?? 0);
    };
    return {
      propostasRecebidas: () =>
        contar(
          `SELECT COUNT(*) AS total FROM propostas
           WHERE licitacao_id = $1 AND status::text NOT IN ('RASCUNHO','DESCLASSIFICADA','CANCELADA')`,
        ),
      propostasAptasDisputa: () =>
        contar(
          `SELECT COUNT(*) AS total FROM propostas
           WHERE licitacao_id = $1 AND status::text IN ('ENVIADA','RECEBIDA','EM_ANALISE','CLASSIFICADA')`,
        ),
      contratosAssinados: () =>
        contar(
          `SELECT COUNT(*) AS total FROM contratos
           WHERE licitacao_id = $1 AND data_assinatura IS NOT NULL AND status::text <> 'CANCELADO'`,
        ),
      contratosOuAtasGerados: () =>
        contar(
          `SELECT (SELECT COUNT(*) FROM contratos WHERE licitacao_id = $1 AND status::text <> 'CANCELADO')
                + (SELECT COUNT(*) FROM atas_registro_preco WHERE licitacao_id = $1) AS total`,
        ),
      itens: () =>
        manager.query(
          `SELECT status::text AS status, fornecedor_vencedor_id FROM itens_licitacao WHERE licitacao_id = $1`,
          [licitacaoId],
        ),
      unidadesSemPropostaAceita: () => this.unidadesSemPropostaAceita(licitacaoId, manager),
      conferenciaArt48: () => conferenciaArt48Sql(manager, licitacaoId),
      habilitacaoPreviaPendente: () => habilitacaoPreviaPendenteSql(manager, licitacaoId),
      unidadesSemHabilitado: () => unidadesSemHabilitadoSql(manager, licitacaoId),
      estadoRecursal: () => estadoRecursalSql(manager, licitacaoId),
      instrucaoProcesso: async (etapa) => {
        // Resolução tardia: evita ciclo de módulos (a fase-interna depende
        // deste serviço para as próprias transições).
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { FaseInternaService } = require('../../fase-interna/fase-interna.service');
        let servico: any;
        try {
          servico = this.moduleRef.get(FaseInternaService, { strict: false });
        } catch {
          return null;
        }
        const instrucao = await servico.getInstrucao(licitacaoId, etapa);
        return { pode_divulgar: !!instrucao.pode_divulgar, pendentes: instrucao.pendentes ?? [] };
      },
    };
  }

  private dadosDoRegistro(opcoes: OpcoesExecucao): Record<string, any> | null {
    const dados: Record<string, any> = {};
    if (opcoes.dados && Object.keys(opcoes.dados).length) dados.dados = opcoes.dados;
    if (opcoes.registro) Object.assign(dados, opcoes.registro);
    return Object.keys(dados).length ? dados : null;
  }
}
