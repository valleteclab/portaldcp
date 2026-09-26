import {
  StatusContraproposta,
  StatusNegociacao,
  acimaDoPrecoMaximo,
  eventoVisivel,
  filtrarEventosVisiveis,
  motivoContrapropostaInvalida,
  motivoNaoAbre,
  motivoNaoAceitaPreco,
  motivoNaoDesclassifica,
  motivoNaoEncerra,
  motivoNaoResponde,
  precoMaximoDaUnidade,
  totalDaBase,
} from './regras-negociacao';

const emAndamento = (extra: Record<string, any> = {}) => ({ status: StatusNegociacao.EM_ANDAMENTO, contraproposta_status: null, rodadas: [], ...extra });

describe('regras da negociação (Lei 14.133 art. 61; IN 73 art. 30)', () => {
  describe('preço máximo', () => {
    it('soma o total estimado dos itens da unidade; sem estimativa não há preço máximo', () => {
      expect(precoMaximoDaUnidade([{ valorTotalEstimado: 600 }, { valorTotalEstimado: 400.5 }])).toBe(1000.5);
      expect(precoMaximoDaUnidade([{ valorTotalEstimado: 0 }])).toBeNull();
    });

    it('converte a base UNITARIO em total e compara com tolerância de centavo', () => {
      expect(totalDaBase(95.5, 'UNITARIO', 10)).toBe(955);
      expect(totalDaBase(955, 'TOTAL_ITEM', 10)).toBe(955);
      expect(acimaDoPrecoMaximo(1000.004, 1000)).toBe(false);
      expect(acimaDoPrecoMaximo(1000.01, 1000)).toBe(true);
      expect(acimaDoPrecoMaximo(5000, null)).toBe(false);
    });
  });

  describe('flag "negociação obrigatória" — gate do aceite', () => {
    it('acima do máximo sem negociação: bloqueia e manda negociar', () => {
      const m = motivoNaoAceitaPreco({ valorTotal: 1200, precoMaximo: 1000, negociacaoEmAndamento: false, negociou: false });
      expect(m).toMatch(/negocie/);
      expect(m).toMatch(/art\. 61/);
    });

    it('negociação em andamento sempre bloqueia o aceite', () => {
      expect(motivoNaoAceitaPreco({ valorTotal: 900, precoMaximo: 1000, negociacaoEmAndamento: true, negociou: false })).toMatch(/andamento/);
    });

    it('dentro do máximo: aceita sem negociar', () => {
      expect(motivoNaoAceitaPreco({ valorTotal: 1000, precoMaximo: 1000, negociacaoEmAndamento: false, negociou: false })).toBeNull();
    });

    it('acima do máximo depois de negociar: exige motivação (mín. 20 caracteres) ou desclassificação', () => {
      const base = { valorTotal: 1100, precoMaximo: 1000, negociacaoEmAndamento: false, negociou: true };
      expect(motivoNaoAceitaPreco(base)).toMatch(/desclassifique/);
      expect(motivoNaoAceitaPreco({ ...base, justificativa: 'curta' })).toMatch(/motiva/);
      expect(motivoNaoAceitaPreco({ ...base, justificativa: 'Orçamento defasado: pesquisa de preços de 2024, IPCA acumulado' })).toBeNull();
    });
  });

  describe('abertura', () => {
    const ok = { direcao: 'MENOR' as const, unidadeEncerrada: true, comResultado: true, situacaoAtual: 'CLASSIFICADO', jaHaAtiva: false };
    it('com o licitante na vez classificado ou convocado para a aceitação', () => {
      expect(motivoNaoAbre(ok)).toBeNull();
      expect(motivoNaoAbre({ ...ok, situacaoAtual: 'CONVOCADO_ACEITACAO' })).toBeNull();
    });
    it('recusa: maior lance, unidade aberta, sem resultado, proposta já aceita, desempate pendente, outra ativa', () => {
      expect(motivoNaoAbre({ ...ok, direcao: 'MAIOR' })).toMatch(/menor valor/);
      expect(motivoNaoAbre({ ...ok, unidadeEncerrada: false })).toMatch(/encerramento/);
      expect(motivoNaoAbre({ ...ok, comResultado: false })).toMatch(/deserta/);
      expect(motivoNaoAbre({ ...ok, situacaoAtual: 'ACEITO' })).toMatch(/aceita/);
      expect(motivoNaoAbre({ ...ok, situacaoAtual: 'CONVOCADO_DESEMPATE' })).toMatch(/ME\/EPP/);
      expect(motivoNaoAbre({ ...ok, jaHaAtiva: true })).toMatch(/em andamento/);
      expect(motivoNaoAbre({ ...ok, situacaoAtual: null })).toMatch(/classificado/);
    });
  });

  describe('contraproposta: valor aceito é MENOR que o atual', () => {
    it('recusa valor igual ou maior que o atual, inválido ou com casas demais', () => {
      expect(motivoContrapropostaInvalida(emAndamento(), 1000, 1000)).toMatch(/menor que o valor atual/);
      expect(motivoContrapropostaInvalida(emAndamento(), 1000.01, 1000)).toMatch(/menor/);
      expect(motivoContrapropostaInvalida(emAndamento(), 0, 1000)).toMatch(/Informe/);
      expect(motivoContrapropostaInvalida(emAndamento(), 999.123, 1000, { casas: 2 })).toMatch(/casas/);
      expect(motivoContrapropostaInvalida(emAndamento(), 999.99, 1000)).toBeNull();
    });
    it('uma contraproposta pendente de cada vez; negociação concluída não recebe outra', () => {
      expect(motivoContrapropostaInvalida(emAndamento({ contraproposta_status: StatusContraproposta.PENDENTE }), 900, 1000)).toMatch(/aguardando/);
      expect(motivoContrapropostaInvalida({ status: StatusNegociacao.CONCLUIDA }, 900, 1000)).toMatch(/concluída/);
    });
  });

  describe('resposta, encerramento e desclassificação (recusa → próximo)', () => {
    it('só responde com contraproposta pendente', () => {
      expect(motivoNaoResponde(emAndamento())).toMatch(/Não há contraproposta/);
      expect(motivoNaoResponde(emAndamento({ contraproposta_status: StatusContraproposta.PENDENTE }))).toBeNull();
      expect(motivoNaoResponde(emAndamento({ contraproposta_status: StatusContraproposta.PROCESSANDO }))).toMatch(/processada/);
    });

    it('não encerra com contraproposta pendente', () => {
      expect(motivoNaoEncerra(emAndamento({ contraproposta_status: StatusContraproposta.PENDENTE }))).toMatch(/Aguarde/);
      expect(motivoNaoEncerra(emAndamento({ contraproposta_status: StatusContraproposta.RECUSADA }))).toBeNull();
    });

    it('desclassifica só depois de negociar e com o valor ainda acima do máximo', () => {
      const recusada = emAndamento({ contraproposta_status: StatusContraproposta.RECUSADA, rodadas: [{ status: StatusContraproposta.RECUSADA }] });
      expect(motivoNaoDesclassifica(emAndamento(), 1200, 1000)).toMatch(/Negocie antes/);
      expect(motivoNaoDesclassifica(recusada, 1000, 1000)).toMatch(/não está acima/);
      expect(motivoNaoDesclassifica(recusada, 1200, 1000)).toBeNull();
      expect(
        motivoNaoDesclassifica(emAndamento({ contraproposta_status: StatusContraproposta.PENDENTE, rodadas: [{ status: 'PENDENTE' }] }), 1200, 1000),
      ).toMatch(/Aguarde/);
    });
  });

  describe('visibilidade PARTICIPANTES (IN 73 art. 30 §1º)', () => {
    const acompanhado = { dados_adicionais: { visibilidade: 'PARTICIPANTES', fornecedor_id: 'F1' } };
    it('órgão e todo licitante participante leem; público anônimo e outros órgãos (visão PUBLICO) não', () => {
      expect(eventoVisivel(acompanhado, { tipo: 'ORGAO' })).toBe(true);
      expect(eventoVisivel(acompanhado, { tipo: 'FORNECEDOR', fornecedorId: 'F1' })).toBe(true);
      expect(eventoVisivel(acompanhado, { tipo: 'FORNECEDOR', fornecedorId: 'F2' })).toBe(true);
      expect(eventoVisivel(acompanhado, { tipo: 'PUBLICO' })).toBe(false);
    });
  });

  describe('visibilidade dos eventos privados', () => {
    const privado = { dados_adicionais: { visibilidade: 'PRIVADA', fornecedor_id: 'F1' } };
    const publico = { dados_adicionais: { negociacao_id: 'n' } };
    it('órgão e o próprio licitante veem; outro licitante e o público não', () => {
      expect(eventoVisivel(privado, { tipo: 'ORGAO' })).toBe(true);
      expect(eventoVisivel(privado, { tipo: 'FORNECEDOR', fornecedorId: 'F1' })).toBe(true);
      expect(eventoVisivel(privado, { tipo: 'FORNECEDOR', fornecedorId: 'F2' })).toBe(false);
      expect(eventoVisivel(privado, { tipo: 'PUBLICO' })).toBe(false);
      expect(filtrarEventosVisiveis([privado, publico, { dados_adicionais: null }], { tipo: 'PUBLICO' })).toHaveLength(2);
    });
  });
});
