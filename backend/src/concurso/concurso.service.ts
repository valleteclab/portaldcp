import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource, EntityManager } from 'typeorm';
import { FaseLicitacao, Licitacao, ModalidadeLicitacao } from '../licitacoes/entities/licitacao.entity';
import { FASES_INTERNAS } from '../licitacoes/transicoes/fases';
import { TransicoesService } from '../licitacoes/transicoes/transicoes.service';
import { AtoLicitacao, AtorTransicao, atorSistema } from '../licitacoes/transicoes/transicoes.tipos';
import { RankingService } from '../julgamento/ranking.service';
import { JulgamentoTecnicoService } from '../julgamento/julgamento-tecnico.service';
import { SituacaoLicitante, atualDaUnidade } from '../julgamento/regras-julgamento';
import { motivoNotaInvalida, notaTecnica, pendenciasPublicacao } from '../julgamento/criterios-julgamento';
import { EventoSessao, TipoEvento } from '../sessao/entities/evento-sessao.entity';
import { EtapaSessao, SessaoDisputa, StatusSessao } from '../sessao/entities/sessao-disputa.entity';
import { Proposta, StatusProposta } from '../propostas/entities/proposta.entity';
import { PropostaItem } from '../propostas/entities/proposta-item.entity';
import { diretorioDeGravacao } from '../common/arquivos/arquivos';
import { PlanoAdjudicacao, ResultadoService } from '../resultado/resultado.service';
import { fmtDataHoraBrasilia } from '../resultado/formalizacao/termo-resultado-pdf';
import { fmtDocumento, fmtMoeda, gerarTermoSimplesPdf } from '../modalidades-especiais/termo-pdf';
import { ConcursoPremiacao, ConcursoRegulamento, ConcursoTrabalho } from './concurso.entities';
import {
  TAMANHO_MAXIMO_PADRAO_MB,
  gerarCodigoTrabalho,
  motivoArquivoTrabalhoInvalido,
  motivoTrabalhoIdentificado,
  validarRegulamento,
} from './regras-concurso';
import { pendenciasEditalConcursoSql } from './concurso.sql';

export type VisaoConcurso = { tipo: 'ORGAO'; usuarioId?: string | null } | { tipo: 'FORNECEDOR'; fornecedorId: string } | { tipo: 'PUBLICO' };

export interface ArquivoEnviado {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
}

const PASTA_TERMOS = 'concurso';
const FASES_INSCRICAO: string[] = [FaseLicitacao.ACOLHIMENTO_PROPOSTAS];

/**
 * ============================================================================
 * CONCURSO (Lei 14.133/2021 art. 30; plano E7c) — regras em `regras-concurso.ts`
 * ============================================================================
 *  - Regulamento (art. 30 I a III) editável na fase interna; um item = prêmio.
 *  - Inscrição = trabalho (arquivo) sob CÓDIGO + envelope de identificação
 *    (qualificação) + declarações; cria a proposta pelo valor fixo do prêmio
 *    (o licitante não "cota" preço).
 *  - Banca (E3 — quesitos, comissão ≥ 3) julga pelo PAINEL DO CONCURSO, que
 *    só mostra códigos: SIGILO DE AUTORIA até a publicação do julgamento
 *    (JULGAR_CONCURSO). As rotas genéricas do julgamento técnico recusam o
 *    concurso antes disso.
 *  - Depois: qualificação do 1º (envelope aberto) → ACEITO; recurso (E5,
 *    janela no JULGAMENTO); ADJUDICAR/HOMOLOGAR (ResultadoService, plano =
 *    vencedor ACEITO × prêmio); premiação + termo de cessão de direitos
 *    (art. 30 parágrafo único; art. 93); aceite da cessão pelo vencedor e
 *    registro do pagamento do prêmio.
 */
@Injectable()
export class ConcursoService implements OnModuleInit {
  private readonly logger = new Logger(ConcursoService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly transicoes: TransicoesService,
    private readonly ranking: RankingService,
    private readonly tecnico: JulgamentoTecnicoService,
    private readonly resultado: ResultadoService,
  ) {}

  onModuleInit(): void {
    this.resultado.registrarModalidade(ModalidadeLicitacao.CONCURSO, {
      rotuloInstrumento: 'Termo de premiação e cessão de direitos',
      planoAdjudicacao: (id, m) => this.planoAdjudicacao(id, m),
      gerarInstrumentos: (id, ator) => this.gerarPremiacao(id, ator),
      listarInstrumentos: (id) => this.listarPremiacoes(id),
    });
  }

  // ==========================================================================
  // APOIO
  // ==========================================================================

  private async licitacao(id: string, m: EntityManager = this.ds.manager): Promise<Licitacao> {
    const lic = await m.getRepository(Licitacao).findOne({ where: { id } });
    if (!lic || lic.modalidade !== ModalidadeLicitacao.CONCURSO) throw new NotFoundException('Concurso não encontrado');
    return lic;
  }

  private exigirAtiva(lic: Licitacao) {
    if (lic.situacao && lic.situacao !== 'ATIVA') throw new ConflictException(`Concurso ${String(lic.situacao).toLowerCase()} — ato não permitido`);
  }

  /** A autoria só é conhecida depois da publicação do julgamento. */
  static autoriaRevelada(fase: string): boolean {
    return [FaseLicitacao.JULGAMENTO, FaseLicitacao.HABILITACAO, FaseLicitacao.RECURSO, FaseLicitacao.ADJUDICACAO, FaseLicitacao.HOMOLOGACAO].includes(fase as FaseLicitacao);
  }

  private async sessaoDoConcurso(m: EntityManager, licitacaoId: string): Promise<string | null> {
    const [s] = await m.query(`SELECT id FROM sessoes_disputa WHERE licitacao_id = $1 ORDER BY created_at DESC LIMIT 1`, [licitacaoId]);
    return s ? String(s.id) : null;
  }

  private async evento(m: EntityManager, licitacaoId: string, descricao: string, dados: Record<string, any> = {}, fornecedorId?: string | null) {
    const sessaoId = await this.sessaoDoConcurso(m, licitacaoId);
    if (!sessaoId) return;
    await m.save(
      m.create(EventoSessao, {
        sessao_id: sessaoId,
        tipo: TipoEvento.MENSAGEM_SISTEMA,
        descricao,
        fornecedor_id: fornecedorId ?? undefined,
        fornecedor_identificador: fornecedorId ?? undefined,
        usuario_nome: 'Comissão do concurso',
        is_sistema: false,
        dados_adicionais: { origem: 'concurso', visibilidade: 'PUBLICA', ...dados },
      }),
    );
  }

  private async nomes(ids: string[]): Promise<Map<string, { nome: string; doc: string }>> {
    const v = [...new Set(ids.filter(Boolean))];
    if (!v.length) return new Map();
    const rows: any[] = await this.ds.query(`SELECT id::text AS id, razao_social, cpf_cnpj FROM fornecedores WHERE id::text = ANY($1)`, [v]);
    return new Map(rows.map((r) => [r.id, { nome: r.razao_social, doc: r.cpf_cnpj }]));
  }

  private async itemPremio(m: EntityManager, licitacaoId: string) {
    const itens: any[] = await m.query(
      `SELECT id::text AS id, numero_item, quantidade, valor_unitario_estimado, valor_total_estimado, status::text AS status
         FROM itens_licitacao WHERE licitacao_id = $1 ORDER BY numero_item`,
      [licitacaoId],
    );
    return itens;
  }

  // ==========================================================================
  // REGULAMENTO (edital — art. 30)
  // ==========================================================================

  async salvarRegulamento(licitacaoId: string, dto: Record<string, any>) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirAtiva(lic);
    if (!FASES_INTERNAS.includes(lic.fase)) throw new ConflictException('Regulamento publicado — altere pela retificação do edital (art. 55, §1º).');
    const campos = [
      'natureza_trabalho', 'qualificacao_exigida', 'diretrizes_trabalho', 'forma_apresentacao', 'condicoes_realizacao',
      'tipo_retribuicao', 'valor_premio', 'descricao_premio', 'elaboracao_projeto', 'exige_cessao_direitos', 'tamanho_maximo_mb',
    ];
    const repo = this.ds.getRepository(ConcursoRegulamento);
    const atual = await repo.findOne({ where: { licitacao_id: licitacaoId } });
    const dados: Record<string, any> = {};
    for (const c of campos) if (dto?.[c] !== undefined) dados[c] = dto[c] === '' ? null : dto[c];
    if (dados.elaboracao_projeto === true) dados.exige_cessao_direitos = true; // art. 30 parágrafo único
    const final = { ...(atual ?? {}), ...dados };
    const erros = validarRegulamento(final as any);
    if (erros.length) throw new BadRequestException({ message: erros.join(' | '), pendencias: erros });
    await this.ds.transaction(async (m) => {
      await m.getRepository(ConcursoRegulamento).save(m.getRepository(ConcursoRegulamento).create({ ...(atual ?? {}), ...dados, licitacao_id: licitacaoId }));
      // O item único é o prêmio/remuneração do vencedor (valor fixo do edital)
      const itens = await this.itemPremio(m, licitacaoId);
      if (itens.length === 1) {
        const qtd = Number(itens[0].quantidade) > 0 ? Number(itens[0].quantidade) : 1;
        const premio = Math.round(Number(final.valor_premio) * 100) / 100;
        await m.query(
          `UPDATE itens_licitacao SET valor_unitario_estimado = $2, valor_total_estimado = $3, tipo_item = 'SERVICO', updated_at = now() WHERE id::text = $1`,
          [itens[0].id, Math.round((premio / qtd) * 10000) / 10000, premio],
        );
        await m.query(`UPDATE licitacoes SET valor_total_estimado = $2 WHERE id = $1`, [licitacaoId, premio]);
      }
    });
    return this.painel(licitacaoId, { tipo: 'ORGAO' });
  }

  // ==========================================================================
  // PAINEL
  // ==========================================================================

  async painel(licitacaoId: string, visao: VisaoConcurso) {
    const lic = await this.licitacao(licitacaoId);
    if (visao.tipo === 'PUBLICO' && FASES_INTERNAS.includes(lic.fase)) throw new NotFoundException('Concurso não encontrado');
    const reg = await this.ds.getRepository(ConcursoRegulamento).findOne({ where: { licitacao_id: licitacaoId } });
    const trabalhos = await this.ds.getRepository(ConcursoTrabalho).find({ where: { licitacao_id: licitacaoId }, order: { codigo: 'ASC' } });
    const revelada = ConcursoService.autoriaRevelada(lic.fase);
    const nomes = revelada || visao.tipo === 'FORNECEDOR' ? await this.nomes(trabalhos.map((t) => t.fornecedor_id)) : new Map();
    const [jt] = await this.ds.query(`SELECT publicado_em, resultado FROM julgamento_tecnico WHERE licitacao_id = $1`, [licitacaoId]);
    const resultadoPublicado = jt?.publicado_em ? (Array.isArray(jt.resultado) ? jt.resultado : []) : null;
    const codigoDe = new Map(trabalhos.map((t) => [t.fornecedor_id, t]));
    const classificacao = resultadoPublicado
      ? resultadoPublicado.map((r: any, i: number) => ({
          posicao: i + 1,
          codigo: codigoDe.get(String(r.fornecedorId))?.codigo ?? null,
          trabalhoId: codigoDe.get(String(r.fornecedorId))?.id ?? null,
          titulo: codigoDe.get(String(r.fornecedorId))?.titulo ?? null,
          autor: r.razaoSocial ?? null,
          notaTecnica: Number(r.notaTecnica),
          qualificacao: codigoDe.get(String(r.fornecedorId))?.qualificacao ?? null,
        }))
      : null;
    const visiveis = trabalhos.filter((t) => visao.tipo === 'ORGAO' || (visao.tipo === 'FORNECEDOR' && t.fornecedor_id === visao.fornecedorId));
    const premiacoes = await this.ds.getRepository(ConcursoPremiacao).find({ where: { licitacao_id: licitacaoId } });
    return {
      licitacao: {
        id: lic.id,
        numero_processo: lic.numero_processo,
        objeto: lic.objeto,
        fase: lic.fase,
        situacao: lic.situacao,
        data_fim_acolhimento: lic.data_fim_acolhimento,
      },
      regulamento: reg,
      autoriaRevelada: revelada,
      sessaoId: await this.sessaoDoConcurso(this.ds.manager, licitacaoId),
      trabalhos: visiveis.map((t) => ({
        id: t.id,
        codigo: t.codigo,
        titulo: t.titulo,
        resumo: t.resumo,
        status: t.status,
        enviadoEm: t.created_at,
        arquivo: { mime: t.arquivo_mime, tamanho: t.arquivo_tamanho, sha256: t.arquivo_sha256 },
        // SIGILO DE AUTORIA: o órgão só liga código a autor depois do julgamento
        autor: revelada || (visao.tipo === 'FORNECEDOR' && t.fornecedor_id === visao.fornecedorId) ? nomes.get(t.fornecedor_id)?.nome ?? null : null,
        fornecedorId: revelada || visao.tipo === 'FORNECEDOR' ? t.fornecedor_id : null,
        temIdentificacao: !!t.identificacao_sha256,
        qualificacao: revelada || visao.tipo === 'FORNECEDOR' ? t.qualificacao : null,
        qualificacaoMotivo: revelada || visao.tipo === 'FORNECEDOR' ? t.qualificacao_motivo : null,
      })),
      totalTrabalhos: trabalhos.filter((t) => t.status === 'SUBMETIDO').length,
      classificacao: classificacao && (visao.tipo !== 'PUBLICO' || revelada) ? classificacao : null,
      premiacoes: premiacoes
        .filter((p) => visao.tipo === 'ORGAO' || (visao.tipo === 'FORNECEDOR' && p.fornecedor_id === visao.fornecedorId) || (visao.tipo === 'PUBLICO' && !!lic.data_homologacao))
        .map((p) => ({
          id: p.id,
          fornecedorId: p.fornecedor_id,
          trabalhoId: p.trabalho_id,
          valor: Number(p.valor),
          status: p.status,
          exigeCessao: p.exige_cessao,
          termoGeradoEm: p.termo_gerado_em,
          cessaoAceitaEm: p.cessao_aceita_em,
          pagamentoRegistradoEm: p.pagamento_registrado_em,
        })),
      pendenciasEdital: visao.tipo === 'ORGAO' && FASES_INTERNAS.includes(lic.fase) ? await pendenciasEditalConcursoSql(this.ds.manager, licitacaoId) : [],
      inscricaoAberta: FASES_INSCRICAO.includes(lic.fase) && (!lic.data_fim_acolhimento || Date.now() < new Date(lic.data_fim_acolhimento).getTime()),
    };
  }

  // ==========================================================================
  // INSCRIÇÃO (trabalho sob código)
  // ==========================================================================

  async inscrever(
    licitacaoId: string,
    fornecedorId: string,
    arquivos: { trabalho?: ArquivoEnviado | null; identificacao?: ArquivoEnviado | null },
    dto: { titulo?: string; resumo?: string; declaracao_autoria?: any; declaracao_cessao?: any },
  ) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirAtiva(lic);
    if (!FASES_INSCRICAO.includes(lic.fase) || (lic.data_fim_acolhimento && Date.now() >= new Date(lic.data_fim_acolhimento).getTime())) {
      throw new ConflictException('Inscrições fechadas: o trabalho é enviado durante o prazo de recebimento do edital.');
    }
    const reg = await this.ds.getRepository(ConcursoRegulamento).findOne({ where: { licitacao_id: licitacaoId } });
    const maxMb = Number(reg?.tamanho_maximo_mb) > 0 ? Number(reg!.tamanho_maximo_mb) : TAMANHO_MAXIMO_PADRAO_MB;
    const m1 = motivoArquivoTrabalhoInvalido(arquivos.trabalho, maxMb);
    if (m1) throw new BadRequestException(m1);
    const m2 = motivoArquivoTrabalhoInvalido(arquivos.identificacao, maxMb, true);
    if (m2) throw new BadRequestException(m2);
    const titulo = String(dto?.titulo ?? '').trim();
    if (titulo.length < 3) throw new BadRequestException('Informe o título do trabalho (sem identificar o autor).');
    const sim = (v: any) => v === true || v === 'true';
    if (!sim(dto?.declaracao_autoria)) throw new BadRequestException('Declare a autoria do trabalho e o atendimento ao regulamento.');
    if (reg?.exige_cessao_direitos && !sim(dto?.declaracao_cessao)) {
      throw new BadRequestException('Este concurso exige a cessão dos direitos patrimoniais do trabalho vencedor (art. 30, parágrafo único; art. 93) — declare a concordância.');
    }
    const [forn] = await this.ds.query(`SELECT razao_social, cpf_cnpj FROM fornecedores WHERE id::text = $1`, [fornecedorId]);
    const ident = motivoTrabalhoIdentificado(arquivos.trabalho!.originalname ?? '', { nome: forn?.razao_social, documento: forn?.cpf_cnpj });
    if (ident) throw new BadRequestException(ident);
    const itens = await this.itemPremio(this.ds.manager, licitacaoId);
    if (itens.length !== 1) throw new ConflictException('Concurso sem o item do prêmio configurado.');

    return this.ds.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`concurso:${licitacaoId}`]);
      const repo = m.getRepository(ConcursoTrabalho);
      const existente = await repo.findOne({ where: { licitacao_id: licitacaoId, fornecedor_id: fornecedorId } });
      if (existente?.status === 'SUBMETIDO') throw new ConflictException('Você já inscreveu um trabalho — retire-o para enviar outro (até o fim do prazo).');
      // Proposta pelo valor FIXO do prêmio (o concurso não disputa preço — art. 6º XXXIX)
      let proposta = await m.getRepository(Proposta).findOne({ where: { licitacao_id: licitacaoId, fornecedor_id: fornecedorId } });
      const it = itens[0];
      const qtd = Number(it.quantidade) > 0 ? Number(it.quantidade) : 1;
      const total = Number(it.valor_total_estimado) || Math.round(Number(it.valor_unitario_estimado) * qtd * 100) / 100;
      if (!proposta) {
        proposta = await m.getRepository(Proposta).save(
          m.getRepository(Proposta).create({
            licitacao_id: licitacaoId,
            fornecedor_id: fornecedorId,
            status: StatusProposta.ENVIADA,
            declaracao_termos: true,
            declaracao_inexistencia_fatos: true,
            declaracao_menor: true,
            declaracao_integridade: true,
            declaracao_responsabilidade: true,
            valor_total_proposta: total,
            data_envio: new Date(),
            observacoes: 'Inscrição no concurso (trabalho sob código — sigilo de autoria)',
          }),
        );
        await m.getRepository(PropostaItem).save(
          m.getRepository(PropostaItem).create({ proposta_id: proposta.id, item_licitacao_id: it.id, valor_unitario: Math.round((total / qtd) * 10000) / 10000, valor_total: total } as any),
        );
      } else {
        await m.update(Proposta, proposta.id, { status: StatusProposta.ENVIADA, data_envio: new Date() });
      }
      let codigo = gerarCodigoTrabalho();
      for (let i = 0; i < 5 && (await repo.count({ where: { licitacao_id: licitacaoId, codigo } })); i++) codigo = gerarCodigoTrabalho();
      const t = arquivos.trabalho!;
      const idn = arquivos.identificacao!;
      const dados: Partial<ConcursoTrabalho> = {
        licitacao_id: licitacaoId,
        fornecedor_id: fornecedorId,
        proposta_id: proposta.id,
        codigo,
        titulo: titulo.slice(0, 200),
        resumo: dto?.resumo ? String(dto.resumo).slice(0, 4000) : null,
        arquivo: t.buffer,
        arquivo_mime: String(t.mimetype),
        arquivo_tamanho: Number(t.size),
        arquivo_sha256: createHash('sha256').update(t.buffer).digest('hex'),
        identificacao: idn.buffer,
        identificacao_nome: String(idn.originalname || 'identificacao').slice(0, 250),
        identificacao_mime: String(idn.mimetype),
        identificacao_sha256: createHash('sha256').update(idn.buffer).digest('hex'),
        declaracao_autoria: true,
        declaracao_cessao: sim(dto?.declaracao_cessao),
        status: 'SUBMETIDO',
        qualificacao: 'PENDENTE',
        qualificacao_motivo: null,
      };
      const salvo = existente ? (await repo.update(existente.id, dados), { ...existente, ...dados }) : await repo.save(repo.create(dados));
      return { id: (salvo as any).id, codigo, titulo: dados.titulo, sha256: dados.arquivo_sha256, enviadoEm: new Date() };
    });
  }

  async retirar(licitacaoId: string, fornecedorId: string) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirAtiva(lic);
    if (!FASES_INSCRICAO.includes(lic.fase) || (lic.data_fim_acolhimento && Date.now() >= new Date(lic.data_fim_acolhimento).getTime())) {
      throw new ConflictException('O prazo de inscrição terminou — o trabalho não pode mais ser retirado.');
    }
    const t = await this.ds.getRepository(ConcursoTrabalho).findOne({ where: { licitacao_id: licitacaoId, fornecedor_id: fornecedorId, status: 'SUBMETIDO' } });
    if (!t) throw new NotFoundException('Nenhum trabalho inscrito');
    await this.ds.transaction(async (m) => {
      await m.update(ConcursoTrabalho, t.id, { status: 'RETIRADO' });
      if (t.proposta_id) await m.update(Proposta, t.proposta_id, { status: StatusProposta.CANCELADA });
    });
    return { retirado: true };
  }

  /** Arquivo do trabalho: autor; órgão (banca) depois do fim das inscrições — por id, sem autoria. */
  async arquivoTrabalho(licitacaoId: string, trabalhoId: string, visao: VisaoConcurso) {
    const lic = await this.licitacao(licitacaoId);
    const t = await this.ds
      .getRepository(ConcursoTrabalho)
      .createQueryBuilder('t')
      .addSelect('t.arquivo')
      .where('t.id = :id AND t.licitacao_id = :l', { id: trabalhoId, l: licitacaoId })
      .getOne();
    if (!t) throw new NotFoundException('Trabalho não encontrado');
    const dono = visao.tipo === 'FORNECEDOR' && visao.fornecedorId === t.fornecedor_id;
    const orgao = visao.tipo === 'ORGAO' && ![...FASES_INTERNAS, FaseLicitacao.PUBLICADO, FaseLicitacao.ACOLHIMENTO_PROPOSTAS].includes(lic.fase);
    if (!dono && !orgao) throw new NotFoundException('Trabalho não encontrado');
    const ext = t.arquivo_mime === 'application/pdf' ? 'pdf' : t.arquivo_mime.includes('zip') ? 'zip' : t.arquivo_mime.split('/')[1] || 'bin';
    return { nome: `${t.codigo}.${ext}`, mime: t.arquivo_mime, conteudo: t.arquivo };
  }

  /** Envelope de identificação: autor; órgão só depois da publicação do julgamento. */
  async arquivoIdentificacao(licitacaoId: string, trabalhoId: string, visao: VisaoConcurso) {
    const lic = await this.licitacao(licitacaoId);
    const t = await this.ds
      .getRepository(ConcursoTrabalho)
      .createQueryBuilder('t')
      .addSelect('t.identificacao')
      .where('t.id = :id AND t.licitacao_id = :l', { id: trabalhoId, l: licitacaoId })
      .getOne();
    if (!t?.identificacao) throw new NotFoundException('Identificação não encontrada');
    const dono = visao.tipo === 'FORNECEDOR' && visao.fornecedorId === t.fornecedor_id;
    if (!dono && !(visao.tipo === 'ORGAO' && ConcursoService.autoriaRevelada(lic.fase))) {
      throw new NotFoundException('Identificação não encontrada (sigilo de autoria até o julgamento)');
    }
    return { nome: t.identificacao_nome ?? 'identificacao', mime: t.identificacao_mime ?? 'application/pdf', conteudo: t.identificacao };
  }

  // ==========================================================================
  // BANCA (sigilo de autoria)
  // ==========================================================================

  async painelBanca(licitacaoId: string, usuarioId: string | null) {
    const lic = await this.licitacao(licitacaoId);
    const cfg = await this.tecnico.configuracao(licitacaoId);
    const trabalhos = await this.ds.getRepository(ConcursoTrabalho).find({ where: { licitacao_id: licitacaoId, status: 'SUBMETIDO' }, order: { codigo: 'ASC' } });
    const notas: any[] = await this.ds.query(
      `SELECT quesito_id::text AS quesito_id, fornecedor_id, membro_id::text AS membro_id, nota, justificativa FROM notas_tecnicas WHERE licitacao_id = $1`,
      [licitacaoId],
    );
    const porFornecedor = new Map(trabalhos.map((t) => [t.fornecedor_id, t]));
    const quesitos = cfg.quesitos.map((q) => ({ id: q.id, peso: q.peso, notaMaxima: q.notaMaxima }));
    const base = notas.map((n) => ({ quesitoId: n.quesito_id, fornecedorId: String(n.fornecedor_id), membroId: n.membro_id, nota: Number(n.nota) }));
    const pendencias = pendenciasPublicacao({
      quesitos: cfg.quesitos.map((q) => ({ id: q.id, descricao: q.descricao })),
      membros: cfg.comissao,
      licitantes: trabalhos.map((t) => ({ id: t.fornecedor_id, nome: t.codigo })),
      notas: base,
    });
    return {
      fase: lic.fase,
      fasePermiteNotas: lic.fase === FaseLicitacao.ANALISE_PROPOSTAS,
      publicado: !!cfg.publicadoEm,
      quesitos: cfg.quesitos,
      comissao: cfg.comissao.map((c) => ({ id: c.id, nome: c.nome, papel: c.papel })),
      souMembro: !!usuarioId && cfg.comissao.some((c) => c.id === usuarioId),
      // Só CÓDIGO e título — nunca o autor (sigilo até o julgamento)
      trabalhos: trabalhos.map((t) => ({
        id: t.id,
        codigo: t.codigo,
        titulo: t.titulo,
        resumo: t.resumo,
        notaPrevia: notaTecnica(quesitos, base, t.fornecedor_id).nota,
      })),
      minhasNotas: notas
        .filter((n) => n.membro_id === usuarioId)
        .map((n) => ({ trabalhoId: porFornecedor.get(String(n.fornecedor_id))?.id ?? null, quesitoId: n.quesito_id, nota: Number(n.nota), justificativa: n.justificativa })),
      progresso: cfg.comissao.map((c) => ({
        membro: c.nome,
        notas: notas.filter((n) => n.membro_id === c.id).length,
        esperadas: cfg.quesitos.length * trabalhos.length,
      })),
      pendencias,
    };
  }

  async registrarNotas(licitacaoId: string, usuarioId: string, notas: Array<{ trabalhoId: string; quesitoId: string; nota: number; justificativa?: string | null }>) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirAtiva(lic);
    if (lic.fase !== FaseLicitacao.ANALISE_PROPOSTAS) throw new ConflictException('A banca atribui notas depois do fim das inscrições e antes da publicação do julgamento.');
    const cfg = await this.tecnico.configuracao(licitacaoId);
    if (cfg.publicadoEm) throw new ConflictException('O julgamento já foi publicado.');
    if (!cfg.comissao.some((c) => c.id === usuarioId)) throw new ForbiddenException('Apenas membros da banca designada atribuem notas (art. 37, §1º).');
    if (!Array.isArray(notas) || !notas.length) throw new BadRequestException('Informe as notas');
    const trabalhos = await this.ds.getRepository(ConcursoTrabalho).find({ where: { licitacao_id: licitacaoId, status: 'SUBMETIDO' } });
    const erros: string[] = [];
    const linhas: Array<{ fornecedorId: string; quesitoId: string; nota: number; justificativa: string | null }> = [];
    for (const n of notas) {
      const t = trabalhos.find((x) => x.id === n?.trabalhoId);
      const q = cfg.quesitos.find((x) => x.id === n?.quesitoId);
      if (!t) erros.push('Trabalho não inscrito neste concurso');
      else if (!q) erros.push('Quesito não pertence a este concurso');
      else {
        const e = motivoNotaInvalida(Number(n.nota), Number(q.notaMaxima));
        if (e) erros.push(`${t.codigo} — quesito ${q.ordem}: ${e}`);
        else linhas.push({ fornecedorId: t.fornecedor_id, quesitoId: q.id, nota: Number(n.nota), justificativa: n.justificativa ? String(n.justificativa).slice(0, 4000) : null });
      }
    }
    if (erros.length) throw new BadRequestException([...new Set(erros)].join('; '));
    await this.ds.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`julgamento-tecnico:${licitacaoId}`]);
      for (const l of linhas) {
        await m.query(
          `INSERT INTO notas_tecnicas (id, licitacao_id, quesito_id, fornecedor_id, membro_id, nota, justificativa, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, now(), now())
           ON CONFLICT (quesito_id, fornecedor_id, membro_id) DO UPDATE
             SET nota = EXCLUDED.nota, justificativa = EXCLUDED.justificativa, updated_at = now()`,
          [licitacaoId, l.quesitoId, l.fornecedorId, usuarioId, l.nota, l.justificativa],
        );
      }
    });
    return this.painelBanca(licitacaoId, usuarioId);
  }

  // ==========================================================================
  // JULGAMENTO (JULGAR_CONCURSO) e QUALIFICAÇÃO
  // ==========================================================================

  /**
   * Publica o julgamento da banca: notas congeladas (E3), autoria revelada,
   * sessão pública do resultado criada (ata, recursos), unidade encerrada e
   * a licitação em JULGAMENTO — ato JULGAR_CONCURSO.
   */
  async julgar(licitacaoId: string, ator: AtorTransicao, usuarioNome?: string | null) {
    const lic = await this.licitacao(licitacaoId);
    await this.transicoes.verificar(licitacaoId, AtoLicitacao.JULGAR_CONCURSO, { ator });
    const [jt] = await this.ds.query(`SELECT publicado_em FROM julgamento_tecnico WHERE licitacao_id = $1`, [licitacaoId]);
    if (!jt?.publicado_em) await this.tecnico.publicar(licitacaoId, ator, usuarioNome ?? undefined);
    const trabalhos = await this.ds.getRepository(ConcursoTrabalho).find({ where: { licitacao_id: licitacaoId, status: 'SUBMETIDO' } });
    const nomes = await this.nomes(trabalhos.map((t) => t.fornecedor_id));
    await this.transicoes.executar(licitacaoId, AtoLicitacao.JULGAR_CONCURSO, {
      ator,
      registro: { origem: 'concurso', trabalhos: trabalhos.length },
      aplicar: async (_l, m) => {
        let sessaoId = await this.sessaoDoConcurso(m, licitacaoId);
        if (!sessaoId) {
          const s = await m.getRepository(SessaoDisputa).save(
            m.getRepository(SessaoDisputa).create({
              licitacao_id: licitacaoId,
              status: StatusSessao.EM_ANDAMENTO,
              etapa: EtapaSessao.ACEITACAO_PROPOSTA,
              data_hora_inicio_real: new Date(),
              pregoeiro_nome: usuarioNome ?? 'Comissão do concurso',
              anonimizacao_ativa: false,
              observacoes: 'Sessão pública do resultado do concurso (art. 30) — sem etapa de lances',
            } as Partial<SessaoDisputa>),
          );
          sessaoId = s.id;
        }
        await m.query(
          `UPDATE itens_licitacao SET status_disputa = 'ENCERRADO', disputa_encerrada_em = now(), updated_at = now()
            WHERE licitacao_id = $1 AND status::text NOT IN ('DESERTO','FRACASSADO','CANCELADO')`,
          [licitacaoId],
        );
        const [res] = await m.query(`SELECT resultado FROM julgamento_tecnico WHERE licitacao_id = $1`, [licitacaoId]);
        const lista: any[] = Array.isArray(res?.resultado) ? res.resultado : [];
        const porF = new Map(trabalhos.map((t) => [t.fornecedor_id, t]));
        await m.save(
          m.create(EventoSessao, {
            sessao_id: sessaoId,
            tipo: TipoEvento.MENSAGEM_SISTEMA,
            descricao:
              'Julgamento do concurso PUBLICADO — autoria revelada: ' +
              lista
                .map((r, i) => `${i + 1}º ${porF.get(String(r.fornecedorId))?.codigo ?? '?'} (${nomes.get(String(r.fornecedorId))?.nome ?? r.razaoSocial}) — nota ${Number(r.notaTecnica).toFixed(2)}`)
                .join('; ') +
              '. Segue a conferência da qualificação do vencedor (art. 30, I).',
            usuario_nome: usuarioNome ?? 'Comissão do concurso',
            is_sistema: false,
            dados_adicionais: { origem: 'concurso', visibilidade: 'PUBLICA' },
          }),
        );
      },
    });
    // Linhas CLASSIFICADO por unidade (ranking pontuado — melhor técnica)
    for (const u of await this.ranking.unidades(licitacaoId)) await this.ranking.ranking(u);
    this.logger.log(`[${lic.numero_processo}] concurso julgado — autoria revelada`);
    return this.painel(licitacaoId, { tipo: 'ORGAO' });
  }

  /**
   * Qualificação do trabalho NA VEZ (1º não excluído do ranking): QUALIFICADO →
   * resultado declarado (ACEITO); NÃO QUALIFICADO (motivo) → DESCLASSIFICADO e
   * a vez passa ao próximo (art. 30 I).
   */
  async qualificar(licitacaoId: string, trabalhoId: string, dto: { qualificado?: any; motivo?: string }, ator: AtorTransicao) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirAtiva(lic);
    if (lic.fase !== FaseLicitacao.JULGAMENTO) throw new ConflictException('A qualificação é conferida depois da publicação do julgamento (fase de julgamento).');
    const qualificado = dto?.qualificado === true || dto?.qualificado === 'true';
    const motivo = String(dto?.motivo ?? '').trim();
    if (!qualificado && motivo.length < 10) throw new BadRequestException('Informe o motivo da não qualificação (mínimo 10 caracteres — art. 30, I).');
    await this.ds.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`concurso:${licitacaoId}`]);
      const t = await m.getRepository(ConcursoTrabalho).findOne({ where: { id: trabalhoId, licitacao_id: licitacaoId } });
      if (!t || t.status !== 'SUBMETIDO') throw new NotFoundException('Trabalho não encontrado');
      for (const u of await this.ranking.unidades(licitacaoId, m)) {
        if (!RankingService.unidadeComResultadoPossivel(u)) continue;
        const atual = atualDaUnidade(await this.ranking.ranking(u, m));
        if (!atual || atual.fornecedorId !== t.fornecedor_id) {
          throw new ConflictException('Confira a qualificação do trabalho NA VEZ (1º colocado ainda não excluído).');
        }
        if (atual.situacao === SituacaoLicitante.ACEITO) throw new ConflictException('Qualificação deste trabalho já conferida.');
        await this.ranking.definirSituacao(m, u, t.fornecedor_id, qualificado ? SituacaoLicitante.ACEITO : SituacaoLicitante.DESCLASSIFICADO, {
          motivo: qualificado ? 'Qualificação exigida conferida (art. 30, I) — trabalho vencedor declarado' : `Qualificação não atendida (art. 30, I): ${motivo}`,
          ator,
        });
      }
      await m.update(ConcursoTrabalho, t.id, { qualificacao: qualificado ? 'QUALIFICADO' : 'NAO_QUALIFICADO', qualificacao_motivo: qualificado ? null : motivo, qualificacao_em: new Date() });
      await this.evento(
        m,
        licitacaoId,
        qualificado
          ? `Trabalho ${t.codigo}: qualificação conferida — declarado vencedor do concurso.`
          : `Trabalho ${t.codigo}: qualificação não atendida (${motivo}). A vez passa ao próximo classificado.`,
        { trabalho_id: t.id },
        t.fornecedor_id,
      );
    });
    return this.painel(licitacaoId, { tipo: 'ORGAO' });
  }

  // ==========================================================================
  // RESULTADO (gancho) — prêmio, termo de premiação e cessão
  // ==========================================================================

  async planoAdjudicacao(licitacaoId: string, m: EntityManager): Promise<PlanoAdjudicacao> {
    const plano: PlanoAdjudicacao = { unidades: [], pendencias: [] };
    for (const u of await this.ranking.unidades(licitacaoId, m)) {
      if (!RankingService.unidadeComResultadoPossivel(u)) continue;
      const atual = atualDaUnidade(await this.ranking.ranking(u, m));
      if (!atual || ![SituacaoLicitante.ACEITO, SituacaoLicitante.VENCEDOR].includes(atual.situacao)) {
        plano.pendencias.push(`Item ${u.numero}: confira a qualificação do trabalho vencedor (art. 30, I).`);
        continue;
      }
      plano.unidades.push({
        tipo: u.tipo,
        unidadeId: u.id,
        numero: u.numero,
        fornecedorId: atual.fornecedorId,
        origemValor: 'prêmio/remuneração do edital',
        valores: u.itens.map((i) => ({
          itemId: i.id,
          numero: i.numero,
          quantidade: i.quantidade,
          valorTotal: Math.round(i.valorTotalEstimado * 100) / 100,
          valorUnitario: Math.round((i.valorTotalEstimado / (i.quantidade || 1)) * 10000) / 10000,
        })),
      });
    }
    return plano;
  }

  /** Homologado: premiação do vencedor + termo de premiação e de cessão de direitos (idempotente). */
  async gerarPremiacao(licitacaoId: string, ator: AtorTransicao = atorSistema('concurso')) {
    const lic = await this.licitacao(licitacaoId);
    if (lic.fase !== FaseLicitacao.HOMOLOGACAO) throw new ConflictException('A premiação é registrada depois da homologação.');
    const reg = await this.ds.getRepository(ConcursoRegulamento).findOne({ where: { licitacao_id: licitacaoId } });
    const [orgao] = await this.ds.query(`SELECT nome, cnpj FROM orgaos WHERE id = $1`, [lic.orgao_id]);
    const vencedores: any[] = await this.ds.query(
      `SELECT fornecedor_vencedor_id AS fid, SUM(valor_total_homologado) AS total FROM itens_licitacao
        WHERE licitacao_id = $1 AND status::text = 'HOMOLOGADO' AND fornecedor_vencedor_id IS NOT NULL GROUP BY fornecedor_vencedor_id`,
      [licitacaoId],
    );
    const nomes = await this.nomes(vencedores.map((v) => String(v.fid)));
    for (const v of vencedores) {
      const fid = String(v.fid);
      const repo = this.ds.getRepository(ConcursoPremiacao);
      let p = await repo.findOne({ where: { licitacao_id: licitacaoId, fornecedor_id: fid } });
      const t = await this.ds.getRepository(ConcursoTrabalho).findOne({ where: { licitacao_id: licitacaoId, fornecedor_id: fid } });
      if (!t) continue;
      if (!p) {
        p = await repo.save(
          repo.create({
            licitacao_id: licitacaoId,
            fornecedor_id: fid,
            trabalho_id: t.id,
            valor: Number(v.total),
            exige_cessao: !!reg?.exige_cessao_direitos,
            status: reg?.exige_cessao_direitos ? 'AGUARDANDO_CESSAO' : 'CESSAO_ACEITA',
          }),
        );
      }
      if (p.termo_caminho) continue;
      const autor = nomes.get(fid);
      const paragrafos = [
        `Objeto: ${lic.objeto}.`,
        `Natureza do trabalho: ${reg?.natureza_trabalho === 'ARTISTICO' ? 'artístico' : reg?.natureza_trabalho === 'CIENTIFICO' ? 'científico' : 'técnico'} (Lei 14.133/2021, art. 6º, XXXIX).`,
        `Certifica-se que ${autor?.nome ?? fid} (CPF/CNPJ ${fmtDocumento(autor?.doc)}), autor do trabalho "${t.titulo}" (inscrito sob o código ${t.codigo}), ` +
          `foi declarado vencedor do concurso, fazendo jus ao ${reg?.tipo_retribuicao === 'REMUNERACAO' ? 'à remuneração' : 'prêmio'} de ${fmtMoeda(p.valor)}` +
          `${reg?.descricao_premio ? ` (${reg.descricao_premio})` : ''}, conforme o regulamento (art. 30, III), homologado em ${fmtDataHoraBrasilia(lic.data_homologacao)} ` +
          `por ${lic.homologacao_autoridade_nome ?? 'autoridade competente'}.`,
      ];
      if (p.exige_cessao) {
        paragrafos.push(
          'CESSÃO DE DIREITOS: o vencedor cede à Administração Pública todos os direitos patrimoniais relativos ao trabalho premiado' +
            (reg?.elaboracao_projeto ? ' e autoriza a sua execução conforme juízo de conveniência e oportunidade das autoridades competentes' : '') +
            ', incluídos os documentos e elementos de informação pertinentes (Lei 14.133/2021, art. 30, parágrafo único, e art. 93). ' +
            'A cessão produz efeitos com o aceite eletrônico do vencedor registrado no sistema, condição para o pagamento.',
        );
      }
      const pdf = gerarTermoSimplesPdf({
        orgao: { nome: orgao?.nome ?? 'Órgão', cnpj: orgao?.cnpj },
        titulo: p.exige_cessao ? 'TERMO DE PREMIAÇÃO E DE CESSÃO DE DIREITOS' : 'TERMO DE PREMIAÇÃO',
        subtitulo: `Concurso — processo ${lic.numero_processo}${lic.numero_edital ? ` · edital ${lic.numero_edital}` : ''}`,
        paragrafos,
        assinaturas: [
          { nome: lic.homologacao_autoridade_nome ?? 'Autoridade competente', papel: lic.homologacao_autoridade_cargo ?? 'Autoridade competente' },
          { nome: autor?.nome ?? 'Vencedor', papel: 'Vencedor do concurso' },
        ],
      });
      const dir = path.join(diretorioDeGravacao(PASTA_TERMOS), licitacaoId);
      fs.mkdirSync(dir, { recursive: true });
      const nome = `termo-premiacao-${p.id}.pdf`;
      fs.writeFileSync(path.join(dir, nome), pdf);
      await repo.update(p.id, { termo_caminho: `${PASTA_TERMOS}/${licitacaoId}/${nome}`, termo_gerado_em: new Date() });
    }
    this.logger.log(`[${lic.numero_processo}] premiação registrada (${vencedores.length}) — ${ator.tipo}`);
    return this.listarPremiacoes(licitacaoId);
  }

  async listarPremiacoes(licitacaoId: string) {
    const ps = await this.ds.getRepository(ConcursoPremiacao).find({ where: { licitacao_id: licitacaoId } });
    const nomes = await this.nomes(ps.map((p) => p.fornecedor_id));
    return ps.map((p) => ({
      id: p.id,
      tipo: 'TERMO_PREMIACAO',
      titulo: p.exige_cessao ? 'Termo de premiação e de cessão de direitos' : 'Termo de premiação',
      fornecedor_id: p.fornecedor_id,
      fornecedor_razao_social: nomes.get(p.fornecedor_id)?.nome ?? null,
      valor: Number(p.valor),
      status: p.status,
      gerado_em: p.termo_gerado_em,
    }));
  }

  /** O vencedor (token) aceita a cessão dos direitos patrimoniais (art. 30 parágrafo único; art. 93). */
  async aceitarCessao(licitacaoId: string, fornecedorId: string, ip: string | null) {
    await this.licitacao(licitacaoId);
    const repo = this.ds.getRepository(ConcursoPremiacao);
    const p = await repo.findOne({ where: { licitacao_id: licitacaoId, fornecedor_id: fornecedorId } });
    if (!p) throw new NotFoundException('Premiação não encontrada');
    if (!p.exige_cessao) throw new ConflictException('Este concurso não exige cessão de direitos.');
    if (p.status !== 'AGUARDANDO_CESSAO') throw new ConflictException('Cessão já aceita.');
    await repo.update(p.id, { status: 'CESSAO_ACEITA', cessao_aceita_em: new Date(), cessao_aceita_ip: ip ? String(ip).slice(0, 60) : null });
    await this.evento(this.ds.manager, licitacaoId, 'Vencedor aceitou a cessão dos direitos patrimoniais do trabalho premiado (art. 30, parágrafo único; art. 93).', {}, fornecedorId);
    return this.painel(licitacaoId, { tipo: 'FORNECEDOR', fornecedorId });
  }

  /** Órgão registra o pagamento do prêmio (depois da cessão, quando exigida). */
  async registrarPagamento(licitacaoId: string, premiacaoId: string, observacao: string | null, ator: AtorTransicao) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirAtiva(lic);
    const repo = this.ds.getRepository(ConcursoPremiacao);
    const p = await repo.findOne({ where: { id: premiacaoId, licitacao_id: licitacaoId } });
    if (!p) throw new NotFoundException('Premiação não encontrada');
    if (p.status === 'AGUARDANDO_CESSAO') throw new ConflictException('O pagamento do prêmio depende do aceite da cessão dos direitos pelo vencedor.');
    if (p.status === 'PAGO') throw new ConflictException('Pagamento já registrado.');
    await repo.update(p.id, { status: 'PAGO', pagamento_registrado_em: new Date(), pagamento_registrado_por: `${ator.tipo}:${ator.id ?? ''}`, pagamento_observacao: observacao?.slice(0, 2000) ?? null });
    return this.painel(licitacaoId, { tipo: 'ORGAO' });
  }

  async arquivoTermo(licitacaoId: string, premiacaoId: string, visao: VisaoConcurso) {
    const p = await this.ds.getRepository(ConcursoPremiacao).findOne({ where: { id: premiacaoId, licitacao_id: licitacaoId } });
    if (!p?.termo_caminho) throw new NotFoundException('Termo não encontrado');
    if (visao.tipo === 'PUBLICO' || (visao.tipo === 'FORNECEDOR' && visao.fornecedorId !== p.fornecedor_id)) throw new NotFoundException('Termo não encontrado');
    const [, ...resto] = p.termo_caminho.split('/');
    const caminho = path.join(diretorioDeGravacao(PASTA_TERMOS), ...resto);
    if (!fs.existsSync(caminho)) throw new NotFoundException('Arquivo do termo não encontrado');
    return { caminho, nome: path.basename(caminho) };
  }
}
