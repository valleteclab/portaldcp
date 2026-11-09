import { atosAteAprovacaoInterna } from './fase-da-licitacao.service';
import { semFormaRepetida } from '../../fase-interna/telas/minutas-regras';

/** Pregão 2026/00070: o fluxo chegou à Publicação com a licitação ainda em PLANEJAMENTO. */
describe('fase da licitação acompanha o fluxo (rito completo)', () => {
  it('do PLANEJAMENTO aplica os quatro atos, em ordem, até a APROVACAO_INTERNA', () => {
    expect(atosAteAprovacaoInterna('PREGAO_ELETRONICO', 'PLANEJAMENTO')).toEqual(['CONCLUIR_PLANEJAMENTO', 'CONCLUIR_TERMO_REFERENCIA', 'CONCLUIR_PESQUISA_PRECOS', 'CONCLUIR_ANALISE_JURIDICA']);
    expect(atosAteAprovacaoInterna('CONCORRENCIA', 'ANALISE_JURIDICA')).toEqual(['CONCLUIR_ANALISE_JURIDICA']);
  });

  it('já na aprovação interna, publicada ou contratação direta: nada', () => {
    expect(atosAteAprovacaoInterna('PREGAO_ELETRONICO', 'APROVACAO_INTERNA')).toEqual([]);
    expect(atosAteAprovacaoInterna('PREGAO_ELETRONICO', 'PUBLICADO')).toEqual([]);
    expect(atosAteAprovacaoInterna('DISPENSA_ELETRONICA', 'PLANEJAMENTO')).toEqual([]);
    expect(atosAteAprovacaoInterna('INEXIGIBILIDADE', 'PLANEJAMENTO')).toEqual([]);
    expect(atosAteAprovacaoInterna(null, 'PLANEJAMENTO')).toEqual([]);
  });

  it('texto: "Pregão eletrônico, na forma eletrônica" não repete a forma', () => {
    expect(semFormaRepetida('<p>modalidade Pregão eletrônico, na forma eletrônica (art. 17, §2º)</p>')).toBe('<p>modalidade Pregão eletrônico (art. 17, §2º)</p>');
    expect(semFormaRepetida('<p>modalidade Concorrência, na forma eletrônica</p>')).toBe('<p>modalidade Concorrência, na forma eletrônica</p>');
  });
});
