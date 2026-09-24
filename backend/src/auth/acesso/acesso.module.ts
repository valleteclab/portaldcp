import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth.module';
import { AcessoLicitacaoService } from './acesso-licitacao.service';
import { PapelGuard } from './acesso.decorators';
import { WsAutenticador } from './ws-autenticador';

/**
 * Camada de autorização (E1a). Global: qualquer módulo injeta
 * AcessoLicitacaoService / WsAutenticador sem importar nada.
 */
@Global()
@Module({
  imports: [AuthModule],
  providers: [AcessoLicitacaoService, WsAutenticador, PapelGuard],
  exports: [AcessoLicitacaoService, WsAutenticador, PapelGuard],
})
export class AcessoModule {}
