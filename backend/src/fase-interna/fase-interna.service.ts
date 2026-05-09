import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DocumentoFaseInterna, TipoDocumentoFaseInterna, StatusDocumento, OrigemDocumento } from './entities/documento-fase-interna.entity';
import { Licitacao, FaseLicitacao } from '../licitacoes/entities/licitacao.entity';
import { RiscoIdentificado, MatrizRiscosDados, calcularGrauRisco } from './types/matriz-riscos.type';
import { CotacaoPorFonte, PesquisaPrecosDados, calcularEstatisticasItem } from './types/pesquisa-precos.type';

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

  // ========================================
  // DASHBOARD — KPIs AGREGADOS
  // ========================================

  async getDashboard(orgaoId: string): Promise<{
    totalProcessos: number;
    emAndamento: number;
    emAprovacao: number;
    valorTotal: number;
    porFase: Record<string, number>;
    documentosPendentes: number;
    documentosAguardandoAprovacao: number;
  }> {
    const FASES_INTERNAS = [
      FaseLicitacao.PLANEJAMENTO,
      FaseLicitacao.TERMO_REFERENCIA,
      FaseLicitacao.PESQUISA_PRECOS,
      FaseLicitacao.ANALISE_JURIDICA,
      FaseLicitacao.APROVACAO_INTERNA,
    ];

    const licitacoes = await this.licitacaoRepository.find({
      where: { orgao_id: orgaoId, fase: In(FASES_INTERNAS) },
      select: ['id', 'fase', 'valor_total_estimado'],
    });

    const ids = licitacoes.map((l) => l.id);
    let documentosPendentes = 0;
    let documentosAguardandoAprovacao = 0;

    if (ids.length > 0) {
      const docs = await this.documentoRepository.find({
        where: { licitacao_id: In(ids), versao_atual: true },
        select: ['status'],
      });
      documentosPendentes = docs.filter((d) =>
        d.status === StatusDocumento.PENDENTE || d.status === StatusDocumento.EM_ELABORACAO
      ).length;
      documentosAguardandoAprovacao = docs.filter(
        (d) => d.status === StatusDocumento.AGUARDANDO_APROVACAO
      ).length;
    }

    const porFase: Record<string, number> = {};
    for (const fase of FASES_INTERNAS) porFase[fase] = 0;
    for (const l of licitacoes) porFase[l.fase] = (porFase[l.fase] || 0) + 1;

    const valorTotal = licitacoes.reduce(
      (acc, l) => acc + (parseFloat(String(l.valor_total_estimado)) || 0),
      0
    );

    return {
      totalProcessos: licitacoes.length,
      emAndamento: licitacoes.filter((l) => l.fase !== FaseLicitacao.APROVACAO_INTERNA).length,
      emAprovacao: licitacoes.filter((l) => l.fase === FaseLicitacao.APROVACAO_INTERNA).length,
      valorTotal,
      porFase,
      documentosPendentes,
      documentosAguardandoAprovacao,
    };
  }

  // ========================================
  // RISCOS — via dados_estruturados do doc MR
  // ========================================

  private async getOuCriarDocMR(licitacaoId: string): Promise<DocumentoFaseInterna> {
    const licitacao = await this.licitacaoRepository.findOneBy({ id: licitacaoId });
    if (!licitacao) throw new NotFoundException('Licitacao nao encontrada');

    let doc = await this.documentoRepository.findOne({
      where: {
        licitacao_id: licitacaoId,
        tipo: TipoDocumentoFaseInterna.ANALISE_RISCOS,
        versao_atual: true,
      },
    });

    if (!doc) {
      doc = this.documentoRepository.create({
        licitacao_id: licitacaoId,
        tipo: TipoDocumentoFaseInterna.ANALISE_RISCOS,
        titulo: 'Mapa de Riscos',
        status: StatusDocumento.EM_ELABORACAO,
        origem: OrigemDocumento.INTERNO,
        versao: 1,
        versao_atual: true,
        dados_estruturados: { riscos: [] } as MatrizRiscosDados,
      });
      doc = await this.documentoRepository.save(doc);
    }

    return doc;
  }

  async getRiscos(licitacaoId: string): Promise<{ documento: DocumentoFaseInterna; riscos: RiscoIdentificado[] }> {
    const doc = await this.getOuCriarDocMR(licitacaoId);
    const dados: MatrizRiscosDados = doc.dados_estruturados || { riscos: [] };
    return { documento: doc, riscos: dados.riscos || [] };
  }

  async adicionarRisco(licitacaoId: string, risco: Omit<RiscoIdentificado, 'grau' | 'nivel'>): Promise<RiscoIdentificado[]> {
    const doc = await this.getOuCriarDocMR(licitacaoId);
    const dados: MatrizRiscosDados = doc.dados_estruturados || { riscos: [] };

    const grau = calcularGrauRisco(risco.probabilidade, risco.impacto);
    const nivel: RiscoIdentificado['nivel'] = grau >= 15 ? 'ALTO' : grau >= 7 ? 'MEDIO' : 'BAIXO';
    const novoRisco: RiscoIdentificado = { ...risco, grau, nivel, numero: (dados.riscos?.length || 0) + 1 };

    dados.riscos = [...(dados.riscos || []), novoRisco];
    doc.dados_estruturados = dados;
    await this.documentoRepository.save(doc);

    return dados.riscos;
  }

  async atualizarRisco(licitacaoId: string, riscoId: string, updates: Partial<RiscoIdentificado>): Promise<RiscoIdentificado[]> {
    const doc = await this.getOuCriarDocMR(licitacaoId);
    const dados: MatrizRiscosDados = doc.dados_estruturados || { riscos: [] };

    dados.riscos = (dados.riscos || []).map((r) => {
      if (r.id !== riscoId) return r;
      const merged = { ...r, ...updates };
      merged.grau = calcularGrauRisco(merged.probabilidade, merged.impacto);
      merged.nivel = merged.grau >= 15 ? 'ALTO' : merged.grau >= 7 ? 'MEDIO' : 'BAIXO';
      return merged;
    });

    doc.dados_estruturados = dados;
    await this.documentoRepository.save(doc);
    return dados.riscos;
  }

  async removerRisco(licitacaoId: string, riscoId: string): Promise<RiscoIdentificado[]> {
    const doc = await this.getOuCriarDocMR(licitacaoId);
    const dados: MatrizRiscosDados = doc.dados_estruturados || { riscos: [] };

    dados.riscos = (dados.riscos || []).filter((r) => r.id !== riscoId);
    doc.dados_estruturados = dados;
    await this.documentoRepository.save(doc);
    return dados.riscos;
  }

  // ========================================
  // PESQUISA DE PREÇOS — via dados_estruturados do doc PP
  // ========================================

  private async getOuCriarDocPP(licitacaoId: string): Promise<DocumentoFaseInterna> {
    const licitacao = await this.licitacaoRepository.findOneBy({ id: licitacaoId });
    if (!licitacao) throw new NotFoundException('Licitacao nao encontrada');

    let doc = await this.documentoRepository.findOne({
      where: { licitacao_id: licitacaoId, tipo: TipoDocumentoFaseInterna.PESQUISA_PRECOS, versao_atual: true },
    });

    if (!doc) {
      doc = this.documentoRepository.create({
        licitacao_id: licitacaoId,
        tipo: TipoDocumentoFaseInterna.PESQUISA_PRECOS,
        titulo: 'Pesquisa de Preços',
        status: StatusDocumento.EM_ELABORACAO,
        origem: OrigemDocumento.INTERNO,
        versao: 1,
        versao_atual: true,
        dados_estruturados: { itens: [{ item_numero: 1, descricao: '', quantidade: 1, unidade: 'UN', cotacoes: [], metodologia: 'MEDIANA', valor_referencial: 0 }] } as PesquisaPrecosDados,
      });
      doc = await this.documentoRepository.save(doc);
    }

    return doc;
  }

  async getPrecos(licitacaoId: string): Promise<{ documento: DocumentoFaseInterna; dados: PesquisaPrecosDados; estatisticas: any }> {
    const doc = await this.getOuCriarDocPP(licitacaoId);
    const dados: PesquisaPrecosDados = doc.dados_estruturados || { itens: [] };

    // Recalcula estatísticas para cada item
    const itensComEstatisticas = (dados.itens || []).map((item) => ({
      ...item,
      ...calcularEstatisticasItem(item),
    }));

    const valorTotal = itensComEstatisticas.reduce((acc, i) => acc + (i.valor_referencial * i.quantidade), 0);
    const totalFontes = itensComEstatisticas.reduce((acc, i) => acc + (i.cotacoes?.length || 0), 0);

    return {
      documento: doc,
      dados: { ...dados, itens: itensComEstatisticas },
      estatisticas: {
        valorTotal,
        totalFontes,
        conformeArt23: totalFontes >= 3,
      },
    };
  }

  async adicionarFontePreco(licitacaoId: string, itemNumero: number, cotacao: CotacaoPorFonte): Promise<PesquisaPrecosDados> {
    const doc = await this.getOuCriarDocPP(licitacaoId);
    const dados: PesquisaPrecosDados = doc.dados_estruturados || { itens: [] };

    const itemIdx = dados.itens.findIndex((i) => i.item_numero === itemNumero);
    if (itemIdx === -1) throw new NotFoundException(`Item ${itemNumero} nao encontrado na pesquisa`);

    dados.itens[itemIdx].cotacoes = [...(dados.itens[itemIdx].cotacoes || []), cotacao];
    // Recalcula estatísticas
    const stats = calcularEstatisticasItem(dados.itens[itemIdx]);
    dados.itens[itemIdx] = { ...dados.itens[itemIdx], ...stats };

    doc.dados_estruturados = dados;
    await this.documentoRepository.save(doc);
    return dados;
  }

  async removerFontePreco(licitacaoId: string, itemNumero: number, cotacaoIndex: number): Promise<PesquisaPrecosDados> {
    const doc = await this.getOuCriarDocPP(licitacaoId);
    const dados: PesquisaPrecosDados = doc.dados_estruturados || { itens: [] };

    const itemIdx = dados.itens.findIndex((i) => i.item_numero === itemNumero);
    if (itemIdx === -1) throw new NotFoundException(`Item ${itemNumero} nao encontrado`);

    dados.itens[itemIdx].cotacoes = (dados.itens[itemIdx].cotacoes || []).filter((_, i) => i !== cotacaoIndex);
    const stats = calcularEstatisticasItem(dados.itens[itemIdx]);
    dados.itens[itemIdx] = { ...dados.itens[itemIdx], ...stats };

    doc.dados_estruturados = dados;
    await this.documentoRepository.save(doc);
    return dados;
  }

  // ========================================
  // APROVAÇÕES AGREGADAS
  // ========================================

  async getAprovacoesOrgao(orgaoId: string): Promise<{
    documentoId: string;
    tipo: string;
    titulo: string;
    status: string;
    licitacaoId: string;
    numeroProcesso: string;
    objeto: string;
    created_at: Date;
    updated_at: Date;
  }[]> {
    const FASES_INTERNAS = [
      FaseLicitacao.PLANEJAMENTO,
      FaseLicitacao.TERMO_REFERENCIA,
      FaseLicitacao.PESQUISA_PRECOS,
      FaseLicitacao.ANALISE_JURIDICA,
      FaseLicitacao.APROVACAO_INTERNA,
    ];

    const licitacoes = await this.licitacaoRepository.find({
      where: { orgao_id: orgaoId, fase: In(FASES_INTERNAS) },
      select: ['id', 'numero_processo', 'objeto'],
    });

    if (!licitacoes.length) return [];

    const ids = licitacoes.map((l) => l.id);
    const documentos = await this.documentoRepository.find({
      where: {
        licitacao_id: In(ids),
        status: In([StatusDocumento.AGUARDANDO_APROVACAO, StatusDocumento.APROVADO, StatusDocumento.REPROVADO]),
        versao_atual: true,
      },
      order: { updated_at: 'DESC' },
    });

    const licMap = Object.fromEntries(licitacoes.map((l) => [l.id, l]));

    return documentos.map((doc) => ({
      documentoId: doc.id,
      tipo: doc.tipo,
      titulo: doc.titulo,
      status: doc.status,
      licitacaoId: doc.licitacao_id,
      numeroProcesso: licMap[doc.licitacao_id]?.numero_processo || doc.licitacao_id,
      objeto: licMap[doc.licitacao_id]?.objeto || '',
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    }));
  }

  // ========================================
  // WIZARD — salvar documentos em lote
  // ========================================

  async salvarWizard(licitacaoId: string, dados: {
    dfd?: string;
    etp_necessidade?: string;
    etp_solucao?: string;
    riscos?: string;
    precos_fontes?: string;
    tr_requisitos?: string;
    tr_prazo?: string;
    autorizacao_autoridade?: string;
    edital_notas?: string;
    juridico_obs?: string;
  }): Promise<DocumentoFaseInterna[]> {
    const licitacao = await this.licitacaoRepository.findOneBy({ id: licitacaoId });
    if (!licitacao) throw new NotFoundException('Licitacao nao encontrada');

    const salvos: DocumentoFaseInterna[] = [];

    const salvarDoc = async (tipo: TipoDocumentoFaseInterna, titulo: string, conteudo: string | undefined, dadosEstruturados?: any) => {
      if (!conteudo && !dadosEstruturados) return;
      const existente = await this.documentoRepository.findOne({ where: { licitacao_id: licitacaoId, tipo, versao_atual: true } });
      if (existente) {
        existente.descricao = conteudo || existente.descricao;
        if (dadosEstruturados) existente.dados_estruturados = dadosEstruturados;
        salvos.push(await this.documentoRepository.save(existente));
      } else {
        const doc = this.documentoRepository.create({
          licitacao_id: licitacaoId, tipo, titulo,
          descricao: conteudo, dados_estruturados: dadosEstruturados,
          status: StatusDocumento.EM_ELABORACAO, origem: OrigemDocumento.INTERNO,
          versao: 1, versao_atual: true,
        });
        salvos.push(await this.documentoRepository.save(doc));
      }
    };

    await salvarDoc(TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA, 'Formalização da Demanda (DFD)', dados.dfd);
    await salvarDoc(TipoDocumentoFaseInterna.ESTUDO_TECNICO_PRELIMINAR, 'Estudo Técnico Preliminar (ETP)', dados.etp_necessidade, {
      descricao_necessidade: dados.etp_necessidade,
      descricao_solucao: dados.etp_solucao,
    });
    await salvarDoc(TipoDocumentoFaseInterna.ANALISE_RISCOS, 'Mapa de Riscos', dados.riscos);
    await salvarDoc(TipoDocumentoFaseInterna.PESQUISA_PRECOS, 'Pesquisa de Preços', dados.precos_fontes);
    await salvarDoc(TipoDocumentoFaseInterna.TERMO_REFERENCIA, 'Termo de Referência (TR)', dados.tr_requisitos, {
      requisitos_contratacao: dados.tr_requisitos,
      prazo_vigencia: dados.tr_prazo,
    });
    await salvarDoc(TipoDocumentoFaseInterna.AUTORIZACAO_ABERTURA, 'Autorização da Autoridade', dados.autorizacao_autoridade);
    await salvarDoc(TipoDocumentoFaseInterna.MINUTA_EDITAL, 'Minuta do Edital', dados.edital_notas);
    await salvarDoc(TipoDocumentoFaseInterna.PARECER_JURIDICO, 'Parecer Jurídico', dados.juridico_obs);

    return salvos;
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
