import { motivoReinicioRecusado, situacaoReinicio, TAMANHO_MINIMO_VICIO } from './regras-reinicio';

const sit = (fase: string, janela = false) => situacaoReinicio({ fase, janelaFinalDeRecursoAberta: janela });
const longa = 'x'.repeat(TAMANHO_MINIMO_VICIO);

describe('reinício da etapa de lances', () => {
  it('antes do fim dos lances basta a justificativa', () => {
    for (const f of ['ANALISE_PROPOSTAS', 'EM_DISPUTA']) {
      expect(sit(f).modo).toBe('SIMPLES');
      expect(motivoReinicioRecusado(sit(f), { justificativa: 'queda' })).toBeNull();
      expect(motivoReinicioRecusado(sit(f), { justificativa: '  ' })).toMatch(/obrigatória/);
    }
  });

  it('depois do fim dos lances exige a confirmação do vício e a descrição', () => {
    for (const f of ['JULGAMENTO', 'HABILITACAO']) {
      const s = sit(f);
      expect(s.modo).toBe('REFORCADO');
      expect(motivoReinicioRecusado(s, { justificativa: longa })).toMatch(/vício/);
      expect(motivoReinicioRecusado(s, { justificativa: 'curta', confirmaVicio: true })).toMatch(/mín\. 30/);
      expect(motivoReinicioRecusado(s, { justificativa: longa, confirmaVicio: true })).toBeNull();
    }
  });

  it('bloqueia com a fase recursal aberta, mesmo com a confirmação', () => {
    for (const s of [sit('HABILITACAO', true), sit('RECURSO')]) {
      expect(s.modo).toBe('BLOQUEADO');
      expect(motivoReinicioRecusado(s, { justificativa: longa, confirmaVicio: true })).toMatch(/fase recursal/);
    }
  });

  it('bloqueia depois da adjudicação e da homologação', () => {
    for (const f of ['ADJUDICACAO', 'HOMOLOGACAO']) {
      expect(motivoReinicioRecusado(sit(f), { justificativa: longa, confirmaVicio: true })).toMatch(/adjudicada/);
    }
  });
});
