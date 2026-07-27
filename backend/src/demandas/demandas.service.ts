import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ContratacaoFutura, Demanda, ItemDemanda, StatusContratacaoFutura, StatusDemanda } from './entities/demanda.entity';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { TipoNotificacao } from '../notificacoes/entities/notificacao.entity';

@Injectable()
export class DemandasService {
  private readonly logger = new Logger(DemandasService.name);

  constructor(
    @InjectRepository(Demanda)
    private demandaRepository: Repository<Demanda>,
    @InjectRepository(ItemDemanda)
    private itemDemandaRepository: Repository<ItemDemanda>,
    @InjectRepository(ContratacaoFutura)
    private contratacaoFuturaRepository: Repository<ContratacaoFutura>,
    @InjectDataSource()
    private dataSource: DataSource,
    private notificacoesService: NotificacoesService,
  ) {}

  /** Notifica o setor requisitante nos marcos do ciclo da demanda (best-effort). */
  private async notificarRequisitante(
    demanda: Demanda,
    tipo: TipoNotificacao,
    titulo: string,
    mensagem: string,
  ): Promise<void> {
    try {
      await this.notificacoesService.criar({
        orgao_id: demanda.orgao_id,
        usuario_id: demanda.orgao_id, // sino do órgão lista por orgao_id
        usuario_email: demanda.responsavel_email || undefined,
        tipo,
        titulo,
        mensagem,
        entidade_tipo: 'DEMANDA',
        entidade_id: demanda.id,
        link: `/orgao/demandas/${demanda.id}`,
      } as any);
    } catch (e: any) {
      this.logger.warn(`Notificação da demanda não enviada: ${e.message}`);
    }
  }

  // ==================== DEMANDAS ====================

  async findAll(params: {
    orgaoId: string;
    ano?: number;
    status?: StatusDemanda;
    unidadeRequisitante?: string;
  }): Promise<Demanda[]> {
    const query = this.demandaRepository.createQueryBuilder('d')
      .leftJoinAndSelect('d.itens', 'itens')
      .where('d.orgao_id = :orgaoId', { orgaoId: params.orgaoId });

    if (params.ano) {
      query.andWhere('d.ano_referencia = :ano', { ano: params.ano });
    }

    if (params.status) {
      query.andWhere('d.status = :status', { status: params.status });
    }

    if (params.unidadeRequisitante) {
      query.andWhere('d.unidade_requisitante = :unidade', { unidade: params.unidadeRequisitante });
    }

    query.orderBy('d.created_at', 'DESC');

    return query.getMany();
  }

  async findOne(id: string): Promise<Demanda> {
    const demanda = await this.demandaRepository.findOne({
      where: { id },
      relations: ['itens']
    });

    if (!demanda) {
      throw new NotFoundException('Demanda não encontrada');
    }

    return demanda;
  }

  async create(dados: {
    orgaoId: string;
    ano_referencia: number;
    unidade_requisitante: string;
    responsavel_nome?: string;
    responsavel_email?: string;
    responsavel_telefone?: string;
    observacoes?: string;
    descricao_sucinta_objeto?: string;
    data_desejada_contratacao?: Date | string;
    renovacao_contrato?: boolean;
  }): Promise<Demanda> {
    const demanda = this.demandaRepository.create({
      orgao_id: dados.orgaoId,
      ano_referencia: dados.ano_referencia,
      unidade_requisitante: dados.unidade_requisitante,
      responsavel_nome: dados.responsavel_nome,
      responsavel_email: dados.responsavel_email,
      responsavel_telefone: dados.responsavel_telefone,
      observacoes: dados.observacoes,
      descricao_sucinta_objeto: dados.descricao_sucinta_objeto,
      // '' viraria data inválida no Postgres (500 sem explicação p/ o usuário)
      data_desejada_contratacao: (dados.data_desejada_contratacao || null) as any,
      renovacao_contrato: !!dados.renovacao_contrato,
      status: StatusDemanda.RASCUNHO,
    });

    const salva = await this.demandaRepository.save(demanda);
    // Retornar com itens inicializado como array vazio para evitar erros no frontend
    salva.itens = [];
    return salva;
  }

  async update(id: string, dados: Partial<Demanda>): Promise<Demanda> {
    const demanda = await this.findOne(id);

    // Não permite editar demandas já consolidadas
    if (demanda.status === StatusDemanda.CONSOLIDADA) {
      throw new BadRequestException('Demanda já consolidada não pode ser editada');
    }

    Object.assign(demanda, dados);
    return this.demandaRepository.save(demanda);
  }

  async delete(id: string): Promise<void> {
    const demanda = await this.findOne(id);

    if (demanda.status === StatusDemanda.CONSOLIDADA) {
      throw new BadRequestException('Demanda já consolidada não pode ser excluída');
    }

    await this.demandaRepository.remove(demanda);
  }

  // ==================== FLUXO DE STATUS ====================

  async enviarParaAprovacao(id: string): Promise<Demanda> {
    const demanda = await this.findOne(id);

    if (demanda.status !== StatusDemanda.RASCUNHO) {
      throw new BadRequestException('Apenas demandas em rascunho podem ser enviadas');
    }

    if (!demanda.itens || demanda.itens.length === 0) {
      throw new BadRequestException('Demanda deve ter pelo menos um item');
    }

    if (!demanda.descricao_sucinta_objeto?.trim()) {
      throw new BadRequestException('Informe a descrição sucinta do objeto antes de enviar a DFD');
    }

    demanda.status = StatusDemanda.ENVIADA;
    demanda.data_envio = new Date();

    return this.demandaRepository.save(demanda);
  }

  async iniciarAnalise(id: string): Promise<Demanda> {
    const demanda = await this.findOne(id);

    if (demanda.status !== StatusDemanda.ENVIADA) {
      throw new BadRequestException('Apenas demandas enviadas podem entrar em análise');
    }

    demanda.status = StatusDemanda.EM_ANALISE;
    return this.demandaRepository.save(demanda);
  }

  async aprovar(id: string, aprovadoPor: string): Promise<Demanda> {
    const demanda = await this.findOne(id);

    if (demanda.status !== StatusDemanda.EM_ANALISE && demanda.status !== StatusDemanda.ENVIADA) {
      throw new BadRequestException('Demanda não está em análise');
    }

    demanda.status = StatusDemanda.APROVADA;
    demanda.data_aprovacao = new Date();
    demanda.aprovado_por = aprovadoPor;
    demanda.motivo_rejeicao = undefined as any;

    const salva = await this.demandaRepository.save(demanda);
    await this.notificarRequisitante(
      salva,
      TipoNotificacao.DEMANDA_APROVADA,
      'Demanda aprovada ✅',
      `A demanda "${salva.descricao_sucinta_objeto || salva.unidade_requisitante}" foi aprovada por ${aprovadoPor}. Acompanhe o andamento na página da demanda.`,
    );
    return salva;
  }

  async rejeitar(id: string, motivo: string): Promise<Demanda> {
    const demanda = await this.findOne(id);

    if (demanda.status !== StatusDemanda.EM_ANALISE && demanda.status !== StatusDemanda.ENVIADA) {
      throw new BadRequestException('Demanda não está em análise');
    }

    demanda.status = StatusDemanda.REJEITADA;
    demanda.motivo_rejeicao = motivo;

    const salva = await this.demandaRepository.save(demanda);
    await this.notificarRequisitante(
      salva,
      TipoNotificacao.DEMANDA_REJEITADA,
      'Demanda rejeitada',
      `A demanda "${salva.descricao_sucinta_objeto || salva.unidade_requisitante}" foi rejeitada. Motivo: ${motivo}`,
    );
    return salva;
  }

  async voltarParaRascunho(id: string): Promise<Demanda> {
    const demanda = await this.findOne(id);

    if (demanda.status === StatusDemanda.CONSOLIDADA) {
      throw new BadRequestException('Demanda consolidada não pode voltar para rascunho');
    }

    demanda.status = StatusDemanda.RASCUNHO;
    demanda.data_envio = undefined as any;
    demanda.data_aprovacao = undefined as any;
    demanda.aprovado_por = undefined as any;
    demanda.motivo_rejeicao = undefined as any;

    return this.demandaRepository.save(demanda);
  }

  // ==================== ACOMPANHAMENTO (transparência p/ o requisitante) ====================

  /**
   * Linha do tempo da demanda depois de aprovada: PCA → processo → contrato.
   * Os vínculos já existem no banco (itens_demanda.item_pca_id,
   * licitacoes.demanda_id, contratos.licitacao_id) — aqui só expomos a cadeia.
   */
  async acompanhamento(id: string): Promise<any> {
    const demanda = await this.findOne(id);

    // PCA: itens consolidados a partir desta demanda
    const itensPca = await this.dataSource.query(
      `SELECT ip.numero_item, ip.descricao_objeto, p.ano_exercicio, p.status AS pca_status
       FROM itens_demanda idem
       JOIN itens_pca ip ON ip.id = idem.item_pca_id
       LEFT JOIN planos_contratacao_anual p ON p.id = ip.pca_id
       WHERE idem.demanda_id = $1
       ORDER BY ip.numero_item ASC`,
      [id],
    ).catch(() => []);

    // Processo originado desta demanda
    const [licitacao] = await this.dataSource.query(
      `SELECT id, numero_processo, modalidade, fase, valor_total_estimado,
              data_publicacao_edital, data_homologacao, valor_homologado,
              numero_controle_pncp, link_pncp
       FROM licitacoes WHERE demanda_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [id],
    ).catch(() => [null]);

    // Contratos do processo
    const contratos = licitacao
      ? await this.dataSource.query(
          `SELECT c.id, c.numero_contrato, c.status, c.data_assinatura,
                  c.fornecedor_razao_social, c.valor_global,
                  da.status AS assinatura_status
           FROM contratos c
           LEFT JOIN documentos_assinatura da ON da.id = c.documento_assinatura_id
           WHERE c.licitacao_id = $1 ORDER BY c.numero_contrato ASC`,
          [licitacao.id],
        ).catch(() => [])
      : [];

    return {
      demanda: {
        id: demanda.id,
        status: demanda.status,
        data_envio: demanda.data_envio,
        data_aprovacao: demanda.data_aprovacao,
        aprovado_por: demanda.aprovado_por,
        motivo_rejeicao: demanda.motivo_rejeicao,
      },
      pca: {
        consolidada: itensPca.length > 0,
        itens: itensPca,
      },
      processo: licitacao || null,
      contratos,
    };
  }

  // ==================== ITENS DA DEMANDA ====================

  async adicionarItem(demandaId: string, dados: Partial<ItemDemanda>): Promise<ItemDemanda> {
    const demanda = await this.findOne(demandaId);

    if (demanda.status !== StatusDemanda.RASCUNHO) {
      throw new BadRequestException('Só é possível adicionar itens em demandas em rascunho');
    }

    // Calcular valor total
    const valorUnitario = dados.valor_unitario_estimado || 0;
    const quantidade = dados.quantidade_estimada || 1;
    const valorTotal = valorUnitario * quantidade;

    const item = this.itemDemandaRepository.create({
      ...dados,
      demanda_id: demandaId,
      data_desejada_contratacao: (dados.data_desejada_contratacao || demanda.data_desejada_contratacao) as any,
      renovacao_contrato: dados.renovacao_contrato ?? demanda.renovacao_contrato ?? false,
      valor_total_estimado: valorTotal,
    });

    return this.itemDemandaRepository.save(item);
  }

  async atualizarItem(itemId: string, dados: Partial<ItemDemanda>): Promise<ItemDemanda> {
    const item = await this.itemDemandaRepository.findOne({
      where: { id: itemId },
      relations: ['demanda']
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    if (item.demanda.status !== StatusDemanda.RASCUNHO) {
      throw new BadRequestException('Só é possível editar itens em demandas em rascunho');
    }

    // Recalcular valor total se necessário
    const valorUnitario = dados.valor_unitario_estimado ?? item.valor_unitario_estimado ?? 0;
    const quantidade = dados.quantidade_estimada ?? item.quantidade_estimada ?? 1;
    dados.valor_total_estimado = valorUnitario * quantidade;

    Object.assign(item, dados);
    return this.itemDemandaRepository.save(item);
  }

  async removerItem(itemId: string): Promise<void> {
    const item = await this.itemDemandaRepository.findOne({
      where: { id: itemId },
      relations: ['demanda']
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    if (item.demanda.status !== StatusDemanda.RASCUNHO) {
      throw new BadRequestException('Só é possível remover itens em demandas em rascunho');
    }

    await this.itemDemandaRepository.remove(item);
  }

  // ==================== CONSOLIDAÇÃO PARA PCA ====================

  async getDemandasParaConsolidar(orgaoId: string, ano: number): Promise<Demanda[]> {
    const aprovadas = await this.demandaRepository.find({
      where: {
        orgao_id: orgaoId,
        ano_referencia: ano,
        status: StatusDemanda.APROVADA
      },
      relations: ['itens'],
      order: { unidade_requisitante: 'ASC' }
    });

    const orfas = await this.demandaRepository
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.itens', 'itens')
      .leftJoin('planos_contratacao_anual', 'pca', 'pca.id::text = d.pca_id')
      .where('d.orgao_id = :orgaoId', { orgaoId })
      .andWhere('d.ano_referencia = :ano', { ano })
      .andWhere('d.status = :status', { status: StatusDemanda.CONSOLIDADA })
      .andWhere('d.pca_id IS NOT NULL')
      .andWhere('pca.id IS NULL')
      .orderBy('d.unidade_requisitante', 'ASC')
      .getMany();

    if (orfas.length > 0) {
      const ids = orfas.map((demanda) => demanda.id);
      await this.itemDemandaRepository
        .createQueryBuilder()
        .update()
        .set({ item_pca_id: null } as any)
        .where('demanda_id IN (:...ids)', { ids })
        .execute();

      await this.demandaRepository
        .createQueryBuilder()
        .update()
        .set({ status: StatusDemanda.APROVADA, pca_id: null } as any)
        .where('id IN (:...ids)', { ids })
        .execute();

      orfas.forEach((demanda) => {
        demanda.status = StatusDemanda.APROVADA;
        demanda.pca_id = null as any;
      });
    }

    return [...aprovadas, ...orfas].sort((a, b) =>
      a.unidade_requisitante.localeCompare(b.unidade_requisitante, 'pt-BR')
    );
  }

  async marcarComoConsolidada(demandaId: string, pcaId: string): Promise<Demanda> {
    const demanda = await this.findOne(demandaId);

    if (demanda.status !== StatusDemanda.APROVADA) {
      throw new BadRequestException('Apenas demandas aprovadas podem ser consolidadas');
    }

    demanda.status = StatusDemanda.CONSOLIDADA;
    demanda.pca_id = pcaId;

    return this.demandaRepository.save(demanda);
  }

  // ==================== CONTRATAÇÕES FUTURAS ====================

  async listarContratacoesFuturas(orgaoId: string, ano: number): Promise<ContratacaoFutura[]> {
    const contratacoes = await this.contratacaoFuturaRepository.find({
      where: { orgao_id: orgaoId, ano_referencia: ano },
      order: { created_at: 'DESC' },
    });
    await this.preencherDemandasContratacoes(contratacoes);
    return contratacoes;
  }

  private async preencherDemandasContratacoes(contratacoes: ContratacaoFutura[]): Promise<void> {
    if (contratacoes.length === 0) return;

    const demandas = await this.demandaRepository.find({
      where: contratacoes.map((contratacao) => ({ contratacao_futura_id: contratacao.id })),
      relations: ['itens'],
    });

    for (const contratacao of contratacoes) {
      contratacao.demandas = demandas.filter((demanda) => demanda.contratacao_futura_id === contratacao.id);
    }
  }

  async criarContratacaoFutura(orgaoId: string, dados: {
    ano_referencia: number;
    titulo: string;
    categoria: 'MATERIAL' | 'SERVICO' | 'OBRA' | 'OUTROS';
    descricao?: string;
    data_inicio_processo?: string;
    data_conclusao_processo?: string;
    prazo_estimado_dias?: number;
    demandaIds?: string[];
    codigo_unidade?: string;
  }): Promise<ContratacaoFutura> {
    const demandaIds = dados.demandaIds || [];
    const demandas = demandaIds.length > 0
      ? await this.demandaRepository.find({
          where: demandaIds.map((id) => ({ id, orgao_id: orgaoId, ano_referencia: dados.ano_referencia })),
          relations: ['itens'],
        })
      : [];

    if (demandaIds.length > 0 && demandas.length !== demandaIds.length) {
      throw new BadRequestException('Uma ou mais DFDs selecionadas não foram encontradas para este órgão e ano');
    }

    const valorTotal = demandas.reduce((total, demanda) => (
      total + (demanda.itens || []).reduce((subtotal, item) => subtotal + (Number(item.valor_total_estimado) || 0), 0)
    ), 0);

    const totalContratacoes = await this.contratacaoFuturaRepository.count({
      where: { orgao_id: orgaoId, ano_referencia: dados.ano_referencia },
    });
    const codigoUnidade = (dados.codigo_unidade || '10').trim() || '10';
    const identificador = `${codigoUnidade}-${totalContratacoes + 1}/${dados.ano_referencia}`;

    const contratacao = this.contratacaoFuturaRepository.create({
      orgao_id: orgaoId,
      ano_referencia: dados.ano_referencia,
      identificador,
      titulo: dados.titulo,
      categoria: dados.categoria || 'OUTROS',
      descricao: dados.descricao,
      data_inicio_processo: dados.data_inicio_processo as any,
      data_conclusao_processo: dados.data_conclusao_processo as any,
      prazo_estimado_dias: dados.prazo_estimado_dias,
      valor_total_estimado: valorTotal,
      status: StatusContratacaoFutura.EM_ELABORACAO,
    });

    const salva = await this.contratacaoFuturaRepository.save(contratacao);

    if (demandas.length > 0) {
      await this.demandaRepository.update(
        demandaIds,
        { contratacao_futura_id: salva.id } as any,
      );
    }

    const completa = await this.contratacaoFuturaRepository.findOne({ where: { id: salva.id } });
    if (!completa) throw new NotFoundException('Contratação futura não encontrada após criação');
    await this.preencherDemandasContratacoes([completa]);
    return completa;
  }

  async vincularDemandasContratacaoFutura(orgaoId: string, contratacaoId: string, demandaIds: string[]): Promise<ContratacaoFutura> {
    const contratacao = await this.contratacaoFuturaRepository.findOne({
      where: { id: contratacaoId, orgao_id: orgaoId },
    });

    if (!contratacao) {
      throw new NotFoundException('Contratação futura não encontrada');
    }

    const demandas = await this.demandaRepository.find({
      where: demandaIds.map((id) => ({ id, orgao_id: orgaoId, ano_referencia: contratacao.ano_referencia })),
      relations: ['itens'],
    });

    if (demandas.length !== demandaIds.length) {
      throw new BadRequestException('Uma ou mais DFDs selecionadas não foram encontradas para esta contratação');
    }

    await this.demandaRepository.update(demandaIds, { contratacao_futura_id: contratacao.id } as any);

    const todasDemandas = await this.demandaRepository.find({
      where: { contratacao_futura_id: contratacao.id },
      relations: ['itens'],
    });
    contratacao.valor_total_estimado = todasDemandas.reduce((total, demanda) => (
      total + (demanda.itens || []).reduce((subtotal, item) => subtotal + (Number(item.valor_total_estimado) || 0), 0)
    ), 0);
    await this.contratacaoFuturaRepository.save(contratacao);

    const atualizada = await this.contratacaoFuturaRepository.findOne({ where: { id: contratacao.id } });
    if (!atualizada) throw new NotFoundException('Contratação futura não encontrada após atualização');
    await this.preencherDemandasContratacoes([atualizada]);
    return atualizada;
  }

  async vincularItemAoPCA(itemDemandaId: string, itemPcaId: string): Promise<ItemDemanda> {
    const item = await this.itemDemandaRepository.findOne({ where: { id: itemDemandaId } });
    
    if (!item) {
      throw new NotFoundException('Item da demanda não encontrado');
    }

    item.item_pca_id = itemPcaId;
    return this.itemDemandaRepository.save(item);
  }

  // ==================== ESTATÍSTICAS ====================

  async getEstatisticas(orgaoId: string, ano: number): Promise<{
    total: number;
    porStatus: { status: string; total: number; valor: number }[];
    porUnidade: { unidade: string; total: number; valor: number }[];
    valorTotal: number;
  }> {
    const demandas = await this.findAll({ orgaoId, ano });

    const porStatus: Record<string, { total: number; valor: number }> = {};
    const porUnidade: Record<string, { total: number; valor: number }> = {};
    let valorTotal = 0;

    for (const demanda of demandas) {
      // Por status
      if (!porStatus[demanda.status]) {
        porStatus[demanda.status] = { total: 0, valor: 0 };
      }
      porStatus[demanda.status].total++;

      // Por unidade
      if (!porUnidade[demanda.unidade_requisitante]) {
        porUnidade[demanda.unidade_requisitante] = { total: 0, valor: 0 };
      }
      porUnidade[demanda.unidade_requisitante].total++;

      // Somar valores dos itens
      for (const item of demanda.itens || []) {
        const valor = Number(item.valor_total_estimado) || 0;
        porStatus[demanda.status].valor += valor;
        porUnidade[demanda.unidade_requisitante].valor += valor;
        valorTotal += valor;
      }
    }

    return {
      total: demandas.length,
      porStatus: Object.entries(porStatus).map(([status, dados]) => ({
        status,
        ...dados
      })),
      porUnidade: Object.entries(porUnidade).map(([unidade, dados]) => ({
        unidade,
        ...dados
      })),
      valorTotal
    };
  }

  // ==================== UNIDADES REQUISITANTES ====================

  async getUnidadesRequisitantes(orgaoId: string): Promise<string[]> {
    const result = await this.demandaRepository
      .createQueryBuilder('d')
      .select('DISTINCT d.unidade_requisitante', 'unidade')
      .where('d.orgao_id = :orgaoId', { orgaoId })
      .andWhere('d.unidade_requisitante IS NOT NULL')
      .orderBy('d.unidade_requisitante', 'ASC')
      .getRawMany();

    return result.map(r => r.unidade);
  }
}
