import { competenciaDoPeriodo, textoPeriodoBoletim } from './competencia-boletim.util';

const fmt = (d: any) => {
  const t = String(d ?? '').slice(0, 10);
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '-';
};

describe('competência no campo Período do boletim', () => {
  it('mês vem do período da medição', () => {
    expect(competenciaDoPeriodo('2026-08-01')).toBe('AGOSTO/2026');
    expect(competenciaDoPeriodo('2026-03-15')).toBe('MARÇO/2026');
    expect(competenciaDoPeriodo('2026-12-31')).toBe('DEZEMBRO/2026');
    expect(competenciaDoPeriodo(new Date(2026, 0, 5))).toBe('JANEIRO/2026');
  });

  it('data ilegível não vira mês', () => {
    expect(competenciaDoPeriodo('')).toBeNull();
    expect(competenciaDoPeriodo(null)).toBeNull();
    expect(competenciaDoPeriodo('2026-13-01')).toBeNull();
  });

  it('com a opção desligada, continua saindo o intervalo de datas', () => {
    expect(textoPeriodoBoletim(false, '2026-08-01', '2026-08-30', 'agosto/2026', fmt)).toBe(
      '01/08/2026 a 30/08/2026',
    );
  });

  it('com a opção ligada, sai o mês do período — mesmo com competência digitada errada', () => {
    // caso real da Ata 001/2025: período de agosto com "Julho 2026" digitado
    expect(textoPeriodoBoletim(true, '2026-08-01', '2026-08-30', 'Julho 2026', fmt)).toBe('AGOSTO/2026');
    expect(textoPeriodoBoletim(true, '2026-06-01', '2026-06-01', 'maio/2026', fmt)).toBe('JUNHO/2026');
  });

  it('sem período legível, usa a competência digitada e depois as datas', () => {
    expect(textoPeriodoBoletim(true, null, null, 'agosto/2026', fmt)).toBe('agosto/2026');
    expect(textoPeriodoBoletim(true, null, null, '   ', fmt)).toBe('- a -');
  });
});
