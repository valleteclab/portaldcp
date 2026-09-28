/**
 * ISOLAMENTO DAS PEÇAS POR ETAPA (homologação multiusuário, 27/09/2026 —
 * docs/fase interna/relatorio-homologacao-multiusuario-portaldcp.md, E2) —
 * regra PURA (sem banco).
 *
 * Toda ação de ESCRITA numa peça/etapa (gerar, emitir, salvar rascunho,
 * anexar feito fora, registrar pesquisa, "não se aplica", enviar para
 * assinatura, reserva, minutas, parecer, controle interno, autorização) só é
 * permitida quando:
 *  1. a etapa PODE INICIAR: a demanda foi aprovada (antes dela só a etapa da
 *     demanda anda — pedido do dono, 26/09/2026) e as dependências do modelo
 *     de fluxo estão concluídas;
 *  2. quem age é RESPONSÁVEL pela etapa no modelo de fluxo do processo
 *     (pessoa, papel ou setor — e o chefe do setor), ou o responsável
 *     calculado (modo simples: quem conduz; papel de agente: o agente do
 *     processo), ou quem recebeu a tarefa da etapa;
 *  3. no modo POR_SETOR com "exigir a posse para trabalhar nas peças" ligado
 *     no modelo: o processo ESTÁ COM quem age (setor, pessoa ou chefe do
 *     setor de destino da tramitação vigente). Diligência aberta do parecer
 *     sobre a peça devolve a peça a quem responde por ela, sem a posse.
 * O administrador do órgão, o login do órgão e o administrador da plataforma
 * passam por 2 e 3 (com registro no histórico), nunca por 1.
 */
import { podeAtuarNoDestino } from '../tramitacao-regras';
import type { ResponsavelEtapa } from './modelo-fluxo';

/** Quem está agindo (do JWT + cadastro). */
export interface PerfilTrabalho {
  /** Login do órgão, papel ADMIN do órgão ou administrador da plataforma. */
  privilegiado: boolean;
  usuario_id: string | null;
  papeis: string[];
  setor_id: string | null;
  /** Setores de que a pessoa é chefe. */
  chefe_de: string[];
}

/** Outro responsável aceito além do do modelo (responsável calculado, tarefa reatribuída). */
export interface ResponsavelAlternativo {
  usuario_id?: string | null;
  papel?: string | null;
  setor_id?: string | null;
}

export interface PosseParaTrabalho {
  setor_id: string | null;
  usuario_id: string | null;
  /** "COMPRAS · Carlos" */
  rotulo: string;
}

export interface EntradaPermissao {
  etapa: { codigo: string; titulo: string; responsavel: ResponsavelEtapa };
  /** Rótulo de quem responde pela etapa ("setor Compras", "papel Compras", "Ana"). */
  rotulo_responsavel: string;
  alternativos: ResponsavelAlternativo[];
  /** Etapa espera a aprovação da demanda (qualquer uma menos a da demanda). */
  aguardando_demanda: boolean;
  aprovador_demanda?: string | null;
  /** Dependências ainda não concluídas (títulos). */
  pendencias: string[];
  /** Modo POR_SETOR e o modelo exige a posse para trabalhar nas peças. */
  exigir_posse: boolean;
  /** Tramitação vigente (PENDENTE/RECEBIDA); null = sem tramitação. */
  posse: PosseParaTrabalho | null;
  chefe_da_posse?: string | null;
  /** Diligência do parecer aberta sobre peça desta etapa. */
  diligencia_aberta?: boolean;
}

export type CodigoPermissao = 'OK' | 'AGUARDANDO_DEMANDA' | 'AGUARDANDO_ETAPAS' | 'NAO_RESPONSAVEL' | 'SEM_POSSE' | 'FORA_DO_MODELO';

export interface ResultadoPermissao {
  pode: boolean;
  codigo: CodigoPermissao;
  /** Por que não pode (texto para a tela e para o 403). */
  motivo: string | null;
  /** Pode só por ser administrador/login do órgão (vai para o histórico). */
  por_privilegio: boolean;
  /** O que valeria sem o privilégio (registro no histórico). */
  motivo_sem_privilegio: string | null;
}

const lista = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);

/** A pessoa responde pela etapa (modelo, responsável calculado ou tarefa)? */
export function ehResponsavelPelaEtapa(e: Pick<EntradaPermissao, 'etapa' | 'alternativos'>, p: PerfilTrabalho): boolean {
  if (!p.usuario_id) return false;
  const alvos: ResponsavelAlternativo[] = [e.etapa.responsavel, ...e.alternativos];
  for (const a of alvos) {
    if (!a) continue;
    if (a.usuario_id) {
      if (a.usuario_id === p.usuario_id) return true;
      // Pessoa designada: só ela (o chefe entra pelo setor, quando houver)
      if (!a.setor_id) continue;
    }
    if (a.papel && p.papeis.includes(a.papel)) return true;
    if (a.setor_id && (p.setor_id === a.setor_id || p.chefe_de.includes(a.setor_id))) return true;
  }
  return false;
}

/**
 * Quem CONDUZ o processo: o privilegiado (administrador do órgão, login do
 * órgão, administrador da plataforma), o agente designado ou, sem agente,
 * quem criou o processo. Ações do processo inteiro e peças fora do modelo.
 */
export function ehCondutor(p: PerfilTrabalho, processo: { agente: string | null; criador: string | null }): boolean {
  if (p.privilegiado) return true;
  if (!p.usuario_id) return false;
  return p.usuario_id === processo.agente || p.usuario_id === processo.criador;
}

/** O processo está com a pessoa (setor de lotação, ela mesma ou chefe do setor de destino)? */
export function estaComAPessoa(posse: PosseParaTrabalho, p: PerfilTrabalho, chefeDaPosse?: string | null): boolean {
  return podeAtuarNoDestino(
    { usuario_id: p.usuario_id, nome: '', cargo: null, setor_id: p.setor_id, admin_orgao: false },
    { para_setor_id: posse.setor_id, para_usuario_id: posse.usuario_id },
    chefeDaPosse ?? null,
  );
}

export function avaliarPermissaoEtapa(e: EntradaPermissao, p: PerfilTrabalho): ResultadoPermissao {
  const negar = (codigo: CodigoPermissao, motivo: string): ResultadoPermissao => ({ pode: false, codigo, motivo, por_privilegio: false, motivo_sem_privilegio: motivo });
  const titulo = e.etapa.titulo;
  // 1. A etapa pode iniciar? (vale para todos, inclusive o administrador)
  if (e.aguardando_demanda) {
    return negar(
      'AGUARDANDO_DEMANDA',
      `Aguardando a aprovação da demanda${e.aprovador_demanda ? ` por ${e.aprovador_demanda}` : ''}: antes dela só a demanda (DFD) pode ser trabalhada — "${titulo}" começa depois da aprovação.`,
    );
  }
  if (e.pendencias.length) {
    return negar(
      'AGUARDANDO_ETAPAS',
      `"${titulo}" ainda não pode começar: depende de ${lista(e.pendencias.map((x) => `"${x}"`))}, ainda não concluída${e.pendencias.length > 1 ? 's' : ''}.`,
    );
  }
  // 2 e 3. Quem age responde pela etapa e está com o processo
  const responsavel = ehResponsavelPelaEtapa(e, p);
  const posseExigida = e.exigir_posse && !!e.posse && !e.diligencia_aberta;
  const naPosse = !posseExigida || estaComAPessoa(e.posse!, p, e.chefe_da_posse);
  if (responsavel && naPosse) return { pode: true, codigo: 'OK', motivo: null, por_privilegio: false, motivo_sem_privilegio: null };
  const motivo = !responsavel
    ? `Esta etapa ("${titulo}") é de ${e.rotulo_responsavel}${e.posse ? ` e o processo está com ${e.posse.rotulo}` : ''}. Só quem responde pela etapa (ou o administrador do órgão) altera as peças dela.`
    : `O processo está com ${e.posse!.rotulo}. Para trabalhar em "${titulo}", o processo precisa estar com você ou com o seu setor — peça o envio pela tramitação.`;
  if (p.privilegiado) return { pode: true, codigo: 'OK', motivo: null, por_privilegio: true, motivo_sem_privilegio: motivo };
  return negar(responsavel ? 'SEM_POSSE' : 'NAO_RESPONSAVEL', motivo);
}
