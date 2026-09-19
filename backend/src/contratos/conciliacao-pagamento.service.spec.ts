import { ConciliacaoPagamentoService } from './conciliacao-pagamento.service';
import { Contrato } from './entities/contrato.entity';
import { Medicao, StatusMedicao } from './entities/medicao.entity';
import { ConciliacaoPagamento } from './entities/conciliacao-pagamento.entity';
import { UserType } from '../auth/auth.service';
import { chavePagamento } from './conciliacao-pagamento.util';
import type { EmpenhoFator } from './fator-transparencia.service';
import { Usuario } from '../usuarios/entities/usuario.entity';

describe('Conciliação financeira sem consumo de saldo', () => {
  const user = { type: UserType.USUARIO, sub: 'usuario', orgaoId: 'orgao' };
  let service: ConciliacaoPagamentoService;
  let pagamentos: EmpenhoFator[];
  let vinculos: ConciliacaoPagamento[];
  let medicoes: Medicao[];
  let manager: any;
  let fator: any;
  const pagamento = {
    cnpj: '12345',
    numero_empenho: '31/2026',
    numero_liquidacao: '1',
    data: '10/09/2026',
    valor: 100,
    fase_tipo: 'PAGAMENTO',
    fase: 'PAGAMENTO',
    confirmacao: 'CONTRATO',
  } as EmpenhoFator;
  beforeEach(() => {
    pagamentos = [{ ...pagamento }];
    vinculos = [];
    medicoes = [
      {
        id: 'medicao',
        contrato_id: 'contrato',
        numero_medicao: 1,
        valor_medido: 100,
        status: StatusMedicao.APROVADA,
      } as Medicao,
    ];
    const contrato = {
      id: 'contrato',
      orgao_id: 'orgao',
      fornecedor_cnpj: '12345',
      numero_contrato: '1/2026',
      ano: 2026,
    };
    manager = {
      query: jest.fn(async () => []),
      findOneOrFail: jest.fn(async () => contrato),
      findOne: jest.fn(async (_entity, options) =>
        medicoes.find(
          (m) =>
            m.id === options.where.id &&
            m.contrato_id === options.where.contrato_id,
        ),
      ),
      find: jest.fn(async () => vinculos),
      findOneBy: jest.fn(async (_entity, where) =>
        vinculos.find(
          (v) => v.id === where.id && v.contrato_id === where.contrato_id,
        ),
      ),
      create: jest.fn((_entity, data) => ({
        id: 'vinculo',
        criado_em: new Date(),
        ...data,
      })),
      save: jest.fn(async (entity, data) => {
        if (data) {
          vinculos.push(data);
          return data;
        }
        return entity;
      }),
    };
    const db = {
      getRepository: (entity: unknown) =>
        entity === Contrato
          ? { findOneBy: async () => contrato }
          : entity === Usuario
            ? { findOne: async () => ({ id: 'usuario', nome: 'Maria Fiscal' }) }
            : { find: async () => (entity === Medicao ? medicoes : vinculos) },
      transaction: async (fn: any) => fn(manager),
    };
    fator = { buscarEmpenhos: jest.fn(async () => pagamentos) };
    service = new ConciliacaoPagamentoService(db as any, fator);
  });
  const dto = (valor = 100) => ({
    pagamento_chave: chavePagamento(pagamento),
    medicao_id: 'medicao',
    valor,
    justificativa: 'NF conferida com o documento contábil',
  });

  it('nega fornecedor e usuário de outro órgão antes de consultar contabilidade', async () => {
    await expect(
      service.listar('contrato', { ...user, type: UserType.FORNECEDOR }),
    ).rejects.toThrow();
    await expect(
      service.listar('contrato', { ...user, orgaoId: 'outro' }),
    ).rejects.toThrow();
    expect(fator.buscarEmpenhos).not.toHaveBeenCalled();
  });
  it('persiste somente vínculo e adquire locks de contrato e medição', async () => {
    await service.vincular('contrato', user, dto());
    expect(manager.findOneOrFail).toHaveBeenCalledWith(
      Contrato,
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(manager.findOne).toHaveBeenCalledWith(
      Medicao,
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      ConciliacaoPagamento,
      expect.objectContaining({
        usuario_id: 'usuario',
        usuario_nome: 'Maria Fiscal',
        valor: 100,
      }),
    );
    await expect(service.vincular('contrato', user, dto())).rejects.toThrow(
      'disponível',
    );
    expect((await service.listar('contrato', user)).medicoes[0].situacao).toBe(
      'INTEGRAL',
    );
  });
  it('rejeita medição de outro contrato e medição não aprovada', async () => {
    medicoes[0].contrato_id = 'outro';
    await expect(service.vincular('contrato', user, dto())).rejects.toThrow(
      'aprovada',
    );
    medicoes[0].contrato_id = 'contrato';
    medicoes[0].status = StatusMedicao.SUBMETIDA;
    await expect(service.vincular('contrato', user, dto())).rejects.toThrow(
      'aprovada',
    );
  });
  it('rejeita pagamento não confirmado, credor diferente ou identidade duplicada', async () => {
    pagamentos[0].confirmacao = 'NAO_CONFIRMADO';
    await expect(service.vincular('contrato', user, dto())).rejects.toThrow(
      'Pagamento',
    );
    pagamentos = [{ ...pagamento, cnpj: 'outro' }];
    await expect(service.vincular('contrato', user, dto())).rejects.toThrow(
      'Pagamento',
    );
    pagamentos = [{ ...pagamento }, { ...pagamento }];
    await expect(service.vincular('contrato', user, dto())).rejects.toThrow(
      'Pagamento',
    );
  });
  it('consulta indisponível não se torna lista vazia', async () => {
    fator.buscarEmpenhos.mockRejectedValue(new Error('Fonte indisponível'));
    await expect(service.listar('contrato', user)).rejects.toThrow(
      'Fonte indisponível',
    );
    await expect(service.vincular('contrato', user, dto())).rejects.toThrow(
      'Fonte indisponível',
    );
    expect(manager.save).not.toHaveBeenCalled();
  });
  it('impede reutilizar em outro contrato e bloqueia pela identidade contábil', async () => {
    vinculos.push({ contrato_id: 'outro', orgao_id: 'orgao', pagamento_chave: chavePagamento(pagamento), valor: 20 } as ConciliacaoPagamento);
    await expect(service.vincular('contrato', user, dto())).rejects.toThrow('outro contrato');
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), [`orgao:${chavePagamento(pagamento)}`]);
    expect(manager.save).not.toHaveBeenCalled();
  });
  it('pagamento desaparecido mantém trilha e marca revisão', async () => {
    await service.vincular('contrato', user, dto());
    pagamentos = [];
    const resultado = await service.listar('contrato', user);
    expect(resultado.vinculos[0].revisar).toBe(true);
    expect(resultado.medicoes[0].situacao).toBe('REVISAR');
  });
  it('estorno pendente marca revisão; sua conciliação reduz o valor financeiro', async () => {
    await service.vincular('contrato', user, dto());
    const estorno = { ...pagamento, numero_liquidacao: '2', valor: -40 };
    pagamentos.push(estorno);
    expect((await service.listar('contrato', user)).medicoes[0].situacao).toBe(
      'REVISAR',
    );
    await service.vincular('contrato', user, {
      ...dto(-40),
      pagamento_chave: chavePagamento(estorno),
    });
    expect((await service.listar('contrato', user)).medicoes[0]).toMatchObject({
      conciliado: 60,
      pendente: 40,
      situacao: 'PARCIAL',
    });
  });
  it('cancelamento preserva justificativa e libera o valor para corrigir o vínculo', async () => {
    await service.vincular('contrato', user, dto());
    await service.cancelar(
      'contrato',
      'vinculo',
      user,
      'Documento associado à medição errada',
    );
    expect(vinculos[0]).toMatchObject({
      cancelado_por: 'usuario',
      motivo_cancelamento: 'Documento associado à medição errada',
    });
    expect(
      (await service.listar('contrato', user)).pagamentos[0].disponivel,
    ).toBe(100);
  });

  it('ata sem nº de liquidação pode ser conciliada (caso 001/2025 APS)', async () => {
    pagamentos = [{ ...pagamento, numero_liquidacao: '', confirmacao: 'HISTORICO' }];
    const lista = await service.listar('contrato', user);
    expect(lista.pagamentos[0].elegivel).toBe(true);
    await service.vincular('contrato', user, {
      ...dto(),
      pagamento_chave: chavePagamento(pagamentos[0]),
    });
    expect(manager.save).toHaveBeenCalled();
  });
  it('sem nº de liquidação, dois pagamentos iguais continuam ambíguos', async () => {
    pagamentos = [
      { ...pagamento, numero_liquidacao: '' },
      { ...pagamento, numero_liquidacao: '' },
    ];
    const lista = await service.listar('contrato', user);
    expect(lista.pagamentos.every((p) => !p.elegivel)).toBe(true);
  });
  it('pessoa física: documento vazio no portal é aceito (caso 014/2026)', async () => {
    pagamentos = [{ ...pagamento, cnpj: '' }];
    expect((await service.listar('contrato', user)).pagamentos[0].elegivel).toBe(true);
  });
});
