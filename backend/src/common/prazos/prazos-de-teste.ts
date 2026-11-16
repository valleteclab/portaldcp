/**
 * PRAZOS DE TESTE — só para órgãos de TESTE, em ensaio.
 *
 * Decisão do dono (08/11/2026): testar a fase externa (sessão, lances,
 * julgamento, homologação, contrato) com envio ao PNCP de treinamento, sem
 * esperar os dias úteis do art. 55 / art. 75, §3º.
 *
 * `PRAZOS_DE_TESTE_ORGAOS` = ids dos órgãos de TESTE, separados por vírgula.
 * Para esses órgãos, e só para eles:
 *  - não há prazo mínimo de divulgação (publicar ou retificar com prazos de
 *    minutos — a ordem das datas continua conferida);
 *  - a janela de lances da dispensa pode durar a partir de 5 minutos (a IN
 *    SEGES 67/2021, art. 11, pede 6 a 10 horas).
 *
 * Onde vale:
 *  - na HOMOLOGAÇÃO (Railway, onde existe `RAILWAY_PROJECT_ID`): basta a lista;
 *  - na PRODUÇÃO (VPS): só para o órgão que aparecer TAMBÉM em
 *    `PRAZOS_DE_TESTE_CONFIRMO_PRODUCAO`. Decisão do dono (15/11/2026), para
 *    ensaiar no órgão de teste da produção. São duas variáveis de propósito:
 *    uma lista copiada do Railway por engano não liga nada na Câmara, e o
 *    órgão real nunca entra sem alguém escrever o id dele duas vezes.
 *
 * O backend avisa no log, ao subir, para quais órgãos a exceção está ligada.
 */
export const VARIAVEL_PRAZOS_DE_TESTE = 'PRAZOS_DE_TESTE_ORGAOS';

/** Janela de lances mínima no ensaio (minutos). */
export const JANELA_MINIMA_DE_TESTE_MIN = 5;

/** Segunda confirmação exigida fora do Railway (produção). */
export const VARIAVEL_CONFIRMACAO_PRODUCAO = 'PRAZOS_DE_TESTE_CONFIRMO_PRODUCAO';

function idsDe(valor: string | undefined): Set<string> {
  return new Set(
    String(valor ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^[0-9a-f-]{36}$/.test(s)),
  );
}

export function orgaosComPrazosDeTeste(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const lista = idsDe(env[VARIAVEL_PRAZOS_DE_TESTE]);
  if (env.RAILWAY_PROJECT_ID) return lista;
  // Produção: só o órgão que estiver nas DUAS variáveis.
  const confirmados = idsDe(env[VARIAVEL_CONFIRMACAO_PRODUCAO]);
  return new Set([...lista].filter((id) => confirmados.has(id)));
}

export function orgaoComPrazosDeTeste(orgaoId: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  return !!orgaoId && orgaosComPrazosDeTeste(env).has(String(orgaoId).toLowerCase());
}
