import { SituacaoLeitura } from './entities/enums';

/**
 * Confirmação de presença no fechamento da conferência.
 *
 * O leitor UHF atravessa parede. Quando ele traz um bem que pertence a outro
 * setor, isso significa uma de duas coisas OPOSTAS:
 *
 *   - o bem foi mesmo parar nesta sala  -> achado real, pede transferência
 *   - o leitor pegou a sala vizinha     -> ruído, descarta
 *
 * O sistema não tem como distinguir: os dois casos produzem exatamente a mesma
 * leitura. Só quem está com o aparelho na mão, dentro da sala, sabe. Por isso a
 * pergunta vai para o conferente no momento de finalizar, enquanto ele ainda
 * está lá — depois ninguém mais consegue responder.
 *
 * Vale igual para o bem já baixado no cadastro e lido como presente, e para o
 * código que não casou com bem nenhum (DESCONHECIDO): ali a pergunta é outra —
 * "isto é um bem desta sala que não está cadastrado, ou é tag de fora?" — mas o
 * motivo é o mesmo, e a resposta também só existe enquanto alguém está na sala.
 */

/** Situações em que a leitura pode ter vindo de fora da sala. */
export function exigeConfirmacaoPresenca(situacao: SituacaoLeitura | string | null | undefined): boolean {
  const s = String(situacao || '').toUpperCase();
  return (
    s === SituacaoLeitura.OUTRO_SETOR ||
    s === SituacaoLeitura.BAIXADO_PRESENTE ||
    s === SituacaoLeitura.DESCONHECIDO
  );
}

/**
 * Bem confirmado presente numa sala que não é a dele. O setor de origem não
 * pode cobrar esse bem como não localizado — ele FOI localizado, só que em
 * outro lugar, e isso vira sugestão de transferência para a comissão.
 */
export function localizadoEmOutroSetor(l: LeituraConfirmavel): boolean {
  return String(l.situacao || '').toUpperCase() === SituacaoLeitura.OUTRO_SETOR && l.presenca_confirmada === true;
}

export interface LeituraConfirmavel {
  id: string;
  situacao: SituacaoLeitura | string;
  presenca_confirmada?: boolean | null;
}

/** Leituras que travam o fechamento por ainda não terem resposta. */
export function pendentesDeConfirmacao<T extends LeituraConfirmavel>(leituras: T[]): T[] {
  return (leituras || []).filter(
    (l) => exigeConfirmacaoPresenca(l.situacao) && (l.presenca_confirmada === null || l.presenca_confirmada === undefined),
  );
}

/**
 * A leitura conta para o relatório da sala?
 * Só não conta quando o conferente respondeu que o bem NÃO estava ali.
 */
export function leituraContaNoRelatorio(l: LeituraConfirmavel): boolean {
  return !(exigeConfirmacaoPresenca(l.situacao) && l.presenca_confirmada === false);
}

/**
 * Mensagem que barra o fechamento. Nomeia os bens em vez de só contar, para o
 * conferente saber o que procurar sem sair da tela.
 */
export function mensagemPendencias(
  pendentes: Array<{ plaqueta?: string | null; descricao?: string | null; codigo_lido?: string | null }>,
): string {
  const n = pendentes.length;
  const amostra = pendentes
    .slice(0, 3)
    .map((p) =>
      p.plaqueta || p.descricao
        ? `${p.plaqueta || 's/ plaqueta'} ${(p.descricao || '').slice(0, 40)}`.trim()
        : `código ${(p.codigo_lido || '').slice(0, 24)}`,
    )
    .join('; ');
  const resto = n > 3 ? ` e mais ${n - 3}` : '';
  return (
    `Antes de finalizar, responda ${n === 1 ? 'sobre a leitura que não é desta sala' : `sobre as ${n} leituras que não são desta sala`}: ` +
    `${amostra}${resto}.`
  );
}
