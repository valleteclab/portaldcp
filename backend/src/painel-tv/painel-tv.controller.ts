import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { AtorAtual, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import type { Ator } from '../auth/acesso/ator';
import { PainelTvService } from './painel-tv.service';

/**
 * PAINEL PARA TV — leitura pela TV, SEM login de usuário e SEM JWT.
 *
 * `GET /api/painel-tv/:token` — só leitura; o token resolve o órgão (nenhum
 * parâmetro da requisição troca de órgão: query e corpo são ignorados).
 * Token inválido ou revogado: 404 (o mesmo, sem dizer se existiu). Limite de
 * requisições por token (429). O limite global por IP continua valendo.
 */
@Controller('painel-tv')
export class PainelTvController {
  constructor(private readonly painel: PainelTvService) {}

  @Public()
  @Get(':token')
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  dados(@Param('token') token: string) {
    return this.painel.dadosPorToken(token);
  }

  /** Painel do gestor na TV: andamento de todos os processos (sem valores nem despachos). */
  @Public()
  @Get(':token/andamento')
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  andamento(@Param('token') token: string) {
    return this.painel.andamentoPorToken(token);
  }
}

/**
 * GESTÃO DO PAINEL PARA TV — Configurações do órgão › Painel para TV.
 * Só o administrador do órgão (conta do órgão, usuário ADMIN ou admin da
 * plataforma com `?orgao_id=`); outros usuários 403, fornecedor 403,
 * anônimo 401. Sempre o órgão do token.
 */
@Controller('painel-tv-gestao')
@SomenteOrgao()
export class PainelTvGestaoController {
  constructor(private readonly painel: PainelTvService) {}

  @Get()
  async listar(@AtorAtual() ator: Ator, @Query('orgao_id') orgaoId?: string) {
    return this.painel.gestao(await this.painel.orgaoAdministrado(ator, orgaoId));
  }

  /** { nome } → { id, nome, token, caminho } — o token aparece só aqui. */
  @Post('links')
  async gerar(@AtorAtual() ator: Ator, @Body() body: { nome?: string }, @Query('orgao_id') orgaoId?: string) {
    const orgao = await this.painel.orgaoAdministrado(ator, orgaoId);
    return this.painel.gerarLink(orgao, body?.nome, await this.painel.autor(ator));
  }

  @Patch('links/:id')
  async renomear(@AtorAtual() ator: Ator, @Param('id') id: string, @Body() body: { nome?: string }, @Query('orgao_id') orgaoId?: string) {
    return this.painel.renomearLink(await this.painel.orgaoAdministrado(ator, orgaoId), id, body?.nome);
  }

  /** Revoga (a URL da TV passa a responder 404). */
  @Delete('links/:id')
  async revogar(@AtorAtual() ator: Ator, @Param('id') id: string, @Query('orgao_id') orgaoId?: string) {
    const orgao = await this.painel.orgaoAdministrado(ator, orgaoId);
    return this.painel.revogarLink(orgao, id, await this.painel.autor(ator));
  }

  /** { janela_contratos_dias: 30 | 60 | 90 | 120 } */
  @Put('configuracao')
  async configurar(@AtorAtual() ator: Ator, @Body() body: { janela_contratos_dias?: number }, @Query('orgao_id') orgaoId?: string) {
    const orgao = await this.painel.orgaoAdministrado(ator, orgaoId);
    return this.painel.salvarConfiguracao(orgao, body ?? {}, await this.painel.autor(ator));
  }

  /** Pré-visualização: os mesmos dados que a TV recebe, pelo login do administrador. */
  @Get('previa')
  @Header('Cache-Control', 'no-store')
  async previa(@AtorAtual() ator: Ator, @Query('orgao_id') orgaoId?: string) {
    return this.painel.dados(await this.painel.orgaoAdministrado(ator, orgaoId));
  }
}
