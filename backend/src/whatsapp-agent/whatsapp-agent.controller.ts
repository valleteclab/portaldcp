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
