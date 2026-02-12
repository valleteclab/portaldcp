import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contrato, ModalidadeExecucao } from './entities/contrato.entity';
import { EtapaCronograma, StatusEtapaCronograma } from './entities/etapa-cronograma.entity';
import { Medicao, StatusMedicao } from './entities/medicao.entity';
import { ItemMedicao } from './entities/item-medicao.entity';

@Injectable()
export class MedicaoService {
  private readonly logger = new Logger(MedicaoService.name);

  constructor(
    @InjectRepository(Contrato)
    private contratoRepository: Repository<Contrato>,
    @InjectRepository(EtapaCronograma)
    private etapaRepository: Repository<EtapaCronograma>,
    @InjectRepository(Medicao)
    private medicaoRepository: Repository<Medicao>,
    @InjectRepository(ItemMedicao)
    private itemMedicaoRepository: Repository<ItemMedicao>,
  ) {}

  // ============================================================================
  // ETAPAS DO CRONOGRAMA
  // ============================================================================

  async criarEtapa(contratoId: string, dados: Partial<EtapaCronograma>): Promise<EtapaCronograma> {
    const contrato = await this.validarContratoMedicao(contratoId);

    // Gerar número da etapa
    const ultimaEtapa = await this.etapaRepository.findOne({
      where: { contrato_id: contratoId },
      order: { numero_etapa: 'DESC' },
    });
    const numeroEtapa = ultimaEtapa ? ultimaEtapa.numero_etapa + 1 : 1;

    const etapa = this.etapaRepository.create({
      ...dados,
      contrato_id: contratoId,
      numero_etapa: numeroEtapa,
    });

    return this.etapaRepository.save(etapa);
  }

  async listarEtapas(contratoId: string): Promise<EtapaCronograma[]> {
    return this.etapaRepository.find({
      where: { contrato_id: contratoId },
      order: { numero_etapa: 'ASC' },
    });
  }

  async atualizarEtapa(etapaId: string, dados: Partial<EtapaCronograma>): Promise<EtapaCronograma> {
    const etapa = await this.etapaRepository.findOne({ where: { id: etapaId } });
    if (!etapa) throw new NotFoundException('Etapa não encontrada');

    // Não permitir alterar etapa concluída
    if (etapa.status === StatusEtapaCronograma.CONCLUIDA) {
      throw new BadRequestException('Etapa já concluída não pode ser alterada');
    }

    Object.assign(etapa, dados);
    return this.etapaRepository.save(etapa);
  }

  async excluirEtapa(etapaId: string): Promise<void> {
    const etapa = await this.etapaRepository.findOne({ where: { id: etapaId } });
    if (!etapa) throw new NotFoundException('Etapa não encontrada');

    if (etapa.status !== StatusEtapaCronograma.PENDENTE) {
      throw new BadRequestException('Só é possível excluir etapas pendentes');
    }

    await this.etapaRepository.remove(etapa);
  }

  // ============================================================================
  // MEDIÇÕES (Boletim de Medição)
  // ============================================================================

  async criarMedicao(contratoId: string, dados: {
    periodo_inicio: string;
    periodo_fim: string;
    fiscal_id?: string;
    fiscal_nome?: string;
    observacoes?: string;
    usuario_cadastro_id?: string;
    usuario_cadastro_nome?: string;
    itens: {
      etapa_id: string;
      percentual_executado_atual: number;
    }[];
  }): Promise<Medicao> {
    const contrato = await this.validarContratoMedicao(contratoId);

    // Gerar número da medição
    const ultimaMedicao = await this.medicaoRepository.findOne({
      where: { contrato_id: contratoId },
      order: { numero_medicao: 'DESC' },
    });
    const numeroMedicao = ultimaMedicao ? ultimaMedicao.numero_medicao + 1 : 1;

    // Calcular valor acumulado anterior (soma das medições aprovadas)
    const medicoesAprovadas = await this.medicaoRepository.find({
      where: { contrato_id: contratoId, status: StatusMedicao.APROVADA },
    });
    const valorAcumuladoAnterior = medicoesAprovadas.reduce(
      (sum, m) => sum + Number(m.valor_medido), 0
    );
    const percentualAcumuladoAnterior = medicoesAprovadas.reduce(
      (sum, m) => sum + Number(m.percentual_fisico_medido), 0
    );

    // Calcular valores da medição a partir dos itens
    let valorMedido = 0;
    let percentualFisicoMedido = 0;
    const itensParaSalvar: Partial<ItemMedicao>[] = [];

    for (const item of dados.itens) {
      const etapa = await this.etapaRepository.findOne({ where: { id: item.etapa_id } });
      if (!etapa) throw new NotFoundException(`Etapa ${item.etapa_id} não encontrada`);

      if (item.percentual_executado_atual <= 0) continue;

      const percentualAnterior = Number(etapa.percentual_executado);
      const percentualAcumulado = percentualAnterior + item.percentual_executado_atual;

      if (percentualAcumulado > 100) {
        throw new BadRequestException(
          `Etapa "${etapa.descricao}": percentual acumulado (${percentualAcumulado}%) excede 100%`
        );
      }

      const valorItem = (item.percentual_executado_atual / 100) * Number(etapa.valor_previsto);
      valorMedido += valorItem;
      percentualFisicoMedido += (item.percentual_executado_atual / 100) * Number(etapa.percentual_fisico);

      itensParaSalvar.push({
        etapa_id: item.etapa_id,
        percentual_executado_anterior: percentualAnterior,
        percentual_executado_atual: item.percentual_executado_atual,
        percentual_executado_acumulado: percentualAcumulado,
        valor_medido: valorItem,
      });
    }

    if (valorMedido <= 0) {
      throw new BadRequestException('A medição deve ter pelo menos um item com valor > 0');
    }

    // Criar medição
    const medicao = this.medicaoRepository.create({
      contrato_id: contratoId,
      numero_medicao: numeroMedicao,
      periodo_inicio: dados.periodo_inicio as any,
      periodo_fim: dados.periodo_fim as any,
      valor_medido: valorMedido,
      valor_acumulado_anterior: valorAcumuladoAnterior,
      valor_acumulado_atual: valorAcumuladoAnterior + valorMedido,
      percentual_fisico_medido: percentualFisicoMedido,
      percentual_fisico_acumulado: percentualAcumuladoAnterior + percentualFisicoMedido,
      fiscal_id: dados.fiscal_id,
      fiscal_nome: dados.fiscal_nome,
      observacoes: dados.observacoes,
      usuario_cadastro_id: dados.usuario_cadastro_id,
      usuario_cadastro_nome: dados.usuario_cadastro_nome,
      status: StatusMedicao.RASCUNHO,
    });

    const medicaoSalva = await this.medicaoRepository.save(medicao);

    // Salvar itens da medição
    for (const item of itensParaSalvar) {
      const itemMedicao = this.itemMedicaoRepository.create({
        ...item,
        medicao_id: medicaoSalva.id,
      });
      await this.itemMedicaoRepository.save(itemMedicao);
    }

    return this.buscarMedicaoCompleta(medicaoSalva.id);
  }

  async listarMedicoes(contratoId: string): Promise<Medicao[]> {
    return this.medicaoRepository.find({
      where: { contrato_id: contratoId },
      order: { numero_medicao: 'ASC' },
    });
  }

  async buscarMedicao(medicaoId: string): Promise<Medicao> {
    return this.buscarMedicaoCompleta(medicaoId);
  }

  async enviarParaAprovacao(medicaoId: string, fiscalId: string, fiscalNome: string): Promise<Medicao> {
    const medicao = await this.medicaoRepository.findOne({ where: { id: medicaoId } });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    if (medicao.status !== StatusMedicao.RASCUNHO) {
      throw new BadRequestException('Apenas medições em rascunho podem ser enviadas para aprovação');
    }

    medicao.status = StatusMedicao.AGUARDANDO_APROVACAO;
    medicao.fiscal_id = fiscalId;
    medicao.fiscal_nome = fiscalNome;
    medicao.data_medicao = new Date() as any;

    return this.medicaoRepository.save(medicao);
  }

  async aprovarMedicao(medicaoId: string, aprovadorId: string, aprovadorNome: string): Promise<Medicao> {
    const medicao = await this.medicaoRepository.findOne({ where: { id: medicaoId } });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    if (medicao.status !== StatusMedicao.AGUARDANDO_APROVACAO) {
      throw new BadRequestException('Apenas medições aguardando aprovação podem ser aprovadas');
    }

    // Buscar itens da medição para atualizar etapas
    const itensMedicao = await this.itemMedicaoRepository.find({
      where: { medicao_id: medicaoId },
    });

    // Atualizar percentual executado de cada etapa
    for (const item of itensMedicao) {
      const etapa = await this.etapaRepository.findOne({ where: { id: item.etapa_id } });
      if (etapa) {
        etapa.percentual_executado = Number(item.percentual_executado_acumulado);
        etapa.valor_executado = Number(etapa.valor_executado) + Number(item.valor_medido);

        if (Number(etapa.percentual_executado) >= 100) {
          etapa.status = StatusEtapaCronograma.CONCLUIDA;
          etapa.data_fim_real = new Date() as any;
        } else if (Number(etapa.percentual_executado) > 0) {
          etapa.status = StatusEtapaCronograma.MEDIDA_PARCIAL;
        }

        await this.etapaRepository.save(etapa);
      }
    }

    // Consumir saldo do contrato
    const contrato = await this.contratoRepository.findOne({ where: { id: medicao.contrato_id } });
    if (contrato) {
      const saldoAtual = Number(contrato.valor_global) - Number(contrato.valor_acrescimos || 0);
      // Atualizar saldo via campo existente (valor_supressoes acumula o consumido)
      // Na prática, o saldo = valor_global - valor consumido por medições
      // Usamos um campo dedicado se existir, senão registramos no log
      this.logger.log(
        `Medição #${medicao.numero_medicao} aprovada: R$ ${medicao.valor_medido} consumido do contrato ${contrato.numero_contrato}`
      );
    }

    // Aprovar
    medicao.status = StatusMedicao.APROVADA;
    medicao.aprovador_id = aprovadorId;
    medicao.aprovador_nome = aprovadorNome;
    medicao.data_aprovacao = new Date() as any;

    return this.medicaoRepository.save(medicao);
  }

  async rejeitarMedicao(medicaoId: string, aprovadorId: string, aprovadorNome: string, observacao: string): Promise<Medicao> {
    const medicao = await this.medicaoRepository.findOne({ where: { id: medicaoId } });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    if (medicao.status !== StatusMedicao.AGUARDANDO_APROVACAO) {
      throw new BadRequestException('Apenas medições aguardando aprovação podem ser rejeitadas');
    }

    medicao.status = StatusMedicao.REJEITADA;
    medicao.aprovador_id = aprovadorId;
    medicao.aprovador_nome = aprovadorNome;
    medicao.data_aprovacao = new Date() as any;
    medicao.observacao_aprovador = observacao;

    return this.medicaoRepository.save(medicao);
  }

  async resumoMedicoes(contratoId: string) {
    const contrato = await this.validarContratoMedicao(contratoId);
    const etapas = await this.listarEtapas(contratoId);
    const medicoes = await this.listarMedicoes(contratoId);

    const medicoesAprovadas = medicoes.filter(m => m.status === StatusMedicao.APROVADA);
    const valorMedidoTotal = medicoesAprovadas.reduce((sum, m) => sum + Number(m.valor_medido), 0);
    const percentualFisicoTotal = medicoesAprovadas.reduce((sum, m) => sum + Number(m.percentual_fisico_medido), 0);

    return {
      contrato_id: contratoId,
      valor_global: Number(contrato.valor_global),
      valor_medido_total: valorMedidoTotal,
      saldo_disponivel: Number(contrato.valor_global) - valorMedidoTotal,
      percentual_fisico_total: Math.min(percentualFisicoTotal, 100),
      total_etapas: etapas.length,
      etapas_concluidas: etapas.filter(e => e.status === StatusEtapaCronograma.CONCLUIDA).length,
      total_medicoes: medicoes.length,
      medicoes_aprovadas: medicoesAprovadas.length,
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async validarContratoMedicao(contratoId: string): Promise<Contrato> {
    const contrato = await this.contratoRepository.findOne({ where: { id: contratoId } });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');

    if (contrato.modalidade_execucao !== ModalidadeExecucao.MEDICAO) {
      throw new BadRequestException(
        `Contrato ${contrato.numero_contrato} não é da modalidade MEDICAO (atual: ${contrato.modalidade_execucao})`
      );
    }

    return contrato;
  }

  private async buscarMedicaoCompleta(medicaoId: string): Promise<Medicao> {
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
    });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    // Buscar itens manualmente (evitar problemas de relation)
    const itens = await this.itemMedicaoRepository.find({
      where: { medicao_id: medicaoId },
    });

    return { ...medicao, itens } as any;
  }
}
