/**
 * ============================================================================
 * E6 — FORMALIZAÇÃO DO RESULTADO: OPERADOR × AUTORIDADE (Lei 14.133/2021
 * art. 71 IV; decisão do usuário 25/09/2026)
 * ============================================================================
 *
 *  O agente de contratação/pregoeiro OPERA o sistema e registra a adjudicação
 *  e a homologação; o ato é da AUTORIDADE escolhida do cadastro do órgão, e o
 *  termo (que vai ao Diário Oficial) leva os dados dela.
 *
 *  0. Configuração: autoridades (uma padrão) e modo — só conta do órgão/ADMIN;
 *     órgão B não vê nem altera.
 *  A. REGISTRO_DIRETO (padrão): pregoeira adjudica (autoridade com delegação)
 *     e homologa (autoridade padrão) — efeito imediato, operador e autoridade
 *     gravados, termo gerado com os dados da autoridade; contrato gerado;
 *     equipe de apoio/órgão B/fornecedor não registram nem baixam; o termo só
 *     é público depois da homologação.
 *  B. ASSINATURA_ELETRONICA: o ato fica PENDENTE (nada muda) até a autoridade
 *     assinar pelo link (CPF + código); pedido cancelável; depois da
 *     assinatura, efeito + contrato.
 *  C. TERMO_EXTERNO: sem arquivo → 400; com o termo assinado/publicação →
 *     efeito imediato; o arquivo enviado é o documento oficial público.
 */
import {
  AppE2E,
  FornecedorFixture,
  OrgaoFixture,
  UsuarioOrgaoFixture,
  criarApp,
  criarFornecedor,
  criarOrgao,
  criarUsuarioOrgao,
} from './support';
import { desligarLimiteDeRequisicoes, pararTodosOsCrons } from './support/pregao';
import { prepararPregaoEmDisputa } from './support/isolamento';
import { convocarAceitacao, decidirAceitacao, enviarPropostaAdequada } from './support/julgamento';
import { habilitarLicitante } from './support/habilitacao';
import { precluirIntencaoDeRecurso } from './support/recursos';
import { adjudicarResultado, homologarResultado, painelResultado } from './support/resultado';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { AssinaturasService } from '../src/assinaturas/assinaturas.service';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const CPF_PREFEITA = '52998224725';
const EMAIL_PREFEITA = 'prefeita.formalizacao@e2e.local';

describe('E6 — formalização do resultado (operador × autoridade)', () => {
  let ctx: AppE2E;
  const http = () => ctx.http();
  const q = (sql: string, p: any[] = []) => ctx.dataSource.query(sql, p);

  let orgao: OrgaoFixture;
  let orgaoB: OrgaoFixture;
  let pregoeira: UsuarioOrgaoFixture;
  let apoio: UsuarioOrgaoFixture;
  let A: FornecedorFixture;
  let D: FornecedorFixture;
  let prefeitaId: string;
  let secretarioId: string;

  beforeAll(async () => {
    ctx = await criarApp();
    pararTodosOsCrons(ctx);
    desligarLimiteDeRequisicoes(ctx);
    orgao = await criarOrgao(ctx, { nome: 'Prefeitura Formalizacao E6' });
    orgaoB = await criarOrgao(ctx, { nome: 'Outra Prefeitura Formalizacao' });
    pregoeira = await criarUsuarioOrgao(ctx, orgao, { nome: 'Paula Pregoeira', role: RoleUsuario.PREGOEIRO });
    apoio = await criarUsuarioOrgao(ctx, orgao, { nome: 'Apoio Formalizacao', role: RoleUsuario.EQUIPE_APOIO });
    A = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    D = await criarFornecedor(ctx, { porte: 'DEMAIS' });
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  function exigir(r: { status: number; body: any }, status: number, oque: string) {
    if (r.status !== status) throw new Error(`[formalização] ${oque}: HTTP ${r.status} ${JSON.stringify(r.body)}`);
  }

  /** Pregão de 1 item (10 un.): A 90/un vence, readequa para 89 (890), aceito, habilitado, sem intenção de recurso. */
  async function pregaoProntoParaAdjudicar(descricao: string) {
    const p = await prepararPregaoEmDisputa(
      ctx,
      orgao,
      [
        { fornecedor: A, valores: [90] },
        { fornecedor: D, valores: [95] },
      ],
      { itens: [{ descricao, quantidade: 10, valor_unitario_estimado: 100 }] },
    );
    const item = p.lic.itens[0].id;
    exigir(await http().post(`/api/disputa-v2/sessao/${p.sessaoId}/encerrar-item/${item}`).set(bearer(orgao.token)), 201, 'encerrar item');
    const c = await convocarAceitacao(ctx, p.sessaoId, item, orgao.token);
    exigir(c, 201, 'convocar aceitação');
    exigir(await enviarPropostaAdequada(ctx, p.sessaoId, c.body.id, A.token, [{ itemId: item, valorUnitario: 89 }]), 201, 'proposta adequada');
    exigir(await decidirAceitacao(ctx, p.sessaoId, c.body.id, orgao.token, 'aceitar'), 201, 'aceitar');
    await habilitarLicitante(ctx, p.lic.id, A, orgao.token);
    await precluirIntencaoDeRecurso(ctx, p.sessaoId, orgao.token);
    return { licId: p.lic.id as string, sessaoId: p.sessaoId as string, item };
  }

  const itens = async (licId: string) =>
    (await q(`SELECT status::text AS status, fornecedor_vencedor_id, valor_total_homologado FROM itens_licitacao WHERE licitacao_id = $1`, [licId])) as any[];
  const formalizacoes = async (licId: string) =>
    (await q(`SELECT * FROM formalizacoes_resultado WHERE licitacao_id = $1 ORDER BY created_at`, [licId])) as any[];
  const contratos = async (licId: string) =>
    (await q(`SELECT id, fornecedor_id, valor_global, status::text AS status FROM contratos WHERE licitacao_id = $1`, [licId])) as any[];
  const transicao = async (licId: string, ato: string) =>
    (await q(`SELECT ator_tipo, ator_id, dados FROM licitacao_transicoes WHERE licitacao_id = $1 AND ato = $2 ORDER BY created_at DESC LIMIT 1`, [licId, ato]))[0];
  const licitacao = async (licId: string) =>
    (await q(`SELECT fase::text AS fase, data_homologacao, homologacao_autoridade_nome, homologacao_autoridade_cargo FROM licitacoes WHERE id = $1`, [licId]))[0];
  const baixar = (caminho: string, token?: string) => {
    const r = http().get(caminho).buffer(true).parse((res, cb) => {
      const partes: Buffer[] = [];
      res.on('data', (c: Buffer) => partes.push(c));
      res.on('end', () => cb(null, Buffer.concat(partes)));
    });
    return token ? r.set(bearer(token)) : r;
  };

  /** A autoridade assina pelo link externo (CPF + código enviado por e-mail — lido do cache do OTP). */
  async function autoridadeAssina(documentoId: string) {
    const [sig] = await q(`SELECT token_acesso, is_orgao_user, email, cpf_cnpj FROM signatarios_documento WHERE documento_id = $1`, [documentoId]);
    expect(sig).toMatchObject({ is_orgao_user: false, email: EMAIL_PREFEITA, cpf_cnpj: CPF_PREFEITA });
    exigir(
      await http().post('/api/public/assinaturas/solicitar-codigo').send({ token_acesso: sig.token_acesso, cpf_cnpj: CPF_PREFEITA }),
      201,
      'código da autoridade',
    );
    const cache: Map<string, { codigo: string }> = (ctx.app.get(AssinaturasService) as any).otpCache;
    const codigo = [...cache.entries()].find(([k]) => k.includes(EMAIL_PREFEITA))?.[1].codigo;
    expect(codigo).toBeTruthy();
    exigir(
      await http().post('/api/public/assinaturas/assinar').send({ token_acesso: sig.token_acesso, cpf_cnpj: CPF_PREFEITA, codigo_otp: codigo }),
      201,
      'assinatura da autoridade',
    );
  }

  async function esperarStatus(formalizacaoId: string, status: string) {
    for (let i = 0; i < 150; i++) {
      const [f] = await q(`SELECT status, erro FROM formalizacoes_resultado WHERE id = $1`, [formalizacaoId]);
      if (f.status === status) return f;
      if (f.status === 'FALHOU') throw new Error(`[formalização] efeito falhou: ${f.erro}`);
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`[formalização] ${formalizacaoId} não chegou a ${status}`);
  }

  // ==========================================================================
  describe('0. configuração: autoridades e modo (conta do órgão/ADMIN)', () => {
    test('padrão: REGISTRO_DIRETO e nenhuma autoridade', async () => {
      const r = await http().get('/api/resultado/configuracao').set(bearer(orgao.token));
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ modo: 'REGISTRO_DIRETO', autoridades: [] });
    });

    test('pregoeira não configura (403); dados inválidos → 400', async () => {
      expect((await http().post('/api/resultado/configuracao/autoridades').set(bearer(pregoeira.token)).send({ nome: 'X', cargo: 'Y' })).status).toBe(403);
      expect((await http().put('/api/resultado/configuracao/modo').set(bearer(pregoeira.token)).send({ modo: 'TERMO_EXTERNO' })).status).toBe(403);
      expect((await http().post('/api/resultado/configuracao/autoridades').set(bearer(orgao.token)).send({ nome: 'X', cargo: '' })).status).toBe(400);
      expect((await http().post('/api/resultado/configuracao/autoridades').set(bearer(orgao.token)).send({ nome: 'X', cargo: 'Y', cpf: '12' })).status).toBe(400);
      expect((await http().put('/api/resultado/configuracao/modo').set(bearer(orgao.token)).send({ modo: 'XYZ' })).status).toBe(400);
    });

    test('órgão cadastra a prefeita (1ª = padrão) e o secretário com delegação; a nova padrão desmarca a anterior', async () => {
      const sec = await http()
        .post('/api/resultado/configuracao/autoridades')
        .set(bearer(orgao.token))
        .send({ nome: 'Joao Secretario', cargo: 'Secretario de Administracao', ato_delegacao_numero: 'Decreto 10/2026', ato_delegacao_data: '2026-01-15' });
      expect(sec.status).toBe(201);
      expect(sec.body.padrao).toBe(true); // primeira = padrão
      secretarioId = sec.body.id;
      const pref = await http()
        .post('/api/resultado/configuracao/autoridades')
        .set(bearer(orgao.token))
        .send({ nome: 'Maria Prefeita', cargo: 'Prefeita Municipal', cpf: CPF_PREFEITA, email: EMAIL_PREFEITA, padrao: true });
      expect(pref.status).toBe(201);
      prefeitaId = pref.body.id;
      const cfg = (await http().get('/api/resultado/configuracao').set(bearer(pregoeira.token))).body;
      expect(cfg.autoridades.map((a: any) => [a.nome, a.padrao])).toEqual([
        ['Maria Prefeita', true],
        ['Joao Secretario', false],
      ]);
    });

    test('órgão B não vê nem altera as autoridades do órgão A', async () => {
      const cfgB = (await http().get('/api/resultado/configuracao').set(bearer(orgaoB.token))).body;
      expect(cfgB.autoridades).toEqual([]);
      expect((await http().put(`/api/resultado/configuracao/autoridades/${prefeitaId}`).set(bearer(orgaoB.token)).send({ nome: 'Hack', cargo: 'Hack' })).status).toBe(404);
      expect((await http().delete(`/api/resultado/configuracao/autoridades/${prefeitaId}`).set(bearer(orgaoB.token))).status).toBe(404);
      expect((await http().get('/api/resultado/configuracao').set(bearer(A.token))).status).toBe(403);
    });
  });

  // ==========================================================================
  describe('A. REGISTRO_DIRETO: o pregoeiro registra, o ato é da autoridade', () => {
    let licId: string;
    let fAdj: any;

    beforeAll(async () => {
      ({ licId } = await pregaoProntoParaAdjudicar('Mesa escolar Formalizacao A'));
    });

    test('painel: modo, autoridades e autoridade padrão; o pregoeiro pode registrar', async () => {
      const p = await painelResultado(ctx, licId, pregoeira.token);
      expect(p.formalizacao).toMatchObject({ modo: 'REGISTRO_DIRETO', operador: { pode: true }, pendente: null });
      expect(p.formalizacao.autoridadePadrao).toMatchObject({ id: prefeitaId, nome: 'Maria Prefeita' });
      expect(p.autoridade).toEqual({ nome: 'Maria Prefeita', cargo: 'Prefeita Municipal' });
      expect(p.atos.adjudicar.disponivel).toBe(true);
      const pa = await painelResultado(ctx, licId, apoio.token);
      expect(pa.atos.adjudicar.disponivel).toBe(false);
    });

    test('prévia do termo (PDF, sem efeito) com a autoridade escolhida', async () => {
      const r = await baixar(`/api/resultado/licitacao/${licId}/termo/previa?tipo=ADJUDICACAO&autoridade_id=${secretarioId}`, pregoeira.token);
      expect(r.status).toBe(200);
      expect(String(r.headers['content-type'])).toMatch(/pdf/);
      expect(r.body.slice(0, 5).toString()).toBe('%PDF-');
      expect(r.body.toString('latin1')).toContain('Joao Secretario');
      expect((await itens(licId))[0].status).toBe('ATIVO');
      expect(await formalizacoes(licId)).toHaveLength(0);
    });

    test('equipe de apoio, órgão B e fornecedor não adjudicam; autoridade de outro órgão → 400', async () => {
      expect((await adjudicarResultado(ctx, licId, apoio.token)).status).toBe(403);
      expect([403, 404]).toContain((await adjudicarResultado(ctx, licId, orgaoB.token)).status);
      expect([403, 404]).toContain((await adjudicarResultado(ctx, licId, A.token)).status);
      const [autB] = await q(
        `INSERT INTO autoridades_orgao (orgao_id, nome, cargo, padrao, ativo) VALUES ($1, 'Autoridade B', 'Prefeito B', true, true) RETURNING id`,
        [orgaoB.id],
      );
      const r = await adjudicarResultado(ctx, licId, pregoeira.token, { autoridade_id: autB.id });
      expect(r.status).toBe(400);
      expect((await itens(licId))[0].status).toBe('ATIVO');
    });

    test('pregoeira ADJUDICA em nome do secretário (delegação): efeito imediato, operador × autoridade gravados, termo gerado', async () => {
      const r = await adjudicarResultado(ctx, licId, pregoeira.token, { autoridade_id: secretarioId });
      expect(r.status).toBe(200);
      expect(r.body.unidades[0]).toMatchObject({ situacao: 'ADJUDICADA', valorTotal: 890 });
      expect((await itens(licId))[0]).toMatchObject({ status: 'ADJUDICADO', fornecedor_vencedor_id: A.id });
      [fAdj] = await formalizacoes(licId);
      expect(fAdj).toMatchObject({
        tipo: 'ADJUDICACAO',
        modo: 'REGISTRO_DIRETO',
        status: 'EFETIVADO',
        autoridade_id: secretarioId,
        autoridade_nome: 'Joao Secretario',
        autoridade_ato_delegacao_numero: 'Decreto 10/2026',
        operador_tipo: 'USUARIO',
        operador_id: pregoeira.id,
      });
      expect(fAdj.operador_nome).toMatch(/Paula Pregoeira/);
      expect(Number(fAdj.valor_total)).toBe(890);
      expect(fAdj.arquivo_termo).toMatch(new RegExp(`^resultados/${licId}/termo-adjudicacao-`));
      const t = await transicao(licId, 'ADJUDICAR');
      expect(t).toMatchObject({ ator_tipo: 'USUARIO', ator_id: pregoeira.id });
      expect(t.dados).toMatchObject({ autoridade: { nome: 'Joao Secretario' }, operador: { id: pregoeira.id }, formalizacao_id: fAdj.id, modo: 'REGISTRO_DIRETO' });
    });

    test('termo: órgão baixa (autoridade, delegação e "registrado no sistema por"); órgão B/fornecedor não; público só depois da homologação', async () => {
      const r = await baixar(`/api/resultado/formalizacao/${fAdj.id}/arquivo`, pregoeira.token);
      expect(r.status).toBe(200);
      const txt = r.body.toString('latin1');
      expect(txt).toContain('Joao Secretario');
      expect(txt).toContain('Decreto 10/2026');
      expect(txt).toContain('Registrado no sistema por Paula Pregoeira');
      expect((await baixar(`/api/resultado/formalizacao/${fAdj.id}/arquivo`, orgaoB.token)).status).toBe(404);
      expect((await baixar(`/api/resultado/formalizacao/${fAdj.id}/arquivo`, A.token)).status).toBe(403);
      // ainda não homologada: nada público
      expect((await http().get(`/api/resultado/publico/licitacao/${licId}/termos`)).body).toEqual([]);
      expect((await baixar(`/api/resultado/publico/formalizacao/${fAdj.id}/arquivo`)).status).toBe(404);
      expect((await baixar(`/api/uploads/${fAdj.arquivo_termo}`)).status).toBe(401);
    });

    test('pregoeira HOMOLOGA (autoridade padrão): efeito imediato, contrato gerado, licitação com a autoridade', async () => {
      const r = await homologarResultado(ctx, licId, pregoeira.token);
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ pendente_assinatura: false, valorHomologado: 890, autoridade: { nome: 'Maria Prefeita', cargo: 'Prefeita Municipal' } });
      expect(r.body.operador).toMatch(/Paula Pregoeira/);
      expect(r.body.instrumentos).toMatchObject({ tipo: 'CONTRATO', erro: null });
      expect(await contratos(licId)).toEqual([expect.objectContaining({ fornecedor_id: A.id, status: 'AGUARDANDO_ASSINATURA' })]);
      expect(await licitacao(licId)).toMatchObject({ fase: 'HOMOLOGACAO', homologacao_autoridade_nome: 'Maria Prefeita', homologacao_autoridade_cargo: 'Prefeita Municipal' });
      const [, fHom] = await formalizacoes(licId);
      expect(fHom).toMatchObject({ tipo: 'HOMOLOGACAO', status: 'EFETIVADO', autoridade_id: prefeitaId, operador_id: pregoeira.id });
      expect(fHom.arquivo_termo).toMatch(/termo-adjudicacao-homologacao-/);
      const t = await transicao(licId, 'HOMOLOGAR');
      expect(t).toMatchObject({ ator_tipo: 'USUARIO', ator_id: pregoeira.id });
      expect(t.dados).toMatchObject({ autoridade: { nome: 'Maria Prefeita' }, operador: { id: pregoeira.id } });
    });

    test('depois da homologação os termos são públicos (lista + download sem login)', async () => {
      const lista = (await http().get(`/api/resultado/publico/licitacao/${licId}/termos`)).body;
      expect(lista.map((t: any) => [t.tipo, t.autoridade_nome])).toEqual([
        ['ADJUDICACAO', 'Joao Secretario'],
        ['HOMOLOGACAO', 'Maria Prefeita'],
      ]);
      const hom = lista[1];
      const r = await baixar(`/api/resultado/publico/formalizacao/${hom.id}/arquivo`);
      expect(r.status).toBe(200);
      const txt = r.body.toString('latin1');
      expect(txt).toContain('Maria Prefeita');
      expect(txt).toContain('Registrado no sistema por Paula Pregoeira');
      expect((await baixar(`/api/uploads/${fAdj.arquivo_termo}`)).status).toBe(200);
    });
  });

  // ==========================================================================
  describe('B. ASSINATURA_ELETRONICA: pendente até a autoridade assinar', () => {
    let licId: string;

    beforeAll(async () => {
      ({ licId } = await pregaoProntoParaAdjudicar('Armario Formalizacao B'));
      exigir(await http().put('/api/resultado/configuracao/modo').set(bearer(orgao.token)).send({ modo: 'ASSINATURA_ELETRONICA' }), 200, 'modo');
    });

    test('autoridade sem e-mail → 400 (não há como assinar); nada muda', async () => {
      const r = await adjudicarResultado(ctx, licId, pregoeira.token, { autoridade_id: secretarioId });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/e-mail/);
      expect(await formalizacoes(licId)).toHaveLength(0);
    });

    test('pregoeira adjudica → PENDENTE_ASSINATURA: itens e fase intactos, termo no assinador com a autoridade; novo pedido → 409; cancelável', async () => {
      const r = await adjudicarResultado(ctx, licId, pregoeira.token);
      expect(r.status).toBe(200);
      expect(r.body.formalizacao.pendente).toMatchObject({ tipo: 'ADJUDICACAO', status: 'PENDENTE_ASSINATURA', autoridade_nome: 'Maria Prefeita' });
      expect(r.body.formalizacao.pendente.assinatura).toMatchObject({ status: 'AGUARDANDO_ASSINATURAS', signatarios: [expect.objectContaining({ nome: 'Maria Prefeita', status: 'PENDENTE' })] });
      expect(r.body.atos.adjudicar.disponivel).toBe(false);
      expect((await itens(licId))[0].status).toBe('ATIVO');
      expect((await licitacao(licId)).fase).toBe('HABILITACAO');
      const [f] = await formalizacoes(licId);
      expect(f).toMatchObject({ status: 'PENDENTE_ASSINATURA', operador_id: pregoeira.id, autoridade_email: EMAIL_PREFEITA });
      expect(f.documento_assinatura_id).toBeTruthy();
      expect((await adjudicarResultado(ctx, licId, pregoeira.token)).status).toBe(409);
      expect((await homologarResultado(ctx, licId, pregoeira.token)).status).toBe(409);
      // órgão B não cancela; o operador cancela → documento cancelado
      expect((await http().post(`/api/resultado/formalizacao/${f.id}/cancelar`).set(bearer(orgaoB.token)).send({})).status).toBe(404);
      const c = await http().post(`/api/resultado/formalizacao/${f.id}/cancelar`).set(bearer(pregoeira.token)).send({ motivo: 'Autoridade errada' });
      expect(c.status).toBe(200);
      expect(c.body.formalizacao.pendente).toBeNull();
      const [doc] = await q(`SELECT status::text AS status FROM documentos_assinatura WHERE id = $1`, [f.documento_assinatura_id]);
      expect(doc.status).toBe('CANCELADO');
      expect((await itens(licId))[0].status).toBe('ATIVO');
    });

    test('adjudicação só produz efeito com a assinatura da autoridade (link externo: CPF + código)', async () => {
      exigir(await adjudicarResultado(ctx, licId, pregoeira.token), 200, 'adjudicar (pendente)');
      const f = (await formalizacoes(licId)).find((x) => x.status === 'PENDENTE_ASSINATURA');
      await autoridadeAssina(f.documento_assinatura_id);
      await esperarStatus(f.id, 'EFETIVADO');
      expect((await itens(licId))[0]).toMatchObject({ status: 'ADJUDICADO', fornecedor_vencedor_id: A.id });
      expect((await licitacao(licId)).fase).toBe('ADJUDICACAO');
      const [efetivada] = await q(`SELECT arquivo_assinado, efetivado_em FROM formalizacoes_resultado WHERE id = $1`, [f.id]);
      expect(efetivada.arquivo_assinado).toMatch(/documentos_assinatura_avulsos\//);
      expect(efetivada.efetivado_em).toBeTruthy();
      const t = await transicao(licId, 'ADJUDICAR');
      expect(t).toMatchObject({ ator_tipo: 'USUARIO', ator_id: pregoeira.id });
      expect(t.dados).toMatchObject({ autoridade: { nome: 'Maria Prefeita' }, modo: 'ASSINATURA_ELETRONICA', formalizacao_id: f.id });
    });

    test('homologação pendente: sem contrato até a assinatura; depois, HOMOLOGACAO + contrato', async () => {
      const r = await homologarResultado(ctx, licId, pregoeira.token);
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ pendente_assinatura: true, valorHomologado: null, valorAHomologar: 890, instrumentos: null });
      expect(await contratos(licId)).toHaveLength(0);
      expect((await licitacao(licId)).fase).toBe('ADJUDICACAO');
      // público: nada antes da homologação
      expect((await http().get(`/api/resultado/publico/licitacao/${licId}/termos`)).body).toEqual([]);
      const f = (await formalizacoes(licId)).find((x) => x.tipo === 'HOMOLOGACAO');
      await autoridadeAssina(f.documento_assinatura_id);
      await esperarStatus(f.id, 'EFETIVADO');
      expect(await licitacao(licId)).toMatchObject({ fase: 'HOMOLOGACAO', homologacao_autoridade_nome: 'Maria Prefeita' });
      // o contrato é gerado DEPOIS do commit do ato (efeito da assinatura, assíncrono)
      for (let i = 0; i < 100 && !(await contratos(licId)).length; i++) await new Promise((r) => setTimeout(r, 100));
      expect(await contratos(licId)).toEqual([expect.objectContaining({ fornecedor_id: A.id, status: 'AGUARDANDO_ASSINATURA' })]);
      const lista = (await http().get(`/api/resultado/publico/licitacao/${licId}/termos`)).body;
      expect(lista.map((t: any) => [t.tipo, t.assinado])).toEqual([
        ['ADJUDICACAO', true],
        ['HOMOLOGACAO', true],
      ]);
      expect((await baixar(`/api/resultado/publico/formalizacao/${lista[1].id}/arquivo`)).status).toBe(200);
    });
  });

  // ==========================================================================
  describe('C. TERMO_EXTERNO: efeito com o termo assinado/publicação enviado', () => {
    let licId: string;
    const PDF = Buffer.from('%PDF-1.4\n% termo assinado fora do sistema - DOM edicao 123\n%%EOF\n');

    beforeAll(async () => {
      ({ licId } = await pregaoProntoParaAdjudicar('Estante Formalizacao C'));
      exigir(await http().put('/api/resultado/configuracao/modo').set(bearer(orgao.token)).send({ modo: 'TERMO_EXTERNO' }), 200, 'modo');
    });

    afterAll(async () => {
      await http().put('/api/resultado/configuracao/modo').set(bearer(orgao.token)).send({ modo: 'REGISTRO_DIRETO' });
    });

    test('sem arquivo → 400; arquivo de tipo inválido → 400; nada muda', async () => {
      const r = await adjudicarResultado(ctx, licId, pregoeira.token);
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/Diário Oficial/);
      const t = await http()
        .post(`/api/resultado/licitacao/${licId}/adjudicar`)
        .set(bearer(pregoeira.token))
        .attach('termo', Buffer.from('<html>'), { filename: 'termo.html', contentType: 'text/html' });
      expect(t.status).toBe(400);
      expect((await itens(licId))[0].status).toBe('ATIVO');
      expect(await formalizacoes(licId)).toHaveLength(0);
    });

    test('com o termo externo: adjudicação e homologação com efeito imediato; o arquivo enviado é o oficial', async () => {
      const adj = await http()
        .post(`/api/resultado/licitacao/${licId}/adjudicar`)
        .set(bearer(pregoeira.token))
        .field('autoridade_id', secretarioId)
        .field('publicacao_veiculo', 'Diario Oficial do Municipio')
        .field('publicacao_data', '2026-09-25')
        .attach('termo', PDF, { filename: 'termo-adjudicacao.pdf', contentType: 'application/pdf' });
      expect(adj.status).toBe(200);
      expect((await itens(licId))[0].status).toBe('ADJUDICADO');
      const hom = await http()
        .post(`/api/resultado/licitacao/${licId}/homologar`)
        .set(bearer(pregoeira.token))
        .attach('termo', PDF, { filename: 'termo-homologacao.pdf', contentType: 'application/pdf' });
      expect(hom.status).toBe(200);
      expect(hom.body).toMatchObject({ pendente_assinatura: false, valorHomologado: 890 });
      expect(await contratos(licId)).toHaveLength(1);
      const fs = await formalizacoes(licId);
      expect(fs.map((f) => [f.tipo, f.modo, f.status, f.autoridade_nome])).toEqual([
        ['ADJUDICACAO', 'TERMO_EXTERNO', 'EFETIVADO', 'Joao Secretario'],
        ['HOMOLOGACAO', 'TERMO_EXTERNO', 'EFETIVADO', 'Maria Prefeita'],
      ]);
      expect(fs[0].dados).toMatchObject({ publicacao: { veiculo: 'Diario Oficial do Municipio', data: '2026-09-25' } });
      expect(fs[0].arquivo_assinado).toMatch(new RegExp(`^resultados/${licId}/termo-externo-`));
      expect(fs[0].arquivo_termo).toBeTruthy(); // o sistema também guarda o termo que gerou
      const pub = await baixar(`/api/resultado/publico/formalizacao/${fs[1].id}/arquivo`);
      expect(pub.status).toBe(200);
      expect(pub.body.toString()).toContain('termo assinado fora do sistema');
    });
  });
});
