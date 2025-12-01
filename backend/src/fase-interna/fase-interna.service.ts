import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentoFaseInterna, TipoDocumentoFaseInterna, StatusDocumento, OrigemDocumento } from './entities/documento-fase-interna.entity';
import { Licitacao, FaseLicitacao } from '../licitacoes/entities/licitacao.entity';

/**
 * Servico para gerenciamento da Fase Interna (Preparatoria)
 * Conforme Art. 18 da Lei 14.133/2021
 */
@Injectable()
export class FaseInternaService {
  constructor(
    @InjectRepository(DocumentoFaseInterna)
    private readonly documentoRepository: Repository<DocumentoFaseInterna>,
    @InjectRepository(Licitacao)
    private readonly licitacaoRepository: Repository<Licitacao>,
  ) {}

  // ========================================
  // DOCUMENTOS OBRIGATORIOS POR FASE
  // ========================================

  private getDocumentosObrigatorios(fase: FaseLicitacao): TipoDocumentoFaseInterna[] {
    const documentosPorFase: Record<string, TipoDocumentoFaseInterna[]> = {
      [FaseLicitacao.PLANEJAMENTO]: [
        TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA,
        TipoDocumentoFaseInterna.ESTUDO_TECNICO_PRELIMINAR,
      ],
      [FaseLicitacao.TERMO_REFERENCIA]: [
        TipoDocumentoFaseInterna.TERMO_REFERENCIA,
        TipoDocumentoFaseInterna.JUSTIFICATIVA_CONTRATACAO,
      ],
      [FaseLicitacao.PESQUISA_PRECOS]: [
        TipoDocumentoFaseInterna.PESQUISA_PRECOS,
        TipoDocumentoFaseInterna.MAPA_COMPARATIVO_PRECOS,
      ],
      [FaseLicitacao.ANALISE_JURIDICA]: [
        TipoDocumentoFaseInterna.PARECER_JURIDICO,
      ],
      [FaseLicitacao.APROVACAO_INTERNA]: [
        TipoDocumentoFaseInterna.AUTORIZACAO_ABERTURA,
        TipoDocumentoFaseInterna.DESIGNACAO_PREGOEIRO,
        TipoDocumentoFaseInterna.DOTACAO_ORCAMENTARIA,
      ],
    };

    return documentosPorFase[fase] || [];
  }

  // ========================================
  // CRIACAO DE DOCUMENTOS
  // ========================================

  async criarDocumento(
    licitacaoId: string,
    tipo: TipoDocumentoFaseInterna,
    titulo: string,
    descricao?: string,
    criadorId?: string,
    criadorNome?: string
  ): Promise<DocumentoFaseInterna> {
    const licitacao = await this.licitacaoRepository.findOneBy({ id: licitacaoId });
    if (!licitacao) {
      throw new NotFoundException('Licitacao nao encontrada');
    }

    // Verifica se ja existe documento do mesmo tipo (versao atual)
    const existente = await this.documentoRepository.findOne({
      where: { licitacao_id: licitacaoId, tipo, versao_atual: true }
    });

    if (existente) {
      // Marca versao anterior como nao atual
      existente.versao_atual = false;
      await this.documentoRepository.save(existente);
    }

    const documento = this.documentoRepository.create({
      licitacao_id: licitacaoId,
      tipo,
      titulo,
      descricao,
      status: StatusDocumento.EM_ELABORACAO,
      origem: OrigemDocumento.INTERNO,
      versao: existente ? existente.versao + 1 : 1,
      versao_atual: true,
      versao_anterior_id: existente?.id,
      obrigatorio: this.isDocumentoObrigatorio(licitacao.fase, tipo),
      criado_por_id: criadorId,
      criado_por_nome: criadorNome,
    });

    return await this.documentoRepository.save(documento);
  }

  private isDocumentoObrigatorio(fase: FaseLicitacao, tipo: TipoDocumentoFaseInterna): boolean {
    const obrigatorios = this.getDocumentosObrigatorios(fase);
    return obrigatorios.includes(tipo);
  }

  // ========================================
  // IMPORTACAO DE DOCUMENTOS
  // ========================================

  async importarDocumento(
    licitacaoId: string,
    tipo: TipoDocumentoFaseInterna,
    titulo: string,
    origem: OrigemDocumento,
    sistemaOrigem: string,
    idExterno: string,
    nomeArquivo?: string,
    caminhoArquivo?: string,
    hashArquivo?: string
  ): Promise<DocumentoFaseInterna> {
    const licitacao = await this.licitacaoRepository.findOneBy({ id: licitacaoId });
    if (!licitacao) {
      throw new NotFoundException('Licitacao nao encontrada');
    }

    const documento = this.documentoRepository.create({
      licitacao_id: licitacaoId,
      tipo,
      titulo,
      status: StatusDocumento.IMPORTADO,
      origem,
      sistema_origem: sistemaOrigem,
      id_externo: idExterno,
      data_importacao: new Date(),
      nome_arquivo: nomeArquivo,
      caminho_arquivo: caminhoArquivo,
      hash_arquivo: hashArquivo,
      versao: 1,
      versao_atual: true,
      obrigatorio: this.isDocumentoObrigatorio(licitacao.fase, tipo),
    });

    return await this.documentoRepository.save(documento);
  }

  /**
   * Importa processo completo de outro sistema
   * Cria a licitacao e todos os documentos da fase interna
   */
  async importarProcessoCompleto(dados: {
    sistemaOrigem: string;
    idExterno: string;
    numero_processo: string;
    objeto: string;
    modalidade: string;
    orgaoId: string;
    documentos: Array<{
      tipo: TipoDocumentoFaseInterna;
      titulo: string;
      idExterno: string;
      caminhoArquivo?: string;
    }>;
  }): Promise<{ licitacao: Licitacao; documentos: DocumentoFaseInterna[] }> {
    // Cria a licitacao
    const licitacao = this.licitacaoRepository.create({
      numero_processo: dados.numero_processo,
      objeto: dados.objeto,
      modalidade: dados.modalidade as any,
      orgao_id: dados.orgaoId,
      fase: FaseLicitacao.APROVACAO_INTERNA, // Ja vem aprovada da fase interna
      fase_interna_concluida: true,
    });

    await this.licitacaoRepository.save(licitacao);

    // Importa todos os documentos
    const documentosImportados: DocumentoFaseInterna[] = [];

    for (const doc of dados.documentos) {
      const documento = await this.importarDocumento(
        licitacao.id,
        doc.tipo,
        doc.titulo,
        OrigemDocumento.IMPORTADO_ARQUIVO,
        dados.sistemaOrigem,
        doc.idExterno,
        undefined,
        doc.caminhoArquivo
      );
      documentosImportados.push(documento);
    }

    return { licitacao, documentos: documentosImportados };
  }

  // ========================================
  // APROVACAO DE DOCUMENTOS
  // ========================================

  async submeterParaAprovacao(documentoId: string): Promise<DocumentoFaseInterna> {
    const documento = await this.documentoRepository.findOneBy({ id: documentoId });
    if (!documento) {
      throw new NotFoundException('Documento nao encontrado');
    }

    if (documento.status !== StatusDocumento.EM_ELABORACAO) {
      throw new BadRequestException('Documento nao esta em elaboracao');
    }

    documento.status = StatusDocumento.AGUARDANDO_APROVACAO;
    return await this.documentoRepository.save(documento);
  }

  async aprovarDocumento(
    documentoId: string,
    aprovadorId: string,
    aprovadorNome: string,
    observacao?: string
  ): Promise<DocumentoFaseInterna> {
    const documento = await this.documentoRepository.findOneBy({ id: documentoId });
    if (!documento) {
      throw new NotFoundException('Documento nao encontrado');
    }

    if (documento.status !== StatusDocumento.AGUARDANDO_APROVACAO) {
      throw new BadRequestException('Documento nao esta aguardando aprovacao');
    }

    documento.status = StatusDocumento.APROVADO;
    documento.aprovador_id = aprovadorId;
    documento.aprovador_nome = aprovadorNome;
    documento.data_aprovacao = new Date();
    if (observacao) documento.observacao_aprovacao = observacao;

    return await this.documentoRepository.save(documento);
  }

  async reprovarDocumento(
    documentoId: string,
    aprovadorId: string,
    aprovadorNome: string,
    observacao: string
  ): Promise<DocumentoFaseInterna> {
    const documento = await this.documentoRepository.findOneBy({ id: documentoId });
    if (!documento) {
      throw new NotFoundException('Documento nao encontrado');
    }

    documento.status = StatusDocumento.REPROVADO;
    documento.aprovador_id = aprovadorId;
    documento.aprovador_nome = aprovadorNome;
    documento.data_aprovacao = new Date();
    documento.observacao_aprovacao = observacao;

    return await this.documentoRepository.save(documento);
  }

  // ========================================
  // VERIFICACAO DE COMPLETUDE DA FASE
  // ========================================

  async verificarFaseCompleta(licitacaoId: string): Promise<{
    completa: boolean;
    documentosPendentes: TipoDocumentoFaseInterna[];
    documentosAprovados: TipoDocumentoFaseInterna[];
  }> {
    const licitacao = await this.licitacaoRepository.findOneBy({ id: licitacaoId });
    if (!licitacao) {
      throw new NotFoundException('Licitacao nao encontrada');
    }

    const documentosObrigatorios = this.getDocumentosObrigatorios(licitacao.fase);
    
    const documentosAprovados = await this.documentoRepository.find({
      where: { 
        licitacao_id: licitacaoId, 
        status: StatusDocumento.APROVADO,
        versao_atual: true
      }
    });

    const tiposAprovados = documentosAprovados.map(d => d.tipo);
    const documentosPendentes = documentosObrigatorios.filter(
      tipo => !tiposAprovados.includes(tipo)
    );

    return {
      completa: documentosPendentes.length === 0,
      documentosPendentes,
      documentosAprovados: tiposAprovados,
    };
  }

  async avancarFaseInterna(licitacaoId: string): Promise<Licitacao> {
    const licitacao = await this.licitacaoRepository.findOneBy({ id: licitacaoId });
    if (!licitacao) {
      throw new NotFoundException('Licitacao nao encontrada');
    }

    const verificacao = await this.verificarFaseCompleta(licitacaoId);
    if (!verificacao.completa) {
      throw new BadRequestException(
        `Documentos pendentes: ${verificacao.documentosPendentes.join(', ')}`
      );
    }

    // Define proxima fase
    const ordemFases: FaseLicitacao[] = [
      FaseLicitacao.PLANEJAMENTO,
      FaseLicitacao.TERMO_REFERENCIA,
      FaseLicitacao.PESQUISA_PRECOS,
      FaseLicitacao.ANALISE_JURIDICA,
      FaseLicitacao.APROVACAO_INTERNA,
    ];

    const indiceAtual = ordemFases.indexOf(licitacao.fase);
    
    if (indiceAtual === ordemFases.length - 1) {
      // Fase interna concluida, pronto para publicacao
      licitacao.fase_interna_concluida = true;
    } else if (indiceAtual >= 0) {
      licitacao.fase = ordemFases[indiceAtual + 1];
    }

    return await this.licitacaoRepository.save(licitacao);
  }

  // ========================================
  // CONSULTAS
  // ========================================

  async getDocumentos(licitacaoId: string): Promise<DocumentoFaseInterna[]> {
    return await this.documentoRepository.find({
      where: { licitacao_id: licitacaoId, versao_atual: true },
      order: { ordem_exibicao: 'ASC', created_at: 'ASC' }
    });
  }

  async getDocumentosPorTipo(
    licitacaoId: string, 
    tipo: TipoDocumentoFaseInterna
  ): Promise<DocumentoFaseInterna[]> {
    return await this.documentoRepository.find({
      where: { licitacao_id: licitacaoId, tipo },
      order: { versao: 'DESC' }
    });
  }

  async getDocumento(id: string): Promise<DocumentoFaseInterna> {
    const documento = await this.documentoRepository.findOneBy({ id });
    if (!documento) {
      throw new NotFoundException('Documento nao encontrado');
    }
    return documento;
  }

  async getResumoFaseInterna(licitacaoId: string): Promise<{
    fase: FaseLicitacao;
    faseInternaConcluida: boolean;
    documentosTotal: number;
    documentosAprovados: number;
    documentosPendentes: number;
    documentosEmAnalise: number;
    proximosPassos: string[];
  }> {
    const licitacao = await this.licitacaoRepository.findOneBy({ id: licitacaoId });
    if (!licitacao) {
      throw new NotFoundException('Licitacao nao encontrada');
    }

    const documentos = await this.documentoRepository.find({
      where: { licitacao_id: licitacaoId, versao_atual: true }
    });

    const aprovados = documentos.filter(d => d.status === StatusDocumento.APROVADO).length;
    const pendentes = documentos.filter(d => 
      d.status === StatusDocumento.PENDENTE || 
      d.status === StatusDocumento.EM_ELABORACAO
    ).length;
    const emAnalise = documentos.filter(d => d.status === StatusDocumento.AGUARDANDO_APROVACAO).length;

    const verificacao = await this.verificarFaseCompleta(licitacaoId);
    
    const proximosPassos: string[] = [];
    if (verificacao.documentosPendentes.length > 0) {
      proximosPassos.push(`Elaborar: ${verificacao.documentosPendentes.join(', ')}`);
    }
    if (emAnalise > 0) {
      proximosPassos.push(`${emAnalise} documento(s) aguardando aprovacao`);
    }
    if (verificacao.completa && !licitacao.fase_interna_concluida) {
      proximosPassos.push('Fase completa - Avancar para proxima etapa');
    }

    return {
      fase: licitacao.fase,
      faseInternaConcluida: licitacao.fase_interna_concluida || false,
      documentosTotal: documentos.length,
      documentosAprovados: aprovados,
      documentosPendentes: pendentes,
      documentosEmAnalise: emAnalise,
      proximosPassos,
    };
  }
}
