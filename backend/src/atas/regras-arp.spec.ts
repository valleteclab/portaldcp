import {
  ataVencida,
  fimVigencia,
  hojeBrasilia,
  mesesVigenciaAta,
  motivoCancelamentoInvalido,
  motivoConsumoInvalido,
  motivoLimiteAdesao,
  motivoProrrogacaoInvalida,
  ordenarCandidatosReserva,
  prazoContratacaoAdesao,
  proximoDaReserva,
  saldoItem,
  somarMeses,
  totaisDaAta,
} from './regras-arp';

describe('regras da ARP (Lei 14.133/2021 arts. 82–86)', () => {
  describe('vigência (art. 84)', () => {
    it('padrão 12 meses; máximo 12; valor inválido → 12', () => {
      expect(mesesVigenciaAta(null)).toBe(12);
      expect(mesesVigenciaAta(0)).toBe(12);
      expect(mesesVigenciaAta(6)).toBe(6);
      expect(mesesVigenciaAta(24)).toBe(12);
    });

    it('fim = início + meses − 1 dia; fim de mês curto', () => {
      expect(fimVigencia('2026-03-10', 12)).toBe('2027-03-09');
      expect(fimVigencia('2026-01-01', 12)).toBe('2026-12-31');
      expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
      expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29');
    });

    it('vencida só DEPOIS do último dia (Brasília)', () => {
      expect(ataVencida('2026-09-24', '2026-09-24')).toBe(false);
      expect(ataVencida('2026-09-24', '2026-09-25')).toBe(true);
      expect(ataVencida(null, '2026-09-25')).toBe(false);
      // 25/09 01:00 UTC = 24/09 22:00 em Brasília
      expect(hojeBrasilia(new Date('2026-09-25T01:00:00Z'))).toBe('2026-09-24');
    });

    it('prorrogação: uma vez, 1..12 meses, com motivo, antes do fim, só vigente', () => {
      const base = { status: 'VIGENTE', prorrogada: false, dataVigenciaFim: '2027-01-10', meses: 12, motivo: 'Pesquisa de preços mostra que o registrado segue vantajoso', hoje: '2026-12-01' };
      expect(motivoProrrogacaoInvalida(base)).toBeNull();
      expect(motivoProrrogacaoInvalida({ ...base, prorrogada: true })).toMatch(/única vez/);
      expect(motivoProrrogacaoInvalida({ ...base, meses: 13 })).toMatch(/1 a 12/);
      expect(motivoProrrogacaoInvalida({ ...base, meses: 0 })).toMatch(/1 a 12/);
      expect(motivoProrrogacaoInvalida({ ...base, motivo: 'curto' })).toMatch(/motivo/);
      expect(motivoProrrogacaoInvalida({ ...base, hoje: '2027-01-11' })).toMatch(/já terminou/);
      expect(motivoProrrogacaoInvalida({ ...base, status: 'VENCIDA' })).toMatch(/vigente/);
      expect(motivoProrrogacaoInvalida({ ...base, status: 'ESGOTADA' })).toBeNull();
    });
  });

  describe('saldo', () => {
    it('saldo = registrado − consumido (nunca negativo)', () => {
      expect(saldoItem(100, 30)).toBe(70);
      expect(saldoItem(100, 100)).toBe(0);
      expect(saldoItem(100, 120)).toBe(0);
      expect(saldoItem(10.5, 0.25)).toBe(10.25);
    });

    it('consumo recusa quantidade além do saldo e não positiva', () => {
      expect(motivoConsumoInvalido({ quantidade: 70, saldo: 70, rotulo: 'Item 1' })).toBeNull();
      expect(motivoConsumoInvalido({ quantidade: 70.0001, saldo: 70, rotulo: 'Item 1' })).toMatch(/maior que o saldo/);
      expect(motivoConsumoInvalido({ quantidade: 0, saldo: 70, rotulo: 'Item 1' })).toMatch(/maior que zero/);
    });

    it('totais NÃO zeram o utilizado ao recalcular (B10)', () => {
      const t = totaisDaAta([
        { quantidade_registrada: 100, quantidade_utilizada: 40, valor_unitario: 10 },
        { quantidade_registrada: 10, quantidade_utilizada: 0, valor_unitario: 5.5 },
        { quantidade_registrada: 99, quantidade_utilizada: 99, valor_unitario: 1, ativo: false },
      ]);
      expect(t).toEqual({ valorTotal: 1055, valorUtilizado: 400, valorSaldo: 655 });
    });
  });

  describe('adesão (art. 86 §§4º e 5º)', () => {
    const base = { rotulo: 'Item 1', quantidadeRegistrada: 100, jaDoOrgao: 0, jaTotal: 0 };

    it('até 50% por órgão aderente', () => {
      expect(motivoLimiteAdesao({ ...base, solicitada: 50 })).toBeNull();
      expect(motivoLimiteAdesao({ ...base, solicitada: 51 })).toMatch(/50%.*§4º/);
      // o mesmo órgão já pediu 30: mais 21 passa de 50
      expect(motivoLimiteAdesao({ ...base, solicitada: 21, jaDoOrgao: 30, jaTotal: 30 })).toMatch(/50%/);
      expect(motivoLimiteAdesao({ ...base, solicitada: 20, jaDoOrgao: 30, jaTotal: 30 })).toBeNull();
    });

    it('total das adesões ≤ 2× (dobro) do registrado', () => {
      expect(motivoLimiteAdesao({ ...base, solicitada: 50, jaTotal: 150 })).toBeNull();
      expect(motivoLimiteAdesao({ ...base, solicitada: 50, jaTotal: 151 })).toMatch(/dobro.*§5º/);
      expect(motivoLimiteAdesao({ ...base, solicitada: 1, jaTotal: 200 })).toMatch(/dobro/);
    });

    it('quantidade deve ser positiva', () => {
      expect(motivoLimiteAdesao({ ...base, solicitada: 0 })).toMatch(/maior que zero/);
    });

    it('prazo de contratação: 90 dias da autorização, limitado ao fim da vigência', () => {
      expect(prazoContratacaoAdesao('2026-01-01', '2026-12-31')).toBe('2026-04-01');
      expect(prazoContratacaoAdesao('2026-12-01', '2026-12-31')).toBe('2026-12-31');
    });
  });

  describe('cadastro de reserva (art. 82 VII; Dec. 11.462 art. 18)', () => {
    it('ordem do ranking; vencedor e excluídos fora; ordem começa em 2', () => {
      const r = ordenarCandidatosReserva([
        { fornecedorId: 'V', posicao: 1, valor: 90, situacao: 'VENCEDOR' },
        { fornecedorId: 'C', posicao: 3, valor: 99, situacao: 'CLASSIFICADO' },
        { fornecedorId: 'B', posicao: 2, valor: 95, situacao: 'CLASSIFICADO' },
        { fornecedorId: 'X', posicao: 4, valor: 80, situacao: 'DESCLASSIFICADO' },
        { fornecedorId: 'I', posicao: 5, valor: 81, situacao: 'INABILITADO' },
        { fornecedorId: 'S', posicao: null, valor: 97, situacao: 'CLASSIFICADO' },
      ]);
      expect(r.map((c) => [c.fornecedorId, c.ordem])).toEqual([
        ['B', 2],
        ['C', 3],
        ['S', 4],
      ]);
    });

    it('sem posição: pelo valor na direção do critério', () => {
      const cand = [
        { fornecedorId: 'A', posicao: null, valor: 10, situacao: 'CLASSIFICADO' },
        { fornecedorId: 'B', posicao: null, valor: 20, situacao: 'CLASSIFICADO' },
      ];
      expect(ordenarCandidatosReserva(cand, 'ASC').map((c) => c.fornecedorId)).toEqual(['A', 'B']);
      expect(ordenarCandidatosReserva(cand, 'DESC').map((c) => c.fornecedorId)).toEqual(['B', 'A']);
    });

    it('próximo = menor posição que ADERIU (pendentes, recusas e já convocados não)', () => {
      const p = proximoDaReserva([
        { posicao: 2, status: 'RECUSOU' },
        { posicao: 4, status: 'ADERIU' },
        { posicao: 3, status: 'ADERIU' },
        { posicao: 5, status: 'PENDENTE' },
      ]);
      expect(p).toEqual({ posicao: 3, status: 'ADERIU' });
      expect(proximoDaReserva([{ posicao: 2, status: 'CONVOCADO' }])).toBeNull();
    });
  });

  describe('cancelamento do registro (Dec. 11.462 arts. 28–29)', () => {
    it('hipótese válida + motivo; ata ativa', () => {
      expect(motivoCancelamentoInvalido({ status: 'VIGENTE', hipotese: 'DESCUMPRIMENTO', motivo: 'Não entregou a OF 12 no prazo' })).toBeNull();
      expect(motivoCancelamentoInvalido({ status: 'VIGENTE', hipotese: 'OUTRA', motivo: 'xxxxxxxxxxxx' })).toMatch(/hipótese/);
      expect(motivoCancelamentoInvalido({ status: 'VIGENTE', hipotese: 'DESCUMPRIMENTO', motivo: 'curto' })).toMatch(/motivo/);
      expect(motivoCancelamentoInvalido({ status: 'VENCIDA', hipotese: 'DESCUMPRIMENTO', motivo: 'Não entregou a OF 12' })).toMatch(/VENCIDA/);
    });
  });
});
