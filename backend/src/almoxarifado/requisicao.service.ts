import { Injectable, NotFoundException, BadRequestException, Logger, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Requisicao, StatusRequisicao, TipoRequisicao, PrioridadeRequisicao } from './entities/requisicao.entity';
import { RequisicaoItemOS } from './entities/requisicao-item-os.entity';
import { RequisicaoEtapaOS } from './entities/requisicao-etapa-os.entity';
import { ItemRequisicao, StatusItemRequisicao } from './entities/item-requisicao.entity';
import { ItemContrato } from './entities/item-contrato.entity';
import { OrdemFornecimento } from './entities/ordem-fornecimento.entity';
import { Contrato, StatusContrato } from '../contratos/entities/contrato.entity';
import { ItemCronograma } from '../contratos/entities/item-cronograma.entity';
import { EtapaCronograma } from '../contratos/entities/etapa-cronograma.entity';
import { ItemContratoService } from './item-contrato.service';
import { ConfiguracaoAprovacaoService } from './configuracao-aprovacao.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { OrdemFornecimentoService } from './ordem-fornecimento.service';
import { RecebimentoService } from './recebimento.service';
import { GerarOrdemDto } from './dto/ordem-fornecimento.dto';
import { Recebimento, StatusRecebimento } from './entities/recebimento.entity';
import { NotaFiscalFornecedor } from './entities/nota-fiscal-fornecedor.entity';
import { StatusOrdemFornecimento } from './entities/ordem-fornecimento.entity';
import { DossieOrdem } from './entities/dossie-ordem.entity';
import { DossieAnexo } from './entities/dossie-anexo.entity';
import { 
  CriarRequisicaoDto, 
  AtualizarRequisicaoDto, 
  AutorizarRequisicaoDto,
  NegarRequisicaoDto,
  DevolverRequisicaoDto,
  EnviarAoFornecedorDto,
  CorrigirDataAutorizacaoOSDto,
} from './dto/criar-requisicao.dto';

import { AssinaturasService } from '../assinaturas/assinaturas.service';
import { GeradorPdfService } from '../assinaturas/gerador-pdf.service';
import { HistoricoRequisicao } from './entities/historico-requisicao.entity';
import { EntidadeTipo, PapelAssinante } from '../assinaturas/entities/assinatura-digital.entity';
import { EmailService } from '../email/email.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { TipoNotificacao } from '../notificacoes/entities/notificacao.entity';
import * as fs from 'fs';
import { Usuario } from '../usuarios/entities/usuario.entity';

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
    @InjectRepository(Contrato)
    private readonly contratoRepository: Repository<Contrato>,
    @InjectRepository(RequisicaoItemOS)
    private readonly requisicaoItemOSRepository: Repository<RequisicaoItemOS>,
    @InjectRepository(RequisicaoEtapaOS)
    private readonly requisicaoEtapaOSRepository: Repository<RequisicaoEtapaOS>,
    @InjectRepository(ItemCronograma)
    private readonly itemCronogramaRepository: Repository<ItemCronograma>,
    @InjectRepository(EtapaCronograma)
    private readonly etapaCronogramaRepository: Repository<EtapaCronograma>,
    @InjectRepository(HistoricoRequisicao)
    private readonly historicoRequisicaoRepository: Repository<HistoricoRequisicao>,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
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
    private readonly assinaturasService: AssinaturasService,
    private readonly geradorPdfService: GeradorPdfService,
    private readonly emailService: EmailService,
    private readonly whatsappService: WhatsAppService,
  ) {}

  /** Soma quantidade_solicitada por item_cronograma de OS ativas do contrato. excludeRequisicaoId: ao editar, exclui a OS atual do somatório. */
  private async somarQuantidadeComprometidaPorItemOS(contratoId: string, excludeRequisicaoId?: string): Promise<Map<string, number>> {
    const statusMedicoesQueConsomemOS = [
      'SUBMETIDA',
      'AGUARDANDO_ATESTE',
      'PARCIALMENTE_ATESTADA',
      'AGUARDANDO_APROVACAO',
      'APROVADA',
    ];
    const qb = this.requisicaoItemOSRepository
      .createQueryBuilder('rio')
      .select('rio.item_cronograma_id', 'id')
      .addSelect('COALESCE(SUM(rio.quantidade_solicitada), 0)', 'total')
      .innerJoin('rio.requisicao', 'r')
      .where('r.contrato_id = :cid', { cid: contratoId })
      .andWhere('r.tipo = :tipo', { tipo: TipoRequisicao.ORDEM_SERVICO })
      .andWhere('r.status IN (:...status)', {
        status: [
          StatusRequisicao.RASCUNHO,
          StatusRequisicao.AGUARDANDO_AUTORIZACAO,
          StatusRequisicao.AUTORIZADA,
        ],
      })
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM medicoes m
          WHERE m.requisicao_id = r.id
            AND m.status IN (:...statusMedicoesQueConsomemOS)
        )`,
        { statusMedicoesQueConsomemOS },
      );
    if (excludeRequisicaoId) qb.andWhere('r.id != :excludeId', { excludeId: excludeRequisicaoId });
    const rows = await qb.groupBy('rio.item_cronograma_id').getRawMany<{ id: string; total: string }>();
    const mapa = new Map<string, number>();
    for (const r of rows) mapa.set(r.id, Number(r.total));
    return mapa;
  }

  /** Soma valor_solicitado por etapa_id de OS ativas do contrato. excludeRequisicaoId: ao editar, exclui a OS atual do somatório. */
  private async somarValorComprometidoPorEtapaOS(contratoId: string, excludeRequisicaoId?: string): Promise<Map<string, number>> {
    const statusMedicoesQueConsomemOS = [
      'SUBMETIDA',
      'AGUARDANDO_ATESTE',
      'PARCIALMENTE_ATESTADA',
      'AGUARDANDO_APROVACAO',
      'APROVADA',
    ];
    const qb = this.requisicaoEtapaOSRepository
      .createQueryBuilder('reo')
      .select('reo.etapa_id', 'id')
      .addSelect('COALESCE(SUM(reo.valor_solicitado), 0)', 'total')
      .innerJoin('reo.requisicao', 'r')
      .where('r.contrato_id = :cid', { cid: contratoId })
      .andWhere('r.tipo = :tipo', { tipo: TipoRequisicao.ORDEM_SERVICO })
      .andWhere('r.status IN (:...status)', {
        status: [
          StatusRequisicao.RASCUNHO,
          StatusRequisicao.AGUARDANDO_AUTORIZACAO,
          StatusRequisicao.AUTORIZADA,
        ],
      })
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM medicoes m
          WHERE m.requisicao_id = r.id
            AND m.status IN (:...statusMedicoesQueConsomemOS)
        )`,
        { statusMedicoesQueConsomemOS },
      );
    if (excludeRequisicaoId) qb.andWhere('r.id != :excludeId', { excludeId: excludeRequisicaoId });
    const rows = await qb.groupBy('reo.etapa_id').getRawMany<{ id: string; total: string }>();
    const mapa = new Map<string, number>();
    for (const r of rows) mapa.set(r.id, Number(r.total));
    return mapa;
  }

  /**
   * Envia email (com PDF), notificação no sistema e WhatsApp ao fornecedor da OS.
   * Retorna o resultado de cada envio.
   */
  private async notificarFornecedorOS(
    requisicao: Requisicao,
    pdfPath: string,
    urlBase: string,
    overrides?: { email?: string; telefone?: string; tipo?: 'email' | 'whatsapp' },
  ): Promise<{ email: boolean; notificacao: boolean; whatsapp: boolean }> {
    const resultado = { email: false, notificacao: false, whatsapp: false };
    const fornecedor = requisicao.contrato?.fornecedor;
    if (!fornecedor) return resultado;

    const emailFornecedor = (overrides?.email?.trim() || fornecedor.email || '').trim();
    const telefoneFornecedor = (overrides?.telefone?.trim() || fornecedor.representante_telefone || fornecedor.telefone || '').replace(/\D/g, '');
    const tipo = overrides?.tipo;

    if ((!tipo || tipo === 'email') && emailFornecedor) {
      try {
        const pdfBuffer = fs.readFileSync(pdfPath);
        const nomeArquivo = `OS_${requisicao.numero.replace(/\//g, '_')}_assinada.pdf`;
        await this.emailService.enviar(requisicao.orgao_id, {
          to: emailFornecedor,
          subject: `Ordem de Serviço ${requisicao.numero} - ${fornecedor.razao_social}`,
          text: `Prezado(a) ${fornecedor.razao_social},

Sua Ordem de Serviço ${requisicao.numero} foi aprovada e assinada digitalmente. O documento oficial está anexado a este email.

Para visualizar o documento e acompanhar a execução dos serviços, acesse o Portal do Fornecedor através do link abaixo:
${urlBase}/fornecedor/contratos/${requisicao.contrato_id}

Atenciosamente,
${requisicao.usuario_autorizador_nome || 'Gestão de Contratos'}`,
          html: `<p>Prezado(a) <strong>${fornecedor.razao_social}</strong>,</p>

<p>Sua <strong>Ordem de Serviço ${requisicao.numero}</strong> foi aprovada e assinada digitalmente. O documento oficial está anexado a este email.</p>

<p>Para visualizar o documento e acompanhar a execução dos serviços, acesse o <a href="${urlBase}/fornecedor/contratos/${requisicao.contrato_id}">Portal do Fornecedor</a>.</p>

<p>Atenciosamente,<br>
${requisicao.usuario_autorizador_nome || 'Gestão de Contratos'}</p>`,
          attachments: [{ filename: nomeArquivo, content: pdfBuffer }],
        });
        resultado.email = true;
        this.logger.log(`Email enviado ao fornecedor ${fornecedor.razao_social} para OS ${requisicao.numero}`);
      } catch (err: any) {
        this.logger.warn(`Erro ao enviar email para fornecedor OS ${requisicao.numero}: ${err.message}`);
      }
    }

    try {
      await this.notificacoesService.criar({
        orgao_id: requisicao.orgao_id,
        usuario_id: fornecedor.id,
        usuario_email: emailFornecedor || undefined,
        usuario_telefone: telefoneFornecedor || undefined,
        tipo: TipoNotificacao.ORDEM_SERVICO_APROVADA,
        titulo: `Ordem de Serviço ${requisicao.numero} aprovada`,
        mensagem: `A Ordem de Serviço ${requisicao.numero} foi aprovada e assinada digitalmente. Verifique seu email para o documento em anexo.`,
        entidade_tipo: 'requisicao',
        entidade_id: requisicao.id,
        link: `/fornecedor/contratos/${requisicao.contrato_id}`,
        enviar_email: false,
      });
      resultado.notificacao = true;
    } catch (err: any) {
      this.logger.warn(`Erro ao criar notificação para fornecedor OS ${requisicao.numero}: ${err.message}`);
    }

    if ((!tipo || tipo === 'whatsapp') && telefoneFornecedor && telefoneFornecedor.length >= 10) {
      try {
        const configurado = await this.whatsappService.isConfigurado(requisicao.orgao_id);
        if (configurado && requisicao.contrato_id) {
          const linkPortal = `${urlBase}/fornecedor/contratos/${requisicao.contrato_id}`;
          const nomeArquivo = `OS_${requisicao.numero.replace(/\//g, '_')}_assinada.pdf`;
          const documentoBase64 = fs.readFileSync(pdfPath).toString('base64');
          const legenda = `Ordem de Servico ${requisicao.numero} aprovada e assinada digitalmente.\n\nAcesse o portal para acompanhar:\n${linkPortal}`;
          const enviado = await this.whatsappService.enviarDocumento(requisicao.orgao_id, {
            to: telefoneFornecedor,
            documentoBase64,
            nomeArquivo,
            legenda,
            extensao: 'pdf',
            mimeType: 'application/pdf',
          });
          if (enviado) resultado.whatsapp = true;
          this.logger.log(`PDF da OS enviado por WhatsApp ao fornecedor ${fornecedor.razao_social} para OS ${requisicao.numero}`);
        }
      } catch (err: any) {
        this.logger.warn(`Erro ao enviar WhatsApp para fornecedor OS ${requisicao.numero}: ${err.message}`);
      }
    }

    return resultado;
  }

  private async normalizarStatusLegadoOS(requisicao: Requisicao): Promise<Requisicao> {
    if (
      requisicao.tipo === TipoRequisicao.ORDEM_SERVICO &&
      requisicao.status === StatusRequisicao.ORDEM_GERADA &&
      !requisicao.ordem_fornecimento_id
    ) {
      requisicao.status = StatusRequisicao.AUTORIZADA;
      await this.requisicaoRepository.save(requisicao);
    }

    return requisicao;
  }

  /**
   * Envia email (com PDF), notificação no sistema e WhatsApp ao fornecedor da OF.
   * Mesmo modelo da notificarFornecedorOS.
   */
  private async notificarFornecedorOF(
    ordem: OrdemFornecimento & { fornecedor?: { id: string; razao_social?: string; email?: string; representante_telefone?: string; telefone?: string }; contrato_id?: string },
    pdfPath: string,
    urlBase: string,
    overrides?: { email?: string; telefone?: string },
  ): Promise<{ email: boolean; notificacao: boolean; whatsapp: boolean }> {
    const resultado = { email: false, notificacao: false, whatsapp: false };
    const fornecedor = ordem.fornecedor;
    if (!fornecedor) return resultado;

    const emailFornecedor = (overrides?.email?.trim() || fornecedor.email || '').trim();
    const telefoneFornecedor = (overrides?.telefone?.trim() || fornecedor.representante_telefone || fornecedor.telefone || '').replace(/\D/g, '');

    if (emailFornecedor) {
      try {
        const pdfBuffer = fs.readFileSync(pdfPath);
        const nomeArquivo = `OF_${ordem.numero.replace(/\//g, '_')}_assinada.pdf`;
        await this.emailService.enviar(ordem.orgao_id, {
          to: emailFornecedor,
          subject: `Ordem de Fornecimento ${ordem.numero} - ${fornecedor.razao_social}`,
          text: `Prezado(a) ${fornecedor.razao_social},

Sua Ordem de Fornecimento ${ordem.numero} foi aprovada e assinada digitalmente. O documento oficial está anexado a este email.

Para visualizar o documento e registrar a entrega dos materiais/serviços, acesse o Portal do Fornecedor através do link abaixo:
${urlBase}/fornecedor/contratos/${ordem.contrato_id}

Atenciosamente,
${ordem.usuario_autorizador_nome || 'Gestão de Contratos'}`,
          html: `<p>Prezado(a) <strong>${fornecedor.razao_social}</strong>,</p>

<p>Sua <strong>Ordem de Fornecimento ${ordem.numero}</strong> foi aprovada e assinada digitalmente. O documento oficial está anexado a este email.</p>

<p>Para visualizar o documento e registrar a entrega dos materiais/serviços, acesse o <a href="${urlBase}/fornecedor/contratos/${ordem.contrato_id}">Portal do Fornecedor</a>.</p>

<p>Atenciosamente,<br>
${ordem.usuario_autorizador_nome || 'Gestão de Contratos'}</p>`,
          attachments: [{ filename: nomeArquivo, content: pdfBuffer }],
        });
        resultado.email = true;
        this.logger.log(`Email enviado ao fornecedor ${fornecedor.razao_social} para OF ${ordem.numero}`);
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

    if (telefoneFornecedor && telefoneFornecedor.length >= 10) {
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
          this.logger.log(`PDF da OF enviado por WhatsApp ao fornecedor ${fornecedor.razao_social} para OF ${ordem.numero}`);
        }
      } catch (err: any) {
        this.logger.warn(`Erro ao enviar WhatsApp para fornecedor OF ${ordem.numero}: ${err.message}`);
      }
    }

    return resultado;
  }

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
    const prefixo = dto.tipo === TipoRequisicao.ORDEM_SERVICO ? 'OS' : 'REQ';
    const numero = `${prefixo}-${String(sequencial).padStart(4, '0')}/${ano}`;

    // =========================================================================
    // VALIDA STATUS DO CONTRATO - Só permite requisições em contratos VIGENTES
    // =========================================================================
    if (dto.contrato_id) {
      const contrato = await this.contratoRepository.findOne({ where: { id: dto.contrato_id } });
      if (!contrato) {
        throw new BadRequestException('Contrato não encontrado');
      }
      if (contrato.status !== StatusContrato.VIGENTE) {
        throw new BadRequestException(
          `Não é possível criar requisições para este contrato. ` +
          `O contrato precisa estar VIGENTE (liberado para pedidos). Status atual: ${contrato.status}`
        );
      }

      // Para OS: regras Global vs Demanda
      if (dto.tipo === TipoRequisicao.ORDEM_SERVICO) {
        const statusMedicoesQueConsomemOS = [
          'SUBMETIDA',
          'AGUARDANDO_ATESTE',
          'PARCIALMENTE_ATESTADA',
          'AGUARDANDO_APROVACAO',
          'APROVADA',
        ];
        const statusAtivos = [
          StatusRequisicao.RASCUNHO,
          StatusRequisicao.AGUARDANDO_AUTORIZACAO,
          StatusRequisicao.AUTORIZADA,
        ];
        const osAtivas = await this.requisicaoRepository
          .createQueryBuilder('r')
          .where('r.contrato_id = :contratoId', { contratoId: dto.contrato_id })
          .andWhere('r.tipo = :tipo', { tipo: TipoRequisicao.ORDEM_SERVICO })
          .andWhere('r.status IN (:...statusAtivos)', { statusAtivos })
          .andWhere(
            `NOT EXISTS (
              SELECT 1 FROM medicoes m
              WHERE m.requisicao_id = r.id
                AND m.status IN (:...statusMedicoesQueConsomemOS)
            )`,
            { statusMedicoesQueConsomemOS },
          )
          .getMany();
        const osGlobalAtiva = osAtivas.find(o => o.modo_os === 'ORDEM_GLOBAL');
        if (osGlobalAtiva && (!dto.modo_os || dto.modo_os === 'ORDEM_GLOBAL')) {
          throw new BadRequestException(
            `Já existe uma OS Global ativa para este contrato (${osGlobalAtiva.numero}). ` +
            `Conclua ou cancele a OS atual antes de criar uma nova.`
          );
        }
      }
    }

    // =========================================================================
    // ORDEM DE SERVIÇO: Não tem itens, é global para o contrato
    // =========================================================================
    if (dto.tipo === TipoRequisicao.ORDEM_SERVICO) {
      if (!dto.contrato_id) {
        throw new BadRequestException('Ordem de Serviço deve estar vinculada a um contrato');
      }
      const temItensOuEtapas = (dto.modo_os && (dto.itens_os?.length || dto.etapas_os?.length));
      if (!dto.descricao_os && !temItensOuEtapas) {
        throw new BadRequestException('Descrição da OS ou itens/etapas da OS são obrigatórios');
      }

      const contrato = await this.contratoRepository.findOne({ where: { id: dto.contrato_id } });

      // Validar saldo para OS Demanda (itens e etapas)
      if (dto.modo_os === 'ORDEM_DEMANDA' && dto.contrato_id) {
        if (dto.itens_os?.length) {
          const comprometidoPorItem = await this.somarQuantidadeComprometidaPorItemOS(dto.contrato_id);
          for (const io of dto.itens_os) {
            const itemCron = await this.itemCronogramaRepository.findOne({ where: { id: io.item_cronograma_id } });
            if (!itemCron) throw new BadRequestException(`Item do cronograma ${io.item_cronograma_id} não encontrado`);
            if (itemCron.contrato_id !== dto.contrato_id) throw new BadRequestException(`Item não pertence ao contrato`);
            const qtdTotal = Number(itemCron.quantidade) * (Number(itemCron.quantidade_meses) || 1);
            const medido = Number(itemCron.quantidade_medida || 0);
            const comprometido = comprometidoPorItem.get(io.item_cronograma_id) || 0;
            const saldo = qtdTotal - medido - comprometido;
            if (Number(io.quantidade_solicitada) > saldo + 0.0001) {
              throw new BadRequestException(
                `Quantidade solicitada do item "${itemCron.descricao}" excede o saldo disponível (${saldo.toFixed(2)})`
              );
            }
          }
        }
        if (dto.etapas_os?.length) {
          const comprometidoPorEtapa = await this.somarValorComprometidoPorEtapaOS(dto.contrato_id);
          for (const eo of dto.etapas_os) {
            const etapa = await this.etapaCronogramaRepository.findOne({ where: { id: eo.etapa_id } });
            if (!etapa) throw new BadRequestException(`Etapa ${eo.etapa_id} não encontrada`);
            if (etapa.contrato_id !== dto.contrato_id) throw new BadRequestException(`Etapa não pertence ao contrato`);
            const valorPrevisto = Number(etapa.valor_previsto);
            const valorExecutado = Number(etapa.valor_executado || 0);
            const comprometido = comprometidoPorEtapa.get(eo.etapa_id) || 0;
            const saldo = valorPrevisto - valorExecutado - comprometido;
            const valorSolicitado = Number(eo.valor_solicitado ?? 0);
            if (valorSolicitado > saldo + 0.01) {
              throw new BadRequestException(
                `Valor solicitado da etapa "${etapa.descricao}" excede o saldo disponível (R$ ${saldo.toFixed(2)})`
              );
            }
          }
        }
      }

      const novaOS = new Requisicao();
      novaOS.orgao_id = orgaoId;
      novaOS.contrato_id = dto.contrato_id;
      novaOS.numero = numero;
      novaOS.ano = ano;
      novaOS.sequencial = sequencial;
      novaOS.tipo = TipoRequisicao.ORDEM_SERVICO;
      novaOS.setor_solicitante = dto.setor_solicitante;
      novaOS.codigo_setor = dto.codigo_setor || null;
      novaOS.local_entrega = dto.local_entrega || null;
      novaOS.justificativa = dto.justificativa;
      novaOS.prioridade = dto.prioridade || PrioridadeRequisicao.NORMAL;
      novaOS.data_necessidade = dto.data_necessidade ? new Date(dto.data_necessidade) : null;
      novaOS.usuario_solicitante_id = usuarioId;
      novaOS.usuario_solicitante_nome = usuarioNome;
      novaOS.usuario_solicitante_email = usuarioEmail || null;
      novaOS.data_solicitacao = new Date();
      novaOS.status = StatusRequisicao.RASCUNHO;
      // Calcula valor_total_estimado a partir dos itens solicitados (não do valor global do contrato)
      let valorTotalOS = 0;
      if (dto.itens_os?.length) {
        for (const io of dto.itens_os) {
          if (Number(io.quantidade_solicitada) > 0) {
            const ic = await this.itemCronogramaRepository.findOne({ where: { id: io.item_cronograma_id }, select: ['id', 'valor_unitario'] });
            if (ic) valorTotalOS += Number(io.quantidade_solicitada) * Number(ic.valor_unitario ?? 0);
          }
        }
      }
      novaOS.valor_total_estimado = valorTotalOS || (contrato ? Number(contrato.valor_global) : 0);
      novaOS.saldo_reservado = false;
      novaOS.observacoes = dto.observacoes || null;
      // Campos específicos de OS
      novaOS.descricao_os = dto.descricao_os ?? null;
      novaOS.local_execucao = dto.local_execucao || null;
      novaOS.data_inicio_prevista = dto.data_inicio_prevista ? new Date(dto.data_inicio_prevista) as any : null;
      novaOS.data_fim_prevista = dto.data_fim_prevista ? new Date(dto.data_fim_prevista) as any : null;
      novaOS.prazo_execucao_dias = dto.prazo_execucao_dias || null;
      novaOS.responsavel_tecnico = dto.responsavel_tecnico || null;
      novaOS.fiscal_contrato_id = dto.fiscal_contrato_id || null;
      novaOS.fiscal_contrato_nome = dto.fiscal_contrato_nome || null;
      novaOS.modo_os = dto.modo_os || null;
      novaOS.numeros_empenhos = dto.numeros_empenhos?.length ? JSON.stringify(dto.numeros_empenhos) : null;

      const osSalva = await this.requisicaoRepository.save(novaOS);

      if (dto.itens_os?.length) {
        const itensOS = dto.itens_os.map(io => {
          const item = new RequisicaoItemOS();
          item.requisicao_id = osSalva.id;
          item.item_cronograma_id = io.item_cronograma_id;
          item.quantidade_solicitada = Number(io.quantidade_solicitada);
          item.meses_solicitados = io.meses_solicitados != null ? Number(io.meses_solicitados) : null;
          return item;
        });
        await this.requisicaoItemOSRepository.save(itensOS);
        this.logger.log(`OS ${numero}: ${itensOS.length} itens do cronograma vinculados`);
      }

      if (dto.etapas_os?.length) {
        const etapasOS = dto.etapas_os.map(eo => {
          const item = new RequisicaoEtapaOS();
          item.requisicao_id = osSalva.id;
          item.etapa_id = eo.etapa_id;
          item.percentual_solicitado = Number(eo.percentual_solicitado ?? 0);
          item.valor_solicitado = Number(eo.valor_solicitado ?? 0);
          return item;
        });
        await this.requisicaoEtapaOSRepository.save(etapasOS);
        this.logger.log(`OS ${numero}: ${etapasOS.length} etapas do cronograma vinculadas`);
      }

      const detalhesEmpenhoOS = dto.numeros_empenhos?.length
        ? `Empenho(s) vinculado(s): ${dto.numeros_empenhos.join(', ')}`
        : null;
      await this.historicoRequisicaoRepository.save(
        this.historicoRequisicaoRepository.create({
          requisicao_id: osSalva.id,
          tipo_acao: 'PEDIDO_CRIADO',
          descricao: `Movimentação feita por: ${usuarioNome}`,
          detalhes: detalhesEmpenhoOS,
          usuario_id: usuarioId,
          usuario_nome: usuarioNome,
          data_evento: new Date(),
        }),
      );

      this.logger.log(`OS ${numero} criada para contrato ${contrato?.numero_contrato}`);
      return this.findOne(osSalva.id);
    }

    // =========================================================================
    // REQUISIÇÃO NORMAL: Saldo é reservado no momento da CRIAÇÃO do pedido
    // =========================================================================
    
    if (!dto.itens || dto.itens.length === 0) {
      throw new BadRequestException('Requisição deve ter pelo menos um item');
    }

    // Valida e prepara itens do contrato
    let valorTotalEstimado = 0;
    const itensParaCriar: Partial<ItemRequisicao>[] = [];
    const itensContratoParaReservar: { itemContrato: ItemContrato; quantidade: number }[] = [];

    for (const itemDto of dto.itens) {
      let valorUnitario = itemDto.valor_unitario || 0;
      let unidadeMedida = itemDto.unidade_medida;

      // Se tem item_contrato_id, busca informações e VALIDA SALDO
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

        // VALIDA SALDO - BLOQUEIA SE NÃO TIVER SALDO SUFICIENTE
        const saldoDisponivel = Number(itemContrato.quantidade_contratada) - 
                                Number(itemContrato.quantidade_empenhada) - 
                                Number(itemContrato.quantidade_entregue);
        
        if (saldoDisponivel < itemDto.quantidade_solicitada) {
          throw new BadRequestException(
            `Saldo insuficiente para item "${itemContrato.descricao}". ` +
            `Disponível: ${saldoDisponivel.toFixed(4)}, Solicitado: ${itemDto.quantidade_solicitada}`
          );
        }

        // Guarda para reservar depois de criar a requisição
        itensContratoParaReservar.push({
          itemContrato,
          quantidade: itemDto.quantidade_solicitada,
        });

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
        // Já marca como RESERVADO se tiver item de contrato
        status: itemDto.item_contrato_id ? StatusItemRequisicao.RESERVADO : StatusItemRequisicao.PENDENTE,
      });
    }

    // Usa transação para garantir atomicidade (criar requisição + reservar saldo)
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
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
      // Saldo já reservado na criação!
      novaRequisicao.saldo_reservado = itensContratoParaReservar.length > 0;
      novaRequisicao.observacoes = dto.observacoes || null;
      novaRequisicao.numeros_empenhos = dto.numeros_empenhos?.length ? JSON.stringify(dto.numeros_empenhos) : null;

      const requisicaoSalva = await queryRunner.manager.save(novaRequisicao);

      // Cria itens da requisição
      const itensParaSalvar: ItemRequisicao[] = [];
      for (const item of itensParaCriar) {
        const novoItem = new ItemRequisicao();
        Object.assign(novoItem, item);
        novoItem.requisicao_id = requisicaoSalva.id;
        itensParaSalvar.push(novoItem);
      }

      await queryRunner.manager.save(itensParaSalvar);

      // RESERVA SALDO NO CONTRATO IMEDIATAMENTE
      for (const { itemContrato, quantidade } of itensContratoParaReservar) {
        // Lock pessimista para evitar race conditions
        const itemContratoLocked = await queryRunner.manager.findOne(ItemContrato, {
          where: { id: itemContrato.id },
          lock: { mode: 'pessimistic_write' },
        });

        if (itemContratoLocked) {
          // Reserva saldo
          itemContratoLocked.quantidade_empenhada = Number(itemContratoLocked.quantidade_empenhada) + quantidade;
          itemContratoLocked.saldo_disponivel = Number(itemContratoLocked.quantidade_contratada) - 
                                                Number(itemContratoLocked.quantidade_empenhada) - 
                                                Number(itemContratoLocked.quantidade_entregue);

          await queryRunner.manager.save(itemContratoLocked);

          this.logger.log(
            `[CRIAR] Saldo reservado: Item "${itemContratoLocked.descricao}", ` +
            `Quantidade: ${quantidade}, Novo saldo: ${itemContratoLocked.saldo_disponivel}`
          );
        }
      }

      await queryRunner.commitTransaction();

      // Histórico: PEDIDO CRIADO (requisição é o pedido desde o início)
      const detalhesEmpenhoReq = dto.numeros_empenhos?.length
        ? `Empenho(s) vinculado(s): ${dto.numeros_empenhos.join(', ')}`
        : null;
      await this.historicoRequisicaoRepository.save(
        this.historicoRequisicaoRepository.create({
          requisicao_id: requisicaoSalva.id,
          tipo_acao: 'PEDIDO_CRIADO',
          descricao: `Movimentação feita por: ${usuarioNome}`,
          detalhes: detalhesEmpenhoReq,
          usuario_id: usuarioId,
          usuario_nome: usuarioNome,
          data_evento: new Date(),
        }),
      );

      this.logger.log(
        `Requisição ${numero} criada com ${itensParaSalvar.length} itens. ` +
        `Saldo reservado para ${itensContratoParaReservar.length} itens de contrato.`
      );

      return this.findOne(requisicaoSalva.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Erro ao criar requisição: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ============================================================================
  // ENVIAR PARA AUTORIZAÇÃO
  // ============================================================================

  async enviarParaAutorizacao(id: string, usuariosOrgao?: { id: string; perfil: string; email?: string; telefone?: string }[]): Promise<Requisicao> {
    const requisicao = await this.findOne(id);

    if (requisicao.status !== StatusRequisicao.RASCUNHO) {
      throw new BadRequestException(
        `Requisição não pode ser enviada para autorização. Status atual: ${requisicao.status}`
      );
    }

    // OS não tem itens — apenas requisições normais precisam de itens
    if (requisicao.tipo !== TipoRequisicao.ORDEM_SERVICO) {
      if (!requisicao.itens || requisicao.itens.length === 0) {
        throw new BadRequestException('Requisição deve ter pelo menos um item');
      }
    }

    requisicao.status = StatusRequisicao.AGUARDANDO_AUTORIZACAO;
    const saved = await this.requisicaoRepository.save(requisicao);

    // Histórico: ENVIADA PARA APROVAÇÃO (todas as requisições)
    await this.historicoRequisicaoRepository.save(
      this.historicoRequisicaoRepository.create({
        requisicao_id: requisicao.id,
        tipo_acao: 'ENVIADA_APROVACAO',
        descricao: `Enviada para aprovação por: ${requisicao.usuario_solicitante_nome || 'Sistema'}`,
        usuario_id: requisicao.usuario_solicitante_id || null,
        usuario_nome: requisicao.usuario_solicitante_nome || 'Sistema',
        data_evento: new Date(),
      }),
    );

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
            requisicao.tipo,
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

    // =========================================================================
    // NOVA LÓGICA: Saldo JÁ FOI RESERVADO na criação do pedido
    // Na autorização apenas processamos ajustes de quantidade (se houver)
    // =========================================================================

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // =========================================================================
      // ORDEM DE SERVIÇO: Autorização simplificada (sem itens, sem saldo)
      // =========================================================================
      if (requisicao.tipo === TipoRequisicao.ORDEM_SERVICO) {
        requisicao.status = StatusRequisicao.AUTORIZADA;
        requisicao.usuario_autorizador_id = autorizadorId;
        requisicao.usuario_autorizador_nome = autorizadorNome;
        requisicao.data_autorizacao = new Date();
        requisicao.observacao_autorizador = dto.observacao || null;

        await queryRunner.manager.save(requisicao);
        await queryRunner.commitTransaction();

        await this.historicoRequisicaoRepository.save(
          this.historicoRequisicaoRepository.create({
            requisicao_id: requisicao.id,
            tipo_acao: 'PEDIDO_AUTORIZADO',
            descricao: `Movimentação feita por: ${autorizadorNome}`,
            usuario_id: autorizadorId,
            usuario_nome: autorizadorNome,
            data_evento: new Date(),
          }),
        );

        this.logger.log(`OS ${requisicao.numero} autorizada por ${autorizadorNome}`);

        const notificacoesFornecedor = { email: false, notificacao: false, whatsapp: false };

        // =========================================================================
        // ASSINATURA DIGITAL: Registra assinatura e gera PDF carimbado
        // =========================================================================
        try {
          const urlBase = process.env.APP_URL || 'https://portaldcp.com.br';
          
          // Buscar cargo do usuário
          const usuario = await this.usuarioRepository.findOne({ where: { id: autorizadorId } });
          const cargo = usuario?.cargo || 'Gestor / Ordenador de Despesa';
          
          const assinatura = await this.assinaturasService.registrarAssinatura({
            orgao_id: requisicao.orgao_id,
            entidade_tipo: EntidadeTipo.ORDEM_SERVICO,
            entidade_id: requisicao.id,
            papel_assinante: PapelAssinante.GESTOR,
            usuario_id: autorizadorId,
            usuario_nome: usuario?.nome || autorizadorNome,
            usuario_cpf_cnpj: '',
            usuario_cargo: cargo,
            usuario_telefone: undefined,
            ip_address: undefined,
            user_agent: undefined,
          });

          // Recarrega com todas as relações necessárias para o PDF
          const requisicaoParaPdf = await this.requisicaoRepository.findOne({
            where: { id: requisicao.id },
            relations: [
              'itens', 'itens.item_contrato',
              'itensOS', 'itensOS.itemCronograma',
              'etapasOS', 'etapasOS.etapa',
              'contrato', 'contrato.fornecedor',
              'orgao',
            ],
          }) || requisicao;

          this.logger.log(`PDF OS ${requisicao.numero}: itensOS=${requisicaoParaPdf.itensOS?.length ?? 0}, itens=${requisicaoParaPdf.itens?.length ?? 0}, etapasOS=${requisicaoParaPdf.etapasOS?.length ?? 0}`);

          const pdfPath = await this.geradorPdfService.gerarPdfOrdemServico(
            requisicaoParaPdf,
            [assinatura],
            `${urlBase}/validar-documento`,
          );

          requisicao.pdf_assinado_url = pdfPath;
          requisicao.codigo_validacao = assinatura.codigo_validacao;
          await this.requisicaoRepository.save(requisicao);

          this.logger.log(`PDF assinado gerado para OS ${requisicao.numero} - código: ${assinatura.codigo_validacao}`);

          if (dto.enviar_ao_fornecedor === true || requisicao.orgao?.envio_automatico_os === true) {
            const res = await this.notificarFornecedorOS(requisicao, pdfPath, urlBase, {
              email: dto.email_fornecedor,
              telefone: dto.telefone_fornecedor,
            });
            Object.assign(notificacoesFornecedor, res);

            if (res.email || res.notificacao || res.whatsapp) {
              requisicao.enviado_ao_fornecedor = true;
              requisicao.data_envio_fornecedor = new Date();
              await this.requisicaoRepository.save(requisicao);
            }
          } else {
            this.logger.log(`OS ${requisicao.numero}: envio automático desabilitado para o órgão. Aguardando envio manual.`);
          }
        } catch (assinaturaError) {
          this.logger.warn(`Erro ao gerar assinatura/PDF da OS ${requisicao.numero}: ${assinaturaError.message}`);
        }

        // Notifica o solicitante
        try {
          await this.notificacoesService.notificarResultadoRequisicao(
            requisicao.orgao_id,
            requisicao.numero,
            requisicao.id,
            { 
              id: requisicao.usuario_solicitante_id, 
              email: requisicao.usuario_solicitante_email || undefined 
            },
            true,
            autorizadorNome,
            dto.observacao,
          );
        } catch (notifError) {
          this.logger.warn(`Erro ao enviar notificação de aprovação OS: ${notifError.message}`);
        }

        const requisicaoAtualizada = await this.findOne(id);
        const fornecedor = requisicaoAtualizada.contrato?.fornecedor;
        return {
          requisicao: requisicaoAtualizada,
          notificacoes_fornecedor: notificacoesFornecedor,
          fornecedor_info: fornecedor ? {
            nome: fornecedor.razao_social,
            email: fornecedor.email || null,
            telefone: fornecedor.representante_telefone || fornecedor.telefone || null,
          } : null,
          envio_automatico: requisicaoAtualizada.orgao?.envio_automatico_os ?? false,
        } as any;
      }

      // =========================================================================
      // REQUISIÇÃO NORMAL: Processa ajustes de quantidade
      // =========================================================================

      // Processa ajustes de quantidade se houver
      // IMPORTANTE: Se quantidade for REDUZIDA, libera a diferença de saldo
      if (dto.ajustes_quantidade) {
        for (const [itemId, novaQuantidade] of Object.entries(dto.ajustes_quantidade)) {
          const item = requisicao.itens.find(i => i.id === itemId);
          if (item && item.item_contrato_id) {
            const quantidadeOriginal = Number(item.quantidade_solicitada);
            const diferenca = quantidadeOriginal - novaQuantidade;

            if (diferenca !== 0) {
              // Busca item do contrato com lock
              const itemContrato = await queryRunner.manager.findOne(ItemContrato, {
                where: { id: item.item_contrato_id },
                lock: { mode: 'pessimistic_write' },
              });

              if (itemContrato) {
                if (diferenca > 0) {
                  // Quantidade foi REDUZIDA - libera a diferença
                  itemContrato.quantidade_empenhada = Math.max(
                    0,
                    Number(itemContrato.quantidade_empenhada) - diferenca
                  );
                } else {
                  // Quantidade foi AUMENTADA - precisa reservar mais
                  const saldoDisponivel = Number(itemContrato.saldo_disponivel);
                  if (saldoDisponivel < Math.abs(diferenca)) {
                    throw new BadRequestException(
                      `Saldo insuficiente para aumentar quantidade do item "${item.descricao}". ` +
                      `Disponível: ${saldoDisponivel}, Adicional necessário: ${Math.abs(diferenca)}`
                    );
                  }
                  itemContrato.quantidade_empenhada = Number(itemContrato.quantidade_empenhada) + Math.abs(diferenca);
                }

                itemContrato.saldo_disponivel = Number(itemContrato.quantidade_contratada) - 
                                                Number(itemContrato.quantidade_empenhada) - 
                                                Number(itemContrato.quantidade_entregue);

                await queryRunner.manager.save(itemContrato);

                this.logger.log(
                  `[AUTORIZAR] Ajuste de saldo: Item "${itemContrato.descricao}", ` +
                  `Diferença: ${diferenca > 0 ? '-' : '+'}${Math.abs(diferenca)}, ` +
                  `Novo saldo: ${itemContrato.saldo_disponivel}`
                );
              }

              item.quantidade_autorizada = novaQuantidade;
              item.motivo_ajuste = `Quantidade ajustada pelo autorizador de ${quantidadeOriginal} para ${novaQuantidade}`;
              await queryRunner.manager.save(item);
            }
          } else if (item) {
            // Item sem contrato, apenas atualiza quantidade
            item.quantidade_autorizada = novaQuantidade;
            item.motivo_ajuste = `Quantidade ajustada pelo autorizador de ${item.quantidade_solicitada} para ${novaQuantidade}`;
            await queryRunner.manager.save(item);
          }
        }
      }

      // Para itens sem ajuste, define quantidade_autorizada = quantidade_solicitada
      for (const item of requisicao.itens) {
        if (!item.quantidade_autorizada) {
          item.quantidade_autorizada = item.quantidade_solicitada;
          await queryRunner.manager.save(item);
        }
      }

      // Atualiza requisição
      requisicao.status = StatusRequisicao.AUTORIZADA;
      requisicao.usuario_autorizador_id = autorizadorId;
      requisicao.usuario_autorizador_nome = autorizadorNome;
      requisicao.data_autorizacao = new Date();
      requisicao.observacao_autorizador = dto.observacao || null;
      // saldo_reservado já é true (foi reservado na criação)

      await queryRunner.manager.save(requisicao);
      await queryRunner.commitTransaction();

      // Histórico: PEDIDO AUTORIZADO (requisição normal que gera OF)
      await this.historicoRequisicaoRepository.save(
        this.historicoRequisicaoRepository.create({
          requisicao_id: requisicao.id,
          tipo_acao: 'PEDIDO_AUTORIZADO',
          descricao: `Movimentação feita por: ${autorizadorNome}`,
          usuario_id: autorizadorId,
          usuario_nome: autorizadorNome,
          data_evento: new Date(),
        }),
      );

      this.logger.log(`Requisição ${requisicao.numero} autorizada por ${autorizadorNome}`);

      // Gera ordem de fornecimento automaticamente após aprovação (exceto para ORDEM_SERVICO)
      // Mesmo modelo da OS: assinatura digital + PDF + envio ao fornecedor
      const notificacoesFornecedorOF = { email: false, notificacao: false, whatsapp: false };
      try {
        if (requisicao.contrato_id && (requisicao.tipo as TipoRequisicao) !== TipoRequisicao.ORDEM_SERVICO) {
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

          // Assinatura digital + PDF assinado (mesmo modelo da OS)
          try {
            const urlBase = process.env.APP_URL || 'https://portaldcp.com.br';
            
            // Buscar cargo do usuário (já buscado anteriormente, reutilizar se possível)
            const usuario = await this.usuarioRepository.findOne({ where: { id: autorizadorId } });
            const cargo = usuario?.cargo || 'Gestor / Ordenador de Despesa';
            
            const assinatura = await this.assinaturasService.registrarAssinatura({
              orgao_id: requisicao.orgao_id,
              entidade_tipo: EntidadeTipo.ORDEM_FORNECIMENTO,
              entidade_id: ordemGerada.id,
              papel_assinante: PapelAssinante.GESTOR,
              usuario_id: autorizadorId,
              usuario_nome: usuario?.nome || autorizadorNome,
              usuario_cpf_cnpj: '',
              usuario_cargo: cargo,
              usuario_telefone: undefined,
              ip_address: undefined,
              user_agent: undefined,
            });

            const ordemParaPdf = await this.ordemFornecimentoRepository.findOne({
              where: { id: ordemGerada.id },
              relations: ['orgao', 'contrato', 'contrato.fornecedor', 'requisicao'],
            });
            if (ordemParaPdf) {
              const dadosOrdem = {
                numero: ordemParaPdf.numero,
                tipo: ordemParaPdf.tipo,
                data_emissao: ordemParaPdf.data_emissao,
                descricao: ordemParaPdf.descricao,
                local_entrega: ordemParaPdf.local_entrega,
                valor_total: Number(ordemParaPdf.valor_total),
                itens: ordemParaPdf.itens || [],
                orgao: ordemParaPdf.orgao ? { nome: ordemParaPdf.orgao.nome, logo_url: ordemParaPdf.orgao.logo_url, logradouro: ordemParaPdf.orgao.logradouro, bairro: ordemParaPdf.orgao.bairro, cidade: ordemParaPdf.orgao.cidade, uf: ordemParaPdf.orgao.uf } : undefined,
                contrato: ordemParaPdf.contrato ? { numero_contrato: ordemParaPdf.contrato.numero_contrato, numero_processo: ordemParaPdf.contrato.numero_processo, tipo: ordemParaPdf.contrato.tipo, objeto: ordemParaPdf.contrato.objeto, fornecedor: ordemParaPdf.contrato.fornecedor ? { razao_social: ordemParaPdf.contrato.fornecedor.razao_social, cpf_cnpj: ordemParaPdf.contrato.fornecedor.cpf_cnpj } : undefined } : undefined,
                requisicao: ordemParaPdf.requisicao ? { usuario_solicitante_nome: ordemParaPdf.requisicao.usuario_solicitante_nome, setor_solicitante: ordemParaPdf.requisicao.setor_solicitante, prioridade: ordemParaPdf.requisicao.prioridade } : undefined,
                numeros_empenhos: ordemParaPdf.numeros_empenhos?.length
                  ? JSON.stringify(ordemParaPdf.numeros_empenhos)
                  : (ordemParaPdf.requisicao as any)?.numeros_empenhos ?? null,
                usuario_emitente_nome: ordemParaPdf.usuario_emitente_nome,
              };

              const uploadPath = require('path').join(process.cwd(), 'uploads', 'ordens');
              const pdfPath = await this.geradorPdfService.gerarPdfOrdemFornecimento(
                dadosOrdem,
                uploadPath,
                { assinaturas: [assinatura], urlValidacaoBase: `${urlBase}/validar-documento` },
              );

              ordemParaPdf.caminho_pdf = pdfPath;
              ordemParaPdf.codigo_validacao = assinatura.codigo_validacao;
              await this.ordemFornecimentoRepository.save(ordemParaPdf);

              this.logger.log(`PDF assinado gerado para OF ${ordemParaPdf.numero} - código: ${assinatura.codigo_validacao}`);

              if (dto.enviar_ao_fornecedor === true || requisicao.orgao?.envio_automatico_os === true) {
                const ordemComFornecedor = await this.ordemFornecimentoRepository.findOne({
                  where: { id: ordemParaPdf.id },
                  relations: ['fornecedor'],
                });
                if (ordemComFornecedor) {
                  const res = await this.notificarFornecedorOF(ordemComFornecedor, pdfPath, urlBase, {
                    email: dto.email_fornecedor,
                    telefone: dto.telefone_fornecedor,
                  });
                  Object.assign(notificacoesFornecedorOF, res);
                  // Marca ordem como ENVIADA (documento foi enviado ao fornecedor)
                  ordemParaPdf.status = StatusOrdemFornecimento.ENVIADA;
                  ordemParaPdf.data_envio = new Date();
                  ordemParaPdf.email_fornecedor = dto.email_fornecedor || ordemComFornecedor.fornecedor?.email || null;
                  await this.ordemFornecimentoRepository.save(ordemParaPdf);
                }
              }
            }
          } catch (assinaturaError) {
            this.logger.warn(`Erro ao gerar assinatura/PDF da OF ${ordemGerada.numero}: ${assinaturaError.message}`);
          }
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

      const requisicaoAtualizada = await this.findOne(id);
      if (requisicao.contrato_id && (requisicao.tipo as TipoRequisicao) !== TipoRequisicao.ORDEM_SERVICO) {
        const reqComRelacoes = await this.requisicaoRepository.findOne({
          where: { id },
          relations: ['contrato', 'contrato.fornecedor'],
        });
        const fornecedor = reqComRelacoes?.contrato?.fornecedor;
        return {
          requisicao: requisicaoAtualizada,
          notificacoes_fornecedor: notificacoesFornecedorOF,
          fornecedor_info: fornecedor ? {
            nome: fornecedor.razao_social,
            email: fornecedor.email || null,
            telefone: fornecedor.representante_telefone || fornecedor.telefone || null,
          } : null,
          envio_automatico: requisicao.orgao?.envio_automatico_os ?? false,
          ordem_fornecimento_id: requisicaoAtualizada.ordem_fornecimento_id || undefined,
        } as any;
      }
      return requisicaoAtualizada;
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

  async devolver(
    id: string,
    dto: DevolverRequisicaoDto,
    autorizadorId: string,
    autorizadorNome: string,
  ): Promise<Requisicao> {
    const requisicao = await this.findOne(id);

    if (requisicao.status !== StatusRequisicao.AGUARDANDO_AUTORIZACAO) {
      throw new BadRequestException(
        `Requisição não pode ser devolvida. Status atual: ${requisicao.status}`,
      );
    }

    if (!dto.motivo?.trim()) {
      throw new BadRequestException('É obrigatório informar o motivo da devolução');
    }

    requisicao.status = StatusRequisicao.DEVOLVIDA;
    requisicao.usuario_autorizador_id = autorizadorId;
    requisicao.usuario_autorizador_nome = autorizadorNome;
    requisicao.data_autorizacao = new Date();
    requisicao.observacao_autorizador = dto.motivo;

    this.logger.log(`Requisição ${requisicao.numero} devolvida por ${autorizadorNome}: ${dto.motivo}`);

    const saved = await this.requisicaoRepository.save(requisicao);

    try {
      await this.notificacoesService.notificarResultadoRequisicao(
        requisicao.orgao_id,
        requisicao.numero,
        requisicao.id,
        {
          id: requisicao.usuario_solicitante_id,
          email: requisicao.usuario_solicitante_email || undefined,
        },
        false,
        autorizadorNome,
        `DEVOLVIDA PARA REVISÃO: ${dto.motivo}`,
      );
    } catch (notifError) {
      this.logger.warn(`Erro ao enviar notificação de devolução: ${notifError.message}`);
    }

    return saved;
  }

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

    // Tenta determinar o status anterior
    let statusAnterior: StatusRequisicao | null = requisicao.status_anterior_cancelamento;

    // Se não tem status anterior registrado (requisições antigas), tenta inferir
    if (!statusAnterior) {
      // Se tinha saldo reservado, provavelmente estava AUTORIZADA ou ORDEM_GERADA
      // Mas como foi cancelada, o saldo foi liberado, então verificamos outras pistas
      
      // Se tem ordem_fornecimento_id, estava em ORDEM_GERADA
      if (requisicao.ordem_fornecimento_id) {
        statusAnterior = StatusRequisicao.ORDEM_GERADA;
      }
      // Se tem data_autorizacao, estava AUTORIZADA ou ORDEM_GERADA
      else if (requisicao.data_autorizacao) {
        statusAnterior = StatusRequisicao.AUTORIZADA;
      }
      // Se tem observacao_autorizador com conteúdo negativo, estava NEGADA
      else if (requisicao.observacao_autorizador && requisicao.observacao_autorizador.toLowerCase().includes('negad')) {
        statusAnterior = StatusRequisicao.NEGADA;
      }
      // Se não tem nenhuma dessas pistas, provavelmente estava em AGUARDANDO_AUTORIZACAO
      else {
        statusAnterior = StatusRequisicao.AGUARDANDO_AUTORIZACAO;
      }

      this.logger.warn(
        `Requisição ${requisicao.numero} não tinha status_anterior_cancelamento registrado. ` +
        `Status inferido: ${statusAnterior}`
      );
    }
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
      .leftJoinAndSelect('req.orgao', 'orgao')
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

    for (const req of requisicoes) {
      await this.normalizarStatusLegadoOS(req);
    }
    
    return requisicoes;
  }

  async findOne(id: string): Promise<Requisicao> {
    const requisicao = await this.requisicaoRepository.findOne({
      where: { id },
      relations: ['itens', 'itens.item_contrato', 'contrato', 'contrato.fornecedor', 'orgao', 'itensOS', 'itensOS.itemCronograma', 'etapasOS', 'etapasOS.etapa'],
    });

    if (!requisicao) {
      throw new NotFoundException('Requisição não encontrada');
    }

    return this.normalizarStatusLegadoOS(requisicao);
  }

  async getHistoricoRequisicao(requisicaoId: string): Promise<HistoricoRequisicao[]> {
    const itens = await this.historicoRequisicaoRepository.find({
      where: { requisicao_id: requisicaoId },
    });
    itens.sort((a, b) => {
      const da = a.data_evento ? new Date(a.data_evento).getTime() : new Date(a.created_at).getTime();
      const db = b.data_evento ? new Date(b.data_evento).getTime() : new Date(b.created_at).getTime();
      return da - db;
    });
    return itens;
  }

  /**
   * Valida se a requisição pertence ao órgão informado.
   * Lança ForbiddenException se não pertencer.
   */
  async validarOrgaoRequisicao(id: string, orgaoId: string): Promise<void> {
    const requisicao = await this.findOne(id);
    if (requisicao.orgao_id !== orgaoId) {
      throw new ForbiddenException('Requisição não pertence ao seu órgão');
    }
  }

  /**
   * Envia ou reenvia notificação (email, notificação, WhatsApp) ao fornecedor de uma OS já aprovada.
   * Requer que a OS tenha PDF assinado gerado.
   */
  async enviarAoFornecedor(id: string, dto?: EnviarAoFornecedorDto): Promise<{ notificacoes_fornecedor: { email: boolean; notificacao: boolean; whatsapp: boolean } }> {
    const requisicao = await this.findOne(id);
    if (requisicao.tipo !== TipoRequisicao.ORDEM_SERVICO) {
      throw new BadRequestException('Apenas Ordens de Serviço podem ter notificação enviada ao fornecedor.');
    }
    if (requisicao.status !== StatusRequisicao.AUTORIZADA && requisicao.status !== StatusRequisicao.ORDEM_GERADA) {
      throw new BadRequestException('A OS deve estar autorizada para enviar ao fornecedor.');
    }
    if (!requisicao.pdf_assinado_url) {
      throw new BadRequestException('PDF assinado não disponível. A OS precisa ter sido assinada digitalmente.');
    }
    if (!fs.existsSync(requisicao.pdf_assinado_url)) {
      throw new BadRequestException('Arquivo PDF não encontrado no servidor.');
    }
    const urlBase = process.env.APP_URL || 'https://portaldcp.com.br';
    const resultado = await this.notificarFornecedorOS(requisicao, requisicao.pdf_assinado_url, urlBase, {
      email: dto?.email_fornecedor,
      telefone: dto?.telefone_fornecedor,
      tipo: dto?.tipo,
    });

    if (resultado.email || resultado.notificacao || resultado.whatsapp) {
      requisicao.enviado_ao_fornecedor = true;
      requisicao.data_envio_fornecedor = new Date();
      await this.requisicaoRepository.save(requisicao);
    }

    return { notificacoes_fornecedor: resultado };
  }

  /**
   * Regenera o PDF assinado de uma OS já autorizada, mantendo a assinatura original.
   * Útil para reemitir o PDF após correções sem precisar excluir/recriar a OS.
   */
  async regenerarPdf(id: string, usuarioId: string, usuarioNome: string): Promise<{ pdf_url: string }> {
    const requisicao = await this.requisicaoRepository.findOne({
      where: { id },
      relations: [
        'itens', 'itens.item_contrato',
        'itensOS', 'itensOS.itemCronograma',
        'etapasOS', 'etapasOS.etapa',
        'contrato', 'contrato.fornecedor',
        'orgao',
      ],
    });
    if (!requisicao) throw new BadRequestException('OS não encontrada');
    if (requisicao.tipo !== TipoRequisicao.ORDEM_SERVICO) throw new BadRequestException('Apenas Ordens de Serviço podem ter o PDF regenerado.');
    if (requisicao.status !== StatusRequisicao.AUTORIZADA && requisicao.status !== StatusRequisicao.ORDEM_GERADA) {
      throw new BadRequestException('A OS deve estar autorizada para regenerar o PDF.');
    }

    const urlBase = process.env.APP_URL || 'https://portaldcp.com.br';

    let assinaturas = await this.assinaturasService.buscarPorEntidade(id, EntidadeTipo.ORDEM_SERVICO);

    if (assinaturas.length === 0) {
      const usuario = await this.usuarioRepository.findOne({ where: { id: usuarioId } });
      const cargo = usuario?.cargo || 'Gestor / Ordenador de Despesa';
      const assinatura = await this.assinaturasService.registrarAssinatura({
        orgao_id: requisicao.orgao_id,
        entidade_tipo: EntidadeTipo.ORDEM_SERVICO,
        entidade_id: id,
        papel_assinante: PapelAssinante.GESTOR,
        usuario_id: usuarioId,
        usuario_nome: usuario?.nome || usuarioNome,
        usuario_cpf_cnpj: '',
        usuario_cargo: cargo,
        usuario_telefone: undefined,
        ip_address: undefined,
        user_agent: undefined,
      });
      assinaturas = [assinatura];
    }

    const pdfPath = await this.geradorPdfService.gerarPdfOrdemServico(
      requisicao,
      assinaturas,
      `${urlBase}/validar-documento`,
    );

    requisicao.pdf_assinado_url = pdfPath;
    requisicao.codigo_validacao = assinaturas[0]?.codigo_validacao || requisicao.codigo_validacao;
    await this.requisicaoRepository.save(requisicao);

    this.logger.log(`PDF regenerado para OS ${requisicao.numero} por ${usuarioNome}`);
    return { pdf_url: pdfPath };
  }

  async corrigirDataAutorizacaoOS(
    id: string,
    dto: CorrigirDataAutorizacaoOSDto,
    adminId: string,
    adminNome: string,
  ): Promise<{ requisicao: Requisicao; pdf_url: string; assinaturas_corrigidas: number }> {
    const requisicao = await this.requisicaoRepository.findOne({
      where: { id },
      relations: [
        'itens', 'itens.item_contrato',
        'itensOS', 'itensOS.itemCronograma',
        'etapasOS', 'etapasOS.etapa',
        'contrato', 'contrato.fornecedor',
        'orgao',
      ],
    });

    if (!requisicao) throw new BadRequestException('OS não encontrada');
    if (requisicao.tipo !== TipoRequisicao.ORDEM_SERVICO) {
      throw new BadRequestException('Apenas Ordens de Serviço podem ter a data de autorização corrigida.');
    }
    if (requisicao.status !== StatusRequisicao.AUTORIZADA && requisicao.status !== StatusRequisicao.ORDEM_GERADA) {
      throw new BadRequestException('A OS deve estar autorizada ou gerada para corrigir a data de autorização.');
    }

    const dataCorrigida = this.normalizarDataAutorizacaoCorrigida(dto.data_autorizacao);
    const dataAnterior = requisicao.data_autorizacao ? new Date(requisicao.data_autorizacao) : null;
    const assinaturasAtuais = await this.assinaturasService.buscarPorEntidade(id, EntidadeTipo.ORDEM_SERVICO);

    if (assinaturasAtuais.length === 0) {
      throw new BadRequestException('Nenhuma assinatura digital encontrada para corrigir o quadro de assinaturas da OS.');
    }

    requisicao.data_autorizacao = dataCorrigida;
    await this.requisicaoRepository.save(requisicao);

    const assinaturasCorrigidas = await this.assinaturasService.corrigirDataAssinaturasPorEntidade(
      id,
      EntidadeTipo.ORDEM_SERVICO,
      dataCorrigida,
    );

    const urlBase = process.env.APP_URL || 'https://portaldcp.com.br';
    const pdfPath = await this.geradorPdfService.gerarPdfOrdemServico(
      requisicao,
      assinaturasCorrigidas,
      `${urlBase}/validar-documento`,
    );

    requisicao.pdf_assinado_url = pdfPath;
    requisicao.codigo_validacao = assinaturasCorrigidas[0]?.codigo_validacao || requisicao.codigo_validacao;
    await this.requisicaoRepository.save(requisicao);

    await this.historicoRequisicaoRepository.save(
      this.historicoRequisicaoRepository.create({
        requisicao_id: requisicao.id,
        tipo_acao: 'DATA_AUTORIZACAO_CORRIGIDA',
        descricao: `Data de autorização e quadro de assinaturas corrigidos por: ${adminNome}`,
        detalhes: JSON.stringify({
          data_autorizacao_anterior: dataAnterior ? dataAnterior.toISOString() : null,
          data_autorizacao_nova: dataCorrigida.toISOString(),
          assinaturas_corrigidas: assinaturasCorrigidas.map((assinatura) => assinatura.id),
        }),
        usuario_id: adminId,
        usuario_nome: adminNome,
        data_evento: new Date(),
      }),
    );

    this.logger.log(`Data de autorização da OS ${requisicao.numero} corrigida por ${adminNome}`);
    return {
      requisicao,
      pdf_url: pdfPath,
      assinaturas_corrigidas: assinaturasCorrigidas.length,
    };
  }

  private normalizarDataAutorizacaoCorrigida(dataAutorizacao: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataAutorizacao || '')) {
      throw new BadRequestException('Data de autorização deve estar no formato YYYY-MM-DD.');
    }

    const [ano, mes, dia] = dataAutorizacao.split('-').map(Number);
    const dataCorrigida = new Date(Date.UTC(ano, mes - 1, dia, 15, 0, 0));

    if (
      dataCorrigida.getUTCFullYear() !== ano ||
      dataCorrigida.getUTCMonth() !== mes - 1 ||
      dataCorrigida.getUTCDate() !== dia
    ) {
      throw new BadRequestException('Data de autorização inválida.');
    }

    const hoje = this.hojeBrasiliaAoMeioDiaUtc();
    if (dataCorrigida.getTime() > hoje.getTime()) {
      throw new BadRequestException('Data de autorização não pode ser futura.');
    }

    return dataCorrigida;
  }

  private hojeBrasiliaAoMeioDiaUtc(): Date {
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());

    const valores = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
    return new Date(Date.UTC(
      Number(valores.year),
      Number(valores.month) - 1,
      Number(valores.day),
      15,
      0,
      0,
    ));
  }

  async vincularEmpenhos(id: string, empenhos: string[]): Promise<{ pdf_regenerado: boolean }> {
    const requisicao = await this.requisicaoRepository.findOne({
      where: { id },
      relations: [
        'itens', 'itens.item_contrato',
        'itensOS', 'itensOS.itemCronograma',
        'etapasOS', 'etapasOS.etapa',
        'contrato', 'contrato.fornecedor',
        'orgao',
      ],
    });
    if (!requisicao) throw new BadRequestException('OS não encontrada');

    requisicao.numeros_empenhos = JSON.stringify(empenhos);
    await this.requisicaoRepository.save(requisicao);

    if (!requisicao.pdf_assinado_url) {
      return { pdf_regenerado: false };
    }

    const assinaturas = await this.assinaturasService.buscarPorEntidade(id, EntidadeTipo.ORDEM_SERVICO);
    const urlBase = process.env.APP_URL || 'https://portaldcp.com.br';
    const pdfPath = await this.geradorPdfService.gerarPdfOrdemServico(
      requisicao,
      assinaturas,
      `${urlBase}/validar-documento`,
    );
    requisicao.pdf_assinado_url = pdfPath;
    await this.requisicaoRepository.save(requisicao);

    this.logger.log(`Empenhos vinculados e PDF regenerado para OS ${requisicao.numero}`);
    return { pdf_regenerado: true };
  }

  async findPendentesAutorizacao(orgaoId: string): Promise<Requisicao[]> {
    return this.requisicaoRepository.find({
      where: { 
        orgao_id: orgaoId, 
        status: StatusRequisicao.AGUARDANDO_AUTORIZACAO 
      },
      relations: [
        'itens',
        'contrato',
        'contrato.fornecedor',
        'orgao',
        'itensOS',
        'itensOS.itemCronograma',
        'etapasOS',
        'etapasOS.etapa',
      ],
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

    const { itens_os, etapas_os, numeros_empenhos, ...dtoRest } = dto as any;
    Object.assign(requisicao, dtoRest);
    if (numeros_empenhos !== undefined) {
      requisicao.numeros_empenhos = numeros_empenhos?.length ? JSON.stringify(numeros_empenhos) : null;
    }
    const salva = await this.requisicaoRepository.save(requisicao);
    if (requisicao.tipo === TipoRequisicao.ORDEM_SERVICO && requisicao.contrato_id) {
      if (itens_os !== undefined) {
        await this.requisicaoItemOSRepository.delete({ requisicao_id: id });
        if (Array.isArray(itens_os) && itens_os.length > 0) {
          const comprometido = await this.somarQuantidadeComprometidaPorItemOS(requisicao.contrato_id, id);
          for (const io of itens_os) {
            const itemCron = await this.itemCronogramaRepository.findOne({ where: { id: io.item_cronograma_id } });
            if (!itemCron || itemCron.contrato_id !== requisicao.contrato_id) continue;
            const saldo = Number(itemCron.quantidade) * (Number(itemCron.quantidade_meses) || 1) - Number(itemCron.quantidade_medida || 0) - (comprometido.get(io.item_cronograma_id) || 0);
            if (Number(io.quantidade_solicitada) > saldo + 0.0001) throw new BadRequestException(`Item "${itemCron.descricao}" excede saldo (${saldo.toFixed(2)})`);
            await this.requisicaoItemOSRepository.save(this.requisicaoItemOSRepository.create({ requisicao_id: id, item_cronograma_id: io.item_cronograma_id, quantidade_solicitada: Number(io.quantidade_solicitada) }));
          }
        }
      }
      if (etapas_os !== undefined) {
        await this.requisicaoEtapaOSRepository.delete({ requisicao_id: id });
        if (Array.isArray(etapas_os) && etapas_os.length > 0) {
          const comprometido = await this.somarValorComprometidoPorEtapaOS(requisicao.contrato_id, id);
          for (const eo of etapas_os) {
            const etapa = await this.etapaCronogramaRepository.findOne({ where: { id: eo.etapa_id } });
            if (!etapa || etapa.contrato_id !== requisicao.contrato_id) continue;
            const saldo = Number(etapa.valor_previsto) - Number(etapa.valor_executado || 0) - (comprometido.get(eo.etapa_id) || 0);
            const valor = Number(eo.valor_solicitado ?? 0);
            if (valor > saldo + 0.01) throw new BadRequestException(`Etapa "${etapa.descricao}" excede saldo (R$ ${saldo.toFixed(2)})`);
            await this.requisicaoEtapaOSRepository.save(this.requisicaoEtapaOSRepository.create({ requisicao_id: id, etapa_id: eo.etapa_id, percentual_solicitado: Number(eo.percentual_solicitado ?? 0), valor_solicitado: valor }));
          }
        }
      }
    }
    return this.findOne(id);
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
  /**
   * =========================================================================
   * EXCLUIR REQUISIÇÃO - EXCLUSÃO COMPLETA EM CASCATA
   * =========================================================================
   * 
   * NOVA LÓGICA: Permite excluir requisição de QUALQUER STATUS.
   * 
   * O que acontece ao excluir:
   * 1. Estorna recebimentos ACEITOS (libera quantidade_entregue)
   * 2. Exclui recebimentos pendentes/rejeitados
   * 3. Exclui ordem de fornecimento e PDF
   * 4. Libera saldo reservado (quantidade_empenhada)
   * 5. Exclui itens da requisição
   * 6. Exclui a requisição
   * 
   * IMPORTANTE: Como o saldo é reservado na CRIAÇÃO, a exclusão SEMPRE
   * libera o saldo (se houver itens de contrato).
   * =========================================================================
   */
  async excluir(id: string): Promise<{ 
    success: boolean; 
    mensagem: string; 
    detalhes: { 
      recebimentos_estornados: number;
      recebimentos_excluidos: number;
      ordens_excluidas: number;
      saldo_liberado: boolean;
    } 
  }> {
    const requisicao = await this.findOne(id);
    
    const detalhes = {
      recebimentos_estornados: 0,
      recebimentos_excluidos: 0,
      ordens_excluidas: 0,
      saldo_liberado: false,
    };

    this.logger.log(
      `[EXCLUIR] Iniciando exclusão da requisição ${requisicao.numero} (status: ${requisicao.status})`
    );

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // =====================================================================
      // 1. PROCESSA ORDENS DE FORNECIMENTO E RECEBIMENTOS
      // =====================================================================
      
      // Busca TODAS as ordens vinculadas a esta requisição (pode haver mais de uma se regerar)
      const ordens = await queryRunner.manager.find(OrdemFornecimento, {
        where: { requisicao_id: requisicao.id },
      });

      for (const ordem of ordens) {
        // Busca recebimentos da ordem
        const recebimentos = await queryRunner.manager.find(Recebimento, {
          where: { ordem_fornecimento_id: ordem.id },
        });

        for (const recebimento of recebimentos) {
          // Se recebimento foi ACEITO, precisa estornar (liberar quantidade_entregue)
          if (recebimento.status === StatusRecebimento.ACEITO || 
              recebimento.status === StatusRecebimento.ACEITO_PARCIAL) {
            
            // Estorna: libera quantidade_entregue no contrato
            for (const itemRec of recebimento.itens || []) {
              if (itemRec.item_contrato_id && (itemRec.quantidade_aceita ?? 0) > 0) {
                const itemContrato = await queryRunner.manager.findOne(ItemContrato, {
                  where: { id: itemRec.item_contrato_id },
                  lock: { mode: 'pessimistic_write' },
                });

                if (itemContrato) {
                  // Reverte a entrega
                  itemContrato.quantidade_entregue = Math.max(
                    0,
                    Number(itemContrato.quantidade_entregue) - itemRec.quantidade_aceita
                  );
                  itemContrato.saldo_disponivel = Number(itemContrato.quantidade_contratada) - 
                                                  Number(itemContrato.quantidade_empenhada) - 
                                                  Number(itemContrato.quantidade_entregue);

                  await queryRunner.manager.save(itemContrato);

                  this.logger.log(
                    `[EXCLUIR] Estorno de entrega: Item "${itemContrato.descricao}", ` +
                    `Quantidade: ${itemRec.quantidade_aceita}`
                  );
                }
              }
            }

            detalhes.recebimentos_estornados++;
          } else {
            detalhes.recebimentos_excluidos++;
          }

          // Nula FK para nota fiscal antes de excluir (evita violação de constraint)
          if (recebimento.nota_fiscal_fornecedor_id) {
            await queryRunner.manager.update(Recebimento, recebimento.id, { nota_fiscal_fornecedor_id: null });
          }

          // Exclui o recebimento
          await queryRunner.manager.remove(recebimento);
          this.logger.log(`[EXCLUIR] Recebimento ${recebimento.numero} excluído`);
        }

        // Remove PDF da ordem se existir
        if (ordem.caminho_pdf) {
          try {
            const fs = require('fs');
            const path = require('path');
            const pdfPath = path.join(process.cwd(), ordem.caminho_pdf);
            if (fs.existsSync(pdfPath)) {
              fs.unlinkSync(pdfPath);
              this.logger.log(`[EXCLUIR] PDF da ordem ${ordem.numero} removido`);
            }
          } catch (error) {
            this.logger.warn(`[EXCLUIR] Erro ao remover PDF: ${error.message}`);
          }
        }

        // Remove notas fiscais do fornecedor vinculadas a esta ordem
        const notasFiscais = await queryRunner.manager.find(NotaFiscalFornecedor, {
          where: { ordem_fornecimento_id: ordem.id },
        });
        for (const nf of notasFiscais) {
          await queryRunner.manager.remove(nf);
          this.logger.log(`[EXCLUIR] Nota fiscal fornecedor ${nf.numero || nf.id} excluída`);
        }

        // Remove dossiê fiscal vinculado à ordem (evita FK constraint ao excluir ordem)
        const dossies = await queryRunner.manager.find(DossieOrdem, {
          where: { ordem_fornecimento_id: ordem.id },
          relations: ['anexos'],
        });
        for (const dossie of dossies) {
          if (dossie.anexos?.length) {
            await queryRunner.manager.remove(dossie.anexos);
          }
          await queryRunner.manager.remove(dossie);
          this.logger.log(`[EXCLUIR] Dossiê fiscal da ordem ${ordem.numero} excluído`);
        }

        // Exclui a ordem
        await queryRunner.manager.remove(ordem);
        detalhes.ordens_excluidas++;
        this.logger.log(`[EXCLUIR] Ordem de fornecimento ${ordem.numero} excluída`);
      }

      // =====================================================================
      // 2. LIBERA SALDO RESERVADO NO CONTRATO
      // =====================================================================
      
      if (requisicao.saldo_reservado) {
        for (const item of requisicao.itens) {
          if (item.item_contrato_id) {
            const quantidadeALiberar = item.quantidade_autorizada ?? item.quantidade_solicitada;

            const itemContrato = await queryRunner.manager.findOne(ItemContrato, {
              where: { id: item.item_contrato_id },
              lock: { mode: 'pessimistic_write' },
            });

            if (itemContrato) {
              // Libera saldo empenhado
              itemContrato.quantidade_empenhada = Math.max(
                0,
                Number(itemContrato.quantidade_empenhada) - quantidadeALiberar
              );
              itemContrato.saldo_disponivel = Number(itemContrato.quantidade_contratada) - 
                                              Number(itemContrato.quantidade_empenhada) - 
                                              Number(itemContrato.quantidade_entregue);

              await queryRunner.manager.save(itemContrato);

              this.logger.log(
                `[EXCLUIR] Saldo liberado: Item "${itemContrato.descricao}", ` +
                `Quantidade: ${quantidadeALiberar}, Novo saldo: ${itemContrato.saldo_disponivel}`
              );
            }
          }
        }
        detalhes.saldo_liberado = true;
      }

      // =====================================================================
      // 3. EXCLUI ITENS E REQUISIÇÃO
      // =====================================================================
      
      if (requisicao.itens && requisicao.itens.length > 0) {
        await queryRunner.manager.remove(requisicao.itens);
      }

      if (requisicao.itensOS && requisicao.itensOS.length > 0) {
        await queryRunner.manager.remove(requisicao.itensOS);
      }

      if (requisicao.etapasOS && requisicao.etapasOS.length > 0) {
        await queryRunner.manager.remove(requisicao.etapasOS);
      }

      // Nula FKs externas sem CASCADE que referenciam esta requisição
      await queryRunner.manager.query(
        `UPDATE medicoes SET requisicao_id = NULL WHERE requisicao_id = $1`,
        [requisicao.id]
      );
      await queryRunner.manager.query(
        `UPDATE ordens_fornecimento SET requisicao_id = NULL WHERE requisicao_id = $1`,
        [requisicao.id]
      );

      await queryRunner.manager.remove(requisicao);

      await queryRunner.commitTransaction();

      const mensagem = 
        `Requisição ${requisicao.numero} excluída permanentemente. ` +
        `${detalhes.ordens_excluidas > 0 ? `${detalhes.ordens_excluidas} ordem(s) excluída(s). ` : ''}` +
        `${detalhes.recebimentos_estornados > 0 ? `${detalhes.recebimentos_estornados} recebimento(s) estornado(s). ` : ''}` +
        `${detalhes.recebimentos_excluidos > 0 ? `${detalhes.recebimentos_excluidos} recebimento(s) excluído(s). ` : ''}` +
        `${detalhes.saldo_liberado ? 'Saldo devolvido ao contrato.' : ''}`;

      this.logger.log(`[EXCLUIR] ${mensagem}`);

      return { success: true, mensagem, detalhes };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`[EXCLUIR] Erro ao excluir requisição ${requisicao.numero}: ${error.message}`, error.stack);
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
