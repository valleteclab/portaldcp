/**
 * PORTÕES LIGADOS AOS ATOS (Entrega 4) — ponte SEM injeção de dependência
 * (mesmo padrão de `tarefas/aviso-tarefas.ts`): quem pratica o ato protegido
 * pergunta as pendências do portão; o `ConformidadeService` se registra aqui
 * ao subir. Assim a máquina de estados (licitacoes/transicoes, módulo que a
 * fase interna importa) e o serviço das peças consultam o motor sem ciclo de
 * módulos. Sem o serviço registrado (testes unitários), nada é bloqueado.
 *
 *  - A (limite e fracionamento): concluir a etapa de pesquisa — emitir o mapa
 *    e a certidão; ato CONCLUIR_PESQUISA_PRECOS.
 *  - B (art. 72): autorizar — enviar o despacho para assinatura, assinar,
 *    anexar o despacho assinado fora.
 *  - C (conformidade): PUBLICAR.
 */
import type { AtoProtegido, Portao } from './tipos';

export interface OpcoesPortao {
  ato?: AtoProtegido | null;
  /** Só listando os atos disponíveis (sem o formulário): pode usar o que já foi revisado. */
  somenteAvaliacao?: boolean;
  /** Cronograma do pedido (PUBLICAR): prevalece sobre o gravado. */
  cronograma?: Record<string, unknown> | null;
  /** Valor total previsto por item (nº do item → total) — a pesquisa que vai ser emitida. */
  valores_itens?: Record<number, number> | null;
}

export type VerificadorDePortao = (licitacaoId: string, portao: Portao, opcoes: OpcoesPortao) => Promise<string[]>;

let verificador: VerificadorDePortao | null = null;

export function definirVerificadorDePortao(fn: VerificadorDePortao | null) {
  verificador = fn;
}

/** Pendências do portão (vazio = libera). Motor desligado ou indisponível: libera. */
export async function pendenciasDoPortaoDoProcesso(licitacaoId: string, portao: Portao, opcoes: OpcoesPortao = {}): Promise<string[]> {
  if (!verificador || process.env.FASE_INTERNA_CONFORMIDADE === 'false') return [];
  return verificador(licitacaoId, portao, opcoes);
}
