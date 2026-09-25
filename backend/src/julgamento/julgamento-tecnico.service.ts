import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { extname } from 'path';
import { DataSource, EntityManager, In } from 'typeorm';
import { FaseLicitacao } from '../licitacoes/entities/licitacao.entity';
import { EventoSessao, TipoEvento } from '../sessao/entities/evento-sessao.entity';
import { AtorTransicao } from '../licitacoes/transicoes/transicoes.tipos';
import { STATUS_PROPOSTA_INVALIDA } from '../auth/acesso/acesso-licitacao.service';
import {
  ComissaoJulgamento,
  DocumentoTecnico,
  JulgamentoTecnico,
  NotaTecnica,
  PropostaRetornoEconomico,
  QuesitoTecnico,
} from './entities/julgamento-tecnico.entity';
import {
  MINIMO_MEMBROS_BANCA,
  PESO_TECNICA_MAXIMO,
  QuesitoConfig,
  ehCriterioPontuado,
  ehCriterioTecnico,
  motivoNotaInvalida,
  motivoRetornoInvalido,
  notaTecnica,
  pendenciasPublicacao,
  pesosEfetivos,
  retornoEconomico,
  validarConfiguracaoTecnica,
} from './criterios-julgamento';
import { RankingService } from './ranking.service';
import { SituacaoLicitante } from './regras-julgamento';

const MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
const EXTENSOES = ['.pdf', '.jpg', '.jpeg', '.png'];
export const TAMANHO_MAXIMO_DOCUMENTO_TECNICO = 10 * 1024 * 1024;

/** Quem lê: órgão dono, ou fornecedor do token (participa = tem proposta válida). */
export interface QuemLe {
  orgao?: boolean;
  fornecedorId?: string;
  participa?: boolean;
}

/** Fases em que o licitante envia a proposta técnica/de trabalho (junto com a proposta). */
const FASES_ENVIO: string[] = [FaseLicitacao.PUBLICADO, FaseLicitacao.IMPUGNACAO, FaseLicitacao.ACOLHIMENTO_PROPOSTAS];
/** Fases da avaliação técnica: depois do acolhimento e antes da etapa de preços (art. 36 §2º). */
const FASES_AVALIACAO: string[] = [FaseLicitacao.ANALISE_PROPOSTAS, FaseLicitacao.EM_DISPUTA];
/** A partir daqui o órgão pode abrir as propostas técnicas (acolhimento encerrado). */
const FASES_ANTES_DA_ABERTURA: string[] = [
  FaseLicitacao.PLANEJAMENTO,
  FaseLicitacao.TERMO_REFERENCIA,
  FaseLicitacao.PESQUISA_PRECOS,
  FaseLicitacao.ANALISE_JURIDICA,
  FaseLicitacao.APROVACAO_INTERNA,
  ...FASES_ENVIO,
];

/**
 * ============================================================================
 * JULGAMENTO TÉCNICO (Lei 14.133/2021 arts. 35–37) e MAIOR RETORNO (art. 39)
 * ============================================================================
 *
 *  - Edital: quesitos (descrição, peso, nota máxima), peso da técnica
 *    (técnica e preço, ≤ 70% — art. 36 §2º) e nota mínima; editáveis até a
 *    primeira nota. Banca: usuários do órgão designados (mín. 3 — art. 37 §1º).
 *  - Licitante: envia a proposta técnica (arquivo) junto com a proposta, no
 *    acolhimento. Sigilo: os demais licitantes só veem depois da publicação
 *    das notas; o órgão, depois do acolhimento.
 *  - Banca: cada membro atribui nota por quesito e licitante (registrada por
 *    membro), depois do acolhimento e ANTES da etapa de preços.
 *  - Publicação: todas as notas de todos os membros; NT calculada
 *    (criterios-julgamento.ts) e CONGELADA; abaixo da nota mínima →
 *    DESCLASSIFICADO em todas as unidades; evento na sala; leitura pública.
 *    Só depois disso a etapa de preços abre (gate no motor —
 *    `pendenciaJulgamentoTecnico`), e o ranking passa a ser por NT (melhor
 *    técnica) ou índice ponderado (técnica e preço).
 */
@Injectable()
export class JulgamentoTecnicoService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ranking: RankingService,
  ) {}

  // ==========================================================================
  // APOIO
  // ==========================================================================

  private async licitacao(licitacaoId: string, m?: EntityManager) {
    const [l] = await (m ?? this.dataSource.manager).query(
      `SELECT id, orgao_id, fase::text AS fase, situacao::text AS situacao, criterio_julgamento::text AS criterio FROM licitacoes WHERE id = $1`,
      [licitacaoId],
    );
    if (!l) throw new NotFoundException('Licitação não encontrada');
    return { id: String(l.id), orgaoId: String(l.orgao_id), fase: String(l.fase), situacao: String(l.situacao ?? 'ATIVA'), criterio: String(l.criterio) };
  }

  private exigirTecnico(criterio: string) {
    if (!ehCriterioTecnico(criterio)) {
      throw new BadRequestException('Esta licitação não usa critério técnico (melhor técnica ou técnica e preço — Lei 14.133, arts. 35 e 36).');
    }
  }

  /**
   * CONCURSO (E7c): sigilo de autoria até a publicação do julgamento — a banca
   * usa o painel do concurso (só códigos); estas rotas identificam licitantes.
   */
  private async exigirForaDoSigiloDoConcurso(licitacaoId: string) {
    const [l] = await this.dataSource.query(
      `SELECT l.modalidade::text AS m, j.publicado_em FROM licitacoes l LEFT JOIN julgamento_tecnico j ON j.licitacao_id = l.id WHERE l.id = $1`,
      [licitacaoId],
    );
    if (l?.m === 'CONCURSO' && !l.publicado_em) {
      throw new ConflictException('Concurso: sigilo de autoria até a publicação do julgamento — use o painel da banca do concurso (/api/concurso/licitacao/:id/banca).');
    }
  }

  private exigirAtiva(situacao: string) {
    if (situacao && situacao !== 'ATIVA') throw new ConflictException(`Licitação ${situacao.toLowerCase()}: ato não permitido`);
  }

  private async config(licitacaoId: string, m?: EntityManager): Promise<JulgamentoTecnico | null> {
    return (m ?? this.dataSource.manager).findOne(JulgamentoTecnico, { where: { licitacao_id: licitacaoId } });
  }

  private async quesitos(licitacaoId: string, m?: EntityManager): Promise<QuesitoTecnico[]> {
    return (m ?? this.dataSource.manager).find(QuesitoTecnico, { where: { licitacao_id: licitacaoId }, order: { ordem: 'ASC' } });
  }

  private async membros(licitacaoId: string, m?: EntityManager): Promise<Array<{ id: string; nome: string; papel: string; cargo: string | null }>> {
    const rows: any[] = await (m ?? this.dataSource.manager).query(
      `SELECT c.usuario_id::text AS id, c.papel, u.nome, u.cargo FROM comissao_julgamento c
         LEFT JOIN usuarios u ON u.id::text = c.usuario_id::text
        WHERE c.licitacao_id = $1 ORDER BY c.created_at`,
      [licitacaoId],
    );
    return rows.map((r) => ({ id: String(r.id), nome: r.nome ?? 'Membro', papel: r.papel, cargo: r.cargo ?? null }));
  }

  /** Licitantes com proposta válida (os que a banca avalia). */
  async licitantes(licitacaoId: string, m?: EntityManager): Promise<Array<{ id: string; nome: string; cpfCnpj: string }>> {
    const rows: any[] = await (m ?? this.dataSource.manager).query(
      `SELECT DISTINCT p.fornecedor_id::text AS id, f.razao_social, f.cpf_cnpj
         FROM propostas p LEFT JOIN fornecedores f ON f.id::text = p.fornecedor_id::text
        WHERE p.licitacao_id = $1 AND p.status::text <> ALL($2::text[])
        ORDER BY f.razao_social`,
      [licitacaoId, STATUS_PROPOSTA_INVALIDA],
    );
    return rows.map((r) => ({ id: String(r.id), nome: r.razao_social ?? 'Fornecedor', cpfCnpj: r.cpf_cnpj ?? '' }));
  }

  private async notas(licitacaoId: string, m?: EntityManager): Promise<NotaTecnica[]> {
    return (m ?? this.dataSource.manager).find(NotaTecnica, { where: { licitacao_id: licitacaoId } });
  }

  private async sessaoDaLicitacao(licitacaoId: string, m: EntityManager): Promise<string | null> {
    const [s] = await m.query(`SELECT id FROM sessoes_disputa WHERE licitacao_id = $1 ORDER BY created_at DESC LIMIT 1`, [licitacaoId]);
    return s ? String(s.id) : null;
  }

  // ==========================================================================
  // CONFIGURAÇÃO (edital) e BANCA
  // ==========================================================================

  async configuracao(licitacaoId: string) {
    const l = await this.licitacao(licitacaoId);
    const cfg = await this.config(licitacaoId);
    const quesitos = await this.quesitos(licitacaoId);
    const membros = await this.membros(licitacaoId);
    const [{ n }] = await this.dataSource.query(`SELECT COUNT(*)::int AS n FROM notas_tecnicas WHERE licitacao_id = $1`, [licitacaoId]);
    const pesos = pesosEfetivos(l.criterio, cfg?.peso_tecnica);
    return {
      licitacaoId,
      criterio: l.criterio,
      fase: l.fase,
      aplicavel: ehCriterioTecnico(l.criterio),
      pontuado: ehCriterioPontuado(l.criterio),
      pesoTecnica: l.criterio === 'TECNICA_E_PRECO' ? (cfg?.peso_tecnica != null ? Number(cfg.peso_tecnica) : null) : l.criterio === 'MELHOR_TECNICA' ? 100 : null,
      pesoPreco: l.criterio === 'TECNICA_E_PRECO' && cfg?.peso_tecnica != null ? Math.round(pesos.preco * 10000) / 100 : null,
      pesoTecnicaMaximo: PESO_TECNICA_MAXIMO,
      notaMinima: cfg?.nota_minima != null ? Number(cfg.nota_minima) : null,
      minimoMembrosBanca: MINIMO_MEMBROS_BANCA,
      quesitos: quesitos.map((q) => ({
        id: q.id,
        ordem: q.ordem,
        descricao: q.descricao,
        criterioAvaliacao: q.criterio_avaliacao,
        peso: Number(q.peso),
        notaMaxima: Number(q.nota_maxima),
      })),
      comissao: membros,
      totalNotas: Number(n),
      podeEditarQuesitos: !cfg?.publicado_em && Number(n) === 0,
      podeEditarComissao: !cfg?.publicado_em,
      publicadoEm: cfg?.publicado_em ?? null,
    };
  }

  /** Quesitos, peso da técnica e nota mínima (edital). Até a 1ª nota registrada. */
  async salvarConfiguracao(
    licitacaoId: string,
    dto: { pesoTecnica?: number | null; notaMinima?: number | null; quesitos?: QuesitoConfig[] },
    ator: AtorTransicao,
  ) {
    const l = await this.licitacao(licitacaoId);
    this.exigirTecnico(l.criterio);
    this.exigirAtiva(l.situacao);
    const erros = validarConfiguracaoTecnica({
      criterio: l.criterio,
      pesoTecnica: dto?.pesoTecnica ?? null,
      notaMinima: dto?.notaMinima ?? null,
      quesitos: dto?.quesitos ?? [],
    });
    if (erros.length) throw new BadRequestException(erros.join('; '));
    await this.dataSource.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`julgamento-tecnico:${licitacaoId}`]);
      const cfg = await this.config(licitacaoId, m);
      if (cfg?.publicado_em) throw new ConflictException('As notas técnicas já foram publicadas — a configuração não pode mais mudar');
      const [{ n }] = await m.query(`SELECT COUNT(*)::int AS n FROM notas_tecnicas WHERE licitacao_id = $1`, [licitacaoId]);
      if (Number(n) > 0) {
        throw new ConflictException('Já há notas registradas pela banca — quesitos e pesos do edital não podem mais mudar');
      }
      await m.save(
        m.create(JulgamentoTecnico, {
          ...(cfg ?? {}),
          licitacao_id: licitacaoId,
          peso_tecnica: l.criterio === 'TECNICA_E_PRECO' ? Number(dto.pesoTecnica) : null,
          nota_minima: dto?.notaMinima != null ? Number(dto.notaMinima) : null,
        }),
      );
      await m.delete(QuesitoTecnico, { licitacao_id: licitacaoId });
      await m.save(
        (dto.quesitos ?? []).map((q, i) =>
          m.create(QuesitoTecnico, {
            licitacao_id: licitacaoId,
            ordem: i + 1,
            descricao: String(q.descricao).trim(),
            criterio_avaliacao: q.criterioAvaliacao ? String(q.criterioAvaliacao).trim() : null,
            peso: Number(q.peso),
            nota_maxima: Number(q.notaMaxima),
          }),
        ),
      );
      void ator;
    });
    return this.configuracao(licitacaoId);
  }

  /** Designa a banca (usuários ativos do órgão da licitação). Até a publicação. */
  async designarComissao(licitacaoId: string, usuarioIds: string[], ator: AtorTransicao, presidenteId?: string | null) {
    const l = await this.licitacao(licitacaoId);
    this.exigirTecnico(l.criterio);
    this.exigirAtiva(l.situacao);
    const ids = [...new Set((Array.isArray(usuarioIds) ? usuarioIds : []).map(String))];
    if (!ids.length) throw new BadRequestException('Informe os membros da banca');
    const usuarios: any[] = await this.dataSource.query(
      `SELECT id::text AS id, orgao_id::text AS orgao_id, ativo FROM usuarios WHERE id::text = ANY($1::text[])`,
      [ids],
    );
    const invalidos = ids.filter((id) => {
      const u = usuarios.find((x) => x.id === id);
      return !u || u.orgao_id !== l.orgaoId || u.ativo === false;
    });
    if (invalidos.length) throw new BadRequestException('Membros da banca devem ser usuários ativos do órgão licitante');
    await this.dataSource.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`julgamento-tecnico:${licitacaoId}`]);
      const cfg = await this.config(licitacaoId, m);
      if (cfg?.publicado_em) throw new ConflictException('As notas técnicas já foram publicadas — a banca não pode mais mudar');
      const atuais = await m.find(ComissaoJulgamento, { where: { licitacao_id: licitacaoId } });
      const saem = atuais.filter((a) => !ids.includes(a.usuario_id));
      if (saem.length) {
        const [{ n }] = await m.query(
          `SELECT COUNT(*)::int AS n FROM notas_tecnicas WHERE licitacao_id = $1 AND membro_id::text = ANY($2::text[])`,
          [licitacaoId, saem.map((s) => s.usuario_id)],
        );
        if (Number(n) > 0) throw new ConflictException('Não é possível retirar da banca um membro que já atribuiu notas');
        await m.delete(ComissaoJulgamento, { id: In(saem.map((s) => s.id)) });
      }
      for (const id of ids) {
        const papel = presidenteId && presidenteId === id ? 'PRESIDENTE' : 'MEMBRO';
        const existe = atuais.find((a) => a.usuario_id === id);
        if (existe) {
          if (existe.papel !== papel) await m.update(ComissaoJulgamento, existe.id, { papel });
          continue;
        }
        await m.save(
          m.create(ComissaoJulgamento, { licitacao_id: licitacaoId, usuario_id: id, papel, designado_por_tipo: ator.tipo, designado_por_id: ator.id }),
        );
      }
    });
    return this.configuracao(licitacaoId);
  }

  /** Usuários ativos do órgão (candidatos à banca). */
  async usuariosDoOrgao(orgaoId: string) {
    const rows: any[] = await this.dataSource.query(
      `SELECT id::text AS id, nome, cargo, role::text AS role FROM usuarios WHERE orgao_id::text = $1 AND ativo IS NOT FALSE ORDER BY nome`,
      [orgaoId],
    );
    return rows.map((r) => ({ id: r.id, nome: r.nome, cargo: r.cargo ?? null, role: r.role ?? null }));
  }

  // ==========================================================================
  // PROPOSTA TÉCNICA (documentos do licitante)
  // ==========================================================================

  async enviarDocumento(licitacaoId: string, fornecedorId: string, arquivo: Express.Multer.File | null, descricao?: string | null) {
    const l = await this.licitacao(licitacaoId);
    if (!ehCriterioPontuado(l.criterio)) {
      throw new BadRequestException('Proposta técnica/de trabalho só se aplica aos critérios técnicos e ao maior retorno econômico');
    }
    this.exigirAtiva(l.situacao);
    if (!FASES_ENVIO.includes(l.fase)) {
      throw new ConflictException('A proposta técnica é enviada junto com a proposta, até o fim do acolhimento');
    }
    const [p] = await this.dataSource.query(
      `SELECT 1 FROM propostas WHERE licitacao_id = $1 AND fornecedor_id::text = $2 AND status::text NOT IN ('CANCELADA','DESCLASSIFICADA') LIMIT 1`,
      [licitacaoId, fornecedorId],
    );
    if (!p) throw new ForbiddenException('Cadastre a sua proposta nesta licitação antes de anexar a proposta técnica');
    if (!arquivo?.buffer?.length) throw new BadRequestException('Anexe o arquivo da proposta técnica');
    const ext = extname(arquivo.originalname || '').toLowerCase();
    if (!MIMES.includes(arquivo.mimetype) || !EXTENSOES.includes(ext)) throw new BadRequestException('Formato não aceito (PDF, JPG ou PNG)');
    if (arquivo.size > TAMANHO_MAXIMO_DOCUMENTO_TECNICO) throw new BadRequestException('Arquivo acima de 10 MB');
    const doc = await this.dataSource.getRepository(DocumentoTecnico).save(
      this.dataSource.getRepository(DocumentoTecnico).create({
        licitacao_id: licitacaoId,
        fornecedor_id: fornecedorId,
        nome: (arquivo.originalname || 'proposta-tecnica').slice(0, 255),
        descricao: descricao ? String(descricao).slice(0, 2000) : null,
        mime: arquivo.mimetype,
        tamanho: arquivo.size,
        sha256: createHash('sha256').update(arquivo.buffer).digest('hex'),
        conteudo: arquivo.buffer,
      }),
    );
    return this.visaoDocumento(doc);
  }

  async removerDocumento(licitacaoId: string, fornecedorId: string, documentoId: string) {
    const l = await this.licitacao(licitacaoId);
    if (!FASES_ENVIO.includes(l.fase)) throw new ConflictException('O acolhimento terminou — a proposta técnica não pode mais ser alterada');
    const r = await this.dataSource.getRepository(DocumentoTecnico).delete({ id: documentoId, licitacao_id: licitacaoId, fornecedor_id: fornecedorId });
    if (!r.affected) throw new NotFoundException('Documento não encontrado');
    return { removido: true };
  }

  private visaoDocumento(d: DocumentoTecnico, nome?: string | null) {
    return {
      id: d.id,
      fornecedorId: d.fornecedor_id,
      razaoSocial: nome ?? null,
      nome: d.nome,
      descricao: d.descricao,
      mime: d.mime,
      tamanho: d.tamanho,
      sha256: d.sha256,
      enviadoEm: d.created_at,
    };
  }

  /**
   * Quem vê quais propostas técnicas:
   *  - o licitante: as suas, sempre; as dos demais, só depois da publicação das notas;
   *  - o órgão dono: todas, depois do acolhimento (sigilo das propostas até a abertura).
   */
  private async podeVerDocumentosDe(licitacaoId: string, quem: QuemLe, dono: string): Promise<boolean> {
    const l = await this.licitacao(licitacaoId);
    if (quem.orgao) return !FASES_ANTES_DA_ABERTURA.includes(l.fase);
    if (quem.fornecedorId === dono) return true;
    if (!quem.participa) return false;
    const cfg = await this.config(licitacaoId);
    return !!cfg?.publicado_em;
  }

  async documentos(licitacaoId: string, quem: QuemLe) {
    const docs = await this.dataSource.getRepository(DocumentoTecnico).find({ where: { licitacao_id: licitacaoId }, order: { created_at: 'ASC' } });
    const nomes = new Map((await this.licitantes(licitacaoId)).map((x) => [x.id, x.nome]));
    const visiveis: DocumentoTecnico[] = [];
    const cache = new Map<string, boolean>();
    for (const d of docs) {
      if (!cache.has(d.fornecedor_id)) cache.set(d.fornecedor_id, await this.podeVerDocumentosDe(licitacaoId, quem, d.fornecedor_id));
      if (cache.get(d.fornecedor_id)) visiveis.push(d);
    }
    return { documentos: visiveis.map((d) => this.visaoDocumento(d, nomes.get(d.fornecedor_id))) };
  }

  async arquivoDocumento(licitacaoId: string, documentoId: string, quem: QuemLe) {
    const d = await this.dataSource
      .getRepository(DocumentoTecnico)
      .createQueryBuilder('d')
      .addSelect('d.conteudo')
      .where('d.id = :id AND d.licitacao_id = :l', { id: documentoId, l: licitacaoId })
      .getOne();
    if (!d || !(await this.podeVerDocumentosDe(licitacaoId, quem, d.fornecedor_id))) throw new NotFoundException('Documento não encontrado');
    return { nome: d.nome, mime: d.mime, conteudo: d.conteudo };
  }

  // ==========================================================================
  // NOTAS DA BANCA
  // ==========================================================================

  /** Painel da banca (órgão dono): quesitos, membros, licitantes, notas por membro, progresso, pendências. */
  async painelNotas(licitacaoId: string, usuarioId: string | null) {
    await this.exigirForaDoSigiloDoConcurso(licitacaoId);
    const cfg = await this.configuracao(licitacaoId);
    const licitantes = await this.licitantes(licitacaoId);
    const notas = await this.notas(licitacaoId);
    const pend = pendenciasPublicacao({
      quesitos: cfg.quesitos.map((q) => ({ id: q.id, descricao: q.descricao })),
      membros: cfg.comissao,
      licitantes: licitantes.map((x) => ({ id: x.id, nome: x.nome })),
      notas: notas.map((n) => ({ quesitoId: n.quesito_id, fornecedorId: n.fornecedor_id, membroId: n.membro_id, nota: Number(n.nota) })),
    });
    const prevCalc = this.calcular(cfg.quesitos, licitantes, notas, cfg.notaMinima);
    const jt = await this.config(licitacaoId);
    return {
      ...cfg,
      souMembro: !!usuarioId && cfg.comissao.some((c) => c.id === usuarioId),
      usuarioId,
      fasePermiteNotas: FASES_AVALIACAO.includes(cfg.fase),
      licitantes,
      notas: notas.map((n) => ({
        quesitoId: n.quesito_id,
        fornecedorId: n.fornecedor_id,
        membroId: n.membro_id,
        nota: Number(n.nota),
        justificativa: n.justificativa,
        registradaEm: n.updated_at,
      })),
      pendencias: pend,
      podePublicar: !cfg.publicadoEm && !pend.length && FASES_AVALIACAO.includes(cfg.fase),
      previa: cfg.publicadoEm ? null : prevCalc,
      resultado: jt?.resultado ?? null,
    };
  }

  private calcular(
    quesitos: Array<{ id: string; peso: number; notaMaxima: number; descricao?: string }>,
    licitantes: Array<{ id: string; nome: string }>,
    notas: NotaTecnica[],
    notaMinima: number | null,
  ) {
    const base = notas.map((n) => ({ quesitoId: n.quesito_id, fornecedorId: n.fornecedor_id, membroId: n.membro_id, nota: Number(n.nota) }));
    return licitantes
      .map((l) => {
        const r = notaTecnica(quesitos.map((q) => ({ id: q.id, peso: q.peso, notaMaxima: q.notaMaxima })), base, l.id);
        return {
          fornecedorId: l.id,
          razaoSocial: l.nome,
          notaTecnica: r.nota,
          porQuesito: r.porQuesito.map((pq) => ({
            ...pq,
            notasMembros: base.filter((n) => n.quesitoId === pq.quesitoId && n.fornecedorId === l.id).map((n) => ({ membroId: n.membroId, nota: n.nota })),
          })),
          abaixoDoMinimo: notaMinima != null && r.nota < Number(notaMinima),
        };
      })
      .sort((a, b) => b.notaTecnica - a.notaTecnica);
  }

  /** Notas de UM membro da banca (o usuário do token) — upsert por quesito e licitante. */
  async registrarNotas(
    licitacaoId: string,
    usuarioId: string,
    notas: Array<{ quesitoId: string; fornecedorId: string; nota: number; justificativa?: string | null }>,
  ) {
    const l = await this.licitacao(licitacaoId);
    this.exigirTecnico(l.criterio);
    this.exigirAtiva(l.situacao);
    await this.exigirForaDoSigiloDoConcurso(licitacaoId);
    if (!FASES_AVALIACAO.includes(l.fase)) {
      throw new ConflictException('As notas técnicas são atribuídas depois do acolhimento e antes da etapa de preços (art. 36 §2º)');
    }
    const membros = await this.membros(licitacaoId);
    if (!membros.some((mb) => mb.id === usuarioId)) throw new ForbiddenException('Apenas membros da banca designada atribuem notas técnicas');
    if (!Array.isArray(notas) || !notas.length) throw new BadRequestException('Informe as notas');
    const quesitos = await this.quesitos(licitacaoId);
    const licitantes = new Set((await this.licitantes(licitacaoId)).map((x) => x.id));
    const erros: string[] = [];
    for (const n of notas) {
      const q = quesitos.find((x) => x.id === n?.quesitoId);
      if (!q) erros.push('Quesito não pertence a esta licitação');
      else if (!licitantes.has(String(n.fornecedorId))) erros.push('Licitante sem proposta válida nesta licitação');
      else {
        const e = motivoNotaInvalida(Number(n.nota), Number(q.nota_maxima));
        if (e) erros.push(`Quesito ${q.ordem}: ${e}`);
      }
    }
    if (erros.length) throw new BadRequestException([...new Set(erros)].join('; '));
    await this.dataSource.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`julgamento-tecnico:${licitacaoId}`]);
      const cfg = await this.config(licitacaoId, m);
      if (cfg?.publicado_em) throw new ConflictException('As notas técnicas já foram publicadas');
      for (const n of notas) {
        await m.query(
          `INSERT INTO notas_tecnicas (id, licitacao_id, quesito_id, fornecedor_id, membro_id, nota, justificativa, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, now(), now())
           ON CONFLICT (quesito_id, fornecedor_id, membro_id) DO UPDATE
             SET nota = EXCLUDED.nota, justificativa = EXCLUDED.justificativa, updated_at = now()`,
          [licitacaoId, n.quesitoId, String(n.fornecedorId), usuarioId, Number(n.nota), n.justificativa ? String(n.justificativa).slice(0, 4000) : null],
        );
      }
    });
    return this.painelNotas(licitacaoId, usuarioId);
  }

  /**
   * PUBLICAÇÃO das notas técnicas (antes da etapa de preços): exige banca
   * completa e todas as notas; congela o resultado; nota abaixo da mínima →
   * DESCLASSIFICADO em todas as unidades; evento na sala.
   */
  async publicar(licitacaoId: string, ator: AtorTransicao, usuarioNome?: string) {
    const l = await this.licitacao(licitacaoId);
    this.exigirTecnico(l.criterio);
    this.exigirAtiva(l.situacao);
    if (!FASES_AVALIACAO.includes(l.fase)) {
      throw new ConflictException('A publicação das notas técnicas ocorre depois do acolhimento e antes da etapa de preços');
    }
    await this.dataSource.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`julgamento-tecnico:${licitacaoId}`]);
      const cfg = await this.config(licitacaoId, m);
      if (cfg?.publicado_em) throw new ConflictException('As notas técnicas já foram publicadas');
      if (l.criterio === 'TECNICA_E_PRECO' && cfg?.peso_tecnica == null) {
        throw new BadRequestException('Defina o peso da proposta técnica (art. 36 §2º) antes de publicar');
      }
      const quesitos = (await this.quesitos(licitacaoId, m)).map((q) => ({ id: q.id, descricao: q.descricao, peso: Number(q.peso), notaMaxima: Number(q.nota_maxima) }));
      const membros = await this.membros(licitacaoId, m);
      const licitantes = await this.licitantes(licitacaoId, m);
      const notas = await this.notas(licitacaoId, m);
      const pend = pendenciasPublicacao({
        quesitos,
        membros,
        licitantes: licitantes.map((x) => ({ id: x.id, nome: x.nome })),
        notas: notas.map((n) => ({ quesitoId: n.quesito_id, fornecedorId: n.fornecedor_id, membroId: n.membro_id, nota: Number(n.nota) })),
      });
      if (pend.length) throw new BadRequestException(`Julgamento técnico incompleto: ${pend.join('; ')}`);
      const notaMinima = cfg?.nota_minima != null ? Number(cfg.nota_minima) : null;
      const resultado = this.calcular(quesitos, licitantes, notas, notaMinima);
      const agora = new Date();
      await m.save(
        m.create(JulgamentoTecnico, {
          ...(cfg ?? { licitacao_id: licitacaoId }),
          licitacao_id: licitacaoId,
          publicado_em: agora,
          publicado_por_tipo: ator.tipo,
          publicado_por_id: ator.id,
          resultado,
        }),
      );
      // Abaixo da nota mínima: desclassificado em todas as unidades (sai do ranking)
      const abaixo = resultado.filter((r) => r.abaixoDoMinimo);
      if (abaixo.length) {
        const unidades = await this.ranking.unidades(licitacaoId, m);
        for (const u of unidades) {
          for (const r of abaixo) {
            await this.ranking.definirSituacao(m, u, r.fornecedorId, SituacaoLicitante.DESCLASSIFICADO, {
              motivo: `Nota técnica ${r.notaTecnica.toFixed(2)} abaixo da mínima do edital (${notaMinima})`,
              ator,
            });
          }
        }
      }
      const sessaoId = await this.sessaoDaLicitacao(licitacaoId, m);
      if (sessaoId) {
        await m.save(
          m.create(EventoSessao, {
            sessao_id: sessaoId,
            tipo: TipoEvento.MENSAGEM_SISTEMA,
            descricao:
              `Notas técnicas PUBLICADAS (Lei 14.133/2021, arts. 36 §2º e 37): ` +
              resultado.map((r, i) => `${i + 1}º ${r.razaoSocial} ${r.notaTecnica.toFixed(2)}${r.abaixoDoMinimo ? ' (abaixo da mínima)' : ''}`).join('; ') +
              '. Segue a etapa de preços.',
            dados_adicionais: { origem: 'JULGAMENTO_TECNICO', resultado: resultado.map((r) => ({ fornecedorId: r.fornecedorId, notaTecnica: r.notaTecnica })) },
            usuario_nome: usuarioNome ?? 'Agente de contratação',
            is_sistema: false,
          }),
        );
      }
    });
    return this.resultadoPublico(licitacaoId);
  }

  /** Resultado técnico PÚBLICO (só depois da publicação). */
  async resultadoPublico(licitacaoId: string) {
    const l = await this.licitacao(licitacaoId);
    const cfg = await this.config(licitacaoId);
    if (!cfg?.publicado_em) return { licitacaoId, criterio: l.criterio, publicado: false };
    const quesitos = await this.quesitos(licitacaoId);
    return {
      licitacaoId,
      criterio: l.criterio,
      publicado: true,
      publicadoEm: cfg.publicado_em,
      pesoTecnica: cfg.peso_tecnica != null ? Number(cfg.peso_tecnica) : null,
      notaMinima: cfg.nota_minima != null ? Number(cfg.nota_minima) : null,
      quesitos: quesitos.map((q) => ({ id: q.id, ordem: q.ordem, descricao: q.descricao, peso: Number(q.peso), notaMaxima: Number(q.nota_maxima) })),
      resultado: (cfg.resultado ?? []).map((r: any) => ({
        fornecedorId: r.fornecedorId,
        razaoSocial: r.razaoSocial,
        notaTecnica: r.notaTecnica,
        abaixoDoMinimo: !!r.abaixoDoMinimo,
        porQuesito: r.porQuesito,
      })),
    };
  }

  // ==========================================================================
  // MAIOR RETORNO ECONÔMICO (art. 39) — proposta de trabalho + percentual
  // ==========================================================================

  async enviarRetorno(
    licitacaoId: string,
    fornecedorId: string,
    itens: Array<{ unidadeId: string; economiaEstimada: number; percentualRemuneracao: number; descricaoEconomia?: string | null }>,
  ) {
    const l = await this.licitacao(licitacaoId);
    if (l.criterio !== 'MAIOR_RETORNO_ECONOMICO') throw new BadRequestException('Esta licitação não usa o critério maior retorno econômico (art. 39)');
    this.exigirAtiva(l.situacao);
    if (!FASES_ENVIO.includes(l.fase)) throw new ConflictException('A proposta de trabalho é enviada até o fim do acolhimento');
    const [p] = await this.dataSource.query(
      `SELECT 1 FROM propostas WHERE licitacao_id = $1 AND fornecedor_id::text = $2 AND status::text NOT IN ('CANCELADA','DESCLASSIFICADA') LIMIT 1`,
      [licitacaoId, fornecedorId],
    );
    if (!p) throw new ForbiddenException('Cadastre a sua proposta nesta licitação antes da proposta de trabalho');
    const unidades = new Set((await this.ranking.unidades(licitacaoId)).map((u) => u.id));
    if (!Array.isArray(itens) || !itens.length) throw new BadRequestException('Informe a economia estimada e o percentual por item/lote');
    const erros: string[] = [];
    for (const i of itens) {
      if (!unidades.has(String(i?.unidadeId))) erros.push('Item/lote não pertence a esta licitação');
      const e = motivoRetornoInvalido({ economiaEstimada: Number(i?.economiaEstimada), percentualRemuneracao: Number(i?.percentualRemuneracao) });
      if (e) erros.push(e);
    }
    if (erros.length) throw new BadRequestException([...new Set(erros)].join('; '));
    for (const i of itens) {
      await this.dataSource.query(
        `INSERT INTO propostas_retorno_economico
           (id, licitacao_id, unidade_id, fornecedor_id, economia_estimada, descricao_economia, percentual_remuneracao, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, now(), now())
         ON CONFLICT (unidade_id, fornecedor_id) DO UPDATE
           SET economia_estimada = EXCLUDED.economia_estimada, descricao_economia = EXCLUDED.descricao_economia,
               percentual_remuneracao = EXCLUDED.percentual_remuneracao, updated_at = now()`,
        [licitacaoId, i.unidadeId, fornecedorId, Number(i.economiaEstimada), i.descricaoEconomia ?? null, Number(i.percentualRemuneracao)],
      );
    }
    return this.retornos(licitacaoId, { fornecedorId });
  }

  /** Propostas de retorno: o licitante vê as suas; o órgão, todas depois do acolhimento. */
  async retornos(licitacaoId: string, quem: { orgao?: boolean; fornecedorId?: string }) {
    const l = await this.licitacao(licitacaoId);
    const where: any = { licitacao_id: licitacaoId };
    if (!quem.orgao) where.fornecedor_id = quem.fornecedorId;
    else if (FASES_ANTES_DA_ABERTURA.includes(l.fase)) return { retornos: [] };
    const rows = await this.dataSource.getRepository(PropostaRetornoEconomico).find({ where });
    return {
      retornos: rows.map((r) => ({
        unidadeId: r.unidade_id,
        fornecedorId: r.fornecedor_id,
        economiaEstimada: Number(r.economia_estimada),
        descricaoEconomia: r.descricao_economia,
        percentualRemuneracao: Number(r.percentual_remuneracao),
        ...retornoEconomico({ economiaEstimada: Number(r.economia_estimada), percentualRemuneracao: Number(r.percentual_remuneracao) }),
      })),
    };
  }
}
