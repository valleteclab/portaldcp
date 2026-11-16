import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import type { Ator } from '../auth/acesso/ator';
import { PlanejamentoFluxoService } from '../fase-interna/fluxo/planejamento-fluxo.service';
import { AndamentoProcessoService } from '../processo/andamento-processo.service';
import { Processo } from '../processo/entities/processo.entity';
import { GuiaAndamento } from './guia-andamento.entity';
import { escolherFluxo, type FluxoAtivo } from '../workflow/aplicacao/aplicacao-fluxo';
import { roteiroDispensa, roteiroFluxo, type EtapaDoFluxoGuia, type PessoaGuia, type RoteiroGuia } from './roteiro-guia';

const ROTEIRO_DISPENSA = 'DISPENSA';
const STATUS_APROVADA = ['APROVADA', 'CONSOLIDADA', 'EM_CONTRATACAO', 'CONTRATADA'];
const MAX_PESSOAS = 3;

export interface ProgressoGuia {
  roteiros: RoteiroGuia[];
  concluidos: number;
  total: number;
}

/**
 * GUIA DE PRIMEIROS PASSOS — lê os dados do órgão do token e monta os dois
 * roteiros (regras em roteiro-guia.ts). Só leitura, exceto o começo do
 * roteiro B e a demanda de teste que ele passa a acompanhar.
 */
@Injectable()
export class GuiaService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(GuiaAndamento) private readonly andamentos: Repository<GuiaAndamento>,
    private readonly planejamento: PlanejamentoFluxoService,
    private readonly andamentoProcesso: AndamentoProcessoService,
  ) {}

  async progresso(ator: Ator): Promise<ProgressoGuia> {
    const orgaoId = this.orgaoDo(ator);
    const roteiros = await Promise.all([this.roteiroFluxo(ator, orgaoId), this.roteiroDispensa(ator, orgaoId)]);
    return {
      roteiros,
      concluidos: roteiros.reduce((s, r) => s + r.concluidos, 0),
      total: roteiros.reduce((s, r) => s + r.total, 0),
    };
  }

  /** Começa (ou recomeça) o roteiro da dispensa: a próxima demanda criada no órgão passa a ser a de teste. */
  async comecarDispensa(ator: Ator): Promise<ProgressoGuia> {
    const orgaoId = this.orgaoDo(ator);
    await this.andamentos.update({ orgao_id: orgaoId, roteiro: ROTEIRO_DISPENSA, encerrado_em: IsNull() }, { encerrado_em: new Date() });
    await this.andamentos.save(this.andamentos.create({ orgao_id: orgaoId, roteiro: ROTEIRO_DISPENSA, iniciado_por_id: ator.usuarioId ?? ator.id }));
    return this.progresso(ator);
  }

  private orgaoDo(ator: Ator): string {
    if (!ator.orgaoId) throw new BadRequestException('O guia é do órgão: entre com um usuário do órgão.');
    return ator.orgaoId;
  }

  // -------------------------------------------------------------------------
  // Roteiro A
  // -------------------------------------------------------------------------

  private async roteiroFluxo(ator: Ator, orgaoId: string): Promise<RoteiroGuia> {
    const [fluxo] = await this.ds.query(
      `SELECT m.id::text AS id, m.nome, m.status,
              (SELECT COUNT(*)::int FROM workflow_acoes a JOIN workflow_fases f ON f.id = a.fase_id
                WHERE f.workflow_id = m.id AND a.tipo <> 'NOTIFICAR') AS etapas,
              (SELECT COUNT(*)::int FROM workflow_acoes a JOIN workflow_fases f ON f.id = a.fase_id
                WHERE f.workflow_id = m.id AND a.tipo <> 'NOTIFICAR'
                  AND a.responsavel_tipo NOT IN ('SOLICITANTE', 'FISCAL_CONTRATO', 'GESTOR_CONTRATO')
                  AND COALESCE(a.responsavel_valor, '') = ''
                  AND NOT (jsonb_typeof(a.configuracao -> 'responsaveis') = 'array'
                           AND jsonb_array_length(a.configuracao -> 'responsaveis') > 0)) AS etapas_sem_responsavel
         FROM workflow_modelos m
        WHERE m.orgao_id::text = $1 AND m.tipo_processo = 'CONTRATACAO' AND m.status IN ('RASCUNHO', 'PUBLICADO', 'DESATIVADO')
        ORDER BY (m.status = 'PUBLICADO') DESC, m.updated_at DESC
        LIMIT 1`,
      [orgaoId],
    );
    const pessoa = await this.planejamento.pessoa(ator, orgaoId);
    const admins = await this.pessoasDaConsulta(`orgao_id::text = $1 AND ativo = true AND role::text = 'ADMIN'`, [orgaoId]);
    return roteiroFluxo({
      fluxo: fluxo ? { id: fluxo.id, nome: fluxo.nome, status: fluxo.status, etapas: Number(fluxo.etapas), etapas_sem_responsavel: Number(fluxo.etapas_sem_responsavel) } : null,
      ativo: fluxo?.status === 'PUBLICADO' ? { id: fluxo.id, nome: fluxo.nome } : null,
      pode_agir: !!pessoa?.admin_orgao,
      quem_pode: admins,
    });
  }

  // -------------------------------------------------------------------------
  // Roteiro B
  // -------------------------------------------------------------------------

  private async roteiroDispensa(ator: Ator, orgaoId: string): Promise<RoteiroGuia> {
    const andamento = await this.andamentos.findOne({
      where: { orgao_id: orgaoId, roteiro: ROTEIRO_DISPENSA, encerrado_em: IsNull() },
      order: { iniciado_em: 'DESC' },
    });
    // O fluxo que uma dispensa de pequeno valor (art. 75, II) seguiria hoje
    const publicados: Array<FluxoAtivo & { instrucao: boolean }> = (
      await this.ds.query(
        `SELECT m.id::text AS id, m.nome, m.versao, m.aplicacao,
                EXISTS (SELECT 1 FROM workflow_fases f JOIN workflow_acoes a ON a.fase_id = f.id WHERE f.workflow_id = m.id AND a.tipo = 'DEFINICAO_MODALIDADE') AS instrucao
           FROM workflow_modelos m WHERE m.orgao_id::text = $1 AND m.tipo_processo = 'CONTRATACAO' AND m.status = 'PUBLICADO' ORDER BY m.updated_at DESC`,
        [orgaoId],
      )
    ).map((x: any) => ({ id: x.id, nome: x.nome, versao: Number(x.versao), aplicacao: x.aplicacao ?? null, instrucao: !!x.instrucao }));
    // A instrução (termina na Definição da modalidade) vem antes; o fluxo da dispensa de pequeno valor (art. 75, II), depois
    const instrucoes = publicados.filter((x) => x.instrucao);
    const instrucao = instrucoes.length === 1 ? instrucoes[0] : null;
    const fluxoAtivo = escolherFluxo(publicados.filter((x) => !x.instrucao), 'DISPENSA_ELETRONICA', 'ART75_II')?.fluxo ?? null;

    const demanda = andamento ? await this.demandaDoRoteiro(andamento) : null;
    const dfd = demanda ? await this.dfdDaDemanda(demanda.id) : null;
    const processo = await this.processoDoRoteiro(orgaoId, demanda?.id ?? null, dfd);

    let etapas: EtapaDoFluxoGuia[] = [];
    let podeEtapa = false;
    let quemEtapa: PessoaGuia[] = [];
    if (processo) {
      const a = await this.andamentoProcesso.andamento(processo, ator);
      if (a.modo === 'FLUXO') {
        etapas = a.nos.map((n) => ({ chave: n.chave, titulo: n.titulo, tipo: n.tipo, responsavel: n.responsavel, concluida: n.situacao === 'CONCLUIDA' }));
        podeEtapa = !!a.pode_agir;
        quemEtapa = await this.quemPodeATarefaAberta(orgaoId, processo.id);
      }
    } else if (fluxoAtivo) {
      etapas = [...(instrucao ? await this.etapasDoFluxo(orgaoId, instrucao.id) : []), ...(await this.etapasDoFluxo(orgaoId, fluxoAtivo.id))];
    }

    const licitacaoId = processo?.referencia_tipo === 'LICITACAO' ? processo.referencia_id : null;
    const [podeAprovar, podeMontar, regras] = await Promise.all([
      this.planejamento.podeAprovarDemanda(ator, orgaoId),
      this.planejamento.podeMontarDfd(ator, orgaoId),
      this.planejamento.vigente(orgaoId),
    ]);
    const [quemAprova, quemMonta, quemPublica, publicado] = await Promise.all([
      this.pessoasPorIds(orgaoId, (await this.planejamento.destinatarios(orgaoId, regras.aprovador_demanda, 'APROVAR')).map((d) => d.id)),
      this.pessoasPorIds(orgaoId, (await this.planejamento.destinatarios(orgaoId, regras.responsavel_dfd, 'MONTAR')).map((d) => d.id)),
      this.pessoasDaConsulta(`orgao_id::text = $1 AND ativo = true AND role::text IN ('ADMIN', 'PREGOEIRO')`, [orgaoId]),
      licitacaoId ? this.publicadoNoPncp(licitacaoId) : Promise.resolve(false),
    ]);

    return roteiroDispensa({
      iniciado: !!andamento,
      fluxo_ativo: !!fluxoAtivo,
      demanda,
      dfd: dfd ? { id: dfd.id } : null,
      processo: processo ? { id: processo.id, numero: processo.numero ?? null, licitacao_id: licitacaoId } : null,
      etapas,
      publicado,
      pode: {
        demanda: ator.tipo === 'ORGAO' || ator.tipo === 'USUARIO',
        aprovar: podeAprovar,
        montar: podeMontar,
        etapa: podeEtapa,
        publicar: ator.tipo === 'ORGAO' || ator.admin || ['ADMIN', 'PREGOEIRO'].includes(String(ator.role ?? '').toUpperCase()),
      },
      quem_pode: { aprovar: quemAprova, montar: quemMonta, etapa: quemEtapa, publicar: quemPublica },
    });
  }

  /** A demanda de teste: a gravada, ou a primeira criada no órgão depois do começo do roteiro (passa a ser gravada). */
  private async demandaDoRoteiro(andamento: GuiaAndamento) {
    const linhas = andamento.demanda_id
      ? await this.ds.query(
          `SELECT id::text AS id, descricao_sucinta_objeto AS objeto, status::text AS status, data_envio, data_aprovacao
             FROM demandas WHERE id = $1 AND orgao_id::text = $2`,
          [andamento.demanda_id, andamento.orgao_id],
        )
      : await this.ds.query(
          `SELECT id::text AS id, descricao_sucinta_objeto AS objeto, status::text AS status, data_envio, data_aprovacao
             FROM demandas WHERE orgao_id::text = $1 AND created_at >= $2 ORDER BY created_at ASC LIMIT 1`,
          [andamento.orgao_id, andamento.iniciado_em],
        );
    const d = linhas[0];
    if (!d) return null;
    if (!andamento.demanda_id) await this.andamentos.update(andamento.id, { demanda_id: d.id });
    const status = String(d.status ?? '');
    return {
      id: d.id as string,
      rotulo: d.objeto ? String(d.objeto).slice(0, 80) : null,
      enviada: status !== 'RASCUNHO' || !!d.data_envio,
      aprovada: STATUS_APROVADA.includes(status) || !!d.data_aprovacao,
    };
  }

  private async dfdDaDemanda(demandaId: string): Promise<{ id: string; licitacao_id: string | null; processo_id: string | null } | null> {
    const [f] = await this.ds.query(
      `SELECT f.id::text AS id, f.licitacao_id::text AS licitacao_id, f.processo_id::text AS processo_id
         FROM dfds_consolidados_demandas d JOIN dfds_consolidados f ON f.id = d.dfd_id
        WHERE d.demanda_id = $1 AND f.status <> 'CANCELADO'
        ORDER BY f.created_at DESC LIMIT 1`,
      [demandaId],
    );
    return f ?? null;
  }

  /** Processo eletrônico da demanda: pelo DFD (licitação ou processo) ou pela ligação antiga licitacoes.demanda_id. */
  private async processoDoRoteiro(orgaoId: string, demandaId: string | null, dfd: { licitacao_id: string | null; processo_id: string | null } | null): Promise<Processo | null> {
    const repo = this.ds.getRepository(Processo);
    if (dfd?.processo_id) {
      const p = await repo.findOne({ where: { id: dfd.processo_id, orgao_id: orgaoId } });
      if (p) return p;
    }
    let licitacaoId = dfd?.licitacao_id ?? null;
    if (!licitacaoId && demandaId) {
      const [l] = await this.ds.query(`SELECT id::text AS id FROM licitacoes WHERE demanda_id::text = $1 AND orgao_id::text = $2 ORDER BY created_at DESC LIMIT 1`, [demandaId, orgaoId]);
      licitacaoId = l?.id ?? null;
    }
    if (!licitacaoId) return null;
    return repo.findOne({ where: { referencia_tipo: 'LICITACAO', referencia_id: licitacaoId, orgao_id: orgaoId } });
  }

  /** Etapas do fluxo ativo, na ordem do desenho (para mostrar o caminho antes de o processo existir). */
  private async etapasDoFluxo(orgaoId: string, modeloId: string): Promise<EtapaDoFluxoGuia[]> {
    const acoes: Array<{ id: string; nome: string; tipo: string; responsavel_tipo: string; responsavel_valor: string | null; responsaveis: unknown }> = await this.ds.query(
      `SELECT a.id::text AS id, a.nome, a.tipo, a.responsavel_tipo, a.responsavel_valor, a.configuracao -> 'responsaveis' AS responsaveis
         FROM workflow_acoes a JOIN workflow_fases f ON f.id = a.fase_id
        WHERE f.workflow_id::text = $1
        ORDER BY f.ordem ASC, a.ordem ASC`,
      [modeloId],
    );
    const idsDe = (a: (typeof acoes)[number]) => (Array.isArray(a.responsaveis) && a.responsaveis.length ? a.responsaveis.map(String) : a.responsavel_valor ? [a.responsavel_valor] : []);
    const ids = [...new Set(acoes.flatMap(idsDe))];
    const nomes = new Map<string, string>();
    if (ids.length) {
      const linhas: Array<{ id: string; nome: string }> = await this.ds.query(
        `SELECT id::text AS id, nome FROM setores WHERE orgao_id::text = $1 AND id::text = ANY($2::text[])
         UNION ALL
         SELECT id::text AS id, nome FROM usuarios WHERE orgao_id::text = $1 AND id::text = ANY($2::text[])`,
        [orgaoId, ids],
      );
      linhas.forEach((l) => nomes.set(l.id, l.nome));
    }
    const ROTULO: Record<string, string> = { SOLICITANTE: 'Solicitante', FISCAL_CONTRATO: 'Fiscal do contrato', GESTOR_CONTRATO: 'Gestor do contrato' };
    return acoes.map((a) => {
      const tipoResp = String(a.responsavel_tipo ?? '').toUpperCase();
      const responsavel = ROTULO[tipoResp] ?? (idsDe(a).map((id) => nomes.get(id)).filter(Boolean).join(', ') || null);
      return { chave: a.id, titulo: a.nome, tipo: a.tipo, responsavel, concluida: false };
    });
  }

  /** Quem pode a etapa aberta do fluxo no processo (pelo setor ou pelos usuários da tarefa). */
  private async quemPodeATarefaAberta(orgaoId: string, processoId: string): Promise<PessoaGuia[]> {
    const [t] = await this.ds.query(
      `SELECT t.responsavel_tipo, t.responsaveis, i.iniciado_por_id
         FROM workflow_tarefas t JOIN workflow_instancias i ON i.id = t.instancia_id
        WHERE i.orgao_id::text = $1 AND i.vinculo_tipo = 'PROCESSO' AND i.vinculo_id::text = $2 AND t.status = 'ABERTA'
        ORDER BY t.created_at DESC LIMIT 1`,
      [orgaoId, processoId],
    );
    if (!t) return [];
    const ids: string[] = Array.isArray(t.responsaveis) ? t.responsaveis.map(String) : [];
    const tipo = String(t.responsavel_tipo ?? '').toUpperCase();
    if (tipo === 'SOLICITANTE') return t.iniciado_por_id ? this.pessoasPorIds(orgaoId, [String(t.iniciado_por_id)]) : [];
    if (!ids.length) return [];
    if (tipo === 'USUARIO') return this.pessoasPorIds(orgaoId, ids);
    return this.pessoasDaConsulta(`orgao_id::text = $1 AND ativo = true AND setor_id::text = ANY($2::text[])`, [orgaoId, ids]);
  }

  private async publicadoNoPncp(licitacaoId: string): Promise<boolean> {
    const [r] = await this.ds.query(
      `SELECT (EXISTS (SELECT 1 FROM pncp_sync WHERE tipo::text = 'COMPRA' AND licitacao_id::text = $1 AND status::text IN ('ENVIADO', 'ATUALIZADO'))
               OR EXISTS (SELECT 1 FROM licitacoes WHERE id::text = $1 AND data_divulgacao_oficial IS NOT NULL)) AS publicado`,
      [licitacaoId],
    );
    return !!r?.publicado;
  }

  private pessoasPorIds(orgaoId: string, ids: string[]): Promise<PessoaGuia[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.pessoasDaConsulta(`orgao_id::text = $1 AND ativo = true AND id::text = ANY($2::text[])`, [orgaoId, ids]);
  }

  private async pessoasDaConsulta(onde: string, params: unknown[]): Promise<PessoaGuia[]> {
    const linhas: Array<{ nome: string; email: string | null }> = await this.ds.query(
      `SELECT nome, email FROM usuarios WHERE ${onde} ORDER BY nome LIMIT ${MAX_PESSOAS}`,
      params,
    );
    return linhas.map((l) => ({ nome: l.nome, email: l.email ?? null }));
  }
}
