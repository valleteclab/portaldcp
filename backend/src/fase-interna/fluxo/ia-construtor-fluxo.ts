/**
 * "MONTAR COM IA" do construtor de fluxo — funções PURAS: o pedido à IA
 * (JSON no formato do grafo) e a leitura da resposta (setor pelo nome do
 * setor do órgão, papel válido, peças do catálogo, posição automática). A
 * chamada à IA fica no serviço (`ConstrutorFluxoService.gerarComIa`).
 */
import { PAPEIS_FASE_INTERNA, ROTULO_PAPEL } from './codigos';
import { AjusteGrafo, GrafoFluxo, autoPosicionar, catalogoDoConstrutor, normalizarGrafo } from './grafo-fluxo';
import { ROTULO_TIPO_PROCESSO, TipoProcessoFluxo } from './modelo-fluxo';

export interface ContextoIaConstrutor {
  tipo: TipoProcessoFluxo;
  setores: Array<{ id: string; nome: string }>;
  usuarios: string[];
}

const chave = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Pedido à IA: o sistema (regras, setores, papéis, peças) e a descrição do órgão. */
export function pedidoAoConstrutor(ctx: ContextoIaConstrutor, descricao: string): { sistema: string; usuario: string } {
  const catalogo = catalogoDoConstrutor(ctx.tipo);
  const pecas = catalogo
    .map((c) => `${c.pecas.length ? c.pecas[0] : c.codigo} (${c.titulo})`)
    .join('; ');
  const setores = ctx.setores.length ? ctx.setores.map((s) => `"${s.nome}"`).join(', ') : '(o órgão não cadastrou setores: use "papel")';
  const papeis = PAPEIS_FASE_INTERNA.map((p) => `${p} (${ROTULO_PAPEL[p as keyof typeof ROTULO_PAPEL]})`).join(', ');
  const sistema = [
    'Você monta o fluxo de trabalho da FASE INTERNA de contratações de um órgão público brasileiro (Lei 14.133/2021).',
    'Transforme a descrição do órgão num fluxo e responda SOMENTE com um objeto JSON, sem texto fora dele:',
    '{"nos":[{"id":"n1","tipo":"inicio|etapa|aprovacao|condicao|fim","nome":"...","setor":"nome do setor ou null","papel":"CODIGO ou null","pecas":["..."],"prazo":3,"condicao":{"campo":"valor_total_estimado","operador":">","valor":80000}}],"arestas":[{"de":"n1","para":"n2","rotulo":"normal|sim|nao|devolve"}]}',
    'Regras:',
    '- exatamente um nó "inicio" e pelo menos um "fim"; todo nó (menos o fim) tem uma saída;',
    '- "etapa": um setor faz peças; "aprovacao": alguém aprova ou devolve (pode ter uma saída "devolve" para quem corrige); "condicao": pergunta com duas saídas, "sim" e "nao";',
    '- condição sobre o valor estimado: {"campo":"valor_total_estimado","operador":">"|">="|"<"|"<=","valor":número}; sobre o tipo: {"campo":"tipo_contratacao","operador":"igual","valor":"OBRA|SERVICO|COMPRA|SERVICO_ENGENHARIA"}; outra pergunta: {"campo":"manual"};',
    '- etapas em paralelo = várias saídas do mesmo nó que depois se juntam num nó;',
    `- quem faz: "setor" (um destes, pelo nome: ${setores}) ou "papel" (um destes códigos: ${papeis});`,
    `- "pecas" (só em etapa/aprovação; vazio = conclui por despacho, ex.: "Secretário de Finanças aprova"): use estes códigos — ${pecas}. Cada um aparece em UMA caixa só;`,
    `- tipo de processo: ${ROTULO_TIPO_PROCESSO[ctx.tipo]}. Respeite a lei: formalização da demanda (DFD), ETP, termo de referência, pesquisa de preços, reserva orçamentária, relatório e minutas, parecer jurídico, autorização e publicação; a pesquisa, a reserva e o parecer vêm antes da autorização; a autorização vem antes da publicação;`,
    '- nomes curtos, em português; prazos em dias úteis.',
  ].join('\n');
  return { sistema, usuario: `Descrição do fluxo do órgão:\n${String(descricao ?? '').slice(0, 3000)}` };
}

/**
 * RESPOSTA DA IA → grafo (rascunho): setor pelo nome (do órgão), papel pelo
 * código ou pelo nome, peças do catálogo; o resto passa pela normalização
 * (descartando o que não é do órgão) e ganha posição automática.
 */
export function grafoDaRespostaIa(bruto: unknown, ctx: ContextoIaConstrutor): { grafo: GrafoFluxo; ajustes: AjusteGrafo[] } | null {
  const o = bruto as any;
  if (!o || !Array.isArray(o.nos) || !Array.isArray(o.arestas)) return null;
  const setorPorNome = new Map(ctx.setores.map((s) => [chave(s.nome), s.id]));
  const papelPorNome = new Map<string, string>();
  for (const p of PAPEIS_FASE_INTERNA) {
    papelPorNome.set(chave(p), p);
    papelPorNome.set(chave(ROTULO_PAPEL[p as keyof typeof ROTULO_PAPEL]), p);
  }
  const avisos: AjusteGrafo[] = [];
  const nos = o.nos.map((n: any) => {
    if (!n || typeof n !== 'object') return n;
    const setor = n.setor ? setorPorNome.get(chave(n.setor)) ?? null : null;
    const papel = n.papel ? papelPorNome.get(chave(n.papel)) ?? null : !setor && n.setor ? papelPorNome.get(chave(n.setor)) ?? null : null;
    if (n.setor && !setor && !papel) avisos.push({ no: n.id ? String(n.id) : null, mensagem: `Setor "${String(n.setor).slice(0, 80)}" não existe no órgão: escolha quem faz "${String(n.nome ?? '').slice(0, 80)}".` });
    const responsavel = n.responsavel ?? (setor || papel ? { setor_id: setor, papel, usuario_id: null } : undefined);
    return { ...n, responsavel, prazo_dias_uteis: n.prazo_dias_uteis ?? n.prazo };
  });
  const { grafo, ajustes } = normalizarGrafo({ nos, arestas: o.arestas }, { tipo: ctx.tipo, setores: ctx.setores.map((s) => s.id), usuarios: ctx.usuarios, descartarInvalidos: true });
  return { grafo: autoPosicionar(grafo), ajustes: [...avisos, ...ajustes] };
}
