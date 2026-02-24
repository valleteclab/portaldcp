import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Contrato, ModalidadeExecucao } from './entities/contrato.entity';
import { EtapaCronograma, StatusEtapaCronograma } from './entities/etapa-cronograma.entity';
import { ItemCronograma } from './entities/item-cronograma.entity';
import { ItemMedicaoItem } from './entities/item-medicao-item.entity';
import { Medicao, StatusMedicao } from './entities/medicao.entity';
import { ItemMedicao } from './entities/item-medicao.entity';
import { MensagemSolicitacaoMedicao } from './entities/mensagem-solicitacao-medicao.entity';
import { DiscriminacaoDespesaMedicao } from './entities/discriminacao-despesa-medicao.entity';
import { ItemContrato } from '../almoxarifado/entities/item-contrato.entity';
import { Requisicao, StatusRequisicao, TipoRequisicao } from '../almoxarifado/entities/requisicao.entity';
import { OrdemServicoContrato, StatusOrdemServico } from './entities/ordem-servico-contrato.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { TipoNotificacao, PrioridadeNotificacao } from '../notificacoes/entities/notificacao.entity';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';

@Injectable()
export class MedicaoService {
  private readonly logger = new Logger(MedicaoService.name);

  constructor(
    @InjectRepository(Contrato)
    private contratoRepository: Repository<Contrato>,
    @InjectRepository(Orgao)
    private orgaoRepository: Repository<Orgao>,
    @InjectRepository(EtapaCronograma)
    private etapaRepository: Repository<EtapaCronograma>,
    @InjectRepository(ItemCronograma)
    private itemCronogramaRepository: Repository<ItemCronograma>,
    @InjectRepository(ItemMedicaoItem)
    private itemMedicaoItemRepository: Repository<ItemMedicaoItem>,
    @InjectRepository(Medicao)
    private medicaoRepository: Repository<Medicao>,
    @InjectRepository(ItemMedicao)
    private itemMedicaoRepository: Repository<ItemMedicao>,
    @InjectRepository(MensagemSolicitacaoMedicao)
    private mensagemSolicitacaoRepository: Repository<MensagemSolicitacaoMedicao>,
    @InjectRepository(DiscriminacaoDespesaMedicao)
    private discriminacaoRepository: Repository<DiscriminacaoDespesaMedicao>,
    @InjectRepository(ItemContrato)
    private itemContratoRepository: Repository<ItemContrato>,
    @InjectRepository(Requisicao)
    private requisicaoRepository: Repository<Requisicao>,
    @InjectRepository(OrdemServicoContrato)
    private ordemServicoRepository: Repository<OrdemServicoContrato>,
    @InjectRepository(Usuario)
    private usuarioRepository: Repository<Usuario>,
    @InjectRepository(Fornecedor)
    private fornecedorRepository: Repository<Fornecedor>,
    private notificacoesService: NotificacoesService,
  ) { }

  // ============================================================================
  // ORDEM DE SERVIÇO — Dual source: Requisicao ou OrdemServicoContrato conforme fluxo_os
  // ============================================================================

  /**
   * Retorna o fluxo efetivo de OS para o contrato.
   * Se ORDENS_SERVICO não está habilitado no órgão → REQUISICAO.
   * Caso contrário → fluxo_os do órgão (REQUISICAO ou MODULO_OS).
   */
  private async getFluxoOsEfetivo(contratoId: string): Promise<'REQUISICAO' | 'MODULO_OS'> {
    const contrato = await this.contratoRepository.findOne({ where: { id: contratoId } });
    if (!contrato?.orgao_id) return 'REQUISICAO';

    const orgao = await this.orgaoRepository.findOne({ where: { id: contrato.orgao_id } });
    if (!orgao) return 'REQUISICAO';

    const modulos = orgao.modulos_habilitados || [];
    if (!modulos.includes(ModuloSistema.ORDENS_SERVICO)) return 'REQUISICAO';

    return (orgao.fluxo_os === 'MODULO_OS' ? 'MODULO_OS' : 'REQUISICAO') as 'REQUISICAO' | 'MODULO_OS';
  }

  /**
   * Normaliza Requisicao para formato compatível com o frontend (numero_os, data_aprovacao, aprovador_nome).
   */
  private normalizarOSRequisicao(req: Requisicao): any {
    return {
      ...req,
      numero_os: req.numero,
      descricao: req.descricao_os,
      data_aprovacao: req.data_autorizacao,
      aprovador_nome: req.usuario_autorizador_nome,
    };
  }

  async getOSAtiva(contratoId: string): Promise<any | null> {
    const fluxo = await this.getFluxoOsEfetivo(contratoId);

    if (fluxo === 'REQUISICAO') {
      const req = await this.requisicaoRepository.findOne({
        where: {
          contrato_id: contratoId,
          tipo: TipoRequisicao.ORDEM_SERVICO,
          status: In([StatusRequisicao.AUTORIZADA, StatusRequisicao.ORDEM_GERADA]),
        },
      });
      return req ? this.normalizarOSRequisicao(req) : null;
    }

    const os = await this.ordemServicoRepository.findOne({
      where: {
        contrato_id: contratoId,
        status: In([StatusOrdemServico.AUTORIZADA, StatusOrdemServico.EM_EXECUCAO]),
      },
    });
    return os;
  }

  async listarOS(contratoId: string): Promise<any[]> {
    const fluxo = await this.getFluxoOsEfetivo(contratoId);

    if (fluxo === 'REQUISICAO') {
      const list = await this.requisicaoRepository.find({
        where: { contrato_id: contratoId, tipo: TipoRequisicao.ORDEM_SERVICO },
        order: { sequencial: 'DESC' },
      });
      return list.map(r => this.normalizarOSRequisicao(r));
    }

    return this.ordemServicoRepository.find({
      where: { contrato_id: contratoId },
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
  // ITENS DO CRONOGRAMA (Serviços por quantidade)
  // ============================================================================

  /** Retorna true se o contrato usa itens do cronograma (não etapas) */
  async usarItensCronograma(contratoId: string): Promise<boolean> {
    const count = await this.itemCronogramaRepository.count({ where: { contrato_id: contratoId } });
    return count > 0;
  }

  async listarItensCronograma(contratoId: string): Promise<ItemCronograma[]> {
    await this.validarContratoMedicao(contratoId);
    return this.itemCronogramaRepository.find({
      where: { contrato_id: contratoId },
      order: { numero_item: 'ASC' },
    });
  }

  async criarItemCronograma(contratoId: string, dados: Partial<ItemCronograma>): Promise<ItemCronograma> {
    const contrato = await this.validarContratoMedicao(contratoId);

    // Contrato deve ter só etapas OU só itens
    const etapasExistentes = await this.etapaRepository.count({ where: { contrato_id: contratoId } });
    if (etapasExistentes > 0) {
      throw new BadRequestException('Contrato já possui etapas. Use etapas ou itens, não ambos.');
    }

    const valorGlobal = Number(contrato.valor_global) || Number(contrato.valor_inicial) || 0;
    const itensExistentes = await this.itemCronogramaRepository.find({ where: { contrato_id: contratoId } });
    const somaValorExistente = itensExistentes.reduce((sum, i) => sum + Number(i.valor_total), 0);
    const quantidade = Number(dados.quantidade) || 0;
    const valorUnitario = Number(dados.valor_unitario) || 0;
    const valorTotal = quantidade * valorUnitario;

    if (somaValorExistente + valorTotal > valorGlobal + 0.01) {
      const saldoDisponivel = Math.max(0, valorGlobal - somaValorExistente);
      throw new BadRequestException(
        `O valor total do item (R$ ${valorTotal.toFixed(2)}) excede o saldo disponível. ` +
        `Valor do contrato: R$ ${valorGlobal.toFixed(2)}, já alocado: R$ ${somaValorExistente.toFixed(2)}, ` +
        `disponível: R$ ${saldoDisponivel.toFixed(2)}.`
      );
    }

    const numeroItem = itensExistentes.length > 0
      ? Math.max(...itensExistentes.map(i => i.numero_item)) + 1
      : 1;

    const item = this.itemCronogramaRepository.create({
      contrato_id: contratoId,
      numero_item: numeroItem,
      descricao: dados.descricao || '',
      unidade_medida: dados.unidade_medida || 'UNIDADE',
      quantidade,
      valor_unitario: valorUnitario,
      valor_total: valorTotal,
      observacoes: dados.observacoes,
    } as any);
    return this.itemCronogramaRepository.save(item);
  }

  async atualizarItemCronograma(itemId: string, dados: Partial<ItemCronograma>): Promise<ItemCronograma> {
    const item = await this.itemCronogramaRepository.findOne({ where: { id: itemId }, relations: ['contrato'] });
    if (!item) throw new NotFoundException('Item do cronograma não encontrado');

    const quantidadeMedida = Number(item.quantidade_medida) || 0;
    const quantidade = dados.quantidade !== undefined ? Number(dados.quantidade) : Number(item.quantidade);
    const valorUnitario = dados.valor_unitario !== undefined ? Number(dados.valor_unitario) : Number(item.valor_unitario);

    if (quantidade < quantidadeMedida - 0.0001) {
      throw new BadRequestException(
        `Quantidade (${quantidade}) não pode ser menor que a já medida (${quantidadeMedida.toFixed(2)})`
      );
    }

    const valorTotal = quantidade * valorUnitario;
    Object.assign(item, {
      ...dados,
      quantidade,
      valor_unitario: valorUnitario,
      valor_total: valorTotal,
    });
    return this.itemCronogramaRepository.save(item);
  }

  async excluirItemCronograma(itemId: string): Promise<void> {
    const item = await this.itemCronogramaRepository.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Item do cronograma não encontrado');

    const quantidadeMedida = Number(item.quantidade_medida) || 0;
    if (quantidadeMedida > 0) {
      throw new BadRequestException(
        `Não é possível excluir item com quantidade já medida (${quantidadeMedida}). ` +
        'Exclua as medições aprovadas primeiro.'
      );
    }

    await this.itemMedicaoItemRepository.delete({ item_cronograma_id: itemId });
    await this.itemCronogramaRepository.remove(item);
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
    valor_medido?: number;
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
    itens?: Array<
      | { etapa_id: string; percentual_executado_atual?: number; valor_executado_atual?: number }
      | { item_cronograma_id: string; quantidade_medida: number }
    >;
  }, opcoes?: { skipOSCheck?: boolean }): Promise<Medicao> {
    if (!dados.periodo_inicio || !dados.periodo_fim) {
      throw new BadRequestException('Período de início e fim são obrigatórios');
    }

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
    const servicoContinuado = this.isServicoContinuado(contrato);

    let osVinculada: OrdemServicoContrato | null = null;

    if (!servicoContinuado) {
      if (!dados.itens || !Array.isArray(dados.itens) || dados.itens.length === 0) {
        throw new BadRequestException('Informe pelo menos um item de medição');
      }
    }

    // Verificar OS autorizada (para todos os tipos de contrato, a menos que skipOSCheck)
    if (!opcoes?.skipOSCheck) {
      osVinculada = await this.getOSAtiva(contratoId);
      if (!osVinculada) {
        throw new BadRequestException(
          'Não é possível criar medição sem uma Ordem de Serviço autorizada. ' +
          'Crie e autorize uma OS no módulo de Ordens de Serviço antes de registrar medições.'
        );
      }

      if (osVinculada.status === StatusOrdemServico.AUTORIZADA) {
        osVinculada.status = StatusOrdemServico.EM_EXECUCAO;
        await this.ordemServicoRepository.save(osVinculada);
        this.logger.log(`OS ${osVinculada.numero_os} movida para EM_EXECUCAO ao criar medição`);
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

    let valorMedido = 0;
    let percentualFisicoMedido = 0;
    const itensParaSalvar: Partial<ItemMedicao>[] = [];
    const itensItemParaSalvar: Array<{ item_cronograma_id: string; quantidade_medida: number; valor_medido: number }> = [];

    if (servicoContinuado) {
      // Fluxo simplificado: valor direto informado pelo usuário
      valorMedido = Number(dados.valor_medido) || 0;
      if (valorMedido <= 0) {
        throw new BadRequestException('Informe o valor medido');
      }

      // Validar saldo
      const valorComprometido = await this.somarValorMedicoesComprometidas(contratoId);
      const valorContrato = Number(contrato.valor_global) || Number(contrato.valor_inicial) || 0;
      const valorExecAnterior = Number(contrato.valor_executado_anterior) || 0;
      const saldoDisponivel = valorContrato - valorExecAnterior - valorComprometido;
      if (valorMedido > saldoDisponivel + 0.01) {
        throw new BadRequestException(
          `O valor da medição (R$ ${valorMedido.toFixed(2)}) excede o saldo disponível do contrato (R$ ${saldoDisponivel.toFixed(2)}). ` +
          `Valor do contrato: R$ ${valorContrato.toFixed(2)}, já comprometido: R$ ${valorComprometido.toFixed(2)}${valorExecAnterior > 0 ? `, ajuste migração: R$ ${valorExecAnterior.toFixed(2)}` : ''}.`
        );
      }

      // Calcular percentual proporcional ao valor global
      const valorGlobal = Number(contrato.valor_global) || Number(contrato.valor_inicial) || 1;
      percentualFisicoMedido = (valorMedido / valorGlobal) * 100;
    } else if (await this.usarItensCronograma(contratoId)) {
      // Fluxo por itens do cronograma (quantidade medida)
      const itensPayload = (dados.itens || []) as Array<{ item_cronograma_id?: string; quantidade_medida?: number }>;
      const itensComItemCronograma = itensPayload.filter((i) => i.item_cronograma_id);

      if (itensComItemCronograma.length === 0) {
        throw new BadRequestException('Informe pelo menos um item com quantidade medida');
      }

      const quantidadeEmTransitoPorItem = await this.calcularQuantidadeComprometidaPorItem(contratoId);

      for (const item of itensComItemCronograma) {
        const itemCron = await this.itemCronogramaRepository.findOne({ where: { id: item.item_cronograma_id! } });
        if (!itemCron) throw new NotFoundException(`Item do cronograma ${item.item_cronograma_id} não encontrado`);

        const qtdMedida = Number(item.quantidade_medida) || 0;
        if (qtdMedida <= 0) continue;

        const quantidadeTotal = Number(itemCron.quantidade);
        const quantidadeAprovada = Number(itemCron.quantidade_medida) || 0;
        const quantidadeEmTransito = quantidadeEmTransitoPorItem.get(item.item_cronograma_id!) || 0;
        const saldoDisponivel = quantidadeTotal - quantidadeAprovada - quantidadeEmTransito;

        if (qtdMedida > saldoDisponivel + 0.0001) {
          throw new BadRequestException(
            `Item "${itemCron.descricao}": quantidade medida (${qtdMedida}) excede o saldo disponível (${saldoDisponivel.toFixed(2)}). ` +
            `Total: ${quantidadeTotal}, já aprovado: ${quantidadeAprovada}, em análise: ${quantidadeEmTransito}.`
          );
        }

        const valorUnitario = Number(itemCron.valor_unitario);
        const valorItem = qtdMedida * valorUnitario;
        valorMedido += valorItem;

        const valorTotalItem = Number(itemCron.valor_total) || 1;
        const percentualItem = (valorItem / valorTotalItem) * 100;
        percentualFisicoMedido += percentualItem;

        itensItemParaSalvar.push({
          item_cronograma_id: item.item_cronograma_id!,
          quantidade_medida: qtdMedida,
          valor_medido: valorItem,
        });
      }

      if (valorMedido <= 0) {
        throw new BadRequestException('A medição deve ter pelo menos um item com quantidade > 0');
      }
    } else {
      // Fluxo completo com etapas (obras/engenharia)
      const percentuaisEmTransito = await this.calcularPercentualComprometidoPorEtapa(contratoId);

      for (const item of (dados.itens || [])) {
        const itemEtapa = item as { etapa_id: string; percentual_executado_atual?: number; valor_executado_atual?: number };
        const etapa = await this.etapaRepository.findOne({ where: { id: itemEtapa.etapa_id } });
        if (!etapa) throw new NotFoundException(`Etapa ${itemEtapa.etapa_id} não encontrada`);

        let percentualExecAtual = itemEtapa.percentual_executado_atual || 0;
        if (!percentualExecAtual && itemEtapa.valor_executado_atual && Number(etapa.valor_previsto) > 0) {
          percentualExecAtual = (itemEtapa.valor_executado_atual / Number(etapa.valor_previsto)) * 100;
        }

        if (percentualExecAtual <= 0) continue;

        const percentualAprovado = Number(etapa.percentual_executado);
        const percentualEmTransito = percentuaisEmTransito.get(itemEtapa.etapa_id) || 0;
        const percentualAcumuladoComNovo = percentualAprovado + percentualEmTransito + percentualExecAtual;

        if (percentualAcumuladoComNovo > 100.01) {
          throw new BadRequestException(
            `Etapa "${etapa.descricao}": percentual acumulado (${percentualAcumuladoComNovo.toFixed(1)}%) excede 100%. ` +
            `Aprovado: ${percentualAprovado.toFixed(1)}%, em análise: ${percentualEmTransito.toFixed(1)}%, ` +
            `novo: ${percentualExecAtual.toFixed(1)}%.`
          );
        }

        const valorItem = (percentualExecAtual / 100) * Number(etapa.valor_previsto);
        valorMedido += valorItem;
        percentualFisicoMedido += (percentualExecAtual / 100) * Number(etapa.percentual_fisico);

        itensParaSalvar.push({
          etapa_id: itemEtapa.etapa_id,
          percentual_executado_anterior: percentualAprovado,
          percentual_executado_atual: percentualExecAtual,
          percentual_executado_acumulado: percentualAprovado + percentualExecAtual,
          valor_medido: valorItem,
        });
      }

      if (valorMedido <= 0) {
        throw new BadRequestException('A medição deve ter pelo menos um item com valor > 0');
      }
    }

    const medicao = this.medicaoRepository.create({
      contrato_id: contratoId,
      ordem_servico_id: osVinculada?.id || null,
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

    // Salvar itens da medição (obras)
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

    if (contrato) {
      const servicoContinuado = this.isServicoContinuado(contrato);

      // Validação por etapa (apenas para obras com etapas)
      if (!servicoContinuado) {
        const itensMedicao = await this.itemMedicaoRepository.find({
          where: { medicao_id: medicao.id },
        });
        const percentuaisEmTransito = await this.calcularPercentualComprometidoPorEtapa(
          medicao.contrato_id,
          medicao.id,
        );

        for (const itemMed of itensMedicao) {
          const etapa = await this.etapaRepository.findOne({ where: { id: itemMed.etapa_id } });
          if (!etapa) continue;

          const percentualAprovado = Number(etapa.percentual_executado);
          const percentualEmTransito = percentuaisEmTransito.get(itemMed.etapa_id) || 0;
          const percentualAtual = Number(itemMed.percentual_executado_atual);
          const totalAcumulado = percentualAprovado + percentualEmTransito + percentualAtual;

          if (totalAcumulado > 100.01) {
            throw new BadRequestException(
              `Não é possível submeter: a etapa "${etapa.descricao}" excede 100%. ` +
              `Aprovado: ${percentualAprovado.toFixed(1)}%, em análise: ${percentualEmTransito.toFixed(1)}%, ` +
              `esta medição: ${percentualAtual.toFixed(1)}%, total: ${totalAcumulado.toFixed(1)}%.`
            );
          }
        }
      }

      // Validação global de saldo (para todas as modalidades)
      const valorComprometido = await this.somarValorMedicoesComprometidas(medicao.contrato_id, medicao.id);
      const valorContrato = Number(contrato.valor_global) || Number(contrato.valor_inicial) || 0;
      const valorExecAnterior = Number(contrato.valor_executado_anterior) || 0;
      const saldoDisponivel = valorContrato - valorExecAnterior - valorComprometido;
      const valorMedicao = Number(medicao.valor_medido) || 0;

      if (valorMedicao > saldoDisponivel + 0.01) {
        throw new BadRequestException(
          `Não é possível submeter: o valor desta medição (R$ ${valorMedicao.toFixed(2)}) excede o saldo disponível do contrato (R$ ${saldoDisponivel.toFixed(2)}). ` +
          `Valor do contrato: R$ ${valorContrato.toFixed(2)}, já comprometido (aprovadas + em análise): R$ ${valorComprometido.toFixed(2)}${valorExecAnterior > 0 ? `, ajuste migração: R$ ${valorExecAnterior.toFixed(2)}` : ''}.`
        );
      }
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

    // Notificar usuários do órgão (fiscal e gestores)
    this.notificarSubmissaoMedicao(medicao, contrato).catch(e =>
      this.logger.error(`Erro ao enviar notificações de submissão: ${e.message}`),
    );

    return this.buscarMedicaoCompleta(medicaoId);
  }

  /**
   * Fornecedor atualiza os itens (percentuais/valores) de uma medição DEVOLVIDA.
   * Permite corrigir os itens pendentes de ateste antes de reenviar.
   */
  async atualizarItensMedicao(
    medicaoId: string,
    fornecedorId: string,
    dados: { itens: Array<{ item_id: string; percentual_executado_atual?: number; valor_executado_atual?: number }> },
  ): Promise<Medicao> {
    const medicao = await this.medicaoRepository.findOne({ where: { id: medicaoId }, relations: ['contrato'] });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    const contrato = medicao.contrato;
    if (contrato && contrato.fornecedor_id !== fornecedorId) {
      throw new ForbiddenException('Você não tem permissão para editar esta medição');
    }

    if (medicao.status !== StatusMedicao.DEVOLVIDA && medicao.status !== StatusMedicao.RASCUNHO) {
      throw new BadRequestException('Apenas medições devolvidas ou em rascunho podem ter itens alterados');
    }

    const todosItens = await this.itemMedicaoRepository.find({
      where: { medicao_id: medicaoId },
      relations: ['etapa'],
    });

    const percentuaisEmTransito = await this.calcularPercentualComprometidoPorEtapa(medicao.contrato_id, medicaoId);

    for (const upd of dados.itens) {
      const item = todosItens.find(i => i.id === upd.item_id);
      if (!item || !item.etapa) continue;

      const etapa = item.etapa;
      let percentualAtual = upd.percentual_executado_atual;
      if (percentualAtual === undefined && upd.valor_executado_atual !== undefined && Number(etapa.valor_previsto) > 0) {
        percentualAtual = (upd.valor_executado_atual / Number(etapa.valor_previsto)) * 100;
      }
      if (percentualAtual === undefined) continue;

      const percentualAnterior = Number(item.percentual_executado_anterior);
      const percentualEmTransito = percentuaisEmTransito.get(item.etapa_id) || 0;
      const percentualAprovado = Number(etapa.percentual_executado);
      const totalComNovo = percentualAprovado + percentualEmTransito + percentualAtual;
      if (totalComNovo > 100.01) {
        throw new BadRequestException(
          `Etapa "${etapa.descricao}": percentual acumulado (${totalComNovo.toFixed(1)}%) excede 100%`
        );
      }

      const percentualAcumulado = percentualAnterior + percentualAtual;
      const valorItem = (percentualAtual / 100) * Number(etapa.valor_previsto);

      item.percentual_executado_atual = percentualAtual;
      item.percentual_executado_acumulado = percentualAcumulado;
      item.valor_medido = valorItem;
      item.atestado = false;
      item.ateste_observacoes = null as any;
      item.ateste_fiscal_nome = null as any;
      item.ateste_data = null as any;
    }

    await this.itemMedicaoRepository.save(todosItens);

    let valorMedidoTotal = 0;
    let percentualFisicoTotal = 0;
    for (const item of todosItens) {
      const etapa = item.etapa;
      if (!etapa) continue;
      valorMedidoTotal += Number(item.valor_medido);
      percentualFisicoTotal += (Number(item.percentual_executado_atual) / 100) * Number(etapa.percentual_fisico);
    }

    const percentualAnterior = Number(medicao.percentual_fisico_medido) || 0;
    medicao.valor_medido = valorMedidoTotal;
    medicao.percentual_fisico_medido = percentualFisicoTotal;
    medicao.valor_acumulado_atual = Number(medicao.valor_acumulado_anterior) + valorMedidoTotal;
    medicao.percentual_fisico_acumulado = Number(medicao.percentual_fisico_acumulado) - percentualAnterior + percentualFisicoTotal;
    await this.medicaoRepository.save(medicao);

    this.logger.log(`Medição #${medicao.numero_medicao} itens atualizados pelo fornecedor ${fornecedorId}`);
    return this.buscarMedicaoCompleta(medicaoId);
  }

  // ============================================================================
  // MEDIÇÕES — Ateste do Fiscal (órgão)
  // ============================================================================

  /**
   * Fiscal do órgão faz o ateste técnico da medição (atalho: atesta TODOS os itens de uma vez).
   * Status: SUBMETIDA ou PARCIALMENTE_ATESTADA → AGUARDANDO_APROVACAO
   */
  async atestarMedicao(medicaoId: string, fiscalId: string, fiscalNome: string, dados?: {
    observacoes?: string;
    verificado_in_loco?: boolean;
  }): Promise<Medicao> {
    const medicao = await this.medicaoRepository.findOne({ where: { id: medicaoId } });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    if (medicao.status !== StatusMedicao.SUBMETIDA && medicao.status !== StatusMedicao.PARCIALMENTE_ATESTADA) {
      throw new BadRequestException('Apenas medições submetidas ou parcialmente atestadas podem receber ateste');
    }

    // Atestar todos os itens da medição
    const itens = await this.itemMedicaoRepository.find({ where: { medicao_id: medicaoId } });
    for (const item of itens) {
      if (!item.atestado) {
        item.atestado = true;
        item.ateste_fiscal_nome = fiscalNome;
        item.ateste_data = new Date() as any;
      }
    }
    if (itens.length > 0) {
      await this.itemMedicaoRepository.save(itens);
    }

    medicao.status = StatusMedicao.AGUARDANDO_APROVACAO;
    medicao.ateste_fiscal_id = fiscalId;
    medicao.ateste_fiscal_nome = fiscalNome;
    medicao.ateste_data = new Date() as any;
    medicao.ateste_observacoes = dados?.observacoes || null as any;
    medicao.ateste_verificado_in_loco = dados?.verificado_in_loco || false;

    await this.medicaoRepository.save(medicao);
    this.logger.log(`Medição #${medicao.numero_medicao} atestada (todos os itens) pelo fiscal ${fiscalNome}`);

    // Notificar gestores/aprovadores que há medição aguardando aprovação
    const contrato = await this.contratoRepository.findOne({ where: { id: medicao.contrato_id } });
    if (contrato) {
      this.notificarAtesteMedicao(medicao, contrato, fiscalNome).catch(e =>
        this.logger.error(`Erro ao enviar notificações de ateste: ${e.message}`),
      );
    }

    return this.buscarMedicaoCompleta(medicaoId);
  }

  /**
   * Fiscal do órgão faz o ateste PARCIAL — atesta itens específicos da medição.
   * Se todos os itens ficarem atestados → AGUARDANDO_APROVACAO
   * Se ainda faltam itens → PARCIALMENTE_ATESTADA
   */
  async atestarItensMedicao(medicaoId: string, fiscalId: string, fiscalNome: string, dados: {
    itens: Array<{ item_id: string; observacoes?: string }>;
    itens_cancelar_ateste?: string[]; // IDs dos itens cujo ateste deve ser cancelado (quando ainda não enviado para aprovação)
    observacoes_gerais?: string;
    verificado_in_loco?: boolean;
    motivo_devolucao?: string; // Quando ateste parcial: motivo para devolver ao fornecedor (obrigatório)
  }): Promise<Medicao> {
    const medicao = await this.medicaoRepository.findOne({ where: { id: medicaoId } });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    if (medicao.status !== StatusMedicao.SUBMETIDA && medicao.status !== StatusMedicao.PARCIALMENTE_ATESTADA) {
      throw new BadRequestException('Apenas medições submetidas ou parcialmente atestadas podem receber ateste');
    }

    const temItensAtestar = dados.itens && dados.itens.length > 0;
    const temItensCancelar = dados.itens_cancelar_ateste && dados.itens_cancelar_ateste.length > 0;
    if (!temItensAtestar && !temItensCancelar) {
      throw new BadRequestException('Selecione itens para atestar ou desmarque itens para cancelar o ateste');
    }

    // Buscar todos os itens da medição
    const todosItens = await this.itemMedicaoRepository.find({ where: { medicao_id: medicaoId } });

    // Cancelar atestes dos itens desmarcados pelo fiscal (quando ainda não enviado para aprovação)
    if (temItensCancelar) {
      for (const itemId of dados.itens_cancelar_ateste!) {
        const item = todosItens.find(i => i.id === itemId);
        if (item && item.atestado) {
          item.atestado = false;
          item.ateste_fiscal_nome = null as any;
          item.ateste_data = null as any;
          item.ateste_observacoes = null as any;
          this.logger.log(`Ateste do item ${itemId} cancelado pelo fiscal ${fiscalNome}`);
        }
      }
      await this.itemMedicaoRepository.save(todosItens);
    }

    // Atestar os itens selecionados
    const agora = new Date();
    for (const itemAteste of dados.itens || []) {
      const item = todosItens.find(i => i.id === itemAteste.item_id);
      if (!item) {
        this.logger.warn(`Item ${itemAteste.item_id} não encontrado na medição ${medicaoId}`);
        continue;
      }
      if (item.atestado) {
        continue; // Já atestado, pular
      }
      item.atestado = true;
      item.ateste_fiscal_nome = fiscalNome;
      item.ateste_data = agora as any;
      item.ateste_observacoes = itemAteste.observacoes || null as any;
    }

    await this.itemMedicaoRepository.save(todosItens);

    // Verificar se TODOS os itens estão atestados
    const todosAtestados = todosItens.every(i => i.atestado);

    if (todosAtestados) {
      // Ateste completo → enviar para aprovação
      medicao.status = StatusMedicao.AGUARDANDO_APROVACAO;
      medicao.ateste_fiscal_id = fiscalId;
      medicao.ateste_fiscal_nome = fiscalNome;
      medicao.ateste_data = agora as any;
      medicao.ateste_observacoes = dados.observacoes_gerais || null as any;
      medicao.ateste_verificado_in_loco = dados.verificado_in_loco || false;
      this.logger.log(`Medição #${medicao.numero_medicao} totalmente atestada (${todosItens.length} itens) pelo fiscal ${fiscalNome}`);
    } else {
      // Ateste parcial
      const motivoDevolucao = dados.motivo_devolucao?.trim();
      if (motivoDevolucao) {
        // Atestar itens selecionados e devolver em um único passo (agilidade do fiscal)
        medicao.status = StatusMedicao.DEVOLVIDA;
        medicao.motivo_devolucao = motivoDevolucao;
        medicao.data_devolucao = new Date() as any;
        medicao.ateste_fiscal_id = fiscalId;
        medicao.ateste_fiscal_nome = fiscalNome;
        const atestados = todosItens.filter(i => i.atestado).length;
        this.logger.log(`Medição #${medicao.numero_medicao} parcialmente atestada e devolvida (${atestados}/${todosItens.length} itens) pelo fiscal ${fiscalNome}`);
      } else {
        const atestados = todosItens.filter(i => i.atestado).length;
        medicao.status = atestados === 0 ? StatusMedicao.SUBMETIDA : StatusMedicao.PARCIALMENTE_ATESTADA;
        medicao.ateste_fiscal_id = fiscalId;
        medicao.ateste_fiscal_nome = fiscalNome;
        this.logger.log(`Medição #${medicao.numero_medicao} ${atestados === 0 ? 'atestes cancelados' : `parcialmente atestada (${atestados}/${todosItens.length} itens)`} pelo fiscal ${fiscalNome}`);
      }
    }

    await this.medicaoRepository.save(medicao);

    // Notificações baseadas no resultado do ateste
    const contrato = await this.contratoRepository.findOne({ where: { id: medicao.contrato_id } });
    if (contrato) {
      if (todosAtestados) {
        // Notificar gestores sobre medição pronta para aprovação
        this.notificarAtesteMedicao(medicao, contrato, fiscalNome).catch(e =>
          this.logger.error(`Erro ao enviar notificações de ateste completo: ${e.message}`),
        );
      } else {
        const motivoDevolucao = dados.motivo_devolucao?.trim();
        if (motivoDevolucao) {
          // Notificar fornecedor sobre devolução (itens não atestados)
          this.notificarDevolucaoMedicao(medicao, contrato, fiscalNome, motivoDevolucao).catch(e =>
            this.logger.error(`Erro ao enviar notificações de devolução: ${e.message}`),
          );
        } else if (todosItens.filter(i => i.atestado).length > 0) {
          // Notificar fornecedor sobre ateste parcial (sem devolução) — só se ainda houver itens atestados
          this.notificarAtesteParcialMedicao(medicao, contrato, fiscalNome).catch(e =>
            this.logger.error(`Erro ao enviar notificações de ateste parcial: ${e.message}`),
          );
        }
      }
    }

    return this.buscarMedicaoCompleta(medicaoId);
  }

  /**
   * Fiscal devolve a medição ao fornecedor para correção.
   * Status: SUBMETIDA ou PARCIALMENTE_ATESTADA → DEVOLVIDA
   */
  async devolverMedicao(medicaoId: string, fiscalId: string, fiscalNome: string, motivo: string): Promise<Medicao> {
    const medicao = await this.medicaoRepository.findOne({ where: { id: medicaoId } });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    if (medicao.status !== StatusMedicao.SUBMETIDA && medicao.status !== StatusMedicao.PARCIALMENTE_ATESTADA) {
      throw new BadRequestException('Apenas medições submetidas ou parcialmente atestadas podem ser devolvidas');
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

    // Notificar fornecedor sobre devolução
    const contrato = await this.contratoRepository.findOne({ where: { id: medicao.contrato_id } });
    if (contrato) {
      this.notificarDevolucaoMedicao(medicao, contrato, fiscalNome, motivo).catch(e =>
        this.logger.error(`Erro ao enviar notificações de devolução: ${e.message}`),
      );
    }

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

    const contrato = await this.contratoRepository.findOne({ where: { id: medicao.contrato_id } });
    const servicoContinuado = contrato ? this.isServicoContinuado(contrato) : false;

    // Atualizar etapas do cronograma (apenas para obras, serviços continuados não têm etapas)
    if (!servicoContinuado) {
      const itensMedicao = await this.itemMedicaoRepository.find({
        where: { medicao_id: medicaoId },
      });

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
    }
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

    // Notificar fiscal e fornecedor sobre aprovação
    if (contrato) {
      this.notificarAprovacaoMedicao(medicao, contrato, aprovadorNome).catch(e =>
        this.logger.error(`Erro ao enviar notificações de aprovação: ${e.message}`),
      );
    }

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

    // Notificar fiscal e fornecedor sobre rejeição
    const contrato = await this.contratoRepository.findOne({ where: { id: medicao.contrato_id } });
    if (contrato) {
      this.notificarRejeicaoMedicao(medicao, contrato, aprovadorNome, observacao).catch(e =>
        this.logger.error(`Erro ao enviar notificações de rejeição: ${e.message}`),
      );
    }

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
   * Lista medições pendentes de ateste do fiscal (SUBMETIDA + PARCIALMENTE_ATESTADA).
   * Retorna dados enriquecidos para o Painel de Medições (contrato, fornecedor, itens).
   */
  async listarPendentesAteste(orgaoId: string): Promise<any[]> {
    const medicoes = await this.medicaoRepository
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.contrato', 'c')
      .where('c.orgao_id = :orgaoId', { orgaoId })
      .andWhere('m.status IN (:...statuses)', { statuses: [StatusMedicao.SUBMETIDA, StatusMedicao.PARCIALMENTE_ATESTADA] })
      .orderBy('m.data_submissao', 'ASC')
      .getMany();

    // Mapa (contrato_id|mes_referencia) -> data_solicitacao mais recente
    const pares = medicoes.map(med => {
      const inicio = med.periodo_inicio instanceof Date ? med.periodo_inicio : new Date(med.periodo_inicio as any);
      const mesRef = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}`;
      return { contrato_id: med.contrato_id, mes_referencia: mesRef };
    });
    const contratoIds = [...new Set(pares.map(p => p.contrato_id))];
    const mesRefs = [...new Set(pares.map(p => p.mes_referencia))];
    const solicitacoes = contratoIds.length && mesRefs.length
      ? await this.mensagemSolicitacaoRepository
          .createQueryBuilder('msg')
          .select('msg.contrato_id', 'contrato_id')
          .addSelect('msg.mes_referencia', 'mes_referencia')
          .addSelect('MAX(msg.created_at)', 'created_at')
          .where('msg.orgao_id = :orgaoId', { orgaoId })
          .andWhere('msg.contrato_id IN (:...contratoIds)', { contratoIds })
          .andWhere('msg.mes_referencia IN (:...mesRefs)', { mesRefs })
          .groupBy('msg.contrato_id')
          .addGroupBy('msg.mes_referencia')
          .getRawMany()
      : [];
    const dataSolicitacaoMap = new Map<string, Date>();
    for (const s of solicitacoes) {
      const key = `${s.contrato_id}|${s.mes_referencia}`;
      const dt = s.created_at instanceof Date ? s.created_at : new Date(s.created_at);
      const existing = dataSolicitacaoMap.get(key);
      if (!existing || dt > existing) dataSolicitacaoMap.set(key, dt);
    }

    // Enriquecer com contagem de itens (total e atestados) e data_solicitacao
    const result = [];
    for (const med of medicoes) {
      const inicio = med.periodo_inicio instanceof Date ? med.periodo_inicio : new Date(med.periodo_inicio as any);
      const mesRef = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}`;
      const dataSolicitacao = dataSolicitacaoMap.get(`${med.contrato_id}|${mesRef}`) || null;

      const itens = await this.itemMedicaoRepository.find({ where: { medicao_id: med.id } });
      const contrato = (med as any).contrato;
      result.push({
        id: med.id,
        contrato_id: med.contrato_id,
        numero_medicao: med.numero_medicao,
        status: med.status,
        periodo_inicio: med.periodo_inicio,
        periodo_fim: med.periodo_fim,
        valor_medido: med.valor_medido,
        percentual_fisico_medido: med.percentual_fisico_medido,
        data_submissao: med.data_submissao,
        data_solicitacao: dataSolicitacao,
        fornecedor_nome: med.fornecedor_nome || contrato?.fornecedor_razao_social || contrato?.fornecedor_nome,
        nota_fiscal_numero: med.nota_fiscal_numero,
        numero_contrato: contrato?.numero_contrato,
        objeto_contrato: contrato?.objeto,
        fiscal_nome: contrato?.fiscal_nome,
        total_itens: itens.length,
        itens_atestados: itens.filter(i => i.atestado).length,
      });
    }

    return result;
  }

  /**
   * Lista medições atestadas pelo fiscal, pendentes de aprovação do gestor.
   * Retorna dados enriquecidos para o Painel de Medições.
   */
  async listarPendentesAprovacao(orgaoId: string): Promise<any[]> {
    const medicoes = await this.medicaoRepository
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.contrato', 'c')
      .leftJoinAndSelect('c.fornecedor', 'f')
      .where('c.orgao_id = :orgaoId', { orgaoId })
      .andWhere('m.status = :status', { status: StatusMedicao.AGUARDANDO_APROVACAO })
      .orderBy('m.ateste_data', 'ASC')
      .getMany();

    return medicoes.map(med => {
      const contrato = (med as any).contrato;
      return {
        id: med.id,
        contrato_id: med.contrato_id,
        numero_medicao: med.numero_medicao,
        status: med.status,
        periodo_inicio: med.periodo_inicio,
        periodo_fim: med.periodo_fim,
        valor_medido: med.valor_medido,
        percentual_fisico_medido: med.percentual_fisico_medido,
        ateste_fiscal_nome: med.ateste_fiscal_nome,
        ateste_data: med.ateste_data,
        fornecedor_nome: med.fornecedor_nome || contrato?.fornecedor_razao_social || contrato?.fornecedor_nome,
        numero_contrato: contrato?.numero_contrato,
        objeto_contrato: contrato?.objeto,
      };
    });
  }

  /**
   * Lista medições devolvidas ao fornecedor (status DEVOLVIDA).
   * Para controle do fiscal no Painel de Medições.
   */
  async listarDevolvidas(orgaoId: string): Promise<any[]> {
    const medicoes = await this.medicaoRepository
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.contrato', 'c')
      .where('c.orgao_id = :orgaoId', { orgaoId })
      .andWhere('m.status = :status', { status: StatusMedicao.DEVOLVIDA })
      .orderBy('m.data_devolucao', 'DESC')
      .getMany();

    return medicoes.map(med => {
      const contrato = (med as any).contrato;
      return {
        id: med.id,
        contrato_id: med.contrato_id,
        numero_medicao: med.numero_medicao,
        status: med.status,
        periodo_inicio: med.periodo_inicio,
        periodo_fim: med.periodo_fim,
        valor_medido: med.valor_medido,
        percentual_fisico_medido: med.percentual_fisico_medido,
        data_submissao: med.data_submissao,
        motivo_devolucao: med.motivo_devolucao,
        data_devolucao: med.data_devolucao,
        fornecedor_nome: med.fornecedor_nome || contrato?.fornecedor_razao_social || contrato?.fornecedor_nome,
        numero_contrato: contrato?.numero_contrato,
        objeto_contrato: contrato?.objeto,
      };
    });
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

    // Valor comprometido = aprovadas + em trânsito (submetidas, aguardando ateste/aprovação)
    const valorComprometido = await this.somarValorMedicoesComprometidas(contratoId);
    const valorEmAnalise = Math.max(0, valorComprometido - valorMedidoTotal);

    // Percentuais comprometidos POR ETAPA (em trânsito, para validação no frontend)
    const percentuaisEmTransito = await this.calcularPercentualComprometidoPorEtapa(contratoId);
    const etapasComprometidas: Record<string, number> = {};
    for (const [etapaId, perc] of percentuaisEmTransito.entries()) {
      etapasComprometidas[etapaId] = perc;
    }

    const pendentesAteste = medicoes.filter(m => m.status === StatusMedicao.SUBMETIDA).length;
    const pendentesAprovacao = medicoes.filter(m => m.status === StatusMedicao.AGUARDANDO_APROVACAO).length;

    const fluxoOs = await this.getFluxoOsEfetivo(contratoId);
    const osAtiva = await this.getOSAtiva(contratoId);
    const todasOS = await this.listarOS(contratoId);

    const valorGlobal = Number(contrato.valor_global);
    const valorExecAnterior = Number(contrato.valor_executado_anterior) || 0;

    const usarItens = await this.usarItensCronograma(contratoId);
    let itensComprometidos: Record<string, number> = {};
    if (usarItens) {
      const mapa = await this.calcularQuantidadeComprometidaPorItem(contratoId);
      mapa.forEach((qtd, itemId) => { itensComprometidos[itemId] = qtd; });
    }

    return {
      contrato_id: contratoId,
      fluxo_os: fluxoOs,
      valor_global: valorGlobal,
      valor_executado_anterior: valorExecAnterior,
      valor_medido_total: valorMedidoTotal,
      valor_comprometido_total: valorComprometido,
      valor_em_analise: valorEmAnalise,
      saldo_disponivel: Math.max(0, valorGlobal - valorExecAnterior - valorComprometido),
      percentual_fisico_total: Math.min(percentualFisicoTotal, 100),
      etapas_comprometidas: etapasComprometidas,
      itens_comprometidos: itensComprometidos,
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
  // RESUMO FISCAL — Painel do Fiscal
  // ============================================================================

  /**
   * Retorna contratos com modalidades que suportam medição do órgão,
   * com contagem de medições por status para o painel do fiscal.
   */
  async resumoFiscalPorContrato(orgaoId: string): Promise<any[]> {
    const contratos = await this.contratoRepository
      .createQueryBuilder('c')
      .where('c.orgao_id = :orgaoId', { orgaoId })
      .andWhere('c.modalidade_execucao IN (:...modalidades)', { modalidades: this.MODALIDADES_COM_MEDICAO })
      .orderBy('c.created_at', 'DESC')
      .getMany();

    const resultado = [];
    for (const contrato of contratos) {
      const medicoes = await this.medicaoRepository.find({
        where: { contrato_id: contrato.id },
      });

      const submetidas = medicoes.filter(m => m.status === StatusMedicao.SUBMETIDA).length;
      const parcialmenteAtestadas = medicoes.filter(m => m.status === StatusMedicao.PARCIALMENTE_ATESTADA).length;
      const aguardandoAprovacao = medicoes.filter(m => m.status === StatusMedicao.AGUARDANDO_APROVACAO).length;
      const aprovadas = medicoes.filter(m => m.status === StatusMedicao.APROVADA).length;
      const total = medicoes.length;

      resultado.push({
        id: contrato.id,
        numero_contrato: contrato.numero_contrato,
        objeto: contrato.objeto,
        modalidade_execucao: contrato.modalidade_execucao,
        fornecedor_nome: contrato.fornecedor_razao_social,
        fornecedor_cnpj: contrato.fornecedor_cnpj,
        valor_global: Number(contrato.valor_global),
        fiscal_nome: contrato.fiscal_nome,
        status: contrato.status,
        total_medicoes: total,
        submetidas,
        parcialmente_atestadas: parcialmenteAtestadas,
        aguardando_aprovacao: aguardandoAprovacao,
        aprovadas,
        pendentes_ateste: submetidas + parcialmenteAtestadas,
      });
    }

    return resultado;
  }

  /**
   * Resumo fiscal por contrato com indicador de "enviou medição no mês".
   * Mesmo retorno de resumoFiscalPorContrato + enviou_mes (e opcionalmente medicao_id/numero_medicao).
   * mesReferencia no formato YYYY-MM.
   * Inclui apenas contratos cuja vigência (data_vigencia_inicio a data_vigencia_fim) contém o mês selecionado.
   */
  async resumoFiscalPorContratoComMes(orgaoId: string, mesReferencia: string): Promise<any[]> {
    const [anoStr, mesStr] = mesReferencia.split('-');
    const ano = parseInt(anoStr || '0', 10);
    const mes = parseInt(mesStr || '0', 10);
    if (!ano || !mes || mes < 1 || mes > 12) {
      throw new BadRequestException('mes_referencia deve ser no formato YYYY-MM');
    }
    const primeiroDia = new Date(ano, mes - 1, 1);
    const ultimoDia = new Date(ano, mes, 0);

    // Contratos com solicitação enviada para este mês (para solicitou_mes)
    const solicitacoesMes = await this.mensagemSolicitacaoRepository.find({
      where: { orgao_id: orgaoId, mes_referencia: mesReferencia },
      select: ['contrato_id'],
    });
    const contratosSolicitados = new Set(solicitacoesMes.map(s => s.contrato_id));

    const contratos = await this.contratoRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.fornecedor', 'f')
      .where('c.orgao_id = :orgaoId', { orgaoId })
      .andWhere('c.modalidade_execucao IN (:...modalidades)', { modalidades: this.MODALIDADES_COM_MEDICAO })
      .orderBy('c.created_at', 'DESC')
      .getMany();

    const resultado = [];
    for (const contrato of contratos) {
      // Só incluir contratos cuja vigência contém o mês de referência
      const vigenciaInicio = contrato.data_vigencia_inicio instanceof Date
        ? contrato.data_vigencia_inicio
        : new Date(contrato.data_vigencia_inicio as any);
      const vigenciaFim = contrato.data_vigencia_fim instanceof Date
        ? contrato.data_vigencia_fim
        : new Date(contrato.data_vigencia_fim as any);
      if (vigenciaInicio > ultimoDia || vigenciaFim < primeiroDia) {
        continue; // mês fora da vigência do contrato
      }
      const medicoes = await this.medicaoRepository.find({
        where: { contrato_id: contrato.id },
      });

      const submetidas = medicoes.filter(m => m.status === StatusMedicao.SUBMETIDA).length;
      const parcialmenteAtestadas = medicoes.filter(m => m.status === StatusMedicao.PARCIALMENTE_ATESTADA).length;
      const aguardandoAprovacao = medicoes.filter(m => m.status === StatusMedicao.AGUARDANDO_APROVACAO).length;
      const aprovadas = medicoes.filter(m => m.status === StatusMedicao.APROVADA).length;
      const total = medicoes.length;

      let enviou_mes = false;
      let medicao_id: string | null = null;
      let numero_medicao: number | null = null;
      const numero_medicoes_mes: number[] = [];
      let valor_medicoes_mes = 0;

      for (const m of medicoes) {
        const inicio = m.periodo_inicio instanceof Date ? m.periodo_inicio : new Date(m.periodo_inicio as any);
        const fim = m.periodo_fim instanceof Date ? m.periodo_fim : new Date(m.periodo_fim as any);
        if (inicio <= ultimoDia && fim >= primeiroDia) {
          enviou_mes = true;
          if (!medicao_id) { medicao_id = m.id; numero_medicao = m.numero_medicao; }
          numero_medicoes_mes.push(m.numero_medicao);
          valor_medicoes_mes += Number(m.valor_medido) || 0;
        }
      }

      const fornecedor = (contrato as any).fornecedor;
      const fornecedor_telefone = fornecedor?.representante_telefone || fornecedor?.telefone || null;

      resultado.push({
        id: contrato.id,
        numero_contrato: contrato.numero_contrato,
        objeto: contrato.objeto,
        modalidade_execucao: contrato.modalidade_execucao,
        fornecedor_nome: contrato.fornecedor_razao_social,
        fornecedor_cnpj: contrato.fornecedor_cnpj,
        fornecedor_telefone,
        valor_global: Number(contrato.valor_global),
        fiscal_nome: contrato.fiscal_nome,
        status: contrato.status,
        total_medicoes: total,
        submetidas,
        parcialmente_atestadas: parcialmenteAtestadas,
        aguardando_aprovacao: aguardandoAprovacao,
        aprovadas,
        pendentes_ateste: submetidas + parcialmenteAtestadas,
        enviou_mes,
        solicitou_mes: contratosSolicitados.has(contrato.id),
        medicao_id,
        numero_medicao,
        numero_medicoes_mes,
        valor_medicoes_mes,
      });
    }

    return resultado;
  }

  /**
   * Dispara notificação ao fornecedor e persiste mensagem (histórico + caixa de entrada).
   * Chamado após o controller validar que o contrato pertence ao órgão e é MEDICAO.
   */
  async solicitarMedicao(
    contratoId: string,
    mesReferencia: string,
    fiscalNome: string,
    solicitadoPorId: string,
    mensagem?: string,
    enviarWhatsapp?: boolean,
    telefoneOverride?: string,
  ): Promise<{ message: string; whatsapp_tentado?: boolean; whatsapp_telefone?: string | null }> {
    const contrato = await this.contratoRepository.findOne({ where: { id: contratoId } });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    if (!this.MODALIDADES_COM_MEDICAO.includes(contrato.modalidade_execucao)) {
      throw new BadRequestException('Contrato não suporta medições');
    }

    const destinatarios = await this.getFornecedorDestinatario(contrato);
    if (destinatarios.length === 0) {
      throw new BadRequestException('Contrato sem fornecedor vinculado para notificação');
    }

    const [ano, mes] = mesReferencia.split('-');
    const mesAnoLabel = mes && ano ? `${mes}/${ano}` : mesReferencia;
    const textoPadrao = `Solicitamos o envio da medição referente a ${mesAnoLabel}.`;
    const mensagemCompleta = mensagem?.trim()
      ? `${textoPadrao}\n\nMensagem do fiscal: ${mensagem.trim()}`
      : textoPadrao;
    const titulo = `Solicitação de medição – ${contrato.numero_contrato}`;

    // Persistir mensagem (histórico órgão + caixa de entrada fornecedor)
    const msg = this.mensagemSolicitacaoRepository.create({
      contrato_id: contratoId,
      orgao_id: contrato.orgao_id,
      fornecedor_id: contrato.fornecedor_id,
      mes_referencia: mesReferencia,
      titulo,
      mensagem: mensagemCompleta,
      solicitado_por: solicitadoPorId,
      solicitado_por_nome: fiscalNome,
    });
    await this.mensagemSolicitacaoRepository.save(msg);

    const destinatariosComOverride = telefoneOverride?.trim()
      ? destinatarios.map(d => ({ ...d, telefone: telefoneOverride.trim() }))
      : destinatarios;

    const telefoneWhatsapp = destinatariosComOverride[0]?.telefone || null;

    await this.notificacoesService.notificarSolicitacaoMedicao(
      contrato.orgao_id,
      contrato.numero_contrato,
      contrato.id,
      mesReferencia,
      fiscalNome,
      mensagem?.trim() || undefined,
      destinatariosComOverride,
      enviarWhatsapp,
      undefined,
      contrato.fornecedor_razao_social,
    );

    this.logger.log(`Solicitação de medição enviada: contrato ${contrato.numero_contrato}, mês ${mesReferencia}`);
    return {
      message: 'Solicitação enviada ao fornecedor com sucesso',
      whatsapp_tentado: !!enviarWhatsapp,
      whatsapp_telefone: enviarWhatsapp ? telefoneWhatsapp : null,
    };
  }

  /**
   * Lista histórico de solicitações enviadas pelo órgão (para o painel do fiscal).
   */
  async listarSolicitacoesEnviadas(orgaoId: string, contratoId?: string): Promise<any[]> {
    const qb = this.mensagemSolicitacaoRepository
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.contrato', 'c')
      .where('m.orgao_id = :orgaoId', { orgaoId })
      .orderBy('m.created_at', 'DESC');

    if (contratoId) {
      qb.andWhere('m.contrato_id = :contratoId', { contratoId });
    }

    const list = await qb.getMany();
    return list.map((m) => ({
      id: m.id,
      contrato_id: m.contrato_id,
      numero_contrato: (m as any).contrato?.numero_contrato,
      fornecedor_nome: (m as any).contrato?.fornecedor_razao_social,
      mes_referencia: m.mes_referencia,
      titulo: m.titulo,
      mensagem: m.mensagem,
      solicitado_por_nome: m.solicitado_por_nome,
      created_at: m.created_at instanceof Date ? m.created_at.toISOString() : m.created_at,
      lida: m.lida,
      lida_em: m.lida_em,
    }));
  }

  /**
   * Lista mensagens de solicitação de medição recebidas pelo fornecedor (caixa de entrada).
   */
  async listarMensagensRecebidas(fornecedorId: string): Promise<any[]> {
    const mensagens = await this.mensagemSolicitacaoRepository.find({
      where: { fornecedor_id: fornecedorId },
      relations: ['contrato', 'contrato.orgao'],
      order: { created_at: 'DESC' },
    });
    return mensagens.map((m) => ({
      id: m.id,
      contrato_id: m.contrato_id,
      numero_contrato: (m as any).contrato?.numero_contrato,
      orgao_nome: (m as any).contrato?.orgao?.nome,
      mes_referencia: m.mes_referencia,
      titulo: m.titulo,
      mensagem: m.mensagem,
      solicitado_por_nome: m.solicitado_por_nome,
      created_at: m.created_at instanceof Date ? m.created_at.toISOString() : m.created_at,
      lida: m.lida,
      lida_em: m.lida_em,
    }));
  }

  /**
   * Busca uma mensagem e marca como lida (para o fornecedor).
   */
  async buscarMensagemEMarcarComoLida(mensagemId: string, fornecedorId: string): Promise<any> {
    const m = await this.mensagemSolicitacaoRepository.findOne({
      where: { id: mensagemId },
      relations: ['contrato', 'contrato.orgao'],
    });
    if (!m) throw new NotFoundException('Mensagem não encontrada');
    if (m.fornecedor_id !== fornecedorId) {
      throw new ForbiddenException('Você não tem acesso a esta mensagem');
    }
    if (!m.lida) {
      m.lida = true;
      m.lida_em = new Date();
      await this.mensagemSolicitacaoRepository.save(m);
    }
    return {
      id: m.id,
      contrato_id: m.contrato_id,
      numero_contrato: m.contrato?.numero_contrato,
      orgao_nome: (m.contrato as any)?.orgao?.nome,
      mes_referencia: m.mes_referencia,
      titulo: m.titulo,
      mensagem: m.mensagem,
      solicitado_por_nome: m.solicitado_por_nome,
      created_at: m.created_at,
      lida: m.lida,
      lida_em: m.lida_em,
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Soma valor_medido de todas as medições que "comprometem" o saldo do contrato.
   * Inclui: SUBMETIDA, AGUARDANDO_ATESTE, PARCIALMENTE_ATESTADA, AGUARDANDO_APROVACAO, APROVADA.
   * Exclui: RASCUNHO, DEVOLVIDA, REJEITADA (essas não comprometem saldo).
   * Se excludeMedicaoId for informado, exclui essa medição (para validar resubmissão).
   */
  private async somarValorMedicoesComprometidas(contratoId: string, excludeMedicaoId?: string): Promise<number> {
    const statusComprometidos = [
      StatusMedicao.SUBMETIDA,
      StatusMedicao.AGUARDANDO_ATESTE,
      StatusMedicao.PARCIALMENTE_ATESTADA,
      StatusMedicao.AGUARDANDO_APROVACAO,
      StatusMedicao.APROVADA,
    ];

    const qb = this.medicaoRepository
      .createQueryBuilder('m')
      .select('COALESCE(SUM(m.valor_medido), 0)', 'total')
      .where('m.contrato_id = :contratoId', { contratoId })
      .andWhere('m.status IN (:...status)', { status: statusComprometidos });

    if (excludeMedicaoId) {
      qb.andWhere('m.id != :excludeId', { excludeId: excludeMedicaoId });
    }

    const result = await qb.getRawOne<{ total: string }>();
    return Number(result?.total ?? 0);
  }

  /**
   * Calcula o percentual comprometido POR ETAPA, considerando medições em trânsito.
   * Retorna um Map<etapa_id, percentual_comprometido_em_transito>.
   * Isso é necessário porque etapa.percentual_executado só reflete medições APROVADAS.
   * Se excludeMedicaoId for informado, exclui essa medição (para validar resubmissão).
   */
  private async calcularPercentualComprometidoPorEtapa(
    contratoId: string,
    excludeMedicaoId?: string,
  ): Promise<Map<string, number>> {
    const statusEmTransito = [
      StatusMedicao.SUBMETIDA,
      StatusMedicao.AGUARDANDO_ATESTE,
      StatusMedicao.PARCIALMENTE_ATESTADA,
      StatusMedicao.AGUARDANDO_APROVACAO,
    ];

    const qb = this.itemMedicaoRepository
      .createQueryBuilder('im')
      .select('im.etapa_id', 'etapa_id')
      .addSelect('COALESCE(SUM(im.percentual_executado_atual), 0)', 'total_percentual')
      .innerJoin('im.medicao', 'm')
      .where('m.contrato_id = :contratoId', { contratoId })
      .andWhere('m.status IN (:...status)', { status: statusEmTransito })
      .groupBy('im.etapa_id');

    if (excludeMedicaoId) {
      qb.andWhere('m.id != :excludeId', { excludeId: excludeMedicaoId });
    }

    const results = await qb.getRawMany<{ etapa_id: string; total_percentual: string }>();

    const mapa = new Map<string, number>();
    for (const row of results) {
      mapa.set(row.etapa_id, Number(row.total_percentual));
    }
    return mapa;
  }

  /** Quantidade comprometida por item do cronograma (medições em trânsito) */
  private async calcularQuantidadeComprometidaPorItem(
    contratoId: string,
    excludeMedicaoId?: string,
  ): Promise<Map<string, number>> {
    const statusEmTransito = [
      StatusMedicao.SUBMETIDA,
      StatusMedicao.AGUARDANDO_ATESTE,
      StatusMedicao.PARCIALMENTE_ATESTADA,
      StatusMedicao.AGUARDANDO_APROVACAO,
    ];

    const qb = this.itemMedicaoItemRepository
      .createQueryBuilder('imi')
      .select('imi.item_cronograma_id', 'item_cronograma_id')
      .addSelect('COALESCE(SUM(imi.quantidade_medida), 0)', 'total_quantidade')
      .innerJoin('imi.medicao', 'm')
      .where('m.contrato_id = :contratoId', { contratoId })
      .andWhere('m.status IN (:...status)', { status: statusEmTransito })
      .groupBy('imi.item_cronograma_id');

    if (excludeMedicaoId) {
      qb.andWhere('m.id != :excludeId', { excludeId: excludeMedicaoId });
    }

    const results = await qb.getRawMany<{ item_cronograma_id: string; total_quantidade: string }>();

    const mapa = new Map<string, number>();
    for (const row of results) {
      mapa.set(row.item_cronograma_id, Number(row.total_quantidade));
    }
    return mapa;
  }

  private readonly MODALIDADES_COM_MEDICAO = [
    ModalidadeExecucao.MEDICAO,
    ModalidadeExecucao.CONTINUADO,
    ModalidadeExecucao.LICENCA,
  ];

  isServicoContinuado(contrato: Contrato): boolean {
    return [ModalidadeExecucao.CONTINUADO, ModalidadeExecucao.LICENCA].includes(contrato.modalidade_execucao);
  }

  private async validarContratoMedicao(contratoId: string): Promise<Contrato> {
    const contrato = await this.contratoRepository.findOne({ where: { id: contratoId } });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');

    if (!this.MODALIDADES_COM_MEDICAO.includes(contrato.modalidade_execucao)) {
      throw new BadRequestException(
        `Contrato ${contrato.numero_contrato} não suporta medições (modalidade: ${contrato.modalidade_execucao})`
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

  // ============================================================================
  // HELPERS — Notificações de Medição
  // ============================================================================

  /**
   * Busca usuários do órgão para enviar notificações.
   * Retorna todos os usuários ativos do órgão.
   */
  private async buscarUsuariosOrgao(orgaoId: string): Promise<{ id: string; email?: string; telefone?: string }[]> {
    try {
      const usuarios = await this.usuarioRepository.find({
        where: { orgao_id: orgaoId, ativo: true },
        select: ['id', 'email', 'telefone'],
      });
      return usuarios.map(u => ({ id: u.id, email: u.email, telefone: u.telefone }));
    } catch (e) {
      this.logger.warn(`Não foi possível buscar usuários do órgão ${orgaoId}: ${(e as any).message}`);
      return [];
    }
  }

  /**
   * Busca o fornecedor (user login) para enviar notificações.
   * Usa o fornecedor_id do contrato como usuario_id (pois fornecedores logam com seu ID).
   */
  private async getFornecedorDestinatario(contrato: Contrato): Promise<{ id: string; email?: string; telefone?: string }[]> {
    if (!contrato.fornecedor_id) return [];
    const fornecedor = await this.fornecedorRepository.findOne({
      where: { id: contrato.fornecedor_id },
      select: ['id', 'email', 'representante_telefone', 'telefone'],
    });
    if (!fornecedor) return [{ id: contrato.fornecedor_id }];
    const telefone = fornecedor.representante_telefone || fornecedor.telefone;
    return [{ id: fornecedor.id, email: fornecedor.email, telefone: telefone || undefined }];
  }

  private async notificarSubmissaoMedicao(medicao: Medicao, contrato: Contrato | null): Promise<void> {
    if (!contrato) return;
    const destinatarios = await this.buscarUsuariosOrgao(contrato.orgao_id);
    if (destinatarios.length === 0) return;

    await this.notificacoesService.notificarMedicaoSubmetida(
      contrato.orgao_id,
      medicao.numero_medicao,
      medicao.id,
      contrato.numero_contrato,
      contrato.id,
      contrato.fornecedor_razao_social || 'Fornecedor',
      Number(medicao.valor_medido),
      destinatarios,
    );
  }

  private async notificarAtesteMedicao(medicao: Medicao, contrato: Contrato, fiscalNome: string): Promise<void> {
    // Notificar gestores/aprovadores do órgão
    const destinatarios = await this.buscarUsuariosOrgao(contrato.orgao_id);
    if (destinatarios.length === 0) return;

    await this.notificacoesService.notificarMedicaoAtestada(
      contrato.orgao_id,
      medicao.numero_medicao,
      medicao.id,
      contrato.numero_contrato,
      contrato.id,
      fiscalNome,
      Number(medicao.valor_medido),
      destinatarios,
    );
  }

  private async notificarAtesteParcialMedicao(medicao: Medicao, contrato: Contrato, fiscalNome: string): Promise<void> {
    // Notificar fornecedor sobre ateste parcial (itens devolvidos)
    const fornecedorDest = await this.getFornecedorDestinatario(contrato);
    if (fornecedorDest.length === 0) return;

    await this.notificacoesService.notificarMedicaoParcialmenteAtestada(
      contrato.orgao_id,
      medicao.numero_medicao,
      medicao.id,
      contrato.numero_contrato,
      contrato.id,
      fiscalNome,
      fornecedorDest,
    );
  }

  private async notificarAprovacaoMedicao(medicao: Medicao, contrato: Contrato, aprovadorNome: string): Promise<void> {
    const orgaoDestinatarios = await this.buscarUsuariosOrgao(contrato.orgao_id);
    const fornecedorDest = await this.getFornecedorDestinatario(contrato);
    if (orgaoDestinatarios.length === 0 && fornecedorDest.length === 0) return;

    await this.notificacoesService.notificarMedicaoAprovada(
      contrato.orgao_id,
      medicao.numero_medicao,
      medicao.id,
      contrato.numero_contrato,
      contrato.id,
      aprovadorNome,
      Number(medicao.valor_medido),
      orgaoDestinatarios,
      fornecedorDest,
    );
  }

  private async notificarRejeicaoMedicao(medicao: Medicao, contrato: Contrato, aprovadorNome: string, observacao: string): Promise<void> {
    const orgaoDestinatarios = await this.buscarUsuariosOrgao(contrato.orgao_id);
    const fornecedorDest = await this.getFornecedorDestinatario(contrato);
    if (orgaoDestinatarios.length === 0 && fornecedorDest.length === 0) return;

    await this.notificacoesService.notificarMedicaoRejeitada(
      contrato.orgao_id,
      medicao.numero_medicao,
      medicao.id,
      contrato.numero_contrato,
      contrato.id,
      aprovadorNome,
      observacao,
      orgaoDestinatarios,
      fornecedorDest,
    );
  }

  private async notificarDevolucaoMedicao(medicao: Medicao, contrato: Contrato, fiscalNome: string, motivo: string): Promise<void> {
    const fornecedorDest = await this.getFornecedorDestinatario(contrato);
    if (fornecedorDest.length === 0) return;

    await this.notificacoesService.notificarMedicaoDevolvida(
      contrato.orgao_id,
      medicao.numero_medicao,
      medicao.id,
      contrato.numero_contrato,
      contrato.id,
      fiscalNome,
      motivo,
      fornecedorDest,
    );
  }

  // ============================================================================
  // DISCRIMINAÇÃO DE DESPESAS DA MEDIÇÃO
  // ============================================================================

  /**
   * Salva (substitui) as discriminações de despesa de uma medição.
   * O fornecedor envia um array; o sistema faz delete+insert em transação.
   * Valida: propriedade da medição, status RASCUNHO ou DEVOLVIDA.
   */
  async salvarDiscriminacoes(
    medicaoId: string,
    fornecedorId: string,
    itens: { descricao: string; valor: number; percentual: number }[],
  ): Promise<DiscriminacaoDespesaMedicao[]> {
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
      relations: ['contrato'],
    });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    // Verificar propriedade
    if (medicao.contrato && medicao.contrato.fornecedor_id !== fornecedorId) {
      throw new ForbiddenException('Você não tem permissão para alterar esta medição');
    }

    // Verificar status
    if (medicao.status !== StatusMedicao.RASCUNHO && medicao.status !== StatusMedicao.DEVOLVIDA) {
      throw new BadRequestException('Discriminações só podem ser alteradas em medições em rascunho ou devolvidas');
    }

    // Deletar anteriores
    await this.discriminacaoRepository.delete({ medicao_id: medicaoId });

    // Inserir novas
    const novas: DiscriminacaoDespesaMedicao[] = [];
    for (let i = 0; i < itens.length; i++) {
      const item = itens[i];
      if (!item.descricao || item.descricao.trim() === '') continue;
      const disc = this.discriminacaoRepository.create({
        medicao_id: medicaoId,
        numero_item: i + 1,
        descricao: item.descricao.trim(),
        valor: Number(item.valor) || 0,
        percentual: Number(item.percentual) || 0,
      });
      novas.push(await this.discriminacaoRepository.save(disc));
    }

    this.logger.log(`Discriminações salvas para medição ${medicaoId}: ${novas.length} itens`);
    return novas;
  }

  /**
   * Lista discriminações de despesa de uma medição.
   */
  async listarDiscriminacoes(medicaoId: string): Promise<DiscriminacaoDespesaMedicao[]> {
    return this.discriminacaoRepository.find({
      where: { medicao_id: medicaoId },
      order: { numero_item: 'ASC' },
    });
  }

  /**
   * Retorna as discriminações da última medição do mesmo contrato (independente do status),
   * para pré-preencher o formulário do fornecedor (sugestão).
   */
  async sugerirDiscriminacoes(contratoId: string): Promise<{ descricao: string; valor: number; percentual: number }[]> {
    // Buscar última medição do contrato (qualquer status)
    const ultimaMedicao = await this.medicaoRepository.findOne({
      where: { contrato_id: contratoId },
      order: { numero_medicao: 'DESC' },
    });

    if (!ultimaMedicao) return [];

    const discriminacoes = await this.discriminacaoRepository.find({
      where: { medicao_id: ultimaMedicao.id },
      order: { numero_item: 'ASC' },
    });

    // Retorna apenas os campos necessários (sem IDs) para sugestão
    return discriminacoes.map(d => ({
      descricao: d.descricao,
      valor: Number(d.valor),
      percentual: Number(d.percentual),
    }));
  }

  /**
   * Fiscal corrige um item de discriminação.
   * Registra quem corrigiu e notifica o fornecedor.
   */
  async corrigirDiscriminacao(
    medicaoId: string,
    discriminacaoId: string,
    dados: { descricao?: string; valor?: number; percentual?: number; motivo_correcao: string },
    fiscalId: string,
    fiscalNome: string,
    orgaoId: string,
  ): Promise<DiscriminacaoDespesaMedicao> {
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
      relations: ['contrato'],
    });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    // Validar que o contrato pertence ao órgão
    if (medicao.contrato && medicao.contrato.orgao_id !== orgaoId) {
      throw new ForbiddenException('Você não tem permissão para corrigir esta medição');
    }

    const disc = await this.discriminacaoRepository.findOne({
      where: { id: discriminacaoId, medicao_id: medicaoId },
    });
    if (!disc) throw new NotFoundException('Discriminação não encontrada');

    if (!dados.motivo_correcao || !dados.motivo_correcao.trim()) {
      throw new BadRequestException('Motivo da correção é obrigatório');
    }

    // Aplicar correções
    if (dados.descricao !== undefined) disc.descricao = dados.descricao.trim();
    if (dados.valor !== undefined) disc.valor = Number(dados.valor);
    if (dados.percentual !== undefined) disc.percentual = Number(dados.percentual);
    disc.corrigido_por_id = fiscalId;
    disc.corrigido_por_nome = fiscalNome;
    disc.corrigido_em = new Date();
    disc.motivo_correcao = dados.motivo_correcao.trim();

    await this.discriminacaoRepository.save(disc);

    // Notificar fornecedor
    this.notificarCorrecaoDiscriminacao(medicao, fiscalNome, dados.motivo_correcao).catch(e =>
      this.logger.error(`Erro ao notificar correção de discriminação: ${e.message}`),
    );

    this.logger.log(`Discriminação ${discriminacaoId} corrigida por ${fiscalNome} na medição ${medicaoId}`);
    return disc;
  }

  /**
   * Fiscal substitui todas as discriminações de uma medição (correção em massa).
   */
  async corrigirTodasDiscriminacoes(
    medicaoId: string,
    itens: { descricao: string; valor: number; percentual: number }[],
    motivo_correcao: string,
    fiscalId: string,
    fiscalNome: string,
    orgaoId: string,
  ): Promise<DiscriminacaoDespesaMedicao[]> {
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
      relations: ['contrato'],
    });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    if (medicao.contrato && medicao.contrato.orgao_id !== orgaoId) {
      throw new ForbiddenException('Você não tem permissão para corrigir esta medição');
    }

    if (!motivo_correcao || !motivo_correcao.trim()) {
      throw new BadRequestException('Motivo da correção é obrigatório');
    }

    // Deletar anteriores
    await this.discriminacaoRepository.delete({ medicao_id: medicaoId });

    // Inserir novas com registro de correção
    const novas: DiscriminacaoDespesaMedicao[] = [];
    for (let i = 0; i < itens.length; i++) {
      const item = itens[i];
      if (!item.descricao || item.descricao.trim() === '') continue;
      const disc = this.discriminacaoRepository.create({
        medicao_id: medicaoId,
        numero_item: i + 1,
        descricao: item.descricao.trim(),
        valor: Number(item.valor) || 0,
        percentual: Number(item.percentual) || 0,
        corrigido_por_id: fiscalId,
        corrigido_por_nome: fiscalNome,
        corrigido_em: new Date(),
        motivo_correcao: motivo_correcao.trim(),
      });
      novas.push(await this.discriminacaoRepository.save(disc));
    }

    // Notificar fornecedor
    this.notificarCorrecaoDiscriminacao(medicao, fiscalNome, motivo_correcao).catch(e =>
      this.logger.error(`Erro ao notificar correção de discriminação: ${e.message}`),
    );

    this.logger.log(`Todas discriminações corrigidas por ${fiscalNome} na medição ${medicaoId}: ${novas.length} itens`);
    return novas;
  }

  /**
   * Notifica o fornecedor quando o fiscal corrige uma discriminação.
   */
  private async notificarCorrecaoDiscriminacao(medicao: Medicao, fiscalNome: string, motivo: string): Promise<void> {
    const contrato = medicao.contrato || await this.contratoRepository.findOne({ where: { id: medicao.contrato_id } });
    if (!contrato) return;

    const fornecedorDest = await this.getFornecedorDestinatario(contrato);
    if (fornecedorDest.length === 0) return;

    try {
      await this.notificacoesService.criarParaMultiplos(fornecedorDest, {
        orgao_id: contrato.orgao_id,
        tipo: TipoNotificacao.CORRECAO_DISCRIMINACAO_MEDICAO,
        titulo: `Correção na discriminação – Medição #${medicao.numero_medicao}`,
        mensagem: `O fiscal ${fiscalNome} realizou uma correção na discriminação de despesas da medição #${medicao.numero_medicao} do contrato ${contrato.numero_contrato}. Motivo: ${motivo}`,
        prioridade: PrioridadeNotificacao.NORMAL,
        entidade_tipo: 'medicao',
        entidade_id: medicao.id,
        link: `/fornecedor/contratos/${contrato.id}`,
        metadata: {
          medicao_numero: medicao.numero_medicao,
          contrato_numero: contrato.numero_contrato,
          fiscal: fiscalNome,
          motivo_correcao: motivo,
        },
      });
    } catch (error) {
      this.logger.error(`Erro ao criar notificação de correção discriminação: ${(error as Error).message}`);
    }
  }

  // ============================================================================
  // EXECUÇÃO FISCAL/FINANCEIRA (auto-calculada)
  // ============================================================================

  /**
   * Calcula o resumo de execução fiscal/financeira por item contratado (EtapaCronograma).
   * Para cada etapa/item:
   *   - no_periodo: valor medido na medição informada (ou na medição mais recente)
   *   - ate_periodo: soma de todas medições aprovadas anteriores
   *   - a_executar: valor_previsto - ate_periodo - no_periodo
   *   - execução temporal baseada nas datas de vigência do contrato
   */
  async calcularExecucaoFinanceira(contratoId: string, orgaoId: string, medicaoId?: string): Promise<any> {
    const contrato = await this.contratoRepository.findOne({ where: { id: contratoId } });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');

    if (contrato.orgao_id !== orgaoId) {
      throw new ForbiddenException('Você não tem acesso a este contrato');
    }

    const etapas = await this.etapaRepository.find({
      where: { contrato_id: contratoId },
      order: { numero_etapa: 'ASC' },
    });

    // Buscar todas as medições aprovadas
    const medicoesAprovadas = await this.medicaoRepository.find({
      where: { contrato_id: contratoId, status: StatusMedicao.APROVADA },
      order: { numero_medicao: 'ASC' },
    });

    // Buscar a medição atual (se informada)
    let medicaoAtual: Medicao | null = null;
    if (medicaoId) {
      medicaoAtual = await this.medicaoRepository.findOne({ where: { id: medicaoId } });
    }

    // Buscar itens de cada medição aprovada
    const itensPorMedicao: Record<string, ItemMedicao[]> = {};
    for (const m of medicoesAprovadas) {
      itensPorMedicao[m.id] = await this.itemMedicaoRepository.find({
        where: { medicao_id: m.id },
      });
    }

    // Se temos uma medição atual não aprovada, buscar itens dela
    let itensMedicaoAtual: ItemMedicao[] = [];
    if (medicaoAtual && medicaoAtual.status !== StatusMedicao.APROVADA) {
      itensMedicaoAtual = await this.itemMedicaoRepository.find({
        where: { medicao_id: medicaoAtual.id },
      });
    }

    // Calcular execução por etapa
    const resultado = etapas.map(etapa => {
      const valorPrevisto = Number(etapa.valor_previsto) || 0;

      // Somar valores aprovados para esta etapa
      let atePeríodo = 0;
      for (const m of medicoesAprovadas) {
        // Se a medição atual é aprovada, tratar no_periodo separado
        if (medicaoAtual && m.id === medicaoAtual.id) continue;
        const itensM = itensPorMedicao[m.id] || [];
        const itemEtapa = itensM.find(i => i.etapa_id === etapa.id);
        if (itemEtapa) {
          atePeríodo += Number(itemEtapa.valor_medido) || 0;
        }
      }

      // Valor no período (medição atual)
      let noPeriodo = 0;
      if (medicaoAtual) {
        if (medicaoAtual.status === StatusMedicao.APROVADA) {
          // Se aprovada, buscar dos itens aprovados
          const itensM = itensPorMedicao[medicaoAtual.id] || [];
          const itemEtapa = itensM.find(i => i.etapa_id === etapa.id);
          if (itemEtapa) {
            noPeriodo = Number(itemEtapa.valor_medido) || 0;
          }
        } else {
          // Se não aprovada, buscar dos itens da medição atual
          const itemEtapa = itensMedicaoAtual.find(i => i.etapa_id === etapa.id);
          if (itemEtapa) {
            noPeriodo = Number(itemEtapa.valor_medido) || 0;
          }
        }
      }

      const aExecutar = Math.max(0, valorPrevisto - atePeríodo - noPeriodo);

      return {
        etapa_id: etapa.id,
        numero_etapa: etapa.numero_etapa,
        descricao: etapa.descricao,
        valor_previsto: valorPrevisto,
        percentual_fisico: Number(etapa.percentual_fisico) || 0,
        // Execução financeira
        no_periodo: Math.round(noPeriodo * 100) / 100,
        ate_periodo: Math.round(atePeríodo * 100) / 100,
        a_executar: Math.round(aExecutar * 100) / 100,
      };
    });

    // Calcular execução temporal (fiscal)
    const vigenciaInicio = contrato.data_vigencia_inicio
      ? new Date(contrato.data_vigencia_inicio as any)
      : null;
    const vigenciaFim = contrato.data_vigencia_fim
      ? new Date(contrato.data_vigencia_fim as any)
      : null;

    let execucaoFiscal: any = null;
    if (vigenciaInicio && vigenciaFim) {
      const hoje = new Date();
      const totalDias = Math.max(1, Math.ceil((vigenciaFim.getTime() - vigenciaInicio.getTime()) / (1000 * 60 * 60 * 24)));
      const diasExecutados = Math.max(0, Math.ceil((Math.min(hoje.getTime(), vigenciaFim.getTime()) - vigenciaInicio.getTime()) / (1000 * 60 * 60 * 24)));
      const diasRestantes = Math.max(0, totalDias - diasExecutados);

      execucaoFiscal = {
        vigencia_inicio: vigenciaInicio.toISOString().split('T')[0],
        vigencia_fim: vigenciaFim.toISOString().split('T')[0],
        total_dias: totalDias,
        dias_executados: diasExecutados,
        dias_restantes: diasRestantes,
        meses_executados: Math.floor(diasExecutados / 30),
        dias_executados_extra: diasExecutados % 30,
        meses_restantes: Math.floor(diasRestantes / 30),
        dias_restantes_extra: diasRestantes % 30,
      };
    }

    // Totais
    const totalNoPeriodo = resultado.reduce((s, r) => s + r.no_periodo, 0);
    const totalAtePeriodo = resultado.reduce((s, r) => s + r.ate_periodo, 0);
    const totalAExecutar = resultado.reduce((s, r) => s + r.a_executar, 0);
    const totalPrevisto = resultado.reduce((s, r) => s + r.valor_previsto, 0);

    return {
      contrato_id: contratoId,
      itens: resultado,
      totais: {
        valor_previsto: Math.round(totalPrevisto * 100) / 100,
        no_periodo: Math.round(totalNoPeriodo * 100) / 100,
        ate_periodo: Math.round(totalAtePeriodo * 100) / 100,
        a_executar: Math.round(totalAExecutar * 100) / 100,
      },
      execucao_fiscal: execucaoFiscal,
      medicao_referencia: medicaoAtual ? {
        id: medicaoAtual.id,
        numero_medicao: medicaoAtual.numero_medicao,
        status: medicaoAtual.status,
      } : null,
    };
  }
}
