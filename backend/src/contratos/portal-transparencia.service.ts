import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ContratosService } from './contratos.service';
import { IaService } from '../ia/ia.service';
import { MedicaoService } from './medicao.service';
import { FornecedoresService } from '../fornecedores/fornecedores.service';

// Extração robusta usando pdfjs-dist (Mozilla PDF.js) com fallback para pdf-parse
async function extrairTextoPdf(buffer: Buffer): Promise<string> {
  // Tentativa 1: pdfjs-dist (mais robusto, suporta PDFs complexos)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
    const pdfDoc = await loadingTask.promise;
    let text = '';
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item: any) => item.str || '').join(' ');
      text += pageText + '\n';
    }
    if (text.trim().length > 0) return text;
  } catch (e: any) {
    // fallback para pdf-parse
  }

  // Tentativa 2: pdf-parse
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('pdf-parse');
    const fn = typeof mod === 'function' ? mod : (mod.default ?? null);
    if (fn) {
      const result = await fn(buffer);
      if (result?.text?.trim().length > 0) return result.text;
    }
  } catch { /* ignora */ }

  return '';
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

@Injectable()
export class PortalTransparenciaService {
  private readonly logger = new Logger(PortalTransparenciaService.name);
  private readonly baseUrl = 'https://portaldatransparencia.cmlem.ba.gov.br/api';

  constructor(
    private readonly httpService: HttpService,
    private readonly contratosService: ContratosService,
    private readonly fornecedoresService: FornecedoresService,
    private readonly iaService: IaService,
    private readonly medicaoService: MedicaoService,
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
   * Importa um contrato individual
   */
  private async importarContratoIndividual(
    orgaoId: string,
    contratoApi: PortalTransparenciaContrato
  ): Promise<void> {
    // Limpar CNPJ (remover formatação)
    const cnpjLimpo = contratoApi.documento.replace(/\D/g, '');
    
    // Buscar ou criar fornecedor usando métodos existentes
    let fornecedor;
    try {
      const verificacao = await this.fornecedoresService.verificarCnpjExistente(cnpjLimpo);
      if (verificacao.existe && verificacao.fornecedor) {
        fornecedor = verificacao.fornecedor;
      }
    } catch (e) {
      // Fornecedor não existe
    }
    
    if (!fornecedor) {
      this.logger.log(`Criando fornecedor: ${contratoApi.favorecido} - ${cnpjLimpo}`);
      // Usar cadastro rápido que já existe no sistema
      fornecedor = await this.fornecedoresService.cadastroRapidoOrgao(
        cnpjLimpo,
        contratoApi.favorecido
      );
    }

    // Converter vigência para data
    const dataVigencia = this.parseDataBrasileira(contratoApi.vigencia);
    
    // Converter valor - usar aditivos_valor_total se existir, senão valor_contrato
    let valorGlobal = 0;
    if (contratoApi.aditivos_valor_total) {
      valorGlobal = parseFloat(contratoApi.aditivos_valor_total) || 0;
    } else if (contratoApi.valor_contrato) {
      // Remover 'R$' e converter formato brasileiro (1.234,56 -> 1234.56)
      const valorLimpo = contratoApi.valor_contrato
        .replace(/^R\$\s*/, '')
        .replace(/\./g, '')
        .replace(',', '.');
      valorGlobal = parseFloat(valorLimpo) || 0;
    }

    // Extrair ano e sequencial do número do contrato (ex: 001/2024-Contrato -> ano=2024, sequencial=1)
    const anoMatch = contratoApi.contratoNumero.match(/\/(\d{4})/);
    const ano = anoMatch ? parseInt(anoMatch[1]) : new Date().getFullYear();
    const sequencialMatch = contratoApi.contratoNumero.match(/^(\d{3})/);
    const sequencial = sequencialMatch ? parseInt(sequencialMatch[1]) : 1;

    // Criar contrato usando o método existente
    this.logger.log(`Criando contrato: ${contratoApi.contratoNumero}`);
    
    // Buscar se contrato já existe
    try {
      const contratoExistente = await this.contratosService.findByNumero(
        contratoApi.contratoNumero,
        orgaoId
      );
      
      if (contratoExistente) {
        this.logger.log(`Contrato ${contratoApi.contratoNumero} já existe, pulando...`);
        return;
      }
    } catch (e) {
      // Contrato não existe, continuar
    }

    // Criar DTO para o contrato
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

    await this.contratosService.criar(createDto);
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
      const textoExtraido = await extrairTextoPdf(pdfBuffer);
      
      if (textoExtraido.trim().length < 200) {
        this.logger.warn('Texto extraído muito curto, tentando extrair via IA Vision...');
        // PDF escaneado - usar IA com Vision
        return await this.extrairItensViaVision(pdfBuffer);
      }

      this.logger.log(`Texto extraído: ${textoExtraido.length} caracteres`);
      return await this.extrairItensViaTexto(textoExtraido);
    } catch (error) {
      this.logger.error(`Erro ao extrair itens do PDF: ${error.message}`);
      return [];
    }
  }

  /**
   * Extrai itens usando IA com Vision (para PDFs escaneados)
   */
  private async extrairItensViaVision(pdfBuffer: Buffer): Promise<Array<any>> {
    try {
      const pdfBase64 = pdfBuffer.toString('base64');
      
      const promptExtracaoItens = `Você é um especialista em extrair itens de contratos públicos brasileiros.
Analise este PDF de contrato e extraia a tabela de itens/serviços.

REGRAS:
- Extraia APENAS a lista de itens/serviços do contrato
- NUNCA invente dados - use apenas o que está no documento
- Cada item deve ter: descrição completa, unidade de medida, quantidade, valor unitário, valor total
- Para contratos de serviços, a unidade pode ser: UNIDADE, MESES, CONTRATO GLOBAL, etc.
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

      const jsonLimpo = respostaIA.replace(/```json\n?|```/g, '').trim();
      const dadosExtraidos = JSON.parse(jsonLimpo);
      
      if (!Array.isArray(dadosExtraidos.itens)) {
        this.logger.warn('IA não retornou lista de itens válida');
        return [];
      }

      this.logger.log(`Itens extraídos via Vision: ${dadosExtraidos.itens.length}`);
      return dadosExtraidos.itens;
    } catch (error) {
      this.logger.error(`Erro na extração via Vision: ${error.message}`);
      return [];
    }
  }

  /**
   * Extrai itens via texto extraído (para PDFs digitais)
   */
  private async extrairItensViaTexto(textoExtraido: string): Promise<Array<any>> {
    try {
      const promptExtracaoItens = `Você é um especialista em extrair itens de contratos públicos brasileiros.

REGRAS:
- Extraia APENAS a lista de itens do contrato
- NUNCA invente dados - use apenas o que está no documento
- Cada item deve ter: descrição, unidade de medida, quantidade, valor unitário
- Para contratos contínuos (mensais), use quantidade_meses
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

      const jsonLimpo = respostaIA.replace(/```json\n?|```/g, '').trim();
      const dadosExtraidos = JSON.parse(jsonLimpo);
      
      if (!Array.isArray(dadosExtraidos.itens)) {
        this.logger.warn('IA não retornou lista de itens válida');
        return [];
      }

      this.logger.log(`Itens extraídos via texto: ${dadosExtraidos.itens.length}`);
      return dadosExtraidos.itens;
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
    contratoApi: PortalTransparenciaContrato
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
      // 1. Verificar se contrato já existe
      try {
        const contratoExistente = await this.contratosService.findByNumero(
          orgaoId,
          contratoApi.contratoNumero
        );
        
        if (contratoExistente) {
          resultado.mensagem = `Contrato ${contratoApi.contratoNumero} já existe`;
          return resultado;
        }
      } catch {
        // Contrato não existe, continuar
      }

      // 2. Importar contrato base (fornecedor + contrato)
      await this.importarContratoIndividual(orgaoId, contratoApi);
      
      // Buscar contrato criado
      const contratoCriado = await this.contratosService.findByNumero(
        contratoApi.contratoNumero,
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
          const pdfBuffer = await this.baixarPdfContrato(contratoApi.url);
          resultado.pdf_baixado = true;
          this.logger.log(`PDF baixado: ${pdfBuffer.length} bytes`);

          // 3.1 Salvar PDF em documentos do contrato
          try {
            await this.salvarPdfDocumento(contratoCriado.id, pdfBuffer, contratoApi.contratoNumero);
            this.logger.log(`PDF salvo em documentos do contrato ${contratoApi.contratoNumero}`);
          } catch (docError) {
            this.logger.warn(`Erro ao salvar PDF em documentos: ${docError.message}`);
          }

          // 4. Extrair itens do PDF
          const itens = await this.extrairItensDoPdf(pdfBuffer, contratoApi.contratoNumero);
          
          if (itens.length > 0) {
            resultado.itens_extraidos = true;
            
            // 5. Criar itens no cronograma
            for (const item of itens) {
              try {
                await this.medicaoService.criarItemCronograma(contratoCriado.id, {
                  descricao: item.descricao,
                  unidade_medida: item.unidade_medida,
                  quantidade: item.quantidade,
                  valor_unitario: item.valor_unitario,
                  quantidade_meses: item.quantidade_meses || null,
                } as any);
                resultado.itens_criados++;
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

      return resultado;
    } catch (error) {
      this.logger.error(`Erro na importação completa: ${error.message}`);
      resultado.mensagem = `Erro: ${error.message}`;
      throw error;
    }
  }

  /**
   * Salva o PDF baixado em documentos do contrato
   */
  private async salvarPdfDocumento(
    contratoId: string,
    pdfBuffer: Buffer,
    contratoNumero: string
  ): Promise<void> {
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

      // Salvar arquivo
      fs.writeFileSync(caminhoCompleto, pdfBuffer);

      this.logger.log(`PDF salvo em: ${caminhoCompleto}`);
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
