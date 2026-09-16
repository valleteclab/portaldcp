import { MedicaoService } from './medicao.service';

/**
 * Orquestração do lançamento retroativo: roda o método real sobre um `this`
 * falso, sem banco. Cobre o que a util pura não alcança — a trava de período
 * (`validarPeriodoSemMedicaoAprovada`) e a checagem de órgão/contrato.
 */
const CONTRATO = {
  id: 'contrato-ata-001-2025',
  orgao_id: 'orgao-1',
  numero_contrato: '001/2025',
};

const DTO = {
  periodo_inicio: '2026-03-01',
  periodo_fim: '2026-03-31',
  motivo: 'NF 14 liquidada e paga na contabilidade sem medição no sistema',
  valor_medido: 11280,
};

function servicoFalso(overrides: Record<string, any> = {}) {
  return {
    contratoRepository: {
      findOne: async () => CONTRATO,
    },
    validarPeriodoSemMedicaoAprovada: async () => undefined,
    usarItensCronograma: async () => false,
    ...overrides,
  } as any;
}

const registrar = (contexto: any, dto: any = DTO, orgaoId = 'orgao-1') =>
  MedicaoService.prototype.registrarMedicaoRetroativa.call(
    contexto,
    CONTRATO.id,
    dto,
    'usuario-1',
    'Suporte Portal DCP',
    orgaoId,
  );

describe('registrarMedicaoRetroativa — orquestração', () => {
  it('recusa período que colide com medição aprovada', async () => {
    const contexto = servicoFalso({
      validarPeriodoSemMedicaoAprovada: async () => {
        throw new Error(
          'Já existe uma medição aprovada para este contrato no período 01/03/2026 a 31/03/2026 (medição #6).',
        );
      },
    });
    await expect(registrar(contexto)).rejects.toThrow(/Já existe uma medição aprovada/);
  });

  it('valida o período com os itens informados no escopo', async () => {
    const chamadas: any[] = [];
    const contexto = servicoFalso({
      validarPeriodoSemMedicaoAprovada: async (...args: any[]) => {
        chamadas.push(args);
        throw new Error('parar aqui');
      },
    });
    await expect(
      registrar(contexto, {
        ...DTO,
        itens: [{ item_cronograma_id: 'item-01', quantidade_medida: 240 }],
      }),
    ).rejects.toThrow(/parar aqui/);
    expect(chamadas.length).toBe(1);
    expect(chamadas[0][0]).toBe(CONTRATO.id);
    expect(chamadas[0][1]).toBe(DTO.periodo_inicio);
    expect(chamadas[0][2]).toBe(DTO.periodo_fim);
    expect(chamadas[0][4].itemCronogramaIds).toEqual(['item-01']);
  });

  it('recusa motivo curto antes de tocar no período', async () => {
    let checouPeriodo = false;
    const contexto = servicoFalso({
      validarPeriodoSemMedicaoAprovada: async () => {
        checouPeriodo = true;
      },
    });
    await expect(
      registrar(contexto, { ...DTO, motivo: 'NF 14' }),
    ).rejects.toThrow(/mínimo 10 caracteres/);
    expect(checouPeriodo).toBe(false);
  });

  it('recusa contrato de outro órgão', async () => {
    await expect(registrar(servicoFalso(), DTO, 'outro-orgao')).rejects.toThrow(
      /não tem acesso a este contrato/,
    );
  });

  it('recusa contrato inexistente', async () => {
    const contexto = servicoFalso({
      contratoRepository: { findOne: async () => null },
    });
    await expect(registrar(contexto)).rejects.toThrow(/Contrato não encontrado/);
  });
});
