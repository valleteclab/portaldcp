import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { calendarioDoOrgao, diasUteisEntre } from '../../common/prazos/dias-uteis';
import type { Ator } from '../../auth/acesso/ator';
import { ehUuid } from '../../auth/acesso/acesso-licitacao.service';
import { NotificacoesService } from '../../notificacoes/notificacoes.service';
import { TipoNotificacao } from '../../notificacoes/entities/notificacao.entity';
import { FASES_INTERNAS } from '../../licitacoes/transicoes/fases';
import { AcaoLogFaseInterna } from '../entities/log-fase-interna.entity';
import { AuditLogService, ContextoUsuario } from '../audit-log.service';
import { FaseInternaService } from '../fase-interna.service';
import { ConfiguracaoFaseInterna } from './configuracao-fase-interna.entity';
import { ConfigFaseInternaEfetiva, configEfetiva, papelValido, validarConfiguracao, validarSignatariosAutorizacao } from './configuracao-fase-interna';
import { ContextoFluxoProcesso, CondutorDoProcesso, ModeloFluxoService } from '../fluxo/modelo-fluxo.service';
import { PendenciaDfdService } from '../fluxo/pendencia-dfd.service';
import { ModeloFluxo, niveisDoGrafo } from '../fluxo/modelo-fluxo';
import type { DadosCondicao } from '../fluxo/motor-grafo';
import {
  BloqueiosDePortao,
  DEFINICAO_PASSO,
  EstadoFluxoParaEtapas,
  EtapaCalculada,
  PapelFaseInterna,
  PassoCalculado,
  PassoFaseInterna,
  ROTULO_PAPEL,
  TITULO_ETAPA,
  etapaAtual,
  etapasDaFaseInterna,
  passosDasEtapas,
} from './etapas-fase-interna';
import { Tarefa } from './tarefa.entity';
import { definirAgendadorDeTarefas } from './aviso-tarefas';
import { DestinoEtapa, Posse, destinoDaEtapa, destinosPossiveisDoPapel, responsavelNaPosse } from '../fluxo/proximo-destino';
import {
  JANELA_AVISO_DUPLICADO_MIN,
  Responsavel,
  chaveDoPasso,
  destinatariosSemAvisoRecente,
  destinoDaTarefa,
  mesmoResponsavel,
  passosCumpridosSemTarefa,
  planejarSincronizacao,
  prazoDaTarefa,
  quemCumpriu,
  responsavelDoPasso,
  tarefaAtrasada,
} from './tarefa-regras';

export type AbaCaixa = 'para-mim' | 'aguardando' | 'concluidas';

/** Quem está olhando a caixa (sempre do JWT). */
interface Perfil {
  orgaoId: string;
  usuarioId: string | null;
  papeis: string[];
  setorId: string | null;
  /** Login do próprio órgão ou admin da plataforma: vê tudo do órgão. */
  orgao: boolean;
  /** Usuário com papel de sistema ADMIN no órgão. */
  adminOrgao: boolean;
}

const SITUACOES_ENCERRAM_TUDO = ['REVOGADA', 'ANULADA'];
/** Re-sincronização do órgão inteiro (troca de modo, modelo de fluxo): processos em paralelo, no máximo. */
const SINCRONIZACAO_ORGAO_PARALELA = 3;

/** Posse vigente (tramitação PENDENTE/RECEBIDA) com o id da tramitação. */
export type PosseVigente = Posse & { tramitacao_id: string; posse_inicial: boolean };

/**
 * F3: o que a sincronização acabou de calcular e aplicar — para quem integra
 * a tramitação (posse inicial, envio automático, "Enviar o processo",
 * "Aprovar a demanda"). Roda na MESMA fila do processo, depois das tarefas
 * de etapa e antes dos avisos das tarefas criadas (assim o aviso da
 * tramitação vem primeiro e o da tarefa não se repete).
 */
export interface ResultadoSincronizacao {
  lic: { id: string; orgao_id: string; numero_processo: string; objeto: string | null; fase: string; situacao: string | null; pregoeiro_id: string | null };
  etapas: EtapaCalculada[];
  passos: PassoCalculado[];
  config: ConfigFaseInternaEfetiva;
  modelo: ModeloFluxo;
  estado: EstadoFluxoParaEtapas;
  ctx: ContextoFluxoProcesso | null;
  /** Passos cujas tarefas foram concluídas NESTA sincronização (e quem cumpriu). */
  concluidas: Array<{ passo: string; autor: { id: string | null; nome: string | null } }>;
  /** false na migração de boot: nada avisa nem se move sozinho (só a posse inicial, que não avisa). */
  notificar: boolean;
  condutor_id: string | null;
  posse: PosseVigente | null;
  destinos: Record<string, DestinoEtapa | null>;
}

/** F1: responsável de cada etapa do modelo de fluxo (o que `responsavelDoPasso` lê). */
export function responsaveisDoModelo(modelo: Pick<ModeloFluxo, 'etapas'>): Record<string, { papel: any; setor_id: string | null; usuario_id: string | null }> {
  return Object.fromEntries(modelo.etapas.map((e) => [e.codigo, { papel: e.responsavel.papel, setor_id: e.responsavel.setor_id, usuario_id: e.responsavel.usuario_id }]));
}

/** F1: prazo (dias úteis) de cada etapa do modelo de fluxo. */
export function prazosDoModelo(modelo: Pick<ModeloFluxo, 'etapas'>): Record<string, number | null> {
  return Object.fromEntries(modelo.etapas.map((e) => [e.codigo, e.prazo_dias_uteis]));
}

const ROTULO_ORIGEM_APROVACAO: Record<string, string> = {
  DEMANDA: 'demanda aprovada no módulo de demandas',
  PECA_EXTERNA: 'DFD juntada feita fora — a aprovação consta da peça',
  APROVADOR: 'feita, aprovada ou assinada por quem aprova',
  MANUAL: 'aprovação registrada no processo',
  LEGADO: 'processo anterior ao modelo de fluxo',
};

/**
 * TAREFAS E CAIXA DE ENTRADA DA FASE INTERNA (Entrega 2).
 *
 * `sincronizar(processo)` é a ÚNICA rotina que cria, conclui, cancela e
 * reatribui tarefas de etapa: calcula as etapas (função pura
 * `etapasDaFaseInterna` sobre a instrução do processo e a config do órgão) e
 * aplica o plano (`planejarSincronizacao`). Idempotente — o índice único
 * parcial `(licitacao_id, chave) WHERE status='ABERTA'` garante no banco que
 * não nasce tarefa duplicada.
 *
 * Quem dispara: o `TarefasSubscriber` (toda gravação de peça ou mudança de
 * fase/situação/responsável, depois do commit), a tela do processo (GET das
 * etapas), a mudança da configuração do órgão e a migração de boot.
 *
 * A tramitação (`tramitacoes_processo`) continua sendo o despacho formal entre
 * setores; a caixa mostra tarefas. Ver tarefa.entity.ts.
 */
@Injectable()
export class TarefasService {
  private readonly logger = new Logger(TarefasService.name);
  /** Sincronizações em curso/agendadas por processo (coalescidas). */
  private readonly filas = new Map<string, { promessa: Promise<void>; repetir: boolean }>();
  /**
   * Rotinas que rodam na MESMA fila do processo, antes da sincronização
   * (Entrega 4: a revisão do motor de conformidade — o portão A da pesquisa
   * entra no cálculo das etapas logo em seguida).
   */
  private readonly antesDeSincronizar: Array<(licitacaoId: string) => Promise<unknown>> = [];

  /** Rotinas "antes" que rodam por ÚLTIMO e sempre (depois das demais — ex.: a juntada da peça nos autos, depois do envio ao fluxo de aprovação). */
  private readonly antesDeSincronizarPorUltimo: Array<(licitacaoId: string) => Promise<unknown>> = [];

  registrarAntesDeSincronizar(fn: (licitacaoId: string) => Promise<unknown>, opcoes: { porUltimo?: boolean } = {}) {
    (opcoes.porUltimo ? this.antesDeSincronizarPorUltimo : this.antesDeSincronizar).push(fn);
  }

  /** F3: rotinas depois de aplicar o plano (integração com a tramitação). */
  private readonly depoisDeSincronizar: Array<(r: ResultadoSincronizacao) => Promise<unknown>> = [];

  registrarDepoisDeSincronizar(fn: (r: ResultadoSincronizacao) => Promise<unknown>) {
    this.depoisDeSincronizar.push(fn);
  }

  /**
   * ISOLAMENTO DAS PEÇAS (homologação multiusuário): quem pode trabalhar em
   * cada etapa, para a tela (`pode_trabalhar` + `motivo`). Registrado pelo
   * PermissaoEtapaService (que depende deste serviço — sem ciclo de injeção).
   */
  private avaliadorDePermissoes: ((licitacaoId: string, ator: Ator) => Promise<Record<string, { pode_trabalhar: boolean; motivo: string | null; codigo: string }>>) | null = null;

  registrarAvaliadorDePermissoes(fn: (licitacaoId: string, ator: Ator) => Promise<Record<string, { pode_trabalhar: boolean; motivo: string | null; codigo: string }>>) {
    this.avaliadorDePermissoes = fn;
  }

  /**
   * Espera a sincronização em curso/agendada DESTE processo (ex.: antes de um
   * envio manual da tramitação, para a posse inicial não correr em paralelo).
   * Nunca chamar de dentro da própria fila do processo.
   */
  async aguardarProcesso(licitacaoId: string): Promise<void> {
    for (let i = 0; i < 5; i++) {
      const f = this.filas.get(licitacaoId);
      if (!f) return;
      await f.promessa.catch(() => undefined);
    }
  }

  /**
   * Processos com a agenda SUSPENSA (juntada em lote da fase interna feita
   * fora): os pedidos de sincronização ficam guardados e rodam UMA vez em
   * `retomar` — assim as tarefas das peças juntadas nascem concluídas, sem
   * notificar ninguém de tarefa aberta que se concluiria no segundo seguinte.
   */
  private readonly suspensos = new Map<string, number>();

  suspender(licitacaoId: string): void {
    this.suspensos.set(licitacaoId, (this.suspensos.get(licitacaoId) ?? 0) + 1);
  }

  /** Libera a agenda suspensa (sempre num `finally`) e sincroniza uma vez. */
  async retomar(licitacaoId: string): Promise<void> {
    const n = (this.suspensos.get(licitacaoId) ?? 1) - 1;
    if (n > 0) {
      this.suspensos.set(licitacaoId, n);
      return;
    }
    this.suspensos.delete(licitacaoId);
    await this.agendar(licitacaoId);
  }

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(Tarefa) private readonly tarefaRepo: Repository<Tarefa>,
    @InjectRepository(ConfiguracaoFaseInterna) private readonly configRepo: Repository<ConfiguracaoFaseInterna>,
    private readonly faseInterna: FaseInternaService,
    private readonly auditLog: AuditLogService,
    private readonly modeloFluxo: ModeloFluxoService,
    @Optional() private readonly notificacoes?: NotificacoesService,
    // Demanda aprovada → pendência "Montar o DFD" na caixa "Para mim" de quem monta o DFD
    @Optional() private readonly pendenciaDfd?: PendenciaDfdService,
  ) {
    definirAgendadorDeTarefas((id) => this.agendar(id));
  }

  /** Chave geral de desligamento (FASE_INTERNA_TAREFAS=false). */
  ativo(): boolean {
    return process.env.FASE_INTERNA_TAREFAS !== 'false';
  }

  // ==========================================================================
  // AGENDA (coalescida por processo)
  // ==========================================================================

  /**
   * Agenda a sincronização do processo. Pedidos durante uma sincronização em
   * curso viram UMA repetição no fim (nada roda em paralelo para o mesmo
   * processo). A promessa fica registrada na hora — as leituras da caixa
   * esperam por ela (`aguardarPendentes`).
   */
  agendar(licitacaoId: string, atrasoMs = 0, opcoes: { semRotinasAntes?: boolean; depoisDe?: Promise<unknown> } = {}): Promise<void> {
    if (!this.ativo()) return Promise.resolve();
    // Juntada em lote em curso: roda uma vez no `retomar`
    if (this.suspensos.has(licitacaoId)) return Promise.resolve();
    const atual = this.filas.get(licitacaoId);
    if (atual) {
      atual.repetir = true;
      return atual.promessa;
    }
    const estado = { repetir: false, promessa: Promise.resolve() };
    // Quem acabou de revisar a conformidade (ex.: "Revisar agora") pula a revisão
    // automática desta rodada — senão ela sobrescreve a revisão manual
    let pularAntes = !!opcoes.semRotinasAntes;
    estado.promessa = (async () => {
      try {
        if (atrasoMs > 0) await new Promise((r) => setTimeout(r, atrasoMs));
        // sincronização do órgão inteiro: espera a vez na trilha (registrado já na fila)
        if (opcoes.depoisDe) await opcoes.depoisDe.catch(() => undefined);
        do {
          estado.repetir = false;
          const rotinas = [...(pularAntes ? [] : this.antesDeSincronizar), ...this.antesDeSincronizarPorUltimo];
          pularAntes = false;
          for (const fn of rotinas) {
            try {
              await fn(licitacaoId);
            } catch (e: any) {
              this.logger.warn(`Rotina antes das tarefas do processo ${licitacaoId} falhou: ${e?.message ?? e}`);
            }
          }
          try {
            await this.sincronizar(licitacaoId);
          } catch (e: any) {
            this.logger.warn(`Tarefas do processo ${licitacaoId} não sincronizadas: ${e?.message ?? e}`);
          }
        } while (estado.repetir);
      } finally {
        this.filas.delete(licitacaoId);
      }
    })();
    this.filas.set(licitacaoId, estado);
    return estado.promessa;
  }

  /** Espera as sincronizações agendadas (leitura consistente logo depois de gravar). */
  async aguardarPendentes(): Promise<void> {
    for (let i = 0; i < 5 && this.filas.size; i++) {
      await Promise.allSettled([...this.filas.values()].map((f) => f.promessa));
    }
  }

  // ==========================================================================
  // CONFIGURAÇÃO DO ÓRGÃO
  // ==========================================================================

  /**
   * Configuração do órgão. F1: responsáveis, prazos e controle interno vêm do
   * MODELO DE FLUXO vigente do órgão (o da dispensa — a tela antiga mostra um
   * só); o modo, os signatários e as opções da dispensa, da configuração.
   */
  async configuracao(orgaoId: string): Promise<ConfigFaseInternaEfetiva> {
    const linha = await this.configRepo.findOne({ where: { orgao_id: orgaoId } });
    const base = configEfetiva(orgaoId, linha);
    const modelo = await this.modeloFluxo.modeloVigente(orgaoId, 'DISPENSA');
    return {
      ...base,
      controle_interno_ativo: !!modelo.etapas.find((e) => e.codigo === PassoFaseInterna.CONTROLE_INTERNO)?.ligada,
      responsaveis: { ...base.responsaveis, ...responsaveisDoModelo(modelo) } as ConfigFaseInternaEfetiva['responsaveis'],
      prazos: { ...base.prazos, ...prazosDoModelo(modelo) } as ConfigFaseInternaEfetiva['prazos'],
    };
  }

  async configuracaoParaTela(orgaoId: string) {
    const config = await this.configuracao(orgaoId);
    const modelo = await this.modeloFluxo.modeloVigente(orgaoId, 'DISPENSA');
    const setores: Array<{ id: string; nome: string; codigo: string }> = await this.ds.query(
      `SELECT id::text AS id, nome, codigo FROM setores WHERE orgao_id::text = $1 ORDER BY nome`,
      [orgaoId],
    );
    return {
      ...config,
      setores,
      papeis: Object.entries(ROTULO_PAPEL).map(([codigo, rotulo]) => ({ codigo, rotulo })),
      // Etapas do modelo de fluxo (as ligadas; o controle interno a tela filtra)
      // Só as etapas do sistema: as criadas pelo órgão e as condições se editam no construtor de fluxo
      passos: modelo.etapas
        .filter((e) => (e.ligada || e.codigo === PassoFaseInterna.CONTROLE_INTERNO) && !/^[UC]_/.test(e.codigo))
        .map((e) => ({
          passo: e.codigo,
          etapa: e.grupo,
          etapa_titulo: e.grupo_titulo,
          titulo: e.titulo,
          papel_padrao: DEFINICAO_PASSO[e.codigo as PassoFaseInterna]?.papel_padrao ?? e.responsavel.papel,
          prazo_padrao: DEFINICAO_PASSO[e.codigo as PassoFaseInterna]?.prazo_padrao ?? null,
        })),
      modelo_fluxo: { nome: modelo.nome, versao: modelo.versao, proprio: !!modelo.orgao_id, tela: '/orgao/configuracoes/fluxo' },
    };
  }

  /**
   * Grava a configuração e re-sincroniza os processos do órgão (troca de modo
   * reatribui; controle interno desativado cancela as tarefas dele).
   */
  async salvarConfiguracao(orgaoId: string, corpo: any, autor: { id: string | null; nome: string | null }) {
    const setores: Array<{ id: string }> = await this.ds.query(`SELECT id::text AS id FROM setores WHERE orgao_id::text = $1`, [orgaoId]);
    const r = validarConfiguracao(corpo, setores.map((s) => s.id));
    if (!r.ok) throw new BadRequestException({ message: r.erros.join(' '), pendencias: r.erros });
    // Autorização (Entrega 3B): signatários e nome da autoridade — só mudam quando enviados
    const extras: Partial<ConfiguracaoFaseInterna> = {};
    if (corpo?.signatarios_autorizacao !== undefined) {
      const usuarios: Array<{ id: string }> = await this.ds.query(`SELECT id::text AS id FROM usuarios WHERE orgao_id::text = $1 AND ativo = true`, [orgaoId]);
      const sa = validarSignatariosAutorizacao(corpo.signatarios_autorizacao, usuarios.map((u) => u.id));
      if (!sa.ok) throw new BadRequestException({ message: sa.erros.join(' '), pendencias: sa.erros });
      extras.signatarios_autorizacao = sa.valores.length ? sa.valores : null;
    }
    if (corpo?.autoridade_rotulo !== undefined) {
      extras.autoridade_rotulo = String(corpo.autoridade_rotulo ?? '').trim().slice(0, 120) || null;
    }
    // Dispensa (Entrega 5): padrão SUGERIDO para novas dispensas (a regra é a
    // escolha do agente no processo) e se o regulamento local adota a IN 67.
    // Só mudam quando enviados.
    if (corpo?.dispensa_com_lances !== undefined) {
      if (typeof corpo.dispensa_com_lances !== 'boolean') {
        throw new BadRequestException('dispensa_com_lances (padrão sugerido para novas dispensas) deve ser true (com disputa de lances) ou false (sem disputa de lances).');
      }
      extras.dispensa_com_lances = corpo.dispensa_com_lances;
    }
    if (corpo?.regulamento_adota_in67 !== undefined) {
      if (typeof corpo.regulamento_adota_in67 !== 'boolean') throw new BadRequestException('regulamento_adota_in67 deve ser true ou false.');
      extras.regulamento_adota_in67 = corpo.regulamento_adota_in67;
    }
    const existente = await this.configRepo.findOne({ where: { orgao_id: orgaoId } });
    await this.configRepo.save(
      this.configRepo.merge(existente ?? this.configRepo.create({ orgao_id: orgaoId }), {
        ...r.valores,
        ...extras,
        atualizado_por_id: autor.id,
        atualizado_por_nome: autor.nome,
      }),
    );
    // F1: responsáveis, prazos e controle interno vão para o MODELO DE FLUXO do órgão
    await this.modeloFluxo.aplicarConfiguracaoLegada(orgaoId, corpo ?? {}, r.valores, autor);
    await this.sincronizarOrgao(orgaoId);
    return this.configuracaoParaTela(orgaoId);
  }

  /** Processos do órgão que ainda podem ter tarefa (fase interna ou tarefa aberta). */
  private async processosParaSincronizar(orgaoId: string | null): Promise<string[]> {
    const linhas: Array<{ id: string }> = await this.ds.query(
      `SELECT l.id::text AS id FROM licitacoes l
        WHERE ($1::text IS NULL OR l.orgao_id::text = $1)
          AND ((l.fase::text = ANY($2::text[]) AND COALESCE(l.situacao::text, 'ATIVA') IN ('ATIVA', 'SUSPENSA'))
               OR EXISTS (SELECT 1 FROM tarefas t WHERE t.licitacao_id = l.id AND t.status = 'ABERTA'))
        ORDER BY l.created_at`,
      [orgaoId, FASES_INTERNAS],
    );
    return linhas.map((l) => l.id);
  }

  /**
   * Re-sincroniza os processos do órgão EM SEGUNDO PLANO (E9 da homologação:
   * "Salvar" da configuração ficava em "Salvando…" > 30 s enquanto a requisição
   * esperava processo por processo). Devolve logo depois de ENFILEIRAR: cada
   * processo entra na hora na sua fila (`filas`) — as leituras que chamam
   * `aguardarPendentes` (caixa, contagem, etapas) continuam consistentes —,
   * mas roda em no máximo `SINCRONIZACAO_ORGAO_PARALELA` trilhas.
   * Erros já são tratados/logados no `agendar`.
   */
  async sincronizarOrgao(orgaoId: string): Promise<void> {
    const ids = await this.processosParaSincronizar(orgaoId);
    const trilhas: Array<Promise<unknown>> = Array.from({ length: SINCRONIZACAO_ORGAO_PARALELA }, () => Promise.resolve());
    ids.forEach((id, i) => {
      const t = i % trilhas.length;
      trilhas[t] = this.agendar(id, 0, { depoisDe: trilhas[t] });
    });
  }

  // ==========================================================================
  // PAPÉIS FUNCIONAIS E SETOR DOS USUÁRIOS
  // ==========================================================================

  async usuariosDoOrgao(orgaoId: string) {
    const linhas: any[] = await this.ds.query(
      `SELECT u.id::text AS id, u.nome, u.email, u.cargo, u.role::text AS role, u.ativo,
              u.setor_id::text AS setor_id, s.nome AS setor_nome, u.papeis_fase_interna AS papeis
         FROM usuarios u LEFT JOIN setores s ON s.id = u.setor_id
        WHERE u.orgao_id::text = $1
        ORDER BY u.ativo DESC, u.nome`,
      [orgaoId],
    );
    return linhas.map((u) => ({ ...u, papeis: Array.isArray(u.papeis) ? u.papeis : [] }));
  }

  async atualizarPapeis(orgaoId: string, usuarioId: string, corpo: { papeis?: unknown; setor_id?: unknown }) {
    const [u] = ehUuid(usuarioId) ? await this.ds.query(`SELECT orgao_id::text AS orgao_id FROM usuarios WHERE id::text = $1`, [usuarioId]) : [];
    if (!u) throw new NotFoundException('Usuário não encontrado');
    if (u.orgao_id !== orgaoId) throw new ForbiddenException('Acesso negado: usuário de outro órgão');
    const papeis = Array.isArray(corpo?.papeis) ? corpo.papeis : [];
    const invalidos = papeis.filter((p) => !papelValido(p));
    if (invalidos.length) throw new BadRequestException(`Papel inválido: ${invalidos.join(', ')}`);
    let setorId: string | null = null;
    if (corpo?.setor_id) {
      const [s] = ehUuid(String(corpo.setor_id))
        ? await this.ds.query(`SELECT orgao_id::text AS orgao_id FROM setores WHERE id::text = $1`, [String(corpo.setor_id)])
        : [];
      if (!s || s.orgao_id !== orgaoId) throw new BadRequestException('Setor não pertence ao órgão');
      setorId = String(corpo.setor_id);
    }
    await this.ds.query(`UPDATE usuarios SET papeis_fase_interna = $2::jsonb, setor_id = $3 WHERE id::text = $1`, [
      usuarioId,
      JSON.stringify([...new Set(papeis)]),
      setorId,
    ]);
    return (await this.usuariosDoOrgao(orgaoId)).find((x) => x.id === usuarioId);
  }

  // ==========================================================================
  // SINCRONIZAÇÃO
  // ==========================================================================

  /**
   * Sincroniza as tarefas de etapa do processo com as etapas calculadas.
   * Devolve as etapas (a tela reaproveita). `notificar: false` na migração.
   */
  async sincronizar(
    licitacaoId: string,
    opcoes: { notificar?: boolean } = {},
  ): Promise<{ etapas: EtapaCalculada[]; config: ConfigFaseInternaEfetiva; criadas: number } | null> {
    const [lic] = await this.ds.query(
      `SELECT id::text AS id, orgao_id::text AS orgao_id, numero_processo, objeto, fase::text AS fase,
              situacao::text AS situacao, pregoeiro_id::text AS pregoeiro_id
         FROM licitacoes WHERE id::text = $1`,
      [licitacaoId],
    );
    if (!lic?.orgao_id) return null;

    const config = await this.configuracao(lic.orgao_id);
    const instrucao = await this.faseInterna.getInstrucao(licitacaoId);
    const agente = await this.usuarioAtivoDoOrgao(lic.pregoeiro_id, lic.orgao_id);
    const criador = agente ? null : await this.criadorDoProcesso(licitacaoId, lic.orgao_id);
    // F1: o modelo de fluxo do processo (snapshot + operacional vigente) e o estado dele
    const fluxo = await this.modeloDoProcesso(licitacaoId, lic.orgao_id, instrucao.contratacao_direta, true);
    if (fluxo.ctx && FASES_INTERNAS.includes(lic.fase)) {
      await this.atualizarEstadoDoFluxo(fluxo.ctx, instrucao.itens, { modo: config.modo, agente_id: agente ?? criador });
    }
    const etapas = etapasDaFaseInterna(
      { contratacao_direta: instrucao.contratacao_direta, fase: lic.fase, situacao: lic.situacao, dados: await this.dadosDasCondicoes(licitacaoId, fluxo.modelo) },
      instrucao.itens,
      fluxo.modelo,
      await this.bloqueiosDePortao(licitacaoId),
      fluxo.estado,
    );
    const passos = passosDasEtapas(etapas);
    // Construtor de fluxo: a resposta que o sistema acabou de dar a uma condição fica gravada (não muda
    // mais se o dado mudar); a devolução termina quando quem devolveu conclui
    if (fluxo.ctx && FASES_INTERNAS.includes(lic.fase)) await this.gravarDecisoesEDevolucoes(fluxo.ctx, passos);
    const abertas = await this.tarefaRepo.find({ where: { licitacao_id: licitacaoId, status: 'ABERTA' } });

    const prazos = prazosDoModelo(fluxo.modelo);
    // F3: posse única — a tarefa da etapa de quem recebeu o processo passa ao destino do envio
    const condutor = agente ?? criador;
    const posse = await this.posseAtual(licitacaoId);
    const destinos = await this.destinosDoProcesso(lic.orgao_id, fluxo.modelo, config.modo, condutor);
    const responsavelCom = (posseAgora: Posse | null) => (p: PassoFaseInterna | string) =>
      responsavelNaPosse(
        responsavelDoPasso(p, { modo: config.modo, responsaveis: responsaveisDoModelo(fluxo.modelo) }, { agente_id: agente, criador_usuario_id: criador }),
        p,
        destinos[p],
        posseAgora,
        config.modo,
      );
    const responsavelDe = responsavelCom(posse);

    const plano = planejarSincronizacao(passos, abertas, responsavelDe, {
      processo_encerrado: SITUACOES_ENCERRAM_TUDO.includes(lic.situacao) && FASES_INTERNAS.includes(lic.fase),
    });

    const agora = new Date();
    const cal = calendarioDoOrgao(lic.orgao_id);
    let criadas = 0;
    const avisos: Tarefa[] = [];
    const concluidas: ResultadoSincronizacao['concluidas'] = [];

    for (const { passo, responsavel } of plano.criar) {
      const valores = this.valoresDaTarefaDoPasso(lic, passo, responsavel, prazos, agora, cal);
      const r = await this.tarefaRepo.createQueryBuilder().insert().into(Tarefa).values(valores).orIgnore().returning(['id']).execute();
      const id = r.raw?.[0]?.id;
      if (!id) continue; // já existia uma aberta (outra instância) — idempotente
      criadas++;
      await this.log(licitacaoId, AcaoLogFaseInterna.TAREFA_CRIADA, `Tarefa criada: ${passo.titulo}`, null, {
        tarefa_id: id,
        etapa: passo.etapa,
        passo: passo.passo,
        responsavel,
        prazo: valores.prazo,
      });
      // o aviso sai no fim (depois da tramitação — sem aviso repetido)
      if (opcoes.notificar !== false) avisos.push({ ...valores, id } as Tarefa);
    }

    for (const { tarefa_id, passo } of plano.concluir) {
      const autor = await this.quemCumpriuPasso(licitacaoId, passo);
      const r = await this.ds.query(
        `UPDATE tarefas SET status = 'CONCLUIDA', concluida_em = now(), concluida_por_id = $2, concluida_por_nome = $3, updated_at = now()
          WHERE id::text = $1 AND status = 'ABERTA' RETURNING id`,
        [tarefa_id, autor.id, autor.nome],
      );
      if (!Number(r?.[1])) continue; // outra sincronização já concluiu
      concluidas.push({ passo: passo.passo, autor });
      await this.log(licitacaoId, AcaoLogFaseInterna.TAREFA_CONCLUIDA, `Tarefa concluída: ${passo.titulo}`, null, {
        tarefa_id,
        passo: passo.passo,
        concluida_por: autor,
      }, { usuario_id: autor.id ?? undefined, usuario_nome: autor.nome ?? undefined });
    }

    for (const { tarefa_id, motivo } of plano.cancelar) {
      await this.ds.query(
        `UPDATE tarefas SET status = 'CANCELADA', cancelada_em = now(), motivo_cancelamento = $2, updated_at = now()
          WHERE id::text = $1 AND status = 'ABERTA'`,
        [tarefa_id, motivo],
      );
      await this.log(licitacaoId, AcaoLogFaseInterna.TAREFA_CANCELADA, `Tarefa cancelada: ${motivo}`, null, { tarefa_id, motivo });
    }

    for (const { tarefa_id, de, para } of plano.reatribuir) {
      await this.ds.query(
        `UPDATE tarefas SET responsavel_usuario_id = $2, responsavel_papel = $3, responsavel_setor_id = $4, updated_at = now()
          WHERE id::text = $1 AND status = 'ABERTA' AND atribuicao_manual = false`,
        [tarefa_id, para.usuario_id, para.papel, para.setor_id],
      );
      await this.log(licitacaoId, AcaoLogFaseInterna.TAREFA_REATRIBUIDA, 'Responsável recalculado pela configuração do órgão', { responsavel: de }, {
        tarefa_id,
        responsavel: para,
      });
    }

    await this.registrarMudancasDeEtapa(licitacaoId, etapas);

    // F3: integração com a tramitação (posse inicial, envio automático, "Enviar o processo", "Aprovar a demanda")
    const resultado: ResultadoSincronizacao = {
      lic,
      etapas,
      passos,
      config,
      modelo: fluxo.modelo,
      estado: fluxo.estado,
      ctx: fluxo.ctx,
      concluidas,
      notificar: opcoes.notificar !== false,
      condutor_id: condutor,
      posse,
      destinos,
    };
    for (const fn of this.depoisDeSincronizar) {
      try {
        await fn(resultado);
      } catch (e: any) {
        this.logger.warn(`Integração do processo ${licitacaoId} com a tramitação falhou: ${e?.message ?? e}`);
      }
    }
    // A posse mudou agora (envio automático): as tarefas que acabaram de nascer já vão para o
    // destino — e o aviso sai para ele uma vez só (quem já foi avisado pela tramitação não repete)
    if (avisos.length) {
      const posseDepois = await this.posseAtual(licitacaoId);
      if ((posseDepois?.tramitacao_id ?? null) !== (posse?.tramitacao_id ?? null)) {
        const novoDe = responsavelCom(posseDepois);
        for (const t of avisos) {
          if (t.origem !== 'ETAPA' || !t.passo) continue;
          const para = novoDe(t.passo);
          const de: Responsavel = { usuario_id: t.responsavel_usuario_id, papel: t.responsavel_papel, setor_id: t.responsavel_setor_id };
          if (mesmoResponsavel(de, para)) continue;
          const r = await this.ds.query(
            `UPDATE tarefas SET responsavel_usuario_id = $2, responsavel_papel = $3, responsavel_setor_id = $4, updated_at = now()
              WHERE id::text = $1 AND status = 'ABERTA' AND atribuicao_manual = false RETURNING id`,
            [t.id, para.usuario_id, para.papel, para.setor_id],
          );
          if (!Number(r?.[1])) continue;
          Object.assign(t, { responsavel_usuario_id: para.usuario_id, responsavel_papel: para.papel, responsavel_setor_id: para.setor_id });
          await this.log(licitacaoId, AcaoLogFaseInterna.TAREFA_REATRIBUIDA, 'Responsável recalculado: o processo chegou ao destino da etapa', { responsavel: de }, { tarefa_id: t.id, responsavel: para });
        }
      }
    }
    for (const t of avisos) await this.notificar(lic, t, 'nova');
    return { etapas, config, criadas };
  }

  // ==========================================================================
  // POSSE (tramitação) E DESTINO DE CADA ETAPA (F3)
  // ==========================================================================

  /** Com quem o processo está: a tramitação vigente (PENDENTE/RECEBIDA). Só leitura. */
  async posseAtual(licitacaoId: string): Promise<PosseVigente | null> {
    const [t] = await this.ds
      .query(
        `SELECT id::text AS id, status::text AS status, para_setor_id, para_usuario_id, etapas, posse_inicial
           FROM tramitacoes_processo WHERE licitacao_id::text = $1 ORDER BY sequencia DESC LIMIT 1`,
        [licitacaoId],
      )
      .catch(() => [] as any[]);
    if (!t || !['PENDENTE', 'RECEBIDA'].includes(t.status)) return null;
    if (!t.para_setor_id && !t.para_usuario_id) return null;
    return {
      tramitacao_id: t.id,
      setor_id: t.para_setor_id ?? null,
      usuario_id: t.para_usuario_id ?? null,
      etapas: Array.isArray(t.etapas) ? t.etapas : null,
      posse_inicial: !!t.posse_inicial,
    };
  }

  /** Quem conduz o processo: o agente designado (usuário ativo do órgão), senão quem criou. */
  async condutorDoProcesso(licitacaoId: string): Promise<string | null> {
    const [lic] = await this.ds.query(`SELECT orgao_id::text AS orgao_id, pregoeiro_id::text AS pregoeiro_id FROM licitacoes WHERE id::text = $1`, [licitacaoId]);
    if (!lic?.orgao_id) return null;
    return (await this.usuarioAtivoDoOrgao(lic.pregoeiro_id, lic.orgao_id)) ?? (await this.criadorDoProcesso(licitacaoId, lic.orgao_id));
  }

  /** Agente designado (usuário ativo do órgão) e, sem ele, quem criou o processo. */
  async agenteECriador(licitacaoId: string): Promise<{ agente: string | null; criador: string | null; orgao_id: string | null }> {
    const [lic] = await this.ds.query(`SELECT orgao_id::text AS orgao_id, pregoeiro_id::text AS pregoeiro_id FROM licitacoes WHERE id::text = $1`, [licitacaoId]);
    if (!lic?.orgao_id) return { agente: null, criador: null, orgao_id: null };
    const agente = await this.usuarioAtivoDoOrgao(lic.pregoeiro_id, lic.orgao_id);
    return { agente, criador: agente ? null : await this.criadorDoProcesso(licitacaoId, lic.orgao_id), orgao_id: lic.orgao_id };
  }

  /**
   * A etapa PODE COMEÇAR agora (dependências concluídas e a demanda aprovada)?
   * Só leitura — pode rodar dentro da fila do processo (tarefas dos achados da
   * conformidade: não nasce tarefa de etapa que ainda não pode começar).
   * Etapa fora das etapas ativas do processo: só a aprovação da demanda conta.
   */
  async podeIniciarPasso(licitacaoId: string, passo: string): Promise<boolean> {
    const [lic] = await this.ds.query(`SELECT orgao_id::text AS orgao_id, fase::text AS fase, situacao::text AS situacao FROM licitacoes WHERE id::text = $1`, [licitacaoId]);
    if (!lic?.orgao_id) return true;
    if (!FASES_INTERNAS.includes(lic.fase)) return true;
    const p = passosDasEtapas(await this.etapasCalculadas(licitacaoId, lic)).find((x) => x.passo === passo);
    if (p) return p.pode_iniciar;
    const fluxo = await this.modeloDoProcesso(licitacaoId, lic.orgao_id);
    const ap = fluxo.modelo.aprovacao_demanda;
    return !(ap?.exigida && fluxo.estado.demanda_aprovada === false && passo !== ap.etapa);
  }

  /**
   * TRAVA DO PUBLICAR (homologação multiusuário — E3): etapas do modelo do
   * processo que ainda seguram a publicação — as obrigatórias e as de que a
   * etapa de publicação depende, não concluídas (títulos com o motivo). Etapa
   * reaberta ou "a revisar" fica com a FLUXO-01 (não se repete). Só leitura:
   * roda dentro da transação do ato PUBLICAR.
   */
  async etapasPendentesParaPublicar(licitacaoId: string): Promise<string[]> {
    const [lic] = await this.ds.query(`SELECT orgao_id::text AS orgao_id, fase::text AS fase, situacao::text AS situacao FROM licitacoes WHERE id::text = $1`, [licitacaoId]);
    if (!lic?.orgao_id || !FASES_INTERNAS.includes(lic.fase)) return [];
    const passos = passosDasEtapas(await this.etapasCalculadas(licitacaoId, lic));
    const pub = passos.find((p) => p.passo === PassoFaseInterna.PUBLICACAO);
    const exigidas = new Set<string>(pub?.pendencias ?? []);
    const saida: string[] = [];
    for (const p of passos) {
      if (p.passo === PassoFaseInterna.PUBLICACAO || p.situacao === 'CONCLUIDO' || p.situacao === 'NAO_REALIZADO') continue;
      if (!p.obrigatoria && !exigidas.has(p.passo)) continue;
      if (p.reaberta || p.situacao === 'A_REVISAR') continue; // FLUXO-01
      const motivo = p.aguardando_aprovacao
        ? 'aguardando a aprovação da demanda'
        : p.situacao === 'EM_ANDAMENTO'
          ? 'em andamento'
          : p.pendencias.length
            ? 'aguardando as etapas anteriores'
            : 'não iniciada';
      saida.push(`${p.titulo}${p.fundamento ? ` (${p.fundamento})` : ''} — ${motivo}`);
    }
    return saida;
  }

  /**
   * DESTINO de cada etapa do modelo do processo (para onde o processo vai
   * para ela): o responsável da etapa no modelo (pessoa, setor ou papel,
   * resolvido pelos usuários ativos do órgão) — `destinoDaEtapa`.
   */
  async destinosDoProcesso(orgaoId: string, modelo: Pick<ModeloFluxo, 'etapas'>, modo: string, condutorId: string | null): Promise<Record<string, DestinoEtapa | null>> {
    const ctx = await this.contextoDeDestino(orgaoId, modo, condutorId);
    return Object.fromEntries(modelo.etapas.map((e) => [e.codigo, destinoDaEtapa(e.responsavel, ctx)]));
  }

  /**
   * DESTINOS POSSÍVEIS das etapas SEM destino único (responsável = papel que
   * mais de um setor tem): um por setor/pessoa com o papel. A sugestão de
   * envio tira quem está com o processo e oferece os demais (homologação:
   * "o fluxo não sugeriu o Jurídico").
   */
  async destinosPossiveisDoProcesso(
    orgaoId: string,
    modelo: Pick<ModeloFluxo, 'etapas'>,
    modo: string,
    condutorId: string | null,
    destinos: Record<string, DestinoEtapa | null>,
  ): Promise<Record<string, DestinoEtapa[]>> {
    const semDestino = modelo.etapas.filter((e) => !destinos[e.codigo] && e.responsavel?.papel);
    if (!semDestino.length) return {};
    const ctx = await this.contextoDeDestino(orgaoId, modo, condutorId);
    return Object.fromEntries(semDestino.map((e) => [e.codigo, destinosPossiveisDoPapel(e.responsavel.papel as string, ctx)]));
  }

  private async contextoDeDestino(orgaoId: string, modo: string, condutorId: string | null) {
    const usuarios: any[] = await this.ds.query(
      `SELECT u.id::text AS id, u.nome, u.setor_id::text AS setor_id, s.nome AS setor_nome, u.papeis_fase_interna AS papeis
         FROM usuarios u LEFT JOIN setores s ON s.id = u.setor_id
        WHERE u.orgao_id::text = $1 AND u.ativo = true`,
      [orgaoId],
    );
    const setores: Array<{ id: string; nome: string }> = await this.ds.query(`SELECT id::text AS id, nome FROM setores WHERE orgao_id::text = $1`, [orgaoId]);
    return {
      modo,
      condutor_id: condutorId,
      papel_do_condutor: PapelFaseInterna.AGENTE_CONTRATACAO,
      usuarios: usuarios.map((u) => ({ id: u.id, nome: u.nome || 'Usuário', setor_id: u.setor_id ?? null, setor_nome: u.setor_nome ?? null, papeis: Array.isArray(u.papeis) ? u.papeis : [] })),
      setores,
    };
  }

  /**
   * TAREFA DO SISTEMA (origem SISTEMA — ex.: "Renovar dotação" na virada do
   * exercício, Entrega 3A). Não é derivada das etapas: a sincronização não a
   * conclui nem a cancela (só a revogação/anulação cancela todas). Responsável:
   * o do passo informado (modo SIMPLES: o agente; POR_SETOR: o papel/setor da
   * configuração — na reserva, a Contabilidade). Idempotente pela chave
   * (uma ABERTA por processo e chave). Devolve o id da tarefa aberta.
   */
  async criarTarefaDoSistema(
    licitacaoId: string,
    t: {
      chave: string;
      passo: PassoFaseInterna;
      titulo: string;
      descricao: string;
      tipo_peca?: string | null;
      documento_id?: string | null;
      /** Entrega 3B: diligência do parecer (origem DILIGENCIA) e devolução da autorização; Entrega 4: achado da conformidade. */
      origem?: 'SISTEMA' | 'DILIGENCIA' | 'ACHADO' | 'APROVACAO' | 'TRAMITACAO' | 'ASSINATURA';
      origem_id?: string | null;
      tipo?: 'PECA' | 'DILIGENCIA' | 'ACHADO' | 'ASSINATURA' | 'OUTRO';
      /** Responsável explícito (ex.: o agente do processo); sem ele, o do passo. */
      responsavel?: Responsavel | null;
      /** F3: prazo próprio em dias úteis (sem ele, o do passo no modelo); null = sem prazo. */
      prazo_dias_uteis?: number | null;
      /** F3: false = sem aviso (migração). */
      notificar?: boolean;
    },
  ): Promise<string | null> {
    if (!this.ativo()) return null;
    const [lic] = await this.ds.query(
      `SELECT id::text AS id, orgao_id::text AS orgao_id, numero_processo, pregoeiro_id::text AS pregoeiro_id FROM licitacoes WHERE id::text = $1`,
      [licitacaoId],
    );
    if (!lic?.orgao_id) return null;
    const { modelo } = await this.modeloDoProcesso(licitacaoId, lic.orgao_id);
    const responsavel = t.responsavel ?? (await this.responsavelDoPassoNoProcesso(licitacaoId, t.passo));
    const dias = t.prazo_dias_uteis !== undefined ? t.prazo_dias_uteis : prazosDoModelo(modelo)[t.passo] ?? null;
    const valores: Partial<Tarefa> = {
      orgao_id: lic.orgao_id,
      licitacao_id: licitacaoId,
      documento_id: t.documento_id ?? null,
      tipo_peca: t.tipo_peca ?? null,
      etapa: modelo.etapas.find((e) => e.codigo === t.passo)?.grupo ?? DEFINICAO_PASSO[t.passo]?.etapa ?? null,
      passo: t.passo,
      chave: t.chave,
      tipo: t.tipo ?? 'PECA',
      origem: t.origem ?? 'SISTEMA',
      origem_id: t.origem_id ?? null,
      titulo: t.titulo,
      descricao: t.descricao,
      responsavel_usuario_id: responsavel.usuario_id,
      responsavel_papel: responsavel.papel,
      responsavel_setor_id: responsavel.setor_id,
      atribuicao_manual: false,
      prazo_dias_uteis: dias,
      prazo: prazoDaTarefa(new Date(), dias, calendarioDoOrgao(lic.orgao_id)),
      status: 'ABERTA',
      criada_por_id: 'sistema',
      criada_por_nome: 'Sistema',
    };
    const r = await this.tarefaRepo.createQueryBuilder().insert().into(Tarefa).values(valores).orIgnore().returning(['id']).execute();
    const id: string | undefined = r.raw?.[0]?.id;
    if (!id) {
      const [aberta] = await this.ds.query(`SELECT id::text AS id FROM tarefas WHERE licitacao_id::text = $1 AND chave = $2 AND status = 'ABERTA'`, [licitacaoId, t.chave]);
      return aberta?.id ?? null;
    }
    await this.log(licitacaoId, AcaoLogFaseInterna.TAREFA_CRIADA, `Tarefa criada: ${t.titulo}`, null, { tarefa_id: id, passo: t.passo, chave: t.chave, responsavel, prazo: valores.prazo });
    if (t.notificar !== false) await this.notificar(lic, { ...valores, id } as Tarefa, 'nova');
    return id;
  }

  /**
   * Responsável calculado para um passo DESTE processo (modo SIMPLES: o agente,
   * ou quem criou, ou a caixa do agente; POR_SETOR: o papel/setor configurado).
   */
  async responsavelDoPassoNoProcesso(licitacaoId: string, passo: PassoFaseInterna): Promise<Responsavel> {
    const [lic] = await this.ds.query(`SELECT orgao_id::text AS orgao_id, pregoeiro_id::text AS pregoeiro_id FROM licitacoes WHERE id::text = $1`, [licitacaoId]);
    if (!lic?.orgao_id) return { usuario_id: null, papel: null, setor_id: null };
    const config = await this.configuracao(lic.orgao_id);
    const { modelo } = await this.modeloDoProcesso(licitacaoId, lic.orgao_id);
    const agente = await this.usuarioAtivoDoOrgao(lic.pregoeiro_id, lic.orgao_id);
    const criador = agente ? null : await this.criadorDoProcesso(licitacaoId, lic.orgao_id);
    return responsavelDoPasso(passo, { modo: config.modo, responsaveis: responsaveisDoModelo(modelo) }, { agente_id: agente, criador_usuario_id: criador });
  }

  /**
   * O agente do processo (a devolução da autorização vai para ele): o agente
   * designado (usuário ativo do órgão), senão quem criou, senão a caixa do
   * papel AGENTE_CONTRATACAO — em qualquer modo.
   */
  async agenteDoProcesso(licitacaoId: string): Promise<Responsavel> {
    const [lic] = await this.ds.query(`SELECT orgao_id::text AS orgao_id, pregoeiro_id::text AS pregoeiro_id FROM licitacoes WHERE id::text = $1`, [licitacaoId]);
    if (!lic?.orgao_id) return { usuario_id: null, papel: null, setor_id: null };
    const agente = (await this.usuarioAtivoDoOrgao(lic.pregoeiro_id, lic.orgao_id)) ?? (await this.criadorDoProcesso(licitacaoId, lic.orgao_id));
    return agente ? { usuario_id: agente, papel: null, setor_id: null } : { usuario_id: null, papel: 'AGENTE_CONTRATACAO', setor_id: null };
  }

  /** Cancela a tarefa ABERTA da chave (ex.: diligência cancelada pela Procuradoria). */
  async cancelarTarefaPorChave(licitacaoId: string, chave: string, motivo: string): Promise<boolean> {
    const r = await this.ds.query(
      `UPDATE tarefas SET status = 'CANCELADA', cancelada_em = now(), motivo_cancelamento = $3, updated_at = now()
        WHERE licitacao_id::text = $1 AND chave = $2 AND status = 'ABERTA' RETURNING id::text AS id`,
      [licitacaoId, chave, motivo],
    );
    const linhas: Array<{ id: string }> = Array.isArray(r?.[0]) ? r[0] : [];
    for (const t of linhas) await this.log(licitacaoId, AcaoLogFaseInterna.TAREFA_CANCELADA, `Tarefa cancelada: ${motivo}`, null, { tarefa_id: t.id, chave, motivo });
    return linhas.length > 0;
  }

  /** Conclui a tarefa ABERTA da chave (tarefa do sistema cumprida), registrando quem cumpriu. */
  async concluirTarefaPorChave(licitacaoId: string, chave: string, autor: { id: string | null; nome: string | null }): Promise<boolean> {
    const r = await this.ds.query(
      `UPDATE tarefas SET status = 'CONCLUIDA', concluida_em = now(), concluida_por_id = $3, concluida_por_nome = $4, updated_at = now()
        WHERE licitacao_id::text = $1 AND chave = $2 AND status = 'ABERTA' RETURNING id::text AS id, titulo`,
      [licitacaoId, chave, autor.id, autor.nome],
    );
    const linhas: Array<{ id: string; titulo: string }> = Array.isArray(r?.[0]) ? r[0] : [];
    for (const t of linhas) {
      await this.log(licitacaoId, AcaoLogFaseInterna.TAREFA_CONCLUIDA, `Tarefa concluída: ${t.titulo}`, null, { tarefa_id: t.id, chave, concluida_por: autor }, {
        usuario_id: autor.id ?? undefined,
        usuario_nome: autor.nome ?? undefined,
      });
    }
    return linhas.length > 0;
  }

  /** Tarefa ABERTA de etapa para o passo (sincronização; a juntada em lote a grava já concluída). */
  private valoresDaTarefaDoPasso(
    lic: { id: string; orgao_id: string; numero_processo: string; objeto: string | null },
    passo: PassoCalculado,
    responsavel: Responsavel,
    prazos: Partial<Record<string, number | null>>,
    agora: Date,
    cal: ReturnType<typeof calendarioDoOrgao>,
  ): Partial<Tarefa> {
    const dias = prazos[passo.passo] ?? null;
    const tipoPeca = passo.peca_pendente ?? passo.pecas[0]?.tipo ?? null;
    return {
      orgao_id: lic.orgao_id,
      licitacao_id: lic.id,
      documento_id: passo.pecas.find((p) => p.tipo === tipoPeca)?.documento_id ?? null,
      tipo_peca: tipoPeca,
      etapa: passo.etapa,
      passo: passo.passo,
      chave: chaveDoPasso(passo.passo),
      tipo: passo.passo === PassoFaseInterna.PUBLICACAO ? 'PUBLICACAO' : 'PECA',
      origem: 'ETAPA',
      // F1: etapa reaberta ("voltar") ou a revisar vira tarefa de revisão
      titulo: (passo.reaberta ? `Refazer (etapa reaberta): ${passo.titulo}` : passo.situacao === 'A_REVISAR' ? `Revisar: ${passo.titulo}` : passo.titulo).slice(0, 250),
      descricao: this.descricaoDaTarefa(lic, passo),
      responsavel_usuario_id: responsavel.usuario_id,
      responsavel_papel: responsavel.papel,
      responsavel_setor_id: responsavel.setor_id,
      atribuicao_manual: false,
      prazo_dias_uteis: dias,
      prazo: prazoDaTarefa(agora, dias, cal),
      status: 'ABERTA',
      criada_por_id: 'sistema',
      criada_por_nome: 'Sistema',
    };
  }

  /**
   * FASE INTERNA FEITA FORA (juntada em lote): as tarefas dos passos que as
   * peças juntadas cumpriram NASCEM CONCLUÍDAS (quem cumpriu = quem juntou ou
   * marcou "não se aplica"), com o registro no histórico — sem notificação.
   * Chamado depois de `retomar` (a sincronização já concluiu as abertas e
   * criou as dos passos que continuam disponíveis). Idempotente: passo que já
   * teve tarefa (de qualquer situação) não ganha outra. Devolve quantas nasceram.
   */
  async registrarPassosCumpridosFora(licitacaoId: string): Promise<number> {
    if (!this.ativo()) return 0;
    const [lic] = await this.ds.query(
      `SELECT id::text AS id, orgao_id::text AS orgao_id, numero_processo, objeto, fase::text AS fase,
              situacao::text AS situacao, pregoeiro_id::text AS pregoeiro_id
         FROM licitacoes WHERE id::text = $1`,
      [licitacaoId],
    );
    if (!lic?.orgao_id) return 0;
    const config = await this.configuracao(lic.orgao_id);
    const { modelo } = await this.modeloDoProcesso(licitacaoId, lic.orgao_id);
    const passos = passosDasEtapas(await this.etapasCalculadas(licitacaoId, lic, config));
    const chaves: Array<{ chave: string }> = await this.ds.query(
      `SELECT DISTINCT chave FROM tarefas WHERE licitacao_id::text = $1 AND chave IS NOT NULL`,
      [licitacaoId],
    );
    const nascer = passosCumpridosSemTarefa(passos, chaves.map((c) => c.chave));
    if (!nascer.length) return 0;
    const agente = await this.usuarioAtivoDoOrgao(lic.pregoeiro_id, lic.orgao_id);
    const criador = agente ? null : await this.criadorDoProcesso(licitacaoId, lic.orgao_id);
    const agora = new Date();
    const cal = calendarioDoOrgao(lic.orgao_id);
    let n = 0;
    for (const passo of nascer) {
      const autor = await this.quemCumpriuPasso(licitacaoId, passo);
      const responsavel = responsavelDoPasso(passo.passo, { modo: config.modo, responsaveis: responsaveisDoModelo(modelo) }, { agente_id: agente, criador_usuario_id: criador });
      const valores: Partial<Tarefa> = {
        ...this.valoresDaTarefaDoPasso(lic, passo, responsavel, prazosDoModelo(modelo), agora, cal),
        prazo: null,
        status: 'CONCLUIDA',
        concluida_em: agora,
        concluida_por_id: autor.id,
        concluida_por_nome: autor.nome,
      };
      const [existe] = await this.ds.query(`SELECT 1 FROM tarefas WHERE licitacao_id::text = $1 AND chave = $2 LIMIT 1`, [licitacaoId, valores.chave]);
      if (existe) continue;
      const r = await this.tarefaRepo.createQueryBuilder().insert().into(Tarefa).values(valores).returning(['id']).execute();
      const id = r.raw?.[0]?.id;
      if (!id) continue;
      n++;
      await this.log(licitacaoId, AcaoLogFaseInterna.TAREFA_CONCLUIDA, `Tarefa concluída (peça feita fora do sistema, juntada ao processo): ${passo.titulo}`, null, {
        tarefa_id: id,
        passo: passo.passo,
        concluida_por: autor,
        juntada_externa: true,
      }, { usuario_id: autor.id ?? undefined, usuario_nome: autor.nome ?? undefined });
    }
    return n;
  }

  private descricaoDaTarefa(lic: { numero_processo: string; objeto: string | null }, passo: PassoCalculado): string {
    const objeto = String(lic.objeto ?? '').trim();
    const cabeca = `Processo ${lic.numero_processo}${objeto ? ` — ${objeto.length > 140 ? `${objeto.slice(0, 137)}…` : objeto}` : ''}.`;
    if (passo.passo === PassoFaseInterna.PUBLICACAO) {
      return `${cabeca} Confira o checklist de pré-publicação e publique o aviso/edital.`;
    }
    if (passo.reaberta) {
      return `${cabeca} A etapa foi reaberta${passo.reaberta.por_nome ? ` por ${passo.reaberta.por_nome}` : ''}: ${passo.reaberta.motivo ?? ''} Corrija a peça (nova versão ou novo anexo) ou confirme a revisão.`;
    }
    if (passo.situacao === 'A_REVISAR' && passo.a_revisar) {
      return `${cabeca} Uma etapa de que esta depende foi reaberta (${passo.a_revisar.motivo ?? 'sem motivo'}). Revise a peça e atualize-a, ou confirme que continua valendo.`;
    }
    if (passo.conclusao === 'REGISTRO') return `${cabeca} Registre o despacho desta etapa no processo.`;
    if (passo.aguardando_aprovacao) return `${cabeca} A demanda está pronta e aguarda a aprovação de quem foi designado para aprovar.`;
    const pecas = passo.pecas.map((p) => p.titulo).join('; ');
    return `${cabeca} Peças: ${pecas}. Faça aqui, anexe o PDF feito fora ou marque "não se aplica" quando a lei permitir.`;
  }

  /**
   * PORTÃO A (Entrega 4): achados BLOQUEIO abertos das regras da pesquisa
   * (LIM-01 — limite/fracionamento) seguram a conclusão do passo da pesquisa.
   * Lidos do motor de conformidade, que roda na mesma fila, logo antes.
   */
  private async bloqueiosDePortao(licitacaoId: string): Promise<BloqueiosDePortao> {
    // F1: as regras que seguram o ato "concluir a pesquisa" vêm das travas por ato (dados)
    const codigos = (await this.modeloFluxo.travas())
      .filter((t) => t.ato === 'CONCLUIR_PESQUISA' && t.ativa && t.severidade === 'BLOQUEIO')
      .map((t) => t.regra);
    if (!codigos.length) return {};
    const linhas: Array<{ regra: string; mensagem: string }> = await this.ds
      .query(`SELECT regra, mensagem FROM achados_conformidade WHERE licitacao_id::text = $1 AND status = 'ABERTO' AND severidade = 'BLOQUEIO' AND regra = ANY($2::text[])`, [
        licitacaoId,
        codigos,
      ])
      .catch(() => []);
    return linhas.length ? { [PassoFaseInterna.PESQUISA]: linhas.map((l) => `${l.regra}: ${l.mensagem}`) } : {};
  }

  /** Usuário ATIVO do órgão (o agente do processo tem de ser do próprio órgão). */
  private async usuarioAtivoDoOrgao(usuarioId: string | null, orgaoId: string): Promise<string | null> {
    if (!usuarioId || !ehUuid(usuarioId)) return null;
    const [u] = await this.ds.query(`SELECT id::text AS id FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2 AND ativo = true`, [usuarioId, orgaoId]);
    return u?.id ?? null;
  }

  /** Servidor que criou o processo (registro CRIAR do histórico), se foi um usuário. */
  private async criadorDoProcesso(licitacaoId: string, orgaoId: string): Promise<string | null> {
    const [c] = await this.ds.query(
      `SELECT ator_id FROM licitacao_transicoes WHERE licitacao_id::text = $1 AND ato = 'CRIAR' AND ator_tipo = 'USUARIO' ORDER BY created_at LIMIT 1`,
      [licitacaoId],
    );
    return this.usuarioAtivoDoOrgao(c?.ator_id ?? null, orgaoId);
  }

  /** Quem cumpriu o passo: da peça pronta mais recente (ou quem publicou). */
  private async quemCumpriuPasso(licitacaoId: string, passo: PassoCalculado): Promise<{ id: string | null; nome: string | null }> {
    let autor: { id: string | null; nome: string | null } = { id: null, nome: null };
    if (passo.passo === PassoFaseInterna.PUBLICACAO) {
      const [t] = await this.ds.query(
        `SELECT ator_id FROM licitacao_transicoes WHERE licitacao_id::text = $1 AND ato = 'PUBLICAR' ORDER BY created_at DESC LIMIT 1`,
        [licitacaoId],
      );
      autor = { id: t?.ator_id ?? null, nome: null };
    } else {
      const tipos = passo.pecas.map((p) => p.tipo);
      const [doc] = tipos.length
        ? await this.ds.query(
            `SELECT status::text AS status, assinaturas, aprovador_id, aprovador_nome, criado_por_id, criado_por_nome
               FROM documentos_fase_interna
              WHERE licitacao_id::text = $1 AND versao_atual = true AND tipo::text = ANY($2::text[])
              ORDER BY updated_at DESC LIMIT 1`,
            [licitacaoId, tipos],
          )
        : [];
      if (doc) autor = quemCumpriu(doc);
    }
    if (autor.id && !autor.nome) autor.nome = await this.nomeDoAtor(autor.id);
    return autor;
  }

  private async nomeDoAtor(id: string): Promise<string | null> {
    if (!ehUuid(id)) return null;
    const [u] = await this.ds.query(`SELECT nome FROM usuarios WHERE id::text = $1`, [id]);
    if (u?.nome) return u.nome;
    const [o] = await this.ds.query(`SELECT nome FROM orgaos WHERE id::text = $1`, [id]);
    return o?.nome ?? null;
  }

  /**
   * HISTÓRICO DAS ETAPAS: grava em `logs_fase_interna` (ETAPA_ALTERADA, de/para)
   * cada etapa cuja situação mudou desde o último registro. A situação vem da
   * derivação — o log é o histórico, não a fonte (nenhuma coluna de status).
   */
  private async registrarMudancasDeEtapa(licitacaoId: string, etapas: EtapaCalculada[]) {
    const simplificar = (s: string) => (s === 'EM_ANDAMENTO' || s === 'DISPONIVEL' ? 'ABERTA' : s);
    const anteriores: Array<{ etapa: string; situacao: string }> = await this.ds.query(
      `SELECT DISTINCT ON (dados_depois->>'etapa') dados_depois->>'etapa' AS etapa, dados_depois->>'situacao' AS situacao
         FROM logs_fase_interna
        WHERE licitacao_id::text = $1 AND acao::text = 'ETAPA_ALTERADA'
        ORDER BY dados_depois->>'etapa', created_at DESC`,
      [licitacaoId],
    );
    const antes = new Map(anteriores.map((a) => [a.etapa, a.situacao]));
    const atuais = new Map(etapas.map((e) => [e.etapa as string, simplificar(e.situacao)]));
    for (const [etapa, anterior] of antes) if (!atuais.has(etapa) && anterior !== 'NAO_APLICAVEL') atuais.set(etapa, 'NAO_APLICAVEL');
    for (const [etapa, situacao] of atuais) {
      const anterior = antes.get(etapa) ?? 'AGUARDANDO';
      if (anterior === situacao) continue;
      await this.log(
        licitacaoId,
        AcaoLogFaseInterna.ETAPA_ALTERADA,
        `Etapa "${TITULO_ETAPA[etapa as keyof typeof TITULO_ETAPA] ?? etapa}": ${anterior} → ${situacao}`,
        { etapa, situacao: anterior },
        { etapa, situacao },
      );
    }
  }

  private async log(licitacaoId: string, acao: AcaoLogFaseInterna, descricao: string, antes: any, depois: any, contexto?: ContextoUsuario) {
    try {
      await this.auditLog.log({ licitacao_id: licitacaoId, acao, descricao, dados_antes: antes, dados_depois: depois, contexto });
    } catch (e: any) {
      this.logger.warn(`Log da fase interna não gravado (${acao}): ${e?.message ?? e}`);
    }
  }

  // ==========================================================================
  // NOTIFICAÇÃO (e-mail/WhatsApp pelo NotificacoesService)
  // ==========================================================================

  private async destinatarios(t: Pick<Tarefa, 'orgao_id' | 'responsavel_usuario_id' | 'responsavel_papel' | 'responsavel_setor_id'>) {
    if (t.responsavel_usuario_id) {
      return this.ds.query(`SELECT id::text AS id, email, telefone FROM usuarios WHERE id::text = $1 AND ativo = true`, [t.responsavel_usuario_id]);
    }
    return this.ds.query(
      `SELECT id::text AS id, email, telefone FROM usuarios
        WHERE orgao_id::text = $1 AND ativo = true
          AND (($2::text IS NOT NULL AND COALESCE(papeis_fase_interna, '[]'::jsonb) ? $2::text)
               OR ($3::text IS NOT NULL AND setor_id::text = $3::text))
        LIMIT 30`,
      [t.orgao_id, t.responsavel_papel, t.responsavel_setor_id],
    );
  }

  private janelaAvisoDuplicado(): number {
    const bruto = process.env.FASE_INTERNA_AVISO_DUPLICADO_MIN;
    const v = Number(bruto);
    return bruto !== undefined && bruto !== '' && Number.isFinite(v) && v >= 0 ? v : JANELA_AVISO_DUPLICADO_MIN;
  }

  /** Avisos de tramitação (chegada) do processo no último dia, com a idade em segundos (relógio do banco). */
  private async avisosRecentesDeTramitacao(licitacaoId: string): Promise<Array<{ usuario_id: string | null; idade_s: number }>> {
    const linhas: any[] = await this.ds
      .query(
        `SELECT usuario_id::text AS usuario_id, EXTRACT(EPOCH FROM (now() - created_at))::float AS idade_s
           FROM notificacoes
          WHERE entidade_id = $1 AND tipo::text = 'PROCESSO_TRAMITADO' AND created_at > now() - interval '1 day'`,
        [licitacaoId],
      )
      .catch(() => [] as any[]);
    return linhas.map((l) => ({ usuario_id: l.usuario_id ?? null, idade_s: Number(l.idade_s) }));
  }

  private async notificar(lic: { id: string; numero_processo: string }, t: Tarefa, motivo: 'nova' | 'reatribuida') {
    if (!this.notificacoes || process.env.FASE_INTERNA_TAREFAS_NOTIFICAR === 'false') return;
    try {
      const todos: Array<{ id: string; email?: string; telefone?: string }> = await this.destinatarios(t);
      // F3: quem acabou de ser avisado pela TRAMITAÇÃO deste processo não recebe o aviso repetido da tarefa
      const para = destinatariosSemAvisoRecente(todos, await this.avisosRecentesDeTramitacao(lic.id), this.janelaAvisoDuplicado());
      if (!para.length) return;
      const link = destinoDaTarefa({ licitacao_id: lic.id, passo: t.passo, tipo_peca: t.tipo_peca, origem: t.origem, origem_id: t.origem_id });
      const prazo = t.prazo ? ` Prazo: ${new Date(t.prazo).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.` : '';
      await this.notificacoes.criarParaMultiplos(para, {
        orgao_id: t.orgao_id,
        tipo: TipoNotificacao.SISTEMA,
        titulo: `${motivo === 'nova' ? 'Nova tarefa' : 'Tarefa atribuída a você'} — processo ${lic.numero_processo}`,
        mensagem: `${t.titulo}.${prazo}`,
        entidade_tipo: 'TAREFA',
        entidade_id: t.id,
        link,
        metadata: { whatsapp_url: `${process.env.APP_URL || 'https://portaldcp.com.br'}${link}` },
        enviar_email: true,
      });
    } catch (e: any) {
      this.logger.warn(`Notificação da tarefa não enviada: ${e?.message ?? e}`);
    }
  }

  // ==========================================================================
  // CAIXA DE TAREFAS
  // ==========================================================================

  /** Perfil de quem consulta — órgão, papéis e setor sempre do banco/JWT. */
  async perfil(ator: Ator, orgaoInformado?: string): Promise<Perfil> {
    if (ator.admin) {
      if (!orgaoInformado || !ehUuid(orgaoInformado)) throw new BadRequestException('Informe orgao_id');
      return { orgaoId: orgaoInformado, usuarioId: null, papeis: [], setorId: null, orgao: true, adminOrgao: true };
    }
    const orgaoId = ator.orgaoId!;
    if (ator.tipo === 'ORGAO') return { orgaoId, usuarioId: null, papeis: [], setorId: null, orgao: true, adminOrgao: true };
    const [u] = await this.ds.query(
      `SELECT papeis_fase_interna AS papeis, setor_id::text AS setor_id, role::text AS role FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2`,
      [ator.usuarioId, orgaoId],
    );
    return {
      orgaoId,
      usuarioId: ator.usuarioId,
      papeis: Array.isArray(u?.papeis) ? u.papeis : [],
      setorId: u?.setor_id ?? null,
      orgao: false,
      adminOrgao: (u?.role ?? ator.role) === 'ADMIN',
    };
  }

  /** Filtro SQL "a tarefa é para mim" (alias t) e seus parâmetros a partir de $inicio. */
  private filtroParaMim(p: Perfil, inicio: number): { sql: string; params: unknown[] } {
    if (p.orgao) return { sql: `t.responsavel_usuario_id IS NULL`, params: [] };
    return {
      sql: `(t.responsavel_usuario_id::text = $${inicio}
             OR (t.responsavel_usuario_id IS NULL AND (t.responsavel_papel = ANY($${inicio + 1}::text[])
                 OR ($${inicio + 2}::text IS NOT NULL AND t.responsavel_setor_id::text = $${inicio + 2}::text))))`,
      params: [p.usuarioId, p.papeis, p.setorId],
    };
  }

  /** "Aguardando outros": abertas de processos meus (agente) — ou do órgão, para o admin. */
  private filtroAguardando(p: Perfil, inicio: number): { sql: string; params: unknown[] } {
    if (p.orgao) return { sql: `t.responsavel_usuario_id IS NOT NULL`, params: [] };
    const mim = this.filtroParaMim(p, inicio);
    const n = inicio + mim.params.length;
    return {
      sql: `NOT COALESCE(${mim.sql}, false) AND (l.pregoeiro_id::text = $${n} OR $${n + 1}::boolean)`,
      params: [...mim.params, p.usuarioId, p.adminOrgao],
    };
  }

  private readonly SELECT_TAREFA = `
    SELECT t.*, t.id::text AS id, t.licitacao_id::text AS licitacao_id,
           l.numero_processo, l.objeto, l.modalidade::text AS modalidade, l.fase::text AS fase,
           ru.nome AS responsavel_nome, rs.nome AS responsavel_setor_nome
      FROM tarefas t
      JOIN licitacoes l ON l.id = t.licitacao_id
      LEFT JOIN usuarios ru ON ru.id = t.responsavel_usuario_id
      LEFT JOIN setores rs ON rs.id = t.responsavel_setor_id`;

  async caixa(ator: Ator, aba: AbaCaixa, orgaoInformado?: string) {
    await this.aguardarPendentes();
    const p = await this.perfil(ator, orgaoInformado);
    const agora = new Date();
    const listar = async (filtro: { sql: string; params: unknown[] }, status: string[], ordem: string, limite: number) =>
      this.ds.query(
        `${this.SELECT_TAREFA}
          WHERE t.orgao_id::text = $1 AND t.status = ANY($2::text[]) AND ${filtro.sql}
          ORDER BY ${ordem} LIMIT ${limite}`,
        [p.orgaoId, status, ...filtro.params],
      );

    const paraMim = this.filtroParaMim(p, 3);
    const aguardando = this.filtroAguardando(p, 3);
    let linhas: any[];
    if (aba === 'concluidas') {
      const meu = p.orgao
        ? { sql: 'true', params: [] }
        : { sql: `(${paraMim.sql} OR t.concluida_por_id = $${3 + paraMim.params.length})`, params: [...paraMim.params, p.usuarioId] };
      linhas = await listar(meu, ['CONCLUIDA', 'CANCELADA'], 'COALESCE(t.concluida_em, t.cancelada_em, t.updated_at) DESC', 100);
    } else {
      linhas = await listar(aba === 'aguardando' ? aguardando : paraMim, ['ABERTA'], 't.prazo ASC NULLS LAST, t.created_at ASC', 300);
    }
    const tarefas = linhas.map((t) => this.paraTela(t, p, agora));

    const contar = async (filtro: { sql: string; params: unknown[] }) => {
      const [r] = await this.ds.query(
        `SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE t.prazo < now())::int AS atrasadas
           FROM tarefas t JOIN licitacoes l ON l.id = t.licitacao_id
          WHERE t.orgao_id::text = $1 AND t.status = ANY($2::text[]) AND ${filtro.sql}`,
        [p.orgaoId, ['ABERTA'], ...filtro.params],
      );
      return r;
    };
    const [cMim, cOutros, pendenciaDfd] = await Promise.all([contar(paraMim), contar(aguardando), this.pendenciaDoDfd(ator, p.orgaoId)]);

    // Prazos da semana: tarefas visíveis que vencem nos próximos 7 dias + sessões públicas
    const semana = new Date(agora.getTime() + 7 * 86_400_000);
    const tarefasSemana = await this.ds.query(
      `${this.SELECT_TAREFA}
        WHERE t.orgao_id::text = $1 AND t.status = 'ABERTA' AND t.prazo IS NOT NULL AND t.prazo <= $2
          AND (${this.filtroParaMim(p, 3).sql})
        ORDER BY t.prazo ASC LIMIT 20`,
      [p.orgaoId, semana, ...this.filtroParaMim(p, 3).params],
    );
    const sessoes: any[] = await this.ds.query(
      `SELECT id::text AS id, numero_processo, data_abertura_sessao FROM licitacoes
        WHERE orgao_id::text = $1 AND data_abertura_sessao BETWEEN $2 AND $3
          AND ($4::boolean OR pregoeiro_id::text = $5)
        ORDER BY data_abertura_sessao LIMIT 10`,
      [p.orgaoId, agora, semana, p.orgao || p.adminOrgao, p.usuarioId],
    );
    const prazosSemana = [
      ...tarefasSemana.map((t: any) => ({
        data: t.prazo,
        titulo: `${t.titulo} — ${t.numero_processo}`,
        licitacao_id: t.licitacao_id,
        tarefa_id: t.id,
        atrasada: tarefaAtrasada(t, agora),
      })),
      ...sessoes.map((s) => ({ data: s.data_abertura_sessao, titulo: `Sessão pública — ${s.numero_processo}`, licitacao_id: s.id, tarefa_id: null, atrasada: false })),
    ].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

    return {
      aba,
      tarefas,
      // Fora dos processos: "Montar o DFD — N demanda(s) aprovada(s) aguardando" (quem monta o DFD; some sozinha)
      pendencias: aba === 'para-mim' && pendenciaDfd ? [pendenciaDfd] : [],
      contagem: { para_mim: cMim.n + (pendenciaDfd ? 1 : 0), atrasadas: cMim.atrasadas, aguardando: cOutros.n },
      prazos_semana: prazosSemana,
      perfil: { usuario_id: p.usuarioId, papeis: p.papeis, setor_id: p.setorId, orgao: p.orgao, admin: p.adminOrgao },
    };
  }

  /** Pendência "Montar o DFD" de quem consulta (derivada das demandas aprovadas livres do órgão). */
  private async pendenciaDoDfd(ator: Ator, orgaoId: string) {
    return (await this.pendenciaDfd?.pendenciaDaCaixa(ator, orgaoId)) ?? null;
  }

  /** Contagem para o badge do menu (as tarefas abertas para mim + a pendência do DFD). */
  async contagem(ator: Ator, orgaoInformado?: string) {
    await this.aguardarPendentes();
    const p = await this.perfil(ator, orgaoInformado);
    const f = this.filtroParaMim(p, 2);
    const pendenciaDfd = await this.pendenciaDoDfd(ator, p.orgaoId);
    const [r] = await this.ds.query(
      `SELECT COUNT(*)::int AS para_mim, COUNT(*) FILTER (WHERE t.prazo < now())::int AS atrasadas
         FROM tarefas t JOIN licitacoes l ON l.id = t.licitacao_id
        WHERE t.orgao_id::text = $1 AND t.status = 'ABERTA' AND ${f.sql}`,
      [p.orgaoId, ...f.params],
    );
    return { para_mim: Number(r?.para_mim ?? 0) + (pendenciaDfd ? 1 : 0), atrasadas: Number(r?.atrasadas ?? 0) };
  }

  private rotuloResponsavel(t: any): string {
    if (t.responsavel_usuario_id) return t.responsavel_nome || 'Usuário';
    const partes = [
      t.responsavel_papel ? ROTULO_PAPEL[t.responsavel_papel as keyof typeof ROTULO_PAPEL] ?? t.responsavel_papel : null,
      t.responsavel_setor_nome ? `setor ${t.responsavel_setor_nome}` : null,
    ].filter(Boolean);
    return partes.length ? partes.join(' · ') : 'Órgão';
  }

  private ehDoMeuPool(t: any, p: Perfil): boolean {
    if (t.responsavel_usuario_id) return false;
    return (!!t.responsavel_papel && p.papeis.includes(t.responsavel_papel)) || (!!t.responsavel_setor_id && t.responsavel_setor_id === p.setorId);
  }

  private paraTela(t: any, p: Perfil, agora: Date) {
    const atrasada = tarefaAtrasada(t, agora);
    const cal = calendarioDoOrgao(t.orgao_id);
    const diasRestantes = t.prazo && t.status === 'ABERTA' && !atrasada ? diasUteisEntre(agora, new Date(t.prazo), cal) : null;
    const minha = !!p.usuarioId && t.responsavel_usuario_id === p.usuarioId;
    const aberta = t.status === 'ABERTA';
    return {
      id: t.id,
      titulo: t.titulo,
      descricao: t.descricao,
      status: t.status,
      tipo: t.tipo,
      origem: t.origem,
      etapa: t.etapa,
      etapa_titulo: t.etapa ? TITULO_ETAPA[t.etapa as keyof typeof TITULO_ETAPA] ?? t.etapa : null,
      passo: t.passo,
      tipo_peca: t.tipo_peca,
      prazo: t.prazo,
      prazo_dias_uteis: t.prazo_dias_uteis,
      dias_uteis_restantes: diasRestantes,
      atrasada,
      processo: { id: t.licitacao_id, numero_processo: t.numero_processo, objeto: t.objeto, modalidade: t.modalidade, fase: t.fase },
      responsavel: {
        usuario_id: t.responsavel_usuario_id,
        nome: t.responsavel_nome ?? null,
        papel: t.responsavel_papel,
        setor_id: t.responsavel_setor_id,
        setor_nome: t.responsavel_setor_nome ?? null,
        rotulo: this.rotuloResponsavel(t),
      },
      destino: destinoDaTarefa(t),
      pode_assumir: aberta && !p.orgao && this.ehDoMeuPool(t, p),
      pode_reatribuir: aberta && (p.orgao || p.adminOrgao || minha || this.ehDoMeuPool(t, p)),
      concluida_por_nome: t.concluida_por_nome,
      concluida_em: t.concluida_em,
      cancelada_em: t.cancelada_em,
      motivo_cancelamento: t.motivo_cancelamento,
      created_at: t.created_at,
    };
  }

  // ==========================================================================
  // REATRIBUIR / ASSUMIR
  // ==========================================================================

  private async tarefaParaEscrita(id: string, p: Perfil): Promise<any> {
    const [t] = ehUuid(id) ? await this.ds.query(`${this.SELECT_TAREFA} WHERE t.id::text = $1`, [id]) : [];
    if (!t) throw new NotFoundException('Tarefa não encontrada');
    if (t.orgao_id !== p.orgaoId) throw new ForbiddenException('Acesso negado: tarefa de outro órgão');
    if (t.status !== 'ABERTA') throw new ConflictException('A tarefa não está aberta');
    return t;
  }

  async reatribuir(ator: Ator, id: string, corpo: { usuario_id?: string; motivo?: string }, orgaoInformado?: string) {
    await this.aguardarPendentes();
    const p = await this.perfil(ator, orgaoInformado ?? (await this.orgaoDaTarefa(id)));
    const t = await this.tarefaParaEscrita(id, p);
    const [lic] = await this.ds.query(`SELECT id::text AS id, numero_processo, pregoeiro_id::text AS pregoeiro_id FROM licitacoes WHERE id = $1`, [t.licitacao_id]);
    const pode =
      p.orgao ||
      p.adminOrgao ||
      (!!p.usuarioId && (t.responsavel_usuario_id === p.usuarioId || lic?.pregoeiro_id === p.usuarioId)) ||
      this.ehDoMeuPool(t, p);
    if (!pode) throw new ForbiddenException('Só o responsável, o agente do processo ou o administrador do órgão reatribui a tarefa');

    const destino = String(corpo?.usuario_id ?? '');
    const [u] = ehUuid(destino)
      ? await this.ds.query(`SELECT id::text AS id, nome, orgao_id::text AS orgao_id, ativo FROM usuarios WHERE id::text = $1`, [destino])
      : [];
    if (!u) throw new BadRequestException('Informe o usuário que vai receber a tarefa');
    if (u.orgao_id !== p.orgaoId) throw new ForbiddenException('Acesso negado: usuário não pertence ao órgão');
    if (!u.ativo) throw new BadRequestException('Usuário inativo');

    await this.ds.query(
      `UPDATE tarefas SET responsavel_usuario_id = $2, responsavel_papel = NULL, responsavel_setor_id = NULL, atribuicao_manual = true, updated_at = now()
        WHERE id::text = $1`,
      [id, u.id],
    );
    const autor = await this.autor(ator);
    await this.log(
      t.licitacao_id,
      AcaoLogFaseInterna.TAREFA_REATRIBUIDA,
      `Tarefa "${t.titulo}" reatribuída a ${u.nome}${corpo?.motivo ? ` — ${String(corpo.motivo).slice(0, 500)}` : ''}`,
      { responsavel: { usuario_id: t.responsavel_usuario_id, papel: t.responsavel_papel, setor_id: t.responsavel_setor_id } },
      { tarefa_id: id, responsavel: { usuario_id: u.id, papel: null, setor_id: null }, motivo: corpo?.motivo ?? null },
      { usuario_id: autor.id ?? undefined, usuario_nome: autor.nome ?? undefined },
    );
    const atual = await this.tarefaRepo.findOneByOrFail({ id });
    if (lic) await this.notificar(lic, atual, 'reatribuida');
    return this.paraTela({ ...t, ...atual, responsavel_nome: u.nome, responsavel_setor_nome: null, orgao_id: t.orgao_id }, p, new Date());
  }

  async assumir(ator: Ator, id: string) {
    await this.aguardarPendentes();
    if (!ator.admin && ator.tipo !== 'USUARIO') throw new BadRequestException('Entre com o seu usuário para assumir a tarefa');
    if (ator.admin) throw new BadRequestException('O administrador da plataforma não assume tarefas');
    const p = await this.perfil(ator);
    const t = await this.tarefaParaEscrita(id, p);
    if (t.responsavel_usuario_id === p.usuarioId) return this.paraTela(t, p, new Date());
    if (t.responsavel_usuario_id) throw new ConflictException(`A tarefa já está com ${t.responsavel_nome ?? 'outra pessoa'} — peça a reatribuição`);
    if (!this.ehDoMeuPool(t, p) && !p.adminOrgao) throw new ForbiddenException('A tarefa é de outro setor/papel');
    await this.ds.query(`UPDATE tarefas SET responsavel_usuario_id = $2, atribuicao_manual = true, updated_at = now() WHERE id::text = $1`, [id, p.usuarioId]);
    const autor = await this.autor(ator);
    await this.log(
      t.licitacao_id,
      AcaoLogFaseInterna.TAREFA_REATRIBUIDA,
      `Tarefa "${t.titulo}" assumida por ${autor.nome ?? 'usuário'}`,
      { responsavel: { usuario_id: null, papel: t.responsavel_papel, setor_id: t.responsavel_setor_id } },
      { tarefa_id: id, responsavel: { usuario_id: p.usuarioId, papel: t.responsavel_papel, setor_id: t.responsavel_setor_id }, assumida: true },
      { usuario_id: autor.id ?? undefined, usuario_nome: autor.nome ?? undefined },
    );
    const [nova] = await this.ds.query(`${this.SELECT_TAREFA} WHERE t.id::text = $1`, [id]);
    return this.paraTela(nova, p, new Date());
  }

  private async orgaoDaTarefa(id: string): Promise<string | undefined> {
    const [t] = ehUuid(id) ? await this.ds.query(`SELECT orgao_id::text AS orgao_id FROM tarefas WHERE id::text = $1`, [id]) : [];
    return t?.orgao_id;
  }

  /** Nome e id do ator (JWT) para histórico e configuração. */
  async autor(ator: Ator): Promise<{ id: string | null; nome: string | null }> {
    if (ator.admin) return { id: ator.id, nome: 'Administrador da plataforma' };
    const id = ator.usuarioId ?? ator.orgaoId ?? ator.id;
    return { id, nome: id ? await this.nomeDoAtor(id) : null };
  }

  // ==========================================================================
  // ETAPAS DO PROCESSO (tela do processo)
  // ==========================================================================

  /**
   * ETAPAS CALCULADAS do processo, SEM sincronizar tarefas nem montar a tela —
   * leitura para painéis (Painel para TV). Mesma regra de `sincronizar` e
   * `etapasDoProcesso`: `etapasDaFaseInterna` sobre a instrução, a
   * configuração do órgão e o portão A. `config` evita reler a configuração
   * quando o chamador já a tem (vários processos do mesmo órgão).
   */
  async etapasCalculadas(
    licitacaoId: string,
    lic: { orgao_id: string; fase: string; situacao: string | null },
    // Mantido por compatibilidade (painel TV): o modelo e o estado são os do processo (F1)
    _config?: ConfigFaseInternaEfetiva,
  ): Promise<EtapaCalculada[]> {
    const instrucao = await this.faseInterna.getInstrucao(licitacaoId);
    const fluxo = await this.modeloDoProcesso(licitacaoId, lic.orgao_id, instrucao.contratacao_direta);
    return etapasDaFaseInterna(
      { contratacao_direta: instrucao.contratacao_direta, fase: lic.fase, situacao: lic.situacao, dados: await this.dadosDasCondicoes(licitacaoId, fluxo.modelo) },
      instrucao.itens,
      fluxo.modelo,
      await this.bloqueiosDePortao(licitacaoId),
      fluxo.estado,
    );
  }

  /**
   * MODELO DE FLUXO DO PROCESSO (F1): snapshot do caminho + operacional
   * vigente e o estado (aprovação da demanda, reabertas, a revisar,
   * registros). Sem linha de fluxo (falha ao criar): o modelo vigente do
   * órgão, sem estado (comportamento de antes da F1).
   *
   * `gravar`: só a SINCRONIZAÇÃO (depois do commit) grava a linha do fluxo;
   * as demais leituras podem rodar dentro da transação de um ato e são só
   * leitura (ver `ModeloFluxoService.fluxoDoProcesso`).
   */
  async modeloDoProcesso(
    licitacaoId: string,
    orgaoId: string,
    contratacaoDireta?: boolean,
    gravar = false,
  ): Promise<{ modelo: ModeloFluxo; estado: EstadoFluxoParaEtapas; ctx: ContextoFluxoProcesso | null }> {
    try {
      const ctx = await this.modeloFluxo.contextoDoProcesso(licitacaoId, { gravar });
      if (ctx) return { modelo: ctx.modelo, estado: ctx.estado, ctx: gravar ? ctx : ctx.fluxo.id ? ctx : null };
    } catch (e: any) {
      this.logger.warn(`Modelo de fluxo do processo ${licitacaoId} indisponível: ${e?.message ?? e}`);
    }
    const [l] = contratacaoDireta === undefined ? await this.ds.query(`SELECT modalidade::text AS modalidade FROM licitacoes WHERE id::text = $1`, [licitacaoId]) : [];
    const tipo = contratacaoDireta === undefined ? this.modeloFluxo.tipoDaModalidade(l?.modalidade) : contratacaoDireta ? 'DISPENSA' : 'LICITACAO';
    return { modelo: await this.modeloFluxo.modeloVigente(orgaoId, tipo), estado: {}, ctx: null };
  }

  /**
   * CONSTRUTOR DE FLUXO: dados do processo que as condições do modelo leem
   * (valor total estimado, tipo de contratação, modalidade, fundamento legal).
   * Só consulta quando o modelo tem condição.
   */
  async dadosDasCondicoes(licitacaoId: string, modelo: Pick<ModeloFluxo, 'etapas'>): Promise<DadosCondicao | null> {
    if (!modelo.etapas.some((e) => e.conclusao === 'CONDICAO')) return null;
    const [l] = await this.ds.query(
      `SELECT valor_total_estimado, tipo_contratacao::text AS tipo_contratacao, modalidade::text AS modalidade, fundamento_legal FROM licitacoes WHERE id::text = $1`,
      [licitacaoId],
    );
    if (!l) return null;
    const valor = l.valor_total_estimado === null || l.valor_total_estimado === undefined ? null : Number(l.valor_total_estimado);
    return { valor_total_estimado: Number.isFinite(valor) ? valor : null, tipo_contratacao: l.tipo_contratacao ?? null, modalidade: l.modalidade ?? null, fundamento_legal: l.fundamento_legal ?? null };
  }

  /**
   * CONSTRUTOR DE FLUXO (na sincronização, depois do commit): grava a resposta
   * que o sistema acabou de dar a uma condição (com o histórico) e encerra a
   * devolução cuja aprovação já concluiu. Delta atômico (`aplicarMarcas`).
   */
  private async gravarDecisoesEDevolucoes(ctx: ContextoFluxoProcesso, passos: PassoCalculado[]): Promise<void> {
    try {
      const novas = passos.filter((p) => p.conclusao === 'CONDICAO' && p.decisao && p.decisao.registrada === false);
      const retornos = ctx.estado.retornos ?? {};
      const encerradas = Object.entries(retornos)
        .filter(([, m]) => passos.find((p) => p.passo === m?.de)?.situacao === 'CONCLUIDO')
        .map(([t]) => t);
      if (!novas.length && !encerradas.length) return;
      const em = new Date().toISOString();
      const por = Object.fromEntries(
        novas.map((p) => {
          const { registrada, ...d } = p.decisao!;
          void registrada;
          return [p.passo, { ...d, em }];
        }),
      );
      const gravado = await this.modeloFluxo.aplicarMarcas(ctx.fluxo.id, { decisoes: { por }, retornos: { remover: encerradas } });
      ctx.fluxo.decisoes = gravado.decisoes;
      ctx.fluxo.retornos = gravado.retornos;
      ctx.estado.decisoes = gravado.decisoes;
      ctx.estado.retornos = gravado.retornos;
      for (const p of novas) {
        await this.log(
          ctx.licitacao_id,
          AcaoLogFaseInterna.CONDICAO_RESPONDIDA,
          `Condição "${p.titulo}" avaliada pelo sistema: ${p.decisao!.resposta === 'sim' ? 'sim' : 'não'} — ${p.decisao!.descricao ?? ''}`.trim(),
          null,
          { etapa: p.passo, resposta: p.decisao!.resposta, automatica: true, descricao: p.decisao!.descricao ?? null },
          { usuario_nome: 'Sistema' },
        );
      }
    } catch (e: any) {
      this.logger.warn(`Decisões do fluxo do processo ${ctx.licitacao_id} não gravadas: ${e?.message ?? e}`);
    }
  }

  /** F1: controle interno ligado no modelo de fluxo DESTE processo (operacional vigente). */
  async controleInternoAtivoNoProcesso(licitacaoId: string): Promise<boolean> {
    const [l] = await this.ds.query(`SELECT orgao_id::text AS orgao_id, modalidade::text AS modalidade FROM licitacoes WHERE id::text = $1`, [licitacaoId]);
    if (!l?.orgao_id) return false;
    return this.modeloFluxo.controleInternoAtivo(l.orgao_id, l.modalidade);
  }

  /** F1: controle interno ligado no modelo do órgão para a modalidade (antes de o processo existir). */
  controleInternoAtivoPorModalidade(orgaoId: string, modalidade: string): Promise<boolean> {
    return this.modeloFluxo.controleInternoAtivo(orgaoId, modalidade);
  }

  /**
   * Antes de calcular as etapas: a marca de etapa reaberta/a revisar sai
   * sozinha quando a peça dela é alterada depois; a aprovação da demanda é
   * registrada quando já existe por outro caminho (demanda aprovada, DFD
   * juntada, feita/aprovada/assinada por quem aprova — ou pelo condutor no
   * modo simples).
   */
  private async atualizarEstadoDoFluxo(ctx: ContextoFluxoProcesso, itens: Array<{ tipo: string; status: string }>, condutor: CondutorDoProcesso): Promise<void> {
    try {
      const limpos = await this.modeloFluxo.limparMarcasPorPecaAlterada(ctx);
      for (const l of limpos) {
        const titulo = ctx.modelo.etapas.find((e) => e.codigo === l.codigo)?.titulo ?? l.codigo;
        await this.log(ctx.licitacao_id, AcaoLogFaseInterna.ETAPA_REVISADA, `Etapa "${titulo}" revista: a peça foi alterada depois da ${l.marca === 'reaberta' ? 'reabertura' : 'marca "a revisar"'}`, { etapa: l.codigo, marca: l.marca }, { etapa: l.codigo, automatica: true });
      }
      const origem = await this.modeloFluxo.verificarAprovacaoAutomatica(ctx, itens, condutor);
      if (origem) {
        ctx.fluxo.demanda_aprovada = true;
        ctx.estado.demanda_aprovada = true;
        const [f] = await this.ds.query(`SELECT aprovacao_demanda FROM fluxos_processo_fase_interna WHERE id::text = $1`, [ctx.fluxo.id]);
        const ap = f?.aprovacao_demanda ?? {};
        await this.log(
          ctx.licitacao_id,
          AcaoLogFaseInterna.DEMANDA_APROVADA,
          `Demanda aprovada (${ROTULO_ORIGEM_APROVACAO[origem] ?? origem})${ap.por_nome ? ` — ${ap.por_nome}` : ''}`,
          null,
          { origem, ...ap },
          { usuario_id: ap.por_id ?? undefined, usuario_nome: ap.por_nome ?? undefined },
        );
      }
    } catch (e: any) {
      this.logger.warn(`Estado do fluxo do processo ${ctx.licitacao_id} não atualizado: ${e?.message ?? e}`);
    }
  }

  /**
   * Quem CONDUZ o processo (pode voltar/avançar etapa e dispensar o parecer
   * informando o ato): o login do órgão, o administrador (do órgão ou da
   * plataforma) e o agente de contratação do processo.
   */
  async podeConduzirProcesso(ator: Ator, licitacaoId: string): Promise<boolean> {
    if (ator.admin || ator.tipo === 'ORGAO') return true;
    if (ator.tipo !== 'USUARIO' || !ator.usuarioId) return false;
    const [r] = await this.ds.query(
      `SELECT u.role::text AS role, l.pregoeiro_id::text AS pregoeiro_id
         FROM licitacoes l LEFT JOIN usuarios u ON u.id::text = $2 AND u.orgao_id = l.orgao_id
        WHERE l.id::text = $1`,
      [licitacaoId, ator.usuarioId],
    );
    return r?.role === 'ADMIN' || (!!r?.pregoeiro_id && r.pregoeiro_id === ator.usuarioId);
  }

  /** O ator (usuário do órgão) é o responsável da etapa no modelo (pessoa, papel ou setor)? */
  async ehResponsavelDaEtapa(ator: Ator, orgaoId: string, r: { papel: string | null; setor_id: string | null; usuario_id: string | null } | null | undefined): Promise<boolean> {
    if (!r || ator.tipo !== 'USUARIO' || !ator.usuarioId) return false;
    if (r.usuario_id) return r.usuario_id === ator.usuarioId;
    const [u] = await this.ds.query(`SELECT papeis_fase_interna AS papeis, setor_id::text AS setor_id FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2`, [ator.usuarioId, orgaoId]);
    return (!!r.papel && Array.isArray(u?.papeis) && u.papeis.includes(r.papel)) || (!!r.setor_id && u?.setor_id === r.setor_id);
  }

  /** O ator aprova a demanda deste processo pelo modelo? */
  async podeAprovarDemanda(ator: Ator, licitacaoId: string, modelo: ModeloFluxo): Promise<boolean> {
    if (ator.admin || ator.tipo === 'ORGAO') return true;
    if (ator.tipo !== 'USUARIO' || !ator.usuarioId) return false;
    const [lic] = await this.ds.query(`SELECT orgao_id::text AS orgao_id, pregoeiro_id::text AS pregoeiro_id FROM licitacoes WHERE id::text = $1`, [licitacaoId]);
    if (!lic) return false;
    const config = await this.configuracao(lic.orgao_id);
    const agente = await this.usuarioAtivoDoOrgao(lic.pregoeiro_id, lic.orgao_id);
    const criador = agente ? null : await this.criadorDoProcesso(licitacaoId, lic.orgao_id);
    return this.modeloFluxo.ehAprovador(ator.usuarioId, lic.orgao_id, modelo.aprovacao_demanda.aprovador, { modo: config.modo, agente_id: agente ?? criador });
  }

  async etapasDoProcesso(licitacaoId: string, ator?: Ator) {
    // Sincroniza (pela fila do processo — nada em paralelo) e recalcula para a tela
    await this.agendar(licitacaoId);
    const [lic] = await this.ds.query(
      `SELECT orgao_id::text AS orgao_id, fase::text AS fase, situacao::text AS situacao, pregoeiro_id::text AS pregoeiro_id FROM licitacoes WHERE id::text = $1`,
      [licitacaoId],
    );
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    const config = await this.configuracao(lic.orgao_id);
    const etapas = await this.etapasCalculadas(licitacaoId, lic, config);
    const fluxo = await this.modeloDoProcesso(licitacaoId, lic.orgao_id);
    const prazos = prazosDoModelo(fluxo.modelo);
    const respModelo = { modo: config.modo, responsaveis: responsaveisDoModelo(fluxo.modelo) };

    const tarefas: any[] = await this.ds.query(`${this.SELECT_TAREFA} WHERE t.licitacao_id::text = $1 ORDER BY t.created_at`, [licitacaoId]);
    const perfilNeutro: Perfil = { orgaoId: lic.orgao_id, usuarioId: null, papeis: [], setorId: null, orgao: true, adminOrgao: true };
    const agora = new Date();
    const agente = await this.usuarioAtivoDoOrgao(lic.pregoeiro_id, lic.orgao_id);
    const criador = agente ? null : await this.criadorDoProcesso(licitacaoId, lic.orgao_id);
    const nomes = new Map<string, string>();
    const nomeResp = async (resp: Responsavel) => {
      if (resp.usuario_id) {
        if (!nomes.has(resp.usuario_id)) nomes.set(resp.usuario_id, (await this.nomeDoAtor(resp.usuario_id)) ?? 'Usuário');
        return nomes.get(resp.usuario_id)!;
      }
      return this.rotuloResponsavel({ responsavel_papel: resp.papel, responsavel_setor_nome: resp.setor_id ? await this.nomeDoSetor(resp.setor_id) : null });
    };

    const conduzAqui = ator ? await this.podeConduzirProcesso(ator, licitacaoId) : false;
    // Isolamento das peças: quem pode trabalhar em cada etapa (tela: esconde/desabilita a escrita)
    let permissoes: Record<string, { pode_trabalhar: boolean; motivo: string | null; codigo: string }> = {};
    if (ator && this.avaliadorDePermissoes) {
      try {
        permissoes = await this.avaliadorDePermissoes(licitacaoId, ator);
      } catch (e: any) {
        this.logger.warn(`Permissões das etapas do processo ${licitacaoId} indisponíveis: ${e?.message ?? e}`);
      }
    }
    const saida: any[] = [];
    for (const e of etapas) {
      const passos: any[] = [];
      for (const p of e.passos) {
        const daChave = tarefas.filter((t) => t.chave === chaveDoPasso(p.passo));
        const tarefa = daChave.find((t) => t.status === 'ABERTA') ?? daChave[daChave.length - 1] ?? null;
        const previsto = responsavelDoPasso(p.passo, respModelo, { agente_id: agente, criador_usuario_id: criador });
        passos.push({
          ...p,
          codigo: p.passo,
          // "Voltar" na tela da etapa: quem conduz ou o responsável pela etapa (o servidor confere de novo)
          pode_reabrir:
            !!ator &&
            FASES_INTERNAS.includes(lic.fase) &&
            (p.situacao === 'CONCLUIDO' || p.situacao === 'A_REVISAR') &&
            p.conclusao !== 'DIVULGACAO' &&
            (conduzAqui ||
              (config.modo === 'POR_SETOR' && (await this.ehResponsavelDaEtapa(ator, lic.orgao_id, fluxo.modelo.etapas.find((x) => x.codigo === p.passo)?.responsavel)))),
          tarefa: tarefa ? this.paraTela(tarefa, perfilNeutro, agora) : null,
          responsavel_previsto: { ...previsto, rotulo: await nomeResp(previsto) },
          prazo_dias_uteis: prazos[p.passo] ?? null,
          pode_trabalhar: permissoes[p.passo]?.pode_trabalhar ?? true,
          motivo_trabalho: permissoes[p.passo]?.motivo ?? null,
        });
      }
      saida.push({ ...e, passos });
    }
    const historico = await this.ds.query(
      `SELECT acao::text AS acao, descricao, usuario_nome, created_at FROM logs_fase_interna
        WHERE licitacao_id::text = $1 AND acao::text = ANY($2::text[]) ORDER BY created_at DESC LIMIT 40`,
      [
        licitacaoId,
        ['ETAPA_ALTERADA', 'TAREFA_CRIADA', 'TAREFA_CONCLUIDA', 'TAREFA_CANCELADA', 'TAREFA_REATRIBUIDA', 'ETAPA_REABERTA', 'ETAPA_REVISADA', 'ETAPA_REGISTRADA', 'DEMANDA_APROVADA', 'PARECER_DISPENSADO',
          // F4a: IA em toda etapa — rascunho gerado, aceito ou descartado e quem revisou na emissão
          'IA_RASCUNHO_GERADO', 'IA_RASCUNHO_ACEITO', 'IA_RASCUNHO_DESCARTADO', 'IA_REVISADA_POR',
          // Construtor de fluxo: condição respondida e devolução por uma aprovação
          'CONDICAO_RESPONDIDA', 'ETAPA_DEVOLVIDA'],
      ],
    );
    const atual = etapaAtual(etapas);

    // F1: modelo usado, aprovação da demanda, parecer dispensado, desenho e permissões
    const f = fluxo.ctx?.fluxo ?? null;
    const ap = fluxo.modelo.aprovacao_demanda;
    const [pj] = await this.ds.query(
      `SELECT dados_estruturados->'parecer_dispensado' AS dispensa FROM documentos_fase_interna
        WHERE licitacao_id::text = $1 AND tipo::text = 'PJ' AND versao_atual = true AND (dados_estruturados->>'nao_se_aplica')::boolean IS TRUE LIMIT 1`,
      [licitacaoId],
    );
    const nomesAprovador = {
      setor: ap.aprovador.tipo === 'SETOR' && ap.aprovador.valor ? await this.nomeDoSetor(ap.aprovador.valor) : null,
      usuario: ap.aprovador.tipo === 'USUARIO' && ap.aprovador.valor ? await this.nomeDoAtor(ap.aprovador.valor) : null,
    };
    const conduz = ator ? await this.podeConduzirProcesso(ator, licitacaoId) : false;
    const aprovada = fluxo.estado.demanda_aprovada !== false;
    const interna = FASES_INTERNAS.includes(lic.fase);
    // "Aprovar a demanda" só com a demanda FORMALIZADA (DFD pronto) — antes, o botão fica desabilitado com o motivo
    const passoDemanda = passosDasEtapas(etapas).find((x) => x.passo === ap.etapa);
    const dfdPronto = !!passoDemanda && passoDemanda.pecas.length > 0 && passoDemanda.pecas.every((x) => x.pronta);
    const ehAprovador = !!ator && interna && !!ap.exigida && !aprovada && (await this.podeAprovarDemanda(ator, licitacaoId, fluxo.modelo));
    const parecer = fluxo.modelo.etapas.find((e) => e.codigo === PassoFaseInterna.PARECER);
    return {
      modo: config.modo,
      controle_interno_ativo: !!fluxo.modelo.etapas.find((e) => e.codigo === PassoFaseInterna.CONTROLE_INTERNO)?.ligada,
      etapa_atual: atual?.etapa ?? null,
      concluidas: etapas.filter((e) => e.situacao === 'CONCLUIDA').length,
      total: etapas.length,
      etapas: saida,
      historico,
      modelo: {
        id: fluxo.modelo.id,
        nome: f?.modelo_nome ?? fluxo.modelo.nome,
        versao: f?.modelo_versao ?? fluxo.modelo.versao,
        tipo_processo: f?.tipo_processo ?? fluxo.modelo.tipo_processo,
        snapshot_em: f?.snapshot_em ?? null,
        legado: !!f?.legado,
      },
      aprovacao_demanda: {
        exigida: !!ap.exigida,
        aprovada,
        etapa: ap.etapa,
        registro: f?.aprovacao_demanda ?? null,
        aprovador: { ...ap.aprovador, rotulo: this.modeloFluxo.rotuloAprovador(ap.aprovador, nomesAprovador) },
        pode_aprovar: ehAprovador && dfdPronto,
        /** Quem aprova vê o botão; sem o DFD pronto, desabilitado com o motivo. */
        eh_aprovador: ehAprovador,
        dfd_pronto: dfdPronto,
        motivo_bloqueio: ehAprovador && !dfdPronto ? 'A demanda ainda não foi formalizada — o DFD precisa estar pronto (feito, anexado ou assinado) para ser aprovado.' : null,
      },
      parecer: {
        dispensavel_por_ato: !!parecer?.dispensavel_por_ato && fluxo.modelo.tipo_processo !== 'LICITACAO',
        dispensa: pj?.dispensa ?? null,
      },
      desenho: niveisDoGrafo(fluxo.modelo.etapas.filter((e) => etapas.some((x) => x.passos.some((p) => p.passo === e.codigo)))),
      permissoes: { conduzir: conduz && interna, reabrir: conduz && interna, dispensar_parecer: conduz && interna },
      /** Isolamento das peças: quem está vendo pode trabalhar em cada etapa do modelo? (todas as etapas, inclusive as sem peça na instrução) */
      permissoes_trabalho: permissoes,
    };
  }

  private async nomeDoSetor(id: string): Promise<string | null> {
    const [s] = ehUuid(id) ? await this.ds.query(`SELECT nome FROM setores WHERE id::text = $1`, [id]) : [];
    return s?.nome ?? null;
  }

  // ==========================================================================
  // MIGRAÇÃO DE BOOT
  // ==========================================================================

  /**
   * Cria as tarefas abertas dos processos que já estão na fase interna
   * (e acerta as de processos que saíram dela). Idempotente: rodar de novo não
   * cria nada. Sem notificação (não é tarefa "nova" para ninguém).
   */
  async migrarProcessosExistentes(): Promise<{ processos: number; criadas: number }> {
    let criadas = 0;
    const ids = await this.processosParaSincronizar(null);
    for (const id of ids) {
      try {
        const r = await this.sincronizar(id, { notificar: false });
        criadas += r?.criadas ?? 0;
      } catch (e: any) {
        this.logger.warn(`Migração de tarefas: processo ${id} não sincronizado: ${e?.message ?? e}`);
      }
    }
    return { processos: ids.length, criadas };
  }
}
