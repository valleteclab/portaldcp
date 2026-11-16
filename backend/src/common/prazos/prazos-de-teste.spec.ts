import { orgaoComPrazosDeTeste, orgaosComPrazosDeTeste } from './prazos-de-teste';
import { prazoMinimoDeDivulgacao } from '../../publicacao/regras-publicacao';

const ORGAO = '62203670-0000-4000-8000-000000000162';
const OUTRO = '11111111-1111-4111-8111-111111111111';

describe('prazos de teste (homologação; produção só com segunda confirmação)', () => {
  const salvo = { ...process.env };
  afterEach(() => {
    process.env = { ...salvo };
  });

  it('sem RAILWAY_PROJECT_ID (VPS) a lista não vale, mesmo configurada', () => {
    const env = { PRAZOS_DE_TESTE_ORGAOS: ORGAO } as any;
    expect(orgaosComPrazosDeTeste(env).size).toBe(0);
    expect(orgaoComPrazosDeTeste(ORGAO, env)).toBe(false);
  });

  it('na produção vale só para o órgão que estiver nas DUAS variáveis', () => {
    const base = { PRAZOS_DE_TESTE_ORGAOS: `${ORGAO},${OUTRO}` } as any;
    expect(orgaosComPrazosDeTeste({ ...base, PRAZOS_DE_TESTE_CONFIRMO_PRODUCAO: ORGAO }).size).toBe(1);
    expect(orgaoComPrazosDeTeste(ORGAO, { ...base, PRAZOS_DE_TESTE_CONFIRMO_PRODUCAO: ORGAO })).toBe(true);
    expect(orgaoComPrazosDeTeste(OUTRO, { ...base, PRAZOS_DE_TESTE_CONFIRMO_PRODUCAO: ORGAO })).toBe(false);
    // confirmação sem a lista, ou com valor que não é id, não liga nada
    expect(orgaosComPrazosDeTeste({ PRAZOS_DE_TESTE_CONFIRMO_PRODUCAO: ORGAO } as any).size).toBe(0);
    expect(orgaosComPrazosDeTeste({ ...base, PRAZOS_DE_TESTE_CONFIRMO_PRODUCAO: 'sim' }).size).toBe(0);
  });

  it('no Railway vale só para os órgãos listados; ids inválidos são ignorados', () => {
    const env = { RAILWAY_PROJECT_ID: 'x', PRAZOS_DE_TESTE_ORGAOS: ` ${ORGAO.toUpperCase()} , lixo,` } as any;
    expect(orgaoComPrazosDeTeste(ORGAO, env)).toBe(true);
    expect(orgaoComPrazosDeTeste(OUTRO, env)).toBe(false);
    expect(orgaoComPrazosDeTeste(null, env)).toBe(false);
    expect(orgaosComPrazosDeTeste(env).size).toBe(1);
  });

  it('prazo mínimo de divulgação: órgão de teste sem mínimo; os demais com o da lei', () => {
    process.env.RAILWAY_PROJECT_ID = 'x';
    process.env.PRAZOS_DE_TESTE_ORGAOS = ORGAO;
    expect(prazoMinimoDeDivulgacao({ modalidade: 'DISPENSA_ELETRONICA', orgao_id: ORGAO }).dias).toBeNull();
    expect(prazoMinimoDeDivulgacao({ modalidade: 'DISPENSA_ELETRONICA', orgao_id: OUTRO }).dias).toBe(3);
    delete process.env.RAILWAY_PROJECT_ID;
    expect(prazoMinimoDeDivulgacao({ modalidade: 'DISPENSA_ELETRONICA', orgao_id: ORGAO }).dias).toBe(3);
  });
});
