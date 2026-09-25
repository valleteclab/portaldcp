import { copyFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'fs';
import { dirname } from 'path';
import {
  caminhoContido,
  caminhoLogicoDeUrl,
  diretorioPrivado,
  diretorioUploads,
  tipoPublico,
} from '../common/arquivos/arquivos';

/** DataSource, EntityManager ou QueryRunner. */
export interface ExecutorSql {
  query(sql: string, params?: unknown[]): Promise<any>;
}

export interface ResultadoMigracaoArquivos {
  registrosAnalisados: number;
  movidos: number;
  jaPrivados: number;
  naoEncontrados: number;
  donosRegistrados: number;
  caminhosNormalizados: number;
  anexosLicitacaoRecolocados: number;
}

/**
 * MIGRAÇÃO DOS ARQUIVOS SENSÍVEIS PARA O DIRETÓRIO PRIVADO (idempotente).
 *
 * 1. Documentos do REGISTRO CADASTRAL do fornecedor (`fornecedor_documentos`):
 *    o arquivo que está na pasta pública antiga (`<UPLOAD_DIR>/<tipo>/x` ou
 *    `<UPLOAD_DIR>/geral/x`, onde o upload genérico gravava quando o `tipo`
 *    chegava depois do arquivo) vai para `<privado>/<tipo>/x`; o dono (fornecedor
 *    do registro MAIS ANTIGO que cita o arquivo) é gravado em `arquivos_upload`.
 *    A URL no banco (`/api/uploads/<tipo>/x`) continua a mesma — é um
 *    identificador; a leitura procura primeiro no privado. Só se normaliza a
 *    URL que tenha ficado com parâmetros de assinatura.
 * 2. Anexos do edital enviados pelo upload genérico (tipo `licitacao`) que
 *    ficaram em `geral/`: recolocados em `<UPLOAD_DIR>/licitacao/` (onde o
 *    `documentos_licitacao.caminho_arquivo` já aponta).
 *
 * Nunca apaga registro, nunca sobrescreve arquivo existente no destino.
 */
export async function migrarArquivosPrivados(ds: ExecutorSql): Promise<ResultadoMigracaoArquivos> {
  const r: ResultadoMigracaoArquivos = {
    registrosAnalisados: 0,
    movidos: 0,
    jaPrivados: 0,
    naoEncontrados: 0,
    donosRegistrados: 0,
    caminhosNormalizados: 0,
    anexosLicitacaoRecolocados: 0,
  };
  const publico = diretorioUploads();
  const privado = diretorioPrivado();

  const docs: Array<{ id: string; fornecedor_id: string; caminho_arquivo: string; nome_arquivo: string | null }> = await ds.query(
    `SELECT id, fornecedor_id, caminho_arquivo, nome_arquivo FROM fornecedor_documentos
      WHERE caminho_arquivo IS NOT NULL AND caminho_arquivo <> '' ORDER BY created_at ASC`,
  );
  for (const d of docs) {
    const c = caminhoLogicoDeUrl(d.caminho_arquivo);
    if (!c || tipoPublico(c.tipo)) continue;
    r.registrosAnalisados++;

    const destino = caminhoContido(privado, c.rel);
    if (!destino) continue;
    if (existsSync(destino)) {
      r.jaPrivados++;
    } else {
      const candidatos = [c.rel];
      if (c.subpastas.length === 0 && c.tipo !== 'geral') candidatos.push(`geral/${c.nome}`);
      const origem = candidatos.map((rel) => caminhoContido(publico, rel)).find((p): p is string => !!p && existsSync(p));
      if (origem) {
        mkdirSync(dirname(destino), { recursive: true });
        mover(origem, destino);
        r.movidos++;
      } else {
        r.naoEncontrados++;
      }
    }

    const ins = await ds.query(
      `INSERT INTO arquivos_upload (caminho, tipo, privado, nome_original, enviado_por_tipo, fornecedor_id)
       VALUES ($1, $2, true, $3, 'MIGRACAO', $4)
       ON CONFLICT (caminho) DO NOTHING RETURNING id`,
      [c.rel, c.tipo, d.nome_arquivo ? String(d.nome_arquivo).slice(0, 255) : null, d.fornecedor_id],
    );
    if (ins.length) r.donosRegistrados++;

    if (/[?&](expira|assinatura)=/.test(d.caminho_arquivo)) {
      await ds.query(`UPDATE fornecedor_documentos SET caminho_arquivo = $2 WHERE id = $1`, [d.id, `/api/uploads/${c.rel}`]);
      r.caminhosNormalizados++;
    }
  }

  // 2. anexos do edital (upload genérico `licitacao`) parados em geral/
  const anexos: Array<{ caminho_arquivo: string; nome_arquivo: string }> = await ds.query(
    `SELECT caminho_arquivo, nome_arquivo FROM documentos_licitacao
      WHERE caminho_arquivo IS NOT NULL AND nome_arquivo IS NOT NULL`,
  );
  for (const a of anexos) {
    const c = caminhoLogicoDeUrl(a.caminho_arquivo);
    if (!c || c.tipo !== 'licitacao' || c.subpastas.length) continue;
    const destino = caminhoContido(publico, c.rel);
    const origem = caminhoContido(publico, `geral/${c.nome}`);
    if (!destino || !origem || existsSync(destino) || !existsSync(origem)) continue;
    mkdirSync(dirname(destino), { recursive: true });
    mover(origem, destino);
    r.anexosLicitacaoRecolocados++;
  }

  return r;
}

export function houveMudancaArquivos(r: ResultadoMigracaoArquivos): boolean {
  return r.movidos + r.donosRegistrados + r.caminhosNormalizados + r.anexosLicitacaoRecolocados > 0;
}

export function resumoMigracaoArquivos(r: ResultadoMigracaoArquivos): string {
  return (
    `${r.registrosAnalisados} documento(s) do registro cadastral analisado(s); ${r.movidos} movido(s) para o privado, ` +
    `${r.jaPrivados} já no privado, ${r.naoEncontrados} sem arquivo em disco; ${r.donosRegistrados} dono(s) registrado(s); ` +
    `${r.caminhosNormalizados} URL(s) normalizada(s); ${r.anexosLicitacaoRecolocados} anexo(s) do edital recolocado(s)`
  );
}

function mover(origem: string, destino: string): void {
  try {
    renameSync(origem, destino);
  } catch (e: any) {
    if (e?.code !== 'EXDEV') throw e;
    // volumes diferentes (UPLOAD_PRIVATE_DIR em outro volume Docker)
    copyFileSync(origem, destino);
    unlinkSync(origem);
  }
}
