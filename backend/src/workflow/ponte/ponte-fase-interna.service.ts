import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ehFaseInterna } from '../../licitacoes/transicoes/fases';
import { linhasDoChecklist, MODALIDADES_CONTRATACAO_DIRETA } from '../../fase-interna/documentos-obrigatorios';
import { DOCUMENTO_DA_ETAPA, documentoProntoParaAPonte, pendenciasDaPonte, portaoDaEtapa } from './ponte-fase-interna';
import { pendenciasDoPortaoDoProcesso } from '../../fase-interna/conformidade/portoes';

/**
 * Lê o estado da fase interna para as etapas de um fluxo ligado a um processo
 * de CONTRATAÇÃO (ponte, decisão de 07/10/2026). Só leitura, sempre pelo
 * processo do órgão da execução.
 */
@Injectable()
export class PonteFaseInternaService {
  constructor(private readonly ds: DataSource) {}

  /** Licitação da contratação ligada ao processo (nulo se o processo não é de contratação). */
  async licitacaoDoProcesso(processoId: string): Promise<{ id: string; fase: string; demanda_id: string | null; modalidade: string | null } | null> {
    const [l] = await this.ds.query(
      `SELECT l.id::text AS id, l.fase::text AS fase, l.demanda_id::text AS demanda_id, l.modalidade::text AS modalidade
         FROM processos p JOIN licitacoes l ON l.id = p.referencia_id AND l.orgao_id = p.orgao_id
        WHERE p.id::text = $1 AND p.tipo = 'CONTRATACAO' AND p.referencia_tipo = 'LICITACAO'`,
      [processoId],
    );
    return l ?? null;
  }

  /** Pendências da etapa pela fase interna; nulo quando o processo não é de contratação (vale a regra comum). */
  async pendencias(processoId: string | null, tipoNo: string): Promise<string[] | null> {
    if (!processoId) return null;
    const lic = await this.licitacaoDoProcesso(processoId);
    if (!lic) return null;
    const tipo = String(tipoNo).toUpperCase();
    const tipoDoc = DOCUMENTO_DA_ETAPA[tipo];
    let documentoPronto = false;
    if (tipoDoc) {
      // Mesmo critério da instrução (checklist): gerado/anexado conta; "não se aplica" só onde o checklist permite
      const direta = MODALIDADES_CONTRATACAO_DIRETA.includes(String(lic.modalidade ?? ''));
      const linha = linhasDoChecklist({ contratacao_direta: direta, controle_interno_ativo: true }).find((x) => String(x.tipo) === tipoDoc);
      const [d] = await this.ds.query(
        `SELECT tipo::text AS tipo, status::text AS status, caminho_arquivo, arquivo_pdf_path, descricao, dados_estruturados
           FROM documentos_fase_interna
          WHERE licitacao_id::text = $1 AND tipo::text = $2 AND versao_atual = true
          ORDER BY versao DESC NULLS LAST LIMIT 1`,
        [lic.id, tipoDoc],
      );
      // DFD único (13/10/2026): o DFD consolidado gera o documento DFD dos autos ao abrir
      // o processo — a ponte lê só a peça, como a instrução e a trava da lei (art. 72, I)
      documentoPronto = documentoProntoParaAPonte(d, { pode_nao_se_aplicar: !!linha?.pode_nao_se_aplicar });
    }
    let temDemanda = !!lic.demanda_id;
    if (!temDemanda && tipo === 'DEMANDA') {
      const [c] = await this.ds.query(`SELECT 1 FROM dfds_consolidados WHERE licitacao_id::text = $1 AND status <> 'CANCELADO' LIMIT 1`, [lic.id]);
      temDemanda = !!c;
    }
    // Travas da lei: o fluxo não conclui Autorização (portão B, art. 72) nem Publicação (portão C) com bloqueio aberto
    const portao = portaoDaEtapa(tipo);
    const publicada = !ehFaseInterna(lic.fase);
    const travasDaLei = portao && !publicada ? await pendenciasDoPortaoDoProcesso(lic.id, portao.portao, { ato: portao.ato, somenteAvaliacao: true }) : [];
    return pendenciasDaPonte(tipo, { documentoPronto, publicada, temDemanda, travasDaLei });
  }
}
