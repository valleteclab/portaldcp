import { conferirSorteio } from '../julgamento/sorteio';
import { criarCalendario } from '../common/prazos/calendario';
import {
  CredenciadoNaFila,
  HipoteseCredenciamento,
  IniciativaDescredenciamento,
  RegraDistribuicao,
  StatusInscricao,
  efeitoDoDescredenciamento,
  escolhaDivisaoIgualitaria,
  escolhaPorCotacao,
  motivoInelegivel,
  motivoNaoInscreve,
  motivoRegraIncompativel,
  pendenciasEditalCredenciamento,
  prazoRecursoInscricao,
  proximoDoRodizio,
  sorteioDaDemanda,
  statusEfetivoInscricao,
  validadeDoCredenciado,
  StatusRecursoInscricao,
  atrasosRecursoInscricao,
  motivoNaoDecideAutoridade,
  motivoNaoReconsidera,
  prazoAutoridadeInscricao,
  prazoReconsideracaoInscricao,
} from './regras-credenciamento';

const c = (id: string, ordem: number, extra: Partial<CredenciadoNaFila> = {}): CredenciadoNaFila => ({
  inscricaoId: id,
  fornecedorId: `f-${id}`,
  ordemRodizio: ordem,
  contratacoes: 0,
  valorContratado: 0,
  ...extra,
});

describe('credenciamento — regras puras (E7b)', () => {
  describe('hipótese × regra de distribuição (art. 79)', () => {
    it('I admite rodízio, sorteio e divisão; II só escolha do beneficiário; III só cotação', () => {
      expect(motivoRegraIncompativel(HipoteseCredenciamento.PARALELA_NAO_EXCLUDENTE, RegraDistribuicao.RODIZIO)).toBeNull();
      expect(motivoRegraIncompativel(HipoteseCredenciamento.PARALELA_NAO_EXCLUDENTE, RegraDistribuicao.SORTEIO)).toBeNull();
      expect(motivoRegraIncompativel(HipoteseCredenciamento.PARALELA_NAO_EXCLUDENTE, RegraDistribuicao.DIVISAO_IGUALITARIA)).toBeNull();
      expect(motivoRegraIncompativel(HipoteseCredenciamento.PARALELA_NAO_EXCLUDENTE, RegraDistribuicao.ESCOLHA_BENEFICIARIO)).toMatch(/não se aplica/);
      expect(motivoRegraIncompativel(HipoteseCredenciamento.SELECAO_POR_TERCEIROS, RegraDistribuicao.ESCOLHA_BENEFICIARIO)).toBeNull();
      expect(motivoRegraIncompativel(HipoteseCredenciamento.SELECAO_POR_TERCEIROS, RegraDistribuicao.RODIZIO)).toMatch(/não se aplica/);
      expect(motivoRegraIncompativel(HipoteseCredenciamento.MERCADO_FLUIDO, RegraDistribuicao.COTACAO_MERCADO)).toBeNull();
      expect(motivoRegraIncompativel('X', RegraDistribuicao.RODIZIO)).toMatch(/hipótese/);
    });
  });

  describe('edital de chamamento (pré-condição do PUBLICAR)', () => {
    const agora = new Date('2026-10-01T12:00:00Z');
    const base = {
      hipotese: HipoteseCredenciamento.PARALELA_NAO_EXCLUDENTE,
      regra_distribuicao: RegraDistribuicao.RODIZIO,
      vigencia_inicio: '2026-10-01T00:00:00Z',
      vigencia_fim: '2027-10-01T00:00:00Z',
      condicoes_padronizadas: 'Pagamento em 30 dias; execução conforme TR.',
      prazo_denuncia_dias: 30,
      itens: [{ numero_item: 1, valor_unitario_estimado: 150 }],
    };
    it('completo → sem pendências', () => {
      expect(pendenciasEditalCredenciamento(base, agora)).toEqual([]);
    });
    it('sem configuração, vigência invertida/vencida, sem condições, sem denúncia, item sem valor (I/II)', () => {
      expect(pendenciasEditalCredenciamento(null, agora)[0]).toMatch(/Configure/);
      const p = pendenciasEditalCredenciamento(
        { ...base, vigencia_fim: '2026-09-01T00:00:00Z', condicoes_padronizadas: '', prazo_denuncia_dias: null, itens: [{ numero_item: 1, valor_unitario_estimado: 0 }] },
        agora,
      );
      expect(p.join(' | ')).toMatch(/posterior ao início/);
      expect(p.join(' | ')).toMatch(/já terminou/);
      expect(p.join(' | ')).toMatch(/condições padronizadas/);
      expect(p.join(' | ')).toMatch(/denúncia/);
      expect(p.join(' | ')).toMatch(/valor da contratação/);
    });
    it('mercado fluido (III): valor só de referência (cotação no momento), mas o PNCP exige a estimativa', () => {
      const iii = { ...base, hipotese: HipoteseCredenciamento.MERCADO_FLUIDO, regra_distribuicao: RegraDistribuicao.COTACAO_MERCADO };
      expect(pendenciasEditalCredenciamento(iii, agora)).toEqual([]);
      const p = pendenciasEditalCredenciamento({ ...iii, itens: [{ numero_item: 1, valor_unitario_estimado: 0 }] }, agora);
      expect(p.join(' | ')).toMatch(/valor estimado de referência/);
    });
  });

  describe('inscrição a qualquer tempo durante a vigência (art. 79 par. único I)', () => {
    const vig = { inicio: '2026-10-01T00:00:00Z', fim: '2026-12-31T23:59:59Z' };
    it('aberta dentro da vigência; fechada antes, depois, suspensa, concluída ou na fase interna', () => {
      const lic = { fase: 'ACOLHIMENTO_PROPOSTAS', situacao: 'ATIVA' };
      expect(motivoNaoInscreve(lic, vig, new Date('2026-11-15T12:00:00Z'))).toBeNull();
      expect(motivoNaoInscreve(lic, vig, new Date('2026-09-30T12:00:00Z'))).toMatch(/abrem em/);
      expect(motivoNaoInscreve(lic, vig, new Date('2027-01-01T12:00:00Z'))).toMatch(/terminou/);
      expect(motivoNaoInscreve({ ...lic, situacao: 'SUSPENSA' }, vig, new Date('2026-11-15T12:00:00Z'))).toMatch(/suspenso/);
      expect(motivoNaoInscreve({ ...lic, situacao: 'CONCLUIDA' }, vig, new Date('2026-11-15T12:00:00Z'))).toMatch(/terminou/);
      expect(motivoNaoInscreve({ fase: 'PLANEJAMENTO', situacao: 'ATIVA' }, vig, new Date('2026-11-15T12:00:00Z'))).toMatch(/não publicado/);
    });
  });

  describe('vigência e validade', () => {
    it('validade = credenciamento + meses do edital, nunca além da vigência; sem meses → fim da vigência', () => {
      const em = new Date('2026-10-10T12:00:00Z');
      expect(validadeDoCredenciado(em, 3, '2027-10-01T00:00:00Z')!.toISOString()).toBe('2027-01-10T12:00:00.000Z');
      expect(validadeDoCredenciado(em, 24, '2027-10-01T00:00:00Z')!.toISOString()).toBe('2027-10-01T00:00:00.000Z');
      expect(validadeDoCredenciado(em, null, '2027-10-01T00:00:00Z')!.toISOString()).toBe('2027-10-01T00:00:00.000Z');
    });
    it('elegível: credenciado, na validade, sem denúncia com efeito', () => {
      const agora = new Date('2026-11-01T12:00:00Z');
      const ok = { id: 'a', fornecedor_id: 'f', status: StatusInscricao.CREDENCIADO, ordem_rodizio: 1, validade_ate: '2027-01-01', descredenciamento_efeitos_em: null };
      expect(motivoInelegivel(ok, agora)).toBeNull();
      expect(motivoInelegivel({ ...ok, validade_ate: '2026-10-01' }, agora)).toMatch(/validade/);
      expect(motivoInelegivel({ ...ok, status: StatusInscricao.PENDENTE }, agora)).toMatch(/não está credenciado/);
      expect(motivoInelegivel({ ...ok, descredenciamento_efeitos_em: '2026-12-01' }, agora)).toBeNull(); // aviso prévio correndo
      expect(motivoInelegivel({ ...ok, descredenciamento_efeitos_em: '2026-10-15' }, agora)).toMatch(/denúncia/);
      expect(statusEfetivoInscricao({ ...ok, descredenciamento_efeitos_em: '2026-10-15' }, agora)).toBe(StatusInscricao.DESCREDENCIADO);
    });
    it('denúncia: efeito depois do aviso do edital; descumprimento: imediato', () => {
      const agora = new Date('2026-11-01T12:00:00Z');
      expect(efeitoDoDescredenciamento(IniciativaDescredenciamento.ADMINISTRACAO_DESCUMPRIMENTO, agora, 30)).toEqual(agora);
      expect(efeitoDoDescredenciamento(IniciativaDescredenciamento.CREDENCIADO_DENUNCIA, agora, 30).toISOString()).toBe('2026-12-01T12:00:00.000Z');
    });
    it('recurso contra o indeferimento: 3 dias úteis (art. 165 I, contagem do art. 183, feriado do órgão)', () => {
      // sexta 09/10/2026 → seg 12/10 é feriado nacional → 13 (1), 14 (2), 15 (3)
      const cal = criarCalendario([]);
      const fimSemFeriado = prazoRecursoInscricao(new Date('2026-10-09T15:00:00Z'), cal);
      expect(fimSemFeriado.toISOString()).toBe('2026-10-15T02:59:59.999Z'); // 14/10 23:59:59 Brasília
      const fimNacional = prazoRecursoInscricao(new Date('2026-10-09T15:00:00Z'));
      expect(fimNacional.toISOString()).toBe('2026-10-16T02:59:59.999Z'); // 12/10 não conta → 15/10 23:59:59
    });
  });

  describe('recurso contra o indeferimento em duas instâncias (art. 165 I "a" e §2º)', () => {
    const cal = criarCalendario([]);
    it('reconsideração do agente em 3 dias úteis; autoridade em 10 dias úteis do encaminhamento', () => {
      // quinta 01/10/2026 → 02 (1), 05 (2), 06 (3)
      expect(prazoReconsideracaoInscricao(new Date('2026-10-01T15:00:00Z'), cal).toISOString()).toBe('2026-10-07T02:59:59.999Z');
      // quinta 01/10/2026 + 10 dias úteis (sem feriados) → 15/10
      expect(prazoAutoridadeInscricao(new Date('2026-10-01T15:00:00Z'), cal).toISOString()).toBe('2026-10-16T02:59:59.999Z');
    });
    it('rito: agente só reconsidera recurso interposto; autoridade só decide o recurso mantido', () => {
      expect(motivoNaoReconsidera(StatusRecursoInscricao.INTERPOSTO)).toBeNull();
      expect(motivoNaoReconsidera(null)).toMatch(/Não há recurso/);
      expect(motivoNaoReconsidera(StatusRecursoInscricao.AGUARDANDO_AUTORIDADE)).toMatch(/Não há recurso/);
      expect(motivoNaoDecideAutoridade(StatusRecursoInscricao.AGUARDANDO_AUTORIDADE)).toBeNull();
      expect(motivoNaoDecideAutoridade(StatusRecursoInscricao.INTERPOSTO)).toMatch(/agente precisa manter/);
      expect(motivoNaoDecideAutoridade(StatusRecursoInscricao.PROVIDO)).toMatch(/não está aguardando/);
    });
    it('atrasos do agente/autoridade são só sinalizados', () => {
      const agora = new Date('2026-11-01T12:00:00Z');
      expect(atrasosRecursoInscricao({ recurso_status: 'INTERPOSTO', recurso_prazo_reconsideracao: '2026-10-20T00:00:00Z' }, agora)).toEqual({ reconsideracaoAtrasada: true, autoridadeAtrasada: false });
      expect(atrasosRecursoInscricao({ recurso_status: 'AGUARDANDO_AUTORIDADE', recurso_prazo_autoridade: '2026-12-01T00:00:00Z' }, agora)).toEqual({ reconsideracaoAtrasada: false, autoridadeAtrasada: false });
    });
  });

  describe('distribuição da demanda', () => {
    it('RODÍZIO: fila na ordem do credenciamento; volta ao início; novo credenciado entra no fim', () => {
      const fila = [c('b', 2), c('a', 1), c('c', 3)];
      expect(proximoDoRodizio(fila, null).escolhido.inscricaoId).toBe('a');
      expect(proximoDoRodizio(fila, 1).escolhido.inscricaoId).toBe('b');
      expect(proximoDoRodizio(fila, 2).escolhido.inscricaoId).toBe('c');
      expect(proximoDoRodizio(fila, 3).escolhido.inscricaoId).toBe('a'); // volta ao início
      // "d" credenciado depois (ordem 4): entra no fim — a vez de "a" não muda
      const comD = [...fila, c('d', 4)];
      expect(proximoDoRodizio(comD, 3).escolhido.inscricaoId).toBe('d');
      expect(proximoDoRodizio(comD, 4).escolhido.inscricaoId).toBe('a');
      // "b" descredenciado: sai da fila sem mudar a vez dos demais
      expect(proximoDoRodizio([c('a', 1), c('c', 3)], 1).escolhido.inscricaoId).toBe('c');
      expect(proximoDoRodizio(fila, null).fila.map((x) => x.inscricaoId)).toEqual(['a', 'b', 'c']);
      expect(() => proximoDoRodizio([], null)).toThrow(/Nenhum credenciado/);
    });

    it('SORTEIO: determinístico pela entrada pública, conferível, independe da ordem de chegada', () => {
      const atoEm = new Date('2026-11-02T13:00:00Z');
      const s1 = sorteioDaDemanda({ licitacaoId: 'L', contratacaoId: 'D1', candidatos: ['x', 'y', 'z'], atoEm });
      const s2 = sorteioDaDemanda({ licitacaoId: 'L', contratacaoId: 'D1', candidatos: ['z', 'x', 'y'], atoEm });
      expect(s1.ordem).toEqual(s2.ordem);
      expect(s1.entrada).toContain('CREDENCIAMENTO');
      expect(s1.entrada).toContain('unidade=D1');
      expect(conferirSorteio(s1)).toBe(true);
      expect(conferirSorteio({ ...s1, semente: '0'.repeat(64) })).toBe(false);
      // outra demanda (outra entrada) → sorteio próprio
      const s3 = sorteioDaDemanda({ licitacaoId: 'L', contratacaoId: 'D2', candidatos: ['x', 'y', 'z'], atoEm });
      expect(s3.semente).not.toBe(s1.semente);
    });

    it('DIVISÃO IGUALITÁRIA: menor valor contratado; empate → menos contratações → ordem', () => {
      expect(escolhaDivisaoIgualitaria([c('a', 1, { valorContratado: 500 }), c('b', 2, { valorContratado: 100 })]).inscricaoId).toBe('b');
      expect(escolhaDivisaoIgualitaria([c('a', 1, { valorContratado: 100, contratacoes: 2 }), c('b', 2, { valorContratado: 100, contratacoes: 1 })]).inscricaoId).toBe('b');
      expect(escolhaDivisaoIgualitaria([c('b', 2), c('a', 1)]).inscricaoId).toBe('a');
    });

    it('COTAÇÃO (mercado fluido): menor cotação válida', () => {
      expect(
        escolhaPorCotacao([
          { inscricaoId: 'a', valorUnitario: 12.5 },
          { inscricaoId: 'b', valorUnitario: 11.9 },
          { inscricaoId: 'c', valorUnitario: 0 },
        ]).inscricaoId,
      ).toBe('b');
      expect(() => escolhaPorCotacao([])).toThrow(/cotação/);
    });
  });
});
