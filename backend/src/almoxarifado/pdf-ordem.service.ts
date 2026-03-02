import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as path from 'path';
import { OrdemFornecimento } from './entities/ordem-fornecimento.entity';
import { GeradorPdfService } from '../assinaturas/gerador-pdf.service';
import { AssinaturaDigital, EntidadeTipo } from '../assinaturas/entities/assinatura-digital.entity';

@Injectable()
export class PdfOrdemService {
  private readonly logger = new Logger(PdfOrdemService.name);
  private readonly uploadPath = path.join(process.cwd(), 'uploads', 'ordens');

  constructor(
    @InjectRepository(OrdemFornecimento)
    private readonly ordemRepository: Repository<OrdemFornecimento>,
    @InjectRepository(AssinaturaDigital)
    private readonly assinaturaRepository: Repository<AssinaturaDigital>,
    private readonly geradorPdfService: GeradorPdfService,
  ) {}

  /**
   * Gera PDF da ordem de fornecimento/serviço (mesmo modelo visual da Ordem de Serviço)
   */
  async gerarPdf(ordemId: string): Promise<string> {
    const ordem = await this.ordemRepository.findOne({
      where: { id: ordemId },
      relations: [
        'orgao',
        'fornecedor',
        'contrato',
        'contrato.licitacao',
        'requisicao',
      ],
    });

    if (!ordem) {
      throw new Error('Ordem não encontrada');
    }

    // Buscar assinaturas digitais da OF
    const assinaturas = await this.assinaturaRepository.find({
      where: {
        entidade_id: ordemId,
        entidade_tipo: EntidadeTipo.ORDEM_FORNECIMENTO,
      },
    });

    this.logger.log(`OF ${ordem.numero}: ${assinaturas.length} assinatura(s) encontrada(s)`);

    const dadosOrdem = {
      numero: ordem.numero,
      tipo: ordem.tipo,
      data_emissao: ordem.data_emissao,
      descricao: ordem.descricao,
      local_entrega: ordem.local_entrega,
      valor_total: Number(ordem.valor_total),
      itens: ordem.itens || [],
      orgao: ordem.orgao ? {
        nome: ordem.orgao.nome,
        logo_url: ordem.orgao.logo_url,
        logradouro: ordem.orgao.logradouro,
        bairro: ordem.orgao.bairro,
        cidade: ordem.orgao.cidade,
        uf: ordem.orgao.uf,
        cnpj: ordem.orgao.cnpj,
      } : undefined,
      contrato: ordem.contrato ? {
        numero_contrato: ordem.contrato.numero_contrato,
        numero_processo: ordem.contrato.numero_processo,
        objeto: ordem.contrato.objeto,
        fornecedor: ordem.contrato.fornecedor ? {
          razao_social: ordem.contrato.fornecedor.razao_social,
          cpf_cnpj: ordem.contrato.fornecedor.cpf_cnpj,
        } : undefined,
      } : undefined,
      requisicao: ordem.requisicao ? {
        usuario_solicitante_nome: ordem.requisicao.usuario_solicitante_nome,
        setor_solicitante: ordem.requisicao.setor_solicitante,
        prioridade: ordem.requisicao.prioridade,
      } : undefined,
      usuario_emitente_nome: ordem.usuario_emitente_nome,
    };

    const caminhoCompleto = await this.geradorPdfService.gerarPdfOrdemFornecimento(
      dadosOrdem,
      this.uploadPath,
      {
        assinaturas: assinaturas.length > 0 ? assinaturas : undefined,
        urlValidacaoBase: assinaturas.length > 0 ? `${process.env.APP_URL || 'https://portaldcp.com.br'}/validar-documento` : undefined,
      },
    );

    this.logger.log(`PDF gerado: ${caminhoCompleto}`);
    return caminhoCompleto;
  }
}
