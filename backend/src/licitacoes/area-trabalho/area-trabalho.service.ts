import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FASES_AREA_DE_TRABALHO, ordenarPorUrgencia, proximaAcao, ResumoProcesso } from './regras-area-trabalho';

/**
 * ÁREA DE TRABALHO DO AGENTE DE CONTRATAÇÃO / PREGOEIRO: os processos do órgão
 * em fase externa, cada um com a PRÓXIMA AÇÃO (regra em `regras-area-trabalho`).
 * Só leitura: conta, por processo, o que está pendente em cada frente
 * (propostas, sessão, aceitação, habilitação, diligências, recursos, dispensa).
 */
@Injectable()
export class AreaTrabalhoService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** Agrupa contagens `{ licitacao_id, chave, n, ate }` num mapa por licitação. */
  private async contar(sql: string, ids: string[]): Promise<Map<string, Record<string, { n: number; ate: Date | null }>>> {
    const linhas: any[] = ids.length ? await this.ds.query(sql, [ids]) : [];
    const mapa = new Map<string, Record<string, { n: number; ate: Date | null }>>();
    for (const l of linhas) {
      const m = mapa.get(l.licitacao_id) ?? {};
      m[l.chave] = { n: Number(l.n), ate: l.ate ? new Date(l.ate) : null };
      mapa.set(l.licitacao_id, m);
    }
    return mapa;
  }

  async listar(orgaoId: string, usuarioId: string | null, opts: { soMeus?: boolean } = {}) {
    const agora = new Date();
    const lics: any[] = await this.ds.query(
      `SELECT l.id::text AS id, l.numero_processo, l.objeto, l.modalidade::text AS modalidade, l.fase::text AS fase, l.situacao::text AS situacao,
              l.pregoeiro_id::text AS pregoeiro_id, u.nome AS pregoeiro_nome, l.data_fim_acolhimento, l.data_abertura_sessao,
              l.valor_total_estimado, l.usa_lotes, l.base_lance::text AS base_lance,
              l.dispensa_com_lances, l.dispensa_lances_inicio, l.dispensa_lances_fim
         FROM licitacoes l LEFT JOIN usuarios u ON u.id = l.pregoeiro_id
        WHERE l.orgao_id::text = $1 AND l.fase::text = ANY($2) AND l.situacao::text IN ('ATIVA', 'SUSPENSA') AND l.data_homologacao IS NULL
          AND ($3::text IS NULL OR l.pregoeiro_id::text = $3)
        ORDER BY l.updated_at DESC
        LIMIT 200`,
      [orgaoId, FASES_AREA_DE_TRABALHO, opts.soMeus && usuarioId ? usuarioId : null],
    );
    const ids = lics.map((l) => l.id);
    const [propostas, sessoes, itens, lotes, aceitacoes, desempates, habs, aConvHab, dils, janelas, recursos, vencDisp, negDisp] = await Promise.all([
      this.contar(`SELECT licitacao_id::text AS licitacao_id, status::text AS chave, COUNT(*) AS n, NULL AS ate FROM propostas WHERE licitacao_id::text = ANY($1) GROUP BY 1, 2`, ids),
      this.contar(`SELECT licitacao_id::text AS licitacao_id, 'ABERTA' AS chave, COUNT(*) AS n, NULL AS ate FROM sessoes_disputa WHERE licitacao_id::text = ANY($1) AND status::text NOT IN ('AGUARDANDO_INICIO', 'CANCELADA') GROUP BY 1`, ids),
      this.contar(`SELECT licitacao_id::text AS licitacao_id, status_disputa::text AS chave, COUNT(*) AS n, NULL AS ate FROM itens_licitacao WHERE licitacao_id::text = ANY($1) AND status::text NOT IN ('FRACASSADO', 'DESERTO', 'CANCELADO') GROUP BY 1, 2`, ids),
      this.contar(`SELECT licitacao_id::text AS licitacao_id, status_disputa::text AS chave, COUNT(*) AS n, NULL AS ate FROM lotes_licitacao WHERE licitacao_id::text = ANY($1) GROUP BY 1, 2`, ids),
      // Situação da ÚLTIMA convocação de cada unidade (recusada/cancelada = unidade volta a convocar)
      this.contar(
        `SELECT x.licitacao_id, x.status AS chave, COUNT(*) AS n, MIN(x.prazo_ate) AS ate FROM (
           SELECT DISTINCT ON (unidade_id) licitacao_id::text AS licitacao_id, unidade_id, status::text AS status, prazo_ate
             FROM aceitacoes_proposta WHERE licitacao_id::text = ANY($1) ORDER BY unidade_id, convocada_em DESC
         ) x GROUP BY 1, 2`,
        ids,
      ),
      this.contar(`SELECT licitacao_id::text AS licitacao_id, status::text AS chave, COUNT(*) AS n, NULL AS ate FROM desempates_mpe WHERE licitacao_id::text = ANY($1) GROUP BY 1, 2`, ids),
      this.contar(`SELECT licitacao_id::text AS licitacao_id, status::text AS chave, COUNT(*) AS n, MIN(prazo_ate) AS ate FROM habilitacoes_licitante WHERE licitacao_id::text = ANY($1) GROUP BY 1, 2`, ids),
      // Empresas com proposta aceita em alguma unidade e ainda sem habilitação aberta ou decidida
      this.contar(
        `SELECT lu.licitacao_id::text AS licitacao_id, 'A_CONVOCAR' AS chave, COUNT(DISTINCT lu.fornecedor_id) AS n, NULL AS ate
           FROM licitantes_unidade lu
          WHERE lu.licitacao_id::text = ANY($1) AND lu.situacao::text = 'ACEITO'
            AND NOT EXISTS (SELECT 1 FROM habilitacoes_licitante h WHERE h.licitacao_id = lu.licitacao_id AND h.fornecedor_id::text = lu.fornecedor_id::text
                             AND h.status::text IN ('AGUARDANDO_ENVIO', 'ENVIADA', 'EM_DILIGENCIA', 'HABILITADO'))
          GROUP BY 1`,
        ids,
      ),
      this.contar(`SELECT licitacao_id::text AS licitacao_id, status::text AS chave, COUNT(*) AS n, MIN(prazo_ate) AS ate FROM diligencias_licitante WHERE licitacao_id::text = ANY($1) GROUP BY 1, 2`, ids),
      this.contar(
        `SELECT licitacao_id::text AS licitacao_id, CASE WHEN momento::text = 'FINAL' THEN 'FINAL' ELSE 'PREVIA' END AS chave, COUNT(*) AS n, MAX(fecha_em) AS ate
           FROM janelas_intencao_recurso WHERE licitacao_id::text = ANY($1) AND superada_em IS NULL GROUP BY 1, 2`,
        ids,
      ),
      this.contar(`SELECT licitacao_id::text AS licitacao_id, status::text AS chave, COUNT(*) AS n, NULL AS ate FROM recursos_administrativos WHERE licitacao_id::text = ANY($1) GROUP BY 1, 2`, ids),
      // Dispensa: vencedores adjudicados sem habilitação registrada como HABILITADO
      this.contar(
        `SELECT i.licitacao_id::text AS licitacao_id, 'SEM_HAB' AS chave, COUNT(DISTINCT i.fornecedor_vencedor_id) AS n, NULL AS ate
           FROM itens_licitacao i
          WHERE i.licitacao_id::text = ANY($1) AND i.status::text = 'ADJUDICADO' AND i.fornecedor_vencedor_id IS NOT NULL
            AND COALESCE((SELECT h.resultado FROM habilitacoes_dispensa h WHERE h.licitacao_id = i.licitacao_id AND h.fornecedor_id::text = i.fornecedor_vencedor_id::text
                           ORDER BY h.created_at DESC LIMIT 1), '') <> 'HABILITADO'
          GROUP BY 1`,
        ids,
      ),
      this.contar(`SELECT licitacao_id::text AS licitacao_id, status::text AS chave, COUNT(*) AS n, NULL AS ate FROM negociacoes_dispensa WHERE licitacao_id::text = ANY($1) GROUP BY 1, 2`, ids),
    ]);

    const de = (m: Map<string, Record<string, { n: number; ate: Date | null }>>, id: string, ...chaves: string[]) => chaves.reduce((s, c) => s + (m.get(id)?.[c]?.n ?? 0), 0);
    const ate = (m: Map<string, Record<string, { n: number; ate: Date | null }>>, id: string, chave: string) => m.get(id)?.[chave]?.ate ?? null;

    const linhas = lics.map((l) => {
      const porLote = l.usa_lotes && l.base_lance === 'TOTAL_LOTE';
      const unid = porLote ? lotes : itens;
      const encerradas = de(unid, l.id, 'ENCERRADO', 'NEGOCIACAO');
      const comConvocacaoViva = de(aceitacoes, l.id, 'AGUARDANDO_ENVIO', 'ENVIADA', 'ACEITA');
      const janelaFinalAte = ate(janelas, l.id, 'FINAL');
      const resumo: ResumoProcesso = {
        modalidade: l.modalidade,
        fase: l.fase,
        situacao: l.situacao,
        agora,
        fimPropostas: l.data_fim_acolhimento ? new Date(l.data_fim_acolhimento) : null,
        aberturaSessao: l.data_abertura_sessao ? new Date(l.data_abertura_sessao) : null,
        propostas: de(propostas, l.id, 'ENVIADA', 'RECEBIDA', 'EM_ANALISE', 'CLASSIFICADA', 'VENCEDORA'),
        propostasParaAnalisar: de(propostas, l.id, 'ENVIADA', 'RECEBIDA', 'EM_ANALISE'),
        sessaoAberta: de(sessoes, l.id, 'ABERTA') > 0,
        unidadesEmDisputa: de(unid, l.id, 'EM_DISPUTA', 'TEMPO_ALEATORIO'),
        unidadesAguardandoDisputa: de(unid, l.id, 'AGUARDANDO'),
        desempatesEmCurso: de(desempates, l.id, 'EM_CURSO'),
        aConvocarProposta: l.fase === 'JULGAMENTO' || l.fase === 'HABILITACAO' ? Math.max(0, encerradas - comConvocacaoViva - de(desempates, l.id, 'EM_CURSO')) : 0,
        propostasAguardandoEnvio: de(aceitacoes, l.id, 'AGUARDANDO_ENVIO'),
        prazoPropostaAte: ate(aceitacoes, l.id, 'AGUARDANDO_ENVIO'),
        propostasParaJulgar: de(aceitacoes, l.id, 'ENVIADA'),
        aConvocarHabilitacao: de(aConvHab, l.id, 'A_CONVOCAR'),
        habilitacoesAguardandoEnvio: de(habs, l.id, 'AGUARDANDO_ENVIO'),
        prazoHabilitacaoAte: ate(habs, l.id, 'AGUARDANDO_ENVIO'),
        habilitacoesParaAnalisar: de(habs, l.id, 'ENVIADA'),
        habilitacoesEmDiligencia: de(habs, l.id, 'EM_DILIGENCIA'),
        diligenciasRespondidas: de(dils, l.id, 'RESPONDIDA'),
        diligenciasAbertas: de(dils, l.id, 'ABERTA'),
        janelaRecursoAbertaAte: janelaFinalAte ?? ate(janelas, l.id, 'PREVIA'),
        houveJanelaFinal: de(janelas, l.id, 'FINAL') > 0,
        intencoesParaAdmitir: janelaFinalAte && agora >= janelaFinalAte ? de(recursos, l.id, 'INTENCAO') : 0,
        recursosParaReconsiderar: de(recursos, l.id, 'EM_ANALISE'),
        recursosNaAutoridade: de(recursos, l.id, 'AGUARDANDO_AUTORIDADE'),
        recursosComPrazoDasPartes: de(recursos, l.id, 'AGUARDANDO_RAZOES', 'CONTRARRAZOES', 'RAZOES_APRESENTADAS'),
        dispensaComLances: l.dispensa_com_lances !== false,
        dispensaLancesInicio: l.dispensa_lances_inicio ? new Date(l.dispensa_lances_inicio) : null,
        dispensaLancesFim: l.dispensa_lances_fim ? new Date(l.dispensa_lances_fim) : null,
        vencedoresSemHabilitacao: de(vencDisp, l.id, 'SEM_HAB'),
        contrapropostasPendentes: de(negDisp, l.id, 'PENDENTE'),
      };
      return {
        id: l.id,
        numero_processo: l.numero_processo,
        objeto: l.objeto,
        modalidade: l.modalidade,
        fase: l.fase,
        situacao: l.situacao,
        valor_estimado: l.valor_total_estimado != null ? Number(l.valor_total_estimado) : null,
        pregoeiro: l.pregoeiro_id ? { id: l.pregoeiro_id, nome: l.pregoeiro_nome } : null,
        meu: !!usuarioId && l.pregoeiro_id === usuarioId,
        unidades: { tipo: porLote ? 'LOTE' : 'ITEM', total: de(unid, l.id, 'AGUARDANDO', 'EM_DISPUTA', 'TEMPO_ALEATORIO', 'ENCERRADO', 'NEGOCIACAO') },
        propostas: resumo.propostas,
        acao: proximaAcao(resumo),
      };
    });
    const ordenadas = ordenarPorUrgencia(linhas);
    return {
      gerado_em: agora.toISOString(),
      total: ordenadas.length,
      com_voce: ordenadas.filter((x) => x.acao.vez === 'VOCE').length,
      aguardando: ordenadas.filter((x) => x.acao.vez === 'AGUARDANDO').length,
      processos: ordenadas,
    };
  }
}
