/**
 * Simulador de disputa (plano E0 item 3) — modo ABERTO da disputa.
 *
 * Duas licitações ao mesmo tempo (A e B), cada uma com 10 fornecedores robôs
 * (um socket e um token por robô) × 2 itens. O relógio real do backend
 * (DisputaTimerService, cron de 1 s) encerra os itens; o simulador só adianta
 * o relógio de cada item pelo DataSource (ver cabeçalho de
 * test/support/simulador-disputa.ts: a sessão só aceita minutos inteiros).
 *
 * Os invariantes que a E0 registrou como defeito (3b, 5c, 7b) foram corrigidos
 * na E2 (motor único) e viraram testes normais.
 *
 * Relatório legível: E2E_SIMULADOR_RELATORIO=1 npm run test:e2e -- test/simulador-disputa.e2e-spec.ts
 */
import { AppE2E, criarApp, criarOrgao, fecharSockets } from './support';
import {
  CenarioDisputa,
  ESTRATEGIAS_PADRAO,
  RelatorioDisputa,
  SimuladorDisputa,
  contarDisparosSimultaneos,
  encontrarVazamentosEntreLicitacoes,
  encontrarVazamentosIdentidade,
  prepararCenarioDisputa,
  resumirRelatorio,
  verificarBanco,
  verificarCodigosAnonimosUnicos,
  verificarRespostasCoerentes,
  verificarLancesDecrescentes,
  verificarProrrogacaoEncerramento,
  verificarRanking,
  verificarSimultaneos,
} from './support/simulador-disputa';

const SEMENTE_A = 20260924;
const SEMENTE_B = 7;

describe('Simulador de disputa — modo aberto (10 robôs × 2 itens, 2 licitações simultâneas)', () => {
  let ctx: AppE2E;
  let simA: SimuladorDisputa;
  let simB: SimuladorDisputa;
  let A: RelatorioDisputa;
  let B: RelatorioDisputa;
  const relatorios = () => [A, B];

  beforeAll(async () => {
    // crons: true → o DisputaTimerService (EVERY_SECOND) prorroga e encerra de verdade
    ctx = await criarApp({ crons: true });
    const orgao = await criarOrgao(ctx, { nome: 'Prefeitura do Simulador' });
    const cenarioA: CenarioDisputa = await prepararCenarioDisputa(ctx, {
      nome: 'Licitação A',
      orgao,
      robos: ESTRATEGIAS_PADRAO,
      semente: SEMENTE_A,
    });
    const cenarioB: CenarioDisputa = await prepararCenarioDisputa(ctx, {
      nome: 'Licitação B',
      orgao,
      robos: ESTRATEGIAS_PADRAO,
      semente: SEMENTE_B,
    });
    simA = new SimuladorDisputa(ctx, cenarioA, { semente: SEMENTE_A });
    simB = new SimuladorDisputa(ctx, cenarioB, { semente: SEMENTE_B });
    await simA.conectar();
    await simB.conectar();
    [A, B] = await Promise.all([simA.executar(), simB.executar()]);

    if (process.env.E2E_SIMULADOR_RELATORIO === '1') {
      process.stdout.write(`\n${resumirRelatorio(A)}\n\n${resumirRelatorio(B)}\n`);
    }
  }, 240_000);

  afterAll(async () => {
    simA?.desconectar();
    simB?.desconectar();
    fecharSockets();
    await ctx?.fechar();
  });

  test('a simulação aconteceu de fato (lances aceitos, recusados e itens encerrados)', () => {
    for (const rel of relatorios()) {
      for (const item of rel.itens) {
        expect(item.tentativas.filter((t) => t.aceito).length).toBeGreaterThan(10);
        expect(item.tentativas.filter((t) => !t.aceito).length).toBeGreaterThan(0);
        expect(item.banco.status).toBe('ENCERRADO');
        expect(item.tentativas.every((t) => !String(t.motivo ?? '').startsWith('TIMEOUT'))).toBe(true);
      }
      expect(rel.robos).toHaveLength(10);
    }
  });

  test('1. ranking final = ordem do melhor lance de cada robô, sem duplicata, um lugar por robô', () => {
    for (const rel of relatorios()) expect(verificarRanking(rel)).toEqual([]);
  });

  test('2. nenhum lance aceito ≥ o anterior do próprio robô nem ≥ a sua proposta', () => {
    for (const rel of relatorios()) expect(verificarLancesDecrescentes(rel)).toEqual([]);
    // As tentativas inválidas foram de fato recusadas com o motivo certo
    const invalidos = relatorios().flatMap((r) => r.itens.flatMap((i) => i.tentativas));
    const acima = invalidos.filter((t) => t.rotulo === 'invalido_acima_do_proprio');
    expect(acima.length).toBeGreaterThan(0);
    for (const t of acima) {
      expect(t.aceito).toBe(false);
      expect(t.motivo).toMatch(/lance anterior|proposta inicial/i);
    }
  });

  test('3a. lances iguais no mesmo ms que viram o melhor lance: no máximo um aceito (lock)', () => {
    for (const rel of relatorios()) {
      expect(contarDisparosSimultaneos(rel, 'simultaneo_melhor')).toBeGreaterThan(0);
      expect(verificarSimultaneos(rel, 'simultaneo_melhor')).toEqual([]);
    }
  });

  test('3b-pré. o disparo simultâneo de valor intermediário aconteceu nas duas licitações', () => {
    for (const rel of relatorios()) expect(contarDisparosSimultaneos(rel, 'simultaneo_intermediario')).toBeGreaterThan(0);
  });

  // CORRIGIDO NA E2 (era defeito): o motor recusa valor igual a lance ATIVO de outro
  // fornecedor no item — prevalece o registrado primeiro (ordem da trava do item);
  // regra e base legal em backend/src/disputa/modelo-lance.ts (validarLance, regra 5)
  test('3b. lances iguais no mesmo ms com valor intermediário: no máximo um aceito', () => {
    expect(relatorios().flatMap((rel) => verificarSimultaneos(rel, 'simultaneo_intermediario'))).toEqual([]);
  });

  test('4. lance nos últimos 2 min prorroga; encerra só após janela inteira sem lance; nada aceito depois', () => {
    for (const rel of relatorios()) {
      expect(verificarProrrogacaoEncerramento(rel)).toEqual([]);
      for (const item of rel.itens) {
        expect(item.prorrogacoes).toHaveLength(2);
        expect(item.lancesEmProrrogacao).toBeGreaterThanOrEqual(2);
        const pos = item.tentativas.filter((t) => t.rotulo === 'pos_encerramento');
        expect(pos).toHaveLength(1);
        expect(pos[0].motivo).toMatch(/não está em disputa/i);
      }
    }
  });

  // CORRIGIDO NA E1a (era defeito): o gateway repassava a todos da sala o nome que o
  // próprio cliente informava em entrar_sala ('participante_entrou' e
  // 'novo_lance'.lance.fornecedorNome). Agora a identidade vem do token e a difusão
  // leva só o código anônimo (SigiloDisputaService).
  test('5. sigilo: nenhum robô recebe id/CNPJ/razão social de outro durante a disputa', () => {
    for (const rel of relatorios()) expect(encontrarVazamentosIdentidade(rel)).toEqual([]);
  });

  test('5b. (diagnóstico do defeito 5) os vazamentos vêm só de participante_entrou e novo_lance', () => {
    const eventos = new Set(relatorios().flatMap((r) => encontrarVazamentosIdentidade(r).map((v) => v.evento)));
    for (const e of eventos) expect(['participante_entrou', 'novo_lance']).toContain(e);
  });

  // CORRIGIDO NA E2 (era defeito): atribuição do código anônimo sob advisory lock por
  // sessão + índice único (sessao_id, indice); os códigos são atribuídos de uma vez ao
  // abrir os itens — backend/src/disputa/anonimizacao.service.ts (atribuirCodigos)
  test('5c. cada fornecedor tem código anônimo próprio na sessão', () => {
    expect(relatorios().flatMap((rel) => verificarCodigosAnonimosUnicos(rel))).toEqual([]);
  });

  test('6. isolamento: robôs de A não recebem eventos de B (e vice-versa), com as duas disputas ao mesmo tempo', () => {
    // Prova de simultaneidade: as janelas de execução se sobrepõem
    expect(A.iniciadoEm).toBeLessThan(B.finalizadoEm);
    expect(B.iniciadoEm).toBeLessThan(A.finalizadoEm);
    expect(encontrarVazamentosEntreLicitacoes(A, B)).toEqual([]);
    expect(encontrarVazamentosEntreLicitacoes(B, A)).toEqual([]);
  });

  test('7. melhor valor no banco (lances e item.melhor_lance_*) bate com o relatório', () => {
    for (const rel of relatorios()) expect(verificarBanco(rel)).toEqual([]);
  });

  // CORRIGIDO NA E2 (era defeito): o gateway confirma o lance logo após o commit e a
  // difusão (anonimização/broadcast) não pode mais virar "erro" para quem deu o lance —
  // backend/src/disputa/disputa.gateway.ts (handleEnviarLance / difundirNovoLance)
  test('7b. o que o robô ouviu (lance_confirmado/erro) bate com o que foi gravado', () => {
    expect(relatorios().flatMap((rel) => verificarRespostasCoerentes(rel))).toEqual([]);
  });
});
