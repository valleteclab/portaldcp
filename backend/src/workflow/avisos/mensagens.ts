/**
 * Texto dos avisos do fluxo — linguagem administrativa (estilo SEI), sem
 * "Sua vez" e sem a palavra "empenho". Funções puras: nada de I/O aqui, só
 * montagem de string, para serem testadas sem banco nem rede.
 */

export function formatarDataBR(data: Date): string {
  return data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export interface DadosMensagemTarefa {
  numero: string;
  acaoNome: string;
  /** Ex.: "Setor de Compras", "Fulano de Tal" ou "o solicitante". */
  responsavelLabel: string;
  prazo: Date | null;
}

export function montarMensagemChegada(dados: DadosMensagemTarefa): string {
  const prazoTxt = dados.prazo ? ` Prazo: ${formatarDataBR(dados.prazo)}.` : '';
  return `Processo nº ${dados.numero} aguarda providência de ${dados.responsavelLabel}: ${dados.acaoNome}.${prazoTxt}`;
}

export function montarMensagemVespera(dados: DadosMensagemTarefa): string {
  const prazoTxt = dados.prazo ? ` em ${formatarDataBR(dados.prazo)}` : '';
  return `Processo nº ${dados.numero} vence prazo${prazoTxt} na etapa ${dados.acaoNome}, a cargo de ${dados.responsavelLabel}.`;
}

export interface DadosMensagemNotificar {
  numero: string;
  acaoNome: string;
  mensagem: string;
}

/** Nó "Notificar": usa o texto configurado pelo órgão, só prefixado com o número do processo. */
export function montarMensagemNotificar(dados: DadosMensagemNotificar): string {
  const texto = dados.mensagem?.trim();
  return texto ? `Processo nº ${dados.numero} — ${dados.acaoNome}: ${texto}` : `Processo nº ${dados.numero} — ${dados.acaoNome}.`;
}

export function linkDoProcesso(baseUrl: string, processoId: string): string {
  return `${baseUrl.replace(/\/$/, '')}/orgao/processo/${processoId}`;
}
