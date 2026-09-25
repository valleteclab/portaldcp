import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { isAbsolute, join, resolve } from 'path';
import { DataSource, EntityManager } from 'typeorm';
import { diretorioDeGravacao, resolverArquivoDeUrl } from '../common/arquivos/arquivos';
import { DocumentoLicitacao, StatusDocumento, TipoDocumentoLicitacao } from '../documentos/entities/documento-licitacao.entity';
import { ehFaseInterna } from '../licitacoes/transicoes/fases';
import { EditalVigenteMeta, editalVigenteSql } from './publicacao.sql';

export const TAMANHO_MAXIMO_EDITAL = 50 * 1024 * 1024;

export interface ArquivoEnviado {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

/** Edital vigente com o arquivo (o que vai ao PNCP — plano E7a item 3). */
export interface EditalVigente extends EditalVigenteMeta {
  /** Caminho físico resolvido do arquivo. */
  caminho_absoluto: string;
  /** Bytes do arquivo. */
  bytes: Buffer;
  /** SHA-256 do arquivo (calculado agora se o registro não tinha). */
  hash: string;
  nome_arquivo: string;
}

/** Aceita só PDF (o PNCP publica o instrumento convocatório em PDF). */
export function motivoArquivoEditalInvalido(a: ArquivoEnviado | null | undefined): string | null {
  if (!a || !a.buffer || !a.buffer.length) return 'Envie o arquivo do edital (PDF).';
  if (a.size > TAMANHO_MAXIMO_EDITAL || a.buffer.length > TAMANHO_MAXIMO_EDITAL) return 'Edital acima de 50 MB.';
  const ehPdf = a.buffer.subarray(0, 5).toString('latin1') === '%PDF-';
  if (!ehPdf) return 'O edital deve ser um arquivo PDF.';
  return null;
}

/**
 * ============================================================================
 * EDITAL — documento real do certame (plano E7a item 3)
 * ============================================================================
 *
 * Fonte única do arquivo do edital: `documentos_licitacao` (EDITAL →
 * EDITAL_RETIFICADO v2, v3...; versões anteriores SUBSTITUIDO — histórico) ou,
 * sem ele, o "Edital aprovado" (EA) da fase interna com arquivo.
 *  - antes da publicação, o órgão anexa/troca o edital (rascunho);
 *  - PUBLICAR exige o edital (pré-condição `editalAnexado`) e o marca
 *    PUBLICADO/público na mesma transação;
 *  - depois da publicação, só a RETIFICAÇÃO cria nova versão (art. 55 §1º).
 * `editalVigente(id)` devolve caminho, bytes e SHA-256 — é o que o envio ao
 * PNCP (E7b) usa no lugar do PDF em branco.
 */
@Injectable()
export class EditalService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async editalVigente(licitacaoId: string, m: EntityManager = this.dataSource.manager): Promise<EditalVigente | null> {
    const meta = await editalVigenteSql(m, licitacaoId);
    if (!meta) return null;
    const caminho = this.resolverCaminho(meta.caminho);
    if (!caminho) return null;
    const bytes = readFileSync(caminho);
    const hash = meta.hash || createHash('sha256').update(bytes).digest('hex');
    return {
      ...meta,
      caminho_absoluto: caminho,
      bytes,
      hash,
      nome_arquivo: meta.nome_original || `edital-v${meta.versao}.pdf`,
    };
  }

  /** Metadados do vigente (sem ler o arquivo). */
  async metaVigente(licitacaoId: string): Promise<EditalVigenteMeta | null> {
    return editalVigenteSql(this.dataSource.manager, licitacaoId);
  }

  /** Versões do edital (mais nova primeiro). */
  async versoes(licitacaoId: string): Promise<any[]> {
    return this.dataSource.query(
      `SELECT id::text AS id, tipo::text AS tipo, versao, titulo, nome_original, hash_arquivo AS hash, status::text AS status,
              tamanho_bytes, data_publicacao, documento_anterior_id::text AS documento_anterior_id, created_at
         FROM documentos_licitacao
        WHERE licitacao_id::text = $1 AND tipo::text IN ('EDITAL','EDITAL_RETIFICADO')
        ORDER BY versao DESC, created_at DESC`,
      [licitacaoId],
    );
  }

  /** Arquivo de uma versão (documento EDITAL/EDITAL_RETIFICADO da licitação). */
  async arquivoDaVersao(licitacaoId: string, documentoId: string): Promise<{ bytes: Buffer; nome: string; status: string }> {
    const [d] = await this.dataSource.query(
      `SELECT caminho_arquivo, nome_original, versao, status::text AS status FROM documentos_licitacao
        WHERE id::text = $1 AND licitacao_id::text = $2 AND tipo::text IN ('EDITAL','EDITAL_RETIFICADO')`,
      [documentoId, licitacaoId],
    );
    if (!d) throw new NotFoundException('Versão do edital não encontrada');
    const caminho = this.resolverCaminho(d.caminho_arquivo);
    if (!caminho) throw new NotFoundException('Arquivo do edital não encontrado no servidor');
    return { bytes: readFileSync(caminho), nome: d.nome_original || `edital-v${d.versao}.pdf`, status: d.status };
  }

  /**
   * Anexa (ou troca) o edital ANTES da publicação. Depois dela → 409: a
   * alteração do edital é a retificação (art. 55 §1º).
   */
  async anexar(licitacaoId: string, arquivo: ArquivoEnviado, autor: { id?: string | null; nome?: string | null }): Promise<DocumentoLicitacao> {
    const [lic] = await this.dataSource.query(`SELECT id, fase::text AS fase, numero_processo FROM licitacoes WHERE id::text = $1`, [licitacaoId]);
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    if (!ehFaseInterna(lic.fase)) {
      throw new ConflictException(
        'Edital já publicado: a alteração do edital é feita pela RETIFICAÇÃO (art. 55, §1º, Lei 14.133/2021) — POST /publicacao/licitacao/:id/retificar.',
      );
    }
    const erro = motivoArquivoEditalInvalido(arquivo);
    if (erro) throw new BadRequestException(erro);
    return this.dataSource.transaction(async (m) => {
      await m.query(
        `UPDATE documentos_licitacao SET status = 'SUBSTITUIDO', updated_at = NOW()
          WHERE licitacao_id::text = $1 AND tipo::text IN ('EDITAL','EDITAL_RETIFICADO') AND status::text <> 'SUBSTITUIDO'`,
        [licitacaoId],
      );
      return this.gravarVersao(m, licitacaoId, arquivo, {
        tipo: TipoDocumentoLicitacao.EDITAL,
        versao: 1,
        anteriorId: null,
        status: StatusDocumento.RASCUNHO,
        titulo: `Edital — ${lic.numero_processo}`,
        autor,
      });
    });
  }

  /**
   * Grava o arquivo (pasta sensível `editais/<licitação>`; o acesso é pelas
   * rotas da publicação) e o registro da versão. Usado pelo anexo e pela
   * retificação (na transação do ato).
   */
  async gravarVersao(
    m: EntityManager,
    licitacaoId: string,
    arquivo: ArquivoEnviado,
    o: {
      tipo: TipoDocumentoLicitacao;
      versao: number;
      anteriorId: string | null;
      status: StatusDocumento;
      titulo: string;
      descricao?: string | null;
      autor: { id?: string | null; nome?: string | null };
    },
  ): Promise<DocumentoLicitacao> {
    const dir = join(diretorioDeGravacao('editais'), licitacaoId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const nomeArquivo = `edital-v${o.versao}-${randomUUID()}.pdf`;
    const caminho = join(dir, nomeArquivo);
    writeFileSync(caminho, arquivo.buffer);
    const hash = createHash('sha256').update(arquivo.buffer).digest('hex');
    const repo = m.getRepository(DocumentoLicitacao);
    const publicado = o.status === StatusDocumento.PUBLICADO;
    return repo.save(
      repo.create({
        licitacao_id: licitacaoId,
        tipo: o.tipo,
        titulo: o.titulo,
        descricao: o.descricao ?? undefined,
        nome_arquivo: nomeArquivo,
        nome_original: arquivo.originalname || nomeArquivo,
        caminho_arquivo: caminho,
        mime_type: 'application/pdf',
        tamanho_bytes: arquivo.buffer.length,
        hash_arquivo: hash,
        versao: o.versao,
        documento_anterior_id: o.anteriorId ?? undefined,
        status: o.status,
        publico: publicado,
        data_publicacao: publicado ? new Date() : undefined,
        usuario_upload_id: o.autor.id ?? undefined,
        usuario_upload_nome: o.autor.nome ?? undefined,
      } as any),
    ) as unknown as Promise<DocumentoLicitacao>;
  }

  private resolverCaminho(caminho: string | null | undefined): string | null {
    if (!caminho) return null;
    const candidatos = [
      caminho,
      isAbsolute(caminho) ? null : resolve(process.cwd(), caminho),
      resolverArquivoDeUrl(caminho),
    ].filter(Boolean) as string[];
    for (const c of candidatos) if (existsSync(c)) return c;
    return null;
  }
}
