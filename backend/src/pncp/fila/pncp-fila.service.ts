import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PncpSync, StatusSincronizacao, TipoSincronizacao } from '../entities/pncp-sync.entity';
import { PncpService } from '../pncp.service';
import { PncpEnviosService, ResultadoEnvio } from './pncp-envios.service';
import { TransicoesEventos } from '../../licitacoes/transicoes/transicoes-eventos';
import { TransicoesService } from '../../licitacoes/transicoes/transicoes.service';
import { AtoLicitacao, AtorTransicao, EventoTransicao, atorSistema } from '../../licitacoes/transicoes/transicoes.tipos';
import { ehFaseInterna } from '../../licitacoes/transicoes/fases';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';
import { editalVigenteSql } from '../../publicacao/publicacao.sql';
import { avisoContratacaoVigenteSql } from '../../publicacao/aviso-contratacao';
import { confirmarDivulgacaoOficial } from '../../licitacoes/transicoes/divulgacao';
import { prazoEstendido } from '../../licitacoes/transicoes/definicoes';
import { diretorioDeGravacao } from '../../common/arquivos/arquivos';
import { TIPO_DOCUMENTO } from '../dto/pncp.dto';
import { ATOS_DE_SITUACAO } from '../mapeamento-pncp';
import {
  ENVIANDO_ABANDONADO_MS,
  ErroPncp,
  MAX_TENTATIVAS_PADRAO,
  OPERACOES_SEQUENCIAIS,
  ROTULO_OPERACAO,
  STATUS_PROCESSAVEIS,
  STATUS_REENVIAVEIS,
  chaveFila,
  decidirAposFalha,
  ordemDaOperacao,
  recusaBenigna,
} from './regras-fila';

export interface OperacaoFila {
  tipo: TipoSincronizacao;
  chave: string;
  licitacaoId?: string | null;
  entidadeId?: string | null;
  orgaoId?: string | null;
  referencia?: Record<string, unknown>;
}

export interface ResumoFila {
  bloqueado: boolean;
  processados: number;
  enviados: number;
  erros: number;
  aguardando: number;
}

/** Linha da fila para as telas (cockpit / painel da fila). */
export interface LinhaFila {
  id: string;
  tipo: string;
  rotulo: string;
  status: string;
  tentativas: number;
  max_tentativas: number;
  proximo_envio: Date | null;
  erro_mensagem: string | null;
  /** Código HTTP devolvido pelo PNCP na última falha (null = sem resposta ou regra local). */
  erro_status_http: number | null;
  /** Corpo da resposta de erro do PNCP, como veio da API. */
  erro_resposta: unknown;
  ultima_tentativa: Date | null;
  numero_controle_pncp: string | null;
  enviado_em: Date | null;
  entidade_id: string | null;
  referencia: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

const TRAVA_FILA = 'pncp-fila';
const SELECT_LINHA = `id, tipo::text AS tipo, status::text AS status, tentativas, max_tentativas, proximo_envio, erro_mensagem,
  erro_status_http, erro_resposta, ultima_tentativa,
  numero_controle_pncp, enviado_em, entidade_id, referencia, created_at, updated_at, licitacao_id, ordem`;

/**
 * ============================================================================
 * FILA DO PNCP (outbox) — plano E7 itens 6 e 7
 * ============================================================================
 *
 *  - ENFILEIRAR: toda operação vira uma linha de `pncp_sync` com chave de
 *    idempotência (INSERT … ON CONFLICT DO NOTHING) e a REFERÊNCIA do que
 *    enviar; nada de fire-and-forget nem `catch {}` silencioso.
 *  - DISPARO pelas transições (TransicoesEventos): PUBLICAR → compra + itens;
 *    RETIFICAR_EDITAL → documento + retificação; SUSPENDER/RETOMAR/REVOGAR/
 *    ANULAR/DESERTA/FRACASSADA → situação; HOMOLOGAR → resultado por item +
 *    termo de homologação. Assinaturas: ata (ARP) e contrato (portal de
 *    assinaturas) chamam `aoAssinarAta`/`aoAssinarContrato`.
 *  - WORKER: cron de 1 min, trava consultiva do Postgres (uma instância),
 *    ordem de dependência, backoff exponencial, máximo de tentativas.
 *  - TELAS: `listarFila` (cockpit) e `reenviarAgora` (ato do órgão dono).
 */
@Injectable()
export class PncpFilaService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(PncpFilaService.name);
  /** Enfileiramentos em curso disparados por eventos (o worker espera por eles). */
  private readonly emCurso = new Set<Promise<unknown>>();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly envios: PncpEnviosService,
    private readonly pncp: PncpService,
    private readonly eventos: TransicoesEventos,
    private readonly transicoes: TransicoesService,
  ) {}

  onModuleInit() {
    this.eventos.inscrever((e) => this.acompanhar(this.aoTransitar(e)));
  }

  /** Opcional: retificar no PNCP os contratos publicados ANTES da assinatura (legado). */
  async onApplicationBootstrap() {
    if (process.env.PNCP_RETIFICAR_CONTRATOS_ASSINADOS_NO_BOOT !== 'true') return;
    try {
      const legados: Array<{ id: string }> = await this.ds.query(
        `SELECT DISTINCT c.id::text AS id FROM contratos c
           JOIN pncp_sync s ON s.entidade_id = c.id::text AND s.tipo::text = 'CONTRATO' AND s.status::text = 'ENVIADO'
          WHERE c.data_assinatura IS NOT NULL AND s.created_at < c.data_assinatura`,
      );
      for (const c of legados) await this.aoAssinarContrato(c.id);
      if (legados.length) this.logger.log(`[PNCP] ${legados.length} contrato(s) publicados antes da assinatura enfileirados para retificação`);
    } catch (e) {
      this.logger.error(`[PNCP] Retificação dos contratos legados não enfileirada: ${(e as Error).message}`);
    }
  }

  private acompanhar<T>(p: Promise<T>): Promise<T> {
    this.emCurso.add(p);
    const fim = () => this.emCurso.delete(p);
    p.then(fim, fim);
    return p;
  }

  // ==========================================================================
  // ENFILEIRAR
  // ==========================================================================

  /** Idempotente: a mesma chave devolve a linha existente. */
  async enfileirar(op: OperacaoFila): Promise<PncpSync> {
    await this.ds.query(
      `INSERT INTO pncp_sync (id, tipo, licitacao_id, entidade_id, orgao_id, status, tentativas, max_tentativas, ordem,
                              chave_idempotencia, referencia, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'PENDENTE', 0, $5, $6, $7, $8::jsonb, now(), now())
       ON CONFLICT (chave_idempotencia) DO NOTHING`,
      [op.tipo, op.licitacaoId ?? null, op.entidadeId ?? null, op.orgaoId ?? null, MAX_TENTATIVAS_PADRAO, ordemDaOperacao(op.tipo), op.chave, JSON.stringify(op.referencia ?? {})],
    );
    const [linha] = await this.ds.getRepository(PncpSync).find({ where: { chave_idempotencia: op.chave } });
    return linha;
  }

  /** Órgão integrado ao PNCP (vinculado ou com unidade compradora) e licitação feita nesta plataforma. */
  private async contexto(licitacaoId: string) {
    const [l] = await this.ds.query(
      `SELECT l.id, l.orgao_id::text AS orgao_id, l.selecao_externa, l.codigo_unidade_compradora,
              o.pncp_vinculado, o.pncp_codigo_unidade,
              EXISTS (SELECT 1 FROM pncp_sync s WHERE s.licitacao_id::text = l.id::text AND s.tipo::text = 'COMPRA' AND s.status::text <> 'EXCLUIDO') AS tem_compra
         FROM licitacoes l LEFT JOIN orgaos o ON o.id = l.orgao_id WHERE l.id::text = $1`,
      [licitacaoId],
    );
    if (!l) return null;
    const vinculado = !!(l.pncp_vinculado || l.pncp_codigo_unidade || l.codigo_unidade_compradora);
    const temCompra = !!l.tem_compra; // pncp_sync é a fonte (E9 — colunas antigas migradas no boot)
    return {
      orgaoId: l.orgao_id as string,
      externa: !!l.selecao_externa,
      integrado: vinculado && !l.selecao_externa,
      temCompra,
      /** Compra desta plataforma no PNCP: atos posteriores (ata, contrato) seguem para lá. */
      publicaAqui: temCompra && !l.selecao_externa,
    };
  }

  /** Efeito PNCP de cada ato da máquina de estados. */
  async aoTransitar(e: EventoTransicao): Promise<void> {
    const ctx = await this.contexto(e.licitacao_id);
    if (!ctx?.integrado) return;
    const base = { licitacaoId: e.licitacao_id, orgaoId: ctx.orgaoId };
    const ato = String(e.ato);

    if (ato === AtoLicitacao.PUBLICAR) {
      await this.enfileirar({ ...base, tipo: TipoSincronizacao.COMPRA, chave: chaveFila.compra(e.licitacao_id), referencia: { ator: e.ator, transicao_id: e.transicao_id } });
      await this.enfileirar({ ...base, tipo: TipoSincronizacao.ITEM, chave: chaveFila.itens(e.licitacao_id), referencia: { transicao_id: e.transicao_id } });
      return;
    }
    if (!ctx.temCompra) return; // nada publicado desta licitação: não há o que atualizar

    if (ato === AtoLicitacao.RETIFICAR_EDITAL) {
      const ed = await editalVigenteSql(this.ds.manager, e.licitacao_id);
      if (ed?.origem === 'DOCUMENTOS_LICITACAO') {
        await this.enfileirar({
          ...base,
          tipo: TipoSincronizacao.DOCUMENTO,
          chave: chaveFila.documento(e.licitacao_id, `DL:${ed.documento_id}`),
          entidadeId: ed.documento_id,
          referencia: { origem: 'DOCUMENTO_LICITACAO', documento_id: ed.documento_id, tipo_documento_id: TIPO_DOCUMENTO.EDITAL, titulo: `Edital retificado (versao ${ed.versao})` },
        });
      }
      await this.enfileirar({
        ...base,
        tipo: TipoSincronizacao.RETIFICACAO_COMPRA,
        chave: chaveFila.retificacaoCompra(e.licitacao_id, e.transicao_id),
        referencia: { justificativa: e.motivo || 'Retificação do edital (art. 55 §1º)', transicao_id: e.transicao_id },
      });
      return;
    }
    // Diálogo competitivo (E7c — art. 32 §1º VIII): edital da fase competitiva + retificação da compra (novas datas/critério)
    if (ato === AtoLicitacao.ABRIR_FASE_COMPETITIVA) {
      const [d] = await this.ds.query(`SELECT edital_competitivo_caminho AS caminho FROM dialogo_competitivo WHERE licitacao_id::text = $1`, [e.licitacao_id]);
      if (d?.caminho) {
        await this.enfileirar({
          ...base,
          tipo: TipoSincronizacao.DOCUMENTO,
          chave: chaveFila.documento(e.licitacao_id, `FASE_COMPETITIVA:${e.transicao_id}`),
          referencia: { origem: 'ARQUIVO', arquivo: d.caminho, nome: 'edital-fase-competitiva.pdf', tipo_documento_id: TIPO_DOCUMENTO.EDITAL, titulo: 'Edital da fase competitiva (art. 32, §1º, VIII)' },
        });
      }
      await this.enfileirar({
        ...base,
        tipo: TipoSincronizacao.RETIFICACAO_COMPRA,
        chave: chaveFila.retificacaoCompra(e.licitacao_id, e.transicao_id),
        referencia: { justificativa: 'Diálogo competitivo: abertura da fase competitiva (art. 32, §1º, VIII)', transicao_id: e.transicao_id },
      });
      return;
    }
    // Divulgação confirmada com o cronograma estendido ao mínimo legal: a
    // compra no PNCP é retificada (novas datas) e, na dispensa, a nova versão
    // do aviso guardado vai como documento da compra.
    if (ato === AtoLicitacao.CONFIRMAR_DIVULGACAO) {
      const [t] = await this.ds.query(`SELECT dados FROM licitacao_transicoes WHERE id::text = $1`, [e.transicao_id]);
      if (!prazoEstendido(t?.dados?.dados?.cronograma_ajustado)) return;
      const aviso = await avisoContratacaoVigenteSql(this.ds.manager, e.licitacao_id);
      if (aviso && e.modalidade === 'DISPENSA_ELETRONICA') {
        await this.enfileirar({
          ...base,
          tipo: TipoSincronizacao.DOCUMENTO,
          chave: chaveFila.documento(e.licitacao_id, `DL:${aviso.documento_id}`),
          entidadeId: aviso.documento_id,
          referencia: { origem: 'DOCUMENTO_LICITACAO', documento_id: aviso.documento_id, tipo_documento_id: TIPO_DOCUMENTO.AVISO_CONTRATACAO_DIRETA, titulo: `Aviso de contratacao direta (versao ${aviso.versao})` },
        });
      }
      await this.enfileirar({
        ...base,
        tipo: TipoSincronizacao.RETIFICACAO_COMPRA,
        chave: chaveFila.retificacaoCompra(e.licitacao_id, e.transicao_id),
        referencia: { justificativa: 'Prazo estendido ao minimo legal contado da divulgacao no PNCP (art. 55; art. 75, par. 3)', transicao_id: e.transicao_id },
      });
      return;
    }
    if (ATOS_DE_SITUACAO.includes(ato)) {
      await this.enfileirar({
        ...base,
        tipo: TipoSincronizacao.SITUACAO_COMPRA,
        chave: chaveFila.situacaoCompra(e.licitacao_id, e.transicao_id),
        referencia: { ato, situacao: e.situacao_para, justificativa: e.motivo, transicao_id: e.transicao_id },
      });
      return;
    }
    if (ato === AtoLicitacao.HOMOLOGAR) {
      await this.enfileirarHomologacao(e.licitacao_id, e.transicao_id, ctx.orgaoId);
    }
  }

  /** Resultado de CADA item (o executor decide na hora: homologado → resultado; deserto/fracassado → situação) + termo. */
  private async enfileirarHomologacao(licitacaoId: string, transicaoId: string, orgaoId: string) {
    const itens: Array<{ id: string }> = await this.ds.query(`SELECT id::text AS id FROM itens_licitacao WHERE licitacao_id::text = $1 ORDER BY numero_item`, [licitacaoId]);
    for (const it of itens) {
      await this.enfileirar({
        tipo: TipoSincronizacao.RESULTADO,
        licitacaoId,
        orgaoId,
        entidadeId: it.id,
        chave: chaveFila.resultado(it.id, transicaoId),
        referencia: { item_id: it.id, transicao_id: transicaoId },
      });
    }
    await this.enfileirar({
      tipo: TipoSincronizacao.DOCUMENTO,
      licitacaoId,
      orgaoId,
      chave: chaveFila.documento(licitacaoId, `HOMOLOGACAO:${transicaoId}`),
      referencia: { origem: 'FORMALIZACAO_HOMOLOGACAO', tipo_documento_id: TIPO_DOCUMENTO.OUTROS, titulo: 'Termo de Adjudicacao e Homologacao', transicao_id: transicaoId },
    });
  }

  /** Última assinatura do contrato (portal de assinaturas): publica — ou retifica o publicado antes da assinatura. */
  async aoAssinarContrato(contratoId: string): Promise<PncpSync | null> {
    const [c] = await this.ds.query(
      `SELECT c.id::text AS id, c.licitacao_id::text AS licitacao_id, c.orgao_id::text AS orgao_id, c.enviado_pncp,
              EXISTS (SELECT 1 FROM pncp_sync s WHERE s.entidade_id = c.id::text AND s.tipo::text = 'CONTRATO' AND s.status::text = 'ENVIADO') AS ja_enviado
         FROM contratos c WHERE c.id::text = $1`,
      [contratoId],
    );
    if (!c?.licitacao_id) return null;
    const ctx = await this.contexto(c.licitacao_id);
    if (!ctx?.publicaAqui) return null;
    const legado = c.ja_enviado || c.enviado_pncp;
    return this.enfileirar({
      tipo: legado ? TipoSincronizacao.RETIFICACAO_CONTRATO : TipoSincronizacao.CONTRATO,
      licitacaoId: c.licitacao_id,
      orgaoId: c.orgao_id,
      entidadeId: c.id,
      chave: legado ? chaveFila.retificacaoContrato(c.id, 'ASSINADO') : chaveFila.contrato(c.id),
      referencia: { contrato_id: c.id },
    });
  }

  /** Ata assinada por todas as partes (ARP). */
  async aoAssinarAta(ataId: string): Promise<PncpSync | null> {
    const [a] = await this.ds.query(`SELECT id::text AS id, licitacao_id::text AS licitacao_id, orgao_id::text AS orgao_id FROM atas_registro_preco WHERE id::text = $1`, [ataId]);
    if (!a?.licitacao_id) return null;
    const ctx = await this.contexto(a.licitacao_id);
    if (!ctx?.publicaAqui) return null;
    return this.enfileirar({ tipo: TipoSincronizacao.ATA, licitacaoId: a.licitacao_id, orgaoId: a.orgao_id, entidadeId: a.id, chave: chaveFila.ata(a.id), referencia: { ata_id: a.id } });
  }

  // ==========================================================================
  // WORKER
  // ==========================================================================

  @Cron(CronExpression.EVERY_MINUTE, { name: 'pncp-fila' })
  async cron(): Promise<void> {
    try {
      const r = await this.processarFila();
      if (r.processados) this.logger.log(`[PNCP] fila: ${r.enviados} enviado(s), ${r.erros} erro(s), ${r.aguardando} aguardando`);
    } catch (e) {
      this.logger.error(`[PNCP] worker da fila falhou: ${(e as Error).message}`);
    }
  }

  /**
   * Processa a fila em ordem de dependência até não haver mais nada elegível
   * (ou `limite`). Uma instância por vez (pg_try_advisory_lock). Exportado para
   * os testes e para o "reenviar agora".
   */
  async processarFila(opts: { agora?: Date; licitacaoId?: string; limite?: number } = {}): Promise<ResumoFila> {
    await Promise.allSettled([...this.emCurso]);
    const resumo: ResumoFila = { bloqueado: false, processados: 0, enviados: 0, erros: 0, aguardando: 0 };
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    try {
      const [{ ok }] = await qr.query(`SELECT pg_try_advisory_lock(hashtext($1)) AS ok`, [TRAVA_FILA]);
      if (!ok) return { ...resumo, bloqueado: true };
      try {
        await this.recuperarAbandonados(opts.agora ?? new Date());
        const feitos: string[] = [];
        const limite = opts.limite ?? 200;
        while (feitos.length < limite) {
          const agora = opts.agora ?? new Date();
          const [prox] = await this.ds.query(
            `SELECT s.id FROM pncp_sync s
              WHERE s.chave_idempotencia IS NOT NULL
                AND s.status::text IN ('PENDENTE','ERRO_TEMPORARIO')
                AND (s.proximo_envio IS NULL OR s.proximo_envio <= $1)
                AND ($2::text IS NULL OR s.licitacao_id::text = $2::text)
                AND NOT (s.id = ANY($3::uuid[]))
                AND NOT EXISTS (
                  SELECT 1 FROM pncp_sync p
                   WHERE p.licitacao_id::text = s.licitacao_id::text AND p.id <> s.id AND p.chave_idempotencia IS NOT NULL
                     AND p.status::text IN ('PENDENTE','ENVIANDO','ERRO_TEMPORARIO')
                     AND (p.ordem < s.ordem OR (p.ordem = s.ordem AND p.created_at < s.created_at AND s.tipo::text = ANY($4::text[]))))
              ORDER BY s.ordem, s.created_at LIMIT 1`,
            [agora, opts.licitacaoId ?? null, feitos, OPERACOES_SEQUENCIAIS],
          );
          if (!prox) break;
          feitos.push(prox.id);
          const r = await this.processarRegistro(prox.id, { agora });
          if (!r) continue;
          resumo.processados += 1;
          if (r.status === StatusSincronizacao.ENVIADO) resumo.enviados += 1;
          else if (r.status === StatusSincronizacao.PENDENTE) resumo.aguardando += 1;
          else resumo.erros += 1;
        }
      } finally {
        await qr.query(`SELECT pg_advisory_unlock(hashtext($1))`, [TRAVA_FILA]);
      }
    } finally {
      await qr.release();
    }
    return resumo;
  }

  /** Envio interrompido no meio (processo caiu): volta à fila como erro temporário. */
  private async recuperarAbandonados(agora: Date) {
    await this.ds.query(
      `UPDATE pncp_sync SET status = 'ERRO_TEMPORARIO', erro_mensagem = 'Envio interrompido — será tentado de novo', proximo_envio = $1, updated_at = now()
        WHERE status::text = 'ENVIANDO' AND chave_idempotencia IS NOT NULL AND ultima_tentativa < $2`,
      [agora, new Date(agora.getTime() - ENVIANDO_ABANDONADO_MS)],
    );
  }

  /**
   * Uma tentativa de UMA linha: reserva (ENVIANDO) por UPDATE condicional —
   * nunca duas instâncias no mesmo registro —, executa e grava o desfecho.
   */
  async processarRegistro(id: string, opts: { agora?: Date; forcar?: boolean } = {}): Promise<PncpSync | null> {
    const aceitos = opts.forcar ? STATUS_REENVIAVEIS : STATUS_PROCESSAVEIS;
    const res = await this.ds.query(
      `UPDATE pncp_sync SET status = 'ENVIANDO', ultima_tentativa = now(), updated_at = now(),
              tentativas = CASE WHEN $3 AND status::text IN ('ERRO_DEFINITIVO','ERRO') THEN 0 ELSE tentativas END
        WHERE id = $1 AND status::text = ANY($2::text[]) AND chave_idempotencia IS NOT NULL
        RETURNING *`,
      [id, aceitos, !!opts.forcar],
    );
    // UPDATE … RETURNING no driver pg do TypeORM devolve [linhas, quantidade]
    const linhas: PncpSync[] = Array.isArray(res?.[0]) ? res[0] : res;
    const linha: PncpSync | null = linhas?.[0] ?? null;
    if (!linha) return null;
    const agora = opts.agora ?? new Date();
    try {
      const res = await this.envios.executar(linha);
      await this.gravarSucesso(linha, res);
    } catch (e) {
      const erro = e instanceof ErroPncp ? e : new ErroPncp(`Erro interno: ${(e as Error)?.message ?? e}`, 'TEMPORARIA');
      if (recusaBenigna(linha.tipo, erro.message)) {
        await this.gravarSucesso(linha, { observacao: `PNCP informou que já existe: ${erro.message}` });
      } else {
        const d = decidirAposFalha(linha, { natureza: erro.natureza, mensagem: erro.message }, agora);
        // Retorno REAL do PNCP guardado na linha: código HTTP e corpo da resposta
        // (a dependência não satisfeita não é resposta do PNCP — não sobrescreve)
        const corpo = erro.corpo === undefined ? null : JSON.stringify(erro.corpo).slice(0, 20_000);
        await this.ds.query(
          `UPDATE pncp_sync SET status = $2, tentativas = $3, proximo_envio = $4, erro_mensagem = $5,
                  erro_status_http = CASE WHEN $8 THEN erro_status_http ELSE $6 END,
                  erro_resposta = CASE WHEN $8 THEN erro_resposta ELSE $7::jsonb END, updated_at = now() WHERE id = $1`,
          [linha.id, d.status, d.tentativas, d.proximo_envio, d.erro_mensagem, erro.statusHttp ?? null, corpo, erro.natureza === 'DEPENDENCIA'],
        );
        const nivel = d.status === StatusSincronizacao.PENDENTE ? 'debug' : 'warn';
        this.logger[nivel](`[PNCP] ${linha.tipo} ${linha.licitacao_id ?? ''}: ${d.status} — ${d.erro_mensagem}`);
      }
    }
    return this.ds.getRepository(PncpSync).findOne({ where: { id: linha.id } });
  }

  private async gravarSucesso(linha: PncpSync, res: ResultadoEnvio) {
    await this.ds.query(
      `UPDATE pncp_sync SET status = 'ENVIADO', tentativas = tentativas + 1, proximo_envio = NULL, erro_mensagem = NULL, enviado_em = now(),
              erro_status_http = NULL, erro_resposta = NULL,
              resposta_pncp = $2::jsonb, payload_enviado = COALESCE($3::jsonb, payload_enviado),
              numero_controle_pncp = COALESCE($4, numero_controle_pncp), ano_compra = COALESCE($5, ano_compra),
              sequencial_compra = COALESCE($6, sequencial_compra), updated_at = now()
        WHERE id = $1`,
      [
        linha.id,
        JSON.stringify({ ...(res.resposta && typeof res.resposta === 'object' ? res.resposta : { corpo: res.resposta ?? null }), ...(res.observacao ? { observacao: res.observacao } : {}) }),
        res.payload === undefined ? null : JSON.stringify(res.payload),
        res.numeroControle ?? null,
        res.ano ?? null,
        res.sequencial ?? null,
      ],
    );
    // Dependência satisfeita: as operações da licitação que esperavam por esta
    // (ex.: itens aguardando a compra) são reavaliadas já, sem esperar o intervalo.
    if (linha.licitacao_id) {
      await this.ds.query(
        `UPDATE pncp_sync SET proximo_envio = NULL, updated_at = now()
          WHERE licitacao_id::text = $1 AND id <> $2 AND status::text = 'PENDENTE' AND chave_idempotencia IS NOT NULL
            AND erro_mensagem LIKE 'Aguardando:%'`,
        [linha.licitacao_id, linha.id],
      );
    }
    // COMPRA aceita pelo PNCP = divulgação OFICIAL (arts. 54 e 174): a licitação
    // sai de AGUARDANDO_DIVULGACAO, o prazo passa a correr (cronograma
    // reconferido pela data confirmada) e o recebimento começa, se for a hora.
    if (linha.tipo === TipoSincronizacao.COMPRA && linha.licitacao_id) {
      try {
        await confirmarDivulgacaoOficial(
          this.transicoes,
          this.ds,
          linha.licitacao_id,
          { meio: 'PNCP', referencia: res.numeroControle ?? linha.numero_controle_pncp ?? null },
          atorSistema('pncp'),
        );
      } catch (e) {
        this.logger.error(`[PNCP] compra ${linha.licitacao_id} enviada, mas a confirmação da divulgação falhou: ${(e as Error).message}`);
      }
    }
  }

  // ==========================================================================
  // TELAS: fila da licitação e "reenviar agora"
  // ==========================================================================

  async listarFila(licitacaoId: string): Promise<LinhaFila[]> {
    const linhas: Array<LinhaFila & { ordem: number }> = await this.ds.query(
      `SELECT ${SELECT_LINHA} FROM pncp_sync WHERE licitacao_id::text = $1 AND tipo::text <> 'PCA' ORDER BY ordem, created_at`,
      [licitacaoId],
    );
    return linhas.map(({ ordem: _o, ...l }) => {
      const referencia = l.referencia ? { ...l.referencia } : null;
      if (referencia) delete referencia.ator;
      return { ...l, referencia, rotulo: ROTULO_OPERACAO[l.tipo] ?? l.tipo };
    });
  }

  /** Dono (órgão) da linha da fila, para a checagem de acesso. */
  async orgaoDaLinha(id: string): Promise<{ licitacaoId: string | null; orgaoId: string | null } | null> {
    const [l] = await this.ds.query(
      `SELECT s.licitacao_id, COALESCE(l.orgao_id::text, s.orgao_id) AS orgao_id
         FROM pncp_sync s LEFT JOIN licitacoes l ON l.id::text = s.licitacao_id::text WHERE s.id::text = $1`,
      [id],
    );
    return l ? { licitacaoId: l.licitacao_id, orgaoId: l.orgao_id } : null;
  }

  /**
   * "Reenviar agora" (ato do órgão): processa a linha já, inclusive erro
   * definitivo (zera as tentativas), e depois o que dependia dela. Registro
   * anterior à fila (sem chave) é convertido na operação equivalente.
   */
  async reenviarAgora(id: string, ator: AtorTransicao = atorSistema('pncp')): Promise<LinhaFila> {
    let linha = await this.ds.getRepository(PncpSync).findOne({ where: { id } });
    if (!linha) throw new NotFoundException('Registro da fila do PNCP não encontrado');
    if (!linha.chave_idempotencia) {
      const convertida = await this.converterLegado(linha, ator);
      if (!convertida) throw new BadRequestException('Registro anterior à fila sem operação equivalente — use os botões de envio do processo.');
      linha = convertida;
    }
    if (linha.status === StatusSincronizacao.ENVIADO) throw new BadRequestException('Operação já enviada ao PNCP.');
    await this.processarRegistro(linha.id, { forcar: true });
    if (linha.licitacao_id) await this.processarFila({ licitacaoId: linha.licitacao_id });
    const [atual] = (await this.listarFila(linha.licitacao_id ?? '')).filter((l) => l.id === linha!.id);
    if (atual) return atual;
    const r = await this.ds.query(`SELECT ${SELECT_LINHA} FROM pncp_sync WHERE id = $1`, [linha.id]);
    return { ...r[0], rotulo: ROTULO_OPERACAO[r[0].tipo] ?? r[0].tipo };
  }

  private async converterLegado(linha: PncpSync, ator: AtorTransicao): Promise<PncpSync | null> {
    const base = { licitacaoId: linha.licitacao_id, orgaoId: linha.orgao_id };
    if (linha.tipo === TipoSincronizacao.COMPRA && linha.licitacao_id) {
      return this.enfileirar({ ...base, tipo: TipoSincronizacao.COMPRA, chave: chaveFila.compra(linha.licitacao_id), referencia: { ator } });
    }
    if (linha.tipo === TipoSincronizacao.CONTRATO && linha.entidade_id) return this.aoAssinarContrato(linha.entidade_id);
    if (linha.tipo === TipoSincronizacao.ATA && linha.entidade_id) return this.aoAssinarAta(linha.entidade_id);
    return null;
  }

  // ==========================================================================
  // ENVIO MANUAL (cockpit / rotas do PNCP): enfileira e processa na hora
  // ==========================================================================

  private async processarAgora(linha: PncpSync): Promise<PncpSync> {
    if (linha.status === StatusSincronizacao.ENVIADO) return linha;
    const r = await this.processarRegistro(linha.id, { forcar: true });
    return r ?? (await this.ds.getRepository(PncpSync).findOneOrFail({ where: { id: linha.id } }));
  }

  private falhou(linha: PncpSync, prefixo: string): never {
    const msg = linha.erro_mensagem || `situação ${linha.status}`;
    // Mensagem de validação vai como está (a tela mostra a lista de pendências)
    throw new HttpException(msg.startsWith('Licitação não pode') ? msg : `${prefixo}: ${msg}`, HttpStatus.BAD_REQUEST);
  }

  private respostaCompra(linha: PncpSync, extra: Record<string, unknown> = {}) {
    const cnpjLink = linha.numero_controle_pncp?.split('-')[0] ?? '';
    return {
      sucesso: true,
      numeroControlePNCP: linha.numero_controle_pncp,
      ano: linha.ano_compra,
      sequencial: linha.sequencial_compra,
      link: linha.ano_compra && linha.sequencial_compra ? this.pncp.linkCompra(cnpjLink, linha.ano_compra, linha.sequencial_compra) : undefined,
      mensagem: (linha.resposta_pncp as any)?.observacao,
      ...extra,
    };
  }

  /**
   * Enviar a compra (botão/rota manual). Ainda não divulgada: o ato PUBLICAR
   * precisa ser possível AGORA (gates do E1/E7a) — conferido antes de
   * qualquer envio. Já publicada: retifica com os dados atuais.
   */
  async enviarCompraAgora(licitacaoId: string, ator: AtorTransicao) {
    const lic = await this.ds.getRepository(Licitacao).findOne({ where: { id: licitacaoId } });
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    if (ehFaseInterna(lic.fase)) {
      await this.transicoes.verificar(licitacaoId, AtoLicitacao.PUBLICAR, { ator, dados: this.pncp.dadosPublicacaoPncp(lic) });
    }
    const publicada = await this.envios.compraPublicada(licitacaoId);
    if (publicada) {
      const ret = await this.processarAgora(
        await this.enfileirar({
          tipo: TipoSincronizacao.RETIFICACAO_COMPRA,
          licitacaoId,
          orgaoId: lic.orgao_id,
          chave: chaveFila.retificacaoCompra(licitacaoId, `MANUAL:${randomUUID()}`),
          referencia: { justificativa: 'Atualização dos dados pela plataforma de origem', ator },
        }),
      );
      if (ret.status !== StatusSincronizacao.ENVIADO) this.falhou(ret, 'Erro ao atualizar compra no PNCP');
      return { sucesso: true, numeroControlePNCP: publicada.numeroControle, ano: publicada.ano, sequencial: publicada.sequencial, link: this.pncp.linkCompra(publicada.cnpj, publicada.ano, publicada.sequencial), mensagem: 'Compra atualizada no PNCP' };
    }
    const linha = await this.processarAgora(
      await this.enfileirar({ tipo: TipoSincronizacao.COMPRA, licitacaoId, orgaoId: lic.orgao_id, chave: chaveFila.compra(licitacaoId), referencia: { ator } }),
    );
    if (linha.status !== StatusSincronizacao.ENVIADO) this.falhou(linha, 'Erro ao enviar compra ao PNCP');
    return this.respostaCompra(linha);
  }

  /** Compra + itens (botão "Publicar aviso" do cockpit): o que já foi enviado não é reenviado. */
  async enviarCompraCompletaAgora(licitacaoId: string, ator: AtorTransicao) {
    const lic = await this.ds.getRepository(Licitacao).findOne({ where: { id: licitacaoId } });
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    if (ehFaseInterna(lic.fase)) {
      await this.transicoes.verificar(licitacaoId, AtoLicitacao.PUBLICAR, { ator, dados: this.pncp.dadosPublicacaoPncp(lic) });
    }
    const compra = await this.processarAgora(
      await this.enfileirar({ tipo: TipoSincronizacao.COMPRA, licitacaoId, orgaoId: lic.orgao_id, chave: chaveFila.compra(licitacaoId), referencia: { ator } }),
    );
    if (compra.status !== StatusSincronizacao.ENVIADO) this.falhou(compra, 'Erro ao enviar compra ao PNCP');
    const itens = await this.processarAgora(
      await this.enfileirar({ tipo: TipoSincronizacao.ITEM, licitacaoId, orgaoId: lic.orgao_id, chave: chaveFila.itens(licitacaoId) }),
    );
    await this.processarFila({ licitacaoId });
    return this.respostaCompra(compra, {
      itens: itens.status === StatusSincronizacao.ENVIADO ? { sucesso: true, observacao: (itens.resposta_pncp as any)?.observacao } : { sucesso: false, erro: itens.erro_mensagem },
    });
  }

  async enviarItensAgora(licitacaoId: string) {
    const lic = await this.ds.getRepository(Licitacao).findOne({ where: { id: licitacaoId } });
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    const linha = await this.processarAgora(await this.enfileirar({ tipo: TipoSincronizacao.ITEM, licitacaoId, orgaoId: lic.orgao_id, chave: chaveFila.itens(licitacaoId) }));
    if (linha.status !== StatusSincronizacao.ENVIADO) this.falhou(linha, 'Erro ao enviar itens ao PNCP');
    return { sucesso: true, mensagem: 'Itens enviados ao PNCP' };
  }

  /** Resultado por item da última homologação (mesmas chaves do disparo automático — sem duplicar). */
  async enviarResultadosAgora(licitacaoId: string) {
    const lic = await this.ds.getRepository(Licitacao).findOne({ where: { id: licitacaoId } });
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    const [h] = await this.ds.query(
      `SELECT id::text AS id FROM licitacao_transicoes WHERE licitacao_id::text = $1 AND ato = 'HOMOLOGAR' ORDER BY created_at DESC LIMIT 1`,
      [licitacaoId],
    );
    if (!h) throw new BadRequestException('Licitação ainda não homologada');
    await this.enfileirarHomologacao(licitacaoId, h.id, lic.orgao_id);
    const linhas = await this.ds.getRepository(PncpSync).find({ where: { licitacao_id: licitacaoId, tipo: TipoSincronizacao.RESULTADO } });
    const resultados: Array<{ item: string; sucesso: boolean; erro?: string }> = [];
    for (const l of linhas.filter((x) => x.chave_idempotencia?.endsWith(`:${h.id}`))) {
      const r = await this.processarAgora(l);
      resultados.push({ item: String(l.entidade_id), sucesso: r.status === StatusSincronizacao.ENVIADO, ...(r.status === StatusSincronizacao.ENVIADO ? {} : { erro: r.erro_mensagem ?? r.status }) });
    }
    await this.processarFila({ licitacaoId });
    const enviados = resultados.filter((r) => r.sucesso).length;
    return { sucesso: enviados > 0, total: resultados.length, enviados, resultados };
  }

  /** Contratos da licitação: só os ASSINADOS vão ao PNCP (art. 94). */
  async enviarContratosAgora(licitacaoId: string) {
    const contratos: Array<{ id: string; numero_contrato: string; data_assinatura: Date | null }> = await this.ds.query(
      `SELECT id::text AS id, numero_contrato, data_assinatura FROM contratos WHERE licitacao_id::text = $1 ORDER BY numero_contrato`,
      [licitacaoId],
    );
    if (!contratos.length) throw new BadRequestException('Nenhum contrato gerado para esta licitação');
    const resultados: Array<{ contrato: string; sucesso: boolean; numeroControlePNCP?: string | null; erro?: string }> = [];
    for (const c of contratos) {
      if (!c.data_assinatura) {
        resultados.push({ contrato: c.numero_contrato, sucesso: false, erro: 'Aguardando as assinaturas (art. 94: publica-se o contrato assinado)' });
        continue;
      }
      const linha = await this.aoAssinarContrato(c.id);
      if (!linha) {
        resultados.push({ contrato: c.numero_contrato, sucesso: false, erro: 'Órgão sem integração com o PNCP ou compra não publicada' });
        continue;
      }
      const r = await this.processarAgora(linha);
      resultados.push({ contrato: c.numero_contrato, sucesso: r.status === StatusSincronizacao.ENVIADO, numeroControlePNCP: r.numero_controle_pncp, ...(r.status === StatusSincronizacao.ENVIADO ? {} : { erro: r.erro_mensagem ?? r.status }) });
    }
    const enviados = resultados.filter((r) => r.sucesso).length;
    return { sucesso: enviados > 0, total: resultados.length, enviados, resultados };
  }

  /** Contrato isolado (tela do contrato). */
  async enviarContratoAgora(contratoId: string) {
    const [c] = await this.ds.query(`SELECT data_assinatura, licitacao_id FROM contratos WHERE id::text = $1`, [contratoId]);
    if (!c) throw new NotFoundException('Contrato não encontrado');
    if (!c.data_assinatura) throw new BadRequestException('O contrato só vai ao PNCP depois de assinado por todas as partes (art. 94).');
    const linha = await this.aoAssinarContrato(contratoId);
    if (!linha) throw new BadRequestException('Contrato sem licitação publicada no PNCP por esta plataforma.');
    const r = await this.processarAgora(linha);
    if (r.status !== StatusSincronizacao.ENVIADO) this.falhou(r, 'Erro ao enviar contrato ao PNCP');
    return { sucesso: true, numeroControlePNCP: r.numero_controle_pncp, mensagem: 'Contrato publicado no PNCP' };
  }

  /** Documento anexado manualmente: o arquivo é guardado (pasta sensível) e referenciado pela fila. */
  async enviarDocumentoAgora(licitacaoId: string, tipoDocumentoId: number, arquivo: Buffer, nomeArquivo: string) {
    const lic = await this.ds.getRepository(Licitacao).findOne({ where: { id: licitacaoId } });
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    const id = randomUUID();
    const nome = `${id}-${String(nomeArquivo || 'documento.pdf').replace(/[^\w.-]/g, '_')}`;
    const dir = path.join(diretorioDeGravacao('pncp'), licitacaoId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, nome), arquivo);
    const linha = await this.processarAgora(
      await this.enfileirar({
        tipo: TipoSincronizacao.DOCUMENTO,
        licitacaoId,
        orgaoId: lic.orgao_id,
        chave: chaveFila.documento(licitacaoId, `ARQ:${id}`),
        referencia: { origem: 'ARQUIVO', arquivo: `pncp/${licitacaoId}/${nome}`, nome: nomeArquivo, tipo_documento_id: tipoDocumentoId, titulo: nomeArquivo },
      }),
    );
    if (linha.status !== StatusSincronizacao.ENVIADO) this.falhou(linha, 'Erro ao enviar documento ao PNCP');
    return { sucesso: true, mensagem: 'Documento enviado com sucesso' };
  }
}
