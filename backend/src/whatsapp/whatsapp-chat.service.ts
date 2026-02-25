import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subject } from 'rxjs';
import { WhatsappConversa } from './entities/whatsapp-conversa.entity';
import { WhatsappMensagem } from './entities/whatsapp-mensagem.entity';
import { WhatsAppService } from './whatsapp.service';

export interface SseEventData {
  orgaoId: string;
  conversaId: string;
  mensagem: WhatsappMensagem;
}

@Injectable()
export class WhatsappChatService {
  private readonly logger = new Logger(WhatsappChatService.name);
  readonly novaMensagem$ = new Subject<SseEventData>();

  constructor(
    @InjectRepository(WhatsappConversa)
    private readonly conversaRepo: Repository<WhatsappConversa>,
    @InjectRepository(WhatsappMensagem)
    private readonly mensagemRepo: Repository<WhatsappMensagem>,
    private readonly whatsappService: WhatsAppService,
  ) {}

  async listarConversas(orgaoId: string): Promise<WhatsappConversa[]> {
    return this.conversaRepo.find({
      where: { orgao_id: orgaoId },
      order: { ultima_mensagem_em: 'DESC' },
    });
  }

  async buscarConversa(orgaoId: string, conversaId: string): Promise<WhatsappConversa> {
    const c = await this.conversaRepo.findOne({ where: { id: conversaId, orgao_id: orgaoId } });
    if (!c) throw new NotFoundException('Conversa não encontrada');
    return c;
  }

  async listarMensagens(orgaoId: string, conversaId: string): Promise<WhatsappMensagem[]> {
    await this.buscarConversa(orgaoId, conversaId);
    return this.mensagemRepo.find({
      where: { conversa_id: conversaId },
      order: { created_at: 'ASC' },
      take: 200,
    });
  }

  async marcarComoLida(orgaoId: string, conversaId: string): Promise<void> {
    await this.buscarConversa(orgaoId, conversaId);
    await this.conversaRepo.update({ id: conversaId }, { mensagens_nao_lidas: 0 });
  }

  async obterOuCriarConversa(orgaoId: string, phone: string, nomeContato?: string): Promise<WhatsappConversa> {
    let conversa = await this.conversaRepo.findOne({ where: { orgao_id: orgaoId, phone } });
    if (!conversa) {
      conversa = this.conversaRepo.create({
        orgao_id: orgaoId,
        phone,
        nome_contato: nomeContato || phone,
        mensagens_nao_lidas: 0,
      });
      conversa = await this.conversaRepo.save(conversa);
    } else if (nomeContato && nomeContato !== phone && conversa.nome_contato === conversa.phone) {
      conversa.nome_contato = nomeContato;
      conversa = await this.conversaRepo.save(conversa);
    }
    return conversa;
  }

  async enviarMensagem(orgaoId: string, conversaId: string, conteudo: string): Promise<WhatsappMensagem> {
    const conversa = await this.buscarConversa(orgaoId, conversaId);

    const mensagem = await this.mensagemRepo.save(
      this.mensagemRepo.create({
        conversa_id: conversaId,
        direcao: 'ENVIADA',
        conteudo,
        status: 'PENDENTE',
      }),
    );

    const ok = await this.whatsappService.enviar(orgaoId, { to: conversa.phone, mensagem: conteudo });

    mensagem.status = ok ? 'ENVIADA' : 'FALHA';
    await this.mensagemRepo.save(mensagem);

    await this.conversaRepo.update(conversaId, {
      ultima_mensagem: conteudo,
      ultima_mensagem_em: new Date(),
      updated_at: new Date(),
    });

    this.novaMensagem$.next({ orgaoId, conversaId, mensagem });
    return mensagem;
  }

  async receberMensagemWebhook(
    orgaoId: string,
    phone: string,
    conteudo: string,
    zapiMessageId?: string,
    nomeContato?: string,
  ): Promise<void> {
    const conversa = await this.obterOuCriarConversa(orgaoId, phone, nomeContato);

    const mensagem = await this.mensagemRepo.save(
      this.mensagemRepo.create({
        conversa_id: conversa.id,
        direcao: 'RECEBIDA',
        conteudo,
        status: 'RECEBIDA',
        zapi_message_id: zapiMessageId,
      }),
    );

    await this.conversaRepo.update(conversa.id, {
      ultima_mensagem: conteudo,
      ultima_mensagem_em: new Date(),
      updated_at: new Date(),
    });
    await this.conversaRepo.increment({ id: conversa.id }, 'mensagens_nao_lidas', 1);

    this.novaMensagem$.next({ orgaoId, conversaId: conversa.id, mensagem });
    this.logger.log(`Mensagem recebida de ${phone} → conversa ${conversa.id}`);
  }

  async atualizarStatusMensagem(zapiMessageId: string, status: 'ENTREGUE' | 'LIDA' | 'FALHA'): Promise<void> {
    const mensagem = await this.mensagemRepo.findOne({ where: { zapi_message_id: zapiMessageId } });
    if (mensagem) {
      await this.mensagemRepo.update(mensagem.id, { status });
    }
  }
}
