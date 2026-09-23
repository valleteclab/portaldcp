import { mensagemSemOsAutorizada } from './mensagem-sem-os.util';

describe('mensagem para o fornecedor sem OS autorizada', () => {
  it('sem OS nenhuma, pede para aguardar o órgão', () => {
    expect(mensagemSemOsAutorizada([])).toBe(
      'Aguarde o órgão enviar uma Ordem de Serviço autorizada para emitir a medição.',
    );
  });

  it('com OS pendente, diz qual e o que falta (caso OS-0265/2026)', () => {
    expect(
      mensagemSemOsAutorizada([{ numero: 'OS-0265/2026', status: 'AGUARDANDO_AUTORIZACAO' }]),
    ).toBe(
      'Já existe Ordem de Serviço criada para este contrato, mas ainda não autorizada: OS-0265/2026 (aguardando autorização). ' +
        'Solicite ao órgão a autorização para emitir a medição.',
    );
  });

  it('rascunho aparece como rascunho', () => {
    expect(mensagemSemOsAutorizada([{ numero: 'OS-0300/2026', status: 'RASCUNHO' }])).toContain(
      'OS-0300/2026 (em rascunho)',
    );
  });
});
