import { Controller, Get, Param, Query } from '@nestjs/common';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
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
    @Param('sessaoId') sessaoId: string,
    @Query('fornecedorId') fornecedorId?: string,
  ) {
    if (fornecedorId) {
      return this.disputaV3Service.getBoardFornecedor(sessaoId, fornecedorId);
    }

    return this.disputaV3Service.getBoardPregoeiro(sessaoId);
  }
}
