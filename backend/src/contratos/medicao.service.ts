import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Contrato, ModalidadeExecucao, StatusContrato } from './entities/contrato.entity';
import { EtapaCronograma, StatusEtapaCronograma } from './entities/etapa-cronograma.entity';
import { ItemCronograma } from './entities/item-cronograma.entity';
import { LinkAssinaturaFiscal } from './entities/link-assinatura-fiscal.entity';
import { DocumentoContrato, TipoDocumentoContrato } from './entities/documento-contrato.entity';
import { ItemMedicaoItem } from './entities/item-medicao-item.entity';
import { Medicao, StatusMedicao } from './entities/medicao.entity';
import { AnexoMedicao } from './entities/anexo-medicao.entity';
import { ItemMedicao } from './entities/item-medicao.entity';
import { MensagemSolicitacaoMedicao } from './entities/mensagem-solicitacao-medicao.entity';
import { DiscriminacaoDespesaMedicao } from './entities/discriminacao-despesa-medicao.entity';
import { ItemContrato } from '../almoxarifado/entities/item-contrato.entity';
import { Requisicao, StatusRequisicao, TipoRequisicao } from '../almoxarifado/entities/requisicao.entity';
import { OrdemServicoContrato, StatusOrdemServico } from './entities/ordem-servico-contrato.entity';
import { Usuario, RoleUsuario } from '../usuarios/entities/usuario.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { TipoNotificacao, PrioridadeNotificacao } from '../notificacoes/entities/notificacao.entity';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { AssinaturasService } from '../assinaturas/assinaturas.service';
import { GeradorPdfService } from '../assinaturas/gerador-pdf.service';
import { EntidadeTipo, PapelAssinante } from '../assinaturas/entities/assinatura-digital.entity';
import { AssinaturaDigital } from '../assinaturas/entities/assinatura-digital.entity';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import QRCode from 'qrcode';
import {
  centavosParaReaisTrunc2,
  produtoQuantidadeValorUnitarioCentavos,
  quantidadeFisicaTotalContratada,
  textoUnidadeCronogramaPdf,
  textoFrequenciaCronogramaPdf,
  truncarMoedaReais2Casas,
  valorPorFrequenciaItemCronograma,
} from './cronograma-medicao-pdf.util';

@Injectable()
export class MedicaoService {
  private readonly logger = new Logger(MedicaoService.name);
  private readonly uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

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
    @InjectRepository(AssinaturaDigital)
    private assinaturaDigitalRepository: Repository<AssinaturaDigital>,
    @InjectRepository(AnexoMedicao)
    private anexoMedicaoRepository: Repository<AnexoMedicao>,
    @InjectRepository(LinkAssinaturaFiscal)
    private linkAssinaturaRepository: Repository<LinkAssinaturaFiscal>,
    @InjectRepository(DocumentoContrato)
    private documentoContratoRepository: Repository<DocumentoContrato>,
    private notificacoesService: NotificacoesService,
    private assinaturasService: AssinaturasService,
    private geradorPdfService: GeradorPdfService,
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

    const itensNoCronograma = await this.itemCronogramaRepository.count({ where: { contrato_id: contratoId } });
    if (itensNoCronograma > 0) {
      throw new BadRequestException(
        'Contrato já possui itens no cronograma (medição por quantidade). Exclua os itens antes de cadastrar etapas.',
      );
    }

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
    const unidade = (dados as any).unidade_medida as string | undefined;
    // Para itens MENSAL: Quantidade = meses, Valor Unitário = preço/mês.
    // Valor Mensal = Valor Unitário (custo mensal fixo), Valor Total = Qtd × Valor Unitário.
    // Qtd. Meses é ignorado para MENSAL (seria redundante / causaria dupla contagem).
    const isMensal = unidade === 'MENSAL';
    const quantidadeMeses = isMensal ? null : (dados.quantidade_meses ? Number(dados.quantidade_meses) : null);
    const rawMensal = isMensal ? valorUnitario : quantidade * valorUnitario;
    const rawTotal = isMensal ? quantidade * valorUnitario : (quantidadeMeses ? quantidade * valorUnitario * quantidadeMeses : rawMensal);
    const valorMensal = isMensal ? valorUnitario : truncarMoedaReais2Casas(rawMensal);
    const valorTotal = truncarMoedaReais2Casas(rawTotal);

    if (somaValorExistente + valorTotal > valorGlobal + 0.01) {
      const saldoDisponivel = Math.max(0, valorGlobal - somaValorExistente);
      throw new BadRequestException(
        `O valor total do item (R$ ${valorTotal.toFixed(2)}) excede o saldo disponível. ` +
        `Valor do contrato: R$ ${valorGlobal.toFixed(2)}, já alocado: R$ ${somaValorExistente.toFixed(2)}, ` +
        `disponível: R$ ${saldoDisponivel.toFixed(2)}.`
      );
    }

    const proximoNumero = itensExistentes.length > 0
      ? Math.max(...itensExistentes.map(i => i.numero_item)) + 1
      : 1;
    const numeroItem = (dados as any).numero_item > 0 ? (dados as any).numero_item : proximoNumero;

    const freq = (dados as any).frequencia_execucao as string | null | undefined;
    const numRaw = (dados as any).numero_execucoes;
    let numExec: number | null = null;
    if (numRaw !== undefined && numRaw !== null && numRaw !== '') {
      const n = Number(numRaw);
      numExec = Number.isFinite(n) ? n : null;
    } else if (!isMensal && quantidadeMeses != null) {
      numExec = quantidadeMeses;
    }

    const item = this.itemCronogramaRepository.create({
      contrato_id: contratoId,
      numero_item: numeroItem,
      descricao: dados.descricao || '',
      unidade_medida: dados.unidade_medida || 'UNIDADE',
      quantidade,
      valor_unitario: valorUnitario,
      quantidade_meses: quantidadeMeses,
      frequencia_execucao: freq != null && freq !== '' ? String(freq).slice(0, 20) : null,
      numero_execucoes: numExec,
      valor_mensal: valorMensal,
      valor_total: valorTotal,
      observacoes: dados.observacoes,
    });
    const saved = await this.itemCronogramaRepository.save(item);
    return Array.isArray(saved) ? saved[0] : saved;
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

    const unidade = (dados as any).unidade_medida !== undefined ? (dados as any).unidade_medida : item.unidade_medida;
    const isMensal = unidade === 'MENSAL';
    const quantidadeMeses = isMensal ? null : (dados.quantidade_meses !== undefined
      ? (dados.quantidade_meses ? Number(dados.quantidade_meses) : null)
      : item.quantidade_meses);
    // MENSAL: Valor Mensal = preço/mês (Valor Unitário), Valor Total = Qtd(meses) × Valor Unitário
    // OUTROS: Valor Mensal = Qtd × Valor Unitário, Valor Total = Valor Mensal × Qtd. Meses
    const rawMensal = isMensal ? valorUnitario : quantidade * valorUnitario;
    const rawTotal = isMensal ? quantidade * valorUnitario : (quantidadeMeses ? quantidade * valorUnitario * quantidadeMeses : rawMensal);
    const valorMensal = isMensal ? valorUnitario : truncarMoedaReais2Casas(rawMensal);
    const valorTotal = truncarMoedaReais2Casas(rawTotal);
    const raw = dados as Record<string, unknown>;
    const { frequencia_execucao: feRaw, numero_execucoes: neRaw, ...dadosSemFreq } = raw as any;
    Object.assign(item, {
      ...dadosSemFreq,
      quantidade,
      valor_unitario: valorUnitario,
      quantidade_meses: quantidadeMeses,
      valor_mensal: valorMensal,
      valor_total: valorTotal,
    });
    if (Object.prototype.hasOwnProperty.call(raw, 'frequencia_execucao')) {
      item.frequencia_execucao =
        feRaw != null && feRaw !== ''
          ? String(feRaw).slice(0, 20)
          : null;
    }
    if (Object.prototype.hasOwnProperty.call(raw, 'numero_execucoes')) {
      item.numero_execucoes =
        neRaw !== null && neRaw !== '' && Number.isFinite(Number(neRaw))
          ? Number(neRaw)
          : null;
    } else if (!isMensal) {
      item.numero_execucoes = quantidadeMeses;
    }
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

  /**
   * Atualiza quantidade_medida do item do cronograma (ajuste de migração).
   * Apenas administradores. Usado para informar quantidade já consumida antes da implantação do sistema.
   */
  async atualizarQuantidadeMedidaMigracao(
    contratoId: string,
    itemId: string,
    quantidadeMedida: number,
  ): Promise<ItemCronograma> {
    const item = await this.itemCronogramaRepository.findOne({
      where: { id: itemId, contrato_id: contratoId },
    });
    if (!item) throw new NotFoundException('Item do cronograma não encontrado');

    const qtd = Number(quantidadeMedida) || 0;
    const quantidadeTotal = Number(item.quantidade) || 0;
    if (qtd < 0) throw new BadRequestException('Quantidade medida não pode ser negativa');
    if (qtd > quantidadeTotal + 0.0001) {
      throw new BadRequestException(
        `Quantidade medida (${qtd.toFixed(2)}) não pode exceder a quantidade total do item (${quantidadeTotal.toFixed(2)})`,
      );
    }

    item.quantidade_medida = qtd;
    return this.itemCronogramaRepository.save(item);
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
    competencia?: string;
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

    // Validar que período da medição não ultrapassa a data de vigência fim do contrato
    if (contrato.data_vigencia_fim) {
      const dataFimPeriodo = new Date(dados.periodo_fim);
      const dataVigenciaFim = new Date(contrato.data_vigencia_fim);
      if (dataFimPeriodo > dataVigenciaFim) {
        // Formatador de data no padrão brasileiro
        const formatarDataBR = (dataStr: string | Date) => {
          const data = typeof dataStr === 'string' ? new Date(dataStr) : dataStr;
          return data.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
        };
        throw new BadRequestException(
          `O período de medição não pode ultrapassar a data de vigência do contrato. ` +
          `Período informado: ${formatarDataBR(dados.periodo_fim)}, Vigência do contrato: ${formatarDataBR(contrato.data_vigencia_fim)}`
        );
      }
    }

    let osVinculada: OrdemServicoContrato | null = null;
    const fluxoOs = await this.getFluxoOsEfetivo(contratoId);

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
          'Aguarde o órgão enviar uma Ordem de Serviço autorizada para emitir a medição.'
        );
      }

      const statusAtual = String(osVinculada.status);
      if (statusAtual === StatusOrdemServico.AUTORIZADA || statusAtual === 'AUTORIZADA') {
        if (fluxoOs === 'REQUISICAO') {
          await this.requisicaoRepository.update(osVinculada.id, {
            status: StatusRequisicao.ORDEM_GERADA,
          });
          this.logger.log(`Requisição OS ${osVinculada.numero_os} atualizada para ORDEM_GERADA ao criar medição`);
        } else {
          osVinculada.status = StatusOrdemServico.EM_EXECUCAO;
          await this.ordemServicoRepository.save(osVinculada);
          this.logger.log(`OS ${osVinculada.numero_os} movida para EM_EXECUCAO ao criar medição`);
        }
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

      const unidadesAtivas: string[] = []; // para validar homogeneidade no final

      for (const item of itensComItemCronograma) {
        const itemCron = await this.itemCronogramaRepository.findOne({ where: { id: item.item_cronograma_id! } });
        if (!itemCron) throw new NotFoundException(`Item do cronograma ${item.item_cronograma_id} não encontrado`);

        const qtdMedida = Number(item.quantidade_medida) || 0;
        if (qtdMedida <= 0) continue;

        unidadesAtivas.push(itemCron.unidade_medida);

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
        // Para itens MENSAL com proporcional: o frontend pode enviar valor_medido_override
        // calculado via aritmética inteira (dias × vu_centavos / 30), mais preciso que qtd × vu.
        const overrideRaw = Number((item as any).valor_medido_override);
        const valorItem = (Number.isFinite(overrideRaw) && overrideRaw > 0)
          ? truncarMoedaReais2Casas(overrideRaw)
          : truncarMoedaReais2Casas(qtdMedida * valorUnitario);
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

      // Validar que não há mistura de itens mensais com itens por quantidade
      const temMensal = unidadesAtivas.some((u) => u === 'MENSAL');
      const temQuantidade = unidadesAtivas.some((u) => u !== 'MENSAL');
      if (temMensal && temQuantidade) {
        throw new BadRequestException(
          'Não é possível misturar itens mensais com itens medidos por quantidade na mesma medição. ' +
          'Crie uma medição separada para os itens de cada tipo.'
        );
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
      ordem_servico_id: (fluxoOs === 'REQUISICAO') ? null : osVinculada?.id || null,
      requisicao_id: (fluxoOs === 'REQUISICAO') ? osVinculada?.id || null : null,
      numero_medicao: numeroMedicao,
      periodo_inicio: dados.periodo_inicio,
      periodo_fim: dados.periodo_fim,
      competencia: dados.competencia || null,
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

    // Calcular e salvar execução fiscal (temporal) com ano comercial
    try {
      const execucaoFinanceira = await this.calcularExecucaoFinanceira(contratoId, '', medicaoSalva.id);
      if (execucaoFinanceira) {
        await this.medicaoRepository.update(medicaoSalva.id, {
          execucao_fiscal: execucaoFinanceira.execucao_fiscal,
          execucao_financeira: this.montarSnapshotExecucaoFinanceira(execucaoFinanceira),
        });
        this.logger.log(`Execução fiscal/financeira calculada e salva para medição ${medicaoSalva.id}`);
      }
    } catch (error) {
      this.logger.warn(`Erro ao calcular execução fiscal/financeira para medição ${medicaoSalva.id}: ${error.message}`);
      // Não falhar a criação da medição se der erro no snapshot de execução
    }

    // Salvar itens da medição (obras/etapas)
    for (const item of itensParaSalvar) {
      const itemMedicao = this.itemMedicaoRepository.create({
        ...item,
        medicao_id: medicaoSalva.id,
      } as any);
      await this.itemMedicaoRepository.save(itemMedicao);
    }

    // Salvar itens da medição (item_cronograma)
    for (const item of itensItemParaSalvar) {
      const itemMedicaoItem = this.itemMedicaoItemRepository.create({
        medicao_id: medicaoSalva.id,
        item_cronograma_id: item.item_cronograma_id,
        quantidade_medida: item.quantidade_medida,
        valor_medido: item.valor_medido,
      } as any);
      await this.itemMedicaoItemRepository.save(itemMedicaoItem);
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

    // Se medição APROVADA, reverter os valores das etapas ou itens do cronograma
    if (medicao.status === StatusMedicao.APROVADA) {
      const usarItens = await this.usarItensCronograma(medicao.contrato_id);
      if (usarItens) {
        const itensItem = await this.itemMedicaoItemRepository.find({
          where: { medicao_id: medicaoId },
          relations: ['itemCronograma'],
        });
        for (const imi of itensItem) {
          const ic = imi.itemCronograma;
          if (ic) {
            ic.quantidade_medida = Math.max(0, Number(ic.quantidade_medida) - Number(imi.quantidade_medida));
            await this.itemCronogramaRepository.save(ic);
          }
        }
      } else {
        const itensMedicao = await this.itemMedicaoRepository.find({
          where: { medicao_id: medicaoId },
        });

        for (const item of itensMedicao) {
          const etapa = await this.etapaRepository.findOne({ where: { id: item.etapa_id } });
          if (etapa) {
            etapa.percentual_executado = Math.max(0, Number(etapa.percentual_executado) - Number(item.percentual_executado_atual));
            etapa.valor_executado = Math.max(0, Number(etapa.valor_executado) - Number(item.valor_medido));

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
      }

      this.logger.warn(
        `ADMIN: Medição APROVADA #${medicao.numero_medicao} excluída. ` +
        `Valor revertido: R$ ${Number(medicao.valor_medido).toFixed(2)} do contrato ${medicao.contrato_id}`
      );
    }

    // Excluir itens da medição primeiro
    await this.itemMedicaoRepository.delete({ medicao_id: medicaoId });
    await this.itemMedicaoItemRepository.delete({ medicao_id: medicaoId });

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

    try {
      const execucaoFinanceira = await this.calcularExecucaoFinanceiraFornecedor(medicao.contrato_id, medicao.id);
      medicao.execucao_fiscal = execucaoFinanceira?.execucao_fiscal || null as any;
      medicao.execucao_financeira = execucaoFinanceira
        ? this.montarSnapshotExecucaoFinanceira(execucaoFinanceira) as any
        : null as any;
    } catch (error) {
      this.logger.warn(`Erro ao persistir snapshot de execução da medição ${medicao.id} na submissão: ${error.message}`);
    }

    await this.medicaoRepository.save(medicao);
    this.logger.log(`Medição #${medicao.numero_medicao} submetida pelo fornecedor ${fornecedorId}`);

    // Notificar usuários do órgão (fiscal e gestores)
    this.notificarSubmissaoMedicao(medicao, contrato).catch(e =>
      this.logger.error(`Erro ao enviar notificações de submissão: ${e.message}`),
    );

    return this.buscarMedicaoCompleta(medicaoId);
  }

  /**
   * Fiscal submete medição criada internamente para análise (fluxo igual ao fornecedor).
   * Status: RASCUNHO → SUBMETIDA (depois fiscal atesta → AGUARDANDO_APROVACAO)
   */
  async submeterMedicaoFiscal(medicaoId: string, fiscalId: string, fiscalNome: string): Promise<Medicao> {
    const medicao = await this.medicaoRepository.findOne({ where: { id: medicaoId } });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    if (medicao.status !== StatusMedicao.RASCUNHO && medicao.status !== StatusMedicao.DEVOLVIDA) {
      throw new BadRequestException('Apenas medições em rascunho ou devolvidas podem ser submetidas');
    }

    const contrato = await this.contratoRepository.findOne({ where: { id: medicao.contrato_id } });
    if (contrato) {
      const valorComprometido = await this.somarValorMedicoesComprometidas(medicao.contrato_id, medicao.id);
      const valorContrato = Number(contrato.valor_global) || Number(contrato.valor_inicial) || 0;
      const valorExecAnterior = Number(contrato.valor_executado_anterior) || 0;
      const saldoDisponivel = valorContrato - valorExecAnterior - valorComprometido;
      const valorMedicao = Number(medicao.valor_medido) || 0;
      if (valorMedicao > saldoDisponivel + 0.01) {
        throw new BadRequestException(
          `O valor desta medição (R$ ${valorMedicao.toFixed(2)}) excede o saldo disponível (R$ ${saldoDisponivel.toFixed(2)}).`
        );
      }
    }

    medicao.status = StatusMedicao.SUBMETIDA;
    medicao.data_submissao = new Date() as any;
    medicao.fiscal_id = fiscalId;
    medicao.fiscal_nome = fiscalNome;
    medicao.motivo_devolucao = null as any;
    medicao.data_devolucao = null as any;

    try {
      const execucaoFinanceira = await this.calcularExecucaoFinanceiraFornecedor(medicao.contrato_id, medicao.id);
      medicao.execucao_fiscal = execucaoFinanceira?.execucao_fiscal || null as any;
      medicao.execucao_financeira = execucaoFinanceira
        ? this.montarSnapshotExecucaoFinanceira(execucaoFinanceira) as any
        : null as any;
    } catch (error) {
      this.logger.warn(`Erro ao persistir snapshot da medição ${medicao.id}: ${error.message}`);
    }

    await this.medicaoRepository.save(medicao);
    this.logger.log(`Medição #${medicao.numero_medicao} submetida pelo fiscal ${fiscalNome}`);
    const contratoNotif = contrato || await this.contratoRepository.findOne({ where: { id: medicao.contrato_id } });
    if (contratoNotif) {
      this.notificarSubmissaoMedicao(medicao, contratoNotif).catch(e =>
        this.logger.error(`Erro ao enviar notificações de submissão: ${e.message}`),
      );
    }
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

    // Atestar todos os itens da medição (etapas + itens de quantidade)
    const [itensEtapa, itensQuantidade] = await Promise.all([
      this.itemMedicaoRepository.find({ where: { medicao_id: medicaoId } }),
      this.itemMedicaoItemRepository.find({ where: { medicao_id: medicaoId } }),
    ]);

    for (const item of itensEtapa) {
      if (!item.atestado) {
        item.atestado = true;
        item.ateste_fiscal_nome = fiscalNome;
        item.ateste_data = new Date() as any;
      }
    }

    for (const item of itensQuantidade) {
      if (!item.atestado) {
        item.atestado = true;
        item.ateste_fiscal_nome = fiscalNome;
        item.ateste_data = new Date() as any;
      }
    }

    if (itensEtapa.length > 0) {
      await this.itemMedicaoRepository.save(itensEtapa);
    }
    if (itensQuantidade.length > 0) {
      await this.itemMedicaoItemRepository.save(itensQuantidade);
    }

    medicao.status = StatusMedicao.AGUARDANDO_APROVACAO;
    medicao.ateste_fiscal_id = fiscalId;
    medicao.ateste_fiscal_nome = fiscalNome;
    medicao.ateste_data = new Date() as any;
    medicao.ateste_observacoes = dados?.observacoes || null as any;
    medicao.ateste_verificado_in_loco = dados?.verificado_in_loco || false;

    await this.medicaoRepository.save(medicao);
    const totalItens = itensEtapa.length + itensQuantidade.length;
    this.logger.log(`Medição #${medicao.numero_medicao} atestada (todos os itens: ${totalItens}) pelo fiscal ${fiscalNome}`);

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
      const usarItens = await this.usarItensCronograma(medicao.contrato_id);
      if (usarItens) {
        const itensItem = await this.itemMedicaoItemRepository.find({
          where: { medicao_id: medicaoId },
          relations: ['itemCronograma'],
        });
        for (const imi of itensItem) {
          const ic = imi.itemCronograma;
          if (ic) {
            const qtdNova = Number(ic.quantidade_medida) + Number(imi.quantidade_medida);
            ic.quantidade_medida = Math.min(qtdNova, Number(ic.quantidade));
            await this.itemCronogramaRepository.save(ic);
          }
        }
      } else {
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

  private getBoletinsDir(): string {
    return path.join(this.uploadDir, 'boletins');
  }

  private getBoletimPdfFilename(medicaoId: string): string {
    return `boletim_${medicaoId}.pdf`;
  }

  private getBoletimPdfPath(medicaoId: string): string {
    return path.join(this.getBoletinsDir(), this.getBoletimPdfFilename(medicaoId));
  }

  private getBoletimPdfUrl(medicaoId: string): string {
    return `/api/uploads/boletins/${this.getBoletimPdfFilename(medicaoId)}`;
  }

  private normalizarBoletimPdfUrl(pdfUrl: string | null | undefined, medicaoId: string): string {
    if (!pdfUrl) {
      return this.getBoletimPdfUrl(medicaoId);
    }

    if (pdfUrl.startsWith('/uploads/')) {
      return `/api${pdfUrl}`;
    }

    return pdfUrl;
  }

  private async registrarAssinaturaMedicaoSeAusente(
    medicaoId: string,
    dados: {
      orgao_id?: string;
      papel: 'FORNECEDOR' | 'FISCAL' | 'GESTOR';
      usuario_id?: string;
      usuario_nome: string;
      usuario_cpf_cnpj: string;
      usuario_cargo?: string;
      ip_address?: string;
      user_agent?: string;
    },
  ): Promise<void> {
    const papelMap: Record<string, PapelAssinante> = {
      FORNECEDOR: PapelAssinante.FORNECEDOR,
      FISCAL: PapelAssinante.FISCAL,
      GESTOR: PapelAssinante.GESTOR,
    };

    const assinaturaExistente = await this.assinaturaDigitalRepository.findOne({
      where: {
        entidade_tipo: EntidadeTipo.MEDICAO,
        entidade_id: medicaoId,
        papel_assinante: papelMap[dados.papel] || PapelAssinante.FORNECEDOR,
      },
      order: { data_assinatura: 'ASC' },
    });

    if (!assinaturaExistente) {
      await this.registrarAssinaturaMedicao(medicaoId, dados);
    }
  }

  private async montarDadosPdfOficialMedicao(medicaoId: string): Promise<any> {
    const medicao = await this.buscarMedicaoCompleta(medicaoId);
    const contrato = await this.contratoRepository.findOne({
      where: { id: medicao.contrato_id },
      relations: ['orgao'],
    });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');

    const fornecedor = contrato.fornecedor_id
      ? await this.fornecedorRepository.findOne({ where: { id: contrato.fornecedor_id } })
      : null;

    const discriminacoes = await this.listarDiscriminacoes(medicaoId);

    return {
      orgao: contrato.orgao || null,
      contrato,
      numero_medicao: medicao.numero_medicao,
      periodo_inicio: medicao.periodo_inicio,
      periodo_fim: medicao.periodo_fim,
      valor_medido: Number(medicao.execucao_financeira?.totais?.no_periodo ?? medicao.valor_medido ?? 0),
      percentual_fisico_medido: Number(medicao.percentual_fisico_medido || 0),
      execucao_financeira: medicao.execucao_financeira || null,
      discriminacoes,
      fornecedor: fornecedor ? {
        razao_social: fornecedor.razao_social,
        cpf_cnpj: fornecedor.cpf_cnpj,
      } : null,
    };
  }

  /**
   * Monta dados no formato DadosMedicaoPdf (compatível com a lib jsPDF do frontend)
   * incluindo assinaturas já registradas, para o frontend regenerar o PDF com o layout correto.
   */
  async montarDadosPdfFrontend(medicaoId: string): Promise<any> {
    const medicao = await this.buscarMedicaoCompleta(medicaoId);
    const contrato = await this.contratoRepository.findOne({
      where: { id: medicao.contrato_id },
      relations: ['orgao'],
    });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');

    const fornecedor = contrato.fornecedor_id
      ? await this.fornecedorRepository.findOne({ where: { id: contrato.fornecedor_id } })
      : null;

    const discriminacoes = await this.listarDiscriminacoes(medicaoId);

    const assinaturas = await this.assinaturaDigitalRepository.find({
      where: { entidade_tipo: EntidadeTipo.MEDICAO, entidade_id: medicaoId },
      order: { data_assinatura: 'ASC' },
    });
    const asFornecedor = assinaturas.find(a => a.papel_assinante === PapelAssinante.FORNECEDOR);
    const asFiscal    = assinaturas.find(a => a.papel_assinante === PapelAssinante.FISCAL);

    const fmtCodigo = (c: string) => c?.match(/.{1,4}/g)?.join('-') ?? c;
    // timestamp without time zone: o driver pg interpreta o valor do banco
    // como horário LOCAL do processo Node.js. Para obter o UTC real (valor
    // armazenado pelo PostgreSQL), desfazemos o offset local e depois
    // convertemos para BRT (UTC-3). Funciona tanto em servidor UTC quanto BRT.
    const fmtDataBR = (date: Date) => {
      const d = date instanceof Date ? date : new Date(date as any);
      const trueUtcMs = d.getTime() - d.getTimezoneOffset() * 60 * 1000;
      const brt = new Date(trueUtcMs - 3 * 60 * 60 * 1000);
      const dd = String(brt.getUTCDate()).padStart(2, '0');
      const mm = String(brt.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = brt.getUTCFullYear();
      const hh = String(brt.getUTCHours()).padStart(2, '0');
      const mi = String(brt.getUTCMinutes()).padStart(2, '0');
      const ss = String(brt.getUTCSeconds()).padStart(2, '0');
      return `${dd}/${mm}/${yyyy}, ${hh}:${mi}:${ss}`;
    };

    // Itens da medição (para bloco EXECUÇÃO FISCAL / FINANCEIRA)
    // Usa o snapshot execucao_financeira salvo na submissão do fornecedor.
    // Para itens MENSAL com migração via /quantidade-migracao, o snapshot não
    // inclui ic.quantidade_medida no ate_periodo. Aplicamos Math.max igual ao frontend.
    const efItens: any[] = (medicao.execucao_financeira as any)?.itens || [];
    const efItemMap = new Map<string, any>();
    for (const ef of efItens) {
      if (ef.etapa_id) efItemMap.set(ef.etapa_id, ef);
    }

    // Carregar itens do cronograma para obter quantidade_medida (migração por item)
    const icMigracao = await this.itemCronogramaRepository.find({
      where: { contrato_id: contrato.id },
      order: { numero_item: 'ASC' } as any,
    });
    const icMigracaoMap = new Map<string, any>();
    for (const ic of icMigracao) {
      icMigracaoMap.set(ic.id, ic);
    }

    const itensParaPdf = ((medicao as any).itens || [])
      .filter((i: any) => i.tipo_item === 'item_cronograma')
      .sort((a: any, b: any) => (Number(a.item_numero) || 0) - (Number(b.item_numero) || 0))
      .map((item: any) => {
        const vlrUnitario  = Number(item.item_valor_unitario || 0);
        const qtdMedida    = Number(item.quantidade_medida || 0);
        const icPdf = icMigracaoMap.get(item.item_cronograma_id || '');
        const qtdTotal     = icPdf
          ? quantidadeFisicaTotalContratada(icPdf)
          : Number(item.item_quantidade_total || 0);

        const efItem = efItemMap.get(item.item_cronograma_id || '');
        const ic = icMigracaoMap.get(item.item_cronograma_id || '');
        // NO PERÍODO e demais q×vu: centavos inteiros (ex.: 2831,40×6,94 → 19.649,91; float dava ,90).
        const centNo = produtoQuantidadeValorUnitarioCentavos(qtdMedida, vlrUnitario);

        const centSnap = efItem
          ? Math.round(truncarMoedaReais2Casas(Number(efItem.ate_periodo_global ?? efItem.ate_periodo ?? 0)) * 100)
          : centNo;
        const centMigracao = ic
          ? produtoQuantidadeValorUnitarioCentavos(Number(ic.quantidade_medida || 0), vlrUnitario) + centNo
          : centNo;
        const centAte = Math.max(centSnap, centMigracao);
        const centAcum = centAte - centNo;

        const centTotal = efItem
          ? Math.round(truncarMoedaReais2Casas(Number(efItem.valor_previsto || 0)) * 100)
          : produtoQuantidadeValorUnitarioCentavos(qtdTotal, vlrUnitario);
        const centAExecutar = Math.max(0, centTotal - centAte);

        const vlrNoPeriodo = centavosParaReaisTrunc2(centNo);
        const vlrAcumAnterior = centavosParaReaisTrunc2(centAcum);
        const vlrAtePeriodo = centavosParaReaisTrunc2(centAte);
        const vlrTotal = centavosParaReaisTrunc2(centTotal);
        const vlrAExecutar = centavosParaReaisTrunc2(centAExecutar);

        // Para MENSAL com boletim_por_quantidade: cada mês = 1 unidade inteira (arredonda imprecisão de migração)
        const isMensalComFlag = (item.item_unidade || '') === 'MENSAL' && !!(contrato as any).boletim_por_quantidade;
        const qtdAcumuladaRaw = vlrUnitario > 0 ? vlrAcumAnterior / vlrUnitario : Number(item.item_quantidade_acumulada || 0);
        const qtdAcumulada = isMensalComFlag
          ? Math.round(qtdAcumuladaRaw)
          : Math.round(Number(qtdAcumuladaRaw) * 100) / 100;
        const qtdAtePeriodo = qtdAcumulada + qtdMedida;
        const qtdAExecutar = Math.max(0, qtdTotal - qtdAtePeriodo);
        const base: any = {
          numero:                        Number(item.etapa_numero || item.item_numero || 0),
          descricao:                     item.item_descricao || item.etapa_descricao || '',
          unidade:                       item.item_unidade || '',
          quantidade_no_periodo:         qtdMedida,
          quantidade_acumulada_aprovada: qtdAcumulada,
          quantidade_total_contrato:     qtdTotal,
          valor_no_periodo:              vlrNoPeriodo,
          valor_unitario:                vlrUnitario,
          valor_acumulado_anterior:      vlrAcumAnterior,
          valor_total_item:              vlrTotal,
          /** Valor a executar já truncado (PDF / consistência com coluna A EXECUTAR) */
          valor_a_executar:              vlrAExecutar,
        };
        // Execução física no PDF: até 2 casas (evita lixo de ponto flutuante na coluna fiscal)
        base.quantidade_ate_periodo = Math.round(qtdAtePeriodo * 100) / 100;
        base.quantidade_a_executar = Math.round(qtdAExecutar * 100) / 100;

        // Aplicar overrides manuais de execução fiscal (corrigirExecucaoFiscal)
        const efOverrides: any[] = (medicao.execucao_fiscal as any)?.item_overrides || [];
        const override = efOverrides.find((o: any) => o.item_cronograma_id === (item.item_cronograma_id || ''));
        if (override) {
          if (override.no_periodo != null) base.quantidade_no_periodo = Number(override.no_periodo);
          if (override.ate_periodo != null) base.quantidade_ate_periodo = Number(override.ate_periodo);
          if (override.a_executar != null) base.quantidade_a_executar = Number(override.a_executar);
          if (override.descricao) base.descricao = String(override.descricao);
          if (override.unidade) base.unidade = String(override.unidade);
        }

        return base;
      });

    // Recalcular totais com base nos itens corrigidos (inclui migração por item)
    const totalNoCent = itensParaPdf.reduce(
      (s, i) => s + produtoQuantidadeValorUnitarioCentavos(i.quantidade_no_periodo, i.valor_unitario),
      0,
    );
    const totalAteCent = itensParaPdf.reduce((s, i) => {
      const cNo = produtoQuantidadeValorUnitarioCentavos(i.quantidade_no_periodo, i.valor_unitario);
      const cAcum = Math.round((Number(i.valor_acumulado_anterior) || 0) * 100);
      return s + cNo + cAcum;
    }, 0);
    const totalAExecCent = itensParaPdf.reduce(
      (s, i) => s + Math.round((Number(i.valor_a_executar) || 0) * 100),
      0,
    );
    const totalNoPeriodoPdf = centavosParaReaisTrunc2(totalNoCent);
    const totalAtePeriodoPdf = centavosParaReaisTrunc2(totalAteCent);
    const totalAExecutarPdf = centavosParaReaisTrunc2(totalAExecCent);
    const totalPrevistoCent = itensParaPdf.reduce((s, i) => {
      const vu = Number(i.valor_unitario) || 0;
      const ct =
        i.valor_total_item != null && i.valor_total_item !== undefined
          ? Math.round(truncarMoedaReais2Casas(Number(i.valor_total_item)) * 100)
          : produtoQuantidadeValorUnitarioCentavos(i.quantidade_total_contrato, vu);
      return s + ct;
    }, 0);

    const execucaoFinanceiraTotaisCorrigidos = itensParaPdf.length > 0 ? {
      no_periodo: totalNoPeriodoPdf,
      ate_periodo: totalAtePeriodoPdf,
      a_executar: totalAExecutarPdf,
      valor_previsto: centavosParaReaisTrunc2(totalPrevistoCent),
    } : (medicao.execucao_financeira as any)?.totais || undefined;

    // Itens contratados (para bloco ITENS CONTRATADOS) — espelho do cronograma na UI
    const itensContratados = icMigracao.map((ic, idx) => ({
      numero:                 ic.numero_item || idx + 1,
      descricao:              ic.descricao || '',
      unidade:                ic.unidade_medida || '',
      unidade_exibicao:       textoUnidadeCronogramaPdf(ic.unidade_medida),
      frequencia_exibicao:    textoFrequenciaCronogramaPdf(ic.frequencia_execucao),
      numero_execucoes:       ic.quantidade_meses != null ? Number(ic.quantidade_meses) : null,
      quantidade:             Number(ic.quantidade || 0),
      valor_unitario:         Number(ic.valor_unitario || 0),
      valor_por_frequencia:   valorPorFrequenciaItemCronograma(ic),
      valor_total:            Number(ic.valor_total || 0),
    }));

    return {
      orgao:                contrato.orgao || null,
      orgao_nome:           contrato.orgao?.nome || '',
      contrato_numero:      contrato.numero_contrato || '',
      contrato_objeto:      (medicao as any).objeto_contrato || contrato.objeto || undefined,
      fornecedor_nome:      medicao.fornecedor_nome || fornecedor?.razao_social || '',
      fornecedor_cnpj:      fornecedor?.cpf_cnpj || '',
      valor_total_contrato: Number(contrato.valor_global || 0) || undefined,
      data_vigencia_inicio: contrato.data_vigencia_inicio || undefined,
      data_vigencia_fim:    contrato.data_vigencia_fim || undefined,
      numero_medicao:       medicao.numero_medicao || 1,
      periodo_inicio:       medicao.periodo_inicio || '',
      periodo_fim:          medicao.periodo_fim || '',
      competencia:          (medicao as any).competencia || undefined,
      // Usa o total recomputado dos itens (produtoQuantidadeValorUnitarioCentavos) quando há itens,
      // evitando que o DECIMAL(15,2) do banco (que arredonda) apareça errado no PDF.
      valor_medido:         itensParaPdf.length > 0 ? totalNoPeriodoPdf : Number(medicao.valor_medido || 0),
      execucao_financeira_totais: execucaoFinanceiraTotaisCorrigidos,
      nota_fiscal_numero:   medicao.nota_fiscal_numero || undefined,
      nota_fiscal_valor:    medicao.nota_fiscal_valor ? Number(medicao.nota_fiscal_valor) : undefined,
      execucao_fiscal:      medicao.execucao_fiscal || undefined,
      // Usa quantidade se o contrato tem a flag OU se qualquer item tem unidade não-MENSAL
      // (espelha a lógica do frontend: tipoMedicaoAtual = 'quantidade' quando unidade != 'MENSAL')
      execucao_fiscal_por_quantidade: !!(contrato as any).boletim_por_quantidade ||
        itensParaPdf.some(i => i.unidade && i.unidade !== 'MENSAL'),
      itens:             itensParaPdf.length > 0 ? itensParaPdf : undefined,
      itens_contratados: itensContratados.length > 0 ? itensContratados : undefined,
      discriminacoes: discriminacoes?.map((d: any, idx: number) => ({
        numero:     d.numero_item || idx + 1,
        descricao:  d.descricao || d.tipo_despesa || '',
        valor:      Number(d.valor || 0),
        percentual: Number(d.percentual || 0),
      })) || undefined,
      assinatura_fornecedor: asFornecedor ? {
        nome:             asFornecedor.usuario_nome,
        cnpj:             asFornecedor.usuario_cpf_cnpj,
        cargo:            asFornecedor.usuario_cargo || 'Fornecedor / Contratado',
        data_hora:        fmtDataBR(asFornecedor.data_assinatura),
        codigo_validacao: fmtCodigo(asFornecedor.codigo_validacao),
      } : undefined,
      assinatura_fiscal: asFiscal ? {
        nome:             asFiscal.usuario_nome,
        cpf:              asFiscal.usuario_cpf_cnpj,
        cargo:            asFiscal.usuario_cargo || 'Fiscal de Contrato',
        matricula:        asFiscal.usuario_matricula || undefined,
        portaria:         asFiscal.usuario_portaria || undefined,
        data_hora:        fmtDataBR(asFiscal.data_assinatura),
        codigo_validacao: fmtCodigo(asFiscal.codigo_validacao),
      } : undefined,
      url_validacao: `${process.env.APP_URL || 'https://portaldcp.com.br'}/validar-documento`,
      qr_code_data_url: await (async () => {
        const primeiroCodigoValido = (asFiscal || asFornecedor)?.codigo_validacao;
        if (!primeiroCodigoValido) return undefined;
        const appUrl = process.env.APP_URL || 'https://portaldcp.com.br';
        try {
          return await QRCode.toDataURL(
            `${appUrl}/validar-documento/${primeiroCodigoValido}`,
            { width: 80, margin: 1, color: { dark: '#000000', light: '#ffffff' } },
          );
        } catch {
          return undefined;
        }
      })(),
    };
  }

  async gerarPdfOficialMedicao(medicaoId: string): Promise<{ pdf_url: string; filename: string }> {
    const dadosMedicao = await this.montarDadosPdfFrontend(medicaoId);
    const assinaturas = await this.assinaturaDigitalRepository.find({
      where: {
        entidade_tipo: EntidadeTipo.MEDICAO,
        entidade_id: medicaoId,
      },
      order: { data_assinatura: 'ASC' },
    });

    const boletinsDir = this.getBoletinsDir();
    if (!fs.existsSync(boletinsDir)) {
      fs.mkdirSync(boletinsDir, { recursive: true });
    }

    const filePath = this.getBoletimPdfPath(medicaoId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await this.geradorPdfService.gerarPdfMedicao(
      dadosMedicao,
      assinaturas,
      `${process.env.APP_URL || 'http://localhost:3000'}/validar-documento`,
      filePath,
    );

    // Calcular SHA-256 do PDF gerado e gravar nas assinaturas
    try {
      const pdfBuffer = fs.readFileSync(filePath);
      const documentoHash = createHash('sha256').update(pdfBuffer).digest('hex');
      await this.assinaturaDigitalRepository.update(
        { entidade_id: medicaoId, entidade_tipo: EntidadeTipo.MEDICAO },
        { documento_hash: documentoHash } as any,
      );
      this.logger.log(`Hash SHA-256 gravado (gerador oficial) para medição ${medicaoId}: ${documentoHash.slice(0, 16)}...`);
    } catch (e) {
      this.logger.warn(`Erro ao gravar hash do boletim oficial ${medicaoId}: ${e.message}`);
    }

    const pdfUrl = this.getBoletimPdfUrl(medicaoId);
    await this.medicaoRepository.update(medicaoId, { boletim_pdf_url: pdfUrl });

    return {
      pdf_url: pdfUrl,
      filename: this.getBoletimPdfFilename(medicaoId),
    };
  }

  async obterOuGerarPdfOficialMedicao(medicaoId: string): Promise<{ pdf_url: string; filename: string }> {
    const medicao = await this.medicaoRepository.findOne({ where: { id: medicaoId } });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    const filePath = this.getBoletimPdfPath(medicaoId);
    if (medicao.boletim_pdf_url && fs.existsSync(filePath)) {
      const pdfUrl = this.normalizarBoletimPdfUrl(medicao.boletim_pdf_url, medicaoId);
      if (pdfUrl !== medicao.boletim_pdf_url) {
        await this.medicaoRepository.update(medicaoId, { boletim_pdf_url: pdfUrl });
      }

      return {
        pdf_url: pdfUrl,
        filename: this.getBoletimPdfFilename(medicaoId),
      };
    }

    return this.gerarPdfOficialMedicao(medicaoId);
  }

  /** Retorna o caminho absoluto do arquivo PDF do boletim, ou null se não existir. */
  getBoletimPdfFilePath(medicaoId: string): string | null {
    const filePath = this.getBoletimPdfPath(medicaoId);
    return fs.existsSync(filePath) ? filePath : null;
  }

  async listarPendentesAteste(orgaoId: string): Promise<any[]> {
    const medicoes = await this.medicaoRepository
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.contrato', 'c')
      .where('c.orgao_id = :orgaoId', { orgaoId })
      .andWhere('m.status IN (:...statuses)', { statuses: [StatusMedicao.SUBMETIDA, StatusMedicao.PARCIALMENTE_ATESTADA] })
      .orderBy('m.data_submissao', 'ASC')
      .getMany();

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

  // ============================================================================
  // MEDIÇÕES APROVADAS — Listagem, contabilidade e ZIP
  // ============================================================================

  async listarAprovadas(orgaoId: string): Promise<any[]> {
    const medicoes = await this.medicaoRepository
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.contrato', 'c')
      .innerJoin('c.orgao', 'o')
      .where('o.id = :orgaoId', { orgaoId })
      .andWhere('m.status = :status', { status: StatusMedicao.APROVADA })
      .orderBy('m.data_aprovacao', 'DESC')
      .getMany();

    if (medicoes.length === 0) return [];

    const ids = medicoes.map(m => m.id);
    const counts = await this.anexoMedicaoRepository
      .createQueryBuilder('a')
      .select('a.medicao_id', 'medicao_id')
      .addSelect('COUNT(a.id)', 'total')
      .where('a.medicao_id IN (:...ids)', { ids })
      .groupBy('a.medicao_id')
      .getRawMany();

    const countMap = Object.fromEntries(counts.map(c => [c.medicao_id, Number(c.total)]));

    return medicoes.map(m => {
      const contrato = (m as any).contrato;
      return {
        id: m.id,
        numero_medicao: m.numero_medicao,
        contrato_id: m.contrato_id,
        periodo_inicio: m.periodo_inicio,
        periodo_fim: m.periodo_fim,
        valor_medido: m.valor_medido,
        boletim_pdf_url: m.boletim_pdf_url,
        data_aprovacao: m.data_aprovacao,
        fornecedor_nome: m.fornecedor_nome || contrato?.fornecedor_razao_social || contrato?.fornecedor_nome,
        competencia: m.competencia,
        enviado_contabilidade: m.enviado_contabilidade,
        data_envio_contabilidade: m.data_envio_contabilidade,
        enviado_contabilidade_por_nome: m.enviado_contabilidade_por_nome,
        contrato: {
          numero_contrato: contrato?.numero_contrato,
          objeto_contrato: contrato?.objeto,
          modalidade_execucao: contrato?.modalidade_execucao,
        },
        total_anexos: countMap[m.id] || 0,
      };
    });
  }

  async marcarEnviadoContabilidade(
    medicaoId: string,
    orgaoId: string,
    usuarioNome: string,
  ): Promise<{ enviado_contabilidade: boolean; data_envio_contabilidade: Date | null }> {
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
      relations: ['contrato', 'contrato.orgao'],
    });
    if (!medicao) throw new NotFoundException('Medição não encontrada');
    if ((medicao as any).contrato?.orgao?.id !== orgaoId) throw new ForbiddenException('Acesso negado');

    const novoEstado = !medicao.enviado_contabilidade;
    medicao.enviado_contabilidade = novoEstado;
    medicao.data_envio_contabilidade = novoEstado ? new Date() : null;
    medicao.enviado_contabilidade_por_nome = novoEstado ? usuarioNome : null;
    await this.medicaoRepository.save(medicao);

    return {
      enviado_contabilidade: medicao.enviado_contabilidade,
      data_envio_contabilidade: medicao.data_envio_contabilidade,
    };
  }

  async gerarZipMedicao(medicaoId: string, orgaoId: string): Promise<Buffer> {
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
      relations: ['contrato', 'contrato.orgao'],
    });
    if (!medicao) throw new NotFoundException('Medição não encontrada');
    if ((medicao as any).contrato?.orgao?.id !== orgaoId) throw new ForbiddenException('Acesso negado');

    const anexos = await this.anexoMedicaoRepository.find({ where: { medicao_id: medicaoId } });

    // Documentos do contrato: tipo CONTRATO e último TERMO_ADITIVO
    const docContrato = await this.documentoContratoRepository.findOne({
      where: { contrato_id: (medicao as any).contrato?.id, tipo: TipoDocumentoContrato.CONTRATO },
      order: { created_at: 'ASC' },
    });
    const docsAditivos = await this.documentoContratoRepository.find({
      where: { contrato_id: (medicao as any).contrato?.id, tipo: TipoDocumentoContrato.TERMO_ADITIVO },
      order: { created_at: 'DESC' },
    });
    const ultimoAditivo = docsAditivos.length > 0 ? docsAditivos[0] : null;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const archiver = require('archiver');
    const chunks: Buffer[] = [];
    const archive = archiver('zip', { zlib: { level: 9 } });

    await new Promise<void>((resolve, reject) => {
      archive.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('end', resolve);
      archive.on('error', reject);

      // 1. Boletim PDF assinado
      if (medicao.boletim_pdf_url) {
        const pdfPath = path.join(process.cwd(), medicao.boletim_pdf_url.replace(/^\/api/, ''));
        if (fs.existsSync(pdfPath)) {
          archive.file(pdfPath, { name: `boletim_medicao_${medicao.numero_medicao}.pdf` });
        }
      }

      // 2. Documento do contrato (tipo CONTRATO)
      if (docContrato) {
        const filePath = path.join(process.cwd(), docContrato.caminho_arquivo);
        if (fs.existsSync(filePath)) {
          archive.file(filePath, { name: `contrato_${docContrato.nome_original}` });
        }
      }

      // 3. Último termo aditivo (se houver)
      if (ultimoAditivo) {
        const filePath = path.join(process.cwd(), ultimoAditivo.caminho_arquivo);
        if (fs.existsSync(filePath)) {
          archive.file(filePath, { name: `ultimo_aditivo_${ultimoAditivo.nome_original}` });
        }
      }

      // 4. Todos os anexos da medição (FOTO, DOCUMENTO — inclui nota fiscal se enviada como anexo)
      for (const anexo of anexos) {
        const filePath = path.join(process.cwd(), anexo.url.replace(/^\/api/, ''));
        if (fs.existsSync(filePath)) {
          const prefix = anexo.tipo === 'FOTO' ? 'foto' : 'doc';
          archive.file(filePath, { name: `${prefix}_${anexo.nome_original}` });
        }
      }

      archive.finalize();
    });

    return Buffer.concat(chunks);
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

    // Se o contrato tem renovação de ciclo, filtrar apenas medições do ciclo atual
    const dataRenovacao = contrato.data_renovacao_ciclo
      ? new Date(contrato.data_renovacao_ciclo)
      : null;
    const medicoesDoCiclo = dataRenovacao
      ? medicoes.filter((m) => m.periodo_inicio && new Date(m.periodo_inicio) >= dataRenovacao)
      : medicoes;

    const statusComprometidos = ['SUBMETIDA', 'AGUARDANDO_ATESTE', 'PARCIALMENTE_ATESTADA', 'AGUARDANDO_APROVACAO', 'APROVADA'];

    const medicoesAprovadas = medicoesDoCiclo.filter(m => m.status === StatusMedicao.APROVADA);
    const valorMedidoTotal = medicoesAprovadas.reduce((sum, m) => sum + Number(m.valor_medido), 0);
    const percentualFisicoTotal = medicoesAprovadas.reduce((sum, m) => sum + Number(m.percentual_fisico_medido), 0);

    // Comprometido do ciclo atual (para renovação) ou total histórico
    const valorComprometido = dataRenovacao
      ? medicoesDoCiclo
          .filter((m) => statusComprometidos.includes(m.status))
          .reduce((sum, m) => sum + Number(m.valor_medido), 0)
      : await this.somarValorMedicoesComprometidas(contratoId);
    const valorEmAnalise = Math.max(0, valorComprometido - valorMedidoTotal);

    // Percentuais comprometidos POR ETAPA (em trânsito, para validação no frontend)
    const percentuaisEmTransito = await this.calcularPercentualComprometidoPorEtapa(contratoId);
    const etapasComprometidas: Record<string, number> = {};
    for (const [etapaId, perc] of percentuaisEmTransito.entries()) {
      etapasComprometidas[etapaId] = perc;
    }

    const pendentesAteste = medicoesDoCiclo.filter(m => m.status === StatusMedicao.SUBMETIDA).length;
    const pendentesAprovacao = medicoesDoCiclo.filter(m => m.status === StatusMedicao.AGUARDANDO_APROVACAO).length;

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

    // Migração por item: irrelevante no ciclo renovado (slate limpa); usado apenas sem renovação
    let valorMigracaoPorItem = 0;
    if (usarItens && !dataRenovacao) {
      const itensCronograma = await this.itemCronogramaRepository.find({ where: { contrato_id: contratoId } });
      const somaIcMigracao = itensCronograma.reduce(
        (sum, ic) => sum + Number(ic.quantidade_medida || 0) * Number(ic.valor_unitario || 0),
        0,
      );
      // Only count the portion NOT already in valorMedidoTotal (approved measurements)
      valorMigracaoPorItem = Math.max(0, somaIcMigracao - valorMedidoTotal);
    }

    // Saldo: ciclo renovado ignora exec_anterior e migração (pizarra limpa)
    const saldoDisponivel = dataRenovacao
      ? Math.max(0, valorGlobal - valorComprometido)
      : Math.max(0, valorGlobal - valorExecAnterior - valorComprometido - valorMigracaoPorItem);

    return {
      contrato_id: contratoId,
      fluxo_os: fluxoOs,
      valor_global: valorGlobal,
      valor_executado_anterior: valorExecAnterior,
      valor_medido_total: valorMedidoTotal,
      valor_comprometido_total: valorComprometido,
      valor_em_analise: valorEmAnalise,
      saldo_disponivel: saldoDisponivel,
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

    const STATUS_BLOQUEADOS: StatusContrato[] = [
      StatusContrato.VENCIDO,
      StatusContrato.ENCERRADO,
      StatusContrato.RESCINDIDO,
      StatusContrato.CANCELADO,
      StatusContrato.SUSPENSO,
    ];
    if (STATUS_BLOQUEADOS.includes(contrato.status)) {
      throw new BadRequestException(
        `Contrato ${contrato.numero_contrato} está com status ${contrato.status}. Não é possível criar ou editar medições.`
      );
    }

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

    // Buscar itens baseados em etapa (obras/engenharia)
    const itensEtapa = await this.itemMedicaoRepository.find({
      where: { medicao_id: medicaoId },
      relations: ['etapa'],
    });
    const itensEtapaEnriquecidos = itensEtapa.map(item => ({
      ...item,
      tipo_item: 'etapa',
      etapa_descricao: item.etapa?.descricao || '',
      etapa_numero: item.etapa?.numero_etapa || 0,
      etapa_valor_previsto: item.etapa ? Number(item.etapa.valor_previsto) : 0,
      etapa_percentual_fisico: item.etapa ? Number(item.etapa.percentual_fisico) : 0,
    }));

    // Buscar itens baseados em item_cronograma (serviços por quantidade)
    const itensItem = await this.itemMedicaoItemRepository.find({
      where: { medicao_id: medicaoId },
      relations: ['itemCronograma'],
    });
    const itensItemEnriquecidos = itensItem.map(item => ({
      ...item,
      tipo_item: 'item_cronograma',
      // campos compatíveis com o padrão do frontend (etapa_*)
      etapa_descricao: item.itemCronograma?.descricao || '',
      etapa_numero: item.itemCronograma?.numero_item || 0,
      etapa_valor_previsto: item.itemCronograma ? Number(item.itemCronograma.valor_total) : 0,
      etapa_percentual_fisico: 0,
      // campos extras para exibição
      item_descricao: item.itemCronograma?.descricao || '',
      item_numero: item.itemCronograma?.numero_item || 0,
      item_unidade: item.itemCronograma?.unidade_medida || '',
      item_valor_unitario: item.itemCronograma ? Number(item.itemCronograma.valor_unitario) : 0,
      item_quantidade_total: item.itemCronograma
        ? quantidadeFisicaTotalContratada(item.itemCronograma)
        : 0,
      item_quantidade_acumulada: item.itemCronograma ? Number(item.itemCronograma.quantidade_medida) : 0,
    }));

    const itens = [...itensEtapaEnriquecidos, ...itensItemEnriquecidos];

    return { ...medicao, itens } as any;
  }

  private montarSnapshotExecucaoFinanceira(execucaoFinanceira: any) {
    const itens: Array<{
      valor_previsto?: number;
      no_periodo?: number;
      ate_periodo?: number;
      a_executar?: number;
      no_periodo_item?: number;
      ate_periodo_item?: number;
      a_executar_item?: number;
      no_periodo_global?: number;
      ate_periodo_global?: number;
      a_executar_global?: number;
    }> = Array.isArray(execucaoFinanceira?.itens) ? execucaoFinanceira.itens : [];
    const totalPrevisto = Number(execucaoFinanceira?.totais?.valor_previsto);
    const totalNoPeriodo = Number(execucaoFinanceira?.totais?.no_periodo);
    const totalAtePeriodo = Number(execucaoFinanceira?.totais?.ate_periodo);
    const totalAExecutar = Number(execucaoFinanceira?.totais?.a_executar);

    // Somar em centavos para evitar drift de ponto flutuante
    const somaCentavos = (arr: any[], campo: string) =>
      arr.reduce((s: number, item: any) => s + Math.round((Number(item[campo]) || 0) * 100), 0);
    return {
      itens,
      totais: {
        valor_previsto: Number.isFinite(totalPrevisto)
          ? truncarMoedaReais2Casas(totalPrevisto)
          : centavosParaReaisTrunc2(somaCentavos(itens, 'valor_previsto')),
        no_periodo: Number.isFinite(totalNoPeriodo)
          ? truncarMoedaReais2Casas(totalNoPeriodo)
          : centavosParaReaisTrunc2(somaCentavos(itens, 'no_periodo')),
        ate_periodo: Number.isFinite(totalAtePeriodo)
          ? truncarMoedaReais2Casas(totalAtePeriodo)
          : centavosParaReaisTrunc2(somaCentavos(itens, 'ate_periodo')),
        a_executar: Number.isFinite(totalAExecutar)
          ? truncarMoedaReais2Casas(totalAExecutar)
          : centavosParaReaisTrunc2(somaCentavos(itens, 'a_executar')),
      },
      ajuste_migracao: truncarMoedaReais2Casas(Number(execucaoFinanceira?.ajuste_migracao) || 0),
    };
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
   * Busca usuários que podem aprovar (gestor/aprovador) para central de aprovações.
   * Prioriza usuários com permissão explícita e admins; faz fallback para todos ativos.
   */
  private async buscarAprovadoresOrgao(orgaoId: string): Promise<{ id: string; email?: string; telefone?: string }[]> {
    try {
      const aprovadores = await this.usuarioRepository
        .createQueryBuilder('u')
        .select(['u.id', 'u.email', 'u.telefone'])
        .where('u.orgao_id = :orgaoId', { orgaoId })
        .andWhere('u.ativo = true')
        .andWhere('(u.pode_aprovar_requisicoes = true OR u.role = :adminRole)', {
          adminRole: RoleUsuario.ADMIN,
        })
        .getMany();

      if (aprovadores.length > 0) {
        return aprovadores.map(u => ({ id: u.id, email: u.email, telefone: u.telefone }));
      }

      return this.buscarUsuariosOrgao(orgaoId);
    } catch (e) {
      this.logger.warn(`Não foi possível buscar aprovadores do órgão ${orgaoId}: ${(e as any).message}`);
      return this.buscarUsuariosOrgao(orgaoId);
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
    const destinatarios = await this.buscarAprovadoresOrgao(contrato.orgao_id);
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

    // Filtrar itens válidos
    const itensValidos = itens.filter(i => i.descricao && i.descricao.trim() !== '');
    // Base da discriminação: valor da NF quando disponível, senão valor medido
    const valorBaseDiscriminacao = Number(medicao.nota_fiscal_valor) || Number(medicao.valor_medido) || 0;
    const valoresFinais = this.normalizarValoresDiscriminacoes(itensValidos, valorBaseDiscriminacao);

    // Inserir novas
    const novas: DiscriminacaoDespesaMedicao[] = [];
    for (let i = 0; i < itensValidos.length; i++) {
      const item = itensValidos[i];
      const disc = this.discriminacaoRepository.create({
        medicao_id: medicaoId,
        numero_item: i + 1,
        descricao: item.descricao.trim(),
        valor: valoresFinais[i],
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
   * Lista assinaturas digitais registradas para uma medição.
   */
  async listarAssinaturasMedicao(medicaoId: string): Promise<any[]> {
    return this.assinaturaDigitalRepository.find({
      where: { entidade_tipo: EntidadeTipo.MEDICAO, entidade_id: medicaoId },
      order: { data_assinatura: 'ASC' },
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

    const itensValidos = itens.filter(i => i.descricao && i.descricao.trim() !== '');
    // Base da discriminação: valor da NF quando disponível, senão valor medido
    const valorBaseDiscriminacao = Number(medicao.nota_fiscal_valor) || Number(medicao.valor_medido) || 0;
    const valoresFinais = this.normalizarValoresDiscriminacoes(itensValidos, valorBaseDiscriminacao);

    // Inserir novas com registro de correção
    const novas: DiscriminacaoDespesaMedicao[] = [];
    for (let i = 0; i < itensValidos.length; i++) {
      const item = itensValidos[i];
      const disc = this.discriminacaoRepository.create({
        medicao_id: medicaoId,
        numero_item: i + 1,
        descricao: item.descricao.trim(),
        valor: valoresFinais[i],
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

  private normalizarValoresDiscriminacoes(
    itens: { descricao: string; valor: number; percentual: number }[],
    valorBruto: number,
  ): number[] {
    const somaPercentuais = itens.reduce((s, i) => s + (Number(i.percentual) || 0), 0);
    const somaValores = itens.reduce((s, i) => s + (Number(i.valor) || 0), 0);
    const percentuaisSomam100 = Math.abs(somaPercentuais - 100) < 0.05;
    const valorAlvo = percentuaisSomam100 && valorBruto > 0 ? valorBruto : Math.round(somaValores * 100) / 100;

    const exatos = itens.map(i => {
      const perc = Number(i.percentual) || 0;
      return percentuaisSomam100 && valorBruto > 0
        ? (perc / 100) * valorAlvo
        : Number(i.valor) || 0;
    });

    const floorsCentavos = exatos.map(v => Math.floor(v * 100));
    const restos = exatos.map((v, i) => ({ idx: i, resto: (v * 100) - Math.floor(v * 100) }));
    const somaFloorsCentavos = floorsCentavos.reduce((s, v) => s + v, 0);
    const alvoCentavos = Math.round(valorAlvo * 100);
    const centavosExtra = Math.max(0, alvoCentavos - somaFloorsCentavos);

    restos.sort((a, b) => b.resto - a.resto);
    const valoresCentavos = [...floorsCentavos];
    for (let k = 0; k < centavosExtra && k < restos.length; k++) {
      valoresCentavos[restos[k].idx] += 1;
    }

    return valoresCentavos.map(v => v / 100);
  }

  /**
   * Corrige campos do cabeçalho da medição (competência, período, nota fiscal).
   * Limpa boletim_pdf_url para forçar regeneração do PDF na próxima consulta.
   */
  async corrigirCabecalho(
    medicaoId: string,
    dados: {
      competencia?: string;
      periodo_inicio?: string;
      periodo_fim?: string;
      valor_medido?: number | null;
      nota_fiscal_numero?: string;
      nota_fiscal_valor?: number | null;
      nota_fiscal_data?: string | null;
      objeto_contrato?: string;
    },
    fiscalId: string,
    fiscalNome: string,
    orgaoId: string,
  ): Promise<Medicao> {
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
      relations: ['contrato'],
    });
    if (!medicao) throw new NotFoundException('Medição não encontrada');
    if (medicao.contrato && medicao.contrato.orgao_id !== orgaoId) {
      throw new ForbiddenException('Você não tem permissão para corrigir esta medição');
    }

    const updates: Partial<Medicao> = {};
    if (dados.competencia !== undefined) updates.competencia = dados.competencia.trim() || null;
    if (dados.periodo_inicio !== undefined) updates.periodo_inicio = new Date(dados.periodo_inicio) as any;
    if (dados.periodo_fim !== undefined) updates.periodo_fim = new Date(dados.periodo_fim) as any;
    if (dados.valor_medido !== undefined) updates.valor_medido = dados.valor_medido as any;
    if (dados.nota_fiscal_numero !== undefined) updates.nota_fiscal_numero = dados.nota_fiscal_numero || null;
    if (dados.nota_fiscal_valor !== undefined) updates.nota_fiscal_valor = dados.nota_fiscal_valor as any;
    if (dados.nota_fiscal_data !== undefined) updates.nota_fiscal_data = dados.nota_fiscal_data ? new Date(dados.nota_fiscal_data) as any : null;
    // Limpa o PDF para forçar regeneração
    updates.boletim_pdf_url = null;

    // Atualiza objeto do contrato se fornecido
    if (dados.objeto_contrato !== undefined && medicao.contrato) {
      await this.contratoRepository.update(medicao.contrato.id, { objeto: dados.objeto_contrato });
    }

    await this.medicaoRepository.update(medicaoId, updates);
    this.logger.log(`Cabeçalho corrigido por ${fiscalNome} na medição ${medicaoId}`);
    return this.medicaoRepository.findOne({ where: { id: medicaoId } });
  }

  /**
   * Atualiza o JSON execucao_fiscal de uma medição (corrige vigência e dias calculados).
   */
  async corrigirExecucaoFiscal(
    medicaoId: string,
    dados: {
      vigencia_inicio?: string;
      vigencia_fim?: string;
      dias_executados?: number;
      dias_restantes?: number;
      meses_executados?: number;
      dias_executados_extra?: number;
      meses_restantes?: number;
      dias_restantes_extra?: number;
      item_overrides?: Array<{ item_cronograma_id: string; no_periodo?: number; ate_periodo?: number; a_executar?: number; descricao?: string; unidade?: string }>;
    },
    orgaoId: string,
  ): Promise<Medicao> {
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
      relations: ['contrato'],
    });
    if (!medicao) throw new NotFoundException('Medição não encontrada');
    if (medicao.contrato && medicao.contrato.orgao_id !== orgaoId) {
      throw new ForbiddenException('Você não tem permissão para corrigir esta medição');
    }

    const efAtual: any = medicao.execucao_fiscal || {};
    const efNovo: any = {
      ...efAtual,
      ...(dados.vigencia_inicio !== undefined ? { vigencia_inicio: dados.vigencia_inicio } : {}),
      ...(dados.vigencia_fim !== undefined ? { vigencia_fim: dados.vigencia_fim } : {}),
      ...(dados.dias_executados !== undefined ? { dias_executados: dados.dias_executados } : {}),
      ...(dados.dias_restantes !== undefined ? { dias_restantes: dados.dias_restantes } : {}),
      ...(dados.meses_executados !== undefined ? { meses_executados: dados.meses_executados } : {}),
      ...(dados.dias_executados_extra !== undefined ? { dias_executados_extra: dados.dias_executados_extra } : {}),
      ...(dados.meses_restantes !== undefined ? { meses_restantes: dados.meses_restantes } : {}),
      ...(dados.dias_restantes_extra !== undefined ? { dias_restantes_extra: dados.dias_restantes_extra } : {}),
    };
    if (dados.item_overrides !== undefined) {
      efNovo.item_overrides = dados.item_overrides;
    }

    await this.medicaoRepository.update(medicaoId, { execucao_fiscal: efNovo, boletim_pdf_url: null });
    this.logger.log(`Execução fiscal corrigida manualmente na medição ${medicaoId}`);
    return this.medicaoRepository.findOne({ where: { id: medicaoId } });
  }

  /**
   * Força a regeneração do boletim PDF, descartando o arquivo anterior.
   */
  async regenerarBoletim(medicaoId: string, orgaoId: string): Promise<{ pdf_url: string; filename: string }> {
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
      relations: ['contrato'],
    });
    if (!medicao) throw new NotFoundException('Medição não encontrada');
    if (medicao.contrato && medicao.contrato.orgao_id !== orgaoId) {
      throw new ForbiddenException('Você não tem permissão para regenerar o boletim desta medição');
    }

    // Apaga PDF antigo do disco e limpa URL no banco
    const filePath = this.getBoletimPdfPath(medicaoId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    await this.medicaoRepository.update(medicaoId, { boletim_pdf_url: null });

    return this.gerarPdfOficialMedicao(medicaoId);
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
  /**
   * Calcula execução financeira para o FORNECEDOR (sem validar orgaoId).
   * Retorna valores por item e totais.
   * 
   * Estrutura de retorno:
   * {
   *   contrato_id: string,
   *   itens: [{
   *     etapa_id: string,
   *     no_periodo: number,
   *     ate_periodo: number,
   *     a_executar: number
   *   }],
   *   totais: {
   *     valor_previsto: number,
   *     no_periodo: number,
   *     ate_periodo: number,
   *     a_executar: number
   *   },
   *   execucao_fiscal: {...}
   * }
   */
  async calcularExecucaoFinanceiraFornecedor(contratoId: string, medicaoId?: string): Promise<any> {
    const contrato = await this.contratoRepository.findOne({ where: { id: contratoId } });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');

    const usarItensCronograma = await this.usarItensCronograma(contratoId);

    const etapas = usarItensCronograma
      ? []
      : await this.etapaRepository.find({
          where: { contrato_id: contratoId },
          order: { numero_etapa: 'ASC' },
        });

    const itensCronograma = usarItensCronograma
      ? await this.itemCronogramaRepository.find({
          where: { contrato_id: contratoId },
          order: { numero_item: 'ASC' },
        })
      : [];
    
    

    // Buscar todas as medições aprovadas
    const medicoesAprovadas = await this.medicaoRepository.find({
      where: { contrato_id: contratoId, status: StatusMedicao.APROVADA },
      order: { numero_medicao: 'ASC' },
    });

    // Buscar a medição atual (se informada)
    let medicaoAtual = null;
    if (medicaoId) {
      medicaoAtual = await this.medicaoRepository.findOne({
        where: { id: medicaoId },
      });
    } else if (medicoesAprovadas.length > 0) {
      medicaoAtual = medicoesAprovadas[medicoesAprovadas.length - 1];
    }

    const itensPorMedicao: Record<string, any[]> = {};
    for (const m of medicoesAprovadas) {
      const itens = usarItensCronograma
        ? await this.itemMedicaoItemRepository.find({
            where: { medicao_id: m.id },
            relations: ['itemCronograma'],
          })
        : await this.itemMedicaoRepository.find({
            where: { medicao_id: m.id },
          });
      itensPorMedicao[m.id] = itens;
    }

    let itensMedicaoAtual: any[] = [];
    if (medicaoAtual && medicaoAtual.status !== StatusMedicao.APROVADA) {
      itensMedicaoAtual = usarItensCronograma
        ? await this.itemMedicaoItemRepository.find({
            where: { medicao_id: medicaoAtual.id },
            relations: ['itemCronograma'],
          })
        : await this.itemMedicaoRepository.find({
            where: { medicao_id: medicaoAtual.id },
          });
    }

    const boletimPorQuantidade = !!(contrato as any).boletim_por_quantidade && usarItensCronograma;

    const obterQuantidadeItemMedicao = (itemMedicao: any): number =>
      Number(itemMedicao?.quantidade_medida) || 0;

    // Calcular execução por etapa/item
    const resultado = usarItensCronograma
      ? itensCronograma.map((item) => {
          const valorPrevisto = Number(item.valor_total) || (Number(item.valor_unitario) * Number(item.quantidade)) || 0;
          const quantidadeTotal = quantidadeFisicaTotalContratada(item);
          const unidadeMedida = (item as any).unidade_medida || 'UNIDADE';

          const obterValorBrutoItemMedicao = (itemMedicao: any): number => {
            // Prioriza o valor_medido armazenado no item (calculado na criação com precisão correta).
            // Isso garante que execucao_financeira.no_periodo seja idêntico ao valor_medido da medição,
            // independente de arredondamentos de quantidade_medida (ex.: itens MENSAL com fator 11/30).
            const valorArmazenado = Number(itemMedicao?.valor_medido);
            if (Number.isFinite(valorArmazenado) && valorArmazenado > 0) {
              return valorArmazenado;
            }
            // Fallback para itens sem valor_medido: usa truncarMoedaReais2Casas (igual à criação)
            const quantidadeMedida = Number(itemMedicao?.quantidade_medida) || 0;
            const valorUnitario = Number(itemMedicao?.itemCronograma?.valor_unitario ?? item.valor_unitario) || 0;
            if (quantidadeMedida > 0 && valorUnitario > 0) {
              return truncarMoedaReais2Casas(quantidadeMedida * valorUnitario);
            }
            return 0;
          };

          // Acumular em centavos para evitar drift de ponto flutuante ao somar medições
          let centAnterior = 0;
          for (const m of medicoesAprovadas) {
            if (medicaoAtual && m.id === medicaoAtual.id) continue;
            const itensM = itensPorMedicao[m.id] || [];
            const itemMedicao = itensM.find(i => (i as any).item_cronograma_id === item.id);
            if (itemMedicao) {
              centAnterior += Math.round(obterValorBrutoItemMedicao(itemMedicao) * 100);
            }
          }

          let centNoPeriodo = 0;
          let quantidadeNoPeriodo = 0;
          if (medicaoAtual) {
            const itensFonte = medicaoAtual.status === StatusMedicao.APROVADA
              ? (itensPorMedicao[medicaoAtual.id] || [])
              : itensMedicaoAtual;
            const itemMedicao = itensFonte.find((i: any) => i.item_cronograma_id === item.id);
            if (itemMedicao) {
              centNoPeriodo = Math.round(obterValorBrutoItemMedicao(itemMedicao) * 100);
              quantidadeNoPeriodo = obterQuantidadeItemMedicao(itemMedicao);
            }
          }

          const centAtePeriodo = centAnterior + centNoPeriodo;
          const noPeriodo = centavosParaReaisTrunc2(centNoPeriodo);
          const atePeriodo = centavosParaReaisTrunc2(centAtePeriodo);
          const aExecutar = truncarMoedaReais2Casas(Math.max(0, valorPrevisto - atePeriodo));
          const quantidadeMedidaItem = Number(item.quantidade_medida) || 0;
          const quantidadeAtePeriodo = quantidadeMedidaItem + quantidadeNoPeriodo;
          const quantidadeAExecutar = Math.max(0, quantidadeTotal - quantidadeAtePeriodo);

          const base: any = {
            etapa_id: item.id,
            numero_etapa: item.numero_item,
            descricao: item.descricao,
            valor_previsto: truncarMoedaReais2Casas(valorPrevisto),
            percentual_fisico: 0,
            no_periodo: noPeriodo,
            ate_periodo: atePeriodo,
            a_executar: aExecutar,
          };
          if (boletimPorQuantidade) {
            base.unidade_medida = unidadeMedida;
            base.quantidade_no_periodo = Math.round(quantidadeNoPeriodo * 100) / 100;
            base.quantidade_ate_periodo = Math.round(quantidadeAtePeriodo * 100) / 100;
            base.quantidade_a_executar = Math.round(quantidadeAExecutar * 100) / 100;
          }
          return base;
        })
      : etapas.map((etapa) => {
          const valorPrevisto = Number(etapa.valor_previsto) || 0;

          let valorAnterior = 0;
          for (const m of medicoesAprovadas) {
            if (medicaoAtual && m.id === medicaoAtual.id) continue;
            const itensM = itensPorMedicao[m.id] || [];
            const itemEtapa = itensM.find(i => i.etapa_id === etapa.id);
            if (itemEtapa) {
              valorAnterior += Number(itemEtapa.valor_medido) || 0;
            }
          }

          let noPeriodo = 0;
          if (medicaoAtual) {
            if (medicaoAtual.status === StatusMedicao.APROVADA) {
              const itensM = itensPorMedicao[medicaoAtual.id] || [];
              const itemEtapa = itensM.find(i => i.etapa_id === etapa.id);
              if (itemEtapa) {
                noPeriodo = Number(itemEtapa.valor_medido) || 0;
              }
            } else {
              const itemEtapa = itensMedicaoAtual.find(i => i.etapa_id === etapa.id);
              if (itemEtapa) {
                noPeriodo = Number(itemEtapa.valor_medido) || 0;
              }
            }
          }

          const atePeriodo = valorAnterior + noPeriodo;
          const aExecutar = Math.max(0, valorPrevisto - atePeriodo);

          return {
            etapa_id: etapa.id,
            numero_etapa: etapa.numero_etapa,
            descricao: etapa.descricao,
            valor_previsto: truncarMoedaReais2Casas(valorPrevisto),
            percentual_fisico: Number(etapa.percentual_fisico) || 0,
            no_periodo: truncarMoedaReais2Casas(noPeriodo),
            ate_periodo: truncarMoedaReais2Casas(atePeriodo),
            a_executar: truncarMoedaReais2Casas(aExecutar),
          };
        });

    // Calcular execução temporal (fiscal) - usando ano comercial de 360 dias (12 meses x 30 dias)
    // Quando boletim_por_quantidade, não calcular execução em dias
    const vigenciaInicio = contrato.data_vigencia_inicio
      ? new Date(contrato.data_vigencia_inicio as any)
      : null;
    const vigenciaFim = contrato.data_vigencia_fim
      ? new Date(contrato.data_vigencia_fim as any)
      : null;

    let execucaoFiscal: any = null;
    if (!boletimPorQuantidade && vigenciaInicio && vigenciaFim) {
      // Para execução temporal, usar data final da medição atual se existir, senão data atual
      let dataReferencia = new Date();
      
      // Se temos uma medição, usar o período_fim dela como referência
      if (medicaoAtual && medicaoAtual.periodo_fim) {
        dataReferencia = new Date(medicaoAtual.periodo_fim);
        console.log('Usando data da medição:', dataReferencia.toISOString());
      } else {
        console.log('Usando data atual do servidor:', dataReferencia.toISOString());
      }
      
      // Para ano comercial: total sempre 360 dias para contratos anuais
      const totalDias = 360;
      
      // Calcular dias executados usando ano comercial (360 dias).
      // Regra: dia 31 (e fev 29/28) = dia 30 — clipa dia2 ANTES de subtrair.
      const calcularDiasComercial = (inicio: Date, fim: Date): number => {
        const ano1 = inicio.getUTCFullYear();
        const mes1 = inicio.getUTCMonth();
        const dia1 = inicio.getUTCDate();

        const ano2 = fim.getUTCFullYear();
        const mes2 = fim.getUTCMonth();
        const dia2 = fim.getUTCDate();

        // No calendário comercial o mês tem sempre 30 dias: clipa dia2 a 30
        const dia2Com = Math.min(dia2, 30);

        let dias = 0;

        if (ano1 === ano2 && mes1 === mes2) {
          dias = dia2Com - dia1 + 1;
        } else {
          const diasPrimeiroMes = Math.min(30 - dia1 + 1, 30);

          let mesesCompletos = 0;
          if (ano2 > ano1 || mes2 > mes1 + 1) {
            mesesCompletos = (ano2 - ano1) * 12 + (mes2 - mes1 - 1);
          }

          dias = diasPrimeiroMes + (mesesCompletos * 30) + dia2Com;
        }

        return Math.min(dias, 360);
      };
      
      const diasExecutados = calcularDiasComercial(vigenciaInicio, dataReferencia);
      const diasRestantes = Math.max(0, totalDias - diasExecutados);
      
      // Usar ano comercial: 12 meses de 30 dias = 360 dias
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
        ano_comercial: true, // Flag para indicar uso de ano comercial
      };
    }

    // Totais
    const totalNoPeriodo = resultado.reduce((s, r) => s + r.no_periodo, 0);
    const totalAtePeriodo = resultado.reduce((s, r) => s + r.ate_periodo, 0);
    const totalPrevisto = resultado.reduce((s, r) => s + r.valor_previsto, 0);
    const ajusteMigracao = Number(contrato.valor_executado_anterior) || 0;
    const totalAtePeriodoComAjuste = totalAtePeriodo + ajusteMigracao;
    const totalAExecutar = Math.max(0, totalPrevisto - totalAtePeriodoComAjuste);
    const totalAtePeriodoGlobalExibicao = Math.min(totalPrevisto, totalAtePeriodoComAjuste);
    const ajusteGlobalParaDistribuir = totalAtePeriodoGlobalExibicao - totalAtePeriodo;

    const baseRateio = resultado.map((item) => ({
      valor_previsto: Number(item.valor_previsto) || 0,
    }));
    const totalBaseRateio = baseRateio.reduce((s, item) => s + item.valor_previsto, 0);
    let ajusteRateadoAcumulado = 0;

    const resultadoComVisoes = resultado.map((item, index) => {
      const valorPrevistoItem = Number(item.valor_previsto) || 0;
      const proporcao = totalBaseRateio > 0 ? valorPrevistoItem / totalBaseRateio : 0;
      const ajusteRateado = index === resultado.length - 1
        ? ajusteGlobalParaDistribuir - ajusteRateadoAcumulado
        : Math.round((ajusteGlobalParaDistribuir * proporcao) * 100) / 100;
      ajusteRateadoAcumulado += ajusteRateado;

      const noPeriodoItem = Number(item.no_periodo) || 0;
      const atePeriodoItem = Number(item.ate_periodo) || 0;
      const aExecutarItem = Number(item.a_executar) || 0;
      const atePeriodoGlobal = atePeriodoItem + ajusteRateado;
      const aExecutarGlobal = Math.max(0, valorPrevistoItem - atePeriodoGlobal);

      return {
        ...item,
        no_periodo: noPeriodoItem,
        ate_periodo: atePeriodoItem,
        a_executar: aExecutarItem,
        no_periodo_item: noPeriodoItem,
        ate_periodo_item: atePeriodoItem,
        a_executar_item: aExecutarItem,
        no_periodo_global: noPeriodoItem,
        ate_periodo_global: atePeriodoGlobal,
        a_executar_global: aExecutarGlobal,
      };
    });

    return {
      contrato_id: contratoId,
      itens: resultadoComVisoes,
      totais: {
        valor_previsto: totalPrevisto,
        no_periodo: totalNoPeriodo,
        ate_periodo: totalAtePeriodoGlobalExibicao,
        a_executar: Math.max(0, totalPrevisto - totalAtePeriodoGlobalExibicao),
      },
      ajuste_migracao: Math.round(ajusteMigracao * 100) / 100,
      execucao_fiscal: execucaoFiscal,
      execucao_fiscal_por_quantidade: boletimPorQuantidade,
      medicao_referencia: medicaoAtual ? {
        id: medicaoAtual.id,
        numero_medicao: medicaoAtual.numero_medicao,
        periodo_inicio: medicaoAtual.periodo_inicio,
        periodo_fim: medicaoAtual.periodo_fim,
      } : null,
    };
  }

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
        valor_previsto: truncarMoedaReais2Casas(valorPrevisto),
        percentual_fisico: Number(etapa.percentual_fisico) || 0,
        // Execução financeira — truncar em 2 casas (não arredondar)
        no_periodo: truncarMoedaReais2Casas(noPeriodo),
        ate_periodo: truncarMoedaReais2Casas(atePeríodo),
        a_executar: truncarMoedaReais2Casas(aExecutar),
      };
    });

    // Calcular execução temporal (fiscal) - usando ano comercial de 360 dias (12 meses x 30 dias)
    const vigenciaInicio = contrato.data_vigencia_inicio
      ? new Date(contrato.data_vigencia_inicio as any)
      : null;
    const vigenciaFim = contrato.data_vigencia_fim
      ? new Date(contrato.data_vigencia_fim as any)
      : null;

    let execucaoFiscal: any = null;
    if (vigenciaInicio && vigenciaFim) {
      // Para execução temporal, usar data final da medição atual se existir, senão data atual
      let dataReferencia = new Date();
      
      // Se temos uma medição, usar o período_fim dela como referência
      if (medicaoAtual && medicaoAtual.periodo_fim) {
        dataReferencia = new Date(medicaoAtual.periodo_fim);
        console.log('Usando data da medição:', dataReferencia.toISOString());
      } else {
        console.log('Usando data atual do servidor:', dataReferencia.toISOString());
      }
      
      // Para ano comercial: total sempre 360 dias para contratos anuais
      const totalDias = 360;
      
      // Calcular dias executados usando ano comercial com UTC para evitar timezone issues
      let diasExecutados = 0;
      
      if (dataReferencia >= vigenciaInicio) {
        const dataFimExecucao = dataReferencia > vigenciaFim ? vigenciaFim : dataReferencia;
        
        // Usar métodos UTC para evitar problemas de timezone
        const anoInicio = vigenciaInicio.getUTCFullYear();
        const mesInicio = vigenciaInicio.getUTCMonth();
        const diaInicio = vigenciaInicio.getUTCDate();
        
        const anoFim = dataFimExecucao.getUTCFullYear();
        const mesFim = dataFimExecucao.getUTCMonth();
        const diaFim = dataFimExecucao.getUTCDate();
        
        // Se mesmo mês
        if (anoInicio === anoFim && mesInicio === mesFim) {
          diasExecutados = Math.min(diaFim - diaInicio + 1, 30);
        } else {
          // Dias no primeiro mês (ano comercial)
          const diasPrimeiroMes = Math.min(30 - diaInicio + 1, 30);
          
          // Meses completos no meio
          let mesesCompletos = 0;
          if (anoFim > anoInicio || mesFim > mesInicio + 1) {
            mesesCompletos = (anoFim - anoInicio) * 12 + (mesFim - mesInicio - 1);
          }
          
          // Dias no último mês (ano comercial)
          const diasUltimoMes = Math.min(diaFim, 30);
          
          diasExecutados = diasPrimeiroMes + (mesesCompletos * 30) + diasUltimoMes;
        }
        
        // Limitar a 360 dias
        diasExecutados = Math.min(diasExecutados, 360);
      }
      
      const diasRestantes = 360 - diasExecutados;

      // Usar ano comercial: 12 meses de 30 dias = 360 dias
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
        ano_comercial: true, // Flag para indicar uso de ano comercial
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

  // ============================================================================
  // ASSINATURA DIGITAL DO BOLETIM DE MEDIÇÃO
  // ============================================================================

  /**
   * Registra uma assinatura digital para o Boletim de Medição.
   * Retorna o código de validação para inclusão no PDF.
   * Usa o mesmo módulo de assinaturas das OS/OF.
   */
  async registrarAssinaturaMedicao(
    medicaoId: string,
    dados: {
      orgao_id?: string;
      papel: 'FORNECEDOR' | 'FISCAL' | 'GESTOR';
      usuario_id?: string;
      usuario_nome: string;
      usuario_cpf_cnpj: string;
      usuario_cargo?: string;
      usuario_matricula?: string;
      usuario_portaria?: string;
      ip_address?: string;
      user_agent?: string;
    },
  ): Promise<{ codigo_validacao: string; codigo_formatado: string; data_assinatura: Date }> {
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
      relations: ['contrato'],
    });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    // Resolve orgao_id from the medição's contract when not provided (e.g. fornecedor users)
    const orgaoId = dados.orgao_id || (medicao as any).contrato?.orgao_id || '';

    const papelMap: Record<string, PapelAssinante> = {
      FORNECEDOR: PapelAssinante.FORNECEDOR,
      FISCAL: PapelAssinante.FISCAL,
      GESTOR: PapelAssinante.GESTOR,
    };

    const assinatura = await this.assinaturasService.registrarAssinatura({
      orgao_id: orgaoId,
      entidade_tipo: EntidadeTipo.MEDICAO,
      entidade_id: medicaoId,
      papel_assinante: papelMap[dados.papel] || PapelAssinante.FORNECEDOR,
      usuario_id: dados.usuario_id,
      usuario_nome: dados.usuario_nome,
      usuario_cpf_cnpj: dados.usuario_cpf_cnpj,
      usuario_cargo: dados.usuario_cargo,
      usuario_matricula: dados.usuario_matricula,
      usuario_portaria: dados.usuario_portaria,
      ip_address: dados.ip_address,
      user_agent: dados.user_agent,
    });

    this.logger.log(`Assinatura registrada para medição ${medicaoId} — código: ${assinatura.codigo_validacao}`);

    return {
      codigo_validacao: assinatura.codigo_validacao,
      codigo_formatado: this.assinaturasService.formatarCodigoValidacao(assinatura.codigo_validacao),
      data_assinatura: assinatura.data_assinatura,
    };
  }

  // =========================================================
  // OTP — Assinatura Digital para Boletim de Medição
  // =========================================================

  /**
   * Solicita envio de OTP para o fornecedor via WhatsApp e/ou email.
   * Retorna os canais utilizados e dados mascarados.
   */
  async solicitarOtpAssinaturaMedicao(
    medicaoId: string,
    fornecedorId: string,
  ): Promise<{
    canais_enviados: string[];
    telefone_mascarado?: string;
    email_mascarado?: string;
  }> {
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
      relations: ['contrato'],
    });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    const contrato = medicao.contrato || await this.contratoRepository.findOne({ where: { id: medicao.contrato_id } });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');

    if (contrato.fornecedor_id !== fornecedorId) {
      throw new ForbiddenException('Você não tem permissão para assinar esta medição');
    }

    const fornecedor = await this.fornecedorRepository.findOne({ where: { id: fornecedorId } });
    if (!fornecedor) throw new NotFoundException('Fornecedor não encontrado');

    const orgaoId = contrato.orgao_id || '';
    const usuarioNome = fornecedor.razao_social || fornecedor.nome_fantasia || '';

    // Gerar código OTP único para ambos os canais
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();

    const canaisEnviados: string[] = [];
    let telefoneMascarado: string | undefined;
    let emailMascarado: string | undefined;

    // Enviar via WhatsApp
    const telefone = fornecedor.representante_whatsapp || fornecedor.representante_telefone || fornecedor.telefone || '';
    if (telefone && telefone.replace(/\D/g, '').length >= 10) {
      try {
        const telefoneLimpo = telefone.replace(/\D/g, '');

        // Salvar no cache de WhatsApp
        (this.assinaturasService as any).otpCache?.set(`otp_${orgaoId}_${telefoneLimpo}`, {
          codigo,
          expiracao: Date.now() + 5 * 60 * 1000,
          tentativas: 0,
        });

        // Enviar via WhatsApp
        const mensagem = `Olá, *${usuarioNome}*.\n\nSeu código de confirmação para *Assinatura do Boletim de Medição* no Portal DCP é: *${codigo}*\n\nEste código expira em 5 minutos. Não o compartilhe com ninguém.`;
        const whatsappEnviado = await (this.assinaturasService as any).whatsappService.enviar(orgaoId, {
          to: telefoneLimpo,
          mensagem,
        });

        if (whatsappEnviado) {
          canaisEnviados.push('whatsapp');
          telefoneMascarado = telefoneLimpo.replace(/^(.{2})(.*)(.{4})$/, '$1***$3');
          this.logger.log(`OTP WhatsApp enviado para medição ${medicaoId}: ${telefoneMascarado}`);
        } else {
          (this.assinaturasService as any).otpCache?.delete(`otp_${orgaoId}_${telefoneLimpo}`);
          this.logger.warn(`WhatsApp configurado mas não confirmou envio do OTP para medição ${medicaoId}`);
        }
      } catch (err) {
        this.logger.warn(`Falha ao enviar OTP WhatsApp para medição ${medicaoId}: ${err.message}`);
      }
    }

    // Enviar via Email
    const email = fornecedor.representante_email || fornecedor.email || '';
    if (email && email.includes('@')) {
      try {
        await this.assinaturasService.solicitarOtpEmail(orgaoId, email, usuarioNome, codigo);
        canaisEnviados.push('email');
        emailMascarado = email.replace(/^(.)(.*)(@.*)$/, '$1***$3');
      } catch (err) {
        this.logger.warn(`Falha ao enviar OTP email para medição ${medicaoId}: ${err.message}`);
      }
    }

    if (canaisEnviados.length === 0) {
      throw new BadRequestException(
        'Não foi possível enviar o código de verificação. Verifique se o fornecedor possui email ou WhatsApp cadastrado.',
      );
    }

    // Também salvar no cache genérico por medicaoId (para validação flexível)
    (this.assinaturasService as any).otpCache?.set(`otp_medicao_${medicaoId}`, {
      codigo,
      expiracao: Date.now() + 5 * 60 * 1000,
      tentativas: 0,
    });

    this.logger.log(`OTP enviado para medição ${medicaoId} via: ${canaisEnviados.join(', ')}`);

    return { canais_enviados: canaisEnviados, telefone_mascarado: telefoneMascarado, email_mascarado: emailMascarado };
  }

  /**
   * Valida OTP, registra assinatura digital e submete a medição.
   */
  async validarOtpAssinaturaMedicao(
    medicaoId: string,
    fornecedorId: string,
    codigoOtp: string,
  ): Promise<{
    sucesso: boolean;
    codigo_validacao: string;
    codigo_formatado: string;
    pdf_url: string;
  }> {
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
      relations: ['contrato'],
    });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    const contrato = medicao.contrato || await this.contratoRepository.findOne({ where: { id: medicao.contrato_id } });
    if (contrato && contrato.fornecedor_id !== fornecedorId) {
      throw new ForbiddenException('Você não tem permissão para assinar esta medição');
    }

    const fornecedor = await this.fornecedorRepository.findOne({ where: { id: fornecedorId } });
    if (!fornecedor) throw new NotFoundException('Fornecedor não encontrado');

    // Tentar validar pelo cache genérico por medicaoId
    const cacheKeyMedicao = `otp_medicao_${medicaoId}`;
    const otpMedicao = (this.assinaturasService as any).otpCache?.get(cacheKeyMedicao);

    let otpValido = false;
    if (otpMedicao && otpMedicao.expiracao > Date.now() && otpMedicao.codigo === codigoOtp) {
      otpValido = true;
      (this.assinaturasService as any).otpCache?.delete(cacheKeyMedicao);
    }

    if (!otpValido) {
      // Tentar validar via email ou WhatsApp
      const orgaoId = contrato?.orgao_id || '';
      const email = fornecedor.representante_email || fornecedor.email || '';
      const telefone = (fornecedor.representante_whatsapp || fornecedor.representante_telefone || fornecedor.telefone || '').replace(/\D/g, '');

      try {
        if (email) await this.assinaturasService.validarOtpEmail(orgaoId, email, codigoOtp);
        otpValido = true;
      } catch {
        try {
          if (telefone) await this.assinaturasService.validarOtp(orgaoId, telefone, codigoOtp);
          otpValido = true;
        } catch { /* nenhum canal validou */ }
      }
    }

    if (!otpValido) {
      throw new BadRequestException('Código incorreto ou expirado. Solicite um novo código.');
    }

    // Registrar assinatura digital
    const assinatura = await this.registrarAssinaturaMedicao(medicaoId, {
      orgao_id: contrato?.orgao_id || '',
      papel: 'FORNECEDOR',
      usuario_nome: fornecedor.razao_social || fornecedor.nome_fantasia || '',
      usuario_cpf_cnpj: fornecedor.cpf_cnpj || '',
      usuario_cargo: 'Fornecedor / Contratado',
    });

    // Submeter a medição (se ainda não submetida)
    if (medicao.status === StatusMedicao.RASCUNHO || medicao.status === StatusMedicao.DEVOLVIDA) {
      try {
        await this.submeterMedicao(medicaoId, fornecedorId);
      } catch (err) {
        this.logger.warn(`Assinatura OK mas falha ao submeter medição ${medicaoId}: ${err.message}`);
        throw err;
      }
    }

    const medicaoAtualizada = await this.medicaoRepository.findOne({ where: { id: medicaoId } });

    this.logger.log(`Medição ${medicaoId} assinada e submetida com OTP pelo fornecedor ${fornecedorId}`);

    return {
      sucesso: true,
      codigo_validacao: assinatura.codigo_validacao,
      codigo_formatado: assinatura.codigo_formatado,
      pdf_url: medicaoAtualizada?.boletim_pdf_url || '',
    };
  }

  // =========================================================
  // OTP — Assinatura Digital do Fiscal via WhatsApp
  // =========================================================

  /**
   * Envia OTP via WhatsApp para um número informado pelo usuário.
   * Usado pelo fiscal para assinar digitalmente o boletim.
   */
  async solicitarOtpAssinaturaFiscal(
    medicaoId: string,
    telefone: string,
  ): Promise<{ telefone_mascarado: string }> {
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
      relations: ['contrato'],
    });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    const contrato = medicao.contrato
      || await this.contratoRepository.findOne({ where: { id: medicao.contrato_id } });

    const orgaoId = contrato?.orgao_id || '';
    const telefoneLimpo = telefone.replace(/\D/g, '');

    if (telefoneLimpo.length < 10) {
      throw new BadRequestException('Número de WhatsApp inválido.');
    }

    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const cacheKey = `otp_fiscal_${medicaoId}`;

    (this.assinaturasService as any).otpCache?.set(cacheKey, {
      codigo,
      telefone: telefoneLimpo,
      expiracao: Date.now() + 5 * 60 * 1000,
      tentativas: 0,
    });

    // Também registrar no cache por telefone para compatibilidade com validarOtp
    (this.assinaturasService as any).otpCache?.set(`otp_${orgaoId}_${telefoneLimpo}`, {
      codigo,
      expiracao: Date.now() + 5 * 60 * 1000,
      tentativas: 0,
    });

    const mensagem = `Seu código de confirmação para *Assinatura do Boletim de Medição* no Portal DCP é: *${codigo}*\n\nEste código expira em 5 minutos. Não o compartilhe com ninguém.`;

    try {
      await (this.assinaturasService as any).whatsappService.enviar(orgaoId, {
        to: telefoneLimpo,
        mensagem,
      });
    } catch (err) {
      this.logger.warn(`Falha ao enviar OTP fiscal via WhatsApp para medição ${medicaoId}: ${err.message}`);
      throw new BadRequestException('Não foi possível enviar o código. Verifique o número de WhatsApp.');
    }

    const telefoneMascarado = telefoneLimpo.replace(/^(.{2})(.*)(.{4})$/, '$1***$3');
    this.logger.log(`OTP fiscal enviado para medição ${medicaoId}: ${telefoneMascarado}`);

    return { telefone_mascarado: telefoneMascarado };
  }

  /**
   * Envia OTP via WhatsApp para o telefone do fornecedor do contrato.
   * Usado quando o órgão cria a medição (caso excepcional): a assinatura deve ser do fornecedor.
   */
  async solicitarOtpAssinaturaFornecedor(medicaoId: string): Promise<{ telefone_mascarado: string; fornecedor_nome: string }> {
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
      relations: ['contrato', 'contrato.fornecedor'],
    });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    const contrato = medicao.contrato
      || await this.contratoRepository.findOne({ where: { id: medicao.contrato_id }, relations: ['fornecedor'] });
    if (!contrato?.fornecedor_id) throw new BadRequestException('Contrato sem fornecedor cadastrado');

    const fornecedor = (contrato as any).fornecedor
      || await this.fornecedorRepository.findOne({ where: { id: contrato.fornecedor_id } });
    if (!fornecedor) throw new NotFoundException('Fornecedor não encontrado');

    const telefone = (fornecedor.representante_whatsapp || fornecedor.representante_telefone || fornecedor.telefone || '').replace(/\D/g, '');
    if (telefone.length < 10) {
      throw new BadRequestException('Fornecedor não possui telefone/WhatsApp cadastrado para envio do código.');
    }

    const orgaoId = contrato.orgao_id || '';
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const cacheKey = `otp_fornecedor_${medicaoId}`;

    (this.assinaturasService as any).otpCache?.set(cacheKey, {
      codigo,
      telefone,
      expiracao: Date.now() + 5 * 60 * 1000,
      tentativas: 0,
    });

    (this.assinaturasService as any).otpCache?.set(`otp_${orgaoId}_${telefone}`, {
      codigo,
      expiracao: Date.now() + 5 * 60 * 1000,
      tentativas: 0,
    });

    const mensagem = `Seu código de confirmação para *Assinatura do Boletim de Medição* no Portal DCP é: *${codigo}*\n\nEste código expira em 5 minutos. Não o compartilhe com ninguém.`;

    try {
      await (this.assinaturasService as any).whatsappService.enviar(orgaoId, {
        to: telefone,
        mensagem,
      });
    } catch (err) {
      this.logger.warn(`Falha ao enviar OTP fornecedor via WhatsApp para medição ${medicaoId}: ${err.message}`);
      throw new BadRequestException('Não foi possível enviar o código para o telefone do fornecedor. Verifique a configuração de WhatsApp do órgão.');
    }

    const telefoneMascarado = telefone.replace(/^(.{2})(.*)(.{4})$/, '$1***$3');
    const fornecedorNome = fornecedor.razao_social || fornecedor.nome_fantasia || 'Fornecedor';
    this.logger.log(`OTP fornecedor enviado para medição ${medicaoId}: ${fornecedorNome} — ${telefoneMascarado}`);

    return { telefone_mascarado: telefoneMascarado, fornecedor_nome: fornecedorNome };
  }

  /**
   * Valida OTP do fornecedor, registra assinatura digital como FORNECEDOR e submete a medição.
   * Usado quando o órgão cria a medição: a assinatura é do fornecedor (campo FORNECEDOR no boletim).
   */
  async validarOtpAssinaturaFornecedor(medicaoId: string, codigoOtp: string): Promise<{
    sucesso: boolean;
    codigo_validacao: string;
    codigo_formatado: string;
    pdf_url?: string;
  }> {
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
      relations: ['contrato', 'contrato.fornecedor'],
    });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    const contrato = medicao.contrato
      || await this.contratoRepository.findOne({ where: { id: medicao.contrato_id }, relations: ['fornecedor'] });
    if (!contrato?.fornecedor_id) throw new BadRequestException('Contrato sem fornecedor cadastrado');

    const fornecedor = (contrato as any).fornecedor
      || await this.fornecedorRepository.findOne({ where: { id: contrato.fornecedor_id } });
    if (!fornecedor) throw new NotFoundException('Fornecedor não encontrado');

    const cacheKey = `otp_fornecedor_${medicaoId}`;
    const otpEntry = (this.assinaturasService as any).otpCache?.get(cacheKey);

    if (!otpEntry || otpEntry.expiracao <= Date.now() || otpEntry.codigo !== codigoOtp) {
      throw new BadRequestException('Código incorreto ou expirado. Solicite um novo código.');
    }

    (this.assinaturasService as any).otpCache?.delete(cacheKey);
    if (otpEntry.telefone) {
      const orgaoId = contrato.orgao_id || '';
      (this.assinaturasService as any).otpCache?.delete(`otp_${orgaoId}_${otpEntry.telefone}`);
    }

    const assinatura = await this.registrarAssinaturaMedicao(medicaoId, {
      orgao_id: contrato.orgao_id || '',
      papel: 'FORNECEDOR',
      usuario_nome: fornecedor.razao_social || fornecedor.nome_fantasia || '',
      usuario_cpf_cnpj: fornecedor.cpf_cnpj || '',
      usuario_cargo: 'Fornecedor / Contratado',
    });

    if (medicao.status === StatusMedicao.RASCUNHO || medicao.status === StatusMedicao.DEVOLVIDA) {
      try {
        await this.submeterMedicao(medicaoId, contrato.fornecedor_id);
      } catch (err) {
        this.logger.warn(`Assinatura OK mas falha ao submeter medição ${medicaoId}: ${err.message}`);
        throw err;
      }
    }

    try {
      await this.gerarPdfOficialMedicao(medicaoId);
      this.logger.log(`PDF do boletim regenerado com assinatura do fornecedor para medição ${medicaoId}`);
    } catch (err) {
      this.logger.warn(`Não foi possível regenerar PDF após assinatura fornecedor: ${err.message}`);
    }

    const medicaoAtualizada = await this.medicaoRepository.findOne({ where: { id: medicaoId } });
    this.logger.log(`Medição ${medicaoId} assinada e submetida com OTP pelo fornecedor (orgão criou)`);

    return {
      sucesso: true,
      codigo_validacao: assinatura.codigo_validacao,
      codigo_formatado: assinatura.codigo_formatado,
      pdf_url: medicaoAtualizada?.boletim_pdf_url || '',
    };
  }

  /**
   * Valida OTP do fiscal e registra assinatura digital como FISCAL.
   */
  async validarOtpAssinaturaFiscal(
    medicaoId: string,
    codigoOtp: string,
    dadosFiscal: {
      usuario_id?: string;
      usuario_nome: string;
      usuario_cpf_cnpj: string;
      usuario_cargo?: string;
      orgao_id?: string;
    },
  ): Promise<{ sucesso: boolean; codigo_validacao: string; codigo_formatado: string }> {
    const medicao = await this.medicaoRepository.findOne({ where: { id: medicaoId } });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    const cacheKey = `otp_fiscal_${medicaoId}`;
    const otpEntry = (this.assinaturasService as any).otpCache?.get(cacheKey);

    if (!otpEntry || otpEntry.expiracao <= Date.now() || otpEntry.codigo !== codigoOtp) {
      throw new BadRequestException('Código incorreto ou expirado. Solicite um novo código.');
    }

    (this.assinaturasService as any).otpCache?.delete(cacheKey);
    if (otpEntry.telefone) {
      const contrato = await this.contratoRepository.findOne({ where: { id: medicao.contrato_id } });
      const orgaoId = dadosFiscal.orgao_id || contrato?.orgao_id || '';
      (this.assinaturasService as any).otpCache?.delete(`otp_${orgaoId}_${otpEntry.telefone}`);
    }

    // Buscar dados completos do usuário (matricula, portaria_fiscal)
    const fiscalUserOtp = dadosFiscal.usuario_id
      ? await this.usuarioRepository.findOne({ where: { id: dadosFiscal.usuario_id } })
      : null;
    const assinatura = await this.registrarAssinaturaMedicao(medicaoId, {
      orgao_id: dadosFiscal.orgao_id || '',
      papel: 'FISCAL',
      usuario_id: dadosFiscal.usuario_id,
      usuario_nome: dadosFiscal.usuario_nome,
      usuario_cpf_cnpj: dadosFiscal.usuario_cpf_cnpj,
      usuario_cargo: dadosFiscal.usuario_cargo || fiscalUserOtp?.cargo || 'Fiscal',
      usuario_matricula: fiscalUserOtp?.matricula || undefined,
      usuario_portaria: fiscalUserOtp?.portaria_fiscal || undefined,
    });

    this.logger.log(`Medição ${medicaoId} assinada digitalmente pelo fiscal ${dadosFiscal.usuario_nome}`);

    // Regenerar PDF oficial no servidor com a assinatura do fiscal incluída
    try {
      await this.gerarPdfOficialMedicao(medicaoId);
      this.logger.log(`PDF do boletim regenerado com assinatura fiscal para medição ${medicaoId}`);
    } catch (err) {
      this.logger.warn(`Não foi possível regenerar PDF após assinatura fiscal: ${err.message}`);
    }

    return {
      sucesso: true,
      codigo_validacao: assinatura.codigo_validacao,
      codigo_formatado: assinatura.codigo_formatado,
    };
  }

  /**
   * Salva arquivo PDF do boletim em disco e atualiza a URL na medição.
   */
  async salvarBoletimPdf(medicaoId: string, pdfBuffer: Buffer): Promise<string> {
    const medicao = await this.medicaoRepository.findOne({ where: { id: medicaoId } });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    // Criar diretório se não existir
    const uploadsDir = this.getBoletinsDir();
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filepath = this.getBoletimPdfPath(medicaoId);

    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }

    // Salvar arquivo
    fs.writeFileSync(filepath, pdfBuffer);

    // Calcular SHA-256 e gravar nas assinaturas digitais desta medição
    try {
      const documentoHash = createHash('sha256').update(pdfBuffer).digest('hex');
      await this.assinaturaDigitalRepository.update(
        { entidade_id: medicaoId, entidade_tipo: EntidadeTipo.MEDICAO },
        { documento_hash: documentoHash } as any,
      );
      this.logger.log(`Hash SHA-256 gravado para medição ${medicaoId}: ${documentoHash.slice(0, 16)}...`);
    } catch (e) {
      this.logger.warn(`Erro ao gravar hash do boletim ${medicaoId}: ${e.message}`);
    }

    // URL relativa para acesso
    const pdfUrl = this.getBoletimPdfUrl(medicaoId);

    // Atualizar medição
    await this.medicaoRepository.update(medicaoId, { boletim_pdf_url: pdfUrl });

    this.logger.log(`Boletim PDF salvo para medição ${medicaoId}: ${pdfUrl}`);
    return pdfUrl;
  }

  // ============================================================================
  // FLUXO DE ASSINATURA FISCAL VIA LINK WHATSAPP
  // ============================================================================

  /**
   * Retorna usuários do órgão com eh_fiscal_contrato = true.
   */
  async listarFiscaisOrgao(orgaoId: string): Promise<any[]> {
    return this.usuarioRepository.find({
      where: { orgao_id: orgaoId, eh_fiscal_contrato: true, ativo: true } as any,
      select: ['id', 'nome', 'cpf', 'cargo', 'telefone'],
      order: { nome: 'ASC' } as any,
    });
  }

  private async listarIdsItensMedicao(medicaoId: string): Promise<string[]> {
    const [itensEtapa, itensQuantidade] = await Promise.all([
      this.itemMedicaoRepository.find({
        where: { medicao_id: medicaoId },
        select: ['id'],
      } as any),
      this.itemMedicaoItemRepository.find({
        where: { medicao_id: medicaoId },
        select: ['id'],
      } as any),
    ]);

    return [...itensEtapa.map(item => item.id), ...itensQuantidade.map(item => item.id)];
  }

  private async validarAutoEncaminhamentoAssinatura(
    medicaoId: string,
    itensSelecionadosIds?: string[],
  ): Promise<{
    habilitado: boolean;
    itensSelecionadosValidos: string[];
    totalItensMedicao: number;
    itensSelecionadosTotal: number;
  }> {
    if (!Array.isArray(itensSelecionadosIds) || itensSelecionadosIds.length === 0) {
      return {
        habilitado: false,
        itensSelecionadosValidos: [],
        totalItensMedicao: 0,
        itensSelecionadosTotal: 0,
      };
    }

    const itensDisponiveis = await this.listarIdsItensMedicao(medicaoId);
    if (itensDisponiveis.length === 0) {
      throw new BadRequestException(
        'Não foi possível habilitar autoencaminhamento: medição sem itens para ateste.',
      );
    }

    const itensSelecionados = [...new Set(itensSelecionadosIds.filter(Boolean))];
    const itensDisponiveisSet = new Set(itensDisponiveis);
    const possuiItemInvalido = itensSelecionados.some(itemId => !itensDisponiveisSet.has(itemId));
    if (possuiItemInvalido) {
      throw new BadRequestException(
        'Seleção inválida de itens para assinatura fiscal. Atualize a tela e tente novamente.',
      );
    }

    const selecionouTodos =
      itensSelecionados.length === itensDisponiveis.length &&
      itensDisponiveis.every(itemId => itensSelecionados.includes(itemId));

    if (!selecionouTodos) {
      throw new BadRequestException(
        'Autoencaminhamento só é permitido quando 100% dos itens estão selecionados.',
      );
    }

    return {
      habilitado: true,
      itensSelecionadosValidos: itensSelecionados,
      totalItensMedicao: itensDisponiveis.length,
      itensSelecionadosTotal: itensSelecionados.length,
    };
  }

  /**
   * Cria um link temporário e envia WhatsApp para o fiscal assinar.
   */
  async solicitarAssinaturaFiscalWhatsApp(
    medicaoId: string,
    fiscalUsuarioId: string,
    solicitadoPorId: string,
    opcoes?: { itensSelecionadosIds?: string[] },
  ): Promise<{ link_enviado: boolean; fiscal_nome: string; expira_em: Date; auto_enviar_aprovacao: boolean }> {
    const medicao = await this.medicaoRepository.findOne({ where: { id: medicaoId } });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    const fiscal = await this.usuarioRepository.findOne({ where: { id: fiscalUsuarioId } });
    if (!fiscal) throw new NotFoundException('Fiscal não encontrado');

    const solicitante = await this.usuarioRepository.findOne({ where: { id: solicitadoPorId } });

    const contrato = await this.contratoRepository.findOne({
      where: { id: medicao.contrato_id },
      relations: ['orgao'],
    });

    const autoEncaminhamento = await this.validarAutoEncaminhamentoAssinatura(
      medicaoId,
      opcoes?.itensSelecionadosIds,
    );

    // Invalidar links anteriores pendentes para esta medição
    await this.linkAssinaturaRepository.update(
      { medicao_id: medicaoId, status: 'pendente' },
      { status: 'expirado' } as any,
    );

    const { randomUUID } = await import('crypto');
    const token = randomUUID();
    const expira_em = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h

    const link = await this.linkAssinaturaRepository.save({
      token,
      medicao_id: medicaoId,
      fiscal_usuario_id: fiscal.id,
      fiscal_nome: fiscal.nome,
      fiscal_telefone: fiscal.telefone || '',
      solicitado_por_id: solicitadoPorId,
      solicitado_por_nome: solicitante?.nome || '',
      solicitado_por_telefone: solicitante?.telefone || '',
      status: 'pendente',
      expira_em,
      auto_enviar_aprovacao: autoEncaminhamento.habilitado,
      itens_total_medicao: autoEncaminhamento.totalItensMedicao || null,
      itens_selecionados_total: autoEncaminhamento.itensSelecionadosTotal || null,
      itens_selecionados_ids: autoEncaminhamento.itensSelecionadosValidos.length > 0
        ? autoEncaminhamento.itensSelecionadosValidos
        : null,
    });

    // Montar mensagem WhatsApp
    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://portaldcp.com.br';
    const linkUrl = `${appUrl}/assinar-medicao/${token}`;
    const orgaoNome = contrato?.orgao?.nome || 'Órgão';
    const numContrato = contrato?.numero_contrato || '';
    const numMedicao = String(medicao.numero_medicao || '').padStart(3, '0');
    const periodoInicio = medicao.periodo_inicio ? new Date(medicao.periodo_inicio).toLocaleDateString('pt-BR') : '';
    const periodoFim   = medicao.periodo_fim    ? new Date(medicao.periodo_fim).toLocaleDateString('pt-BR')    : '';

    const mensagem =
      `Olá, *${fiscal.nome}*! 👋\n\n` +
      `Você recebeu uma solicitação de *assinatura de boletim de medição*.\n\n` +
      `🏛️ *Órgão:* ${orgaoNome}\n` +
      `📋 *Contrato:* ${numContrato}\n` +
      `🔢 *Medição Nº:* ${numMedicao}\n` +
      `🗓️ *Período:* ${periodoInicio} a ${periodoFim}\n\n` +
      `Acesse o link abaixo para revisar os documentos e assinar digitalmente:\n` +
      `🔗 ${linkUrl}\n\n` +
      `⏳ Este link expira em *48 horas*.`;

    if (fiscal.telefone) {
      try {
        await (this.assinaturasService as any).whatsappService?.enviar(
          contrato?.orgao_id || '',
          { to: fiscal.telefone, mensagem },
        );
      } catch (err) {
        this.logger.warn(`Não foi possível enviar WhatsApp para fiscal ${fiscal.nome}: ${err.message}`);
      }
    }

    return {
      link_enviado: !!fiscal.telefone,
      fiscal_nome: fiscal.nome,
      expira_em,
      auto_enviar_aprovacao: autoEncaminhamento.habilitado,
    };
  }

  /**
   * Retorna o status do link de assinatura mais recente para a medição.
   */
  async statusAssinaturaFiscal(medicaoId: string): Promise<any> {
    const link = await this.linkAssinaturaRepository.findOne({
      where: { medicao_id: medicaoId },
      order: { criado_em: 'DESC' } as any,
    });
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
      select: ['id', 'status'],
    } as any);

    const autoEncaminhada =
      !!link?.auto_enviar_aprovacao &&
      link?.status === 'assinado' &&
      medicao?.status === StatusMedicao.AGUARDANDO_APROVACAO;

    return {
      status: link?.status || 'sem_solicitacao',
      fiscal_nome: link?.fiscal_nome || null,
      atualizado_em: link?.atualizado_em || null,
      auto_enviar_aprovacao: !!link?.auto_enviar_aprovacao,
      auto_encaminhada: autoEncaminhada,
      medicao_status: medicao?.status || null,
    };
  }

  /**
   * Retorna dados da medição para a página pública de assinatura.
   * Valida que o token existe, não expirou e está pendente.
   */
  async obterDadosLinkPublico(token: string): Promise<any> {
    const link = await this.linkAssinaturaRepository.findOne({ where: { token } });
    if (!link) throw new NotFoundException('Link inválido');
    if (link.status !== 'pendente') throw new BadRequestException('Este link já foi utilizado ou expirou');
    if (new Date() > link.expira_em) {
      await this.linkAssinaturaRepository.update(link.id, { status: 'expirado' } as any);
      throw new BadRequestException('Este link expirou');
    }

    const medicao = await this.buscarMedicaoCompleta(link.medicao_id);
    const contrato = await this.contratoRepository.findOne({
      where: { id: medicao.contrato_id },
      relations: ['orgao'],
    });
    const anexos = await this.anexoMedicaoRepository.find({ where: { medicao_id: link.medicao_id } });

    return {
      medicao_id: link.medicao_id,
      fiscal_nome: link.fiscal_nome,
      numero_medicao: medicao.numero_medicao,
      periodo_inicio: medicao.periodo_inicio,
      periodo_fim: medicao.periodo_fim,
      valor_medido: medicao.valor_medido,
      orgao_nome: contrato?.orgao?.nome || '',
      numero_contrato: contrato?.numero_contrato || '',
      fornecedor_nome: medicao.fornecedor_nome || '',
      boletim_pdf_url: medicao.boletim_pdf_url || null,
      anexos: anexos.map(a => ({
        id: a.id,
        url: a.url,
        nome_original: a.nome_original,
        tipo: a.tipo,
        tamanho_bytes: a.tamanho_bytes,
      })),
    };
  }

  /**
   * Envia OTP via WhatsApp para o fiscal assinar via link público.
   */
  async solicitarOtpLinkPublico(token: string): Promise<{ enviado: boolean }> {
    const link = await this.linkAssinaturaRepository.findOne({ where: { token } });
    if (!link || link.status !== 'pendente') throw new BadRequestException('Link inválido ou já utilizado');
    if (new Date() > link.expira_em) throw new BadRequestException('Link expirado');
    if (!link.fiscal_telefone) throw new BadRequestException('Fiscal não possui telefone cadastrado');

    const contrato = await this.contratoRepository.findOne({ where: { id: (await this.medicaoRepository.findOne({ where: { id: link.medicao_id } }))?.contrato_id || '' } });
    const orgaoId = contrato?.orgao_id || '';

    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    const cacheKey = `otp_link_${token}`;
    (this.assinaturasService as any).otpCache?.set(cacheKey, {
      codigo,
      expiracao: Date.now() + 5 * 60 * 1000,
      tentativas: 0,
    });

    const mensagem =
      `Olá, *${link.fiscal_nome}*!\n\n` +
      `Seu código de verificação para *assinar o boletim de medição* é:\n\n` +
      `*${codigo}*\n\n` +
      `Este código expira em *5 minutos*. Não o compartilhe.`;

    try {
      await (this.assinaturasService as any).whatsappService?.enviar(orgaoId, {
        to: link.fiscal_telefone,
        mensagem,
      });
      return { enviado: true };
    } catch (err) {
      this.logger.warn(`Erro ao enviar OTP para link ${token}: ${err.message}`);
      return { enviado: false };
    }
  }

  private async autoEncaminharAssinaturaFiscal(link: LinkAssinaturaFiscal): Promise<boolean> {
    if (!link.auto_enviar_aprovacao) return false;

    const medicao = await this.medicaoRepository.findOne({ where: { id: link.medicao_id } });
    if (!medicao) {
      this.logger.warn(`Autoencaminhamento ignorado: medição ${link.medicao_id} não encontrada.`);
      return false;
    }

    if (medicao.status === StatusMedicao.AGUARDANDO_APROVACAO || medicao.status === StatusMedicao.APROVADA) {
      return true;
    }

    if (medicao.status !== StatusMedicao.SUBMETIDA && medicao.status !== StatusMedicao.PARCIALMENTE_ATESTADA) {
      this.logger.warn(
        `Autoencaminhamento ignorado: medição ${medicao.id} em status ${medicao.status}.`,
      );
      return false;
    }

    await this.atestarMedicao(
      medicao.id,
      link.fiscal_usuario_id,
      link.fiscal_nome || 'Fiscal',
      {
        observacoes: 'Ateste automático após assinatura digital do fiscal.',
        verificado_in_loco: false,
      },
    );
    this.logger.log(`Medição ${medicao.id} autoencaminhada para aprovação após assinatura fiscal.`);
    return true;
  }

  /**
   * Valida OTP e registra a assinatura do fiscal via link público.
   * Retorna dados_pdf para o frontend regenerar o PDF com o layout correto.
   */
  async assinarViaLinkPublico(
    token: string,
    codigoOtp: string,
  ): Promise<{
    sucesso: boolean;
    codigo_validacao: string;
    codigo_formatado: string;
    dados_pdf: any;
    medicao_id: string;
    auto_encaminhada_aprovacao: boolean;
    medicao_status: StatusMedicao | null;
  }> {
    const link = await this.linkAssinaturaRepository.findOne({ where: { token } });
    if (!link || link.status !== 'pendente') throw new BadRequestException('Link inválido ou já utilizado');
    if (new Date() > link.expira_em) throw new BadRequestException('Link expirado');

    // Validar OTP
    const cacheKey = `otp_link_${token}`;
    const otpEntry = (this.assinaturasService as any).otpCache?.get(cacheKey);
    if (!otpEntry || otpEntry.expiracao <= Date.now() || otpEntry.codigo !== codigoOtp) {
      throw new BadRequestException('Código incorreto ou expirado. Solicite um novo código.');
    }
    (this.assinaturasService as any).otpCache?.delete(cacheKey);

    // Registrar assinatura
    const fiscalUser = await this.usuarioRepository.findOne({ where: { id: link.fiscal_usuario_id } });
    const assinatura = await this.registrarAssinaturaMedicao(link.medicao_id, {
      orgao_id: '',
      papel: 'FISCAL',
      usuario_id: link.fiscal_usuario_id,
      usuario_nome: link.fiscal_nome,
      usuario_cpf_cnpj: fiscalUser?.cpf || '',
      usuario_cargo: fiscalUser?.cargo || 'Fiscal de Contrato',
      usuario_matricula: fiscalUser?.matricula || undefined,
      usuario_portaria: fiscalUser?.portaria_fiscal || undefined,
    });

    // Montar dados para o frontend gerar o PDF
    let dados_pdf: any = null;
    try {
      dados_pdf = await this.montarDadosPdfFrontend(link.medicao_id);
    } catch (err) {
      this.logger.warn(`Erro ao montar dados PDF após assinatura por link: ${err.message}`);
    }

    // Regenerar PDF oficial no servidor com a assinatura do fiscal incluída
    try {
      await this.gerarPdfOficialMedicao(link.medicao_id);
      this.logger.log(`PDF do boletim regenerado com assinatura fiscal para medição ${link.medicao_id}`);
    } catch (err) {
      this.logger.warn(`Não foi possível regenerar PDF após assinatura fiscal por link: ${err.message}`);
    }

    // Atualizar status do link
    await this.linkAssinaturaRepository.update(link.id, { status: 'assinado' } as any);

    let autoEncaminhadaAprovacao = false;
    try {
      autoEncaminhadaAprovacao = await this.autoEncaminharAssinaturaFiscal(link);
    } catch (err) {
      this.logger.warn(`Falha no autoencaminhamento pós-assinatura: ${err.message}`);
    }

    const medicaoAtualizada = await this.medicaoRepository.findOne({
      where: { id: link.medicao_id },
      select: ['id', 'status'],
    } as any);

    // Notificar solicitante via WhatsApp
    if (link.solicitado_por_telefone) {
      const medicao = await this.medicaoRepository.findOne({ where: { id: link.medicao_id } });
      const contrato = await this.contratoRepository.findOne({ where: { id: medicao?.contrato_id || '' } });
      const orgaoId = contrato?.orgao_id || '';
      const numMedicao = String(medicao?.numero_medicao || '').padStart(3, '0');
      const mensagemNotif =
        autoEncaminhadaAprovacao
          ? `✅ *${link.fiscal_nome}* assinou digitalmente o boletim da *Medição Nº ${numMedicao}*.\n\n` +
            `A medição foi enviada automaticamente para *aprovação do gestor*.`
          : `✅ *${link.fiscal_nome}* assinou digitalmente o boletim da *Medição Nº ${numMedicao}*.\n\n` +
            `O boletim assinado já está disponível para download.`;
      try {
        await (this.assinaturasService as any).whatsappService?.enviar(orgaoId, {
          to: link.solicitado_por_telefone,
          mensagem: mensagemNotif,
        });
      } catch (err) {
        this.logger.warn(`Erro ao notificar solicitante: ${err.message}`);
      }
    }

    return {
      sucesso: true,
      codigo_validacao: assinatura.codigo_validacao,
      codigo_formatado: assinatura.codigo_formatado,
      dados_pdf,
      medicao_id: link.medicao_id,
      auto_encaminhada_aprovacao: autoEncaminhadaAprovacao,
      medicao_status: (medicaoAtualizada?.status as StatusMedicao) || null,
    };
  }

  /**
   * Recusa a assinatura via link público.
   */
  async recusarViaLinkPublico(token: string, motivo?: string): Promise<{ sucesso: boolean }> {
    const link = await this.linkAssinaturaRepository.findOne({ where: { token } });
    if (!link || link.status !== 'pendente') throw new BadRequestException('Link inválido ou já utilizado');
    if (new Date() > link.expira_em) throw new BadRequestException('Link expirado');

    await this.linkAssinaturaRepository.update(link.id, {
      status: 'recusado',
      motivo_recusa: motivo || null,
    } as any);

    // Notificar solicitante
    if (link.solicitado_por_telefone) {
      const medicao = await this.medicaoRepository.findOne({ where: { id: link.medicao_id } });
      const contrato = await this.contratoRepository.findOne({ where: { id: medicao?.contrato_id || '' } });
      const orgaoId = contrato?.orgao_id || '';
      const numMedicao = String(medicao?.numero_medicao || '').padStart(3, '0');
      const motivoTxt = motivo ? `\n\nMotivo: _${motivo}_` : '';
      const mensagem =
        `❌ *${link.fiscal_nome}* recusou a assinatura do boletim da *Medição Nº ${numMedicao}*.${motivoTxt}`;
      try {
        await (this.assinaturasService as any).whatsappService?.enviar(orgaoId, {
          to: link.solicitado_por_telefone,
          mensagem,
        });
      } catch (err) {
        this.logger.warn(`Erro ao notificar solicitante de recusa: ${err.message}`);
      }
    }

    return { sucesso: true };
  }
}
