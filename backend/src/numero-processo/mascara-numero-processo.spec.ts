import {
  MASCARA_PADRAO_NUMERO_PROCESSO,
  anoBrasilia,
  formatarNumeroProcesso,
  mascaraEfetiva,
  motivoMascaraInvalida,
  normalizarNumeroDigitado,
  sequencialDoNumero,
} from './mascara-numero-processo';

describe('máscara do nº do processo administrativo', () => {
  describe('formatarNumeroProcesso', () => {
    it('padrão = o formato que o servidor já usava (AAAA/NNNNN)', () => {
      expect(MASCARA_PADRAO_NUMERO_PROCESSO).toBe('{ano}/{seq:5}');
      expect(formatarNumeroProcesso(null, 2026, 33)).toBe('2026/00033');
      expect(formatarNumeroProcesso('', 2026, 1)).toBe('2026/00001');
      expect(formatarNumeroProcesso('   ', 2026, 123456)).toBe('2026/123456');
    });

    it('zeros à esquerda pelo {seq:N}; {seq} sem zeros', () => {
      expect(formatarNumeroProcesso('PA {seq:3}/{ano}', 2026, 7)).toBe('PA 007/2026');
      expect(formatarNumeroProcesso('{seq}/{ano}', 2026, 7)).toBe('7/2026');
      expect(formatarNumeroProcesso('{seq:1}-{ano}', 2026, 42)).toBe('42-2026');
      expect(formatarNumeroProcesso('{seq:10}/{ano}', 2026, 5)).toBe('0000000005/2026');
    });

    it('ano com 2 dígitos ({aa}) e texto fixo', () => {
      expect(formatarNumeroProcesso('Proc. {seq:4}.{aa}', 2026, 12)).toBe('Proc. 0012.26');
      expect(formatarNumeroProcesso('{aa}-{seq:2}', 2105, 3)).toBe('05-03');
    });

    it('marcadores sem diferenciar maiúsculas', () => {
      expect(formatarNumeroProcesso('{ANO}/{Seq:3}', 2026, 9)).toBe('2026/009');
    });

    it('máscara inválida → erro', () => {
      expect(() => formatarNumeroProcesso('{ano}', 2026, 1)).toThrow(/sequencial/);
    });
  });

  describe('motivoMascaraInvalida', () => {
    it('válidas', () => {
      for (const m of [null, '', '{ano}/{seq:5}', 'PA {seq:3}/{ano}', '{seq}/{aa}', 'CMP-{ano}-{seq:4}']) {
        expect(motivoMascaraInvalida(m)).toBeNull();
      }
    });
    it('sem sequencial, com dois sequenciais, sem ano', () => {
      expect(motivoMascaraInvalida('PA/{ano}')).toMatch(/exatamente um sequencial/);
      expect(motivoMascaraInvalida('{seq}/{seq:3}/{ano}')).toMatch(/exatamente um sequencial/);
      expect(motivoMascaraInvalida('PA {seq:5}')).toMatch(/ano/);
    });
    it('marcador desconhecido, N fora de 1..10, chave solta, controle, tamanho', () => {
      expect(motivoMascaraInvalida('{mes}/{seq}/{ano}')).toMatch(/desconhecido/);
      expect(motivoMascaraInvalida('{seq:0}/{ano}')).toMatch(/1 a 10/);
      expect(motivoMascaraInvalida('{seq:11}/{ano}')).toMatch(/1 a 10/);
      expect(motivoMascaraInvalida('{ano:4}/{seq}')).toMatch(/desconhecido/);
      expect(motivoMascaraInvalida('{seq}/{ano')).toMatch(/solta/);
      expect(motivoMascaraInvalida('{seq}\n{ano}')).toMatch(/controle/);
      expect(motivoMascaraInvalida(`${'x'.repeat(40)}{seq}{ano}`)).toMatch(/máximo/);
    });
    it('sequencial colado ao ano é ambíguo', () => {
      expect(motivoMascaraInvalida('{ano}{seq:5}')).toMatch(/Separe/);
      expect(motivoMascaraInvalida('{seq}{aa}')).toMatch(/Separe/);
    });
  });

  describe('sequencialDoNumero (início da sequência a partir dos dados)', () => {
    it('lê o sequencial no formato e ano da máscara', () => {
      expect(sequencialDoNumero(null, 2026, '2026/00033')).toBe(33);
      expect(sequencialDoNumero('PA {seq:3}/{ano}', 2026, 'PA 120/2026')).toBe(120);
      expect(sequencialDoNumero('Proc. {seq}.{aa}', 2026, 'Proc. 9.26')).toBe(9);
    });
    it('outro ano, outro formato e o número aleatório antigo do assistente ficam de fora', () => {
      expect(sequencialDoNumero(null, 2026, '2025/00099')).toBeNull();
      expect(sequencialDoNumero(null, 2026, '202609.91299')).toBeNull();
      expect(sequencialDoNumero(null, 2026, 'E2E-abc')).toBeNull();
      expect(sequencialDoNumero(null, 2026, 'CRED-001/2026-ab12')).toBeNull();
      expect(sequencialDoNumero(null, 2026, '2026/00000')).toBeNull();
      expect(sequencialDoNumero(null, 2026, null)).toBeNull();
    });
    it('texto fixo com caracteres especiais de regex é literal', () => {
      expect(sequencialDoNumero('P.{seq}/{ano}', 2026, 'P.5/2026')).toBe(5);
      expect(sequencialDoNumero('P.{seq}/{ano}', 2026, 'PX5/2026')).toBeNull();
      expect(sequencialDoNumero('(PA) {seq}+{ano}', 2026, '(PA) 8+2026')).toBe(8);
    });
    it('ida e volta: formatar → ler', () => {
      for (const m of ['{ano}/{seq:5}', 'PA {seq:3}/{ano}', '{seq}-{aa}', 'X[{seq}]{ano}']) {
        for (const n of [1, 9, 10, 999, 12345]) expect(sequencialDoNumero(m, 2026, formatarNumeroProcesso(m, 2026, n))).toBe(n);
      }
    });
  });

  describe('normalizarNumeroDigitado', () => {
    it('vazio → null (o sistema gera)', () => {
      expect(normalizarNumeroDigitado(undefined)).toBeNull();
      expect(normalizarNumeroDigitado(null)).toBeNull();
      expect(normalizarNumeroDigitado('   ')).toBeNull();
    });
    it('apara e junta espaços', () => {
      expect(normalizarNumeroDigitado('  PA   139/2025 ')).toBe('PA 139/2025');
    });
    it('longo demais → erro', () => {
      expect(() => normalizarNumeroDigitado('9'.repeat(61))).toThrow(/60/);
    });
  });

  it('mascaraEfetiva e ano de Brasília na virada do ano', () => {
    expect(mascaraEfetiva(undefined)).toBe('{ano}/{seq:5}');
    expect(mascaraEfetiva(' PA {seq}/{ano} ')).toBe('PA {seq}/{ano}');
    // 01/01/2027 01:00 UTC = 31/12/2026 22:00 em Brasília
    expect(anoBrasilia(new Date('2027-01-01T01:00:00Z'))).toBe(2026);
    expect(anoBrasilia(new Date('2027-01-01T03:00:00Z'))).toBe(2027);
  });
});
