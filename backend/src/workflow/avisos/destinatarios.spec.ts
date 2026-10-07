import { normalizarAvisos, normalizarNotificar } from './destinatarios';

describe('normalizarAvisos', () => {
  it('aceita canais válidos e marca chegada por padrão', () => {
    const avisos = normalizarAvisos({ canais: ['whatsapp', 'email'] });
    expect(avisos.canais).toEqual(['WHATSAPP', 'EMAIL']);
    expect(avisos.chegada).toBe(true);
    expect(avisos.vespera_prazo).toBe(false);
  });

  it('descarta canais inválidos silenciosamente quando há pelo menos um válido', () => {
    const avisos = normalizarAvisos({ canais: ['whatsapp', 'pombo-correio'] });
    expect(avisos.canais).toEqual(['WHATSAPP']);
  });

  it('rejeita quando nenhum canal informado é válido', () => {
    expect(() => normalizarAvisos({ canais: ['pombo-correio'] })).toThrow();
  });

  it('exige teams_canal_id quando TEAMS está entre os canais', () => {
    expect(() => normalizarAvisos({ canais: ['teams'] })).toThrow('Selecione o canal do Teams');
    const ok = normalizarAvisos({ canais: ['teams'], teams_canal_id: 'canal-1' });
    expect(ok.teams_canal_id).toBe('canal-1');
  });

  it('respeita chegada=false e vespera_prazo=true quando informados', () => {
    const avisos = normalizarAvisos({ canais: ['email'], chegada: false, vespera_prazo: true });
    expect(avisos.chegada).toBe(false);
    expect(avisos.vespera_prazo).toBe(true);
  });
});

describe('normalizarNotificar', () => {
  it('exige ao menos um destinatário', () => {
    expect(() => normalizarNotificar({ destinatarios: [], canais: ['EMAIL'], mensagem: 'x' })).toThrow('destinatário');
  });

  it('exige id para destinatário SETOR ou USUARIO, mas não para SOLICITANTE', () => {
    expect(() => normalizarNotificar({ destinatarios: [{ tipo: 'SETOR' }], canais: ['EMAIL'], mensagem: 'x' })).toThrow();
    const ok = normalizarNotificar({ destinatarios: [{ tipo: 'SOLICITANTE' }], canais: ['EMAIL'], mensagem: 'x' });
    expect(ok.destinatarios).toEqual([{ tipo: 'SOLICITANTE', id: undefined }]);
  });

  it('exige mensagem e ao menos um canal válido', () => {
    expect(() => normalizarNotificar({ destinatarios: [{ tipo: 'SOLICITANTE' }], canais: [], mensagem: 'x' })).toThrow('canal');
    expect(() => normalizarNotificar({ destinatarios: [{ tipo: 'SOLICITANTE' }], canais: ['EMAIL'], mensagem: '' })).toThrow('mensagem');
  });

  it('exige teams_canal_id quando TEAMS está entre os canais', () => {
    expect(() => normalizarNotificar({ destinatarios: [{ tipo: 'SOLICITANTE' }], canais: ['TEAMS'], mensagem: 'x' })).toThrow('Teams');
  });
});
