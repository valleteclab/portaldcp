import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { IaService } from '../ia/ia.service';
import { MedicaoService } from './medicao.service';
import { ContratosService } from './contratos.service';
import { Contrato } from './entities/contrato.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { DadosExtraidosMedicaoDto, ConfirmarImportacaoMedicaoDto } from './dto/importar-medicao-ia.dto';

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
- "data_assinatura": data de assinatura do contrato em YYYY-MM-DD (campo "DATA DE ASSINATURA" ou "ASSINADO EM")
- "data_vigencia_inicio": data de início de vigência em YYYY-MM-DD
- "data_vigencia_fim": data de fim de vigência em YYYY-MM-DD

**CAMPOS DE PERÍODO PARCIAL (para contratos em execução/migração):**
- "periodo_inicio": data de início do período da medição (YYYY-MM-DD) - campo "DATA INÍCIO PERÍODO"
- "periodo_fim": data de fim do período da medição (YYYY-MM-DD) - campo "DATA FIM PERÍODO"
- "dias_periodo": número de dias do período - campo "DIAS DO PERÍODO"
- "itens": lista de itens do contrato com seus dados de quantidade e valor

**CAMPOS DE CADA ITEM (atenção aos valores parciais):**
- "descricao": descrição completa do item
- "unidade_medida": MÊS, UNIDADE, etc.
- "quantidade_total_contrato": quantidade total prevista no contrato (ex: 12 meses)
- "valor_unitario": valor unitário do item
- "valor_total_contrato": valor total do item no contrato (quantidade_total_contrato × valor_unitario)
- **"quantidade_executada_ate_periodo"**: quantidade já executada até este período (ex: se já passaram 11 meses e 9 dias, use 11.3 ou o valor exato da planilha)
- **"valor_executado_ate_periodo"**: valor já executado até este período (coluna "VALOR JÁ EXECUTADO POR ITEM")
- "quantidade_restante": quantidade ainda não executada (calcular: total - executado)
- "valor_restante": valor ainda não executado (calcular: total - executado)

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
  "data_assinatura": "2024-01-15",
  "data_vigencia_inicio": "2024-01-15",
  "data_vigencia_fim": "2025-01-14",
  "periodo_inicio": "2024-12-01",
  "periodo_fim": "2024-12-31",
  "dias_periodo": 31,
  "itens": [
    {
      "descricao": "SISTEMA DE CONTROLE E GERENCIAMENTO DE RISCOS E OPORTUNIDADES",
      "unidade_medida": "MÊS",
      "quantidade_total_contrato": 12,
      "valor_unitario": 379.54,
      "valor_total_contrato": 4554.48,
      "quantidade_executada_ate_periodo": 11.3,
      "valor_executado_ate_periodo": 51465.62,
      "quantidade_restante": 0.7,
      "valor_restante": 265.68
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
    private readonly contratosService: ContratosService,
    @InjectRepository(Contrato)
    private readonly contratoRepo: Repository<Contrato>,
    @InjectRepository(Fornecedor)
    private readonly fornecedorRepo: Repository<Fornecedor>,
  ) {}

  async extrairDadosMedicao(file: Express.Multer.File, orgaoId: string): Promise<DadosExtraidosMedicaoDto> {
    this.logger.log(`Extraindo dados de planilha de medição: ${file.originalname}`);

    let respostaIA: string;

    if (file.mimetype === 'application/pdf') {
      // Usa iaService.extrairTextoDoPdf que tem fallback para Python (PyPDF2)
      const textoExtraido = await this.iaService.extrairTextoDoPdf(file.buffer);
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
      data_assinatura: extraido.data_assinatura || undefined,
      data_vigencia_inicio: extraido.data_vigencia_inicio || undefined,
      data_vigencia_fim: extraido.data_vigencia_fim || undefined,
      periodo_inicio: extraido.periodo_inicio || undefined,
      periodo_fim: extraido.periodo_fim || undefined,
      dias_periodo: extraido.dias_periodo ? Number(extraido.dias_periodo) : undefined,
      itens: Array.isArray(extraido.itens) ? extraido.itens.map((i: any) => ({
        descricao: i.descricao || '',
        unidade_medida: i.unidade_medida || 'UNIDADE',
        quantidade: i.quantidade ? Number(i.quantidade) : undefined,
        quantidade_total_contrato: i.quantidade_total_contrato ? Number(i.quantidade_total_contrato) : undefined,
        quantidade_executada_ate_periodo: i.quantidade_executada_ate_periodo ? Number(i.quantidade_executada_ate_periodo) : undefined,
        quantidade_restante: i.quantidade_restante ? Number(i.quantidade_restante) : undefined,
        valor_unitario: Number(i.valor_unitario) || 0,
        valor_total: i.valor_total ? Number(i.valor_total) : undefined,
        valor_total_contrato: i.valor_total_contrato ? Number(i.valor_total_contrato) : undefined,
        valor_executado_ate_periodo: i.valor_executado_ate_periodo ? Number(i.valor_executado_ate_periodo) : undefined,
        valor_restante: i.valor_restante ? Number(i.valor_restante) : undefined,
        quantidade_meses: i.quantidade_meses ? Number(i.quantidade_meses) : 
                         (i.quantidade_restante ? Number(i.quantidade_restante) : 
                          (i.quantidade_total_contrato ? Number(i.quantidade_total_contrato) : null)),
      })) : [],
      pendencias: Array.isArray(extraido.pendencias) ? extraido.pendencias : [],
    };
  }

  async confirmarImportacao(
    dados: ConfirmarImportacaoMedicaoDto,
    orgaoId: string,
    usuarioId: string,
    usuarioNome: string,
  ): Promise<{ contrato_id: string; numero_contrato: string; itens_criados: number; contrato_criado: boolean; ajuste_aplicado: boolean; aviso?: string }> {
    let contratoId = dados.contrato_id;
    let contratoCriado = false;

    if (!contratoId && dados.criar_contrato) {
      if (!dados.fornecedor_id && !dados.fornecedor_cnpj) {
        throw new BadRequestException('Informe o CNPJ do fornecedor para criar o contrato.');
      }

      let fornecedorId = dados.fornecedor_id;
      let fornecedorCnpj = dados.fornecedor_cnpj?.replace(/\D/g, '') || '';
      let fornecedorRazaoSocial = dados.fornecedor_razao_social || 'A PREENCHER';

      if (!fornecedorId && dados.fornecedor_cnpj) {
        const cnpj = fornecedorCnpj;
        let fornecedor: Fornecedor | null = await this.fornecedorRepo.findOne({ where: { cpf_cnpj: cnpj } });
        if (!fornecedor) {
          const novo = this.fornecedorRepo.create({
            cpf_cnpj: cnpj,
            razao_social: fornecedorRazaoSocial,
            nome_fantasia: fornecedorRazaoSocial,
            representante_nome: 'A PREENCHER',
            representante_cpf: '00000000000',
            logradouro: 'A PREENCHER', numero: '0', bairro: 'A PREENCHER',
            cidade: 'A PREENCHER', uf: 'XX', cep: '00000000',
            telefone: '00000000000', email: `${cnpj}@apreencher.com`, ativo: false,
          } as any);
          fornecedor = await this.fornecedorRepo.save(novo as any) as unknown as Fornecedor;
        }
        fornecedorId = fornecedor!.id;
        fornecedorCnpj = (fornecedor as any).cpf_cnpj || cnpj;
        fornecedorRazaoSocial = (fornecedor as any).razao_social || fornecedorRazaoSocial;
      } else if (fornecedorId && !fornecedorCnpj) {
        // Buscar CNPJ do fornecedor pelo ID
        const fornecedor = await this.fornecedorRepo.findOne({ where: { id: fornecedorId } });
        if (fornecedor) {
          fornecedorCnpj = (fornecedor as any).cpf_cnpj || '';
          fornecedorRazaoSocial = (fornecedor as any).razao_social || fornecedorRazaoSocial;
        }
      }

      const hoje = new Date().toISOString().split('T')[0];
      const umAnoDepois = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0];

      const novoContrato = await this.contratosService.criar({
        orgao_id: orgaoId,
        fornecedor_id: fornecedorId,
        fornecedor_cnpj: fornecedorCnpj,
        fornecedor_razao_social: fornecedorRazaoSocial,
        objeto: dados.objeto,
        tipo: (dados.tipo || 'CONTRATO') as any,
        categoria: (dados.categoria || 'SERVICOS') as any,
        modalidade_execucao: (dados.modalidade_execucao || 'CONTINUADO') as any,
        valor_inicial: dados.valor_global,
        valor_global: dados.valor_global,
        fiscal_nome: dados.fiscal_nome,
        data_assinatura: dados.data_assinatura || hoje,
        data_vigencia_inicio: dados.data_vigencia_inicio || hoje,
        data_vigencia_fim: dados.data_vigencia_fim || umAnoDepois,
      } as any);

      contratoId = novoContrato.id;
      contratoCriado = true;

      if (dados.fiscal_portaria) {
        await this.contratoRepo.update(contratoId, { fiscal_matricula: dados.fiscal_portaria } as any);
      }
    } else if (!contratoId) {
      throw new BadRequestException('Contrato não encontrado. Marque a opção de cadastrar novo contrato.');
    }

    const contrato = await this.contratoRepo.findOne({ where: { id: contratoId, orgao_id: orgaoId } });
    if (!contrato) {
      throw new BadRequestException('Contrato não encontrado ou sem permissão de acesso.');
    }

    // Atualizar fiscal e objeto (se ainda não preenchidos)
    const updates: Partial<Contrato> = {};
    if (dados.fiscal_nome && !contrato.fiscal_nome) updates.fiscal_nome = dados.fiscal_nome;
    if (dados.fiscal_portaria && !contrato.fiscal_matricula) (updates as any).fiscal_matricula = dados.fiscal_portaria;
    if (dados.objeto && !contrato.objeto) updates.objeto = dados.objeto;
    if (Object.keys(updates).length > 0) await this.contratoRepo.update(contratoId, updates);

    // ── Ajuste de Migração via serviço oficial (registra histórico) ──────────
    let ajusteAplicado = false;
    const avisos: string[] = [];

    if (dados.valor_executado_ate_periodo > 0) {
      try {
        const observacaoIA = [
          `Importação automática via IA — planilha de medição.`,
          `Contrato: ${dados.numero_contrato}.`,
          `Valor executado até o período registrado na planilha: R$ ${Number(dados.valor_executado_ate_periodo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`,
          dados.fiscal_nome ? `Fiscal: ${dados.fiscal_nome}.` : '',
        ].filter(Boolean).join(' ');

        await this.contratosService.ajusteMigracao(
          contratoId,
          { valor_executado_anterior: dados.valor_executado_ate_periodo, observacao_ajuste: observacaoIA },
          usuarioId,
          usuarioNome,
        );
        ajusteAplicado = true;
        this.logger.log(`Ajuste de migração aplicado: R$ ${dados.valor_executado_ate_periodo} — contrato ${contrato.numero_contrato}`);
      } catch (err: any) {
        this.logger.warn(`Ajuste de migração falhou: ${err.message}`);
        avisos.push(`Ajuste de valor não aplicado: ${err.message}`);
      }
    }

    // ── Criar itens do cronograma ─────────────────────────────────────────────
    let itensCriados = 0;

    this.logger.log(`Iniciando criação de itens para contrato ${contratoId}. Total de itens recebidos: ${dados.itens?.length || 0}`);

    if (dados.itens?.length > 0) {
      for (const item of dados.itens) {
        try {
          // Se temos dados de execução parcial (migração), usar a quantidade restante
          // Caso contrário, usar a quantidade total do contrato
          const isMigracaoParcial = item.quantidade_restante !== undefined && item.quantidade_restante !== null && item.quantidade_restante > 0;
          
          const quantidade = isMigracaoParcial 
            ? item.quantidade_restante 
            : (item.quantidade || item.quantidade_total_contrato || 1);
          
          const quantidadeMeses = isMigracaoParcial
            ? item.quantidade_restante
            : (item.quantidade_meses || item.quantidade_total_contrato || null);

          this.logger.log(`Criando item: ${item.descricao?.substring(0, 40)}... Qtd: ${quantidade}, Valor Unit: ${item.valor_unitario}, Migracao: ${isMigracaoParcial}`);
          
          await this.medicaoService.criarItemCronograma(contratoId, {
            descricao: item.descricao,
            unidade_medida: item.unidade_medida,
            quantidade: quantidade,
            valor_unitario: item.valor_unitario,
            quantidade_meses: quantidadeMeses,
          } as any);
          itensCriados++;
          this.logger.log(`Item criado com sucesso: ${item.descricao?.substring(0, 40)} (Qtd: ${quantidade})`);
        } catch (err: any) {
          const msg = err.message || '';
          this.logger.warn(`Item "${item.descricao?.substring(0, 40)}" não criado: ${msg}`);
          if (msg.includes('excede o saldo') || msg.includes('excede')) {
            avisos.push(`Item "${item.descricao?.substring(0, 40)}..." ignorado: valor excede o saldo disponível do contrato.`);
          } else if (msg.includes('modalidade') || msg.includes('suporta')) {
            avisos.push(`Itens de cronograma não suportados nesta modalidade (${contrato.modalidade_execucao}). Configure manualmente na aba Medição.`);
            break;
          } else {
            avisos.push(`Item "${item.descricao?.substring(0, 30)}..." não criado: ${msg}`);
          }
        }
      }
    } else {
      this.logger.warn(`Nenhum item recebido para criar no contrato ${contratoId}`);
    }

    this.logger.log(`Finalizada criação de itens. Criados: ${itensCriados} de ${dados.itens?.length || 0}`);

    return {
      contrato_id: contratoId,
      numero_contrato: contrato.numero_contrato,
      itens_criados: itensCriados,
      contrato_criado: contratoCriado,
      ajuste_aplicado: ajusteAplicado,
      aviso: avisos.length > 0 ? avisos.join(' | ') : undefined,
    };
  }
}
