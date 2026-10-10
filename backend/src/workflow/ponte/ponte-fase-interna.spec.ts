import { despachoForaDoFluxo, ehEnvioForaDoFluxo, FINALIDADE_FORA_DO_FLUXO, justificativaForaDoFluxo, licitacaoConduzidaPeloFluxo, pendenciasDaPonte, ROTA_DA_ETAPA } from './ponte-fase-interna';

const base = { documentoPronto: false, publicada: false, temDemanda: false };

describe('ponte fluxo novo ↔ fase interna', () => {
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
