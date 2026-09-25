import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { extname } from 'path';
import { DataSource, EntityManager, In } from 'typeorm';
import { FaseLicitacao } from '../licitacoes/entities/licitacao.entity';
import { FASES_INTERNAS } from '../licitacoes/transicoes/fases';
import { EtapaSessao } from '../sessao/entities/sessao-disputa.entity';
import { EventoSessao, TipoEvento } from '../sessao/entities/evento-sessao.entity';
import { exigirLicitacaoAtiva } from '../sessao/licitacao-ativa';
import { TransicoesService } from '../licitacoes/transicoes/transicoes.service';
import { AtoLicitacao, AtorTransicao } from '../licitacoes/transicoes/transicoes.tipos';
import { ParametrosLicitacaoService } from '../parametros-licitacao/parametros-licitacao.service';
import { AceitacaoService } from '../julgamento/aceitacao.service';
import { RankingService } from '../julgamento/ranking.service';
import { SITUACOES_PROPOSTA_ACEITA, SituacaoLicitante } from '../julgamento/regras-julgamento';
import { BaseLance } from '../disputa-v2/modelo-lance';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { PrioridadeNotificacao, TipoNotificacao } from '../notificacoes/entities/notificacao.entity';
import {
  DiligenciaHabilitacao,
  DocumentoHabilitacao,
  ExigenciaHabilitacao,
  HabilitacaoLicitante,
} from './entities/habilitacao.entity';
import {
  documentosCadastroSql,
  exigenciasDaLicitacaoSql,
  garantirExigenciasSql,
  gravarExigenciasSql,
  unidadesSemHabilitadoSql,
} from './habilitacao.sql';
import { ChaveModelo, ROTULO_MODELO, chaveModeloPadrao, ehChaveModelo, MODELOS_EXIGENCIAS, modeloExigencias } from './modelos-exigencias';
import {
  CategoriaExigencia,
  EstadoDiligencia,
  Exigencia,
  MOTIVO_MINIMO,
  OrigemDocumento,
  OrigemHabilitacao,
  PRAZO_MINIMO_HABILITACAO_HORAS,
  ROTULO_CATEGORIA,
  ResultadoAnalise,
  STATUS_HABILITACAO_ATIVOS,
  STATUS_HABILITACAO_FINAIS,
  StatusDiligencia,
  StatusHabilitacao,
  dataIso,
  diligenciaVigente,
  hojeBrasilia,
  motivoDocumentoCadastroInvalido,
  motivoNaoAbreDiligencia,
  motivoNaoAnalisa,
  motivoNaoConcluiEnvio,
  motivoNaoProrroga,
  motivoNaoRemove,
  motivoPrazoInvalido,
  pendenciasParaHabilitar,
  preChecagemCadastro,
  prazoAte,
  prazoEntregaEncerrado,
  regraDeEnvio,
  situacaoDaExigencia,
  statusEfetivo,
  statusEfetivoDiligencia,
  validarExigencias,
} from './regras-habilitacao';

/** Arquivo de habilitação (PDF/JPG/PNG, até 10 MB). */
export interface ArquivoHabilitacao {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const MIMES_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
const EXTENSOES_PERMITIDAS = ['.pdf', '.jpg', '.jpeg', '.png'];
export const TAMANHO_MAXIMO_DOCUMENTO = 10 * 1024 * 1024;

/** Propostas que participam (aptas à disputa) — base da inversão de fases. */
const STATUS_PROPOSTA_APTA = ['ENVIADA', 'RECEBIDA', 'EM_ANALISE', 'CLASSIFICADA'];
/** Fases em que, na inversão, os licitantes anexam a habilitação com a proposta. */
const FASES_ENVIO_INVERSAO: string[] = [FaseLicitacao.PUBLICADO, FaseLicitacao.IMPUGNACAO, FaseLicitacao.ACOLHIMENTO_PROPOSTAS];

const dataHora = (d: Date | string) =>
  new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

type Papel = 'ORGAO' | 'FORNECEDOR';

/**
 * ============================================================================
 * HABILITAÇÃO REAL (plano E4 — Lei 14.133/2021 arts. 62–70; IN SEGES 73/2022
 * art. 39)
 * ============================================================================
 *
 *  1. EXIGÊNCIAS do edital por licitação (modelo padrão por objeto; editáveis
 *     na fase interna, congeladas a partir da publicação — retificação na E7).
 *  2. CONVOCAÇÃO do licitante com proposta ACEITA (art. 63 II — só o
 *     vencedor, salvo inversão), prazo ≥ 2 h prorrogável uma vez; o sistema
 *     consulta o REGISTRO CADASTRAL e marca as exigências já atendidas por
 *     documento válido (art. 70) — o licitante envia só o que falta.
 *  3. ENVIO por exigência, arquivo NO BANCO (nunca na pasta pública); depois
 *     da entrega (ato ou fim do prazo) não há substituição: só COMPLEMENTO em
 *     DILIGÊNCIA com motivo e prazo próprios (art. 64).
 *  4. ANÁLISE por documento persistida (ATENDE / NÃO ATENDE com motivo /
 *     DILIGÊNCIA) pelo órgão dono; HABILITAR (todas as obrigatórias atendidas)
 *     ou INABILITAR (motivo — AceitacaoService.aoInabilitar: INABILITADO nas
 *     unidades, RETORNAR_JULGAMENTO e o próximo pelos lances convocado).
 *  5. INVERSÃO DE FASES (art. 17 §1º, concorrência): documentos de todos com a
 *     proposta; a habilitação de todos é julgada antes da disputa
 *     (pré-condição do INICIAR_DISPUTA); inabilitado → proposta desclassificada.
 */
@Injectable()
export class HabilitacaoService {
  private readonly logger = new Logger(HabilitacaoService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ranking: RankingService,
    private readonly aceitacao: AceitacaoService,
    private readonly transicoes: TransicoesService,
    private readonly parametros: ParametrosLicitacaoService,
    @Optional() private readonly notificacoes?: NotificacoesService,
  ) {}

  // ==========================================================================
  // APOIO
  // ==========================================================================

  private async licitacao(m: EntityManager, licitacaoId: string) {
    const [l] = await m.query(
      `SELECT id, orgao_id, numero_processo, objeto, fase::text AS fase, situacao::text AS situacao, modalidade::text AS modalidade,
              tipo_contratacao::text AS tipo_contratacao, COALESCE(inversao_fases, false) AS inversao_fases,
              data_fim_acolhimento, data_abertura_sessao
         FROM licitacoes WHERE id = $1`,
      [licitacaoId],
    );
    if (!l) throw new NotFoundException('Licitação não encontrada');
    return l as {
      id: string;
      orgao_id: string;
      numero_processo: string | null;
      objeto: string | null;
      fase: string;
      situacao: string;
      modalidade: string;
      tipo_contratacao: string | null;
      inversao_fases: boolean;
      data_fim_acolhimento: Date | null;
      data_abertura_sessao: Date | null;
    };
  }

  /** Sessão pública mais recente da licitação (eventos da ata). */
  private async sessaoDaLicitacao(m: EntityManager, licitacaoId: string): Promise<{ id: string; etapa: string; pregoeiro_nome: string | null } | null> {
    const [s] = await m.query(
      `SELECT id, etapa::text AS etapa, pregoeiro_nome FROM sessoes_disputa WHERE licitacao_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [licitacaoId],
    );
    return s ?? null;
  }

  /** Prazo mínimo do órgão (nunca abaixo das 2 h legais). */
  async prazoMinimoHoras(licitacaoId: string, m?: EntityManager): Promise<number> {
    const [l] = await (m ?? this.dataSource.manager).query(`SELECT orgao_id FROM licitacoes WHERE id = $1`, [licitacaoId]);
    const p = await this.parametros.resolver(l?.orgao_id).catch(() => null);
    const valor = Number((p as any)?.prazo_habilitacao_horas);
    return Math.max(PRAZO_MINIMO_HABILITACAO_HORAS, Number.isFinite(valor) && valor > 0 ? valor : PRAZO_MINIMO_HABILITACAO_HORAS);
  }

  private async nomes(m: EntityManager, ids: string[]): Promise<Map<string, { razaoSocial: string; cpfCnpj: string; porte: string | null; email: string | null }>> {
    const validos = [...new Set(ids.filter(Boolean))];
    if (!validos.length) return new Map();
    const rows: any[] = await m.query(
      `SELECT id::text AS id, razao_social, cpf_cnpj, porte::text AS porte, email FROM fornecedores WHERE id::text = ANY($1)`,
      [validos],
    );
    return new Map(rows.map((r) => [r.id, { razaoSocial: r.razao_social, cpfCnpj: r.cpf_cnpj ?? '', porte: r.porte ?? null, email: r.email ?? null }]));
  }

  private async evento(
    m: EntityManager,
    sessaoId: string | null | undefined,
    e: { tipo: TipoEvento; descricao: string; fornecedorId?: string | null; usuario?: string | null; sistema?: boolean; dados?: Record<string, any> },
  ): Promise<void> {
    if (!sessaoId) return;
    await m.save(
      m.create(EventoSessao, {
        sessao_id: sessaoId,
        tipo: e.tipo,
        descricao: e.descricao,
        fornecedor_id: e.fornecedorId ?? undefined,
        fornecedor_identificador: e.fornecedorId ?? undefined,
        usuario_nome: e.usuario ?? 'SISTEMA',
        is_sistema: e.sistema ?? false,
        dados_adicionais: { origem: 'habilitacao', ...(e.dados ?? {}) },
      }),
    );
  }

  /** Transação do ato: licitação ATIVA (FOR SHARE) + trava da habilitação do licitante. */
  private async prepararAto(m: EntityManager, licitacaoId: string, fornecedorId: string) {
    await exigirLicitacaoAtiva(m, licitacaoId, { bloquear: true });
    await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`habilitacao:${licitacaoId}:${fornecedorId}`]);
  }

  private async habilitacaoPorId(m: EntityManager, id: string, travar = false): Promise<HabilitacaoLicitante> {
    const h = await m.findOne(HabilitacaoLicitante, { where: { id }, ...(travar ? { lock: { mode: 'pessimistic_write' as const } } : {}) });
    if (!h) throw new NotFoundException('Habilitação não encontrada');
    return h;
  }

  /** Habilitação vigente (não cancelada) do licitante — a mais recente. */
  private async habilitacaoDoLicitante(m: EntityManager, licitacaoId: string, fornecedorId: string): Promise<HabilitacaoLicitante | null> {
    return m.findOne(HabilitacaoLicitante, {
      where: { licitacao_id: licitacaoId, fornecedor_id: fornecedorId, status: In([...STATUS_HABILITACAO_ATIVOS, StatusHabilitacao.HABILITADO, StatusHabilitacao.INABILITADO]) },
      order: { created_at: 'DESC' },
    });
  }

  private async diligencias(m: EntityManager, habilitacaoId: string): Promise<DiligenciaHabilitacao[]> {
    return m.find(DiligenciaHabilitacao, { where: { habilitacao_id: habilitacaoId }, order: { aberta_em: 'ASC' } });
  }

  private estadoDils(dils: DiligenciaHabilitacao[]): EstadoDiligencia[] {
    return dils.map((d) => ({ id: d.id, status: d.status, prazo_ate: d.prazo_ate, exigencia_ids: d.exigencia_ids ?? [] }));
  }

  private async documentos(m: EntityManager, habilitacaoId: string): Promise<DocumentoHabilitacao[]> {
    return m.find(DocumentoHabilitacao, { where: { habilitacao_id: habilitacaoId }, order: { enviado_em: 'ASC' } });
  }

  /** Grava o estado que o relógio já decidiu (entrega pelo fim do prazo, diligência expirada). */
  private async normalizar(m: EntityManager, h: HabilitacaoLicitante, dils: DiligenciaHabilitacao[], agora = new Date()): Promise<void> {
    for (const d of dils) {
      const ef = statusEfetivoDiligencia({ id: d.id, status: d.status, prazo_ate: d.prazo_ate, exigencia_ids: d.exigencia_ids }, agora);
      if (ef !== d.status) {
        d.status = ef;
        await m.update(DiligenciaHabilitacao, d.id, { status: ef });
      }
    }
    const ef = statusEfetivo(h, this.estadoDils(dils), agora);
    if (ef !== h.status) {
      h.status = ef;
      await m.update(HabilitacaoLicitante, h.id, { status: ef });
    }
  }

  // ==========================================================================
  // EXIGÊNCIAS DO EDITAL (item 1)
  // ==========================================================================

  modelos() {
    return (Object.keys(MODELOS_EXIGENCIAS) as ChaveModelo[]).map((chave) => ({
      chave,
      rotulo: ROTULO_MODELO[chave],
      exigencias: modeloExigencias(chave),
    }));
  }

  categorias() {
    return (Object.values(CategoriaExigencia) as CategoriaExigencia[]).map((c) => ({ codigo: c, rotulo: ROTULO_CATEGORIA[c] }));
  }

  /** Exigências só se editam na fase interna (antes da publicação). */
  private motivoExigenciasCongeladas(lic: { fase: string; situacao: string }): string | null {
    if (lic.situacao !== 'ATIVA') return 'Licitação encerrada ou suspensa — exigências de habilitação não podem ser alteradas';
    if (!FASES_INTERNAS.includes(lic.fase as FaseLicitacao)) {
      return 'Exigências de habilitação congeladas: o edital já foi publicado. Alteração só por retificação do edital (art. 55 §1º).';
    }
    return null;
  }

  async exigencias(licitacaoId: string) {
    const lic = await this.licitacao(this.dataSource.manager, licitacaoId);
    const lista = await this.dataSource.transaction(async (m) => {
      await garantirExigenciasSql(m, licitacaoId);
      return exigenciasDaLicitacaoSql(m, licitacaoId);
    });
    return {
      licitacaoId,
      fase: lic.fase,
      inversaoFases: !!lic.inversao_fases,
      editavel: !this.motivoExigenciasCongeladas(lic),
      motivoCongelada: this.motivoExigenciasCongeladas(lic),
      modeloPadrao: chaveModeloPadrao(lic.modalidade, lic.tipo_contratacao),
      categorias: this.categorias(),
      exigencias: lista,
    };
  }

  /** Substitui a lista de exigências (editor da licitação — órgão dono, fase interna). */
  async salvarExigencias(licitacaoId: string, lista: unknown) {
    const { exigencias, erros } = validarExigencias(lista);
    if (erros.length) throw new BadRequestException({ message: erros.join(' | '), erros });
    if (!exigencias.length) throw new BadRequestException('Informe ao menos uma exigência de habilitação');
    await this.dataSource.transaction(async (m) => {
      const lic = await this.licitacao(m, licitacaoId);
      await m.query(`SELECT 1 FROM licitacoes WHERE id = $1 FOR UPDATE`, [licitacaoId]);
      const congelada = this.motivoExigenciasCongeladas(lic);
      if (congelada) throw new ConflictException(congelada);
      const atuais = new Set((await exigenciasDaLicitacaoSql(m, licitacaoId)).map((e) => e.id));
      await gravarExigenciasSql(
        m,
        licitacaoId,
        exigencias.map((e) => ({ ...e, id: e.id && atuais.has(e.id) ? e.id : null, modelo: null })),
      );
    });
    return this.exigencias(licitacaoId);
  }

  /** Aplica um modelo padrão (substitui a lista) — órgão dono, fase interna. */
  async aplicarModelo(licitacaoId: string, chave?: string | null) {
    await this.dataSource.transaction(async (m) => {
      const lic = await this.licitacao(m, licitacaoId);
      await m.query(`SELECT 1 FROM licitacoes WHERE id = $1 FOR UPDATE`, [licitacaoId]);
      const congelada = this.motivoExigenciasCongeladas(lic);
      if (congelada) throw new ConflictException(congelada);
      const k: ChaveModelo = ehChaveModelo(chave) ? chave : chaveModeloPadrao(lic.modalidade, lic.tipo_contratacao);
      if (chave && !ehChaveModelo(chave)) throw new BadRequestException(`Modelo desconhecido: ${chave}`);
      const { exigencias, erros } = validarExigencias(modeloExigencias(k));
      if (erros.length) throw new BadRequestException(erros.join(' | '));
      await gravarExigenciasSql(m, licitacaoId, exigencias.map((e) => ({ ...e, id: null, modelo: k })));
    });
    return this.exigencias(licitacaoId);
  }

  // ==========================================================================
  // REGISTRO CADASTRAL (art. 70)
  // ==========================================================================

  /** Cria a habilitação com a pré-checagem do cadastro (documentos CADASTRO já anexados). */
  private async criarHabilitacao(
    m: EntityManager,
    p: {
      licitacaoId: string;
      sessaoId: string | null;
      fornecedorId: string;
      origem: OrigemHabilitacao;
      prazoHoras: number | null;
      prazoAte: Date | null;
      ator: AtorTransicao | null;
      status?: StatusHabilitacao;
    },
  ): Promise<{ h: HabilitacaoLicitante; cobertas: number; total: number }> {
    await garantirExigenciasSql(m, p.licitacaoId);
    const exigencias = await exigenciasDaLicitacaoSql(m, p.licitacaoId);
    const { documentos, statusCadastro } = await documentosCadastroSql(m, p.fornecedorId);
    const agora = new Date();
    const cobertura = preChecagemCadastro(exigencias, documentos, hojeBrasilia(agora), statusCadastro);
    const h = await m.save(
      m.create(HabilitacaoLicitante, {
        licitacao_id: p.licitacaoId,
        sessao_id: p.sessaoId,
        fornecedor_id: p.fornecedorId,
        origem: p.origem,
        status: p.status ?? StatusHabilitacao.AGUARDANDO_ENVIO,
        convocada_em: agora,
        prazo_horas: p.prazoHoras,
        prazo_ate: p.prazoAte,
        pre_checagem: cobertura.map((c) => ({ exigenciaId: c.exigenciaId, coberta: c.coberta, documentoId: c.documento?.id ?? null, motivo: c.motivo })),
        convocada_por_tipo: p.ator?.tipo ?? null,
        convocada_por_id: p.ator?.id ?? null,
      }),
    );
    for (const c of cobertura) {
      if (!c.coberta || !c.documento) continue;
      const d = c.documento;
      await m.save(
        m.create(DocumentoHabilitacao, {
          habilitacao_id: h.id,
          licitacao_id: p.licitacaoId,
          fornecedor_id: p.fornecedorId,
          exigencia_id: c.exigenciaId,
          origem: OrigemDocumento.CADASTRO,
          fornecedor_documento_id: d.id,
          cadastro: {
            tipo: d.tipo,
            numero: d.numero_documento ?? null,
            emissao: dataIso(d.data_emissao ?? null),
            validade: dataIso(d.data_validade),
            nomeArquivo: d.nome_arquivo ?? null,
            caminhoArquivo: d.caminho_arquivo ?? null,
            status: d.status,
          },
          validade: dataIso(d.data_validade),
          enviado_em: agora,
          analise: ResultadoAnalise.PENDENTE,
        }),
      );
    }
    return { h, cobertas: cobertura.filter((c) => c.coberta).length, total: exigencias.length };
  }

  /**
   * INVERSÃO: garante a habilitação de TODO licitante com proposta apta
   * (quem não anexou nada ainda pode estar coberto pelo cadastro) e, fora do
   * acolhimento, dá a documentação por entregue.
   */
  private async garantirRegistrosInversao(m: EntityManager, lic: Awaited<ReturnType<HabilitacaoService['licitacao']>>): Promise<void> {
    if (!lic.inversao_fases) return;
    const emAcolhimento = FASES_ENVIO_INVERSAO.includes(lic.fase);
    if (!emAcolhimento) {
      await m.query(
        `UPDATE habilitacoes_licitante SET status = $2, updated_at = now() WHERE licitacao_id = $1 AND origem = $3 AND status = $4`,
        [lic.id, StatusHabilitacao.ENVIADA, OrigemHabilitacao.INVERSAO, StatusHabilitacao.AGUARDANDO_ENVIO],
      );
    }
    if (emAcolhimento || FASES_INTERNAS.includes(lic.fase as FaseLicitacao)) return;
    const sem: any[] = await m.query(
      `SELECT DISTINCT p.fornecedor_id::text AS fornecedor_id FROM propostas p
        WHERE p.licitacao_id = $1 AND p.status::text = ANY($2)
          AND NOT EXISTS (SELECT 1 FROM habilitacoes_licitante h WHERE h.licitacao_id = p.licitacao_id AND h.fornecedor_id = p.fornecedor_id::text AND h.status <> $3)`,
      [lic.id, STATUS_PROPOSTA_APTA, StatusHabilitacao.CANCELADA],
    );
    for (const r of sem) {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`habilitacao:${lic.id}:${r.fornecedor_id}`]);
      const existe = await this.habilitacaoDoLicitante(m, lic.id, r.fornecedor_id);
      if (existe) continue;
      await this.criarHabilitacao(m, {
        licitacaoId: lic.id,
        sessaoId: (await this.sessaoDaLicitacao(m, lic.id))?.id ?? null,
        fornecedorId: r.fornecedor_id,
        origem: OrigemHabilitacao.INVERSAO,
        prazoHoras: null,
        prazoAte: this.corteInversao(lic),
        ator: null,
        status: StatusHabilitacao.ENVIADA,
      });
    }
  }

  /** Migração (boot): convocação anterior à E4 vira habilitação do fluxo novo. */
  async criarConvocacaoMigrada(m: EntityManager, p: { licitacaoId: string; sessaoId: string; fornecedorId: string; prazoHoras: number }): Promise<void> {
    await this.criarHabilitacao(m, {
      licitacaoId: p.licitacaoId,
      sessaoId: p.sessaoId,
      fornecedorId: p.fornecedorId,
      origem: OrigemHabilitacao.MIGRACAO,
      prazoHoras: p.prazoHoras,
      prazoAte: prazoAte(new Date(), p.prazoHoras),
      ator: { tipo: 'SISTEMA', id: 'migracao-e4' },
    });
  }

  /** Na inversão, o prazo de entrega é o fim do recebimento de propostas (edital). */
  private corteInversao(lic: { data_fim_acolhimento: Date | null; data_abertura_sessao: Date | null }): Date | null {
    const c = lic.data_fim_acolhimento || lic.data_abertura_sessao;
    return c ? new Date(c) : null;
  }

  // ==========================================================================
  // LEITURAS
  // ==========================================================================

  private visaoDocumento(d: DocumentoHabilitacao, papel: Papel, h: HabilitacaoLicitante, agora: Date) {
    return {
      id: d.id,
      exigenciaId: d.exigencia_id,
      origem: d.origem,
      diligenciaId: d.diligencia_id,
      arquivo: d.arquivo_nome ? { nome: d.arquivo_nome, mime: d.arquivo_mime, tamanho: d.arquivo_tamanho, sha256: d.arquivo_sha256 } : null,
      cadastro: d.cadastro
        ? {
            tipo: d.cadastro.tipo,
            numero: d.cadastro.numero ?? null,
            emissao: d.cadastro.emissao ?? null,
            validade: d.cadastro.validade ?? null,
            nomeArquivo: d.cadastro.nomeArquivo ?? null,
            // caminho do arquivo do cadastro: só o órgão dono (o licitante conhece o próprio)
            caminhoArquivo: papel === 'ORGAO' ? (d.cadastro.caminhoArquivo ?? null) : undefined,
          }
        : null,
      validade: d.validade ? dataIso(d.validade) : null,
      observacao: d.observacao,
      enviadoEm: d.enviado_em,
      analise: d.analise,
      analiseMotivo: d.analise_motivo,
      analisadoEm: d.analisado_em,
      podeRemover: papel === 'FORNECEDOR' && !motivoNaoRemove(h, d, agora),
    };
  }

  private visaoHabilitacao(
    h: HabilitacaoLicitante,
    exigencias: Exigencia[],
    docs: DocumentoHabilitacao[],
    dils: DiligenciaHabilitacao[],
    papel: Papel,
    cadastro: { razaoSocial: string; cpfCnpj: string } | undefined,
    agora = new Date(),
  ) {
    const estadoDils = this.estadoDils(dils);
    const status = statusEfetivo(h, estadoDils, agora);
    const pendencias = pendenciasParaHabilitar(exigencias, docs, estadoDils, agora);
    const cobertura = new Map((h.pre_checagem ?? []).map((c) => [c.exigenciaId, c]));
    const vigente = dils.find((d) => diligenciaVigente({ id: d.id, status: d.status, prazo_ate: d.prazo_ate, exigencia_ids: d.exigencia_ids }, agora));
    return {
      id: h.id,
      licitacaoId: h.licitacao_id,
      fornecedorId: h.fornecedor_id,
      razaoSocial: cadastro?.razaoSocial ?? null,
      cpfCnpj: cadastro?.cpfCnpj ?? null,
      origem: h.origem,
      status,
      convocadaEm: h.convocada_em,
      prazoHoras: h.prazo_horas != null ? Number(h.prazo_horas) : null,
      prazoAte: h.prazo_ate,
      prazoEncerrado: prazoEntregaEncerrado(h, agora),
      segundosRestantes: h.prazo_ate ? Math.max(0, Math.floor((new Date(h.prazo_ate).getTime() - agora.getTime()) / 1000)) : null,
      prorrogadaEm: h.prorrogada_em,
      prorrogacaoMotivo: h.prorrogacao_motivo,
      podeProrrogar: papel === 'ORGAO' && !motivoNaoProrroga(h, agora),
      enviadaEm: h.enviada_em,
      decididaEm: h.decidida_em,
      decisaoMotivo: h.decisao_motivo,
      podeConcluirEnvio: papel === 'FORNECEDOR' && !motivoNaoConcluiEnvio(h, agora),
      podeAnalisar: papel === 'ORGAO' && !motivoNaoAnalisa(status),
      podeHabilitar: papel === 'ORGAO' && !STATUS_HABILITACAO_FINAIS.includes(status) && status !== StatusHabilitacao.AGUARDANDO_ENVIO && pendencias.length === 0,
      podeInabilitar: papel === 'ORGAO' && !STATUS_HABILITACAO_FINAIS.includes(status) && status !== StatusHabilitacao.AGUARDANDO_ENVIO,
      pendencias,
      exigencias: exigencias.map((e) => {
        const doE = docs.filter((d) => d.exigencia_id === e.id);
        const c = cobertura.get(e.id);
        const envio = papel === 'FORNECEDOR' ? regraDeEnvio(h, e.id, estadoDils, agora) : null;
        return {
          ...e,
          situacao: situacaoDaExigencia(doE),
          cobertaPeloCadastro: !!c?.coberta,
          motivoCadastro: c && !c.coberta ? c.motivo : null,
          documentos: doE.map((d) => this.visaoDocumento(d, papel, h, agora)),
          podeEnviar: !!envio && !('erro' in envio),
          envioComo: envio && !('erro' in envio) ? envio.origem : null,
        };
      }),
      diligencias: dils.map((d) => ({
        id: d.id,
        motivo: d.motivo,
        exigenciaIds: d.exigencia_ids,
        prazoHoras: Number(d.prazo_horas),
        abertaEm: d.aberta_em,
        prazoAte: d.prazo_ate,
        status: statusEfetivoDiligencia({ id: d.id, status: d.status, prazo_ate: d.prazo_ate, exigencia_ids: d.exigencia_ids }, agora),
        respondidaEm: d.respondida_em,
        resposta: d.resposta,
      })),
      diligenciaVigenteId: vigente?.id ?? null,
      podeResponderDiligencia: papel === 'FORNECEDOR' && !!vigente,
    };
  }

  /** Ranking por licitante (ranking único por unidade) — quem pode ser convocado. */
  private async rankingPorLicitante(m: EntityManager, licitacaoId: string) {
    const { porUnidade, agregado } = await this.ranking.rankingAgregado(licitacaoId, m);
    const cadastro = await this.nomes(m, agregado.map((a) => a.fornecedorId));
    const total = (fid: string) =>
      Math.round(
        porUnidade.reduce((soma, { unidade, ranking }) => {
          const e = ranking.find((r) => r.fornecedorId === fid);
          if (!e) return soma;
          const qtd = unidade.tipo === 'ITEM' ? unidade.itens[0]?.quantidade || 1 : 1;
          return soma + (unidade.baseLance === BaseLance.UNITARIO ? e.melhorValor * qtd : e.melhorValor);
        }, 0) * 100,
      ) / 100;
    const unidadesDo = (fid: string) =>
      porUnidade
        .map(({ unidade, ranking }) => ({ unidade, e: ranking.find((r) => r.fornecedorId === fid) }))
        .filter((x) => !!x.e)
        .map(({ unidade, e }) => ({ tipo: unidade.tipo, unidadeId: unidade.id, numero: unidade.numero, posicao: e!.posicao, situacao: e!.situacao }));
    return agregado.map((a) => ({
      fornecedorId: a.fornecedorId,
      razaoSocial: cadastro.get(a.fornecedorId)?.razaoSocial ?? a.fornecedorNome,
      cpfCnpj: cadastro.get(a.fornecedorId)?.cpfCnpj ?? '',
      porte: cadastro.get(a.fornecedorId)?.porte ?? null,
      valorTotal: total(a.fornecedorId),
      excluido: a.excluidoEmTodas,
      unidades: unidadesDo(a.fornecedorId),
    }));
  }

  /** Painel do agente (órgão dono): exigências, ranking por licitante e cada habilitação com documentos. */
  async painelOrgao(licitacaoId: string) {
    const agora = new Date();
    return this.dataSource.transaction(async (m) => {
      const lic = await this.licitacao(m, licitacaoId);
      await garantirExigenciasSql(m, licitacaoId);
      await this.garantirRegistrosInversao(m, lic);
      const exigencias = await exigenciasDaLicitacaoSql(m, licitacaoId);
      const sessao = await this.sessaoDaLicitacao(m, licitacaoId);
      const habs = await m.find(HabilitacaoLicitante, { where: { licitacao_id: licitacaoId }, order: { convocada_em: 'ASC' } });
      const cadastro = await this.nomes(m, habs.map((h) => h.fornecedor_id));
      const visoes = [] as any[];
      for (const h of habs) {
        const dils = await this.diligencias(m, h.id);
        await this.normalizar(m, h, dils, agora);
        visoes.push(this.visaoHabilitacao(h, exigencias, await this.documentos(m, h.id), dils, 'ORGAO', cadastro.get(h.fornecedor_id), agora));
      }
      const lista = await this.rankingPorLicitante(m, licitacaoId);
      const ativaDe = (fid: string) => visoes.filter((v) => v.fornecedorId === fid && v.status !== StatusHabilitacao.CANCELADA).slice(-1)[0] ?? null;
      const validos = lista.filter((l) => !l.excluido);
      const ranking = validos.map((l, i) => {
        const hab = ativaDe(l.fornecedorId);
        const propostaAceita = l.unidades.some((u) => (SITUACOES_PROPOSTA_ACEITA as readonly string[]).includes(u.situacao));
        const pendenteHabilitar = l.unidades.some((u) => u.situacao === SituacaoLicitante.ACEITO);
        return {
          posicao: i + 1,
          ...l,
          propostaAceita,
          habilitacaoId: hab?.id ?? null,
          statusHabilitacao: hab?.status ?? null,
          podeConvocar:
            !lic.inversao_fases &&
            pendenteHabilitar &&
            (lic.fase === FaseLicitacao.JULGAMENTO || lic.fase === FaseLicitacao.HABILITACAO) &&
            (!hab || hab.status === StatusHabilitacao.HABILITADO),
        };
      });
      return {
        licitacaoId,
        sessaoId: sessao?.id ?? null,
        etapa: sessao?.etapa ?? null,
        fase: lic.fase,
        situacao: lic.situacao,
        inversaoFases: !!lic.inversao_fases,
        prazoMinimoHoras: await this.prazoMinimoHoras(licitacaoId, m),
        exigencias,
        convocado: ranking.find((r) => r.statusHabilitacao && STATUS_HABILITACAO_ATIVOS.includes(r.statusHabilitacao)) ?? null,
        ranking,
        excluidos: lista.filter((l) => l.excluido).map((l) => ({ fornecedorId: l.fornecedorId, razaoSocial: l.razaoSocial, unidades: l.unidades })),
        habilitacoes: visoes,
      };
    });
  }

  /** Visão do LICITANTE: só a própria habilitação (checklist, cobertura do cadastro, documentos, diligências). */
  async painelFornecedor(licitacaoId: string, fornecedorId: string) {
    const agora = new Date();
    return this.dataSource.transaction(async (m) => {
      const lic = await this.licitacao(m, licitacaoId);
      await garantirExigenciasSql(m, licitacaoId);
      await this.garantirRegistrosInversao(m, lic);
      const exigencias = await exigenciasDaLicitacaoSql(m, licitacaoId);
      const h = await this.habilitacaoDoLicitante(m, licitacaoId, fornecedorId);
      let minha: any = null;
      if (h) {
        const dils = await this.diligencias(m, h.id);
        await this.normalizar(m, h, dils, agora);
        const cad = await this.nomes(m, [fornecedorId]);
        minha = this.visaoHabilitacao(h, exigencias, await this.documentos(m, h.id), dils, 'FORNECEDOR', cad.get(fornecedorId), agora);
      }
      // Inversão, antes do primeiro envio: o que o cadastro já cobre (sem gravar nada)
      const envioInversaoAberto = !!lic.inversao_fases && FASES_ENVIO_INVERSAO.includes(lic.fase) && !h;
      let previa: any = null;
      if (envioInversaoAberto) {
        const { documentos, statusCadastro } = await documentosCadastroSql(m, fornecedorId);
        previa = preChecagemCadastro(exigencias, documentos, hojeBrasilia(agora), statusCadastro).map((c) => ({
          exigenciaId: c.exigenciaId,
          coberta: c.coberta,
          motivo: c.motivo,
          documento: c.documento ? { tipo: c.documento.tipo, validade: dataIso(c.documento.data_validade) } : null,
        }));
      }
      return {
        licitacaoId,
        fase: lic.fase,
        inversaoFases: !!lic.inversao_fases,
        envioInversaoAberto,
        prazoInversao: lic.inversao_fases ? this.corteInversao(lic) : null,
        exigencias,
        minha,
        coberturaCadastro: previa,
      };
    });
  }

  // ==========================================================================
  // ATOS DO AGENTE DE CONTRATAÇÃO
  // ==========================================================================

  /**
   * Convoca o licitante com proposta ACEITA a enviar a habilitação (art. 63
   * II; IN 73 art. 39): prazo ≥ 2 h (parâmetro do órgão); a licitação passa a
   * HABILITACAO (INICIAR_HABILITACAO — pré-condição: toda unidade com proposta
   * aceita); o registro cadastral é consultado e o que ele já cobre fica
   * anexado (art. 70).
   */
  async convocar(licitacaoId: string, fornecedorId: string, opts: { prazoHoras?: number | null }, ator: AtorTransicao, usuarioNome?: string) {
    await exigirLicitacaoAtiva(this.dataSource.manager, licitacaoId);
    const lic0 = await this.licitacao(this.dataSource.manager, licitacaoId);
    if (lic0.inversao_fases) {
      throw new ConflictException(
        'Inversão de fases: a habilitação de todos os licitantes já foi julgada antes da disputa (art. 17 §1º) — confirme a do vencedor em "habilitar".',
      );
    }
    const minimo = await this.prazoMinimoHoras(licitacaoId);
    const invalido = motivoPrazoInvalido(opts.prazoHoras ?? null, minimo);
    if (invalido) throw new BadRequestException(invalido);
    const horas = opts.prazoHoras != null ? Number(opts.prazoHoras) : minimo;

    // Só quem tem proposta aceita (IN 73 art. 29 → Lei 14.133 art. 62/63 II)
    await this.aceitacao.exigirPropostaAceita(licitacaoId, fornecedorId);
    const pendentesAceito = await this.ranking.unidadesDoLicitante(licitacaoId, fornecedorId, [SituacaoLicitante.ACEITO]);
    if (!pendentesAceito.length) throw new ConflictException('O licitante já está habilitado em todas as unidades em que tem proposta aceita.');

    // Licitação → HABILITACAO (ENCERRAR_DISPUTA se ainda em disputa + INICIAR_HABILITACAO; idempotente)
    await this.dataSource.transaction(async (m) => {
      const [l] = await m.query(`SELECT fase::text AS fase FROM licitacoes WHERE id = $1`, [licitacaoId]);
      if (l?.fase === FaseLicitacao.EM_DISPUTA) {
        await this.transicoes.executar(licitacaoId, AtoLicitacao.ENCERRAR_DISPUTA, { ator, manager: m, ignorarSeJaAplicado: true, registro: { origem: 'habilitacao' } });
      }
      await this.transicoes.executar(licitacaoId, AtoLicitacao.INICIAR_HABILITACAO, { ator, manager: m, ignorarSeJaAplicado: true, registro: { origem: 'habilitacao' } });
    });

    let jaHabilitado = false;
    const r = await this.dataSource.transaction(async (m) => {
      await this.prepararAto(m, licitacaoId, fornecedorId);
      const lic = await this.licitacao(m, licitacaoId);
      if (lic.fase !== FaseLicitacao.HABILITACAO) throw new ConflictException(`A convocação para a habilitação ocorre na fase de habilitação; a licitação está em ${lic.fase}.`);
      const existente = await this.habilitacaoDoLicitante(m, licitacaoId, fornecedorId);
      if (existente && STATUS_HABILITACAO_ATIVOS.includes(existente.status)) {
        throw new ConflictException('Este licitante já está convocado para a habilitação');
      }
      if (existente?.status === StatusHabilitacao.HABILITADO) {
        // A habilitação é do licitante: nova unidade aceita herda o resultado
        jaHabilitado = true;
        return { h: existente, cobertas: 0, total: 0 };
      }
      const sessao = await this.sessaoDaLicitacao(m, licitacaoId);
      const criada = await this.criarHabilitacao(m, {
        licitacaoId,
        sessaoId: sessao?.id ?? null,
        fornecedorId,
        origem: OrigemHabilitacao.CONVOCACAO,
        prazoHoras: horas,
        prazoAte: prazoAte(new Date(), horas),
        ator,
      });
      if (sessao) {
        await m.query(
          `UPDATE sessoes_disputa SET etapa = $2, fornecedor_habilitacao_id = $3, updated_at = now() WHERE id = $1`,
          [sessao.id, EtapaSessao.CONVOCACAO_HABILITACAO, fornecedorId],
        );
      }
      const nome = (await this.nomes(m, [fornecedorId])).get(fornecedorId)?.razaoSocial ?? fornecedorId;
      await this.evento(m, sessao?.id, {
        tipo: TipoEvento.CONVOCACAO_HABILITACAO,
        descricao:
          `${nome} convocado(a) a apresentar os documentos de habilitação até ${dataHora(criada.h.prazo_ate!)} — prazo de ${horas} h ` +
          `(Lei 14.133/2021, arts. 62–63; IN SEGES 73/2022, art. 39). Registro cadastral: ${criada.cobertas} de ${criada.total} exigência(s) já atendida(s) por documento válido (art. 70).`,
        fornecedorId,
        usuario: usuarioNome ?? sessao?.pregoeiro_nome ?? null,
        dados: { habilitacao_id: criada.h.id, prazo_ate: criada.h.prazo_ate, prazo_horas: horas, cobertas_cadastro: criada.cobertas },
      });
      return criada;
    });
    if (jaHabilitado) {
      await this.aceitacao.aoHabilitar(licitacaoId, fornecedorId, ator);
      await this.ajustarEtapaAposDecisao(licitacaoId);
    } else {
      this.notificar(licitacaoId, fornecedorId, 'Convocação para a habilitação', `Você foi convocado(a) a enviar os documentos de habilitação até ${dataHora(r.h.prazo_ate!)}. ${r.cobertas} exigência(s) já atendida(s) pelo seu registro cadastral.`);
    }
    return this.visaoDoAto(r.h.id, 'ORGAO');
  }

  /** Prorrogação (uma vez, mesmo período, antes do fim do prazo). */
  async prorrogar(habilitacaoId: string, motivo: string | undefined, ator: AtorTransicao, usuarioNome?: string) {
    const texto = (motivo ?? '').trim();
    if (!texto) throw new BadRequestException('Informe o motivo da prorrogação');
    await this.dataSource.transaction(async (m) => {
      const pre = await this.habilitacaoPorId(m, habilitacaoId);
      await this.prepararAto(m, pre.licitacao_id, pre.fornecedor_id);
      const h = await this.habilitacaoPorId(m, habilitacaoId, true);
      const erro = motivoNaoProrroga(h);
      if (erro) throw new ConflictException(erro);
      h.prorrogada_em = new Date();
      h.prorrogacao_motivo = texto;
      h.prazo_ate = prazoAte(new Date(h.prazo_ate!), Number(h.prazo_horas));
      await m.save(h);
      await this.evento(m, h.sessao_id ?? (await this.sessaoDaLicitacao(m, h.licitacao_id))?.id, {
        tipo: TipoEvento.MENSAGEM_SISTEMA,
        descricao: `Prazo da habilitação prorrogado por ${Number(h.prazo_horas)} h, até ${dataHora(h.prazo_ate)}. Motivo: ${texto}`,
        fornecedorId: h.fornecedor_id,
        usuario: usuarioNome ?? null,
        dados: { habilitacao_id: h.id, ato: 'PRORROGACAO', prazo_ate: h.prazo_ate },
      });
    });
    return this.visaoDoAto(habilitacaoId, 'ORGAO');
  }

  /** Análise de um documento: ATENDE ou NÃO ATENDE (motivo). Diligência → `abrirDiligencia`. */
  async analisarDocumento(documentoId: string, resultado: string | undefined, motivo: string | undefined, ator: AtorTransicao) {
    const r = String(resultado ?? '').toUpperCase();
    if (r === ResultadoAnalise.DILIGENCIA) throw new BadRequestException('Para pedir complementação, abra uma diligência (art. 64) indicando a exigência, o motivo e o prazo.');
    if (r !== ResultadoAnalise.ATENDE && r !== ResultadoAnalise.NAO_ATENDE) throw new BadRequestException('Resultado da análise: ATENDE ou NAO_ATENDE');
    const texto = (motivo ?? '').trim();
    if (r === ResultadoAnalise.NAO_ATENDE && texto.length < MOTIVO_MINIMO) {
      throw new BadRequestException(`Informe o motivo do não atendimento (mín. ${MOTIVO_MINIMO} caracteres)`);
    }
    let habId = '';
    await this.dataSource.transaction(async (m) => {
      const doc0 = await m.findOne(DocumentoHabilitacao, { where: { id: documentoId } });
      if (!doc0) throw new NotFoundException('Documento não encontrado');
      await this.prepararAto(m, doc0.licitacao_id, doc0.fornecedor_id);
      const h = await this.habilitacaoPorId(m, doc0.habilitacao_id, true);
      habId = h.id;
      const dils = await this.diligencias(m, h.id);
      await this.normalizar(m, h, dils);
      const erro = motivoNaoAnalisa(h.status);
      if (erro) throw new ConflictException(erro);
      const doc = await m.findOneOrFail(DocumentoHabilitacao, { where: { id: documentoId }, lock: { mode: 'pessimistic_write' } });
      if (r === ResultadoAnalise.ATENDE) {
        const hoje = hojeBrasilia();
        const [ex] = await m.query(`SELECT exige_validade FROM exigencias_habilitacao WHERE id = $1`, [doc.exigencia_id]);
        if (doc.origem === OrigemDocumento.CADASTRO) {
          // O documento do cadastro precisa continuar válido na data da análise
          const [atual] = await m.query(
            `SELECT id::text AS id, tipo::text AS tipo, status::text AS status, to_char(data_validade, 'YYYY-MM-DD') AS data_validade
               FROM fornecedor_documentos WHERE id::text = $1`,
            [doc.fornecedor_documento_id],
          );
          const invalido = atual ? motivoDocumentoCadastroInvalido(atual, !!ex?.exige_validade, hoje) : 'documento removido do cadastro';
          if (invalido) {
            throw new ConflictException(`Não é possível aceitar: ${invalido}. Abra diligência para atualização do documento (art. 64, II).`);
          }
        } else if (doc.validade && dataIso(doc.validade)! < hoje) {
          throw new ConflictException(`Documento com validade vencida em ${dataIso(doc.validade)!.split('-').reverse().join('/')} — abra diligência para atualização (art. 64, II).`);
        }
      }
      doc.analise = r;
      doc.analise_motivo = texto || null;
      doc.analisado_em = new Date();
      doc.analisado_por_tipo = ator.tipo;
      doc.analisado_por_id = ator.id;
      await m.save(doc);
    });
    return this.visaoDoAto(habId, 'ORGAO');
  }

  /** Diligência (art. 64): motivo, prazo próprio e as exigências que podem ser complementadas. */
  async abrirDiligencia(
    habilitacaoId: string,
    p: { motivo?: string; prazoHoras?: number; exigenciaIds?: string[] },
    ator: AtorTransicao,
    usuarioNome?: string,
  ) {
    let fornecedorId = '';
    let licitacaoId = '';
    let prazoTexto = '';
    await this.dataSource.transaction(async (m) => {
      const pre = await this.habilitacaoPorId(m, habilitacaoId);
      await this.prepararAto(m, pre.licitacao_id, pre.fornecedor_id);
      const h = await this.habilitacaoPorId(m, habilitacaoId, true);
      fornecedorId = h.fornecedor_id;
      licitacaoId = h.licitacao_id;
      const dils = await this.diligencias(m, h.id);
      await this.normalizar(m, h, dils);
      if (dils.some((d) => diligenciaVigente({ id: d.id, status: d.status, prazo_ate: d.prazo_ate, exigencia_ids: d.exigencia_ids }))) {
        throw new ConflictException('Já há uma diligência em aberto para este licitante');
      }
      const exigencias = await exigenciasDaLicitacaoSql(m, h.licitacao_id);
      const ids = [...new Set((p.exigenciaIds ?? []).map(String))];
      const erro = motivoNaoAbreDiligencia(h.status, { motivo: p.motivo, prazoHoras: p.prazoHoras ?? null, exigenciaIds: ids }, exigencias.map((e) => e.id));
      if (erro) throw new BadRequestException(erro);
      const horas = Number(p.prazoHoras);
      const agora = new Date();
      const d = await m.save(
        m.create(DiligenciaHabilitacao, {
          habilitacao_id: h.id,
          licitacao_id: h.licitacao_id,
          motivo: (p.motivo ?? '').trim(),
          exigencia_ids: ids,
          prazo_horas: horas,
          aberta_em: agora,
          prazo_ate: prazoAte(agora, horas),
          status: StatusDiligencia.ABERTA,
          aberta_por_tipo: ator.tipo,
          aberta_por_id: ator.id,
        }),
      );
      prazoTexto = dataHora(d.prazo_ate);
      await m.query(
        `UPDATE documentos_habilitacao SET analise = $3, updated_at = now()
          WHERE habilitacao_id = $1 AND exigencia_id::text = ANY($2) AND analise <> $4`,
        [h.id, ids, ResultadoAnalise.DILIGENCIA, ResultadoAnalise.ATENDE],
      );
      h.status = StatusHabilitacao.EM_DILIGENCIA;
      await m.save(h);
      const rotulos = exigencias.filter((e) => ids.includes(e.id)).map((e) => e.descricao);
      await this.evento(m, h.sessao_id ?? (await this.sessaoDaLicitacao(m, h.licitacao_id))?.id, {
        tipo: TipoEvento.MENSAGEM_SISTEMA,
        descricao:
          `Diligência na habilitação (Lei 14.133/2021, art. 64): complementação de ${rotulos.join('; ')} até ${prazoTexto}. ` +
          `Motivo: ${d.motivo}. Não se admite substituição nem documento novo além do indicado.`,
        fornecedorId: h.fornecedor_id,
        usuario: usuarioNome ?? null,
        dados: { habilitacao_id: h.id, ato: 'DILIGENCIA', diligencia_id: d.id, prazo_ate: d.prazo_ate, exigencia_ids: ids },
      });
    });
    this.notificar(licitacaoId, fornecedorId, 'Diligência na habilitação', `O agente de contratação pediu complementação de documentos de habilitação até ${prazoTexto}.`);
    return this.visaoDoAto(habilitacaoId, 'ORGAO');
  }

  /**
   * HABILITAR: todas as exigências obrigatórias atendidas, sem diligência
   * aberta. O licitante fica HABILITADO nas unidades em que a proposta foi
   * aceita (é o que a adjudicação consulta). Na inversão de fases: antes da
   * disputa julga a habilitação prévia; depois do julgamento, confirma a do
   * vencedor (INICIAR_HABILITACAO + unidades).
   */
  async habilitar(habilitacaoId: string, ator: AtorTransicao, usuarioNome?: string, observacao?: string | null) {
    const h0 = await this.habilitacaoPorId(this.dataSource.manager, habilitacaoId);
    await exigirLicitacaoAtiva(this.dataSource.manager, h0.licitacao_id);
    const lic0 = await this.licitacao(this.dataSource.manager, h0.licitacao_id);
    const confirmacaoInversao = !!lic0.inversao_fases && h0.status === StatusHabilitacao.HABILITADO;

    if (confirmacaoInversao) {
      if (lic0.fase !== FaseLicitacao.JULGAMENTO && lic0.fase !== FaseLicitacao.HABILITACAO) {
        throw new ConflictException('Habilitação prévia já julgada: a confirmação do vencedor ocorre depois da aceitação da proposta.');
      }
      await this.aceitacao.exigirPropostaAceita(h0.licitacao_id, h0.fornecedor_id);
      await this.transicoes.executar(h0.licitacao_id, AtoLicitacao.INICIAR_HABILITACAO, {
        ator,
        ignorarSeJaAplicado: true,
        registro: { origem: 'habilitacao', inversao_fases: true },
      });
      const n = await this.aceitacao.aoHabilitar(h0.licitacao_id, h0.fornecedor_id, ator);
      await this.dataSource.transaction(async (m) => {
        const sessao = await this.sessaoDaLicitacao(m, h0.licitacao_id);
        const nome = (await this.nomes(m, [h0.fornecedor_id])).get(h0.fornecedor_id)?.razaoSocial ?? h0.fornecedor_id;
        await this.evento(m, sessao?.id, {
          tipo: TipoEvento.HABILITACAO_APROVADA,
          descricao: `${nome} HABILITADO(A) — habilitação julgada antes da disputa (inversão de fases, Lei 14.133/2021 art. 17 §1º), confirmada em ${n} unidade(s) com proposta aceita.`,
          fornecedorId: h0.fornecedor_id,
          usuario: usuarioNome ?? sessao?.pregoeiro_nome ?? null,
          dados: { habilitacao_id: h0.id, inversao_fases: true, unidades: n },
        });
      });
      await this.ajustarEtapaAposDecisao(h0.licitacao_id);
      return this.visaoDoAto(habilitacaoId, 'ORGAO');
    }

    const previaInversao = !!lic0.inversao_fases;
    if (previaInversao && lic0.fase !== FaseLicitacao.ANALISE_PROPOSTAS) {
      throw new ConflictException('Inversão de fases: a habilitação de todos os licitantes é julgada depois do recebimento das propostas e antes da disputa (fase de análise das propostas).');
    }
    if (!previaInversao) {
      if (lic0.fase !== FaseLicitacao.HABILITACAO) throw new ConflictException(`A habilitação é decidida na fase de habilitação; a licitação está em ${lic0.fase}.`);
      const unidades = await this.ranking.unidadesDoLicitante(h0.licitacao_id, h0.fornecedor_id, [SituacaoLicitante.ACEITO, SituacaoLicitante.HABILITADO]);
      if (!unidades.length) throw new BadRequestException('O licitante não tem proposta aceita nesta licitação — não há o que habilitar.');
    }

    await this.dataSource.transaction(async (m) => {
      await this.prepararAto(m, h0.licitacao_id, h0.fornecedor_id);
      const h = await this.habilitacaoPorId(m, habilitacaoId, true);
      const dils = await this.diligencias(m, h.id);
      await this.normalizar(m, h, dils);
      if (STATUS_HABILITACAO_FINAIS.includes(h.status)) throw new ConflictException('A habilitação deste licitante já foi decidida');
      if (h.status === StatusHabilitacao.AGUARDANDO_ENVIO) {
        throw new ConflictException('O licitante ainda está no prazo de envio — aguarde a entrega da documentação ou o fim do prazo');
      }
      const exigencias = await exigenciasDaLicitacaoSql(m, h.licitacao_id);
      const pend = pendenciasParaHabilitar(exigencias, await this.documentos(m, h.id), this.estadoDils(dils));
      if (pend.length) throw new BadRequestException({ message: `Não é possível habilitar: ${pend.join(' | ')}`, pendencias: pend });
      h.status = StatusHabilitacao.HABILITADO;
      h.decidida_em = new Date();
      h.decisao_motivo = (observacao ?? '').trim() || null;
      h.decidida_por_tipo = ator.tipo;
      h.decidida_por_id = ator.id;
      await m.save(h);
      const sessao = await this.sessaoDaLicitacao(m, h.licitacao_id);
      const nome = (await this.nomes(m, [h.fornecedor_id])).get(h.fornecedor_id)?.razaoSocial ?? h.fornecedor_id;
      await this.evento(m, sessao?.id, {
        tipo: TipoEvento.HABILITACAO_APROVADA,
        descricao: previaInversao
          ? `${nome} HABILITADO(A) na habilitação prévia (inversão de fases, art. 17 §1º) — participa da disputa.`
          : `Habilitação APROVADA: ${nome} atendeu a todas as exigências de habilitação do edital (Lei 14.133/2021, arts. 62–70).`,
        fornecedorId: h.fornecedor_id,
        usuario: usuarioNome ?? sessao?.pregoeiro_nome ?? null,
        sistema: false,
        dados: { habilitacao_id: h.id, inversao_fases: previaInversao },
      });
    });
    if (!previaInversao) {
      await this.aceitacao.aoHabilitar(h0.licitacao_id, h0.fornecedor_id, ator);
      await this.ajustarEtapaAposDecisao(h0.licitacao_id);
    }
    this.notificar(h0.licitacao_id, h0.fornecedor_id, 'Resultado da habilitação', 'Você foi HABILITADO(A) nesta licitação.');
    return this.visaoDoAto(habilitacaoId, 'ORGAO');
  }

  /**
   * INABILITAR (motivo): o licitante sai do ranking — AceitacaoService.aoInabilitar
   * (INABILITADO em todas as unidades, RETORNAR_JULGAMENTO e o PRÓXIMO PELOS
   * LANCES convocado para a aceitação; sem próximo, a unidade fracassa). Na
   * inversão, antes da disputa: a proposta é desclassificada (não disputa).
   */
  async inabilitar(habilitacaoId: string, motivo: string | undefined, ator: AtorTransicao, usuarioNome?: string) {
    const texto = (motivo ?? '').trim();
    if (texto.length < MOTIVO_MINIMO) throw new BadRequestException(`Informe o motivo da inabilitação (mín. ${MOTIVO_MINIMO} caracteres)`);
    const h0 = await this.habilitacaoPorId(this.dataSource.manager, habilitacaoId);
    await exigirLicitacaoAtiva(this.dataSource.manager, h0.licitacao_id);
    const lic0 = await this.licitacao(this.dataSource.manager, h0.licitacao_id);
    const previaInversao = !!lic0.inversao_fases;
    if (previaInversao && lic0.fase !== FaseLicitacao.ANALISE_PROPOSTAS) {
      throw new ConflictException('Inversão de fases: a habilitação é julgada antes da disputa; depois dela, só por recurso (art. 165).');
    }
    if (!previaInversao && lic0.fase !== FaseLicitacao.HABILITACAO) {
      throw new ConflictException(`A habilitação é decidida na fase de habilitação; a licitação está em ${lic0.fase}.`);
    }
    let sessaoId: string | null = null;
    await this.dataSource.transaction(async (m) => {
      await this.prepararAto(m, h0.licitacao_id, h0.fornecedor_id);
      const h = await this.habilitacaoPorId(m, habilitacaoId, true);
      const dils = await this.diligencias(m, h.id);
      await this.normalizar(m, h, dils);
      if (STATUS_HABILITACAO_FINAIS.includes(h.status)) throw new ConflictException('A habilitação deste licitante já foi decidida');
      if (h.status === StatusHabilitacao.AGUARDANDO_ENVIO) {
        throw new ConflictException('O licitante ainda está no prazo de envio — aguarde a entrega da documentação ou o fim do prazo');
      }
      h.status = StatusHabilitacao.INABILITADO;
      h.decidida_em = new Date();
      h.decisao_motivo = texto;
      h.decidida_por_tipo = ator.tipo;
      h.decidida_por_id = ator.id;
      await m.save(h);
      await m.query(`UPDATE diligencias_habilitacao SET status = $2, updated_at = now() WHERE habilitacao_id = $1 AND status = $3`, [
        h.id,
        StatusDiligencia.EXPIRADA,
        StatusDiligencia.ABERTA,
      ]);
      const sessao = await this.sessaoDaLicitacao(m, h.licitacao_id);
      sessaoId = sessao?.id ?? null;
      if (previaInversao) {
        await m.query(
          `UPDATE propostas SET status = 'DESCLASSIFICADA', motivo_desclassificacao = $3, data_analise = now(), updated_at = now()
            WHERE licitacao_id = $1 AND fornecedor_id::text = $2 AND status::text = ANY($4)`,
          [h.licitacao_id, h.fornecedor_id, `Inabilitado na habilitação prévia (Lei 14.133/2021, art. 17 §1º): ${texto}`, STATUS_PROPOSTA_APTA],
        );
      }
      const nome = (await this.nomes(m, [h.fornecedor_id])).get(h.fornecedor_id)?.razaoSocial ?? h.fornecedor_id;
      await this.evento(m, sessao?.id, {
        tipo: TipoEvento.HABILITACAO_REPROVADA,
        descricao: previaInversao
          ? `${nome} INABILITADO(A) na habilitação prévia (inversão de fases, art. 17 §1º) — não participa da disputa. Motivo: ${texto}`
          : `Habilitação REPROVADA: ${nome} inabilitado(a). Motivo: ${texto}. O próximo classificado (ranking de lances) será convocado para a aceitação da proposta.`,
        fornecedorId: h.fornecedor_id,
        usuario: usuarioNome ?? sessao?.pregoeiro_nome ?? null,
        sistema: false,
        dados: { habilitacao_id: h.id, motivo: texto, inversao_fases: previaInversao },
      });
    });

    if (!previaInversao) {
      if (!sessaoId) throw new ConflictException('Sessão pública não encontrada para a licitação');
      const r = await this.aceitacao.aoInabilitar(sessaoId, h0.fornecedor_id, texto, ator, usuarioNome);
      await this.dataSource.transaction(async (m) => {
        let etapa: EtapaSessao;
        if (r.reconvocadas > 0) etapa = EtapaSessao.ACEITACAO_PROPOSTA;
        else if (r.restantesComAceite > 0) etapa = EtapaSessao.CONVOCACAO_HABILITACAO;
        else etapa = EtapaSessao.ENCERRAMENTO;
        await m.query(`UPDATE sessoes_disputa SET etapa = $2, fornecedor_habilitacao_id = NULL, updated_at = now() WHERE id = $1`, [sessaoId, etapa]);
        if (r.reconvocadas === 0 && r.restantesComAceite === 0) {
          await this.evento(m, sessaoId, {
            tipo: TipoEvento.SESSAO_ENCERRADA,
            descricao: 'Nenhum licitante classificado restante. Sessão encerrada sem vencedor.',
            sistema: true,
          });
        }
      });
    }
    this.notificar(h0.licitacao_id, h0.fornecedor_id, 'Resultado da habilitação', `Você foi INABILITADO(A) nesta licitação. Motivo: ${texto}`);
    return this.visaoDoAto(habilitacaoId, 'ORGAO');
  }

  /** Sessão depois de uma decisão: falta habilitar alguém com proposta aceita → convocação; senão → intenção de recurso. */
  private async ajustarEtapaAposDecisao(licitacaoId: string): Promise<void> {
    await this.dataSource.transaction(async (m) => {
      const sessao = await this.sessaoDaLicitacao(m, licitacaoId);
      if (!sessao) return;
      const faltam = await unidadesSemHabilitadoSql(m, licitacaoId);
      await m.query(`UPDATE sessoes_disputa SET etapa = $2, fornecedor_habilitacao_id = NULL, updated_at = now() WHERE id = $1`, [
        sessao.id,
        faltam.length ? EtapaSessao.CONVOCACAO_HABILITACAO : EtapaSessao.INTENCAO_RECURSO,
      ]);
      if (!faltam.length) {
        await this.evento(m, sessao.id, {
          tipo: TipoEvento.MENSAGEM_SISTEMA,
          descricao: 'Habilitação concluída. Aberta a manifestação de intenção de recurso (Lei 14.133/2021, art. 165).',
          sistema: true,
        });
      }
    });
  }

  // ==========================================================================
  // ATOS DO LICITANTE (sempre o fornecedor do token)
  // ==========================================================================

  private validarArquivo(arquivo: ArquivoHabilitacao | null | undefined): string {
    if (!arquivo || !arquivo.buffer?.length) throw new BadRequestException('Anexe o documento (PDF, JPG ou PNG)');
    const ext = extname(arquivo.originalname || '').toLowerCase();
    if (!MIMES_PERMITIDOS.includes(arquivo.mimetype) || !EXTENSOES_PERMITIDAS.includes(ext)) {
      throw new BadRequestException('Tipo de arquivo não permitido. Use PDF, JPG ou PNG.');
    }
    if (arquivo.size > TAMANHO_MAXIMO_DOCUMENTO) throw new BadRequestException('Arquivo acima de 10 MB');
    return ext;
  }

  /**
   * Envio de documento para uma exigência. Convocação: no prazo, antes da
   * entrega (ENVIO); depois, só COMPLEMENTO em diligência vigente que inclua a
   * exigência (art. 64). Inversão: com a proposta, até o fim do acolhimento.
   */
  async enviarDocumento(
    licitacaoId: string,
    exigenciaId: string,
    fornecedorId: string,
    dados: { arquivo?: ArquivoHabilitacao | null; validade?: string | null; observacao?: string | null },
  ) {
    const ext = this.validarArquivo(dados.arquivo);
    const arquivo = dados.arquivo!;
    const validade = (dados.validade ?? '').trim() || null;
    if (validade && !/^\d{4}-\d{2}-\d{2}$/.test(validade)) throw new BadRequestException('Validade inválida (use AAAA-MM-DD)');
    let habId = '';
    await this.dataSource.transaction(async (m) => {
      await this.prepararAto(m, licitacaoId, fornecedorId);
      const lic = await this.licitacao(m, licitacaoId);
      await garantirExigenciasSql(m, licitacaoId);
      const [ex] = await m.query(`SELECT id FROM exigencias_habilitacao WHERE id::text = $1 AND licitacao_id = $2`, [exigenciaId, licitacaoId]);
      if (!ex) throw new NotFoundException('Exigência não encontrada nesta licitação');
      let h = await this.habilitacaoDoLicitante(m, licitacaoId, fornecedorId);
      if (!h && lic.inversao_fases && FASES_ENVIO_INVERSAO.includes(lic.fase)) {
        const [p] = await m.query(
          `SELECT 1 FROM propostas WHERE licitacao_id = $1 AND fornecedor_id::text = $2 AND status::text = ANY($3) LIMIT 1`,
          [licitacaoId, fornecedorId, STATUS_PROPOSTA_APTA],
        );
        if (!p) throw new ConflictException('Envie a proposta antes de anexar os documentos de habilitação (inversão de fases, art. 17 §1º)');
        const corte = this.corteInversao(lic);
        if (corte && corte.getTime() < Date.now()) throw new ConflictException('O recebimento de propostas e documentos terminou');
        h = (
          await this.criarHabilitacao(m, {
            licitacaoId,
            sessaoId: null,
            fornecedorId,
            origem: OrigemHabilitacao.INVERSAO,
            prazoHoras: null,
            prazoAte: corte ?? prazoAte(new Date(), 24 * 365),
            ator: null,
          })
        ).h;
      }
      if (!h) throw new NotFoundException('Não há convocação de habilitação para você nesta licitação');
      h = await this.habilitacaoPorId(m, h.id, true);
      habId = h.id;
      const dils = await this.diligencias(m, h.id);
      await this.normalizar(m, h, dils);
      const regra = regraDeEnvio(h, exigenciaId, this.estadoDils(dils));
      if ('erro' in regra) throw new ConflictException(regra.erro);
      const doc = await m.save(
        m.create(DocumentoHabilitacao, {
          habilitacao_id: h.id,
          licitacao_id: licitacaoId,
          fornecedor_id: fornecedorId,
          exigencia_id: exigenciaId,
          origem: regra.origem,
          diligencia_id: regra.diligenciaId,
          arquivo_nome: (arquivo.originalname || `documento${ext}`).replace(/[^\w.\- ()À-ú]/g, '_').slice(0, 200),
          arquivo_mime: arquivo.mimetype,
          arquivo_tamanho: arquivo.size,
          arquivo_sha256: createHash('sha256').update(arquivo.buffer).digest('hex'),
          arquivo_conteudo: arquivo.buffer,
          validade,
          observacao: (dados.observacao ?? '').trim().slice(0, 1000) || null,
          enviado_em: new Date(),
          analise: ResultadoAnalise.PENDENTE,
        }),
      );
      if (regra.origem === OrigemDocumento.COMPLEMENTO) {
        await this.evento(m, h.sessao_id ?? (await this.sessaoDaLicitacao(m, licitacaoId))?.id, {
          tipo: TipoEvento.DOCUMENTO_HABILITACAO_ENVIADO,
          descricao: `Complementação de documento de habilitação em diligência (art. 64): ${doc.arquivo_nome} (SHA-256 ${doc.arquivo_sha256!.slice(0, 12)}…).`,
          fornecedorId,
          usuario: fornecedorId,
          dados: { habilitacao_id: h.id, documento_id: doc.id, diligencia_id: regra.diligenciaId },
        });
      }
    });
    return this.visaoDoAto(habId, 'FORNECEDOR');
  }

  /** Retira um documento ainda não entregue (rascunho, dentro do prazo). */
  async removerDocumento(documentoId: string, fornecedorId: string) {
    let habId = '';
    await this.dataSource.transaction(async (m) => {
      const doc = await m.findOne(DocumentoHabilitacao, { where: { id: documentoId } });
      if (!doc || doc.fornecedor_id !== fornecedorId) throw new NotFoundException('Documento não encontrado');
      await this.prepararAto(m, doc.licitacao_id, fornecedorId);
      const h = await this.habilitacaoPorId(m, doc.habilitacao_id, true);
      habId = h.id;
      const erro = motivoNaoRemove(h, doc);
      if (erro) throw new ConflictException(erro);
      await m.delete(DocumentoHabilitacao, { id: doc.id });
    });
    return this.visaoDoAto(habId, 'FORNECEDOR');
  }

  /** Entrega da documentação (a partir daqui não há substituição — art. 64). */
  async concluirEnvio(licitacaoId: string, fornecedorId: string) {
    let habId = '';
    await this.dataSource.transaction(async (m) => {
      await this.prepararAto(m, licitacaoId, fornecedorId);
      const pre = await this.habilitacaoDoLicitante(m, licitacaoId, fornecedorId);
      if (!pre) throw new NotFoundException('Não há convocação de habilitação para você nesta licitação');
      const h = await this.habilitacaoPorId(m, pre.id, true);
      habId = h.id;
      const erro = motivoNaoConcluiEnvio(h);
      if (erro) throw new ConflictException(erro);
      h.status = StatusHabilitacao.ENVIADA;
      h.enviada_em = new Date();
      await m.save(h);
      const [{ n }] = await m.query(`SELECT COUNT(*)::int AS n FROM documentos_habilitacao WHERE habilitacao_id = $1 AND origem = $2`, [h.id, OrigemDocumento.ENVIO]);
      const sessao = await this.sessaoDaLicitacao(m, licitacaoId);
      if (sessao && h.origem !== OrigemHabilitacao.INVERSAO) {
        await m.query(`UPDATE sessoes_disputa SET etapa = $2, updated_at = now() WHERE id = $1 AND etapa::text = $3`, [
          sessao.id,
          EtapaSessao.ANALISE_HABILITACAO,
          EtapaSessao.CONVOCACAO_HABILITACAO,
        ]);
      }
      await this.evento(m, h.sessao_id ?? sessao?.id, {
        tipo: TipoEvento.DOCUMENTO_HABILITACAO_ENVIADO,
        descricao: `Documentação de habilitação entregue pelo licitante (${n} documento(s) anexado(s), além dos do registro cadastral).`,
        fornecedorId,
        usuario: fornecedorId,
        dados: { habilitacao_id: h.id, documentos: Number(n) },
      });
    });
    return this.visaoDoAto(habId, 'FORNECEDOR');
  }

  /** Resposta à diligência (conclui a complementação antes do prazo). */
  async responderDiligencia(diligenciaId: string, fornecedorId: string, resposta?: string | null) {
    let habId = '';
    await this.dataSource.transaction(async (m) => {
      const d0 = await m.findOne(DiligenciaHabilitacao, { where: { id: diligenciaId } });
      if (!d0) throw new NotFoundException('Diligência não encontrada');
      const h0 = await this.habilitacaoPorId(m, d0.habilitacao_id);
      if (h0.fornecedor_id !== fornecedorId) throw new NotFoundException('Diligência não encontrada');
      await this.prepararAto(m, h0.licitacao_id, fornecedorId);
      const h = await this.habilitacaoPorId(m, h0.id, true);
      habId = h.id;
      const d = await m.findOneOrFail(DiligenciaHabilitacao, { where: { id: diligenciaId }, lock: { mode: 'pessimistic_write' } });
      if (!diligenciaVigente({ id: d.id, status: d.status, prazo_ate: d.prazo_ate, exigencia_ids: d.exigencia_ids })) {
        throw new ConflictException('Esta diligência não está aberta (respondida ou com o prazo encerrado)');
      }
      d.status = StatusDiligencia.RESPONDIDA;
      d.respondida_em = new Date();
      d.resposta = (resposta ?? '').trim().slice(0, 2000) || null;
      await m.save(d);
      const dils = await this.diligencias(m, h.id);
      await this.normalizar(m, h, dils);
      await this.evento(m, h.sessao_id ?? (await this.sessaoDaLicitacao(m, h.licitacao_id))?.id, {
        tipo: TipoEvento.DOCUMENTO_HABILITACAO_ENVIADO,
        descricao: `Resposta à diligência de habilitação registrada pelo licitante${d.resposta ? `: ${d.resposta}` : '.'}`,
        fornecedorId,
        usuario: fornecedorId,
        dados: { habilitacao_id: h.id, diligencia_id: d.id, ato: 'RESPOSTA_DILIGENCIA' },
      });
    });
    return this.visaoDoAto(habId, 'FORNECEDOR');
  }

  // ==========================================================================
  // ARQUIVO / AUTORIZAÇÃO
  // ==========================================================================

  /** Licitação e fornecedor da habilitação (para a checagem de dono no controller). */
  async donoDaHabilitacao(habilitacaoId: string): Promise<{ licitacaoId: string; fornecedorId: string } | null> {
    const [r] = await this.dataSource.query(`SELECT licitacao_id, fornecedor_id FROM habilitacoes_licitante WHERE id::text = $1`, [habilitacaoId]);
    return r ? { licitacaoId: String(r.licitacao_id), fornecedorId: String(r.fornecedor_id) } : null;
  }

  async donoDoDocumento(documentoId: string): Promise<{ licitacaoId: string; fornecedorId: string } | null> {
    const [r] = await this.dataSource.query(`SELECT licitacao_id, fornecedor_id FROM documentos_habilitacao WHERE id::text = $1`, [documentoId]);
    return r ? { licitacaoId: String(r.licitacao_id), fornecedorId: String(r.fornecedor_id) } : null;
  }

  async donoDaDiligencia(diligenciaId: string): Promise<{ licitacaoId: string; fornecedorId: string } | null> {
    const [r] = await this.dataSource.query(
      `SELECT h.licitacao_id, h.fornecedor_id FROM diligencias_habilitacao d JOIN habilitacoes_licitante h ON h.id = d.habilitacao_id WHERE d.id::text = $1`,
      [diligenciaId],
    );
    return r ? { licitacaoId: String(r.licitacao_id), fornecedorId: String(r.fornecedor_id) } : null;
  }

  /** O fornecedor tem proposta (qualquer situação enviada) ou habilitação nesta licitação? */
  async fornecedorEnvolvido(licitacaoId: string, fornecedorId: string): Promise<boolean> {
    const r = await this.dataSource.query(
      `SELECT 1 FROM propostas WHERE licitacao_id = $1 AND fornecedor_id::text = $2 AND status::text NOT IN ('RASCUNHO','CANCELADA')
        UNION ALL SELECT 1 FROM habilitacoes_licitante WHERE licitacao_id = $1 AND fornecedor_id = $2 LIMIT 1`,
      [licitacaoId, fornecedorId],
    );
    return r.length > 0;
  }

  async arquivo(documentoId: string): Promise<{ nome: string; mime: string; conteudo: Buffer }> {
    const d = await this.dataSource.manager
      .createQueryBuilder(DocumentoHabilitacao, 'd')
      .addSelect('d.arquivo_conteudo')
      .where('d.id = :id', { id: documentoId })
      .getOne();
    if (!d) throw new NotFoundException('Documento não encontrado');
    if (!d.arquivo_conteudo) throw new NotFoundException('Documento do registro cadastral — consulte o cadastro do fornecedor');
    return { nome: d.arquivo_nome || 'documento', mime: d.arquivo_mime || 'application/octet-stream', conteudo: d.arquivo_conteudo };
  }

  private async visaoDoAto(habilitacaoId: string, papel: Papel) {
    const m = this.dataSource.manager;
    const h = await this.habilitacaoPorId(m, habilitacaoId);
    const exigencias = await exigenciasDaLicitacaoSql(m, h.licitacao_id);
    const dils = await this.diligencias(m, h.id);
    const cad = await this.nomes(m, [h.fornecedor_id]);
    return this.visaoHabilitacao(h, exigencias, await this.documentos(m, h.id), dils, papel, cad.get(h.fornecedor_id));
  }

  // ==========================================================================
  // NOTIFICAÇÃO (melhor esforço — nunca derruba o ato)
  // ==========================================================================

  private notificar(licitacaoId: string, fornecedorId: string, titulo: string, mensagem: string): void {
    if (!this.notificacoes) return;
    void (async () => {
      try {
        const [l] = await this.dataSource.query(`SELECT orgao_id, numero_processo FROM licitacoes WHERE id = $1`, [licitacaoId]);
        const [f] = await this.dataSource.query(`SELECT email FROM fornecedores WHERE id::text = $1`, [fornecedorId]);
        if (!l?.orgao_id) return;
        await this.notificacoes!.criar({
          orgao_id: l.orgao_id,
          usuario_id: fornecedorId,
          usuario_email: f?.email ?? undefined,
          tipo: TipoNotificacao.SISTEMA,
          titulo: `${titulo}${l.numero_processo ? ` — ${l.numero_processo}` : ''}`,
          mensagem,
          prioridade: PrioridadeNotificacao.ALTA,
          entidade_tipo: 'licitacao',
          entidade_id: licitacaoId,
          link: `/fornecedor/licitacoes/${licitacaoId}`,
          enviar_email: !!f?.email,
          metadata: { origem: 'habilitacao' },
        });
      } catch (e: any) {
        this.logger.warn(`Notificação da habilitação não enviada (${licitacaoId}/${fornecedorId}): ${e?.message ?? e}`);
      }
    })();
  }
}
