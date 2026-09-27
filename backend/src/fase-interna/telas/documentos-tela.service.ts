import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ehUuid } from '../../auth/acesso/acesso-licitacao.service';
import { ehFaseInterna } from '../../licitacoes/transicoes/fases';
import { fundamentoEfetivo, textoDoFundamento } from '../../licitacoes/fundamento-legal';
import { IaService } from '../../ia/ia.service';
import {
  DocumentoFaseInterna,
  OrigemDocumento,
  StatusDocumento,
  TipoDocumentoFaseInterna,
} from '../entities/documento-fase-interna.entity';
import { AcaoLogFaseInterna } from '../entities/log-fase-interna.entity';
import { AuditLogService } from '../audit-log.service';
import { DerivacaoService } from '../derivacao.service';
import { FaseInternaService } from '../fase-interna.service';
import { GeradorDocumentoService } from '../gerador-documento.service';
import { MODELOS_PADRAO } from '../modelos-padrao';
import { TITULO_DOCUMENTO } from '../documentos-obrigatorios';
import { OrcamentoService } from '../orcamento/orcamento.service';
import { resumoIaDaPeca } from '../ia-rascunho/rascunho-ia-regras';
import { RevisaoIaService } from '../ia-rascunho/revisao-ia.service';
import { coerenciaEntreSecoes, detectarIndicacaoMarca, incisosObrigatoriosVazios, situacaoDosIncisos, textoPuro } from './etp-analise';

type Autor = { id: string | null; nome: string | null };

const BRL = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s: unknown) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
const PRIORIDADES = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'];

/** Tipos com tela de etapa + editor de seções nesta entrega. */
const TIPOS_GERAVEIS = new Set<string>(['DFD', 'ETP', 'TR']);

/** Campos estruturados do DFD (em `dados_estruturados._dfd` da peça). */
export interface CamposDfd {
  unidade_requisitante_id: string | null;
  unidade_requisitante_nome: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  fiscal_sugerido_id: string | null;
  fiscal_sugerido_nome: string | null;
  data_pretendida: string | null;
  prioridade: string | null;
}

/**
 * TELAS DAS ETAPAS DFD, ETP e TR (Entrega 3A). Reaproveita o editor por
 * seções (`documentos_fase_interna.dados_estruturados`), a derivação entre
 * peças (DerivacaoService), o gerador de PDF e a IA existente (IaService).
 * Nada de entidade nova: os campos estruturados do DFD ficam na própria peça
 * (`_dfd`) e o vínculo ao PCA na licitação (`item_pca_id`/`sem_pca`).
 */
@Injectable()
export class DocumentosTelaService {
  private readonly logger = new Logger(DocumentosTelaService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(DocumentoFaseInterna) private readonly docRepo: Repository<DocumentoFaseInterna>,
    private readonly faseInterna: FaseInternaService,
    private readonly derivacao: DerivacaoService,
    private readonly gerador: GeradorDocumentoService,
    private readonly orcamento: OrcamentoService,
    private readonly auditLog: AuditLogService,
    private readonly ia: IaService,
    private readonly revisaoIa: RevisaoIaService,
  ) {}

  private async licitacao(licitacaoId: string) {
    const [lic] = await this.ds.query(
      `SELECT id::text AS id, orgao_id::text AS orgao_id, numero_processo, objeto, modalidade::text AS modalidade,
              tipo_contratacao::text AS tipo_contratacao, fase::text AS fase, situacao::text AS situacao, fundamento_legal,
              item_pca_id::text AS item_pca_id, sem_pca, justificativa_sem_pca, demanda_id::text AS demanda_id,
              valor_total_estimado, sigilo_orcamento, justificativa_sigilo, COALESCE(ano, EXTRACT(YEAR FROM created_at))::int AS exercicio
         FROM licitacoes WHERE id::text = $1`,
      [licitacaoId],
    );
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    return lic;
  }

  private async docAtual(licitacaoId: string, tipo: TipoDocumentoFaseInterna): Promise<DocumentoFaseInterna | null> {
    return this.docRepo.findOne({ where: { licitacao_id: licitacaoId, tipo, versao_atual: true } });
  }

  /** Seções (id, título, orientação, obrigatória) do modelo padrão do tipo. */
  private secoesDoModelo(tipo: string) {
    return MODELOS_PADRAO.find((m) => m.tipo === tipo)?.secoes ?? [];
  }

  private resumoPeca(doc: DocumentoFaseInterna | null) {
    if (!doc) return null;
    return {
      documento_id: doc.id,
      versao: doc.versao,
      status: doc.status,
      origem: doc.origem,
      anexada: doc.origem !== OrigemDocumento.INTERNO,
      numero_peca: doc.numero_peca ?? null,
      data_documento: doc.data_documento ?? null,
      folha_inicial: doc.folha_inicial ?? null,
      folha_final: doc.folha_final ?? null,
      tem_arquivo: !!(doc.caminho_arquivo || doc.arquivo_pdf_path),
      pdf_gerado_em: doc.data_geracao_arquivo ?? null,
      nao_se_aplica: !!doc.dados_estruturados?.nao_se_aplica,
      justificativa_nao_se_aplica: doc.dados_estruturados?.justificativa_nao_se_aplica ?? null,
      ia_rascunho: resumoIaDaPeca(doc.dados_estruturados),
    };
  }

  private secoesDe(doc: DocumentoFaseInterna | null): Record<string, string> {
    const d = doc?.dados_estruturados;
    if (!d || typeof d !== 'object') return {};
    const r: Record<string, string> = {};
    for (const [k, v] of Object.entries(d)) if (!k.startsWith('_') && typeof v === 'string') r[k] = v;
    return r;
  }

  private async itensDoProcesso(licitacaoId: string) {
    const itens = await this.ds.query(
      `SELECT id::text AS id, numero_item, descricao_resumida, unidade_medida::text AS unidade_medida, quantidade, valor_unitario_estimado,
              valor_total_estimado, codigo_catalogo, codigo_catmat, codigo_catser, tipo_item, status::text AS status
         FROM itens_licitacao WHERE licitacao_id::text = $1 AND status::text <> 'CANCELADO' ORDER BY numero_item`,
      [licitacaoId],
    );
    return itens.map((i: any) => {
      const codigo = i.codigo_catmat || i.codigo_catser || i.codigo_catalogo || null;
      return {
        id: i.id,
        numero_item: Number(i.numero_item),
        descricao: i.descricao_resumida,
        unidade: i.unidade_medida,
        quantidade: Number(i.quantidade),
        valor_unitario: i.valor_unitario_estimado === null ? null : Number(i.valor_unitario_estimado),
        valor_total: i.valor_total_estimado === null ? null : Number(i.valor_total_estimado),
        codigo,
        catalogo: i.codigo_catser ? 'CATSER' : i.codigo_catmat ? 'CATMAT' : codigo ? (i.tipo_item === 'SERVICO' ? 'CATSER' : 'CATMAT') : null,
        tipo_item: i.tipo_item,
      };
    });
  }

  // ==========================================================================
  // DFD
  // ==========================================================================

  private camposDfd(doc: DocumentoFaseInterna | null): CamposDfd {
    const c = doc?.dados_estruturados?._dfd || {};
    return {
      unidade_requisitante_id: c.unidade_requisitante_id ?? null,
      unidade_requisitante_nome: c.unidade_requisitante_nome ?? null,
      responsavel_id: c.responsavel_id ?? null,
      responsavel_nome: c.responsavel_nome ?? null,
      fiscal_sugerido_id: c.fiscal_sugerido_id ?? null,
      fiscal_sugerido_nome: c.fiscal_sugerido_nome ?? null,
      data_pretendida: c.data_pretendida ?? null,
      prioridade: c.prioridade ?? null,
    };
  }

  async obterDfd(licitacaoId: string) {
    const lic = await this.licitacao(licitacaoId);
    const doc = await this.docAtual(licitacaoId, TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA);
    const secoes = this.secoesDe(doc);
    const campos = this.camposDfd(doc);
    const itens = await this.itensDoProcesso(licitacaoId);
    const [setores, usuarios, itensPca, demanda] = await Promise.all([
      this.ds.query(`SELECT id::text AS id, nome, codigo FROM setores WHERE orgao_id::text = $1 ORDER BY nome`, [lic.orgao_id]),
      this.ds.query(`SELECT id::text AS id, nome, cargo FROM usuarios WHERE orgao_id::text = $1 AND ativo = true ORDER BY nome`, [lic.orgao_id]),
      this.ds.query(
        `SELECT i.id::text AS id, i.numero_item, i.descricao_objeto, i.categoria::text AS categoria, p.ano_exercicio AS ano
           FROM itens_pca i JOIN planos_contratacao_anual p ON p.id = i.pca_id
          WHERE p.orgao_id::text = $1 AND p.ano_exercicio >= $2
          ORDER BY p.ano_exercicio DESC, i.numero_item LIMIT 500`,
        [lic.orgao_id, Number(lic.exercicio) - 1],
      ),
      lic.demanda_id
        ? this.ds.query(`SELECT id::text AS id, unidade_requisitante, responsavel_nome, data_desejada_contratacao FROM demandas WHERE id::text = $1`, [lic.demanda_id]).then((r: any[]) => r[0] ?? null)
        : Promise.resolve(null),
    ]);
    const itemPca = lic.item_pca_id ? itensPca.find((i: any) => i.id === lic.item_pca_id) ?? null : null;
    const semCodigo = itens.filter((i: any) => !i.codigo).length;
    const marca = detectarIndicacaoMarca({ objeto: esc(lic.objeto), demanda: secoes.demanda ?? '' });
    const checklist = [
      {
        chave: 'pca',
        ok: !!lic.item_pca_id || (!!lic.sem_pca && String(lic.justificativa_sem_pca ?? '').trim().length >= 10),
        texto: lic.item_pca_id ? 'Vinculado ao PCA' : lic.sem_pca ? 'Sem PCA, com justificativa (art. 12, §1º)' : 'Vincule ao item do PCA ou justifique a ausência (art. 12, §1º)',
      },
      { chave: 'necessidade', ok: textoPuro(secoes.demanda).length > 10, texto: 'Necessidade descrita' },
      {
        chave: 'itens',
        ok: itens.length > 0 && semCodigo === 0,
        texto: !itens.length
          ? 'Cadastre os itens e as quantidades'
          : semCodigo
            ? `${semCodigo} ${semCodigo === 1 ? 'item sem' : 'itens sem'} código CATMAT/CATSER — necessário para somar o limite de dispensa`
            : 'Todos os itens com código CATMAT/CATSER',
      },
      { chave: 'unidade', ok: !!campos.unidade_requisitante_id && !!campos.responsavel_id, texto: 'Unidade requisitante e responsável' },
      { chave: 'prazo', ok: !!campos.data_pretendida, texto: 'Data pretendida' },
      {
        chave: 'marca',
        ok: marca.length === 0,
        texto: marca.length ? `Evite nomes de produto no objeto: descreva a função (${marca.map((m) => m.marca).join(', ')})` : 'Sem indicação de marca no objeto',
        atencao: true,
      },
    ];
    return {
      licitacao: {
        id: lic.id,
        numero_processo: lic.numero_processo,
        objeto: lic.objeto,
        modalidade: lic.modalidade,
        fase: lic.fase,
        fase_interna: ehFaseInterna(lic.fase),
        item_pca_id: lic.item_pca_id,
        sem_pca: !!lic.sem_pca,
        justificativa_sem_pca: lic.justificativa_sem_pca,
      },
      peca: this.resumoPeca(doc),
      secoes,
      campos,
      item_pca: itemPca,
      itens,
      demanda,
      checklist,
      marca,
      opcoes: { setores, usuarios, itens_pca: itensPca, prioridades: PRIORIDADES },
      modelo: this.secoesDoModelo('DFD'),
    };
  }

  /**
   * AUTOSAVE do DFD: objeto, necessidade, unidade requisitante (setor do
   * órgão), responsável e fiscal sugerido (usuários do órgão), data
   * pretendida, prioridade e vínculo ao PCA (item do PCA do órgão ou
   * justificativa de ausência — art. 12, §1º). Listas vêm das tabelas; ids de
   * outro órgão são recusados (400).
   */
  async salvarDfd(licitacaoId: string, body: any, autor: Autor) {
    const lic = await this.licitacao(licitacaoId);
    const interna = ehFaseInterna(lic.fase);
    const updLic: Record<string, any> = {};
    if (body?.objeto !== undefined) {
      const obj = String(body.objeto ?? '').trim();
      if (!obj) throw new BadRequestException('O objeto não pode ficar vazio.');
      if (!interna) throw new ConflictException('O objeto só muda na fase interna (depois, pela retificação).');
      updLic.objeto = obj.slice(0, 4000);
    }
    if (body?.item_pca_id !== undefined || body?.sem_pca !== undefined) {
      if (body?.item_pca_id) {
        const id = String(body.item_pca_id);
        const [ok] = ehUuid(id)
          ? await this.ds.query(
              `SELECT 1 FROM itens_pca i JOIN planos_contratacao_anual p ON p.id = i.pca_id WHERE i.id::text = $1 AND p.orgao_id::text = $2`,
              [id, lic.orgao_id],
            )
          : [];
        if (!ok) throw new BadRequestException('Item do PCA não encontrado no plano do órgão.');
        Object.assign(updLic, { item_pca_id: id, sem_pca: false, justificativa_sem_pca: null });
      } else if (body?.sem_pca) {
        const j = String(body.justificativa_sem_pca ?? '').trim();
        if (j.length < 10) throw new BadRequestException('Justifique a contratação fora do PCA (art. 12, §1º).');
        Object.assign(updLic, { item_pca_id: null, sem_pca: true, justificativa_sem_pca: j.slice(0, 4000) });
      } else {
        Object.assign(updLic, { item_pca_id: null, sem_pca: false });
      }
    }
    if (Object.keys(updLic).length) {
      const sets = Object.keys(updLic).map((k, i) => `${k} = $${i + 2}`);
      await this.ds.query(`UPDATE licitacoes SET ${sets.join(', ')}, updated_at = now() WHERE id::text = $1`, [licitacaoId, ...Object.values(updLic)]);
    }

    // Campos estruturados (listas das tabelas do órgão)
    const doc0 = await this.docAtual(licitacaoId, TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA);
    const campos = this.camposDfd(doc0);
    const usuarioDoOrgao = async (id: string, rotulo: string) => {
      const [u] = ehUuid(id) ? await this.ds.query(`SELECT id::text AS id, nome FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2`, [id, lic.orgao_id]) : [];
      if (!u) throw new BadRequestException(`${rotulo}: usuário não encontrado no órgão.`);
      return u as { id: string; nome: string };
    };
    let mudouCampos = false;
    if (body?.unidade_requisitante_id !== undefined) {
      mudouCampos = true;
      if (body.unidade_requisitante_id) {
        const id = String(body.unidade_requisitante_id);
        const [s] = ehUuid(id) ? await this.ds.query(`SELECT id::text AS id, nome FROM setores WHERE id::text = $1 AND orgao_id::text = $2`, [id, lic.orgao_id]) : [];
        if (!s) throw new BadRequestException('Unidade requisitante não encontrada nos setores do órgão.');
        campos.unidade_requisitante_id = s.id;
        campos.unidade_requisitante_nome = s.nome;
      } else {
        campos.unidade_requisitante_id = null;
        campos.unidade_requisitante_nome = null;
      }
    }
    for (const [campo, nome, rotulo] of [
      ['responsavel_id', 'responsavel_nome', 'Responsável'],
      ['fiscal_sugerido_id', 'fiscal_sugerido_nome', 'Fiscal sugerido'],
    ] as const) {
      if (body?.[campo] === undefined) continue;
      mudouCampos = true;
      if (body[campo]) {
        const u = await usuarioDoOrgao(String(body[campo]), rotulo);
        campos[campo] = u.id;
        campos[nome] = u.nome;
      } else {
        campos[campo] = null;
        campos[nome] = null;
      }
    }
    if (body?.data_pretendida !== undefined) {
      mudouCampos = true;
      const d = String(body.data_pretendida ?? '').slice(0, 10);
      if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new BadRequestException('Data pretendida inválida (AAAA-MM-DD).');
      campos.data_pretendida = d || null;
    }
    if (body?.prioridade !== undefined) {
      mudouCampos = true;
      const p = String(body.prioridade ?? '').toUpperCase();
      if (p && !PRIORIDADES.includes(p)) throw new BadRequestException('Prioridade inválida.');
      campos.prioridade = p || null;
    }

    const mudouNecessidade = body?.necessidade_html !== undefined;
    if (mudouNecessidade) {
      await this.faseInterna.atualizarSecao(licitacaoId, TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA, 'demanda', String(body.necessidade_html ?? ''), {
        autor,
        origem: 'USUARIO',
      });
    }
    if (mudouCampos || updLic.item_pca_id !== undefined || updLic.sem_pca !== undefined || mudouNecessidade) {
      // Garante a peça (versão em elaboração) e grava os campos + seções derivadas
      if (!mudouNecessidade) {
        const atual = await this.docAtual(licitacaoId, TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA);
        const alvo = await this.faseInterna.novaVersaoSeFinalizada(atual);
        if (!alvo) {
          await this.faseInterna.atualizarSecao(licitacaoId, TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA, 'demanda', '', { autor, origem: 'USUARIO' });
        } else if (alvo !== atual) {
          await this.docRepo.save(alvo);
        }
      }
      const doc = await this.docAtual(licitacaoId, TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA);
      if (doc) {
        const dados = { ...(doc.dados_estruturados || {}) };
        dados._dfd = { ...campos, atualizado_por: autor.nome, atualizado_em: new Date().toISOString() };
        const licAtual = await this.licitacao(licitacaoId);
        dados.previsao = await this.textoPrevisaoPca(licAtual);
        if (campos.data_pretendida) {
          const [a, m, d] = campos.data_pretendida.split('-');
          dados.data = `<p>Data pretendida para a contratação: ${d}/${m}/${a}${campos.prioridade ? ` (prioridade ${campos.prioridade.toLowerCase()})` : ''}.</p>`;
        }
        doc.dados_estruturados = dados;
        doc.descricao = Object.entries(dados)
          .filter(([k, v]) => !k.startsWith('_') && typeof v === 'string' && v.trim())
          .map(([, v]) => v)
          .join('\n');
        if (!doc.titulo || doc.titulo === 'DFD') doc.titulo = TITULO_DOCUMENTO[doc.tipo] ?? doc.titulo;
        await this.docRepo.save(doc);
      }
    }
    return this.obterDfd(licitacaoId);
  }

  private async textoPrevisaoPca(lic: any): Promise<string> {
    if (lic.item_pca_id) {
      const [i] = await this.ds.query(
        `SELECT i.numero_item, i.descricao_objeto, p.ano_exercicio FROM itens_pca i JOIN planos_contratacao_anual p ON p.id = i.pca_id WHERE i.id::text = $1`,
        [lic.item_pca_id],
      );
      if (i) return `<p>A contratação está prevista no Plano de Contratações Anual ${i.ano_exercicio}, item ${i.numero_item} — ${esc(i.descricao_objeto)} (art. 12, VII).</p>`;
    }
    if (lic.sem_pca) return `<p>A contratação não consta do Plano de Contratações Anual. Justificativa (art. 12, §1º): ${esc(lic.justificativa_sem_pca)}</p>`;
    return '';
  }

  // ==========================================================================
  // GERAR A PEÇA PELO MODELO (DFD, ETP, TR)
  // ==========================================================================

  /**
   * "Gerar documento": completa as seções VAZIAS pela derivação (DFD ← demanda
   * e itens; ETP ← DFD; TR ← ETP, fundamento legal, reserva) — nunca apaga o
   * que o usuário escreveu — e gera o PDF da peça pelo modelo. A peça gerada
   * conta como pronta (a tarefa da etapa conclui sozinha).
   */
  async gerar(licitacaoId: string, tipoParam: string, autor: Autor) {
    const tipo = String(tipoParam || '').toUpperCase();
    if (!TIPOS_GERAVEIS.has(tipo)) throw new BadRequestException('Geração pela tela disponível para DFD, ETP e TR.');
    const t = tipo as TipoDocumentoFaseInterna;
    const atual = await this.docAtual(licitacaoId, t);
    if (atual && (atual.origem !== OrigemDocumento.INTERNO || atual.status === StatusDocumento.ASSINADO || atual.status === StatusDocumento.AGUARDANDO_ASSINATURA)) {
      throw new ConflictException('A versão atual foi anexada ou está em assinatura. Para refazer aqui, edite uma seção (abre uma versão nova).');
    }
    if (atual?.dados_estruturados?.nao_se_aplica) throw new ConflictException('A peça está marcada como "não se aplica" — desfaça antes de gerar.');
    // GERAR DE NOVO = VERSÃO NOVA (homologação E3): a versão já gerada (com PDF)
    // fica no histórico como SUBSTITUIDO e a nova herda o texto — é o que a
    // diligência do parecer exige ("corrija a peça: nova versão") e o que os
    // autos citam ("substitui a versão N"). Só a versão atual entra nos autos.
    if (atual && atual.data_geracao_arquivo) await this.novaVersaoCopiando(atual, autor);
    const seed = await this.derivacao.montarSeed(licitacaoId, t);
    const ids = Object.keys(seed.secoes);
    // Seções derivadas e não editadas acompanham o processo (valor da pesquisa, reserva, fundamento)
    if (ids.length) await this.derivacao.aplicarSeed(licitacaoId, t, ids, false, { atualizarDerivadas: true });
    let doc = await this.docAtual(licitacaoId, t);
    if (!doc) throw new BadRequestException('Preencha ao menos uma seção antes de gerar.');
    if (!doc.titulo || doc.titulo === tipo) {
      doc.titulo = TITULO_DOCUMENTO[t] ?? doc.titulo;
      doc = await this.docRepo.save(doc);
    }
    if (!doc.criado_por_id && autor.id) {
      await this.docRepo.update(doc.id, { criado_por_id: autor.id, criado_por_nome: autor.nome ?? undefined } as any);
    }
    await this.gerador.gerarPdf(doc.id, { usuario_id: autor.id ?? undefined, usuario_nome: autor.nome ?? undefined });
    // F4a: peça gerada a partir do rascunho da IA → registra quem revisou (usuário do JWT)
    await this.revisaoIa.registrarNaEmissao(licitacaoId, t as 'DFD' | 'ETP' | 'TR', { documentoId: doc.id, autor, ato: 'gerado' });
    const final = await this.docAtual(licitacaoId, t);
    return { peca: this.resumoPeca(final), secoes: this.secoesDe(final), secoes_derivadas: ids };
  }

  /**
   * Versão nova da peça feita aqui, copiando o texto da atual (a anterior vira
   * SUBSTITUIDO, com o PDF que foi gerado para ela). Transação com trava no
   * processo: dois cliques não criam duas versões com o mesmo número.
   */
  private async novaVersaoCopiando(atual: DocumentoFaseInterna, autor: Autor): Promise<DocumentoFaseInterna> {
    const nova = await this.ds.transaction(async (m) => {
      await m.query(`SELECT id FROM licitacoes WHERE id::text = $1 FOR UPDATE`, [atual.licitacao_id]);
      const repo = m.getRepository(DocumentoFaseInterna);
      const vigente = await repo.findOne({ where: { id: atual.id } });
      if (!vigente?.versao_atual) return repo.findOneOrFail({ where: { licitacao_id: atual.licitacao_id, tipo: atual.tipo, versao_atual: true } });
      await repo.update(vigente.id, { versao_atual: false, status: StatusDocumento.SUBSTITUIDO });
      const dados = { ...(vigente.dados_estruturados || {}) };
      delete dados._desatualizada;
      return repo.save(
        repo.create({
          licitacao_id: vigente.licitacao_id,
          tipo: vigente.tipo,
          titulo: vigente.titulo,
          descricao: vigente.descricao,
          dados_estruturados: dados,
          status: StatusDocumento.EM_ELABORACAO,
          origem: OrigemDocumento.INTERNO,
          versao: (vigente.versao || 1) + 1,
          versao_atual: true,
          versao_anterior_id: vigente.id,
          obrigatorio: vigente.obrigatorio,
          criado_por_id: (autor.id ?? vigente.criado_por_id ?? undefined) as any,
          criado_por_nome: (autor.nome ?? vigente.criado_por_nome ?? undefined) as any,
        }),
      );
    });
    await this.auditLog
      .log({
        licitacao_id: atual.licitacao_id,
        documento_id: nova.id,
        acao: AcaoLogFaseInterna.DOCUMENTO_VERSIONADO,
        descricao: `${TITULO_DOCUMENTO[atual.tipo] ?? atual.tipo} gerado de novo — versão ${nova.versao} (substitui a versão ${atual.versao}), por ${autor.nome ?? 'usuário'}`,
        dados_depois: { versao: nova.versao, versao_anterior_id: atual.id },
        contexto: { usuario_id: autor.id ?? undefined, usuario_nome: autor.nome ?? undefined },
      })
      .catch(() => undefined);
    return nova;
  }

  // ==========================================================================
  // ETP
  // ==========================================================================

  async obterEtp(licitacaoId: string) {
    const lic = await this.licitacao(licitacaoId);
    const [etp, ar, dfd, tr] = await Promise.all([
      this.docAtual(licitacaoId, TipoDocumentoFaseInterna.ESTUDO_TECNICO_PRELIMINAR),
      this.docAtual(licitacaoId, TipoDocumentoFaseInterna.ANALISE_RISCOS),
      this.docAtual(licitacaoId, TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA),
      this.docAtual(licitacaoId, TipoDocumentoFaseInterna.TERMO_REFERENCIA),
    ]);
    const secoes = this.secoesDe(etp);
    const justificativaMarca = etp?.dados_estruturados?._marca?.justificativa ?? null;
    const instrucao = await this.faseInterna.getInstrucao(licitacaoId);
    const linha = (tipo: string) => instrucao.itens.find((i) => i.tipo === tipo);
    const riscos = (ar?.dados_estruturados?.riscos || []) as any[];
    return {
      licitacao: { id: lic.id, numero_processo: lic.numero_processo, objeto: lic.objeto, modalidade: lic.modalidade, fase: lic.fase, fase_interna: ehFaseInterna(lic.fase) },
      contratacao_direta: instrucao.contratacao_direta,
      etp: { peca: this.resumoPeca(etp), secoes, edicoes: etp?.dados_estruturados?._edicoes ?? {}, justificativa_marca: justificativaMarca },
      instrucao: { etp: linha('ETP') ?? null, riscos: linha('AR') ?? null },
      incisos: situacaoDosIncisos(secoes),
      obrigatorios_vazios: incisosObrigatoriosVazios(secoes),
      marca: detectarIndicacaoMarca(secoes, { justificativa: justificativaMarca }),
      coerencia: coerenciaEntreSecoes({ necessidade: secoes.necessidade || this.secoesDe(dfd).demanda || '', solucao: secoes.solucao || '', tr: tr ? tr.descricao || '' : null }),
      riscos: {
        peca: this.resumoPeca(ar),
        total: riscos.length,
        altos: riscos.filter((r) => ['ALTO', 'CRITICO', 'EXTREMO'].includes(String(r?.nivel || r?.grau || '').toUpperCase())).length,
      },
      dfd: { peca: this.resumoPeca(dfd), necessidade: this.secoesDe(dfd).demanda ?? null },
      modelo: this.secoesDoModelo('ETP'),
    };
  }

  /** Justificativa formal da indicação de marca (art. 41, I) — fica no ETP. */
  async salvarJustificativaMarca(licitacaoId: string, body: any, autor: Autor) {
    const j = String(body?.justificativa ?? '').trim().slice(0, 4000);
    if (j && j.length < 20) throw new BadRequestException('A justificativa do art. 41, I precisa explicar o motivo (padronização, compatibilidade, única que atende ou referência).');
    let doc = await this.docAtual(licitacaoId, TipoDocumentoFaseInterna.ESTUDO_TECNICO_PRELIMINAR);
    doc = await this.faseInterna.novaVersaoSeFinalizada(doc);
    if (!doc) {
      await this.faseInterna.atualizarSecao(licitacaoId, TipoDocumentoFaseInterna.ESTUDO_TECNICO_PRELIMINAR, 'necessidade', '', { autor });
      doc = await this.docAtual(licitacaoId, TipoDocumentoFaseInterna.ESTUDO_TECNICO_PRELIMINAR);
    }
    if (!doc) throw new NotFoundException('ETP não encontrado');
    doc.dados_estruturados = { ...(doc.dados_estruturados || {}), _marca: { justificativa: j || null, por_id: autor.id, por_nome: autor.nome, em: new Date().toISOString() } };
    await this.docRepo.save(doc);
    return this.obterEtp(licitacaoId);
  }

  /**
   * ASSISTENTE DO ETP (IA existente — IaService). Só SUGERE: nada é gravado
   * aqui; o usuário aceita com um clique (PATCH da seção com origem IA_ACEITA).
   *  - RASCUNHO: rascunho da seção a partir do DFD, dos itens e do que já há no ETP;
   *  - REESCREVER_MARCA: reescreve o trecho pela função, sem a marca;
   *  - ANALISAR: incisos obrigatórios vazios, marca e coerência (sem IA).
   */
  async assistente(licitacaoId: string, body: any, autor: Autor) {
    const acao = String(body?.acao ?? 'ANALISAR').toUpperCase();
    const base = await this.obterEtp(licitacaoId);
    const analise = { obrigatorios_vazios: base.obrigatorios_vazios, marca: base.marca, coerencia: base.coerencia };
    if (acao === 'ANALISAR') return { acao, analise };

    const secaoId = String(body?.secao_id ?? '');
    const secao = base.modelo.find((s) => s.id === secaoId);
    if (acao === 'RASCUNHO' && !secao) throw new BadRequestException('Seção do ETP inválida.');
    if (acao !== 'RASCUNHO' && acao !== 'REESCREVER_MARCA') throw new BadRequestException('Ação do assistente inválida.');

    const itens = await this.itensDoProcesso(licitacaoId);
    const contexto =
      `Processo: ${base.licitacao.numero_processo}\nObjeto: ${base.licitacao.objeto}\nModalidade: ${base.licitacao.modalidade}\n` +
      (itens.length ? `Itens: ${itens.map((i: any) => `${i.numero_item}) ${i.descricao} — ${i.quantidade} ${i.unidade}`).join('; ')}\n` : '') +
      (base.dfd.necessidade ? `Necessidade (DFD): ${textoPuro(base.dfd.necessidade).slice(0, 3000)}\n` : '');
    let prompt: string;
    if (acao === 'RASCUNHO') {
      const atual = textoPuro(base.etp.secoes[secaoId] ?? '');
      prompt =
        `Você é o assistente do ETP (Lei nº 14.133/2021, art. 18, §1º). Redija a seção "${secao!.titulo.replace(/\s*\*$/, '')}" (${secao!.fundamento_legal ?? ''}) do Estudo Técnico Preliminar. ` +
        `Descreva a solução pela FUNÇÃO — não cite marca, modelo ou fabricante (art. 41, I). Responda APENAS com o texto da seção em HTML simples (<p>, <ul>, <li>), sem título.\n\n` +
        contexto +
        (secao!.placeholder ? `Orientação: ${secao!.placeholder}\n` : '') +
        (atual ? `Texto atual da seção (preserve os fatos): ${atual.slice(0, 3000)}\n` : '');
    } else {
      const trecho = String(body?.trecho ?? '').trim().slice(0, 2000);
      if (!trecho) throw new BadRequestException('Informe o trecho a reescrever.');
      prompt =
        `Reescreva o trecho abaixo de um ETP para descrever a solução pela FUNÇÃO e pelo desempenho exigido, sem citar marca, modelo ou fabricante (Lei 14.133/2021, art. 41, I). ` +
        `Se for indispensável citar a marca, use-a apenas como referência, com "ou similar/equivalente". Responda APENAS com o texto reescrito em HTML simples (<p>).\n\nTrecho: ${trecho}\n\n${contexto}`;
    }
    await this.auditLog
      .log({
        licitacao_id: licitacaoId,
        documento_id: base.etp.peca?.documento_id,
        acao: AcaoLogFaseInterna.IA_INVOCADA,
        descricao: `Assistente do ETP (${acao}${secaoId ? ` · ${secaoId}` : ''}) pedido por ${autor.nome ?? 'usuário'}`,
        dados_depois: { acao, secao: secaoId || null },
        contexto: { usuario_id: autor.id ?? undefined, usuario_nome: autor.nome ?? undefined },
      })
      .catch(() => undefined);
    try {
      const resposta = String(await this.ia.chat([{ role: 'user', content: prompt }], 'ETP')).trim();
      if (!resposta) throw new Error('resposta vazia');
      const html = resposta.startsWith('<') ? resposta : `<p>${esc(resposta).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;
      return {
        acao,
        disponivel: true,
        secao_id: secaoId || null,
        sugestao_html: html,
        // A sugestão NÃO foi aplicada: o usuário decide (aceitar grava como texto dele)
        aplicada: false,
        marca_na_sugestao: detectarIndicacaoMarca({ sugestao: html }),
        analise,
      };
    } catch (e: any) {
      return {
        acao,
        disponivel: false,
        secao_id: secaoId || null,
        mensagem: `Assistente de IA indisponível agora (${String(e?.message ?? e).slice(0, 160)}). As análises abaixo não dependem da IA.`,
        analise,
      };
    }
  }

  // ==========================================================================
  // TR
  // ==========================================================================

  async obterTr(licitacaoId: string) {
    const lic = await this.licitacao(licitacaoId);
    const [tr, etp] = await Promise.all([
      this.docAtual(licitacaoId, TipoDocumentoFaseInterna.TERMO_REFERENCIA),
      this.docAtual(licitacaoId, TipoDocumentoFaseInterna.ESTUDO_TECNICO_PRELIMINAR),
    ]);
    const itens = await this.itensDoProcesso(licitacaoId);
    const total = Math.round(itens.reduce((s: number, i: any) => s + (Number(i.valor_total) || Number(i.quantidade) * Number(i.valor_unitario || 0)), 0) * 100) / 100;
    const fundamento = fundamentoEfetivo(lic);
    const reserva = await this.orcamento.resumoParaTr(licitacaoId);
    const seed = await this.derivacao.montarSeed(licitacaoId, 'TR');
    const instrucao = await this.faseInterna.getInstrucao(licitacaoId);
    return {
      licitacao: { id: lic.id, numero_processo: lic.numero_processo, objeto: lic.objeto, modalidade: lic.modalidade, fase: lic.fase, fase_interna: ehFaseInterna(lic.fase) },
      contratacao_direta: instrucao.contratacao_direta,
      instrucao: instrucao.itens.find((i) => i.tipo === 'TR') ?? null,
      tr: { peca: this.resumoPeca(tr), secoes: this.secoesDe(tr) },
      // Mesma regra da instrução: pronto = emitido (gerado/anexado/assinado) ou "não se aplica"
      etp: { peca: this.resumoPeca(etp), pronto: ['OK', 'NAO_SE_APLICA'].includes(instrucao.itens.find((i) => i.tipo === 'ETP')?.status ?? '') },
      itens,
      valor_total: total,
      sigilo: { sigiloso: lic.sigilo_orcamento === 'SIGILOSO', justificativa: lic.justificativa_sigilo ?? null },
      fundamento_legal: { codigo: fundamento, texto: textoDoFundamento(fundamento) },
      dotacao: reserva,
      derivaveis: Object.entries(seed.secoes).map(([id, v]) => ({ secao_id: id, origem: v.origem })),
      modelo: this.secoesDoModelo('TR'),
    };
  }

  /** Texto da estimativa no TR respeitando o sigilo do orçamento (art. 24). */
  static textoEstimativaTr(sigiloso: boolean, total: number, justificativa?: string | null): string {
    if (sigiloso) {
      return `<p>O orçamento estimado da contratação é SIGILOSO, nos termos do art. 24 da Lei nº 14.133/2021${justificativa ? ` (${esc(justificativa)})` : ''}, e será tornado público apenas após o julgamento das propostas. O valor consta dos autos, com acesso restrito aos órgãos de controle.</p>`;
    }
    return total > 0 ? `<p>Valor total estimado da contratação: ${BRL(total)}, apurado na pesquisa de preços (art. 23).</p>` : '';
  }
}
