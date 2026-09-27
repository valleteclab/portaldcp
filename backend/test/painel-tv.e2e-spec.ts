/**
 * PAINEL PARA TV (uso interno do setor de licitação) — contra o banco real.
 *
 *  1. Gestão dos links: só o administrador do órgão (conta do órgão ou
 *     usuário ADMIN) gera, nomeia, revoga e configura; outro usuário 403,
 *     fornecedor 403, anônimo 401; o admin de B não mexe no link de A.
 *  2. Token: guardado só como hash; a URL `/api/painel-tv/<token>` devolve só
 *     o órgão dono (nenhum parâmetro troca de órgão); revogado e inexistente
 *     → o mesmo 404; limite de requisições por token (429).
 *  3. Dados: processos em andamento por coluna (fase interna pela etapa,
 *     aguardando PNCP, recebendo propostas, suspenso com etiqueta), com quem
 *     está, atraso e achado de bloqueio (só a quantidade); encerrados fora;
 *     contratos vigentes dentro e fora da janela (30/60/90/120).
 *  4. Sigilo: o JSON não tem chave proibida nem o valor do processo de
 *     orçamento sigiloso, CPF, e-mail, texto de achado.
 */
process.env.PAINEL_TV_CACHE_MS = '0'; // sem cache: cada teste lê o banco
process.env.PAINEL_TV_LIMITE_POR_MINUTO = '40';

import {
  AppE2E,
  FornecedorFixture,
  OrgaoFixture,
  UsuarioOrgaoFixture,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  criarUsuarioOrgao,
} from './support';
import { criarDispensaPublicada, vincularOrgaoPncp } from './support/dispensa';
import { Licitacao, ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { TarefasService } from '../src/fase-interna/tarefas/tarefas.service';
import { CHAVES_PROIBIDAS, chavesProibidasEm } from '../src/painel-tv/painel-tv-regras';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const hojeBrasilia = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
const maisDias = (n: number) => new Date(Date.parse(`${hojeBrasilia()}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const VALOR_SIGILOSO = 87654.32;
const TEXTO_ACHADO = 'TEXTO-SIGILOSO-DO-ACHADO-VINC';

describe('Painel para TV', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let F: FornecedorFixture;
  let adminA: UsuarioOrgaoFixture;
  let pregoeiroA: UsuarioOrgaoFixture;
  let adminB: UsuarioOrgaoFixture;
  let tokenA: string;
  let linkA: string;
  let tokenB: string;
  const http = () => ctx.http();
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);
  const tv = (token: string) => http().get(`/api/painel-tv/${token}`);
  const cartoes = (d: any) => d.colunas.flatMap((c: any) => c.processos.map((p: any) => ({ ...p, coluna: c.chave })));
  const cartao = (d: any, numeroProcesso: string) => cartoes(d).find((p: any) => p.numero.startsWith(`PA ${numeroProcesso}`));

  // processos de A
  const proc: Record<string, { id: string; numero_processo: string }> = {};
  // contratos
  const contratos: Record<string, string> = {};

  async function criarContrato(orgao: OrgaoFixture, numero: string, fim: string, extras: Record<string, unknown> = {}) {
    const r = await http()
      .post('/api/contratos')
      .set(bearer(orgao.token))
      .send({
        numero_contrato: numero,
        fornecedor_id: F.id,
        fornecedor_cnpj: F.cnpj,
        fornecedor_razao_social: F.razao_social,
        objeto: `Serviço de limpeza e conservação predial ${numero}`,
        modalidade_execucao: 'CONTINUADO',
        valor_inicial: 12000,
        valor_global: 12000,
        data_assinatura: maisDias(-200),
        data_vigencia_inicio: maisDias(-200),
        data_vigencia_fim: fim,
        gestor_nome: 'Gestora Maria do Contrato',
        ...extras,
      });
    if (![200, 201].includes(r.status)) throw new Error(`[fixture] contrato → ${r.status} ${JSON.stringify(r.body)}`);
    const lib = await http().post(`/api/contratos/${r.body.id}/liberar`).set(bearer(orgao.token)).send({});
    if (![200, 201].includes(lib.status)) throw new Error(`[fixture] liberar contrato → ${lib.status} ${JSON.stringify(lib.body)}`);
    return r.body.id as string;
  }

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Câmara Painel TV A' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura Painel TV B' });
    F = await criarFornecedor(ctx, { razao_social: 'Limpeza Brilhante LTDA' });
    adminA = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.ADMIN, nome: 'Ana Administradora' });
    pregoeiroA = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.PREGOEIRO, nome: 'Pedro Pregoeiro' });
    adminB = await criarUsuarioOrgao(ctx, B, { role: RoleUsuario.ADMIN, nome: 'Bruno Admin B' });

    // --- processos de A ---
    // 1. pregão na fase interna, com agente (a tarefa do DFD vai para ele) e orçamento SIGILOSO
    //    (pregão: o valor alto não entra no limite das dispensas do órgão)
    const sig = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO, {
      itens: [{ descricao: 'Item sigiloso', quantidade: 1, valor_unitario_estimado: VALOR_SIGILOSO }],
      extras: { pregoeiro_id: pregoeiroA.id, objeto: 'Aquisição de mobiliário para o plenário e as salas das comissões permanentes da Câmara' },
    });
    // O DTO não expõe o sigilo: gravado direto (mesmo caminho do isolamento-dados-licitacao)
    await ctx.dataSource.getRepository(Licitacao).update(sig.id, {
      sigilo_orcamento: 'SIGILOSO',
      justificativa_sigilo: 'Orçamento sigiloso (teste e2e do painel)',
      valor_total_estimado: VALOR_SIGILOSO,
    });
    proc.sigiloso = sig;
    // 2. fase interna, atrasado (tarefa com prazo vencido) e com achado de BLOQUEIO aberto
    proc.atrasado = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: pregoeiroA.id } });
    // 3. revogado — não aparece
    proc.revogado = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
    // 4. aguardando PNCP (publicado sem a confirmação) — órgão integrado ao PNCP (mock)
    await vincularOrgaoPncp(ctx, A);
    proc.aguardando = await criarDispensaPublicada(ctx, A, { confirmar: false });
    // 5. recebendo propostas (divulgação confirmada)
    proc.propostas = await criarDispensaPublicada(ctx, A);
    // 6. suspenso (com etiqueta)
    proc.suspenso = await criarDispensaPublicada(ctx, A);

    // --- processo de B ---
    proc.deB = await criarLicitacao(ctx, B, ModalidadeLicitacao.PREGAO_ELETRONICO);

    await ctx.app.get(TarefasService).aguardarPendentes();

    const rev = await http().post(`/api/licitacoes/${proc.revogado.id}/atos/REVOGAR`).set(bearer(A.token)).send({ motivo: 'Demanda deixou de existir (e2e)' });
    expect(rev.status).toBe(201);
    const susp = await http().post(`/api/licitacoes/${proc.suspenso.id}/atos/SUSPENDER`).set(bearer(A.token)).send({ motivo: 'Impugnação em análise (e2e)' });
    expect(susp.status).toBe(201);
    await ctx.app.get(TarefasService).aguardarPendentes();

    // tarefa aberta do processo atrasado vence ontem ("o tempo passou")
    await sql(`UPDATE tarefas SET prazo = now() - interval '2 days' WHERE licitacao_id = $1 AND status = 'ABERTA'`, [proc.atrasado.id]);
    // achado de BLOQUEIO aberto (o motor o grava assim — a TV mostra só a quantidade)
    await sql(
      `INSERT INTO achados_conformidade (orgao_id, licitacao_id, regra, chave, severidade, etapa, portao, titulo, mensagem, status, primeira_deteccao, ultima_deteccao)
       VALUES ($1, $2, 'VINC-01', 'e2e-painel', 'BLOQUEIO', 'PUBLICACAO', 'C', 'Vinculação', $3, 'ABERTO', now(), now())`,
      [A.id, proc.atrasado.id, TEXTO_ACHADO],
    );

    // --- contratos ---
    contratos.dentro20 = await criarContrato(A, 'TV-020/2026', maisDias(20));
    contratos.dentro45 = await criarContrato(A, 'TV-045/2026', maisDias(45), { modalidade_execucao: 'ITEM_QUANTIDADE', gestor_nome: null, fiscal_nome: 'Fiscal Fábio' });
    contratos.dentro5 = await criarContrato(A, 'TV-005/2026', maisDias(5));
    contratos.fora100 = await criarContrato(A, 'TV-100/2026', maisDias(100));
    contratos.fora200 = await criarContrato(A, 'TV-200/2026', maisDias(200));
    contratos.vencido = await criarContrato(A, 'TV-VENC/2026', maisDias(-3));
    contratos.deB = await criarContrato(B, 'TV-B10/2026', maisDias(10));
    // aditivo de prazo registrado que ainda vai começar ("em andamento"), sem mexer no fim atual
    const termo = await http()
      .post(`/api/contratos/${contratos.dentro20}/termos`)
      .set(bearer(A.token))
      .send({ tipo: 'ADITIVO_PRAZO', objeto: 'Prorrogação por 12 meses (e2e)', data_assinatura: hojeBrasilia(), data_vigencia_inicio: maisDias(21) });
    expect([200, 201]).toContain(termo.status);

    // --- links ---
    const gA = await http().post('/api/painel-tv-gestao/links').set(bearer(A.token)).send({ nome: 'TV da sala de licitações' });
    expect(gA.status).toBe(201);
    tokenA = gA.body.token;
    linkA = gA.body.id;
    const gB = await http().post('/api/painel-tv-gestao/links').set(bearer(adminB.token)).send({ nome: 'TV de B' });
    expect(gB.status).toBe(201);
    tokenB = gB.body.token;
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('1. gestão dos links e permissões', () => {
    it('gera o token longo, mostra uma vez e guarda só o hash', async () => {
      expect(tokenA).toMatch(/^[0-9a-f]{64}$/);
      const [linha] = await sql(`SELECT * FROM painel_tv_links WHERE id = $1`, [linkA]);
      expect(linha.token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(linha.token_hash).not.toBe(tokenA);
      expect(JSON.stringify(linha)).not.toContain(tokenA);
      const lista = (await http().get('/api/painel-tv-gestao').set(bearer(A.token)).expect(200)).body;
      expect(lista).toMatchObject({ janela_contratos_dias: 90, janelas_permitidas: [30, 60, 90, 120] });
      expect(lista.links.find((l: any) => l.id === linkA)).toMatchObject({ nome: 'TV da sala de licitações', ativo: true });
      expect(JSON.stringify(lista)).not.toContain(tokenA);
      expect(JSON.stringify(lista)).not.toContain(linha.token_hash);
    });

    it('usuário ADMIN do órgão gerencia; nome e último acesso aparecem', async () => {
      const g = await http().post('/api/painel-tv-gestao/links').set(bearer(adminA.token)).send({ nome: 'TV do Protocolo' });
      expect(g.status).toBe(201);
      await tv(g.body.token).expect(200);
      const r = await http().patch(`/api/painel-tv-gestao/links/${g.body.id}`).set(bearer(adminA.token)).send({ nome: 'TV do Protocolo (térreo)' });
      expect(r.status).toBe(200);
      const lista = (await http().get('/api/painel-tv-gestao').set(bearer(adminA.token)).expect(200)).body;
      const l = lista.links.find((x: any) => x.id === g.body.id);
      expect(l.nome).toBe('TV do Protocolo (térreo)');
      expect(l.criado_por_nome).toBe('Ana Administradora');
      expect(l.ultimo_acesso).toBeTruthy();
      expect(lista.links.some((x: any) => x.nome === 'TV de B')).toBe(false); // só o próprio órgão
      // nome curto demais
      expect((await http().post('/api/painel-tv-gestao/links').set(bearer(adminA.token)).send({ nome: 'x' })).status).toBe(400);
    });

    it('outro usuário do órgão 403, fornecedor 403, anônimo 401 — em todas as rotas de gestão', async () => {
      const rotas: Array<[string, string, any?]> = [
        ['get', '/api/painel-tv-gestao'],
        ['post', '/api/painel-tv-gestao/links', { nome: 'Invasor' }],
        ['patch', `/api/painel-tv-gestao/links/${linkA}`, { nome: 'Invasor' }],
        ['delete', `/api/painel-tv-gestao/links/${linkA}`],
        ['put', '/api/painel-tv-gestao/configuracao', { janela_contratos_dias: 30 }],
        ['get', '/api/painel-tv-gestao/previa'],
      ];
      for (const [metodo, rota, corpo] of rotas) {
        const chamar = (h?: Record<string, string>) => {
          const req = (http() as any)[metodo](rota);
          if (h) req.set(h);
          return corpo ? req.send(corpo) : req;
        };
        expect([rota, (await chamar(bearer(pregoeiroA.token))).status]).toEqual([rota, 403]);
        expect([rota, (await chamar(bearer(F.token))).status]).toEqual([rota, 403]);
        expect([rota, (await chamar()).status]).toEqual([rota, 401]);
      }
      // nada mudou
      const [l] = await sql(`SELECT nome, revogado_em FROM painel_tv_links WHERE id = $1`, [linkA]);
      expect(l).toEqual({ nome: 'TV da sala de licitações', revogado_em: null });
      expect((await http().get('/api/painel-tv-gestao').set(bearer(A.token)).expect(200)).body.janela_contratos_dias).toBe(90);
    });

    it('o admin de B não renomeia nem revoga o link de A (404) e o orgao_id informado não troca de órgão', async () => {
      expect((await http().patch(`/api/painel-tv-gestao/links/${linkA}`).set(bearer(adminB.token)).send({ nome: 'Invasão' })).status).toBe(404);
      expect((await http().delete(`/api/painel-tv-gestao/links/${linkA}`).set(bearer(adminB.token))).status).toBe(404);
      const lista = (await http().get(`/api/painel-tv-gestao?orgao_id=${A.id}`).set(bearer(adminB.token)).expect(200)).body;
      expect(lista.links.some((l: any) => l.id === linkA)).toBe(false);
      const previa = (await http().get(`/api/painel-tv-gestao/previa?orgao_id=${A.id}`).set(bearer(adminB.token)).expect(200)).body;
      expect(previa.orgao.nome).toBe('Prefeitura Painel TV B');
      await tv(tokenA).expect(200);
    });

    it('janela dos contratos: só 30, 60, 90 ou 120', async () => {
      expect((await http().put('/api/painel-tv-gestao/configuracao').set(bearer(A.token)).send({ janela_contratos_dias: 45 })).status).toBe(400);
      expect((await http().put('/api/painel-tv-gestao/configuracao').set(bearer(A.token)).send({ janela_contratos_dias: 'x' })).status).toBe(400);
    });
  });

  // ==========================================================================
  describe('2. dados do painel — só do órgão do token', () => {
    it('o token de A traz só A; o de B só B; parâmetros não trocam de órgão', async () => {
      const dA = (await tv(tokenA).expect(200)).body;
      const dB = (await tv(tokenB).expect(200)).body;
      expect(dA.orgao.nome).toBe('Câmara Painel TV A');
      expect(dB.orgao.nome).toBe('Prefeitura Painel TV B');
      const jA = JSON.stringify(dA);
      expect(jA).not.toContain(proc.deB.numero_processo);
      expect(jA).not.toContain('TV-B10/2026');
      expect(jA).not.toContain('Prefeitura Painel TV B');
      const jB = JSON.stringify(dB);
      expect(jB).toContain(proc.deB.numero_processo);
      for (const p of Object.values(proc).filter((x) => x !== proc.deB)) expect(jB).not.toContain(p.numero_processo);
      expect(jB).not.toContain('TV-020/2026');
      // ?orgao_id= é ignorado
      const comParam = (await http().get(`/api/painel-tv/${tokenA}?orgao_id=${B.id}`).expect(200)).body;
      expect(comParam.orgao.nome).toBe('Câmara Painel TV A');
      expect(JSON.stringify(comParam)).not.toContain(proc.deB.numero_processo);
      // o JWT de B junto com o token de A não muda nada
      const comJwt = (await tv(tokenA).set(bearer(B.token)).expect(200)).body;
      expect(comJwt.orgao.nome).toBe('Câmara Painel TV A');
    });

    it('colunas: fase interna pela etapa, aguardando PNCP, recebendo propostas e suspenso com etiqueta', async () => {
      const d = (await tv(tokenA).expect(200)).body;
      expect(d.colunas.map((c: any) => c.chave)).toEqual([
        'DEMANDA', 'PLANEJAMENTO', 'PESQUISA', 'RESERVA', 'AUTORIZACAO', 'MINUTAS_PARECER',
        'PUBLICACAO', 'PROPOSTAS', 'JULGAMENTO', 'RECURSO', 'HOMOLOGACAO', 'CONTRATO',
      ]);
      const sig = cartao(d, proc.sigiloso.numero_processo);
      expect(sig).toMatchObject({ coluna: 'DEMANDA', etapa: 'Demanda (DFD)', modalidade: 'Pregão', suspenso: false });
      expect(sig.objeto.length).toBeLessThanOrEqual(70);
      // F3: com quem está vem da tramitação (posse inicial com o agente), com desde/prazo/atraso
      expect(sig.com_quem).toMatchObject({ nome: 'Pedro Pregoeiro', tipo: 'PESSOA', prazo: null, atrasado: false });
      expect(new Date(sig.com_quem.desde).getTime()).toBeLessThanOrEqual(Date.now());
      expect(sig.dias_na_etapa).toBe(0);
      expect(['VERDE', 'AMARELO', null]).toContain(sig.cor_prazo);

      const ag = cartao(d, proc.aguardando.numero_processo);
      expect(ag).toMatchObject({ coluna: 'PUBLICACAO', etapa: 'Aguardando PNCP' });
      const pr = cartao(d, proc.propostas.numero_processo);
      expect(pr.coluna).toBe('PROPOSTAS');
      expect(pr.evento).toMatchObject({ tipo: expect.stringMatching(/SESSAO|FIM_PROPOSTAS/) });
      expect(new Date(pr.evento.data).getTime()).toBeGreaterThan(Date.now());
      const su = cartao(d, proc.suspenso.numero_processo);
      expect(su).toMatchObject({ suspenso: true, atrasado: false });

      expect(d.numeros.em_andamento).toBe(5);
      expect(d.numeros.publicados_7_dias).toBeGreaterThanOrEqual(2);
      expect(d.numeros.eventos_7_dias + d.numeros.eventos_hoje).toBeGreaterThanOrEqual(1);
      expect(d.rodape.publicacoes_24h.map((x: any) => x.numero).join(' ')).toContain(proc.propostas.numero_processo);
      expect(d.rodape.proximos_eventos.map((x: any) => x.numero).join(' ')).toContain(proc.propostas.numero_processo);
      // suspenso não entra nas próximas sessões
      expect(d.rodape.proximos_eventos.map((x: any) => x.numero).join(' ')).not.toContain(proc.suspenso.numero_processo);
    });

    it('processos encerrados (revogado) ficam de fora', async () => {
      const d = (await tv(tokenA).expect(200)).body;
      expect(JSON.stringify(d)).not.toContain(proc.revogado.numero_processo);
    });

    it('atrasado: tarefa vencida deixa o cartão vermelho e conta no topo; achado só com a quantidade', async () => {
      const d = (await tv(tokenA).expect(200)).body;
      const at = cartao(d, proc.atrasado.numero_processo);
      expect(at).toMatchObject({ atrasado: true, cor_prazo: 'VERMELHO' });
      // só a QUANTIDADE de achados BLOQUEIO abertos (o do teste + os do motor), nunca o texto
      const achados = await sql(`SELECT regra, titulo, mensagem FROM achados_conformidade WHERE licitacao_id = $1 AND status = 'ABERTO' AND severidade = 'BLOQUEIO'`, [proc.atrasado.id]);
      expect(achados.length).toBeGreaterThanOrEqual(1);
      expect(at.bloqueios).toBe(achados.length);
      for (const a of achados) expect(JSON.stringify(d)).not.toContain(a.mensagem);
      expect(d.numeros.atrasados).toBe(1);
      // atrasados primeiro na coluna
      const demanda = d.colunas.find((c: any) => c.chave === at.coluna);
      expect(demanda.processos[0].numero).toBe(at.numero);
      expect(JSON.stringify(d)).not.toContain(TEXTO_ACHADO);
      expect(JSON.stringify(d)).not.toContain('VINC-01');
    });

    it('com quem está (F3): pela tramitação — setor, desde, prazo e atraso da posse; o despacho nunca sai na TV', async () => {
      const setor = (await http().post(`/api/orgaos/${A.id}/setores`).set(bearer(A.token)).send({ nome: 'Protocolo Geral' }).expect(201)).body.id;
      const despacho = 'Despacho sigiloso de teste do painel: não pode aparecer na TV.';
      const t = await http().post(`/api/fase-interna/${proc.atrasado.id}/tramitar`).set(bearer(A.token)).send({ para_setor_id: setor, despacho, prazo_dias_uteis: 1 });
      expect(t.status).toBe(201);
      await sql(`UPDATE tramitacoes_processo SET data_prazo = now() - interval '2 days' WHERE id = $1`, [t.body.id]);
      const d = (await tv(tokenA).expect(200)).body;
      const at = cartao(d, proc.atrasado.numero_processo);
      expect(at.com_quem).toMatchObject({ nome: 'Protocolo Geral', tipo: 'SETOR', atrasado: true });
      expect(new Date(at.com_quem.desde).getTime()).toBeLessThanOrEqual(Date.now());
      expect(new Date(at.com_quem.prazo).getTime()).toBeLessThan(Date.now());
      expect(JSON.stringify(d)).not.toContain(despacho);
      expect(chavesProibidasEm(d)).toEqual([]);
    });

    it('contratos: vigentes dentro da janela (90), com dias, cor, gestor/fiscal, art. 107 e aditivo em andamento', async () => {
      const d = (await tv(tokenA).expect(200)).body;
      expect(d.janela_contratos_dias).toBe(90);
      expect(d.contratos.map((c: any) => c.numero)).toEqual(['TV-005/2026', 'TV-020/2026', 'TV-045/2026']);
      const [c5, c20, c45] = d.contratos;
      expect(c5).toMatchObject({ dias_restantes: 5, faixa: 'VERMELHO' });
      expect(c20).toMatchObject({
        dias_restantes: 20,
        faixa: 'VERMELHO',
        contratado: 'Limpeza Brilhante LTDA',
        fim_vigencia: maisDias(20),
        responsavel: { papel: 'Gestor', nome: 'Gestora Maria do Contrato' },
        prorrogacao: 'CONTINUO_ART107',
        prorrogacao_rotulo: 'Serviço contínuo — pode prorrogar (art. 107)',
        aditivo_prazo_em_andamento: true,
        valor: 12000,
      });
      expect(c45).toMatchObject({ dias_restantes: 45, faixa: 'AMARELO', responsavel: { papel: 'Fiscal', nome: 'Fiscal Fábio' }, prorrogacao: null, aditivo_prazo_em_andamento: false });
      expect(d.numeros).toMatchObject({ contratos_30: 2, contratos_60: 3, contratos_90: 3 });
      expect(d.rodape.contratos_7_dias.map((c: any) => c.numero)).toEqual(['TV-005/2026']);
      const j = JSON.stringify(d);
      expect(j).not.toContain('TV-100/2026');
      expect(j).not.toContain('TV-200/2026');
      expect(j).not.toContain('TV-VENC/2026');
      expect(j).not.toMatch(/empenho/i);
    });

    it('janela 120 inclui o de 100 dias; 30 deixa só os de até 30 (os números do topo continuam até 90)', async () => {
      await http().put('/api/painel-tv-gestao/configuracao').set(bearer(adminA.token)).send({ janela_contratos_dias: 120 }).expect(200);
      let d = (await tv(tokenA).expect(200)).body;
      expect(d.contratos.map((c: any) => c.numero)).toEqual(['TV-005/2026', 'TV-020/2026', 'TV-045/2026', 'TV-100/2026']);
      expect(d.contratos[3].faixa).toBe('NEUTRO');
      await http().put('/api/painel-tv-gestao/configuracao').set(bearer(A.token)).send({ janela_contratos_dias: 30 }).expect(200);
      d = (await tv(tokenA).expect(200)).body;
      expect(d.contratos.map((c: any) => c.numero)).toEqual(['TV-005/2026', 'TV-020/2026']);
      expect(d.numeros).toMatchObject({ contratos_30: 2, contratos_60: 3, contratos_90: 3 });
      await http().put('/api/painel-tv-gestao/configuracao').set(bearer(A.token)).send({ janela_contratos_dias: 90 }).expect(200);
    });

    it('pré-visualização do administrador = os mesmos dados da TV', async () => {
      const p = (await http().get('/api/painel-tv-gestao/previa').set(bearer(adminA.token)).expect(200)).body;
      const d = (await tv(tokenA).expect(200)).body;
      expect(p.orgao).toEqual(d.orgao);
      expect(p.numeros).toEqual(d.numeros);
      expect(p.contratos).toEqual(d.contratos);
    });
  });

  // ==========================================================================
  describe('3. campos sigilosos', () => {
    it('nenhuma chave proibida; sem o valor do orçamento sigiloso, CPF, e-mail ou telefone', async () => {
      const d = (await tv(tokenA).expect(200)).body;
      expect(chavesProibidasEm(d)).toEqual([]);
      const j = JSON.stringify(d);
      for (const k of CHAVES_PROIBIDAS) expect(j).not.toContain(`"${k}"`);
      expect(j).not.toContain('87654');
      expect(j).not.toMatch(/87\.654/);
      expect(j).not.toMatch(/valor_total|valor_estimado|sigilo/i);
      const usuarios = await sql(`SELECT cpf, email, telefone FROM usuarios WHERE orgao_id = $1`, [A.id]);
      for (const u of usuarios) {
        if (u.cpf) expect(j).not.toContain(String(u.cpf).replace(/\D/g, ''));
        if (u.email) expect(j).not.toContain(u.email);
        if (u.telefone) expect(j).not.toContain(u.telefone);
      }
      expect(j).not.toContain(F.cnpj);
      // nada de propostas/fornecedores do processo recebendo propostas
      expect(j).not.toMatch(/fornecedor|licitante|proposta_/i);
    });
  });

  // ==========================================================================
  describe('4. revogação, token inválido e limite', () => {
    it('token revogado e token inexistente → o mesmo 404', async () => {
      const g = await http().post('/api/painel-tv-gestao/links').set(bearer(A.token)).send({ nome: 'TV que será revogada' });
      await tv(g.body.token).expect(200);
      await http().delete(`/api/painel-tv-gestao/links/${g.body.id}`).set(bearer(adminA.token)).expect(200);
      const revogado = await tv(g.body.token);
      const inexistente = await tv('a'.repeat(64));
      const malformado = await tv('abc');
      expect(revogado.status).toBe(404);
      expect(inexistente.status).toBe(404);
      expect(malformado.status).toBe(404);
      expect(revogado.body).toEqual(inexistente.body);
      expect(JSON.stringify(revogado.body)).not.toMatch(/revog/i);
      const lista = (await http().get('/api/painel-tv-gestao').set(bearer(A.token)).expect(200)).body;
      expect(lista.links.find((l: any) => l.id === g.body.id)).toMatchObject({ ativo: false, revogado_por_nome: 'Ana Administradora' });
      // gerar outro funciona
      const novo = await http().post('/api/painel-tv-gestao/links').set(bearer(A.token)).send({ nome: 'TV que será revogada (nova)' });
      await tv(novo.body.token).expect(200);
    });

    it('limite de requisições por token (429) sem afetar outro token', async () => {
      const g = await http().post('/api/painel-tv-gestao/links').set(bearer(A.token)).send({ nome: 'TV do limite' });
      const status: number[] = [];
      for (let i = 0; i < 41; i++) status.push((await tv(g.body.token)).status);
      expect(status.slice(0, 40).every((s) => s === 200)).toBe(true);
      expect(status[40]).toBe(429);
      await tv(tokenB).expect(200);
    });
  });
});
