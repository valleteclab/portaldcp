import { Injectable, NotFoundException, BadRequestException, Logger, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Requisicao, StatusRequisicao, TipoRequisicao, PrioridadeRequisicao } from './entities/requisicao.entity';
import { ItemRequisicao, StatusItemRequisicao } from './entities/item-requisicao.entity';
import { ItemContrato } from './entities/item-contrato.entity';
import { OrdemFornecimento } from './entities/ordem-fornecimento.entity';
import { ItemContratoService } from './item-contrato.service';
import { ConfiguracaoAprovacaoService } from './configuracao-aprovacao.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { OrdemFornecimentoService } from './ordem-fornecimento.service';
import { RecebimentoService } from './recebimento.service';
import { GerarOrdemDto } from './dto/ordem-fornecimento.dto';
import { Recebimento, StatusRecebimento } from './entities/recebimento.entity';
import { StatusOrdemFornecimento } from './entities/ordem-fornecimento.entity';
import { 
  CriarRequisicaoDto, 
  AtualizarRequisicaoDto, 
  AutorizarRequisicaoDto,
  NegarRequisicaoDto 
} from './dto/criar-requisicao.dto';

@Injectable()
export class RequisicaoService {
  private readonly logger = new Logger(RequisicaoService.name);

  constructor(
    @InjectRepository(Requisicao)
    private readonly requisicaoRepository: Repository<Requisicao>,
    @InjectRepository(ItemRequisicao)
    private readonly itemRequisicaoRepository: Repository<ItemRequisicao>,
    @InjectRepository(ItemContrato)
    private readonly itemContratoRepository: Repository<ItemContrato>,
    @InjectRepository(OrdemFornecimento)
    private readonly ordemFornecimentoRepository: Repository<OrdemFornecimento>,
    @InjectRepository(Recebimento)
    private readonly recebimentoRepository: Repository<Recebimento>,
    private readonly itemContratoService: ItemContratoService,
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => ConfiguracaoAprovacaoService))
    private readonly configAprovacaoService: ConfiguracaoAprovacaoService,
    @Inject(forwardRef(() => NotificacoesService))
    private readonly notificacoesService: NotificacoesService,
    @Inject(forwardRef(() => OrdemFornecimentoService))
    private readonly ordemFornecimentoService: OrdemFornecimentoService,
    @Inject(forwardRef(() => RecebimentoService))
    private readonly recebimentoService: RecebimentoService,
  ) {}

  // ============================================================================
  // CRIAR REQUISIÇÃO
  // ============================================================================

  async criar(
    orgaoId: string, 
    dto: CriarRequisicaoDto,
    usuarioId: string,
    usuarioNome: string,
    usuarioEmail?: string,
  ): Promise<Requisicao> {
    // Gera número da requisição
    const ano = new Date().getFullYear();
    const ultimaRequisicao = await this.requisicaoRepository.findOne({
      where: { orgao_id: orgaoId, ano },
      order: { sequencial: 'DESC' },
    });

    const sequencial = ultimaRequisicao ? ultimaRequisicao.sequencial + 1 : 1;
    const numero = `REQ-${String(sequencial).padStart(4, '0')}/${ano}`;

    // Valida itens do contrato se houver contrato vinculado
    let valorTotalEstimado = 0;
    const itensParaCriar: Partial<ItemRequisicao>[] = [];

    for (const itemDto of dto.itens) {
      let valorUnitario = itemDto.valor_unitario || 0;
      let unidadeMedida = itemDto.unidade_medida;

      // Se tem item_contrato_id, busca informações do item do contrato
      if (itemDto.item_contrato_id) {
        const itemContrato = await this.itemContratoRepository.findOne({
          where: { id: itemDto.item_contrato_id },
        });

        if (!itemContrato) {
          throw new BadRequestException(
            `Item do contrato ${itemDto.item_contrato_id} não encontrado`
          );
        }

        // Verifica se pertence ao contrato da requisição
        if (dto.contrato_id && itemContrato.contrato_id !== dto.contrato_id) {
          throw new BadRequestException(
            `Item ${itemDto.item_contrato_id} não pertence ao contrato ${dto.contrato_id}`
          );
        }

        // Verifica saldo disponível (apenas aviso, não bloqueia ainda)
        if (!itemContrato.temSaldoSuficiente(itemDto.quantidade_solicitada)) {
          this.logger.warn(
            `Saldo insuficiente para item ${itemContrato.descricao}. ` +
            `Disponível: ${itemContrato.saldo_disponivel}, Solicitado: ${itemDto.quantidade_solicitada}`
          );
        }

        valorUnitario = Number(itemContrato.valor_unitario);
        unidadeMedida = itemContrato.unidade_medida;
      }

      const valorTotalItem = itemDto.quantidade_solicitada * valorUnitario;
      valorTotalEstimado += valorTotalItem;

      itensParaCriar.push({
        numero_item: itemDto.numero_item,
        item_contrato_id: itemDto.item_contrato_id,
        codigo_catalogo: itemDto.codigo_catalogo,
        descricao: itemDto.descricao,
        unidade_medida: unidadeMedida,
        quantidade_solicitada: itemDto.quantidade_solicitada,
        valor_unitario: valorUnitario,
        valor_total_estimado: valorTotalItem,
        observacoes: itemDto.observacoes,
        status: StatusItemRequisicao.PENDENTE,
      });
    }

    // Cria requisição
    const novaRequisicao = new Requisicao();
    novaRequisicao.orgao_id = orgaoId;
    novaRequisicao.contrato_id = dto.contrato_id || null;
    novaRequisicao.numero = numero;
    novaRequisicao.ano = ano;
    novaRequisicao.sequencial = sequencial;
    novaRequisicao.tipo = dto.tipo;
    novaRequisicao.setor_solicitante = dto.setor_solicitante;
    novaRequisicao.codigo_setor = dto.codigo_setor || null;
    novaRequisicao.local_entrega = dto.local_entrega || null;
    novaRequisicao.justificativa = dto.justificativa;
    novaRequisicao.prioridade = dto.prioridade || PrioridadeRequisicao.NORMAL;
    novaRequisicao.data_necessidade = dto.data_necessidade ? new Date(dto.data_necessidade) : null;
    novaRequisicao.usuario_solicitante_id = usuarioId;
    novaRequisicao.usuario_solicitante_nome = usuarioNome;
    novaRequisicao.usuario_solicitante_email = usuarioEmail || null;
    novaRequisicao.data_solicitacao = new Date();
    novaRequisicao.status = StatusRequisicao.RASCUNHO;
    novaRequisicao.valor_total_estimado = valorTotalEstimado;
    novaRequisicao.saldo_reservado = false;
    novaRequisicao.observacoes = dto.observacoes || null;

    const requisicaoSalva = await this.requisicaoRepository.save(novaRequisicao);

    // Cria itens da requisição
    const itensParaSalvar: ItemRequisicao[] = [];
    for (const item of itensParaCriar) {
      const novoItem = new ItemRequisicao();
      Object.assign(novoItem, item);
      novoItem.requisicao_id = requisicaoSalva.id;
      itensParaSalvar.push(novoItem);
    }

    await this.itemRequisicaoRepository.save(itensParaSalvar);

    this.logger.log(`Requisição ${numero} criada com ${itensParaSalvar.length} itens`);

    return this.findOne(requisicaoSalva.id);
  }

  // ============================================================================
  // ENVIAR PARA AUTORIZAÇÃO
  // ============================================================================

  async enviarParaAutorizacao(id: string, usuariosOrgao?: { id: string; perfil: string; email?: string }[]): Promise<Requisicao> {
    const requisicao = await this.findOne(id);

    if (requisicao.status !== StatusRequisicao.RASCUNHO) {
      throw new BadRequestException(
        `Requisição não pode ser enviada para autorização. Status atual: ${requisicao.status}`
      );
    }

    if (!requisicao.itens || requisicao.itens.length === 0) {
      throw new BadRequestException('Requisição deve ter pelo menos um item');
    }

    requisicao.status = StatusRequisicao.AGUARDANDO_AUTORIZACAO;
    const saved = await this.requisicaoRepository.save(requisicao);

    // Notifica aprovadores
    this.logger.log(`[NOTIFICAÇÃO] Enviando requisição ${requisicao.numero} para aprovação. Usuários do órgão recebidos: ${usuariosOrgao?.length || 0}`);
    this.logger.log(`[NOTIFICAÇÃO] IDs dos usuários recebidos: ${usuariosOrgao?.map(u => u.id).join(', ') || 'nenhum'}`);
    
    if (usuariosOrgao && usuariosOrgao.length > 0) {
      try {
        const aprovadores = await this.configAprovacaoService.listarAprovadores(
          requisicao.orgao_id,
          Number(requisicao.valor_total_estimado),
          usuariosOrgao,
          requisicao.usuario_solicitante_id,
        );

        this.logger.log(`[NOTIFICAÇÃO] Aprovadores elegíveis encontrados: ${aprovadores.length}`);
        this.logger.log(`[NOTIFICAÇÃO] IDs dos aprovadores: ${aprovadores.map(a => a.id).join(', ')}`);

        if (aprovadores.length > 0) {
          this.logger.log(`[NOTIFICAÇÃO] Criando notificações para ${aprovadores.length} aprovadores`);
          await this.notificacoesService.notificarNovaRequisicao(
            requisicao.orgao_id,
            requisicao.numero,
            requisicao.id,
            requisicao.usuario_solicitante_nome,
            Number(requisicao.valor_total_estimado),
            aprovadores,
          );
          this.logger.log(`[NOTIFICAÇÃO] Notificações criadas com sucesso para ${aprovadores.length} aprovadores da requisição ${requisicao.numero}`);
        } else {
          this.logger.warn(`[NOTIFICAÇÃO] ⚠️ Nenhum aprovador elegível encontrado para requisição ${requisicao.numero}. Verifique configuração de aprovação.`);
        }
      } catch (notifError) {
        // Não falha a operação se a notificação falhar, mas loga o erro completo
        this.logger.error(`[NOTIFICAÇÃO] ❌ Erro ao enviar notificação para aprovadores: ${notifError.message}`, notifError.stack);
      }
    } else {
      this.logger.warn(`[NOTIFICAÇÃO] ⚠️ Nenhum usuário do órgão fornecido para notificação da requisição ${requisicao.numero}. Verifique se há usuários com pode_aprovar_requisicoes=true.`);
    }

    return saved;
  }

  // ============================================================================
  // AUTORIZAR REQUISIÇÃO (RESERVA SALDO)
  // ============================================================================

  /**
   * Autoriza uma requisição e reserva saldo do contrato
   * 
   * IMPORTANTE: Ao autorizar, o saldo é reservado no contrato.
   * Se a requisição for negada/cancelada depois, o saldo é liberado.
   */
  async autorizar(
    id: string,
    dto: AutorizarRequisicaoDto,
    autorizadorId: string,
    autorizadorNome: string,
    autorizadorPerfil?: string,
  ): Promise<Requisicao> {
    const requisicao = await this.findOne(id);

    if (requisicao.status !== StatusRequisicao.AGUARDANDO_AUTORIZACAO) {
      throw new BadRequestException(
        `Requisição não pode ser autorizada. Status atual: ${requisicao.status}`
      );
    }

    // Verifica permissão de aprovação
    const permissao = await this.configAprovacaoService.verificarPermissaoAprovacao(
      requisicao.orgao_id,
      autorizadorId,
      autorizadorPerfil || 'USUARIO',
      requisicao.usuario_solicitante_id,
      Number(requisicao.valor_total_estimado),
    );

    if (!permissao.pode_aprovar) {
      throw new ForbiddenException(permissao.motivo || 'Você não tem permissão para aprovar esta requisição');
    }

    // Verifica se exige justificativa
    if (permissao.configuracao?.exigir_justificativa_aprovacao && !dto.observacao?.trim()) {
      throw new BadRequestException('É obrigatório informar uma justificativa para aprovar esta requisição');
    }

    // Inicia transação para garantir consistência
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Processa ajustes de quantidade se houver
      if (dto.ajustes_quantidade) {
        for (const [itemId, quantidade] of Object.entries(dto.ajustes_quantidade)) {
          const item = requisicao.itens.find(i => i.id === itemId);
          if (item) {
            item.quantidade_autorizada = quantidade;
            item.motivo_ajuste = `Quantidade ajustada pelo autorizador de ${item.quantidade_solicitada} para ${quantidade}`;
            await queryRunner.manager.save(item);
          }
        }
      }

      // Reserva saldo no contrato para cada item
      for (const item of requisicao.itens) {
        if (item.item_contrato_id) {
          const quantidadeAReservar = item.quantidade_autorizada ?? item.quantidade_solicitada;
          
          // Busca item do contrato com lock
          const itemContrato = await queryRunner.manager.findOne(ItemContrato, {
            where: { id: item.item_contrato_id },
            lock: { mode: 'pessimistic_write' },
          });

          if (!itemContrato) {
            throw new BadRequestException(
              `Item do contrato ${item.item_contrato_id} não encontrado`
            );
          }

          // Verifica saldo disponível
          const saldoDisponivel = Number(itemContrato.quantidade_contratada) - 
                                  Number(itemContrato.quantidade_empenhada) - 
                                  Number(itemContrato.quantidade_entregue);

          if (saldoDisponivel < quantidadeAReservar) {
            throw new BadRequestException(
              `Saldo insuficiente para item "${item.descricao}". ` +
              `Disponível: ${saldoDisponivel}, Solicitado: ${quantidadeAReservar}`
            );
          }

          // Reserva saldo
          itemContrato.quantidade_empenhada = Number(itemContrato.quantidade_empenhada) + quantidadeAReservar;
          itemContrato.saldo_disponivel = Number(itemContrato.quantidade_contratada) - 
                                          Number(itemContrato.quantidade_empenhada) - 
                                          Number(itemContrato.quantidade_entregue);

          await queryRunner.manager.save(itemContrato);

          // Atualiza status do item
          item.status = StatusItemRequisicao.RESERVADO;
          if (!item.quantidade_autorizada) {
            item.quantidade_autorizada = item.quantidade_solicitada;
          }
          await queryRunner.manager.save(item);

          this.logger.log(
            `Saldo reservado: Item ${itemContrato.descricao}, ` +
            `Quantidade: ${quantidadeAReservar}, ` +
            `Novo saldo: ${itemContrato.saldo_disponivel}`
          );
        }
      }

      // Atualiza requisição
      requisicao.status = StatusRequisicao.AUTORIZADA;
      requisicao.usuario_autorizador_id = autorizadorId;
      requisicao.usuario_autorizador_nome = autorizadorNome;
      requisicao.data_autorizacao = new Date();
      requisicao.observacao_autorizador = dto.observacao || null;
      requisicao.saldo_reservado = true;

      await queryRunner.manager.save(requisicao);
      await queryRunner.commitTransaction();

      this.logger.log(`Requisição ${requisicao.numero} autorizada por ${autorizadorNome}`);

      // Gera ordem de fornecimento automaticamente após aprovação
      try {
        if (requisicao.contrato_id) {
          const ordemGerada = await this.ordemFornecimentoService.gerarOrdem(
            {
              requisicao_id: requisicao.id,
              local_entrega: requisicao.local_entrega || undefined,
              data_entrega_prevista: undefined,
              prazo_entrega_dias: undefined,
              observacoes: undefined,
            },
            autorizadorId,
            autorizadorNome,
          );
          this.logger.log(`Ordem de fornecimento ${ordemGerada.numero} gerada automaticamente para requisição ${requisicao.numero}`);
        }
      } catch (ordemError) {
        // Não falha a operação se a ordem não puder ser gerada
        this.logger.error(`Erro ao gerar ordem de fornecimento automaticamente: ${ordemError.message}`, ordemError.stack);
      }

      // Notifica o solicitante sobre a aprovação
      try {
        await this.notificacoesService.notificarResultadoRequisicao(
          requisicao.orgao_id,
          requisicao.numero,
          requisicao.id,
          { 
            id: requisicao.usuario_solicitante_id, 
            email: requisicao.usuario_solicitante_email || undefined 
          },
          true, // aprovada
          autorizadorNome,
          dto.observacao,
        );
      } catch (notifError) {
        // Não falha a operação se a notificação falhar
        this.logger.warn(`Erro ao enviar notificação de aprovação: ${notifError.message}`);
      }

      return this.findOne(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Erro ao autorizar requisição ${id}: ${error.message}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ============================================================================
  // NEGAR REQUISIÇÃO (LIBERA SALDO SE HAVIA RESERVA)
  // ============================================================================

  /**
   * Nega uma requisição
   * Se já tinha saldo reservado (improvável, mas possível), libera
   */
  async negar(
    id: string,
    dto: NegarRequisicaoDto,
    autorizadorId: string,
    autorizadorNome: string,
    autorizadorPerfil?: string,
  ): Promise<Requisicao> {
    const requisicao = await this.findOne(id);

    if (requisicao.status !== StatusRequisicao.AGUARDANDO_AUTORIZACAO) {
      throw new BadRequestException(
        `Requisição não pode ser negada. Status atual: ${requisicao.status}`
      );
    }

    // Verifica permissão de aprovação/negação
    const permissao = await this.configAprovacaoService.verificarPermissaoAprovacao(
      requisicao.orgao_id,
      autorizadorId,
      autorizadorPerfil || 'USUARIO',
      requisicao.usuario_solicitante_id,
      Number(requisicao.valor_total_estimado),
    );

    if (!permissao.pode_aprovar) {
      throw new ForbiddenException(permissao.motivo || 'Você não tem permissão para negar esta requisição');
    }

    // Verifica se exige justificativa
    if (!dto.motivo?.trim()) {
      throw new BadRequestException('É obrigatório informar o motivo da negativa');
    }

    requisicao.status = StatusRequisicao.NEGADA;
    requisicao.usuario_autorizador_id = autorizadorId;
    requisicao.usuario_autorizador_nome = autorizadorNome;
    requisicao.data_autorizacao = new Date();
    requisicao.observacao_autorizador = dto.motivo;

    this.logger.log(`Requisição ${requisicao.numero} negada por ${autorizadorNome}: ${dto.motivo}`);

    const saved = await this.requisicaoRepository.save(requisicao);

    // Notifica o solicitante sobre a negativa
    try {
      await this.notificacoesService.notificarResultadoRequisicao(
        requisicao.orgao_id,
        requisicao.numero,
        requisicao.id,
        { 
          id: requisicao.usuario_solicitante_id, 
          email: requisicao.usuario_solicitante_email || undefined 
        },
        false, // negada
        autorizadorNome,
        dto.motivo,
      );
    } catch (notifError) {
      // Não falha a operação se a notificação falhar
      this.logger.warn(`Erro ao enviar notificação de negativa: ${notifError.message}`);
    }

    return saved;
  }

  // ============================================================================
  // CANCELAR REQUISIÇÃO (LIBERA SALDO)
  // ============================================================================

  /**
   * Retorna informações sobre o que será excluído ao cancelar/excluir uma requisição
   */
  async obterInfoExclusao(id: string): Promise<{
    temOrdem: boolean;
    ordemNumero?: string;
    recebimentos: Array<{ id: string; numero: string; status: string; baixaRealizada: boolean }>;
    saldoReservado: boolean;
  }> {
    const requisicao = await this.findOne(id);

    const info = {
      temOrdem: false,
      ordemNumero: undefined as string | undefined,
      recebimentos: [] as Array<{ id: string; numero: string; status: string; baixaRealizada: boolean }>,
      saldoReservado: requisicao.saldo_reservado || false,
    };

    if (requisicao.ordem_fornecimento_id) {
      const ordem = await this.ordemFornecimentoRepository.findOne({
        where: { id: requisicao.ordem_fornecimento_id },
      });

      if (ordem) {
        info.temOrdem = true;
        info.ordemNumero = ordem.numero;

        // Busca recebimentos relacionados
        const recebimentos = await this.recebimentoRepository.find({
          where: { ordem_fornecimento_id: ordem.id },
        });

        info.recebimentos = recebimentos.map(rec => ({
          id: rec.id,
          numero: rec.numero,
          status: rec.status,
          baixaRealizada: rec.baixa_realizada || false,
        }));
      }
    }

    return info;
  }

  /**
   * Cancela uma requisição e libera saldo reservado
   * 
   * IMPORTANTE: Se a requisição tinha ordem de fornecimento gerada:
   * - Estorna recebimentos ACEITOS (libera saldo entregue)
   * - Exclui recebimentos PENDENTES/REJEITADOS
   * - Exclui a ordem de fornecimento
   * - Libera saldo reservado da requisição
   * 
   * Permite cancelar:
   * - RASCUNHO
   * - AGUARDANDO_AUTORIZACAO
   * - AUTORIZADA (requer permissão especial)
   * - ORDEM_GERADA (requer permissão especial, exclui ordem e recebimentos)
   * - NEGADA
   * 
   * NÃO permite cancelar:
   * - ATENDIDA_PARCIAL / ATENDIDA (deve estornar recebimento primeiro manualmente)
   */
  async cancelar(id: string, motivo: string, requerPermissaoEspecial: boolean = false): Promise<Requisicao> {
    const requisicao = await this.findOne(id);

    // Status que NUNCA podem ser cancelados (já entregues)
    const statusNaoCancelavel = [
      StatusRequisicao.ATENDIDA_PARCIAL,
      StatusRequisicao.ATENDIDA,
    ];

    if (statusNaoCancelavel.includes(requisicao.status)) {
      throw new BadRequestException(
        `Requisição não pode ser cancelada pois já foi atendida. ` +
        `Status atual: ${requisicao.status}. ` +
        `Para reverter, é necessário estornar o recebimento primeiro.`
      );
    }

    // Status que requerem permissão especial para cancelar
    const statusRequerPermissao = [
      StatusRequisicao.AUTORIZADA,
      StatusRequisicao.ORDEM_GERADA,
    ];

    if (statusRequerPermissao.includes(requisicao.status) && !requerPermissaoEspecial) {
      throw new BadRequestException(
        `Requisição ${requisicao.status} requer permissão especial para cancelar. ` +
        `Apenas usuários autorizados podem cancelar requisições aprovadas.`
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Se tem ordem de fornecimento, exclui ordem e recebimentos em cascata
      if (requisicao.ordem_fornecimento_id) {
        const ordem = await queryRunner.manager.findOne(OrdemFornecimento, {
          where: { id: requisicao.ordem_fornecimento_id },
        });

        if (ordem) {
          // Busca recebimentos relacionados
          const recebimentos = await queryRunner.manager.find(Recebimento, {
            where: { ordem_fornecimento_id: ordem.id },
          });

          // Estorna recebimentos ACEITOS primeiro (libera saldo entregue)
          for (const recebimento of recebimentos) {
            if (recebimento.status === StatusRecebimento.ACEITO || 
                recebimento.status === StatusRecebimento.ACEITO_PARCIAL) {
              // Estorna recebimento (libera saldo entregue no contrato)
              // Usa um ID de sistema e nome genérico para estorno automático
              await this.recebimentoService.estornar(
                recebimento.id,
                `Estorno automático devido ao cancelamento da requisição ${requisicao.numero}: ${motivo}`,
                'sistema',
                'Sistema'
              );
              this.logger.log(
                `Recebimento ${recebimento.numero} estornado automaticamente devido ao cancelamento da requisição ${requisicao.numero}`
              );
            } else if (
              recebimento.status === StatusRecebimento.PENDENTE ||
              recebimento.status === StatusRecebimento.REJEITADO
            ) {
              // Exclui recebimentos pendentes/rejeitados
              await queryRunner.manager.remove(recebimento);
              this.logger.log(
                `Recebimento ${recebimento.numero} excluído automaticamente devido ao cancelamento da requisição ${requisicao.numero}`
              );
            }
          }

          // Remove PDF da ordem se existir
          if (ordem.caminho_pdf) {
            try {
              const fs = require('fs');
              const path = require('path');
              const pdfPath = path.join(process.cwd(), ordem.caminho_pdf);
              if (fs.existsSync(pdfPath)) {
                fs.unlinkSync(pdfPath);
                this.logger.log(`PDF da ordem ${ordem.numero} removido`);
              }
            } catch (error) {
              this.logger.warn(`Erro ao remover PDF da ordem: ${error.message}`);
            }
          }

          // Exclui a ordem
          await queryRunner.manager.remove(ordem);
          this.logger.log(
            `Ordem de fornecimento ${ordem.numero} excluída automaticamente devido ao cancelamento da requisição ${requisicao.numero}`
          );

          // Remove referência da requisição
          requisicao.ordem_fornecimento_id = null;
        }
      }

      // Se tinha saldo reservado, libera
      if (requisicao.saldo_reservado) {
        for (const item of requisicao.itens) {
          if (item.item_contrato_id && item.status === StatusItemRequisicao.RESERVADO) {
            const quantidadeALiberar = item.quantidade_autorizada ?? item.quantidade_solicitada;

            // Busca item do contrato com lock
            const itemContrato = await queryRunner.manager.findOne(ItemContrato, {
              where: { id: item.item_contrato_id },
              lock: { mode: 'pessimistic_write' },
            });

            if (itemContrato) {
              // Libera saldo
              itemContrato.quantidade_empenhada = Math.max(
                0,
                Number(itemContrato.quantidade_empenhada) - quantidadeALiberar
              );
              itemContrato.saldo_disponivel = Number(itemContrato.quantidade_contratada) - 
                                              Number(itemContrato.quantidade_empenhada) - 
                                              Number(itemContrato.quantidade_entregue);

              await queryRunner.manager.save(itemContrato);

              this.logger.log(
                `Saldo liberado (cancelamento): Item ${itemContrato.descricao}, ` +
                `Quantidade: ${quantidadeALiberar}, ` +
                `Novo saldo: ${itemContrato.saldo_disponivel}`
              );
            }

            // Atualiza status do item
            item.status = StatusItemRequisicao.CANCELADO;
            await queryRunner.manager.save(item);
          }
        }
      }

      // Atualiza requisição
      // Salva o status anterior para permitir reativação
      requisicao.status_anterior_cancelamento = requisicao.status;
      requisicao.status = StatusRequisicao.CANCELADA;
      requisicao.saldo_reservado = false;
      requisicao.observacoes = `${requisicao.observacoes || ''}\n[Cancelada] ${motivo}`.trim();

      await queryRunner.manager.save(requisicao);
      await queryRunner.commitTransaction();

      this.logger.log(
        `Requisição ${requisicao.numero} cancelada. ` +
        `Ordem e recebimentos relacionados foram excluídos. Saldo liberado.`
      );

      return this.findOne(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Erro ao cancelar requisição ${requisicao.numero}: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ============================================================================
  // REATIVAR REQUISIÇÃO CANCELADA
  // ============================================================================

  /**
   * Reativa uma requisição cancelada, voltando para o status anterior
   * 
   * IMPORTANTE: 
   * - Só permite reativar requisições em CANCELADA
   * - Se tinha ordem de fornecimento quando foi cancelada, volta para AUTORIZADA (ordem foi excluída)
   * - Se estava AUTORIZADA, re-reserva o saldo no contrato (verifica disponibilidade primeiro)
   * - Se estava AGUARDANDO_AUTORIZACAO, volta para esse status
   * - Se estava RASCUNHO, volta para RASCUNHO
   * - Se estava NEGADA, volta para AGUARDANDO_AUTORIZACAO (pode tentar aprovar novamente)
   * 
   * NÃO permite reativar se:
   * - Não está em CANCELADA
   * - Não tem status_anterior_cancelamento registrado
   * - Estava AUTORIZADA mas não há mais saldo disponível no contrato
   */
  async reativar(id: string, motivo: string): Promise<Requisicao> {
    const requisicao = await this.findOne(id);

    // Só permite reativar se estiver CANCELADA
    if (requisicao.status !== StatusRequisicao.CANCELADA) {
      throw new BadRequestException(
        `Requisição não pode ser reativada. Status atual: ${requisicao.status}. ` +
        `Apenas requisições canceladas podem ser reativadas.`
      );
    }

    // Verifica se tem status anterior registrado
    if (!requisicao.status_anterior_cancelamento) {
      throw new BadRequestException(
        'Não foi possível determinar o status anterior desta requisição. ' +
        'Reativação não é possível sem essa informação.'
      );
    }

    const statusAnterior = requisicao.status_anterior_cancelamento;
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Se estava AUTORIZADA ou ORDEM_GERADA, precisa re-reservar saldo
      if (
        statusAnterior === StatusRequisicao.AUTORIZADA ||
        statusAnterior === StatusRequisicao.ORDEM_GERADA
      ) {
        // Verifica disponibilidade de saldo antes de re-reservar
        for (const item of requisicao.itens) {
          if (item.item_contrato_id) {
            const itemContrato = await queryRunner.manager.findOne(ItemContrato, {
              where: { id: item.item_contrato_id },
              lock: { mode: 'pessimistic_write' },
            });

            if (itemContrato) {
              const quantidadeASolicitar = item.quantidade_autorizada ?? item.quantidade_solicitada;
              const saldoDisponivel = Number(itemContrato.saldo_disponivel);

              if (saldoDisponivel < quantidadeASolicitar) {
                throw new BadRequestException(
                  `Não há saldo suficiente para reativar esta requisição. ` +
                  `Item: ${itemContrato.descricao}, ` +
                  `Saldo disponível: ${saldoDisponivel}, ` +
                  `Quantidade solicitada: ${quantidadeASolicitar}.`
                );
              }
            }
          }
        }

        // Re-reserva saldo
        for (const item of requisicao.itens) {
          if (item.item_contrato_id && item.status === StatusItemRequisicao.CANCELADO) {
            const quantidadeAReservar = item.quantidade_autorizada ?? item.quantidade_solicitada;

            const itemContrato = await queryRunner.manager.findOne(ItemContrato, {
              where: { id: item.item_contrato_id },
              lock: { mode: 'pessimistic_write' },
            });

            if (itemContrato) {
              // Re-reserva saldo
              itemContrato.quantidade_empenhada = 
                Number(itemContrato.quantidade_empenhada) + quantidadeAReservar;
              itemContrato.saldo_disponivel = 
                Number(itemContrato.quantidade_contratada) - 
                Number(itemContrato.quantidade_empenhada) - 
                Number(itemContrato.quantidade_entregue);

              await queryRunner.manager.save(itemContrato);

              this.logger.log(
                `Saldo re-reservado (reativação): Item ${itemContrato.descricao}, ` +
                `Quantidade: ${quantidadeAReservar}, ` +
                `Novo saldo: ${itemContrato.saldo_disponivel}`
              );
            }

            // Atualiza status do item
            item.status = StatusItemRequisicao.RESERVADO;
            await queryRunner.manager.save(item);
          }
        }

        requisicao.saldo_reservado = true;
      }

      // Define o novo status baseado no status anterior
      let novoStatus: StatusRequisicao;

      if (statusAnterior === StatusRequisicao.ORDEM_GERADA) {
        // Se tinha ordem, volta para AUTORIZADA (ordem foi excluída, precisa gerar nova)
        novoStatus = StatusRequisicao.AUTORIZADA;
        requisicao.ordem_fornecimento_id = null; // Garante que não há referência a ordem excluída
      } else if (statusAnterior === StatusRequisicao.NEGADA) {
        // Se estava negada, volta para aguardando aprovação (pode tentar aprovar novamente)
        novoStatus = StatusRequisicao.AGUARDANDO_AUTORIZACAO;
        // Limpa dados da autorização anterior
        requisicao.usuario_autorizador_id = null;
        requisicao.usuario_autorizador_nome = null;
        requisicao.data_autorizacao = null;
        requisicao.observacao_autorizador = null;
      } else {
        // Para outros status (RASCUNHO, AGUARDANDO_AUTORIZACAO, AUTORIZADA), volta para o mesmo status
        novoStatus = statusAnterior;
      }

      // Atualiza requisição
      requisicao.status = novoStatus;
      requisicao.status_anterior_cancelamento = null; // Limpa o status anterior
      requisicao.observacoes = `${requisicao.observacoes || ''}\n[Reativada] ${motivo}`.trim();

      await queryRunner.manager.save(requisicao);
      await queryRunner.commitTransaction();

      this.logger.log(
        `Requisição ${requisicao.numero} reativada. ` +
        `Status anterior: ${statusAnterior}, Novo status: ${novoStatus}. ` +
        (requisicao.saldo_reservado ? 'Saldo re-reservado.' : '')
      );

      return this.findOne(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Erro ao reativar requisição ${requisicao.numero}: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ============================================================================
  // CONSULTAS
  // ============================================================================

  async findAll(filtros: {
    orgaoId: string;
    status?: StatusRequisicao;
    contratoId?: string;
    setor?: string;
    dataInicio?: Date;
    dataFim?: Date;
  }): Promise<Requisicao[]> {
    const query = this.requisicaoRepository.createQueryBuilder('req')
      .leftJoinAndSelect('req.itens', 'itens')
      .leftJoinAndSelect('req.contrato', 'contrato')
      .leftJoinAndSelect('contrato.fornecedor', 'fornecedor')
      .where('req.orgao_id = :orgaoId', { orgaoId: filtros.orgaoId });

    if (filtros.status) {
      query.andWhere('req.status = :status', { status: filtros.status });
    }

    if (filtros.contratoId) {
      query.andWhere('req.contrato_id = :contratoId', { contratoId: filtros.contratoId });
    }

    if (filtros.setor) {
      query.andWhere('req.setor_solicitante ILIKE :setor', { setor: `%${filtros.setor}%` });
    }

    if (filtros.dataInicio) {
      query.andWhere('req.data_solicitacao >= :dataInicio', { dataInicio: filtros.dataInicio });
    }

    if (filtros.dataFim) {
      query.andWhere('req.data_solicitacao <= :dataFim', { dataFim: filtros.dataFim });
    }

    const requisicoes = await query.orderBy('req.created_at', 'DESC').getMany();
    
    // Carrega ordens de fornecimento relacionadas (opcional - não quebra se falhar)
    try {
      const ordemIds = requisicoes
        .filter(req => req.ordem_fornecimento_id)
        .map(req => req.ordem_fornecimento_id)
        .filter((id): id is string => id !== null && id !== undefined);
      
      if (ordemIds.length > 0) {
        const ordens = await this.ordemFornecimentoRepository.find({
          where: { id: In(ordemIds) },
          select: ['id', 'numero'],
        });
        
        const ordensMap = new Map(ordens.map(o => [o.id, { id: o.id, numero: o.numero }]));
        
        for (const req of requisicoes) {
          if (req.ordem_fornecimento_id && ordensMap.has(req.ordem_fornecimento_id)) {
            (req as any).ordem_fornecimento = ordensMap.get(req.ordem_fornecimento_id);
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Erro ao carregar ordens de fornecimento (não crítico): ${error.message}`);
      // Continua sem as ordens se houver erro - não quebra a listagem
    }
    
    return requisicoes;
  }

  async findOne(id: string): Promise<Requisicao> {
    const requisicao = await this.requisicaoRepository.findOne({
      where: { id },
      relations: ['itens', 'itens.item_contrato', 'contrato', 'contrato.fornecedor'],
    });

    if (!requisicao) {
      throw new NotFoundException('Requisição não encontrada');
    }

    return requisicao;
  }

  async findPendentesAutorizacao(orgaoId: string): Promise<Requisicao[]> {
    return this.requisicaoRepository.find({
      where: { 
        orgao_id: orgaoId, 
        status: StatusRequisicao.AGUARDANDO_AUTORIZACAO 
      },
      relations: ['itens', 'contrato'],
      order: { prioridade: 'DESC', created_at: 'ASC' },
    });
  }

  async atualizar(id: string, dto: AtualizarRequisicaoDto): Promise<Requisicao> {
    const requisicao = await this.findOne(id);

    // Só pode editar em rascunho
    if (requisicao.status !== StatusRequisicao.RASCUNHO) {
      throw new BadRequestException(
        'Requisição só pode ser editada enquanto está em rascunho'
      );
    }

    Object.assign(requisicao, dto);
    return this.requisicaoRepository.save(requisicao);
  }

  // ============================================================================
  // EXCLUIR REQUISIÇÃO
  // ============================================================================

  /**
   * Exclui uma requisição permanentemente
   * 
   * IMPORTANTE: Só permite excluir requisições em RASCUNHO ou CANCELADA.
   * 
   * Se a requisição CANCELADA tinha ordem de fornecimento:
   * - Exclui recebimentos relacionados (se ainda existirem)
   * - Exclui ordem de fornecimento relacionada
   * 
   * O saldo já foi liberado durante o cancelamento, então não precisa liberar novamente.
   */
  async excluir(id: string): Promise<void> {
    const requisicao = await this.findOne(id);

    // Só permite excluir RASCUNHO ou CANCELADA
    const statusPermitidos = [
      StatusRequisicao.RASCUNHO,
      StatusRequisicao.CANCELADA,
    ];

    if (!statusPermitidos.includes(requisicao.status)) {
      throw new BadRequestException(
        `Requisição não pode ser excluída. Status atual: ${requisicao.status}. ` +
        `Apenas requisições em RASCUNHO ou CANCELADA podem ser excluídas.`
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Se tem ordem de fornecimento (mesmo que cancelada), exclui ordem e recebimentos
      if (requisicao.ordem_fornecimento_id) {
        const ordem = await queryRunner.manager.findOne(OrdemFornecimento, {
          where: { id: requisicao.ordem_fornecimento_id },
        });

        if (ordem) {
          // Busca e exclui recebimentos relacionados (se ainda existirem)
          const recebimentos = await queryRunner.manager.find(Recebimento, {
            where: { ordem_fornecimento_id: ordem.id },
          });

          for (const recebimento of recebimentos) {
            // Só exclui se não tiver baixa realizada (se tiver, já foi estornado no cancelamento)
            if (!recebimento.baixa_realizada) {
              await queryRunner.manager.remove(recebimento);
              this.logger.log(
                `Recebimento ${recebimento.numero} excluído durante exclusão da requisição ${requisicao.numero}`
              );
            }
          }

          // Remove PDF da ordem se existir
          if (ordem.caminho_pdf) {
            try {
              const fs = require('fs');
              const path = require('path');
              const pdfPath = path.join(process.cwd(), ordem.caminho_pdf);
              if (fs.existsSync(pdfPath)) {
                fs.unlinkSync(pdfPath);
                this.logger.log(`PDF da ordem ${ordem.numero} removido`);
              }
            } catch (error) {
              this.logger.warn(`Erro ao remover PDF da ordem: ${error.message}`);
            }
          }

          // Exclui a ordem
          await queryRunner.manager.remove(ordem);
          this.logger.log(
            `Ordem de fornecimento ${ordem.numero} excluída durante exclusão da requisição ${requisicao.numero}`
          );
        }
      }

      // Exclui itens primeiro (cascade)
      if (requisicao.itens && requisicao.itens.length > 0) {
        await queryRunner.manager.remove(requisicao.itens);
      }

      // Exclui a requisição
      await queryRunner.manager.remove(requisicao);

      await queryRunner.commitTransaction();

      this.logger.log(
        `Requisição ${requisicao.numero} excluída permanentemente. ` +
        `Ordem e recebimentos relacionados foram excluídos.`
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Erro ao excluir requisição ${requisicao.numero}: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ============================================================================
  // ESTATÍSTICAS
  // ============================================================================

  async getEstatisticas(orgaoId: string): Promise<{
    total: number;
    por_status: Record<string, number>;
    valor_total_autorizadas: number;
    pendentes_autorizacao: number;
  }> {
    const requisicoes = await this.requisicaoRepository.find({
      where: { orgao_id: orgaoId },
    });

    const por_status: Record<string, number> = {};
    let valor_total_autorizadas = 0;
    let pendentes_autorizacao = 0;

    for (const req of requisicoes) {
      por_status[req.status] = (por_status[req.status] || 0) + 1;

      if (req.status === StatusRequisicao.AUTORIZADA || 
          req.status === StatusRequisicao.ORDEM_GERADA ||
          req.status === StatusRequisicao.ATENDIDA_PARCIAL ||
          req.status === StatusRequisicao.ATENDIDA) {
        valor_total_autorizadas += Number(req.valor_total_estimado);
      }

      if (req.status === StatusRequisicao.AGUARDANDO_AUTORIZACAO) {
        pendentes_autorizacao++;
      }
    }

    return {
      total: requisicoes.length,
      por_status,
      valor_total_autorizadas,
      pendentes_autorizacao,
    };
  }
}
