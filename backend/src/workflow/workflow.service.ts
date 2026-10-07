import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { Ator } from '../auth/acesso/ator';
import { WorkflowAcao, WorkflowCampo, WorkflowFase, WorkflowFormulario, WorkflowHistorico, WorkflowInstancia, WorkflowModelo, WorkflowReacao, WorkflowTarefa } from './workflow.entities';
import { definicaoDoNo } from './nos/catalogo-nos';
import { RegistroNos, VINCULO_PROCESSO, type ContextoNo } from './nos/executor-no';
import { TeamsService } from './avisos/teams.service';
import { normalizarAvisos, normalizarNotificar } from './avisos/destinatarios';
import { ehResponsavelDaTarefa } from './responsavel';
import { ehFaseInterna } from '../licitacoes/transicoes/fases';

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    @InjectRepository(WorkflowModelo) private readonly modelos: Repository<WorkflowModelo>,
    @InjectRepository(WorkflowFase) private readonly fases: Repository<WorkflowFase>,
    @InjectRepository(WorkflowAcao) private readonly acoes: Repository<WorkflowAcao>,
    @InjectRepository(WorkflowFormulario) private readonly formularios: Repository<WorkflowFormulario>,
    @InjectRepository(WorkflowCampo) private readonly campos: Repository<WorkflowCampo>,
    @InjectRepository(WorkflowReacao) private readonly reacoes: Repository<WorkflowReacao>,
    @InjectRepository(WorkflowInstancia) private readonly instancias: Repository<WorkflowInstancia>,
    @InjectRepository(WorkflowTarefa) private readonly tarefas: Repository<WorkflowTarefa>,
    @InjectRepository(WorkflowHistorico) private readonly historico: Repository<WorkflowHistorico>,
    private readonly dataSource: DataSource,
    private readonly registro: RegistroNos,
    private readonly teams: TeamsService,
  ) {}

  listar(orgaoId: string) { return this.modelos.find({ where: { orgao_id: orgaoId }, order: { updated_at: 'DESC' } }); }

  async obter(orgaoId: string, id: string) {
    const modelo = await this.modelos.findOne({ where: { id, orgao_id: orgaoId }, relations: { fases: { acoes: { reacoes: true } }, formularios: { campos: true } } });
    if (!modelo) throw new NotFoundException('Fluxo de trabalho não encontrado');
    modelo.fases.sort((a, b) => a.ordem - b.ordem);
    modelo.fases.forEach((f) => { f.acoes.sort((a, b) => a.ordem - b.ordem); f.acoes.forEach((a) => a.reacoes.sort((x, y) => x.ordem - y.ordem)); });
    modelo.formularios.forEach((f) => f.campos.sort((a, b) => a.ordem - b.ordem));
    return modelo;
  }

  async criar(orgaoId: string, autorId: string | null, body: any) {
    const nome = String(body?.nome ?? '').trim();
    if (!nome) throw new BadRequestException('Informe o nome do processo');
    const id = await this.dataSource.transaction(async (manager) => {
      const modelo = await manager.save(WorkflowModelo, manager.create(WorkflowModelo, { orgao_id: orgaoId, criado_por_id: autorId, nome, descricao: String(body?.descricao ?? '').trim() || null }));
      await manager.save(WorkflowFase, [manager.create(WorkflowFase, { workflow_id: modelo.id, nome: 'Solicitação', ordem: 1, cor: '#0891b2' }), manager.create(WorkflowFase, { workflow_id: modelo.id, nome: 'Finalização', ordem: 2, cor: '#16a34a' })]);
      return modelo.id;
    });
    return this.obter(orgaoId, id);
  }

  async criarModeloAditivo(orgaoId: string, autorId: string | null) {
    const nome = 'Solicitação de aditivo contratual';
    const existente = await this.modelos.findOne({ where: { orgao_id: orgaoId, nome } });
    if (existente) return this.obter(orgaoId, existente.id);
    const id = await this.dataSource.transaction(async (manager) => {
      const modelo = await manager.save(WorkflowModelo, manager.create(WorkflowModelo, { orgao_id: orgaoId, criado_por_id: autorId, nome, descricao: 'Do pedido inicial à formalização e publicação do termo aditivo.' }));
      const nomesFases = ['Solicitação', 'Análise do fiscal', 'Análise administrativa', 'Parecer jurídico', 'Autorização', 'Termo e assinaturas', 'Publicação'];
      const fases = await manager.save(WorkflowFase, nomesFases.map((fase, i) => manager.create(WorkflowFase, { workflow_id: modelo.id, nome: fase, ordem: i + 1, cor: ['#0891b2', '#2563eb', '#6366f1', '#7c3aed', '#eab308', '#ea580c', '#16a34a'][i] })));
      const formulario = await manager.save(WorkflowFormulario, manager.create(WorkflowFormulario, { workflow_id: modelo.id, nome: 'Solicitação de aditivo', descricao: 'Dados necessários para iniciar a análise do aditivo.' }));
      const campos = [
        ['tipo_aditivo', 'Tipo do aditivo', 'LISTA', true, ['Prazo', 'Valor', 'Prazo e valor', 'Supressão', 'Outro']],
        ['justificativa', 'Justificativa', 'TEXTO_LONGO', true, null], ['novo_prazo', 'Novo prazo pretendido', 'DATA', false, null],
        ['valor_alteracao', 'Valor da alteração', 'MOEDA', false, null], ['documentos', 'Documentos comprobatórios', 'ARQUIVO', false, null],
      ];
      await manager.save(WorkflowCampo, campos.map((c, i) => manager.create(WorkflowCampo, { formulario_id: formulario.id, chave: c[0] as string, rotulo: c[1] as string, tipo: c[2] as string, obrigatorio: c[3] as boolean, ordem: i + 1, opcoes: c[4] as unknown[] | null, validacao: null })));
      const nomesAcoes = ['Preencher solicitação', 'Manifestação do fiscal', 'Conferir requisitos e limites', 'Emitir parecer jurídico', 'Autorizar aditivo', 'Elaborar e coletar assinaturas', 'Publicar e concluir'];
      const tipos = ['FORMULARIO', 'APROVACAO', 'TAREFA', 'APROVACAO', 'APROVACAO', 'DOCUMENTO', 'TAREFA'];
      for (let i = 0; i < fases.length; i++) {
        const acao = await manager.save(WorkflowAcao, manager.create(WorkflowAcao, { fase_id: fases[i].id, nome: nomesAcoes[i], tipo: tipos[i], ordem: 1, formulario_id: i === 0 ? formulario.id : null, responsavel_tipo: i === 0 ? 'SOLICITANTE' : 'SETOR', responsavel_valor: null, prazo_dias_uteis: [2, 3, 3, 5, 2, 3, 2][i], configuracao: { responsaveis: [], regra_conclusao: 'QUALQUER', requer_configuracao_responsavel: i !== 0 } }));
        if (i < fases.length - 1) await manager.save(WorkflowReacao, manager.create(WorkflowReacao, { acao_id: acao.id, tipo: 'NOTIFICACAO', nome: `Avisar responsável por ${nomesFases[i + 1]}`, ordem: 1, ativa: true, configuracao: { destinatario: '{{proximo_responsavel}}', mensagem: `O processo {{numero}} aguarda: ${nomesAcoes[i + 1]}.` } }));
      }
      return modelo.id;
    });
    return this.obter(orgaoId, id);
  }

  /**
   * Modelo pronto para testar os nós DEMANDA → APROVACAO → DFD (item 4 do
   * pedido): responsável SOLICITANTE em todas as etapas, para dar para
   * iniciar e rodar sem precisar configurar setor/usuário antes. Já publicado.
   */
  async criarModeloDemandaDfd(orgaoId: string, autorId: string | null) {
    const nome = 'Contratação — DFD e aprovação';
    const existente = await this.modelos.findOne({ where: { orgao_id: orgaoId, nome } });
    if (existente) return this.obter(orgaoId, existente.id);
    const id = await this.dataSource.transaction(async (manager) => {
      const modelo = await manager.save(
        WorkflowModelo,
        manager.create(WorkflowModelo, { orgao_id: orgaoId, criado_por_id: autorId, nome, descricao: 'Modelo de teste: o DFD (com as demandas já aprovadas na Central) e a aprovação dele.', status: 'PUBLICADO' }),
      );
      const nomesFases = ['DFD', 'Aprovação do DFD'];
      const tipos = ['DFD', 'APROVACAO'];
      const cores = ['#7c3aed', '#eab308'];
      const prazos = [5, 2];
      const fases = await manager.save(WorkflowFase, nomesFases.map((f, i) => manager.create(WorkflowFase, { workflow_id: modelo.id, nome: f, ordem: i + 1, cor: cores[i] })));
      for (let i = 0; i < fases.length; i++) {
        await manager.save(
          WorkflowAcao,
          manager.create(WorkflowAcao, { fase_id: fases[i].id, nome: nomesFases[i], tipo: tipos[i], ordem: 1, formulario_id: null, responsavel_tipo: 'SOLICITANTE', responsavel_valor: null, prazo_dias_uteis: prazos[i], configuracao: { responsaveis: [] } }),
        );
      }
      return modelo.id;
    });
    return this.obter(orgaoId, id);
  }

  async atualizar(orgaoId: string, id: string, body: any) {
    const modelo = await this.obter(orgaoId, id);
    if (body?.nome !== undefined) modelo.nome = String(body.nome).trim() || modelo.nome;
    if (body?.descricao !== undefined) modelo.descricao = String(body.descricao).trim() || null;
    if (body?.status === 'PUBLICADO') {
      const erros: string[] = [];
      if (!modelo.fases.length) erros.push('Crie ao menos uma fase.');
      for (const fase of modelo.fases) {
        if (!fase.acoes.length) erros.push(`A fase "${fase.nome}" não possui ação.`);
        for (const acao of fase.acoes) {
          const responsaveis = Array.isArray(acao.configuracao?.responsaveis) ? acao.configuracao.responsaveis : [];
          if (acao.responsavel_tipo !== 'SOLICITANTE' && !acao.responsavel_valor && !responsaveis.length) erros.push(`Defina o responsável da ação "${acao.nome}".`);
          if (acao.tipo === 'FORMULARIO' && !acao.formulario_id) erros.push(`Vincule um formulário à ação "${acao.nome}".`);
        }
      }
      if (erros.length) throw new BadRequestException(erros);
      modelo.status = 'PUBLICADO';
    }
    return this.modelos.save(modelo);
  }

  async adicionarFase(orgaoId: string, workflowId: string, body: any) {
    await this.obter(orgaoId, workflowId);
    const ordem = await this.fases.count({ where: { workflow_id: workflowId } }) + 1;
    return this.fases.save(this.fases.create({ workflow_id: workflowId, nome: String(body?.nome ?? '').trim() || `Nova fase ${ordem}`, ordem, cor: String(body?.cor ?? '#2563eb') }));
  }

  async adicionarFormulario(orgaoId: string, workflowId: string, body: any) {
    await this.obter(orgaoId, workflowId);
    return this.formularios.save(this.formularios.create({ workflow_id: workflowId, nome: String(body?.nome ?? '').trim() || 'Novo formulário', descricao: null }));
  }

  async adicionarCampo(orgaoId: string, workflowId: string, formularioId: string, body: any) {
    const modelo = await this.obter(orgaoId, workflowId);
    if (!modelo.formularios.some((f) => f.id === formularioId)) throw new NotFoundException('Formulário não encontrado');
    const ordem = await this.campos.count({ where: { formulario_id: formularioId } }) + 1;
    const rotulo = String(body?.rotulo ?? '').trim() || `Campo ${ordem}`;
    const chave = String(body?.chave ?? rotulo).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `campo_${ordem}`;
    return this.campos.save(this.campos.create({ formulario_id: formularioId, ordem, rotulo, chave, tipo: String(body?.tipo ?? 'TEXTO').toUpperCase(), obrigatorio: body?.obrigatorio === true, opcoes: Array.isArray(body?.opcoes) ? body.opcoes : null, validacao: null }));
  }

  async adicionarAcao(orgaoId: string, workflowId: string, faseId: string, body: any) {
    const modelo = await this.obter(orgaoId, workflowId);
    if (!modelo.fases.some((f) => f.id === faseId)) throw new NotFoundException('Fase não encontrada');
    const ordem = await this.acoes.count({ where: { fase_id: faseId } }) + 1;
    const tipo = String(body?.tipo ?? 'TAREFA').toUpperCase();
    if (!definicaoDoNo(tipo)?.disponivel) throw new BadRequestException('Tipo de etapa indisponível');
    return this.acoes.save(this.acoes.create({ fase_id: faseId, ordem, nome: String(body?.nome ?? '').trim() || 'Nova ação', tipo, formulario_id: body?.formulario_id || null, responsavel_tipo: String(body?.responsavel_tipo ?? 'SETOR'), responsavel_valor: body?.responsavel_valor || null, prazo_dias_uteis: body?.prazo_dias_uteis ?? null, configuracao: null }));
  }

  async adicionarReacao(orgaoId: string, workflowId: string, acaoId: string, body: any) {
    const modelo = await this.obter(orgaoId, workflowId);
    if (!modelo.fases.some((f) => f.acoes.some((a) => a.id === acaoId))) throw new NotFoundException('Ação não encontrada');
    const ordem = await this.reacoes.count({ where: { acao_id: acaoId } }) + 1;
    const tipo = String(body?.tipo ?? 'NOTIFICACAO').toUpperCase();
    if (!['EMAIL', 'WHATSAPP', 'NOTIFICACAO', 'GERAR_DOCUMENTO', 'AVANCAR', 'ALTERAR_RESPONSAVEL', 'WEBHOOK'].includes(tipo)) throw new BadRequestException('Tipo de reação inválido');
    return this.reacoes.save(this.reacoes.create({ acao_id: acaoId, ordem, tipo, nome: String(body?.nome ?? '').trim() || tipo, ativa: true, configuracao: body?.configuracao && typeof body.configuracao === 'object' ? body.configuracao : {} }));
  }

  async atualizarAcao(orgaoId: string, workflowId: string, acaoId: string, body: any) {
    const modelo = await this.obter(orgaoId, workflowId);
    const acao = modelo.fases.flatMap((fase) => fase.acoes).find((item) => item.id === acaoId);
    if (!acao) throw new NotFoundException('Ação não encontrada');
    if (body?.nome !== undefined) acao.nome = String(body.nome).trim() || acao.nome;
    if (body?.formulario_id !== undefined) {
      if (body.formulario_id && !modelo.formularios.some((f) => f.id === body.formulario_id)) throw new BadRequestException('Formulário não pertence a este processo');
      acao.formulario_id = body.formulario_id || null;
    }
    if (body?.prazo_dias_uteis !== undefined) acao.prazo_dias_uteis = body.prazo_dias_uteis === null ? null : Math.max(0, Number(body.prazo_dias_uteis));
    if (body?.responsavel_tipo !== undefined) {
      const tipo = String(body.responsavel_tipo).toUpperCase();
      if (!['USUARIO', 'SETOR', 'SOLICITANTE'].includes(tipo)) throw new BadRequestException('Tipo de responsável inválido');
      acao.responsavel_tipo = tipo;
    }
    if (body?.responsavel_valor !== undefined) acao.responsavel_valor = body.responsavel_valor || null;
    const configuracao = { ...(acao.configuracao ?? {}) };
    if (Array.isArray(body?.responsaveis)) {
      const informados: unknown[] = body.responsaveis;
      const responsaveis = acao.responsavel_tipo === 'SOLICITANTE' ? [] : [...new Set(informados.map(String).filter(Boolean))];
      if (responsaveis.length) {
        const tabela = acao.responsavel_tipo === 'SETOR' ? 'setores' : 'usuarios';
        const encontrados: Array<{ id: string }> = await this.dataSource.query(
          `SELECT id::text AS id FROM ${tabela} WHERE orgao_id::text = $1 AND id::text = ANY($2::text[])`,
          [orgaoId, responsaveis],
        );
        if (encontrados.length !== responsaveis.length) throw new BadRequestException('Há responsável selecionado que não pertence a este órgão');
      }
      configuracao.responsaveis = responsaveis;
      if (acao.responsavel_tipo === 'SOLICITANTE') acao.responsavel_valor = null;
    }
    if (body?.regra_conclusao !== undefined) {
      const regra = String(body.regra_conclusao).toUpperCase();
      if (!['QUALQUER', 'TODOS', 'MINIMO', 'SEQUENCIAL'].includes(regra)) throw new BadRequestException('Regra de conclusão inválida');
      configuracao.regra_conclusao = regra;
      if (regra === 'MINIMO') configuracao.quantidade_minima = Math.max(1, Number(body.quantidade_minima ?? 1));
    }
    if (body?.avisos !== undefined) {
      try {
        const avisos = normalizarAvisos(body.avisos);
        if (avisos.teams_canal_id) await this.validarTeamsCanal(orgaoId, avisos.teams_canal_id);
        configuracao.avisos = avisos;
      } catch (e) { throw new BadRequestException((e as Error).message); }
    }
    if (body?.notificar !== undefined) {
      try {
        const notificar = normalizarNotificar(body.notificar);
        await this.validarDestinatarios(orgaoId, notificar.destinatarios);
        if (notificar.teams_canal_id) await this.validarTeamsCanal(orgaoId, notificar.teams_canal_id);
        configuracao.notificar = notificar;
      } catch (e) { throw new BadRequestException((e as Error).message); }
    }
    acao.configuracao = configuracao;
    return this.acoes.save(acao);
  }

  private async validarTeamsCanal(orgaoId: string, canalId: string) {
    if (!(await this.teams.pertenceAoOrgao(orgaoId, canalId))) throw new BadRequestException('Canal do Teams não pertence a este órgão');
  }

  private async validarDestinatarios(orgaoId: string, destinatarios: Array<{ tipo: string; id?: string }>) {
    for (const tipo of ['SETOR', 'USUARIO'] as const) {
      const ids = [...new Set(destinatarios.filter((d) => d.tipo === tipo && d.id).map((d) => d.id as string))];
      if (!ids.length) continue;
      const tabela = tipo === 'SETOR' ? 'setores' : 'usuarios';
      const encontrados: Array<{ id: string }> = await this.dataSource.query(
        `SELECT id::text AS id FROM ${tabela} WHERE orgao_id::text = $1 AND id::text = ANY($2::text[])`,
        [orgaoId, ids],
      );
      if (encontrados.length !== ids.length) throw new BadRequestException('Há destinatário selecionado que não pertence a este órgão');
    }
  }

  async atualizarReacao(orgaoId: string, workflowId: string, reacaoId: string, body: any) {
    const modelo = await this.obter(orgaoId, workflowId);
    const reacao = modelo.fases.flatMap((f) => f.acoes).flatMap((a) => a.reacoes).find((r) => r.id === reacaoId);
    if (!reacao) throw new NotFoundException('Reação não encontrada');
    if (body?.nome !== undefined) reacao.nome = String(body.nome).trim() || reacao.nome;
    if (body?.ativa !== undefined) reacao.ativa = body.ativa === true;
    if (body?.configuracao && typeof body.configuracao === 'object') reacao.configuracao = { ...reacao.configuracao, ...body.configuracao };
    return this.reacoes.save(reacao);
  }

  private prazo(dias: number | null) {
    if (!dias) return null;
    const data = new Date();
    let restantes = dias;
    while (restantes > 0) { data.setDate(data.getDate() + 1); if (data.getDay() !== 0 && data.getDay() !== 6) restantes--; }
    return data;
  }

  // ==========================================================================
  // Execução
  // ==========================================================================

  private passos(modelo: WorkflowModelo) {
    return modelo.fases.flatMap((fase) => fase.acoes.map((acao) => ({ fase, acao })));
  }

  private criarTarefa(manager: EntityManager, instancia: WorkflowInstancia, fase: WorkflowFase, acao: WorkflowAcao, responsavelPadrao: string) {
    const responsaveis = Array.isArray(acao.configuracao?.responsaveis) ? acao.configuracao.responsaveis as string[] : acao.responsavel_valor ? [acao.responsavel_valor] : [responsavelPadrao];
    return manager.save(WorkflowTarefa, manager.create(WorkflowTarefa, { instancia_id: instancia.id, fase_id: fase.id, acao_id: acao.id, responsavel_tipo: acao.responsavel_tipo, responsaveis, regra_conclusao: typeof acao.configuracao?.regra_conclusao === 'string' ? acao.configuracao.regra_conclusao : 'QUALQUER', quantidade_minima: Number(acao.configuracao?.quantidade_minima ?? 1), prazo_em: this.prazo(acao.prazo_dias_uteis) }));
  }

  private contexto(instancia: WorkflowInstancia, acao: WorkflowAcao, tarefa: WorkflowTarefa, atorId: string | null): ContextoNo {
    return { orgaoId: instancia.orgao_id, instancia, acao, tarefa, processoId: instancia.vinculo_tipo === VINCULO_PROCESSO ? instancia.vinculo_id : null, atorId };
  }

  /** Processo do órgão ao qual a execução vai se ligar; um processo tem no máximo uma execução em andamento. */
  private async validarProcesso(orgaoId: string, processoId: string) {
    const [processo] = await this.dataSource.query(
      `SELECT p.id, p.tipo, l.fase::text AS fase FROM processos p
         LEFT JOIN licitacoes l ON p.referencia_tipo = 'LICITACAO' AND l.id = p.referencia_id
        WHERE p.id::text = $1 AND p.orgao_id::text = $2`,
      [processoId, orgaoId],
    );
    if (!processo) throw new NotFoundException('Processo não encontrado');
    // Contratação: o fluxo conduz a fase interna (a fase externa segue na tela da licitação)
    if (processo.tipo === 'CONTRATACAO' && !ehFaseInterna(processo.fase)) throw new BadRequestException('A fase interna desta contratação já terminou: o fluxo só pode ser iniciado durante ela.');
    const emAndamento = await this.instancias.count({ where: { orgao_id: orgaoId, vinculo_tipo: VINCULO_PROCESSO, vinculo_id: processoId, status: 'EM_ANDAMENTO' } });
    if (emAndamento) throw new BadRequestException('Este processo já tem um fluxo em andamento');
  }

  async iniciar(orgaoId: string, workflowId: string, atorId: string, body: any) {
    const modelo = await this.obter(orgaoId, workflowId);
    if (modelo.status !== 'PUBLICADO') throw new BadRequestException('Publique o processo antes de iniciar uma execução');
    const fase = modelo.fases[0];
    const acao = fase?.acoes[0];
    if (!fase || !acao) throw new BadRequestException('O processo precisa ter ao menos uma ação');
    const processoId = body?.processo_id ? String(body.processo_id) : null;
    if (processoId) await this.validarProcesso(orgaoId, processoId);
    const total = await this.instancias.count({ where: { orgao_id: orgaoId } });
    const numero = `WF-${new Date().getFullYear()}-${String(total + 1).padStart(5, '0')}`;
    const { instancia, tarefa } = await this.dataSource.transaction(async (manager) => {
      const instancia = await manager.save(WorkflowInstancia, manager.create(WorkflowInstancia, { orgao_id: orgaoId, workflow_id: workflowId, workflow_versao: modelo.versao, numero, titulo: String(body?.titulo ?? '').trim() || `${modelo.nome} ${numero}`, fase_atual_id: fase.id, acao_atual_id: acao.id, iniciado_por_id: atorId, vinculo_tipo: processoId ? VINCULO_PROCESSO : body?.vinculo_tipo || null, vinculo_id: processoId ?? (body?.vinculo_id || null), dados: body?.dados || {} }));
      const tarefa = await this.criarTarefa(manager, instancia, fase, acao, atorId);
      await manager.save(WorkflowHistorico, manager.create(WorkflowHistorico, { instancia_id: instancia.id, evento: 'INICIADA', descricao: `Execução iniciada em ${fase.nome} — ${acao.nome}`, ator_id: atorId, detalhes: { workflow_versao: modelo.versao } }));
      return { instancia, tarefa };
    });
    await this.aposCriarTarefa(instancia, acao, tarefa, atorId);
    return instancia;
  }

  listarInstancias(orgaoId: string) { return this.instancias.find({ where: { orgao_id: orgaoId }, order: { updated_at: 'DESC' } }); }

  async obterInstancia(orgaoId: string, id: string) {
    const instancia = await this.instancias.findOne({ where: { id, orgao_id: orgaoId } });
    if (!instancia) throw new NotFoundException('Execução não encontrada');
    const [tarefas, historico] = await Promise.all([this.tarefas.find({ where: { instancia_id: id }, order: { created_at: 'ASC' } }), this.historico.find({ where: { instancia_id: id }, order: { created_at: 'ASC' } })]);
    return { ...instancia, tarefas, historico };
  }

  /** Execução mais recente ligada ao processo (a em andamento primeiro), com o modelo e as tarefas — base do andamento. */
  async execucaoDoProcesso(orgaoId: string, processoId: string) {
    const instancias = await this.instancias.find({ where: { orgao_id: orgaoId, vinculo_tipo: VINCULO_PROCESSO, vinculo_id: processoId }, order: { created_at: 'DESC' } });
    const instancia = instancias.find((i) => i.status === 'EM_ANDAMENTO') ?? instancias[0];
    if (!instancia) return null;
    const [modelo, tarefas] = await Promise.all([this.obter(orgaoId, instancia.workflow_id), this.tarefas.find({ where: { instancia_id: instancia.id }, order: { created_at: 'ASC' } })]);
    return { instancia, modelo, passos: this.passos(modelo), tarefas };
  }

  private async chaveDoResponsavel(orgaoId: string, instancia: WorkflowInstancia, tarefa: WorkflowTarefa, ator: Ator) {
    const atorId = ator.usuarioId ?? ator.id;
    if (ator.tipo === 'ORGAO') return { chave: atorId, administrador: true };
    if (tarefa.responsavel_tipo === 'SOLICITANTE') {
      if (instancia.iniciado_por_id !== atorId) throw new ForbiddenException('Esta tarefa pertence ao solicitante do processo');
      return { chave: atorId, administrador: false };
    }
    const responsaveis = Array.isArray(tarefa.responsaveis) ? tarefa.responsaveis : [];
    if (tarefa.responsavel_tipo === 'USUARIO') {
      if (!responsaveis.includes(atorId)) throw new ForbiddenException('Você não é um dos responsáveis por esta tarefa');
      return { chave: atorId, administrador: false };
    }
    const usuarios: Array<{ setor_id: string | null }> = ator.usuarioId ? await this.dataSource.query(
      `SELECT setor_id::text AS setor_id FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2 AND ativo = true`,
      [ator.usuarioId, orgaoId],
    ) : [];
    const usuario = usuarios[0];
    if (!usuario?.setor_id || !responsaveis.includes(usuario.setor_id)) throw new ForbiddenException('Esta tarefa pertence a outro setor');
    return { chave: String(usuario.setor_id), administrador: false };
  }

  async concluirTarefa(orgaoId: string, instanciaId: string, tarefaId: string, ator: Ator, body: any) {
    const instancia = await this.instancias.findOne({ where: { id: instanciaId, orgao_id: orgaoId } });
    if (!instancia) throw new NotFoundException('Execução não encontrada');
    const tarefa = await this.tarefas.findOne({ where: { id: tarefaId, instancia_id: instanciaId, status: 'ABERTA' } });
    if (!tarefa) throw new NotFoundException('Tarefa aberta não encontrada');
    const atorId = ator.usuarioId ?? ator.id;
    const identidade = await this.chaveDoResponsavel(orgaoId, instancia, tarefa, ator);
    const armazenadas = tarefa.resposta?._conclusoes;
    const anteriores: string[] = Array.isArray(armazenadas) ? armazenadas.map((item: unknown) => String(item)) : [];
    if (!identidade.administrador && anteriores.includes(identidade.chave)) throw new BadRequestException('Você já registrou sua conclusão nesta tarefa');
    const responsaveis = Array.isArray(tarefa.responsaveis) ? tarefa.responsaveis : [];
    const regra = String(tarefa.regra_conclusao || 'QUALQUER').toUpperCase();
    if (!identidade.administrador && regra === 'SEQUENCIAL' && responsaveis[anteriores.length] !== identidade.chave) throw new ForbiddenException('Aguarde o responsável anterior concluir esta tarefa');
    const conclusoes = [...anteriores, identidade.chave];
    const exigidas = regra === 'TODOS' || regra === 'SEQUENCIAL'
      ? Math.max(1, responsaveis.length)
      : regra === 'MINIMO'
        ? Math.max(1, Math.min(tarefa.quantidade_minima ?? 1, responsaveis.length || 1))
        : 1;
    // O checklist só muda pelas rotas próprias (com origem e autor); o corpo do concluir não o altera
    const { checklist: _ignorado, ...respostaLivre } = (body?.resposta ?? {}) as Record<string, unknown>;
    void _ignorado;
    tarefa.resposta = { ...(tarefa.resposta ?? {}), ...respostaLivre, _conclusoes: conclusoes };
    if (!identidade.administrador && conclusoes.length < exigidas) {
      await this.tarefas.save(tarefa);
      await this.historico.save(this.historico.create({ instancia_id: instanciaId, evento: 'CONCLUSAO_REGISTRADA', descricao: `Conclusão registrada (${conclusoes.length}/${exigidas})`, ator_id: atorId, detalhes: { regra, conclusoes: conclusoes.length, exigidas } }));
      return this.obterInstancia(orgaoId, instanciaId);
    }
    await this.avancar(instancia, tarefa, atorId);
    return this.obterInstancia(orgaoId, instanciaId);
  }

  /**
   * Conclui a tarefa e abre a próxima. As pendências do executor do nó
   * barram a conclusão; o `aoConcluir` roda na mesma transação; os ouvintes
   * (avisos) só são chamados depois de gravado.
   */
  private async avancar(instancia: WorkflowInstancia, tarefa: WorkflowTarefa, atorId: string | null) {
    const modelo = await this.obter(instancia.orgao_id, instancia.workflow_id);
    const passos = this.passos(modelo);
    const atual = passos.findIndex((p) => p.acao.id === tarefa.acao_id);
    const passo = passos[atual];
    if (!passo) throw new BadRequestException('A etapa desta tarefa não existe mais no fluxo');
    const ctx = this.contexto(instancia, passo.acao, tarefa, atorId);
    const pendencias = await this.registro.pendencias(ctx);
    if (pendencias.length) throw new BadRequestException({ message: 'Etapa com pendências', pendencias });
    const proximo = passos[atual + 1];
    const executor = this.registro.executor(passo.acao.tipo);
    const novaTarefa = await this.dataSource.transaction(async (manager) => {
      if (executor?.aoConcluir) await executor.aoConcluir(ctx, manager);
      tarefa.status = 'CONCLUIDA'; tarefa.concluida_por_id = atorId; tarefa.concluida_em = new Date(); await manager.save(tarefa);
      await manager.save(WorkflowHistorico, manager.create(WorkflowHistorico, { instancia_id: instancia.id, evento: 'TAREFA_CONCLUIDA', descricao: `Tarefa concluída: ${passo.acao.nome}`, ator_id: atorId, detalhes: { resposta: tarefa.resposta } }));
      if (!proximo) { instancia.status = 'CONCLUIDA'; instancia.fase_atual_id = null; instancia.acao_atual_id = null; await manager.save(instancia); await manager.save(WorkflowHistorico, manager.create(WorkflowHistorico, { instancia_id: instancia.id, evento: 'CONCLUIDA', descricao: 'Execução concluída', ator_id: atorId, detalhes: null })); return null; }
      instancia.fase_atual_id = proximo.fase.id; instancia.acao_atual_id = proximo.acao.id; await manager.save(instancia);
      const nova = await this.criarTarefa(manager, instancia, proximo.fase, proximo.acao, atorId ?? instancia.iniciado_por_id ?? '');
      await manager.save(WorkflowHistorico, manager.create(WorkflowHistorico, { instancia_id: instancia.id, evento: 'AVANCOU', descricao: `Avançou para ${proximo.fase.nome} — ${proximo.acao.nome}`, ator_id: atorId, detalhes: null }));
      return nova;
    });
    await this.registro.emitir({ tipo: 'TAREFA_CONCLUIDA', ctx });
    if (!novaTarefa) await this.registro.emitir({ tipo: 'FLUXO_CONCLUIDO', ctx });
    else await this.aposCriarTarefa(instancia, proximo!.acao, novaTarefa, atorId);
  }

  /**
   * Depois de gravada uma tarefa nova: avisa os ouvintes e, se o nó é
   * automático (ex.: Notificar), executa e conclui sem pessoa. Falha do nó
   * automático deixa a tarefa aberta e registra no histórico — o fluxo para
   * ali, visível, em vez de pular a etapa.
   */
  private async aposCriarTarefa(instancia: WorkflowInstancia, acao: WorkflowAcao, tarefa: WorkflowTarefa, atorId: string | null) {
    const ctx = this.contexto(instancia, acao, tarefa, atorId);
    await this.registro.emitir({ tipo: 'TAREFA_CRIADA', ctx });
    const executor = this.registro.executor(acao.tipo);
    if (!definicaoDoNo(acao.tipo)?.automatico || !executor?.executarAutomatico) return;
    try {
      await executor.executarAutomatico({ ...ctx, atorId: null });
      await this.avancar(instancia, tarefa, null);
    } catch (e) {
      this.logger.warn(`Nó automático ${acao.tipo} falhou (tarefa ${tarefa.id}): ${(e as Error).message}`);
      await this.historico.save(this.historico.create({ instancia_id: instancia.id, evento: 'FALHA_AUTOMATICA', descricao: `Falha ao executar ${acao.nome}: ${(e as Error).message}`.slice(0, 240), ator_id: null, detalhes: null }));
    }
  }

  async devolverTarefa(orgaoId: string, instanciaId: string, tarefaId: string, ator: Ator, body: any) {
    const instancia = await this.instancias.findOne({ where: { id: instanciaId, orgao_id: orgaoId } });
    if (!instancia) throw new NotFoundException('Execução não encontrada');
    const tarefa = await this.tarefas.findOne({ where: { id: tarefaId, instancia_id: instanciaId, status: 'ABERTA' } });
    if (!tarefa) throw new NotFoundException('Tarefa aberta não encontrada');
    await this.chaveDoResponsavel(orgaoId, instancia, tarefa, ator);
    const motivo = String(body?.motivo ?? '').trim();
    if (!motivo) throw new BadRequestException('Informe o motivo da devolução');
    const modelo = await this.obter(orgaoId, instancia.workflow_id);
    const passos = this.passos(modelo);
    const atual = passos.findIndex((passo) => passo.acao.id === tarefa.acao_id);
    // "Devolve para" configurado no desenho (etapa anterior escolhida); senão, a etapa imediatamente anterior
    const destinoDesenho = (passos[atual]?.acao.configuracao as any)?.devolver_para;
    const anterior = (destinoDesenho && passos.slice(0, Math.max(0, atual)).find((p) => p.acao.id === destinoDesenho)) || passos[atual - 1];
    if (!anterior) throw new BadRequestException('A primeira etapa não pode ser devolvida');
    const atorId = ator.usuarioId ?? ator.id;
    const reaberta = await this.dataSource.transaction(async (manager) => {
      tarefa.status = 'DEVOLVIDA';
      tarefa.resposta = { ...(tarefa.resposta ?? {}), decisao: 'DEVOLVIDO', motivo };
      tarefa.concluida_por_id = atorId;
      tarefa.concluida_em = new Date();
      await manager.save(tarefa);
      instancia.fase_atual_id = anterior.fase.id;
      instancia.acao_atual_id = anterior.acao.id;
      await manager.save(instancia);
      const nova = await this.criarTarefa(manager, instancia, anterior.fase, anterior.acao, instancia.iniciado_por_id ?? atorId);
      await manager.save(WorkflowHistorico, manager.create(WorkflowHistorico, { instancia_id: instanciaId, evento: 'DEVOLVIDA', descricao: `Etapa devolvida para ${anterior.fase.nome} — ${anterior.acao.nome}: ${motivo}`, ator_id: atorId, detalhes: { motivo, tarefa_id: tarefaId } }));
      return nova;
    });
    if (passos[atual]) await this.registro.emitir({ tipo: 'TAREFA_DEVOLVIDA', ctx: this.contexto(instancia, passos[atual].acao, tarefa, atorId) });
    await this.aposCriarTarefa(instancia, anterior.acao, reaberta, atorId);
    return this.obterInstancia(orgaoId, instanciaId);
  }

  /**
   * Quem pode juntar o documento de uma etapa do fluxo (`etapa = 'no:<acao_id>'`)
   * fora da posse da tramitação: a etapa precisa estar ABERTA na execução em
   * andamento DESTE processo e o ator precisa ser responsável por ela — a mesma
   * regra de quem conclui. Sem isso, `no:<qualquer id>` abriria os autos de
   * qualquer processo do órgão para qualquer usuário.
   */
  async exigirResponsavelDaEtapaDoProcesso(orgaoId: string, processoId: string, acaoId: string, ator: Ator) {
    const instancia = await this.instancias.findOne({ where: { orgao_id: orgaoId, vinculo_tipo: VINCULO_PROCESSO, vinculo_id: processoId, status: 'EM_ANDAMENTO' } });
    if (!instancia) throw new BadRequestException('Este processo não tem fluxo em andamento.');
    const tarefa = await this.tarefas.findOne({ where: { instancia_id: instancia.id, acao_id: acaoId, status: 'ABERTA' } });
    if (!tarefa) throw new BadRequestException('Esta etapa não está em andamento no fluxo do processo.');
    await this.chaveDoResponsavel(orgaoId, instancia, tarefa, ator);
    const acao = await this.acoes.findOne({ where: { id: acaoId } });
    // Desenho pode exigir o documento feito no sistema (sem anexar PDF pronto)
    return { aceitaDocumentoExterno: (acao?.configuracao as any)?.aceita_documento_externo !== false };
  }

  /** Quem é o ator para a regra de responsável (lotação vem do cadastro, nunca do corpo). */
  private async quemE(orgaoId: string, ator: Ator) {
    const atorId = ator.usuarioId ?? ator.id;
    const [u] = ator.usuarioId
      ? await this.dataSource.query(`SELECT setor_id::text AS setor_id FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2 AND ativo = true`, [ator.usuarioId, orgaoId])
      : [];
    return { ehLoginDoOrgao: ator.tipo === 'ORGAO', atorId, usuarioId: ator.usuarioId ?? null, setorId: (u?.setor_id as string | undefined) ?? null };
  }

  /** O processo tem fluxo em andamento? (enquanto tiver, o envio é feito pelas etapas, não à mão) */
  async temFluxoEmAndamento(orgaoId: string, processoId: string): Promise<boolean> {
    return (await this.instancias.count({ where: { orgao_id: orgaoId, vinculo_tipo: VINCULO_PROCESSO, vinculo_id: processoId, status: 'EM_ANDAMENTO' } })) > 0;
  }

  /** O ator pode concluir/devolver esta tarefa? (para mostrar ou esconder os botões) */
  async podeAgirNaTarefa(orgaoId: string, instancia: { iniciado_por_id: string | null }, tarefa: { responsavel_tipo: string; responsaveis: unknown }, ator: Ator) {
    return ehResponsavelDaTarefa(tarefa, instancia, await this.quemE(orgaoId, ator));
  }

  /**
   * Etapas abertas do fluxo que dependem do ator (Central de Aprovações e
   * caixas de tarefas): só do órgão do token, só execuções em andamento.
   * `tipo` filtra pelo tipo da etapa (ex.: APROVACAO).
   */
  async minhasEtapas(orgaoId: string, ator: Ator, tipo?: string | null) {
    const linhas: any[] = await this.dataSource.query(
      `SELECT t.id::text AS tarefa_id, t.instancia_id::text AS instancia_id, t.responsavel_tipo, t.responsaveis, t.prazo_em, t.created_at,
              i.iniciado_por_id, i.vinculo_tipo, i.vinculo_id::text AS processo_id, a.nome AS etapa, a.tipo,
              p.numero AS processo_numero, p.objeto AS processo_objeto
         FROM workflow_tarefas t
         JOIN workflow_instancias i ON i.id = t.instancia_id
         JOIN workflow_acoes a ON a.id = t.acao_id
         LEFT JOIN processos p ON i.vinculo_tipo = 'PROCESSO' AND p.id = i.vinculo_id AND p.orgao_id = i.orgao_id
        WHERE i.orgao_id::text = $1 AND i.status = 'EM_ANDAMENTO' AND t.status = 'ABERTA'
          AND ($2::text IS NULL OR a.tipo = $2::text)
        ORDER BY t.prazo_em ASC NULLS LAST, t.created_at ASC`,
      [orgaoId, tipo ? String(tipo).toUpperCase() : null],
    );
    const quem = await this.quemE(orgaoId, ator);
    return linhas
      .filter((l) => ehResponsavelDaTarefa(l, l, quem))
      .map((l) => ({
        tarefa_id: l.tarefa_id,
        instancia_id: l.instancia_id,
        etapa: l.etapa,
        tipo: l.tipo,
        prazo_em: l.prazo_em,
        desde: l.created_at,
        processo: l.processo_id && l.processo_numero ? { id: l.processo_id, numero: l.processo_numero, objeto: l.processo_objeto } : null,
      }));
  }

  /** Tarefa de uma execução do órgão, com a ação (etapa) dela — 404 se não for do órgão. */
  async tarefaDaInstancia(orgaoId: string, instanciaId: string, tarefaId: string) {
    const instancia = await this.instancias.findOne({ where: { id: instanciaId, orgao_id: orgaoId } });
    if (!instancia) throw new NotFoundException('Execução não encontrada');
    const tarefa = await this.tarefas.findOne({ where: { id: tarefaId, instancia_id: instanciaId } });
    if (!tarefa) throw new NotFoundException('Tarefa não encontrada');
    const modelo = await this.obter(orgaoId, instancia.workflow_id);
    const acao = this.passos(modelo).find((p) => p.acao.id === tarefa.acao_id)?.acao;
    if (!acao) throw new NotFoundException('Etapa não encontrada');
    return { instancia, tarefa, acao };
  }

  /** Mesma regra de quem conclui: só o responsável pela tarefa aberta (ou o login do órgão). */
  async exigirResponsavelDaTarefa(orgaoId: string, instanciaId: string, tarefaId: string, ator: Ator) {
    const r = await this.tarefaDaInstancia(orgaoId, instanciaId, tarefaId);
    if (r.tarefa.status !== 'ABERTA') throw new BadRequestException('Esta etapa não está mais em andamento.');
    await this.chaveDoResponsavel(orgaoId, r.instancia, r.tarefa, ator);
    const [u] = ator.usuarioId ? await this.dataSource.query(`SELECT nome FROM usuarios WHERE id::text = $1`, [ator.usuarioId]) : [];
    return { ...r, nomeDoAtor: (u?.nome as string | undefined) ?? 'Órgão' };
  }

  /** Nome, tipo de documento e modelo escolhido no desenho para a etapa de um fluxo ligado ao processo (nulo se não é). */
  async documentoDaEtapa(orgaoId: string, processoId: string, acaoId: string) {
    const instancias = await this.instancias.find({ where: { orgao_id: orgaoId, vinculo_tipo: VINCULO_PROCESSO, vinculo_id: processoId } });
    for (const i of instancias) {
      const modelo = await this.obter(orgaoId, i.workflow_id);
      const acao = this.passos(modelo).find((p) => p.acao.id === acaoId)?.acao;
      if (acao) {
        return { nome: acao.nome, tipo_documento: definicaoDoNo(acao.tipo)?.tipo_documento ?? null, modelo_documento_id: ((acao.configuracao as any)?.modelo_documento_id as string | undefined) ?? null };
      }
    }
    return null;
  }

  /**
   * Indefere a tarefa (decisão de uma etapa de APROVACAO) e ENCERRA a
   * execução — ao contrário da devolução, não há etapa seguinte. Método
   * aditivo: não muda o comportamento de concluir/devolver existentes.
   */
  async indeferirTarefa(orgaoId: string, instanciaId: string, tarefaId: string, ator: Ator, body: any) {
    const instancia = await this.instancias.findOne({ where: { id: instanciaId, orgao_id: orgaoId } });
    if (!instancia) throw new NotFoundException('Execução não encontrada');
    const tarefa = await this.tarefas.findOne({ where: { id: tarefaId, instancia_id: instanciaId, status: 'ABERTA' } });
    if (!tarefa) throw new NotFoundException('Tarefa aberta não encontrada');
    await this.chaveDoResponsavel(orgaoId, instancia, tarefa, ator);
    const motivo = String(body?.motivo ?? '').trim();
    if (!motivo) throw new BadRequestException('Informe o motivo do indeferimento');
    const modelo = await this.obter(orgaoId, instancia.workflow_id);
    const passos = this.passos(modelo);
    const passo = passos.find((p) => p.acao.id === tarefa.acao_id);
    const atorId = ator.usuarioId ?? ator.id;
    const ctx = passo ? this.contexto(instancia, passo.acao, tarefa, atorId) : null;
    await this.dataSource.transaction(async (manager) => {
      tarefa.status = 'INDEFERIDA';
      tarefa.resposta = { ...(tarefa.resposta ?? {}), decisao: 'INDEFERIDO', motivo };
      tarefa.concluida_por_id = atorId;
      tarefa.concluida_em = new Date();
      await manager.save(tarefa);
      instancia.status = 'INDEFERIDA';
      instancia.fase_atual_id = null;
      instancia.acao_atual_id = null;
      await manager.save(instancia);
      await manager.save(WorkflowHistorico, manager.create(WorkflowHistorico, { instancia_id: instanciaId, evento: 'INDEFERIDA', descricao: `Etapa indeferida${passo ? `: ${passo.acao.nome}` : ''} — ${motivo}`, ator_id: atorId, detalhes: { motivo, tarefa_id: tarefaId } }));
    });
    if (ctx) await this.registro.emitir({ tipo: 'FLUXO_CONCLUIDO', ctx });
    return this.obterInstancia(orgaoId, instanciaId);
  }
}
