import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan, In } from 'typeorm';
import { BemPatrimonial } from './entities/bem-patrimonial.entity';
import { ManutencaoBem } from './entities/manutencao-bem.entity';
import { LocacaoBem } from './entities/locacao-bem.entity';
import { MovimentacaoBem } from './entities/movimentacao-bem.entity';
import { StatusBem, StatusMovimentacao, TipoMovimentacao } from './entities/enums';
import { calcularDepreciacao, faltasDepreciacao, parametrosEfetivos } from './depreciacao.util';

@Injectable()
export class PatrimonioRelatoriosService {
  constructor(
    @InjectRepository(BemPatrimonial)
    private readonly bemRepository: Repository<BemPatrimonial>,
    @InjectRepository(ManutencaoBem)
    private readonly manutencaoRepository: Repository<ManutencaoBem>,
    @InjectRepository(LocacaoBem)
    private readonly locacaoRepository: Repository<LocacaoBem>,
    @InjectRepository(MovimentacaoBem)
    private readonly movRepository: Repository<MovimentacaoBem>,
  ) {}

  /**
   * Depreciação linear por vida útil (NBC TSP 07), posição na data de
   * referência — cálculo em `calcularDepreciacao` (depreciacao.util.ts):
   * parâmetros do bem (vida útil, residual, conta) prevalecem; se nulos,
   * valem os da categoria. Bens sem valor, data ou vida útil ficam na lista
   * "sem parâmetros" para o órgão completar.
   */
  async depreciacao(orgaoId: string, dataRef?: string) {
    const ref = dataRef ? new Date(dataRef + 'T12:00:00') : new Date();
    const bens = await this.bemRepository.find({
      where: { orgao_id: orgaoId, status: In([StatusBem.ATIVO, StatusBem.EM_MANUTENCAO]) },
      relations: ['categoria', 'setor'],
      order: { plaqueta: 'ASC' },
    });
    const itens: any[] = [];
    const semParametros: any[] = [];
    const porCategoria = new Map<string, { categoria: string; conta_contabil: string | null; vida_util_anos: number | null; quantidade: number; valor_aquisicao: number; depreciacao_acumulada: number; valor_liquido: number }>();
    for (const b of bens) {
      const valor = b.valor_aquisicao != null ? Number(b.valor_aquisicao) : null;
      const dep = calcularDepreciacao(b, b.categoria, ref);
      const catNome = b.categoria?.nome || 'Sem categoria';
      const chave = b.categoria?.id || 'sem';
      if (!porCategoria.has(chave)) {
        porCategoria.set(chave, { categoria: catNome, conta_contabil: b.categoria?.conta_contabil || null, vida_util_anos: b.categoria?.vida_util_anos || null, quantidade: 0, valor_aquisicao: 0, depreciacao_acumulada: 0, valor_liquido: 0 });
      }
      const agg = porCategoria.get(chave)!;
      agg.quantidade++;
      if (!dep || valor == null) {
        semParametros.push({ id: b.id, plaqueta: b.plaqueta, descricao: b.descricao, categoria: catNome, falta: faltasDepreciacao(b, b.categoria) });
        if (valor != null) { agg.valor_aquisicao += valor; agg.valor_liquido += valor; }
        continue;
      }
      itens.push({
        id: b.id, plaqueta: b.plaqueta, descricao: b.descricao, categoria: catNome, setor: b.setor?.nome || b.localizacao_nome || null,
        data_aquisicao: b.data_aquisicao, valor_aquisicao: +valor.toFixed(2), vida_util_anos: dep.vida_util_anos, residual_pct: dep.valor_residual_pct,
        conta_contabil: dep.conta_contabil, taxa_anual_pct: dep.taxa_anual_pct, origem_parametros: dep.origem_parametros,
        meses_depreciados: dep.meses_depreciados, depreciacao_mensal: dep.depreciacao_mensal, depreciacao_acumulada: dep.depreciacao_acumulada, valor_liquido: dep.valor_atual,
        totalmente_depreciado: dep.totalmente_depreciado,
      });
      agg.valor_aquisicao += valor;
      agg.depreciacao_acumulada += dep.depreciacao_acumulada;
      agg.valor_liquido += dep.valor_atual;
    }
    const categorias = Array.from(porCategoria.values()).map((c) => ({
      ...c,
      valor_aquisicao: +c.valor_aquisicao.toFixed(2),
      depreciacao_acumulada: +c.depreciacao_acumulada.toFixed(2),
      valor_liquido: +c.valor_liquido.toFixed(2),
    })).sort((a, b) => a.categoria.localeCompare(b.categoria));
    const totais = categorias.reduce((t, c) => ({ quantidade: t.quantidade + c.quantidade, valor_aquisicao: t.valor_aquisicao + c.valor_aquisicao, depreciacao_acumulada: t.depreciacao_acumulada + c.depreciacao_acumulada, valor_liquido: t.valor_liquido + c.valor_liquido }), { quantidade: 0, valor_aquisicao: 0, depreciacao_acumulada: 0, valor_liquido: 0 });
    return { data_referencia: ref.toISOString().slice(0, 10), totais, categorias, itens, sem_parametros: semParametros };
  }

  async resumo(orgaoId: string) {
    const [bens, totalBens] = await this.bemRepository.findAndCount({
      where: { orgao_id: orgaoId },
      relations: ['categoria'],
    });

    // Totais por tipo
    const porTipo = bens.reduce(
      (acc, bem) => {
        acc[bem.tipo] = (acc[bem.tipo] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Totais por status
    const porStatus = bens.reduce(
      (acc, bem) => {
        acc[bem.status] = (acc[bem.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Totais por categoria
    const porCategoria = bens.reduce(
      (acc, bem) => {
        const cat = bem.categoria?.nome || 'Sem categoria';
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Manutenções ativas
    const manutencoesAtivas = await this.manutencaoRepository.count({
      where: {
        orgao_id: orgaoId,
        data_retorno: undefined,
      },
    });

    // Locações próximas do vencimento (30 dias)
    const hoje = new Date();
    const em30dias = new Date();
    em30dias.setDate(em30dias.getDate() + 30);

    const locacoesVencendo = await this.locacaoRepository.count({
      where: {
        orgao_id: orgaoId,
        data_fim: Between(hoje, em30dias),
      },
    });

    const hoje0 = new Date();
    hoje0.setHours(0, 0, 0, 0);
    const hojeIso = hoje0.toISOString().slice(0, 10);
    const em30Iso = em30dias.toISOString().slice(0, 10);
    const ativos = [StatusBem.ATIVO, StatusBem.EM_MANUTENCAO];
    const [emprestimosVencidos, transferenciasPendentes, semSetor, garantiasVencendo, segurosVencendo] = await Promise.all([
      this.movRepository.count({ where: { orgao_id: orgaoId, tipo: TipoMovimentacao.EMPRESTIMO, status: StatusMovimentacao.EM_ANDAMENTO, data_prevista_retorno: LessThan(hoje0) } }),
      this.movRepository.count({ where: { orgao_id: orgaoId, tipo: TipoMovimentacao.TRANSFERENCIA, status: StatusMovimentacao.PENDENTE } }),
      this.bemRepository.createQueryBuilder('b').where('b.orgao_id = :orgaoId AND b.setor_id IS NULL AND b.status <> :baixado', { orgaoId, baixado: StatusBem.BAIXADO }).getCount(),
      this.bemRepository.createQueryBuilder('b').where('b.orgao_id = :orgaoId AND b.status IN (:...ativos) AND b.garantia_ate BETWEEN :de AND :ate', { orgaoId, ativos, de: hojeIso, ate: em30Iso }).getCount(),
      this.bemRepository.createQueryBuilder('b').where('b.orgao_id = :orgaoId AND b.status IN (:...ativos) AND b.seguro_vigencia_fim BETWEEN :de AND :ate', { orgaoId, ativos, de: hojeIso, ate: em30Iso }).getCount(),
    ]);

    return {
      total_bens: totalBens,
      por_tipo: porTipo,
      por_status: porStatus,
      por_categoria: porCategoria,
      manutencoes_ativas: manutencoesAtivas,
      locacoes_vencendo_30dias: locacoesVencendo,
      emprestimos_vencidos: emprestimosVencidos,
      transferencias_pendentes: transferenciasPendentes,
      bens_sem_setor: semSetor,
      garantias_vencendo_30dias: garantiasVencendo,
      seguros_vencendo_30dias: segurosVencendo,
    };
  }

  async relatorioManutencoes(
    orgaoId: string,
    dataInicio?: string,
    dataFim?: string,
  ) {
    const qb = this.manutencaoRepository
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.bem', 'bem')
      .leftJoinAndSelect('bem.categoria', 'categoria')
      .where('m.orgao_id = :orgaoId', { orgaoId });

    if (dataInicio) {
      qb.andWhere('m.data_entrada >= :dataInicio', { dataInicio });
    }
    if (dataFim) {
      qb.andWhere('m.data_entrada <= :dataFim', { dataFim });
    }

    qb.orderBy('m.data_entrada', 'DESC');

    const manutencoes = await qb.getMany();

    const porStatus = manutencoes.reduce(
      (acc, m) => {
        acc[m.status] = (acc[m.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      total: manutencoes.length,
      por_status: porStatus,
      manutencoes,
    };
  }

  async locacoesVencendo(orgaoId: string) {
    const hoje = new Date();
    const em30dias = new Date();
    em30dias.setDate(em30dias.getDate() + 30);

    const locacoes = await this.locacaoRepository.find({
      where: {
        orgao_id: orgaoId,
        data_fim: Between(hoje, em30dias),
      },
      relations: ['bem', 'bem.categoria'],
      order: { data_fim: 'ASC' },
    });

    return {
      total: locacoes.length,
      locacoes,
    };
  }
}
