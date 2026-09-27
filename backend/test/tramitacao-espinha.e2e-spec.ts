/**
 * TRAMITAÇÃO COMO ESPINHA (F2) — docs/licitacao/PLANO-FLUXO-TRAMITACAO.md §9 (T1) e §10.
 *
 *  A. Enviar: identidade do JWT (usuário do corpo ignorado), prazo em dias
 *     úteis, despacho em PDF como folha dos autos (sequência compartilhada com
 *     as peças), aviso ao setor + chefe com WhatsApp (whatsapp_url absoluta).
 *  B. Receber: só o destino (setor, pessoa, chefe) ou ADMIN; devolver com
 *     motivo obrigatório (despacho de devolução); enviar adiante só quem está
 *     com o processo; envio a uma pessoa avisa só ela.
 *  C. Serviço interno (F3): envio automático com despacho padrão.
 *  D. Lançamento posterior (processo físico): data não futura, não anterior à
 *     movimentação anterior; "lançada em X por Y, ocorrida em Z" no despacho.
 *  E. Com quem está, linha do tempo, caixa de entrada pelo JWT.
 *  F. Autos: despachos intercalados cronologicamente, folhas gravadas.
 *  G. Avisos de prazo (véspera e vencido) idempotentes.
 *  H. Isolamento: outro órgão 404 (inclusive na escrita), fornecedor 403,
 *     anônimo 401, setor de outro órgão 400, chefe de outro órgão 400.
 */
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  AppE2E,
  FornecedorFixture,
  LicitacaoFixture,
  OrgaoFixture,
  UsuarioOrgaoFixture,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  criarUsuarioOrgao,
} from './support';
import { ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { TramitacaoService } from '../src/fase-interna/tramitacao.service';
import { paginasDoPdf } from '../src/fase-interna/conformidade/texto-pdf';
import { calendarioDoOrgao } from '../src/common/prazos/dias-uteis';
import { prazoDaTramitacao, situacaoDoPrazo } from '../src/fase-interna/tramitacao-regras';
import type { Ator } from '../src/auth/acesso/ator';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const diaBrasilia = (diasAtras = 0) => new Date(Date.now() - 3 * 3_600_000 - diasAtras * 86_400_000).toISOString().slice(0, 10);
const brData = (dia: string) => dia.split('-').reverse().join('/');

const binario = (res: any, cb: (e: Error | null, b: Buffer) => void) => {
  const partes: Buffer[] = [];
  res.on('data', (c: Buffer) => partes.push(c));
  res.on('end', () => cb(null, Buffer.concat(partes)));
};

async function pdfPaginas(rotulo: string, n: number): Promise<Buffer> {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) d.addPage([595, 842]).drawText(`${rotulo} PAGINA ${i} DE ${n}`, { x: 50, y: 700, size: 14, font: f });
  return Buffer.from(await d.save());
}

describe('Tramitação como espinha (F2)', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let F: FornecedorFixture;
  let compras: UsuarioOrgaoFixture;
  let contab1: UsuarioOrgaoFixture;
  let contab2: UsuarioOrgaoFixture;
  let chefe: UsuarioOrgaoFixture;
  let juridico: UsuarioOrgaoFixture;
  let admin: UsuarioOrgaoFixture;
  let deB: UsuarioOrgaoFixture;
  let sCompras: string;
  let sContab: string;
  let sJuridico: string;
  let sGabinete: string;
  let sDeB: string;
  let lic: LicitacaoFixture;
  const http = () => ctx.http();
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);
  const svc = () => ctx.app.get(TramitacaoService);

  const criarSetor = async (org: OrgaoFixture, nome: string) =>
    (await http().post(`/api/orgaos/${org.id}/setores`).set(bearer(org.token)).send({ nome }).expect(201)).body.id as string;
  const lotar = (u: UsuarioOrgaoFixture, setorId: string | null, telefone: string) =>
    sql(`UPDATE usuarios SET setor_id = $2, telefone = $3 WHERE id = $1`, [u.id, setorId, telefone]);
  const tramitar = (l: { id: string }, token: string, corpo: any) => http().post(`/api/fase-interna/${l.id}/tramitar`).set(bearer(token)).send(corpo);
  const receber = (id: string, token: string, corpo: any = {}) => http().put(`/api/fase-interna/tramitacoes/${id}/receber`).set(bearer(token)).send(corpo);
  const devolver = (id: string, token: string, corpo: any) => http().put(`/api/fase-interna/tramitacoes/${id}/devolver`).set(bearer(token)).send(corpo);
  const textoDoDespacho = async (id: string, token = admin.token) => {
    const r = await http().get(`/api/fase-interna/tramitacoes/${id}/despacho`).set(bearer(token)).buffer(true).parse(binario);
    expect(r.status).toBe(200);
    return ((await paginasDoPdf(r.body)) ?? []).join(' ').replace(/\s+/g, ' ');
  };
  const avisosDe = (tramitacaoId: string) =>
    sql(
      `SELECT usuario_id::text AS usuario_id, usuario_telefone, titulo, metadata FROM notificacoes
        WHERE tipo = 'PROCESSO_TRAMITADO' AND metadata->>'tramitacao_id' = $1 ORDER BY created_at`,
      [tramitacaoId],
    );
  const atorDe = (u: UsuarioOrgaoFixture): Ator => ({
    tipo: 'USUARIO', id: u.id, orgaoId: u.orgaoId, usuarioId: u.id, fornecedorId: null, admin: false, role: u.role,
  });

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Câmara Tramitação A' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura Tramitação B' });
    F = await criarFornecedor(ctx);
    compras = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Carla Compras' });
    contab1 = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Caio Contador' });
    contab2 = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Célia Contadora' });
    chefe = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Chico Chefe' });
    juridico = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Paulo Procurador' });
    admin = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.ADMIN, nome: 'Ana Admin' });
    deB = await criarUsuarioOrgao(ctx, B, { role: RoleUsuario.ADMIN, nome: 'Admin de B' });
    sCompras = await criarSetor(A, 'Compras');
    sContab = await criarSetor(A, 'Contabilidade');
    sJuridico = await criarSetor(A, 'Jurídico');
    sGabinete = await criarSetor(A, 'Gabinete');
    sDeB = await criarSetor(B, 'Setor de B');
    await lotar(compras, sCompras, '77999990001');
    await lotar(contab1, sContab, '77999990002');
    await lotar(contab2, sContab, '77999990003');
    await lotar(chefe, sGabinete, '77999990004'); // chefe lotado FORA do setor que chefia
    await lotar(juridico, sJuridico, '77999990005');
    lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
    await sql(`UPDATE licitacoes SET numero_processo = 'TRAM-001/2026' WHERE id = $1`, [lic.id]);
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('Setor: chefe (opcional)', () => {
    it('chefe de outro órgão → 400; do próprio órgão → gravado; null remove', async () => {
      await http().put(`/api/orgaos/${A.id}/setores/${sContab}`).set(bearer(A.token)).send({ chefe_usuario_id: deB.id }).expect(400);
      const r = await http().put(`/api/orgaos/${A.id}/setores/${sContab}`).set(bearer(A.token)).send({ chefe_usuario_id: chefe.id }).expect(200);
      expect(r.body.chefe_usuario_id).toBe(chefe.id);
      await http().put(`/api/orgaos/${A.id}/setores/${sGabinete}`).set(bearer(A.token)).send({ chefe_usuario_id: chefe.id }).expect(200);
      const g = await http().put(`/api/orgaos/${A.id}/setores/${sGabinete}`).set(bearer(A.token)).send({ chefe_usuario_id: null }).expect(200);
      expect(g.body.chefe_usuario_id).toBeNull();
    });
  });

  // ==========================================================================
  describe('A–C. enviar, receber, devolver, pessoa, automático', () => {
    let t1: any;
    let t2: any;
    let volta: any;

    it('peça juntada antes (DFD) ocupa a folha 1', async () => {
      const r = await http()
        .post(`/api/fase-interna/${lic.id}/documentos/DFD/anexo`)
        .set(bearer(admin.token))
        .field('data_documento', diaBrasilia(1))
        .field('numero_peca', 'DFD 001/2026')
        .attach('arquivo', await pdfPaginas('DFD', 1), { filename: 'dfd.pdf', contentType: 'application/pdf' });
      expect(r.status).toBe(201);
      expect(r.body.folha_inicial).toBe(1);
    });

    it('despacho vazio → 400; setor de outro órgão → 400', async () => {
      await tramitar(lic, compras.token, { para_setor_id: sContab, despacho: '  ' }).expect(400);
      await tramitar(lic, compras.token, { para_setor_id: sDeB, despacho: 'x' }).expect(400);
      await tramitar(lic, compras.token, { despacho: 'sem destino' }).expect(400);
    });

    it('enviar: quem envia vem do JWT (corpo ignorado), prazo em dias úteis, despacho com folha', async () => {
      const r = await tramitar(lic, compras.token, {
        para_setor_id: sContab,
        despacho: 'Encaminhe-se à Contabilidade para a reserva orçamentária.',
        prazo_dias_uteis: 3,
        usuarioId: juridico.id,
        usuarioNome: 'Nome Forjado',
        de_usuario_id: juridico.id,
        de_usuario_nome: 'Nome Forjado',
      });
      expect(r.status).toBe(201);
      t1 = r.body;
      expect(t1.de_usuario_id).toBe(compras.id);
      expect(t1.de_usuario_nome).toBe('Carla Compras');
      expect(t1.de_setor_nome).toBe('Compras'); // primeiro envio: setor de quem envia
      expect(t1.para_setor_nome).toBe('Contabilidade');
      expect(t1.prazo_dias_uteis).toBe(3);
      const esperado = prazoDaTramitacao(new Date(t1.data_envio), 3, calendarioDoOrgao(A.id))!;
      expect(new Date(t1.data_prazo).getTime()).toBe(esperado.getTime());
      expect(t1.despacho_arquivo).toMatch(/^licitacoes\//);
      expect(t1.folha_inicial).toBe(2); // mesma sequência das peças (DFD = fl. 1)
      expect(t1.folha_final).toBe(2);
      const [log] = await sql(`SELECT usuario_id, usuario_nome FROM logs_fase_interna WHERE licitacao_id = $1 AND acao = 'PROCESSO_TRAMITADO' ORDER BY created_at DESC LIMIT 1`, [lic.id]);
      expect(log.usuario_nome).toBe('Carla Compras');

      const texto = await textoDoDespacho(t1.id);
      expect(texto).toMatch(/DESPACHO DE TRAMITAÇÃO Nº 1/);
      expect(texto).toMatch(/TRAM-001\/2026/);
      expect(texto).toMatch(/Contabilidade/);
      expect(texto).toMatch(/reserva orçamentária/);
      expect(texto).toMatch(/Carla Compras/);
      expect(texto).toMatch(/horário de Brasília/);
    });

    it('aviso de chegada: setor inteiro + chefe (não quem enviou), com e-mail/WhatsApp e whatsapp_url absoluta', async () => {
      const avisos = await avisosDe(t1.id);
      expect(avisos.map((a: any) => a.usuario_id).sort()).toEqual([contab1.id, contab2.id, chefe.id].sort());
      for (const a of avisos) {
        expect(a.metadata.whatsapp_url).toBe(`http://localhost:3000/orgao/processos/${lic.id}`);
        expect(a.metadata.evento).toBe('CHEGADA');
        expect(a.usuario_telefone).toMatch(/^7799999000/);
      }
      expect(avisos[0].titulo).toMatch(/TRAM-001\/2026/);
    });

    it('com quem está: Contabilidade, desde, prazo e dias úteis restantes', async () => {
      const r = (await http().get(`/api/fase-interna/${lic.id}/tramitacao/com-quem-esta`).set(bearer(juridico.token)).expect(200)).body;
      expect(r.status).toBe('PENDENTE');
      expect(r.setor).toEqual({ id: sContab, nome: 'Contabilidade' });
      expect(r.prazo_dias_uteis).toBe(3);
      expect(r.dias_uteis_restantes).toBe(situacaoDoPrazo(r.prazo, new Date(), calendarioDoOrgao(A.id)).dias_uteis_restantes);
      expect(r.folha).toMatchObject({ folha_inicial: 2, url: `/api/fase-interna/tramitacoes/${t1.id}/despacho` });
    });

    it('receber: outro setor 403, remetente 403, outro órgão 404; destino recebe (corpo ignorado)', async () => {
      await receber(t1.id, juridico.token).expect(403);
      await receber(t1.id, compras.token).expect(403);
      await receber(t1.id, deB.token).expect(404);
      await receber(t1.id, B.token).expect(404);
      const r = await receber(t1.id, contab1.token, { usuarioId: juridico.id, usuarioNome: 'Forjado' }).expect(200);
      expect(r.body.status).toBe('RECEBIDA');
      expect(r.body.recebido_por_id).toBe(contab1.id);
      expect(r.body.recebido_por_nome).toBe('Caio Contador');
      await receber(t1.id, contab1.token).expect(400); // já recebido
    });

    it('enviar adiante: só quem está com o processo; setor → Jurídico', async () => {
      await tramitar(lic, juridico.token, { para_setor_id: sJuridico, despacho: 'Tomo para mim.' }).expect(403);
      await tramitar(lic, contab1.token, { para_setor_id: sContab, despacho: 'mesmo lugar' }).expect(400);
      const r = await tramitar(lic, contab1.token, { para_setor_id: sJuridico, despacho: 'Reserva feita. Ao Jurídico para parecer.', prazo_dias_uteis: 5 }).expect(201);
      t2 = r.body;
      expect(t2.sequencia).toBe(2);
      expect(t2.de_setor_nome).toBe('Contabilidade');
      expect(t2.folha_inicial).toBe(3);
      const [ant] = await sql(`SELECT status::text AS status FROM tramitacoes_processo WHERE id = $1`, [t1.id]);
      expect(ant.status).toBe('CONCLUIDA');
      // Jurídico sem chefe: só o setor
      expect((await avisosDe(t2.id)).map((a: any) => a.usuario_id)).toEqual([juridico.id]);
    });

    it('devolver: motivo obrigatório; volta ao setor de origem com despacho de devolução nos autos', async () => {
      await devolver(t2.id, juridico.token, { motivo: '  ' }).expect(400);
      await devolver(t2.id, compras.token, { motivo: 'não sou do destino' }).expect(403);
      await devolver(t2.id, deB.token, { motivo: 'outro órgão' }).expect(404);
      const r = await devolver(t2.id, juridico.token, { motivo: 'Falta a dotação completa.', usuarioId: compras.id }).expect(200);
      volta = r.body;
      expect(volta.para_setor_id).toBe(sContab);
      expect(volta.devolucao_de_id).toBe(t2.id);
      expect(volta.despacho).toBe('DEVOLUÇÃO: Falta a dotação completa.');
      expect(volta.de_usuario_id).toBe(juridico.id);
      expect(volta.folha_inicial).toBe(4);
      const [dev] = await sql(`SELECT status::text AS status, motivo_devolucao FROM tramitacoes_processo WHERE id = $1`, [t2.id]);
      expect(dev).toEqual({ status: 'DEVOLVIDA', motivo_devolucao: 'Falta a dotação completa.' });
      expect(await textoDoDespacho(volta.id)).toMatch(/DESPACHO DE DEVOLUÇÃO Nº 3/);
      // chefe da Contabilidade também é avisado da devolução
      expect((await avisosDe(volta.id)).map((a: any) => a.usuario_id).sort()).toEqual([contab1.id, contab2.id, chefe.id].sort());
    });

    it('chefe (lotado fora) recebe pelo setor que chefia', async () => {
      const r = await receber(volta.id, chefe.token).expect(200);
      expect(r.body.recebido_por_id).toBe(chefe.id);
    });

    it('envio a uma PESSOA avisa só ela (nem o setor, nem o chefe)', async () => {
      const r = await tramitar(lic, admin.token, { para_usuario_id: contab2.id, despacho: 'À Célia, para refazer a informação orçamentária.' }).expect(201);
      expect(r.body.para_usuario_id).toBe(contab2.id);
      expect(r.body.para_setor_id).toBe(sContab); // setor da pessoa
      expect((await avisosDe(r.body.id)).map((a: any) => a.usuario_id)).toEqual([contab2.id]);
      // a pessoa de destino recebe; colega do mesmo setor também pode (setor de destino)
      await receber(r.body.id, contab2.token).expect(200);
    });

    it('serviço interno (F3): envio automático com despacho padrão, sem exigir posse', async () => {
      const t = await svc().enviar({
        licitacaoId: lic.id,
        para: { setor_id: sCompras },
        automatico: true,
        finalidade: 'a pesquisa de preços',
        prazo_dias_uteis: 30,
        ator: atorDe(juridico), // não está com o processo — o sistema encaminha
      });
      expect(t.automatico).toBe(true);
      expect(t.despacho).toBe('Encaminhe-se ao(à) Compras para a pesquisa de preços.');
      expect(t.de_usuario_id).toBe(juridico.id);
      expect(t.folha_inicial).toBe(6);
      const texto = await textoDoDespacho(t.id);
      expect(texto).toMatch(/registrado automaticamente/);
      expect((await avisosDe(t.id)).map((a: any) => a.usuario_id)).toEqual([compras.id]);
    });
  });

  // ==========================================================================
  describe('D. lançamento de movimentação que já aconteceu (processo físico)', () => {
    let fis: LicitacaoFixture;
    let e1: any;

    beforeAll(async () => {
      fis = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
    });

    it('envio com data futura → 400; data passada → lançamento posterior com quem lançou', async () => {
      await tramitar(fis, compras.token, { para_setor_id: sContab, despacho: 'Físico.', data_ocorrencia: diaBrasilia(-1) }).expect(400);
      const r = await tramitar(fis, compras.token, { para_setor_id: sContab, despacho: 'Processo físico enviado à Contabilidade.', data_ocorrencia: diaBrasilia(5) }).expect(201);
      e1 = r.body;
      expect(e1.lancado_posteriormente).toBe(true);
      expect(e1.lancado_por_id).toBe(compras.id);
      expect(e1.lancado_por_nome).toBe('Carla Compras');
      expect(new Date(e1.data_ocorrencia).getTime()).toBeLessThan(new Date(e1.data_envio).getTime());
      const texto = await textoDoDespacho(e1.id);
      expect(texto).toMatch(/lançada posteriormente/i);
      expect(texto).toMatch(new RegExp(`ocorrida em ${brData(diaBrasilia(5)).replace(/\//g, '\\/')}`));
      expect(texto).toMatch(/por Carla Compras/);
    });

    it('recebimento anterior ao envio → 400; futuro → 400; data válida → recebimento lançado', async () => {
      await receber(e1.id, contab1.token, { data_ocorrencia: diaBrasilia(6) }).expect(400);
      await receber(e1.id, contab1.token, { data_ocorrencia: diaBrasilia(-2) }).expect(400);
      const r = await receber(e1.id, contab1.token, { data_ocorrencia: diaBrasilia(4) }).expect(200);
      expect(r.body.recebimento_lancado_posteriormente).toBe(true);
      expect(r.body.recebimento_lancado_em).toBeTruthy();
      expect(new Date(r.body.data_recebimento).toISOString().slice(0, 10) <= diaBrasilia(3)).toBe(true);
    });

    it('envio seguinte não pode ser anterior ao recebimento', async () => {
      await tramitar(fis, contab1.token, { para_setor_id: sJuridico, despacho: 'x', data_ocorrencia: diaBrasilia(5) }).expect(400);
      const r = await tramitar(fis, contab1.token, { para_setor_id: sJuridico, despacho: 'Ao Jurídico.', data_ocorrencia: diaBrasilia(2) }).expect(201);
      expect(r.body.lancado_posteriormente).toBe(true);
    });

    it('linha do tempo: datas em que ocorreu, em ordem, com lançamento posterior marcado', async () => {
      const ev = (await http().get(`/api/fase-interna/${fis.id}/tramitacao/linha-do-tempo`).set(bearer(juridico.token)).expect(200)).body;
      expect(ev.map((e: any) => e.tipo)).toEqual(['ENVIO', 'RECEBIMENTO', 'ENVIO']);
      expect(ev.every((e: any) => e.lancado_posteriormente)).toBe(true);
      expect(ev[0].lancado_por).toEqual({ id: compras.id, nome: 'Carla Compras' });
      expect(ev[0].folha.url).toBe(`/api/fase-interna/tramitacoes/${e1.id}/despacho`);
      const datas = ev.map((e: any) => e.data);
      expect([...datas].sort()).toEqual(datas);
    });
  });

  // ==========================================================================
  describe('E. linha do tempo e caixa de entrada pelo JWT', () => {
    it('linha do tempo do processo: envios, recebimentos e a devolução (uma vez)', async () => {
      const ev = (await http().get(`/api/fase-interna/${lic.id}/tramitacao/linha-do-tempo`).set(bearer(compras.token)).expect(200)).body;
      expect(ev.map((e: any) => e.tipo)).toEqual(['ENVIO', 'RECEBIMENTO', 'ENVIO', 'DEVOLUCAO', 'RECEBIMENTO', 'ENVIO', 'RECEBIMENTO', 'ENVIO']);
      const dev = ev.find((e: any) => e.tipo === 'DEVOLUCAO');
      expect(dev.motivo).toBe('Falta a dotação completa.');
      expect(dev.por.nome).toBe('Paulo Procurador');
      expect(ev.filter((e: any) => e.tipo !== 'RECEBIMENTO').every((e: any) => e.folha?.folha_inicial > 1)).toBe(true);
    });

    it('caixa: servidor vê o próprio setor e os envios a ele; outro setor → 403; usuário do corpo ignorado', async () => {
      const minha = (await http().get('/api/fase-interna/tramitacoes/caixa-entrada').set(bearer(compras.token)).expect(200)).body;
      expect(minha.some((t: any) => t.licitacao_id === lic.id && t.para_setor_id === sCompras)).toBe(true);
      expect(minha.every((t: any) => t.para_setor_id === sCompras || t.para_usuario_id === compras.id)).toBe(true);
      const contab = (await http().get('/api/fase-interna/tramitacoes/caixa-entrada').set(bearer(contab2.token)).expect(200)).body;
      expect(contab.some((t: any) => t.licitacao_id === lic.id)).toBe(false); // o processo não está mais na Contabilidade
      await http().get(`/api/fase-interna/tramitacoes/caixa-entrada?setorId=${sJuridico}`).set(bearer(compras.token)).expect(403);
      await http().get(`/api/fase-interna/tramitacoes/caixa-entrada?usuarioId=${contab1.id}`).set(bearer(compras.token)).expect(403);
      // órgão: todas do órgão (nenhuma de B)
      const todas = (await http().get('/api/fase-interna/tramitacoes/caixa-entrada').set(bearer(A.token)).expect(200)).body;
      expect(todas.every((t: any) => t.licitacao.orgao_id === A.id)).toBe(true);
      await http().get(`/api/fase-interna/tramitacoes/caixa-entrada?setorId=${sCompras}`).set(bearer(B.token)).expect(403);
    });
  });

  // ==========================================================================
  describe('F. autos: despachos como folhas, em ordem cronológica', () => {
    it('os autos trazem o DFD e depois os despachos na ordem; folhas regravadas na tramitação', async () => {
      const g = await http().post(`/api/licitacoes/${lic.id}/processo-pdf/gerar`).set(bearer(admin.token));
      expect(g.status).toBe(201);
      const limite = Date.now() + 90_000;
      let s: any;
      do {
        s = (await http().get(`/api/licitacoes/${lic.id}/processo-pdf/situacao`).set(bearer(admin.token)).expect(200)).body;
        if (s.situacao === 'PRONTO') break;
        await new Promise((r) => setTimeout(r, 200));
      } while (Date.now() < limite);
      expect(s.situacao).toBe('PRONTO');
      const r = await http().get(`/api/licitacoes/${lic.id}/processo-pdf`).set(bearer(admin.token)).buffer(true).parse(binario);
      expect(r.status).toBe(200);
      const paginas = ((await paginasDoPdf(r.body)) ?? []).map((t) => t.replace(/\s+/g, ' '));
      const onde = (re: RegExp) => paginas.findIndex((t, i) => i > 2 && re.test(t));
      const dfd = onde(/DFD PAGINA 1 DE 1/);
      const d1 = onde(/DESPACHO DE TRAMITAÇÃO Nº 1\b/);
      const d2 = onde(/DESPACHO DE TRAMITAÇÃO Nº 2\b/);
      const d3 = onde(/DESPACHO DE DEVOLUÇÃO Nº 3\b/);
      const d5 = onde(/DESPACHO DE TRAMITAÇÃO Nº 5\b/);
      expect(dfd).toBeGreaterThan(2);
      expect(d1).toBeGreaterThan(dfd);
      expect(d2).toBeGreaterThan(d1);
      expect(d3).toBeGreaterThan(d2);
      expect(d5).toBeGreaterThan(d3);
      const idx = s.indice as any[];
      const e1 = idx.find((e) => /Despacho de tramitação nº 1:/.test(e.titulo));
      expect(e1).toBeTruthy();
      expect(e1.tramitacao_id).toBeTruthy();
      const [t] = await sql(`SELECT folha_inicial, folha_final FROM tramitacoes_processo WHERE id = $1`, [e1.tramitacao_id]);
      expect(t).toEqual({ folha_inicial: e1.folha_inicial, folha_final: e1.folha_final });
    });
  });

  // ==========================================================================
  describe('G. avisos de prazo (véspera e vencido), idempotentes', () => {
    it('véspera e vencido avisam uma vez só', async () => {
      const atual = await svc().tramitacaoAtual(lic.id);
      const prazo = new Date(atual!.data_prazo);
      const antes = new Date(prazo.getTime() - 3_600_000); // vence hoje → véspera
      await svc().avisarPrazos(antes);
      await svc().avisarPrazos(antes);
      let avisos = (await avisosDe(atual!.id)).filter((a: any) => a.metadata.evento === 'VESPERA');
      expect(avisos.map((a: any) => a.usuario_id)).toEqual([compras.id]);
      const depois = new Date(prazo.getTime() + 86_400_000);
      await svc().avisarPrazos(depois);
      await svc().avisarPrazos(depois);
      avisos = (await avisosDe(atual!.id)).filter((a: any) => a.metadata.evento === 'VENCIDO');
      expect(avisos.length).toBe(1);
      expect(avisos[0].metadata.whatsapp_url).toBe(`http://localhost:3000/orgao/processos/${lic.id}`);
      const [t] = await sql(`SELECT aviso_vespera_em, aviso_vencido_em FROM tramitacoes_processo WHERE id = $1`, [atual!.id]);
      expect(t.aviso_vespera_em).toBeTruthy();
      expect(t.aviso_vencido_em).toBeTruthy();
    });
  });

  // ==========================================================================
  describe('H. isolamento', () => {
    it('outro órgão: 404 em leitura E escrita; fornecedor 403; anônimo 401', async () => {
      const atual = await svc().tramitacaoAtual(lic.id);
      const leituras = [
        `/api/fase-interna/${lic.id}/tramitacao/com-quem-esta`,
        `/api/fase-interna/${lic.id}/tramitacao/linha-do-tempo`,
        `/api/fase-interna/${lic.id}/tramitacoes`,
        `/api/fase-interna/tramitacoes/${atual!.id}/despacho`,
      ];
      for (const rota of leituras) {
        await http().get(rota).set(bearer(B.token)).expect(404);
        await http().get(rota).set(bearer(deB.token)).expect(404);
        await http().get(rota).set(bearer(F.token)).expect(403);
        await http().get(rota).expect(401);
      }
      await tramitar(lic, B.token, { para_setor_id: sDeB, despacho: 'invasão' }).expect(404);
      await tramitar(lic, deB.token, { para_setor_id: sCompras, despacho: 'invasão' }).expect(404);
      await receber(atual!.id, deB.token).expect(404);
      await devolver(atual!.id, B.token, { motivo: 'invasão' }).expect(404);
      await tramitar(lic, F.token, { para_setor_id: sCompras, despacho: 'x' }).expect(403);
      await tramitar(lic, '', { para_setor_id: sCompras, despacho: 'x' }).expect(401);
    });

    it('serviço interno também isola: ator de outro órgão → 404', async () => {
      await expect(
        svc().enviar({ licitacaoId: lic.id, para: { setor_id: sDeB }, automatico: true, ator: atorDe(deB) }),
      ).rejects.toMatchObject({ status: 404 });
    });
  });
});
