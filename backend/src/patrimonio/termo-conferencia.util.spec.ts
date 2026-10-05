import {
  codigoVerificacao,
  leiturasValidas,
  montarTermoSetor,
  periodoConferencia,
} from './termo-conferencia.util';
import { SituacaoLeitura } from './entities/enums';

/** Setor da Licitação do teste de campo, com os bens reais da Câmara de LEM. */
const BENS = [
  { id: 'b1661', plaqueta: '1661', descricao: 'GAVETEIRO VOLANTE C/ 01 GAVETINHA', valor_aquisicao: 820 },
  { id: 'b1678', plaqueta: '1678', descricao: 'CADEIRA TIPO DIRETOR ESPALDAR MEDIO', valor_aquisicao: 640 },
  { id: 'b1688', plaqueta: '1688', descricao: 'CADEIRA TIPO DIRETOR ESPALDAR MEDIO', valor_aquisicao: 640 },
  { id: 'b0691', plaqueta: '691', descricao: 'POLTRONA GIRATORIA', valor_aquisicao: 1240 },
];

describe('termo de conferência do setor', () => {
  it('conta o que foi conferido e separa o que não foi achado', () => {
    const t = montarTermoSetor({
      bens: BENS,
      leituras: [
        { id: 'l1', bem_id: 'b1661', codigo_lido: '…1661', situacao: SituacaoLeitura.ENCONTRADO, presenca_confirmada: null },
        { id: 'l2', bem_id: 'b1678', codigo_lido: '…1678', situacao: SituacaoLeitura.ENCONTRADO, presenca_confirmada: null },
        { id: 'l3', bem_id: 'b1688', codigo_lido: '…1688', situacao: SituacaoLeitura.ENCONTRADO, presenca_confirmada: null },
      ],
    });
    expect(t.quadro).toMatchObject({
      cadastrados: 4,
      conferidos: 3,
      nao_localizados: 1,
      valor_cadastrado: 3340,
      valor_conferido: 2100,
      valor_nao_localizado: 1240,
    });
    expect(t.divergencias).toEqual([
      { tombo: '691', descricao: 'POLTRONA GIRATORIA', ocorrencia: 'Não localizado' },
    ]);
  });

  it('A REGRA: leitura negada pelo conferente não entra em lugar nenhum', () => {
    const t = montarTermoSetor({
      bens: BENS,
      leituras: [
        { id: 'l1', bem_id: 'b1661', codigo_lido: '…1661', situacao: SituacaoLeitura.ENCONTRADO, presenca_confirmada: null },
        // 1360 da Contabilidade, lido através da parede e negado
        {
          id: 'l9',
          bem_id: 'b1360',
          codigo_lido: '000000000000000000001360',
          situacao: SituacaoLeitura.OUTRO_SETOR,
          presenca_confirmada: false,
          setor_cadastro_nome: 'Contabilidade',
          bem: { id: 'b1360', plaqueta: '1360', descricao: 'GAVETEIRO VOLANTE' },
        },
      ],
    });
    expect(t.descartadas).toBe(1);
    expect(t.divergencias.some((d) => d.tombo === '1360')).toBe(false);
    expect(t.quadro.em_outro_setor).toBe(0);
  });

  it('o mesmo bem confirmado SIM vira divergência de transferência', () => {
    const t = montarTermoSetor({
      bens: BENS,
      leituras: [
        {
          id: 'l9',
          bem_id: 'b1357',
          codigo_lido: '000000000000000000001357',
          situacao: SituacaoLeitura.OUTRO_SETOR,
          presenca_confirmada: true,
          setor_cadastro_nome: 'Contabilidade',
          bem: { id: 'b1357', plaqueta: '1357', descricao: 'GAVETEIRO VOLANTE' },
        },
      ],
    });
    expect(t.descartadas).toBe(0);
    expect(t.divergencias).toContainEqual({
      tombo: '1357',
      descricao: 'GAVETEIRO VOLANTE',
      ocorrencia: 'Pertence a Contabilidade, encontrado aqui',
    });
  });

  it('bem achado por OUTRA sala não conta como falta deste setor', () => {
    const t = montarTermoSetor({
      bens: BENS,
      leituras: [],
      localizadosEmOutraSala: new Map([['b0691', 'Contabilidade']]),
    });
    expect(t.quadro.nao_localizados).toBe(3); // 1661, 1678, 1688 — não o 691
    expect(t.quadro.em_outro_setor).toBe(1);
    expect(t.divergencias).toContainEqual({
      tombo: '691',
      descricao: 'POLTRONA GIRATORIA',
      ocorrencia: 'Localizado em Contabilidade',
    });
    expect(t.quadro.valor_nao_localizado).toBe(2100);
  });

  it('bem sem cadastro e código não identificado entram como achado, não como falta', () => {
    const t = montarTermoSetor({
      bens: [],
      leituras: [
        { id: 's1', bem_id: 'novo', codigo_lido: 'x', situacao: SituacaoLeitura.SEM_PLAQUETA, presenca_confirmada: null, bem: { id: 'novo', plaqueta: '3400', descricao: 'MESA DE REUNIAO' } },
        { id: 's2', bem_id: null, codigo_lido: '000000000000000005750997', situacao: SituacaoLeitura.DESCONHECIDO, presenca_confirmada: true },
      ],
    });
    expect(t.quadro.sem_cadastro).toBe(2);
    expect(t.quadro.nao_localizados).toBe(0);
    expect(t.divergencias.map((d) => d.ocorrencia)).toEqual([
      'Encontrado sem cadastro',
      'Lido e não identificado no cadastro',
    ]);
  });

  it('baixado e presente aparece como divergência própria', () => {
    const t = montarTermoSetor({
      bens: [],
      leituras: [
        { id: 'z', bem_id: 'b482', codigo_lido: '…0482', situacao: SituacaoLeitura.BAIXADO_PRESENTE, presenca_confirmada: true, bem: { id: 'b482', plaqueta: '482', descricao: 'MICROCOMPUTADOR DELL' } },
      ],
    });
    expect(t.quadro.baixados_presentes).toBe(1);
    expect(t.divergencias[0].ocorrencia).toBe('Baixado no cadastro, porém presente');
  });

  it('setor conferido por inteiro não gera divergência nenhuma', () => {
    const t = montarTermoSetor({
      bens: BENS,
      leituras: BENS.map((b, i) => ({
        id: `l${i}`,
        bem_id: b.id,
        codigo_lido: b.plaqueta || '',
        situacao: SituacaoLeitura.ENCONTRADO,
        presenca_confirmada: null,
      })),
    });
    expect(t.divergencias).toEqual([]);
    expect(t.quadro.conferidos).toBe(4);
    expect(t.quadro.nao_localizados).toBe(0);
  });

  it('leiturasValidas descarta só o que foi negado', () => {
    const l = [
      { id: 'a', bem_id: null, codigo_lido: '1', situacao: SituacaoLeitura.OUTRO_SETOR, presenca_confirmada: false },
      { id: 'b', bem_id: null, codigo_lido: '2', situacao: SituacaoLeitura.OUTRO_SETOR, presenca_confirmada: true },
      { id: 'c', bem_id: null, codigo_lido: '3', situacao: SituacaoLeitura.ENCONTRADO, presenca_confirmada: null },
    ];
    expect(leiturasValidas(l).map((x) => x.id)).toEqual(['b', 'c']);
  });

  it('período em texto, com um dia só ou intervalo', () => {
    const d = (s: string) => new Date(`${s}T12:00:00Z`);
    expect(periodoConferencia(d('2026-10-03'), d('2026-10-04'))).toBe('03/10/2026 a 04/10/2026');
    expect(periodoConferencia(d('2026-10-04'), d('2026-10-04'))).toBe('04/10/2026');
    expect(periodoConferencia(null, d('2026-10-04'))).toBe('04/10/2026');
    expect(periodoConferencia(null, null)).toBe('—');
  });

  it('código de verificação é estável e no formato do rodapé', () => {
    const c = codigoVerificacao('abe8f0b5-2de2-4b70-b2db-a638517d3c2c');
    expect(c).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(codigoVerificacao('abe8f0b5-2de2-4b70-b2db-a638517d3c2c')).toBe(c);
    expect(codigoVerificacao('outro-setor-qualquer')).not.toBe(c);
  });
});
