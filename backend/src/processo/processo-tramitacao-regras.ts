import { PerfilTramitacao, podeAtuarNoDestino } from '../fase-interna/tramitacao-regras';

/**
 * TRAMITAÇÃO GENÉRICA DO PROCESSO — regras puras (sem banco).
 * Vale para os processos sem licitação (ADITIVO, RENOVACAO, AVULSO).
 */

export const TIPOS_COM_TRAMITACAO_PROPRIA = ['ADITIVO', 'RENOVACAO', 'AVULSO'] as const;

export function temTramitacaoPropria(tipo: string): boolean {
  return (TIPOS_COM_TRAMITACAO_PROPRIA as readonly string[]).includes(tipo);
}

export type TipoMovimentacao = 'ABERTURA' | 'ENVIO' | 'DEVOLUCAO';

export interface PosseProcesso {
  para_setor_id: string | null;
  para_usuario_id: string | null;
  recebida_em: Date | string | null;
}

export type SituacaoPosse = 'SEM_TRAMITACAO' | 'AGUARDANDO_RECEBIMENTO' | 'COM_O_RESPONSAVEL';

export function situacaoDaPosse(atual: PosseProcesso | null | undefined): SituacaoPosse {
  if (!atual) return 'SEM_TRAMITACAO';
  return atual.recebida_em ? 'COM_O_RESPONSAVEL' : 'AGUARDANDO_RECEBIMENTO';
}

/** Administrador do órgão sempre atua; os demais, só se forem o destino (pessoa, setor ou chefe do setor). */
export function podeAtuar(perfil: PerfilTramitacao, atual: PosseProcesso | null, chefeDoSetor?: string | null): boolean {
  if (perfil.admin_orgao) return true;
  if (!atual) return false;
  return podeAtuarNoDestino(perfil, atual, chefeDoSetor);
}

export const DESPACHO_MIN = 3;
export const DESPACHO_MAX = 4000;

export function validarDestino(d: { para_setor_id?: unknown; para_usuario_id?: unknown; despacho?: unknown }): string | null {
  const setor = String(d.para_setor_id ?? '').trim();
  const usuario = String(d.para_usuario_id ?? '').trim();
  if (!setor && !usuario) return 'Informe o setor ou a pessoa de destino.';
  return validarDespacho(d.despacho);
}

export function validarDespacho(v: unknown): string | null {
  const despacho = String(v ?? '').trim();
  if (despacho.length < DESPACHO_MIN) return 'Escreva o despacho: diga ao destinatário o que precisa ser feito.';
  if (despacho.length > DESPACHO_MAX) return `O despacho passa de ${DESPACHO_MAX} caracteres.`;
  return null;
}

export interface DadosPeca {
  titulo?: unknown;
  texto?: unknown;
  arquivo_url?: unknown;
  arquivo_nome?: unknown;
  paginas?: unknown;
}

const URL_ARQUIVO = /^\/?(api\/)?uploads\/[A-Za-z0-9_\-./]+$/;

export interface PecaValidada {
  titulo: string;
  texto: string | null;
  arquivo_url: string | null;
  arquivo_nome: string | null;
  paginas: number;
}

/** Peça precisa de título e de texto OU arquivo (enviado pelo /uploads do próprio sistema). */
export function validarPeca(d: DadosPeca): { erro: string } | { dados: PecaValidada } {
  const titulo = String(d.titulo ?? '').trim();
  if (titulo.length < 3) return { erro: 'Informe o título da peça.' };
  const texto = String(d.texto ?? '').trim();
  const arquivo = String(d.arquivo_url ?? '').trim();
  if (!texto && !arquivo) return { erro: 'Escreva o texto da peça ou anexe o arquivo.' };
  if (arquivo && (!URL_ARQUIVO.test(arquivo) || arquivo.includes('..'))) return { erro: 'Arquivo inválido: envie-o pelo botão de anexar.' };
  const paginas = Math.min(500, Math.max(1, Math.floor(Number(d.paginas) || 1)));
  return {
    dados: {
      titulo: titulo.slice(0, 300),
      texto: texto ? texto.slice(0, 60000) : null,
      arquivo_url: arquivo ? arquivo.slice(0, 500) : null,
      arquivo_nome: arquivo ? String(d.arquivo_nome ?? '').trim().slice(0, 300) || null : null,
      paginas: arquivo ? paginas : 1,
    },
  };
}

/** Folhas da peça a partir da última folha usada nos autos. */
export function folhasDaPeca(ultimaFolha: number, paginas: number): { folha_inicial: number; folha_final: number } {
  const inicial = Math.max(0, ultimaFolha) + 1;
  return { folha_inicial: inicial, folha_final: inicial + Math.max(1, paginas) - 1 };
}

export interface EventoDaLinha {
  quando: Date;
  tipo: 'ABERTURA' | 'ENVIO' | 'DEVOLUCAO' | 'RECEBIMENTO' | 'PECA' | 'ENCERRAMENTO';
  titulo: string;
  detalhe: string | null;
  por: string | null;
}

/** Linha do tempo (do mais recente ao mais antigo) a partir das movimentações, peças e do encerramento. */
export function montarLinhaDoTempo(
  movimentacoes: Array<{
    tipo: string;
    despacho: string;
    created_at: Date | string;
    de_usuario_nome: string | null;
    para_setor_nome: string | null;
    para_usuario_nome: string | null;
    recebida_em: Date | string | null;
    recebida_por_nome: string | null;
  }>,
  pecas: Array<{ titulo: string; folha_inicial: number; folha_final: number; created_at: Date | string; criado_por_nome: string | null }>,
  encerramento: { em: Date | string; motivo: string | null } | null,
): EventoDaLinha[] {
  const eventos: EventoDaLinha[] = [];
  for (const m of movimentacoes) {
    const destino = textoDoDestino(m);
    const tipo = m.tipo === 'ABERTURA' ? 'ABERTURA' : m.tipo === 'DEVOLUCAO' ? 'DEVOLUCAO' : 'ENVIO';
    eventos.push({
      quando: new Date(m.created_at),
      tipo,
      titulo: tipo === 'ABERTURA' ? `Processo autuado — com ${destino}` : tipo === 'DEVOLUCAO' ? `Devolvido para ${destino}` : `Enviado para ${destino}`,
      detalhe: m.despacho || null,
      por: m.de_usuario_nome,
    });
    if (m.recebida_em && tipo !== 'ABERTURA') {
      eventos.push({ quando: new Date(m.recebida_em), tipo: 'RECEBIMENTO', titulo: `Recebido por ${m.recebida_por_nome ?? destino}`, detalhe: null, por: m.recebida_por_nome });
    }
  }
  for (const p of pecas) {
    const folhas = p.folha_inicial === p.folha_final ? `fl. ${p.folha_inicial}` : `fls. ${p.folha_inicial}–${p.folha_final}`;
    eventos.push({ quando: new Date(p.created_at), tipo: 'PECA', titulo: `Juntado: ${p.titulo} (${folhas})`, detalhe: null, por: p.criado_por_nome });
  }
  if (encerramento) {
    eventos.push({ quando: new Date(encerramento.em), tipo: 'ENCERRAMENTO', titulo: 'Processo encerrado', detalhe: encerramento.motivo, por: null });
  }
  return eventos.sort((a, b) => b.quando.getTime() - a.quando.getTime());
}

export function textoDoDestino(m: { para_setor_nome?: string | null; para_usuario_nome?: string | null }): string {
  return [m.para_setor_nome, m.para_usuario_nome].filter(Boolean).join(' · ') || 'Órgão';
}
