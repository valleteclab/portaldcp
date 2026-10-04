import {
  exigeConfirmacaoPresenca,
  leituraContaNoRelatorio,
  mensagemPendencias,
  pendentesDeConfirmacao,
} from './confirmacao-presenca.util';
import { SituacaoLeitura } from './entities/enums';

describe('confirmação de presença no fechamento da sala', () => {
  it('só pergunta para bem de outro setor e para baixado presente', () => {
    expect(exigeConfirmacaoPresenca(SituacaoLeitura.OUTRO_SETOR)).toBe(true);
    expect(exigeConfirmacaoPresenca(SituacaoLeitura.BAIXADO_PRESENTE)).toBe(true);
    expect(exigeConfirmacaoPresenca(SituacaoLeitura.ENCONTRADO)).toBe(false);
    expect(exigeConfirmacaoPresenca(SituacaoLeitura.DESCONHECIDO)).toBe(false);
    expect(exigeConfirmacaoPresenca(SituacaoLeitura.SEM_PLAQUETA)).toBe(false);
    expect(exigeConfirmacaoPresenca(null)).toBe(false);
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

  it('leitura comum sempre conta, respondida ou não', () => {
    expect(leituraContaNoRelatorio({ id: 'x', situacao: SituacaoLeitura.ENCONTRADO, presenca_confirmada: null })).toBe(true);
    expect(leituraContaNoRelatorio({ id: 'y', situacao: SituacaoLeitura.DESCONHECIDO, presenca_confirmada: false })).toBe(true);
  });

  it('a mensagem nomeia os bens em vez de só contar', () => {
    const msg = mensagemPendencias([
      { plaqueta: '1357', descricao: 'GAVETEIRO VOLANTE C/ 01 GAVETINHA' },
      { plaqueta: '1360', descricao: 'GAVETEIRO VOLANTE' },
    ]);
    expect(msg).toContain('os 2 bens de outros setores estão');
    expect(msg).toContain('1357 GAVETEIRO VOLANTE');
    expect(msg).toContain('1360 GAVETEIRO VOLANTE');
  });

  it('no singular muda a frase e, acima de 3, resume o resto', () => {
    expect(mensagemPendencias([{ plaqueta: '87', descricao: 'BIBLIA SAGRADA' }])).toContain('o bem de outro setor está');
    const muitos = mensagemPendencias(
      ['1', '2', '3', '4', '5'].map((p) => ({ plaqueta: p, descricao: 'CADEIRA' })),
    );
    expect(muitos).toContain('os 5 bens');
    expect(muitos).toContain('e mais 2');
  });

  it('bem sem plaqueta não quebra a mensagem', () => {
    expect(mensagemPendencias([{ plaqueta: null, descricao: 'MESA' }])).toContain('s/ plaqueta MESA');
  });
});
