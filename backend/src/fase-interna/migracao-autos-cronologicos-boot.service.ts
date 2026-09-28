import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { executarMigracaoDeBoot } from '../common/migracao-boot';
import { diretorioDeGravacao } from '../common/arquivos/arquivos';
import { FASES_INTERNAS } from '../licitacoes/transicoes/fases';
import { pecaContaComoPronta } from './peca-regras';
import {
  COLUNAS_DESPACHO_ETAPA_JUNTADA,
  COLUNAS_PECA_JUNTADA,
  COLUNAS_TRAMITACAO_JUNTADA,
  DadosJuntada,
  dadosJuntadaDaPeca,
  dadosJuntadaDoDespacho,
  dadosJuntadaDoDespachoDeEtapa,
  gravarJuntada,
} from './folhas-autos';
import { FonteJuntada, JuntadaAutosService, caminhoFisicoDeReferencia } from './juntada-autos.service';
import {
  REGIME_CRONOLOGICO,
  REGIME_LEGADO,
  momentoDaJuntadaDaPeca,
  pecaAnexada,
  planoDeRenumeracao,
  rotuloFolhas,
  vagaDaPeca,
} from '../licitacoes/autos/juntadas-regras';

/**
 * AUTOS EM ORDEM CRONOLÓGICA — DADOS EXISTENTES (decisão do dono de
 * 27/09/2026). Roda uma vez por processo que ainda não tem livro de juntadas:
 *
 *  - Processo AINDA NA FASE INTERNA: as folhas são recalculadas UMA vez pela
 *    ordem cronológica de juntada (anexo → quando foi anexado; peça do
 *    sistema → a emissão; assinada → a última assinatura; despachos → o
 *    registro), inclusive as versões substituídas (continuam nos autos). As
 *    folhas novas passam a ser as definitivas (tela = PDF). O antes e o depois
 *    ficam em `autos_processo.detalhe` e no histórico do processo
 *    (AUTOS_RENUMERADOS).
 *  - Processo JÁ PUBLICADO que teve autos na regra anterior (folhas gravadas ou
 *    montagem guardada): NÃO muda — fica no regime LOGICO_LEGADO (autos na
 *    ordem lógica, como já saíram), com o motivo registrado. Os autos de um
 *    processo publicado não são refeitos sem registro.
 *  - Processo publicado sem nenhum autos anterior: cronológico (nada a mudar).
 *
 * Idempotente (só processos sem `autos_processo` e sem juntadas); cada
 * processo numa transação própria; falha é logada e o processo fica para o
 * próximo boot. Desligar: AUTOS_CRONOLOGICOS_NO_BOOT=false.
 */
@Injectable()
export class MigracaoAutosCronologicosBootService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigracaoAutosCronologicosBootService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly juntada: JuntadaAutosService,
  ) {}

  onApplicationBootstrap(): Promise<void> {
    return executarMigracaoDeBoot(this.ds, () => this.executarMigracao())
      .then(() => undefined)
      .finally(() => this.juntada.liberar());
  }

  async executarMigracao(): Promise<{ legados: number; renumerados: number; cronologicos: number }> {
    const r = { legados: 0, renumerados: 0, cronologicos: 0 };
    if (process.env.AUTOS_CRONOLOGICOS_NO_BOOT === 'false') return r;
    let candidatos: Array<{ id: string; fase: string; numero_processo: string | null; tem_folhas: boolean }> = [];
    try {
      candidatos = await this.ds.query(
        `SELECT l.id::text AS id, l.fase::text AS fase, l.numero_processo,
                (EXISTS (SELECT 1 FROM documentos_fase_interna d WHERE d.licitacao_id::text = l.id::text AND d.folha_inicial IS NOT NULL)
                 OR EXISTS (SELECT 1 FROM tramitacoes_processo t WHERE t.licitacao_id::text = l.id::text AND t.folha_inicial IS NOT NULL)
                 OR EXISTS (SELECT 1 FROM despachos_fase_interna e WHERE e.licitacao_id::text = l.id::text AND e.folha_inicial IS NOT NULL)) AS tem_folhas
           FROM licitacoes l
          WHERE NOT EXISTS (SELECT 1 FROM autos_processo a WHERE a.licitacao_id::text = l.id::text)
            AND NOT EXISTS (SELECT 1 FROM juntadas_autos j WHERE j.licitacao_id::text = l.id::text)
          ORDER BY l.created_at ASC`,
      );
    } catch (e: any) {
      this.logger.error(`Autos cronológicos: migração não executada — ${e?.message ?? e}`);
      return r;
    }
    for (const c of candidatos) {
      try {
        if (!FASES_INTERNAS.includes(c.fase as any)) {
          if (c.tem_folhas || this.temMontagemAnterior(c.id)) {
            await this.registrarRegime(c.id, REGIME_LEGADO, 'Processo já publicado antes da regra dos autos em ordem cronológica (27/09/2026): os autos continuam na ordem lógica, com as folhas já atribuídas — não são refeitos.', { fase: c.fase });
            r.legados++;
          } else {
            await this.registrarRegime(c.id, REGIME_CRONOLOGICO, 'Processo publicado sem autos anteriores: autos na ordem cronológica de juntada.', { fase: c.fase });
            r.cronologicos++;
          }
          continue;
        }
        if (!c.tem_folhas && !(await this.temPecaPronta(c.id))) {
          await this.registrarRegime(c.id, REGIME_CRONOLOGICO, 'Processo na fase interna sem juntadas anteriores: autos na ordem cronológica de juntada.', { fase: c.fase });
          r.cronologicos++;
          continue;
        }
        if (await this.renumerar(c.id)) r.renumerados++;
      } catch (e: any) {
        this.logger.warn(`Autos cronológicos: processo ${c.numero_processo ?? c.id} não migrado (fica para o próximo boot) — ${e?.message ?? e}`);
      }
    }
    if (r.legados || r.renumerados) {
      this.logger.log(`Autos cronológicos: ${r.renumerados} processo(s) com folhas recalculadas pela juntada; ${r.legados} publicado(s) mantido(s) na regra anterior`);
    }
    return r;
  }

  /** Há montagem dos autos guardada na regra anterior (meta sem `regime`)? */
  private temMontagemAnterior(licitacaoId: string): boolean {
    try {
      const dir = path.join(diretorioDeGravacao('licitacoes'), licitacaoId, 'autos');
      if (!fs.existsSync(dir)) return false;
      return fs
        .readdirSync(dir)
        .filter((f) => /^autos-.*\.json$/.test(f))
        .some((f) => {
          try {
            return !JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))?.regime;
          } catch {
            return true;
          }
        });
    } catch {
      return false;
    }
  }

  private async temPecaPronta(licitacaoId: string): Promise<boolean> {
    const docs: any[] = await this.ds.query(
      `SELECT ${COLUNAS_PECA_JUNTADA} FROM documentos_fase_interna WHERE licitacao_id::text = $1 AND versao_atual = true AND status::text <> 'SUBSTITUIDO'`,
      [licitacaoId],
    );
    return docs.some((d) => !d.dados_estruturados?.nao_se_aplica && pecaContaComoPronta(d));
  }

  private async registrarRegime(licitacaoId: string, regime: string, motivo: string, detalhe: unknown, m: Pick<DataSource, 'query'> = this.ds) {
    await m.query(
      `INSERT INTO autos_processo (licitacao_id, regime, definido_em, motivo, detalhe) VALUES ($1::uuid, $2, now(), $3, $4::jsonb)
       ON CONFLICT (licitacao_id) DO NOTHING`,
      [licitacaoId, regime, motivo, JSON.stringify(detalhe ?? null)],
    );
  }

  /**
   * Recalcula as folhas do processo na fase interna pela ordem cronológica de
   * juntada e grava o livro de juntadas (uma vez). Os arquivos são preparados
   * antes (cópias dos PDFs gerados); a gravação é uma transação só.
   */
  async renumerar(licitacaoId: string): Promise<boolean> {
    type Item = { chave_item: string; momento: Date | null; folha_atual: number | null; paginas: number; dados: DadosJuntada; alvo: { tabela: string; id: string } | null; titulo_antes: string };
    const itens: Item[] = [];
    const copias: string[] = [];
    const preparar = async (fonte: FonteJuntada) => {
      const a = await this.juntada.materializar(licitacaoId, fonte);
      if (a.copia) copias.push(a.copia);
      return a;
    };
    try {
      // ── Peças (todas as versões que já tiveram folha + as prontas ainda sem folha)
      const docs: any[] = await this.ds.query(`SELECT ${COLUNAS_PECA_JUNTADA} FROM documentos_fase_interna WHERE licitacao_id::text = $1 ORDER BY created_at ASC`, [
        licitacaoId,
      ]);
      const pp = docs.find((d) => d.tipo === 'PP' && d.versao_atual);
      for (const d of docs) {
        const dados = d.dados_estruturados ?? {};
        const ativa = d.versao_atual && d.status !== 'SUBSTITUIDO';
        const pronta = ativa && !dados?.nao_se_aplica && pecaContaComoPronta(d);
        const juntada = d.folha_inicial != null;
        if (!juntada && !pronta) continue;
        let fonte = this.juntada.fonteDaPeca(d, pp);
        // Juntada antiga de peça do sistema (já editada depois): o PDF gerado é o que foi juntado
        if (!pronta && fonte?.tipo === 'MATERIALIZAR_PECA') {
          const gerado = caminhoFisicoDeReferencia(d.arquivo_pdf_path);
          fonte = gerado ? { tipo: 'COPIAR', caminho: gerado } : null;
        }
        if (!fonte) continue;
        const a = await preparar(fonte);
        const base = dadosJuntadaDaPeca(d);
        const anexadaOuAssinada = pecaAnexada(d) || d.status === 'ASSINADO';
        const conteudo = pronta || anexadaOuAssinada ? base.conteudo : `txt:${dados?._emitido?.impressao ?? `migrado:${d.id}`}`;
        itens.push({
          chave_item: `doc:${d.id}`,
          momento: momentoDaJuntadaDaPeca(d),
          folha_atual: d.folha_inicial ?? null,
          paginas: a.paginas,
          dados: { ...base, conteudo, arquivo: a.ref, hash_arquivo: a.hash, juntado_por_nome: dados?._emitido?.por_nome ?? null, renumerada: true },
          alvo: { tabela: 'documentos_fase_interna', id: d.id },
          titulo_antes: `${base.titulo} v${d.versao ?? 1}`,
        });
        if (d.tipo === 'PP' && ativa && dados?.certidao?.path) {
          const certidao = caminhoFisicoDeReferencia(dados.certidao.path);
          if (certidao && certidao.toLowerCase().endsWith('.pdf')) {
            const c = await preparar({ tipo: 'COPIAR', caminho: certidao });
            const em = dados.certidao.gerada_em ? new Date(dados.certidao.gerada_em) : momentoDaJuntadaDaPeca(d);
            itens.push({
              chave_item: `certidao:${d.id}`,
              momento: em,
              folha_atual: (d.folha_final ?? 0) + 0.5,
              paginas: c.paginas,
              dados: {
                natureza: 'PECA',
                vaga: vagaDaPeca('PP_CERTIDAO'),
                chave: 'PP_CERTIDAO',
                titulo: 'Certidão da pesquisa de preços',
                origem: 'GERADA',
                conteudo: `certidao:${dados.certidao.path}:${dados.certidao.gerada_em ?? ''}`,
                arquivo: c.ref,
                hash_arquivo: c.hash,
                data_documento: em,
                signatarios: dados.responsavel_pesquisa?.nome ? [dados.responsavel_pesquisa.nome] : [],
                renumerada: true,
              },
              alvo: null,
              titulo_antes: 'Certidão da pesquisa de preços',
            });
          }
        }
      }
      // ── Despachos de tramitação (folhas)
      const tramitacoes: any[] = await this.ds.query(
        `SELECT ${COLUNAS_TRAMITACAO_JUNTADA} FROM tramitacoes_processo WHERE licitacao_id::text = $1 AND despacho_arquivo IS NOT NULL ORDER BY sequencia ASC`,
        [licitacaoId],
      );
      for (const t of tramitacoes) {
        const arq = caminhoFisicoDeReferencia(t.despacho_arquivo);
        if (!arq) continue;
        const a = await preparar({ tipo: 'ORIGINAL', ref: t.despacho_arquivo, caminho: arq });
        itens.push({
          chave_item: `tram:${t.id}`,
          momento: t.data_envio ? new Date(t.data_envio) : null,
          folha_atual: t.folha_inicial ?? null,
          paginas: a.paginas,
          dados: { ...dadosJuntadaDoDespacho(t), hash_arquivo: a.hash, renumerada: true },
          alvo: { tabela: 'tramitacoes_processo', id: t.id },
          titulo_antes: `Despacho nº ${t.sequencia}`,
        });
      }
      // ── Despachos das etapas de registro
      const despachos: any[] = await this.ds.query(
        `SELECT ${COLUNAS_DESPACHO_ETAPA_JUNTADA} FROM despachos_fase_interna WHERE licitacao_id::text = $1 AND arquivo IS NOT NULL ORDER BY registrado_em ASC`,
        [licitacaoId],
      );
      for (const d of despachos) {
        const arq = caminhoFisicoDeReferencia(d.arquivo);
        if (!arq) continue;
        const a = await preparar({ tipo: 'ORIGINAL', ref: d.arquivo, caminho: arq });
        itens.push({
          chave_item: `desp:${d.id}`,
          momento: d.registrado_em ? new Date(d.registrado_em) : null,
          folha_atual: d.folha_inicial ?? null,
          paginas: a.paginas,
          dados: { ...dadosJuntadaDoDespachoDeEtapa(d), hash_arquivo: a.hash, renumerada: true },
          alvo: { tabela: 'despachos_fase_interna', id: d.id },
          titulo_antes: d.titulo,
        });
      }

      const plano = planoDeRenumeracao(itens);
      const antes = itens.filter((i) => i.folha_atual != null && Number.isInteger(i.folha_atual)).map((i) => ({ documento: i.titulo_antes, folha: i.folha_atual }));
      const depois = plano.map((p) => ({ documento: p.titulo_antes, folhas: rotuloFolhas(p.folha_inicial, p.folha_final) }));
      const feito = await this.ds.transaction(async (m) => {
        await m.query(`SELECT id FROM licitacoes WHERE id::text = $1 FOR UPDATE`, [licitacaoId]);
        const [ja] = await m.query(
          `SELECT 1 FROM autos_processo WHERE licitacao_id::text = $1 UNION ALL SELECT 1 FROM juntadas_autos WHERE licitacao_id::text = $1 LIMIT 1`,
          [licitacaoId],
        );
        if (ja) return false;
        for (const p of plano) {
          await gravarJuntada(m, licitacaoId, { ...p.dados, juntado_em: p.momento ?? new Date() }, p);
          if (!p.alvo) continue;
          const n = p.folha_final - p.folha_inicial + 1;
          if (p.alvo.tabela === 'documentos_fase_interna') {
            await m.query(`UPDATE documentos_fase_interna SET folha_inicial = $2, folha_final = $3, total_paginas = $4 WHERE id::text = $1`, [p.alvo.id, p.folha_inicial, p.folha_final, n]);
          } else if (p.alvo.tabela === 'tramitacoes_processo') {
            await m.query(`UPDATE tramitacoes_processo SET folha_inicial = $2, folha_final = $3, despacho_paginas = $4 WHERE id::text = $1`, [p.alvo.id, p.folha_inicial, p.folha_final, n]);
          } else {
            await m.query(`UPDATE despachos_fase_interna SET folha_inicial = $2, folha_final = $3, paginas = $4 WHERE id::text = $1`, [p.alvo.id, p.folha_inicial, p.folha_final, n]);
          }
        }
        const motivo =
          'Folhas recalculadas uma vez pela ordem cronológica de juntada (decisão de 27/09/2026 — Lei nº 9.784/1999, art. 22, §4º): processo ainda na fase interna; as versões substituídas continuam nos autos.';
        await this.registrarRegime(licitacaoId, REGIME_CRONOLOGICO, motivo, { antes, depois }, m);
        await m.query(
          `INSERT INTO logs_fase_interna (id, licitacao_id, acao, descricao, dados_antes, dados_depois, usuario_nome, created_at)
           VALUES (gen_random_uuid(), $1, 'AUTOS_RENUMERADOS', $2, $3::jsonb, $4::jsonb, 'Sistema (migração dos autos)', now())`,
          [licitacaoId, `Autos: ${motivo}`, JSON.stringify({ folhas: antes }), JSON.stringify({ folhas: depois })],
        );
        return true;
      });
      if (!feito) for (const c of copias) fs.promises.unlink(c).catch(() => undefined);
      return feito;
    } catch (e) {
      for (const c of copias) fs.promises.unlink(c).catch(() => undefined);
      throw e;
    }
  }
}
