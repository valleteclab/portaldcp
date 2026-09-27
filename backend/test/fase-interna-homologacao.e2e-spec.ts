/**
 * FASE INTERNA — correções da HOMOLOGAÇÃO de 26/09/2026 (documentos, versões
 * e "Editar processo"). docs/fase interna/relatorio-homologacao-portaldcp.md.
 *
 *  E1. "Editar processo" → Salvar dava 500 (datas vazias do cronograma viravam
 *      "Invalid Date"): PUT com as datas vazias salva e troca o fundamento
 *      (art. 75, II → VIII); a troca REGERA as minutas (versão nova, com o
 *      histórico); data lixo → 400 com a mensagem em português.
 *  E2. Nenhum "{{…}}" cru nos PDFs (DFD, TR, despacho, minutas, autos).
 *  E3. "Gerar TR" de novo = versão nova (a diligência do parecer é sanada com a
 *      correção); o PDF do TR traz a tabela de itens; o valor estimado vem da
 *      pesquisa (a conformidade acusa o TR defasado — PRECO-04); seções
 *      vazias com nota, não "—".
 *  Textos: "Dispensa eletrônica" (nunca DISPENSA_ELETRONICA), o NOME do agente,
 *      o despacho sem "A definir" (cadastro do órgão sem município), "12 meses"
 *      (nunca "12.0000 MES").
 *  Autos: capa, termo de abertura, índice, ordem lógica das peças (DFD, TR,
 *      pesquisa e certidão, reserva, autorização, designação anexada, relatório,
 *      minutas, parecer, termo de justificativas), carimbo "Fl." contínuo em
 *      todas as folhas, o PDF anexado com as páginas originais, só a versão
 *      vigente de cada peça.
 *  Isolamento: o PUT do processo só pelo órgão dono (outro órgão, fornecedor e
 *      anônimo recusados; nada gravado).
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
  gerarCnpj,
} from './support';
import { ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { UnidadeMedida } from '../src/itens/entities/item-licitacao.entity';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { TarefasService } from '../src/fase-interna/tarefas/tarefas.service';
import { MinutasSubscriber } from '../src/fase-interna/telas/minutas.subscriber';
import { ModeloDocumentoService } from '../src/fase-interna/modelo-documento.service';
import { paginasDoPdf } from '../src/fase-interna/conformidade/texto-pdf';
import { carimboDeFolha } from '../src/licitacoes/autos/autos-regras';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const hoje = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
const somarDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const ANO = Number(hoje().slice(0, 4));

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

/** O que NÃO pode aparecer em peça nenhuma (relatório da homologação). */
function semDefeitosDeTexto(texto: string, onde: string) {
  const achados = [
    /\{\{/.test(texto) && 'variável crua {{…}}',
    /DISPENSA_ELETRONICA|MENOR_PRECO|ART75_/.test(texto) && 'código interno',
    /A definir/i.test(texto) && '"A definir"',
    /\d\.0000\b/.test(texto) && 'quantidade "12.0000"',
    /Agente de contratação: Agente de contratação/.test(texto) && 'agente sem nome',
  ].filter(Boolean);
  expect({ onde, achados }).toEqual({ onde, achados: [] });
}

describe('Fase interna — correções da homologação (documentos, versões, Editar processo)', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let F: FornecedorFixture;
  let agente: UsuarioOrgaoFixture;
  let autoridade: UsuarioOrgaoFixture;
  let juridico: UsuarioOrgaoFixture;
  const http = () => ctx.http();
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);
  const esperar = async () => {
    await ctx.app.get(MinutasSubscriber).aguardarPendentes();
    await ctx.app.get(TarefasService).aguardarPendentes();
  };
  const naoSeAplica = (lic: { id: string }, tipo: string) =>
    http().post(`/api/fase-interna/${lic.id}/instrucao/${tipo}/nao-se-aplica`).set(bearer(agente.token)).send({ justificativa: `Peça ${tipo} dispensada nesta contratação direta (art. 72, I).` });
  const textoDaPeca = async (documentoId: string) => {
    const r = await http().get(`/api/fase-interna/documento/${documentoId}/arquivo`).set(bearer(agente.token)).buffer(true).parse(binario).expect(200);
    return ((await paginasDoPdf(r.body as Buffer)) ?? []).map((t) => t.replace(/\s+/g, ' ')).join('\n');
  };
  const versoes = (lic: { id: string }, tipo: string) =>
    sql(`SELECT versao, versao_atual, status::text AS status FROM documentos_fase_interna WHERE licitacao_id = $1 AND tipo::text = $2 ORDER BY versao`, [lic.id, tipo]);
  const papeis = (u: UsuarioOrgaoFixture, lista: string[]) =>
    http().put(`/api/fase-interna/configuracao/usuarios/${u.id}`).set(bearer(A.token)).send({ papeis: lista, setor_id: null }).expect(200);

  beforeAll(async () => {
    ctx = await criarApp();
    await ctx.app.get(ModeloDocumentoService).seedModelosPadrao();
    A = await criarOrgao(ctx, { nome: 'Câmara Homologação A' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura Homologação B' });
    F = await criarFornecedor(ctx);
    // cadastro do órgão INCOMPLETO, como no teste de homologação ("A definir")
    await sql(`UPDATE orgaos SET cidade = 'A definir' WHERE id = $1`, [A.id]);
    agente = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.PREGOEIRO, nome: 'Joana Agente' });
    autoridade = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Presidente Homologação' });
    juridico = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Paula Procuradora' });
    await papeis(autoridade, ['AUTORIDADE']);
    await papeis(juridico, ['JURIDICO']);
    await http()
      .put('/api/fase-interna/configuracao')
      .set(bearer(A.token))
      .send({ modo: 'SIMPLES', signatarios_autorizacao: [{ usuario_id: autoridade.id, papel: 'Presidente' }] })
      .expect(200);
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('E1. Editar processo: datas vazias não dão 500; trocar o fundamento regera as minutas', () => {
    let lic: LicitacaoFixture;
    /** O corpo que a tela "Editar processo" manda na fase interna (cronograma vazio). */
    const corpoDaTela = (extra: Record<string, unknown> = {}) => ({
      objeto: 'Licença de software de gestão e implantação',
      modalidade: 'DISPENSA_ELETRONICA',
      tipo_contratacao: 'COMPRA',
      criterio_julgamento: 'MENOR_PRECO',
      modo_disputa: 'ABERTO',
      data_publicacao_edital: '',
      data_limite_impugnacao: '',
      data_inicio_acolhimento: '',
      data_fim_acolhimento: '',
      data_abertura_sessao: '',
      intervalo_minimo_lances: 0,
      tempo_prorrogacao: 2,
      pregoeiro_id: agente.id,
      sigilo_orcamento: 'PUBLICO',
      ...extra,
    });

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      await http().post(`/api/fase-interna/${lic.id}/minutas/TODAS/gerar`).set(bearer(agente.token)).expect(201);
    });

    it('PUT com as datas vazias salva (200) e troca o fundamento de art. 75, II para VIII', async () => {
      const r = await http().put(`/api/licitacoes/${lic.id}`).set(bearer(A.token)).send(corpoDaTela({ fundamento_legal: 'ART75_VIII' }));
      expect(r.status).toBe(200);
      const [l] = await sql(
        `SELECT fundamento_legal, data_publicacao_edital, data_limite_impugnacao, data_inicio_acolhimento, data_fim_acolhimento, data_abertura_sessao FROM licitacoes WHERE id = $1`,
        [lic.id],
      );
      expect(l).toEqual({
        fundamento_legal: 'ART75_VIII',
        data_publicacao_edital: null,
        data_limite_impugnacao: null,
        data_inicio_acolhimento: null,
        data_fim_acolhimento: null,
        data_abertura_sessao: null,
      });
    });

    it('as minutas geradas acompanham o novo fundamento, cada uma em VERSÃO NOVA (a anterior no histórico)', async () => {
      await esperar();
      const m = (await http().get(`/api/fase-interna/${lic.id}/minutas`).set(bearer(agente.token)).expect(200)).body;
      expect(m.pecas.MC.secoes.vinculacao).toContain('art. 75, VIII');
      expect(m.pecas.ME.secoes.preambulo).toContain('art. 75, VIII');
      expect(m.pecas.RAG.secoes.enquadramento).toContain('art. 75, VIII');
      for (const t of ['RAG', 'ME', 'MC']) {
        expect(m.pecas[t].peca).toMatchObject({ versao: 2, desatualizada: null, editada: false });
        expect(await versoes(lic, t)).toEqual([
          { versao: 1, versao_atual: false, status: 'SUBSTITUIDO' },
          { versao: 2, versao_atual: true, status: 'EM_ELABORACAO' },
        ]);
        semDefeitosDeTexto(Object.values(m.pecas[t].secoes).join(' '), `minuta ${t}`);
      }
      // salvar de novo sem mudança: nada de versão nova
      await http().put(`/api/licitacoes/${lic.id}`).set(bearer(A.token)).send(corpoDaTela({ fundamento_legal: 'ART75_VIII' })).expect(200);
      await esperar();
      expect((await versoes(lic, 'MC')).length).toBe(2);
    });

    it('data lixo / dia inexistente → 400 com a mensagem em português; nada gravado', async () => {
      const r = await http().put(`/api/licitacoes/${lic.id}`).set(bearer(A.token)).send(corpoDaTela({ data_abertura_sessao: 'amanhã cedo', fundamento_legal: 'ART75_II' }));
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/Abertura da sessão \("amanhã cedo"\) — data inválida/);
      expect(r.body.campos_invalidos.map((c: any) => c.campo)).toEqual(['data_abertura_sessao']);
      const r2 = await http().put(`/api/licitacoes/${lic.id}`).set(bearer(A.token)).send({ data_publicacao_edital: '2026-02-31T10:00' });
      expect(r2.status).toBe(400);
      const r3 = await http().put(`/api/licitacoes/${lic.id}`).set(bearer(A.token)).send({ valor_total_estimado: 'muito' });
      expect(r3.status).toBe(400);
      const [l] = await sql(`SELECT fundamento_legal FROM licitacoes WHERE id = $1`, [lic.id]);
      expect(l.fundamento_legal).toBe('ART75_VIII');
    });

    it('datas válidas continuam gravando', async () => {
      await http().put(`/api/licitacoes/${lic.id}`).set(bearer(A.token)).send({ data_publicacao_edital: `${somarDias(hoje(), 5)}T09:00:00` }).expect(200);
      const [l] = await sql(`SELECT data_publicacao_edital FROM licitacoes WHERE id = $1`, [lic.id]);
      expect(l.data_publicacao_edital).not.toBeNull();
    });

    it('isolamento: outro órgão, fornecedor e anônimo não editam (nada gravado)', async () => {
      const corpo = corpoDaTela({ fundamento_legal: 'ART75_II' });
      expect([403, 404]).toContain((await http().put(`/api/licitacoes/${lic.id}`).set(bearer(B.token)).send(corpo)).status);
      expect((await http().put(`/api/licitacoes/${lic.id}`).set(bearer(F.token)).send(corpo)).status).toBe(403);
      expect((await http().put(`/api/licitacoes/${lic.id}`).send(corpo)).status).toBe(401);
      const [l] = await sql(`SELECT fundamento_legal FROM licitacoes WHERE id = $1`, [lic.id]);
      expect(l.fundamento_legal).toBe('ART75_VIII');
    });
  });

  // ==========================================================================
  describe('E2/E3 e textos: do DFD aos autos, com as peças geradas no sistema', () => {
    let lic: LicitacaoFixture;
    let diligenciaId: string;
    let docTr1: string;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, {
        extras: { pregoeiro_id: agente.id },
        itens: [
          { descricao: 'Licença mensal do software', quantidade: 12, valor_unitario_estimado: 1600, unidade_medida: UnidadeMedida.MES },
          { descricao: 'Implantação e treinamento', quantidade: 1, valor_unitario_estimado: 4800, unidade_medida: UnidadeMedida.SERVICO },
        ],
      });
      await sql(`UPDATE itens_licitacao SET codigo_catser = '27502', tipo_item = 'SERVICO' WHERE licitacao_id = $1 AND numero_item = 1`, [lic.id]);
      await sql(`UPDATE itens_licitacao SET codigo_catser = '16837', tipo_item = 'SERVICO' WHERE licitacao_id = $1 AND numero_item = 2`, [lic.id]);
    });

    it('DFD gerado: cabeçalho com o órgão, o CNPJ e o processo; "12 meses"; sem "{{"', async () => {
      await http()
        .put(`/api/fase-interna/${lic.id}/dfd`)
        .set(bearer(agente.token))
        .send({
          responsavel_id: agente.id,
          fiscal_sugerido_id: agente.id,
          sem_pca: true,
          justificativa_sem_pca: 'Demanda surgida após a aprovação do PCA (art. 12, §1º).',
          necessidade_html: '<p>Gestão do conteúdo da TV Câmara sem ferramenta integrada.</p>',
        })
        .expect(200);
      const g = (await http().post(`/api/fase-interna/${lic.id}/documentos/DFD/gerar`).set(bearer(agente.token)).expect(201)).body;
      expect(g.secoes.quantidade).toMatch(/Licença mensal do software — 12 meses \(CATSER 27502\)/);
      const texto = await textoDaPeca(g.peca.documento_id);
      semDefeitosDeTexto(texto, 'PDF do DFD');
      expect(texto).toMatch(/Câmara Homologação A/);
      expect(texto).toMatch(new RegExp(`CNPJ: ${A.cnpj.replace(/[./-]/g, '.')}`));
      expect(texto).toMatch(new RegExp(`Processo Administrativo nº ${lic.numero_processo}`));
      expect(texto).toMatch(/12 meses/);
      // ETP e riscos: "não se aplica" (art. 72, I), como no teste de homologação
      expect((await naoSeAplica(lic, 'ETP')).status).toBe(201);
      expect((await naoSeAplica(lic, 'AR')).status).toBe(201);
    });

    it('TR gerado ANTES da pesquisa: valor preliminar; tabela de itens no PDF; seções vazias com nota', async () => {
      const g = (await http().post(`/api/fase-interna/${lic.id}/documentos/TR/gerar`).set(bearer(agente.token)).expect(201)).body;
      docTr1 = g.peca.documento_id;
      expect(g.peca.versao).toBe(1);
      expect(g.secoes.estimativa_valor_tr).toMatch(/R\$\s?24\.000,00, a ser confirmado pela pesquisa de preços/);
      expect(g.secoes.selecao_habilitacao).toMatch(/Forma de seleção do fornecedor: Dispensa eletrônica, com fundamento na Lei 14\.133\/2021, art\. 75, II/);
      expect(g.secoes.descricao).toMatch(/tabela de itens/);
      expect(g.secoes.modelo_gestao).toMatch(/Fiscal sugerido no DFD: Joana Agente/);
      const texto = await textoDaPeca(docTr1);
      semDefeitosDeTexto(texto, 'PDF do TR v1');
      expect(texto).toMatch(/Itens da contratação/);
      expect(texto).toMatch(/CATSER 27502/);
      expect(texto).toMatch(/CATSER 16837/);
      expect(texto).toMatch(/R\$\s?19\.200,00/);
      expect(texto).toMatch(/Seção não preenchida nesta versão do documento/);
    });

    it('pesquisa emitida (menor preço R$ 22.600,00); a conformidade acusa o TR defasado (PRECO-04)', async () => {
      for (const inc of ['I', 'II']) {
        await http().put(`/api/fase-interna/${lic.id}/pesquisa/parametros/${inc}`).set(bearer(agente.token)).send({ situacao: 'SEM_RETORNO', data_consulta: hoje(), resultado: '0 resultados' }).expect(200);
      }
      const propor = (fornecedor: string, v1: number, v2: number) =>
        http()
          .post(`/api/fase-interna/${lic.id}/pesquisa/propostas`)
          .set(bearer(agente.token))
          .send({ fornecedor, cnpj: gerarCnpj(), data_emissao: hoje(), validade_ate: somarDias(hoje(), 90), itens: [{ item_numero: 1, valor_unitario: v1 }, { item_numero: 2, valor_unitario: v2 }] })
          .expect(201);
      await propor('Fornecedor A Ltda', 1550, 4000);
      await propor('Fornecedor B Ltda', 1600, 4800);
      await propor('Fornecedor C Ltda', 1620, 5000);
      await http()
        .put(`/api/fase-interna/${lic.id}/pesquisa/metodo`)
        .set(bearer(agente.token))
        .send({
          metodo: 'MENOR',
          justificativa_metodo: 'Menor valor entre propostas equivalentes (regulamento do órgão).',
          justificativa_fornecedores: 'Empresas do ramo com atuação comprovada e cadastro ativo.',
          publicacao_prevista: somarDias(hoje(), 10),
        })
        .expect(200);
      const em = (await http().post(`/api/fase-interna/${lic.id}/pesquisa/emitir`).set(bearer(agente.token)).send({}).expect(201)).body;
      expect(em.resumo.total_adotado).toBe(22600);
      await esperar();
      const conf = (await http().post(`/api/fase-interna/${lic.id}/conformidade/revisar`).set(bearer(agente.token)).expect(201)).body;
      const p4 = conf.achados.find((a: any) => a.regra === 'PRECO-04');
      expect(p4).toBeTruthy();
      expect(p4.severidade).toBe('ATENCAO');
      expect(p4.mensagem).toMatch(/R\$\s?24\.000,00.*R\$\s?22\.600,00/);
    });

    it('"Gerar TR" de novo = VERSÃO NOVA com o valor da PESQUISA; a v1 fica no histórico; PRECO-04 some', async () => {
      const g = (await http().post(`/api/fase-interna/${lic.id}/documentos/TR/gerar`).set(bearer(agente.token)).expect(201)).body;
      expect(g.peca.versao).toBe(2);
      expect(g.peca.documento_id).not.toBe(docTr1);
      expect(g.secoes.estimativa_valor_tr).toMatch(/R\$\s?22\.600,00, apurado na pesquisa de preços constante dos autos \(art\. 23 da Lei nº 14\.133\/2021\), pelo método do menor preço/);
      expect(await versoes(lic, 'TR')).toEqual([
        { versao: 1, versao_atual: false, status: 'SUBSTITUIDO' },
        { versao: 2, versao_atual: true, status: 'EM_ELABORACAO' },
      ]);
      const texto = await textoDaPeca(g.peca.documento_id);
      semDefeitosDeTexto(texto, 'PDF do TR v2');
      expect(texto).toMatch(/R\$\s?1\.550,00/); // unitário da pesquisa na tabela
      expect(texto).toMatch(/R\$\s?18\.600,00/);
      expect(texto).toMatch(/R\$\s?22\.600,00/);
      await esperar();
      const conf = (await http().post(`/api/fase-interna/${lic.id}/conformidade/revisar`).set(bearer(agente.token)).expect(201)).body;
      expect(conf.achados.filter((a: any) => a.regra === 'PRECO-04' && a.status !== 'RESOLVIDO')).toEqual([]);
    });

    it('reserva emitida e despacho de autorização: sem "A definir" (cadastro sem município), só a data', async () => {
      const dotacao = (
        await http()
          .post('/api/orcamento/dotacoes')
          .set(bearer(agente.token))
          .send({ exercicio: ANO, unidade_orcamentaria: '01.01.000 — Câmara', projeto_atividade: '2.001 — Manutenção', elemento_despesa: '3.3.90.40', fonte_recurso: '500', saldo: 100000 })
          .expect(201)
      ).body.id;
      const ldo = (await http().post('/api/orcamento/leis').set(bearer(agente.token)).send({ tipo: 'LDO', numero: `0001/${ANO - 1}`, exercicio: ANO }).expect(201)).body.id;
      await http()
        .put(`/api/fase-interna/${lic.id}/reserva`)
        .set(bearer(agente.token))
        .send({ dotacao_id: dotacao, lei_ldo_id: ldo, linhas: [{ exercicio: ANO, valor: 10000 }, { exercicio: ANO + 1, valor: 12600 }], declaracao_adequacao: true, declaracao_lrf: true })
        .expect(200);
      await http().post(`/api/fase-interna/${lic.id}/reserva/emitir`).set(bearer(agente.token)).expect(201);

      const aa = (await http().post(`/api/fase-interna/${lic.id}/autorizacao/gerar`).set(bearer(agente.token)).expect(201)).body;
      const [despacho] = await sql(`SELECT id::text AS id, dados_estruturados FROM documentos_fase_interna WHERE licitacao_id = $1 AND tipo::text = 'AA' AND versao_atual`, [lic.id]);
      const textoDespacho = String(despacho.dados_estruturados.autorizacao);
      semDefeitosDeTexto(textoDespacho, 'despacho');
      expect(textoDespacho).toMatch(/<p>\d{2} de [a-zç]+ de \d{4}\.<\/p>/);
      expect(textoDespacho).toMatch(/R\$\s?22\.600,00/);
      semDefeitosDeTexto(await textoDaPeca(despacho.id), 'PDF do despacho');
      expect(aa).toBeTruthy();
      await http().post(`/api/fase-interna/${lic.id}/autorizacao/enviar`).set(bearer(agente.token)).send({}).expect(201);
      await http().post(`/api/fase-interna/${lic.id}/autorizacao/assinar`).set(bearer(autoridade.token)).send({}).expect(201);
    });

    it('designação anexada (PDF de 2 páginas) e minutas: "Dispensa eletrônica", o NOME do agente, sem código interno', async () => {
      const dp = await http()
        .post(`/api/fase-interna/${lic.id}/documentos/DP/anexo`)
        .set(bearer(agente.token))
        .field('data_documento', hoje())
        .field('numero_peca', 'Portaria 089/2024')
        .attach('arquivo', await pdfPaginas('PORTARIAANEXA', 2), { filename: 'portaria.pdf', contentType: 'application/pdf' });
      expect(dp.status).toBe(201);
      const m = (await http().post(`/api/fase-interna/${lic.id}/minutas/TODAS/gerar`).set(bearer(agente.token)).expect(201)).body;
      expect(m.pecas.RAG.secoes.identificacao).toMatch(/Agente de contratação: Joana Agente, designado pela Portaria 089\/2024/);
      expect(m.pecas.RAG.secoes.identificacao).toMatch(/Dispensa eletrônica nº/);
      expect(m.pecas.ME.secoes.preambulo).toMatch(/\(Dispensa eletrônica nº /);
      expect(m.pecas.MC.secoes.foro).toMatch(/^<p>Fica eleito o foro da sede da Administração para dirimir/);
      expect(m.pecas.RAG.secoes.orcamento).toMatch(new RegExp(`${ANO}: R\\$\\s?10\\.000,00 \\(reservado\\); ${ANO + 1}: R\\$\\s?12\\.600,00 \\(previsão\\)`));
      for (const t of ['RAG', 'ME', 'MC']) {
        semDefeitosDeTexto(Object.values(m.pecas[t].secoes).join(' '), `minuta ${t}`);
        semDefeitosDeTexto(await textoDaPeca(m.pecas[t].peca.documento_id), `PDF da minuta ${t}`);
      }
      // gerar de novo = versão nova (histórico preservado)
      const m2 = (await http().post(`/api/fase-interna/${lic.id}/minutas/MC/gerar`).set(bearer(agente.token)).expect(201)).body;
      expect(m2.pecas.MC.peca.versao).toBe(2);
      expect((await versoes(lic, 'MC')).map((v: any) => v.status)).toEqual(['SUBSTITUIDO', 'EM_ELABORACAO']);
    });

    it('parecer: diligência no TR é SANADA com a correção (TR gerado de novo = v3), e o parecer favorável sai', async () => {
      const d = (await http()
        .post(`/api/fase-interna/${lic.id}/parecer/diligencias`)
        .set(bearer(juridico.token))
        .send({ tipo_alvo: 'TR', descricao: 'Incluir o prazo de execução no TR (art. 6º, XXIII, e).' })
        .expect(201)).body;
      diligenciaId = d.diligencias[0].id;
      expect(d.diligencias[0]).toMatchObject({ versao_alvo: 2 });
      // antes da correção: "corrija a peça (nova versão)"
      const antes = await http().post(`/api/fase-interna/${lic.id}/parecer/diligencias/${diligenciaId}/sanar`).set(bearer(agente.token)).send({ resposta: 'Corrigido.' });
      expect(antes.status).toBe(400);
      await http()
        .patch(`/api/fase-interna/${lic.id}/documentos/TR/secao/modelo_execucao`)
        .set(bearer(agente.token))
        .send({ html: '<p>Implantação em até 30 dias; licença por 12 meses.</p>' })
        .expect(200);
      const g = (await http().post(`/api/fase-interna/${lic.id}/documentos/TR/gerar`).set(bearer(agente.token)).expect(201)).body;
      expect(g.peca.versao).toBe(3);
      expect(g.secoes.modelo_execucao).toBe('<p>Implantação em até 30 dias; licença por 12 meses.</p>');
      const s = (await http()
        .post(`/api/fase-interna/${lic.id}/parecer/diligencias/${diligenciaId}/sanar`)
        .set(bearer(agente.token))
        .send({ resposta: 'Prazo de execução incluído (TR versão 3).' })
        .expect(201)).body;
      expect(s.diligencias[0]).toMatchObject({ status: 'SANADA', corrigida: true, versao_corrigida: 3 });
      const r = (await http().post(`/api/fase-interna/${lic.id}/parecer/emitir`).set(bearer(juridico.token)).send({ conclusao: 'FAVORAVEL' }).expect(201)).body;
      expect(r.parecer).toMatchObject({ status: 'ASSINADO' });
    });

    it('AUTOS: capa, abertura, índice, ordem lógica, carimbo contínuo, anexo com as páginas originais, só a versão vigente, sem defeitos de texto', async () => {
      await esperar();
      let meta: any;
      const limite = Date.now() + 120_000;
      // (as revisões em segundo plano do parecer recém-assinado podem mudar a
      // impressão: pede de novo, como o botão "Gerar autos")
      do {
        await http().post(`/api/licitacoes/${lic.id}/processo-pdf/gerar`).set(bearer(agente.token)).expect(201);
        do {
          await new Promise((res) => setTimeout(res, 250));
          meta = (await http().get(`/api/licitacoes/${lic.id}/processo-pdf/situacao`).set(bearer(agente.token)).expect(200)).body;
        } while (meta.situacao === 'GERANDO' && Date.now() < limite);
      } while (meta.situacao !== 'PRONTO' && Date.now() < limite);
      expect(meta.situacao).toBe('PRONTO');
      const r = await http().get(`/api/licitacoes/${lic.id}/processo-pdf`).set(bearer(agente.token)).buffer(true).parse(binario).expect(200);
      const pdf = await PDFDocument.load(r.body as Buffer);
      const paginas = ((await paginasDoPdf(r.body as Buffer)) ?? []).map((t) => t.replace(/\s+/g, ' '));
      expect(paginas.length).toBe(pdf.getPageCount());
      expect(paginas.length).toBe(meta.folhas);
      // carimbo "Fl. 000001…" em TODAS as folhas, sem pular
      paginas.forEach((t, i) => expect(t).toContain(carimboDeFolha(i + 1)));
      // nenhuma folha em branco (o rodapé do mapa da pesquisa abria páginas vazias)
      paginas.forEach((t, i) => {
        // sem o carimbo e sem o rodapé ("Pesquisa de Preços — … — Página N de T"), sobra o conteúdo da folha
        const resto = t
          .replace(carimboDeFolha(i + 1), '')
          .replace(/Pesquisa de Preços\s+—\s+\S+\s+—\s+Página \d+ de \d+/g, '')
          .replace(/Página \d+ de \d+/g, '')
          .trim();
        expect({ folha: i + 1, conteudo: resto.length > 15 ? 'ok' : resto }).toEqual({ folha: i + 1, conteudo: 'ok' });
      });
      expect(paginas[0]).toMatch(/AUTOS DO PROCESSO ADMINISTRATIVO/);
      expect(paginas[0]).toMatch(/Dispensa Eletrônica/);
      expect(paginas[1]).toMatch(/TERMO DE ABERTURA/);
      expect(paginas[2]).toMatch(/ÍNDICE DOS AUTOS/);
      expect(paginas[paginas.length - 1]).toMatch(/TERMO DE ENCERRAMENTO/);
      paginas.forEach((t, i) => semDefeitosDeTexto(t, `autos, folha ${i + 1}`));

      // ordem lógica pelo índice (folhas crescentes) — DFD, TR, pesquisa, certidão, reserva, autorização, designação, relatório, minutas, parecer, justificativas
      const idx: any[] = meta.indice;
      const folha = (re: RegExp) => {
        const e = idx.find((x) => re.test(x.titulo));
        expect({ peça: String(re), achou: !!e }).toEqual({ peça: String(re), achou: true });
        return e;
      };
      const ordem = [
        /Formalização da Demanda/,
        /Termo de Referência/,
        /Pesquisa de Preços/i,
        /Certidão da pesquisa/,
        /orçamentária/i,
        /Autorização|Despacho/,
        /Designação/i,
        /Relatório do agente/i,
        /[Mm]inuta do (aviso|edital)|Minuta do Edital/,
        /[Mm]inuta do contrato/,
        /Parecer/,
        /TERMO DE JUSTIFICATIVAS|Termo de justificativas/,
      ].map(folha);
      const inicios = ordem.map((e) => e.folha_inicial);
      expect(inicios).toEqual([...inicios].sort((a, b) => a - b));
      // só a versão vigente: o TR entra uma vez, a v3, que "substitui a versão 2"
      expect(idx.filter((x) => /Termo de Referência/.test(x.titulo))).toHaveLength(1);
      expect(folha(/Termo de Referência/).observacao).toMatch(/substitui a versão 2/);
      const tr = folha(/Termo de Referência/);
      const textoTr = paginas.slice(tr.folha_inicial - 1, tr.folha_final).join(' ');
      expect(textoTr).toMatch(/Itens da contratação/);
      expect(textoTr).toMatch(/Implantação em até 30 dias/);
      expect(textoTr).toMatch(/R\$\s?22\.600,00/);
      // o PDF anexado entra com as páginas originais, em sequência
      const dp = folha(/Designação/i);
      expect(dp.folha_final - dp.folha_inicial).toBe(1);
      expect(paginas[dp.folha_inicial - 1]).toMatch(/PORTARIAANEXA PAGINA 1 DE 2/);
      expect(paginas[dp.folha_inicial]).toMatch(/PORTARIAANEXA PAGINA 2 DE 2/);
      // termo de justificativas com as peças "não se aplica" (ETP e riscos)
      const just = folha(/TERMO DE JUSTIFICATIVAS|Termo de justificativas/);
      expect(paginas.slice(just.folha_inicial - 1, just.folha_final).join(' ')).toMatch(/Peça ETP dispensada/);
    });
  });
});
