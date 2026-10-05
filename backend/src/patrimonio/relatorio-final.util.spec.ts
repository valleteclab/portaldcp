import { montarRelatorioFinal, recomendacoes, SetorNoRelatorio } from './relatorio-final.util';
import { DadosTermoSetor } from './termo-conferencia.util';

const termo = (p: Partial<DadosTermoSetor['quadro']>, divs: DadosTermoSetor['divergencias'] = [], descartadas = 0): DadosTermoSetor => ({
  quadro: {
    cadastrados: 0, conferidos: 0, em_outro_setor: 0, nao_localizados: 0,
    sem_cadastro: 0, baixados_presentes: 0,
    valor_cadastrado: 0, valor_conferido: 0, valor_nao_localizado: 0,
    ...p,
  },
  divergencias: divs,
  descartadas,
});

/** Os dois setores do teste de campo na Câmara de LEM. */
const SETORES: SetorNoRelatorio[] = [
  {
    nome: 'Licitação',
    fechado: true,
    fechado_por: 'Loame Azevedo',
    dados: termo(
      { cadastrados: 64, conferidos: 58, em_outro_setor: 2, nao_localizados: 4, sem_cadastro: 1, valor_cadastrado: 128440, valor_conferido: 117890, valor_nao_localizado: 7130 },
      [
        { tombo: '691', descricao: 'POLTRONA GIRATORIA', ocorrencia: 'Não localizado' },
        { tombo: '1357', descricao: 'GAVETEIRO VOLANTE', ocorrencia: 'Pertence a Contabilidade, encontrado aqui' },
        { tombo: '—', descricao: 'MESA DE REUNIAO', ocorrencia: 'Encontrado sem cadastro' },
      ],
      3,
    ),
  },
  {
    nome: 'Contabilidade',
    fechado: false,
    dados: termo(
      { cadastrados: 36, conferidos: 30, em_outro_setor: 1, nao_localizados: 5, baixados_presentes: 1, valor_cadastrado: 71000, valor_conferido: 60000, valor_nao_localizado: 9000 },
      [
        { tombo: '1117', descricao: 'FRIGOBAR CONSUL', ocorrencia: 'Não localizado' },
        { tombo: '482', descricao: 'MICROCOMPUTADOR DELL', ocorrencia: 'Baixado no cadastro, porém presente' },
        { tombo: '1360', descricao: 'GAVETEIRO VOLANTE', ocorrencia: 'Localizado em Licitação' },
      ],
      1,
    ),
  },
];

describe('relatório final da comissão', () => {
  it('soma os termos de setor, sem recalcular nada por fora', () => {
    const r = montarRelatorioFinal(SETORES);
    expect(r.totais).toMatchObject({
      setores: 2,
      setores_fechados: 1,
      cadastrados: 100,
      conferidos: 88,
      em_outro_setor: 3,
      nao_localizados: 9,
      sem_cadastro: 1,
      baixados_presentes: 1,
      valor_cadastrado: 199440,
      valor_nao_localizado: 16130,
      descartadas: 4,
    });
  });

  it('índice de localização conta quem foi achado em outra sala', () => {
    const r = montarRelatorioFinal(SETORES);
    // (88 conferidos + 3 em outra sala) / 100
    expect(r.totais.indice_localizacao).toBe(91);
  });

  it('agrupa as divergências nas seções da norma, na ordem de leitura', () => {
    const r = montarRelatorioFinal(SETORES);
    expect(r.grupos.map((g) => g.titulo)).toEqual([
      'Bens não localizados',
      'Bens localizados em setor diverso do cadastro',
      'Bens encontrados sem cadastro',
      'Bens baixados e fisicamente presentes',
    ]);
    expect(r.grupos[0].linhas.map((l) => l.tombo)).toEqual(['691', '1117']);
    // cada linha carrega o setor de origem, senão a comissão não sabe onde agir
    expect(r.grupos[0].linhas[1].setor).toBe('Contabilidade');
  });

  it('as duas formas de "setor diverso" caem na mesma seção', () => {
    const r = montarRelatorioFinal(SETORES);
    const transferencias = r.grupos[1].linhas.map((l) => l.tombo);
    expect(transferencias).toEqual(['1357', '1360']);
  });

  it('seção sem ocorrência não aparece no relatório', () => {
    const r = montarRelatorioFinal([
      { nome: 'Almoxarifado', fechado: true, dados: termo({ cadastrados: 10, conferidos: 10 }) },
    ]);
    expect(r.grupos).toEqual([]);
    expect(r.totais.indice_localizacao).toBe(100);
  });

  it('avisa quais setores ainda não fecharam', () => {
    const r = montarRelatorioFinal(SETORES);
    expect(r.pendentes).toEqual(['Contabilidade']);
  });

  it('quadro por setor sai na ordem recebida, com o estado de cada um', () => {
    const r = montarRelatorioFinal(SETORES);
    expect(r.por_setor).toEqual([
      { setor: 'Licitação', cadastrados: 64, conferidos: 58, em_outro_setor: 2, nao_localizados: 4, fechado: true },
      { setor: 'Contabilidade', cadastrados: 36, conferidos: 30, em_outro_setor: 1, nao_localizados: 5, fechado: false },
    ]);
  });

  it('campanha sem setor não quebra nem divide por zero', () => {
    const r = montarRelatorioFinal([]);
    expect(r.totais.cadastrados).toBe(0);
    expect(r.totais.indice_localizacao).toBe(0);
    expect(r.grupos).toEqual([]);
  });

  describe('recomendações', () => {
    it('propõe apuração antes da baixa, nunca a baixa direta', () => {
      const r = recomendacoes(montarRelatorioFinal(SETORES).totais);
      expect(r[0]).toContain('apuração quanto aos 9 bens não localizados');
      expect(r[0]).toContain('baixa apenas após');
      expect(r.join(' ')).not.toMatch(/dar baixa (dos|nos) bens não localizados/i);
    });

    it('só propõe o que foi apurado', () => {
      const r = recomendacoes(montarRelatorioFinal(SETORES).totais);
      expect(r).toHaveLength(5);
      expect(r.some((x) => x.includes('transferência de carga dos 3 bens'))).toBe(true);
    });

    it('no singular a frase concorda — nada de "os 1 bens" num documento oficial', () => {
      const um = recomendacoes({
        ...montarRelatorioFinal([]).totais,
        nao_localizados: 1, em_outro_setor: 1, sem_cadastro: 1, baixados_presentes: 1,
      });
      expect(um[0]).toContain('quanto ao bem não localizado');
      expect(um[1]).toContain('carga do bem localizado em setor diverso');
      expect(um[2]).toContain('incorporar o bem encontrado sem cadastro');
      expect(um[3]).toContain('baixa do bem baixado e presente');
      expect(um.join(' ')).not.toMatch(/(os|dos|aos) 1 bens/);
    });

    it('setor sem divergência ainda recebe a recomendação de processo', () => {
      const r = recomendacoes(montarRelatorioFinal([{ nome: 'X', fechado: true, dados: termo({ cadastrados: 5, conferidos: 5 }) }]).totais);
      expect(r).toHaveLength(1);
      expect(r[0]).toContain('movimentação física de bem à prévia transferência');
    });
  });
});
