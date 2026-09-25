import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  CalendarioDiasUteis,
  FERIADOS_NACIONAIS_PADRAO,
  RegraFeriado,
  calendarioDoOrgao,
  definirFonteDeFeriados,
  invalidarCalendarios,
} from '../common/prazos/calendario';
import { ehDiaUtil } from '../common/prazos/dias-uteis';
import { AbrangenciaFeriado, Feriado, FeriadoAdotado } from './feriado.entity';
import {
  LinhaFeriado,
  datasNoAno,
  feriadoAlcancaOrgao,
  feriadoContaParaOrgao,
  motivoFeriadoInvalido,
  paraRegra,
} from './regras-feriados';

export interface DadosFeriado {
  descricao: string;
  data?: string | null;
  movel?: string | null;
  recorrente?: boolean;
  ponto_facultativo?: boolean;
  abrangencia?: AbrangenciaFeriado;
  uf?: string | null;
  codigo_ibge?: string | null;
  base_legal?: string | null;
}

/** Quem cadastra: o órgão (linhas próprias) ou o administrador da plataforma (nacional/estadual). */
export interface AutorFeriado {
  orgaoId: string | null;
  admin: boolean;
  nome?: string | null;
}

/**
 * ============================================================================
 * FERIADOS — calendário de dias sem expediente por órgão (plano E7a item 1)
 * ============================================================================
 *
 * A tabela é pequena (nacionais + estaduais + os de cada órgão): o serviço a
 * mantém EM MEMÓRIA e registra a fonte do núcleo puro (`calendario.ts`), para
 * que TODO cálculo de dias úteis — art. 55 (publicação), art. 75 §3º
 * (dispensa), art. 164 (impugnação), art. 165 (recursos), art. 71 §3º
 * (manifestação prévia à revogação/anulação) — use `calendarioDoOrgao(id)`
 * de forma síncrona. Recarrega a cada alteração e a cada 10 minutos.
 *
 * Boot: semeia os feriados nacionais e pontos facultativos federais
 * (idempotente pela `chave_sistema`; desligável com FERIADOS_SEMEAR_NO_BOOT=false).
 */
@Injectable()
export class FeriadosService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeriadosService.name);
  private linhas: LinhaFeriado[] = [];
  private adotadosPorOrgao = new Map<string, Set<string>>();
  private ufPorOrgao = new Map<string, string | null>();
  private recarregando: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    if (process.env.FERIADOS_SEMEAR_NO_BOOT !== 'false') {
      try {
        const n = await this.semearNacionais();
        if (n) this.logger.log(`Calendário de feriados: ${n} feriado(s) nacional(is)/ponto(s) facultativo(s) semeado(s)`);
      } catch (e: any) {
        this.logger.error(`Semente dos feriados nacionais não aplicada: ${e?.message ?? e}`);
      }
    }
    await this.recarregar().catch((e: any) => this.logger.error(`Calendário de feriados não carregado: ${e?.message ?? e}`));
    this.timer = setInterval(() => this.recarregar().catch(() => undefined), 10 * 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    definirFonteDeFeriados(null);
  }

  /** Semeia (idempotente) os feriados nacionais e pontos facultativos federais. */
  async semearNacionais(): Promise<number> {
    let inseridos = 0;
    for (const f of FERIADOS_NACIONAIS_PADRAO) {
      const r = await this.dataSource.query(
        `INSERT INTO feriados (descricao, data, movel, recorrente, abrangencia, ponto_facultativo, base_legal, chave_sistema, ativo, criado_por)
         VALUES ($1, $2, $3, $4, 'NACIONAL', $5, $6, $7, true, 'sistema')
         ON CONFLICT (chave_sistema) DO NOTHING RETURNING id`,
        [f.descricao, f.data ?? null, f.movel ?? null, !!f.recorrente, f.ponto_facultativo, f.base_legal, f.chave],
      );
      if (Array.isArray(r) && r.length) inseridos++;
    }
    return inseridos;
  }

  /** Recarrega a tabela para a memória e registra a fonte do calendário. */
  async recarregar(): Promise<void> {
    if (this.recarregando) return this.recarregando;
    this.recarregando = (async () => {
      const linhas: LinhaFeriado[] = await this.dataSource.query(
        `SELECT id::text, descricao, to_char(data, 'YYYY-MM-DD') AS data, movel, recorrente, abrangencia, uf,
                orgao_id::text AS orgao_id, ponto_facultativo, ativo
           FROM feriados WHERE ativo = true`,
      );
      const adotados: Array<{ orgao_id: string; feriado_id: string }> = await this.dataSource.query(
        `SELECT orgao_id::text AS orgao_id, feriado_id::text AS feriado_id FROM feriados_adotados`,
      );
      const orgaos: Array<{ id: string; uf: string | null }> = await this.dataSource.query(`SELECT id::text AS id, uf FROM orgaos`);
      this.linhas = linhas.map((l) => ({ ...l, recorrente: !!l.recorrente, ponto_facultativo: !!l.ponto_facultativo, ativo: !!l.ativo }));
      this.adotadosPorOrgao = new Map();
      for (const a of adotados) {
        const s = this.adotadosPorOrgao.get(a.orgao_id) ?? new Set<string>();
        s.add(a.feriado_id);
        this.adotadosPorOrgao.set(a.orgao_id, s);
      }
      this.ufPorOrgao = new Map(orgaos.map((o) => [o.id, o.uf ?? null]));
      definirFonteDeFeriados({ regrasDoOrgao: (orgaoId) => this.regrasDoOrgao(orgaoId) });
    })().finally(() => {
      this.recarregando = null;
    });
    return this.recarregando;
  }

  /** Regras que contam como dia sem expediente para o órgão (síncrono, da memória). */
  regrasDoOrgao(orgaoId: string | null): RegraFeriado[] {
    if (orgaoId && !this.ufPorOrgao.has(orgaoId)) {
      // órgão criado depois da última carga: recarrega em segundo plano
      this.ufPorOrgao.set(orgaoId, null);
      this.recarregar().catch(() => undefined);
    }
    const uf = orgaoId ? this.ufPorOrgao.get(orgaoId) ?? null : null;
    const adotados = (orgaoId && this.adotadosPorOrgao.get(orgaoId)) || new Set<string>();
    return this.linhas.filter((f) => feriadoContaParaOrgao(f, orgaoId, uf, adotados)).map(paraRegra);
  }

  /** Calendário do órgão (garante a carga inicial). */
  async calendario(orgaoId: string | null): Promise<CalendarioDiasUteis> {
    if (!this.linhas.length) await this.recarregar();
    return calendarioDoOrgao(orgaoId);
  }

  // ---------------------------------------------------------------------------
  // Leitura para as telas
  // ---------------------------------------------------------------------------

  /**
   * Calendário do órgão no ano: linhas que o alcançam (com "conta" e "adotado")
   * e os dias sem expediente de segunda a sexta, em ordem.
   */
  async calendarioDoAno(orgaoId: string | null, ano: number) {
    await this.recarregar();
    const [o] = orgaoId ? await this.dataSource.query(`SELECT uf FROM orgaos WHERE id::text = $1`, [orgaoId]) : [];
    const uf: string | null = o?.uf ?? null;
    const adotados = (orgaoId && this.adotadosPorOrgao.get(orgaoId)) || new Set<string>();
    const feriados = this.linhas
      .filter((f) => feriadoAlcancaOrgao(f, orgaoId, uf))
      .map((f) => ({
        id: f.id,
        descricao: f.descricao,
        data: f.data,
        movel: f.movel,
        recorrente: f.recorrente,
        abrangencia: f.abrangencia,
        uf: f.uf,
        proprio: !!orgaoId && f.orgao_id === orgaoId,
        ponto_facultativo: f.ponto_facultativo,
        adotado: adotados.has(f.id),
        conta: feriadoContaParaOrgao(f, orgaoId, uf, adotados),
        datas_no_ano: datasNoAno(f, ano),
      }))
      .sort((a, b) => (a.datas_no_ano[0] ?? '9').localeCompare(b.datas_no_ano[0] ?? '9'));
    const cal = calendarioDoOrgao(orgaoId);
    const dias: Array<{ data: string; descricao: string; dia_semana: number }> = [];
    for (let t = Date.UTC(ano, 0, 1); t < Date.UTC(ano + 1, 0, 1); t += 86_400_000) {
      const d = new Date(t);
      const desc = cal.feriado(d);
      if (desc && d.getUTCDay() !== 0 && d.getUTCDay() !== 6) {
        dias.push({ data: d.toISOString().slice(0, 10), descricao: desc, dia_semana: d.getUTCDay() });
      }
    }
    return { orgao_id: orgaoId, uf, ano, feriados, dias_sem_expediente: dias };
  }

  /** Dias sem expediente (seg–sex) do órgão num intervalo — usado pela tela de publicação. */
  diasSemExpediente(orgaoId: string | null, de: Date, ate: Date): Array<{ data: string; descricao: string }> {
    const cal = calendarioDoOrgao(orgaoId);
    const saida: Array<{ data: string; descricao: string }> = [];
    const inicio = Date.UTC(de.getUTCFullYear(), de.getUTCMonth(), de.getUTCDate());
    for (let t = inicio; t <= ate.getTime() && saida.length < 400; t += 86_400_000) {
      const d = new Date(t);
      const desc = cal.feriado(d);
      if (desc && !ehDiaUtil(d, cal) && d.getUTCDay() !== 0 && d.getUTCDay() !== 6) {
        saida.push({ data: d.toISOString().slice(0, 10), descricao: desc });
      }
    }
    return saida;
  }

  // ---------------------------------------------------------------------------
  // Cadastro
  // ---------------------------------------------------------------------------

  async criar(autor: AutorFeriado, dados: DadosFeriado): Promise<Feriado> {
    const erro = motivoFeriadoInvalido(dados);
    if (erro) throw new BadRequestException(erro);
    const repo = this.dataSource.getRepository(Feriado);
    const linha: Partial<Feriado> = {
      descricao: String(dados.descricao).trim(),
      data: dados.movel ? null : String(dados.data).slice(0, 10),
      movel: dados.movel || null,
      recorrente: dados.movel ? true : !!dados.recorrente,
      ponto_facultativo: !!dados.ponto_facultativo,
      base_legal: dados.base_legal?.trim() || null,
      codigo_ibge: dados.codigo_ibge?.trim() || null,
      criado_por: autor.nome ?? null,
      ativo: true,
    };
    if (autor.orgaoId) {
      // Do órgão: vale só para ele (municipal, ou estadual/ponto que ele observa)
      linha.orgao_id = autor.orgaoId;
      linha.abrangencia =
        dados.abrangencia === AbrangenciaFeriado.ESTADUAL ? AbrangenciaFeriado.ESTADUAL : AbrangenciaFeriado.MUNICIPAL;
      const [o] = await this.dataSource.query(`SELECT uf FROM orgaos WHERE id::text = $1`, [autor.orgaoId]);
      linha.uf = o?.uf ?? null;
    } else if (autor.admin) {
      const abr = dados.abrangencia ?? AbrangenciaFeriado.NACIONAL;
      if (abr === AbrangenciaFeriado.MUNICIPAL) {
        throw new BadRequestException('Feriado municipal é cadastrado pelo próprio órgão.');
      }
      if (abr === AbrangenciaFeriado.ESTADUAL && !/^[A-Za-z]{2}$/.test(String(dados.uf ?? ''))) {
        throw new BadRequestException('Feriado estadual exige a UF.');
      }
      linha.orgao_id = null;
      linha.abrangencia = abr;
      linha.uf = abr === AbrangenciaFeriado.ESTADUAL ? String(dados.uf).toUpperCase() : null;
    } else {
      throw new ForbiddenException('Somente o órgão ou o administrador da plataforma cadastra feriados.');
    }
    const salvo = await repo.save(repo.create(linha));
    await this.aposAlterar();
    return salvo;
  }

  async atualizar(autor: AutorFeriado, id: string, dados: Partial<DadosFeriado> & { ativo?: boolean }): Promise<Feriado> {
    const repo = this.dataSource.getRepository(Feriado);
    const f = await this.editavel(autor, id);
    const final = {
      descricao: dados.descricao ?? f.descricao,
      data: dados.movel === null ? dados.data ?? f.data : dados.movel ? null : dados.data ?? f.data,
      movel: dados.movel === undefined ? f.movel : dados.movel || null,
      recorrente: dados.recorrente ?? f.recorrente,
    };
    const erro = motivoFeriadoInvalido(final);
    if (erro) throw new BadRequestException(erro);
    Object.assign(f, {
      descricao: String(final.descricao).trim(),
      data: final.movel ? null : String(final.data).slice(0, 10),
      movel: final.movel,
      recorrente: final.movel ? true : !!final.recorrente,
      ponto_facultativo: dados.ponto_facultativo ?? f.ponto_facultativo,
      base_legal: dados.base_legal === undefined ? f.base_legal : dados.base_legal?.trim() || null,
      ativo: dados.ativo ?? f.ativo,
    });
    const salvo = await repo.save(f);
    await this.aposAlterar();
    return salvo;
  }

  async remover(autor: AutorFeriado, id: string): Promise<void> {
    const f = await this.editavel(autor, id);
    await this.dataSource.query(`DELETE FROM feriados_adotados WHERE feriado_id = $1`, [f.id]);
    await this.dataSource.getRepository(Feriado).delete(f.id);
    await this.aposAlterar();
  }

  /** Órgão adota (ou deixa de adotar) um ponto facultativo nacional/estadual. */
  async adotar(orgaoId: string, feriadoId: string, adotar: boolean): Promise<{ adotado: boolean }> {
    const f = await this.dataSource.getRepository(Feriado).findOne({ where: { id: feriadoId } });
    if (!f || !f.ativo) throw new NotFoundException('Feriado não encontrado');
    if (f.orgao_id) throw new BadRequestException('Só pontos facultativos nacionais/estaduais são adotados — o do próprio órgão já conta.');
    if (!f.ponto_facultativo) throw new BadRequestException('Feriado (não facultativo) já conta para todos os órgãos alcançados.');
    const [o] = await this.dataSource.query(`SELECT uf FROM orgaos WHERE id::text = $1`, [orgaoId]);
    if (!feriadoAlcancaOrgao({ ...f, recorrente: f.recorrente } as any, orgaoId, o?.uf ?? null)) {
      throw new BadRequestException('Este ponto facultativo não se aplica à UF do órgão.');
    }
    const repo = this.dataSource.getRepository(FeriadoAdotado);
    if (adotar) {
      await this.dataSource.query(
        `INSERT INTO feriados_adotados (orgao_id, feriado_id) VALUES ($1, $2) ON CONFLICT (orgao_id, feriado_id) DO NOTHING`,
        [orgaoId, feriadoId],
      );
    } else {
      await repo.delete({ orgao_id: orgaoId, feriado_id: feriadoId });
    }
    await this.aposAlterar();
    return { adotado: adotar };
  }

  private async editavel(autor: AutorFeriado, id: string): Promise<Feriado> {
    const f = await this.dataSource.getRepository(Feriado).findOne({ where: { id } });
    if (!f) throw new NotFoundException('Feriado não encontrado');
    if (f.orgao_id) {
      if (f.orgao_id !== autor.orgaoId && !autor.admin) throw new NotFoundException('Feriado não encontrado');
      return f;
    }
    if (!autor.admin) {
      throw new ForbiddenException('Feriado nacional/estadual só é alterado pelo administrador da plataforma (o órgão pode adotar pontos facultativos).');
    }
    return f;
  }

  private async aposAlterar(): Promise<void> {
    invalidarCalendarios();
    await this.recarregar();
  }
}
