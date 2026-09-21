import { incluirEmAnaliseNoAcumulado } from './em-analise-acumulado.util';
import { StatusMedicao } from './entities/medicao.entity';

describe('acumulado com medições em análise', () => {
  it('medição submetida soma as pendentes anteriores (caso 9ª/10ª da Ata 001/2025)', () => {
    expect(incluirEmAnaliseNoAcumulado({ status: StatusMedicao.SUBMETIDA })).toBe(true);
    expect(incluirEmAnaliseNoAcumulado({ status: StatusMedicao.AGUARDANDO_ATESTE })).toBe(true);
    expect(incluirEmAnaliseNoAcumulado({ status: StatusMedicao.AGUARDANDO_APROVACAO })).toBe(true);
    expect(incluirEmAnaliseNoAcumulado({ status: StatusMedicao.RASCUNHO })).toBe(true);
  });

  it('medição aprovada mantém o retrato só com o aprovado', () => {
    expect(incluirEmAnaliseNoAcumulado({ status: StatusMedicao.APROVADA })).toBe(false);
    expect(incluirEmAnaliseNoAcumulado({ status: 'aprovada' })).toBe(false);
  });

  it('sem medição de referência (visão do contrato) continua somando', () => {
    expect(incluirEmAnaliseNoAcumulado(null)).toBe(true);
    expect(incluirEmAnaliseNoAcumulado(undefined)).toBe(true);
  });

  it('a conta da 10ª medição: 3300 contratadas, 1910 aprovadas, 300 em análise, 240 nesta', () => {
    const total = 3300, aprovado = 1910, emAnalise9 = 300, noPeriodo10 = 240;
    const comPendente = incluirEmAnaliseNoAcumulado({ status: StatusMedicao.SUBMETIDA });
    const atePeriodo = aprovado + (comPendente ? emAnalise9 : 0) + noPeriodo10;
    expect(atePeriodo).toBe(2450);
    expect(total - atePeriodo).toBe(850); // e não 1150, como saía antes
  });
});
