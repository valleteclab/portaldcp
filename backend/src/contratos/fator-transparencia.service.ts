import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { SystemConfigService } from '../system-config/system-config.service';

export type FaseDespesa = 'EMPENHO' | 'LIQUIDACAO' | 'PAGAMENTO' | 'OUTRO';

/**
 * Como o registro do portal foi vinculado ao contrato/ata alvo:
 * - CONTRATO: o dialog informou o "Nº Contrato" e ele casa com o alvo
 * - HISTORICO: o dialog não informou contrato, mas o texto livre (bem/serviço,
 *   histórico de liquidação/pagamento) cita o número do contrato/ata
 * - PROCESSO: o dialog não informou contrato, mas o "Processo Licitatório"
 *   casa com o campo `processo_licitatorio_portal` do contrato
 * - NAO_CONFIRMADO: nenhuma das anteriores — o registro é exibido, mas não
 *   entra nos totais (o gestor decide)
 */
export type ConfirmacaoEmpenho =
  | 'CONTRATO'
  | 'HISTORICO'
  | 'PROCESSO'
  | 'NAO_CONFIRMADO';

export interface EmpenhoFator {
  numero_liquidacao: string;
  /** Nº Empenho extraído do dialog (só preenchido quando fase_tipo === 'EMPENHO') */
  numero_empenho: string;
  data: string;
  fase: string;
  fase_tipo: FaseDespesa;
  credor: string;
  cnpj: string;
  valor: number;
  valor_formatado: string;
  bem_servico: string;
  numero_contrato: string;
  numero_processo: string;
  modalidade: string;
  elemento_despesa: string;
  /** Processo licitatório informado no dialog (ex: "006-2025-PE"). Pode vir vazio. */
  processo_licitatorio: string;
  /** Como este registro foi vinculado ao contrato alvo */
  confirmacao: ConfirmacaoEmpenho;
  /** Nº da OS citada no histórico do portal, quando houver (ex: "OS-0224/2026") */
  os_citada?: string;
  /**
   * Texto livre do dialog (bem/serviço + históricos) usado na confirmação por
   * HISTORICO. Removido antes de devolver ao cliente para não inflar o payload.
   */
  texto_confirmacao?: string;
}

/** Empenho composto: agrupa o empenho original com suas liquidações, pagamentos e estornos */
export interface EmpenhoComposto {
  /** Nº do empenho (chave de agrupamento) */
  numero_empenho: string;
  /** Ano do exercício do empenho */
  ano_exercicio: number;
  /** Registro do empenho (positivo) */
  empenho: EmpenhoFator | null;
  /** Acréscimos/reforços (s/n) absorvidos por este empenho */
  acrescimos: EmpenhoFator[];
  /** Anulações vinculadas a este empenho */
  anulacoes: EmpenhoFator[];
  /** Liquidações (incluindo estornos de liquidação com valor negativo) */
  liquidacoes: EmpenhoFator[];
  /** Pagamentos (incluindo estornos de pagamento com valor negativo) */
  pagamentos: EmpenhoFator[];
  /** Totais calculados */
  total_empenhado_bruto: number;
  total_acrescimos: number;
  total_anulado: number;
  total_empenhado_liquido: number;
  total_liquidado: number;
  total_pago: number;
  saldo_a_liquidar: number;
  saldo_a_pagar: number;
}

export interface GrupoExercicio {
  /** Ano do exercício (extraído da data dos registros) */
  ano: number;
  /** Empenhos de valor positivo do exercício (original + apostilamento + reforços) */
  empenhos_positivos: EmpenhoFator[];
  /** Empenhos de valor negativo — anulações de saldo não executado */
  anulacoes: EmpenhoFator[];
  /** Liquidações do exercício */
  liquidacoes: EmpenhoFator[];
  /** Pagamentos do exercício */
  pagamentos: EmpenhoFator[];
  /** Empenhos compostos (agrupados por numero_empenho com suas liquidações/pagamentos) */
  empenhos_compostos: EmpenhoComposto[];
  /** Soma dos empenhos positivos (bruto empenhado) */
  total_empenhado_bruto: number;
  /** Soma |anulações| (valor absoluto das anulações) */
  total_anulado: number;
  /** Empenhado líquido: bruto − anulado */
  total_empenhado_liquido: number;
  /** Soma das liquidações */
  total_liquidado: number;
  /** Soma dos pagamentos */
  total_pago: number;
  /** Líquido empenhado − liquidado */
  saldo_a_liquidar: number;
  /** Liquidado − pago */
  saldo_a_pagar: number;
  /**
   * Status do exercício:
   * - ENCERRADO: ano passado, saldos zerados (execução completa ou anulada)
   * - EXECUCAO: ano atual em andamento
   * - ABERTO: ano passado com saldo residual (anomalia — sinalizar ao gestor)
   */
  status: 'ENCERRADO' | 'EXECUCAO' | 'ABERTO';
}

export interface ResumoAnoEmpenhos {
  ano: number;
  total_empenhado: number;
  total_liquidado: number;
  total_pago: number;
  quantidade_empenhos: number;
  quantidade_liquidacoes: number;
  quantidade_pagamentos: number;
}

export interface ResumoEmpenhos {
  empenhos: EmpenhoFator[];
  resumo: {
    valor_global_contrato: number;
    ano_contrato: number;
    ano_atual: number;
    total_empenhado: number;
    total_liquidado: number;
    total_pago: number;
    /** Empenhado − Pago (saldo financeiro a pagar dentro do empenho) */
    saldo_empenhado: number;
    /** Valor Global − Empenhado (saldo orçamentário a empenhar em exercícios futuros) */
    saldo_a_empenhar: number;
    /** Percentual do valor global já empenhado (0..100) */
    percentual_execucao_orcamentaria: number;
    /** Percentual do empenhado já pago (0..100) */
    percentual_execucao_financeira: number;
    /** True quando ano_contrato < ano_atual e ainda há saldo_a_empenhar > 0 */
    requer_novo_empenho_anual: boolean;
    quantidade_empenhos: number;
    quantidade_liquidacoes: number;
    quantidade_pagamentos: number;
    /** Soma dos empenhos (fase EMPENHO) que o portal nao permitiu confirmar */
    total_nao_confirmado: number;
    /** Quantidade de empenhos (fase EMPENHO) nao confirmados */
    quantidade_nao_confirmada: number;
  };
  por_ano: ResumoAnoEmpenhos[];
  /** Exercícios (anos) agrupados com seus empenhos, anulações, liquidações e pagamentos */
  grupos_exercicio: GrupoExercicio[];
}

@Injectable()
export class FatorTransparenciaService {
  private readonly logger = new Logger(FatorTransparenciaService.name);
  private readonly baseUrl =
    'https://transparencia.fatorsistemas.com.br/dados/carregaDespesa.php';

  constructor(private readonly systemConfig: SystemConfigService) {}

  async buscarEmpenhos(params: {
    nContrato?: string;
    cpfcnpj?: string;
    /** Ano do contrato. Busca este ano + ano atual quando forem diferentes. */
    ano?: number;
    fornecedor?: string;
    /** No do processo licitatorio como aparece no portal (ex: "006-2025-PE") */
    processoLicitatorioPortal?: string;
  }): Promise<EmpenhoFator[]> {
    const orgId = await this.systemConfig.getValue('FATOR_TRANSPARENCIA_ID');
    if (!orgId) {
      this.logger.warn(
        'FATOR_TRANSPARENCIA_ID não configurado em system_config',
      );
      return [];
    }

    const anoContrato = params.ano ?? new Date().getFullYear();
    const anoAtual = new Date().getFullYear();

    // Normaliza o número de contrato para NNN/AAAA (remove sufixos "3ªAD", "TA", etc.)
    const nContratoNormalizado = this.normalizarNumeroContrato(params.nContrato);

    // Busca todos os anos do intervalo [menor ano … ano atual].
    // O campo `ano` do contrato nem sempre bate com o ano do número (atas
    // renovadas ficam com ano=2026 mas são "001/2025"), então o piso é o menor
    // entre os dois — senão o ano da assinatura nunca seria consultado.
    const anoDoNumero = this.anoDoNumeroContrato(nContratoNormalizado);
    const anoBase = anoDoNumero ? Math.min(anoContrato, anoDoNumero) : anoContrato;
    const anoInicio = Math.min(anoBase, anoAtual);
    const anoFim = Math.max(anoBase, anoAtual);
    const anos: number[] = [];
    for (let a = anoInicio; a <= anoFim; a++) anos.push(a);

    // Estratégia: NÃO enviar nContrato ao portal (match exato falha com variações tipo
    // "028/2023 3ºAD", "028-2023-ADITIVO" etc). Busca por CNPJ apenas e filtra localmente
    // comparando o numero_contrato extraído de cada dialog.
    const paramsSemContrato = { ...params, nContrato: '' };

    const resultadosPorAno = await Promise.all(
      anos.map((ano) => this.buscarPorAno(orgId, paramsSemContrato, ano)),
    );

    // Mescla, deduplica e CLASSIFICA (não descarta) pelo número de contrato
    const todos = resultadosPorAno.flat();
    const chaveContratoAlvo = this.chaveContrato(nContratoNormalizado);
    const chaveTextoAlvo = this.chaveNumeroAno(nContratoNormalizado);
    const chaveProcessoAlvo = (params.processoLicitatorioPortal ?? '').replace(
      /\D/g,
      '',
    );

    const vistos = new Set<string>();
    const unicos = todos.filter((e, idx) => {
      // Chave composta: numero_liquidacao se repete entre anos (reseta a cada
      // exercício), então usamos empenho + data + fase + valor + nº para diferenciar
      const chave = `${e.numero_empenho}|${e.data}|${e.fase_tipo}|${e.numero_liquidacao || idx}|${e.valor}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });

    for (const e of unicos) {
      e.confirmacao = this.classificarConfirmacao(e, {
        chaveContrato: chaveContratoAlvo,
        chaveTexto: chaveTextoAlvo,
        chaveProcesso: chaveProcessoAlvo,
      });
      // Texto auxiliar serve só para a classificação — não vai para o cliente
      delete e.texto_confirmacao;
    }

    return unicos;
  }

  /**
   * Decide como o registro do portal se liga ao contrato alvo.
   * Ordem: contrato do dialog → texto livre (histórico) → processo licitatório.
   */
  private classificarConfirmacao(
    e: EmpenhoFator,
    alvo: { chaveContrato: string; chaveTexto: string; chaveProcesso: string },
  ): ConfirmacaoEmpenho {
    // Sem alvo (busca aberta por CNPJ): não há o que confirmar
    if (!alvo.chaveContrato) return 'CONTRATO';

    const chaveEmpenho = this.chaveContrato(e.numero_contrato);
    if (chaveEmpenho && chaveEmpenho.startsWith(alvo.chaveContrato)) {
      return 'CONTRATO';
    }

    // Dialog informou OUTRO contrato → não é deste contrato
    if (chaveEmpenho) return 'NAO_CONFIRMADO';

    // Dialog sem "Nº Contrato" (caso das atas de registro de preços):
    // procura o número do contrato/ata no texto livre do portal
    if (alvo.chaveTexto) {
      const chavesTexto = this.extrairChavesNumeroAno(e.texto_confirmacao ?? '');
      if (chavesTexto.includes(alvo.chaveTexto)) return 'HISTORICO';
    }

    // Último recurso: processo licitatório informado no cadastro do contrato
    if (alvo.chaveProcesso) {
      const chaveProcEmpenho = (e.processo_licitatorio || '').replace(/\D/g, '');
      if (chaveProcEmpenho && chaveProcEmpenho === alvo.chaveProcesso) {
        return 'PROCESSO';
      }
    }

    return 'NAO_CONFIRMADO';
  }

  /** Ano embutido no número do contrato normalizado ("001/2025" → 2025) */
  private anoDoNumeroContrato(numero?: string): number | null {
    const m = (numero ?? '').match(/^\d{1,4}[\/-](\d{4})$/);
    if (!m) return null;
    const ano = parseInt(m[1], 10);
    return ano >= 1990 && ano <= 2999 ? ano : null;
  }

  /**
   * Chave NNNAAAA a partir de "NNN/AAAA" ou "NNN-AAAA", com o número
   * preenchido com zeros à esquerda ("1/2025" e "001/2025" → "0012025").
   */
  private chaveNumeroAno(numero?: string): string {
    const m = (numero ?? '').match(/(\d{1,4})\s*[\/-]\s*(\d{4})/);
    if (!m) return '';
    const num = String(parseInt(m[1], 10));
    return `${num.padStart(3, '0')}${m[2]}`;
  }

  /** Todas as sequências NNN/AAAA de um texto livre, normalizadas em chaves */
  private extrairChavesNumeroAno(texto: string): string[] {
    const chaves: string[] = [];
    const regex = /(\d{1,4})\s*[\/-]\s*(\d{4})/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(texto)) !== null) {
      const num = String(parseInt(m[1], 10));
      chaves.push(`${num.padStart(3, '0')}${m[2]}`);
    }
    return chaves;
  }

  /**
   * Nº da ordem de serviço citada no histórico do portal.
   * Aceita "OS-0224/2026", "OS 0224/2026" e "ORDEM DE SERVIÇO Nº 003".
   */
  private extrairOsCitada(texto: string): string {
    const comBarra = texto.match(/OS[-\s]?(\d{3,4}\/\d{4})/i);
    if (comBarra) return `OS-${comBarra[1]}`;
    const porExtenso = texto.match(
      /ORDEM\s+DE\s+SERVI[ÇC]O\s*(?:N[º°o.]*\s*)?(\d{1,4}(?:\/\d{4})?)/i,
    );
    if (porExtenso) return `OS-${porExtenso[1]}`;
    return '';
  }

  /**
   * Chave comparável de número de contrato: apenas dígitos.
   * "028/2023" → "0282023", "028-2023 3ºAD" → "02820233"
   * Retorna apenas os primeiros 7 dígitos (NNNAAAA) para comparação estável.
   */
  private chaveContrato(numero?: string): string {
    if (!numero) return '';
    const digitos = numero.replace(/\D/g, '');
    if (digitos.length < 7) return digitos;
    // Pega os primeiros NNNAAAA (número + 4 dígitos do ano)
    // Assume que os primeiros 3-4 dígitos são o número e os 4 seguintes o ano
    return digitos.slice(0, 7);
  }

  private async buscarPorAno(
    orgId: string,
    params: { nContrato?: string; cpfcnpj?: string; fornecedor?: string },
    ano: number,
  ): Promise<EmpenhoFator[]> {
    const dataInicio = `01/01/${ano}`;
    const dataFim = `31/12/${ano}`;

    try {
      const response = await axios.get<string>(this.baseUrl, {
        params: {
          id: orgId,
          unidade_gestora: 1,
          tipo: -1,
          fornecedor: params.fornecedor ?? '',
          // Portal espera CNPJ sem formatação (apenas números)
          cpfcnpj: (params.cpfcnpj ?? '').replace(/\D/g, ''),
          data_publicacao: dataInicio,
          data_publicacao_fim: dataFim,
          Numero: '',
          NProcesso: '',
          funcao: -1,
          subfuncao: -1,
          Despesa: '',
          Historico: '',
          fonte: -1,
          acao: -1,
          Valor: '',
          modalidade: -1,
          Categoria_Economica: -1,
          Grupo_Despesa: -1,
          Modalidade_Aplicacao: -1,
          Elemento: -1,
          Subelemento: -1,
          // O portal usa hífen (036-2025), o sistema armazena barra (036/2025)
          nContrato: (params.nContrato ?? '').replace(/\//g, '-'),
          ano,
        },
        timeout: 20000,
        responseType: 'text',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PortalDCP/1.0)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });

      return this.parsearHtml(response.data);
    } catch (err) {
      this.logger.error(
        `Erro ao consultar Portal Fator (ano ${ano}): ${err.message}`,
      );
      return [];
    }
  }

  private parsearHtml(html: string): EmpenhoFator[] {
    // Novo formato do portal (desde ~jun/2026): uma linha agregada por empenho
    const novoFormato = this.parsearHtmlNovoFormato(html);
    if (novoFormato.length > 0) return novoFormato;

    // Fallback: formato antigo (uma linha por fase da despesa)
    return this.parsearHtmlFormatoAntigo(html);
  }

  /**
   * Novo formato do portal Fator: cada <tr data-dialog-id> é um EMPENHO com
   * valores agregados (Vl. Empenhado / Vl. Liquidado / Vl. Pago) e o dialog
   * traz as liquidações e pagamentos detalhados por subempenho.
   *
   * Sintetiza registros no mesmo contrato de dados do formato antigo:
   * um EmpenhoFator de fase EMPENHO por linha + um de fase LIQUIDACAO/PAGAMENTO
   * por item das sub-tabelas do dialog.
   */
  private parsearHtmlNovoFormato(html: string): EmpenhoFator[] {
    const resultados: EmpenhoFator[] = [];

    // Linha com 8 <td>: data, nº empenho, tipo, credor, empenhado, liquidado, pago, dialog_N
    const rowPattern =
      /<tr data-dialog-id='\d+'[^>]*>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(dialog_\d+)<\/td>\s*<\/tr>/gs;

    const dialogsBrutos = this.extrairDialogsBrutos(html);

    let match: RegExpExecArray | null;
    while ((match = rowPattern.exec(html)) !== null) {
      const [, data, numeroEmpenhoTd, tipoEmpenho, credor, valorEmpenhadoBr, , , dialogId] = match;
      const conteudoDialog = dialogsBrutos.get(dialogId) ?? '';
      const detalhe = this.extrairCamposDialogNovo(conteudoDialog);

      const numeroEmpenho = detalhe.numero_empenho || numeroEmpenhoTd.trim();
      const credorLimpo = this.limparHtml(credor.trim());

      // Texto livre do dialog: bem/serviço + históricos de liquidação/pagamento.
      // É nele que as atas de registro de preços citam o instrumento e a OS,
      // já que o campo "Nº Contrato" vem vazio nesses casos.
      const historicos = this.extrairHistoricosDialog(conteudoDialog);
      const textoLivre = [detalhe.bem_servico ?? '', ...historicos]
        .filter(Boolean)
        .join(' | ');

      const base = {
        numero_empenho: numeroEmpenho,
        credor: credorLimpo,
        cnpj: detalhe.cnpj ?? '',
        bem_servico: detalhe.bem_servico ?? '',
        numero_contrato: detalhe.numero_contrato ?? '',
        numero_processo: detalhe.numero_processo ?? '',
        modalidade: detalhe.modalidade ?? '',
        elemento_despesa: detalhe.elemento_despesa ?? '',
        processo_licitatorio: detalhe.processo_licitatorio ?? '',
        confirmacao: 'NAO_CONFIRMADO' as ConfirmacaoEmpenho,
        texto_confirmacao: textoLivre,
      };
      const osDoDialog = this.extrairOsCitada(textoLivre);

      resultados.push({
        ...base,
        numero_liquidacao: '',
        data: data.trim(),
        fase: `EMPENHO - ${tipoEmpenho.trim()}`.trim(),
        fase_tipo: 'EMPENHO',
        valor: this.parseValorBrasileiro(valorEmpenhadoBr),
        valor_formatado: valorEmpenhadoBr.trim(),
        os_citada: osDoDialog || undefined,
      });

      for (const liq of this.extrairMovimentosSubempenho(conteudoDialog, 'liquidacao')) {
        resultados.push({
          ...base,
          numero_liquidacao: liq.subempenho,
          data: liq.data,
          fase: 'LIQUIDAÇÃO',
          fase_tipo: 'LIQUIDACAO',
          valor: liq.valor,
          valor_formatado: liq.valor_formatado,
          os_citada: this.extrairOsCitada(liq.historico) || osDoDialog || undefined,
        });
      }

      for (const pag of this.extrairMovimentosSubempenho(conteudoDialog, 'pagamento')) {
        resultados.push({
          ...base,
          numero_liquidacao: pag.subempenho,
          data: pag.data,
          fase: 'PAGAMENTO',
          fase_tipo: 'PAGAMENTO',
          valor: pag.valor,
          valor_formatado: pag.valor_formatado,
          os_citada: this.extrairOsCitada(pag.historico) || osDoDialog || undefined,
        });
      }
    }

    return resultados;
  }

  /** Extrai as linhas das sub-tabelas de liquidações/pagamentos do dialog (novo formato) */
  private extrairMovimentosSubempenho(
    conteudoDialog: string,
    tipo: 'liquidacao' | 'pagamento',
  ): Array<{ data: string; subempenho: string; historico: string; valor: number; valor_formatado: string }> {
    const prefixo = tipo === 'liquidacao' ? 'liq' : 'pag';
    const pattern = new RegExp(
      `class='linha-${tipo}'[\\s\\S]*?class='${prefixo}-data'[^>]*>\\s*([\\d/]+)\\s*<[\\s\\S]*?class='${prefixo}-sub'[^>]*>\\s*([^<]*?)\\s*<[\\s\\S]*?class='${prefixo}-historico'[^>]*>([\\s\\S]*?)<\\/div>[\\s\\S]*?class='${prefixo}-valor'[^>]*>\\s*R\\$\\s*([-\\d.,]+)`,
      'g',
    );

    const movimentos: Array<{ data: string; subempenho: string; historico: string; valor: number; valor_formatado: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(conteudoDialog)) !== null) {
      movimentos.push({
        data: m[1].trim(),
        subempenho: m[2].trim(),
        historico: this.limparHtml(m[3]),
        valor: this.parseValorBrasileiro(m[4]),
        valor_formatado: `R$ ${m[4].trim()}`,
      });
    }
    return movimentos;
  }

  /** Históricos (texto livre) das linhas de liquidação e pagamento do dialog */
  private extrairHistoricosDialog(conteudoDialog: string): string[] {
    const textos: string[] = [];
    const pattern = /class='(?:liq|pag)-historico'[^>]*>([\s\S]*?)<\/div>/g;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(conteudoDialog)) !== null) {
      const texto = this.limparHtml(m[1]);
      if (texto) textos.push(texto);
    }
    return textos;
  }

  private parseValorBrasileiro(valorBr: string): number {
    const limpo = valorBr.trim().replace(/\./g, '').replace(',', '.');
    return parseFloat(limpo) || 0;
  }

  /** Campos do dialog no novo formato (labels sem &nbsp; antes do fechamento do strong) */
  private extrairCamposDialogNovo(
    conteudo: string,
  ): Partial<EmpenhoFator> & Record<string, string> {
    return {
      numero_empenho: this.extrairCampo(conteudo, /Nº Empenho:<\/strong>\s*(\d+)/),
      numero_processo: this.extrairCampo(conteudo, /Nº do Processo:<\/strong>\s*(\d+)/),
      cnpj: this.extrairCampo(
        conteudo,
        /<strong>CNPJ:<\/strong>\s*([\d.\/\-]+)/,
      ),
      bem_servico: this.limparHtml(
        this.extrairCampo(
          conteudo,
          /<strong>Bem \/Serviço prestado:<\/strong>\s*([\s\S]*?)<\/p>/,
        ),
      ),
      numero_contrato: this.limparHtml(
        this.extrairCampo(
          conteudo,
          /<strong>Nº Contrato:<\/strong>\s*([^<]+?)(?:<|&nbsp;|$)/,
        ),
      ),
      modalidade: this.limparHtml(
        this.extrairCampo(conteudo, /<strong>Modalidade:<\/strong>\s*([^<&]*)/),
      ),
      elemento_despesa: this.limparHtml(
        this.extrairCampo(
          conteudo,
          /<strong>Elemento de Despesa:<\/strong>\s*(.*?)<\/p>/,
        ),
      ),
      processo_licitatorio: this.limparHtml(
        this.extrairCampo(
          conteudo,
          /<strong>Processo Licitatório:<\/strong>\s*([^<]*)/,
        ),
      ),
    };
  }

  private parsearHtmlFormatoAntigo(html: string): EmpenhoFator[] {
    const resultados: EmpenhoFator[] = [];

    // Extrai as linhas da tabela (cada linha possui 6 <td>)
    const rowPattern =
      /<tr>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(dialog_\d+)<\/td>\s*<\/tr>/gs;

    // Extrai os detalhes de cada dialog div
    const dialogMap = this.extrairDialogs(html);

    let match: RegExpExecArray | null;
    while ((match = rowPattern.exec(html)) !== null) {
      const [, data, nprocesso, fase, credor, valorBr, dialogId] = match;
      const detalhe = dialogMap.get(dialogId) ?? {};

      const valorLimpo = valorBr
        .trim()
        .replace(/\./g, '')
        .replace(',', '.');
      const valor = parseFloat(valorLimpo) || 0;

      const faseTrim = fase.trim();
      const faseTipo = this.classificarFase(faseTrim);

      resultados.push({
        numero_liquidacao: detalhe.numero_liquidacao ?? '',
        numero_empenho: detalhe.numero_empenho ?? '',
        data: data.trim(),
        fase: faseTrim,
        fase_tipo: faseTipo,
        credor: this.limparHtml(credor.trim()),
        cnpj: detalhe.cnpj ?? '',
        valor,
        valor_formatado: valorBr.trim(),
        bem_servico: detalhe.bem_servico ?? '',
        numero_contrato: detalhe.numero_contrato ?? '',
        numero_processo: nprocesso.trim(),
        modalidade: detalhe.modalidade ?? '',
        elemento_despesa: detalhe.elemento_despesa ?? '',
        processo_licitatorio: detalhe.processo_licitatorio ?? '',
        confirmacao: 'NAO_CONFIRMADO',
        texto_confirmacao: detalhe.bem_servico ?? '',
        os_citada: this.extrairOsCitada(detalhe.bem_servico ?? '') || undefined,
      });
    }

    return resultados;
  }

  /** Mapeia cada dialog_N ao seu conteúdo HTML bruto (aceita atributos extras como data-chave) */
  private extrairDialogsBrutos(html: string): Map<string, string> {
    const map = new Map<string, string>();

    const dialogPattern =
      /<div id='(dialog_\d+)'[^>]*title='Detalhe da Despesa'[^>]*>([\s\S]*?)(?=<div id='dialog_\d+'|$)/g;

    let m: RegExpExecArray | null;
    while ((m = dialogPattern.exec(html)) !== null) {
      const [, id, conteudo] = m;
      map.set(id, conteudo);
    }

    return map;
  }

  /** Mapeia cada dialog_N ao seu bloco de detalhes (formato antigo) */
  private extrairDialogs(
    html: string,
  ): Map<string, Partial<EmpenhoFator> & Record<string, string>> {
    const map = new Map<string, Partial<EmpenhoFator> & Record<string, string>>();

    for (const [id, conteudo] of this.extrairDialogsBrutos(html)) {
      map.set(id, this.extrairCamposDialog(conteudo));
    }

    return map;
  }

  private extrairCamposDialog(
    conteudo: string,
  ): Partial<EmpenhoFator> & Record<string, string> {
    return {
      numero_liquidacao: this.extrairCampo(
        conteudo,
        /Nº Liquidação:&nbsp;<\/strong>(\d+)/,
      ),
      numero_empenho: this.extrairCampo(
        conteudo,
        /Nº Empenho:&nbsp;<\/strong>(\d+)/,
      ),
      cnpj: this.extrairCampo(
        conteudo,
        /<strong>CNPJ:<\/strong>\s*([\d.\/\-]+)/,
      ),
      bem_servico: this.limparHtml(
        this.extrairCampo(
          conteudo,
          /<strong>Bem \/Serviço prestado:<\/strong>\s*([\s\S]*?)<\/p>/,
        ),
      ),
      numero_contrato: this.limparHtml(
        this.extrairCampo(
          conteudo,
          /<strong>Nº Contrato:<\/strong>\s*([^<]+?)(?:<|&nbsp;|$)/,
        ),
      ),
      modalidade: this.limparHtml(
        this.extrairCampo(conteudo, /<strong>Modalidade:<\/strong>\s*(.*?)\s*&/),
      ),
      elemento_despesa: this.limparHtml(
        this.extrairCampo(
          conteudo,
          /<strong>Elemento de Despesa:<\/strong>\s*(.*?)<\/p>/,
        ),
      ),
    };
  }

  /**
   * Normaliza número de contrato removendo sufixos de aditivos/adendos.
   * Ex: "028/2023 3ªAD" → "028/2023"
   *     "011-2024 2º TA" → "011-2024"
   *     "045/2024 ADITIVO 01" → "045/2024"
   * Mantém apenas o primeiro padrão NNN/AAAA ou NNN-AAAA encontrado.
   */
  private normalizarNumeroContrato(numero?: string): string {
    if (!numero) return '';
    const match = numero.trim().match(/^(\d+[\/-]\d{4})/);
    return match ? match[1] : numero.trim();
  }

  private classificarFase(fase: string): FaseDespesa {
    const f = fase.toUpperCase().replace(/\s+/g, '');
    // ESTORNO EMPENHO → EMPENHO; EMPENHO DO EXERCÍCIO → EMPENHO
    if (f.includes('EMPENHO')) return 'EMPENHO';
    // ACRÉSCIMO / REFORÇO = adição ao saldo do empenho existente → tratado como EMPENHO positivo
    if (
      f.includes('ACRÉSCIMO') || f.includes('ACRESCIMO') ||
      f.includes('REFORÇO') || f.includes('REFORCO')
    ) return 'EMPENHO';
    // ESTORNO LIQUIDAÇÃO → LIQUIDACAO (valor já vem negativo do portal)
    if (f.includes('LIQUIDACAO') || f.includes('LIQUIDAÇÃO')) return 'LIQUIDACAO';
    // ESTORNO PAGAMENTO → PAGAMENTO (valor já vem negativo do portal)
    if (f.includes('PAGAMENTO')) return 'PAGAMENTO';
    return 'OUTRO';
  }

  calcularResumo(
    empenhos: EmpenhoFator[],
    opts: { valor_global?: number; ano_contrato?: number } = {},
  ): ResumoEmpenhos {
    const anoAtual = new Date().getFullYear();
    const valorGlobal = Number(opts.valor_global ?? 0);
    const anoContrato = opts.ano_contrato ?? anoAtual;

    // Somente registros confirmados entram nos totais e na execução orçamentária.
    // Os não confirmados continuam na lista (`empenhos`) para o gestor avaliar.
    const confirmados = empenhos.filter(e => e.confirmacao !== 'NAO_CONFIRMADO');
    const naoConfirmados = empenhos.filter(e => e.confirmacao === 'NAO_CONFIRMADO');

    const total_empenhado = confirmados.filter(e => e.fase_tipo === 'EMPENHO').reduce((s, e) => s + e.valor, 0);
    const total_liquidado = confirmados.filter(e => e.fase_tipo === 'LIQUIDACAO').reduce((s, e) => s + e.valor, 0);
    const total_pago = confirmados.filter(e => e.fase_tipo === 'PAGAMENTO').reduce((s, e) => s + e.valor, 0);

    const empenhosNaoConfirmados = naoConfirmados.filter(e => e.fase_tipo === 'EMPENHO');
    const total_nao_confirmado = empenhosNaoConfirmados.reduce((s, e) => s + e.valor, 0);
    const quantidade_nao_confirmada = empenhosNaoConfirmados.length;

    const saldo_empenhado = total_empenhado - total_pago;
    const saldo_a_empenhar = Math.max(0, valorGlobal - total_empenhado);
    const percentual_execucao_orcamentaria =
      valorGlobal > 0 ? Math.min(100, (total_empenhado / valorGlobal) * 100) : 0;
    const percentual_execucao_financeira =
      total_empenhado > 0 ? Math.min(100, (total_pago / total_empenhado) * 100) : 0;

    const requer_novo_empenho_anual =
      valorGlobal > 0 && saldo_a_empenhar > 0.01 && anoContrato <= anoAtual;

    // Agrupa por ano calendário (cada registro fica no seu ano)
    const porAnoMap = new Map<number, ResumoAnoEmpenhos>();
    for (const e of confirmados) {
      const dataPartes = (e.data || '').split('/');
      if (dataPartes.length !== 3) continue;
      const mes = parseInt(dataPartes[1], 10) || 0;
      const anoCal = parseInt(dataPartes[2], 10) || 0;
      const ano = anoCal;
      let bucket = porAnoMap.get(ano);
      if (!bucket) {
        bucket = {
          ano,
          total_empenhado: 0,
          total_liquidado: 0,
          total_pago: 0,
          quantidade_empenhos: 0,
          quantidade_liquidacoes: 0,
          quantidade_pagamentos: 0,
        };
        porAnoMap.set(ano, bucket);
      }
      if (e.fase_tipo === 'EMPENHO') {
        bucket.total_empenhado += e.valor;
        bucket.quantidade_empenhos++;
      } else if (e.fase_tipo === 'LIQUIDACAO') {
        bucket.total_liquidado += e.valor;
        bucket.quantidade_liquidacoes++;
      } else if (e.fase_tipo === 'PAGAMENTO') {
        bucket.total_pago += e.valor;
        bucket.quantidade_pagamentos++;
      }
    }
    const por_ano = Array.from(porAnoMap.values()).sort((a, b) => a.ano - b.ano);

    const grupos_exercicio = this.agruparPorExercicio(confirmados, anoAtual);

    return {
      empenhos,
      resumo: {
        valor_global_contrato: valorGlobal,
        ano_contrato: anoContrato,
        ano_atual: anoAtual,
        total_empenhado,
        total_liquidado,
        total_pago,
        saldo_empenhado,
        saldo_a_empenhar,
        percentual_execucao_orcamentaria,
        percentual_execucao_financeira,
        requer_novo_empenho_anual,
        quantidade_empenhos: confirmados.filter(e => e.fase_tipo === 'EMPENHO').length,
        quantidade_liquidacoes: confirmados.filter(e => e.fase_tipo === 'LIQUIDACAO').length,
        quantidade_pagamentos: confirmados.filter(e => e.fase_tipo === 'PAGAMENTO').length,
        total_nao_confirmado,
        quantidade_nao_confirmada,
      },
      por_ano,
      grupos_exercicio,
    };
  }

  /**
   * Agrupa registros por ano calendário.
   *
   * Cada registro (empenho, liquidação, pagamento) fica no ano da sua data.
   *
   * Status:
   * - ENCERRADO: ano anterior com saldos zerados
   * - EXECUCAO:  ano corrente (ou futuro)
   * - ABERTO:    ano anterior com saldo residual
   */
  private agruparPorExercicio(empenhos: EmpenhoFator[], anoAtual: number): GrupoExercicio[] {
    const toTimestamp = (dataBr: string): number => {
      const [d, m, y] = (dataBr || '').split('/');
      if (!d || !m || !y) return 0;
      return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10)).getTime();
    };

    const mapa = new Map<number, GrupoExercicio>();
    const obter = (ano: number): GrupoExercicio => {
      let g = mapa.get(ano);
      if (!g) {
        g = {
          ano,
          empenhos_positivos: [],
          anulacoes: [],
          liquidacoes: [],
          pagamentos: [],
          empenhos_compostos: [],
          total_empenhado_bruto: 0,
          total_anulado: 0,
          total_empenhado_liquido: 0,
          total_liquidado: 0,
          total_pago: 0,
          saldo_a_liquidar: 0,
          saldo_a_pagar: 0,
          status: 'ENCERRADO',
        };
        mapa.set(ano, g);
      }
      return g;
    };

    for (const e of empenhos) {
      const dataPartes = (e.data || '').split('/');
      if (dataPartes.length !== 3) continue;
      const mes = parseInt(dataPartes[1], 10) || 0;
      const anoCal = parseInt(dataPartes[2], 10) || 0;
      if (!anoCal) continue;
      const g = obter(anoCal);
      if (e.fase_tipo === 'EMPENHO') {
        if (e.valor < 0) {
          g.anulacoes.push(e);
          g.total_anulado += Math.abs(e.valor);
        } else {
          g.empenhos_positivos.push(e);
          g.total_empenhado_bruto += e.valor;
        }
      } else if (e.fase_tipo === 'LIQUIDACAO') {
        g.liquidacoes.push(e);
        g.total_liquidado += e.valor;
      } else if (e.fase_tipo === 'PAGAMENTO') {
        g.pagamentos.push(e);
        g.total_pago += e.valor;
      }
    }

    const ordenarPorData = <T extends { data: string }>(arr: T[]): T[] =>
      arr.sort((a, b) => toTimestamp(a.data) - toTimestamp(b.data));

    const grupos = Array.from(mapa.values()).sort((a, b) => a.ano - b.ano);
    for (const g of grupos) {
      ordenarPorData(g.empenhos_positivos);
      ordenarPorData(g.anulacoes);
      ordenarPorData(g.liquidacoes);
      ordenarPorData(g.pagamentos);
      g.total_empenhado_liquido = g.total_empenhado_bruto - g.total_anulado;
      g.saldo_a_liquidar = Math.max(0, g.total_empenhado_liquido - g.total_liquidado);
      g.saldo_a_pagar = Math.max(0, g.total_liquidado - g.total_pago);

      // Agrupa por numero_empenho dentro do exercício
      g.empenhos_compostos = this.agruparPorEmpenho(g);

      if (g.ano === anoAtual) {
        g.status = 'EXECUCAO';
      } else if (g.ano < anoAtual) {
        g.status = (g.saldo_a_liquidar < 0.01 && g.saldo_a_pagar < 0.01) ? 'ENCERRADO' : 'ABERTO';
      } else {
        g.status = 'EXECUCAO';
      }
    }

    return grupos;
  }

  /**
   * Agrupa os registros de um exercício por numero_empenho.
   *
   * Cada empenho (positivo) vira um EmpenhoComposto com suas anulações,
   * liquidações e pagamentos vinculados pelo numero_empenho.
   *
   * Registros sem numero_empenho (campo vazio) são distribuídos
   * proporcionalmente ou atribuídos ao primeiro empenho do exercício.
   */
  private agruparPorEmpenho(grupo: GrupoExercicio): EmpenhoComposto[] {
    const toTimestamp = (dataBr: string): number => {
      const [d, m, y] = (dataBr || '').split('/');
      if (!d || !m || !y) return 0;
      return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10)).getTime();
    };

    const mapa = new Map<string, EmpenhoComposto>();

    // Primeiro: criar entradas para cada empenho positivo (ordenados por data)
    const empenhosOrdenados = [...grupo.empenhos_positivos].sort(
      (a, b) => toTimestamp(a.data) - toTimestamp(b.data),
    );

    // Referência ao último empenho nomeado: acréscimos s/n serão absorvidos por ele
    let ultimoCompostoNomeado: EmpenhoComposto | null = null;

    for (const emp of empenhosOrdenados) {
      // Acréscimo / Reforço sem número de empenho: absorver no empenho nomeado mais recente
      if (!emp.numero_empenho) {
        if (ultimoCompostoNomeado) {
          ultimoCompostoNomeado.acrescimos.push(emp);
          ultimoCompostoNomeado.total_acrescimos += emp.valor;
        }
        // Se não há empenho nomeado ainda, será tratado no bucket genérico abaixo
        continue;
      }

      const chave = emp.numero_empenho;
      if (!mapa.has(chave)) {
        const novoComp: EmpenhoComposto = {
          numero_empenho: emp.numero_empenho,
          ano_exercicio: grupo.ano,
          empenho: emp,
          acrescimos: [],
          anulacoes: [],
          liquidacoes: [],
          pagamentos: [],
          total_empenhado_bruto: 0,
          total_acrescimos: 0,
          total_anulado: 0,
          total_empenhado_liquido: 0,
          total_liquidado: 0,
          total_pago: 0,
          saldo_a_liquidar: 0,
          saldo_a_pagar: 0,
        };
        mapa.set(chave, novoComp);
        ultimoCompostoNomeado = novoComp;
      }
    }

    // Se não há empenhos positivos mas há liquidações/pagamentos, cria bucket genérico
    if (mapa.size === 0 && (grupo.liquidacoes.length > 0 || grupo.pagamentos.length > 0)) {
      mapa.set('SEM_EMPENHO', {
        numero_empenho: '',
        ano_exercicio: grupo.ano,
        empenho: null,
        acrescimos: [],
        anulacoes: [],
        liquidacoes: [],
        pagamentos: [],
        total_empenhado_bruto: 0,
        total_acrescimos: 0,
        total_anulado: 0,
        total_empenhado_liquido: 0,
        total_liquidado: 0,
        total_pago: 0,
        saldo_a_liquidar: 0,
        saldo_a_pagar: 0,
      });
    }

    // Lista ordenada de compostos para busca FIFO (somente empenhos nomeados)
    const compostosOrdenados = Array.from(mapa.values()).sort(
      (a, b) => toTimestamp(a.empenho?.data ?? '') - toTimestamp(b.empenho?.data ?? ''),
    );

    // FIFO para liquidações/anulações: primeiro empenho com saldo a liquidar
    // Saldo = empenho original + acréscimos - anulado - liquidado
    const encontrarFIFOLiquidacao = (): EmpenhoComposto | null => {
      for (const c of compostosOrdenados) {
        if (!c.empenho) continue;
        const saldoALiquidar =
          c.empenho.valor + c.total_acrescimos - c.total_anulado - c.total_liquidado;
        if (saldoALiquidar > 0.01) return c;
      }
      return compostosOrdenados[compostosOrdenados.length - 1] || null;
    };

    // FIFO para pagamentos: primeiro empenho com saldo a pagar (liquidado mas não pago)
    const encontrarFIFOPagamento = (): EmpenhoComposto | null => {
      for (const c of compostosOrdenados) {
        const saldoAPagar = c.total_liquidado - c.total_pago;
        if (saldoAPagar > 0.01) return c;
      }
      return compostosOrdenados[compostosOrdenados.length - 1] || null;
    };

    // Processar todos os registros em ordem cronológica para FIFO correto
    type Registro = { data: string; tipo: 'ANULACAO' | 'LIQUIDACAO' | 'PAGAMENTO'; reg: EmpenhoFator };
    const todos: Registro[] = [
      ...grupo.anulacoes.map(r => ({ data: r.data, tipo: 'ANULACAO' as const, reg: r })),
      ...grupo.liquidacoes.map(r => ({ data: r.data, tipo: 'LIQUIDACAO' as const, reg: r })),
      ...grupo.pagamentos.map(r => ({ data: r.data, tipo: 'PAGAMENTO' as const, reg: r })),
    ];
    todos.sort((a, b) => toTimestamp(a.data) - toTimestamp(b.data));

    for (const { tipo, reg } of todos) {
      const chave = reg.numero_empenho || '';
      if (tipo === 'ANULACAO') {
        const comp = mapa.get(chave) || encontrarFIFOLiquidacao();
        if (comp) {
          comp.anulacoes.push(reg);
          comp.total_anulado += Math.abs(reg.valor);
        }
      } else if (tipo === 'LIQUIDACAO') {
        const comp = mapa.get(chave) || encontrarFIFOLiquidacao();
        if (comp) {
          comp.liquidacoes.push(reg);
          comp.total_liquidado += reg.valor;
        }
      } else {
        const comp = mapa.get(chave) || encontrarFIFOPagamento();
        if (comp) {
          comp.pagamentos.push(reg);
          comp.total_pago += reg.valor;
        }
      }
    }

    // Calcular totais e ordenar
    const compostos = Array.from(mapa.values());
    for (const c of compostos) {
      // Empenhado bruto = empenho original + acréscimos/reforços absorvidos
      c.total_empenhado_bruto = (c.empenho?.valor ?? 0) + c.total_acrescimos;
      c.total_empenhado_liquido = c.total_empenhado_bruto - c.total_anulado;
      c.saldo_a_liquidar = Math.max(0, c.total_empenhado_liquido - c.total_liquidado);
      c.saldo_a_pagar = Math.max(0, c.total_liquidado - c.total_pago);

      // Ordenar sub-registros por data
      c.acrescimos.sort((a, b) => toTimestamp(a.data) - toTimestamp(b.data));
      c.anulacoes.sort((a, b) => toTimestamp(a.data) - toTimestamp(b.data));
      c.liquidacoes.sort((a, b) => toTimestamp(a.data) - toTimestamp(b.data));
      c.pagamentos.sort((a, b) => toTimestamp(a.data) - toTimestamp(b.data));
    }

    // Ordenar empenhos compostos por data do empenho
    compostos.sort((a, b) => {
      const ta = a.empenho ? toTimestamp(a.empenho.data) : 0;
      const tb = b.empenho ? toTimestamp(b.empenho.data) : 0;
      return ta - tb;
    });

    return compostos;
  }

  private extrairCampo(texto: string, regex: RegExp): string {
    const match = regex.exec(texto);
    return match ? match[1].trim() : '';
  }

  private limparHtml(texto: string): string {
    return texto
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
