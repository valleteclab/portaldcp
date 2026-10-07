import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

/**
 * TIPOS DE PROCESSO (decisão do dono de 28/09/2026: "tudo é processo
 * administrativo"). A licitação/contratação é o PRIMEIRO tipo; os demais
 * entram como enum/registro em dados, SEM implementação nesta etapa.
 *
 * `varchar` (não enum do Postgres): a lista cresce sem recriar tipo.
 */
export enum TipoProcesso {
  /** Licitação ou contratação direta: o conteúdo é a `licitacoes` (fase interna, disputa, resultado). */
  CONTRATACAO = 'CONTRATACAO',
  /** Termo aditivo de contrato — esqueleto (próxima etapa). */
  ADITIVO = 'ADITIVO',
  /** Renovação/prorrogação de contrato — esqueleto (próxima etapa). */
  RENOVACAO = 'RENOVACAO',
  /** Pagamento (liquidação de medição/nota) — esqueleto (próxima etapa). */
  PAGAMENTO = 'PAGAMENTO',
  /** Processo sem fluxo: só autuação, tramitação e juntada de documentos. */
  AVULSO = 'AVULSO',
  /** Ofício: escreve, assina e envia a outro setor; numerado por setor e ano. Livre (sem fluxo). */
  OFICIO = 'OFICIO',
}

export type SituacaoProcesso = 'ABERTO' | 'ENCERRADO';

/** Objeto de conteúdo apontado por `referencia_tipo`/`referencia_id`. */
export type ReferenciaProcesso = 'LICITACAO' | 'TERMO_ADITIVO';
export const REFERENCIA_LICITACAO: ReferenciaProcesso = 'LICITACAO';
/** Resultado do processo de ADITIVO: o termo aditivo cadastrado (`termos_aditivos.id`). */
export const REFERENCIA_TERMO_ADITIVO: ReferenciaProcesso = 'TERMO_ADITIVO';

/**
 * PROCESSO ADMINISTRATIVO ELETRÔNICO (estilo SEI) — a autuação: número único
 * do órgão, objeto, situação, setor de origem e quem abriu.
 *
 * O conteúdo de cada tipo fica na tabela própria do tipo (para CONTRATACAO,
 * `licitacoes`), apontada por `referencia_tipo` + `referencia_id`. Autos
 * (`juntadas_autos`), tramitação (`tramitacoes_processo`), fluxo
 * (`fluxos_processo_fase_interna`), tarefas e peças (`documentos_fase_interna`)
 * ganham `processo_id` (nulo nesta etapa; preenchido pela migração de boot
 * e pelas criações novas) — ver docs/processo/PLANO-PROCESSO-ELETRONICO.md.
 *
 * Unicidade: um número por órgão (a mesma regra de `licitacoes`) e uma
 * referência por processo (um `Processo` para cada licitação).
 */
@Entity('processos')
@Unique('UQ_processos_orgao_numero', ['orgao_id', 'numero'])
@Index('UQ_processos_referencia', ['referencia_tipo', 'referencia_id'], { unique: true, where: '"referencia_id" IS NOT NULL' })
@Index('IDX_processos_orgao_tipo_situacao', ['orgao_id', 'tipo', 'situacao'])
@Index('IDX_processos_contrato', ['contrato_id'])
export class Processo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orgao_id: string;

  @Column({ type: 'varchar', length: 30 })
  tipo: TipoProcesso;

  /** Nº do processo administrativo (gerador único por órgão/ano ou digitado). */
  @Column({ type: 'varchar', length: 60 })
  numero: string;

  @Column({ type: 'text' })
  objeto: string;

  @Column({ type: 'varchar', length: 20, default: 'ABERTO' })
  situacao: SituacaoProcesso;

  /** Objeto de conteúdo (CONTRATACAO → 'LICITACAO' + `licitacoes.id`). Nulo no AVULSO. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  referencia_tipo: ReferenciaProcesso | null;

  @Column({ type: 'uuid', nullable: true })
  referencia_id: string | null;

  /** Contrato a que o processo se refere (ADITIVO, RENOVACAO): nasce com o processo; o resultado entra em `referencia_*`. */
  @Column({ type: 'uuid', nullable: true })
  contrato_id: string | null;

  /** Setor que autuou (lotação de quem abriu), quando conhecido. */
  @Column({ type: 'uuid', nullable: true })
  setor_origem_id: string | null;

  /** Quem abriu: usuário do órgão, o próprio órgão (login do órgão) ou o sistema (migração/importação). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  aberto_por_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  aberto_por_nome: string | null;

  /** Como o processo nasceu: ASSISTENTE, DFD, DEMANDA, FEITA_FORA, IMPORTACAO, CREDENCIAMENTO, MIGRACAO, AVULSO… */
  @Column({ type: 'varchar', length: 30, nullable: true })
  origem: string | null;

  @Column({ type: 'timestamptz' })
  aberto_em: Date;

  @Column({ type: 'timestamptz', nullable: true })
  encerrado_em: Date | null;

  @Column({ type: 'text', nullable: true })
  motivo_encerramento: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

/**
 * REGISTRO EM DADOS DOS TIPOS DE PROCESSO (semeado no boot, idempotente).
 * O "como" de cada tipo (catálogo de documentos, campos de condição,
 * requisitos, ganchos) fica em código (`tipos/`); AQUI fica o que o órgão vê
 * e o admin da plataforma pode ligar/desligar: rótulo, descrição, ordem e se
 * o tipo está disponível para abertura.
 */
@Entity('tipos_processo')
export class TipoProcessoRegistro {
  @Column({ type: 'varchar', length: 30, primary: true })
  codigo: TipoProcesso;

  @Column({ type: 'varchar', length: 100 })
  rotulo: string;

  @Column({ type: 'text', nullable: true })
  descricao: string | null;

  /** Tabela de conteúdo apontada pela referência (LICITACAO…); nulo = sem conteúdo próprio. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  referencia_tipo: string | null;

  /** Tipo já implementado no sistema (os demais são esqueleto). */
  @Column({ type: 'boolean', default: false })
  implementado: boolean;

  /** Pode ser aberto diretamente por `POST /processos` (sem objeto de conteúdo). */
  @Column({ type: 'boolean', default: false })
  abertura_direta: boolean;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @Column({ type: 'int', default: 0 })
  ordem: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
