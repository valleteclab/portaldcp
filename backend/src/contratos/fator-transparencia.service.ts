import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { SystemConfigService } from '../system-config/system-config.service';

export type FaseDespesa = 'EMPENHO' | 'LIQUIDACAO' | 'PAGAMENTO' | 'OUTRO';

export interface EmpenhoFator {
  numero_liquidacao: string;
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

export interface ResumoEmpenhos {
  empenhos: EmpenhoFator[];
  resumo: {
    total_empenhado: number;
    total_liquidado: number;
    total_pago: number;
    saldo_empenhado: number;
    quantidade_empenhos: number;
    quantidade_liquidacoes: number;
    quantidade_pagamentos: number;
  };
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

      const chave = e.numero_liquidacao || `idx-${idx}-${e.data}`;
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

  calcularResumo(empenhos: EmpenhoFator[]): ResumoEmpenhos {
    const resumo = {
      total_empenhado: empenhos.filter(e => e.fase_tipo === 'EMPENHO').reduce((s, e) => s + e.valor, 0),
      total_liquidado: empenhos.filter(e => e.fase_tipo === 'LIQUIDACAO').reduce((s, e) => s + e.valor, 0),
      total_pago: empenhos.filter(e => e.fase_tipo === 'PAGAMENTO').reduce((s, e) => s + e.valor, 0),
      saldo_empenhado: 0,
      quantidade_empenhos: empenhos.filter(e => e.fase_tipo === 'EMPENHO').length,
      quantidade_liquidacoes: empenhos.filter(e => e.fase_tipo === 'LIQUIDACAO').length,
      quantidade_pagamentos: empenhos.filter(e => e.fase_tipo === 'PAGAMENTO').length,
    };
    resumo.saldo_empenhado = resumo.total_empenhado - resumo.total_pago;
    return { empenhos, resumo };
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
