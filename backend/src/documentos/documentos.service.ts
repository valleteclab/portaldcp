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

  /**
   * Pastas de onde este módulo pode ler, vincular ou apagar arquivos.
   * Qualquer caminho fora delas (ex.: "../.env", caminho absoluto do sistema)
   * é recusado — o caminho vem do cliente no vincular e fica gravado no banco.
   */
  private readonly raizesPermitidas = [
    path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads')),
    path.resolve(process.cwd(), 'uploads'),
    path.resolve(this.uploadPath),
  ];

  /** Resolve o caminho e devolve-o só se estiver dentro de uma pasta de uploads permitida. */
  private caminhoPermitido(caminho: string | null | undefined): string | null {
    if (!caminho || caminho.includes(String.fromCharCode(0))) return null;
    const resolvido = path.resolve(caminho);
    const dentro = this.raizesPermitidas.some(
      (raiz) => resolvido === raiz || resolvido.startsWith(raiz + path.sep),
    );
    return dentro ? resolvido : null;
  }

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

    // O arquivo precisa estar dentro das pastas de upload (bloqueia ../ e caminhos do sistema)
    const caminhoSeguro = this.caminhoPermitido(caminhoCompleto);
    if (!caminhoSeguro) {
      throw new BadRequestException('Caminho de arquivo inválido: o documento deve ter sido enviado pelo upload do sistema');
    }
    caminhoCompleto = caminhoSeguro;

    // Obter tamanho do arquivo se existir
    let tamanhoBytes = 0;
    if (fs.existsSync(caminhoCompleto)) {
      const stats = fs.statSync(caminhoCompleto);
      tamanhoBytes = stats.size;
    } else {
      throw new BadRequestException('Arquivo não encontrado no servidor; envie o arquivo pelo upload antes de vincular');
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

  async findByLicitacaoPublicos(licitacaoId: string): Promise<DocumentoLicitacao[]> {
    return this.documentoRepository
      .createQueryBuilder('doc')
      .select([
        'doc.id',
        'doc.tipo',
        'doc.titulo',
        'doc.descricao',
        'doc.nome_original',
        'doc.mime_type',
        'doc.tamanho_bytes',
        'doc.hash_arquivo',
        'doc.versao',
        'doc.numero_documento',
        'doc.data_documento',
        'doc.data_publicacao',
      ])
      .where('doc.licitacao_id = :licitacaoId', { licitacaoId })
      .andWhere('doc.publico = :publico', { publico: true })
      .andWhere('doc.status = :status', { status: StatusDocumento.PUBLICADO })
      .orderBy('doc.tipo', 'ASC')
      .addOrderBy('doc.versao', 'DESC')
      .getMany();
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
    const original = documento.caminho_arquivo || '';

    // Variações aceitas para registros antigos — todas só valem se caírem dentro das pastas de upload
    const possiveisCaminhos = [
      original,
      path.join(process.cwd(), original),
      original.startsWith('/api/uploads/')
        ? path.join(process.cwd(), original.replace('/api/uploads/', 'uploads/'))
        : null,
      original.startsWith('/uploads/') ? path.join(process.cwd(), original.substring(1)) : null,
      documento.nome_arquivo ? path.join(process.cwd(), 'uploads', path.basename(documento.nome_arquivo)) : null,
      documento.nome_arquivo ? path.join(process.cwd(), 'uploads', 'documentos', path.basename(documento.nome_arquivo)) : null,
      documento.nome_arquivo ? path.join(process.cwd(), 'uploads', 'licitacoes', path.basename(documento.nome_arquivo)) : null,
    ];

    let caminhoFinal: string | null = null;
    for (const candidato of possiveisCaminhos) {
      const seguro = this.caminhoPermitido(candidato);
      if (seguro && fs.existsSync(seguro) && fs.statSync(seguro).isFile()) {
        caminhoFinal = seguro;
        break;
      }
    }

    if (!caminhoFinal) {
      this.logger.error(`Arquivo do documento ${documento.id} não encontrado ou fora das pastas de upload`);
      throw new NotFoundException('Arquivo não encontrado no servidor');
    }

    const buffer = fs.readFileSync(caminhoFinal);
    return { buffer, documento };
  }

  async delete(id: string): Promise<void> {
    const documento = await this.findOne(id);
    
    // Remover arquivo físico — só dentro das pastas de upload
    const caminhoSeguro = this.caminhoPermitido(documento.caminho_arquivo);
    if (caminhoSeguro && fs.existsSync(caminhoSeguro)) {
      fs.unlinkSync(caminhoSeguro);
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
      .select([
        'doc.id',
        'doc.tipo',
        'doc.titulo',
        'doc.descricao',
        'doc.nome_original',
        'doc.mime_type',
        'doc.tamanho_bytes',
        'doc.hash_arquivo',
        'doc.versao',
        'doc.numero_documento',
        'doc.data_documento',
        'doc.data_publicacao',
        'licitacao.id',
        'licitacao.numero_processo',
        'licitacao.numero_edital',
        'licitacao.objeto',
        'orgao.id',
        'orgao.nome',
        'orgao.cnpj',
        'orgao.cidade',
        'orgao.uf',
      ])
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
