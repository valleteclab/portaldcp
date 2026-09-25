import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth.module';
import { AcessoLicitacaoService } from './acesso-licitacao.service';
import { PapelGuard } from './acesso.decorators';
import { WsAutenticador } from './ws-autenticador';
import { ContratoOrgaoGuard } from './contrato-orgao.guard';

/**
 * Camada de autorização (E1a). Global: qualquer módulo injeta
 * AcessoLicitacaoService / WsAutenticador sem importar nada.
 */
@Global()
@Module({
  imports: [AuthModule],
  providers: [AcessoLicitacaoService, WsAutenticador, PapelGuard, ContratoOrgaoGuard],
  exports: [AcessoLicitacaoService, WsAutenticador, PapelGuard, ContratoOrgaoGuard],
})
export class AcessoModule {}
