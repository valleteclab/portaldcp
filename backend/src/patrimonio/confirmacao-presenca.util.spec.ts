import {
  exigeConfirmacaoPresenca,
  leituraContaNoRelatorio,
  localizadoEmOutroSetor,
  mensagemPendencias,
  pendentesDeConfirmacao,
} from './confirmacao-presenca.util';
import { SituacaoLeitura } from './entities/enums';

describe('confirmação de presença no fechamento da sala', () => {
  it('pergunta para outro setor, baixado presente e desconhecido', () => {
    expect(exigeConfirmacaoPresenca(SituacaoLeitura.OUTRO_SETOR)).toBe(true);
    expect(exigeConfirmacaoPresenca(SituacaoLeitura.BAIXADO_PRESENTE)).toBe(true);
    expect(exigeConfirmacaoPresenca(SituacaoLeitura.DESCONHECIDO)).toBe(true);
    // já conferido na própria sala, ou cadastrado na hora: nada a perguntar
    expect(exigeConfirmacaoPresenca(SituacaoLeitura.ENCONTRADO)).toBe(false);
    expect(exigeConfirmacaoPresenca(SituacaoLeitura.SEM_PLAQUETA)).toBe(false);
    expect(exigeConfirmacaoPresenca(null)).toBe(false);
  });

  it('desconhecido sem resposta trava o fechamento (caso 0000…5750997)', () => {
    const leituras = [
      { id: 'd1', situacao: SituacaoLeitura.DESCONHECIDO, presenca_confirmada: null },
      { id: 'd2', situacao: SituacaoLeitura.DESCONHECIDO, presenca_confirmada: false },
    ];
    expect(pendentesDeConfirmacao(leituras).map((l) => l.id)).toEqual(['d1']);
    // "não é daqui" sai do relatório; "é bem daqui" fica como divergência
    expect(leituraContaNoRelatorio(leituras[1])).toBe(false);
    expect(leituraContaNoRelatorio({ id: 'd3', situacao: SituacaoLeitura.DESCONHECIDO, presenca_confirmada: true })).toBe(true);
  });

  it('bem confirmado em outra sala: o setor de origem não pode cobrar como falta', () => {
    expect(localizadoEmOutroSetor({ id: 'a', situacao: SituacaoLeitura.OUTRO_SETOR, presenca_confirmada: true })).toBe(true);
    // respondido "não está": foi leitura pela parede, o bem segue pendente lá
    expect(localizadoEmOutroSetor({ id: 'b', situacao: SituacaoLeitura.OUTRO_SETOR, presenca_confirmada: false })).toBe(false);
    expect(localizadoEmOutroSetor({ id: 'c', situacao: SituacaoLeitura.OUTRO_SETOR, presenca_confirmada: null })).toBe(false);
    expect(localizadoEmOutroSetor({ id: 'd', situacao: SituacaoLeitura.ENCONTRADO, presenca_confirmada: true })).toBe(false);
  });

  it('pendente é o que ainda não foi respondido', () => {
    const leituras = [
      { id: 'a', situacao: SituacaoLeitura.OUTRO_SETOR, presenca_confirmada: null },
      { id: 'b', situacao: SituacaoLeitura.OUTRO_SETOR, presenca_confirmada: true },
      { id: 'c', situacao: SituacaoLeitura.OUTRO_SETOR, presenca_confirmada: false },
      { id: 'd', situacao: SituacaoLeitura.BAIXADO_PRESENTE, presenca_confirmada: undefined },
      { id: 'e', situacao: SituacaoLeitura.ENCONTRADO, presenca_confirmada: null },
    ];
    expect(pendentesDeConfirmacao(leituras).map((l) => l.id)).toEqual(['a', 'd']);
  });

  it('o caso real do teste: 1357 e 1360 da Contabilidade lidos na sala da Licitação', () => {
    const leituras = [
      { id: '1357', situacao: SituacaoLeitura.OUTRO_SETOR, presenca_confirmada: null },
      { id: '1360', situacao: SituacaoLeitura.OUTRO_SETOR, presenca_confirmada: null },
    ];
    expect(pendentesDeConfirmacao(leituras)).toHaveLength(2);
    // conferente responde: o 1357 está aqui, o 1360 foi lido pela parede
    leituras[0].presenca_confirmada = true as any;
    leituras[1].presenca_confirmada = false as any;
    expect(pendentesDeConfirmacao(leituras)).toHaveLength(0);
    expect(leituraContaNoRelatorio(leituras[0])).toBe(true);
    expect(leituraContaNoRelatorio(leituras[1])).toBe(false);
  });

  it('leitura da própria sala sempre conta, respondida ou não', () => {
    expect(leituraContaNoRelatorio({ id: 'x', situacao: SituacaoLeitura.ENCONTRADO, presenca_confirmada: null })).toBe(true);
    expect(leituraContaNoRelatorio({ id: 'y', situacao: SituacaoLeitura.SEM_PLAQUETA, presenca_confirmada: false })).toBe(true);
  });

  it('a mensagem nomeia os bens em vez de só contar', () => {
    const msg = mensagemPendencias([
      { plaqueta: '1357', descricao: 'GAVETEIRO VOLANTE C/ 01 GAVETINHA' },
      { plaqueta: '1360', descricao: 'GAVETEIRO VOLANTE' },
    ]);
    expect(msg).toContain('as 2 leituras que não são desta sala');
    expect(msg).toContain('1357 GAVETEIRO VOLANTE');
    expect(msg).toContain('1360 GAVETEIRO VOLANTE');
  });

  it('no singular muda a frase e, acima de 3, resume o resto', () => {
    expect(mensagemPendencias([{ plaqueta: '87', descricao: 'BIBLIA SAGRADA' }])).toContain('a leitura que não é desta sala');
    const muitos = mensagemPendencias(
      ['1', '2', '3', '4', '5'].map((p) => ({ plaqueta: p, descricao: 'CADEIRA' })),
    );
    expect(muitos).toContain('as 5 leituras');
    expect(muitos).toContain('e mais 2');
  });

  it('bem sem plaqueta não quebra a mensagem', () => {
    expect(mensagemPendencias([{ plaqueta: null, descricao: 'MESA' }])).toContain('s/ plaqueta MESA');
  });

  it('desconhecido aparece pelo código, já que não tem bem', () => {
    const msg = mensagemPendencias([{ codigo_lido: '000000000000000005750997' }]);
    expect(msg).toContain('código 000000000000000005750997');
  });
});
