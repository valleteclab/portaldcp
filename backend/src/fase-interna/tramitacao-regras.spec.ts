import { criarCalendario } from '../common/prazos/calendario';
import {
  avisoDePrazoDevido,
  dataHoraBrasilia,
  despachoPadrao,
  escolherDestinatarios,
  montarLinhaDoTempo,
  podeAtuarNoDestino,
  prazoDaTramitacao,
  situacaoDoPrazo,
  validarDataOcorrencia,
} from './tramitacao-regras';
import { intercalarDespachos } from '../licitacoes/autos/autos-regras';

/** Brasília: 10:00 local = 13:00 UTC. */
const br = (iso: string) => new Date(`${iso}-03:00`);
const SEM_FERIADOS = criarCalendario([]);

describe('tramitação — prazo em dias úteis (art. 183)', () => {
  it('conta a partir do dia seguinte, pula fim de semana e vence às 23:59:59 de Brasília', () => {
    // sexta 25/09/2026 → 3 dias úteis: seg 28, ter 29, qua 30
    const fim = prazoDaTramitacao(br('2026-09-25T15:00:00'), 3, SEM_FERIADOS)!;
    expect(dataHoraBrasilia(fim)).toBe('30/09/2026 às 23:59');
  });

  it('pula feriado do calendário do órgão', () => {
    // 12/10/2026 (segunda) é feriado nacional no calendário padrão
    const fim = prazoDaTramitacao(br('2026-10-09T10:00:00'), 1)!; // sexta → próximo útil: terça 13
    expect(dataHoraBrasilia(fim)).toBe('13/10/2026 às 23:59');
  });

  it('sem prazo → null', () => {
    expect(prazoDaTramitacao(new Date(), 0)).toBeNull();
    expect(prazoDaTramitacao(new Date(), null)).toBeNull();
  });

  it('dias úteis restantes, vence hoje e atraso', () => {
    const prazo = prazoDaTramitacao(br('2026-09-25T15:00:00'), 3, SEM_FERIADOS)!; // qua 30/09
    expect(situacaoDoPrazo(prazo, br('2026-09-28T09:00:00'), SEM_FERIADOS)).toEqual({ dias_uteis_restantes: 2, vencido: false });
    expect(situacaoDoPrazo(prazo, br('2026-09-30T18:00:00'), SEM_FERIADOS)).toEqual({ dias_uteis_restantes: 0, vencido: false });
    expect(situacaoDoPrazo(prazo, br('2026-10-02T09:00:00'), SEM_FERIADOS)).toEqual({ dias_uteis_restantes: -2, vencido: true });
    expect(situacaoDoPrazo(null, new Date())).toEqual({ dias_uteis_restantes: null, vencido: false });
  });

  it('aviso de prazo: véspera (falta 1 dia útil), vencido e idempotência', () => {
    const prazo = prazoDaTramitacao(br('2026-09-25T15:00:00'), 3, SEM_FERIADOS)!; // qua 30/09
    const t = { status: 'PENDENTE', data_prazo: prazo, aviso_vespera_em: null, aviso_vencido_em: null };
    expect(avisoDePrazoDevido(t, br('2026-09-28T07:30:00'), SEM_FERIADOS)).toBeNull(); // faltam 2
    expect(avisoDePrazoDevido(t, br('2026-09-29T07:30:00'), SEM_FERIADOS)).toBe('VESPERA');
    expect(avisoDePrazoDevido({ ...t, aviso_vespera_em: new Date() }, br('2026-09-29T07:30:00'), SEM_FERIADOS)).toBeNull();
    expect(avisoDePrazoDevido(t, br('2026-10-01T07:30:00'), SEM_FERIADOS)).toBe('VENCIDO');
    expect(avisoDePrazoDevido({ ...t, aviso_vencido_em: new Date() }, br('2026-10-01T07:30:00'), SEM_FERIADOS)).toBeNull();
    // processo já saiu do destino: nada
    expect(avisoDePrazoDevido({ ...t, status: 'CONCLUIDA' }, br('2026-10-01T07:30:00'), SEM_FERIADOS)).toBeNull();
  });

  it('véspera na sexta quando o prazo vence na segunda', () => {
    const prazo = br('2026-10-05T23:59:59'); // segunda
    const t = { status: 'RECEBIDA', data_prazo: prazo };
    expect(avisoDePrazoDevido(t, br('2026-10-02T07:30:00'), SEM_FERIADOS)).toBe('VESPERA');
  });
});

describe('tramitação — destinatários do aviso de chegada', () => {
  const c = [
    { id: 'ana', setor_id: 'compras' },
    { id: 'bia', setor_id: 'compras' },
    { id: 'caio', setor_id: 'contab' },
    { id: 'chefe', setor_id: 'gabinete' },
  ];

  it('envio para uma pessoa → só ela (nem o chefe)', () => {
    expect(escolherDestinatarios({ para_setor_id: 'compras', para_usuario_id: 'bia' }, c, 'chefe').map((u) => u.id)).toEqual(['bia']);
  });

  it('envio para o setor → todos do setor + chefe, sem repetir', () => {
    expect(escolherDestinatarios({ para_setor_id: 'compras' }, c, 'chefe').map((u) => u.id).sort()).toEqual(['ana', 'bia', 'chefe']);
    expect(escolherDestinatarios({ para_setor_id: 'compras' }, c, 'ana').map((u) => u.id).sort()).toEqual(['ana', 'bia']);
  });

  it('setor sem chefe → só o setor; quem enviou não é avisado', () => {
    expect(escolherDestinatarios({ para_setor_id: 'compras' }, c, null, 'ana').map((u) => u.id)).toEqual(['bia']);
  });

  it('pessoa inexistente/inativa (fora dos candidatos) → ninguém', () => {
    expect(escolherDestinatarios({ para_usuario_id: 'zeca' }, c, null)).toEqual([]);
  });
});

describe('tramitação — quem pode receber/devolver', () => {
  const base = { nome: 'X', cargo: null, admin_orgao: false };
  const t = { para_setor_id: 'contab', para_usuario_id: null };

  it('setor de destino, pessoa de destino, chefe e ADMIN podem; outro setor não', () => {
    expect(podeAtuarNoDestino({ ...base, usuario_id: 'u1', setor_id: 'contab' }, t)).toBe(true);
    expect(podeAtuarNoDestino({ ...base, usuario_id: 'u2', setor_id: 'compras' }, t)).toBe(false);
    expect(podeAtuarNoDestino({ ...base, usuario_id: 'u2', setor_id: 'compras' }, t, 'u2')).toBe(true);
    expect(podeAtuarNoDestino({ ...base, usuario_id: 'u3', setor_id: null }, { para_setor_id: 'contab', para_usuario_id: 'u3' })).toBe(true);
    expect(podeAtuarNoDestino({ ...base, usuario_id: null, setor_id: null, admin_orgao: true }, t)).toBe(true);
    expect(podeAtuarNoDestino({ ...base, usuario_id: null, setor_id: null }, t)).toBe(false);
  });
});

describe('tramitação — data de ocorrência (lançamento posterior)', () => {
  const agora = br('2026-09-26T10:00:00');

  it('só a data: fim do dia em Brasília; hoje → agora', () => {
    const v = validarDataOcorrencia('2026-09-20', { agora });
    expect(v.ok && dataHoraBrasilia(v.data)).toBe('20/09/2026 às 23:59');
    const hoje = validarDataOcorrencia('2026-09-26', { agora });
    expect(hoje.ok && hoje.data.getTime()).toBe(agora.getTime());
  });

  it('não pode ser futura', () => {
    expect(validarDataOcorrencia('2026-09-27', { agora }).ok).toBe(false);
    expect(validarDataOcorrencia(br('2026-09-26T12:00:00').toISOString(), { agora }).ok).toBe(false);
  });

  it('não pode ser anterior à movimentação anterior', () => {
    const minimo = br('2026-09-21T15:00:00');
    const r = validarDataOcorrencia('2026-09-20', { agora, minimo });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain('anterior');
    // mesmo dia da anterior, só a data → logo depois dela (nunca antes)
    const mesmoDia = validarDataOcorrencia('2026-09-21', { agora, minimo });
    expect(mesmoDia.ok && mesmoDia.data.getTime() >= minimo.getTime()).toBe(true);
    // data e hora anterior no mesmo dia → recusa
    expect(validarDataOcorrencia(br('2026-09-21T09:00:00').toISOString(), { agora, minimo }).ok).toBe(false);
  });

  it('vazia ou inválida → erro', () => {
    expect(validarDataOcorrencia('', { agora }).ok).toBe(false);
    expect(validarDataOcorrencia('2026-02-30', { agora }).ok).toBe(false);
    expect(validarDataOcorrencia('ontem', { agora }).ok).toBe(false);
  });
});

describe('tramitação — despacho padrão e linha do tempo', () => {
  it('despacho padrão com e sem finalidade', () => {
    expect(despachoPadrao('Contabilidade', 'a reserva orçamentária')).toBe('Encaminhe-se ao(à) Contabilidade para a reserva orçamentária.');
    expect(despachoPadrao('Jurídico', 'para emissão de parecer.')).toBe('Encaminhe-se ao(à) Jurídico para emissão de parecer.');
    expect(despachoPadrao('Compras')).toContain('providências');
  });

  it('linha do tempo cronológica: envio, recebimento, devolução (uma vez), com folha', () => {
    const eventos = montarLinhaDoTempo(
      [
        {
          id: 't1', sequencia: 1, para_setor_nome: 'Contabilidade', despacho: 'Para reserva', status: 'DEVOLVIDA',
          data_envio: '2026-09-20T13:00:00Z', data_recebimento: '2026-09-20T15:00:00Z', recebido_por_nome: 'Caio',
          despacho_arquivo: 'licitacoes/x/d1.pdf', folha_inicial: 5, folha_final: 5,
        },
        {
          id: 't2', sequencia: 2, para_setor_nome: 'Compras', despacho: 'DEVOLUÇÃO: falta TR', status: 'PENDENTE',
          devolucao_de_id: 't1', data_envio: '2026-09-26T13:00:00Z', data_ocorrencia: '2026-09-21T13:00:00Z',
          lancado_posteriormente: true, lancado_por_nome: 'Caio', despacho_arquivo: 'licitacoes/x/d2.pdf', folha_inicial: 6, folha_final: 6,
        },
      ],
      (id) => `/f/${id}`,
    );
    expect(eventos.map((e) => e.tipo)).toEqual(['ENVIO', 'RECEBIMENTO', 'DEVOLUCAO']);
    expect(eventos[0].folha).toEqual({ folha_inicial: 5, folha_final: 5, url: '/f/t1' });
    expect(eventos[2].motivo).toBe('falta TR');
    expect(eventos[2].data).toBe('2026-09-21T13:00:00.000Z'); // quando ocorreu
    expect(eventos[2].lancado_posteriormente).toBe(true);
    expect(eventos[2].lancado_em).toBe('2026-09-26T13:00:00.000Z');
  });
});

describe('autos — despachos intercalados cronologicamente', () => {
  const p = (chave: string, iso: string | null) => ({ chave, momento: iso ? new Date(iso) : null });

  it('despacho entra depois da última peça que já existia; entre si, em ordem', () => {
    const pecas = [p('DFD', '2026-09-01'), p('ETP', '2026-09-03'), p('TR', '2026-09-05'), p('PP', '2026-09-10')];
    const d = [p('D2', '2026-09-06'), p('D1', '2026-09-02'), p('D3', '2026-09-12')];
    expect(intercalarDespachos(pecas, d).map((x) => x.chave)).toEqual(['DFD', 'D1', 'ETP', 'TR', 'D2', 'PP', 'D3']);
  });

  it('nunca um despacho antes do anterior (ordem lógica ≠ cronológica)', () => {
    const pecas = [p('DFD', '2026-09-10'), p('ETP', '2026-09-01')];
    const d = [p('D1', '2026-09-11'), p('D2', '2026-09-12')];
    // D1 depois do DFD e do ETP; D2 não volta para antes de D1
    expect(intercalarDespachos(pecas, d).map((x) => x.chave)).toEqual(['DFD', 'ETP', 'D1', 'D2']);
  });

  it('despacho anterior a todas as peças vem primeiro; peça sem momento não prende', () => {
    const pecas = [p('DFD', '2026-09-05'), p('TERMO', null)];
    expect(intercalarDespachos(pecas, [p('D1', '2026-09-01')]).map((x) => x.chave)).toEqual(['D1', 'DFD', 'TERMO']);
  });
});
