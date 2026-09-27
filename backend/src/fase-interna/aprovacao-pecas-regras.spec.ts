import {
  MODELOS_PRONTOS_SEMENTE,
  conflitoDeFluxo,
  deveSubmeterAutomaticamente,
  fluxoEhGenerico,
  fluxoParaTipo,
  podeDecidirEtapa,
  rascunhoDoModelo,
  rotuloAguardando,
  tiposDoFluxo,
  tipoDocumentoValido,
  validarFluxoAprovacao,
  validarModeloPronto,
} from './aprovacao-pecas-regras';
import { pecaContaComoPronta, registroDeEmissao } from './peca-regras';

const fluxo = (id: string, tipo: string | null, extra: Partial<{ tipos_documento: string[]; ativo: boolean; updated_at: string }> = {}) => ({
  id,
  nome: id,
  tipo_documento: tipo,
  tipos_documento: extra.tipos_documento ?? null,
  ativo: extra.ativo ?? true,
  updated_at: extra.updated_at ?? '2026-09-01T12:00:00Z',
});

/** TR feito no sistema e EMITIDO (gerado) com o conteúdo atual. */
function trEmitido(em = '2026-09-20T12:00:00Z') {
  const doc: any = { tipo: 'TR', status: 'EM_ELABORACAO', origem: 'INTERNO', versao_atual: true, descricao: '<p>TR</p>', arquivo_pdf_path: 'tr.pdf', dados_estruturados: { objeto: 'x' } };
  doc.dados_estruturados._emitido = registroDeEmissao(doc, { id: 'u1', nome: 'Autor' }, new Date(em));
  return doc;
}

describe('aprovação interna das peças — resolução do fluxo', () => {
  it('fluxo próprio do tipo vence o genérico; genérico vale para quem não tem fluxo; sem nenhum → null', () => {
    const fluxos = [fluxo('generico', null), fluxo('tr', 'TR'), fluxo('minutas', 'ME', { tipos_documento: ['ME', 'MC', 'RAG'] })];
    expect(fluxoParaTipo(fluxos, 'TR')?.id).toBe('tr');
    expect(fluxoParaTipo(fluxos, 'MC')?.id).toBe('minutas');
    expect(fluxoParaTipo(fluxos, 'RAG')?.id).toBe('minutas');
    expect(fluxoParaTipo(fluxos, 'DFD')?.id).toBe('generico');
    expect(fluxoParaTipo([fluxo('tr', 'TR')], 'DFD')).toBeNull();
  });

  it('inativo não conta; dois para o mesmo tipo → o mais recente', () => {
    const fluxos = [fluxo('velho', 'TR', { updated_at: '2026-01-01' }), fluxo('novo', 'TR', { updated_at: '2026-09-01' }), fluxo('off', 'DFD', { ativo: false })];
    expect(fluxoParaTipo(fluxos, 'TR')?.id).toBe('novo');
    expect(fluxoParaTipo(fluxos, 'DFD')).toBeNull();
  });

  it('tipos do fluxo = tipo_documento ∪ tipos_documento; genérico = sem tipo', () => {
    expect(tiposDoFluxo({ tipo_documento: 'ME', tipos_documento: ['ME', 'MC'] })).toEqual(['ME', 'MC']);
    expect(fluxoEhGenerico({ tipo_documento: null, tipos_documento: [] })).toBe(true);
    expect(fluxoEhGenerico({ tipo_documento: null, tipos_documento: ['TR'] })).toBe(false);
  });

  it('conflito: outro fluxo ativo já cobre o tipo (ou os dois são genéricos)', () => {
    const fluxos = [fluxo('tr', 'TR'), fluxo('gen', null)];
    expect(conflitoDeFluxo(fluxos, { tipos: ['TR', 'ETP'] })).toMatchObject({ fluxo: { id: 'tr' }, tipos: ['TR'] });
    expect(conflitoDeFluxo(fluxos, { tipos: [] })).toMatchObject({ fluxo: { id: 'gen' } });
    expect(conflitoDeFluxo(fluxos, { id: 'tr', tipos: ['TR'] })).toBeNull();
    expect(conflitoDeFluxo(fluxos, { tipos: ['DFD'] })).toBeNull();
  });
});

describe('aprovação interna das peças — submissão automática', () => {
  it('SEM aprovação interna ligada: nada muda (não envia)', () => {
    expect(deveSubmeterAutomaticamente(trEmitido(), [], { aprovacaoInterna: false })).toMatchObject({ submeter: false });
  });

  it('com aprovação interna: peça emitida vai; rascunho (autosave) não vai', () => {
    expect(deveSubmeterAutomaticamente(trEmitido(), [], { aprovacaoInterna: true })).toEqual({ submeter: true });
    const rascunho = { tipo: 'TR', status: 'EM_ELABORACAO', origem: 'INTERNO', descricao: '<p>TR</p>', dados_estruturados: { objeto: 'x' } };
    expect(deveSubmeterAutomaticamente(rascunho, [], { aprovacaoInterna: true })).toMatchObject({ submeter: false, motivo: expect.stringMatching(/rascunho/) });
    // editada depois de emitida: a impressão não bate → não é mais a peça emitida
    const editada = trEmitido();
    editada.descricao = '<p>TR alterado</p>';
    expect(deveSubmeterAutomaticamente(editada, [], { aprovacaoInterna: true })).toMatchObject({ submeter: false });
  });

  it('não envia de novo: em aprovação, já decidida sem nova emissão; reenvia após reprovação + nova emissão', () => {
    const doc = trEmitido('2026-09-20T12:00:00Z');
    expect(deveSubmeterAutomaticamente(doc, [{ status: 'EM_ANALISE' }], { aprovacaoInterna: true })).toMatchObject({ submeter: false, motivo: 'já está em aprovação' });
    const reprovada = { ...doc, status: 'REPROVADO' };
    const decisao = [{ status: 'REPROVADA', data_decisao: '2026-09-21T12:00:00Z' }];
    expect(deveSubmeterAutomaticamente(reprovada, decisao, { aprovacaoInterna: true })).toMatchObject({ submeter: false });
    const corrigida = trEmitido('2026-09-22T12:00:00Z');
    corrigida.status = 'REPROVADO';
    expect(deveSubmeterAutomaticamente(corrigida, decisao, { aprovacaoInterna: true })).toEqual({ submeter: true });
  });

  it('não vai: não se aplica, peça que só vale assinada, aprovada/assinada, versão substituída, legado', () => {
    const base = trEmitido();
    expect(deveSubmeterAutomaticamente({ ...base, dados_estruturados: { ...base.dados_estruturados, nao_se_aplica: true } }, [], { aprovacaoInterna: true }).submeter).toBe(false);
    expect(deveSubmeterAutomaticamente({ ...base, dados_estruturados: { ...base.dados_estruturados, _exige_assinatura: true } }, [], { aprovacaoInterna: true }).submeter).toBe(false);
    expect(deveSubmeterAutomaticamente({ ...base, status: 'APROVADO' }, [], { aprovacaoInterna: true }).submeter).toBe(false);
    expect(deveSubmeterAutomaticamente({ ...base, status: 'ASSINADO' }, [], { aprovacaoInterna: true }).submeter).toBe(false);
    expect(deveSubmeterAutomaticamente({ ...base, versao_atual: false }, [], { aprovacaoInterna: true }).submeter).toBe(false);
    expect(deveSubmeterAutomaticamente({ ...base, dados_estruturados: { ...base.dados_estruturados, _emitido: { em: 'x', legado: true } } }, [], { aprovacaoInterna: true }).submeter).toBe(false);
  });

  it('anexada: só a anexada agora pela etapa (a juntada em lote não) e uma vez só', () => {
    const anexada = { tipo: 'TR', status: 'IMPORTADO', origem: 'ARQUIVO', caminho_arquivo: 'a.pdf' };
    expect(deveSubmeterAutomaticamente(anexada, [], { aprovacaoInterna: true, anexadaAgora: true })).toEqual({ submeter: true });
    expect(deveSubmeterAutomaticamente(anexada, [], { aprovacaoInterna: true })).toMatchObject({ submeter: false });
    expect(deveSubmeterAutomaticamente(anexada, [{ status: 'APROVADA', data_decisao: '2026-01-01' }], { aprovacaoInterna: true, anexadaAgora: true })).toMatchObject({ submeter: false });
  });

  it('em aprovação a peça não conta como pronta (regra da #517/#519)', () => {
    expect(pecaContaComoPronta({ ...trEmitido(), status: 'AGUARDANDO_APROVACAO' })).toBe(false);
    expect(pecaContaComoPronta({ ...trEmitido(), status: 'APROVADO' })).toBe(true);
    expect(pecaContaComoPronta({ ...trEmitido(), status: 'REPROVADO' })).toBe(false);
  });
});

describe('aprovação interna das peças — quem decide', () => {
  const pessoa = (p: Partial<{ admin: boolean; id: string | null; setor_id: string | null; conduz: boolean }>) => ({ admin: false, id: null, setor_id: null, conduz: false, ...p });

  it('pessoa indicada: só ela (nem o setor dela, nem quem conduz)', () => {
    const etapa = { usuario_id: 'maria', setor_id: 'compras' };
    expect(podeDecidirEtapa(etapa, pessoa({ id: 'maria' }))).toBe(true);
    expect(podeDecidirEtapa(etapa, pessoa({ id: 'joao', setor_id: 'compras', conduz: true }))).toBe(false);
  });

  it('setor indicado: quem é do setor', () => {
    const etapa = { usuario_id: null, setor_id: 'compras' };
    expect(podeDecidirEtapa(etapa, pessoa({ id: 'joao', setor_id: 'compras' }))).toBe(true);
    expect(podeDecidirEtapa(etapa, pessoa({ id: 'ana', setor_id: 'juridico', conduz: true }))).toBe(false);
  });

  it('sem responsável (aprovação única): quem conduz o processo; admin da plataforma sempre', () => {
    const etapa = { usuario_id: null, setor_id: null };
    expect(podeDecidirEtapa(etapa, pessoa({ id: 'agente', conduz: true }))).toBe(true);
    expect(podeDecidirEtapa(etapa, pessoa({ id: 'apoio' }))).toBe(false);
    expect(podeDecidirEtapa({ usuario_id: 'x' }, pessoa({ admin: true }))).toBe(true);
  });

  it('rótulo "Aguardando aprovação: <etapa> — <quem> (1 de 2)"', () => {
    expect(rotuloAguardando({ ordem: 1, nome: 'Conferência', usuario_nome: 'Maria' }, 2)).toBe('Aguardando aprovação: Conferência — Maria (1 de 2)');
    expect(rotuloAguardando({ ordem: 1, nome: 'Aprovação' }, 1)).toBe('Aguardando aprovação: Aprovação — quem conduz o processo (1 de 1)');
    expect(rotuloAguardando({ ordem: 2, nome: 'Diretoria', setor_nome: 'Diretoria Adm.' }, 2)).toMatch(/setor Diretoria Adm\. \(2 de 2\)/);
  });
});

describe('modelos prontos → fluxo do órgão', () => {
  const ctx = { setores: new Map([['s1', 'Compras'], ['s2', 'Diretoria']]), usuarios: new Map([['u1', 'Maria']]) };

  it('a semente traz os 4 modelos da Câmara com tipos de peça reais', () => {
    expect(MODELOS_PRONTOS_SEMENTE.map((m) => m.codigo)).toEqual(['TR_CONFERIDO_PELO_CHEFE', 'PESQUISA_CONFERIDA', 'MINUTAS_REVISADAS', 'DFD_ASSINADO_PELA_DIRETORIA']);
    for (const m of MODELOS_PRONTOS_SEMENTE) {
      expect(m.tipos_documento.length).toBeGreaterThan(0);
      expect(m.tipos_documento.every(tipoDocumentoValido)).toBe(true);
      expect(validarModeloPronto(m).ok).toBe(true);
    }
    const minutas = MODELOS_PRONTOS_SEMENTE.find((m) => m.codigo === 'MINUTAS_REVISADAS')!;
    expect(minutas.tipos_documento).toEqual(['ME', 'MC', 'RAG']);
    const dfd = MODELOS_PRONTOS_SEMENTE.find((m) => m.codigo === 'DFD_ASSINADO_PELA_DIRETORIA')!;
    expect(dfd.etapas.at(-1)?.exige_assinatura).toBe(true);
  });

  it('rascunho do modelo: mesmas etapas, sem setor/pessoa — salvar sem escolher é recusado', () => {
    const pesquisa = MODELOS_PRONTOS_SEMENTE.find((m) => m.codigo === 'PESQUISA_CONFERIDA')!;
    const r = rascunhoDoModelo(pesquisa);
    expect(r).toMatchObject({ nome: 'Pesquisa conferida', tipo_documento: 'PP', tipos_documento: ['PP', 'MCP'], modelo_origem: 'PESQUISA_CONFERIDA' });
    expect(r.etapas?.map((e) => [e.nome, e.setor_id, e.usuario_id])).toEqual([
      ['Conferência do chefe de Compras', null, null],
      ['Aprovação do Diretor Administrativo', null, null],
    ]);
    const semEscolha = validarFluxoAprovacao(r, ctx);
    expect(semEscolha.ok).toBe(false);
    expect(!semEscolha.ok && semEscolha.erros.join(' ')).toMatch(/Etapa 1 .*escolha o setor ou a pessoa \(sugestão do modelo: Chefe do setor de Compras\)/);

    r.etapas![0].setor_id = 's1';
    r.etapas![1].usuario_id = 'u1';
    const ok = validarFluxoAprovacao(r, ctx);
    expect(ok.ok).toBe(true);
    expect(ok.ok && ok.valor.etapas.map((e) => [e.setor_nome ?? null, e.usuario_nome ?? null])).toEqual([
      ['Compras', null],
      [null, 'Maria'],
    ]);
  });

  it('validação: setor/pessoa de outro órgão, tipo inválido, assinatura fora da última etapa', () => {
    const r = validarFluxoAprovacao(
      { nome: 'X', tipo_documento: 'XYZ', etapas: [{ nome: 'A', setor_id: 'fora', exige_assinatura: true }, { nome: 'B', usuario_id: 'outro' }] },
      ctx,
    );
    expect(r.ok).toBe(false);
    const erros = !r.ok ? r.erros.join(' ') : '';
    expect(erros).toMatch(/Tipo de peça inválido: XYZ/);
    expect(erros).toMatch(/Etapa 1: o setor escolhido não é deste órgão/);
    expect(erros).toMatch(/Etapa 2: a pessoa escolhida não é deste órgão/);
    expect(erros).toMatch(/só a última etapa pode exigir assinatura/);
  });

  it('fluxo feito do zero (sem modelo) aceita etapa sem responsável (aprovação por quem conduz)', () => {
    const r = validarFluxoAprovacao({ nome: 'Genérico', tipo_documento: null, etapas: [{ nome: 'Chefia' }] }, ctx);
    expect(r.ok).toBe(true);
    expect(r.ok && r.valor).toMatchObject({ tipo_documento: null, tipos_documento: null, modelo_origem: null });
  });
});
