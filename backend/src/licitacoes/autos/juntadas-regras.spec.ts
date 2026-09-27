import {
  anotacaoSubstitui,
  anotacaoSubstituida,
  chaveConteudoPeca,
  momentoDaJuntadaDaPeca,
  ordenarPendencias,
  origemDaPeca,
  planoDeRenumeracao,
  sequenciaDeFolhas,
  signatariosDaPeca,
  tituloDoDespachoDeTramitacao,
} from './juntadas-regras';
import { impressaoConteudoPeca } from '../../fase-interna/peca-regras';

describe('autos em ordem cronológica de juntada — regras puras', () => {
  describe('sequenciaDeFolhas: a folha da juntada é definitiva', () => {
    it('segue as folhas das juntadas, sem renumerar, na ordem das folhas', () => {
      const r = sequenciaDeFolhas([
        { id: 'despacho', folha_inicial: 4, folha_final: 4 },
        { id: 'dfd', folha_inicial: 1, folha_final: 3 },
        { id: 'tr', folha_inicial: 5, folha_final: 6 },
      ]);
      expect(r.total).toBe(6);
      expect(r.itens.map((i) => (i.tipo === 'JUNTADA' ? i.juntada.id : 'LACUNA'))).toEqual(['dfd', 'despacho', 'tr']);
      expect(r.conflitos).toEqual([]);
    });

    it('buraco na numeração vira "folha sem documento" — as seguintes NÃO mudam', () => {
      const r = sequenciaDeFolhas([
        { id: 'dfd', folha_inicial: 1, folha_final: 2 },
        { id: 'tr', folha_inicial: 5, folha_final: 5 },
      ]);
      expect(r.total).toBe(5);
      expect(r.itens).toEqual([
        expect.objectContaining({ tipo: 'JUNTADA', folha_inicial: 1, folha_final: 2 }),
        { tipo: 'SEM_DOCUMENTO', folha_inicial: 3, folha_final: 4, cancelada: null },
        expect.objectContaining({ tipo: 'JUNTADA', folha_inicial: 5, folha_final: 5 }),
      ]);
    });

    it('juntada cancelada fica como folha sem documento (com a juntada, para o índice explicar)', () => {
      const cancelada = { id: 'x', folha_inicial: 2, folha_final: 3, cancelada_em: new Date('2026-09-27T12:00:00Z') };
      const r = sequenciaDeFolhas([{ id: 'dfd', folha_inicial: 1, folha_final: 1 }, cancelada, { id: 'tr', folha_inicial: 4, folha_final: 4 }]);
      expect(r.itens[1]).toEqual({ tipo: 'SEM_DOCUMENTO', folha_inicial: 2, folha_final: 3, cancelada });
      expect(r.total).toBe(4);
    });

    it('faixa em conflito (dado inconsistente) fica de fora — nunca desloca as demais', () => {
      const r = sequenciaDeFolhas([
        { id: 'a', folha_inicial: 1, folha_final: 3 },
        { id: 'b', folha_inicial: 2, folha_final: 2 },
        { id: 'c', folha_inicial: 4, folha_final: 4 },
      ]);
      expect(r.conflitos.map((c) => c.id)).toEqual(['b']);
      expect(r.itens.map((i) => i.folha_inicial)).toEqual([1, 4]);
    });

    it('sem juntadas: nenhuma folha', () => {
      expect(sequenciaDeFolhas([])).toEqual({ itens: [], total: 0, conflitos: [] });
    });
  });

  describe('versões substituídas continuam nos autos', () => {
    it('anotação da substituída e da que substitui', () => {
      expect(anotacaoSubstituida({ versao: 2, folha_inicial: 9, folha_final: 9 })).toBe('Substituída pela versão 2 — fl. 9');
      expect(anotacaoSubstituida({ versao: 1, folha_inicial: 9, folha_final: 11, origem: 'ASSINADA' })).toBe('Substituída pela versão 1 assinada — fls. 9–11');
      expect(anotacaoSubstituida(null)).toBe('Substituída');
      expect(anotacaoSubstitui({ folha_inicial: 5, folha_final: 5 })).toBe('Substitui a fl. 5');
      expect(anotacaoSubstitui({ folha_inicial: 5, folha_final: 6 })).toBe('Substitui as fls. 5–6');
    });
  });

  describe('conteúdo juntado (não junta duas vezes o mesmo)', () => {
    it('anexada e assinada: o arquivo; feita no sistema: o texto emitido', () => {
      expect(chaveConteudoPeca({ origem: 'IMPORTADO_ARQUIVO', status: 'IMPORTADO', hash_arquivo: 'h1', caminho_arquivo: 'a.pdf' })).toBe('arq:h1');
      expect(chaveConteudoPeca({ origem: 'INTERNO', status: 'ASSINADO', hash_arquivo: 'h2' })).toBe('arq:h2');
      const gerada = { origem: 'INTERNO', status: 'EM_ELABORACAO', descricao: 'texto', dados_estruturados: { secao: 'a', _emitido: { em: 'x' } } };
      expect(chaveConteudoPeca(gerada)).toBe(`txt:${impressaoConteudoPeca(gerada)}`);
      // editar o texto muda o conteúdo (nova juntada quando for reemitida); as chaves internas "_…" não
      expect(chaveConteudoPeca({ ...gerada, descricao: 'texto novo' })).not.toBe(chaveConteudoPeca(gerada));
      expect(chaveConteudoPeca({ ...gerada, dados_estruturados: { secao: 'a', _emitido: { em: 'y' } } })).toBe(chaveConteudoPeca(gerada));
    });

    it('origem e signatários da peça', () => {
      expect(origemDaPeca({ origem: 'ARQUIVO', status: 'IMPORTADO' })).toBe('ANEXADA');
      expect(origemDaPeca({ origem: 'INTERNO', status: 'ASSINADO' })).toBe('ASSINADA');
      expect(origemDaPeca({ origem: 'INTERNO', status: 'EM_ELABORACAO' })).toBe('GERADA');
      expect(signatariosDaPeca({ assinaturas: [{ assinante_nome: 'Júlia', assinante_cargo: 'Procuradora' }] })).toEqual(['Júlia — Procuradora']);
      expect(signatariosDaPeca({ signatarios_informados: [{ nome: 'Carla', cargo: null }] })).toEqual(['Carla']);
    });

    it('título do despacho de tramitação (envio e devolução)', () => {
      expect(tituloDoDespachoDeTramitacao({ sequencia: 2, de_setor_nome: 'Compras', para_setor_nome: 'Contabilidade', para_usuario_nome: 'Caio' })).toBe(
        'Despacho de tramitação nº 2: de Compras para Contabilidade · Caio',
      );
      expect(tituloDoDespachoDeTramitacao({ sequencia: 3, despacho: 'DEVOLUÇÃO: falta a dotação', para_setor_nome: 'Compras' })).toBe('Despacho de devolução nº 3: para Compras');
    });
  });

  describe('pendências de uma mesma rodada', () => {
    it('pelo momento do documento; no empate, a ordem lógica (peça antes do termo)', () => {
      const t = new Date('2026-09-27T10:00:00Z');
      const r = ordenarPendencias([
        { chave: 'TERMO_JUSTIFICATIVAS', momento: t },
        { chave: 'ATA_SESSAO', momento: new Date('2026-10-02T10:00:00Z') },
        { chave: 'TR', momento: t },
        { chave: 'REGISTRO_PUBLICACOES', momento: null },
        { chave: 'DFD', momento: new Date('2026-09-20T10:00:00Z') },
      ]);
      expect(r.map((x) => x.chave)).toEqual(['DFD', 'TR', 'TERMO_JUSTIFICATIVAS', 'ATA_SESSAO', 'REGISTRO_PUBLICACOES']);
    });
  });

  describe('migração: recálculo UMA vez pela ordem cronológica de juntada', () => {
    it('despachos intercalados entre as peças, na ordem em que foram dados; folhas contínuas desde a 1', () => {
      const plano = planoDeRenumeracao([
        { chave_item: 'tr', momento: new Date('2026-09-22T10:00:00Z'), folha_atual: 5, paginas: 2 },
        { chave_item: 'despacho-2', momento: new Date('2026-09-23T10:00:00Z'), folha_atual: 13, paginas: 1 },
        { chave_item: 'dfd', momento: new Date('2026-09-20T10:00:00Z'), folha_atual: 4, paginas: 3 },
        { chave_item: 'despacho-1', momento: new Date('2026-09-21T10:00:00Z'), folha_atual: 12, paginas: 1 },
        { chave_item: 'parecer', momento: new Date('2026-09-25T10:00:00Z'), folha_atual: 24, paginas: 3 },
      ]);
      expect(plano.map((p) => [p.chave_item, p.folha_inicial, p.folha_final])).toEqual([
        ['dfd', 1, 3],
        ['despacho-1', 4, 4],
        ['tr', 5, 6],
        ['despacho-2', 7, 7],
        ['parecer', 8, 10],
      ]);
    });

    it('sem data, vai para o fim; empate desfeito pela folha antiga', () => {
      const mesma = new Date('2026-09-20T10:00:00Z');
      const plano = planoDeRenumeracao([
        { chave_item: 'sem-data', momento: null, folha_atual: 1, paginas: 1 },
        { chave_item: 'b', momento: mesma, folha_atual: 7, paginas: 1 },
        { chave_item: 'a', momento: mesma, folha_atual: 3, paginas: 0 },
      ]);
      expect(plano.map((p) => [p.chave_item, p.folha_inicial])).toEqual([
        ['a', 1],
        ['b', 2],
        ['sem-data', 3],
      ]);
    });

    it('momento da juntada da peça: anexo, assinatura, emissão', () => {
      expect(momentoDaJuntadaDaPeca({ origem: 'ARQUIVO', data_importacao: '2026-09-21T10:00:00Z', created_at: '2026-09-22T10:00:00Z' })?.toISOString()).toBe(
        '2026-09-21T10:00:00.000Z',
      );
      expect(
        momentoDaJuntadaDaPeca({
          origem: 'INTERNO',
          status: 'ASSINADO',
          assinaturas: [{ data_assinatura: '2026-09-24T10:00:00Z' }, { data_assinatura: '2026-09-25T09:00:00Z' }],
          created_at: '2026-09-20T10:00:00Z',
        })?.toISOString(),
      ).toBe('2026-09-25T09:00:00.000Z');
      expect(
        momentoDaJuntadaDaPeca({ origem: 'INTERNO', status: 'EM_ELABORACAO', dados_estruturados: { _emitido: { em: '2026-09-23T08:00:00Z' } }, created_at: '2026-09-20T10:00:00Z' })?.toISOString(),
      ).toBe('2026-09-23T08:00:00.000Z');
      // emissão "legado" (regra anterior) não tem data real: vale a geração do arquivo
      expect(
        momentoDaJuntadaDaPeca({
          origem: 'INTERNO',
          status: 'EM_ELABORACAO',
          dados_estruturados: { _emitido: { em: '2026-09-27T08:00:00Z', legado: true } },
          data_geracao_arquivo: '2026-09-19T10:00:00Z',
        })?.toISOString(),
      ).toBe('2026-09-19T10:00:00.000Z');
    });
  });
});
