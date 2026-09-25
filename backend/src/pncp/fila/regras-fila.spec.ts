import { StatusSincronizacao, TipoSincronizacao } from '../entities/pncp-sync.entity';
import {
  BACKOFF_MAXIMO_MS,
  ErroPncp,
  PRAZO_DEPENDENCIA_MS,
  atrasoDoBackoff,
  chaveFila,
  decidirAposFalha,
  naturezaDaFalhaHttp,
  ordemDaOperacao,
  recusaBenigna,
} from './regras-fila';

const agora = new Date('2026-09-25T12:00:00Z');
const linha = (tentativas = 0, max = 8, criada = agora) => ({ tentativas, max_tentativas: max, created_at: criada });

describe('fila do PNCP — regras puras', () => {
  test('backoff exponencial: 1, 2, 4, 8 min… limitado a 6 h', () => {
    expect([1, 2, 3, 4].map(atrasoDoBackoff)).toEqual([60_000, 120_000, 240_000, 480_000]);
    expect(atrasoDoBackoff(30)).toBe(BACKOFF_MAXIMO_MS);
    expect(atrasoDoBackoff(0)).toBe(60_000);
  });

  test('ordem de dependência: compra → itens → documentos → retificação → situação → resultados → ata → contrato', () => {
    const ordem = [
      TipoSincronizacao.COMPRA,
      TipoSincronizacao.ITEM,
      TipoSincronizacao.DOCUMENTO,
      TipoSincronizacao.RETIFICACAO_COMPRA,
      TipoSincronizacao.SITUACAO_COMPRA,
      TipoSincronizacao.RESULTADO,
      TipoSincronizacao.ATA,
      TipoSincronizacao.CONTRATO,
      TipoSincronizacao.RETIFICACAO_CONTRATO,
    ].map(ordemDaOperacao);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    expect(new Set(ordem).size).toBe(ordem.length);
  });

  test('natureza da falha HTTP: rede/5xx/429/408/401 temporárias; demais 4xx definitivas', () => {
    expect(naturezaDaFalhaHttp(undefined, 'ECONNRESET')).toBe('TEMPORARIA');
    expect(naturezaDaFalhaHttp(undefined, 'ETIMEDOUT')).toBe('TEMPORARIA');
    expect(naturezaDaFalhaHttp(undefined)).toBe('TEMPORARIA');
    for (const s of [500, 502, 503, 504, 429, 408, 401]) expect(naturezaDaFalhaHttp(s)).toBe('TEMPORARIA');
    for (const s of [400, 403, 404, 409, 422]) expect(naturezaDaFalhaHttp(s)).toBe('DEFINITIVA');
  });

  test('falha temporária: conta a tentativa e agenda pelo backoff', () => {
    const d = decidirAposFalha(linha(2), { natureza: 'TEMPORARIA', mensagem: 'HTTP 503: indisponível' }, agora);
    expect(d).toEqual({
      status: StatusSincronizacao.ERRO_TEMPORARIO,
      tentativas: 3,
      proximo_envio: new Date(agora.getTime() + 4 * 60_000),
      erro_mensagem: 'HTTP 503: indisponível',
    });
  });

  test('tentativas esgotadas viram erro definitivo', () => {
    const d = decidirAposFalha(linha(7, 8), { natureza: 'TEMPORARIA', mensagem: 'timeout' }, agora);
    expect(d.status).toBe(StatusSincronizacao.ERRO_DEFINITIVO);
    expect(d.tentativas).toBe(8);
    expect(d.proximo_envio).toBeNull();
    expect(d.erro_mensagem).toMatch(/Tentativas esgotadas \(8\) — timeout/);
  });

  test('regra de negócio do PNCP: erro definitivo com a mensagem do PNCP', () => {
    const d = decidirAposFalha(linha(0), { natureza: 'DEFINITIVA', mensagem: 'HTTP 422: Não há conformidade entre Instrumento, Modalidade e Amparo' }, agora);
    expect(d).toMatchObject({ status: StatusSincronizacao.ERRO_DEFINITIVO, tentativas: 1, proximo_envio: null });
    expect(d.erro_mensagem).toMatch(/conformidade/);
  });

  test('dependência não satisfeita não conta tentativa; depois de 24 h vira definitivo', () => {
    const d = decidirAposFalha(linha(1), { natureza: 'DEPENDENCIA', mensagem: 'a compra ainda não foi publicada no PNCP' }, agora);
    expect(d).toMatchObject({ status: StatusSincronizacao.PENDENTE, tentativas: 1, erro_mensagem: 'Aguardando: a compra ainda não foi publicada no PNCP' });
    expect(d.proximo_envio!.getTime()).toBe(agora.getTime() + 60_000);
    const velha = decidirAposFalha(linha(0, 8, new Date(agora.getTime() - PRAZO_DEPENDENCIA_MS - 1)), { natureza: 'DEPENDENCIA', mensagem: 'x' }, agora);
    expect(velha.status).toBe(StatusSincronizacao.ERRO_DEFINITIVO);
  });

  test('recusas benignas ("já existe") são sucesso só onde o significado é conhecido', () => {
    expect(recusaBenigna(TipoSincronizacao.COMPRA, 'HTTP 400: Id contratação PNCP: 81448637000147-1-000002/2025')).toBe(true);
    expect(recusaBenigna(TipoSincronizacao.ITEM, 'Número do item já utilizado')).toBe(true);
    expect(recusaBenigna(TipoSincronizacao.RESULTADO, 'Já existe resultado informado para o fornecedor')).toBe(true);
    expect(recusaBenigna(TipoSincronizacao.CONTRATO, 'Já existe contrato')).toBe(false);
    expect(recusaBenigna(TipoSincronizacao.COMPRA, 'HTTP 422: Amparo inválido')).toBe(false);
  });

  test('chaves de idempotência estáveis por operação', () => {
    expect(chaveFila.compra('L')).toBe('COMPRA:L');
    expect(chaveFila.itens('L')).toBe('ITENS:L');
    expect(chaveFila.resultado('I', 'T')).toBe('RESULTADO:I:T');
    expect(chaveFila.situacaoCompra('L', 'T')).toBe('SITUACAO_COMPRA:L:T');
    expect(chaveFila.contrato('C')).toBe('CONTRATO:C');
  });

  test('ErroPncp carrega natureza e status HTTP', () => {
    const e = new ErroPncp('x', 'DEFINITIVA', 422);
    expect(e).toBeInstanceOf(Error);
    expect([e.natureza, e.statusHttp]).toEqual(['DEFINITIVA', 422]);
  });
});
