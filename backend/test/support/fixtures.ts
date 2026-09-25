/**
 * Fábricas de dados para os e2e de licitação.
 *
 * Regra: tudo passa pela API PÚBLICA do backend (a mesma que o frontend usa).
 * Só se cai para repositório quando não existe rota — e isso fica comentado
 * no ponto em que acontece. Tokens de órgão/fornecedor são assinados com o
 * mesmo payload do login real (AuthService.loginOrgao / loginFornecedor),
 * porque o login exige senha/e-mail que o cadastro por API não define.
 */
import { AppE2E } from './app';
import { UserType } from '../../src/auth/auth.service';
import { TipoOrgao, EsferaAdministrativa } from '../../src/orgaos/entities/orgao.entity';
import { ModuloSistema } from '../../src/orgaos/enums/modulos.enum';
import { PorteEmpresa } from '../../src/fornecedores/entities/enums';
import { RoleUsuario } from '../../src/usuarios/entities/usuario.entity';
import { TipoParticipacao, UnidadeMedida } from '../../src/itens/entities/item-licitacao.entity';
import {
  CriterioJulgamento,
  FaseLicitacao,
  ModalidadeLicitacao,
  ModoDisputa,
  TipoContratacao,
} from '../../src/licitacoes/entities/licitacao.entity';
import { TipoDocumentoFaseInterna } from '../../src/fase-interna/entities/documento-fase-interna.entity';
import { DOCUMENTOS_OBRIGATORIOS_POR_ETAPA } from '../../src/fase-interna/documentos-obrigatorios';

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

let contador = 0;
/** Sufixo único dentro da execução (o banco é compartilhado entre arquivos). */
export function unico(): string {
  contador += 1;
  return `${Date.now().toString(36)}${contador.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

function digitoVerificador(base: string, pesos: number[]): number {
  const soma = base.split('').reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** CNPJ numérico (14 dígitos) VÁLIDO e único na execução. */
export function gerarCnpj(): string {
  const base = (Date.now() % 1e8).toString().padStart(8, '0') + (++contador % 10000).toString().padStart(4, '0');
  const d1 = digitoVerificador(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(base + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base}${d1}${d2}`;
}

/** CPF numérico (11 dígitos) válido. */
export function gerarCpf(): string {
  const base = ((Date.now() + ++contador) % 1e9).toString().padStart(9, '0');
  const d1 = digitoVerificador(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(base + d1, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base}${d1}${d2}`;
}

function esperarStatus(resp: { status: number; body: any }, esperado: number | number[], acao: string) {
  const lista = Array.isArray(esperado) ? esperado : [esperado];
  if (!lista.includes(resp.status)) {
    throw new Error(`[fixture] ${acao} → HTTP ${resp.status}: ${JSON.stringify(resp.body)}`);
  }
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// ---------------------------------------------------------------------------
// Órgão
// ---------------------------------------------------------------------------

export interface OrgaoFixture {
  id: string;
  cnpj: string;
  nome: string;
  /** Token do tipo ORGAO (mesmo payload do login do órgão). */
  token: string;
}

export interface OpcoesOrgao {
  nome?: string;
  uf?: string;
  cidade?: string;
  /**
   * Módulos habilitados. `null` (padrão) = modo compatibilidade do ModuloGuard
   * (libera tudo). Passe uma lista para testar bloqueio por módulo.
   */
  modulos?: ModuloSistema[] | null;
}

/**
 * Cria um órgão via POST /api/orgaos (token de super admin). Para testes de
 * isolamento entre órgãos, chame duas vezes: `const A = await criarOrgao(ctx);
 * const B = await criarOrgao(ctx, { nome: 'Órgão B' })`.
 */
export async function criarOrgao(ctx: AppE2E, opts: OpcoesOrgao = {}): Promise<OrgaoFixture> {
  const u = unico();
  const cnpj = gerarCnpj();
  const resp = await ctx
    .http()
    .post('/api/orgaos')
    .set(bearer(ctx.tokenAdmin()))
    .send({
      codigo: `E2E-${u}`,
      nome: opts.nome ?? `Prefeitura E2E ${u}`,
      cnpj,
      tipo: TipoOrgao.PREFEITURA,
      esfera: EsferaAdministrativa.MUNICIPAL,
      cidade: opts.cidade ?? 'Cidade Teste',
      uf: opts.uf ?? 'BA',
    });
  esperarStatus(resp, 201, 'criar órgão');
  const id: string = resp.body.id;

  if (opts.modulos !== undefined && opts.modulos !== null) {
    // Módulos são configurados pelo super admin (PUT /api/orgaos/:id/modulos)
    const r = await ctx
      .http()
      .put(`/api/orgaos/${id}/modulos`)
      .set(bearer(ctx.tokenAdmin()))
      .send({ modulos: opts.modulos });
    esperarStatus(r, 200, 'configurar módulos do órgão');
  }

  const token = ctx.jwt.sign({ sub: id, type: UserType.ORGAO, cnpj: resp.body.cnpj });
  return { id, cnpj: resp.body.cnpj, nome: resp.body.nome, token };
}

export interface UsuarioOrgaoFixture {
  id: string;
  email: string;
  senha: string;
  role: RoleUsuario;
  orgaoId: string;
  /** Token real, emitido por POST /api/usuarios/login. */
  token: string;
}

/** Cria usuário do órgão (pregoeiro, apoio, admin) e faz login pela API. */
export async function criarUsuarioOrgao(
  ctx: AppE2E,
  orgao: OrgaoFixture,
  opts: { role?: RoleUsuario; nome?: string } = {},
): Promise<UsuarioOrgaoFixture> {
  const u = unico();
  const email = `usuario.${u}@e2e.local`;
  const senha = `Senha-${u}`;
  const role = opts.role ?? RoleUsuario.PREGOEIRO;
  const criado = await ctx
    .http()
    .post('/api/usuarios')
    .set(bearer(orgao.token))
    .send({ nome: opts.nome ?? `Usuário E2E ${u}`, email, senha, role, orgao_id: orgao.id, cpf: gerarCpf() });
  esperarStatus(criado, 201, 'criar usuário do órgão');

  const login = await ctx.http().post('/api/usuarios/login').send({ email, senha });
  esperarStatus(login, [200, 201], 'login do usuário do órgão');

  return { id: criado.body.id, email, senha, role, orgaoId: orgao.id, token: login.body.access_token };
}

// ---------------------------------------------------------------------------
// Fornecedor
// ---------------------------------------------------------------------------

/** 'DEMAIS' = empresa sem benefício da LC 123 (grava porte MEDIO). */
export type PorteFixture = 'ME' | 'EPP' | 'MEI' | 'DEMAIS' | PorteEmpresa;

export interface FornecedorFixture {
  id: string;
  cnpj: string;
  razao_social: string;
  porte: PorteEmpresa;
  /** true para ME/EPP/MEI (benefícios da LC 123). */
  mpe: boolean;
  /** Token do tipo FORNECEDOR (mesmo payload do login do fornecedor). */
  token: string;
}

export async function criarFornecedor(
  ctx: AppE2E,
  opts: { porte?: PorteFixture; razao_social?: string; aprovar?: boolean } = {},
): Promise<FornecedorFixture> {
  const u = unico();
  const cnpj = gerarCnpj();
  const porte: PorteEmpresa =
    !opts.porte || opts.porte === 'DEMAIS' ? PorteEmpresa.MEDIO : (opts.porte as PorteEmpresa);
  const razao_social = opts.razao_social ?? `Fornecedor E2E ${porte} ${u}`;
  const email = `fornecedor.${u}@e2e.local`;

  const resp = await ctx
    .http()
    .post('/api/fornecedores')
    .set(bearer(ctx.tokenAdmin()))
    .send({
      tipo_pessoa: 'JURIDICA',
      cpf_cnpj: cnpj,
      razao_social,
      porte,
      logradouro: 'Rua de Teste',
      numero: '100',
      bairro: 'Centro',
      cidade: 'Cidade Teste',
      uf: 'BA',
      cep: '40000-000',
      telefone: '71999990000',
      email,
      representante_nome: `Representante ${u}`,
      representante_cpf: gerarCpf(),
    });
  esperarStatus(resp, 201, 'criar fornecedor');
  const id: string = resp.body.id;

  if (opts.aprovar !== false) {
    const ap = await ctx.http().put(`/api/fornecedores/${id}/aprovar`).set(bearer(ctx.tokenAdmin()));
    esperarStatus(ap, 200, 'aprovar fornecedor');
  }

  const token = ctx.jwt.sign({ sub: id, type: UserType.FORNECEDOR, cnpj, email });
  return {
    id,
    cnpj,
    razao_social,
    porte,
    mpe: [PorteEmpresa.ME, PorteEmpresa.EPP, PorteEmpresa.MEI].includes(porte),
    token,
  };
}

// ---------------------------------------------------------------------------
// Licitação
// ---------------------------------------------------------------------------

export interface ItemEntrada {
  descricao?: string;
  quantidade?: number;
  valor_unitario_estimado?: number;
  unidade_medida?: UnidadeMedida;
  tipo_participacao?: TipoParticipacao;
  numero_lote?: number;
}

export interface ItemFixture {
  id: string;
  numero_item: number;
  quantidade: number;
  valor_unitario_estimado: number;
}

export interface LicitacaoFixture {
  id: string;
  numero_processo: string;
  modalidade: ModalidadeLicitacao;
  orgao: OrgaoFixture;
  itens: ItemFixture[];
}

export interface OpcoesLicitacao {
  criterio?: CriterioJulgamento;
  modo_disputa?: ModoDisputa;
  tipo_contratacao?: TipoContratacao;
  /** Padrão: 2 itens (R$ 100,00 × 10 e R$ 50,00 × 20). */
  itens?: ItemEntrada[];
  /** Campos extras do CreateLicitacaoDto (ex.: tratamento_diferenciado_mpe). */
  extras?: Record<string, any>;
}

const ITENS_PADRAO: ItemEntrada[] = [
  { descricao: 'Item E2E 1', quantidade: 10, valor_unitario_estimado: 100 },
  { descricao: 'Item E2E 2', quantidade: 20, valor_unitario_estimado: 50 },
];

/** Cria licitação (POST /api/licitacoes) + itens (POST /api/itens), fase PLANEJAMENTO. */
export async function criarLicitacao(
  ctx: AppE2E,
  orgao: OrgaoFixture,
  modalidade: ModalidadeLicitacao,
  opts: OpcoesLicitacao = {},
): Promise<LicitacaoFixture> {
  const u = unico();
  const itensEntrada = opts.itens ?? ITENS_PADRAO;
  const valorTotal = itensEntrada.reduce(
    (s, i) => s + (i.quantidade ?? 1) * (i.valor_unitario_estimado ?? 100),
    0,
  );
  const numero_processo = `E2E-${u}`;

  const resp = await ctx
    .http()
    .post('/api/licitacoes')
    .set(bearer(orgao.token))
    .send({
      numero_processo,
      orgao_id: orgao.id,
      objeto: `Objeto de teste E2E ${u}`,
      modalidade,
      tipo_contratacao: opts.tipo_contratacao ?? TipoContratacao.COMPRA,
      criterio_julgamento: opts.criterio ?? CriterioJulgamento.MENOR_PRECO,
      modo_disputa: opts.modo_disputa ?? ModoDisputa.ABERTO,
      valor_total_estimado: Number(valorTotal.toFixed(2)),
      ...(opts.extras ?? {}),
    });
  esperarStatus(resp, 201, 'criar licitação');
  const id: string = resp.body.id;

  const itens: ItemFixture[] = [];
  for (let i = 0; i < itensEntrada.length; i++) {
    const e = itensEntrada[i];
    const r = await ctx
      .http()
      .post('/api/itens')
      .set(bearer(orgao.token))
      .send({
        licitacao_id: id,
        numero_item: i + 1,
        descricao_resumida: e.descricao ?? `Item E2E ${i + 1}`,
        quantidade: e.quantidade ?? 1,
        unidade_medida: e.unidade_medida ?? UnidadeMedida.UNIDADE,
        valor_unitario_estimado: e.valor_unitario_estimado ?? 100,
        tipo_participacao: e.tipo_participacao,
        numero_lote: e.numero_lote,
        sem_pca: true,
        justificativa_sem_pca: 'Item de teste E2E',
      });
    esperarStatus(r, 201, `criar item ${i + 1}`);
    itens.push({
      id: r.body.id,
      numero_item: i + 1,
      quantidade: e.quantidade ?? 1,
      valor_unitario_estimado: e.valor_unitario_estimado ?? 100,
    });
  }

  return { id, numero_processo, modalidade, orgao, itens };
}

/** GET /api/licitacoes/:id com o token do órgão dono. */
export async function buscarLicitacao(ctx: AppE2E, lic: LicitacaoFixture): Promise<any> {
  const r = await ctx.http().get(`/api/licitacoes/${lic.id}`).set(bearer(lic.orgao.token));
  esperarStatus(r, 200, 'buscar licitação');
  return r.body;
}

// ---------------------------------------------------------------------------
// Fases
// ---------------------------------------------------------------------------

/**
 * Ordem das fases para o laço do `levarAteFase`. Desde a E1 não existe "fase
 * seguinte" genérica: o PUT avancar-fase executa o ATO PRINCIPAL da fase atual
 * (backend/src/licitacoes/transicoes/definicoes.ts) — ex.: PUBLICADO → iniciar
 * acolhimento (pula IMPUGNACAO, que é ato à parte).
 */
const ORDEM_FASES: FaseLicitacao[] = [
  FaseLicitacao.PLANEJAMENTO,
  FaseLicitacao.TERMO_REFERENCIA,
  FaseLicitacao.PESQUISA_PRECOS,
  FaseLicitacao.ANALISE_JURIDICA,
  FaseLicitacao.APROVACAO_INTERNA,
  FaseLicitacao.PUBLICADO,
  FaseLicitacao.IMPUGNACAO,
  FaseLicitacao.ACOLHIMENTO_PROPOSTAS,
  FaseLicitacao.ANALISE_PROPOSTAS,
  FaseLicitacao.EM_DISPUTA,
  FaseLicitacao.JULGAMENTO,
  FaseLicitacao.HABILITACAO,
  FaseLicitacao.RECURSO,
  FaseLicitacao.ADJUDICACAO,
  FaseLicitacao.HOMOLOGACAO,
  FaseLicitacao.CONCLUIDO,
];

export interface DatasEdital {
  data_publicacao_edital: string;
  data_limite_impugnacao: string;
  data_inicio_acolhimento: string;
  data_fim_acolhimento: string;
  data_abertura_sessao: string;
  /** LC 123 art. 49: itens até R$ 80.000 sem exclusividade ME/EPP exigem justificativa ao publicar (E3). */
  justificativa_nao_exclusividade_mpe?: string;
}

/** Justificativa padrão dos e2e (art. 49 da LC 123/2006). */
export const JUSTIFICATIVA_ART49_E2E = 'Art. 49, II: não há 3 fornecedores ME/EPP competitivos sediados na região (teste E2E).';

/**
 * Datas padrão do edital: publicado agora, acolhimento aberto e abertura da
 * sessão daqui a 70 dias corridos — cobre, em qualquer dia do ano, o maior
 * prazo mínimo do art. 55 usado nos fixtures (35 dias úteis: técnica e preço,
 * melhor técnica, semi-integrada), com os feriados nacionais (E7a), e os 3
 * dias úteis da dispensa (art. 75 §3º). Limite de impugnação na véspera da
 * abertura (nunca antes dos 3 dias úteis do art. 164). Propostas só são aceitas ANTES da abertura — use `abrirSessaoAgora`
 * depois de enviá-las.
 */
export function datasEditalPadrao(): DatasEdital {
  const agora = Date.now();
  const h = 3_600_000;
  return {
    data_publicacao_edital: new Date(agora - 60_000).toISOString(),
    data_limite_impugnacao: new Date(agora + 69 * 24 * h).toISOString(),
    data_inicio_acolhimento: new Date(agora - 60_000).toISOString(),
    data_fim_acolhimento: new Date(agora + 70 * 24 * h).toISOString(),
    data_abertura_sessao: new Date(agora + 70 * 24 * h).toISOString(),
    justificativa_nao_exclusividade_mpe: JUSTIFICATIVA_ART49_E2E,
  };
}

/** PDF mínimo VÁLIDO (edital de teste — o gate do E7a exige arquivo PDF real). */
export function pdfDeTeste(texto = 'Edital de teste E2E'): Buffer {
  const nl = '\n';
  const conteudo = `BT /F1 12 Tf 72 720 Td (${texto.replace(/[^A-Za-z0-9 ./-]/g, '')}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${conteudo.length} >>${nl}stream${nl}${conteudo}${nl}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = `%PDF-1.4${nl}`;
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj${nl}${o}${nl}endobj${nl}`;
  });
  const xref = pdf.length;
  pdf += `xref${nl}0 ${objs.length + 1}${nl}0000000000 65535 f ${nl}`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n ${nl}`).join('');
  pdf += `trailer${nl}<< /Size ${objs.length + 1} /Root 1 0 R >>${nl}startxref${nl}${xref}${nl}%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

/**
 * Anexa o edital (PDF) antes da publicação — POST /api/publicacao/licitacao/:id/edital
 * (gate do PUBLICAR nas modalidades com edital — E7a item 3).
 */
export async function anexarEdital(ctx: AppE2E, lic: LicitacaoFixture, texto?: string): Promise<any> {
  const r = await ctx
    .http()
    .post(`/api/publicacao/licitacao/${lic.id}/edital`)
    .set(bearer(lic.orgao.token))
    .attach('arquivo', pdfDeTeste(texto ?? `Edital ${lic.numero_processo}`), { filename: 'edital.pdf', contentType: 'application/pdf' });
  esperarStatus(r, 201, 'anexar edital');
  return r.body;
}

/**
 * RELÓGIO DE TESTE: grava datas do cronograma direto no banco. Depois da
 * publicação o cronograma só muda por RETIFICAÇÃO (art. 55 §1º — E7a); os
 * testes que precisam "fazer o tempo passar" (abrir a sessão agora, prazo de
 * impugnação vencido) usam este atalho, que simula o relógio, não um ato.
 */
export async function ajustarCronograma(
  ctx: AppE2E,
  lic: { id: string },
  datas: Partial<Record<'data_publicacao_edital' | 'data_limite_impugnacao' | 'data_inicio_acolhimento' | 'data_fim_acolhimento' | 'data_abertura_sessao', string | Date | null>>,
): Promise<void> {
  const campos = Object.keys(datas);
  if (!campos.length) return;
  const sets = campos.map((c, i) => `${c} = $${i + 2}`).join(', ');
  const valores = campos.map((c) => {
    const v = (datas as any)[c];
    return v == null ? null : new Date(v);
  });
  await ctx.dataSource.query(`UPDATE licitacoes SET ${sets} WHERE id = $1`, [lic.id, ...valores]);
}

const CONTRATACAO_DIRETA = [ModalidadeLicitacao.DISPENSA_ELETRONICA, ModalidadeLicitacao.INEXIGIBILIDADE];

/**
 * Instrução mínima do art. 72 (DFD, estimativa de despesa, autorização) —
 * gate de publicação da contratação direta. Via POST /api/fase-interna/:id/documento.
 */
export async function prepararInstrucaoContratacaoDireta(ctx: AppE2E, lic: LicitacaoFixture): Promise<void> {
  const docs: Array<[TipoDocumentoFaseInterna, string]> = [
    [TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA, 'Formalização da demanda (DFD)'],
    [TipoDocumentoFaseInterna.PESQUISA_PRECOS, 'Estimativa de despesa'],
    [TipoDocumentoFaseInterna.AUTORIZACAO_ABERTURA, 'Autorização da autoridade competente'],
  ];
  for (const [tipo, titulo] of docs) {
    const r = await ctx
      .http()
      .post(`/api/fase-interna/${lic.id}/documento`)
      .set(bearer(lic.orgao.token))
      .send({ tipo, titulo, descricao: `${titulo} — documento de teste E2E` });
    esperarStatus(r, 201, `criar documento ${tipo}`);
  }
}

/**
 * Rito completo (pregão, concorrência...): cria, pela API, os documentos
 * obrigatórios da etapa interna `etapa` — gate documental dos atos da fase
 * interna (E1.7, backend/src/fase-interna/documentos-obrigatorios.ts).
 * Documento com conteúdo e sem fluxo de aprovação configurado conta como pronto.
 */
export async function prepararDocumentosEtapa(
  ctx: AppE2E,
  lic: LicitacaoFixture,
  etapa: FaseLicitacao,
): Promise<void> {
  for (const tipo of DOCUMENTOS_OBRIGATORIOS_POR_ETAPA[etapa] ?? []) {
    const r = await ctx
      .http()
      .post(`/api/fase-interna/${lic.id}/documento`)
      .set(bearer(lic.orgao.token))
      .send({ tipo, titulo: `${tipo} — teste E2E`, descricao: `Documento ${tipo} — teste E2E` });
    esperarStatus(r, 201, `criar documento ${tipo}`);
  }
}

/**
 * Leva a licitação até `alvo` pela API pública:
 *  - rito completo: cria antes os documentos obrigatórios de cada etapa
 *    interna (gate documental E1.7 — `prepararDocumentosEtapa`);
 *  - fases internas e externas: PUT /api/licitacoes/:id/avancar-fase (ato
 *    principal da fase atual, com as pré-condições do TransicoesService);
 *  - APROVACAO_INTERNA → PUBLICADO: PUT /api/licitacoes/:id/publicar-edital
 *    (contratação direta: cria antes a instrução do art. 72);
 *  - ANALISE_PROPOSTAS em diante exige propostas e abertura já ocorrida
 *    (`abrirSessaoAgora`) — as validações do backend valem normalmente.
 *
 * Retorna a licitação (corpo da última resposta). Qualquer recusa do backend
 * vira erro com o status e a mensagem — é o que os testes "desejados" medem.
 */
export async function levarAteFase(
  ctx: AppE2E,
  lic: LicitacaoFixture,
  alvo: FaseLicitacao,
  opts: { datas?: Partial<DatasEdital> } = {},
): Promise<any> {
  const idxAlvo = ORDEM_FASES.indexOf(alvo);
  if (idxAlvo < 0) {
    throw new Error(`[fixture] levarAteFase não sabe chegar em ${alvo} (fora do fluxo linear).`);
  }

  let atual = await buscarLicitacao(ctx, lic);
  let guarda = 0;
  while (ORDEM_FASES.indexOf(atual.fase) < idxAlvo) {
    if (++guarda > ORDEM_FASES.length + 2) throw new Error('[fixture] levarAteFase não progrediu');

    const direta = CONTRATACAO_DIRETA.includes(lic.modalidade);
    // Rito completo: documentos obrigatórios da etapa interna atual (gate E1.7)
    if (!direta && ORDEM_FASES.indexOf(atual.fase) <= ORDEM_FASES.indexOf(FaseLicitacao.APROVACAO_INTERNA)) {
      await prepararDocumentosEtapa(ctx, lic, atual.fase);
    }

    if (atual.fase === FaseLicitacao.APROVACAO_INTERNA) {
      if (direta) {
        await prepararInstrucaoContratacaoDireta(ctx, lic);
      } else {
        await anexarEdital(ctx, lic); // E7a: edital real exigido para publicar
      }
      const r = await ctx
        .http()
        .put(`/api/licitacoes/${lic.id}/publicar-edital`)
        .set(bearer(lic.orgao.token))
        .send({ ...datasEditalPadrao(), ...(opts.datas ?? {}) });
      esperarStatus(r, 200, 'publicar edital');
      atual = r.body;
      continue;
    }

    const r = await ctx
      .http()
      .put(`/api/licitacoes/${lic.id}/avancar-fase`)
      .set(bearer(lic.orgao.token))
      .send({});
    esperarStatus(r, 200, `avançar fase a partir de ${atual.fase}`);
    atual = r.body;
  }
  // Rito completo levado até APROVACAO_INTERNA: deixa a etapa documentada
  // (autorização, designação, dotação) — pronto para publicar, como antes do gate.
  if (
    alvo === FaseLicitacao.APROVACAO_INTERNA &&
    atual.fase === FaseLicitacao.APROVACAO_INTERNA &&
    !CONTRATACAO_DIRETA.includes(lic.modalidade)
  ) {
    await prepararDocumentosEtapa(ctx, lic, FaseLicitacao.APROVACAO_INTERNA);
    await anexarEdital(ctx, lic); // E7a: pronto para publicar
  }
  return atual;
}

/**
 * Encerra o acolhimento e marca a abertura da sessão para agora, pela edição
 * do cronograma (PUT /api/licitacoes/:id). Atalho de teste para não esperar o
 * relógio: propostas são aceitas só antes da abertura e a disputa só depois.
 */
export async function abrirSessaoAgora(ctx: AppE2E, lic: LicitacaoFixture): Promise<any> {
  // E7a: edital publicado não tem o cronograma alterado pelo PUT (só por
  // retificação) — aqui é o RELÓGIO do teste que avança até a abertura.
  const passado = new Date(Date.now() - 1_000);
  await ajustarCronograma(ctx, lic, { data_fim_acolhimento: passado, data_abertura_sessao: passado });
  return buscarLicitacao(ctx, lic);
}

// ---------------------------------------------------------------------------
// Proposta
// ---------------------------------------------------------------------------

export interface PropostaFixture {
  id: string;
  status: string;
  fornecedor: FornecedorFixture;
}

/**
 * Cadastra e envia a proposta do fornecedor, autenticado como ELE MESMO.
 * `valores`: valor unitário por item, na ordem de `lic.itens` (array) ou por
 * id do item (objeto). Itens sem valor ficam de fora da proposta.
 * O fornecedor é o do token (E1a) — `fornecedor_id` não vai no corpo.
 */
export async function enviarProposta(
  ctx: AppE2E,
  fornecedor: FornecedorFixture,
  lic: LicitacaoFixture,
  valores: number[] | Record<string, number>,
  opts: { enviar?: boolean; declaracao_mpe?: boolean; extras?: Record<string, any> } = {},
): Promise<PropostaFixture> {
  const itens = lic.itens
    .map((item, idx) => ({
      item_licitacao_id: item.id,
      valor_unitario: Array.isArray(valores) ? valores[idx] : valores[item.id],
    }))
    .filter((i) => i.valor_unitario !== undefined && i.valor_unitario !== null);

  const criada = await ctx
    .http()
    .post('/api/propostas')
    .set(bearer(fornecedor.token))
    .send({
      licitacao_id: lic.id,
      declaracao_termos: true,
      declaracao_integridade: true,
      declaracao_inexistencia_fatos: true,
      declaracao_menor: true,
      declaracao_mpe: opts.declaracao_mpe ?? fornecedor.mpe,
      itens,
      ...(opts.extras ?? {}),
    });
  esperarStatus(criada, 201, `criar proposta de ${fornecedor.razao_social}`);

  let status: string = criada.body.status;
  if (opts.enviar !== false) {
    const env = await ctx.http().put(`/api/propostas/${criada.body.id}/enviar`).set(bearer(fornecedor.token));
    esperarStatus(env, 200, `enviar proposta de ${fornecedor.razao_social}`);
    status = env.body.status;
  }
  return { id: criada.body.id, status, fornecedor };
}
