import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import type { Ator } from '../auth/acesso/ator';
import { ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { calendarioDoOrgao, inicioDoDia, inicioDoDiaSeguinte, DIA_MS } from '../common/prazos/dias-uteis';
import { TarefasService } from '../fase-interna/tarefas/tarefas.service';
import { ComQuemEsta, TramitacaoService } from '../fase-interna/tramitacao.service';
import { ROTULO_PAPEL, etapaAtual } from '../fase-interna/tarefas/etapas-fase-interna';
import type { ConfigFaseInternaEfetiva } from '../fase-interna/tarefas/configuracao-fase-interna';
import { ConfiguracaoPainelTv, PainelTvLink } from './painel-tv-link.entity';
import {
  COLUNAS_PAINEL,
  CacheCurto,
  ColunaPainel,
  CorPrazo,
  JANELAS_CONTRATOS,
  JANELA_CONTRATOS_PADRAO,
  LimitadorPorChave,
  SITUACOES_NO_PAINEL,
  TEXTO_PRORROGACAO,
  chavesProibidasEm,
  colunaDoProcesso,
  comQuemDoCartao,
  ComQuemCartao,
  contarPorFaixa,
  corDoPrazo,
  diasNaEtapa,
  ehFaseInternaPainel,
  faixaDosDiasRestantes,
  hojeEmBrasilia,
  indicacaoProrrogacao,
  janelaValida,
  modalidadeCurta,
  numeroDoProcesso,
  prazoEfetivoDaEtapa,
  processoAtrasado,
  removerChavesProibidas,
  resumirTexto,
  rotuloDaEtapa,
  selecionarContratosVencendo,
  somarDias,
} from './painel-tv-regras';

/** Fases que aparecem no painel (as do processo; os valores legados do enum ficam fora). */
const FASES_DO_PAINEL = [
  'PLANEJAMENTO',
  'TERMO_REFERENCIA',
  'PESQUISA_PRECOS',
  'ANALISE_JURIDICA',
  'APROVACAO_INTERNA',
  'AGUARDANDO_DIVULGACAO',
  'PUBLICADO',
  'IMPUGNACAO',
  'ACOLHIMENTO_PROPOSTAS',
  'ANALISE_PROPOSTAS',
  'EM_DISPUTA',
  'JULGAMENTO',
  'HABILITACAO',
  'RECURSO',
  'ADJUDICACAO',
  'HOMOLOGACAO',
];

const MAX_PROCESSOS = 500;
const MAX_CARTOES_POR_COLUNA = 300;
const MAX_LINKS_ATIVOS = 20;
const TOKEN_VALIDO = /^[0-9a-f]{64}$/;

export interface CartaoProcesso {
  chave: string;
  numero: string;
  objeto: string;
  modalidade: string;
  etapa: string;
  /** F3: pela tramitação (posse), com desde/prazo/atraso; sem ela, pela tarefa aberta. */
  com_quem: ComQuemCartao | null;
  dias_na_etapa: number | null;
  prazo: string | null;
  cor_prazo: CorPrazo | null;
  atrasado: boolean;
  bloqueios: number;
  suspenso: boolean;
  evento: { tipo: 'SESSAO' | 'FIM_PROPOSTAS'; data: string } | null;
}

export interface CartaoContrato {
  chave: string;
  numero: string;
  contratado: string;
  objeto: string;
  fim_vigencia: string;
  dias_restantes: number;
  faixa: 'VERMELHO' | 'AMARELO' | 'NEUTRO';
  responsavel: { papel: 'Gestor' | 'Fiscal'; nome: string } | null;
  prorrogacao: 'CONTINUO_ART107' | 'NAO_PRORROGAVEL' | null;
  prorrogacao_rotulo: string | null;
  aditivo_prazo_em_andamento: boolean;
  valor: number | null;
}

export interface PainelTvDados {
  orgao: { nome: string; logo_url: string | null };
  gerado_em: string;
  fuso: string;
  janela_contratos_dias: number;
  numeros: {
    em_andamento: number;
    atrasados: number;
    publicados_7_dias: number;
    eventos_hoje: number;
    eventos_7_dias: number;
    contratos_30: number;
    contratos_60: number;
    contratos_90: number;
  };
  colunas: Array<{ chave: ColunaPainel; titulo: string; total: number; processos: CartaoProcesso[] }>;
  contratos: CartaoContrato[];
  rodape: {
    proximos_eventos: Array<{ numero: string; modalidade: string; objeto: string; tipo: 'SESSAO' | 'FIM_PROPOSTAS'; data: string }>;
    publicacoes_24h: Array<{ numero: string; modalidade: string; objeto: string; data: string }>;
    contratos_7_dias: Array<{ numero: string; contratado: string; fim_vigencia: string; dias_restantes: number }>;
  };
}

const ORDEM_COR: Record<string, number> = { VERMELHO: 0, AMARELO: 1, VERDE: 2 };

/**
 * PAINEL PARA TV (uso interno do setor de licitação).
 *
 *  - Gestão dos links (só o administrador do órgão): gerar, nomear, revogar;
 *    janela dos contratos vencendo (30/60/90/120).
 *  - Leitura pela TV: `GET /painel-tv/:token` — o token resolve UM órgão
 *    (nenhum parâmetro troca de órgão), só leitura, limite por token, cache
 *    curto por órgão. Token inválido ou revogado: 404 igual.
 *
 * O JSON é montado por LISTA BRANCA (só os campos dos cartões) e passa pela
 * segunda barreira `removerChavesProibidas` — nunca sai valor de processo
 * (orçamento sigiloso, art. 24), dado de proposta/lance/licitante, texto de
 * parecer/diligência/achado, CPF, e-mail ou telefone.
 */
@Injectable()
export class PainelTvService {
  private readonly logger = new Logger(PainelTvService.name);
  private readonly cache = new CacheCurto<PainelTvDados>(45_000);
  private readonly emCurso = new Map<string, Promise<PainelTvDados>>();
  private readonly limitador = new LimitadorPorChave(
    Math.max(1, Number(process.env.PAINEL_TV_LIMITE_POR_MINUTO) || 30),
    60_000,
  );

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(PainelTvLink) private readonly links: Repository<PainelTvLink>,
    @InjectRepository(ConfiguracaoPainelTv) private readonly configs: Repository<ConfiguracaoPainelTv>,
    private readonly tarefas: TarefasService,
    private readonly tramitacao: TramitacaoService,
  ) {}

  /** Cache de 30 a 60 s (PAINEL_TV_CACHE_MS; 0 desliga — usado nos testes). */
  private ttlCache(): number {
    const v = process.env.PAINEL_TV_CACHE_MS;
    if (v === undefined || v === '') return 45_000;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.min(n, 60_000) : 45_000;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  // ==========================================================================
  // GESTÃO (administrador do órgão)
  // ==========================================================================

  /**
   * Órgão que o ator administra: conta do órgão; usuário com papel ADMIN
   * (conferido no banco — ativo e do mesmo órgão); admin da plataforma com
   * `?orgao_id=`. Os demais: 403.
   */
  async orgaoAdministrado(ator: Ator, informado?: string): Promise<string> {
    if (ator.admin) {
      if (!informado || !ehUuid(informado)) throw new BadRequestException('Informe orgao_id');
      return informado;
    }
    if (ator.tipo === 'ORGAO' && ator.orgaoId) return ator.orgaoId;
    if (ator.tipo === 'USUARIO' && ator.orgaoId && ator.usuarioId && ehUuid(ator.usuarioId)) {
      const [u] = await this.ds.query(
        `SELECT role::text AS role FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2 AND ativo = true`,
        [ator.usuarioId, ator.orgaoId],
      );
      if (u?.role === 'ADMIN') return ator.orgaoId;
    }
    throw new ForbiddenException('Só o administrador do órgão gerencia o painel para TV');
  }

  async autor(ator: Ator): Promise<{ id: string | null; nome: string | null }> {
    if (ator.tipo === 'USUARIO' && ator.usuarioId && ehUuid(ator.usuarioId)) {
      const [u] = await this.ds.query(`SELECT nome FROM usuarios WHERE id::text = $1`, [ator.usuarioId]);
      return { id: ator.usuarioId, nome: u?.nome ?? null };
    }
    if (ator.tipo === 'ORGAO') return { id: ator.orgaoId, nome: 'Conta do órgão' };
    return { id: ator.id, nome: 'Administrador da plataforma' };
  }

  async configuracao(orgaoId: string): Promise<{ janela_contratos_dias: number }> {
    const linha = await this.configs.findOne({ where: { orgao_id: orgaoId } });
    const janela = linha && janelaValida(linha.janela_contratos_dias) ? Number(linha.janela_contratos_dias) : JANELA_CONTRATOS_PADRAO;
    return { janela_contratos_dias: janela };
  }

  async gestao(orgaoId: string) {
    const lista = await this.links.find({ where: { orgao_id: orgaoId }, order: { created_at: 'DESC' } });
    return {
      ...(await this.configuracao(orgaoId)),
      janelas_permitidas: [...JANELAS_CONTRATOS],
      links: lista.map((l) => ({
        id: l.id,
        nome: l.nome,
        ativo: !l.revogado_em,
        criado_por_nome: l.criado_por_nome,
        created_at: l.created_at,
        ultimo_acesso: l.ultimo_acesso,
        revogado_em: l.revogado_em,
        revogado_por_nome: l.revogado_por_nome,
      })),
    };
  }

  private nomeValido(nome: unknown): string {
    const n = String(nome ?? '').replace(/\s+/g, ' ').trim();
    if (n.length < 3) throw new BadRequestException('Dê um nome ao link (ex.: "TV da sala de licitações")');
    return n.slice(0, 80);
  }

  /** Gera um link novo. O token em claro aparece SÓ nesta resposta (no banco fica o hash). */
  async gerarLink(orgaoId: string, nome: unknown, autor: { id: string | null; nome: string | null }) {
    const rotulo = this.nomeValido(nome);
    const ativos = await this.links.count({ where: { orgao_id: orgaoId, revogado_em: IsNull() } });
    if (ativos >= MAX_LINKS_ATIVOS) throw new BadRequestException(`Limite de ${MAX_LINKS_ATIVOS} links ativos — revogue um que não é mais usado`);
    const token = randomBytes(32).toString('hex');
    const salvo = await this.links.save(
      this.links.create({
        orgao_id: orgaoId,
        nome: rotulo,
        token_hash: this.hash(token),
        criado_por_id: autor.id,
        criado_por_nome: autor.nome,
      }),
    );
    return { id: salvo.id, nome: salvo.nome, token, caminho: `/painel-tv/${token}`, created_at: salvo.created_at };
  }

  private async linkDoOrgao(orgaoId: string, id: string): Promise<PainelTvLink> {
    const link = ehUuid(id) ? await this.links.findOne({ where: { id, orgao_id: orgaoId } }) : null;
    if (!link) throw new NotFoundException('Link não encontrado');
    return link;
  }

  async renomearLink(orgaoId: string, id: string, nome: unknown) {
    const link = await this.linkDoOrgao(orgaoId, id);
    link.nome = this.nomeValido(nome);
    await this.links.save(link);
    return { id: link.id, nome: link.nome };
  }

  async revogarLink(orgaoId: string, id: string, autor: { nome: string | null }) {
    const link = await this.linkDoOrgao(orgaoId, id);
    if (!link.revogado_em) {
      link.revogado_em = new Date();
      link.revogado_por_nome = autor.nome;
      await this.links.save(link);
    }
    return { id: link.id, revogado_em: link.revogado_em };
  }

  async salvarConfiguracao(orgaoId: string, corpo: { janela_contratos_dias?: unknown }, autor: { nome: string | null }) {
    const janela = Number(corpo?.janela_contratos_dias);
    if (!janelaValida(janela)) throw new BadRequestException(`Prazo dos contratos vencendo deve ser ${JANELAS_CONTRATOS.join(', ')} dias`);
    await this.configs.upsert(
      { orgao_id: orgaoId, janela_contratos_dias: janela, atualizado_por_nome: autor.nome, atualizado_em: new Date() },
      ['orgao_id'],
    );
    this.cache.descartar(orgaoId);
    return this.configuracao(orgaoId);
  }

  // ==========================================================================
  // LEITURA PELA TV (token)
  // ==========================================================================

  /**
   * Dados do painel pelo token da TV. Formato inválido, inexistente e
   * revogado respondem o MESMO 404. Limite de requisições por token (429).
   */
  async dadosPorToken(token: string): Promise<PainelTvDados> {
    const valor = String(token ?? '').trim().toLowerCase();
    const hash = this.hash(valor);
    if (!this.limitador.permitir(hash)) {
      throw new HttpException('Muitas requisições para este painel — aguarde um minuto', HttpStatus.TOO_MANY_REQUESTS);
    }
    const link = TOKEN_VALIDO.test(valor)
      ? await this.links.findOne({ where: { token_hash: hash, revogado_em: IsNull() }, select: ['id', 'orgao_id'] })
      : null;
    if (!link) throw new NotFoundException('Painel não encontrado');
    this.ds
      .query(`UPDATE painel_tv_links SET ultimo_acesso = now() WHERE id = $1`, [link.id])
      .catch(() => undefined); // só estatística
    return this.dados(link.orgao_id);
  }

  /** Dados do órgão (cache curto; montagens simultâneas do mesmo órgão viram uma). */
  async dados(orgaoId: string): Promise<PainelTvDados> {
    const ttl = this.ttlCache();
    const guardado = ttl > 0 ? this.cache.obter(orgaoId) : undefined;
    if (guardado) return guardado;
    const andamento = this.emCurso.get(orgaoId);
    if (andamento) return andamento;
    const p = this.montar(orgaoId)
      .then((d) => {
        this.cache.guardar(orgaoId, d, Date.now(), ttl);
        return d;
      })
      .finally(() => this.emCurso.delete(orgaoId));
    this.emCurso.set(orgaoId, p);
    return p;
  }

  // ==========================================================================
  // MONTAGEM
  // ==========================================================================

  private async montar(orgaoId: string): Promise<PainelTvDados> {
    const agora = new Date();
    const cal = calendarioDoOrgao(orgaoId);
    const [orgao] = await this.ds.query(`SELECT nome, logo_url FROM orgaos WHERE id::text = $1`, [orgaoId]);
    const { janela_contratos_dias } = await this.configuracao(orgaoId);

    const [processos, publicados, contratos] = await Promise.all([
      this.montarProcessos(orgaoId, agora, cal),
      this.montarPublicados(orgaoId, agora),
      this.montarContratos(orgaoId, agora, janela_contratos_dias),
    ]);

    const dados: PainelTvDados = {
      orgao: { nome: orgao?.nome ?? 'Órgão', logo_url: orgao?.logo_url || null },
      gerado_em: agora.toISOString(),
      fuso: 'America/Bahia',
      janela_contratos_dias,
      numeros: {
        em_andamento: processos.total,
        atrasados: processos.atrasados,
        publicados_7_dias: publicados.total_7_dias,
        eventos_hoje: processos.eventos_hoje,
        eventos_7_dias: processos.eventos_7_dias,
        contratos_30: contratos.faixas.ate_30,
        contratos_60: contratos.faixas.ate_60,
        contratos_90: contratos.faixas.ate_90,
      },
      colunas: processos.colunas,
      contratos: contratos.cartoes,
      rodape: {
        proximos_eventos: processos.proximos_eventos,
        publicacoes_24h: publicados.ultimas_24h,
        contratos_7_dias: contratos.cartoes
          .filter((c) => c.dias_restantes <= 7)
          .map((c) => ({ numero: c.numero, contratado: c.contratado, fim_vigencia: c.fim_vigencia, dias_restantes: c.dias_restantes })),
      },
    };

    // Segunda barreira: nenhuma chave sigilosa sai, mesmo que um campo novo escape da lista branca
    const vazadas = chavesProibidasEm(dados);
    if (vazadas.length) this.logger.error(`Painel para TV: chaves proibidas removidas do JSON: ${vazadas.join(', ')}`);
    return vazadas.length ? removerChavesProibidas(dados) : dados;
  }

  private async montarProcessos(orgaoId: string, agora: Date, cal: ReturnType<typeof calendarioDoOrgao>) {
    const linhas: any[] = await this.ds.query(
      `SELECT l.id::text AS id, l.numero_processo, l.numero_edital, l.modalidade::text AS modalidade, l.objeto,
              l.fase::text AS fase, l.situacao::text AS situacao, l.data_homologacao,
              l.data_abertura_sessao, l.data_fim_acolhimento, l.created_at,
              COALESCE(pu.nome, l.pregoeiro_nome) AS agente_nome
         FROM licitacoes l
         LEFT JOIN usuarios pu ON pu.id::text = l.pregoeiro_id::text AND pu.orgao_id::text = l.orgao_id::text
        WHERE l.orgao_id::text = $1 AND l.fase::text = ANY($2::text[]) AND l.situacao::text = ANY($3::text[])
        ORDER BY l.created_at
        LIMIT ${MAX_PROCESSOS}`,
      [orgaoId, FASES_DO_PAINEL, SITUACOES_NO_PAINEL],
    );
    const ids = linhas.map((l) => l.id);
    const internos = linhas.filter((l) => ehFaseInternaPainel(l.fase));
    const externos = linhas.filter((l) => !ehFaseInternaPainel(l.fase));

    const cfgFaseInterna = await this.tarefas.configuracao(orgaoId);
    const etapas = await this.etapasAtuais(orgaoId, internos, cfgFaseInterna);
    // F3: "com quem está" pela tramitação (posse vigente), numa consulta só
    const posses: Map<string, ComQuemEsta> = ids.length
      ? await this.tramitacao.comQuemEstaEmLote(orgaoId, ids, agora).catch((e: any) => {
          this.logger.warn(`Painel para TV: tramitação não lida: ${e?.message ?? e}`);
          return new Map<string, ComQuemEsta>();
        })
      : new Map<string, ComQuemEsta>();

    const [tarefas, achados, entradasInternas, entradasExternas] = ids.length
      ? await Promise.all([
          this.ds.query(
            `SELECT t.licitacao_id::text AS licitacao_id, t.etapa, t.passo, t.origem, t.prazo, t.created_at,
                    t.responsavel_usuario_id::text AS responsavel_usuario_id, u.nome AS responsavel_nome,
                    t.responsavel_papel, s.nome AS setor_nome
               FROM tarefas t
               LEFT JOIN usuarios u ON u.id = t.responsavel_usuario_id
               LEFT JOIN setores s ON s.id = t.responsavel_setor_id
              WHERE t.orgao_id::text = $1 AND t.status = 'ABERTA' AND t.licitacao_id::text = ANY($2::text[])
              ORDER BY t.prazo ASC NULLS LAST, t.created_at ASC`,
            [orgaoId, ids],
          ) as Promise<any[]>,
          this.ds
            .query(
              `SELECT licitacao_id::text AS licitacao_id, COUNT(*)::int AS n FROM achados_conformidade
                WHERE orgao_id::text = $1 AND status = 'ABERTO' AND severidade = 'BLOQUEIO' AND licitacao_id::text = ANY($2::text[])
                GROUP BY licitacao_id`,
              [orgaoId, internos.map((l) => l.id)],
            )
            .catch(() => []) as Promise<any[]>,
          internos.length
            ? (this.ds.query(
                `SELECT DISTINCT ON (licitacao_id, dados_depois->>'etapa')
                        licitacao_id::text AS licitacao_id, dados_depois->>'etapa' AS etapa, created_at
                   FROM logs_fase_interna
                  WHERE licitacao_id::text = ANY($1::text[]) AND acao::text = 'ETAPA_ALTERADA' AND dados_depois->>'situacao' = 'ABERTA'
                  ORDER BY licitacao_id, dados_depois->>'etapa', created_at DESC`,
                [internos.map((l) => l.id)],
              ) as Promise<any[]>)
            : Promise.resolve([] as any[]),
          externos.length
            ? (this.ds.query(
                `SELECT DISTINCT ON (t.licitacao_id) t.licitacao_id::text AS licitacao_id, t.created_at
                   FROM licitacao_transicoes t
                   JOIN licitacoes l ON l.id = t.licitacao_id
                  WHERE t.licitacao_id::text = ANY($1::text[]) AND t.fase_para = l.fase::text
                    AND t.fase_de IS DISTINCT FROM t.fase_para
                  ORDER BY t.licitacao_id, t.created_at DESC`,
                [externos.map((l) => l.id)],
              ) as Promise<any[]>)
            : Promise.resolve([] as any[]),
        ])
      : [[], [], [], []];

    const tarefasPorId = new Map<string, any[]>();
    for (const t of tarefas) tarefasPorId.set(t.licitacao_id, [...(tarefasPorId.get(t.licitacao_id) ?? []), t]);
    const achadosPorId = new Map<string, number>(achados.map((a) => [a.licitacao_id, Number(a.n) || 0]));
    const entradaInterna = new Map<string, Date>(entradasInternas.map((e) => [`${e.licitacao_id}|${e.etapa}`, e.created_at]));
    const entradaExterna = new Map<string, Date>(entradasExternas.map((e) => [e.licitacao_id, e.created_at]));

    const inicioHoje = inicioDoDia(agora);
    const inicioAmanha = inicioDoDiaSeguinte(agora);
    const fim7 = new Date(inicioAmanha.getTime() + 7 * DIA_MS);

    const porColuna = new Map<ColunaPainel, Array<CartaoProcesso & { _dias: number }>>();
    const eventosFuturos: PainelTvDados['rodape']['proximos_eventos'] = [];
    let atrasados = 0;
    let total = 0;
    let eventosHoje = 0;
    let eventos7 = 0;

    for (const l of linhas) {
      const interno = ehFaseInternaPainel(l.fase);
      const etapa = interno ? etapas.get(l.id) : undefined;
      const coluna = colunaDoProcesso({ fase: l.fase, situacao: l.situacao, data_homologacao: l.data_homologacao, etapa_atual: etapa?.etapa ?? null });
      if (!coluna) continue;
      total++;

      const abertas = tarefasPorId.get(l.id) ?? [];
      const daEtapa = etapa ? abertas.filter((t) => t.origem === 'ETAPA' && t.etapa === etapa.etapa) : [];
      const escolhida = daEtapa[0] ?? abertas[0] ?? null;

      const entrada = interno
        ? (etapa ? entradaInterna.get(`${l.id}|${etapa.etapa}`) ?? daEtapa[0]?.created_at : null) ?? l.created_at
        : coluna === 'CONTRATO'
          ? l.data_homologacao ?? entradaExterna.get(l.id) ?? null
          : entradaExterna.get(l.id) ?? null;

      const prazoEtapa = interno
        ? prazoEfetivoDaEtapa(
            {
              prazo_tarefa: daEtapa.find((t) => !!t.prazo)?.prazo ?? null,
              entrada_etapa: entrada,
              prazo_dias_uteis: etapa?.passo ? cfgFaseInterna.prazos[etapa.passo as keyof typeof cfgFaseInterna.prazos] ?? null : null,
            },
            cal,
          )
        : null;
      const atrasado = l.situacao !== 'SUSPENSA' && processoAtrasado({ prazos_tarefas_abertas: abertas.map((t) => t.prazo), prazo_etapa: prazoEtapa }, agora);
      if (atrasado) atrasados++;
      const cor: CorPrazo | null = atrasado ? 'VERMELHO' : corDoPrazo(prazoEtapa, agora, cal);

      // Sessão / fim do prazo de propostas (a mesma data vale como sessão)
      const eventos: Array<{ tipo: 'SESSAO' | 'FIM_PROPOSTAS'; data: Date }> = [];
      if (l.data_abertura_sessao) eventos.push({ tipo: 'SESSAO', data: new Date(l.data_abertura_sessao) });
      if (l.data_fim_acolhimento) {
        const d = new Date(l.data_fim_acolhimento);
        if (!eventos.some((e) => e.data.getTime() === d.getTime())) eventos.push({ tipo: 'FIM_PROPOSTAS', data: d });
      }
      eventos.sort((a, b) => a.data.getTime() - b.data.getTime());
      if (l.situacao === 'ATIVA') {
        for (const e of eventos) {
          const t = e.data.getTime();
          if (t >= inicioHoje.getTime() && t < inicioAmanha.getTime()) eventosHoje++;
          else if (t >= inicioAmanha.getTime() && t < fim7.getTime()) eventos7++;
          if (t >= agora.getTime()) {
            eventosFuturos.push({
              numero: numeroDoProcesso(l),
              modalidade: modalidadeCurta(l.modalidade),
              objeto: resumirTexto(l.objeto, 50),
              tipo: e.tipo,
              data: e.data.toISOString(),
            });
          }
        }
      }
      const proximo = eventos.find((e) => e.data.getTime() >= agora.getTime());
      const eventoDoCartao =
        !interno && (proximo || ['PROPOSTAS', 'PUBLICACAO', 'JULGAMENTO'].includes(coluna))
          ? proximo ?? eventos[eventos.length - 1] ?? null
          : null;

      const dias = diasNaEtapa(entrada, agora);
      const cartao: CartaoProcesso & { _dias: number } = {
        chave: String(l.numero_processo ?? l.id),
        numero: numeroDoProcesso(l),
        objeto: resumirTexto(l.objeto, 70),
        modalidade: modalidadeCurta(l.modalidade),
        etapa: rotuloDaEtapa({ fase: l.fase, situacao: l.situacao, data_homologacao: l.data_homologacao, etapa_atual: etapa?.etapa ?? null }),
        com_quem: this.comQuem(posses.get(l.id) ?? null, escolhida, l.agente_nome, agora),
        dias_na_etapa: dias,
        prazo: prazoEtapa ? prazoEtapa.toISOString() : null,
        cor_prazo: cor,
        atrasado,
        bloqueios: interno ? achadosPorId.get(l.id) ?? 0 : 0,
        suspenso: l.situacao === 'SUSPENSA',
        evento: eventoDoCartao ? { tipo: eventoDoCartao.tipo, data: eventoDoCartao.data.toISOString() } : null,
        _dias: dias ?? 0,
      };
      porColuna.set(coluna, [...(porColuna.get(coluna) ?? []), cartao]);
    }

    const colunas = COLUNAS_PAINEL.map(({ chave, titulo }) => {
      const lista = (porColuna.get(chave) ?? []).sort(
        (a, b) =>
          Number(b.atrasado) - Number(a.atrasado) ||
          (ORDEM_COR[a.cor_prazo ?? ''] ?? 3) - (ORDEM_COR[b.cor_prazo ?? ''] ?? 3) ||
          b._dias - a._dias,
      );
      return {
        chave,
        titulo,
        total: lista.length,
        processos: lista.slice(0, MAX_CARTOES_POR_COLUNA).map(({ _dias, ...c }) => c),
      };
    });

    eventosFuturos.sort((a, b) => a.data.localeCompare(b.data));
    return {
      colunas,
      total,
      atrasados,
      eventos_hoje: eventosHoje,
      eventos_7_dias: eventos7,
      proximos_eventos: eventosFuturos.slice(0, 12),
    };
  }

  /**
   * Etapa atual de cada processo da fase interna: `etapaAtual(etapasDaFaseInterna(...))`
   * (TarefasService.etapasCalculadas — a mesma regra da tela do processo e das
   * tarefas). Passo = o primeiro da etapa ainda não concluído (prazo configurado).
   */
  private async etapasAtuais(orgaoId: string, internos: any[], cfg: ConfigFaseInternaEfetiva) {
    const saida = new Map<string, { etapa: string; passo: string | null }>();
    const fila = [...internos];
    const trabalhar = async () => {
      for (let l = fila.shift(); l; l = fila.shift()) {
        try {
          const etapas = await this.tarefas.etapasCalculadas(l.id, { orgao_id: orgaoId, fase: l.fase, situacao: l.situacao }, cfg);
          const atual = etapaAtual(etapas);
          if (atual) {
            const passo = atual.passos.find((p) => p.situacao === 'EM_ANDAMENTO' || p.situacao === 'DISPONIVEL') ?? atual.passos.find((p) => p.situacao !== 'CONCLUIDO');
            saida.set(l.id, { etapa: atual.etapa, passo: passo?.passo ?? null });
          }
        } catch (e: any) {
          this.logger.warn(`Painel para TV: etapas do processo ${l.id} não calculadas: ${e?.message ?? e}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, fila.length) }, trabalhar));
    return saida;
  }

  /**
   * "Com quem está": a posse da tramitação (setor/pessoa, desde, prazo e
   * atraso); sem tramitação vigente, o responsável da tarefa aberta (pessoa,
   * ou papel/setor); sem tarefa, o agente do processo.
   */
  private comQuem(posse: ComQuemEsta | null, tarefa: any | null, agente: string | null, agora: Date): CartaoProcesso['com_quem'] {
    const vigente = posse && (posse.status === 'PENDENTE' || posse.status === 'RECEBIDA') ? posse : null;
    return comQuemDoCartao(
      vigente,
      tarefa
        ? {
            responsavel_usuario_id: tarefa.responsavel_usuario_id,
            responsavel_nome: tarefa.responsavel_nome,
            rotulo_papel: tarefa.responsavel_papel ? ROTULO_PAPEL[tarefa.responsavel_papel as keyof typeof ROTULO_PAPEL] ?? tarefa.responsavel_papel : null,
            setor_nome: tarefa.setor_nome,
            created_at: tarefa.created_at,
            prazo: tarefa.prazo,
          }
        : null,
      agente,
      agora,
    );
  }

  private async montarPublicados(orgaoId: string, agora: Date) {
    const seteDias = new Date(agora.getTime() - 7 * DIA_MS);
    const umDia = new Date(agora.getTime() - DIA_MS);
    const [c] = await this.ds.query(
      `SELECT COUNT(*)::int AS n FROM licitacoes WHERE orgao_id::text = $1 AND data_divulgacao_oficial >= $2 AND data_divulgacao_oficial <= $3`,
      [orgaoId, seteDias, agora],
    );
    const ultimas: any[] = await this.ds.query(
      `SELECT numero_processo, numero_edital, modalidade::text AS modalidade, objeto, data_divulgacao_oficial
         FROM licitacoes
        WHERE orgao_id::text = $1 AND data_divulgacao_oficial >= $2 AND data_divulgacao_oficial <= $3
          AND COALESCE(meio_divulgacao_oficial, 'PNCP') <> 'DIARIO_OFICIAL'
        ORDER BY data_divulgacao_oficial DESC LIMIT 12`,
      [orgaoId, umDia, agora],
    );
    return {
      total_7_dias: Number(c?.n) || 0,
      ultimas_24h: ultimas.map((l) => ({
        numero: numeroDoProcesso(l),
        modalidade: modalidadeCurta(l.modalidade),
        objeto: resumirTexto(l.objeto, 50),
        data: new Date(l.data_divulgacao_oficial).toISOString(),
      })),
    };
  }

  private async montarContratos(orgaoId: string, agora: Date, janela: number) {
    const hoje = hojeEmBrasilia(agora);
    const alcance = Math.max(janela, 90); // os números do topo contam até 90
    const linhas: any[] = await this.ds.query(
      `SELECT c.id::text AS id, c.numero_contrato, c.fornecedor_razao_social, c.objeto, c.status::text AS status,
              c.modalidade_execucao::text AS modalidade_execucao, c.valor_global, c.valor_inicial,
              c.gestor_nome, c.fiscal_nome,
              to_char(c.data_vigencia_inicio, 'YYYY-MM-DD') AS data_vigencia_inicio,
              to_char(c.data_vigencia_fim, 'YYYY-MM-DD') AS data_vigencia_fim
         FROM contratos c
        WHERE c.orgao_id::text = $1 AND c.status::text = 'VIGENTE'
          AND c.data_vigencia_fim >= $2::date AND c.data_vigencia_fim <= $3::date
        ORDER BY c.data_vigencia_fim ASC
        LIMIT 500`,
      [orgaoId, hoje, somarDias(hoje, alcance)],
    );
    const todos = selecionarContratosVencendo(linhas, hoje, alcance);
    const faixas = contarPorFaixa(todos.map((c) => c.dias_restantes));
    const naJanela = todos.filter((c) => c.dias_restantes <= janela);

    const comAditivo = new Set<string>();
    if (naJanela.length) {
      const r: any[] = await this.ds
        .query(
          `SELECT DISTINCT contrato_id::text AS contrato_id FROM termos_aditivos
            WHERE contrato_id::text = ANY($1::text[]) AND status::text = 'VIGENTE'
              AND (tipo::text IN ('ADITIVO_PRAZO', 'ADITIVO_PRAZO_VALOR') OR renovacao_ciclo = true)
              AND data_vigencia_inicio > $2::date`,
          [naJanela.map((c) => c.id), hoje],
        )
        .catch(() => []);
      for (const x of r) comAditivo.add(x.contrato_id);
    }

    const cartoes: CartaoContrato[] = naJanela.map((c, i) => {
      const prorrogacao = indicacaoProrrogacao(c);
      const valor = Number(c.valor_global) || Number(c.valor_inicial) || null;
      return {
        chave: `${c.numero_contrato ?? 'contrato'}#${i}`,
        numero: c.numero_contrato ?? '—',
        contratado: c.fornecedor_razao_social ?? '—',
        objeto: resumirTexto(c.objeto, 70),
        fim_vigencia: c.data_vigencia_fim,
        dias_restantes: c.dias_restantes,
        faixa: faixaDosDiasRestantes(c.dias_restantes),
        responsavel: c.gestor_nome ? { papel: 'Gestor', nome: c.gestor_nome } : c.fiscal_nome ? { papel: 'Fiscal', nome: c.fiscal_nome } : null,
        prorrogacao,
        prorrogacao_rotulo: prorrogacao ? TEXTO_PRORROGACAO[prorrogacao] : null,
        aditivo_prazo_em_andamento: comAditivo.has(c.id),
        valor,
      };
    });
    return { cartoes, faixas };
  }
}
