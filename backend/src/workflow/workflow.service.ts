import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { WorkflowAcao, WorkflowCampo, WorkflowFase, WorkflowFormulario, WorkflowModelo, WorkflowReacao } from './workflow.entities';

@Injectable()
export class WorkflowService {
  constructor(
    @InjectRepository(WorkflowModelo) private readonly modelos: Repository<WorkflowModelo>,
    @InjectRepository(WorkflowFase) private readonly fases: Repository<WorkflowFase>,
    @InjectRepository(WorkflowAcao) private readonly acoes: Repository<WorkflowAcao>,
    @InjectRepository(WorkflowFormulario) private readonly formularios: Repository<WorkflowFormulario>,
    @InjectRepository(WorkflowCampo) private readonly campos: Repository<WorkflowCampo>,
    @InjectRepository(WorkflowReacao) private readonly reacoes: Repository<WorkflowReacao>,
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

  async atualizar(orgaoId: string, id: string, body: any) {
    const modelo = await this.obter(orgaoId, id);
    if (body?.nome !== undefined) modelo.nome = String(body.nome).trim() || modelo.nome;
    if (body?.descricao !== undefined) modelo.descricao = String(body.descricao).trim() || null;
    if (body?.status === 'PUBLICADO') modelo.status = 'PUBLICADO';
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
}
