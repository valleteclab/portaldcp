import { FaseLicitacao } from './entities/licitacao.entity';
import { licitacaoEhPublica, licitacaoParaOrgao, licitacaoParaPublico } from './licitacao-visao.util';

const orgao = {
  id: 'o1',
  nome: 'Prefeitura',
  cnpj: '00.000.000/0001-00',
  cidade: 'Cidade',
  uf: 'BA',
  senha_hash: 'hash',
  pncp_senha: 'x',
  email_smtp_senha: 'y',
  whatsapp_token: 'z',
  responsavel_cpf: '000.000.000-00',
};

describe('visões da licitação', () => {
  it('licitacaoParaOrgao tira as credenciais do órgão e mantém o resto', () => {
    const r: any = licitacaoParaOrgao({ id: 'l1', valor_total_estimado: 100, orgao });
    expect(r.valor_total_estimado).toBe(100);
    expect(r.orgao.nome).toBe('Prefeitura');
    expect(r.orgao.senha_hash).toBeUndefined();
    expect(r.orgao.pncp_senha).toBeUndefined();
    expect(r.orgao.whatsapp_token).toBeUndefined();
  });

  it('licitacaoParaPublico: órgão só com contato público; sem id do melhor lance', () => {
    const r: any = licitacaoParaPublico({
      id: 'l1',
      sigilo_orcamento: 'PUBLICO',
      valor_total_estimado: 100,
      orgao,
      itens: [{ id: 'i1', valor_unitario_estimado: 10, melhor_lance_fornecedor_id: 'f1' }],
    });
    expect(r.valor_total_estimado).toBe(100);
    expect(r.itens[0].valor_unitario_estimado).toBe(10);
    expect(r.itens[0].melhor_lance_fornecedor_id).toBeUndefined();
    expect(Object.keys(r.orgao).sort()).toEqual(['cidade', 'cnpj', 'id', 'nome', 'uf']);
  });

  it('licitacaoParaPublico: orçamento SIGILOSO mascara valores estimados (licitação, itens, lotes)', () => {
    const r: any = licitacaoParaPublico({
      id: 'l1',
      sigilo_orcamento: 'SIGILOSO',
      valor_total_estimado: 100,
      valor_homologado: 90,
      itens: [{ id: 'i1', valor_unitario_estimado: 10, valor_total_estimado: 100 }],
      lotes: [{ id: 'lt', valor_total_estimado: 100 }],
    });
    expect(r.valor_total_estimado).toBeNull();
    expect(r.valor_homologado).toBe(90);
    expect(r.itens[0]).toMatchObject({ valor_unitario_estimado: null, valor_total_estimado: null });
    expect(r.lotes[0].valor_total_estimado).toBeNull();
  });

  it('licitacaoEhPublica: fase externa ou suspensa depois de divulgada', () => {
    expect(licitacaoEhPublica({ fase: FaseLicitacao.PLANEJAMENTO })).toBe(false);
    expect(licitacaoEhPublica({ fase: FaseLicitacao.APROVACAO_INTERNA })).toBe(false);
    expect(licitacaoEhPublica({ fase: FaseLicitacao.ACOLHIMENTO_PROPOSTAS })).toBe(true);
    expect(licitacaoEhPublica({ fase: FaseLicitacao.SUSPENSO })).toBe(false);
    expect(licitacaoEhPublica({ fase: FaseLicitacao.SUSPENSO, data_publicacao_edital: '2026-09-01' })).toBe(true);
  });

  it('visões expõem o prazo EFETIVO de impugnação (art. 164) — a tela não recalcula', () => {
    const lic = {
      id: 'l1',
      modalidade: 'PREGAO_ELETRONICO',
      fase: FaseLicitacao.ACOLHIMENTO_PROPOSTAS,
      situacao: 'ATIVA',
      data_limite_impugnacao: null,
      data_abertura_sessao: new Date('2099-10-19T12:00:00Z'), // segunda
    };
    const esperado = '2099-10-14T23:59:59'; // quarta anterior, relógio de Brasília
    for (const r of [licitacaoParaPublico(lic), licitacaoParaOrgao(lic)] as any[]) {
      expect(r.data_limite_impugnacao_efetiva).toBe(esperado);
      expect(r.prazo_manifestacao_aberto).toBe(true);
    }
    // visão parcial (sem fase/cronograma) não ganha os campos
    expect('data_limite_impugnacao_efetiva' in (licitacaoParaPublico({ itens: [] }) as any)).toBe(false);
  });
});
