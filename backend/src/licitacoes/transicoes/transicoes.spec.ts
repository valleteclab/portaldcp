import { FaseLicitacao, Licitacao, ModalidadeLicitacao, SituacaoLicitacao } from '../entities/licitacao.entity';
import { definicaoDoAto, FLUXOS } from './definicoes';
import {
  aplicarNoEstado,
  atoDeRetorno,
  atoPrincipal,
  conflitoDeEstado,
  faseDestino,
  jaAplicado,
  pendenciasDoAto,
} from './maquina';
import { AtoLicitacao, ConsultasTransicao, ContextoTransicao } from './transicoes.tipos';

const F = FaseLicitacao;
const S = SituacaoLicitacao;
const A = AtoLicitacao;
const M = ModalidadeLicitacao;

function lic(parcial: Partial<Licitacao>): Licitacao {
  return {
    id: 'l1',
    numero_processo: 'P-1',
    modalidade: M.PREGAO_ELETRONICO,
    fase: F.PLANEJAMENTO,
    situacao: S.ATIVA,
    fase_anterior: null,
    observacoes: null,
    ...parcial,
  } as unknown as Licitacao;
}

function consultas(p: Partial<Record<keyof ConsultasTransicao, any>> = {}): ConsultasTransicao {
  return {
    propostasRecebidas: async () => p.propostasRecebidas ?? 0,
    propostasAptasDisputa: async () => p.propostasAptasDisputa ?? 1,
    contratosAssinados: async () => p.contratosAssinados ?? 0,
    contratosOuAtasGerados: async () => p.contratosOuAtasGerados ?? 0,
    itens: async () => p.itens ?? [{ status: 'ADJUDICADO', fornecedor_vencedor_id: 'f1' }],
    instrucaoProcesso: async (etapa?: FaseLicitacao) =>
      (typeof p.instrucaoProcesso === 'function' ? p.instrucaoProcesso(etapa) : p.instrucaoProcesso) ?? { pode_divulgar: true, pendentes: [] },
    unidadesSemPropostaAceita: async () => p.unidadesSemPropostaAceita ?? [],
  };
}

function ctx(l: Licitacao, ato: AtoLicitacao, extra: Partial<ContextoTransicao> = {}): ContextoTransicao {
  return { licitacao: l, ato, agora: new Date('2026-09-24T12:00:00'), consultas: consultas(), ...extra };
}

/** Estado permite o ato? (fase + situação + modalidade) — sem pré-condições. */
function permite(modalidade: ModalidadeLicitacao, fase: FaseLicitacao, ato: AtoLicitacao, situacao = S.ATIVA) {
  const l = lic({ modalidade, fase, situacao });
  return conflitoDeEstado(definicaoDoAto(modalidade, ato), l, ato) === null;
}

describe('TransicoesService — matriz de transições por modalidade', () => {
  // [modalidade, fase de origem, ato, fase de destino esperada | null = mantém]
  const VALIDAS: Array<[ModalidadeLicitacao, FaseLicitacao, AtoLicitacao, FaseLicitacao | null, SituacaoLicitacao?]> = [
    // Pregão — rito completo
    [M.PREGAO_ELETRONICO, F.PLANEJAMENTO, A.CONCLUIR_PLANEJAMENTO, F.TERMO_REFERENCIA],
    [M.PREGAO_ELETRONICO, F.TERMO_REFERENCIA, A.CONCLUIR_TERMO_REFERENCIA, F.PESQUISA_PRECOS],
    [M.PREGAO_ELETRONICO, F.PESQUISA_PRECOS, A.CONCLUIR_PESQUISA_PRECOS, F.ANALISE_JURIDICA],
    [M.PREGAO_ELETRONICO, F.ANALISE_JURIDICA, A.CONCLUIR_ANALISE_JURIDICA, F.APROVACAO_INTERNA],
    [M.PREGAO_ELETRONICO, F.APROVACAO_INTERNA, A.CONCLUIR_FASE_INTERNA, null],
    [M.PREGAO_ELETRONICO, F.TERMO_REFERENCIA, A.DEVOLVER_FASE_INTERNA, F.PLANEJAMENTO],
    [M.PREGAO_ELETRONICO, F.APROVACAO_INTERNA, A.PUBLICAR, F.PUBLICADO],
    [M.PREGAO_ELETRONICO, F.PUBLICADO, A.INICIAR_ACOLHIMENTO, F.ACOLHIMENTO_PROPOSTAS],
    [M.PREGAO_ELETRONICO, F.IMPUGNACAO, A.INICIAR_ACOLHIMENTO, F.ACOLHIMENTO_PROPOSTAS],
    [M.PREGAO_ELETRONICO, F.ACOLHIMENTO_PROPOSTAS, A.ENCERRAR_ACOLHIMENTO, F.ANALISE_PROPOSTAS],
    [M.PREGAO_ELETRONICO, F.ANALISE_PROPOSTAS, A.INICIAR_DISPUTA, F.EM_DISPUTA],
    [M.PREGAO_ELETRONICO, F.EM_DISPUTA, A.ENCERRAR_DISPUTA, F.JULGAMENTO],
    [M.PREGAO_ELETRONICO, F.JULGAMENTO, A.INICIAR_HABILITACAO, F.HABILITACAO],
    [M.PREGAO_ELETRONICO, F.HABILITACAO, A.ABRIR_PRAZO_RECURSAL, F.RECURSO],
    [M.PREGAO_ELETRONICO, F.HABILITACAO, A.ADJUDICAR, F.ADJUDICACAO],
    [M.PREGAO_ELETRONICO, F.RECURSO, A.DECIDIR_RECURSOS, F.ADJUDICACAO],
    [M.PREGAO_ELETRONICO, F.RECURSO, A.RETORNAR_JULGAMENTO, F.JULGAMENTO],
    [M.PREGAO_ELETRONICO, F.ADJUDICACAO, A.HOMOLOGAR, F.HOMOLOGACAO],
    [M.PREGAO_ELETRONICO, F.HOMOLOGACAO, A.HOMOLOGAR, null], // completar (B1) enquanto sem contrato
    [M.PREGAO_ELETRONICO, F.APROVACAO_INTERNA, A.REGISTRAR_RESULTADO_EXTERNO, F.ADJUDICACAO],
    [M.PREGAO_ELETRONICO, F.HOMOLOGACAO, A.CONCLUIR, null, S.CONCLUIDA],
    [M.PREGAO_ELETRONICO, F.EM_DISPUTA, A.SUSPENDER, null, S.SUSPENSA],
    [M.PREGAO_ELETRONICO, F.PUBLICADO, A.DECLARAR_DESERTA, null, S.DESERTA],
    [M.PREGAO_ELETRONICO, F.JULGAMENTO, A.DECLARAR_FRACASSADA, null, S.FRACASSADA],
    [M.PREGAO_ELETRONICO, F.PLANEJAMENTO, A.REVOGAR, null, S.REVOGADA],
    [M.PREGAO_ELETRONICO, F.HOMOLOGACAO, A.ANULAR, null, S.ANULADA],
    // Concorrência e o rito genérico (leilão, concurso, diálogo)
    [M.CONCORRENCIA, F.EM_DISPUTA, A.ENCERRAR_DISPUTA, F.JULGAMENTO],
    [M.LEILAO, F.ANALISE_PROPOSTAS, A.INICIAR_DISPUTA, F.EM_DISPUTA],
    [M.CONCURSO, F.HABILITACAO, A.ABRIR_PRAZO_RECURSAL, F.RECURSO],
    [M.DIALOGO_COMPETITIVO, F.ADJUDICACAO, A.HOMOLOGAR, F.HOMOLOGACAO],
    // E6: gravar a adjudicação dos itens depois de DECIDIR_RECURSOS (ADJUDICACAO → ADJUDICACAO)
    [M.PREGAO_ELETRONICO, F.ADJUDICACAO, A.ADJUDICAR, null],
    // Dispensa eletrônica
    [M.DISPENSA_ELETRONICA, F.PLANEJAMENTO, A.CONCLUIR_FASE_INTERNA, F.APROVACAO_INTERNA],
    [M.DISPENSA_ELETRONICA, F.PLANEJAMENTO, A.CONCLUIR_PLANEJAMENTO, F.TERMO_REFERENCIA],
    [M.DISPENSA_ELETRONICA, F.APROVACAO_INTERNA, A.PUBLICAR, F.PUBLICADO],
    [M.DISPENSA_ELETRONICA, F.PUBLICADO, A.JULGAR_DISPENSA, F.ADJUDICACAO],
    [M.DISPENSA_ELETRONICA, F.ANALISE_PROPOSTAS, A.JULGAR_DISPENSA, F.ADJUDICACAO],
    [M.DISPENSA_ELETRONICA, F.ADJUDICACAO, A.JULGAR_DISPENSA, null], // rejulgar até homologar
    [M.DISPENSA_ELETRONICA, F.ADJUDICACAO, A.HOMOLOGAR, F.HOMOLOGACAO],
    [M.DISPENSA_ELETRONICA, F.ACOLHIMENTO_PROPOSTAS, A.ENCERRAR_ACOLHIMENTO, F.ANALISE_PROPOSTAS],
    // Inexigibilidade
    [M.INEXIGIBILIDADE, F.ANALISE_JURIDICA, A.CONCLUIR_FASE_INTERNA, F.APROVACAO_INTERNA],
    [M.INEXIGIBILIDADE, F.PUBLICADO, A.REGISTRAR_RESULTADO_EXTERNO, F.ADJUDICACAO],
    [M.INEXIGIBILIDADE, F.ADJUDICACAO, A.HOMOLOGAR, F.HOMOLOGACAO],
  ];

  // linhas com o mesmo nº de colunas (senão o jest injeta `done` no último parâmetro)
  test.each(VALIDAS.map(([m, f, a, d, sit]) => [m, f, a, d, sit ?? null] as const))('%s: %s + %s → %s', (modalidade, fase, ato, destino, situacao) => {
    expect(permite(modalidade, fase, ato)).toBe(true);
    const def = definicaoDoAto(modalidade, ato)!;
    const l = lic({ modalidade, fase });
    expect(faseDestino(def, l)).toBe(destino ?? fase);
    expect(def.situacaoPara ?? S.ATIVA).toBe(situacao ?? S.ATIVA);
  });

  const INVALIDAS: Array<[ModalidadeLicitacao, FaseLicitacao, AtoLicitacao, RegExp?]> = [
    [M.PREGAO_ELETRONICO, F.PLANEJAMENTO, A.PUBLICAR, /aprovada internamente/],
    [M.PREGAO_ELETRONICO, F.PLANEJAMENTO, A.CONCLUIR_FASE_INTERNA],
    [M.PREGAO_ELETRONICO, F.ACOLHIMENTO_PROPOSTAS, A.INICIAR_DISPUTA, /análise de propostas/],
    [M.PREGAO_ELETRONICO, F.ANALISE_PROPOSTAS, A.JULGAR_DISPENSA, /não se aplica/],
    [M.PREGAO_ELETRONICO, F.PUBLICADO, A.HOMOLOGAR],
    [M.PREGAO_ELETRONICO, F.JULGAMENTO, A.ADJUDICAR],
    [M.PREGAO_ELETRONICO, F.HOMOLOGACAO, A.SUSPENDER],
    [M.PREGAO_ELETRONICO, F.PLANEJAMENTO, A.SUSPENDER, /ainda não divulgado/],
    [M.PREGAO_ELETRONICO, F.PLANEJAMENTO, A.DEVOLVER_FASE_INTERNA],
    [M.PREGAO_ELETRONICO, F.PUBLICADO, A.RETORNAR_JULGAMENTO],
    [M.PREGAO_ELETRONICO, F.ADJUDICACAO, A.CONCLUIR],
    // E6: dispensa/inexigibilidade adjudicam pelos próprios atos (julgamento / resultado externo)
    [M.DISPENSA_ELETRONICA, F.ADJUDICACAO, A.ADJUDICAR, /não se aplica/],
    [M.PREGAO_ELETRONICO, F.HOMOLOGACAO, A.ADJUDICAR],
    [M.PREGAO_ELETRONICO, F.HOMOLOGACAO, A.REGISTRAR_RESULTADO_EXTERNO, /já homologada/],
    [M.DISPENSA_ELETRONICA, F.ANALISE_PROPOSTAS, A.INICIAR_DISPUTA, /não se aplica/],
    [M.DISPENSA_ELETRONICA, F.HABILITACAO, A.ABRIR_PRAZO_RECURSAL, /não se aplica/],
    [M.DISPENSA_ELETRONICA, F.HOMOLOGACAO, A.JULGAR_DISPENSA, /já homologada/],
    [M.DISPENSA_ELETRONICA, F.PUBLICADO, A.ABRIR_IMPUGNACAO, /não se aplica/],
    // E1 item 6: o prazo de impugnação é por data (art. 164), não uma fase
    [M.PREGAO_ELETRONICO, F.PUBLICADO, A.ABRIR_IMPUGNACAO, /não se aplica/],
    [M.INEXIGIBILIDADE, F.PUBLICADO, A.INICIAR_ACOLHIMENTO, /não se aplica/],
    [M.INEXIGIBILIDADE, F.PUBLICADO, A.JULGAR_DISPENSA, /não se aplica/],
  ];

  test.each(INVALIDAS.map(([m, f, a, msg]) => [m, f, a, msg ?? null] as const))(
    '%s: %s + %s é recusado',
    (modalidade, fase, ato, mensagem) => {
      const l = lic({ modalidade, fase });
      const conflito = conflitoDeEstado(definicaoDoAto(modalidade, ato), l, ato);
      expect(conflito).not.toBeNull();
      if (mensagem) expect(conflito).toMatch(mensagem);
    },
  );

  test('situação: suspensa só aceita retomar/revogar/anular; terminal não aceita nada', () => {
    const m = M.PREGAO_ELETRONICO;
    expect(permite(m, F.ACOLHIMENTO_PROPOSTAS, A.ENCERRAR_ACOLHIMENTO, S.SUSPENSA)).toBe(false);
    expect(permite(m, F.ACOLHIMENTO_PROPOSTAS, A.SUSPENDER, S.SUSPENSA)).toBe(false);
    expect(permite(m, F.ACOLHIMENTO_PROPOSTAS, A.RETOMAR, S.SUSPENSA)).toBe(true);
    expect(permite(m, F.ACOLHIMENTO_PROPOSTAS, A.REVOGAR, S.SUSPENSA)).toBe(true);
    expect(permite(m, F.ACOLHIMENTO_PROPOSTAS, A.ANULAR, S.SUSPENSA)).toBe(true);
    expect(permite(m, F.ACOLHIMENTO_PROPOSTAS, A.RETOMAR, S.ATIVA)).toBe(false);
    for (const terminal of [S.REVOGADA, S.ANULADA, S.DESERTA, S.FRACASSADA, S.CONCLUIDA]) {
      for (const ato of Object.values(A)) {
        expect(permite(m, F.ACOLHIMENTO_PROPOSTAS, ato, terminal)).toBe(false);
      }
    }
    const msg = conflitoDeEstado(definicaoDoAto(m, A.ENCERRAR_ACOLHIMENTO), lic({ fase: F.ACOLHIMENTO_PROPOSTAS, situacao: S.SUSPENSA }));
    expect(msg).toMatch(/suspensa — retome/);
  });

  test('toda modalidade tem fluxo e todo fluxo leva da fase interna à homologação', () => {
    for (const modalidade of Object.values(M)) {
      const fluxo = FLUXOS[modalidade];
      expect(fluxo.length).toBeGreaterThan(5);
      expect(fluxo.some((d) => d.ato === A.PUBLICAR)).toBe(true);
      expect(fluxo.some((d) => d.ato === A.HOMOLOGAR)).toBe(true);
      for (const a of [A.SUSPENDER, A.RETOMAR, A.REVOGAR, A.ANULAR, A.DECLARAR_DESERTA, A.DECLARAR_FRACASSADA, A.CONCLUIR]) {
        expect(fluxo.some((d) => d.ato === a)).toBe(true);
      }
    }
  });
});

describe('TransicoesService — ato principal (avançar-fase) e retorno (retroceder-fase)', () => {
  const PRINCIPAL: Array<[ModalidadeLicitacao, FaseLicitacao, AtoLicitacao | undefined]> = [
    [M.PREGAO_ELETRONICO, F.PLANEJAMENTO, A.CONCLUIR_PLANEJAMENTO],
    [M.PREGAO_ELETRONICO, F.ANALISE_JURIDICA, A.CONCLUIR_ANALISE_JURIDICA],
    [M.PREGAO_ELETRONICO, F.APROVACAO_INTERNA, A.PUBLICAR],
    [M.PREGAO_ELETRONICO, F.PUBLICADO, A.INICIAR_ACOLHIMENTO],
    [M.PREGAO_ELETRONICO, F.IMPUGNACAO, A.INICIAR_ACOLHIMENTO],
    [M.PREGAO_ELETRONICO, F.ACOLHIMENTO_PROPOSTAS, A.ENCERRAR_ACOLHIMENTO],
    [M.PREGAO_ELETRONICO, F.ANALISE_PROPOSTAS, A.INICIAR_DISPUTA],
    [M.PREGAO_ELETRONICO, F.EM_DISPUTA, A.ENCERRAR_DISPUTA],
    [M.PREGAO_ELETRONICO, F.JULGAMENTO, A.INICIAR_HABILITACAO],
    [M.PREGAO_ELETRONICO, F.HABILITACAO, A.ABRIR_PRAZO_RECURSAL],
    [M.PREGAO_ELETRONICO, F.RECURSO, A.DECIDIR_RECURSOS],
    [M.PREGAO_ELETRONICO, F.ADJUDICACAO, A.HOMOLOGAR],
    [M.PREGAO_ELETRONICO, F.HOMOLOGACAO, A.CONCLUIR],
    [M.DISPENSA_ELETRONICA, F.PUBLICADO, A.INICIAR_ACOLHIMENTO],
    [M.DISPENSA_ELETRONICA, F.ANALISE_PROPOSTAS, A.JULGAR_DISPENSA],
    [M.DISPENSA_ELETRONICA, F.ADJUDICACAO, A.HOMOLOGAR],
    [M.DISPENSA_ELETRONICA, F.EM_DISPUTA, A.JULGAR_DISPENSA], // dispensa antiga levada à disputa
    [M.INEXIGIBILIDADE, F.PUBLICADO, undefined],
  ];
  test.each(PRINCIPAL)('%s em %s → %s', (modalidade, fase, esperado) => {
    expect(atoPrincipal(lic({ modalidade, fase }))?.ato).toBe(esperado);
  });

  test('suspensa: avançar não tem ato (retome primeiro)', () => {
    // o ato principal ainda é o da fase; o conflito vem na execução
    const l = lic({ fase: F.ACOLHIMENTO_PROPOSTAS, situacao: S.SUSPENSA });
    const def = atoPrincipal(l)!;
    expect(conflitoDeEstado(def, l, def.ato)).toMatch(/suspensa/);
  });

  test.each([
    [F.TERMO_REFERENCIA, A.DEVOLVER_FASE_INTERNA],
    [F.APROVACAO_INTERNA, A.DEVOLVER_FASE_INTERNA],
    [F.HABILITACAO, A.RETORNAR_JULGAMENTO],
    [F.ADJUDICACAO, A.RETORNAR_JULGAMENTO],
    [F.PLANEJAMENTO, undefined],
    [F.ACOLHIMENTO_PROPOSTAS, undefined],
    [F.EM_DISPUTA, undefined],
  ])('retorno a partir de %s → %s', (fase, esperado) => {
    expect(atoDeRetorno(lic({ fase }))?.ato).toBe(esperado);
  });
});

describe('TransicoesService — pré-condições', () => {
  test('publicar dispensa: instrução do art. 72 e 3 dias úteis', async () => {
    const l = lic({ modalidade: M.DISPENSA_ELETRONICA, fase: F.APROVACAO_INTERNA });
    const def = definicaoDoAto(l.modalidade, A.PUBLICAR)!;
    const semInstrucao = await pendenciasDoAto(
      def,
      ctx(l, A.PUBLICAR, {
        consultas: consultas({ instrucaoProcesso: { pode_divulgar: false, pendentes: ['Formalização da Demanda (DFD)'] } }),
        dados: { data_publicacao_edital: '2026-09-24T10:00:00', data_fim_acolhimento: '2026-09-25T10:00:00' },
      }),
    );
    expect(semInstrucao).toHaveLength(2);
    expect(semInstrucao[0]).toMatch(/Instrução do processo incompleta \(Art\. 72.*DFD/);
    expect(semInstrucao[1]).toMatch(/3 dias úteis/);

    const ok = await pendenciasDoAto(
      def,
      ctx(l, A.PUBLICAR, { dados: { data_publicacao_edital: '2026-09-24T10:00:00', data_fim_acolhimento: '2026-10-05T10:00:00' } }),
    );
    expect(ok).toEqual([]);
  });

  test('pregão: publicar exige a fase interna documentada (art. 18); prazo é o do art. 55 (8 dias úteis), não o da dispensa', async () => {
    const pendente = { pode_divulgar: false, pendentes: ['Parecer jurídico (Art. 53)'] };
    // E7a: 24/09/2026 + 8 dias úteis (25, 28, 29, 30, 01, 02, 05, 06) → abertura a partir de 06/10 (art. 183: inclui o dia do vencimento)
    const dados = { data_fim_acolhimento: '2026-10-07T10:00:00', data_abertura_sessao: '2026-10-07T10:00:00' };
    const naoConcluida = lic({ fase: F.APROVACAO_INTERNA, fase_interna_concluida: false } as any);
    const def = definicaoDoAto(naoConcluida.modalidade, A.PUBLICAR)!;
    expect(await pendenciasDoAto(def, ctx(naoConcluida, A.PUBLICAR, { consultas: consultas({ instrucaoProcesso: pendente }), dados }))).toEqual([
      'Documento obrigatório da fase interna pendente: Parecer jurídico (Art. 53)',
    ]);
    // concluída pelo ato próprio (já passou pelo gate): publicar não repete
    const concluida = lic({ fase: F.APROVACAO_INTERNA, fase_interna_concluida: true } as any);
    expect(await pendenciasDoAto(def, ctx(concluida, A.PUBLICAR, { consultas: consultas({ instrucaoProcesso: pendente }), dados }))).toEqual([]);
    // com 3 dias úteis (o prazo da dispensa) o pregão é recusado pelo art. 55, I, a
    const curto = { data_fim_acolhimento: '2026-09-30T10:00:00', data_abertura_sessao: '2026-09-30T10:00:00' };
    const p = await pendenciasDoAto(def, ctx(concluida, A.PUBLICAR, { dados: curto }));
    expect(p.join(' ')).toMatch(/8 dias úteis.*art\. 55, I, a/);
  });

  test('gate único da fase interna: etapas do pregão cobram os documentos da própria etapa', async () => {
    const etapasPedidas: Array<FaseLicitacao | undefined> = [];
    const instrucaoProcesso = (etapa?: FaseLicitacao) => {
      etapasPedidas.push(etapa);
      return { pode_divulgar: false, pendentes: ['Estudo Técnico Preliminar (ETP) (Art. 18)'] };
    };
    const l = lic({ fase: F.PLANEJAMENTO });
    const p = await pendenciasDoAto(
      definicaoDoAto(l.modalidade, A.CONCLUIR_PLANEJAMENTO)!,
      ctx(l, A.CONCLUIR_PLANEJAMENTO, { consultas: consultas({ instrucaoProcesso }) }),
    );
    expect(p).toEqual(['Documento obrigatório da etapa Planejamento pendente: Estudo Técnico Preliminar (ETP) (Art. 18)']);
    expect(etapasPedidas).toEqual([F.PLANEJAMENTO]);

    // concluir a fase interna cobra TODAS as etapas (sem etapa)
    etapasPedidas.length = 0;
    const ap = lic({ fase: F.APROVACAO_INTERNA });
    const q = await pendenciasDoAto(
      definicaoDoAto(ap.modalidade, A.CONCLUIR_FASE_INTERNA)!,
      ctx(ap, A.CONCLUIR_FASE_INTERNA, { consultas: consultas({ instrucaoProcesso }) }),
    );
    expect(q).toHaveLength(1);
    expect(etapasPedidas).toEqual([undefined]);
  });

  test('contratação direta: etapas sem gate próprio; concluir a instrução cobra o art. 72', async () => {
    const pendente = { pode_divulgar: false, pendentes: ['Autorização (Art. 72, VIII)'] };
    const l = lic({ modalidade: M.DISPENSA_ELETRONICA, fase: F.PLANEJAMENTO });
    expect(
      await pendenciasDoAto(
        definicaoDoAto(l.modalidade, A.CONCLUIR_PLANEJAMENTO)!,
        ctx(l, A.CONCLUIR_PLANEJAMENTO, { consultas: consultas({ instrucaoProcesso: pendente }) }),
      ),
    ).toEqual([]);
    const c = await pendenciasDoAto(
      definicaoDoAto(l.modalidade, A.CONCLUIR_FASE_INTERNA)!,
      ctx(l, A.CONCLUIR_FASE_INTERNA, { consultas: consultas({ instrucaoProcesso: pendente }) }),
    );
    expect(c).toEqual([expect.stringMatching(/Instrução do processo incompleta \(Art\. 72.*Autorização/)]);
  });

  test('habilitação só com proposta aceita em todas as unidades (E3 — IN 73 art. 29)', async () => {
    const l = lic({ fase: F.JULGAMENTO });
    const def = definicaoDoAto(l.modalidade, A.INICIAR_HABILITACAO)!;
    expect(
      await pendenciasDoAto(def, ctx(l, A.INICIAR_HABILITACAO, { consultas: consultas({ unidadesSemPropostaAceita: ['Item 1', 'Lote 2'] }) })),
    ).toEqual([expect.stringMatching(/Aceitação da proposta pendente.*Item 1, Lote 2/)]);
    expect(await pendenciasDoAto(def, ctx(l, A.INICIAR_HABILITACAO))).toEqual([]);
  });

  test('acolhimento, abertura e propostas para a disputa', async () => {
    const agora = new Date('2026-09-24T12:00:00');
    const futuro = new Date('2026-09-30T12:00:00');
    const l = lic({ fase: F.ACOLHIMENTO_PROPOSTAS, data_fim_acolhimento: futuro, data_abertura_sessao: futuro } as any);
    expect(await pendenciasDoAto(definicaoDoAto(l.modalidade, A.ENCERRAR_ACOLHIMENTO)!, ctx(l, A.ENCERRAR_ACOLHIMENTO, { agora }))).toEqual([
      expect.stringMatching(/prazo de recebimento de propostas ainda está aberto/),
    ]);
    const l2 = lic({ fase: F.ANALISE_PROPOSTAS, data_abertura_sessao: futuro } as any);
    const p2 = await pendenciasDoAto(
      definicaoDoAto(l2.modalidade, A.INICIAR_DISPUTA)!,
      ctx(l2, A.INICIAR_DISPUTA, { agora, consultas: consultas({ propostasAptasDisputa: 0 }) }),
    );
    expect(p2).toEqual([expect.stringMatching(/só pode ser iniciada a partir de/), expect.stringMatching(/sem propostas válidas/)]);
  });

  test('revogar/anular: motivo obrigatório e bloqueio com contrato assinado', async () => {
    const l = lic({ fase: F.HOMOLOGACAO });
    for (const ato of [A.REVOGAR, A.ANULAR]) {
      const def = definicaoDoAto(l.modalidade, ato)!;
      expect(await pendenciasDoAto(def, ctx(l, ato))).toEqual([expect.stringMatching(/Motivo obrigatório/)]);
      const comContrato = await pendenciasDoAto(def, ctx(l, ato, { motivo: 'interesse público', consultas: consultas({ contratosAssinados: 1 }) }));
      expect(comContrato).toEqual([expect.stringMatching(/contrato\(s\) assinado\(s\).*antes de (revogar|anular)/)]);
      expect(await pendenciasDoAto(def, ctx(l, ato, { motivo: 'interesse público' }))).toEqual([]);
    }
  });

  test('homologar exige vencedor; re-homologar só sem contrato; concluir exige contrato/ata', async () => {
    const adj = lic({ fase: F.ADJUDICACAO });
    const hom = definicaoDoAto(adj.modalidade, A.HOMOLOGAR)!;
    expect(await pendenciasDoAto(hom, ctx(adj, A.HOMOLOGAR, { consultas: consultas({ itens: [{ status: 'ATIVO', fornecedor_vencedor_id: null }] }) }))).toEqual([
      expect.stringMatching(/Nenhum item com vencedor/),
    ]);
    const jaHom = lic({ fase: F.HOMOLOGACAO });
    expect(await pendenciasDoAto(hom, ctx(jaHom, A.HOMOLOGAR, { consultas: consultas({ contratosOuAtasGerados: 2 }) }))).toEqual([
      expect.stringMatching(/já homologada e com contrato/),
    ]);
    expect(await pendenciasDoAto(hom, ctx(jaHom, A.HOMOLOGAR))).toEqual([]);
    const concluir = definicaoDoAto(jaHom.modalidade, A.CONCLUIR)!;
    expect(await pendenciasDoAto(concluir, ctx(jaHom, A.CONCLUIR))).toEqual([expect.stringMatching(/Nenhum contrato ou ata/)]);
    expect(await pendenciasDoAto(concluir, ctx(jaHom, A.CONCLUIR, { consultas: consultas({ contratosOuAtasGerados: 1 }) }))).toEqual([]);
  });

  test('deserta sem propostas (ou todos os itens desertos); fracassada sem vencedor', async () => {
    const l = lic({ fase: F.ANALISE_PROPOSTAS });
    const deserta = definicaoDoAto(l.modalidade, A.DECLARAR_DESERTA)!;
    const m = { motivo: 'sem interessados' };
    expect(await pendenciasDoAto(deserta, ctx(l, A.DECLARAR_DESERTA, { ...m, consultas: consultas({ propostasRecebidas: 0 }) }))).toEqual([]);
    expect(
      await pendenciasDoAto(deserta, ctx(l, A.DECLARAR_DESERTA, { ...m, consultas: consultas({ propostasRecebidas: 2, itens: [{ status: 'ATIVO', fornecedor_vencedor_id: null }] }) })),
    ).toEqual([expect.stringMatching(/proposta\(s\) recebida\(s\)/)]);
    expect(
      await pendenciasDoAto(deserta, ctx(l, A.DECLARAR_DESERTA, { ...m, consultas: consultas({ propostasRecebidas: 2, itens: [{ status: 'DESERTO', fornecedor_vencedor_id: null }] }) })),
    ).toEqual([]);
    const fracassada = definicaoDoAto(l.modalidade, A.DECLARAR_FRACASSADA)!;
    expect(await pendenciasDoAto(fracassada, ctx(l, A.DECLARAR_FRACASSADA, m))).toEqual([expect.stringMatching(/item com vencedor/)]);
    expect(
      await pendenciasDoAto(fracassada, ctx(l, A.DECLARAR_FRACASSADA, { ...m, consultas: consultas({ itens: [{ status: 'FRACASSADO', fornecedor_vencedor_id: null }] }) })),
    ).toEqual([]);
  });

  test('listagem de atos (somenteAvaliacao) não cobra motivo nem dados do formulário', async () => {
    const l = lic({ modalidade: M.DISPENSA_ELETRONICA, fase: F.APROVACAO_INTERNA });
    expect(await pendenciasDoAto(definicaoDoAto(l.modalidade, A.PUBLICAR)!, ctx(l, A.PUBLICAR, { somenteAvaliacao: true }))).toEqual([]);
    const r = lic({ fase: F.PUBLICADO });
    expect(await pendenciasDoAto(definicaoDoAto(r.modalidade, A.REVOGAR)!, ctx(r, A.REVOGAR, { somenteAvaliacao: true }))).toEqual([]);
  });
});

describe('TransicoesService — suspender / retomar e efeitos', () => {
  test('suspender preserva a fase e acrescenta o motivo; retomar volta à mesma fase e reabre prazos', () => {
    const l = lic({ fase: F.ACOLHIMENTO_PROPOSTAS, observacoes: 'Observação original' } as any);
    const agora = new Date('2026-09-24T12:00:00');
    const r1 = aplicarNoEstado(definicaoDoAto(l.modalidade, A.SUSPENDER)!, l, ctx(l, A.SUSPENDER, { motivo: 'Impugnação acolhida', agora }));
    expect(r1).toEqual({ fase_de: F.ACOLHIMENTO_PROPOSTAS, fase_para: F.ACOLHIMENTO_PROPOSTAS, situacao_de: S.ATIVA, situacao_para: S.SUSPENSA });
    expect(l.fase).toBe(F.ACOLHIMENTO_PROPOSTAS);
    expect(l.situacao).toBe(S.SUSPENSA);
    expect(l.fase_anterior).toBeNull(); // a fase não mudou
    expect(l.observacoes).toMatch(/^Observação original\n\[24\/09\/2026\] Suspender: Impugnação acolhida$/);

    const novoFim = '2026-10-10T18:00:00';
    const r2 = aplicarNoEstado(definicaoDoAto(l.modalidade, A.RETOMAR)!, l, ctx(l, A.RETOMAR, { agora, dados: { data_fim_acolhimento: novoFim } }));
    expect(r2.situacao_para).toBe(S.ATIVA);
    expect(l.fase).toBe(F.ACOLHIMENTO_PROPOSTAS);
    expect(l.data_fim_acolhimento).toEqual(new Date(novoFim));
  });

  test('mudança de fase grava fase_anterior e as datas do ato', () => {
    const agora = new Date('2026-09-24T12:00:00');
    const l = lic({ fase: F.EM_DISPUTA });
    aplicarNoEstado(definicaoDoAto(l.modalidade, A.ENCERRAR_DISPUTA)!, l, ctx(l, A.ENCERRAR_DISPUTA, { agora }));
    expect(l.fase).toBe(F.JULGAMENTO);
    expect(l.fase_anterior).toBe(F.EM_DISPUTA);
    expect(l.data_fim_disputa).toEqual(agora);

    const p = lic({ modalidade: M.DISPENSA_ELETRONICA, fase: F.APROVACAO_INTERNA });
    aplicarNoEstado(definicaoDoAto(p.modalidade, A.PUBLICAR)!, p, ctx(p, A.PUBLICAR, {
      agora,
      dados: { data_publicacao_edital: '2026-09-24T09:00:00', data_fim_acolhimento: '2026-10-01T09:00:00', link_pncp: 'https://pncp' },
    }));
    expect(p.fase).toBe(F.PUBLICADO);
    expect(p.fase_interna_concluida).toBe(true);
    expect(p.data_fim_acolhimento).toEqual(new Date('2026-10-01T09:00:00'));
    expect(p.link_pncp).toBe('https://pncp');
  });

  test('jaAplicado: pedido idempotente do cron/PNCP', () => {
    const def = definicaoDoAto(M.PREGAO_ELETRONICO, A.ENCERRAR_ACOLHIMENTO)!;
    expect(jaAplicado(def, lic({ fase: F.ACOLHIMENTO_PROPOSTAS }))).toBe(false);
    expect(jaAplicado(def, lic({ fase: F.ANALISE_PROPOSTAS }))).toBe(true);
    expect(jaAplicado(def, lic({ fase: F.EM_DISPUTA }))).toBe(true);
    const pub = definicaoDoAto(M.PREGAO_ELETRONICO, A.PUBLICAR)!;
    expect(jaAplicado(pub, lic({ fase: F.APROVACAO_INTERNA }))).toBe(false);
    expect(jaAplicado(pub, lic({ fase: F.PUBLICADO }))).toBe(true);
    const susp = definicaoDoAto(M.PREGAO_ELETRONICO, A.SUSPENDER)!;
    expect(jaAplicado(susp, lic({ fase: F.PUBLICADO, situacao: S.SUSPENSA }))).toBe(true);
  });
});
