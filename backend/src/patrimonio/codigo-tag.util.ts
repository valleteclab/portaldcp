/**
 * Triagem do que o leitor RFID entrega durante a conferência.
 *
 * Por que existe: a antena UHF alcança tudo em volta, e hoje quase todo produto
 * de varejo sai de fábrica com chip RFID costurado na etiqueta (roupa, calçado,
 * cosmético). Num teste real do RFD8500 na Câmara de LEM, um único puxão de
 * gatilho trouxe oito tags de terceiros junto com as do patrimônio:
 *
 *   303A059301EE93C000002CD9          -> SGTIN-96 (etiqueta de produto GS1)
 *   10303284000970B22AE80606CFCB481D  -> EPC de 128 bits
 *   3BE1000000B5ED4F00001F8B          -> proprietária
 *
 * Sem triagem, cada uma vira uma linha DESCONHECIDO no relatório da sala e o
 * conferente perde tempo separando roupa de patrimônio. Pior: o decodificador
 * de EPC em ASCII pescava dígitos de qualquer lixo — `3BE1000000A8EF7100000081`
 * virava "tombo 81" e podia casar com um bem existente, registrando a leitura
 * no bem errado sem ninguém perceber.
 *
 * As duas funções aqui fecham esses buracos.
 */

/** URL do QR da plaqueta (.../p/<uuid>) ou o uuid solto. */
const RE_QR = /\/p\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O código tem a cara de algo que o próprio sistema produziu?
 *
 * Aceita: o QR da plaqueta, a plaqueta digitada e o EPC gravado pelo fornecedor
 * no padrão do órgão (tombo em decimal com zeros à esquerda, ex.: 24 dígitos).
 * Recusa: EPC com letras hexadecimais, que é a marca das tags de terceiros.
 *
 * Só decide a FORMA. Quem não passa aqui mas resolve para um bem continua
 * valendo — a triagem só age quando nada foi encontrado.
 */
export function pareceCodigoDoOrgao(codigoBruto: string): boolean {
  const codigo = String(codigoBruto || '').trim();
  if (!codigo) return false;
  if (RE_QR.test(codigo) || RE_UUID.test(codigo)) return true;
  const limpo = codigo.replace(/\s+/g, '');
  // Plaqueta ou EPC decimal: só dígitos, e com algum dígito diferente de zero.
  return /^\d{1,32}$/.test(limpo) && /[1-9]/.test(limpo);
}

/**
 * Leitura que deve ser DESCARTADA em silêncio: nada foi encontrado e o código
 * não tem a forma de nada que o órgão emita. É tag de terceiro passando perto.
 */
export function ehTagDeTerceiro(codigoBruto: string, achouBem: boolean): boolean {
  if (achouBem) return false;
  return !pareceCodigoDoOrgao(codigoBruto);
}

/**
 * EPC em hex que carrega a plaqueta em ASCII, como alguns fornecedores gravam
 * ("CMLEM000482" -> 434D4C454D303030343832, completado com zeros à direita).
 * Devolve o número da plaqueta, ou null quando o hex não é texto de verdade.
 *
 * O cuidado que faltava: antes bastava o hex ter QUALQUER dígito depois de
 * jogar fora os bytes não imprimíveis. Agora o conteúdo inteiro precisa ser
 * texto legível (tirando o preenchimento de zeros nas pontas) e os dígitos
 * precisam formar um número com ao menos 2 casas — senão é só coincidência.
 */
export function plaquetaDeEpcAscii(codigoBruto: string): string | null {
  const limpo = String(codigoBruto || '').trim().replace(/\s+/g, '').toUpperCase();
  if (!/^[0-9A-F]{8,64}$/.test(limpo) || limpo.length % 2 !== 0) return null;
  const texto = Buffer.from(limpo, 'hex')
    .toString('latin1')
    .replace(/^\0+/, '')
    .replace(/\0+$/, '');
  // Tem de ser texto imprimível do começo ao fim. Um único byte de controle no
  // meio denuncia que aquilo nunca foi uma string — é EPC binário de terceiro.
  if (!/^[\x20-\x7e]{3,}$/.test(texto)) return null;
  const digitos = texto.match(/\d{2,12}/g);
  if (!digitos?.length) return null;
  const num = digitos[digitos.length - 1].replace(/^0+/, '');
  return num && num !== '0' ? num : null;
}
