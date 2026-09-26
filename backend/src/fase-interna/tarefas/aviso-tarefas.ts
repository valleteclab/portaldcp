/**
 * Aviso de "peça da fase interna mudou" para quem grava FORA do TypeORM
 * (SQL cru — ex.: espelho da aba Documentos) ou por update sem o id da
 * licitação. O TarefasService se registra aqui na inicialização (mesmo padrão
 * de `definirFonteDeFeriados`) — sem dependência de módulo para quem avisa.
 * Chamar DEPOIS do commit.
 */
let agendador: ((licitacaoId: string) => unknown) | null = null;

export function definirAgendadorDeTarefas(f: ((licitacaoId: string) => unknown) | null): void {
  agendador = f;
}

export function avisarPecaAlterada(licitacaoId: string | null | undefined): void {
  if (licitacaoId && agendador) {
    try {
      agendador(licitacaoId);
    } catch {
      /* a sincronização trata e loga os próprios erros */
    }
  }
}
