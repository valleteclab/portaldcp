import { ForbiddenException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Ator } from '../../auth/acesso/ator';
import { ehUuid } from '../../auth/acesso/acesso-licitacao.service';
import { ehFaseInterna } from '../../licitacoes/transicoes/fases';
import { AuditLogService } from '../audit-log.service';
import { AcaoLogFaseInterna } from '../entities/log-fase-interna.entity';
import { PassoCalculado, ROTULO_PAPEL, passoDaPeca, passosDasEtapas } from '../tarefas/etapas-fase-interna';
import { chaveDoPasso, responsavelDoPasso } from '../tarefas/tarefa-regras';
import { TarefasService, responsaveisDoModelo } from '../tarefas/tarefas.service';
import { EtapaDoModelo, ModeloFluxo, ResponsavelEtapa, dependenciasEfetivas } from './modelo-fluxo';
import { ModeloFluxoService } from './modelo-fluxo.service';
import { PerfilTrabalho, PosseParaTrabalho, ResultadoPermissao, avaliarPermissaoEtapa, ehCondutor, ehResponsavelPelaEtapa } from './permissao-etapa';

/** Documentos do órgão juntados ao processo (designação do agente e da equipe): fora da ordem das etapas. */
const DOCUMENTOS_DO_ORGAO = ['DP', 'DEA'];

/** Alvo de uma escrita: a etapa (código do modelo) ou o tipo da peça. */
export interface AlvoDaEscrita {
  passo?: string | null;
  tipo?: string | null;
}

export type ResultadoNaEtapa = ResultadoPermissao & { passo: string | null; titulo: string | null };

interface ContextoPermissao {
  licitacao_id: string;
  orgao_id: string;
  contratacao_direta: boolean;
  modo: string;
  modelo: ModeloFluxo;
  falta_aprovacao: boolean;
  aprovador_rotulo: string | null;
  passos: PassoCalculado[];
  posse: (PosseParaTrabalho & { chefe: string | null }) | null;
  agente: string | null;
  criador: string | null;
  tarefas: Array<{ chave: string; usuario_id: string | null }>;
  diligencias: string[];
  /** Signatários da autorização na configuração (a autoridade — respondem pela etapa da autorização). */
  signatarios: string[];
  setores: Map<string, { nome: string; chefe: string | null }>;
  nomes: Map<string, string>;
}

const OK: ResultadoNaEtapa = { pode: true, codigo: 'OK', motivo: null, por_privilegio: false, motivo_sem_privilegio: null, passo: null, titulo: null };

/**
 * PONTO ÚNICO DE VERIFICAÇÃO DO TRABALHO NAS PEÇAS (homologação multiusuário,
 * 27/09/2026 — E2 do relatório). Chamado pelo `TrabalhoNaEtapaGuard` em todos
 * os endpoints de escrita das telas da fase interna e pela tela (GET das
 * etapas: `pode_trabalhar` + `motivo`). A regra é a função pura
 * `avaliarPermissaoEtapa` (permissao-etapa.ts); aqui só se lê o banco.
 *
 * Só leitura: roda antes do ato, fora de qualquer transação. Espera a
 * sincronização do processo em curso (a aprovação da demanda da peça que
 * acabou de ser gravada entra no cálculo).
 */
@Injectable()
export class PermissaoEtapaService implements OnModuleInit {
  private readonly logger = new Logger(PermissaoEtapaService.name);
  /** Registro do trabalho "por privilégio" (administrador): um por processo, etapa e pessoa a cada 30 min. */
  private readonly registrados = new Map<string, number>();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tarefas: TarefasService,
    private readonly modeloFluxo: ModeloFluxoService,
    private readonly auditLog: AuditLogService,
  ) {}

  onModuleInit() {
    this.tarefas.registrarAvaliadorDePermissoes((licitacaoId, ator) => this.permissoesDoProcesso(licitacaoId, ator, { aguardar: false }));
  }

  // ==========================================================================
  // PERFIL (sempre do JWT + cadastro)
  // ==========================================================================

  async perfil(ator: Ator, orgaoId: string): Promise<PerfilTrabalho & { nome: string | null; rotulo_privilegio: string | null }> {
    if (ator.admin) return { privilegiado: true, usuario_id: null, papeis: [], setor_id: null, chefe_de: [], nome: 'Administrador da plataforma', rotulo_privilegio: 'administrador da plataforma' };
    if (ator.tipo === 'ORGAO') {
      const [o] = await this.ds.query(`SELECT nome FROM orgaos WHERE id::text = $1`, [orgaoId]);
      return { privilegiado: true, usuario_id: null, papeis: [], setor_id: null, chefe_de: [], nome: o?.nome ?? 'Órgão', rotulo_privilegio: 'login do órgão' };
    }
    const id = ator.usuarioId && ehUuid(ator.usuarioId) ? ator.usuarioId : null;
    const [u] = id
      ? await this.ds.query(
          `SELECT nome, role::text AS role, papeis_fase_interna AS papeis, setor_id::text AS setor_id, ativo FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2`,
          [id, orgaoId],
        )
      : [];
    if (!u || u.ativo === false) return { privilegiado: false, usuario_id: null, papeis: [], setor_id: null, chefe_de: [], nome: null, rotulo_privilegio: null };
    const chefias: Array<{ id: string }> = await this.ds.query(`SELECT id::text AS id FROM setores WHERE orgao_id::text = $1 AND chefe_usuario_id::text = $2`, [orgaoId, id]);
    return {
      privilegiado: u.role === 'ADMIN',
      usuario_id: id,
      papeis: Array.isArray(u.papeis) ? u.papeis : [],
      setor_id: u.setor_id ?? null,
      chefe_de: chefias.map((c) => c.id),
      nome: u.nome ?? null,
      rotulo_privilegio: u.role === 'ADMIN' ? 'administrador do órgão' : null,
    };
  }

  // ==========================================================================
  // CONTEXTO DO PROCESSO (uma leitura para todas as etapas)
  // ==========================================================================

  private async contexto(licitacaoId: string, opcoes: { aguardar: boolean }): Promise<ContextoPermissao | null> {
    if (!ehUuid(licitacaoId)) return null;
    const [lic] = await this.ds.query(
      `SELECT id::text AS id, orgao_id::text AS orgao_id, fase::text AS fase, situacao::text AS situacao, modalidade::text AS modalidade FROM licitacoes WHERE id::text = $1`,
      [licitacaoId],
    );
    // Fora da fase interna as telas não mudam peças da fase interna por aqui (ex.: parecer da fase externa)
    if (!lic?.orgao_id || !ehFaseInterna(lic.fase)) return null;
    if (opcoes.aguardar) await this.tarefas.aguardarProcesso(licitacaoId);
    const config = await this.tarefas.configuracao(lic.orgao_id);
    const fluxo = await this.tarefas.modeloDoProcesso(licitacaoId, lic.orgao_id);
    const passos = passosDasEtapas(await this.tarefas.etapasCalculadas(licitacaoId, lic, config));
    const ap = fluxo.modelo.aprovacao_demanda;
    const { agente, criador } = await this.tarefas.agenteECriador(licitacaoId);

    const setoresLinhas: Array<{ id: string; nome: string; chefe: string | null }> = await this.ds.query(
      `SELECT id::text AS id, nome, chefe_usuario_id::text AS chefe FROM setores WHERE orgao_id::text = $1`,
      [lic.orgao_id],
    );
    const setores = new Map(setoresLinhas.map((x) => [x.id, { nome: x.nome, chefe: x.chefe ?? null }]));
    const idsPessoas = [...new Set(fluxo.modelo.etapas.map((e) => e.responsavel.usuario_id).filter((x): x is string => !!x && ehUuid(x)))];
    const pessoas: Array<{ id: string; nome: string }> = idsPessoas.length
      ? await this.ds.query(`SELECT id::text AS id, nome FROM usuarios WHERE id::text = ANY($1::text[])`, [idsPessoas])
      : [];

    const [t] = await this.ds
      .query(
        `SELECT status::text AS status, para_setor_id::text AS setor_id, para_usuario_id::text AS usuario_id, para_setor_nome, para_usuario_nome
           FROM tramitacoes_processo WHERE licitacao_id::text = $1 ORDER BY sequencia DESC LIMIT 1`,
        [licitacaoId],
      )
      .catch(() => [] as any[]);
    const vigente = t && ['PENDENTE', 'RECEBIDA'].includes(t.status) && (t.setor_id || t.usuario_id) ? t : null;
    const posse = vigente
      ? {
          setor_id: vigente.setor_id ?? null,
          usuario_id: vigente.usuario_id ?? null,
          rotulo: [vigente.para_setor_nome, vigente.para_usuario_nome].filter(Boolean).join(' · ') || 'outro setor',
          chefe: vigente.setor_id ? setores.get(vigente.setor_id)?.chefe ?? null : null,
        }
      : null;

    const tarefas: Array<{ chave: string; usuario_id: string | null }> = await this.ds.query(
      `SELECT chave, responsavel_usuario_id::text AS usuario_id FROM tarefas WHERE licitacao_id::text = $1 AND status = 'ABERTA' AND chave LIKE 'etapa:%'`,
      [licitacaoId],
    );
    const diligencias: Array<{ tipo_alvo: string }> = await this.ds
      .query(`SELECT tipo_alvo FROM diligencias WHERE licitacao_id::text = $1 AND status = 'ABERTA'`, [licitacaoId])
      .catch(() => []);

    let aprovadorRotulo: string | null = null;
    if (ap?.exigida) {
      const nomes = {
        setor: ap.aprovador.tipo === 'SETOR' && ap.aprovador.valor ? setores.get(ap.aprovador.valor)?.nome ?? null : null,
        usuario: ap.aprovador.tipo === 'USUARIO' && ap.aprovador.valor ? await this.modeloFluxo.nomeDe(ap.aprovador.valor) : null,
      };
      aprovadorRotulo = this.modeloFluxo.rotuloAprovador(ap.aprovador, nomes);
    }
    return {
      licitacao_id: licitacaoId,
      orgao_id: lic.orgao_id,
      contratacao_direta: this.modeloFluxo.tipoDaModalidade(lic.modalidade) !== 'LICITACAO',
      modo: config.modo,
      modelo: fluxo.modelo,
      falta_aprovacao: !!ap?.exigida && fluxo.estado.demanda_aprovada === false,
      aprovador_rotulo: aprovadorRotulo,
      passos,
      posse,
      agente,
      criador,
      tarefas,
      diligencias: diligencias.map((d) => d.tipo_alvo),
      signatarios: (config.signatarios_autorizacao ?? []).map((x) => x.usuario_id).filter(Boolean),
      setores,
      nomes: new Map(pessoas.map((p) => [p.id, p.nome])),
    };
  }

  private rotuloResponsavel(r: ResponsavelEtapa, ctx: ContextoPermissao): string {
    if (r.usuario_id) return ctx.nomes.get(r.usuario_id) ?? 'uma pessoa designada';
    const partes: string[] = [];
    if (r.setor_id) partes.push(`do setor ${ctx.setores.get(r.setor_id)?.nome ?? 'designado'}`);
    if (r.papel) partes.push(`do papel ${ROTULO_PAPEL[r.papel as keyof typeof ROTULO_PAPEL] ?? r.papel}`);
    return partes.length ? `quem é ${partes.join(' ou ')}` : 'quem conduz o processo';
  }

  /** Dependências não concluídas de uma etapa que não está entre as ativas do processo (desligada ou sem peça). */
  private pendenciasFora(ctx: ContextoPermissao, etapa: EtapaDoModelo): string[] {
    const etapas = ctx.modelo.etapas.map((e) => (e.codigo === etapa.codigo ? { ...e, ligada: true } : e));
    const deps = dependenciasEfetivas(etapas).get(etapa.codigo) ?? [];
    return deps.filter((d) => {
      const p = ctx.passos.find((x) => x.passo === d);
      return !!p && p.situacao !== 'CONCLUIDO' && p.situacao !== 'NAO_REALIZADO';
    });
  }

  private avaliarNoContexto(ctx: ContextoPermissao, codigo: string, perfil: PerfilTrabalho): ResultadoNaEtapa {
    const etapa = ctx.modelo.etapas.find((e) => e.codigo === codigo);
    // Etapa fora do modelo ou desligada: a própria tela recusa (ex.: controle interno desativado → 409)
    if (!etapa || !etapa.ligada) return { ...OK, passo: codigo };
    const calc = ctx.passos.find((p) => p.passo === codigo);
    const titulo = (c: string) => ctx.modelo.etapas.find((e) => e.codigo === c)?.titulo ?? c;
    const aguardandoDemanda = calc ? calc.aguardando_demanda : ctx.falta_aprovacao && codigo !== ctx.modelo.aprovacao_demanda.etapa;
    const pendencias = (calc ? calc.pendencias : this.pendenciasFora(ctx, etapa)).map(titulo);
    const calculado = responsavelDoPasso(codigo, { modo: ctx.modo as any, responsaveis: responsaveisDoModelo(ctx.modelo) }, { agente_id: ctx.agente, criador_usuario_id: ctx.criador });
    const daTarefa = ctx.tarefas.filter((t) => t.chave === chaveDoPasso(codigo) && t.usuario_id).map((t) => ({ usuario_id: t.usuario_id }));
    // A autoridade configurada (signatários da autorização) responde pela etapa da autorização
    if (codigo === 'AUTORIZACAO') daTarefa.push(...ctx.signatarios.map((id) => ({ usuario_id: id })));
    const r = avaliarPermissaoEtapa(
      {
        etapa: { codigo, titulo: etapa.titulo, responsavel: etapa.responsavel },
        rotulo_responsavel: this.rotuloResponsavel(etapa.responsavel, ctx),
        alternativos: [calculado, ...daTarefa],
        aguardando_demanda: aguardandoDemanda,
        aprovador_demanda: ctx.aprovador_rotulo,
        pendencias,
        exigir_posse: ctx.modo === 'POR_SETOR' && ctx.modelo.exigir_posse_pecas !== false,
        posse: ctx.posse,
        chefe_da_posse: ctx.posse?.chefe ?? null,
        diligencia_aberta: etapa.tipos_peca.some((t) => ctx.diligencias.includes(t)),
      },
      perfil,
    );
    return { ...r, passo: codigo, titulo: etapa.titulo };
  }

  // ==========================================================================
  // API
  // ==========================================================================

  /** Etapa do alvo: o código informado ou a etapa do modelo que produz a peça. */
  private passoDoAlvo(ctx: ContextoPermissao, alvo: AlvoDaEscrita): string | null {
    if (alvo.passo) return alvo.passo;
    if (!alvo.tipo) return null;
    return passoDaPeca(String(alvo.tipo), ctx.contratacao_direta, ctx.modelo);
  }

  async avaliar(licitacaoId: string, alvo: AlvoDaEscrita, ator: Ator, opcoes: { aguardar?: boolean } = {}): Promise<ResultadoNaEtapa> {
    const ctx = await this.contexto(licitacaoId, { aguardar: opcoes.aguardar !== false });
    if (!ctx) return OK; // fora da fase interna (ou processo não encontrado): não é escrita numa etapa
    const perfil = await this.perfil(ator, ctx.orgao_id);
    const passo = this.passoDoAlvo(ctx, alvo);
    if (!passo) return this.avaliarForaDoModelo(ctx, perfil);
    if (alvo.tipo && DOCUMENTOS_DO_ORGAO.includes(String(alvo.tipo))) return this.avaliarDocumentoDoOrgao(ctx, passo, perfil);
    return this.avaliarNoContexto(ctx, passo, perfil);
  }

  /**
   * Peça que não pertence a nenhuma etapa do modelo do processo (tipo
   * genérico, peça de outro rito): não há responsável de etapa a consultar,
   * então só quem CONDUZ o processo a junta (a mesma regra de `exigirCondutor`).
   */
  private avaliarForaDoModelo(ctx: ContextoPermissao, perfil: PerfilTrabalho): ResultadoNaEtapa {
    if (ehCondutor(perfil, ctx)) return OK;
    const motivo = 'Esta peça não pertence a nenhuma etapa do fluxo: só quem conduz o processo (o agente de contratação, quem o criou, o administrador do órgão ou o login do órgão) pode juntá-la.';
    return { pode: false, codigo: 'FORA_DO_MODELO', motivo, por_privilegio: false, motivo_sem_privilegio: motivo, passo: null, titulo: null };
  }

  /**
   * DESIGNAÇÃO do agente e da equipe (portaria do exercício — documento do
   * ÓRGÃO, referenciado pelo processo): não segue a ordem das etapas (o
   * relatório do agente, antes da autorização, já a cita). Junta quem conduz o
   * processo ou quem responde pela etapa da autorização (a autoridade).
   */
  private avaliarDocumentoDoOrgao(ctx: ContextoPermissao, passo: string, perfil: PerfilTrabalho): ResultadoNaEtapa {
    const etapa = ctx.modelo.etapas.find((e) => e.codigo === passo);
    if (!etapa || perfil.privilegiado) return { ...OK, passo, titulo: etapa?.titulo ?? null };
    const conduz = !!perfil.usuario_id && (perfil.usuario_id === ctx.agente || perfil.usuario_id === ctx.criador);
    if (conduz || ehResponsavelPelaEtapa({ etapa, alternativos: [] }, perfil)) return { ...OK, passo, titulo: etapa.titulo };
    const motivo = `A designação do agente é juntada por quem conduz o processo ou por ${this.rotuloResponsavel(etapa.responsavel, ctx)}.`;
    return { pode: false, codigo: 'NAO_RESPONSAVEL', motivo, por_privilegio: false, motivo_sem_privilegio: motivo, passo, titulo: etapa.titulo };
  }

  /**
   * 403 com a explicação quando quem age não pode trabalhar na etapa. O
   * administrador/login do órgão passa, com o registro no histórico do
   * processo (uma vez por etapa e pessoa a cada 30 minutos).
   */
  async exigirPodeTrabalhar(licitacaoId: string, alvo: AlvoDaEscrita, ator: Ator, acao?: string): Promise<ResultadoNaEtapa> {
    const r = await this.avaliar(licitacaoId, alvo, ator);
    if (!r.pode) throw new ForbiddenException({ message: r.motivo, codigo: r.codigo, etapa: r.passo });
    if (r.por_privilegio && r.passo) await this.registrarPrivilegio(licitacaoId, r, ator, acao);
    return r;
  }

  private async registrarPrivilegio(licitacaoId: string, r: ResultadoNaEtapa, ator: Ator, acao?: string) {
    const chave = `${licitacaoId}|${r.passo}|${ator.usuarioId ?? ator.orgaoId ?? ator.id}`;
    const agora = Date.now();
    if ((this.registrados.get(chave) ?? 0) > agora - 30 * 60_000) return;
    this.registrados.set(chave, agora);
    if (this.registrados.size > 5000) this.registrados.clear();
    const [lic] = await this.ds.query(`SELECT orgao_id::text AS orgao_id FROM licitacoes WHERE id::text = $1`, [licitacaoId]);
    const perfil = await this.perfil(ator, lic?.orgao_id ?? '');
    await this.auditLog
      .log({
        licitacao_id: licitacaoId,
        acao: AcaoLogFaseInterna.ACAO_FORA_DA_RESPONSABILIDADE,
        descricao: `${perfil.nome ?? 'Administrador'} (${perfil.rotulo_privilegio ?? 'administrador'}) trabalhou na etapa "${r.titulo}"${acao ? ` (${acao})` : ''} fora da responsabilidade/posse: ${r.motivo_sem_privilegio ?? ''}`.slice(0, 2000),
        dados_depois: { etapa: r.passo, acao: acao ?? null, motivo: r.motivo_sem_privilegio },
        contexto: { usuario_id: ator.usuarioId ?? ator.orgaoId ?? undefined, usuario_nome: perfil.nome ?? undefined },
      })
      .catch((e: any) => this.logger.warn(`Registro do trabalho fora da responsabilidade não gravado: ${e?.message ?? e}`));
  }

  /**
   * Quem pode trabalhar em cada etapa do modelo (tela). `aguardar: false`
   * quando quem chama já sincronizou (GET das etapas).
   */
  async permissoesDoProcesso(licitacaoId: string, ator: Ator, opcoes: { aguardar?: boolean } = {}): Promise<Record<string, { pode_trabalhar: boolean; motivo: string | null; codigo: string }>> {
    const ctx = await this.contexto(licitacaoId, { aguardar: opcoes.aguardar !== false });
    if (!ctx) return {};
    const perfil = await this.perfil(ator, ctx.orgao_id);
    const saida: Record<string, { pode_trabalhar: boolean; motivo: string | null; codigo: string }> = {};
    for (const e of ctx.modelo.etapas) {
      const r = this.avaliarNoContexto(ctx, e.codigo, perfil);
      saida[e.codigo] = { pode_trabalhar: r.pode, motivo: r.motivo, codigo: r.codigo };
    }
    return saida;
  }

  /**
   * Ações do processo inteiro (assistente de criação, juntada em lote da fase
   * feita fora, copiloto que prepara todas as peças): só quem CONDUZ — o
   * agente designado, quem criou o processo (sem agente), o administrador e o
   * login do órgão.
   */
  async exigirCondutor(licitacaoId: string, ator: Ator, acao: string): Promise<void> {
    if (ator.admin || ator.tipo === 'ORGAO') return;
    const [lic] = ehUuid(licitacaoId) ? await this.ds.query(`SELECT orgao_id::text AS orgao_id FROM licitacoes WHERE id::text = $1`, [licitacaoId]) : [];
    if (!lic) return;
    const perfil = await this.perfil(ator, lic.orgao_id);
    if (perfil.privilegiado) return;
    if (ehCondutor(perfil, await this.tarefas.agenteECriador(licitacaoId))) return;
    throw new ForbiddenException(`Só quem conduz o processo (o agente de contratação, quem o criou, o administrador do órgão ou o login do órgão) pode ${acao}.`);
  }
}
