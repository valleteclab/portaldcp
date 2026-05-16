import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  OrdemFornecimento,
  StatusLiquidacaoOrdem,
  StatusOrdemFornecimento,
  StatusPagamentoOrdem,
} from './entities/ordem-fornecimento.entity';
import { Contrato } from '../contratos/entities/contrato.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { FatorTransparenciaService, EmpenhoComposto, ResumoEmpenhos } from '../contratos/fator-transparencia.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { PrioridadeNotificacao, TipoNotificacao } from '../notificacoes/entities/notificacao.entity';

export interface ResultadoVerificacaoFinanceira {
  ordem_id: string;
  ordem_numero: string;
  status_liquidacao: StatusLiquidacaoOrdem;
  status_pagamento: StatusPagamentoOrdem;
  valor_total: number;
  valor_liquidado: number;
  valor_pago: number;
  empenhos_encontrados: string[];
  empenhos_nao_encontrados: string[];
  alterou: boolean;
}

@Injectable()
export class OrdemFinanceiroMonitorService {
  private readonly logger = new Logger(OrdemFinanceiroMonitorService.name);
  private readonly statusMonitorados = [
    StatusOrdemFornecimento.EMITIDA,
    StatusOrdemFornecimento.ENVIADA,
    StatusOrdemFornecimento.EM_ATENDIMENTO,
    StatusOrdemFornecimento.ATENDIDA_PARCIAL,
    StatusOrdemFornecimento.ATENDIDA,
  ];

  constructor(
    @InjectRepository(OrdemFornecimento)
    private readonly ordemRepository: Repository<OrdemFornecimento>,
    @InjectRepository(Contrato)
    private readonly contratoRepository: Repository<Contrato>,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    private readonly fatorTransparencia: FatorTransparenciaService,
    private readonly notificacoesService: NotificacoesService,
  ) {}

  async verificarOrdem(ordemId: string, notificar = true): Promise<ResultadoVerificacaoFinanceira> {
    const ordem = await this.ordemRepository.findOne({
      where: { id: ordemId },
      relations: ['contrato', 'fornecedor'],
    });

    if (!ordem) {
      throw new NotFoundException('Ordem de fornecimento nao encontrada');
    }

    if (!ordem.numeros_empenhos?.length) {
      throw new BadRequestException('A ordem nao possui empenhos vinculados');
    }

    const contrato = ordem.contrato ?? await this.contratoRepository.findOne({ where: { id: ordem.contrato_id } });
    if (!contrato) {
      throw new NotFoundException('Contrato da ordem nao encontrado');
    }

    const resumo = await this.buscarResumoContrato(contrato);
    return this.atualizarOrdemPorResumo(ordem, resumo, notificar);
  }

  async verificarPendentes(orgaoId?: string): Promise<ResultadoVerificacaoFinanceira[]> {
    const query = this.ordemRepository.createQueryBuilder('ordem')
      .leftJoinAndSelect('ordem.contrato', 'contrato')
      .leftJoinAndSelect('ordem.fornecedor', 'fornecedor')
      .where('ordem.status IN (:...status)', { status: this.statusMonitorados })
      .andWhere('ordem.numeros_empenhos IS NOT NULL')
      .orderBy('ordem.data_ultima_verificacao_financeira', 'ASC', 'NULLS FIRST')
      .addOrderBy('ordem.created_at', 'ASC')
      .limit(100);

    if (orgaoId) {
      query.andWhere('ordem.orgao_id = :orgaoId', { orgaoId });
    }

    const ordens = (await query.getMany()).filter((ordem) => ordem.numeros_empenhos?.length);
    const cacheContrato = new Map<string, ResumoEmpenhos>();
    const resultados: ResultadoVerificacaoFinanceira[] = [];

    for (const ordem of ordens) {
      try {
        const contrato = ordem.contrato ?? await this.contratoRepository.findOne({ where: { id: ordem.contrato_id } });
        if (!contrato) continue;

        let resumo = cacheContrato.get(contrato.id);
        if (!resumo) {
          resumo = await this.buscarResumoContrato(contrato);
          cacheContrato.set(contrato.id, resumo);
        }

        resultados.push(await this.atualizarOrdemPorResumo(ordem, resumo, true));
      } catch (error) {
        this.logger.warn(`Falha ao verificar financeiro da ordem ${ordem.numero}: ${error.message}`);
      }
    }

    return resultados;
  }

  private async buscarResumoContrato(contrato: Contrato): Promise<ResumoEmpenhos> {
    const anoConsulta = contrato.ano ?? new Date().getFullYear();
    const empenhos = await this.fatorTransparencia.buscarEmpenhos({
      nContrato: contrato.numero_contrato,
      cpfcnpj: contrato.fornecedor_cnpj,
      ano: anoConsulta,
    });

    return this.fatorTransparencia.calcularResumo(empenhos, {
      valor_global: Number(contrato.valor_global ?? 0),
      ano_contrato: anoConsulta,
    });
  }

  private async atualizarOrdemPorResumo(
    ordem: OrdemFornecimento,
    resumo: ResumoEmpenhos,
    notificar: boolean,
  ): Promise<ResultadoVerificacaoFinanceira> {
    const composicoes = resumo.grupos_exercicio.flatMap((grupo) => grupo.empenhos_compostos);
    const selecionados = (ordem.numeros_empenhos ?? []).map((numero) => this.parseEmpenhoVinculado(numero));
    const encontrados: EmpenhoComposto[] = [];
    const naoEncontrados: string[] = [];

    for (const empenho of selecionados) {
      const matches = composicoes.filter((comp) => {
        if (this.normalizarNumero(comp.numero_empenho) !== empenho.numero) return false;
        return !empenho.ano || comp.ano_exercicio === empenho.ano;
      });
      if (matches.length) {
        encontrados.push(...matches);
      } else {
        naoEncontrados.push(empenho.original);
      }
    }

    const valorLiquidado = this.arredondarCentavos(encontrados.reduce((total, comp) => total + Number(comp.total_liquidado ?? 0), 0));
    const valorPago = this.arredondarCentavos(encontrados.reduce((total, comp) => total + Number(comp.total_pago ?? 0), 0));
    const valorTotal = Number(ordem.valor_total ?? 0);
    const statusLiquidacao = this.statusLiquidacao(valorLiquidado, valorTotal);
    const statusPagamento = this.statusPagamento(valorPago, valorTotal);
    const dataVerificacao = new Date();

    const liquidouAgora = statusLiquidacao === StatusLiquidacaoOrdem.LIQUIDADA
      && ordem.status_liquidacao !== StatusLiquidacaoOrdem.LIQUIDADA;
    const pagouAgora = statusPagamento === StatusPagamentoOrdem.PAGA
      && ordem.status_pagamento !== StatusPagamentoOrdem.PAGA;

    const alterou = ordem.status_liquidacao !== statusLiquidacao
      || ordem.status_pagamento !== statusPagamento
      || Number(ordem.valor_liquidado_financeiro ?? 0) !== valorLiquidado
      || Number(ordem.valor_pago_financeiro ?? 0) !== valorPago;

    ordem.status_liquidacao = statusLiquidacao;
    ordem.status_pagamento = statusPagamento;
    ordem.valor_liquidado_financeiro = valorLiquidado;
    ordem.valor_pago_financeiro = valorPago;
    ordem.data_ultima_verificacao_financeira = dataVerificacao;
    if (liquidouAgora && !ordem.data_liquidacao_detectada) ordem.data_liquidacao_detectada = dataVerificacao;
    if (pagouAgora && !ordem.data_pagamento_detectado) ordem.data_pagamento_detectado = dataVerificacao;

    if (notificar && liquidouAgora && !ordem.notificou_liquidacao_financeira) {
      await this.notificarMudanca(ordem, 'liquidada');
      ordem.notificou_liquidacao_financeira = true;
    }

    if (notificar && pagouAgora && !ordem.notificou_pagamento_financeiro) {
      await this.notificarMudanca(ordem, 'paga');
      ordem.notificou_pagamento_financeiro = true;
    }

    await this.ordemRepository.save(ordem);

    return {
      ordem_id: ordem.id,
      ordem_numero: ordem.numero,
      status_liquidacao: statusLiquidacao,
      status_pagamento: statusPagamento,
      valor_total: valorTotal,
      valor_liquidado: valorLiquidado,
      valor_pago: valorPago,
      empenhos_encontrados: [...new Set(encontrados.map((comp) => `${comp.numero_empenho}-${comp.ano_exercicio}`))],
      empenhos_nao_encontrados: naoEncontrados,
      alterou,
    };
  }

  private statusLiquidacao(valorLiquidado: number, valorTotal: number): StatusLiquidacaoOrdem {
    if (valorTotal > 0 && valorLiquidado >= valorTotal - 0.01) return StatusLiquidacaoOrdem.LIQUIDADA;
    if (valorLiquidado > 0.01) return StatusLiquidacaoOrdem.PARCIALMENTE_LIQUIDADA;
    return StatusLiquidacaoOrdem.NAO_LIQUIDADA;
  }

  private statusPagamento(valorPago: number, valorTotal: number): StatusPagamentoOrdem {
    if (valorTotal > 0 && valorPago >= valorTotal - 0.01) return StatusPagamentoOrdem.PAGA;
    if (valorPago > 0.01) return StatusPagamentoOrdem.PARCIALMENTE_PAGA;
    return StatusPagamentoOrdem.NAO_PAGA;
  }

  private parseEmpenhoVinculado(valor: string): { original: string; numero: string; ano?: number } {
    const trimmed = String(valor ?? '').trim();
    const anoMatch = trimmed.match(/(?:-|\/)(\d{4})$/);
    return {
      original: trimmed,
      numero: this.normalizarNumero(trimmed.replace(/[-/]\d{4}$/, '')),
      ano: anoMatch ? Number(anoMatch[1]) : undefined,
    };
  }

  private normalizarNumero(valor: string): string {
    return String(valor ?? '').replace(/\D/g, '').replace(/^0+/, '') || '0';
  }

  private arredondarCentavos(valor: number): number {
    return Math.round(Number(valor || 0) * 100) / 100;
  }

  private async notificarMudanca(ordem: OrdemFornecimento, evento: 'liquidada' | 'paga'): Promise<void> {
    const ids = [...new Set([ordem.usuario_emitente_id, ordem.usuario_fiscal_id].filter(Boolean) as string[])];
    if (!ids.length) return;

    const usuarios = await this.usuarioRepository.find({ where: { id: In(ids) } });
    const usuariosMap = new Map(usuarios.map((usuario) => [usuario.id, usuario]));
    const destinatarios = ids.map((id) => {
      const usuario = usuariosMap.get(id);
      return { id, email: usuario?.email, telefone: usuario?.telefone };
    });

    const titulo = evento === 'liquidada'
      ? `Ordem ${ordem.numero} liquidada`
      : `Ordem ${ordem.numero} paga`;
    const mensagem = evento === 'liquidada'
      ? `A ordem ${ordem.numero} foi identificada como liquidada no acompanhamento de empenhos.`
      : `A ordem ${ordem.numero} foi identificada como paga no acompanhamento de empenhos.`;

    await this.notificacoesService.criarParaMultiplos(destinatarios, {
      orgao_id: ordem.orgao_id,
      tipo: evento === 'liquidada' ? TipoNotificacao.ORDEM_LIQUIDADA : TipoNotificacao.ORDEM_PAGA,
      titulo,
      mensagem,
      prioridade: PrioridadeNotificacao.NORMAL,
      entidade_tipo: 'ordem_fornecimento',
      entidade_id: ordem.id,
      link: `/orgao/almoxarifado/ordens`,
      metadata: {
        ordem_id: ordem.id,
        ordem_numero: ordem.numero,
        valor_total: Number(ordem.valor_total ?? 0),
        valor_liquidado: Number(ordem.valor_liquidado_financeiro ?? 0),
        valor_pago: Number(ordem.valor_pago_financeiro ?? 0),
      },
    });
  }
}
