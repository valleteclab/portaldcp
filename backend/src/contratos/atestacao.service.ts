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
      ...dados,
      contrato_id: contratoId,
      ano,
      mes,
      status: StatusAtestacao.PENDENTE,
    });

    return this.atestacaoRepository.save(atestacao);
  }

  async listarAtestacoes(contratoId: string): Promise<AtestacaoMensal[]> {
    return this.atestacaoRepository.find({
      where: { contrato_id: contratoId },
      order: { mes_referencia: 'DESC' },
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
