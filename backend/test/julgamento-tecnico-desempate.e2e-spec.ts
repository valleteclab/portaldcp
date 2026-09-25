/**
 * ============================================================================
 * E3 — JULGAMENTO TÉCNICO (técnica e preço) e DESEMPATE (art. 60 + sorteio)
 * ============================================================================
 *
 * Base legal: Lei 14.133/2021 art. 36 (técnica e preço; técnica ≤ 70% — §2º;
 * notas técnicas avaliadas ANTES das propostas de preço), art. 37 (quesitos
 * por banca de no mínimo 3 membros — §1º), art. 56 §2º (técnica e preço não
 * usa o modo aberto isolado), art. 60 (desempate: disputa final, critérios,
 * preferências do §1º) e IN SEGES 73/2022 art. 28 §2º (sorteio em ato público).
 *
 *  A. Concorrência técnica e preço, modo FECHADO:
 *     - quesitos e peso (> 70% recusado); proposta técnica anexada no acolhimento;
 *     - sigilo: licitante não vê a proposta técnica do outro antes da publicação;
 *     - etapa de preços bloqueada até a publicação das notas;
 *     - banca: órgão B, fornecedor e servidor fora da banca não pontuam; banca
 *       de 2 não publica (mín. 3); notas por membro; publicação exige todas;
 *     - publicação: notas públicas; depois dela os licitantes veem as propostas técnicas;
 *     - preços lacrados → ranking pelo ÍNDICE (normalização documentada).
 *  B. Pregão menor preço com propostas IGUAIS e sem lances:
 *     - aceitação recusada enquanto o empate não é resolvido;
 *     - disputa final: sigilo das novas propostas, oferta ≥ valor recusada,
 *       estranho ao grupo recusado; empate persiste (mesmo valor novo);
 *     - critérios II..§1º IV registrados (não aplicáveis / sem efeito);
 *     - sorteio em ato público: órgão B e fornecedor não sorteiam; resultado
 *       com semente, entrada e algoritmo; qualquer participante confere;
 *     - o 1º do sorteio é quem a aceitação convoca; novas propostas viraram lances.
 */
import {
  AppE2E,
  FornecedorFixture,
  OrgaoFixture,
  UsuarioOrgaoFixture,
  abrirSessaoAgora,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  criarUsuarioOrgao,
  enviarProposta,
  levarAteFase,
} from './support';
import { desligarLimiteDeRequisicoes, pararTodosOsCrons } from './support/pregao';
import { prepararPregaoEmDisputa } from './support/isolamento';
import { convocarAceitacao } from './support/julgamento';
import {
  atribuirNotas,
  configurarTecnica,
  conferirSorteioDesempate,
  designarBanca,
  enviarDocumentoTecnico,
  iniciarDesempate,
  ofertaDisputaFinal,
  painelDesempate,
  publicarTecnica,
  sortearDesempate,
} from './support/julgamento-tecnico';
import { CriterioJulgamento, FaseLicitacao, ModalidadeLicitacao, ModoDisputa } from '../src/licitacoes/entities/licitacao.entity';
import { conferirSorteio, sortear } from '../src/julgamento/sorteio';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('E3 — julgamento técnico e desempate (art. 60)', () => {
  let ctx: AppE2E;
  const http = () => ctx.http();
  const q = (sql: string, p: any[] = []) => ctx.dataSource.query(sql, p);

  beforeAll(async () => {
    ctx = await criarApp();
    pararTodosOsCrons(ctx);
    desligarLimiteDeRequisicoes(ctx);
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // --------------------------------------------------------------------------
  describe('A. técnica e preço (concorrência, modo fechado)', () => {
    let orgao: OrgaoFixture;
    let orgaoB: OrgaoFixture;
    let F1: FornecedorFixture;
    let F2: FornecedorFixture;
    let F3: FornecedorFixture;
    let banca: UsuarioOrgaoFixture[];
    let foraDaBanca: UsuarioOrgaoFixture;
    let usuarioB: UsuarioOrgaoFixture;
    let licId: string;
    let itemId: string;
    let sessaoId: string;
    let q1: string;
    let q2: string;
    let docF1: string;

    beforeAll(async () => {
      orgao = await criarOrgao(ctx, { nome: 'Prefeitura Técnica E3' });
      orgaoB = await criarOrgao(ctx, { nome: 'Outra Prefeitura Técnica E3' });
      F1 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      F2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      F3 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      banca = [await criarUsuarioOrgao(ctx, orgao), await criarUsuarioOrgao(ctx, orgao), await criarUsuarioOrgao(ctx, orgao)];
      foraDaBanca = await criarUsuarioOrgao(ctx, orgao);
      usuarioB = await criarUsuarioOrgao(ctx, orgaoB);
      const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.CONCORRENCIA, {
        criterio: CriterioJulgamento.TECNICA_E_PRECO,
        modo_disputa: ModoDisputa.FECHADO,
        itens: [{ descricao: 'Consultoria técnica', quantidade: 1, valor_unitario_estimado: 1500 }],
      });
      licId = lic.id;
      itemId = lic.itens[0].id;
    });

    test('edital: peso da técnica > 70% → 400 (art. 36 §2º); quesitos gravados; configuração pública', async () => {
      const quesitos = [
        { descricao: 'Metodologia', peso: 2, notaMaxima: 10 },
        { descricao: 'Equipe técnica', peso: 1, notaMaxima: 10 },
      ];
      const acima = await configurarTecnica(ctx, orgao.token, licId, { pesoTecnica: 75, quesitos });
      expect(acima.status).toBe(400);
      expect(acima.body.message).toMatch(/70%/);
      expect([403, 404]).toContain((await configurarTecnica(ctx, orgaoB.token, licId, { pesoTecnica: 70, quesitos })).status);
      expect((await configurarTecnica(ctx, F1.token, licId, { pesoTecnica: 70, quesitos })).status).toBe(403);
      const ok = await configurarTecnica(ctx, orgao.token, licId, { pesoTecnica: 70, quesitos });
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ pesoTecnica: 70, pesoPreco: 30 });
      [q1, q2] = ok.body.quesitos.map((x: any) => x.id);
      const pub = await http().get(`/api/julgamento/licitacao/${licId}/tecnica/configuracao`).expect(200);
      expect(pub.body.quesitos).toHaveLength(2);
    });

    test('acolhimento: propostas + proposta técnica; sigilo entre licitantes antes da publicação', async () => {
      const lic = { id: licId, orgao, modalidade: ModalidadeLicitacao.CONCORRENCIA, numero_processo: '', itens: [{ id: itemId, numero_item: 1, quantidade: 1, valor_unitario_estimado: 1500 }] };
      await levarAteFase(ctx, lic as any, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      await enviarProposta(ctx, F1, lic as any, [1000]);
      await enviarProposta(ctx, F2, lic as any, [1250]);
      await enviarProposta(ctx, F3, lic as any, [1100]);
      const d1 = await enviarDocumentoTecnico(ctx, F1.token, licId);
      expect(d1.status).toBe(201);
      docF1 = d1.body.id;
      expect((await enviarDocumentoTecnico(ctx, F2.token, licId)).status).toBe(201);
      expect((await enviarDocumentoTecnico(ctx, orgao.token, licId)).status).toBe(403);

      const deF2 = await http().get(`/api/julgamento/licitacao/${licId}/tecnica/documentos`).set(bearer(F2.token)).expect(200);
      expect(deF2.body.documentos.map((d: any) => d.fornecedorId)).toEqual([F2.id]);
      expect((await http().get(`/api/julgamento/licitacao/${licId}/tecnica/documentos/${docF1}/arquivo`).set(bearer(F2.token))).status).toBe(404);
      expect((await http().get(`/api/julgamento/licitacao/${licId}/tecnica/documentos/${docF1}/arquivo`).set(bearer(F1.token))).status).toBe(200);
      // Órgão: só depois do acolhimento
      const orgaoAntes = await http().get(`/api/julgamento/licitacao/${licId}/tecnica/documentos`).set(bearer(orgao.token)).expect(200);
      expect(orgaoAntes.body.documentos).toEqual([]);
    });

    test('sessão aberta: etapa de preços bloqueada até a publicação das notas técnicas', async () => {
      await abrirSessaoAgora(ctx, { id: licId, orgao } as any);
      await http().put(`/api/licitacoes/${licId}/avancar-fase`).set(bearer(orgao.token)).send({}).expect(200);
      const props = await q(`SELECT id FROM propostas WHERE licitacao_id = $1`, [licId]);
      for (const p of props) await http().put(`/api/propostas/${p.id}/classificar`).set(bearer(orgao.token)).expect(200);
      const s = await http().post(`/api/sessao/${licId}`).set(bearer(orgao.token)).send({ pregoeiroId: orgao.id, pregoeiroNome: 'Agente E3' });
      expect(s.status).toBe(201);
      sessaoId = s.body.id;
      await http().put(`/api/sessao/${sessaoId}/iniciar`).set(bearer(orgao.token)).expect(200);
      const r = await http().post(`/api/disputa-v2/sessao/${sessaoId}/iniciar-itens`).set(bearer(orgao.token)).send({ itensIds: [itemId] });
      expect(r.status).toBe(409);
      expect(r.body.message).toMatch(/notas técnicas/);
      // Depois do acolhimento o órgão abre as propostas técnicas
      const docs = await http().get(`/api/julgamento/licitacao/${licId}/tecnica/documentos`).set(bearer(orgao.token)).expect(200);
      expect(docs.body.documentos).toHaveLength(2);
    });

    test('banca: isolamento (órgão B, fornecedor, servidor fora da banca); banca de 2 não publica', async () => {
      expect((await designarBanca(ctx, orgao.token, licId, [usuarioB.id])).status).toBe(400);
      expect([403, 404]).toContain((await designarBanca(ctx, orgaoB.token, licId, [usuarioB.id])).status);
      expect((await designarBanca(ctx, orgao.token, licId, [banca[0].id, banca[1].id])).status).toBe(200);
      const nota = [{ quesitoId: q1, fornecedorId: F1.id, nota: 5 }];
      expect([403, 404]).toContain((await atribuirNotas(ctx, usuarioB.token, licId, nota)).status);
      expect((await atribuirNotas(ctx, F1.token, licId, nota)).status).toBe(403);
      expect((await atribuirNotas(ctx, foraDaBanca.token, licId, nota)).status).toBe(403);
      expect((await atribuirNotas(ctx, banca[0].token, licId, [{ quesitoId: q1, fornecedorId: F1.id, nota: 11 }])).status).toBe(400);

      // 2 membros com todas as notas → ainda não publica (art. 37 §1º)
      const todas = (m: number) => [
        { quesitoId: q1, fornecedorId: F1.id, nota: 8 },
        { quesitoId: q2, fornecedorId: F1.id, nota: 6 },
        { quesitoId: q1, fornecedorId: F2.id, nota: 10 },
        { quesitoId: q2, fornecedorId: F2.id, nota: 10 },
        { quesitoId: q1, fornecedorId: F3.id, nota: 9 },
        { quesitoId: q2, fornecedorId: F3.id, nota: m === 0 ? 6 : 9 },
      ];
      expect((await atribuirNotas(ctx, banca[0].token, licId, todas(0))).status).toBe(200);
      expect((await atribuirNotas(ctx, banca[1].token, licId, todas(1))).status).toBe(200);
      const p2 = await publicarTecnica(ctx, orgao.token, licId);
      expect(p2.status).toBe(400);
      expect(p2.body.message).toMatch(/mínimo 3 membros/);

      // 3º membro: nota faltando → não publica; completa → publica
      expect((await designarBanca(ctx, orgao.token, licId, banca.map((b) => b.id))).status).toBe(200);
      expect((await atribuirNotas(ctx, banca[2].token, licId, todas(2).slice(0, 5))).status).toBe(200);
      const falta = await publicarTecnica(ctx, orgao.token, licId);
      expect(falta.status).toBe(400);
      expect(falta.body.message).toMatch(/faltam 1 nota/);
      // Quesitos não mudam depois da 1ª nota
      expect((await configurarTecnica(ctx, orgao.token, licId, { pesoTecnica: 60, quesitos: [{ descricao: 'x', peso: 1, notaMaxima: 10 }] })).status).toBe(409);
      expect((await atribuirNotas(ctx, banca[2].token, licId, todas(2).slice(5))).status).toBe(200);

      // Cada membro registrado
      const painel = await http().get(`/api/julgamento/licitacao/${licId}/tecnica/notas`).set(bearer(orgao.token)).expect(200);
      expect(painel.body.notas).toHaveLength(18);
      expect(new Set(painel.body.notas.map((n: any) => n.membroId)).size).toBe(3);
      expect(painel.body.podePublicar).toBe(true);
    });

    test('publicação: notas técnicas públicas (média dos membros, pesos); propostas técnicas liberadas', async () => {
      const antes = await http().get(`/api/julgamento/licitacao/${licId}/tecnica/resultado`).expect(200);
      expect(antes.body.publicado).toBe(false);
      const p = await publicarTecnica(ctx, orgao.token, licId);
      expect(p.status).toBe(201);
      const pub = await http().get(`/api/julgamento/licitacao/${licId}/tecnica/resultado`).expect(200);
      expect(pub.body.publicado).toBe(true);
      const nota = Object.fromEntries(pub.body.resultado.map((r: any) => [r.fornecedorId, r.notaTecnica]));
      // F1: (2·0,8 + 1·0,6)/3 = 73,3333 · F2: 100 · F3: q2 média (6+9+9)/3 = 8 → (1,8+0,8)/3 = 86,6667
      expect(nota).toEqual({ [F1.id]: 73.3333, [F2.id]: 100, [F3.id]: 86.6667 });
      expect((await publicarTecnica(ctx, orgao.token, licId)).status).toBe(409);
      expect((await atribuirNotas(ctx, banca[0].token, licId, [{ quesitoId: q1, fornecedorId: F1.id, nota: 10 }])).status).toBe(409);
      // Depois da publicação, o licitante vê a proposta técnica dos demais
      expect((await http().get(`/api/julgamento/licitacao/${licId}/tecnica/documentos/${docF1}/arquivo`).set(bearer(F2.token))).status).toBe(200);
      const evt = await q(`SELECT descricao FROM eventos_sessao WHERE sessao_id = $1 AND descricao LIKE 'Notas técnicas PUBLICADAS%'`, [sessaoId]);
      expect(evt).toHaveLength(1);
    });

    test('preços lacrados (fechado) → ranking pelo índice técnica e preço', async () => {
      await http().post(`/api/disputa-v2/sessao/${sessaoId}/iniciar-itens`).set(bearer(orgao.token)).send({ itensIds: [itemId] }).expect(201);
      const r = await http().get(`/api/julgamento/sessao/${sessaoId}/ranking`).set(bearer(orgao.token)).expect(200);
      const ranking = r.body.unidades[0].ranking;
      // IF = 0,7·NT/100 + 0,3·1000/preço → F2 0,94 · F3 0,8794 · F1 0,8133 (o mais barato fica em 3º)
      expect(ranking.map((e: any) => [e.fornecedorId, e.posicao, e.criterio.indiceFinal])).toEqual([
        [F2.id, 1, 0.94],
        [F3.id, 2, 0.8794],
        [F1.id, 3, 0.8133],
      ]);
      expect(ranking[0].criterio).toMatchObject({ tipo: 'TECNICA_E_PRECO', notaTecnica: 100, indiceTecnico: 1, indicePreco: 0.8, pesoTecnica: 70, pesoPreco: 30 });
      // A aceitação convoca o 1º pelo índice (não o de menor preço)
      const c = await convocarAceitacao(ctx, sessaoId, itemId, orgao.token);
      expect(c.status).toBe(201);
      expect(c.body.fornecedorId).toBe(F2.id);
    });
  });

  // --------------------------------------------------------------------------
  describe('B. empate → disputa final → persiste → sorteio auditável', () => {
    let orgao: OrgaoFixture;
    let orgaoB: OrgaoFixture;
    let F4: FornecedorFixture;
    let F5: FornecedorFixture;
    let F6: FornecedorFixture;
    let sessaoId: string;
    let itemId: string;
    let desempateId: string;

    beforeAll(async () => {
      orgao = await criarOrgao(ctx, { nome: 'Prefeitura Desempate E3' });
      orgaoB = await criarOrgao(ctx, { nome: 'Outra Prefeitura Desempate E3' });
      F4 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      F5 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      F6 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      const p = await prepararPregaoEmDisputa(
        ctx,
        orgao,
        [
          { fornecedor: F4, valores: [100] },
          { fornecedor: F5, valores: [100] },
          { fornecedor: F6, valores: [110] },
        ],
        { itens: [{ descricao: 'Resma de papel', quantidade: 1, valor_unitario_estimado: 120 }] },
      );
      sessaoId = p.sessaoId;
      itemId = p.lic.itens[0].id;
      await http().post(`/api/disputa-v2/sessao/${sessaoId}/encerrar-item/${itemId}`).set(bearer(orgao.token)).expect(201);
    });

    test('empate no 1º lugar: ranking marca pendente; aceitação recusada até o desempate', async () => {
      const r = await http().get(`/api/julgamento/sessao/${sessaoId}/ranking`).set(bearer(orgao.token)).expect(200);
      const [a, b, c] = r.body.unidades[0].ranking;
      expect([a.fornecedorId, b.fornecedorId].sort()).toEqual([F4.id, F5.id].sort());
      expect(a.empatado && b.empatado).toBe(true);
      expect(a.desempate).toMatchObject({ pendente: true, etapa: 'AGUARDANDO_DISPUTA_FINAL' });
      expect(c.fornecedorId).toBe(F6.id);
      const conv = await convocarAceitacao(ctx, sessaoId, itemId, orgao.token);
      expect(conv.status).toBe(409);
      expect(conv.body.message).toMatch(/art\. 60/);
    });

    test('disputa final: isolamento, sigilo, oferta que não melhora recusada', async () => {
      expect((await iniciarDesempate(ctx, sessaoId, itemId, F4.token, 5)).status).toBe(403);
      expect([403, 404]).toContain((await iniciarDesempate(ctx, sessaoId, itemId, orgaoB.token, 5)).status);
      expect((await iniciarDesempate(ctx, sessaoId, itemId, orgao.token, 0)).status).toBe(400);
      const ini = await iniciarDesempate(ctx, sessaoId, itemId, orgao.token, 5);
      expect(ini.status).toBe(201);
      desempateId = ini.body.id;
      expect(ini.body).toMatchObject({ status: 'EM_DISPUTA_FINAL', valorEmpatado: 100 });
      expect(ini.body.fornecedores.map((f: any) => f.fornecedorId).sort()).toEqual([F4.id, F5.id].sort());
      expect((await iniciarDesempate(ctx, sessaoId, itemId, orgao.token, 5)).status).toBe(409);

      // F6 (fora do grupo) não oferta; F4: valor igual ao atual recusado
      expect((await ofertaDisputaFinal(ctx, sessaoId, desempateId, F6.token, 90)).status).toBe(404);
      expect((await ofertaDisputaFinal(ctx, sessaoId, desempateId, F4.token, 100)).status).toBe(400);
      expect((await ofertaDisputaFinal(ctx, sessaoId, desempateId, F4.token, 95)).status).toBe(201);
      expect((await ofertaDisputaFinal(ctx, sessaoId, desempateId, F4.token, 94)).status).toBe(409);

      // Sigilo: F5 não vê a oferta de F4; F4 vê só a própria; o órgão só a contagem
      const deF5 = await painelDesempate(ctx, sessaoId, F5.token).expect(200);
      const d5 = deF5.body.desempates.find((d: any) => d.id === desempateId);
      expect(d5.convocadoDisputaFinal).toBe(true);
      expect(d5.disputaFinal.ofertas).toBeNull();
      expect(d5.disputaFinal.minhaOferta).toBeNull();
      const deF4 = await painelDesempate(ctx, sessaoId, F4.token).expect(200);
      expect(deF4.body.desempates[0].disputaFinal.minhaOferta.valor).toBe(95);
      const org = await painelDesempate(ctx, sessaoId, orgao.token).expect(200);
      const du = org.body.unidades[0].desempates[0];
      expect(du.disputaFinal).toMatchObject({ ofertasRecebidas: 1, ofertas: null });
      // Encerrar antes do prazo, sem todos → 409
      expect((await http().post(`/api/julgamento/sessao/${sessaoId}/desempate/${desempateId}/encerrar-disputa-final`).set(bearer(orgao.token))).status).toBe(409);
      // Sorteio antes da disputa final/critérios → 409
      expect((await sortearDesempate(ctx, sessaoId, desempateId, orgao.token)).status).toBe(409);
    });

    test('F5 oferta o MESMO valor → encerra (todos enviaram) → critérios sem efeito → aguardando sorteio', async () => {
      expect((await ofertaDisputaFinal(ctx, sessaoId, desempateId, F5.token, 95)).status).toBe(201);
      const org = await painelDesempate(ctx, sessaoId, orgao.token).expect(200);
      const d = org.body.unidades[0].desempates.find((x: any) => x.id === desempateId);
      expect(d.status).toBe('AGUARDANDO_SORTEIO');
      expect(d.disputaFinal.ofertas.map((o: any) => o.valor)).toEqual([95, 95]);
      const criterios = d.trilha.map((p: any) => [p.criterio, p.aplicavel, p.desempatou]);
      expect(criterios[0]).toEqual(['DISPUTA_FINAL', true, false]);
      expect(criterios).toContainEqual(['DESEMPENHO_CONTRATUAL', false, false]);
      expect(criterios).toContainEqual(['EQUIDADE_GENERO', false, false]);
      expect(criterios).toContainEqual(['EMPRESA_DO_ESTADO', true, false]);
      expect(d.trilha.find((p: any) => p.criterio === 'DESEMPENHO_CONTRATUAL').motivo).toMatch(/sem registro cadastral de desempenho/);
      // As novas propostas viraram lances DISPUTA_FINAL
      const lances = await q(`SELECT fornecedor_id, valor FROM lances WHERE item_id = $1 AND origem = 'DISPUTA_FINAL' AND cancelado = false`, [itemId]);
      expect(lances.map((l: any) => Number(l.valor))).toEqual([95, 95]);
      const r = await http().get(`/api/julgamento/sessao/${sessaoId}/ranking`).set(bearer(orgao.token)).expect(200);
      expect(r.body.unidades[0].ranking[0]).toMatchObject({ melhorValor: 95, desempate: { pendente: true, etapa: 'AGUARDANDO_SORTEIO' } });
    });

    test('sorteio em ato público: só o órgão dono; semente/entrada/algoritmo registrados e conferíveis por todos', async () => {
      expect((await sortearDesempate(ctx, sessaoId, desempateId, F4.token)).status).toBe(403);
      expect([403, 404]).toContain((await sortearDesempate(ctx, sessaoId, desempateId, orgaoB.token)).status);
      const s = await sortearDesempate(ctx, sessaoId, desempateId, orgao.token);
      expect(s.status).toBe(201);
      expect(s.body).toMatchObject({ status: 'RESOLVIDO', criterioDecisivo: 'SORTEIO' });
      const reg = s.body.sorteio.registros[0];
      expect(reg.algoritmo).toBe('SHA256-FY-v1');
      expect(reg.entrada).toContain(`unidade=${itemId}`);
      expect(reg.entrada).toContain(`candidatos=${[F4.id, F5.id].sort().join(',')}`);
      expect(reg.entrada).toContain(`ato=${new Date(s.body.sorteio.atoEm).toISOString()}`);
      // Qualquer um refaz a conta
      expect(conferirSorteio(reg)).toBe(true);
      expect(sortear(reg.entrada, [F5.id, F4.id])).toEqual(reg.ordem);
      const ordem = s.body.ordemFinal.map((o: any) => o.fornecedorId);
      expect(ordem).toEqual(reg.ordem);
      expect((await sortearDesempate(ctx, sessaoId, desempateId, orgao.token)).status).toBe(409);

      // Visível a todos os participantes (inclusive quem não empatou) e no registro da sala
      for (const f of [F4, F5, F6]) {
        const c = await conferirSorteioDesempate(ctx, sessaoId, desempateId, f.token);
        expect(c.status).toBe(200);
        expect(c.body.conferido).toBe(true);
      }
      expect([403, 404]).toContain((await conferirSorteioDesempate(ctx, sessaoId, desempateId, orgaoB.token)).status);
      const evt = await q(`SELECT descricao, dados_adicionais FROM eventos_sessao WHERE sessao_id = $1 AND descricao LIKE '%SORTEIO em ato público%realizado em%'`, [sessaoId]);
      expect(evt).toHaveLength(1);
      expect(evt[0].descricao).toContain(reg.semente);
      expect(evt[0].dados_adicionais.sorteio[0].ordem).toEqual(reg.ordem);

      // Ranking definitivo e a aceitação convoca o 1º do sorteio
      const r = await http().get(`/api/julgamento/sessao/${sessaoId}/ranking`).set(bearer(orgao.token)).expect(200);
      expect(r.body.unidades[0].ranking.slice(0, 2).map((e: any) => e.fornecedorId)).toEqual(ordem);
      expect(r.body.unidades[0].ranking[0].desempate).toMatchObject({ pendente: false, criterioDecisivo: 'SORTEIO' });
      const conv = await convocarAceitacao(ctx, sessaoId, itemId, orgao.token);
      expect(conv.status).toBe(201);
      expect(conv.body.fornecedorId).toBe(ordem[0]);
      expect(conv.body.limites.valorFinalTotal).toBe(95);
    });
  });
});
