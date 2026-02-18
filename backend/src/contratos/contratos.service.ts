import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual, In } from 'typeorm';
import { Contrato, StatusContrato, TipoContrato, CategoriaContrato, ModalidadeExecucao } from './entities/contrato.entity';
import { TermoAditivo, TipoTermoAditivo, StatusTermoAditivo } from './entities/termo-aditivo.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { ItemLicitacao, StatusItem } from '../itens/entities/item-licitacao.entity';
import { Fornecedor, TipoPessoa } from '../fornecedores/entities/fornecedor.entity';
import { ItemContrato } from '../almoxarifado/entities/item-contrato.entity';
import { HistoricoContrato, TipoAcaoContrato } from './entities/historico-contrato.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { Medicao } from './entities/medicao.entity';

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
    @InjectRepository(HistoricoContrato)
    private historicoContratoRepository: Repository<HistoricoContrato>,
    @InjectRepository(Usuario)
    private usuarioRepository: Repository<Usuario>,
    @InjectRepository(Medicao)
    private medicaoRepository: Repository<Medicao>,
    private notificacoesService: NotificacoesService,
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
      valor_global: dados.valor_inicial,
      status: StatusContrato.AGUARDANDO_LIBERACAO,
    });

    const salvo = await this.contratoRepository.save(contrato);

    await this.registrarHistorico({
      contrato_id: salvo.id,
      tipo_acao: TipoAcaoContrato.CRIADO,
      descricao: `Contrato ${numeroContrato} criado — aguardando liberação`,
      status_novo: StatusContrato.AGUARDANDO_LIBERACAO,
      usuario_id: dados.usuario_cadastro_id || null,
      usuario_nome: dados.usuario_cadastro_nome || null,
    });

    // Notificar responsáveis pela liberação
    await this.notificarLiberadores(salvo, 'Criação manual');

    return salvo;
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
    const contratoIds = contratos.map((c) => c.id);

    // Batch: carregar todos os itens de uma vez
    const todosItens = contratoIds.length > 0
      ? await this.itemContratoRepository.find({ where: { contrato_id: In(contratoIds) } })
      : [];
    const itensPorContrato = new Map<string, ItemContrato[]>();
    for (const item of todosItens) {
      const lista = itensPorContrato.get(item.contrato_id) || [];
      lista.push(item);
      itensPorContrato.set(item.contrato_id, lista);
    }

    // Batch: somar medições para contratos MEDICAO
    const idsMedicao = contratos.filter((c) => c.modalidade_execucao === ModalidadeExecucao.MEDICAO).map((c) => c.id);
    const medicoesPorContrato = idsMedicao.length > 0 ? await this.somarValorMedicoesBatch(idsMedicao) : new Map();

    for (const contrato of contratos) {
      const itens = itensPorContrato.get(contrato.id) || [];
      let saldoTotalEmValor: number;

      if (contrato.modalidade_execucao === ModalidadeExecucao.MEDICAO) {
        const { aprovado, comprometido } = medicoesPorContrato.get(contrato.id) || { aprovado: 0, comprometido: 0 };
        const valorGlobal = Number(contrato.valor_global || contrato.valor_inicial || 0);
        saldoTotalEmValor = Math.max(0, valorGlobal - comprometido);
        (contrato as any).valor_medido_total = aprovado;
        (contrato as any).valor_comprometido_total = comprometido;
        (contrato as any).valor_em_analise = Math.max(0, comprometido - aprovado);
      } else {
        saldoTotalEmValor =
          itens.length > 0
            ? itens.reduce((total, item) => {
                const saldoValor = Number(item.saldo_disponivel) * Number(item.valor_unitario);
                return total + saldoValor;
              }, 0)
            : Number(contrato.valor_global || contrato.valor_inicial || 0);
      }

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

    let saldoTotalEmValor: number;

    if (contrato.modalidade_execucao === ModalidadeExecucao.MEDICAO) {
      const { aprovado, comprometido } = await this.somarValorMedicoes(contrato.id);
      const valorGlobal = Number(contrato.valor_global || contrato.valor_inicial || 0);
      saldoTotalEmValor = Math.max(0, valorGlobal - comprometido);
      (contrato as any).valor_medido_total = aprovado;
      (contrato as any).valor_comprometido_total = comprometido;
      (contrato as any).valor_em_analise = Math.max(0, comprometido - aprovado);
    } else {
      saldoTotalEmValor = itens.length > 0
        ? itens.reduce((total, item) => {
            const saldoValor = Number(item.saldo_disponivel) * Number(item.valor_unitario);
            return total + saldoValor;
          }, 0)
        : Number(contrato.valor_global || contrato.valor_inicial || 0);
    }

    // Adiciona campos calculados ao contrato
    (contrato as any).itens = itens;
    (contrato as any).saldo_total_em_valor = saldoTotalEmValor;
    (contrato as any).total_itens = itens.length;

    return contrato;
  }

  /**
   * Batch: soma valor_medido de medições para múltiplos contratos em 2 queries.
   */
  private async somarValorMedicoesBatch(
    contratoIds: string[],
  ): Promise<Map<string, { aprovado: number; comprometido: number }>> {
    const statusComprometidos = [
      'SUBMETIDA',
      'AGUARDANDO_ATESTE',
      'PARCIALMENTE_ATESTADA',
      'AGUARDANDO_APROVACAO',
      'APROVADA',
    ];
    const resultado = new Map<string, { aprovado: number; comprometido: number }>();
    for (const id of contratoIds) {
      resultado.set(id, { aprovado: 0, comprometido: 0 });
    }

    const [aprovados, comprometidos] = await Promise.all([
      this.medicaoRepository
        .createQueryBuilder('m')
        .select('m.contrato_id', 'contrato_id')
        .addSelect('COALESCE(SUM(m.valor_medido), 0)', 'total')
        .where('m.contrato_id IN (:...ids)', { ids: contratoIds })
        .andWhere('m.status = :status', { status: 'APROVADA' })
        .groupBy('m.contrato_id')
        .getRawMany<{ contrato_id: string; total: string }>(),
      this.medicaoRepository
        .createQueryBuilder('m')
        .select('m.contrato_id', 'contrato_id')
        .addSelect('COALESCE(SUM(m.valor_medido), 0)', 'total')
        .where('m.contrato_id IN (:...ids)', { ids: contratoIds })
        .andWhere('m.status IN (:...status)', { status: statusComprometidos })
        .groupBy('m.contrato_id')
        .getRawMany<{ contrato_id: string; total: string }>(),
    ]);

    for (const r of aprovados) {
      const curr = resultado.get(r.contrato_id);
      if (curr) curr.aprovado = Number(r.total ?? 0);
    }
    for (const r of comprometidos) {
      const curr = resultado.get(r.contrato_id);
      if (curr) curr.comprometido = Number(r.total ?? 0);
    }
    return resultado;
  }

  /**
   * Soma o valor_medido de todas as medições que comprometem o saldo do contrato.
   * Inclui: APROVADA + em trânsito (SUBMETIDA, AGUARDANDO_ATESTE, PARCIALMENTE_ATESTADA, AGUARDANDO_APROVACAO).
   * Retorna { aprovado, comprometido } para exibir ambos os valores no frontend.
   */
  private async somarValorMedicoes(contratoId: string): Promise<{ aprovado: number; comprometido: number }> {
    const statusComprometidos = [
      'SUBMETIDA', 'AGUARDANDO_ATESTE', 'PARCIALMENTE_ATESTADA', 'AGUARDANDO_APROVACAO', 'APROVADA',
    ];

    const resultAprovado = await this.medicaoRepository
      .createQueryBuilder('m')
      .select('COALESCE(SUM(m.valor_medido), 0)', 'total')
      .where('m.contrato_id = :contratoId', { contratoId })
      .andWhere('m.status = :status', { status: 'APROVADA' })
      .getRawOne<{ total: string }>();

    const resultComprometido = await this.medicaoRepository
      .createQueryBuilder('m')
      .select('COALESCE(SUM(m.valor_medido), 0)', 'total')
      .where('m.contrato_id = :contratoId', { contratoId })
      .andWhere('m.status IN (:...status)', { status: statusComprometidos })
      .getRawOne<{ total: string }>();

    return {
      aprovado: Number(resultAprovado?.total ?? 0),
      comprometido: Number(resultComprometido?.total ?? 0),
    };
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

  async atualizar(id: string, dados: Partial<Contrato>, usuarioId?: string, usuarioNome?: string): Promise<Contrato> {
    const contrato = await this.findOne(id);
    const eraEnviadoPncp = contrato.enviado_pncp;
    Object.assign(contrato, dados);
    const salvo = await this.contratoRepository.save(contrato);

    // Detectar envio ao PNCP
    if (!eraEnviadoPncp && dados.enviado_pncp === true) {
      await this.registrarHistorico({
        contrato_id: id,
        tipo_acao: TipoAcaoContrato.ENVIADO_PNCP,
        descricao: `Contrato enviado ao PNCP${dados.numero_controle_pncp ? ' - Controle: ' + dados.numero_controle_pncp : ''}`,
        usuario_id: usuarioId || null,
        usuario_nome: usuarioNome || null,
      });
    } else {
      await this.registrarHistorico({
        contrato_id: id,
        tipo_acao: TipoAcaoContrato.EDITADO,
        descricao: 'Contrato editado',
        usuario_id: usuarioId || null,
        usuario_nome: usuarioNome || null,
      });
    }

    return salvo;
  }

  async alterarStatus(id: string, status: StatusContrato, usuarioId?: string, usuarioNome?: string): Promise<Contrato> {
    const contrato = await this.findOne(id);
    const statusAnterior = contrato.status;
    contrato.status = status;
    const salvo = await this.contratoRepository.save(contrato);

    await this.registrarHistorico({
      contrato_id: id,
      tipo_acao: TipoAcaoContrato.STATUS_ALTERADO,
      descricao: `Status alterado de ${statusAnterior} para ${status}`,
      status_anterior: statusAnterior,
      status_novo: status,
      usuario_id: usuarioId || null,
      usuario_nome: usuarioNome || null,
    });

    return salvo;
  }

  async liberarContrato(id: string, usuarioId: string, usuarioNome: string): Promise<Contrato> {
    const contrato = await this.findOne(id);

    if (contrato.status !== StatusContrato.AGUARDANDO_LIBERACAO) {
      throw new BadRequestException(
        `Apenas contratos AGUARDANDO LIBERAÇÃO podem ser liberados. Status atual: ${contrato.status}`
      );
    }

    contrato.status = StatusContrato.VIGENTE;
    contrato.liberado_por_id = usuarioId;
    contrato.liberado_por_nome = usuarioNome;
    contrato.liberado_em = new Date();
    const salvo = await this.contratoRepository.save(contrato);

    await this.registrarHistorico({
      contrato_id: id,
      tipo_acao: TipoAcaoContrato.LIBERADO,
      descricao: `Contrato liberado por ${usuarioNome}`,
      status_anterior: StatusContrato.AGUARDANDO_LIBERACAO,
      status_novo: StatusContrato.VIGENTE,
      usuario_id: usuarioId,
      usuario_nome: usuarioNome,
    });

    return salvo;
  }

  async rejeitarLiberacao(id: string, motivo?: string, usuarioId?: string, usuarioNome?: string): Promise<Contrato> {
    const contrato = await this.findOne(id);

    if (contrato.status !== StatusContrato.AGUARDANDO_LIBERACAO) {
      throw new BadRequestException(
        `Apenas contratos AGUARDANDO LIBERAÇÃO podem ser rejeitados. Status atual: ${contrato.status}`
      );
    }

    // Mantém AGUARDANDO_LIBERACAO — contrato pode ser editado e re-avaliado
    if (motivo) {
      contrato.observacoes = `[Liberação rejeitada] ${motivo}${contrato.observacoes ? '\n\n' + contrato.observacoes : ''}`;
    }
    const salvo = await this.contratoRepository.save(contrato);

    await this.registrarHistorico({
      contrato_id: id,
      tipo_acao: TipoAcaoContrato.LIBERACAO_REJEITADA,
      descricao: `Liberação rejeitada${motivo ? ': ' + motivo : ''}`,
      status_anterior: StatusContrato.AGUARDANDO_LIBERACAO,
      status_novo: StatusContrato.AGUARDANDO_LIBERACAO,
      usuario_id: usuarioId || null,
      usuario_nome: usuarioNome || null,
    });

    return salvo;
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

    await this.registrarHistorico({
      contrato_id: contratoId,
      tipo_acao: TipoAcaoContrato.TERMO_ADITIVO_CRIADO,
      descricao: `${numeroTermo} criado - ${dados.objeto || ''}`.trim(),
      detalhes: JSON.stringify({ termo_id: termoSalvo.id, tipo: dados.tipo }),
    });

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

  /**
   * Estatísticas de valores dos contratos vigentes (para dashboard)
   * valor_total, valor_gasto, valor_disponivel, percentual_executado
   */
  async getEstatisticasValores(orgaoId: string): Promise<{
    valor_total: number;
    valor_gasto: number;
    valor_disponivel: number;
    percentual_executado: number;
    contratos_vigentes: number;
  }> {
    const contratos = await this.findAll({
      orgaoId,
      status: StatusContrato.VIGENTE,
      vigentes: true,
    });

    let valor_total = 0;
    let valor_disponivel = 0;

    for (const c of contratos) {
      const valorGlobal = Number(c.valor_global || c.valor_inicial || 0);
      const saldo = Number((c as any).saldo_total_em_valor ?? valorGlobal);
      valor_total += valorGlobal;
      valor_disponivel += saldo;
    }

    const valor_gasto = Math.max(0, valor_total - valor_disponivel);
    const percentual_executado = valor_total > 0 ? (valor_gasto / valor_total) * 100 : 0;

    return {
      valor_total,
      valor_gasto,
      valor_disponivel,
      percentual_executado: Math.round(percentual_executado * 10) / 10,
      contratos_vigentes: contratos.length,
    };
  }

  // ============ IMPORTAÇÃO DE CONTRATOS ============

  async importarContratos(orgaoId: string, contratosJson: any[]): Promise<{
    importados: number;
    duplicados: number;
    erros: { numero: string; erro: string }[];
    contratos_criados: Contrato[];
  }> {
    const resultado = {
      importados: 0,
      duplicados: 0,
      erros: [] as { numero: string; erro: string }[],
      contratos_criados: [] as Contrato[],
    };

    for (const item of contratosJson) {
      try {
        // Parse do número do contrato (ex: "035/2025-Contrato" → "035/2025")
        const numeroOriginal = item.n || '';
        const numeroContrato = numeroOriginal.replace(/\s*-?\s*Contrato\s*$/i, '').trim();
        
        if (!numeroContrato) {
          resultado.erros.push({ numero: numeroOriginal, erro: 'Número do contrato vazio' });
          continue;
        }

        // Extrair ano e sequencial do número (ex: "035/2025")
        const partes = numeroContrato.split('/');
        const sequencial = parseInt(partes[0]) || 0;
        const ano = parseInt(partes[1]) || new Date().getFullYear();

        // Verificar duplicidade
        const existente = await this.contratoRepository.findOne({
          where: { numero_contrato: numeroContrato, orgao_id: orgaoId }
        });

        if (existente) {
          resultado.duplicados++;
          continue;
        }

        // Parse do CNPJ
        const cnpjOriginal = (item['cpf-cnpj'] || '').replace(/\s/g, '');
        const cnpjLimpo = cnpjOriginal.replace(/\D/g, '');
        const favorecido = item.favorecido || 'Não informado';

        // Buscar ou criar fornecedor
        let fornecedorId: string | undefined = undefined;
        if (cnpjLimpo) {
          let fornecedor = await this.fornecedorRepository.findOne({
            where: { cpf_cnpj: cnpjLimpo }
          });

          if (!fornecedor) {
            // Criar fornecedor básico com campos obrigatórios preenchidos
            fornecedor = this.fornecedorRepository.create({
              cpf_cnpj: cnpjLimpo,
              razao_social: favorecido,
              nome_fantasia: favorecido,
              tipo_pessoa: cnpjLimpo.length > 11 ? TipoPessoa.JURIDICA : TipoPessoa.FISICA,
              ativo: true,
              logradouro: 'A atualizar',
              bairro: 'A atualizar',
              cidade: 'A atualizar',
              uf: 'BA',
              cep: '00000000',
              telefone: '00000000000',
              email: 'a.atualizar@importacao.tmp',
              representante_nome: favorecido,
              representante_cpf: cnpjLimpo.length <= 11 ? cnpjLimpo : '00000000000',
            });
            fornecedor = await this.fornecedorRepository.save(fornecedor);
            this.logger.log(`Fornecedor criado na importação: ${favorecido} (${cnpjLimpo})`);
          }
          fornecedorId = fornecedor.id;
        }

        // Parse da vigência (ex: "22/12/2025 à 22/12/2026")
        const { dataInicio, dataFim } = this.parseVigencia(item.vigencia || '');

        // Parse do valor (ex: "R$ 27.499,24")
        const valor = this.parseValorBR(item.valor || '0');

        // Parse do objeto (limpar \r\n)
        const objeto = (item.objeto || 'Não informado').replace(/\r\n/g, '\n').trim();

        // Criar contrato
        const contrato = this.contratoRepository.create({
          numero_contrato: numeroContrato,
          ano,
          sequencial,
          orgao_id: orgaoId,
          fornecedor_id: fornecedorId as any,
          fornecedor_cnpj: cnpjLimpo || 'Não informado',
          fornecedor_razao_social: favorecido,
          tipo: TipoContrato.CONTRATO,
          categoria: CategoriaContrato.COMPRAS,
          status: StatusContrato.AGUARDANDO_LIBERACAO,
          objeto,
          valor_inicial: valor,
          valor_global: valor,
          valor_acrescimos: 0,
          valor_supressoes: 0,
          data_assinatura: dataInicio || new Date(),
          data_vigencia_inicio: dataInicio || new Date(),
          data_vigencia_fim: dataFim || new Date(),
          fiscal_nome: item.fiscal || null,
          observacoes: item.aditivos ? `Aditivos: ${item.aditivos}` : `Importado de sistema externo`,
        });

        const contratoSalvo = await this.contratoRepository.save(contrato) as any as Contrato;
        resultado.contratos_criados.push(contratoSalvo);
        resultado.importados++;

        await this.registrarHistorico({
          contrato_id: contratoSalvo.id,
          tipo_acao: TipoAcaoContrato.CRIADO,
          descricao: `Contrato ${numeroContrato} importado de sistema externo — aguardando liberação`,
          status_novo: StatusContrato.AGUARDANDO_LIBERACAO,
          usuario_nome: 'Importação',
        });

        this.logger.log(`Contrato importado: ${numeroContrato} - ${favorecido}`);
      } catch (error) {
        const numero = item.n || 'desconhecido';
        resultado.erros.push({ numero, erro: error.message });
        this.logger.warn(`Erro ao importar contrato ${numero}: ${error.message}`);
      }
    }

    this.logger.log(`Importação concluída: ${resultado.importados} importados, ${resultado.duplicados} duplicados, ${resultado.erros.length} erros`);

    // Notificar liberadores uma vez para todos os contratos importados
    if (resultado.contratos_criados.length > 0) {
      try {
        const liberadores = await this.usuarioRepository.find({
          where: { orgao_id: orgaoId, pode_liberar_contratos: true, ativo: true },
          select: ['id', 'email', 'telefone'],
        });
        if (liberadores.length > 0) {
          const valorTotal = resultado.contratos_criados.reduce((sum, c) => sum + Number(c.valor_global || 0), 0);
          await this.notificacoesService.notificarContratoAguardandoLiberacao(
            orgaoId,
            `${resultado.importados} contratos importados`,
            resultado.contratos_criados[0].id,
            valorTotal,
            'Importação em lote',
            liberadores.map(l => ({ id: l.id, email: l.email, telefone: l.telefone })),
          );
        }
      } catch (error) {
        this.logger.error(`Erro ao notificar liberadores após importação: ${error.message}`);
      }
    }

    return resultado;
  }

  private parseVigencia(vigencia: string): { dataInicio: Date | null; dataFim: Date | null } {
    try {
      // Formato: "22/12/2025 à 22/12/2026" ou "22/12/2025 a 22/12/2026"
      const partes = vigencia.split(/\s+[àa]\s+/);
      if (partes.length !== 2) return { dataInicio: null, dataFim: null };

      const parseDataBR = (str: string): Date | null => {
        const match = str.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!match) return null;
        return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
      };

      return {
        dataInicio: parseDataBR(partes[0]),
        dataFim: parseDataBR(partes[1]),
      };
    } catch {
      return { dataInicio: null, dataFim: null };
    }
  }

  private parseValorBR(valorStr: string): number {
    // "R$ 27.499,24" → 27499.24
    const limpo = valorStr.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
    return parseFloat(limpo) || 0;
  }

  private determinarStatusPorVigencia(dataFim: Date | null): StatusContrato {
    if (!dataFim) return StatusContrato.VIGENTE;
    return dataFim >= new Date() ? StatusContrato.VIGENTE : StatusContrato.ENCERRADO;
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

      // Cria contrato automaticamente (criar() já define AGUARDANDO_LIBERACAO e notifica)
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
        tipo: TipoContrato.CONTRATO,
        observacoes: `Contrato gerado automaticamente após homologação da licitação ${licitacao.numero_processo}`,
        usuario_cadastro_nome: 'Sistema',
      });

      this.logger.log(`Contrato ${contrato.numero_contrato} gerado automaticamente para licitação ${licitacaoId}`);

      return contrato;
    } catch (error) {
      this.logger.error(`Erro ao gerar contrato automaticamente para licitação ${licitacaoId}:`, error);
      throw error;
    }
  }

  // ============ HISTÓRICO ============

  async registrarHistorico(dados: Partial<HistoricoContrato>): Promise<HistoricoContrato> {
    const historico = this.historicoContratoRepository.create(dados);
    return this.historicoContratoRepository.save(historico);
  }

  async listarHistorico(contratoId: string): Promise<HistoricoContrato[]> {
    return this.historicoContratoRepository.find({
      where: { contrato_id: contratoId },
      order: { created_at: 'DESC' },
    });
  }

  // ============ NOTIFICAÇÕES ============

  /**
   * Busca usuários com permissão de liberar contratos do órgão e envia notificação
   */
  async notificarLiberadores(contrato: Contrato, origem: string): Promise<void> {
    try {
      const liberadores = await this.usuarioRepository.find({
        where: {
          orgao_id: contrato.orgao_id,
          pode_liberar_contratos: true,
          ativo: true,
        },
        select: ['id', 'email', 'telefone'],
      });

      if (liberadores.length === 0) {
        this.logger.warn(`Nenhum liberador encontrado para órgão ${contrato.orgao_id}. Contrato ${contrato.numero_contrato} ficará aguardando.`);
        return;
      }

      await this.notificacoesService.notificarContratoAguardandoLiberacao(
        contrato.orgao_id,
        contrato.numero_contrato,
        contrato.id,
        Number(contrato.valor_global) || 0,
        origem,
        liberadores.map(l => ({ id: l.id, email: l.email, telefone: l.telefone })),
      );
    } catch (error) {
      this.logger.error(`Erro ao notificar liberadores do contrato ${contrato.numero_contrato}: ${error.message}`, error.stack);
    }
  }
}
