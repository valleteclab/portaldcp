/**
 * ============================================================================
 * MIGRAÇÃO DE DADOS — dispensa eletrônica para o motor único (plano E2 item 7)
 * ============================================================================
 *
 * `dispensa_lances`   → `lances`         (origem JANELA_DISPENSA, base UNITARIO,
 *                                          valor_unitario com 4 casas, valor_total
 *                                          = unitário × quantidade, fornecedor_id)
 * `dispensa_mensagens`→ `eventos_sessao` (chat único: MENSAGEM_FORNECEDOR /
 *                                          MENSAGEM_PREGOEIRO / MENSAGEM_SISTEMA)
 *
 * Roda no boot (MigracaoDispensaBootService — produção com synchronize, sem
 * migrationsRun) e na migration 20260926000001-DispensaMotorUnico. IDEMPOTENTE:
 * as linhas novas recebem o MESMO id (uuid) da linha legada — `NOT EXISTS`
 * pelo id garante que nada é copiado duas vezes. As tabelas legadas NÃO são
 * apagadas nem alteradas (o sistema só deixa de escrevê-las).
 *
 * Passos:
 *  1. Dispensas passam a disputar pelo valor UNITÁRIO (`licitacoes.base_lance`).
 *  2. Sala (`sessoes_disputa`) para cada dispensa com lances, mensagens ou
 *     janela e ainda sem sessão — status conforme a janela (aberta →
 *     MODO_ABERTO/DISPUTA_LANCES; encerrada → EM_ANDAMENTO/NEGOCIACAO;
 *     nunca aberta → AGUARDANDO_INICIO/ABERTURA_SESSAO).
 *  3. Lances (só os de item e licitação existentes; o resto é relatado como
 *     órfão — não é apagado nem inventado).
 *  4. Mensagens (na sala da licitação). Autoria preservada: nome registrado,
 *     fornecedor_id, data/hora. "Sistema" do órgão → MENSAGEM_SISTEMA.
 *  5. Itens das dispensas com janela: EM_DISPUTA (janela aberta) ou ENCERRADO.
 *  6. Conferência: totais legados × presentes no armazenamento novo.
 *
 * A ata da dispensa lê o armazenamento novo e produz o MESMO conteúdo para os
 * dados migrados (e2e `dispensa-motor-unico`).
 */
import type { ExecutorSql } from './migracao-lances';

export interface RelatorioMigracaoDispensa {
  dispensasUnitario: number;
  sessoesCriadas: number;
  lancesMigrados: number;
  mensagensMigradas: number;
  itensAtualizados: number;
  /** Conferência (depois da execução). */
  lancesLegados: number;
  lancesNoMotor: number;
  lancesOrfaos: number;
  mensagensLegadas: number;
  mensagensNoChat: number;
  mensagensOrfas: number;
}

function afetadas(r: any): number {
  if (Array.isArray(r) && typeof r[1] === 'number') return r[1];
  if (r && typeof r.affected === 'number') return r.affected;
  if (r && typeof r.rowCount === 'number') return r.rowCount;
  // INSERT ... RETURNING: o TypeORM devolve só as linhas
  if (Array.isArray(r)) return r.length;
  return 0;
}

async function existeTabela(db: ExecutorSql, tabela: string): Promise<boolean> {
  const [r] = await db.query(`SELECT to_regclass($1) AS t`, [tabela]);
  return !!r?.t;
}

/** Tipo SQL da coluna (enum gerado pelo TypeORM ou varchar) — para o CAST do INSERT. */
async function tipoDaColuna(db: ExecutorSql, tabela: string, coluna: string): Promise<string> {
  const [r] = await db.query(
    `SELECT format_type(a.atttypid, a.atttypmod) AS tipo
       FROM pg_attribute a WHERE a.attrelid = $1::regclass AND a.attname = $2 AND NOT a.attisdropped`,
    [tabela, coluna],
  );
  if (!r?.tipo) throw new Error(`Coluna ${tabela}.${coluna} não encontrada`);
  return String(r.tipo);
}

const conta = async (db: ExecutorSql, sql: string, params: any[] = []) => Number((await db.query(sql, params))[0]?.n ?? 0);

export async function migrarDispensaParaMotor(db: ExecutorSql): Promise<RelatorioMigracaoDispensa> {
  const rel: RelatorioMigracaoDispensa = {
    dispensasUnitario: 0,
    sessoesCriadas: 0,
    lancesMigrados: 0,
    mensagensMigradas: 0,
    itensAtualizados: 0,
    lancesLegados: 0,
    lancesNoMotor: 0,
    lancesOrfaos: 0,
    mensagensLegadas: 0,
    mensagensNoChat: 0,
    mensagensOrfas: 0,
  };
  const temLances = await existeTabela(db, 'dispensa_lances');
  const temMensagens = await existeTabela(db, 'dispensa_mensagens');

  // 1. base do lance da dispensa
  rel.dispensasUnitario = afetadas(
    await db.query(
      `UPDATE licitacoes SET base_lance = 'UNITARIO'
        WHERE modalidade::text = 'DISPENSA_ELETRONICA' AND base_lance IS DISTINCT FROM 'UNITARIO'`,
    ),
  );

  // 2. sala da dispensa
  const tStatus = await tipoDaColuna(db, 'sessoes_disputa', 'status');
  const tEtapa = await tipoDaColuna(db, 'sessoes_disputa', 'etapa');
  const comLegado = [
    temLances ? `EXISTS (SELECT 1 FROM dispensa_lances dl WHERE dl.licitacao_id::text = l.id::text)` : 'false',
    temMensagens ? `EXISTS (SELECT 1 FROM dispensa_mensagens dm WHERE dm.licitacao_id::text = l.id::text)` : 'false',
    'l.dispensa_lances_fim IS NOT NULL',
  ].join(' OR ');
  rel.sessoesCriadas = afetadas(
    await db.query(
      `INSERT INTO sessoes_disputa (id, licitacao_id, status, etapa, disputa_por_item, modo_aberto, pregoeiro_nome, observacoes,
                                    data_hora_inicio_real, data_hora_encerramento)
       SELECT gen_random_uuid(), l.id,
              (CASE WHEN l.dispensa_lances_fim IS NULL THEN 'AGUARDANDO_INICIO'
                    WHEN l.dispensa_lances_fim > now() THEN 'MODO_ABERTO' ELSE 'EM_ANDAMENTO' END)::${tStatus},
              (CASE WHEN l.dispensa_lances_fim IS NULL THEN 'ABERTURA_SESSAO'
                    WHEN l.dispensa_lances_fim > now() THEN 'DISPUTA_LANCES' ELSE 'NEGOCIACAO' END)::${tEtapa},
              true, true, 'Agente de contratação',
              'Sala da dispensa eletrônica (janela de lances — IN SEGES 67/2021) — criada pela migração E2',
              l.dispensa_lances_inicio,
              CASE WHEN l.dispensa_lances_fim <= now() THEN l.dispensa_lances_fim END
         FROM licitacoes l
        WHERE l.modalidade::text = 'DISPENSA_ELETRONICA'
          AND (${comLegado})
          AND NOT EXISTS (SELECT 1 FROM sessoes_disputa s WHERE s.licitacao_id::text = l.id::text)
       RETURNING 1`,
    ),
  );

  // 3. lances
  if (temLances) {
    rel.lancesMigrados = afetadas(
      await db.query(
        `INSERT INTO lances (id, licitacao_id, item_id, fornecedor_id, fornecedor_nome, valor, valor_unitario, valor_total,
                             base_lance, origem, ip_origem, cancelado, solicitacao_cancelamento_pendente, created_at)
         SELECT dl.id, lic.id, i.id, dl.fornecedor_id::text, f.razao_social,
                ROUND(dl.valor_unitario, 2), dl.valor_unitario,
                ROUND(dl.valor_unitario * COALESCE(NULLIF(i.quantidade, 0), 1), 2),
                'UNITARIO', 'JANELA_DISPENSA', 'MIGRACAO_DISPENSA', false, false, dl.created_at
           FROM dispensa_lances dl
           JOIN licitacoes lic ON lic.id::text = dl.licitacao_id::text
           JOIN itens_licitacao i ON i.id::text = dl.item_licitacao_id::text AND i.licitacao_id::text = lic.id::text
           LEFT JOIN fornecedores f ON f.id::text = dl.fornecedor_id::text
          WHERE NOT EXISTS (SELECT 1 FROM lances l WHERE l.id::text = dl.id::text)
         RETURNING 1`,
      ),
    );
  }

  // 4. mensagens → chat único (eventos da sala)
  if (temMensagens) {
    const tTipo = await tipoDaColuna(db, 'eventos_sessao', 'tipo');
    rel.mensagensMigradas = afetadas(
      await db.query(
        `INSERT INTO eventos_sessao (id, sessao_id, tipo, descricao, fornecedor_id, usuario_nome, is_sistema, dados_adicionais, created_at)
         SELECT dm.id, s.id,
                (CASE WHEN dm.autor_tipo = 'FORNECEDOR' THEN 'MENSAGEM_FORNECEDOR'
                      WHEN dm.fornecedor_id IS NULL AND dm.autor_nome = 'Sistema' THEN 'MENSAGEM_SISTEMA'
                      ELSE 'MENSAGEM_PREGOEIRO' END)::${tTipo},
                dm.mensagem,
                CASE WHEN dm.autor_tipo = 'FORNECEDOR' THEN dm.fornecedor_id::text END,
                dm.autor_nome,
                (dm.fornecedor_id IS NULL AND dm.autor_nome = 'Sistema'),
                jsonb_build_object('origem', 'MIGRACAO_DISPENSA', 'autor_tipo', dm.autor_tipo),
                dm.created_at
           FROM dispensa_mensagens dm
           JOIN LATERAL (
             SELECT s.id FROM sessoes_disputa s WHERE s.licitacao_id::text = dm.licitacao_id::text
              ORDER BY s.created_at DESC LIMIT 1
           ) s ON true
          WHERE NOT EXISTS (SELECT 1 FROM eventos_sessao e WHERE e.id::text = dm.id::text)
         RETURNING 1`,
      ),
    );
  }

  // 5. itens das dispensas com janela (projeção do relógio)
  rel.itensAtualizados = afetadas(
    await db.query(
      `UPDATE itens_licitacao i
          SET status_disputa = (CASE WHEN l.dispensa_lances_fim > now() THEN 'EM_DISPUTA' ELSE 'ENCERRADO' END)::${await tipoDaColuna(db, 'itens_licitacao', 'status_disputa')},
              disputa_iniciada_em = COALESCE(i.disputa_iniciada_em, l.dispensa_lances_inicio),
              disputa_encerrada_em = CASE WHEN l.dispensa_lances_fim <= now() THEN COALESCE(i.disputa_encerrada_em, l.dispensa_lances_fim) END
         FROM licitacoes l
        WHERE i.licitacao_id::text = l.id::text AND l.modalidade::text = 'DISPENSA_ELETRONICA'
          AND l.dispensa_lances_fim IS NOT NULL
          AND (i.status_disputa IS NULL OR i.status_disputa::text = 'AGUARDANDO'
               OR (i.status_disputa::text = 'EM_DISPUTA' AND l.dispensa_lances_fim <= now()))`,
    ),
  );

  // 6. conferência
  if (temLances) {
    rel.lancesLegados = await conta(db, `SELECT COUNT(*)::int AS n FROM dispensa_lances`);
    rel.lancesNoMotor = await conta(
      db,
      `SELECT COUNT(*)::int AS n FROM dispensa_lances dl JOIN lances l ON l.id::text = dl.id::text AND l.origem = 'JANELA_DISPENSA'`,
    );
    rel.lancesOrfaos = rel.lancesLegados - rel.lancesNoMotor;
  }
  if (temMensagens) {
    rel.mensagensLegadas = await conta(db, `SELECT COUNT(*)::int AS n FROM dispensa_mensagens`);
    rel.mensagensNoChat = await conta(
      db,
      `SELECT COUNT(*)::int AS n FROM dispensa_mensagens dm JOIN eventos_sessao e ON e.id::text = dm.id::text`,
    );
    rel.mensagensOrfas = rel.mensagensLegadas - rel.mensagensNoChat;
  }
  return rel;
}

export function resumoMigracaoDispensa(r: RelatorioMigracaoDispensa): string {
  return (
    `dispensas→unitário ${r.dispensasUnitario}; salas criadas ${r.sessoesCriadas}; ` +
    `lances migrados ${r.lancesMigrados} (legados ${r.lancesLegados}, no motor ${r.lancesNoMotor}, órfãos ${r.lancesOrfaos}); ` +
    `mensagens migradas ${r.mensagensMigradas} (legadas ${r.mensagensLegadas}, no chat ${r.mensagensNoChat}, órfãs ${r.mensagensOrfas}); ` +
    `itens atualizados ${r.itensAtualizados}`
  );
}

export function houveMudancaDispensa(r: RelatorioMigracaoDispensa): boolean {
  return r.dispensasUnitario + r.sessoesCriadas + r.lancesMigrados + r.mensagensMigradas + r.itensAtualizados > 0;
}
