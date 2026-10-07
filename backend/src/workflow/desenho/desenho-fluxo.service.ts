import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { WorkflowAcao, WorkflowCampo, WorkflowFase, WorkflowFormulario, WorkflowModelo } from '../workflow.entities';
import { WorkflowService } from '../workflow.service';
import { TeamsService } from '../avisos/teams.service';
import { normalizarAvisos, normalizarNotificar } from '../avisos/destinatarios';
import { definicaoDoNo, travaLegal } from '../nos/catalogo-nos';
import { errosParaAtivar, normalizarEtapas, removidasComTrava, TIPOS_PROCESSO_DO_FLUXO, ETAPAS_EXIGIDAS, type EtapaDesenho } from './desenho';

const COR_ETAPA = '#1B4A63';

/**
 * DESENHO DO FLUXO — tela "Desenhar o fluxo" (mockup aprovado em 06/10/2026).
 * Usa as tabelas do Workflow: cada etapa é uma ação na sua própria fase, na
 * ordem do desenho. Só o RASCUNHO se edita; o fluxo ativo (PUBLICADO) gera
 * um rascunho novo (nova versão) e, ao ativar, a versão anterior vira
 * SUBSTITUIDO — os processos em andamento continuam apontando para ela.
 */
@Injectable()
export class DesenhoFluxoService {
  constructor(
    private readonly ds: DataSource,
    private readonly workflow: WorkflowService,
    private readonly teams: TeamsService,
  ) {}

  private familia(m: { id: string; familia_id: string | null }) {
    return m.familia_id ?? m.id;
  }

  /** Fluxos do órgão, um por família: a versão ativa, o rascunho em edição e quantos processos usam cada uma. */
  async listar(orgaoId: string) {
    const linhas: Array<{ id: string; familia: string; nome: string; tipo_processo: string | null; versao: number; status: string; updated_at: Date; em_andamento: number }> = await this.ds.query(
      `SELECT m.id::text AS id, COALESCE(m.familia_id, m.id)::text AS familia, m.nome, m.tipo_processo, m.versao, m.status, m.updated_at,
              (SELECT COUNT(*)::int FROM workflow_instancias i WHERE i.workflow_id = m.id AND i.status = 'EM_ANDAMENTO') AS em_andamento
         FROM workflow_modelos m WHERE m.orgao_id::text = $1 ORDER BY m.versao DESC`,
      [orgaoId],
    );
    const familias = new Map<string, typeof linhas>();
    for (const l of linhas) familias.set(l.familia, [...(familias.get(l.familia) ?? []), l]);
    return [...familias.values()]
      .map((vs) => {
        const ativo = vs.find((v) => v.status === 'PUBLICADO') ?? null;
        const rascunho = vs.find((v) => v.status === 'RASCUNHO') ?? null;
        const atual = rascunho ?? ativo ?? vs[0];
        return {
          familia_id: atual.familia,
          nome: atual.nome,
          tipo_processo: atual.tipo_processo,
          ativo: ativo ? { id: ativo.id, versao: ativo.versao } : null,
          rascunho: rascunho ? { id: rascunho.id, versao: rascunho.versao } : null,
          em_andamento: vs.reduce((t, v) => t + Number(v.em_andamento || 0), 0),
          atualizado_em: vs.reduce((d, v) => (new Date(v.updated_at) > d ? new Date(v.updated_at) : d), new Date(0)),
        };
      })
      .sort((a, b) => b.atualizado_em.getTime() - a.atualizado_em.getTime());
  }

  async criar(orgaoId: string, autorId: string | null, body: any) {
    const nome = String(body?.nome ?? '').trim().slice(0, 160);
    if (nome.length < 3) throw new BadRequestException('Informe o nome do fluxo.');
    const tipo = this.tipoProcesso(body?.tipo_processo);
    const m = await this.ds.getRepository(WorkflowModelo).save(
      this.ds.getRepository(WorkflowModelo).create({ orgao_id: orgaoId, nome, descricao: null, status: 'RASCUNHO', versao: 1, tipo_processo: tipo, criado_por_id: autorId }),
    );
    return this.desenho(orgaoId, m.id);
  }

  private tipoProcesso(v: unknown): string | null {
    if (v === null || v === undefined || v === '') return null;
    const t = String(v).toUpperCase();
    if (!(TIPOS_PROCESSO_DO_FLUXO as readonly string[]).includes(t)) throw new BadRequestException('Tipo de processo inválido para o fluxo.');
    return t;
  }

  private etapasDoModelo(m: WorkflowModelo) {
    return m.fases
      .flatMap((f) => f.acoes)
      .map((a) => {
        const c = (a.configuracao ?? {}) as Record<string, any>;
        const def = definicaoDoNo(a.tipo);
        return {
          chave: a.id,
          tipo: a.tipo,
          nome: a.nome,
          responsavel_tipo: a.responsavel_tipo,
          responsaveis: Array.isArray(c.responsaveis) ? c.responsaveis : a.responsavel_valor ? [a.responsavel_valor] : [],
          prazo_dias_uteis: a.prazo_dias_uteis,
          devolver_para: typeof c.devolver_para === 'string' ? c.devolver_para : null,
          aceita_documento_externo: def?.documento.aceita_externo ? c.aceita_documento_externo !== false : false,
          avisos: c.avisos ?? null,
          notificar: c.notificar ?? null,
          obrigatoria_lei: travaLegal(a.tipo),
          formulario_id: a.formulario_id,
        };
      });
  }

  async desenho(orgaoId: string, id: string) {
    const m = await this.workflow.obter(orgaoId, id);
    const etapas = this.etapasDoModelo(m);
    const versoes: Array<{ id: string; versao: number; status: string; em_andamento: number }> = await this.ds.query(
      `SELECT m.id::text AS id, m.versao, m.status,
              (SELECT COUNT(*)::int FROM workflow_instancias i WHERE i.workflow_id = m.id AND i.status = 'EM_ANDAMENTO') AS em_andamento
         FROM workflow_modelos m WHERE m.orgao_id::text = $1 AND COALESCE(m.familia_id, m.id)::text = $2 ORDER BY m.versao DESC`,
      [orgaoId, this.familia(m)],
    );
    return {
      modelo: { id: m.id, nome: m.nome, descricao: m.descricao, tipo_processo: m.tipo_processo, versao: m.versao, status: m.status, familia_id: this.familia(m) },
      etapas,
      editavel: m.status === 'RASCUNHO',
      etapas_exigidas: ETAPAS_EXIGIDAS[m.tipo_processo ?? ''] ?? [],
      pendencias_para_ativar: m.status === 'RASCUNHO' ? this.pendenciasParaAtivar(m) : [],
      versoes,
    };
  }

  /** O que impede ativar: travas legais, responsáveis, formulário vinculado e aviso configurado. */
  private pendenciasParaAtivar(m: WorkflowModelo): string[] {
    const etapas = this.etapasDoModelo(m);
    const erros = errosParaAtivar(m.tipo_processo, etapas.map((e) => ({ ...e, responsavel_tipo: e.responsavel_tipo as any })));
    for (const e of etapas) if (e.tipo === 'FORMULARIO' && !e.formulario_id) erros.push(`Vincule um formulário à etapa "${e.nome}".`);
    for (const e of etapas) if (e.tipo === 'NOTIFICAR' && !(e.notificar as any)?.destinatarios?.length) erros.push(`Configure quem recebe e por qual canal o aviso "${e.nome}".`);
    return erros;
  }

  /** Confere que setores, usuários, canais do Teams e destinatários citados são do órgão — antes de gravar qualquer coisa. */
  private async validarReferencias(orgaoId: string, etapas: EtapaDesenho[]) {
    const ids = (tipo: 'SETOR' | 'USUARIO') => [
      ...new Set([
        ...etapas.filter((e) => e.responsavel_tipo === tipo).flatMap((e) => e.responsaveis),
        ...etapas.flatMap((e) => ((e.notificar as any)?.destinatarios ?? []).filter((d: any) => d?.tipo === tipo && d?.id).map((d: any) => String(d.id))),
      ]),
    ];
    for (const [tipo, tabela] of [['SETOR', 'setores'], ['USUARIO', 'usuarios']] as const) {
      const lista = ids(tipo);
      if (!lista.length) continue;
      const achados: Array<{ id: string }> = await this.ds.query(`SELECT id::text AS id FROM ${tabela} WHERE orgao_id::text = $1 AND id::text = ANY($2::text[])`, [orgaoId, lista]);
      if (achados.length !== lista.length) throw new BadRequestException(`Há ${tipo === 'SETOR' ? 'setor' : 'pessoa'} selecionado que não pertence a este órgão.`);
    }
  }

  async salvar(orgaoId: string, id: string, body: any) {
    const m = await this.workflow.obter(orgaoId, id);
    if (m.status !== 'RASCUNHO') throw new ConflictException('Este fluxo está ativo. Crie uma nova versão para alterar.');
    let etapas: EtapaDesenho[];
    const configs = new Map<string, { avisos: unknown; notificar: unknown }>();
    try {
      etapas = normalizarEtapas(body);
      for (const e of etapas) {
        configs.set(e.chave, {
          avisos: e.avisos === undefined || e.avisos === null ? null : normalizarAvisos(e.avisos),
          notificar: e.tipo === 'NOTIFICAR' && e.notificar ? normalizarNotificar(e.notificar) : null,
        });
      }
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const tipoProcesso = body?.tipo_processo !== undefined ? this.tipoProcesso(body.tipo_processo) : m.tipo_processo;
    const acoesAtuais = m.fases.flatMap((f) => f.acoes);
    const travadas = removidasComTrava(tipoProcesso, acoesAtuais.map((a) => a.tipo), etapas.map((e) => e.tipo));
    if (travadas.length) throw new BadRequestException(travadas.join(' '));
    const porId = new Map(acoesAtuais.map((a) => [a.id, a]));
    for (const e of etapas) if (!e.chave.startsWith('novo-') && !porId.has(e.chave)) throw new BadRequestException('Etapa não pertence a este fluxo.');
    await this.validarReferencias(orgaoId, etapas);
    for (const c of configs.values()) {
      const canais = [(c.avisos as any)?.teams_canal_id, (c.notificar as any)?.teams_canal_id].filter(Boolean) as string[];
      for (const canal of canais) if (!(await this.teams.pertenceAoOrgao(orgaoId, canal))) throw new BadRequestException('Canal do Teams não pertence a este órgão.');
    }

    await this.ds.transaction(async (mg: EntityManager) => {
      if (body?.nome !== undefined) m.nome = String(body.nome).trim().slice(0, 160) || m.nome;
      m.tipo_processo = tipoProcesso;
      await mg.update(WorkflowModelo, { id: m.id }, { nome: m.nome, tipo_processo: tipoProcesso });
      // Ordem é única por fluxo: tira tudo do caminho antes de renumerar
      for (const [i, f] of m.fases.entries()) await mg.update(WorkflowFase, { id: f.id }, { ordem: 10000 + i });
      const reivindicadas = new Set<string>();
      const idReal = new Map<string, string>();
      for (const [i, e] of etapas.entries()) {
        const existente = porId.get(e.chave);
        let faseId: string;
        if (existente && !reivindicadas.has(existente.fase_id)) {
          faseId = existente.fase_id;
          await mg.update(WorkflowFase, { id: faseId }, { ordem: i + 1, nome: e.nome.slice(0, 140) });
        } else {
          const fase = await mg.save(WorkflowFase, mg.create(WorkflowFase, { workflow_id: m.id, nome: e.nome.slice(0, 140), ordem: i + 1, cor: COR_ETAPA }));
          faseId = fase.id;
        }
        reivindicadas.add(faseId);
        const c = configs.get(e.chave)!;
        const configuracao = {
          ...((existente?.configuracao ?? {}) as Record<string, unknown>),
          responsaveis: e.responsaveis,
          aceita_documento_externo: e.aceita_documento_externo,
          avisos: c.avisos ?? undefined,
          notificar: c.notificar ?? undefined,
          devolver_para: null as string | null,
        };
        const dados = { fase_id: faseId, ordem: 1, nome: e.nome, tipo: e.tipo, responsavel_tipo: e.responsavel_tipo, responsavel_valor: null, prazo_dias_uteis: e.prazo_dias_uteis, configuracao };
        if (existente) {
          await mg.update(WorkflowAcao, { id: existente.id }, dados as any);
          idReal.set(e.chave, existente.id);
        } else {
          const nova = await mg.save(WorkflowAcao, mg.create(WorkflowAcao, { ...dados, formulario_id: null }));
          idReal.set(e.chave, nova.id);
        }
      }
      // Fases que não sobraram (com as ações removidas do desenho)
      for (const f of m.fases) if (!reivindicadas.has(f.id)) await mg.delete(WorkflowFase, { id: f.id });
      // "Devolve para": a chave da tela vira o id real da etapa
      for (const e of etapas) {
        if (!e.devolver_para) continue;
        const acaoId = idReal.get(e.chave)!;
        const acao = await mg.findOneByOrFail(WorkflowAcao, { id: acaoId });
        await mg.update(WorkflowAcao, { id: acaoId }, { configuracao: { ...(acao.configuracao ?? {}), devolver_para: idReal.get(e.devolver_para) ?? null } as any });
      }
    });
    return this.desenho(orgaoId, id);
  }

  /** Rascunho novo a partir da versão ativa (ou devolve o rascunho que já existe na família). */
  async novaVersao(orgaoId: string, id: string, autorId: string | null) {
    const origem = await this.workflow.obter(orgaoId, id);
    const familia = this.familia(origem);
    const [existente] = await this.ds.query(
      `SELECT id::text AS id FROM workflow_modelos WHERE orgao_id::text = $1 AND COALESCE(familia_id, id)::text = $2 AND status = 'RASCUNHO' LIMIT 1`,
      [orgaoId, familia],
    );
    if (existente) return this.desenho(orgaoId, existente.id);
    const [{ max }] = await this.ds.query(`SELECT COALESCE(MAX(versao), 0)::int AS max FROM workflow_modelos WHERE orgao_id::text = $1 AND COALESCE(familia_id, id)::text = $2`, [orgaoId, familia]);
    const novoId = await this.ds.transaction(async (mg) => {
      const novo = await mg.save(WorkflowModelo, mg.create(WorkflowModelo, { orgao_id: orgaoId, nome: origem.nome, descricao: origem.descricao, status: 'RASCUNHO', versao: Number(max) + 1, tipo_processo: origem.tipo_processo, familia_id: familia, criado_por_id: autorId }));
      const formularios = new Map<string, string>();
      for (const f of origem.formularios) {
        const nf = await mg.save(WorkflowFormulario, mg.create(WorkflowFormulario, { workflow_id: novo.id, nome: f.nome, descricao: f.descricao }));
        formularios.set(f.id, nf.id);
        for (const c of f.campos) await mg.save(WorkflowCampo, mg.create(WorkflowCampo, { formulario_id: nf.id, chave: c.chave, rotulo: c.rotulo, tipo: c.tipo, obrigatorio: c.obrigatorio, ordem: c.ordem, opcoes: c.opcoes, validacao: c.validacao }));
      }
      const acoes = new Map<string, string>();
      for (const fase of origem.fases) {
        const nfase = await mg.save(WorkflowFase, mg.create(WorkflowFase, { workflow_id: novo.id, nome: fase.nome, ordem: fase.ordem, cor: fase.cor }));
        for (const a of fase.acoes) {
          const na = await mg.save(WorkflowAcao, mg.create(WorkflowAcao, { fase_id: nfase.id, nome: a.nome, tipo: a.tipo, ordem: a.ordem, formulario_id: a.formulario_id ? formularios.get(a.formulario_id) ?? null : null, responsavel_tipo: a.responsavel_tipo, responsavel_valor: a.responsavel_valor, prazo_dias_uteis: a.prazo_dias_uteis, configuracao: a.configuracao }));
          acoes.set(a.id, na.id);
        }
      }
      for (const nova of acoes.values()) {
        const a = await mg.findOneByOrFail(WorkflowAcao, { id: nova });
        const destino = (a.configuracao as any)?.devolver_para;
        if (destino) await mg.update(WorkflowAcao, { id: nova }, { configuracao: { ...(a.configuracao ?? {}), devolver_para: acoes.get(destino) ?? null } as any });
      }
      return novo.id;
    });
    return this.desenho(orgaoId, novoId);
  }

  /** Ativa o rascunho: confere as travas e substitui a versão ativa da família. */
  async ativar(orgaoId: string, id: string) {
    const m = await this.workflow.obter(orgaoId, id);
    if (m.status !== 'RASCUNHO') throw new ConflictException('Só um rascunho pode ser ativado.');
    const erros = this.pendenciasParaAtivar(m);
    if (erros.length) throw new BadRequestException({ message: 'O fluxo ainda não pode ser ativado.', erros });
    await this.ds.transaction(async (mg) => {
      await mg.query(
        `UPDATE workflow_modelos SET status = 'SUBSTITUIDO', updated_at = now() WHERE orgao_id::text = $1 AND COALESCE(familia_id, id)::text = $2 AND status = 'PUBLICADO'`,
        [orgaoId, this.familia(m)],
      );
      await mg.update(WorkflowModelo, { id: m.id }, { status: 'PUBLICADO' });
    });
    return this.desenho(orgaoId, id);
  }

  /** Opções do painel da etapa: setores, pessoas ativas e canais do Teams do órgão (só do órgão do token). */
  async opcoes(orgaoId: string) {
    const [setores, usuarios, teams] = await Promise.all([
      this.ds.query(`SELECT id::text AS id, nome FROM setores WHERE orgao_id::text = $1 ORDER BY nome`, [orgaoId]),
      this.ds.query(`SELECT id::text AS id, nome, cargo, setor_id::text AS setor_id FROM usuarios WHERE orgao_id::text = $1 AND ativo = true ORDER BY nome LIMIT 1000`, [orgaoId]),
      this.teams.listar(orgaoId),
    ]);
    return { setores, usuarios, teams };
  }

  /** Lança 404 se o fluxo não é do órgão (usado pelo controller antes de ações sem retorno de desenho). */
  async exigir(orgaoId: string, id: string) {
    const [m] = await this.ds.query(`SELECT 1 FROM workflow_modelos WHERE id::text = $1 AND orgao_id::text = $2`, [id, orgaoId]);
    if (!m) throw new NotFoundException('Fluxo não encontrado');
  }
}
