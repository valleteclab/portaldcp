import {
  PessoaDoOrgao,
  aplicarEdicaoPlanejamento,
  normalizarPlanejamento,
  pessoaAtende,
  planejamentoSemente,
  rotuloRegra,
  validarPlanejamento,
} from './planejamento-fluxo';

const pessoa = (x: Partial<PessoaDoOrgao> = {}): PessoaDoOrgao => ({
  orgao: false,
  admin_orgao: false,
  usuario_id: 'u1',
  papeis: [],
  setor_id: null,
  pode_aprovar_demandas: false,
  ...x,
});

describe('Planejamento no modelo de fluxo — quem monta o DFD e quem aprova', () => {
  it('semente: aprovação da demanda por "pode aprovar demandas"; DFD pelo papel PLANEJAMENTO; 2ª aprovação desligada', () => {
    const s = planejamentoSemente();
    expect(s.aprovador_demanda).toEqual({ tipo: 'PERMISSAO', valor: null });
    expect(s.responsavel_dfd).toEqual({ tipo: 'PAPEL', valor: 'PLANEJAMENTO' });
    expect(s.aprovacao_dfd).toEqual({ exigida: false, aprovador: { tipo: 'PERMISSAO', valor: null } });
  });

  it('resolução do responsável pelo DFD (padrão): papel PLANEJAMENTO, administrador do órgão e login do órgão; os demais não', () => {
    const r = planejamentoSemente().responsavel_dfd;
    expect(pessoaAtende(r, pessoa({ papeis: ['PLANEJAMENTO'] }), 'MONTAR')).toBe(true);
    expect(pessoaAtende(r, pessoa({ admin_orgao: true }), 'MONTAR')).toBe(true);
    expect(pessoaAtende(r, pessoa({ orgao: true, usuario_id: null }), 'MONTAR')).toBe(true);
    expect(pessoaAtende(r, pessoa({ papeis: ['REQUISITANTE'], pode_aprovar_demandas: true }), 'MONTAR')).toBe(false);
  });

  it('responsável por SETOR ou PESSOA; PERMISSAO para montar = só o administrador', () => {
    expect(pessoaAtende({ tipo: 'SETOR', valor: 's-adm' }, pessoa({ setor_id: 's-adm' }), 'MONTAR')).toBe(true);
    expect(pessoaAtende({ tipo: 'SETOR', valor: 's-adm' }, pessoa({ setor_id: 's-com' }), 'MONTAR')).toBe(false);
    expect(pessoaAtende({ tipo: 'USUARIO', valor: 'u1' }, pessoa(), 'MONTAR')).toBe(true);
    expect(pessoaAtende({ tipo: 'USUARIO', valor: 'u2' }, pessoa(), 'MONTAR')).toBe(false);
    expect(pessoaAtende({ tipo: 'PERMISSAO', valor: null }, pessoa({ pode_aprovar_demandas: true }), 'MONTAR')).toBe(false);
  });

  it('aprovador: PERMISSAO = "pode aprovar demandas"; o administrador do órgão NÃO aprova só por ser admin', () => {
    const r = planejamentoSemente().aprovador_demanda;
    expect(pessoaAtende(r, pessoa({ pode_aprovar_demandas: true }), 'APROVAR')).toBe(true);
    expect(pessoaAtende(r, pessoa({ admin_orgao: true }), 'APROVAR')).toBe(false);
    expect(pessoaAtende(r, pessoa({ orgao: true, usuario_id: null }), 'APROVAR')).toBe(true);
    expect(pessoaAtende({ tipo: 'PAPEL', valor: 'AUTORIDADE' }, pessoa({ papeis: ['AUTORIDADE'] }), 'APROVAR')).toBe(true);
  });

  it('edição: liga a 2ª aprovação com aprovador por papel; tipo inválido e "exigida" não booleana são recusados', () => {
    const { planejamento, erros } = aplicarEdicaoPlanejamento(planejamentoSemente(), {
      aprovacao_dfd: { exigida: true, aprovador: { tipo: 'PAPEL', valor: 'AUTORIDADE' } },
      responsavel_dfd: { tipo: 'SETOR', valor: 's-adm' },
    });
    expect(erros).toEqual([]);
    expect(planejamento.aprovacao_dfd).toEqual({ exigida: true, aprovador: { tipo: 'PAPEL', valor: 'AUTORIDADE' } });
    expect(planejamento.responsavel_dfd).toEqual({ tipo: 'SETOR', valor: 's-adm' });
    const ruim = aplicarEdicaoPlanejamento(planejamentoSemente(), { aprovador_demanda: { tipo: 'CHEFE' }, aprovacao_dfd: { exigida: 'sim' } });
    expect(ruim.erros.map((e) => e.campo)).toEqual(['aprovador_demanda', 'aprovacao_dfd.exigida']);
  });

  it('validação contra o órgão: papel conhecido, setor do órgão, pessoa ativa, valor obrigatório', () => {
    const p = normalizarPlanejamento({
      aprovador_demanda: { tipo: 'USUARIO', valor: 'u-inativo' },
      responsavel_dfd: { tipo: 'SETOR', valor: 's-outro-orgao' },
      aprovacao_dfd: { exigida: true, aprovador: { tipo: 'PAPEL', valor: null } },
    });
    const erros = validarPlanejamento(p, { setores: ['s-adm'], usuarios: [{ id: 'u-inativo', ativo: false }] });
    expect(erros.map((e) => e.campo)).toEqual(['aprovador_demanda', 'responsavel_dfd', 'aprovacao_dfd.aprovador']);
    expect(validarPlanejamento(planejamentoSemente(), { setores: [], usuarios: [] })).toEqual([]);
  });

  it('linha antiga sem campos → padrão da semente; rótulos legíveis', () => {
    const p = normalizarPlanejamento({ aprovacao_dfd: { exigida: true } });
    expect(p.responsavel_dfd).toEqual({ tipo: 'PAPEL', valor: 'PLANEJAMENTO' });
    expect(p.aprovacao_dfd).toEqual({ exigida: true, aprovador: { tipo: 'PERMISSAO', valor: null } });
    expect(rotuloRegra(p.responsavel_dfd, 'MONTAR')).toBe('Papel Planejamento (monta o DFD) (e o administrador do órgão)');
    expect(rotuloRegra(p.aprovador_demanda, 'APROVAR')).toMatch(/aprovar demandas/);
  });
});
