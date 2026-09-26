import { configEfetiva } from '../fase-interna/tarefas/configuracao-fase-interna';
import { valoresFinaisDispensa } from './classificacao-dispensa';
import { dispensaSemLances, modoDisputaDaDispensa, textoFormaDisputa, vencedoresSemLances } from './modo-disputa-dispensa';

/**
 * MODO DA DISPENSA (fase interna, Entrega 5 — decisão 5 do dono): com etapa
 * de lances (IN 67, padrão) ou só propostas (regulamento do órgão); gravado
 * no processo no PUBLICAR e congelado.
 */
describe('modo da dispensa — configuração e congelamento', () => {
  it('padrão do órgão é COM etapa de lances (IN SEGES 67/2021); só o false gravado desliga', () => {
    expect(configEfetiva('o', null).dispensa_com_lances).toBe(true);
    expect(configEfetiva('o', { dispensa_com_lances: null }).dispensa_com_lances).toBe(true);
    expect(configEfetiva('o', { dispensa_com_lances: true }).dispensa_com_lances).toBe(true);
    expect(configEfetiva('o', { dispensa_com_lances: false }).dispensa_com_lances).toBe(false);
  });

  it('na fase interna o modo segue a configuração do órgão (ainda não congelado)', () => {
    const sem = modoDisputaDaDispensa({ modalidade: 'DISPENSA_ELETRONICA', fase: 'APROVACAO_INTERNA', dispensa_com_lances: true }, false);
    expect(sem).toMatchObject({ aplica: true, com_lances: false, congelado: false, fonte: 'CONFIGURACAO' });
    expect(sem.referencia).toMatch(/regulamento do órgão/);
    expect(sem.descricao).toMatch(/Sem disputa de lances, apenas cadastro de propostas/);
    const com = modoDisputaDaDispensa({ modalidade: 'DISPENSA_ELETRONICA', fase: 'PLANEJAMENTO' }, undefined);
    expect(com).toMatchObject({ com_lances: true, fonte: 'CONFIGURACAO' });
    expect(com.referencia).toMatch(/IN SEGES nº 67\/2021/);
    expect(com.descricao).toMatch(/de 6 a 10 horas/);
  });

  it('publicado: vale o valor GRAVADO no PUBLICAR — mudar a configuração depois não altera o processo', () => {
    const gravadoSem = { modalidade: 'DISPENSA_ELETRONICA', fase: 'ACOLHIMENTO_PROPOSTAS', dispensa_com_lances: false };
    expect(modoDisputaDaDispensa(gravadoSem, true)).toMatchObject({ com_lances: false, congelado: true, fonte: 'PROCESSO' });
    const gravadoCom = { ...gravadoSem, dispensa_com_lances: true };
    expect(modoDisputaDaDispensa(gravadoCom, false)).toMatchObject({ com_lances: true, congelado: true, fonte: 'PROCESSO' });
    // aguardando o PNCP também já está congelado
    expect(modoDisputaDaDispensa({ ...gravadoSem, fase: 'AGUARDANDO_DIVULGACAO' }, true).com_lances).toBe(false);
  });

  it('publicado antes da Entrega 5 (NULL): com lances — a regra da época, nunca a configuração atual', () => {
    const legado = { modalidade: 'DISPENSA_ELETRONICA', fase: 'PUBLICADO', dispensa_com_lances: null };
    expect(modoDisputaDaDispensa(legado, false)).toMatchObject({ com_lances: true, congelado: true, fonte: 'LEGADO' });
    expect(dispensaSemLances(legado)).toBe(false);
    expect(dispensaSemLances({ ...legado, dispensa_com_lances: false })).toBe(true);
  });

  it('outras modalidades não têm o modo', () => {
    expect(modoDisputaDaDispensa({ modalidade: 'PREGAO_ELETRONICO', fase: 'PUBLICADO', dispensa_com_lances: false }, false).aplica).toBe(false);
    expect(dispensaSemLances({ modalidade: 'PREGAO_ELETRONICO', dispensa_com_lances: false })).toBe(false);
  });

  it('texto do aviso e da minuta reflete o modo', () => {
    expect(textoFormaDisputa(true)).toMatch(/etapa de lances com duração de 6 \(seis\) a 10 \(dez\) horas/);
    expect(textoFormaDisputa(true)).toMatch(/art\. 16/);
    expect(textoFormaDisputa(false)).toMatch(/Não haverá disputa de lances/);
    expect(textoFormaDisputa(false)).toMatch(/registrada primeiro/);
    // negociação com o vencedor nos dois modos (IN 67, art. 16)
    expect(textoFormaDisputa(false)).toMatch(/negociar condições mais vantajosas com o vencedor/);
  });
});

describe('julgamento SEM etapa de lances — menor preço das propostas; empate: a registrada primeiro', () => {
  const p = (item: string, valor: number, forn: string, em: string | null, prop = `p-${forn}`) => ({
    item_licitacao_id: item,
    valor_unitario: String(valor),
    proposta_id: prop,
    fornecedor_id: forn,
    razao_social: `Fornecedor ${forn}`,
    registrada_em: em ? new Date(em) : null,
  });

  it('vence o menor valor unitário por item', () => {
    const v = vencedoresSemLances([p('i1', 100, 'A', '2026-01-14T10:00:00Z'), p('i1', 90, 'B', '2026-01-15T10:00:00Z'), p('i2', 50, 'A', '2026-01-14T10:00:00Z'), p('i2', 55, 'B', '2026-01-15T10:00:00Z')]);
    expect(v.get('i1')!.fornecedor_id).toBe('B');
    expect(v.get('i2')!.fornecedor_id).toBe('A');
  });

  it('empate no valor (4 casas): prevalece a proposta registrada PRIMEIRO, qualquer que seja a ordem de chegada da lista', () => {
    const tarde = p('i1', 90, 'TARDE', '2026-01-16T09:00:00Z');
    const cedo = p('i1', 90, 'CEDO', '2026-01-14T09:00:00Z');
    expect(vencedoresSemLances([tarde, cedo]).get('i1')!.fornecedor_id).toBe('CEDO');
    expect(vencedoresSemLances([cedo, tarde]).get('i1')!.fornecedor_id).toBe('CEDO');
    // 90,00001 ≠ 90 com 4 casas? 90,00001 arredonda para 90,0000 → empate
    const quase = p('i1', 90.00001, 'QUASE', '2026-01-13T09:00:00Z');
    expect(vencedoresSemLances([tarde, quase]).get('i1')!.fornecedor_id).toBe('QUASE');
  });

  it('sem data de registro vai para o fim do empate', () => {
    expect(vencedoresSemLances([p('i1', 90, 'SEM', null), p('i1', 90, 'COM', '2026-01-16T09:00:00Z')]).get('i1')!.fornecedor_id).toBe('COM');
  });

  it('lances não contam no modo sem lances (o julgamento passa a lista vazia ao motor da classificação)', () => {
    const linhas = [p('i1', 100, 'A', '2026-01-14T10:00:00Z'), p('i1', 95, 'B', '2026-01-15T10:00:00Z')];
    const semLances = valoresFinaisDispensa(linhas, []);
    expect(semLances.get('i1|A')!.valor_unitario).toBe('100');
    const comLances = valoresFinaisDispensa(linhas, [{ item_licitacao_id: 'i1', fornecedor_id: 'A', valor_unitario: 80 }]);
    expect(comLances.get('i1|A')!.valor_unitario).toBe('80');
  });
});
