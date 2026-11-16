/**
 * Validação pura da configuração de avisos salva em `acao.configuracao`.
 * Sem I/O — quem chama confere separadamente se setor/usuário/canal do Teams
 * pertencem ao órgão (precisa do banco).
 */

export const CANAIS_VALIDOS = ['WHATSAPP', 'EMAIL', 'TEAMS'] as const;
export type CanalAviso = (typeof CANAIS_VALIDOS)[number];

export interface ConfigAvisos {
  canais: CanalAviso[];
  teams_canal_id?: string | null;
  chegada: boolean;
  vespera_prazo: boolean;
}

export function normalizarAvisos(body: unknown): ConfigAvisos {
  const b = (body ?? {}) as Record<string, unknown>;
  const canaisInformados = Array.isArray(b.canais) ? b.canais.map((c) => String(c).toUpperCase()) : [];
  const canais = canaisInformados.filter((c): c is CanalAviso => (CANAIS_VALIDOS as readonly string[]).includes(c));
  if (canaisInformados.length && !canais.length) throw new Error('Canal de aviso inválido');
  if (canais.includes('TEAMS') && !b.teams_canal_id) throw new Error('Selecione o canal do Teams');
  return {
    canais,
    teams_canal_id: canais.includes('TEAMS') ? String(b.teams_canal_id) : null,
    chegada: b.chegada !== false,
    vespera_prazo: b.vespera_prazo === true,
  };
}

export const TIPOS_DESTINATARIO = ['SETOR', 'USUARIO', 'SOLICITANTE'] as const;
export type TipoDestinatario = (typeof TIPOS_DESTINATARIO)[number];

export interface DestinatarioConfig {
  tipo: TipoDestinatario;
  id?: string;
}

export interface ConfigNotificar {
  destinatarios: DestinatarioConfig[];
  canais: CanalAviso[];
  teams_canal_id?: string | null;
  mensagem: string;
}

export function normalizarNotificar(body: unknown): ConfigNotificar {
  const b = (body ?? {}) as Record<string, unknown>;
  const destinatariosInformados = Array.isArray(b.destinatarios) ? b.destinatarios : [];
  const destinatarios: DestinatarioConfig[] = destinatariosInformados.map((d) => {
    const item = (d ?? {}) as Record<string, unknown>;
    const tipo = String(item.tipo ?? '').toUpperCase();
    if (!(TIPOS_DESTINATARIO as readonly string[]).includes(tipo)) throw new Error('Tipo de destinatário inválido');
    if (tipo !== 'SOLICITANTE' && !item.id) throw new Error('Informe o setor ou o usuário destinatário');
    return { tipo: tipo as TipoDestinatario, id: tipo === 'SOLICITANTE' ? undefined : String(item.id) };
  });
  if (!destinatarios.length) throw new Error('Informe ao menos um destinatário');
  const canaisInformados = Array.isArray(b.canais) ? b.canais.map((c) => String(c).toUpperCase()) : [];
  const canais = canaisInformados.filter((c): c is CanalAviso => (CANAIS_VALIDOS as readonly string[]).includes(c));
  if (!canais.length) throw new Error('Escolha ao menos um canal de aviso');
  if (canais.includes('TEAMS') && !b.teams_canal_id) throw new Error('Selecione o canal do Teams');
  const mensagem = String(b.mensagem ?? '').trim();
  if (!mensagem) throw new Error('Informe a mensagem do aviso');
  return { destinatarios, canais, teams_canal_id: canais.includes('TEAMS') ? String(b.teams_canal_id) : null, mensagem };
}
