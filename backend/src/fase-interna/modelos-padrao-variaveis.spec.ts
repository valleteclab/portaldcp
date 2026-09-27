/**
 * MODELOS PADRÃO — nenhuma variável sem valor (homologação de 26/09/2026, E2).
 *
 * Os PDFs do DFD e do TR saíam com "{{orgao.nome}}", "CNPJ: {{orgao.cnpj}}" e
 * "Processo Administrativo nº {{licitacao.numero_processo}}" (o cabeçalho do
 * modelo só trocava nomes sem ponto). Aqui cada modelo padrão (DFD, ETP, TR,
 * informação orçamentária, despacho de autorização, relatório do agente,
 * aviso/minuta, contrato, pareceres, controle interno, designação), com o
 * cabeçalho e o rodapé, é renderizado com dados de exemplo pelo MESMO serviço
 * que monta as variáveis nas telas — e o teste falha se sobrar "{{". Também
 * gera o PDF do DFD e do TR (texto extraído página a página).
 */
import * as fs from 'fs';
import * as path from 'path';
import { ModeloDocumentoService } from './modelo-documento.service';
import { GeradorDocumentoService } from './gerador-documento.service';
import { GeradorPpService } from './gerador-pp.service';
import { CABECALHO_PADRAO_HTML, MODELOS_PADRAO, RODAPE_PADRAO_HTML } from './modelos-padrao';
import { variaveisDaReserva } from './orcamento/orcamento.service';
import { paginasDoPdf } from './conformidade/texto-pdf';
import { variaveisDoTexto } from './textos-documento';
import { TipoDocumentoFaseInterna } from './entities/documento-fase-interna.entity';

const LIC_ID = `lic-teste-modelos-${process.pid}`;

type Cenario = { orgao: any; licitacao: any; agentePorId: any | null; agentesPorPapel: any[]; reserva: any | null; portaria: any | null };

const COMPLETO = (): Cenario => ({
  orgao: { id: 'org-1', nome: 'Câmara Municipal de Teste', cnpj: '62.203.670/0001-62', cidade: 'Luís Eduardo Magalhães', uf: 'BA' },
  licitacao: {
    id: LIC_ID,
    orgao_id: 'org-1',
    numero_processo: '202609.26989',
    numero_edital: '008/2026',
    objeto: 'licença de software de gestão e implantação',
    modalidade: 'DISPENSA_ELETRONICA',
    tipo_contratacao: 'SERVICO',
    criterio_julgamento: 'MENOR_PRECO',
    modo_disputa: 'ABERTO',
    fundamento_legal: 'ART75_II',
    fase: 'PLANEJAMENTO',
    sigilo_orcamento: 'PUBLICO',
    valor_total_estimado: 22600,
    pregoeiro_id: 'u-agente',
    ano: 2026,
    created_at: new Date('2026-09-26T12:00:00-03:00'),
  },
  agentePorId: { nome: 'Joana Agente', cargo: 'Agente de contratação' },
  agentesPorPapel: [],
  reserva: {
    status: 'EMITIDA',
    unidade_orcamentaria: '01.01.000 Câmara',
    programa: '0001',
    projeto_atividade: '2.001',
    elemento_despesa: '3.3.90.40',
    fonte_recurso: '500',
    ldo_numero: '0001/2025',
    ldo_exercicio: 2026,
    loa_numero: '0000/2025',
    loa_exercicio: 2026,
    linhas: [
      { exercicio: 2026, valor: '10000.00', situacao: 'RESERVADO' },
      { exercicio: 2027, valor: '12600.00', situacao: 'PREVISAO' },
    ],
  },
  portaria: { numero: 'Portaria 089/2024' },
});

/** Cadastro incompleto: cidade "A definir", sem agente designado, sem reserva, sem portaria. */
const INCOMPLETO = (): Cenario => {
  const c = COMPLETO();
  c.orgao = { ...c.orgao, cidade: 'A definir', uf: 'BA', cnpj: '' };
  c.licitacao = { ...c.licitacao, pregoeiro_id: null, numero_edital: null };
  c.agentePorId = null;
  c.reserva = null;
  c.portaria = null;
  return c;
};

function servicoModelos(c: Cenario, modelos: any[] = []) {
  const query = async (sql: string) => {
    if (sql.includes('FROM itens_licitacao')) return [{ total: 22600 }];
    if (sql.includes('FROM reservas_orcamentarias r')) return c.reserva ? [c.reserva] : [];
    if (sql.includes('configuracoes_fase_interna')) return [{ autoridade_rotulo: 'Mesa Diretora', dispensa_com_lances: true }];
    if (sql.includes('papeis_fase_interna')) return c.agentesPorPapel;
    if (sql.includes('FROM usuarios WHERE id')) return c.agentePorId ? [c.agentePorId] : [];
    if (sql.includes("tipo::text = 'DP'")) return [];
    if (sql.includes('documentos_orgao')) return c.portaria ? [c.portaria] : [];
    return [];
  };
  const modeloRepo = {
    findOne: async ({ where }: any) => modelos.find((m) => m.tipo === where.tipo) ?? null,
  };
  const licitacaoRepo = { findOne: async () => ({ ...c.licitacao }), query };
  const orgaoRepo = { findOne: async () => ({ ...c.orgao }) };
  return new ModeloDocumentoService(modeloRepo as any, licitacaoRepo as any, orgaoRepo as any, {} as any, {} as any);
}

const RESERVA_VARS = variaveisDaReserva(
  { unidade_orcamentaria: '01.01.000', programa: '0001', projeto_atividade: '2.001', elemento_despesa: '3.3.90.40', fonte_recurso: '500', exercicio_base: 2026 },
  [
    { exercicio: 2026, valor: 10000, situacao: 'RESERVADO' } as any,
    { exercicio: 2027, valor: 12600, situacao: 'PREVISAO' } as any,
  ],
  { ldo: 'Lei nº 0001/2025 (LDO 2026)', loa: 'Lei nº 0000/2025 (LOA 2026)', ppa: null },
);

/** Todos os textos do modelo (seções + cabeçalho + rodapé). */
const textosDoModelo = (m: (typeof MODELOS_PADRAO)[number]) => [CABECALHO_PADRAO_HTML, RODAPE_PADRAO_HTML, ...m.secoes.map((s) => s.texto_padrao ?? '')];

describe('Modelos padrão: todas as variáveis têm valor (nada de {{…}} cru nos PDFs)', () => {
  it('cobre as peças da fase interna (DFD, ETP, TR, DO, AA, RAG, ME, MC, PJ, PJE, MCI, DP, JC)', () => {
    const tipos = MODELOS_PADRAO.map((m) => m.tipo);
    for (const t of ['DFD', 'ETP', 'TR', 'DO', 'AA', 'RAG', 'ME', 'MC', 'PJ', 'PJE', 'MCI', 'DP', 'JC']) expect(tipos).toContain(t);
  });

  for (const [nome, cenario] of [
    ['cadastro completo', COMPLETO],
    ['cadastro incompleto (cidade "A definir", sem agente, sem reserva)', INCOMPLETO],
  ] as const) {
    describe(nome, () => {
      let contexto: Record<string, string>;
      beforeAll(async () => {
        contexto = { ...(await servicoModelos(cenario()).montarContextoVariaveis(LIC_ID)), ...RESERVA_VARS };
      });

      it('toda variável citada nos modelos padrão (e no cabeçalho/rodapé) existe no contexto', () => {
        const faltam = new Set<string>();
        for (const m of MODELOS_PADRAO) for (const t of textosDoModelo(m)) for (const v of variaveisDoTexto(t)) if (!(v in contexto)) faltam.add(`${m.tipo}: ${v}`);
        expect([...faltam]).toEqual([]);
      });

      for (const m of MODELOS_PADRAO) {
        it(`${m.tipo} — ${m.nome}: renderizado sem "{{", sem código interno e sem "A definir"`, () => {
          const svc = servicoModelos(cenario());
          const texto = textosDoModelo(m)
            .map((t) => svc.substituirVariaveis(t, contexto))
            .join('\n');
          expect(texto).not.toContain('{{');
          expect(texto).not.toMatch(/DISPENSA_ELETRONICA|MENOR_PRECO|ART75_II/);
          expect(texto).not.toMatch(/A definir/i);
          expect(texto).not.toMatch(/Agente de contratação: Agente de contratação/);
          expect(texto).not.toMatch(/\d+\.0000/);
        });
      }
    });
  }

  it('valores do cadastro completo: órgão, CNPJ, processo, modalidade legível, agente e cidade', async () => {
    const svc = servicoModelos(COMPLETO());
    const ctx = await svc.montarContextoVariaveis(LIC_ID);
    expect(svc.substituirVariaveis(CABECALHO_PADRAO_HTML, ctx)).toMatch(/Câmara Municipal de Teste[\s\S]*CNPJ: 62\.203\.670\/0001-62[\s\S]*Processo Administrativo nº 202609\.26989/);
    expect(ctx['licitacao.modalidade']).toBe('Dispensa eletrônica');
    expect(ctx['agente.identificacao']).toBe('Agente de contratação: Joana Agente, designado pela Portaria 089/2024');
    expect(ctx.local_data).toMatch(/^Luís Eduardo Magalhães\/BA, \d{2} de \w+ de \d{4}$/);
    expect(ctx['reserva.exercicios']).toMatch(/2026: R\$\s?10\.000,00 \(reservado\); 2027: R\$\s?12\.600,00 \(previsão\)/);
    const aa = MODELOS_PADRAO.find((m) => m.tipo === 'AA')!;
    expect(svc.substituirVariaveis(aa.secoes[0].texto_padrao!, ctx)).toMatch(/Luís Eduardo Magalhães\/BA, \d{2} de/);
  });

  it('cadastro incompleto: despacho sem cidade (só a data), agente sem nome com texto neutro', async () => {
    const svc = servicoModelos(INCOMPLETO());
    const ctx = await svc.montarContextoVariaveis(LIC_ID);
    const aa = MODELOS_PADRAO.find((m) => m.tipo === 'AA')!;
    const despacho = svc.substituirVariaveis(aa.secoes[0].texto_padrao!, ctx);
    expect(despacho).toMatch(/<p>\d{2} de \w+ de \d{4}\.<\/p>/);
    expect(despacho).not.toMatch(/A definir/);
    expect(ctx['agente.identificacao']).toBe('Agente de contratação designado por portaria do órgão');
    expect(ctx['agente.assinatura']).toBe('Agente de contratação');
    // o único usuário com o papel "Agente de contratação" vale como o agente
    const comPapel = INCOMPLETO();
    comPapel.agentesPorPapel = [{ nome: 'Carlos do Papel', cargo: null }];
    const ctx2 = await servicoModelos(comPapel).montarContextoVariaveis(LIC_ID);
    expect(ctx2['agente.identificacao']).toBe('Agente de contratação: Carlos do Papel, designado por portaria do órgão');
    expect(ctx2['agente.assinatura']).toBe('Carlos do Papel — Agente de contratação');
    // dois com o papel: não escolhe por conta própria
    comPapel.agentesPorPapel.push({ nome: 'Outra Pessoa', cargo: null });
    expect((await servicoModelos(comPapel).montarContextoVariaveis(LIC_ID))['agente.identificacao']).toBe('Agente de contratação designado por portaria do órgão');
  });

  it('variável desconhecida (modelo do órgão com nome errado) sai como "—"', () => {
    const svc = servicoModelos(COMPLETO());
    expect(svc.substituirVariaveis('<p>{{orgao.inexistente}} e {{ orgao.nome }}</p>', { 'orgao.nome': 'X' })).toBe('<p>— e X</p>');
  });
});

// ---------------------------------------------------------------------------
// PDFs do DFD e do TR (o cabeçalho que saía cru na homologação)
// ---------------------------------------------------------------------------

describe('PDF gerado pelo modelo: cabeçalho preenchido, TR com a tabela de itens, sem "—" solto', () => {
  const dir = path.resolve(process.cwd(), 'uploads', 'fase-interna', LIC_ID);
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const modelosComCabecalho = MODELOS_PADRAO.map((m) => ({ ...m, id: `mod-${m.tipo}`, cabecalho_html: CABECALHO_PADRAO_HTML, rodape_html: RODAPE_PADRAO_HTML }));

  async function gerar(tipo: TipoDocumentoFaseInterna, dados: Record<string, string>, cenario = COMPLETO()) {
    const modelos = servicoModelos(cenario, modelosComCabecalho);
    const doc: any = {
      id: `doc-${tipo}`,
      licitacao_id: LIC_ID,
      tipo,
      titulo: tipo === 'TR' ? 'Termo de Referência' : 'Documento de Formalização da Demanda',
      dados_estruturados: dados,
      licitacao: { ...cenario.licitacao, orgao: cenario.orgao },
    };
    const itens = [
      { numero_item: 1, descricao_resumida: 'Licença mensal do software', unidade_medida: 'MES', quantidade: '12.0000', valor_unitario_estimado: '1550.0000', valor_total_estimado: '18600.00', codigo_catser: '27502', tipo_item: 'SERVICO' },
      { numero_item: 2, descricao_resumida: 'Implantação e treinamento', unidade_medida: 'SERVICO', quantidade: '1.0000', valor_unitario_estimado: '4000.0000', valor_total_estimado: '4000.00', codigo_catser: '16837', tipo_item: 'SERVICO' },
    ];
    const docRepo = { findOne: async () => doc, save: async (d: any) => d, manager: { query: async () => itens } };
    const gerador = new GeradorDocumentoService(docRepo as any, { log: async () => undefined } as any, modelos);
    const { caminho } = await gerador.gerarPdf(doc.id);
    const paginas = (await paginasDoPdf(fs.readFileSync(caminho))) ?? [];
    return paginas.map((p) => p.replace(/\s+/g, ' ')).join('\n');
  }

  it('DFD: cabeçalho com órgão, CNPJ e processo — sem "{{" e sem "12.0000"', async () => {
    const texto = await gerar(TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA, {
      demanda: '<p>Necessidade de software de gestão.</p>',
      quantidade: '<ul><li>Licença mensal do software — 12 meses (CATSER 27502)</li></ul>',
    });
    expect(texto).not.toContain('{{');
    // uma folha só (o rodapé não abre página em branco)
    expect(texto.split('\n')).toHaveLength(1);
    expect(texto).toMatch(/Câmara Municipal de Teste/);
    expect(texto).toMatch(/CNPJ: 62\.203\.670\/0001-62/);
    expect(texto).toMatch(/Processo Administrativo nº 202609\.26989/);
    expect(texto).not.toMatch(/12\.0000/);
    // seções opcionais vazias (previsão no PCA, data) omitidas — nunca "—" solto
    expect(texto).not.toMatch(/Previsão no PCA/);
  }, 60_000);

  it('TR: tabela de itens (descrição, CATSER, unidade, quantidade, unitário e total) e nota nas seções vazias', async () => {
    const texto = await gerar(TipoDocumentoFaseInterna.TERMO_REFERENCIA, {
      objeto: '<p>Licença de software de gestão e implantação.</p>',
      fundamentacao: '<p>Fundamento legal: Lei 14.133/2021, art. 75, II.</p>',
      estimativa_valor_tr: '<p>Valor total estimado da contratação: R$ 22.600,00, apurado na pesquisa de preços.</p>',
    });
    expect(texto).not.toContain('{{');
    expect(texto).toMatch(/Itens da contratação/);
    expect(texto).toMatch(/CATSER 27502/);
    expect(texto).toMatch(/CATSER 16837/);
    expect(texto).toMatch(/meses/);
    expect(texto).toMatch(/R\$\s?1\.550,00/);
    expect(texto).toMatch(/R\$\s?18\.600,00/);
    expect(texto).toMatch(/R\$\s?22\.600,00/);
    expect(texto).not.toMatch(/12\.0000/);
    expect(texto).toMatch(/Seção não preenchida nesta versão do documento/);
    expect(texto).not.toMatch(/(^|\n)\s*—\s*($|\n)/);
  }, 60_000);

  it('TR com orçamento sigiloso (art. 24): a tabela não mostra os valores', async () => {
    const c = COMPLETO();
    c.licitacao.sigilo_orcamento = 'SIGILOSO';
    const texto = await gerar(TipoDocumentoFaseInterna.TERMO_REFERENCIA, { objeto: '<p>Objeto.</p>' }, c);
    expect(texto).toMatch(/CATSER 27502/);
    expect(texto).not.toMatch(/18\.600,00/);
    expect(texto).toMatch(/sigiloso/i);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Pesquisa de preços: mapa e certidão (gerador próprio, sem modelo)
// ---------------------------------------------------------------------------

describe('PDFs da pesquisa (mapa e certidão): quantidade no padrão brasileiro, sem "A definir"', () => {
  const uploads = path.resolve(process.cwd(), 'uploads');
  afterAll(() => fs.rmSync(path.join(uploads, 'pesquisa-precos', LIC_ID), { recursive: true, force: true }));
  const c = INCOMPLETO();
  const repo = { findOne: async () => ({ ...c.licitacao, orgao: { ...c.orgao, logradouro: 'A definir', cep: '00000-000' } }) };
  const texto = async (rel: string) => ((await paginasDoPdf(fs.readFileSync(path.join(uploads, rel)))) ?? []).join('\n').replace(/\s+/g, ' ');

  it('mapa: "12 meses" (nunca "12.0000 MES"), sem "{{" e sem o endereço "A definir"', async () => {
    const pp = new GeradorPpService(repo as any);
    const rel = await pp.gerarDocumentoPP(LIC_ID, {
      numeroProcesso: '',
      objeto: '',
      orgao: '',
      itens: [
        {
          item_numero: 1,
          descricao: 'Licença mensal do software',
          quantidade: '12.0000' as any,
          unidade: 'MES',
          metodologia: 'MENOR_VALOR',
          valor_referencial: 1550,
          cotacoes: [{ fonte: 'FORNECEDOR_DIRETO', descricao_fonte: 'Fornecedor A', data_pesquisa: '2026-09-20', valor_unitario: 1550 }],
        } as any,
      ],
      metodologia: 'MENOR_VALOR',
      valorTotalEstimado: 18600,
      responsavel: { nome: 'Rita Compras', cargo: 'Compras' },
      dataAssinatura: '2026-09-26',
    });
    const t = await texto(rel);
    expect(t).toMatch(/Quantidade: 12 meses/);
    expect(t).not.toMatch(/12\.0000|A definir|00000-000|\{\{/);
  }, 60_000);

  it('mapa com várias páginas: nenhuma página em branco a mais (o rodapé não abre página nova)', async () => {
    const pp = new GeradorPpService(repo as any);
    const cotacoes = [1, 2, 3].map((n) => ({ fonte: 'FORNECEDOR_DIRETO', descricao_fonte: `Fornecedor ${n}`, fornecedor_razao_social: `Fornecedor ${n} Ltda`, data_pesquisa: '2026-09-20', valor_unitario: 100 * n }));
    const itens = Array.from({ length: 8 }, (_, i) => ({
      item_numero: i + 1,
      descricao: `Item ${i + 1} da pesquisa com descrição longa para ocupar espaço na folha`,
      quantidade: 2,
      unidade: 'UNIDADE',
      metodologia: 'MENOR_VALOR',
      valor_referencial: 100,
      cotacoes,
    })) as any[];
    const rel = await pp.gerarDocumentoPP(LIC_ID, {
      numeroProcesso: '',
      objeto: '',
      orgao: '',
      itens,
      metodologia: 'MENOR_VALOR',
      valorTotalEstimado: 1600,
      responsavel: { nome: 'Rita Compras', cargo: 'Compras' },
      dataAssinatura: '2026-09-26',
    });
    const buffer = fs.readFileSync(path.join(uploads, rel));
    const paginas = ((await paginasDoPdf(buffer)) ?? []).map((p) => p.replace(/\s+/g, ' '));
    expect(paginas.length).toBeGreaterThanOrEqual(2);
    // o rodapé "Página N de T" bate com o número real de páginas, e toda página tem conteúdo além dele
    paginas.forEach((p, i) => {
      expect(p).toContain(`Página ${i + 1} de ${paginas.length}`);
      expect(p.replace(/Pesquisa de Preços\s+—.*Página \d+ de \d+/, '').trim().length).toBeGreaterThan(20);
    });
  }, 60_000);

  it('certidão: sem cidade no cadastro, só a data (nunca "A definir, 26 de setembro")', async () => {
    const pp = new GeradorPpService(repo as any);
    const rel = await pp.gerarCertidao(LIC_ID, {
      parametros: [{ inciso: 'I', titulo: 'Painel de Preços', situacao_tela: 'SEM_RETORNO', evidencia_resumo: 'consultado em 20/09/2026' }],
      propostas: [{ fornecedor: 'Fornecedor A', cnpj: '11.222.333/0001-81', data_emissao: '2026-09-20', validade_ate: '2026-12-31', total: 18600, valida: true }],
      metodo: 'MENOR',
      justificativa_metodo: 'Menor preço entre propostas equivalentes.',
      total_adotado: 18600,
      sigiloso: false,
      responsavel: { nome: 'Rita Compras' },
    });
    const t = await texto(rel);
    expect(t).not.toMatch(/A definir|\{\{/);
    expect(t).toMatch(/Processo Administrativo nº 202609\.26989/);
  }, 60_000);
});
