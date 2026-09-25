/**
 * ============================================================================
 * FORMALIZAÇÃO DO RESULTADO — regras puras (sem banco, sem Nest).
 * Lei 14.133/2021 art. 71 IV: adjudicar e homologar são atos da AUTORIDADE
 * SUPERIOR; na prática o agente de contratação (pregoeiro) OPERA o sistema e
 * registra o ato, e o termo publicado leva os dados da autoridade.
 * Decisão do usuário (25/09/2026).
 * ============================================================================
 *
 *  - OPERADOR: quem clicou (conta do órgão, ADMIN do órgão, pregoeiro/agente
 *    de contratação; administrador da plataforma). Equipe de apoio não
 *    registra o resultado.
 *  - AUTORIDADE: quem pratica o ato — do cadastro do órgão (uma ou mais, com
 *    uma padrão); na falta de cadastro, o responsável do órgão.
 *  - MODO do órgão:
 *      REGISTRO_DIRETO        efeito imediato; termo gerado com a autoridade
 *      ASSINATURA_ELETRONICA  ato PENDENTE até a autoridade assinar o termo
 *      TERMO_EXTERNO          efeito com o envio do termo assinado/publicação
 */

export enum ModoFormalizacao {
  REGISTRO_DIRETO = 'REGISTRO_DIRETO',
  ASSINATURA_ELETRONICA = 'ASSINATURA_ELETRONICA',
  TERMO_EXTERNO = 'TERMO_EXTERNO',
}

export enum TipoFormalizacao {
  ADJUDICACAO = 'ADJUDICACAO',
  HOMOLOGACAO = 'HOMOLOGACAO',
}

export enum StatusFormalizacao {
  EFETIVADO = 'EFETIVADO',
  PENDENTE_ASSINATURA = 'PENDENTE_ASSINATURA',
  /** Assinatura concluída; efeito sendo aplicado (trava contra ouvinte duplicado). */
  EFETIVANDO = 'EFETIVANDO',
  /** Assinado, mas o efeito falhou (estado mudou) — ver `erro`; pode ser reprocessado. */
  FALHOU = 'FALHOU',
  CANCELADO = 'CANCELADO',
}

export const MODO_PADRAO = ModoFormalizacao.REGISTRO_DIRETO;

export const ROTULO_MODO: Record<ModoFormalizacao, string> = {
  REGISTRO_DIRETO: 'Registro direto (efeito imediato)',
  ASSINATURA_ELETRONICA: 'Assinatura eletrônica da autoridade',
  TERMO_EXTERNO: 'Termo externo (assinado/publicado fora do sistema)',
};

export function modoValido(m: unknown): m is ModoFormalizacao {
  return typeof m === 'string' && (Object.values(ModoFormalizacao) as string[]).includes(m);
}

/** Modo efetivo do órgão (valor desconhecido/nulo → padrão, nunca bloqueia). */
export function modoDoOrgao(valor: unknown): ModoFormalizacao {
  return modoValido(valor) ? valor : MODO_PADRAO;
}

/** Status que ainda "seguram" o ato (impede registrar outro ato do resultado). */
export const STATUS_EM_ANDAMENTO: ReadonlyArray<string> = [StatusFormalizacao.PENDENTE_ASSINATURA, StatusFormalizacao.EFETIVANDO];

// ---------------------------------------------------------------------------
// Operador
// ---------------------------------------------------------------------------

/** Papéis de usuário do órgão que podem REGISTRAR adjudicação/homologação. */
export const PAPEIS_OPERADOR: ReadonlyArray<string> = ['ADMIN', 'PREGOEIRO'];

/**
 * Quem pode registrar o ato no sistema: conta do órgão, administrador da
 * plataforma ou usuário do órgão com papel de agente de contratação/pregoeiro
 * ou acima (ADMIN). O ato continua sendo da autoridade (registrada à parte).
 */
export function motivoOperadorInvalido(ator: { tipo: string; role?: string | null; admin?: boolean }): string | null {
  if (ator.admin || ator.tipo === 'ORGAO') return null;
  if (ator.tipo === 'USUARIO' && PAPEIS_OPERADOR.includes(String(ator.role ?? '').toUpperCase())) return null;
  return (
    'Registrar a adjudicação/homologação exige o agente de contratação/pregoeiro, um ADMIN do órgão ou a conta do órgão ' +
    '(o ato é praticado pela autoridade competente escolhida — Lei 14.133/2021, art. 71 IV).'
  );
}

/** Papéis que alteram a configuração (modo e autoridades): conta do órgão ou ADMIN do órgão. */
export function podeConfigurar(ator: { tipo: string; role?: string | null; admin?: boolean }): boolean {
  if (ator.admin || ator.tipo === 'ORGAO') return true;
  return ator.tipo === 'USUARIO' && String(ator.role ?? '').toUpperCase() === 'ADMIN';
}

// ---------------------------------------------------------------------------
// Autoridade
// ---------------------------------------------------------------------------

export interface AutoridadeCadastro {
  id: string;
  nome: string;
  cargo: string;
  cpf?: string | null;
  email?: string | null;
  ato_delegacao_numero?: string | null;
  ato_delegacao_data?: string | null;
  padrao?: boolean;
  ativo?: boolean;
}

/** Retrato da autoridade gravado no ato (autoridade_id nulo = responsável do órgão). */
export interface AutoridadeDoAto {
  id: string | null;
  nome: string;
  cargo: string;
  cpf: string | null;
  email: string | null;
  ato_delegacao_numero: string | null;
  ato_delegacao_data: string | null;
}

const VALORES_VAZIOS = ['', 'a definir', '000.000.000-00', '00000000000'];
const preenchido = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s && !VALORES_VAZIOS.includes(s.toLowerCase()) ? s : null;
};

/**
 * Autoridade do ato: a escolhida pelo operador (precisa ser do órgão e ativa),
 * senão a PADRÃO do cadastro, senão a primeira ativa, senão o responsável do
 * órgão (`orgaos.responsavel_*`), senão o próprio órgão. Nunca bloqueia por
 * falta de cadastro (compatibilidade — decisão do usuário).
 */
export function resolverAutoridade(
  cadastro: AutoridadeCadastro[],
  escolhidaId: string | null | undefined,
  orgao: { nome?: string | null; responsavel_nome?: string | null; responsavel_cargo?: string | null; responsavel_cpf?: string | null; email?: string | null } | null,
): AutoridadeDoAto {
  const ativas = cadastro.filter((a) => a.ativo !== false);
  let a: AutoridadeCadastro | undefined;
  if (escolhidaId) {
    a = ativas.find((x) => String(x.id) === String(escolhidaId));
    if (!a) throw new Error('Autoridade não encontrada entre as autoridades ativas do órgão.');
  } else {
    a = ativas.find((x) => x.padrao) ?? ativas[0];
  }
  if (a) {
    return {
      id: String(a.id),
      nome: String(a.nome).slice(0, 200),
      cargo: String(a.cargo).slice(0, 200),
      cpf: preenchido(a.cpf)?.replace(/\D/g, '') || null,
      email: preenchido(a.email),
      ato_delegacao_numero: preenchido(a.ato_delegacao_numero),
      ato_delegacao_data: a.ato_delegacao_data ? String(a.ato_delegacao_data).slice(0, 10) : null,
    };
  }
  return {
    id: null,
    nome: (preenchido(orgao?.responsavel_nome) ?? preenchido(orgao?.nome) ?? 'Autoridade competente').slice(0, 200),
    cargo: (preenchido(orgao?.responsavel_cargo) ?? 'Autoridade competente').slice(0, 200),
    cpf: preenchido(orgao?.responsavel_cpf)?.replace(/\D/g, '') || null,
    email: null,
    ato_delegacao_numero: null,
    ato_delegacao_data: null,
  };
}

/** Pendência da autoridade para o modo (null = ok). */
export function motivoAutoridadeInaptaParaModo(modo: ModoFormalizacao, a: AutoridadeDoAto): string | null {
  if (modo === ModoFormalizacao.ASSINATURA_ELETRONICA) {
    if (!a.id) return 'Assinatura eletrônica: cadastre a autoridade competente do órgão (Configurações › Parâmetros de licitação).';
    if (!a.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.email)) {
      return `Assinatura eletrônica: a autoridade ${a.nome} precisa de e-mail no cadastro para receber o termo e o código de assinatura.`;
    }
  }
  return null;
}

/**
 * Como a autoridade assina no assinador: com CPF → link externo (CPF + código
 * por e-mail, sem precisar de login no sistema); sem CPF → portal interno de
 * assinaturas (usuário do órgão com o mesmo e-mail, ou código por e-mail).
 */
export function autoridadeAssinaPorLinkExterno(a: AutoridadeDoAto): boolean {
  return !!a.cpf && a.cpf.length === 11;
}

/** Validação do cadastro/edição de uma autoridade (mensagem ou null). */
export function motivoCadastroAutoridadeInvalido(d: Partial<AutoridadeCadastro>): string | null {
  if (!String(d.nome ?? '').trim()) return 'Informe o nome da autoridade.';
  if (!String(d.cargo ?? '').trim()) return 'Informe o cargo da autoridade.';
  const cpf = String(d.cpf ?? '').replace(/\D/g, '');
  if (cpf && cpf.length !== 11) return 'CPF da autoridade inválido (11 dígitos).';
  const email = String(d.email ?? '').trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'E-mail da autoridade inválido.';
  if (d.ato_delegacao_data && !/^\d{4}-\d{2}-\d{2}/.test(String(d.ato_delegacao_data))) return 'Data do ato de delegação inválida (AAAA-MM-DD).';
  return null;
}

// ---------------------------------------------------------------------------
// Efeito do ato conforme o modo
// ---------------------------------------------------------------------------

export type EfeitoDoRegistro =
  | { efeito: 'IMEDIATO' }
  | { efeito: 'AGUARDA_ASSINATURA' }
  | { efeito: 'RECUSADO'; motivo: string };

/**
 * O que acontece quando o operador registra o ato:
 *  - REGISTRO_DIRETO: efeito imediato (um arquivo enviado é ignorado — o termo é gerado);
 *  - TERMO_EXTERNO: efeito imediato SE o termo assinado/publicação vier junto;
 *  - ASSINATURA_ELETRONICA: pendente até a assinatura da autoridade.
 */
export function efeitoDoRegistro(modo: ModoFormalizacao, temArquivo: boolean): EfeitoDoRegistro {
  switch (modo) {
    case ModoFormalizacao.ASSINATURA_ELETRONICA:
      return { efeito: 'AGUARDA_ASSINATURA' };
    case ModoFormalizacao.TERMO_EXTERNO:
      return temArquivo
        ? { efeito: 'IMEDIATO' }
        : {
            efeito: 'RECUSADO',
            motivo: 'Termo externo: envie o termo assinado pela autoridade ou a publicação no Diário Oficial (PDF ou imagem) para registrar o ato.',
          };
    default:
      return { efeito: 'IMEDIATO' };
  }
}

/** Tipos de arquivo aceitos como termo externo. */
export const MIMES_TERMO_EXTERNO: ReadonlyArray<string> = ['application/pdf', 'image/png', 'image/jpeg'];
export const TAMANHO_MAX_TERMO_EXTERNO = 20 * 1024 * 1024;

export function motivoArquivoExternoInvalido(a: { mimetype?: string; size?: number; originalname?: string } | null | undefined): string | null {
  if (!a) return null;
  const ext = String(a.originalname ?? '').toLowerCase().split('.').pop() ?? '';
  const mimeOk = MIMES_TERMO_EXTERNO.includes(String(a.mimetype ?? '')) && ['pdf', 'png', 'jpg', 'jpeg'].includes(ext);
  if (!mimeOk) return 'O termo externo deve ser PDF, PNG ou JPG.';
  if (Number(a.size ?? 0) <= 0) return 'Arquivo do termo vazio.';
  if (Number(a.size) > TAMANHO_MAX_TERMO_EXTERNO) return 'Arquivo do termo acima de 20 MB.';
  return null;
}

// ---------------------------------------------------------------------------
// Texto do termo
// ---------------------------------------------------------------------------

/** Linha de identificação da autoridade no termo (com a delegação, se houver). */
export function identificacaoAutoridade(a: AutoridadeDoAto, fmtData: (iso: string) => string): string {
  const deleg = a.ato_delegacao_numero
    ? `, no exercício da competência delegada pelo ato nº ${a.ato_delegacao_numero}${a.ato_delegacao_data ? `, de ${fmtData(a.ato_delegacao_data)}` : ''}`
    : '';
  return `${a.nome}, ${a.cargo}${deleg}`;
}

/** Nome da página pública/termo: um documento por ato. */
export function tituloDoTermo(tipo: TipoFormalizacao | string): string {
  return tipo === TipoFormalizacao.ADJUDICACAO ? 'TERMO DE ADJUDICAÇÃO' : 'TERMO DE ADJUDICAÇÃO E HOMOLOGAÇÃO';
}

/** O termo é público? Só depois da homologação, e só o do ato efetivado. */
export function termoEhPublico(
  f: { status: string },
  lic: { data_homologacao?: Date | string | null },
): boolean {
  return f.status === StatusFormalizacao.EFETIVADO && !!lic.data_homologacao;
}
