import { MedicaoService } from './medicao.service';
import { StatusMedicao } from './entities/medicao.entity';

/**
 * Ação de suporte "Recalcular retratos": refaz o retrato congelado das
 * medições aprovadas do contrato e zera os PDFs (caso 051/2023 4ºAD, cuja 9ª
 * foi aprovada um dia antes da regra de cálculo mudar).
 */
describe('MedicaoService.recalcularRetratosAprovados', () => {
  const CONTRATO = 'c-051';
  let service: any;
  let updates: any[];
  let historico: any[];
  let recalculou: string[];

  beforeEach(() => {
    updates = [];
    historico = [];
    recalculou = [];
    service = Object.create(MedicaoService.prototype);
    Object.assign(service, {
      logger: { log: jest.fn(), warn: jest.fn() },
      contratoRepository: {
        findOne: async () => ({ id: CONTRATO, orgao_id: 'orgao-1', numero_contrato: '051/2023 4ºAD' }),
      },
      medicaoRepository: {
        find: async () => [
          { id: 'm3', numero_medicao: 3 },
          { id: 'm9', numero_medicao: 9 },
        ],
        update: async (where: any, set: any) => {
          updates.push({ where, set });
        },
      },
      historicoContratoRepository: {
        create: (x: any) => x,
        save: async (x: any) => {
          historico.push(x);
          return x;
        },
      },
      recalcularAcumuladosMedicoesAprovadas: async (id: string) => {
        recalculou.push(id);
      },
      getBoletimPdfPath: (id: string) => `/nao-existe/${id}.pdf`,
    });
  });

  it('recalcula as aprovadas, zera os PDFs e registra no histórico', async () => {
    const r = await service.recalcularRetratosAprovados(CONTRATO, 'orgao-1', 'SUPORTE SISTEMA');
    expect(r).toEqual({ recalculadas: 2, numeros: [3, 9] });
    expect(recalculou).toEqual([CONTRATO]);
    expect(updates[0]).toEqual({
      where: { contrato_id: CONTRATO, status: StatusMedicao.APROVADA },
      set: { boletim_pdf_url: null },
    });
    expect(historico[0].descricao).toContain('(3, 9) recalculados pelo suporte');
    expect(historico[0].usuario_nome).toBe('SUPORTE SISTEMA');
  });

  it('contrato de outro órgão é recusado', async () => {
    await expect(
      service.recalcularRetratosAprovados(CONTRATO, 'outro-orgao', 'X'),
    ).rejects.toThrow('outro órgão');
    expect(recalculou).toEqual([]);
  });

  it('sem medição aprovada não faz nada', async () => {
    service.medicaoRepository.find = async () => [];
    const r = await service.recalcularRetratosAprovados(CONTRATO, 'orgao-1', 'X');
    expect(r).toEqual({ recalculadas: 0, numeros: [] });
    expect(recalculou).toEqual([]);
    expect(historico).toEqual([]);
  });
});
