import {
  LicitacaoParaPncp,
  amparoDoInciso,
  amparoLegalIdPncp,
  criterioDoArt60,
  anoCompraPncp,
  categoriaProcessoId,
  criterioJulgamentoIdPncp,
  datasDasPropostas,
  documentoDaCompra,
  formatarDataHoraBrasilia,
  instrumentoConvocatorioId,
  materialOuServico,
  modalidadeIdPncp,
  modoDisputaIdPncp,
  montarCompra,
  montarResultadoItem,
  numeroCompraPncp,
  percentualDescontoPncp,
  portePncp,
  situacaoItemPncpDoStatus,
  situacaoPncpDaSituacao,
  tipoBeneficioIdPncp,
} from './mapeamento-pncp';
import { ErroPncp } from './fila/regras-fila';

const lic = (p: Partial<LicitacaoParaPncp> = {}): LicitacaoParaPncp => ({
  id: 'L1',
  modalidade: 'PREGAO_ELETRONICO',
  criterio_julgamento: 'MENOR_PRECO',
  modo_disputa: 'ABERTO',
  tipo_contratacao: 'COMPRA',
  srp: false,
  numero_processo: 'PE-012/2026',
  objeto: 'Aquisição de cadeiras',
  data_publicacao_edital: '2026-09-25T13:00:00Z',
  data_inicio_acolhimento: '2026-09-25T13:00:00Z',
  data_fim_acolhimento: '2026-10-08T12:00:00Z',
  ...p,
});

const cenario = (modalidade: string, extra: Partial<LicitacaoParaPncp> = {}) => {
  const l = lic({ modalidade, ...extra });
  const inst = instrumentoConvocatorioId(l);
  return { inst, modalidade: modalidadeIdPncp(modalidade), modo: modoDisputaIdPncp(l, inst), amparo: amparoLegalIdPncp(l), criterio: criterioJulgamentoIdPncp(l, inst), doc: documentoDaCompra(l).tipoDocumentoId };
};

describe('mapeamento licitação → PNCP (tabelas de domínio e conformidade)', () => {
  test.each([
    // modalidade, extras, instrumento, modalidadeId, modo, amparo, critério, tipo de documento
    ['PREGAO_ELETRONICO', {}, 1, 6, 1, 1, 1, 2],
    ['PREGAO_ELETRONICO', { criterio_julgamento: 'MAIOR_DESCONTO', modo_disputa: 'ABERTO_FECHADO' }, 1, 6, 3, 1, 2, 2],
    ['CONCORRENCIA', { criterio_julgamento: 'TECNICA_E_PRECO', modo_disputa: 'FECHADO_ABERTO' }, 1, 4, 6, 2, 4, 2],
    ['CONCORRENCIA', { criterio_julgamento: 'MELHOR_TECNICA', modo_disputa: 'FECHADO' }, 1, 4, 2, 2, 8, 2],
    ['CONCORRENCIA', { criterio_julgamento: 'MAIOR_RETORNO_ECONOMICO' }, 1, 4, 1, 2, 6, 2],
    ['CONCURSO', { modo_disputa: null }, 1, 3, 2, 3, 1, 2],
    ['LEILAO', { criterio_julgamento: 'MAIOR_LANCE' }, 1, 1, 1, 4, 5, 2],
    ['DIALOGO_COMPETITIVO', {}, 1, 2, 1, 5, 1, 2],
    ['DISPENSA_ELETRONICA', {}, 2, 8, 4, 19, 1, 1],
    ['DISPENSA_ELETRONICA', { tipo_contratacao: 'SERVICO_ENGENHARIA' }, 2, 8, 4, 18, 1, 1],
    ['DISPENSA_ELETRONICA', { modo_disputa: null }, 3, 8, 5, 19, 7, 20],
    ['INEXIGIBILIDADE', {}, 3, 9, 5, 50, 7, 20],
    // E7b: edital de chamamento sem disputa nem julgamento — modo e critério "não se aplica"
    ['CREDENCIAMENTO', {}, 1, 12, 5, 47, 7, 2],
  ])('%s %j', (modalidade, extra, inst, mod, modo, amparo, criterio, doc) => {
    expect(cenario(modalidade, extra as Partial<LicitacaoParaPncp>)).toEqual({ inst, modalidade: mod, modo, amparo, criterio, doc });
  });

  test('conformidade instrumento × modo: Edital nunca "dispensa com disputa"/"não se aplica"', () => {
    for (const m of ['PREGAO_ELETRONICO', 'CONCORRENCIA', 'LEILAO', 'CONCURSO', 'DIALOGO_COMPETITIVO']) {
      expect([1, 2, 3, 6]).toContain(cenario(m).modo);
    }
  });

  test('modalidade desconhecida é erro definitivo (nunca "pregão" por padrão)', () => {
    expect(() => modalidadeIdPncp('CONVITE_ANTIGO')).toThrow(ErroPncp);
  });

  test('materialOuServico: tipo do item → catálogo → tipo da contratação; leilão sempre M', () => {
    expect(materialOuServico({ tipo_item: 'SERVICO' }, lic())).toBe('S');
    expect(materialOuServico({ tipo_item: 'MATERIAL' }, lic({ tipo_contratacao: 'SERVICO' }))).toBe('M');
    expect(materialOuServico({ codigo_catser: '123' }, lic())).toBe('S');
    expect(materialOuServico({ codigo_catmat: '9' }, lic({ tipo_contratacao: 'SERVICO' }))).toBe('M');
    expect(materialOuServico({}, lic({ tipo_contratacao: 'OBRA' }))).toBe('S');
    expect(materialOuServico({}, lic())).toBe('M');
    expect(materialOuServico({ tipo_item: 'SERVICO' }, lic({ modalidade: 'LEILAO' }))).toBe('M');
  });

  test('benefício ME/EPP do item: cota 3, exclusiva 1, ampla 4, leilão 5', () => {
    expect(tipoBeneficioIdPncp({ tipo: 'EXCLUSIVO', ehCota: true, somenteMpe: true }, 'PREGAO_ELETRONICO')).toBe(3);
    expect(tipoBeneficioIdPncp({ tipo: 'EXCLUSIVO', ehCota: false, somenteMpe: true }, 'PREGAO_ELETRONICO')).toBe(1);
    expect(tipoBeneficioIdPncp({ tipo: 'COTA_RESERVADA', ehCota: false, somenteMpe: false }, 'PREGAO_ELETRONICO')).toBe(4);
    expect(tipoBeneficioIdPncp(null, 'PREGAO_ELETRONICO')).toBe(4);
    expect(tipoBeneficioIdPncp(null, 'LEILAO')).toBe(5);
  });

  test('datas em horário de Brasília, sem inventar nada', () => {
    expect(formatarDataHoraBrasilia('2026-10-08T12:00:00Z')).toBe('2026-10-08T09:00:00');
    expect(datasDasPropostas(lic(), 1)).toEqual({ dataAberturaProposta: '2026-09-25T10:00:00', dataEncerramentoProposta: '2026-10-08T09:00:00' });
    expect(() => datasDasPropostas(lic({ data_fim_acolhimento: null, data_abertura_sessao: null }), 1)).toThrow(/fim do recebimento/);
    expect(datasDasPropostas(lic({ data_fim_acolhimento: null }), 3)).toEqual({}); // Ato: datas desprezadas
  });

  test('ano da compra = ano da publicação (Brasília), não da criação', () => {
    expect(anoCompraPncp({ data_publicacao_edital: '2027-01-01T02:00:00Z' })).toBe(2026); // 31/12 23h em Brasília
    expect(anoCompraPncp({ data_publicacao_edital: null }, new Date('2027-03-01T12:00:00Z'))).toBe(2027);
  });

  test('número da compra sem o ano', () => {
    expect(numeroCompraPncp({ numero_processo: 'PE-012/2026' })).toBe('PE-012');
    expect(numeroCompraPncp({ numero_processo: 'X', numero_edital: '15 / 2026' })).toBe('15');
  });

  test('compra montada: sem campos inexistentes, itens com critério da licitação e unidade obrigatória', () => {
    const c = montarCompra(lic({ criterio_julgamento: 'MAIOR_DESCONTO', sigilo_orcamento: 'SIGILOSO' }), [
      { numero_item: 1, descricao_resumida: 'Cadeira', quantidade: '10', valor_unitario_estimado: '100', tipo_item: 'MATERIAL' },
      { numero_item: 2, descricao_resumida: 'Montagem', quantidade: 1, valor_unitario_estimado: 50, tipo_item: 'SERVICO', margem_preferencia: true, percentual_margem: 10 },
    ], { codigoUnidade: '1', linkSistemaOrigem: 'http://x/l/L1' });
    expect(c).toMatchObject({ anoCompra: 2026, numeroCompra: 'PE-012', modalidadeId: 6, amparoLegalId: 1, informacaoComplementar: '' });
    expect(c.itensCompra.map((i) => [i.materialOuServico, i.criterioJulgamentoId, i.orcamentoSigiloso, i.valorTotal])).toEqual([
      ['M', 2, true, 1000],
      ['S', 2, true, 50],
    ]);
    expect(c.itensCompra[1]).toMatchObject({ aplicabilidadeMargemPreferenciaNormal: true, percentualMargemPreferenciaNormal: 10 });
    expect(() => montarCompra(lic(), [], { codigoUnidade: '', linkSistemaOrigem: '' })).toThrow(/unidade compradora/);
  });

  test('situação: compra (divulgada/suspensa/revogada/anulada) e itens (deserto/fracassado)', () => {
    expect(situacaoPncpDaSituacao('ATIVA')).toEqual({ compra: 1 });
    expect(situacaoPncpDaSituacao('REVOGADA')).toEqual({ compra: 2 });
    expect(situacaoPncpDaSituacao('ANULADA')).toEqual({ compra: 3 });
    expect(situacaoPncpDaSituacao('SUSPENSA')).toEqual({ compra: 4 });
    expect(situacaoPncpDaSituacao('DESERTA')).toEqual({ itens: 4 });
    expect(situacaoPncpDaSituacao('FRACASSADA')).toEqual({ itens: 5 });
    expect(situacaoPncpDaSituacao('CONCLUIDA')).toBeNull();
    expect([situacaoItemPncpDoStatus('HOMOLOGADO'), situacaoItemPncpDoStatus('DESERTO'), situacaoItemPncpDoStatus('FRACASSADO'), situacaoItemPncpDoStatus('CANCELADO'), situacaoItemPncpDoStatus('ATIVO')]).toEqual([2, 4, 5, 3, null]);
  });

  const baseResultado = {
    quantidade: 10,
    valorUnitario: 89,
    valorTotal: 890,
    fornecedor: { ni: '12.345.678/0001-90', razaoSocial: 'ME Ltda', porte: 'ME' },
    criterio: 'MENOR_PRECO',
    valorUnitarioEstimado: 100,
    ordemClassificacao: 1,
    dataResultado: '2026-09-25T20:00:00Z',
    beneficioMeEpp: false,
    criterioDesempate: false,
  };

  test('resultado: porte do retrato, ordem real, flags ME/EPP e desempate, data de Brasília', () => {
    const r = montarResultadoItem({ ...baseResultado, ordemClassificacao: 2, beneficioMeEpp: true });
    expect(r).toMatchObject({
      niFornecedor: '12345678000190',
      tipoPessoaId: 'PJ',
      porteFornecedorId: 1,
      ordemClassificacaoSrp: 2,
      aplicacaoBeneficioMeEpp: true,
      aplicacaoCriterioDesempate: false,
      percentualDesconto: 0,
      dataResultado: '2026-09-25',
      valorTotalHomologado: 890,
    });
    expect(r).not.toHaveProperty('amparoLegalCriterioDesempateId');
    const d = montarResultadoItem({ ...baseResultado, criterioDesempate: true, amparoLegalCriterioDesempateId: 146 });
    expect(d).toMatchObject({ aplicacaoCriterioDesempate: true, amparoLegalCriterioDesempateId: 146 });
    expect(() => montarResultadoItem({ ...baseResultado, criterioDesempate: true })).toThrow(/amparo legal/);
  });

  test('desempate: só critério do art. 60 marca o indicador (sorteio da IN 73 não); amparo casa o inciso EXATO', () => {
    expect(criterioDoArt60('EMPRESA_DO_ESTADO')).toBe(true);
    expect(criterioDoArt60('DISPUTA_FINAL')).toBe(true);
    expect(criterioDoArt60('SORTEIO')).toBe(false);
    expect(criterioDoArt60(null)).toBe(false);
    const tabela = [
      { id: 140, nome: 'Lei 14.133/2021, Art. 60, I' },
      { id: 141, nome: 'Lei 14.133/2021, Art. 60, II' },
      { id: 143, nome: 'Lei 14.133/2021, Art. 60, IV' },
      { id: 146, nome: 'Lei 14.133/2021, Art. 60, § 1º, I' },
      { id: 147, nome: 'Lei 14.133/2021, Art. 60, § 1º, II' },
    ];
    expect(amparoDoInciso(tabela, 'Lei 14.133/2021, art. 60, I')).toBe(140);
    expect(amparoDoInciso(tabela, 'Lei 14.133/2021, art. 60, II')).toBe(141);
    expect(amparoDoInciso(tabela, 'Lei 14.133/2021, art. 60, IV')).toBe(143);
    expect(amparoDoInciso(tabela, 'Lei 14.133/2021, art. 60, §1º, I')).toBe(146);
    expect(amparoDoInciso(tabela, 'Lei 14.133/2021, art. 60, §1º, II')).toBe(147);
    // sem o inciso na tabela: null (nunca um amparo qualquer)
    expect(amparoDoInciso(tabela, 'Lei 14.133/2021, art. 60, III')).toBeNull();
    expect(amparoDoInciso(tabela, 'IN SEGES 73/2022, art. 28, §2º')).toBeNull();
  });

  test('percentual de desconto só no MAIOR DESCONTO', () => {
    expect(percentualDescontoPncp('MAIOR_DESCONTO', 100, 87.5)).toBe(12.5);
    expect(percentualDescontoPncp('MENOR_PRECO', 100, 87.5)).toBe(0);
    expect(montarResultadoItem({ ...baseResultado, criterio: 'MAIOR_DESCONTO' }).percentualDesconto).toBe(11);
  });

  test('porte: ME/MEI 1, EPP 2, demais 3, PF 4, sem porte 5', () => {
    expect(['ME', 'MEI', 'EPP', 'DEMAIS', 'GRANDE'].map((p) => portePncp(p))).toEqual([1, 1, 2, 3, 3]);
    expect(portePncp('ME', 'PF')).toBe(4);
    expect(portePncp(null)).toBe(5);
  });

  test('categoria do processo do contrato', () => {
    expect(['COMPRA', 'SERVICO', 'SERVICO_ENGENHARIA', 'OBRA', 'ALIENACAO'].map(categoriaProcessoId)).toEqual([2, 8, 9, 7, 11]);
  });
});

describe('E7c — leilão, concurso e diálogo no PNCP', () => {
  const { criterioJulgamentoIdPncp, modoDisputaIdPncp, montarItemCompra } = require('./mapeamento-pncp');
  test('concurso artístico → conteúdo artístico (9); técnico → melhor técnica (8); modo sempre fechado', () => {
    expect(criterioJulgamentoIdPncp({ modalidade: 'CONCURSO', criterio_julgamento: 'MELHOR_TECNICA', natureza_trabalho_concurso: 'ARTISTICO' }, 1)).toBe(9);
    expect(criterioJulgamentoIdPncp({ modalidade: 'CONCURSO', criterio_julgamento: 'MELHOR_TECNICA', natureza_trabalho_concurso: 'TECNICO' }, 1)).toBe(8);
    expect(criterioJulgamentoIdPncp({ modalidade: 'CONCORRENCIA', criterio_julgamento: 'MELHOR_TECNICA', natureza_trabalho_concurso: 'ARTISTICO' }, 1)).toBe(8);
    expect(modoDisputaIdPncp({ modalidade: 'CONCURSO', modo_disputa: 'ABERTO' }, 1)).toBe(2);
  });
  test('leilão: categoria do item pelo tipo do bem (imóvel 1; móvel 2)', () => {
    const lic = { id: 'l', modalidade: 'LEILAO', criterio_julgamento: 'MAIOR_LANCE', numero_processo: 'P', objeto: 'o' };
    expect(montarItemCompra({ quantidade: 1, valor_unitario_estimado: 10, tipo_bem_leilao: 'IMOVEL' }, 0, lic, null, 1).itemCategoriaId).toBe(1);
    expect(montarItemCompra({ quantidade: 1, valor_unitario_estimado: 10, tipo_bem_leilao: 'VEICULO' }, 0, lic, null, 1).itemCategoriaId).toBe(2);
  });
});

