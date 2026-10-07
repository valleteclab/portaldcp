import { definicaoDoNo, travasFaltando } from '../nos/catalogo-nos';

/**
 * DESENHO DO FLUXO (tela "Desenhar o fluxo", mockup aprovado em 06/10/2026):
 * o fluxo é uma sequência de etapas. A tela manda a sequência inteira a cada
 * gravação (adicionar, reordenar, remover e configurar de uma vez); aqui fica
 * a regra pura — o que é uma etapa válida e o que impede ativar.
 */

export type TipoResponsavel = 'SETOR' | 'USUARIO' | 'SOLICITANTE';

export interface EtapaDesenho {
  /** Id da ação já gravada ou chave temporária ("novo-…") de etapa nova. */
  chave: string;
  tipo: string;
  nome: string;
  responsavel_tipo: TipoResponsavel;
  responsaveis: string[];
  prazo_dias_uteis: number | null;
  /** Etapa (chave) para onde volta quando há ressalva; nula = a anterior. */
  devolver_para: string | null;
  /** Aceita documento feito fora do sistema (anexar PDF pronto). */
  aceita_documento_externo: boolean;
  avisos: unknown;
  notificar: unknown;
}

/** Tipos de processo e as etapas que a lei exige no desenho deles. */
export const ETAPAS_EXIGIDAS: Record<string, string[]> = {
  CONTRATACAO: ['PARECER_JURIDICO', 'PUBLICACAO'], // arts. 53 e 54/94
  ADITIVO: ['PARECER_JURIDICO', 'PUBLICACAO'], // art. 53, § 4º (termos aditivos) e art. 94
  RENOVACAO: ['PARECER_JURIDICO', 'PUBLICACAO'],
};

export const TIPOS_PROCESSO_DO_FLUXO = ['CONTRATACAO', 'ADITIVO', 'RENOVACAO', 'AVULSO'] as const;

const MAX_ETAPAS = 40;

/** Normaliza o corpo de `PUT /workflows/:id/desenho`; lança Error com a mensagem para 400. */
export function normalizarEtapas(corpo: unknown): EtapaDesenho[] {
  const lista = Array.isArray((corpo as any)?.etapas) ? ((corpo as any).etapas as any[]) : null;
  if (!lista) throw new Error('Envie a lista de etapas.');
  if (lista.length > MAX_ETAPAS) throw new Error(`O fluxo pode ter no máximo ${MAX_ETAPAS} etapas.`);
  const chaves = new Set<string>();
  const etapas = lista.map((e, i): EtapaDesenho => {
    const chave = String(e?.chave ?? '').trim();
    if (!chave) throw new Error(`Etapa ${i + 1}: falta a chave.`);
    if (chaves.has(chave)) throw new Error(`Etapa ${i + 1}: chave repetida.`);
    chaves.add(chave);
    const tipo = String(e?.tipo ?? '').trim().toUpperCase();
    const def = definicaoDoNo(tipo);
    if (!def || !def.disponivel) throw new Error(`Etapa ${i + 1}: tipo de etapa indisponível (${tipo || 'vazio'}).`);
    const nome = String(e?.nome ?? '').trim().slice(0, 160) || def.rotulo;
    const rt = String(e?.responsavel_tipo ?? 'SETOR').toUpperCase();
    if (!['SETOR', 'USUARIO', 'SOLICITANTE'].includes(rt)) throw new Error(`Etapa ${i + 1}: tipo de responsável inválido.`);
    const responsaveis = rt === 'SOLICITANTE' ? [] : [...new Set((Array.isArray(e?.responsaveis) ? e.responsaveis : []).map(String).filter(Boolean))] as string[];
    let prazo: number | null = null;
    if (e?.prazo_dias_uteis !== null && e?.prazo_dias_uteis !== undefined && e?.prazo_dias_uteis !== '') {
      prazo = Number(e.prazo_dias_uteis);
      if (!Number.isInteger(prazo) || prazo < 0 || prazo > 365) throw new Error(`Etapa ${i + 1}: prazo deve ser de 0 a 365 dias úteis.`);
    }
    const devolver = e?.devolver_para ? String(e.devolver_para) : null;
    return {
      chave,
      tipo,
      nome,
      responsavel_tipo: rt as TipoResponsavel,
      responsaveis,
      prazo_dias_uteis: prazo,
      devolver_para: devolver,
      aceita_documento_externo: def.documento.aceita_externo ? e?.aceita_documento_externo !== false : false,
      avisos: e?.avisos,
      notificar: e?.notificar,
    };
  });
  etapas.forEach((e, i) => {
    if (!e.devolver_para) return;
    const alvo = etapas.findIndex((x) => x.chave === e.devolver_para);
    if (alvo < 0 || alvo >= i) throw new Error(`Etapa ${i + 1} (${e.nome}): só pode devolver para uma etapa anterior.`);
  });
  return etapas;
}

/** O que impede ativar o desenho (vazio = pode ativar). */
export function errosParaAtivar(tipoProcesso: string | null, etapas: Array<Pick<EtapaDesenho, 'tipo' | 'nome' | 'responsavel_tipo' | 'responsaveis'>>): string[] {
  const erros: string[] = [];
  if (!etapas.length) erros.push('Coloque ao menos uma etapa no fluxo.');
  erros.push(...travasFaltando(etapas.map((e) => e.tipo), ETAPAS_EXIGIDAS[tipoProcesso ?? ''] ?? []));
  for (const e of etapas) {
    const automatico = definicaoDoNo(e.tipo)?.automatico;
    if (!automatico && e.responsavel_tipo !== 'SOLICITANTE' && !e.responsaveis.length) erros.push(`Defina o responsável da etapa "${e.nome}".`);
  }
  return erros;
}

/** Etapas obrigatórias por lei não podem sair do desenho de um processo que as exige. */
export function removidasComTrava(tipoProcesso: string | null, antes: string[], depois: string[]): string[] {
  const exigidas = new Set(ETAPAS_EXIGIDAS[tipoProcesso ?? ''] ?? []);
  const restantes = new Set(depois);
  return [...new Set(antes)].filter((t) => exigidas.has(t) && !restantes.has(t)).map((t) => `${definicaoDoNo(t)?.rotulo ?? t} é obrigatória por lei e não pode ser removida.`);
}
