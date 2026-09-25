import {
  DocumentoCadastro,
  OrigemDocumento,
  ResultadoAnalise,
  StatusDiligencia,
  StatusHabilitacao,
  hojeBrasilia,
  motivoDocumentoCadastroInvalido,
  motivoInversaoInvalida,
  motivoNaoAbreDiligencia,
  motivoNaoAnalisa,
  motivoNaoConcluiEnvio,
  motivoNaoProrroga,
  motivoNaoRemove,
  motivoPrazoInvalido,
  pendenciasParaHabilitar,
  preChecagemCadastro,
  regraDeEnvio,
  situacaoDaExigencia,
  statusEfetivo,
  validarExigencias,
} from './regras-habilitacao';
import { MODELOS_EXIGENCIAS, chaveModeloPadrao, modeloExigencias } from './modelos-exigencias';

const HOJE = '2026-09-25';
const agora = new Date('2026-09-25T15:00:00-03:00');
const antes = (h: number) => new Date(agora.getTime() - h * 3_600_000);
const depois = (h: number) => new Date(agora.getTime() + h * 3_600_000);

const doc = (p: Partial<DocumentoCadastro>): DocumentoCadastro => ({
  id: p.id ?? 'd1',
  tipo: p.tipo ?? 'CND_RECEITA_FEDERAL_PGFN',
  status: p.status ?? 'APROVADO',
  data_validade: p.data_validade ?? null,
  created_at: p.created_at ?? '2026-01-01T00:00:00Z',
});

describe('Habilitação — regras puras (plano E4)', () => {
  describe('datas e prazos', () => {
    test('hoje em Brasília (validade é por data)', () => {
      // 01:30 UTC de 26/09 = 22:30 de 25/09 em Brasília
      expect(hojeBrasilia(new Date('2026-09-26T01:30:00Z'))).toBe('2026-09-25');
    });

    test('prazo mínimo de 2 h (IN 73 art. 39), parâmetro do órgão acima do piso', () => {
      expect(motivoPrazoInvalido(1, 2)).toMatch(/mínimo 2 hora/);
      expect(motivoPrazoInvalido(3, 4)).toMatch(/mínimo 4 hora/);
      expect(motivoPrazoInvalido(2, 1)).toBeNull();
      expect(motivoPrazoInvalido(null, 2)).toBeNull();
      expect(motivoPrazoInvalido(0, 2)).toBe('Prazo inválido');
    });

    test('prorrogação única, antes do fim do prazo, só na convocação', () => {
      const h = { status: StatusHabilitacao.AGUARDANDO_ENVIO, origem: 'CONVOCACAO', prazo_ate: depois(1), prazo_horas: 2 };
      expect(motivoNaoProrroga(h, agora)).toBeNull();
      expect(motivoNaoProrroga({ ...h, prorrogada_em: antes(1) }, agora)).toMatch(/uma vez/);
      expect(motivoNaoProrroga({ ...h, prazo_ate: antes(1) }, agora)).toMatch(/terminou/);
      expect(motivoNaoProrroga({ ...h, origem: 'INVERSAO' }, agora)).toMatch(/inversão/);
      expect(motivoNaoProrroga({ ...h, status: StatusHabilitacao.ENVIADA }, agora)).not.toBeNull();
    });
  });

  describe('registro cadastral (art. 70) — pré-checagem', () => {
    const exig = [
      { id: 'e-fed', aceita_registro_cadastral: true, tipos_documento_cadastro: ['CND_RECEITA_FEDERAL_PGFN'], exige_validade: true },
      { id: 'e-contrato', aceita_registro_cadastral: true, tipos_documento_cadastro: ['CONTRATO_SOCIAL', 'ESTATUTO_SOCIAL'], exige_validade: false },
      { id: 'e-decl', aceita_registro_cadastral: false, tipos_documento_cadastro: [], exige_validade: false },
      { id: 'e-fgts', aceita_registro_cadastral: true, tipos_documento_cadastro: ['CRF_FGTS'], exige_validade: true },
    ];

    test('mapeia o tipo do cadastro para a exigência e só aceita documento APROVADO e válido', () => {
      const docs = [
        doc({ id: 'fed-venc', tipo: 'CND_RECEITA_FEDERAL_PGFN', data_validade: '2026-09-24' }),
        doc({ id: 'fed-ok', tipo: 'CND_RECEITA_FEDERAL_PGFN', data_validade: '2026-10-30' }),
        doc({ id: 'estatuto', tipo: 'ESTATUTO_SOCIAL' }),
        doc({ id: 'fgts-pend', tipo: 'CRF_FGTS', status: 'PENDENTE', data_validade: '2026-12-01' }),
      ];
      const r = preChecagemCadastro(exig, docs, HOJE, 'APROVADO');
      const por = Object.fromEntries(r.map((c) => [c.exigenciaId, c]));
      expect(por['e-fed']).toMatchObject({ coberta: true, documento: { id: 'fed-ok' } });
      expect(por['e-contrato']).toMatchObject({ coberta: true, documento: { id: 'estatuto' } });
      expect(por['e-decl']).toMatchObject({ coberta: false, motivo: /não aceita/ });
      expect(por['e-fgts'].coberta).toBe(false);
      expect(por['e-fgts'].motivo).toMatch(/não aprovado/);
    });

    test('documento vencido (por data ou marcado VENCIDO pelo job) não cobre; validade de hoje ainda vale', () => {
      expect(motivoDocumentoCadastroInvalido(doc({ data_validade: '2026-09-24' }), true, HOJE)).toMatch(/vencido em 24\/09\/2026/);
      expect(motivoDocumentoCadastroInvalido(doc({ status: 'VENCIDO', data_validade: '2027-01-01' }), true, HOJE)).toMatch(/vencido/);
      expect(motivoDocumentoCadastroInvalido(doc({ data_validade: HOJE }), true, HOJE)).toBeNull();
      // exigência com validade: documento sem data de validade não serve
      expect(motivoDocumentoCadastroInvalido(doc({ data_validade: null }), true, HOJE)).toMatch(/sem data de validade/);
      expect(motivoDocumentoCadastroInvalido(doc({ data_validade: null }), false, HOJE)).toBeNull();
    });

    test('entre vários válidos, fica o de validade mais longa', () => {
      const r = preChecagemCadastro(
        [exig[0]],
        [doc({ id: 'a', data_validade: '2026-10-01' }), doc({ id: 'b', data_validade: '2026-12-01' })],
        HOJE,
        'APROVADO',
      );
      expect(r[0].documento?.id).toBe('b');
    });

    test('cadastro SUSPENSO não aproveita o registro', () => {
      const r = preChecagemCadastro([exig[1]], [doc({ tipo: 'CONTRATO_SOCIAL' })], HOJE, 'SUSPENSO');
      expect(r[0]).toMatchObject({ coberta: false, motivo: /suspenso/ });
    });
  });

  describe('envio sem substituição (art. 64) e diligência', () => {
    const conv = { status: StatusHabilitacao.AGUARDANDO_ENVIO, origem: 'CONVOCACAO', prazo_ate: depois(2), prazo_horas: 2 };

    test('no prazo, antes da entrega: ENVIO; retirar rascunho permitido', () => {
      expect(regraDeEnvio(conv, 'e1', [], agora)).toEqual({ origem: OrigemDocumento.ENVIO, diligenciaId: null });
      expect(motivoNaoRemove(conv, { origem: 'ENVIO', analise: 'PENDENTE' }, agora)).toBeNull();
      expect(motivoNaoConcluiEnvio(conv, agora)).toBeNull();
    });

    test('entregue (ato ou fim do prazo): novo documento e substituição recusados', () => {
      const entregue = { ...conv, status: StatusHabilitacao.ENVIADA };
      const r = regraDeEnvio(entregue, 'e1', [], agora);
      expect('erro' in r && r.erro).toMatch(/art\. 64/);
      expect(motivoNaoRemove(entregue, { origem: 'ENVIO', analise: 'PENDENTE' }, agora)).toMatch(/substituição/);
      // prazo vencido sem o ato de entrega = entregue
      const vencido = { ...conv, prazo_ate: antes(1) };
      expect(statusEfetivo(vencido, [], agora)).toBe(StatusHabilitacao.ENVIADA);
      expect('erro' in regraDeEnvio(vencido, 'e1', [], agora)).toBe(true);
      expect(motivoNaoConcluiEnvio(vencido, agora)).toMatch(/prazo terminou/);
      // documento do cadastro nunca é "retirado" pelo licitante
      expect(motivoNaoRemove(conv, { origem: 'CADASTRO', analise: 'PENDENTE' }, agora)).not.toBeNull();
    });

    test('diligência vigente: só COMPLEMENTO das exigências indicadas; vencida → volta à análise', () => {
      const emDil = { ...conv, status: StatusHabilitacao.EM_DILIGENCIA };
      const d = { id: 'dil', status: StatusDiligencia.ABERTA, prazo_ate: depois(3), exigencia_ids: ['e1'] };
      expect(regraDeEnvio(emDil, 'e1', [d], agora)).toEqual({ origem: OrigemDocumento.COMPLEMENTO, diligenciaId: 'dil' });
      const fora = regraDeEnvio(emDil, 'e2', [d], agora);
      expect('erro' in fora && fora.erro).toMatch(/não inclui esta exigência/);
      const expirada = { ...d, prazo_ate: antes(1) };
      expect(statusEfetivo(emDil, [expirada], agora)).toBe(StatusHabilitacao.ENVIADA);
      expect('erro' in regraDeEnvio(emDil, 'e1', [expirada], agora)).toBe(true);
      // decidida: nada
      expect('erro' in regraDeEnvio({ ...conv, status: StatusHabilitacao.HABILITADO }, 'e1', [d], agora)).toBe(true);
    });

    test('abrir diligência: documentação entregue, motivo, prazo ≥ 2 h e exigências da licitação', () => {
      const ids = ['e1', 'e2'];
      expect(motivoNaoAbreDiligencia(StatusHabilitacao.AGUARDANDO_ENVIO, { motivo: 'Certidão ilegível', prazoHoras: 2, exigenciaIds: ['e1'] }, ids)).toMatch(/prazo de envio/);
      expect(motivoNaoAbreDiligencia(StatusHabilitacao.ENVIADA, { motivo: 'curto', prazoHoras: 2, exigenciaIds: ['e1'] }, ids)).toMatch(/motivo/);
      expect(motivoNaoAbreDiligencia(StatusHabilitacao.ENVIADA, { motivo: 'Certidão ilegível', prazoHoras: 1, exigenciaIds: ['e1'] }, ids)).toMatch(/mínimo/);
      expect(motivoNaoAbreDiligencia(StatusHabilitacao.ENVIADA, { motivo: 'Certidão ilegível', prazoHoras: 2, exigenciaIds: [] }, ids)).toMatch(/Indique/);
      expect(motivoNaoAbreDiligencia(StatusHabilitacao.ENVIADA, { motivo: 'Certidão ilegível', prazoHoras: 2, exigenciaIds: ['x'] }, ids)).toMatch(/não pertence/);
      expect(motivoNaoAbreDiligencia(StatusHabilitacao.ENVIADA, { motivo: 'Certidão ilegível', prazoHoras: 2, exigenciaIds: ['e2'] }, ids)).toBeNull();
      expect(motivoNaoAbreDiligencia(StatusHabilitacao.HABILITADO, { motivo: 'Certidão ilegível', prazoHoras: 2, exigenciaIds: ['e2'] }, ids)).toMatch(/decidida/);
    });

    test('análise só depois da entrega e antes da decisão', () => {
      expect(motivoNaoAnalisa(StatusHabilitacao.AGUARDANDO_ENVIO)).toMatch(/prazo de envio/);
      expect(motivoNaoAnalisa(StatusHabilitacao.ENVIADA)).toBeNull();
      expect(motivoNaoAnalisa(StatusHabilitacao.EM_DILIGENCIA)).toBeNull();
      expect(motivoNaoAnalisa(StatusHabilitacao.INABILITADO)).toMatch(/decidida/);
    });
  });

  describe('habilitar: exigências obrigatórias atendidas', () => {
    const exig = [
      { id: 'e1', descricao: 'CND federal', obrigatorio: true },
      { id: 'e2', descricao: 'Balanço', obrigatorio: true },
      { id: 'e3', descricao: 'Atestado', obrigatorio: false },
    ];

    test('uma ATENDE basta por exigência; opcional não bloqueia; diligência vigente bloqueia', () => {
      const docs = [
        { exigencia_id: 'e1', analise: ResultadoAnalise.NAO_ATENDE },
        { exigencia_id: 'e1', analise: ResultadoAnalise.ATENDE },
        { exigencia_id: 'e2', analise: ResultadoAnalise.ATENDE },
      ];
      expect(pendenciasParaHabilitar(exig, docs, [], agora)).toEqual([]);
      const dil = { id: 'd', status: StatusDiligencia.ABERTA, prazo_ate: depois(1), exigencia_ids: ['e1'] };
      expect(pendenciasParaHabilitar(exig, docs, [dil], agora)[0]).toMatch(/diligência em aberto/);
    });

    test('pendências nomeiam a exigência', () => {
      const p = pendenciasParaHabilitar(exig, [{ exigencia_id: 'e1', analise: ResultadoAnalise.NAO_ATENDE }], [], agora);
      expect(p).toEqual(['CND federal: não atendida', 'Balanço: nenhum documento apresentado']);
      expect(pendenciasParaHabilitar(exig, [{ exigencia_id: 'e1', analise: ResultadoAnalise.DILIGENCIA }, { exigencia_id: 'e2', analise: 'ATENDE' }], [], agora)).toEqual([
        'CND federal: análise pendente',
      ]);
      expect(situacaoDaExigencia([])).toBe('SEM_DOCUMENTO');
      expect(situacaoDaExigencia([{ exigencia_id: 'e1', analise: 'NAO_ATENDE' }])).toBe('NAO_ATENDIDA');
    });
  });

  describe('exigências do edital e modelos', () => {
    test('validação do editor: categoria, descrição e tipos do cadastro', () => {
      const { erros } = validarExigencias([
        { categoria: 'FISCAL', descricao: 'CND federal', tipos_documento_cadastro: ['CND_RECEITA_FEDERAL_PGFN'] },
        { categoria: 'XYZ', descricao: 'abc', tipos_documento_cadastro: ['INEXISTENTE'] },
      ]);
      expect(erros.join(' ')).toMatch(/Exigência 2: categoria inválida/);
      expect(erros.join(' ')).toMatch(/descreva/);
      expect(erros.join(' ')).toMatch(/INEXISTENTE/);
      const ok = validarExigencias([{ categoria: 'juridica', descricao: 'Declaração de menor', aceita_registro_cadastral: true }]);
      expect(ok.erros).toEqual([]);
      // sem tipo mapeado, não há como aceitar o cadastro
      expect(ok.exigencias[0]).toMatchObject({ categoria: 'JURIDICA', aceita_registro_cadastral: false, obrigatorio: true });
    });

    test('modelo padrão por objeto e modalidade; todos os modelos válidos', () => {
      expect(chaveModeloPadrao('PREGAO_ELETRONICO', 'COMPRA')).toBe('BENS');
      expect(chaveModeloPadrao('CONCORRENCIA', 'SERVICO')).toBe('SERVICOS');
      expect(chaveModeloPadrao('CONCORRENCIA', 'OBRA')).toBe('OBRAS');
      expect(chaveModeloPadrao('PREGAO_ELETRONICO', 'SERVICO_ENGENHARIA')).toBe('OBRAS');
      expect(chaveModeloPadrao('DISPENSA_ELETRONICA', 'COMPRA')).toBe('DISPENSA');
      for (const chave of Object.keys(MODELOS_EXIGENCIAS) as Array<keyof typeof MODELOS_EXIGENCIAS>) {
        expect(validarExigencias(modeloExigencias(chave)).erros).toEqual([]);
      }
      const cats = new Set(modeloExigencias('OBRAS').map((e) => e.categoria));
      expect([...cats].sort()).toEqual(['ECONOMICO_FINANCEIRA', 'FISCAL', 'JURIDICA', 'SOCIAL_TRABALHISTA', 'TECNICA']);
    });

    test('inversão de fases só na concorrência e só antes da publicação', () => {
      expect(motivoInversaoInvalida({ inversaoFinal: true, inversaoAtual: false, modalidadeFinal: 'PREGAO_ELETRONICO' })?.status).toBe(400);
      expect(motivoInversaoInvalida({ inversaoFinal: true, inversaoAtual: false, modalidadeFinal: 'CONCORRENCIA', faseAtual: 'APROVACAO_INTERNA' })).toBeNull();
      expect(motivoInversaoInvalida({ inversaoFinal: true, inversaoAtual: false, modalidadeFinal: 'CONCORRENCIA', faseAtual: 'PUBLICADO' })?.status).toBe(409);
      expect(motivoInversaoInvalida({ inversaoFinal: true, inversaoAtual: true, modalidadeFinal: 'CONCORRENCIA', faseAtual: 'PUBLICADO' })).toBeNull();
    });
  });
});
