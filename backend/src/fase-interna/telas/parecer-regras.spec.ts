import {
  aplicarMarcacoes,
  clausulasArt92Faltantes,
  podeCancelar,
  podeReabrir,
  podeSanar,
  roteiroFaseExterna,
  roteiroPrevio,
  textoDoParecer,
  validarEmissao,
  validarMarcacoes,
  validarNovaDiligencia,
} from './parecer-regras';

import { montarContexto } from '../conformidade/contexto';
import { pa139Corrigido, pa139Real } from '../conformidade/fixtures/pa-139-2025';
import { avaliarRegras } from '../conformidade/motor';
import type { EntradaContexto } from '../conformidade/contexto';

const linha = (tipo: string, status = 'OK') => ({ tipo, titulo: tipo, status, obrigatorio: false });
/** Roteiro sobre a avaliação do MOTOR (Entrega 4) — o roteiro não tem regra própria. */
const roteiro = (e: EntradaContexto, instrucao = e.instrucao.itens) =>
  roteiroPrevio({ contratacao_direta: true, instrucao, fundamento_referencia: 'art. 75, II', numero_processo: '139/2025', avaliacoes: avaliarRegras(montarContexto(e)) });
const com = (base: () => EntradaContexto, f: (e: EntradaContexto) => void) => {
  const e = base();
  f(e);
  return e;
};

describe('Roteiro do parecer (Entrega 3B) — lê o motor de conformidade (Entrega 4)', () => {
  it('art. 72: I, II, IV, VI/VII e VIII a partir da instrução; pendência aparece', () => {
    const r = roteiro(pa139Corrigido(), [linha('DFD'), linha('ETP', 'NAO_SE_APLICA'), linha('TR'), linha('PP'), linha('DO', 'PENDENTE'), linha('AA'), linha('RAG')]);
    const s = Object.fromEntries(r.map((i) => [i.id, i.automatico.situacao]));
    expect(s).toMatchObject({ A72_I: 'CONFORME', A72_II: 'CONFORME', A72_IV: 'PENDENTE', A72_VI_VII: 'CONFORME', A72_VIII: 'CONFORME' });
  });

  it('art. 72, VI e VII por modalidade (homologação 26/09/2026): dispensa eletrônica → critério e preço estimado aqui; inexigibilidade → relatório OU justificativa', () => {
    const base = { contratacao_direta: true, fundamento_referencia: 'art. 75, II', numero_processo: '1/2026', avaliacoes: [] };
    const disp = roteiroPrevio({ ...base, modalidade: 'DISPENSA_ELETRONICA', instrucao: [linha('RAG'), linha('JC', 'PENDENTE')] }).find((i) => i.id === 'A72_VI_VII')!;
    expect(disp.texto).toMatch(/preço estimado.*fase externa/);
    expect(disp.automatico.situacao).toBe('CONFORME');
    const inex = (instrucao: any[]) => roteiroPrevio({ ...base, modalidade: 'INEXIGIBILIDADE', instrucao }).find((i) => i.id === 'A72_VI_VII')!.automatico.situacao;
    expect(inex([linha('RAG', 'PENDENTE'), linha('JC')])).toBe('CONFORME');
    expect(inex([linha('RAG', 'NAO_SE_APLICA'), linha('JC', 'NAO_SE_APLICA')])).toBe('PENDENTE');
  });

  it('parecer da fase externa: VI e VII conferidos com o vencedor e o preço final registrados', () => {
    const item = (e: Parameters<typeof roteiroFaseExterna>[0]) => roteiroFaseExterna(e).find((i) => i.id === 'A72_VI_VII')!.automatico;
    expect(item({ parecer_previo: 'OK', tem_vencedor: true, valor_vencedor: 22600, valor_estimado: 24000 })).toMatchObject({ situacao: 'CONFORME' });
    expect(item({ parecer_previo: 'OK', tem_vencedor: true, valor_vencedor: 25000, valor_estimado: 24000 })).toMatchObject({ situacao: 'ATENCAO' });
    expect(item({ parecer_previo: 'OK', tem_vencedor: false, valor_vencedor: null, valor_estimado: 24000 })).toMatchObject({ situacao: 'PENDENTE' });
  });

  it('PA 139/2025: o inciso I citado no relatório e na minuta do aviso quando o processo é do inciso II → atenção no art. 75 (ENQ-01)', () => {
    const enq = roteiro(pa139Real()).find((i) => i.id === 'ART75')!;
    expect(enq.automatico.situacao).toBe('ATENCAO');
    expect(enq.automatico.detalhe).toMatch(/ME \(inciso I\)/);
    // o texto do detalhe não cita "art. 75, I" (o parecer não pode virar ele mesmo uma peça divergente)
    expect(enq.automatico.detalhe).not.toMatch(/art\. 75/);
    expect(enq.tipos).toEqual(['RAG', 'ME']);
    expect(roteiro(pa139Corrigido()).find((i) => i.id === 'ART75')!.automatico.situacao).toBe('CONFORME');
  });

  it('PA 139/2025: minuta do contrato vinculada ao "PA 115/2025" → atenção na vinculação (VINC-01)', () => {
    const v = roteiro(pa139Real()).find((i) => i.id === 'VINC')!;
    expect(v.automatico).toMatchObject({ situacao: 'ATENCAO' });
    expect(v.automatico.detalhe).toMatch(/PA nº 115\/2025/);
    expect(v.tipos).toEqual(['MC']);
    expect(roteiro(pa139Corrigido()).find((i) => i.id === 'VINC')!.automatico.situacao).toBe('CONFORME');
  });

  it('marca "similar ou superior ao ARION" → atenção no art. 41 (MARCA-01)', () => {
    expect(roteiro(pa139Real()).find((i) => i.id === 'ART41')!.automatico).toMatchObject({ situacao: 'ATENCAO', detalhe: expect.stringMatching(/falta a justificativa/) });
    expect(roteiro(pa139Corrigido()).find((i) => i.id === 'ART41')!.automatico.situacao).toBe('CONFORME');
  });

  it('sigilo sem justificativa → atenção; público → não se aplica (SIGILO-01)', () => {
    expect(roteiro(com(pa139Corrigido, (e) => (e.licitacao.justificativa_sigilo = ''))).find((i) => i.id === 'ART24')!.automatico.situacao).toBe('ATENCAO');
    expect(roteiro(com(pa139Corrigido, (e) => (e.licitacao.sigilo_orcamento = 'PUBLICO'))).find((i) => i.id === 'ART24')!.automatico.situacao).toBe('NAO_SE_APLICA');
  });

  it('art. 92: cláusula obrigatória vazia na minuta feita no sistema é apontada (ART92-01)', () => {
    const secoes = Object.fromEntries(['objeto', 'vinculacao', 'legislacao', 'regime_execucao', 'preco', 'pagamento', 'prazos', 'dotacao', 'obrigacoes', 'penalidades', 'habilitacao', 'gestao', 'extincao', 'foro'].map((k) => [k, '<p>Texto da cláusula</p>']));
    expect(clausulasArt92Faltantes(secoes)).toEqual([]);
    expect(clausulasArt92Faltantes({ ...secoes, penalidades: '' })).toEqual(['art. 92, XIV (penalidades)']);
    const e = com(pa139Corrigido, (x) => {
      x.documentos = x.documentos.filter((d) => d.tipo !== 'MC');
      x.documentos.push({ id: 'mc', tipo: 'MC', status: 'EM_ELABORACAO', origem: 'INTERNO', dados_estruturados: { ...secoes, foro: '' } });
    });
    expect(roteiro(e).find((i) => i.id === 'ART92')!.automatico).toMatchObject({ situacao: 'ATENCAO' });
    expect(roteiro(pa139Corrigido()).find((i) => i.id === 'ART92')!.automatico.detalhe).toMatch(/anexada/);
  });

  it('marcação da Procuradoria prevalece; diligência aberta sobre o item → "Diligência"', () => {
    const r = roteiro(pa139Corrigido());
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
    const itens = aplicarMarcacoes(roteiro(pa139Corrigido()), null, []);
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
