import { 
  Controller, 
  Get, 
  Post, 
  Put,
  Delete,
  Param, 
  Body, 
  Query,
  UseInterceptors,
  UploadedFile,
  HttpException,
  HttpStatus,
  Req,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PncpService } from './pncp.service';
import { TIPO_DOCUMENTO } from './dto/pncp.dto';
import { PncpFilaService } from './fila/pncp-fila.service';
import { AcessoLicitacaoService, ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { RequireModule } from '../auth/require-module.decorator';
import { AdminGuard } from '../auth/admin.guard';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { JwtPayload, UserType } from '../auth/auth.service';
import { AtorAtual } from '../auth/acesso/acesso.decorators';
import type { Ator } from '../auth/acesso/ator';
import { ehOrgao } from '../auth/acesso/ator';
import { atorTransicaoDe } from '../licitacoes/transicoes/transicoes.tipos';

@Controller('pncp')
@RequireModule(ModuloSistema.PNCP)
export class PncpController {
  constructor(
    private readonly pncpService: PncpService,
    private readonly fila: PncpFilaService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  private getOrgaoId(user: JwtPayload, orgaoIdParam?: string): string {
    if (user.type === UserType.ORGAO) return user.sub;
    if (user.type === UserType.ADMIN && orgaoIdParam) return orgaoIdParam;
    const orgaoId = user.orgaoId || (user as any).orgao_id;
    if (orgaoId) return orgaoId;
    throw new ForbiddenException('Não foi possível identificar o órgão do usuário');
  }

  // ============ CREDENCIAIS PNCP DA PLATAFORMA ============
  // Credencial única da plataforma inteira: só o admin mexe. O @RequireModule
  // do controller não servia de trava — libera qualquer órgão com o módulo PNCP.

  @Get('credentials')
  @UseGuards(AdminGuard)
  getPlatformCredentials() {
    return this.pncpService.getPlatformCredentials();
  }

  @Put('credentials')
  @UseGuards(AdminGuard)
  async setPlatformCredentials(@Body() body: {
    apiUrl?: string;
    login?: string;
    senha?: string;
    cnpjOrgao?: string;
  }) {
    await this.pncpService.setPlatformCredentials(body);
    return { success: true, message: 'Credenciais PNCP da plataforma atualizadas e salvas no banco!' };
  }

  @Post('credentials/test')
  @UseGuards(AdminGuard)
  async testPlatformConnection() {
    return this.pncpService.testPlatformConnection();
  }

  // ============ COMPRA/LICITAÇÃO ============
  // Desde a E7 todo envio passa pela FILA (pncp_sync): as rotas abaixo
  // enfileiram a operação e a processam na hora (se falhar, o registro fica na
  // fila com o erro do PNCP e o reenvio automático). Só o órgão dono.

  @Get('compras/:licitacaoId/validar')
  async validarLicitacao(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId, 'leitura');
    return this.pncpService.validarLicitacaoParaPNCP(licitacaoId);
  }

  @Post('compras/:licitacaoId')
  async enviarCompra(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId);
    return this.fila.enviarCompraAgora(licitacaoId, atorTransicaoDe(ator));
  }

  @Post('compras/:licitacaoId/itens')
  async enviarItens(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId);
    return this.fila.enviarItensAgora(licitacaoId);
  }

  @Post('compras/:licitacaoId/completo')
  async enviarCompraCompleta(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId);
    return this.fila.enviarCompraCompletaAgora(licitacaoId, atorTransicaoDe(ator));
  }

  /** Resultado por item da homologação (mesmas operações do disparo automático — sem duplicar). */
  @Post('compras/:licitacaoId/resultados-homologacao')
  async enviarResultadoHomologacao(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId);
    return this.fila.enviarResultadosAgora(licitacaoId);
  }

  /** Contratos ASSINADOS da licitação (art. 94 — eficácia); os não assinados aguardam. */
  @Post('compras/:licitacaoId/contratos')
  async enviarContratosHomologacao(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId);
    return this.fila.enviarContratosAgora(licitacaoId);
  }

  /** Contrato assinado (tela do contrato). */
  @Post('contratos/:contratoId/enviar')
  async enviarContrato(@Param('contratoId') contratoId: string, @AtorAtual() ator: Ator) {
    const [c] = ehUuid(contratoId) ? await this.pncpService.orgaoDoContrato(contratoId) : [];
    this.acesso.assertMesmoOrgao(ator, c?.orgao_id, 'escrita', 'Contrato');
    return this.fila.enviarContratoAgora(contratoId);
  }

  // Vincular manualmente uma licitação já enviada ao PNCP
  @Post('compras/:licitacaoId/vincular')
  async vincularLicitacaoPNCP(
    @Param('licitacaoId') licitacaoId: string,
    @Body() body: {
      numeroControlePNCP: string;
      anoCompra: number;
      sequencialCompra: number;
    },
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId);
    return this.pncpService.vincularLicitacaoExistente(
      licitacaoId,
      body.numeroControlePNCP,
      body.anoCompra,
      body.sequencialCompra,
      atorTransicaoDe(ator),
    );
  }

  // ============ DOCUMENTOS ============

  @Post('compras/:licitacaoId/documentos/:tipoDocumento')
  @UseInterceptors(FileInterceptor('arquivo'))
  async enviarDocumento(
    @Param('licitacaoId') licitacaoId: string,
    @Param('tipoDocumento') tipoDocumento: string,
    @UploadedFile() arquivo: Express.Multer.File,
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId);
    if (!arquivo) throw new HttpException('Arquivo não enviado', HttpStatus.BAD_REQUEST);
    return this.fila.enviarDocumentoAgora(licitacaoId, this.mapearTipoDocumento(tipoDocumento), arquivo.buffer, arquivo.originalname);
  }

  @Post('compras/:licitacaoId/edital')
  @UseInterceptors(FileInterceptor('arquivo'))
  async enviarEdital(@Param('licitacaoId') licitacaoId: string, @UploadedFile() arquivo: Express.Multer.File, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId);
    if (!arquivo) throw new HttpException('Arquivo do edital não enviado', HttpStatus.BAD_REQUEST);
    return this.fila.enviarDocumentoAgora(licitacaoId, TIPO_DOCUMENTO.EDITAL, arquivo.buffer, arquivo.originalname);
  }

  @Post('compras/:licitacaoId/termo-referencia')
  @UseInterceptors(FileInterceptor('arquivo'))
  async enviarTermoReferencia(@Param('licitacaoId') licitacaoId: string, @UploadedFile() arquivo: Express.Multer.File, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId);
    if (!arquivo) throw new HttpException('Arquivo do TR não enviado', HttpStatus.BAD_REQUEST);
    return this.fila.enviarDocumentoAgora(licitacaoId, TIPO_DOCUMENTO.TERMO_REFERENCIA, arquivo.buffer, arquivo.originalname);
  }

  // ============ FILA (E7) ============

  /** Operações da licitação no PNCP (status, tentativas, próximo envio, erro do PNCP). Órgão dono. */
  @Get('fila')
  async listarFila(@Query('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator) {
    if (!licitacaoId) throw new HttpException('Informe licitacaoId', HttpStatus.BAD_REQUEST);
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId, 'leitura');
    return this.fila.listarFila(licitacaoId);
  }

  /** "Reenviar agora" (inclusive erro definitivo, depois de corrigido o dado). Órgão dono. */
  @Post('fila/:id/reenviar')
  async reenviarDaFila(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.exigirDonoDaLinha(ator, id);
    return this.fila.reenviarAgora(id, atorTransicaoDe(ator));
  }

  // ============ CONSULTAS ============

  @Get('status/:licitacaoId')
  async consultarStatus(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId, 'leitura');
    return this.pncpService.consultarStatusSincronizacao(licitacaoId);
  }

  @Get('pendentes')
  async listarPendentes(
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    const orgaoId = request.user.type === UserType.ADMIN ? orgaoIdParam : this.getOrgaoId(request.user, orgaoIdParam);
    return this.pncpService.listarPendentes(orgaoId);
  }

  @Get('erros')
  async listarErros(
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    const orgaoId = request.user.type === UserType.ADMIN ? orgaoIdParam : this.getOrgaoId(request.user, orgaoIdParam);
    return this.pncpService.listarErros(orgaoId);
  }

  /** Compatibilidade com a tela PNCP: mesmo "reenviar agora" da fila. */
  @Post('reenviar/:syncId')
  async reenviar(@Param('syncId') syncId: string, @AtorAtual() ator: Ator) {
    await this.exigirDonoDaLinha(ator, syncId);
    return this.fila.reenviarAgora(syncId, atorTransicaoDe(ator));
  }

  private async exigirDonoDaLinha(ator: Ator, id: string) {
    const dono = ehUuid(id) ? await this.fila.orgaoDaLinha(id) : null;
    this.acesso.assertMesmoOrgao(ator, dono?.orgaoId, 'escrita', 'Registro do PNCP');
  }

  // ============ ESCOPO DAS ROTAS CRUAS (E9) ============
  // As rotas abaixo falam direto com a API do PNCP (ferramentas manuais da
  // tela Integração PNCP). O que o processo publica passa pela FILA (rotas
  // acima). Aqui o órgão só opera sob o PRÓPRIO CNPJ no PNCP (compras, itens,
  // resultados, atas, contratos) e só os PRÓPRIOS registros locais (PCA,
  // licitação do corpo); o CNPJ vindo do corpo só vale para o admin da
  // plataforma. Antes, qualquer órgão com o módulo PNCP operava o CNPJ padrão
  // ou o `cnpj_orgao` que mandasse no corpo.

  private async escopoPncp(ator: Ator | null, cnpjInformado?: string | null): Promise<{ cnpj?: string; orgaoId?: string }> {
    if (!ator) throw new UnauthorizedException('Autenticação necessária');
    const informado = String(cnpjInformado || '').replace(/\D/g, '');
    if (ator.admin) return { cnpj: informado || undefined };
    if (!ehOrgao(ator)) throw new ForbiddenException('Ação exclusiva do órgão');
    const cnpj = await this.pncpService.cnpjPncpDoOrgaoId(ator.orgaoId);
    if (informado && informado !== cnpj) {
      throw new ForbiddenException('Acesso negado: o CNPJ informado não é o do seu órgão no PNCP');
    }
    return { cnpj, orgaoId: ator.orgaoId };
  }

  /** Licitação informada no corpo (efeitos locais) precisa ser do órgão. */
  private async exigirLicitacaoDoCorpo(ator: Ator | null, licitacaoId?: string | null): Promise<void> {
    if (licitacaoId) await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId);
  }

  private async exigirDonoDoPca(ator: Ator | null, pcaId: string, modo: 'leitura' | 'escrita' = 'escrita'): Promise<void> {
    const orgaoId = ehUuid(pcaId) ? await this.pncpService.orgaoDoPca(pcaId) : null;
    this.acesso.assertMesmoOrgao(ator, orgaoId, modo, 'PCA');
  }

  // ============ PCA - INCLUSÃO / RETIFICAÇÃO / EXCLUSÃO ============

  @Post('pca/:pcaId')
  async enviarPCA(@Param('pcaId') pcaId: string, @Body() pca: Record<string, any>, @AtorAtual() ator: Ator) {
    await this.exigirDonoDoPca(ator, pcaId);
    return this.pncpService.enviarPCA(pcaId, pca);
  }

  @Put('pca/:anoPca/:sequencialPca')
  async retificarPCA(
    @Param('anoPca') anoPca: string,
    @Param('sequencialPca') sequencialPca: string,
    @Body() pca: Record<string, any>,
    @AtorAtual() ator: Ator,
  ) {
    const { orgaoId } = await this.escopoPncp(ator);
    return this.pncpService.retificarPCA(anoPca, sequencialPca, pca, orgaoId);
  }

  @Delete('pca/:anoPca/:sequencialPca')
  async excluirPCA(
    @Param('anoPca') anoPca: string,
    @Param('sequencialPca') sequencialPca: string,
    @AtorAtual() ator: Ator,
    @Body() body?: { justificativa?: string },
  ) {
    const { orgaoId } = await this.escopoPncp(ator);
    return this.pncpService.excluirPCA(anoPca, sequencialPca, body?.justificativa, orgaoId);
  }

  @Post('pca/:pcaId/itens')
  async enviarItemPCA(@Param('pcaId') pcaId: string, @Body() item: Record<string, any>, @AtorAtual() ator: Ator) {
    await this.exigirDonoDoPca(ator, pcaId);
    const { cnpj } = await this.escopoPncp(ator);
    return this.pncpService.enviarItemPCA(pcaId, item, cnpj);
  }

  @Put('pca/:anoPca/:sequencialPca/itens/:numeroItem')
  async retificarItemPCA(
    @Param('anoPca') anoPca: string,
    @Param('sequencialPca') sequencialPca: string,
    @Param('numeroItem') numeroItem: string,
    @Body() item: Record<string, any>,
    @AtorAtual() ator: Ator,
  ) {
    const { orgaoId } = await this.escopoPncp(ator);
    return this.pncpService.retificarItemPCA(anoPca, sequencialPca, numeroItem, item, orgaoId);
  }

  @Delete('pca/:anoPca/:sequencialPca/itens/:numeroItem')
  async excluirItemPCA(
    @Param('anoPca') anoPca: string,
    @Param('sequencialPca') sequencialPca: string,
    @Param('numeroItem') numeroItem: string,
    @AtorAtual() ator: Ator,
  ) {
    const { orgaoId } = await this.escopoPncp(ator);
    return this.pncpService.excluirItemPCA(anoPca, sequencialPca, numeroItem, orgaoId);
  }

  @Get('pca/:pcaId/status')
  async consultarStatusPCA(@Param('pcaId') pcaId: string, @AtorAtual() ator: Ator) {
    await this.exigirDonoDoPca(ator, pcaId, 'leitura');
    return this.pncpService.consultarStatusPCA(pcaId);
  }

  @Get('pca/orgao/listar')
  async listarPCAsNoOrgao(@AtorAtual() ator: Ator) {
    const { cnpj } = await this.escopoPncp(ator);
    return this.pncpService.consultarPCAsNoOrgao(cnpj);
  }

  // ============ COMPRAS/EDITAIS - RETIFICAÇÃO / EXCLUSÃO ============
  // A inclusão da compra é pela fila (`POST compras/:licitacaoId` ou o ato
  // PUBLICAR) com o edital real — o `POST compras` cru (PDF em branco) foi
  // apagado na E9.

  @Put('compras/:anoCompra/:sequencialCompra')
  async retificarCompra(
    @Param('anoCompra') anoCompra: string,
    @Param('sequencialCompra') sequencialCompra: string,
    @Body() compra: Record<string, any>,
    @AtorAtual() ator: Ator,
  ) {
    await this.exigirLicitacaoDoCorpo(ator, compra?.licitacaoId);
    const { cnpj } = await this.escopoPncp(ator);
    return this.pncpService.retificarCompra(anoCompra, sequencialCompra, compra, cnpj);
  }

  @Delete('compras/:anoCompra/:sequencialCompra')
  async excluirCompra(
    @Param('anoCompra') anoCompra: string,
    @Param('sequencialCompra') sequencialCompra: string,
    @Body() body: { justificativa: string; licitacaoId?: string },
    @AtorAtual() ator: Ator,
  ) {
    await this.exigirLicitacaoDoCorpo(ator, body?.licitacaoId);
    const { cnpj } = await this.escopoPncp(ator);
    return this.pncpService.excluirCompra(anoCompra, sequencialCompra, body, atorTransicaoDe(ator), cnpj);
  }

  @Get('compras/:anoCompra/:sequencialCompra')
  async consultarCompra(
    @Param('anoCompra') anoCompra: string,
    @Param('sequencialCompra') sequencialCompra: string,
    @AtorAtual() ator: Ator,
  ) {
    const { cnpj } = await this.escopoPncp(ator);
    return this.pncpService.consultarCompra(anoCompra, sequencialCompra, cnpj);
  }

  // ============ ITENS DA COMPRA ============

  @Get('compras/:anoCompra/:sequencialCompra/itens/quantidade')
  async consultarQuantidadeItens(
    @Param('anoCompra') anoCompra: string,
    @Param('sequencialCompra') sequencialCompra: string,
    @AtorAtual() ator: Ator,
  ) {
    const { cnpj } = await this.escopoPncp(ator);
    return this.pncpService.consultarQuantidadeItens(anoCompra, sequencialCompra, cnpj);
  }

  @Post('compras/:anoCompra/:sequencialCompra/itens')
  async incluirItemCompra(
    @Param('anoCompra') anoCompra: string,
    @Param('sequencialCompra') sequencialCompra: string,
    @Body() item: Record<string, any>,
    @AtorAtual() ator: Ator,
  ) {
    await this.exigirLicitacaoDoCorpo(ator, item?.licitacaoId);
    const { cnpj } = await this.escopoPncp(ator);
    return this.pncpService.incluirItemCompra(anoCompra, sequencialCompra, item, cnpj);
  }

  @Put('compras/:anoCompra/:sequencialCompra/itens/:numeroItem')
  async retificarItemCompra(
    @Param('anoCompra') anoCompra: string,
    @Param('sequencialCompra') sequencialCompra: string,
    @Param('numeroItem') numeroItem: string,
    @Body() item: Record<string, any>,
    @AtorAtual() ator: Ator,
  ) {
    await this.exigirLicitacaoDoCorpo(ator, item?.licitacaoId);
    const { cnpj } = await this.escopoPncp(ator);
    return this.pncpService.retificarItemCompra(anoCompra, sequencialCompra, numeroItem, item, cnpj);
  }

  @Delete('compras/:anoCompra/:sequencialCompra/itens/:numeroItem')
  async excluirItemCompra(
    @Param('anoCompra') anoCompra: string,
    @Param('sequencialCompra') sequencialCompra: string,
    @Param('numeroItem') numeroItem: string,
    @AtorAtual() ator: Ator,
    @Body() body?: { justificativa?: string },
  ) {
    const { cnpj } = await this.escopoPncp(ator);
    return this.pncpService.excluirItemCompra(anoCompra, sequencialCompra, numeroItem, body?.justificativa, cnpj);
  }

  // ============ RESULTADO DE ITENS DA COMPRA ============

  @Post('compras/:anoCompra/:sequencialCompra/itens/:numeroItem/resultado')
  async incluirResultadoItem(
    @Param('anoCompra') anoCompra: string,
    @Param('sequencialCompra') sequencialCompra: string,
    @Param('numeroItem') numeroItem: string,
    @Body() resultado: Record<string, any>,
    @AtorAtual() ator: Ator,
  ) {
    const { cnpj } = await this.escopoPncp(ator);
    return this.pncpService.incluirResultadoItem(anoCompra, sequencialCompra, numeroItem, resultado, cnpj);
  }

  @Put('compras/:anoCompra/:sequencialCompra/itens/:numeroItem/resultado')
  async retificarResultadoItem(
    @Param('anoCompra') anoCompra: string,
    @Param('sequencialCompra') sequencialCompra: string,
    @Param('numeroItem') numeroItem: string,
    @Body() resultado: Record<string, any>,
    @AtorAtual() ator: Ator,
  ) {
    const { cnpj } = await this.escopoPncp(ator);
    return this.pncpService.retificarResultadoItem(anoCompra, sequencialCompra, numeroItem, resultado, cnpj);
  }

  // ============ ATA DE REGISTRO DE PREÇO ============

  @Post('compras/:anoCompra/:sequencialCompra/atas')
  async incluirAtaRegistroPreco(
    @Param('anoCompra') anoCompra: string,
    @Param('sequencialCompra') sequencialCompra: string,
    @Body() ata: Record<string, any>,
    @AtorAtual() ator: Ator,
  ) {
    const { cnpj } = await this.escopoPncp(ator, ata?.cnpj_orgao);
    return this.pncpService.incluirAtaRegistroPreco(anoCompra, sequencialCompra, { ...ata, cnpj_orgao: cnpj });
  }

  @Put('compras/:anoCompra/:sequencialCompra/atas/:sequencialAta')
  async retificarAtaRegistroPreco(
    @Param('anoCompra') anoCompra: string,
    @Param('sequencialCompra') sequencialCompra: string,
    @Param('sequencialAta') sequencialAta: string,
    @Body() ata: Record<string, any>,
    @AtorAtual() ator: Ator,
  ) {
    const { cnpj } = await this.escopoPncp(ator, ata?.cnpj_orgao);
    return this.pncpService.retificarAtaRegistroPreco(anoCompra, sequencialCompra, sequencialAta, { ...ata, cnpj_orgao: cnpj });
  }

  @Delete('compras/:anoCompra/:sequencialCompra/atas/:sequencialAta')
  async excluirAtaRegistroPreco(
    @Param('anoCompra') anoCompra: string,
    @Param('sequencialCompra') sequencialCompra: string,
    @Param('sequencialAta') sequencialAta: string,
    @Body() body: { justificativa: string; cnpj_orgao?: string },
    @AtorAtual() ator: Ator,
  ) {
    const { cnpj } = await this.escopoPncp(ator, body?.cnpj_orgao);
    return this.pncpService.excluirAtaRegistroPreco(anoCompra, sequencialCompra, sequencialAta, body?.justificativa, cnpj);
  }

  // ============ CONTRATOS - INCLUSÃO / RETIFICAÇÃO / EXCLUSÃO ============
  // O contrato do processo vai pela fila (`POST contratos/:contratoId/enviar`,
  // só depois de assinado). A inclusão crua fica para contratos de fora do
  // sistema, sob o CNPJ do próprio órgão.

  @Post('contratos')
  async incluirContrato(@Body() contrato: Record<string, any>, @AtorAtual() ator: Ator) {
    const { cnpj } = await this.escopoPncp(ator, contrato?.cnpj_orgao);
    return this.pncpService.incluirContrato({ ...contrato, cnpj_orgao: cnpj });
  }

  @Put('contratos/:anoContrato/:sequencialContrato')
  async retificarContrato(
    @Param('anoContrato') anoContrato: string,
    @Param('sequencialContrato') sequencialContrato: string,
    @Body() contrato: Record<string, any>,
    @AtorAtual() ator: Ator,
  ) {
    const { cnpj } = await this.escopoPncp(ator, contrato?.cnpj_orgao);
    return this.pncpService.retificarContrato(anoContrato, sequencialContrato, { ...contrato, cnpj_orgao: cnpj });
  }

  @Delete('contratos/:anoContrato/:sequencialContrato')
  async excluirContrato(
    @Param('anoContrato') anoContrato: string,
    @Param('sequencialContrato') sequencialContrato: string,
    @Body() body: { justificativa: string; cnpj_orgao?: string },
    @AtorAtual() ator: Ator,
  ) {
    const { cnpj } = await this.escopoPncp(ator, body?.cnpj_orgao);
    return this.pncpService.excluirContrato(anoContrato, sequencialContrato, body?.justificativa, cnpj);
  }

  @Get('contratos/:anoContrato/:sequencialContrato')
  async consultarContrato(
    @Param('anoContrato') anoContrato: string,
    @Param('sequencialContrato') sequencialContrato: string,
    @AtorAtual() ator: Ator,
  ) {
    const { cnpj } = await this.escopoPncp(ator);
    return this.pncpService.consultarContrato(anoContrato, sequencialContrato, cnpj);
  }

  // ============ ÓRGÃOS E UNIDADES ============
  // Consultas ao cadastro do PNCP (dados públicos) ficam para o órgão; o que
  // ALTERA o cadastro do PNCP ou a credencial da plataforma é do admin.

  @Get('orgaos/:cnpj')
  async consultarOrgao(@Param('cnpj') cnpj: string) {
    return this.pncpService.consultarOrgao(cnpj);
  }

  @Post('orgaos')
  @UseGuards(AdminGuard)
  async cadastrarOrgao(@Body() orgao: Record<string, any>) {
    return this.pncpService.cadastrarOrgao(orgao);
  }

  @Get('orgaos/:cnpj/unidades')
  async listarUnidades(@Param('cnpj') cnpj: string) {
    return this.pncpService.listarUnidades(cnpj);
  }

  @Post('orgaos/:cnpj/unidades')
  @UseGuards(AdminGuard)
  async cadastrarUnidade(@Param('cnpj') cnpj: string, @Body() unidade: Record<string, any>) {
    return this.pncpService.cadastrarUnidade(cnpj, unidade);
  }

  // ============ USUÁRIO E ENTES AUTORIZADOS (credencial da plataforma) ============

  @Get('usuario')
  @UseGuards(AdminGuard)
  async consultarUsuario(@Req() request: unknown) {
    return this.pncpService.consultarUsuario(request);
  }

  @Put('usuario/entes-autorizados')
  @UseGuards(AdminGuard)
  async atualizarEntesAutorizados(@Body() body: { cnpjs: string[] }) {
    return this.pncpService.atualizarEntesAutorizados(body.cnpjs);
  }

  @Post('usuario/vincular-ente/:cnpj')
  @UseGuards(AdminGuard)
  async vincularEnte(@Param('cnpj') cnpj: string) {
    return this.pncpService.vincularEnte(cnpj);
  }

  /** Associa um ente do PNCP a um órgão local — define o CNPJ do escopo acima. */
  @Post('usuario/associar-orgao-local')
  @UseGuards(AdminGuard)
  async associarOrgaoLocal(
    @Body() body: {
      cnpjEnte: string;
      orgaoId: string;
      codigoUnidade: string;
      reassociar?: boolean;
    },
  ) {
    return this.pncpService.associarEnteAoOrgaoLocal(body);
  }

  // ============ CONFIGURAÇÃO ============

  @Get('config/status')
  async verificarConfiguracao() {
    return this.pncpService.verificarConfiguracao();
  }

  @Post('config/testar-conexao')
  async testarConexao(@Req() request: unknown) {
    return this.pncpService.testarConexao(request);
  }

  @Post('config-update')
  @UseGuards(AdminGuard)
  async atualizarConfiguracao(@Body() config: Parameters<PncpService['atualizarConfiguracao']>[0]) {
    // Não logar o corpo: aqui trafega a senha da plataforma no PNCP.
    return this.pncpService.atualizarConfiguracao(config);
  }

  // ============ IMPORTAÇÃO DE PCAs DO PNCP ============
  // Leitura dos PCAs publicados (dado público) de qualquer CNPJ; a IMPORTAÇÃO
  // grava no órgão do token (o `orgaoId` do corpo só vale para o admin).

  @Get('importar/pcas/:cnpj')
  async consultarPCAsNoPncp(
    @Param('cnpj') cnpj: string,
    @Query('ano') ano?: string
  ) {
    return this.pncpService.consultarPCAsNoPncp(cnpj, ano ? parseInt(ano) : undefined);
  }

  @Get('importar/pca/:cnpj/:ano/:sequencial')
  async consultarPCADetalhado(
    @Param('cnpj') cnpj: string,
    @Param('ano') ano: string,
    @Param('sequencial') sequencial: string
  ) {
    return this.pncpService.consultarPCADetalhado(cnpj, parseInt(ano), parseInt(sequencial));
  }

  /**
   * Órgão e CNPJ da importação: do TOKEN (a tela não manda mais nenhum dos
   * dois). `orgaoId`/`cnpj` do corpo só valem para o admin da plataforma; de
   * outro órgão/CNPJ → 403.
   */
  private async escopoImportacao(ator: Ator, body: { orgaoId?: string; cnpj?: string } | undefined) {
    if (body?.orgaoId) this.acesso.assertProprioOrgao(ator, body.orgaoId);
    const orgaoId = ator?.admin ? body?.orgaoId : ator?.orgaoId ?? undefined;
    if (!orgaoId) throw new BadRequestException('orgaoId é obrigatório para o administrador da plataforma');
    const { cnpj } = await this.escopoPncp(ator, body?.cnpj);
    if (!cnpj) throw new BadRequestException('cnpj é obrigatório para o administrador da plataforma');
    return { orgaoId, cnpj };
  }

  @Post('importar/pca')
  async importarPCADoPncp(
    @Body() body: { orgaoId?: string; cnpj?: string; ano: number; sequencial: number },
    @AtorAtual() ator: Ator,
  ) {
    const { orgaoId, cnpj } = await this.escopoImportacao(ator, body);
    return this.pncpService.importarPCADoPncp(orgaoId, cnpj, body.ano, body.sequencial);
  }

  @Post('importar/pcas/todos')
  async sincronizarTodosPCAsDoPncp(
    @Body() body: { orgaoId?: string; cnpj?: string },
    @AtorAtual() ator: Ator,
  ) {
    const { orgaoId, cnpj } = await this.escopoImportacao(ator, body);
    return this.pncpService.sincronizarTodosPCAsDoPncp(orgaoId, cnpj);
  }

  // ============ UNIDADES DO ÓRGÃO ============

  @Get('orgao/:cnpj/unidades')
  async consultarUnidadesOrgao(@Param('cnpj') cnpj: string) {
    return this.pncpService.consultarUnidadesOrgao(cnpj);
  }

  // ============ HELPERS ============

  private mapearTipoDocumento(tipo: string): number {
    const mapa: Record<string, number> = {
      'edital': TIPO_DOCUMENTO.EDITAL,
      'termo-referencia': TIPO_DOCUMENTO.TERMO_REFERENCIA,
      'tr': TIPO_DOCUMENTO.TERMO_REFERENCIA,
      'etp': TIPO_DOCUMENTO.ETP,
      'minuta-contrato': TIPO_DOCUMENTO.MINUTA_CONTRATO,
      'ata': TIPO_DOCUMENTO.ATA_REGISTRO_PRECO,
      'outros': TIPO_DOCUMENTO.OUTROS
    };

    return mapa[tipo.toLowerCase()] || TIPO_DOCUMENTO.OUTROS;
  }
}
