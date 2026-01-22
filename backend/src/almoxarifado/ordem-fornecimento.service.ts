import { Injectable, NotFoundException, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { OrdemFornecimento, StatusOrdemFornecimento, TipoOrdem } from './entities/ordem-fornecimento.entity';
import { Requisicao, StatusRequisicao, TipoRequisicao } from './entities/requisicao.entity';
import { Recebimento, StatusRecebimento } from './entities/recebimento.entity';
import { HistoricoOrdemFornecimento, TipoAcaoOrdem } from './entities/historico-ordem.entity';
import { Contrato } from '../contratos/entities/contrato.entity';
import { ItemContrato } from '../contratos/entities/item-contrato.entity';
import { GerarOrdemDto, EditarOrdemDto } from './dto/ordem-fornecimento.dto';
import { PdfOrdemService } from './pdf-ordem.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';

@Injectable()
export class OrdemFornecimentoService {
  private readonly logger = new Logger(OrdemFornecimentoService.name);

  constructor(
    @InjectRepository(OrdemFornecimento)
    private readonly ordemRepository: Repository<OrdemFornecimento>,
    @InjectRepository(Requisicao)
    private readonly requisicaoRepository: Repository<Requisicao>,
    @InjectRepository(Contrato)
    private readonly contratoRepository: Repository<Contrato>,
    @InjectRepository(HistoricoOrdemFornecimento)
    private readonly historicoRepository: Repository<HistoricoOrdemFornecimento>,
    private readonly dataSource: DataSource,
    private readonly pdfOrdemService: PdfOrdemService,
    private readonly notificacoesService: NotificacoesService,
  ) {}

  // ============================================================================
  // HISTÓRICO - REGISTRAR AÇÃO
  // ============================================================================

  private async registrarHistorico(params: {
    ordemId: string;
    tipoAcao: TipoAcaoOrdem;
    descricao: string;
    detalhes?: any;
    statusAnterior?: string;
    statusNovo?: string;
    usuarioId?: string;
    usuarioNome?: string;
    usuarioTipo?: 'orgao' | 'fornecedor' | 'sistema';
  }): Promise<HistoricoOrdemFornecimento> {
    const historico = new HistoricoOrdemFornecimento();
    historico.ordem_fornecimento_id = params.ordemId;
    historico.tipo_acao = params.tipoAcao;
    historico.descricao = params.descricao;
    historico.detalhes = params.detalhes ? JSON.stringify(params.detalhes) : null;
    historico.status_anterior = params.statusAnterior || null;
    historico.status_novo = params.statusNovo || null;
    historico.usuario_id = params.usuarioId || null;
    historico.usuario_nome = params.usuarioNome || null;
    historico.usuario_tipo = params.usuarioTipo || 'orgao';

    return this.historicoRepository.save(historico);
  }

  async getHistorico(ordemId: string): Promise<HistoricoOrdemFornecimento[]> {
    return this.historicoRepository.find({
      where: { ordem_fornecimento_id: ordemId },
      order: { created_at: 'DESC' },
    });
  }

  // ============================================================================
  // GERAR ORDEM A PARTIR DE REQUISIÇÃO
  // ============================================================================

  /**
   * Gera uma Ordem de Fornecimento/Serviço a partir de uma requisição autorizada
   */
  async gerarOrdem(
    dto: GerarOrdemDto,
    usuarioId: string,
    usuarioNome: string,
  ): Promise<OrdemFornecimento> {
    // Busca requisição
    const requisicao = await this.requisicaoRepository.findOne({
      where: { id: dto.requisicao_id },
      relations: ['itens', 'itens.item_contrato', 'contrato', 'contrato.fornecedor'],
    });

    if (!requisicao) {
      throw new NotFoundException('Requisição não encontrada');
    }

    // Permite gerar ordem para requisições AUTORIZADAS ou ORDEM_GERADA (para permitir regerar manualmente)
    if (requisicao.status !== StatusRequisicao.AUTORIZADA && requisicao.status !== StatusRequisicao.ORDEM_GERADA) {
      throw new BadRequestException(
        `Requisição não pode gerar ordem. Status atual: ${requisicao.status}. ` +
        'Apenas requisições AUTORIZADAS ou com ORDEM_GERADA podem gerar ordens.'
      );
    }

    if (!requisicao.contrato_id) {
      throw new BadRequestException(
        'Requisição não possui contrato vinculado. Não é possível gerar ordem.'
      );
    }

    // Busca contrato com fornecedor
    const contrato = requisicao.contrato;
    if (!contrato || !contrato.fornecedor_id) {
      throw new BadRequestException('Contrato não possui fornecedor vinculado');
    }

    // Gera número da ordem
    const ano = new Date().getFullYear();
    const prefixo = requisicao.tipo === TipoRequisicao.SERVICO ? 'OS' : 'OF';
    
    const ultimaOrdem = await this.ordemRepository.findOne({
      where: { orgao_id: requisicao.orgao_id, ano },
      order: { sequencial: 'DESC' },
    });

    const sequencial = ultimaOrdem ? ultimaOrdem.sequencial + 1 : 1;
    const numero = `${prefixo}-${String(sequencial).padStart(4, '0')}/${ano}`;

    // Prepara itens da ordem
    const itensOrdem = requisicao.itens.map(item => ({
      item_contrato_id: item.item_contrato_id || '',
      numero_item: item.numero_item,
      descricao: item.descricao,
      unidade_medida: item.unidade_medida || '',
      quantidade: Number(item.quantidade_autorizada || item.quantidade_solicitada),
      quantidade_entregue: 0,
      valor_unitario: Number(item.valor_unitario || 0),
      valor_total: Number(item.valor_total_estimado || 0),
    }));

    // Calcula valor total
    const valorTotal = itensOrdem.reduce((sum, item) => sum + item.valor_total, 0);

    // Cria ordem
    const ordem = new OrdemFornecimento();
    ordem.orgao_id = requisicao.orgao_id;
    ordem.contrato_id = requisicao.contrato_id;
    ordem.fornecedor_id = contrato.fornecedor_id;
    ordem.requisicao_id = requisicao.id;
    ordem.numero = numero;
    ordem.ano = ano;
    ordem.sequencial = sequencial;
    ordem.tipo = requisicao.tipo === TipoRequisicao.SERVICO ? TipoOrdem.SERVICO : TipoOrdem.FORNECIMENTO;
    ordem.status = StatusOrdemFornecimento.EMITIDA;
    ordem.descricao = requisicao.justificativa;
    ordem.local_entrega = dto.local_entrega || requisicao.local_entrega;
    ordem.data_emissao = new Date();
    ordem.data_entrega_prevista = dto.data_entrega_prevista ? new Date(dto.data_entrega_prevista) : null;
    ordem.prazo_entrega_dias = dto.prazo_entrega_dias || null;
    ordem.valor_total = valorTotal;
    ordem.valor_entregue = 0;
    ordem.itens = itensOrdem;
    ordem.usuario_emitente_id = usuarioId;
    ordem.usuario_emitente_nome = usuarioNome;
    ordem.observacoes = dto.observacoes || null;

    // Salva ordem e atualiza requisição
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const ordemSalva = await queryRunner.manager.save(ordem);

      // Atualiza status da requisição (só atualiza se ainda não tinha ordem)
      if (requisicao.status === StatusRequisicao.AUTORIZADA) {
        requisicao.status = StatusRequisicao.ORDEM_GERADA;
      }
      // Permite atualizar ordem_fornecimento_id mesmo se já existe (para regerar)
      requisicao.ordem_fornecimento_id = ordemSalva.id;
      await queryRunner.manager.save(requisicao);

      await queryRunner.commitTransaction();

      this.logger.log(
        `Ordem ${numero} gerada a partir da requisição ${requisicao.numero}. ` +
        `Valor: R$ ${valorTotal.toFixed(2)}`
      );

      // Registra no histórico
      await this.registrarHistorico({
        ordemId: ordemSalva.id,
        tipoAcao: TipoAcaoOrdem.CRIADA,
        descricao: `Ordem ${numero} criada a partir da requisição ${requisicao.numero}`,
        detalhes: { requisicao_numero: requisicao.numero, valor_total: valorTotal },
        statusNovo: StatusOrdemFornecimento.EMITIDA,
        usuarioId: usuarioId,
        usuarioNome: usuarioNome,
        usuarioTipo: 'orgao',
      });

      // Gera PDF automaticamente
      try {
        const caminhoPdf = await this.pdfOrdemService.gerarPdf(ordemSalva.id);
        
        // Atualiza ordem com caminho do PDF
        ordemSalva.caminho_pdf = caminhoPdf;
        await this.ordemRepository.save(ordemSalva);
        
        this.logger.log(`PDF da ordem ${numero} gerado: ${caminhoPdf}`);
      } catch (pdfError) {
        // Não falha se PDF não puder ser gerado
        this.logger.warn(`Erro ao gerar PDF da ordem: ${pdfError.message}`);
      }

      return this.findOne(ordemSalva.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ============================================================================
  // ENVIAR ORDEM AO FORNECEDOR
  // ============================================================================

  async enviarOrdem(
    id: string, 
    emailFornecedor?: string,
    observacoes?: string,
    usuarioId?: string,
    usuarioNome?: string,
  ): Promise<OrdemFornecimento> {
    const ordem = await this.findOne(id);

    if (ordem.status !== StatusOrdemFornecimento.EMITIDA) {
      throw new BadRequestException(
        `Ordem não pode ser enviada. Status atual: ${ordem.status}`
      );
    }

    const statusAnterior = ordem.status;
    ordem.status = StatusOrdemFornecimento.ENVIADA;
    ordem.data_envio = new Date();
    ordem.email_fornecedor = emailFornecedor || ordem.fornecedor?.email || null;
    ordem.observacoes_envio = observacoes || null;

    const ordemSalva = await this.ordemRepository.save(ordem);

    // Registra no histórico
    await this.registrarHistorico({
      ordemId: id,
      tipoAcao: TipoAcaoOrdem.ENVIADA,
      descricao: `Ordem enviada ao fornecedor ${ordem.fornecedor?.razao_social || ''}`,
      detalhes: { email: ordem.email_fornecedor, observacoes },
      statusAnterior,
      statusNovo: StatusOrdemFornecimento.ENVIADA,
      usuarioId,
      usuarioNome,
      usuarioTipo: 'orgao',
    });

    // TODO: Implementar envio real de email

    this.logger.log(`Ordem ${ordem.numero} enviada ao fornecedor`);

    return ordemSalva;
  }

  /**
   * Reenvia ordem ao fornecedor (quando já foi enviada antes)
   */
  async reenviarOrdem(
    id: string,
    emailFornecedor?: string,
    observacoes?: string,
    usuarioId?: string,
    usuarioNome?: string,
  ): Promise<OrdemFornecimento> {
    const ordem = await this.findOne(id);

    // Permite reenviar ordens ENVIADAS, EM_ATENDIMENTO ou ATENDIDA_PARCIAL
    const statusPermitidos = [
      StatusOrdemFornecimento.ENVIADA,
      StatusOrdemFornecimento.EM_ATENDIMENTO,
      StatusOrdemFornecimento.ATENDIDA_PARCIAL,
    ];

    if (!statusPermitidos.includes(ordem.status)) {
      throw new BadRequestException(
        `Ordem não pode ser reenviada. Status atual: ${ordem.status}`
      );
    }

    ordem.data_envio = new Date();
    ordem.email_fornecedor = emailFornecedor || ordem.email_fornecedor || ordem.fornecedor?.email || null;
    if (observacoes) {
      ordem.observacoes_envio = `${ordem.observacoes_envio || ''}\n[Reenvio ${new Date().toLocaleDateString('pt-BR')}] ${observacoes}`.trim();
    }

    const ordemSalva = await this.ordemRepository.save(ordem);

    // Registra no histórico
    await this.registrarHistorico({
      ordemId: id,
      tipoAcao: TipoAcaoOrdem.REENVIADA,
      descricao: `Ordem reenviada ao fornecedor`,
      detalhes: { email: ordem.email_fornecedor, observacoes },
      usuarioId,
      usuarioNome,
      usuarioTipo: 'orgao',
    });

    // TODO: Implementar envio real de email

    this.logger.log(`Ordem ${ordem.numero} reenviada ao fornecedor`);

    return ordemSalva;
  }

  // ============================================================================
  // CANCELAR ORDEM (MESMO APÓS ENVIO)
  // ============================================================================

  /**
   * Cancela uma ordem de fornecimento
   * 
   * - Ordens ATENDIDAS não podem ser canceladas diretamente (precisam estornar recebimentos primeiro)
   * - Ordens enviadas: notifica o fornecedor sobre o cancelamento
   * - Ordens aceitas pelo fornecedor: exige justificativa obrigatória
   */
  async cancelarOrdem(
    id: string, 
    motivo: string,
    usuarioId: string,
    usuarioNome: string,
  ): Promise<OrdemFornecimento> {
    if (!motivo || motivo.trim().length < 10) {
      throw new BadRequestException(
        'Motivo do cancelamento é obrigatório e deve ter no mínimo 10 caracteres'
      );
    }

    const ordem = await this.findOne(id);
    const statusAnterior = ordem.status;

    // Não pode cancelar se já foi totalmente atendida
    if (ordem.status === StatusOrdemFornecimento.ATENDIDA) {
      throw new BadRequestException(
        'Ordem totalmente atendida não pode ser cancelada. Use a função de estorno se necessário.'
      );
    }

    // Já está cancelada?
    if (ordem.status === StatusOrdemFornecimento.CANCELADA) {
      throw new BadRequestException('Ordem já está cancelada');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Se tem entregas parciais, precisa estornar primeiro
      if (ordem.status === StatusOrdemFornecimento.ATENDIDA_PARCIAL) {
        // Busca recebimentos aceitos
        const recebimentos = await queryRunner.manager.find(Recebimento, {
          where: { 
            ordem_fornecimento_id: id,
            status: StatusRecebimento.ACEITO,
          },
        });

        if (recebimentos.length > 0) {
          // Estorna cada recebimento
          for (const rec of recebimentos) {
            // Retorna saldo ao contrato
            for (const itemRec of rec.itens) {
              if (itemRec.quantidade_aceita > 0 && itemRec.item_contrato_id) {
                const itemContrato = await queryRunner.manager.findOne(ItemContrato, {
                  where: { id: itemRec.item_contrato_id },
                  lock: { mode: 'pessimistic_write' },
                });
                
                if (itemContrato) {
                  itemContrato.quantidade_entregue = 
                    Number(itemContrato.quantidade_entregue) - itemRec.quantidade_aceita;
                  itemContrato.saldo_disponivel = 
                    Number(itemContrato.quantidade_contratada) - 
                    Number(itemContrato.quantidade_empenhada) - 
                    Number(itemContrato.quantidade_entregue);
                  await queryRunner.manager.save(itemContrato);
                }
              }
            }
            
            // Marca recebimento como estornado
            rec.status = StatusRecebimento.ESTORNADO;
            rec.data_estorno = new Date();
            rec.usuario_estorno_id = usuarioId;
            rec.usuario_estorno_nome = usuarioNome;
            rec.motivo_estorno = `Cancelamento da ordem: ${motivo}`;
            await queryRunner.manager.save(rec);
          }

          this.logger.log(
            `${recebimentos.length} recebimento(s) estornados automaticamente devido ao cancelamento da ordem ${ordem.numero}`
          );
        }
      }

      // Atualiza a ordem
      ordem.status = StatusOrdemFornecimento.CANCELADA;
      ordem.data_cancelamento = new Date();
      ordem.motivo_cancelamento = motivo;
      ordem.usuario_cancelamento_id = usuarioId;
      ordem.usuario_cancelamento_nome = usuarioNome;

      // Zera entregas
      for (const item of ordem.itens) {
        item.quantidade_entregue = 0;
      }
      ordem.valor_entregue = 0;

      await queryRunner.manager.save(ordem);

      // Se a ordem já foi enviada, precisa notificar o fornecedor
      const foiEnviada = [
        StatusOrdemFornecimento.ENVIADA,
        StatusOrdemFornecimento.EM_ATENDIMENTO,
        StatusOrdemFornecimento.ATENDIDA_PARCIAL,
      ].includes(statusAnterior);

      if (foiEnviada && ordem.fornecedor_id) {
        try {
          // Cria notificação para o fornecedor
          await this.notificacoesService.criar({
            orgao_id: ordem.orgao_id,
            tipo: 'ORDEM_CANCELADA',
            titulo: `Ordem de Fornecimento Cancelada - ${ordem.numero}`,
            mensagem: `A Ordem de Fornecimento ${ordem.numero} foi CANCELADA.\n\nMotivo: ${motivo}\n\nPor favor, desconsidere a ordem anterior.`,
            destinatario_id: ordem.fornecedor_id,
            destinatario_tipo: 'fornecedor',
            referencia_tipo: 'ordem_fornecimento',
            referencia_id: id,
          });
          
          ordem.fornecedor_notificado_cancelamento = true;
          await queryRunner.manager.save(ordem);
          
          this.logger.log(`Fornecedor notificado sobre cancelamento da ordem ${ordem.numero}`);
        } catch (notifError) {
          this.logger.warn(`Erro ao notificar fornecedor sobre cancelamento: ${notifError.message}`);
        }
      }

      // Retorna saldo empenhado ao contrato (itens que não foram entregues)
      if (ordem.requisicao_id) {
        const requisicao = await queryRunner.manager.findOne(Requisicao, {
          where: { id: ordem.requisicao_id },
          relations: ['itens'],
        });

        if (requisicao && requisicao.saldo_reservado) {
          // Libera saldo empenhado
          for (const itemReq of requisicao.itens) {
            if (itemReq.item_contrato_id) {
              const itemContrato = await queryRunner.manager.findOne(ItemContrato, {
                where: { id: itemReq.item_contrato_id },
                lock: { mode: 'pessimistic_write' },
              });

              if (itemContrato) {
                const quantidadeALiberar = Number(itemReq.quantidade_autorizada || itemReq.quantidade_solicitada);
                itemContrato.quantidade_empenhada = Math.max(
                  0,
                  Number(itemContrato.quantidade_empenhada) - quantidadeALiberar
                );
                itemContrato.saldo_disponivel =
                  Number(itemContrato.quantidade_contratada) -
                  Number(itemContrato.quantidade_empenhada) -
                  Number(itemContrato.quantidade_entregue);
                await queryRunner.manager.save(itemContrato);
              }
            }
          }

          requisicao.saldo_reservado = false;
          requisicao.status = StatusRequisicao.CANCELADA;
          requisicao.observacoes = `${requisicao.observacoes || ''}\n[Cancelada junto com OF] ${motivo}`.trim();
          await queryRunner.manager.save(requisicao);
        }
      }

      await queryRunner.commitTransaction();

      // Registra no histórico
      await this.registrarHistorico({
        ordemId: id,
        tipoAcao: TipoAcaoOrdem.CANCELADA,
        descricao: `Ordem cancelada: ${motivo}`,
        detalhes: { 
          motivo, 
          status_anterior: statusAnterior,
          fornecedor_notificado: ordem.fornecedor_notificado_cancelamento,
        },
        statusAnterior,
        statusNovo: StatusOrdemFornecimento.CANCELADA,
        usuarioId,
        usuarioNome,
        usuarioTipo: 'orgao',
      });

      this.logger.log(`Ordem ${ordem.numero} cancelada: ${motivo}`);

      return this.findOne(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Erro ao cancelar ordem ${ordem.numero}: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ============================================================================
  // EDITAR ORDEM
  // ============================================================================

  /**
   * Edita uma ordem de fornecimento
   * 
   * Regras:
   * - EMITIDA: qualquer usuário pode editar
   * - ENVIADA/EM_ATENDIMENTO: só usuários com permissão de aprovação
   * - ATENDIDA_PARCIAL: só usuários com permissão de aprovação
   * - ATENDIDA/CANCELADA: não pode editar
   */
  async editarOrdem(
    id: string,
    dto: EditarOrdemDto,
    usuarioId: string,
    usuarioNome: string,
    temPermissaoAprovacao: boolean,
  ): Promise<OrdemFornecimento> {
    const ordem = await this.findOne(id);
    const statusAnterior = ordem.status;

    // Verifica se pode editar
    const statusQueExigemPermissao = [
      StatusOrdemFornecimento.ENVIADA,
      StatusOrdemFornecimento.EM_ATENDIMENTO,
      StatusOrdemFornecimento.ATENDIDA_PARCIAL,
    ];

    const statusQueNaoPodeEditar = [
      StatusOrdemFornecimento.ATENDIDA,
      StatusOrdemFornecimento.CANCELADA,
    ];

    if (statusQueNaoPodeEditar.includes(ordem.status)) {
      throw new BadRequestException(
        `Ordem com status ${ordem.status} não pode ser editada`
      );
    }

    if (statusQueExigemPermissao.includes(ordem.status) && !temPermissaoAprovacao) {
      throw new ForbiddenException(
        'Você não tem permissão para editar ordens já enviadas ao fornecedor. ' +
        'Apenas usuários com permissão de aprovação podem fazer isso.'
      );
    }

    // Registra alterações para o histórico
    const alteracoes: string[] = [];

    // Atualiza campos permitidos
    if (dto.local_entrega !== undefined && dto.local_entrega !== ordem.local_entrega) {
      alteracoes.push(`Local de entrega: "${ordem.local_entrega}" → "${dto.local_entrega}"`);
      ordem.local_entrega = dto.local_entrega;
    }

    if (dto.data_entrega_prevista !== undefined) {
      const novaData = dto.data_entrega_prevista ? new Date(dto.data_entrega_prevista) : null;
      if (novaData?.toISOString() !== ordem.data_entrega_prevista?.toISOString()) {
        alteracoes.push(`Data prevista: ${ordem.data_entrega_prevista?.toLocaleDateString('pt-BR') || 'não definida'} → ${novaData?.toLocaleDateString('pt-BR') || 'não definida'}`);
        ordem.data_entrega_prevista = novaData;
      }
    }

    if (dto.prazo_entrega_dias !== undefined && dto.prazo_entrega_dias !== ordem.prazo_entrega_dias) {
      alteracoes.push(`Prazo: ${ordem.prazo_entrega_dias || 0} dias → ${dto.prazo_entrega_dias} dias`);
      ordem.prazo_entrega_dias = dto.prazo_entrega_dias;
    }

    if (dto.observacoes !== undefined && dto.observacoes !== ordem.observacoes) {
      alteracoes.push('Observações atualizadas');
      ordem.observacoes = dto.observacoes;
    }

    // Edição de itens (apenas se ordem ainda não foi enviada ou se tem permissão)
    if (dto.itens && dto.itens.length > 0) {
      if (ordem.status !== StatusOrdemFornecimento.EMITIDA && !temPermissaoAprovacao) {
        throw new ForbiddenException(
          'Edição de itens em ordens enviadas requer permissão de aprovação'
        );
      }

      // Atualiza itens
      for (const itemDto of dto.itens) {
        const itemIndex = ordem.itens.findIndex(i => i.item_contrato_id === itemDto.item_contrato_id);
        if (itemIndex !== -1) {
          const itemAtual = ordem.itens[itemIndex];
          
          if (itemDto.quantidade !== undefined && itemDto.quantidade !== itemAtual.quantidade) {
            // Valida se não é menor que já entregue
            if (itemDto.quantidade < itemAtual.quantidade_entregue) {
              throw new BadRequestException(
                `Quantidade do item "${itemAtual.descricao}" não pode ser menor que a quantidade já entregue (${itemAtual.quantidade_entregue})`
              );
            }

            alteracoes.push(`Item ${itemAtual.numero_item}: quantidade ${itemAtual.quantidade} → ${itemDto.quantidade}`);
            itemAtual.quantidade = itemDto.quantidade;
            itemAtual.valor_total = itemDto.quantidade * itemAtual.valor_unitario;
          }
        }
      }

      // Recalcula valor total da ordem
      ordem.valor_total = ordem.itens.reduce((sum, item) => sum + item.valor_total, 0);
    }

    if (alteracoes.length === 0) {
      throw new BadRequestException('Nenhuma alteração foi detectada');
    }

    const ordemSalva = await this.ordemRepository.save(ordem);

    // Registra no histórico
    await this.registrarHistorico({
      ordemId: id,
      tipoAcao: TipoAcaoOrdem.EDITADA,
      descricao: `Ordem editada: ${alteracoes.join('; ')}`,
      detalhes: { alteracoes, dto },
      statusAnterior,
      statusNovo: ordem.status,
      usuarioId,
      usuarioNome,
      usuarioTipo: 'orgao',
    });

    this.logger.log(`Ordem ${ordem.numero} editada por ${usuarioNome}: ${alteracoes.join('; ')}`);

    return ordemSalva;
  }

  // ============================================================================
  // ATUALIZAR STATUS DE ATENDIMENTO
  // ============================================================================

  /**
   * Atualiza a quantidade entregue de um item da ordem
   * Chamado pelo serviço de recebimento
   */
  async atualizarAtendimento(
    ordemId: string,
    itemContratoId: string,
    quantidadeEntregue: number,
    valorEntregue: number,
  ): Promise<OrdemFornecimento> {
    const ordem = await this.findOne(ordemId);

    // Atualiza item
    const itemIndex = ordem.itens.findIndex(i => i.item_contrato_id === itemContratoId);
    if (itemIndex === -1) {
      throw new BadRequestException('Item não encontrado na ordem');
    }

    ordem.itens[itemIndex].quantidade_entregue += quantidadeEntregue;
    ordem.valor_entregue = Number(ordem.valor_entregue) + valorEntregue;

    // Verifica se está totalmente atendida
    const totalmenteAtendida = ordem.itens.every(
      item => item.quantidade_entregue >= item.quantidade
    );

    if (totalmenteAtendida) {
      ordem.status = StatusOrdemFornecimento.ATENDIDA;
      ordem.data_entrega_realizada = new Date();
    } else {
      ordem.status = StatusOrdemFornecimento.ATENDIDA_PARCIAL;
    }

    return this.ordemRepository.save(ordem);
  }

  /**
   * Reverte o atendimento de uma ordem (usado em estorno de recebimento)
   * Reduz as quantidades entregues dos itens
   */
  async reverterAtendimento(
    ordemId: string,
    itensRecebimento: Array<{ item_contrato_id: string; quantidade_aceita: number; valor_unitario: number }>,
  ): Promise<OrdemFornecimento> {
    const ordem = await this.findOne(ordemId);

    // Reverte cada item
    for (const itemRec of itensRecebimento) {
      if (itemRec.quantidade_aceita > 0) {
        const itemIndex = ordem.itens.findIndex(i => i.item_contrato_id === itemRec.item_contrato_id);
        if (itemIndex !== -1) {
          const quantidadeAReverter = Math.min(
            itemRec.quantidade_aceita,
            ordem.itens[itemIndex].quantidade_entregue
          );
          const valorAReverter = quantidadeAReverter * itemRec.valor_unitario;

          ordem.itens[itemIndex].quantidade_entregue = Math.max(
            0,
            ordem.itens[itemIndex].quantidade_entregue - quantidadeAReverter
          );
          ordem.valor_entregue = Math.max(0, Number(ordem.valor_entregue) - valorAReverter);
        }
      }
    }

    // Atualiza status da ordem
    const nenhumItemEntregue = ordem.itens.every(item => item.quantidade_entregue === 0);
    const parcialmenteAtendida = ordem.itens.some(
      item => item.quantidade_entregue > 0 && item.quantidade_entregue < item.quantidade
    );

    if (nenhumItemEntregue) {
      ordem.status = StatusOrdemFornecimento.ENVIADA;
      ordem.data_entrega_realizada = null;
    } else if (parcialmenteAtendida) {
      ordem.status = StatusOrdemFornecimento.ATENDIDA_PARCIAL;
    } else {
      ordem.status = StatusOrdemFornecimento.ATENDIDA;
    }

    this.logger.log(`Atendimento revertido para ordem ${ordem.numero}`);

    return this.ordemRepository.save(ordem);
  }

  // ============================================================================
  // CONSULTAS
  // ============================================================================

  async findAll(filtros: {
    orgaoId: string;
    status?: StatusOrdemFornecimento;
    contratoId?: string;
    fornecedorId?: string;
    dataInicio?: Date;
    dataFim?: Date;
  }): Promise<OrdemFornecimento[]> {
    const query = this.ordemRepository.createQueryBuilder('ordem')
      .leftJoinAndSelect('ordem.contrato', 'contrato')
      .leftJoinAndSelect('ordem.fornecedor', 'fornecedor')
      .leftJoinAndSelect('ordem.requisicao', 'requisicao')
      .where('ordem.orgao_id = :orgaoId', { orgaoId: filtros.orgaoId });

    if (filtros.status) {
      query.andWhere('ordem.status = :status', { status: filtros.status });
    }

    if (filtros.contratoId) {
      query.andWhere('ordem.contrato_id = :contratoId', { contratoId: filtros.contratoId });
    }

    if (filtros.fornecedorId) {
      query.andWhere('ordem.fornecedor_id = :fornecedorId', { fornecedorId: filtros.fornecedorId });
    }

    if (filtros.dataInicio) {
      query.andWhere('ordem.data_emissao >= :dataInicio', { dataInicio: filtros.dataInicio });
    }

    if (filtros.dataFim) {
      query.andWhere('ordem.data_emissao <= :dataFim', { dataFim: filtros.dataFim });
    }

    return query.orderBy('ordem.created_at', 'DESC').getMany();
  }

  async findOne(id: string): Promise<OrdemFornecimento> {
    const ordem = await this.ordemRepository.findOne({
      where: { id },
      relations: ['contrato', 'fornecedor', 'requisicao'],
    });

    if (!ordem) {
      throw new NotFoundException('Ordem de fornecimento não encontrada');
    }

    return ordem;
  }

  async findPendentesEnvio(orgaoId: string): Promise<OrdemFornecimento[]> {
    return this.ordemRepository.find({
      where: { 
        orgao_id: orgaoId, 
        status: StatusOrdemFornecimento.EMITIDA 
      },
      relations: ['contrato', 'fornecedor'],
      order: { created_at: 'ASC' },
    });
  }

  async findEmAndamento(orgaoId: string): Promise<OrdemFornecimento[]> {
    return this.ordemRepository.createQueryBuilder('ordem')
      .leftJoinAndSelect('ordem.contrato', 'contrato')
      .leftJoinAndSelect('ordem.fornecedor', 'fornecedor')
      .where('ordem.orgao_id = :orgaoId', { orgaoId })
      .andWhere('ordem.status IN (:...status)', { 
        status: [
          StatusOrdemFornecimento.ENVIADA,
          StatusOrdemFornecimento.EM_ATENDIMENTO,
          StatusOrdemFornecimento.ATENDIDA_PARCIAL,
        ]
      })
      .orderBy('ordem.data_entrega_prevista', 'ASC')
      .getMany();
  }

  // ============================================================================
  // EXCLUIR ORDEM
  // ============================================================================

  /**
   * Exclui uma ordem de fornecimento permanentemente
   * 
   * IMPORTANTE: Só permite excluir ordens que:
   * - Estejam em RASCUNHO ou EMITIDA (não enviadas)
   * - Não tenham recebimentos vinculados
   */
  async excluir(id: string): Promise<void> {
    const ordem = await this.findOne(id);

    // Só permite excluir RASCUNHO ou EMITIDA (não enviada)
    const statusPermitidos = [
      StatusOrdemFornecimento.RASCUNHO,
      StatusOrdemFornecimento.EMITIDA,
    ];

    if (!statusPermitidos.includes(ordem.status)) {
      throw new BadRequestException(
        `Ordem não pode ser excluída. Status atual: ${ordem.status}. ` +
        `Apenas ordens em RASCUNHO ou EMITIDA podem ser excluídas.`
      );
    }

    // Verifica se há recebimentos vinculados
    const recebimentos = await this.dataSource
      .getRepository(Recebimento)
      .find({ where: { ordem_fornecimento_id: id } });

    if (recebimentos && recebimentos.length > 0) {
      throw new BadRequestException(
        `Ordem não pode ser excluída pois possui ${recebimentos.length} recebimento(s) vinculado(s). ` +
        'Exclua os recebimentos primeiro.'
      );
    }

    // Remove referência da requisição (se houver)
    if (ordem.requisicao_id) {
      const requisicao = await this.requisicaoRepository.findOne({
        where: { id: ordem.requisicao_id },
      });
      if (requisicao) {
        requisicao.ordem_fornecimento_id = null;
        requisicao.status = StatusRequisicao.AUTORIZADA; // Volta para autorizada
        await this.requisicaoRepository.save(requisicao);
      }
    }

    // Remove PDF se existir
    if (ordem.caminho_pdf) {
      try {
        const fs = require('fs');
        const path = require('path');
        const pdfPath = path.join(process.cwd(), ordem.caminho_pdf);
        if (fs.existsSync(pdfPath)) {
          fs.unlinkSync(pdfPath);
        }
      } catch (error) {
        this.logger.warn(`Erro ao remover PDF da ordem: ${error.message}`);
      }
    }

    // Exclui a ordem
    await this.ordemRepository.remove(ordem);

    this.logger.log(`Ordem ${ordem.numero} excluída permanentemente`);
  }

  // ============================================================================
  // ESTATÍSTICAS
  // ============================================================================

  async getEstatisticas(orgaoId: string): Promise<{
    total: number;
    por_status: Record<string, number>;
    pendentes_envio: number;
    em_andamento: number;
    valor_total_emitido: number;
    valor_total_entregue: number;
  }> {
    const ordens = await this.ordemRepository.find({
      where: { orgao_id: orgaoId },
    });

    const por_status: Record<string, number> = {};
    let valor_total_emitido = 0;
    let valor_total_entregue = 0;
    let pendentes_envio = 0;
    let em_andamento = 0;

    for (const ordem of ordens) {
      por_status[ordem.status] = (por_status[ordem.status] || 0) + 1;
      valor_total_emitido += Number(ordem.valor_total);
      valor_total_entregue += Number(ordem.valor_entregue);

      if (ordem.status === StatusOrdemFornecimento.EMITIDA) {
        pendentes_envio++;
      }

      if ([
        StatusOrdemFornecimento.ENVIADA,
        StatusOrdemFornecimento.EM_ATENDIMENTO,
        StatusOrdemFornecimento.ATENDIDA_PARCIAL,
      ].includes(ordem.status)) {
        em_andamento++;
      }
    }

    return {
      total: ordens.length,
      por_status,
      pendentes_envio,
      em_andamento,
      valor_total_emitido,
      valor_total_entregue,
    };
  }
}
