import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Repository } from 'typeorm';
import { decryptTextOrRaw, encryptText } from '../../common/crypto.util';
import { WorkflowTeamsCanal } from './teams-canal.entity';

export interface DadosCardAviso {
  titulo: string;
  numero: string;
  etapa: string;
  setor: string;
  prazo: string | null;
  link: string | null;
}

/**
 * Mostra só os últimos 6 caracteres da URL do webhook — o suficiente para o
 * órgão reconhecer qual canal é qual, sem devolver o segredo pela API.
 */
export function mascararWebhook(url: string): string {
  if (!url) return '';
  const limpa = url.trim();
  if (limpa.length <= 10) return '••••••';
  return `••••••${limpa.slice(-6)}`;
}

/**
 * Payload do app "Workflows" do Teams ("Post to a channel when a webhook
 * request is received"): um Adaptive Card dentro de `attachments`. Função
 * pura — sem rede — para ser testada isoladamente.
 */
export function montarAdaptiveCard(dados: DadosCardAviso): Record<string, unknown> {
  const fatos: Array<{ title: string; value: string }> = [
    { title: 'Processo', value: dados.numero },
    { title: 'Etapa', value: dados.etapa },
    { title: 'Setor', value: dados.setor },
  ];
  if (dados.prazo) fatos.push({ title: 'Prazo', value: dados.prazo });

  const body: Record<string, unknown>[] = [
    { type: 'TextBlock', text: dados.titulo, weight: 'Bolder', size: 'Medium', wrap: true },
    { type: 'FactSet', facts: fatos },
  ];

  const card: Record<string, unknown> = {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.4',
    body,
  };
  if (dados.link) {
    card.actions = [{ type: 'Action.OpenUrl', title: 'Abrir processo', url: dados.link }];
  }

  return {
    type: 'message',
    attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: card }],
  };
}

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(@InjectRepository(WorkflowTeamsCanal) private readonly canais: Repository<WorkflowTeamsCanal>) {}

  async listar(orgaoId: string) {
    const registros = await this.canais.find({ where: { orgao_id: orgaoId }, order: { nome: 'ASC' } });
    return registros.map((c) => ({ id: c.id, nome: c.nome, webhook_mascarado: mascararWebhook(decryptTextOrRaw(c.webhook_url)), created_at: c.created_at }));
  }

  /** Canal pertence ao órgão (usado também para validar `teams_canal_id` salvo numa ação). */
  async pertenceAoOrgao(orgaoId: string, canalId: string): Promise<boolean> {
    return (await this.canais.count({ where: { id: canalId, orgao_id: orgaoId } })) > 0;
  }

  async criar(orgaoId: string, autorId: string | null, body: any) {
    const nome = String(body?.nome ?? '').trim();
    const webhookUrl = String(body?.webhook_url ?? '').trim();
    if (!nome) throw new BadRequestException('Informe o nome do canal');
    if (!webhookUrl.startsWith('https://')) throw new BadRequestException('Informe a URL do webhook gerada pelo app Workflows do Teams');
    const registro = await this.canais.save(this.canais.create({ orgao_id: orgaoId, nome, webhook_url: encryptText(webhookUrl), criado_por_id: autorId }));
    return { id: registro.id, nome: registro.nome, webhook_mascarado: mascararWebhook(webhookUrl), created_at: registro.created_at };
  }

  async remover(orgaoId: string, canalId: string) {
    const registro = await this.canais.findOne({ where: { id: canalId, orgao_id: orgaoId } });
    if (!registro) throw new NotFoundException('Canal do Teams não encontrado');
    await this.canais.remove(registro);
    return { ok: true };
  }

  private async webhookDoCanal(orgaoId: string, canalId: string): Promise<string> {
    const registro = await this.canais.findOne({ where: { id: canalId, orgao_id: orgaoId } });
    if (!registro) throw new NotFoundException('Canal do Teams não encontrado');
    return decryptTextOrRaw(registro.webhook_url);
  }

  async enviarCard(orgaoId: string, canalId: string, dados: DadosCardAviso): Promise<boolean> {
    try {
      const webhook = await this.webhookDoCanal(orgaoId, canalId);
      await axios.post(webhook, montarAdaptiveCard(dados), { timeout: 10_000 });
      return true;
    } catch (e) {
      this.logger.warn(`Falha ao enviar aviso ao Teams (órgão ${orgaoId}, canal ${canalId}): ${(e as Error).message}`);
      return false;
    }
  }

  async testar(orgaoId: string, canalId: string): Promise<{ sucesso: boolean; mensagem: string }> {
    const ok = await this.enviarCard(orgaoId, canalId, {
      titulo: 'Teste de conexão do Portal DCP',
      numero: 'TESTE',
      etapa: 'Verificação de canal',
      setor: 'Configuração do órgão',
      prazo: null,
      link: null,
    });
    return ok
      ? { sucesso: true, mensagem: 'Mensagem de teste enviada ao canal do Teams.' }
      : { sucesso: false, mensagem: 'Não foi possível enviar ao Teams. Confira a URL do webhook.' };
  }
}
