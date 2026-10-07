import { formatarDataBR, montarMensagemChegada, montarMensagemNotificar, montarMensagemVespera } from './mensagens';

describe('mensagens de aviso do fluxo', () => {
  const prazo = new Date('2026-10-09T12:00:00Z');

  it('monta o aviso de chegada em linguagem administrativa', () => {
    const texto = montarMensagemChegada({ numero: '2026/00041', acaoNome: 'ETP', responsavelLabel: 'o Setor de Compras', prazo });
    expect(texto).toContain('Processo nº 2026/00041');
    expect(texto).toContain('o Setor de Compras');
    expect(texto).toContain('ETP');
    expect(texto).toContain(`Prazo: ${formatarDataBR(prazo)}`);
  });

  it('monta o aviso de chegada sem prazo quando a etapa não tem prazo', () => {
    const texto = montarMensagemChegada({ numero: '2026/00041', acaoNome: 'ETP', responsavelLabel: 'o Setor de Compras', prazo: null });
    expect(texto).not.toContain('Prazo:');
  });

  it('monta o aviso de véspera citando o prazo e a etapa', () => {
    const texto = montarMensagemVespera({ numero: '2026/00041', acaoNome: 'ETP', responsavelLabel: 'Fulano de Tal', prazo });
    expect(texto).toContain('vence prazo');
    expect(texto).toContain(formatarDataBR(prazo));
    expect(texto).toContain('Fulano de Tal');
  });

  it('monta o aviso do nó Notificar com o texto configurado pelo órgão', () => {
    const texto = montarMensagemNotificar({ numero: '2026/00041', acaoNome: 'Aviso', mensagem: 'Favor regularizar a pendência.' });
    expect(texto).toBe('Processo nº 2026/00041 — Aviso: Favor regularizar a pendência.');
  });

  it('nunca usa "Sua vez" nem a palavra "empenho"', () => {
    const textos = [
      montarMensagemChegada({ numero: '1', acaoNome: 'x', responsavelLabel: 'y', prazo }),
      montarMensagemVespera({ numero: '1', acaoNome: 'x', responsavelLabel: 'y', prazo }),
      montarMensagemNotificar({ numero: '1', acaoNome: 'x', mensagem: 'z' }),
    ];
    for (const texto of textos) {
      expect(texto.toLowerCase()).not.toContain('sua vez');
      expect(texto.toLowerCase()).not.toContain('empenho');
    }
  });
});
