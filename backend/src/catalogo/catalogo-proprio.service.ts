import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, ILike } from 'typeorm';
import { ClassificacaoCatalogoProprio, ItemCatalogoProprio } from './entities/catalogo-proprio.entity';

@Injectable()
export class CatalogoProprioService {
  constructor(
    @InjectRepository(ClassificacaoCatalogoProprio)
    private classificacaoRepository: Repository<ClassificacaoCatalogoProprio>,
    @InjectRepository(ItemCatalogoProprio)
    private itemRepository: Repository<ItemCatalogoProprio>,
  ) {}

  // ==================== CLASSIFICAÇÕES ====================

  async buscarClassificacoes(params: {
    termo?: string;
    tipo?: 'MATERIAL' | 'SERVICO';
    orgaoId?: string;
    limite?: number;
  }): Promise<ClassificacaoCatalogoProprio[]> {
    const query = this.classificacaoRepository.createQueryBuilder('c')
      .where('c.ativo = :ativo', { ativo: true });

    if (params.termo) {
      query.andWhere(
        '(LOWER(c.nome) LIKE LOWER(:termo) OR LOWER(c.codigo) LIKE LOWER(:termo))',
        { termo: `%${params.termo}%` }
      );
    }

    if (params.tipo) {
      query.andWhere('c.tipo = :tipo', { tipo: params.tipo });
    }

    // Buscar classificações globais ou do órgão específico
    if (params.orgaoId) {
      query.andWhere('(c.orgao_id IS NULL OR c.orgao_id = :orgaoId)', { orgaoId: params.orgaoId });
    } else {
      query.andWhere('c.orgao_id IS NULL');
    }

    query.orderBy('c.codigo', 'ASC');
    
    if (params.limite) {
      query.take(params.limite);
    }

    return query.getMany();
  }

  async criarClassificacao(dados: {
    nome: string;
    tipo: 'MATERIAL' | 'SERVICO';
    descricao?: string;
    palavras_chave?: string[];
    orgaoId?: string;
  }): Promise<ClassificacaoCatalogoProprio> {
    // Gerar código automaticamente
    const codigo = await this.gerarCodigoClassificacao(dados.tipo);

    const classificacao = this.classificacaoRepository.create({
      codigo,
      nome: dados.nome.toUpperCase(),
      tipo: dados.tipo,
      descricao: dados.descricao,
      palavras_chave: dados.palavras_chave,
      orgao_id: dados.orgaoId,
    });

    return this.classificacaoRepository.save(classificacao);
  }

  private async gerarCodigoClassificacao(tipo: 'MATERIAL' | 'SERVICO'): Promise<string> {
    // Materiais: 1000, 1100, 1200...
    // Serviços: 100, 200, 300...
    const prefixo = tipo === 'MATERIAL' ? 1000 : 100;
    const incremento = 100;

    const ultima = await this.classificacaoRepository.findOne({
      where: { tipo },
      order: { codigo: 'DESC' }
    });

    if (!ultima) {
      return String(prefixo);
    }

    const ultimoCodigo = parseInt(ultima.codigo);
    return String(ultimoCodigo + incremento);
  }

  async findClassificacaoById(id: string): Promise<ClassificacaoCatalogoProprio> {
    const classificacao = await this.classificacaoRepository.findOne({
      where: { id },
      relations: ['itens']
    });

    if (!classificacao) {
      throw new NotFoundException('Classificação não encontrada');
    }

    return classificacao;
  }

  async findClassificacaoByCodigo(codigo: string): Promise<ClassificacaoCatalogoProprio | null> {
    return this.classificacaoRepository.findOne({
      where: { codigo }
    });
  }

  // ==================== ITENS ====================

  async buscarItens(params: {
    termo?: string;
    tipo?: 'MATERIAL' | 'SERVICO';
    classificacaoId?: string;
    orgaoId?: string;
    limite?: number;
  }): Promise<ItemCatalogoProprio[]> {
    const query = this.itemRepository.createQueryBuilder('i')
      .leftJoinAndSelect('i.classificacao', 'c')
      .where('i.ativo = :ativo', { ativo: true });

    if (params.termo) {
      query.andWhere(
        '(LOWER(i.descricao) LIKE LOWER(:termo) OR LOWER(i.codigo) LIKE LOWER(:termo))',
        { termo: `%${params.termo}%` }
      );
    }

    if (params.tipo) {
      query.andWhere('i.tipo = :tipo', { tipo: params.tipo });
    }

    if (params.classificacaoId) {
      query.andWhere('i.classificacao_id = :classificacaoId', { classificacaoId: params.classificacaoId });
    }

    // Buscar itens globais ou do órgão específico
    if (params.orgaoId) {
      query.andWhere('(i.orgao_id IS NULL OR i.orgao_id = :orgaoId)', { orgaoId: params.orgaoId });
    } else {
      query.andWhere('i.orgao_id IS NULL');
    }

    query.orderBy('i.codigo', 'ASC');
    
    if (params.limite) {
      query.take(params.limite);
    }

    return query.getMany();
  }

  async criarItem(dados: {
    descricao: string;
    tipo: 'MATERIAL' | 'SERVICO';
    classificacaoId: string;
    descricao_detalhada?: string;
    unidade_padrao?: string;
    valor_referencia?: number;
    orgaoId?: string;
  }): Promise<ItemCatalogoProprio> {
    // Verificar se classificação existe
    const classificacao = await this.findClassificacaoById(dados.classificacaoId);

    // Gerar código automaticamente
    const codigo = await this.gerarCodigoItem(dados.tipo, classificacao.codigo);

    const item = this.itemRepository.create({
      codigo,
      descricao: dados.descricao,
      descricao_detalhada: dados.descricao_detalhada,
      tipo: dados.tipo,
      unidade_padrao: dados.unidade_padrao || 'UN',
      valor_referencia: dados.valor_referencia,
      classificacao_id: dados.classificacaoId,
      orgao_id: dados.orgaoId,
    });

    return this.itemRepository.save(item);
  }

  private async gerarCodigoItem(tipo: 'MATERIAL' | 'SERVICO', codigoClassificacao: string): Promise<string> {
    // Formato: S1000001 (Serviço) ou M10000001 (Material)
    const prefixo = tipo === 'MATERIAL' ? 'M' : 'S';
    const baseCode = `${prefixo}${codigoClassificacao}`;

    // Buscar último item desta classificação
    const ultimo = await this.itemRepository.findOne({
      where: { codigo: Like(`${baseCode}%`) },
      order: { codigo: 'DESC' }
    });

    if (!ultimo) {
      return `${baseCode}0001`;
    }

    // Extrair número sequencial e incrementar
    const sequencial = parseInt(ultimo.codigo.replace(baseCode, '')) + 1;
    return `${baseCode}${sequencial.toString().padStart(4, '0')}`;
  }

  async findItemById(id: string): Promise<ItemCatalogoProprio> {
    const item = await this.itemRepository.findOne({
      where: { id },
      relations: ['classificacao']
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    return item;
  }

  async findItemByCodigo(codigo: string): Promise<ItemCatalogoProprio | null> {
    return this.itemRepository.findOne({
      where: { codigo },
      relations: ['classificacao']
    });
  }

  // ==================== SEED INICIAL ====================

  async seedClassificacoesIniciais(): Promise<{ classificacoes: number; itens: number }> {
    // Verificar se já existe dados
    const count = await this.classificacaoRepository.count();
    if (count > 0) {
      return { classificacoes: 0, itens: 0 };
    }

    // Classificações de Serviços
    const classificacoesServicos = [
      { codigo: '100', nome: 'SERVIÇOS DE UTILIDADE PÚBLICA', palavras_chave: ['água', 'esgoto', 'energia', 'elétrica', 'telefonia', 'internet'] },
      { codigo: '200', nome: 'SERVIÇOS DE TECNOLOGIA DA INFORMAÇÃO', palavras_chave: ['software', 'sistema', 'licenciamento', 'antivírus', 'informática', 'ti', 'portal', 'site', 'web'] },
      { codigo: '300', nome: 'SERVIÇOS DE CONSULTORIA E ASSESSORIA', palavras_chave: ['consultoria', 'assessoria', 'técnico', 'contábil', 'jurídico'] },
      { codigo: '400', nome: 'SERVIÇOS DE MANUTENÇÃO PREDIAL', palavras_chave: ['manutenção', 'elétrica', 'hidráulica', 'ar condicionado', 'elevador', 'pintura', 'reparo'] },
      { codigo: '500', nome: 'SERVIÇOS DE LIMPEZA E CONSERVAÇÃO', palavras_chave: ['limpeza', 'dedetização', 'desratização', 'higienização', 'conservação'] },
      { codigo: '600', nome: 'SERVIÇOS DE RECURSOS HUMANOS', palavras_chave: ['terceirização', 'estagiário', 'treinamento', 'medicina', 'segurança do trabalho'] },
      { codigo: '700', nome: 'SERVIÇOS DE COMUNICAÇÃO E MÍDIA', palavras_chave: ['tv', 'rádio', 'transmissão', 'sonorização', 'imprensa', 'evento'] },
      { codigo: '800', nome: 'SERVIÇOS DE ENGENHARIA E OBRAS', palavras_chave: ['reforma', 'obra', 'engenheiro', 'construção', 'projeto'] },
      { codigo: '900', nome: 'OUTROS SERVIÇOS', palavras_chave: ['locação', 'cópia', 'chave', 'extintor', 'diversos'] },
    ];

    // Classificações de Materiais
    const classificacoesMateriais = [
      { codigo: '1000', nome: 'MATERIAIS DE INFORMÁTICA', palavras_chave: ['informática', 'computador', 'notebook', 'monitor', 'servidor'] },
      { codigo: '1100', nome: 'MÓVEIS E EQUIPAMENTOS', palavras_chave: ['móveis', 'mesa', 'cadeira', 'armário', 'estante'] },
      { codigo: '1200', nome: 'EQUIPAMENTOS DE CLIMATIZAÇÃO', palavras_chave: ['ar condicionado', 'climatização', 'ventilador'] },
      { codigo: '1300', nome: 'EQUIPAMENTOS ELETRÔNICOS', palavras_chave: ['eletrônico', 'microfone', 'caixa de som', 'câmera', 'tv'] },
      { codigo: '1400', nome: 'MATERIAIS DE ESCRITÓRIO', palavras_chave: ['uniforme', 'persiana', 'cortina', 'flores', 'escritório'] },
      { codigo: '1500', nome: 'PEÇAS E COMPONENTES', palavras_chave: ['peça', 'componente', 'reposição'] },
      { codigo: '1600', nome: 'INFRAESTRUTURA', palavras_chave: ['infraestrutura', 'rack', 'cabeamento', 'rede'] },
    ];

    let totalClassificacoes = 0;

    for (const c of classificacoesServicos) {
      await this.classificacaoRepository.save(
        this.classificacaoRepository.create({
          ...c,
          tipo: 'SERVICO',
        })
      );
      totalClassificacoes++;
    }

    for (const c of classificacoesMateriais) {
      await this.classificacaoRepository.save(
        this.classificacaoRepository.create({
          ...c,
          tipo: 'MATERIAL',
        })
      );
      totalClassificacoes++;
    }

    return { classificacoes: totalClassificacoes, itens: 0 };
  }

  // ==================== BUSCAR ITENS DO PCA ====================

  async buscarItensDoPCA(params: {
    termo?: string;
    tipo?: 'MATERIAL' | 'SERVICO';
    limite?: number;
  }): Promise<any[]> {
    // Buscar itens únicos do PCA (agrupados por código do item)
    const { DataSource } = require('typeorm');
    const dataSource = this.classificacaoRepository.manager.connection;
    
    let query = `
      SELECT DISTINCT ON (codigo_item_catalogo, descricao_objeto)
        codigo_item_catalogo as codigo,
        descricao_objeto as descricao,
        categoria as tipo,
        unidade_medida as unidade_padrao,
        codigo_classe,
        nome_classe
      FROM itens_pca
      WHERE codigo_item_catalogo IS NOT NULL 
        AND codigo_item_catalogo != ''
    `;

    const queryParams: any[] = [];
    let paramIndex = 1;

    if (params.termo) {
      query += ` AND (LOWER(descricao_objeto) LIKE LOWER($${paramIndex}) OR LOWER(codigo_item_catalogo) LIKE LOWER($${paramIndex}))`;
      queryParams.push(`%${params.termo}%`);
      paramIndex++;
    }

    if (params.tipo) {
      const categoria = params.tipo === 'MATERIAL' ? 'MATERIAL' : 'SERVICO';
      query += ` AND categoria = $${paramIndex}`;
      queryParams.push(categoria);
      paramIndex++;
    }

    query += ` ORDER BY codigo_item_catalogo, descricao_objeto`;
    
    if (params.limite) {
      query += ` LIMIT $${paramIndex}`;
      queryParams.push(params.limite);
    }

    const results = await dataSource.query(query, queryParams);

    // Formatar resultado para o frontend
    return results.map((item: any) => ({
      id: item.codigo,
      codigo: item.codigo,
      descricao: item.descricao,
      tipo: item.tipo === 'MATERIAL' ? 'MATERIAL' : 'SERVICO',
      unidade_padrao: item.unidade_padrao,
      classificacao: item.codigo_classe ? {
        codigo: item.codigo_classe,
        nome: item.nome_classe
      } : null
    }));
  }

  // ==================== ESTATÍSTICAS ====================

  async getEstatisticas(): Promise<{
    totalClassificacoes: number;
    totalItens: number;
    classificacoesPorTipo: { tipo: string; total: number }[];
  }> {
    const totalClassificacoes = await this.classificacaoRepository.count({ where: { ativo: true } });
    const totalItens = await this.itemRepository.count({ where: { ativo: true } });

    const classificacoesPorTipo = await this.classificacaoRepository
      .createQueryBuilder('c')
      .select('c.tipo', 'tipo')
      .addSelect('COUNT(*)', 'total')
      .where('c.ativo = :ativo', { ativo: true })
      .groupBy('c.tipo')
      .getRawMany();

    return {
      totalClassificacoes,
      totalItens,
      classificacoesPorTipo,
    };
  }
}
