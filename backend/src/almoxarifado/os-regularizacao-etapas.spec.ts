import { RequisicaoService } from './requisicao.service';

/**
 * Contrato por ETAPAS: a OS das etapas do aditivo do 006/2026 (12, 13 e 14) saiu
 * depois de elas já terem sido medidas — 12 e 13 na 3ª medição, a 14 metade na
 * 3ª e metade na 4ª. O valor medido nessas medições volta ao saldo da OS.
 */
describe('RequisicaoService — OS que regulariza medições de etapas', () => {
  const CONTRATO = 'contrato-006-2026';
  const MED3 = 'medicao-3';
  const MED4 = 'medicao-4';

  let linhas: Record<string, any[]>;
  let service: any;

  const criarService = () => {
    const dataSource = {
      query: jest.fn(async (sql: string) => {
        if (/FROM medicoes/i.test(sql)) return linhas.medicoes;
        if (/FROM itens_medicao\b/i.test(sql)) return linhas.itens;
        return [];
      }),
    };
    const s = Object.create(RequisicaoService.prototype);
    Object.assign(s, { dataSource });
    return s;
  };

  beforeEach(() => {
    linhas = {
      medicoes: [
        { id: MED3, contrato_id: CONTRATO, status: 'APROVADA' },
        { id: MED4, contrato_id: CONTRATO, status: 'APROVADA' },
      ],
      // soma por etapa das duas medições
      itens: [
        { etapa_id: 'etapa-12', valor: '125498.31' },
        { etapa_id: 'etapa-13', valor: '8084.06' },
        { etapa_id: 'etapa-14', valor: '21375.00' },
      ],
    };
    service = criarService();
  });

  it('devolve ao saldo o que as medições mediram, por etapa', async () => {
    const consumo = await service.consumoDasMedicoesRegularizadasPorEtapa([MED3, MED4], CONTRATO);
    expect(consumo.get('etapa-12')).toBeCloseTo(125498.31, 2);
    expect(consumo.get('etapa-13')).toBeCloseTo(8084.06, 2);
    expect(consumo.get('etapa-14')).toBeCloseTo(21375, 2);
  });

  it('com a devolução, a etapa 14 (medida em duas medições) cabe inteira na OS', async () => {
    const consumo = await service.consumoDasMedicoesRegularizadasPorEtapa([MED3, MED4], CONTRATO);
    const previsto = 21375;
    const executado = 21375;
    const comprometido = 0;
    const saldo = previsto - executado - comprometido + (consumo.get('etapa-14') || 0);
    expect(21375 <= saldo + 0.01).toBe(true);
  });

  it('sem medições informadas, não mexe no saldo', async () => {
    expect((await service.consumoDasMedicoesRegularizadasPorEtapa(undefined, CONTRATO)).size).toBe(0);
    expect((await service.consumoDasMedicoesRegularizadasPorEtapa([], CONTRATO)).size).toBe(0);
  });

  it('recusa medição de outro contrato', async () => {
    linhas.medicoes[1].contrato_id = 'outro-contrato';
    await expect(
      service.consumoDasMedicoesRegularizadasPorEtapa([MED3, MED4], CONTRATO),
    ).rejects.toThrow('outro contrato');
  });

  it('recusa medição que ainda não foi aprovada', async () => {
    linhas.medicoes[1].status = 'SUBMETIDA';
    await expect(
      service.consumoDasMedicoesRegularizadasPorEtapa([MED3, MED4], CONTRATO),
    ).rejects.toThrow('APROVADA');
  });

  it('recusa medição inexistente', async () => {
    linhas.medicoes = [linhas.medicoes[0]];
    await expect(
      service.consumoDasMedicoesRegularizadasPorEtapa([MED3, MED4], CONTRATO),
    ).rejects.toThrow('não encontrada');
  });
});
