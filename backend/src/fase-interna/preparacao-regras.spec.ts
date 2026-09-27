import { MINUTOS_PREPARACAO_TRAVADA, preparacaoTravada } from './preparacao-regras';

describe('preparacaoTravada (copiloto interrompido)', () => {
  const agora = new Date('2026-09-27T16:40:00.000Z');
  const minutosAtras = (m: number) => new Date(agora.getTime() - m * 60_000).toISOString();

  it('não trava quando não está executando', () => {
    expect(preparacaoTravada(null, agora)).toBe(false);
    expect(preparacaoTravada({ status: 'CONCLUIDA', iniciada_em: minutosAtras(90) }, agora)).toBe(false);
    expect(preparacaoTravada({ status: 'ERRO', iniciada_em: minutosAtras(90) }, agora)).toBe(false);
  });

  it('execução recente continua valendo (não deixa rodar duas vezes)', () => {
    expect(preparacaoTravada({ status: 'EXECUTANDO', iniciada_em: minutosAtras(5) }, agora)).toBe(false);
    expect(preparacaoTravada({ status: 'EXECUTANDO', iniciada_em: minutosAtras(MINUTOS_PREPARACAO_TRAVADA) }, agora)).toBe(false);
  });

  it('execução antiga ou sem data é tida como interrompida', () => {
    expect(preparacaoTravada({ status: 'EXECUTANDO', iniciada_em: minutosAtras(MINUTOS_PREPARACAO_TRAVADA + 1) }, agora)).toBe(true);
    expect(preparacaoTravada({ status: 'EXECUTANDO' }, agora)).toBe(true);
    expect(preparacaoTravada({ status: 'EXECUTANDO', iniciada_em: 'lixo' }, agora)).toBe(true);
  });
});
