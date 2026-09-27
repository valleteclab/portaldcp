import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type { Ator } from '../auth/acesso/ator';
import { ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { executarMigracaoDeBoot } from '../common/migracao-boot';
import { AprovacaoService } from './aprovacao.service';
import {
  MODELOS_PRONTOS_SEMENTE,
  PessoaAprovadora,
  deveSubmeterAutomaticamente,
  fluxoEhGenerico,
  fluxoParaTipo,
  podeDecidirEtapa,
  rascunhoDoModelo,
  responsavelDaEtapa,
  rotuloAguardando,
  tituloDoTipo,
  validarModeloPronto,
} from './aprovacao-pecas-regras';
import { AprovacaoDocumento, ModeloFluxoAprovacao, StatusEtapaAprovacao } from './entities/fluxo-aprovacao.entity';
import { DocumentoFaseInterna, OrigemDocumento, TipoDocumentoFaseInterna } from './entities/documento-fase-interna.entity';
import { ROTULO_TIPO_PROCESSO, TIPOS_PROCESSO_FLUXO } from './fluxo/modelo-fluxo';
import { ModeloFluxoService } from './fluxo/modelo-fluxo.service';
import { PecasFaseInternaService } from './pecas-fase-interna.service';
import { TarefasService } from './tarefas/tarefas.service';

const FASES_INTERNAS = new Set(['PLANEJAMENTO', 'TERMO_REFERENCIA', 'PESQUISA_PRECOS', 'ANALISE_JURIDICA', 'APROVACAO_INTERNA']);

/**
 * APROVAÇÃO INTERNA DAS PEÇAS NAS TELAS DAS ETAPAS.
 *
 * O fluxo de aprovação de documentos (Configurações › Fluxos de aprovação)
 * passa a valer nas telas novas das etapas:
 *  - peça EMITIDA (gerada no sistema) ou ANEXADA pela etapa, numa etapa com
 *    "aprovação interna" ligada no modelo de fluxo, vai SOZINHA para o fluxo
 *    do órgão (do tipo → genérico → aprovação única). Roda depois do commit,
 *    na fila do processo (rotina "antes de sincronizar" das tarefas) — nunca
 *    dentro da transação de um ato;
 *  - quem decide é SEMPRE o usuário do token, e só a etapa que é dele (a
 *    pessoa indicada; senão o setor; sem responsável, quem conduz o processo)
 *    — senão 403; a última etapa com assinatura aprova ASSINANDO a peça pelo
 *    portal de assinaturas (o mesmo caminho do parecer);
 *  - a Central de Aprovações (aba Documentos) mostra a cada um só as etapas dele;
 *  - catálogo de MODELOS PRONTOS (dados semeados no boot; só o admin da
 *    plataforma altera) e a COBERTURA (quais etapas têm aprovação interna e
 *    qual fluxo vale para cada peça) para a tela de configuração.
 */
@Injectable()
export class AprovacaoPecasService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(AprovacaoPecasService.name);
  /** Uma avaliação por processo de cada vez (a varredura e o aviso direto da etapa não enviam em dobro). */
  private readonly travas = new Map<string, Promise<unknown>>();

  private emFila<T>(licitacaoId: string, fn: () => Promise<T>): Promise<T> {
    const anterior = this.travas.get(licitacaoId) ?? Promise.resolve();
    const vez = anterior.catch(() => undefined).then(fn);
    const fim = vez.catch(() => undefined);
    this.travas.set(licitacaoId, fim);
    void fim.then(() => {
      if (this.travas.get(licitacaoId) === fim) this.travas.delete(licitacaoId);
    });
    return vez;
  }

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(DocumentoFaseInterna) private readonly docRepo: Repository<DocumentoFaseInterna>,
    @InjectRepository(AprovacaoDocumento) private readonly etapaRepo: Repository<AprovacaoDocumento>,
    @InjectRepository(ModeloFluxoAprovacao) private readonly modeloRepo: Repository<ModeloFluxoAprovacao>,
    private readonly aprovacao: AprovacaoService,
    private readonly tarefas: TarefasService,
    private readonly modeloFluxo: ModeloFluxoService,
    private readonly pecas: PecasFaseInternaService,
  ) {}

  onModuleInit() {
    // Depois do commit, na fila do processo, antes de sincronizar as tarefas:
    // a peça emitida vai para o fluxo e a etapa já aparece "aguardando aprovação"
    this.tarefas.registrarAntesDeSincronizar((id) => this.submeterPendentes(id));
  }

  onApplicationBootstrap(): Promise<void> {
    if (process.env.FASE_INTERNA_MODELOS_APROVACAO_NO_BOOT === 'false') return Promise.resolve();
    return executarMigracaoDeBoot(this.ds, async () => {
      try {
        const n = await this.garantirSemente();
        if (n) this.logger.log(`Modelos prontos de fluxo de aprovação: ${n} gravado(s)`);
      } catch (e: any) {
        this.logger.error(`Modelos prontos de fluxo de aprovação não semeados: ${e?.message ?? e}`);
      }
    });
  }

  // ==========================================================================
  // SUBMISSÃO AUTOMÁTICA
  // ==========================================================================

  /**
   * Varre as peças do processo e envia ao fluxo as que devem ir (idempotente).
   * Também cancela etapas abertas de versões substituídas (a versão nova é a
   * que vai para a aprovação).
   */
  submeterPendentes(licitacaoId: string): Promise<number> {
    return this.emFila(licitacaoId, () => this.varrer(licitacaoId));
  }

  private async varrer(licitacaoId: string): Promise<number> {
    const [lic] = await this.ds.query(
      `SELECT orgao_id::text AS orgao_id, modalidade::text AS modalidade, fase::text AS fase, COALESCE(situacao::text, 'ATIVA') AS situacao
         FROM licitacoes WHERE id::text = $1`,
      [licitacaoId],
    );
    if (!lic?.orgao_id || !FASES_INTERNAS.has(lic.fase) || ['REVOGADA', 'ANULADA'].includes(lic.situacao)) return 0;
    await this.ds.query(
      `UPDATE aprovacoes_documento SET status = 'CANCELADA'
        WHERE licitacao_id::text = $1 AND status::text IN ('EM_ANALISE', 'PENDENTE')
          AND documento_id::text IN (SELECT id::text FROM documentos_fase_interna WHERE licitacao_id::text = $1 AND versao_atual = false)`,
      [licitacaoId],
    );
    const op = await this.modeloFluxo.operacionalDoProcesso(lic.orgao_id, lic.modalidade);
    const tipos = new Set(op.tipos_com_aprovacao);
    if (!tipos.size) return 0;
    const docs = await this.docRepo.find({
      where: { licitacao_id: licitacaoId, versao_atual: true, origem: OrigemDocumento.INTERNO, tipo: In([...tipos] as TipoDocumentoFaseInterna[]) },
    });
    let n = 0;
    for (const doc of docs) {
      if (await this.submeterSeDeve(doc, { anexadaAgora: false, aprovacaoInterna: true })) n++;
    }
    return n;
  }

  /**
   * Avalia UMA peça logo depois de emitida/anexada pela etapa (resposta já
   * com a peça em aprovação). `anexadaAgora`: o anexo avulso da etapa (a
   * juntada em lote não passa por aqui).
   */
  async avaliarPeca(documentoId: string, opcoes: { anexadaAgora?: boolean } = {}): Promise<boolean> {
    const [d] = ehUuid(documentoId) ? await this.ds.query(`SELECT licitacao_id::text AS licitacao_id FROM documentos_fase_interna WHERE id::text = $1`, [documentoId]) : [];
    if (!d) return false;
    return this.emFila(d.licitacao_id, () => this.avaliar(documentoId, opcoes));
  }

  private async avaliar(documentoId: string, opcoes: { anexadaAgora?: boolean }): Promise<boolean> {
    try {
      const doc = await this.docRepo.findOne({ where: { id: documentoId } });
      if (!doc) return false;
      const [lic] = await this.ds.query(
        `SELECT orgao_id::text AS orgao_id, modalidade::text AS modalidade, fase::text AS fase FROM licitacoes WHERE id::text = $1`,
        [doc.licitacao_id],
      );
      if (!lic?.orgao_id || !FASES_INTERNAS.has(lic.fase)) return false;
      const op = await this.modeloFluxo.operacionalDoProcesso(lic.orgao_id, lic.modalidade);
      return this.submeterSeDeve(doc, { anexadaAgora: !!opcoes.anexadaAgora, aprovacaoInterna: op.tipos_com_aprovacao.includes(doc.tipo) });
    } catch (e: any) {
      this.logger.warn(`Peça ${documentoId} não enviada para a aprovação interna: ${e?.message ?? e}`);
      return false;
    }
  }

  private async submeterSeDeve(doc: DocumentoFaseInterna, opcoes: { anexadaAgora: boolean; aprovacaoInterna: boolean }): Promise<boolean> {
    const etapas = await this.etapaRepo.find({ where: { documento_id: doc.id } });
    const r = deveSubmeterAutomaticamente(doc, etapas, opcoes);
    if (!r.submeter) return false;
    const emitido = doc.dados_estruturados?._emitido;
    const por = {
      id: (emitido?.por_id as string | null) ?? doc.criado_por_id ?? null,
      nome: (emitido?.por_nome as string | null) ?? doc.criado_por_nome ?? null,
    };
    try {
      await this.aprovacao.submeter(doc.id, { usuario_id: por.id ?? undefined, usuario_nome: por.nome ?? undefined }, { automatica: true, por });
      return true;
    } catch (e: any) {
      this.logger.warn(`Peça ${doc.tipo} (${doc.id}) não enviada ao fluxo de aprovação: ${e?.message ?? e}`);
      return false;
    }
  }

  // ==========================================================================
  // QUEM DECIDE
  // ==========================================================================

  async pessoa(ator: Ator, licitacaoId?: string): Promise<PessoaAprovadora & { nome: string | null }> {
    if (ator.admin) return { admin: true, id: null, setor_id: null, conduz: true, nome: 'Administrador da plataforma' };
    if (ator.tipo === 'ORGAO') {
      const [o] = await this.ds.query(`SELECT nome FROM orgaos WHERE id::text = $1`, [ator.orgaoId]);
      return { admin: false, id: ator.orgaoId, setor_id: null, conduz: true, nome: o?.nome ?? null };
    }
    const [u] = ator.usuarioId && ehUuid(ator.usuarioId)
      ? await this.ds.query(`SELECT nome, role::text AS role, setor_id::text AS setor_id FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2 AND ativo = true`, [ator.usuarioId, ator.orgaoId])
      : [];
    if (!u) return { admin: false, id: null, setor_id: null, conduz: false, nome: null };
    const conduz = licitacaoId ? await this.tarefas.podeConduzirProcesso(ator, licitacaoId) : u.role === 'ADMIN';
    return { admin: false, id: ator.usuarioId, setor_id: u.setor_id ?? null, conduz, nome: u.nome ?? null };
  }

  /**
   * Caixa de documentos do usuário do token (Central de Aprovações): só as
   * etapas EM_ANALISE que são dele — indicadas a ele, ao setor dele (sem
   * pessoa) ou, sem responsável, dos processos que ele conduz.
   */
  async caixa(ator: Ator): Promise<any[]> {
    const p = await this.pessoa(ator);
    if (!ator.orgaoId || (!p.id && !p.admin)) return [];
    const linhas: any[] = await this.ds.query(
      `SELECT e.id::text AS id, e.documento_id::text AS documento_id, e.licitacao_id::text AS licitacao_id, e.ordem, e.rodada, e.nome,
              e.setor_id, e.setor_nome, e.usuario_id, e.usuario_nome, e.exige_assinatura, e.created_at,
              e.submetido_por_nome, e.automatica,
              d.titulo AS doc_titulo, d.tipo::text AS doc_tipo, d.status::text AS doc_status, d.versao AS doc_versao, d.origem::text AS doc_origem,
              (d.caminho_arquivo IS NOT NULL OR d.arquivo_pdf_path IS NOT NULL) AS doc_tem_arquivo,
              l.numero_processo, l.objeto,
              (SELECT COUNT(*) FROM aprovacoes_documento t
                WHERE t.documento_id::text = e.documento_id::text AND t.rodada = e.rodada AND t.status::text <> 'CANCELADA')::int AS total
         FROM aprovacoes_documento e
         JOIN documentos_fase_interna d ON d.id::text = e.documento_id::text
         JOIN licitacoes l ON l.id::text = e.licitacao_id::text
        WHERE e.status::text = 'EM_ANALISE' AND l.orgao_id::text = $1
          AND ((e.usuario_id IS NOT NULL AND e.usuario_id::text = $2)
            OR (e.usuario_id IS NULL AND e.setor_id IS NOT NULL AND e.setor_id::text = $3)
            OR (e.usuario_id IS NULL AND e.setor_id IS NULL AND ($4::boolean OR l.pregoeiro_id::text = $2)))
        ORDER BY e.created_at ASC`,
      [ator.orgaoId, p.id ?? '', p.setor_id ?? '', p.conduz],
    );
    return linhas.map((e) => ({
      id: e.id,
      documento_id: e.documento_id,
      licitacao_id: e.licitacao_id,
      ordem: e.ordem,
      rodada: e.rodada,
      total: e.total,
      ultima: Number(e.ordem) >= Number(e.total),
      nome: e.nome,
      setor_nome: e.setor_nome,
      usuario_nome: e.usuario_nome,
      responsavel: responsavelDaEtapa(e),
      exige_assinatura: !!e.exige_assinatura,
      assina_ao_aprovar: !!e.exige_assinatura && Number(e.ordem) >= Number(e.total) && e.doc_origem === 'INTERNO',
      created_at: e.created_at,
      status: 'EM_ANALISE',
      submetido_por_nome: e.submetido_por_nome,
      automatica: !!e.automatica,
      rotulo: rotuloAguardando(e, Number(e.total)),
      documento: {
        id: e.documento_id,
        titulo: e.doc_titulo || tituloDoTipo(e.doc_tipo),
        tipo: e.doc_tipo,
        tipo_titulo: tituloDoTipo(e.doc_tipo),
        status: e.doc_status,
        versao: e.doc_versao,
        origem: e.doc_origem,
        tem_arquivo: !!e.doc_tem_arquivo,
      },
      processo: { numero_processo: e.numero_processo, objeto: e.objeto },
    }));
  }

  /**
   * Aprova ou reprova a etapa como o usuário do token. Etapa de outra pessoa
   * ou setor → 403. Reprovar exige o motivo. Última etapa com assinatura: a
   * aprovação ASSINA a peça (portal de assinaturas, o próprio aprovador).
   */
  async decidir(
    etapaId: string,
    ator: Ator,
    acao: 'aprovar' | 'reprovar',
    corpo: { justificativa?: string; papel?: string },
    rede: { ip?: string; userAgent?: string } = {},
  ) {
    const etapa = await this.aprovacao.obterEtapa(etapaId);
    if (etapa.status !== StatusEtapaAprovacao.EM_ANALISE) throw new BadRequestException('Esta etapa não está em análise');
    const p = await this.pessoa(ator, etapa.licitacao_id);
    if (!podeDecidirEtapa(etapa, p)) {
      throw new ForbiddenException(`Esta etapa não é sua — ela está com ${responsavelDaEtapa(etapa)}.`);
    }
    const autor = await this.tarefas.autor(ator);
    const usuario = { id: autor.id ?? undefined, nome: autor.nome ?? p.nome ?? undefined };
    const contexto = { usuario_id: usuario.id, usuario_nome: usuario.nome, ip_origem: rede.ip, user_agent: rede.userAgent };
    const justificativa = String(corpo?.justificativa ?? '').trim();

    if (acao === 'reprovar') {
      if (!justificativa) throw new BadRequestException('Informe o motivo da reprovação — ele volta para quem fez a peça.');
      const e = await this.aprovacao.reprovarEtapa(etapaId, usuario, justificativa, contexto);
      return { etapa: e, documentoAprovado: false, assinada: false };
    }

    let assinada = false;
    if (etapa.exige_assinatura && (await this.aprovacao.ehUltimaDaRodada(etapa))) {
      const doc = await this.docRepo.findOne({ where: { id: etapa.documento_id } });
      if (!doc) throw new NotFoundException('Peça não encontrada');
      if (doc.origem === OrigemDocumento.INTERNO) {
        if (!ator.usuarioId) throw new ForbiddenException('Esta etapa exige assinatura: entre com o seu usuário para aprovar e assinar.');
        const [u] = await this.ds.query(`SELECT cargo FROM usuarios WHERE id::text = $1`, [ator.usuarioId]);
        const papel = String(corpo?.papel ?? '').trim() || u?.cargo || etapa.nome;
        await this.pecas.enviarEAssinarComoEmissor(doc.licitacao_id, doc.tipo, ator, papel.slice(0, 120), rede);
        assinada = true;
      }
    }
    const r = await this.aprovacao.aprovarEtapa(etapaId, usuario, justificativa || undefined, contexto);
    return { ...r, assinada };
  }

  // ==========================================================================
  // MODELOS PRONTOS (catálogo em dados)
  // ==========================================================================

  /** Semente idempotente: insere o que falta; atualiza o que o admin não editou. */
  async garantirSemente(): Promise<number> {
    let n = 0;
    for (const s of MODELOS_PRONTOS_SEMENTE) {
      const atual = await this.modeloRepo.findOne({ where: { codigo: s.codigo } });
      if (!atual) {
        await this.modeloRepo.save(this.modeloRepo.create({ ...s, ativo: true, editado: false }));
        n++;
      } else if (!atual.editado) {
        const igual = JSON.stringify([atual.nome, atual.descricao, atual.tipos_documento, atual.etapas, atual.ordem]) === JSON.stringify([s.nome, s.descricao, s.tipos_documento, s.etapas, s.ordem]);
        if (!igual) {
          Object.assign(atual, { nome: s.nome, descricao: s.descricao, tipos_documento: s.tipos_documento, etapas: s.etapas, ordem: s.ordem });
          await this.modeloRepo.save(atual);
          n++;
        }
      }
    }
    return n;
  }

  private visaoDoModelo(m: ModeloFluxoAprovacao) {
    return {
      id: m.id,
      codigo: m.codigo,
      nome: m.nome,
      descricao: m.descricao,
      ativo: m.ativo,
      ordem: m.ordem,
      editado: m.editado,
      tipos_documento: m.tipos_documento,
      tipos_titulos: (m.tipos_documento ?? []).map((t) => ({ tipo: t, titulo: tituloDoTipo(t) })),
      etapas: [...(m.etapas ?? [])].sort((a, b) => a.ordem - b.ordem),
      rascunho: rascunhoDoModelo(m),
    };
  }

  async modelosProntos(todos = false) {
    if (!(await this.modeloRepo.count())) await this.garantirSemente();
    const lista = await this.modeloRepo.find({ where: todos ? {} : { ativo: true }, order: { ordem: 'ASC', nome: 'ASC' } });
    return lista.map((m) => this.visaoDoModelo(m));
  }

  private exigirAdminPlataforma(ator: Ator) {
    if (!ator.admin) throw new ForbiddenException('Só o administrador da plataforma altera os modelos prontos.');
  }

  async criarModeloPronto(ator: Ator, corpo: any) {
    this.exigirAdminPlataforma(ator);
    const codigo = String(corpo?.codigo ?? '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 80);
    if (!codigo) throw new BadRequestException('Informe o código do modelo (ex.: ETP_CONFERIDO).');
    if (await this.modeloRepo.findOne({ where: { codigo } })) throw new BadRequestException(`Já existe o modelo ${codigo}.`);
    const v = validarModeloPronto(corpo);
    if (!v.ok) throw new BadRequestException({ message: v.erros.join(' '), erros: v.erros });
    const m = await this.modeloRepo.save(this.modeloRepo.create({ ...v.valor, codigo, ativo: true, editado: true, atualizado_por_nome: 'Administrador da plataforma' }));
    return this.visaoDoModelo(m);
  }

  async atualizarModeloPronto(ator: Ator, id: string, corpo: any) {
    this.exigirAdminPlataforma(ator);
    const m = ehUuid(id) ? await this.modeloRepo.findOne({ where: { id } }) : null;
    if (!m) throw new NotFoundException('Modelo pronto não encontrado');
    const v = validarModeloPronto({ ...this.visaoDoModelo(m), ...corpo });
    if (!v.ok) throw new BadRequestException({ message: v.erros.join(' '), erros: v.erros });
    Object.assign(m, v.valor, { editado: true, atualizado_por_nome: 'Administrador da plataforma' });
    if (typeof corpo?.ativo === 'boolean') m.ativo = corpo.ativo;
    return this.visaoDoModelo(await this.modeloRepo.save(m));
  }

  // ==========================================================================
  // COBERTURA (para a tela de configuração)
  // ==========================================================================

  /**
   * Onde o fluxo vale no órgão: por tipo de processo, as etapas com
   * "aprovação interna" ligada e, para cada peça delas, o fluxo que será usado
   * (próprio, genérico ou nenhum — aprovação única por quem conduz).
   */
  async cobertura(orgaoId: string) {
    const fluxos = await this.aprovacao.fluxosAtivos(orgaoId);
    const tipos = [];
    for (const tipo of TIPOS_PROCESSO_FLUXO) {
      const m = await this.modeloFluxo.modeloVigente(orgaoId, tipo);
      const etapas = m.etapas
        .filter((e) => e.ligada && e.aprovacao_interna)
        .map((e) => ({
          codigo: e.codigo,
          titulo: e.titulo,
          pecas: e.tipos_peca.map((t) => {
            const f = fluxoParaTipo(fluxos, t);
            return { tipo: t, titulo: tituloDoTipo(t), fluxo: f ? { id: f.id, nome: f.nome, generico: fluxoEhGenerico(f) } : null };
          }),
        }));
      tipos.push({ tipo, rotulo: ROTULO_TIPO_PROCESSO[tipo], modelo: m.nome, proprio: !!m.orgao_id, etapas });
    }
    const algumaLigada = tipos.some((t) => t.etapas.length > 0);
    return { tipos, alguma_ligada: algumaLigada, tela_modelo_fluxo: '/orgao/configuracoes/fluxo' };
  }
}
