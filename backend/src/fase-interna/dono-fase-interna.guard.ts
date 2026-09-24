import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { AcessoLicitacaoService, ehUuid, ModoAcesso } from '../auth/acesso/acesso-licitacao.service';
import { atorDaRequisicao, ehOrgao } from '../auth/acesso/ator';

/**
 * AUTORIZAÇÃO DA FASE INTERNA (E1a).
 *
 * Aplicado nos controllers da fase interna (na classe). Para cada rota:
 *  - @Public(): passa (ex.: relatório público de preços);
 *  - exige ator do lado da Administração (ORGAO/USUARIO com órgão, ou ADMIN
 *    da plataforma): anônimo → 401, fornecedor → 403;
 *  - rota com `:licitacaoId` → órgão DONO da licitação;
 *  - rota marcada com @DonoPor('documento' | 'tramitacao' | 'etapa', 'param')
 *    → resolve a licitação do recurso e exige o órgão dono.
 *  Modo: GET → 'leitura' (outro órgão recebe 404); demais → 'escrita' (403).
 *
 * Roda ANTES dos interceptors (upload multer): arquivo de quem não é dono
 * nem chega a ser gravado.
 */
export type RecursoFaseInterna = 'documento' | 'tramitacao' | 'etapa';
export const DONO_POR_KEY = 'fase-interna:dono-por';

/** Licitação dona do recurso identificado pelo parâmetro `param` da rota. */
export const DonoPor = (recurso: RecursoFaseInterna, param = 'id') => SetMetadata(DONO_POR_KEY, { recurso, param });

const SQL_LICITACAO_DO_RECURSO: Record<RecursoFaseInterna, string> = {
  documento: `SELECT licitacao_id FROM documentos_fase_interna WHERE id = $1`,
  tramitacao: `SELECT licitacao_id FROM tramitacoes_processo WHERE id = $1`,
  etapa: `SELECT licitacao_id FROM aprovacoes_documento WHERE id = $1`,
};

@Injectable()
export class DonoFaseInternaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly acesso: AcessoLicitacaoService,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const alvos = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, alvos)) return true;

    const req = context.switchToHttp().getRequest();
    const ator = atorDaRequisicao(req);
    if (!ator) throw new UnauthorizedException('Autenticação necessária');
    if (!ator.admin && !ehOrgao(ator)) throw new ForbiddenException('Ação exclusiva do órgão');

    const modo: ModoAcesso = req.method === 'GET' ? 'leitura' : 'escrita';
    const params = req.params || {};

    if (params.licitacaoId !== undefined) {
      await this.acesso.assertOrgaoDaLicitacao(ator, params.licitacaoId, modo);
    }

    const donoPor = this.reflector.get<{ recurso: RecursoFaseInterna; param: string }>(DONO_POR_KEY, context.getHandler());
    if (donoPor) {
      const id = params[donoPor.param];
      const r = ehUuid(id) ? await this.dataSource.query(SQL_LICITACAO_DO_RECURSO[donoPor.recurso], [id]) : [];
      const licitacaoId = r[0]?.licitacao_id;
      if (!licitacaoId) throw new NotFoundException('Registro não encontrado');
      await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId, modo);
    }
    return true;
  }
}
