import { criarCalendario, CALENDARIO_NACIONAL } from '../common/prazos/calendario';
import { feriadoContaParaOrgao, LinhaFeriado, motivoFeriadoInvalido } from '../feriados/regras-feriados';
import {
  avaliarPrazosDePublicacao,
  camposDoEditalAlterados,
  exigeNaturezaDoObjeto,
  pendenciasDaRetificacao,
  prazoMinimoDeDivulgacao,
} from './regras-publicacao';

const bsb = (iso: string, hora = '10:00') => new Date(`${iso}T${hora}:00-03:00`);
const iso = (d: Date | null) => (d ? d.toISOString() : null);

describe('art. 55 — prazo mínimo por modalidade/objeto/critério (E7a)', () => {
  it.each([
    // [descrição, dados, dias, fundamento]
    ['pregão de bens, menor preço', { modalidade: 'PREGAO_ELETRONICO', tipo_contratacao: 'COMPRA', criterio_julgamento: 'MENOR_PRECO' }, 8, 'art. 55, I, a'],
    ['pregão de bens, maior desconto', { modalidade: 'PREGAO_ELETRONICO', tipo_contratacao: 'COMPRA', criterio_julgamento: 'MAIOR_DESCONTO' }, 8, 'art. 55, I, a'],
    ['pregão de serviço (comum implícito)', { modalidade: 'PREGAO_ELETRONICO', tipo_contratacao: 'SERVICO', criterio_julgamento: 'MENOR_PRECO' }, 10, 'art. 55, II, a'],
    ['pregão de serviço comum de engenharia', { modalidade: 'PREGAO_ELETRONICO', tipo_contratacao: 'SERVICO_ENGENHARIA', criterio_julgamento: 'MENOR_PRECO' }, 10, 'art. 55, II, a'],
    ['concorrência obra comum', { modalidade: 'CONCORRENCIA', tipo_contratacao: 'OBRA', criterio_julgamento: 'MENOR_PRECO', natureza_objeto: 'COMUM' }, 10, 'art. 55, II, a'],
    ['concorrência serviço especial', { modalidade: 'CONCORRENCIA', tipo_contratacao: 'SERVICO', criterio_julgamento: 'MENOR_PRECO', natureza_objeto: 'ESPECIAL' }, 25, 'art. 55, II, b'],
    ['concorrência obra, contratação integrada', { modalidade: 'CONCORRENCIA', tipo_contratacao: 'OBRA', criterio_julgamento: 'MENOR_PRECO', regime_execucao: 'CONTRATACAO_INTEGRADA' }, 60, 'art. 55, II, c'],
    ['concorrência obra, semi-integrada', { modalidade: 'CONCORRENCIA', tipo_contratacao: 'OBRA', criterio_julgamento: 'MENOR_PRECO', regime_execucao: 'CONTRATACAO_SEMI_INTEGRADA' }, 35, 'art. 55, II, d'],
    ['concorrência serviço, técnica e preço', { modalidade: 'CONCORRENCIA', tipo_contratacao: 'SERVICO', criterio_julgamento: 'TECNICA_E_PRECO' }, 35, 'art. 55, IV'],
    ['concorrência serviço, maior retorno econômico', { modalidade: 'CONCORRENCIA', tipo_contratacao: 'SERVICO', criterio_julgamento: 'MAIOR_RETORNO_ECONOMICO' }, 35, 'art. 55, II, d'],
    ['concorrência de bens, técnica e preço (maior entre I b e IV)', { modalidade: 'CONCORRENCIA', tipo_contratacao: 'COMPRA', criterio_julgamento: 'TECNICA_E_PRECO' }, 35, 'art. 55, IV'],
    ['concorrência de bens, melhor técnica', { modalidade: 'CONCORRENCIA', tipo_contratacao: 'COMPRA', criterio_julgamento: 'MELHOR_TECNICA' }, 35, 'art. 55, IV'],
    ['leilão (maior lance)', { modalidade: 'LEILAO', tipo_contratacao: 'ALIENACAO', criterio_julgamento: 'MAIOR_LANCE' }, 15, 'art. 55, III'],
    ['concurso (melhor técnica/conteúdo artístico)', { modalidade: 'CONCURSO', tipo_contratacao: 'SERVICO', criterio_julgamento: 'MELHOR_TECNICA' }, 35, 'art. 55, IV'],
    ['diálogo competitivo (manifestação de interesse)', { modalidade: 'DIALOGO_COMPETITIVO', tipo_contratacao: 'SERVICO', criterio_julgamento: 'TECNICA_E_PRECO' }, 25, 'art. 32, §1º, I'],
    ['dispensa eletrônica', { modalidade: 'DISPENSA_ELETRONICA', tipo_contratacao: 'COMPRA' }, 3, 'art. 75, §3º'],
  ])('%s → %i dias úteis', (_d, dados: any, dias, fundamento) => {
    const p = prazoMinimoDeDivulgacao(dados);
    expect(p.dias).toBe(dias);
    expect(p.fundamento).toContain(fundamento);
    expect(p.pendencias).toEqual([]);
  });

  it('inexigibilidade: sem prazo mínimo de divulgação', () => {
    expect(prazoMinimoDeDivulgacao({ modalidade: 'INEXIGIBILIDADE' }).dias).toBeNull();
  });

  it('concorrência de serviço por menor preço sem "comum × especial" → pendência (campo exigido na publicação)', () => {
    const d = { modalidade: 'CONCORRENCIA', tipo_contratacao: 'SERVICO', criterio_julgamento: 'MENOR_PRECO' };
    expect(exigeNaturezaDoObjeto(d)).toBe(true);
    const p = prazoMinimoDeDivulgacao(d);
    expect(p.dias).toBeNull();
    expect(p.pendencias.join(' ')).toMatch(/COMUM ou ESPECIAL/);
  });

  it('pregão com objeto especial ou obra → pendência (art. 29)', () => {
    expect(prazoMinimoDeDivulgacao({ modalidade: 'PREGAO_ELETRONICO', tipo_contratacao: 'SERVICO', natureza_objeto: 'ESPECIAL' }).pendencias.join(' ')).toMatch(/COMUNS/);
    expect(prazoMinimoDeDivulgacao({ modalidade: 'PREGAO_ELETRONICO', tipo_contratacao: 'OBRA' }).pendencias.join(' ')).toMatch(/obras/);
  });
});

describe('avaliação do cronograma de publicação (E7a)', () => {
  const pregaoBens = { modalidade: 'PREGAO_ELETRONICO', tipo_contratacao: 'COMPRA', criterio_julgamento: 'MENOR_PRECO' };
  const agora = bsb('2026-09-25', '09:00'); // sexta

  it('pregão de bens publicado sex 25/09/2026: 8 dias úteis vencem qua 07/10 → abertura a partir de qui 08/10', () => {
    const av = avaliarPrazosDePublicacao(pregaoBens, { data_abertura_sessao: bsb('2026-10-08', '09:00') }, agora, { cal: CALENDARIO_NACIONAL });
    expect(iso(av.vencimento)).toBe(iso(new Date('2026-10-07T23:59:59.999-03:00')));
    expect(iso(av.minimo_abertura)).toBe(iso(new Date('2026-10-08T00:00:00-03:00')));
    expect(av.pendencias).toEqual([]);
    const cedo = avaliarPrazosDePublicacao(pregaoBens, { data_abertura_sessao: bsb('2026-10-07', '15:00') }, agora, { cal: CALENDARIO_NACIONAL });
    expect(cedo.pendencias.join(' ')).toMatch(/Prazo mínimo de 8 dias úteis.*art\. 55, I, a/);
  });

  it('feriado municipal do órgão desloca a data mínima', () => {
    const cal = criarCalendario([{ descricao: 'Padroeira', data: '2026-10-06' }]);
    const av = avaliarPrazosDePublicacao(pregaoBens, { data_abertura_sessao: bsb('2026-10-08', '09:00') }, agora, { cal });
    expect(iso(av.minimo_abertura)).toBe(iso(new Date('2026-10-09T00:00:00-03:00')));
    expect(av.pendencias.join(' ')).toMatch(/8 dias úteis/);
  });

  it('data de publicação retroativa não encurta o prazo (conta de agora)', () => {
    const av = avaliarPrazosDePublicacao(
      pregaoBens,
      { data_publicacao_edital: bsb('2026-09-01'), data_abertura_sessao: bsb('2026-10-02') },
      agora,
      { cal: CALENDARIO_NACIONAL },
    );
    expect(av.pendencias.join(' ')).toMatch(/8 dias úteis/);
  });

  it('ordem das datas: início < fim ≤ abertura; limite de impugnação antes da abertura e não antes do art. 164', () => {
    const av = avaliarPrazosDePublicacao(
      pregaoBens,
      {
        data_publicacao_edital: agora,
        data_inicio_acolhimento: bsb('2026-10-20'),
        data_fim_acolhimento: bsb('2026-10-19'),
        data_abertura_sessao: bsb('2026-10-15'),
        data_limite_impugnacao: bsb('2026-10-06'),
      },
      agora,
      { cal: CALENDARIO_NACIONAL },
    );
    const t = av.pendencias.join(' | ');
    expect(t).toMatch(/início do recebimento de propostas deve ser anterior ao fim/);
    expect(t).toMatch(/terminar até a abertura/);
    expect(t).toMatch(/não pode encurtar o prazo de impugnação/);
  });

  it('dispensa: 3 dias úteis até o fim do recebimento', () => {
    const av = avaliarPrazosDePublicacao({ modalidade: 'DISPENSA_ELETRONICA' }, { data_fim_acolhimento: bsb('2026-09-29') }, agora, {
      cal: CALENDARIO_NACIONAL,
    });
    expect(av.pendencias.join(' ')).toMatch(/3 dias úteis/);
    expect(avaliarPrazosDePublicacao({ modalidade: 'DISPENSA_ELETRONICA' }, { data_fim_acolhimento: bsb('2026-10-01') }, agora, { cal: CALENDARIO_NACIONAL }).pendencias).toEqual([]);
  });

  it('exigirDatas: pregão sem abertura → pendência', () => {
    const av = avaliarPrazosDePublicacao(pregaoBens, {}, agora, { exigirDatas: true, cal: CALENDARIO_NACIONAL });
    expect(av.pendencias.join(' ')).toMatch(/abertura da sessão/);
  });
});

describe('retificação (art. 55 §1º)', () => {
  const pregao = { modalidade: 'PREGAO_ELETRONICO', tipo_contratacao: 'COMPRA', criterio_julgamento: 'MENOR_PRECO' };
  const atual = { data_publicacao_edital: bsb('2026-09-10'), data_fim_acolhimento: bsb('2026-10-01'), data_abertura_sessao: bsb('2026-10-01') };
  const agora = bsb('2026-09-25', '09:00');

  it('afeta propostas: exige novo cronograma com 8 dias úteis contados da retificação', () => {
    expect(pendenciasDaRetificacao(pregao, atual, { alteracoes: 'Alterada a especificação do item 1', afeta_propostas: true }, agora, CALENDARIO_NACIONAL).join(' ')).toMatch(/novo cronograma/);
    const curto = pendenciasDaRetificacao(
      pregao,
      atual,
      { alteracoes: 'Alterada a especificação do item 1', afeta_propostas: true, cronograma: { data_fim_acolhimento: bsb('2026-10-05'), data_abertura_sessao: bsb('2026-10-05') } },
      agora,
      CALENDARIO_NACIONAL,
    );
    expect(curto.join(' ')).toMatch(/Republicação: Prazo mínimo de 8 dias úteis/);
    const ok = pendenciasDaRetificacao(
      pregao,
      atual,
      { alteracoes: 'Alterada a especificação do item 1', afeta_propostas: true, cronograma: { data_fim_acolhimento: bsb('2026-10-08'), data_abertura_sessao: bsb('2026-10-08') } },
      agora,
      CALENDARIO_NACIONAL,
    );
    expect(ok).toEqual([]);
  });

  it('não afeta: exige justificativa e não admite antecipar datas', () => {
    const p = pendenciasDaRetificacao(
      pregao,
      atual,
      { alteracoes: 'Corrigido erro de digitação no preâmbulo', afeta_propostas: false, cronograma: { data_abertura_sessao: bsb('2026-09-30') } },
      agora,
      CALENDARIO_NACIONAL,
    ).join(' | ');
    expect(p).toMatch(/Justifique/);
    expect(p).toMatch(/mantidas ou adiadas/);
    expect(
      pendenciasDaRetificacao(pregao, atual, { alteracoes: 'Corrigido erro de digitação no preâmbulo', afeta_propostas: false, justificativa_nao_afeta: 'Erro material sem efeito nas propostas' }, agora, CALENDARIO_NACIONAL),
    ).toEqual([]);
  });

  it('decisão "afeta?" é obrigatória', () => {
    expect(pendenciasDaRetificacao(pregao, atual, { alteracoes: 'Alteração qualquer do edital' }, agora).join(' ')).toMatch(/afeta a formulação/);
  });
});

describe('edição depois da publicação e cadastro de feriados', () => {
  it('só campos do edital que MUDARAM contam (formulário inteiro reenviado passa)', () => {
    const atual = { objeto: 'Papel A4', observacoes: 'x', data_abertura_sessao: '2026-10-10T09:00:00', valor_total_estimado: '100.00' };
    expect(camposDoEditalAlterados(atual, { objeto: 'Papel A4', valor_total_estimado: 100, observacoes: 'y' })).toEqual([]);
    expect(camposDoEditalAlterados(atual, { objeto: 'Papel A3' })).toEqual(['objeto']);
  });

  it('ponto facultativo só conta com adoção do órgão; estadual só na UF; o do órgão sempre', () => {
    const base: LinhaFeriado = { id: 'f1', descricao: 'Carnaval', data: null, movel: 'CARNAVAL_SEGUNDA', recorrente: true, abrangencia: 'NACIONAL', uf: null, orgao_id: null, ponto_facultativo: true, ativo: true };
    expect(feriadoContaParaOrgao(base, 'O', 'BA', new Set())).toBe(false);
    expect(feriadoContaParaOrgao(base, 'O', 'BA', new Set(['f1']))).toBe(true);
    const estadual = { ...base, id: 'e', abrangencia: 'ESTADUAL', uf: 'BA', ponto_facultativo: false, movel: null, data: '2000-07-02' };
    expect(feriadoContaParaOrgao(estadual, 'O', 'BA', new Set())).toBe(true);
    expect(feriadoContaParaOrgao(estadual, 'O', 'SP', new Set())).toBe(false);
    const proprio = { ...base, id: 'p', orgao_id: 'O', abrangencia: 'MUNICIPAL' };
    expect(feriadoContaParaOrgao(proprio, 'O', 'BA', new Set())).toBe(true);
    expect(feriadoContaParaOrgao(proprio, 'X', 'BA', new Set())).toBe(false);
    expect(motivoFeriadoInvalido({ descricao: 'Aniversário', data: '2026-02-30' })).toMatch(/inexistente|obrigatória/);
    expect(motivoFeriadoInvalido({ descricao: 'Aniversário', data: '2026-09-29' })).toBeNull();
  });
});
