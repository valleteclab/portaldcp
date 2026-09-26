import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { Ator } from '../../auth/acesso/ator';
import { ehFaseInterna } from '../../licitacoes/transicoes/fases';
import { definicaoDoFundamento, fundamentoEfetivo, textoDoFundamento } from '../../licitacoes/fundamento-legal';
import { PortalAssinaturasService } from '../../portal-assinaturas/portal-assinaturas.service';
import { DocumentoFaseInterna, StatusDocumento, TipoDocumentoFaseInterna } from '../entities/documento-fase-interna.entity';
import { AcaoLogFaseInterna } from '../entities/log-fase-interna.entity';
import { AuditLogService } from '../audit-log.service';
import { FaseInternaService } from '../fase-interna.service';
import { PecasFaseInternaService } from '../pecas-fase-interna.service';
import { OrcamentoService } from '../orcamento/orcamento.service';
import { TarefasService } from '../tarefas/tarefas.service';
import { PassoFaseInterna, PapelFaseInterna } from '../tarefas/etapas-fase-interna';
import { Autor, MinutasTelaService } from './minutas-tela.service';
import { portaoBArt72, resumoDaAutorizacao, situacaoDaAutorizacao, situacaoDasAssinaturas, SignatarioSituacao } from './autorizacao-regras';

const AA = TipoDocumentoFaseInterna.AUTORIZACAO_ABERTURA;
/** Tarefa do agente quando a autoridade devolve (uma aberta por processo). */
export const CHAVE_TAREFA_DEVOLUCAO = 'sistema:autorizacao-devolvida';

const ROTULO_MODALIDADE: Record<string, string> = {
  DISPENSA_ELETRONICA: 'Dispensa',
  INEXIGIBILIDADE: 'Inexigibilidade',
  PREGAO_ELETRONICO: 'Pregão eletrônico',
  PREGAO_PRESENCIAL: 'Pregão presencial',
  CONCORRENCIA_ELETRONICA: 'Concorrência eletrônica',
  CONCORRENCIA_PRESENCIAL: 'Concorrência presencial',
  CREDENCIAMENTO: 'Credenciamento',
};

/**
 * AUTORIZAÇÃO DA AUTORIDADE (etapa 6 — Entrega 3B; mockup Autorizacao, 390 px).
 *
 *  - Despacho (peça AA) gerado pelo MODELO com objeto, fundamento, teto (valor
 *    estimado da pesquisa), dotação da reserva e leis da tabela única; ou o
 *    despacho assinado FORA, anexado (setor manual).
 *  - Autoridade COLEGIADA: os signatários e papéis vêm da configuração do
 *    órgão (ex.: Mesa Diretora com 4) — a autorização só vale quando TODOS
 *    assinam (portal de assinaturas; a data do despacho é a da última).
 *  - No celular: resumo + "Autorizar e assinar" (só o signatário designado,
 *    com o próprio login) e "Devolver com observação" (motivo → tarefa do agente).
 *  - Portão B (art. 72) só é MOSTRADO; o bloqueio vem na Entrega 4.
 * Decisão (memória do projeto): o agente opera, a autoridade assina — o
 * despacho sai em nome da autoridade.
 */
@Injectable()
export class AutorizacaoTelaService {
  private readonly logger = new Logger(AutorizacaoTelaService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(DocumentoFaseInterna) private readonly docRepo: Repository<DocumentoFaseInterna>,
    private readonly faseInterna: FaseInternaService,
    private readonly minutas: MinutasTelaService,
    private readonly pecas: PecasFaseInternaService,
    private readonly orcamento: OrcamentoService,
    private readonly tarefas: TarefasService,
    private readonly assinaturas: PortalAssinaturasService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Signatários da autorização: os da configuração; senão os usuários com o papel AUTORIDADE. */
  async signatariosConfigurados(orgaoId: string): Promise<Array<{ usuario_id: string; nome: string; papel: string; email: string | null; ativo: boolean }>> {
    const config = await this.tarefas.configuracao(orgaoId);
    if (config.signatarios_autorizacao.length) {
      const ids = config.signatarios_autorizacao.map((s) => s.usuario_id);
      const us: any[] = await this.ds.query(`SELECT id::text AS id, nome, email, ativo FROM usuarios WHERE orgao_id::text = $1 AND id::text = ANY($2::text[])`, [orgaoId, ids]);
      return config.signatarios_autorizacao
        .map((s) => {
          const u = us.find((x) => x.id === s.usuario_id);
          return u ? { usuario_id: u.id, nome: u.nome, papel: s.papel, email: u.email ?? null, ativo: !!u.ativo } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x);
    }
    const us: any[] = await this.ds.query(
      `SELECT id::text AS id, nome, email, cargo FROM usuarios
        WHERE orgao_id::text = $1 AND ativo = true AND COALESCE(papeis_fase_interna, '[]'::jsonb) ? $2 ORDER BY nome LIMIT 15`,
      [orgaoId, PapelFaseInterna.AUTORIDADE],
    );
    return us.map((u) => ({ usuario_id: u.id, nome: u.nome, papel: u.cargo || config.autoridade_rotulo, email: u.email ?? null, ativo: true }));
  }

  private async signatariosDaPeca(doc: DocumentoFaseInterna | null): Promise<SignatarioSituacao[]> {
    if (!doc?.signatarios_exigidos?.length) return [];
    const sigs: any[] = doc.documento_assinatura_id
      ? await this.ds.query(`SELECT email, status::text AS status, data_assinatura FROM signatarios_documento WHERE documento_id::text = $1`, [doc.documento_assinatura_id])
      : [];
    return doc.signatarios_exigidos.map((s) => {
      const sig = sigs.find((x) => x.email && s.email && String(x.email).toLowerCase() === String(s.email).toLowerCase());
      const assinada = (doc.assinaturas ?? []).find((a) => a.assinante_id === s.usuario_id);
      return {
        usuario_id: s.usuario_id,
        nome: s.nome,
        papel: s.papel,
        status: sig?.status ?? (assinada ? 'ASSINADO' : doc.status === StatusDocumento.ASSINADO ? 'ASSINADO' : 'PENDENTE'),
        data_assinatura: sig?.data_assinatura ?? assinada?.data_assinatura ?? null,
      };
    });
  }

  /** Tela da autorização (desktop e celular) — `ator` para "posso assinar?". */
  async obter(licitacaoId: string, ator: Ator) {
    const lic = await this.minutas.licitacao(licitacaoId);
    const instrucao = await this.faseInterna.getInstrucao(licitacaoId);
    const doc = await this.minutas.docAtual(licitacaoId, AA);
    const fundamento = fundamentoEfetivo(lic);
    const [{ total }] = await this.ds.query(
      `SELECT COALESCE(SUM(COALESCE(valor_total_estimado, quantidade * COALESCE(valor_unitario_estimado, 0))), 0)::float AS total
         FROM itens_licitacao WHERE licitacao_id::text = $1 AND status::text <> 'CANCELADO'`,
      [licitacaoId],
    );
    const teto = Number(total) > 0 ? Number(total) : Number(lic.valor_total_estimado) || null;
    const reserva = await this.orcamento.resumoParaTr(licitacaoId);
    const [dfd] = await this.ds.query(
      `SELECT dados_estruturados->'_dfd'->>'unidade_requisitante_nome' AS unidade FROM documentos_fase_interna
        WHERE licitacao_id::text = $1 AND tipo::text = 'DFD' AND versao_atual = true LIMIT 1`,
      [licitacaoId],
    );
    const [folhas] = await this.ds.query(`SELECT MAX(folha_final)::int AS n FROM documentos_fase_interna WHERE licitacao_id::text = $1 AND versao_atual = true`, [licitacaoId]);
    const signatarios = await this.signatariosDaPeca(doc);
    const configurados = await this.signatariosConfigurados(lic.orgao_id);
    const config = await this.tarefas.configuracao(lic.orgao_id);
    const situacao = situacaoDaAutorizacao(doc);
    const devolucoes = (doc?.dados_estruturados?._devolucoes ?? []) as any[];
    const resumo = resumoDaAutorizacao({
      numero_processo: lic.numero_processo,
      objeto: lic.objeto,
      modalidade_rotulo: ROTULO_MODALIDADE[lic.modalidade] ?? lic.modalidade,
      fundamento_referencia: definicaoDoFundamento(fundamento)?.referencia ?? null,
      teto,
      sigiloso: lic.sigilo_orcamento === 'SIGILOSO',
      reserva: reserva ? { status: reserva.status, texto: reserva.texto } : null,
      requisitante: dfd?.unidade ?? null,
      itens: instrucao.itens,
      folhas: folhas?.n ?? null,
    });
    const minhas = situacaoDasAssinaturas(signatarios, ator.usuarioId);
    const podeDevolver = await this.podeDecidir(lic.orgao_id, doc, ator);
    return {
      licitacao: {
        id: lic.id,
        numero_processo: lic.numero_processo,
        objeto: lic.objeto,
        modalidade: lic.modalidade,
        fase: lic.fase,
        fase_interna: ehFaseInterna(lic.fase),
      },
      contratacao_direta: instrucao.contratacao_direta,
      situacao,
      autoridade: config.autoridade_rotulo,
      resumo,
      fundamento_legal: { codigo: fundamento, texto: textoDoFundamento(fundamento) },
      dotacao: reserva,
      peca: this.minutas.resumoPeca(doc),
      secoes: doc ? Object.fromEntries(Object.entries(doc.dados_estruturados || {}).filter(([k, v]) => !k.startsWith('_') && typeof v === 'string')) : {},
      designacao: instrucao.itens.find((i) => i.tipo === 'DP') ?? null,
      signatarios,
      signatarios_configurados: configurados,
      assinaturas: minhas,
      pode_devolver: podeDevolver && situacao === 'AGUARDANDO_ASSINATURAS',
      devolucoes,
      ultima_devolucao: devolucoes.length ? devolucoes[devolucoes.length - 1] : null,
      autos_pdf: `/api/licitacoes/${lic.id}/processo-pdf`,
    };
  }

  /** Quem decide (assina/devolve): signatário designado da peça ou quem tem o papel AUTORIDADE. */
  private async podeDecidir(orgaoId: string, doc: DocumentoFaseInterna | null, ator: Ator): Promise<boolean> {
    if (!ator.usuarioId) return false;
    if ((doc?.signatarios_exigidos ?? []).some((s) => s.usuario_id === ator.usuarioId)) return true;
    const [u] = await this.ds.query(
      `SELECT 1 FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2 AND ativo = true AND COALESCE(papeis_fase_interna, '[]'::jsonb) ? $3`,
      [ator.usuarioId, orgaoId, PapelFaseInterna.AUTORIDADE],
    );
    return !!u;
  }

  private exigirFaseInterna(lic: { fase: string }) {
    if (!ehFaseInterna(lic.fase)) throw new ConflictException('A fase interna foi encerrada — a autorização não muda mais.');
  }

  /** Gera (ou regera) o despacho pelo modelo — o texto só vale depois de assinado. */
  async gerar(licitacaoId: string, ator: Ator, autor: Autor) {
    const lic = await this.minutas.licitacao(licitacaoId);
    this.exigirFaseInterna(lic);
    const atual = await this.minutas.docAtual(licitacaoId, AA);
    if (atual?.status === StatusDocumento.AGUARDANDO_ASSINATURA) {
      throw new ConflictException('O despacho está com a autoridade para assinatura — aguarde ou peça a devolução.');
    }
    await this.minutas.gerarPorModelo(licitacaoId, AA, autor, { extras: atual?.dados_estruturados?._devolucoes ? { _devolucoes: atual.dados_estruturados._devolucoes } : {} });
    return this.obter(licitacaoId, ator);
  }

  /**
   * Envia o despacho para a autoridade (todos os signatários da configuração
   * ou os informados). Sem despacho gerado, gera antes. Conclui a tarefa de
   * devolução, se houver.
   */
  async enviar(licitacaoId: string, body: any, ator: Ator, autor: Autor) {
    const lic = await this.minutas.licitacao(licitacaoId);
    this.exigirFaseInterna(lic);
    let doc = await this.minutas.docAtual(licitacaoId, AA);
    if (doc?.status === StatusDocumento.AGUARDANDO_ASSINATURA) throw new ConflictException('O despacho já está aguardando as assinaturas.');
    if (doc?.status === StatusDocumento.ASSINADO) throw new ConflictException('A autorização já está assinada.');
    if (doc && doc.origem !== 'INTERNO') throw new ConflictException('A autorização foi anexada (assinada fora). Para refazer aqui, gere um novo despacho.');
    if (!doc || doc.status === StatusDocumento.REPROVADO || doc.dados_estruturados?.nao_se_aplica) {
      doc = await this.minutas.gerarPorModelo(licitacaoId, AA, autor, { extras: doc?.dados_estruturados?._devolucoes ? { _devolucoes: doc.dados_estruturados._devolucoes } : {} });
    }
    const informados = Array.isArray(body?.signatarios) ? body.signatarios : null;
    const signatarios = informados?.length
      ? informados
      : (await this.signatariosConfigurados(lic.orgao_id)).filter((s) => s.ativo).map((s) => ({ usuario_id: s.usuario_id, papel: s.papel }));
    if (!signatarios.length) {
      throw new BadRequestException('Defina quem assina a autorização (Configurações › Fase interna › Autorização) ou escolha os signatários.');
    }
    await this.pecas.enviarParaAssinatura(licitacaoId, AA, { signatarios }, ator);
    await this.tarefas.concluirTarefaPorChave(licitacaoId, CHAVE_TAREFA_DEVOLUCAO, autor);
    return this.obter(licitacaoId, ator);
  }

  /** "Autorizar e assinar" — só o signatário designado, com o próprio login. */
  async assinar(licitacaoId: string, ator: Ator, rede: { ip?: string; userAgent?: string }) {
    const lic = await this.minutas.licitacao(licitacaoId);
    this.exigirFaseInterna(lic);
    const doc = await this.minutas.docAtual(licitacaoId, AA);
    if (!doc) throw new NotFoundException('Não há despacho de autorização.');
    if (!(doc.signatarios_exigidos ?? []).some((s) => s.usuario_id === ator.usuarioId)) {
      throw new ForbiddenException('Só os signatários designados assinam a autorização.');
    }
    const r = await this.pecas.assinarComoSignatario(licitacaoId, AA, ator, rede);
    return { ...(await this.obter(licitacaoId, ator)), concluida: r.concluida };
  }

  /**
   * "Devolver com observação": a autoridade (signatário designado ou papel
   * AUTORIDADE) devolve o despacho com o MOTIVO. O pedido de assinatura é
   * cancelado, o despacho fica DEVOLVIDO (não conta como pronto) e nasce a
   * tarefa do agente com o motivo. As assinaturas já dadas não valem para a
   * nova versão (o texto muda).
   */
  async devolver(licitacaoId: string, body: any, ator: Ator, autor: Autor) {
    const lic = await this.minutas.licitacao(licitacaoId);
    this.exigirFaseInterna(lic);
    const motivo = String(body?.motivo ?? '').trim().slice(0, 2000);
    if (motivo.length < 10) throw new BadRequestException('Informe o motivo da devolução (fica registrado e vai para o agente).');
    const doc = await this.minutas.docAtual(licitacaoId, AA);
    if (!doc) throw new NotFoundException('Não há despacho de autorização.');
    if (!(await this.podeDecidir(lic.orgao_id, doc, ator))) throw new ForbiddenException('Só a autoridade (signatário designado) devolve a autorização.');
    if (doc.status !== StatusDocumento.AGUARDANDO_ASSINATURA) throw new ConflictException('Só o despacho aguardando assinatura pode ser devolvido.');
    if (doc.documento_assinatura_id) {
      await this.assinaturas.cancelarDocumento(doc.documento_assinatura_id, lic.orgao_id).catch((e: any) => this.logger.warn(`Pedido de assinatura não cancelado: ${e?.message ?? e}`));
    }
    const devolucao = { motivo, por_id: autor.id, por_nome: autor.nome, em: new Date().toISOString(), versao: doc.versao };
    const dados = { ...(doc.dados_estruturados || {}), _devolucoes: [...((doc.dados_estruturados?._devolucoes as any[]) ?? []), devolucao] };
    await this.docRepo.update(doc.id, {
      status: StatusDocumento.REPROVADO,
      observacao_aprovacao: motivo,
      aprovador_id: autor.id ?? undefined,
      aprovador_nome: autor.nome ?? undefined,
      data_aprovacao: new Date(),
      dados_estruturados: dados,
    } as any);
    this.tarefas.agendar(licitacaoId);
    await this.tarefas.criarTarefaDoSistema(licitacaoId, {
      chave: CHAVE_TAREFA_DEVOLUCAO,
      passo: PassoFaseInterna.AUTORIZACAO,
      titulo: 'Autorização devolvida — corrigir e reenviar',
      descricao: `Processo ${lic.numero_processo}. ${autor.nome ?? 'A autoridade'} devolveu o despacho de autorização: "${motivo}". Corrija a instrução/o despacho e reenvie para assinatura.`,
      tipo_peca: 'AA',
      documento_id: doc.id,
      responsavel: await this.tarefas.agenteDoProcesso(licitacaoId),
    });
    await this.auditLog
      .log({
        licitacao_id: licitacaoId,
        documento_id: doc.id,
        acao: AcaoLogFaseInterna.DOCUMENTO_REPROVADO,
        descricao: `Autorização devolvida por ${autor.nome ?? 'autoridade'}: ${motivo}`,
        dados_depois: devolucao,
        contexto: { usuario_id: autor.id ?? undefined, usuario_nome: autor.nome ?? undefined },
      })
      .catch(() => undefined);
    return this.obter(licitacaoId, ator);
  }

  /** Despacho assinado fora (anexo): conclui a tarefa de devolução pendente. */
  async aoAnexarDespacho(licitacaoId: string, autor: Autor) {
    await this.tarefas.concluirTarefaPorChave(licitacaoId, CHAVE_TAREFA_DEVOLUCAO, autor);
  }

  /** Portão B isolado (para outras telas). */
  async portaoB(licitacaoId: string) {
    const instrucao = await this.faseInterna.getInstrucao(licitacaoId);
    return portaoBArt72(instrucao.itens);
  }
}
