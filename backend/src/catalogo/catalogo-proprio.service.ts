import { Injectable, NotFoundException, BadRequestException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, ILike } from 'typeorm';
import { ClassificacaoCatalogoProprio, ItemCatalogoProprio } from './entities/catalogo-proprio.entity';

@Injectable()
export class CatalogoProprioService implements OnModuleInit {
  private readonly logger = new Logger(CatalogoProprioService.name);

  constructor(
    @InjectRepository(ClassificacaoCatalogoProprio)
    private classificacaoRepository: Repository<ClassificacaoCatalogoProprio>,
    @InjectRepository(ItemCatalogoProprio)
    private itemRepository: Repository<ItemCatalogoProprio>,
  ) {}

  async onModuleInit() {
    // Executar seed de classificações iniciais ao iniciar o módulo
    try {
      const resultado = await this.seedClassificacoesIniciais();
      if (resultado.classificacoes > 0) {
        this.logger.log(`[SEED] Criadas ${resultado.classificacoes} classificações iniciais do catálogo próprio`);
      } else {
        this.logger.log(`[SEED] Classificações do catálogo próprio já existem (${resultado.existentes} encontradas)`);
      }
    } catch (error) {
      this.logger.error(`[SEED] Erro ao criar classificações iniciais: ${error.message}`);
    }
  }

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

  async atualizarClassificacao(id: string, dados: {
    nome?: string;
    descricao?: string;
    palavras_chave?: string[];
    ativo?: boolean;
  }): Promise<ClassificacaoCatalogoProprio> {
    const classificacao = await this.findClassificacaoById(id);
    
    if (dados.nome) classificacao.nome = dados.nome.toUpperCase();
    if (dados.descricao !== undefined) classificacao.descricao = dados.descricao;
    if (dados.palavras_chave !== undefined) classificacao.palavras_chave = dados.palavras_chave;
    if (dados.ativo !== undefined) classificacao.ativo = dados.ativo;

    return this.classificacaoRepository.save(classificacao);
  }

  async excluirClassificacao(id: string): Promise<{ success: boolean; message: string }> {
    const classificacao = await this.findClassificacaoById(id);
    
    // Verificar se há itens vinculados
    if (classificacao.itens && classificacao.itens.length > 0) {
      throw new BadRequestException(
        `Não é possível excluir a classificação "${classificacao.nome}" pois há ${classificacao.itens.length} itens vinculados`
      );
    }

    await this.classificacaoRepository.remove(classificacao);
    return { success: true, message: `Classificação "${classificacao.nome}" excluída com sucesso` };
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

    // Buscar itens globais (orgao_id IS NULL) + itens do órgão específico se informado
    // Catálogo global é compartilhado entre todos os órgãos
    if (params.orgaoId) {
      query.andWhere('(i.orgao_id IS NULL OR i.orgao_id = :orgaoId)', { orgaoId: params.orgaoId });
    }
    // Se não informar orgaoId, retorna todos os itens globais (sem filtro de orgao_id)

    query.orderBy('i.codigo', 'ASC');
    
    if (params.limite) {
      query.take(params.limite);
    }

    this.logger.log(`[BUSCA-ITENS] Buscando itens: termo=${params.termo}, tipo=${params.tipo}, limite=${params.limite}`);
    const itens = await query.getMany();
    this.logger.log(`[BUSCA-ITENS] Encontrados ${itens.length} itens`);

    return itens;
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

  async importarItemComprasGov(dados: {
    codigoFederal: string;
    descricao: string;
    tipo: 'MATERIAL' | 'SERVICO';
    codigo_classe?: string;
    nome_classe?: string;
    descricao_detalhada?: string;
    unidade_padrao?: string;
  }): Promise<ItemCatalogoProprio | null> {
    if (!dados.codigo_classe || !dados.nome_classe) return null;

    let classificacao = await this.classificacaoRepository.findOne({
      where: { codigo: dados.codigo_classe },
    });

    if (!classificacao) {
      classificacao = await this.classificacaoRepository.save(
        this.classificacaoRepository.create({
          codigo: dados.codigo_classe,
          nome: dados.nome_classe.toUpperCase(),
          tipo: dados.tipo,
          descricao: `Classificação importada do ComprasGov (${dados.codigo_classe})`,
          palavras_chave: dados.nome_classe.split(/\s+/).filter(Boolean),
          orgao_id: null,
          ativo: true,
        }),
      );
      this.logger.log(`[COMPRASGOV] Classificação própria criada: ${dados.codigo_classe} - ${dados.nome_classe}`);
    }

    const existente = await this.itemRepository
      .createQueryBuilder('i')
      .where('i.classificacao_id = :classificacaoId', { classificacaoId: classificacao.id })
      .andWhere('i.tipo = :tipo', { tipo: dados.tipo })
      .andWhere('LOWER(i.descricao) = LOWER(:descricao)', { descricao: dados.descricao })
      .getOne();

    if (existente) {
      if (dados.unidade_padrao) existente.unidade_padrao = dados.unidade_padrao;
      if (dados.descricao_detalhada) existente.descricao_detalhada = dados.descricao_detalhada;
      return this.itemRepository.save(existente);
    }

    const codigo = await this.gerarCodigoItem(dados.tipo, classificacao.codigo);
    const item = this.itemRepository.create({
      codigo,
      descricao: dados.descricao,
      descricao_detalhada: dados.descricao_detalhada || `Código ComprasGov: ${dados.codigoFederal}`,
      tipo: dados.tipo,
      unidade_padrao: dados.unidade_padrao || 'UN',
      classificacao_id: classificacao.id,
      orgao_id: null,
      ativo: true,
    });

    this.logger.log(`[COMPRASGOV] Item próprio criado: ${codigo} - ${dados.descricao}`);
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

  async atualizarItem(id: string, dados: {
    descricao?: string;
    descricao_detalhada?: string;
    unidade_padrao?: string;
    valor_referencia?: number;
    classificacaoId?: string;
    ativo?: boolean;
  }): Promise<ItemCatalogoProprio> {
    const item = await this.findItemById(id);
    
    if (dados.descricao) item.descricao = dados.descricao;
    if (dados.descricao_detalhada !== undefined) item.descricao_detalhada = dados.descricao_detalhada;
    if (dados.unidade_padrao) item.unidade_padrao = dados.unidade_padrao;
    if (dados.valor_referencia !== undefined) item.valor_referencia = dados.valor_referencia;
    if (dados.classificacaoId) item.classificacao_id = dados.classificacaoId;
    if (dados.ativo !== undefined) item.ativo = dados.ativo;

    return this.itemRepository.save(item);
  }

  async excluirItem(id: string): Promise<{ success: boolean; message: string }> {
    const item = await this.findItemById(id);
    await this.itemRepository.remove(item);
    return { success: true, message: `Item "${item.codigo}" excluído com sucesso` };
  }

  async findItemByCodigo(codigo: string): Promise<ItemCatalogoProprio | null> {
    return this.itemRepository.findOne({
      where: { codigo },
      relations: ['classificacao']
    });
  }

  // ==================== SEED INICIAL ====================

  async seedClassificacoesIniciais(): Promise<{ classificacoes: number; itens: number; existentes: number }> {
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
    let existentes = 0;

    for (const c of classificacoesServicos) {
      const existe = await this.classificacaoRepository.findOne({ where: { codigo: c.codigo } });
      if (!existe) {
        await this.classificacaoRepository.save(
          this.classificacaoRepository.create({
            ...c,
            tipo: 'SERVICO',
          })
        );
        totalClassificacoes++;
      } else {
        existentes++;
      }
    }

    for (const c of classificacoesMateriais) {
      const existe = await this.classificacaoRepository.findOne({ where: { codigo: c.codigo } });
      if (!existe) {
        await this.classificacaoRepository.save(
          this.classificacaoRepository.create({
            ...c,
            tipo: 'MATERIAL',
          })
        );
        totalClassificacoes++;
      } else {
        existentes++;
      }
    }

    return { classificacoes: totalClassificacoes, itens: 0, existentes };
  }

  // ==================== BUSCAR ITENS DO PCA ====================

  async buscarItensDoPCA(params: {
    termo?: string;
    tipo?: 'MATERIAL' | 'SERVICO';
    orgaoId?: string;
    limite?: number;
  }): Promise<any[]> {
    // Buscar itens únicos do PCA (agrupados por código do item)
    const dataSource = this.classificacaoRepository.manager.connection;
    
    // Se não tiver orgaoId, retorna array vazio (órgão novo não tem itens)
    if (!params.orgaoId) {
      this.logger.log('[BUSCA-PCA] Nenhum orgaoId fornecido, retornando vazio');
      return [];
    }
    
    let query = `
      SELECT DISTINCT ON (ip.codigo_item_catalogo, ip.descricao_objeto)
        ip.codigo_item_catalogo as codigo,
        ip.descricao_objeto as descricao,
        ip.categoria as tipo,
        ip.unidade_medida as unidade_padrao,
        ip.codigo_classe,
        ip.nome_classe
      FROM itens_pca ip
      INNER JOIN planos_contratacao_anual pca ON ip.pca_id = pca.id
      WHERE ip.codigo_item_catalogo IS NOT NULL 
        AND ip.codigo_item_catalogo != ''
        AND pca.orgao_id = $1
    `;

    const queryParams: any[] = [params.orgaoId];
    let paramIndex = 2;

    if (params.termo) {
      query += ` AND (LOWER(ip.descricao_objeto) LIKE LOWER($${paramIndex}) OR LOWER(ip.codigo_item_catalogo) LIKE LOWER($${paramIndex}))`;
      queryParams.push(`%${params.termo}%`);
      paramIndex++;
    }

    if (params.tipo) {
      const categoria = params.tipo === 'MATERIAL' ? 'MATERIAL' : 'SERVICO';
      query += ` AND ip.categoria = $${paramIndex}`;
      queryParams.push(categoria);
      paramIndex++;
    }

    query += ` ORDER BY ip.codigo_item_catalogo, ip.descricao_objeto`;
    
    if (params.limite) {
      query += ` LIMIT $${paramIndex}`;
      queryParams.push(params.limite);
    }

    const results = await dataSource.query(query, queryParams);
    this.logger.log(`[BUSCA-PCA] Encontrados ${results.length} itens para orgaoId=${params.orgaoId}`);

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

  // ==================== MIGRAR ITENS DO PCA PARA CATÁLOGO ====================

  async migrarItensPCAParaCatalogo(): Promise<{
    migrados: number;
    jaExistentes: number;
    erros: number;
    detalhes: { codigo: string; descricao: string; status: string }[];
  }> {
    this.logger.log('[MIGRACAO] Iniciando migração de itens do PCA para catálogo próprio...');
    
    const dataSource = this.classificacaoRepository.manager.connection;
    
    // Buscar itens únicos do PCA que têm código de catálogo
    const itensPCA = await dataSource.query(`
      SELECT DISTINCT ON (codigo_item_catalogo)
        codigo_item_catalogo as codigo,
        descricao_objeto as descricao,
        categoria as tipo,
        unidade_medida as unidade_padrao,
        codigo_classe,
        nome_classe,
        valor_unitario_estimado as valor_referencia
      FROM itens_pca
      WHERE codigo_item_catalogo IS NOT NULL 
        AND codigo_item_catalogo != ''
      ORDER BY codigo_item_catalogo, created_at DESC
    `);

    this.logger.log(`[MIGRACAO] Encontrados ${itensPCA.length} itens únicos no PCA`);

    let migrados = 0;
    let jaExistentes = 0;
    let erros = 0;
    const detalhes: { codigo: string; descricao: string; status: string }[] = [];

    for (const item of itensPCA) {
      try {
        // Verificar se já existe no catálogo próprio
        const existe = await this.itemRepository.findOne({ 
          where: { codigo: item.codigo } 
        });

        if (existe) {
          jaExistentes++;
          detalhes.push({
            codigo: item.codigo,
            descricao: item.descricao?.substring(0, 50) || '',
            status: 'ja_existe'
          });
          continue;
        }

        // Buscar ou criar classificação
        let classificacao: ClassificacaoCatalogoProprio | null = null;
        if (item.codigo_classe) {
          classificacao = await this.classificacaoRepository.findOne({
            where: { codigo: item.codigo_classe }
          });

          // Se não encontrou, criar uma classificação baseada no código
          if (!classificacao) {
            const tipoItem = item.tipo === 'MATERIAL' ? 'MATERIAL' : 'SERVICO';
            classificacao = await this.classificacaoRepository.save(
              this.classificacaoRepository.create({
                codigo: item.codigo_classe,
                nome: item.nome_classe || `CLASSIFICAÇÃO ${item.codigo_classe}`,
                tipo: tipoItem,
              })
            );
            this.logger.log(`[MIGRACAO] Criada classificação: ${item.codigo_classe}`);
          }
        }

        // Criar item no catálogo próprio
        const novoItem = this.itemRepository.create({
          codigo: item.codigo,
          descricao: item.descricao,
          tipo: item.tipo === 'MATERIAL' ? 'MATERIAL' : 'SERVICO',
          unidade_padrao: item.unidade_padrao || 'UN',
          valor_referencia: item.valor_referencia || undefined,
          classificacao_id: classificacao?.id || undefined,
          ativo: true,
        });

        await this.itemRepository.save(novoItem);
        migrados++;
        
        detalhes.push({
          codigo: item.codigo,
          descricao: item.descricao?.substring(0, 50) || '',
          status: 'migrado'
        });

        this.logger.log(`[MIGRACAO] ✓ Migrado: ${item.codigo} - ${item.descricao?.substring(0, 40)}`);

      } catch (error) {
        erros++;
        this.logger.error(`[MIGRACAO] ✗ Erro ao migrar ${item.codigo}: ${error.message}`);
        detalhes.push({
          codigo: item.codigo,
          descricao: item.descricao?.substring(0, 50) || '',
          status: `erro: ${error.message}`
        });
      }
    }

    this.logger.log(`[MIGRACAO] Concluído: ${migrados} migrados, ${jaExistentes} já existentes, ${erros} erros`);

    return { migrados, jaExistentes, erros, detalhes };
  }

}
