/**
 * MOTOR DE CONFORMIDADE — idempotência da revisão, portões e montagem do
 * contexto (PA 139/2025 como fixture).
 */
import { incisoArt75DoFundamento, montarContexto, pecaDoContexto } from './contexto';
import { consumo, pa139Corrigido, pa139Real } from './fixtures/pa-139-2025';
import { AchadoExistente, avaliarRegras, contagemDaConformidade, impedemPublicar, pendenciasDoPortao, planejarRevisao, planoVazio, regrasDoPortao, todosOsAchados } from './motor';
import { REGRAS } from './regras';
import type { AchadoCalculado, AvaliacaoRegra, Regra } from './tipos';

/** Aplica o plano a uma "tabela" em memória (como o serviço faz no banco). */
function aplicar(tabela: AchadoExistente[], avaliacoes: AvaliacaoRegra[]) {
  const plano = planejarRevisao(tabela, avaliacoes);
  let seq = tabela.length;
  const nova = tabela.map((e) => ({ ...e }));
  for (const a of plano.criar) nova.push({ id: `a${++seq}`, regra: a.regra, chave: a.chave, status: 'ABERTO', severidade: a.severidade, titulo: a.titulo, mensagem: a.mensagem, evidencias: a.evidencias, exige_justificativa: !!a.exige_justificativa });
  for (const u of [...plano.atualizar, ...plano.reabrir]) {
    const e = nova.find((x) => x.id === u.id)!;
    Object.assign(e, { severidade: u.achado.severidade, titulo: u.achado.titulo, mensagem: u.achado.mensagem, evidencias: u.achado.evidencias, exige_justificativa: !!u.achado.exige_justificativa });
    if (plano.reabrir.some((r) => r.id === u.id)) e.status = 'ABERTO';
  }
  for (const r of plano.resolver) nova.find((x) => x.id === r.id)!.status = 'RESOLVIDO';
  return { plano, tabela: nova };
}

describe('Motor — revisão idempotente', () => {
  it('primeira revisão cria os achados; a segunda, com os mesmos dados, não muda NADA', () => {
    const av = avaliarRegras(montarContexto(pa139Real()));
    const r1 = aplicar([], av);
    expect(r1.plano.criar.length).toBe(todosOsAchados(av).length);
    const r2 = aplicar(r1.tabela, avaliarRegras(montarContexto(pa139Real())));
    expect(planoVazio(r2.plano)).toBe(true);
  });

  it('evidências gravadas no jsonb (chaves reordenadas pelo Postgres) não contam como mudança', () => {
    const av = avaliarRegras(montarContexto(pa139Real()));
    const r1 = aplicar([], av);
    const reordenada = r1.tabela.map((a: any) => ({
      ...a,
      evidencias: (a.evidencias ?? []).map((e: any) => Object.fromEntries(Object.entries(e).sort(([x], [y]) => y.length - x.length))),
    }));
    expect(planoVazio(aplicar(reordenada, avaliarRegras(montarContexto(pa139Real()))).plano)).toBe(true);
  });

  it('o achado que deixa de ocorrer vira RESOLVIDO (com o motivo); o que reaparece é REABERTO', () => {
    const { tabela } = aplicar([], avaliarRegras(montarContexto(pa139Real())));
    const corrigido = aplicar(tabela, avaliarRegras(montarContexto(pa139Corrigido())));
    expect(corrigido.plano.resolver.length).toBe(tabela.length);
    expect(corrigido.plano.resolver.every((r) => /Deixou de ocorrer|deixou de se aplicar/.test(r.motivo))).toBe(true);
    expect(corrigido.tabela.every((a) => a.status === 'RESOLVIDO')).toBe(true);
    const deNovo = aplicar(corrigido.tabela, avaliarRegras(montarContexto(pa139Real())));
    expect(deNovo.plano.criar).toEqual([]);
    expect(deNovo.plano.reabrir.length).toBe(tabela.length);
    expect(deNovo.plano.reabrir[0].motivo).toMatch(/Voltou a ocorrer/);
  });

  it('JUSTIFICADO persiste enquanto a mesma ocorrência continua (mesma chave); some → resolvido', () => {
    const { tabela } = aplicar([], avaliarRegras(montarContexto(pa139Real())));
    const marca = tabela.find((a) => a.regra === 'MARCA-01')!;
    marca.status = 'JUSTIFICADO';
    const r = aplicar(tabela, avaliarRegras(montarContexto(pa139Real())));
    expect(planoVazio(r.plano)).toBe(true);
    expect(r.tabela.find((a) => a.id === marca.id)!.status).toBe('JUSTIFICADO');
    // a mensagem muda (outra folha), a ocorrência é a mesma: continua justificado
    const outraFolha = pa139Real();
    outraFolha.documentos = outraFolha.documentos.map((d) => (d.id === 'doc-ETP' ? { ...d, folha_inicial: 6, folha_final: 11 } : d));
    const r2 = aplicar(r.tabela, avaliarRegras(montarContexto(outraFolha)));
    expect(r2.plano.atualizar.map((u) => u.id)).toContain(marca.id);
    expect(r2.tabela.find((a) => a.id === marca.id)!.status).toBe('JUSTIFICADO');
    // marca nova (outra ocorrência): a justificativa antiga não a cobre
    const outraMarca = pa139Real();
    outraMarca.textos_pdf!['doc-TR'] = ['Deve ser similar ou superior ao ARION (SNEWS) ou similar ao produto Xyz Studio.'];
    const r3 = aplicar(r2.tabela, avaliarRegras(montarContexto(outraMarca)));
    expect(r3.plano.criar.some((a) => a.regra === 'MARCA-01')).toBe(true);
  });

  it('justificado que passa a BLOQUEIO é reaberto (bloqueio não se justifica)', () => {
    const existente: AchadoExistente = { id: 'x', regra: 'LIM-02', chave: 'ramo:SERVICO:0859|', status: 'JUSTIFICADO', severidade: 'ATENCAO', titulo: 't', mensagem: 'm', evidencias: [], exige_justificativa: false };
    const regra: Regra = { codigo: 'LIM-02', descricao: '', severidade: 'ATENCAO', etapa: 'PESQUISA', portao: 'A', avaliar: () => [{ regra: 'LIM-02', chave: 'ramo:SERVICO:0859|', severidade: 'BLOQUEIO', titulo: 't', mensagem: 'm', evidencias: [] }] };
    const plano = planejarRevisao([existente], [{ regra, aplicavel: true, motivo: null, achados: regra.avaliar({} as any) }]);
    expect(plano.reabrir[0]).toMatchObject({ id: 'x', motivo: expect.stringMatching(/bloqueio/i) });
  });

  it('regra que falha não derruba as outras e não "resolve" os achados dela', () => {
    const quebrada: Regra = { codigo: 'ENQ-01', descricao: '', severidade: 'BLOQUEIO', etapa: 'PUBLICACAO', portao: 'C', avaliar: () => { throw new Error('boom'); } };
    const av = avaliarRegras(montarContexto(pa139Real()), [quebrada, ...REGRAS.filter((r) => r.codigo !== 'ENQ-01')]);
    expect(av[0]).toMatchObject({ erro: 'boom', achados: [] });
    const existente: AchadoExistente = { id: 'e', regra: 'ENQ-01', chave: 'inciso:I', status: 'ABERTO', severidade: 'BLOQUEIO', titulo: 't', mensagem: 'm', evidencias: [], exige_justificativa: false };
    expect(planejarRevisao([existente], av).resolver.map((r) => r.id)).not.toContain('e');
  });
});

describe('Motor — portões', () => {
  const real = () => avaliarRegras(montarContexto(pa139Real()));

  it('portão A só olha o limite (LIM-01); B, o limite e o art. 72; C, tudo menos o art. 72 I/II/IV', () => {
    expect(regrasDoPortao('A').map((r) => r.codigo)).toEqual(['LIM-01', 'LIM-02', 'LIM-03']);
    expect(regrasDoPortao('B').map((r) => r.codigo)).toEqual(['LIM-01', 'LIM-02', 'LIM-03', 'A72-I', 'A72-II', 'A72-IV', 'A72-VI', 'A72-VII']);
    expect(regrasDoPortao('C').map((r) => r.codigo)).not.toContain('A72-I');
    expect(regrasDoPortao('C').map((r) => r.codigo)).not.toContain('A72-VII');
  });

  it('portão C recusa o PA 139/2025 real: bloqueios (ENQ-01, VINC-01, ASS-01) e as atenções que exigem justificativa (MARCA-01, PRECO-01) — com o que falta e onde', () => {
    const p = pendenciasDoPortao('C', real(), new Set());
    expect(p.map((x) => x.match(/— ([A-Z0-9-]+)/)![1])).toEqual(['ENQ-01', 'VINC-01', 'MARCA-01', 'PRECO-01', 'ASS-01']);
    expect(p.find((x) => x.includes('VINC-01'))).toMatch(/\[Minuta do contrato, fl\. 63\]/);
    expect(p.find((x) => x.includes('MARCA-01'))).toMatch(/justificativa obrigatória/);
    // atenções comuns (LIM-02, PRECO-02, CRONO-01, LEI-01, EXERC-01, DUP-01) não travam
    expect(p.some((x) => /LIM-02|CRONO-01|LEI-01|EXERC-01|DUP-01|PRECO-02/.test(x))).toBe(false);
  });

  it('ATENÇÃO justificado libera; PRAZO-01 e A72-VIII são garantidos pelas pré-condições do próprio ato', () => {
    const justificados = new Set(['MARCA-01|referencia:arion|snews', 'PRECO-01|forn:11222333000181']);
    const p = pendenciasDoPortao('C', real(), justificados);
    expect(p.some((x) => /MARCA-01|PRECO-01/.test(x))).toBe(false);
    const semPrazo = pa139Corrigido();
    semPrazo.licitacao.data_fim_acolhimento = '2026-01-15T08:00:00-03:00';
    const av = avaliarRegras(montarContexto(semPrazo));
    expect(av.find((a) => a.regra.codigo === 'PRAZO-01')!.achados).toHaveLength(1);
    expect(pendenciasDoPortao('C', av, new Set())).toEqual([]);
  });

  it('corrigido: nenhum portão recusa; limite estourado recusa os portões A, B e C', () => {
    const corr = avaliarRegras(montarContexto(pa139Corrigido()));
    for (const p of ['A', 'B', 'C'] as const) expect(pendenciasDoPortao(p, corr, new Set())).toEqual([]);
    const estourado = pa139Corrigido();
    estourado.limite = consumo(63_253.44);
    const av = avaliarRegras(montarContexto(estourado));
    for (const p of ['A', 'B', 'C'] as const) expect(pendenciasDoPortao(p, av, new Set())[0]).toMatch(/LIM-01/);
  });

  it('botão "Publicar — resolva N": conta bloqueios e atenções sem a justificativa obrigatória abertos', () => {
    const ach = todosOsAchados(real()) as Array<AchadoCalculado & { status?: string }>;
    expect(impedemPublicar(ach)).toBe(5); // ENQ-01, VINC-01, ASS-01 + MARCA-01 e PRECO-01
    expect(impedemPublicar(ach.map((a) => (a.regra === 'MARCA-01' ? { ...a, status: 'JUSTIFICADO' } : a)))).toBe(4);
  });

  it('contagem ÚNICA (quadro do processo, checklist e tela — homologação E6): bloqueios de todos os portões, por portão', () => {
    const achados = [
      { regra: 'A72-I', severidade: 'BLOQUEIO' as const, status: 'ABERTO' },
      { regra: 'A72-II', severidade: 'BLOQUEIO' as const, status: 'ABERTO' },
      { regra: 'A72-IV', severidade: 'BLOQUEIO' as const, status: 'ABERTO' },
      { regra: 'LIM-01', severidade: 'BLOQUEIO' as const, status: 'ABERTO', portao: 'A' },
      { regra: 'VINC-01', severidade: 'BLOQUEIO' as const, status: 'RESOLVIDO' },
      { regra: 'MARCA-01', severidade: 'ATENCAO' as const, status: 'ABERTO', exige_justificativa: true },
      { regra: 'LIM-02', severidade: 'ATENCAO' as const, status: 'JUSTIFICADO' },
    ];
    expect(contagemDaConformidade(achados)).toEqual({ bloqueios: 4, atencoes: 1, impedem_publicar: 5, bloqueios_por_portao: { A: 1, B: 3, C: 0 } });
  });
});

describe('Motor — montagem do contexto', () => {
  it('processo: fundamento efetivo e o inciso do art. 75; número da dispensa; sigilo; cronograma do ato prevalece', () => {
    const e = pa139Real();
    e.cronograma = { data_fim_acolhimento: '2026-01-22T08:00:00-03:00' };
    const ctx = montarContexto(e);
    expect(ctx.processo).toMatchObject({ fundamento_legal: 'ART75_II', fundamento_referencia: 'art. 75, II', inciso_art75: 'II', numero_dispensa: '029/2025', sigiloso: true, valor_estimado: 61753.44, exercicio: 2025 });
    expect(ctx.processo.cronograma.data_fim_acolhimento).toBe(new Date('2026-01-22T08:00:00-03:00').toISOString());
    expect(ctx.hoje).toBe('2025-12-18');
    expect(incisoArt75DoFundamento('ART75_III_A')).toBe('III');
    expect(incisoArt75DoFundamento('ART74_I')).toBeNull();
  });

  it('peça anexada: texto do PDF página a página, na folha certa; sem texto (digitalizada) fica marcada', () => {
    const ctx = montarContexto(pa139Real());
    const etp = ctx.pecas.find((p) => p.tipo === 'ETP')!;
    expect(etp.paginas.map((p) => p.folha)).toEqual([5, 6, 7, 8, 9, 10]);
    expect(etp).toMatchObject({ anexada: true, data_documento: '2025-11-14', sem_texto: false, impressao: 'hash-doc-ETP' });
    const semTexto = pecaDoContexto({ id: 'x', tipo: 'TR', status: 'IMPORTADO', origem: 'ARQUIVO', folha_inicial: 3 }, null);
    expect(semTexto).toMatchObject({ sem_texto: true, paginas: [] });
  });

  it('peça feita no sistema: uma "página" por seção (chaves internas fora); data no dia de Brasília; quem falta assinar', () => {
    const p = pecaDoContexto({
      id: 'y',
      tipo: 'AA',
      status: 'AGUARDANDO_ASSINATURA',
      origem: 'INTERNO',
      folha_inicial: null,
      data_documento: '2026-01-10T02:00:00Z', // 09/01 23h em Brasília
      dados_estruturados: { autorizacao: '<p>Autorizo — art. 75, II</p>', _gerado: { hash: 'h' }, _exige_assinatura: true },
      signatarios_exigidos: [
        { usuario_id: 'u1', nome: 'Presidente A', papel: 'Presidente' },
        { usuario_id: 'u2', nome: 'Vice B', papel: 'Vice-Presidente' },
      ],
      assinaturas: [{ assinante_id: 'u1' }],
    });
    expect(p.paginas).toEqual([{ folha: null, secao: 'autorizacao', texto: '<p>Autorizo — art. 75, II</p>' }]);
    expect(p).toMatchObject({ data_documento: '2026-01-09', exige_assinatura: true, signatarios_faltantes: ['Vice B (Vice-Presidente)'] });
  });

  it('peças SUBSTITUÍDAS ficam fora; duas versões atuais do mesmo tipo entram (DUP-01); pesquisa, reserva e leis normalizadas', () => {
    const e = pa139Real();
    e.documentos.push({ id: 'velha', tipo: 'TR', status: 'SUBSTITUIDO', origem: 'ARQUIVO' });
    const ctx = montarContexto(e);
    expect(ctx.pecas.some((p) => p.documento_id === 'velha')).toBe(false);
    expect(ctx.pecas.filter((p) => p.tipo === 'RAG')).toHaveLength(2);
    expect(ctx.pesquisa).toMatchObject({ metodo: 'MENOR', publicacao_prevista: '2026-01-13' });
    expect(ctx.reserva).toMatchObject({ exercicio_base: 2025, leis: { LOA: '1141/2024' } });
  });
});
