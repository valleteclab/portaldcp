import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { AcessoLicitacaoService } from '../auth/acesso/acesso-licitacao.service';
import {
  AtorAtual,
  OrgaoOuFornecedor,
  SomenteFornecedor,
  SomenteOrgao,
} from '../auth/acesso/acesso.decorators';
import { ehFornecedor } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';
import { SigiloDisputaService } from '../disputa-v2/sigilo-disputa.service';
import { DisputaV3Service } from './disputa-v3.service';

/**
 * Sala de disputa V3 (presenter sobre a disputa-v2).
 *
 * AUTORIZAÇÃO (E1a):
 *  - contexto: órgão dono, fornecedor participante ou admin (outros → 404);
 *  - board: fornecedor recebe SEMPRE a visão do próprio token (um
 *    `?fornecedorId=` de outro → 403); órgão só da própria sessão (403) e
 *    sempre a visão do pregoeiro — ninguém vê "como" outro fornecedor;
 *  - lances-meus / cancelar / solicitar: fornecedor do token com proposta;
 *  - pregoeiro-cancelar: órgão dono da sessão.
 */
@Controller('disputa-v3')
@RequireModule(ModuloSistema.DISPUTA)
export class DisputaV3Controller {
  constructor(
    private readonly disputaV3Service: DisputaV3Service,
    private readonly acesso: AcessoLicitacaoService,
    private readonly sigilo: SigiloDisputaService,
  ) {}

  /** Licitação da sessão, exigindo relação do ator com ela (404 caso contrário). */
  private async exigirRelacao(ator: Ator, sessaoId: string): Promise<string> {
    const dono = await this.acesso.donoDaSessao(sessaoId);
    const relacao = dono ? await this.acesso.relacaoComLicitacao(ator, dono.licitacaoId) : null;
    if (!dono || !relacao) throw new NotFoundException('Sessao nao encontrada');
    return dono.licitacaoId;
  }

  @OrgaoOuFornecedor()
  @Get('sessao/:sessaoId/contexto')
  async getContextoSessao(@Param('sessaoId') sessaoId: string, @AtorAtual() ator: Ator) {
    await this.exigirRelacao(ator, sessaoId);
    return this.disputaV3Service.getContextoSessao(sessaoId);
  }

  @OrgaoOuFornecedor()
  @Get('sessao/licitacao/:licitacaoId/contexto')
  async getContextoPorLicitacao(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator) {
    if (!(await this.acesso.relacaoComLicitacao(ator, licitacaoId))) {
      throw new NotFoundException('Sessao nao encontrada para esta licitacao');
    }
    return this.disputaV3Service.getContextoPorLicitacao(licitacaoId);
  }

  @OrgaoOuFornecedor()
  @Get('sessao/:sessaoId/board')
  async getBoard(
    @AtorAtual() ator: Ator,
    @Param('sessaoId') sessaoId: string,
    @Query('fornecedorId') fornecedorId?: string,
  ) {
    // Fornecedor: sempre a visão restrita do próprio usuário (token)
    if (ehFornecedor(ator)) {
      const fid = this.acesso.fornecedorDoToken(ator, fornecedorId);
      const dono = await this.acesso.donoDaSessao(sessaoId);
      if (!dono) throw new NotFoundException('Sessao nao encontrada');
      await this.acesso.assertFornecedorParticipa(ator, dono.licitacaoId);
      const board = await this.disputaV3Service.getBoardFornecedor(sessaoId, fid);
      return this.sigilo.aplicarVisao(board, dono.licitacaoId, { tipo: 'FORNECEDOR', fornecedorId: fid }, { sessaoId });
    }

    // Órgão: só o dono da sessão (outro órgão → 403), sempre a visão do pregoeiro.
    // `?fornecedorId=` não troca a visão (ninguém olha "como" outro fornecedor).
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId, 'escrita');
    return this.disputaV3Service.getBoardPregoeiro(sessaoId);
  }

  /** Últimos lances do fornecedor no item + flags para cancelamento (15s / solicitação). */
  @SomenteFornecedor()
  @Get('sessao/:sessaoId/item/:itemId/lances-meus')
  async getLancesMeus(
    @AtorAtual() ator: Ator,
    @Param('sessaoId') sessaoId: string,
    @Param('itemId') itemId: string,
    @Query('fornecedorId') fornecedorId?: string,
  ) {
    const fid = this.acesso.fornecedorDoToken(ator, fornecedorId);
    await this.assertParticipaDaSessao(ator, sessaoId);
    return this.disputaV3Service.listarLancesMeusParaCancelamento(sessaoId, itemId, fid);
  }

  @SomenteFornecedor()
  @Post('sessao/:sessaoId/item/:itemId/lance/:lanceId/cancelar-fornecedor')
  async cancelarFornecedor(
    @AtorAtual() ator: Ator,
    @Param('sessaoId') sessaoId: string,
    @Param('itemId') itemId: string,
    @Param('lanceId') lanceId: string,
  ) {
    const fid = this.acesso.fornecedorDoToken(ator);
    await this.assertParticipaDaSessao(ator, sessaoId);
    return this.disputaV3Service.cancelarLanceFornecedorImediato(sessaoId, itemId, lanceId, fid);
  }

  @SomenteFornecedor()
  @Post('sessao/:sessaoId/item/:itemId/lance/:lanceId/solicitar-cancelamento')
  async solicitarCancelamento(
    @AtorAtual() ator: Ator,
    @Param('sessaoId') sessaoId: string,
    @Param('itemId') itemId: string,
    @Param('lanceId') lanceId: string,
    @Body() body: { motivo?: string },
  ) {
    const fid = this.acesso.fornecedorDoToken(ator);
    await this.assertParticipaDaSessao(ator, sessaoId);
    return this.disputaV3Service.solicitarCancelamentoLance(sessaoId, itemId, lanceId, fid, body?.motivo);
  }

  @SomenteOrgao()
  @Post('sessao/:sessaoId/item/:itemId/lance/:lanceId/pregoeiro-cancelar')
  async pregoeiroCancelar(
    @AtorAtual() ator: Ator,
    @Param('sessaoId') sessaoId: string,
    @Param('itemId') itemId: string,
    @Param('lanceId') lanceId: string,
    @Body() body: { justificativa: string },
  ) {
    const dono = await this.acesso.assertOrgaoDaSessao(ator, sessaoId);
    if (!body?.justificativa?.trim()) {
      throw new BadRequestException('justificativa é obrigatória');
    }
    return this.disputaV3Service.pregoeiroCancelarLance(
      sessaoId,
      itemId,
      lanceId,
      dono.orgaoId,
      body.justificativa,
    );
  }

  private async assertParticipaDaSessao(ator: Ator, sessaoId: string): Promise<void> {
    const dono = await this.acesso.donoDaSessao(sessaoId);
    if (!dono) throw new NotFoundException('Sessao nao encontrada');
    await this.acesso.assertFornecedorParticipa(ator, dono.licitacaoId);
  }
}
