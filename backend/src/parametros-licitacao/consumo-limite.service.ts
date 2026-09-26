import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ParametrosLicitacaoService } from './parametros-licitacao.service';
import {
  IncisoLimiteDispensa,
  Ramo,
  RegistroConsumo,
  arred2,
  consumoDoLimite,
  percentualDoLimite,
  ramoDoItem,
} from './limites-dispensa';
import { definicaoDoFundamento, fundamentoEfetivo, incisoLimiteDoFundamento } from '../licitacoes/fundamento-legal';

/** Situações que não consomem o limite (o processo não gerou despesa). */
const SITUACOES_SEM_DESPESA = ['REVOGADA', 'ANULADA', 'DESERTA', 'FRACASSADA'];

export interface ConsumoRamo {
  ramo: Ramo;
  /** Soma do ramo no exercício (este processo incluído). */
  total: number;
  /** Parte deste processo. */
  deste_processo: number;
  /** Demais dispensas do órgão no ramo/exercício. */
  outros_processos: number;
  quantidade_processos: number;
  percentual: number;
  excede: boolean;
}

export interface ConsumoDoLimiteProcesso {
  aplicavel: boolean;
  motivo?: string;
  fundamento: string | null;
  fundamento_referencia: string | null;
  exercicio: number;
  inciso?: IncisoLimiteDispensa;
  limite?: { valor: number; ato_normativo: string; exercicio: number; provisorio: boolean } | null;
  ramos: ConsumoRamo[];
  /** Ramo com o maior consumo (o que a tela destaca). */
  maior: ConsumoRamo | null;
}

/**
 * CONSUMO DO LIMITE DA DISPENSA (art. 75, §1º) — leitura para a tela e base
 * do Portão A (Entrega 4). O somatório é a função pura `consumoDoLimite`;
 * aqui só se lê o banco: itens das dispensas do órgão no exercício (valor
 * homologado quando houver, senão o estimado), fora as revogadas/anuladas/
 * desertas/fracassadas e os itens cancelados/desertos/fracassados.
 */
@Injectable()
export class ConsumoLimiteService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly parametros: ParametrosLicitacaoService,
  ) {}

  /** Itens de dispensa por valor do órgão no exercício, prontos para o somatório. */
  async registros(orgaoId: string, exercicio: number): Promise<RegistroConsumo[]> {
    const linhas: any[] = await this.ds.query(
      `SELECT l.id::text AS licitacao_id, l.orgao_id::text AS orgao_id, l.modalidade::text AS modalidade,
              l.tipo_contratacao::text AS tipo_contratacao, l.fundamento_legal, l.codigo_unidade_compradora,
              COALESCE(l.ano, EXTRACT(YEAR FROM l.created_at))::int AS exercicio,
              i.tipo_item::text AS tipo_item, i.codigo_catmat, i.codigo_catser, i.codigo_catalogo,
              COALESCE(cat.codigo_classe, NULLIF(TRIM(i.classe_catalogo), '')) AS classe,
              COALESCE(i.valor_total_homologado, i.valor_total_estimado, 0)::float AS valor
         FROM licitacoes l
         JOIN itens_licitacao i ON i.licitacao_id::text = l.id::text
         LEFT JOIN LATERAL (
           SELECT ic.codigo_classe FROM itens_catalogo ic
            WHERE ic.codigo = COALESCE(NULLIF(i.codigo_catmat, ''), NULLIF(i.codigo_catser, ''), NULLIF(i.codigo_catalogo, ''))
              AND ic.codigo_classe IS NOT NULL
            LIMIT 1
         ) cat ON true
        WHERE l.orgao_id::text = $1
          AND l.modalidade::text LIKE 'DISPENSA%'
          AND COALESCE(l.ano, EXTRACT(YEAR FROM l.created_at))::int = $2
          AND COALESCE(l.situacao::text, 'ATIVA') <> ALL($3)
          AND COALESCE(i.status::text, 'ATIVO') NOT IN ('CANCELADO', 'DESERTO', 'FRACASSADO')`,
      [orgaoId, exercicio, SITUACOES_SEM_DESPESA],
    );
    const registros: RegistroConsumo[] = [];
    for (const r of linhas) {
      const inciso = incisoLimiteDoFundamento(fundamentoEfetivo(r));
      if (!inciso) continue; // dispensa por outra hipótese (emergência etc.) não consome o limite de valor
      registros.push({
        licitacao_id: r.licitacao_id,
        orgao_id: r.orgao_id,
        exercicio: Number(r.exercicio),
        inciso,
        ramo: ramoDoItem(r, r.codigo_unidade_compradora),
        valor: Number(r.valor) || 0,
      });
    }
    return registros;
  }

  async consumoDoProcesso(licitacaoId: string): Promise<ConsumoDoLimiteProcesso> {
    const [lic] = await this.ds.query(
      `SELECT id::text AS id, orgao_id::text AS orgao_id, modalidade::text AS modalidade, tipo_contratacao::text AS tipo_contratacao,
              fundamento_legal, codigo_unidade_compradora, COALESCE(ano, EXTRACT(YEAR FROM created_at))::int AS exercicio
         FROM licitacoes WHERE id::text = $1`,
      [licitacaoId],
    );
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    const fundamento = fundamentoEfetivo(lic);
    const def = definicaoDoFundamento(fundamento);
    const exercicio = Number(lic.exercicio);
    const base = { fundamento, fundamento_referencia: def?.referencia ?? null, exercicio, ramos: [] as ConsumoRamo[], maior: null };
    const inciso = incisoLimiteDoFundamento(fundamento);
    if (!inciso) {
      return {
        ...base,
        aplicavel: false,
        motivo: def
          ? `O limite de valor só se aplica à dispensa do art. 75, I e II (este processo: ${def.referencia}).`
          : 'Processo sem fundamento legal de dispensa por valor.',
      };
    }
    const limite = await this.parametros.limiteDispensa(exercicio, inciso);
    const registros = await this.registros(lic.orgao_id, exercicio);
    const doProcesso = registros.filter((r) => r.licitacao_id === licitacaoId);
    const ramos: Ramo[] = [];
    for (const r of doProcesso) if (!ramos.some((x) => x.classe === r.ramo.classe && x.unidade_gestora === r.ramo.unidade_gestora)) ramos.push(r.ramo);

    const consumo: ConsumoRamo[] = ramos.map((ramo) => {
      const c = consumoDoLimite(registros, lic.orgao_id, exercicio, ramo, inciso);
      const deste = c.processos.find((p) => p.licitacao_id === licitacaoId)?.valor ?? 0;
      return {
        ramo,
        total: c.total,
        deste_processo: deste,
        outros_processos: arred2(c.total - deste),
        quantidade_processos: c.processos.length,
        percentual: limite ? percentualDoLimite(c.total, limite.valor) : 0,
        excede: !!limite && c.total > limite.valor,
      };
    });
    consumo.sort((a, b) => b.total - a.total);
    return {
      ...base,
      aplicavel: true,
      inciso,
      limite: limite
        ? { valor: limite.valor, ato_normativo: limite.ato_normativo, exercicio: limite.exercicio, provisorio: limite.provisorio }
        : null,
      ramos: consumo,
      maior: consumo[0] ?? null,
    };
  }
}
