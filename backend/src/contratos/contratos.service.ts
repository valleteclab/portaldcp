import { Injectable, NotFoundException, BadRequestException, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan, LessThanOrEqual, MoreThanOrEqual, In, Brackets, Not } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Contrato, StatusContrato, TipoContrato, CategoriaContrato, ModalidadeExecucao } from './entities/contrato.entity';
import { TermoAditivo, TipoTermoAditivo, StatusTermoAditivo } from './entities/termo-aditivo.entity';
import { DocumentoContrato, TipoDocumentoContrato } from './entities/documento-contrato.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { ItemLicitacao, StatusItem } from '../itens/entities/item-licitacao.entity';
import { Fornecedor, TipoPessoa } from '../fornecedores/entities/fornecedor.entity';
import { ItemContrato } from '../almoxarifado/entities/item-contrato.entity';
import { HistoricoContrato, TipoAcaoContrato } from './entities/historico-contrato.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { Medicao, StatusMedicao } from './entities/medicao.entity';
import { ItemCronograma } from './entities/item-cronograma.entity';
import { ItemMedicaoItem } from './entities/item-medicao-item.entity';
import { AtestacaoMensal } from './entities/atestacao-mensal.entity';
import { FrotaContrato } from '../frota/entities/frota-contrato.entity';
import { Requisicao, StatusRequisicao, TipoRequisicao } from '../almoxarifado/entities/requisicao.entity';
import { PropostaItem } from '../propostas/entities/proposta-item.entity';
import { Proposta, StatusProposta } from '../propostas/entities/proposta.entity';

@Injectable()
export class ContratosService implements OnModuleInit {
  private readonly logger = new Logger(ContratosService.name);
  private readonly uploadPath = path.join(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'), 'contratos');

  constructor(
    @InjectRepository(Contrato)
    private contratoRepository: Repository<Contrato>,
    @InjectRepository(DocumentoContrato)
    private documentoContratoRepository: Repository<DocumentoContrato>,
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
    @InjectRepository(Requisicao)
    private requisicaoRepository: Repository<Requisicao>,
    @InjectRepository(HistoricoContrato)
    private historicoContratoRepository: Repository<HistoricoContrato>,
    @InjectRepository(Usuario)
    private usuarioRepository: Repository<Usuario>,
    @InjectRepository(Medicao)
    private medicaoRepository: Repository<Medicao>,
    @InjectRepository(ItemCronograma)
    private itemCronogramaRepository: Repository<ItemCronograma>,
    @InjectRepository(ItemMedicaoItem)
    private itemMedicaoItemRepository: Repository<ItemMedicaoItem>,
    @InjectRepository(AtestacaoMensal)
    private atestacaoRepository: Repository<AtestacaoMensal>,
    @InjectRepository(FrotaContrato)
    private frotaContratoRepository: Repository<FrotaContrato>,
    @InjectRepository(Proposta)
    private propostaRepository: Repository<Proposta>,
    @InjectRepository(PropostaItem)
    private propostaItemRepository: Repository<PropostaItem>,
    private notificacoesService: NotificacoesService,
  ) {
    if (!fs.existsSync(this.uploadPath)) {
      fs.mkdirSync(this.uploadPath, { recursive: true });
    }
  }

  async onModuleInit() {
    await this.sincronizarDatasCicloRetroativas();
  }

  private normalizarData(date?: Date | string | null): string | null {
    if (!date) return null;
    return new Date(date).toISOString().split('T')[0];
  }

  private async sincronizarDatasCicloRetroativas(): Promise<void> {
    try {
      const termosRenovacao = await this.termoAditivoRepository.find({
        where: {
          renovacao_ciclo: true,
          status: Not(StatusTermoAditivo.CANCELADO),
        },
        order: {
          contrato_id: 'ASC',
          sequencial: 'DESC',
        },
      });

      if (!termosRenovacao.length) {
        return;
      }

      const ultimoTermoPorContrato = new Map<string, TermoAditivo>();
      for (const termo of termosRenovacao) {
        if (!ultimoTermoPorContrato.has(termo.contrato_id)) {
          ultimoTermoPorContrato.set(termo.contrato_id, termo);
        }
      }

      const contratos = await this.contratoRepository.findBy({
        id: In([...ultimoTermoPorContrato.keys()]),
      });

      let atualizados = 0;
      for (const contrato of contratos) {
        const termo = ultimoTermoPorContrato.get(contrato.id);
        if (!termo?.data_assinatura) {
          continue;
        }

        const dataInicioCiclo = termo.data_vigencia_inicio || termo.data_assinatura;
        const mudouAssinatura = this.normalizarData(contrato.data_assinatura) !== this.normalizarData(termo.data_assinatura);
        const mudouInicio = this.normalizarData(contrato.data_vigencia_inicio) !== this.normalizarData(dataInicioCiclo);
        const mudouRenovacao = this.normalizarData(contrato.data_renovacao_ciclo) !== this.normalizarData(termo.data_assinatura);

        if (!mudouAssinatura && !mudouInicio && !mudouRenovacao) {
          continue;
        }

        contrato.data_assinatura = termo.data_assinatura as any;
        contrato.data_vigencia_inicio = dataInicioCiclo as any;
        contrato.data_renovacao_ciclo = termo.data_assinatura as any;
        await this.contratoRepository.save(contrato);
        atualizados++;
      }

      if (atualizados > 0) {
        this.logger.log(`[sincronizarDatasCicloRetroativas] ${atualizados} contrato(s) atualizados com datas do ultimo ciclo`);
      }
    } catch (error) {
      this.logger.error(`[sincronizarDatasCicloRetroativas] Erro ao sincronizar datas retroativas: ${error.message}`);
    }
  }

  // ============ CONTRATOS ============

  async criar(dados: Partial<Contrato>): Promise<Contrato> {
    // Log dos dados recebidos para debug
    this.logger.log(`[criar] Dados recebidos: ${JSON.stringify({
      orgao_id: dados.orgao_id,
      numero_contrato: dados.numero_contrato,
      fornecedor_id: dados.fornecedor_id,
      objeto: dados.objeto?.substring(0, 50)
    })}`);

    // Validar orgao_id
    if (!dados.orgao_id) {
      this.logger.error(`[criar] orgao_id é obrigatório mas está null/undefined`);
      throw new BadRequestException('orgao_id é obrigatório para criar contrato');
    }

    // Se já tem número e sequencial (importação), usar os valores fornecidos
    // Senão, gerar novo número sequencial
    let numeroContrato = dados.numero_contrato;
    let sequencial = dados.sequencial;
    let ano = dados.ano || new Date().getFullYear();

    if (!numeroContrato || !sequencial) {
      // Gerar número do contrato automaticamente
      ano = new Date().getFullYear();
      const ultimoContrato = await this.contratoRepository.findOne({
        where: { orgao_id: dados.orgao_id, ano },
        order: { sequencial: 'DESC' }
      });

      sequencial = ultimoContrato ? ultimoContrato.sequencial + 1 : 1;
      numeroContrato = `${String(sequencial).padStart(3, '0')}/${ano}`;
    }

    const contrato = this.contratoRepository.create({
      ...dados,
      ano,
      sequencial,
      numero_contrato: numeroContrato,
      valor_global: dados.valor_global ?? dados.valor_inicial,
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
    busca?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: Contrato[]; total: number; page: number; limit: number; totalPages: number }> {
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

    const buscaLimpa = filtros?.busca?.trim().replace(/[%_\\]/g, '') ?? '';
    if (buscaLimpa.length > 0) {
      const busca = `%${buscaLimpa}%`;
      query.andWhere(
        new Brackets((qb) => {
          qb.where('contrato.numero_contrato ILIKE :busca', { busca })
            .orWhere('contrato.objeto ILIKE :busca', { busca })
            .orWhere('contrato.numero_processo ILIKE :busca', { busca })
            .orWhere('fornecedor.razao_social ILIKE :busca', { busca })
            .orWhere('fornecedor.cpf_cnpj ILIKE :busca', { busca });
        }),
      );
    }

    // Ordenação: se filtrar por vigentes, ordena por data de vencimento (próximos primeiro)
    // Caso contrário, ordena por data de criação (mais recentes primeiro)
    if (filtros?.vigentes) {
      query.orderBy('contrato.data_vigencia_fim', 'ASC');
    } else {
      query.orderBy('contrato.created_at', 'DESC');
    }

    // Paginação
    const page = filtros?.page || 1;
    const limit = filtros?.limit || 20;
    const skip = (page - 1) * limit;

    // Contar total de registros
    const total = await query.getCount();

    // Aplicar paginação
    query.skip(skip).take(limit);

    const contratos = await query.getMany();
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
      const valorGlobal = Number(contrato.valor_global || contrato.valor_inicial || 0);

      const valorExecAnterior = Number(contrato.valor_executado_anterior) || 0;
      if (contrato.modalidade_execucao === ModalidadeExecucao.MEDICAO) {
        const { aprovado, comprometido } = medicoesPorContrato.get(contrato.id) || { aprovado: 0, comprometido: 0 };
        saldoTotalEmValor = Math.max(0, valorGlobal - valorExecAnterior - comprometido);
        (contrato as any).valor_medido_total = aprovado;
        (contrato as any).valor_comprometido_total = comprometido;
        (contrato as any).valor_em_analise = Math.max(0, comprometido - aprovado);
      } else {
        const base = itens.length > 0
          ? itens.reduce((total, item) => total + Number(item.saldo_disponivel) * Number(item.valor_unitario), 0)
          : Number(contrato.valor_global || contrato.valor_inicial || 0);
        saldoTotalEmValor = Math.max(0, base - valorExecAnterior);
      }

      if (this.contratoUsaCicloAtivo(contrato)) {
        saldoTotalEmValor = await this.enriquecerCicloAtivoContrato(contrato, valorGlobal);
      }

      (contrato as any).itens = itens;
      (contrato as any).saldo_total_em_valor = saldoTotalEmValor;
      (contrato as any).total_itens = itens.length;
      (contrato as any).fornecedor_telefone =
        (contrato as any).fornecedor?.representante_telefone ||
        (contrato as any).fornecedor?.telefone ||
        null;
    }

    const totalPages = Math.ceil(total / limit);

    return {
      data: contratos,
      total,
      page,
      limit,
      totalPages
    };
  }

  /** Anos distintos com contratos (órgão ou fornecedor), para filtros da lista */
  async findAnosDistintos(filtros: {
    orgaoId?: string;
    fornecedorId?: string;
  }): Promise<number[]> {
    const qb = this.contratoRepository
      .createQueryBuilder('contrato')
      .select('DISTINCT contrato.ano', 'ano')
      .where('contrato.ano IS NOT NULL');

    if (filtros.orgaoId) {
      qb.andWhere('contrato.orgao_id = :orgaoId', { orgaoId: filtros.orgaoId });
    }
    if (filtros.fornecedorId) {
      qb.andWhere('contrato.fornecedor_id = :fornecedorId', { fornecedorId: filtros.fornecedorId });
    }

    if (!filtros.orgaoId && !filtros.fornecedorId) {
      return [];
    }

    const rows = await qb.orderBy('contrato.ano', 'DESC').getRawMany();
    return rows
      .map((r) => Number(r.ano))
      .filter((n) => Number.isFinite(n));
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

    // Sobrepõe consumo real do módulo de frota, se este contrato tiver um FrotaContrato vinculado
    const frotaContrato = await this.frotaContratoRepository.findOne({
      where: { contrato_id: id },
    });
    if (frotaContrato?.itens?.length) {
      const consumoMap = new Map<string, number>();
      for (const fi of frotaContrato.itens) {
        if (fi.item_contrato_id) {
          consumoMap.set(fi.item_contrato_id, Number(fi.quantidade_consumida ?? 0));
        }
      }
      for (const item of itens) {
        const consumido = consumoMap.get(item.id);
        if (consumido !== undefined && consumido > 0) {
          const qtdContratada = Number(item.quantidade_contratada);
          const qtdEmpenhada = Number(item.quantidade_empenhada);
          (item as any).quantidade_entregue = consumido;
          (item as any).saldo_disponivel = Math.max(0, qtdContratada - qtdEmpenhada - consumido);
        }
      }
    }

    let saldoTotalEmValor: number;
    const valorGlobal = Number(contrato.valor_global || contrato.valor_inicial || 0);
    const valorExecAnterior = Number(contrato.valor_executado_anterior) || 0;

    if (contrato.modalidade_execucao === ModalidadeExecucao.MEDICAO) {
      const { aprovado, comprometido } = await this.somarValorMedicoes(contrato.id);
      saldoTotalEmValor = Math.max(0, valorGlobal - valorExecAnterior - comprometido);
      (contrato as any).valor_medido_total = aprovado;
      (contrato as any).valor_comprometido_total = comprometido;
      (contrato as any).valor_em_analise = Math.max(0, comprometido - aprovado);

    } else {
      const base = itens.length > 0
        ? itens.reduce((total, item) => total + Number(item.saldo_disponivel) * Number(item.valor_unitario), 0)
        : Number(contrato.valor_global || contrato.valor_inicial || 0);
      saldoTotalEmValor = Math.max(0, base - valorExecAnterior);
    }

    if (this.contratoUsaCicloAtivo(contrato)) {
      saldoTotalEmValor = await this.enriquecerCicloAtivoContrato(
        contrato,
        valorGlobal,
        contrato.modalidade_execucao === ModalidadeExecucao.MEDICAO,
      );
    }

    // Adiciona campos calculados ao contrato
    (contrato as any).itens = itens;
    (contrato as any).saldo_total_em_valor = saldoTotalEmValor;
    (contrato as any).total_itens = itens.length;

    return contrato;
  }

  private contratoUsaCicloAtivo(contrato: Contrato): boolean {
    return Boolean(
      contrato.data_renovacao_ciclo &&
      (
        contrato.modalidade_execucao === ModalidadeExecucao.MEDICAO ||
        contrato.modalidade_execucao === ModalidadeExecucao.ORDEM_SERVICO
      ),
    );
  }

  private async enriquecerCicloAtivoContrato(
    contrato: Contrato,
    valorGlobal: number,
    incluirHistorico = false,
  ): Promise<number> {
    const dataRenovacao = contrato.data_renovacao_ciclo ? new Date(contrato.data_renovacao_ciclo) : null;
    if (!dataRenovacao) return valorGlobal;

    const termosCiclo = await this.termoAditivoRepository.find({
      where: { contrato_id: contrato.id, renovacao_ciclo: true },
      order: { sequencial: 'ASC' },
    });
    const termosAtivos = termosCiclo.filter((t) => t.status !== 'CANCELADO');
    const termoAtual = termosAtivos[termosAtivos.length - 1];
    const valorInicialCiclo = termoAtual
      ? (Number(termoAtual.valor_ciclo) || Number(termoAtual.valor_acrescimo) || valorGlobal)
      : valorGlobal;

    let acrescimosCiclo = 0;
    let supressoesCiclo = 0;
    const todosTermos = await this.termoAditivoRepository.find({
      where: { contrato_id: contrato.id },
      order: { sequencial: 'ASC' },
    });

    if (termoAtual) {
      for (const termo of todosTermos) {
        if (termo.status === 'CANCELADO') continue;
        if (termo.sequencial > termoAtual.sequencial && !termo.renovacao_ciclo) {
          if (Number(termo.valor_acrescimo) > 0) acrescimosCiclo += Number(termo.valor_acrescimo);
          if (Number(termo.valor_supressao) > 0) supressoesCiclo += Number(termo.valor_supressao);
        }
      }
    }

    const valorGlobalCiclo = valorInicialCiclo + acrescimosCiclo - supressoesCiclo;
    const comprometidoCiclo = await this.obterValorComprometidoCiclo(contrato, dataRenovacao);
    const saldoCiclo = Math.max(0, valorGlobalCiclo - comprometidoCiclo);

    (contrato as any).ciclo_ativo = {
      valor_inicial: valorInicialCiclo,
      valor_acrescimos: acrescimosCiclo,
      valor_supressoes: supressoesCiclo,
      valor_global: valorGlobalCiclo,
      saldo_disponivel: saldoCiclo,
      valor_comprometido: comprometidoCiclo,
      data_renovacao: contrato.data_renovacao_ciclo,
    };

    if (incluirHistorico && contrato.modalidade_execucao === ModalidadeExecucao.MEDICAO) {
      const historicoCiclos: Array<{
        sequencial: number;
        numero_termo: string;
        data_inicio: string;
        data_fim: string;
        valor_inicial: number;
        valor_global: number;
        valor_executado: number;
      }> = [];

      const primeiroTermoCiclo = termosAtivos[0];
      if (primeiroTermoCiclo) {
        let valorGlobalAntes = Number(contrato.valor_inicial);
        for (const termo of todosTermos) {
          if (termo.status === 'CANCELADO') continue;
          if (termo.sequencial < primeiroTermoCiclo.sequencial) {
            valorGlobalAntes += Number(termo.valor_acrescimo || 0) - Number(termo.valor_supressao || 0);
          }
        }

        const dataPrimeiraRenovacao = new Date(primeiroTermoCiclo.data_assinatura);
        const { aprovado: aprovadoCiclo0 } = await this.somarValorMedicoesAteData(contrato.id, dataPrimeiraRenovacao);

        historicoCiclos.push({
          sequencial: 0,
          numero_termo: 'Contrato original',
          data_inicio: '',
          data_fim: primeiroTermoCiclo.data_assinatura ? new Date(primeiroTermoCiclo.data_assinatura).toISOString().split('T')[0] : '',
          valor_inicial: Number(contrato.valor_inicial),
          valor_global: valorGlobalAntes,
          valor_executado: aprovadoCiclo0,
        });

        for (let i = 0; i < termosAtivos.length - 1; i++) {
          const tInicio = termosAtivos[i];
          const tFim = termosAtivos[i + 1];
          const vcInicio = Number(tInicio.valor_ciclo) || Number(tInicio.valor_acrescimo) || valorGlobal;
          const dataInicioCiclo = new Date(tInicio.data_assinatura);
          const dataFimCiclo = new Date(tFim.data_assinatura);
          const { aprovado: aprovadoCicloI } = await this.somarValorMedicoesEntreDatas(contrato.id, dataInicioCiclo, dataFimCiclo);

          historicoCiclos.push({
            sequencial: i + 1,
            numero_termo: tInicio.numero_termo,
            data_inicio: new Date(tInicio.data_assinatura).toISOString().split('T')[0],
            data_fim: new Date(tFim.data_assinatura).toISOString().split('T')[0],
            valor_inicial: vcInicio,
            valor_global: vcInicio,
            valor_executado: aprovadoCicloI,
          });
        }
      }

      (contrato as any).historico_ciclos = historicoCiclos;
    }

    return saldoCiclo;
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

    const migracaoPorContrato = await this.calcularValorMigracaoPorItemBatch(contratoIds);
    for (const [contratoId, valorMigracao] of migracaoPorContrato.entries()) {
      const curr = resultado.get(contratoId);
      if (!curr || valorMigracao <= 0) continue;
      curr.aprovado += valorMigracao;
      curr.comprometido += valorMigracao;
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

    const valorMigracaoPorItem = await this.calcularValorMigracaoPorItem(contratoId);

    return {
      aprovado: Number(resultAprovado?.total ?? 0) + valorMigracaoPorItem,
      comprometido: Number(resultComprometido?.total ?? 0) + valorMigracaoPorItem,
    };
  }

  private async calcularValorMigracaoPorItem(contratoId: string): Promise<number> {
    const mapa = await this.calcularValorMigracaoPorItemBatch([contratoId]);
    return mapa.get(contratoId) || 0;
  }

  private async calcularValorMigracaoPorItemBatch(contratoIds: string[]): Promise<Map<string, number>> {
    const resultado = new Map<string, number>();
    if (contratoIds.length === 0) return resultado;

    const itensCronograma = await this.itemCronogramaRepository.find({
      where: { contrato_id: In(contratoIds) },
    });
    if (itensCronograma.length === 0) return resultado;

    const itemIds = itensCronograma.map((item) => item.id);
    const itensAprovados = await this.itemMedicaoItemRepository
      .createQueryBuilder('imi')
      .innerJoin(Medicao, 'm', 'm.id = imi.medicao_id')
      .select('imi.item_cronograma_id', 'item_cronograma_id')
      .addSelect('COALESCE(SUM(imi.valor_medido), 0)', 'valor_aprovado')
      .where('imi.item_cronograma_id IN (:...itemIds)', { itemIds })
      .andWhere('m.status = :status', { status: StatusMedicao.APROVADA })
      .groupBy('imi.item_cronograma_id')
      .getRawMany<{ item_cronograma_id: string; valor_aprovado: string }>();

    const valoresAprovadosPorItem = new Map<string, number>();
    for (const item of itensAprovados) {
      valoresAprovadosPorItem.set(item.item_cronograma_id, Number(item.valor_aprovado || 0));
    }

    for (const item of itensCronograma) {
      let valorItem = 0;
      if (
        item.unidade_medida === 'MENSAL' &&
        Number(item.valor_migracao_reais || 0) > 0
      ) {
        valorItem = Number(item.valor_migracao_reais || 0);
      } else {
        const valorAcumuladoItem =
          Number(item.quantidade_medida || 0) *
          Number(item.valor_unitario || 0);
        const valorAprovadoItem = valoresAprovadosPorItem.get(item.id) || 0;
        valorItem = Math.max(0, valorAcumuladoItem - valorAprovadoItem);
      }

      if (valorItem > 0) {
        resultado.set(
          item.contrato_id,
          (resultado.get(item.contrato_id) || 0) + valorItem,
        );
      }
    }

    return resultado;
  }

  private async somarValorMedicoesCiclo(contratoId: string, dataRenovacao: Date): Promise<{ aprovado: number; comprometido: number }> {
    const statusComprometidos = [
      'SUBMETIDA', 'AGUARDANDO_ATESTE', 'PARCIALMENTE_ATESTADA', 'AGUARDANDO_APROVACAO', 'APROVADA',
    ];

    const resultAprovado = await this.medicaoRepository
      .createQueryBuilder('m')
      .select('COALESCE(SUM(m.valor_medido), 0)', 'total')
      .where('m.contrato_id = :contratoId', { contratoId })
      .andWhere('m.status = :status', { status: 'APROVADA' })
      .andWhere('m.periodo_inicio >= :dataRenovacao', { dataRenovacao })
      .getRawOne<{ total: string }>();

    const resultComprometido = await this.medicaoRepository
      .createQueryBuilder('m')
      .select('COALESCE(SUM(m.valor_medido), 0)', 'total')
      .where('m.contrato_id = :contratoId', { contratoId })
      .andWhere('m.status IN (:...status)', { status: statusComprometidos })
      .andWhere('m.periodo_inicio >= :dataRenovacao', { dataRenovacao })
      .getRawOne<{ total: string }>();

    return {
      aprovado: Number(resultAprovado?.total ?? 0),
      comprometido: Number(resultComprometido?.total ?? 0),
    };
  }

  private async somarValorMedicoesAteData(contratoId: string, dataFim: Date): Promise<{ aprovado: number; comprometido: number }> {
    const resultAprovado = await this.medicaoRepository
      .createQueryBuilder('m')
      .select('COALESCE(SUM(m.valor_medido), 0)', 'total')
      .where('m.contrato_id = :contratoId', { contratoId })
      .andWhere('m.status = :status', { status: 'APROVADA' })
      .andWhere('m.periodo_inicio < :dataFim', { dataFim })
      .getRawOne<{ total: string }>();

    return {
      aprovado: Number(resultAprovado?.total ?? 0),
      comprometido: 0,
    };
  }

  private async somarValorMedicoesEntreDatas(contratoId: string, dataInicio: Date, dataFim: Date): Promise<{ aprovado: number; comprometido: number }> {
    const resultAprovado = await this.medicaoRepository
      .createQueryBuilder('m')
      .select('COALESCE(SUM(m.valor_medido), 0)', 'total')
      .where('m.contrato_id = :contratoId', { contratoId })
      .andWhere('m.status = :status', { status: 'APROVADA' })
      .andWhere('m.periodo_inicio >= :dataInicio', { dataInicio })
      .andWhere('m.periodo_inicio < :dataFim', { dataFim })
      .getRawOne<{ total: string }>();

    return {
      aprovado: Number(resultAprovado?.total ?? 0),
      comprometido: 0,
    };
  }

  private async obterValorComprometidoCiclo(contrato: Contrato, dataRenovacao: Date): Promise<number> {
    if (contrato.modalidade_execucao === ModalidadeExecucao.MEDICAO) {
      const { comprometido } = await this.somarValorMedicoesCiclo(contrato.id, dataRenovacao);
      return comprometido;
    }

    if (contrato.modalidade_execucao === ModalidadeExecucao.ORDEM_SERVICO) {
      return this.somarValorOrdensServico(contrato.id, dataRenovacao);
    }

    return 0;
  }

  private async somarValorOrdensServico(contratoId: string, dataInicio?: Date): Promise<number> {
    const qb = this.requisicaoRepository
      .createQueryBuilder('req')
      .select('COALESCE(SUM(req.valor_total_estimado), 0)', 'total')
      .where('req.contrato_id = :contratoId', { contratoId })
      .andWhere('req.tipo = :tipo', { tipo: TipoRequisicao.ORDEM_SERVICO })
      .andWhere('req.status IN (:...status)', {
        status: [
          StatusRequisicao.RASCUNHO,
          StatusRequisicao.AGUARDANDO_AUTORIZACAO,
          StatusRequisicao.AUTORIZADA,
          StatusRequisicao.ORDEM_GERADA,
        ],
      });

    if (dataInicio) {
      qb.andWhere('COALESCE(req.data_solicitacao, req.created_at) >= :dataInicio', { dataInicio });
    }

    const result = await qb.getRawOne<{ total: string }>();
    return Number(result?.total ?? 0);
  }

  async findByNumero(numeroContrato: string, orgaoId: string): Promise<Contrato | null> {
    const contrato = await this.contratoRepository.findOne({
      where: { numero_contrato: numeroContrato, orgao_id: orgaoId },
      relations: ['orgao', 'fornecedor', 'licitacao']
    });

    return contrato || null;
  }

  async detectarItensDuplicados(contratoId: string): Promise<{
    grupos: Array<{
      descricao: string;
      valor_unitario: number;
      quantidade: number;
      ids: string[];
      manter_id: string;
      remover_ids: string[];
    }>;
    total_duplicados: number;
  }> {
    const itens = await this.itemContratoRepository.find({
      where: { contrato_id: contratoId },
      order: { numero_item: 'ASC', created_at: 'ASC' },
    });

    const agrupados = new Map<string, typeof itens>();
    for (const item of itens) {
      const descNorm = (item.descricao || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const chave = `${descNorm}|${Number(item.valor_unitario)}|${Number(item.quantidade_contratada)}`;
      if (!agrupados.has(chave)) agrupados.set(chave, []);
      agrupados.get(chave)!.push(item);
    }

    const grupos: Array<{
      descricao: string;
      valor_unitario: number;
      quantidade: number;
      ids: string[];
      manter_id: string;
      remover_ids: string[];
    }> = [];

    for (const [, grupo] of agrupados) {
      if (grupo.length <= 1) continue;
      const manter = grupo[0];
      const remover = grupo.slice(1);
      grupos.push({
        descricao: manter.descricao,
        valor_unitario: Number(manter.valor_unitario),
        quantidade: Number(manter.quantidade_contratada),
        ids: grupo.map((i) => i.id),
        manter_id: manter.id,
        remover_ids: remover.map((i) => i.id),
      });
    }

    return {
      grupos,
      total_duplicados: grupos.reduce((s, g) => s + g.remover_ids.length, 0),
    };
  }

  async removerItensDuplicados(contratoId: string): Promise<{ removidos: number; grupos: number }> {
    const { grupos } = await this.detectarItensDuplicados(contratoId);
    if (grupos.length === 0) return { removidos: 0, grupos: 0 };

    const idsRemover = grupos.flatMap((g) => g.remover_ids);
    await this.itemContratoRepository.delete(idsRemover);

    return { removidos: idsRemover.length, grupos: grupos.length };
  }

  async buscarTermoAditivoPorNome(contratoId: string, nome: string): Promise<TermoAditivo | null> {
    return this.termoAditivoRepository.findOne({
      where: { contrato_id: contratoId, objeto: nome },
    }) as Promise<TermoAditivo | null>;
  }

  async findByNumeros(numeros: string[], orgaoId: string): Promise<Contrato[]> {
    if (numeros.length === 0) return [];
    return this.contratoRepository.find({
      where: numeros.map((n) => ({ numero_contrato: n, orgao_id: orgaoId })),
      select: ['id', 'numero_contrato'],
    });
  }

  async atualizar(id: string, dados: Partial<Contrato>, usuarioId?: string, usuarioNome?: string): Promise<Contrato> {
    const contrato = await this.findOne(id);
    const eraEnviadoPncp = contrato.enviado_pncp;
    
    // Se o valor_inicial foi alterado, precisamos recalcular o valor_global
    const valorInicialAnterior = Number(contrato.valor_inicial) || 0;
    const novoValorInicial = dados.valor_inicial !== undefined ? Number(dados.valor_inicial) : valorInicialAnterior;
    
    if (dados.valor_inicial !== undefined && novoValorInicial !== valorInicialAnterior) {
      // Recalcular valor_global: valor_inicial + acrescimos - supressoes
      const acrescimos = Number(contrato.valor_acrescimos) || 0;
      const supressoes = Number(contrato.valor_supressoes) || 0;
      dados.valor_global = Math.max(0, novoValorInicial + acrescimos - supressoes);
    }
    
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

    // Se vigência já expirou, liberar como ENCERRADO; caso contrário, VIGENTE
    const dataFim = contrato.data_vigencia_fim ? new Date(contrato.data_vigencia_fim) : null;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const fimNormalizado = dataFim ? new Date(dataFim) : null;
    if (fimNormalizado) fimNormalizado.setHours(0, 0, 0, 0);
    contrato.status = !fimNormalizado || fimNormalizado >= hoje ? StatusContrato.VIGENTE : StatusContrato.ENCERRADO;
    contrato.liberado_por_id = usuarioId;
    contrato.liberado_por_nome = usuarioNome;
    contrato.liberado_em = new Date();
    const salvo = await this.contratoRepository.save(contrato);

    await this.registrarHistorico({
      contrato_id: id,
      tipo_acao: TipoAcaoContrato.LIBERADO,
      descricao: `Contrato liberado por ${usuarioNome}${contrato.status === StatusContrato.ENCERRADO ? ' (vigência já expirada)' : ''}`,
      status_anterior: StatusContrato.AGUARDANDO_LIBERACAO,
      status_novo: contrato.status,
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

    // Gerar número do termo: usar primeiro "gap" disponível para permitir reutilizar números de termos excluídos
    const todosTermos = await this.termoAditivoRepository.find({
      where: { contrato_id: contratoId },
      select: ['sequencial']
    });
    const sequenciaisUsados = new Set(todosTermos.map(t => t.sequencial));
    let sequencial = 1;
    while (sequenciaisUsados.has(sequencial)) sequencial++;
    const numeroTermo = `${sequencial}º ${dados.tipo === TipoTermoAditivo.APOSTILAMENTO ? 'Apostilamento' : 'Termo Aditivo'}`;

    const termo = this.termoAditivoRepository.create({
      ...dados,
      contrato_id: contratoId,
      sequencial,
      numero_termo: numeroTermo,
      justificativa: dados.justificativa ?? dados.objeto ?? undefined,
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

  async excluirTermoAditivo(contratoId: string, termoId: string): Promise<{ message: string }> {
    const contrato = await this.findOne(contratoId);
    const termo = await this.findTermoAditivo(termoId);
    if (termo.contrato_id !== contratoId) {
      throw new NotFoundException('Termo aditivo não pertence a este contrato');
    }
    if (termo.status !== StatusTermoAditivo.CANCELADO) {
      throw new BadRequestException('Apenas termos aditivos cancelados podem ser excluídos. Cancele o termo antes de excluir.');
    }

    // Desvincular documentos do termo (preservar como documentos do contrato)
    await this.documentoContratoRepository.update(
      { termo_aditivo_id: termoId },
      { termo_aditivo_id: null }
    );

    await this.termoAditivoRepository.delete(termoId);

    await this.registrarHistorico({
      contrato_id: contratoId,
      tipo_acao: TipoAcaoContrato.STATUS_ALTERADO,
      descricao: `Termo aditivo ${termo.numero_termo} excluído`,
      detalhes: JSON.stringify({ termo_id: termoId, numero_termo: termo.numero_termo }),
    });

    return { message: 'Termo aditivo excluído. O número ficará disponível para um novo termo.' };
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

  async atualizarTermoAditivo(contratoId: string, termoId: string, dados: Partial<TermoAditivo>): Promise<TermoAditivo> {
    const contrato = await this.findOne(contratoId);
    const termo = await this.findTermoAditivo(termoId);
    if (termo.contrato_id !== contratoId) {
      throw new NotFoundException('Termo aditivo não pertence a este contrato');
    }
    if (termo.status === StatusTermoAditivo.CANCELADO) {
      throw new BadRequestException('Não é possível editar termo aditivo cancelado');
    }

    // Reverter efeitos antigos do termo no contrato
    await this.reverterEfeitosTermo(contrato, termo);

    // Atualizar campos do termo
    if (dados.objeto != null) termo.objeto = dados.objeto;
    if (dados.justificativa !== undefined) termo.justificativa = dados.justificativa;
    if (dados.renovacao_ciclo !== undefined) termo.renovacao_ciclo = dados.renovacao_ciclo;
    if (dados.valor_acrescimo !== undefined) termo.valor_acrescimo = dados.valor_acrescimo;
    if (dados.valor_supressao !== undefined) termo.valor_supressao = dados.valor_supressao;
    if (dados.percentual_acrescimo !== undefined) termo.percentual_acrescimo = dados.percentual_acrescimo;
    if (dados.percentual_supressao !== undefined) termo.percentual_supressao = dados.percentual_supressao;
    if (dados.nova_data_vigencia_fim !== undefined) termo.nova_data_vigencia_fim = dados.nova_data_vigencia_fim as any;
    if (dados.data_assinatura != null) termo.data_assinatura = dados.data_assinatura as any;

    const termoSalvo = await this.termoAditivoRepository.save(termo);

    // Reaplicar efeitos com os novos valores
    await this.atualizarValoresContrato(contrato, termoSalvo);

    await this.registrarHistorico({
      contrato_id: contratoId,
      tipo_acao: TipoAcaoContrato.EDITADO,
      descricao: `Termo aditivo ${termo.numero_termo} editado`,
      detalhes: JSON.stringify({ termo_id: termoId }),
    });

    return termoSalvo;
  }

  async cancelarTermoAditivo(contratoId: string, termoId: string): Promise<TermoAditivo> {
    const contrato = await this.findOne(contratoId);
    const termo = await this.findTermoAditivo(termoId);
    if (termo.contrato_id !== contratoId) {
      throw new NotFoundException('Termo aditivo não pertence a este contrato');
    }
    if (termo.status === StatusTermoAditivo.CANCELADO) {
      throw new BadRequestException('Termo aditivo já está cancelado');
    }

    // Reverter efeitos do termo no contrato
    await this.reverterEfeitosTermo(contrato, termo);

    termo.status = StatusTermoAditivo.CANCELADO;
    const termoSalvo = await this.termoAditivoRepository.save(termo);

    const statusAnterior = termo.status;
    await this.registrarHistorico({
      contrato_id: contratoId,
      tipo_acao: TipoAcaoContrato.STATUS_ALTERADO,
      descricao: `Termo aditivo ${termo.numero_termo} cancelado`,
      status_anterior: statusAnterior,
      status_novo: StatusTermoAditivo.CANCELADO,
      detalhes: JSON.stringify({ termo_id: termoId }),
    });

    return termoSalvo;
  }

  private async reverterEfeitosTermo(contrato: Contrato, termo: TermoAditivo): Promise<void> {
    // Renovação de ciclo: restaura a data de renovação do ciclo anterior (se houver)
    if (termo.renovacao_ciclo) {
      const termosRenovacao = await this.termoAditivoRepository.find({
        where: { contrato_id: contrato.id, renovacao_ciclo: true },
        order: { sequencial: 'DESC' },
      });
      const anterior = termosRenovacao.find(
        (t) => t.sequencial < termo.sequencial && t.status !== StatusTermoAditivo.CANCELADO && t.id !== termo.id,
      );
      contrato.data_renovacao_ciclo = anterior ? (anterior.data_assinatura as any) : null;
      if (anterior) {
        contrato.data_assinatura = anterior.data_assinatura as any;
        contrato.data_vigencia_inicio = (anterior.data_vigencia_inicio || anterior.data_assinatura) as any;
      }
    }

    // Reverter alterações de valor (mesmo com renovação de ciclo)
    if (termo.valor_acrescimo) {
      contrato.valor_acrescimos = Math.max(0, Number(contrato.valor_acrescimos) - Number(termo.valor_acrescimo));
      contrato.valor_global = Math.max(0, Number(contrato.valor_global) - Number(termo.valor_acrescimo));
    }
    if (termo.valor_supressao) {
      contrato.valor_supressoes = Math.max(0, Number(contrato.valor_supressoes) - Number(termo.valor_supressao));
      contrato.valor_global = Number(contrato.valor_global) + Number(termo.valor_supressao);
    }
    if (termo.nova_data_vigencia_fim) {
      const termosAnteriores = await this.termoAditivoRepository.find({
        where: { contrato_id: contrato.id },
        order: { sequencial: 'DESC' },
      });
      const anteriorComVigencia = termosAnteriores.find(
        (t) => t.sequencial < termo.sequencial && t.status !== StatusTermoAditivo.CANCELADO && t.id !== termo.id && t.nova_data_vigencia_fim
      );
      if (anteriorComVigencia) {
        contrato.data_vigencia_fim = anteriorComVigencia.nova_data_vigencia_fim as any;
      }
      // Se não houver termo anterior com vigência, mantém o atual (usuário pode ajustar manualmente)
    }
    await this.contratoRepository.save(contrato);
  }

  // ============ DOCUMENTOS DO CONTRATO ============

  async uploadDocumentoContrato(
    contratoId: string,
    arquivo: Express.Multer.File,
    dados: { titulo: string; tipo?: TipoDocumentoContrato; descricao?: string; termo_aditivo_id?: string }
  ): Promise<DocumentoContrato> {
    const contrato = await this.findOne(contratoId);
    if (!arquivo?.buffer) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }
    const tiposPermitidos = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'];
    if (!tiposPermitidos.includes(arquivo.mimetype)) {
      throw new BadRequestException('Tipo de arquivo não permitido. Use PDF, DOC, DOCX, JPG ou PNG.');
    }
    const dirContrato = path.join(this.uploadPath, contratoId);
    if (!fs.existsSync(dirContrato)) {
      fs.mkdirSync(dirContrato, { recursive: true });
    }
    const ext = path.extname(arquivo.originalname);
    const nomeArquivo = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const caminhoCompleto = path.join(dirContrato, nomeArquivo);
    fs.writeFileSync(caminhoCompleto, arquivo.buffer);

    const doc = this.documentoContratoRepository.create({
      contrato_id: contratoId,
      termo_aditivo_id: dados.termo_aditivo_id || null,
      tipo: dados.tipo || TipoDocumentoContrato.OUTROS,
      titulo: dados.titulo,
      descricao: dados.descricao,
      nome_arquivo: nomeArquivo,
      nome_original: arquivo.originalname,
      caminho_arquivo: caminhoCompleto,
      mime_type: arquivo.mimetype,
      tamanho_bytes: arquivo.size,
    });
    return this.documentoContratoRepository.save(doc);
  }

  async listarDocumentosContrato(contratoId: string): Promise<DocumentoContrato[]> {
    await this.findOne(contratoId);
    return this.documentoContratoRepository.find({
      where: { contrato_id: contratoId },
      order: { created_at: 'DESC' },
    });
  }

  async getDocumentoContratoArquivo(docId: string): Promise<{ buffer: Buffer; documento: DocumentoContrato }> {
    const documento = await this.documentoContratoRepository.findOne({ where: { id: docId } });
    if (!documento) throw new NotFoundException('Documento não encontrado');
    let caminhoFinal = documento.caminho_arquivo;
    if (!fs.existsSync(caminhoFinal)) {
      caminhoFinal = path.join(this.uploadPath, documento.contrato_id, documento.nome_arquivo);
    }
    if (!fs.existsSync(caminhoFinal)) {
      throw new NotFoundException('Arquivo não encontrado no servidor');
    }
    const buffer = fs.readFileSync(caminhoFinal);
    return { buffer, documento };
  }

  async deleteDocumentoContrato(docId: string): Promise<void> {
    const documento = await this.documentoContratoRepository.findOne({ where: { id: docId } });
    if (!documento) throw new NotFoundException('Documento não encontrado');
    if (fs.existsSync(documento.caminho_arquivo)) {
      fs.unlinkSync(documento.caminho_arquivo);
    } else {
      const altPath = path.join(this.uploadPath, documento.contrato_id, documento.nome_arquivo);
      if (fs.existsSync(altPath)) fs.unlinkSync(altPath);
    }
    await this.documentoContratoRepository.delete(docId);
  }

  private async atualizarValoresContrato(contrato: Contrato, termo: TermoAditivo): Promise<void> {
    // Renovação de ciclo: registra a data de referência para filtrar medições do ciclo atual
    if (termo.renovacao_ciclo) {
      contrato.data_renovacao_ciclo = termo.data_assinatura as any;
      contrato.data_assinatura = termo.data_assinatura as any;
      contrato.data_vigencia_inicio = (termo.data_vigencia_inicio || termo.data_assinatura) as any;

      // COMPRAS / ITEM_QUANTIDADE: o saldo dos itens (itens_contrato) não é cíclico
      // (não há medição que o recalcule por ciclo, como em MEDICAO/CONTINUADO/LICENCA).
      // Na renovação de ciclo, reseta o saldo dos itens para a quantidade contratada do
      // novo ciclo (zera empenhada/entregue). O histórico de OFs/recebimentos é preservado.
      if (!['MEDICAO', 'CONTINUADO', 'LICENCA'].includes((contrato.modalidade_execucao as any) || '')) {
        await this.itemContratoRepository
          .createQueryBuilder()
          .update()
          .set({
            quantidade_empenhada: 0,
            quantidade_entregue: 0,
            saldo_disponivel: () => 'quantidade_contratada',
          })
          .where('contrato_id = :id', { id: contrato.id })
          .execute();
        this.logger.log(
          `[renovacao_ciclo] Saldo dos itens do contrato ${contrato.numero_contrato} resetado para a quantidade contratada (novo ciclo).`,
        );
      }
    }

    // Aplicar alterações de valor (mesmo com renovação de ciclo — o novo valor global reflete o novo ciclo)
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
      // Se o contrato estava vencido e o aditivo prorroga a vigência para o futuro, reativar
      if (contrato.status === StatusContrato.VENCIDO && new Date(termo.nova_data_vigencia_fim) > new Date()) {
        contrato.status = StatusContrato.VIGENTE;
      }
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

  async vencerContratosExpirados(): Promise<{ count: number; ids: string[] }> {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const contratos = await this.contratoRepository.find({
      where: {
        status: StatusContrato.VIGENTE,
        data_vigencia_fim: LessThan(hoje),
      },
    });

    if (contratos.length === 0) return { count: 0, ids: [] };

    const ids: string[] = [];
    for (const contrato of contratos) {
      const dataFimBR = new Date(contrato.data_vigencia_fim).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
      contrato.status = StatusContrato.VENCIDO;
      await this.contratoRepository.save(contrato);
      await this.registrarHistorico({
        contrato_id: contrato.id,
        tipo_acao: TipoAcaoContrato.STATUS_ALTERADO,
        descricao: `Contrato vencido automaticamente — vigência encerrada em ${dataFimBR}`,
        status_anterior: StatusContrato.VIGENTE,
        status_novo: StatusContrato.VENCIDO,
        usuario_id: null,
        usuario_nome: 'Sistema (automático)',
      });
      ids.push(contrato.id);
    }

    this.logger.log(`Contratos vencidos automaticamente: ${contratos.length} (${ids.join(', ')})`);
    return { count: contratos.length, ids };
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
    const resultado = await this.findAll({
      orgaoId,
      status: StatusContrato.VIGENTE,
      vigentes: true,
    });

    let valor_total = 0;
    let valor_disponivel = 0;

    for (const c of resultado.data) {
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
      contratos_vigentes: resultado.data.length,
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
   * Gera contratos automaticamente após homologação da licitação.
   *
   * Cria 1 contrato por fornecedor vencedor (uma licitação pode ter
   * vencedores diferentes por item). O prazo de execução é o maior
   * prazo_entrega_dias informado pelo fornecedor nas propostas dos
   * itens que ele venceu (fallback: 30 dias).
   *
   * Idempotente: se já houver contratos para a licitação, retorna os
   * existentes sem recriar.
   */
  async gerarContratoAutomatico(licitacaoId: string): Promise<Contrato[]> {
    try {
      // Idempotência: se já existem contratos, retorna-os
      const contratosExistentes = await this.contratoRepository.find({
        where: { licitacao_id: licitacaoId },
      });
      if (contratosExistentes.length > 0) {
        this.logger.log(
          `Contratos já existem para licitação ${licitacaoId} (${contratosExistentes.length})`,
        );
        return contratosExistentes;
      }

      const licitacao = await this.licitacaoRepository.findOne({
        where: { id: licitacaoId },
        relations: ['orgao'],
      });
      if (!licitacao) throw new NotFoundException('Licitação não encontrada');

      if (licitacao.fase !== 'HOMOLOGACAO') {
        this.logger.warn(
          `Licitação ${licitacaoId} não está homologada. Fase atual: ${licitacao.fase}`,
        );
        return [];
      }

      const itensAdjudicados = await this.itemRepository.find({
        where: { licitacao_id: licitacaoId, status: StatusItem.ADJUDICADO },
      });
      if (itensAdjudicados.length === 0) {
        this.logger.warn(
          `Nenhum item adjudicado encontrado para licitação ${licitacaoId}`,
        );
        return [];
      }

      // Agrupa itens por fornecedor vencedor
      const itensPorFornecedor = new Map<string, ItemLicitacao[]>();
      for (const item of itensAdjudicados) {
        if (!item.fornecedor_vencedor_id) continue;
        if (!itensPorFornecedor.has(item.fornecedor_vencedor_id)) {
          itensPorFornecedor.set(item.fornecedor_vencedor_id, []);
        }
        itensPorFornecedor.get(item.fornecedor_vencedor_id)!.push(item);
      }

      if (itensPorFornecedor.size === 0) {
        this.logger.warn(
          `Nenhum fornecedor vencedor identificado para licitação ${licitacaoId}`,
        );
        return [];
      }

      const contratosCriados: Contrato[] = [];

      for (const [fornecedorId, itensDoFornecedor] of itensPorFornecedor) {
        const fornecedor = await this.fornecedorRepository.findOne({
          where: { id: fornecedorId },
        });
        if (!fornecedor) {
          this.logger.warn(
            `Fornecedor ${fornecedorId} não encontrado - contrato não gerado`,
          );
          continue;
        }

        // Soma o valor homologado dos itens deste fornecedor
        const valorTotalFornecedor = itensDoFornecedor.reduce((acc, item) => {
          const valor = item.valor_total_homologado
            ? Number(item.valor_total_homologado)
            : item.valor_unitario_homologado && item.quantidade
              ? Number(item.valor_unitario_homologado) * Number(item.quantidade)
              : Number(item.valor_total_estimado || 0);
          return acc + valor;
        }, 0);

        // Busca o maior prazo_entrega_dias real entre as propostas
        // do fornecedor para os itens que ele venceu
        const itemIds = itensDoFornecedor.map((i) => i.id);
        const prazoEntrega = await this.calcularPrazoEntregaPropostas(
          licitacaoId,
          fornecedorId,
          itemIds,
        );

        const dataAssinatura = new Date();
        const dataVigenciaInicio = new Date(dataAssinatura);
        const dataVigenciaFim = new Date(dataAssinatura);
        dataVigenciaFim.setDate(dataVigenciaFim.getDate() + prazoEntrega);

        const totalFornecedores = itensPorFornecedor.size;
        const observacao =
          totalFornecedores > 1
            ? `Contrato gerado automaticamente após homologação da licitação ${licitacao.numero_processo} (1 de ${totalFornecedores} fornecedores vencedores)`
            : `Contrato gerado automaticamente após homologação da licitação ${licitacao.numero_processo}`;

        const contrato = await this.criar({
          licitacao_id: licitacaoId,
          orgao_id: licitacao.orgao_id,
          fornecedor_id: fornecedorId,
          fornecedor_cnpj: fornecedor.cpf_cnpj || '',
          fornecedor_razao_social:
            fornecedor.razao_social || fornecedor.nome_fantasia || '',
          objeto: licitacao.objeto,
          objeto_detalhado: licitacao.objeto_detalhado || undefined,
          numero_processo: licitacao.numero_processo,
          categoria: this.mapearCategoria(licitacao.tipo_contratacao),
          valor_inicial: valorTotalFornecedor,
          valor_global: valorTotalFornecedor,
          data_assinatura: dataAssinatura,
          data_vigencia_inicio: dataVigenciaInicio,
          data_vigencia_fim: dataVigenciaFim,
          prazo_execucao_dias: prazoEntrega,
          tipo: TipoContrato.CONTRATO,
          observacoes: observacao,
          usuario_cadastro_nome: 'Sistema',
        });

        this.logger.log(
          `Contrato ${contrato.numero_contrato} gerado automaticamente para licitação ${licitacaoId} (fornecedor ${fornecedor.razao_social}, valor R$ ${valorTotalFornecedor.toFixed(2)}, prazo ${prazoEntrega} dias)`,
        );
        contratosCriados.push(contrato);
      }

      return contratosCriados;
    } catch (error) {
      this.logger.error(
        `Erro ao gerar contratos automaticamente para licitação ${licitacaoId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Busca o maior prazo_entrega_dias entre as propostas enviadas
   * por um fornecedor para os itens informados. Considera o prazo
   * em PropostaItem (por item) e, na ausência, o prazo em Proposta
   * (geral). Fallback: 30 dias.
   */
  private async calcularPrazoEntregaPropostas(
    licitacaoId: string,
    fornecedorId: string,
    itemIds: string[],
  ): Promise<number> {
    const PRAZO_PADRAO = 30;
    if (itemIds.length === 0) return PRAZO_PADRAO;

    try {
      const proposta = await this.propostaRepository.findOne({
        where: {
          licitacao_id: licitacaoId,
          fornecedor_id: fornecedorId,
          status: StatusProposta.ENVIADA,
        },
      });

      let maiorPrazo = 0;

      if (proposta) {
        const propostaItens = await this.propostaItemRepository.find({
          where: {
            proposta_id: proposta.id,
            item_licitacao_id: In(itemIds),
          },
        });
        for (const pi of propostaItens) {
          if (pi.prazo_entrega_dias && pi.prazo_entrega_dias > maiorPrazo) {
            maiorPrazo = pi.prazo_entrega_dias;
          }
        }
        // Fallback: prazo geral da proposta
        if (maiorPrazo === 0 && proposta.prazo_entrega_dias) {
          maiorPrazo = proposta.prazo_entrega_dias;
        }
      }

      return maiorPrazo > 0 ? maiorPrazo : PRAZO_PADRAO;
    } catch (error) {
      this.logger.warn(
        `Erro ao buscar prazo das propostas - usando padrão ${PRAZO_PADRAO} dias: ${error}`,
      );
      return PRAZO_PADRAO;
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

  // ============ AJUSTE DE MIGRAÇÃO ============

  private async obterValorComprometido(contratoId: string, modalidade: ModalidadeExecucao): Promise<number> {
    let total = 0;
    if (modalidade === ModalidadeExecucao.MEDICAO || modalidade === ModalidadeExecucao.CONTINUADO || modalidade === ModalidadeExecucao.LICENCA) {
      const { comprometido } = await this.somarValorMedicoes(contratoId);
      total += comprometido;
    }
    if (modalidade === ModalidadeExecucao.CONTINUADO) {
      const result = await this.atestacaoRepository
        .createQueryBuilder('a')
        .select('COALESCE(SUM(a.valor_liquido), 0)', 'total')
        .where('a.contrato_id = :contratoId', { contratoId })
        .andWhere('a.status IN (:...status)', { status: ['ATESTADA', 'ATESTADA_COM_GLOSA'] })
        .getRawOne<{ total: string }>();
      total += Number(result?.total ?? 0);
    }
    return total;
  }

  async ajusteMigracao(contratoId: string, body: { valor_executado_anterior?: number; valor_empenhado?: number; observacao_ajuste?: string }, usuarioId: string, usuarioNome: string): Promise<Contrato> {
    const contrato = await this.findOne(contratoId);
    const observacao = body.observacao_ajuste || '';
    const valorGlobal = Number(contrato.valor_global) || 0;

    let valor: number;
    if (body.valor_empenhado !== undefined && body.valor_empenhado !== null) {
      const valorEmpenhado = Number(body.valor_empenhado) || 0;
      if (valorEmpenhado < 0) throw new BadRequestException('Valor empenhado não pode ser negativo');
      if (valorEmpenhado > valorGlobal) throw new BadRequestException(`Valor empenhado (R$ ${valorEmpenhado.toFixed(2)}) não pode exceder o valor global (R$ ${valorGlobal.toFixed(2)})`);
      const comprometido = await this.obterValorComprometido(contratoId, contrato.modalidade_execucao);
      valor = Math.max(0, valorGlobal - valorEmpenhado - comprometido);
    } else {
      valor = Number(body.valor_executado_anterior) || 0;
      if (valor < 0) throw new BadRequestException('Valor não pode ser negativo');
      if (valor > valorGlobal) throw new BadRequestException(`Valor executado anterior (R$ ${valor.toFixed(2)}) não pode exceder o valor global (R$ ${valorGlobal.toFixed(2)})`);
    }

    contrato.valor_executado_anterior = valor;
    contrato.observacao_ajuste = observacao;
    const salvo = await this.contratoRepository.save(contrato);

    await this.registrarHistorico({
      contrato_id: contratoId,
      tipo_acao: TipoAcaoContrato.AJUSTE_MIGRACAO,
      descricao: `Ajuste de migração: R$ ${valor.toFixed(2)} registrado como valor já executado antes do sistema. ${observacao ? 'Obs: ' + observacao : ''}`,
      usuario_id: usuarioId,
      usuario_nome: usuarioNome,
    });

    return salvo;
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

  // ============ EXCLUSÃO DE CONTRATOS ============

  /**
   * Exclui um contrato e todos os seus dados relacionados.
   * Apenas usuários com permissão pode_excluir_contratos podem executar esta ação.
   */
  async excluirContrato(
    contratoId: string,
    usuarioId: string,
    usuarioNome: string,
  ): Promise<void> {
    const contrato = await this.contratoRepository.findOne({
      where: { id: contratoId },
      relations: ['itens', 'termos_aditivos', 'documentos', 'medicoes'],
    });

    if (!contrato) {
      throw new NotFoundException('Contrato não encontrado');
    }

    // Verificar se existem requisições vinculadas ao contrato
    const requisicoesVinculadas = await this.contratoRepository.query(
      `SELECT COUNT(*) as total FROM requisicoes WHERE contrato_id = $1`,
      [contratoId],
    );

    if (requisicoesVinculadas[0]?.total > 0) {
      throw new BadRequestException(
        'Não é possível excluir este contrato pois existem requisições vinculadas a ele',
      );
    }

    // Verificar se existem ordens de fornecimento vinculadas
    const ordensVinculadas = await this.contratoRepository.query(
      `SELECT COUNT(*) as total FROM ordens_fornecimento WHERE contrato_id = $1`,
      [contratoId],
    );

    if (ordensVinculadas[0]?.total > 0) {
      throw new BadRequestException(
        'Não é possível excluir este contrato pois existem ordens de fornecimento vinculadas a ele',
      );
    }

    // Verificar se existem medições aprovadas
    const medicoesAprovadas = contrato.medicoes?.filter(
      (m: Medicao) => m.status === StatusMedicao.APROVADA,
    );

    if (medicoesAprovadas?.length > 0) {
      throw new BadRequestException(
        'Não é possível excluir este contrato pois existem medições aprovadas vinculadas',
      );
    }

    // Registrar histórico antes da exclusão
    await this.registrarHistorico({
      contrato_id: contratoId,
      tipo_acao: TipoAcaoContrato.EXCLUIDO,
      descricao: `Contrato ${contrato.numero_contrato} excluído por ${usuarioNome}`,
      status_anterior: contrato.status as StatusContrato,
      usuario_id: usuarioId,
      usuario_nome: usuarioNome,
    });

    // Excluir documentos físicos
    if (contrato.documentos?.length > 0) {
      for (const doc of contrato.documentos) {
        const caminhoArquivo = path.join(this.uploadPath, contratoId, doc.nome_arquivo);
        if (fs.existsSync(caminhoArquivo)) {
          fs.unlinkSync(caminhoArquivo);
        }
      }
      // Remover pasta do contrato se existir
      const pastaContrato = path.join(this.uploadPath, contratoId);
      if (fs.existsSync(pastaContrato)) {
        fs.rmdirSync(pastaContrato, { recursive: true });
      }
    }

    // Excluir dados relacionados em ordem (para respeitar constraints de FK)
    // 1. Excluir itens do contrato
    if (contrato.itens?.length > 0) {
      await this.itemContratoRepository.remove(contrato.itens);
    }

    // 2. Excluir termos aditivos
    if (contrato.termos_aditivos?.length > 0) {
      await this.termoAditivoRepository.remove(contrato.termos_aditivos);
    }

    // 3. Excluir documentos
    if (contrato.documentos?.length > 0) {
      await this.documentoContratoRepository.remove(contrato.documentos);
    }

    // 4. Excluir medições (que não estão aprovadas - já verificado acima)
    if (contrato.medicoes?.length > 0) {
      // Excluir atestações mensais primeiro (via contrato_id)
      await this.atestacaoRepository.delete({ contrato_id: contratoId });
      await this.medicaoRepository.remove(contrato.medicoes);
    }

    // 5. Excluir histórico do contrato
    await this.historicoContratoRepository.delete({ contrato_id: contratoId });

    // 6. Finalmente, excluir o contrato
    await this.contratoRepository.remove(contrato);

    this.logger.log(`Contrato ${contrato.numero_contrato} (ID: ${contratoId}) excluído por ${usuarioNome}`);
  }

  /**
   * Retorna fornecedores disponíveis para o órgão:
   * - Todos os fornecedores cadastrados no sistema (cadastrado_sistema = true)
   * - Fornecedores não-cadastrados que aparecem em contratos do órgão
   * Em ambos os casos inclui a contagem de contratos firmados com o órgão.
   */
  async getFornecedoresDoOrgao(orgaoId: string): Promise<any[]> {
    // 1. Contratos do órgão agrupados por fornecedor_id
    const contractsRaw = await this.contratoRepository
      .createQueryBuilder('c')
      .select('c.fornecedor_id', 'fornecedor_id')
      .addSelect('COUNT(c.id)', 'total_contratos')
      .where('c.orgao_id = :orgaoId', { orgaoId })
      .andWhere('c.fornecedor_id IS NOT NULL')
      .groupBy('c.fornecedor_id')
      .getRawMany();

    if (contractsRaw.length === 0) {
      return [];
    }

    const countMap = new Map<string, number>(
      contractsRaw.map((r) => [r.fornecedor_id, Number(r.total_contratos)]),
    );

    const fornecedorIds = contractsRaw.map((r) => r.fornecedor_id);

    // 2. Buscar detalhes dos fornecedores
    const fornecedores = await this.fornecedorRepository.findByIds(fornecedorIds, {
      select: ['id', 'cpf_cnpj', 'razao_social', 'nome_fantasia', 'email', 'telefone',
               'representante_whatsapp', 'representante_telefone', 'status', 'porte', 'cidade', 'uf'],
    } as any);

    return fornecedores
      .map((f) => ({
        cnpj: f.cpf_cnpj,
        razao_social: f.razao_social,
        fornecedor_id: f.id,
        total_contratos: countMap.get(f.id) ?? 0,
        cadastrado_sistema: true,
        nome_fantasia: f.nome_fantasia,
        email: f.email,
        telefone: f.telefone,
        whatsapp: f.representante_whatsapp || f.representante_telefone || f.telefone,
        status_cadastro: f.status,
        cidade: f.cidade,
        uf: f.uf,
        porte: f.porte,
      }))
      .sort((a, b) => (a.razao_social || '').localeCompare(b.razao_social || '', 'pt-BR'));
  }
}
