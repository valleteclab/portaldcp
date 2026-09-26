import { linhasDoChecklist } from '../documentos-obrigatorios';
import {
  checklistIncremental,
  criterioPadraoDaModalidade,
  lerClassificacao,
  planejarJuntada,
  validarDadosExternos,
  validarItensExternos,
  valorDosItensExternos,
} from './externa-regras';

const AGORA = new Date('2026-09-26T15:00:00-03:00');
const DIRETA = linhasDoChecklist({ contratacao_direta: true });
const RITO = linhasDoChecklist({ contratacao_direta: false });
const arq = (...nomes: string[]) => nomes.map((nome) => ({ nome }));
const peca = (arquivo: number, tipo: string, extra: Record<string, unknown> = {}) => ({ arquivo, tipo, data_documento: '2026-09-10', numero_peca: `${tipo} 1/2026`, ...extra });

describe('fase interna feita fora — mapeamento arquivo → peça (planejarJuntada)', () => {
  it('6 PDFs + ETP e riscos "não se aplica": plano na ordem lógica (despacho depois do art. 72, I, II e IV)', () => {
    const r = planejarJuntada({
      arquivos: arq('parecer.pdf', 'despacho.pdf', 'dfd.pdf', 'tr.pdf', 'mapa.pdf', 'dotacao.pdf'),
      classificacao: {
        pecas: [peca(0, 'PJ'), peca(1, 'AA'), peca(2, 'DFD'), peca(3, 'TR'), peca(4, 'PP'), peca(5, 'DO')],
        nao_se_aplica: [
          { tipo: 'ETP', justificativa: 'Objeto simples, sem necessidade de estudo.' },
          { tipo: 'AR', justificativa: 'Objeto simples, sem riscos relevantes.' },
        ],
        usar_portaria_orgao: false,
      },
      contratacao_direta: true,
      checklist: DIRETA,
      exigir_arquivo: true,
      agora: AGORA,
    });
    expect(r.erros).toEqual([]);
    expect(r.acoes.map((a) => `${a.acao}:${a.tipo}`)).toEqual([
      'ANEXAR:DFD',
      'NAO_SE_APLICA:ETP',
      'NAO_SE_APLICA:AR',
      'ANEXAR:TR',
      'ANEXAR:PP',
      'ANEXAR:DO',
      'ANEXAR:AA',
      'ANEXAR:PJ',
    ]);
    const aa = r.acoes.find((a) => a.tipo === 'AA');
    expect(aa).toMatchObject({ acao: 'ANEXAR', arquivo: 1, data_documento: '2026-09-10', numero_peca: 'AA 1/2026' });
    expect(r.checklist.completo).toBe(true);
    expect(r.checklist.antes_da_autorizacao).toEqual([]);
  });

  it('arquivo sem peça, classificado duas vezes, peça desconhecida e dois arquivos para a mesma peça', () => {
    const r = planejarJuntada({
      arquivos: arq('a.pdf', 'b.pdf', 'c.pdf', 'd.pdf', 'e.pdf'),
      classificacao: {
        pecas: [peca(0, 'DFD'), peca(1, 'DFD'), peca(2, 'XYZ'), peca(3, 'TR'), peca(3, 'PP'), peca(9, 'PJ')],
        nao_se_aplica: [],
        usar_portaria_orgao: false,
      },
      contratacao_direta: true,
      checklist: DIRETA,
      agora: AGORA,
    });
    const msgs = r.erros.map((e) => e.mensagem).join('\n');
    expect(msgs).toMatch(/arquivo que não foi enviado/);
    expect(msgs).toMatch(/Dois arquivos para a mesma peça .*"a\.pdf" e "b\.pdf"/);
    expect(msgs).toMatch(/Peça desconhecida para o arquivo "c\.pdf"/);
    expect(msgs).toMatch(/"d\.pdf" foi classificado mais de uma vez/);
    expect(msgs).toMatch(/Escolha qual peça é o arquivo "e\.pdf"/);
    expect(r.erros.every((e) => e.passo === 'DOCUMENTOS')).toBe(true);
    expect(r.ok).toBe(false);
  });

  it('data do documento obrigatória e não futura (a mesma regra do anexo por peça)', () => {
    const r = planejarJuntada({
      arquivos: arq('dfd.pdf', 'tr.pdf'),
      classificacao: { pecas: [peca(0, 'DFD', { data_documento: '' }), peca(1, 'TR', { data_documento: '2026-09-27' })], nao_se_aplica: [], usar_portaria_orgao: false },
      contratacao_direta: true,
      checklist: DIRETA,
      agora: AGORA,
    });
    expect(r.erros.find((e) => e.indice === 0)?.mensagem).toMatch(/Informe a data do documento/);
    expect(r.erros.find((e) => e.indice === 1)?.mensagem).toMatch(/não pode ser futura/);
  });

  it('"não se aplica": só onde a lei permite, com justificativa, e nunca junto com o PDF da mesma peça', () => {
    const r = planejarJuntada({
      arquivos: arq('tr.pdf'),
      classificacao: {
        pecas: [peca(0, 'TR')],
        nao_se_aplica: [
          { tipo: 'DFD', justificativa: 'Não precisa' },
          { tipo: 'TR', justificativa: 'Objeto simples, sem TR.' },
          { tipo: 'ETP', justificativa: '' },
        ],
        usar_portaria_orgao: false,
      },
      contratacao_direta: true,
      checklist: DIRETA,
      agora: AGORA,
    });
    const msgs = r.erros.map((e) => e.mensagem).join('\n');
    expect(msgs).toMatch(/Formalização da demanda \(DFD\)" não admite "não se aplica".*obrigatória/);
    expect(msgs).toMatch(/Termo de Referência \(TR\)" foi juntada e também marcada/);
    expect(msgs).toMatch(/Justifique por que "Estudo Técnico Preliminar \(ETP\)" não se aplica/);
  });

  it('rito completo (art. 18) não admite "não se aplica"', () => {
    const r = planejarJuntada({
      arquivos: arq('dfd.pdf'),
      classificacao: { pecas: [peca(0, 'DFD')], nao_se_aplica: [{ tipo: 'ETP', justificativa: 'Objeto simples, sem estudo.' }], usar_portaria_orgao: false },
      contratacao_direta: false,
      checklist: RITO,
      agora: AGORA,
    });
    expect(r.erros[0].mensagem).toMatch(/não admite "não se aplica"/);
  });

  it('despacho de autorização sem o que o art. 72 exige antes (portão B): recusado com o que falta', () => {
    const r = planejarJuntada({
      arquivos: arq('dfd.pdf', 'despacho.pdf'),
      classificacao: { pecas: [peca(0, 'DFD'), peca(1, 'AA')], nao_se_aplica: [], usar_portaria_orgao: false },
      contratacao_direta: true,
      checklist: DIRETA,
      agora: AGORA,
    });
    const e = r.erros.find((x) => x.indice === 1);
    expect(e?.mensagem).toMatch(/Para juntar o despacho de autorização/);
    expect(e?.mensagem).toMatch(/Art\. 72, I — Estudo Técnico Preliminar \(ETP\), Análise de riscos, Termo de Referência \(TR\)/);
    expect(e?.mensagem).toMatch(/Art\. 72, II — Estimativa de despesa/);
    expect(e?.mensagem).toMatch(/Art\. 72, IV — Compatibilidade orçamentária/);
  });

  it('processo existente: o que já está pronto conta para o portão B; "não se aplica" de peça pronta é recusado', () => {
    const ok = planejarJuntada({
      arquivos: arq('despacho.pdf'),
      classificacao: { pecas: [peca(0, 'AA')], nao_se_aplica: [], usar_portaria_orgao: false },
      contratacao_direta: true,
      checklist: DIRETA,
      ja_prontas: ['DFD', 'TR', 'PP', 'DO'],
      ja_nao_se_aplica: ['ETP', 'AR'],
      agora: AGORA,
    });
    expect(ok.erros).toEqual([]);
    const nsa = planejarJuntada({
      arquivos: [],
      classificacao: { pecas: [], nao_se_aplica: [{ tipo: 'TR', justificativa: 'Objeto simples, sem TR.' }], usar_portaria_orgao: false },
      contratacao_direta: true,
      checklist: DIRETA,
      ja_prontas: ['TR'],
      agora: AGORA,
    });
    expect(nsa.erros[0].mensagem).toMatch(/já está pronta no processo/);
  });

  it('portaria do órgão: vira ação própria (sem arquivo); PDF da portaria e "usar a do órgão" juntos é recusado', () => {
    const r = planejarJuntada({
      arquivos: arq('dfd.pdf'),
      classificacao: { pecas: [peca(0, 'DFD')], nao_se_aplica: [], usar_portaria_orgao: true },
      contratacao_direta: true,
      checklist: DIRETA,
      agora: AGORA,
    });
    expect(r.acoes.map((a) => a.acao)).toEqual(['ANEXAR', 'PORTARIA_ORGAO']);
    expect(r.checklist.linhas.find((l) => l.tipo === 'DP')).toMatchObject({ status: 'OK', origem: 'PORTARIA_ORGAO' });
    const dup = planejarJuntada({
      arquivos: arq('portaria.pdf'),
      classificacao: { pecas: [peca(0, 'DP')], nao_se_aplica: [], usar_portaria_orgao: true },
      contratacao_direta: true,
      checklist: DIRETA,
      agora: AGORA,
    });
    expect(dup.erros[0].mensagem).toMatch(/escolha uma das duas/);
  });

  it('processo novo exige ao menos um PDF', () => {
    const r = planejarJuntada({ arquivos: [], classificacao: lerClassificacao('{}'), contratacao_direta: true, checklist: DIRETA, exigir_arquivo: true, agora: AGORA });
    expect(r.erros[0].mensagem).toMatch(/Envie os PDFs/);
  });

  it('lerClassificacao: JSON do multipart; ilegível → erro', () => {
    const c = lerClassificacao(JSON.stringify({ pecas: [{ arquivo: '0', tipo: 'dfd', signatarios: [{ nome: 'Ana', cargo: 'Diretora' }] }], usar_portaria_orgao: 'true' }));
    expect(c).toMatchObject({ pecas: [{ arquivo: 0, tipo: 'DFD' }], nao_se_aplica: [], usar_portaria_orgao: true });
    expect(() => lerClassificacao('{x')).toThrow(/ilegível/);
  });
});

describe('fase interna feita fora — checklist incremental', () => {
  it('conforme os arquivos são classificados: obrigatórias pendentes, fora do checklist e o que falta antes da autorização', () => {
    const vazio = checklistIncremental({ contratacao_direta: true, checklist: DIRETA, classificadas: [] });
    expect(vazio.completo).toBe(false);
    expect(vazio.obrigatorias_pendentes).toHaveLength(3); // DFD, estimativa, autorização
    expect(vazio.antes_da_autorizacao).toHaveLength(3); // art. 72, I, II e IV

    const meio = checklistIncremental({ contratacao_direta: true, checklist: DIRETA, classificadas: ['DFD', 'PP', 'OUT'], nao_se_aplica: ['ETP', 'AR', 'TR'] });
    expect(meio.linhas.find((l) => l.tipo === 'DFD')).toMatchObject({ status: 'OK', origem: 'ARQUIVO' });
    expect(meio.linhas.find((l) => l.tipo === 'ETP')).toMatchObject({ status: 'NAO_SE_APLICA' });
    expect(meio.obrigatorias_pendentes).toEqual(['Autorização da autoridade competente (Art. 72, VIII)']);
    expect(meio.fora_do_checklist).toEqual(['OUT']);
    expect(meio.antes_da_autorizacao).toEqual(['Art. 72, IV — Compatibilidade orçamentária']);

    const cheio = checklistIncremental({ contratacao_direta: true, checklist: DIRETA, classificadas: ['DFD', 'PP', 'DO', 'AA'], nao_se_aplica: ['ETP', 'AR', 'TR'] });
    expect(cheio.completo).toBe(true);
    expect(cheio.antes_da_autorizacao).toEqual([]);
  });

  it('"não se aplica" onde a lei não permite não conta; o que o processo já tem conta', () => {
    const r = checklistIncremental({ contratacao_direta: true, checklist: DIRETA, classificadas: [], nao_se_aplica: ['DFD'], ja_prontas: ['PP'], ja_nao_se_aplica: ['ETP'] });
    expect(r.linhas.find((l) => l.tipo === 'DFD')?.status).toBe('PENDENTE');
    expect(r.linhas.find((l) => l.tipo === 'PP')).toMatchObject({ status: 'OK', origem: 'JA_NO_PROCESSO' });
    expect(r.linhas.find((l) => l.tipo === 'ETP')).toMatchObject({ status: 'NAO_SE_APLICA', origem: 'JA_NO_PROCESSO' });
  });

  it('licitação (art. 18): sem portão B da contratação direta; todas obrigatórias', () => {
    const r = checklistIncremental({ contratacao_direta: false, checklist: RITO, classificadas: ['DFD', 'ETP'] });
    expect(r.antes_da_autorizacao).toEqual([]);
    expect(r.linhas.every((l) => l.obrigatorio && !l.pode_nao_se_aplicar)).toBe(true);
    expect(r.obrigatorias_pendentes.length).toBe(RITO.length - 2);
  });
});

describe('fase interna feita fora — dados e itens', () => {
  it('itens: unidade obrigatória e válida; valor unitário (decisão 2); quantidade > 0', () => {
    const r = validarItensExternos([
      { descricao: 'Licença de software', quantidade: 12, unidade: 'MES', valor_unitario: 5146.12 },
      { descricao: 'Treinamento', quantidade: 1, unidade: '', valor_unitario: 1000 },
      { descricao: 'Suporte', quantidade: 1, unidade: 'XPTO', valor_unitario: 1000 },
      { descricao: '', quantidade: 0, unidade: 'UNIDADE', valor_unitario: 0 },
    ]);
    const msgs = r.erros.map((e) => e.mensagem).join('\n');
    expect(msgs).toMatch(/Item 2: informe a unidade de medida/);
    expect(msgs).toMatch(/Item 3: unidade de medida inválida \(XPTO\)/);
    expect(msgs).toMatch(/Item 4: informe a descrição/);
    expect(msgs).toMatch(/Item 4: a quantidade deve ser maior que zero/);
    expect(msgs).toMatch(/Item 4: informe o valor unitário/);
    expect(r.erros.every((e) => e.passo === 'ITENS')).toBe(true);
    expect(r.itens[0]).toMatchObject({ numero_item: 1, unidade_medida: 'MES', valor_unitario_estimado: 5146.12 });
    expect(valorDosItensExternos([r.itens[0]])).toBe(61753.44);
    expect(validarItensExternos([]).erros[0].mensagem).toMatch(/ao menos um item/);
  });

  it('dados: modalidade (sem credenciamento), natureza, objeto, nº do processo, disputa só na dispensa, sigilo com justificativa', () => {
    const r = validarDadosExternos({ modalidade: 'CREDENCIAMENTO', tipo_contratacao: 'X', objeto: '', numero_processo: '', dispensa_com_lances: false, sigilo: { sigiloso: true, justificativa: 'curta' } });
    const msgs = r.erros.map((e) => e.mensagem).join('\n');
    expect(msgs).toMatch(/modalidade/);
    expect(msgs).toMatch(/natureza do objeto/);
    expect(msgs).toMatch(/objeto/);
    expect(msgs).toMatch(/número do processo administrativo/);
    expect(msgs).toMatch(/Com ou sem disputa de lances é escolha da dispensa/);
    expect(msgs).toMatch(/Justifique o sigilo/);
    const ok = validarDadosExternos({
      modalidade: 'dispensa_eletronica',
      tipo_contratacao: 'SERVICO',
      objeto: 'Software de geração de caracteres para a TV Câmara',
      numero_processo: 'PA 139/2025',
      numero_edital: 'Dispensa 029/2025',
      dispensa_com_lances: false,
      sigilo: { sigiloso: true, justificativa: 'Orçamento sigiloso para não balizar as propostas (art. 24).' },
    });
    expect(ok.erros).toEqual([]);
    expect(ok.dados).toMatchObject({ modalidade: 'DISPENSA_ELETRONICA', dispensa_com_lances: false, sigilo: { sigiloso: true } });
    expect(criterioPadraoDaModalidade('LEILAO')).toBe('MAIOR_LANCE');
    expect(criterioPadraoDaModalidade('DISPENSA_ELETRONICA')).toBe('MENOR_PRECO');
  });
});
