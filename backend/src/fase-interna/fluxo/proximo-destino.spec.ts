import {
  ContextoDestino,
  DestinoEtapa,
  PassoParaEnvio,
  acaoNaConclusao,
  destinoDaEtapa,
  destinoDoPapel,
  etapaComODetentor,
  finalidadeDasEtapas,
  responsavelNaPosse,
  sugerirEnvio,
} from './proximo-destino';
import { destinatariosSemAvisoRecente } from '../tarefas/tarefa-regras';
import { despachoDeAutuacao } from '../tramitacao-regras';

/**
 * F3a — posse única + tarefas por etapa: destino de cada etapa pelo modelo,
 * chegada ao destino (tarefas passam a quem recebeu), próximo destino,
 * ação na conclusão (SIMPLES × POR_SETOR) e aviso sem duplicar.
 * Nenhuma sequência de setores em código: tudo vem dos dados de entrada.
 */
const S_COMPRAS = 'setor-compras';
const S_CONTAB = 'setor-contab';
const S_JUR = 'setor-juridico';

const ctx = (over: Partial<ContextoDestino> = {}): ContextoDestino => ({
  modo: 'POR_SETOR',
  condutor_id: 'agente',
  papel_do_condutor: 'AGENTE_CONTRATACAO',
  setores: [
    { id: S_COMPRAS, nome: 'Compras' },
    { id: S_CONTAB, nome: 'Contabilidade' },
    { id: S_JUR, nome: 'Jurídico' },
  ],
  usuarios: [
    { id: 'agente', nome: 'Ana Agente', setor_id: null, setor_nome: null, papeis: ['AGENTE_CONTRATACAO'] },
    { id: 'c1', nome: 'Carla', setor_id: S_COMPRAS, setor_nome: 'Compras', papeis: ['COMPRAS'] },
    { id: 'c2', nome: 'Caio', setor_id: S_COMPRAS, setor_nome: 'Compras', papeis: ['COMPRAS'] },
    { id: 'k1', nome: 'Kátia', setor_id: S_CONTAB, setor_nome: 'Contabilidade', papeis: ['CONTABILIDADE'] },
    { id: 'r1', nome: 'Rita', setor_id: S_COMPRAS, setor_nome: 'Compras', papeis: ['REQUISITANTE'] },
    { id: 'r2', nome: 'Rui', setor_id: S_JUR, setor_nome: 'Jurídico', papeis: ['REQUISITANTE'] },
    { id: 'semSetor', nome: 'Sofia', setor_id: null, setor_nome: null, papeis: ['AUTORIDADE'] },
  ],
  ...over,
});

const passo = (codigo: string, situacao: string, pendencias: string[] = []): PassoParaEnvio => ({ passo: codigo, titulo: TITULOS[codigo] ?? codigo, situacao, pendencias });
const TITULOS: Record<string, string> = {
  DFD: 'Demanda (DFD)',
  PESQUISA: 'Pesquisa de preços',
  RESERVA: 'Reserva orçamentária',
  AUTORIZACAO: 'Autorização da contratação',
  PARECER: 'Parecer jurídico',
};
const dest = (setor_id: string | null, usuario_id: string | null, rotulo: string): DestinoEtapa => ({ setor_id, usuario_id, rotulo });

describe('destinoDaEtapa — para onde o processo vai, pelo responsável da etapa no modelo', () => {
  it('pessoa → ela (no setor dela); setor → o setor', () => {
    expect(destinoDaEtapa({ papel: null, setor_id: null, usuario_id: 'k1' }, ctx())).toEqual(dest(S_CONTAB, 'k1', 'Contabilidade · Kátia'));
    expect(destinoDaEtapa({ papel: 'COMPRAS', setor_id: S_JUR, usuario_id: null }, ctx())).toEqual(dest(S_JUR, null, 'Jurídico'));
  });

  it('papel: todos no mesmo setor → o setor; uma pessoa só → o setor dela (ou ela, sem lotação); espalhados → sem destino', () => {
    expect(destinoDoPapel('COMPRAS', ctx())).toEqual(dest(S_COMPRAS, null, 'Compras'));
    expect(destinoDoPapel('CONTABILIDADE', ctx())).toEqual(dest(S_CONTAB, null, 'Contabilidade'));
    expect(destinoDoPapel('AUTORIDADE', ctx())).toEqual(dest(null, 'semSetor', 'Sofia'));
    expect(destinoDoPapel('REQUISITANTE', ctx())).toBeNull();
    expect(destinoDoPapel('JURIDICO', ctx())).toBeNull();
  });

  it('papel do condutor (agente) com condutor no processo → o condutor', () => {
    expect(destinoDaEtapa({ papel: 'AGENTE_CONTRATACAO', setor_id: null, usuario_id: null }, ctx())).toEqual(dest(null, 'agente', 'Ana Agente'));
  });

  it('modo SIMPLES: o que não se resolve fica com o condutor; POR_SETOR: sem destino', () => {
    const r = { papel: 'REQUISITANTE', setor_id: null, usuario_id: null };
    expect(destinoDaEtapa(r, ctx({ modo: 'SIMPLES' }))).toEqual(dest(null, 'agente', 'Ana Agente'));
    expect(destinoDaEtapa(r, ctx({ modo: 'POR_SETOR' }))).toBeNull();
    expect(destinoDaEtapa(r, ctx({ modo: 'SIMPLES', condutor_id: null }))).toBeNull();
  });
});

describe('responsavelNaPosse — a chegada leva as tarefas das etapas do destino a quem recebeu', () => {
  const basePapel = { usuario_id: null, papel: 'CONTABILIDADE', setor_id: null };
  const destContab = dest(S_CONTAB, null, 'Contabilidade');

  it('sem posse ou posse em outro setor: nada muda', () => {
    expect(responsavelNaPosse(basePapel, 'RESERVA', destContab, null)).toBe(basePapel);
    expect(responsavelNaPosse(basePapel, 'RESERVA', destContab, { setor_id: S_JUR, usuario_id: null })).toBe(basePapel);
  });

  it('posse exatamente no destino do modelo: a tarefa continua como o modelo manda', () => {
    expect(responsavelNaPosse(basePapel, 'RESERVA', destContab, { setor_id: S_CONTAB, usuario_id: null })).toBe(basePapel);
  });

  it('enviado a uma PESSOA do setor da etapa → a tarefa vai para ela', () => {
    expect(responsavelNaPosse(basePapel, 'RESERVA', destContab, { setor_id: S_CONTAB, usuario_id: 'k1' })).toEqual({ usuario_id: 'k1', papel: null, setor_id: null });
  });

  it('enviado a outro setor PARA a etapa (etapas do envio) → a tarefa vai para o setor', () => {
    expect(responsavelNaPosse(basePapel, 'RESERVA', destContab, { setor_id: S_JUR, usuario_id: null, etapas: ['RESERVA'] })).toEqual({ usuario_id: null, papel: null, setor_id: S_JUR });
  });

  it('modo SIMPLES: a tarefa é do condutor até o processo chegar ao setor da etapa; aí vai para o setor', () => {
    const agente = { usuario_id: 'agente', papel: null, setor_id: null };
    expect(responsavelNaPosse(agente, 'RESERVA', destContab, { setor_id: null, usuario_id: 'agente' }, 'SIMPLES')).toBe(agente);
    expect(responsavelNaPosse(agente, 'RESERVA', destContab, { setor_id: S_CONTAB, usuario_id: null }, 'SIMPLES')).toEqual({ usuario_id: null, papel: null, setor_id: S_CONTAB });
    // SIMPLES: papel não resolve destino (fica com o condutor); setor/pessoa definidos no modelo, sim
    expect(destinoDaEtapa({ papel: 'CONTABILIDADE', setor_id: null, usuario_id: null }, ctx({ modo: 'SIMPLES' }))).toEqual(dest(null, 'agente', 'Ana Agente'));
    expect(destinoDaEtapa({ papel: 'CONTABILIDADE', setor_id: S_CONTAB, usuario_id: null }, ctx({ modo: 'SIMPLES' }))).toEqual(destContab);
  });

  it('etapa de uma pessoa certa, posse no setor dela: continua com ela', () => {
    const base = { usuario_id: 'k1', papel: null, setor_id: null };
    expect(responsavelNaPosse(base, 'RESERVA', dest(S_CONTAB, 'k1', 'Contabilidade · Kátia'), { setor_id: S_CONTAB, usuario_id: null })).toBe(base);
  });

  it('etapaComODetentor: pelas etapas do envio, pela pessoa ou pelo setor', () => {
    expect(etapaComODetentor('X', null, { setor_id: 's', usuario_id: null, etapas: ['X'] })).toBe(true);
    expect(etapaComODetentor('X', dest(null, 'u', 'U'), { setor_id: null, usuario_id: 'u' })).toBe(true);
    expect(etapaComODetentor('X', dest('s', null, 'S'), { setor_id: 's', usuario_id: 'outro' })).toBe(true);
    expect(etapaComODetentor('X', null, { setor_id: 's', usuario_id: null })).toBe(false);
  });
});

describe('sugerirEnvio — o próximo destino sai das etapas e da posse (nada em código)', () => {
  const destinos: Record<string, DestinoEtapa | null> = {
    DFD: dest(null, 'agente', 'Ana Agente'),
    PESQUISA: dest(S_COMPRAS, null, 'Compras'),
    RESERVA: dest(S_CONTAB, null, 'Contabilidade'),
    AUTORIZACAO: null,
    PARECER: dest(S_JUR, null, 'Jurídico'),
  };

  it('detentor com etapa a fazer: ela aparece como pendente; as de outros setores viram destinos', () => {
    const s = sugerirEnvio([passo('DFD', 'CONCLUIDO'), passo('PESQUISA', 'EM_ANDAMENTO'), passo('RESERVA', 'AGUARDANDO', ['PESQUISA'])], destinos, { setor_id: S_COMPRAS, usuario_id: null });
    expect(s.pendentes_do_detentor).toEqual([['PESQUISA', 'Pesquisa de preços']]);
    expect(s.destinos).toEqual([]);
  });

  it('etapas do detentor concluídas: destinos agrupados na ordem das etapas; o primeiro é o principal; despacho e finalidade pelos nomes', () => {
    const s = sugerirEnvio(
      [passo('PESQUISA', 'CONCLUIDO'), passo('RESERVA', 'DISPONIVEL'), passo('PARECER', 'DISPONIVEL'), passo('AUTORIZACAO', 'DISPONIVEL')],
      destinos,
      { setor_id: S_COMPRAS, usuario_id: null },
    );
    expect(s.destinos.map((d) => [d.rotulo, d.principal, d.etapas])).toEqual([
      ['Contabilidade', true, [['RESERVA', 'Reserva orçamentária']]],
      ['Jurídico', false, [['PARECER', 'Parecer jurídico']]],
    ]);
    expect(s.sem_destino).toEqual([['AUTORIZACAO', 'Autorização da contratação']]);
    expect(s.finalidade).toBe('reserva orçamentária');
    expect(s.despacho_sugerido).toBe('Encaminhe-se ao(à) Contabilidade para reserva orçamentária.');
  });

  it('várias etapas para o mesmo destino: uma linha, finalidade com todas', () => {
    const d = { ...destinos, AUTORIZACAO: dest(S_CONTAB, null, 'Contabilidade') };
    const s = sugerirEnvio([passo('RESERVA', 'DISPONIVEL'), passo('AUTORIZACAO', 'EM_ANDAMENTO')], d, null);
    expect(s.destinos).toHaveLength(1);
    expect(s.finalidade).toBe('reserva orçamentária e autorização da contratação');
  });

  it('a revisar com pendência não conta; a revisar sem pendência conta', () => {
    expect(sugerirEnvio([passo('RESERVA', 'A_REVISAR', ['PESQUISA'])], destinos, null).destinos).toEqual([]);
    expect(sugerirEnvio([passo('RESERVA', 'A_REVISAR')], destinos, null).destinos).toHaveLength(1);
  });

  it('finalidadeDasEtapas', () => {
    expect(finalidadeDasEtapas([])).toBeNull();
    expect(finalidadeDasEtapas(['ETP', 'Termo de referência', 'Pesquisa de preços'])).toBe('ETP, termo de referência e pesquisa de preços');
  });
});

describe('acaoNaConclusao — SIMPLES envia sozinho; POR_SETOR cria a tarefa "Enviar o processo"', () => {
  const destinos: Record<string, DestinoEtapa | null> = { PESQUISA: dest(S_COMPRAS, null, 'Compras'), RESERVA: dest(S_CONTAB, null, 'Contabilidade') };
  const posse = { setor_id: S_COMPRAS, usuario_id: null };
  const passos = [passo('PESQUISA', 'CONCLUIDO'), passo('RESERVA', 'DISPONIVEL')];

  it('SIMPLES: envio automático ao principal', () => {
    const a = acaoNaConclusao('SIMPLES', ['PESQUISA'], sugerirEnvio(passos, destinos, posse), posse);
    expect(a).toMatchObject({ tipo: 'ENVIAR_AUTOMATICO', destino: { setor_id: S_CONTAB }, finalidade: 'reserva orçamentária' });
  });

  it('POR_SETOR: tarefa ao detentor com o despacho sugerido', () => {
    const a = acaoNaConclusao('POR_SETOR', ['PESQUISA'], sugerirEnvio(passos, destinos, posse), posse);
    expect(a).toMatchObject({ tipo: 'TAREFA_ENVIAR', despacho: 'Encaminhe-se ao(à) Contabilidade para reserva orçamentária.' });
  });

  it('nada quando: nenhuma etapa concluiu agora, o detentor ainda tem etapa, não há outro destino ou não há posse', () => {
    expect(acaoNaConclusao('SIMPLES', [], sugerirEnvio(passos, destinos, posse), posse).tipo).toBe('NADA');
    const aindaTem = [passo('PESQUISA', 'EM_ANDAMENTO'), passo('RESERVA', 'DISPONIVEL')];
    expect(acaoNaConclusao('SIMPLES', ['DFD'], sugerirEnvio(aindaTem, destinos, posse), posse).tipo).toBe('NADA');
    expect(acaoNaConclusao('SIMPLES', ['PESQUISA'], sugerirEnvio([passo('PESQUISA', 'CONCLUIDO')], destinos, posse), posse).tipo).toBe('NADA');
    expect(acaoNaConclusao('SIMPLES', ['PESQUISA'], sugerirEnvio(passos, destinos, null), null).tipo).toBe('NADA');
  });
});

describe('aviso sem duplicar (tramitação × tarefa) e textos', () => {
  const para = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('quem recebeu o aviso da tramitação há pouco não recebe o da tarefa; fora da janela, recebe', () => {
    const avisos = [
      { usuario_id: 'a', idade_s: 30 },
      { usuario_id: 'b', idade_s: 31 * 60 },
      { usuario_id: null, idade_s: 1 },
    ];
    expect(destinatariosSemAvisoRecente(para, avisos, 30).map((x) => x.id)).toEqual(['b', 'c']);
    expect(destinatariosSemAvisoRecente(para, avisos, 0).map((x) => x.id)).toEqual(['a', 'b', 'c']); // janela 0 = sem dedupe
    expect(destinatariosSemAvisoRecente(para, [], 30)).toEqual(para);
  });

  it('despacho de autuação (posse inicial)', () => {
    expect(despachoDeAutuacao('Compras', 'pesquisa de preços')).toBe('Autue-se e encaminhe-se ao(à) Compras para pesquisa de preços.');
    expect(despachoDeAutuacao('Ana Agente')).toBe('Autue-se e encaminhe-se ao(à) Ana Agente para as providências de sua competência.');
  });
});
