import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';
import { basesDeLeitura, caminhoContido, diretorioDeGravacao, resolverArquivoDeUrl } from '../common/arquivos/arquivos';
import { GeradorDocumentoService } from './gerador-documento.service';
import { TarefasService } from './tarefas/tarefas.service';
import { ModeloFluxoService } from './fluxo/modelo-fluxo.service';
import { ehFaseInterna } from '../licitacoes/transicoes/fases';
import { pecaContaComoPronta, proximaFaixaDeFolhas } from './peca-regras';
import {
  COLUNAS_PECA_JUNTADA,
  DadosJuntada,
  contarPaginasPdf,
  dadosJuntadaDaPeca,
  gravarJuntada,
  regimeDosAutos,
  ultimaFolha,
} from './folhas-autos';
import { REGIME_CRONOLOGICO, momentoDaJuntadaDaPeca, ordenarPendencias, pecaAnexada, vagaDaPeca } from '../licitacoes/autos/juntadas-regras';

/** Pasta lógica das cópias juntadas (arquivo tal como juntado — não muda depois). */
const PASTA = 'licitacoes';

/** De onde vem o arquivo de uma juntada. */
export type FonteJuntada =
  /** O próprio arquivo, imutável (peça anexada, via assinada): a juntada aponta para ele. */
  | { tipo: 'ORIGINAL'; ref: string; caminho: string }
  /** Arquivo que pode ser regravado depois (PDF gerado, mapa, certidão, documento externo): copiado na juntada. */
  | { tipo: 'COPIAR'; caminho: string }
  /** Peça feita no sistema sem PDF atual: o PDF é materializado (sem mexer na peça) e copiado. */
  | { tipo: 'MATERIALIZAR_PECA'; documento_id: string }
  /** Documento gerado na hora (termos, ata): o PDF gerado é a cópia juntada. */
  | { tipo: 'GERAR'; gerar: () => Promise<Buffer> };

/** Documento a juntar nos autos (peça pronta ainda não juntada, termo, documento da fase externa). */
export interface ItemJuntavel {
  dados: Omit<DadosJuntada, 'arquivo' | 'hash_arquivo'>;
  /** Quando o documento nasceu/foi emitido (ordem das juntadas de uma mesma rodada). */
  momento: Date | null;
  fonte: FonteJuntada;
}

/** Caminho físico de uma referência gravada (URL lógica, caminho relativo às bases ou absoluto contido nelas). */
export function caminhoFisicoDeReferencia(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const porUrl = resolverArquivoDeUrl(ref);
  if (porUrl && fs.existsSync(porUrl)) return porUrl;
  const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
  const bases = [...basesDeLeitura(), path.resolve(uploadDir), path.resolve(process.cwd(), 'uploads')];
  if (path.isAbsolute(ref) && fs.existsSync(ref)) {
    const abs = path.resolve(ref);
    if (bases.some((b) => !path.relative(b, abs).startsWith('..'))) return abs;
  }
  for (const base of bases) {
    const c = caminhoContido(base, ref);
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * JUNTADA NOS AUTOS (decisão do dono de 27/09/2026 — autos na ordem
 * cronológica de juntada, folha definitiva):
 *
 *  - peça ANEXADA, via ASSINADA e DESPACHOS são juntados no próprio ato
 *    (`folhas-autos.ts`, dentro da transação do ato);
 *  - peça FEITA NO SISTEMA é juntada quando fica pronta (emitida/aprovada):
 *    rotina da fila do processo, depois do commit e depois das demais rotinas
 *    (o envio ao fluxo de aprovação vem antes) — antes do envio automático da
 *    tramitação, que vem depois da sincronização; o PDF é copiado na juntada;
 *  - documentos da FASE EXTERNA e TERMOS dos autos (justificativas, registro
 *    das publicações) são juntados quando os autos são montados.
 * Cada processo junta uma coisa por vez (fila por processo); a juntada
 * confere de novo, com a licitação travada, que o conteúdo ainda não está no
 * livro — nunca junta duas vezes o mesmo.
 */
@Injectable()
export class JuntadaAutosService {
  private readonly logger = new Logger(JuntadaAutosService.name);
  private readonly filas = new Map<string, Promise<unknown>>();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly gerador: GeradorDocumentoService,
    @Optional() tarefas?: TarefasService,
    @Optional() private readonly modeloFluxo?: ModeloFluxoService,
  ) {
    // Na fila do processo (sincronização): antes da liberação, nada (a migração de boot vem antes)
    tarefas?.registrarAntesDeSincronizar((id) => (this.liberada ? this.juntarPendentes(id) : Promise.resolve(0)), { porUltimo: true });
  }

  ativo(): boolean {
    return process.env.AUTOS_JUNTADA_AUTOMATICA !== 'false';
  }

  /**
   * A juntada automática só começa DEPOIS da migração de boot dos autos (senão
   * a sincronização das tarefas no boot juntaria peças de processo que ainda
   * vai ser migrado — ou mantido na regra anterior).
   */
  private liberada = false;
  private aoLiberar: () => void = () => undefined;
  private readonly liberacao = new Promise<void>((ok) => (this.aoLiberar = ok));

  estaLiberada(): boolean {
    return this.liberada;
  }

  liberar(): void {
    this.liberada = true;
    this.aoLiberar();
  }

  // ==========================================================================
  // Leitura
  // ==========================================================================

  /** Linhas do livro de juntadas, na ordem das folhas. */
  async juntadas(licitacaoId: string): Promise<any[]> {
    return this.ds.query(
      `SELECT id::text AS id, folha_inicial, folha_final, paginas, natureza, vaga, chave, titulo, origem, versao,
              documento_id::text AS documento_id, tramitacao_id::text AS tramitacao_id, despacho_etapa_id::text AS despacho_etapa_id,
              conteudo, arquivo, hash_arquivo, data_documento, signatarios, observacao, juntado_em, juntado_por_nome,
              substituida_por_id::text AS substituida_por_id, substituida_em, cancelada_em, motivo_cancelamento, renumerada
         FROM juntadas_autos WHERE licitacao_id::text = $1 ORDER BY folha_inicial ASC`,
      [licitacaoId],
    );
  }

  /** Peças prontas cujo conteúdo atual ainda não está juntado (nenhuma gravação). */
  async pecasPendentes(licitacaoId: string): Promise<ItemJuntavel[]> {
    const docs: any[] = await this.ds.query(
      `SELECT ${COLUNAS_PECA_JUNTADA} FROM documentos_fase_interna
        WHERE licitacao_id::text = $1 AND versao_atual = true AND status::text <> 'SUBSTITUIDO'
        ORDER BY created_at ASC`,
      [licitacaoId],
    );
    if (!docs.length) return [];
    const livro: Array<{ documento_id: string | null; vaga: string; conteudo: string }> = await this.ds.query(
      `SELECT documento_id::text AS documento_id, vaga, conteudo FROM juntadas_autos WHERE licitacao_id::text = $1 AND cancelada_em IS NULL`,
      [licitacaoId],
    );
    const juntado = (docId: string | null, vaga: string, conteudo: string) =>
      livro.some((l) => l.conteudo === conteudo && (docId ? l.documento_id === docId : l.vaga === vaga));
    const pp = docs.find((d) => d.tipo === 'PP');
    const comAprovacao = await this.tiposComAprovacaoInterna(licitacaoId);
    const itens: ItemJuntavel[] = [];
    for (const d of docs) {
      const dados = d.dados_estruturados ?? {};
      if (dados?.nao_se_aplica) continue;
      if (!pecaContaComoPronta(d)) continue;
      // Etapa com aprovação interna: a peça feita no sistema só é ato (e só é juntada) aprovada ou assinada
      if (comAprovacao.has(d.tipo) && !pecaAnexada(d) && !['APROVADO', 'ASSINADO'].includes(d.status)) continue;
      const base = dadosJuntadaDaPeca(d);
      const emitidoPor = dados?._emitido?.por_nome ?? null;
      const momento = momentoDaJuntadaDaPeca(d);
      if (!juntado(d.id, base.vaga, base.conteudo)) {
        const fonte = this.fonteDaPeca(d, pp);
        if (fonte) itens.push({ dados: { ...base, juntado_por_nome: emitidoPor }, momento, fonte });
      }
      // Pesquisa de preços: a CERTIDÃO (art. 23) é juntada logo depois do mapa
      if (d.tipo === 'PP' && dados?.certidao?.path) {
        const certidao = caminhoFisicoDeReferencia(dados.certidao.path);
        const conteudo = `certidao:${dados.certidao.path}:${dados.certidao.gerada_em ?? ''}`;
        if (certidao && certidao.toLowerCase().endsWith('.pdf') && !juntado(null, vagaDaPeca('PP_CERTIDAO'), conteudo)) {
          const em = dados.certidao.gerada_em ? new Date(dados.certidao.gerada_em) : momento;
          itens.push({
            dados: {
              natureza: 'PECA',
              vaga: vagaDaPeca('PP_CERTIDAO'),
              chave: 'PP_CERTIDAO',
              titulo: 'Certidão da pesquisa de preços',
              origem: 'GERADA',
              conteudo,
              data_documento: em,
              signatarios: dados.responsavel_pesquisa?.nome ? [dados.responsavel_pesquisa.nome] : [],
            },
            // depois do mapa, mesmo com a certidão gerada no mesmo instante
            momento: em && momento && em.getTime() <= momento.getTime() ? new Date(momento.getTime() + 1) : em,
            fonte: { tipo: 'COPIAR', caminho: certidao },
          });
        }
      }
    }
    return itens;
  }

  /** Tipos de peça com "aprovação interna" ligada no modelo de fluxo (só na fase interna). */
  private async tiposComAprovacaoInterna(licitacaoId: string): Promise<Set<string>> {
    if (!this.modeloFluxo) return new Set();
    try {
      const [l] = await this.ds.query(`SELECT orgao_id::text AS orgao_id, modalidade::text AS modalidade, fase::text AS fase FROM licitacoes WHERE id::text = $1`, [licitacaoId]);
      if (!l?.orgao_id || !ehFaseInterna(l.fase)) return new Set();
      return new Set((await this.modeloFluxo.operacionalDoProcesso(l.orgao_id, l.modalidade)).tipos_com_aprovacao);
    } catch {
      return new Set();
    }
  }

  /** O arquivo da peça tal como deve ser juntado (null: nada a juntar ainda). */
  fonteDaPeca(d: any, pp: any): FonteJuntada | null {
    const anexada = pecaAnexada(d);
    if (anexada || d.status === 'ASSINADO') {
      const proprio = caminhoFisicoDeReferencia(d.caminho_arquivo);
      if (proprio) return { tipo: 'ORIGINAL', ref: d.caminho_arquivo, caminho: proprio };
      if (anexada) return null; // registro sem arquivo (ex.: Diário Oficial sem a página) — vai no registro das publicações
    }
    const gerado = caminhoFisicoDeReferencia(d.arquivo_pdf_path);
    if (['PP', 'MCP'].includes(d.tipo)) {
      if (!gerado) return null;
      // o mapa já está na pesquisa (mesmo arquivo)
      if (d.tipo === 'MCP' && pp?.arquivo_pdf_path && caminhoFisicoDeReferencia(pp.arquivo_pdf_path) === gerado) return null;
      return { tipo: 'COPIAR', caminho: gerado };
    }
    const fresco = gerado && d.data_geracao_arquivo && new Date(d.updated_at).getTime() <= new Date(d.data_geracao_arquivo).getTime() + 5_000;
    return fresco ? { tipo: 'COPIAR', caminho: gerado! } : { tipo: 'MATERIALIZAR_PECA', documento_id: d.id };
  }

  /** Pendências (peças + itens dados), sem gravar nada — a impressão dos autos inclui estas chaves. */
  async pendencias(licitacaoId: string, extras: ItemJuntavel[] = []): Promise<ItemJuntavel[]> {
    if ((await regimeDosAutos(this.ds, licitacaoId)) !== REGIME_CRONOLOGICO) return [];
    const livro: Array<{ vaga: string; conteudo: string }> = extras.length
      ? await this.ds.query(`SELECT vaga, conteudo FROM juntadas_autos WHERE licitacao_id::text = $1 AND cancelada_em IS NULL`, [licitacaoId])
      : [];
    const externas = extras.filter((e) => !livro.some((l) => l.vaga === e.dados.vaga && l.conteudo === e.dados.conteudo));
    return ordenarPendencias([...(await this.pecasPendentes(licitacaoId)), ...externas].map((i) => ({ ...i, chave: i.dados.chave }))).map(
      ({ chave: _c, ...i }) => i,
    );
  }

  // ==========================================================================
  // Juntada
  // ==========================================================================

  /** Fila por processo: uma juntada de cada vez. */
  private naFila<T>(licitacaoId: string, fn: () => Promise<T>): Promise<T> {
    const anterior = this.filas.get(licitacaoId) ?? Promise.resolve();
    const vez = anterior.catch(() => undefined).then(fn);
    const fim = vez.catch(() => undefined);
    this.filas.set(licitacaoId, fim);
    fim.finally(() => {
      if (this.filas.get(licitacaoId) === fim) this.filas.delete(licitacaoId);
    });
    return vez;
  }

  /**
   * Junta o que estiver pendente (peças prontas + itens dados), na ordem do
   * momento de cada documento. Devolve quantas juntadas foram feitas. Nunca
   * lança: falha de um item é registrada no log e ele fica para a próxima.
   */
  juntarPendentes(licitacaoId: string, extras: ItemJuntavel[] = []): Promise<number> {
    if (!this.ativo()) return Promise.resolve(0);
    return this.naFila(licitacaoId, async () => {
      await this.liberacao;
      const [lic] = await this.ds.query(`SELECT id FROM licitacoes WHERE id::text = $1`, [licitacaoId]).catch(() => []);
      if (!lic) return 0;
      let feitas = 0;
      for (const item of await this.pendencias(licitacaoId, extras)) {
        try {
          if (await this.juntar(licitacaoId, item)) feitas++;
        } catch (e: any) {
          this.logger.warn(`[autos] "${item.dados.titulo}" não juntado no processo ${licitacaoId}: ${e?.message ?? e}`);
        }
      }
      return feitas;
    });
  }

  /** Materializa o arquivo, trava a licitação, confere de novo e grava a juntada (+ folhas na peça). */
  private async juntar(licitacaoId: string, item: ItemJuntavel): Promise<boolean> {
    const arquivo = await this.materializar(licitacaoId, item.fonte);
    try {
      const gravou = await this.ds.transaction(async (m) => {
        await m.query(`SELECT id FROM licitacoes WHERE id::text = $1 FOR UPDATE`, [licitacaoId]);
        const d = item.dados;
        const [ja] = d.documento_id
          ? await m.query(`SELECT 1 FROM juntadas_autos WHERE documento_id::text = $1 AND conteudo = $2 AND cancelada_em IS NULL LIMIT 1`, [d.documento_id, d.conteudo])
          : await m.query(`SELECT 1 FROM juntadas_autos WHERE licitacao_id::text = $1 AND vaga = $2 AND conteudo = $3 AND cancelada_em IS NULL LIMIT 1`, [
              licitacaoId,
              d.vaga,
              d.conteudo,
            ]);
        if (ja) return false;
        if (d.documento_id) {
          // a peça mudou enquanto o arquivo era preparado → fica para a próxima rodada
          const [atual] = await m.query(`SELECT ${COLUNAS_PECA_JUNTADA} FROM documentos_fase_interna WHERE id::text = $1`, [d.documento_id]);
          if (!atual || !atual.versao_atual || !pecaContaComoPronta(atual) || dadosJuntadaDaPeca(atual).conteudo !== d.conteudo) return false;
        }
        const faixa = proximaFaixaDeFolhas(await ultimaFolha(m, licitacaoId), arquivo.paginas);
        await gravarJuntada(m, licitacaoId, { ...d, arquivo: arquivo.ref, hash_arquivo: arquivo.hash }, faixa);
        if (d.documento_id) {
          await m.query(`UPDATE documentos_fase_interna SET folha_inicial = $2, folha_final = $3, total_paginas = $4 WHERE id::text = $1`, [
            d.documento_id,
            faixa.folha_inicial,
            faixa.folha_final,
            arquivo.paginas,
          ]);
        }
        return true;
      });
      if (!gravou && arquivo.copia) fs.promises.unlink(arquivo.copia).catch(() => undefined);
      return gravou;
    } catch (e) {
      if (arquivo.copia) fs.promises.unlink(arquivo.copia).catch(() => undefined);
      throw e;
    }
  }

  /** Arquivo da juntada: o original (imutável) ou uma cópia em `licitacoes/<id>/autos/juntadas/`. */
  async materializar(licitacaoId: string, fonte: FonteJuntada): Promise<{ ref: string; hash: string | null; paginas: number; copia: string | null }> {
    if (fonte.tipo === 'ORIGINAL') {
      const buffer = await fs.promises.readFile(fonte.caminho);
      return { ref: fonte.ref, hash: createHash('sha256').update(buffer).digest('hex'), paginas: Math.max(1, await contarPaginasPdf(buffer)), copia: null };
    }
    const nome = `${randomUUID()}.pdf`;
    const dir = path.join(diretorioDeGravacao(PASTA), licitacaoId, 'autos', 'juntadas');
    await fs.promises.mkdir(dir, { recursive: true });
    const destino = path.join(dir, nome);
    if (fonte.tipo === 'COPIAR') await fs.promises.copyFile(fonte.caminho, destino);
    else if (fonte.tipo === 'MATERIALIZAR_PECA') await this.gerador.materializarPdf(fonte.documento_id, destino);
    else await fs.promises.writeFile(destino, await fonte.gerar());
    try {
      const buffer = await fs.promises.readFile(destino);
      const paginas = Math.max(1, await contarPaginasPdf(buffer));
      return { ref: `${PASTA}/${licitacaoId}/autos/juntadas/${nome}`, hash: createHash('sha256').update(buffer).digest('hex'), paginas, copia: destino };
    } catch (e) {
      fs.promises.unlink(destino).catch(() => undefined);
      throw e;
    }
  }
}
