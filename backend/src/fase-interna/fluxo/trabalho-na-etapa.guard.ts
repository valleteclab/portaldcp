import { CanActivate, ExecutionContext, Injectable, NotFoundException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { ehUuid } from '../../auth/acesso/acesso-licitacao.service';
import { atorDaRequisicao } from '../../auth/acesso/ator';
import { PermissaoEtapaService } from './permissao-etapa.service';

/**
 * Alvo da escrita, para o `TrabalhoNaEtapaGuard`:
 *  - `passo`: código da etapa no modelo (ex.: 'PESQUISA', 'RESERVA');
 *  - `tipoParam` / `tipoCorpo`: tipo da peça na rota ou no corpo (JSON) — a etapa vem do modelo;
 *  - `documentoParam`: id da peça (a etapa vem do tipo dela);
 *  - `rascunhoParam`: id do rascunho da IA (a etapa/peça dele);
 *  - `condutor`: ação do processo inteiro (assistente, juntada em lote, copiloto) — só quem conduz.
 */
export interface AlvoTrabalho {
  passo?: string;
  tipoParam?: string;
  tipoCorpo?: string;
  documentoParam?: string;
  rascunhoParam?: string;
  condutor?: string;
  /** Rótulo da ação para o histórico (registro do administrador). */
  acao?: string;
}

export const TRABALHO_NA_ETAPA_KEY = 'fase-interna:trabalho-na-etapa';

/**
 * ESCRITA NUMA PEÇA/ETAPA (homologação multiusuário, 27/09/2026): marca o
 * endpoint para o `TrabalhoNaEtapaGuard` — só quem responde pela etapa, com
 * a etapa podendo começar (e, no modo por setor, com a posse do processo).
 */
export const TrabalhoNaEtapa = (alvo: AlvoTrabalho) => SetMetadata(TRABALHO_NA_ETAPA_KEY, alvo);

/**
 * GUARD DO ISOLAMENTO DAS PEÇAS — depois do `DonoFaseInternaGuard` (órgão
 * dono) e antes dos interceptors de upload (arquivo de quem não pode nem
 * chega a ser gravado). Só age nas rotas marcadas com `@TrabalhoNaEtapa`.
 * A regra é o `PermissaoEtapaService` (ponto único).
 */
@Injectable()
export class TrabalhoNaEtapaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissao: PermissaoEtapaService,
    private readonly ds: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const alvo = this.reflector.get<AlvoTrabalho>(TRABALHO_NA_ETAPA_KEY, context.getHandler());
    if (!alvo) return true;
    const req = context.switchToHttp().getRequest();
    const ator = atorDaRequisicao(req);
    if (!ator) return true; // o DonoFaseInternaGuard já recusou anônimo
    const params = req.params || {};
    let licitacaoId: string | undefined = params.licitacaoId;
    let tipo: string | null = null;
    let passo: string | null = alvo.passo ?? null;
    if (alvo.tipoParam) tipo = params[alvo.tipoParam] ?? null;
    if (alvo.tipoCorpo) tipo = req.body?.[alvo.tipoCorpo] ?? null;
    if (alvo.documentoParam) {
      const id = params[alvo.documentoParam];
      const [d] = ehUuid(id) ? await this.ds.query(`SELECT licitacao_id::text AS licitacao_id, tipo::text AS tipo FROM documentos_fase_interna WHERE id::text = $1`, [id]) : [];
      if (!d) throw new NotFoundException('Documento não encontrado');
      licitacaoId = d.licitacao_id;
      tipo = d.tipo;
    }
    if (alvo.rascunhoParam) {
      const id = params[alvo.rascunhoParam];
      const [r] = ehUuid(id) ? await this.ds.query(`SELECT licitacao_id::text AS licitacao_id, peca, etapa FROM rascunhos_ia_fase_interna WHERE id::text = $1`, [id]) : [];
      if (!r) return true; // o serviço responde 404 com o par (processo, rascunho)
      // Despacho de registro e de envio não são peças: as ações deles têm a própria regra
      if (['REGISTRO', 'TRAMITACAO'].includes(String(r.peca))) return true;
      licitacaoId = r.licitacao_id;
      passo = r.etapa ?? null;
      tipo = r.peca ?? null;
    }
    if (!licitacaoId) return true;
    if (alvo.condutor) {
      await this.permissao.exigirCondutor(licitacaoId, ator, alvo.condutor);
      return true;
    }
    await this.permissao.exigirPodeTrabalhar(licitacaoId, { passo, tipo }, ator, alvo.acao);
    return true;
  }
}
