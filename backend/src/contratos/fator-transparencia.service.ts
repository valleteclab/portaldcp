import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { SystemConfigService } from '../system-config/system-config.service';

export interface EmpenhoFator {
  numero_liquidacao: string;
  data: string;
  fase: string;
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

    // Busca o ano do contrato E o ano atual quando forem diferentes
    // (ex: contrato de 2025 pode ter empenhos emitidos em 2026)
    const anos =
      anoContrato !== anoAtual
        ? [anoContrato, anoAtual]
        : [anoContrato];

    const resultadosPorAno = await Promise.all(
      anos.map((ano) => this.buscarPorAno(orgId, params, ano)),
    );

    // Mescla e deduplica por numero_liquidacao (ou pela posição quando vazio)
    const todos = resultadosPorAno.flat();
    const vistos = new Set<string>();
    return todos.filter((e, idx) => {
      const chave = e.numero_liquidacao || `idx-${idx}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
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
          cpfcnpj: params.cpfcnpj ?? '',
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

      resultados.push({
        numero_liquidacao: detalhe.numero_liquidacao ?? '',
        data: data.trim(),
        fase: fase.trim(),
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
      numero_contrato: this.extrairCampo(
        conteudo,
        /<strong>Nº Contrato:<\/strong>\s*([^<\-&]+)/,
      ).trim(),
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
