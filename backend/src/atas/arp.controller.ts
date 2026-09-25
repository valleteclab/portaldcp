import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ArpService, ItemPedido } from './arp.service';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { AtorAtual, SomenteFornecedor, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import type { Ator } from '../auth/acesso/ator';

/**
 * ============================================================================
 * ARP — rotas do ciclo da ata (plano E6, parte ARP) em /api/atas
 * ============================================================================
 * Órgão GERENCIADOR (dono da ata; outro órgão → 404 na leitura, 403 no ato):
 *  - GET  :id/painel             itens e saldo, consumos, adesões, reserva, assinatura, vigência
 *  - POST :id/assinaturas        gera o termo e solicita as assinaturas (órgão + fornecedor)
 *  - POST :id/contratar          contrato/ordem a partir da ata (consome o saldo)
 *  - POST :id/prorrogar          prorrogação única (art. 84)
 *  - POST :id/cancelar-registro  cancelamento do registro + convocação da reserva
 *  - GET  adesoes/recebidas      adesões pedidas às atas do órgão
 *  - POST adesoes/:id/anuencia   anuência/recusa do gerenciador
 *  - POST adesoes/:id/autorizar  autorização final (limites conferidos)
 * Órgão NÃO participante (aderente — vê a sua adesão + dados públicos da ata):
 *  - POST :id/adesoes            pedido de adesão (justificativa de vantagem, itens)
 *  - GET  adesoes/minhas         suas adesões
 *  - POST adesoes/:id/cancelar   desistência (antes da autorização)
 *  - POST :id/contratar          com `adesao_id` AUTORIZADA — consome o autorizado
 * FORNECEDOR (só as próprias atas/convocações; id do token):
 *  - GET  fornecedor/ata/:id     painel da própria ata (+ link de assinatura)
 *  - POST adesoes/:id/fornecedor aceite/recusa da adesão
 *  - GET  fornecedor/reservas    convocações do cadastro de reserva
 *  - POST :id/reserva            declara (ou recusa) cotar ao preço do vencedor
 * Qualquer parte da adesão: GET adesoes/:id.
 */
@Controller('atas')
@RequireModule(ModuloSistema.ATAS)
export class ArpController {
  constructor(private readonly arp: ArpService) {}

  // ---------------- órgão gerenciador ----------------

  @Get(':id/painel')
  @SomenteOrgao()
  painel(@Param('id') id: string, @AtorAtual() ator: Ator) {
    return this.arp.painel(id, ator);
  }

  @Post(':id/assinaturas')
  @HttpCode(200)
  @SomenteOrgao()
  assinaturas(@Param('id') id: string, @AtorAtual() ator: Ator) {
    return this.arp.solicitarAssinaturas(id, ator);
  }

  @Post(':id/contratar')
  @SomenteOrgao()
  contratar(
    @Param('id') id: string,
    @AtorAtual() ator: Ator,
    @Body() body: { tipo?: 'CONTRATO' | 'ORDEM'; itens: ItemPedido[]; adesao_id?: string; prazo_execucao_dias?: number; objeto?: string },
  ) {
    return this.arp.contratarAPartirDaAta(id, ator, body || ({} as any));
  }

  @Post(':id/prorrogar')
  @HttpCode(200)
  @SomenteOrgao()
  prorrogar(@Param('id') id: string, @AtorAtual() ator: Ator, @Body() body: { meses: number; motivo: string }) {
    return this.arp.prorrogar(id, ator, body || ({} as any));
  }

  @Post(':id/cancelar-registro')
  @HttpCode(200)
  @SomenteOrgao()
  cancelarRegistro(@Param('id') id: string, @AtorAtual() ator: Ator, @Body() body: { hipotese: string; motivo: string }) {
    return this.arp.cancelarRegistro(id, ator, body || ({} as any));
  }

  @Get('adesoes/recebidas')
  @SomenteOrgao()
  adesoesRecebidas(@AtorAtual() ator: Ator) {
    return this.arp.adesoesRecebidas(ator);
  }

  @Post('adesoes/:adesaoId/anuencia')
  @HttpCode(200)
  @SomenteOrgao()
  anuencia(@Param('adesaoId') adesaoId: string, @AtorAtual() ator: Ator, @Body() body: { aceitar: boolean; motivo?: string }) {
    return this.arp.anuirAdesao(adesaoId, ator, body || ({} as any));
  }

  @Post('adesoes/:adesaoId/autorizar')
  @HttpCode(200)
  @SomenteOrgao()
  autorizar(@Param('adesaoId') adesaoId: string, @AtorAtual() ator: Ator) {
    return this.arp.autorizarAdesao(adesaoId, ator);
  }

  // ---------------- órgão aderente ----------------

  @Post(':id/adesoes')
  @SomenteOrgao()
  solicitarAdesao(@Param('id') id: string, @AtorAtual() ator: Ator, @Body() body: { justificativa_vantagem: string; itens: ItemPedido[] }) {
    return this.arp.solicitarAdesao(id, ator, body || ({} as any));
  }

  @Get('adesoes/minhas')
  @SomenteOrgao()
  minhasAdesoes(@AtorAtual() ator: Ator) {
    return this.arp.minhasAdesoes(ator);
  }

  @Post('adesoes/:adesaoId/cancelar')
  @HttpCode(200)
  @SomenteOrgao()
  cancelarAdesao(@Param('adesaoId') adesaoId: string, @AtorAtual() ator: Ator, @Body() body: { motivo?: string }) {
    return this.arp.cancelarAdesao(adesaoId, ator, body || {});
  }

  // ---------------- fornecedor ----------------

  @Get('fornecedor/reservas')
  @SomenteFornecedor()
  reservas(@AtorAtual() ator: Ator) {
    return this.arp.reservasDoFornecedor(ator);
  }

  @Get('fornecedor/ata/:id')
  @SomenteFornecedor()
  painelFornecedor(@Param('id') id: string, @AtorAtual() ator: Ator) {
    return this.arp.painelFornecedor(id, ator);
  }

  @Post('adesoes/:adesaoId/fornecedor')
  @HttpCode(200)
  @SomenteFornecedor()
  aceiteFornecedor(@Param('adesaoId') adesaoId: string, @AtorAtual() ator: Ator, @Body() body: { aceitar: boolean; motivo?: string }) {
    return this.arp.responderAdesaoFornecedor(adesaoId, ator, body || ({} as any));
  }

  @Post(':id/reserva')
  @HttpCode(200)
  @SomenteFornecedor()
  reserva(@Param('id') id: string, @AtorAtual() ator: Ator, @Body() body: { aderir: boolean; itens?: string[] }) {
    return this.arp.responderReserva(id, ator, body || ({} as any));
  }

  // ---------------- partes da adesão ----------------

  @Get('adesoes/:adesaoId')
  obterAdesao(@Param('adesaoId') adesaoId: string, @AtorAtual() ator: Ator) {
    return this.arp.obterAdesao(adesaoId, ator);
  }
}
