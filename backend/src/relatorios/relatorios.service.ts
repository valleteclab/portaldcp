import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { Contrato, StatusContrato } from '../contratos/entities/contrato.entity';
import { Requisicao } from '../almoxarifado/entities/requisicao.entity';
import { ItemContrato } from '../almoxarifado/entities/item-contrato.entity';
import { Medicao } from '../contratos/entities/medicao.entity';

@Injectable()
export class RelatoriosService {
  constructor(
    @InjectRepository(Licitacao)
    private readonly licitacaoRepo: Repository<Licitacao>,
    @InjectRepository(Contrato)
    private readonly contratoRepo: Repository<Contrato>,
    @InjectRepository(Requisicao)
    private readonly requisicaoRepo: Repository<Requisicao>,
    @InjectRepository(ItemContrato)
    private readonly itemContratoRepo: Repository<ItemContrato>,
    @InjectRepository(Medicao)
    private readonly medicaoRepo: Repository<Medicao>,
  ) {}

  /**
   * Relatório de Eficiência de Compras (Licitações)
   */
  async getEficienciaLicitacoes(
    orgaoId: string,
    ano?: number,
  ): Promise<{
    economia_total: number;
    valor_estimado_total: number;
    valor_homologado_total: number;
    tempo_medio_dias: number;
    total_processos: number;
    por_status: { nome: string; quantidade: number }[];
    top_fornecedores: { razao_social: string; quantidade: number; valor_total: number }[];
  }> {
    const qb = this.licitacaoRepo
      .createQueryBuilder('l')
      .where('l.orgao_id = :orgaoId', { orgaoId });

    if (ano) {
      qb.andWhere('l.ano = :ano', { ano });
    }

    const licitacoes = await qb.getMany();

    let valorEstimadoTotal = 0;
    let valorHomologadoTotal = 0;
    let somaDias = 0;
    let countComDatas = 0;

    const statusMap = new Map<string, number>();

    for (const l of licitacoes) {
      const est = Number(l.valor_total_estimado || 0);
      const hom = Number(l.valor_homologado || 0);
      valorEstimadoTotal += est;
      valorHomologadoTotal += hom;

      if (l.data_abertura_processo && l.data_homologacao) {
        const d1 = new Date(l.data_abertura_processo).getTime();
        const d2 = new Date(l.data_homologacao).getTime();
        somaDias += Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
        countComDatas++;
      }

      const status = l.fase || 'OUTRO';
      statusMap.set(status, (statusMap.get(status) || 0) + 1);
    }

    const economia_total = Math.max(0, valorEstimadoTotal - valorHomologadoTotal);
    const tempo_medio_dias = countComDatas > 0 ? Math.round(somaDias / countComDatas) : 0;

    const por_status = Array.from(statusMap.entries()).map(([nome, quantidade]) => ({
      nome,
      quantidade,
    }));

    const topFornecedoresRaw = await this.contratoRepo
      .createQueryBuilder('c')
      .select('c.fornecedor_razao_social', 'razao_social')
      .addSelect('COUNT(*)', 'quantidade')
      .addSelect('SUM(c.valor_global)', 'valor_total')
      .where('c.orgao_id = :orgaoId', { orgaoId })
      .andWhere('c.licitacao_id IS NOT NULL')
      .groupBy('c.fornecedor_razao_social')
      .orderBy('SUM(c.valor_global)', 'DESC')
      .limit(10)
      .getRawMany();

    const top_fornecedores = topFornecedoresRaw.map((r) => ({
      razao_social: r.razao_social || 'Desconhecido',
      quantidade: Number(r.quantidade),
      valor_total: Number(r.valor_total || 0),
    }));

    return {
      economia_total,
      valor_estimado_total: valorEstimadoTotal,
      valor_homologado_total: valorHomologadoTotal,
      tempo_medio_dias,
      total_processos: licitacoes.length,
      por_status,
      top_fornecedores,
    };
  }

  /**
   * Relatório de Saúde Financeira (Contratos)
   */
  async getFinanceiroContratos(
    orgaoId: string,
    ano?: number,
  ): Promise<{
    valor_contratado_total: number;
    valor_executado_total: number;
    valor_disponivel_total: number;
    percentual_executado: number;
    vencimentos_30: number;
    vencimentos_60: number;
    vencimentos_90: number;
    valor_inicial_total: number;
    valor_global_total: number;
    aditivos_total: number;
  }> {
    const qb = this.contratoRepo
      .createQueryBuilder('c')
      .where('c.orgao_id = :orgaoId', { orgaoId })
      .andWhere('c.status = :status', { status: StatusContrato.VIGENTE });

    if (ano) {
      qb.andWhere('c.ano = :ano', { ano });
    }

    const contratos = await qb.getMany();

    let valorContratadoTotal = 0;
    let valorExecutadoTotal = 0;
    let valorInicialTotal = 0;
    let valorGlobalTotal = 0;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const d30 = new Date(hoje);
    d30.setDate(d30.getDate() + 30);
    const d60 = new Date(hoje);
    d60.setDate(d60.getDate() + 60);
    const d90 = new Date(hoje);
    d90.setDate(d90.getDate() + 90);

    let venc30 = 0;
    let venc60 = 0;
    let venc90 = 0;

    for (const c of contratos) {
      const vg = Number(c.valor_global || c.valor_inicial || 0);
      valorContratadoTotal += vg;
      valorInicialTotal += Number(c.valor_inicial || 0);
      valorGlobalTotal += vg;

      const vigFim = c.data_vigencia_fim ? new Date(c.data_vigencia_fim) : null;
      if (vigFim && vigFim >= hoje) {
        if (vigFim <= d30) venc30++;
        else if (vigFim <= d60) venc60++;
        else if (vigFim <= d90) venc90++;
      }

      const itens = await this.itemContratoRepo.find({
        where: { contrato_id: c.id },
      });
      let execContrato = 0;
      for (const it of itens) {
        const qtdEnt = Number(it.quantidade_entregue || 0);
        const valorUnit = Number(it.valor_unitario || 0);
        execContrato += qtdEnt * valorUnit;
      }
      valorExecutadoTotal += execContrato;
    }

    const medicoes = await this.medicaoRepo
      .createQueryBuilder('m')
      .innerJoin('m.contrato', 'c')
      .where('c.orgao_id = :orgaoId', { orgaoId })
      .andWhere('m.status = :status', { status: 'APROVADA' })
      .getMany();

    let valorMedidoTotal = 0;
    for (const m of medicoes) {
      valorMedidoTotal += Number((m as any).valor_medido || (m as any).valor_acumulado_atual || 0);
    }

    valorExecutadoTotal = Math.max(valorExecutadoTotal, valorMedidoTotal);
    const valorDisponivelTotal = Math.max(0, valorContratadoTotal - valorExecutadoTotal);
    const percentual_executado =
      valorContratadoTotal > 0
        ? Math.round((valorExecutadoTotal / valorContratadoTotal) * 1000) / 10
        : 0;
    const aditivos_total = Math.max(0, valorGlobalTotal - valorInicialTotal);

    return {
      valor_contratado_total: valorContratadoTotal,
      valor_executado_total: valorExecutadoTotal,
      valor_disponivel_total: valorDisponivelTotal,
      percentual_executado,
      vencimentos_30: venc30,
      vencimentos_60: venc60,
      vencimentos_90: venc90,
      valor_inicial_total: valorInicialTotal,
      valor_global_total: valorGlobalTotal,
      aditivos_total,
    };
  }

  /**
   * Relatório de Consumo Inteligente (Almoxarifado)
   */
  async getConsumoAlmoxarifado(
    orgaoId: string,
    ano?: number,
  ): Promise<{
    curva_abc: { descricao: string; valor: number; percentual_acumulado: number }[];
    por_status: { nome: string; quantidade: number }[];
    consumo_mensal: { mes: string; valor: number; quantidade: number }[];
  }> {
    const reqQb = this.requisicaoRepo
      .createQueryBuilder('r')
      .where('r.orgao_id = :orgaoId', { orgaoId });

    if (ano) {
      reqQb.andWhere('r.ano = :ano', { ano });
    }

    const requisicoes = await reqQb.getMany();

    const statusMap = new Map<string, number>();
    for (const r of requisicoes) {
      const s = r.status || 'OUTRO';
      statusMap.set(s, (statusMap.get(s) || 0) + 1);
    }

    const por_status = Array.from(statusMap.entries()).map(([nome, quantidade]) => ({
      nome,
      quantidade,
    }));

    const itens = await this.itemContratoRepo
      .createQueryBuilder('ic')
      .innerJoin('ic.contrato', 'c')
      .where('c.orgao_id = :orgaoId', { orgaoId })
      .select([
        'ic.descricao',
        'ic.valor_unitario',
        'ic.quantidade_entregue',
        'ic.quantidade_contratada',
      ])
      .getMany();

    const itemValorMap = new Map<string, number>();
    for (const it of itens) {
      const qtd = Number(it.quantidade_entregue || 0);
      const valorUnit = Number(it.valor_unitario || 0);
      const valor = qtd * valorUnit;
      const desc = it.descricao || 'Item';
      itemValorMap.set(desc, (itemValorMap.get(desc) || 0) + valor);
    }

    const itensOrdenados = Array.from(itemValorMap.entries())
      .map(([descricao, valor]) => ({ descricao, valor }))
      .sort((a, b) => b.valor - a.valor);

    const totalValor = itensOrdenados.reduce((s, i) => s + i.valor, 0);
    let acum = 0;
    const curva_abc = itensOrdenados.slice(0, 20).map((i) => {
      acum += i.valor;
      const pct = totalValor > 0 ? Math.round((acum / totalValor) * 1000) / 10 : 0;
      return {
        descricao: i.descricao,
        valor: i.valor,
        percentual_acumulado: pct,
      };
    });

    const mesMap = new Map<string, { valor: number; quantidade: number }>();
    for (const r of requisicoes) {
      if (r.data_solicitacao) {
        const d = new Date(r.data_solicitacao);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const cur = mesMap.get(key) || { valor: 0, quantidade: 0 };
        cur.valor += Number(r.valor_total_estimado || 0);
        cur.quantidade++;
        mesMap.set(key, cur);
      }
    }

    const consumo_mensal = Array.from(mesMap.entries())
      .map(([mes, d]) => ({ mes, valor: d.valor, quantidade: d.quantidade }))
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-12);

    return {
      curva_abc,
      por_status,
      consumo_mensal,
    };
  }
}
