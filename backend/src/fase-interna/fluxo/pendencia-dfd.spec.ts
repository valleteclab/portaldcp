import {
  JANELA_AGRUPAMENTO_AVISO_MS,
  LINK_CONSOLIDACAO,
  anoDeBrasilia,
  decidirAviso,
  destinatariosDoAviso,
  linkDaPendencia,
  pendenciaDaCaixa,
  textoAvisoPlanejamento,
} from './pendencia-dfd';
import { PendenciaDfdService } from './pendencia-dfd.service';

const ORGAO = '11111111-1111-4111-8111-111111111111';
const DEMANDA = '22222222-2222-4222-8222-222222222222';

describe('Demanda aprovada → aviso e pendência "Montar o DFD" (regras puras)', () => {
  describe('quem recebe', () => {
    const plan = [{ id: 'plinio' }, { id: 'admin' }, { id: 'rita' }];

    it('quem monta o DFD recebe; quem aprovou não (acabou de fazer)', () => {
      const r = destinatariosDoAviso(plan, { aprovadorId: 'admin', requisitanteId: 'gil' });
      expect(r.para.map((u) => u.id)).toEqual(['plinio', 'rita']);
      expect(r.requisitanteIncluido).toBe(false);
    });

    it('quem pediu e também monta o DFD: marcado — recebe só este aviso', () => {
      const r = destinatariosDoAviso(plan, { aprovadorId: 'paula', requisitanteId: 'rita' });
      expect(r.para.map((u) => u.id)).toEqual(['plinio', 'admin', 'rita']);
      expect(r.requisitanteIncluido).toBe(true);
    });

    it('sem repetir a mesma pessoa (papel + administrador)', () => {
      const r = destinatariosDoAviso([{ id: 'a' }, { id: 'a' }, { id: 'b' }], {});
      expect(r.para.map((u) => u.id)).toEqual(['a', 'b']);
    });

    it('quem pediu, aprovou e monta o DFD: não entra aqui (o aviso ao requisitante segue como antes)', () => {
      const r = destinatariosDoAviso(plan, { aprovadorId: 'rita', requisitanteId: 'rita' });
      expect(r.para.map((u) => u.id)).toEqual(['plinio', 'admin']);
      expect(r.requisitanteIncluido).toBe(false);
    });
  });

  describe('agrupamento (várias aprovações em sequência)', () => {
    const agora = new Date('2026-09-28T15:00:00Z');

    it('sem aviso anterior → cria', () => {
      expect(decidirAviso(null, agora)).toBe('CRIAR');
    });

    it('aviso anterior não lido, dentro da janela → atualiza o total (sem outro e-mail/WhatsApp)', () => {
      expect(decidirAviso({ lida: false, created_at: new Date(agora.getTime() - 60_000) }, agora)).toBe('ATUALIZAR');
    });

    it('aviso anterior lido → cria outro', () => {
      expect(decidirAviso({ lida: true, created_at: new Date(agora.getTime() - 60_000) }, agora)).toBe('CRIAR');
    });

    it('aviso anterior fora da janela → cria outro', () => {
      expect(decidirAviso({ lida: false, created_at: new Date(agora.getTime() - JANELA_AGRUPAMENTO_AVISO_MS - 1) }, agora)).toBe('CRIAR');
    });
  });

  describe('textos, link e pendência da caixa', () => {
    it('texto do aviso: objeto, setor e total', () => {
      expect(textoAvisoPlanejamento({ objeto: 'Notebooks', setor: 'Comunicação', total: 3 }).mensagem).toBe(
        'Demanda aprovada: Notebooks (Comunicação) — pronta para entrar num DFD. Há 3 demandas aprovadas aguardando o DFD.',
      );
      expect(textoAvisoPlanejamento({ objeto: '', setor: null, total: 0 }).mensagem).toBe(
        'Demanda aprovada: Demanda — pronta para entrar num DFD. Há 1 demanda aprovada aguardando o DFD.',
      );
    });

    it('link: o ano corrente fica sem ?ano=; outro exercício vai no link (o mais próximo)', () => {
      expect(linkDaPendencia({ total: 2, por_ano: [{ ano: 2026, n: 2 }] }, 2026)).toBe(LINK_CONSOLIDACAO);
      expect(linkDaPendencia({ total: 2, por_ano: [{ ano: 2027, n: 2 }] }, 2026)).toBe(`${LINK_CONSOLIDACAO}?ano=2027`);
      expect(linkDaPendencia({ total: 3, por_ano: [{ ano: 2025, n: 1 }, { ano: 2026, n: 1 }, { ano: 2027, n: 1 }] }, 2026)).toBe(LINK_CONSOLIDACAO);
      expect(linkDaPendencia({ total: 1, por_ano: [{ ano: 2025, n: 1 }] }, 2026)).toBe(`${LINK_CONSOLIDACAO}?ano=2025`);
    });

    it('pendência: nada livre → nenhuma; com livres → "Montar o DFD — N …"', () => {
      expect(pendenciaDaCaixa({ total: 0, por_ano: [] }, 2026)).toBeNull();
      expect(pendenciaDaCaixa({ total: 1, por_ano: [{ ano: 2026, n: 1 }] }, 2026)).toMatchObject({
        chave: 'dfd:montar',
        titulo: 'Montar o DFD — 1 demanda aprovada aguardando',
        destino: LINK_CONSOLIDACAO,
      });
      expect(pendenciaDaCaixa({ total: 4, por_ano: [{ ano: 2026, n: 4 }] }, 2026)?.titulo).toBe('Montar o DFD — 4 demandas aprovadas aguardando');
    });

    it('ano de Brasília: 31/12 às 22h (UTC-3) ainda é o ano velho', () => {
      expect(anoDeBrasilia(new Date('2027-01-01T01:00:00Z'))).toBe(2026);
      expect(anoDeBrasilia(new Date('2027-01-01T03:00:00Z'))).toBe(2027);
    });
  });
});

describe('PendenciaDfdService.avisarDemandaAprovada (dedupe e quem recebe)', () => {
  function montar(opcoes: { planejamento: Array<{ id: string; email?: string }>; anterior?: Record<string, { lida: boolean; created_at: Date }> }) {
    const criados: any[] = [];
    const atualizados: any[] = [];
    const ds = {
      query: jest.fn(async (sql: string, p: any[]) => {
        if (sql.includes('FROM demandas d')) return [{ ano: anoDeBrasilia(), n: 2 }];
        if (sql.includes('FROM notificacoes')) {
          const a = opcoes.anterior?.[p[1]];
          return a ? [{ id: `n-${p[1]}`, ...a }] : [];
        }
        if (sql.startsWith('UPDATE notificacoes')) {
          atualizados.push({ id: p[0], mensagem: p[2] });
          return [];
        }
        return [];
      }),
    };
    const planejamento = {
      vigente: jest.fn(async () => ({ responsavel_dfd: { tipo: 'PAPEL', valor: 'PLANEJAMENTO' } })),
      destinatarios: jest.fn(async () => opcoes.planejamento),
    };
    const notificacoes = { criar: jest.fn(async (dto: any) => criados.push(dto)) };
    const svc = new PendenciaDfdService(ds as any, planejamento as any, notificacoes as any);
    return { svc, criados, atualizados };
  }
  const demanda = { id: DEMANDA, orgao_id: ORGAO, descricao_sucinta_objeto: 'Toner', unidade_requisitante: 'Educação', criado_por_id: 'edu' };

  it('avisa quem monta (sino + e-mail/WhatsApp, link absoluto), menos quem aprovou', async () => {
    const { svc, criados } = montar({ planejamento: [{ id: 'plinio', email: 'p@x' }, { id: 'paula' }] });
    const r = await svc.avisarDemandaAprovada(demanda, 'paula');
    expect(r).toEqual({ avisados: ['plinio'], requisitanteIncluido: false });
    expect(criados).toHaveLength(1);
    expect(criados[0]).toMatchObject({
      orgao_id: ORGAO,
      usuario_id: 'plinio',
      entidade_tipo: 'DFD_PENDENTE',
      link: LINK_CONSOLIDACAO,
      enviar_email: true,
      mensagem: 'Demanda aprovada: Toner (Educação) — pronta para entrar num DFD. Há 2 demandas aprovadas aguardando o DFD.',
    });
    expect(criados[0].metadata.whatsapp_url).toMatch(/^https?:\/\/.+\/orgao\/demandas\/consolidacao$/);
  });

  it('aviso não lido recente: atualiza o total, sem criar outro (nem e-mail/WhatsApp)', async () => {
    const { svc, criados, atualizados } = montar({
      planejamento: [{ id: 'plinio' }],
      anterior: { plinio: { lida: false, created_at: new Date(Date.now() - 60_000) } },
    });
    await svc.avisarDemandaAprovada(demanda, 'paula');
    expect(criados).toHaveLength(0);
    expect(atualizados).toEqual([{ id: 'n-plinio', mensagem: expect.stringContaining('Há 2 demandas aprovadas') }]);
  });

  it('requisitante que também monta o DFD: marcado como incluído (o aviso de "aprovada" não sai de novo)', async () => {
    const { svc } = montar({ planejamento: [{ id: 'edu' }, { id: 'plinio' }] });
    expect(await svc.avisarDemandaAprovada(demanda, 'paula')).toEqual({ avisados: ['edu', 'plinio'], requisitanteIncluido: true });
  });

  it('ninguém monta o DFD no órgão: o sino do órgão (sem e-mail)', async () => {
    const { svc, criados } = montar({ planejamento: [] });
    await svc.avisarDemandaAprovada(demanda, 'paula');
    expect(criados).toEqual([expect.objectContaining({ usuario_id: ORGAO, enviar_email: false })]);
  });

  it('só quem aprovou monta o DFD: ninguém é avisado', async () => {
    const { svc, criados } = montar({ planejamento: [{ id: 'paula' }] });
    expect(await svc.avisarDemandaAprovada(demanda, 'paula')).toEqual({ avisados: [], requisitanteIncluido: false });
    expect(criados).toHaveLength(0);
  });
});
