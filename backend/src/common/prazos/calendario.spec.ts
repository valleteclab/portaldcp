import {
  CALENDARIO_NACIONAL,
  FeriadoMovel,
  calendarioDoOrgao,
  criarCalendario,
  dataDoFeriadoMovel,
  definirFonteDeFeriados,
  domingoDePascoa,
  isoDoDia,
} from './calendario';
import {
  diasUteisEntre,
  ehDiaUtil,
  fimDoPrazoEmDiasUteis,
  inicioDoDiaSeguinte,
  limiteDiasUteisAntes,
  prorrogarParaDiaUtil,
} from './dias-uteis';

const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** Instante em Brasília (UTC-3) → Date. */
const bsb = (iso: string, hora = '10:00') => new Date(`${iso}T${hora}:00-03:00`);
const iso = (d: Date) => d.toISOString();

describe('calendário de feriados (E7a)', () => {
  afterEach(() => definirFonteDeFeriados(null));

  describe('Páscoa e feriados móveis', () => {
    it.each([
      [2024, '2024-03-31'],
      [2025, '2025-04-20'],
      [2026, '2026-04-05'],
      [2027, '2027-03-28'],
      [2030, '2030-04-21'],
    ])('domingo de Páscoa de %i = %s', (ano, esperado) => {
      expect(isoDoDia(domingoDePascoa(ano))).toBe(esperado);
    });

    it('2026: Carnaval 16–17/02, Cinzas 18/02, Paixão 03/04, Corpus Christi 04/06', () => {
      expect(isoDoDia(dataDoFeriadoMovel(FeriadoMovel.CARNAVAL_SEGUNDA, 2026))).toBe('2026-02-16');
      expect(isoDoDia(dataDoFeriadoMovel(FeriadoMovel.CARNAVAL_TERCA, 2026))).toBe('2026-02-17');
      expect(isoDoDia(dataDoFeriadoMovel(FeriadoMovel.QUARTA_CINZAS, 2026))).toBe('2026-02-18');
      expect(isoDoDia(dataDoFeriadoMovel(FeriadoMovel.SEXTA_SANTA, 2026))).toBe('2026-04-03');
      expect(isoDoDia(dataDoFeriadoMovel(FeriadoMovel.CORPUS_CHRISTI, 2026))).toBe('2026-06-04');
    });
  });

  describe('calendário nacional (sem fonte registrada)', () => {
    it('feriados nacionais fixos e a Paixão de Cristo não são dias úteis', () => {
      for (const d of ['2026-01-01', '2026-04-21', '2026-05-01', '2026-09-07', '2026-10-12', '2026-11-02', '2026-11-20', '2026-12-25', '2026-04-03']) {
        expect(ehDiaUtil(dia(d))).toBe(false);
      }
    });

    it('pontos facultativos (Carnaval, Corpus Christi, Dia do Servidor) CONTAM como dia útil sem adoção do órgão', () => {
      for (const d of ['2026-02-16', '2026-02-17', '2026-06-04', '2026-10-28']) expect(ehDiaUtil(dia(d))).toBe(true);
    });

    it('fim de semana nunca é dia útil', () => {
      expect(ehDiaUtil(dia('2026-09-26'))).toBe(false);
      expect(ehDiaUtil(dia('2026-09-27'))).toBe(false);
      expect(ehDiaUtil(dia('2026-09-28'))).toBe(true);
    });
  });

  describe('art. 183 — contagem com feriados', () => {
    it('exclui o dia do começo; feriado no caminho não conta (sex 09/10/2026 + 3 → 12/10 feriado → qui 15/10)', () => {
      const fim = fimDoPrazoEmDiasUteis(bsb('2026-10-09'), 3);
      expect(iso(fim)).toBe(iso(new Date('2026-10-15T23:59:59.999-03:00')));
    });

    it('limite N dias úteis ANTES da referência pula o feriado (abertura ter 13/10 → 3 antes: sex 09, qui 08, qua 07)', () => {
      const lim = limiteDiasUteisAntes(bsb('2026-10-13'), 3);
      expect(iso(lim)).toBe(iso(new Date('2026-10-07T23:59:59.999-03:00')));
    });

    it('§2º: vencimento em dia sem expediente prorroga para o primeiro dia útil seguinte (mesmo horário)', () => {
      expect(iso(prorrogarParaDiaUtil(bsb('2026-10-10', '18:00')))).toBe(iso(bsb('2026-10-13', '18:00'))); // sáb → (seg feriado) → ter
      expect(iso(prorrogarParaDiaUtil(bsb('2026-10-14', '18:00')))).toBe(iso(bsb('2026-10-14', '18:00'))); // dia útil: igual
    });

    it('calendário do órgão: feriado municipal e ponto facultativo adotado deslocam o prazo', () => {
      const cal = criarCalendario([
        { descricao: 'Aniversário da cidade', data: '2000-09-29', recorrente: true },
        { descricao: 'Carnaval', movel: FeriadoMovel.CARNAVAL_SEGUNDA },
      ]);
      // sex 25/09/2026 + 3 dias úteis: seg 28 (1), ter 29 feriado municipal, qua 30 (2), qui 01/10 (3)
      expect(iso(fimDoPrazoEmDiasUteis(bsb('2026-09-25'), 3, cal))).toBe(iso(new Date('2026-10-01T23:59:59.999-03:00')));
      expect(ehDiaUtil(dia('2026-02-16'), cal)).toBe(false);
      // o calendário do órgão não tem os nacionais por si — quem monta a lista é o FeriadosService
      expect(ehDiaUtil(dia('2026-09-29'), CALENDARIO_NACIONAL)).toBe(true);
    });

    it('fonte registrada: cada órgão tem o seu calendário (cache por órgão)', () => {
      definirFonteDeFeriados({
        regrasDoOrgao: (orgaoId) =>
          orgaoId === 'A' ? [{ descricao: 'Padroeira', data: '2026-09-29' }] : [{ descricao: 'Natal', data: '2000-12-25', recorrente: true }],
      });
      expect(ehDiaUtil(dia('2026-09-29'), calendarioDoOrgao('A'))).toBe(false);
      expect(ehDiaUtil(dia('2026-09-29'), calendarioDoOrgao('B'))).toBe(true);
    });

    it('utilitários: dia seguinte (00:00 Brasília) e dias úteis entre datas', () => {
      expect(iso(inicioDoDiaSeguinte(bsb('2026-10-07', '23:00')))).toBe(iso(new Date('2026-10-08T00:00:00-03:00')));
      expect(diasUteisEntre(bsb('2026-10-09'), bsb('2026-10-16'))).toBe(4); // 13, 14, 15, 16 (12 é feriado)
    });
  });
});
