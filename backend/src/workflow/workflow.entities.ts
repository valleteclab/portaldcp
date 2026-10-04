import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('workflow_modelos')
@Index('idx_workflow_modelo_orgao', ['orgao_id'])
export class WorkflowModelo {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) orgao_id: string;
  @Column({ type: 'varchar', length: 160 }) nome: string;
  @Column({ type: 'text', nullable: true }) descricao: string | null;
  @Column({ type: 'varchar', length: 20, default: 'RASCUNHO' }) status: string;
  @Column({ type: 'int', default: 1 }) versao: number;
  @Column({ type: 'varchar', length: 100, nullable: true }) criado_por_id: string | null;
  @OneToMany(() => WorkflowFase, (fase) => fase.workflow) fases: WorkflowFase[];
  @OneToMany(() => WorkflowFormulario, (formulario) => formulario.workflow) formularios: WorkflowFormulario[];
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at: Date;
}

@Entity('workflow_fases')
@Index('uq_workflow_fase_ordem', ['workflow_id', 'ordem'], { unique: true })
export class WorkflowFase {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) workflow_id: string;
  @ManyToOne(() => WorkflowModelo, (workflow) => workflow.fases, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workflow_id' }) workflow: WorkflowModelo;
  @Column({ type: 'varchar', length: 140 }) nome: string;
  @Column({ type: 'int' }) ordem: number;
  @Column({ type: 'varchar', length: 20, default: '#2563eb' }) cor: string;
  @OneToMany(() => WorkflowAcao, (acao) => acao.fase) acoes: WorkflowAcao[];
}

@Entity('workflow_formularios')
export class WorkflowFormulario {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) workflow_id: string;
  @ManyToOne(() => WorkflowModelo, (workflow) => workflow.formularios, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workflow_id' }) workflow: WorkflowModelo;
  @Column({ type: 'varchar', length: 160 }) nome: string;
  @Column({ type: 'text', nullable: true }) descricao: string | null;
  @OneToMany(() => WorkflowCampo, (campo) => campo.formulario) campos: WorkflowCampo[];
}

@Entity('workflow_campos')
@Index('uq_workflow_campo_ordem', ['formulario_id', 'ordem'], { unique: true })
export class WorkflowCampo {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) formulario_id: string;
  @ManyToOne(() => WorkflowFormulario, (formulario) => formulario.campos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'formulario_id' }) formulario: WorkflowFormulario;
  @Column({ type: 'varchar', length: 100 }) chave: string;
  @Column({ type: 'varchar', length: 160 }) rotulo: string;
  @Column({ type: 'varchar', length: 30 }) tipo: string;
  @Column({ type: 'boolean', default: false }) obrigatorio: boolean;
  @Column({ type: 'int' }) ordem: number;
  @Column({ type: 'jsonb', nullable: true }) opcoes: unknown[] | null;
  @Column({ type: 'jsonb', nullable: true }) validacao: Record<string, unknown> | null;
}

@Entity('workflow_acoes')
@Index('uq_workflow_acao_ordem', ['fase_id', 'ordem'], { unique: true })
export class WorkflowAcao {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) fase_id: string;
  @ManyToOne(() => WorkflowFase, (fase) => fase.acoes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fase_id' }) fase: WorkflowFase;
  @Column({ type: 'varchar', length: 160 }) nome: string;
  @Column({ type: 'varchar', length: 30 }) tipo: string;
  @Column({ type: 'int' }) ordem: number;
  @Column({ type: 'uuid', nullable: true }) formulario_id: string | null;
  @Column({ type: 'varchar', length: 20, default: 'SETOR' }) responsavel_tipo: string;
  @Column({ type: 'varchar', length: 100, nullable: true }) responsavel_valor: string | null;
  @Column({ type: 'int', nullable: true }) prazo_dias_uteis: number | null;
  @Column({ type: 'jsonb', nullable: true }) configuracao: Record<string, unknown> | null;
  @OneToMany(() => WorkflowReacao, (reacao) => reacao.acao) reacoes: WorkflowReacao[];
}

@Entity('workflow_reacoes')
@Index('uq_workflow_reacao_ordem', ['acao_id', 'ordem'], { unique: true })
export class WorkflowReacao {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) acao_id: string;
  @ManyToOne(() => WorkflowAcao, (acao) => acao.reacoes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'acao_id' }) acao: WorkflowAcao;
  @Column({ type: 'varchar', length: 30 }) tipo: string;
  @Column({ type: 'varchar', length: 160 }) nome: string;
  @Column({ type: 'int' }) ordem: number;
  @Column({ type: 'boolean', default: true }) ativa: boolean;
  @Column({ type: 'jsonb' }) configuracao: Record<string, unknown>;
}

@Entity('workflow_instancias')
@Index('idx_workflow_instancia_orgao', ['orgao_id', 'status'])
export class WorkflowInstancia {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) orgao_id: string;
  @Column({ type: 'uuid' }) workflow_id: string;
  @Column({ type: 'int' }) workflow_versao: number;
  @Column({ type: 'varchar', length: 40, unique: true }) numero: string;
  @Column({ type: 'varchar', length: 200 }) titulo: string;
  @Column({ type: 'varchar', length: 20, default: 'EM_ANDAMENTO' }) status: string;
  @Column({ type: 'uuid', nullable: true }) fase_atual_id: string | null;
  @Column({ type: 'uuid', nullable: true }) acao_atual_id: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) iniciado_por_id: string | null;
  @Column({ type: 'varchar', length: 40, nullable: true }) vinculo_tipo: string | null;
  @Column({ type: 'uuid', nullable: true }) vinculo_id: string | null;
  @Column({ type: 'jsonb', nullable: true }) dados: Record<string, unknown> | null;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at: Date;
}

@Entity('workflow_tarefas')
@Index('idx_workflow_tarefa_instancia', ['instancia_id', 'status'])
export class WorkflowTarefa {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) instancia_id: string;
  @Column({ type: 'uuid' }) fase_id: string;
  @Column({ type: 'uuid' }) acao_id: string;
  @Column({ type: 'varchar', length: 20, default: 'ABERTA' }) status: string;
  @Column({ type: 'varchar', length: 20 }) responsavel_tipo: string;
  @Column({ type: 'jsonb', nullable: true }) responsaveis: string[] | null;
  @Column({ type: 'varchar', length: 20, default: 'QUALQUER' }) regra_conclusao: string;
  @Column({ type: 'int', nullable: true }) quantidade_minima: number | null;
  @Column({ type: 'timestamptz', nullable: true }) prazo_em: Date | null;
  @Column({ type: 'jsonb', nullable: true }) resposta: Record<string, unknown> | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) concluida_por_id: string | null;
  @Column({ type: 'timestamptz', nullable: true }) concluida_em: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
}

@Entity('workflow_historico')
@Index('idx_workflow_historico_instancia', ['instancia_id', 'created_at'])
export class WorkflowHistorico {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) instancia_id: string;
  @Column({ type: 'varchar', length: 40 }) evento: string;
  @Column({ type: 'varchar', length: 240 }) descricao: string;
  @Column({ type: 'varchar', length: 100, nullable: true }) ator_id: string | null;
  @Column({ type: 'jsonb', nullable: true }) detalhes: Record<string, unknown> | null;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
}
