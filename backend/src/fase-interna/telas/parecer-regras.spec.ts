import {
  aplicarMarcacoes,
  clausulasArt92Faltantes,
  podeCancelar,
  podeReabrir,
  podeSanar,
  roteiroPrevio,
  textoDoParecer,
  validarEmissao,
  validarMarcacoes,
  validarNovaDiligencia,
} from './parecer-regras';

const base = {
  contratacao_direta: true,
  inciso_fundamento: 'II',
  fundamento_referencia: 'art. 75, II',
  numero_processo: '139/2025',
  numero_dispensa: '029/2025',
  sigiloso: true,
  justificativa_sigilo: 'Evitar ancoragem dos preços na disputa (art. 24).',
  marca: { bloqueios: 0, atencoes: 0, justificada: false },
  secoes_mc: null as Record<string, string> | null,
};
const peca = (tipo: string, status = 'OK', texto = '', anexada = false) => ({ tipo, status, texto, anexada });

describe('Roteiro do parecer (Entrega 3B)', () => {
  it('art. 72: I, II, IV, VI/VII e VIII a partir da instrução; pendência aparece', () => {
    const r = roteiroPrevio({ ...base, pecas: [peca('DFD'), peca('ETP', 'NAO_SE_APLICA'), peca('TR'), peca('PP'), peca('DO', 'PENDENTE'), peca('AA'), peca('RAG')] });
    const s = Object.fromEntries(r.map((i) => [i.id, i.automatico.situacao]));
    expect(s).toMatchObject({ A72_I: 'CONFORME', A72_II: 'CONFORME', A72_IV: 'PENDENTE', A72_VI_VII: 'CONFORME', A72_VIII: 'CONFORME' });
  });

  it('PA 139/2025: o inciso I citado no aviso quando o processo é do inciso II → atenção no art. 75', () => {
    const r = roteiroPrevio({ ...base, pecas: [peca('ME', 'OK', '<p>com fundamento no art. 75, I</p>'), peca('MC', 'OK', 'art. 75, inciso II')] });
    const enq = r.find((i) => i.id === 'ART75')!;
    expect(enq.automatico.situacao).toBe('ATENCAO');
    expect(enq.automatico.detalhe).toMatch(/ME \(art\. 75, I\)/);
    expect(enq.tipos).toEqual(['ME']);
  });

  it('PA 139/2025: minuta do contrato vinculada ao "PA 115/2025" → atenção na vinculação', () => {
    const r = roteiroPrevio({ ...base, pecas: [peca('MC', 'OK', 'O Processo Administrativo nº 115/2025 e seus anexos')] });
    const v = r.find((i) => i.id === 'VINC')!;
    expect(v.automatico).toMatchObject({ situacao: 'ATENCAO' });
    expect(v.tipos).toEqual(['MC']);
    const ok = roteiroPrevio({ ...base, pecas: [peca('MC', 'OK', 'O Processo Administrativo nº 139/2025')] });
    expect(ok.find((i) => i.id === 'VINC')!.automatico.situacao).toBe('CONFORME');
  });

  it('sigilo sem justificativa → atenção; público → não se aplica', () => {
    expect(roteiroPrevio({ ...base, justificativa_sigilo: '', pecas: [] }).find((i) => i.id === 'ART24')!.automatico.situacao).toBe('ATENCAO');
    expect(roteiroPrevio({ ...base, sigiloso: false, pecas: [] }).find((i) => i.id === 'ART24')!.automatico.situacao).toBe('NAO_SE_APLICA');
  });

  it('art. 92: cláusula obrigatória vazia na minuta feita no sistema é apontada', () => {
    const secoes = Object.fromEntries(['objeto', 'vinculacao', 'legislacao', 'regime_execucao', 'preco', 'pagamento', 'prazos', 'dotacao', 'obrigacoes', 'penalidades', 'habilitacao', 'gestao', 'extincao', 'foro'].map((k) => [k, '<p>Texto da cláusula</p>']));
    expect(clausulasArt92Faltantes(secoes)).toEqual([]);
    expect(clausulasArt92Faltantes({ ...secoes, penalidades: '' })).toEqual(['art. 92, XIV (penalidades)']);
    const r = roteiroPrevio({ ...base, secoes_mc: { ...secoes, foro: '' }, pecas: [peca('MC')] });
    expect(r.find((i) => i.id === 'ART92')!.automatico).toMatchObject({ situacao: 'ATENCAO' });
  });

  it('marcação da Procuradoria prevalece; diligência aberta sobre o item → "Diligência"', () => {
    const r = roteiroPrevio({ ...base, pecas: [peca('DFD')] });
    const f = aplicarMarcacoes(r, { A72_I: { situacao: 'RESSALVA', observacao: 'DFD sem data' } }, [{ item_roteiro: 'VINC', status: 'ABERTA' }, { item_roteiro: 'ART24', status: 'SANADA' }]);
    expect(f.find((i) => i.id === 'A72_I')).toMatchObject({ situacao: 'RESSALVA', observacao: 'DFD sem data', marcado_pela_procuradoria: true });
    expect(f.find((i) => i.id === 'VINC')).toMatchObject({ situacao: 'DILIGENCIA', diligencias_abertas: 1 });
    expect(f.find((i) => i.id === 'ART24')!.situacao).toBe('CONFORME');
  });

  it('marcações: item desconhecido ou situação inválida são recusados', () => {
    expect(validarMarcacoes({ XYZ: { situacao: 'CONFORME' } }, ['A72_I'])).toMatchObject({ ok: false });
    expect(validarMarcacoes({ A72_I: { situacao: 'DILIGENCIA' } }, ['A72_I'])).toMatchObject({ ok: false });
    expect(validarMarcacoes({ A72_I: { situacao: 'conforme' } }, ['A72_I'])).toMatchObject({ ok: true, valores: { A72_I: { situacao: 'CONFORME', observacao: null } } });
  });
});

describe('Regras da diligência (abre, sana, volta para o jurídico)', () => {
  it('abrir: descrição, peça existente nos autos e item do roteiro válido', () => {
    const ctx = { tipos_do_processo: ['DFD', 'MC'], itens_roteiro: ['VINC'] };
    expect(validarNovaDiligencia({ ...ctx, descricao: 'curta', tipo_alvo: 'MC' })).toMatch(/Descreva/);
    expect(validarNovaDiligencia({ ...ctx, descricao: 'Corrigir a vinculação ao PA 139/2025', tipo_alvo: 'TR' })).toMatch(/não existe/);
    expect(validarNovaDiligencia({ ...ctx, descricao: 'Corrigir a vinculação ao PA 139/2025', tipo_alvo: 'MC', item_roteiro: 'X' })).toMatch(/roteiro/);
    expect(validarNovaDiligencia({ ...ctx, descricao: 'Corrigir a vinculação ao PA 139/2025', tipo_alvo: 'MC', item_roteiro: 'VINC' })).toBeNull();
  });

  it('sanar: exige versão nova pronta da peça-alvo (sem desfazer o que foi assinado depois)', () => {
    const d = { status: 'ABERTA', documento_alvo_id: 'v1' };
    expect(podeSanar(d, { documento_atual_id: 'v1', atual_pronta: true, sem_alteracao: false, resposta: '' })).toMatchObject({ ok: false });
    expect(podeSanar(d, { documento_atual_id: 'v2', atual_pronta: false, sem_alteracao: false, resposta: '' })).toMatchObject({ ok: false });
    expect(podeSanar(d, { documento_atual_id: 'v2', atual_pronta: true, sem_alteracao: false, resposta: '' })).toEqual({ ok: true, corrigida: true });
  });

  it('sanar sem alterar a peça: só com o esclarecimento', () => {
    const d = { status: 'ABERTA', documento_alvo_id: 'v1' };
    expect(podeSanar(d, { documento_atual_id: 'v1', atual_pronta: true, sem_alteracao: true, resposta: 'ok' })).toMatchObject({ ok: false });
    expect(podeSanar(d, { documento_atual_id: 'v1', atual_pronta: true, sem_alteracao: true, resposta: 'A cláusula já cita o PA correto na folha 63.' })).toEqual({ ok: true, corrigida: false });
    expect(podeSanar({ ...d, status: 'SANADA' }, { documento_atual_id: 'v2', atual_pronta: true, sem_alteracao: false, resposta: '' })).toMatchObject({ ok: false });
  });

  it('reabrir só a sanada; cancelar só a aberta', () => {
    expect(podeReabrir({ status: 'SANADA' })).toBeNull();
    expect(podeReabrir({ status: 'ABERTA' })).toMatch(/sanada/);
    expect(podeCancelar({ status: 'ABERTA' })).toBeNull();
    expect(podeCancelar({ status: 'CANCELADA' })).toMatch(/aberta/);
  });
});

describe('Emissão do parecer', () => {
  it('favorável não sai com diligência aberta; com ressalvas sai (condicionado); desfavorável exige fundamentação', () => {
    const abertas = [{ status: 'ABERTA' }];
    expect(validarEmissao({ conclusao: 'FAVORAVEL', fundamentacao: '', ressalvas: '', diligencias: abertas })).toMatchObject({ ok: false });
    expect(validarEmissao({ conclusao: 'FAVORAVEL', fundamentacao: '', ressalvas: '', diligencias: [{ status: 'SANADA' }] })).toEqual({ ok: true, conclusao: 'FAVORAVEL' });
    expect(validarEmissao({ conclusao: 'FAVORAVEL_COM_RESSALVAS', fundamentacao: '', ressalvas: '', diligencias: abertas })).toEqual({ ok: true, conclusao: 'FAVORAVEL_COM_RESSALVAS' });
    expect(validarEmissao({ conclusao: 'FAVORAVEL_COM_RESSALVAS', fundamentacao: '', ressalvas: '', diligencias: [] })).toMatchObject({ ok: false });
    expect(validarEmissao({ conclusao: 'DESFAVORAVEL', fundamentacao: 'curta', ressalvas: '', diligencias: [] })).toMatchObject({ ok: false });
    expect(validarEmissao({ conclusao: 'OUTRA', fundamentacao: '', ressalvas: '', diligencias: [] })).toMatchObject({ ok: false });
  });

  it('texto montado do roteiro com o número do PROCESSO e a conclusão', () => {
    const itens = aplicarMarcacoes(roteiroPrevio({ ...base, pecas: [peca('DFD')] }), null, []);
    const html = textoDoParecer({
      fase: 'PREVIA',
      numero_processo: '139/2025',
      objeto: 'Software <TV>',
      fundamento_texto: 'Lei 14.133/2021, art. 75, II',
      itens,
      diligencias: [{ descricao: 'Vinculação ao PA', tipo_alvo: 'MC', status: 'SANADA', resposta: 'corrigida' }],
      conclusao: 'FAVORAVEL',
      fundamentacao: null,
      ressalvas: null,
      jurista: 'Paula Procuradora',
      cidade: 'LEM',
      data: '26 de setembro de 2026',
    });
    expect(html).toMatch(/Processo Administrativo nº 139\/2025/);
    expect(html).toMatch(/art\. 75, II/);
    expect(html).toMatch(/Parecer FAVORÁVEL/);
    expect(html).toMatch(/Software &lt;TV&gt;/);
    expect(html).toMatch(/sanada: corrigida/);
  });
});
