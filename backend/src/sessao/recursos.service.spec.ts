import { randomUUID } from 'crypto';
import { FindOperator } from 'typeorm';
import { RecursosService } from './recursos.service';
import { AtoRecorrido, RecursoAdministrativo, StatusRecurso } from './entities/recurso-administrativo.entity';
import { JanelaIntencaoRecurso } from './entities/janela-intencao-recurso.entity';
import { ContrarrazaoRecurso } from './entities/contrarrazao-recurso.entity';
import { SessaoDisputa, EtapaSessao } from './entities/sessao-disputa.entity';
import { EventoSessao } from './entities/evento-sessao.entity';
import { prazoAutoridade, prazoContrarrazoes, prazoRazoes } from './regras-recursos';

/**
 * RecursosService (plano E5) contra um banco em memória: janela de intenção
 * (preclusão), admissibilidade, razões só do recorrente, contrarrazões dos
 * demais com prazo do fim das razões, reconsideração/autoridade com
 * segregação e conclusão da fase pela máquina de estados. O EFEITO nas
 * situações dos licitantes é exercitado no e2e (test/recursos.e2e-spec.ts).
 */
const ORGAO = { tipo: 'ORGAO' as const, id: 'org1', nome: 'Prefeitura' };
const MIN = 60_000;

function build(opts: { fase?: string; situacao?: string; paramMinutos?: number } = {}) {
  const tabelas = new Map<any, any[]>([
    [RecursoAdministrativo, []],
    [JanelaIntencaoRecurso, []],
    [ContrarrazaoRecurso, []],
    [EventoSessao, []],
    [SessaoDisputa, [{ id: 's1', licitacao_id: 'l1', etapa: EtapaSessao.INTENCAO_RECURSO }]],
  ]);
  const licitacao: any = { id: 'l1', orgao_id: 'org1', situacao: opts.situacao ?? 'ATIVA', fase: opts.fase ?? 'HABILITACAO' };
  const licitantes = new Set(['A', 'B', 'C']);
  const usuarios: Record<string, { nome: string; role: string }> = {
    u1: { nome: 'Pregoeira', role: 'PREGOEIRO' },
    u2: { nome: 'Secretária', role: 'ADMIN' },
  };
  const situacoes: any[] = [{ unidade_id: 'i1', fornecedor_id: 'A', situacao: 'INABILITADO' }];
  let seq = 0;

  const casa = (row: any, where: any) =>
    Object.entries(where ?? {}).every(([k, v]) => (v instanceof FindOperator ? (v.value as any[]).includes(row[k]) : row[k] === v));
  const filtrar = (entidade: any, where: any) => {
    const lista = tabelas.get(entidade) ?? [];
    const ws = Array.isArray(where) ? where : [where];
    return lista.filter((r) => ws.some((w) => casa(r, w)));
  };
  const m: any = {
    findOne: jest.fn(async (a: any, b?: any) => {
      if (typeof a !== 'function') return licitacao; // repositório da licitação (exigirLicitacaoAtiva)
      return filtrar(a, b?.where)[0] ?? null;
    }),
    find: jest.fn(async (entidade: any, o?: any) => {
      const r = filtrar(entidade, o?.where);
      const [campo, dir] = Object.entries(o?.order ?? {})[0] ?? [];
      return campo ? [...r].sort((x, y) => (new Date(x[campo]).getTime() - new Date(y[campo]).getTime()) * (dir === 'DESC' ? -1 : 1)) : r;
    }),
    count: jest.fn(async (entidade: any, o?: any) => filtrar(entidade, o?.where).length),
    create: jest.fn((entidade: any, d: any) => Object.assign(new entidade(), d)),
    save: jest.fn(async (row: any) => {
      const lista = tabelas.get(row.constructor)!;
      if (!row.id) row.id = randomUUID();
      seq++;
      if (!row.created_at) row.created_at = new Date(Date.now() + seq);
      if (!lista.includes(row)) lista.push(row);
      return row;
    }),
    query: jest.fn(async (sql: string, p: any[] = []) => {
      if (/FROM licitacoes/.test(sql)) return [licitacao];
      if (/pg_advisory_xact_lock|UPDATE sessoes_disputa/.test(sql)) return [];
      if (/FROM propostas/.test(sql)) return licitantes.has(p[1]) ? [{}] : [];
      if (/FROM fornecedores/.test(sql)) return (p[0] as string[]).map((id) => ({ id, razao_social: `Empresa ${id}` }));
      if (/FROM usuarios/.test(sql)) return usuarios[p[0]] ? [usuarios[p[0]]] : [];
      if (/FROM orgaos/.test(sql)) return [{ nome: 'Prefeitura' }];
      if (/FROM licitantes_unidade/.test(sql)) return situacoes;
      if (/UPDATE recursos_administrativos|UPDATE janelas/.test(sql)) return [];
      throw new Error(`SQL inesperado no teste: ${sql}`);
    }),
  };
  const dataSource: any = { manager: m, transaction: jest.fn((cb: any) => cb(m)) };
  const parametros: any = {
    resolver: jest.fn(async () => ({
      prazo_intencao_recurso_minutos: opts.paramMinutos ?? 10,
      prazo_recursal_dias_uteis: 3,
      prazo_contrarrazoes_dias_uteis: 3,
    })),
  };
  const transicoes: any = {
    executar: jest.fn(async (_id: string, ato: string) => {
      if (ato === 'ABRIR_PRAZO_RECURSAL') licitacao.fase = 'RECURSO';
      if (ato === 'DECIDIR_RECURSOS') licitacao.fase = 'ADJUDICACAO';
      if (ato === 'RETORNAR_HABILITACAO') licitacao.fase = 'HABILITACAO';
      if (ato === 'RETORNAR_JULGAMENTO') licitacao.fase = 'JULGAMENTO';
      return licitacao;
    }),
    unidadesSemPropostaAceita: jest.fn(async () => []),
  };
  const ranking: any = {
    unidades: jest.fn(async () => [{ tipo: 'ITEM', id: 'i1', licitacaoId: 'l1', numero: 1, encerrada: true, itens: [{ status: 'ATIVO' }] }]),
    unidade: jest.fn(async () => ({ tipo: 'ITEM', id: 'i1', licitacaoId: 'l1', numero: 1 })),
    ranking: jest.fn(async () => [{ fornecedorId: 'D', situacao: 'HABILITADO', excluido: false }]),
    definirSituacao: jest.fn(async () => undefined),
  };
  const aceitacao: any = { convocarPendentesAposRecurso: jest.fn(async () => ({ convocadas: 1, fracassadas: 0 })) };
  const service = new RecursosService(dataSource, parametros, transicoes, ranking, aceitacao);
  const recursos = tabelas.get(RecursoAdministrativo)!;
  const janelas = tabelas.get(JanelaIntencaoRecurso)!;
  return { service, m, licitacao, transicoes, ranking, aceitacao, recursos, janelas, situacoes, tabelas };
}

/** Recurso admitido com razões e prazos já vencidos (pronto para o agente). */
async function recursoEmAnalise(ctx: ReturnType<typeof build>) {
  await ctx.service.abrirJanela('s1', {}, ORGAO);
  const i = await ctx.service.registrarIntencao('s1', 'A', { motivacao: 'minha certidão era válida', atoRecorrido: AtoRecorrido.OUTRO });
  await ctx.service.admitir(i.id, ORGAO);
  await ctx.service.apresentarRazoes(i.id, 'A', { texto: 'As razões completas do recurso administrativo.' });
  const r = ctx.recursos.find((x) => x.id === i.id)!;
  r.prazo_contrarrazoes = new Date(Date.now() - MIN); // prazo das contrarrazões encerrado
  ctx.janelas.forEach((j) => (j.fecha_em = new Date(Date.now() - MIN)));
  return r;
}

describe('RecursosService (E5)', () => {
  describe('janela de intenção', () => {
    it('abre com no mínimo 10 min (IN 73 art. 40) e leva a sala à intenção de recurso', async () => {
      const { service, janelas, m } = build({ paramMinutos: 5 });
      const j = await service.abrirJanela('s1', {}, ORGAO);
      expect(j.minutos).toBe(10);
      expect(janelas).toHaveLength(1);
      expect(new Date(j.fechaEm).getTime() - new Date(j.abertaEm).getTime()).toBe(10 * MIN);
      expect(m.query).toHaveBeenCalledWith(expect.stringMatching(/UPDATE sessoes_disputa/), ['s1', EtapaSessao.INTENCAO_RECURSO]);
    });

    it('parâmetro do órgão maior prevalece; pedido abaixo do mínimo → 400', async () => {
      const { service } = build({ paramMinutos: 30 });
      await expect(service.abrirJanela('s1', { minutos: 15 }, ORGAO)).rejects.toMatchObject({ status: 400 });
      expect((await service.abrirJanela('s1', {}, ORGAO)).minutos).toBe(30);
    });

    it('só depois do resultado da habilitação (fase HABILITACAO) e sem outra janela aberta', async () => {
      const fora = build({ fase: 'JULGAMENTO' });
      await expect(fora.service.abrirJanela('s1', {}, ORGAO)).rejects.toMatchObject({ status: 409 });
      const ok = build();
      await ok.service.abrirJanela('s1', {}, ORGAO);
      await expect(ok.service.abrirJanela('s1', {}, ORGAO)).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('intenção (licitante, pelo token)', () => {
    it('sem janela ou depois dela → 409 (preclusão)', async () => {
      const { service, janelas } = build();
      await expect(service.registrarIntencao('s1', 'A', { motivacao: 'motivação suficiente' })).rejects.toMatchObject({ status: 409 });
      await service.abrirJanela('s1', {}, ORGAO);
      janelas[0].fecha_em = new Date(Date.now() - 1000);
      await expect(service.registrarIntencao('s1', 'A', { motivacao: 'motivação suficiente' })).rejects.toThrow(/preclusão/);
    });

    it('dentro da janela: cria o recurso em INTENCAO com o ato recorrido', async () => {
      const { service, recursos } = build();
      await service.abrirJanela('s1', {}, ORGAO);
      const r = await service.registrarIntencao('s1', 'A', { motivacao: 'a certidão era válida', atoRecorrido: AtoRecorrido.INABILITACAO });
      expect(r.status).toBe(StatusRecurso.INTENCAO);
      expect(recursos[0]).toMatchObject({ fornecedor_id: 'A', ato_recorrido: 'INABILITACAO', status: 'INTENCAO' });
      // mesma intenção de novo na janela → 409
      await expect(
        service.registrarIntencao('s1', 'A', { motivacao: 'a certidão era válida', atoRecorrido: AtoRecorrido.INABILITACAO }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('quem não é licitante → 403; ato que o licitante não tem → 400; sem motivação → 400', async () => {
      const { service } = build();
      await service.abrirJanela('s1', {}, ORGAO);
      await expect(service.registrarIntencao('s1', 'Z', { motivacao: 'motivação suficiente' })).rejects.toMatchObject({ status: 403 });
      await expect(
        service.registrarIntencao('s1', 'B', { motivacao: 'motivação suficiente', atoRecorrido: AtoRecorrido.INABILITACAO }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(service.registrarIntencao('s1', 'B', { motivacao: 'curta' })).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('admissibilidade', () => {
    it('admitir abre as razões (3 dias úteis) e o prazo recursal na licitação (ABRIR_PRAZO_RECURSAL)', async () => {
      const { service, transicoes, licitacao, recursos } = build();
      await service.abrirJanela('s1', {}, ORGAO);
      const i = await service.registrarIntencao('s1', 'A', { motivacao: 'motivação suficiente' });
      const antes = Date.now();
      const r = await service.admitir(i.id, ORGAO);
      expect(r.status).toBe(StatusRecurso.AGUARDANDO_RAZOES);
      expect(transicoes.executar).toHaveBeenCalledWith('l1', 'ABRIR_PRAZO_RECURSAL', expect.objectContaining({ ignorarSeJaAplicado: true }));
      expect(licitacao.fase).toBe('RECURSO');
      const esperado = prazoRazoes(new Date(antes)).getTime();
      expect(Math.abs(new Date(recursos[0].prazo_razoes).getTime() - esperado)).toBeLessThan(86_400_000);
      await expect(service.admitir(i.id, ORGAO)).rejects.toMatchObject({ status: 409 });
    });

    it('não admitir exige o pressuposto ausente e fundamentação', async () => {
      const { service, recursos } = build();
      await service.abrirJanela('s1', {}, ORGAO);
      const i = await service.registrarIntencao('s1', 'A', { motivacao: 'motivação suficiente' });
      await expect(service.recusar(i.id, { motivo: 'sem fundamento algum aqui' }, ORGAO)).rejects.toMatchObject({ status: 400 });
      await expect(service.recusar(i.id, { pressuposto: 'INTERESSE', motivo: 'curto' }, ORGAO)).rejects.toMatchObject({ status: 400 });
      await service.recusar(i.id, { pressuposto: 'INTERESSE', motivo: 'O licitante é o vencedor do item recorrido.' }, ORGAO);
      expect(recursos[0]).toMatchObject({ status: StatusRecurso.NAO_CONHECIDO, pressuposto_ausente: 'INTERESSE', intencao_aceita: false });
    });
  });

  describe('razões e contrarrazões', () => {
    async function admitido() {
      const ctx = build();
      await ctx.service.abrirJanela('s1', {}, ORGAO);
      const i = await ctx.service.registrarIntencao('s1', 'A', { motivacao: 'motivação suficiente' });
      await ctx.service.admitir(i.id, ORGAO);
      return { ...ctx, id: i.id };
    }

    it('razões só do recorrente (403 para outro) e contrarrazões contadas do FIM do prazo das razões', async () => {
      const { service, id, recursos } = await admitido();
      await expect(service.apresentarRazoes(id, 'B', { texto: 'razões de quem não recorreu nada' })).rejects.toMatchObject({ status: 403 });
      const r = await service.apresentarRazoes(id, 'A', {
        texto: 'As razões completas do recurso administrativo.',
        arquivo: { originalname: 'razoes.pdf', mimetype: 'application/pdf', size: 10, buffer: Buffer.from('%PDF-1.4') },
      });
      expect(r.status).toBe(StatusRecurso.CONTRARRAZOES);
      expect(r.prazoContrarrazoes).toEqual(prazoContrarrazoes(new Date(recursos[0].prazo_razoes)));
      expect(recursos[0].razoes_arquivo_sha256).toHaveLength(64);
      await expect(service.apresentarRazoes(id, 'A', { texto: 'segunda vez as razões do recurso' })).rejects.toMatchObject({ status: 409 });
    });

    it('razões após o prazo → 409', async () => {
      const { service, id, recursos } = await admitido();
      recursos[0].prazo_razoes = new Date(Date.now() - MIN);
      await expect(service.apresentarRazoes(id, 'A', { texto: 'As razões completas do recurso administrativo.' })).rejects.toMatchObject({
        status: 409,
      });
    });

    it('contrarrazões: recorrente → 403; outro licitante uma vez; após o prazo → 409', async () => {
      const { service, id, recursos, tabelas } = await admitido();
      await service.apresentarRazoes(id, 'A', { texto: 'As razões completas do recurso administrativo.' });
      await expect(service.apresentarContrarrazoes(id, 'A', { texto: 'contrarrazões do próprio recorrente' })).rejects.toMatchObject({ status: 403 });
      await expect(service.apresentarContrarrazoes(id, 'Z', { texto: 'contrarrazões de quem não participa' })).rejects.toMatchObject({ status: 403 });
      await service.apresentarContrarrazoes(id, 'B', { texto: 'A certidão venceu antes da sessão pública.' });
      expect(tabelas.get(ContrarrazaoRecurso)).toHaveLength(1);
      await expect(service.apresentarContrarrazoes(id, 'B', { texto: 'A certidão venceu antes da sessão pública.' })).rejects.toMatchObject({
        status: 409,
      });
      recursos[0].prazo_contrarrazoes = new Date(Date.now() - MIN);
      await expect(service.apresentarContrarrazoes(id, 'C', { texto: 'Contrarrazões apresentadas fora do prazo.' })).rejects.toMatchObject({
        status: 409,
      });
    });
  });

  describe('decisão (art. 165 §2º)', () => {
    it('o agente não decide antes do fim do contraditório (409)', async () => {
      const ctx = build();
      await ctx.service.abrirJanela('s1', {}, ORGAO);
      const i = await ctx.service.registrarIntencao('s1', 'A', { motivacao: 'motivação suficiente' });
      await ctx.service.admitir(i.id, ORGAO);
      await ctx.service.apresentarRazoes(i.id, 'A', { texto: 'As razões completas do recurso administrativo.' });
      await expect(
        ctx.service.reconsiderar(i.id, { reconsiderar: false, fundamentacao: 'Mantenho a decisão pelos fundamentos da ata.' }, ORGAO),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('mantida → autoridade em 10 dias úteis; usuário não-ADMIN ou o próprio agente não decide (403)', async () => {
      const ctx = build();
      const r = await recursoEmAnalise(ctx);
      const pregoeira = { tipo: 'USUARIO' as const, id: 'u1', nome: 'Pregoeira' };
      const antes = Date.now();
      const res = await ctx.service.reconsiderar(r.id, { reconsiderar: false, fundamentacao: 'Mantenho a decisão pelos fundamentos da ata.' }, pregoeira);
      expect(res.status).toBe(StatusRecurso.AGUARDANDO_AUTORIDADE);
      expect(Math.abs(new Date(res.prazoDecisaoAutoridade!).getTime() - prazoAutoridade(new Date(antes)).getTime())).toBeLessThan(86_400_000);
      const dec = { provido: false, fundamentacao: 'Nego provimento pelos fundamentos do agente.', cargo: 'Secretária' };
      await expect(ctx.service.decidirAutoridade(r.id, dec, pregoeira)).rejects.toMatchObject({ status: 403 });
      // o mesmo usuário que manteve, ainda que ADMIN, não decide como autoridade
      const r2 = ctx.recursos.find((x) => x.id === r.id)!;
      r2.reconsideracao_por_id = 'u2';
      await expect(ctx.service.decidirAutoridade(r.id, dec, { tipo: 'USUARIO', id: 'u2', nome: 'Secretária' })).rejects.toMatchObject({
        status: 403,
      });
    });

    it('conta do órgão como autoridade: exige nome e cargo; improvido encerra a fase (DECIDIR_RECURSOS)', async () => {
      const ctx = build();
      const r = await recursoEmAnalise(ctx);
      await ctx.service.reconsiderar(r.id, { reconsiderar: false, fundamentacao: 'Mantenho a decisão pelos fundamentos da ata.' }, ORGAO);
      await expect(
        ctx.service.decidirAutoridade(r.id, { provido: false, fundamentacao: 'Nego provimento pelos fundamentos do agente.' }, ORGAO),
      ).rejects.toMatchObject({ status: 400 });
      const res = await ctx.service.decidirAutoridade(
        r.id,
        { provido: false, fundamentacao: 'Nego provimento pelos fundamentos do agente.', nome: 'Prefeito', cargo: 'Autoridade superior' },
        ORGAO,
      );
      expect(res.status).toBe(StatusRecurso.IMPROVIDO);
      expect(ctx.recursos[0]).toMatchObject({ instancia_decisao: 'AUTORIDADE', decidido_por: 'Prefeito', decidido_por_cargo: 'Autoridade superior' });
      expect(ctx.transicoes.executar).toHaveBeenCalledWith('l1', 'DECIDIR_RECURSOS', expect.objectContaining({ motivo: expect.any(String) }));
      expect(ctx.licitacao.fase).toBe('ADJUDICACAO');
    });

    it('reconsiderado (provido) sem ato estruturado: registra que não há efeito automático e conclui a fase', async () => {
      const ctx = build();
      const r = await recursoEmAnalise(ctx);
      const res = await ctx.service.reconsiderar(r.id, { reconsiderar: true, fundamentacao: 'Reconsidero: a certidão era válida na data.' }, ORGAO);
      expect(res.status).toBe(StatusRecurso.PROVIDO);
      expect(res.efeitos).toMatchObject({ automatico: false });
      expect(ctx.recursos[0]).toMatchObject({ instancia_decisao: 'AGENTE', reconsideracao: 'RECONSIDERADO' });
      expect(ctx.transicoes.executar).toHaveBeenCalledWith('l1', 'DECIDIR_RECURSOS', expect.anything());
    });

    it('inabilitação reformada: recorrente HABILITADO, promovido abaixo invalidado e a licitação volta à habilitação', async () => {
      const ctx = build();
      await ctx.service.abrirJanela('s1', {}, ORGAO);
      const i = await ctx.service.registrarIntencao('s1', 'A', { motivacao: 'minha certidão era válida', atoRecorrido: AtoRecorrido.INABILITACAO });
      await ctx.service.admitir(i.id, ORGAO);
      await ctx.service.apresentarRazoes(i.id, 'A', { texto: 'As razões completas do recurso administrativo.' });
      ctx.recursos[0].prazo_contrarrazoes = new Date(Date.now() - MIN);
      ctx.janelas.forEach((j) => (j.fecha_em = new Date(Date.now() - MIN)));
      // A tinha proposta ACEITA; antes do provimento D está na vez; depois, A na frente e D (HABILITADO) abaixo
      const aceita = /FROM aceitacoes_proposta/;
      const q = ctx.m.query.getMockImplementation();
      ctx.m.query.mockImplementation(async (sql: string, p: any[]) => {
        if (aceita.test(sql) && /^\s*SELECT/.test(sql)) return [{ 1: 1 }];
        if (/UPDATE aceitacoes_proposta/.test(sql)) return [{ id: 'ac-d' }];
        return q(sql, p);
      });
      ctx.ranking.ranking
        .mockResolvedValueOnce([{ fornecedorId: 'D', situacao: 'HABILITADO', excluido: false }]) // antes
        .mockResolvedValueOnce([
          { fornecedorId: 'A', situacao: 'HABILITADO', excluido: false },
          { fornecedorId: 'D', situacao: 'HABILITADO', excluido: false },
        ]) // após restaurar A
        .mockResolvedValue([
          { fornecedorId: 'A', situacao: 'HABILITADO', excluido: false },
          { fornecedorId: 'D', situacao: 'CLASSIFICADO', excluido: false },
        ]);
      const res = await ctx.service.reconsiderar(i.id, { reconsiderar: true, fundamentacao: 'Reconsidero: a certidão era válida na data.' }, ORGAO);
      expect(res.efeitos).toMatchObject({ automatico: true, alterou_resultado: true, aceitacoes_canceladas: ['ac-d'] });
      expect(res.efeitos!.alteracoes).toEqual([
        expect.objectContaining({ fornecedor_id: 'A', de: 'INABILITADO', para: 'HABILITADO', tipo: 'RESTAURADO' }),
        expect.objectContaining({ fornecedor_id: 'D', de: 'HABILITADO', para: 'CLASSIFICADO', tipo: 'INVALIDADO' }),
      ]);
      expect(ctx.ranking.definirSituacao).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'A', 'HABILITADO', expect.anything());
      expect(ctx.ranking.definirSituacao).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'D', 'CLASSIFICADO', expect.anything());
      expect(ctx.transicoes.executar).toHaveBeenCalledWith('l1', 'RETORNAR_HABILITACAO', expect.objectContaining({ motivo: expect.stringMatching(/provido/) }));
      expect(ctx.licitacao.fase).toBe('HABILITACAO');
    });
  });

  it('com a licitação suspensa, nenhum ato de recurso é aceito (409)', async () => {
    const { service, transicoes } = build({ situacao: 'SUSPENSA' });
    await expect(service.abrirJanela('s1', {}, ORGAO)).rejects.toMatchObject({ status: 409 });
    expect(transicoes.executar).not.toHaveBeenCalled();
  });
});
