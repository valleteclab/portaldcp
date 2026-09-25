/**
 * ============================================================================
 * MODELO DO LANCE (plano E2 §2.3) — tipos e regras PURAS do motor de disputa
 * ============================================================================
 *
 * Um lance tem SEMPRE:
 *  - `fornecedor_id` (chave do licitante; `fornecedor_identificador` é legado);
 *  - `valor`          = valor COMPARÁVEL, na unidade da `base_lance` da licitação
 *                       (é o que ordena o ranking e o que o licitante digita);
 *  - `valor_unitario` e `valor_total` explícitos (homologação, ata e contrato
 *                       leem estes — nunca "valor × quantidade" de novo: fim do B2);
 *  - `origem`         (PROPOSTA, LANCE, LANCE_FECHADO, DESEMPATE_MPE,
 *                       NEGOCIACAO, JANELA_DISPENSA).
 *
 * Nada aqui toca banco: as regras de validação são funções puras testadas em
 * `modelo-lance.spec.ts`; o `DisputaService.registrarLance` só junta o contexto
 * (com trava pessimista no item) e chama `validarLance`.
 */

/** Unidade em que os lances da licitação são dados e comparados. */
export enum BaseLance {
  /** Preço unitário do item (valor_total = unitário × quantidade). */
  UNITARIO = 'UNITARIO',
  /** Valor total do item (padrão histórico do pregão por item). */
  TOTAL_ITEM = 'TOTAL_ITEM',
  /** Valor global do lote — disputa por lote (unidade LOTE: disputa-lote.service.ts, rateio-lote.ts). */
  TOTAL_LOTE = 'TOTAL_LOTE',
}

/** De onde veio o valor registrado na tabela `lances`. */
export enum OrigemLance {
  /** Proposta inicial convertida em lance ao abrir o item (uma por item+fornecedor). */
  PROPOSTA = 'PROPOSTA',
  /** Lance da etapa aberta (IN 73 art. 21/23). */
  LANCE = 'LANCE',
  /** Lance final fechado (modo aberto-fechado, IN 73 art. 24) — motor de modos. */
  LANCE_FECHADO = 'LANCE_FECHADO',
  /** Proposta de desempate da ME/EPP (LC 123 art. 45, I). */
  DESEMPATE_MPE = 'DESEMPATE_MPE',
  /** Valor negociado (Lei 14.133 art. 61) — E3. */
  NEGOCIACAO = 'NEGOCIACAO',
  /** Janela de lances da dispensa eletrônica (IN 67/2021) — migração da dispensa. */
  JANELA_DISPENSA = 'JANELA_DISPENSA',
  /**
   * Nova proposta da DISPUTA FINAL entre empatados (Lei 14.133 art. 60, I) —
   * gravada pelo julgamento (julgamento/desempate.service.ts) no encerramento
   * da disputa final, com a unidade já encerrada; nunca pelo `registrarLance`.
   */
  DISPUTA_FINAL = 'DISPUTA_FINAL',
}

export type TipoDiferencaMinima = 'VALOR' | 'PERCENTUAL';

export interface DiferencaMinima {
  tipo: TipoDiferencaMinima;
  /** Em R$ (na unidade da base do lance) ou em pontos percentuais. */
  valor: number;
}

const arred = (v: number, casas: number) => {
  const f = 10 ** casas;
  return Math.round((v + Number.EPSILON) * f) / f;
};
export const centavos = (v: number) => arred(v, 2);

/**
 * Valores unitário e total de um lance a partir do valor comparável e da base.
 * Unitário com 4 casas (mesma escala de `itens_licitacao.valor_unitario_*`).
 */
export function valoresDoLance(
  valor: number,
  base: BaseLance,
  quantidade: number,
): { valor_unitario: number; valor_total: number } {
  const qtd = Number(quantidade) > 0 ? Number(quantidade) : 1;
  const v = Number(valor);
  if (base === BaseLance.UNITARIO) {
    return { valor_unitario: arred(v, 4), valor_total: centavos(v * qtd) };
  }
  // TOTAL_ITEM (e, por item, o rateio do lote grava o total do item)
  return { valor_unitario: arred(v / qtd, 4), valor_total: centavos(v) };
}

/** Valor da proposta de um item na unidade da base do lance. */
export function valorPropostaNaBase(
  propostaItem: { valor_unitario?: number | string | null; valor_total?: number | string | null },
  base: BaseLance,
  quantidade: number,
): number {
  if (base === BaseLance.UNITARIO) {
    const u = Number(propostaItem.valor_unitario);
    if (u > 0) return u;
    return Number(propostaItem.valor_total) / (Number(quantidade) || 1);
  }
  const t = Number(propostaItem.valor_total);
  if (t > 0) return t;
  return centavos(Number(propostaItem.valor_unitario) * (Number(quantidade) || 1));
}

/** Valor de referência (estimado) do item na unidade da base do lance. */
export function referenciaNaBase(
  item: { valor_unitario_estimado?: number | string | null; valor_total_estimado?: number | string | null; quantidade?: number | string | null },
  base: BaseLance,
): number {
  const unit = Number(item.valor_unitario_estimado) || 0;
  if (base === BaseLance.UNITARIO) return unit;
  const total = Number(item.valor_total_estimado);
  return total > 0 ? total : centavos(unit * (Number(item.quantidade) || 1));
}

/**
 * Unitário/total de um lance gravado — usa as colunas explícitas; se a linha é
 * anterior à migração (colunas nulas), deriva pela base.
 */
export function valoresGravados(
  lance: { valor: number | string; valor_unitario?: number | string | null; valor_total?: number | string | null },
  base: BaseLance,
  quantidade: number,
): { valor_unitario: number; valor_total: number } {
  if (lance.valor_unitario != null && lance.valor_total != null) {
    return { valor_unitario: Number(lance.valor_unitario), valor_total: Number(lance.valor_total) };
  }
  return valoresDoLance(Number(lance.valor), base, quantidade);
}

// ============================================================================
// VALIDAÇÃO
// ============================================================================

export class LanceRecusado extends Error {
  constructor(
    mensagem: string,
    /** Código estável para testes e telas. */
    readonly codigo: string,
    /** 409 = estado do processo (item fechado, sessão suspensa); 400 = valor. */
    readonly estado = false,
  ) {
    super(mensagem);
  }
}

export interface ContextoValidacaoLance {
  origem: OrigemLance;
  valor: number;
  statusItem: string | null | undefined;
  sessaoSuspensa: boolean;
  /** Proposta do fornecedor no item, na base do lance (null = sem proposta válida). */
  propostaNaBase: number | null;
  /** Último registro ATIVO do próprio fornecedor no item (proposta convertida ou lance). */
  meuUltimo: { valor: number; origem: OrigemLance; criadoEm: Date } | null;
  /** Melhor valor ativo do item (qualquer fornecedor). */
  melhor: { valor: number; fornecedorId: string } | null;
  /** Valores ATIVOS de outros fornecedores no item (para a regra de lances iguais). */
  valoresDeOutros: number[];
  diferencaMinima: DiferencaMinima | null;
  /** Intervalo mínimo entre lances do mesmo fornecedor (segundos; 0 = sem). */
  intervaloProprioSegundos: number;
  agora: Date;
  /**
   * JANELA_DISPENSA: a janela de lances da dispensa está aberta pelo relógio
   * único (`calcularRelogioJanela`)? Ignorado pelas demais origens.
   */
  janelaAberta?: boolean;
  /**
   * Direção do critério (modos-disputa.ts `direcaoDoCriterio`): MENOR (padrão —
   * menor preço/maior desconto) ou MAIOR (maior lance, leilão — E7c).
   */
  direcao?: 'MENOR' | 'MAIOR';
}

const brl = (v: number) => `R$ ${centavos(v).toFixed(2)}`;
const igual = (a: number, b: number) => Math.abs(a - b) < 0.00005;

/** Redução mínima exigida a partir de `referencia` (valor ou % do edital). */
export function reducaoMinima(dif: DiferencaMinima | null, referencia: number): number {
  if (!dif || !(dif.valor > 0)) return 0;
  return dif.tipo === 'PERCENTUAL' ? (referencia * dif.valor) / 100 : dif.valor;
}

function descreverDiferenca(dif: DiferencaMinima): string {
  return dif.tipo === 'PERCENTUAL' ? `${dif.valor}%` : brl(dif.valor);
}

/**
 * Regras do lance (menor preço/maior desconto — valores decrescentes).
 *
 * LANCE (etapa aberta):
 *  1. item EM_DISPUTA e sessão não suspensa (409);
 *  2. proposta válida do fornecedor no item;
 *  3. abaixo da própria proposta e do próprio último lance (IN 73 art. 21 §2º);
 *  4. DIFERENÇA MÍNIMA do edital (IN 73 art. 21 §2º e art. 22 §1º; Lei 14.133
 *     art. 56 §3º): vale para o lance intermediário (em relação ao próprio
 *     último) E para o lance que cobre a melhor oferta (em relação a ela);
 *  5. LANCES IGUAIS: não se aceita valor igual a lance ATIVO de outro
 *     fornecedor no item — prevalece o recebido e registrado primeiro (a trava
 *     pessimista do item define a ordem). Decisão (E2): a IN 73 permite lance
 *     intermediário mas não diz como tratar o empate entre lances; aceitar o
 *     segundo criaria um empate "fabricado" que só se resolveria pelos
 *     critérios do art. 60 da Lei e sorteio (IN 73 art. 28). Recusar é o
 *     tratamento mais seguro e é a regra consagrada no pregão eletrônico
 *     federal (Decreto 10.024/2019 art. 30 §3º: "não serão aceitos dois ou mais
 *     lances iguais e prevalecerá aquele que for recebido e registrado
 *     primeiro"). Vale para o melhor lance e para os intermediários;
 *  6. intervalo mínimo de TEMPO entre lances do mesmo fornecedor: NÃO é
 *     exigência da IN 73 (que só fala de intervalo de VALOR) — parâmetro do
 *     órgão/licitação, padrão 0 (desligado).
 *
 * DESEMPATE_MPE (LC 123 art. 45, I): item já encerrado; valor ESTRITAMENTE
 * inferior ao melhor lance; sem diferença mínima nem intervalo.
 * NEGOCIACAO (Lei 14.133 art. 61): item encerrado; abaixo do próprio melhor.
 * LANCE_FECHADO: etapa fechada do aberto-fechado (validarLanceFechado, E2.4).
 */
export function validarLance(c: ContextoValidacaoLance): void {
  // Dispensa (IN 67): regras e mensagens próprias da janela — antes das gerais
  if (c.origem === OrigemLance.JANELA_DISPENSA) return validarJanelaDispensa(c);
  const valor = Number(c.valor);
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new LanceRecusado('Valor do lance inválido', 'VALOR_INVALIDO');
  }
  if (Math.abs(arred(valor, 4) - valor) > 1e-9) {
    throw new LanceRecusado('Valor do lance com mais de 4 casas decimais', 'VALOR_INVALIDO');
  }

  switch (c.origem) {
    case OrigemLance.LANCE:
      return c.direcao === 'MAIOR' ? validarLanceAbertoMaior(c, valor) : validarLanceAberto(c, valor);
    case OrigemLance.LANCE_FECHADO:
      return validarLanceFechado(c, valor);
    case OrigemLance.DESEMPATE_MPE:
      return validarDesempateMpe(c, valor);
    case OrigemLance.NEGOCIACAO:
      return validarNegociacao(c, valor);
    default:
      throw new LanceRecusado(
        `Lance de origem ${c.origem} ainda não é aceito pelo motor de disputa`,
        'ORIGEM_NAO_SUPORTADA',
        true,
      );
  }
}

function exigirProposta(c: ContextoValidacaoLance): number {
  if (c.propostaNaBase === null || !(c.propostaNaBase > 0)) {
    throw new LanceRecusado(
      'Você não possui proposta classificada para este item. Apenas fornecedores com propostas classificadas podem dar lances.',
      'SEM_PROPOSTA',
    );
  }
  return c.propostaNaBase;
}

function validarLanceAberto(c: ContextoValidacaoLance, valor: number): void {
  if (c.statusItem !== 'EM_DISPUTA') {
    throw new LanceRecusado('Item não está em disputa', 'ITEM_FORA_DE_DISPUTA', true);
  }
  if (c.sessaoSuspensa) {
    throw new LanceRecusado('Sessão está suspensa', 'SESSAO_SUSPENSA', true);
  }
  const proposta = exigirProposta(c);

  if (valor >= proposta) {
    throw new LanceRecusado(`Lance deve ser menor que sua proposta inicial (${brl(proposta)})`, 'ACIMA_DA_PROPOSTA');
  }
  const referenciaPropria = c.meuUltimo ? c.meuUltimo.valor : proposta;
  if (c.meuUltimo && valor >= c.meuUltimo.valor) {
    throw new LanceRecusado(`Lance deve ser menor que seu lance anterior (${brl(c.meuUltimo.valor)})`, 'ACIMA_DO_PROPRIO');
  }

  // Lances iguais (regra 5) — antes da diferença mínima para a mensagem ser a mais clara
  if (c.melhor && igual(valor, c.melhor.valor)) {
    throw new LanceRecusado(
      `Lance não pode ser igual ao melhor lance atual (${brl(c.melhor.valor)}). Informe um valor diferente.`,
      'IGUAL_AO_MELHOR',
    );
  }
  if (c.valoresDeOutros.some((v) => igual(v, valor))) {
    throw new LanceRecusado(
      `Lance igual a um lance já registrado por outro licitante (${brl(valor)}): prevalece o registrado primeiro. Informe um valor diferente.`,
      'IGUAL_A_LANCE_REGISTRADO',
    );
  }

  // Diferença mínima (regra 4)
  if (c.diferencaMinima && c.diferencaMinima.valor > 0) {
    const minimaPropria = reducaoMinima(c.diferencaMinima, referenciaPropria);
    if (referenciaPropria - valor + 0.00005 < minimaPropria) {
      throw new LanceRecusado(
        `A diferença mínima entre lances é de ${descreverDiferenca(c.diferencaMinima)} (edital; IN 73 art. 21 §2º). ` +
          `Seu lance deve ser de no máximo ${brl(referenciaPropria - minimaPropria)}.`,
        'DIFERENCA_MINIMA',
      );
    }
    if (c.melhor && valor < c.melhor.valor) {
      const minimaMelhor = reducaoMinima(c.diferencaMinima, c.melhor.valor);
      if (c.melhor.valor - valor + 0.00005 < minimaMelhor) {
        throw new LanceRecusado(
          `A diferença mínima entre lances é de ${descreverDiferenca(c.diferencaMinima)} (edital; IN 73 art. 22 §1º): ` +
            `para cobrir o melhor lance (${brl(c.melhor.valor)}) o valor deve ser de no máximo ${brl(c.melhor.valor - minimaMelhor)}.`,
          'DIFERENCA_MINIMA_MELHOR',
        );
      }
    }
  }

  // Intervalo de tempo entre lances do próprio fornecedor (regra 6, parâmetro)
  if (c.intervaloProprioSegundos > 0 && c.meuUltimo && c.meuUltimo.origem === OrigemLance.LANCE) {
    const desde = c.agora.getTime() - new Date(c.meuUltimo.criadoEm).getTime();
    const minimo = c.intervaloProprioSegundos * 1000;
    if (desde < minimo) {
      throw new LanceRecusado(
        `Intervalo mínimo entre seus lances é de ${c.intervaloProprioSegundos}s. Aguarde ${Math.ceil((minimo - desde) / 1000)}s para enviar outro lance.`,
        'INTERVALO_PROPRIO',
      );
    }
  }
}

function validarDesempateMpe(c: ContextoValidacaoLance, valor: number): void {
  if (c.statusItem !== 'ENCERRADO' && c.statusItem !== 'NEGOCIACAO') {
    throw new LanceRecusado('O desempate ME/EPP só ocorre após o encerramento da disputa do item', 'ITEM_NAO_ENCERRADO', true);
  }
  exigirProposta(c);
  if (c.melhor && valor >= c.melhor.valor) {
    throw new LanceRecusado(
      `O lance da ME/EPP deve ser MENOR que o melhor lance atual (${brl(c.melhor.valor)}) — LC 123, art. 45, I`,
      'DESEMPATE_NAO_COBRE',
    );
  }
}

/**
 * JANELA DE LANCES DA DISPENSA ELETRÔNICA (Lei 14.133 art. 75 §3º; IN SEGES
 * 67/2021): o lance é SEMPRE no valor UNITÁRIO (base UNITARIO) e o fornecedor
 * só REDUZ O PRÓPRIO valor — pode continuar acima do melhor do item (não há
 * "cobrir a melhor oferta" nem regra de lances iguais entre licitantes).
 *  1. janela aberta pelo relógio único (409 — estado do processo);
 *  2. valor positivo, até 4 casas;
 *  3. proposta válida do fornecedor no item (enviada, não desclassificada);
 *  4. menor que o próprio valor atual (proposta ou último lance);
 *  5. diferença mínima do aviso, se houver (em relação ao próprio valor).
 */
export function validarJanelaDispensa(c: ContextoValidacaoLance): void {
  if (!c.janelaAberta) {
    throw new LanceRecusado('A fase de lances não está aberta', 'JANELA_FECHADA', true);
  }
  const valor = Number(c.valor);
  if (!Number.isFinite(valor) || valor <= 0 || Math.abs(arred(valor, 4) - valor) > 1e-9) {
    throw new LanceRecusado('Valor de lance inválido', 'VALOR_INVALIDO');
  }
  if (c.propostaNaBase === null || !(c.propostaNaBase > 0)) {
    throw new LanceRecusado('Apenas fornecedores com proposta válida para o item podem dar lances', 'SEM_PROPOSTA');
  }
  const atual = c.meuUltimo ? Math.min(c.meuUltimo.valor, c.propostaNaBase) : c.propostaNaBase;
  if (valor >= atual - 0.00005) {
    throw new LanceRecusado(
      `O lance deve ser menor que o seu valor atual (${atual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`,
      'ACIMA_DO_PROPRIO',
    );
  }
  if (c.diferencaMinima && c.diferencaMinima.valor > 0) {
    const minima = reducaoMinima(c.diferencaMinima, atual);
    if (atual - valor + 0.00005 < minima) {
      throw new LanceRecusado(
        `A diferença mínima entre lances é de ${descreverDiferenca(c.diferencaMinima)} (aviso de contratação direta). ` +
          `Seu lance deve ser de no máximo ${brl(atual - minima)}.`,
        'DIFERENCA_MINIMA',
      );
    }
  }
}

/** Valor atual do fornecedor no item da dispensa: o menor entre a proposta e os próprios lances. */
export function valorAtualNaJanela(proposta: number, lances: number[]): number {
  return Math.min(proposta, ...lances.filter((v) => v > 0));
}

function validarNegociacao(c: ContextoValidacaoLance, valor: number): void {
  if (c.statusItem !== 'ENCERRADO' && c.statusItem !== 'NEGOCIACAO') {
    throw new LanceRecusado('A negociação só ocorre após o encerramento da disputa do item', 'ITEM_NAO_ENCERRADO', true);
  }
  const proposta = exigirProposta(c);
  const referencia = c.meuUltimo ? c.meuUltimo.valor : proposta;
  if (valor >= referencia) {
    throw new LanceRecusado(`O valor negociado deve ser menor que o seu melhor valor (${brl(referencia)})`, 'NEGOCIACAO_NAO_REDUZ');
  }
}

// ============================================================================
// MODOS DE DISPUTA (plano E2.4) — lance final fechado e direção MAIOR
// ============================================================================

/**
 * LANCE_FECHADO (IN 73 art. 24 §§2º–4º — aberto-fechado): um único lance
 * final, sigiloso, dos licitantes classificados para a etapa fechada. A
 * elegibilidade, o "um por licitante" e o prazo são checados pela estratégia
 * do modo (`ModoDisputaService.regraDoLance`); aqui ficam as regras de valor:
 *  1. item na etapa fechada (o motor passa EM_DISPUTA) e sessão não suspensa;
 *  2. proposta válida do licitante no item;
 *  3. MELHOR que o próprio último valor (art. 24 §3º: o licitante "poderá
 *     optar por manter o seu último lance da etapa aberta, ou por ofertar
 *     melhor lance" — manter = não enviar);
 *  4. diferença mínima do edital só em relação ao PRÓPRIO último valor (os
 *     demais valores são sigilosos nesta etapa — não há "melhor oferta" a
 *     cobrir);
 *  5. lances iguais entre licitantes NÃO são recusados (o licitante não os
 *     conhece); o empate é tratado no ranking final (art. 60 da Lei / art. 28
 *     da IN — E3).
 */
function validarLanceFechado(c: ContextoValidacaoLance, valor: number): void {
  if (c.statusItem !== 'EM_DISPUTA') {
    throw new LanceRecusado('O prazo do lance final fechado não está aberto para este item', 'FECHADO_FORA_DO_PRAZO', true);
  }
  if (c.sessaoSuspensa) {
    throw new LanceRecusado('Sessão está suspensa', 'SESSAO_SUSPENSA', true);
  }
  const proposta = exigirProposta(c);
  const maior = c.direcao === 'MAIOR';
  const referencia = c.meuUltimo ? c.meuUltimo.valor : proposta;
  if (maior ? valor <= referencia : valor >= referencia) {
    throw new LanceRecusado(
      `O lance final fechado deve ser ${maior ? 'MAIOR' : 'MENOR'} que o seu último valor (${brl(referencia)}). ` +
        'Para manter o último lance da etapa aberta, não envie lance (IN 73 art. 24 §3º).',
      'FECHADO_NAO_MELHORA',
    );
  }
  if (c.diferencaMinima && c.diferencaMinima.valor > 0) {
    const minima = reducaoMinima(c.diferencaMinima, referencia);
    if (Math.abs(referencia - valor) + 0.00005 < minima) {
      throw new LanceRecusado(
        `A diferença mínima entre lances é de ${descreverDiferenca(c.diferencaMinima)} (edital; IN 73 art. 22 §1º) em relação ao seu último valor.`,
        'DIFERENCA_MINIMA',
      );
    }
  }
}

/**
 * LANCE na direção MAIOR (critério maior lance — leilão, E7c): espelho de
 * `validarLanceAberto` — o lance precisa SUBIR em relação à própria proposta e
 * ao próprio último lance; diferença mínima para cima; lances iguais recusados.
 */
function validarLanceAbertoMaior(c: ContextoValidacaoLance, valor: number): void {
  if (c.statusItem !== 'EM_DISPUTA') {
    throw new LanceRecusado('Item não está em disputa', 'ITEM_FORA_DE_DISPUTA', true);
  }
  if (c.sessaoSuspensa) {
    throw new LanceRecusado('Sessão está suspensa', 'SESSAO_SUSPENSA', true);
  }
  const proposta = exigirProposta(c);
  if (valor <= proposta) {
    throw new LanceRecusado(`Lance deve ser maior que sua proposta inicial (${brl(proposta)})`, 'ABAIXO_DA_PROPOSTA');
  }
  const referenciaPropria = c.meuUltimo ? c.meuUltimo.valor : proposta;
  if (c.meuUltimo && valor <= c.meuUltimo.valor) {
    throw new LanceRecusado(`Lance deve ser maior que seu lance anterior (${brl(c.meuUltimo.valor)})`, 'ABAIXO_DO_PROPRIO');
  }
  if (c.melhor && igual(valor, c.melhor.valor)) {
    throw new LanceRecusado(`Lance não pode ser igual ao melhor lance atual (${brl(c.melhor.valor)}).`, 'IGUAL_AO_MELHOR');
  }
  if (c.valoresDeOutros.some((v) => igual(v, valor))) {
    throw new LanceRecusado(
      `Lance igual a um lance já registrado por outro licitante (${brl(valor)}): prevalece o registrado primeiro.`,
      'IGUAL_A_LANCE_REGISTRADO',
    );
  }
  if (c.diferencaMinima && c.diferencaMinima.valor > 0) {
    const minimaPropria = reducaoMinima(c.diferencaMinima, referenciaPropria);
    if (valor - referenciaPropria + 0.00005 < minimaPropria) {
      throw new LanceRecusado(
        `A diferença mínima entre lances é de ${descreverDiferenca(c.diferencaMinima)}. Seu lance deve ser de no mínimo ${brl(referenciaPropria + minimaPropria)}.`,
        'DIFERENCA_MINIMA',
      );
    }
    if (c.melhor && valor > c.melhor.valor) {
      const minimaMelhor = reducaoMinima(c.diferencaMinima, c.melhor.valor);
      if (valor - c.melhor.valor + 0.00005 < minimaMelhor) {
        throw new LanceRecusado(
          `A diferença mínima entre lances é de ${descreverDiferenca(c.diferencaMinima)}: para cobrir o melhor lance (${brl(c.melhor.valor)}) o valor deve ser de no mínimo ${brl(c.melhor.valor + minimaMelhor)}.`,
          'DIFERENCA_MINIMA_MELHOR',
        );
      }
    }
  }
  if (c.intervaloProprioSegundos > 0 && c.meuUltimo && c.meuUltimo.origem === OrigemLance.LANCE) {
    const desde = c.agora.getTime() - new Date(c.meuUltimo.criadoEm).getTime();
    const minimo = c.intervaloProprioSegundos * 1000;
    if (desde < minimo) {
      throw new LanceRecusado(
        `Intervalo mínimo entre seus lances é de ${c.intervaloProprioSegundos}s. Aguarde ${Math.ceil((minimo - desde) / 1000)}s para enviar outro lance.`,
        'INTERVALO_PROPRIO',
      );
    }
  }
}
