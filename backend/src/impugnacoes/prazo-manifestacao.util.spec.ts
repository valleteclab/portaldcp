import {
  avaliarPrazoManifestacao,
  camposDePrazoManifestacao,
  dataAberturaDoCertame,
  limiteDiasUteisAntes,
  prazoLimiteManifestacao,
} from './prazo-manifestacao.util';

/** Instante a partir do relógio de Brasília (UTC-3). */
const brt = (iso: string) => new Date(`${iso}-03:00`);

describe('prazo de impugnação/esclarecimento (art. 164 da Lei 14.133/2021)', () => {
  describe('limiteDiasUteisAntes', () => {
    it.each([
      // abertura (BRT)            → limite (BRT, fim do dia)
      ['2026-10-19T09:00:00', '2026-10-14T23:59:59.999'], // seg → qua anterior (sex, qui, qua)
      ['2026-10-16T14:00:00', '2026-10-13T23:59:59.999'], // sex → ter (qui, qua, ter)
      ['2026-10-14T10:00:00', '2026-10-08T23:59:59.999'], // qua → qui anterior (ter, [seg 12/10 feriado], sex, qui) — E7a
      ['2026-10-20T08:00:00', '2026-10-15T23:59:59.999'], // ter → qui (seg, sex, qui)
      ['2026-10-18T10:00:00', '2026-10-14T23:59:59.999'], // domingo → qua (sex, qui, qua)
    ])('abertura %s → limite %s', (abertura, limite) => {
      expect(limiteDiasUteisAntes(brt(abertura)).toISOString()).toBe(brt(limite).toISOString());
    });

    it('usa o DIA de Brasília (abertura 00:30 BRT = 03:30 UTC não muda o dia)', () => {
      expect(limiteDiasUteisAntes(brt('2026-10-19T00:30:00')).toISOString()).toBe(
        brt('2026-10-14T23:59:59.999').toISOString(),
      );
      // 22:00 BRT de segunda já é terça em UTC — continua valendo a segunda
      expect(limiteDiasUteisAntes(brt('2026-10-19T22:00:00')).toISOString()).toBe(
        brt('2026-10-14T23:59:59.999').toISOString(),
      );
    });
  });

  describe('data de referência e prazo efetivo', () => {
    const abertura = brt('2026-10-19T09:00:00');
    const fim = brt('2026-10-16T18:00:00');

    it('pregão: abertura da sessão (na falta, fim do acolhimento)', () => {
      expect(dataAberturaDoCertame({ modalidade: 'PREGAO_ELETRONICO', data_abertura_sessao: abertura, data_fim_acolhimento: fim })).toEqual(abertura);
      expect(dataAberturaDoCertame({ modalidade: 'PREGAO_ELETRONICO', data_fim_acolhimento: fim })).toEqual(fim);
    });

    it('dispensa: fim do acolhimento (na falta, abertura)', () => {
      expect(dataAberturaDoCertame({ modalidade: 'DISPENSA_ELETRONICA', data_abertura_sessao: abertura, data_fim_acolhimento: fim })).toEqual(fim);
      expect(dataAberturaDoCertame({ modalidade: 'DISPENSA_ELETRONICA', data_abertura_sessao: abertura })).toEqual(abertura);
    });

    it('data_limite_impugnacao do edital prevalece sobre o cálculo', () => {
      const fixada = brt('2026-10-15T12:00:00');
      expect(prazoLimiteManifestacao({ data_limite_impugnacao: fixada, data_abertura_sessao: abertura })).toEqual(fixada);
      expect(prazoLimiteManifestacao({ data_limite_impugnacao: fixada.toISOString(), data_abertura_sessao: abertura })).toEqual(fixada);
    });

    it('sem data-limite: 3 dias úteis antes da abertura', () => {
      expect(prazoLimiteManifestacao({ modalidade: 'PREGAO_ELETRONICO', data_abertura_sessao: abertura })).toEqual(
        brt('2026-10-14T23:59:59.999'),
      );
    });

    it('sem nenhuma data: sem limite', () => {
      expect(prazoLimiteManifestacao({ modalidade: 'PREGAO_ELETRONICO' })).toBeNull();
    });
  });

  describe('avaliarPrazoManifestacao (a data decide, não a fase)', () => {
    const base = {
      modalidade: 'PREGAO_ELETRONICO',
      situacao: 'ATIVA',
      data_abertura_sessao: brt('2026-10-19T09:00:00'),
    };

    it('aceita DURANTE o acolhimento antes do limite', () => {
      const r = avaliarPrazoManifestacao({ ...base, fase: 'ACOLHIMENTO_PROPOSTAS' }, 'IMPUGNACAO', brt('2026-10-14T23:00:00'));
      expect(r).toMatchObject({ aberto: true, motivo: null });
    });

    it('recusa depois do limite, mesmo em PUBLICADO', () => {
      const r = avaliarPrazoManifestacao({ ...base, fase: 'PUBLICADO' }, 'IMPUGNACAO', brt('2026-10-15T00:00:01'));
      expect(r.aberto).toBe(false);
      expect(r.motivo).toMatch(/Fora do prazo para impugnação.*14\/10\/2026.*art\. 164/);
    });

    it('esclarecimento segue o mesmo prazo (mensagem própria)', () => {
      const r = avaliarPrazoManifestacao({ ...base, fase: 'ACOLHIMENTO_PROPOSTAS' }, 'ESCLARECIMENTO', brt('2026-10-16T10:00:00'));
      expect(r.aberto).toBe(false);
      expect(r.motivo).toMatch(/pedido de esclarecimento/);
    });

    it('fase IMPUGNACAO (legado) ainda aceita dentro do prazo', () => {
      expect(avaliarPrazoManifestacao({ ...base, fase: 'IMPUGNACAO' }, 'IMPUGNACAO', brt('2026-10-10T10:00:00')).aberto).toBe(true);
    });

    it('salvaguardas: fase interna, sessão já aberta, licitação encerrada', () => {
      const cedo = brt('2026-10-01T10:00:00');
      expect(avaliarPrazoManifestacao({ ...base, fase: 'APROVACAO_INTERNA' }, 'IMPUGNACAO', cedo).aberto).toBe(false);
      expect(avaliarPrazoManifestacao({ ...base, fase: 'EM_DISPUTA' }, 'IMPUGNACAO', cedo).aberto).toBe(false);
      expect(avaliarPrazoManifestacao({ ...base, fase: 'PUBLICADO', situacao: 'REVOGADA' }, 'IMPUGNACAO', cedo).aberto).toBe(false);
      // suspensa: o prazo continua sendo decidido pela data
      expect(avaliarPrazoManifestacao({ ...base, fase: 'PUBLICADO', situacao: 'SUSPENSA' }, 'IMPUGNACAO', cedo).aberto).toBe(true);
    });

    it('cronograma sem datas: aceita enquanto a fase permitir', () => {
      expect(avaliarPrazoManifestacao({ modalidade: 'PREGAO_ELETRONICO', fase: 'PUBLICADO' }, 'IMPUGNACAO', new Date())).toMatchObject({
        aberto: true,
        limite: null,
      });
    });

    it('camposDePrazoManifestacao expõe limite efetivo (ISO) e se está aberto', () => {
      expect(camposDePrazoManifestacao({ ...base, fase: 'ACOLHIMENTO_PROPOSTAS' }, brt('2026-10-13T10:00:00'))).toEqual({
        data_limite_impugnacao_efetiva: '2026-10-14T23:59:59', // relógio de Brasília, sem fuso (convenção da API)
        prazo_manifestacao_aberto: true,
      });
    });
  });
});
