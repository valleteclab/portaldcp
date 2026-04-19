import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { SystemConfigService } from '../system-config/system-config.service';

export type FaseDespesa = 'EMPENHO' | 'LIQUIDACAO' | 'PAGAMENTO' | 'OUTRO';

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

    // Busca todos os anos do intervalo [anoContrato … anoAtual]
    // Contratos de longa duração (aditivos) podem ter empenhos em qualquer ano do período
    const anoInicio = Math.min(anoContrato, anoAtual);
    const anoFim = Math.max(anoContrato, anoAtual);
    const anos: number[] = [];
    for (let a = anoInicio; a <= anoFim; a++) anos.push(a);

    // Normaliza o número de contrato para NNN/AAAA (remove sufixos "3ªAD", "TA", etc.)
    const nContratoNormalizado = this.normalizarNumeroContrato(params.nContrato);

    // Estratégia: NÃO enviar nContrato ao portal (match exato falha com variações tipo
    // "028/2023 3ºAD", "028-2023-ADITIVO" etc). Busca por CNPJ apenas e filtra localmente
    // comparando o numero_contrato extraído de cada dialog.
    const paramsSemContrato = { ...params, nContrato: '' };

    const resultadosPorAno = await Promise.all(
      anos.map((ano) => this.buscarPorAno(orgId, paramsSemContrato, ano)),
    );

    // Mescla, deduplica e filtra pelo número de contrato normalizado
    const todos = resultadosPorAno.flat();
    const chaveContratoAlvo = this.chaveContrato(nContratoNormalizado);

    const vistos = new Set<string>();
    return todos.filter((e, idx) => {
      // Filtra por número de contrato quando disponível no dialog
      if (chaveContratoAlvo) {
        const chaveEmpenho = this.chaveContrato(e.numero_contrato);
        // Aceita: (a) match exato, (b) numero_contrato do empenho começa com o alvo
        //         (ex: "028/2023-3ADITIVO" bate com "028/2023"),
        //         (c) dialog não informou contrato (chaveEmpenho vazia) → descarta
        if (!chaveEmpenho) return false;
        if (!chaveEmpenho.startsWith(chaveContratoAlvo)) return false;
      }

      // Chave composta: numero_liquidacao se repete entre anos (reseta a cada exercício),
      // então usamos data + fase + valor + nº para diferenciar
      const chave = `${e.data}|${e.fase_tipo}|${e.numero_liquidacao || idx}|${e.valor}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
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
      });
    }

    return resultados;
  }

  /** Mapeia cada dialog_N ao seu bloco de detalhes */
  private extrairDialogs(
    html: string,
  ): Map<string, Partial<EmpenhoFator> & Record<string, string>> {
    const map = new Map<string, Partial<EmpenhoFator> & Record<string, string>>();

    const dialogPattern =
      /<div id='(dialog_\d+)'\s+title='Detalhe da Despesa'[^>]*>([\s\S]*?)(?=<div id='dialog_\d+'|$)/g;

    let m: RegExpExecArray | null;
    while ((m = dialogPattern.exec(html)) !== null) {
      const [, id, conteudo] = m;
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
    if (f.startsWith('EMPENHO')) return 'EMPENHO';
    if (f.startsWith('LIQUIDACAO') || f.startsWith('LIQUIDAÇÃO')) return 'LIQUIDACAO';
    if (f.startsWith('PAGAMENTO')) return 'PAGAMENTO';
    return 'OUTRO';
  }

  calcularResumo(
    empenhos: EmpenhoFator[],
    opts: { valor_global?: number; ano_contrato?: number } = {},
  ): ResumoEmpenhos {
    const anoAtual = new Date().getFullYear();
    const valorGlobal = Number(opts.valor_global ?? 0);
    const anoContrato = opts.ano_contrato ?? anoAtual;

    const total_empenhado = empenhos.filter(e => e.fase_tipo === 'EMPENHO').reduce((s, e) => s + e.valor, 0);
    const total_liquidado = empenhos.filter(e => e.fase_tipo === 'LIQUIDACAO').reduce((s, e) => s + e.valor, 0);
    const total_pago = empenhos.filter(e => e.fase_tipo === 'PAGAMENTO').reduce((s, e) => s + e.valor, 0);

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
    for (const e of empenhos) {
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

    const grupos_exercicio = this.agruparPorExercicio(empenhos, anoAtual);

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
        quantidade_empenhos: empenhos.filter(e => e.fase_tipo === 'EMPENHO').length,
        quantidade_liquidacoes: empenhos.filter(e => e.fase_tipo === 'LIQUIDACAO').length,
        quantidade_pagamentos: empenhos.filter(e => e.fase_tipo === 'PAGAMENTO').length,
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
