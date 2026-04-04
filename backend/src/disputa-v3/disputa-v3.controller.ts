import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { JwtPayload, UserType } from '../auth/auth.service';
import { DisputaV3Service } from './disputa-v3.service';

@Controller('disputa-v3')
@RequireModule(ModuloSistema.DISPUTA)
export class DisputaV3Controller {
  constructor(private readonly disputaV3Service: DisputaV3Service) {}

  @Get('sessao/:sessaoId/contexto')
  async getContextoSessao(@Param('sessaoId') sessaoId: string) {
    return this.disputaV3Service.getContextoSessao(sessaoId);
  }

  @Get('sessao/licitacao/:licitacaoId/contexto')
  async getContextoPorLicitacao(@Param('licitacaoId') licitacaoId: string) {
    return this.disputaV3Service.getContextoPorLicitacao(licitacaoId);
  }

  @Get('sessao/:sessaoId/board')
  async getBoard(
    @Req() req: { user: JwtPayload },
    @Param('sessaoId') sessaoId: string,
    @Query('fornecedorId') fornecedorId?: string,
  ) {
    // Fornecedor sempre recebe a visao restrita do proprio usuario
    if (req.user.type === UserType.FORNECEDOR) {
      return this.disputaV3Service.getBoardFornecedor(sessaoId, req.user.sub);
    }

    if (fornecedorId) {
      return this.disputaV3Service.getBoardFornecedor(sessaoId, fornecedorId);
    }

    return this.disputaV3Service.getBoardPregoeiro(sessaoId);
  }

  /** Últimos lances do fornecedor no item + flags para cancelamento (15s / solicitação). */
  @Get('sessao/:sessaoId/item/:itemId/lances-meus')
  async getLancesMeus(
    @Req() req: { user: JwtPayload },
    @Param('sessaoId') sessaoId: string,
    @Param('itemId') itemId: string,
    @Query('fornecedorId') fornecedorId?: string,
  ) {
    if (req.user.type !== UserType.FORNECEDOR) {
      throw new ForbiddenException('Apenas fornecedores podem consultar seus lances');
    }
    const fid = fornecedorId || req.user.sub;
    if (fid !== req.user.sub) {
      throw new ForbiddenException('fornecedorId não confere com o usuário autenticado');
    }
    return this.disputaV3Service.listarLancesMeusParaCancelamento(
      sessaoId,
      itemId,
      fid,
    );
  }

  @Post('sessao/:sessaoId/item/:itemId/lance/:lanceId/cancelar-fornecedor')
  async cancelarFornecedor(
    @Req() req: { user: JwtPayload },
    @Param('sessaoId') sessaoId: string,
    @Param('itemId') itemId: string,
    @Param('lanceId') lanceId: string,
  ) {
    if (req.user.type !== UserType.FORNECEDOR) {
      throw new ForbiddenException('Apenas fornecedores podem cancelar o próprio lance');
    }
    return this.disputaV3Service.cancelarLanceFornecedorImediato(
      sessaoId,
      itemId,
      lanceId,
      req.user.sub,
    );
  }

  @Post('sessao/:sessaoId/item/:itemId/lance/:lanceId/solicitar-cancelamento')
  async solicitarCancelamento(
    @Req() req: { user: JwtPayload },
    @Param('sessaoId') sessaoId: string,
    @Param('itemId') itemId: string,
    @Param('lanceId') lanceId: string,
    @Body() body: { motivo?: string },
  ) {
    if (req.user.type !== UserType.FORNECEDOR) {
      throw new ForbiddenException('Apenas fornecedores podem solicitar cancelamento');
    }
    return this.disputaV3Service.solicitarCancelamentoLance(
      sessaoId,
      itemId,
      lanceId,
      req.user.sub,
      body?.motivo,
    );
  }

  @Post('sessao/:sessaoId/item/:itemId/lance/:lanceId/pregoeiro-cancelar')
  async pregoeiroCancelar(
    @Req() req: { user: JwtPayload },
    @Param('sessaoId') sessaoId: string,
    @Param('itemId') itemId: string,
    @Param('lanceId') lanceId: string,
    @Body() body: { justificativa: string },
  ) {
    const orgaoId = this.getOrgaoIdDoUsuario(req.user);
    if (!body?.justificativa?.trim()) {
      throw new BadRequestException('justificativa é obrigatória');
    }
    return this.disputaV3Service.pregoeiroCancelarLance(
      sessaoId,
      itemId,
      lanceId,
      orgaoId,
      body.justificativa,
    );
  }

  private getOrgaoIdDoUsuario(user: JwtPayload): string {
    if (user.type === UserType.ORGAO) {
      return user.sub;
    }
    if (user.type === UserType.USUARIO && user.orgaoId) {
      return user.orgaoId;
    }
    throw new ForbiddenException(
      'Apenas usuários do órgão podem cancelar lances como pregoeiro',
    );
  }
}
