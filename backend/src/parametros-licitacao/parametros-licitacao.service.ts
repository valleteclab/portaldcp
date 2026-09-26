import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { executarMigracaoDeBoot } from '../common/migracao-boot';
import {
  CHAVE_LIMITE_DO_INCISO,
  DESCRICAO_INCISO,
  INCISO_DA_CHAVE,
  IncisoLimiteDispensa,
  LIMITES_DISPENSA_OFICIAIS,
  LimiteDispensaExercicio,
  ResultadoLimite,
  limiteDispensa,
} from './limites-dispensa';
import { migrarLimitesDispensaPorExercicio } from './migracao-limites-dispensa';

import { ParametroLicitacao } from './entities/parametro-licitacao.entity';
import { LimiteLegal } from './entities/limite-legal.entity';

/**
 * Limites legais nacionais sem exercício. Os limites da DISPENSA por valor
 * (art. 75, I/II) são POR EXERCÍCIO — tabela oficial em limites-dispensa.ts,
 * gravada em `limites_legais` pela migração de boot (migracao-limites-dispensa.ts).
 */
const LIMITES_PADRAO: Array<Partial<LimiteLegal>> = [
  {
    // Não é atualizado pelo Decreto 12.343/2024 (que atualiza os valores da Lei 14.133)
    chave: 'MPE_EXCLUSIVO_ITEM',
    descricao: 'Participação exclusiva de ME/EPP — itens de contratação de até (LC 123/2006, art. 48, I)',
    valor: 80000,
    vigencia_inicio: '2014-08-07',
    fonte: 'LC 147/2014',
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
    @InjectDataSource()
    private readonly dataSource?: DataSource,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.seedDefaults();
    } catch (e) {
      this.logger.error(`Falha ao semear parâmetros/limites: ${e.message}`);
    }
    // Limites da dispensa por exercício (fila única das migrações de boot)
    if (this.dataSource) {
      const ds = this.dataSource;
      await executarMigracaoDeBoot(ds, () => this.migrarLimitesDispensa(ds));
    }
  }

  /**
   * Migração de boot dos limites da dispensa por exercício (idempotente).
   * Desligar: LIMITES_DISPENSA_MIGRAR_NO_BOOT=false (sem ela, vale a tabela
   * oficial do código — limites-dispensa.ts).
   */
  async migrarLimitesDispensa(ds: DataSource): Promise<{ corrigidas: number; criadas: number } | null> {
    if (process.env.LIMITES_DISPENSA_MIGRAR_NO_BOOT === 'false') return null;
    try {
      const r = await ds.transaction((m) => migrarLimitesDispensaPorExercicio(m));
      if (r.corrigidas || r.criadas) {
        this.logger.log(`Limites da dispensa por exercício: ${r.corrigidas} linha(s) antiga(s) corrigida(s), ${r.criadas} criada(s)`);
      }
      return r;
    } catch (e: any) {
      this.logger.error(`Migração dos limites da dispensa por exercício não executada: ${e?.message ?? e}`);
      return null;
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

  // ==========================================================================
  // LIMITES DA DISPENSA POR EXERCÍCIO (art. 75, I/II)
  // ==========================================================================

  /**
   * Tabela vigente: linhas NACIONAIS com exercício em `limites_legais` (o que o
   * admin cadastrou) sobre a tabela oficial do código (fallback).
   */
  async tabelaLimitesDispensa(): Promise<LimiteDispensaExercicio[]> {
    const mapa = new Map<string, LimiteDispensaExercicio>();
    for (const l of LIMITES_DISPENSA_OFICIAIS) mapa.set(`${l.exercicio}:${l.inciso}`, { ...l });
    const linhas = await this.limiteRepo.find({
      where: { orgao_id: IsNull(), chave: In(Object.values(CHAVE_LIMITE_DO_INCISO)), exercicio: Not(IsNull()) },
    });
    for (const r of linhas) {
      const inciso = INCISO_DA_CHAVE[r.chave];
      if (!inciso || r.exercicio == null) continue;
      mapa.set(`${r.exercicio}:${inciso}`, {
        exercicio: Number(r.exercicio),
        inciso,
        valor: Number(r.valor),
        ato_normativo: r.fonte || mapa.get(`${r.exercicio}:${inciso}`)?.ato_normativo || '',
      });
    }
    return [...mapa.values()].sort((a, b) => a.exercicio - b.exercicio || a.inciso.localeCompare(b.inciso));
  }

  /** `limiteDispensa(exercicio, inciso)` sobre a tabela vigente (banco + oficial). */
  async limiteDispensa(exercicio: number, inciso: IncisoLimiteDispensa): Promise<ResultadoLimite | null> {
    return limiteDispensa(exercicio, inciso, await this.tabelaLimitesDispensa());
  }

  /**
   * Cadastro (ou correção) dos limites de um exercício pelo ADMIN da
   * plataforma — o decreto do ano seguinte sai em dezembro. Grava o par I/II
   * nacional com o ato normativo.
   */
  async cadastrarLimitesDoExercicio(dados: {
    exercicio: unknown;
    valor_inciso_i: unknown;
    valor_inciso_ii: unknown;
    ato_normativo: unknown;
  }): Promise<LimiteDispensaExercicio[]> {
    const exercicio = Number(dados?.exercicio);
    const anoAtual = new Date().getFullYear();
    if (!Number.isInteger(exercicio) || exercicio < 2021 || exercicio > anoAtual + 1) {
      throw new BadRequestException(`Exercício inválido — informe um ano entre 2021 e ${anoAtual + 1}`);
    }
    const ato = String(dados?.ato_normativo ?? '').trim();
    if (!ato) throw new BadRequestException('Informe o ato normativo (ex.: "Dec. 12.807/2025")');
    const valores: Record<IncisoLimiteDispensa, number> = {
      I: Number(dados?.valor_inciso_i),
      II: Number(dados?.valor_inciso_ii),
    };
    for (const inciso of ['I', 'II'] as IncisoLimiteDispensa[]) {
      const v = valores[inciso];
      if (!Number.isFinite(v) || v <= 0) throw new BadRequestException(`Valor do inciso ${inciso} inválido`);
    }
    for (const inciso of ['I', 'II'] as IncisoLimiteDispensa[]) {
      const chave = CHAVE_LIMITE_DO_INCISO[inciso];
      const existente = await this.limiteRepo.findOne({ where: { orgao_id: IsNull(), chave, exercicio } });
      const dadosLinha = {
        orgao_id: null,
        chave,
        descricao: DESCRICAO_INCISO[inciso],
        valor: Math.round(valores[inciso] * 100) / 100,
        vigencia_inicio: `${exercicio}-01-01`,
        vigencia_fim: null,
        exercicio,
        fonte: ato,
      };
      if (existente) await this.limiteRepo.save(Object.assign(existente, dadosLinha));
      else await this.limiteRepo.save(this.limiteRepo.create(dadosLinha));
    }
    return (await this.tabelaLimitesDispensa()).filter((l) => l.exercicio === exercicio);
  }

  async buscarLimite(id: string): Promise<LimiteLegal | null> {
    return this.limiteRepo.findOne({ where: { id } });
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
