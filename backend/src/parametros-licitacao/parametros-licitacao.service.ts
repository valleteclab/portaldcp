import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';

import { ParametroLicitacao } from './entities/parametro-licitacao.entity';
import { LimiteLegal } from './entities/limite-legal.entity';

/**
 * Limites legais nacionais padrão (art. 75, I e II da Lei 14.133/2021).
 * Valores de 2025 (Decreto 12.343/2024). Editáveis por decreto sem deploy.
 */
const LIMITES_PADRAO: Array<Partial<LimiteLegal>> = [
  {
    chave: 'DISPENSA_OBRAS_ENGENHARIA',
    descricao: 'Dispensa por valor — obras e serviços de engenharia (art. 75, I)',
    valor: 119812.02,
    vigencia_inicio: '2025-01-01',
    fonte: 'Decreto 12.343/2024',
  },
  {
    chave: 'DISPENSA_COMPRAS_SERVICOS',
    descricao: 'Dispensa por valor — compras e serviços em geral (art. 75, II)',
    valor: 59906.02,
    vigencia_inicio: '2025-01-01',
    fonte: 'Decreto 12.343/2024',
  },
];

@Injectable()
export class ParametrosLicitacaoService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ParametrosLicitacaoService.name);

  constructor(
    @InjectRepository(ParametroLicitacao)
    private readonly paramRepo: Repository<ParametroLicitacao>,
    @InjectRepository(LimiteLegal)
    private readonly limiteRepo: Repository<LimiteLegal>,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.seedDefaults();
    } catch (e) {
      this.logger.error(`Falha ao semear parâmetros/limites: ${e.message}`);
    }
  }

  /** Cria o default do sistema e os limites legais nacionais (idempotente). */
  async seedDefaults(): Promise<void> {
    const defaultParam = await this.paramRepo.findOne({
      where: { orgao_id: IsNull() },
    });
    if (!defaultParam) {
      await this.paramRepo.save(this.paramRepo.create({ orgao_id: null }));
      this.logger.log('Parâmetro padrão do sistema criado');
    }

    for (const def of LIMITES_PADRAO) {
      const existe = await this.limiteRepo.findOne({
        where: { orgao_id: IsNull(), chave: def.chave },
      });
      if (!existe) {
        await this.limiteRepo.save(this.limiteRepo.create({ ...def, orgao_id: null }));
      }
    }
  }

  // ==========================================================================
  // PARÂMETROS
  // ==========================================================================

  /** Parâmetro efetivo do órgão (com fallback para o default do sistema). */
  async resolver(orgaoId?: string | null): Promise<ParametroLicitacao> {
    if (orgaoId) {
      const doOrgao = await this.paramRepo.findOne({ where: { orgao_id: orgaoId } });
      if (doOrgao) return doOrgao;
    }
    let padrao = await this.paramRepo.findOne({ where: { orgao_id: IsNull() } });
    if (!padrao) {
      padrao = await this.paramRepo.save(this.paramRepo.create({ orgao_id: null }));
    }
    return padrao;
  }

  /**
   * Cria/atualiza (upsert) os parâmetros de um órgão. Passar orgaoId null
   * atualiza o default do sistema.
   */
  async salvar(
    orgaoId: string | null,
    dados: Partial<ParametroLicitacao>,
  ): Promise<ParametroLicitacao> {
    const where = orgaoId ? { orgao_id: orgaoId } : { orgao_id: IsNull() };
    let param = await this.paramRepo.findOne({ where });
    if (!param) {
      param = this.paramRepo.create({ orgao_id: orgaoId });
    }
    // Campos imutáveis
    delete (dados as any).id;
    delete (dados as any).orgao_id;
    delete (dados as any).created_at;
    delete (dados as any).updated_at;
    Object.assign(param, dados);
    return this.paramRepo.save(param);
  }

  /** Restaura os parâmetros do órgão para o default do sistema (remove override). */
  async restaurarPadrao(orgaoId: string): Promise<ParametroLicitacao> {
    await this.paramRepo.delete({ orgao_id: orgaoId });
    return this.resolver(orgaoId);
  }

  // ==========================================================================
  // LIMITES LEGAIS
  // ==========================================================================

  async listarLimites(orgaoId?: string): Promise<LimiteLegal[]> {
    const qb = this.limiteRepo
      .createQueryBuilder('l')
      .where('(l.orgao_id IS NULL OR l.orgao_id = :o)', { o: orgaoId || null })
      .orderBy('l.chave', 'ASC')
      .addOrderBy('l.vigencia_inicio', 'DESC');
    return qb.getMany();
  }

  /** Valor vigente de um limite na data de referência (default: hoje). */
  async valorVigente(
    chave: string,
    orgaoId?: string,
    dataRef?: Date,
  ): Promise<number | null> {
    const dataStr = (dataRef || new Date()).toISOString().slice(0, 10);
    // Preferência: valor específico do órgão; depois nacional.
    for (const escopo of [orgaoId, null]) {
      if (escopo === undefined) continue;
      const limite = await this.limiteRepo
        .createQueryBuilder('l')
        .where('l.chave = :chave', { chave })
        .andWhere(escopo ? 'l.orgao_id = :o' : 'l.orgao_id IS NULL', { o: escopo })
        .andWhere('l.vigencia_inicio <= :d', { d: dataStr })
        .andWhere('(l.vigencia_fim IS NULL OR l.vigencia_fim >= :d)', { d: dataStr })
        .orderBy('l.vigencia_inicio', 'DESC')
        .getOne();
      if (limite) return Number(limite.valor);
    }
    return null;
  }

  async salvarLimite(dados: Partial<LimiteLegal>): Promise<LimiteLegal> {
    if (dados.id) {
      const existente = await this.limiteRepo.findOne({ where: { id: dados.id } });
      if (!existente) throw new NotFoundException('Limite legal não encontrado');
      Object.assign(existente, dados);
      return this.limiteRepo.save(existente);
    }
    return this.limiteRepo.save(this.limiteRepo.create(dados));
  }

  async removerLimite(id: string): Promise<void> {
    await this.limiteRepo.delete({ id });
  }
}
