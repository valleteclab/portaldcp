import { Injectable, NotFoundException, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { OrdemFornecimento, StatusOrdemFornecimento, TipoOrdem } from './entities/ordem-fornecimento.entity';
import { NotaFiscalFornecedor, StatusNotaFiscalFornecedor } from './entities/nota-fiscal-fornecedor.entity';
import { Requisicao, StatusRequisicao, TipoRequisicao } from './entities/requisicao.entity';
import { Recebimento, StatusRecebimento } from './entities/recebimento.entity';
import { HistoricoOrdemFornecimento, TipoAcaoOrdem } from './entities/historico-ordem.entity';
import { Contrato } from '../contratos/entities/contrato.entity';
import { ItemContrato } from './entities/item-contrato.entity';
import { GerarOrdemDto, EditarOrdemDto } from './dto/ordem-fornecimento.dto';
import { PdfOrdemService } from './pdf-ordem.service';
import { AssinaturasService } from '../assinaturas/assinaturas.service';
import { EntidadeTipo } from '../assinaturas/entities/assinatura-digital.entity';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { EmailService } from '../email/email.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { TipoNotificacao } from '../notificacoes/entities/notificacao.entity';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

@Injectable()
export class OrdemFornecimentoService {
  private readonly logger = new Logger(OrdemFornecimentoService.name);

  constructor(
    @InjectRepository(OrdemFornecimento)
    private readonly ordemRepository: Repository<OrdemFornecimento>,
    @InjectRepository(NotaFiscalFornecedor)
    private readonly nfRepository: Repository<NotaFiscalFornecedor>,
    @InjectRepository(Requisicao)
    private readonly requisicaoRepository: Repository<Requisicao>,
    @InjectRepository(Contrato)
    private readonly contratoRepository: Repository<Contrato>,
    @InjectRepository(HistoricoOrdemFornecimento)
    private readonly historicoRepository: Repository<HistoricoOrdemFornecimento>,
    private readonly dataSource: DataSource,
    private readonly pdfOrdemService: PdfOrdemService,
    private readonly assinaturasService: AssinaturasService,
    private readonly notificacoesService: NotificacoesService,
    private readonly emailService: EmailService,
    private readonly whatsappService: WhatsAppService,
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
    dataEvento?: Date;
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
    historico.data_evento = params.dataEvento || null;

    return this.historicoRepository.save(historico);
  }

  async getHistorico(ordemId: string): Promise<HistoricoOrdemFornecimento[]> {
    const itens = await this.historicoRepository.find({
      where: { ordem_fornecimento_id: ordemId },
    });
    itens.sort((a, b) => {
      const da = a.data_evento ? new Date(a.data_evento).getTime() : new Date(a.created_at).getTime();
      const db = b.data_evento ? new Date(b.data_evento).getTime() : new Date(b.created_at).getTime();
      return da - db;
    });
    return itens;
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

    if (requisicao.tipo === TipoRequisicao.ORDEM_SERVICO) {
      throw new BadRequestException(
        'Ordens de Serviço não geram Ordem de Fornecimento no Almoxarifado. Elas autorizam o início para medições.'
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
      tipo_item: item.item_contrato?.tipo_item ?? 'CONSUMO',
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
    if (requisicao.numeros_empenhos) {
      try {
        const empenhos = JSON.parse(requisicao.numeros_empenhos);
        ordem.numeros_empenhos = Array.isArray(empenhos) ? empenhos : null;
      } catch {
        ordem.numeros_empenhos = null;
      }
    } else {
      ordem.numeros_empenhos = null;
    }
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

      // Registra no histórico (timeline como "Movimento do Pedido")
      const dataCriacaoReq = requisicao.created_at ? new Date(requisicao.created_at) : new Date();
      const dataAutorizacao = requisicao.data_autorizacao ? new Date(requisicao.data_autorizacao) : new Date();

      await this.registrarHistorico({
        ordemId: ordemSalva.id,
        tipoAcao: TipoAcaoOrdem.PEDIDO_CRIADO,
        descricao: `Movimentação feita por: ${requisicao.usuario_solicitante_nome || 'Sistema'}`,
        detalhes: { requisicao_numero: requisicao.numero },
        statusNovo: 'RASCUNHO',
        usuarioId: requisicao.usuario_solicitante_id || undefined,
        usuarioNome: requisicao.usuario_solicitante_nome || 'Sistema',
        usuarioTipo: 'orgao',
        dataEvento: dataCriacaoReq,
      });

      await this.registrarHistorico({
        ordemId: ordemSalva.id,
        tipoAcao: TipoAcaoOrdem.PEDIDO_AUTORIZADO,
        descricao: `Movimentação feita por: ${usuarioNome}`,
        detalhes: { requisicao_numero: requisicao.numero },
        statusAnterior: 'AGUARDANDO_AUTORIZACAO',
        statusNovo: StatusOrdemFornecimento.EMITIDA,
        usuarioId,
        usuarioNome,
        usuarioTipo: 'orgao',
        dataEvento: dataAutorizacao,
      });

      await this.registrarHistorico({
        ordemId: ordemSalva.id,
        tipoAcao: TipoAcaoOrdem.CRIADA,
        descricao: `Ordem ${numero} criada a partir da requisição ${requisicao.numero}`,
        detalhes: { requisicao_numero: requisicao.numero, valor_total: valorTotal },
        statusNovo: StatusOrdemFornecimento.EMITIDA,
        usuarioId,
        usuarioNome,
        usuarioTipo: 'orgao',
      });

      // PDF com assinatura digital é gerado pelo requisicao.service após autorização
      // (mesmo modelo da Ordem de Serviço)

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

    const pdfPath = ordem.caminho_pdf && fs.existsSync(ordem.caminho_pdf)
      ? ordem.caminho_pdf
      : await this.pdfOrdemService.gerarPdf(id);
    if (ordemSalva.email_fornecedor) {
      try {
        const pdfBuffer = fs.readFileSync(pdfPath);
        const nomeArquivo = `ordem_${ordem.numero.replace(/\//g, '_')}.pdf`;
        await this.emailService.enviar(ordem.orgao_id, {
          to: ordemSalva.email_fornecedor,
          subject: `Ordem de Fornecimento ${ordem.numero} - ${ordem.fornecedor?.razao_social || ''}`,
          text: `Prezado(a) ${ordem.fornecedor?.razao_social || 'Fornecedor'},

Sua Ordem de Fornecimento ${ordem.numero} foi emitida e está disponível em anexo.

${observacoes ? `Observações: ${observacoes}\n\n` : ''}Para registrar a entrega dos materiais/serviços, acesse o Portal do Fornecedor:
${process.env.APP_URL || 'https://portaldcp.com.br'}/fornecedor/contratos/${ordem.contrato_id}

Atenciosamente,
${usuarioNome || 'Gestão de Contratos'}`,
          html: `<p>Prezado(a) <strong>${ordem.fornecedor?.razao_social || 'Fornecedor'}</strong>,</p>

<p>Sua <strong>Ordem de Fornecimento ${ordem.numero}</strong> foi emitida e está disponível em anexo.</p>

${observacoes ? `<p><strong>Observações:</strong> ${observacoes}</p>` : ''}
<p>Para registrar a entrega dos materiais/serviços, acesse o <a href="${process.env.APP_URL || 'https://portaldcp.com.br'}/fornecedor/contratos/${ordem.contrato_id}">Portal do Fornecedor</a>.</p>

<p>Atenciosamente,<br>
${usuarioNome || 'Gestão de Contratos'}</p>`,
          attachments: [{ filename: nomeArquivo, content: pdfBuffer }],
        });
      } catch (err: any) {
        this.logger.warn(`Email da ordem nao enviado: ${err.message}`);
      }
    }

    const telefoneFornecedor = ordem.fornecedor?.representante_telefone || ordem.fornecedor?.telefone;
    if (telefoneFornecedor) {
      try {
        const configurado = await this.whatsappService.isConfigurado(ordem.orgao_id);
        if (configurado) {
          const nomeArquivo = `ordem_${ordem.numero.replace(/\//g, '_')}.pdf`;
          const documentoBase64 = fs.readFileSync(pdfPath).toString('base64');
          const legenda = `Ordem de Fornecimento ${ordem.numero} emitida.\n\nAcesse o portal para registrar a entrega:\n${process.env.APP_URL || 'https://portaldcp.com.br'}/fornecedor/contratos/${ordem.contrato_id}`;
          await this.whatsappService.enviarDocumento(ordem.orgao_id, {
            to: telefoneFornecedor,
            documentoBase64,
            nomeArquivo,
            legenda,
            extensao: 'pdf',
            mimeType: 'application/pdf',
          });
        }
      } catch (err: any) {
        this.logger.warn(`WhatsApp da ordem nao enviado: ${err.message}`);
      }
    }

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

    // Reenvia PDF por email/WhatsApp (usa PDF assinado se disponível)
    const pdfPath = ordem.caminho_pdf && fs.existsSync(ordem.caminho_pdf)
      ? ordem.caminho_pdf
      : await this.pdfOrdemService.gerarPdf(id);
    if (ordemSalva.email_fornecedor) {
      try {
        const pdfBuffer = fs.readFileSync(pdfPath);
        const nomeArquivo = `ordem_${ordem.numero.replace(/\//g, '_')}.pdf`;
        await this.emailService.enviar(ordem.orgao_id, {
          to: ordemSalva.email_fornecedor,
          subject: `Ordem de Fornecimento ${ordem.numero} - ${ordem.fornecedor?.razao_social || ''}`,
          text: `Prezado(a) ${ordem.fornecedor?.razao_social || 'Fornecedor'},

Sua Ordem de Fornecimento ${ordem.numero} foi reenviada e está disponível em anexo.

${observacoes ? `Observações do reenvio: ${observacoes}\n\n` : ''}Para registrar a entrega dos materiais/serviços, acesse o Portal do Fornecedor:
${process.env.APP_URL || 'https://portaldcp.com.br'}/fornecedor/contratos/${ordem.contrato_id}

Atenciosamente,
${usuarioNome || 'Gestão de Contratos'}`,
          html: `<p>Prezado(a) <strong>${ordem.fornecedor?.razao_social || 'Fornecedor'}</strong>,</p>

<p>Sua <strong>Ordem de Fornecimento ${ordem.numero}</strong> foi reenviada e está disponível em anexo.</p>

${observacoes ? `<p><strong>Observações do reenvio:</strong> ${observacoes}</p>` : ''}
<p>Para registrar a entrega dos materiais/serviços, acesse o <a href="${process.env.APP_URL || 'https://portaldcp.com.br'}/fornecedor/contratos/${ordem.contrato_id}">Portal do Fornecedor</a>.</p>

<p>Atenciosamente,<br>
${usuarioNome || 'Gestão de Contratos'}</p>`,
          attachments: [{ filename: nomeArquivo, content: pdfBuffer }],
        });
      } catch (err: any) {
        this.logger.warn(`Email da ordem nao enviado: ${err.message}`);
      }
    }
    const telefoneFornecedor = ordem.fornecedor?.representante_telefone || ordem.fornecedor?.telefone;
    if (telefoneFornecedor) {
      try {
        const configurado = await this.whatsappService.isConfigurado(ordem.orgao_id);
        if (configurado) {
          const nomeArquivo = `ordem_${ordem.numero.replace(/\//g, '_')}.pdf`;
          const documentoBase64 = fs.readFileSync(pdfPath).toString('base64');
          const legenda = `Ordem de Fornecimento ${ordem.numero} reenviada.\n\nAcesse o portal para registrar a entrega:\n${process.env.APP_URL || 'https://portaldcp.com.br'}/fornecedor/contratos/${ordem.contrato_id}`;
          await this.whatsappService.enviarDocumento(ordem.orgao_id, {
            to: telefoneFornecedor,
            documentoBase64,
            nomeArquivo,
            legenda,
            extensao: 'pdf',
            mimeType: 'application/pdf',
          });
        }
      } catch (err: any) {
        this.logger.warn(`WhatsApp da ordem nao enviado: ${err.message}`);
      }
    }

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
        // Busca recebimentos aceitos (ACEITO ou ACEITO_PARCIAL - ambos têm baixa realizada)
        const recebimentos = await queryRunner.manager.find(Recebimento, {
          where: {
            ordem_fornecimento_id: id,
            status: In([StatusRecebimento.ACEITO, StatusRecebimento.ACEITO_PARCIAL]),
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
          // Cria notificação para o fornecedor (usando o fornecedor_id como usuario_id)
          await this.notificacoesService.criar({
            orgao_id: ordem.orgao_id,
            usuario_id: ordem.fornecedor_id, // Fornecedor como destinatário
            tipo: TipoNotificacao.ORDEM_CANCELADA,
            titulo: `Ordem de Fornecimento Cancelada - ${ordem.numero}`,
            mensagem: `A Ordem de Fornecimento ${ordem.numero} foi CANCELADA.\n\nMotivo: ${motivo}\n\nPor favor, desconsidere a ordem anterior.`,
            entidade_tipo: 'ordem_fornecimento',
            entidade_id: id,
            metadata: {
              destinatario_tipo: 'fornecedor',
              fornecedor_id: ordem.fornecedor_id,
            },
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

    const ordemSalva = await this.ordemRepository.save(ordem);

    // Sincroniza status da requisição vinculada (lacuna corrigida)
    if (ordem.requisicao_id) {
      const requisicao = await this.requisicaoRepository.findOne({
        where: { id: ordem.requisicao_id },
      });
      const statusSincronizaveis = [
        StatusRequisicao.ORDEM_GERADA,
        StatusRequisicao.ATENDIDA_PARCIAL,
      ];
      if (requisicao && statusSincronizaveis.includes(requisicao.status)) {
        requisicao.status = totalmenteAtendida
          ? StatusRequisicao.ATENDIDA
          : StatusRequisicao.ATENDIDA_PARCIAL;
        await this.requisicaoRepository.save(requisicao);
        this.logger.log(
          `Requisição ${requisicao.numero} sincronizada: status ${requisicao.status}`,
        );
      }
    }

    return ordemSalva;
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

    const ordemSalva = await this.ordemRepository.save(ordem);

    // Sincroniza status da requisição vinculada (reversão)
    if (ordem.requisicao_id) {
      const requisicao = await this.requisicaoRepository.findOne({
        where: { id: ordem.requisicao_id },
      });
      if (requisicao && [StatusRequisicao.ORDEM_GERADA, StatusRequisicao.ATENDIDA_PARCIAL, StatusRequisicao.ATENDIDA].includes(requisicao.status)) {
        const novoStatusReq = nenhumItemEntregue
          ? StatusRequisicao.ORDEM_GERADA
          : parcialmenteAtendida
            ? StatusRequisicao.ATENDIDA_PARCIAL
            : StatusRequisicao.ATENDIDA;
        requisicao.status = novoStatusReq;
        await this.requisicaoRepository.save(requisicao);
        this.logger.log(
          `Requisição ${requisicao.numero} sincronizada (reversão): status ${requisicao.status}`,
        );
      }
    }

    this.logger.log(`Atendimento revertido para ordem ${ordem.numero}`);

    return ordemSalva;
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
      relations: ['contrato', 'fornecedor', 'requisicao', 'orgao'],
    });

    if (!ordem) {
      throw new NotFoundException('Ordem de fornecimento não encontrada');
    }

    return ordem;
  }

  /**
   * Define como a NF será enviada quando a OF tem itens CONSUMO e PERMANENTE.
   * CONJUNTA = 1 NF para todos | SEPARADA = 2 NFs (consumo + permanente) → 2 recebimentos.
   */
  async definirModoEnvioNf(
    ordemId: string,
    modo: 'CONJUNTA' | 'SEPARADA',
    usuarioTipo: 'orgao' | 'fornecedor',
  ): Promise<OrdemFornecimento> {
    const ordem = await this.findOne(ordemId);
    const itens = ordem.itens || [];
    const temConsumo = itens.some((i: any) => (i.tipo_item || 'CONSUMO') === 'CONSUMO');
    const temPermanente = itens.some((i: any) => (i as any).tipo_item === 'PERMANENTE');

    if (!temConsumo || !temPermanente) {
      throw new BadRequestException(
        'Modo de envio de NF só se aplica a ordens com itens de consumo e permanente.',
      );
    }

    ordem.modo_envio_nf = modo;
    return this.ordemRepository.save(ordem);
  }

  /**
   * Lista ordens do fornecedor (para portal do fornecedor)
   */
  async findByFornecedor(
    fornecedorId: string,
    status?: StatusOrdemFornecimento,
    contratoId?: string,
  ): Promise<OrdemFornecimento[]> {
    try {
      const where: any = { fornecedor_id: fornecedorId };
      if (status) {
        where.status = status;
      }
      if (contratoId) {
        where.contrato_id = contratoId;
      }
      return await this.ordemRepository.find({
        where,
        relations: ['contrato', 'orgao'],
        order: { created_at: 'DESC' },
      });
    } catch (err: any) {
      this.logger.error(`findByFornecedor error: ${err?.message}`, err?.stack);
      return [];
    }
  }

  /**
   * Fornecedor dá ciência de recebimento da ordem (ENVIADA → EM_ATENDIMENTO)
   */
  async fornecedorCienciaRecebimento(
    ordemId: string,
    fornecedorId: string,
    observacao?: string,
  ): Promise<OrdemFornecimento> {
    const ordem = await this.findOne(ordemId);

    if (ordem.fornecedor_id !== fornecedorId) {
      throw new ForbiddenException('Esta ordem não pertence ao seu cadastro');
    }

    if (ordem.status !== StatusOrdemFornecimento.ENVIADA) {
      throw new BadRequestException(
        `Ordem não pode receber ciência de recebimento. Status atual: ${ordem.status}`,
      );
    }

    ordem.status = StatusOrdemFornecimento.EM_ATENDIMENTO;
    ordem.data_visualizacao_fornecedor = ordem.data_visualizacao_fornecedor || new Date();
    ordem.data_aceite_fornecedor = new Date();
    ordem.observacao_fornecedor = observacao || ordem.observacao_fornecedor;

    await this.ordemRepository.save(ordem);

    await this.registrarHistorico({
      ordemId,
      tipoAcao: TipoAcaoOrdem.ACEITA_FORNECEDOR,
      descricao: 'Fornecedor deu ciência de recebimento da ordem',
      statusNovo: StatusOrdemFornecimento.EM_ATENDIMENTO,
      usuarioTipo: 'fornecedor',
    });

    this.logger.log(`Fornecedor ${fornecedorId} deu ciência de recebimento da ordem ${ordem.numero}`);

    return this.findOne(ordemId);
  }

  /**
   * Fornecedor dá ciência de entrega (informa que entregou)
   * Nota: O recebimento definitivo e baixa no contrato são feitos pelo órgão via RecebimentoService
   */
  async fornecedorCienciaEntrega(
    ordemId: string,
    fornecedorId: string,
    dataEntrega: Date,
    observacao?: string,
  ): Promise<OrdemFornecimento> {
    const ordem = await this.findOne(ordemId);

    if (ordem.fornecedor_id !== fornecedorId) {
      throw new ForbiddenException('Esta ordem não pertence ao seu cadastro');
    }

    const statusPermitidos = [
      StatusOrdemFornecimento.ENVIADA,
      StatusOrdemFornecimento.EM_ATENDIMENTO,
      StatusOrdemFornecimento.ATENDIDA_PARCIAL,
    ];

    if (!statusPermitidos.includes(ordem.status)) {
      throw new BadRequestException(
        `Ordem não pode receber ciência de entrega. Status atual: ${ordem.status}`,
      );
    }

    ordem.data_entrega_realizada = new Date(dataEntrega);
    ordem.observacao_fornecedor = observacao
      ? `${ordem.observacao_fornecedor || ''}\n[Ciência entrega] ${observacao}`.trim()
      : ordem.observacao_fornecedor;

    if (ordem.status === StatusOrdemFornecimento.ENVIADA) {
      ordem.status = StatusOrdemFornecimento.EM_ATENDIMENTO;
    }

    await this.ordemRepository.save(ordem);

    this.logger.log(
      `Fornecedor ${fornecedorId} informou entrega da ordem ${ordem.numero} em ${dataEntrega}`,
    );

    return this.findOne(ordemId);
  }

  /**
   * Envia ou reenvia notificação (email, notificação, WhatsApp) ao fornecedor da OF.
   * Mesmo modelo da OS. Requer PDF assinado.
   */
  async enviarAoFornecedor(
    ordemId: string,
    dto?: { email_fornecedor?: string; telefone_fornecedor?: string; tipo?: 'email' | 'whatsapp' },
  ): Promise<{ notificacoes_fornecedor: { email: boolean; notificacao: boolean; whatsapp: boolean } }> {
    const ordem = await this.findOne(ordemId);
    let pdfPath = ordem.caminho_pdf;
    if (!pdfPath || !fs.existsSync(pdfPath)) {
      pdfPath = await this.pdfOrdemService.gerarPdf(ordemId);
      ordem.caminho_pdf = pdfPath;
      await this.ordemRepository.save(ordem);
    }

    const resultado = { email: false, notificacao: false, whatsapp: false };
    const fornecedor = ordem.fornecedor;
    if (!fornecedor) {
      return { notificacoes_fornecedor: resultado };
    }

    const urlBase = process.env.APP_URL || 'https://portaldcp.com.br';
    const emailFornecedor = (dto?.email_fornecedor?.trim() || fornecedor.email || '').trim();
    const telefoneFornecedor = (dto?.telefone_fornecedor?.trim() || fornecedor.representante_telefone || fornecedor.telefone || '').replace(/\D/g, '');
    const tipo = dto?.tipo;

    if ((!tipo || tipo === 'email') && emailFornecedor) {
      try {
        const pdfBuffer = fs.readFileSync(pdfPath);
        const nomeArquivo = `OF_${ordem.numero.replace(/\//g, '_')}_assinada.pdf`;
        await this.emailService.enviar(ordem.orgao_id, {
          to: emailFornecedor,
          subject: `Ordem de Fornecimento ${ordem.numero} - ${fornecedor.razao_social}`,
          text: `Prezado(a) ${fornecedor.razao_social},

Sua Ordem de Fornecimento ${ordem.numero} foi aprovada e assinada digitalmente. O documento oficial está anexado a este email.

Para visualizar o documento e registrar a entrega dos materiais/serviços, acesse o Portal do Fornecedor:
${urlBase}/fornecedor/contratos/${ordem.contrato_id}

Atenciosamente,
Gestão de Contratos`,
          html: `<p>Prezado(a) <strong>${fornecedor.razao_social}</strong>,</p>

<p>Sua <strong>Ordem de Fornecimento ${ordem.numero}</strong> foi aprovada e assinada digitalmente. O documento oficial está anexado a este email.</p>

<p>Para visualizar o documento e registrar a entrega dos materiais/serviços, acesse o <a href="${urlBase}/fornecedor/contratos/${ordem.contrato_id}">Portal do Fornecedor</a>.</p>

<p>Atenciosamente,<br>
Gestão de Contratos</p>`,
          attachments: [{ filename: nomeArquivo, content: pdfBuffer }],
        });
        resultado.email = true;
      } catch (err: any) {
        this.logger.warn(`Erro ao enviar email para fornecedor OF ${ordem.numero}: ${err.message}`);
      }
    }

    try {
      await this.notificacoesService.criar({
        orgao_id: ordem.orgao_id,
        usuario_id: fornecedor.id,
        usuario_email: emailFornecedor || undefined,
        usuario_telefone: telefoneFornecedor || undefined,
        tipo: TipoNotificacao.ORDEM_FORNECIMENTO_APROVADA,
        titulo: `Ordem de Fornecimento ${ordem.numero} aprovada`,
        mensagem: `A Ordem de Fornecimento ${ordem.numero} foi aprovada e assinada digitalmente. Verifique seu email para o documento em anexo.`,
        entidade_tipo: 'ordem_fornecimento',
        entidade_id: ordem.id,
        link: `/fornecedor/contratos/${ordem.contrato_id}`,
        enviar_email: false,
      });
      resultado.notificacao = true;
    } catch (err: any) {
      this.logger.warn(`Erro ao criar notificação para fornecedor OF ${ordem.numero}: ${err.message}`);
    }

    if ((!tipo || tipo === 'whatsapp') && telefoneFornecedor && telefoneFornecedor.length >= 10) {
      try {
        const configurado = await this.whatsappService.isConfigurado(ordem.orgao_id);
        if (configurado && ordem.contrato_id) {
          const linkPortal = `${urlBase}/fornecedor/contratos/${ordem.contrato_id}`;
          const nomeArquivo = `OF_${ordem.numero.replace(/\//g, '_')}_assinada.pdf`;
          const documentoBase64 = fs.readFileSync(pdfPath).toString('base64');
          const legenda = `Ordem de Fornecimento ${ordem.numero} aprovada e assinada digitalmente.\n\nAcesse o portal para registrar entrega:\n${linkPortal}`;
          const enviado = await this.whatsappService.enviarDocumento(ordem.orgao_id, {
            to: telefoneFornecedor,
            documentoBase64,
            nomeArquivo,
            legenda,
            extensao: 'pdf',
            mimeType: 'application/pdf',
          });
          if (enviado) resultado.whatsapp = true;
        }
      } catch (err: any) {
        this.logger.warn(`Erro ao enviar WhatsApp para fornecedor OF ${ordem.numero}: ${err.message}`);
      }
    }

    if (resultado.email || resultado.whatsapp) {
      if (ordem.status === StatusOrdemFornecimento.EMITIDA) {
        ordem.status = StatusOrdemFornecimento.ENVIADA;
        ordem.data_envio = new Date();
        ordem.email_fornecedor = emailFornecedor || ordem.email_fornecedor || null;
        await this.ordemRepository.save(ordem);
        this.logger.log(`Ordem ${ordem.numero} marcada como ENVIADA após notificação ao fornecedor`);
      }
    }

    return { notificacoes_fornecedor: resultado };
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

  async findEmAndamento(orgaoId: string): Promise<(OrdemFornecimento & { nf_disponivel?: boolean; nf_recusada?: boolean })[]> {
    const ordens = await this.ordemRepository.createQueryBuilder('ordem')
      .leftJoinAndSelect('ordem.contrato', 'contrato')
      .leftJoinAndSelect('ordem.fornecedor', 'fornecedor')
      .where('ordem.orgao_id = :orgaoId', { orgaoId })
      .andWhere('ordem.status IN (:...status)', {
        status: [
          StatusOrdemFornecimento.ENVIADA,
          StatusOrdemFornecimento.EM_ATENDIMENTO,
          StatusOrdemFornecimento.ATENDIDA_PARCIAL,
        ],
      })
      .orderBy('ordem.data_entrega_prevista', 'ASC')
      .getMany();

    if (ordens.length === 0) return ordens;

    const ordemIds = ordens.map((o) => o.id);
    const nfsDisponiveis = await this.nfRepository.find({
      where: {
        ordem_fornecimento_id: In(ordemIds),
        status: In([
          StatusNotaFiscalFornecedor.ENVIADA,
          StatusNotaFiscalFornecedor.PROCESSADA,
          StatusNotaFiscalFornecedor.VINCULADA,
        ]),
      },
      select: ['ordem_fornecimento_id'],
    });
    const nfsRecusadas = await this.nfRepository.find({
      where: {
        ordem_fornecimento_id: In(ordemIds),
        status: StatusNotaFiscalFornecedor.RECUSADA,
      },
      select: ['ordem_fornecimento_id'],
    });
    const ordensComNfDisponivel = new Set(nfsDisponiveis.map((nf) => nf.ordem_fornecimento_id));
    const ordensComNfRecusada = new Set(nfsRecusadas.map((nf) => nf.ordem_fornecimento_id));

    for (const ordem of ordens) {
      const ordemExt = ordem as OrdemFornecimento & { nf_disponivel?: boolean; nf_recusada?: boolean };
      ordemExt.nf_disponivel = ordensComNfDisponivel.has(ordem.id);
      ordemExt.nf_recusada = !ordemExt.nf_disponivel && ordensComNfRecusada.has(ordem.id);
    }
    return ordens;
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

  // ==========================================================================
  // ITENS AVULSOS (pos-NF) - documentais, nao afetam saldo do contrato
  // ==========================================================================

  private readonly STATUS_AVULSO_PERMITIDOS: StatusOrdemFornecimento[] = [
    StatusOrdemFornecimento.EMITIDA,
    StatusOrdemFornecimento.ENVIADA,
    StatusOrdemFornecimento.EM_ATENDIMENTO,
    StatusOrdemFornecimento.ATENDIDA_PARCIAL,
    StatusOrdemFornecimento.ATENDIDA,
  ];

  async adicionarItemAvulso(
    ordemId: string,
    dados: { descricao: string; quantidade: number; valor_unitario: number },
  ): Promise<OrdemFornecimento> {
    const ordem = await this.findOne(ordemId);

    if (!this.STATUS_AVULSO_PERMITIDOS.includes(ordem.status)) {
      throw new BadRequestException(
        `Nao e possivel adicionar itens avulsos em ordem com status ${ordem.status}`,
      );
    }

    const descricao = (dados.descricao || '').trim();
    if (!descricao) {
      throw new BadRequestException('Descricao do item avulso e obrigatoria');
    }
    const quantidade = Number(dados.quantidade);
    if (!quantidade || quantidade <= 0) {
      throw new BadRequestException('Quantidade deve ser maior que zero');
    }
    const valorUnitario = Number(dados.valor_unitario);
    if (!valorUnitario || valorUnitario <= 0) {
      throw new BadRequestException('Valor unitario deve ser maior que zero');
    }

    const itensAvulsos = Array.isArray(ordem.itens_avulsos) ? ordem.itens_avulsos : [];
    itensAvulsos.push({
      id: randomUUID(),
      descricao,
      quantidade,
      valor_unitario: valorUnitario,
      valor_total: Number((quantidade * valorUnitario).toFixed(2)),
    });
    ordem.itens_avulsos = itensAvulsos;

    await this.ordemRepository.save(ordem);
    this.logger.log(`Item avulso adicionado a ordem ${ordem.numero}: ${descricao}`);

    await this.regenerarPdfOrdem(ordemId, ordem.numero);

    return this.findOne(ordemId);
  }

  private async regenerarPdfOrdem(ordemId: string, numero: string): Promise<void> {
    try {
      const novoCaminho = await this.pdfOrdemService.gerarPdf(ordemId);
      await this.ordemRepository.update(ordemId, { caminho_pdf: novoCaminho });
    } catch (e) {
      this.logger.warn(`Falha ao regenerar PDF da ordem ${numero}: ${(e as Error).message}`);
    }
  }

  /**
   * Corrige a data de emissão e/ou a data/hora do quadro de assinaturas da OF e
   * regenera o PDF. Tratamento de fuso (Brasília, UTC-3):
   * - data_emissao (coluna date): grava o dia literal (o render foi corrigido para não deslocar);
   * - data_assinatura (timestamp): grava em UTC = horaBRT + 3h, para o PDF exibir a hora de Brasília.
   */
  async corrigirDatas(
    id: string,
    dto: { data_emissao?: string; data_assinatura?: string },
    adminId: string,
    adminNome: string,
  ): Promise<{ ordem: OrdemFornecimento; assinaturas_corrigidas: number; caminho_pdf: string }> {
    const ordem = await this.findOne(id);
    const detalhes: Record<string, any> = {};

    if (dto.data_emissao) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.data_emissao)) {
        throw new BadRequestException('Data de emissão deve estar no formato YYYY-MM-DD.');
      }
      detalhes.data_emissao_anterior = ordem.data_emissao;
      ordem.data_emissao = dto.data_emissao as any;
      await this.ordemRepository.save(ordem);
      detalhes.data_emissao_nova = dto.data_emissao;
    }

    let assinaturasCorrigidas = 0;
    if (dto.data_assinatura) {
      const m = dto.data_assinatura.match(
        /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/,
      );
      if (!m) {
        throw new BadRequestException('Data/hora da assinatura deve estar no formato YYYY-MM-DDTHH:mm.');
      }
      const [, ano, mes, dia, hora, min, seg] = m;
      // UTC = BRT + 3h => formatarDataHora() do PDF subtrai 3h e exibe a hora de Brasília.
      const dataAssin = new Date(
        Date.UTC(
          Number(ano),
          Number(mes) - 1,
          Number(dia),
          Number(hora) + 3,
          Number(min),
          Number(seg || '0'),
        ),
      );
      const corrigidas = await this.assinaturasService.corrigirDataAssinaturasPorEntidade(
        id,
        EntidadeTipo.ORDEM_FORNECIMENTO,
        dataAssin,
      );
      assinaturasCorrigidas = corrigidas.length;
      detalhes.data_assinatura_nova = dto.data_assinatura;
    }

    const caminhoPdf = await this.pdfOrdemService.gerarPdf(id);
    await this.ordemRepository.update(id, { caminho_pdf: caminhoPdf });

    await this.registrarHistorico({
      ordemId: id,
      tipoAcao: TipoAcaoOrdem.EDITADA,
      descricao: `Datas corrigidas por: ${adminNome}`,
      detalhes,
      usuarioId: adminId,
      usuarioNome: adminNome,
    });

    this.logger.log(`Datas da ordem ${ordem.numero} corrigidas por ${adminNome}`);
    return {
      ordem: await this.findOne(id),
      assinaturas_corrigidas: assinaturasCorrigidas,
      caminho_pdf: caminhoPdf,
    };
  }

  /** Regenera o PDF da OF (sem alterar datas). */
  async regenerarPdf(id: string): Promise<{ caminho_pdf: string }> {
    const ordem = await this.findOne(id);
    const caminho = await this.pdfOrdemService.gerarPdf(id);
    await this.ordemRepository.update(id, { caminho_pdf: caminho });
    this.logger.log(`PDF da ordem ${ordem.numero} regenerado.`);
    return { caminho_pdf: caminho };
  }

  async removerItemAvulso(ordemId: string, itemId: string): Promise<OrdemFornecimento> {
    const ordem = await this.findOne(ordemId);

    if (!this.STATUS_AVULSO_PERMITIDOS.includes(ordem.status)) {
      throw new BadRequestException(
        `Nao e possivel remover itens avulsos em ordem com status ${ordem.status}`,
      );
    }

    const itensAvulsos = Array.isArray(ordem.itens_avulsos) ? ordem.itens_avulsos : [];
    const novoArray = itensAvulsos.filter((i) => i.id !== itemId);
    if (novoArray.length === itensAvulsos.length) {
      throw new NotFoundException('Item avulso nao encontrado na ordem');
    }
    ordem.itens_avulsos = novoArray;

    await this.ordemRepository.save(ordem);
    this.logger.log(`Item avulso removido da ordem ${ordem.numero}`);

    await this.regenerarPdfOrdem(ordemId, ordem.numero);

    return this.findOne(ordemId);
  }
}
