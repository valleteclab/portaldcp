/**
 * NOTA DE FORNECIMENTO NA TELA DAS MEDIÇÕES
 *
 * O órgão escolhe para onde vai a nota fiscal da ordem de fornecimento:
 * almoxarifado (padrão), medições ou os dois. Com as medições no destino, quem
 * cuida delas vê a nota, baixa os arquivos, devolve ao fornecedor, colhe
 * assinaturas num termo de atesto e marca o envio à contabilidade.
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
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { ModuloSistema } from '../src/orgaos/enums/modulos.enum';
import { OrdemFornecimento, StatusOrdemFornecimento } from '../src/almoxarifado/entities/ordem-fornecimento.entity';
import { Recebimento, StatusRecebimento } from '../src/almoxarifado/entities/recebimento.entity';
import { destinatariosDaNota, normalizarDestinoNotaFornecimento } from '../src/almoxarifado/destino-nota-fornecimento';
import { gerarTermoAtestoPdf, posicaoAssinaturaTermo } from '../src/notas-fornecimento/termo-atesto-pdf';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const LINK_MEDICOES = '/orgao/medicoes-v2?aba=notas-fornecimento';

const xmlNota = (numero: number, valor: number, cnpj: string) =>
  Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?><nfeProc><NFe><infNFe Id="NFe2926${String(numero).padStart(38, '0')}">` +
      `<ide><nNF>${numero}</nNF><serie>1</serie><dhEmi>2026-03-05T10:00:00-03:00</dhEmi></ide>` +
      `<emit><CNPJ>${cnpj}</CNPJ><xNome>Fornecedor E2E</xNome></emit>` +
      `<det nItem="1"><prod><cProd>001</cProd><xProd>Cadeira giratória</xProd><NCM>94013000</NCM><uCom>UN</uCom><qCom>2</qCom><vUnCom>${(valor / 2).toFixed(2)}</vUnCom><vProd>${valor.toFixed(2)}</vProd></prod></det>` +
      `<total><ICMSTot><vNF>${valor.toFixed(2)}</vNF></ICMSTot></total></infNFe></NFe></nfeProc>`,
  );

describe('Nota de fornecimento na tela das Medições', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let F: FornecedorFixture;
  let fiscal: UsuarioOrgaoFixture; // equipe das medições
  let almox: UsuarioOrgaoFixture; // fila de recebimentos
  let comum: UsuarioOrgaoFixture; // sem permissão nenhuma
  let contrato: string;
  let seq = 0;
  const http = () => ctx.http();

  async function criarOrdem(valor = 500): Promise<string> {
    seq += 1;
    const repo = ctx.dataSource.getRepository(OrdemFornecimento);
    const o: any = await repo.save(
      repo.create({
        orgao_id: A.id,
        contrato_id: contrato,
        fornecedor_id: F.id,
        numero: `OF-E2E-NF-${seq}-${Date.now()}`,
        ano: 2026,
        sequencial: 810000 + seq,
        data_emissao: new Date('2026-03-01'),
        valor_total: valor,
        status: StatusOrdemFornecimento.ENVIADA,
        usuario_emitente_id: A.id,
        usuario_emitente_nome: 'Órgão E2E',
      } as any),
    );
    return o.id;
  }

  async function enviarNota(ordem: string, numero: number, valor = 500): Promise<string> {
    const r = await http()
      .post(`/api/fornecedor/ordens/${ordem}/nota-fiscal`)
      .set(bearer(F.token))
      .attach('arquivos', xmlNota(numero, valor, F.cnpj), { filename: `nf-${numero}.xml`, contentType: 'application/xml' })
      .attach('arquivos', PDF, { filename: `nf-${numero}.pdf`, contentType: 'application/pdf' });
    if (![200, 201].includes(r.status)) throw new Error(`[fixture] nota → ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.id;
  }

  async function aceitarMaterial(ordem: string, nota: string, numero: number) {
    const repo = ctx.dataSource.getRepository(Recebimento);
    await repo.save(
      repo.create({
        orgao_id: A.id,
        ordem_fornecimento_id: ordem,
        numero: `REC-E2E-${numero}-${Date.now()}`,
        ano: 2026,
        sequencial: 820000 + numero,
        status: StatusRecebimento.ACEITO,
        data_recebimento: new Date(),
        data_aceite: new Date(),
        nota_fiscal_fornecedor_id: nota,
        numero_nota_fiscal: String(numero),
        itens: [],
        valor_total_recebido: 500,
        usuario_recebedor_id: A.id,
        usuario_recebedor_nome: 'Órgão E2E',
      } as any),
    );
  }

  const definirDestino = (destino: string, token = A.token) =>
    http().put(`/api/orgaos/${A.id}`).set(bearer(token)).send({ destino_nota_fornecimento: destino });

  /** Avisos de NF de uma ordem, por usuário (as notificações saem em segundo plano). */
  async function avisosDaOrdem(ordem: string, esperados: number): Promise<Array<{ usuario_id: string; link: string }>> {
    for (let i = 0; i < 40; i++) {
      const r = await ctx.dataSource.query(
        `SELECT usuario_id, link FROM notificacoes WHERE entidade_id = $1 AND tipo = 'NF_DISPONIVEL'`,
        [ordem],
      );
      if (r.length >= esperados) return r;
      await new Promise((ok) => setTimeout(ok, 100));
    }
    return ctx.dataSource.query(`SELECT usuario_id, link FROM notificacoes WHERE entidade_id = $1 AND tipo = 'NF_DISPONIVEL'`, [ordem]);
  }

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Câmara Notas A' });
    B = await criarOrgao(ctx, { nome: 'Câmara Notas B' });
    F = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    fiscal = await criarUsuarioOrgao(ctx, A, { nome: 'Fiscal das Medições' });
    almox = await criarUsuarioOrgao(ctx, A, { nome: 'Almoxarife' });
    comum = await criarUsuarioOrgao(ctx, A, { nome: 'Usuário Comum' });
    await ctx.dataSource.query(`UPDATE usuarios SET eh_fiscal_contrato = true WHERE id = $1`, [fiscal.id]);
    await ctx.dataSource.query(`UPDATE usuarios SET pode_aprovar_requisicoes = true WHERE id = $1`, [almox.id]);

    const c = await http()
      .post('/api/contratos')
      .set(bearer(A.token))
      .send({
        fornecedor_id: F.id,
        fornecedor_cnpj: F.cnpj,
        fornecedor_razao_social: F.razao_social,
        objeto: 'Aquisição de mobiliário — E2E',
        modalidade_execucao: 'ITEM_QUANTIDADE',
        valor_inicial: 12000,
        valor_global: 12000,
        data_assinatura: '2026-01-10',
        data_vigencia_inicio: '2026-01-10',
        data_vigencia_fim: '2026-12-31',
      });
    if (![200, 201].includes(c.status)) throw new Error(`[fixture] contrato → ${c.status} ${JSON.stringify(c.body)}`);
    contrato = c.body.id;
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  describe('regras puras', () => {
    it('destino desconhecido ou vazio cai no padrão (almoxarifado)', () => {
      expect(normalizarDestinoNotaFornecimento(null)).toBe('ALMOXARIFADO');
      expect(normalizarDestinoNotaFornecimento('QUALQUER')).toBe('ALMOXARIFADO');
      expect(normalizarDestinoNotaFornecimento('AMBOS')).toBe('AMBOS');
    });

    it('medições sem fiscal nem gestor definidos avisam todos os usuários ativos; inativo nunca recebe', () => {
      const us = [
        { id: 'a', ativo: true },
        { id: 'b', ativo: false, eh_fiscal_contrato: true },
        { id: 'c', ativo: true, pode_receber_patrimonio: true },
      ];
      const r = destinatariosDaNota('AMBOS', us, [null]);
      expect(r.medicoes.map((u) => u.id)).toEqual(['a', 'c']);
      expect(r.almoxarifado.map((u) => u.id)).toEqual(['c']);
      expect(destinatariosDaNota('MEDICOES', us, ['a']).medicoes.map((u) => u.id)).toEqual(['a']);
      expect(destinatariosDaNota('MEDICOES', us, ['a']).almoxarifado).toEqual([]);
      expect(destinatariosDaNota('ALMOXARIFADO', us, ['a']).medicoes).toEqual([]);
    });

    it('termo de atesto: a última página é a das assinaturas e cada signatário tem um quadro próprio', () => {
      const { buffer, ultimaPagina } = gerarTermoAtestoPdf({
        orgao: { nome: 'Câmara', cnpj: '12345678000190', cidade: 'Cidade', uf: 'BA' },
        nota: { numero: '10', serie: '1', chave_acesso: null, data_emissao: '2026-03-05', valor_total: 500 },
        ordem: { numero: 'OF-1/2026' },
        contrato: { numero: '001/2026', objeto: 'Mobiliário' },
        fornecedor: { razao_social: 'Fornecedor', cpf_cnpj: '12345678000190' },
        itens: [{ descricao: 'Cadeira', unidade: 'UN', quantidade: 2, valor_unitario: 250, valor_total: 500 }],
        situacao_recebimento: 'Material aceito.',
        signatarios: [{ nome: 'Um' }, { nome: 'Dois', papel: 'Fiscal' }, { nome: 'Três' }],
        emitido_por: 'Teste',
        emitido_em: new Date(),
      });
      expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
      expect(ultimaPagina).toBe(2);
      const pos = [0, 1, 2, 9].map(posicaoAssinaturaTermo);
      expect(new Set(pos.map((p) => `${p.pos_x}-${p.pos_y}`)).size).toBe(4);
      pos.forEach((p) => expect(p.pos_y).toBeLessThan(0.85)); // o quadro cabe na página
    });
  });

  describe('destino ALMOXARIFADO (padrão): nada muda', () => {
    let ordem: string;
    let nota: string;

    it('o aviso vai só para a fila de recebimentos', async () => {
      ordem = await criarOrdem();
      nota = await enviarNota(ordem, 101);
      const avisos = await avisosDaOrdem(ordem, 1);
      expect(avisos).toEqual([{ usuario_id: almox.id, link: `/orgao/almoxarifado/recebimentos/${ordem}` }]);
    });

    it('a aba das medições fica vazia e a nota não abre por lá', async () => {
      const lista = await http().get('/api/notas-fornecimento').set(bearer(A.token));
      expect(lista.status).toBe(200);
      expect(lista.body).toEqual({ destino: 'ALMOXARIFADO', notas: [] });

      for (const r of [
        await http().get(`/api/notas-fornecimento/${nota}`).set(bearer(A.token)),
        await http().get(`/api/notas-fornecimento/${nota}/arquivo/pdf`).set(bearer(A.token)),
        await http().post(`/api/notas-fornecimento/${nota}/devolver`).set(bearer(A.token)).send({ motivo: 'Valor divergente' }),
      ]) {
        expect(r.status).toBe(403);
      }
    });
  });

  describe('configuração do destino', () => {
    it('valor inválido é recusado e o destino não muda', async () => {
      const r = await definirDestino('QUALQUER');
      expect(r.status).toBe(400);
      const [o] = await ctx.dataSource.query(`SELECT destino_nota_fornecimento AS d FROM orgaos WHERE id = $1`, [A.id]);
      expect(o.d).toBe('ALMOXARIFADO');
    });

    it('outro órgão não altera o destino deste', async () => {
      const r = await definirDestino('MEDICOES', B.token);
      expect(r.status).toBe(403);
    });

    it('o órgão escolhe AMBOS', async () => {
      const r = await definirDestino('AMBOS');
      expect(r.status).toBe(200);
      expect(r.body.destino_nota_fornecimento).toBe('AMBOS');
    });
  });

  describe('destino AMBOS', () => {
    let ordem: string;
    let nota: string;

    it('avisa o recebimento e a equipe das medições, cada um com o link da sua tela', async () => {
      ordem = await criarOrdem();
      nota = await enviarNota(ordem, 201);
      const avisos = await avisosDaOrdem(ordem, 2);
      expect(avisos.sort((a, b) => a.link.localeCompare(b.link))).toEqual(
        [
          { usuario_id: almox.id, link: `/orgao/almoxarifado/recebimentos/${ordem}` },
          { usuario_id: fiscal.id, link: LINK_MEDICOES },
        ].sort((a, b) => a.link.localeCompare(b.link)),
      );
    });

    it('a nota aparece na aba das medições com a situação do recebimento', async () => {
      const lista = await http().get('/api/notas-fornecimento').set(bearer(fiscal.token));
      expect(lista.status).toBe(200);
      expect(lista.body.destino).toBe('AMBOS');
      const n = lista.body.notas.find((x: any) => x.id === nota);
      expect(n).toMatchObject({
        numero: '201',
        valor_total: 500,
        status: 'PROCESSADA',
        tem_pdf: true,
        tem_xml: true,
        qtd_itens: 1,
        recebimento: { status: 'SEM_RECEBIMENTO', rotulo: 'Aguardando conferência', aceito: false },
        assinatura: null,
        contabilidade: null,
        pode_devolver: true,
      });
      expect(n.ordem.id).toBe(ordem);
      expect(n.fornecedor.razao_social).toBe(F.razao_social);
      // as notas do período em que o destino era só almoxarifado também aparecem
      expect(lista.body.notas.some((x: any) => x.numero === '101')).toBe(true);
    });

    it('detalhe traz os itens; PDF, XML e o pacote saem para o órgão', async () => {
      const d = await http().get(`/api/notas-fornecimento/${nota}`).set(bearer(fiscal.token));
      expect(d.status).toBe(200);
      expect(d.body.itens).toEqual([{ descricao: 'Cadeira giratória', unidade: 'UN', quantidade: 2, valor_unitario: 250, valor_total: 500 }]);

      const pdf = await http().get(`/api/notas-fornecimento/${nota}/arquivo/pdf`).set(bearer(fiscal.token));
      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
      expect(pdf.headers['content-disposition']).toContain('inline');

      const xml = await http().get(`/api/notas-fornecimento/${nota}/arquivo/xml?baixar=1`).set(bearer(fiscal.token));
      expect(xml.status).toBe(200);
      expect(xml.headers['content-disposition']).toContain('attachment');

      const zip = await http().get(`/api/notas-fornecimento/${nota}/pacote`).set(bearer(fiscal.token)).buffer(true).parse((res, cb) => {
        const partes: Buffer[] = [];
        res.on('data', (c: Buffer) => partes.push(c));
        res.on('end', () => cb(null, Buffer.concat(partes)));
      });
      expect(zip.status).toBe(200);
      expect((zip.body as Buffer).subarray(0, 2).toString()).toBe('PK');

      const semTermo = await http().get(`/api/notas-fornecimento/${nota}/arquivo/termo`).set(bearer(fiscal.token));
      expect(semTermo.status).toBe(404);
      const desconhecido = await http().get(`/api/notas-fornecimento/${nota}/arquivo/qualquer`).set(bearer(fiscal.token));
      expect(desconhecido.status).toBe(400);
    });

    it('outro órgão não enxerga a nota; fornecedor e anônimo não entram', async () => {
      await definirDestinoDe(B, 'AMBOS');
      const rotas = [
        ['get', `/api/notas-fornecimento/${nota}`],
        ['get', `/api/notas-fornecimento/${nota}/arquivo/pdf`],
        ['get', `/api/notas-fornecimento/${nota}/pacote`],
        ['post', `/api/notas-fornecimento/${nota}/devolver`],
        ['post', `/api/notas-fornecimento/${nota}/assinaturas`],
        ['patch', `/api/notas-fornecimento/${nota}/enviado-contabilidade`],
      ] as const;
      for (const [verbo, rota] of rotas) {
        const corpo = { motivo: 'Tentativa de outro órgão', signatarios: [{ usuario_id: fiscal.id }] };
        const deB = await (http() as any)[verbo](rota).set(bearer(B.token)).send(verbo === 'get' ? undefined : corpo);
        expect({ rota, status: deB.status }).toEqual({ rota, status: 404 });
        const doForn = await (http() as any)[verbo](rota).set(bearer(F.token)).send(verbo === 'get' ? undefined : corpo);
        expect({ rota, status: doForn.status }).toEqual({ rota, status: 403 });
        const anonimo = await (http() as any)[verbo](rota).send(verbo === 'get' ? undefined : corpo);
        expect({ rota, status: anonimo.status }).toEqual({ rota, status: 401 });
      }
      const listaB = await http().get('/api/notas-fornecimento').set(bearer(B.token));
      expect(listaB.body.notas).toEqual([]);
      const [n] = await ctx.dataSource.query(`SELECT status, documento_assinatura_id, enviado_contabilidade_em FROM notas_fiscais_fornecedor WHERE id = $1`, [nota]);
      expect(n).toEqual({ status: 'PROCESSADA', documento_assinatura_id: null, enviado_contabilidade_em: null });
    });

    it('órgão sem o módulo Contratos não usa a aba', async () => {
      const sem = await criarOrgao(ctx, { modulos: [ModuloSistema.ALMOXARIFADO] });
      const r = await http().get('/api/notas-fornecimento').set(bearer(sem.token));
      expect(r.status).toBe(403);
    });

    describe('assinaturas no termo de atesto', () => {
      it('exige ao menos um signatário, e todos do próprio órgão', async () => {
        const vazio = await http().post(`/api/notas-fornecimento/${nota}/assinaturas`).set(bearer(fiscal.token)).send({ signatarios: [] });
        expect(vazio.status).toBe(400);
        const usuarioB = await criarUsuarioOrgao(ctx, B);
        const deFora = await http()
          .post(`/api/notas-fornecimento/${nota}/assinaturas`)
          .set(bearer(fiscal.token))
          .send({ signatarios: [{ usuario_id: usuarioB.id }] });
        expect(deFora.status).toBe(400);
        const repetido = await http()
          .post(`/api/notas-fornecimento/${nota}/assinaturas`)
          .set(bearer(fiscal.token))
          .send({ signatarios: [{ usuario_id: fiscal.id }, { usuario_id: fiscal.id }] });
        expect(repetido.status).toBe(400);
        const externoIncompleto = await http()
          .post(`/api/notas-fornecimento/${nota}/assinaturas`)
          .set(bearer(fiscal.token))
          .send({ signatarios: [{ nome: 'Pessoa de Fora', email: 'fora@e2e.local' }] });
        expect(externoIncompleto.status).toBe(400);
        const [n] = await ctx.dataSource.query(`SELECT documento_assinatura_id FROM notas_fiscais_fornecedor WHERE id = $1`, [nota]);
        expect(n.documento_assinatura_id).toBeNull();
      });

      it('gera o termo e abre a coleta com um usuário do órgão e uma pessoa de fora', async () => {
        const r = await http()
          .post(`/api/notas-fornecimento/${nota}/assinaturas`)
          .set(bearer(fiscal.token))
          .send({
            signatarios: [
              { usuario_id: fiscal.id, papel: 'Fiscal do contrato' },
              { nome: 'Presidente da Mesa', email: 'presidente@e2e.local', cpf_cnpj: '529.982.247-25', telefone: '(77) 99999-0000', papel: 'Ordenador de despesa' },
            ],
          });
        expect([200, 201]).toContain(r.status);
        expect(r.body.assinatura).toMatchObject({
          status: 'AGUARDANDO_ASSINATURAS',
          signatarios: [
            { nome: 'Fiscal das Medições', papel: 'Fiscal do contrato', status: 'PENDENTE', interno: true },
            { nome: 'Presidente da Mesa', papel: 'Ordenador de despesa', status: 'PENDENTE', interno: false },
          ],
        });
        expect(r.body.historico.some((h: any) => h.tipo === 'ASSINATURAS_SOLICITADAS')).toBe(true);

        // o usuário do órgão é avisado no sino, com o link de onde assina
        const avisos = await ctx.dataSource.query(
          `SELECT usuario_id, link FROM notificacoes WHERE entidade_id = $1 AND entidade_tipo = 'nota_fiscal_fornecedor'`,
          [nota],
        );
        expect(avisos).toEqual([{ usuario_id: fiscal.id, link: '/orgao/aprovacoes' }]);

        const termo = await http().get(`/api/notas-fornecimento/${nota}/arquivo/termo`).set(bearer(fiscal.token));
        expect(termo.status).toBe(200);
        expect(termo.headers['content-type']).toContain('application/pdf');

        // os quadros de assinatura ficam na última página, em posições diferentes
        const sigs = await ctx.dataSource.query(
          `SELECT pagina_assinatura, pos_x, pos_y FROM signatarios_documento WHERE documento_id = $1 ORDER BY pos_x`,
          [r.body.assinatura.documento_id],
        );
        expect(sigs.map((s: any) => s.pagina_assinatura)).toEqual([2, 2]);
        expect(sigs[0].pos_x).not.toBe(sigs[1].pos_x);
      });

      it('o signatário do órgão encontra o termo entre as suas assinaturas pendentes', async () => {
        const r = await http().get('/api/assinaturas-internas/pendentes').set(bearer(fiscal.token));
        expect(r.status).toBe(200);
        expect(JSON.stringify(r.body)).toContain('Termo de atesto — NF 201');
      });

      it('não abre uma segunda coleta enquanto a primeira está em andamento; cancelada, abre outra', async () => {
        const de_novo = await http()
          .post(`/api/notas-fornecimento/${nota}/assinaturas`)
          .set(bearer(fiscal.token))
          .send({ signatarios: [{ usuario_id: fiscal.id }] });
        expect(de_novo.status).toBe(400);

        const cancelar = await http().delete(`/api/notas-fornecimento/${nota}/assinaturas`).set(bearer(fiscal.token));
        expect(cancelar.status).toBe(200);
        expect(cancelar.body.assinatura.status).toBe('CANCELADO');
        const semColeta = await http().delete(`/api/notas-fornecimento/${nota}/assinaturas`).set(bearer(fiscal.token));
        expect(semColeta.status).toBe(400);

        const outra = await http()
          .post(`/api/notas-fornecimento/${nota}/assinaturas`)
          .set(bearer(fiscal.token))
          .send({ signatarios: [{ usuario_id: fiscal.id }] });
        expect([200, 201]).toContain(outra.status);
        expect(outra.body.assinatura.status).toBe('AGUARDANDO_ASSINATURAS');
      });
    });

    describe('envio à contabilidade', () => {
      it('não segue antes do aceite do material', async () => {
        const r = await http().patch(`/api/notas-fornecimento/${nota}/enviado-contabilidade`).set(bearer(A.token));
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/depois que o material for aceito/i);
      });

      it('com o material aceito: usuário sem a permissão é recusado; com a permissão, marca uma vez só', async () => {
        await aceitarMaterial(ordem, nota, 201);
        const semPermissao = await http().patch(`/api/notas-fornecimento/${nota}/enviado-contabilidade`).set(bearer(comum.token));
        expect(semPermissao.status).toBe(403);

        await ctx.dataSource.query(`UPDATE usuarios SET pode_enviar_contabilidade = true WHERE id = $1`, [fiscal.id]);
        const ok = await http().patch(`/api/notas-fornecimento/${nota}/enviado-contabilidade`).set(bearer(fiscal.token));
        expect(ok.status).toBe(200);
        expect(ok.body.contabilidade.enviado_por).toBe('Fiscal das Medições');
        expect(ok.body.recebimento).toMatchObject({ status: 'ACEITO', aceito: true, rotulo: 'Material aceito' });

        const repetido = await http().patch(`/api/notas-fornecimento/${nota}/enviado-contabilidade`).set(bearer(fiscal.token));
        expect(repetido.status).toBe(400);
      });
    });

    describe('devolução ao fornecedor', () => {
      it('nota com material já aceito não é devolvida', async () => {
        const r = await http().post(`/api/notas-fornecimento/${nota}/devolver`).set(bearer(fiscal.token)).send({ motivo: 'Valor divergente do pedido' });
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/já foi aceito/i);
        const [n] = await ctx.dataSource.query(`SELECT status FROM notas_fiscais_fornecedor WHERE id = $1`, [nota]);
        expect(n.status).toBe('PROCESSADA');
      });

      it('exige motivo; devolvida, o fornecedor é avisado, a coleta de assinaturas cai e a ordem volta a aceitar nota', async () => {
        const ordem2 = await criarOrdem();
        const nota2 = await enviarNota(ordem2, 202);
        await http().post(`/api/notas-fornecimento/${nota2}/assinaturas`).set(bearer(fiscal.token)).send({ signatarios: [{ usuario_id: fiscal.id }] });

        const semMotivo = await http().post(`/api/notas-fornecimento/${nota2}/devolver`).set(bearer(fiscal.token)).send({ motivo: '  ' });
        expect(semMotivo.status).toBe(400);

        const r = await http().post(`/api/notas-fornecimento/${nota2}/devolver`).set(bearer(fiscal.token)).send({ motivo: 'CNPJ do destinatário errado' });
        expect([200, 201]).toContain(r.status);
        expect(r.body).toMatchObject({ status: 'RECUSADA', motivo_recusa: 'CNPJ do destinatário errado', pode_devolver: false });
        expect(r.body.assinatura.status).toBe('CANCELADO');

        const [o] = await ctx.dataSource.query(`SELECT status FROM ordens_fornecimento WHERE id = $1`, [ordem2]);
        expect(o.status).toBe('ENVIADA');
        const avisos = await ctx.dataSource.query(`SELECT usuario_id FROM notificacoes WHERE entidade_id = $1 AND tipo = 'NF_RECUSADA'`, [ordem2]);
        expect(avisos).toEqual([{ usuario_id: F.id }]);

        const deNovo = await http().post(`/api/notas-fornecimento/${nota2}/devolver`).set(bearer(fiscal.token)).send({ motivo: 'CNPJ do destinatário errado' });
        expect(deNovo.status).toBe(400);
        const assinar = await http().post(`/api/notas-fornecimento/${nota2}/assinaturas`).set(bearer(fiscal.token)).send({ signatarios: [{ usuario_id: fiscal.id }] });
        expect(assinar.status).toBe(400);

        // o fornecedor corrige e envia outra nota para a mesma ordem
        const nota3 = await enviarNota(ordem2, 203);
        const d = await http().get(`/api/notas-fornecimento/${nota3}`).set(bearer(fiscal.token));
        expect(d.body.status).toBe('PROCESSADA');
      });
    });
  });

  describe('nota enviada só em PDF (sem XML)', () => {
    const enviarSoPdf = (ordem: string, campos: Record<string, string>) => {
      let r = http().post(`/api/fornecedor/ordens/${ordem}/nota-fiscal`).set(bearer(F.token));
      for (const [k, v] of Object.entries(campos)) r = r.field(k, v);
      return r.attach('arquivos', PDF, { filename: 'nf.pdf', contentType: 'application/pdf' });
    };
    let ordem: string;

    beforeAll(async () => {
      ordem = await criarOrdem(500);
      await ctx.dataSource.query(`UPDATE ordens_fornecimento SET itens = $2::jsonb WHERE id = $1`, [
        ordem,
        JSON.stringify([
          { item_contrato_id: '00000000-0000-4000-8000-000000000001', numero_item: 1, descricao: 'Cadeira giratória', unidade_medida: 'UN', quantidade: 4, quantidade_entregue: 1, valor_unitario: 100, valor_total: 400 },
          { item_contrato_id: '00000000-0000-4000-8000-000000000002', numero_item: 2, descricao: 'Mesa', unidade_medida: 'UN', quantidade: 1, quantidade_entregue: 1, valor_unitario: 100, valor_total: 100 },
        ]),
      ]);
    });

    it('sem XML, número e valor são obrigatórios; o PDF continua obrigatório', async () => {
      expect((await enviarSoPdf(ordem, {})).status).toBe(400);
      expect((await enviarSoPdf(ordem, { numero: '900' })).status).toBe(400);
      expect((await enviarSoPdf(ordem, { numero: '900', valor_total: 'abc' })).status).toBe(400);
      const semPdf = await http()
        .post(`/api/fornecedor/ordens/${ordem}/nota-fiscal`)
        .set(bearer(F.token))
        .attach('arquivos', xmlNota(901, 300, F.cnpj), { filename: 'nf.xml', contentType: 'application/xml' });
      expect(semPdf.status).toBe(400);
      const [n] = await ctx.dataSource.query(`SELECT count(*)::int AS n FROM notas_fiscais_fornecedor WHERE ordem_fornecimento_id = $1`, [ordem]);
      expect(n.n).toBe(0);
    });

    it('o bloqueio de valor acima da ordem continua valendo para o valor digitado', async () => {
      const r = await enviarSoPdf(ordem, { numero: '900', valor_total: '501,00' });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/maior que o valor da Ordem/i);
    });

    it('entra com o número e o valor digitados; os itens são o que falta entregar da ordem', async () => {
      const r = await enviarSoPdf(ordem, { numero: '900', valor_total: '300,00', data_emissao: '2026-03-07' });
      expect([200, 201]).toContain(r.status);
      expect(r.body).toMatchObject({ numero: '900', status: 'PROCESSADA', caminho_xml: null });
      expect(Number(r.body.valor_total)).toBe(300);

      const d = await http().get(`/api/notas-fornecimento/${r.body.id}`).set(bearer(fiscal.token));
      expect(d.status).toBe(200);
      expect(d.body).toMatchObject({ numero: '900', valor_total: 300, tem_pdf: true, tem_xml: false, qtd_itens: 1 });
      expect(String(d.body.data_emissao).slice(0, 10)).toBe('2026-03-07');
      expect(d.body.itens).toEqual([{ descricao: 'Cadeira giratória', unidade: 'UN', quantidade: 3, valor_unitario: 100, valor_total: 300 }]);
      expect(d.body.historico.some((h: any) => h.tipo === 'NF_SEM_XML')).toBe(true);

      const xml = await http().get(`/api/notas-fornecimento/${r.body.id}/arquivo/xml`).set(bearer(fiscal.token));
      expect(xml.status).toBe(404);
    });
  });

  describe('destino MEDICOES', () => {
    it('só a equipe das medições é avisada; a fila de recebimentos não', async () => {
      expect((await definirDestino('MEDICOES')).status).toBe(200);
      const ordem = await criarOrdem();
      await enviarNota(ordem, 301);
      const avisos = await avisosDaOrdem(ordem, 1);
      expect(avisos).toEqual([{ usuario_id: fiscal.id, link: LINK_MEDICOES }]);
    });

    it('voltando para ALMOXARIFADO a aba das medições se fecha de novo', async () => {
      expect((await definirDestino('ALMOXARIFADO')).status).toBe(200);
      const lista = await http().get('/api/notas-fornecimento').set(bearer(fiscal.token));
      expect(lista.body).toEqual({ destino: 'ALMOXARIFADO', notas: [] });
    });
  });

  function definirDestinoDe(orgao: OrgaoFixture, destino: string) {
    return http().put(`/api/orgaos/${orgao.id}`).set(bearer(orgao.token)).send({ destino_nota_fornecimento: destino });
  }
});
