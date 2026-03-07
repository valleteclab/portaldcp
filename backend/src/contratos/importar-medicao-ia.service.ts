import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { IaService } from '../ia/ia.service';
import { MedicaoService } from './medicao.service';
import { ContratosService } from './contratos.service';
import { Contrato } from './entities/contrato.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { DadosExtraidosContratoDto, ConfirmarImportacaoContratoDto } from './dto/importar-contrato-ia.dto';

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT — Extração de Contrato Administrativo Público
// Cobre os blocos: Identificação, Partes, Objeto, Valores/Itens e Vigência
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT_CONTRATO = `Você é um especialista em contratos administrativos públicos brasileiros.
Sua tarefa é extrair dados de um CONTRATO ADMINISTRATIVO e retornar APENAS JSON válido, sem markdown, sem explicações.

REGRAS CRÍTICAS:
- Use SOMENTE informações explicitamente escritas no documento
- Se um campo não aparecer no documento, use null
- JAMAIS invente ou deduza valores não escritos
- CNPJ/CPF: somente dígitos, sem pontuação
- Valores monetários: números decimais (ex: 172800.00), sem R$, sem pontos de milhar
- Datas: formato YYYY-MM-DD

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCO 1 — IDENTIFICAÇÃO DO CONTRATO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- "numero_contrato": número do contrato (ex: "032/2023")
- "pregao_presencial": número do pregão (ex: "003/2023")
- "processo_administrativo": número do processo (ex: "007/2023")
- "data_assinatura": data de assinatura em YYYY-MM-DD
- "tipo_instrumento": "CONTRATO" | "TERMO_ADITIVO" | "ATA_REGISTRO" | "CONVENIO"
- "numero_termo_aditivo": se for aditivo, o número (ex: "1")
- "base_legal": leis citadas como base legal (ex: "Lei 10.520/02, Lei 8.666/93")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCO 2 — PARTES ENVOLVIDAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTRATANTE (órgão público):
- "contratante_nome": nome do órgão (ex: "Câmara Municipal de Luís Eduardo Magalhães/BA")
- "contratante_cnpj": CNPJ do órgão, só dígitos
- "contratante_endereco": endereço completo do órgão
- "contratante_representante_nome": nome do presidente/gestor que assina
- "contratante_representante_cpf": CPF do representante, só dígitos
- "contratante_representante_cargo": cargo do representante (ex: "Presidente")

CONTRATADA (empresa/fornecedor):
- "contratada_razao_social": razão social da empresa
- "contratada_cnpj": CNPJ da empresa, só dígitos
- "contratada_endereco": endereço completo da empresa
- "contratada_representante_nome": nome do representante da empresa
- "contratada_representante_cpf": CPF do representante da empresa, só dígitos
- "contratada_representante_cargo": cargo (ex: "Sócio", "Diretor", "Empresário")

FISCAL DO CONTRATO:
- "fiscal_nome": nome completo do fiscal/gestor do contrato
- "fiscal_portaria": portaria de nomeação (ex: "Portaria nº 032/2023")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCO 3 — OBJETO DO CONTRATO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- "objeto": descrição COMPLETA do objeto conforme escrito na Cláusula Primeira
- "modalidade_licitacao": tipo de licitação (ex: "Pregão Presencial")
- "criterio_julgamento": critério usado (ex: "Menor Preço Global")
- "regime_execucao": regime do contrato (ex: "Indireto por menor preço global")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCO 4 — VALORES E ITENS CONTRATADOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- "valor_global": valor total do contrato como número decimal
- "valor_mensal": valor mensal (se houver), como número decimal
- "numero_parcelas": quantidade de parcelas (ex: 12)
- "condicao_pagamento": prazo/condição de pagamento (ex: "Até o 15º dia útil após recebimento da NF")
- "indice_reajuste": índice de reajuste (ex: "IGPM")
- "indice_mora": índice de atualização por mora (ex: "INPC/IBGE")

ITENS — lista de cada item/sistema/serviço com sua linha da tabela:
- "descricao": descrição completa do item
- "unidade_medida": unidade (ex: "MÊS", "UNIDADE", "SERVIÇO")
- "quantidade": quantidade contratada (número)
- "valor_unitario": valor unitário como número decimal
- "valor_total": valor total do item como número decimal

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCO 5 — VIGÊNCIA E PRAZOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- "data_vigencia_inicio": início da vigência em YYYY-MM-DD
- "data_vigencia_fim": fim da vigência em YYYY-MM-DD
- "prazo_vigencia_meses": duração em meses (ex: 12)
- "prazo_recebimento_definitivo_dias": prazo para recebimento definitivo (ex: 30)
- "permite_prorrogacao": true se o contrato permite prorrogação, false caso contrário
- "foro": comarca/foro eleito para dirimir litígios

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DOTAÇÃO ORÇAMENTÁRIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- "dotacao_unidade": unidade orçamentária (ex: "01.01.000 – Câmara Municipal")
- "dotacao_programa": programa (ex: "101 - Programa Legislativo Forte e Atuante")
- "dotacao_acao": ação (ex: "1.031.101.2001")
- "dotacao_elemento": elemento de despesa (ex: "3.3.90.40.00.0")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCHEMA JSON DE RETORNO (preencha null nos campos não encontrados):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "numero_contrato": "032/2023",
  "pregao_presencial": "003/2023",
  "processo_administrativo": "007/2023",
  "data_assinatura": "2023-03-20",
  "tipo_instrumento": "CONTRATO",
  "numero_termo_aditivo": null,
  "base_legal": "Lei 10.520/02, Lei 8.666/93",

  "contratante_nome": "Câmara Municipal de Luís Eduardo Magalhães/BA",
  "contratante_cnpj": "04214440000100",
  "contratante_endereco": "Rua Octogonal, nº 684, Jardim Imperial, Luís Eduardo Magalhães - BA",
  "contratante_representante_nome": "REINILDO NERY DOS SANTOS",
  "contratante_representante_cpf": "97771830544",
  "contratante_representante_cargo": "Presidente",

  "contratada_razao_social": "ES DIGITAL EMPREENDIMENTOS LTDA",
  "contratada_cnpj": "41206659000186",
  "contratada_endereco": "Rua Pedro Rego, nº 442, Jardim Ouro Branco, Barreiras-BA, CEP 47.802-201",
  "contratada_representante_nome": "LUCAS CONCEIÇÃO VALE DE ARAÚJO",
  "contratada_representante_cpf": "03195207575",
  "contratada_representante_cargo": "Empresário",

  "fiscal_nome": "TELMA DE SOUZA",
  "fiscal_portaria": "Portaria nº 032/2023",

  "objeto": "Contratação de empresa especializada para prestação de serviços de locação, manutenção preventiva e corretiva, parametrização de software e treinamento...",
  "modalidade_licitacao": "Pregão Presencial",
  "criterio_julgamento": "Menor Preço Global",
  "regime_execucao": "Indireto por menor preço global",

  "valor_global": 172800.00,
  "valor_mensal": 14400.00,
  "numero_parcelas": 12,
  "condicao_pagamento": "Até o 15º dia útil após recebimento da Nota Fiscal",
  "indice_reajuste": "IGPM",
  "indice_mora": "INPC/IBGE",

  "itens": [
    {
      "descricao": "Sistema de controle e gerenciamento de requisições e compras com importação dos contratos e itens licitados",
      "unidade_medida": "MÊS",
      "quantidade": 12,
      "valor_unitario": 4200.00,
      "valor_total": 48000.00
    },
    {
      "descricao": "Sistema web de controle processo licitação e contratos",
      "unidade_medida": "MÊS",
      "quantidade": 12,
      "valor_unitario": 4200.00,
      "valor_total": 48000.00
    },
    {
      "descricao": "Sistema web de gestão documental",
      "unidade_medida": "MÊS",
      "quantidade": 12,
      "valor_unitario": 6000.00,
      "valor_total": 72000.00
    }
  ],

  "data_vigencia_inicio": "2023-03-20",
  "data_vigencia_fim": "2024-03-20",
  "prazo_vigencia_meses": 12,
  "prazo_recebimento_definitivo_dias": 30,
  "permite_prorrogacao": true,
  "foro": "Comarca de Luís Eduardo Magalhães-BA",

  "dotacao_unidade": "01.01.000 – Câmara Municipal",
  "dotacao_programa": "101 - Programa Legislativo Forte e Atuante",
  "dotacao_acao": "1.031.101.2001",
  "dotacao_elemento": "3.3.90.40.00.0",

  "pendencias": ["campos obrigatórios não encontrados"]
}`;

@Injectable()
export class ImportarContratoIaService {
  private readonly logger = new Logger(ImportarContratoIaService.name);

  constructor(
    private readonly iaService: IaService,
    private readonly medicaoService: MedicaoService,
    private readonly contratosService: ContratosService,
    @InjectRepository(Contrato)
    private readonly contratoRepo: Repository<Contrato>,
    @InjectRepository(Fornecedor)
    private readonly fornecedorRepo: Repository<Fornecedor>,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // ETAPA 1 — Extração via IA (PDF ou imagem)
  // ─────────────────────────────────────────────────────────────────────────
  async extrairDadosContrato(
    file: Express.Multer.File,
    orgaoId: string,
  ): Promise<DadosExtraidosContratoDto> {
    this.logger.log(`Extraindo dados do contrato: ${file.originalname}`);

    let respostaIA: string;

    if (file.mimetype === 'application/pdf') {
      const textoExtraido = await this.iaService.extrairTextoDoPdf(file.buffer);
      this.logger.log(`Texto extraído do PDF: ${textoExtraido.length} chars`);

      if (textoExtraido.trim().length >= 100) {
        respostaIA = await this.iaService.chatComArquivo(
          SYSTEM_PROMPT_CONTRATO,
          undefined,
          undefined,
          textoExtraido,
        );
      } else {
        const pdfBase64 = file.buffer.toString('base64');
        try {
          respostaIA = await this.iaService.chatComArquivo(
            SYSTEM_PROMPT_CONTRATO,
            pdfBase64,
            'application/pdf',
          );
        } catch {
          throw new BadRequestException(
            'PDF escaneado sem texto digital. Tire uma foto/screenshot e envie como imagem JPG ou PNG.',
          );
        }
      }
    } else {
      const imagemBase64 = file.buffer.toString('base64');
      respostaIA = await this.iaService.chatComArquivo(
        SYSTEM_PROMPT_CONTRATO,
        imagemBase64,
        file.mimetype,
      );
    }

    // ── Parse do JSON retornado pela IA ──────────────────────────────────────
    let extraido: any;
    try {
      const jsonLimpo = respostaIA.replace(/```json\n?|```/g, '').trim();
      extraido = JSON.parse(jsonLimpo);
    } catch {
      this.logger.error('Resposta IA não é JSON válido:', respostaIA);
      throw new BadRequestException(
        'A IA não conseguiu extrair dados estruturados. Tente com uma imagem mais nítida.',
      );
    }

    // ── Verificar se fornecedor já existe no banco ───────────────────────────
    const contratada_cnpj = extraido.contratada_cnpj?.replace(/\D/g, '') || null;
    let fornecedor_id: string | undefined;
    let fornecedor_ja_cadastrado = false;

    if (contratada_cnpj) {
      const fornecedor = await this.fornecedorRepo.findOne({
        where: { cpf_cnpj: contratada_cnpj },
      });
      if (fornecedor) {
        fornecedor_id = fornecedor.id;
        fornecedor_ja_cadastrado = true;
      }
    }

    // ── Verificar se contrato já existe no banco ─────────────────────────────
    const numero_contrato = (extraido.numero_contrato || '').trim();
    let contrato_id: string | undefined;
    let contrato_ja_cadastrado = false;

    if (numero_contrato) {
      const contrato = await this.contratoRepo.findOne({
        where: {
          numero_contrato: ILike(`%${numero_contrato}%`),
          orgao_id: orgaoId,
        },
        select: ['id', 'numero_contrato'],
      });
      if (contrato) {
        contrato_id = contrato.id;
        contrato_ja_cadastrado = true;
      }
    }

    // ── Montar DTO de retorno com todos os blocos ────────────────────────────
    return {
      // BLOCO 1 — Identificação
      numero_contrato,
      pregao_presencial: extraido.pregao_presencial || null,
      processo_administrativo: extraido.processo_administrativo || null,
      data_assinatura: extraido.data_assinatura || null,
      tipo_instrumento: extraido.tipo_instrumento || 'CONTRATO',
      numero_termo_aditivo: extraido.numero_termo_aditivo || null,
      base_legal: extraido.base_legal || null,

      // BLOCO 2 — Partes
      contratante_nome: extraido.contratante_nome || null,
      contratante_cnpj: extraido.contratante_cnpj?.replace(/\D/g, '') || null,
      contratante_endereco: extraido.contratante_endereco || null,
      contratante_representante_nome: extraido.contratante_representante_nome || null,
      contratante_representante_cpf: extraido.contratante_representante_cpf?.replace(/\D/g, '') || null,
      contratante_representante_cargo: extraido.contratante_representante_cargo || null,

      contratada_razao_social: extraido.contratada_razao_social || '',
      contratada_cnpj,
      contratada_endereco: extraido.contratada_endereco || null,
      contratada_representante_nome: extraido.contratada_representante_nome || null,
      contratada_representante_cpf: extraido.contratada_representante_cpf?.replace(/\D/g, '') || null,
      contratada_representante_cargo: extraido.contratada_representante_cargo || null,

      fornecedor_id,
      fornecedor_ja_cadastrado,
      contrato_id,
      contrato_ja_cadastrado,

      fiscal_nome: extraido.fiscal_nome || null,
      fiscal_portaria: extraido.fiscal_portaria || null,

      // BLOCO 3 — Objeto
      objeto: extraido.objeto || '',
      modalidade_licitacao: extraido.modalidade_licitacao || null,
      criterio_julgamento: extraido.criterio_julgamento || null,
      regime_execucao: extraido.regime_execucao || null,

      // BLOCO 4 — Valores e Itens
      valor_global: Number(extraido.valor_global) || 0,
      valor_mensal: extraido.valor_mensal ? Number(extraido.valor_mensal) : null,
      numero_parcelas: extraido.numero_parcelas ? Number(extraido.numero_parcelas) : null,
      condicao_pagamento: extraido.condicao_pagamento || null,
      indice_reajuste: extraido.indice_reajuste || null,
      indice_mora: extraido.indice_mora || null,

      itens: Array.isArray(extraido.itens)
        ? extraido.itens.map((i: any) => ({
            descricao: i.descricao || '',
            unidade_medida: i.unidade_medida || 'UNIDADE',
            quantidade: Number(i.quantidade) || 1,
            valor_unitario: Number(i.valor_unitario) || 0,
            valor_total: Number(i.valor_total) || 0,
          }))
        : [],

      // BLOCO 5 — Vigência
      data_vigencia_inicio: extraido.data_vigencia_inicio || null,
      data_vigencia_fim: extraido.data_vigencia_fim || null,
      prazo_vigencia_meses: extraido.prazo_vigencia_meses ? Number(extraido.prazo_vigencia_meses) : null,
      prazo_recebimento_definitivo_dias: extraido.prazo_recebimento_definitivo_dias
        ? Number(extraido.prazo_recebimento_definitivo_dias)
        : null,
      permite_prorrogacao: extraido.permite_prorrogacao ?? true,
      foro: extraido.foro || null,

      // Dotação
      dotacao_unidade: extraido.dotacao_unidade || null,
      dotacao_programa: extraido.dotacao_programa || null,
      dotacao_acao: extraido.dotacao_acao || null,
      dotacao_elemento: extraido.dotacao_elemento || null,

      pendencias: Array.isArray(extraido.pendencias) ? extraido.pendencias : [],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ETAPA 2 — Confirmação e persistência no banco
  // ─────────────────────────────────────────────────────────────────────────
  async confirmarImportacao(
    dados: ConfirmarImportacaoContratoDto,
    orgaoId: string,
    usuarioId: string,
    usuarioNome: string,
  ): Promise<{
    contrato_id: string;
    numero_contrato: string;
    itens_criados: number;
    contrato_criado: boolean;
    fornecedor_criado: boolean;
    aviso?: string;
  }> {
    let contratoId = dados.contrato_id;
    let contratoCriado = false;
    let fornecedorCriado = false;
    const avisos: string[] = [];

    // ── Resolver/criar fornecedor ────────────────────────────────────────────
    let fornecedorId = dados.fornecedor_id;
    const cnpjLimpo = dados.contratada_cnpj?.replace(/\D/g, '') || '';

    if (!fornecedorId && cnpjLimpo) {
      let fornecedor = await this.fornecedorRepo.findOne({
        where: { cpf_cnpj: cnpjLimpo },
      });

      if (!fornecedor) {
        const novo = this.fornecedorRepo.create({
          cpf_cnpj: cnpjLimpo,
          razao_social: dados.contratada_razao_social || 'A PREENCHER',
          nome_fantasia: dados.contratada_razao_social || 'A PREENCHER',
          representante_nome: dados.contratada_representante_nome || 'A PREENCHER',
          representante_cpf: dados.contratada_representante_cpf || '00000000000',
          logradouro: 'A PREENCHER',
          numero: '0',
          bairro: 'A PREENCHER',
          cidade: 'A PREENCHER',
          uf: 'XX',
          cep: '00000000',
          telefone: '00000000000',
          email: `${cnpjLimpo}@apreencher.com`,
          ativo: false,
        } as any);
        fornecedor = await this.fornecedorRepo.save(novo as any) as unknown as Fornecedor;
        fornecedorCriado = true;
      }

      fornecedorId = fornecedor!.id;
    }

    // ── Criar contrato (se não existir) ──────────────────────────────────────
    if (!contratoId && dados.criar_contrato) {
      if (!fornecedorId) {
        throw new BadRequestException('Informe o CNPJ do fornecedor para criar o contrato.');
      }

      const hoje = new Date().toISOString().split('T')[0];
      const umAnoDepois = new Date(
        new Date().setFullYear(new Date().getFullYear() + 1),
      ).toISOString().split('T')[0];

      const novoContrato = await this.contratosService.criar({
        orgao_id: orgaoId,
        fornecedor_id: fornecedorId,
        fornecedor_cnpj: cnpjLimpo,
        fornecedor_razao_social: dados.contratada_razao_social,
        numero_contrato: dados.numero_contrato,
        objeto: dados.objeto,
        tipo: (dados.tipo || 'CONTRATO') as any,
        categoria: (dados.categoria || 'SERVICOS') as any,
        modalidade_execucao: (dados.modalidade_execucao || 'CONTINUADO') as any,
        valor_inicial: dados.valor_global,
        valor_global: dados.valor_global,
        fiscal_nome: dados.fiscal_nome,
        fiscal_matricula: dados.fiscal_portaria,
        data_assinatura: dados.data_assinatura || hoje,
        data_vigencia_inicio: dados.data_vigencia_inicio || hoje,
        data_vigencia_fim: dados.data_vigencia_fim || umAnoDepois,
      } as any);

      contratoId = novoContrato.id;
      contratoCriado = true;
    } else if (!contratoId) {
      throw new BadRequestException(
        'Contrato não encontrado. Marque a opção de cadastrar novo contrato.',
      );
    }

    // ── Verificar permissão de acesso ────────────────────────────────────────
    const contrato = await this.contratoRepo.findOne({
      where: { id: contratoId, orgao_id: orgaoId },
    });
    if (!contrato) {
      throw new BadRequestException('Contrato não encontrado ou sem permissão de acesso.');
    }

    // ── Atualizar campos opcionais ainda não preenchidos ─────────────────────
    const updates: Partial<Contrato> = {};
    if (dados.fiscal_nome && !contrato.fiscal_nome)
      updates.fiscal_nome = dados.fiscal_nome;
    if (dados.objeto && !contrato.objeto)
      updates.objeto = dados.objeto;
    if (dados.fiscal_portaria && !(contrato as any).fiscal_matricula)
      (updates as any).fiscal_matricula = dados.fiscal_portaria;
    if (Object.keys(updates).length > 0)
      await this.contratoRepo.update(contratoId, updates);

    // ── Criar itens do cronograma ─────────────────────────────────────────────
    let itensCriados = 0;
    this.logger.log(
      `Criando itens para contrato ${contratoId}. Total: ${dados.itens?.length || 0}`,
    );

    if (dados.itens?.length > 0) {
      for (const item of dados.itens) {
        try {
          await this.medicaoService.criarItemCronograma(contratoId, {
            descricao: item.descricao,
            unidade_medida: item.unidade_medida,
            quantidade: item.quantidade,
            valor_unitario: item.valor_unitario,
            quantidade_meses: dados.numero_parcelas || null,
          } as any);
          itensCriados++;
        } catch (err: any) {
          const msg = err.message || '';
          this.logger.warn(`Item "${item.descricao?.substring(0, 40)}" não criado: ${msg}`);
          if (msg.includes('excede')) {
            avisos.push(`Item "${item.descricao?.substring(0, 40)}..." ignorado: valor excede o saldo.`);
          } else if (msg.includes('modalidade') || msg.includes('suporta')) {
            avisos.push(`Itens não suportados nesta modalidade. Configure manualmente na aba Medição.`);
            break;
          } else {
            avisos.push(`Item "${item.descricao?.substring(0, 30)}..." não criado: ${msg}`);
          }
        }
      }
    }

    this.logger.log(`Itens criados: ${itensCriados} de ${dados.itens?.length || 0}`);

    return {
      contrato_id: contratoId,
      numero_contrato: contrato.numero_contrato,
      itens_criados: itensCriados,
      contrato_criado: contratoCriado,
      fornecedor_criado: fornecedorCriado,
      aviso: avisos.length > 0 ? avisos.join(' | ') : undefined,
    };
  }
}