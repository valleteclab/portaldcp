import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  TramitacaoProcesso,
  StatusTramitacao,
} from './entities/tramitacao-processo.entity';
import { AcaoLogFaseInterna } from './entities/log-fase-interna.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { Setor } from '../orgaos/entities/setor.entity';
import { AuditLogService, ContextoUsuario } from './audit-log.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { TipoNotificacao } from '../notificacoes/entities/notificacao.entity';

export interface TramitarDto {
  para_setor_id: string;
  para_usuario_id?: string;
  para_usuario_nome?: string;
  despacho: string;
  prazo_dias?: number;
  de_usuario_id?: string;
  de_usuario_nome?: string;
}

/**
 * Tramitação do processo licitatório entre setores (estilo SEI).
 * O setor atual do processo é o destino da última tramitação ativa.
 */
@Injectable()
export class TramitacaoService {
  private readonly logger = new Logger(TramitacaoService.name);

  constructor(
    @InjectRepository(TramitacaoProcesso)
    private readonly tramitacaoRepo: Repository<TramitacaoProcesso>,
    @InjectRepository(Licitacao)
    private readonly licitacaoRepo: Repository<Licitacao>,
    @InjectRepository(Setor)
    private readonly setorRepo: Repository<Setor>,
    private readonly auditLog: AuditLogService,
    @Optional() private readonly notificacoes?: NotificacoesService,
  ) {}

  /** Encaminha o processo para um setor, com despacho obrigatório. */
  async tramitar(
    licitacaoId: string,
    dto: TramitarDto,
    contexto?: ContextoUsuario,
  ): Promise<TramitacaoProcesso> {
    if (!dto.despacho?.trim()) {
      throw new BadRequestException('O despacho é obrigatório para tramitar o processo');
    }
    const licitacao = await this.licitacaoRepo.findOne({ where: { id: licitacaoId } });
    if (!licitacao) throw new NotFoundException('Licitação não encontrada');

    const setorDestino = await this.setorRepo.findOne({
      where: { id: dto.para_setor_id, orgao_id: licitacao.orgao_id },
    });
    if (!setorDestino) {
      throw new BadRequestException('Setor de destino não encontrado neste órgão');
    }

    const atual = await this.tramitacaoAtual(licitacaoId);
    if (atual && atual.para_setor_id === dto.para_setor_id && atual.status !== StatusTramitacao.DEVOLVIDA) {
      throw new BadRequestException('O processo já está neste setor');
    }

    // Encerra a tramitação vigente (o processo sai do setor)
    if (atual && atual.status !== StatusTramitacao.DEVOLVIDA) {
      atual.status = StatusTramitacao.CONCLUIDA;
      await this.tramitacaoRepo.save(atual);
    }

    const ultimaSequencia = await this.tramitacaoRepo
      .createQueryBuilder('t')
      .select('COALESCE(MAX(t.sequencia), 0)', 'max')
      .where('t.licitacao_id = :licitacaoId', { licitacaoId })
      .getRawOne();

    const dataPrazo = dto.prazo_dias
      ? new Date(Date.now() + dto.prazo_dias * 24 * 60 * 60 * 1000)
      : undefined;

    const tramitacao = await this.tramitacaoRepo.save(
      this.tramitacaoRepo.create({
        licitacao_id: licitacaoId,
        sequencia: Number(ultimaSequencia?.max || 0) + 1,
        de_setor_id: atual?.para_setor_id,
        de_setor_nome: atual?.para_setor_nome,
        de_usuario_id: dto.de_usuario_id || contexto?.usuario_id,
        de_usuario_nome: dto.de_usuario_nome || contexto?.usuario_nome,
        para_setor_id: setorDestino.id,
        para_setor_nome: setorDestino.nome,
        para_usuario_id: dto.para_usuario_id,
        para_usuario_nome: dto.para_usuario_nome,
        despacho: dto.despacho.trim(),
        prazo_dias: dto.prazo_dias,
        data_prazo: dataPrazo,
        status: StatusTramitacao.PENDENTE,
      }),
    );

    await this.auditLog.log({
      licitacao_id: licitacaoId,
      acao: AcaoLogFaseInterna.PROCESSO_TRAMITADO,
      descricao: `Processo tramitado para ${setorDestino.nome}${dto.para_usuario_nome ? ` (${dto.para_usuario_nome})` : ''}`,
      dados_depois: { tramitacao_id: tramitacao.id, despacho: dto.despacho, prazo_dias: dto.prazo_dias },
      contexto,
    });

    await this.notificarDestino(licitacao, tramitacao);
    return tramitacao;
  }

  /** Confirma o recebimento do processo no setor de destino. */
  async receber(
    tramitacaoId: string,
    usuario: { id?: string; nome?: string },
    contexto?: ContextoUsuario,
  ): Promise<TramitacaoProcesso> {
    const tramitacao = await this.obter(tramitacaoId);
    if (tramitacao.status !== StatusTramitacao.PENDENTE) {
      throw new BadRequestException('Esta tramitação não está pendente de recebimento');
    }
    this.tramitacaoRepo.merge(tramitacao, {
      status: StatusTramitacao.RECEBIDA,
      data_recebimento: new Date(),
      recebido_por_id: usuario.id,
      recebido_por_nome: usuario.nome,
    });
    await this.tramitacaoRepo.save(tramitacao);

    await this.auditLog.log({
      licitacao_id: tramitacao.licitacao_id,
      acao: AcaoLogFaseInterna.TRAMITACAO_RECEBIDA,
      descricao: `Recebimento confirmado em ${tramitacao.para_setor_nome}`,
      dados_depois: { tramitacao_id: tramitacao.id },
      contexto,
    });
    return tramitacao;
  }

  /** Devolve o processo ao setor de origem com motivo. */
  async devolver(
    tramitacaoId: string,
    motivo: string,
    usuario: { id?: string; nome?: string },
    contexto?: ContextoUsuario,
  ): Promise<TramitacaoProcesso> {
    if (!motivo?.trim()) {
      throw new BadRequestException('O motivo da devolução é obrigatório');
    }
    const tramitacao = await this.obter(tramitacaoId);
    if (![StatusTramitacao.PENDENTE, StatusTramitacao.RECEBIDA].includes(tramitacao.status)) {
      throw new BadRequestException('Esta tramitação não pode ser devolvida');
    }
    if (!tramitacao.de_setor_id) {
      throw new BadRequestException('Tramitação inicial não pode ser devolvida (não há setor de origem)');
    }

    tramitacao.status = StatusTramitacao.DEVOLVIDA;
    tramitacao.motivo_devolucao = motivo.trim();
    tramitacao.data_devolucao = new Date();
    await this.tramitacaoRepo.save(tramitacao);

    await this.auditLog.log({
      licitacao_id: tramitacao.licitacao_id,
      acao: AcaoLogFaseInterna.TRAMITACAO_DEVOLVIDA,
      descricao: `Processo devolvido de ${tramitacao.para_setor_nome} para ${tramitacao.de_setor_nome}`,
      dados_depois: { tramitacao_id: tramitacao.id, motivo },
      contexto,
    });

    // Devolução gera nova tramitação de volta ao setor de origem
    return this.tramitar(
      tramitacao.licitacao_id,
      {
        para_setor_id: tramitacao.de_setor_id,
        despacho: `DEVOLUÇÃO: ${motivo.trim()}`,
        de_usuario_id: usuario.id,
        de_usuario_nome: usuario.nome,
      },
      contexto,
    );
  }

  /** Histórico completo de tramitações do processo. */
  async listarPorProcesso(licitacaoId: string): Promise<TramitacaoProcesso[]> {
    return this.tramitacaoRepo.find({
      where: { licitacao_id: licitacaoId },
      order: { sequencia: 'ASC' },
    });
  }

  /** Tramitação vigente (onde o processo está agora). */
  async tramitacaoAtual(licitacaoId: string): Promise<TramitacaoProcesso | null> {
    return this.tramitacaoRepo.findOne({
      where: { licitacao_id: licitacaoId },
      order: { sequencia: 'DESC' },
    });
  }

  /** Caixa de entrada: tramitações pendentes de recebimento por setor e/ou usuário. */
  async caixaEntrada(filtro: { setorId?: string; usuarioId?: string }) {
    const qb = this.tramitacaoRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.licitacao', 'licitacao')
      .where('t.status = :status', { status: StatusTramitacao.PENDENTE })
      .orderBy('t.data_envio', 'ASC');

    if (filtro.setorId && filtro.usuarioId) {
      qb.andWhere(
        '(t.para_setor_id = :setorId OR t.para_usuario_id = :usuarioId)',
        { setorId: filtro.setorId, usuarioId: filtro.usuarioId },
      );
    } else if (filtro.setorId) {
      qb.andWhere('t.para_setor_id = :setorId', { setorId: filtro.setorId });
    } else if (filtro.usuarioId) {
      qb.andWhere('t.para_usuario_id = :usuarioId', { usuarioId: filtro.usuarioId });
    } else {
      throw new BadRequestException('Informe setorId e/ou usuarioId');
    }
    return qb.getMany();
  }

  private async obter(id: string): Promise<TramitacaoProcesso> {
    const tramitacao = await this.tramitacaoRepo.findOne({ where: { id } });
    if (!tramitacao) throw new NotFoundException('Tramitação não encontrada');
    return tramitacao;
  }

  private async notificarDestino(licitacao: Licitacao, tramitacao: TramitacaoProcesso) {
    if (!this.notificacoes || !tramitacao.para_usuario_id) return;
    try {
      await this.notificacoes.criar({
        orgao_id: licitacao.orgao_id,
        usuario_id: tramitacao.para_usuario_id,
        tipo: TipoNotificacao.PROCESSO_TRAMITADO,
        titulo: `Processo ${licitacao.numero_processo} tramitado para você`,
        mensagem: tramitacao.despacho,
        entidade_tipo: 'LICITACAO',
        entidade_id: licitacao.id,
        link: `/orgao/fase-interna/processos/${licitacao.id}`,
      });
    } catch (e) {
      this.logger.warn(`Falha ao notificar destino da tramitação: ${e.message}`);
    }
  }
}
