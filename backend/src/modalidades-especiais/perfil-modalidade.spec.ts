import { definicaoDoAto } from '../licitacoes/transicoes/definicoes';
import { AtoLicitacao } from '../licitacoes/transicoes/transicoes.tipos';
import { FaseLicitacao, Licitacao, ModalidadeLicitacao } from '../licitacoes/entities/licitacao.entity';
import { pendenciasDoAto } from '../licitacoes/transicoes/maquina';
import { faseDaJanelaRecursal, motivoModalidadeCriterioInvalido, resultadoDeclarado, situacoesDeResultado } from './perfil-modalidade';

describe('Modalidades especiais — perfil e fluxos (plano E7c)', () => {
  test('modalidade × critério (art. 33; arts. 6º XXXIX e XL)', () => {
    expect(motivoModalidadeCriterioInvalido('LEILAO', 'MAIOR_LANCE', 'ABERTO')).toBeNull();
    expect(motivoModalidadeCriterioInvalido('LEILAO', 'MENOR_PRECO')).toMatch(/MAIOR LANCE/);
    expect(motivoModalidadeCriterioInvalido('LEILAO', 'MAIOR_LANCE', 'FECHADO')).toMatch(/etapa de lances/);
    expect(motivoModalidadeCriterioInvalido('PREGAO_ELETRONICO', 'MAIOR_LANCE')).toMatch(/exclusivo do leilão/);
    expect(motivoModalidadeCriterioInvalido('CONCURSO', 'MELHOR_TECNICA')).toBeNull();
    expect(motivoModalidadeCriterioInvalido('CONCURSO', 'MENOR_PRECO')).toMatch(/conteúdo artístico/);
    expect(motivoModalidadeCriterioInvalido('DIALOGO_COMPETITIVO', 'TECNICA_E_PRECO')).toBeNull();
  });

  test('resultado declarado (leilão/concurso): fase recursal no JULGAMENTO, com o licitante ACEITO', () => {
    expect(resultadoDeclarado('LEILAO')).toBe(true);
    expect(resultadoDeclarado('CONCURSO')).toBe(true);
    expect(resultadoDeclarado('DIALOGO_COMPETITIVO')).toBe(false);
    expect(faseDaJanelaRecursal('LEILAO')).toBe('JULGAMENTO');
    expect(faseDaJanelaRecursal('PREGAO_ELETRONICO')).toBe('HABILITACAO');
    expect(situacoesDeResultado('CONCURSO')).toContain('ACEITO');
    expect(situacoesDeResultado('CONCORRENCIA')).not.toContain('ACEITO');
  });

  const lic = (modalidade: ModalidadeLicitacao, fase: FaseLicitacao) => ({ id: 'l', modalidade, fase, situacao: 'ATIVA' }) as unknown as Licitacao;
  const ctx = (l: Licitacao, ato: AtoLicitacao, pend: Record<string, string[]>) => ({
    licitacao: l,
    ato,
    agora: new Date(),
    consultas: {
      propostasRecebidas: async () => 1,
      propostasAptasDisputa: async () => 1,
      contratosAssinados: async () => 0,
      contratosOuAtasGerados: async () => 0,
      itens: async () => [{ status: 'ADJUDICADO', fornecedor_vencedor_id: 'f' }],
      instrucaoProcesso: async () => ({ pode_divulgar: true, pendentes: [] }),
      estadoRecursal: async () => ({ janelaAberta: false, janelaEncerrada: true, pendentes: [], intencoesAdmitidas: 0, providosSemDesfecho: 0 }),
      pendenciasModalidade: async (chave: string) => pend[chave] ?? [],
    },
  });

  test('leilão: adjudicar/homologar exigem arrematações pagas (art. 31 §4º); concluir exige os termos', async () => {
    const adj = definicaoDoAto(ModalidadeLicitacao.LEILAO, AtoLicitacao.ADJUDICAR)!;
    const l = lic(ModalidadeLicitacao.LEILAO, FaseLicitacao.JULGAMENTO);
    expect(await pendenciasDoAto(adj, ctx(l, AtoLicitacao.ADJUDICAR, { LEILAO_ARREMATACOES_PAGAS: ['Item 1: pagamento'] }))).toEqual(['Item 1: pagamento']);
    expect(await pendenciasDoAto(adj, ctx(l, AtoLicitacao.ADJUDICAR, {}))).toEqual([]);
    const hom = definicaoDoAto(ModalidadeLicitacao.LEILAO, AtoLicitacao.HOMOLOGAR)!;
    expect((await pendenciasDoAto(hom, ctx(lic(ModalidadeLicitacao.LEILAO, FaseLicitacao.ADJUDICACAO), AtoLicitacao.HOMOLOGAR, { LEILAO_ARREMATACOES_PAGAS: ['x'] }))).includes('x')).toBe(true);
    const concluir = definicaoDoAto(ModalidadeLicitacao.LEILAO, AtoLicitacao.CONCLUIR)!;
    expect(await pendenciasDoAto(concluir, ctx(lic(ModalidadeLicitacao.LEILAO, FaseLicitacao.HOMOLOGACAO), AtoLicitacao.CONCLUIR, { LEILAO_TERMOS: ['sem termo'] }))).toEqual(['sem termo']);
    expect(definicaoDoAto(ModalidadeLicitacao.LEILAO, AtoLicitacao.INICIAR_HABILITACAO)).toBeUndefined();
  });

  test('concurso: JULGAR_CONCURSO exige banca e notas; diálogo: a disputa só existe na fase competitiva', async () => {
    const julgar = definicaoDoAto(ModalidadeLicitacao.CONCURSO, AtoLicitacao.JULGAR_CONCURSO)!;
    expect(julgar.requerDados).toBe(true);
    const lc = lic(ModalidadeLicitacao.CONCURSO, FaseLicitacao.ANALISE_PROPOSTAS);
    expect(await pendenciasDoAto(julgar, ctx(lc, AtoLicitacao.JULGAR_CONCURSO, { CONCURSO_JULGAMENTO: ['banca'] }))).toEqual(['banca']);
    const iniciar = definicaoDoAto(ModalidadeLicitacao.DIALOGO_COMPETITIVO, AtoLicitacao.INICIAR_DISPUTA)!;
    const ld = { ...lic(ModalidadeLicitacao.DIALOGO_COMPETITIVO, FaseLicitacao.ANALISE_PROPOSTAS), data_abertura_sessao: null } as any;
    const p = await pendenciasDoAto(iniciar, ctx(ld, AtoLicitacao.INICIAR_DISPUTA, { DIALOGO_DISPUTA: ['fase competitiva'] }) as any);
    expect(p[0]).toBe('fase competitiva');
    const abrir = definicaoDoAto(ModalidadeLicitacao.DIALOGO_COMPETITIVO, AtoLicitacao.ABRIR_FASE_COMPETITIVA)!;
    const futuro = new Date(Date.now() + 86_400_000).toISOString();
    expect(typeof abrir.para).toBe('function');
    expect((abrir.para as any)(ld, { dados: { data_inicio_acolhimento: futuro }, agora: new Date() })).toBe(FaseLicitacao.PUBLICADO);
    expect((abrir.para as any)(ld, { dados: {}, agora: new Date() })).toBe(FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
  });
});
