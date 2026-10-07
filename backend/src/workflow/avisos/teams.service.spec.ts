import { mascararWebhook, montarAdaptiveCard } from './teams.service';

describe('mascararWebhook', () => {
  it('nunca devolve a URL inteira, só os últimos caracteres', () => {
    const url = 'https://canarytown.webhook.office.com/webhookb2/abc-def-ghi/IncomingWebhook/123456/token-secreto';
    const mascarado = mascararWebhook(url);
    expect(mascarado).not.toContain('webhook.office.com');
    expect(mascarado.endsWith(url.slice(-6))).toBe(true);
  });

  it('url vazia não quebra', () => {
    expect(mascararWebhook('')).toBe('');
  });
});

describe('montarAdaptiveCard', () => {
  it('monta o payload do app Workflows com os fatos do processo', () => {
    const payload = montarAdaptiveCard({ titulo: 'Processo aguarda providência', numero: '2026/00041', etapa: 'ETP', setor: 'Setor de Compras', prazo: '09/10/2026', link: 'https://www.portaldcp.com.br/orgao/processo/abc' });
    expect(payload.type).toBe('message');
    const attachments = payload.attachments as any[];
    expect(attachments[0].contentType).toBe('application/vnd.microsoft.card.adaptive');
    const card = attachments[0].content;
    expect(card.type).toBe('AdaptiveCard');
    const facts = card.body[1].facts;
    expect(facts).toEqual([
      { title: 'Processo', value: '2026/00041' },
      { title: 'Etapa', value: 'ETP' },
      { title: 'Setor', value: 'Setor de Compras' },
      { title: 'Prazo', value: '09/10/2026' },
    ]);
    expect(card.actions[0].url).toBe('https://www.portaldcp.com.br/orgao/processo/abc');
  });

  it('omite o fato de prazo e a ação de link quando não informados', () => {
    const payload: any = montarAdaptiveCard({ titulo: 'Teste', numero: 'T', etapa: 'E', setor: 'S', prazo: null, link: null });
    const card = payload.attachments[0].content;
    expect(card.body[1].facts).toHaveLength(3);
    expect(card.actions).toBeUndefined();
  });
});
