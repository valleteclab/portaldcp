import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentoLicitacao, TipoDocumentoLicitacao, StatusDocumento } from './entities/documento-licitacao.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class DocumentosService {
  private readonly logger = new Logger(DocumentosService.name);
  private readonly uploadPath = process.env.UPLOAD_PATH || './uploads/documentos';

  constructor(
    @InjectRepository(DocumentoLicitacao)
    private documentoRepository: Repository<DocumentoLicitacao>,
    @InjectRepository(Licitacao)
    private licitacaoRepository: Repository<Licitacao>,
  ) {
    // Criar diretório de uploads se não existir
    if (!fs.existsSync(this.uploadPath)) {
      fs.mkdirSync(this.uploadPath, { recursive: true });
    }
  }

  async upload(
    licitacaoId: string,
    tipo: TipoDocumentoLicitacao,
    arquivo: Express.Multer.File,
    dados: {
      titulo: string;
      descricao?: string;
      numero_documento?: string;
      data_documento?: Date;
      publico?: boolean;
      usuario_id?: string;
      usuario_nome?: string;
    }
  ): Promise<DocumentoLicitacao> {
    // Verificar se licitação existe
    const licitacao = await this.licitacaoRepository.findOne({ where: { id: licitacaoId } });
    if (!licitacao) {
      throw new NotFoundException('Licitação não encontrada');
    }

    // Validar tipo de arquivo
    const tiposPermitidos = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!tiposPermitidos.includes(arquivo.mimetype)) {
      throw new BadRequestException('Tipo de arquivo não permitido. Use PDF ou DOC/DOCX.');
    }

    // Gerar nome único para o arquivo
    const extensao = path.extname(arquivo.originalname);
    const nomeArquivo = `${licitacaoId}_${tipo}_${Date.now()}${extensao}`;
    const caminhoCompleto = path.join(this.uploadPath, nomeArquivo);

    // Salvar arquivo
    fs.writeFileSync(caminhoCompleto, arquivo.buffer);

    // Calcular hash do arquivo
    const hash = crypto.createHash('sha256').update(arquivo.buffer).digest('hex');

    // Verificar versão anterior
    const documentoAnterior = await this.documentoRepository.findOne({
      where: { licitacao_id: licitacaoId, tipo, status: StatusDocumento.PUBLICADO },
      order: { versao: 'DESC' }
    });

    const versao = documentoAnterior ? documentoAnterior.versao + 1 : 1;

    // Se houver documento anterior, marcar como substituído
    if (documentoAnterior) {
      await this.documentoRepository.update(documentoAnterior.id, {
        status: StatusDocumento.SUBSTITUIDO
      });
    }

    // Criar registro do documento
    const documento = this.documentoRepository.create({
      licitacao_id: licitacaoId,
      tipo,
      titulo: dados.titulo,
      descricao: dados.descricao,
      nome_arquivo: nomeArquivo,
      nome_original: arquivo.originalname,
      caminho_arquivo: caminhoCompleto,
      mime_type: arquivo.mimetype,
      tamanho_bytes: arquivo.size,
      hash_arquivo: hash,
      versao,
      documento_anterior_id: documentoAnterior?.id,
      status: StatusDocumento.RASCUNHO,
      publico: dados.publico || false,
      numero_documento: dados.numero_documento,
      data_documento: dados.data_documento,
      usuario_upload_id: dados.usuario_id,
      usuario_upload_nome: dados.usuario_nome
    });

    return this.documentoRepository.save(documento);
  }

  // Vincular documento já existente (arquivo já foi enviado via /uploads)
  async vincularDocumentoExistente(
    licitacaoId: string,
    dados: {
      tipo: TipoDocumentoLicitacao;
      titulo: string;
      nome_original: string;
      caminho: string;
      descricao?: string;
      publico?: boolean;
    }
  ): Promise<DocumentoLicitacao> {
    // Verificar se licitação existe
    const licitacao = await this.licitacaoRepository.findOne({ where: { id: licitacaoId } });
    if (!licitacao) {
      throw new NotFoundException('Licitação não encontrada');
    }

    // Verificar versão anterior
    const documentoAnterior = await this.documentoRepository.findOne({
      where: { licitacao_id: licitacaoId, tipo: dados.tipo, status: StatusDocumento.PUBLICADO },
      order: { versao: 'DESC' }
    });

    const versao = documentoAnterior ? documentoAnterior.versao + 1 : 1;

    // Se houver documento anterior, marcar como substituído
    if (documentoAnterior) {
      await this.documentoRepository.update(documentoAnterior.id, {
        status: StatusDocumento.SUBSTITUIDO
      });
    }

    // Determinar o caminho completo do arquivo
    // Se for uma URL de API (/api/uploads/...), converter para caminho de arquivo
    let caminhoCompleto = dados.caminho;
    if (dados.caminho.startsWith('/api/uploads/')) {
      // Extrair o caminho relativo: /api/uploads/tipo/arquivo.pdf -> uploads/tipo/arquivo.pdf
      const relativePath = dados.caminho.replace('/api/uploads/', 'uploads/');
      caminhoCompleto = path.join(process.cwd(), relativePath);
    } else if (dados.caminho.startsWith('/uploads/')) {
      caminhoCompleto = path.join(process.cwd(), dados.caminho.substring(1));
    } else if (dados.caminho.startsWith('/')) {
      caminhoCompleto = path.join(process.cwd(), dados.caminho);
    }

    // Obter tamanho do arquivo se existir
    let tamanhoBytes = 0;
    if (fs.existsSync(caminhoCompleto)) {
      const stats = fs.statSync(caminhoCompleto);
      tamanhoBytes = stats.size;
    } else {
      this.logger.warn(`Arquivo não encontrado: ${caminhoCompleto} (caminho original: ${dados.caminho})`);
    }

    // Criar registro do documento
    const documento = this.documentoRepository.create({
      licitacao_id: licitacaoId,
      tipo: dados.tipo,
      titulo: dados.titulo,
      descricao: dados.descricao,
      nome_arquivo: path.basename(dados.caminho),
      nome_original: dados.nome_original,
      caminho_arquivo: caminhoCompleto,
      mime_type: 'application/pdf', // Assume PDF por padrão
      tamanho_bytes: tamanhoBytes,
      versao,
      documento_anterior_id: documentoAnterior?.id,
      status: StatusDocumento.PUBLICADO, // Já publica direto
      publico: dados.publico ?? true,
      data_publicacao: new Date()
    });

    return this.documentoRepository.save(documento);
  }

  async publicar(id: string): Promise<DocumentoLicitacao> {
    const documento = await this.documentoRepository.findOne({ where: { id } });
    if (!documento) {
      throw new NotFoundException('Documento não encontrado');
    }

    documento.status = StatusDocumento.PUBLICADO;
    documento.data_publicacao = new Date();
    documento.publico = true;

    return this.documentoRepository.save(documento);
  }

  async findByLicitacao(licitacaoId: string, apenasPublicos = false): Promise<DocumentoLicitacao[]> {
    const where: any = { licitacao_id: licitacaoId };
    
    if (apenasPublicos) {
      where.publico = true;
      where.status = StatusDocumento.PUBLICADO;
    }

    return this.documentoRepository.find({
      where,
      order: { tipo: 'ASC', versao: 'DESC' }
    });
  }

  async findByTipo(licitacaoId: string, tipo: TipoDocumentoLicitacao): Promise<DocumentoLicitacao[]> {
    return this.documentoRepository.find({
      where: { licitacao_id: licitacaoId, tipo },
      order: { versao: 'DESC' }
    });
  }

  async findOne(id: string): Promise<DocumentoLicitacao> {
    const documento = await this.documentoRepository.findOne({ 
      where: { id },
      relations: ['licitacao']
    });
    if (!documento) {
      throw new NotFoundException('Documento não encontrado');
    }
    return documento;
  }

  async getArquivo(id: string): Promise<{ buffer: Buffer; documento: DocumentoLicitacao }> {
    const documento = await this.findOne(id);
    
    // Tentar diferentes caminhos possíveis
    let caminhoFinal = documento.caminho_arquivo;
    
    // Se o caminho não existir, tentar variações
    if (!fs.existsSync(caminhoFinal)) {
      const possiveisCaminhos = [
        documento.caminho_arquivo,
        // Caminho relativo a partir do cwd
        path.join(process.cwd(), documento.caminho_arquivo),
        // Se for URL de API, converter para caminho de arquivo
        documento.caminho_arquivo.startsWith('/api/uploads/') 
          ? path.join(process.cwd(), documento.caminho_arquivo.replace('/api/uploads/', 'uploads/'))
          : null,
        // Se começar com /uploads/
        documento.caminho_arquivo.startsWith('/uploads/')
          ? path.join(process.cwd(), documento.caminho_arquivo.substring(1))
          : null,
        // Caminho no diretório de uploads padrão
        path.join(process.cwd(), 'uploads', documento.nome_arquivo),
        path.join(process.cwd(), 'uploads', 'documentos', documento.nome_arquivo),
        path.join(process.cwd(), 'uploads', 'licitacoes', documento.nome_arquivo),
      ].filter(Boolean);

      for (const caminho of possiveisCaminhos) {
        if (caminho && fs.existsSync(caminho)) {
          caminhoFinal = caminho;
          this.logger.log(`Arquivo encontrado em: ${caminho}`);
          break;
        }
      }
    }

    if (!fs.existsSync(caminhoFinal)) {
      this.logger.error(`Arquivo não encontrado. Caminho original: ${documento.caminho_arquivo}, Nome: ${documento.nome_arquivo}`);
      throw new NotFoundException(`Arquivo não encontrado no servidor. Caminho: ${documento.caminho_arquivo}`);
    }

    const buffer = fs.readFileSync(caminhoFinal);
    return { buffer, documento };
  }

  async delete(id: string): Promise<void> {
    const documento = await this.findOne(id);
    
    // Remover arquivo físico
    if (fs.existsSync(documento.caminho_arquivo)) {
      fs.unlinkSync(documento.caminho_arquivo);
    }

    await this.documentoRepository.delete(id);
  }

  async marcarEnviadoPNCP(id: string, sequencial: number): Promise<DocumentoLicitacao> {
    const documento = await this.findOne(id);
    
    documento.enviado_pncp = true;
    documento.sequencial_pncp = sequencial;
    documento.data_envio_pncp = new Date();

    return this.documentoRepository.save(documento);
  }

  // Buscar documentos públicos para o portal
  async findPublicos(filtros?: {
    licitacaoId?: string;
    tipo?: TipoDocumentoLicitacao;
    orgaoId?: string;
  }): Promise<DocumentoLicitacao[]> {
    const query = this.documentoRepository.createQueryBuilder('doc')
      .leftJoinAndSelect('doc.licitacao', 'licitacao')
      .leftJoinAndSelect('licitacao.orgao', 'orgao')
      .where('doc.publico = :publico', { publico: true })
      .andWhere('doc.status = :status', { status: StatusDocumento.PUBLICADO });

    if (filtros?.licitacaoId) {
      query.andWhere('doc.licitacao_id = :licitacaoId', { licitacaoId: filtros.licitacaoId });
    }

    if (filtros?.tipo) {
      query.andWhere('doc.tipo = :tipo', { tipo: filtros.tipo });
    }

    if (filtros?.orgaoId) {
      query.andWhere('licitacao.orgao_id = :orgaoId', { orgaoId: filtros.orgaoId });
    }

    return query.orderBy('doc.created_at', 'DESC').getMany();
  }

  // Estatísticas
  async contarPorTipo(licitacaoId: string): Promise<Record<string, number>> {
    const documentos = await this.documentoRepository.find({
      where: { licitacao_id: licitacaoId, status: StatusDocumento.PUBLICADO }
    });

    const contagem: Record<string, number> = {};
    documentos.forEach(doc => {
      contagem[doc.tipo] = (contagem[doc.tipo] || 0) + 1;
    });

    return contagem;
  }
}
