import { Injectable } from '@nestjs/common';
import type { Ator } from '../auth/acesso/ator';
import { DocumentoFaseInterna, TipoDocumentoFaseInterna } from './entities/documento-fase-interna.entity';
import { ArquivoRecebido, MetadadosAnexo, PecasFaseInternaService } from './pecas-fase-interna.service';
import { OrcamentoService } from './orcamento/orcamento.service';
import { AutorizacaoTelaService } from './telas/autorizacao-tela.service';
import { ParecerTelaService } from './telas/parecer-tela.service';
import { TarefasService } from './tarefas/tarefas.service';

/**
 * "ANEXAR PDF" COM OS EFEITOS DA PEÇA — um caminho só para o anexo de uma peça
 * feita fora (E1) e para a juntada em lote da fase interna feita fora:
 *  - grava a peça (PecasFaseInternaService.anexarPeca — PDF, data, versão,
 *    folhas, portão B no despacho);
 *  - informação orçamentária: conclui a renovação de dotação pendente (E3A);
 *  - despacho de autorização: conclui a devolução pendente (E3B);
 *  - parecer (prévio ou da fase externa): conclui o retorno à Procuradoria (E3B).
 */
@Injectable()
export class JuntadaPecasService {
  constructor(
    private readonly pecas: PecasFaseInternaService,
    private readonly orcamento: OrcamentoService,
    private readonly autorizacao: AutorizacaoTelaService,
    private readonly parecer: ParecerTelaService,
    private readonly tarefas: TarefasService,
  ) {}

  async anexar(
    licitacaoId: string,
    tipo: string,
    arquivo: ArquivoRecebido | null | undefined,
    meta: MetadadosAnexo,
    ator: Ator,
  ): Promise<DocumentoFaseInterna> {
    const doc = await this.pecas.anexarPeca(licitacaoId, tipo, arquivo, meta ?? {}, ator);
    if (doc.tipo === TipoDocumentoFaseInterna.DOTACAO_ORCAMENTARIA) {
      await this.orcamento.aoAnexarInformacaoOrcamentaria(licitacaoId, doc.id, await this.tarefas.autor(ator)).catch(() => undefined);
    }
    if (doc.tipo === TipoDocumentoFaseInterna.AUTORIZACAO_ABERTURA) {
      await this.autorizacao.aoAnexarDespacho(licitacaoId, await this.tarefas.autor(ator)).catch(() => undefined);
    }
    if (doc.tipo === TipoDocumentoFaseInterna.PARECER_JURIDICO || doc.tipo === TipoDocumentoFaseInterna.PARECER_FASE_EXTERNA) {
      await this.parecer.aoAnexarParecer(licitacaoId, doc.tipo, await this.tarefas.autor(ator)).catch(() => undefined);
    }
    return doc;
  }
}
