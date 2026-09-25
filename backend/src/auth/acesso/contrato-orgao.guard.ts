import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PATH_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from '../public.decorator';
import { atorDaRequisicao, ehFornecedor, ehOrgao } from './ator';
import { AcessoLicitacaoService, ModoAcesso, RecursoContrato } from './acesso-licitacao.service';

/**
 * DONO na execução contratual (rotas do ÓRGÃO em /api/contratos/**).
 *
 * Aplicado na classe do controller com `@AcessoContratoDoOrgao()`. Para cada
 * parâmetro de rota conhecido (`:contratoId`, `:medicaoId`, `:osId`, ...) e
 * para `contrato_id`/`contrato_ids`/`medicao_id` do corpo JSON, confere que o
 * recurso é do órgão do token:
 *  - não existe / id inválido → 404;
 *  - de outro órgão → 404 em leitura (GET/HEAD), 403 em escrita;
 *  - `orgao_id`/`orgaoId` no corpo diferente do órgão do token → 403;
 *  - fornecedor → 403 (usa /api/fornecedor/**), salvo rota marcada com
 *    `@FornecedorNaRotaDoOrgao()` (o handler filtra pelo token);
 *  - ADMIN da plataforma passa; rota @Public() não é checada; sem login → 401.
 *
 * Mapa padrão de parâmetros abaixo; uma rota em que `:id` é outro recurso
 * sobrescreve com `@ParametrosContrato({ id: 'termo' })` no método. A chave
 * pode ser qualificada pelo segmento anterior da rota (`'ordens/:id'`), que
 * tem prioridade sobre o nome simples (`id`).
 */
export const CONTRATO_ORGAO_MAPA_KEY = 'acesso:contrato-orgao:mapa';
export const FORNECEDOR_NA_ROTA_DO_ORGAO_KEY = 'acesso:contrato-orgao:fornecedor';

export type MapaParametrosContrato = Record<string, RecursoContrato | null>;

export const MAPA_PADRAO_CONTRATO: MapaParametrosContrato = {
  id: 'contrato',
  contratoId: 'contrato',
  medicaoId: 'medicao',
  osId: 'os',
  termoId: 'termo',
  docId: 'documento_contrato',
  anexoId: 'anexo_medicao',
  discriminacaoId: 'discriminacao',
  atestacaoId: 'atestacao',
  licencaId: 'licenca',
  bancoId: 'banco_metricas',
  etapaId: 'etapa',
  itemId: 'item_cronograma',
  vinculoId: 'conciliacao_pagamento',
  licitacaoId: 'licitacao',
};

/** Campos do corpo JSON checados (escrita). */
const CAMPOS_CORPO: Array<[string, RecursoContrato]> = [
  ['contrato_id', 'contrato'],
  ['contratoId', 'contrato'],
  ['medicao_id', 'medicao'],
];

@Injectable()
export class ContratoOrgaoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const alvos = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, alvos)) return true;

    const req = context.switchToHttp().getRequest();
    const ator = atorDaRequisicao(req);
    if (!ator) throw new UnauthorizedException('Autenticação necessária');
    if (ator.admin) return true;

    if (ehFornecedor(ator)) {
      if (this.reflector.getAllAndOverride<boolean>(FORNECEDOR_NA_ROTA_DO_ORGAO_KEY, alvos)) return true;
      throw new ForbiddenException('Ação exclusiva do órgão');
    }
    if (!ehOrgao(ator)) throw new ForbiddenException('Ação exclusiva do órgão');

    const mapa: MapaParametrosContrato = {
      ...MAPA_PADRAO_CONTRATO,
      ...(this.reflector.get<MapaParametrosContrato>(CONTRATO_ORGAO_MAPA_KEY, context.getClass()) || {}),
      ...(this.reflector.get<MapaParametrosContrato>(CONTRATO_ORGAO_MAPA_KEY, context.getHandler()) || {}),
    };
    const metodo = String(req.method || 'GET').toUpperCase();
    const modo: ModoAcesso = metodo === 'GET' || metodo === 'HEAD' ? 'leitura' : 'escrita';

    const params: Record<string, string> = req.params || {};
    const qualificados = segmentosDosParametros(this.reflector.get<string | string[]>(PATH_METADATA, context.getHandler()));
    for (const [nome, valor] of Object.entries(params)) {
      const chave = qualificados[nome];
      const tipo = chave && chave in mapa ? mapa[chave] : mapa[nome];
      if (!tipo) continue;
      await this.acesso.assertOrgaoDoRecursoContrato(ator, tipo, valor, modo);
    }

    const corpo = req.body;
    if (corpo && typeof corpo === 'object' && !Array.isArray(corpo) && modo === 'escrita') {
      for (const campo of ['orgao_id', 'orgaoId']) {
        const informado = corpo[campo];
        if (informado && informado !== ator.orgaoId) {
          throw new ForbiddenException('O órgão informado não confere com o usuário autenticado');
        }
      }
      for (const [campo, tipo] of CAMPOS_CORPO) {
        const v = corpo[campo];
        if (typeof v === 'string' && v) await this.acesso.assertOrgaoDoRecursoContrato(ator, tipo, v, 'escrita');
      }
      const lista = corpo.contrato_ids ?? corpo.contratoIds;
      if (Array.isArray(lista)) {
        for (const v of lista) {
          if (typeof v === 'string' && v) await this.acesso.assertOrgaoDoRecursoContrato(ator, 'contrato', v, 'escrita');
        }
      }
    }
    return true;
  }
}

/** `'ordens/:id/pdf'` → `{ id: 'ordens/:id' }` (segmento literal anterior + parâmetro). */
function segmentosDosParametros(caminho: string | string[] | undefined): Record<string, string> {
  const rota = Array.isArray(caminho) ? caminho[0] : caminho;
  const r: Record<string, string> = {};
  if (!rota) return r;
  const partes = String(rota).split('/').filter(Boolean);
  partes.forEach((p, i) => {
    if (p.startsWith(':') && i > 0 && !partes[i - 1].startsWith(':')) r[p.slice(1)] = `${partes[i - 1]}/${p}`;
  });
  return r;
}

/** Na classe: liga o guard (mapa padrão + ajustes da classe). */
export const AcessoContratoDoOrgao = (ajustes: MapaParametrosContrato = {}) =>
  applyDecorators(SetMetadata(CONTRATO_ORGAO_MAPA_KEY, ajustes), UseGuards(ContratoOrgaoGuard));

/** No método: ajusta o mapa (ex.: `{ id: 'termo' }`; `null` desliga o parâmetro). */
export const ParametrosContrato = (ajustes: MapaParametrosContrato) => SetMetadata(CONTRATO_ORGAO_MAPA_KEY, ajustes);

/** Rota do órgão que também atende fornecedor (o handler filtra pelo token). */
export const FornecedorNaRotaDoOrgao = () => SetMetadata(FORNECEDOR_NA_ROTA_DO_ORGAO_KEY, true);
