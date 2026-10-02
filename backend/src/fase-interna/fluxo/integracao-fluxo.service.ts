import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Ator } from '../../auth/acesso/ator';
import { ehUuid } from '../../auth/acesso/acesso-licitacao.service';
import { ehFaseInterna } from '../../licitacoes/transicoes/fases';
import { MovimentacaoTramitacao, TramitacaoService } from '../tramitacao.service';
import { PassoFaseInterna, etapaAtual, passosDasEtapas } from '../tarefas/etapas-fase-interna';
import type { Responsavel } from '../tarefas/tarefa-regras';
import { PosseVigente, ResultadoSincronizacao, TarefasService } from '../tarefas/tarefas.service';
import { AcaoNaConclusao, acaoNaConclusao, finalidadeDasEtapas, passoParaFazer, sugerirEnvio } from './proximo-destino';

/** Tarefa "Enviar o processo para …" (modo POR_SETOR) — uma aberta por processo. */
export const CHAVE_TAREFA_ENVIAR = 'tramitacao:enviar';
/** Tarefa(s) "Aprovar a demanda" — `demanda:aprovar` ou `demanda:aprovar:<usuário>`. */
export const PREFIXO_TAREFA_APROVAR = 'demanda:aprovar';

const SITUACOES_VIVAS = ['ATIVA', 'SUSPENSA'];

/**
 * INTEGRAÇÃO TRAMITAÇÃO ↔ TAREFAS (F3a — plano §2, §6 e §10).
 *
 * A POSSE dos autos (tramitação) é de UM setor/pessoa por vez; as TAREFAS
 * continuam vindo das etapas do modelo (etapas paralelas de setores
 * diferentes geram tarefa para cada um). Esta rotina roda na fila de cada
 * processo, logo depois da sincronização das tarefas:
 *  - posse inicial: processo na fase interna sem nenhuma tramitação → fica
 *    com quem conduz a etapa atual (registro do sistema, sem aviso e sem folha);
 *  - etapas do detentor concluídas e a próxima é de outro setor/pessoa:
 *    modo SIMPLES → envio automático com despacho padrão (decisão 1 do dono);
 *    modo POR_SETOR → tarefa ao detentor "Enviar o processo para …";
 *  - "Aprovar a demanda": tarefa ao aprovador designado no modelo enquanto a
 *    DFD pronta aguarda a aprovação (concluída na aprovação; cancelada se a
 *    aprovação deixar de ser exigida).
 * A chegada ao destino (tarefas das etapas dele passam ao destino) é feita
 * pela própria sincronização (`responsavelNaPosse`), agendada a cada envio.
 *
 * Desligar: FASE_INTERNA_TRAMITACAO_INTEGRADA=false.
 */
@Injectable()
export class IntegracaoFluxoService {
  private readonly logger = new Logger(IntegracaoFluxoService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tarefas: TarefasService,
    private readonly tramitacao: TramitacaoService,
  ) {
    tarefas.registrarDepoisDeSincronizar((r) => this.depoisDeSincronizar(r));
    // Envio manual espera a sincronização em curso (a posse inicial não corre em paralelo)
    tramitacao.registrarAntesDeMovimentar((id) => tarefas.aguardarProcesso(id));
    tramitacao.registrarAoMovimentar((m) => this.aoMovimentar(m));
  }

  ativo(): boolean {
    return process.env.FASE_INTERNA_TRAMITACAO_INTEGRADA !== 'false';
  }

  // ==========================================================================
  // DEPOIS DA SINCRONIZAÇÃO (na fila do processo)
  // ==========================================================================

  async depoisDeSincronizar(r: ResultadoSincronizacao): Promise<void> {
    if (!this.ativo()) return;
    const viva = ehFaseInterna(r.lic.fase) && SITUACOES_VIVAS.includes(r.lic.situacao ?? 'ATIVA');
    await this.tarefaDeAprovacao(r, viva);
    if (!viva) {
      await this.tarefas.cancelarTarefaPorChave(r.lic.id, CHAVE_TAREFA_ENVIAR, 'A fase interna foi encerrada.');
      return;
    }
    if (!r.posse) {
      // Processo novo — ou antigo, sem nenhuma tramitação: a posse inicial (nada mais nesta rodada)
      await this.posseInicial(r);
      return;
    }
    const possiveis = await this.tarefas.destinosPossiveisDoProcesso(r.lic.orgao_id, r.modelo, r.config.modo, r.condutor_id, r.destinos);
    const sugestao = sugerirEnvio(r.passos, r.destinos, r.posse, possiveis);
    if (sugestao.pendentes_do_detentor.length || !sugestao.destinos.length) {
      await this.tarefas.cancelarTarefaPorChave(
        r.lic.id,
        CHAVE_TAREFA_ENVIAR,
        sugestao.pendentes_do_detentor.length ? 'Quem está com o processo voltou a ter etapa a fazer.' : 'Nenhuma etapa aguarda outro setor.',
      );
    }
    // Migração de boot: nada se move sozinho nem avisa
    if (!r.notificar) return;
    const acao = acaoNaConclusao(r.config.modo, r.concluidas.map((c) => c.passo), sugestao, r.posse);
    if (acao.tipo === 'ENVIAR_AUTOMATICO') await this.enviarAutomatico(r, acao, r.posse);
    else if (acao.tipo === 'TAREFA_ENVIAR') await this.tarefaEnviar(r, acao, r.posse);
  }

  /** Posse inicial: com quem conduz a etapa atual (destino do modelo; sem ele, o condutor). */
  private async posseInicial(r: ResultadoSincronizacao): Promise<void> {
    const atual = etapaAtual(r.etapas);
    const passo = atual?.passos.find(passoParaFazer) ?? r.passos.find(passoParaFazer);
    if (!passo) return;
    let destino = r.destinos[passo.passo] ?? (r.condutor_id ? { setor_id: null, usuario_id: r.condutor_id, rotulo: '' } : null);
    let finalidade = finalidadeDasEtapas([passo.titulo]);
    // Processo aberto pelo DFD consolidado: o DFD já foi montado pelo planejamento e só
    // falta emitir — o processo fica com quem o abriu, não volta ao setor demandante.
    if (passo.passo === 'DFD' && r.condutor_id && (await this.dfdVeioDoConsolidado(r.lic.id))) {
      destino = { setor_id: null, usuario_id: r.condutor_id, rotulo: '' };
      finalidade = 'conferir e emitir o DFD montado a partir das demandas aprovadas';
    }
    if (!destino) return;
    try {
      const t = await this.tramitacao.registrarPosseInicial(r.lic.id, { setor_id: destino.setor_id, usuario_id: destino.usuario_id }, { finalidade });
      if (t) void this.tarefas.agendar(r.lic.id);
    } catch (e: any) {
      this.logger.warn(`Posse inicial do processo ${r.lic.id} não registrada: ${e?.message ?? e}`);
    }
  }

  private async dfdVeioDoConsolidado(licitacaoId: string): Promise<boolean> {
    try {
      const [d] = await this.ds.query(
        `SELECT 1 AS ok FROM documentos_fase_interna
          WHERE licitacao_id::text = $1 AND tipo::text = 'DFD' AND versao_atual = true AND dados_estruturados ? '_dfd_consolidado' LIMIT 1`,
        [licitacaoId],
      );
      return !!d;
    } catch {
      return false;
    }
  }

  /** Quem "envia" no envio automático: quem concluiu a etapa (usuário ativo do órgão), senão o órgão. */
  private async atorDoEnvio(r: ResultadoSincronizacao): Promise<Ator> {
    for (const c of [...r.concluidas].reverse()) {
      if (!c.autor.id || !ehUuid(c.autor.id)) continue;
      const [u] = await this.ds.query(`SELECT id::text AS id, role::text AS role FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2 AND ativo = true`, [c.autor.id, r.lic.orgao_id]);
      if (u) return { tipo: 'USUARIO', id: u.id, orgaoId: r.lic.orgao_id, usuarioId: u.id, fornecedorId: null, admin: false, role: u.role ?? null };
    }
    return { tipo: 'ORGAO', id: r.lic.orgao_id, orgaoId: r.lic.orgao_id, usuarioId: null, fornecedorId: null, admin: false, role: null };
  }

  /** Prazo do envio: o maior prazo (dias úteis) entre as etapas do destino, pelo modelo. */
  private prazoDasEtapas(r: ResultadoSincronizacao, codigos: string[]): number | null {
    const prazos = r.modelo.etapas.filter((e) => codigos.includes(e.codigo)).map((e) => e.prazo_dias_uteis ?? 0);
    const max = Math.max(0, ...prazos);
    return max > 0 ? max : null;
  }

  private async enviarAutomatico(r: ResultadoSincronizacao, acao: Extract<AcaoNaConclusao, { tipo: 'ENVIAR_AUTOMATICO' }>, posse: PosseVigente) {
    const etapas = acao.destino.etapas.map(([c]) => c);
    try {
      await this.tramitacao.enviar({
        licitacaoId: r.lic.id,
        para: { setor_id: acao.destino.setor_id, usuario_id: acao.destino.usuario_id },
        automatico: true,
        finalidade: acao.finalidade,
        etapas,
        prazo_dias_uteis: this.prazoDasEtapas(r, etapas),
        se_vigente: posse.tramitacao_id,
        ator: await this.atorDoEnvio(r),
      });
    } catch (e: any) {
      this.logger.warn(`Envio automático do processo ${r.lic.id} não feito: ${e?.message ?? e}`);
    }
  }

  private async tarefaEnviar(r: ResultadoSincronizacao, acao: Extract<AcaoNaConclusao, { tipo: 'TAREFA_ENVIAR' }>, posse: PosseVigente) {
    const [primeira] = acao.destino.etapas[0];
    const nomes = acao.destino.etapas.map(([, n]) => n).join(', ');
    const responsavel: Responsavel = posse.usuario_id
      ? { usuario_id: posse.usuario_id, papel: null, setor_id: null }
      : { usuario_id: null, papel: null, setor_id: posse.setor_id };
    await this.tarefas.criarTarefaDoSistema(r.lic.id, {
      chave: CHAVE_TAREFA_ENVIAR,
      passo: primeira as PassoFaseInterna,
      titulo: `Enviar o processo para ${acao.destino.rotulo} (${nomes})`.slice(0, 250),
      descricao:
        `Processo ${r.lic.numero_processo}. As etapas de quem está com o processo terminaram: envie-o para ${acao.destino.rotulo} (${nomes}) ` +
        `pelo topo da tela do processo. Despacho sugerido: "${acao.despacho}"`,
      origem: 'TRAMITACAO',
      tipo: 'OUTRO',
      responsavel,
      prazo_dias_uteis: null,
    });
  }

  // ==========================================================================
  // APROVAR A DEMANDA
  // ==========================================================================

  private async tarefaDeAprovacao(r: ResultadoSincronizacao, viva: boolean): Promise<void> {
    const ap = r.modelo.aprovacao_demanda;
    const abertas: Array<{ chave: string }> = await this.ds.query(
      `SELECT chave FROM tarefas WHERE licitacao_id::text = $1 AND status = 'ABERTA' AND (chave = $2 OR chave LIKE $3)`,
      [r.lic.id, PREFIXO_TAREFA_APROVAR, `${PREFIXO_TAREFA_APROVAR}:%`],
    );
    const passo = r.passos.find((p) => p.passo === ap?.etapa);
    const aprovada = r.estado.demanda_aprovada !== false;
    const precisa = viva && !!ap?.exigida && !aprovada && !!passo?.aguardando_aprovacao;
    if (!precisa) {
      if (!abertas.length) return;
      if (viva && ap?.exigida && aprovada) {
        const [f] = r.ctx?.fluxo.id ? await this.ds.query(`SELECT aprovacao_demanda FROM fluxos_processo_fase_interna WHERE id::text = $1`, [r.ctx.fluxo.id]) : [];
        const reg = f?.aprovacao_demanda ?? {};
        for (const a of abertas) await this.tarefas.concluirTarefaPorChave(r.lic.id, a.chave, { id: reg.por_id ?? null, nome: reg.por_nome ?? null });
      } else {
        const motivo = !viva ? 'A fase interna foi encerrada.' : !ap?.exigida ? 'O modelo de fluxo deixou de exigir a aprovação da demanda.' : 'A demanda voltou a ser elaborada.';
        for (const a of abertas) await this.tarefas.cancelarTarefaPorChave(r.lic.id, a.chave, motivo);
      }
      return;
    }
    const alvos = await this.aprovadores(r);
    for (const a of abertas) {
      if (!alvos.some((x) => x.chave === a.chave)) await this.tarefas.cancelarTarefaPorChave(r.lic.id, a.chave, 'O aprovador designado no modelo mudou.');
    }
    const objeto = String(r.lic.objeto ?? '').trim();
    for (const alvo of alvos) {
      await this.tarefas.criarTarefaDoSistema(r.lic.id, {
        chave: alvo.chave,
        passo: ap.etapa as PassoFaseInterna,
        titulo: 'Aprovar a demanda',
        descricao:
          `Processo ${r.lic.numero_processo}${objeto ? ` — ${objeto.length > 140 ? `${objeto.slice(0, 137)}…` : objeto}` : ''}. ` +
          'A demanda (DFD) está pronta e aguarda a sua aprovação na Central de Aprovações (aba "Demandas e DFD"). As demais etapas só abrem depois dela.',
        origem: 'APROVACAO',
        tipo: 'OUTRO',
        responsavel: alvo.responsavel,
        prazo_dias_uteis: null,
        notificar: r.notificar,
      });
    }
  }

  /** Quem recebe a tarefa de aprovação, pelo aprovador do modelo (PERMISSAO: cada um que pode aprovar demandas). */
  private async aprovadores(r: ResultadoSincronizacao): Promise<Array<{ chave: string; responsavel: Responsavel }>> {
    const a = r.modelo.aprovacao_demanda.aprovador;
    const vazio: Responsavel = { usuario_id: null, papel: null, setor_id: null };
    if (a.tipo === 'PAPEL' && a.valor) return [{ chave: PREFIXO_TAREFA_APROVAR, responsavel: { ...vazio, papel: a.valor } }];
    if (a.tipo === 'SETOR' && a.valor) return [{ chave: PREFIXO_TAREFA_APROVAR, responsavel: { ...vazio, setor_id: a.valor } }];
    if (a.tipo === 'USUARIO' && a.valor) return [{ chave: PREFIXO_TAREFA_APROVAR, responsavel: { ...vazio, usuario_id: a.valor } }];
    const linhas: Array<{ id: string }> = await this.ds.query(
      `SELECT id::text AS id FROM usuarios WHERE orgao_id::text = $1 AND ativo = true AND pode_aprovar_demandas = true ORDER BY nome LIMIT 10`,
      [r.lic.orgao_id],
    );
    const ids = linhas.map((l) => l.id);
    // Modo simples: quem conduz o processo também aprova (mesma regra de `ehAprovador`)
    if (r.config.modo !== 'POR_SETOR' && r.condutor_id && !ids.includes(r.condutor_id)) ids.push(r.condutor_id);
    if (!ids.length) return [{ chave: PREFIXO_TAREFA_APROVAR, responsavel: vazio }]; // login do órgão
    return ids.map((id) => ({ chave: `${PREFIXO_TAREFA_APROVAR}:${id}`, responsavel: { ...vazio, usuario_id: id } }));
  }

  // ==========================================================================
  // MOVIMENTAÇÃO DA POSSE
  // ==========================================================================

  /** Envio/devolução gravado: a tarefa "Enviar o processo" conclui; a sincronização leva as tarefas ao destino. */
  async aoMovimentar(m: MovimentacaoTramitacao): Promise<void> {
    if (!this.ativo()) return;
    await this.tarefas.concluirTarefaPorChave(m.licitacao_id, CHAVE_TAREFA_ENVIAR, { id: m.por.id, nome: m.por.nome });
    // Sem esperar: pode estar rodando DENTRO da fila do processo (envio automático)
    void this.tarefas.agendar(m.licitacao_id);
  }

  // ==========================================================================
  // SUGESTÃO DE ENVIO (contrato com a tela do processo — F3b)
  // ==========================================================================

  async sugestaoEnvio(licitacaoId: string, ator: Ator) {
    // Isolamento (outro órgão → 404) e "pode enviar": a mesma regra do envio
    const permissao = await this.tramitacao.permissaoDeEnvio(licitacaoId, ator);
    await this.tarefas.aguardarProcesso(licitacaoId);
    const [lic] = await this.ds.query(
      `SELECT orgao_id::text AS orgao_id, fase::text AS fase, situacao::text AS situacao FROM licitacoes WHERE id::text = $1`,
      [licitacaoId],
    );
    if (!lic) throw new NotFoundException('Processo não encontrado');
    const config = await this.tarefas.configuracao(lic.orgao_id);
    const { modelo } = await this.tarefas.modeloDoProcesso(licitacaoId, lic.orgao_id);
    const passos = passosDasEtapas(await this.tarefas.etapasCalculadas(licitacaoId, lic));
    const condutor = await this.tarefas.condutorDoProcesso(licitacaoId);
    const posse = await this.tarefas.posseAtual(licitacaoId);
    const destinos = await this.tarefas.destinosDoProcesso(lic.orgao_id, modelo, config.modo, condutor);
    const possiveis = await this.tarefas.destinosPossiveisDoProcesso(lic.orgao_id, modelo, config.modo, condutor, destinos);
    const s = sugerirEnvio(passos, destinos, posse, possiveis);
    const com = await this.tramitacao.comQuemEsta(licitacaoId);
    return {
      destinos: s.destinos.map((d) => ({ setor_id: d.setor_id, usuario_id: d.usuario_id, rotulo: d.rotulo, etapas: d.etapas, principal: d.principal, depois_de: d.depois_de ?? null })),
      despacho_sugerido: s.despacho_sugerido,
      finalidade: s.finalidade,
      pode_enviar: permissao.pode,
      ...(permissao.pode ? {} : { motivo_bloqueio: permissao.motivo ?? 'Só quem está com o processo (ou o administrador do órgão) envia.' }),
      // Extras para a tela (não fazem parte do contrato mínimo)
      modo: config.modo,
      com_quem:
        com.status === 'SEM_TRAMITACAO'
          ? null
          : { status: com.status, setor: com.setor, usuario: com.usuario, desde: com.desde, prazo: com.prazo, vencido: com.vencido },
      pendentes_do_detentor: s.pendentes_do_detentor,
      etapas_sem_destino: s.sem_destino,
    };
  }
}
