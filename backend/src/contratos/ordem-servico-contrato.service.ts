import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Contrato, ModalidadeExecucao, StatusContrato } from './entities/contrato.entity';
import { OrdemServicoContrato, StatusOrdemServico, MetricaOS } from './entities/ordem-servico-contrato.entity';
import { BancoMetricas } from './entities/banco-metricas.entity';
import { Medicao, StatusMedicao } from './entities/medicao.entity';

const MODALIDADES_COM_OS: ModalidadeExecucao[] = [
  ModalidadeExecucao.ORDEM_SERVICO,
  ModalidadeExecucao.CONTINUADO,
  ModalidadeExecucao.LICENCA,
  ModalidadeExecucao.MEDICAO,
];

@Injectable()
export class OrdemServicoContratoService {
  private readonly logger = new Logger(OrdemServicoContratoService.name);

  constructor(
    @InjectRepository(Contrato)
    private contratoRepository: Repository<Contrato>,
    @InjectRepository(OrdemServicoContrato)
    private osRepository: Repository<OrdemServicoContrato>,
    @InjectRepository(BancoMetricas)
    private bancoRepository: Repository<BancoMetricas>,
    @InjectRepository(Medicao)
    private medicaoRepository: Repository<Medicao>,
  ) {}

  // ============================================================================
  // BANCO DE MÉTRICAS (mantido para ORDEM_SERVICO)
  // ============================================================================

  async criarBancoMetricas(contratoId: string, dados: Partial<BancoMetricas>): Promise<BancoMetricas> {
    const contrato = await this.validarContratoOS(contratoId);
    if (contrato.modalidade_execucao !== ModalidadeExecucao.ORDEM_SERVICO) {
      throw new BadRequestException('Banco de métricas só é aplicável a contratos de Ordem de Serviço por Demanda');
    }

    const banco = this.bancoRepository.create({
      ...dados,
      contrato_id: contratoId,
      saldo: dados.quantidade_total,
    });

    return this.bancoRepository.save(banco);
  }

  async listarBancoMetricas(contratoId: string): Promise<BancoMetricas[]> {
    return this.bancoRepository.find({
      where: { contrato_id: contratoId },
      order: { created_at: 'ASC' },
    });
  }

  async atualizarBancoMetricas(bancoId: string, dados: Partial<BancoMetricas>): Promise<BancoMetricas> {
    const banco = await this.bancoRepository.findOne({ where: { id: bancoId } });
    if (!banco) throw new NotFoundException('Banco de métricas não encontrado');
    Object.assign(banco, dados);
    banco.saldo = Number(banco.quantidade_total) - Number(banco.quantidade_consumida) - Number(banco.quantidade_reservada);
    return this.bancoRepository.save(banco);
  }

  // ============================================================================
  // ORDENS DE SERVIÇO — CRUD
  // ============================================================================

  async criarOS(contratoId: string, dados: Partial<OrdemServicoContrato> & { submeter?: boolean }): Promise<OrdemServicoContrato> {
    const contrato = await this.validarContratoOS(contratoId);

    const ultimaOS = await this.osRepository.findOne({
      where: { contrato_id: contratoId },
      order: { sequencial: 'DESC' },
    });
    const sequencial = ultimaOS ? ultimaOS.sequencial + 1 : 1;
    const ano = new Date().getFullYear();
    const numeroOS = `OS-${String(sequencial).padStart(3, '0')}/${ano}`;

    // Para ORDEM_SERVICO com métricas, verificar saldo no banco
    if (contrato.modalidade_execucao === ModalidadeExecucao.ORDEM_SERVICO && dados.metrica && dados.metrica !== MetricaOS.VALOR_FIXO && dados.quantidade_metrica) {
      const banco = await this.bancoRepository.findOne({
        where: { contrato_id: contratoId, metrica: dados.metrica },
      });

      if (banco) {
        const saldoDisponivel = Number(banco.quantidade_total) - Number(banco.quantidade_consumida) - Number(banco.quantidade_reservada);
        if (Number(dados.quantidade_metrica) > saldoDisponivel) {
          throw new BadRequestException(
            `Saldo insuficiente de ${dados.metrica}: solicitado ${dados.quantidade_metrica}, disponível ${saldoDisponivel}`
          );
        }

        banco.quantidade_reservada = Number(banco.quantidade_reservada) + Number(dados.quantidade_metrica);
        banco.saldo = Number(banco.quantidade_total) - Number(banco.quantidade_consumida) - Number(banco.quantidade_reservada);
        await this.bancoRepository.save(banco);
      }
    }

    let valorTotal = Number(dados.valor_total) || 0;
    if (!valorTotal && dados.quantidade_metrica && dados.valor_unitario_metrica) {
      valorTotal = Number(dados.quantidade_metrica) * Number(dados.valor_unitario_metrica);
    }

    // Validar saldo do contrato
    const saldoContrato = await this.calcularSaldoContrato(contratoId);
    if (valorTotal > saldoContrato + 0.01) {
      throw new BadRequestException(
        `Valor da OS (R$ ${valorTotal.toFixed(2)}) excede o saldo disponível do contrato (R$ ${saldoContrato.toFixed(2)})`
      );
    }

    const statusInicial = dados.submeter ? StatusOrdemServico.AGUARDANDO_APROVACAO : StatusOrdemServico.RASCUNHO;

    const os = this.osRepository.create({
      ...dados,
      contrato_id: contratoId,
      numero_os: numeroOS,
      sequencial,
      valor_total: valorTotal,
      status: statusInicial,
    });

    this.logger.log(`OS ${numeroOS} criada para contrato ${contrato.numero_contrato} (status: ${statusInicial})`);

    return this.osRepository.save(os);
  }

  async listarOS(contratoId: string, status?: StatusOrdemServico): Promise<OrdemServicoContrato[]> {
    const where: any = { contrato_id: contratoId };
    if (status) where.status = status;

    return this.osRepository.find({
      where,
      order: { sequencial: 'DESC' },
    });
  }

  async buscarOS(osId: string): Promise<OrdemServicoContrato> {
    const os = await this.osRepository.findOne({
      where: { id: osId },
      relations: ['contrato'],
    });
    if (!os) throw new NotFoundException('Ordem de Serviço não encontrada');
    return os;
  }

  async atualizarOS(osId: string, dados: Partial<OrdemServicoContrato>): Promise<OrdemServicoContrato> {
    const os = await this.buscarOS(osId);

    const statusBloqueados = [StatusOrdemServico.ACEITA, StatusOrdemServico.CANCELADA, StatusOrdemServico.CONCLUIDA];
    if (statusBloqueados.includes(os.status)) {
      throw new BadRequestException(`OS ${os.numero_os} não pode ser alterada (status: ${os.status})`);
    }

    if (dados.valor_total && Number(dados.valor_total) !== Number(os.valor_total)) {
      const saldoContrato = await this.calcularSaldoContrato(os.contrato_id);
      const saldoComEsta = saldoContrato + Number(os.valor_total);
      if (Number(dados.valor_total) > saldoComEsta + 0.01) {
        throw new BadRequestException(
          `Valor da OS (R$ ${Number(dados.valor_total).toFixed(2)}) excede o saldo disponível do contrato (R$ ${saldoComEsta.toFixed(2)})`
        );
      }
    }

    Object.assign(os, dados);
    return this.osRepository.save(os);
  }

  // ============================================================================
  // FLUXO DE APROVAÇÃO
  // ============================================================================

  async submeterAprovacao(osId: string): Promise<OrdemServicoContrato> {
    const os = await this.buscarOS(osId);
    if (os.status !== StatusOrdemServico.RASCUNHO && os.status !== StatusOrdemServico.REJEITADA) {
      throw new BadRequestException('Apenas OS em rascunho ou rejeitadas podem ser submetidas para aprovação');
    }
    os.status = StatusOrdemServico.AGUARDANDO_APROVACAO;
    this.logger.log(`OS ${os.numero_os} submetida para aprovação`);
    return this.osRepository.save(os);
  }

  async aprovarOS(osId: string, aprovadorId: string, aprovadorNome: string, observacao?: string): Promise<OrdemServicoContrato> {
    const os = await this.buscarOS(osId);
    if (os.status !== StatusOrdemServico.AGUARDANDO_APROVACAO) {
      throw new BadRequestException('Apenas OS aguardando aprovação podem ser aprovadas');
    }

    os.status = StatusOrdemServico.AUTORIZADA;
    os.aprovador_id = aprovadorId;
    os.aprovador_nome = aprovadorNome;
    os.data_aprovacao = new Date();
    if (observacao) os.observacao_aprovador = observacao;

    this.logger.log(`OS ${os.numero_os} aprovada por ${aprovadorNome}`);
    return this.osRepository.save(os);
  }

  async rejeitarAprovacaoOS(osId: string, aprovadorId: string, aprovadorNome: string, observacao: string): Promise<OrdemServicoContrato> {
    const os = await this.buscarOS(osId);
    if (os.status !== StatusOrdemServico.AGUARDANDO_APROVACAO) {
      throw new BadRequestException('Apenas OS aguardando aprovação podem ser rejeitadas');
    }

    os.status = StatusOrdemServico.REJEITADA;
    os.aprovador_id = aprovadorId;
    os.aprovador_nome = aprovadorNome;
    os.data_aprovacao = new Date();
    os.observacao_aprovador = observacao;

    this.logger.log(`OS ${os.numero_os} rejeitada por ${aprovadorNome}. Motivo: ${observacao}`);
    return this.osRepository.save(os);
  }

  // ============================================================================
  // FLUXO DE EXECUÇÃO (pós-aprovação)
  // ============================================================================

  async iniciarExecucao(osId: string): Promise<OrdemServicoContrato> {
    const os = await this.buscarOS(osId);
    if (os.status !== StatusOrdemServico.AUTORIZADA && os.status !== StatusOrdemServico.ABERTA) {
      throw new BadRequestException('Apenas OS autorizadas ou abertas podem iniciar execução');
    }
    os.status = StatusOrdemServico.EM_EXECUCAO;
    return this.osRepository.save(os);
  }

  async registrarEntrega(osId: string, dataEntrega?: string): Promise<OrdemServicoContrato> {
    const os = await this.buscarOS(osId);
    if (os.status !== StatusOrdemServico.EM_EXECUCAO) {
      throw new BadRequestException('Apenas OS em execução podem registrar entrega');
    }
    os.status = StatusOrdemServico.ENTREGUE;
    os.data_entrega = (dataEntrega || new Date()) as any;

    if (os.sla_dias && os.data_abertura) {
      const abertura = new Date(os.data_abertura);
      const entrega = new Date(os.data_entrega);
      const diasUteis = Math.ceil((entrega.getTime() - abertura.getTime()) / (1000 * 60 * 60 * 24));
      if (diasUteis > os.sla_dias) {
        os.sla_excedido = true;
        this.logger.warn(`OS ${os.numero_os}: SLA excedido (${diasUteis} dias > ${os.sla_dias} dias)`);
      }
    }

    return this.osRepository.save(os);
  }

  async aceitarOS(osId: string, dados: {
    fiscal_id: string;
    fiscal_nome: string;
    nota_qualidade?: number;
    parecer_aceite?: string;
  }): Promise<OrdemServicoContrato> {
    const os = await this.buscarOS(osId);

    if (os.status !== StatusOrdemServico.ENTREGUE && os.status !== StatusOrdemServico.EM_ACEITE) {
      throw new BadRequestException('Apenas OS entregues ou em aceite podem ser aceitas');
    }

    if (os.metrica && os.metrica !== MetricaOS.VALOR_FIXO) {
      const banco = await this.bancoRepository.findOne({
        where: { contrato_id: os.contrato_id, metrica: os.metrica },
      });

      if (banco) {
        banco.quantidade_reservada = Math.max(0, Number(banco.quantidade_reservada) - Number(os.quantidade_metrica));
        banco.quantidade_consumida = Number(banco.quantidade_consumida) + Number(os.quantidade_metrica);
        banco.saldo = Number(banco.quantidade_total) - Number(banco.quantidade_consumida) - Number(banco.quantidade_reservada);
        await this.bancoRepository.save(banco);
      }
    }

    os.status = StatusOrdemServico.ACEITA;
    os.fiscal_id = dados.fiscal_id;
    os.fiscal_nome = dados.fiscal_nome;
    os.data_aceite = new Date() as any;
    if (dados.nota_qualidade != null) os.nota_qualidade = dados.nota_qualidade;
    if (dados.parecer_aceite) os.parecer_aceite = dados.parecer_aceite;

    return this.osRepository.save(os);
  }

  async rejeitarOS(osId: string, dados: {
    fiscal_id: string;
    fiscal_nome: string;
    parecer_aceite: string;
  }): Promise<OrdemServicoContrato> {
    const os = await this.buscarOS(osId);

    if (os.status !== StatusOrdemServico.ENTREGUE && os.status !== StatusOrdemServico.EM_ACEITE) {
      throw new BadRequestException('Apenas OS entregues ou em aceite podem ser rejeitadas');
    }

    os.status = StatusOrdemServico.REJEITADA;
    os.fiscal_id = dados.fiscal_id;
    os.fiscal_nome = dados.fiscal_nome;
    os.parecer_aceite = dados.parecer_aceite;

    this.logger.log(`OS ${os.numero_os} rejeitada. Motivo: ${dados.parecer_aceite}`);
    return this.osRepository.save(os);
  }

  async concluirOS(osId: string): Promise<OrdemServicoContrato> {
    const os = await this.buscarOS(osId);
    const statusPermitidos = [StatusOrdemServico.AUTORIZADA, StatusOrdemServico.EM_EXECUCAO, StatusOrdemServico.ACEITA];
    if (!statusPermitidos.includes(os.status)) {
      throw new BadRequestException('OS não pode ser concluída neste status');
    }
    os.status = StatusOrdemServico.CONCLUIDA;
    return this.osRepository.save(os);
  }

  async cancelarOS(osId: string, observacao: string): Promise<OrdemServicoContrato> {
    const os = await this.buscarOS(osId);

    if (os.status === StatusOrdemServico.ACEITA || os.status === StatusOrdemServico.CONCLUIDA) {
      throw new BadRequestException('OS já aceita/concluída não pode ser cancelada');
    }

    if (os.status !== StatusOrdemServico.CANCELADA && os.metrica && os.metrica !== MetricaOS.VALOR_FIXO) {
      const banco = await this.bancoRepository.findOne({
        where: { contrato_id: os.contrato_id, metrica: os.metrica },
      });

      if (banco) {
        banco.quantidade_reservada = Math.max(0, Number(banco.quantidade_reservada) - Number(os.quantidade_metrica));
        banco.saldo = Number(banco.quantidade_total) - Number(banco.quantidade_consumida) - Number(banco.quantidade_reservada);
        await this.bancoRepository.save(banco);
      }
    }

    os.status = StatusOrdemServico.CANCELADA;
    os.observacoes = observacao;

    return this.osRepository.save(os);
  }

  // ============================================================================
  // SALDO
  // ============================================================================

  async calcularSaldoOS(osId: string): Promise<number> {
    const os = await this.osRepository.findOne({ where: { id: osId } });
    if (!os) throw new NotFoundException('OS não encontrada');

    const result = await this.medicaoRepository
      .createQueryBuilder('m')
      .select('COALESCE(SUM(m.valor_medido), 0)', 'total')
      .where('m.ordem_servico_id = :osId', { osId })
      .andWhere('m.status NOT IN (:...excluir)', { excluir: [StatusMedicao.REJEITADA] })
      .getRawOne();

    return Number(os.valor_total) - Number(result.total);
  }

  async calcularSaldoContrato(contratoId: string): Promise<number> {
    const contrato = await this.contratoRepository.findOne({ where: { id: contratoId } });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');

    const valorGlobal = Number(contrato.valor_global) || Number(contrato.valor_inicial) || 0;
    const valorExecAnterior = Number(contrato.valor_executado_anterior) || 0;

    const statusAtivos = [
      StatusOrdemServico.RASCUNHO,
      StatusOrdemServico.AGUARDANDO_APROVACAO,
      StatusOrdemServico.AUTORIZADA,
      StatusOrdemServico.ABERTA,
      StatusOrdemServico.EM_EXECUCAO,
      StatusOrdemServico.ENTREGUE,
      StatusOrdemServico.EM_ACEITE,
      StatusOrdemServico.ACEITA,
      StatusOrdemServico.CONCLUIDA,
    ];

    const result = await this.osRepository
      .createQueryBuilder('os')
      .select('COALESCE(SUM(os.valor_total), 0)', 'total')
      .where('os.contrato_id = :contratoId', { contratoId })
      .andWhere('os.status IN (:...status)', { status: statusAtivos })
      .getRawOne();

    return valorGlobal - valorExecAnterior - Number(result.total);
  }

  // ============================================================================
  // CONSULTAS
  // ============================================================================

  async listarPendentesAprovacao(orgaoId: string): Promise<any[]> {
    const ordens = await this.osRepository
      .createQueryBuilder('os')
      .innerJoinAndSelect('os.contrato', 'c')
      .where('c.orgao_id = :orgaoId', { orgaoId })
      .andWhere('os.status = :status', { status: StatusOrdemServico.AGUARDANDO_APROVACAO })
      .orderBy('os.created_at', 'ASC')
      .getMany();

    return ordens.map(os => {
      const contrato = (os as any).contrato;
      return {
        id: os.id,
        contrato_id: os.contrato_id,
        numero_os: os.numero_os,
        descricao: os.descricao,
        valor_total: os.valor_total,
        data_abertura: os.data_abertura,
        data_prazo: os.data_prazo,
        metrica: os.metrica,
        quantidade_metrica: os.quantidade_metrica,
        status: os.status,
        usuario_cadastro_nome: os.usuario_cadastro_nome,
        created_at: os.created_at,
        numero_contrato: contrato?.numero_contrato,
        objeto_contrato: contrato?.objeto,
        fornecedor_nome: contrato?.fornecedor_razao_social || contrato?.fornecedor_nome,
        modalidade_execucao: contrato?.modalidade_execucao,
      };
    });
  }

  async listarOSPorOrgao(orgaoId: string, filtros?: { status?: StatusOrdemServico; contratoId?: string }): Promise<any[]> {
    const qb = this.osRepository
      .createQueryBuilder('os')
      .innerJoinAndSelect('os.contrato', 'c')
      .where('c.orgao_id = :orgaoId', { orgaoId });

    if (filtros?.status) {
      qb.andWhere('os.status = :status', { status: filtros.status });
    }
    if (filtros?.contratoId) {
      qb.andWhere('os.contrato_id = :contratoId', { contratoId: filtros.contratoId });
    }

    qb.orderBy('os.created_at', 'DESC');
    const ordens = await qb.getMany();

    const result: any[] = [];
    for (const os of ordens) {
      const contrato = (os as any).contrato;
      const saldoOS = await this.calcularSaldoOS(os.id);
      result.push({
        id: os.id,
        contrato_id: os.contrato_id,
        numero_os: os.numero_os,
        sequencial: os.sequencial,
        descricao: os.descricao,
        escopo_detalhado: os.escopo_detalhado,
        valor_total: os.valor_total,
        saldo_os: saldoOS,
        data_abertura: os.data_abertura,
        data_prazo: os.data_prazo,
        data_entrega: os.data_entrega,
        data_aceite: os.data_aceite,
        metrica: os.metrica,
        quantidade_metrica: os.quantidade_metrica,
        valor_unitario_metrica: os.valor_unitario_metrica,
        status: os.status,
        fiscal_nome: os.fiscal_nome,
        responsavel_tecnico: os.responsavel_tecnico,
        usuario_cadastro_nome: os.usuario_cadastro_nome,
        aprovador_nome: os.aprovador_nome,
        data_aprovacao: os.data_aprovacao,
        observacao_aprovador: os.observacao_aprovador,
        nota_qualidade: os.nota_qualidade,
        sla_dias: os.sla_dias,
        sla_excedido: os.sla_excedido,
        created_at: os.created_at,
        numero_contrato: contrato?.numero_contrato,
        objeto_contrato: contrato?.objeto,
        fornecedor_nome: contrato?.fornecedor_razao_social || contrato?.fornecedor_nome,
        modalidade_execucao: contrato?.modalidade_execucao,
      });
    }
    return result;
  }

  async getOSAtiva(contratoId: string): Promise<OrdemServicoContrato | null> {
    return this.osRepository.findOne({
      where: {
        contrato_id: contratoId,
        status: In([StatusOrdemServico.AUTORIZADA, StatusOrdemServico.EM_EXECUCAO]),
      },
    });
  }

  // ============================================================================
  // RESUMO
  // ============================================================================

  async resumoOS(contratoId: string) {
    const contrato = await this.validarContratoOS(contratoId);
    const ordens = await this.listarOS(contratoId);
    const bancos = contrato.modalidade_execucao === ModalidadeExecucao.ORDEM_SERVICO
      ? await this.listarBancoMetricas(contratoId)
      : [];

    const aceitas = ordens.filter(o => o.status === StatusOrdemServico.ACEITA || o.status === StatusOrdemServico.CONCLUIDA);
    const emExecucao = ordens.filter(o =>
      [StatusOrdemServico.AUTORIZADA, StatusOrdemServico.ABERTA, StatusOrdemServico.EM_EXECUCAO,
       StatusOrdemServico.ENTREGUE, StatusOrdemServico.EM_ACEITE].includes(o.status)
    );
    const pendentesAprovacao = ordens.filter(o => o.status === StatusOrdemServico.AGUARDANDO_APROVACAO);

    const valorAceito = aceitas.reduce((sum, o) => sum + Number(o.valor_total), 0);
    const valorEmExecucao = emExecucao.reduce((sum, o) => sum + Number(o.valor_total), 0);

    const notasQualidade = aceitas.filter(o => o.nota_qualidade != null).map(o => Number(o.nota_qualidade));
    const mediaQualidade = notasQualidade.length > 0
      ? notasQualidade.reduce((sum, n) => sum + n, 0) / notasQualidade.length
      : null;

    const slaExcedido = ordens.filter(o => o.sla_excedido).length;
    const valorGlobal = Number(contrato.valor_global) || Number(contrato.valor_inicial) || 0;
    const valorExecAnterior = Number(contrato.valor_executado_anterior) || 0;

    return {
      contrato_id: contratoId,
      valor_global: valorGlobal,
      valor_executado_anterior: valorExecAnterior,
      total_os: ordens.length,
      os_aceitas: aceitas.length,
      os_em_andamento: emExecucao.length,
      os_pendentes_aprovacao: pendentesAprovacao.length,
      os_canceladas: ordens.filter(o => o.status === StatusOrdemServico.CANCELADA).length,
      valor_aceito: valorAceito,
      valor_em_execucao: valorEmExecucao,
      saldo_valor: Math.max(0, valorGlobal - valorExecAnterior - valorAceito - valorEmExecucao),
      media_qualidade: mediaQualidade,
      sla_excedido: slaExcedido,
      banco_metricas: bancos.map(b => ({
        metrica: b.metrica,
        descricao: b.descricao,
        total: Number(b.quantidade_total),
        consumido: Number(b.quantidade_consumida),
        reservado: Number(b.quantidade_reservada),
        saldo: Number(b.saldo),
      })),
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async validarContratoOS(contratoId: string): Promise<Contrato> {
    const contrato = await this.contratoRepository.findOne({ where: { id: contratoId } });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');

    const STATUS_BLOQUEADOS: StatusContrato[] = [
      StatusContrato.VENCIDO,
      StatusContrato.ENCERRADO,
      StatusContrato.RESCINDIDO,
      StatusContrato.CANCELADO,
      StatusContrato.SUSPENSO,
    ];
    if (STATUS_BLOQUEADOS.includes(contrato.status)) {
      throw new BadRequestException(
        `Contrato ${contrato.numero_contrato} está com status ${contrato.status}. Não é possível criar ou editar Ordens de Serviço.`
      );
    }

    if (!MODALIDADES_COM_OS.includes(contrato.modalidade_execucao)) {
      throw new BadRequestException(
        `Contrato ${contrato.numero_contrato} não suporta Ordens de Serviço (modalidade: ${contrato.modalidade_execucao})`
      );
    }

    return contrato;
  }
}
