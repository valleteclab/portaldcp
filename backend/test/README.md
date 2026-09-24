# Testes e2e do backend

Os e2e sobem o **AppModule inteiro** contra um **Postgres descartável** (pacote npm
`embedded-postgres`, Postgres 15) criado na hora, numa porta livre, em diretório
temporário. Não precisa de Docker nem de banco instalado.

## Como rodar

```bash
cd backend
npm ci
npm run test:e2e                          # todos (--runInBand)
npm run test:e2e -- test/infra.e2e-spec.ts   # um arquivo
E2E_VERBOSE=1 npm run test:e2e            # com log completo do Nest/console.log
E2E_PG_LOG=1 npm run test:e2e             # com log do Postgres
```

A primeira execução é lenta (ts-jest compila o backend inteiro; no Windows o
`initdb` também demora). As seguintes usam o cache.

No CI: `.github/workflows/backend-tests.yml` (unitários + e2e em PR e push fora da `main`).

## Estrutura (`test/support/`)

| Arquivo | Papel |
|---|---|
| `global-setup.mjs` / `global-teardown.mjs` | sobe/derruba o Postgres descartável |
| `env.ts` | (setupFiles) aponta DB_* para o banco descartável, apaga credenciais do shell, define valores de teste |
| `setup-after-env.ts` | liga o mock do PNCP/bloqueio de rede, silencia `console.log`, fecha app esquecido |
| `app.ts` | `criarApp()` — mesmo bootstrap do `src/main.ts` (prefixo `api`, sem ValidationPipe global), escutando em porta aleatória |
| `fixtures.ts` | fábricas: órgão, usuário do órgão, fornecedor, licitação, fases, proposta |
| `pncp-mock.ts` | `pncpMock`: captura o que seria enviado ao PNCP |
| `socket.ts` | cliente socket.io para os namespaces (`/disputa-v2`, `/sessao`, `/dispensa`...) |

Motor de lances (E2): `test/motor-lances.e2e-spec.ts` (diferença mínima, lances iguais, intervalo, reinício sem DELETE, chat único, sigilo do item encerrado). O namespace padrão `/` não tem mais gateway.

## Escrevendo um teste

```ts
import {
  AppE2E, criarApp, criarOrgao, criarFornecedor, criarLicitacao,
  levarAteFase, enviarProposta, abrirSessaoAgora, pncpMock,
} from './support';
import { ModalidadeLicitacao, FaseLicitacao } from '../src/licitacoes/entities/licitacao.entity';

describe('Pregão — ...', () => {
  let ctx: AppE2E;
  beforeAll(async () => { ctx = await criarApp(); });
  afterAll(async () => { await ctx.fechar(); });

  it('...', async () => {
    const orgao = await criarOrgao(ctx);                       // token ORGAO em orgao.token
    const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
    await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);

    const me = await criarFornecedor(ctx, { porte: 'ME' });    // 'ME' | 'EPP' | 'MEI' | 'DEMAIS'
    const grande = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    await enviarProposta(ctx, me, lic, [95, 45]);              // valor unitário por item
    await enviarProposta(ctx, grande, lic, [90, 44]);

    await abrirSessaoAgora(ctx, lic);                          // encerra acolhimento / abre sessão
    await ctx.http().put(`/api/licitacoes/${lic.id}/avancar-fase`)
      .set('Authorization', `Bearer ${orgao.token}`).expect(200);
  });
});
```

- **Dois órgãos** para testar isolamento: `criarOrgao(ctx)` duas vezes.
- **Usuário do órgão** (pregoeiro etc.): `criarUsuarioOrgao(ctx, orgao, { role })` — token vem do login real.
- **Contratação direta**: `levarAteFase` cria a instrução do art. 72 (DFD, estimativa, autorização) antes de publicar.
- **Fases (E1)**: toda mudança de fase/situação é um ATO do `TransicoesService`
  (`src/licitacoes/transicoes/`). `PUT avancar-fase` executa o ato principal da fase atual;
  atos específicos: `POST /api/licitacoes/:id/atos/:ato` (ex.: `SUSPENDER` com `{ motivo }`);
  histórico em `GET /api/licitacoes/:id/transicoes`. Estado inválido → 409; pré-condição → 400.
- **Comportamento desejado que ainda não existe**: use `test.failing(...)` — o teste passa enquanto o
  bloqueio existir e passa a falhar (avisando) quando for corrigido.
- **PNCP**: `pncpMock.limpar()` antes da ação; depois `pncpMock.filtrar('POST', /\/compras$/)` devolve
  método, caminho, headers e corpo enviados. `pncpMock.responder('POST', /\/compras$/, { status: 500 })`
  simula falha.
- **Relógio**: os `@Cron` ficam **desligados** (determinismo). Use `criarApp({ crons: true })` ou
  `ctx.ligarCrons()` quando o teste depender deles (disputa, transição por data).
- **Socket**: `const s = await conectarSocket(ctx, '/disputa-v2', { token })`, `aguardarEvento(s, 'evento')`,
  `fecharSockets()` no `afterAll`.
- O banco é **compartilhado entre os arquivos** da execução: não dependa de tabela vazia; as fábricas
  geram CNPJ/códigos únicos.

## Regras de segurança

1. Os e2e **só** rodam contra o Postgres descartável. O `env.ts` apaga `DATABASE_URL` e força `DB_*`;
   o `criarApp()` confere, **antes** do TypeORM conectar/sincronizar, a marca (`COMMENT ON DATABASE`)
   gravada pelo globalSetup — se não bater, aborta.
2. Nunca rode `jest --config test/jest-e2e.json` com `.env` de produção carregado achando que é
   seguro "porque tem guard": não desative o guard nem troque `DB_*` dentro de teste.
3. Rede externa é bloqueada (nock). PNCP vai para host fictício e é capturado; e-mail, WhatsApp,
   IA, Receita etc. ficam sem credencial. Tentativas aparecem em `pncpMock.bloqueadas`.
4. Não use `synchronize`/SQL destrutivo fora do banco descartável; prefira a API pública nas
   fixtures e só caia para repositório quando não houver rota (comente o motivo).
