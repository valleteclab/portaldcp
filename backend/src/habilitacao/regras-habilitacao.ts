/**
 * ============================================================================
 * HABILITAÇÃO — regras puras (plano E4; Lei 14.133/2021 arts. 62–70;
 * IN SEGES 73/2022 art. 39)
 * ============================================================================
 *
 * Nada aqui toca o banco: o serviço entrega os dados e aplica o resultado.
 * Testado em `regras-habilitacao.spec.ts`.
 *
 *  - EXIGÊNCIAS do edital por categoria (arts. 66–69), com o tipo de documento
 *    do REGISTRO CADASTRAL que as atende (art. 70 — documentos substituídos
 *    pelo registro cadastral);
 *  - PRÉ-CHECAGEM do cadastro na convocação: só documento APROVADO e dentro da
 *    validade (o job diário marca VENCIDO — vencimento-documentos.service.ts);
 *  - ENVIO dentro do prazo (≥ 2 h, prorrogável uma vez — IN 73 art. 39);
 *    entregue a documentação (ato do licitante ou fim do prazo), NÃO há
 *    substituição nem documento novo — só COMPLEMENTAÇÃO em DILIGÊNCIA aberta
 *    pelo agente (Lei art. 64; IN 73 art. 39 §4º);
 *  - ANÁLISE por documento (ATENDE / NÃO ATENDE com motivo / DILIGÊNCIA) e o
 *    ato final HABILITAR (todas as exigências obrigatórias atendidas, nenhuma
 *    diligência aberta) ou INABILITAR (motivo).
 */

// ---------------------------------------------------------------------------
// Enums (varchar no banco — sem tipo enum do Postgres)
// ---------------------------------------------------------------------------

/** Categorias da habilitação (Lei 14.133 art. 62, I a IV). */
export enum CategoriaExigencia {
  /** art. 66 */
  JURIDICA = 'JURIDICA',
  /** art. 68, I a IV */
  FISCAL = 'FISCAL',
  /** art. 68, V e VI; art. 63, IV */
  SOCIAL_TRABALHISTA = 'SOCIAL_TRABALHISTA',
  /** art. 69 */
  ECONOMICO_FINANCEIRA = 'ECONOMICO_FINANCEIRA',
  /** art. 67 */
  TECNICA = 'TECNICA',
}

export const ROTULO_CATEGORIA: Record<CategoriaExigencia, string> = {
  JURIDICA: 'Habilitação jurídica (art. 66)',
  FISCAL: 'Regularidade fiscal (art. 68)',
  SOCIAL_TRABALHISTA: 'Regularidade social e trabalhista (art. 68)',
  ECONOMICO_FINANCEIRA: 'Qualificação econômico-financeira (art. 69)',
  TECNICA: 'Qualificação técnica (art. 67)',
};

/**
 * Tipos de documento do registro cadastral (espelho de
 * `fornecedores/entities/enums.ts#TipoDocumento` — mantido em texto para as
 * regras não dependerem da entidade).
 */
export const TIPOS_DOCUMENTO_CADASTRO = [
  'CARTAO_CNPJ',
  'CONTRATO_SOCIAL',
  'ESTATUTO_SOCIAL',
  'ATA_ELEICAO',
  'DOCUMENTO_IDENTIDADE_REPRESENTANTE',
  'PROCURACAO',
  'DOCUMENTO_IDENTIDADE_PROCURADOR',
  'CND_RECEITA_FEDERAL_PGFN',
  'CRF_FGTS',
  'CNDT_TST',
  'INSCRICAO_ESTADUAL_ARQUIVO',
  'INSCRICAO_MUNICIPAL_ARQUIVO',
  'CND_ESTADUAL',
  'CND_MUNICIPAL',
  'ATESTADO_CAPACIDADE_TECNICA',
  'REGISTRO_CONSELHO_CLASSE',
  'CERTIFICACAO_TECNICA',
  'BALANCO_PATRIMONIAL',
  'DRE',
  'DEMONSTRACOES_CONTABEIS',
  'CERTIDAO_FALENCIA_RECUPERACAO',
] as const;

export enum StatusHabilitacao {
  /** Convocado (ou, na inversão, acolhimento aberto): prazo correndo para enviar. */
  AGUARDANDO_ENVIO = 'AGUARDANDO_ENVIO',
  /** Documentação entregue (ato do licitante ou fim do prazo): em análise. */
  ENVIADA = 'ENVIADA',
  /** Diligência aberta (art. 64): licitante pode complementar as exigências indicadas. */
  EM_DILIGENCIA = 'EM_DILIGENCIA',
  HABILITADO = 'HABILITADO',
  INABILITADO = 'INABILITADO',
  /** Cancelada por outro ato (reinício, recurso). */
  CANCELADA = 'CANCELADA',
}

export const STATUS_HABILITACAO_ATIVOS: ReadonlyArray<string> = [
  StatusHabilitacao.AGUARDANDO_ENVIO,
  StatusHabilitacao.ENVIADA,
  StatusHabilitacao.EM_DILIGENCIA,
];

export const STATUS_HABILITACAO_FINAIS: ReadonlyArray<string> = [
  StatusHabilitacao.HABILITADO,
  StatusHabilitacao.INABILITADO,
  StatusHabilitacao.CANCELADA,
];

/** Como a habilitação nasceu. */
export enum OrigemHabilitacao {
  /** Convocação do licitante com proposta aceita (art. 63 II — só o vencedor). */
  CONVOCACAO = 'CONVOCACAO',
  /** Inversão de fases (art. 17 §1º): documentos de todos, com a proposta. */
  INVERSAO = 'INVERSAO',
  /** Convocação anterior à E4 (sessão com `fornecedor_habilitacao_id`), trazida pela migração. */
  MIGRACAO = 'MIGRACAO',
  /** Inscrição em CREDENCIAMENTO (plano E7b): documentos do interessado, analisados para credenciar. */
  INSCRICAO = 'INSCRICAO',
}

export enum OrigemDocumento {
  /** Documento do registro cadastral (art. 70) — o licitante não reenvia. */
  CADASTRO = 'CADASTRO',
  /** Enviado no prazo da convocação. */
  ENVIO = 'ENVIO',
  /** Complementação em diligência (art. 64) — nunca substitui o original. */
  COMPLEMENTO = 'COMPLEMENTO',
}

export enum ResultadoAnalise {
  PENDENTE = 'PENDENTE',
  ATENDE = 'ATENDE',
  NAO_ATENDE = 'NAO_ATENDE',
  /** Documento sob diligência (complementação pedida). */
  DILIGENCIA = 'DILIGENCIA',
}

export enum StatusDiligencia {
  ABERTA = 'ABERTA',
  /** O licitante concluiu a resposta. */
  RESPONDIDA = 'RESPONDIDA',
  /** Prazo terminou sem resposta concluída (o que foi anexado no prazo vale). */
  EXPIRADA = 'EXPIRADA',
}

/** Prazo mínimo para o envio da documentação: 2 horas, prorrogável (IN SEGES 73/2022, art. 39). */
export const PRAZO_MINIMO_HABILITACAO_HORAS = 2;
/** Prazo mínimo da diligência (mesmo piso da convocação — decisão do plano E4). */
export const PRAZO_MINIMO_DILIGENCIA_HORAS = 2;
export const MOTIVO_MINIMO = 10;

// ---------------------------------------------------------------------------
// Datas (fuso de Brasília — convenção do projeto)
// ---------------------------------------------------------------------------

const ms = (d: Date | string) => new Date(d).getTime();

export function prazoAte(inicio: Date, horas: number): Date {
  return new Date(inicio.getTime() + Number(horas) * 3_600_000);
}

/** Data de hoje em Brasília, 'AAAA-MM-DD' (validade de documento é por DATA). */
export function hojeBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

/** 'AAAA-MM-DD' de uma coluna date (string do driver ou Date). */
export function dataIso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  // coluna `date` lida como Date pelo driver = meia-noite local do processo
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

export function motivoPrazoInvalido(horas: number | undefined | null, minimo: number, oque = 'o envio dos documentos de habilitação'): string | null {
  const piso = Math.max(PRAZO_MINIMO_HABILITACAO_HORAS, Number(minimo) || PRAZO_MINIMO_HABILITACAO_HORAS);
  if (horas == null) return null;
  const h = Number(horas);
  if (!Number.isFinite(h) || h <= 0) return 'Prazo inválido';
  if (h < piso) return `O prazo para ${oque} é de no mínimo ${piso} hora(s) (IN SEGES 73/2022, art. 39).`;
  if (h > 24 * 30) return 'Prazo acima do razoável (máximo 30 dias)';
  return null;
}

// ---------------------------------------------------------------------------
// Inversão de fases (art. 17 §1º)
// ---------------------------------------------------------------------------

const FASES_INTERNAS_TXT = ['PLANEJAMENTO', 'TERMO_REFERENCIA', 'PESQUISA_PRECOS', 'ANALISE_JURIDICA', 'APROVACAO_INTERNA'];

/**
 * `inversao_fases` só na CONCORRÊNCIA (Lei 14.133 art. 17 §1º — "desde que
 * expressamente previsto no edital") e só se altera antes da publicação.
 * Devolve o motivo (400/409) ou null.
 */
export function motivoInversaoInvalida(p: {
  inversaoFinal: boolean;
  inversaoAtual: boolean;
  modalidadeFinal: string | null | undefined;
  faseAtual?: string | null;
}): { status: 400 | 409; mensagem: string } | null {
  if (p.inversaoFinal && p.modalidadeFinal !== 'CONCORRENCIA') {
    return { status: 400, mensagem: 'Inversão de fases (habilitação antes do julgamento) só é admitida na concorrência (Lei 14.133/2021, art. 17 §1º).' };
  }
  if (p.inversaoFinal !== p.inversaoAtual && p.faseAtual && !FASES_INTERNAS_TXT.includes(p.faseAtual)) {
    return { status: 409, mensagem: 'A inversão de fases é definida no edital: não pode ser alterada depois da publicação (retificação — art. 55 §1º).' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Exigências do edital
// ---------------------------------------------------------------------------

export interface ExigenciaEntrada {
  id?: string | null;
  categoria: string;
  descricao: string;
  base_legal?: string | null;
  obrigatorio?: boolean;
  aceita_registro_cadastral?: boolean;
  tipos_documento_cadastro?: string[] | null;
  exige_validade?: boolean;
  ordem?: number;
}

export interface Exigencia {
  id: string;
  categoria: string;
  descricao: string;
  base_legal?: string | null;
  obrigatorio: boolean;
  aceita_registro_cadastral: boolean;
  tipos_documento_cadastro: string[];
  exige_validade: boolean;
  ordem: number;
}

/** Normaliza e valida a lista do editor (400 com a lista de erros). */
export function validarExigencias(lista: unknown): { exigencias: Array<Omit<Exigencia, 'id'> & { id?: string | null }>; erros: string[] } {
  const erros: string[] = [];
  if (!Array.isArray(lista)) return { exigencias: [], erros: ['Informe a lista de exigências de habilitação'] };
  if (lista.length > 100) erros.push('No máximo 100 exigências por licitação');
  const categorias = Object.values(CategoriaExigencia) as string[];
  const exigencias = lista.map((bruto: any, i) => {
    const n = i + 1;
    const categoria = String(bruto?.categoria ?? '').trim().toUpperCase();
    if (!categorias.includes(categoria)) erros.push(`Exigência ${n}: categoria inválida (${bruto?.categoria ?? 'vazia'})`);
    const descricao = String(bruto?.descricao ?? '').trim();
    if (descricao.length < 5) erros.push(`Exigência ${n}: descreva o documento exigido (mín. 5 caracteres)`);
    const tipos = Array.isArray(bruto?.tipos_documento_cadastro) ? bruto.tipos_documento_cadastro.map((t: any) => String(t).trim().toUpperCase()).filter(Boolean) : [];
    const invalidos = tipos.filter((t: string) => !(TIPOS_DOCUMENTO_CADASTRO as readonly string[]).includes(t));
    if (invalidos.length) erros.push(`Exigência ${n}: tipo(s) de documento do cadastro inválido(s): ${invalidos.join(', ')}`);
    const aceita = bruto?.aceita_registro_cadastral !== false && tipos.length > 0;
    return {
      id: typeof bruto?.id === 'string' && bruto.id ? bruto.id : null,
      categoria,
      descricao: descricao.slice(0, 1000),
      base_legal: bruto?.base_legal ? String(bruto.base_legal).trim().slice(0, 200) : null,
      obrigatorio: bruto?.obrigatorio !== false,
      aceita_registro_cadastral: aceita,
      tipos_documento_cadastro: [...new Set(tipos as string[])],
      exige_validade: !!bruto?.exige_validade,
      ordem: n,
    };
  });
  return { exigencias, erros };
}

// ---------------------------------------------------------------------------
// Registro cadastral (art. 70)
// ---------------------------------------------------------------------------

export interface DocumentoCadastro {
  id: string;
  tipo: string;
  status: string;
  data_validade: string | Date | null;
  data_emissao?: string | Date | null;
  numero_documento?: string | null;
  nome_arquivo?: string | null;
  caminho_arquivo?: string | null;
  created_at?: string | Date | null;
}

/**
 * O documento do cadastro vale para a exigência? Só APROVADO (analisado pelo
 * gestor do cadastro), nunca VENCIDO, e dentro da validade (por DATA, em
 * Brasília). Se a exigência pede validade, documento sem data de validade não
 * serve (o agente não teria como conferir).
 */
export function motivoDocumentoCadastroInvalido(doc: DocumentoCadastro, exigeValidade: boolean, hoje: string): string | null {
  if (doc.status === 'VENCIDO') return 'documento do cadastro vencido';
  if (doc.status !== 'APROVADO') return `documento do cadastro não aprovado (situação ${doc.status})`;
  const validade = dataIso(doc.data_validade);
  if (validade && validade < hoje) return `documento do cadastro vencido em ${validade.split('-').reverse().join('/')}`;
  if (exigeValidade && !validade) return 'documento do cadastro sem data de validade';
  return null;
}

export interface CoberturaCadastro {
  exigenciaId: string;
  coberta: boolean;
  documento: DocumentoCadastro | null;
  /** Por que não está coberta (nenhum documento / vencido / não aprovado...). */
  motivo: string | null;
}

/**
 * PRÉ-CHECAGEM do registro cadastral: para cada exigência que aceita o
 * cadastro, o melhor documento VÁLIDO de um dos tipos mapeados (validade mais
 * longa; sem validade conta como indeterminada; empate → o mais recente).
 * Fornecedor com cadastro SUSPENSO/REJEITADO não aproveita o registro.
 */
export function preChecagemCadastro(
  exigencias: Array<Pick<Exigencia, 'id' | 'aceita_registro_cadastral' | 'tipos_documento_cadastro' | 'exige_validade'>>,
  documentos: DocumentoCadastro[],
  hoje: string,
  statusCadastro?: string | null,
): CoberturaCadastro[] {
  const cadastroImpedido = statusCadastro === 'SUSPENSO' || statusCadastro === 'REJEITADO';
  return exigencias.map((e) => {
    if (!e.aceita_registro_cadastral || !e.tipos_documento_cadastro?.length) {
      return { exigenciaId: e.id, coberta: false, documento: null, motivo: 'exigência não aceita o registro cadastral' };
    }
    if (cadastroImpedido) {
      return { exigenciaId: e.id, coberta: false, documento: null, motivo: `cadastro do fornecedor ${String(statusCadastro).toLowerCase()}` };
    }
    const doTipo = documentos.filter((d) => e.tipos_documento_cadastro.includes(d.tipo));
    if (!doTipo.length) return { exigenciaId: e.id, coberta: false, documento: null, motivo: 'sem documento deste tipo no cadastro' };
    const validos = doTipo.filter((d) => !motivoDocumentoCadastroInvalido(d, e.exige_validade, hoje));
    if (!validos.length) {
      return { exigenciaId: e.id, coberta: false, documento: null, motivo: motivoDocumentoCadastroInvalido(doTipo[0], e.exige_validade, hoje) };
    }
    const chave = (d: DocumentoCadastro) => `${dataIso(d.data_validade) ?? '9999-12-31'}|${d.created_at ? new Date(d.created_at).toISOString() : ''}`;
    const melhor = [...validos].sort((a, b) => (chave(a) < chave(b) ? 1 : chave(a) > chave(b) ? -1 : 0))[0];
    return { exigenciaId: e.id, coberta: true, documento: melhor, motivo: null };
  });
}

// ---------------------------------------------------------------------------
// Prazos e estado efetivo
// ---------------------------------------------------------------------------

export interface EstadoHabilitacao {
  status: string;
  origem?: string;
  prazo_ate: Date | string | null;
  prazo_horas?: number | string | null;
  prorrogada_em?: Date | string | null;
  enviada_em?: Date | string | null;
}

export interface EstadoDiligencia {
  id: string;
  status: string;
  prazo_ate: Date | string;
  exigencia_ids: string[];
}

export function prazoEntregaEncerrado(h: EstadoHabilitacao, agora: Date = new Date()): boolean {
  return !!h.prazo_ate && agora.getTime() > ms(h.prazo_ate);
}

/** Diligência aberta e no prazo. */
export function diligenciaVigente(d: EstadoDiligencia, agora: Date = new Date()): boolean {
  return d.status === StatusDiligencia.ABERTA && agora.getTime() <= ms(d.prazo_ate);
}

/** Status da diligência considerando o relógio (ABERTA vencida → EXPIRADA). */
export function statusEfetivoDiligencia(d: EstadoDiligencia, agora: Date = new Date()): string {
  if (d.status === StatusDiligencia.ABERTA && !diligenciaVigente(d, agora)) return StatusDiligencia.EXPIRADA;
  return d.status;
}

/**
 * Status considerando o relógio: AGUARDANDO_ENVIO com o prazo encerrado =
 * documentação ENTREGUE (o que foi anexado no prazo vale — não se reabre);
 * EM_DILIGENCIA sem diligência vigente = de volta à análise (ENVIADA).
 */
export function statusEfetivo(h: EstadoHabilitacao, diligencias: EstadoDiligencia[], agora: Date = new Date()): string {
  if (h.status === StatusHabilitacao.AGUARDANDO_ENVIO && prazoEntregaEncerrado(h, agora)) return StatusHabilitacao.ENVIADA;
  if (h.status === StatusHabilitacao.EM_DILIGENCIA && !diligencias.some((d) => diligenciaVigente(d, agora))) return StatusHabilitacao.ENVIADA;
  return h.status;
}

/** Prorrogação: uma única vez, pelo mesmo período, antes do fim do prazo, só na convocação. */
export function motivoNaoProrroga(h: EstadoHabilitacao, agora: Date = new Date()): string | null {
  if (h.origem === OrigemHabilitacao.INVERSAO) return 'Na inversão de fases o prazo é o do recebimento das propostas (edital)';
  if (h.origem === OrigemHabilitacao.INSCRICAO) return 'Na inscrição em credenciamento o prazo é a vigência do edital';
  if (h.status !== StatusHabilitacao.AGUARDANDO_ENVIO) return 'Só se prorroga o prazo da convocação aguardando o envio dos documentos';
  if (h.prorrogada_em) return 'O prazo já foi prorrogado uma vez (prorrogação única, pelo mesmo período)';
  if (prazoEntregaEncerrado(h, agora)) return 'O prazo já terminou — não é possível prorrogá-lo';
  return null;
}

/**
 * ENVIO de documento (regra do art. 64 — sem substituição):
 *  - AGUARDANDO_ENVIO no prazo → ENVIO (a documentação ainda não foi entregue);
 *  - depois de entregue (ato ou prazo): só COMPLEMENTO, numa diligência
 *    vigente que inclua a exigência;
 *  - decidida → nada.
 */
export function regraDeEnvio(
  h: EstadoHabilitacao,
  exigenciaId: string,
  diligencias: EstadoDiligencia[],
  agora: Date = new Date(),
): { origem: OrigemDocumento; diligenciaId: string | null } | { erro: string } {
  if (STATUS_HABILITACAO_FINAIS.includes(h.status)) return { erro: 'A habilitação deste licitante já foi decidida — não se recebem documentos' };
  if (h.status === StatusHabilitacao.AGUARDANDO_ENVIO && !prazoEntregaEncerrado(h, agora)) {
    return { origem: OrigemDocumento.ENVIO, diligenciaId: null };
  }
  const d = diligencias.find((x) => diligenciaVigente(x, agora) && x.exigencia_ids.includes(exigenciaId));
  if (d) return { origem: OrigemDocumento.COMPLEMENTO, diligenciaId: d.id };
  if (diligencias.some((x) => diligenciaVigente(x, agora))) {
    return { erro: 'A diligência aberta não inclui esta exigência — só se complementam os documentos indicados pelo agente (art. 64)' };
  }
  return {
    erro:
      'Documentação já entregue: não é permitida a substituição nem a apresentação de novos documentos, ' +
      'salvo em diligência aberta pelo agente de contratação (Lei 14.133/2021, art. 64; IN SEGES 73/2022, art. 39 §4º)',
  };
}

/** Remover documento: só o próprio envio, antes da entrega (rascunho), e ainda não analisado. */
export function motivoNaoRemove(
  h: EstadoHabilitacao,
  doc: { origem: string; analise: string },
  agora: Date = new Date(),
): string | null {
  if (doc.origem !== OrigemDocumento.ENVIO) return 'Só se retira documento enviado pelo licitante antes da entrega da documentação';
  if (h.status !== StatusHabilitacao.AGUARDANDO_ENVIO || prazoEntregaEncerrado(h, agora)) {
    return 'Documentação já entregue: não é permitida a substituição (art. 64)';
  }
  if (doc.analise !== ResultadoAnalise.PENDENTE) return 'Documento já analisado';
  return null;
}

/** Conclusão da entrega pelo licitante (antes do fim do prazo). */
export function motivoNaoConcluiEnvio(h: EstadoHabilitacao, agora: Date = new Date()): string | null {
  if (h.status !== StatusHabilitacao.AGUARDANDO_ENVIO) return 'A documentação já foi entregue';
  if (prazoEntregaEncerrado(h, agora)) return 'O prazo terminou: a documentação anexada até o fim do prazo já foi considerada entregue';
  return null;
}

/** Análise de documento: só com a documentação entregue e a habilitação não decidida. */
export function motivoNaoAnalisa(statusEfetivoAtual: string): string | null {
  if (STATUS_HABILITACAO_FINAIS.includes(statusEfetivoAtual)) return 'A habilitação deste licitante já foi decidida';
  if (statusEfetivoAtual === StatusHabilitacao.AGUARDANDO_ENVIO) {
    return 'O licitante ainda está no prazo de envio — aguarde a entrega da documentação ou o fim do prazo';
  }
  return null;
}

/** Abertura de diligência (art. 64): documentação entregue, motivo, prazo e exigências da licitação. */
export function motivoNaoAbreDiligencia(
  statusEfetivoAtual: string,
  p: { motivo?: string | null; prazoHoras?: number | null; exigenciaIds?: string[] | null },
  exigenciasDaLicitacao: string[],
): string | null {
  const base = motivoNaoAnalisa(statusEfetivoAtual);
  if (base) return base;
  if (((p.motivo ?? '').trim()).length < MOTIVO_MINIMO) return `Informe o motivo da diligência (mín. ${MOTIVO_MINIMO} caracteres)`;
  const prazo = motivoPrazoInvalido(p.prazoHoras ?? null, PRAZO_MINIMO_DILIGENCIA_HORAS, 'a resposta à diligência');
  if (prazo) return prazo;
  if (p.prazoHoras == null) return 'Informe o prazo da diligência (em horas)';
  const ids = p.exigenciaIds ?? [];
  if (!ids.length) return 'Indique as exigências que podem ser complementadas';
  const fora = ids.filter((i) => !exigenciasDaLicitacao.includes(i));
  if (fora.length) return 'Exigência não pertence a esta licitação';
  return null;
}

export interface DocumentoAnalise {
  exigencia_id: string;
  analise: string;
}

/**
 * Pendências do HABILITAR: nenhuma diligência vigente e cada exigência
 * OBRIGATÓRIA com ao menos um documento ATENDE (cadastro, envio ou
 * complemento). Rótulos com a descrição da exigência.
 */
export function pendenciasParaHabilitar(
  exigencias: Array<Pick<Exigencia, 'id' | 'descricao' | 'obrigatorio'>>,
  documentos: DocumentoAnalise[],
  diligencias: EstadoDiligencia[],
  agora: Date = new Date(),
): string[] {
  const pend: string[] = [];
  if (diligencias.some((d) => diligenciaVigente(d, agora))) pend.push('Há diligência em aberto — aguarde a resposta ou o fim do prazo');
  for (const e of exigencias) {
    if (!e.obrigatorio) continue;
    const docs = documentos.filter((d) => d.exigencia_id === e.id);
    if (docs.some((d) => d.analise === ResultadoAnalise.ATENDE)) continue;
    if (!docs.length) pend.push(`${e.descricao}: nenhum documento apresentado`);
    else if (docs.some((d) => d.analise === ResultadoAnalise.PENDENTE || d.analise === ResultadoAnalise.DILIGENCIA)) pend.push(`${e.descricao}: análise pendente`);
    else pend.push(`${e.descricao}: não atendida`);
  }
  return pend;
}

/** Situação de cada exigência para as telas: ATENDIDA | NAO_ATENDIDA | EM_ANALISE | SEM_DOCUMENTO. */
export function situacaoDaExigencia(docs: DocumentoAnalise[]): 'ATENDIDA' | 'NAO_ATENDIDA' | 'EM_ANALISE' | 'SEM_DOCUMENTO' {
  if (!docs.length) return 'SEM_DOCUMENTO';
  if (docs.some((d) => d.analise === ResultadoAnalise.ATENDE)) return 'ATENDIDA';
  if (docs.some((d) => d.analise === ResultadoAnalise.PENDENTE || d.analise === ResultadoAnalise.DILIGENCIA)) return 'EM_ANALISE';
  return 'NAO_ATENDIDA';
}
