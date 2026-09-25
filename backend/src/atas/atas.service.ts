import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { AtaRegistroPreco, ItemAta, OrigemAta, StatusAta } from './entities/ata-registro-preco.entity';
import { recalcularSaldoAta } from './saldo-ata.sql';
import { ataVencida, hojeBrasilia } from './regras-arp';

/** Campos que nunca vêm do corpo: calculados (saldo), atos próprios (status, assinatura, vigência, PNCP) ou identidade. */
const CAMPOS_PROTEGIDOS_ATA = [
  'id', 'orgao_id', 'orgao', 'licitacao', 'fornecedor', 'itens', 'numero_ata', 'ano', 'sequencial', 'status',
  'valor_total', 'valor_utilizado', 'valor_saldo', 'origem', 'ata_origem_id', 'documento_assinatura_id',
  'prazo_cadastro_reserva', 'prorrogada', 'prorrogacao_meses', 'prorrogacao_motivo', 'prorrogada_em',
  'data_vigencia_fim_original', 'cancelamento_hipotese', 'cancelamento_motivo', 'cancelada_em',
  'enviado_pncp', 'numero_controle_pncp', 'sequencial_pncp', 'data_envio_pncp', 'created_at', 'updated_at',
];
/** Na ata gerada pelo resultado, também vêm do resultado/assinatura: fornecedor, licitação, datas. */
const CAMPOS_DO_RESULTADO = [
  'licitacao_id', 'fornecedor_id', 'fornecedor_cnpj', 'fornecedor_razao_social', 'data_assinatura',
  'data_vigencia_inicio', 'data_vigencia_fim', 'prazo_vigencia_meses', 'limite_adesao_percentual', 'arquivo_ata',
];
const CAMPOS_CALCULADOS_ITEM = ['id', 'ata_id', 'ata', 'quantidade_utilizada', 'quantidade_saldo', 'quantidade_adesao_autorizada', 'quantidade_adesao_utilizada', 'valor_total', 'created_at', 'updated_at'];

const semCampos = <T extends Record<string, any>>(dados: T, campos: string[]): Partial<T> => {
  const r: any = { ...(dados || {}) };
  for (const c of campos) delete r[c];
  return r;
};

@Injectable()
export class AtasService {
  constructor(
    @InjectRepository(AtaRegistroPreco)
    private ataRepository: Repository<AtaRegistroPreco>,
    @InjectRepository(ItemAta)
    private itemAtaRepository: Repository<ItemAta>,
  ) {}

  // ============ ATAS ============

  async criar(dados: Partial<AtaRegistroPreco>): Promise<AtaRegistroPreco> {
    // Gerar número da ata
    const ano = new Date().getFullYear();
    const ultimaAta = await this.ataRepository.findOne({
      where: { orgao_id: dados.orgao_id, ano },
      order: { sequencial: 'DESC' }
    });

    const sequencial = ultimaAta ? ultimaAta.sequencial + 1 : 1;
    const numeroAta = `${String(sequencial).padStart(3, '0')}/${ano}`;

    // Cadastro MANUAL (ata de fora da plataforma / legado). A ARP de licitação
    // SRP homologada é gerada pelo resultado (ArpService) — nunca por aqui.
    const ata = this.ataRepository.create({
      ...semCampos(dados, CAMPOS_PROTEGIDOS_ATA.filter((c) => c !== 'orgao_id')),
      ano,
      sequencial,
      numero_ata: numeroAta,
      origem: OrigemAta.MANUAL,
      valor_total: Number(dados.valor_total) || 0,
      valor_utilizado: 0,
      valor_saldo: Number(dados.valor_total) || 0,
    } as Partial<AtaRegistroPreco>);

    return this.ataRepository.save(ata);
  }

  async findAll(filtros?: {
    orgaoId?: string;
    fornecedorId?: string;
    status?: StatusAta;
    ano?: number;
    vigentes?: boolean;
  }): Promise<AtaRegistroPreco[]> {
    const query = this.ataRepository.createQueryBuilder('ata')
      .leftJoinAndSelect('ata.orgao', 'orgao')
      .leftJoinAndSelect('ata.fornecedor', 'fornecedor')
      .leftJoinAndSelect('ata.licitacao', 'licitacao');

    if (filtros?.orgaoId) {
      query.andWhere('ata.orgao_id = :orgaoId', { orgaoId: filtros.orgaoId });
    }

    if (filtros?.fornecedorId) {
      query.andWhere('ata.fornecedor_id = :fornecedorId', { fornecedorId: filtros.fornecedorId });
    }

    if (filtros?.status) {
      query.andWhere('ata.status = :status', { status: filtros.status });
    }

    if (filtros?.ano) {
      query.andWhere('ata.ano = :ano', { ano: filtros.ano });
    }

    if (filtros?.vigentes) {
      query.andWhere('ata.status IN (:...vig)', { vig: [StatusAta.VIGENTE, StatusAta.ESGOTADA] })
        .andWhere('ata.data_vigencia_fim >= :hoje', { hoje: hojeBrasilia() });
    }

    return query.orderBy('ata.created_at', 'DESC').getMany();
  }

  async findOne(id: string): Promise<AtaRegistroPreco> {
    const ata = await this.ataRepository.findOne({
      where: { id },
      relations: ['orgao', 'fornecedor', 'licitacao', 'itens']
    });

    if (!ata) {
      throw new NotFoundException('Ata não encontrada');
    }

    return ata;
  }

  /**
   * Edição cadastral: saldo, situação, assinatura, vigência, prorrogação,
   * cancelamento e PNCP têm atos próprios (nunca vêm do corpo). Na ata gerada
   * pelo resultado, fornecedor/licitação/datas também são do resultado.
   */
  async atualizar(id: string, dados: Partial<AtaRegistroPreco>): Promise<AtaRegistroPreco> {
    const ata = await this.findOne(id);
    const protegidos = ata.origem === OrigemAta.MANUAL ? CAMPOS_PROTEGIDOS_ATA : [...CAMPOS_PROTEGIDOS_ATA, ...CAMPOS_DO_RESULTADO];
    const permitido = semCampos(dados as any, protegidos);
    if (!Object.keys(permitido).length) return ata;
    await this.ataRepository.update(id, permitido as any);
    return this.findOne(id);
  }

  /**
   * Situação por rota genérica — só a SUSPENSÃO (e a retomada) e, na ata
   * manual, o encerramento. VIGENTE vem da assinatura; VENCIDA do job;
   * CANCELADA do cancelamento do registro (com hipótese e motivo); ESGOTADA
   * do saldo.
   */
  async alterarStatus(id: string, status: StatusAta): Promise<AtaRegistroPreco> {
    const ata = await this.findOne(id);
    const de = ata.status;
    const permitido =
      (de === StatusAta.VIGENTE && status === StatusAta.SUSPENSA) ||
      (de === StatusAta.SUSPENSA && status === StatusAta.VIGENTE && !ataVencida(ata.data_vigencia_fim)) ||
      (ata.origem === OrigemAta.MANUAL && status === StatusAta.ENCERRADA && de !== StatusAta.CANCELADA);
    if (!permitido) {
      throw new BadRequestException(
        `Mudança de situação ${de} → ${status} não é feita por aqui: VIGENTE vem da assinatura, VENCIDA da vigência, ` +
          'CANCELADA do cancelamento do registro (com hipótese e motivo) e ESGOTADA do saldo.',
      );
    }
    await this.ataRepository.update(id, { status });
    return this.findOne(id);
  }

  private assertItensEditaveis(ata: AtaRegistroPreco) {
    if (ata.origem && ata.origem !== OrigemAta.MANUAL) {
      throw new BadRequestException('Os itens da ata gerada pela homologação vêm do resultado (preços e quantidades homologados) — não se editam.');
    }
  }

  // ============ ITENS DA ATA ============

  async adicionarItem(ataId: string, dados: Partial<ItemAta>): Promise<ItemAta> {
    const ata = await this.findOne(ataId);
    this.assertItensEditaveis(ata);
    dados = semCampos(dados as any, CAMPOS_CALCULADOS_ITEM) as Partial<ItemAta>;

    // Gerar número do item
    const ultimoItem = await this.itemAtaRepository.findOne({
      where: { ata_id: ataId },
      order: { numero_item: 'DESC' }
    });

    const numeroItem = ultimoItem ? ultimoItem.numero_item + 1 : 1;

    const item = this.itemAtaRepository.create({
      ...dados,
      ata_id: ataId,
      numero_item: numeroItem,
      quantidade_utilizada: 0,
      quantidade_saldo: dados.quantidade_registrada,
      valor_total: Number(dados.quantidade_registrada) * Number(dados.valor_unitario)
    });

    const itemSalvo = await this.itemAtaRepository.save(item);

    // Totais da ata a partir dos itens e dos consumos (nunca zera o consumo — B10)
    await recalcularSaldoAta(this.ataRepository.manager, ataId);

    return this.itemAtaRepository.findOneOrFail({ where: { id: itemSalvo.id } });
  }

  /** Ata do item (null se o item não existe ou o id é inválido). */
  async ataIdDoItem(itemId: string): Promise<string | null> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId || '')) return null;
    const item = await this.itemAtaRepository.findOne({ where: { id: itemId }, select: ['id', 'ata_id'] });
    return item?.ata_id ?? null;
  }

  async findItens(ataId: string): Promise<ItemAta[]> {
    return this.itemAtaRepository.find({
      where: { ata_id: ataId },
      order: { numero_item: 'ASC' }
    });
  }

  async atualizarItem(itemId: string, dados: Partial<ItemAta>): Promise<ItemAta> {
    const item = await this.itemAtaRepository.findOne({ where: { id: itemId } });
    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }
    this.assertItensEditaveis(await this.findOne(item.ata_id));
    const permitido = semCampos(dados as any, CAMPOS_CALCULADOS_ITEM);
    if (permitido.quantidade_registrada != null && Number(permitido.quantidade_registrada) < Number(item.quantidade_utilizada)) {
      throw new BadRequestException('A quantidade registrada não pode ficar abaixo da já utilizada.');
    }
    if (Object.keys(permitido).length) await this.itemAtaRepository.update(itemId, permitido as any);
    // saldo/valores do item e da ata recalculados dos consumos (nunca zera — B10)
    await recalcularSaldoAta(this.ataRepository.manager, item.ata_id);
    return this.itemAtaRepository.findOneOrFail({ where: { id: itemId } });
  }

  // ============ CONSULTAS PÚBLICAS ============

  async findPublicas(filtros?: {
    orgaoId?: string;
    fornecedorCnpj?: string;
    ano?: number;
    vigentes?: boolean;
    permiteAdesao?: boolean;
    busca?: string;
  }): Promise<AtaRegistroPreco[]> {
    const query = this.ataRepository.createQueryBuilder('ata')
      .leftJoinAndSelect('ata.orgao', 'orgao')
      .leftJoinAndSelect('ata.itens', 'itens')
      .select([
        'ata.id',
        'ata.numero_ata',
        'ata.ano',
        'ata.status',
        'ata.objeto',
        'ata.valor_total',
        'ata.valor_saldo',
        'ata.data_assinatura',
        'ata.data_vigencia_inicio',
        'ata.data_vigencia_fim',
        'ata.fornecedor_cnpj',
        'ata.fornecedor_razao_social',
        'ata.permite_adesao',
        'ata.limite_adesao_percentual',
        'ata.prorrogada',
        'orgao.id',
        'orgao.nome',
        'orgao.cnpj',
        'orgao.cidade',
        'orgao.uf',
        'itens.id',
        'itens.numero_item',
        'itens.descricao',
        'itens.unidade_medida',
        'itens.quantidade_registrada',
        'itens.quantidade_saldo',
        'itens.quantidade_adesao_autorizada',
        'itens.valor_unitario'
      ])
      // Público: só atas assinadas (a ata aguardando assinatura ainda não produz efeitos)
      .where('ata.status NOT IN (:...naoPublicas)', { naoPublicas: [StatusAta.AGUARDANDO_ASSINATURA] });

    if (filtros?.orgaoId) {
      query.andWhere('ata.orgao_id = :orgaoId', { orgaoId: filtros.orgaoId });
    }

    if (filtros?.fornecedorCnpj) {
      query.andWhere('ata.fornecedor_cnpj = :cnpj', { cnpj: filtros.fornecedorCnpj });
    }

    if (filtros?.ano) {
      query.andWhere('ata.ano = :ano', { ano: filtros.ano });
    }

    if (filtros?.vigentes) {
      query.andWhere('ata.status IN (:...vig)', { vig: [StatusAta.VIGENTE, StatusAta.ESGOTADA] })
        .andWhere('ata.data_vigencia_fim >= :hoje', { hoje: hojeBrasilia() });
    }
    if (filtros?.permiteAdesao) {
      query.andWhere('ata.permite_adesao = true');
    }
    if (filtros?.busca) {
      query.andWhere('(ata.objeto ILIKE :busca OR ata.fornecedor_razao_social ILIKE :busca OR orgao.nome ILIKE :busca OR itens.descricao ILIKE :busca)', {
        busca: `%${filtros.busca}%`,
      });
    }

    return query.orderBy('ata.data_assinatura', 'DESC', 'NULLS LAST').getMany();
  }

  async findPublicaById(id: string): Promise<AtaRegistroPreco> {
    const ata = await this.ataRepository
      .createQueryBuilder('ata')
      .leftJoinAndSelect('ata.orgao', 'orgao')
      .leftJoinAndSelect('ata.licitacao', 'licitacao')
      .leftJoinAndSelect('ata.itens', 'itens')
      .select([
        'ata.id',
        'ata.numero_ata',
        'ata.ano',
        'ata.sequencial',
        'ata.status',
        'ata.objeto',
        'ata.valor_total',
        'ata.valor_utilizado',
        'ata.valor_saldo',
        'ata.data_assinatura',
        'ata.data_vigencia_inicio',
        'ata.data_vigencia_fim',
        'ata.data_publicacao',
        'ata.fornecedor_cnpj',
        'ata.fornecedor_razao_social',
        'ata.permite_adesao',
        'ata.limite_adesao_percentual',
        'ata.prorrogada',
        'ata.data_vigencia_fim_original',
        'ata.numero_controle_pncp',
        'orgao.id',
        'orgao.nome',
        'orgao.cnpj',
        'orgao.cidade',
        'orgao.uf',
        'licitacao.id',
        'licitacao.numero_processo',
        'licitacao.numero_edital',
        'licitacao.modalidade',
        'itens.id',
        'itens.numero_item',
        'itens.descricao',
        'itens.descricao_detalhada',
        'itens.unidade_medida',
        'itens.quantidade_registrada',
        'itens.quantidade_utilizada',
        'itens.quantidade_saldo',
        'itens.valor_unitario',
        'itens.valor_total',
        'itens.marca',
        'itens.modelo',
        'itens.quantidade_adesao_autorizada',
        'itens.quantidade_adesao_utilizada',
      ])
      .where('ata.id = :id', { id })
      .andWhere('ata.status NOT IN (:...naoPublicas)', { naoPublicas: [StatusAta.CANCELADA, StatusAta.AGUARDANDO_ASSINATURA] })
      .getOne();

    if (!ata) {
      throw new NotFoundException('Ata não encontrada');
    }

    return ata;
  }

  // ============ ESTATÍSTICAS ============

  async contarPorStatus(orgaoId: string): Promise<Record<string, number>> {
    const atas = await this.ataRepository.find({ where: { orgao_id: orgaoId } });

    const contagem: Record<string, number> = {};
    atas.forEach(a => {
      contagem[a.status] = (contagem[a.status] || 0) + 1;
    });

    return contagem;
  }

  async atasAVencer(orgaoId: string, dias: number = 30): Promise<AtaRegistroPreco[]> {
    const hoje = new Date();
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() + dias);

    return this.ataRepository.find({
      where: {
        orgao_id: orgaoId,
        status: StatusAta.VIGENTE,
        data_vigencia_fim: Between(hoje, dataLimite)
      },
      relations: ['fornecedor'],
      order: { data_vigencia_fim: 'ASC' }
    });
  }
}
