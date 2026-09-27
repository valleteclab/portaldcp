import { BadRequestException, ConflictException, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { executarMigracaoDeBoot } from '../common/migracao-boot';
import {
  MASCARA_PADRAO_NUMERO_PROCESSO,
  anoBrasilia,
  formatarNumeroProcesso,
  mascaraEfetiva,
  motivoMascaraInvalida,
  normalizarNumeroDigitado,
  sequencialDoNumero,
} from './mascara-numero-processo';

/** Nome da restrição de unicidade (órgão + nº do processo) em `licitacoes`. */
export const UQ_LICITACOES_ORGAO_NUMERO_PROCESSO = 'UQ_licitacoes_orgao_numero_processo';

type Executor = EntityManager | DataSource;

/** Tentativas de pular números já ocupados (digitados à mão no formato gerado). */
const MAX_PULOS = 500;

export interface ConfiguracaoNumeracao {
  mascara: string;
  mascara_padrao: string;
  personalizada: boolean;
  ano: number;
  /** Prévia do próximo número que o sistema daria (não reserva). */
  proximo: string;
}

/**
 * GERADOR ÚNICO do número do processo administrativo (`licitacoes.numero_processo`).
 *
 * - Sequencial por ÓRGÃO e ANO (Brasília), no formato da máscara do órgão.
 * - Incremento atômico na tabela `sequencias_numero_processo`
 *   (`INSERT … ON CONFLICT … DO UPDATE … RETURNING`): criação simultânea nunca
 *   duplica. Dentro da transação de quem cria, o número volta se a criação falhar.
 * - A sequência começa depois do MAIOR número já existente do órgão/ano no
 *   formato da máscara (processos antigos não são renumerados; números
 *   aleatórios antigos do assistente ficam como estão).
 * - Número DIGITADO (o órgão já tem um, do protocolo/papel): aceito se não
 *   existir outro igual NO MESMO ÓRGÃO (409 com mensagem clara).
 */
@Injectable()
export class NumeroProcessoService implements OnApplicationBootstrap {
  private readonly logger = new Logger(NumeroProcessoService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  onApplicationBootstrap(): Promise<void> {
    return executarMigracaoDeBoot(this.ds, () => this.migrarNoBoot());
  }

  // ------------------------------------------------------------------ boot

  /**
   * Boot idempotente:
   *  1. a unicidade do nº do processo passa a ser POR ÓRGÃO — remove a
   *     restrição antiga só na coluna (dois órgãos podem ter "2026/00001");
   *  2. inicializa a sequência do ano corrente de cada órgão a partir do maior
   *     número existente no formato da máscara (GREATEST — nunca volta atrás).
   * Desligar: NUMERO_PROCESSO_MIGRAR_NO_BOOT=false.
   */
  async migrarNoBoot(): Promise<void> {
    if (process.env.NUMERO_PROCESSO_MIGRAR_NO_BOOT === 'false') return;
    try {
      const removidas = await this.removerUnicidadeGlobalAntiga();
      if (removidas.length) this.logger.log(`Nº do processo: unicidade global removida (${removidas.join(', ')}); agora é única por órgão`);
      await this.garantirUnicidadePorOrgao().catch((e: unknown) =>
        this.logger.error(`Nº do processo: unicidade por órgão não criada: ${e instanceof Error ? e.message : String(e)}`),
      );
      const ano = anoBrasilia();
      const orgaos: Array<{ orgao_id: string }> = await this.ds.query(
        `SELECT DISTINCT orgao_id::text AS orgao_id FROM licitacoes WHERE orgao_id IS NOT NULL`,
      );
      let ajustadas = 0;
      for (const { orgao_id } of orgaos) {
        const maior = await this.maiorSequencialExistente(this.ds, orgao_id, ano, await this.mascaraDoOrgao(orgao_id));
        if (maior <= 0) continue;
        const r: Array<{ ultimo: number }> = await this.ds.query(
          `INSERT INTO sequencias_numero_processo (orgao_id, ano, ultimo) VALUES ($1, $2, $3)
           ON CONFLICT (orgao_id, ano) DO UPDATE SET ultimo = GREATEST(sequencias_numero_processo.ultimo, EXCLUDED.ultimo)
           WHERE sequencias_numero_processo.ultimo < EXCLUDED.ultimo
           RETURNING ultimo`,
          [orgao_id, ano, maior],
        );
        if (r.length) ajustadas++;
      }
      if (ajustadas) this.logger.log(`Nº do processo: sequência de ${ano} inicializada/ajustada em ${ajustadas} órgão(s)`);
    } catch (e: unknown) {
      this.logger.error(`Migração do nº do processo não executada: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Restrições/índices únicos de `licitacoes` só na coluna numero_processo (a antiga `unique: true`). */
  private async removerUnicidadeGlobalAntiga(): Promise<string[]> {
    const removidas: string[] = [];
    const restricoes: Array<{ nome: string }> = await this.ds.query(
      `SELECT c.conname AS nome
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (c.conkey)
        WHERE t.relname = 'licitacoes' AND t.relnamespace = 'public'::regnamespace
          AND c.contype = 'u' AND array_length(c.conkey, 1) = 1 AND a.attname = 'numero_processo'`,
    );
    for (const { nome } of restricoes) {
      await this.ds.query(`ALTER TABLE licitacoes DROP CONSTRAINT IF EXISTS "${nome.replace(/"/g, '""')}"`);
      removidas.push(nome);
    }
    const indices: Array<{ nome: string }> = await this.ds.query(
      `SELECT i.relname AS nome
         FROM pg_index x
         JOIN pg_class i ON i.oid = x.indexrelid
         JOIN pg_class t ON t.oid = x.indrelid
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.indkey[0]
        WHERE t.relname = 'licitacoes' AND t.relnamespace = 'public'::regnamespace
          AND x.indisunique AND NOT x.indisprimary AND x.indnatts = 1 AND a.attname = 'numero_processo'
          AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = x.indexrelid)`,
    );
    for (const { nome } of indices) {
      await this.ds.query(`DROP INDEX IF EXISTS "${nome.replace(/"/g, '""')}"`);
      removidas.push(nome);
    }
    return removidas;
  }

  /** A restrição nova (o synchronize já cria; aqui só garante quando ele estiver desligado). */
  private async garantirUnicidadePorOrgao(): Promise<void> {
    const [existe] = await this.ds.query(`SELECT 1 FROM pg_constraint WHERE conname = $1`, [UQ_LICITACOES_ORGAO_NUMERO_PROCESSO]);
    if (existe) return;
    await this.ds.query(`ALTER TABLE licitacoes ADD CONSTRAINT "${UQ_LICITACOES_ORGAO_NUMERO_PROCESSO}" UNIQUE (orgao_id, numero_processo)`);
  }

  // ------------------------------------------------------------ configuração

  async mascaraDoOrgao(orgaoId: string, m: Executor = this.ds): Promise<string> {
    const [linha] = await m.query(`SELECT mascara FROM numeracao_processo_orgao WHERE orgao_id::text = $1`, [orgaoId]);
    const mascara = mascaraEfetiva(linha?.mascara);
    // Máscara gravada inválida (não deveria acontecer): nunca trava a criação
    return motivoMascaraInvalida(mascara) ? MASCARA_PADRAO_NUMERO_PROCESSO : mascara;
  }

  async configuracao(orgaoId: string, mascaraProposta?: string | null): Promise<ConfiguracaoNumeracao> {
    const [linha] = await this.ds.query(`SELECT mascara FROM numeracao_processo_orgao WHERE orgao_id::text = $1`, [orgaoId]);
    let mascara = await this.mascaraDoOrgao(orgaoId);
    if (mascaraProposta !== undefined && mascaraProposta !== null) {
      const motivo = motivoMascaraInvalida(mascaraProposta);
      if (motivo) throw new BadRequestException(motivo);
      mascara = mascaraEfetiva(mascaraProposta);
    }
    const ano = anoBrasilia();
    return {
      mascara,
      mascara_padrao: MASCARA_PADRAO_NUMERO_PROCESSO,
      personalizada: !!linha?.mascara,
      ano,
      proximo: await this.previa(orgaoId, mascara, ano),
    };
  }

  async salvarMascara(orgaoId: string, mascara: string | null | undefined, por: string | null): Promise<ConfiguracaoNumeracao> {
    const motivo = motivoMascaraInvalida(mascara);
    if (motivo) throw new BadRequestException(motivo);
    const valor = String(mascara ?? '').trim();
    const gravar = !valor || valor === MASCARA_PADRAO_NUMERO_PROCESSO ? null : valor;
    await this.ds.query(
      `INSERT INTO numeracao_processo_orgao (orgao_id, mascara, atualizado_por, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (orgao_id) DO UPDATE SET mascara = EXCLUDED.mascara, atualizado_por = EXCLUDED.atualizado_por, updated_at = now()`,
      [orgaoId, gravar, por ? por.slice(0, 200) : null],
    );
    return this.configuracao(orgaoId);
  }

  /** Próximo número que seria gerado (não reserva nada). */
  async previa(orgaoId: string, mascara?: string, ano: number = anoBrasilia()): Promise<string> {
    const masc = mascara ?? (await this.mascaraDoOrgao(orgaoId));
    const [linha] = await this.ds.query(`SELECT ultimo FROM sequencias_numero_processo WHERE orgao_id::text = $1 AND ano = $2`, [orgaoId, ano]);
    let seq = Math.max(Number(linha?.ultimo ?? 0), await this.maiorSequencialExistente(this.ds, orgaoId, ano, masc));
    for (let i = 0; i < MAX_PULOS; i++) {
      seq++;
      const numero = formatarNumeroProcesso(masc, ano, seq);
      if (!(await this.existeNoOrgao(this.ds, orgaoId, numero))) return numero;
    }
    return formatarNumeroProcesso(masc, ano, seq + 1);
  }

  // ------------------------------------------------------------ geração

  /**
   * Próximo número do órgão (CONSOME a sequência). Passe o `EntityManager` da
   * transação que cria o processo: a linha da sequência fica travada até o
   * fim dela (criações simultâneas do mesmo órgão esperam a vez) e, se a
   * criação falhar, o número volta.
   */
  async gerar(orgaoId: string, m?: EntityManager): Promise<{ numero: string; ano: number; sequencial: number }> {
    if (!orgaoId) throw new BadRequestException('Órgão não identificado para numerar o processo.');
    const exec: Executor = m ?? this.ds;
    const mascara = await this.mascaraDoOrgao(orgaoId, exec);
    const ano = anoBrasilia();
    const [linha] = await exec.query(`SELECT 1 FROM sequencias_numero_processo WHERE orgao_id::text = $1 AND ano = $2`, [orgaoId, ano]);
    if (!linha) {
      // 1º número do órgão no ano: começa depois do maior já existente no formato
      const maior = await this.maiorSequencialExistente(exec, orgaoId, ano, mascara);
      await exec.query(
        `INSERT INTO sequencias_numero_processo (orgao_id, ano, ultimo) VALUES ($1, $2, $3) ON CONFLICT (orgao_id, ano) DO NOTHING`,
        [orgaoId, ano, maior],
      );
    }
    for (let i = 0; i < MAX_PULOS; i++) {
      const [r]: Array<{ ultimo: number }> = await exec.query(
        `INSERT INTO sequencias_numero_processo (orgao_id, ano, ultimo) VALUES ($1, $2, 1)
         ON CONFLICT (orgao_id, ano) DO UPDATE SET ultimo = sequencias_numero_processo.ultimo + 1, updated_at = now()
         RETURNING ultimo`,
        [orgaoId, ano],
      );
      const sequencial = Number(r.ultimo);
      const numero = formatarNumeroProcesso(mascara, ano, sequencial);
      // Pula número já ocupado (digitado à mão no mesmo formato)
      if (!(await this.existeNoOrgao(exec, orgaoId, numero))) return { numero, ano, sequencial };
    }
    throw new ConflictException('Não foi possível gerar o nº do processo administrativo: a sequência do órgão está ocupada. Informe o número manualmente.');
  }

  /**
   * Número do processo para uma criação: o DIGITADO (normalizado e conferido
   * no órgão — 409 se já existir) ou, vazio, o GERADO.
   */
  async numeroParaCriacao(orgaoId: string, digitado: unknown, m?: EntityManager): Promise<string> {
    const informado = this.normalizar(digitado);
    if (informado) {
      await this.exigirLivre(orgaoId, informado, m);
      return informado;
    }
    return (await this.gerar(orgaoId, m)).numero;
  }

  /** Número digitado normalizado (vazio → null); inválido → 400. */
  normalizar(digitado: unknown): string | null {
    try {
      return normalizarNumeroDigitado(digitado);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : String(e));
    }
  }

  /** 409 se o órgão já tem processo com este número (`ignorarId`: o próprio, na edição). */
  async exigirLivre(orgaoId: string | null | undefined, numero: string, m?: EntityManager, ignorarId?: string): Promise<void> {
    if (await this.existeNoOrgao(m ?? this.ds, orgaoId ?? null, numero, ignorarId)) throw this.erroDuplicado(numero);
  }

  erroDuplicado(numero: string): ConflictException {
    return new ConflictException(
      `Já existe um processo administrativo nº ${numero} neste órgão. Informe outro número ou deixe o campo em branco para o sistema gerar.`,
    );
  }

  /** Violação da unicidade órgão + nº do processo (corrida entre duas gravações) → 409; demais erros seguem. */
  traduzirViolacao(e: unknown, numero: string): unknown {
    if (e instanceof QueryFailedError) {
      const d = e.driverError as { code?: string; constraint?: string } | undefined;
      if (d?.code === '23505' && (d.constraint === UQ_LICITACOES_ORGAO_NUMERO_PROCESSO || !d.constraint)) return this.erroDuplicado(numero);
    }
    return e;
  }

  // ------------------------------------------------------------ apoio

  /** Nome de quem alterou a configuração (usuário, órgão ou admin da plataforma). */
  async nomeDoAtor(ator: { usuarioId: string | null; orgaoId: string | null; admin: boolean; tipo: string }): Promise<string> {
    if (ator.admin) return 'Administrador da plataforma';
    if (ator.usuarioId) {
      const [u] = await this.ds.query(`SELECT nome FROM usuarios WHERE id::text = $1`, [ator.usuarioId]);
      if (u?.nome) return String(u.nome);
    }
    if (ator.tipo === 'ORGAO' && ator.orgaoId) {
      const [o] = await this.ds.query(`SELECT nome FROM orgaos WHERE id::text = $1`, [ator.orgaoId]);
      if (o?.nome) return String(o.nome);
    }
    return 'Órgão';
  }

  private async existeNoOrgao(exec: Executor, orgaoId: string | null, numero: string, ignorarId?: string): Promise<boolean> {
    const [r] = await exec.query(
      `SELECT 1 FROM licitacoes
        WHERE numero_processo = $1 AND orgao_id::text IS NOT DISTINCT FROM $2::text ${ignorarId ? 'AND id::text <> $3' : ''} LIMIT 1`,
      ignorarId ? [numero, orgaoId, ignorarId] : [numero, orgaoId],
    );
    return !!r;
  }

  /** Maior sequencial já usado pelo órgão no ano, entre os números no formato da máscara. */
  private async maiorSequencialExistente(exec: Executor, orgaoId: string, ano: number, mascara: string): Promise<number> {
    const numeros: Array<{ n: string }> = await exec.query(`SELECT numero_processo AS n FROM licitacoes WHERE orgao_id::text = $1`, [orgaoId]);
    let maior = 0;
    for (const { n } of numeros) {
      const s = sequencialDoNumero(mascara, ano, n);
      if (s && s > maior) maior = s;
    }
    return maior;
  }
}
