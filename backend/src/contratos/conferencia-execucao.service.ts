/**
 * ============================================================================
 * CONFERÊNCIA DE EXECUÇÃO — PAGAMENTOS DO EXERCÍCIO × MEDIÇÕES × SALDO
 * ============================================================================
 *
 * Painel de suporte: para cada contrato vigente, compara o que a contabilidade
 * PAGOU no exercício (portal da transparência) com o que o sistema registrou
 * (medições aprovadas + migração) e mostra o saldo resultante.
 *
 * Nasceu de uma auditoria manual que achou, em 2026, 18 contratos pagos sem
 * nenhuma medição e 23 pagando mais do que o medido. Sem isso, o saldo do
 * contrato fica alto e a medição do fornecedor volta da contabilidade.
 *
 * Só leitura: nada é alterado aqui. As correções continuam nas telas do
 * contrato (medição retroativa, ajuste de migração, processo do portal).
 * ============================================================================
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Contrato } from './entities/contrato.entity';
import { Medicao, StatusMedicao } from './entities/medicao.entity';
import { ItemCronograma } from './entities/item-cronograma.entity';
import { Requisicao, StatusRequisicao, TipoRequisicao } from '../almoxarifado/entities/requisicao.entity';
import { EmpenhoFator, FatorTransparenciaService } from './fator-transparencia.service';
import { casarPagamentosComOrdens, ROTULO_CRITERIO } from './ordem-paga.util';

export type SituacaoConferencia =
  | 'OK'
  | 'PAGO_SEM_MEDICAO'
  | 'PAGO_MAIOR_QUE_MEDIDO'
  | 'MEDIDO_MAIOR_QUE_PAGO'
  | 'SEM_PAGAMENTO_IDENTIFICADO';

export interface LinhaConferencia {
  contrato_id: string;
  numero_contrato: string;
  fornecedor: string;
  fornecedor_cnpj: string;
  valor_global: number;
  /** Pago no exercício, pelo portal. */
  pago_exercicio: number;
  /** Medições APROVADAS com competência no exercício. */
  medido_exercicio: number;
  /** Medições ainda em análise no exercício (submetida/ateste/aprovação). */
  em_analise_exercicio: number;
  /** Execução anterior ao sistema (migração), sem competência definida. */
  migracao: number;
  /** Saldo do contrato hoje: global − (migração + todas as medições aprovadas). */
  saldo_sistema: number;
  diferenca: number;
  situacao: SituacaoConferencia;
  quantidade_pagamentos: number;
  quantidade_medicoes: number;
  /** OS autorizadas sem medição (candidatas a lançamento retroativo). */
  ordens_sem_medicao: number;
  /** Portal não identificou o contrato (nº em branco e processo não cadastrado). */
  processo_portal_vazio: boolean;
}

export interface DetalheConferencia {
  contrato: {
    id: string;
    numero_contrato: string;
    fornecedor: string;
    valor_global: number;
    vigencia_inicio: string | null;
    vigencia_fim: string | null;
    data_renovacao_ciclo: string | null;
    processo_licitatorio_portal: string | null;
  };
  resumo: LinhaConferencia;
  pagamentos: Array<{
    numero_empenho: string;
    data: string;
    valor: number;
    bem_servico: string;
    os_citada?: string;
    confirmacao: string;
    /** Medição aprovada do mesmo mês, quando existe. */
    medicao_do_mes: number | null;
  }>;
  medicoes: Array<{
    id: string;
    numero_medicao: number;
    status: string;
    competencia: string | null;
    periodo_inicio: string | null;
    valor_medido: number;
    nota_fiscal_numero: string | null;
    lancamento_retroativo: boolean;
  }>;
  ordens_sem_medicao: Array<{
    requisicao_id: string;
    numero: string;
    valor: number;
    data_solicitacao: string | null;
    pagamento: { numero_empenho: string; data: string; valor: number; motivo: string } | null;
  }>;
  itens_migracao: Array<{
    numero_item: number;
    descricao: string;
    unidade_medida: string;
    quantidade: number;
    quantidade_medida: number;
    valor_unitario: number;
    valor_migracao_reais: number | null;
  }>;
}

const TOLERANCIA = 1; // R$ — diferenças de centavos não são divergência

@Injectable()
export class ConferenciaExecucaoService {
  private readonly logger = new Logger(ConferenciaExecucaoService.name);
  /** Portal é lento: guarda o resultado por CNPJ+ano durante alguns minutos. */
  private readonly cache = new Map<string, { em: number; empenhos: EmpenhoFator[] }>();
  private readonly VALIDADE_CACHE_MS = 10 * 60 * 1000;

  constructor(
    @InjectRepository(Contrato) private readonly contratoRepository: Repository<Contrato>,
    @InjectRepository(Medicao) private readonly medicaoRepository: Repository<Medicao>,
    @InjectRepository(ItemCronograma) private readonly itemCronogramaRepository: Repository<ItemCronograma>,
    @InjectRepository(Requisicao) private readonly requisicaoRepository: Repository<Requisicao>,
    private readonly fator: FatorTransparenciaService,
  ) {}

  private anoDaData(data?: string | null): number | null {
    const m = String(data || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? Number(m[3]) : null;
  }

  private mesDaData(data?: string | null): string | null {
    const m = String(data || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? `${m[3]}-${m[2]}` : null;
  }

  private async empenhosDoContrato(contrato: Contrato, ano: number): Promise<EmpenhoFator[]> {
    const chave = `${contrato.fornecedor_cnpj}|${ano}|${contrato.numero_contrato}`;
    const agora = Date.now();
    const cacheado = this.cache.get(chave);
    if (cacheado && agora - cacheado.em < this.VALIDADE_CACHE_MS) return cacheado.empenhos;
    try {
      const empenhos = await this.fator.buscarEmpenhos({
        nContrato: contrato.numero_contrato,
        cpfcnpj: contrato.fornecedor_cnpj,
        ano,
        processoLicitatorioPortal: contrato.processo_licitatorio_portal ?? undefined,
      });
      this.cache.set(chave, { em: agora, empenhos });
      return empenhos;
    } catch (err: any) {
      this.logger.warn(`Portal indisponível para ${contrato.numero_contrato}: ${err?.message}`);
      return cacheado?.empenhos ?? [];
    }
  }

  private situacao(pago: number, medido: number, diferenca: number, pagamentos: number): SituacaoConferencia {
    if (pagamentos === 0) return 'SEM_PAGAMENTO_IDENTIFICADO';
    if (pago > 0 && medido === 0) return 'PAGO_SEM_MEDICAO';
    if (diferenca > TOLERANCIA) return 'PAGO_MAIOR_QUE_MEDIDO';
    if (diferenca < -TOLERANCIA) return 'MEDIDO_MAIOR_QUE_PAGO';
    return 'OK';
  }

  private async montarLinha(contrato: Contrato, ano: number): Promise<LinhaConferencia> {
    const empenhos = await this.empenhosDoContrato(contrato, ano);
    const pagamentos = empenhos.filter(
      (e) => e.fase_tipo === 'PAGAMENTO' && e.confirmacao !== 'NAO_CONFIRMADO' && this.anoDaData(e.data) === ano,
    );
    const pago = pagamentos.reduce((s, p) => s + Number(p.valor || 0), 0);

    const medicoes = await this.medicaoRepository.find({ where: { contrato_id: contrato.id } });
    const doAno = (m: Medicao) => String(m.periodo_inicio || '').slice(0, 4) === String(ano);
    const aprovadasAno = medicoes.filter((m) => m.status === StatusMedicao.APROVADA && doAno(m));
    const emAnalise = medicoes.filter(
      (m) =>
        doAno(m) &&
        [
          StatusMedicao.SUBMETIDA,
          StatusMedicao.PARCIALMENTE_ATESTADA,
          StatusMedicao.AGUARDANDO_APROVACAO,
        ].includes(m.status),
    );
    const medido = aprovadasAno.reduce((s, m) => s + Number(m.valor_medido || 0), 0);
    const aprovadasTotal = medicoes
      .filter((m) => m.status === StatusMedicao.APROVADA)
      .reduce((s, m) => s + Number(m.valor_medido || 0), 0);

    const itens = await this.itemCronogramaRepository.find({ where: { contrato_id: contrato.id } });
    const medidoItens = itens.reduce(
      (s, i) => s + Number(i.quantidade_medida || 0) * Number(i.valor_unitario || 0),
      0,
    );
    const migracaoDeclarada = Number(contrato.valor_executado_anterior || 0);
    const executadoTotal = Math.max(aprovadasTotal + migracaoDeclarada, medidoItens);
    const migracao = Math.max(0, +(executadoTotal - aprovadasTotal).toFixed(2));

    const ordens = await this.requisicaoRepository.count({
      where: {
        contrato_id: contrato.id,
        tipo: TipoRequisicao.ORDEM_SERVICO,
        status: In([StatusRequisicao.AUTORIZADA, StatusRequisicao.ORDEM_GERADA]),
      },
    });
    const idsComMedicao = new Set(medicoes.map((m) => m.requisicao_id).filter(Boolean));

    const diferenca = +(pago - medido).toFixed(2);
    return {
      contrato_id: contrato.id,
      numero_contrato: contrato.numero_contrato,
      fornecedor: contrato.fornecedor_razao_social || '',
      fornecedor_cnpj: contrato.fornecedor_cnpj || '',
      valor_global: Number(contrato.valor_global || 0),
      pago_exercicio: +pago.toFixed(2),
      medido_exercicio: +medido.toFixed(2),
      em_analise_exercicio: +emAnalise.reduce((s, m) => s + Number(m.valor_medido || 0), 0).toFixed(2),
      migracao,
      saldo_sistema: +(Number(contrato.valor_global || 0) - executadoTotal).toFixed(2),
      diferenca,
      situacao: this.situacao(pago, medido, diferenca, pagamentos.length),
      quantidade_pagamentos: pagamentos.length,
      quantidade_medicoes: aprovadasAno.length,
      ordens_sem_medicao: Math.max(0, ordens - idsComMedicao.size),
      processo_portal_vazio: !contrato.processo_licitatorio_portal,
    };
  }

  /** Uma linha por contrato vigente do órgão, no exercício informado. */
  async listar(orgaoId: string, ano: number): Promise<{ ano: number; linhas: LinhaConferencia[] }> {
    const contratos = await this.contratoRepository.find({
      where: { orgao_id: orgaoId, status: 'VIGENTE' as any },
      order: { numero_contrato: 'ASC' },
    });
    const comCnpj = contratos.filter((c) => (c.fornecedor_cnpj || '').replace(/\D/g, '').length === 14);

    const linhas: LinhaConferencia[] = [];
    // De 4 em 4: o portal responde devagar e derruba consultas em paralelo demais
    for (let i = 0; i < comCnpj.length; i += 4) {
      const lote = await Promise.all(
        comCnpj.slice(i, i + 4).map((c) => this.montarLinha(c, ano)),
      );
      linhas.push(...lote);
    }
    return { ano, linhas };
  }

  /** Detalhe de um contrato: pagamentos, medições, OS sem medição e migração. */
  async detalhar(contratoId: string, ano: number): Promise<DetalheConferencia> {
    const contrato = await this.contratoRepository.findOne({ where: { id: contratoId } });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');

    const [resumo, empenhos, medicoes, itens] = await Promise.all([
      this.montarLinha(contrato, ano),
      this.empenhosDoContrato(contrato, ano),
      this.medicaoRepository.find({ where: { contrato_id: contratoId }, order: { numero_medicao: 'ASC' } }),
      this.itemCronogramaRepository.find({ where: { contrato_id: contratoId }, order: { numero_item: 'ASC' } }),
    ]);

    const aprovadasPorMes = new Map<string, number>();
    for (const m of medicoes) {
      if (m.status !== StatusMedicao.APROVADA) continue;
      const mes = String(m.periodo_inicio || '').slice(0, 7);
      if (mes) aprovadasPorMes.set(mes, (aprovadasPorMes.get(mes) || 0) + Number(m.valor_medido || 0));
    }

    const pagamentos = empenhos
      .filter((e) => e.fase_tipo === 'PAGAMENTO' && this.anoDaData(e.data) === ano)
      .map((e) => ({
        numero_empenho: e.numero_empenho,
        data: e.data,
        valor: Number(e.valor || 0),
        bem_servico: e.bem_servico,
        os_citada: e.os_citada,
        confirmacao: e.confirmacao,
        medicao_do_mes: aprovadasPorMes.get(this.mesDaData(e.data) || '') ?? null,
      }));

    const requisicoes = await this.requisicaoRepository.find({
      where: {
        contrato_id: contratoId,
        tipo: TipoRequisicao.ORDEM_SERVICO,
        status: In([StatusRequisicao.AUTORIZADA, StatusRequisicao.ORDEM_GERADA]),
      },
      order: { data_solicitacao: 'ASC' },
    });
    const comMedicao = new Set(medicoes.map((m) => m.requisicao_id).filter(Boolean));
    const semMedicao = requisicoes.filter((r) => !comMedicao.has(r.id));
    const casados = casarPagamentosComOrdens(
      semMedicao.map((r) => ({
        id: r.id,
        numero: r.numero,
        valor: Number(r.valor_total_estimado || 0),
        numeros_empenhos: Array.isArray((r as any).numeros_empenhos)
          ? ((r as any).numeros_empenhos as string[])
          : [],
      })),
      pagamentos.filter((p) => p.confirmacao !== 'NAO_CONFIRMADO'),
    );

    return {
      contrato: {
        id: contrato.id,
        numero_contrato: contrato.numero_contrato,
        fornecedor: contrato.fornecedor_razao_social || '',
        valor_global: Number(contrato.valor_global || 0),
        vigencia_inicio: contrato.data_vigencia_inicio ? String(contrato.data_vigencia_inicio).slice(0, 10) : null,
        vigencia_fim: contrato.data_vigencia_fim ? String(contrato.data_vigencia_fim).slice(0, 10) : null,
        data_renovacao_ciclo: (contrato as any).data_renovacao_ciclo
          ? String((contrato as any).data_renovacao_ciclo).slice(0, 10)
          : null,
        processo_licitatorio_portal: contrato.processo_licitatorio_portal ?? null,
      },
      resumo,
      pagamentos,
      medicoes: medicoes.map((m) => ({
        id: m.id,
        numero_medicao: Number(m.numero_medicao || 0),
        status: String(m.status),
        competencia: ((m as any).competencia as string) || null,
        periodo_inicio: m.periodo_inicio ? String(m.periodo_inicio).slice(0, 10) : null,
        valor_medido: Number(m.valor_medido || 0),
        nota_fiscal_numero: m.nota_fiscal_numero || null,
        lancamento_retroativo: !!(m as any).lancamento_retroativo,
      })),
      ordens_sem_medicao: semMedicao.map((r) => {
        const pagamento = casados.get(r.id) || null;
        return {
          requisicao_id: r.id,
          numero: r.numero,
          valor: Number(r.valor_total_estimado || 0),
          data_solicitacao: r.data_solicitacao ? String(r.data_solicitacao).slice(0, 10) : null,
          pagamento: pagamento
            ? {
                numero_empenho: pagamento.numero_empenho,
                data: pagamento.data,
                valor: pagamento.valor,
                motivo: ROTULO_CRITERIO[pagamento.criterio],
              }
            : null,
        };
      }),
      itens_migracao: itens.map((i) => ({
        numero_item: Number(i.numero_item || 0),
        descricao: i.descricao,
        unidade_medida: i.unidade_medida,
        quantidade: Number(i.quantidade || 0),
        quantidade_medida: Number(i.quantidade_medida || 0),
        valor_unitario: Number(i.valor_unitario || 0),
        valor_migracao_reais: (i as any).valor_migracao_reais != null ? Number((i as any).valor_migracao_reais) : null,
      })),
    };
  }
}
