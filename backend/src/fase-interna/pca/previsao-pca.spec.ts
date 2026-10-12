import { previsaoPcaDaContratacao, quandoPrevisto, situacaoPrevisaoPca, textoPrevisaoPca, type ItemPcaDaContratacao } from './previsao-pca';

const item: ItemPcaDaContratacao = {
  id: 'i1',
  numero_item: 14,
  descricao_objeto: 'Serviços de manutenção e limpeza de equipamentos de geração solar',
  valor_estimado: 45000,
  trimestre_previsto: 4,
  mes_previsto_contratacao: null,
  pca_id: 'p1',
  ano_exercicio: 2026,
  numero_pca: 'PCA 2026',
  pca_status: 'APROVADO',
  data_aprovacao: '2026-01-20',
};

describe('previsão no PCA — texto único do DFD e do ETP (inc. II)', () => {
  it('com item do PCA: cita plano, item, descrição, valor e quando', () => {
    const t = textoPrevisaoPca({ item, sem_pca: false, justificativa_sem_pca: null });
    expect(t).toContain('Plano de Contratações Anual de 2026');
    expect(t).toContain('item nº 14');
    expect(t).toContain('geração solar');
    expect(t).toContain('R$');
    expect(t).toContain('4º trimestre');
    expect(t).toContain('art. 12, § 1º');
    expect(situacaoPrevisaoPca({ item, sem_pca: false, justificativa_sem_pca: null })).toBe('PREVISTA');
  });

  it('fora do PCA com justificativa: leva a justificativa, escapada', () => {
    const t = textoPrevisaoPca({ item: null, sem_pca: true, justificativa_sem_pca: 'Falha <urgente> nos painéis' });
    expect(t).toContain('não consta do Plano');
    expect(t).toContain('Falha &lt;urgente&gt;');
    expect(situacaoPrevisaoPca({ item: null, sem_pca: true, justificativa_sem_pca: 'x' })).toBe('FORA_DO_PCA');
  });

  it('sem vínculo e sem justificativa: texto a detalhar', () => {
    expect(textoPrevisaoPca({ item: null, sem_pca: false, justificativa_sem_pca: null })).toContain('justificativa a ser detalhada');
    expect(situacaoPrevisaoPca({ item: null, sem_pca: true, justificativa_sem_pca: null })).toBe('SEM_VINCULO');
  });

  it('quando previsto: trimestre vence o mês; mês sozinho vira nome', () => {
    expect(quandoPrevisto({ trimestre_previsto: 2, mes_previsto_contratacao: 10 })).toBe('2º trimestre');
    expect(quandoPrevisto({ trimestre_previsto: null, mes_previsto_contratacao: 10 })).toBe('outubro');
    expect(quandoPrevisto({ trimestre_previsto: null, mes_previsto_contratacao: null })).toBeNull();
  });

  it('consulta: o vínculo do processo vence o dos itens, do DFD e da demanda', async () => {
    const chamadas: unknown[][] = [];
    const consulta = async (sql: string, params: unknown[]) => {
      chamadas.push(params);
      if (sql.includes('FROM licitacoes')) return [{ processo: null, itens: 'i-itens', dfd: 'i-dfd', dfd_numero: '17/2026', demanda: null, sem_pca: false, justificativa_sem_pca: null }];
      return [{ ...item, id: params[0], valor_estimado: '45000.00', numero_item: '14' }];
    };
    const r = await previsaoPcaDaContratacao(consulta, 'lic');
    expect(chamadas[1]).toEqual(['i-itens']);
    expect(r.origem).toBe('ITENS');
    expect(r.dfd_numero).toBe('17/2026');
    expect(r.item?.valor_estimado).toBe(45000);
    expect(r.item?.numero_item).toBe(14);
    expect(r.situacao).toBe('PREVISTA');
  });

  it('consulta: sem nenhum vínculo não procura item', async () => {
    const consulta = async () => [{ processo: null, itens: null, dfd: null, dfd_numero: null, demanda: null, sem_pca: true, justificativa_sem_pca: 'Urgência' }];
    const r = await previsaoPcaDaContratacao(consulta, 'lic');
    expect(r.item).toBeNull();
    expect(r.situacao).toBe('FORA_DO_PCA');
    expect(r.texto).toContain('Urgência');
  });
});
