import { Controller, Post, Body, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Public } from '../auth/public.decorator';
import { WhatsappAgentService } from './whatsapp-agent.service';
import { Repository } from 'typeorm';
import { Orgao } from '../orgaos/entities/orgao.entity';

/**
 * Recebe webhooks do Z-API com mensagens enviadas pelos fornecedores.
 * Rota pública — não requer autenticação JWT.
 */
@Controller('whatsapp/agent')
export class WhatsappAgentController {
  private readonly logger = new Logger(WhatsappAgentController.name);

  constructor(
    private readonly agentService: WhatsappAgentService,
    @InjectRepository(Orgao)
    private readonly orgaoRepository: Repository<Orgao>,
  ) {}

  @Public()
  @Post('webhook')
  async receberWebhook(@Body() payload: any): Promise<{ ok: boolean }> {
    // Ignorar mensagens de grupos
    if (payload?.isGroup) return { ok: true };

    // Mensagem ENVIADA pelo próprio número da IA:
    //   fromApi === true  → foi a própria IA (enviada via API) → ignora.
    //   fromApi !== true   → um HUMANO respondeu manualmente pelo WhatsApp da IA →
    //                        assume a conversa e pausa a IA para esse contato.
    // (Exige o Z-API estar configurado para "notificar mensagens enviadas por mim".)
    if (payload?.fromMe === true) {
      if (payload?.fromApi !== true) {
        const alvo: string = (payload?.phone || payload?.chatId || '').replace(
          /\D/g,
          '',
        );
        this.logger.log(
          `Resposta manual detectada para ${alvo} — pausando IA nessa conversa.`,
        );
        if (alvo) {
          this.agentService
            .registrarRespostaManual(alvo)
            .catch((err) =>
              this.logger.error(`Erro ao pausar por resposta manual: ${err.message}`),
            );
        }
      }
      return { ok: true };
    }

    // Processar apenas mensagens recebidas (ReceivedCallback)
    const tipo: string = payload?.type || '';
    if (tipo && tipo !== 'ReceivedCallback') return { ok: true };

    const phone: string = payload?.phone?.replace(/\D/g, '') || '';
    const mensagem: string =
      payload?.text?.message ||
      payload?.image?.caption ||
      payload?.document?.caption ||
      '';
    const nomeContato: string = payload?.senderName || '';
    const instanceId: string = payload?.instanceId || '';

    if (!phone || !mensagem) return { ok: true };

    const orgao = instanceId
      ? await this.orgaoRepository.findOne({ where: { whatsapp_instance_id: instanceId } })
      : null;
    const orgaoId = orgao?.id;

    // Processar de forma assíncrona para responder ao ZAPI imediatamente
    this.agentService.processarMensagem(phone, mensagem, nomeContato, orgaoId).catch((err) =>
      this.logger.error(`Erro ao processar mensagem do agente: ${err.message}`),
    );

    return { ok: true };
  }
}
