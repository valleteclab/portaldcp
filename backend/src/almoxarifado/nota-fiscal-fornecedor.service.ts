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
    ];
    if (!statusPermitidos.includes(ordem.status)) {
      throw new BadRequestException(`Ordem com status ${ordem.status} não permite envio de NF`);
    }

    const existente = await this.nfRepository.findOne({
      where: { ordem_fornecimento_id: ordemId },
    });
    if (existente) {
      const recebimentos = await this.recebimentoRepository.find({
        where: { nota_fiscal_fornecedor_id: existente.id },
      });
      if (recebimentos.length > 0) {
        const temAceite = recebimentos.some(r => (r as any).aceite_almoxarifado_data || (r as any).aceite_patrimonio_data);
        if (temAceite) {
          throw new BadRequestException('Não é possível substituir a NF pois já existe aceite no recebimento');
        }
        await this.recebimentoRepository.remove(recebimentos);
      }
      await this.nfRepository.remove(existente);
    }

    const xmlContent = fs.readFileSync(xmlFile.path, 'utf-8');

    let nf: NotaFiscalFornecedor;

    try {
      const parseResult = this.xmlParser.parse(xmlContent);

      nf = this.nfRepository.create({
        orgao_id: orgaoId,
        fornecedor_id: fornecedorId,
        ordem_fornecimento_id: ordemId,
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
        caminho_xml: xmlFile.path,
        caminho_pdf: pdfFile?.path || null,
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

  async findOne(id: string): Promise<NotaFiscalFornecedor> {
    const nf = await this.nfRepository.findOne({ where: { id } });
    if (!nf) throw new NotFoundException('Nota fiscal não encontrada');
    return nf;
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
