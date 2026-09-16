import { Controller, Get, Post, Put, Param, Body, ForbiddenException, NotFoundException, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminGuard } from '../auth/admin.guard';
import { SessaoDisputa, StatusSessao } from '../sessao/entities/sessao-disputa.entity';
import { ItemLicitacao, StatusDisputaItem } from '../itens/entities/item-licitacao.entity';
import { Lance } from '../lances/entities/lance.entity';
import { EventoSessao, TipoEvento } from '../sessao/entities/evento-sessao.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { DisputaGateway } from '../disputa-v2/disputa.gateway';
import { DisputaService } from '../disputa-v2/disputa.service';
import { AnonimizacaoService } from '../disputa-v2/anonimizacao.service';

/**
 * ============================================================================
 * ADMIN MONITORAMENTO CONTROLLER
 * ============================================================================
 * 
 * Endpoints para monitoramento e auditoria de disputas
 * Acesso restrito ao administrador da plataforma (AdminGuard). Estava @Public():
 * qualquer um podia listar sessões e até encerrar item de disputa à força.
 * ============================================================================
 */

@Controller('admin/monitoramento')
@UseGuards(AdminGuard)
export class AdminMonitoramentoController {
  constructor(
    @InjectRepository(SessaoDisputa)
    private readonly sessaoRepo: Repository<SessaoDisputa>,
    @InjectRepository(ItemLicitacao)
    private readonly itemRepo: Repository<ItemLicitacao>,
    @InjectRepository(Lance)
    private readonly lanceRepo: Repository<Lance>,
    @InjectRepository(EventoSessao)
    private readonly eventoRepo: Repository<EventoSessao>,
    @InjectRepository(Licitacao)
    private readonly licitacaoRepo: Repository<Licitacao>,
    private readonly disputaGateway: DisputaGateway,
    private readonly disputaService: DisputaService,
    private readonly anonimizacaoService: AnonimizacaoService,
  ) {}

  /**
   * Lista todas as sessões ativas para monitoramento
   */
  @Get('sessoes-ativas')
  async getSessoesAtivas() {
    const sessoes = await this.sessaoRepo
      .createQueryBuilder('sessao')
      .leftJoinAndSelect('sessao.licitacao', 'licitacao')
      .leftJoinAndSelect('licitacao.orgao', 'orgao')
      .where('sessao.status IN (:...status)', { 
        status: [
          StatusSessao.EM_ANDAMENTO, 
          StatusSessao.MODO_ABERTO, 
          StatusSessao.MODO_FECHADO,
          StatusSessao.AGUARDANDO_INICIO
        ] 
      })
      .orderBy('sessao.created_at', 'DESC')
      .getMany();

    const resultado = await Promise.all(sessoes.map(async (sessao) => {
      // Contar itens por status
      const itensAguardando = await this.itemRepo.count({
        where: { licitacao_id: sessao.licitacao_id, status_disputa: StatusDisputaItem.AGUARDANDO }
      });
      const itensEmDisputa = await this.itemRepo.count({
        where: { licitacao_id: sessao.licitacao_id, status_disputa: StatusDisputaItem.EM_DISPUTA }
      });
      const itensEncerrados = await this.itemRepo.count({
        where: { licitacao_id: sessao.licitacao_id, status_disputa: StatusDisputaItem.ENCERRADO }
      });

      // Contar lances
      const totalLances = await this.lanceRepo.count({
        where: { licitacao_id: sessao.licitacao_id, cancelado: false }
      });

      return {
        id: sessao.id,
        licitacao_id: sessao.licitacao_id,
        licitacao_numero: sessao.licitacao?.numero_controle_pncp || sessao.licitacao?.numero_processo || 'N/A',
        licitacao_objeto: sessao.licitacao?.objeto || 'N/A',
        orgao_nome: sessao.licitacao?.orgao?.nome || 'N/A',
        pregoeiro_nome: sessao.pregoeiro_nome,
        status: sessao.status,
        etapa: sessao.etapa,
        data_inicio: sessao.data_hora_inicio_real || sessao.data_hora_inicio_prevista,
        itens_aguardando: itensAguardando,
        itens_em_disputa: itensEmDisputa,
        itens_encerrados: itensEncerrados,
        total_lances: totalLances,
        fornecedores_conectados: 0, // TODO: Implementar contagem via WebSocket
      };
    }));

    return resultado;
  }

  /**
   * Lista itens em disputa de uma sessão específica
   */
  @Get('sessao/:sessaoId/itens')
  async getItensEmDisputa(@Param('sessaoId') sessaoId: string) {
    const sessao = await this.sessaoRepo.findOneBy({ id: sessaoId });
    if (!sessao) return [];

    const itens = await this.itemRepo.find({
      where: { 
        licitacao_id: sessao.licitacao_id, 
        status_disputa: StatusDisputaItem.EM_DISPUTA 
      },
      order: { numero_item: 'ASC' }
    });

    const resultado = await Promise.all(itens.map(async (item) => {
      // Buscar melhor lance
      const melhorLance = await this.lanceRepo.findOne({
        where: { item_id: item.id, cancelado: false },
        order: { valor: 'ASC' }
      });

      // Contar lances
      const totalLances = await this.lanceRepo.count({
        where: { item_id: item.id, cancelado: false }
      });

      // Calcular tempo restante usando a mesma lógica do disputa.service.ts
      const agora = Date.now();
      const tempoInicialMs = sessao.tempo_inatividade_minutos * 60 * 1000;
      const tempoProrrogacaoMs = sessao.tempo_prorrogacao_minutos * 60 * 1000;
      
      const inicioDisputa = item.disputa_iniciada_em ? new Date(item.disputa_iniciada_em).getTime() : agora;
      const ultimoLanceEm = item.ultimo_lance_em ? new Date(item.ultimo_lance_em).getTime() : inicioDisputa;
      
      const tempoDecorrido = agora - inicioDisputa;
      const tempoDesdeUltimoLance = agora - ultimoLanceEm;
      
      // Momento em que o último lance foi dado (em relação ao início)
      const momentoUltimoLance = ultimoLanceEm - inicioDisputa;
      
      // Verifica se houve lance nos últimos 2min do tempo inicial
      const lanceNosUltimos2minDoInicial = momentoUltimoLance >= (tempoInicialMs - tempoProrrogacaoMs);

      let tempoRestante = 0;
      let emProrrogacao = false;
      
      // Se ainda no tempo inicial E não houve lance nos últimos 2min
      if (tempoDecorrido < tempoInicialMs && !lanceNosUltimos2minDoInicial) {
        tempoRestante = Math.max(0, Math.floor((tempoInicialMs - tempoDecorrido) / 1000));
        emProrrogacao = false;
      }
      // Se houve lance nos últimos 2min do tempo inicial OU já passou o tempo inicial
      else if (tempoDesdeUltimoLance < tempoProrrogacaoMs) {
        tempoRestante = Math.max(0, Math.floor((tempoProrrogacaoMs - tempoDesdeUltimoLance) / 1000));
        emProrrogacao = true;
      }

      return {
        id: item.id,
        numero: item.numero_item,
        descricao: item.descricao_resumida || item.descricao_detalhada || '',
        tempo_restante: tempoRestante,
        em_prorrogacao: emProrrogacao,
        ultimo_lance_em: item.ultimo_lance_em,
        total_lances: totalLances,
        melhor_lance_valor: melhorLance ? parseFloat(String(melhorLance.valor)) : 0,
        melhor_lance_fornecedor: melhorLance?.fornecedor_nome || 'Sem lances',
      };
    }));

    return resultado;
  }

  /**
   * Encerra um item forçadamente (apenas superadmin/suporte)
   * Deve ser usado apenas em casos de erro do sistema
   */
  @Post('encerrar-item-forcado')
  async encerrarItemForcado(
    @Body() body: { sessaoId: string; itemId: string; justificativa: string }
  ) {
    // TODO: Verificar se usuário é superadmin ou suporte
    // Por enquanto, apenas validamos a justificativa

    if (!body.justificativa || body.justificativa.trim().length < 20) {
      throw new ForbiddenException('Justificativa deve ter pelo menos 20 caracteres');
    }

    const sessao = await this.sessaoRepo.findOneBy({ id: body.sessaoId });
    if (!sessao) {
      throw new ForbiddenException('Sessão não encontrada');
    }

    const item = await this.itemRepo.findOneBy({ id: body.itemId });
    if (!item) {
      throw new ForbiddenException('Item não encontrado');
    }

    if (item.status_disputa !== StatusDisputaItem.EM_DISPUTA) {
      throw new ForbiddenException('Item não está em disputa');
    }

    // Buscar melhor lance para definir vencedor
    const melhorLance = await this.lanceRepo.findOne({
      where: { item_id: item.id, cancelado: false },
      order: { valor: 'ASC' }
    });

    // Atualizar item
    await this.itemRepo.update(item.id, {
      status_disputa: StatusDisputaItem.ENCERRADO,
      melhor_lance_valor: melhorLance ? melhorLance.valor : undefined,
      melhor_lance_fornecedor_id: melhorLance?.fornecedor_id,
    });

    // Registrar evento de auditoria
    const evento = this.eventoRepo.create({
      sessao_id: body.sessaoId,
      tipo: TipoEvento.LANCE_REGISTRADO,
      descricao: `[AUDITORIA] Item ${item.numero_item} encerrado forçadamente por suporte técnico. Justificativa: ${body.justificativa}`,
      item_id: item.id,
      usuario_nome: 'SUPORTE_TECNICO',
      is_sistema: true,
    });
    await this.eventoRepo.save(evento);

    // Notificar sala de disputa via WebSocket
    const vencedor = melhorLance ? {
      fornecedorId: melhorLance.fornecedor_id,
      fornecedorNome: melhorLance.fornecedor_nome,
      valor: parseFloat(String(melhorLance.valor)),
    } : null;

    // Buscar itens atualizados
    const itens = await this.disputaService.getItensPorStatus(body.sessaoId);

    // Emitir evento para todos os clientes na sala
    this.disputaGateway.server.to(`sessao:${body.sessaoId}`).emit('item_encerrado', {
      itemId: item.id,
      vencedor,
      itens,
      motivo: 'ENCERRAMENTO_FORCADO',
      justificativa: body.justificativa,
    });

    return {
      success: true,
      message: `Item ${item.numero_item} encerrado com sucesso`,
      vencedor,
    };
  }

  // ============================================================================
  // CONTROLE DE CONFIGURAÇÕES DA SESSÃO
  // ============================================================================

  /**
   * Busca configurações de uma sessão específica
   */
  @Get('sessao/:sessaoId/config')
  async getConfigSessao(@Param('sessaoId') sessaoId: string) {
    const sessao = await this.sessaoRepo.findOne({
      where: { id: sessaoId },
      relations: ['licitacao', 'licitacao.orgao'],
    });

    if (!sessao) {
      throw new NotFoundException('Sessão não encontrada');
    }

    return {
      sessaoId: sessao.id,
      status: sessao.status,
      configuracoes: {
        anonimizacao_ativa: sessao.anonimizacao_ativa,
        chat_desabilitado: sessao.chat_desabilitado,
        tempo_inatividade_minutos: sessao.tempo_inatividade_minutos,
        tempo_prorrogacao_minutos: sessao.tempo_prorrogacao_minutos,
        modo_aberto: sessao.modo_aberto,
        disputa_por_item: sessao.disputa_por_item,
      },
      orgao: sessao.licitacao?.orgao ? {
        id: sessao.licitacao.orgao.id,
        nome: sessao.licitacao.orgao.nome,
        anonimizacao_padrao: sessao.licitacao.orgao.anonimizacao_disputa,
      } : null,
    };
  }

  /**
   * Altera configuração de anonimização de uma sessão
   * Requer justificativa para auditoria
   */
  @Put('sessao/:sessaoId/anonimizacao')
  async toggleAnonimizacao(
    @Param('sessaoId') sessaoId: string,
    @Body() body: { ativa: boolean; justificativa: string; usuarioId?: string },
  ) {
    const sessao = await this.sessaoRepo.findOne({ where: { id: sessaoId } });
    if (!sessao) {
      throw new NotFoundException('Sessão não encontrada');
    }

    const estadoAnterior = sessao.anonimizacao_ativa;
    
    // Atualizar configuração
    await this.anonimizacaoService.toggleAnonimizacao(
      sessaoId,
      body.ativa,
      body.usuarioId || 'ADMIN',
      body.justificativa,
    );

    // Registrar evento de auditoria
    const evento = this.eventoRepo.create({
      sessao_id: sessaoId,
      tipo: TipoEvento.LANCE_REGISTRADO, // TODO: Criar tipo específico
      descricao: `[AUDITORIA] Anonimização ${body.ativa ? 'ATIVADA' : 'DESATIVADA'} por ${body.usuarioId || 'ADMIN'}. Estado anterior: ${estadoAnterior}. Justificativa: ${body.justificativa}`,
      usuario_nome: body.usuarioId || 'ADMIN',
      is_sistema: true,
    });
    await this.eventoRepo.save(evento);

    // Notificar clientes na sala para recarregar dados
    this.disputaGateway.server.to(`sessao:${sessaoId}`).emit('config_alterada', {
      tipo: 'anonimizacao',
      valor: body.ativa,
    });

    return {
      success: true,
      message: `Anonimização ${body.ativa ? 'ativada' : 'desativada'} com sucesso`,
      estadoAnterior,
      estadoAtual: body.ativa,
    };
  }

  /**
   * Altera configuração de chat de uma sessão
   */
  @Put('sessao/:sessaoId/chat')
  async toggleChat(
    @Param('sessaoId') sessaoId: string,
    @Body() body: { desabilitado: boolean; justificativa?: string },
  ) {
    const sessao = await this.sessaoRepo.findOne({ where: { id: sessaoId } });
    if (!sessao) {
      throw new NotFoundException('Sessão não encontrada');
    }

    await this.sessaoRepo.update(sessaoId, {
      chat_desabilitado: body.desabilitado,
    });

    // Notificar clientes
    this.disputaGateway.server.to(`sessao:${sessaoId}`).emit('config_alterada', {
      tipo: 'chat',
      valor: body.desabilitado,
    });

    return {
      success: true,
      message: `Chat ${body.desabilitado ? 'desabilitado' : 'habilitado'} com sucesso`,
    };
  }

  /**
   * Lista todas as configurações disponíveis para controle
   */
  @Get('configuracoes-disponiveis')
  async getConfiguracoesDisponiveis() {
    return {
      configuracoes: [
        {
          id: 'anonimizacao',
          nome: 'Anonimização de Fornecedores',
          descricao: 'Oculta identidade dos fornecedores durante a disputa (Lei 14.133/2021)',
          tipo: 'boolean',
          padrao: true,
          requerJustificativa: true,
        },
        {
          id: 'chat',
          nome: 'Chat da Sessão',
          descricao: 'Habilita/desabilita chat entre pregoeiro e fornecedores',
          tipo: 'boolean',
          padrao: true,
          requerJustificativa: false,
        },
        {
          id: 'tempo_inatividade',
          nome: 'Tempo de Inatividade',
          descricao: 'Tempo inicial da disputa em minutos',
          tipo: 'number',
          padrao: 10,
          min: 5,
          max: 30,
        },
        {
          id: 'tempo_prorrogacao',
          nome: 'Tempo de Prorrogação',
          descricao: 'Tempo de prorrogação automática em minutos',
          tipo: 'number',
          padrao: 2,
          min: 1,
          max: 5,
        },
      ],
    };
  }
}
