import { PatrimonioInventarioService } from './patrimonio-inventario.service';
import { StatusInventarioSetor } from './entities/enums';

/**
 * "Recomeçar a conferência desta sala": apaga tudo que foi lido e volta ao zero.
 * É destrutivo e fica na mão de quem está em campo, então o que importa testar é
 * a guarda (sala fechada, nome, sala vazia) e o rastro deixado para a comissão.
 */
describe('PatrimonioInventarioService.recomecarSetor', () => {
  const TOKEN = 'tok-licitacao';
  let service: any;
  let setor: any;
  let apagados: any[];
  let salvos: any[];

  beforeEach(() => {
    apagados = [];
    salvos = [];
    setor = {
      id: 'setor-1',
      setor_nome: 'Licitação',
      status: StatusInventarioSetor.EM_ANDAMENTO,
      iniciado_em: new Date('2026-10-04T10:00:00Z'),
      observacoes: null,
    };
    service = Object.create(PatrimonioInventarioService.prototype);
    Object.assign(service, {
      logger: { log: jest.fn(), warn: jest.fn() },
      setorPorToken: async () => setor,
      exigirAberto: (s: any) => {
        if (s.status === StatusInventarioSetor.FECHADO) throw new Error('Esta conferência já foi finalizada');
      },
      leituraRepo: {
        count: async () => 7,
        delete: async (where: any) => {
          apagados.push(where);
        },
      },
      invSetorRepo: {
        save: async (s: any) => {
          salvos.push({ ...s });
          return s;
        },
      },
    });
  });

  it('apaga as leituras, volta a sala para PENDENTE e deixa rastro', async () => {
    const r = await service.recomecarSetor(TOKEN, { nome: 'Loame Azevedo', motivo: 'varri a sala errada' });

    expect(r).toEqual({ ok: true, apagadas: 7 });
    expect(apagados).toEqual([{ inventario_setor_id: 'setor-1' }]);
    expect(setor.status).toBe(StatusInventarioSetor.PENDENTE);
    expect(setor.iniciado_em).toBeNull();
    expect(setor.observacoes).toContain('Conferência recomeçada por Loame Azevedo');
    expect(setor.observacoes).toContain('7 leitura(s) apagada(s)');
    expect(setor.observacoes).toContain('Motivo: varri a sala errada');
    expect(salvos).toHaveLength(1);
  });

  it('o motivo é opcional e o rastro continua válido', async () => {
    await service.recomecarSetor(TOKEN, { nome: 'Maria Souza' });
    expect(setor.observacoes).toContain('Conferência recomeçada por Maria Souza');
    expect(setor.observacoes).not.toContain('Motivo:');
  });

  it('não apaga o registro anterior: as observações acumulam', async () => {
    setor.observacoes = 'Bem 1234 emprestado ao gabinete.';
    await service.recomecarSetor(TOKEN, { nome: 'Loame Azevedo' });
    expect(setor.observacoes).toContain('Bem 1234 emprestado ao gabinete.');
    expect(setor.observacoes).toContain('Conferência recomeçada');
  });

  it('exige o nome de quem recomeçou — e não apaga nada sem ele', async () => {
    await expect(service.recomecarSetor(TOKEN, { nome: 'ab' })).rejects.toThrow('Informe o nome');
    await expect(service.recomecarSetor(TOKEN, {})).rejects.toThrow('Informe o nome');
    expect(apagados).toEqual([]);
    expect(setor.status).toBe(StatusInventarioSetor.EM_ANDAMENTO);
  });

  it('sala sem leitura nenhuma: avisa em vez de fingir que fez algo', async () => {
    service.leituraRepo.count = async () => 0;
    await expect(service.recomecarSetor(TOKEN, { nome: 'Loame Azevedo' })).rejects.toThrow('nenhuma leitura');
    expect(apagados).toEqual([]);
  });

  it('sala já finalizada não pode ser apagada por quem está em campo', async () => {
    setor.status = StatusInventarioSetor.FECHADO;
    await expect(service.recomecarSetor(TOKEN, { nome: 'Loame Azevedo' })).rejects.toThrow('finalizada');
    expect(apagados).toEqual([]);
  });
});
