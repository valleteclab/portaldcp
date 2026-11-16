import { roteiroDispensa, roteiroFluxo, type DadosRoteiroDispensa } from './roteiro-guia';

const ninguem = { aprovar: [], montar: [], etapa: [], publicar: [] };
const podeTudo = { demanda: true, aprovar: true, montar: true, etapa: true, publicar: true };

function dispensa(over: Partial<DadosRoteiroDispensa> = {}): DadosRoteiroDispensa {
  return {
    iniciado: true,
    fluxo_ativo: true,
    demanda: null,
    dfd: null,
    processo: null,
    etapas: [
      { chave: 'a1', titulo: 'DFD', tipo: 'DFD', responsavel: 'Compras', concluida: false },
      { chave: 'a2', titulo: 'Parecer jurídico', tipo: 'PARECER_JURIDICO', responsavel: 'Jurídico', concluida: false },
    ],
    publicado: false,
    pode: podeTudo,
    quem_pode: ninguem,
    ...over,
  };
}

describe('roteiroFluxo', () => {
  it('sem fluxo: o atual é criar, apontando para o botão Novo fluxo', () => {
    const r = roteiroFluxo({ fluxo: null, ativo: null, pode_agir: true, quem_pode: [] });
    expect(r.passos.map((p) => p.situacao)).toEqual(['ATUAL', 'A_FAZER', 'A_FAZER']);
    expect(r.passos[0].tela?.alvo).toBe('novo-fluxo');
  });

  it('rascunho com etapa sem responsável: atual é desenhar, na tela daquele fluxo', () => {
    const r = roteiroFluxo({ fluxo: { id: 'f1', nome: 'X', status: 'RASCUNHO', etapas: 3, etapas_sem_responsavel: 1 }, ativo: null, pode_agir: true, quem_pode: [] });
    expect(r.passos.map((p) => p.situacao)).toEqual(['CONCLUIDO', 'ATUAL', 'A_FAZER']);
    expect(r.passos[1].tela?.rota).toBe('/orgao/configuracoes/fluxos?fluxo=f1');
  });

  it('fluxo ativo conclui o roteiro inteiro', () => {
    const r = roteiroFluxo({ fluxo: { id: 'f1', nome: 'X', status: 'PUBLICADO', etapas: 1, etapas_sem_responsavel: 1 }, ativo: { id: 'f1', nome: 'X' }, pode_agir: false, quem_pode: [] });
    expect(r.concluidos).toBe(3);
    expect(r.referencia).toContain('X');
  });
});

describe('roteiroDispensa', () => {
  it('não iniciado: nenhum passo atual', () => {
    const r = roteiroDispensa(dispensa({ iniciado: false }));
    expect(r.passos.some((p) => p.situacao === 'ATUAL')).toBe(false);
  });

  it('sem fluxo ativo: bloqueia e não marca passo atual', () => {
    const r = roteiroDispensa(dispensa({ fluxo_ativo: false }));
    expect(r.bloqueio).toMatch(/roteiro A/);
    expect(r.passos.some((p) => p.situacao === 'ATUAL')).toBe(false);
  });

  it('passos fixos + etapas do fluxo + publicação ao fim quando o fluxo não tem', () => {
    const r = roteiroDispensa(dispensa());
    expect(r.passos.map((p) => p.chave)).toEqual(['demanda', 'aprovacao', 'abrir-processo', 'etapa:a1', 'etapa:a2', 'publicacao']);
    expect(r.passos[0].tela?.alvo).toBe('nova-demanda');
  });

  it('fluxo com etapa de publicação não ganha publicação extra; Notificar some do roteiro', () => {
    const r = roteiroDispensa(
      dispensa({
        etapas: [
          { chave: 'a1', titulo: 'Avisar', tipo: 'NOTIFICAR', responsavel: null, concluida: false },
          { chave: 'a2', titulo: 'Publicação', tipo: 'PUBLICACAO', responsavel: 'Agente', concluida: false },
        ],
      }),
    );
    expect(r.passos.map((p) => p.chave)).toEqual(['demanda', 'aprovacao', 'abrir-processo', 'etapa:a2']);
  });

  it('demanda enviada e aprovada: atual é abrir o processo, pela tela do DFD quando ele existe', () => {
    const r = roteiroDispensa(dispensa({ demanda: { id: 'd1', rotulo: 'DEM-1', enviada: true, aprovada: true }, dfd: { id: 'x1' } }));
    const atual = r.passos.find((p) => p.situacao === 'ATUAL');
    expect(atual?.chave).toBe('abrir-processo');
    expect(atual?.tela?.rota).toBe('/orgao/demandas/dfd/x1');
    expect(r.referencia).toBe('Demanda: DEM-1');
  });

  it('aprovação aponta para o botão da linha daquela demanda', () => {
    const r = roteiroDispensa(dispensa({ demanda: { id: 'd1', rotulo: null, enviada: true, aprovada: false } }));
    expect(r.passos[1].situacao).toBe('ATUAL');
    expect(r.passos[1].tela?.alvo).toBe('aprovar-demanda-d1');
  });

  it('processo aberto: etapas abrem a tela do processo; quem pode só na etapa atual', () => {
    const r = roteiroDispensa(
      dispensa({
        demanda: { id: 'd1', rotulo: null, enviada: true, aprovada: true },
        processo: { id: 'p1', numero: '2026/00052', licitacao_id: 'l1' },
        etapas: [
          { chave: 'a1', titulo: 'DFD', tipo: 'DFD', responsavel: 'Compras', concluida: true },
          { chave: 'a2', titulo: 'Parecer jurídico', tipo: 'PARECER_JURIDICO', responsavel: 'Jurídico', concluida: false },
          { chave: 'a3', titulo: 'Autorização', tipo: 'AUTORIZACAO', responsavel: 'Presidência', concluida: false },
        ],
        quem_pode: { ...ninguem, etapa: [{ nome: 'Dra. Teste', email: 'juridico@teste' }] },
      }),
    );
    const atual = r.passos.find((p) => p.situacao === 'ATUAL')!;
    expect(atual.chave).toBe('etapa:a2');
    expect(atual.tela?.rota).toBe('/orgao/processo/p1');
    expect(atual.quem).toBe('Jurídico');
    expect(atual.quem_pode).toHaveLength(1);
    expect(r.passos.find((p) => p.chave === 'etapa:a3')!.quem_pode).toHaveLength(0);
    expect(r.passos.find((p) => p.chave === 'publicacao')!.tela?.rota).toBe('/orgao/processos/l1?detalhes=1');
  });

  it('publicado: roteiro concluído', () => {
    const r = roteiroDispensa(
      dispensa({
        demanda: { id: 'd1', rotulo: null, enviada: true, aprovada: true },
        processo: { id: 'p1', numero: null, licitacao_id: 'l1' },
        etapas: [{ chave: 'a1', titulo: 'DFD', tipo: 'DFD', responsavel: null, concluida: true }],
        publicado: true,
      }),
    );
    expect(r.concluidos).toBe(r.total);
  });
});
