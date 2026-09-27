import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource, Repository } from 'typeorm';
import { basesDeLeitura, caminhoContido, resolverArquivoDeUrl } from '../../common/arquivos/arquivos';
import { calendarioDoOrgao } from '../../common/prazos/dias-uteis';
import { ehFaseInterna } from '../../licitacoes/transicoes/fases';
import { ConsumoLimiteService } from '../../parametros-licitacao/consumo-limite.service';
import { AuditLogService } from '../audit-log.service';
import { AcaoLogFaseInterna } from '../entities/log-fase-interna.entity';
import { MAPA_TIPO_DOCUMENTOS_LICITACAO } from '../espelho-documentos-licitacao';
import { FaseInternaService } from '../fase-interna.service';
import { CHAVE_TAREFA_RENOVACAO } from '../orcamento/orcamento.service';
import { PassoFaseInterna } from '../tarefas/etapas-fase-interna';
import { TarefasService } from '../tarefas/tarefas.service';
import { AchadoConformidade, RevisaoConformidade } from './achado.entity';
import { DocumentoLinha, EntradaContexto, montarContexto } from './contexto';
import { AchadoExistente, ROTULO_PORTAO, avaliarRegras, contagemDaConformidade, pendenciasDoPortao, planejarRevisao, planoVazio } from './motor';
import { OpcoesPortao, definirResumidorDeConformidade, definirVerificadorDePortao } from './portoes';
import { REGRAS, avaliacaoDoPrazo, passoDoAchado, publicacaoPrevista, regraPorCodigo, rotuloFolhas } from './regras';
import { paginasDoArquivo } from './texto-pdf';
import { ModeloFluxoService } from '../fluxo/modelo-fluxo.service';
import { regrasDaTrava } from '../fluxo/travas';
import { ModeloFluxo, dependenciasEfetivas } from '../fluxo/modelo-fluxo';
import type { FluxoConformidade } from './tipos';
import type { AchadoCalculado, AtoProtegido, AvaliacaoRegra, ContextoConformidade, Portao } from './tipos';

type Autor = { id: string | null; nome: string | null };

/** F1: o que a conformidade usa do modelo de fluxo do processo. */
export function fluxoParaConformidade(
  modelo: ModeloFluxo,
  fluxo: { reabertas?: Record<string, any> | null; a_revisar?: Record<string, any> | null },
): FluxoConformidade {
  const efetivas = dependenciasEfetivas(modelo.etapas);
  const passo_da_peca: Record<string, string> = {};
  for (const e of modelo.etapas) for (const t of e.tipos_peca) passo_da_peca[t] = e.codigo;
  const titulo = (c: string) => modelo.etapas.find((e) => e.codigo === c)?.titulo ?? c;
  const tipos = (c: string) => modelo.etapas.find((e) => e.codigo === c)?.tipos_peca ?? [];
  return {
    dependencias: Object.fromEntries(efetivas),
    passo_da_peca,
    pendentes: [
      ...Object.entries(fluxo.reabertas ?? {}).map(([c, m]) => ({ codigo: c, titulo: titulo(c), marca: 'REABERTA' as const, motivo: m?.motivo ?? null, tipos_peca: tipos(c) })),
      ...Object.entries(fluxo.a_revisar ?? {}).map(([c, m]) => ({ codigo: c, titulo: titulo(c), marca: 'A_REVISAR' as const, motivo: m?.motivo ?? null, tipos_peca: tipos(c) })),
    ],
  };
}
const SISTEMA: Autor = { id: 'sistema', nome: 'Sistema (revisão automática)' };
export const chaveTarefaDoAchado = (id: string) => `achado:${id}`;

const ROTULO_ACAO: Record<string, string> = {
  CORRIGIR_PECA: 'Corrigir peça',
  JUSTIFICAR: 'Justificar',
  ABRIR: 'Abrir',
  AGENDAR: 'Agendar',
  RESOLVER: 'Resolver',
};

/** Tela da etapa de cada tipo de peça (o "Corrigir peça" leva para lá). */
const TELA_DO_TIPO: Record<string, string> = {
  DFD: 'dfd',
  ETP: 'etp',
  AR: 'etp',
  TR: 'tr',
  PB: 'tr',
  PP: 'pesquisa',
  MCP: 'pesquisa',
  DO: 'reserva',
  AA: 'autorizacao',
  DP: 'autorizacao',
  RAG: 'minutas',
  ME: 'minutas',
  MC: 'minutas',
  PJ: 'parecer',
  PJE: 'parecer',
  MCI: 'controle-interno',
};

/**
 * MOTOR DE CONFORMIDADE (Entrega 4; SPEC §4; mockup Conformidade).
 *
 * Monta o CONTEXTO uma vez (processo, peças com texto — geradas e o texto
 * extraído dos PDFs anexados —, itens, cotações, reserva, limites e
 * calendário do órgão), roda as REGRAS puras e grava os ACHADOS de forma
 * idempotente. Roda:
 *  - sob demanda ("Revisar agora");
 *  - quando uma peça muda — na MESMA fila por processo das tarefas (gatilho
 *    pós-commit da Entrega 2: `TarefasService.registrarAntesDeSincronizar`);
 *  - antes dos atos protegidos (portões A, B e C — `portoes.ts`), em memória,
 *    com o ato que vai ser praticado.
 * Achado BLOQUEIO aberto gera a tarefa (origem ACHADO) do responsável pela
 * peça, concluída quando o achado se resolve. EXERC-01 cria a tarefa da
 * Contabilidade "renovar a dotação" (a mesma chave da Entrega 3A).
 * Desligar: FASE_INTERNA_CONFORMIDADE=false (nenhum portão bloqueia).
 */
@Injectable()
export class ConformidadeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConformidadeService.name);
  private readonly travas = new Map<string, Promise<unknown>>();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(AchadoConformidade) private readonly repo: Repository<AchadoConformidade>,
    @InjectRepository(RevisaoConformidade) private readonly revisaoRepo: Repository<RevisaoConformidade>,
    private readonly faseInterna: FaseInternaService,
    private readonly consumoLimite: ConsumoLimiteService,
    private readonly tarefas: TarefasService,
    private readonly auditLog: AuditLogService,
    private readonly modeloFluxo: ModeloFluxoService,
  ) {}

  onModuleInit() {
    this.tarefas.registrarAntesDeSincronizar((id) => this.revisar(id, { origem: 'AUTOMATICA' }));
    definirVerificadorDePortao((id, portao, opcoes) => this.pendenciasDoPortao(id, portao, opcoes));
    definirResumidorDeConformidade((id) => this.resumo(id));
  }

  onModuleDestroy() {
    definirVerificadorDePortao(null);
    definirResumidorDeConformidade(null);
  }

  ativo(): boolean {
    return process.env.FASE_INTERNA_CONFORMIDADE !== 'false';
  }

  /** Uma revisão por vez por processo (a fila das tarefas, o botão e a tela). */
  private serializar<T>(licitacaoId: string, fn: () => Promise<T>): Promise<T> {
    const anterior = this.travas.get(licitacaoId) ?? Promise.resolve();
    const atual = anterior.catch(() => undefined).then(fn);
    const fim = atual.catch(() => undefined);
    this.travas.set(licitacaoId, fim);
    void fim.then(() => {
      if (this.travas.get(licitacaoId) === fim) this.travas.delete(licitacaoId);
    });
    return atual;
  }

  // ==========================================================================
  // CONTEXTO (lido uma vez por revisão)
  // ==========================================================================

  private async licitacao(licitacaoId: string) {
    const [lic] = await this.ds.query(
      `SELECT id::text AS id, orgao_id::text AS orgao_id, numero_processo, numero_edital, objeto, modalidade::text AS modalidade,
              tipo_contratacao::text AS tipo_contratacao, criterio_julgamento::text AS criterio_julgamento, regime_execucao::text AS regime_execucao,
              natureza_objeto, fase::text AS fase, situacao::text AS situacao, fundamento_legal, sigilo_orcamento::text AS sigilo_orcamento,
              justificativa_sigilo, valor_total_estimado, COALESCE(ano, EXTRACT(YEAR FROM created_at))::int AS exercicio, selecao_externa,
              data_publicacao_edital, data_inicio_acolhimento, data_fim_acolhimento, data_abertura_sessao, updated_at, dispensa_com_lances,
              (SELECT c.dispensa_com_lances FROM configuracoes_fase_interna c WHERE c.orgao_id = licitacoes.orgao_id) AS padrao_dispensa_com_lances,
              (SELECT c.regulamento_adota_in67 FROM configuracoes_fase_interna c WHERE c.orgao_id = licitacoes.orgao_id) AS regulamento_adota_in67
         FROM licitacoes WHERE id::text = $1`,
      [licitacaoId],
    );
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    return lic;
  }

  /** Arquivo físico de uma referência gravada (só dentro das pastas de upload). */
  private caminhoFisico(ref: string | null | undefined): string | null {
    if (!ref) return null;
    const porUrl = resolverArquivoDeUrl(ref);
    if (porUrl) return porUrl;
    const abs = path.resolve(ref);
    for (const base of [...basesDeLeitura(), path.resolve(process.cwd(), 'uploads')]) {
      const rel = path.relative(base, abs);
      if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
        const contido = caminhoContido(base, rel);
        if (contido && fs.existsSync(contido)) return contido;
      }
    }
    return null;
  }

  async entrada(
    licitacaoId: string,
    opcoes: { ato?: AtoProtegido | null; cronograma?: Record<string, unknown> | null; valores_itens?: Record<number, number> | null; sem_texto_pdf?: boolean } = {},
  ): Promise<{ entrada: EntradaContexto; arquivos: Map<string, boolean> }> {
    const lic = await this.licitacao(licitacaoId);
    const instrucao = await this.faseInterna.getInstrucao(licitacaoId);
    const docs: any[] = await this.ds.query(
      `SELECT id::text AS id, tipo::text AS tipo, titulo, descricao, versao, status::text AS status, origem::text AS origem, data_documento,
              folha_inicial, folha_final, hash_arquivo, dados_estruturados, assinaturas, signatarios_exigidos, sistema_origem, id_externo,
              caminho_arquivo, arquivo_pdf_path
         FROM documentos_fase_interna
        WHERE licitacao_id::text = $1 AND versao_atual = true AND status::text <> 'SUBSTITUIDO'
        ORDER BY folha_inicial NULLS LAST, created_at`,
      [licitacaoId],
    );
    const textos: Record<string, string[] | null> = {};
    const arquivos = new Map<string, boolean>();
    for (const d of docs) {
      const caminho = this.caminhoFisico(d.caminho_arquivo) ?? this.caminhoFisico(d.arquivo_pdf_path);
      arquivos.set(d.id, !!caminho);
      if (opcoes.sem_texto_pdf || d.origem === 'INTERNO' || d.dados_estruturados?.nao_se_aplica || !caminho) continue;
      textos[d.id] = await paginasDoArquivo(caminho, d.hash_arquivo ?? null);
    }
    // Documentos da aba Documentos de um tipo de peça que NÃO viraram a peça (juntados de novo)
    const avulsos: any[] = await this.ds
      .query(
        `SELECT d.id::text AS id, d.tipo::text AS tipo, COALESCE(d.titulo, d.nome_original) AS titulo, d.hash_arquivo, d.data_documento
           FROM documentos_licitacao d
          WHERE d.licitacao_id::text = $1 AND d.tipo::text = ANY($2::text[]) AND d.status::text NOT IN ('REVOGADO', 'SUBSTITUIDO')
            AND NOT EXISTS (SELECT 1 FROM documentos_fase_interna f WHERE f.sistema_origem = 'documentos_licitacao' AND f.id_externo = d.id::text)`,
        [licitacaoId, Object.keys(MAPA_TIPO_DOCUMENTOS_LICITACAO)],
      )
      .catch(() => []);
    // Pesquisa: a versão atual da peça PP ou a última com os itens (anexada feita fora não tem)
    const [pp] = await this.ds.query(
      `SELECT dados_estruturados FROM documentos_fase_interna
        WHERE licitacao_id::text = $1 AND tipo::text = 'PP' AND jsonb_typeof(dados_estruturados->'itens') = 'array'
        ORDER BY versao_atual DESC, versao DESC LIMIT 1`,
      [licitacaoId],
    );
    const [reserva] = await this.ds.query(
      `SELECT r.id::text AS id, r.status, r.exercicio_base, r.documento_id::text AS documento_id,
              ldo.numero AS ldo, loa.numero AS loa, ppa.numero AS ppa
         FROM reservas_orcamentarias r
         LEFT JOIN leis_orcamentarias ldo ON ldo.id = r.lei_ldo_id
         LEFT JOIN leis_orcamentarias loa ON loa.id = r.lei_loa_id
         LEFT JOIN leis_orcamentarias ppa ON ppa.id = r.lei_ppa_id
        WHERE r.licitacao_id::text = $1 AND r.versao_atual = true LIMIT 1`,
      [licitacaoId],
    ).catch(() => []);
    const linhas: any[] = reserva
      ? await this.ds.query(`SELECT exercicio, valor, situacao FROM reservas_orcamentarias_linhas WHERE reserva_id::text = $1 ORDER BY exercicio`, [reserva.id])
      : [];
    const [{ total }] = await this.ds.query(
      `SELECT COALESCE(SUM(COALESCE(valor_total_estimado, quantidade * COALESCE(valor_unitario_estimado, 0))), 0)::float AS total
         FROM itens_licitacao WHERE licitacao_id::text = $1 AND status::text <> 'CANCELADO'`,
      [licitacaoId],
    );
    const simulados = opcoes.valores_itens ?? null;
    let limite = null;
    try {
      limite = await this.consumoLimite.consumoDoProcesso(licitacaoId, { valores_itens: simulados });
    } catch {
      limite = null;
    }
    const valorItens = simulados ? Object.values(simulados).reduce((s, v) => s + (Number(v) || 0), 0) : Number(total);
    // F1: o modelo de fluxo do processo (dependências da CRONO-01; etapas reabertas/a revisar da FLUXO-01)
    // Só leitura: a avaliação do portão pode rodar dentro da transação do ato
    const fluxo = await this.modeloFluxo
      .contextoDoProcesso(licitacaoId, { gravar: false })
      .then((c) => (c ? fluxoParaConformidade(c.modelo, c.fluxo) : null))
      .catch(() => null);
    return {
      arquivos,
      entrada: {
        agora: new Date(),
        licitacao: lic,
        valor_itens: valorItens,
        instrucao: { contratacao_direta: instrucao.contratacao_direta, itens: instrucao.itens as any },
        documentos: docs as DocumentoLinha[],
        textos_pdf: textos,
        anexos_avulsos: avulsos.map((a) => ({
          documento_id: a.id,
          tipo: MAPA_TIPO_DOCUMENTOS_LICITACAO[a.tipo] ?? a.tipo,
          titulo: String(a.titulo || a.tipo),
          impressao: a.hash_arquivo ?? null,
          data_documento: a.data_documento ? new Date(a.data_documento).toISOString().slice(0, 10) : null,
        })),
        pesquisa_dados: pp?.dados_estruturados ?? null,
        reserva: reserva ? { status: reserva.status, exercicio_base: reserva.exercicio_base, documento_id: reserva.documento_id, linhas, leis: { LDO: reserva.ldo, LOA: reserva.loa, PPA: reserva.ppa } } : null,
        limite,
        calendario: calendarioDoOrgao(lic.orgao_id),
        ato_pretendido: opcoes.ato ?? null,
        fluxo,
        cronograma: opcoes.cronograma
          ? Object.fromEntries(
              ['data_publicacao_edital', 'data_inicio_acolhimento', 'data_fim_acolhimento', 'data_abertura_sessao']
                .filter((k) => opcoes.cronograma![k])
                .map((k) => [k, String(opcoes.cronograma![k])]),
            )
          : null,
      },
    };
  }

  /** Contexto + avaliação de todas as regras (em memória, sem gravar nada). */
  async avaliacao(
    licitacaoId: string,
    opcoes: { ato?: AtoProtegido | null; cronograma?: Record<string, unknown> | null; valores_itens?: Record<number, number> | null; sem_texto_pdf?: boolean } = {},
  ): Promise<{ ctx: ContextoConformidade; avaliacoes: AvaliacaoRegra[]; arquivos: Map<string, boolean> }> {
    const { entrada, arquivos } = await this.entrada(licitacaoId, opcoes);
    const ctx = montarContexto(entrada);
    return { ctx, avaliacoes: avaliarRegras(ctx), arquivos };
  }

  // ==========================================================================
  // PORTÕES (antes dos atos protegidos)
  // ==========================================================================

  /**
   * Pendências do portão para o ATO que vai ser praticado: avaliação em
   * memória (nada gravado dentro da transação do ato), com as justificativas
   * já registradas. Processo fora da fase interna: o ato do portão já foi
   * praticado — nada trava (o portão vale para o ato que ainda vai ser
   * praticado).
   */
  async pendenciasDoPortao(licitacaoId: string, portao: Portao, opcoes: OpcoesPortao = {}): Promise<string[]> {
    if (!this.ativo()) return [];
    const [lic] = await this.ds.query(`SELECT fase::text AS fase FROM licitacoes WHERE id::text = $1`, [licitacaoId]);
    if (!lic || !ehFaseInterna(lic.fase)) return [];
    const ato: AtoProtegido = opcoes.ato ?? (portao === 'A' ? 'CONCLUIR_PESQUISA' : portao === 'B' ? 'AUTORIZAR' : 'PUBLICAR');
    // Portões A e B não leem texto de peça (limite e art. 72): o PDF não precisa ser lido
    const { avaliacoes } = await this.avaliacao(licitacaoId, { ato, cronograma: opcoes.cronograma ?? null, valores_itens: opcoes.valores_itens ?? null, sem_texto_pdf: portao !== 'C' });
    const justificados: Array<{ regra: string; chave: string }> = await this.ds.query(
      `SELECT regra, chave FROM achados_conformidade WHERE licitacao_id::text = $1 AND status = 'JUSTIFICADO'`,
      [licitacaoId],
    );
    // F1: quais regras seguram o ATO e com que severidade vem dos dados (travas por ato)
    const doAto = regrasDaTrava(await this.modeloFluxo.travas(), ato);
    const pend = pendenciasDoPortao(portao, avaliacoes, new Set(justificados.map((j) => `${j.regra}|${j.chave}`)), doAto);
    // O ato foi recusado: a tela da conformidade passa a mostrar o motivo
    if (pend.length && !opcoes.somenteAvaliacao) void this.tarefas.agendar(licitacaoId);
    return pend;
  }

  /** Recusa o ato (400) com as pendências do portão — o que falta e onde. */
  async exigirPortao(licitacaoId: string, portao: Portao, opcoes: OpcoesPortao = {}): Promise<void> {
    const pend = await this.pendenciasDoPortao(licitacaoId, portao, opcoes);
    if (!pend.length) return;
    throw new BadRequestException({
      message: pend.length === 1 ? pend[0] : `Pendências da ${ROTULO_PORTAO[portao].replace(/^Trava/, 'trava')}: ${pend.join(' | ')}`,
      pendencias: pend,
      portao,
    });
  }

  // ==========================================================================
  // REVISÃO (grava os achados — idempotente)
  // ==========================================================================

  revisar(licitacaoId: string, opcoes: { origem: 'AUTOMATICA' | 'MANUAL' | 'TELA'; autor?: Autor }): Promise<{ mudou: boolean } | null> {
    return this.serializar(licitacaoId, () => this.revisarAgora(licitacaoId, opcoes));
  }

  private async revisarAgora(licitacaoId: string, opcoes: { origem: 'AUTOMATICA' | 'MANUAL' | 'TELA'; autor?: Autor }): Promise<{ mudou: boolean } | null> {
    if (!this.ativo()) return null;
    const [lic] = await this.ds.query(`SELECT orgao_id::text AS orgao_id, numero_processo, fase::text AS fase, situacao::text AS situacao FROM licitacoes WHERE id::text = $1`, [licitacaoId]);
    if (!lic) return null;
    const autor = opcoes.autor ?? SISTEMA;
    if (!ehFaseInterna(lic.fase)) {
      // Divulgado (ou além): a conferência fica congelada; as tarefas dos achados perdem o objeto
      await this.cancelarTarefasDosAchados(licitacaoId, 'A fase interna foi encerrada (processo divulgado).');
      return { mudou: false };
    }
    const { ctx, avaliacoes } = await this.avaliacao(licitacaoId);
    const existentes = await this.repo.find({ where: { licitacao_id: licitacaoId } });
    const plano = planejarRevisao(existentes as unknown as AchadoExistente[], avaliacoes);
    const agora = new Date();
    const em = agora.toISOString();
    const regraDe = (codigo: string) => regraPorCodigo(codigo)!;
    const colunas = (a: AchadoCalculado) => ({
      severidade: a.severidade,
      titulo: a.titulo.slice(0, 250),
      mensagem: a.mensagem,
      evidencias: a.evidencias,
      exige_justificativa: !!a.exige_justificativa,
      tipo_peca: a.tipo_peca_responsavel ?? null,
      acao: a.acao ?? null,
      sem_tarefa: !!a.sem_tarefa || !!regraDe(a.regra)?.sem_tarefa,
    });

    if (!planoVazio(plano)) {
      await this.ds.transaction(async (m) => {
        const r = m.getRepository(AchadoConformidade);
        for (const a of plano.criar) {
          await r
            .createQueryBuilder()
            .insert()
            .into(AchadoConformidade)
            .values({
              orgao_id: lic.orgao_id,
              licitacao_id: licitacaoId,
              regra: a.regra,
              chave: a.chave.slice(0, 300),
              etapa: regraDe(a.regra).etapa,
              portao: regraDe(a.regra).portao,
              status: 'ABERTO',
              primeira_deteccao: agora,
              ultima_deteccao: agora,
              historico: [{ acao: 'DETECTADO', em, por: autor.nome, texto: null }],
              ...colunas(a),
            } as any)
            .orIgnore()
            .execute();
        }
        const porId = new Map(existentes.map((e) => [e.id, e]));
        for (const u of plano.atualizar) {
          await r.update(u.id, { ...colunas(u.achado), ultima_deteccao: agora } as any);
        }
        for (const u of plano.reabrir) {
          const e = porId.get(u.id)!;
          await r.update(u.id, {
            ...colunas(u.achado),
            status: 'ABERTO',
            ultima_deteccao: agora,
            resolvido_em: null,
            resolvido_por_id: null,
            resolvido_por_nome: null,
            motivo_resolucao: null,
            historico: [...(e.historico ?? []), { acao: 'REABERTO', em, por: autor.nome, texto: u.motivo }],
          } as any);
        }
        for (const u of plano.resolver) {
          const e = porId.get(u.id)!;
          await r.update(u.id, {
            status: 'RESOLVIDO',
            resolvido_em: agora,
            resolvido_por_id: autor.id,
            resolvido_por_nome: autor.nome,
            motivo_resolucao: u.motivo,
            historico: [...(e.historico ?? []), { acao: 'RESOLVIDO', em, por: autor.nome, texto: u.motivo }],
          } as any);
        }
      });
    }
    const mudou = !planoVazio(plano);
    {
      await this.revisaoRepo.save(
        this.revisaoRepo.create({
          licitacao_id: licitacaoId,
          orgao_id: lic.orgao_id,
          revisado_em: agora,
          revisado_por_id: autor.id,
          revisado_por_nome: autor.nome,
          origem: opcoes.origem,
          regras: avaliacoes.map((a) => ({ codigo: a.regra.codigo, aplicavel: a.aplicavel, motivo: a.motivo, achados: a.achados.length, erro: a.erro ?? null })),
        }),
      );
    }
    for (const a of avaliacoes.filter((x) => x.erro)) this.logger.warn(`Regra ${a.regra.codigo} falhou no processo ${licitacaoId}: ${a.erro}`);
    await this.sincronizarTarefas(licitacaoId, lic.numero_processo, ctx.processo.contratacao_direta, autor);
    return { mudou };
  }

  /**
   * TAREFAS DOS ACHADOS: BLOQUEIO aberto → tarefa (origem ACHADO) do
   * responsável pela peça; resolvido → a tarefa conclui. EXERC-01 aberto → a
   * tarefa da Contabilidade "renovar a informação orçamentária" (mesma chave
   * da Entrega 3A; concluída pela emissão da nova versão ou pelo anexo, ou
   * aqui quando o achado se resolve).
   */
  private async sincronizarTarefas(licitacaoId: string, numeroProcesso: string, contratacaoDireta: boolean, autor: Autor) {
    if (!this.tarefas.ativo()) return;
    const achados = await this.repo.find({ where: { licitacao_id: licitacaoId } });
    const abertas: Array<{ chave: string; origem_id: string | null }> = await this.ds.query(
      `SELECT chave, origem_id FROM tarefas WHERE licitacao_id::text = $1 AND status = 'ABERTA' AND (chave LIKE 'achado:%' OR chave = $2)`,
      [licitacaoId, CHAVE_TAREFA_RENOVACAO],
    );
    const aberta = (chave: string) => abertas.find((t) => t.chave === chave);
    // Homologação multiusuário: tarefa de achado só para etapa que PODE começar
    // (demanda aprovada e dependências concluídas) — antes disso, ninguém recebe
    // tarefa de uma etapa que ainda não pode ser trabalhada (a tarefa nasce depois)
    const podeIniciar = new Map<string, boolean>();
    const etapaPodeIniciar = async (passo: string) => {
      if (!podeIniciar.has(passo)) podeIniciar.set(passo, await this.tarefas.podeIniciarPasso(licitacaoId, passo).catch(() => true));
      return podeIniciar.get(passo)!;
    };
    for (const a of achados) {
      const chave = chaveTarefaDoAchado(a.id);
      const passoAchado = passoDoAchado({ regra: a.regra, tipo_peca_responsavel: a.tipo_peca }, contratacaoDireta);
      const bloqueio = a.status === 'ABERTO' && a.severidade === 'BLOQUEIO' && !a.sem_tarefa;
      const precisa = bloqueio && (await etapaPodeIniciar(passoAchado));
      if (bloqueio && !precisa && aberta(chave)) {
        await this.tarefas.cancelarTarefaPorChave(licitacaoId, chave, 'A etapa ainda não pode começar (aguardando a aprovação da demanda ou etapas anteriores) — a tarefa volta quando ela puder.');
        continue;
      }
      if (bloqueio && !precisa) continue;
      if (precisa && !aberta(chave)) {
        const onde = (a.evidencias ?? []).slice(0, 3).map((e) => `${e.titulo}${e.folha != null ? `, fl. ${e.folha}` : ''}`);
        await this.tarefas.criarTarefaDoSistema(licitacaoId, {
          chave,
          passo: passoAchado,
          titulo: `Conformidade (${a.regra}) — ${a.titulo}`.slice(0, 250),
          descricao: `Processo ${numeroProcesso}. ${a.mensagem}${onde.length ? ` Onde: ${onde.join('; ')}.` : ''} Corrija a peça: o achado se resolve na próxima revisão (automática ao salvar a peça, ou "Revisar agora" na tela da conformidade).`,
          tipo_peca: a.tipo_peca,
          documento_id: (a.evidencias ?? []).find((e) => e.documento_id)?.documento_id ?? null,
          origem: 'ACHADO',
          origem_id: a.id,
          tipo: 'ACHADO',
        });
      } else if (!precisa && aberta(chave)) {
        await this.tarefas.concluirTarefaPorChave(licitacaoId, chave, a.status === 'RESOLVIDO' ? { id: a.resolvido_por_id, nome: a.resolvido_por_nome } : autor);
      }
      if (a.regra === 'EXERC-01') {
        const renov = aberta(CHAVE_TAREFA_RENOVACAO);
        if (a.status === 'ABERTO' && !renov) {
          await this.tarefas.criarTarefaDoSistema(licitacaoId, {
            chave: CHAVE_TAREFA_RENOVACAO,
            passo: PassoFaseInterna.RESERVA,
            titulo: 'Prever a renovação da dotação (virada do exercício)',
            descricao: `Processo ${numeroProcesso}. ${a.mensagem} Na virada do ano, renove a informação orçamentária (Reserva › Renovar dotação) ou anexe a nova, feita fora.`,
            tipo_peca: 'DO',
            documento_id: (a.evidencias ?? []).find((e) => e.documento_id)?.documento_id ?? null,
            origem: 'ACHADO',
            origem_id: a.id,
            tipo: 'PECA',
          });
        } else if (a.status === 'RESOLVIDO' && renov?.origem_id === a.id) {
          await this.tarefas.concluirTarefaPorChave(licitacaoId, CHAVE_TAREFA_RENOVACAO, { id: a.resolvido_por_id, nome: a.resolvido_por_nome });
        }
      }
    }
  }

  private async cancelarTarefasDosAchados(licitacaoId: string, motivo: string) {
    const abertas: Array<{ chave: string }> = await this.ds.query(
      `SELECT chave FROM tarefas WHERE licitacao_id::text = $1 AND status = 'ABERTA' AND chave LIKE 'achado:%'`,
      [licitacaoId],
    );
    for (const t of abertas) await this.tarefas.cancelarTarefaPorChave(licitacaoId, t.chave, motivo);
  }

  // ==========================================================================
  // JUSTIFICATIVA (achado ATENÇÃO) — vai para os autos
  // ==========================================================================

  async justificar(licitacaoId: string, achadoId: string, body: any, autor: Autor) {
    const lic = await this.licitacao(licitacaoId);
    if (!ehFaseInterna(lic.fase)) throw new ConflictException('A fase interna foi encerrada — a conferência não muda mais.');
    const a = /^[0-9a-f-]{36}$/i.test(achadoId) ? await this.repo.findOne({ where: { id: achadoId } }) : null;
    // Achado de outro processo (ou órgão): não existe para esta rota
    if (!a || a.licitacao_id !== licitacaoId) throw new NotFoundException('Achado não encontrado');
    if (a.severidade !== 'ATENCAO') throw new ConflictException('Bloqueio não se justifica: corrija a peça (a revisão resolve o achado sozinha).');
    if (a.status === 'RESOLVIDO') throw new ConflictException('O achado já foi resolvido.');
    const texto = String(body?.justificativa ?? '').trim().slice(0, 4000);
    if (texto.length < 20) throw new BadRequestException('Escreva a justificativa (ela vai para os autos).');
    const em = new Date();
    await this.repo.update(a.id, {
      status: 'JUSTIFICADO',
      justificativa: texto,
      justificado_por_id: autor.id,
      justificado_por_nome: autor.nome,
      justificado_em: em,
      historico: [...(a.historico ?? []), { acao: 'JUSTIFICADO', em: em.toISOString(), por: autor.nome, texto }],
    } as any);
    await this.auditLog
      .log({
        licitacao_id: licitacaoId,
        documento_id: (a.evidencias ?? []).find((e) => e.documento_id)?.documento_id ?? undefined,
        acao: AcaoLogFaseInterna.DOCUMENTO_EDITADO,
        descricao: `Conformidade — justificativa do achado ${a.regra} (${a.titulo}) por ${autor.nome ?? 'usuário'}: ${texto}`,
        dados_depois: { conformidade: true, achado_id: a.id, regra: a.regra, chave: a.chave, justificativa: texto },
        contexto: { usuario_id: autor.id ?? undefined, usuario_nome: autor.nome ?? undefined },
      })
      .catch(() => undefined);
    const direta = (await this.faseInterna.getInstrucao(licitacaoId)).contratacao_direta;
    await this.sincronizarTarefas(licitacaoId, lic.numero_processo, direta, autor).catch(() => undefined);
    return this.obter(licitacaoId);
  }

  /** Justificativas registradas (para o PDF dos autos — Entrega 6). */
  async justificativasParaAutos(licitacaoId: string) {
    const lista = await this.repo.find({ where: { licitacao_id: licitacaoId, status: 'JUSTIFICADO' }, order: { justificado_em: 'ASC' } });
    return lista.map((a) => ({
      regra: a.regra,
      titulo: a.titulo,
      mensagem: a.mensagem,
      justificativa: a.justificativa,
      justificado_por_nome: a.justificado_por_nome,
      justificado_em: a.justificado_em,
      evidencias: a.evidencias ?? [],
    }));
  }

  // ==========================================================================
  // TELA (mockup Conformidade) e RESUMO (painel do processo)
  // ==========================================================================

  /** A última revisão ficou para trás (peça, itens, reserva ou processo mudaram depois)? */
  private async revisaoDesatualizada(licitacaoId: string, revisadoEm: Date | null): Promise<boolean> {
    if (!revisadoEm) return true;
    const [r] = await this.ds.query(
      `SELECT GREATEST(
          (SELECT MAX(updated_at) FROM documentos_fase_interna WHERE licitacao_id::text = $1),
          (SELECT MAX(updated_at) FROM itens_licitacao WHERE licitacao_id::text = $1),
          (SELECT MAX(updated_at) FROM reservas_orcamentarias WHERE licitacao_id::text = $1),
          (SELECT updated_at FROM licitacoes WHERE id::text = $1)
        ) AS ultima`,
      [licitacaoId],
    );
    return !!r?.ultima && new Date(r.ultima).getTime() > new Date(revisadoEm).getTime();
  }

  private achadoParaTela(a: AchadoConformidade, licitacaoId: string, tarefas: Array<{ id: string; chave: string; status: string }>) {
    const regra = regraPorCodigo(a.regra);
    const tipoAlvo = a.tipo_peca ?? (a.evidencias ?? []).find((e) => e.tipo)?.tipo ?? null;
    const tela = tipoAlvo ? TELA_DO_TIPO[tipoAlvo] : null;
    const acao = a.acao ?? (a.severidade === 'ATENCAO' ? 'JUSTIFICAR' : 'CORRIGIR_PECA');
    const tarefa = tarefas.find((t) => t.chave === chaveTarefaDoAchado(a.id)) ?? null;
    return {
      id: a.id,
      regra: a.regra,
      regra_descricao: regra?.descricao ?? a.regra,
      titulo: a.titulo,
      severidade: a.severidade,
      etapa: a.etapa,
      portao: a.portao,
      status: a.status,
      mensagem: a.mensagem,
      evidencias: a.evidencias ?? [],
      exige_justificativa: a.exige_justificativa,
      pode_justificar: a.severidade === 'ATENCAO' && a.status !== 'RESOLVIDO',
      justificativa: a.justificativa,
      justificado_por_nome: a.justificado_por_nome,
      justificado_em: a.justificado_em,
      resolvido_em: a.resolvido_em,
      resolvido_por_nome: a.resolvido_por_nome,
      motivo_resolucao: a.motivo_resolucao,
      primeira_deteccao: a.primeira_deteccao,
      acao: { tipo: acao, rotulo: ROTULO_ACAO[acao] ?? acao, destino: tela ? `/orgao/processos/${licitacaoId}/fase-interna/${tela}` : `/orgao/processos/${licitacaoId}#fluxo-fase-interna` },
      tarefa: tarefa ? { id: tarefa.id, status: tarefa.status } : null,
      historico: a.historico ?? [],
    };
  }

  async obter(licitacaoId: string) {
    const lic = await this.licitacao(licitacaoId);
    const interna = ehFaseInterna(lic.fase);
    const revisao = await this.revisaoEmDia(licitacaoId, lic.fase);
    const { ctx, arquivos } = await this.avaliacao(licitacaoId);
    const todos = await this.repo.find({ where: { licitacao_id: licitacaoId }, order: { created_at: 'ASC' } });
    const tarefas: Array<{ id: string; chave: string; status: string }> = await this.ds.query(
      `SELECT DISTINCT ON (chave) id::text AS id, chave, status FROM tarefas WHERE licitacao_id::text = $1 AND chave LIKE 'achado:%' ORDER BY chave, created_at DESC`,
      [licitacaoId],
    );
    const ordem = (a: AchadoConformidade) => (a.severidade === 'BLOQUEIO' ? 0 : 1) * 100 + REGRAS.findIndex((r) => r.codigo === a.regra);
    const vigentes = todos.filter((a) => a.status !== 'RESOLVIDO').sort((a, b) => ordem(a) - ordem(b));
    const resolvidos = todos
      .filter((a) => a.status === 'RESOLVIDO')
      .sort((a, b) => new Date(b.resolvido_em ?? 0).getTime() - new Date(a.resolvido_em ?? 0).getTime())
      .slice(0, 30);
    const regrasRev = revisao?.regras ?? [];
    const comAchado = new Set(vigentes.map((a) => a.regra));
    const regras = REGRAS.map((r) => {
      const rv = regrasRev.find((x) => x.codigo === r.codigo);
      const situacao = !rv ? 'NAO_AVALIADA' : rv.erro ? 'ERRO' : !rv.aplicavel ? 'NAO_SE_APLICA' : comAchado.has(r.codigo) ? 'COM_ACHADO' : 'APROVADA';
      return { codigo: r.codigo, descricao: r.descricao, severidade: r.severidade, etapa: r.etapa, portao: r.portao, situacao, motivo: rv?.motivo ?? rv?.erro ?? null };
    });
    // Mesmas contagens do quadro do processo e do checklist (fonte única — E6)
    const contagem = contagemDaConformidade(vigentes);
    const bloqueios = contagem.bloqueios;
    const atencoes = contagem.atencoes;
    const impedem = contagem.impedem_publicar;
    const prazo = avaliacaoDoPrazo(ctx);
    const c = ctx.processo.cronograma;
    return {
      licitacao: {
        id: lic.id,
        numero_processo: lic.numero_processo,
        numero_dispensa: lic.numero_edital ?? null,
        objeto: lic.objeto,
        modalidade: lic.modalidade,
        fase: lic.fase,
        fase_interna: interna,
        fundamento: ctx.processo.fundamento_referencia,
      },
      ativo: this.ativo(),
      aplicavel: interna,
      motivo: interna ? null : 'O processo já foi divulgado: a conferência ficou como estava na publicação (a trava da lei vale só para o ato que ainda vai ser praticado).',
      revisao: revisao ? { em: revisao.revisado_em, por_nome: revisao.revisado_por_nome, origem: revisao.origem } : null,
      contagem: {
        bloqueios,
        atencoes,
        justificados: vigentes.filter((a) => a.status === 'JUSTIFICADO').length,
        resolvidos: todos.filter((a) => a.status === 'RESOLVIDO').length,
        aprovadas: regras.filter((r) => r.situacao === 'APROVADA').length,
        avaliadas: regras.filter((r) => r.situacao === 'APROVADA' || r.situacao === 'COM_ACHADO').length,
        impedem_publicar: impedem,
      },
      achados: vigentes.map((a) => this.achadoParaTela(a, licitacaoId, tarefas)),
      resolvidos: resolvidos.map((a) => this.achadoParaTela(a, licitacaoId, tarefas)),
      regras,
      aviso: {
        dispensa: ctx.processo.modalidade === 'DISPENSA_ELETRONICA',
        publicacao_prevista: publicacaoPrevista(ctx),
        inicio_recebimento: c.data_inicio_acolhimento,
        fim_recebimento: c.data_fim_acolhimento ?? c.data_abertura_sessao,
        dias_uteis: prazo?.dias_uteis ?? null,
        minimo: prazo?.minimo ?? null,
        fundamento: prazo?.fundamento ?? null,
        atende: prazo ? prazo.atende : null,
        minimo_fim: prazo?.minimo_abertura ?? null,
        canais: [
          { nome: 'PNCP (API — aviso e anexos)', situacao: impedem ? 'Aguardando a conformidade' : 'Envio automático ao publicar' },
          { nome: 'Portal DCP (recebimento de propostas e disputa)', situacao: impedem ? 'Aguardando a conformidade' : 'Pronto' },
          { nome: 'Diário oficial e sítio do órgão', situacao: 'Registrar depois de publicar' },
        ],
      },
      assinaturas: ctx.pecas
        .filter((p) => !p.nao_se_aplica)
        .map((p) => ({
          documento_id: p.documento_id,
          tipo: p.tipo,
          titulo: p.titulo,
          folhas: rotuloFolhas(p) || null,
          situacao:
            p.status === 'AGUARDANDO_ASSINATURA'
              ? `Faltam ${p.signatarios_faltantes.length || ''} assinatura(s)`.replace('  ', ' ')
              : p.status === 'ASSINADO'
                ? p.data_documento
                  ? 'Assinada'
                  : 'Sem data'
                : p.anexada
                  ? p.data_documento
                    ? 'Anexada (assinada fora)'
                    : 'Sem data'
                  : p.exige_assinatura
                    ? 'Não assinada'
                    : 'Feita no sistema',
          ok: p.status === 'ASSINADO' ? !!p.data_documento : p.anexada ? !!p.data_documento : !p.exige_assinatura,
          data_documento: p.data_documento,
        })),
      publicar: {
        pode: interna && impedem === 0,
        pendencias: impedem,
        rotulo: impedem ? `Publicar — resolva ${impedem} ${impedem === 1 ? 'bloqueio' : 'bloqueios'}` : 'Publicar',
      },
      autos: ctx.pecas
        .filter((p) => !p.nao_se_aplica)
        .map((p) => ({
          documento_id: p.documento_id,
          tipo: p.tipo,
          titulo: p.titulo,
          versao: p.versao,
          status: p.status,
          anexada: p.anexada,
          folha_inicial: p.folha_inicial,
          folha_final: p.folha_final,
          tem_arquivo: arquivos.get(p.documento_id) ?? false,
          sem_texto: p.sem_texto,
          secoes: p.anexada ? {} : p.secoes,
        })),
      justificativas: await this.justificativasParaAutos(licitacaoId),
    };
  }

  /** A revisão gravada está em dia? Senão revisa agora (fase interna) — base das contagens das telas. */
  private async revisaoEmDia(licitacaoId: string, fase: string) {
    let revisao = await this.revisaoRepo.findOne({ where: { licitacao_id: licitacaoId } });
    if (ehFaseInterna(fase) && this.ativo() && (!revisao || (await this.revisaoDesatualizada(licitacaoId, revisao.revisado_em)))) {
      await this.revisar(licitacaoId, { origem: revisao ? 'AUTOMATICA' : 'TELA' });
      revisao = await this.revisaoRepo.findOne({ where: { licitacao_id: licitacaoId } });
    }
    return revisao;
  }

  /**
   * Resumo para o painel do processo e o checklist de pré-publicação — a
   * FONTE ÚNICA das contagens (homologação E6): os achados do motor depois de
   * uma revisão em dia; bloqueios de todos os portões, por portão.
   */
  async resumo(licitacaoId: string) {
    const [lic] = await this.ds.query(`SELECT fase::text AS fase FROM licitacoes WHERE id::text = $1`, [licitacaoId]);
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    const revisao = await this.revisaoEmDia(licitacaoId, lic.fase);
    const abertos = await this.repo.find({ where: { licitacao_id: licitacaoId, status: 'ABERTO' }, order: { created_at: 'ASC' } });
    const contagem = contagemDaConformidade(abertos);
    return {
      aplicavel: ehFaseInterna(lic.fase),
      revisado_em: revisao?.revisado_em ?? null,
      bloqueios: contagem.bloqueios,
      atencoes: contagem.atencoes,
      bloqueios_por_portao: contagem.bloqueios_por_portao,
      impedem_publicar: contagem.impedem_publicar,
      achados: abertos
        .sort((a, b) => (a.severidade === b.severidade ? 0 : a.severidade === 'BLOQUEIO' ? -1 : 1))
        .slice(0, 6)
        .map((a) => ({ id: a.id, regra: a.regra, titulo: a.titulo, severidade: a.severidade, exige_justificativa: a.exige_justificativa })),
      destino: `/orgao/processos/${licitacaoId}/fase-interna/conformidade`,
    };
  }
}
