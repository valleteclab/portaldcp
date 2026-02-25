import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IaService } from '../ia/ia.service';
import { ContratosService } from './contratos.service';
import { MedicaoService } from './medicao.service';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { DadosExtradiosDto, ConfirmarImportacaoDto, ItemExtraidoDto } from './dto/importar-ia.dto';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const _pdfParseModule = require('pdf-parse');
const pdfParse: (buffer: Buffer) => Promise<{ text: string }> = _pdfParseModule.default ?? _pdfParseModule;

const SYSTEM_PROMPT_EXTRACAO = `Você é um especialista em licitações públicas brasileiras (Lei 14.133/2021).
Extraia os dados do contrato e retorne APENAS JSON válido, sem markdown, sem explicações.

Schema obrigatório (retorne exatamente este formato):
{
  "objeto": "descrição do objeto do contrato",
  "fornecedor_cnpj": "apenas dígitos, sem pontuação",
  "fornecedor_razao_social": "nome completo da empresa",
  "tipo": "CONTRATO|NOTA_EMPENHO|ORDEM_SERVICO|ORDEM_FORNECIMENTO|CARTA_CONTRATO|TERMO_ADESAO|ATA_REGISTRO_PRECO",
  "categoria": "COMPRAS|SERVICOS|OBRAS|SERVICOS_ENGENHARIA|LOCACAO|ALIENACAO",
  "modalidade_execucao": "ITEM_QUANTIDADE|MEDICAO|CONTINUADO|LICENCA|ORDEM_SERVICO",
  "valor_inicial": 0.00,
  "valor_global": 0.00,
  "data_assinatura": "YYYY-MM-DD",
  "data_vigencia_inicio": "YYYY-MM-DD",
  "data_vigencia_fim": "YYYY-MM-DD",
  "prazo_vigencia_meses": null,
  "numero_processo": null,
  "amparo_legal": null,
  "itens": [
    {
      "descricao": "descrição do item",
      "unidade_medida": "UNIDADE|MES|HORA|M2|M3|KG|LITRO|SERVICO",
      "quantidade": 1,
      "valor_unitario": 0.00,
      "quantidade_meses": null,
      "valor_total": 0.00
    }
  ],
  "pendencias": ["lista de campos obrigatórios não encontrados no documento"]
}

REGRAS:
- Para modalidade CONTINUADO ou LICENCA, itens pode ser array vazio []
- Se não encontrar CNPJ, coloque null em fornecedor_cnpj
- Datas OBRIGATORIAMENTE no formato YYYY-MM-DD
- Valores numéricos sem formatação (sem R$, pontos ou vírgulas como separadores de milhar)
- pendencias deve listar APENAS campos que são obrigatórios e não foram encontrados`;

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
      let textoExtraido = '';
      try {
        const pdfData = await pdfParse(file.buffer);
        textoExtraido = pdfData.text || '';
      } catch (err: any) {
        this.logger.warn(`pdf-parse falhou, tentando via base64: ${err.message}`);
      }

      if (textoExtraido.trim().length >= 200) {
        // PDF com texto nativo — envia o texto para o modelo
        respostaIA = await this.iaService.chatComArquivo(SYSTEM_PROMPT_EXTRACAO, undefined, undefined, textoExtraido);
      } else {
        // PDF scaneado ou sem texto — tenta via Vision
        this.logger.log('PDF sem texto suficiente, usando Vision (base64)');
        const pdfBase64 = file.buffer.toString('base64');
        try {
          respostaIA = await this.iaService.chatComArquivo(SYSTEM_PROMPT_EXTRACAO, pdfBase64, 'application/pdf');
        } catch (visionErr: any) {
          const msg = visionErr?.message || '';
          if (msg.includes('404') || msg.includes('image') || msg.includes('vision')) {
            throw new BadRequestException(
              'Este PDF é escaneado (sem texto) e o modelo de IA configurado não suporta visão. ' +
              'Troque para "Claude 3.5 Sonnet" ou "GPT-4o" em Admin → Configuração de IA, ou envie o contrato como imagem JPG/PNG.'
            );
          }
          throw visionErr;
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
