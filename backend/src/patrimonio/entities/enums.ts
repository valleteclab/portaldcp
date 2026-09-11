export enum TipoBem {
  BEM_PROPRIO = 'BEM_PROPRIO',
  BEM_LOCADO = 'BEM_LOCADO',
  BEM_SERVIDOR = 'BEM_SERVIDOR',
  BEM_COMODATO = 'BEM_COMODATO',
}

export enum EstadoConservacao {
  BOM = 'BOM',
  REGULAR = 'REGULAR',
  RUIM = 'RUIM',
  INSERVIVEL = 'INSERVIVEL',
}

export enum StatusBem {
  ATIVO = 'ATIVO',
  EM_MANUTENCAO = 'EM_MANUTENCAO',
  BAIXADO = 'BAIXADO',
  DEVOLVIDO = 'DEVOLVIDO',
}

export enum StatusManutencao {
  AGUARDANDO_DIAGNOSTICO = 'AGUARDANDO_DIAGNOSTICO',
  AGUARDANDO_CONSERTO = 'AGUARDANDO_CONSERTO',
  EM_CONSERTO = 'EM_CONSERTO',
  CONCLUIDO = 'CONCLUIDO',
}

export enum TipoEtiqueta {
  /** Plaqueta patrimonial com QR code (leitura pelo celular no inventário). */
  PLAQUETA = 'PLAQUETA',
  AVARIA = 'AVARIA',
  SITUACAO_PATRIMONIO = 'SITUACAO_PATRIMONIO',
  BEM_PARTICULAR_SERVIDOR = 'BEM_PARTICULAR_SERVIDOR',
  BEM_LOCADO = 'BEM_LOCADO',
  BEM_COMODATO = 'BEM_COMODATO',
}

// ─── Inventário (campanha de conferência) ─────────────────────────────

export enum StatusInventario {
  ABERTO = 'ABERTO',
  FECHADO = 'FECHADO',
}

export enum StatusInventarioSetor {
  PENDENTE = 'PENDENTE',
  EM_ANDAMENTO = 'EM_ANDAMENTO',
  FECHADO = 'FECHADO',
}

/** Como a leitura chegou ao sistema. */
export enum OrigemLeitura {
  QR = 'QR',
  RFID = 'RFID',
  MANUAL = 'MANUAL',
}

// ─── Movimentações (ciclo de vida do bem) ─────────────────────────────

export enum TipoMovimentacao {
  TRANSFERENCIA = 'TRANSFERENCIA',
  BAIXA = 'BAIXA',
  EMPRESTIMO = 'EMPRESTIMO',
}

export enum StatusMovimentacao {
  /** Transferência aguardando aceite do destino. */
  PENDENTE = 'PENDENTE',
  ACEITA = 'ACEITA',
  RECUSADA = 'RECUSADA',
  CANCELADA = 'CANCELADA',
  /** Empréstimo em curso (bem fora do setor). */
  EM_ANDAMENTO = 'EM_ANDAMENTO',
  CONCLUIDA = 'CONCLUIDA',
}

export enum MotivoBaixa {
  INSERVIVEL = 'INSERVIVEL',
  ALIENACAO = 'ALIENACAO',
  DOACAO = 'DOACAO',
  FURTO_EXTRAVIO = 'FURTO_EXTRAVIO',
  OUTRO = 'OUTRO',
}

/** Resultado da leitura em relação ao cadastro. */
export enum SituacaoLeitura {
  /** Bem do setor, encontrado no setor. */
  ENCONTRADO = 'ENCONTRADO',
  /** Bem cadastrado em outro setor, encontrado aqui. */
  OUTRO_SETOR = 'OUTRO_SETOR',
  /** Código lido não corresponde a nenhum bem. */
  DESCONHECIDO = 'DESCONHECIDO',
  /** Bem físico sem plaqueta, cadastrado na hora pela conferência. */
  SEM_PLAQUETA = 'SEM_PLAQUETA',
  /** Bem já baixado no cadastro, mas ainda presente. */
  BAIXADO_PRESENTE = 'BAIXADO_PRESENTE',
}
