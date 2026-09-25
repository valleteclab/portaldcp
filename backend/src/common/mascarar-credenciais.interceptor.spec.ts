import { mascararCredenciais, MASCARA_CREDENCIAL } from './mascarar-credenciais.interceptor';

describe('mascararCredenciais', () => {
  it('mascara credenciais em objetos aninhados (proposta → fornecedor) sem alterar o original', () => {
    const fornecedor = { id: 'f1', razao_social: 'ACME', senha: 'hash', spedy_api_key: 'sk_live', api_key_hash: 'h' };
    const proposta = { id: 'p1', valor: 10, fornecedor, criado_em: new Date('2026-09-24T12:00:00Z') };

    const saida = mascararCredenciais(proposta);

    expect(saida.fornecedor).toEqual({
      id: 'f1',
      razao_social: 'ACME',
      senha: MASCARA_CREDENCIAL,
      spedy_api_key: MASCARA_CREDENCIAL,
      api_key_hash: MASCARA_CREDENCIAL,
    });
    expect(saida.criado_em).toBeInstanceOf(Date);
    // o objeto original (que pode estar em cache) continua com a credencial real
    expect(fornecedor.spedy_api_key).toBe('sk_live');
  });

  it('mantém vazio/nulo como está (a tela distingue "não configurado")', () => {
    const orgao = { email_resend_api_key: null, pncp_senha: '', email_smtp_senha: undefined };
    expect(mascararCredenciais(orgao)).toEqual({ email_resend_api_key: null, pncp_senha: '', email_smtp_senha: undefined });
  });

  it('percorre listas e referências circulares sem estourar', () => {
    const a: any = { nome: 'a', senha_hash: 'x' };
    a.self = a;
    const saida = mascararCredenciais([a, a]);
    expect(saida[0].senha_hash).toBe(MASCARA_CREDENCIAL);
    expect(saida[0].self).toBe(saida[0]);
    expect(saida[1]).toBe(saida[0]);
  });

  it('não mexe em Buffer nem em tipos primitivos', () => {
    const buf = Buffer.from('pdf');
    expect(mascararCredenciais(buf)).toBe(buf);
    expect(mascararCredenciais('senha')).toBe('senha');
    expect(mascararCredenciais(null)).toBeNull();
  });
});

describe('mascararCredenciais — respostas especiais', () => {
  it('não transforma StreamableFile nem Observable (downloads e SSE continuam funcionando)', () => {
    const { StreamableFile } = require('@nestjs/common');
    const { of } = require('rxjs');
    const arquivo = new StreamableFile(Buffer.from('x'));
    const fluxo = of({ data: 1 });
    expect(mascararCredenciais(arquivo)).toBe(arquivo);
    expect(mascararCredenciais(fluxo)).toBe(fluxo);
  });
});
