import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { ContratosService } from './contratos.service';
import { IaService } from '../ia/ia.service';
import { MedicaoService } from './medicao.service';
import { FornecedoresService } from '../fornecedores/fornecedores.service';
import { DocumentoContrato, TipoDocumentoContrato } from './entities/documento-contrato.entity';

function corrigirJsonMalformado(jsonString: string): string {
  const inicio = jsonString.indexOf('{');
  const fim = jsonString.lastIndexOf('}');
  if (inicio === -1 || fim === -1) return jsonString;

  let json = jsonString.substring(inicio, fim + 1);
  json = json.replace(/"\w+":\s*null\s*,?/g, '');
  json = json.replace(/\}\s*"([^"]+)":\s*([^,\{\}]+)\s*,?\s*\{/g, '}, {');
  json = json.replace(/\}\s*"([^"]+)":\s*([^,\{\}]+)\s*\{/g, '}, {');
  json = json.replace(/("\w+":\s*[^,\{\}]+)\s*,\s*"\w+":\s*[^,\{\}]+\s*,?/g, '$1,');
  json = json.replace(/("\w+":\s*[^,\{\}]+)(\s*,\s*\1)+/g, '$1');
  json = json.replace(/,\s*\}/g, '}').replace(/,\s*\]/g, ']');
  json = json.replace(/,\s*,/g, ',');
  json = json.replace(/\{\s*\}/g, '');
  json = json.replace(/,\s*\]/g, ']');

  return json;
}

function tentarExtrairJson(str: string): any | null {
  try {
    return JSON.parse(str);
  } catch { /* continuar */ }

  const corrigido = corrigirJsonMalformado(str);
  try {
    return JSON.parse(corrigido);
  } catch { /* continuar */ }

  try {
    const resultado: any = { itens: [] };
    const descRegex = /"descricao":\s*"([^"]*)"/gi;
    const itensEncontrados = new Map<string, any>();

    let match;
    while ((match = descRegex.exec(str)) !== null) {
      const descricao = match[1].trim();
      const posicao = match.index;
      const contexto = str.substring(posicao, posicao + 800);

      const item: any = {
        descricao: descricao || 'Item sem descrição',
        unidade_medida: 'UNIDADE',
        quantidade: 1,
        valor_unitario: 0,
        quantidade_meses: null,
        valor_total: 0,
      };

      const qtdMatch = contexto.match(/"quantidade":\s*([\d.]+|null)/);
      if (qtdMatch && qtdMatch[1] !== 'null') item.quantidade = parseFloat(qtdMatch[1]);

      const unitMatch = contexto.match(/"valor_unitario":\s*([\d.]+|null)/);
      if (unitMatch && unitMatch[1] !== 'null') item.valor_unitario = parseFloat(unitMatch[1]);

      const totalMatch = contexto.match(/"valor_total":\s*([\d.]+)/);
      if (totalMatch) {
        item.valor_total = parseFloat(totalMatch[1]);
      } else if (item.quantidade && item.valor_unitario) {
        item.valor_total = item.quantidade * item.valor_unitario;
      }

      const unidMatch = contexto.match(/"unidade_medida":\s*"([^"]+)"/);
      if (unidMatch) item.unidade_medida = unidMatch[1];

      const mesesMatch = contexto.match(/"quantidade_meses":\s*(\d+|null)/);
      if (mesesMatch && mesesMatch[1] !== 'null') item.quantidade_meses = parseInt(mesesMatch[1]);

      if (item.valor_total > 0 || (item.quantidade > 0 && item.valor_unitario > 0)) {
        const chave = `${item.descricao}|${item.quantidade}|${item.valor_total}`;
        if (!itensEncontrados.has(chave)) itensEncontrados.set(chave, item);
      }
    }

    resultado.itens = Array.from(itensEncontrados.values());
    if (resultado.itens.length > 0) return resultado;
  } catch { /* continuar */ }

  return null;
}

function normalizarItensExtraidos(itens: any[]): Array<{
  descricao: string;
  unidade_medida: string;
  quantidade: number;
  valor_unitario: number;
  quantidade_meses?: number | null;
  valor_total?: number;
}> {
  return itens
    .map((item) => ({
      descricao: String(item?.descricao || '').trim(),
      unidade_medida: String(item?.unidade_medida || 'UNIDADE').trim() || 'UNIDADE',
      quantidade: Number(item?.quantidade) || 0,
      valor_unitario: Number(item?.valor_unitario) || 0,
      quantidade_meses: item?.quantidade_meses != null ? Number(item.quantidade_meses) || null : null,
      valor_total: Number(item?.valor_total) || undefined,
    }))
    .filter((item) => item.descricao && (item.valor_total || (item.quantidade > 0 && item.valor_unitario > 0)));
}

function extrairItensDaRespostaIA(respostaIA: string): Array<any> {
  const jsonLimpo = respostaIA.replace(/```json\n?|```/g, '').trim();
  const dadosExtraidos = tentarExtrairJson(jsonLimpo);

  if (!dadosExtraidos || !Array.isArray(dadosExtraidos.itens)) {
    return [];
  }

  return normalizarItensExtraidos(dadosExtraidos.itens);
}

export interface PortalTransparenciaContrato {
  contratoNumero: string;
  documento: string;
  favorecido: string;
  contratoObjeto: string;
  vigencia: string;
  vigencia_inicio?: string;
  aditivos_valor_total?: string | null;
  valor_contrato?: string;
  url?: string;
  fiscal?: string;
}

export interface PortalTransparenciaResponse {
  resource: string;
  count: number;
  data: PortalTransparenciaContrato[];
}

export interface ImportacaoContratoJobStatus {
  job_id: string;
  status: 'pendente' | 'processando' | 'concluido' | 'erro';
  progresso: number;
  etapa: string;
  mensagem: string;
  contrato_id?: string;
  itens_criados?: number;
  concluido: boolean;
  erro?: string;
  atualizado_em: string;
}

@Injectable()
export class PortalTransparenciaService {
  private readonly logger = new Logger(PortalTransparenciaService.name);
  private readonly baseUrl = 'https://portaldatransparencia.cmlem.ba.gov.br/api';
  private readonly importacoesIndividuais = new Map<string, ImportacaoContratoJobStatus>();

  constructor(
    private readonly httpService: HttpService,
    private readonly contratosService: ContratosService,
    private readonly fornecedoresService: FornecedoresService,
    private readonly iaService: IaService,
    private readonly medicaoService: MedicaoService,
    @InjectRepository(DocumentoContrato)
    private readonly documentoContratoRepository: Repository<DocumentoContrato>,
  ) {}

  /**
   * Busca contratos na API do Portal de Transparência
   */
  async buscarContratos(params: {
    numero?: string;
    limit?: number;
    offset?: number;
    apenas_vigentes?: boolean;
  }): Promise<PortalTransparenciaResponse> {
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('resource', 'contratos');
      
      if (params.numero) queryParams.append('numero', params.numero);
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.offset) queryParams.append('offset', params.offset.toString());

      const url = `${this.baseUrl}/?${queryParams.toString()}`;
      this.logger.log(`Buscando contratos na API: ${url}`);

      const response = await firstValueFrom(
        this.httpService.get<PortalTransparenciaResponse>(url)
      );

      let data = response.data.data || [];
      
      // Filtrar apenas contratos vigentes se solicitado
      if (params.apenas_vigentes) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        data = data.filter(contrato => {
          const dataVigencia = this.parseDataBrasileira(contrato.vigencia);
          return dataVigencia >= hoje;
        });
        
        this.logger.log(`Filtrados ${data.length} contratos vigentes de ${response.data.data?.length || 0} total`);
      }

      return {
        resource: response.data.resource,
        count: data.length,
        data: data
      };
    } catch (error) {
      this.logger.error(`Erro ao buscar contratos na API: ${error.message}`, error.stack);
      throw new Error(`Falha ao consultar API do Portal de Transparência: ${error.message}`);
    }
  }

  /**
   * Importa contratos da API para o sistema
   */
  async importarContratos(
    orgaoId: string,
    params: {
      numero?: string;
      limit?: number;
      offset?: number;
      apenas_vigentes?: boolean;
    }
  ): Promise<{
    importados: number;
    erros: number;
    detalhes: Array<{ numero: string; status: 'sucesso' | 'erro'; mensagem?: string }>;
  }> {
    const resultado = {
      importados: 0,
      erros: 0,
      detalhes: [] as Array<{ numero: string; status: 'sucesso' | 'erro'; mensagem?: string }>,
    };

    try {
      const apiResponse = await this.buscarContratos(params);
      
      if (!apiResponse.data || apiResponse.data.length === 0) {
        this.logger.log('Nenhum contrato encontrado na API');
        return resultado;
      }

      this.logger.log(`Encontrados ${apiResponse.data.length} contratos para importar`);

      for (const contratoApi of apiResponse.data) {
        try {
          await this.importarContratoIndividual(orgaoId, contratoApi);
          resultado.importados++;
          resultado.detalhes.push({
            numero: contratoApi.contratoNumero,
            status: 'sucesso',
          });
        } catch (error) {
          resultado.erros++;
          resultado.detalhes.push({
            numero: contratoApi.contratoNumero,
            status: 'erro',
            mensagem: error.message,
          });
          this.logger.error(`Erro ao importar contrato ${contratoApi.contratoNumero}: ${error.message}`);
        }
      }

      return resultado;
    } catch (error) {
      this.logger.error(`Erro na importação: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Importa um contrato individual e retorna status detalhado
   */
  async importarContratoIndividualPublico(
    orgaoId: string,
    contratoApi: PortalTransparenciaContrato
  ): Promise<{
    sucesso: boolean;
    ja_existe: boolean;
    contrato_id?: string;
    numero: string;
    mensagem?: string;
  }> {
    this.logger.log(`[Importar Individual] Iniciando: ${contratoApi.contratoNumero}, orgaoId: ${orgaoId}`);
    
    try {
      // Verificar se contrato já existe
      this.logger.log(`[Importar Individual] Verificando se contrato existe...`);
      const contratoExistente = await this.contratosService.findByNumero(
        contratoApi.contratoNumero,
        orgaoId
      );
      
      if (contratoExistente) {
        this.logger.log(`[Importar Individual] Contrato já existe: ${contratoExistente.id}`);
        return {
          sucesso: false,
          ja_existe: true,
          numero: contratoApi.contratoNumero,
          mensagem: 'Contrato já existe no sistema'
        };
      }

      // Importar contrato
      this.logger.log(`[Importar Individual] Chamando importarContratoIndividual...`);
      await this.importarContratoIndividual(orgaoId, contratoApi);
      
      // Buscar contrato criado para retornar ID (usar mesmo número formatado usado na criação)
      const numeroFormatado = contratoApi.contratoNumero.replace('-Contrato', '');
      this.logger.log(`[Importar Individual] Buscando contrato criado com número: ${numeroFormatado}`);
      const contratoCriado = await this.contratosService.findByNumero(
        numeroFormatado,
        orgaoId
      );

      if (!contratoCriado) {
        this.logger.error(`[Importar Individual] Contrato não encontrado após criação!`);
        return {
          sucesso: false,
          ja_existe: false,
          numero: contratoApi.contratoNumero,
          mensagem: 'Contrato criado mas não encontrado no banco de dados'
        };
      }

      this.logger.log(`[Importar Individual] Sucesso! ID: ${contratoCriado.id}`);

      // Baixar PDF se tiver URL
      let pdfBaixado = false;
      if (contratoApi.url) {
        try {
          this.logger.log(`[Importar Individual] Baixando PDF: ${contratoApi.url}`);
          const pdfBuffer = await this.baixarPdfContrato(contratoApi.url);
          pdfBaixado = true;
          this.logger.log(`[Importar Individual] PDF baixado: ${pdfBuffer.length} bytes`);

          // Salvar PDF em documentos do contrato
          try {
            await this.salvarPdfDocumento(contratoCriado.id, pdfBuffer, contratoApi.contratoNumero);
            this.logger.log(`[Importar Individual] PDF salvo em documentos`);
          } catch (docError) {
            this.logger.warn(`[Importar Individual] Erro ao salvar PDF: ${docError.message}`);
          }
        } catch (pdfError) {
          this.logger.warn(`[Importar Individual] PDF não baixado: ${pdfError.message}`);
        }
      }

      return {
        sucesso: true,
        ja_existe: false,
        contrato_id: contratoCriado.id,
        numero: contratoApi.contratoNumero,
        mensagem: pdfBaixado ? 'Contrato e PDF importados com sucesso' : 'Contrato importado com sucesso'
      };
    } catch (error) {
      this.logger.error(`[Importar Individual] Erro: ${error.message}`, error.stack);
      return {
        sucesso: false,
        ja_existe: false,
        numero: contratoApi.contratoNumero,
        mensagem: error.message
      };
    }
  }

  iniciarImportacaoContratoCompletoJob(
    orgaoId: string,
    contratoApi: PortalTransparenciaContrato,
  ): { job_id: string } {
    const jobId = randomUUID();

    this.importacoesIndividuais.set(jobId, {
      job_id: jobId,
      status: 'pendente',
      progresso: 0,
      etapa: 'Fila',
      mensagem: 'Importação adicionada à fila',
      concluido: false,
      atualizado_em: new Date().toISOString(),
    });

    void this.processarImportacaoContratoCompleta(jobId, orgaoId, contratoApi);

    return { job_id: jobId };
  }

  obterStatusImportacaoContratoCompleto(jobId: string): ImportacaoContratoJobStatus | null {
    return this.importacoesIndividuais.get(jobId) || null;
  }

  private atualizarStatusImportacao(
    jobId: string,
    dados: Partial<ImportacaoContratoJobStatus>,
  ): void {
    const atual = this.importacoesIndividuais.get(jobId);
    if (!atual) return;

    this.importacoesIndividuais.set(jobId, {
      ...atual,
      ...dados,
      atualizado_em: new Date().toISOString(),
    });
  }

  private async processarImportacaoContratoCompleta(
    jobId: string,
    orgaoId: string,
    contratoApi: PortalTransparenciaContrato,
  ): Promise<void> {
    try {
      this.atualizarStatusImportacao(jobId, {
        status: 'processando',
        progresso: 5,
        etapa: 'Validando contrato',
        mensagem: `Preparando importação do contrato ${contratoApi.contratoNumero}`,
      });

      const resultado = await this.importarContratoCompleto(
        orgaoId,
        contratoApi,
        (status) => this.atualizarStatusImportacao(jobId, status),
      );

      this.atualizarStatusImportacao(jobId, {
        status: 'concluido',
        progresso: 100,
        etapa: 'Concluído',
        mensagem: resultado.mensagem,
        contrato_id: resultado.contrato_id,
        itens_criados: resultado.itens_criados,
        concluido: true,
      });
    } catch (error) {
      this.logger.error(`[Importação Job ${jobId}] ${error.message}`, error.stack);
      this.atualizarStatusImportacao(jobId, {
        status: 'erro',
        progresso: 100,
        etapa: 'Erro',
        mensagem: error.message || 'Erro ao importar contrato',
        erro: error.message || 'Erro ao importar contrato',
        concluido: true,
      });
    }
  }

  private async importarContratoIndividual(
    orgaoId: string,
    contratoApi: PortalTransparenciaContrato
  ): Promise<void> {
    this.logger.log(`[importarContratoIndividual] Iniciando: ${contratoApi.contratoNumero}`);
    
    // Limpar CNPJ (remover formatação)
    const cnpjLimpo = contratoApi.documento.replace(/\D/g, '');
    this.logger.log(`[importarContratoIndividual] CNPJ limpo: ${cnpjLimpo}`);
    
    // Buscar ou criar fornecedor usando métodos existentes
    let fornecedor;
    try {
      this.logger.log(`[importarContratoIndividual] Verificando fornecedor...`);
      const verificacao = await this.fornecedoresService.verificarCnpjExistente(cnpjLimpo);
      if (verificacao.existe && verificacao.fornecedor) {
        fornecedor = verificacao.fornecedor;
        this.logger.log(`[importarContratoIndividual] Fornecedor existente: ${fornecedor.id}`);
      }
    } catch (e) {
      this.logger.log(`[importarContratoIndividual] Fornecedor não encontrado, será criado`);
    }
    
    if (!fornecedor) {
      this.logger.log(`[importarContratoIndividual] Criando fornecedor: ${contratoApi.favorecido} - ${cnpjLimpo}`);
      // Usar cadastro rápido que já existe no sistema
      fornecedor = await this.fornecedoresService.cadastroRapidoOrgao(
        cnpjLimpo,
        contratoApi.favorecido
      );
      this.logger.log(`[importarContratoIndividual] Fornecedor criado: ${fornecedor.id}`);
    }

    // Converter vigência para data
    this.logger.log(`[importarContratoIndividual] Parsing data vigência: ${contratoApi.vigencia}`);
    const dataVigencia = this.parseDataBrasileira(contratoApi.vigencia);
    
    // Converter valor - usar aditivos_valor_total se existir, senão valor_contrato
    let valorGlobal = 0;
    if (contratoApi.aditivos_valor_total) {
      valorGlobal = parseFloat(contratoApi.aditivos_valor_total) || 0;
      this.logger.log(`[importarContratoIndividual] Valor aditivos: ${valorGlobal}`);
    } else if (contratoApi.valor_contrato) {
      // Remover 'R$' e converter formato brasileiro (1.234,56 -> 1234.56)
      const valorLimpo = contratoApi.valor_contrato
        .replace(/^R\$\s*/, '')
        .replace(/\./g, '')
        .replace(',', '.');
      valorGlobal = parseFloat(valorLimpo) || 0;
      this.logger.log(`[importarContratoIndividual] Valor contrato: ${valorGlobal}`);
    }

    // Extrair ano e sequencial do número do contrato (ex: 001/2024-Contrato -> ano=2024, sequencial=1)
    const anoMatch = contratoApi.contratoNumero.match(/\/(\d{4})/);
    const ano = anoMatch ? parseInt(anoMatch[1]) : new Date().getFullYear();
    const sequencialMatch = contratoApi.contratoNumero.match(/^(\d{3})/);
    const sequencial = sequencialMatch ? parseInt(sequencialMatch[1]) : 1;
    this.logger.log(`[importarContratoIndividual] Ano: ${ano}, Sequencial: ${sequencial}`);

    // Criar contrato usando o método existente
    this.logger.log(`[importarContratoIndividual] Verificando se contrato já existe...`);
    
    // Buscar se contrato já existe
    try {
      const contratoExistente = await this.contratosService.findByNumero(
        contratoApi.contratoNumero,
        orgaoId
      );
      
      if (contratoExistente) {
        this.logger.log(`[importarContratoIndividual] Contrato ${contratoApi.contratoNumero} já existe, pulando...`);
        return;
      }
    } catch (e) {
      this.logger.log(`[importarContratoIndividual] Contrato não existe, vai criar`);
    }

    // Criar DTO para o contrato
    this.logger.log(`[importarContratoIndividual] Criando DTO...`);
    const createDto = {
      orgao_id: orgaoId,
      numero_contrato: contratoApi.contratoNumero.replace('-Contrato', ''),
      ano,
      sequencial,
      objeto: contratoApi.contratoObjeto,
      valor_inicial: valorGlobal,
      valor_global: valorGlobal,
      data_assinatura: contratoApi.vigencia_inicio ? this.parseDataBrasileira(contratoApi.vigencia_inicio) : new Date(),
      data_vigencia_inicio: contratoApi.vigencia_inicio ? this.parseDataBrasileira(contratoApi.vigencia_inicio) : new Date(),
      data_vigencia_fim: dataVigencia,
      fornecedor_id: fornecedor.id,
      fornecedor_cnpj: cnpjLimpo,
      fornecedor_razao_social: contratoApi.favorecido,
      modalidade: 'CONTRATACAO_DIRETA',
      situacao: 'VIGENTE',
      origem: 'IMPORTADO_PORTAL_TRANSPARENCIA',
    };

    this.logger.log(`[importarContratoIndividual] Chamando contratosService.criar...`);
    await this.contratosService.criar(createDto);
    this.logger.log(`[importarContratoIndividual] Contrato criado com sucesso!`);
  }

  /**
   * Baixa o PDF do contrato a partir da URL
   */
  async baixarPdfContrato(url: string): Promise<Buffer> {
    try {
      this.logger.log(`Baixando PDF: ${url}`);
      
      const response = await firstValueFrom(
        this.httpService.get(url, {
          responseType: 'arraybuffer',
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        })
      );
      
      const contentType = response.headers['content-type'];
      if (contentType && contentType.includes('pdf')) {
        return Buffer.from(response.data);
      }
      
      // Se não detectou pelo content-type, tenta verificar se é PDF pelo magic number
      const buffer = Buffer.from(response.data);
      if (buffer.toString('hex', 0, 4) === '25504446') { // %PDF
        return buffer;
      }
      
      throw new Error('Resposta não é um PDF válido');
    } catch (error) {
      this.logger.error(`Erro ao baixar PDF: ${error.message}`);
      throw new Error(`Falha ao baixar PDF do contrato: ${error.message}`);
    }
  }

  /**
   * Extrai itens do PDF usando IA
   */
  async extrairItensDoPdf(pdfBuffer: Buffer, contratoNumero?: string): Promise<Array<{
    descricao: string;
    unidade_medida: string;
    quantidade: number;
    valor_unitario: number;
    quantidade_meses?: number | null;
    valor_total?: number;
  }>> {
    try {
      this.logger.log('Extraindo texto do PDF...');
      const textoExtraido = await this.iaService.extrairTextoDoPdf(pdfBuffer);

      if (textoExtraido.trim().length >= 100) {
        this.logger.log(`Texto extraído: ${textoExtraido.length} caracteres`);
        const itensViaTexto = await this.extrairItensViaTexto(textoExtraido, contratoNumero);
        if (itensViaTexto.length > 0) {
          return itensViaTexto;
        }
        this.logger.warn('Extração via texto não encontrou itens válidos, tentando via IA Vision...');
      }

      this.logger.warn('Texto extraído muito curto ou sem itens válidos, tentando extrair via IA Vision...');
      return await this.extrairItensViaVision(pdfBuffer, contratoNumero, textoExtraido);
    } catch (error) {
      this.logger.error(`Erro ao extrair itens do PDF: ${error.message}`);
      return [];
    }
  }

  /**
   * Extrai itens usando IA com Vision (para PDFs escaneados)
   */
  private async extrairItensViaVision(pdfBuffer: Buffer, contratoNumero?: string, textoFallback?: string): Promise<Array<any>> {
    try {
      const pdfBase64 = pdfBuffer.toString('base64');
      
      const promptExtracaoItens = `Você é um especialista em extrair itens de contratos públicos brasileiros.
Analise este PDF de contrato e extraia a tabela de itens/serviços do contrato ${contratoNumero || ''}.

REGRAS:
- Extraia APENAS a lista de itens/serviços do contrato
- NUNCA invente dados - use apenas o que está no documento
- Cada item deve ter: descrição completa, unidade de medida, quantidade, valor unitário, valor total
- Para contratos de serviços, a unidade pode ser: UNIDADE, MESES, CONTRATO GLOBAL, etc.
- Se houver resposta fora de JSON, converta mentalmente e retorne SOMENTE JSON válido
- Retorne APENAS JSON válido, sem texto adicional

Schema de retorno:
{
  "itens": [
    {
      "descricao": "descrição completa do item/serviço",
      "unidade_medida": "UNIDADE", 
      "quantidade": 1,
      "valor_unitario": 85000.00,
      "valor_total": 85000.00,
      "quantidade_meses": null
    }
  ],
  "observacoes": "descrição breve do que foi encontrado"
}

Se não encontrar itens, retorne: {"itens": [], "observacoes": "Nenhum item encontrado"}`;

      const respostaIA = await this.iaService.chatComArquivo(
        promptExtracaoItens,
        pdfBase64,
        'application/pdf'
      );

      const itens = extrairItensDaRespostaIA(respostaIA);
      if (itens.length === 0) {
        this.logger.warn('IA não retornou lista de itens válida');
        if (textoFallback?.trim()) {
          this.logger.warn('Tentando fallback final via texto após falha no Vision...');
          return await this.extrairItensViaTexto(textoFallback, contratoNumero);
        }
        return [];
      }

      this.logger.log(`Itens extraídos via Vision: ${itens.length}`);
      return itens;
    } catch (error) {
      this.logger.error(`Erro na extração via Vision: ${error.message}`);
      if (textoFallback?.trim()) {
        this.logger.warn('Vision falhou, tentando fallback final via texto...');
        return await this.extrairItensViaTexto(textoFallback, contratoNumero);
      }
      return [];
    }
  }

  /**
   * Extrai itens via texto extraído (para PDFs digitais)
   */
  private async extrairItensViaTexto(textoExtraido: string, contratoNumero?: string): Promise<Array<any>> {
    try {
      const promptExtracaoItens = `Você é um especialista em extrair itens de contratos públicos brasileiros.

CONTRATO: ${contratoNumero || 'não informado'}

REGRAS:
- Extraia APENAS a lista de itens do contrato
- NUNCA invente dados - use apenas o que está no documento
- Cada item deve ter: descrição, unidade de medida, quantidade, valor unitário
- Para contratos contínuos (mensais), use quantidade_meses
- Se houver tabela, preserve cada linha como um item separado
- Se a resposta inicial não ficar em JSON perfeito, ainda assim você deve retornar SOMENTE JSON válido
- Retorne APENAS JSON válido, sem texto adicional

Schema de retorno:
{
  "itens": [
    {
      "descricao": "descrição completa do item",
      "unidade_medida": "UNIDADE", 
      "quantidade": 10,
      "valor_unitario": 100.00,
      "quantidade_meses": null,
      "valor_total": 1000.00
    }
  ],
  "observacoes": "descrição breve do que foi encontrado"
}

Se não encontrar itens, retorne: {"itens": [], "observacoes": "Nenhum item encontrado"}`;

      const respostaIA = await this.iaService.chatComArquivo(
        promptExtracaoItens,
        undefined,
        undefined,
        textoExtraido
      );

      const itens = extrairItensDaRespostaIA(respostaIA);
      if (itens.length === 0) {
        this.logger.warn('IA não retornou lista de itens válida');
        return [];
      }

      this.logger.log(`Itens extraídos via texto: ${itens.length}`);
      return itens;
    } catch (error) {
      this.logger.error(`Erro na extração via texto: ${error.message}`);
      return [];
    }
  }

  /**
   * Importa contrato com itens (fluxo completo do agente autônomo)
   */
  async importarContratoCompleto(
    orgaoId: string,
    contratoApi: PortalTransparenciaContrato,
    onProgress?: (status: Partial<ImportacaoContratoJobStatus>) => void,
  ): Promise<{
    contrato_id?: string;
    itens_criados: number;
    pdf_baixado: boolean;
    itens_extraidos: boolean;
    mensagem: string;
  }> {
    const resultado = {
      contrato_id: undefined as string | undefined,
      itens_criados: 0,
      pdf_baixado: false,
      itens_extraidos: false,
      mensagem: ''
    };

    try {
      onProgress?.({
        progresso: 10,
        etapa: 'Verificando contrato existente',
        mensagem: 'Validando se o contrato já está cadastrado',
      });

      // 1. Verificar se contrato já existe
      try {
        const contratoExistente = await this.contratosService.findByNumero(
          contratoApi.contratoNumero,
          orgaoId
        );
        
        if (contratoExistente) {
          resultado.contrato_id = contratoExistente.id;
          resultado.mensagem = `Contrato ${contratoApi.contratoNumero} já existe`;
          return resultado;
        }
      } catch {
        // Contrato não existe, continuar
      }

      // 2. Importar contrato base (fornecedor + contrato)
      onProgress?.({
        progresso: 25,
        etapa: 'Cadastrando contrato',
        mensagem: 'Criando fornecedor e contrato base no sistema',
      });
      await this.importarContratoIndividual(orgaoId, contratoApi);
      
      // Buscar contrato criado
      onProgress?.({
        progresso: 40,
        etapa: 'Buscando contrato criado',
        mensagem: 'Obtendo o contrato criado para vincular documentos e itens',
      });
      const contratoCriado = await this.contratosService.findByNumero(
        contratoApi.contratoNumero.replace('-Contrato', ''),
        orgaoId
      );
      
      if (!contratoCriado) {
        throw new Error('Contrato não foi criado');
      }
      
      resultado.contrato_id = contratoCriado.id;
      resultado.mensagem = `Contrato ${contratoApi.contratoNumero} importado com sucesso`;

      // 3. Baixar PDF se tiver URL
      if (contratoApi.url) {
        try {
          onProgress?.({
            progresso: 55,
            etapa: 'Baixando PDF',
            mensagem: 'Baixando PDF do contrato no Portal da Transparência',
          });
          const pdfBuffer = await this.baixarPdfContrato(contratoApi.url);
          resultado.pdf_baixado = true;
          this.logger.log(`PDF baixado: ${pdfBuffer.length} bytes`);

          // 3.1 Salvar PDF em documentos do contrato
          try {
            onProgress?.({
              progresso: 65,
              etapa: 'Salvando PDF',
              mensagem: 'Salvando PDF nos documentos do contrato',
            });
            await this.salvarPdfDocumento(contratoCriado.id, pdfBuffer, contratoApi.contratoNumero);
            this.logger.log(`PDF salvo em documentos do contrato ${contratoApi.contratoNumero}`);
          } catch (docError) {
            this.logger.warn(`Erro ao salvar PDF em documentos: ${docError.message}`);
          }

          // 4. Extrair itens do PDF
          onProgress?.({
            progresso: 75,
            etapa: 'IA analisando PDF',
            mensagem: 'Agente de IA está lendo o PDF e extraindo os itens do contrato',
          });
          const itens = await this.extrairItensDoPdf(pdfBuffer, contratoApi.contratoNumero);
          
          if (itens.length > 0) {
            resultado.itens_extraidos = true;
            
            // 5. Criar itens no cronograma
            onProgress?.({
              progresso: 85,
              etapa: 'Cadastrando itens',
              mensagem: `Cadastrando ${itens.length} itens extraídos no contrato`,
            });

            for (let i = 0; i < itens.length; i++) {
              const item = itens[i];
              try {
                await this.medicaoService.criarItemCronograma(contratoCriado.id, {
                  descricao: item.descricao,
                  unidade_medida: item.unidade_medida,
                  quantidade: item.quantidade,
                  valor_unitario: item.valor_unitario,
                  quantidade_meses: item.quantidade_meses || null,
                } as any);
                resultado.itens_criados++;
                onProgress?.({
                  progresso: Math.min(98, 85 + Math.round(((i + 1) / itens.length) * 13)),
                  etapa: 'Cadastrando itens',
                  mensagem: `Cadastrando item ${i + 1} de ${itens.length}`,
                  contrato_id: contratoCriado.id,
                  itens_criados: resultado.itens_criados,
                });
              } catch (err) {
                this.logger.warn(`Erro ao criar item "${item.descricao}": ${err.message}`);
              }
            }
            
            resultado.mensagem += ` + ${resultado.itens_criados} itens extraídos do PDF`;
          } else {
            resultado.mensagem += ' (sem itens no PDF)';
          }
        } catch (pdfError) {
          this.logger.warn(`PDF não processado: ${pdfError.message}`);
          resultado.mensagem += ' (PDF não disponível)';
        }
      } else {
        resultado.mensagem += ' (sem URL de PDF)';
      }

      onProgress?.({
        progresso: 99,
        etapa: 'Finalizando',
        mensagem: 'Finalizando importação e preparando redirecionamento',
        contrato_id: resultado.contrato_id,
        itens_criados: resultado.itens_criados,
      });

      return resultado;
    } catch (error) {
      this.logger.error(`Erro na importação completa: ${error.message}`);
      resultado.mensagem = `Erro: ${error.message}`;
      throw error;
    }
  }

  /**
   * Salva o PDF baixado em documentos do contrato (arquivo físico + registro no banco)
   */
  private async salvarPdfDocumento(
    contratoId: string,
    pdfBuffer: Buffer,
    contratoNumero: string
  ): Promise<DocumentoContrato> {
    try {
      const fs = require('fs');
      const path = require('path');
      
      // Criar diretório de upload para o contrato
      const uploadPath = path.join(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'), 'contratos', contratoId);
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }

      // Gerar nome único para o arquivo
      const timestamp = Date.now();
      const nomeArquivo = `extrato_portal_${timestamp}.pdf`;
      const caminhoCompleto = path.join(uploadPath, nomeArquivo);

      // Salvar arquivo físico
      fs.writeFileSync(caminhoCompleto, pdfBuffer);
      this.logger.log(`PDF salvo em: ${caminhoCompleto}`);

      // Criar registro no banco de dados
      const documento = this.documentoContratoRepository.create({
        contrato_id: contratoId,
        tipo: TipoDocumentoContrato.EXTRATO,
        titulo: `Extrato do Portal da Transparência - ${contratoNumero}`,
        descricao: 'Documento importado automaticamente do Portal da Transparência',
        nome_arquivo: nomeArquivo,
        nome_original: `${contratoNumero}.pdf`,
        caminho_arquivo: caminhoCompleto,
        mime_type: 'application/pdf',
        tamanho_bytes: pdfBuffer.length,
      });

      const docSalvo = await this.documentoContratoRepository.save(documento);
      this.logger.log(`Registro do documento criado no banco: ${docSalvo.id}`);

      return docSalvo;
    } catch (error) {
      this.logger.error(`Erro ao salvar PDF em documentos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Converte data no formato brasileiro (DD/MM/YYYY) para Date
   */
  private parseDataBrasileira(dataStr: string): Date {
    if (!dataStr) return new Date();
    
    const partes = dataStr.split('/');
    if (partes.length === 3) {
      const dia = parseInt(partes[0], 10);
      const mes = parseInt(partes[1], 10) - 1; // Mês em JS é 0-11
      const ano = parseInt(partes[2], 10);
      return new Date(ano, mes, dia);
    }
    
    return new Date();
  }
}
