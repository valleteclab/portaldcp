import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { IaService } from '../ia/ia.service';
import { MedicaoService } from './medicao.service';
import { Contrato } from './entities/contrato.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { DadosExtraidosMedicaoDto, ConfirmarImportacaoMedicaoDto } from './dto/importar-medicao-ia.dto';

async function extrairTextoPdf(buffer: Buffer): Promise<string> {
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
  } catch { /* fallback */ }

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

const SYSTEM_PROMPT_MEDICAO = `Você é um especialista em contratos administrativos públicos brasileiros.
Sua tarefa é extrair dados de uma PLANILHA DE MEDIÇÃO ou RELATÓRIO DE ATIVIDADES de um contrato e retornar APENAS JSON válido, sem markdown, sem explicações.

REGRAS CRÍTICAS:
- Use SOMENTE informações explicitamente escritas no documento
- Se um campo não aparecer, use null
- JAMAIS invente ou deduza valores não escritos
- CNPJ: somente dígitos (14 números), sem pontuação
- Valores monetários: use números decimais (ex: 36598.50), sem R$, sem pontos de milhar
- Datas: formato YYYY-MM-DD

COMO IDENTIFICAR OS CAMPOS:
- "numero_contrato": número do contrato referenciado (ex: "025A/2023", "025A/2023 AD 02" → use "025A/2023")
- "fornecedor_cnpj": CNPJ do EXECUTOR/empresa contratada (não do órgão)
- "fornecedor_razao_social": razão social do EXECUTOR
- "objeto": descrição completa do serviço/produto contratado (campo "OBJETO DO CONTRATO" ou descrição do item)
- "valor_global": valor total do contrato (não da nota fiscal - é o valor da coluna "VALOR TOTAL" do item)
- "valor_nota_fiscal": valor da nota fiscal deste período (campo "VALOR TOTAL DA NOTA FISCAL")
- "valor_executado_ate_periodo": valor acumulado executado até este período (coluna "ATÉ O PERÍODO" da execução financeira)
- "fiscal_nome": nome do fiscal do contrato (quem assina como fiscal/gestor)
- "fiscal_portaria": portaria de nomeação do fiscal (ex: "PORTARIA Nº 102 DE 13 DE JANEIRO DE 2025")
- "itens": lista de itens do contrato com seus dados de quantidade e valor

Schema JSON de retorno:
{
  "numero_contrato": "025A/2023",
  "fornecedor_cnpj": "15130181000148",
  "fornecedor_razao_social": "VALLETECLAB EMPREENDIMENTOS LTDA",
  "objeto": "descrição completa do objeto contratado",
  "valor_global": 439182.00,
  "valor_nota_fiscal": 36598.50,
  "valor_executado_ate_periodo": 417222.90,
  "fiscal_nome": "TELMA DE SOUZA",
  "fiscal_portaria": "PORTARIA Nº 102 DE 13 DE JANEIRO DE 2025",
  "itens": [
    {
      "descricao": "descrição completa do item",
      "unidade_medida": "MÊS",
      "quantidade": 12,
      "valor_unitario": 36598.50,
      "quantidade_meses": 12,
      "valor_total": 439182.00
    }
  ],
  "pendencias": ["campos obrigatórios não encontrados"]
}`;

@Injectable()
export class ImportarMedicaoIaService {
  private readonly logger = new Logger(ImportarMedicaoIaService.name);

  constructor(
    private readonly iaService: IaService,
    private readonly medicaoService: MedicaoService,
    @InjectRepository(Contrato)
    private readonly contratoRepo: Repository<Contrato>,
    @InjectRepository(Fornecedor)
    private readonly fornecedorRepo: Repository<Fornecedor>,
  ) {}

  async extrairDadosMedicao(file: Express.Multer.File, orgaoId: string): Promise<DadosExtraidosMedicaoDto> {
    this.logger.log(`Extraindo dados de planilha de medição: ${file.originalname}`);

    let respostaIA: string;

    if (file.mimetype === 'application/pdf') {
      const textoExtraido = await extrairTextoPdf(file.buffer);
      this.logger.log(`Texto extraído do PDF: ${textoExtraido.length} chars`);

      if (textoExtraido.trim().length >= 100) {
        respostaIA = await this.iaService.chatComArquivo(SYSTEM_PROMPT_MEDICAO, undefined, undefined, textoExtraido);
      } else {
        const pdfBase64 = file.buffer.toString('base64');
        try {
          respostaIA = await this.iaService.chatComArquivo(SYSTEM_PROMPT_MEDICAO, pdfBase64, 'application/pdf');
        } catch {
          throw new BadRequestException(
            'PDF escaneado sem texto digital. Tire uma foto/screenshot e envie como imagem JPG ou PNG.',
          );
        }
      }
    } else {
      const imagemBase64 = file.buffer.toString('base64');
      respostaIA = await this.iaService.chatComArquivo(SYSTEM_PROMPT_MEDICAO, imagemBase64, file.mimetype);
    }

    let extraido: any;
    try {
      const jsonLimpo = respostaIA.replace(/```json\n?|```/g, '').trim();
      extraido = JSON.parse(jsonLimpo);
    } catch {
      this.logger.error('Resposta IA não é JSON válido:', respostaIA);
      throw new BadRequestException('A IA não conseguiu extrair dados estruturados. Tente com uma imagem mais nítida.');
    }

    // Buscar fornecedor pelo CNPJ
    const fornecedor_cnpj = extraido.fornecedor_cnpj?.replace(/\D/g, '') || null;
    let fornecedor_id: string | undefined;
    let fornecedor_ja_cadastrado = false;

    if (fornecedor_cnpj) {
      const fornecedor = await this.fornecedorRepo.findOne({ where: { cpf_cnpj: fornecedor_cnpj } });
      if (fornecedor) {
        fornecedor_id = fornecedor.id;
        fornecedor_ja_cadastrado = true;
      }
    }

    // Buscar contrato pelo número (dentro do mesmo órgão)
    let contrato_id: string | undefined;
    let contrato_ja_cadastrado = false;
    const numero_contrato = (extraido.numero_contrato || '').split(' ')[0].trim(); // "025A/2023 AD 02" → "025A/2023"

    if (numero_contrato) {
      const contrato = await this.contratoRepo.findOne({
        where: { numero_contrato: ILike(`%${numero_contrato}%`), orgao_id: orgaoId },
        select: ['id', 'numero_contrato'],
      });
      if (contrato) {
        contrato_id = contrato.id;
        contrato_ja_cadastrado = true;
      }
    }

    return {
      numero_contrato,
      fornecedor_cnpj,
      fornecedor_razao_social: extraido.fornecedor_razao_social || '',
      fornecedor_id,
      fornecedor_ja_cadastrado,
      contrato_id,
      contrato_ja_cadastrado,
      objeto: extraido.objeto || '',
      valor_global: Number(extraido.valor_global) || 0,
      valor_executado_ate_periodo: Number(extraido.valor_executado_ate_periodo) || 0,
      fiscal_nome: extraido.fiscal_nome || undefined,
      fiscal_portaria: extraido.fiscal_portaria || undefined,
      itens: Array.isArray(extraido.itens) ? extraido.itens.map((i: any) => ({
        descricao: i.descricao || '',
        unidade_medida: i.unidade_medida || 'UNIDADE',
        quantidade: Number(i.quantidade) || 1,
        valor_unitario: Number(i.valor_unitario) || 0,
        quantidade_meses: i.quantidade_meses ? Number(i.quantidade_meses) : null,
        valor_total: Number(i.valor_total) || 0,
      })) : [],
      pendencias: Array.isArray(extraido.pendencias) ? extraido.pendencias : [],
    };
  }

  async confirmarImportacao(
    dados: ConfirmarImportacaoMedicaoDto,
    orgaoId: string,
  ): Promise<{ contrato_id: string; numero_contrato: string; itens_criados: number; contrato_criado: boolean; aviso?: string }> {
    let contratoId = dados.contrato_id;

    // Se não tem contrato, não podemos criar aqui (planilha de medição é para contratos existentes)
    if (!contratoId) {
      throw new BadRequestException(
        'Contrato não encontrado no sistema. Utilize "Importar Contrato com IA" para cadastrar o contrato primeiro.',
      );
    }

    const contrato = await this.contratoRepo.findOne({ where: { id: contratoId, orgao_id: orgaoId } });
    if (!contrato) {
      throw new BadRequestException('Contrato não encontrado ou sem permissão de acesso.');
    }

    // Atualizar dados do contrato: fiscal e valor executado anterior
    const updates: Partial<Contrato> = {};

    if (dados.fiscal_nome && !contrato.fiscal_nome) {
      updates.fiscal_nome = dados.fiscal_nome;
    }
    if (dados.fiscal_portaria) {
      (updates as any).fiscal_matricula = dados.fiscal_portaria;
    }
    if (dados.valor_executado_ate_periodo > 0 && !contrato.valor_executado_anterior) {
      (updates as any).valor_executado_anterior = dados.valor_executado_ate_periodo;
    }
    if (dados.objeto && !contrato.objeto) {
      updates.objeto = dados.objeto;
    }

    if (Object.keys(updates).length > 0) {
      await this.contratoRepo.update(contratoId, updates);
    }

    // Criar itens do cronograma
    let itensCriados = 0;
    const avisos: string[] = [];

    if (dados.itens?.length > 0) {
      for (const item of dados.itens) {
        try {
          await this.medicaoService.criarItemCronograma(contratoId, {
            descricao: item.descricao,
            unidade_medida: item.unidade_medida,
            quantidade: item.quantidade,
            valor_unitario: item.valor_unitario,
            quantidade_meses: item.quantidade_meses || null,
          } as any);
          itensCriados++;
        } catch (err: any) {
          this.logger.warn(`Erro ao criar item "${item.descricao}": ${err.message}`);
          avisos.push(`Item "${item.descricao.substring(0, 30)}..." não foi criado: ${err.message}`);
        }
      }
    }

    const aviso = avisos.length > 0 ? avisos.join('; ') : undefined;

    return {
      contrato_id: contratoId,
      numero_contrato: contrato.numero_contrato,
      itens_criados: itensCriados,
      contrato_criado: false,
      aviso,
    };
  }
}
