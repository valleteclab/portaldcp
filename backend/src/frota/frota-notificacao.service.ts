import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { FrotaCredencial } from './entities/frota-credencial.entity';
import { FrotaRequisicao } from './entities/frota-requisicao.entity';

/**
 * Avisos por WhatsApp do fluxo de combustível. Sempre "fire-and-forget":
 * falha de envio vira log, nunca erro para quem fez a ação.
 *
 * - gestor responsável (orgaos.whatsapp_responsavel_frota): pedido novo do vereador;
 * - vereador (frota_credenciais.telefone_whatsapp): pedido aprovado / negado,
 *   abastecimento registrado, liberação de cota extra.
 */
@Injectable()
export class FrotaNotificacaoService {
  private readonly logger = new Logger(FrotaNotificacaoService.name);

  constructor(
    private readonly whatsapp: WhatsAppService,
    @InjectRepository(Orgao)
    private readonly orgaoRepo: Repository<Orgao>,
    @InjectRepository(FrotaCredencial)
    private readonly credencialRepo: Repository<FrotaCredencial>,
  ) {}

  private get baseUrl(): string {
    return process.env.APP_URL || process.env.FRONTEND_URL || 'https://portaldcp.com.br';
  }

  private litros(n: number | string | null | undefined): string {
    return `${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 3 })} L`;
  }

  private combustivel(tipo?: string | null): string {
    const t = String(tipo || '').toLowerCase();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'combustível';
  }

  private dataBR(d?: Date | string | null): string {
    if (!d) return '';
    return new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }

  private async enviar(orgaoId: string, telefone: string | null | undefined, mensagem: string, contexto: string): Promise<void> {
    const to = String(telefone || '').replace(/\D/g, '');
    if (!to) return;
    try {
      const ok = await this.whatsapp.enviar(orgaoId, { to, mensagem });
      if (!ok) await this.whatsapp.enviarSistema(to, mensagem);
    } catch (err: any) {
      this.logger.warn(`WhatsApp não enviado (${contexto}, ${to}): ${err?.message}`);
    }
  }

  private async telefoneVereador(req: FrotaRequisicao): Promise<{ orgaoId: string; telefone: string | null } | null> {
    if (!req.credencial_solicitante_id) return null;
    const cred = await this.credencialRepo.findOne({
      where: { id: req.credencial_solicitante_id },
      select: ['id', 'telefone_whatsapp', 'orgao_id'],
    });
    if (!cred) return null;
    return { orgaoId: cred.orgao_id, telefone: cred.telefone_whatsapp };
  }

  /** Pedido novo do vereador → gestor responsável pela frota */
  async novoPedidoParaGestor(req: FrotaRequisicao): Promise<void> {
    const orgao = await this.orgaoRepo.findOne({
      where: { id: req.orgao_id },
      select: ['id', 'whatsapp_responsavel_frota'],
    });
    if (!orgao?.whatsapp_responsavel_frota) return;
    const msg =
      `⛽ *Pedido de combustível aguardando aprovação*\n\n` +
      `*${req.codigo}* — ${req.solicitante_nome}${req.solicitante_cargo ? ` (${req.solicitante_cargo})` : ''}\n` +
      `${this.litros(req.quantidade_autorizada)} de ${this.combustivel(req.tipo_combustivel)} · placa ${req.veiculo_placa}\n` +
      `Finalidade: ${req.finalidade}\n\n` +
      `Aprovar ou negar: ${this.baseUrl}/orgao/frota/requisicoes`;
    await this.enviar(req.orgao_id, orgao.whatsapp_responsavel_frota, msg, 'novo pedido');
  }

  /** Gestor autorizou → vereador recebe código e link do QR */
  async pedidoAutorizado(req: FrotaRequisicao): Promise<void> {
    const alvo = await this.telefoneVereador(req);
    if (!alvo?.telefone) return;
    const msg =
      `✅ *Pedido ${req.codigo} aprovado*\n\n` +
      `${this.litros(req.quantidade_autorizada)} de ${this.combustivel(req.tipo_combustivel)} · placa ${req.veiculo_placa}\n` +
      `Código para o posto: *${req.codigo_posto}*\n` +
      (req.token_expiry ? `Válido até ${this.dataBR(req.token_expiry)}.\n` : '') +
      `\nMostre o QR ao posto: ${this.baseUrl}/frota/req/${req.token_acesso}`;
    await this.enviar(alvo.orgaoId, alvo.telefone, msg, 'pedido autorizado');
  }

  /** Gestor negou → vereador recebe o motivo */
  async pedidoNegado(req: FrotaRequisicao): Promise<void> {
    const alvo = await this.telefoneVereador(req);
    if (!alvo?.telefone) return;
    const msg =
      `❌ *Pedido ${req.codigo} não aprovado*\n\n` +
      `${this.litros(req.quantidade_autorizada)} de ${this.combustivel(req.tipo_combustivel)} · placa ${req.veiculo_placa}\n` +
      (req.motivo_negacao ? `Motivo: ${req.motivo_negacao}\n` : '') +
      `\nSe precisar, faça um novo pedido ou fale com o gestor.`;
    await this.enviar(alvo.orgaoId, alvo.telefone, msg, 'pedido negado');
  }

  /** Posto confirmou → vereador recebe o comprovante resumido */
  async abastecimentoConfirmado(req: FrotaRequisicao): Promise<void> {
    const alvo = await this.telefoneVereador(req);
    if (!alvo?.telefone) return;
    const msg =
      `⛽ *Abastecimento registrado — ${req.codigo}*\n\n` +
      `${this.litros(req.quantidade_abastecida)} de ${this.combustivel(req.tipo_combustivel)} · placa ${req.veiculo_placa}\n` +
      (req.atendente_nome ? `Atendente: ${req.atendente_nome}\n` : '') +
      (req.km_hodometro ? `Km: ${Number(req.km_hodometro).toLocaleString('pt-BR')}\n` : '');
    await this.enviar(alvo.orgaoId, alvo.telefone, msg, 'abastecimento confirmado');
  }

  /** Gestor liberou litros extras no mês → vereador */
  async cotaExtraLiberada(credencial: FrotaCredencial, litros: number, motivo: string, liberadoPor: string): Promise<void> {
    if (!credencial.telefone_whatsapp) return;
    const msg =
      `🟢 *Cota extra liberada*\n\n` +
      `${liberadoPor} liberou *${this.litros(litros)}* a mais para você neste mês` +
      (motivo ? ` — ${motivo}` : '') + `.\n` +
      `Total extra no mês: ${this.litros(credencial.cota_extra_litros)}.`;
    await this.enviar(credencial.orgao_id, credencial.telefone_whatsapp, msg, 'cota extra');
  }
}
