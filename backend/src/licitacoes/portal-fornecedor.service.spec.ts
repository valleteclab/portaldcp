import { normalizarFiltrosOportunidades, proximaAcaoParticipacao } from './portal-fornecedor.service';

describe('portal do fornecedor (E8)', () => {
  describe('normalizarFiltrosOportunidades', () => {
    it('aplica padrões e limita a página', () => {
      expect(normalizarFiltrosOportunidades({})).toEqual({
        busca: undefined,
        modalidade: undefined,
        fase: undefined,
        situacao: undefined,
        uf: undefined,
        participando: false,
        pagina: 1,
        limite: 20,
      });
      expect(normalizarFiltrosOportunidades({ limite: '5000', pagina: '-3' })).toMatchObject({ limite: 100, pagina: 1 });
    });

    it('ignora códigos fora do formato (nada de texto livre no SQL) e "all"', () => {
      const f = normalizarFiltrosOportunidades({
        modalidade: "PREGAO'; drop table x;--",
        fase: 'all',
        situacao: 'suspensa',
        uf: 'bahia',
        participando: 'true',
        busca: '  cimento  ',
      });
      expect(f.modalidade).toBeUndefined();
      expect(f.fase).toBeUndefined();
      expect(f.situacao).toBe('SUSPENSA');
      expect(f.uf).toBeUndefined();
      expect(f.participando).toBe(true);
      expect(f.busca).toBe('cimento');
    });
  });

  describe('proximaAcaoParticipacao', () => {
    const base = { fase: 'ACOLHIMENTO_PROPOSTAS', statusProposta: 'ENVIADA', homologada: false };

    it('proposta enviada aguardando a sessão', () => {
      expect(proximaAcaoParticipacao(base).codigo).toBe('AGUARDAR_SESSAO');
    });

    it('edital retificado exige confirmação (art. 55 §1º)', () => {
      expect(proximaAcaoParticipacao({ ...base, requerConfirmacao: true }).codigo).toBe('CONFIRMAR_PROPOSTA');
    });

    it('fases da sessão levam à sala (ANALISE_PROPOSTAS → ADJUDICACAO)', () => {
      for (const fase of ['ANALISE_PROPOSTAS', 'EM_DISPUTA', 'HABILITACAO', 'RECURSO', 'ADJUDICACAO']) {
        expect(proximaAcaoParticipacao({ ...base, fase }).codigo).toBe('ENTRAR_SALA');
      }
    });

    it('dispensa com janela aberta leva à sala', () => {
      expect(
        proximaAcaoParticipacao({ ...base, modalidade: 'DISPENSA_ELETRONICA', janelaDispensaAberta: true }).codigo,
      ).toBe('ENTRAR_SALA');
    });

    it('contrato aguardando assinatura tem prioridade sobre o resultado', () => {
      expect(
        proximaAcaoParticipacao({ ...base, fase: 'HOMOLOGACAO', homologada: true, contratoAguardandoAssinatura: true, temInstrumento: true }).codigo,
      ).toBe('ASSINAR_CONTRATO');
      expect(
        proximaAcaoParticipacao({ ...base, fase: 'HOMOLOGACAO', homologada: true, temInstrumento: true }).codigo,
      ).toBe('ACOMPANHAR_CONTRATO');
      expect(proximaAcaoParticipacao({ ...base, fase: 'HOMOLOGACAO', homologada: true }).codigo).toBe('VER_RESULTADO');
    });

    it('licitação extinta ou proposta cancelada: nenhuma ação', () => {
      expect(proximaAcaoParticipacao({ ...base, situacao: 'REVOGADA' }).codigo).toBe('NENHUMA');
      expect(proximaAcaoParticipacao({ ...base, statusProposta: 'CANCELADA' }).codigo).toBe('NENHUMA');
    });

    it('rascunho: enviar enquanto o acolhimento está aberto', () => {
      expect(proximaAcaoParticipacao({ ...base, statusProposta: 'RASCUNHO' }).codigo).toBe('ENVIAR_PROPOSTA');
      expect(proximaAcaoParticipacao({ ...base, fase: 'EM_DISPUTA', statusProposta: 'RASCUNHO' }).codigo).toBe('NENHUMA');
    });
  });
});
