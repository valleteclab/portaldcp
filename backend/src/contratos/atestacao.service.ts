import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contrato, ModalidadeExecucao } from './entities/contrato.entity';
import { AtestacaoMensal, StatusAtestacao } from './entities/atestacao-mensal.entity';

@Injectable()
export class AtestacaoService {
  private readonly logger = new Logger(AtestacaoService.name);

  constructor(
    @InjectRepository(Contrato)
    private contratoRepository: Repository<Contrato>,
    @InjectRepository(AtestacaoMensal)
    private atestacaoRepository: Repository<AtestacaoMensal>,
  ) {}

  // ============================================================================
  // ATESTAÇÕES MENSAIS
  // ============================================================================

  async criarAtestacao(contratoId: string, dados: Partial<AtestacaoMensal>): Promise<AtestacaoMensal> {
    const contrato = await this.validarContratoContinuado(contratoId);

    // Validar mês de referência
    if (!dados.mes_referencia || !/^\d{4}-\d{2}$/.test(dados.mes_referencia)) {
      throw new BadRequestException('mes_referencia deve estar no formato YYYY-MM');
    }

    // Verificar se já existe atestação para este mês
    const existente = await this.atestacaoRepository.findOne({
      where: { contrato_id: contratoId, mes_referencia: dados.mes_referencia },
    });
    if (existente) {
      throw new BadRequestException(
        `Já existe atestação para o mês ${dados.mes_referencia} neste contrato`
      );
    }

    const [ano, mes] = dados.mes_referencia.split('-').map(Number);

    const atestacao = this.atestacaoRepository.create({
      contrato_id: contratoId,
      mes_referencia: dados.mes_referencia,
      ano,
      mes,
      valor_mensal_contratado: dados.valor_mensal_contratado,
      status: StatusAtestacao.PENDENTE,
      empenho: (dados as any).empenho || undefined,
      data_empenho: (dados as any).data_empenho ? new Date((dados as any).data_empenho) : undefined,
      tipo_empenho: (dados as any).tipo_empenho || undefined,
    });

    return this.atestacaoRepository.save(atestacao);
  }

  async listarAtestacoes(contratoId: string): Promise<AtestacaoMensal[]> {
    return this.atestacaoRepository.find({
      where: { contrato_id: contratoId },
      order: { mes_referencia: 'ASC' },
    });
  }

  async buscarAtestacao(atestacaoId: string): Promise<AtestacaoMensal> {
    const atestacao = await this.atestacaoRepository.findOne({ where: { id: atestacaoId } });
    if (!atestacao) throw new NotFoundException('Atestação não encontrada');
    return atestacao;
  }

  async atestar(atestacaoId: string, dados: {
    valor_atestado: number;
    valor_glosa?: number;
    nota_imr?: number;
    criterios_imr?: any[];
    justificativa_glosa?: string;
    fiscal_id: string;
    fiscal_nome: string;
    observacoes?: string;
  }): Promise<AtestacaoMensal> {
    const atestacao = await this.buscarAtestacao(atestacaoId);

    if (atestacao.status !== StatusAtestacao.PENDENTE) {
      throw new BadRequestException('Apenas atestações pendentes podem ser atestadas');
    }

    const valorGlosa = dados.valor_glosa || 0;
    const valorLiquido = dados.valor_atestado - valorGlosa;

    if (valorLiquido < 0) {
      throw new BadRequestException('Valor líquido não pode ser negativo');
    }

    // Verificar saldo do contrato
    const contrato = await this.contratoRepository.findOne({ where: { id: atestacao.contrato_id } });
    if (contrato) {
      const saldoAtual = await this.calcularSaldo(atestacao.contrato_id);
      if (valorLiquido > saldoAtual) {
        throw new BadRequestException(
          `Valor líquido (R$ ${valorLiquido.toFixed(2)}) excede o saldo disponível (R$ ${saldoAtual.toFixed(2)})`
        );
      }
    }

    atestacao.valor_atestado = dados.valor_atestado;
    atestacao.valor_glosa = valorGlosa;
    atestacao.valor_liquido = valorLiquido;
    if (dados.nota_imr != null) atestacao.nota_imr = dados.nota_imr;
    if (dados.criterios_imr) atestacao.criterios_imr = dados.criterios_imr as any;
    if (dados.justificativa_glosa) atestacao.justificativa_glosa = dados.justificativa_glosa;
    atestacao.fiscal_id = dados.fiscal_id;
    atestacao.fiscal_nome = dados.fiscal_nome;
    atestacao.data_atestacao = new Date() as any;
    if (dados.observacoes) atestacao.observacoes = dados.observacoes;

    if (valorGlosa > 0) {
      atestacao.status = StatusAtestacao.ATESTADA_COM_GLOSA;
    } else {
      atestacao.status = StatusAtestacao.ATESTADA;
    }

    this.logger.log(
      `Atestação ${atestacao.mes_referencia} do contrato ${atestacao.contrato_id}: ` +
      `atestado R$ ${dados.valor_atestado}, glosa R$ ${valorGlosa}, líquido R$ ${valorLiquido}`
    );

    return this.atestacaoRepository.save(atestacao);
  }

  async rejeitarAtestacao(atestacaoId: string, dados: {
    fiscal_id: string;
    fiscal_nome: string;
    observacoes: string;
  }): Promise<AtestacaoMensal> {
    const atestacao = await this.buscarAtestacao(atestacaoId);

    if (atestacao.status !== StatusAtestacao.PENDENTE) {
      throw new BadRequestException('Apenas atestações pendentes podem ser rejeitadas');
    }

    atestacao.status = StatusAtestacao.REJEITADA;
    atestacao.fiscal_id = dados.fiscal_id;
    atestacao.fiscal_nome = dados.fiscal_nome;
    atestacao.data_atestacao = new Date() as any;
    atestacao.observacoes = dados.observacoes;

    return this.atestacaoRepository.save(atestacao);
  }

  /**
   * Reabre uma atestação rejeitada, voltando-a para PENDENTE para permitir novo ateste.
   */
  async reabrirAtestacao(atestacaoId: string): Promise<AtestacaoMensal> {
    const atestacao = await this.buscarAtestacao(atestacaoId);

    if (atestacao.status !== StatusAtestacao.REJEITADA) {
      throw new BadRequestException('Apenas atestações rejeitadas podem ser reabertas');
    }

    atestacao.status = StatusAtestacao.PENDENTE;
    atestacao.valor_atestado = null as any;
    atestacao.valor_glosa = 0 as any;
    atestacao.valor_liquido = null as any;
    atestacao.nota_imr = null as any;
    atestacao.criterios_imr = null as any;
    atestacao.fiscal_id = null as any;
    atestacao.fiscal_nome = null as any;
    atestacao.data_atestacao = null as any;
    atestacao.observacoes = null as any;

    this.logger.log(`Atestação ${atestacao.mes_referencia} do contrato ${atestacao.contrato_id}: reaberta para PENDENTE`);
    return this.atestacaoRepository.save(atestacao);
  }

  /**
   * Pré-cria atestações em lote para contratos com valor mensal fixo.
   * Cria uma atestação para cada mês entre data_inicio e data_fim.
   * Meses que já possuem atestação são ignorados.
   */
  async preCriarAtestacoesEmLote(
    contratoId: string,
    dados: {
      valor_mensal: number;
      data_inicio: string; // YYYY-MM-DD
      data_fim: string;    // YYYY-MM-DD
      empenho?: string;
      data_empenho?: string;
      tipo_empenho?: 'GLOBAL' | 'ESTIMATIVO';
    },
  ): Promise<{ criadas: number; ignoradas: number; meses: string[] }> {
    const contrato = await this.validarContratoContinuado(contratoId);

    const valorMensal = Number(dados.valor_mensal);
    if (valorMensal <= 0) {
      throw new BadRequestException('Valor mensal deve ser maior que zero');
    }

    const inicio = new Date(dados.data_inicio);
    const fim = new Date(dados.data_fim);
    if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) {
      throw new BadRequestException('Datas de início e fim devem ser válidas');
    }
    if (inicio > fim) {
      throw new BadRequestException('Data de início deve ser anterior à data de fim');
    }

    const valorGlobal = Number(contrato.valor_global);
    const meses: string[] = [];
    // Número de meses entre início e fim (exclusive do mês da data fim).
    // Ex: 15/01/2026 a 15/01/2027 = 12 meses (Jan/2026 até Dez/2026).
    const numMeses = (fim.getFullYear() - inicio.getFullYear()) * 12 + (fim.getMonth() - inicio.getMonth());
    for (let i = 0; i < numMeses; i++) {
      const ano = inicio.getFullYear();
      const mes = inicio.getMonth() + i;
      const dataAtual = new Date(ano, mes, 1);
      const mesRef = `${dataAtual.getFullYear()}-${String(dataAtual.getMonth() + 1).padStart(2, '0')}`;
      meses.push(mesRef);
    }

    const totalValor = meses.length * valorMensal;
    if (totalValor > valorGlobal + 0.01) {
      throw new BadRequestException(
        `Soma dos valores (${meses.length} x R$ ${valorMensal.toFixed(2)} = R$ ${totalValor.toFixed(2)}) ` +
        `excede o valor global do contrato (R$ ${valorGlobal.toFixed(2)})`,
      );
    }

    let criadas = 0;
    let ignoradas = 0;

    for (const mesRef of meses) {
      const existente = await this.atestacaoRepository.findOne({
        where: { contrato_id: contratoId, mes_referencia: mesRef },
      });
      if (existente) {
        ignoradas++;
        continue;
      }

      const [ano, mes] = mesRef.split('-').map(Number);
      const atestacao = this.atestacaoRepository.create({
        contrato_id: contratoId,
        mes_referencia: mesRef,
        ano,
        mes,
        valor_mensal_contratado: valorMensal,
        status: StatusAtestacao.PENDENTE,
        ...(dados.empenho && { empenho: dados.empenho }),
        ...(dados.data_empenho && { data_empenho: new Date(dados.data_empenho) }),
        ...(dados.tipo_empenho && { tipo_empenho: dados.tipo_empenho }),
      });
      await this.atestacaoRepository.save(atestacao);
      criadas++;
    }

    this.logger.log(
      `Pré-criação em lote contrato ${contratoId}: ${criadas} atestações criadas, ${ignoradas} ignoradas (já existiam)`,
    );

    return { criadas, ignoradas, meses };
  }

  async resumoAtestacoes(contratoId: string) {
    const contrato = await this.validarContratoContinuado(contratoId);
    const atestacoes = await this.listarAtestacoes(contratoId);

    const atestadas = atestacoes.filter(
      a => a.status === StatusAtestacao.ATESTADA || a.status === StatusAtestacao.ATESTADA_COM_GLOSA
    );
    const valorAtestadoTotal = atestadas.reduce((sum, a) => sum + Number(a.valor_liquido || 0), 0);
    const valorGlosaTotal = atestadas.reduce((sum, a) => sum + Number(a.valor_glosa || 0), 0);

    const notasImr = atestadas.filter(a => a.nota_imr != null).map(a => Number(a.nota_imr));
    const mediaImr = notasImr.length > 0
      ? notasImr.reduce((sum, n) => sum + n, 0) / notasImr.length
      : null;

    return {
      contrato_id: contratoId,
      valor_global: Number(contrato.valor_global),
      valor_atestado_total: valorAtestadoTotal,
      valor_glosa_total: valorGlosaTotal,
      saldo_disponivel: Number(contrato.valor_global) - valorAtestadoTotal,
      total_meses: atestacoes.length,
      meses_atestados: atestadas.length,
      meses_pendentes: atestacoes.filter(a => a.status === StatusAtestacao.PENDENTE).length,
      media_imr: mediaImr,
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async validarContratoContinuado(contratoId: string): Promise<Contrato> {
    const contrato = await this.contratoRepository.findOne({ where: { id: contratoId } });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');

    if (contrato.modalidade_execucao !== ModalidadeExecucao.CONTINUADO) {
      throw new BadRequestException(
        `Contrato ${contrato.numero_contrato} não é da modalidade CONTINUADO (atual: ${contrato.modalidade_execucao})`
      );
    }

    return contrato;
  }

  private async calcularSaldo(contratoId: string): Promise<number> {
    const contrato = await this.contratoRepository.findOne({ where: { id: contratoId } });
    if (!contrato) return 0;

    const atestadas = await this.atestacaoRepository.find({
      where: [
        { contrato_id: contratoId, status: StatusAtestacao.ATESTADA },
        { contrato_id: contratoId, status: StatusAtestacao.ATESTADA_COM_GLOSA },
      ],
    });

    const valorConsumido = atestadas.reduce((sum, a) => sum + Number(a.valor_liquido || 0), 0);
    return Number(contrato.valor_global) - valorConsumido;
  }
}
