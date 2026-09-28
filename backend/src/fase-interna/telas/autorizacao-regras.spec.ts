import { portaoBArt72, resumoDaAutorizacao, situacaoDaAutorizacao, situacaoDasAssinaturas } from './autorizacao-regras';
import { configEfetiva, validarSignatariosAutorizacao } from '../tarefas/configuracao-fase-interna';

const linha = (tipo: string, status = 'OK') => ({ tipo, titulo: tipo, status });

describe('Autorização da autoridade (Entrega 3B)', () => {
  it('situação a partir do despacho: sem despacho, em elaboração, aguardando, autorizada (assinada ou anexada), devolvida', () => {
    expect(situacaoDaAutorizacao(null)).toBe('SEM_DESPACHO');
    expect(situacaoDaAutorizacao({ status: 'EM_ELABORACAO', origem: 'INTERNO' })).toBe('EM_ELABORACAO');
    expect(situacaoDaAutorizacao({ status: 'AGUARDANDO_ASSINATURA', origem: 'INTERNO' })).toBe('AGUARDANDO_ASSINATURAS');
    expect(situacaoDaAutorizacao({ status: 'ASSINADO', origem: 'INTERNO' })).toBe('AUTORIZADA');
    expect(situacaoDaAutorizacao({ status: 'IMPORTADO', origem: 'ARQUIVO' })).toBe('AUTORIZADA');
    expect(situacaoDaAutorizacao({ status: 'REPROVADO', origem: 'INTERNO' })).toBe('DEVOLVIDA');
  });

  it('portão B (art. 72): exige I, II e IV; III e VI/VII vêm depois; VIII é esta etapa', () => {
    const ok = portaoBArt72([linha('DFD'), linha('ETP', 'NAO_SE_APLICA'), linha('AR', 'NAO_SE_APLICA'), linha('TR'), linha('PP'), linha('DO'), linha('AA', 'PENDENTE'), linha('PJ', 'PENDENTE')]);
    expect(ok.ok).toBe(true);
    expect(ok.linhas.find((l) => l.inciso === 'III')).toMatchObject({ exigido: false, situacao: 'DEPOIS' });
    expect(ok.linhas.find((l) => l.inciso === 'VIII')).toMatchObject({ exigido: false, situacao: 'PENDENTE' });
    const falta = portaoBArt72([linha('DFD'), linha('PP', 'EM_ELABORACAO'), linha('DO', 'PENDENTE')]);
    expect(falta.ok).toBe(false);
    expect(falta.pendentes).toEqual(['Art. 72, II — Estimativa de despesa (art. 23)', 'Art. 72, IV — Compatibilidade da previsão de recursos orçamentários']);
    expect(falta.linhas.find((l) => l.inciso === 'II')!.situacao).toBe('EM_ANDAMENTO');
    // Art. 72, IV não admite "não se aplica": a informação orçamentária marcada assim continua pendente
    const nsa = portaoBArt72([linha('DFD'), linha('ETP', 'NAO_SE_APLICA'), linha('PP'), linha('DO', 'NAO_SE_APLICA')]);
    expect(nsa.ok).toBe(false);
    expect(nsa.pendentes).toEqual(['Art. 72, IV — Compatibilidade da previsão de recursos orçamentários']);
    expect(nsa.linhas.find((l) => l.inciso === 'IV')!.situacao).toBe('PENDENTE');
  });

  it('colegiada: quem falta, "posso assinar" só para o signatário que ainda não assinou', () => {
    const mesa = [
      { usuario_id: 'p', nome: 'Ana', papel: 'Presidente', status: 'ASSINADO' },
      { usuario_id: 'v', nome: 'Beto', papel: 'Vice-Presidente', status: 'PENDENTE' },
      { usuario_id: 's1', nome: 'Caio', papel: '1º Secretário', status: 'PENDENTE' },
      { usuario_id: 's2', nome: 'Dora', papel: '2º Secretário', status: 'PENDENTE' },
    ];
    expect(situacaoDasAssinaturas(mesa, 'v')).toMatchObject({ total: 4, assinaram: 1, sou_signatario: true, posso_assinar: true });
    expect(situacaoDasAssinaturas(mesa, 'p')).toMatchObject({ ja_assinei: true, posso_assinar: false });
    expect(situacaoDasAssinaturas(mesa, 'outro')).toMatchObject({ sou_signatario: false, posso_assinar: false });
    expect(situacaoDasAssinaturas(mesa, null).faltam).toHaveLength(3);
  });

  it('resumo do celular: objeto, teto, modalidade + fundamento, dotação, requisitante, documentos conferidos', () => {
    const r = resumoDaAutorizacao({
      numero_processo: '139/2025',
      objeto: 'Software de jornalismo',
      modalidade_rotulo: 'Dispensa',
      fundamento_referencia: 'art. 75, II',
      teto: 61753.44,
      sigiloso: true,
      reserva: { status: 'EMITIDA', texto: '01.001 · 3.3.90.40' },
      requisitante: 'Dir. Administrativa',
      itens: [linha('DFD'), linha('TR'), linha('PP'), linha('DO')],
      folhas: 35,
    });
    expect(r).toMatchObject({
      titulo: 'Autorizar a abertura do PA 139/2025',
      teto: 61753.44,
      modalidade: 'Dispensa · art. 75, II',
      dotacao: 'Reservada',
      requisitante: 'Dir. Administrativa',
      documentos_ok: true,
      folhas: 35,
    });
    expect(r.documentos).toBe('DFD, TR, PP, DO — completos');
    expect(resumoDaAutorizacao({ ...(r as any), numero_processo: '1/2026', objeto: 'x', modalidade_rotulo: 'Dispensa', fundamento_referencia: null, teto: null, sigiloso: false, reserva: null, requisitante: null, itens: [linha('DFD'), linha('PP', 'PENDENTE')], folhas: null })).toMatchObject({
      dotacao: 'Sem reserva',
      documentos_ok: false,
      documentos: 'Faltam: Art. 72, II',
    });
  });

  it('configuração: signatários da autorização (usuário ativo do órgão, papel, sem repetição); padrão vazio', () => {
    expect(configEfetiva('o', null)).toMatchObject({ signatarios_autorizacao: [], autoridade_rotulo: 'Autoridade competente' });
    expect(configEfetiva('o', { signatarios_autorizacao: [{ usuario_id: 'a', papel: 'Presidente' }, { usuario_id: 'a', papel: 'Vice' }, { usuario_id: 'b' }], autoridade_rotulo: 'Mesa Diretora' })).toMatchObject({
      signatarios_autorizacao: [{ usuario_id: 'a', papel: 'Presidente' }],
      autoridade_rotulo: 'Mesa Diretora',
    });
    expect(validarSignatariosAutorizacao([{ usuario_id: 'x', papel: 'Presidente' }], ['a'])).toMatchObject({ ok: false });
    expect(validarSignatariosAutorizacao([{ usuario_id: 'a', papel: '' }], ['a'])).toMatchObject({ ok: false });
    expect(validarSignatariosAutorizacao([{ usuario_id: 'a', papel: 'P' }, { usuario_id: 'a', papel: 'Q' }], ['a'])).toMatchObject({ ok: false });
    expect(validarSignatariosAutorizacao([{ usuario_id: 'a', papel: 'Presidente' }], ['a'])).toEqual({ ok: true, valores: [{ usuario_id: 'a', papel: 'Presidente' }] });
    expect(validarSignatariosAutorizacao(null, [])).toEqual({ ok: true, valores: [] });
  });
});
