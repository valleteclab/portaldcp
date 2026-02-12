import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contrato, ModalidadeExecucao } from './entities/contrato.entity';
import { OrdemServicoContrato, StatusOrdemServico } from './entities/ordem-servico-contrato.entity';
import { BancoMetricas } from './entities/banco-metricas.entity';

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
  ) {}

  // ============================================================================
  // BANCO DE MÉTRICAS
  // ============================================================================

  async criarBancoMetricas(contratoId: string, dados: Partial<BancoMetricas>): Promise<BancoMetricas> {
    await this.validarContratoOS(contratoId);

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
  // ORDENS DE SERVIÇO
  // ============================================================================

  async criarOS(contratoId: string, dados: Partial<OrdemServicoContrato>): Promise<OrdemServicoContrato> {
    const contrato = await this.validarContratoOS(contratoId);

    // Gerar número da OS
    const ultimaOS = await this.osRepository.findOne({
      where: { contrato_id: contratoId },
      order: { sequencial: 'DESC' },
    });
    const sequencial = ultimaOS ? ultimaOS.sequencial + 1 : 1;
    const ano = new Date().getFullYear();
    const numeroOS = `OS-${String(sequencial).padStart(3, '0')}/${ano}`;

    // Verificar saldo no banco de métricas
    if (dados.metrica && dados.quantidade_metrica) {
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

        // Reservar no banco
        banco.quantidade_reservada = Number(banco.quantidade_reservada) + Number(dados.quantidade_metrica);
        banco.saldo = Number(banco.quantidade_total) - Number(banco.quantidade_consumida) - Number(banco.quantidade_reservada);
        await this.bancoRepository.save(banco);
      }
    }

    // Calcular valor total
    const valorTotal = Number(dados.quantidade_metrica || 0) * Number(dados.valor_unitario_metrica || 0);

    const os = this.osRepository.create({
      ...dados,
      contrato_id: contratoId,
      numero_os: numeroOS,
      sequencial,
      valor_total: valorTotal,
      status: StatusOrdemServico.ABERTA,
    });

    this.logger.log(`OS ${numeroOS} criada para contrato ${contrato.numero_contrato}`);

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
    const os = await this.osRepository.findOne({ where: { id: osId } });
    if (!os) throw new NotFoundException('Ordem de Serviço não encontrada');
    return os;
  }

  async atualizarOS(osId: string, dados: Partial<OrdemServicoContrato>): Promise<OrdemServicoContrato> {
    const os = await this.buscarOS(osId);

    if (os.status === StatusOrdemServico.ACEITA || os.status === StatusOrdemServico.CANCELADA) {
      throw new BadRequestException(`OS ${os.numero_os} não pode ser alterada (status: ${os.status})`);
    }

    Object.assign(os, dados);
    return this.osRepository.save(os);
  }

  async iniciarExecucao(osId: string): Promise<OrdemServicoContrato> {
    const os = await this.buscarOS(osId);
    if (os.status !== StatusOrdemServico.ABERTA) {
      throw new BadRequestException('Apenas OS abertas podem iniciar execução');
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

    // Verificar SLA
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

    // Consumir do banco de métricas (mover de reservado para consumido)
    const banco = await this.bancoRepository.findOne({
      where: { contrato_id: os.contrato_id, metrica: os.metrica },
    });

    if (banco) {
      banco.quantidade_reservada = Math.max(0, Number(banco.quantidade_reservada) - Number(os.quantidade_metrica));
      banco.quantidade_consumida = Number(banco.quantidade_consumida) + Number(os.quantidade_metrica);
      banco.saldo = Number(banco.quantidade_total) - Number(banco.quantidade_consumida) - Number(banco.quantidade_reservada);
      await this.bancoRepository.save(banco);

      this.logger.log(
        `OS ${os.numero_os} aceita: ${os.quantidade_metrica} ${os.metrica} consumidas. Saldo restante: ${banco.saldo}`
      );
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

    // Não libera reserva — OS rejeitada volta para execução
    this.logger.log(`OS ${os.numero_os} rejeitada. Motivo: ${dados.parecer_aceite}`);

    return this.osRepository.save(os);
  }

  async cancelarOS(osId: string, observacao: string): Promise<OrdemServicoContrato> {
    const os = await this.buscarOS(osId);

    if (os.status === StatusOrdemServico.ACEITA) {
      throw new BadRequestException('OS já aceita não pode ser cancelada');
    }

    // Liberar reserva no banco de métricas
    if (os.status !== StatusOrdemServico.CANCELADA) {
      const banco = await this.bancoRepository.findOne({
        where: { contrato_id: os.contrato_id, metrica: os.metrica },
      });

      if (banco) {
        banco.quantidade_reservada = Math.max(0, Number(banco.quantidade_reservada) - Number(os.quantidade_metrica));
        banco.saldo = Number(banco.quantidade_total) - Number(banco.quantidade_consumida) - Number(banco.quantidade_reservada);
        await this.bancoRepository.save(banco);

        this.logger.log(
          `OS ${os.numero_os} cancelada: ${os.quantidade_metrica} ${os.metrica} liberadas. Saldo: ${banco.saldo}`
        );
      }
    }

    os.status = StatusOrdemServico.CANCELADA;
    os.observacoes = observacao;

    return this.osRepository.save(os);
  }

  // ============================================================================
  // RESUMO
  // ============================================================================

  async resumoOS(contratoId: string) {
    const contrato = await this.validarContratoOS(contratoId);
    const ordens = await this.listarOS(contratoId);
    const bancos = await this.listarBancoMetricas(contratoId);

    const aceitas = ordens.filter(o => o.status === StatusOrdemServico.ACEITA);
    const emExecucao = ordens.filter(o =>
      o.status === StatusOrdemServico.ABERTA ||
      o.status === StatusOrdemServico.EM_EXECUCAO ||
      o.status === StatusOrdemServico.ENTREGUE ||
      o.status === StatusOrdemServico.EM_ACEITE
    );

    const valorAceito = aceitas.reduce((sum, o) => sum + Number(o.valor_total), 0);
    const valorEmExecucao = emExecucao.reduce((sum, o) => sum + Number(o.valor_total), 0);

    const notasQualidade = aceitas.filter(o => o.nota_qualidade != null).map(o => Number(o.nota_qualidade));
    const mediaQualidade = notasQualidade.length > 0
      ? notasQualidade.reduce((sum, n) => sum + n, 0) / notasQualidade.length
      : null;

    const slaExcedido = ordens.filter(o => o.sla_excedido).length;

    return {
      contrato_id: contratoId,
      valor_global: Number(contrato.valor_global),
      total_os: ordens.length,
      os_aceitas: aceitas.length,
      os_em_andamento: emExecucao.length,
      os_canceladas: ordens.filter(o => o.status === StatusOrdemServico.CANCELADA).length,
      valor_aceito: valorAceito,
      valor_em_execucao: valorEmExecucao,
      saldo_valor: Number(contrato.valor_global) - valorAceito,
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

    if (contrato.modalidade_execucao !== ModalidadeExecucao.ORDEM_SERVICO) {
      throw new BadRequestException(
        `Contrato ${contrato.numero_contrato} não é da modalidade ORDEM_SERVICO (atual: ${contrato.modalidade_execucao})`
      );
    }

    return contrato;
  }
}
