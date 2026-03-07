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
- "modalidade_execucao": ITEM_QUANTIDADE=compra de itens, MEDICAO=por medição, CONTINUADO=serviço contínuo mensal, LICENCA=licença de software, ORDEM_SERVICO=por OS
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
  "categoria": "COMPRAS",
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

    if (file.mimetype === 'application/pdf') {
      const textoExtraido = await extrairTextoPdf(file.buffer);
      this.logger.log(`pdf texto extraido: ${textoExtraido.length} chars`);

      if (textoExtraido.trim().length >= 200) {
        // PDF digital com texto — envia apenas o texto (sem visão)
        respostaIA = await this.iaService.chatComArquivo(SYSTEM_PROMPT_EXTRACAO, undefined, undefined, textoExtraido);
      } else {
        // PDF escaneado sem texto — tenta via image_url base64
        this.logger.log('PDF escaneado: tentando via Vision base64');
        const pdfBase64 = file.buffer.toString('base64');
        try {
          respostaIA = await this.iaService.chatComArquivo(SYSTEM_PROMPT_EXTRACAO, pdfBase64, 'application/pdf');
        } catch (visionErr: any) {
          throw new BadRequestException(
            'Este PDF parece ser escaneado (sem texto digital). ' +
            'Tire uma foto/screenshot do contrato e envie como imagem JPG ou PNG.',
          );
        }
      }
    } else {
      const imagemBase64 = file.buffer.toString('base64');
      respostaIA = await this.iaService.chatComArquivo(SYSTEM_PROMPT_EXTRACAO, imagemBase64, file.mimetype);
    }

    let dadosExtraidos: any;
    try {
      const jsonLimpo = respostaIA.replace(/```json\n?|```/g, '').trim();
      dadosExtraidos = JSON.parse(jsonLimpo);
    } catch {
      this.logger.error('Resposta IA não é JSON válido:', respostaIA);
      throw new BadRequestException('A IA não conseguiu extrair dados estruturados do documento. Tente com uma imagem mais nítida.');
    }

    const fornecedor_cnpj = dadosExtraidos.fornecedor_cnpj?.replace(/\D/g, '') || null;
    let fornecedor_id: string | undefined;
    let fornecedor_ja_cadastrado = false;

    if (fornecedor_cnpj) {
      const fornecedor = await this.fornecedorRepo.findOne({ where: { cpf_cnpj: fornecedor_cnpj } });
      if (fornecedor) {
        fornecedor_id = fornecedor.id;
        fornecedor_ja_cadastrado = true;
      }
    }

    return {
      objeto: dadosExtraidos.objeto || '',
      fornecedor_cnpj,
      fornecedor_razao_social: dadosExtraidos.fornecedor_razao_social || '',
      fornecedor_id,
      fornecedor_ja_cadastrado,
      tipo: dadosExtraidos.tipo || 'CONTRATO',
      categoria: dadosExtraidos.categoria || 'SERVICOS',
      modalidade_execucao: dadosExtraidos.modalidade_execucao || 'ITEM_QUANTIDADE',
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
      categoria: dados.categoria as any,
      modalidade_execucao: dados.modalidade_execucao as any,
      valor_inicial: dados.valor_inicial,
      valor_global: dados.valor_global,
      data_assinatura: dados.data_assinatura ? new Date(dados.data_assinatura) : undefined,
      data_vigencia_inicio: dados.data_vigencia_inicio ? new Date(dados.data_vigencia_inicio) : undefined,
      data_vigencia_fim: dados.data_vigencia_fim ? new Date(dados.data_vigencia_fim) : undefined,
      prazo_vigencia_meses: dados.prazo_vigencia_meses,
      numero_processo: dados.numero_processo,
      amparo_legal: dados.amparo_legal,
    } as any);

    const modalidade = dados.modalidade_execucao;
    let itensCriados = 0;
    let aviso: string | undefined;

    if (modalidade === 'CONTINUADO' || modalidade === 'LICENCA') {
      aviso = 'Modalidade contínua/licença: itens de medição serão cadastrados conforme execução do contrato.';
    } else if ((modalidade === 'MEDICAO' || modalidade === 'ITEM_QUANTIDADE' || modalidade === 'ORDEM_SERVICO') && dados.itens?.length > 0) {
      for (const item of dados.itens) {
        try {
          await this.medicaoService.criarItemCronograma(contrato.id, {
            descricao: item.descricao,
            unidade_medida: item.unidade_medida,
            quantidade: item.quantidade,
            valor_unitario: item.valor_unitario,
            quantidade_meses: item.quantidade_meses || null,
          } as any);
          itensCriados++;
        } catch (err) {
          this.logger.warn(`Erro ao criar item "${item.descricao}": ${err.message}`);
        }
      }
    }

    return { contrato_id: contrato.id, numero_contrato: contrato.numero_contrato, itens_criados: itensCriados, aviso };
  }
}
