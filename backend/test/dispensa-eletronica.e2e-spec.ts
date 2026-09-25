/**
 * ============================================================================
 * E2E — DISPENSA ELETRÔNICA (caracterização do fluxo em produção)
 * ============================================================================
 *
 * Plano de consolidação (docs/licitacao/PLANO-CONSOLIDACAO-LICITACAO.md), E0
 * item 2: "e2e da dispensa cobrindo o fluxo que já funciona — garante que a
 * consolidação não quebre o que está em produção". Este arquivo PRECISA ficar
 * verde em todas as etapas (E1…E10).
 *
 * Tudo pela API pública, na ordem das telas:
 *  - cockpit do órgão   frontend/src/app/orgao/processos/[id]/page.tsx
 *  - sala do fornecedor frontend/src/app/fornecedor/licitacoes/[id]/lances/page.tsx
 *
 *  1. Criação (2 itens) + instrução do art. 72 (gate de divulgação) + prazo
 *     mínimo de 3 dias úteis (art. 75 §3º).
 *  2. PNCP automático na divulgação (compra + itens + aviso de contratação direta).
 *  3. Propostas de ME, EPP e demais; sigilo antes do fim do acolhimento.
 *  4. Janela de lances (IN SEGES 67/2021): só reduz o PRÓPRIO valor; painel
 *     público anônimo; chat anônimo; prorrogação automática configurada.
 *  5. Julgamento (menor valor final por item), homologação → contratos
 *     automáticos por vencedor; PNCP resultado + contratos.
 *  6. Ata da dispensa em PDF.
 *
 * O segundo `describe` reúne os DEFEITOS CONHECIDOS (test.failing): o teste
 * descreve o comportamento correto e "passa falhando" enquanto o defeito
 * existir. Quando a etapa do plano corrigir, o Jest acusa — aí é só trocar
 * `test.failing` por `it`.
 *
 * Relógio: não há rota para encerrar a janela de lances (mínimo 5 min). Os
 * pontos que dependem da passagem do tempo usam `moverFimDaJanela`
 * (test/support/dispensa.ts), que altera SÓ `dispensa_lances_fim`.
 */
import { Socket } from 'socket.io-client';
import {
  AppE2E,
  FornecedorFixture,
  LicitacaoFixture,
  OrgaoFixture,
  abrirSessaoAgora,
  aguardarEvento,
  buscarLicitacao,
  conectarSocket,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  enviarProposta,
  fecharSockets,
  levarAteFase,
  pncpMock,
} from './support';
import {
  DOCUMENTOS_ART_72,
  abrirJanelaLances,
  aguardar,
  corpoComoTexto,
  corpoDivulgacao,
  criarDispensaComPropostas,
  criarDocumentoInstrucao,
  darLance,
  fimPropostasSugerido,
  headerCapturado,
  jsonDaParte,
  moverFimDaJanela,
  painelPublico,
  somarDiasUteis,
  vincularOrgaoPncp,
} from './support/dispensa';
import { FaseLicitacao, ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const MIN = 60_000;

/** supertest: corpo binário (PDF) como Buffer. */
function lerBinario(res: any, cb: (err: Error | null, body: Buffer) => void) {
  const partes: Buffer[] = [];
  res.on('data', (c: Buffer) => partes.push(c));
  res.on('end', () => cb(null, Buffer.concat(partes)));
}

// ============================================================================
// 1. FLUXO EM PRODUÇÃO (tem de passar)
// ============================================================================

describe('Dispensa eletrônica — fluxo em produção (caracterização)', () => {
  let ctx: AppE2E;
  let orgao: OrgaoFixture;
  let cnpjOrgao: string;
  let lic: LicitacaoFixture;
  let item1: string;
  let item2: string;

  let me: FornecedorFixture;
  let epp: FornecedorFixture;
  let demais: FornecedorFixture;
  let semProposta: FornecedorFixture;

  let sala: Socket;

  beforeAll(async () => {
    ctx = await criarApp();
    orgao = await criarOrgao(ctx, { nome: 'Prefeitura Dispensa E2E (Órgão A)' });
    cnpjOrgao = orgao.cnpj.replace(/\D/g, '');
    // Órgão vinculado à credencial PNCP da plataforma (Configurações > PNCP)
    await vincularOrgaoPncp(ctx, orgao, '1');
    pncpMock.limpar();
  });

  afterAll(async () => {
    fecharSockets();
    await ctx?.fechar();
  });

  // --------------------------------------------------------------------------
  describe('Bloco 1 — criação e instrução do art. 72', () => {
    it('cria a dispensa com 2 itens na fase de planejamento', async () => {
      lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.DISPENSA_ELETRONICA, {
        itens: [
          { descricao: 'Resma de papel A4', quantidade: 10, valor_unitario_estimado: 100 },
          { descricao: 'Caneta esferográfica azul', quantidade: 20, valor_unitario_estimado: 50 },
        ],
      });
      [item1, item2] = lic.itens.map((i) => i.id);

      const atual = await buscarLicitacao(ctx, lic);
      expect(atual.modalidade).toBe(ModalidadeLicitacao.DISPENSA_ELETRONICA);
      expect(atual.fase).toBe(FaseLicitacao.PLANEJAMENTO);
      expect(atual.itens).toHaveLength(2);
    });

    it('não divulga fora da fase APROVACAO_INTERNA', async () => {
      const r = await ctx
        .http()
        .put(`/api/licitacoes/${lic.id}/publicar-edital`)
        .set(bearer(orgao.token))
        .send(corpoDivulgacao(fimPropostasSugerido()));
      // E1: ato fora da fase = conflito de estado (409), não mais 400
      expect(r.status).toBe(409);
      expect(r.body.message).toMatch(/aprovada internamente/);
    });

    it('sem instrução, o checklist aponta DFD, estimativa e autorização e a fase interna não conclui', async () => {
      const inst = await ctx.http().get(`/api/fase-interna/${lic.id}/instrucao`).set(bearer(orgao.token)).expect(200);
      expect(inst.body.contratacao_direta).toBe(true);
      expect(inst.body.pode_divulgar).toBe(false);
      expect(inst.body.pendentes).toHaveLength(3);
      expect(inst.body.pendentes.join(' | ')).toMatch(/Formaliza.*demanda/);
      expect(inst.body.pendentes.join(' | ')).toMatch(/Estimativa de despesa/);
      expect(inst.body.pendentes.join(' | ')).toMatch(/Autoriza/);

      // "Divulgar aviso" do cockpit chama primeiro o avanço da fase interna
      const av = await ctx.http().put(`/api/fase-interna/${lic.id}/avancar`).set(bearer(orgao.token));
      expect(av.status).toBe(400);
      expect(av.body.message).toMatch(/Art\. 72/);
    });

    it('gate do publicar-edital: em APROVACAO_INTERNA sem instrução completa, recusa a divulgação', async () => {
      // Outra dispensa levada à APROVACAO_INTERNA pelo avanço genérico (sem a
      // fase-interna) — prova que o gate está no próprio publicar-edital.
      const outra = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      await levarAteFase(ctx, outra, FaseLicitacao.APROVACAO_INTERNA);

      const semNada = await ctx
        .http()
        .put(`/api/licitacoes/${outra.id}/publicar-edital`)
        .set(bearer(orgao.token))
        .send(corpoDivulgacao(fimPropostasSugerido()));
      expect(semNada.status).toBe(400);
      expect(semNada.body.message).toMatch(/Instrução do processo incompleta \(Art\. 72/);

      // Só o DFD: continua recusando, agora sem o DFD na lista de pendências
      await criarDocumentoInstrucao(ctx, outra, DOCUMENTOS_ART_72[0][0], DOCUMENTOS_ART_72[0][1]);
      const soDfd = await ctx
        .http()
        .put(`/api/licitacoes/${outra.id}/publicar-edital`)
        .set(bearer(orgao.token))
        .send(corpoDivulgacao(fimPropostasSugerido()));
      expect(soDfd.status).toBe(400);
      expect(soDfd.body.message).not.toMatch(/Formaliza/);
      expect(soDfd.body.message).toMatch(/Estimativa de despesa/);
      expect(soDfd.body.message).toMatch(/Autoriza/);

      const depois = await buscarLicitacao(ctx, outra);
      expect(depois.fase).toBe(FaseLicitacao.APROVACAO_INTERNA);
    });

    it('com DFD + estimativa + autorização, a instrução libera e a fase interna conclui', async () => {
      for (const [tipo, titulo] of DOCUMENTOS_ART_72) {
        await criarDocumentoInstrucao(ctx, lic, tipo, titulo);
      }
      const inst = await ctx.http().get(`/api/fase-interna/${lic.id}/instrucao`).set(bearer(orgao.token)).expect(200);
      expect(inst.body.pode_divulgar).toBe(true);
      expect(inst.body.pendentes).toEqual([]);

      const av = await ctx.http().put(`/api/fase-interna/${lic.id}/avancar`).set(bearer(orgao.token)).expect(200);
      expect(av.body.fase).toBe(FaseLicitacao.APROVACAO_INTERNA);
      expect(av.body.fase_interna_concluida).toBe(true);
    });

    it('recusa prazo de propostas menor que 3 dias úteis (art. 75 §3º)', async () => {
      const agora = new Date();
      const curtos = [
        new Date(agora.getTime() + 24 * 60 * MIN), // 1 dia corrido
        new Date(somarDiasUteis(agora, 2).getTime() + 60 * MIN), // 2 dias úteis + 1 h
      ];
      for (const fim of curtos) {
        const r = await ctx
          .http()
          .put(`/api/licitacoes/${lic.id}/publicar-edital`)
          .set(bearer(orgao.token))
          .send(corpoDivulgacao(fim, agora));
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/3 dias úteis/);
      }
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.APROVACAO_INTERNA);
    });

    it('divulga com o prazo mínimo e publica compra + itens + aviso no PNCP do órgão da licitação', async () => {
      pncpMock.limpar();
      const r = await ctx
        .http()
        .put(`/api/licitacoes/${lic.id}/publicar-edital`)
        .set(bearer(orgao.token))
        .send(corpoDivulgacao(fimPropostasSugerido()))
        .expect(200);
      expect(r.body.fase).toBe(FaseLicitacao.PUBLICADO);
      expect(r.body.fase_interna_concluida).toBe(true);

      // Envio ao PNCP é fire-and-forget: espera compra e itens chegarem ao mock
      const [itens] = await aguardar(
        () => {
          const l = pncpMock.filtrar('POST', /\/compras\/\d+\/\d+\/itens$/);
          return l.length ? l : null;
        },
        { descricao: 'itens da compra no PNCP' },
      );
      const compras = pncpMock.filtrar('POST', /\/compras$/);
      expect(compras).toHaveLength(1);
      const compra = compras[0];

      // CNPJ do órgão DA LICITAÇÃO (não o da plataforma)
      expect(compra.caminho).toMatch(new RegExp(`/orgaos/${cnpjOrgao}/compras$`));
      expect(itens.caminho).toMatch(new RegExp(`/orgaos/${cnpjOrgao}/compras/\\d+/\\d+/itens$`));

      // Documento: Aviso de Contratação Direta (tipo 1) em PDF
      expect(headerCapturado(compra, 'Tipo-Documento-Id')).toBe('1');
      expect(headerCapturado(compra, 'Titulo-Documento')).toBe('Aviso de Contratacao Direta');
      const texto = corpoComoTexto(compra.corpo);
      expect(texto).toContain('filename="aviso-contratacao-direta.pdf"');
      expect(texto).toContain('%PDF');

      const dto = jsonDaParte(compra.corpo, 'compra');
      expect(dto).toMatchObject({
        modalidadeId: 8, // Dispensa (tabela PNCP)
        amparoLegalId: 19, // Art. 75, II (compras/serviços)
        tipoInstrumentoConvocatorioId: 2, // Aviso de Contratação Direta
        modoDisputaId: 4, // Dispensa com disputa
        numeroProcesso: lic.numero_processo,
        codigoUnidadeCompradora: '1',
        srp: false,
      });
      expect(dto.itensCompra).toHaveLength(2);
      expect(dto.itensCompra.map((i: any) => [i.numeroItem, i.quantidade, i.valorUnitarioEstimado])).toEqual([
        [1, 10, 100],
        [2, 20, 50],
      ]);

      expect(Array.isArray(itens.corpo)).toBe(true);
      expect(itens.corpo).toHaveLength(2);

      // Registro visível no cockpit (pncp_sync)
      const pc = await ctx.http().get(`/api/licitacoes/${lic.id}/processo-completo`).set(bearer(orgao.token)).expect(200);
      expect(pc.body.pncp).toEqual(
        expect.arrayContaining([expect.objectContaining({ tipo: 'COMPRA', status: 'ENVIADO' })]),
      );
    });
  });

  // --------------------------------------------------------------------------
  describe('Bloco 2 — propostas e sigilo', () => {
    it('ME, EPP e demais enviam proposta para os 2 itens', async () => {
      me = await criarFornecedor(ctx, { porte: 'ME', razao_social: `ME Papelaria E2E ${Date.now()}` });
      epp = await criarFornecedor(ctx, { porte: 'EPP', razao_social: `EPP Suprimentos E2E ${Date.now()}` });
      demais = await criarFornecedor(ctx, { porte: 'DEMAIS', razao_social: `Grande Distribuidora E2E ${Date.now()}` });
      semProposta = await criarFornecedor(ctx, { porte: 'ME' });

      // valores unitários [item 1, item 2]
      const pMe = await enviarProposta(ctx, me, lic, [95, 48], { extras: { prazo_entrega_dias: 45 } });
      const pEpp = await enviarProposta(ctx, epp, lic, [92, 49], { extras: { prazo_entrega_dias: 20 } });
      const pDemais = await enviarProposta(ctx, demais, lic, [90, 47]);
      expect([pMe.status, pEpp.status, pDemais.status]).toEqual(['ENVIADA', 'ENVIADA', 'ENVIADA']);
    });

    it('sigilo: a lista pública mostra só a existência das propostas', async () => {
      const r = await ctx.http().get(`/api/propostas/licitacao/${lic.id}`).expect(200);
      expect(r.body).toHaveLength(3);
      for (const p of r.body) {
        expect(p).toMatchObject({ id: null, fornecedor: null, valor_total_proposta: null, itens_proposta: [], sigilo: true });
      }
      const json = JSON.stringify(r.body);
      for (const f of [me, epp, demais]) {
        expect(json).not.toContain(f.id);
        expect(json).not.toContain(f.razao_social);
      }
    });

    it('sigilo: o ranking público por item vem vazio', async () => {
      for (const item of [item1, item2]) {
        const r = await ctx.http().get(`/api/propostas/ranking/item/${item}`).expect(200);
        expect(r.body).toEqual([]);
      }
    });

    it('sigilo: o cockpit do órgão vê quem propôs, mas não os valores', async () => {
      const pc = await ctx.http().get(`/api/licitacoes/${lic.id}/processo-completo`).set(bearer(orgao.token)).expect(200);
      expect(pc.body.propostas_em_sigilo).toBe(true);
      expect(pc.body.propostas).toHaveLength(3);
      for (const p of pc.body.propostas) {
        expect(p.valor_total_proposta).toBeNull();
        expect(p.sigilo).toBe(true);
      }
      expect(pc.body.propostas.map((p: any) => p.razao_social).sort()).toEqual(
        [me.razao_social, epp.razao_social, demais.razao_social].sort(),
      );
    });

    it('com o acolhimento aberto, julgamento e fase de lances são recusados', async () => {
      const j = await ctx.http().post(`/api/licitacoes/${lic.id}/julgar-dispensa`).set(bearer(orgao.token));
      expect(j.status).toBe(400);
      expect(j.body.message).toMatch(/prazo de recebimento de propostas ainda está aberto/);

      const l = await abrirJanelaLances(ctx, lic, { duracao_minutos: 30, prorrogacao_minutos: 2 });
      expect(l.status).toBe(400);
      expect(l.body.message).toMatch(/após o fim do recebimento de propostas/);
    });

    it('a ata só fica disponível depois do julgamento', async () => {
      const r = await ctx.http().get(`/api/licitacoes/${lic.id}/dispensa/ata`);
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/após o julgamento/);
    });

    it('encerrado o acolhimento, os valores ficam visíveis e ordenados por menor preço', async () => {
      await abrirSessaoAgora(ctx, lic);

      const rk = await ctx.http().get(`/api/propostas/ranking/item/${item1}`).expect(200);
      expect(rk.body.map((x: any) => Number(x.valor_unitario))).toEqual([90, 92, 95]);
      expect(rk.body.map((x: any) => x.posicao)).toEqual([1, 2, 3]);

      const lista = await ctx.http().get(`/api/propostas/licitacao/${lic.id}`).expect(200);
      expect(lista.body.every((p: any) => p.sigilo === undefined)).toBe(true);
      expect(lista.body.map((p: any) => Number(p.valor_total_proposta))).toEqual([1840, 1900, 1910]);

      const pc = await ctx.http().get(`/api/licitacoes/${lic.id}/processo-completo`).set(bearer(orgao.token)).expect(200);
      expect(pc.body.propostas_em_sigilo).toBe(false);
      expect(pc.body.propostas.map((p: any) => Number(p.valor_total_proposta))).toEqual([1840, 1900, 1910]);
    });

    it('depois da abertura, proposta nova é recusada', async () => {
      const r = await ctx
        .http()
        .post('/api/propostas')
        .set(bearer(semProposta.token))
        .send({
          licitacao_id: lic.id,
          fornecedor_id: semProposta.id,
          declaracao_termos: true,
          declaracao_integridade: true,
          declaracao_inexistencia_fatos: true,
          declaracao_menor: true,
          itens: [{ item_licitacao_id: item1, valor_unitario: 50 }],
        });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/após a abertura da sessão/);
    });
  });

  // --------------------------------------------------------------------------
  describe('Bloco 3 — janela de lances (IN SEGES 67/2021)', () => {
    it('o órgão abre a janela (30 min, prorrogação de 2 min) e a regra fica registrada no chat', async () => {
      // E2 item 8: canal único — o feed da dispensa é a sala pública da licitação no /disputa-v2
      // (antes: namespace /dispensa + 'entrar_sala'). Mesmos eventos: sala_ok, janela, painel_atualizado, chat.
      sala = await conectarSocket(ctx, '/disputa-v2');
      const ok = aguardarEvento(sala, 'sala_ok');
      sala.emit('entrar_licitacao', { licitacaoId: lic.id });
      await ok;

      const janela = aguardarEvento(sala, 'janela');
      const antes = Date.now();
      const r = await abrirJanelaLances(ctx, lic, { duracao_minutos: 30, prorrogacao_minutos: 2 });
      expect(r.status).toBe(201);
      expect(r.body.duracao_minutos).toBe(30);
      expect(r.body.prorrogacao_minutos).toBe(2);
      const fim = new Date(r.body.dispensa_lances_fim).getTime();
      expect(fim).toBeGreaterThanOrEqual(antes + 30 * MIN - 2_000);
      expect(fim).toBeLessThanOrEqual(Date.now() + 30 * MIN + 2_000);

      const ev = await janela;
      expect(new Date(ev.dispensa_lances_fim).getTime()).toBe(fim);

      const msgs = await ctx.http().get(`/api/licitacoes/${lic.id}/dispensa/mensagens`).expect(200);
      const sistema = msgs.body.filter((m: any) => m.autor_nome === 'Sistema');
      expect(sistema).toHaveLength(1);
      expect(sistema[0].mensagem).toMatch(/últimos 2 min prorroga automaticamente/);
    });

    it('não abre uma segunda janela com outra aberta', async () => {
      const r = await abrirJanelaLances(ctx, lic, { duracao_minutos: 30 });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/Já existe uma fase de lances aberta/);
    });

    it('durante a janela, lista e ranking públicos voltam a ser sigilosos', async () => {
      const rk = await ctx.http().get(`/api/propostas/ranking/item/${item1}`).expect(200);
      expect(rk.body).toEqual([]);
      const lista = await ctx.http().get(`/api/propostas/licitacao/${lic.id}`).expect(200);
      expect(lista.body.every((p: any) => p.sigilo === true && p.valor_total_proposta === null)).toBe(true);
    });

    it('o fornecedor reduz o PRÓPRIO valor — mesmo que continue acima do melhor do item', async () => {
      const push = aguardarEvento(sala, 'painel_atualizado');
      const r = await darLance(ctx, me, lic, item1, 91);
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ ok: true, valor_unitario: 91, seu_valor_anterior: 95 });
      // faltam ~30 min > 2 min: sem prorrogação
      expect(r.body.prorrogada).toBeUndefined();

      // push em tempo real, anônimo: menor valor do item (90 da proposta do "demais")
      const ev = await push;
      expect(ev).toMatchObject({ item_licitacao_id: item1, menor_valor: 90, total_lances: 1 });
      expect(JSON.stringify(ev)).not.toContain(me.id);
    });

    it('recusa lance igual ou maior que o próprio valor atual', async () => {
      const igual = await darLance(ctx, me, lic, item1, 91);
      expect(igual.status).toBe(400);
      expect(igual.body.message).toMatch(/menor que o seu valor atual/);

      const maior = await darLance(ctx, me, lic, item1, 93);
      expect(maior.status).toBe(400);

      // EPP tem 92 no item 1: 92 não é redução
      const eppIgual = await darLance(ctx, epp, lic, item1, 92);
      expect(eppIgual.status).toBe(400);
    });

    it('recusa lance de quem não tem proposta e lance com valor inválido', async () => {
      const sem = await darLance(ctx, semProposta, lic, item1, 10);
      expect(sem.status).toBe(400);
      expect(sem.body.message).toMatch(/Apenas fornecedores com proposta válida/);

      const zero = await darLance(ctx, me, lic, item1, 0);
      expect(zero.status).toBe(400);
      expect(zero.body.message).toMatch(/Valor de lance inválido/);
    });

    it('o painel público é anônimo e mostra o menor valor atual por item', async () => {
      expect((await darLance(ctx, me, lic, item1, 88)).status).toBe(201);
      expect((await darLance(ctx, demais, lic, item1, 89)).status).toBe(201);

      const p = await painelPublico(ctx, lic).expect(200);
      expect(p.body.aberta).toBe(true);
      expect(typeof p.body.server_time).toBe('string');
      const [i1, i2] = p.body.itens;
      expect(i1).toMatchObject({ item_licitacao_id: item1, numero_item: 1, menor_valor: 88, total_lances: 3 });
      expect(i2).toMatchObject({ item_licitacao_id: item2, numero_item: 2, menor_valor: 47, total_lances: 0 });
      expect(i1.meu_valor).toBeUndefined();

      const json = JSON.stringify(p.body);
      for (const f of [me, epp, demais]) {
        expect(json).not.toContain(f.id);
        expect(json).not.toContain(f.razao_social);
        expect(json).not.toContain(f.cnpj);
      }

      // Na sala do fornecedor (logado), vem também o valor atual DELE — pelo token
      const meu = await painelPublico(ctx, lic).set(bearer(demais.token)).expect(200);
      expect(meu.body.itens.map((i: any) => i.meu_valor)).toEqual([89, 47]);
      // ...e o de mais ninguém: ?fornecedorId= de outro não revela nada
      const outro = await painelPublico(ctx, lic, me.id).set(bearer(demais.token)).expect(200);
      expect(outro.body.itens.every((i: any) => i.meu_valor === undefined)).toBe(true);
    });

    it('chat durante a janela: autoria do fornecedor fica anônima (REST e socket)', async () => {
      const push = aguardarEvento(sala, 'chat');
      const r = await ctx
        .http()
        .post(`/api/licitacoes/${lic.id}/dispensa/mensagens`)
        .set(bearer(me.token))
        .send({ mensagem: 'Pergunta: o frete está incluso?' }); // autoria vem do token
      expect(r.status).toBe(201);
      const ev = await push;
      // E2 item 10: anonimização única da sala (código 'Fornecedor A'), não mais o rótulo genérico 'Fornecedor'
      expect(ev).toMatchObject({ autor_tipo: 'FORNECEDOR', mensagem: 'Pergunta: o frete está incluso?' });
      expect(ev.autor_nome).toMatch(/^Fornecedor [A-Z]+$/);
      expect(ev.fornecedor_id).toBeUndefined();
      expect(JSON.stringify(ev)).not.toContain(me.razao_social);

      await ctx
        .http()
        .post(`/api/licitacoes/${lic.id}/dispensa/mensagens`)
        .set(bearer(orgao.token))
        .send({ autor_nome: 'Agente de contratação', mensagem: 'Sim, CIF.' })
        .expect(201);

      const msgs = await ctx.http().get(`/api/licitacoes/${lic.id}/dispensa/mensagens`).expect(200);
      const doFornecedor = msgs.body.find((m: any) => m.autor_tipo === 'FORNECEDOR');
      // E2 item 10: o mesmo código anônimo da sala ('Fornecedor A') — antes numerado por ordem de mensagem ('Fornecedor 1')
      expect(doFornecedor.autor_nome).toMatch(/^Fornecedor [A-Z]+$/);
      expect(doFornecedor.autor_nome).toBe(ev.autor_nome);
      expect(doFornecedor.fornecedor_id).toBeUndefined();
      expect(msgs.body.find((m: any) => m.autor_tipo === 'ORGAO' && m.autor_nome === 'Agente de contratação')).toBeTruthy();
      expect(JSON.stringify(msgs.body)).not.toContain(me.razao_social);
    });

    it('fornecedor sem proposta válida não fala no chat', async () => {
      const r = await ctx
        .http()
        .post(`/api/licitacoes/${lic.id}/dispensa/mensagens`)
        .set(bearer(semProposta.token))
        .send({ mensagem: 'Oi' });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/Apenas fornecedores com proposta válida/);
    });

    it('lance nos últimos 2 minutos prorroga a janela por mais 2 minutos', async () => {
      // Relógio: a janela passa a terminar em 60 s (ver moverFimDaJanela)
      await moverFimDaJanela(ctx, lic.id, new Date(Date.now() + 60_000));

      const antes = Date.now();
      const r = await darLance(ctx, epp, lic, item2, 46);
      expect(r.status).toBe(201);
      expect(r.body.prorrogada).toBe(true);
      const novoFim = new Date(r.body.dispensa_lances_fim).getTime();
      expect(novoFim).toBeGreaterThanOrEqual(antes + 2 * MIN - 1_000);
      expect(novoFim).toBeLessThanOrEqual(Date.now() + 2 * MIN + 1_000);

      const p = await painelPublico(ctx, lic).expect(200);
      expect(p.body.aberta).toBe(true);
      // a coluna é timestamp sem fração de segundo garantida: compara no segundo
      expect(Math.abs(new Date(p.body.dispensa_lances_fim).getTime() - novoFim)).toBeLessThan(1_000);
      expect(p.body.itens[1]).toMatchObject({ menor_valor: 46, total_lances: 1 });

      const msgs = await ctx.http().get(`/api/licitacoes/${lic.id}/dispensa/mensagens`).expect(200);
      expect(msgs.body.some((m: any) => m.autor_nome === 'Sistema' && /prorrogada automaticamente/.test(m.mensagem))).toBe(true);
    });

    it('com a janela aberta, o julgamento é recusado', async () => {
      const r = await ctx.http().post(`/api/licitacoes/${lic.id}/julgar-dispensa`).set(bearer(orgao.token));
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/fase de lances está aberta/);
    });

    it('encerrada a janela, lances são recusados e o chat revela a autoria', async () => {
      // Relógio: fim da janela alcançado
      await moverFimDaJanela(ctx, lic.id, new Date(Date.now() - 1_000));

      const r = await darLance(ctx, me, lic, item1, 80);
      // E2: lance fora da janela é conflito de ESTADO (409), como no motor único (antes 400)
      expect(r.status).toBe(409);
      expect(r.body.message).toMatch(/não está aberta/);

      const p = await painelPublico(ctx, lic).expect(200);
      expect(p.body.aberta).toBe(false);

      const msgs = await ctx.http().get(`/api/licitacoes/${lic.id}/dispensa/mensagens`).expect(200);
      const doFornecedor = msgs.body.find((m: any) => m.autor_tipo === 'FORNECEDOR');
      expect(doFornecedor.autor_nome).toBe(me.razao_social);
      expect(doFornecedor.fornecedor_id).toBe(me.id);
    });
  });

  // --------------------------------------------------------------------------
  describe('Bloco 4 — julgamento, homologação, contratos e PNCP', () => {
    it('julga pelo menor valor final por item (proposta ou lance do próprio fornecedor)', async () => {
      const r = await ctx.http().post(`/api/licitacoes/${lic.id}/julgar-dispensa`).set(bearer(orgao.token));
      expect(r.status).toBe(201);
      expect(r.body.fase).toBe(FaseLicitacao.ADJUDICACAO);
      expect(r.body.itens_sem_proposta).toEqual([]);
      const adj = [...r.body.adjudicados].sort((a: any, b: any) => a.item - b.item);
      expect(adj).toEqual([
        { item: 1, fornecedor: me.razao_social, valor_unitario: 88, valor_total: 880 }, // lance 88 (proposta 95)
        { item: 2, fornecedor: epp.razao_social, valor_unitario: 46, valor_total: 920 }, // lance 46 (proposta 49)
      ]);

      const pc = await ctx.http().get(`/api/licitacoes/${lic.id}/processo-completo`).set(bearer(orgao.token)).expect(200);
      const itens = pc.body.itens;
      expect(itens.map((i: any) => [i.status, i.fornecedor_vencedor_id, Number(i.valor_unitario_homologado), Number(i.valor_total_homologado)])).toEqual([
        ['ADJUDICADO', me.id, 88, 880],
        ['ADJUDICADO', epp.id, 46, 920],
      ]);
      expect(pc.body.checklist.resultado_registrado).toBe(true);

      const lista = await ctx.http().get(`/api/propostas/licitacao/${lic.id}`).expect(200);
      const statusPor = Object.fromEntries(lista.body.map((p: any) => [p.fornecedor_id, p.status]));
      expect(statusPor).toEqual({ [me.id]: 'VENCEDORA', [epp.id]: 'VENCEDORA', [demais.id]: 'CLASSIFICADA' });
    });

    it('ata da dispensa em PDF (pública)', async () => {
      const r = await ctx.http().get(`/api/licitacoes/${lic.id}/dispensa/ata`).buffer(true).parse(lerBinario).expect(200);
      expect(r.headers['content-type']).toMatch(/application\/pdf/);
      const pdf = r.body as Buffer;
      expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(pdf.length).toBeGreaterThan(1_000);
    });

    it('homologa e gera 1 contrato por fornecedor vencedor', async () => {
      pncpMock.limpar();
      // O cockpit envia a soma dos valores totais homologados dos itens
      const r = await ctx
        .http()
        .put(`/api/licitacoes/${lic.id}/homologar`)
        .set(bearer(orgao.token))
        .send({ valor_homologado: 1800 })
        .expect(200);
      expect(r.body.fase).toBe(FaseLicitacao.HOMOLOGACAO);

      const pc = await ctx.http().get(`/api/licitacoes/${lic.id}/processo-completo`).set(bearer(orgao.token)).expect(200);
      expect(Number(pc.body.licitacao.valor_homologado)).toBe(1800);
      expect(pc.body.licitacao.data_homologacao).toBeTruthy();
      expect(pc.body.checklist).toMatchObject({ homologado: true, contrato_gerado: true });

      const contratos = pc.body.contratos;
      expect(contratos).toHaveLength(2);
      const porFornecedor = Object.fromEntries(contratos.map((c: any) => [c.fornecedor_razao_social, Number(c.valor_global)]));
      expect(porFornecedor).toEqual({ [me.razao_social]: 880, [epp.razao_social]: 920 });
      for (const c of contratos) expect(c.numero_contrato).toBeTruthy();
    });

    it('PNCP: resultado por item com vencedor, valores e porte', async () => {
      const resultados = await aguardar(
        () => {
          const l = pncpMock.filtrar('POST', /\/itens\/\d+\/resultados$/);
          return l.length >= 2 ? l : null;
        },
        { descricao: 'resultados por item no PNCP' },
      );
      expect(resultados).toHaveLength(2);
      const porItem = (n: number) => resultados.find((x) => x.caminho.endsWith(`/itens/${n}/resultados`))!;
      for (const x of resultados) {
        expect(x.caminho).toMatch(new RegExp(`/orgaos/${cnpjOrgao}/compras/\\d+/\\d+/itens/\\d/resultados$`));
      }
      expect(porItem(1).corpo).toMatchObject({
        niFornecedor: me.cnpj.replace(/\D/g, ''),
        nomeRazaoSocialFornecedor: me.razao_social,
        quantidadeHomologada: 10,
        valorUnitarioHomologado: 88,
        valorTotalHomologado: 880,
        porteFornecedorId: 1, // ME
        tipoPessoaId: 'PJ',
      });
      expect(porItem(2).corpo).toMatchObject({
        niFornecedor: epp.cnpj.replace(/\D/g, ''),
        quantidadeHomologada: 20,
        valorUnitarioHomologado: 46,
        valorTotalHomologado: 920,
        porteFornecedorId: 2, // EPP
      });
    });

    it('PNCP: contratos gerados vão vinculados à compra publicada', async () => {
      // Hoje o envio acontece NA homologação (antes da assinatura) — ver o
      // DEFEITO CONHECIDO logo abaixo. Quando o E7 mover o envio para depois
      // da assinatura, este teste passa a assinar os contratos antes de conferir.
      const envios = await aguardar(
        () => {
          const l = pncpMock.filtrar('POST', /\/contratos$/);
          return l.length >= 2 ? l : null;
        },
        { descricao: 'contratos no PNCP' },
      );
      expect(envios).toHaveLength(2);
      const dtos = envios.map((e) => {
        expect(e.caminho).toMatch(new RegExp(`/orgaos/${cnpjOrgao}/contratos$`));
        return jsonDaParte(e.corpo, 'contrato');
      });
      for (const d of dtos) {
        expect(d.cnpjCompra).toBe(cnpjOrgao);
        expect(d.numeroControlePNCPCompra).toMatch(new RegExp(`^${cnpjOrgao}-1-\\d{6}/\\d{4}$`));
        expect(d.processo).toBe(lic.numero_processo);
        expect(d.categoriaProcessoId).toBe(2); // Compras
      }
      const porNi = Object.fromEntries(dtos.map((d) => [d.niFornecedor, Number(d.valorGlobal)]));
      expect(porNi).toEqual({ [me.cnpj.replace(/\D/g, '')]: 880, [epp.cnpj.replace(/\D/g, '')]: 920 });
    });

    // DEFEITO CONHECIDO: contrato vai ao PNCP antes de assinado (art. 94 exige o
    // contrato assinado; a versão assinada nunca é retificada) e já nasce com
    // data_assinatura = data da homologação — plano §1.2 "Publicação/PNCP", E7.7.
    // licitacoes.service.ts:836 (enviarContratosHomologacao na homologação);
    // contratos.service.ts:2548 (data_assinatura: new Date()).
    test.failing('contrato só é enviado ao PNCP depois de assinado', async () => {
      const pc = await ctx.http().get(`/api/licitacoes/${lic.id}/processo-completo`).set(bearer(orgao.token)).expect(200);
      // nenhum contrato teve assinaturas solicitadas/colhidas neste teste
      expect(pc.body.contratos.every((c: any) => !c.documento_assinatura_id)).toBe(true);
      expect(pncpMock.filtrar('POST', /\/contratos$/)).toHaveLength(0);
    });

    // DEFEITO CONHECIDO: prazo do contrato cai sempre em 30 dias — o
    // calcularPrazoEntregaPropostas procura a proposta com status ENVIADA, mas o
    // julgamento da dispensa já a marcou VENCEDORA — plano E6.4.
    // contratos.service.ts:2592 (filtro status ENVIADA) → 2584 (PRAZO_PADRAO = 30).
    test.failing('prazo do contrato vem da proposta vencedora (ME 45 dias, EPP 20 dias)', async () => {
      const pc = await ctx.http().get(`/api/licitacoes/${lic.id}/processo-completo`).set(bearer(orgao.token)).expect(200);
      const prazos: Record<string, number> = {};
      for (const c of pc.body.contratos) {
        const r = await ctx.http().get(`/api/contratos/${c.id}`).set(bearer(orgao.token)).expect(200);
        prazos[r.body.fornecedor_razao_social] = Number(r.body.prazo_execucao_dias);
      }
      expect(prazos).toEqual({ [me.razao_social]: 45, [epp.razao_social]: 20 });
    });

    it('depois de homologada: rejulgar, chat e nova janela são recusados', async () => {
      const j = await ctx.http().post(`/api/licitacoes/${lic.id}/julgar-dispensa`).set(bearer(orgao.token));
      // E1: julgar após homologar = conflito de estado (409), não mais 400
      expect(j.status).toBe(409);
      expect(j.body.message).toMatch(/já homologada/);

      const m = await ctx
        .http()
        .post(`/api/licitacoes/${lic.id}/dispensa/mensagens`)
        .set(bearer(orgao.token))
        .send({ mensagem: 'Mais alguma coisa?' });
      expect(m.status).toBe(400);
      expect(m.body.message).toMatch(/chat encerrado/);

      const l = await abrirJanelaLances(ctx, lic, { duracao_minutos: 30 });
      expect(l.status).toBe(400);
      expect(l.body.message).toMatch(/já homologada/);
    });

    it('a ata continua disponível após a homologação', async () => {
      const r = await ctx.http().get(`/api/licitacoes/${lic.id}/dispensa/ata`).buffer(true).parse(lerBinario).expect(200);
      expect((r.body as Buffer).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    });
  });
});

// ============================================================================
// 2. DEFEITOS CONHECIDOS (test.failing — passam enquanto o defeito existir)
// ============================================================================

describe('Dispensa eletrônica — defeitos conhecidos', () => {
  let ctx: AppE2E;
  let orgao: OrgaoFixture;
  let outroOrgao: OrgaoFixture;
  let f1: FornecedorFixture; // ME
  let f2: FornecedorFixture; // demais
  let lic: LicitacaoFixture;
  let item1: string;
  let item2: string;

  beforeAll(async () => {
    ctx = await criarApp();
    orgao = await criarOrgao(ctx, { nome: 'Prefeitura Dispensa E2E (defeitos)' });
    outroOrgao = await criarOrgao(ctx, { nome: 'Outra Prefeitura E2E' });
    f1 = await criarFornecedor(ctx, { porte: 'ME' });
    f2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    // Acolhimento ainda aberto (o primeiro teste depende disso)
    lic = await criarDispensaComPropostas(
      ctx,
      orgao,
      [
        { fornecedor: f1, valores: [99, 49] },
        { fornecedor: f2, valores: [97, 48] },
      ],
      { encerrarAcolhimento: false },
    );
    [item1, item2] = lic.itens.map((i) => i.id);
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // CORRIGIDO NA E1a (era defeito): o painel público mostra o menor valor das propostas ANTES do fim do acolhimento, furando o
  // sigilo que as demais rotas públicas respeitam — plano E2.8 ("leitura pública só do que é público"). licitacoes.service.ts:1602
  // (painelLancesDispensa sem checar o sigilo).
  test('sigilo: painel público não expõe valores antes do fim do acolhimento', async () => {
    const p = await painelPublico(ctx, lic).expect(200);
    expect(p.body.itens.map((i: any) => i.menor_valor)).toEqual([null, null]);
  });

  it('janela SEM prorrogação: lance não prorroga (encerramento seco, padrão IN 67)', async () => {
    await abrirSessaoAgora(ctx, lic);
    const a = await abrirJanelaLances(ctx, lic, { duracao_minutos: 30, prorrogacao_minutos: 0 });
    expect(a.status).toBe(201);
    expect(a.body.prorrogacao_minutos).toBeNull();

    // mesmo no último minuto
    await moverFimDaJanela(ctx, lic.id, new Date(Date.now() + 30_000));
    const r = await darLance(ctx, f1, lic, item1, 96);
    expect(r.status).toBe(201);
    expect(r.body.prorrogada).toBeUndefined();
    // devolve a janela para 30 min (relógio) para os testes seguintes
    await moverFimDaJanela(ctx, lic.id, new Date(Date.now() + 30 * MIN));
  });

  // CORRIGIDO NA E1a (era defeito): o lance da dispensa confia no `fornecedor_id` do corpo — qualquer token dá lance em nome de
  // outro fornecedor — plano §1.2 B6 / E2.8. licitacoes.controller.ts:146-150; licitacoes.service.ts:1330.
  test('lance em nome de outro fornecedor é recusado (identidade vem do token)', async () => {
    // token do f2, corpo com o id do f1 (valor válido para o f1: 45 < 49)
    const r = await darLance(ctx, f2, lic, item2, 45, f1.id);
    expect([401, 403]).toContain(r.status);
  });

  // CORRIGIDO NA E1a (era defeito): o chat da dispensa também aceita `fornecedor_id` do corpo (mensagem em nome de outro) — plano
  // §1.2 B6 / E2.10. licitacoes.controller.ts:197-207; licitacoes.service.ts:1538.
  test('mensagem no chat em nome de outro fornecedor é recusada', async () => {
    const r = await ctx
      .http()
      .post(`/api/licitacoes/${lic.id}/dispensa/mensagens`)
      .set(bearer(f2.token))
      .send({ autor_tipo: 'FORNECEDOR', fornecedor_id: f1.id, mensagem: 'Desisto do item 1' });
    expect([401, 403]).toContain(r.status);
  });

  // CORRIGIDO NA E1a (era defeito): o painel é @Public e aceita `?fornecedorId=` de qualquer um — um visitante anônimo lê o valor
  // atual de um fornecedor identificado, desfazendo a anonimização — plano E2.8. licitacoes.controller.ts:154-160;
  // licitacoes.service.ts:1626.
  test('painel anônimo não revela o valor de um fornecedor identificado', async () => {
    const p = await painelPublico(ctx, lic, f1.id).expect(200);
    expect(p.body.itens.every((i: any) => i.meu_valor === undefined)).toBe(true);
  });

  // CORRIGIDO NA E1a (era defeito): sem checagem de órgão (tenant) — outro órgão lê o cockpit (propostas, fornecedores, contratos)
  // — plano E9.3. licitacoes.controller.ts:120-122; licitacoes.service.ts:861.
  test('outro órgão não acessa o cockpit da dispensa', async () => {
    const r = await ctx.http().get(`/api/licitacoes/${lic.id}/processo-completo`).set(bearer(outroOrgao.token));
    expect([403, 404]).toContain(r.status);
  });

  // CORRIGIDO NA E1a (era defeito): julgar/homologar não têm guarda de perfil — um token de FORNECEDOR julga a dispensa — plano §0
  // regra 1/2 e E1 (ato nomeado com pré-condições), E9.3. licitacoes.controller.ts:126-128.
  test('fornecedor não julga a dispensa', async () => {
    // Relógio: janela encerrada
    await moverFimDaJanela(ctx, lic.id, new Date(Date.now() - 1_000));
    const r = await ctx.http().post(`/api/licitacoes/${lic.id}/julgar-dispensa`).set(bearer(f2.token));
    expect([401, 403]).toContain(r.status);
  });

  it('o órgão julga a dispensa encerrada', async () => {
    // (idempotente em relação ao teste anterior: rejulgar é permitido até homologar)
    await moverFimDaJanela(ctx, lic.id, new Date(Date.now() - 1_000));
    const r = await ctx.http().post(`/api/licitacoes/${lic.id}/julgar-dispensa`).set(bearer(orgao.token));
    expect(r.status).toBe(201);
    const adj = [...r.body.adjudicados].sort((a: any, b: any) => a.item - b.item);
    const linhas = adj.map((a: any) => [a.item, a.valor_unitario, a.valor_total]);
    // item 1: f1 96 (lance) × 10
    expect(linhas[0]).toEqual([1, 96, 960]);
    // item 2: f2 48 (proposta) × 20 — o lance forjado (45, em nome do f1) foi
    // recusado na E1a; antes ele VENCIA o item (prova do dano).
    expect(linhas[1]).toEqual([2, 48, 960]);
  });

  // DEFEITO CONHECIDO: o valor homologado vem do corpo da requisição (a tela
  // soma e envia) em vez de ser calculado dos itens adjudicados — plano §0
  // regra 2 e §2.3 ("valor homologado é calculado, não digitado"), E6.1.
  // licitacoes.controller.ts:112-116; licitacoes.service.ts:789.
  test.failing('valor homologado é calculado dos itens, não aceito do corpo', async () => {
    await ctx
      .http()
      .put(`/api/licitacoes/${lic.id}/homologar`)
      .set(bearer(orgao.token))
      .send({ valor_homologado: 999_999 })
      .expect(200);
    const pc = await ctx.http().get(`/api/licitacoes/${lic.id}/processo-completo`).set(bearer(orgao.token)).expect(200);
    const soma = pc.body.itens.reduce((s: number, i: any) => s + Number(i.valor_total_homologado || 0), 0);
    expect(soma).toBeGreaterThan(0);
    expect(Number(pc.body.licitacao.valor_homologado)).toBe(soma);
  });
});
