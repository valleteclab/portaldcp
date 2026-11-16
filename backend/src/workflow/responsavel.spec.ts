import { ehResponsavelDaTarefa } from './responsavel';

const pessoa = { ehLoginDoOrgao: false, atorId: 'u1', usuarioId: 'u1', setorId: 's1' };

describe('ehResponsavelDaTarefa', () => {
  it('setor: só quem é lotado num dos setores', () => {
    expect(ehResponsavelDaTarefa({ responsavel_tipo: 'SETOR', responsaveis: ['s1', 's2'] }, { iniciado_por_id: 'x' }, pessoa)).toBe(true);
    expect(ehResponsavelDaTarefa({ responsavel_tipo: 'SETOR', responsaveis: ['s9'] }, { iniciado_por_id: 'x' }, pessoa)).toBe(false);
    expect(ehResponsavelDaTarefa({ responsavel_tipo: 'SETOR', responsaveis: ['s1'] }, { iniciado_por_id: 'x' }, { ...pessoa, setorId: null })).toBe(false);
  });

  it('pessoa e solicitante', () => {
    expect(ehResponsavelDaTarefa({ responsavel_tipo: 'USUARIO', responsaveis: ['u1'] }, { iniciado_por_id: 'x' }, pessoa)).toBe(true);
    expect(ehResponsavelDaTarefa({ responsavel_tipo: 'USUARIO', responsaveis: ['u2'] }, { iniciado_por_id: 'x' }, pessoa)).toBe(false);
    expect(ehResponsavelDaTarefa({ responsavel_tipo: 'SOLICITANTE', responsaveis: [] }, { iniciado_por_id: 'u1' }, pessoa)).toBe(true);
    expect(ehResponsavelDaTarefa({ responsavel_tipo: 'SOLICITANTE', responsaveis: [] }, { iniciado_por_id: 'u2' }, pessoa)).toBe(false);
  });

  it('login do órgão age em todas; papel ADMIN de usuário não (mesma regra do motor)', () => {
    expect(ehResponsavelDaTarefa({ responsavel_tipo: 'SETOR', responsaveis: ['s9'] }, { iniciado_por_id: 'x' }, { ...pessoa, ehLoginDoOrgao: true })).toBe(true);
  });
});
