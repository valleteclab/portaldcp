import { EntityManager } from 'typeorm';
import { PDFDocument } from 'pdf-lib';
import { proximaFaixaDeFolhas } from './peca-regras';
import { TITULO_DOCUMENTO } from './documentos-obrigatorios';
import {
  NaturezaJuntada,
  OrigemJuntada,
  REGIME_CRONOLOGICO,
  REGIME_LEGADO,
  RegimeAutos,
  chaveConteudoPeca,
  origemDaPeca,
  pecaAnexada,
  signatariosDaPeca,
  tituloDoDespachoDeTramitacao,
  vagaDaPeca,
  vagaDoDespacho,
  vagaDoDespachoDeEtapa,
} from '../licitacoes/autos/juntadas-regras';

/** Lê o PDF e devolve o nº de páginas (recusa arquivo que não abre como PDF). */
export async function contarPaginasPdf(buffer: Buffer): Promise<number> {
  const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
  return pdf.getPageCount();
}

type Consulta = Pick<EntityManager, 'query'>;

/**
 * Regime dos autos do processo: LOGICO_LEGADO só para o processo já publicado
 * antes da regra cronológica (migração de boot); o resto — inclusive todo
 * processo novo — é CRONOLOGICO (folha da juntada é definitiva).
 */
export async function regimeDosAutos(m: Consulta, licitacaoId: string): Promise<RegimeAutos> {
  const [r] = await m.query(`SELECT regime FROM autos_processo WHERE licitacao_id::text = $1`, [licitacaoId]);
  return r?.regime === REGIME_LEGADO ? REGIME_LEGADO : REGIME_CRONOLOGICO;
}

/**
 * Última folha já atribuída no processo: livro de juntadas (`juntadas_autos`),
 * peças (`documentos_fase_interna`), despachos de tramitação
 * (`tramitacoes_processo`) e despachos das etapas de registro
 * (`despachos_fase_interna`) — a MESMA sequência de folhas. `excluir`: o
 * próprio registro (regime legado).
 */
export async function ultimaFolha(
  m: Consulta,
  licitacaoId: string,
  excluir: { documentoId?: string; tramitacaoId?: string; despachoId?: string } = {},
): Promise<number | null> {
  const [{ ultima }] = await m.query(
    `SELECT GREATEST(
       (SELECT MAX(folha_final) FROM juntadas_autos WHERE licitacao_id::text = $1),
       (SELECT MAX(folha_final) FROM documentos_fase_interna WHERE licitacao_id::text = $1 AND id::text <> $2),
       (SELECT MAX(folha_final) FROM tramitacoes_processo WHERE licitacao_id::text = $1 AND id::text <> $3),
       (SELECT MAX(folha_final) FROM despachos_fase_interna WHERE licitacao_id::text = $1 AND id::text <> $4)
     ) AS ultima`,
    [licitacaoId, excluir.documentoId ?? '', excluir.tramitacaoId ?? '', excluir.despachoId ?? ''],
  );
  return ultima === null || ultima === undefined ? null : Number(ultima);
}

/** Dados de uma juntada no livro (`juntadas_autos`). */
export interface DadosJuntada {
  natureza: NaturezaJuntada;
  vaga: string;
  chave: string;
  titulo: string;
  origem: OrigemJuntada;
  conteudo: string;
  arquivo: string | null;
  hash_arquivo?: string | null;
  versao?: number | null;
  documento_id?: string | null;
  tramitacao_id?: string | null;
  despacho_etapa_id?: string | null;
  data_documento?: Date | string | null;
  signatarios?: string[];
  observacao?: string | null;
  juntado_por_nome?: string | null;
  juntado_em?: Date;
  renumerada?: boolean;
}

/**
 * Grava a juntada no livro com a faixa dada e marca a juntada anterior da
 * mesma vaga como SUBSTITUÍDA por esta (ela continua nos autos, anotada).
 * Chamar dentro de transação, com a licitação travada.
 */
export async function gravarJuntada(
  m: Consulta,
  licitacaoId: string,
  j: DadosJuntada,
  faixa: { folha_inicial: number; folha_final: number },
): Promise<string> {
  const paginas = faixa.folha_final - faixa.folha_inicial + 1;
  const juntadoEm = j.juntado_em ?? new Date();
  const [linha] = await m.query(
    `INSERT INTO juntadas_autos
       (id, licitacao_id, folha_inicial, folha_final, paginas, natureza, vaga, chave, titulo, origem, versao,
        documento_id, tramitacao_id, despacho_etapa_id, conteudo, arquivo, hash_arquivo, data_documento, signatarios,
        observacao, juntado_em, juntado_por_nome, renumerada, created_at)
     VALUES (gen_random_uuid(), $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11::uuid, $12::uuid, $13::uuid, $14, $15, $16, $17, $18::jsonb,
        $19, $20, $21, $22, now())
     RETURNING id::text AS id`,
    [
      licitacaoId,
      faixa.folha_inicial,
      faixa.folha_final,
      paginas,
      j.natureza,
      j.vaga.slice(0, 200),
      j.chave.slice(0, 60),
      String(j.titulo || j.chave).slice(0, 300),
      j.origem,
      j.versao ?? null,
      j.documento_id ?? null,
      j.tramitacao_id ?? null,
      j.despacho_etapa_id ?? null,
      j.conteudo.slice(0, 300),
      j.arquivo ?? null,
      j.hash_arquivo ?? null,
      j.data_documento ? new Date(j.data_documento) : null,
      JSON.stringify(j.signatarios ?? []),
      j.observacao ?? null,
      juntadoEm,
      j.juntado_por_nome ?? null,
      !!j.renumerada,
    ],
  );
  await m.query(
    `UPDATE juntadas_autos SET substituida_por_id = $3::uuid, substituida_em = $4
      WHERE licitacao_id::text = $1 AND vaga = $2 AND id::text <> $3 AND substituida_por_id IS NULL AND cancelada_em IS NULL`,
    [licitacaoId, j.vaga, linha.id, juntadoEm],
  );
  return linha.id;
}

/** Colunas da peça lidas para a juntada (mesma forma em todo lugar). */
export const COLUNAS_PECA_JUNTADA = `id::text AS id, tipo::text AS tipo, titulo, status::text AS status, origem::text AS origem, versao,
  caminho_arquivo, arquivo_pdf_path, hash_arquivo, data_documento, numero_peca, assinaturas, signatarios_informados,
  descricao, dados_estruturados, created_at, updated_at, data_importacao, data_geracao_arquivo, folha_inicial, folha_final, total_paginas, versao_atual`;

/** Juntada de uma PEÇA (fase interna/publicação): título, origem, conteúdo e signatários da própria peça. */
export function dadosJuntadaDaPeca(d: any, arquivo?: { ref: string | null; hash?: string | null }): DadosJuntada {
  const anexadaOuAssinada = pecaAnexada(d) || d.status === 'ASSINADO';
  return {
    natureza: 'PECA',
    vaga: vagaDaPeca(d.tipo),
    chave: d.tipo,
    titulo: (TITULO_DOCUMENTO as Record<string, string>)[d.tipo] ?? d.titulo ?? d.tipo,
    origem: origemDaPeca(d),
    conteudo: chaveConteudoPeca(d),
    arquivo: arquivo ? arquivo.ref : anexadaOuAssinada ? d.caminho_arquivo ?? null : null,
    hash_arquivo: arquivo?.hash ?? (anexadaOuAssinada ? d.hash_arquivo ?? null : null),
    versao: d.versao != null ? Number(d.versao) : null,
    documento_id: d.id,
    data_documento: d.data_documento ?? null,
    signatarios: signatariosDaPeca(d),
    observacao: d.numero_peca ? String(d.numero_peca).slice(0, 200) : null,
  };
}

/**
 * Atribui a PRÓXIMA faixa de folhas dos autos à peça (sequência por processo)
 * e — no regime cronológico — registra a JUNTADA no livro (a versão anterior
 * da mesma peça fica nos autos, anotada como substituída). Trava a linha da
 * licitação (FOR UPDATE) — chamar dentro de transação.
 */
export async function atribuirFolhas(m: EntityManager, licitacaoId: string, documentoId: string, paginas: number) {
  await m.query(`SELECT id FROM licitacoes WHERE id::text = $1 FOR UPDATE`, [licitacaoId]);
  const faixa = proximaFaixaDeFolhas(await ultimaFolha(m, licitacaoId, { documentoId }), paginas);
  await m.query(
    `UPDATE documentos_fase_interna SET folha_inicial = $2, folha_final = $3, total_paginas = $4 WHERE id::text = $1`,
    [documentoId, faixa.folha_inicial, faixa.folha_final, Math.max(1, Math.floor(paginas) || 1)],
  );
  if ((await regimeDosAutos(m, licitacaoId)) === REGIME_CRONOLOGICO) {
    const [d] = await m.query(`SELECT ${COLUNAS_PECA_JUNTADA} FROM documentos_fase_interna WHERE id::text = $1`, [documentoId]);
    if (d) await gravarJuntada(m, licitacaoId, dadosJuntadaDaPeca(d), faixa);
  }
  return faixa;
}

/**
 * Folhas do DESPACHO de uma tramitação (espinha): próxima faixa da sequência
 * do processo e, no regime cronológico, a juntada no livro. Trava a licitação
 * (FOR UPDATE) — chamar dentro de transação.
 */
export async function atribuirFolhasDespacho(m: EntityManager, licitacaoId: string, tramitacaoId: string, paginas: number) {
  await m.query(`SELECT id FROM licitacoes WHERE id::text = $1 FOR UPDATE`, [licitacaoId]);
  const faixa = proximaFaixaDeFolhas(await ultimaFolha(m, licitacaoId, { tramitacaoId }), paginas);
  await m.query(
    `UPDATE tramitacoes_processo SET folha_inicial = $2, folha_final = $3, despacho_paginas = $4 WHERE id::text = $1`,
    [tramitacaoId, faixa.folha_inicial, faixa.folha_final, Math.max(1, Math.floor(paginas) || 1)],
  );
  if ((await regimeDosAutos(m, licitacaoId)) === REGIME_CRONOLOGICO) {
    const [t] = await m.query(`SELECT ${COLUNAS_TRAMITACAO_JUNTADA} FROM tramitacoes_processo WHERE id::text = $1`, [tramitacaoId]);
    if (t) await gravarJuntada(m, licitacaoId, dadosJuntadaDoDespacho(t), faixa);
  }
  return faixa;
}

export const COLUNAS_TRAMITACAO_JUNTADA = `id::text AS id, sequencia, despacho_arquivo, despacho_hash, despacho_paginas, data_envio, data_ocorrencia,
  lancado_posteriormente, de_setor_nome, de_usuario_nome, para_setor_nome, para_usuario_nome, devolucao_de_id, despacho, folha_inicial, folha_final`;

export function dadosJuntadaDoDespacho(t: any): DadosJuntada {
  const ocorrido = t.data_ocorrencia ?? t.data_envio ?? null;
  return {
    natureza: 'DESPACHO_TRAMITACAO',
    vaga: vagaDoDespacho(t.id),
    chave: 'DESPACHO_TRAMITACAO',
    titulo: tituloDoDespachoDeTramitacao(t),
    origem: 'GERADA',
    conteudo: `despacho:${t.despacho_hash ?? t.despacho_arquivo ?? t.id}`,
    arquivo: t.despacho_arquivo ?? null,
    hash_arquivo: t.despacho_hash ?? null,
    tramitacao_id: t.id,
    data_documento: ocorrido,
    signatarios: t.de_usuario_nome ? [t.de_usuario_nome] : [],
    observacao: t.lancado_posteriormente ? 'Movimentação lançada posteriormente' : null,
    juntado_por_nome: t.de_usuario_nome ?? null,
  };
}

/**
 * Folhas do DESPACHO de uma etapa de registro (F3): próxima faixa da mesma
 * sequência e a juntada no livro. Trava a licitação (FOR UPDATE) — chamar
 * dentro de transação.
 */
export async function atribuirFolhasDespachoEtapa(m: EntityManager, licitacaoId: string, despachoId: string, paginas: number) {
  await m.query(`SELECT id FROM licitacoes WHERE id::text = $1 FOR UPDATE`, [licitacaoId]);
  const faixa = proximaFaixaDeFolhas(await ultimaFolha(m, licitacaoId, { despachoId }), paginas);
  await m.query(
    `UPDATE despachos_fase_interna SET folha_inicial = $2, folha_final = $3, paginas = $4 WHERE id::text = $1`,
    [despachoId, faixa.folha_inicial, faixa.folha_final, Math.max(1, Math.floor(paginas) || 1)],
  );
  if ((await regimeDosAutos(m, licitacaoId)) === REGIME_CRONOLOGICO) {
    const [d] = await m.query(`SELECT ${COLUNAS_DESPACHO_ETAPA_JUNTADA} FROM despachos_fase_interna WHERE id::text = $1`, [despachoId]);
    if (d) await gravarJuntada(m, licitacaoId, dadosJuntadaDoDespachoDeEtapa(d), faixa);
  }
  return faixa;
}

export const COLUNAS_DESPACHO_ETAPA_JUNTADA = `id::text AS id, etapa, titulo, arquivo, hash, paginas, registrado_em, autor_nome, autor_cargo, folha_inicial, folha_final`;

export function dadosJuntadaDoDespachoDeEtapa(d: any): DadosJuntada {
  return {
    natureza: 'DESPACHO_ETAPA',
    vaga: vagaDoDespachoDeEtapa(d.id),
    chave: 'DESPACHO_ETAPA',
    titulo: d.titulo,
    origem: 'GERADA',
    conteudo: `despacho-etapa:${d.hash ?? d.arquivo ?? d.id}`,
    arquivo: d.arquivo ?? null,
    hash_arquivo: d.hash ?? null,
    despacho_etapa_id: d.id,
    data_documento: d.registrado_em ?? null,
    signatarios: d.autor_nome ? [[d.autor_nome, d.autor_cargo].filter(Boolean).join(' — ')] : [],
    observacao: null,
    juntado_por_nome: d.autor_nome ?? null,
  };
}
