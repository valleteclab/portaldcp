import { ContextoDestino, DestinoEtapa, Posse, destinoDaEtapa, destinoDoPapel, destinosPossiveisDoPapel, etapaComODetentor, sugerirEnvio, acaoNaConclusao } from './proximo-destino';
import { etapasDaFaseInterna, passosDasEtapas } from '../tarefas/etapas-fase-interna';
import { modeloSemente } from './semente-fluxo';
import type { EtapaDoModelo, ModeloFluxo } from './modelo-fluxo';

/**
 * PRÓXIMO DESTINO EM TODAS AS TRANSIÇÕES DO MODELO (homologação multiusuário:
 * "o fluxo não sugeriu o destino depois da Autorização, nem o Jurídico").
 * Percorre o modelo "Câmara — Portaria 089" inteiro — um usuário por papel,
 * cada um no seu setor — com a função REAL das etapas, e confere, a cada
 * passagem, para onde o processo é sugerido. A ordem vem SEMPRE dos dados:
 * o mesmo teste roda com a ordem da semente (autorização antes das minutas)
 * e com o parecer ANTES da autorização (a reordenação da semente).
 */

const S = {
  REQ: 'setor-comunicacao',
  COMPRAS: 'setor-compras',
  CONTAB: 'setor-contabilidade',
  PRES: 'setor-presidencia',
  LIC: 'setor-licitacoes',
  JUR: 'setor-juridico',
};
const NOME: Record<string, string> = {
  [S.REQ]: 'Comunicação',
  [S.COMPRAS]: 'Compras',
  [S.CONTAB]: 'Contabilidade',
  [S.PRES]: 'Presidência',
  [S.LIC]: 'Licitações',
  [S.JUR]: 'Jurídico',
};
const usuario = (id: string, nome: string, setor: string | null, papeis: string[]) => ({ id, nome, setor_id: setor, setor_nome: setor ? NOME[setor] : null, papeis });

const ctxBase = (over: Partial<ContextoDestino> = {}): ContextoDestino => ({
  modo: 'POR_SETOR',
  condutor_id: 'ana',
  papel_do_condutor: 'AGENTE_CONTRATACAO',
  setores: Object.entries(NOME).map(([id, nome]) => ({ id, nome })),
  usuarios: [
    usuario('rita', 'Rita', S.REQ, ['REQUISITANTE']),
    usuario('carlos', 'Carlos', S.COMPRAS, ['COMPRAS']),
    usuario('caio', 'Caio', S.CONTAB, ['CONTABILIDADE']),
    usuario('paulo', 'Paulo', S.PRES, ['AUTORIDADE']),
    usuario('ana', 'Ana', S.LIC, ['AGENTE_CONTRATACAO']),
    usuario('julia', 'Júlia', S.JUR, ['JURIDICO']),
  ],
  ...over,
});

/** Instrução da dispensa (tipos de peça por etapa do modelo). */
const PECAS_POR_PASSO: Record<string, string[]> = {
  DFD: ['DFD'],
  ETP: ['ETP', 'AR'],
  TR: ['TR'],
  PESQUISA: ['PP'],
  RESERVA: ['DO'],
  AUTORIZACAO: ['AA'],
  MINUTAS: ['RAG', 'MC'],
  PARECER: ['PJ'],
};
const instrucao = (prontos: Set<string>, emAndamento: Set<string> = new Set()) =>
  Object.values(PECAS_POR_PASSO)
    .flat()
    .map((tipo) => ({ tipo, titulo: tipo, obrigatorio: true, status: prontos.has(tipo) ? 'OK' : emAndamento.has(tipo) ? 'EM_ELABORACAO' : 'PENDENTE' }));

/** Semente com o papel do ETP/TR = Compras (como no teste do órgão). */
function modeloCamara(ordem: 'SEMENTE' | 'PARECER_ANTES'): ModeloFluxo {
  const m = modeloSemente('DISPENSA');
  const etapas: EtapaDoModelo[] = m.etapas.map((e) => {
    const x = { ...e, responsavel: { ...e.responsavel } };
    if (e.codigo === 'ETP' || e.codigo === 'TR') x.responsavel.papel = 'COMPRAS';
    if (ordem === 'PARECER_ANTES') {
      if (e.codigo === 'MINUTAS') Object.assign(x, { ordem: 55, depende_de: ['DFD', 'ETP', 'TR', 'PESQUISA', 'RESERVA'] });
      if (e.codigo === 'PARECER') Object.assign(x, { ordem: 58, depende_de: ['MINUTAS'] });
      if (e.codigo === 'AUTORIZACAO') Object.assign(x, { ordem: 60, depende_de: ['PARECER', 'RESERVA'] });
      if (e.codigo === 'PUBLICACAO') Object.assign(x, { depende_de: ['AUTORIZACAO', 'CONTROLE_INTERNO'] });
    }
    return x;
  });
  return { ...m, etapas };
}

const processo = { contratacao_direta: true, fase: 'PLANEJAMENTO', situacao: 'ATIVA' };
const passosDe = (m: ModeloFluxo, prontos: Set<string>, emAndamento?: Set<string>) =>
  passosDasEtapas(etapasDaFaseInterna(processo, instrucao(prontos, emAndamento), m));
const destinosDe = (m: ModeloFluxo, ctx: ContextoDestino): Record<string, DestinoEtapa | null> =>
  Object.fromEntries(m.etapas.map((e) => [e.codigo, destinoDaEtapa(e.responsavel, ctx)]));
const possiveisDe = (m: ModeloFluxo, ctx: ContextoDestino, destinos: Record<string, DestinoEtapa | null>) =>
  Object.fromEntries(m.etapas.filter((e) => !destinos[e.codigo] && e.responsavel.papel).map((e) => [e.codigo, destinosPossiveisDoPapel(e.responsavel.papel!, ctx)]));
const posseEm = (setor: string): Posse => ({ setor_id: setor, usuario_id: null, etapas: null });

/**
 * Percorre o processo: quem tem a posse conclui as etapas dele; a sugestão
 * tem de apontar o próximo setor; o processo vai para lá. Devolve a sequência
 * de setores e as etapas que cada um recebeu.
 */
function percorrer(m: ModeloFluxo, ctx: ContextoDestino) {
  const destinos = destinosDe(m, ctx);
  const possiveis = possiveisDe(m, ctx, destinos);
  const prontos = new Set<string>(['DFD']);
  let posse = posseEm(S.REQ);
  const caminho: Array<{ para: string; etapas: string[] }> = [];
  for (let volta = 0; volta < 12; volta++) {
    // quem está com o processo faz o que é dele (tudo o que está disponível para ele)
    for (let i = 0; i < 5; i++) {
      const doDetentor = passosDe(m, prontos).filter(
        (p) => (p.situacao === 'DISPONIVEL' || p.situacao === 'EM_ANDAMENTO') && etapaComODetentor(p.passo, destinos[p.passo], posse),
      );
      if (!doDetentor.length) break;
      for (const p of doDetentor) for (const t of PECAS_POR_PASSO[p.passo] ?? []) prontos.add(t);
    }
    const passos = passosDe(m, prontos);
    if (passos.every((p) => p.situacao === 'CONCLUIDO' || p.passo === 'PUBLICACAO')) {
      const pub = passos.find((p) => p.passo === 'PUBLICACAO');
      if (!pub || etapaComODetentor('PUBLICACAO', destinos.PUBLICACAO, posse)) break;
    }
    const s = sugerirEnvio(passos, destinos, posse, possiveis);
    const principal = s.destinos.find((d) => d.principal);
    if (!principal) throw new Error(`Sem sugestão com o processo em ${NOME[posse.setor_id!]} (sem destino: ${JSON.stringify(s.sem_destino)})`);
    expect(s.pendentes_do_detentor).toEqual([]);
    expect(s.despacho_sugerido).toMatch(new RegExp(principal.rotulo));
    caminho.push({ para: principal.setor_id!, etapas: principal.etapas.map(([c]) => c) });
    posse = posseEm(principal.setor_id!);
  }
  return caminho;
}

describe('próximo destino — modelo "Câmara — Portaria 089" inteiro (ordem vinda dos dados)', () => {
  it('ordem da semente (autorização antes das minutas): sugere Presidência → Licitações → Jurídico → Licitações', () => {
    const caminho = percorrer(modeloCamara('SEMENTE'), ctxBase());
    expect(caminho.map((c) => NOME[c.para])).toEqual(['Compras', 'Contabilidade', 'Presidência', 'Licitações', 'Jurídico', 'Licitações']);
    expect(caminho.map((c) => c.etapas)).toEqual([['ETP', 'TR', 'PESQUISA'], ['RESERVA'], ['AUTORIZACAO'], ['MINUTAS'], ['PARECER'], ['PUBLICACAO']]);
  });

  it('parecer ANTES da autorização (reordenação): Licitações → Jurídico → Presidência → Licitações', () => {
    const caminho = percorrer(modeloCamara('PARECER_ANTES'), ctxBase());
    expect(caminho.map((c) => NOME[c.para])).toEqual(['Compras', 'Contabilidade', 'Licitações', 'Jurídico', 'Presidência', 'Licitações']);
    expect(caminho.map((c) => c.etapas)).toEqual([['ETP', 'TR', 'PESQUISA'], ['RESERVA'], ['MINUTAS'], ['PARECER'], ['AUTORIZACAO'], ['PUBLICACAO']]);
  });

  it('depois da autorização, SEM agente designado: o papel do agente resolve pelo setor de quem o tem (ignora o administrador sem lotação)', () => {
    const ctx = ctxBase({
      condutor_id: null,
      usuarios: [...ctxBase().usuarios, usuario('admin', 'Administrador', null, ['AGENTE_CONTRATACAO', 'JURIDICO', 'AUTORIDADE'])],
    });
    const m = modeloCamara('SEMENTE');
    const destinos = destinosDe(m, ctx);
    expect(destinos.MINUTAS).toMatchObject({ setor_id: S.LIC });
    expect(destinos.PARECER).toMatchObject({ setor_id: S.JUR });
    const prontos = new Set(['DFD', 'ETP', 'AR', 'TR', 'PP', 'DO', 'AA']);
    const s = sugerirEnvio(passosDe(m, prontos), destinos, posseEm(S.PRES), possiveisDe(m, ctx, destinos));
    expect(s.destinos.find((d) => d.principal)).toMatchObject({ setor_id: S.LIC, etapas: [['MINUTAS', 'Relatório do agente e minutas']] });
  });

  it('Jurídico (7b, irmã das minutas): o agente que TAMBÉM tem o papel Jurídico não tira a sugestão — tirando quem está com o processo, sobra a Procuradoria', () => {
    const ctx = ctxBase({
      condutor_id: null,
      usuarios: ctxBase().usuarios.map((u) => (u.id === 'ana' ? { ...u, papeis: ['AGENTE_CONTRATACAO', 'JURIDICO'] } : u)),
    });
    const m = modeloCamara('SEMENTE');
    const destinos = destinosDe(m, ctx);
    expect(destinos.PARECER).toBeNull(); // papel espalhado (Licitações e Jurídico)
    const possiveis = possiveisDe(m, ctx, destinos);
    const prontos = new Set(['DFD', 'ETP', 'AR', 'TR', 'PP', 'DO', 'AA', 'RAG', 'MC']);
    const s = sugerirEnvio(passosDe(m, prontos), destinos, posseEm(S.LIC), possiveis);
    const principal = s.destinos.find((d) => d.principal)!;
    expect(principal).toMatchObject({ setor_id: S.JUR, etapas: [['PARECER', 'Parecer jurídico']] });
    expect(s.sem_destino).toEqual([]);
    expect(s.despacho_sugerido).toMatch(/Jurídico/);
  });

  it('minutas ainda em andamento com quem está com o processo: o Jurídico já aparece como próximo destino ("depois de concluir"), sem envio automático', () => {
    const ctx = ctxBase();
    const m = modeloCamara('SEMENTE');
    const destinos = destinosDe(m, ctx);
    const prontos = new Set(['DFD', 'ETP', 'AR', 'TR', 'PP', 'DO', 'AA']);
    const posse = posseEm(S.LIC);
    const s = sugerirEnvio(passosDe(m, prontos, new Set(['RAG'])), destinos, posse);
    expect(s.pendentes_do_detentor.map(([c]) => c)).toEqual(['MINUTAS']);
    const principal = s.destinos.find((d) => d.principal)!;
    expect(principal).toMatchObject({ setor_id: S.JUR, depois_de: [['MINUTAS', 'Relatório do agente e minutas']] });
    // nunca vira envio automático nem tarefa "Enviar" enquanto o detentor trabalha
    expect(acaoNaConclusao('SIMPLES', ['AUTORIZACAO'], s, posse).tipo).toBe('NADA');
  });

  it('com o parecer antes da autorização: depois do parecer, a Presidência; depois da autorização, Licitações (publicação)', () => {
    const ctx = ctxBase();
    const m = modeloCamara('PARECER_ANTES');
    const destinos = destinosDe(m, ctx);
    const aposParecer = sugerirEnvio(passosDe(m, new Set(['DFD', 'ETP', 'AR', 'TR', 'PP', 'DO', 'RAG', 'MC', 'PJ'])), destinos, posseEm(S.JUR));
    expect(aposParecer.destinos.find((d) => d.principal)).toMatchObject({ setor_id: S.PRES, etapas: [['AUTORIZACAO', 'Autorização da autoridade competente']] });
    const aposAutorizacao = sugerirEnvio(passosDe(m, new Set(['DFD', 'ETP', 'AR', 'TR', 'PP', 'DO', 'RAG', 'MC', 'PJ', 'AA'])), destinos, posseEm(S.PRES));
    expect(aposAutorizacao.destinos.find((d) => d.principal)).toMatchObject({ setor_id: S.LIC, etapas: [['PUBLICACAO', 'Conformidade e publicação']] });
  });
});

describe('destinoDoPapel / destinosPossiveisDoPapel', () => {
  it('quem tem o papel sem lotação não desempata contra os lotados; espalhados continuam sem destino único', () => {
    const ctx = ctxBase({ usuarios: [usuario('a', 'A', S.LIC, ['X']), usuario('adm', 'Adm', null, ['X'])] });
    expect(destinoDoPapel('X', ctx)).toMatchObject({ setor_id: S.LIC, usuario_id: null });
    const ctx2 = ctxBase({ usuarios: [usuario('a', 'A', S.LIC, ['X']), usuario('b', 'B', S.JUR, ['X'])] });
    expect(destinoDoPapel('X', ctx2)).toBeNull();
    expect(destinosPossiveisDoPapel('X', ctx2).map((d) => d.setor_id)).toEqual([S.LIC, S.JUR]);
    // só sem lotação: continua a pessoa
    const ctx3 = ctxBase({ usuarios: [usuario('s', 'Sofia', null, ['AUTORIDADE'])] });
    expect(destinoDoPapel('AUTORIDADE', ctx3)).toMatchObject({ setor_id: null, usuario_id: 's' });
  });
});
