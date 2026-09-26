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
import { ConfigFaseInternaEfetiva, configEfetiva, papelValido, validarConfiguracao } from './configuracao-fase-interna';
import {
  DEFINICAO_PASSO,
  EtapaCalculada,
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
import {
  Responsavel,
  chaveDoPasso,
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

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(Tarefa) private readonly tarefaRepo: Repository<Tarefa>,
    @InjectRepository(ConfiguracaoFaseInterna) private readonly configRepo: Repository<ConfiguracaoFaseInterna>,
    private readonly faseInterna: FaseInternaService,
    private readonly auditLog: AuditLogService,
    @Optional() private readonly notificacoes?: NotificacoesService,
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
  agendar(licitacaoId: string, atrasoMs = 0): Promise<void> {
    if (!this.ativo()) return Promise.resolve();
    const atual = this.filas.get(licitacaoId);
    if (atual) {
      atual.repetir = true;
      return atual.promessa;
    }
    const estado = { repetir: false, promessa: Promise.resolve() };
    estado.promessa = (async () => {
      try {
        if (atrasoMs > 0) await new Promise((r) => setTimeout(r, atrasoMs));
        do {
          estado.repetir = false;
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

  async configuracao(orgaoId: string): Promise<ConfigFaseInternaEfetiva> {
    const linha = await this.configRepo.findOne({ where: { orgao_id: orgaoId } });
    return configEfetiva(orgaoId, linha);
  }

  async configuracaoParaTela(orgaoId: string) {
    const config = await this.configuracao(orgaoId);
    const setores: Array<{ id: string; nome: string; codigo: string }> = await this.ds.query(
      `SELECT id::text AS id, nome, codigo FROM setores WHERE orgao_id::text = $1 ORDER BY nome`,
      [orgaoId],
    );
    return {
      ...config,
      setores,
      papeis: Object.entries(ROTULO_PAPEL).map(([codigo, rotulo]) => ({ codigo, rotulo })),
      passos: (Object.values(PassoFaseInterna) as PassoFaseInterna[]).map((p) => ({
        passo: p,
        etapa: DEFINICAO_PASSO[p].etapa,
        etapa_titulo: TITULO_ETAPA[DEFINICAO_PASSO[p].etapa],
        titulo: DEFINICAO_PASSO[p].titulo,
        papel_padrao: DEFINICAO_PASSO[p].papel_padrao,
        prazo_padrao: DEFINICAO_PASSO[p].prazo_padrao,
      })),
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
    const existente = await this.configRepo.findOne({ where: { orgao_id: orgaoId } });
    await this.configRepo.save(
      this.configRepo.merge(existente ?? this.configRepo.create({ orgao_id: orgaoId }), {
        ...r.valores,
        atualizado_por_id: autor.id,
        atualizado_por_nome: autor.nome,
      }),
    );
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

  async sincronizarOrgao(orgaoId: string): Promise<void> {
    // Pela fila de cada processo (erros já são tratados/logados no agendar)
    for (const id of await this.processosParaSincronizar(orgaoId)) await this.agendar(id);
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
    const etapas = etapasDaFaseInterna(
      { contratacao_direta: instrucao.contratacao_direta, fase: lic.fase, situacao: lic.situacao },
      instrucao.itens,
      config,
    );
    const passos = passosDasEtapas(etapas);
    const abertas = await this.tarefaRepo.find({ where: { licitacao_id: licitacaoId, status: 'ABERTA' } });

    const agente = await this.usuarioAtivoDoOrgao(lic.pregoeiro_id, lic.orgao_id);
    const criador = agente ? null : await this.criadorDoProcesso(licitacaoId, lic.orgao_id);
    const responsavelDe = (p: PassoFaseInterna) => responsavelDoPasso(p, config, { agente_id: agente, criador_usuario_id: criador });

    const plano = planejarSincronizacao(passos, abertas, responsavelDe, {
      processo_encerrado: SITUACOES_ENCERRAM_TUDO.includes(lic.situacao) && FASES_INTERNAS.includes(lic.fase),
    });

    const agora = new Date();
    const cal = calendarioDoOrgao(lic.orgao_id);
    let criadas = 0;

    for (const { passo, responsavel } of plano.criar) {
      const dias = config.prazos[passo.passo] ?? null;
      const tipoPeca = passo.peca_pendente ?? passo.pecas[0]?.tipo ?? null;
      const valores: Partial<Tarefa> = {
        orgao_id: lic.orgao_id,
        licitacao_id: licitacaoId,
        documento_id: passo.pecas.find((p) => p.tipo === tipoPeca)?.documento_id ?? null,
        tipo_peca: tipoPeca,
        etapa: passo.etapa,
        passo: passo.passo,
        chave: chaveDoPasso(passo.passo),
        tipo: passo.passo === PassoFaseInterna.PUBLICACAO ? 'PUBLICACAO' : 'PECA',
        origem: 'ETAPA',
        titulo: passo.titulo,
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
      if (opcoes.notificar !== false) await this.notificar(lic, { ...valores, id } as Tarefa, 'nova');
    }

    for (const { tarefa_id, passo } of plano.concluir) {
      const autor = await this.quemCumpriuPasso(licitacaoId, passo);
      const r = await this.ds.query(
        `UPDATE tarefas SET status = 'CONCLUIDA', concluida_em = now(), concluida_por_id = $2, concluida_por_nome = $3, updated_at = now()
          WHERE id::text = $1 AND status = 'ABERTA' RETURNING id`,
        [tarefa_id, autor.id, autor.nome],
      );
      if (!Number(r?.[1])) continue; // outra sincronização já concluiu
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
    return { etapas, config, criadas };
  }

  private descricaoDaTarefa(lic: { numero_processo: string; objeto: string | null }, passo: PassoCalculado): string {
    const objeto = String(lic.objeto ?? '').trim();
    const cabeca = `Processo ${lic.numero_processo}${objeto ? ` — ${objeto.length > 140 ? `${objeto.slice(0, 137)}…` : objeto}` : ''}.`;
    if (passo.passo === PassoFaseInterna.PUBLICACAO) {
      return `${cabeca} Confira o checklist de pré-publicação e publique o aviso/edital.`;
    }
    const pecas = passo.pecas.map((p) => p.titulo).join('; ');
    return `${cabeca} Peças: ${pecas}. Faça aqui, anexe o PDF feito fora ou marque "não se aplica" quando a lei permitir.`;
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

  private async notificar(lic: { id: string; numero_processo: string }, t: Tarefa, motivo: 'nova' | 'reatribuida') {
    if (!this.notificacoes || process.env.FASE_INTERNA_TAREFAS_NOTIFICAR === 'false') return;
    try {
      const para: Array<{ id: string; email?: string; telefone?: string }> = await this.destinatarios(t);
      if (!para.length) return;
      const link = `/orgao/processos/${lic.id}${t.tipo_peca ? `#peca-${t.tipo_peca}` : '#fluxo-fase-interna'}`;
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
    const [cMim, cOutros] = await Promise.all([contar(paraMim), contar(aguardando)]);

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
      contagem: { para_mim: cMim.n, atrasadas: cMim.atrasadas, aguardando: cOutros.n },
      prazos_semana: prazosSemana,
      perfil: { usuario_id: p.usuarioId, papeis: p.papeis, setor_id: p.setorId, orgao: p.orgao, admin: p.adminOrgao },
    };
  }

  /** Contagem para o badge do menu. */
  async contagem(ator: Ator, orgaoInformado?: string) {
    await this.aguardarPendentes();
    const p = await this.perfil(ator, orgaoInformado);
    const f = this.filtroParaMim(p, 2);
    const [r] = await this.ds.query(
      `SELECT COUNT(*)::int AS para_mim, COUNT(*) FILTER (WHERE t.prazo < now())::int AS atrasadas
         FROM tarefas t JOIN licitacoes l ON l.id = t.licitacao_id
        WHERE t.orgao_id::text = $1 AND t.status = 'ABERTA' AND ${f.sql}`,
      [p.orgaoId, ...f.params],
    );
    return r;
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
      destino: `/orgao/processos/${t.licitacao_id}${t.tipo_peca ? `#peca-${t.tipo_peca}` : '#fluxo-fase-interna'}`,
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

  async etapasDoProcesso(licitacaoId: string) {
    // Sincroniza (pela fila do processo — nada em paralelo) e recalcula para a tela
    await this.agendar(licitacaoId);
    const [lic] = await this.ds.query(
      `SELECT orgao_id::text AS orgao_id, fase::text AS fase, situacao::text AS situacao, pregoeiro_id::text AS pregoeiro_id FROM licitacoes WHERE id::text = $1`,
      [licitacaoId],
    );
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    const config = await this.configuracao(lic.orgao_id);
    const instrucao = await this.faseInterna.getInstrucao(licitacaoId);
    const etapas = etapasDaFaseInterna(
      { contratacao_direta: instrucao.contratacao_direta, fase: lic.fase, situacao: lic.situacao },
      instrucao.itens,
      config,
    );

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

    const saida: any[] = [];
    for (const e of etapas) {
      const passos: any[] = [];
      for (const p of e.passos) {
        const daChave = tarefas.filter((t) => t.chave === chaveDoPasso(p.passo));
        const tarefa = daChave.find((t) => t.status === 'ABERTA') ?? daChave[daChave.length - 1] ?? null;
        const previsto = responsavelDoPasso(p.passo, config, { agente_id: agente, criador_usuario_id: criador });
        passos.push({
          ...p,
          tarefa: tarefa ? this.paraTela(tarefa, perfilNeutro, agora) : null,
          responsavel_previsto: { ...previsto, rotulo: await nomeResp(previsto) },
          prazo_dias_uteis: config.prazos[p.passo] ?? null,
        });
      }
      saida.push({ ...e, passos });
    }
    const historico = await this.ds.query(
      `SELECT acao::text AS acao, descricao, usuario_nome, created_at FROM logs_fase_interna
        WHERE licitacao_id::text = $1 AND acao::text = ANY($2::text[]) ORDER BY created_at DESC LIMIT 40`,
      [licitacaoId, ['ETAPA_ALTERADA', 'TAREFA_CRIADA', 'TAREFA_CONCLUIDA', 'TAREFA_CANCELADA', 'TAREFA_REATRIBUIDA']],
    );
    const atual = etapaAtual(etapas);
    return {
      modo: config.modo,
      controle_interno_ativo: config.controle_interno_ativo,
      etapa_atual: atual?.etapa ?? null,
      concluidas: etapas.filter((e) => e.situacao === 'CONCLUIDA').length,
      total: etapas.length,
      etapas: saida,
      historico,
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
