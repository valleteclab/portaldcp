/**
 * HIERARQUIA DE SETORES (funções PURAS — sem banco).
 *
 * Cada setor pode ter um SETOR SUPERIOR (`setor_superior_id`, do mesmo órgão).
 * A "secretaria" (unidade gestora) de um setor é:
 *  1. o setor mais próximo, subindo a árvore a partir dele mesmo, marcado como
 *     unidade superior (`eh_unidade_superior` — ex.: "Secretaria de Saúde");
 *  2. sem nenhuma marca no caminho, o TOPO da árvore (o setor sem superior).
 *
 * Por que a marca opcional e não só o topo: numa prefeitura é comum o topo ser
 * o Gabinete do Prefeito, com as secretarias abaixo dele. Só pelo topo, toda
 * demanda "subiria" até o Gabinete. Com a marca, o administrador diz onde a
 * pasta começa; sem marca nenhuma (estrutura simples, secretarias soltas), o
 * topo resolve sozinho.
 */
export interface SetorDaArvore {
  id: string;
  nome?: string | null;
  setor_superior_id?: string | null;
  eh_unidade_superior?: boolean | null;
  chefe_usuario_id?: string | null;
}

function porId<T extends SetorDaArvore>(setores: T[]): Map<string, T> {
  return new Map(setores.map((s) => [s.id, s]));
}

/**
 * O setor e os seus superiores, do mais próximo ao topo (o próprio primeiro).
 * Para no primeiro ciclo (dado inconsistente não trava a tela).
 */
export function caminhoAteOTopo<T extends SetorDaArvore>(setores: T[], setorId: string | null | undefined): T[] {
  if (!setorId) return [];
  const mapa = porId(setores);
  const caminho: T[] = [];
  const vistos = new Set<string>();
  let atual = mapa.get(setorId);
  while (atual && !vistos.has(atual.id)) {
    vistos.add(atual.id);
    caminho.push(atual);
    atual = atual.setor_superior_id ? mapa.get(atual.setor_superior_id) : undefined;
  }
  return caminho;
}

/** Secretaria (unidade gestora) do setor: a marcada mais próxima; sem marca, o topo. */
export function secretariaDoSetor<T extends SetorDaArvore>(setores: T[], setorId: string | null | undefined): T | null {
  const caminho = caminhoAteOTopo(setores, setorId);
  if (!caminho.length) return null;
  return caminho.find((s) => s.eh_unidade_superior === true) ?? caminho[caminho.length - 1];
}

/**
 * Chefe da secretaria do setor: o chefe da secretaria; sem chefe (ou chefe
 * inativo), sobe a hierarquia a partir dela até achar um chefe ativo. Nenhum
 * → null (quem chama usa a reserva da etapa).
 */
export function chefeDaSecretaria<T extends SetorDaArvore>(
  setores: T[],
  setorId: string | null | undefined,
  usuarioAtivo: (id: string) => boolean = () => true,
): { usuario_id: string; setor: T; secretaria: T } | null {
  const secretaria = secretariaDoSetor(setores, setorId);
  if (!secretaria) return null;
  for (const s of caminhoAteOTopo(setores, secretaria.id)) {
    if (s.chefe_usuario_id && usuarioAtivo(s.chefe_usuario_id)) return { usuario_id: s.chefe_usuario_id, setor: s, secretaria };
  }
  return null;
}

/** Chefe do próprio setor (ativo) — sem subir. */
export function chefeDoSetor<T extends SetorDaArvore>(
  setores: T[],
  setorId: string | null | undefined,
  usuarioAtivo: (id: string) => boolean = () => true,
): { usuario_id: string; setor: T } | null {
  const s = setorId ? porId(setores).get(setorId) : undefined;
  if (!s?.chefe_usuario_id || !usuarioAtivo(s.chefe_usuario_id)) return null;
  return { usuario_id: s.chefe_usuario_id, setor: s };
}

/** O setor `setorId` é `alvoId` ou está abaixo dele? */
export function estaAbaixoDe(setores: SetorDaArvore[], setorId: string | null | undefined, alvoId: string): boolean {
  return caminhoAteOTopo(setores, setorId).some((s) => s.id === alvoId);
}

/**
 * Valida o superior escolhido para o setor: do mesmo órgão (está na lista),
 * não ele mesmo e sem ciclo (o superior não pode estar abaixo do setor).
 * Devolve a mensagem de erro ou null.
 */
export function erroDoSuperior(setores: SetorDaArvore[], setorId: string | null, superiorId: string | null | undefined): string | null {
  if (!superiorId) return null;
  if (!setores.some((s) => s.id === superiorId)) return 'O setor superior deve ser um setor deste órgão.';
  if (setorId && superiorId === setorId) return 'Um setor não pode ser superior dele mesmo.';
  if (setorId) {
    // simula a troca: o caminho a partir do novo superior não pode passar pelo próprio setor
    const simulado = setores.map((s) => (s.id === setorId ? { ...s, setor_superior_id: superiorId } : s));
    const caminho = caminhoAteOTopo(simulado, superiorId);
    if (caminho.some((s) => s.id === setorId)) return 'Esse superior criaria um ciclo (ele já está abaixo deste setor).';
  }
  return null;
}

/** Árvore para a tela: cada setor com a profundidade, em ordem (pais antes dos filhos, por nome). */
export function arvoreOrdenada<T extends SetorDaArvore>(setores: T[]): Array<T & { nivel: number }> {
  const ids = new Set(setores.map((s) => s.id));
  const filhos = new Map<string | null, T[]>();
  for (const s of setores) {
    const pai = s.setor_superior_id && ids.has(s.setor_superior_id) && s.setor_superior_id !== s.id ? s.setor_superior_id : null;
    filhos.set(pai, [...(filhos.get(pai) ?? []), s]);
  }
  const nome = (s: T) => String(s.nome ?? '');
  const saida: Array<T & { nivel: number }> = [];
  const vistos = new Set<string>();
  const visitar = (pai: string | null, nivel: number) => {
    for (const s of (filhos.get(pai) ?? []).sort((a, b) => nome(a).localeCompare(nome(b), 'pt-BR'))) {
      if (vistos.has(s.id)) continue;
      vistos.add(s.id);
      saida.push({ ...s, nivel });
      visitar(s.id, nivel + 1);
    }
  };
  visitar(null, 0);
  // ciclos antigos (não deveriam existir): aparecem no fim, no nível 0
  for (const s of setores) if (!vistos.has(s.id)) saida.push({ ...s, nivel: 0 });
  return saida;
}
