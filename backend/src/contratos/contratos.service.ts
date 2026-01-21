import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Contrato, StatusContrato, TipoContrato, CategoriaContrato } from './entities/contrato.entity';
import { TermoAditivo, TipoTermoAditivo, StatusTermoAditivo } from './entities/termo-aditivo.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { ItemLicitacao, StatusItem } from '../itens/entities/item-licitacao.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { ItemContrato } from '../almoxarifado/entities/item-contrato.entity';

@Injectable()
export class ContratosService {
  private readonly logger = new Logger(ContratosService.name);

  constructor(
    @InjectRepository(Contrato)
    private contratoRepository: Repository<Contrato>,
    @InjectRepository(TermoAditivo)
    private termoAditivoRepository: Repository<TermoAditivo>,
    @InjectRepository(Licitacao)
    private licitacaoRepository: Repository<Licitacao>,
    @InjectRepository(ItemLicitacao)
    private itemRepository: Repository<ItemLicitacao>,
    @InjectRepository(Fornecedor)
    private fornecedorRepository: Repository<Fornecedor>,
    @InjectRepository(ItemContrato)
    private itemContratoRepository: Repository<ItemContrato>,
  ) {}

  // ============ CONTRATOS ============

  async criar(dados: Partial<Contrato>): Promise<Contrato> {
    // Gerar número do contrato
    const ano = new Date().getFullYear();
    const ultimoContrato = await this.contratoRepository.findOne({
      where: { orgao_id: dados.orgao_id, ano },
      order: { sequencial: 'DESC' }
    });

    const sequencial = ultimoContrato ? ultimoContrato.sequencial + 1 : 1;
    const numeroContrato = `${String(sequencial).padStart(3, '0')}/${ano}`;

    const contrato = this.contratoRepository.create({
      ...dados,
      ano,
      sequencial,
      numero_contrato: numeroContrato,
      valor_global: dados.valor_inicial
    });

    return this.contratoRepository.save(contrato);
  }

  async criarAPartirDaLicitacao(licitacaoId: string, dados: Partial<Contrato>): Promise<Contrato> {
    const licitacao = await this.licitacaoRepository.findOne({
      where: { id: licitacaoId },
      relations: ['orgao']
    });

    if (!licitacao) {
      throw new NotFoundException('Licitação não encontrada');
    }

    return this.criar({
      ...dados,
      licitacao_id: licitacaoId,
      orgao_id: licitacao.orgao_id,
      objeto: dados.objeto || licitacao.objeto,
      numero_processo: licitacao.numero_processo,
      categoria: this.mapearCategoria(licitacao.tipo_contratacao)
    });
  }

  async findAll(filtros?: {
    orgaoId?: string;
    fornecedorId?: string;
    status?: StatusContrato;
    tipo?: TipoContrato;
    ano?: number;
    vigentes?: boolean;
  }): Promise<Contrato[]> {
    const query = this.contratoRepository.createQueryBuilder('contrato')
      .leftJoinAndSelect('contrato.orgao', 'orgao')
      .leftJoinAndSelect('contrato.fornecedor', 'fornecedor')
      .leftJoinAndSelect('contrato.licitacao', 'licitacao');

    if (filtros?.orgaoId) {
      query.andWhere('contrato.orgao_id = :orgaoId', { orgaoId: filtros.orgaoId });
    }

    if (filtros?.fornecedorId) {
      query.andWhere('contrato.fornecedor_id = :fornecedorId', { fornecedorId: filtros.fornecedorId });
    }

    if (filtros?.status) {
      query.andWhere('contrato.status = :status', { status: filtros.status });
    }

    if (filtros?.tipo) {
      query.andWhere('contrato.tipo = :tipo', { tipo: filtros.tipo });
    }

    if (filtros?.ano) {
      query.andWhere('contrato.ano = :ano', { ano: filtros.ano });
    }

    if (filtros?.vigentes) {
      const hoje = new Date();
      query.andWhere('contrato.status = :statusVigente', { statusVigente: StatusContrato.VIGENTE })
        .andWhere('contrato.data_vigencia_fim >= :hoje', { hoje });
    }

    const contratos = await query.orderBy('contrato.created_at', 'DESC').getMany();

    // Carrega itens e calcula saldo total em valor para cada contrato
    for (const contrato of contratos) {
      const itens = await this.itemContratoRepository.find({
        where: { contrato_id: contrato.id },
      });

      // Calcula saldo total em valor (soma de saldo_disponivel * valor_unitario)
      const saldoTotalEmValor = itens.reduce((total, item) => {
        const saldoValor = Number(item.saldo_disponivel) * Number(item.valor_unitario);
        return total + saldoValor;
      }, 0);

      // Adiciona campos calculados ao contrato
      (contrato as any).itens = itens;
      (contrato as any).saldo_total_em_valor = saldoTotalEmValor;
      (contrato as any).total_itens = itens.length;
    }

    return contratos;
  }

  async findOne(id: string): Promise<Contrato> {
    const contrato = await this.contratoRepository.findOne({
      where: { id },
      relations: ['orgao', 'fornecedor', 'licitacao']
    });

    if (!contrato) {
      throw new NotFoundException('Contrato não encontrado');
    }

    // Carrega itens do contrato
    const itens = await this.itemContratoRepository.find({
      where: { contrato_id: contrato.id },
      order: { numero_item: 'ASC' },
    });

    // Calcula saldo total em valor
    const saldoTotalEmValor = itens.reduce((total, item) => {
      const saldoValor = Number(item.saldo_disponivel) * Number(item.valor_unitario);
      return total + saldoValor;
    }, 0);

    // Adiciona campos calculados ao contrato
    (contrato as any).itens = itens;
    (contrato as any).saldo_total_em_valor = saldoTotalEmValor;
    (contrato as any).total_itens = itens.length;

    return contrato;
  }

  async findByNumero(numeroContrato: string, orgaoId: string): Promise<Contrato> {
    const contrato = await this.contratoRepository.findOne({
      where: { numero_contrato: numeroContrato, orgao_id: orgaoId },
      relations: ['orgao', 'fornecedor', 'licitacao']
    });

    if (!contrato) {
      throw new NotFoundException('Contrato não encontrado');
    }

    return contrato;
  }

  async atualizar(id: string, dados: Partial<Contrato>): Promise<Contrato> {
    const contrato = await this.findOne(id);
    Object.assign(contrato, dados);
    return this.contratoRepository.save(contrato);
  }

  async alterarStatus(id: string, status: StatusContrato): Promise<Contrato> {
    const contrato = await this.findOne(id);
    contrato.status = status;
    return this.contratoRepository.save(contrato);
  }

  // ============ TERMOS ADITIVOS ============

  async criarTermoAditivo(contratoId: string, dados: Partial<TermoAditivo>): Promise<TermoAditivo> {
    const contrato = await this.findOne(contratoId);

    // Gerar número do termo
    const ultimoTermo = await this.termoAditivoRepository.findOne({
      where: { contrato_id: contratoId },
      order: { sequencial: 'DESC' }
    });

    const sequencial = ultimoTermo ? ultimoTermo.sequencial + 1 : 1;
    const numeroTermo = `${sequencial}º ${dados.tipo === TipoTermoAditivo.APOSTILAMENTO ? 'Apostilamento' : 'Termo Aditivo'}`;

    const termo = this.termoAditivoRepository.create({
      ...dados,
      contrato_id: contratoId,
      sequencial,
      numero_termo: numeroTermo
    });

    const termoSalvo = await this.termoAditivoRepository.save(termo);

    // Atualizar valores do contrato
    await this.atualizarValoresContrato(contrato, termoSalvo);

    return termoSalvo;
  }

  async findTermosAditivos(contratoId: string): Promise<TermoAditivo[]> {
    return this.termoAditivoRepository.find({
      where: { contrato_id: contratoId },
      order: { sequencial: 'ASC' }
    });
  }

  async findTermoAditivo(id: string): Promise<TermoAditivo> {
    const termo = await this.termoAditivoRepository.findOne({
      where: { id },
      relations: ['contrato']
    });

    if (!termo) {
      throw new NotFoundException('Termo aditivo não encontrado');
    }

    return termo;
  }

  private async atualizarValoresContrato(contrato: Contrato, termo: TermoAditivo): Promise<void> {
    if (termo.valor_acrescimo) {
      contrato.valor_acrescimos = Number(contrato.valor_acrescimos) + Number(termo.valor_acrescimo);
      contrato.valor_global = Number(contrato.valor_global) + Number(termo.valor_acrescimo);
    }

    if (termo.valor_supressao) {
      contrato.valor_supressoes = Number(contrato.valor_supressoes) + Number(termo.valor_supressao);
      contrato.valor_global = Number(contrato.valor_global) - Number(termo.valor_supressao);
    }

    if (termo.nova_data_vigencia_fim) {
      contrato.data_vigencia_fim = termo.nova_data_vigencia_fim;
    }

    if (termo.tipo === TipoTermoAditivo.RESCISAO) {
      contrato.status = StatusContrato.RESCINDIDO;
    }

    if (termo.tipo === TipoTermoAditivo.SUSPENSAO) {
      contrato.status = StatusContrato.SUSPENSO;
    }

    await this.contratoRepository.save(contrato);
  }

  // ============ CONSULTAS PÚBLICAS ============

  async findPublicos(filtros?: {
    orgaoId?: string;
    fornecedorCnpj?: string;
    ano?: number;
    vigentes?: boolean;
  }): Promise<Contrato[]> {
    const query = this.contratoRepository.createQueryBuilder('contrato')
      .leftJoinAndSelect('contrato.orgao', 'orgao')
      .select([
        'contrato.id',
        'contrato.numero_contrato',
        'contrato.ano',
        'contrato.tipo',
        'contrato.categoria',
        'contrato.status',
        'contrato.objeto',
        'contrato.valor_inicial',
        'contrato.valor_global',
        'contrato.data_assinatura',
        'contrato.data_vigencia_inicio',
        'contrato.data_vigencia_fim',
        'contrato.fornecedor_cnpj',
        'contrato.fornecedor_razao_social',
        'contrato.numero_processo',
        'orgao.id',
        'orgao.nome',
        'orgao.cnpj'
      ]);

    if (filtros?.orgaoId) {
      query.andWhere('contrato.orgao_id = :orgaoId', { orgaoId: filtros.orgaoId });
    }

    if (filtros?.fornecedorCnpj) {
      query.andWhere('contrato.fornecedor_cnpj = :cnpj', { cnpj: filtros.fornecedorCnpj });
    }

    if (filtros?.ano) {
      query.andWhere('contrato.ano = :ano', { ano: filtros.ano });
    }

    if (filtros?.vigentes) {
      const hoje = new Date();
      query.andWhere('contrato.status = :status', { status: StatusContrato.VIGENTE })
        .andWhere('contrato.data_vigencia_fim >= :hoje', { hoje });
    }

    return query.orderBy('contrato.data_assinatura', 'DESC').getMany();
  }

  async findPublicoById(id: string): Promise<Contrato> {
    const contrato = await this.contratoRepository.findOne({
      where: { id },
      relations: ['orgao', 'licitacao'],
      select: {
        id: true,
        numero_contrato: true,
        ano: true,
        tipo: true,
        categoria: true,
        status: true,
        objeto: true,
        objeto_detalhado: true,
        valor_inicial: true,
        valor_global: true,
        valor_acrescimos: true,
        valor_supressoes: true,
        data_assinatura: true,
        data_vigencia_inicio: true,
        data_vigencia_fim: true,
        data_publicacao: true,
        fornecedor_cnpj: true,
        fornecedor_razao_social: true,
        numero_processo: true,
        amparo_legal: true,
        fiscal_nome: true,
        gestor_nome: true,
        orgao: {
          id: true,
          nome: true,
          cnpj: true,
          cidade: true,
          uf: true
        },
        licitacao: {
          id: true,
          numero_processo: true,
          modalidade: true
        }
      }
    });

    if (!contrato) {
      throw new NotFoundException('Contrato não encontrado');
    }

    return contrato;
  }

  // ============ ESTATÍSTICAS ============

  async contarPorStatus(orgaoId: string): Promise<Record<string, number>> {
    const contratos = await this.contratoRepository.find({
      where: { orgao_id: orgaoId }
    });

    const contagem: Record<string, number> = {};
    contratos.forEach(c => {
      contagem[c.status] = (contagem[c.status] || 0) + 1;
    });

    return contagem;
  }

  async contratosAVencer(orgaoId: string, dias: number = 30): Promise<Contrato[]> {
    const hoje = new Date();
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() + dias);

    return this.contratoRepository.find({
      where: {
        orgao_id: orgaoId,
        status: StatusContrato.VIGENTE,
        data_vigencia_fim: Between(hoje, dataLimite)
      },
      relations: ['fornecedor'],
      order: { data_vigencia_fim: 'ASC' }
    });
  }

  async valorTotalContratado(orgaoId: string, ano?: number): Promise<number> {
    const query = this.contratoRepository.createQueryBuilder('contrato')
      .select('SUM(contrato.valor_global)', 'total')
      .where('contrato.orgao_id = :orgaoId', { orgaoId });

    if (ano) {
      query.andWhere('contrato.ano = :ano', { ano });
    }

    const result = await query.getRawOne();
    return Number(result.total) || 0;
  }

  // ============ HELPERS ============

  private mapearCategoria(tipoContratacao: string): CategoriaContrato {
    const mapa: Record<string, CategoriaContrato> = {
      'COMPRA': CategoriaContrato.COMPRAS,
      'SERVICO': CategoriaContrato.SERVICOS,
      'OBRA': CategoriaContrato.OBRAS,
      'SERVICO_ENGENHARIA': CategoriaContrato.SERVICOS_ENGENHARIA,
      'LOCACAO': CategoriaContrato.LOCACAO,
      'ALIENACAO': CategoriaContrato.ALIENACAO
    };

    return mapa[tipoContratacao] || CategoriaContrato.COMPRAS;
  }

  /**
   * Gera contrato automaticamente após homologação da licitação
   * Busca os itens adjudicados e cria contrato com dados da licitação
   */
  async gerarContratoAutomatico(licitacaoId: string): Promise<Contrato | null> {
    try {
      // Verifica se já existe contrato para esta licitação
      const contratoExistente = await this.contratoRepository.findOne({
        where: { licitacao_id: licitacaoId }
      });

      if (contratoExistente) {
        this.logger.log(`Contrato já existe para licitação ${licitacaoId}`);
        return contratoExistente;
      }

      // Busca licitação com relacionamentos
      const licitacao = await this.licitacaoRepository.findOne({
        where: { id: licitacaoId },
        relations: ['orgao']
      });

      if (!licitacao) {
        throw new NotFoundException('Licitação não encontrada');
      }

      // Verifica se está homologada
      if (licitacao.fase !== 'HOMOLOGACAO') {
        this.logger.warn(`Licitação ${licitacaoId} não está homologada. Fase atual: ${licitacao.fase}`);
        return null;
      }

      // Busca itens adjudicados da licitação
      const itensAdjudicados = await this.itemRepository.find({
        where: {
          licitacao_id: licitacaoId,
          status: StatusItem.ADJUDICADO
        }
      });

      if (itensAdjudicados.length === 0) {
        this.logger.warn(`Nenhum item adjudicado encontrado para licitação ${licitacaoId}`);
        return null;
      }

      // Agrupa itens por fornecedor vencedor
      const itensPorFornecedor = new Map<string, ItemLicitacao[]>();
      let valorTotalHomologado = 0;

      for (const item of itensAdjudicados) {
        if (!item.fornecedor_vencedor_id) {
          continue;
        }

        if (!itensPorFornecedor.has(item.fornecedor_vencedor_id)) {
          itensPorFornecedor.set(item.fornecedor_vencedor_id, []);
        }

        itensPorFornecedor.get(item.fornecedor_vencedor_id)!.push(item);
        // Usa valor_total_homologado se disponível, senão calcula a partir do unitário homologado
        const valorItem = item.valor_total_homologado 
          ? Number(item.valor_total_homologado)
          : (item.valor_unitario_homologado && item.quantidade 
            ? Number(item.valor_unitario_homologado) * Number(item.quantidade)
            : Number(item.valor_total_estimado || 0));
        valorTotalHomologado += valorItem;
      }

      // Se houver múltiplos fornecedores, cria contrato para o primeiro (maior valor)
      // Em produção, pode ser necessário criar múltiplos contratos
      const fornecedorVencedorId = Array.from(itensPorFornecedor.keys())[0];
      const itensDoFornecedor = itensPorFornecedor.get(fornecedorVencedorId)!;

      if (!fornecedorVencedorId) {
        this.logger.warn(`Nenhum fornecedor vencedor identificado para licitação ${licitacaoId}`);
        return null;
      }

      // Busca dados do fornecedor
      const fornecedor = await this.fornecedorRepository.findOne({
        where: { id: fornecedorVencedorId }
      });

      if (!fornecedor) {
        this.logger.warn(`Fornecedor ${fornecedorVencedorId} não encontrado`);
        return null;
      }

      // Calcula prazo de execução
      // Nota: prazo_entrega_dias está nas propostas (PropostaItem), não nos itens da licitação
      // Por enquanto, usa um valor padrão razoável de 30 dias
      // TODO: Buscar prazo_entrega_dias das propostas vencedoras quando disponível
      const maiorPrazoEntrega = 30; // Valor padrão em dias

      // Calcula vigência (data de assinatura + prazo de execução)
      const dataAssinatura = new Date();
      const dataVigenciaInicio = new Date(dataAssinatura);
      const dataVigenciaFim = new Date(dataAssinatura);
      dataVigenciaFim.setDate(dataVigenciaFim.getDate() + maiorPrazoEntrega);

      // Cria contrato automaticamente
      const contrato = await this.criar({
        licitacao_id: licitacaoId,
        orgao_id: licitacao.orgao_id,
        fornecedor_id: fornecedorVencedorId,
        fornecedor_cnpj: fornecedor.cpf_cnpj || '',
        fornecedor_razao_social: fornecedor.razao_social || fornecedor.nome_fantasia || '',
        objeto: licitacao.objeto,
        objeto_detalhado: licitacao.objeto_detalhado || undefined,
        numero_processo: licitacao.numero_processo,
        categoria: this.mapearCategoria(licitacao.tipo_contratacao),
        valor_inicial: valorTotalHomologado || licitacao.valor_homologado || licitacao.valor_total_estimado,
        valor_global: valorTotalHomologado || licitacao.valor_homologado || licitacao.valor_total_estimado,
        data_assinatura: dataAssinatura,
        data_vigencia_inicio: dataVigenciaInicio,
        data_vigencia_fim: dataVigenciaFim,
        prazo_execucao_dias: maiorPrazoEntrega || undefined,
        status: StatusContrato.VIGENTE,
        tipo: TipoContrato.CONTRATO,
        observacoes: `Contrato gerado automaticamente após homologação da licitação ${licitacao.numero_processo}`
      });

      this.logger.log(`Contrato ${contrato.numero_contrato} gerado automaticamente para licitação ${licitacaoId}`);

      return contrato;
    } catch (error) {
      this.logger.error(`Erro ao gerar contrato automaticamente para licitação ${licitacaoId}:`, error);
      throw error;
    }
  }
}
