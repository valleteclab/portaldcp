import { MigrationInterface, QueryRunner } from 'typeorm';
import { migrarResultado } from '../resultado/migracao-resultado';

/**
 * E6 — RESULTADO ÚNICO (Lei 14.133/2021 arts. 71, 90–95):
 *  - `licitacoes.homologacao_autoridade_nome/_cargo` (autoridade do cadastro);
 *  - `contratos.data_assinatura` passa a aceitar NULL (contrato gerado pela
 *    homologação aguarda as assinaturas) e o enum do status ganha
 *    AGUARDANDO_ASSINATURA;
 *  - enum da demanda: EM_CONTRATACAO e CONTRATADA (status automático);
 *  - dados (`migrarResultado`): itens/vencedores coerentes nas licitações
 *    adjudicadas/homologadas pelos caminhos antigos (sem gerar contrato).
 *
 * IDEMPOTENTE. Sem transação (ALTER TYPE ... ADD VALUE). Produção com
 * synchronize ligado: o synchronize cria colunas/enum e o boot
 * (MigracaoResultadoBootService) migra os dados — esta migration existe para
 * quando o synchronize for desligado (E9).
 */
export class ResultadoUnico20261005000007 implements MigrationInterface {
  name = 'ResultadoUnico20261005000007';
  transaction = false as const;

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE contratos_status_enum ADD VALUE IF NOT EXISTS 'AGUARDANDO_ASSINATURA'`);
    await q.query(`ALTER TYPE demandas_status_enum ADD VALUE IF NOT EXISTS 'EM_CONTRATACAO'`);
    await q.query(`ALTER TYPE demandas_status_enum ADD VALUE IF NOT EXISTS 'CONTRATADA'`);
    await q.query(`ALTER TABLE contratos ALTER COLUMN data_assinatura DROP NOT NULL`);
    await q.query(`ALTER TABLE licitacoes ADD COLUMN IF NOT EXISTS homologacao_autoridade_nome varchar(200)`);
    await q.query(`ALTER TABLE licitacoes ADD COLUMN IF NOT EXISTS homologacao_autoridade_cargo varchar(200)`);
    await migrarResultado(q);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Valores de enum e dados migrados permanecem (sem perda); só as colunas novas saem.
    await q.query(`ALTER TABLE licitacoes DROP COLUMN IF EXISTS homologacao_autoridade_cargo`);
    await q.query(`ALTER TABLE licitacoes DROP COLUMN IF EXISTS homologacao_autoridade_nome`);
  }
}
