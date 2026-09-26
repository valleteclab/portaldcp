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
  AcaoDoMenu,
  avaliarAcoesDoMenu,
  avaliarAtosDisponiveis,
  conflitoDeEstado,
  jaAplicado,
  pendenciasDoAto,
  situacaoDe,
} from './maquina';
import { avaliarRollupItens } from './rollup';
import { ConferenciaPrePublicacao, conferirPrePublicacao, InstrucaoParaConferencia } from './pre-publicacao';
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
import {
  editalVigenteSql,
  impugnacoesSemRetificacaoSql,
  intencaoExtincaoAbertaSql,
  interessadosDaLicitacaoSql,
  propostasAguardandoConfirmacaoSql,
} from '../../publicacao/publicacao.sql';
import { estadoEditalCredenciamentoSql } from '../../credenciamento/credenciamento.sql';
import { avisoContratacaoVigenteSql } from '../../publicacao/aviso-contratacao';
import { PROVIDENCIAS_ART22_IN67 } from './definicoes';
import { ROTULO_FASE, ROTULO_SITUACAO } from './fases';
import { REGISTRO_MIGRACAO_DIVULGACAO, REGISTRO_MIGRACAO_SITUACAO } from './transicoes.tipos';

/** Registros que não são atos executáveis. */
const ROTULO_REGISTRO: Record<string, string> = {
  [REGISTRO_CRIACAO]: 'Criação do processo',
  [REGISTRO_MIGRACAO_SITUACAO]: 'Ajuste de dados (situação do processo)',
  [REGISTRO_MIGRACAO_DIVULGACAO]: 'Ajuste de dados (divulgação no PNCP)',
  ABRIR_IMPUGNACAO: 'Abertura do prazo de impugnação (legado)',
};

function rotuloDoAto(modalidade: string | undefined, ato: string): string {
  if (ROTULO_REGISTRO[ato]) return ROTULO_REGISTRO[ato];
  return definicaoDoAto(modalidade, ato as AtoLicitacao)?.rotulo ?? ato.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

/** Origens do SISTEMA com nome para a tela. */
const ORIGEM_SISTEMA: Record<string, string> = {
  scheduler: 'Sistema (relógio)',
  'disputa-timer': 'Sistema (relógio)',
  pncp: 'Sistema (PNCP)',
  'pncp-fila': 'Sistema (PNCP)',
  migracao: 'Sistema (ajuste de dados)',
  importacao: 'Sistema (importação)',
};

function nomeDoAtor(tipo: string, id: string | null, nomes: Map<string, string>): string {
  if (tipo === 'SISTEMA') return ORIGEM_SISTEMA[String(id)] ?? 'Sistema';
  if (tipo === 'ADMIN') return 'Administrador da plataforma';
  const nome = id ? nomes.get(`${tipo}:${id}`) : undefined;
  if (nome) return nome;
  return tipo === 'FORNECEDOR' ? 'Fornecedor' : tipo === 'ORGAO' ? 'Órgão' : 'Usuário do órgão';
}
import { pendenciasModalidadeSql } from '../../modalidades-especiais/pendencias.sql';

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

  async executar(licitacaoId: string, ato: AtoLicitacao, opcoesRecebidas: OpcoesExecucao): Promise<Licitacao> {
    // `dados` sempre existe: efeitos podem anotar o que fizeram (ex.: cronograma
    // reajustado na confirmação da divulgação, manifestação prévia do art. 71
    // §3º) e isso vai para o histórico (`licitacao_transicoes.dados`).
    const opcoes: OpcoesExecucao = { ...opcoesRecebidas, dados: opcoesRecebidas.dados ?? {} };
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
      for (const efeito of def!.efeitosPersistidos ?? []) await efeito(lic, manager, ctx);
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
      await this.executar(licitacaoId, ato, { ator, motivo, dados: { rollup: true }, registro: { rollup: true, itens: itens.length } });
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

  /**
   * Menu "Mais ações" da tela do processo (Etapa B): suspender, retificar,
   * cancelar a publicação, revogar/anular, deserta/fracassada... — cada um
   * com a disponibilidade e o motivo decididos pela máquina.
   */
  async acoesDoMenu(licitacaoOuId: string | Licitacao): Promise<AcaoDoMenu[]> {
    const lic = typeof licitacaoOuId === 'string' ? await this.carregar(licitacaoOuId) : licitacaoOuId;
    return avaliarAcoesDoMenu(lic, (def) => this.contexto(lic, def, this.dataSource.manager, {}));
  }

  /**
   * Checklist de pré-publicação (Etapa B): as pré-condições do PUBLICAR, uma
   * linha por exigência, com o que falta e a ação que resolve. Somente leitura.
   */
  async conferenciaPrePublicacao(licitacaoId: string): Promise<ConferenciaPrePublicacao> {
    const lic = await this.carregar(licitacaoId);
    const publicar = definicaoDoAto(lic.modalidade, AtoLicitacao.PUBLICAR);
    const ctx = this.contexto(lic, publicar ?? ({ ato: AtoLicitacao.PUBLICAR } as DefinicaoAto), this.dataSource.manager, {});
    const pendenciasPublicar = publicar ? await pendenciasDoAto(publicar, { ...ctx, somenteAvaliacao: true }) : [];
    let instrucao: InstrucaoParaConferencia | null = null;
    try {
      // Resolução tardia (mesmo motivo de `consultas.instrucaoProcesso`: evita ciclo de módulos)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { FaseInternaService } = require('../../fase-interna/fase-interna.service');
      const servico: any = this.moduleRef.get(FaseInternaService, { strict: false });
      instrucao = await servico.getInstrucao(licitacaoId);
    } catch {
      instrucao = null;
    }
    const [pca] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM itens_licitacao WHERE licitacao_id::text = $1 AND item_pca_id IS NOT NULL AND status::text <> 'CANCELADO'`,
      [licitacaoId],
    );
    return conferirPrePublicacao({ ctx, instrucao, itensComPca: Number(pca?.total ?? 0), pendenciasPublicar });
  }

  /** Histórico de transições (mais antigo primeiro). */
  async historico(licitacaoId: string): Promise<LicitacaoTransicao[]> {
    return this.dataSource.getRepository(LicitacaoTransicao).find({
      where: { licitacao_id: licitacaoId },
      order: { created_at: 'ASC' },
    });
  }

  /**
   * HISTÓRICO LEGÍVEL (cockpit): cada transição com o rótulo do ato e das
   * fases/situações (nada de código de enum na tela), o NOME de quem praticou
   * (usuário, órgão, fornecedor; "Sistema (PNCP)", "Sistema (relógio)"...) e
   * um resumo do que o ato registrou (cronograma estendido, manifestação
   * prévia, providência do art. 22 da IN 67). Campos originais preservados.
   */
  async historicoLegivel(licitacaoId: string): Promise<Array<Record<string, any>>> {
    const [lic] = await this.dataSource.query(`SELECT modalidade::text AS modalidade FROM licitacoes WHERE id::text = $1`, [licitacaoId]);
    const linhas = await this.historico(licitacaoId);
    const ids = (tipo: string) => [...new Set(linhas.filter((l) => l.ator_tipo === tipo && l.ator_id).map((l) => String(l.ator_id)))];
    const nomes = new Map<string, string>();
    const carregar = async (tipo: string, sql: string) => {
      const lista = ids(tipo).filter((i) => /^[0-9a-f-]{36}$/i.test(i));
      if (!lista.length) return;
      const rows: Array<{ id: string; nome: string }> = await this.dataSource.query(sql, [lista]);
      for (const r of rows) nomes.set(`${tipo}:${r.id}`, r.nome);
    };
    await carregar('USUARIO', `SELECT id::text AS id, nome FROM usuarios WHERE id::text = ANY($1::text[])`);
    await carregar('ORGAO', `SELECT id::text AS id, nome FROM orgaos WHERE id::text = ANY($1::text[])`);
    await carregar('FORNECEDOR', `SELECT id::text AS id, razao_social AS nome FROM fornecedores WHERE id::text = ANY($1::text[])`);
    return linhas.map((l) => {
      const dados = (l.dados ?? {}) as Record<string, any>;
      const d = (dados.dados ?? {}) as Record<string, any>;
      const resumo: string[] = [];
      if (d.ajuste_descricao) resumo.push(String(d.ajuste_descricao));
      if (d.manifestacao_previa) resumo.push(String(d.manifestacao_previa));
      if (d.providencia_art22) resumo.push(`Providência (IN SEGES 67/2021, art. 22): ${PROVIDENCIAS_ART22_IN67[d.providencia_art22] ?? d.providencia_art22}`);
      if (d.meio === 'DIARIO_OFICIAL' && d.referencia) resumo.push(`Publicação no diário oficial: ${d.referencia}`);
      else if (l.ato === AtoLicitacao.CONFIRMAR_DIVULGACAO && d.referencia) resumo.push(`Número de controle PNCP: ${d.referencia}`);
      if (dados.rollup) resumo.push('Roll-up automático dos itens');
      return {
        ...l,
        rotulo_ato: rotuloDoAto(lic?.modalidade, l.ato),
        rotulo_fase_de: l.fase_de ? ROTULO_FASE[l.fase_de] ?? l.fase_de : null,
        rotulo_fase_para: ROTULO_FASE[l.fase_para] ?? l.fase_para,
        rotulo_situacao_de: l.situacao_de ? ROTULO_SITUACAO[l.situacao_de as SituacaoLicitacao] ?? l.situacao_de : null,
        rotulo_situacao_para: ROTULO_SITUACAO[l.situacao_para as SituacaoLicitacao] ?? l.situacao_para,
        ator_nome: nomeDoAtor(l.ator_tipo, l.ator_id, nomes),
        resumo: resumo.length ? resumo.join(' · ') : null,
      };
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
      propostasEnviadas: () =>
        contar(
          `SELECT COUNT(*) AS total FROM propostas
           WHERE licitacao_id = $1 AND status::text NOT IN ('RASCUNHO','CANCELADA')`,
        ),
      avisoContratacaoVigente: () => avisoContratacaoVigenteSql(manager, licitacaoId),
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
      itensParaPublicacao: () =>
        manager.query(
          `SELECT status::text AS status, quantidade, valor_unitario_estimado FROM itens_licitacao WHERE licitacao_id = $1`,
          [licitacaoId],
        ),
      unidadesSemPropostaAceita: () => this.unidadesSemPropostaAceita(licitacaoId, manager),
      conferenciaArt48: () => conferenciaArt48Sql(manager, licitacaoId),
      habilitacaoPreviaPendente: () => habilitacaoPreviaPendenteSql(manager, licitacaoId),
      unidadesSemHabilitado: () => unidadesSemHabilitadoSql(manager, licitacaoId),
      estadoRecursal: () => estadoRecursalSql(manager, licitacaoId),
      // Publicação (E7a)
      editalVigente: () => editalVigenteSql(manager, licitacaoId),
      impugnacoesSemRetificacao: () => impugnacoesSemRetificacaoSql(manager, licitacaoId),
      propostasAguardandoConfirmacao: () => propostasAguardandoConfirmacaoSql(manager, licitacaoId),
      intencaoExtincaoAberta: () => intencaoExtincaoAbertaSql(manager, licitacaoId),
      interessadosExtincao: async () => (await interessadosDaLicitacaoSql(manager, licitacaoId)).length,
      // Credenciamento (E7b)
      credenciamento: () => estadoEditalCredenciamentoSql(manager, licitacaoId),
      // Leilão, concurso e diálogo competitivo (E7c)
      pendenciasModalidade: (chave, contexto) => pendenciasModalidadeSql(manager, licitacaoId, chave, contexto ?? {}),
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
