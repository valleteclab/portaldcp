import { TipoProcesso } from './entities/processo.entity';
import { diasEntre, estadoPeloTempo, etapasDaLicitacao, etapasDoPedido, etapasDoProcessoProprio } from './painel-gestor-regras';

describe('painel do gestor — regras puras', () => {
  it('estado pelo tempo parado: limite padrão 10 dias, lento a partir de 70%', () => {
    expect(estadoPeloTempo(0, null)).toBe('OK');
    expect(estadoPeloTempo(6, null)).toBe('OK');
    expect(estadoPeloTempo(7, null)).toBe('LENTO');
    expect(estadoPeloTempo(11, null)).toBe('PARADO');
    expect(estadoPeloTempo(4, 5)).toBe('LENTO');
    expect(estadoPeloTempo(6, 5)).toBe('PARADO');
    expect(estadoPeloTempo(99, null, true)).toBe('CONCLUIDO');
  });

  it('dias entre datas', () => {
    const agora = new Date('2026-10-03T12:00:00Z');
    expect(diasEntre('2026-09-19T12:00:00Z', agora)).toBe(14);
    expect(diasEntre(null, agora)).toBe(0);
  });

  it('etapas da licitação pela fase', () => {
    const e = etapasDaLicitacao('ANALISE_JURIDICA');
    expect(e.map((x) => x.estado).slice(0, 5)).toEqual(['CONCLUIDA', 'CONCLUIDA', 'CONCLUIDA', 'ATUAL', 'FUTURA']);
    expect(etapasDaLicitacao('IMPUGNACAO').find((x) => x.estado === 'ATUAL')?.chave).toBe('PUBLICADO');
    expect(etapasDaLicitacao('HOMOLOGACAO', true).every((x) => x.estado === 'CONCLUIDA')).toBe(true);
  });

  it('etapas do aditivo e do avulso', () => {
    const a = etapasDoProcessoProprio(TipoProcesso.ADITIVO, new Set(['PEDIDO']), false, false);
    expect(a.find((x) => x.estado === 'ATUAL')?.chave).toBe('RESERVA');
    const v = etapasDoProcessoProprio(TipoProcesso.AVULSO, new Set(), false, false);
    expect(v.map((x) => x.estado)).toEqual(['CONCLUIDA', 'ATUAL', 'FUTURA']);
  });

  it('caminho do pedido', () => {
    expect(etapasDoPedido('ENVIADA', false, false).find((x) => x.estado === 'ATUAL')?.chave).toBe('ENVIADA');
    expect(etapasDoPedido('APROVADA', false, false).find((x) => x.estado === 'ATUAL')?.chave).toBe('APROVADA');
    expect(etapasDoPedido('APROVADA', true, false).find((x) => x.estado === 'ATUAL')?.chave).toBe('DFD');
    expect(etapasDoPedido('CONSOLIDADA', true, true).every((x) => x.estado === 'CONCLUIDA')).toBe(true);
  });
});
