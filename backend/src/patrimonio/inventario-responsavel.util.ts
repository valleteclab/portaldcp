/**
 * Agrupamento dos setores de uma campanha por responsável, para que quem
 * confere vários setores receba UMA mensagem e troque de setor dentro do app.
 * A identidade do responsável é o WhatsApp (nome é digitado livre e varia).
 */

/** Telefone comparável: só dígitos, sem o DDI 55 quando vier com ele. */
export function chaveTelefone(telefone?: string | null): string {
  const d = String(telefone ?? '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) return d.slice(2);
  return d;
}

export interface SetorComResponsavel {
  id: string;
  setor_nome: string;
  responsavel_nome: string | null;
  responsavel_telefone: string | null;
  status: string;
}

export interface GrupoResponsavel<T extends SetorComResponsavel> {
  telefone: string;
  nome: string | null;
  setores: T[];
}

/**
 * Agrupa por telefone os setores que ainda não foram finalizados.
 * Setores sem telefone ficam de fora (voltam em `semTelefone`).
 */
export function agruparPorResponsavel<T extends SetorComResponsavel>(
  setores: T[],
  statusFinalizado = 'FECHADO',
): { grupos: GrupoResponsavel<T>[]; semTelefone: T[] } {
  const grupos = new Map<string, GrupoResponsavel<T>>();
  const semTelefone: T[] = [];
  for (const s of setores) {
    if (s.status === statusFinalizado) continue;
    const chave = chaveTelefone(s.responsavel_telefone);
    if (!chave) {
      semTelefone.push(s);
      continue;
    }
    const g = grupos.get(chave) || { telefone: s.responsavel_telefone as string, nome: null, setores: [] };
    if (!g.nome && s.responsavel_nome?.trim()) g.nome = s.responsavel_nome.trim();
    g.setores.push(s);
    grupos.set(chave, g);
  }
  for (const g of grupos.values()) g.setores.sort((a, b) => a.setor_nome.localeCompare(b.setor_nome, 'pt-BR'));
  return { grupos: [...grupos.values()], semTelefone };
}

/** Texto do WhatsApp: um setor ou a lista dos setores da mesma pessoa. */
export function mensagemConvite(p: {
  ano: number;
  orgaoNome: string;
  responsavelNome: string | null;
  setores: string[];
  link: string;
}): string {
  const ola = `Olá${p.responsavelNome ? `, ${p.responsavelNome}` : ''}!`;
  const cabecalho = `📋 *Inventário ${p.ano} — ${p.orgaoNome}*\n\n`;
  const rodape = `\n\n_Se preferir, instale como aplicativo pelo aviso que aparece na tela._`;
  if (p.setores.length <= 1) {
    return (
      cabecalho +
      `${ola} Você é responsável pela conferência do setor *${p.setores[0] || ''}*.\n\n` +
      `Abra o link no celular, aponte a câmera para o QR de cada plaqueta e finalize quando terminar:\n${p.link}` +
      rodape
    );
  }
  return (
    cabecalho +
    `${ola} Você é responsável pela conferência de *${p.setores.length} setores*:\n` +
    p.setores.map((n) => `• ${n}`).join('\n') +
    `\n\nUm único link serve para todos. Abra no celular e troque de setor pelo topo da tela; finalize cada um quando terminar:\n${p.link}` +
    rodape
  );
}
