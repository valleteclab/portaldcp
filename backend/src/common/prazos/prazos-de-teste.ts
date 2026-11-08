/**
 * PRAZOS DE TESTE — só para ensaio na HOMOLOGAÇÃO (Railway), nunca na produção.
 *
 * Decisão do dono (08/11/2026): testar a fase externa (sessão, lances,
 * julgamento, homologação, contrato) no Railway, com envio ao PNCP de
 * treinamento, sem esperar os dias úteis do art. 55 / art. 75, §3º.
 *
 * `PRAZOS_DE_TESTE_ORGAOS` = ids dos órgãos de TESTE, separados por vírgula.
 * Para esses órgãos, e só para eles:
 *  - não há prazo mínimo de divulgação (publicar ou retificar com prazos de
 *    minutos — a ordem das datas continua conferida);
 *  - a janela de lances da dispensa pode durar a partir de 5 minutos (a IN
 *    SEGES 67/2021, art. 11, pede 6 a 10 horas).
 *
 * Trava: só vale onde existe `RAILWAY_PROJECT_ID` (variável que o Railway põe
 * em todo serviço). Na VPS da Câmara ela não existe — mesmo que alguém
 * configure `PRAZOS_DE_TESTE_ORGAOS` lá por engano, nada muda.
 */
export const VARIAVEL_PRAZOS_DE_TESTE = 'PRAZOS_DE_TESTE_ORGAOS';

/** Janela de lances mínima no ensaio (minutos). */
export const JANELA_MINIMA_DE_TESTE_MIN = 5;

export function orgaosComPrazosDeTeste(env: NodeJS.ProcessEnv = process.env): Set<string> {
  if (!env.RAILWAY_PROJECT_ID) return new Set();
  return new Set(
    String(env[VARIAVEL_PRAZOS_DE_TESTE] ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^[0-9a-f-]{36}$/.test(s)),
  );
}

export function orgaoComPrazosDeTeste(orgaoId: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  return !!orgaoId && orgaosComPrazosDeTeste(env).has(String(orgaoId).toLowerCase());
}
