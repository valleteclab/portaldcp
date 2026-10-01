import { TipoProcesso } from './entities/processo.entity';
import { normalizarFiltrosListagem, situacaoDoProcessoPelaLicitacao, textoDeAutuacao, tipoProcessoValido, validarAberturaDireta } from './processo-regras';
import { ORDEM_TIPOS, definicaoAvulso, esqueletoDeTipo, esqueletosFuturos } from './tipos/tipo-processo';

describe('processo-regras', () => {
  it('situação do processo segue a da licitação (terminais e concluída encerram)', () => {
    expect(situacaoDoProcessoPelaLicitacao('ATIVA')).toBe('ABERTO');
    expect(situacaoDoProcessoPelaLicitacao('SUSPENSA')).toBe('ABERTO');
    expect(situacaoDoProcessoPelaLicitacao(null)).toBe('ABERTO');
    for (const s of ['REVOGADA', 'ANULADA', 'DESERTA', 'FRACASSADA', 'CONCLUIDA']) expect(situacaoDoProcessoPelaLicitacao(s)).toBe('ENCERRADO');
  });

  it('tipo válido', () => {
    expect(tipoProcessoValido('CONTRATACAO')).toBe(true);
    expect(tipoProcessoValido('AVULSO')).toBe(true);
    expect(tipoProcessoValido('avulso')).toBe(false);
    expect(tipoProcessoValido(null)).toBe(false);
  });

  describe('validarAberturaDireta', () => {
    const direta = [TipoProcesso.AVULSO];
    it('padrão é AVULSO; objeto obrigatório; número e setor opcionais', () => {
      const r = validarAberturaDireta({ objeto: '  Ofício circular sobre férias  ' }, direta);
      expect(r).toEqual({ dados: { tipo: 'AVULSO', objeto: 'Ofício circular sobre férias', numero: null, setor_origem_id: null } });
      const r2 = validarAberturaDireta({ tipo: 'avulso', objeto: 'Objeto ok', numero: ' PA 1/2026 ', setor_origem_id: 'abc' }, direta);
      expect(r2).toEqual({ dados: { tipo: 'AVULSO', objeto: 'Objeto ok', numero: 'PA 1/2026', setor_origem_id: 'abc' } });
    });
    it('recusa objeto curto, tipo inválido e CONTRATACAO direta (nasce pela licitação)', () => {
      expect(validarAberturaDireta({ objeto: 'abc' }, direta)).toMatchObject({ erro: expect.stringMatching(/objeto/i) });
      expect(validarAberturaDireta({ tipo: 'XPTO', objeto: 'Objeto ok' }, direta)).toMatchObject({ erro: expect.stringMatching(/inválido/) });
      expect(validarAberturaDireta({ tipo: 'CONTRATACAO', objeto: 'Objeto ok' }, direta)).toMatchObject({ erro: expect.stringMatching(/licitações/) });
      expect(validarAberturaDireta({ tipo: 'ADITIVO', objeto: 'Objeto ok' }, direta)).toMatchObject({ erro: expect.stringMatching(/ainda não/) });
    });
  });

  it('filtros da listagem: fora do domínio é ignorado; limite entre 1 e 500', () => {
    expect(normalizarFiltrosListagem({})).toEqual({ tipo: null, situacao: null, busca: null, limite: 100 });
    expect(normalizarFiltrosListagem({ tipo: 'contratacao', situacao: 'aberto', q: ' 2026 ', limit: '9999' })).toEqual({
      tipo: 'CONTRATACAO',
      situacao: 'ABERTO',
      busca: '2026',
      limite: 500,
    });
    expect(normalizarFiltrosListagem({ tipo: 'X', situacao: 'Y', limit: '-3' })).toEqual({ tipo: null, situacao: null, busca: null, limite: 100 });
  });

  it('texto de autuação', () => {
    expect(textoDeAutuacao({ numero: '2026/00001', objeto: 'Compra de papel ' })).toBe('Autue-se o Processo Administrativo nº 2026/00001, cujo objeto é Compra de papel.');
    expect(textoDeAutuacao({ numero: '1', objeto: 'X', aberto_por_nome: 'Ana', setor_nome: 'Compras' })).toMatch(/Autuação: Ana — Compras\./);
  });

  it('registro dos tipos: CONTRATACAO primeiro; esqueletos não implementados; AVULSO sem fluxo e com abertura direta', async () => {
    expect(ORDEM_TIPOS[0]).toBe(TipoProcesso.CONTRATACAO);
    for (const e of esqueletosFuturos()) {
      expect(e.implementado).toBe(false);
      expect(e.abertura_direta).toBe(false);
      expect(e.catalogoDocumentos()).toEqual([]);
      expect(await e.requisitosLegais()).toEqual([]);
    }
    const av = definicaoAvulso();
    expect(av).toMatchObject({ implementado: true, abertura_direta: true, tem_fluxo: false, referencia_tipo: null });
    const esq = esqueletoDeTipo(TipoProcesso.PAGAMENTO, 'Pagamento', 'x', 'MEDICAO');
    await expect(esq.aoConcluirUltimaEtapa({ id: '1', orgao_id: 'o', tipo: TipoProcesso.PAGAMENTO, numero: '1', referencia_tipo: null, referencia_id: null })).resolves.toBeUndefined();
  });
});
