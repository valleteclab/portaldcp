import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { BemPatrimonial } from './entities/bem-patrimonial.entity';
import { ManutencaoBem } from './entities/manutencao-bem.entity';
import { LocacaoBem } from './entities/locacao-bem.entity';

@Injectable()
export class PatrimonioRelatoriosService {
  constructor(
    @InjectRepository(BemPatrimonial)
    private readonly bemRepository: Repository<BemPatrimonial>,
    @InjectRepository(ManutencaoBem)
    private readonly manutencaoRepository: Repository<ManutencaoBem>,
    @InjectRepository(LocacaoBem)
    private readonly locacaoRepository: Repository<LocacaoBem>,
  ) {}

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

    return {
      total_bens: totalBens,
      por_tipo: porTipo,
      por_status: porStatus,
      por_categoria: porCategoria,
      manutencoes_ativas: manutencoesAtivas,
      locacoes_vencendo_30dias: locacoesVencendo,
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
