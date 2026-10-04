import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { WorkflowAcao, WorkflowCampo, WorkflowFase, WorkflowFormulario, WorkflowHistorico, WorkflowInstancia, WorkflowModelo, WorkflowReacao, WorkflowTarefa } from './workflow.entities';

@Injectable()
export class WorkflowService {
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
    if (!['FORMULARIO', 'APROVACAO', 'DOCUMENTO', 'TAREFA'].includes(tipo)) throw new BadRequestException('Tipo de ação inválido');
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
    if (body?.responsavel_tipo !== undefined) acao.responsavel_tipo = String(body.responsavel_tipo).toUpperCase();
    if (body?.responsavel_valor !== undefined) acao.responsavel_valor = body.responsavel_valor || null;
    const configuracao = { ...(acao.configuracao ?? {}) };
    if (Array.isArray(body?.responsaveis)) configuracao.responsaveis = [...new Set(body.responsaveis.map(String))];
    if (body?.regra_conclusao !== undefined) {
      const regra = String(body.regra_conclusao).toUpperCase();
      if (!['QUALQUER', 'TODOS', 'MINIMO', 'SEQUENCIAL'].includes(regra)) throw new BadRequestException('Regra de conclusão inválida');
      configuracao.regra_conclusao = regra;
      if (regra === 'MINIMO') configuracao.quantidade_minima = Math.max(1, Number(body.quantidade_minima ?? 1));
    }
    acao.configuracao = configuracao;
    return this.acoes.save(acao);
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

  async iniciar(orgaoId: string, workflowId: string, atorId: string, body: any) {
    const modelo = await this.obter(orgaoId, workflowId);
    if (modelo.status !== 'PUBLICADO') throw new BadRequestException('Publique o processo antes de iniciar uma execução');
    const fase = modelo.fases[0];
    const acao = fase?.acoes[0];
    if (!fase || !acao) throw new BadRequestException('O processo precisa ter ao menos uma ação');
    const total = await this.instancias.count({ where: { orgao_id: orgaoId } });
    const numero = `WF-${new Date().getFullYear()}-${String(total + 1).padStart(5, '0')}`;
    return this.dataSource.transaction(async (manager) => {
      const instancia = await manager.save(WorkflowInstancia, manager.create(WorkflowInstancia, { orgao_id: orgaoId, workflow_id: workflowId, workflow_versao: modelo.versao, numero, titulo: String(body?.titulo ?? '').trim() || `${modelo.nome} ${numero}`, fase_atual_id: fase.id, acao_atual_id: acao.id, iniciado_por_id: atorId, vinculo_tipo: body?.vinculo_tipo || null, vinculo_id: body?.vinculo_id || null, dados: body?.dados || {} }));
      const responsaveis = Array.isArray(acao.configuracao?.responsaveis) ? acao.configuracao.responsaveis as string[] : acao.responsavel_valor ? [acao.responsavel_valor] : [atorId];
      await manager.save(WorkflowTarefa, manager.create(WorkflowTarefa, { instancia_id: instancia.id, fase_id: fase.id, acao_id: acao.id, responsavel_tipo: acao.responsavel_tipo, responsaveis, regra_conclusao: String(acao.configuracao?.regra_conclusao ?? 'QUALQUER'), prazo_em: this.prazo(acao.prazo_dias_uteis) }));
      await manager.save(WorkflowHistorico, manager.create(WorkflowHistorico, { instancia_id: instancia.id, evento: 'INICIADA', descricao: `Execução iniciada em ${fase.nome} — ${acao.nome}`, ator_id: atorId, detalhes: { workflow_versao: modelo.versao } }));
      return instancia;
    });
  }

  listarInstancias(orgaoId: string) { return this.instancias.find({ where: { orgao_id: orgaoId }, order: { updated_at: 'DESC' } }); }

  async obterInstancia(orgaoId: string, id: string) {
    const instancia = await this.instancias.findOne({ where: { id, orgao_id: orgaoId } });
    if (!instancia) throw new NotFoundException('Execução não encontrada');
    const [tarefas, historico] = await Promise.all([this.tarefas.find({ where: { instancia_id: id }, order: { created_at: 'ASC' } }), this.historico.find({ where: { instancia_id: id }, order: { created_at: 'ASC' } })]);
    return { ...instancia, tarefas, historico };
  }

  async concluirTarefa(orgaoId: string, instanciaId: string, tarefaId: string, atorId: string, body: any) {
    const instancia = await this.instancias.findOne({ where: { id: instanciaId, orgao_id: orgaoId } });
    if (!instancia) throw new NotFoundException('Execução não encontrada');
    const tarefa = await this.tarefas.findOne({ where: { id: tarefaId, instancia_id: instanciaId, status: 'ABERTA' } });
    if (!tarefa) throw new NotFoundException('Tarefa aberta não encontrada');
    const modelo = await this.obter(orgaoId, instancia.workflow_id);
    const passos = modelo.fases.flatMap((fase) => fase.acoes.map((acao) => ({ fase, acao })));
    const atual = passos.findIndex((p) => p.acao.id === tarefa.acao_id);
    const proximo = passos[atual + 1];
    await this.dataSource.transaction(async (manager) => {
      tarefa.status = 'CONCLUIDA'; tarefa.resposta = body?.resposta || {}; tarefa.concluida_por_id = atorId; tarefa.concluida_em = new Date(); await manager.save(tarefa);
      await manager.save(WorkflowHistorico, manager.create(WorkflowHistorico, { instancia_id: instanciaId, evento: 'TAREFA_CONCLUIDA', descricao: `Tarefa concluída: ${passos[atual]?.acao.nome ?? 'ação'}`, ator_id: atorId, detalhes: { resposta: tarefa.resposta } }));
      if (!proximo) { instancia.status = 'CONCLUIDA'; instancia.fase_atual_id = null; instancia.acao_atual_id = null; await manager.save(instancia); await manager.save(WorkflowHistorico, manager.create(WorkflowHistorico, { instancia_id: instanciaId, evento: 'CONCLUIDA', descricao: 'Execução concluída', ator_id: atorId, detalhes: null })); return; }
      instancia.fase_atual_id = proximo.fase.id; instancia.acao_atual_id = proximo.acao.id; await manager.save(instancia);
      const responsaveis = Array.isArray(proximo.acao.configuracao?.responsaveis) ? proximo.acao.configuracao.responsaveis as string[] : proximo.acao.responsavel_valor ? [proximo.acao.responsavel_valor] : [atorId];
      await manager.save(WorkflowTarefa, manager.create(WorkflowTarefa, { instancia_id: instanciaId, fase_id: proximo.fase.id, acao_id: proximo.acao.id, responsavel_tipo: proximo.acao.responsavel_tipo, responsaveis, regra_conclusao: String(proximo.acao.configuracao?.regra_conclusao ?? 'QUALQUER'), prazo_em: this.prazo(proximo.acao.prazo_dias_uteis) }));
      await manager.save(WorkflowHistorico, manager.create(WorkflowHistorico, { instancia_id: instanciaId, evento: 'AVANCOU', descricao: `Avançou para ${proximo.fase.nome} — ${proximo.acao.nome}`, ator_id: atorId, detalhes: null }));
    });
    return this.obterInstancia(orgaoId, instanciaId);
  }
}
