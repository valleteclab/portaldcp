import {
  FUNDAMENTOS_LEGAIS,
  FundamentoLegal as F,
  amparoPncpDoFundamento,
  fundamentoDoTexto,
  fundamentoEfetivo,
  fundamentoPadrao,
  fundamentosDaModalidade,
  incisoLimiteDoFundamento,
  motivoFundamentoInvalido,
  textoDoFundamento,
} from './fundamento-legal';
import { amparoLegalIdPncp, fundamentoLegalTexto } from '../pncp/mapeamento-pncp';

describe('fundamento legal — fonte única do enquadramento', () => {
  it('cada código tem um id próprio da tabela "Amparo Legal" do PNCP (1..50, sem repetição)', () => {
    const ids = FUNDAMENTOS_LEGAIS.map((d) => d.amparoPncp);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Math.min(...ids)).toBe(1);
    expect(Math.max(...ids)).toBe(50);
    expect(ids).toHaveLength(50);
  });

  it('fundamento → código do PNCP (casos do manual)', () => {
    expect(amparoPncpDoFundamento(F.ART28_I)).toBe(1);
    expect(amparoPncpDoFundamento(F.ART74_I)).toBe(6);
    expect(amparoPncpDoFundamento(F.ART74_III_F)).toBe(13);
    expect(amparoPncpDoFundamento(F.ART75_I)).toBe(18);
    expect(amparoPncpDoFundamento(F.ART75_II)).toBe(19);
    expect(amparoPncpDoFundamento(F.ART75_VIII)).toBe(38);
    expect(amparoPncpDoFundamento(F.ART75_XVI)).toBe(46);
    expect(amparoPncpDoFundamento(F.ART78_I)).toBe(47);
    expect(amparoPncpDoFundamento(F.ART74_CAPUT)).toBe(50);
    expect(amparoPncpDoFundamento('XYZ')).toBeNull();
  });

  it('texto das peças e inciso do limite saem do mesmo código', () => {
    expect(textoDoFundamento(F.ART75_II)).toBe('Lei 14.133/2021, art. 75, II');
    expect(textoDoFundamento(F.ART74_III_C)).toBe('Lei 14.133/2021, art. 74, III, "c"');
    expect(incisoLimiteDoFundamento(F.ART75_I)).toBe('I');
    expect(incisoLimiteDoFundamento(F.ART75_II)).toBe('II');
    expect(incisoLimiteDoFundamento(F.ART75_VIII)).toBeNull();
  });

  it('padrão por modalidade (o que o sistema sempre deduziu)', () => {
    expect(fundamentoPadrao('DISPENSA_ELETRONICA', 'COMPRA')).toBe(F.ART75_II);
    expect(fundamentoPadrao('DISPENSA_ELETRONICA', 'SERVICO_ENGENHARIA')).toBe(F.ART75_I);
    expect(fundamentoPadrao('INEXIGIBILIDADE')).toBe(F.ART74_CAPUT);
    expect(fundamentoPadrao('PREGAO_ELETRONICO')).toBe(F.ART28_I);
    expect(fundamentoPadrao('CREDENCIAMENTO')).toBe(F.ART78_I);
    expect(fundamentoPadrao('TOMADA_PRECOS')).toBeNull();
  });

  it('só aceita fundamento compatível com a modalidade', () => {
    expect(motivoFundamentoInvalido('DISPENSA_ELETRONICA', F.ART75_VIII)).toBeNull();
    expect(motivoFundamentoInvalido('DISPENSA_ELETRONICA', F.ART74_I)).toMatch(/não se aplica/);
    expect(motivoFundamentoInvalido('PREGAO_ELETRONICO', F.ART75_II)).toMatch(/não se aplica/);
    expect(motivoFundamentoInvalido('INEXIGIBILIDADE', 'ART99_X')).toMatch(/desconhecido/);
    expect(motivoFundamentoInvalido('INEXIGIBILIDADE', null)).toBeNull();
    expect(fundamentosDaModalidade('DISPENSA_ELETRONICA').every((d) => d.familia === 'ART75')).toBe(true);
    expect(fundamentosDaModalidade('INEXIGIBILIDADE')).toHaveLength(13);
  });

  it('efetivo: gravado quando válido; senão o padrão', () => {
    expect(fundamentoEfetivo({ modalidade: 'DISPENSA_ELETRONICA', tipo_contratacao: 'COMPRA', fundamento_legal: F.ART75_VIII })).toBe(F.ART75_VIII);
    expect(fundamentoEfetivo({ modalidade: 'DISPENSA_ELETRONICA', tipo_contratacao: 'COMPRA', fundamento_legal: null })).toBe(F.ART75_II);
    // código de outra família (modalidade trocada depois) não vaza para o PNCP
    expect(fundamentoEfetivo({ modalidade: 'PREGAO_ELETRONICO', fundamento_legal: F.ART75_II })).toBe(F.ART28_I);
  });

  it('PNCP e tela do processo leem o campo (antes: só modalidade + tipo)', () => {
    const lic = { modalidade: 'DISPENSA_ELETRONICA', tipo_contratacao: 'COMPRA', fundamento_legal: F.ART75_VIII };
    expect(amparoLegalIdPncp(lic)).toBe(38);
    expect(fundamentoLegalTexto(lic)).toBe('Lei 14.133/2021, art. 75, VIII');
    expect(amparoLegalIdPncp({ modalidade: 'INEXIGIBILIDADE', tipo_contratacao: null, fundamento_legal: F.ART74_I })).toBe(6);
    // sem o campo: comportamento anterior
    expect(amparoLegalIdPncp({ modalidade: 'DISPENSA_ELETRONICA', tipo_contratacao: 'OBRA' })).toBe(18);
    expect(() => amparoLegalIdPncp({ modalidade: 'TOMADA_PRECOS', tipo_contratacao: null })).toThrow(/Amparo legal/);
  });

  it('lê o enquadramento de texto livre (migração dos processos existentes)', () => {
    expect(fundamentoDoTexto('Art. 75, II – valor abaixo do limite', 'DISPENSA_ELETRONICA')).toBe(F.ART75_II);
    expect(fundamentoDoTexto('<p>nos termos do art. 75, inciso I, da Lei</p>', 'DISPENSA_ELETRONICA')).toBe(F.ART75_I);
    expect(fundamentoDoTexto('Art. 74, inciso III, alínea "c"', 'INEXIGIBILIDADE')).toBe(F.ART74_III_C);
    expect(fundamentoDoTexto("artigo 75, IV, 'e' da Lei 14.133", 'DISPENSA_ELETRONICA')).toBe(F.ART75_IV_E);
    expect(fundamentoDoTexto('Art. 75, II da Lei 14.133/2021', 'DISPENSA_ELETRONICA')).toBe(F.ART75_II);
    expect(fundamentoDoTexto('Art. 74, caput', 'INEXIGIBILIDADE')).toBe(F.ART74_CAPUT);
    // incompatível com a modalidade ou sem inciso → nada
    expect(fundamentoDoTexto('Art. 75, II', 'INEXIGIBILIDADE')).toBeNull();
    expect(fundamentoDoTexto('Art. 75, §3º', 'DISPENSA_ELETRONICA')).toBeNull();
    expect(fundamentoDoTexto('', 'DISPENSA_ELETRONICA')).toBeNull();
  });
});
