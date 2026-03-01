import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotaFiscalFornecedor, StatusNotaFiscalFornecedor } from './entities/nota-fiscal-fornecedor.entity';
import { OrdemFornecimento, StatusOrdemFornecimento } from './entities/ordem-fornecimento.entity';
import { Recebimento } from './entities/recebimento.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { XmlNfeParserService } from './xml-nfe-parser.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { TipoNotificacao } from '../notificacoes/entities/notificacao.entity';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class NotaFiscalFornecedorService {
  private readonly logger = new Logger(NotaFiscalFornecedorService.name);

  constructor(
    @InjectRepository(NotaFiscalFornecedor)
    private readonly nfRepository: Repository<NotaFiscalFornecedor>,
    @InjectRepository(OrdemFornecimento)
    private readonly ordemRepository: Repository<OrdemFornecimento>,
    @InjectRepository(Recebimento)
    private readonly recebimentoRepository: Repository<Recebimento>,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    private readonly xmlParser: XmlNfeParserService,
    private readonly notificacoesService: NotificacoesService,
  ) {}

  async upload(
    ordemId: string,
    fornecedorId: string,
    orgaoId: string,
    xmlFile: Express.Multer.File,
    pdfFile?: Express.Multer.File,
    outrosArquivos?: Express.Multer.File[],
    uploadPorFornecedor = false,
  ): Promise<NotaFiscalFornecedor> {
    const ordem = await this.ordemRepository.findOne({
      where: { id: ordemId, fornecedor_id: fornecedorId },
    });

    if (!ordem) {
      throw new NotFoundException('Ordem de fornecimento não encontrada');
    }

    const statusPermitidos = [
      StatusOrdemFornecimento.ENVIADA,
      StatusOrdemFornecimento.EM_ATENDIMENTO,
      StatusOrdemFornecimento.ATENDIDA_PARCIAL,
    ];
    if (!statusPermitidos.includes(ordem.status)) {
      throw new BadRequestException(`Ordem com status ${ordem.status} não permite envio de NF`);
    }

    const xmlContent = fs.readFileSync(xmlFile.path, 'utf-8');
    let parseResult: { header: any; produtos: any[] };

    try {
      parseResult = this.xmlParser.parse(xmlContent);
    } catch (parseErr: any) {
      throw new BadRequestException(`Erro ao processar XML: ${parseErr.message}`);
    }

    // Pré-análise: valor total da NF vs valor total da OF (considerando o já entregue)
    const valorTotalXml = Number(parseResult.header.valorTotal) || 0;
    const valorTotalOf = Number(ordem.valor_total) || 0;
    const valorEntregue = Number(ordem.valor_entregue ?? 0) || 0;
    const valorPendente = Math.max(0, valorTotalOf - valorEntregue);
    const tolerancia = 0.01;

    if (valorTotalXml > valorTotalOf + tolerancia) {
      throw new BadRequestException(
        `O valor total da NF (R$ ${valorTotalXml.toFixed(2).replace('.', ',')}) é maior que o valor da Ordem de Fornecimento (R$ ${valorTotalOf.toFixed(2).replace('.', ',')}). ` +
        'Anexe a nota fiscal e o XML corretos.',
      );
    }

    if (valorTotalXml + valorEntregue > valorTotalOf + tolerancia) {
      const msgPendente = `Valor pendente na OF: R$ ${valorPendente.toFixed(2).replace('.', ',')}.`;
      const orientacao = uploadPorFornecedor
        ? `Envie uma nova nota fiscal com o valor correto. ${msgPendente}`
        : `Solicite ao fornecedor uma nova nota fiscal com o valor correto. ${msgPendente}`;
      throw new BadRequestException(
        `O valor da NF (R$ ${valorTotalXml.toFixed(2).replace('.', ',')}) somado ao já entregue (R$ ${valorEntregue.toFixed(2).replace('.', ',')}) excede o valor da OF (R$ ${valorTotalOf.toFixed(2).replace('.', ',')}). ` +
        orientacao,
      );
    }

    // Sempre adicionar nova NF (não substituir). Múltiplas NFs podem ser enviadas antes da validação.
    // O órgão escolhe qual processar na tela de recebimento (fila).

    let nf: NotaFiscalFornecedor;

    try {
      nf = this.nfRepository.create({
        orgao_id: orgaoId,
        fornecedor_id: fornecedorId,
        ordem_fornecimento_id: ordemId,
        tipo_itens: null,
        numero: parseResult.header.numero,
        serie: parseResult.header.serie,
        chave_acesso: parseResult.header.chaveAcesso,
        data_emissao: parseResult.header.dataEmissao ? new Date(parseResult.header.dataEmissao) : null,
        valor_total: parseResult.header.valorTotal,
        cnpj_emitente: parseResult.header.cnpjEmitente,
        razao_social_emitente: parseResult.header.razaoSocialEmitente,
        produtos_xml: parseResult.produtos,
        caminho_xml: xmlFile.path,
        caminho_pdf: pdfFile?.path || null,
        documentos_extras: (outrosArquivos || []).map(f => ({
          nome: f.originalname,
          caminho: f.path,
          tipo: f.mimetype,
        })),
        xml_raw: xmlContent,
        status: StatusNotaFiscalFornecedor.PROCESSADA,
      });

      nf = await this.nfRepository.save(nf);
      this.logger.log(`NF ${nf.numero}/${nf.serie} processada para OF ${ordemId}`);
    } catch (error) {
      nf = this.nfRepository.create({
        orgao_id: orgaoId,
        fornecedor_id: fornecedorId,
        ordem_fornecimento_id: ordemId,
        tipo_itens: null,
        caminho_xml: xmlFile.path,
        caminho_pdf: pdfFile?.path || null,
        documentos_extras: (outrosArquivos || []).map(f => ({
          nome: f.originalname,
          caminho: f.path,
          tipo: f.mimetype,
        })),
        xml_raw: xmlContent,
        status: StatusNotaFiscalFornecedor.ERRO,
        erro_processamento: error.message,
      });
      nf = await this.nfRepository.save(nf);
      this.logger.error(`Erro ao processar XML da OF ${ordemId}: ${error.message}`);
      throw new BadRequestException(`Erro ao processar XML: ${error.message}`);
    }

    this.notificarUsuariosOrgao(orgaoId, ordem, nf).catch(err => {
      this.logger.error(`Erro ao notificar usuários: ${err.message}`);
    });

    return nf;
  }

  async findByOrdem(ordemId: string): Promise<NotaFiscalFornecedor | null> {
    return this.nfRepository.findOne({
      where: { ordem_fornecimento_id: ordemId },
      order: { created_at: 'DESC' },
    });
  }

  /** Retorna todas as NFs da ordem (para modo SEPARADA com 2 NFs) */
  async findAllByOrdem(ordemId: string): Promise<NotaFiscalFornecedor[]> {
    return this.nfRepository.find({
      where: { ordem_fornecimento_id: ordemId },
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: string): Promise<NotaFiscalFornecedor> {
    const nf = await this.nfRepository.findOne({ where: { id } });
    if (!nf) throw new NotFoundException('Nota fiscal não encontrada');
    return nf;
  }

  async delete(id: string): Promise<void> {
    const nf = await this.findOne(id);
    await this.nfRepository.remove(nf);
  }

  async recusarNF(
    id: string,
    motivo: string,
    usuarioId: string,
    usuarioNome: string,
  ): Promise<{ nf: NotaFiscalFornecedor; recebimentoCancelado: boolean }> {
    const nf = await this.nfRepository.findOne({
      where: { id },
      relations: ['ordem_fornecimento', 'ordem_fornecimento.fornecedor'],
    });
    if (!nf) throw new NotFoundException('Nota fiscal não encontrada');

    nf.status = StatusNotaFiscalFornecedor.RECUSADA;
    nf.motivo_recusa = motivo;
    nf.historico = nf.historico || [];
    nf.historico.push({
      data: new Date().toISOString(),
      tipo: 'NF_RECUSADA',
      descricao: `NF recusada por ${usuarioNome}: ${motivo}`,
      usuario: usuarioNome,
    });
    await this.nfRepository.save(nf);

    let recebimentoCancelado = false;
    const recAtivo = await this.recebimentoRepository.findOne({
      where: {
        ordem_fornecimento_id: nf.ordem_fornecimento_id,
        status: 'PENDENTE' as any,
      },
    });
    if (recAtivo) {
      recAtivo.status = 'REJEITADO' as any;
      recAtivo.motivo_rejeicao = `NF recusada na pré-análise: ${motivo}`;
      recAtivo.ocorrencias = recAtivo.ocorrencias || [];
      recAtivo.ocorrencias.push({
        data: new Date(),
        tipo: 'NF_RECUSADA',
        descricao: `NF ${nf.numero || ''} recusada por ${usuarioNome}: ${motivo}`,
        usuario: usuarioNome,
      });
      await this.recebimentoRepository.save(recAtivo);
      recebimentoCancelado = true;
    }

    const ordem = nf.ordem_fornecimento;
    if (ordem) {
      ordem.status = StatusOrdemFornecimento.ENVIADA;
      await this.ordemRepository.save(ordem);
    }

    const fornecedor = ordem?.fornecedor;
    if (fornecedor) {
      const ordemNumero = ordem.numero || 'N/A';
      try {
        await this.notificacoesService.criar({
          orgao_id: nf.orgao_id,
          usuario_id: fornecedor.id,
          usuario_email: fornecedor.email || undefined,
          tipo: TipoNotificacao.NF_RECUSADA,
          titulo: `Nota Fiscal recusada - OF ${ordemNumero}`,
          mensagem: `Sua Nota Fiscal nº ${nf.numero || 'S/N'} referente à OF ${ordemNumero} foi recusada.\n\nMotivo: ${motivo}\n\nPor favor, corrija e envie uma nova NF pelo portal.`,
          entidade_tipo: 'ordem_fornecimento',
          entidade_id: nf.ordem_fornecimento_id,
          link: `/fornecedor/ordens/${nf.ordem_fornecimento_id}`,
          prioridade: 'ALTA' as any,
          enviar_email: true,
        });
        this.logger.log(`Notificação de NF recusada enviada ao fornecedor ${fornecedor.razao_social}`);
      } catch (err: any) {
        this.logger.warn(`Erro ao notificar fornecedor sobre NF recusada: ${err.message}`);
      }
    }

    this.logger.log(`NF ${nf.numero || nf.id} recusada por ${usuarioNome}: ${motivo}`);
    return { nf, recebimentoCancelado };
  }

  async atualizarMapeamentoAi(id: string, mapeamento: any[]): Promise<NotaFiscalFornecedor> {
    const nf = await this.findOne(id);
    nf.mapeamento_ai = mapeamento;
    return this.nfRepository.save(nf);
  }

  async confirmarMapeamento(id: string, mapeamento: any[], usuarioId: string): Promise<NotaFiscalFornecedor> {
    const nf = await this.findOne(id);
    const agora = new Date().toISOString();
    nf.mapeamento_confirmado = mapeamento.map(m => ({
      ...m,
      confirmado_por: usuarioId,
      confirmado_em: agora,
    }));
    nf.status = StatusNotaFiscalFornecedor.VINCULADA;
    return this.nfRepository.save(nf);
  }

  private async notificarUsuariosOrgao(
    orgaoId: string,
    ordem: OrdemFornecimento,
    nf: NotaFiscalFornecedor,
  ): Promise<void> {
    const usuarios = await this.usuarioRepository.find({
      where: { orgao_id: orgaoId },
    });

    const destinatarios = usuarios.filter(u => 
      (u as any).pode_receber_patrimonio || (u as any).pode_aprovar_requisicoes
    );

    if (destinatarios.length === 0) return;

    await this.notificacoesService.criarParaMultiplos(
      destinatarios.map(u => ({ id: u.id, email: (u as any).email })),
      {
        orgao_id: orgaoId,
        tipo: TipoNotificacao.NF_DISPONIVEL,
        titulo: `NF disponível - OF ${ordem.numero}`,
        mensagem: `O fornecedor enviou a Nota Fiscal ${nf.numero || '(sem número)'}/${nf.serie || ''} para a Ordem de Fornecimento ${ordem.numero}. Acesse a tela de recebimentos para processar.`,
        entidade_tipo: 'ordem_fornecimento',
        entidade_id: ordem.id,
        link: `/orgao/almoxarifado/recebimentos/${ordem.id}`,
      },
    );

    this.logger.log(`Notificações enviadas para ${destinatarios.length} usuários`);
  }
}
