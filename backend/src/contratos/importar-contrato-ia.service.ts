import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IaService } from '../ia/ia.service';
import { ContratosService } from './contratos.service';
import { MedicaoService } from './medicao.service';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { DadosExtradiosDto, ConfirmarImportacaoDto, ItemExtraidoDto } from './dto/importar-ia.dto';
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

const SYSTEM_PROMPT_EXTRACAO = `Você é um especialista em licitações públicas brasileiras (Lei 14.133/2021 e 8.666/93).
Sua tarefa é extrair dados de um contrato administrativo público e retornar APENAS JSON válido, sem markdown, sem explicações, sem texto extra.

REGRAS CRÍTICAS — NUNCA INVENTE DADOS:
- Use SOMENTE informações explicitamente escritas no documento
- Se um campo não aparecer no documento, use null
- JAMAIS complete ou deduza valores não escritos
- CNPJ: extraia apenas os dígitos (14 números), sem pontuação
- Valores: use números decimais (ex: 324000.00), sem R$, sem pontos de milhar
- Datas: formato YYYY-MM-DD obrigatório
- Se não encontrar a data, use null (nunca invente)

REGRAS JSON — EXTREMAMENTE IMPORTANTE:
- Retorne APENAS o objeto JSON, sem texto antes ou depois
- O JSON deve ser 100% válido — use aspas duplas em todas as chaves e strings
- NUNCA quebre a estrutura do JSON — cada campo deve estar no lugar correto
- Array de itens deve ter objetos completos, um por item
- Cada objeto de item deve ter: descricao, unidade_medida, quantidade, valor_unitario, quantidade_meses, valor_total
- NUNCA repita campos dentro do mesmo objeto
- NUNCA deixe vírgulas soltas no final de objetos ou arrays
- Verifique se todas as chaves estão fechadas corretamente antes de retornar

COMO IDENTIFICAR OS CAMPOS:
- "objeto": trecho que começa com "tem por objeto" ou "cujo objeto é" ou "objeto:" no contrato
- "fornecedor_cnpj": CNPJ da empresa contratada (não do órgão contratante)
- "fornecedor_razao_social": razão social da empresa contratada
- "valor_global": valor total do contrato (soma de todos os meses/parcelas)
- "valor_inicial": mesmo que valor_global se não especificado separadamente
- "tipo": analise o cabeçalho do documento (CONTRATO, NOTA_EMPENHO, ORDEM_SERVICO, ORDEM_FORNECIMENTO, CARTA_CONTRATO, TERMO_ADESAO, ATA_REGISTRO_PRECO)
- "categoria": COMPRAS=produtos físicos, SERVICOS=serviços gerais, OBRAS=construção, SERVICOS_ENGENHARIA=eng, LOCACAO=aluguel/locação, ALIENACAO=venda
- Para software, licença, implantação, suporte técnico, automação e locação de sistema, escolha SERVICOS
- "modalidade_execucao": use SOMENTE ITEM_QUANTIDADE ou MEDICAO
- Se a categoria for SERVICOS, a modalidade_execucao deve ser MEDICAO
- Use MEDICAO para serviços em geral, inclusive software, licença, implantação, locação de sistema, suporte e mensalidade
- Dentro de MEDICAO: obra/engenharia normalmente usa etapas; demais serviços usam itens
- Use ITEM_QUANTIDADE apenas para COMPRAS de produtos físicos
- "numero_processo": número do processo licitatório (ex: 027/2023, Pregão 010/2023)
- "amparo_legal": lei citada no contrato (ex: Lei 14.133/2021, Lei 8.666/93)
- "itens": array de objetos, cada um representando um item do contrato

IMPORTANTE SOBRE ITENS:
- Na "descricao" de cada item, INCLUA a localização/destino quando disponível no documento
- A localização geralmente aparece em uma coluna separada na tabela de itens
- Concatene a localização à descrição: "Persiana rolo... - Gabinete Presidente"

Schema de retorno (JSON puro e válido):
{
  "objeto": "texto exato do objeto do contrato",
  "fornecedor_cnpj": "somente digitos sem pontuacao ou null",
  "fornecedor_razao_social": "nome completo ou null",
  "tipo": "CONTRATO",
  "categoria": "SERVICOS",
  "modalidade_execucao": "ITEM_QUANTIDADE",
  "valor_inicial": 27499.24,
  "valor_global": 27499.24,
  "data_assinatura": "2025-12-22",
  "data_vigencia_inicio": "2025-12-22",
  "data_vigencia_fim": "2026-03-22",
  "prazo_vigencia_meses": 3,
  "numero_processo": "105/2025",
  "amparo_legal": "Lei 14.133/2021",
  "itens": [
    {
      "descricao": "Persiana rolo... - Salão Defensoria",
      "unidade_medida": "M2",
      "quantidade": 6.00,
      "valor_unitario": 114.10,
      "quantidade_meses": null,
      "valor_total": 684.60
    }
  ],
  "pendencias": []
}`;

function corrigirJsonMalformado(jsonString: string): string {
  // Remove texto antes do primeiro { e depois do último }
  const inicio = jsonString.indexOf('{');
  const fim = jsonString.lastIndexOf('}');
  if (inicio === -1 || fim === -1) return jsonString;
  
  let json = jsonString.substring(inicio, fim + 1);
  
  // Remove campos com valor null (descricao: null, etc)
  json = json.replace(/"\w+":\s*null\s*,?/g, '');
  
  // Corrige campos fora de ordem - move campos soltos para dentro de objetos
  // Padrão: } "campo": valor { vira } {
  json = json.replace(/\}\s*"([^"]+)":\s*([^,\{\}]+)\s*,?\s*\{/g, '}, {');
  json = json.replace(/\}\s*"([^"]+)":\s*([^,\{\}]+)\s*\{/g, '}, {');
  
  // Corrige múltiplos valores para o mesmo campo em um objeto (mantém o primeiro)
  json = json.replace(/("\w+":\s*[^,\{\}]+)\s*,\s*"\w+":\s*[^,\{\}]+\s*,?/g, '$1,');
  
  // Corrige campos duplicados (mantém o primeiro valor)
  json = json.replace(/("\w+":\s*[^,\{\}]+)(\s*,\s*\1)+/g, '$1');
  
  // Corrige vírgulas no final de objetos e arrays
  json = json.replace(/,\s*\}/g, '}').replace(/,\s*\]/g, ']');
  
  // Corrige vírgulas duplas
  json = json.replace(/,\s*,/g, ',');
  
  // Remove objetos vazios {}
  json = json.replace(/\{\s*\}/g, '');
  
  // Remove vírgulas antes do fechamento do array
  json = json.replace(/,\s*\]/g, ']');
  
  return json;
}

function tentarExtrairJson(str: string): any | null {
  // Tentar parse direto primeiro
  try {
    return JSON.parse(str);
  } catch { /* continuar */ }
  
  // Tentar corrigir e parsear
  const corrigido = corrigirJsonMalformado(str);
  try {
    return JSON.parse(corrigido);
  } catch { /* continuar */ }
  
  // Extração manual campo por campo para JSON extremamente quebrado
  try {
    const resultado: any = { itens: [] };
    
    // Extrai campos string do contrato (todos os valores entre aspas)
    const stringFields = ['objeto', 'fornecedor_cnpj', 'fornecedor_razao_social', 'tipo', 'categoria', 
                    'modalidade_execucao', 'data_assinatura', 'data_vigencia_inicio', 
                    'data_vigencia_fim', 'numero_processo', 'amparo_legal', 'fiscal_nome', 'fiscal_portaria'];
    
    for (const campo of stringFields) {
      // Pega a primeira ocorrência válida
      const regex = new RegExp(`"${campo}":\\s*"([^"]{3,500})"`, 'i');
      const match = str.match(regex);
      if (match && match[1].trim().length > 2) {
        resultado[campo] = match[1].trim();
      }
    }
    
    // Extrai campos numéricos
    const numFields = ['valor_inicial', 'valor_global'];
    for (const campo of numFields) {
      const regex = new RegExp(`"${campo}":\\s*([\\d.]+)`, 'gi');
      const matches = [...str.matchAll(regex)];
      if (matches.length > 0) {
        // Pega o maior valor (geralmente o correto)
        const valores = matches.map(m => parseFloat(m[1]));
        resultado[campo] = Math.max(...valores);
      }
    }
    
    // ESTRATÉGIA 1: Extrai itens por descrição
    const descRegex = /"descricao":\s*"([^"]*)"/gi;
    const itensEncontrados = new Map<string, any>();
    
    let match;
    while ((match = descRegex.exec(str)) !== null) {
      const descricao = match[1].trim();
      
      // Para cada descrição (mesmo vazia), busca campos próximos
      const posicao = match.index;
      const contexto = str.substring(posicao, posicao + 500);
      
      const item: any = {
        descricao: descricao || 'Item sem descrição',
        unidade_medida: 'UNIDADE',
        quantidade: 1,
        valor_unitario: 0,
        quantidade_meses: null,
        valor_total: 0
      };
      
      // Extrai quantidade
      const qtdMatch = contexto.match(/"quantidade":\s*([\d.]+|null)/);
      if (qtdMatch && qtdMatch[1] !== 'null') {
        item.quantidade = parseFloat(qtdMatch[1]);
      }
      
      // Extrai valor unitário
      const unitMatch = contexto.match(/"valor_unitario":\s*([\d.]+|null)/);
      if (unitMatch && unitMatch[1] !== 'null') {
        item.valor_unitario = parseFloat(unitMatch[1]);
      }
      
      // Extrai valor total
      const totalMatch = contexto.match(/"valor_total":\s*([\d.]+)/);
      if (totalMatch) {
        item.valor_total = parseFloat(totalMatch[1]);
      } else if (item.quantidade && item.valor_unitario) {
        item.valor_total = item.quantidade * item.valor_unitario;
      }
      
      // Extrai unidade
      const unidMatch = contexto.match(/"unidade_medida":\s*"([^"]+)"/);
      if (unidMatch) {
        item.unidade_medida = unidMatch[1];
      }
      
      // Extrai quantidade_meses
      const mesesMatch = contexto.match(/"quantidade_meses":\s*(\d+|null)/);
      if (mesesMatch && mesesMatch[1] !== 'null') {
        item.quantidade_meses = parseInt(mesesMatch[1]);
      }
      
      // Só adiciona se tiver valor_total ou (quantidade e valor_unitario)
      if (item.valor_total > 0 || (item.quantidade > 0 && item.valor_unitario > 0)) {
        // Chave única: descrição + quantidade + valor
        const chave = `${item.descricao}|${item.quantidade}|${item.valor_total}`;
        if (!itensEncontrados.has(chave)) {
          itensEncontrados.set(chave, item);
        }
      }
    }
    
    resultado.itens = Array.from(itensEncontrados.values());
    
    if (resultado.itens.length > 0 || resultado.objeto) {
      return resultado;
    }
  } catch (e) {
    console.error('Erro na extração manual:', e);
  }
  
  return null;
}

function normalizarCategoriaContrato(categoria: any, objeto?: string): string {
  const categoriaTexto = String(categoria || '').trim().toUpperCase();
  const objetoTexto = String(objeto || '').toLowerCase();

  if (['COMPRAS', 'SERVICOS', 'OBRAS', 'SERVICOS_ENGENHARIA', 'LOCACAO', 'ALIENACAO'].includes(categoriaTexto)) {
    if (categoriaTexto === 'COMPRAS' && /(software|sistema|licen[cç]a|implanta[cç][aã]o|loca[cç][aã]o|suporte t[eé]cnico|manuten[cç][aã]o|automa[cç][aã]o|intelig[eê]ncia artificial|m[oó]dulo|api|mos)/i.test(objetoTexto)) {
      return 'SERVICOS';
    }

    if (categoriaTexto === 'LOCACAO' && /(software|sistema|licen[cç]a|m[oó]dulo|api|mos)/i.test(objetoTexto)) {
      return 'SERVICOS';
    }

    return categoriaTexto;
  }

  if (/(obra|reforma|amplia[cç][aã]o|constru[cç][aã]o)/i.test(objetoTexto)) {
    return 'OBRAS';
  }

  if (/(engenharia|projeto executivo|projeto b[aá]sico|servi[cç]os? de engenharia)/i.test(objetoTexto)) {
    return 'SERVICOS_ENGENHARIA';
  }

  if (/(software|sistema|licen[cç]a|implanta[cç][aã]o|loca[cç][aã]o|suporte t[eé]cnico|manuten[cç][aã]o|automa[cç][aã]o|intelig[eê]ncia artificial|m[oó]dulo|api|mos)/i.test(objetoTexto)) {
    return 'SERVICOS';
  }

  return 'SERVICOS';
}

function normalizarModalidadeExecucao(modalidade: any, categoria: string): string {
  const modalidadeTexto = String(modalidade || '').trim().toUpperCase();

  if (categoria === 'SERVICOS' || categoria === 'OBRAS' || categoria === 'SERVICOS_ENGENHARIA') {
    return 'MEDICAO';
  }

  if (categoria === 'COMPRAS') {
    return 'ITEM_QUANTIDADE';
  }

  if (modalidadeTexto === 'MEDICAO') {
    return 'MEDICAO';
  }

  return 'ITEM_QUANTIDADE';
}

@Injectable()
export class ImportarContratoIaService {
  private readonly logger = new Logger(ImportarContratoIaService.name);

  constructor(
    private readonly iaService: IaService,
    private readonly contratosService: ContratosService,
    private readonly medicaoService: MedicaoService,
    @InjectRepository(Fornecedor)
    private readonly fornecedorRepo: Repository<Fornecedor>,
  ) {}

  async extrairDadosContrato(file: Express.Multer.File, orgaoId: string): Promise<DadosExtradiosDto> {
    this.logger.log(`Extraindo dados de contrato: ${file.originalname} (${file.mimetype})`);

    let respostaIA: string;

    try {
      if (file.mimetype === 'application/pdf') {
        const textoExtraido = await extrairTextoPdf(file.buffer);
        this.logger.log(`pdf texto extraido: ${textoExtraido.length} chars`);

        if (textoExtraido.trim().length >= 200) {
          respostaIA = await this.iaService.chatComArquivo(SYSTEM_PROMPT_EXTRACAO, undefined, undefined, textoExtraido);
        } else {
          this.logger.log('PDF escaneado detectado: tentando fallback via imagens (pdftoppm) + Vision');
          try {
            respostaIA = await this.iaService.chatComPdfEscaneado(
              SYSTEM_PROMPT_EXTRACAO,
              file.buffer,
              'Extraia TODOS os dados do contrato nestas páginas, incluindo itens, valores, datas e demais campos.',
            );
          } catch (visionErr: any) {
            throw new BadRequestException(
              'Este PDF parece ser escaneado (sem texto digital). ' +
              'O sistema tentou converter para imagens mas falhou. ' +
              'Tire uma foto/screenshot do contrato e envie como imagem JPG ou PNG.',
            );
          }
        }
      } else {
        const imagemBase64 = file.buffer.toString('base64');
        respostaIA = await this.iaService.chatComArquivo(SYSTEM_PROMPT_EXTRACAO, imagemBase64, file.mimetype);
      }
    } catch (error: any) {
      this.logger.error(`Falha ao consultar IA na importação de contrato: ${error?.message || error}`);
      throw new BadRequestException('A IA de importação de contratos está indisponível ou retornou uma resposta inválida. Tente novamente em instantes.');
    }

    let dadosExtraidos: any;
    try {
      const jsonLimpo = respostaIA.replace(/```json\n?|```/g, '').trim();
      
      // Tentar parse direto primeiro
      try {
        dadosExtraidos = JSON.parse(jsonLimpo);
      } catch {
        // Tentar correção automática
        this.logger.log('Tentando corrigir JSON malformado...');
        dadosExtraidos = tentarExtrairJson(jsonLimpo);
        
        if (!dadosExtraidos) {
          this.logger.error('Resposta IA não é JSON válido:', respostaIA.substring(0, 2000));
          throw new BadRequestException('A IA não conseguiu extrair dados estruturados do documento. Tente com uma imagem mais nítida.');
        }
        
        this.logger.log(`JSON corrigido: ${dadosExtraidos.itens?.length || 0} itens extraídos`);
      }
    } catch (error) {
      this.logger.error('Erro ao processar resposta da IA:', error);
      throw new BadRequestException('A IA não conseguiu extrair dados estruturados do documento. Tente com uma imagem mais nítida.');
    }

    const cnpjRaw = dadosExtraidos.fornecedor_cnpj;
    const fornecedor_cnpj = cnpjRaw != null
      ? String(cnpjRaw).replace(/\D/g, '') || null
      : null;
    let fornecedor_id: string | undefined;
    let fornecedor_ja_cadastrado = false;

    if (fornecedor_cnpj) {
      try {
        const fornecedor = await this.fornecedorRepo.findOne({ where: { cpf_cnpj: fornecedor_cnpj } });
        if (fornecedor) {
          fornecedor_id = fornecedor.id;
          fornecedor_ja_cadastrado = true;
        }
      } catch (dbErr: any) {
        this.logger.warn(`[extrairDadosContrato] Erro ao buscar fornecedor por CNPJ ${fornecedor_cnpj}: ${dbErr?.message}`);
      }
    }

    const categoriaNormalizada = normalizarCategoriaContrato(dadosExtraidos.categoria, dadosExtraidos.objeto);
    const modalidadeNormalizada = normalizarModalidadeExecucao(dadosExtraidos.modalidade_execucao, categoriaNormalizada);

    return {
      objeto: dadosExtraidos.objeto || '',
      fornecedor_cnpj,
      fornecedor_razao_social: dadosExtraidos.fornecedor_razao_social || '',
      fornecedor_id,
      fornecedor_ja_cadastrado,
      tipo: dadosExtraidos.tipo || 'CONTRATO',
      categoria: categoriaNormalizada,
      modalidade_execucao: modalidadeNormalizada,
      valor_inicial: Number(dadosExtraidos.valor_inicial) || 0,
      valor_global: Number(dadosExtraidos.valor_global) || 0,
      data_assinatura: dadosExtraidos.data_assinatura || undefined,
      data_vigencia_inicio: dadosExtraidos.data_vigencia_inicio || undefined,
      data_vigencia_fim: dadosExtraidos.data_vigencia_fim || undefined,
      prazo_vigencia_meses: dadosExtraidos.prazo_vigencia_meses || undefined,
      numero_processo: dadosExtraidos.numero_processo || undefined,
      amparo_legal: dadosExtraidos.amparo_legal || undefined,
      itens: Array.isArray(dadosExtraidos.itens) ? dadosExtraidos.itens : [],
      pendencias: Array.isArray(dadosExtraidos.pendencias) ? dadosExtraidos.pendencias : [],
    };
  }

  async confirmarImportacao(
    dados: ConfirmarImportacaoDto,
    orgaoId: string,
  ): Promise<{ contrato_id: string; numero_contrato: string; itens_criados: number; aviso?: string }> {
    const categoriaNormalizada = normalizarCategoriaContrato(dados.categoria, dados.objeto);
    const modalidadeNormalizada = normalizarModalidadeExecucao(dados.modalidade_execucao, categoriaNormalizada);
    let fornecedorId = dados.fornecedor_id;

    if (!fornecedorId && dados.fornecedor_cnpj) {
      const cnpj = dados.fornecedor_cnpj.replace(/\D/g, '');
      let fornecedor: Fornecedor | null = await this.fornecedorRepo.findOne({ where: { cpf_cnpj: cnpj } });

      if (!fornecedor) {
        this.logger.log(`Criando fornecedor placeholder para CNPJ ${cnpj}`);
        const novo = this.fornecedorRepo.create({
          cpf_cnpj: cnpj,
          razao_social: dados.fornecedor_razao_social || 'A PREENCHER',
          nome_fantasia: dados.fornecedor_razao_social || 'A PREENCHER',
          logradouro: 'A PREENCHER',
          numero: '0',
          bairro: 'A PREENCHER',
          cidade: 'A PREENCHER',
          uf: 'XX',
          cep: '00000000',
          telefone: '00000000000',
          email: `${cnpj}@apreencher.com`,
          ativo: false,
        } as any);
        fornecedor = await this.fornecedorRepo.save(novo as any) as unknown as Fornecedor;
      }

      fornecedorId = fornecedor!.id;
    }

    if (!fornecedorId) {
      throw new BadRequestException('Fornecedor não identificado. Informe o CNPJ para continuar.');
    }

    const contrato = await this.contratosService.criar({
      orgao_id: orgaoId,
      fornecedor_id: fornecedorId,
      objeto: dados.objeto,
      tipo: dados.tipo as any,
      categoria: categoriaNormalizada as any,
      modalidade_execucao: modalidadeNormalizada as any,
      valor_inicial: dados.valor_inicial,
      valor_global: dados.valor_global,
      data_assinatura: dados.data_assinatura ? new Date(dados.data_assinatura) : undefined,
      data_vigencia_inicio: dados.data_vigencia_inicio ? new Date(dados.data_vigencia_inicio) : undefined,
      data_vigencia_fim: dados.data_vigencia_fim ? new Date(dados.data_vigencia_fim) : undefined,
      prazo_vigencia_meses: dados.prazo_vigencia_meses,
      numero_processo: dados.numero_processo,
      amparo_legal: dados.amparo_legal,
    } as any);

    const modalidade = modalidadeNormalizada;
    let itensCriados = 0;
    let aviso: string | undefined;

    if (dados.modalidade_execucao !== modalidade) {
      aviso = `Modalidade "${dados.modalidade_execucao}" foi padronizada automaticamente para "${modalidade}".`;
    }

    if ((modalidade === 'MEDICAO' || modalidade === 'ITEM_QUANTIDADE') && dados.itens?.length > 0) {
      for (const item of dados.itens) {
        try {
          if (modalidade === 'MEDICAO') {
            await this.medicaoService.criarItemCronograma(contrato.id, {
              descricao: item.descricao,
              unidade_medida: item.unidade_medida,
              quantidade: item.quantidade,
              valor_unitario: item.valor_unitario,
              quantidade_meses: item.quantidade_meses || null,
            } as any);
            itensCriados++;
          }
        } catch (err) {
          this.logger.warn(`Erro ao criar item "${item.descricao}": ${err.message}`);
        }
      }
    }

    return { contrato_id: contrato.id, numero_contrato: contrato.numero_contrato, itens_criados: itensCriados, aviso };
  }
}
