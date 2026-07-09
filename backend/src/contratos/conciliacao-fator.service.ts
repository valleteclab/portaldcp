/**
 * ============================================================================
 * CONCILIAÇÃO SISTEMA × PORTAL FATOR TRANSPARÊNCIA
 * ============================================================================
 *
 * Compara a execução registrada no sistema (migração + medições aprovadas)
 * com a execução orçamentária do portal de transparência (liquidado/pago),
 * por exercício (competência), e roda checagens internas de consistência.
 *
 * Regras aprendidas no caso 081/2021 (REGIS):
 * - Comparar com LIQUIDADO, não com empenhado (empenho pode ter sobras).
 * - Mês corrente medido e ainda não liquidado é defasagem NORMAL → a
 *   tolerância padrão é 1× o maior valor mensal do contrato.
 * - valor_migracao_reais é baseline pré-sistema; para itens MENSAL, as
 *   competências da migração são os meses sequenciais a partir do início
 *   da vigência (ou renovação de ciclo).
 *
 * ============================================================================
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contrato, ModalidadeExecucao } from './entities/contrato.entity';
import { Medicao, StatusMedicao } from './entities/medicao.entity';
import { ItemCronograma } from './entities/item-cronograma.entity';
import { FatorTransparenciaService } from './fator-transparencia.service';

export interface AlertaConsistencia {
  tipo:
    | 'MIGRACAO_INCONSISTENTE'
    | 'QUANTIDADE_EXCEDIDA'
    | 'ACUMULADO_EXCEDE_GLOBAL'
    | 'SNAPSHOT_NAO_MONOTONICO';
  mensagem: string;
}

export interface ConciliacaoResultado {
  contrato_id: string;
  numero_contrato: string;
  exercicio: number;
  /** Execução por competência no exercício (migração atribuível + medições aprovadas) */
  sistema: {
    migracao_no_exercicio: number;
    medido_aprovado_no_exercicio: number;
    total_no_exercicio: number;
    /** Acumulado geral da vigência (migração total + todas medições aprovadas) */
    acumulado_vigencia: number;
    valor_global: number;
    a_executar: number;
    ultima_medicao?: {
      numero: number;
      periodo_fim: string;
      valor: number;
    } | null;
  };
  fator: {
    disponivel: boolean;
    total_empenhado_liquido: number;
    total_liquidado: number;
    total_pago: number;
    saldo_a_liquidar: number;
  };
  /** sistema.total_no_exercicio − fator.total_liquidado (positivo = sistema à frente) */
  diferenca: number;
  tolerancia: number;
  status: 'CONCILIADO' | 'DIVERGENTE' | 'SEM_DADOS_FATOR';
  /**
   * true quando a vigência ultrapassa o exercício: o empenho do ano corrente
   * cobre só até dezembro; o restante depende de apostilamento/novo empenho no
   * exercício seguinte. Nesse caso o saldo do empenho NÃO é o saldo do contrato.
   */
  atravessa_exercicios: boolean;
  /** Observação explicativa (ex.: liquidado maior por pagamentos do ciclo anterior) */
  nota?: string;
  alertas: AlertaConsistencia[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;

@Injectable()
export class ConciliacaoFatorService {
  private readonly logger = new Logger(ConciliacaoFatorService.name);

  constructor(
    @InjectRepository(Contrato)
    private readonly contratoRepo: Repository<Contrato>,
    @InjectRepository(Medicao)
    private readonly medicaoRepo: Repository<Medicao>,
    @InjectRepository(ItemCronograma)
    private readonly itemCronogramaRepo: Repository<ItemCronograma>,
    private readonly fator: FatorTransparenciaService,
  ) {}

  /**
   * Checagens internas de consistência (não dependem do portal).
   * São as que teriam detectado o caso 081/2021 antes da correção.
   */
  async checarConsistencia(contratoId: string): Promise<AlertaConsistencia[]> {
    const alertas: AlertaConsistencia[] = [];
    const contrato = await this.contratoRepo.findOne({ where: { id: contratoId } });
    if (!contrato) return alertas;
    const itens = await this.itemCronogramaRepo.find({ where: { contrato_id: contratoId } });
    const medicoes = await this.medicaoRepo.find({
      where: { contrato_id: contratoId, status: StatusMedicao.APROVADA },
      order: { numero_medicao: 'ASC' },
    });
    const totalAprovado = medicoes.reduce((s, m) => s + Number(m.valor_medido || 0), 0);

    // Renovação de ciclo zera quantidade_medida: só medições do CICLO ATUAL
    // contam na comparação com quantidade_medida (medições anteriores à
    // renovação pertencem ao ciclo anterior — ex.: 025A/2023).
    const inicioCiclo = contrato.data_renovacao_ciclo
      ? new Date(contrato.data_renovacao_ciclo as any)
      : null;
    const medicoesCiclo = inicioCiclo
      ? medicoes.filter((m) => new Date(m.periodo_inicio as any) >= inicioCiclo)
      : medicoes;

    // Quantidade aprovada POR ITEM no ciclo atual (contrato pode ter vários itens
    // e nem toda medição mede todos)
    const idsCiclo = medicoesCiclo.map((m) => m.id);
    const qtdAprovadaPorItem = new Map<string, number>();
    if (idsCiclo.length > 0) {
      const rows: Array<{ item_cronograma_id: string; qtd: string }> =
        await this.medicaoRepo.manager.query(
          `SELECT item_cronograma_id, COALESCE(SUM(quantidade_medida),0) AS qtd
           FROM itens_medicao_item WHERE medicao_id = ANY($1) GROUP BY item_cronograma_id`,
          [idsCiclo],
        );
      for (const r of rows) qtdAprovadaPorItem.set(r.item_cronograma_id, Number(r.qtd));
    }

    let migracaoTotal = 0;
    for (const it of itens) {
      const vu = Number(it.valor_unitario || 0);
      const migracao = Number(it.valor_migracao_reais || 0);
      migracaoTotal += migracao;

      // 1) Item MENSAL com migração: migração(meses) + aprovadas do ciclo ≟ quantidade_medida
      if (it.unidade_medida === 'MENSAL' && migracao > 0 && vu > 0) {
        const mesesMigracao = migracao / vu;
        const mesesAprovados = qtdAprovadaPorItem.get(it.id) ?? 0;
        const esperado = mesesMigracao + mesesAprovados;
        const atual = Number(it.quantidade_medida || 0);
        if (Math.abs(esperado - atual) > 0.05) {
          alertas.push({
            tipo: 'MIGRACAO_INCONSISTENTE',
            mensagem:
              `Item ${it.numero_item}: migração (${mesesMigracao.toFixed(2)} meses = R$ ${migracao.toFixed(2)}) ` +
              `+ ${mesesAprovados.toFixed(2)} meses aprovados no ciclo = ${esperado.toFixed(2)}, mas quantidade_medida = ${atual.toFixed(2)}. ` +
              `Possível sobreposição entre migração e medições (dupla contagem).`,
          });
        }
      }

      // 2) Quantidade medida acima da contratada
      if (Number(it.quantidade_medida || 0) > Number(it.quantidade || 0) * (Number(it.quantidade_meses) || 1) + 0.01) {
        alertas.push({
          tipo: 'QUANTIDADE_EXCEDIDA',
          mensagem: `Item ${it.numero_item}: quantidade medida (${Number(it.quantidade_medida).toFixed(2)}) excede a contratada.`,
        });
      }
    }

    // 3) Acumulado financeiro acima do valor global
    const acumulado = r2(migracaoTotal + totalAprovado);
    if (acumulado > Number(contrato.valor_global || 0) + 0.05) {
      alertas.push({
        tipo: 'ACUMULADO_EXCEDE_GLOBAL',
        mensagem:
          `Acumulado (migração R$ ${migracaoTotal.toFixed(2)} + aprovadas R$ ${totalAprovado.toFixed(2)} = R$ ${acumulado.toFixed(2)}) ` +
          `excede o valor global (R$ ${Number(contrato.valor_global).toFixed(2)}).`,
      });
    }

    // 4) Snapshot de execução fiscal não-monotônico (ex.: 9 → 10 → 8 → 12)
    // Só medições do ciclo atual — a renovação zera o contador de meses.
    const mesesSeq: number[] = [];
    for (const m of medicoesCiclo) {
      const ef: any = m.execucao_fiscal;
      const meses = Number(ef?.meses_executados);
      if (Number.isFinite(meses)) mesesSeq.push(meses);
    }
    for (let i = 1; i < mesesSeq.length; i++) {
      if (mesesSeq[i] < mesesSeq[i - 1] || mesesSeq[i] - mesesSeq[i - 1] > 2) {
        alertas.push({
          tipo: 'SNAPSHOT_NAO_MONOTONICO',
          mensagem:
            `Execução fiscal dos boletins não progride 1 mês por medição: sequência [${mesesSeq.join(', ')}]. ` +
            `Snapshots podem ter sido gerados por fórmulas diferentes.`,
        });
        break;
      }
    }

    return alertas;
  }

  /**
   * Conciliação do contrato com o portal Fator para um exercício.
   * Compara execução por competência (sistema) × liquidado (portal).
   */
  async conciliarContrato(
    contratoId: string,
    exercicio?: number,
  ): Promise<ConciliacaoResultado> {
    const contrato = await this.contratoRepo.findOne({ where: { id: contratoId } });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    const ano = exercicio || new Date().getFullYear();

    const itens = await this.itemCronogramaRepo.find({ where: { contrato_id: contratoId } });
    const medicoes = await this.medicaoRepo.find({
      where: { contrato_id: contratoId, status: StatusMedicao.APROVADA },
      order: { numero_medicao: 'ASC' },
    });

    // ---- Sistema: competência no exercício ----
    const medicoesAno = medicoes.filter(
      (m) => new Date(m.periodo_fim as any).getFullYear() === ano,
    );
    const medidoAno = r2(medicoesAno.reduce((s, m) => s + Number(m.valor_medido || 0), 0));

    // Migração atribuível ao exercício: para itens MENSAL, as competências da
    // migração são meses sequenciais a partir do início da vigência/ciclo.
    const inicioBase = contrato.data_renovacao_ciclo || contrato.data_vigencia_inicio;
    let migracaoAno = 0;
    let migracaoTotal = 0;
    let maiorValorMensal = 0;
    for (const it of itens) {
      const vu = Number(it.valor_unitario || 0);
      const migracao = Number(it.valor_migracao_reais || 0);
      migracaoTotal += migracao;
      if (it.unidade_medida === 'MENSAL' && vu > 0) {
        maiorValorMensal = Math.max(maiorValorMensal, vu);
        if (migracao > 0 && inicioBase) {
          // Consome o valor da migração mês a mês a partir do início do ciclo,
          // suportando frações (ex.: 11 dias = 0,37 mês no caso 025A/2023).
          const inicio = new Date(inicioBase as any);
          let restante = migracao;
          let k = 0;
          while (restante > 0.005 && k < 60) {
            const parcela = Math.min(vu, restante);
            const comp = new Date(inicio.getFullYear(), inicio.getMonth() + k, 1);
            if (comp.getFullYear() === ano) migracaoAno += parcela;
            restante -= parcela;
            k++;
          }
        }
      }
    }
    migracaoAno = r2(migracaoAno);
    const totalSistemaAno = r2(migracaoAno + medidoAno);
    const acumuladoVigencia = r2(
      migracaoTotal + medicoes.reduce((s, m) => s + Number(m.valor_medido || 0), 0),
    );
    const valorGlobal = Number(contrato.valor_global || 0);

    // ---- Fator: liquidado no exercício ----
    let fatorDisponivel = false;
    let liquidadoAno = 0;
    let pagoAno = 0;
    let empenhadoLiquidoAno = 0;
    let saldoALiquidarAno = 0;
    try {
      const empenhos = await this.fator.buscarEmpenhos({
        nContrato: contrato.numero_contrato,
        cpfcnpj: contrato.fornecedor_cnpj,
        ano: contrato.ano ?? ano,
      });
      if (empenhos.length > 0) {
        const resumo = this.fator.calcularResumo(empenhos, {
          valor_global: valorGlobal,
          ano_contrato: contrato.ano ?? ano,
        });
        const grupoAno = resumo.grupos_exercicio?.find((g) => g.ano === ano);
        if (grupoAno) {
          fatorDisponivel = true;
          liquidadoAno = r2(Number(grupoAno.total_liquidado || 0));
          pagoAno = r2(Number(grupoAno.total_pago || 0));
          empenhadoLiquidoAno = r2(Number(grupoAno.total_empenhado_liquido || 0));
          saldoALiquidarAno = r2(Number(grupoAno.saldo_a_liquidar ?? empenhadoLiquidoAno - liquidadoAno));
        } else if (resumo.resumo) {
          // Sem grupo do ano: usa totais gerais como aproximação sinalizada
          fatorDisponivel = true;
          liquidadoAno = r2(Number(resumo.resumo.total_liquidado || 0));
          pagoAno = r2(Number(resumo.resumo.total_pago || 0));
          empenhadoLiquidoAno = r2(Number(resumo.resumo.total_empenhado || 0));
          saldoALiquidarAno = r2(empenhadoLiquidoAno - liquidadoAno);
        }
      }
    } catch (err) {
      this.logger.warn(`Conciliação: falha ao consultar Fator p/ contrato ${contrato.numero_contrato}: ${err.message}`);
    }

    // ---- Comparação ----
    const diferenca = r2(totalSistemaAno - liquidadoAno);
    // Tolerância: 1× o maior valor mensal (última medição pode ainda não estar liquidada)
    const tolerancia = r2(maiorValorMensal || valorGlobal * 0.1);
    const ultima = medicoes.length > 0 ? medicoes[medicoes.length - 1] : null;

    const alertas = await this.checarConsistencia(contratoId);

    return {
      contrato_id: contrato.id,
      numero_contrato: contrato.numero_contrato,
      exercicio: ano,
      sistema: {
        migracao_no_exercicio: migracaoAno,
        medido_aprovado_no_exercicio: medidoAno,
        total_no_exercicio: totalSistemaAno,
        acumulado_vigencia: acumuladoVigencia,
        valor_global: valorGlobal,
        a_executar: r2(valorGlobal - acumuladoVigencia),
        ultima_medicao: ultima
          ? {
              numero: ultima.numero_medicao,
              periodo_fim: String(ultima.periodo_fim),
              valor: r2(Number(ultima.valor_medido || 0)),
            }
          : null,
      },
      fator: {
        disponivel: fatorDisponivel,
        total_empenhado_liquido: empenhadoLiquidoAno,
        total_liquidado: liquidadoAno,
        total_pago: pagoAno,
        saldo_a_liquidar: saldoALiquidarAno,
      },
      diferenca,
      tolerancia,
      ...(() => {
        // Status direcional:
        // - sistema > liquidado além da tolerância → DIVERGENTE (medição aprovada
        //   e não liquidada — caso acionável).
        // - liquidado > sistema: com renovação de ciclo no exercício é ESPERADO
        //   (o portal liquida também competências do ciclo anterior que não estão
        //   no sistema — ex.: 025A/2023); sem ciclo, sinaliza pagamento sem medição.
        const renovacaoNoExercicio =
          contrato.data_renovacao_ciclo &&
          new Date(contrato.data_renovacao_ciclo as any).getFullYear() === ano;
        if (!fatorDisponivel) return { status: 'SEM_DADOS_FATOR' as const };
        if (diferenca > tolerancia + 0.05) return { status: 'DIVERGENTE' as const };
        if (diferenca < -(tolerancia + 0.05)) {
          if (renovacaoNoExercicio) {
            return {
              status: 'CONCILIADO' as const,
              nota:
                `Liquidado no portal (${liquidadoAno.toFixed(2)}) supera a competência registrada no sistema — ` +
                `esperado: o ciclo foi renovado em ${ano} e o portal inclui pagamentos do ciclo anterior, ` +
                `que não são acompanhados neste ciclo do sistema.`,
            };
          }
          return {
            status: 'DIVERGENTE' as const,
            nota: 'Liquidado no portal supera o registrado no sistema — verifique pagamentos sem medição correspondente.',
          };
        }
        return { status: 'CONCILIADO' as const };
      })(),
      atravessa_exercicios: contrato.data_vigencia_fim
        ? new Date(contrato.data_vigencia_fim as any).getFullYear() > ano
        : false,
      alertas,
    };
  }

  /**
   * Medições APROVADAS há mais de `dias` dias cujo valor ainda não aparece no
   * LIQUIDADO do portal — sinal de que o processo físico de pagamento pode não
   * ter sido encaminhado à contabilidade (última perna do fluxo é manual).
   *
   * Critério por contrato/exercício: liquidado(Fator) deve cobrir o acumulado
   * por competência até cada medição (migração do exercício + aprovadas até ela).
   */
  async verificarMedicoesNaoLiquidadas(
    orgaoId: string,
    dias = 15,
  ): Promise<Array<{
    contrato_id: string;
    numero_contrato: string;
    fornecedor: string;
    medicao_id: string;
    numero_medicao: number;
    valor: number;
    data_aprovacao: string;
    dias_desde_aprovacao: number;
    liquidado_fator: number;
    esperado_ate_medicao: number;
  }>> {
    const limite = new Date();
    limite.setDate(limite.getDate() - dias);

    const contratos = await this.contratoRepo.find({
      where: { orgao_id: orgaoId, modalidade_execucao: ModalidadeExecucao.MEDICAO, status: 'VIGENTE' as any },
      select: ['id', 'numero_contrato', 'fornecedor_razao_social', 'fornecedor_cnpj', 'ano', 'valor_global', 'data_vigencia_inicio', 'data_renovacao_ciclo', 'data_vigencia_fim'],
    });

    const pendentes: any[] = [];
    for (const c of contratos) {
      const medicoes = await this.medicaoRepo.find({
        where: { contrato_id: c.id, status: StatusMedicao.APROVADA },
        order: { numero_medicao: 'ASC' },
      });
      // Candidatas: aprovadas há mais de `dias`
      const candidatas = medicoes.filter((m) => {
        const aprov = m.data_aprovacao ? new Date(m.data_aprovacao as any) : null;
        return aprov && aprov <= limite;
      });
      if (candidatas.length === 0) continue;

      // Uma consulta Fator por contrato (só quando há candidatas)
      let conc: ConciliacaoResultado;
      try {
        conc = await this.conciliarContrato(c.id);
      } catch {
        continue;
      }
      if (!conc.fator.disponivel) continue;

      const ano = conc.exercicio;
      // Acumulado por competência até cada medição do exercício
      const aprovadasAno = medicoes.filter(
        (m) => new Date(m.periodo_fim as any).getFullYear() === ano,
      );
      let acumulado = conc.sistema.migracao_no_exercicio;
      const acumuladoAte = new Map<string, number>();
      for (const m of aprovadasAno) {
        acumulado = r2(acumulado + Number(m.valor_medido || 0));
        acumuladoAte.set(m.id, acumulado);
      }

      for (const m of candidatas) {
        const esperado = acumuladoAte.get(m.id);
        if (esperado == null) continue; // medição de outro exercício
        if (esperado > conc.fator.total_liquidado + 0.05) {
          const aprov = new Date(m.data_aprovacao as any);
          pendentes.push({
            contrato_id: c.id,
            numero_contrato: c.numero_contrato,
            fornecedor: c.fornecedor_razao_social,
            medicao_id: m.id,
            numero_medicao: m.numero_medicao,
            valor: r2(Number(m.valor_medido || 0)),
            data_aprovacao: aprov.toISOString().slice(0, 10),
            dias_desde_aprovacao: Math.floor((Date.now() - aprov.getTime()) / 86400000),
            liquidado_fator: conc.fator.total_liquidado,
            esperado_ate_medicao: esperado,
          });
        }
      }
    }
    return pendentes;
  }

  /**
   * Auditoria em lote: roda as checagens internas (e opcionalmente a conciliação
   * Fator) em todos os contratos de MEDICAO do órgão.
   */
  async auditarContratos(
    orgaoId: string,
    opts: { comFator?: boolean } = {},
  ): Promise<Array<{
    contrato_id: string;
    numero_contrato: string;
    fornecedor: string;
    status_contrato: string;
    alertas: AlertaConsistencia[];
    conciliacao?: Pick<ConciliacaoResultado, 'status' | 'diferenca' | 'tolerancia' | 'fator'> | null;
  }>> {
    const contratos = await this.contratoRepo.find({
      where: { orgao_id: orgaoId, modalidade_execucao: ModalidadeExecucao.MEDICAO },
      select: ['id', 'numero_contrato', 'fornecedor_razao_social', 'status'],
      order: { numero_contrato: 'ASC' },
    });
    const resultado = [];
    for (const c of contratos) {
      const alertas = await this.checarConsistencia(c.id);
      let conciliacao: any = null;
      if (opts.comFator) {
        try {
          const r = await this.conciliarContrato(c.id);
          conciliacao = { status: r.status, diferenca: r.diferenca, tolerancia: r.tolerancia, fator: r.fator };
        } catch {
          conciliacao = null;
        }
      }
      resultado.push({
        contrato_id: c.id,
        numero_contrato: c.numero_contrato,
        fornecedor: c.fornecedor_razao_social,
        status_contrato: c.status,
        alertas,
        conciliacao,
      });
    }
    return resultado;
  }
}
