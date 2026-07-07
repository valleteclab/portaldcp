# Migrations do banco (TypeORM)

Hoje o schema é gerenciado por `synchronize: true` (o TypeORM cria/altera as tabelas
a partir das entidades no boot). Isso é prático em desenvolvimento, mas **arriscado em
produção**: uma alteração de entidade pode disparar `ALTER`/`DROP` automático durante
uma sessão de disputa. A meta da Fase 0 é migrar para migrations e desligar o
`synchronize` em produção.

## Infraestrutura já pronta

- `src/typeorm-cli.datasource.ts` — DataSource usado **apenas** pelo CLI (não pela app).
- Scripts em `package.json`:
  - `npm run migration:generate -- src/migrations/NomeDaMigration` — gera migration
    pelo diff entre as entidades e o banco conectado.
  - `npm run migration:create -- src/migrations/NomeDaMigration` — cria migration vazia.
  - `npm run migration:run` — aplica as migrations pendentes.
  - `npm run migration:revert` — desfaz a última.
  - `npm run migration:show` — lista o estado.
- Variáveis de ambiente (em `app.module.ts`):
  - `DB_SYNCHRONIZE` (default `true`): defina `false` para congelar o schema.
  - `DB_MIGRATIONS_RUN` (default `false`): defina `true` para rodar migrations no boot.

## Procedimento para congelar o schema em produção (baseline)

Faça isto **contra um dump/cópia do banco de produção**, não direto na produção.

1. **Garanta que o banco está em dia com as entidades** (com `synchronize: true` ainda
   ligado, suba a app uma vez apontando para o banco — ele fica idêntico às entidades).

2. **Gere a migration de baseline** apontando o `.env` para esse banco:
   ```bash
   npm run migration:generate -- src/migrations/Baseline
   ```
   Como o banco já está sincronizado com as entidades, o diff tende a vir **vazio ou
   mínimo**. Se vier vazio, crie uma baseline vazia só para marcar o ponto de partida:
   ```bash
   npm run migration:create -- src/migrations/Baseline
   ```

3. **Marque a baseline como aplicada** no banco que já tem as tabelas (para o TypeORM
   não tentar recriá-las). Rode `migration:run` uma vez — se a baseline for vazia, ela
   apenas registra a linha na tabela `migrations`. Se tiver conteúdo `CREATE TABLE`,
   ajuste para `CREATE TABLE IF NOT EXISTS` antes de rodar em bancos já existentes.

4. **Desligue o synchronize** em produção:
   ```
   DB_SYNCHRONIZE=false
   DB_MIGRATIONS_RUN=true
   ```
   A partir daí, toda mudança de schema vira uma migration versionada:
   ```bash
   npm run migration:generate -- src/migrations/DescricaoDaMudanca
   ```
   e é aplicada no deploy (via `DB_MIGRATIONS_RUN=true` no boot ou `migration:run` no CI).

## Enquanto o baseline não é gerado

`synchronize` continua `true` por padrão — nada muda no comportamento atual. As tabelas
novas da Fase 0 (`audit_logs`, `parametros_licitacao`, `limites_legais`) e as do
processo eletrônico são criadas pelo synchronize normalmente. O corte para migrations é
um passo de DevOps que exige conexão ao banco real e deve ser feito com cópia/backup.
