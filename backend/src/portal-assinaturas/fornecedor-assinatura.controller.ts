import { Controller, Get, Headers, Ip, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AtorAtual, SomenteFornecedor } from '../auth/acesso';
import type { Ator } from '../auth/acesso';
import { PortalAssinaturasService } from './portal-assinaturas.service';

/**
 * O fornecedor assina o termo do PRÓPRIO contrato pelo portal (homologação
 * 08/11/2026: o link ia só por e-mail). A sessão do fornecedor é a identidade
 * — sem código; contrato de outro fornecedor → 404.
 */
@Controller('fornecedor/contratos')
@SomenteFornecedor()
export class FornecedorAssinaturaController {
  constructor(private readonly portal: PortalAssinaturasService) {}

  @Get(':contratoId/assinatura')
  situacao(@Param('contratoId', ParseUUIDPipe) contratoId: string, @AtorAtual() ator: Ator) {
    return this.portal.assinaturaDoFornecedor(contratoId, String(ator.fornecedorId));
  }

  @Post(':contratoId/assinar')
  assinar(
    @Param('contratoId', ParseUUIDPipe) contratoId: string,
    @AtorAtual() ator: Ator,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.portal.assinarContratoComoFornecedor(contratoId, String(ator.fornecedorId), ip, userAgent || '');
  }
}
