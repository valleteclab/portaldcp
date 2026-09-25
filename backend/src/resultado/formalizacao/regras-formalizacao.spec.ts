import {
  ModoFormalizacao,
  StatusFormalizacao,
  TipoFormalizacao,
  autoridadeAssinaPorLinkExterno,
  efeitoDoRegistro,
  identificacaoAutoridade,
  modoDoOrgao,
  motivoArquivoExternoInvalido,
  motivoAutoridadeInaptaParaModo,
  motivoCadastroAutoridadeInvalido,
  motivoOperadorInvalido,
  podeConfigurar,
  resolverAutoridade,
  termoEhPublico,
  tituloDoTermo,
} from './regras-formalizacao';

/**
 * Formalização do resultado (Lei 14.133/2021 art. 71 IV; decisão do usuário
 * 25/09/2026): o agente de contratação REGISTRA; a AUTORIDADE pratica o ato.
 */
describe('regras da formalização do resultado', () => {
  describe('operador (quem registra)', () => {
    test('conta do órgão, ADMIN do órgão, pregoeiro/agente e admin da plataforma registram', () => {
      expect(motivoOperadorInvalido({ tipo: 'ORGAO' })).toBeNull();
      expect(motivoOperadorInvalido({ tipo: 'USUARIO', role: 'ADMIN' })).toBeNull();
      expect(motivoOperadorInvalido({ tipo: 'USUARIO', role: 'PREGOEIRO' })).toBeNull();
      expect(motivoOperadorInvalido({ tipo: 'USUARIO', role: 'pregoeiro' })).toBeNull();
      expect(motivoOperadorInvalido({ tipo: 'ADMIN', admin: true })).toBeNull();
    });
    test('equipe de apoio, usuário sem papel e fornecedor não registram', () => {
      expect(motivoOperadorInvalido({ tipo: 'USUARIO', role: 'EQUIPE_APOIO' })).toMatch(/agente de contratação/);
      expect(motivoOperadorInvalido({ tipo: 'USUARIO', role: null })).toMatch(/agente de contratação/);
      expect(motivoOperadorInvalido({ tipo: 'FORNECEDOR' })).toMatch(/agente de contratação/);
    });
    test('configuração (modo/autoridades): só conta do órgão ou ADMIN', () => {
      expect(podeConfigurar({ tipo: 'ORGAO' })).toBe(true);
      expect(podeConfigurar({ tipo: 'USUARIO', role: 'ADMIN' })).toBe(true);
      expect(podeConfigurar({ tipo: 'USUARIO', role: 'PREGOEIRO' })).toBe(false);
    });
  });

  describe('autoridade (quem pratica o ato)', () => {
    const orgao = { nome: 'Prefeitura X', responsavel_nome: 'Fulano Prefeito', responsavel_cargo: 'Prefeito', responsavel_cpf: '000.000.000-00' };
    const cadastro = [
      { id: 'a1', nome: 'Secretária de Administração', cargo: 'Secretária', email: 'sec@x.gov.br', ato_delegacao_numero: 'Decreto 12/2025', ato_delegacao_data: '2025-01-02', padrao: false },
      { id: 'a2', nome: 'Prefeito', cargo: 'Prefeito Municipal', cpf: '123.456.789-09', padrao: true },
      { id: 'a3', nome: 'Inativa', cargo: 'x', ativo: false },
    ];
    test('sem escolha → a padrão; com escolha → a escolhida (com delegação)', () => {
      expect(resolverAutoridade(cadastro, null, orgao)).toMatchObject({ id: 'a2', nome: 'Prefeito', cpf: '12345678909' });
      expect(resolverAutoridade(cadastro, 'a1', orgao)).toMatchObject({
        id: 'a1',
        email: 'sec@x.gov.br',
        ato_delegacao_numero: 'Decreto 12/2025',
        ato_delegacao_data: '2025-01-02',
      });
    });
    test('escolhida inativa ou de outro órgão → erro', () => {
      expect(() => resolverAutoridade(cadastro, 'a3', orgao)).toThrow(/não encontrada/);
      expect(() => resolverAutoridade(cadastro, 'zzz', orgao)).toThrow(/não encontrada/);
    });
    test('sem cadastro → responsável do órgão (nunca bloqueia); valores-modelo ignorados', () => {
      expect(resolverAutoridade([], null, orgao)).toEqual({
        id: null,
        nome: 'Fulano Prefeito',
        cargo: 'Prefeito',
        cpf: null,
        email: null,
        ato_delegacao_numero: null,
        ato_delegacao_data: null,
      });
      expect(resolverAutoridade([], null, { nome: 'Câmara Y', responsavel_nome: 'A definir' })).toMatchObject({ nome: 'Câmara Y', cargo: 'Autoridade competente' });
    });
    test('identificação no termo inclui a delegação', () => {
      const a = resolverAutoridade(cadastro, 'a1', orgao);
      expect(identificacaoAutoridade(a, (d) => d.split('-').reverse().join('/'))).toBe(
        'Secretária de Administração, Secretária, no exercício da competência delegada pelo ato nº Decreto 12/2025, de 02/01/2025',
      );
    });
    test('assinatura eletrônica exige autoridade cadastrada com e-mail; link externo só com CPF', () => {
      const semEmail = resolverAutoridade(cadastro, 'a2', orgao);
      const comEmail = resolverAutoridade(cadastro, 'a1', orgao);
      expect(motivoAutoridadeInaptaParaModo(ModoFormalizacao.ASSINATURA_ELETRONICA, semEmail)).toMatch(/e-mail/);
      expect(motivoAutoridadeInaptaParaModo(ModoFormalizacao.ASSINATURA_ELETRONICA, comEmail)).toBeNull();
      expect(motivoAutoridadeInaptaParaModo(ModoFormalizacao.ASSINATURA_ELETRONICA, resolverAutoridade([], null, orgao))).toMatch(/cadastre/);
      expect(motivoAutoridadeInaptaParaModo(ModoFormalizacao.REGISTRO_DIRETO, semEmail)).toBeNull();
      expect(autoridadeAssinaPorLinkExterno(semEmail)).toBe(true);
      expect(autoridadeAssinaPorLinkExterno(comEmail)).toBe(false);
    });
    test('cadastro: nome, cargo, CPF de 11 dígitos, e-mail e data válidos', () => {
      expect(motivoCadastroAutoridadeInvalido({ nome: 'A', cargo: 'B' })).toBeNull();
      expect(motivoCadastroAutoridadeInvalido({ nome: '', cargo: 'B' })).toMatch(/nome/);
      expect(motivoCadastroAutoridadeInvalido({ nome: 'A', cargo: '' })).toMatch(/cargo/);
      expect(motivoCadastroAutoridadeInvalido({ nome: 'A', cargo: 'B', cpf: '123' })).toMatch(/CPF/);
      expect(motivoCadastroAutoridadeInvalido({ nome: 'A', cargo: 'B', email: 'x' })).toMatch(/E-mail/);
      expect(motivoCadastroAutoridadeInvalido({ nome: 'A', cargo: 'B', ato_delegacao_data: '02/01/2025' })).toMatch(/Data/);
    });
  });

  describe('modo do órgão → efeito do registro', () => {
    test('padrão = REGISTRO_DIRETO (valor desconhecido/nulo não bloqueia)', () => {
      expect(modoDoOrgao(null)).toBe(ModoFormalizacao.REGISTRO_DIRETO);
      expect(modoDoOrgao('XYZ')).toBe(ModoFormalizacao.REGISTRO_DIRETO);
      expect(modoDoOrgao('TERMO_EXTERNO')).toBe(ModoFormalizacao.TERMO_EXTERNO);
    });
    test('registro direto: imediato; assinatura: aguarda; termo externo: imediato só com arquivo', () => {
      expect(efeitoDoRegistro(ModoFormalizacao.REGISTRO_DIRETO, false)).toEqual({ efeito: 'IMEDIATO' });
      expect(efeitoDoRegistro(ModoFormalizacao.ASSINATURA_ELETRONICA, true)).toEqual({ efeito: 'AGUARDA_ASSINATURA' });
      expect(efeitoDoRegistro(ModoFormalizacao.TERMO_EXTERNO, true)).toEqual({ efeito: 'IMEDIATO' });
      expect(efeitoDoRegistro(ModoFormalizacao.TERMO_EXTERNO, false)).toMatchObject({ efeito: 'RECUSADO', motivo: expect.stringMatching(/Diário Oficial/) });
    });
    test('termo externo: PDF/PNG/JPG até 20 MB', () => {
      expect(motivoArquivoExternoInvalido({ mimetype: 'application/pdf', originalname: 't.pdf', size: 10 })).toBeNull();
      expect(motivoArquivoExternoInvalido({ mimetype: 'image/jpeg', originalname: 'dom.JPG', size: 10 })).toBeNull();
      expect(motivoArquivoExternoInvalido({ mimetype: 'text/html', originalname: 't.html', size: 10 })).toMatch(/PDF/);
      expect(motivoArquivoExternoInvalido({ mimetype: 'application/pdf', originalname: 't.exe', size: 10 })).toMatch(/PDF/);
      expect(motivoArquivoExternoInvalido({ mimetype: 'application/pdf', originalname: 't.pdf', size: 0 })).toMatch(/vazio/);
      expect(motivoArquivoExternoInvalido({ mimetype: 'application/pdf', originalname: 't.pdf', size: 21 * 1024 * 1024 })).toMatch(/20 MB/);
    });
  });

  describe('termo', () => {
    test('título por ato', () => {
      expect(tituloDoTermo(TipoFormalizacao.ADJUDICACAO)).toBe('TERMO DE ADJUDICAÇÃO');
      expect(tituloDoTermo(TipoFormalizacao.HOMOLOGACAO)).toBe('TERMO DE ADJUDICAÇÃO E HOMOLOGAÇÃO');
    });
    test('público só depois da homologação e só o ato efetivado', () => {
      const homologada = { data_homologacao: new Date() };
      expect(termoEhPublico({ status: StatusFormalizacao.EFETIVADO }, homologada)).toBe(true);
      expect(termoEhPublico({ status: StatusFormalizacao.EFETIVADO }, { data_homologacao: null })).toBe(false);
      expect(termoEhPublico({ status: StatusFormalizacao.PENDENTE_ASSINATURA }, homologada)).toBe(false);
      expect(termoEhPublico({ status: StatusFormalizacao.CANCELADO }, homologada)).toBe(false);
    });
  });
});
