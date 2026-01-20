import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { OrdemFornecimento } from './entities/ordem-fornecimento.entity';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { Contrato } from '../contratos/entities/contrato.entity';
import { Requisicao } from './entities/requisicao.entity';

@Injectable()
export class PdfOrdemService {
  private readonly logger = new Logger(PdfOrdemService.name);
  private readonly uploadPath = path.join(process.cwd(), 'uploads', 'ordens');

  constructor(
    @InjectRepository(OrdemFornecimento)
    private readonly ordemRepository: Repository<OrdemFornecimento>,
  ) {
    // Cria diretório de uploads se não existir
    if (!fs.existsSync(this.uploadPath)) {
      fs.mkdirSync(this.uploadPath, { recursive: true });
    }
  }

  /**
   * Gera PDF da ordem de fornecimento/serviço
   */
  async gerarPdf(ordemId: string): Promise<string> {
    const ordem = await this.ordemRepository.findOne({
      where: { id: ordemId },
      relations: [
        'orgao',
        'fornecedor',
        'contrato',
        'requisicao',
      ],
    });

    if (!ordem) {
      throw new Error('Ordem não encontrada');
    }

    const nomeArquivo = `ordem_${ordem.numero.replace(/\//g, '_')}.pdf`;
    const caminhoCompleto = path.join(this.uploadPath, nomeArquivo);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
      });

      const stream = fs.createWriteStream(caminhoCompleto);
      doc.pipe(stream);

      try {
        this.adicionarCabecalho(doc, ordem);
        this.adicionarInformacoesOrdem(doc, ordem);
        this.adicionarTabelaItens(doc, ordem);
        this.adicionarRodape(doc, ordem);

        doc.end();

        stream.on('finish', () => {
          this.logger.log(`PDF gerado: ${caminhoCompleto}`);
          resolve(caminhoCompleto);
        });

        stream.on('error', (error) => {
          this.logger.error(`Erro ao gerar PDF: ${error.message}`);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Adiciona cabeçalho do documento
   */
  private adicionarCabecalho(doc: PDFDocument, ordem: OrdemFornecimento): void {
    const orgao = ordem.orgao as Orgao;

    // Cabeçalho do órgão
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text(orgao.nome || 'ÓRGÃO NÃO INFORMADO', { align: 'center' });

    if (orgao.endereco) {
      doc.fontSize(10).font('Helvetica');
      doc.text(orgao.endereco, { align: 'center' });
    }

    if (orgao.cidade && orgao.uf) {
      doc.text(`${orgao.cidade} - ${orgao.uf}`, { align: 'center' });
    }

    doc.moveDown(1);

    // Título
    doc.fontSize(14).font('Helvetica-Bold');
    const titulo = ordem.tipo === 'SERVICO' ? 'ORDEM DE SERVIÇO' : 'ORDEM DE FORNECIMENTO';
    doc.text(titulo, { align: 'center' });
    doc.fontSize(10).font('Helvetica');
    doc.text(ordem.numero, { align: 'center' });

    doc.moveDown(1);
  }

  /**
   * Adiciona informações da ordem
   */
  private adicionarInformacoesOrdem(doc: PDFDocument, ordem: OrdemFornecimento): void {
    const orgao = ordem.orgao as Orgao;
    const fornecedor = ordem.fornecedor as Fornecedor;
    const contrato = ordem.contrato as Contrato;
    const requisicao = ordem.requisicao as Requisicao;

    doc.fontSize(9).font('Helvetica');

    // Tabela de informações
    const startY = doc.y;
    const col1 = 50;
    const col2 = 200;
    const col3 = 350;
    const lineHeight = 15;

    let currentY = startY;

    // Linha 1: Ordem N°, Data Pedido, Necessidade
    doc.text('Ordem N°', col1, currentY);
    doc.text(ordem.numero, col2, currentY);
    doc.text('Data Pedido', col2 + 80, currentY);
    doc.text(this.formatarData(ordem.data_emissao), col3, currentY);
    currentY += lineHeight;

    // Linha 2: Secretaria, CNPJ SEC
    doc.text('Secretaria', col1, currentY);
    doc.text(orgao.nome || '', col2, currentY);
    if (orgao.cnpj) {
      doc.text('CNPJ SEC', col2 + 80, currentY);
      doc.text(this.formatarCNPJ(orgao.cnpj), col3, currentY);
    }
    currentY += lineHeight;

    // Linha 3: Fornecedor, CNPJ/CPF
    doc.text('Fornecedor', col1, currentY);
    doc.text(fornecedor.razao_social || '', col2, currentY);
    doc.text('CNPJ/CPF', col2 + 80, currentY);
    doc.text(this.formatarCNPJ(fornecedor.cpf_cnpj), col3, currentY);
    currentY += lineHeight;

    // Linha 4: Endereço, Bairro
    if (fornecedor.logradouro) {
      doc.text('Endereço', col1, currentY);
      doc.text(
        `${fornecedor.logradouro}${fornecedor.numero ? ', ' + fornecedor.numero : ''}`,
        col2,
        currentY,
      );
      if (fornecedor.bairro) {
        doc.text('Bairro', col2 + 80, currentY);
        doc.text(fornecedor.bairro, col3, currentY);
      }
      currentY += lineHeight;
    }

    // Linha 5: Cidade/UF, CONTRATO
    if (fornecedor.cidade && fornecedor.uf) {
      doc.text('Cidade/UF', col1, currentY);
      doc.text(`${fornecedor.cidade} - ${fornecedor.uf}`, col2, currentY);
    }
    if (contrato.numero) {
      doc.text('CONTRATO', col2 + 80, currentY);
      doc.text(contrato.numero, col3, currentY);
    }
    currentY += lineHeight;

    // Linha 6: Requerente, Licitação
    if (requisicao?.usuario_solicitante_nome) {
      doc.text('Requerente', col1, currentY);
      doc.text(requisicao.usuario_solicitante_nome, col2, currentY);
    }
    if (contrato.licitacao_numero) {
      doc.text('Licitação', col2 + 80, currentY);
      doc.text(contrato.licitacao_numero, col3, currentY);
    }
    currentY += lineHeight;

    // Linha 7: Local, Processo
    if (ordem.local_entrega) {
      doc.text('Local', col1, currentY);
      doc.text(ordem.local_entrega, col2, currentY);
    }
    if (contrato.numero_processo) {
      doc.text('Processo', col2 + 80, currentY);
      doc.text(contrato.numero_processo, col3, currentY);
    }
    currentY += lineHeight;

    // Linha 8: Assunto
    if (ordem.descricao || contrato.objeto) {
      doc.text('Assunto', col1, currentY);
      const assunto = ordem.descricao || contrato.objeto || '';
      doc.text(assunto.substring(0, 100), col2, currentY, { width: 300 });
    }

    doc.moveDown(2);
  }

  /**
   * Adiciona tabela de itens
   */
  private adicionarTabelaItens(doc: PDFDocument, ordem: OrdemFornecimento): void {
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Informações', { underline: true });
    doc.moveDown(0.5);

    // Cabeçalho da tabela
    const startY = doc.y;
    const colItem = 50;
    const colDesc = 80;
    const colMarca = 250;
    const colUnd = 300;
    const colQtde = 330;
    const colValorUn = 370;
    const colTotal = 450;
    const lineHeight = 12;

    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('ITEM', colItem, startY);
    doc.text('DESCRIÇÃO', colDesc, startY);
    doc.text('MARCA', colMarca, startY);
    doc.text('UND', colUnd, startY);
    doc.text('QTDE', colQtde, startY);
    doc.text('VALOR UN.', colValorUn, startY);
    doc.text('TOTAL', colTotal, startY);

    // Linha separadora
    doc.moveTo(colItem, startY + lineHeight).lineTo(colTotal + 50, startY + lineHeight).stroke();

    let currentY = startY + lineHeight + 5;
    doc.fontSize(8).font('Helvetica');

    // Itens
    ordem.itens.forEach((item, index) => {
      // Verifica se precisa de nova página
      if (currentY > 700) {
        doc.addPage();
        currentY = 50;
      }

      const descricao = item.descricao || '';
      const descricaoTruncada = descricao.length > 30 ? descricao.substring(0, 27) + '...' : descricao;
      
      doc.text(String(item.numero_item || index + 1), colItem, currentY);
      doc.text(descricaoTruncada, colDesc, currentY, { width: 160 });
      doc.text('-', colMarca, currentY, { width: 45 }); // Marca não está na estrutura atual
      doc.text(item.unidade_medida || '-', colUnd, currentY);
      doc.text(String(item.quantidade), colQtde, currentY);
      doc.text(this.formatarMoeda(item.valor_unitario), colValorUn, currentY);
      doc.text(this.formatarMoeda(item.valor_total), colTotal, currentY);

      currentY += lineHeight;
    });

    doc.y = currentY + 10;

    // Valor total
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('VALOR TOTAL DA ORDEM :', colDesc, doc.y);
    doc.text(this.formatarMoeda(Number(ordem.valor_total)), colTotal, doc.y);

    doc.moveDown(2);
  }

  /**
   * Adiciona rodapé com assinaturas
   */
  private adicionarRodape(doc: PDFDocument, ordem: OrdemFornecimento): void {
    doc.fontSize(9).font('Helvetica');
    doc.text(
      'A NOTA FISCAL SÓ TERÁ VALIDADE NO LANÇAMENTO DO EMPENHO, SE ACOMPANHADA DESTA ORDEM DEVIDAMENTE ASSINADA PELO RESPONSÁVEL',
      { align: 'center' },
    );

    doc.moveDown(2);

    // Assinaturas
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('Assinatura(s) :');

    doc.moveDown(1);
    doc.fontSize(8).font('Helvetica');

    if (ordem.usuario_emitente_nome) {
      doc.text(`Pessoa: ${ordem.usuario_emitente_nome}`);
      doc.moveDown(0.5);
      doc.text('CPF:');
      doc.moveDown(1);
      doc.text('Cargo:');
      doc.moveDown(2);
    }
  }

  /**
   * Formata data para DD/MM/YYYY
   */
  private formatarData(data: Date): string {
    if (!data) return '';
    const d = new Date(data);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  /**
   * Formata CNPJ/CPF
   */
  private formatarCNPJ(cnpj: string): string {
    if (!cnpj) return '';
    const limpo = cnpj.replace(/\D/g, '');
    if (limpo.length === 11) {
      // CPF
      return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    } else if (limpo.length === 14) {
      // CNPJ
      return limpo.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    return cnpj;
  }

  /**
   * Formata valor monetário
   */
  private formatarMoeda(valor: number): string {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor);
  }
}
