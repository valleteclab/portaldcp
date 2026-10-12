import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { WorkflowService } from '../workflow/workflow.service';
import type { WorkflowAcao } from '../workflow/workflow.entities';
import { andamentoDoFluxo, andamentoLivre, type Andamento } from '../workflow/andamento/andamento';
import { TipoProcesso, type Processo } from './entities/processo.entity';
import type { Ator } from '../auth/acesso/ator';
import { rotuloModalidade } from '../workflow/aplicacao/aplicacao-fluxo';
import { definicaoDoFundamento } from '../licitacoes/fundamento-legal';

/** "Dispensa, art. 75, II" / "fluxo padrão da contratação" — gravado ao iniciar o fluxo pela modalidade. */
function textoDaEscolha(e: unknown): string | null {
  const x = (e ?? null) as { motivo?: string; modalidade?: string | null; fundamento?: string | null } | null;
  if (!x?.motivo) return null;
  if (x.motivo === 'PADRAO') return 'fluxo padrão da contratação';
  const enquadramento = x.motivo === 'ENQUADRAMENTO' ? (definicaoDoFundamento(x.fundamento)?.referencia ?? null) : null;
  return [rotuloModalidade(x.modalidade), enquadramento].filter(Boolean).join(', ');
}

const ROTULO_RESPONSAVEL: Record<string, string> = {
  SOLICITANTE: 'Solicitante',
  FISCAL_CONTRATO: 'Fiscal do contrato',
  GESTOR_CONTRATO: 'Gestor do contrato',
};

/**
 * ANDAMENTO do processo para a tela de acompanhamento. Com fluxo desenhado
 * ligado ao processo, o caminho vem do desenho (nós futuros aparecem); sem
 * fluxo, o caminho é a tramitação que aconteceu (ofício, avulso).
 */
@Injectable()
export class AndamentoProcessoService {
  constructor(
    private readonly ds: DataSource,
    private readonly workflow: WorkflowService,
  ) {}

  async andamento(p: Processo, ator?: Ator): Promise<Andamento> {
    const execucao = await this.workflow.execucaoDoProcesso(p.orgao_id, p.id);
    if (execucao) {
      const nomes = await this.nomesDosResponsaveis(p.orgao_id, execucao.passos.map((x) => x.acao));
      const a = andamentoDoFluxo({
        fluxo: { id: execucao.modelo.id, nome: execucao.modelo.nome, versao: execucao.instancia.workflow_versao },
        instancia_id: execucao.instancia.id,
        status_instancia: execucao.instancia.status,
        passos: execucao.passos.map(({ acao }) => ({ acao_id: acao.id, titulo: acao.nome, tipo: acao.tipo, responsavel: this.responsavel(acao, nomes) })),
        tarefas: execucao.tarefas,
        agora: new Date(),
      });
      const aberta = a.atual?.tarefa_id ? execucao.tarefas.find((t) => t.id === a.atual!.tarefa_id) : null;
      a.pode_agir = !!(ator && aberta && (await this.workflow.podeAgirNaTarefa(p.orgao_id, execucao.instancia, aberta, ator)));
      a.licitacao_id = p.tipo === TipoProcesso.CONTRATACAO && p.referencia_tipo === 'LICITACAO' ? p.referencia_id : null;
      a.escolhido_por = textoDaEscolha(execucao.instancia.dados?.escolha);
      await this.juntarInstrucao(p, a, execucao.instancia.dados ?? null, execucao.modelo.nome);
      return a;
    }
    const [movimentacoes, pecas] = await Promise.all([
      this.ds.query(`SELECT tipo, created_at, para_setor_nome, para_usuario_nome, recebida_em FROM processo_movimentacoes WHERE processo_id = $1::uuid ORDER BY sequencia ASC`, [p.id]),
      this.ds.query(`SELECT titulo, created_at, criado_por_nome FROM processo_pecas WHERE processo_id = $1::uuid ORDER BY numero_peca ASC`, [p.id]),
    ]);
    // Ofício enviado: a resposta (ou o arquivamento) é o passo esperado de quem recebeu
    const esperada = p.tipo === TipoProcesso.OFICIO && movimentacoes.some((m: { tipo: string }) => m.tipo === 'ENVIO') ? { titulo: 'Resposta' } : null;
    return andamentoLivre({ movimentacoes, pecas, encerramento: p.situacao === 'ENCERRADO' && p.encerrado_em ? { em: p.encerrado_em } : null, esperada });
  }

  /**
   * Contratação em duas partes (definição da modalidade, 12/10/2026): a
   * execução do fluxo da modalidade guarda a da instrução; o andamento mostra
   * as etapas da instrução (concluídas) antes das da modalidade.
   */
  private async juntarInstrucao(p: Processo, a: Andamento, dados: Record<string, unknown> | null, nomeDoFluxo: string) {
    const instrucaoId = typeof dados?.instrucao_id === 'string' ? dados.instrucao_id : null;
    if (!instrucaoId) return;
    const ex = await this.workflow.execucaoPorInstancia(p.orgao_id, instrucaoId);
    if (!ex) return;
    const nomes = await this.nomesDosResponsaveis(p.orgao_id, ex.passos.map((x) => x.acao));
    const anterior = andamentoDoFluxo({
      fluxo: { id: ex.modelo.id, nome: ex.modelo.nome, versao: ex.instancia.workflow_versao },
      instancia_id: ex.instancia.id,
      status_instancia: ex.instancia.status,
      passos: ex.passos.map(({ acao }) => ({ acao_id: acao.id, titulo: acao.nome, tipo: acao.tipo, responsavel: this.responsavel(acao, nomes) })),
      tarefas: ex.tarefas,
      agora: new Date(),
    });
    const n = anterior.nos.length;
    a.nos = [...anterior.nos, ...a.nos];
    a.concluidas += anterior.concluidas;
    a.total += anterior.total;
    a.partes = [
      { titulo: ex.modelo.nome, de: 0, ate: n },
      { titulo: nomeDoFluxo, de: n, ate: a.nos.length },
    ];
    const def = (dados?.definicao ?? null) as { modalidade?: string; fundamento?: string | null; numero?: string | null; em?: string } | null;
    a.definicao = def?.modalidade
      ? { texto: [rotuloModalidade(def.modalidade), definicaoDoFundamento(def.fundamento)?.referencia].filter(Boolean).join(' · '), numero: def.numero ?? null, em: def.em ?? null }
      : null;
  }

  /**
   * "Trazido das etapas anteriores" (mockup, tela Contratação 1): o DFD
   * consolidado com as demandas reunidas e o valor, e os documentos já
   * juntados pelas etapas do fluxo.
   */
  async trazido(p: Processo) {
    const [dfd] = await this.ds.query(
      `SELECT f.id::text AS id, f.numero, f.ano, f.valor_total_estimado,
              (SELECT COUNT(*)::int FROM dfds_consolidados_demandas d WHERE d.dfd_id = f.id) AS demandas,
              (SELECT COALESCE(array_agg(DISTINCT d.setor) FILTER (WHERE d.setor IS NOT NULL), '{}') FROM dfds_consolidados_demandas d WHERE d.dfd_id = f.id) AS setores
         FROM dfds_consolidados f WHERE f.processo_id = $1::uuid AND f.orgao_id::text = $2 ORDER BY f.created_at DESC LIMIT 1`,
      [p.id, p.orgao_id],
    );
    const documentos = await this.ds.query(
      `SELECT titulo, created_at FROM processo_pecas WHERE processo_id = $1::uuid AND etapa LIKE 'no:%' ORDER BY numero_peca ASC`,
      [p.id],
    );
    return {
      processo_id: p.id,
      dfd: dfd ? { id: dfd.id, rotulo: `DFD nº ${dfd.numero}/${dfd.ano}`, demandas: Number(dfd.demandas), setores: dfd.setores ?? [], valor_total: Number(dfd.valor_total_estimado) || 0 } : null,
      documentos,
    };
  }

  private idsDe(acao: WorkflowAcao): string[] {
    const lista = Array.isArray(acao.configuracao?.responsaveis) ? (acao.configuracao!.responsaveis as unknown[]).map(String) : [];
    return lista.length ? lista : acao.responsavel_valor ? [acao.responsavel_valor] : [];
  }

  /** Nomes de setores e usuários do órgão citados nos passos — uma consulta de cada, só do órgão do processo. */
  private async nomesDosResponsaveis(orgaoId: string, acoes: WorkflowAcao[]): Promise<Map<string, string>> {
    const ids = [...new Set(acoes.flatMap((a) => this.idsDe(a)))];
    if (!ids.length) return new Map();
    const [setores, usuarios]: Array<Array<{ id: string; nome: string }>> = await Promise.all([
      this.ds.query(`SELECT id::text AS id, nome FROM setores WHERE orgao_id::text = $1 AND id::text = ANY($2::text[])`, [orgaoId, ids]),
      this.ds.query(`SELECT id::text AS id, nome FROM usuarios WHERE orgao_id::text = $1 AND id::text = ANY($2::text[])`, [orgaoId, ids]),
    ]);
    return new Map([...setores, ...usuarios].map((x) => [x.id, x.nome]));
  }

  private responsavel(acao: WorkflowAcao, nomes: Map<string, string>): string | null {
    const tipo = String(acao.responsavel_tipo ?? '').toUpperCase();
    if (ROTULO_RESPONSAVEL[tipo]) return ROTULO_RESPONSAVEL[tipo];
    const encontrados = this.idsDe(acao).map((id) => nomes.get(id)).filter((n): n is string => !!n);
    return encontrados.length ? encontrados.join(', ') : null;
  }
}
