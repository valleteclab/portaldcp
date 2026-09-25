import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import FormData = require('form-data');
import { PncpService } from '../pncp.service';
import { PncpSync, TipoSincronizacao } from '../entities/pncp-sync.entity';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';
import { ehFaseInterna } from '../../licitacoes/transicoes/fases';
import { AtorTransicao, atorSistema } from '../../licitacoes/transicoes/transicoes.tipos';
import { gerarAvisoDispensaPdf } from '../../licitacoes/aviso-dispensa-pdf';
import { beneficioDaUnidadeSql } from '../../julgamento/me-epp/beneficio-mpe.sql';
import { editalVigenteSql } from '../../publicacao/publicacao.sql';
import { CRITERIOS_ART60 } from '../../julgamento/desempate-regras';
import { resolverArquivoDeUrl } from '../../common/arquivos/arquivos';
import { TIPO_CONTRATO, TIPO_DOCUMENTO } from '../dto/pncp.dto';
import {
  BeneficioParaPncp,
  ItemParaPncp,
  LicitacaoParaPncp,
  amparoDoInciso,
  categoriaProcessoId,
  criterioDoArt60,
  dataBrasilia,
  documentoDaCompra,
  instrumentoConvocatorioId,
  montarCompra,
  montarItemCompra,
  montarResultadoItem,
  situacaoItemPncpDoStatus,
  situacaoPncpDaSituacao,
  tipoPessoaDoNi,
} from '../mapeamento-pncp';
import { ErroPncp, RE_COMPRA_JA_EXISTE, aguardandoDependencia, falhaDefinitiva } from './regras-fila';

/** O que uma operação devolve para a linha da fila. */
export interface ResultadoEnvio {
  resposta?: unknown;
  payload?: unknown;
  numeroControle?: string | null;
  ano?: number | null;
  sequencial?: number | null;
  observacao?: string;
  link?: string;
}

/** Compra publicada (a identidade no PNCP de que as demais operações dependem). */
export interface CompraPublicada {
  cnpj: string;
  ano: number;
  sequencial: number;
  numeroControle: string;
  codigoUnidade: string | null;
}

interface ArquivoEnvio {
  buffer: Buffer;
  nome: string;
  contentType: string;
}

const pdf = 'application/pdf';
/** Cabeçalhos HTTP só aceitam ASCII (Titulo-Documento). */
const ascii = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '').slice(0, 255);
const tipoMime = (nome: string) => {
  const ext = path.extname(nome).toLowerCase();
  return ext === '.pdf' ? pdf : ext === '.zip' ? 'application/zip' : ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/octet-stream';
};

/** Lê um arquivo gravado no banco como URL/caminho lógico/caminho em disco. */
export function lerArquivoGravado(caminho: string | null | undefined): Buffer | null {
  if (!caminho) return null;
  const candidatos = [resolverArquivoDeUrl(caminho), path.isAbsolute(caminho) ? caminho : null, path.join(process.cwd(), caminho)];
  for (const c of candidatos) {
    if (c && fs.existsSync(c) && fs.statSync(c).isFile()) return fs.readFileSync(c);
  }
  return null;
}

/**
 * EXECUTORES da fila do PNCP (plano E7): cada operação monta o payload NA
 * HORA, a partir dos dados atuais, e chama o PNCP pelo `PncpService.chamarApi`
 * (que classifica a falha). Nenhum executor grava `pncp_sync` — quem grava é
 * a fila (`PncpFilaService`). Dependência não satisfeita = `aguardandoDependencia`.
 */
@Injectable()
export class PncpEnviosService {
  private readonly logger = new Logger(PncpEnviosService.name);
  private cacheAmparoDesempate: Array<{ id: number; nome: string }> | null = null;

  constructor(
    private readonly pncp: PncpService,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  executar(r: Pick<PncpSync, 'tipo' | 'licitacao_id' | 'entidade_id' | 'referencia'>): Promise<ResultadoEnvio> {
    const ref = r.referencia ?? {};
    switch (r.tipo) {
      case TipoSincronizacao.COMPRA:
        return this.compra(r.licitacao_id, ref.ator ?? atorSistema('pncp-fila'));
      case TipoSincronizacao.ITEM:
        return this.itens(r.licitacao_id);
      case TipoSincronizacao.DOCUMENTO:
        return this.documento(r.licitacao_id, ref);
      case TipoSincronizacao.RETIFICACAO_COMPRA:
        return this.retificacaoCompra(r.licitacao_id, String(ref.justificativa || 'Retificação do edital'));
      case TipoSincronizacao.SITUACAO_COMPRA:
        return this.situacaoCompra(r.licitacao_id, String(ref.situacao || ''), String(ref.justificativa || ''));
      case TipoSincronizacao.RESULTADO:
        return this.resultadoItem(r.licitacao_id, String(ref.item_id || r.entidade_id));
      case TipoSincronizacao.ATA:
        return this.ata(String(ref.ata_id || r.entidade_id));
      case TipoSincronizacao.CONTRATO:
        return this.contrato(String(ref.contrato_id || r.entidade_id));
      case TipoSincronizacao.RETIFICACAO_CONTRATO:
        return this.retificacaoContrato(String(ref.contrato_id || r.entidade_id));
      default:
        return Promise.reject(falhaDefinitiva(`Operação ${r.tipo} não é processada pela fila`));
    }
  }

  // ==========================================================================
  // Leituras
  // ==========================================================================

  private async licitacao(id: string): Promise<Licitacao> {
    const lic = await this.ds.getRepository(Licitacao).findOne({ where: { id }, relations: ['orgao', 'itens'] });
    if (!lic) throw falhaDefinitiva(`Licitação ${id} não encontrada`);
    lic.itens = [...(lic.itens || [])].sort((a, b) => (a.numero_item ?? 0) - (b.numero_item ?? 0));
    // Modalidades especiais (E7c): natureza do trabalho do concurso (conteúdo artístico) e tipo do bem leiloado (imóvel/móvel)
    if (String(lic.modalidade) === 'CONCURSO') {
      const [r] = await this.ds.query(`SELECT natureza_trabalho FROM concurso_regulamentos WHERE licitacao_id = $1`, [lic.id]);
      (lic as any).natureza_trabalho_concurso = r?.natureza_trabalho ?? null;
    }
    if (String(lic.modalidade) === 'LEILAO' && lic.itens.length) {
      const bens: any[] = await this.ds.query(`SELECT item_licitacao_id::text AS item, tipo_bem FROM leilao_bens WHERE licitacao_id = $1`, [lic.id]);
      for (const it of lic.itens) (it as any).tipo_bem_leilao = bens.find((b) => b.item === String(it.id))?.tipo_bem ?? null;
    }
    return lic;
  }

  private cnpj(lic: Licitacao): string {
    const c = this.pncp.cnpjDoOrgao(lic.orgao) || String(process.env.PNCP_CNPJ_ORGAO || '').replace(/\D/g, '');
    if (!c) throw falhaDefinitiva('CNPJ do órgão não configurado para o PNCP.');
    return c;
  }

  /**
   * Compra já publicada no PNCP (linha ENVIADA da fila — inclusive o vínculo
   * manual e a migração E9 das colunas antigas da licitação); null se ainda não.
   */
  async compraPublicada(licitacaoId: string | null | undefined): Promise<CompraPublicada | null> {
    if (!licitacaoId) return null;
    const [s] = await this.ds.query(
      `SELECT s.numero_controle_pncp, s.ano_compra, s.sequencial_compra, s.payload_enviado->>'codigoUnidadeCompradora' AS unidade
         FROM pncp_sync s
        WHERE s.licitacao_id = $1 AND s.tipo::text = 'COMPRA' AND s.status::text IN ('ENVIADO','ATUALIZADO')
          AND s.ano_compra IS NOT NULL AND s.sequencial_compra IS NOT NULL
        ORDER BY s.created_at DESC LIMIT 1`,
      [licitacaoId],
    );
    if (!s) return null;
    const [l] = await this.ds.query(
      `SELECT l.codigo_unidade_compradora, o.cnpj, o.pncp_cnpj_orgao, o.pncp_codigo_unidade
         FROM licitacoes l LEFT JOIN orgaos o ON o.id = l.orgao_id WHERE l.id::text = $1`,
      [licitacaoId],
    );
    if (!l) return null;
    const cnpj = this.pncp.cnpjDoOrgao(l) || String(process.env.PNCP_CNPJ_ORGAO || '').replace(/\D/g, '');
    const unidade = s.unidade || l.codigo_unidade_compradora || l.pncp_codigo_unidade || null;
    return { cnpj, ano: Number(s.ano_compra), sequencial: Number(s.sequencial_compra), numeroControle: s.numero_controle_pncp, codigoUnidade: unidade };
  }

  private async exigirCompra(licitacaoId: string | null | undefined): Promise<CompraPublicada> {
    const c = await this.compraPublicada(licitacaoId);
    if (!c) throw aguardandoDependencia('a compra ainda não foi publicada no PNCP');
    return c;
  }

  private async beneficioDoItem(itemId: string): Promise<BeneficioParaPncp | null> {
    const u = await beneficioDaUnidadeSql(this.ds, itemId);
    return u ? { tipo: u.beneficio.tipo, ehCota: u.beneficio.ehCota, somenteMpe: u.beneficio.somenteMpe } : null;
  }

  private multipart(partes: Array<{ campo: string; buffer: Buffer; nome: string; contentType: string }>): { form: FormData; headers: Record<string, string> } {
    const form = new FormData();
    for (const p of partes) form.append(p.campo, p.buffer, { filename: p.nome, contentType: p.contentType });
    return { form, headers: form.getHeaders() as Record<string, string> };
  }

  private async anexar(caminho: string, arquivo: ArquivoEnvio, tipoDocumentoId: number, titulo: string) {
    const { form, headers } = this.multipart([{ campo: 'arquivo', buffer: arquivo.buffer, nome: arquivo.nome, contentType: arquivo.contentType }]);
    return this.pncp.chamarApi({
      metodo: 'POST',
      caminho,
      dados: form,
      headers: { ...headers, 'Titulo-Documento': ascii(titulo), 'Tipo-Documento-Id': String(tipoDocumentoId) },
    });
  }

  // ==========================================================================
  // COMPRA (+ documento obrigatório)
  // ==========================================================================

  private async documentoObrigatorio(lic: Licitacao): Promise<{ arquivo: ArquivoEnvio; tipoDocumentoId: number; titulo: string }> {
    const doc = documentoDaCompra(lic);
    if (doc.fonte === 'EDITAL') {
      const ed = await editalVigenteSql(this.ds.manager, lic.id);
      const buffer = lerArquivoGravado(ed?.caminho);
      if (!ed || !buffer) {
        throw falhaDefinitiva('Edital não anexado à licitação (documento EDITAL/EDITAL_RETIFICADO ou edital aprovado da fase interna com arquivo) — anexe o edital e reenvie.');
      }
      const nome = ed.nome_original || `edital-v${ed.versao}.pdf`;
      return { arquivo: { buffer, nome, contentType: ed.mime_type || tipoMime(nome) }, tipoDocumentoId: doc.tipoDocumentoId, titulo: ed.titulo || doc.titulo };
    }
    if (doc.fonte === 'ATO_AUTORIZACAO') {
      // Ato de autorização anexado ao processo (instrução do art. 72); sem ele, o aviso gerado dos dados.
      const [a] = await this.ds.query(
        `SELECT caminho, nome FROM (
           SELECT caminho_arquivo AS caminho, nome_original AS nome, created_at FROM documentos_licitacao
            WHERE licitacao_id::text = $1 AND tipo::text = 'AUTORIZACAO' AND status::text NOT IN ('SUBSTITUIDO','REVOGADO')
           UNION ALL
           SELECT COALESCE(NULLIF(arquivo_pdf_path,''), NULLIF(caminho_arquivo,'')), nome_arquivo, created_at FROM documentos_fase_interna
            WHERE licitacao_id::text = $1 AND tipo::text = 'AA' AND COALESCE(NULLIF(arquivo_pdf_path,''), NULLIF(caminho_arquivo,'')) IS NOT NULL
         ) d ORDER BY created_at DESC LIMIT 1`,
        [lic.id],
      );
      const buffer = lerArquivoGravado(a?.caminho);
      if (buffer) {
        const nome = a.nome || 'ato-autorizacao.pdf';
        return { arquivo: { buffer, nome, contentType: tipoMime(nome) }, tipoDocumentoId: doc.tipoDocumentoId, titulo: doc.titulo };
      }
    }
    // Aviso de contratação direta gerado dos dados (identificação, objeto, itens, prazos)
    const buffer = gerarAvisoDispensaPdf({
      orgao_nome: lic.orgao?.nome || 'Órgão',
      orgao_cnpj: this.pncp.cnpjDoOrgao(lic.orgao),
      licitacao: lic,
      itens: lic.itens || [],
      url_sistema: process.env.FRONTEND_URL || undefined,
    });
    return { arquivo: { buffer, nome: 'aviso-contratacao-direta.pdf', contentType: pdf }, tipoDocumentoId: doc.tipoDocumentoId, titulo: doc.titulo };
  }

  async montarCompraDaLicitacao(lic: Licitacao) {
    const beneficios = await Promise.all((lic.itens || []).map((i) => this.beneficioDoItem(i.id)));
    return montarCompra(lic as unknown as LicitacaoParaPncp, (lic.itens || []) as unknown as ItemParaPncp[], {
      codigoUnidade: lic.codigo_unidade_compradora || lic.orgao?.pncp_codigo_unidade,
      linkSistemaOrigem: this.pncp.linkSistemaOrigem(lic.id),
      beneficioDoItem: (i) => beneficios[i],
    });
  }

  private async compra(licitacaoId: string, ator: AtorTransicao): Promise<ResultadoEnvio> {
    const lic = await this.licitacao(licitacaoId);
    if (lic.selecao_externa) throw falhaDefinitiva('Seleção feita em plataforma externa: a compra é publicada pela plataforma de origem.');
    const ja = await this.compraPublicada(licitacaoId);
    if (ja) {
      return { observacao: 'Compra já publicada no PNCP', numeroControle: ja.numeroControle, ano: ja.ano, sequencial: ja.sequencial, link: this.pncp.linkCompra(ja.cnpj, ja.ano, ja.sequencial) };
    }
    const validacao = await this.pncp.validarLicitacaoParaPNCP(licitacaoId);
    if (!validacao.valido) throw falhaDefinitiva(`Licitação não pode ser enviada ao PNCP:\n${validacao.erros.join('\n')}`);
    const cnpj = this.cnpj(lic);
    // Publicação PELO PNCP (licitação ainda na fase interna): o envio É a
    // divulgação — a data de publicação é agora (a mesma que o ato PUBLICAR
    // grava logo depois, em registrarPublicacaoPncp); nada é inventado.
    if (ehFaseInterna(lic.fase) && !lic.data_publicacao_edital) lic.data_publicacao_edital = new Date();
    const compra = await this.montarCompraDaLicitacao(lic);
    const doc = await this.documentoObrigatorio(lic);
    const { form, headers } = this.multipart([
      { campo: 'compra', buffer: Buffer.from(JSON.stringify(compra), 'utf-8'), nome: 'compra.json', contentType: 'application/json' },
      { campo: 'documento', buffer: doc.arquivo.buffer, nome: doc.arquivo.nome, contentType: doc.arquivo.contentType },
    ]);

    let numeroControle: string | null = null;
    let ano: number | null = null;
    let sequencial: number | null = null;
    let resposta: unknown = null;
    let observacao: string | undefined;
    try {
      const r = await this.pncp.chamarApi<Record<string, any>>({
        metodo: 'POST',
        caminho: `/orgaos/${cnpj}/compras`,
        dados: form,
        headers: { ...headers, 'Titulo-Documento': ascii(doc.titulo), 'Tipo-Documento-Id': String(doc.tipoDocumentoId) },
      });
      resposta = r.data;
      numeroControle = r.data?.numeroControlePNCP || r.data?.numeroControle || null;
      ano = Number(r.data?.anoCompra || r.data?.ano) || null;
      sequencial = Number(r.data?.sequencialCompra || r.data?.sequencial) || null;
      const loc = String(r.headers?.location || '').match(/\/compras\/(\d+)\/(\d+)/);
      if (loc) {
        ano = ano ?? Number(loc[1]);
        sequencial = sequencial ?? Number(loc[2]);
      }
      const m = numeroControle?.match(/\d+-\d+-(\d+)\/(\d+)$/);
      if (m) {
        sequencial = sequencial ?? Number(m[1]);
        ano = ano ?? Number(m[2]);
      }
      if (!numeroControle && ano && sequencial) numeroControle = `${cnpj}-1-${String(sequencial).padStart(6, '0')}/${ano}`;
    } catch (e) {
      // Recusa benigna: a mesma compra já existe no PNCP → vincula (não duplica)
      const m = e instanceof ErroPncp ? e.message.match(RE_COMPRA_JA_EXISTE) : null;
      if (!m) throw e;
      const [, cnpjExistente, unidade, seq, anoStr] = m;
      numeroControle = `${cnpjExistente}-${unidade}-${seq.padStart(6, '0')}/${anoStr}`;
      ano = Number(anoStr);
      sequencial = Number(seq);
      observacao = 'Compra já existia no PNCP e foi vinculada';
    }
    if (!ano || !sequencial) throw falhaDefinitiva('O PNCP aceitou a compra mas não devolveu ano/sequencial (Location) — confira no portal e vincule manualmente.');
    const link = this.pncp.linkCompra(cnpj, ano, sequencial);
    // O estado da compra fica nesta linha da fila (fonte única, E9); aqui só o ato PUBLICAR
    await this.pncp.registrarPublicacaoPncp(licitacaoId, { numeroControle, ano, sequencial }, ator);
    return { resposta, payload: { ...compra, documento: { tipoDocumentoId: doc.tipoDocumentoId, nome: doc.arquivo.nome } }, numeroControle, ano, sequencial, link, observacao };
  }

  // ==========================================================================
  // ITENS, DOCUMENTO, RETIFICAÇÃO, SITUAÇÃO
  // ==========================================================================

  private async itens(licitacaoId: string): Promise<ResultadoEnvio> {
    const c = await this.exigirCompra(licitacaoId);
    const lic = await this.licitacao(licitacaoId);
    if (!lic.itens?.length) throw falhaDefinitiva('Licitação sem itens');
    const instrumento = instrumentoConvocatorioId(lic);
    const itens = await Promise.all(
      lic.itens.map(async (it, i) => montarItemCompra(it as unknown as ItemParaPncp, i, lic as unknown as LicitacaoParaPncp, await this.beneficioDoItem(it.id), instrumento)),
    );
    const r = await this.pncp.chamarApi({ metodo: 'POST', caminho: `/orgaos/${c.cnpj}/compras/${c.ano}/${c.sequencial}/itens`, dados: itens });
    return { resposta: r.data, payload: itens, numeroControle: c.numeroControle, ano: c.ano, sequencial: c.sequencial };
  }

  /**
   * Documento anexado à compra. Referência:
   *  - `origem: 'DOCUMENTO_LICITACAO'` + `documento_id` (documentos_licitacao);
   *  - `origem: 'FORMALIZACAO_HOMOLOGACAO'` — termo de adjudicação e homologação (E6);
   *  - `origem: 'ARQUIVO'` + `arquivo` (caminho lógico gravado pela rota manual).
   */
  private async documento(licitacaoId: string, ref: Record<string, any>): Promise<ResultadoEnvio> {
    const c = await this.exigirCompra(licitacaoId);
    let arquivo: ArquivoEnvio | null = null;
    let titulo = String(ref.titulo || 'Documento');
    const tipoDocumentoId = Number(ref.tipo_documento_id) || TIPO_DOCUMENTO.OUTROS;
    if (ref.origem === 'DOCUMENTO_LICITACAO') {
      const [d] = await this.ds.query(`SELECT caminho_arquivo, nome_original, titulo, mime_type FROM documentos_licitacao WHERE id::text = $1`, [ref.documento_id]);
      const buffer = lerArquivoGravado(d?.caminho_arquivo);
      if (!d || !buffer) throw falhaDefinitiva('Arquivo do documento não encontrado no servidor.');
      arquivo = { buffer, nome: d.nome_original || 'documento.pdf', contentType: d.mime_type || tipoMime(d.nome_original || '') };
      titulo = ref.titulo || d.titulo || titulo;
    } else if (ref.origem === 'FORMALIZACAO_HOMOLOGACAO') {
      const [f] = await this.ds.query(
        `SELECT arquivo_termo, arquivo_assinado FROM formalizacoes_resultado
          WHERE licitacao_id::text = $1 AND tipo = 'HOMOLOGACAO' AND status = 'EFETIVADO'
          ORDER BY efetivado_em DESC NULLS LAST, created_at DESC LIMIT 1`,
        [licitacaoId],
      );
      const buffer = lerArquivoGravado(f?.arquivo_assinado) ?? lerArquivoGravado(f?.arquivo_termo);
      if (!buffer) throw aguardandoDependencia('termo de homologação ainda não gerado');
      arquivo = { buffer, nome: 'termo-adjudicacao-homologacao.pdf', contentType: pdf };
    } else if (ref.origem === 'ARQUIVO') {
      const buffer = lerArquivoGravado(ref.arquivo);
      if (!buffer) throw falhaDefinitiva('Arquivo enviado não encontrado no servidor.');
      arquivo = { buffer, nome: String(ref.nome || path.basename(String(ref.arquivo))), contentType: tipoMime(String(ref.nome || ref.arquivo)) };
    }
    if (!arquivo) throw falhaDefinitiva('Documento sem referência de arquivo.');
    const r = await this.anexar(`/orgaos/${c.cnpj}/compras/${c.ano}/${c.sequencial}/arquivos`, arquivo, tipoDocumentoId, titulo);
    if (ref.origem === 'DOCUMENTO_LICITACAO') {
      await this.ds.query(`UPDATE documentos_licitacao SET enviado_pncp = true, data_envio_pncp = now() WHERE id::text = $1`, [ref.documento_id]);
    }
    return { resposta: r.data, payload: { tipoDocumentoId, titulo, nome: arquivo.nome }, numeroControle: c.numeroControle, ano: c.ano, sequencial: c.sequencial };
  }

  /** Retificação parcial da compra (edital retificado — art. 55 §1º): dados atuais da compra e dos itens. */
  private async retificacaoCompra(licitacaoId: string, justificativa: string): Promise<ResultadoEnvio> {
    const c = await this.exigirCompra(licitacaoId);
    const lic = await this.licitacao(licitacaoId);
    const compra = await this.montarCompraDaLicitacao(lic);
    const { itensCompra, codigoUnidadeCompradora: _u, anoCompra: _a, ...campos } = compra;
    const corpo = { ...campos, justificativa: justificativa.slice(0, 255) };
    const r = await this.pncp.chamarApi({ metodo: 'PATCH', caminho: `/orgaos/${c.cnpj}/compras/${c.ano}/${c.sequencial}`, dados: corpo });
    for (const it of itensCompra) {
      await this.pncp.chamarApi({ metodo: 'PATCH', caminho: `/orgaos/${c.cnpj}/compras/${c.ano}/${c.sequencial}/itens/${it.numeroItem}`, dados: { ...it, justificativa: corpo.justificativa } });
    }
    return { resposta: r.data, payload: { compra: corpo, itens: itensCompra.length }, numeroControle: c.numeroControle, ano: c.ano, sequencial: c.sequencial };
  }

  /** Situação da compra (suspensa/revogada/anulada/divulgada) ou dos itens (deserto/fracassado). */
  private async situacaoCompra(licitacaoId: string, situacao: string, justificativa: string): Promise<ResultadoEnvio> {
    const c = await this.exigirCompra(licitacaoId);
    const alvo = situacaoPncpDaSituacao(situacao);
    if (!alvo) throw falhaDefinitiva(`Situação ${situacao} não tem correspondente no PNCP`);
    const just = (justificativa || `Situação ${situacao.toLowerCase()} registrada no sistema de origem`).slice(0, 255);
    const enviados: Array<{ item?: number; situacao: number }> = [];
    let resposta: unknown = null;
    if (alvo.compra) {
      const r = await this.pncp.chamarApi({ metodo: 'PATCH', caminho: `/orgaos/${c.cnpj}/compras/${c.ano}/${c.sequencial}`, dados: { situacaoCompraId: alvo.compra, justificativa: just } });
      resposta = r.data;
      enviados.push({ situacao: alvo.compra });
    }
    if (alvo.itens) {
      const lic = await this.licitacao(licitacaoId);
      for (const it of lic.itens) {
        if (String(it.status) === 'HOMOLOGADO') continue;
        const s = situacaoItemPncpDoStatus(it.status) ?? alvo.itens;
        await this.pncp.chamarApi({ metodo: 'PATCH', caminho: `/orgaos/${c.cnpj}/compras/${c.ano}/${c.sequencial}/itens/${it.numero_item}`, dados: { situacaoCompraItemId: s, justificativa: just } });
        enviados.push({ item: it.numero_item, situacao: s });
      }
    }
    return { resposta, payload: { situacao, enviados, justificativa: just }, numeroControle: c.numeroControle, ano: c.ano, sequencial: c.sequencial };
  }

  // ==========================================================================
  // RESULTADO DO ITEM (homologação)
  // ==========================================================================

  private async resultadoItem(licitacaoId: string, itemId: string): Promise<ResultadoEnvio> {
    const c = await this.exigirCompra(licitacaoId);
    const lic = await this.licitacao(licitacaoId);
    const item = lic.itens.find((i) => i.id === itemId);
    if (!item) throw falhaDefinitiva('Item não encontrado na licitação');
    const caminhoItem = `/orgaos/${c.cnpj}/compras/${c.ano}/${c.sequencial}/itens/${item.numero_item}`;

    // Item sem resultado (deserto/fracassado/cancelado): informa a situação do item
    const situacaoItem = situacaoItemPncpDoStatus(item.status);
    if (situacaoItem && String(item.status) !== 'HOMOLOGADO') {
      const corpo = { situacaoCompraItemId: situacaoItem, justificativa: `Item ${String(item.status).toLowerCase()} no julgamento` };
      const r = await this.pncp.chamarApi({ metodo: 'PATCH', caminho: caminhoItem, dados: corpo });
      return { resposta: r.data, payload: corpo, observacao: `Item ${item.status}: situação informada`, numeroControle: c.numeroControle, ano: c.ano, sequencial: c.sequencial };
    }
    if (String(item.status) !== 'HOMOLOGADO' || !item.fornecedor_vencedor_id || item.valor_unitario_homologado == null) {
      throw falhaDefinitiva(`Item ${item.numero_item} sem resultado homologado (status ${item.status}).`);
    }
    const vencedor = item.fornecedor_vencedor_id;
    const [forn] = await this.ds.query(`SELECT cpf_cnpj, razao_social, porte::text AS porte FROM fornecedores WHERE id::text = $1`, [vencedor]);
    if (!forn) throw falhaDefinitiva('Fornecedor vencedor não encontrado no cadastro.');
    // Porte do RETRATO da proposta (E3) — o cadastro atual só como último recurso
    const [prop] = await this.ds.query(
      `SELECT porte_fornecedor FROM propostas WHERE licitacao_id::text = $1 AND fornecedor_id::text = $2 AND porte_fornecedor IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
      [licitacaoId, vencedor],
    );
    const unidadeId = String(lic.base_lance) === 'TOTAL_LOTE' && item.lote_id ? item.lote_id : item.id;
    const flags = await this.indicadoresDoResultado(lic, unidadeId, vencedor);
    const dto = montarResultadoItem({
      quantidade: item.quantidade,
      valorUnitario: item.valor_unitario_homologado,
      valorTotal: item.valor_total_homologado,
      fornecedor: { ni: forn.cpf_cnpj, razaoSocial: forn.razao_social, porte: prop?.porte_fornecedor ?? forn.porte },
      criterio: lic.criterio_julgamento,
      valorUnitarioEstimado: item.valor_unitario_estimado,
      ordemClassificacao: flags.ordem,
      dataResultado: lic.data_homologacao,
      beneficioMeEpp: flags.beneficioMeEpp,
      criterioDesempate: !!flags.desempate,
      amparoLegalCriterioDesempateId: flags.desempate ? await this.amparoDoDesempate(flags.desempate) : null,
      modalidade: lic.modalidade,
    });
    const r = await this.pncp.chamarApi({ metodo: 'POST', caminho: `${caminhoItem}/resultados`, dados: dto });
    return { resposta: r.data, payload: dto, numeroControle: c.numeroControle, ano: c.ano, sequencial: c.sequencial };
  }

  /**
   * Indicadores reais do resultado da unidade:
   *  - ordem: posição do vencedor entre as ofertas finais (melhor lance ativo
   *    de cada licitante não excluído, na direção do critério); sem lances, 1;
   *  - benefício ME/EPP: unidade exclusiva/cota (LC 123 art. 48) ou lance de
   *    DESEMPATE_MPE do vencedor (art. 45);
   *  - desempate: critério DECISIVO do art. 60 num desempate resolvido que
   *    envolveu o vencedor. O PNCP pede "aplicação de critério de desempate
   *    conforme o art. 60" — o sorteio (IN SEGES 73/2022 art. 28 §2º) não é
   *    critério do art. 60, então desempate decidido por sorteio não marca o
   *    indicador (decisão E7b, a validar).
   */
  async indicadoresDoResultado(lic: Pick<Licitacao, 'criterio_julgamento' | 'modalidade'>, unidadeId: string, vencedor: string) {
    const maior = String(lic.criterio_julgamento) === 'MAIOR_LANCE' || String(lic.modalidade) === 'LEILAO';
    const ofertas: Array<{ fornecedor_id: string; valor: string; situacao: string | null }> = await this.ds.query(
      `SELECT o.fornecedor_id, o.valor, lu.situacao FROM (
         SELECT fornecedor_id::text AS fornecedor_id, ${maior ? 'MAX' : 'MIN'}(valor) AS valor
           FROM lances
          WHERE COALESCE(cancelado, false) = false
            AND ((item_id::text = $1 AND lance_lote_id IS NULL) OR (lote_id::text = $1 AND item_id IS NULL))
          GROUP BY fornecedor_id) o
       LEFT JOIN licitantes_unidade lu ON lu.unidade_id::text = $1 AND lu.fornecedor_id::text = o.fornecedor_id`,
      [unidadeId],
    );
    const excluidos = ['DESCLASSIFICADO', 'RECUSADO', 'INABILITADO'];
    const doVencedor = ofertas.find((o) => o.fornecedor_id === vencedor);
    let ordem = 1;
    if (doVencedor) {
      const v = Number(doVencedor.valor);
      ordem += ofertas.filter((o) => o.fornecedor_id !== vencedor && !excluidos.includes(String(o.situacao)) && (maior ? Number(o.valor) > v : Number(o.valor) < v)).length;
    }
    const beneficio = await beneficioDaUnidadeSql(this.ds, unidadeId);
    const [mpe] = await this.ds.query(
      `SELECT 1 FROM lances WHERE fornecedor_id::text = $2 AND origem::text = 'DESEMPATE_MPE' AND COALESCE(cancelado, false) = false
          AND (item_id::text = $1 OR lote_id::text = $1) LIMIT 1`,
      [unidadeId, vencedor],
    );
    const [des] = await this.ds.query(
      `SELECT criterio_decisivo FROM desempates
        WHERE unidade_id::text = $1 AND status = 'RESOLVIDO' AND fornecedores ? $2
        ORDER BY resolvido_em DESC NULLS LAST LIMIT 1`,
      [unidadeId, vencedor],
    );
    const decisivo = des?.criterio_decisivo ? String(des.criterio_decisivo) : null;
    return {
      ordem,
      beneficioMeEpp: !!beneficio?.beneficio.somenteMpe || !!mpe,
      desempate: decisivo && criterioDoArt60(decisivo) ? decisivo : null,
    };
  }

  /**
   * Amparo legal do critério de desempate (tipo 3 da tabela "Amparo Legal"):
   * variável `PNCP_AMPARO_DESEMPATE_<CRITERIO>` (ex.: PNCP_AMPARO_DESEMPATE_EMPRESA_DO_ESTADO)
   * ou a consulta ao PNCP (`/amparos-legais?tipoAmparoLegalId=3`), casando
   * EXATAMENTE o inciso do art. 60 do critério decisivo. Sem correspondência →
   * null (o mapeamento recusa o envio com a orientação — nunca um amparo qualquer).
   */
  private async amparoDoDesempate(criterio: string): Promise<number | null> {
    const fixo = Number(process.env[`PNCP_AMPARO_DESEMPATE_${criterio}`]);
    if (fixo > 0) return fixo;
    const base = CRITERIOS_ART60.find((c) => c.criterio === criterio)?.baseLegal ?? '';
    if (!this.cacheAmparoDesempate) {
      const r = await this.pncp.chamarApi<any>({ metodo: 'GET', caminho: '/amparos-legais?tipoAmparoLegalId=3&statusAtivo=true' });
      const lista = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.data) ? r.data.data : [];
      this.cacheAmparoDesempate = lista.flatMap((a: any) => [
        { id: Number(a.id), nome: String(a.nome ?? '') },
        { id: Number(a.id), nome: String(a.descricao ?? '') },
      ]);
    }
    return amparoDoInciso(this.cacheAmparoDesempate ?? [], base);
  }

  // ==========================================================================
  // ATA DE REGISTRO DE PREÇOS (assinada)
  // ==========================================================================

  private async ata(ataId: string): Promise<ResultadoEnvio> {
    const [ata] = await this.ds.query(
      `SELECT id, licitacao_id, orgao_id, numero_ata, ano, status::text AS status, data_assinatura, data_vigencia_inicio, data_vigencia_fim,
              permite_adesao, arquivo_ata, enviado_pncp, sequencial_pncp, numero_controle_pncp
         FROM atas_registro_preco WHERE id::text = $1`,
      [ataId],
    );
    if (!ata) throw falhaDefinitiva('Ata não encontrada');
    if (ata.enviado_pncp && ata.sequencial_pncp) return { observacao: 'Ata já publicada no PNCP', numeroControle: ata.numero_controle_pncp };
    if (!['VIGENTE', 'ESGOTADA'].includes(ata.status)) throw aguardandoDependencia('a ata ainda não foi assinada por todas as partes');
    const c = await this.exigirCompra(ata.licitacao_id);
    const buffer = lerArquivoGravado(ata.arquivo_ata);
    if (!buffer) throw falhaDefinitiva('Termo assinado da ata não encontrado no servidor.');
    const dto = {
      numeroAtaRegistroPreco: ata.numero_ata,
      anoAta: Number(ata.ano) || Number(String(dataBrasilia(ata.data_assinatura)).slice(0, 4)),
      dataAssinatura: dataBrasilia(ata.data_assinatura),
      dataVigenciaInicio: dataBrasilia(ata.data_vigencia_inicio),
      dataVigenciaFim: dataBrasilia(ata.data_vigencia_fim),
      possibilidadeAdesao: !!ata.permite_adesao,
    };
    const { form, headers } = this.multipart([
      { campo: 'ata', buffer: Buffer.from(JSON.stringify(dto), 'utf-8'), nome: 'ata.json', contentType: 'application/json' },
      { campo: 'documento', buffer, nome: `ata-${String(ata.numero_ata).replace(/[^\w-]/g, '_')}.pdf`, contentType: pdf },
    ]);
    const r = await this.pncp.chamarApi<Record<string, any>>({
      metodo: 'POST',
      caminho: `/orgaos/${c.cnpj}/compras/${c.ano}/${c.sequencial}/atas`,
      dados: form,
      headers: { ...headers, 'Titulo-Documento': ascii(`Ata de Registro de Precos ${ata.numero_ata}`), 'Tipo-Documento-Id': String(TIPO_DOCUMENTO.ATA_REGISTRO_PRECO) },
    });
    const seq = Number(r.data?.sequencialAta || String(r.headers?.location || '').match(/\/atas\/(\d+)\/?$/)?.[1]) || null;
    const numeroControle = c.numeroControle && seq ? `${c.numeroControle}-${String(seq).padStart(6, '0')}` : null;
    await this.ds.query(
      `UPDATE atas_registro_preco SET enviado_pncp = true, data_envio_pncp = now(), data_publicacao = COALESCE(data_publicacao, $2::date),
          sequencial_pncp = $3, numero_controle_pncp = $4, updated_at = now() WHERE id = $1`,
      [ata.id, dataBrasilia(new Date()), seq, numeroControle],
    );
    return { resposta: { ...(r.data ?? {}), sequencialAta: seq }, payload: dto, numeroControle, ano: c.ano, sequencial: c.sequencial };
  }

  // ==========================================================================
  // CONTRATO (somente assinado — art. 94) e retificação do contrato enviado antes da assinatura
  // ==========================================================================

  private async dadosContrato(contratoId: string) {
    const [ct] = await this.ds.query(
      `SELECT c.id, c.licitacao_id, c.numero_contrato, c.objeto, c.valor_inicial, c.valor_global, c.data_assinatura,
              c.data_vigencia_inicio, c.data_vigencia_fim, c.fornecedor_cnpj, c.fornecedor_razao_social, c.arquivo_contrato,
              c.ata_registro_preco_id, c.enviado_pncp, c.ano_pncp, c.sequencial_pncp, c.numero_controle_pncp
         FROM contratos c WHERE c.id::text = $1`,
      [contratoId],
    );
    if (!ct) throw falhaDefinitiva('Contrato não encontrado');
    return ct;
  }

  private async contrato(contratoId: string): Promise<ResultadoEnvio> {
    const ct = await this.dadosContrato(contratoId);
    if (ct.enviado_pncp && ct.sequencial_pncp) return { observacao: 'Contrato já publicado no PNCP', numeroControle: ct.numero_controle_pncp };
    if (!ct.data_assinatura) throw aguardandoDependencia('o contrato ainda não foi assinado por todas as partes (art. 94)');
    if (!ct.licitacao_id) throw falhaDefinitiva('Contrato sem licitação de origem (adesão/avulso) — publicação pela tela do contrato.');
    const c = await this.exigirCompra(ct.licitacao_id);
    const lic = await this.licitacao(ct.licitacao_id);
    let sequencialAta: number | null = null;
    if (lic.srp) {
      const [a] = await this.ds.query(
        `SELECT sequencial_pncp FROM atas_registro_preco
          WHERE licitacao_id::text = $1 AND enviado_pncp = true AND sequencial_pncp IS NOT NULL
            AND ($2::text IS NULL OR id::text = $2)
          ORDER BY data_envio_pncp DESC NULLS LAST LIMIT 1`,
        [ct.licitacao_id, ct.ata_registro_preco_id ?? null],
      );
      if (!a) throw aguardandoDependencia('a ata de registro de preços ainda não foi publicada no PNCP');
      sequencialAta = Number(a.sequencial_pncp);
    }
    const buffer = lerArquivoGravado(ct.arquivo_contrato);
    if (!buffer) throw falhaDefinitiva('Termo assinado do contrato não encontrado no servidor.');
    const [vi, vf] = [dataBrasilia(ct.data_vigencia_inicio), dataBrasilia(ct.data_vigencia_fim)];
    if (!vi || !vf) throw falhaDefinitiva('Vigência do contrato não informada.');
    const ni = String(ct.fornecedor_cnpj || '').replace(/\D/g, '');
    const anoMatch = String(ct.numero_contrato || '').match(/\/(\d{4})$/);
    const valorGlobal = Number(ct.valor_global ?? ct.valor_inicial) || 0;
    const dto = {
      numeroControlePNCPCompra: c.numeroControle,
      cnpjCompra: c.cnpj,
      anoCompra: c.ano,
      sequencialCompra: c.sequencial,
      processo: lic.numero_processo,
      frutoAdesao: false,
      ...(sequencialAta ? { sequencialAta } : {}),
      temRemanejamento: false,
      anoContrato: anoMatch ? Number(anoMatch[1]) : Number(String(dataBrasilia(ct.data_assinatura)).slice(0, 4)),
      numeroContratoEmpenho: ct.numero_contrato,
      tipoContratoId: TIPO_CONTRATO.CONTRATO,
      categoriaProcessoId: categoriaProcessoId(lic.tipo_contratacao),
      receita: false,
      codigoUnidade: c.codigoUnidade || '1',
      niFornecedor: ni,
      tipoPessoaFornecedor: tipoPessoaDoNi(ni),
      nomeRazaoSocialFornecedor: ct.fornecedor_razao_social,
      objetoContrato: ct.objeto || lic.objeto,
      valorInicial: Number(ct.valor_inicial) || valorGlobal,
      numeroParcelas: 1,
      valorParcela: valorGlobal,
      valorGlobal,
      dataAssinatura: dataBrasilia(ct.data_assinatura),
      dataVigenciaInicio: vi,
      dataVigenciaFim: vf,
    };
    const { form, headers } = this.multipart([
      { campo: 'contrato', buffer: Buffer.from(JSON.stringify(dto), 'utf-8'), nome: 'contrato.json', contentType: 'application/json' },
      { campo: 'documento', buffer, nome: `termo-contrato-${String(ct.numero_contrato || '').replace(/[^\w-]/g, '_')}.pdf`, contentType: pdf },
    ]);
    const r = await this.pncp.chamarApi<Record<string, any>>({
      metodo: 'POST',
      caminho: `/orgaos/${c.cnpj}/contratos`,
      dados: form,
      headers: { ...headers, 'Titulo-Documento': ascii(`Termo de Contrato ${ct.numero_contrato}`), 'Tipo-Documento-Id': String(TIPO_DOCUMENTO.CONTRATO) },
    });
    const loc = String(r.headers?.location || '').match(/\/contratos\/(\d+)\/(\d+)\/?$/);
    const ano = loc ? Number(loc[1]) : null;
    const seq = loc ? Number(loc[2]) : null;
    const numeroControle = r.data?.numeroControlePNCP || (ano && seq ? `${c.cnpj}-2-${String(seq).padStart(6, '0')}/${ano}` : null);
    await this.ds.query(
      `UPDATE contratos SET enviado_pncp = true, data_envio_pncp = now(), numero_controle_pncp = COALESCE($2, numero_controle_pncp),
          ano_pncp = COALESCE($3, ano_pncp), sequencial_pncp = COALESCE($4, sequencial_pncp) WHERE id::text = $1`,
      [ct.id, numeroControle, ano, seq],
    );
    return { resposta: r.data, payload: dto, numeroControle, ano: c.ano, sequencial: c.sequencial };
  }

  /** Contrato publicado ANTES da assinatura (legado da D5): retifica datas e anexa o termo assinado. */
  private async retificacaoContrato(contratoId: string): Promise<ResultadoEnvio> {
    const ct = await this.dadosContrato(contratoId);
    if (!ct.data_assinatura) throw aguardandoDependencia('o contrato ainda não foi assinado por todas as partes');
    let ano = Number(ct.ano_pncp) || null;
    let seq = Number(ct.sequencial_pncp) || null;
    const [s] = await this.ds.query(
      `SELECT numero_controle_pncp FROM pncp_sync WHERE tipo::text = 'CONTRATO' AND entidade_id = $1 AND status::text = 'ENVIADO' ORDER BY created_at DESC LIMIT 1`,
      [ct.id],
    );
    const m = String(s?.numero_controle_pncp || ct.numero_controle_pncp || '').match(/-(\d+)\/(\d{4})$/);
    if ((!ano || !seq) && m) {
      seq = Number(m[1]);
      ano = Number(m[2]);
    }
    if (!ano || !seq) throw aguardandoDependencia('o contrato ainda não foi publicado no PNCP');
    const lic = ct.licitacao_id ? await this.licitacao(ct.licitacao_id) : null;
    const cnpj = lic ? this.cnpj(lic) : String(process.env.PNCP_CNPJ_ORGAO || '').replace(/\D/g, '');
    const corpo = {
      dataAssinatura: dataBrasilia(ct.data_assinatura),
      dataVigenciaInicio: dataBrasilia(ct.data_vigencia_inicio),
      dataVigenciaFim: dataBrasilia(ct.data_vigencia_fim),
      valorGlobal: Number(ct.valor_global ?? ct.valor_inicial) || 0,
      justificativa: 'Publicacao do termo assinado por todas as partes (art. 94 da Lei 14.133/2021)',
    };
    const r = await this.pncp.chamarApi({ metodo: 'PATCH', caminho: `/orgaos/${cnpj}/contratos/${ano}/${seq}`, dados: corpo });
    const buffer = lerArquivoGravado(ct.arquivo_contrato);
    if (!buffer) throw falhaDefinitiva('Termo assinado do contrato não encontrado no servidor.');
    await this.anexar(`/orgaos/${cnpj}/contratos/${ano}/${seq}/arquivos`, { buffer, nome: 'termo-contrato-assinado.pdf', contentType: pdf }, TIPO_DOCUMENTO.CONTRATO, `Termo de Contrato ${ct.numero_contrato} (assinado)`);
    return { resposta: r.data, payload: corpo, numeroControle: `${cnpj}-2-${String(seq).padStart(6, '0')}/${ano}`, ano, sequencial: seq };
  }
}
