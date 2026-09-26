import { FaseLicitacao, Licitacao, ModalidadeLicitacao, SituacaoLicitacao } from '../entities/licitacao.entity';
import { fundamentoLegalTexto } from '../../pncp/mapeamento-pncp';
import { avaliarAcoesDoMenu } from './maquina';
import { conferirPrePublicacao, InstrucaoParaConferencia } from './pre-publicacao';
import { AtoLicitacao, ConsultasTransicao, ContextoTransicao } from './transicoes.tipos';

/**
 * Tela do processo — Etapa B: menu "Mais ações" (disponíveis/bloqueadas com
 * motivo) e checklist de pré-publicação, ambos decididos pela máquina de
 * estados (as mesmas pré-condições que executam os atos). Núcleo puro.
 */

const F = FaseLicitacao;
const A = AtoLicitacao;
const M = ModalidadeLicitacao;

function lic(p: Partial<Licitacao> = {}): Licitacao {
  return { id: 'l1', numero_processo: 'P-1', modalidade: M.DISPENSA_ELETRONICA, fase: F.PLANEJAMENTO, situacao: SituacaoLicitacao.ATIVA, observacoes: null, ...p } as unknown as Licitacao;
}

function consultas(p: Record<string, any> = {}): ConsultasTransicao {
  return {
    propostasRecebidas: async () => p.propostasRecebidas ?? 0,
    propostasEnviadas: async () => p.propostasEnviadas ?? p.propostasRecebidas ?? 0,
    propostasAptasDisputa: async () => 0,
    contratosAssinados: async () => 0,
    contratosOuAtasGerados: async () => 0,
    itens: async () => [],
    itensParaPublicacao: async () => p.itensParaPublicacao ?? [],
    instrucaoProcesso: async () => p.instrucaoProcesso ?? { pode_divulgar: true, pendentes: [] },
    avisoContratacaoVigente: async () => p.avisoContratacaoVigente ?? null,
    editalVigente: async () => p.editalVigente ?? null,
    interessadosExtincao: async () => 0,
    intencaoExtincaoAberta: async () => null,
  };
}

const ctx = (l: Licitacao, c = consultas()): ContextoTransicao => ({ licitacao: l, ato: A.PUBLICAR, agora: new Date('2026-09-28T15:00:00Z'), consultas: c, dados: {} });

const mapa = async (l: Licitacao, c = consultas()) =>
  Object.fromEntries((await avaliarAcoesDoMenu(l, () => ctx(l, c))).map((a) => [a.ato, a]));

describe('Menu "Mais ações" (avaliarAcoesDoMenu)', () => {
  test('aguardando o PNCP: deserta/fracassada/retificar bloqueadas com o motivo; suspender e cancelar publicação disponíveis', async () => {
    const m = await mapa(lic({ fase: F.AGUARDANDO_DIVULGACAO }));
    expect(m[A.DECLARAR_DESERTA]).toMatchObject({ disponivel: false, fora_da_fase: true });
    expect(m[A.DECLARAR_DESERTA].motivos[0]).toMatch(/não publicado no PNCP.*sem nenhuma proposta/);
    expect(m[A.DECLARAR_FRACASSADA].motivos[0]).toMatch(/depois do julgamento/);
    expect(m[A.RETIFICAR_EDITAL]).toMatchObject({ disponivel: false, fora_da_fase: true });
    expect(m[A.SUSPENDER]).toMatchObject({ disponivel: true, requer_motivo: true });
    expect(m[A.CANCELAR_PUBLICACAO]).toMatchObject({ disponivel: true, rotulo: 'Cancelar publicação', endpoint: 'POST /licitacoes/:id/cancelar-publicacao' });
    expect(m[A.REVOGAR]).toBeDefined();
    expect(m[A.RETOMAR]).toBeUndefined();
  });

  test('cancelar publicação com propostas: bloqueado com a pendência (revogar/anular)', async () => {
    const m = await mapa(lic({ fase: F.ACOLHIMENTO_PROPOSTAS }), consultas({ propostasRecebidas: 2 }));
    expect(m[A.CANCELAR_PUBLICACAO].disponivel).toBe(false);
    expect(m[A.CANCELAR_PUBLICACAO].motivos.join(' ')).toMatch(/revogue ou anule/);
  });

  test('fase interna: suspender bloqueado com o motivo; cancelar publicação fora do menu', async () => {
    const m = await mapa(lic({ fase: F.APROVACAO_INTERNA }));
    expect(m[A.SUSPENDER]).toMatchObject({ disponivel: false, fora_da_fase: true });
    expect(m[A.SUSPENDER].motivos[0]).toMatch(/ainda não divulgado/);
    expect(m[A.CANCELAR_PUBLICACAO]).toBeUndefined();
    expect(m[A.REGISTRAR_RESULTADO_EXTERNO]).toMatchObject({ disponivel: true });
  });

  test('suspensa: retomar aparece e suspender some', async () => {
    const m = await mapa(lic({ fase: F.ACOLHIMENTO_PROPOSTAS, situacao: SituacaoLicitacao.SUSPENSA }));
    expect(m[A.RETOMAR]).toMatchObject({ disponivel: true });
    expect(m[A.SUSPENDER]).toBeUndefined();
  });

  test('processo encerrado: nenhum ato; seleção externa: sem cancelar publicação', async () => {
    expect(await avaliarAcoesDoMenu(lic({ fase: F.PUBLICADO, situacao: SituacaoLicitacao.REVOGADA }), (d) => ctx(lic(), consultas()))).toEqual([]);
    const m = await mapa(lic({ fase: F.PUBLICADO, selecao_externa: true } as any));
    expect(m[A.CANCELAR_PUBLICACAO]).toBeUndefined();
  });
});

describe('Checklist de pré-publicação (conferirPrePublicacao)', () => {
  const instrucao = (autorizada: boolean, dfd = true): InstrucaoParaConferencia => ({
    contratacao_direta: true,
    itens: [
      { tipo: 'DFD', titulo: 'Formalização da demanda (DFD)', obrigatorio: true, fundamento: 'Art. 72, I', status: dfd ? 'OK' : 'PENDENTE' },
      { tipo: 'PP', titulo: 'Estimativa de despesa', obrigatorio: true, fundamento: 'Art. 72, II', status: 'OK' },
      { tipo: 'AA', titulo: 'Autorização da autoridade competente', obrigatorio: true, fundamento: 'Art. 72, VIII', status: autorizada ? 'OK' : 'EM_APROVACAO', aprovacao: autorizada ? null : { etapa: 1, total: 2, etapa_nome: 'Gabinete', responsavel: 'Prefeita' } },
      { tipo: 'ETP', titulo: 'ETP', obrigatorio: false, fundamento: 'Art. 72, I', status: 'NAO_SE_APLICA' },
    ],
    pode_divulgar: autorizada && dfd,
    pendentes: [],
  });
  const itemOk = { status: 'ATIVO', quantidade: 10, valor_unitario_estimado: 5 };

  test('dispensa na fase interna sem itens, sem aviso e sem autorização: três bloqueios, PCA só alerta', async () => {
    const r = await conferirPrePublicacao({ ctx: ctx(lic({ fase: F.APROVACAO_INTERNA })), instrucao: instrucao(false), itensComPca: 0, pendenciasPublicar: [] });
    const por = Object.fromEntries(r.itens.map((i) => [i.chave, i]));
    expect(por.DOCUMENTOS).toMatchObject({ estado: 'OK', bloqueia: false });
    expect(por.AUTORIZACAO).toMatchObject({ estado: 'PENDENTE', bloqueia: true, acao: 'ABRIR_FASE_INTERNA', fundamento: 'Lei 14.133/2021, art. 72, VIII' });
    expect(por.AUTORIZACAO.detalhe).toMatch(/Em aprovação — Gabinete \(1\/2\) · Prefeita/);
    expect(por.AVISO).toMatchObject({ estado: 'PENDENTE', bloqueia: true, acao: 'GERAR_AVISO' });
    expect(por.ITENS).toMatchObject({ estado: 'PENDENTE', bloqueia: true, acao: 'CADASTRAR_ITENS' });
    expect(por.PCA).toMatchObject({ estado: 'ALERTA', bloqueia: false, acao: 'VINCULAR_PCA' });
    expect(r).toMatchObject({ aplicavel: true, aguardando_divulgacao: false, bloqueantes: 3, pode_publicar: false });
  });

  test('tudo pronto: pode publicar; PCA por item conta como vínculo', async () => {
    const c = consultas({ itensParaPublicacao: [itemOk], avisoContratacaoVigente: { documento_id: 'd1', versao: 2 } });
    const r = await conferirPrePublicacao({ ctx: ctx(lic({ fase: F.APROVACAO_INTERNA }), c), instrucao: instrucao(true), itensComPca: 1, pendenciasPublicar: [] });
    expect(r.pode_publicar).toBe(true);
    expect(r.itens.find((i) => i.chave === 'AVISO')!.detalhe).toBe('Versão 2 guardada no processo');
    expect(r.itens.find((i) => i.chave === 'PCA')!.estado).toBe('OK');
  });

  test('o que o PUBLICAR recusa e não coube numa linha vira "Outras pendências" (paridade com a máquina)', async () => {
    const c = consultas({ itensParaPublicacao: [itemOk], avisoContratacaoVigente: { documento_id: 'd1', versao: 1 } });
    const r = await conferirPrePublicacao({
      ctx: ctx(lic({ fase: F.APROVACAO_INTERNA }), c),
      instrucao: instrucao(true),
      itensComPca: 0,
      pendenciasPublicar: ['Instrução do processo incompleta (Art. 72). Pendências: x', 'Fim do recebimento antes do prazo mínimo'],
    });
    const outras = r.itens.find((i) => i.chave === 'OUTRAS')!;
    expect(outras.pendencias).toEqual(['Fim do recebimento antes do prazo mínimo']);
    expect(r.pode_publicar).toBe(false);
  });

  test('aguardando o PNCP: itens corrigem-se cancelando a publicação; aviso ausente não bloqueia o reenvio (é gerado no envio)', async () => {
    const r = await conferirPrePublicacao({ ctx: ctx(lic({ fase: F.AGUARDANDO_DIVULGACAO, fase_interna_concluida: true } as any)), instrucao: instrucao(true), itensComPca: 0, pendenciasPublicar: ['qualquer coisa'] });
    const por = Object.fromEntries(r.itens.map((i) => [i.chave, i]));
    expect(por.ITENS).toMatchObject({ estado: 'PENDENTE', acao: 'CANCELAR_PUBLICACAO' });
    expect(por.AVISO).toMatchObject({ estado: 'ALERTA', bloqueia: false });
    expect(por.OUTRAS).toBeUndefined(); // depois do envio não se reavalia o cronograma
    expect(r).toMatchObject({ aguardando_divulgacao: true, bloqueantes: 1 });
  });

  test('pregão: linha do edital (art. 54) no lugar do aviso', async () => {
    const r = await conferirPrePublicacao({
      ctx: ctx(lic({ modalidade: M.PREGAO_ELETRONICO, fase: F.APROVACAO_INTERNA }), consultas({ itensParaPublicacao: [itemOk] })),
      instrucao: null,
      itensComPca: 0,
      pendenciasPublicar: [],
    });
    const chaves = r.itens.map((i) => i.chave);
    expect(chaves).toContain('EDITAL');
    expect(chaves).not.toContain('AVISO');
    expect(r.itens.find((i) => i.chave === 'EDITAL')).toMatchObject({ estado: 'PENDENTE', acao: 'ANEXAR_EDITAL' });
  });
});

describe('Fundamento legal em texto (mesmo enquadramento do PNCP)', () => {
  test('por modalidade e objeto', () => {
    expect(fundamentoLegalTexto({ modalidade: 'DISPENSA_ELETRONICA', tipo_contratacao: 'COMPRA' } as any)).toBe('Lei 14.133/2021, art. 75, II');
    expect(fundamentoLegalTexto({ modalidade: 'DISPENSA_ELETRONICA', tipo_contratacao: 'OBRA' } as any)).toBe('Lei 14.133/2021, art. 75, I');
    expect(fundamentoLegalTexto({ modalidade: 'PREGAO_ELETRONICO' } as any)).toBe('Lei 14.133/2021, art. 28, I');
    expect(fundamentoLegalTexto({ modalidade: 'INEXIGIBILIDADE' } as any)).toBe('Lei 14.133/2021, art. 74, caput');
    expect(fundamentoLegalTexto({ modalidade: 'TOMADA_PRECOS' } as any)).toBeNull();
  });
});
