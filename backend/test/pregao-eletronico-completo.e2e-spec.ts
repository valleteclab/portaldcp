/**
 * ============================================================================
 * E2E DE REFERÊNCIA — PREGÃO ELETRÔNICO COMPLETO (E0 do PLANO-CONSOLIDACAO-LICITACAO)
 * ============================================================================
 *
 * Pregão eletrônico, menor preço, modo ABERTO, 2 itens, 4 fornecedores (1 ME),
 * conduzido pela API de hoje do jeito que o frontend faz:
 *   - sala do pregoeiro/fornecedor: frontend/src/app/{orgao,fornecedor}/disputa-v3
 *     + frontend/src/hooks/useDisputaV3.ts (socket /disputa-v2, board /disputa-v3,
 *     etapas pós-disputa em /api/sessao/...);
 *   - homologação/contrato: cockpit frontend/src/app/orgao/processos/[id].
 *
 * As asserções descrevem o resultado JURIDICAMENTE CORRETO (Lei 14.133/2021,
 * LC 123/2006, IN SEGES 73/2022). Onde o sistema de hoje erra, o teste é
 * `test.failing(...)` com o comentário `DEFEITO CONHECIDO ...`: ele passa
 * enquanto o defeito existir e começa a FALHAR (avisando) quando for corrigido
 * — aí basta trocar para `test(...)`.
 *
 * Quando um defeito bloqueia o passo seguinte, a cadeia continua pelo endpoint
 * disponível mais correto (sempre documentado no próprio teste), para que os
 * passos posteriores continuem medindo alguma coisa.
 *
 * ---------------------------------------------------------------------------
 * Cenário (valores de lance = TOTAL do item, como a disputa-v2 registra)
 * ---------------------------------------------------------------------------
 *   Item 1: 10 un. (estimado R$ 100,00/un)   Item 2: 20 un. (estimado R$ 50,00/un)
 *
 *   Proposta (unitário)   Item 1   Item 2   Total proposta
 *   A  Alfa (demais)       95,00    48,50   1.920,00
 *   B  Beta (demais)       96,00    47,00   1.900,00  ← menor PROPOSTA
 *   C  Gama (ME)           99,00    49,00   1.970,00
 *   D  Delta (demais)      98,00    49,90   1.978,00  ← maior PROPOSTA
 *
 *   Lances finais        Item 1 (total)      Item 2 (total)
 *   1º  A                  900,00              900,00
 *   2º  D                  920,00              910,00
 *   3º  B                  940,00              935,00
 *   4º  C (ME)            ~990,00              980,00   (fora dos 5% do empate ficto)
 *
 *   Habilitação: A (1º) é INABILITADO; D (2º nos LANCES) é habilitado.
 *   Resultado correto: D vence os dois itens —
 *     item 1: R$ 92,00/un × 10 = R$ 920,00; item 2: R$ 45,50/un × 20 = R$ 910,00;
 *     valor homologado = contrato de D = R$ 1.830,00.
 *   A ordem das PROPOSTAS (B, A, C, D) é diferente da ordem dos LANCES de
 *   propósito: é o que separa ranking certo (lances) de ranking errado (B4).
 */
import { Socket } from 'socket.io-client';
import {
  AppE2E,
  FornecedorFixture,
  LicitacaoFixture,
  OrgaoFixture,
  UsuarioOrgaoFixture,
  abrirSessaoAgora,
  buscarLicitacao,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  criarUsuarioOrgao,
  enviarProposta,
  fecharSockets,
  levarAteFase,
  pncpMock,
  unico,
} from './support';
import {
  aguardarPncp,
  aguardarUmDe,
  darLance,
  desligarLimiteDeRequisicoes,
  deslocarRelogioItem,
  entrarNaSala,
  iniciarItensNaSala,
  jsonDaParteMultipart,
  pararTodosOsCrons,
  processoCompleto,
  recuarRelogioItem,
  tiqueRelogioDisputa,
  vincularOrgaoAoPncp,
} from './support/pregao';
import {
  CriterioJulgamento,
  FaseLicitacao,
  ModalidadeLicitacao,
  ModoDisputa,
} from '../src/licitacoes/entities/licitacao.entity';
import {
  EtapaSessao,
  StatusSessao,
} from '../src/sessao/entities/sessao-disputa.entity';
import { TipoEvento } from '../src/sessao/entities/evento-sessao.entity';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const MIN = 60_000;

const ITENS = [
  {
    descricao: 'Cadeira ergonomica giratoria',
    quantidade: 10,
    valor_unitario_estimado: 100,
  },
  {
    descricao: 'Mesa de escritorio 120 cm',
    quantidade: 20,
    valor_unitario_estimado: 50,
  },
];

/** Valor unitário proposto por fornecedor (ordem dos itens). */
const PROPOSTAS = {
  A: [95, 48.5],
  B: [96, 47],
  C: [99, 49],
  D: [98, 49.9],
};

/** Resultado correto (D habilitado vence os dois itens). */
const ESPERADO = {
  vencedor: 'D' as const,
  itens: [
    { lanceTotal: 920, unitario: 92, total: 920 },
    { lanceTotal: 910, unitario: 45.5, total: 910 },
  ],
  valorHomologado: 1830,
};

describe('Pregão eletrônico completo — menor preço, modo aberto (referência E0)', () => {
  let ctx: AppE2E;
  let orgao: OrgaoFixture;
  let pregoeiro: UsuarioOrgaoFixture;
  let lic: LicitacaoFixture;
  let F: Record<'A' | 'B' | 'C' | 'D', FornecedorFixture>;
  const propostaId: Record<string, string> = {};
  let sessaoId: string;
  let salaPregoeiro: Socket;
  const sala: Record<string, Socket> = {};
  let item1: string;
  let item2: string;

  const http = () => ctx.http();
  const itemPorNumero = (n: 1 | 2) => (n === 1 ? item1 : item2);

  async function sessao(): Promise<any> {
    const r = await http()
      .get(`/api/disputa-v2/sessao/${sessaoId}`)
      .expect(200);
    return r.body;
  }

  async function itemApi(itemId: string): Promise<any> {
    const r = await http().get(`/api/itens/${itemId}`).expect(200);
    return r.body;
  }

  async function boardPregoeiro(): Promise<any> {
    const r = await http()
      .get(`/api/disputa-v3/sessao/${sessaoId}/board`)
      .set(bearer(pregoeiro.token))
      .expect(200);
    return r.body;
  }

  async function itemNoBoard(itemId: string): Promise<any> {
    const b = await boardPregoeiro();
    return [
      ...b.colunas.aguardando,
      ...b.colunas.emDisputa,
      ...b.colunas.encerrados,
    ].find((i: any) => i.id === itemId);
  }

  async function melhores(itemId: string): Promise<any[]> {
    const r = await http()
      .get(`/api/disputa-v2/item/${itemId}/melhores`)
      .expect(200);
    return r.body;
  }

  async function eventosSessao(): Promise<any[]> {
    const r = await http().get(`/api/sessao/${sessaoId}/eventos`).expect(200);
    return r.body;
  }

  async function lance(
    quem: 'A' | 'B' | 'C' | 'D',
    item: 1 | 2,
    valor: number,
  ) {
    return darLance(sala[quem], sessaoId, itemPorNumero(item), valor);
  }

  beforeAll(async () => {
    ctx = await criarApp();
    // criarApp() só para os crons de 1 dos 3 SchedulerRegistry (ver pararTodosOsCrons);
    // sem isto o relógio da disputa e a transição de fase por data rodam sozinhos
    pararTodosOsCrons(ctx);
    desligarLimiteDeRequisicoes(ctx);
    pncpMock.limpar();

    orgao = await criarOrgao(ctx, {
      nome: `Prefeitura do Pregão E2E ${unico()}`,
    });
    await vincularOrgaoAoPncp(ctx, orgao);
    pregoeiro = await criarUsuarioOrgao(ctx, orgao, { nome: 'Pregoeira E2E' });

    F = {
      A: await criarFornecedor(ctx, {
        porte: 'DEMAIS',
        razao_social: `Alfa Comercio ${unico()}`,
      }),
      B: await criarFornecedor(ctx, {
        porte: 'DEMAIS',
        razao_social: `Beta Distribuidora ${unico()}`,
      }),
      C: await criarFornecedor(ctx, {
        porte: 'ME',
        razao_social: `Gama Moveis ME ${unico()}`,
      }),
      D: await criarFornecedor(ctx, {
        porte: 'DEMAIS',
        razao_social: `Delta Mobiliario ${unico()}`,
      }),
    };
  });

  afterAll(async () => {
    fecharSockets();
    // dá tempo aos envios fire-and-forget do PNCP terminarem antes de fechar o app
    await new Promise((r) => setTimeout(r, 300));
    await ctx?.fechar();
  });

  // ==========================================================================
  // 1. Edital
  // ==========================================================================
  describe('1. Edital e publicação', () => {
    test('órgão cria o pregão eletrônico (menor preço, modo aberto, 2 itens, diferença mínima R$ 5)', async () => {
      lic = await criarLicitacao(
        ctx,
        orgao,
        ModalidadeLicitacao.PREGAO_ELETRONICO,
        {
          criterio: CriterioJulgamento.MENOR_PRECO,
          modo_disputa: ModoDisputa.ABERTO,
          itens: ITENS,
          // IN 73/2022 art. 22 §1º: intervalo mínimo de diferença entre lances
          extras: { diferenca_minima_lances: 5 },
        },
      );
      [item1, item2] = lic.itens.map((i) => i.id);
      const l = await buscarLicitacao(ctx, lic);
      expect(l.fase).toBe(FaseLicitacao.PLANEJAMENTO);
      expect(l.itens).toHaveLength(2);
    });

    test('publica o edital respeitando o prazo mínimo de 8 dias úteis (art. 55, I, a)', async () => {
      pncpMock.limpar();
      const agora = Date.now();
      const dia = 24 * 60 * MIN;
      const publicada = await levarAteFase(ctx, lic, FaseLicitacao.PUBLICADO, {
        datas: {
          data_publicacao_edital: new Date(agora - MIN).toISOString(),
          data_limite_impugnacao: new Date(agora + 9 * dia).toISOString(),
          data_inicio_acolhimento: new Date(agora - MIN).toISOString(),
          data_fim_acolhimento: new Date(agora + 14 * dia).toISOString(),
          data_abertura_sessao: new Date(agora + 14 * dia).toISOString(),
        },
      });
      expect(publicada.fase).toBe(FaseLicitacao.PUBLICADO);
    });

    // DEFEITO CONHECIDO (§1.2 "Incompleto — PNCP automático só na dispensa"): publicar
    // pregão não envia a compra ao PNCP (art. 54 — divulgação obrigatória do edital) —
    // backend/src/licitacoes/licitacoes.service.ts:722 (só DISPENSA_ELETRONICA) — corrigir na E7
    test.failing(
      'publicar o edital envia a compra (aviso + itens) ao PNCP automaticamente (art. 54)',
      async () => {
        const envios = await aguardarPncp(
          'POST',
          /\/orgaos\/\d+\/compras$/,
          1,
          1500,
        );
        expect(envios).toHaveLength(1);
      },
    );

    test('cockpit reenvia o aviso ao PNCP (POST /api/pncp/compras/:id/completo) — compra capturada', async () => {
      // Caminho disponível hoje para o pregão: o botão "aviso" do cockpit.
      // Precisa rodar enquanto a fase é PUBLICADO: enviarCompra() grava
      // fase = PUBLICADO (pncp.service.ts:773) e regrediria uma fase posterior.
      pncpMock.limpar();
      const r = await http()
        .post(`/api/pncp/compras/${lic.id}/completo`)
        .set(bearer(orgao.token));
      expect(r.status).toBe(201);
      expect(r.body.sucesso).toBe(true);
      expect(r.body.numeroControlePNCP).toMatch(
        new RegExp(`^${orgao.cnpj}-1-\\d{6}/\\d{4}$`),
      );

      const [envio] = pncpMock.filtrar(
        'POST',
        new RegExp(`/orgaos/${orgao.cnpj}/compras$`),
      );
      expect(envio).toBeDefined();
      const compra = jsonDaParteMultipart(envio.corpo, 'compra');
      expect(compra).toMatchObject({
        modalidadeId: 6, // pregão eletrônico
        modoDisputaId: 1, // aberto
        tipoInstrumentoConvocatorioId: 1, // edital
        numeroProcesso: lic.numero_processo,
      });
      const l = await buscarLicitacao(ctx, lic);
      expect(l.fase).toBe(FaseLicitacao.PUBLICADO);
    });

    // DEFEITO CONHECIDO (§1.2 "Incompleto — Publicação sem prazos do art. 55"): pregão de
    // bens por menor preço exige 8 dias úteis entre a publicação e a abertura; o sistema
    // aceita qualquer data — backend/src/licitacoes/licitacoes.service.ts:653-694 (só a
    // dispensa tem prazo mínimo) — corrigir na E7
    test.failing(
      'recusa publicar pregão com abertura antes de 8 dias úteis (art. 55, I, a)',
      async () => {
        const outro = await criarLicitacao(
          ctx,
          orgao,
          ModalidadeLicitacao.PREGAO_ELETRONICO,
          { itens: ITENS },
        );
        await levarAteFase(ctx, outro, FaseLicitacao.APROVACAO_INTERNA);
        const agora = Date.now();
        const r = await http()
          .put(`/api/licitacoes/${outro.id}/publicar-edital`)
          .set(bearer(orgao.token))
          .send({
            data_publicacao_edital: new Date(agora).toISOString(),
            data_limite_impugnacao: new Date(
              agora + 1 * 24 * 60 * MIN,
            ).toISOString(),
            data_inicio_acolhimento: new Date(agora).toISOString(),
            data_fim_acolhimento: new Date(
              agora + 3 * 24 * 60 * MIN,
            ).toISOString(),
            data_abertura_sessao: new Date(
              agora + 3 * 24 * 60 * MIN,
            ).toISOString(),
          });
        expect(r.status).toBe(400);
      },
    );
  });

  // ==========================================================================
  // 2. Propostas (enviadas ANTES da abertura) e abertura da sessão
  // ==========================================================================
  describe('2. Propostas e abertura da sessão pública', () => {
    test('edital entra no acolhimento de propostas', async () => {
      const l = await levarAteFase(
        ctx,
        lic,
        FaseLicitacao.ACOLHIMENTO_PROPOSTAS,
      );
      expect(l.fase).toBe(FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
    });

    test('os 4 fornecedores enviam proposta, cada um com o próprio token, antes da abertura', async () => {
      for (const k of ['A', 'B', 'C', 'D'] as const) {
        const p = await enviarProposta(ctx, F[k], lic, PROPOSTAS[k]);
        expect(p.status).toBe('ENVIADA');
        propostaId[k] = p.id;
      }
      expect(F.C.mpe).toBe(true);
    });

    test('abertura da sessão encerra o acolhimento: proposta nova é recusada', async () => {
      await abrirSessaoAgora(ctx, lic);
      const atrasado = await criarFornecedor(ctx, { porte: 'EPP' });
      const r = await http()
        .post('/api/propostas')
        .set(bearer(atrasado.token))
        .send({
          licitacao_id: lic.id,
          fornecedor_id: atrasado.id,
          declaracao_termos: true,
          declaracao_integridade: true,
          declaracao_inexistencia_fatos: true,
          declaracao_menor: true,
          itens: [{ item_licitacao_id: item1, valor_unitario: 50 }],
        });
      expect(r.status).toBe(400);
      expect(String(r.body.message)).toMatch(/abertura da sess/i);
    });

    test('pregoeiro cria e inicia a sessão pública (fase → ANALISE_PROPOSTAS)', async () => {
      const criada = await http()
        .post(`/api/sessao/${lic.id}`)
        .set(bearer(pregoeiro.token))
        .send({ pregoeiroId: pregoeiro.id, pregoeiroNome: 'Pregoeira E2E' });
      expect(criada.status).toBe(201);
      sessaoId = criada.body.id;

      await http()
        .put(`/api/sessao/${sessaoId}/iniciar`)
        .set(bearer(pregoeiro.token))
        .expect(200);
      const l = await buscarLicitacao(ctx, lic);
      expect(l.fase).toBe(FaseLicitacao.ANALISE_PROPOSTAS);
    });

    test('propostas conformes são classificadas para a etapa de lances', async () => {
      for (const k of ['A', 'B', 'C', 'D'] as const) {
        const r = await http()
          .put(`/api/propostas/${propostaId[k]}/classificar`)
          .set(bearer(pregoeiro.token))
          .expect(200);
        expect(r.body.status).toBe('CLASSIFICADA');
      }
    });

    test('cronometria do modo aberto segue a IN 73/2022 art. 23 (10 min + prorrogação de 2 min)', async () => {
      // O padrão de "intervalo mínimo entre lances do mesmo fornecedor" é 3 min;
      // o pregoeiro zera pela configuração da sala para o roteiro de lances.
      await http()
        .put(`/api/disputa-v2/sessao/${sessaoId}/configuracoes`)
        .set(bearer(pregoeiro.token))
        .send({ intervalo_minimo_lances_minutos: 0 })
        .expect(200);
      const cfg = await http()
        .get(`/api/disputa-v2/sessao/${sessaoId}/configuracoes`)
        .expect(200);
      expect(cfg.body.tempo_inatividade_minutos).toBe(10);
      expect(cfg.body.tempo_prorrogacao_minutos).toBe(2);
      expect(cfg.body.modo_aberto).toBe(true);

      const contexto = await http()
        .get(`/api/disputa-v3/sessao/${sessaoId}/contexto`)
        .set(bearer(pregoeiro.token))
        .expect(200);
      expect(contexto.body.modo).toBe('ABERTO');
      expect(contexto.body.cronometria.baseLegal).toContain('art. 23');
      expect(contexto.body.cronometria.requerFluxoEspecificoNaV3).toBe(false);
      expect(Number(contexto.body.cronometria.diferencaMinimaLances)).toBe(5);
    });
  });

  // ==========================================================================
  // 3. Disputa de lances (socket /disputa-v2, como a sala V3)
  // ==========================================================================
  describe('3. Disputa de lances', () => {
    test('pregoeiro entra na sala e inicia os dois itens', async () => {
      const p = await entrarNaSala(ctx, sessaoId, {
        id: pregoeiro.id,
        nome: 'Pregoeira E2E',
        tipo: 'PREGOEIRO',
        token: pregoeiro.token,
      });
      expect(p.resposta.evento).toBe('dados_iniciais');
      salaPregoeiro = p.socket;

      const r = await iniciarItensNaSala(salaPregoeiro, sessaoId, [
        item1,
        item2,
      ]);
      expect(r.evento).toBe('itens_iniciados');
      expect(r.payload.itensIniciados).toBe(2);

      // as propostas viram o lance inicial de cada fornecedor (valor TOTAL do item)
      const m1 = await melhores(item1);
      expect(m1.map((m) => m.melhorValor)).toEqual([950, 960, 980, 990]);
      const s = await sessao();
      expect(s.etapa).toBe(EtapaSessao.DISPUTA_LANCES);
    });

    test('cada fornecedor entra na sala com o próprio token', async () => {
      for (const k of ['A', 'B', 'C', 'D'] as const) {
        const e = await entrarNaSala(ctx, sessaoId, {
          id: F[k].id,
          nome: F[k].razao_social,
          tipo: 'FORNECEDOR',
          token: F[k].token,
        });
        expect(e.resposta.evento).toBe('dados_iniciais');
        sala[k] = e.socket;
      }
    });

    // CORRIGIDO NA E1a (era o defeito B6): o gateway confiava no usuarioId enviado pelo
    // cliente — agora a identidade vem do token e um usuarioId divergente é recusado
    test(
      'fornecedor não entra na sala com a identidade de outro (token ≠ usuarioId)',
      async () => {
        const e = await entrarNaSala(
          ctx,
          sessaoId,
          {
            id: F.B.id,
            nome: F.B.razao_social,
            tipo: 'FORNECEDOR',
            token: F.B.token,
          },
          { usuarioIdDeclarado: F.A.id },
        );
        e.socket.close();
        expect(e.resposta.evento).toBe('acesso_negado');
      },
    );

    // CORRIGIDO NA E1a (era o defeito B6): REST de lance era @Public e o fornecedorId
    // vinha do body — agora @SomenteFornecedor, fornecedor do token
    test(
      'lance por REST sem autenticação é recusado com 401',
      async () => {
        // valor acima da proposta: se o defeito persistir, é recusado por 400 (sem efeito colateral)
        const r = await http()
          .post(`/api/disputa-v2/sessao/${sessaoId}/lance`)
          .send({
            itemId: item1,
            fornecedorId: F.A.id,
            fornecedorNome: 'Intruso',
            valor: 99_999,
          });
        expect(r.status).toBe(401);
      },
    );

    test('lances simultâneos são serializados pelo lock pessimista (nenhum perdido, nenhum 500)', async () => {
      // os três valores são válidos em qualquer ordem de chegada
      const resultados = await Promise.all([
        lance('D', 1, 945),
        lance('B', 1, 940),
        lance('A', 1, 930),
      ]);
      for (const r of resultados) expect(r).toMatchObject({ ok: true });
      expect((await lance('D', 1, 920)).ok).toBe(true);

      const lances = await http()
        .get(`/api/disputa-v2/item/${item1}/lances`)
        .expect(200);
      expect(lances.body.filter((l: any) => l.origem === 'LANCE')).toHaveLength(
        8,
      ); // 4 propostas + 4 lances
    });

    test('lance acima da própria proposta é recusado', async () => {
      const r = await lance('C', 1, 995);
      expect(r.ok).toBe(false);
      expect(r.mensagem).toMatch(/proposta inicial/i);
    });

    test('lance igual ao melhor lance é recusado', async () => {
      const r = await lance('B', 1, 920); // D tem 920
      expect(r.ok).toBe(false);
      expect(r.mensagem).toMatch(/igual ao melhor/i);
    });

    test('lance que não cobre o próprio lance anterior é recusado (IN 73 art. 21 §2º)', async () => {
      const r = await lance('A', 1, 935); // último de A: 930
      expect(r.ok).toBe(false);
      expect(r.mensagem).toMatch(/lance anterior/i);
    });

    // DEFEITO CONHECIDO (§1.2 "Incompleto — diferença mínima entre lances não validada"):
    // edital fixou R$ 5,00 e a disputa-v2 aceita R$ 1,00 de redução —
    // backend/src/disputa-v2/disputa.service.ts:594-730 (registrarLance não lê
    // diferenca_minima_lances) — corrigir na E2
    test.failing(
      'lance com redução menor que a diferença mínima do edital é recusado (IN 73 art. 22 §1º)',
      async () => {
        const r = await lance('C', 1, 989); // proposta de C: 990 → redução de R$ 1,00
        expect(r.ok).toBe(false);
      },
    );

    test('lances do item 2', async () => {
      for (const [quem, valor] of [
        ['A', 930],
        ['D', 925],
        ['B', 935],
        ['A', 900],
        ['D', 910],
      ] as const) {
        expect(await lance(quem, 2, valor)).toMatchObject({ ok: true });
      }
    });

    test('fornecedor vê só a própria visão do board (sem pedidos de cancelamento do pregoeiro)', async () => {
      const r = await http()
        .get(`/api/disputa-v3/sessao/${sessaoId}/board`)
        .set(bearer(F.A.token))
        .expect(200);
      expect(r.body.visao).toBe('FORNECEDOR');
      expect(r.body.solicitacoesCancelamento).toBeUndefined();
      const i1 = r.body.colunas.emDisputa.find((i: any) => i.id === item1);
      expect(i1.meuMelhorLance).toBe(930);
    });
  });

  // ==========================================================================
  // 4. Encerramento do item — relógio do modo aberto (IN 73 art. 23)
  // ==========================================================================
  describe('4. Encerramento pelo relógio (10 min + prorrogações de 2 min)', () => {
    test('dentro dos 10 minutos iniciais o item continua em disputa', async () => {
      await tiqueRelogioDisputa(ctx);
      expect((await itemApi(item1)).status_disputa).toBe('EM_DISPUTA');
      const i1 = await itemNoBoard(item1);
      expect(i1.cronometro.fase).toBe('ETAPA_ABERTA');
      expect(i1.cronometro.tempoRestanteSegundos).toBeGreaterThan(8 * 60);
      expect(i1.cronometro.tempoRestanteSegundos).toBeLessThanOrEqual(10 * 60);
    });

    test('lance nos 2 minutos finais prorroga a disputa por 2 minutos', async () => {
      // item 1 aos 9min30s, sem lance desde o início (relógio simulado)
      await deslocarRelogioItem(ctx, item1, {
        inicioHaMs: 9.5 * MIN,
        ultimoLanceHaMs: 9.5 * MIN,
      });
      await tiqueRelogioDisputa(ctx);
      let i1 = await itemNoBoard(item1);
      expect(i1.status).toBe('EM_DISPUTA');
      expect(i1.cronometro.fase).toBe('ETAPA_ABERTA');
      expect(i1.cronometro.tempoRestanteSegundos).toBeLessThanOrEqual(30);

      expect(await lance('A', 1, 900)).toMatchObject({ ok: true });
      await tiqueRelogioDisputa(ctx);
      i1 = await itemNoBoard(item1);
      expect(i1.status).toBe('EM_DISPUTA');
      expect(i1.cronometro.fase).toBe('PRORROGACAO');
      expect(i1.cronometro.tempoRestanteSegundos).toBeGreaterThan(110);
      expect(i1.cronometro.tempoRestanteSegundos).toBeLessThanOrEqual(120);
    });

    test('sem lance durante a prorrogação, o item é encerrado automaticamente', async () => {
      await recuarRelogioItem(ctx, item1, 2 * MIN + 5_000);
      const aviso = aguardarUmDe(salaPregoeiro, ['item_encerrado'], 5000);
      await tiqueRelogioDisputa(ctx);
      const ev = await aviso;
      expect(ev.payload.itemId).toBe(item1);
      expect((await itemApi(item1)).status_disputa).toBe('ENCERRADO');
    });

    test('sem lance nos 2 minutos finais, o item encerra ao fim dos 10 minutos', async () => {
      await deslocarRelogioItem(ctx, item2, {
        inicioHaMs: 10 * MIN + 5_000,
        ultimoLanceHaMs: 10 * MIN + 5_000,
      });
      await tiqueRelogioDisputa(ctx);
      expect((await itemApi(item2)).status_disputa).toBe('ENCERRADO');
    });

    test('lance depois do encerramento é recusado', async () => {
      const r = await lance('D', 2, 905);
      expect(r.ok).toBe(false);
      expect(r.mensagem).toMatch(/não está em disputa/i);
    });

    test('ranking final por LANCE, com identidades reveladas após o encerramento', async () => {
      const m1 = await melhores(item1);
      expect(m1.map((m) => m.fornecedorId)).toEqual([
        F.A.id,
        F.D.id,
        F.B.id,
        F.C.id,
      ]);
      expect(m1.slice(0, 3).map((m) => m.melhorValor)).toEqual([900, 920, 940]);

      const m2 = await melhores(item2);
      expect(m2.map((m) => m.fornecedorId)).toEqual([
        F.A.id,
        F.D.id,
        F.B.id,
        F.C.id,
      ]);
      expect(m2.map((m) => m.melhorValor)).toEqual([900, 910, 935, 980]);

      // ME (C) fica fora da faixa de 5% do empate ficto (LC 123 art. 44 §2º) nos dois itens
      expect(m1[3].melhorValor / m1[0].melhorValor).toBeGreaterThan(1.05);
      expect(m2[3].melhorValor / m2[0].melhorValor).toBeGreaterThan(1.05);
    });

    // CORRIGIDO NA E1 (era o defeito B7): encerrado o último item, a disputa-v2 tira a
    // sessão da etapa de lances e pede ENCERRAR_DISPUTA à máquina de estados
    test(
      'com todos os itens encerrados, a sessão sai da etapa de lances e a licitação vai a julgamento',
      async () => {
        const s = await sessao();
        expect(s.status).not.toBe(StatusSessao.MODO_ABERTO);
        expect(s.etapa).not.toBe(EtapaSessao.DISPUTA_LANCES);
        const l = await buscarLicitacao(ctx, lic);
        expect(l.fase).toBe(FaseLicitacao.JULGAMENTO);
      },
    );

    // DEFEITO CONHECIDO B9: a ata da sessão consulta f.cnpj, mas a coluna é cpf_cnpj —
    // a query quebra e a rota devolve 500 — backend/src/sessao/sessao.service.ts:1657,1671
    // (idem 2069 e 2925) — corrigir na E2
    test.failing(
      'ata da sessão pública é gerada com participantes e melhor lance por item (art. 17 §2º)',
      async () => {
        const r = await http().get(`/api/sessao/${sessaoId}/ata`);
        expect(r.status).toBe(200);
        const i1 = r.body.itens.find((i: any) => i.id === item1);
        expect(Number(i1.melhor_lance.valor)).toBe(900);
        expect(i1.melhor_lance.cnpj).toBe(F.A.cnpj);
      },
    );
  });

  // ==========================================================================
  // 5. Julgamento: aceitação, negociação
  // ==========================================================================
  describe('5. Julgamento da proposta do 1º colocado', () => {
    // DEFEITO CONHECIDO B4: habilitação/negociação ordenam por valor_total_proposta (a
    // PROPOSTA, não o lance) e filtram status inexistentes (VALIDA, SEGUNDA_COLOCADA) —
    // backend/src/sessao/sessao.service.ts:1149,1272 (e 1183,1355) — corrigir na E3
    test.failing(
      'o 1º colocado do julgamento é o 1º nos LANCES (A), não a menor proposta (B)',
      async () => {
        const hab = await http()
          .get(`/api/sessao/${sessaoId}/habilitacao`)
          .set(bearer(pregoeiro.token))
          .expect(200);
        expect(hab.body.ranking[0].fornecedorId).toBe(F.A.id);
        const neg = await http()
          .get(`/api/sessao/${sessaoId}/negociacao`)
          .set(bearer(pregoeiro.token))
          .expect(200);
        expect(neg.body.vencedor.fornecedorId).toBe(F.A.id);
      },
    );

    // DEFEITO CONHECIDO (§1.2 "Incompleto — aceitação da proposta não existe"): não há
    // etapa/ato de aceitação da proposta do 1º colocado (IN 73 art. 29: aceitar/recusar
    // com motivo; proposta adequada ao último lance em ≥ 2 h) —
    // backend/src/sessao/entities/sessao-disputa.entity.ts:23-55 (EtapaSessao sem
    // ACEITACAO) e sessao.controller.ts (sem rota) — corrigir na E3
    test.failing(
      'existe a etapa de aceitação da proposta do 1º colocado antes da habilitação (IN 73 art. 29)',
      async () => {
        expect(Object.values(EtapaSessao).some((e) => /ACEITA/.test(e))).toBe(
          true,
        );
      },
    );

    // DEFEITO CONHECIDO B8: PUT :id/negociacao/:fornecedorId é declarado antes de
    // PUT :id/negociacao/encerrar — "encerrar" vira fornecedorId e a rota chama
    // iniciarNegociacao — backend/src/sessao/sessao.controller.ts:174/182 — corrigir na E3
    test.failing(
      'pregoeiro encerra a negociação (art. 61) e a sessão segue para habilitação',
      async () => {
        await http()
          .put(`/api/sessao/${sessaoId}/negociacao/encerrar`)
          .set(bearer(pregoeiro.token))
          .send({})
          .expect(200);
        const eventos = await eventosSessao();
        expect(
          eventos.some((e) => e.tipo === TipoEvento.NEGOCIACAO_ENCERRADA),
        ).toBe(true);
        expect((await sessao()).etapa).toBe(EtapaSessao.CONVOCACAO_HABILITACAO);
      },
    );
  });

  // ==========================================================================
  // 6. Habilitação: inabilita o 1º, habilita o 2º
  // ==========================================================================
  describe('6. Habilitação', () => {
    test('pregoeiro convoca o 1º colocado (A) para a habilitação (art. 62)', async () => {
      await http()
        .put(`/api/sessao/${sessaoId}/habilitacao/convocar/${F.A.id}`)
        .set(bearer(pregoeiro.token))
        .send({})
        .expect(200);
      const hab = await http()
        .get(`/api/sessao/${sessaoId}/habilitacao`)
        .set(bearer(pregoeiro.token))
        .expect(200);
      expect(hab.body.convocado.fornecedorId).toBe(F.A.id);
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(
        FaseLicitacao.HABILITACAO,
      );
    });

    test('A é inabilitado com motivo registrado', async () => {
      await http()
        .put(`/api/sessao/${sessaoId}/habilitacao/reprovar/${F.A.id}`)
        .set(bearer(pregoeiro.token))
        .send({ motivo: 'Certidão de regularidade fiscal federal vencida' })
        .expect(200);
      const eventos = await eventosSessao();
      const rep = eventos.find(
        (e) => e.tipo === TipoEvento.HABILITACAO_REPROVADA,
      );
      expect(rep?.fornecedor_identificador).toBe(F.A.id);
      expect(rep?.descricao).toMatch(/Certid/);
    });

    // DEFEITO CONHECIDO B4: o "próximo classificado" vem da ordem das PROPOSTAS
    // (B 1900, A 1920, C 1970, D 1978) → depois de A convoca C, não D —
    // backend/src/sessao/sessao.service.ts:1182-1192 (encontrarProximoClassificado) — corrigir na E4
    test.failing(
      'com A inabilitado, o convocado é o 2º colocado nos LANCES (D)',
      async () => {
        const hab = await http()
          .get(`/api/sessao/${sessaoId}/habilitacao`)
          .set(bearer(pregoeiro.token))
          .expect(200);
        expect(hab.body.convocado?.fornecedorId).toBe(F.D.id);
      },
    );

    test('pregoeiro convoca D (2º nos lances) e o habilita — caminho manual disponível hoje', async () => {
      // Continuação da cadeia apesar do B4: PUT /sessao/:id/habilitacao/convocar/:D
      // (a mesma ação do botão "convocar" da sala V3) com o fornecedor correto.
      await http()
        .put(`/api/sessao/${sessaoId}/habilitacao/convocar/${F.D.id}`)
        .set(bearer(pregoeiro.token))
        .send({})
        .expect(200);
      await http()
        .put(`/api/sessao/${sessaoId}/habilitacao/aprovar/${F.D.id}`)
        .set(bearer(pregoeiro.token))
        .send({})
        .expect(200);
      expect((await sessao()).etapa).toBe(EtapaSessao.INTENCAO_RECURSO);
      const eventos = await eventosSessao();
      const ok = eventos.find(
        (e) => e.tipo === TipoEvento.HABILITACAO_APROVADA,
      );
      expect(ok?.fornecedor_identificador).toBe(F.D.id);
    });
  });

  // ==========================================================================
  // 7. Recurso (art. 165)
  // ==========================================================================
  describe('7. Intenção de recurso e recurso', () => {
    let recursoId: string;

    test('A (inabilitado) manifesta intenção de recurso com o próprio token', async () => {
      await http()
        .post(`/api/sessao/${sessaoId}/recursos/intencao`)
        .set(bearer(F.A.token))
        .send({
          fornecedorId: F.A.id,
          motivacao: 'A certidão estava válida na data da sessão',
        })
        .expect(201);
      const st = await http()
        .get(`/api/sessao/${sessaoId}/recursos/intencoes`)
        .set(bearer(pregoeiro.token))
        .expect(200);
      expect(st.body.totalIntencoes).toBe(1);
      expect(st.body.intencoes[0].fornecedorId).toBe(F.A.id);
    });

    test('encerrado o prazo de intenção, abre-se o prazo recursal', async () => {
      const r = await http()
        .put(`/api/sessao/${sessaoId}/recursos/encerrar-prazo`)
        .set(bearer(pregoeiro.token))
        .send({})
        .expect(200);
      expect(r.body.etapaProxima).toBe(EtapaSessao.PRAZO_RECURSAL);
    });

    test('intenção admitida → razões (A) → contrarrazões (D) → recurso improvido → adjudicação', async () => {
      const adm = await http()
        .post(`/api/sessao/${sessaoId}/recursos/${F.A.id}/admitir`)
        .set(bearer(pregoeiro.token))
        .send({
          fornecedorNome: F.A.razao_social,
          motivacao: 'Certidão válida',
        })
        .expect(201);
      recursoId = adm.body.id;
      expect(adm.body.status).toBe('AGUARDANDO_RAZOES');

      await http()
        .put(`/api/sessao/recursos/${recursoId}/razoes`)
        .set(bearer(F.A.token))
        .send({
          razoes: 'A certidão juntada tinha validade até o dia da sessão.',
        })
        .expect(200);
      await http()
        .put(`/api/sessao/recursos/${recursoId}/contrarrazoes`)
        .set(bearer(F.D.token))
        .send({
          fornecedorId: F.D.id,
          fornecedorNome: F.D.razao_social,
          texto: 'A certidão venceu antes da sessão.',
        })
        .expect(200);
      const dec = await http()
        .put(`/api/sessao/recursos/${recursoId}/decidir`)
        .set(bearer(orgao.token))
        .send({
          provido: false,
          decisao: 'Certidão vencida na data da sessão. Recurso improvido.',
          decididoPor: 'Prefeito E2E',
        })
        .expect(200);
      expect(dec.body.status).toBe('IMPROVIDO');
      expect((await sessao()).etapa).toBe(EtapaSessao.ADJUDICACAO);
    });
  });

  // ==========================================================================
  // 8. Adjudicação e homologação pela sala
  // ==========================================================================
  describe('8. Adjudicação e homologação (sala)', () => {
    test('pregoeiro adjudica o resultado pela sala (PUT /sessao/:id/adjudicar-todos)', async () => {
      await http()
        .put(`/api/sessao/${sessaoId}/adjudicar-todos`)
        .set(bearer(pregoeiro.token))
        .send({})
        .expect(200);
      expect((await sessao()).etapa).toBe(EtapaSessao.HOMOLOGACAO);
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(
        FaseLicitacao.ADJUDICACAO,
      );
    });

    // DEFEITO CONHECIDO B3: adjudicação/homologação pegam o menor lance de QUALQUER
    // licitante — o inabilitado A "vence" — backend/src/sessao/sessao.service.ts:1441,1491
    // (getAdjudicacaoStatus/adjudicarTodos); reprovar não marca o licitante (1120-1141) — corrigir na E4/E6
    test.failing(
      'adjudicação aponta o habilitado D como vencedor dos dois itens',
      async () => {
        const r = await http()
          .get(`/api/sessao/${sessaoId}/adjudicacao`)
          .set(bearer(pregoeiro.token))
          .expect(200);
        for (const [idx, it] of r.body.itens.entries()) {
          expect(it.vencedor.fornecedorId).toBe(F.D.id);
          expect(it.vencedor.valor).toBe(ESPERADO.itens[idx].lanceTotal);
        }
      },
    );

    // DEFEITO CONHECIDO B1: sessao.adjudicar* só grava evento — o item não vira
    // ADJUDICADO nem recebe vencedor/valor — backend/src/sessao/sessao.service.ts:1228,1480-1515
    // — corrigir na E6
    test.failing(
      'após a adjudicação, cada item fica ADJUDICADO ao vencedor com o valor do lance',
      async () => {
        const proc = await processoCompleto(ctx, lic.id, orgao.token);
        for (const it of proc.itens) {
          expect(it.status).toBe('ADJUDICADO');
          expect(it.fornecedor_vencedor_id).toBe(F.D.id);
        }
      },
    );

    test('autoridade homologa pela sala (PUT /sessao/:id/homologar) — fase HOMOLOGACAO', async () => {
      pncpMock.limpar();
      const r = await http()
        .put(`/api/sessao/${sessaoId}/homologar`)
        .set(bearer(orgao.token))
        .send({ nome: 'Prefeito E2E', cargo: 'Autoridade competente' })
        .expect(200);
      expect(r.body.totalHomologado).toBe(2);
      const l = await buscarLicitacao(ctx, lic);
      expect(l.fase).toBe(FaseLicitacao.HOMOLOGACAO);
      expect(l.data_homologacao).toBeTruthy();
      expect((await sessao()).status).toBe(StatusSessao.ENCERRADA);
    });

    // DEFEITO CONHECIDO B3: sessao.homologar grava como vencedor o menor lance de
    // qualquer um (o inabilitado A) — backend/src/sessao/sessao.service.ts:1547-1566 — corrigir na E6
    test.failing(
      'homologação grava o habilitado D como vencedor de cada item',
      async () => {
        const proc = await processoCompleto(ctx, lic.id, orgao.token);
        for (const it of proc.itens)
          expect(it.fornecedor_vencedor_id).toBe(F.D.id);
      },
    );

    // DEFEITO CONHECIDO B2: o lance do pregão já é o TOTAL do item, mas a homologação o
    // grava como unitário e multiplica pela quantidade de novo (×10, ×20) —
    // backend/src/sessao/sessao.service.ts:1554-1568 (e ata 1704) — corrigir na E2/E6
    test.failing(
      'valor homologado de cada item = lance final do vencedor (sem multiplicar de novo pela quantidade)',
      async () => {
        const proc = await processoCompleto(ctx, lic.id, orgao.token);
        let soma = 0;
        for (const it of proc.itens) {
          const lanceVencedor = (await melhores(it.id)).find(
            (m) => m.fornecedorId === it.fornecedor_vencedor_id,
          );
          const qtd = Number(it.quantidade);
          expect(Number(it.valor_total_homologado)).toBeCloseTo(
            lanceVencedor!.melhorValor,
            2,
          );
          expect(Number(it.valor_unitario_homologado)).toBeCloseTo(
            lanceVencedor!.melhorValor / qtd,
            2,
          );
          soma += lanceVencedor!.melhorValor;
        }
        expect(Number(proc.licitacao.valor_homologado)).toBeCloseTo(soma, 2);
      },
    );

    // DEFEITO CONHECIDO B1: sessao.homologar não gera contrato (gerarContratoAutomatico
    // exige itens ADJUDICADO, que a sala nunca grava) — backend/src/sessao/sessao.service.ts:1527-1591;
    // backend/src/contratos/contratos.service.ts:2466 — corrigir na E6
    test.failing(
      'homologação gera o contrato do vencedor habilitado (D, R$ 1.830,00)',
      async () => {
        const proc = await processoCompleto(ctx, lic.id, orgao.token);
        expect(proc.contratos).toHaveLength(1);
        expect(proc.contratos[0].fornecedor_razao_social).toBe(
          F.D.razao_social,
        );
        expect(Number(proc.contratos[0].valor_global)).toBeCloseTo(
          ESPERADO.valorHomologado,
          2,
        );
      },
    );

    // DEFEITO CONHECIDO B1: sessao.homologar também não publica o resultado no PNCP —
    // backend/src/sessao/sessao.service.ts:1527-1591 — corrigir na E6/E7
    test.failing(
      'homologação publica o resultado por item no PNCP',
      async () => {
        const envios = await aguardarPncp(
          'POST',
          /\/itens\/\d+\/resultados$/,
          2,
          1500,
        );
        expect(envios).toHaveLength(2);
      },
    );
  });

  // ==========================================================================
  // 9. Contrato e PNCP — continuação pela rota disponível
  // ==========================================================================
  describe('9. Contrato e resultado no PNCP', () => {
    test('caminho disponível: adjudicação por item (PUT /api/itens/:id/adjudicar) ao habilitado D', async () => {
      // Continuação da cadeia apesar do B1/B2/B3: a única rota que grava o item como
      // ADJUDICADO com vencedor e valor. O unitário vem do lance final de D (total ÷ qtd).
      for (const [idx, itemId] of [item1, item2].entries()) {
        const lanceD = (await melhores(itemId)).find(
          (m) => m.fornecedorId === F.D.id,
        )!;
        expect(lanceD.melhorValor).toBe(ESPERADO.itens[idx].lanceTotal);
        const r = await http()
          .put(`/api/itens/${itemId}/adjudicar`)
          .set(bearer(orgao.token))
          .send({
            fornecedor_id: F.D.id,
            fornecedor_nome: F.D.razao_social,
            valor_unitario_homologado:
              lanceD.melhorValor / ITENS[idx].quantidade,
          })
          .expect(200);
        expect(r.body.status).toBe('ADJUDICADO');
      }
    });

    test('cockpit homologa (PUT /api/licitacoes/:id/homologar) pelo valor somado dos itens', async () => {
      // Mesma chamada do botão "Homologar" de /orgao/processos/[id] (o botão em si fica
      // oculto porque a sala já gravou data_homologacao). Valor = soma dos itens, como a tela calcula.
      pncpMock.limpar();
      const antes = await processoCompleto(ctx, lic.id, orgao.token);
      const total = antes.itens.reduce(
        (s: number, i: any) => s + Number(i.valor_total_homologado || 0),
        0,
      );
      expect(total).toBeCloseTo(ESPERADO.valorHomologado, 2);
      const r = await http()
        .put(`/api/licitacoes/${lic.id}/homologar`)
        .set(bearer(orgao.token))
        .send({ valor_homologado: total })
        .expect(200);
      expect(r.body.fase).toBe(FaseLicitacao.HOMOLOGACAO);
    });

    test('contrato gerado para o vencedor habilitado (D) pelo valor homologado', async () => {
      const proc = await processoCompleto(ctx, lic.id, orgao.token);
      expect(Number(proc.licitacao.valor_homologado)).toBeCloseTo(
        ESPERADO.valorHomologado,
        2,
      );
      for (const [idx, it] of proc.itens.entries()) {
        expect(it.fornecedor_vencedor_id).toBe(F.D.id);
        expect(Number(it.valor_unitario_homologado)).toBeCloseTo(
          ESPERADO.itens[idx].unitario,
          2,
        );
        expect(Number(it.valor_total_homologado)).toBeCloseTo(
          ESPERADO.itens[idx].total,
          2,
        );
      }
      expect(proc.contratos).toHaveLength(1);
      expect(proc.contratos[0].fornecedor_razao_social).toBe(F.D.razao_social);
      expect(Number(proc.contratos[0].valor_global)).toBeCloseTo(
        ESPERADO.valorHomologado,
        2,
      );
      expect(proc.checklist.contrato_gerado).toBe(true);
    });

    test('PNCP recebe o resultado por item com vencedor e valores corretos', async () => {
      const envios = await aguardarPncp('POST', /\/itens\/\d+\/resultados$/, 2);
      expect(envios).toHaveLength(2);
      const porItem = new Map(
        envios.map((e) => [
          Number(e.caminho.match(/\/itens\/(\d+)\/resultados$/)![1]),
          e.corpo,
        ]),
      );
      for (const [idx, esperado] of ESPERADO.itens.entries()) {
        const corpo = porItem.get(idx + 1);
        expect(corpo).toMatchObject({
          niFornecedor: F.D.cnpj,
          nomeRazaoSocialFornecedor: F.D.razao_social,
          quantidadeHomologada: ITENS[idx].quantidade,
          porteFornecedorId: 3, // demais (não ME/EPP)
        });
        expect(corpo.valorUnitarioHomologado).toBeCloseTo(esperado.unitario, 2);
        expect(corpo.valorTotalHomologado).toBeCloseTo(esperado.total, 2);
      }
    });

    test('PNCP recebe o contrato do vencedor (art. 94) vinculado à compra', async () => {
      const [envio] = await aguardarPncp(
        'POST',
        new RegExp(`/orgaos/${orgao.cnpj}/contratos$`),
        1,
      );
      expect(envio).toBeDefined();
      const contrato = jsonDaParteMultipart(envio.corpo, 'contrato');
      expect(contrato).toMatchObject({
        niFornecedor: F.D.cnpj,
        processo: lic.numero_processo,
      });
      expect(contrato.valorGlobal).toBeCloseTo(ESPERADO.valorHomologado, 2);
      expect(contrato.numeroControlePNCPCompra).toMatch(
        new RegExp(`^${orgao.cnpj}-1-`),
      );
    });
  });
});
