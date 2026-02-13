import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Contrato, ModalidadeExecucao } from './entities/contrato.entity';
import { EtapaCronograma, StatusEtapaCronograma } from './entities/etapa-cronograma.entity';
import { Medicao, StatusMedicao } from './entities/medicao.entity';
import { ItemMedicao } from './entities/item-medicao.entity';
import { Requisicao, StatusRequisicao, TipoRequisicao } from '../almoxarifado/entities/requisicao.entity';

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
    @InjectRepository(Requisicao)
    private requisicaoRepository: Repository<Requisicao>,
  ) { }

  // ============================================================================
  // ORDEM DE SERVIÇO — Consulta centralizada (criação/aprovação via módulo de Requisições)
  // ============================================================================

  async getOSAtiva(contratoId: string): Promise<Requisicao | null> {
    return this.requisicaoRepository.findOne({
      where: {
        contrato_id: contratoId,
        tipo: TipoRequisicao.ORDEM_SERVICO,
        status: In([StatusRequisicao.AUTORIZADA, StatusRequisicao.ORDEM_GERADA]),
      },
    });
  }

  async listarOS(contratoId: string): Promise<Requisicao[]> {
    return this.requisicaoRepository.find({
      where: {
        contrato_id: contratoId,
        tipo: TipoRequisicao.ORDEM_SERVICO,
      },
      order: { sequencial: 'DESC' },
    });
  }

  // ============================================================================
  // ETAPAS DO CRONOGRAMA
  // ============================================================================

  async criarEtapa(contratoId: string, dados: Partial<EtapaCronograma>): Promise<EtapaCronograma> {
    const contrato = await this.validarContratoMedicao(contratoId);

    // Validar que a soma dos valores das etapas não ultrapassa o valor global do contrato
    const etapasExistentes = await this.etapaRepository.find({ where: { contrato_id: contratoId } });
    const valorGlobal = Number(contrato.valor_global) || Number(contrato.valor_inicial) || 0;
    const somaValorExistente = etapasExistentes.reduce((sum, e) => sum + Number(e.valor_previsto), 0);
    const novoValor = Number(dados.valor_previsto) || 0;

    if (somaValorExistente + novoValor > valorGlobal + 0.01) {
      const saldoDisponivel = Math.max(0, valorGlobal - somaValorExistente);
      throw new BadRequestException(
        `O valor da etapa (R$ ${novoValor.toFixed(2)}) excede o saldo disponível para etapas. ` +
        `Valor do contrato: R$ ${valorGlobal.toFixed(2)}, já alocado em etapas: R$ ${somaValorExistente.toFixed(2)}, ` +
        `disponível: R$ ${saldoDisponivel.toFixed(2)}.`
      );
    }

    // Validar que a soma dos percentuais não ultrapassa 100%
    const somaPercentualExistente = etapasExistentes.reduce((sum, e) => sum + Number(e.percentual_fisico), 0);
    const novoPercentual = Number(dados.percentual_fisico) || 0;

    if (somaPercentualExistente + novoPercentual > 100.01) {
      const percentualDisponivel = Math.max(0, 100 - somaPercentualExistente);
      throw new BadRequestException(
        `O percentual da etapa (${novoPercentual.toFixed(2)}%) excede o percentual disponível. ` +
        `Já alocado: ${somaPercentualExistente.toFixed(2)}%, disponível: ${percentualDisponivel.toFixed(2)}%.`
      );
    }

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

    if (etapa.status === StatusEtapaCronograma.CONCLUIDA) {
      throw new BadRequestException('Etapa já concluída não pode ser alterada');
    }

    // Validar valor previsto se foi alterado
    if (dados.valor_previsto !== undefined) {
      const contrato = await this.contratoRepository.findOne({ where: { id: etapa.contrato_id } });
      if (contrato) {
        const valorGlobal = Number(contrato.valor_global) || Number(contrato.valor_inicial) || 0;
        const etapasExistentes = await this.etapaRepository.find({ where: { contrato_id: etapa.contrato_id } });
        const somaValorOutras = etapasExistentes
          .filter(e => e.id !== etapaId)
          .reduce((sum, e) => sum + Number(e.valor_previsto), 0);
        const novoValor = Number(dados.valor_previsto) || 0;

        if (somaValorOutras + novoValor > valorGlobal + 0.01) {
          const saldoDisponivel = Math.max(0, valorGlobal - somaValorOutras);
          throw new BadRequestException(
            `O valor da etapa (R$ ${novoValor.toFixed(2)}) excede o saldo disponível para etapas. ` +
            `Valor do contrato: R$ ${valorGlobal.toFixed(2)}, já alocado em outras etapas: R$ ${somaValorOutras.toFixed(2)}, ` +
            `disponível: R$ ${saldoDisponivel.toFixed(2)}.`
          );
        }
      }
    }

    // Validar percentual físico se foi alterado
    if (dados.percentual_fisico !== undefined) {
      const etapasExistentes = await this.etapaRepository.find({ where: { contrato_id: etapa.contrato_id } });
      const somaPercentualOutras = etapasExistentes
        .filter(e => e.id !== etapaId)
        .reduce((sum, e) => sum + Number(e.percentual_fisico), 0);
      const novoPercentual = Number(dados.percentual_fisico) || 0;

      if (somaPercentualOutras + novoPercentual > 100.01) {
        const percentualDisponivel = Math.max(0, 100 - somaPercentualOutras);
        throw new BadRequestException(
          `O percentual da etapa (${novoPercentual.toFixed(2)}%) excede o percentual disponível. ` +
          `Já alocado em outras etapas: ${somaPercentualOutras.toFixed(2)}%, disponível: ${percentualDisponivel.toFixed(2)}%.`
        );
      }
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
  // MEDIÇÕES — Criação (pelo fornecedor ou fiscal)
  // ============================================================================

  /**
   * Cria uma medição. Pode ser chamado pelo fornecedor (via portal) ou pelo fiscal (órgão).
   * A medição é criada com status RASCUNHO.
   */
  async criarMedicao(contratoId: string, dados: {
    periodo_inicio: string;
    periodo_fim: string;
    fornecedor_id?: string;
    fornecedor_nome?: string;
    fornecedor_observacoes?: string;
    nota_fiscal_numero?: string;
    nota_fiscal_valor?: number;
    nota_fiscal_data?: string;
    fiscal_id?: string;
    fiscal_nome?: string;
    observacoes?: string;
    usuario_cadastro_id?: string;
    usuario_cadastro_nome?: string;
    itens: {
      etapa_id: string;
      percentual_executado_atual?: number;
      valor_executado_atual?: number;
    }[];
  }, opcoes?: { skipOSCheck?: boolean }): Promise<Medicao> {
    // Sanitizar campos opcionais: strings vazias viram undefined para evitar erro em colunas date/numeric
    if (dados.nota_fiscal_data !== undefined && dados.nota_fiscal_data.toString().trim() === '') {
      dados.nota_fiscal_data = undefined;
    }
    if (dados.nota_fiscal_numero !== undefined && dados.nota_fiscal_numero.toString().trim() === '') {
      dados.nota_fiscal_numero = undefined;
    }
    if (dados.nota_fiscal_valor !== undefined && dados.nota_fiscal_valor !== null) {
      const nfVal = Number(dados.nota_fiscal_valor);
      dados.nota_fiscal_valor = isNaN(nfVal) ? undefined : nfVal;
    }

    const contrato = await this.validarContratoMedicao(contratoId);

    // REGRA: Exigir OS autorizada para criar medição (pode ser pulado pelo portal do fornecedor)
    if (!opcoes?.skipOSCheck) {
      const osAtiva = await this.getOSAtiva(contratoId);
      if (!osAtiva) {
        throw new BadRequestException(
          'Não é possível criar medição sem uma Ordem de Serviço autorizada. ' +
          'Crie e autorize uma OS na página de Requisições antes de registrar medições.'
        );
      }

      // Se OS está AUTORIZADA, mover para ORDEM_GERADA
      if (osAtiva.status === StatusRequisicao.AUTORIZADA) {
        osAtiva.status = StatusRequisicao.ORDEM_GERADA;
        await this.requisicaoRepository.save(osAtiva);
        this.logger.log(`OS ${osAtiva.numero} movida para ORDEM_GERADA ao criar medição`);
      }
    }

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

      // Suporta entrada por percentual OU por valor
      let percentualExecAtual = item.percentual_executado_atual || 0;
      if (!percentualExecAtual && item.valor_executado_atual && Number(etapa.valor_previsto) > 0) {
        // Converter valor para percentual
        percentualExecAtual = (item.valor_executado_atual / Number(etapa.valor_previsto)) * 100;
      }

      if (percentualExecAtual <= 0) continue;

      const percentualAnterior = Number(etapa.percentual_executado);
      const percentualAcumulado = percentualAnterior + percentualExecAtual;

      if (percentualAcumulado > 100) {
        throw new BadRequestException(
          `Etapa "${etapa.descricao}": percentual acumulado (${percentualAcumulado.toFixed(1)}%) excede 100%`
        );
      }

      const valorItem = (percentualExecAtual / 100) * Number(etapa.valor_previsto);
      valorMedido += valorItem;
      percentualFisicoMedido += (percentualExecAtual / 100) * Number(etapa.percentual_fisico);

      itensParaSalvar.push({
        etapa_id: item.etapa_id,
        percentual_executado_anterior: percentualAnterior,
        percentual_executado_atual: percentualExecAtual,
        percentual_executado_acumulado: percentualAcumulado,
        valor_medido: valorItem,
      });
    }

    if (valorMedido <= 0) {
      throw new BadRequestException('A medição deve ter pelo menos um item com valor > 0');
    }

    // Validar que o valor medido não excede o saldo disponível do contrato
    const valorContrato = Number(contrato.valor_global) || Number(contrato.valor_inicial) || 0;
    const saldoDisponivel = valorContrato - valorAcumuladoAnterior;
    if (valorMedido > saldoDisponivel + 0.01) { // tolerância de centavo para arredondamento
      throw new BadRequestException(
        `O valor da medição (R$ ${valorMedido.toFixed(2)}) excede o saldo disponível do contrato (R$ ${saldoDisponivel.toFixed(2)}). ` +
        `Valor do contrato: R$ ${valorContrato.toFixed(2)}, já medido: R$ ${valorAcumuladoAnterior.toFixed(2)}.`
      );
    }

    // Criar medição
    const medicao = this.medicaoRepository.create({
      contrato_id: contratoId,
      numero_medicao: numeroMedicao,
      periodo_inicio: dados.periodo_inicio,
      periodo_fim: dados.periodo_fim,
      valor_medido: valorMedido,
      valor_acumulado_anterior: valorAcumuladoAnterior,
      valor_acumulado_atual: valorAcumuladoAnterior + valorMedido,
      percentual_fisico_medido: percentualFisicoMedido,
      percentual_fisico_acumulado: percentualAcumuladoAnterior + percentualFisicoMedido,
      fornecedor_id: dados.fornecedor_id,
      fornecedor_nome: dados.fornecedor_nome,
      fornecedor_observacoes: dados.fornecedor_observacoes,
      nota_fiscal_numero: dados.nota_fiscal_numero || null,
      nota_fiscal_valor: dados.nota_fiscal_valor || null,
      nota_fiscal_data: dados.nota_fiscal_data || null,
      fiscal_id: dados.fiscal_id,
      fiscal_nome: dados.fiscal_nome,
      observacoes: dados.observacoes,
      usuario_cadastro_id: dados.usuario_cadastro_id,
      usuario_cadastro_nome: dados.usuario_cadastro_nome,
      status: StatusMedicao.RASCUNHO,
    } as any);

    const medicaoSalva = await this.medicaoRepository.save(medicao) as unknown as Medicao;

    // Salvar itens da medição
    for (const item of itensParaSalvar) {
      const itemMedicao = this.itemMedicaoRepository.create({
        ...item,
        medicao_id: medicaoSalva.id,
      } as any);
      await this.itemMedicaoRepository.save(itemMedicao);
    }

    return this.buscarMedicaoCompleta(medicaoSalva.id);
  }

  // ============================================================================
  // MEDIÇÕES — Exclusão
  // ============================================================================

  /**
   * Exclui uma medição e seus itens.
   * - RASCUNHO / DEVOLVIDA: qualquer um pode excluir (fornecedor ou órgão)
   * - APROVADA: apenas admin pode excluir (reverte saldo das etapas)
   * - Outros status: não podem ser excluídos
   */
  async excluirMedicao(medicaoId: string, solicitanteId?: string, opcoes?: { isAdmin?: boolean }): Promise<{ message: string }> {
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
      relations: ['contrato'],
    });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    const statusPermitidosSemAdmin = [StatusMedicao.RASCUNHO, StatusMedicao.DEVOLVIDA];
    const statusPermitidosAdmin = [...statusPermitidosSemAdmin, StatusMedicao.APROVADA, StatusMedicao.SUBMETIDA, StatusMedicao.AGUARDANDO_ATESTE, StatusMedicao.AGUARDANDO_APROVACAO, StatusMedicao.REJEITADA];

    const isAdmin = opcoes?.isAdmin === true;

    if (isAdmin) {
      if (!statusPermitidosAdmin.includes(medicao.status)) {
        throw new BadRequestException(`Não é possível excluir medição com status ${medicao.status}`);
      }
    } else {
      if (!statusPermitidosSemAdmin.includes(medicao.status)) {
        throw new BadRequestException(
          `Apenas medições em Rascunho ou Devolvida podem ser excluídas. Status atual: ${medicao.status}`
        );
      }
    }

    // Se solicitanteId informado (fornecedor), verificar se é o fornecedor do contrato
    if (solicitanteId && medicao.contrato && medicao.contrato.fornecedor_id !== solicitanteId) {
      throw new ForbiddenException('Você não tem permissão para excluir esta medição');
    }

    // Se medição APROVADA, reverter os valores das etapas
    if (medicao.status === StatusMedicao.APROVADA) {
      const itensMedicao = await this.itemMedicaoRepository.find({
        where: { medicao_id: medicaoId },
      });

      for (const item of itensMedicao) {
        const etapa = await this.etapaRepository.findOne({ where: { id: item.etapa_id } });
        if (etapa) {
          // Reverter percentual: subtrair o percentual_executado_atual desta medição
          etapa.percentual_executado = Math.max(0, Number(etapa.percentual_executado) - Number(item.percentual_executado_atual));
          // Reverter valor: subtrair o valor_medido desta medição
          etapa.valor_executado = Math.max(0, Number(etapa.valor_executado) - Number(item.valor_medido));

          // Recalcular status da etapa
          if (Number(etapa.percentual_executado) >= 100) {
            etapa.status = StatusEtapaCronograma.CONCLUIDA;
          } else if (Number(etapa.percentual_executado) > 0) {
            etapa.status = StatusEtapaCronograma.MEDIDA_PARCIAL;
          } else {
            etapa.status = StatusEtapaCronograma.PENDENTE;
            etapa.data_fim_real = null as any;
          }

          await this.etapaRepository.save(etapa);
        }
      }

      this.logger.warn(
        `ADMIN: Medição APROVADA #${medicao.numero_medicao} excluída. ` +
        `Valor revertido: R$ ${Number(medicao.valor_medido).toFixed(2)} do contrato ${medicao.contrato_id}`
      );
    }

    // Excluir itens da medição primeiro
    await this.itemMedicaoRepository.delete({ medicao_id: medicaoId });

    // Excluir a medição
    await this.medicaoRepository.remove(medicao);

    this.logger.log(`Medição #${medicao.numero_medicao} (${medicao.status}) excluída por ${solicitanteId || 'órgão/admin'}`);
    return { message: `Medição #${medicao.numero_medicao} excluída com sucesso` };
  }

  // ============================================================================
  // MEDIÇÕES — Submissão pelo fornecedor
  // ============================================================================

  /**
   * Fornecedor submete a medição para análise do fiscal.
   * Status: RASCUNHO → SUBMETIDA
   */
  async submeterMedicao(medicaoId: string, fornecedorId: string, dados?: {
    fornecedor_observacoes?: string;
    nota_fiscal_numero?: string;
    nota_fiscal_valor?: number;
    nota_fiscal_data?: string;
  }): Promise<Medicao> {
    const medicao = await this.medicaoRepository.findOne({ where: { id: medicaoId } });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    // Verificar se é o fornecedor correto
    const contrato = await this.contratoRepository.findOne({ where: { id: medicao.contrato_id } });
    if (contrato && contrato.fornecedor_id !== fornecedorId) {
      throw new ForbiddenException('Você não tem permissão para submeter esta medição');
    }

    if (medicao.status !== StatusMedicao.RASCUNHO && medicao.status !== StatusMedicao.DEVOLVIDA) {
      throw new BadRequestException('Apenas medições em rascunho ou devolvidas podem ser submetidas');
    }

    medicao.status = StatusMedicao.SUBMETIDA;
    medicao.data_submissao = new Date() as any;
    medicao.fornecedor_id = fornecedorId;

    if (dados) {
      if (dados.fornecedor_observacoes) medicao.fornecedor_observacoes = dados.fornecedor_observacoes;
      if (dados.nota_fiscal_numero) medicao.nota_fiscal_numero = dados.nota_fiscal_numero;
      if (dados.nota_fiscal_valor) medicao.nota_fiscal_valor = dados.nota_fiscal_valor;
      if (dados.nota_fiscal_data) medicao.nota_fiscal_data = dados.nota_fiscal_data as any;
    }

    // Limpar dados de devolução anterior
    medicao.motivo_devolucao = null as any;
    medicao.data_devolucao = null as any;

    await this.medicaoRepository.save(medicao);
    this.logger.log(`Medição #${medicao.numero_medicao} submetida pelo fornecedor ${fornecedorId}`);
    return this.buscarMedicaoCompleta(medicaoId);
  }

  // ============================================================================
  // MEDIÇÕES — Ateste do Fiscal (órgão)
  // ============================================================================

  /**
   * Fiscal do órgão faz o ateste técnico da medição.
   * Status: SUBMETIDA → AGUARDANDO_APROVACAO (pós-ateste, vai para gestor)
   */
  async atestarMedicao(medicaoId: string, fiscalId: string, fiscalNome: string, dados?: {
    observacoes?: string;
    verificado_in_loco?: boolean;
  }): Promise<Medicao> {
    const medicao = await this.medicaoRepository.findOne({ where: { id: medicaoId } });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    if (medicao.status !== StatusMedicao.SUBMETIDA) {
      throw new BadRequestException('Apenas medições submetidas podem receber ateste');
    }

    medicao.status = StatusMedicao.AGUARDANDO_APROVACAO;
    medicao.ateste_fiscal_id = fiscalId;
    medicao.ateste_fiscal_nome = fiscalNome;
    medicao.ateste_data = new Date() as any;
    medicao.ateste_observacoes = dados?.observacoes || null as any;
    medicao.ateste_verificado_in_loco = dados?.verificado_in_loco || false;

    await this.medicaoRepository.save(medicao);
    this.logger.log(`Medição #${medicao.numero_medicao} atestada pelo fiscal ${fiscalNome}`);
    return this.buscarMedicaoCompleta(medicaoId);
  }

  /**
   * Fiscal devolve a medição ao fornecedor para correção.
   * Status: SUBMETIDA → DEVOLVIDA
   */
  async devolverMedicao(medicaoId: string, fiscalId: string, fiscalNome: string, motivo: string): Promise<Medicao> {
    const medicao = await this.medicaoRepository.findOne({ where: { id: medicaoId } });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    if (medicao.status !== StatusMedicao.SUBMETIDA) {
      throw new BadRequestException('Apenas medições submetidas podem ser devolvidas');
    }

    if (!motivo || !motivo.trim()) {
      throw new BadRequestException('Motivo da devolução é obrigatório');
    }

    medicao.status = StatusMedicao.DEVOLVIDA;
    medicao.motivo_devolucao = motivo;
    medicao.data_devolucao = new Date() as any;
    medicao.ateste_fiscal_id = fiscalId;
    medicao.ateste_fiscal_nome = fiscalNome;

    await this.medicaoRepository.save(medicao);
    this.logger.log(`Medição #${medicao.numero_medicao} devolvida pelo fiscal ${fiscalNome}: ${motivo}`);
    return this.buscarMedicaoCompleta(medicaoId);
  }

  // ============================================================================
  // MEDIÇÕES — Envio direto para aprovação (fluxo legado / fiscal cria e envia)
  // ============================================================================

  /**
   * Fiscal envia medição diretamente para aprovação (sem passar pelo fornecedor).
   * Usado quando o fiscal cria a medição internamente.
   * Status: RASCUNHO → AGUARDANDO_APROVACAO
   */
  async enviarParaAprovacao(medicaoId: string, fiscalId: string, fiscalNome: string): Promise<Medicao> {
    const medicao = await this.medicaoRepository.findOne({ where: { id: medicaoId } });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    if (medicao.status !== StatusMedicao.RASCUNHO) {
      throw new BadRequestException('Apenas medições em rascunho podem ser enviadas para aprovação');
    }

    medicao.status = StatusMedicao.AGUARDANDO_APROVACAO;
    medicao.fiscal_id = fiscalId;
    medicao.fiscal_nome = fiscalNome;
    medicao.ateste_fiscal_id = fiscalId;
    medicao.ateste_fiscal_nome = fiscalNome;
    medicao.ateste_data = new Date() as any;
    medicao.ateste_verificado_in_loco = true;
    medicao.data_medicao = new Date() as any;

    await this.medicaoRepository.save(medicao);
    return this.buscarMedicaoCompleta(medicaoId);
  }

  // ============================================================================
  // MEDIÇÕES — Aprovação do Gestor (Central de Aprovações)
  // ============================================================================

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

    // Log consumo de saldo
    const contrato = await this.contratoRepository.findOne({ where: { id: medicao.contrato_id } });
    if (contrato) {
      this.logger.log(
        `Medição #${medicao.numero_medicao} aprovada: R$ ${medicao.valor_medido} consumido do contrato ${contrato.numero_contrato}`
      );
    }

    // Aprovar
    medicao.status = StatusMedicao.APROVADA;
    medicao.aprovador_id = aprovadorId;
    medicao.aprovador_nome = aprovadorNome;
    medicao.data_aprovacao = new Date() as any;

    await this.medicaoRepository.save(medicao);
    return this.buscarMedicaoCompleta(medicaoId);
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

    await this.medicaoRepository.save(medicao);
    return this.buscarMedicaoCompleta(medicaoId);
  }

  // ============================================================================
  // MEDIÇÕES — Consultas
  // ============================================================================

  async listarMedicoes(contratoId: string): Promise<Medicao[]> {
    const medicoes = await this.medicaoRepository.find({
      where: { contrato_id: contratoId },
      order: { numero_medicao: 'ASC' },
    });

    // Enriquecer cada medição com seus itens e dados das etapas
    for (const medicao of medicoes) {
      const itens = await this.itemMedicaoRepository.find({
        where: { medicao_id: medicao.id },
        relations: ['etapa'],
      });
      (medicao as any).itens = itens.map(item => ({
        ...item,
        etapa_descricao: item.etapa?.descricao || '',
        etapa_numero: item.etapa?.numero_etapa || 0,
        etapa_valor_previsto: item.etapa ? Number(item.etapa.valor_previsto) : 0,
        etapa_percentual_fisico: item.etapa ? Number(item.etapa.percentual_fisico) : 0,
      }));
    }

    return medicoes;
  }

  async buscarMedicao(medicaoId: string): Promise<Medicao> {
    return this.buscarMedicaoCompleta(medicaoId);
  }

  /**
   * Lista medições submetidas pelo fornecedor, pendentes de ateste do fiscal.
   * Filtrado por orgao_id via contrato.
   */
  async listarPendentesAteste(orgaoId: string): Promise<any[]> {
    const medicoes = await this.medicaoRepository
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.contrato', 'c')
      .where('c.orgao_id = :orgaoId', { orgaoId })
      .andWhere('m.status = :status', { status: StatusMedicao.SUBMETIDA })
      .orderBy('m.data_submissao', 'ASC')
      .getMany();

    return medicoes;
  }

  /**
   * Lista medições atestadas pelo fiscal, pendentes de aprovação do gestor.
   * Filtrado por orgao_id via contrato.
   */
  async listarPendentesAprovacao(orgaoId: string): Promise<any[]> {
    const medicoes = await this.medicaoRepository
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.contrato', 'c')
      .where('c.orgao_id = :orgaoId', { orgaoId })
      .andWhere('m.status = :status', { status: StatusMedicao.AGUARDANDO_APROVACAO })
      .orderBy('m.ateste_data', 'ASC')
      .getMany();

    return medicoes;
  }

  /**
   * Lista medições de um fornecedor específico em um contrato.
   */
  async listarMedicoesFornecedor(contratoId: string, fornecedorId: string): Promise<Medicao[]> {
    // Verificar que o fornecedor é dono do contrato
    const contrato = await this.contratoRepository.findOne({ where: { id: contratoId } });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    if (contrato.fornecedor_id !== fornecedorId) {
      throw new ForbiddenException('Você não tem acesso a este contrato');
    }

    return this.medicaoRepository.find({
      where: { contrato_id: contratoId },
      order: { numero_medicao: 'ASC' },
    });
  }

  // ============================================================================
  // MEDIÇÕES — Resumo
  // ============================================================================

  async resumoMedicoes(contratoId: string) {
    const contrato = await this.validarContratoMedicao(contratoId);
    const etapas = await this.listarEtapas(contratoId);
    const medicoes = await this.listarMedicoes(contratoId);

    const medicoesAprovadas = medicoes.filter(m => m.status === StatusMedicao.APROVADA);
    const valorMedidoTotal = medicoesAprovadas.reduce((sum, m) => sum + Number(m.valor_medido), 0);
    const percentualFisicoTotal = medicoesAprovadas.reduce((sum, m) => sum + Number(m.percentual_fisico_medido), 0);

    const pendentesAteste = medicoes.filter(m => m.status === StatusMedicao.SUBMETIDA).length;
    const pendentesAprovacao = medicoes.filter(m => m.status === StatusMedicao.AGUARDANDO_APROVACAO).length;

    // Buscar OS ativa
    const osAtiva = await this.getOSAtiva(contratoId);
    const todasOS = await this.listarOS(contratoId);

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
      pendentes_ateste: pendentesAteste,
      pendentes_aprovacao: pendentesAprovacao,
      os_ativa: osAtiva,
      total_os: todasOS.length,
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
      relations: ['contrato'],
    });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    // Buscar itens com dados da etapa do cronograma
    const itens = await this.itemMedicaoRepository.find({
      where: { medicao_id: medicaoId },
      relations: ['etapa'],
    });

    // Enriquecer cada item com dados da etapa para o frontend
    const itensEnriquecidos = itens.map(item => ({
      ...item,
      etapa_descricao: item.etapa?.descricao || '',
      etapa_numero: item.etapa?.numero_etapa || 0,
      etapa_valor_previsto: item.etapa ? Number(item.etapa.valor_previsto) : 0,
      etapa_percentual_fisico: item.etapa ? Number(item.etapa.percentual_fisico) : 0,
    }));

    return { ...medicao, itens: itensEnriquecidos } as any;
  }
}
