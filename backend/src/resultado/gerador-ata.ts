import { Injectable, NotImplementedException } from '@nestjs/common';
import type { AtorTransicao } from '../licitacoes/transicoes/transicoes.tipos';

/**
 * ============================================================================
 * GANCHO DA ATA DE REGISTRO DE PREÇOS (plano E6 item 2 — Lei 14.133/2021
 * arts. 82–86; Decreto 11.462/2023)
 * ============================================================================
 *
 * Na licitação com `srp = true` a homologação NÃO gera contrato: gera a(s)
 * ARP com os itens homologados, os vencedores, os preços adjudicados e o
 * cadastro de reserva. O `ResultadoService` chama este gancho logo depois de
 * confirmada a homologação (fora da transação do ato, como o contrato).
 *
 * CONTRATO DO GANCHO (a implementação da parte ARP deve cumprir):
 *  - `gerarAtaRegistroPreco(licitacaoId, ctx)` só é chamado com a licitação
 *    HOMOLOGADA (fase HOMOLOGACAO) e `srp = true`;
 *  - fonte dos dados: `itens_licitacao` com status HOMOLOGADO e
 *    `fornecedor_vencedor_id` / `valor_unitario_homologado` /
 *    `valor_total_homologado` (valores da proposta adequada aceita — E6), e
 *    `licitantes_unidade` (VENCEDOR = fornecedor da ata; demais não excluídos,
 *    na ordem do ranking único, = cadastro de reserva — art. 82 VII / Dec.
 *    11.462 art. 18);
 *  - IDEMPOTENTE: chamado de novo (re-homologação sem instrumento, botão
 *    "gerar instrumentos") não duplica atas — devolve as existentes;
 *  - grava em `atas_registro_preco` (com `licitacao_id`) — é o que a
 *    pré-condição do CONCLUIR (`haContratoOuAta`) conta;
 *  - lança exceção se não conseguir gerar (o ResultadoService registra a
 *    falha e devolve o erro na resposta; a homologação continua válida e o
 *    órgão pode tentar de novo por `POST /api/resultado/licitacao/:id/instrumentos`).
 *
 * Enquanto a parte ARP não é implementada, o provedor padrão lança
 * NotImplementedException (501) — nunca gera contrato no lugar da ata (B10).
 * Para plugar: no `ResultadoModule`, trocar o provider de
 * `GERADOR_ATA_REGISTRO_PRECO` (`useExisting`/`useClass` do serviço de atas).
 */
export const GERADOR_ATA_REGISTRO_PRECO = Symbol('GERADOR_ATA_REGISTRO_PRECO');

export interface AtaGerada {
  id: string;
  numero: string;
  fornecedorId: string;
  valorTotal: number;
}

export interface GeradorAtaRegistroPreco {
  gerarAtaRegistroPreco(licitacaoId: string, ctx: { ator: AtorTransicao }): Promise<AtaGerada[]>;
}

@Injectable()
export class GeradorAtaNaoImplementado implements GeradorAtaRegistroPreco {
  async gerarAtaRegistroPreco(licitacaoId: string): Promise<AtaGerada[]> {
    throw new NotImplementedException(
      `Geração da Ata de Registro de Preços ainda não implementada (licitação ${licitacaoId}, SRP — plano E6 parte ARP). ` +
        'A homologação foi registrada; nenhum contrato foi gerado no lugar da ata.',
    );
  }
}
