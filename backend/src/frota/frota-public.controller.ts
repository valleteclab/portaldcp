import {
  Controller, Get, Post, Put, Body, Param, Headers, Req, Res, Query,
  UnauthorizedException, BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { FrotaAuthService, FrotaJwtPayload } from './frota-auth.service';
import { FrotaService } from './frota.service';
import { AcaoFrotaLog } from './entities/frota-acesso-log.entity';

function getIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string || req.ip || 'unknown').split(',')[0].trim().slice(0, 50);
}

function getUserAgent(req: Request): string {
  return (req.headers['user-agent'] || '').slice(0, 500);
}

function getPostoPayload(token: string, frotaAuth: FrotaAuthService): FrotaJwtPayload {
  const payload = frotaAuth.validateFrotaToken(token);
  if (payload.type !== 'FROTA_POSTO') throw new UnauthorizedException('Apenas postos podem usar este endpoint');
  return payload;
}

function getVereadorPayload(token: string, frotaAuth: FrotaAuthService): FrotaJwtPayload {
  const payload = frotaAuth.validateFrotaToken(token);
  if (payload.type !== 'FROTA_VEREADOR') throw new UnauthorizedException('Apenas vereadores podem usar este endpoint');
  return payload;
}

function bearerToken(authHeader: string): string {
  if (!authHeader) throw new UnauthorizedException('Token necessário');
  return authHeader.replace('Bearer ', '').trim();
}

@Controller('frota-pub')
@Public()
export class FrotaPublicController {
  constructor(
    private readonly frotaAuth: FrotaAuthService,
    private readonly frotaService: FrotaService,
  ) {}

  // ================================================================
  // INFO PÚBLICA DO POSTO (para exibir na tela de login)
  // ================================================================

  @Get('posto/:slug/info')
  async infoPosto(@Param('slug') slug: string) {
    return this.frotaAuth.obterInfoPosto(slug);
  }

  @Get('vereador-link/:slug/info')
  async infoVereador(@Param('slug') slug: string) {
    try {
      return await this.frotaAuth.obterInfoVereador(slug);
    } catch {
      return await this.frotaAuth.obterInfoVereadorPortal(slug);
    }
  }

  @Get('vereador-portal/:slug/info')
  async infoVereadorPortal(@Param('slug') slug: string) {
    return this.frotaAuth.obterInfoVereadorPortal(slug);
  }

  @Post('auth-vereador/:slug')
  async loginVereador(@Param('slug') slug: string, @Body() body: any, @Req() req: Request) {
    return this.frotaAuth.loginPorSlugVereador(slug, body.senha, getIp(req), getUserAgent(req));
  }

  @Post('auth-vereador-portal/:slug')
  async loginVereadorPortal(@Param('slug') slug: string, @Body() body: any, @Req() req: Request) {
    return this.frotaAuth.loginVereadorPortal(
      slug,
      body.codigo_acesso || body.codigoAcesso,
      body.senha,
      getIp(req),
      getUserAgent(req),
    );
  }

  // ================================================================
  // AUTENTICAÇÃO
  // ================================================================

  /** Login genérico: orgaoId + codigoAcesso + senha */
  @Post('auth')
  async login(@Body() body: any, @Req() req: Request) {
    return this.frotaAuth.login(body.orgaoId, body.codigoAcesso, body.senha, getIp(req), getUserAgent(req));
  }

  /** Login do posto pelo slug da URL */
  @Post('auth-posto/:slug')
  async loginPosto(@Param('slug') slug: string, @Body() body: any, @Req() req: Request) {
    return this.frotaAuth.loginPorSlug(slug, body.senha, getIp(req), getUserAgent(req));
  }

  // ================================================================
  // QR CODE — VERIFICAÇÃO PÚBLICA (para quando o motorista mostra o QR)
  // ================================================================

  /** Retorna dados da requisição pelo token do QR (sem autenticação, apenas com o token) */
  @Get('req/:token')
  async verificarToken(@Param('token') token: string) {
    return this.frotaAuth.verificarTokenAcesso(token);
  }

  /** Confirmação de abastecimento via QR — requer token de posto válido */
  @Put('req/:token/confirmar')
  async confirmarViaToken(
    @Param('token') token: string,
    @Body() body: any,
    @Headers('authorization') auth: string,
    @Req() req: Request,
  ) {
    const payload = getPostoPayload(bearerToken(auth), this.frotaAuth);
    const requisicao = await this.frotaAuth.verificarTokenAcesso(token);
    if (payload.orgaoId !== requisicao.orgao_id) {
      throw new UnauthorizedException('Este posto não pode confirmar requisições de outro órgão');
    }
    const result = await this.frotaService.confirmarAbastecimento(
      requisicao.id,
      requisicao.orgao_id,
      { ...body, atendente_nome: body.atendente_nome || payload.nome },
    );
    await this.frotaAuth.log(payload.sub, requisicao.orgao_id, getIp(req), getUserAgent(req),
      AcaoFrotaLog.CONFIRMAR_ABASTECIMENTO, { codigo: requisicao.codigo, token }, true);
    return result;
  }

  // ================================================================
  // POSTO — verificação por código manual
  // ================================================================

  /** Rate limit mais restrito para mitigar brute-force em codigo_posto (6 chars) */
  @Throttle([{ limit: 15, ttl: 60000 }])
  @Get('posto/verificar/:codigo')
  async postoVerificarCodigo(
    @Param('codigo') codigo: string,
    @Headers('authorization') auth: string,
    @Req() req: Request,
  ) {
    const payload = getPostoPayload(bearerToken(auth), this.frotaAuth);
    const result = await this.frotaService.verificarCodigo(codigo, payload.orgaoId);
    if (result.status !== 'AUTORIZADO') throw new BadRequestException(`Autorização não disponível (status: ${result.status})`);
    await this.frotaAuth.log(payload.sub, payload.orgaoId, getIp(req), getUserAgent(req),
      AcaoFrotaLog.VERIFICAR_REQ, { codigo }, true);
    return result;
  }

  @Put('posto/confirmar/:id')
  async postoConfirmar(
    @Param('id') id: string,
    @Body() body: any,
    @Headers('authorization') auth: string,
    @Req() req: Request,
  ) {
    const payload = getPostoPayload(bearerToken(auth), this.frotaAuth);
    const result = await this.frotaService.confirmarAbastecimento(
      id, payload.orgaoId, { ...body, atendente_nome: body.atendente_nome || payload.nome },
    );
    await this.frotaAuth.log(payload.sub, payload.orgaoId, getIp(req), getUserAgent(req),
      AcaoFrotaLog.CONFIRMAR_ABASTECIMENTO, { id }, true);
    return result;
  }

  @Put('posto/senha')
  async postoAlterarSenha(@Body() body: any, @Headers('authorization') auth: string, @Req() req: Request) {
    const payload = getPostoPayload(bearerToken(auth), this.frotaAuth);
    return this.frotaAuth.alterarSenha(payload.sub, payload.orgaoId, body.senhaAtual, body.novaSenha, getIp(req), getUserAgent(req));
  }

  @Get('posto/dashboard')
  async postoDashboard(@Headers('authorization') auth: string, @Query('mes') mes?: string) {
    const payload = getPostoPayload(bearerToken(auth), this.frotaAuth);
    return this.frotaService.obterDashboardPosto(payload.orgaoId, mes);
  }

  @Get('posto/relatorio/siga')
  async postoRelatorioSiga(
    @Headers('authorization') auth: string,
    @Query('mes') mes: string,
    @Res() res: Response,
  ) {
    const payload = getPostoPayload(bearerToken(auth), this.frotaAuth);
    const orgaoId = payload.orgaoId;
    const mesAtual = mes || new Date().toISOString().slice(0, 7);
    const dados = await this.frotaService.gerarDadosRelatorioSiga(orgaoId, mesAtual);

    const [ano, m] = mesAtual.split('-');
    const nomeMes = new Date(`${mesAtual}-15`).toLocaleString('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' }).toUpperCase();

    const linhas: string[] = [];
    linhas.push('CONSUMO DE COMBUSTIVEL - FROTA SIGA');
    linhas.push(`CONSUMO MES ${nomeMes} - ${ano}`);
    linhas.push('');
    linhas.push('Modelo/Marca;Placa;Chassi;Renavam;Tipo;Litros;Valor cupom;Valor total dos produtos;Acrescimo Contratual;Total Acrescimo;Total a pagar');

    for (const l of dados.linhas) {
      const valorTotal = (l.litros * l.valor_cupom).toFixed(4).replace('.', ',');
      linhas.push([
        l.modelo, l.placa, l.chassi, l.renavam, l.tipo,
        l.litros.toFixed(3).replace('.', ','),
        l.valor_cupom.toFixed(4).replace('.', ','),
        valorTotal, 'R$ -', 'R$ -', valorTotal,
      ].join(';'));
    }

    linhas.push('');
    linhas.push(`Subtotal;;;;;;${dados.subtotal_litros.toFixed(3).replace('.', ',')};;R$ ${dados.subtotal_valor.toFixed(3).replace('.', ',')};;;R$ ${dados.subtotal_valor.toFixed(3).replace('.', ',')}`);
    linhas.push('');
    linhas.push(`TOTAL GERAL;;;;;;;;;;;;;R$ ${dados.total_geral.toFixed(2).replace('.', ',')}`);

    const csv = '\uFEFF' + linhas.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="SIGA_COMBUSTIVEL_${nomeMes}_${ano}.csv"`);
    res.send(csv);
  }

  // ================================================================
  // VEREADOR
  // ================================================================

  @Get('vereador/me')
  async vereadorMe(@Headers('authorization') auth: string) {
    const payload = getVereadorPayload(bearerToken(auth), this.frotaAuth);
    return this.frotaAuth.obterDadosVereador(payload.sub, payload.orgaoId);
  }

  @Post('vereador/requisicao')
  async vereadorCriarRequisicao(
    @Body() body: any,
    @Headers('authorization') auth: string,
    @Req() req: Request,
  ) {
    const payload = getVereadorPayload(bearerToken(auth), this.frotaAuth);
    const dados = {
      ...body,
      solicitante_nome: payload.nome,
      credencial_solicitante_id: payload.sub,
    };
    const result = await this.frotaService.criarRequisicao(payload.orgaoId, dados);
    await this.frotaAuth.log(payload.sub, payload.orgaoId, getIp(req), getUserAgent(req),
      AcaoFrotaLog.CRIAR_REQUISICAO, { codigo: result.codigo }, true);
    return result;
  }

  @Put('vereador/senha')
  async vereadorAlterarSenha(@Body() body: any, @Headers('authorization') auth: string, @Req() req: Request) {
    const payload = getVereadorPayload(bearerToken(auth), this.frotaAuth);
    return this.frotaAuth.alterarSenha(payload.sub, payload.orgaoId, body.senhaAtual, body.novaSenha, getIp(req), getUserAgent(req));
  }
}
