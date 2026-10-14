import { despachoForaDoFluxo, documentoProntoParaAPonte, ehEnvioForaDoFluxo, FINALIDADE_FORA_DO_FLUXO, justificativaForaDoFluxo, licitacaoConduzidaPeloFluxo, pendenciasDaPonte, portaoDaEtapa, ROTA_DA_ETAPA } from './ponte-fase-interna';

const base = { documentoPronto: false, publicada: false, temDemanda: false };

describe('ponte fluxo novo ↔ fase interna', () => {
  it('documento pronto = o mesmo critério da instrução: gerado/anexado conta, assinatura é opcional', () => {
    const base = { tipo: 'ETP', status: 'RASCUNHO', caminho_arquivo: null, arquivo_pdf_path: null, descricao: null, dados_estruturados: {} };
    const r = { pode_nao_se_aplicar: true };
    expect(documentoProntoParaAPonte(null, r)).toBe(false);
    expect(documentoProntoParaAPonte(base, r)).toBe(false);
    expect(documentoProntoParaAPonte({ ...base, arquivo_pdf_path: '/x.pdf' }, r)).toBe(true);
    expect(documentoProntoParaAPonte({ ...base, status: 'IMPORTADO' }, r)).toBe(true);
    expect(documentoProntoParaAPonte({ ...base, status: 'ASSINADO' }, r)).toBe(true);
    expect(documentoProntoParaAPonte({ ...base, status: 'AGUARDANDO_APROVACAO', arquivo_pdf_path: '/x.pdf' }, r)).toBe(false);
    expect(documentoProntoParaAPonte({ ...base, status: 'AGUARDANDO_ASSINATURA', arquivo_pdf_path: '/x.pdf' }, r)).toBe(false);
    // Peça que só vale assinada (autorização, parecer): o texto gerado ainda não é o ato
    expect(documentoProntoParaAPonte({ ...base, tipo: 'AA', arquivo_pdf_path: '/x.pdf', dados_estruturados: { _exige_assinatura: true } }, r)).toBe(false);
  });

  it('"não se aplica" só vale onde o checklist permite (contratação direta, peça "se for o caso")', () => {
    const base = { tipo: 'ETP', status: 'RASCUNHO', caminho_arquivo: null, arquivo_pdf_path: null, descricao: null, dados_estruturados: { nao_se_aplica: true } };
    expect(documentoProntoParaAPonte(base, { pode_nao_se_aplicar: true })).toBe(true);
    expect(documentoProntoParaAPonte({ ...base, dados_estruturados: { nao_se_aplica: 'true' } }, { pode_nao_se_aplicar: true })).toBe(true);
    // Obrigatória (DFD, pesquisa, dotação — art. 72, IV) ou rito completo: a marca não conta
    expect(documentoProntoParaAPonte({ ...base, tipo: 'DO' }, { pode_nao_se_aplicar: false })).toBe(false);
  });

  it('etapa de documento conclui com o documento pronto na fase interna', () => {
    expect(pendenciasDaPonte('ETP', base)).toEqual([expect.stringContaining('o ETP')]);
    expect(pendenciasDaPonte('ETP', { ...base, documentoPronto: true })).toEqual([]);
    expect(pendenciasDaPonte('parecer_juridico', base)[0]).toContain('parecer jurídico');
  });

  it('demanda exige vínculo; publicação exige a licitação publicada', () => {
    expect(pendenciasDaPonte('DEMANDA', base)).toHaveLength(1);
    expect(pendenciasDaPonte('DEMANDA', { ...base, temDemanda: true })).toEqual([]);
    expect(pendenciasDaPonte('PUBLICACAO', base)).toHaveLength(1);
    expect(pendenciasDaPonte('PUBLICACAO', { ...base, publicada: true })).toEqual([]);
  });

  it('travas da lei seguram a autorização e a publicação, mesmo com o documento pronto', () => {
    const travas = ['A72-I: falta o DFD'];
    expect(pendenciasDaPonte('AUTORIZACAO', { ...base, documentoPronto: true, travasDaLei: travas })).toEqual(['Trava da lei: A72-I: falta o DFD']);
    expect(pendenciasDaPonte('AUTORIZACAO', { ...base, documentoPronto: false, travasDaLei: travas })).toHaveLength(2);
    expect(pendenciasDaPonte('PUBLICACAO', { ...base, travasDaLei: travas })).toHaveLength(2);
    expect(pendenciasDaPonte('PUBLICACAO', { ...base, publicada: true, travasDaLei: travas })).toEqual([]);
    expect(portaoDaEtapa('autorizacao')).toEqual({ portao: 'B', ato: 'AUTORIZAR' });
    expect(portaoDaEtapa('PUBLICACAO')).toEqual({ portao: 'C', ato: 'PUBLICAR' });
    expect(portaoDaEtapa('ETP')).toBeNull();
  });

  it('etapas gerais (tarefa, aprovação) não dependem da fase interna', () => {
    expect(pendenciasDaPonte('APROVACAO', base)).toEqual([]);
    expect(pendenciasDaPonte('TAREFA', base)).toEqual([]);
  });

  it('cada etapa de documento tem uma tela da fase interna', () => {
    for (const t of ['DFD', 'PESQUISA_PRECO', 'ETP', 'TR', 'RESERVA_ORCAMENTARIA', 'PARECER_JURIDICO', 'CONTROLE_INTERNO', 'AUTORIZACAO']) expect(ROTA_DA_ETAPA[t]).toBeTruthy();
  });

  it('licitação conduzida: consulta só por execução em andamento ligada a ela', async () => {
    const vistas: unknown[][] = [];
    const sim = async (_sql: string, p: unknown[]) => (vistas.push(p), [{ '?column?': 1 }]);
    expect(await licitacaoConduzidaPeloFluxo(sim, 'lic-1')).toBe(true);
    expect(vistas[0]).toEqual(['lic-1']);
    expect(await licitacaoConduzidaPeloFluxo(async () => [], 'lic-1')).toBe(false);
  });
});

describe('envio fora do fluxo (exceção com justificativa)', () => {
  it('justificativa curta ou vazia não vale', () => {
    expect(justificativaForaDoFluxo('')).toBeNull();
    expect(justificativaForaDoFluxo('   urgente ')).toBeNull();
    expect(justificativaForaDoFluxo('  Consulta ao Patrimônio sobre o tombamento  ')).toBe('Consulta ao Patrimônio sobre o tombamento');
  });

  it('despacho começa pela justificativa e guarda o texto extra', () => {
    expect(despachoForaDoFluxo('Consulta ao Patrimônio sobre o tombamento')).toBe('Envio fora do fluxo. Justificativa: Consulta ao Patrimônio sobre o tombamento');
    expect(despachoForaDoFluxo('Consulta ao Patrimônio sobre o tombamento', ' Favor responder até sexta. ')).toBe(
      'Envio fora do fluxo. Justificativa: Consulta ao Patrimônio sobre o tombamento\n\nFavor responder até sexta.',
    );
  });

  it('reconhece a tramitação fora do fluxo pela finalidade', () => {
    expect(ehEnvioForaDoFluxo({ finalidade: FINALIDADE_FORA_DO_FLUXO })).toBe(true);
    expect(ehEnvioForaDoFluxo({ finalidade: 'a reserva orçamentária' })).toBe(false);
    expect(ehEnvioForaDoFluxo(null)).toBe(false);
  });
});

describe('vezDoPasso — só a etapa atual edita (12/10/2026)', () => {
  const { vezDoPasso, motivoForaDaVez } = require('./ponte-fase-interna');
  const passos = [
    { tipo: 'DFD', nome: 'DFD', ordem: 1, situacao: 'CONCLUIDA' },
    { tipo: 'ETP', nome: 'Estudo técnico preliminar', ordem: 2, situacao: 'EM_ANDAMENTO' },
    { tipo: 'PESQUISA_PRECO', nome: 'Pesquisa de preços', ordem: 3, situacao: 'A_REALIZAR' },
    { tipo: 'TR', nome: 'Termo de referência', ordem: 4, situacao: 'A_REALIZAR' },
  ];

  it('atual, concluída, futura e fora do desenho', () => {
    expect(vezDoPasso(passos, 'ETP')).toEqual({ situacao: 'ATUAL' });
    expect(vezDoPasso(passos, 'DFD')).toEqual({ situacao: 'CONCLUIDA', etapa: { nome: 'DFD', ordem: 1 } });
    expect(vezDoPasso(passos, 'TR')).toEqual({ situacao: 'FUTURA', etapa: { nome: 'Termo de referência', ordem: 4 }, atual: { nome: 'Estudo técnico preliminar', ordem: 2 } });
    expect(vezDoPasso(passos, 'MINUTAS')).toEqual({ situacao: 'FORA' });
  });

  it('dois nós para o mesmo passo (ETP e Mapa de riscos): basta um em andamento', () => {
    const p = [...passos.slice(0, 2), { tipo: 'MAPA_RISCOS', nome: 'Mapa de riscos', ordem: 3, situacao: 'A_REALIZAR' }];
    expect(vezDoPasso(p, 'ETP')).toEqual({ situacao: 'ATUAL' });
  });

  it('mensagens de somente leitura', () => {
    expect(motivoForaDaVez(vezDoPasso(passos, 'DFD'), 'Formalizar a demanda (DFD)')).toMatch(/etapa 1 \(DFD\), já concluída.*devolução/);
    expect(motivoForaDaVez(vezDoPasso(passos, 'TR'), 'Termo de referência')).toMatch(/etapa 4 .*está na etapa 2 \(Estudo técnico preliminar\)/);
    expect(motivoForaDaVez(vezDoPasso(passos, 'ETP'), 'ETP')).toBeNull();
  });
});
