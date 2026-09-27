import { condicaoSqlDoEscopo, demandaNoEscopo, veTodasAsDemandas, EscopoDemandas } from './visibilidade-demandas';
import type { PessoaDoOrgao } from '../fase-interna/fluxo/planejamento-fluxo';

const pessoa = (p: Partial<PessoaDoOrgao> = {}): PessoaDoOrgao => ({
  orgao: false,
  admin_orgao: false,
  usuario_id: 'u-rita',
  papeis: ['REQUISITANTE'],
  setor_id: 's-com',
  pode_aprovar_demandas: false,
  ...p,
});
const nada = { aprovarDemanda: false, montarDfd: false, aprovarDfd: false };

describe('visibilidade das demandas', () => {
  describe('veTodasAsDemandas', () => {
    it('requisitante (só pede) não vê todas', () => {
      expect(veTodasAsDemandas(pessoa(), nada)).toBe(false);
      expect(veTodasAsDemandas(pessoa({ papeis: ['COMPRAS'] }), nada)).toBe(false);
    });
    it('login do órgão e administrador do órgão veem todas', () => {
      expect(veTodasAsDemandas(pessoa({ orgao: true, usuario_id: null }), nada)).toBe(true);
      expect(veTodasAsDemandas(pessoa({ admin_orgao: true }), nada)).toBe(true);
    });
    it('quem aprova a demanda, quem monta o DFD e quem aprova o DFD veem todas', () => {
      expect(veTodasAsDemandas(pessoa(), { ...nada, aprovarDemanda: true })).toBe(true);
      expect(veTodasAsDemandas(pessoa(), { ...nada, montarDfd: true })).toBe(true);
      expect(veTodasAsDemandas(pessoa(), { ...nada, aprovarDfd: true })).toBe(true);
    });
    it('papel PLANEJAMENTO vê todas mesmo com a regra de montar apontando outro', () => {
      expect(veTodasAsDemandas(pessoa({ papeis: ['PLANEJAMENTO'] }), nada)).toBe(true);
    });
    it('sem pessoa (outro órgão / inativo) → não', () => {
      expect(veTodasAsDemandas(null, { aprovarDemanda: true, montarDfd: true, aprovarDfd: true })).toBe(false);
    });
  });

  describe('demandaNoEscopo', () => {
    const rita: EscopoDemandas = { todas: false, usuarioId: 'u-rita', setorId: 's-com', setorNome: 'Comunicação' };
    it('todas → sempre', () => {
      expect(demandaNoEscopo({ todas: true }, { setor_id: 's-x', criado_por_id: 'outro' })).toBe(true);
    });
    it('do setor dela ou criada por ela → sim; de outro setor → não', () => {
      expect(demandaNoEscopo(rita, { setor_id: 's-com', criado_por_id: 'u-carlos' })).toBe(true);
      expect(demandaNoEscopo(rita, { setor_id: 's-compras', criado_por_id: 'u-rita' })).toBe(true);
      expect(demandaNoEscopo(rita, { setor_id: 's-compras', criado_por_id: 'u-carlos' })).toBe(false);
    });
    it('demanda antiga sem setor: casa pelo nome da unidade (sem caixa/espaços)', () => {
      expect(demandaNoEscopo(rita, { setor_id: null, unidade_requisitante: ' comunicação ' })).toBe(true);
      expect(demandaNoEscopo(rita, { setor_id: null, unidade_requisitante: 'Compras' })).toBe(false);
    });
    it('usuário sem setor: só as que criou', () => {
      const sem: EscopoDemandas = { todas: false, usuarioId: 'u-x', setorId: null, setorNome: null };
      expect(demandaNoEscopo(sem, { setor_id: null, unidade_requisitante: '' })).toBe(false);
      expect(demandaNoEscopo(sem, { setor_id: 's-com', criado_por_id: 'u-x' })).toBe(true);
    });
  });

  describe('condicaoSqlDoEscopo', () => {
    it('todas → sem filtro', () => {
      expect(condicaoSqlDoEscopo({ todas: true })).toBeNull();
    });
    it('requisitante com setor: criou OU setor OU (sem setor e mesmo nome)', () => {
      const c = condicaoSqlDoEscopo({ todas: false, usuarioId: 'u', setorId: 's', setorNome: 'Comunicação' }, 'd')!;
      expect(c.sql).toBe(`(d.criado_por_id = :escUsuario OR d.setor_id = :escSetor OR (d.setor_id IS NULL AND lower(trim(d.unidade_requisitante)) = :escSetorNome))`);
      expect(c.params).toEqual({ escUsuario: 'u', escSetor: 's', escSetorNome: 'comunicação' });
    });
    it('sem setor: só as que criou', () => {
      const c = condicaoSqlDoEscopo({ todas: false, usuarioId: 'u', setorId: null, setorNome: null })!;
      expect(c.sql).toBe('(d.criado_por_id = :escUsuario)');
    });
  });
});
