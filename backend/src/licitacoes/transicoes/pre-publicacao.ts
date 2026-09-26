import { FaseLicitacao, ModalidadeLicitacao } from '../entities/licitacao.entity';
import { itemValidoParaPublicacao, pendenciaItensParaPublicacao } from '../../itens/regras-itens-publicacao';
import { MODALIDADES_COM_EDITAL } from '../../publicacao/regras-publicacao';
import {
  avisoContratacaoDiretaGerado,
  editalAnexado,
  exclusividadeMpeArt48,
  instrucaoCompleta,
} from './definicoes';
import { ehFaseInterna } from './fases';
import { AtoLicitacao, ContextoTransicao } from './transicoes.tipos';

/**
 * CONFERÊNCIA DE PRÉ-PUBLICAÇÃO (tela do processo — Etapa B): o checklist
 * "antes de publicar" montado com as MESMAS pré-condições do ato PUBLICAR
 * (`definicoes.ts`), uma linha por exigência, com o estado, o que falta e a
 * ação que resolve. Nada aqui decide sozinho: cada linha repete a regra que o
 * PUBLICAR aplica (e o que o PUBLICAR recusaria e não coube numa linha vai em
 * "Outras pendências"). Núcleo puro — o serviço entrega o contexto do banco.
 */

export type EstadoConferencia = 'OK' | 'PENDENTE' | 'ALERTA';

/** Ação que a tela oferece na linha (o botão leva ao lugar certo). */
export type AcaoConferencia =
  | 'ABRIR_FASE_INTERNA'
  | 'GERAR_AVISO'
  | 'ANEXAR_EDITAL'
  | 'CADASTRAR_ITENS'
  | 'CANCELAR_PUBLICACAO'
  | 'VINCULAR_PCA'
  | 'CONFIGURAR_ME_EPP';

export interface ItemConferencia {
  chave: 'DOCUMENTOS' | 'AUTORIZACAO' | 'AVISO' | 'EDITAL' | 'ITENS' | 'PCA' | 'ME_EPP' | 'OUTRAS';
  rotulo: string;
  fundamento: string;
  estado: EstadoConferencia;
  /** Pendência que impede publicar / reenviar (ALERTA nunca bloqueia). */
  bloqueia: boolean;
  detalhe: string | null;
  pendencias: string[];
  acao: AcaoConferencia | null;
}

export interface ConferenciaPrePublicacao {
  /** A conferência vale na fase interna e enquanto a divulgação não é confirmada. */
  aplicavel: boolean;
  fase: string;
  /** Já enviado ao PNCP e aguardando a confirmação (ações de correção mudam). */
  aguardando_divulgacao: boolean;
  itens: ItemConferencia[];
  /** Linhas que bloqueiam (PENDENTE + bloqueia). */
  bloqueantes: number;
  pode_publicar: boolean;
}

/** Instrução do processo (fase interna) — `FaseInternaService.getInstrucao`. */
export interface InstrucaoParaConferencia {
  contratacao_direta: boolean;
  itens: Array<{
    tipo: string;
    titulo: string;
    obrigatorio: boolean;
    fundamento: string;
    status: string;
    aprovacao?: { etapa: number; total: number; etapa_nome: string; responsavel: string | null } | null;
  }>;
  pode_divulgar: boolean;
  pendentes: string[];
}

export interface EntradaConferencia {
  ctx: ContextoTransicao;
  instrucao: InstrucaoParaConferencia | null;
  /** Itens da contratação com vínculo próprio ao PCA (modo "por item"). */
  itensComPca: number;
  /** Pendências do PUBLICAR avaliadas pela máquina (as linhas que sobram viram "Outras"). */
  pendenciasPublicar: string[];
}

/** Tipo da autorização da autoridade competente na instrução (art. 72, VIII). */
const TIPO_AUTORIZACAO = 'AA';

const lista = (r: string | string[] | null | undefined): string[] => (r ? (Array.isArray(r) ? r : [r]).filter(Boolean) : []);

export async function conferirPrePublicacao(e: EntradaConferencia): Promise<ConferenciaPrePublicacao> {
  const ctx: ContextoTransicao = { ...e.ctx, ato: AtoLicitacao.PUBLICAR, somenteAvaliacao: true };
  const lic = ctx.licitacao as any;
  const interna = ehFaseInterna(lic.fase);
  const aguardando = lic.fase === FaseLicitacao.AGUARDANDO_DIVULGACAO;
  const direta = e.instrucao?.contratacao_direta ?? [ModalidadeLicitacao.DISPENSA_ELETRONICA, ModalidadeLicitacao.INEXIGIBILIDADE, ModalidadeLicitacao.CREDENCIAMENTO].includes(lic.modalidade);
  const concluidaRitoCompleto = !direta && !!lic.fase_interna_concluida;
  const itens: ItemConferencia[] = [];

  // 1. Documentos da fase interna (art. 72 na contratação direta; art. 18 no rito completo)
  const fundamentoDocs = direta ? 'Lei 14.133/2021, art. 72' : 'Lei 14.133/2021, art. 18';
  if (e.instrucao) {
    const docs = e.instrucao.itens.filter((i) => i.tipo !== TIPO_AUTORIZACAO);
    const pend = concluidaRitoCompleto ? [] : docs.filter((i) => i.obrigatorio && i.status !== 'OK');
    const prontos = docs.filter((i) => i.status === 'OK').length;
    itens.push({
      chave: 'DOCUMENTOS',
      rotulo: direta ? 'Instrução do processo (DFD, estimativa de despesa e peças "se for o caso")' : 'Documentos da fase interna (DFD/ETP, TR, pesquisa de preços, parecer)',
      fundamento: fundamentoDocs,
      estado: pend.length ? 'PENDENTE' : 'OK',
      bloqueia: pend.length > 0,
      detalhe: pend.length
        ? `Pendentes: ${pend.map((p) => `${p.titulo}${p.status === 'EM_APROVACAO' ? ' (em aprovação)' : ''}`).join('; ')}`
        : concluidaRitoCompleto
          ? 'Fase interna concluída'
          : `${prontos} documento(s) pronto(s)`,
      pendencias: pend.map((p) => `${p.titulo} (${p.fundamento})`),
      acao: pend.length ? 'ABRIR_FASE_INTERNA' : null,
    });
    const aut = e.instrucao.itens.find((i) => i.tipo === TIPO_AUTORIZACAO);
    if (aut) {
      const ok = aut.status === 'OK' || concluidaRitoCompleto;
      itens.push({
        chave: 'AUTORIZACAO',
        rotulo: 'Autorização da autoridade competente',
        fundamento: direta ? 'Lei 14.133/2021, art. 72, VIII' : aut.fundamento,
        estado: ok ? 'OK' : 'PENDENTE',
        bloqueia: !ok && aut.obrigatorio,
        detalhe: ok
          ? 'Autorizada'
          : aut.status === 'EM_APROVACAO'
            ? `Em aprovação${aut.aprovacao ? ` — ${aut.aprovacao.etapa_nome} (${aut.aprovacao.etapa}/${aut.aprovacao.total})${aut.aprovacao.responsavel ? ` · ${aut.aprovacao.responsavel}` : ''}` : ''}`
            : 'Ainda não emitida',
        pendencias: ok ? [] : [`${aut.titulo} (${aut.fundamento})`],
        acao: ok ? null : 'ABRIR_FASE_INTERNA',
      });
    }
  } else {
    const pend = lista(await instrucaoCompleta(ctx));
    itens.push({
      chave: 'DOCUMENTOS',
      rotulo: 'Documentos da fase interna',
      fundamento: fundamentoDocs,
      estado: pend.length ? 'PENDENTE' : 'OK',
      bloqueia: pend.length > 0,
      detalhe: pend.length ? pend.join(' · ') : null,
      pendencias: pend,
      acao: pend.length ? 'ABRIR_FASE_INTERNA' : null,
    });
  }

  // 2. Documento divulgado: aviso de contratação direta (dispensa) ou edital
  if (!lic.selecao_externa && lic.modalidade === ModalidadeLicitacao.DISPENSA_ELETRONICA) {
    const pend = lista(await avisoContratacaoDiretaGerado(ctx));
    const vigente = ctx.consultas.avisoContratacaoVigente ? await ctx.consultas.avisoContratacaoVigente() : null;
    // Já enviado: processo antigo sem aviso guardado tem o aviso gerado no envio (não bloqueia o reenvio)
    const soAlerta = pend.length > 0 && aguardando;
    itens.push({
      chave: 'AVISO',
      rotulo: 'Aviso de contratação direta (PDF)',
      fundamento: 'Lei 14.133/2021, art. 75, §3º; IN SEGES 67/2021',
      estado: pend.length ? (soAlerta ? 'ALERTA' : 'PENDENTE') : 'OK',
      bloqueia: pend.length > 0 && !soAlerta,
      detalhe: vigente ? `Versão ${vigente.versao} guardada no processo` : soAlerta ? 'Será gerado e guardado no próximo envio ao PNCP' : 'Ainda não gerado',
      pendencias: soAlerta ? [] : pend,
      acao: pend.length && !soAlerta ? 'GERAR_AVISO' : null,
    });
  } else if (!lic.selecao_externa && MODALIDADES_COM_EDITAL.includes(lic.modalidade)) {
    const pend = lista(await editalAnexado(ctx));
    const vigente = ctx.consultas.editalVigente ? await ctx.consultas.editalVigente() : null;
    itens.push({
      chave: 'EDITAL',
      rotulo: 'Edital (PDF)',
      fundamento: 'Lei 14.133/2021, art. 54',
      estado: pend.length ? 'PENDENTE' : 'OK',
      bloqueia: pend.length > 0,
      detalhe: vigente ? `Versão ${vigente.versao} anexada` : 'Ainda não anexado',
      pendencias: pend,
      acao: pend.length ? 'ANEXAR_EDITAL' : null,
    });
  }

  // 3. Itens com quantidade e valor estimado (todas as modalidades)
  const itensLic = ctx.consultas.itensParaPublicacao ? await ctx.consultas.itensParaPublicacao() : [];
  const pendItens = pendenciaItensParaPublicacao(itensLic);
  const validos = itensLic.filter(itemValidoParaPublicacao).length;
  itens.push({
    chave: 'ITENS',
    rotulo: `Itens com quantidade, unidade e valor estimado (${validos} válido(s))`,
    fundamento: 'Lei 14.133/2021, arts. 18 e 40; PNCP exige ao menos um item',
    estado: pendItens ? 'PENDENTE' : 'OK',
    bloqueia: !!pendItens,
    detalhe: pendItens
      ? interna
        ? pendItens
        : `${pendItens} Depois do envio os itens só mudam cancelando a publicação (nada foi divulgado ainda).`
      : `${validos} item(ns) prontos para o PNCP`,
    pendencias: pendItens ? [pendItens] : [],
    acao: pendItens ? (interna ? 'CADASTRAR_ITENS' : 'CANCELAR_PUBLICACAO') : null,
  });

  // 4. Plano de contratações anual (recomendação — não bloqueia a publicação)
  const vinculado = !!lic.item_pca_id || e.itensComPca > 0;
  const justificado = !vinculado && !!lic.sem_pca && String(lic.justificativa_sem_pca ?? '').trim().length > 0;
  itens.push({
    chave: 'PCA',
    rotulo: vinculado ? 'Vínculo com o plano de contratações anual (PCA)' : 'Sem vínculo com o PCA',
    fundamento: 'Lei 14.133/2021, art. 12, VII e §1º',
    estado: vinculado || justificado ? 'OK' : 'ALERTA',
    bloqueia: false,
    detalhe: vinculado
      ? lic.item_pca_id
        ? 'Processo vinculado a item do PCA'
        : `${e.itensComPca} item(ns) vinculado(s) ao PCA`
      : justificado
        ? 'Contratação fora do PCA, com justificativa registrada'
        : 'Vincule a um item do PCA ou registre a justificativa (recomendado)',
    pendencias: [],
    acao: vinculado || justificado ? null : 'VINCULAR_PCA',
  });

  // 5. ME/EPP (LC 123/2006 arts. 48 e 49) — só aparece quando há pendência
  const pendMpe = lista(await exclusividadeMpeArt48(ctx));
  if (pendMpe.length) {
    itens.push({
      chave: 'ME_EPP',
      rotulo: 'Tratamento ME/EPP (exclusividade ou justificativa)',
      fundamento: 'LC 123/2006, arts. 48 e 49',
      estado: 'PENDENTE',
      bloqueia: true,
      detalhe: pendMpe.join(' · '),
      pendencias: pendMpe,
      acao: 'CONFIGURAR_ME_EPP',
    });
  }

  // 6. O que mais o PUBLICAR recusaria (paridade com a máquina) — só antes do envio
  if (interna) {
    const cobertas = new Set(itens.flatMap((i) => i.pendencias));
    const outras = e.pendenciasPublicar.filter((p) => !cobertas.has(p) && !itens.some((i) => i.detalhe === p));
    // A instrução do rito completo chega como texto próprio; a linha de documentos já a mostra
    const semInstrucao = outras.filter((p) => !/^(Instrução do processo incompleta|Documento obrigatório da fase interna pendente)/.test(p));
    if (semInstrucao.length) {
      itens.push({
        chave: 'OUTRAS',
        rotulo: 'Outras pendências para publicar',
        fundamento: 'Lei 14.133/2021, arts. 54 e 55',
        estado: 'PENDENTE',
        bloqueia: true,
        detalhe: semInstrucao.join(' · '),
        pendencias: semInstrucao,
        acao: null,
      });
    }
  }

  const bloqueantes = itens.filter((i) => i.bloqueia && i.estado === 'PENDENTE').length;
  return {
    aplicavel: interna || aguardando,
    fase: lic.fase,
    aguardando_divulgacao: aguardando,
    itens,
    bloqueantes,
    pode_publicar: bloqueantes === 0,
  };
}
