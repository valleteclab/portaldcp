import { despachoForaDoFluxo, ehEnvioForaDoFluxo, FINALIDADE_FORA_DO_FLUXO, JUSTIFICATIVA_MINIMA, justificativaForaDoFluxo, licitacaoConduzidaPeloFluxo } from '../workflow/ponte/ponte-fase-interna';
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import {
  TramitacaoProcesso,
  StatusTramitacao,
} from './entities/tramitacao-processo.entity';
import { AcaoLogFaseInterna } from './entities/log-fase-interna.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { Setor } from '../orgaos/entities/setor.entity';
import { AuditLogService, ContextoUsuario } from './audit-log.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { PrioridadeNotificacao, TipoNotificacao } from '../notificacoes/entities/notificacao.entity';
import type { Ator } from '../auth/acesso/ator';
import { ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { calendarioDoOrgao } from '../common/prazos/dias-uteis';
import { diretorioDeGravacao, resolverArquivoDeUrl } from '../common/arquivos/arquivos';
import { atribuirFolhasDespacho, contarPaginasPdf } from './folhas-autos';
import { gerarPdfDespacho } from './despacho-tramitacao-pdf';
import {
  EventoLinhaDoTempo,
  EventoPrazo,
  PerfilTramitacao,
  avisoDePrazoDevido,
  dataBrasilia,
  despachoDeAutuacao,
  despachoPadrao,
  ehDevolucao,
  escolherDestinatarios,
  momentoDoEnvio,
  montarLinhaDoTempo,
  podeAtuarNoDestino,
  prazoDaTramitacao,
  situacaoDoPrazo,
  validarDataOcorrencia,
} from './tramitacao-regras';

/** Corpo do POST `:licitacaoId/tramitar` (identidade SEMPRE do JWT — usuário do corpo é ignorado). */
export interface TramitarDto {
  para_setor_id?: string | null;
  para_usuario_id?: string | null;
  despacho?: string | null;
  finalidade?: string | null;
  /** Prazo em dias ÚTEIS (calendário do órgão). */
  prazo_dias_uteis?: number | null;
  /** LEGADO: o card antigo mandava `prazo_dias` — tratado como dias úteis. */
  prazo_dias?: number | null;
  /** Lançamento posterior: data (AAAA-MM-DD) ou data/hora ISO em que o envio OCORREU. */
  data_ocorrencia?: string | null;
  /** F3: etapas (códigos do modelo) para as quais o processo vai — as tarefas delas passam ao destino. */
  etapas?: string[] | null;
  /** Processo no fluxo desenhado: envio a outro setor como exceção, com justificativa (vai ao despacho). */
  justificativa_fora_do_fluxo?: string | null;
}

/** Serviço interno (F3): enviar o processo a um setor/pessoa. */
export interface EnviarTramitacaoParams {
  licitacaoId: string;
  para: { setor_id?: string | null; usuario_id?: string | null };
  /** Texto do despacho. Obrigatório, salvo `automatico` (ou `finalidade` informada). */
  despacho?: string | null;
  /** "a reserva orçamentária" → "Encaminhe-se ao(à) Contabilidade para a reserva orçamentária." */
  finalidade?: string | null;
  prazo_dias_uteis?: number | null;
  /** Envio do sistema (modo simples): despacho padrão e sem exigir que o ator esteja com o processo. */
  automatico?: boolean;
  data_ocorrencia?: string | Date | null;
  /** F3: etapas (códigos do modelo) para as quais o processo vai. */
  etapas?: string[] | null;
  /** F3: false = sem aviso de chegada (padrão: avisa). */
  notificar?: boolean;
  /** Processo no fluxo desenhado: envio a outro setor como exceção, com justificativa (vai ao despacho). */
  justificativa_fora_do_fluxo?: string | null;
  /**
   * F3 (envio automático): só envia se a tramitação vigente ainda for esta
   * (null = sem tramitação). Mudou no meio do caminho → 409, nada é gravado.
   */
  se_vigente?: string | null;
  ator: Ator;
  contexto?: ContextoUsuario;
}

/** Movimentação da posse (envio ou devolução) — para quem integra (tarefas, F3). */
export interface MovimentacaoTramitacao {
  licitacao_id: string;
  tipo: 'ENVIO' | 'DEVOLUCAO';
  tramitacao: TramitacaoProcesso;
  automatico: boolean;
  /** Quem movimentou (do JWT). */
  por: { id: string | null; nome: string };
}

export interface ComQuemEsta {
  tramitacao_id: string | null;
  status: StatusTramitacao | 'SEM_TRAMITACAO';
  setor: { id: string; nome: string | null } | null;
  usuario: { id: string; nome: string | null } | null;
  /** Desde quando está no destino (envio efetivo). */
  desde: string | null;
  recebido_em: string | null;
  recebido_por: string | null;
  prazo: string | null;
  prazo_dias_uteis: number | null;
  dias_uteis_restantes: number | null;
  vencido: boolean;
  de: { setor_nome: string | null; usuario_nome: string | null } | null;
  despacho: string | null;
  automatico: boolean;
  lancado_posteriormente: boolean;
  folha: { folha_inicial: number | null; folha_final: number | null; url: string } | null;
  /** F3: registro da posse inicial (autuação, sem folha). */
  posse_inicial: boolean;
  /** F3: etapas para as quais o processo foi enviado (null = pelo modelo). */
  etapas: string[] | null;
}

interface Perfil extends PerfilTramitacao {
  orgao_id: string;
}

const PASTA_DESPACHOS = 'licitacoes';
const url = (tramitacaoId: string) => `/api/fase-interna/tramitacoes/${tramitacaoId}/despacho`;

/**
 * TRAMITAÇÃO DO PROCESSO — a espinha da fase interna (estilo SEI).
 *
 *  - O processo está sempre com um setor (e, se houver, uma pessoa), desde uma
 *    data e com prazo em dias úteis (calendário do órgão).
 *  - Identidade SEMPRE do JWT (`Ator`) + cadastro do usuário (setor, cargo).
 *  - Receber/devolver: só quem é do setor de destino, a pessoa de destino, o
 *    chefe do setor ou o administrador do órgão. Enviar adiante: idem, sobre
 *    a tramitação vigente (o envio automático do sistema dispensa).
 *  - Cada envio/devolução gera o DESPACHO em PDF, que entra nos autos como
 *    folha (mesma sequência das peças — `folhas-autos.ts`).
 *  - Chegada: aviso interno + e-mail + WhatsApp com botão (pessoa → só ela;
 *    setor → todos do setor + chefe). Prazo: aviso na véspera e no vencimento.
 *  - Lançamento posterior (processo físico): envio/recebimento com a data em
 *    que ocorreu; registra quem lançou e quando.
 */
@Injectable()
export class TramitacaoService {
  private readonly logger = new Logger(TramitacaoService.name);

  constructor(
    @InjectRepository(TramitacaoProcesso)
    private readonly tramitacaoRepo: Repository<TramitacaoProcesso>,
    @InjectRepository(Licitacao)
    private readonly licitacaoRepo: Repository<Licitacao>,
    @InjectRepository(Setor)
    private readonly setorRepo: Repository<Setor>,
    private readonly auditLog: AuditLogService,
    @InjectDataSource() private readonly ds: DataSource,
    @Optional() private readonly notificacoes?: NotificacoesService,
  ) {}

  // ==========================================================================
  // INTEGRAÇÃO (F3): quem precisa saber das movimentações
  // ==========================================================================

  /** Antes de uma movimentação manual (ex.: esperar a sincronização em curso do processo). */
  private readonly antesDeMovimentar: Array<(licitacaoId: string) => Promise<unknown>> = [];
  /** Depois de cada envio/devolução gravado (ex.: tarefas: chegada ao destino). */
  private readonly aoMovimentar: Array<(m: MovimentacaoTramitacao) => unknown> = [];

  registrarAntesDeMovimentar(fn: (licitacaoId: string) => Promise<unknown>) {
    this.antesDeMovimentar.push(fn);
  }

  registrarAoMovimentar(fn: (m: MovimentacaoTramitacao) => unknown) {
    this.aoMovimentar.push(fn);
  }

  private async esperarAntes(licitacaoId: string) {
    for (const fn of this.antesDeMovimentar) {
      try {
        await fn(licitacaoId);
      } catch (e: any) {
        this.logger.warn(`Rotina antes da tramitação do processo ${licitacaoId} falhou: ${e?.message ?? e}`);
      }
    }
  }

  private async avisarMovimentacao(m: MovimentacaoTramitacao) {
    for (const fn of this.aoMovimentar) {
      try {
        await fn(m);
      } catch (e: any) {
        this.logger.warn(`Rotina depois da tramitação do processo ${m.licitacao_id} falhou: ${e?.message ?? e}`);
      }
    }
  }

  // ==========================================================================
  // IDENTIDADE E ISOLAMENTO
  // ==========================================================================

  /** Processo do órgão do ator (outro órgão → 404, como se não existisse). */
  private async licitacaoDoAtor(licitacaoId: string, ator: Ator): Promise<Licitacao> {
    const lic = ehUuid(licitacaoId) ? await this.licitacaoRepo.findOne({ where: { id: licitacaoId } }) : null;
    if (!lic) throw new NotFoundException('Processo não encontrado');
    if (!ator?.admin && lic.orgao_id !== ator?.orgaoId) throw new NotFoundException('Processo não encontrado');
    return lic;
  }

  /** Quem está agindo: do token + cadastro (setor, cargo, papel). Nunca do corpo. */
  async perfil(ator: Ator, orgaoId: string): Promise<Perfil> {
    if (ator.admin) {
      return { usuario_id: null, nome: 'Administrador da plataforma', cargo: null, setor_id: null, admin_orgao: true, orgao_id: orgaoId };
    }
    if (ator.orgaoId !== orgaoId) throw new NotFoundException('Processo não encontrado');
    if (ator.tipo === 'ORGAO') {
      const [o] = await this.ds.query(`SELECT nome FROM orgaos WHERE id::text = $1`, [orgaoId]);
      return { usuario_id: null, nome: o?.nome || 'Órgão', cargo: null, setor_id: null, admin_orgao: true, orgao_id: orgaoId };
    }
    const [u] = ator.usuarioId && ehUuid(ator.usuarioId)
      ? await this.ds.query(
          `SELECT id::text AS id, nome, cargo, setor_id::text AS setor_id, role::text AS role, orgao_id::text AS orgao_id, ativo
             FROM usuarios WHERE id::text = $1`,
          [ator.usuarioId],
        )
      : [];
    if (!u || u.orgao_id !== orgaoId || u.ativo === false) throw new ForbiddenException('Usuário sem acesso a este processo');
    return {
      usuario_id: u.id,
      nome: u.nome || 'Usuário',
      cargo: u.cargo || null,
      setor_id: u.setor_id || null,
      admin_orgao: u.role === 'ADMIN',
      orgao_id: orgaoId,
    };
  }

  private contextoDe(p: Perfil, contexto?: ContextoUsuario): ContextoUsuario {
    return { ...(contexto ?? {}), usuario_id: p.usuario_id ?? undefined, usuario_nome: p.nome };
  }

  private async chefeDoSetor(setorId: string | null | undefined): Promise<string | null> {
    if (!setorId || !ehUuid(setorId)) return null;
    const [s] = await this.ds.query(`SELECT chefe_usuario_id::text AS chefe FROM setores WHERE id::text = $1`, [setorId]);
    return s?.chefe ?? null;
  }

  private async exigirQuemEstaComOProcesso(p: Perfil, t: TramitacaoProcesso, acao: string) {
    const chefe = await this.chefeDoSetor(t.para_setor_id);
    if (!podeAtuarNoDestino(p, t, chefe)) {
      const com = [t.para_setor_nome, t.para_usuario_nome].filter(Boolean).join(' · ') || 'outro destino';
      throw new ForbiddenException(`Só quem está com o processo (${com}) ou o administrador do órgão pode ${acao}.`);
    }
  }

  // ==========================================================================
  // ENVIAR (serviço interno — F3 — e REST)
  // ==========================================================================

  /**
   * O ator pode enviar o processo agora? (F3 — sugestão de envio): sem
   * tramitação vigente, qualquer usuário do órgão; com ela, quem está com o
   * processo (setor, pessoa, chefe do setor) ou o administrador do órgão —
   * a mesma regra do `enviar`. Outro órgão → 404.
   */
  async permissaoDeEnvio(licitacaoId: string, ator: Ator): Promise<{ pode: boolean; motivo: string | null }> {
    const lic = await this.licitacaoDoAtor(licitacaoId, ator);
    let perfil: Perfil;
    try {
      perfil = await this.perfil(ator, lic.orgao_id);
    } catch {
      return { pode: false, motivo: 'Usuário sem acesso a este processo.' };
    }
    const atual = await this.tramitacaoAtual(lic.id);
    const vigente = atual && [StatusTramitacao.PENDENTE, StatusTramitacao.RECEBIDA].includes(atual.status) ? atual : null;
    if (!vigente) return { pode: true, motivo: null };
    if (podeAtuarNoDestino(perfil, vigente, await this.chefeDoSetor(vigente.para_setor_id))) return { pode: true, motivo: null };
    const com = [vigente.para_setor_nome, vigente.para_usuario_nome].filter(Boolean).join(' · ') || 'outro destino';
    return { pode: false, motivo: `O processo está com ${com}: só quem está com ele (ou o administrador do órgão) envia.` };
  }

  /** REST `POST :licitacaoId/tramitar` — mesmo caminho do serviço interno. */
  async tramitar(licitacaoId: string, dto: TramitarDto, ator: Ator, contexto?: ContextoUsuario): Promise<TramitacaoProcesso> {
    return this.enviar({
      licitacaoId,
      para: { setor_id: dto?.para_setor_id ?? null, usuario_id: dto?.para_usuario_id ?? null },
      despacho: dto?.despacho,
      finalidade: dto?.finalidade,
      prazo_dias_uteis: dto?.prazo_dias_uteis ?? dto?.prazo_dias ?? null,
      data_ocorrencia: dto?.data_ocorrencia ?? null,
      etapas: dto?.etapas ?? null,
      justificativa_fora_do_fluxo: dto?.justificativa_fora_do_fluxo ?? null,
      ator,
      contexto,
    });
  }

  /** Códigos de etapa informados no envio (lista curta de textos; o resto é recusado). */
  private validarEtapas(v: unknown): string[] | null {
    if (v === null || v === undefined) return null;
    if (!Array.isArray(v) || v.length > 30 || v.some((x) => typeof x !== 'string' || !/^[A-Z0-9_]{1,40}$/.test(x))) {
      throw new BadRequestException('etapas: envie a lista de códigos das etapas (ex.: ["RESERVA"]).');
    }
    return v.length ? [...new Set(v as string[])] : null;
  }

  /**
   * Envia o processo a um setor e/ou pessoa, com despacho (vira folha nos
   * autos) e aviso ao destino. `automatico`: despacho padrão, sem exigir que
   * o ator esteja com o processo (tramitação do sistema no modo simples).
   */
  async enviar(params: EnviarTramitacaoParams): Promise<TramitacaoProcesso> {
    const lic = await this.licitacaoDoAtor(params.licitacaoId, params.ator);
    const perfil = await this.perfil(params.ator, lic.orgao_id);
    const destino = await this.resolverDestino(lic.orgao_id, params.para);
    const prazo = this.validarPrazo(params.prazo_dias_uteis);
    const etapas = this.validarEtapas(params.etapas);
    // Ponte: com fluxo desenhado em andamento, o processo anda pelas etapas — envio manual só
    // como exceção, com justificativa no despacho (a etapa do fluxo não muda; quem recebe devolve)
    const conduzido = !params.automatico && (await licitacaoConduzidaPeloFluxo((sql, p) => this.ds.query(sql, p), lic.id));
    const justificativa = conduzido ? justificativaForaDoFluxo(params.justificativa_fora_do_fluxo) : null;
    if (conduzido && !justificativa) {
      throw new ConflictException(
        `Este processo segue um fluxo: ele anda pelas etapas (concluir, devolver ou indeferir). Para enviar a outro setor fora do fluxo, informe a justificativa (mínimo ${JUSTIFICATIVA_MINIMA} caracteres).`,
      );
    }
    const texto = justificativa ? despachoForaDoFluxo(justificativa, params.despacho) : this.textoDoDespacho(params, destino.nome);
    const finalidade = justificativa ? FINALIDADE_FORA_DO_FLUXO : String(params.finalidade ?? '').trim().slice(0, 300) || null;
    // F3: envio manual espera a sincronização em curso do processo (posse inicial, envio automático)
    if (!params.automatico) await this.esperarAntes(lic.id);

    const tramitacao = await this.executarEnvio(lic, perfil, {
      destino,
      despacho: texto,
      finalidade,
      prazo,
      automatico: !!params.automatico,
      data_ocorrencia: params.data_ocorrencia ?? null,
      exigirPosse: !params.automatico,
      etapas,
      se_vigente: params.se_vigente,
    });

    await this.registrarLog(lic.id, AcaoLogFaseInterna.PROCESSO_TRAMITADO,
      `Processo ${params.automatico ? 'encaminhado automaticamente' : 'tramitado'} para ${destino.nome}${tramitacao.lancado_posteriormente ? ` (lançamento posterior, ocorrido em ${dataBrasilia(momentoDoEnvio(tramitacao))})` : ''}`,
      { tramitacao_id: tramitacao.id, despacho: texto, prazo_dias_uteis: prazo, automatico: !!params.automatico, data_ocorrencia: tramitacao.data_ocorrencia, etapas },
      this.contextoDe(perfil, params.contexto));
    if (params.notificar !== false) await this.notificarChegada(lic, tramitacao, perfil.usuario_id);
    await this.avisarMovimentacao({ licitacao_id: lic.id, tipo: 'ENVIO', tramitacao, automatico: !!params.automatico, por: { id: perfil.usuario_id, nome: perfil.nome } });
    return tramitacao;
  }

  /**
   * POSSE INICIAL (F3): ao abrir o processo — ou, no processo antigo sem
   * nenhuma tramitação, na primeira sincronização — o processo fica com quem
   * conduz a etapa atual. Registro do sistema, sem aviso e sem folha (a
   * autuação já é a capa e o termo de abertura dos autos). Idempotente: com
   * qualquer tramitação já gravada, não faz nada (null).
   */
  async registrarPosseInicial(
    licitacaoId: string,
    para: { setor_id?: string | null; usuario_id?: string | null },
    o: { finalidade?: string | null; etapas?: string[] | null; por?: { id: string | null; nome: string | null } | null },
  ): Promise<TramitacaoProcesso | null> {
    const lic = ehUuid(licitacaoId) ? await this.licitacaoRepo.findOne({ where: { id: licitacaoId } }) : null;
    if (!lic?.orgao_id) return null;
    const destino = await this.resolverDestino(lic.orgao_id, para);
    const criada = await this.ds.transaction(async (m) => {
      await m.query(`SELECT id FROM licitacoes WHERE id::text = $1 FOR UPDATE`, [lic.id]);
      const [existe] = await m.query(`SELECT 1 FROM tramitacoes_processo WHERE licitacao_id::text = $1 LIMIT 1`, [lic.id]);
      if (existe) return null;
      const repo = m.getRepository(TramitacaoProcesso);
      return repo.save(
        repo.create({
          licitacao_id: lic.id,
          sequencia: 1,
          de_usuario_id: (o.por?.id ?? undefined) as any,
          de_usuario_nome: (o.por?.nome || 'Sistema (autuação)') as any,
          para_setor_id: destino.setor?.id ?? null,
          para_setor_nome: destino.setor?.nome ?? null,
          para_usuario_id: (destino.usuario?.id ?? undefined) as any,
          para_usuario_nome: (destino.usuario?.nome ?? undefined) as any,
          despacho: despachoDeAutuacao(destino.nome, o.finalidade),
          finalidade: 'autuação',
          // mesmo relógio das demais datas da tramitação (coluna sem fuso — ver executarEnvio)
          data_envio: new Date(),
          // Já está com quem conduz: não fica "aguardando recebimento"
          status: StatusTramitacao.RECEBIDA,
          automatico: true,
          posse_inicial: true,
          etapas: o.etapas?.length ? o.etapas : null,
        }),
      );
    });
    if (!criada) return null;
    await this.registrarLog(lic.id, AcaoLogFaseInterna.PROCESSO_TRAMITADO, `Posse inicial registrada: o processo está com ${destino.nome} (autuação, sem aviso)`, {
      tramitacao_id: criada.id,
      posse_inicial: true,
      despacho: criada.despacho,
      etapas: criada.etapas,
    }, { usuario_id: o.por?.id ?? undefined, usuario_nome: o.por?.nome ?? 'Sistema' });
    return criada;
  }

  private textoDoDespacho(p: Pick<EnviarTramitacaoParams, 'despacho' | 'finalidade' | 'automatico'>, destinoNome: string): string {
    const informado = String(p.despacho ?? '').trim();
    if (informado) return informado.slice(0, 8000);
    if (p.automatico || String(p.finalidade ?? '').trim()) return despachoPadrao(destinoNome, p.finalidade);
    throw new BadRequestException('O despacho é obrigatório para tramitar o processo');
  }

  private validarPrazo(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 365 || Math.floor(n) !== n) {
      throw new BadRequestException('Prazo inválido: informe um número inteiro de dias úteis (0 a 365).');
    }
    return n || null;
  }

  /** Setor/pessoa de destino, sempre do MESMO órgão do processo. */
  private async resolverDestino(orgaoId: string, para: { setor_id?: string | null; usuario_id?: string | null }) {
    const setorId = para?.setor_id || null;
    const usuarioId = para?.usuario_id || null;
    if (!setorId && !usuarioId) throw new BadRequestException('Informe o setor e/ou a pessoa de destino');
    let usuario: { id: string; nome: string; setor_id: string | null } | null = null;
    if (usuarioId) {
      const [u] = ehUuid(usuarioId)
        ? await this.ds.query(
            `SELECT id::text AS id, nome, setor_id::text AS setor_id FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2 AND ativo = true`,
            [usuarioId, orgaoId],
          )
        : [];
      if (!u) throw new BadRequestException('Pessoa de destino não encontrada neste órgão');
      usuario = u;
    }
    const idSetor = setorId || usuario?.setor_id || null;
    let setor: Setor | null = null;
    if (idSetor) {
      setor = ehUuid(idSetor) ? await this.setorRepo.findOne({ where: { id: idSetor, orgao_id: orgaoId } }) : null;
      if (!setor) throw new BadRequestException('Setor de destino não encontrado neste órgão');
    }
    const nome = [setor?.nome, usuario?.nome].filter(Boolean).join(' · ') || 'destino';
    return { setor, usuario, nome };
  }

  /**
   * Núcleo do envio (transação com a licitação travada): posse, destino
   * repetido, data de ocorrência, conclusão da vigente, sequência, prazo em
   * dias úteis, despacho em PDF com folhas. `devolucao`: marca a vigente como
   * DEVOLVIDA na MESMA transação (a volta é o novo envio).
   */
  private async executarEnvio(
    lic: Licitacao,
    perfil: Perfil,
    o: {
      destino: { setor: Setor | null; usuario: { id: string; nome: string } | null; nome: string };
      despacho: string;
      finalidade: string | null;
      prazo: number | null;
      automatico: boolean;
      data_ocorrencia: string | Date | null;
      exigirPosse: boolean;
      devolucao?: { tramitacao_id: string; motivo: string };
      etapas?: string[] | null;
      se_vigente?: string | null;
    },
  ): Promise<TramitacaoProcesso> {
    let arquivoGravado: string | null = null;
    try {
      return await this.ds.transaction(async (m) => {
        await m.query(`SELECT id FROM licitacoes WHERE id::text = $1 FOR UPDATE`, [lic.id]);
        const repo = m.getRepository(TramitacaoProcesso);
        const atual = await repo.findOne({ where: { licitacao_id: lic.id }, order: { sequencia: 'DESC' } });
        const vigente = atual && [StatusTramitacao.PENDENTE, StatusTramitacao.RECEBIDA].includes(atual.status) ? atual : null;
        // F3 (envio automático): a posse mudou enquanto o sistema decidia → não envia
        if (o.se_vigente !== undefined && (vigente?.id ?? null) !== (o.se_vigente ?? null)) {
          throw new ConflictException('A tramitação do processo mudou — o envio automático não foi feito.');
        }

        if (o.devolucao) {
          if (!vigente || vigente.id !== o.devolucao.tramitacao_id) {
            throw new BadRequestException('Só a tramitação vigente (onde o processo está agora) pode ser devolvida');
          }
        } else {
          if (vigente && o.exigirPosse) await this.exigirQuemEstaComOProcesso(perfil, vigente, 'enviá-lo adiante');
          if (
            vigente &&
            (vigente.para_setor_id ?? null) === (o.destino.setor?.id ?? null) &&
            (vigente.para_usuario_id ?? null) === (o.destino.usuario?.id ?? null)
          ) {
            throw new BadRequestException('O processo já está neste destino');
          }
        }

        // Data em que ocorreu (lançamento posterior) — nunca antes da movimentação anterior
        const agora = new Date();
        // A posse inicial (autuação do sistema) não limita o lançamento do que já ocorreu no papel
        const minimo = atual && !(atual.posse_inicial && !atual.data_recebimento) ? this.ultimaMovimentacao(atual) : null;
        let ocorrencia = agora;
        let lancadoPosteriormente = false;
        if (o.data_ocorrencia) {
          const v = validarDataOcorrencia(o.data_ocorrencia instanceof Date ? o.data_ocorrencia.toISOString() : o.data_ocorrencia, { agora, minimo });
          if (!v.ok) throw new BadRequestException(v.erro);
          ocorrencia = v.data;
          lancadoPosteriormente = true;
        }

        // A vigente sai do destino
        if (vigente) {
          if (o.devolucao) {
            vigente.status = StatusTramitacao.DEVOLVIDA;
            vigente.motivo_devolucao = o.devolucao.motivo;
            vigente.data_devolucao = ocorrencia;
          } else {
            vigente.status = StatusTramitacao.CONCLUIDA;
          }
          await repo.save(vigente);
        }

        const [{ max }] = await m.query(`SELECT COALESCE(MAX(sequencia), 0) AS max FROM tramitacoes_processo WHERE licitacao_id::text = $1`, [lic.id]);
        const sequencia = Number(max || 0) + 1;
        const cal = calendarioDoOrgao(lic.orgao_id);
        const dataPrazo = prazoDaTramitacao(ocorrencia, o.prazo, cal);

        // Origem: onde o processo estava (ou, no primeiro envio, o setor de quem envia)
        let deSetorId = atual?.para_setor_id ?? null;
        let deSetorNome = atual?.para_setor_nome ?? null;
        if (!atual && perfil.setor_id) {
          const s = await m.getRepository(Setor).findOne({ where: { id: perfil.setor_id } });
          deSetorId = s?.id ?? null;
          deSetorNome = s?.nome ?? null;
        }

        let tramitacao = await repo.save(
          repo.create({
            licitacao_id: lic.id,
            sequencia,
            de_setor_id: deSetorId as any,
            de_setor_nome: deSetorNome as any,
            de_usuario_id: (perfil.usuario_id ?? undefined) as any,
            de_usuario_nome: perfil.nome,
            para_setor_id: o.destino.setor?.id ?? null,
            para_setor_nome: o.destino.setor?.nome ?? null,
            para_usuario_id: (o.destino.usuario?.id ?? undefined) as any,
            para_usuario_nome: (o.destino.usuario?.nome ?? undefined) as any,
            despacho: o.despacho,
            finalidade: o.finalidade,
            prazo_dias_uteis: o.prazo,
            data_prazo: (dataPrazo ?? undefined) as any,
            status: StatusTramitacao.PENDENTE,
            // registro com o MESMO relógio das demais datas gravadas aqui (recebimento, prazo)
            data_envio: agora,
            automatico: o.automatico,
            devolucao_de_id: o.devolucao?.tramitacao_id ?? null,
            etapas: o.etapas?.length ? o.etapas : null,
            data_ocorrencia: lancadoPosteriormente ? ocorrencia : null,
            lancado_posteriormente: lancadoPosteriormente,
            lancado_por_id: lancadoPosteriormente ? perfil.usuario_id : null,
            lancado_por_nome: lancadoPosteriormente ? perfil.nome : null,
          }),
        );

        // Despacho em PDF → folha nos autos
        const [org] = await m.query(`SELECT nome, cidade, uf FROM orgaos WHERE id::text = $1`, [lic.orgao_id]);
        const pdf = await gerarPdfDespacho({
          orgao_nome: org?.nome || 'Órgão',
          cidade: org?.cidade ?? null,
          uf: org?.uf ?? null,
          numero_processo: lic.numero_processo,
          objeto: lic.objeto,
          sequencia,
          devolucao: !!o.devolucao,
          de: [deSetorNome, perfil.nome].filter(Boolean).join(' · ') || 'Início do processo',
          para: o.destino.nome,
          despacho: o.despacho,
          prazo_dias_uteis: o.prazo,
          data_prazo: dataPrazo,
          ocorrido_em: ocorrencia,
          registrado_em: tramitacao.data_envio ?? agora,
          enviado_por: perfil.nome,
          cargo: perfil.cargo,
          automatico: o.automatico,
          lancado_posteriormente: lancadoPosteriormente,
          lancado_por: perfil.nome,
        });
        const rel = this.gravarPdf(lic.id, sequencia, pdf);
        arquivoGravado = rel;
        const hash = createHash('sha256').update(pdf).digest('hex');
        await m.query(`UPDATE tramitacoes_processo SET despacho_arquivo = $2, despacho_hash = $3 WHERE id::text = $1`, [tramitacao.id, rel, hash]);
        const paginas = await this.contarPaginas(pdf);
        const faixa = await atribuirFolhasDespacho(m, lic.id, tramitacao.id, paginas);
        tramitacao = Object.assign(tramitacao, { despacho_arquivo: rel, despacho_hash: hash, despacho_paginas: paginas, ...faixa });
        return tramitacao;
      });
    } catch (e) {
      if (arquivoGravado) {
        const p = resolverArquivoDeUrl(arquivoGravado);
        if (p) fs.promises.unlink(p).catch(() => undefined);
      }
      throw e;
    }
  }

  /** Última movimentação registrada na tramitação (envio efetivo, recebimento ou devolução). */
  private ultimaMovimentacao(t: TramitacaoProcesso): Date {
    const datas = [momentoDoEnvio(t), t.data_recebimento, t.data_devolucao].filter(Boolean).map((d) => new Date(d as any).getTime());
    return new Date(Math.max(...datas));
  }

  private gravarPdf(licitacaoId: string, sequencia: number, pdf: Buffer): string {
    const nome = `despacho-${String(sequencia).padStart(3, '0')}-${randomUUID()}.pdf`;
    const dir = path.join(diretorioDeGravacao(PASTA_DESPACHOS), licitacaoId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, nome), pdf);
    return `${PASTA_DESPACHOS}/${licitacaoId}/${nome}`;
  }

  private async contarPaginas(pdf: Buffer): Promise<number> {
    return Math.max(1, await contarPaginasPdf(pdf));
  }

  // ==========================================================================
  // RECEBER / DEVOLVER
  // ==========================================================================

  /** Confirma o recebimento (só o destino — setor, pessoa ou chefe — ou o administrador do órgão). */
  async receber(
    tramitacaoId: string,
    ator: Ator,
    opcoes: { data_ocorrencia?: string | null } = {},
    contexto?: ContextoUsuario,
  ): Promise<TramitacaoProcesso> {
    const tramitacao = await this.obter(tramitacaoId);
    const lic = await this.licitacaoDoAtor(tramitacao.licitacao_id, ator);
    const perfil = await this.perfil(ator, lic.orgao_id);
    if (tramitacao.status !== StatusTramitacao.PENDENTE) {
      throw new BadRequestException('Esta tramitação não está pendente de recebimento');
    }
    await this.exigirQuemEstaComOProcesso(perfil, tramitacao, 'recebê-lo');

    const agora = new Date();
    let data = agora;
    let lancado = false;
    if (opcoes.data_ocorrencia) {
      const v = validarDataOcorrencia(opcoes.data_ocorrencia, { agora, minimo: momentoDoEnvio(tramitacao) });
      if (!v.ok) throw new BadRequestException(v.erro);
      data = v.data;
      lancado = true;
    }
    // Atualização condicional: dois cliques simultâneos não recebem duas vezes
    const r = await this.ds.query(
      `UPDATE tramitacoes_processo
          SET status = 'RECEBIDA', data_recebimento = $2, recebido_por_id = $3, recebido_por_nome = $4,
              recebimento_lancado_posteriormente = $5, recebimento_lancado_em = $6
        WHERE id::text = $1 AND status = 'PENDENTE' RETURNING id`,
      [tramitacao.id, data, perfil.usuario_id, perfil.nome, lancado, lancado ? agora : null],
    );
    if (!(Array.isArray(r[0]) ? r[0] : r).length) throw new BadRequestException('Esta tramitação não está pendente de recebimento');

    await this.registrarLog(
      tramitacao.licitacao_id,
      AcaoLogFaseInterna.TRAMITACAO_RECEBIDA,
      `Recebimento confirmado em ${tramitacao.para_setor_nome ?? tramitacao.para_usuario_nome ?? 'destino'} por ${perfil.nome}${lancado ? ` (lançamento posterior, ocorrido em ${dataBrasilia(data)})` : ''}`,
      { tramitacao_id: tramitacao.id, data_recebimento: data, lancado_posteriormente: lancado },
      this.contextoDe(perfil, contexto),
    );
    return this.obter(tramitacao.id);
  }

  /**
   * Devolve o processo a quem enviou, com motivo obrigatório: a vigente fica
   * DEVOLVIDA e nasce a tramitação de volta (com despacho de devolução nos autos).
   */
  async devolver(
    tramitacaoId: string,
    motivo: string,
    ator: Ator,
    opcoes: { data_ocorrencia?: string | null } = {},
    contexto?: ContextoUsuario,
  ): Promise<TramitacaoProcesso> {
    if (!motivo?.trim()) throw new BadRequestException('O motivo da devolução é obrigatório');
    const tramitacao = await this.obter(tramitacaoId);
    const lic = await this.licitacaoDoAtor(tramitacao.licitacao_id, ator);
    const perfil = await this.perfil(ator, lic.orgao_id);
    if (![StatusTramitacao.PENDENTE, StatusTramitacao.RECEBIDA].includes(tramitacao.status)) {
      throw new BadRequestException('Esta tramitação não pode ser devolvida');
    }
    await this.exigirQuemEstaComOProcesso(perfil, tramitacao, 'devolvê-lo');
    // Com fluxo, a devolução é pela etapa — exceto quem recebeu um envio fora do fluxo, que devolve a quem mandou
    if (!ehEnvioForaDoFluxo(tramitacao) && (await licitacaoConduzidaPeloFluxo((sql, p) => this.ds.query(sql, p), lic.id))) {
      throw new ConflictException('Este processo segue um fluxo: a devolução é feita pela etapa do fluxo.');
    }
    if (tramitacao.posse_inicial) {
      throw new BadRequestException('A posse inicial (autuação) não se devolve: envie o processo ao destino com um despacho.');
    }
    await this.esperarAntes(lic.id);

    // Volta para a origem: o setor de onde veio e, se ainda for do órgão, quem enviou
    let usuarioVolta: string | null = null;
    if (tramitacao.de_usuario_id && ehUuid(tramitacao.de_usuario_id)) {
      const [u] = await this.ds.query(`SELECT id::text AS id FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2 AND ativo = true`, [tramitacao.de_usuario_id, lic.orgao_id]);
      usuarioVolta = u?.id ?? null;
    }
    if (!tramitacao.de_setor_id && !usuarioVolta) {
      throw new BadRequestException('Tramitação inicial não pode ser devolvida (não há origem)');
    }
    const destino = await this.resolverDestino(lic.orgao_id, {
      setor_id: tramitacao.de_setor_id ?? null,
      usuario_id: tramitacao.de_setor_id ? null : usuarioVolta,
    });
    const m = motivo.trim().slice(0, 4000);
    const volta = await this.executarEnvio(lic, perfil, {
      destino,
      despacho: `DEVOLUÇÃO: ${m}`,
      finalidade: null,
      prazo: null,
      automatico: false,
      data_ocorrencia: opcoes.data_ocorrencia ?? null,
      exigirPosse: false,
      devolucao: { tramitacao_id: tramitacao.id, motivo: m },
    });

    await this.registrarLog(
      tramitacao.licitacao_id,
      AcaoLogFaseInterna.TRAMITACAO_DEVOLVIDA,
      `Processo devolvido de ${tramitacao.para_setor_nome ?? tramitacao.para_usuario_nome ?? 'destino'} para ${destino.nome}`,
      { tramitacao_id: tramitacao.id, volta_id: volta.id, motivo: m },
      this.contextoDe(perfil, contexto),
    );
    await this.notificarChegada(lic, volta, perfil.usuario_id);
    await this.avisarMovimentacao({ licitacao_id: lic.id, tipo: 'DEVOLUCAO', tramitacao: volta, automatico: false, por: { id: perfil.usuario_id, nome: perfil.nome } });
    return volta;
  }

  // ==========================================================================
  // LEITURAS
  // ==========================================================================

  /** Histórico completo de tramitações do processo. */
  async listarPorProcesso(licitacaoId: string): Promise<TramitacaoProcesso[]> {
    return this.tramitacaoRepo.find({ where: { licitacao_id: licitacaoId }, order: { sequencia: 'ASC' } });
  }

  /** Tramitação vigente (a última). */
  async tramitacaoAtual(licitacaoId: string): Promise<TramitacaoProcesso | null> {
    return this.tramitacaoRepo.findOne({ where: { licitacao_id: licitacaoId }, order: { sequencia: 'DESC' } });
  }

  /**
   * COM QUEM ESTÁ o processo: setor, pessoa, desde quando, prazo e dias úteis
   * restantes (calendário do órgão). Sem tramitação → status SEM_TRAMITACAO.
   */
  async comQuemEsta(licitacaoId: string, agora: Date = new Date()): Promise<ComQuemEsta> {
    const lic = await this.licitacaoRepo.findOne({ where: { id: licitacaoId } });
    if (!lic) throw new NotFoundException('Processo não encontrado');
    return this.paraComQuemEsta(await this.tramitacaoAtual(licitacaoId), lic.orgao_id, agora);
  }

  /**
   * COM QUEM ESTÁ, em lote (painel da TV): a mesma leitura de `comQuemEsta`
   * para vários processos do MESMO órgão, numa consulta só. Processo sem
   * tramitação fica de fora do mapa.
   */
  async comQuemEstaEmLote(orgaoId: string, licitacaoIds: string[], agora: Date = new Date()): Promise<Map<string, ComQuemEsta>> {
    const saida = new Map<string, ComQuemEsta>();
    const ids = licitacaoIds.filter((id) => ehUuid(id));
    if (!ids.length) return saida;
    const linhas: TramitacaoProcesso[] = await this.tramitacaoRepo
      .createQueryBuilder('t')
      .innerJoin('t.licitacao', 'l')
      .where('l.orgao_id = :orgaoId', { orgaoId })
      .andWhere('t.licitacao_id IN (:...ids)', { ids })
      .andWhere('t.sequencia = (SELECT MAX(t2.sequencia) FROM tramitacoes_processo t2 WHERE t2.licitacao_id = t.licitacao_id)')
      .getMany();
    for (const t of linhas) saida.set(t.licitacao_id, this.paraComQuemEsta(t, orgaoId, agora));
    return saida;
  }

  private paraComQuemEsta(t: TramitacaoProcesso | null, orgaoId: string, agora: Date): ComQuemEsta {
    if (!t) {
      return {
        tramitacao_id: null, status: 'SEM_TRAMITACAO', setor: null, usuario: null, desde: null, recebido_em: null, recebido_por: null,
        prazo: null, prazo_dias_uteis: null, dias_uteis_restantes: null, vencido: false, de: null, despacho: null,
        automatico: false, lancado_posteriormente: false, folha: null, posse_inicial: false, etapas: null,
      };
    }
    const ativa = [StatusTramitacao.PENDENTE, StatusTramitacao.RECEBIDA].includes(t.status);
    const s = ativa ? situacaoDoPrazo(t.data_prazo, agora, calendarioDoOrgao(orgaoId)) : { dias_uteis_restantes: null, vencido: false };
    return {
      tramitacao_id: t.id,
      status: t.status,
      setor: t.para_setor_id ? { id: t.para_setor_id, nome: t.para_setor_nome ?? null } : null,
      usuario: t.para_usuario_id ? { id: t.para_usuario_id, nome: t.para_usuario_nome ?? null } : null,
      desde: momentoDoEnvio(t).toISOString(),
      recebido_em: t.data_recebimento ? new Date(t.data_recebimento).toISOString() : null,
      recebido_por: t.recebido_por_nome ?? null,
      prazo: t.data_prazo ? new Date(t.data_prazo).toISOString() : null,
      prazo_dias_uteis: t.prazo_dias_uteis ?? null,
      dias_uteis_restantes: s.dias_uteis_restantes,
      vencido: s.vencido,
      de: { setor_nome: t.de_setor_nome ?? null, usuario_nome: t.de_usuario_nome ?? null },
      despacho: t.despacho,
      automatico: !!t.automatico,
      lancado_posteriormente: !!t.lancado_posteriormente,
      folha: t.despacho_arquivo ? { folha_inicial: t.folha_inicial ?? null, folha_final: t.folha_final ?? null, url: url(t.id) } : null,
      posse_inicial: !!t.posse_inicial,
      etapas: Array.isArray(t.etapas) && t.etapas.length ? t.etapas : null,
    };
  }

  /** LINHA DO TEMPO cronológica: envios, recebimentos e devoluções, com despacho e link da folha. */
  async linhaDoTempo(licitacaoId: string): Promise<EventoLinhaDoTempo[]> {
    return montarLinhaDoTempo(await this.listarPorProcesso(licitacaoId), url);
  }

  /** PDF do despacho (folha dos autos). */
  async arquivoDoDespacho(tramitacaoId: string): Promise<{ caminho: string; nome: string }> {
    const t = await this.obter(tramitacaoId);
    const caminho = t.despacho_arquivo ? resolverArquivoDeUrl(t.despacho_arquivo) : null;
    if (!caminho || !fs.existsSync(caminho)) throw new NotFoundException('Esta tramitação não tem despacho em PDF');
    return { caminho, nome: `despacho-${String(t.sequencia).padStart(3, '0')}.pdf` };
  }

  /**
   * Caixa de entrada: tramitações pendentes de recebimento (ou também as
   * recebidas) para o setor e/ou a pessoa; sem filtro, todas do órgão.
   */
  async caixaEntrada(filtro: { setorId?: string | null; usuarioId?: string | null; orgaoId?: string; incluirRecebidas?: boolean }) {
    const qb = this.tramitacaoRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.licitacao', 'licitacao')
      .where('t.status IN (:...status)', {
        status: filtro.incluirRecebidas ? [StatusTramitacao.PENDENTE, StatusTramitacao.RECEBIDA] : [StatusTramitacao.PENDENTE],
      })
      .orderBy('t.data_envio', 'ASC');
    if (filtro.orgaoId) qb.andWhere('licitacao.orgao_id = :orgaoId', { orgaoId: filtro.orgaoId });

    if (filtro.setorId && filtro.usuarioId) {
      qb.andWhere('(t.para_setor_id = :setorId OR t.para_usuario_id = :usuarioId)', { setorId: filtro.setorId, usuarioId: filtro.usuarioId });
    } else if (filtro.setorId) {
      qb.andWhere('t.para_setor_id = :setorId', { setorId: filtro.setorId });
    } else if (filtro.usuarioId) {
      qb.andWhere('t.para_usuario_id = :usuarioId', { usuarioId: filtro.usuarioId });
    } else if (!filtro.orgaoId) {
      throw new BadRequestException('Informe setorId e/ou usuarioId');
    }
    return qb.getMany();
  }

  private async obter(id: string): Promise<TramitacaoProcesso> {
    const tramitacao = ehUuid(id) ? await this.tramitacaoRepo.findOne({ where: { id } }) : null;
    if (!tramitacao) throw new NotFoundException('Tramitação não encontrada');
    return tramitacao;
  }

  private async registrarLog(licitacaoId: string, acao: AcaoLogFaseInterna, descricao: string, dados: any, contexto: ContextoUsuario) {
    try {
      await this.auditLog.log({ licitacao_id: licitacaoId, acao, descricao, dados_depois: dados, contexto });
    } catch (e: any) {
      this.logger.warn(`Log da tramitação não gravado (${acao}): ${e?.message ?? e}`);
    }
  }

  // ==========================================================================
  // AVISOS (chegada e prazo) — interno + e-mail + WhatsApp com botão
  // ==========================================================================

  /** Destinatários do aviso: pessoa → só ela; setor → todos os ativos do setor + chefe. */
  async destinatarios(orgaoId: string, t: Pick<TramitacaoProcesso, 'para_setor_id' | 'para_usuario_id'>, remetenteId?: string | null) {
    const chefe = await this.chefeDoSetor(t.para_setor_id);
    const candidatos: Array<{ id: string; email: string | null; telefone: string | null; setor_id: string | null }> = await this.ds.query(
      `SELECT id::text AS id, email, telefone, setor_id::text AS setor_id FROM usuarios
        WHERE orgao_id::text = $1 AND ativo = true
          AND (id::text = $2 OR ($3::text IS NOT NULL AND setor_id::text = $3::text) OR id::text = $4)
        LIMIT 60`,
      [orgaoId, t.para_usuario_id ?? '', t.para_setor_id ?? null, chefe ?? ''],
    );
    return escolherDestinatarios(t, candidatos, chefe, remetenteId);
  }

  private async notificarChegada(lic: Licitacao, t: TramitacaoProcesso, remetenteId: string | null) {
    await this.notificar(lic, t, 'CHEGADA', remetenteId);
  }

  private async notificar(lic: Licitacao, t: TramitacaoProcesso, evento: 'CHEGADA' | EventoPrazo, remetenteId: string | null): Promise<number> {
    if (!this.notificacoes || process.env.FASE_INTERNA_TRAMITACAO_NOTIFICAR === 'false') return 0;
    try {
      const para = await this.destinatarios(lic.orgao_id, t, evento === 'CHEGADA' ? remetenteId : null);
      if (!para.length) return 0;
      const link = `/orgao/processos/${lic.id}`;
      const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://portaldcp.com.br';
      const destino = t.para_usuario_id ? 'você' : `o setor ${t.para_setor_nome ?? ''}`.trim();
      const prazo = t.data_prazo ? ` Prazo: ${dataBrasilia(t.data_prazo)}.` : '';
      const devolucao = ehDevolucao(t);
      const titulo =
        evento === 'VESPERA'
          ? `Prazo do processo ${lic.numero_processo} vence ${t.data_prazo ? `em ${dataBrasilia(t.data_prazo)}` : 'em breve'}`
          : evento === 'VENCIDO'
            ? `Prazo do processo ${lic.numero_processo} venceu`
            : `Processo ${lic.numero_processo} ${devolucao ? 'devolvido' : 'enviado'} para ${destino}`;
      const mensagem =
        evento === 'CHEGADA'
          ? `${t.de_usuario_nome ? `${t.de_usuario_nome}: ` : ''}${t.despacho}${prazo}`
          : `O processo ${lic.numero_processo} está com ${[t.para_setor_nome, t.para_usuario_nome].filter(Boolean).join(' · ')}.${prazo}`;
      await this.notificacoes.criarParaMultiplos(
        para.map((u) => ({ id: u.id, email: u.email ?? undefined, telefone: u.telefone ?? undefined })),
        {
          orgao_id: lic.orgao_id,
          tipo: TipoNotificacao.PROCESSO_TRAMITADO,
          titulo,
          mensagem,
          prioridade: evento === 'VENCIDO' ? PrioridadeNotificacao.ALTA : PrioridadeNotificacao.NORMAL,
          entidade_tipo: 'LICITACAO',
          entidade_id: lic.id,
          link,
          enviar_email: true,
          metadata: {
            evento,
            tramitacao_id: t.id,
            whatsapp_text: `*${titulo}*\n${mensagem}\n\nAbra o processo para ver o despacho.`,
            whatsapp_url: `${appUrl}${link}`,
          },
        },
      );
      return para.length;
    } catch (e: any) {
      this.logger.warn(`Aviso da tramitação não enviado (${evento}): ${e?.message ?? e}`);
      return 0;
    }
  }

  /**
   * JOB DIÁRIO: avisa o destino na véspera (falta 1 dia útil) e no vencimento
   * do prazo. Idempotente: cada evento é carimbado (aviso_*_em) numa
   * atualização condicional — rodar de novo não avisa duas vezes.
   */
  async avisarPrazos(agora: Date = new Date()): Promise<{ vespera: number; vencido: number }> {
    const linhas: Array<TramitacaoProcesso & { orgao_id: string }> = await this.ds.query(
      `SELECT t.*, l.orgao_id::text AS orgao_id
         FROM tramitacoes_processo t JOIN licitacoes l ON l.id::text = t.licitacao_id::text
        WHERE t.status IN ('PENDENTE','RECEBIDA') AND t.data_prazo IS NOT NULL
          AND (t.aviso_vespera_em IS NULL OR t.aviso_vencido_em IS NULL)
          AND t.data_prazo < $1`,
      [new Date(agora.getTime() + 20 * 86_400_000)],
    );
    const total = { vespera: 0, vencido: 0 };
    for (const t of linhas) {
      const evento = avisoDePrazoDevido(t, agora, calendarioDoOrgao(t.orgao_id));
      if (!evento) continue;
      const coluna = evento === 'VESPERA' ? 'aviso_vespera_em' : 'aviso_vencido_em';
      const r = await this.ds.query(`UPDATE tramitacoes_processo SET ${coluna} = $2 WHERE id::text = $1 AND ${coluna} IS NULL RETURNING id`, [t.id, agora]);
      if (!(Array.isArray(r[0]) ? r[0] : r).length) continue; // outro processo já avisou
      const lic = await this.licitacaoRepo.findOne({ where: { id: t.licitacao_id } });
      if (!lic) continue;
      await this.notificar(lic, t, evento, null);
      if (evento === 'VESPERA') total.vespera++;
      else total.vencido++;
    }
    return total;
  }
}
