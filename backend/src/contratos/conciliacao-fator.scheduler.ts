/**
 * ============================================================================
 * SCHEDULER: MEDIÇÕES APROVADAS E NÃO LIQUIDADAS
 * ============================================================================
 *
 * Roda diariamente e verifica, por órgão, medições APROVADAS há mais de 15
 * dias que ainda não constam liquidadas no portal Fator — sinal de que o
 * processo físico de pagamento (impressão + envio à contabilidade) pode ter
 * sido esquecido.
 *
 * Notifica: sino do sistema (usuários do órgão) + WhatsApp do responsável
 * por medições (orgaos.whatsapp_responsavel_medicoes), com dedupe de 3 dias
 * por medição para não virar spam.
 *
 * ============================================================================
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Contrato, ModalidadeExecucao } from './entities/contrato.entity';
import {
  Notificacao,
  TipoNotificacao,
  PrioridadeNotificacao,
} from '../notificacoes/entities/notificacao.entity';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { ConciliacaoFatorService } from './conciliacao-fator.service';

const DIAS_TOLERANCIA = 15;
const DIAS_DEDUPE = 3;

@Injectable()
export class ConciliacaoFatorScheduler {
  private readonly logger = new Logger(ConciliacaoFatorScheduler.name);

  constructor(
    private readonly conciliacao: ConciliacaoFatorService,
    private readonly notificacoes: NotificacoesService,
    private readonly whatsapp: WhatsAppService,
    @InjectRepository(Orgao)
    private readonly orgaoRepo: Repository<Orgao>,
    @InjectRepository(Usuario)
    private readonly usuarioRepo: Repository<Usuario>,
    @InjectRepository(Contrato)
    private readonly contratoRepo: Repository<Contrato>,
    @InjectRepository(Notificacao)
    private readonly notificacaoRepo: Repository<Notificacao>,
  ) {}

  /** Diário às 7h30 (após a atualização noturna do portal). */
  @Cron('30 7 * * *', { name: 'medicoes-nao-liquidadas' })
  async verificarTodosOrgaos(): Promise<void> {
    // Só órgãos que têm contratos de medição vigentes
    const orgaoIds: { orgao_id: string }[] = await this.contratoRepo
      .createQueryBuilder('c')
      .select('DISTINCT c.orgao_id', 'orgao_id')
      .where('c.modalidade_execucao = :m', { m: ModalidadeExecucao.MEDICAO })
      .andWhere("c.status = 'VIGENTE'")
      .getRawMany();

    this.logger.log(
      `Verificação de medições não liquidadas — ${orgaoIds.length} órgão(s)`,
    );
    for (const { orgao_id } of orgaoIds) {
      try {
        await this.verificarOrgao(orgao_id);
      } catch (e) {
        this.logger.error(
          `Falha na verificação do órgão ${orgao_id}: ${(e as any).message}`,
        );
      }
    }
  }

  async verificarOrgao(orgaoId: string): Promise<number> {
    const pendentes = await this.conciliacao.verificarMedicoesNaoLiquidadas(
      orgaoId,
      DIAS_TOLERANCIA,
    );
    if (pendentes.length === 0) return 0;

    const orgao = await this.orgaoRepo.findOne({
      where: { id: orgaoId },
      select: ['id', 'whatsapp_responsavel_medicoes'],
    });
    const usuarios = await this.usuarioRepo.find({
      where: { orgao_id: orgaoId, ativo: true },
      select: ['id', 'email', 'telefone'],
    });

    let notificadas = 0;
    for (const p of pendentes) {
      // Dedupe: não repetir a notificação da mesma medição dentro da janela
      const corte = new Date();
      corte.setDate(corte.getDate() - DIAS_DEDUPE);
      const jaNotificada = await this.notificacaoRepo.count({
        where: {
          tipo: TipoNotificacao.MEDICAO_NAO_LIQUIDADA,
          entidade_id: p.medicao_id,
          created_at: MoreThan(corte),
        },
      });
      if (jaNotificada > 0) continue;

      const titulo = `Medição #${p.numero_medicao} sem liquidação há ${p.dias_desde_aprovacao} dias`;
      const mensagem =
        `A Medição #${p.numero_medicao} do contrato ${p.numero_contrato} (${p.fornecedor}), ` +
        `no valor de ${this.brl(p.valor)}, foi aprovada em ${this.dataBR(p.data_aprovacao)} ` +
        `e ainda não consta liquidada no portal da transparência. ` +
        `Verifique se o processo de pagamento foi impresso e encaminhado à contabilidade.`;

      // Sino do sistema
      try {
        await this.notificacoes.criarParaMultiplos(usuarios, {
          orgao_id: orgaoId,
          tipo: TipoNotificacao.MEDICAO_NAO_LIQUIDADA,
          titulo,
          mensagem,
          prioridade: PrioridadeNotificacao.ALTA,
          entidade_tipo: 'medicao',
          entidade_id: p.medicao_id,
          link: `/orgao/contratos/${p.contrato_id}?tab=medicao`,
          metadata: {
            contrato_numero: p.numero_contrato,
            medicao_numero: p.numero_medicao,
            valor: p.valor,
            dias: p.dias_desde_aprovacao,
          },
        } as any);
      } catch (e) {
        this.logger.error(`Erro ao criar notificação: ${(e as any).message}`);
      }

      // WhatsApp do responsável por medições
      const zap = orgao?.whatsapp_responsavel_medicoes?.replace(/\D/g, '');
      if (zap) {
        try {
          await this.whatsapp.enviar(orgaoId, {
            to: zap,
            mensagem: `⚠️ *Portal DCP — Medição sem liquidação*\n\n${mensagem}`,
          });
        } catch (e) {
          this.logger.warn(`WhatsApp não enviado (${zap}): ${(e as any).message}`);
        }
      }
      notificadas++;
    }
    if (notificadas > 0) {
      this.logger.log(
        `Órgão ${orgaoId}: ${notificadas} alerta(s) de medição não liquidada enviado(s)`,
      );
    }
    return notificadas;
  }

  private brl(v: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  }
  private dataBR(iso: string): string {
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
  }
}
