import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { ehFaseInterna } from '../licitacoes/transicoes/fases';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentoLicitacao, TipoDocumentoLicitacao, StatusDocumento } from './entities/documento-licitacao.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { basesDeLeitura, resolverArquivoDeUrl } from '../common/arquivos/arquivos';
import { espelharDocumentoLicitacao } from '../fase-interna/espelho-documentos-licitacao';

/**
 * DOIS CONJUNTOS DE DOCUMENTOS, DONOS DIFERENTES (E9):
 *  - `documentos_fase_interna` (módulo fase-interna): artefatos ELABORADOS e
 *    APROVADOS na instrução — DFD, ETP, TR, riscos, pesquisa de preços,
 *    parecer, autorização — com conteúdo estruturado, versões e o fluxo de
 *    aprovação por etapa. São os autos da fase preparatória.
 *  - `documentos_licitacao` (este módulo): ARQUIVOS anexados/divulgados do
 *    processo — edital e suas versões (só pela publicação/retificação, E7),
 *    minuta, anexos, avisos, atas, respostas — com versão por tipo, hash e
 *    publicidade (PUBLICADO + público = divulgado, art. 54).
 * Um arquivo da fase interna anexado aqui é só o arquivo (sem aprovação); a
 * aprovação é sempre a do módulo fase-interna.
 *
 * Peças do EDITAL (plano E7a — art. 55 §1º): depois da publicação não se
 * anexam, trocam nem apagam por aqui — só pela retificação do edital
 * (POST /publicacao/licitacao/:id/retificar), que versiona e divulga.
 */
export const TIPOS_DO_EDITAL: TipoDocumentoLicitacao[] = [
  TipoDocumentoLicitacao.EDITAL,
  TipoDocumentoLicitacao.EDITAL_RETIFICADO,
  TipoDocumentoLicitacao.MINUTA_CONTRATO,
  TipoDocumentoLicitacao.TERMO_REFERENCIA,
  TipoDocumentoLicitacao.PROJETO_BASICO,
];

export function motivoPecaDoEditalBloqueada(tipo: string, fase: string | null | undefined): string | null {
  if (tipo === TipoDocumentoLicitacao.EDITAL_RETIFICADO) {
    return 'O edital retificado é gerado pela retificação do edital (POST /publicacao/licitacao/:id/retificar).';
  }
  // Um ato, um caminho (E9): o PDF do edital entra só pela publicação
  if (tipo === TipoDocumentoLicitacao.EDITAL && ehFaseInterna(fase)) {
    return 'O edital é anexado pela publicação (POST /publicacao/licitacao/:id/edital), que guarda o hash e o divulga no ato PUBLICAR.';
  }
  if (!TIPOS_DO_EDITAL.includes(tipo as TipoDocumentoLicitacao) || ehFaseInterna(fase)) return null;
  return 'Edital já publicado: peças do edital só mudam por RETIFICAÇÃO (art. 55, §1º, Lei 14.133/2021) — use "Retificar edital".';
}

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
    // bases reais do upload genérico (UPLOAD_DIR e diretório privado)
    ...basesDeLeitura(),
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
    const bloqueio = motivoPecaDoEditalBloqueada(tipo, licitacao.fase);
    if (bloqueio) throw new ConflictException(bloqueio);

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

    // Nova versão do tipo. O arquivo entra como RASCUNHO: a versão PUBLICADA
    // anterior continua vigente até esta ser publicada (`publicar`) — antes
    // (E9) o upload já marcava a anterior SUBSTITUIDO e o processo ficava sem
    // nenhuma versão divulgada.
    const documentoAnterior = await this.documentoRepository.findOne({
      where: { licitacao_id: licitacaoId, tipo, status: StatusDocumento.PUBLICADO },
      order: { versao: 'DESC' }
    });
    const versao = (await this.ultimaVersao(licitacaoId, tipo)) + 1;

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

    const salvo = await this.documentoRepository.save(documento);
    await this.espelharNaFaseInterna(salvo.id);
    return salvo;
  }

  /**
   * Arquivo de peça da FASE INTERNA (ETP, TR, pesquisa, parecer...) anexado
   * aqui passa a contar como a peça no checklist — espelho em
   * documentos_fase_interna (fase-interna/espelho-documentos-licitacao.ts).
   * Falha no espelho não desfaz o upload (fica para a migração de boot).
   */
  private async espelharNaFaseInterna(documentoId: string): Promise<void> {
    try {
      await this.documentoRepository.manager.transaction((m) => espelharDocumentoLicitacao(m, documentoId));
    } catch (e: any) {
      this.logger.warn(`Anexo ${documentoId} não espelhado como peça da fase interna: ${e?.message ?? e}`);
    }
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
    const bloqueio = motivoPecaDoEditalBloqueada(dados.tipo, licitacao.fase);
    if (bloqueio) throw new ConflictException(bloqueio);

    // Verificar versão anterior
    const documentoAnterior = await this.documentoRepository.findOne({
      where: { licitacao_id: licitacaoId, tipo: dados.tipo, status: StatusDocumento.PUBLICADO },
      order: { versao: 'DESC' }
    });

    const versao = (await this.ultimaVersao(licitacaoId, dados.tipo)) + 1;

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
      // URL devolvida pelo POST /api/uploads: resolve onde o upload gravou de
      // fato (UPLOAD_DIR / diretório privado); cai no legado <cwd>/uploads.
      const relativePath = dados.caminho.replace('/api/uploads/', 'uploads/');
      caminhoCompleto =
        resolverArquivoDeUrl(dados.caminho.split('?')[0]) ?? path.join(process.cwd(), relativePath);
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

    const salvo = await this.documentoRepository.save(documento);
    await this.espelharNaFaseInterna(salvo.id);
    return salvo;
  }

  /**
   * Publica a versão: ela passa a ser a vigente do tipo e as versões
   * PUBLICADAS anteriores viram SUBSTITUIDO (histórico) — na mesma transação.
   */
  async publicar(id: string): Promise<DocumentoLicitacao> {
    const documento = await this.documentoRepository.findOne({ where: { id }, relations: ['licitacao'] });
    if (!documento) {
      throw new NotFoundException('Documento não encontrado');
    }
    if (documento.status === StatusDocumento.SUBSTITUIDO) {
      throw new ConflictException('Versão substituída não volta a ser publicada — anexe uma nova versão.');
    }
    const bloqueio = motivoPecaDoEditalBloqueada(documento.tipo, documento.licitacao?.fase);
    if (bloqueio && documento.status !== StatusDocumento.PUBLICADO) throw new ConflictException(bloqueio);

    return this.documentoRepository.manager.transaction(async (m) => {
      await m
        .createQueryBuilder()
        .update(DocumentoLicitacao)
        .set({ status: StatusDocumento.SUBSTITUIDO })
        .where('licitacao_id = :lic AND tipo = :tipo AND status = :pub AND id <> :id', {
          lic: documento.licitacao_id,
          tipo: documento.tipo,
          pub: StatusDocumento.PUBLICADO,
          id: documento.id,
        })
        .execute();
      documento.status = StatusDocumento.PUBLICADO;
      documento.data_publicacao = new Date();
      documento.publico = true;
      return m.save(documento);
    });
  }

  private async ultimaVersao(licitacaoId: string, tipo: TipoDocumentoLicitacao): Promise<number> {
    const r = await this.documentoRepository
      .createQueryBuilder('d')
      .select('COALESCE(MAX(d.versao), 0)', 'max')
      .where('d.licitacao_id = :licitacaoId AND d.tipo = :tipo', { licitacaoId, tipo })
      .getRawOne<{ max: string | number }>();
    return Number(r?.max ?? 0);
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

  /** Fase e data de divulgação da licitação (para decidir se é pública). */
  async faseDaLicitacao(licitacaoId: string): Promise<Pick<Licitacao, 'id' | 'fase' | 'data_publicacao_edital'> | null> {
    return this.licitacaoRepository.findOne({
      where: { id: licitacaoId },
      select: ['id', 'fase', 'data_publicacao_edital'],
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
    if (TIPOS_DO_EDITAL.includes(documento.tipo) && documento.licitacao && !ehFaseInterna(documento.licitacao.fase)) {
      throw new ConflictException('Edital já publicado: peças do edital não se apagam — o histórico de versões é público (art. 55, §1º).');
    }
    
    // Remover arquivo físico — só dentro das pastas de upload
    const caminhoSeguro = this.caminhoPermitido(documento.caminho_arquivo);
    if (caminhoSeguro && fs.existsSync(caminhoSeguro)) {
      fs.unlinkSync(caminhoSeguro);
    }

    await this.documentoRepository.delete(id);
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
        'licitacao.fase',
        'licitacao.data_publicacao_edital',
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
