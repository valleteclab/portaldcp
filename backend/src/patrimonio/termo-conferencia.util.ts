import { SituacaoLeitura, StatusBem } from './entities/enums';
import { leituraContaNoRelatorio } from './confirmacao-presenca.util';

/**
 * Dados do TERMO DE CONFERÊNCIA DE SETOR — o documento que o responsável pelo
 * setor assina ao fechar a conferência e leva consigo.
 *
 * É o documento que protege quem conferiu: prova o que foi verificado, quando,
 * e o que foi encontrado fora do esperado. O relatório da comissão consolida
 * vários destes.
 *
 * A regra que vale aqui, e que não pode ser contornada: leitura que o próprio
 * conferente negou ("não está nesta sala") é ruído de antena e NÃO entra em
 * lugar nenhum do termo. Só vira divergência o que alguém na sala confirmou.
 */

export interface BemDoSetor {
  id: string;
  plaqueta: string | null;
  descricao: string;
  status?: StatusBem | string | null;
  valor_aquisicao?: number | string | null;
}

export interface LeituraDoSetor {
  id: string;
  bem_id: string | null;
  codigo_lido: string;
  situacao: SituacaoLeitura | string;
  presenca_confirmada?: boolean | null;
  setor_cadastro_nome?: string | null;
  observacao?: string | null;
  bem?: BemDoSetor | null;
}

export interface LinhaDivergencia {
  tombo: string;
  descricao: string;
  ocorrencia: string;
}

export interface QuadroTermo {
  cadastrados: number;
  conferidos: number;
  em_outro_setor: number;
  nao_localizados: number;
  sem_cadastro: number;
  baixados_presentes: number;
  valor_cadastrado: number;
  valor_conferido: number;
  valor_nao_localizado: number;
}

export interface DadosTermoSetor {
  quadro: QuadroTermo;
  divergencias: LinhaDivergencia[];
  /** Leituras negadas pelo conferente: só o número, para transparência. */
  descartadas: number;
}

const num = (v: unknown) => Number(v) || 0;
const arred2 = (n: number) => Math.round(n * 100) / 100;

/** Leituras que valem: as negadas pelo conferente caem fora logo na entrada. */
export function leiturasValidas<T extends LeituraDoSetor>(leituras: T[]): T[] {
  return (leituras || []).filter((l) => leituraContaNoRelatorio(l));
}

/**
 * Monta o quadro e a lista de divergências do setor.
 *
 * `localizadosEmOutraSala` traz os bens DESTE setor que outra sala confirmou
 * ter em mãos (bem_id -> nome da sala). Eles não são falta: foram achados, só
 * que em outro lugar, e por isso saem dos "não localizados".
 */
export function montarTermoSetor(entrada: {
  bens: BemDoSetor[];
  leituras: LeituraDoSetor[];
  localizadosEmOutraSala?: Map<string, string>;
}): DadosTermoSetor {
  const bens = entrada.bens || [];
  const todas = entrada.leituras || [];
  const valem = leiturasValidas(todas);
  const emOutraSala = entrada.localizadosEmOutraSala || new Map<string, string>();

  const conferidos = new Set(
    valem.filter((l) => l.bem_id && l.situacao === SituacaoLeitura.ENCONTRADO).map((l) => l.bem_id as string),
  );

  const naoLocalizados = bens.filter((b) => !conferidos.has(b.id) && !emOutraSala.has(b.id));
  const valor = (lista: BemDoSetor[]) => arred2(lista.reduce((s, b) => s + num(b.valor_aquisicao), 0));

  const divergencias: LinhaDivergencia[] = [];

  // 1) Bens do setor que outra sala confirmou ter.
  for (const b of bens) {
    const sala = !conferidos.has(b.id) ? emOutraSala.get(b.id) : undefined;
    if (sala) {
      divergencias.push({
        tombo: b.plaqueta || '—',
        descricao: b.descricao,
        ocorrencia: `Localizado em ${sala}`,
      });
    }
  }

  // 2) Bens do setor não encontrados em lugar nenhum.
  for (const b of naoLocalizados) {
    divergencias.push({ tombo: b.plaqueta || '—', descricao: b.descricao, ocorrencia: 'Não localizado' });
  }

  // 3) O que foi lido AQUI e não pertence a este setor, ou não está no cadastro.
  for (const l of valem) {
    const sit = String(l.situacao || '').toUpperCase();
    if (sit === SituacaoLeitura.OUTRO_SETOR) {
      divergencias.push({
        tombo: l.bem?.plaqueta || '—',
        descricao: l.bem?.descricao || l.codigo_lido,
        ocorrencia: `Pertence a ${l.setor_cadastro_nome || 'outro setor'}, encontrado aqui`,
      });
    } else if (sit === SituacaoLeitura.SEM_PLAQUETA) {
      divergencias.push({
        tombo: l.bem?.plaqueta || '—',
        descricao: l.bem?.descricao || l.observacao || l.codigo_lido,
        ocorrencia: 'Encontrado sem cadastro',
      });
    } else if (sit === SituacaoLeitura.DESCONHECIDO) {
      divergencias.push({
        tombo: '—',
        descricao: l.observacao || `Código ${l.codigo_lido}`,
        ocorrencia: 'Lido e não identificado no cadastro',
      });
    } else if (sit === SituacaoLeitura.BAIXADO_PRESENTE) {
      divergencias.push({
        tombo: l.bem?.plaqueta || '—',
        descricao: l.bem?.descricao || l.codigo_lido,
        ocorrencia: 'Baixado no cadastro, porém presente',
      });
    }
  }

  const contarValidas = (sit: SituacaoLeitura) =>
    valem.filter((l) => String(l.situacao || '').toUpperCase() === sit).length;

  return {
    quadro: {
      cadastrados: bens.length,
      conferidos: bens.filter((b) => conferidos.has(b.id)).length,
      em_outro_setor: bens.filter((b) => !conferidos.has(b.id) && emOutraSala.has(b.id)).length,
      nao_localizados: naoLocalizados.length,
      sem_cadastro: contarValidas(SituacaoLeitura.SEM_PLAQUETA) + contarValidas(SituacaoLeitura.DESCONHECIDO),
      baixados_presentes: contarValidas(SituacaoLeitura.BAIXADO_PRESENTE),
      valor_cadastrado: valor(bens),
      valor_conferido: valor(bens.filter((b) => conferidos.has(b.id))),
      valor_nao_localizado: valor(naoLocalizados),
    },
    divergencias,
    descartadas: todas.length - valem.length,
  };
}

/** Período da conferência em texto, para o cabeçalho do termo. */
export function periodoConferencia(inicio: Date | null | undefined, fim: Date | null | undefined): string {
  const d = (x: Date | null | undefined) =>
    x ? new Date(x).toLocaleDateString('pt-BR', { timeZone: 'America/Bahia' }) : null;
  const a = d(inicio);
  const b = d(fim);
  if (a && b) return a === b ? a : `${a} a ${b}`;
  return b || a || '—';
}

/**
 * Código curto para conferir a autenticidade do termo depois de impresso.
 * Determinístico: o mesmo setor sempre gera o mesmo código.
 */
export function codigoVerificacao(setorId: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < setorId.length; i++) {
    h ^= setorId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const hex = h.toString(16).toUpperCase().padStart(8, '0');
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}
