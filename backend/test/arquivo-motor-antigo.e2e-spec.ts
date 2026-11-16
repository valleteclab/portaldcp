/**
 * UM MOTOR SÓ (passo 3, 11/2026) — backup das tabelas aposentadas.
 *
 * As tabelas do construtor antigo e dos fluxos de aprovação das peças não são
 * apagadas: vão, com os dados, para o schema `backup_motor_antigo`, sem as
 * chaves estrangeiras (o backup não pode impedir nem sofrer a exclusão de um
 * processo ou órgão). Idempotente: na segunda rodada não faz nada.
 */
import { AppE2E, OrgaoFixture, criarApp, criarOrgao } from './support';
import { ArquivoMotorAntigoBootService, SCHEMA_BACKUP_MOTOR_ANTIGO } from '../src/fase-interna/arquivo-motor-antigo-boot.service';

describe('Arquivo do motor antigo (backup das tabelas aposentadas)', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Órgão do arquivo do motor antigo' });
  });

  afterAll(async () => {
    await sql(`DROP SCHEMA IF EXISTS ${SCHEMA_BACKUP_MOTOR_ANTIGO} CASCADE`);
    await ctx?.fechar();
  });

  test('move a tabela com os dados para o schema de backup, sem chave estrangeira; segunda rodada não faz nada', async () => {
    // Como estava em produção: a tabela no schema público, ligada ao órgão
    await sql(`CREATE TABLE public.fluxos_aprovacao_documento (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      orgao_id uuid NOT NULL REFERENCES orgaos(id),
      nome varchar NOT NULL)`);
    await sql(`INSERT INTO public.fluxos_aprovacao_documento (orgao_id, nome) VALUES ($1, 'Fluxo do TR'), ($1, 'Fluxo genérico')`, [A.id]);

    const servico = ctx.app.get(ArquivoMotorAntigoBootService);
    const r = await servico.executar();
    expect(r.movidas).toEqual(['fluxos_aprovacao_documento (2 linha(s))']);

    const [onde] = await sql(
      `SELECT to_regclass('public.fluxos_aprovacao_documento') AS publica, to_regclass('${SCHEMA_BACKUP_MOTOR_ANTIGO}.fluxos_aprovacao_documento') AS backup`,
    );
    expect(onde.publica).toBeNull();
    expect(onde.backup).not.toBeNull();
    const linhas = await sql(`SELECT nome FROM ${SCHEMA_BACKUP_MOTOR_ANTIGO}.fluxos_aprovacao_documento ORDER BY nome`);
    expect(linhas.map((l: any) => l.nome)).toEqual(['Fluxo do TR', 'Fluxo genérico']);
    const [{ n }] = await sql(
      `SELECT count(*)::int AS n FROM pg_constraint WHERE contype = 'f' AND conrelid = '${SCHEMA_BACKUP_MOTOR_ANTIGO}.fluxos_aprovacao_documento'::regclass`,
    );
    expect(n).toBe(0);

    // Idempotente
    expect((await servico.executar()).movidas).toEqual([]);
  });
});
