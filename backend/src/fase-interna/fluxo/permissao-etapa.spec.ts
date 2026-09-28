import { EntradaPermissao, PerfilTrabalho, avaliarPermissaoEtapa, ehCondutor, ehResponsavelPelaEtapa } from './permissao-etapa';

/**
 * ISOLAMENTO DAS PEÇAS — casos do relatório da homologação multiusuário
 * (docs/fase interna/relatorio-homologacao-multiusuario-portaldcp.md, §5).
 * Setores: COMUNICAÇÃO (Rita), COMPRAS (Carlos), CONTABILIDADE (Caio),
 * PRESIDÊNCIA (Paulo), LICITAÇÕES (Ana, agente).
 */
const S = { COMUNICACAO: 's-com', COMPRAS: 's-compras', CONTAB: 's-contab', PRESIDENCIA: 's-pres', LICITACOES: 's-lic' };
const pessoa = (id: string, setor: string, papeis: string[], extra: Partial<PerfilTrabalho> = {}): PerfilTrabalho => ({
  privilegiado: false,
  usuario_id: id,
  papeis,
  setor_id: setor,
  chefe_de: [],
  ...extra,
});
const carlos = pessoa('carlos', S.COMPRAS, ['COMPRAS']);
const caio = pessoa('caio', S.CONTAB, ['CONTABILIDADE']);
const ana = pessoa('ana', S.LICITACOES, ['AGENTE_CONTRATACAO']);
const admin = pessoa('adm', S.LICITACOES, [], { privilegiado: true });
const posse = (setor: string, rotulo: string) => ({ setor_id: setor, usuario_id: null, rotulo });

const entrada = (e: Partial<EntradaPermissao>): EntradaPermissao => ({
  etapa: { codigo: 'TR', titulo: 'Termo de referência', responsavel: { papel: 'COMPRAS', setor_id: null, usuario_id: null } },
  rotulo_responsavel: 'quem é do papel Compras',
  alternativos: [],
  aguardando_demanda: false,
  pendencias: [],
  exigir_posse: true,
  posse: posse(S.COMPRAS, 'COMPRAS'),
  ...e,
});

describe('isolamento das peças — casos do relatório (§5)', () => {
  it('Anexar TR — Caio (Contabilidade) com o processo em COMPRAS: recusado, dizendo de quem é a etapa e com quem está', () => {
    const r = avaliarPermissaoEtapa(entrada({}), caio);
    expect(r).toMatchObject({ pode: false, codigo: 'NAO_RESPONSAVEL' });
    expect(r.motivo).toMatch(/é de quem é do papel Compras e o processo está com COMPRAS/);
  });

  it('Anexar TR — Carlos (Compras) com o processo em COMPRAS: permitido', () => {
    expect(avaliarPermissaoEtapa(entrada({}), carlos)).toMatchObject({ pode: true, codigo: 'OK', por_privilegio: false });
  });

  it('Gerar minutas — Ana (agente) com o processo na PRESIDÊNCIA: recusado pela posse (modo por setor)', () => {
    const e = entrada({
      etapa: { codigo: 'MINUTAS', titulo: 'Relatório do agente e minutas', responsavel: { papel: 'AGENTE_CONTRATACAO', setor_id: null, usuario_id: null } },
      rotulo_responsavel: 'quem é do papel Agente de contratação',
      alternativos: [{ usuario_id: 'ana' }],
      posse: posse(S.PRESIDENCIA, 'PRESIDÊNCIA'),
    });
    const r = avaliarPermissaoEtapa(e, ana);
    expect(r).toMatchObject({ pode: false, codigo: 'SEM_POSSE' });
    expect(r.motivo).toMatch(/O processo está com PRESIDÊNCIA/);
    // com o processo em LICITAÇÕES, pode
    expect(avaliarPermissaoEtapa({ ...e, posse: posse(S.LICITACOES, 'LICITAÇÕES') }, ana).pode).toBe(true);
    // posse não exigida (modo simples ou opção desligada no modelo): pode
    expect(avaliarPermissaoEtapa({ ...e, exigir_posse: false }, ana).pode).toBe(true);
  });

  it('Registrar pesquisa — Carlos com a demanda NÃO aprovada: recusado ("Aguardando a aprovação da demanda"), mesmo sendo o responsável', () => {
    const e = entrada({
      etapa: { codigo: 'PESQUISA', titulo: 'Pesquisa de preços e mapa', responsavel: { papel: 'COMPRAS', setor_id: null, usuario_id: null } },
      aguardando_demanda: true,
      aprovador_demanda: 'Papel Autoridade',
      pendencias: ['Formalizar a demanda (DFD)'],
      posse: posse(S.COMUNICACAO, 'COMUNICAÇÃO'),
    });
    const r = avaliarPermissaoEtapa(e, carlos);
    expect(r).toMatchObject({ pode: false, codigo: 'AGUARDANDO_DEMANDA' });
    expect(r.motivo).toMatch(/Aguardando a aprovação da demanda por Papel Autoridade/);
    // nem o administrador passa por cima da ordem (a trava é do fluxo, não da pessoa)
    expect(avaliarPermissaoEtapa(e, admin)).toMatchObject({ pode: false, codigo: 'AGUARDANDO_DEMANDA' });
  });

  it('etapa com dependência pendente: recusa com as etapas que faltam', () => {
    const r = avaliarPermissaoEtapa(entrada({ etapa: { codigo: 'AUTORIZACAO', titulo: 'Autorização', responsavel: { papel: 'AUTORIDADE', setor_id: null, usuario_id: null } }, pendencias: ['Parecer jurídico'] }), carlos);
    expect(r).toMatchObject({ pode: false, codigo: 'AGUARDANDO_ETAPAS' });
    expect(r.motivo).toMatch(/depende de "Parecer jurídico"/);
  });
});

describe('quem responde pela etapa', () => {
  it('papel, setor (e o chefe dele), pessoa designada (só ela) e os alternativos (responsável calculado, tarefa reatribuída)', () => {
    const e = (responsavel: any, alternativos: any[] = []) => ({ etapa: { codigo: 'X', titulo: 'X', responsavel }, alternativos });
    expect(ehResponsavelPelaEtapa(e({ papel: 'COMPRAS', setor_id: null, usuario_id: null }), carlos)).toBe(true);
    expect(ehResponsavelPelaEtapa(e({ papel: null, setor_id: S.COMPRAS, usuario_id: null }), carlos)).toBe(true);
    const chefe = pessoa('chefe', S.PRESIDENCIA, [], { chefe_de: [S.COMPRAS] });
    expect(ehResponsavelPelaEtapa(e({ papel: null, setor_id: S.COMPRAS, usuario_id: null }), chefe)).toBe(true);
    expect(ehResponsavelPelaEtapa(e({ papel: 'COMPRAS', setor_id: null, usuario_id: 'outro' }), carlos)).toBe(false);
    expect(ehResponsavelPelaEtapa(e({ papel: null, setor_id: null, usuario_id: 'outro' }, [{ usuario_id: 'carlos' }]), carlos)).toBe(true);
    // login do órgão / administrador não têm usuário: responsabilidade só por privilégio
    expect(ehResponsavelPelaEtapa(e({ papel: 'COMPRAS', setor_id: null, usuario_id: null }), { ...admin, usuario_id: null })).toBe(false);
  });

  it('chefe do setor que está com o processo atua na posse; diligência aberta sobre a peça dispensa a posse', () => {
    const chefeCompras = pessoa('chefe', S.PRESIDENCIA, ['COMPRAS'], { chefe_de: [S.COMPRAS] });
    expect(avaliarPermissaoEtapa(entrada({ chefe_da_posse: 'chefe' }), chefeCompras).pode).toBe(true);
    expect(avaliarPermissaoEtapa(entrada({}), chefeCompras).codigo).toBe('SEM_POSSE');
    const comJuridico = entrada({ posse: posse('s-jur', 'JURÍDICO') });
    expect(avaliarPermissaoEtapa(comJuridico, carlos).codigo).toBe('SEM_POSSE');
    expect(avaliarPermissaoEtapa({ ...comJuridico, diligencia_aberta: true }, carlos).pode).toBe(true);
  });

  it('administrador/login do órgão: passa por cima da responsabilidade e da posse, marcado para o histórico', () => {
    const r = avaliarPermissaoEtapa(entrada({ posse: posse(S.PRESIDENCIA, 'PRESIDÊNCIA') }), admin);
    expect(r).toMatchObject({ pode: true, por_privilegio: true });
    expect(r.motivo_sem_privilegio).toMatch(/PRESIDÊNCIA/);
    // sem tramitação (nenhuma posse registrada): só a responsabilidade conta
    expect(avaliarPermissaoEtapa(entrada({ posse: null }), carlos).pode).toBe(true);
    expect(avaliarPermissaoEtapa(entrada({ posse: null }), caio).pode).toBe(false);
  });

  it('quem conduz o processo (atos do processo inteiro e peça fora do modelo): agente, criador sem agente, privilegiado', () => {
    expect(ehCondutor(ana, { agente: 'ana', criador: null })).toBe(true);
    expect(ehCondutor(carlos, { agente: 'ana', criador: null })).toBe(false);
    // sem agente designado, quem criou o processo conduz
    expect(ehCondutor(carlos, { agente: null, criador: 'carlos' })).toBe(true);
    expect(ehCondutor(caio, { agente: null, criador: 'carlos' })).toBe(false);
    // administrador/login do órgão sempre; login do órgão não tem usuário
    expect(ehCondutor(admin, { agente: 'ana', criador: null })).toBe(true);
    expect(ehCondutor({ ...admin, usuario_id: null }, { agente: null, criador: null })).toBe(true);
    expect(ehCondutor({ ...carlos, usuario_id: null }, { agente: null, criador: null })).toBe(false);
  });
});
