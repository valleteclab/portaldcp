import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  DocumentoFaseInterna,
  TipoDocumentoFaseInterna,
  StatusDocumento,
  OrigemDocumento,
} from './entities/documento-fase-interna.entity';
import {
  Licitacao,
  FaseLicitacao,
} from '../licitacoes/entities/licitacao.entity';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import {
  RiscoIdentificado,
  MatrizRiscosDados,
  calcularGrauRisco,
} from './types/matriz-riscos.type';
import {
  CotacaoPorFonte,
  ItemPesquisaPrecos,
  PesquisaPrecosDados,
  calcularEstatisticasItem,
} from './types/pesquisa-precos.type';

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
    @InjectRepository(ItemLicitacao)
    private readonly itemRepository: Repository<ItemLicitacao>,
  ) {}

  // ========================================
  // DOCUMENTOS OBRIGATORIOS POR FASE
  // ========================================

  private getDocumentosObrigatorios(
    fase: FaseLicitacao,
  ): TipoDocumentoFaseInterna[] {
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
    criadorNome?: string,
  ): Promise<DocumentoFaseInterna> {
    const licitacao = await this.licitacaoRepository.findOneBy({
      id: licitacaoId,
    });
    if (!licitacao) {
      throw new NotFoundException('Licitacao nao encontrada');
    }

    // Verifica se ja existe documento do mesmo tipo (versao atual)
    const existente = await this.documentoRepository.findOne({
      where: { licitacao_id: licitacaoId, tipo, versao_atual: true },
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

  private isDocumentoObrigatorio(
    fase: FaseLicitacao,
    tipo: TipoDocumentoFaseInterna,
  ): boolean {
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
    hashArquivo?: string,
  ): Promise<DocumentoFaseInterna> {
    const licitacao = await this.licitacaoRepository.findOneBy({
      id: licitacaoId,
    });
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
        doc.caminhoArquivo,
      );
      documentosImportados.push(documento);
    }

    return { licitacao, documentos: documentosImportados };
  }

  // ========================================
  // APROVACAO DE DOCUMENTOS
  // ========================================

  async submeterParaAprovacao(
    documentoId: string,
  ): Promise<DocumentoFaseInterna> {
    const documento = await this.documentoRepository.findOneBy({
      id: documentoId,
    });
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
    observacao?: string,
  ): Promise<DocumentoFaseInterna> {
    const documento = await this.documentoRepository.findOneBy({
      id: documentoId,
    });
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
    observacao: string,
  ): Promise<DocumentoFaseInterna> {
    const documento = await this.documentoRepository.findOneBy({
      id: documentoId,
    });
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
    const licitacao = await this.licitacaoRepository.findOneBy({
      id: licitacaoId,
    });
    if (!licitacao) {
      throw new NotFoundException('Licitacao nao encontrada');
    }

    const documentosObrigatorios = this.getDocumentosObrigatorios(
      licitacao.fase,
    );

    const documentosAprovados = await this.documentoRepository.find({
      where: {
        licitacao_id: licitacaoId,
        status: StatusDocumento.APROVADO,
        versao_atual: true,
      },
    });

    const tiposAprovados = documentosAprovados.map((d) => d.tipo);
    const documentosPendentes = documentosObrigatorios.filter(
      (tipo) => !tiposAprovados.includes(tipo),
    );

    return {
      completa: documentosPendentes.length === 0,
      documentosPendentes,
      documentosAprovados: tiposAprovados,
    };
  }

  async avancarFaseInterna(licitacaoId: string): Promise<Licitacao> {
    const licitacao = await this.licitacaoRepository.findOneBy({
      id: licitacaoId,
    });
    if (!licitacao) {
      throw new NotFoundException('Licitacao nao encontrada');
    }

    const verificacao = await this.verificarFaseCompleta(licitacaoId);
    if (!verificacao.completa) {
      throw new BadRequestException(
        `Documentos pendentes: ${verificacao.documentosPendentes.join(', ')}`,
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
      order: { ordem_exibicao: 'ASC', created_at: 'ASC' },
    });
  }

  async getDocumentosPorTipo(
    licitacaoId: string,
    tipo: TipoDocumentoFaseInterna,
  ): Promise<DocumentoFaseInterna[]> {
    return await this.documentoRepository.find({
      where: { licitacao_id: licitacaoId, tipo },
      order: { versao: 'DESC' },
    });
  }

  async getDocumento(id: string): Promise<DocumentoFaseInterna> {
    const documento = await this.documentoRepository.findOneBy({ id });
    if (!documento) {
      throw new NotFoundException('Documento nao encontrado');
    }
    return documento;
  }

  /**
   * Auto-save do editor colaborativo Tiptap.
   * Atualiza apenas descricao (HTML) sem alterar outros campos.
   * Retorna { ok: true } para performance (sem recarregar o objeto).
   */
  async atualizarConteudo(
    licitacaoId: string,
    tipo: TipoDocumentoFaseInterna,
    html: string,
  ): Promise<{ ok: boolean }> {
    // Busca o documento atual ou cria um rascunho se não existir
    let documento = await this.documentoRepository.findOne({
      where: { licitacao_id: licitacaoId, tipo, versao_atual: true },
    });

    if (!documento) {
      // Cria documento rascunho (o editor foi aberto antes do wizard)
      documento = this.documentoRepository.create({
        licitacao_id: licitacaoId,
        tipo,
        titulo: tipo,
        descricao: html,
        status: StatusDocumento.EM_ELABORACAO,
        origem: OrigemDocumento.INTERNO,
        versao: 1,
        versao_atual: true,
        obrigatorio: true,
      });
    } else {
      documento.descricao = html;
    }

    await this.documentoRepository.save(documento);
    return { ok: true };
  }

  /**
   * Auto-save de uma seção específica do editor de seções guiadas.
   * Atualiza dados_estruturados[secaoId] = html e regenera o cache HTML (descricao).
   * SEM validação estrita — rascunhos sempre salvam.
   */
  async atualizarSecao(
    licitacaoId: string,
    tipo: TipoDocumentoFaseInterna,
    secaoId: string,
    html: string,
  ): Promise<{ ok: boolean; secaoId: string }> {
    let documento = await this.documentoRepository.findOne({
      where: { licitacao_id: licitacaoId, tipo, versao_atual: true },
    });

    if (!documento) {
      // Cria rascunho automaticamente se ainda não existir
      documento = this.documentoRepository.create({
        licitacao_id: licitacaoId,
        tipo,
        titulo: tipo,
        status: StatusDocumento.EM_ELABORACAO,
        origem: OrigemDocumento.INTERNO,
        versao: 1,
        versao_atual: true,
        obrigatorio: true,
        dados_estruturados: {},
      });
    }

    // Atualiza a seção no JSONB
    const dados = (documento.dados_estruturados as Record<string, string>) || {};
    dados[secaoId] = html;
    documento.dados_estruturados = dados;

    // Regenera cache HTML (descricao) a partir de todos os valores
    documento.descricao = Object.values(dados)
      .filter((v) => typeof v === 'string' && v.trim())
      .join('\n');

    await this.documentoRepository.save(documento);
    return { ok: true, secaoId };
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
      documentosPendentes = docs.filter(
        (d) =>
          d.status === StatusDocumento.PENDENTE ||
          d.status === StatusDocumento.EM_ELABORACAO,
      ).length;
      documentosAguardandoAprovacao = docs.filter(
        (d) => d.status === StatusDocumento.AGUARDANDO_APROVACAO,
      ).length;
    }

    const porFase: Record<string, number> = {};
    for (const fase of FASES_INTERNAS) porFase[fase] = 0;
    for (const l of licitacoes) porFase[l.fase] = (porFase[l.fase] || 0) + 1;

    const valorTotal = licitacoes.reduce(
      (acc, l) => acc + (parseFloat(String(l.valor_total_estimado)) || 0),
      0,
    );

    return {
      totalProcessos: licitacoes.length,
      emAndamento: licitacoes.filter(
        (l) => l.fase !== FaseLicitacao.APROVACAO_INTERNA,
      ).length,
      emAprovacao: licitacoes.filter(
        (l) => l.fase === FaseLicitacao.APROVACAO_INTERNA,
      ).length,
      valorTotal,
      porFase,
      documentosPendentes,
      documentosAguardandoAprovacao,
    };
  }

  // ========================================
  // RISCOS — via dados_estruturados do doc MR
  // ========================================

  private async getOuCriarDocMR(
    licitacaoId: string,
  ): Promise<DocumentoFaseInterna> {
    const licitacao = await this.licitacaoRepository.findOneBy({
      id: licitacaoId,
    });
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

  async getRiscos(
    licitacaoId: string,
  ): Promise<{ documento: DocumentoFaseInterna; riscos: RiscoIdentificado[] }> {
    const doc = await this.getOuCriarDocMR(licitacaoId);
    const dados: MatrizRiscosDados = doc.dados_estruturados || { riscos: [] };
    return { documento: doc, riscos: dados.riscos || [] };
  }

  async adicionarRisco(
    licitacaoId: string,
    risco: Omit<RiscoIdentificado, 'grau' | 'nivel'>,
  ): Promise<RiscoIdentificado[]> {
    const doc = await this.getOuCriarDocMR(licitacaoId);
    const dados: MatrizRiscosDados = doc.dados_estruturados || { riscos: [] };

    const grau = calcularGrauRisco(risco.probabilidade, risco.impacto);
    const nivel: RiscoIdentificado['nivel'] =
      grau >= 15 ? 'ALTO' : grau >= 7 ? 'MEDIO' : 'BAIXO';
    const novoRisco: RiscoIdentificado = {
      ...risco,
      grau,
      nivel,
      numero: (dados.riscos?.length || 0) + 1,
    };

    dados.riscos = [...(dados.riscos || []), novoRisco];
    doc.dados_estruturados = dados;
    await this.documentoRepository.save(doc);

    return dados.riscos;
  }

  async atualizarRisco(
    licitacaoId: string,
    riscoId: string,
    updates: Partial<RiscoIdentificado>,
  ): Promise<RiscoIdentificado[]> {
    const doc = await this.getOuCriarDocMR(licitacaoId);
    const dados: MatrizRiscosDados = doc.dados_estruturados || { riscos: [] };

    dados.riscos = (dados.riscos || []).map((r) => {
      if (r.id !== riscoId) return r;
      const merged = { ...r, ...updates };
      merged.grau = calcularGrauRisco(merged.probabilidade, merged.impacto);
      merged.nivel =
        merged.grau >= 15 ? 'ALTO' : merged.grau >= 7 ? 'MEDIO' : 'BAIXO';
      return merged;
    });

    doc.dados_estruturados = dados;
    await this.documentoRepository.save(doc);
    return dados.riscos;
  }

  async removerRisco(
    licitacaoId: string,
    riscoId: string,
  ): Promise<RiscoIdentificado[]> {
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

  async getOuCriarDocPP(licitacaoId: string): Promise<DocumentoFaseInterna> {
    const licitacao = await this.licitacaoRepository.findOneBy({
      id: licitacaoId,
    });
    if (!licitacao) throw new NotFoundException('Licitacao nao encontrada');

    let doc = await this.documentoRepository.findOne({
      where: {
        licitacao_id: licitacaoId,
        tipo: TipoDocumentoFaseInterna.PESQUISA_PRECOS,
        versao_atual: true,
      },
    });

    if (!doc) {
      const itens = await this.itemRepository.find({
        where: { licitacao_id: licitacaoId },
        order: { numero_item: 'ASC' },
      });
      const itensPesquisa = itens.length
        ? itens.map((item) => ({
            item_numero: item.numero_item,
            descricao:
              item.descricao_resumida ||
              item.descricao_detalhada ||
              licitacao.objeto,
            quantidade: Number(item.quantidade) || 1,
            unidade: String(item.unidade_medida || 'UN'),
            cotacoes: [],
            metodologia: 'MEDIANA' as const,
            valor_referencial: Number(item.valor_unitario_estimado) || 0,
          }))
        : [
            {
              item_numero: 1,
              descricao: licitacao.objeto || '',
              quantidade: 1,
              unidade: 'UN',
              cotacoes: [],
              metodologia: 'MEDIANA' as const,
              valor_referencial: 0,
            },
          ];

      doc = this.documentoRepository.create({
        licitacao_id: licitacaoId,
        tipo: TipoDocumentoFaseInterna.PESQUISA_PRECOS,
        titulo: 'Pesquisa de Preços',
        status: StatusDocumento.EM_ELABORACAO,
        origem: OrigemDocumento.INTERNO,
        versao: 1,
        versao_atual: true,
        dados_estruturados: { itens: itensPesquisa } as PesquisaPrecosDados,
      });
      doc = await this.documentoRepository.save(doc);
    }

    return doc;
  }

  async getPrecos(
    licitacaoId: string,
  ): Promise<{
    documento: DocumentoFaseInterna;
    dados: PesquisaPrecosDados;
    estatisticas: any;
  }> {
    const doc = await this.getOuCriarDocPP(licitacaoId);
    const dados: PesquisaPrecosDados = doc.dados_estruturados || { itens: [] };

    // Recalcula estatísticas para cada item
    const itensComEstatisticas = (dados.itens || []).map((item) => ({
      ...item,
      ...calcularEstatisticasItem(item),
    }));

    const valorTotal = itensComEstatisticas.reduce(
      (acc, i) => acc + i.valor_referencial * i.quantidade,
      0,
    );
    const totalFontes = itensComEstatisticas.reduce(
      (acc, i) => acc + (i.cotacoes?.length || 0),
      0,
    );

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

  async getPrecosPublicos(licitacaoId: string): Promise<{
    licitacao: any;
    orgao: any;
    documento: Pick<DocumentoFaseInterna, 'id' | 'titulo' | 'updated_at'>;
    dados: PesquisaPrecosDados;
    estatisticas: any;
    geradoEm: string;
  }> {
    const licitacao = await this.licitacaoRepository.findOne({
      where: { id: licitacaoId },
      relations: ['orgao'],
    });
    if (!licitacao) throw new NotFoundException('Licitacao nao encontrada');

    const precos = await this.getPrecos(licitacaoId);
    const orgao = (licitacao as any).orgao;

    return {
      licitacao: {
        id: licitacao.id,
        numero_processo: licitacao.numero_processo,
        numero_edital: licitacao.numero_edital,
        objeto: licitacao.objeto,
        modalidade: licitacao.modalidade,
        criterio_julgamento: licitacao.criterio_julgamento,
        fase: licitacao.fase,
      },
      orgao: orgao
        ? {
            nome: orgao.nome,
            cnpj: orgao.cnpj,
            cidade: orgao.cidade,
            uf: orgao.uf,
            logo_url: orgao.logo_url,
          }
        : null,
      documento: {
        id: precos.documento.id,
        titulo: precos.documento.titulo,
        updated_at: precos.documento.updated_at,
      },
      dados: precos.dados,
      estatisticas: precos.estatisticas,
      geradoEm: new Date().toISOString(),
    };
  }

  async adicionarItemPesquisa(
    licitacaoId: string,
    item: ItemPesquisaPrecos,
  ): Promise<PesquisaPrecosDados> {
    const doc = await this.getOuCriarDocPP(licitacaoId);
    const dados: PesquisaPrecosDados = doc.dados_estruturados || { itens: [] };

    const existe = dados.itens.some((i) => i.item_numero === item.item_numero);
    if (existe) throw new Error(`Item ${item.item_numero} já existe`);

    const itemComStats = calcularEstatisticasItem(item);
    dados.itens.push(itemComStats);

    doc.dados_estruturados = dados;
    await this.documentoRepository.save(doc);
    return dados;
  }

  async adicionarFontePreco(
    licitacaoId: string,
    itemNumero: number,
    cotacao: CotacaoPorFonte,
  ): Promise<PesquisaPrecosDados> {
    const doc = await this.getOuCriarDocPP(licitacaoId);
    const dados: PesquisaPrecosDados = doc.dados_estruturados || { itens: [] };

    const itemIdx = dados.itens.findIndex((i) => i.item_numero === itemNumero);
    if (itemIdx === -1)
      throw new NotFoundException(
        `Item ${itemNumero} nao encontrado na pesquisa`,
      );

    const normalizada = this.normalizarCotacao(cotacao);
    const cotacoesAtuais = dados.itens[itemIdx].cotacoes || [];
    if (
      cotacoesAtuais.some((existente) =>
        this.cotacaoDuplicada(existente, normalizada),
      )
    ) {
      return dados;
    }

    dados.itens[itemIdx].cotacoes = [...cotacoesAtuais, normalizada];
    // Recalcula estatísticas
    const stats = calcularEstatisticasItem(dados.itens[itemIdx]);
    dados.itens[itemIdx] = { ...dados.itens[itemIdx], ...stats };

    doc.dados_estruturados = dados;
    await this.documentoRepository.save(doc);
    return dados;
  }

  async importarCsvFontePrecos(
    licitacaoId: string,
    csvBuffer: Buffer,
    documentoPath: string,
  ): Promise<{
    dados: PesquisaPrecosDados;
    resumo: {
      itensEncontrados: number;
      cotacoesImportadas: number;
      cotacoesDuplicadas: number;
      itensNaoEncontrados: number[];
    };
  }> {
    const doc = await this.getOuCriarDocPP(licitacaoId);
    const dados: PesquisaPrecosDados = doc.dados_estruturados || { itens: [] };
    const blocos = this.parseCsvFontePrecos(csvBuffer);
    const itensNaoEncontrados: number[] = [];
    let cotacoesImportadas = 0;
    let cotacoesDuplicadas = 0;

    for (const bloco of blocos) {
      const itemIdx = dados.itens.findIndex(
        (item) => item.item_numero === bloco.itemNumero,
      );
      if (itemIdx === -1) {
        itensNaoEncontrados.push(bloco.itemNumero);
        continue;
      }

      const cotacoesAtuais = dados.itens[itemIdx].cotacoes || [];
      const novasCotacoes: CotacaoPorFonte[] = [];

      for (const preco of bloco.precos) {
        const normalizada = this.normalizarCotacao({
          fonte: this.classificarFonteCsvFontePrecos(
            preco.fonte,
            preco.orgaoEmpresaSite,
          ),
          descricao_fonte: [
            'Fonte de Precos',
            preco.fonte,
            preco.orgaoEmpresaSite,
          ]
            .filter(Boolean)
            .join(' - '),
          url_referencia: this.urlSeValida(preco.orgaoEmpresaSite),
          data_pesquisa: preco.dataPesquisa,
          valor_unitario: preco.valorUnitario,
          observacao: [
            'Importada do CSV Fonte de Precos',
            preco.identificacao ? `Identificacao: ${preco.identificacao}` : '',
            preco.quantidade ? `Quantidade da fonte: ${preco.quantidade}` : '',
          ]
            .filter(Boolean)
            .join(' | '),
          documento_comprobatorio_path: documentoPath,
        });

        if (
          cotacoesAtuais.some((existente) =>
            this.cotacaoDuplicada(existente, normalizada),
          ) ||
          novasCotacoes.some((existente) =>
            this.cotacaoDuplicada(existente, normalizada),
          )
        ) {
          cotacoesDuplicadas += 1;
          continue;
        }

        novasCotacoes.push(normalizada);
        cotacoesImportadas += 1;
      }

      if (novasCotacoes.length) {
        dados.itens[itemIdx].cotacoes = [...cotacoesAtuais, ...novasCotacoes];
        dados.itens[itemIdx] = calcularEstatisticasItem(dados.itens[itemIdx]);
      }
    }

    doc.dados_estruturados = dados;
    await this.documentoRepository.save(doc);

    return {
      dados,
      resumo: {
        itensEncontrados: blocos.length,
        cotacoesImportadas,
        cotacoesDuplicadas,
        itensNaoEncontrados,
      },
    };
  }

  async removerCotacoesEstimadasDoAgente(
    licitacaoId: string,
  ): Promise<PesquisaPrecosDados> {
    const doc = await this.getOuCriarDocPP(licitacaoId);
    const dados: PesquisaPrecosDados = doc.dados_estruturados || { itens: [] };
    let alterou = false;

    dados.itens = (dados.itens || []).map((item) => {
      const cotacoes = item.cotacoes || [];
      const filtradas = cotacoes.filter((cotacao) => {
        const descricao = this.normalizarTextoCotacao(cotacao.descricao_fonte);
        const observacao = this.normalizarTextoCotacao(cotacao.observacao);
        const fallbackEstimado =
          descricao.includes('valor estimado do item') &&
          observacao.includes('incluida por agente de pesquisa de precos');
        if (fallbackEstimado) alterou = true;
        return !fallbackEstimado;
      });

      if (filtradas.length === cotacoes.length) return item;
      return calcularEstatisticasItem({ ...item, cotacoes: filtradas });
    });

    if (!alterou) return dados;

    doc.dados_estruturados = dados;
    await this.documentoRepository.save(doc);
    return dados;
  }

  private normalizarCotacao(cotacao: CotacaoPorFonte | any): CotacaoPorFonte {
    const tipoLegado = cotacao.tipo || cotacao.fonte;
    const mapaTipo: Record<string, CotacaoPorFonte['fonte']> = {
      PNCP: 'PNCP',
      PAINEL_PRECOS: 'PAINEL_DE_PRECOS',
      PAINEL_DE_PRECOS: 'PAINEL_DE_PRECOS',
      COTACAO_DIRETA: 'FORNECEDOR_DIRETO',
      FORNECEDOR_DIRETO: 'FORNECEDOR_DIRETO',
      CATALOGO: 'MIDIA_ESPECIALIZADA',
      SITE_OFICIAL: 'MIDIA_ESPECIALIZADA',
      ORCAMENTO: 'OUTRA',
      OUTRA: 'OUTRA',
      CONTRATO_VIGENTE_SISTEMA: 'CONTRATO_VIGENTE_SISTEMA',
      MIDIA_ESPECIALIZADA: 'MIDIA_ESPECIALIZADA',
      NOTA_FISCAL_ELETRONICA: 'NOTA_FISCAL_ELETRONICA',
    };

    return {
      fonte: mapaTipo[String(tipoLegado)] || 'OUTRA',
      descricao_fonte:
        cotacao.descricao_fonte ||
        cotacao.fonte ||
        cotacao.fornecedor ||
        'Fonte informada',
      url_referencia: cotacao.url_referencia,
      data_pesquisa:
        cotacao.data_pesquisa || new Date().toISOString().split('T')[0],
      fornecedor_cnpj: cotacao.fornecedor_cnpj,
      fornecedor_razao_social:
        cotacao.fornecedor_razao_social || cotacao.fornecedor,
      valor_unitario: Number(cotacao.valor_unitario) || 0,
      observacao: cotacao.observacao,
      documento_comprobatorio_path: cotacao.documento_comprobatorio_path,
      documento_hash: cotacao.documento_hash,
    };
  }

  private parseCsvFontePrecos(buffer: Buffer): Array<{
    itemNumero: number;
    descricao: string;
    quantidade: number;
    valorUnitarioMedio: number;
    precos: Array<{
      fonte: string;
      orgaoEmpresaSite: string;
      identificacao: string;
      dataPesquisa: string;
      quantidade: number;
      valorUnitario: number;
    }>;
  }> {
    const texto = this.decodedCsvText(buffer);
    const linhas = texto
      .split(/\r?\n/)
      .map((linha) => this.parseCsvLine(linha))
      .filter((linha) => linha.some((celula) => celula.trim()));
    const blocos: Array<{
      itemNumero: number;
      descricao: string;
      quantidade: number;
      valorUnitarioMedio: number;
      precos: Array<{
        fonte: string;
        orgaoEmpresaSite: string;
        identificacao: string;
        dataPesquisa: string;
        quantidade: number;
        valorUnitario: number;
      }>;
    }> = [];
    let blocoAtual: (typeof blocos)[number] | null = null;
    let aguardandoResumoItem = false;

    for (let index = 0; index < linhas.length; index += 1) {
      const linha = linhas[index];
      const primeira = String(linha[0] || '').trim();
      const matchItem = primeira.match(/^Item\s+(\d+)$/i);
      if (matchItem) {
        blocoAtual = {
          itemNumero: Number(matchItem[1]),
          descricao: '',
          quantidade: 1,
          valorUnitarioMedio: 0,
          precos: [],
        };
        blocos.push(blocoAtual);
        aguardandoResumoItem = true;
        continue;
      }

      if (!blocoAtual) continue;

      if (aguardandoResumoItem && primeira) {
        blocoAtual.descricao = primeira;
        blocoAtual.valorUnitarioMedio = this.valorMonetarioCsv(linha[6]);
        blocoAtual.quantidade = this.numeroCsv(linha[7]) || 1;
        aguardandoResumoItem = false;
        continue;
      }

      const numeroPreco = Number(primeira);
      const segunda = String(linha[1] || '').trim();
      if (
        !Number.isFinite(numeroPreco) ||
        numeroPreco <= 0 ||
        segunda.toLowerCase() !== 'fonte'
      )
        continue;

      const detalhe = linhas[index + 1];
      if (!detalhe) continue;

      const valorUnitario = this.valorMonetarioCsv(detalhe[8]);
      if (valorUnitario <= 0) continue;
      blocoAtual.precos.push({
        fonte: String(detalhe[1] || '').trim(),
        orgaoEmpresaSite: String(detalhe[2] || '').trim(),
        identificacao: String(detalhe[5] || '').trim(),
        dataPesquisa: this.dataCsvFontePrecos(detalhe[6]),
        quantidade: this.numeroCsv(detalhe[7]) || 1,
        valorUnitario,
      });
    }

    return blocos.filter((bloco) => bloco.precos.length > 0);
  }

  private decodedCsvText(buffer: Buffer): string {
    const utf8 = buffer.toString('utf8');
    const latin1 = buffer.toString('latin1');
    const scoreUtf8 = (utf8.match(/\uFFFD|Ã|Â/g) || []).length;
    const scoreLatin1 = (latin1.match(/\uFFFD|Ã|Â/g) || []).length;
    return scoreLatin1 < scoreUtf8 ? latin1 : utf8;
  }

  private parseCsvLine(linha: string): string[] {
    const cells: string[] = [];
    let atual = '';
    let dentroAspas = false;

    for (let i = 0; i < linha.length; i += 1) {
      const char = linha[i];
      const prox = linha[i + 1];
      if (char === '"' && dentroAspas && prox === '"') {
        atual += '"';
        i += 1;
        continue;
      }
      if (char === '"') {
        dentroAspas = !dentroAspas;
        continue;
      }
      if (char === ',' && !dentroAspas) {
        cells.push(atual.trim());
        atual = '';
        continue;
      }
      atual += char;
    }

    cells.push(atual.trim());
    return cells;
  }

  private valorMonetarioCsv(valor: unknown): number {
    const texto = String(valor || '').trim();
    if (!texto) return 0;
    const limpo = texto
      .replace(/[^\d,.-]/g, '')
      .replace(/\.(?=\d{3}(?:\D|$))/g, '')
      .replace(',', '.');
    const numero = Number(limpo);
    return Number.isFinite(numero) ? Number(numero.toFixed(4)) : 0;
  }

  private numeroCsv(valor: unknown): number {
    const texto = String(valor || '').trim();
    if (!texto) return 0;
    const numero = Number(
      texto.replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'),
    );
    return Number.isFinite(numero) ? numero : 0;
  }

  private dataCsvFontePrecos(valor: unknown): string {
    const texto = String(valor || '').trim();
    const match = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
    return new Date().toISOString().split('T')[0];
  }

  private classificarFonteCsvFontePrecos(
    fonte: string,
    referencia: string,
  ): CotacaoPorFonte['fonte'] {
    const texto = this.normalizarTextoCotacao(`${fonte} ${referencia}`);
    if (texto.includes('pncp')) return 'PNCP';
    if (
      texto.includes('compras.gov') ||
      texto.includes('comprasnet') ||
      texto.includes('painel')
    )
      return 'PAINEL_DE_PRECOS';
    if (
      texto.includes('dominio amplo') ||
      texto.startsWith('http') ||
      texto.includes('http')
    )
      return 'MIDIA_ESPECIALIZADA';
    return 'MIDIA_ESPECIALIZADA';
  }

  private urlSeValida(valor: string): string | undefined {
    const texto = String(valor || '').trim();
    if (!/^https?:\/\//i.test(texto)) return undefined;
    try {
      return new URL(texto).toString();
    } catch {
      return undefined;
    }
  }

  private cotacaoDuplicada(a: CotacaoPorFonte, b: CotacaoPorFonte): boolean {
    const urlA = this.normalizarUrlCotacao(a.url_referencia);
    const urlB = this.normalizarUrlCotacao(b.url_referencia);
    const valorA = Number(Number(a.valor_unitario || 0).toFixed(4));
    const valorB = Number(Number(b.valor_unitario || 0).toFixed(4));

    if (urlA && urlB) {
      return urlA === urlB && valorA === valorB;
    }

    return (
      a.fonte === b.fonte &&
      this.normalizarTextoCotacao(a.descricao_fonte) ===
        this.normalizarTextoCotacao(b.descricao_fonte) &&
      valorA === valorB &&
      this.normalizarTextoCotacao(a.data_pesquisa) ===
        this.normalizarTextoCotacao(b.data_pesquisa)
    );
  }

  private normalizarUrlCotacao(url?: string): string {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      const params = [...parsed.searchParams.entries()].sort(([a], [b]) =>
        a.localeCompare(b),
      );
      parsed.search = '';
      for (const [key, value] of params) parsed.searchParams.append(key, value);
      return parsed.toString().replace(/\/$/, '').toLowerCase();
    } catch {
      return String(url).trim().replace(/\/$/, '').toLowerCase();
    }
  }

  private normalizarTextoCotacao(valor?: string): string {
    return (valor || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async removerFontePreco(
    licitacaoId: string,
    itemNumero: number,
    cotacaoIndex: number,
  ): Promise<PesquisaPrecosDados> {
    const doc = await this.getOuCriarDocPP(licitacaoId);
    const dados: PesquisaPrecosDados = doc.dados_estruturados || { itens: [] };

    const itemIdx = dados.itens.findIndex((i) => i.item_numero === itemNumero);
    if (itemIdx === -1)
      throw new NotFoundException(`Item ${itemNumero} nao encontrado`);

    dados.itens[itemIdx].cotacoes = (
      dados.itens[itemIdx].cotacoes || []
    ).filter((_, i) => i !== cotacaoIndex);
    const stats = calcularEstatisticasItem(dados.itens[itemIdx]);
    dados.itens[itemIdx] = { ...dados.itens[itemIdx], ...stats };

    doc.dados_estruturados = dados;
    await this.documentoRepository.save(doc);
    return dados;
  }

  async salvarComprovanteCotacao(
    licitacaoId: string,
    itemNumero: number,
    cotacaoIndex: number,
    path: string,
  ): Promise<PesquisaPrecosDados> {
    const doc = await this.getOuCriarDocPP(licitacaoId);
    const dados: PesquisaPrecosDados = doc.dados_estruturados || { itens: [] };

    const itemIdx = dados.itens.findIndex((i) => i.item_numero === itemNumero);
    if (itemIdx === -1)
      throw new NotFoundException(`Item ${itemNumero} nao encontrado`);

    const cotacoes = dados.itens[itemIdx].cotacoes || [];
    if (cotacaoIndex < 0 || cotacaoIndex >= cotacoes.length) {
      throw new BadRequestException(`Cotacao index ${cotacaoIndex} invalido`);
    }

    cotacoes[cotacaoIndex] = {
      ...cotacoes[cotacaoIndex],
      documento_comprobatorio_path: path,
    };
    dados.itens[itemIdx].cotacoes = cotacoes;

    doc.dados_estruturados = dados;
    await this.documentoRepository.save(doc);
    return dados;
  }

  async removerItemPesquisa(
    licitacaoId: string,
    itemNumero: number,
  ): Promise<PesquisaPrecosDados> {
    const doc = await this.getOuCriarDocPP(licitacaoId);
    const dados: PesquisaPrecosDados = doc.dados_estruturados || { itens: [] };
    dados.itens = dados.itens.filter((i) => i.item_numero !== itemNumero);
    doc.dados_estruturados = dados;
    await this.documentoRepository.save(doc);
    return dados;
  }

  async salvarMetodologiaPP(
    licitacaoId: string,
    metodologia: 'MEDIA' | 'MEDIANA' | 'MENOR_VALOR' | 'OUTRA',
    justificativa?: string,
    outliers?: Array<{
      item_numero: number;
      cotacao_index: number;
      motivo: string;
    }>,
  ): Promise<PesquisaPrecosDados> {
    const doc = await this.getOuCriarDocPP(licitacaoId);
    const dados: PesquisaPrecosDados = doc.dados_estruturados || { itens: [] };
    dados.metodologia_geral = metodologia;
    dados.observacoes = justificativa || dados.observacoes;
    // Recalcula valor_referencial de cada item com a nova metodologia
    dados.itens = dados.itens.map((item) => {
      const outliersItem = (outliers || []).filter(
        (o) => Number(o.item_numero) === Number(item.item_numero),
      );
      const itemComOutliers = {
        ...item,
        outliers_descartados: outliersItem.length
          ? outliersItem.map((o) => ({
              cotacao_index: Number(o.cotacao_index),
              motivo:
                o.motivo ||
                'Descartado como outlier pelo responsavel pela pesquisa.',
            }))
          : undefined,
        justificativa_metodologia:
          justificativa || item.justificativa_metodologia,
      };
      const vals = (itemComOutliers.cotacoes || [])
        .filter(
          (_, idx) =>
            !itemComOutliers.outliers_descartados?.some(
              (o) => o.cotacao_index === idx,
            ),
        )
        .map((c) => c.valor_unitario)
        .filter((v) => v > 0)
        .sort((a, b) => a - b);
      if (!vals.length)
        return calcularEstatisticasItem({
          ...itemComOutliers,
          metodologia,
          valor_referencial: 0,
        });
      const mid = Math.floor(vals.length / 2);
      const mediana =
        vals.length % 2 !== 0 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
      const media = vals.reduce((a, b) => a + b, 0) / vals.length;
      const ref =
        metodologia === 'MEDIANA'
          ? mediana
          : metodologia === 'MENOR_VALOR'
            ? vals[0]
            : media;
      return calcularEstatisticasItem({
        ...itemComOutliers,
        metodologia,
        valor_referencial: ref,
      });
    });
    doc.dados_estruturados = dados;
    await this.documentoRepository.save(doc);
    return dados;
  }

  async salvarResponsavelPP(
    licitacaoId: string,
    responsavel: { nome: string; cargo: string; matricula?: string },
    observacoes?: string,
    dataPesquisa?: string,
  ): Promise<PesquisaPrecosDados> {
    const doc = await this.getOuCriarDocPP(licitacaoId);
    const dados: PesquisaPrecosDados = doc.dados_estruturados || { itens: [] };
    dados.responsavel_pesquisa = {
      nome: responsavel.nome,
      cargo: responsavel.cargo,
      matricula: responsavel.matricula,
    };
    if (observacoes) dados.observacoes = observacoes;
    doc.dados_estruturados = dados;
    await this.documentoRepository.save(doc);
    return dados;
  }

  // ========================================
  // APROVAÇÕES AGREGADAS
  // ========================================

  async getAprovacoesOrgao(orgaoId: string): Promise<
    {
      documentoId: string;
      tipo: string;
      titulo: string;
      status: string;
      licitacaoId: string;
      numeroProcesso: string;
      objeto: string;
      created_at: Date;
      updated_at: Date;
    }[]
  > {
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
        status: In([
          StatusDocumento.AGUARDANDO_APROVACAO,
          StatusDocumento.APROVADO,
          StatusDocumento.REPROVADO,
        ]),
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
      numeroProcesso:
        licMap[doc.licitacao_id]?.numero_processo || doc.licitacao_id,
      objeto: licMap[doc.licitacao_id]?.objeto || '',
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    }));
  }

  // ========================================
  // WIZARD — salvar documentos em lote
  // ========================================

  async salvarWizard(
    licitacaoId: string,
    dados: {
      dfd?: string;
      etp?: Record<string, any>;
      etp_necessidade?: string;
      etp_solucao?: string;
      riscos?: string | Array<any>;
      pesquisaPrecos?: Array<any>;
      precos_fontes?: string;
      tr?: Record<string, any>;
      tr_requisitos?: string;
      tr_prazo?: string;
      autorizacao?: string;
      autorizacao_autoridade?: string;
      edital?: string;
      edital_notas?: string;
      parecerJuridico?: string;
      juridico_obs?: string;
    },
  ): Promise<DocumentoFaseInterna[]> {
    const licitacao = await this.licitacaoRepository.findOneBy({
      id: licitacaoId,
    });
    if (!licitacao) throw new NotFoundException('Licitacao nao encontrada');

    const salvos: DocumentoFaseInterna[] = [];

    const salvarDoc = async (
      tipo: TipoDocumentoFaseInterna,
      titulo: string,
      conteudo: string | undefined,
      dadosEstruturados?: any,
    ) => {
      if (!conteudo && !dadosEstruturados) return;
      const existente = await this.documentoRepository.findOne({
        where: { licitacao_id: licitacaoId, tipo, versao_atual: true },
      });
      if (existente) {
        existente.descricao = conteudo || existente.descricao;
        if (dadosEstruturados) existente.dados_estruturados = dadosEstruturados;
        salvos.push(await this.documentoRepository.save(existente));
      } else {
        const doc = this.documentoRepository.create({
          licitacao_id: licitacaoId,
          tipo,
          titulo,
          descricao: conteudo,
          dados_estruturados: dadosEstruturados,
          status: StatusDocumento.EM_ELABORACAO,
          origem: OrigemDocumento.INTERNO,
          versao: 1,
          versao_atual: true,
        });
        salvos.push(await this.documentoRepository.save(doc));
      }
    };

    const etpTexto =
      dados.etp_necessidade ||
      (dados.etp ? Object.values(dados.etp).join('\n\n') : undefined);
    const trTexto =
      dados.tr_requisitos ||
      (dados.tr ? Object.values(dados.tr).join('\n\n') : undefined);
    const riscosTexto = Array.isArray(dados.riscos)
      ? JSON.stringify(dados.riscos)
      : dados.riscos;
    const precosTexto =
      dados.precos_fontes ||
      (dados.pesquisaPrecos ? JSON.stringify(dados.pesquisaPrecos) : undefined);

    await salvarDoc(
      TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA,
      'Formalização da Demanda (DFD)',
      dados.dfd,
    );
    await salvarDoc(
      TipoDocumentoFaseInterna.ESTUDO_TECNICO_PRELIMINAR,
      'Estudo Técnico Preliminar (ETP)',
      etpTexto,
      dados.etp || {
        descricao_necessidade: etpTexto,
        descricao_solucao: dados.etp_solucao,
      },
    );
    await salvarDoc(
      TipoDocumentoFaseInterna.ANALISE_RISCOS,
      'Mapa de Riscos',
      riscosTexto,
    );
    await salvarDoc(
      TipoDocumentoFaseInterna.PESQUISA_PRECOS,
      'Pesquisa de Preços',
      precosTexto,
    );
    await salvarDoc(
      TipoDocumentoFaseInterna.TERMO_REFERENCIA,
      'Termo de Referência (TR)',
      trTexto,
      dados.tr || {
        requisitos_contratacao: trTexto,
        prazo_vigencia: dados.tr_prazo,
      },
    );
    await salvarDoc(
      TipoDocumentoFaseInterna.AUTORIZACAO_ABERTURA,
      'Autorização da Autoridade',
      dados.autorizacao_autoridade || dados.autorizacao,
    );
    await salvarDoc(
      TipoDocumentoFaseInterna.MINUTA_EDITAL,
      'Minuta do Edital',
      dados.edital_notas || dados.edital,
    );
    await salvarDoc(
      TipoDocumentoFaseInterna.PARECER_JURIDICO,
      'Parecer Jurídico',
      dados.juridico_obs || dados.parecerJuridico,
    );

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
    const licitacao = await this.licitacaoRepository.findOneBy({
      id: licitacaoId,
    });
    if (!licitacao) {
      throw new NotFoundException('Licitacao nao encontrada');
    }

    const documentos = await this.documentoRepository.find({
      where: { licitacao_id: licitacaoId, versao_atual: true },
    });

    const aprovados = documentos.filter(
      (d) => d.status === StatusDocumento.APROVADO,
    ).length;
    const pendentes = documentos.filter(
      (d) =>
        d.status === StatusDocumento.PENDENTE ||
        d.status === StatusDocumento.EM_ELABORACAO,
    ).length;
    const emAnalise = documentos.filter(
      (d) => d.status === StatusDocumento.AGUARDANDO_APROVACAO,
    ).length;

    const verificacao = await this.verificarFaseCompleta(licitacaoId);

    const proximosPassos: string[] = [];
    if (verificacao.documentosPendentes.length > 0) {
      proximosPassos.push(
        `Elaborar: ${verificacao.documentosPendentes.join(', ')}`,
      );
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

  // ========================================
  // CONTEXTO E CONFORMIDADE (PAINEL IA)
  // ========================================

  /**
   * Retorna contexto rico para o painel IA — aba Dados.
   * Agrega informações da licitação, demanda, documentos e pesquisa de preços.
   */
  /**
   * Campos canônicos (incisos da Lei 14.133/2021) exigidos por tipo de
   * documento. Compartilhado entre o cockpit (/contexto) e a aba de
   * conformidade (/conformidade) para que ambos meçam as mesmas seções.
   * Retorna [] para tipos sem checklist canônico (usa-se fallback por chaves).
   */
  private regrasConformidade(
    tipo: string,
  ): Array<{ campo: string; fundamentoLegal: string }> {
    switch (tipo) {
      case TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA:
        return [
          { campo: 'demanda', fundamentoLegal: 'Art. 18, I' },
          { campo: 'quantidade', fundamentoLegal: 'Art. 18, I' },
          { campo: 'previsao', fundamentoLegal: 'Art. 18, I' },
        ];
      case TipoDocumentoFaseInterna.ESTUDO_TECNICO_PRELIMINAR:
        return [
          { campo: 'necessidade', fundamentoLegal: 'Art. 18, I' },
          { campo: 'requisitos', fundamentoLegal: 'Art. 18, IV' },
          { campo: 'estimativa', fundamentoLegal: 'Art. 18, VI' },
          { campo: 'estimativa_valor', fundamentoLegal: 'Art. 18, VIII' },
          { campo: 'viabilidade', fundamentoLegal: 'Art. 18, XIII' },
        ];
      case TipoDocumentoFaseInterna.TERMO_REFERENCIA:
        return [
          { campo: 'objeto', fundamentoLegal: 'Art. 6 XXIII a' },
          { campo: 'descricao', fundamentoLegal: 'Art. 6 XXIII b' },
          { campo: 'requisitos', fundamentoLegal: 'Art. 6 XXIII c' },
          { campo: 'estimativa_valor_tr', fundamentoLegal: 'Art. 6 XXIII f' },
          {
            campo: 'dotacao_orcamentaria_tr',
            fundamentoLegal: 'Art. 6 XXIII j',
          },
        ];
      default:
        return [];
    }
  }

  private valorNaoVazio(valor: any): boolean {
    if (valor == null) return false;
    if (typeof valor === 'string') return valor.trim().length > 0;
    if (typeof valor === 'number') return !isNaN(valor);
    if (Array.isArray(valor)) return valor.length > 0;
    if (typeof valor === 'object') return Object.keys(valor).length > 0;
    return Boolean(valor);
  }

  async buscarContexto(licitacaoId: string): Promise<{
    licitacao: {
      id: string;
      objeto: string;
      numero_processo: string;
      modalidade: string;
      criterio_julgamento: string;
      valor_total_estimado: number | null;
      natureza_objeto: string;
      prazo_execucao: string | null;
      itens: Array<{
        descricao_resumida: string;
        quantidade: number;
        unidade_medida: string;
        valor_unitario_estimado: number | null;
      }>;
    };
    demanda: {
      unidade_requisitante: string;
      ano_referencia: number;
      itens_count: number;
    } | null;
    documentos: Array<{
      tipo: string;
      status: string;
      secoes_preenchidas: number;
      secoes_total: number;
      resumo: string;
    }>;
    pesquisa_preco: {
      valor_mediano: number | null;
      fontes_count: number;
    } | null;
  }> {
    const licitacao = await this.licitacaoRepository.findOne({
      where: { id: licitacaoId },
      relations: ['itens', 'demanda'],
    });

    if (!licitacao) {
      return {
        licitacao: {
          id: licitacaoId,
          objeto: '',
          numero_processo: '',
          modalidade: '',
          criterio_julgamento: '',
          valor_total_estimado: null,
          natureza_objeto: '',
          prazo_execucao: null,
          itens: [],
        },
        demanda: null,
        documentos: [],
        pesquisa_preco: null,
      };
    }

    const documentos = await this.documentoRepository.find({
      where: { licitacao_id: licitacaoId, versao_atual: true },
    });

    const stripHtml = (html: string): string =>
      (html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

    const docsFormatados = documentos.map((doc) => {
      const dados = doc.dados_estruturados;
      let secoes_preenchidas = 0;
      let secoes_total = 0;
      let textoResumo = '';

      const dadosObj =
        dados && typeof dados === 'object' && !Array.isArray(dados)
          ? (dados as Record<string, any>)
          : {};

      // Texto de resumo a partir de tudo que estiver preenchido.
      for (const valor of Object.values(dadosObj)) {
        const textoValor =
          typeof valor === 'string' ? valor : JSON.stringify(valor ?? '');
        if (textoValor && textoValor.trim().length > 0) {
          textoResumo += ' ' + stripHtml(textoValor);
        }
      }

      // Total/preenchidas usam o checklist canônico do tipo quando existe;
      // caso contrário, caem para a contagem de chaves presentes.
      const regras = this.regrasConformidade(doc.tipo as string);
      if (regras.length > 0) {
        secoes_total = regras.length;
        secoes_preenchidas = regras.filter((r) =>
          this.valorNaoVazio(dadosObj[r.campo]),
        ).length;
      } else {
        const chaves = Object.keys(dadosObj);
        secoes_total = chaves.length;
        secoes_preenchidas = chaves.filter((c) =>
          this.valorNaoVazio(dadosObj[c]),
        ).length;
      }

      const resumo = textoResumo.trim().slice(0, 200);

      return {
        tipo: doc.tipo as string,
        status: doc.status as string,
        secoes_preenchidas,
        secoes_total,
        resumo,
      };
    });

    // Pesquisa de preços
    let pesquisa_preco: { valor_mediano: number | null; fontes_count: number } | null = null;
    const docPP = documentos.find(
      (d) => d.tipo === TipoDocumentoFaseInterna.PESQUISA_PRECOS,
    );
    if (docPP && docPP.dados_estruturados) {
      const dadosPP = docPP.dados_estruturados as any;
      let valorMediano: number | null = null;
      let fontesCount = 0;

      if (typeof dadosPP.valor_mediano === 'number') {
        valorMediano = dadosPP.valor_mediano;
      }

      if (Array.isArray(dadosPP.itens)) {
        for (const item of dadosPP.itens) {
          if (Array.isArray(item.cotacoes)) {
            fontesCount += item.cotacoes.length;
          }
        }
      }

      pesquisa_preco = { valor_mediano: valorMediano, fontes_count: fontesCount };
    }

    // Demanda
    let demandaFormatada: { unidade_requisitante: string; ano_referencia: number; itens_count: number } | null = null;
    if (licitacao.demanda) {
      const d = licitacao.demanda as any;
      const itens_count = Array.isArray(d.itens) ? d.itens.length : 0;
      demandaFormatada = {
        unidade_requisitante: d.unidade_requisitante || '',
        ano_referencia: d.ano_referencia || 0,
        itens_count,
      };
    }

    return {
      licitacao: {
        id: licitacao.id,
        objeto: licitacao.objeto || '',
        numero_processo: licitacao.numero_processo || '',
        modalidade: licitacao.modalidade as string,
        criterio_julgamento: licitacao.criterio_julgamento as string,
        valor_total_estimado: licitacao.valor_total_estimado ?? null,
        natureza_objeto: licitacao.tipo_contratacao as string,
        prazo_execucao: null,
        itens: (licitacao.itens || []).map((item) => ({
          descricao_resumida: item.descricao_resumida || '',
          quantidade: Number(item.quantidade) || 0,
          unidade_medida: item.unidade_medida as string,
          valor_unitario_estimado: item.valor_unitario_estimado != null
            ? Number(item.valor_unitario_estimado)
            : null,
        })),
      },
      demanda: demandaFormatada,
      documentos: docsFormatados,
      pesquisa_preco,
    };
  }

  /**
   * Retorna conformidade por inciso para o painel IA — aba Análise.
   * Nunca lança exceção; sempre retorna { itens: [] } em caso de erro.
   */
  async buscarConformidade(documentoId: string): Promise<{
    itens: Array<{
      campo: string;
      fundamentoLegal: string;
      ok: boolean;
      erro: string | null;
    }>;
    tipo: string;
    total: number;
    aprovados: number;
  }> {
    try {
      const doc = await this.documentoRepository.findOneBy({ id: documentoId });
      if (!doc) {
        return { itens: [], tipo: '', total: 0, aprovados: 0 };
      }

      const dados = doc.dados_estruturados || {};

      let regras = this.regrasConformidade(doc.tipo as string);

      // Tipos sem checklist canônico: checar todas as chaves presentes.
      if (
        regras.length === 0 &&
        dados &&
        typeof dados === 'object' &&
        !Array.isArray(dados)
      ) {
        regras = Object.keys(dados).map((campo) => ({
          campo,
          fundamentoLegal: 'Lei 14.133/2021',
        }));
      }

      const itens = regras.map((regra) => {
        const valor = dados[regra.campo];
        const ok = this.valorNaoVazio(valor);
        return {
          campo: regra.campo,
          fundamentoLegal: regra.fundamentoLegal,
          ok,
          erro: ok ? null : 'Campo obrigatório não preenchido',
        };
      });

      const aprovados = itens.filter((i) => i.ok).length;

      return {
        itens,
        tipo: doc.tipo as string,
        total: itens.length,
        aprovados,
      };
    } catch {
      return { itens: [], tipo: '', total: 0, aprovados: 0 };
    }
  }
}
