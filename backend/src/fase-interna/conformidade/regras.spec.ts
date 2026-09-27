/**
 * MOTOR DE CONFORMIDADE — uma suíte por regra, com o caso real do PA 139/2025
 * (fixtures/pa-139-2025.ts): cada regra DISPARA com o dado real (ou com a
 * variante do erro, quando o erro não estava nos autos) e NÃO dispara com o
 * dado corrigido.
 */
import { montarContexto } from './contexto';
import { consumo, pa139Corrigido, pa139Real } from './fixtures/pa-139-2025';
import { avaliarRegras } from './motor';
import {
  A72_I,
  A72_II,
  A72_III,
  A72_IV,
  A72_V,
  A72_VI,
  A72_VII,
  A72_VIII,
  ART92_01,
  ASS_01,
  CRONO_01,
  DISP_01,
  DUP_01,
  ENQ_01,
  EXERC_01,
  LEI_01,
  LIM_01,
  LIM_02,
  MARCA_01,
  MINUTA_DESAT,
  PRAZO_01,
  PRECO_01,
  PRECO_02,
  PRECO_03,
  PRECO_04,
  REGRAS,
  SIGILO_01,
  VINC_01,
} from './regras';
import type { EntradaContexto } from './contexto';
import type { Regra } from './tipos';

const ctxReal = () => montarContexto(pa139Real());
const ctxCorrigido = () => montarContexto(pa139Corrigido());
const com = (base: () => EntradaContexto, ajuste: (e: EntradaContexto) => void) => {
  const e = base();
  ajuste(e);
  return montarContexto(e);
};
/** Achados da regra (com a checagem de aplicabilidade, como o motor faz). */
const rodar = (regra: Regra, ctx = ctxReal()) => avaliarRegras(ctx, [regra])[0];

describe('Motor de conformidade — PA 139/2025 (dispara com o real, não dispara com o corrigido)', () => {
  it('o caso real dispara as regras dos autos; o corrigido não dispara nenhuma', () => {
    const real = avaliarRegras(ctxReal());
    const disparadas = real.filter((a) => a.achados.length).map((a) => a.regra.codigo);
    expect(disparadas).toEqual(['LIM-02', 'ENQ-01', 'VINC-01', 'MARCA-01', 'PRECO-01', 'PRECO-02', 'CRONO-01', 'LEI-01', 'EXERC-01', 'DUP-01', 'ASS-01']);
    expect(real.filter((a) => a.erro)).toEqual([]);
    const corrigido = avaliarRegras(ctxCorrigido());
    expect(corrigido.filter((a) => a.achados.length).map((a) => `${a.regra.codigo}: ${a.achados[0].mensagem}`)).toEqual([]);
    expect(REGRAS).toHaveLength(27);
  });

  describe('LIM-01 — limite do inciso no exercício, no ramo (portão A)', () => {
    it('com outra dispensa do mesmo ramo (R$ 1.500,00) a soma passa de R$ 62.725,59 → BLOQUEIO', () => {
      const r = rodar(LIM_01, com(pa139Real, (e) => (e.limite = consumo(63_253.44))));
      expect(r.achados).toHaveLength(1);
      expect(r.achados[0]).toMatchObject({ severidade: 'BLOQUEIO', chave: 'ramo:SERVICO:0859|', tipo_peca_responsavel: 'PP' });
      expect(r.achados[0].mensagem).toMatch(/R\$\s?63\.253,44.*2 processo\(s\).*R\$\s?62\.725,59 \(Dec\. 12\.343\/2024\)/);
      expect(r.achados[0].evidencias[0]).toMatchObject({ tipo: 'PP', folha: 17 });
    });
    it('real (98,4%) e corrigido: não dispara', () => {
      expect(rodar(LIM_01).achados).toEqual([]);
      expect(rodar(LIM_01, ctxCorrigido()).achados).toEqual([]);
    });
    it('fora da dispensa por valor: não se aplica', () => {
      const r = rodar(LIM_01, com(pa139Real, (e) => (e.limite = { ...consumo(0), aplicavel: false, motivo: 'O limite de valor só se aplica à dispensa do art. 75, I e II.' })));
      expect(r).toMatchObject({ aplicavel: false, achados: [] });
    });
  });

  describe('LIM-02 — consumo acima de 80%', () => {
    it('real: 98,4% de R$ 62.725,59 — Dec. 12.343/2024 → ATENÇÃO', () => {
      const [a] = rodar(LIM_02).achados;
      expect(a.severidade).toBe('ATENCAO');
      expect(a.mensagem).toMatch(/^98,4% de R\$\s?62\.725,59 — Dec\. 12\.343\/2024/);
    });
    it('corrigido (71%): não dispara; acima do limite vira LIM-01 (não LIM-02)', () => {
      expect(rodar(LIM_02, ctxCorrigido()).achados).toEqual([]);
      expect(rodar(LIM_02, com(pa139Real, (e) => (e.limite = consumo(70_000)))).achados).toEqual([]);
    });
  });

  describe('A72 — portão B (art. 72, incisos mapeados às peças)', () => {
    const antesDeAutorizar = (e: EntradaContexto) => {
      e.instrucao.itens = e.instrucao.itens.map((i) =>
        i.tipo === 'AA' ? { ...i, status: 'EM_ELABORACAO' } : i.tipo === 'ETP' ? { ...i, status: 'EM_ELABORACAO' } : i.tipo === 'DO' ? { ...i, status: 'PENDENTE' } : i,
      );
    };
    it('antes da autorização, ETP em elaboração e reserva pendente → A72-I e A72-IV BLOQUEIO; A72-II ok', () => {
      const ctx = com(pa139Real, antesDeAutorizar);
      const i = rodar(A72_I, ctx);
      expect(i.achados[0]).toMatchObject({ regra: 'A72-I', severidade: 'BLOQUEIO', chave: 'inciso:I' });
      expect(i.achados[0].mensagem).toMatch(/falta Estudo técnico preliminar \(em elaboração\)|falta ETP \(em elaboração\)/);
      expect(rodar(A72_IV, ctx).achados[0].severidade).toBe('BLOQUEIO');
      expect(rodar(A72_II, ctx).achados).toEqual([]);
      expect(rodar(A72_VIII, ctx).achados[0]).toMatchObject({ regra: 'A72-VIII', severidade: 'BLOQUEIO' });
    });
    it('autorização já dada (real): o portão B foi superado — I, II e IV não se aplicam mais; no ato de autorizar voltam a valer', () => {
      expect(rodar(A72_I)).toMatchObject({ aplicavel: false });
      const ctx = com(pa139Real, (e) => {
        e.instrucao.itens = e.instrucao.itens.map((i) => (i.tipo === 'ETP' ? { ...i, status: 'PENDENTE' } : i));
        e.ato_pretendido = 'AUTORIZAR';
      });
      expect(rodar(A72_I, ctx).achados).toHaveLength(1);
    });
    it('V e VI são da fase externa (não bloqueiam); III e VII só ATENÇÃO, depois da autorização', () => {
      expect(rodar(A72_V)).toMatchObject({ aplicavel: false, motivo: expect.stringMatching(/fase externa/i) });
      expect(rodar(A72_VI)).toMatchObject({ aplicavel: false });
      const ctx = com(pa139Real, (e) => (e.instrucao.itens = e.instrucao.itens.map((i) => (i.tipo === 'PJ' || i.tipo === 'RAG' ? { ...i, status: 'PENDENTE' } : i))));
      expect(rodar(A72_III, ctx).achados[0].severidade).toBe('ATENCAO');
      expect(rodar(A72_VII, ctx).achados[0].severidade).toBe('ATENCAO');
      expect(rodar(A72_III, ctxCorrigido()).achados).toEqual([]);
    });
    it('rito completo: não se aplica (instrução do art. 18)', () => {
      expect(rodar(A72_I, com(pa139Real, (e) => (e.instrucao.contratacao_direta = false)))).toMatchObject({ aplicavel: false });
    });
  });

  describe('ENQ-01 — mesmo inciso do art. 75 em todas as peças', () => {
    it('real: relatório (1ª via, fl. 14) e minuta do aviso (fl. 41) citam o inciso I; o processo é do II → BLOQUEIO', () => {
      const [a] = rodar(ENQ_01).achados;
      expect(a).toMatchObject({ severidade: 'BLOQUEIO', chave: 'inciso:I' });
      expect(a.evidencias.map((e) => [e.tipo, e.folha])).toEqual([
        ['RAG', 14],
        ['ME', 41],
      ]);
      expect(a.evidencias[1].trecho).toMatch(/art\. 75, I/);
      expect(a.mensagem).toMatch(/art\. 75, II.*inciso I/);
    });
    it('lê as três formas: "art. 75, II", "art. 75, inciso II" e "inciso II do art. 75"', () => {
      const ctx = com(pa139Corrigido, (e) => (e.textos_pdf!['doc-DFD'] = ['Fundamentada no inciso I do art. 75 da Lei 14.133/2021.']));
      expect(rodar(ENQ_01, ctx).achados[0].evidencias[0]).toMatchObject({ tipo: 'DFD', folha: 1 });
    });
    it('corrigido: não dispara; fundamento fora do art. 75: não se aplica', () => {
      expect(rodar(ENQ_01, ctxCorrigido()).achados).toEqual([]);
      expect(rodar(ENQ_01, com(pa139Real, (e) => (e.licitacao.fundamento_legal = 'ART75_VIII')))).toMatchObject({ aplicavel: true });
      expect(rodar(ENQ_01, com(pa139Real, (e) => ((e.licitacao.modalidade = 'INEXIGIBILIDADE'), (e.licitacao.fundamento_legal = 'ART74_I'))))).toMatchObject({ aplicavel: false });
    });
  });

  describe('VINC-01 — peça cita outro processo', () => {
    it('real: minuta do contrato vinculada ao "PA 115/2025 / Dispensa 025/2025" (fl. 63) → BLOQUEIO', () => {
      const [a] = rodar(VINC_01).achados;
      expect(a).toMatchObject({ severidade: 'BLOQUEIO', chave: 'peca:MC', tipo_peca_responsavel: 'MC' });
      expect(a.mensagem).toMatch(/PA nº 115\/2025 e Dispensa nº 25\/2025/);
      expect(a.evidencias[0]).toMatchObject({ tipo: 'MC', folha: 63 });
    });
    it('corrigido (PA 139/2025 · Dispensa 029/2025, com ou sem zeros): não dispara; o ETP pode citar contratação anterior', () => {
      expect(rodar(VINC_01, ctxCorrigido()).achados).toEqual([]);
      const ctx = com(pa139Corrigido, (e) => (e.textos_pdf!['doc-ETP']![1] = 'Contratação anterior: Processo Administrativo nº 012/2024.'));
      expect(rodar(VINC_01, ctx).achados).toEqual([]);
    });
  });

  describe('MARCA-01 — marca só como referência e justificada (art. 41, I; correção do plano §5.1)', () => {
    it('real: "similar ou superior ao ARION (SNEWS)" no ETP (fls. 5 e 10) e no TR → ATENÇÃO com justificativa obrigatória', () => {
      const r = rodar(MARCA_01);
      expect(r.achados).toHaveLength(1);
      expect(r.achados[0]).toMatchObject({ severidade: 'ATENCAO', exige_justificativa: true, chave: 'referencia:arion|snews', acao: 'JUSTIFICAR' });
      expect(r.achados[0].evidencias.map((e) => [e.tipo, e.folha])).toEqual(expect.arrayContaining([['ETP', 5], ['ETP', 10], ['TR', 11]]));
    });
    it('marca SEM "similar/equivalente" e sem justificativa → BLOQUEIO', () => {
      const ctx = com(pa139Corrigido, (e) => (e.textos_pdf!['doc-TR'] = ['Fornecimento de computadores da marca Dell modelo Optiplex.']));
      const [a] = rodar(MARCA_01, ctx).achados;
      expect(a).toMatchObject({ severidade: 'BLOQUEIO', acao: 'CORRIGIR_PECA' });
      expect(a.mensagem).toMatch(/Dell/);
    });
    it('com a justificativa do art. 41, I registrada no ETP: não dispara; corrigido (descrição pela função): não dispara', () => {
      const ctx = com(pa139Real, (e) => {
        const etp = e.documentos.find((d) => d.id === 'doc-ETP')!;
        etp.dados_estruturados = { _marca: { justificativa: 'Compatibilidade com o acervo e o fluxo de redação já instalados (padronização — art. 41, I, b).' } };
      });
      expect(rodar(MARCA_01, ctx).achados).toEqual([]);
      expect(rodar(MARCA_01, ctxCorrigido()).achados).toEqual([]);
    });
  });

  describe('PRECO-01 — estimativa igual a uma única cotação', () => {
    it('real: igual à proposta da DMNEWS, menor preço, sem justificativa → ATENÇÃO que exige justificativa', () => {
      const [a] = rodar(PRECO_01).achados;
      expect(a).toMatchObject({ severidade: 'ATENCAO', exige_justificativa: true });
      expect(a.mensagem).toMatch(/R\$\s?61\.753,44.*DMNEWS/);
    });
    it('corrigido (método justificado) ou mediana: não dispara', () => {
      expect(rodar(PRECO_01, ctxCorrigido()).achados).toEqual([]);
      expect(rodar(PRECO_01, com(pa139Real, (e) => (e.pesquisa_dados.metodo = 'MEDIANA'))).achados).toEqual([]);
    });
  });

  describe('PRECO-02 — cotação vence antes da publicação', () => {
    it('real: Legado válida até 31/12/2025; publicação prevista 13/01/2026 → ATENÇÃO', () => {
      const [a] = rodar(PRECO_02).achados;
      expect(a.mensagem).toMatch(/^Legado: Vence em 31\/12\/2025, antes da publicação prevista \(13\/01\/2026\)/);
      expect(a.evidencias[0]).toMatchObject({ tipo: 'PP', folha: 17 });
    });
    it('corrigido (validade 28/02/2026): não dispara', () => {
      expect(rodar(PRECO_02, ctxCorrigido()).achados).toEqual([]);
    });
  });

  describe('PRECO-03 — cotação com mais de 6 meses', () => {
    it('variante: proposta emitida em 10/05/2025 (publicação 13/01/2026) → ATENÇÃO', () => {
      const ctx = com(pa139Corrigido, (e) => (e.pesquisa_dados.itens[0].cotacoes[1].data_emissao = '2025-05-10'));
      const [a] = rodar(PRECO_03, ctx).achados;
      expect(a.mensagem).toMatch(/SNEWS: Emitida em 10\/05\/2025: mais de 6 meses/);
    });
    it('real (emitidas em 17/11/2025) e corrigido: não dispara', () => {
      expect(rodar(PRECO_03).achados).toEqual([]);
      expect(rodar(PRECO_03, ctxCorrigido()).achados).toEqual([]);
    });
  });

  describe('CRONO-01 — peça datada antes da que a solicitou (data_documento da E1)', () => {
    it('real: informação orçamentária (04/12) antes da pesquisa (10/12); ETP (14/11) antes do DFD (10/12) → ATENÇÃO', () => {
      const chaves = rodar(CRONO_01).achados.map((a) => a.chave).sort();
      expect(chaves).toEqual(['DO<PP', 'ETP<DFD']);
      const doPp = rodar(CRONO_01).achados.find((a) => a.chave === 'DO<PP')!;
      expect(doPp.mensagem).toMatch(/04\/12\/2025, anterior à Pesquisa de preços \(10\/12\/2025\)/);
    });
    it('corrigido: não dispara; a portaria de designação (anual) não entra na cronologia', () => {
      expect(rodar(CRONO_01, ctxCorrigido()).achados).toEqual([]);
      const ctx = com(pa139Corrigido, (e) => e.documentos.push({ id: 'doc-DP', tipo: 'DP', status: 'IMPORTADO', origem: 'ARQUIVO', data_documento: '2025-01-02T12:00:00-03:00' }));
      expect(rodar(CRONO_01, ctx).achados).toEqual([]);
    });
  });

  describe('LEI-01 — LDO/LOA/PPA com o mesmo número', () => {
    it('real: LOA 1.141/2024 no despacho e na informação orçamentária × 1.151/2024 no parecer → ATENÇÃO', () => {
      const [a] = rodar(LEI_01).achados;
      expect(a).toMatchObject({ chave: 'lei:LOA', severidade: 'ATENCAO' });
      expect(a.mensagem).toMatch(/1\.141\/2024 em .*Despacho de autorização.*1\.151\/2024 em Parecer jurídico/);
      expect(a.mensagem).toMatch(/tabela do órgão \(reserva\): 1\.141\/2024/);
    });
    it('corrigido: não dispara; lei geral (14.133) não entra', () => {
      expect(rodar(LEI_01, ctxCorrigido()).achados).toEqual([]);
    });
  });

  describe('EXERC-01 — reserva do exercício N e publicação em N+1', () => {
    it('real: reserva de 2025 e publicação prevista 13/01/2026 → ATENÇÃO (tarefa da Contabilidade)', () => {
      const [a] = rodar(EXERC_01).achados;
      expect(a).toMatchObject({ chave: '2025>2026', acao: 'AGENDAR', tipo_peca_responsavel: 'DO' });
      expect(a.mensagem).toMatch(/reserva é de 2025.*13\/01\/2026/);
    });
    it('corrigido (dotação renovada para 2026): não dispara; sem reserva emitida: não se aplica', () => {
      expect(rodar(EXERC_01, ctxCorrigido()).achados).toEqual([]);
      expect(rodar(EXERC_01, com(pa139Real, (e) => (e.reserva = null)))).toMatchObject({ aplicavel: false });
    });
  });

  describe('DUP-01 — mesma peça juntada duas vezes', () => {
    it('real: relatório do agente nas fls. 14–16 e 38–40 com textos diferentes → ATENÇÃO', () => {
      const [a] = rodar(DUP_01).achados;
      expect(a).toMatchObject({ chave: 'tipo:RAG', severidade: 'ATENCAO' });
      expect(a.mensagem).toMatch(/fls\. 14–16 e fls\. 38–40/);
    });
    it('documento da aba Documentos com outro arquivo do mesmo tipo também é "juntado 2 vezes"; o mesmo arquivo não', () => {
      const outro = com(pa139Corrigido, (e) => (e.anexos_avulsos = [{ documento_id: 'dl-1', tipo: 'MC', titulo: 'Contrato', impressao: 'outro-hash', data_documento: null }]));
      expect(rodar(DUP_01, outro).achados[0].chave).toBe('tipo:MC');
      const igual = com(pa139Corrigido, (e) => (e.anexos_avulsos = [{ documento_id: 'dl-1', tipo: 'MC', titulo: 'Contrato', impressao: 'hash-doc-MC', data_documento: null }]));
      expect(rodar(DUP_01, igual).achados).toEqual([]);
      expect(rodar(DUP_01, ctxCorrigido()).achados).toEqual([]);
    });
  });

  describe('ASS-01 — peça sem data ou com assinaturas faltantes', () => {
    it('real: despacho da Mesa sem data → BLOQUEIO', () => {
      const [a] = rodar(ASS_01).achados;
      expect(a).toMatchObject({ chave: 'AA:data', severidade: 'BLOQUEIO', tipo_peca_responsavel: 'AA' });
    });
    it('peça aguardando assinaturas → BLOQUEIO com quem falta (sem tarefa: o portal avisa)', () => {
      const ctx = com(pa139Corrigido, (e) =>
        e.documentos.push({
          id: 'doc-MCI',
          tipo: 'MCI',
          status: 'AGUARDANDO_ASSINATURA',
          origem: 'INTERNO',
          dados_estruturados: { parecer: '<p>Manifestação</p>', _exige_assinatura: true },
          signatarios_exigidos: [{ usuario_id: 'u1', nome: 'Carla', papel: 'Controladora' }],
          assinaturas: [],
        }),
      );
      const [a] = rodar(ASS_01, ctx).achados;
      expect(a).toMatchObject({ chave: 'MCI:assinaturas', sem_tarefa: true });
      expect(a.mensagem).toMatch(/faltam: Carla \(Controladora\)/);
    });
    it('corrigido: não dispara; rascunho feito aqui que só vale assinado ainda não está nos autos', () => {
      expect(rodar(ASS_01, ctxCorrigido()).achados).toEqual([]);
      const ctx = com(pa139Corrigido, (e) => e.documentos.push({ id: 'doc-PJ2', tipo: 'PJE', status: 'EM_ELABORACAO', origem: 'INTERNO', dados_estruturados: { parecer: 'x', _exige_assinatura: true } }));
      expect(rodar(ASS_01, ctx).achados).toEqual([]);
    });
  });

  describe('PRAZO-01 — janela de propostas com 3 dias úteis (calendário do órgão)', () => {
    it('variante: divulgação 13/01/2026 e fim do recebimento 15/01 08:00 → BLOQUEIO (mínimo a partir de 16/01)', () => {
      const ctx = com(pa139Corrigido, (e) => (e.licitacao.data_fim_acolhimento = '2026-01-15T08:00:00-03:00'));
      const [a] = rodar(PRAZO_01, ctx).achados;
      expect(a.severidade).toBe('BLOQUEIO');
      expect(a.mensagem).toMatch(/2 dia\(s\) útil\(eis\).*mínimo é de 3 dias úteis.*16\/01\/2026/);
    });
    it('real (até 20/01) e corrigido: não dispara; sem cronograma: conferido ao publicar', () => {
      expect(rodar(PRAZO_01).achados).toEqual([]);
      expect(rodar(PRAZO_01, ctxCorrigido()).achados).toEqual([]);
      expect(rodar(PRAZO_01, com(pa139Real, (e) => ((e.licitacao.data_fim_acolhimento = null), (e.licitacao.data_abertura_sessao = null))))).toMatchObject({ aplicavel: false });
    });
    it('o cronograma do ato (pedido de publicação) prevalece sobre o gravado', () => {
      const ctx = com(pa139Corrigido, (e) => (e.cronograma = { data_fim_acolhimento: '2026-01-14T18:00:00-03:00' }));
      expect(rodar(PRAZO_01, ctx).achados).toHaveLength(1);
    });
  });

  describe('MINUTA-DESAT — minuta desatualizada (E3B)', () => {
    it('variante: minuta do aviso editada à mão e o fundamento mudou → ATENÇÃO; corrigido não', () => {
      const ctx = com(pa139Corrigido, (e) =>
        e.documentos.push({ id: 'doc-ME2', tipo: 'ME', status: 'EM_ELABORACAO', origem: 'INTERNO', dados_estruturados: { preambulo: 'x', _desatualizada: { motivo: 'EDITADA', texto: 'O processo mudou (fundamento legal) depois que esta peça foi gerada. Regerar?' } } }),
      );
      expect(rodar(MINUTA_DESAT, ctx).achados[0]).toMatchObject({ chave: 'peca:ME', severidade: 'ATENCAO' });
      expect(rodar(MINUTA_DESAT, ctxCorrigido()).achados).toEqual([]);
    });
  });

  describe('SIGILO-01 — orçamento sigiloso justificado (art. 24)', () => {
    it('variante: sigiloso sem justificativa → ATENÇÃO; real (justificado) não; público: não se aplica', () => {
      expect(rodar(SIGILO_01, com(pa139Real, (e) => (e.licitacao.justificativa_sigilo = null))).achados[0].severidade).toBe('ATENCAO');
      expect(rodar(SIGILO_01).achados).toEqual([]);
      expect(rodar(SIGILO_01, com(pa139Real, (e) => (e.licitacao.sigilo_orcamento = 'PUBLICO')))).toMatchObject({ aplicavel: false });
    });
  });

  describe('DISP-01 — dispensa sem disputa de lances em órgão que adota a IN 67 (Entrega 5)', () => {
    it('sem lances + regulamento adota a IN 67 → ATENÇÃO; com lances não; regulamento sem a IN 67: não se aplica', () => {
      const semLancesIn67 = com(pa139Real, (e) => {
        e.licitacao.dispensa_com_lances = false;
        e.licitacao.regulamento_adota_in67 = true;
      });
      const [a] = rodar(DISP_01, semLancesIn67).achados;
      expect(a).toMatchObject({ severidade: 'ATENCAO', chave: 'sem-lances' });
      expect(a.exige_justificativa).toBeFalsy();
      expect(rodar(DISP_01, com(pa139Real, (e) => { e.licitacao.dispensa_com_lances = true; e.licitacao.regulamento_adota_in67 = true; })).achados).toEqual([]);
      expect(rodar(DISP_01, com(pa139Real, (e) => { e.licitacao.dispensa_com_lances = false; e.licitacao.regulamento_adota_in67 = false; }))).toMatchObject({ aplicavel: false });
      // sem escolha no processo: vale o padrão sugerido do órgão
      expect(rodar(DISP_01, com(pa139Real, (e) => { e.licitacao.padrao_dispensa_com_lances = false; e.licitacao.regulamento_adota_in67 = true; })).achados).toHaveLength(1);
    });
  });

  describe('ART92-01 — cláusulas do art. 92 na minuta do contrato', () => {
    const secoes = Object.fromEntries(['objeto', 'vinculacao', 'legislacao', 'regime_execucao', 'preco', 'pagamento', 'prazos', 'dotacao', 'obrigacoes', 'penalidades', 'habilitacao', 'gestao', 'extincao', 'foro'].map((k) => [k, '<p>Texto da cláusula</p>']));
    const mcFeitaAqui = (dados: Record<string, string>) => (e: EntradaContexto) => {
      e.documentos = e.documentos.filter((d) => d.tipo !== 'MC');
      e.documentos.push({ id: 'doc-MC3', tipo: 'MC', status: 'EM_ELABORACAO', origem: 'INTERNO', dados_estruturados: dados });
    };
    it('variante: minuta feita no sistema com o foro vazio → ATENÇÃO; completa: não', () => {
      const [a] = rodar(ART92_01, com(pa139Corrigido, mcFeitaAqui({ ...secoes, foro: '' }))).achados;
      expect(a.mensagem).toMatch(/art\. 92, §1º \(foro\)/);
      expect(rodar(ART92_01, com(pa139Corrigido, mcFeitaAqui(secoes))).achados).toEqual([]);
    });
    it('minuta anexada: conferir no PDF (não se aplica ao motor)', () => {
      expect(rodar(ART92_01)).toMatchObject({ aplicavel: false });
    });
  });
  describe('PRECO-04 — TR com valor diferente da pesquisa (homologação 26/09/2026)', () => {
    const trFeitoAqui = (texto: string) => (e: EntradaContexto) => {
      e.licitacao.sigilo_orcamento = 'PUBLICO';
      e.documentos = e.documentos.filter((d) => d.tipo !== 'TR');
      e.documentos.push({ id: 'doc-TR2', tipo: 'TR', status: 'EM_ELABORACAO', origem: 'INTERNO', dados_estruturados: { estimativa_valor_tr: texto } });
    };
    it('TR gerado antes da pesquisa (R$ 24.000,00) × pesquisa de R$ 61.753,44 → ATENÇÃO', () => {
      const [a] = rodar(PRECO_04, com(pa139Corrigido, trFeitoAqui('<p>Valor total estimado da contratação: R$ 24.000,00.</p>'))).achados;
      expect(a).toMatchObject({ severidade: 'ATENCAO', titulo: 'TR com valor diferente da pesquisa', tipo_peca_responsavel: 'TR' });
      expect(a.mensagem).toMatch(/R\$\s?24\.000,00.*R\$\s?61\.753,44/);
    });
    it('TR com o valor da pesquisa (regerado): não dispara', () => {
      expect(rodar(PRECO_04, com(pa139Corrigido, trFeitoAqui('<p>Valor total estimado da contratação: R$ 61.753,44, apurado na pesquisa.</p>'))).achados).toEqual([]);
    });
    it('sigilo (art. 24), TR anexado ou sem pesquisa emitida: não se aplica', () => {
      expect(rodar(PRECO_04)).toMatchObject({ aplicavel: false });
      expect(rodar(PRECO_04, com(pa139Corrigido, (e) => (e.licitacao.sigilo_orcamento = 'PUBLICO')))).toMatchObject({ aplicavel: false });
      expect(
        rodar(PRECO_04, com(pa139Corrigido, (e) => { trFeitoAqui('<p>R$ 1,00</p>')(e); e.pesquisa_dados.itens[0].valor_referencial = null; })),
      ).toMatchObject({ aplicavel: false });
    });
  });
});
