import { TipoProcesso } from './entities/processo.entity';
import { erroTermoParaProcesso, normalizarFiltrosListagem, situacaoDoProcessoPelaLicitacao, textoDeAutuacao, tipoProcessoValido, validarAberturaDireta } from './processo-regras';
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
      expect(r).toEqual({ dados: { tipo: 'AVULSO', objeto: 'Ofício circular sobre férias', numero: null, setor_origem_id: null, contrato_id: null } });
      const r2 = validarAberturaDireta({ tipo: 'avulso', objeto: 'Objeto ok', numero: ' PA 1/2026 ', setor_origem_id: 'abc' }, direta);
      expect(r2).toEqual({ dados: { tipo: 'AVULSO', objeto: 'Objeto ok', numero: 'PA 1/2026', setor_origem_id: 'abc', contrato_id: null } });
    });
    it('recusa objeto curto, tipo inválido e CONTRATACAO direta (nasce pela licitação)', () => {
      expect(validarAberturaDireta({ objeto: 'abc' }, direta)).toMatchObject({ erro: expect.stringMatching(/objeto/i) });
      expect(validarAberturaDireta({ tipo: 'XPTO', objeto: 'Objeto ok' }, direta)).toMatchObject({ erro: expect.stringMatching(/inválido/) });
      expect(validarAberturaDireta({ tipo: 'CONTRATACAO', objeto: 'Objeto ok' }, direta)).toMatchObject({ erro: expect.stringMatching(/licitações/) });
      expect(validarAberturaDireta({ tipo: 'ADITIVO', objeto: 'Objeto ok' }, direta)).toMatchObject({ erro: expect.stringMatching(/ainda não/) });
    });
    it('ADITIVO exige contrato (uuid); AVULSO ignora contrato_id', () => {
      const comAditivo = [TipoProcesso.AVULSO, TipoProcesso.ADITIVO];
      const contrato = '3f2b8c1e-5d4a-4c6b-9e7f-0a1b2c3d4e5f';
      expect(validarAberturaDireta({ tipo: 'ADITIVO', objeto: 'Prorrogação de prazo' }, comAditivo)).toMatchObject({ erro: expect.stringMatching(/contrato/i) });
      expect(validarAberturaDireta({ tipo: 'ADITIVO', objeto: 'Prorrogação de prazo', contrato_id: 'xyz' }, comAditivo)).toMatchObject({ erro: expect.stringMatching(/contrato/i) });
      expect(validarAberturaDireta({ tipo: 'aditivo', objeto: 'Prorrogação de prazo', contrato_id: ` ${contrato} ` }, comAditivo)).toEqual({
        dados: { tipo: 'ADITIVO', objeto: 'Prorrogação de prazo', numero: null, setor_origem_id: null, contrato_id: contrato },
      });
      expect(validarAberturaDireta({ objeto: 'Ofício sobre férias', contrato_id: contrato }, comAditivo)).toMatchObject({ dados: { tipo: 'AVULSO', contrato_id: null } });
    });
  });

  it('filtros da listagem: fora do domínio é ignorado; limite entre 1 e 500', () => {
    expect(normalizarFiltrosListagem({})).toEqual({ tipo: null, situacao: null, busca: null, contrato_id: null, limite: 100 });
    expect(normalizarFiltrosListagem({ contrato_id: '3f2b8c1e-5d4a-4c6b-9e7f-0a1b2c3d4e5f' }).contrato_id).toBe('3f2b8c1e-5d4a-4c6b-9e7f-0a1b2c3d4e5f');
    expect(normalizarFiltrosListagem({ contrato_id: 'x' }).contrato_id).toBeNull();
    expect(normalizarFiltrosListagem({ tipo: 'contratacao', situacao: 'aberto', q: ' 2026 ', limit: '9999' })).toEqual({
      tipo: 'CONTRATACAO',
      situacao: 'ABERTO',
      busca: '2026',
      contrato_id: null,
      limite: 500,
    });
    expect(normalizarFiltrosListagem({ tipo: 'X', situacao: 'Y', limit: '-3' })).toEqual({ tipo: null, situacao: null, busca: null, contrato_id: null, limite: 100 });
  });

  it('RENOVACAO abre ligada a contrato e só aceita termo de renovação de ciclo', () => {
    const contrato = '3f2b8c1e-5d4a-4c6b-9e7f-0a1b2c3d4e5f';
    const tipos = [TipoProcesso.AVULSO, TipoProcesso.ADITIVO, TipoProcesso.RENOVACAO];
    expect(validarAberturaDireta({ tipo: 'RENOVACAO', objeto: 'Renovação por 12 meses' }, tipos)).toMatchObject({ erro: expect.stringMatching(/contrato/i) });
    expect(validarAberturaDireta({ tipo: 'RENOVACAO', objeto: 'Renovação por 12 meses', contrato_id: contrato }, tipos)).toMatchObject({ dados: { tipo: 'RENOVACAO', contrato_id: contrato } });
    expect(erroTermoParaProcesso(TipoProcesso.RENOVACAO, true)).toBeNull();
    expect(erroTermoParaProcesso(TipoProcesso.RENOVACAO, false)).toMatch(/renovação/);
    expect(erroTermoParaProcesso(TipoProcesso.RENOVACAO, undefined)).toMatch(/renovação/);
    expect(erroTermoParaProcesso(TipoProcesso.ADITIVO, undefined)).toBeNull();
    expect(erroTermoParaProcesso(TipoProcesso.AVULSO, true)).toMatch(/não é de termo/);
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
