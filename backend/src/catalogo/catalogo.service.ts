import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClasseCatalogo, ItemCatalogo, UnidadeMedida, CatalogoSyncLog } from './entities/catalogo.entity';
import { ComprasGovService, ItemComprasGov } from './comprasgov.service';

export interface BuscaCatalogoDto {
  termo?: string;
  tipo?: 'MATERIAL' | 'SERVICO';
  classe_id?: string;
  codigo_classe?: string;
  pagina?: number;
  limite?: number;
}

export interface ResultadoBusca<T> {
  dados: T[];
  total: number;
  pagina: number;
  totalPaginas: number;
}

@Injectable()
export class CatalogoService {
  private readonly logger = new Logger(CatalogoService.name);

  // Cache em memória simples
  private cacheClasses: Map<string, { data: ClasseCatalogo[]; expira: number }> = new Map();
  private cacheBuscas: Map<string, { data: ItemCatalogo[]; expira: number }> = new Map();
  private readonly CACHE_TTL_CLASSES = 60 * 60 * 1000; // 1 hora
  private readonly CACHE_TTL_BUSCAS = 5 * 60 * 1000; // 5 minutos

  constructor(
    @InjectRepository(ClasseCatalogo)
    private classeRepository: Repository<ClasseCatalogo>,
    @InjectRepository(ItemCatalogo)
    private itemRepository: Repository<ItemCatalogo>,
    @InjectRepository(UnidadeMedida)
    private unidadeRepository: Repository<UnidadeMedida>,
    @InjectRepository(CatalogoSyncLog)
    private syncLogRepository: Repository<CatalogoSyncLog>,
    private comprasGovService: ComprasGovService,
  ) {}

  // ============ CLASSES ============

  async listarClasses(tipo?: 'MATERIAL' | 'SERVICO'): Promise<ClasseCatalogo[]> {
    const cacheKey = `classes_${tipo || 'all'}`;
    const cached = this.cacheClasses.get(cacheKey);
    
    if (cached && cached.expira > Date.now()) {
      return cached.data;
    }

    const where: any = { ativo: true };
    if (tipo) where.tipo = tipo;

    const classes = await this.classeRepository.find({
      where,
      order: { nome: 'ASC' },
    });

    this.cacheClasses.set(cacheKey, {
      data: classes,
      expira: Date.now() + this.CACHE_TTL_CLASSES,
    });

    return classes;
  }

  async buscarClassePorCodigo(codigo: string): Promise<ClasseCatalogo | null> {
    return this.classeRepository.findOne({
      where: { codigo, ativo: true },
    });
  }

  // ============ ITENS ============

  async buscarItens(filtros: BuscaCatalogoDto): Promise<ResultadoBusca<ItemCatalogo>> {
    const { termo, tipo, classe_id, codigo_classe, pagina = 1, limite = 20 } = filtros;

    // Verificar cache para buscas simples
    const cacheKey = JSON.stringify(filtros);
    const cached = this.cacheBuscas.get(cacheKey);
    
    if (cached && cached.expira > Date.now()) {
      return {
        dados: cached.data,
        total: cached.data.length,
        pagina,
        totalPaginas: Math.ceil(cached.data.length / limite),
      };
    }

    const queryBuilder = this.itemRepository.createQueryBuilder('item')
      .leftJoinAndSelect('item.classe', 'classe')
      .where('item.ativo = :ativo', { ativo: true });

    if (termo) {
      // Busca melhorada: prioriza itens que começam com o termo
      // e usa busca em múltiplas palavras
      const termoNormalizado = termo.trim().toLowerCase();
      const palavras = termoNormalizado.split(/\s+/).filter(p => p.length >= 2);
      
      if (palavras.length > 1) {
        // Busca com múltiplas palavras: todas devem estar presentes
        const conditions = palavras.map((_, i) => 
          `(unaccent(LOWER(item.descricao)) LIKE unaccent(:palavra${i}) OR unaccent(LOWER(item.palavras_chave)) LIKE unaccent(:palavra${i}))`
        ).join(' AND ');
        
        const params: any = {};
        palavras.forEach((p, i) => {
          params[`palavra${i}`] = `%${p}%`;
        });
        
        queryBuilder.andWhere(`(${conditions})`, params);
      } else {
        // Busca simples: termo único
        queryBuilder.andWhere(
          '(unaccent(LOWER(item.descricao)) LIKE unaccent(LOWER(:termo)) OR item.codigo ILIKE :termo OR unaccent(LOWER(item.palavras_chave)) LIKE unaccent(LOWER(:termo)))',
          { termo: `%${termoNormalizado}%` }
        );
      }
    }

    if (tipo) {
      queryBuilder.andWhere('item.tipo = :tipo', { tipo });
    }

    if (classe_id) {
      queryBuilder.andWhere('item.classe_id = :classe_id', { classe_id });
    }

    if (codigo_classe) {
      queryBuilder.andWhere('item.codigo_classe = :codigo_classe', { codigo_classe });
    }

    // Ordenação inteligente: prioriza itens que começam com o termo
    const [dados, total] = await queryBuilder
      .orderBy(
        termo 
          ? `CASE WHEN unaccent(LOWER(item.descricao)) LIKE unaccent(LOWER('${termo.trim()}%')) THEN 0 ELSE 1 END`
          : 'item.descricao',
        'ASC'
      )
      .addOrderBy('item.descricao', 'ASC')
      .skip((pagina - 1) * limite)
      .take(limite)
      .getManyAndCount();

    // Se não encontrou localmente e tem termo, buscar na API
    if (dados.length === 0 && termo && termo.length >= 3) {
      this.logger.log(`Buscando "${termo}" na API Compras.gov.br...`);
      const itensApi = await this.buscarNaApiEArmazenar(termo, tipo);
      
      if (itensApi.length > 0) {
        return {
          dados: itensApi.slice(0, limite),
          total: itensApi.length,
          pagina: 1,
          totalPaginas: Math.ceil(itensApi.length / limite),
        };
      }
    }

    // Cachear resultado
    if (dados.length > 0) {
      this.cacheBuscas.set(cacheKey, {
        data: dados,
        expira: Date.now() + this.CACHE_TTL_BUSCAS,
      });
    }

    return {
      dados,
      total,
      pagina,
      totalPaginas: Math.ceil(total / limite),
    };
  }

  async buscarItemPorCodigo(codigo: string): Promise<ItemCatalogo | null> {
    let item = await this.itemRepository.findOne({
      where: { codigo, ativo: true },
      relations: ['classe'],
    });

    // Se não encontrou, buscar na API
    if (!item) {
      const itensApi = await this.comprasGovService.buscarPorCodigo(codigo);
      if (itensApi.length > 0) {
        item = await this.salvarItemDaApi(itensApi[0]);
      }
    }

    return item;
  }

  private async buscarNaApiEArmazenar(termo: string, tipo?: 'MATERIAL' | 'SERVICO'): Promise<ItemCatalogo[]> {
    try {
      let itensApi: any[] = [];

      if (!tipo || tipo === 'MATERIAL') {
        const materiais = await this.comprasGovService.buscarMateriais(termo);
        itensApi = [...itensApi, ...materiais];
      }

      if (!tipo || tipo === 'SERVICO') {
        const servicos = await this.comprasGovService.buscarServicos(termo);
        itensApi = [...itensApi, ...servicos];
      }

      // Salvar no banco
      const itensSalvos: ItemCatalogo[] = [];
      for (const itemApi of itensApi.slice(0, 50)) { // Limitar a 50 por busca
        const salvo = await this.salvarItemDaApi(itemApi);
        if (salvo) itensSalvos.push(salvo);
      }

      return itensSalvos;
    } catch (error) {
      this.logger.error(`Erro ao buscar na API: ${error.message}`);
      return [];
    }
  }

  private async salvarItemDaApi(itemApi: ItemComprasGov): Promise<ItemCatalogo | null> {
    try {
      // Verificar se já existe
      const existente = await this.itemRepository.findOne({
        where: { codigo: String(itemApi.codigo) },
      });

      if (existente) {
        // Atualizar
        existente.descricao = itemApi.descricao || existente.descricao;
        existente.ultima_sincronizacao = new Date();
        return this.itemRepository.save(existente);
      }

      // Criar novo
      const novoItem = this.itemRepository.create({
        codigo: String(itemApi.codigo),
        descricao: itemApi.descricao,
        tipo: itemApi.tipo || 'MATERIAL',
        codigo_classe: itemApi.classe ? String(itemApi.classe) : undefined,
        unidade_padrao: itemApi.unidade_fornecimento || 'UN',
        origem: 'COMPRASGOV',
        ultima_sincronizacao: new Date(),
      });

      return this.itemRepository.save(novoItem);
    } catch (error) {
      this.logger.error(`Erro ao salvar item: ${error.message}`);
      return null;
    }
  }

  // ============ UNIDADES DE MEDIDA ============

  async listarUnidades(): Promise<UnidadeMedida[]> {
    return this.unidadeRepository.find({
      where: { ativo: true },
      order: { sigla: 'ASC' },
    });
  }

  // ============ SINCRONIZAÇÃO ============

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async sincronizarCatalogo(): Promise<void> {
    this.logger.log('Iniciando sincronização do catálogo...');

    const log = this.syncLogRepository.create({
      tipo: 'COMPLETA',
      status: 'INICIADO',
    });
    await this.syncLogRepository.save(log);

    const inicio = Date.now();

    try {
      // Sincronizar classes
      await this.sincronizarClasses();

      // Sincronizar itens mais usados (top 1000)
      // await this.sincronizarItensMaisUsados();

      log.status = 'SUCESSO';
      log.duracao_segundos = Math.round((Date.now() - inicio) / 1000);
      await this.syncLogRepository.save(log);

      // Limpar cache
      this.cacheClasses.clear();
      this.cacheBuscas.clear();

      this.logger.log('Sincronização concluída com sucesso');
    } catch (error) {
      log.status = 'ERRO';
      log.mensagem_erro = error.message;
      log.duracao_segundos = Math.round((Date.now() - inicio) / 1000);
      await this.syncLogRepository.save(log);

      this.logger.error(`Erro na sincronização: ${error.message}`);
    }
  }

  private async sincronizarClasses(): Promise<void> {
    try {
      const classesMateriais = await this.comprasGovService.listarClassesMateriais();
      const classesServicos = await this.comprasGovService.listarClassesServicos();

      for (const classe of [...classesMateriais, ...classesServicos]) {
        await this.salvarClasse(classe);
      }
    } catch (error) {
      this.logger.error(`Erro ao sincronizar classes: ${error.message}`);
    }
  }

  private async salvarClasse(classeApi: any): Promise<void> {
    try {
      const existente = await this.classeRepository.findOne({
        where: { codigo: String(classeApi.codigo) },
      });

      if (existente) {
        existente.nome = classeApi.descricao || existente.nome;
        await this.classeRepository.save(existente);
      } else {
        const nova = this.classeRepository.create({
          codigo: String(classeApi.codigo),
          nome: classeApi.descricao,
          tipo: classeApi.tipo || 'MATERIAL',
          origem: 'COMPRASGOV',
        });
        await this.classeRepository.save(nova);
      }
    } catch (error) {
      this.logger.error(`Erro ao salvar classe: ${error.message}`);
    }
  }

  // ============ ESTATÍSTICAS ============

  async obterEstatisticas(): Promise<any> {
    const totalClasses = await this.classeRepository.count({ where: { ativo: true } });
    const totalItens = await this.itemRepository.count({ where: { ativo: true } });
    const totalMateriais = await this.itemRepository.count({ where: { tipo: 'MATERIAL', ativo: true } });
    const totalServicos = await this.itemRepository.count({ where: { tipo: 'SERVICO', ativo: true } });

    const ultimaSync = await this.syncLogRepository.findOne({
      where: { status: 'SUCESSO' },
      order: { created_at: 'DESC' },
    });

    return {
      totalClasses,
      totalItens,
      totalMateriais,
      totalServicos,
      ultimaSincronizacao: ultimaSync?.created_at || null,
    };
  }

  // ============ POPULAR DADOS INICIAIS ============

  async popularDadosIniciais(): Promise<void> {
    this.logger.log('Populando dados iniciais do catálogo...');

    // Classes de Materiais
    const classesMateriais = [
      { codigo: '2032', nome: 'GÊNEROS DE ALIMENTAÇÃO' },
      { codigo: '600', nome: 'MATERIAL DE EXPEDIENTE' },
      { codigo: '2050', nome: 'MATERIAL DE COPA E COZINHA' },
      { codigo: '400', nome: 'MEDICAMENTOS E MATERIAIS HOSPITALARES' },
      { codigo: '8', nome: 'EQUIPAMENTOS DE INFORMÁTICA' },
      { codigo: '20', nome: 'MATERIAL ELÉTRICO E ELETRÔNICO' },
      { codigo: '2015', nome: 'MATERIAL GRÁFICO' },
    ];

    // Classes de Serviços
    const classesServicos = [
      { codigo: '859', nome: 'OUTROS SERVIÇOS DE SUPORTE' },
      { codigo: '831', nome: 'SERVIÇOS DE CONSULTORIA' },
      { codigo: '166', nome: 'SERVIÇOS DE TIC' },
      { codigo: '14', nome: 'LOCAÇÃO DE BENS MÓVEIS' },
      { codigo: '17', nome: 'MANUTENÇÃO DE EQUIPAMENTOS' },
    ];

    // Salvar classes
    for (const c of classesMateriais) {
      const existe = await this.classeRepository.findOne({ where: { codigo: c.codigo } });
      if (!existe) {
        await this.classeRepository.save({ ...c, tipo: 'MATERIAL', origem: 'COMPRASGOV', ativo: true });
      }
    }
    for (const c of classesServicos) {
      const existe = await this.classeRepository.findOne({ where: { codigo: c.codigo } });
      if (!existe) {
        await this.classeRepository.save({ ...c, tipo: 'SERVICO', origem: 'COMPRASGOV', ativo: true });
      }
    }

    // Unidades de Medida
    const unidades = [
      { sigla: 'UN', nome: 'Unidade' },
      { sigla: 'PCT', nome: 'Pacote' },
      { sigla: 'CX', nome: 'Caixa' },
      { sigla: 'KG', nome: 'Quilograma' },
      { sigla: 'L', nome: 'Litro' },
      { sigla: 'M', nome: 'Metro' },
      { sigla: 'HR', nome: 'Hora' },
      { sigla: 'MES', nome: 'Mensal' },
      { sigla: 'DIA', nome: 'Diária' },
      { sigla: 'ROLO', nome: 'Rolo' },
      { sigla: 'RESMA', nome: 'Resma' },
      { sigla: 'SV', nome: 'Serviço' },
    ];

    for (const u of unidades) {
      const existe = await this.unidadeRepository.findOne({ where: { sigla: u.sigla } });
      if (!existe) {
        await this.unidadeRepository.save({ ...u, ativo: true });
      }
    }

    // Itens de exemplo - Materiais (expandido)
    const itensMateriais = [
      // Gêneros Alimentícios
      { codigo: '100001', descricao: 'AÇÚCAR CRISTAL', classe_codigo: '2032', unidade: 'KG' },
      { codigo: '100002', descricao: 'AÇÚCAR REFINADO', classe_codigo: '2032', unidade: 'KG' },
      { codigo: '100003', descricao: 'CAFÉ TORRADO E MOÍDO', classe_codigo: '2032', unidade: 'KG' },
      { codigo: '100004', descricao: 'CAFÉ SOLÚVEL', classe_codigo: '2032', unidade: 'UN' },
      { codigo: '100005', descricao: 'ARROZ TIPO 1', classe_codigo: '2032', unidade: 'KG' },
      { codigo: '100006', descricao: 'ARROZ PARBOILIZADO', classe_codigo: '2032', unidade: 'KG' },
      { codigo: '100007', descricao: 'FEIJÃO CARIOCA', classe_codigo: '2032', unidade: 'KG' },
      { codigo: '100008', descricao: 'FEIJÃO PRETO', classe_codigo: '2032', unidade: 'KG' },
      { codigo: '100009', descricao: 'ÓLEO DE SOJA', classe_codigo: '2032', unidade: 'L' },
      { codigo: '100010', descricao: 'AZEITE DE OLIVA', classe_codigo: '2032', unidade: 'L' },
      { codigo: '100011', descricao: 'LEITE INTEGRAL UHT', classe_codigo: '2032', unidade: 'L' },
      { codigo: '100012', descricao: 'LEITE EM PÓ', classe_codigo: '2032', unidade: 'KG' },
      { codigo: '100013', descricao: 'FARINHA DE TRIGO', classe_codigo: '2032', unidade: 'KG' },
      { codigo: '100014', descricao: 'MACARRÃO ESPAGUETE', classe_codigo: '2032', unidade: 'KG' },
      { codigo: '100015', descricao: 'SAL REFINADO', classe_codigo: '2032', unidade: 'KG' },
      { codigo: '100016', descricao: 'BISCOITO CREAM CRACKER', classe_codigo: '2032', unidade: 'PCT' },
      { codigo: '100017', descricao: 'CHOCOLATE EM PÓ', classe_codigo: '2032', unidade: 'KG' },
      { codigo: '100018', descricao: 'ACHOCOLATADO EM PÓ', classe_codigo: '2032', unidade: 'KG' },
      { codigo: '100019', descricao: 'MARGARINA', classe_codigo: '2032', unidade: 'KG' },
      { codigo: '100020', descricao: 'MANTEIGA', classe_codigo: '2032', unidade: 'KG' },
      // Material de Expediente
      { codigo: '200001', descricao: 'PAPEL A4 BRANCO 75G', classe_codigo: '600', unidade: 'RESMA' },
      { codigo: '200002', descricao: 'PAPEL A4 RECICLADO', classe_codigo: '600', unidade: 'RESMA' },
      { codigo: '200003', descricao: 'PAPEL OFÍCIO', classe_codigo: '600', unidade: 'RESMA' },
      { codigo: '200004', descricao: 'CANETA ESFEROGRÁFICA AZUL', classe_codigo: '600', unidade: 'UN' },
      { codigo: '200005', descricao: 'CANETA ESFEROGRÁFICA PRETA', classe_codigo: '600', unidade: 'UN' },
      { codigo: '200006', descricao: 'CANETA ESFEROGRÁFICA VERMELHA', classe_codigo: '600', unidade: 'UN' },
      { codigo: '200007', descricao: 'CANETA MARCA TEXTO', classe_codigo: '600', unidade: 'UN' },
      { codigo: '200008', descricao: 'LÁPIS PRETO Nº 2', classe_codigo: '600', unidade: 'UN' },
      { codigo: '200009', descricao: 'LAPISEIRA 0.7MM', classe_codigo: '600', unidade: 'UN' },
      { codigo: '200010', descricao: 'BORRACHA BRANCA', classe_codigo: '600', unidade: 'UN' },
      { codigo: '200011', descricao: 'APONTADOR DE LÁPIS', classe_codigo: '600', unidade: 'UN' },
      { codigo: '200012', descricao: 'GRAMPEADOR DE MESA', classe_codigo: '600', unidade: 'UN' },
      { codigo: '200013', descricao: 'GRAMPO 26/6', classe_codigo: '600', unidade: 'CX' },
      { codigo: '200014', descricao: 'CLIPS Nº 2/0', classe_codigo: '600', unidade: 'CX' },
      { codigo: '200015', descricao: 'CLIPS Nº 4/0', classe_codigo: '600', unidade: 'CX' },
      { codigo: '200016', descricao: 'PASTA AZ OFÍCIO', classe_codigo: '600', unidade: 'UN' },
      { codigo: '200017', descricao: 'PASTA SUSPENSA', classe_codigo: '600', unidade: 'UN' },
      { codigo: '200018', descricao: 'PASTA CATÁLOGO', classe_codigo: '600', unidade: 'UN' },
      { codigo: '200019', descricao: 'ENVELOPE OFÍCIO', classe_codigo: '600', unidade: 'UN' },
      { codigo: '200020', descricao: 'ENVELOPE PARDO A4', classe_codigo: '600', unidade: 'UN' },
      { codigo: '200021', descricao: 'FITA ADESIVA TRANSPARENTE', classe_codigo: '600', unidade: 'UN' },
      { codigo: '200022', descricao: 'FITA CREPE', classe_codigo: '600', unidade: 'UN' },
      { codigo: '200023', descricao: 'COLA BRANCA', classe_codigo: '600', unidade: 'UN' },
      { codigo: '200024', descricao: 'COLA BASTÃO', classe_codigo: '600', unidade: 'UN' },
      { codigo: '200025', descricao: 'TESOURA DE ESCRITÓRIO', classe_codigo: '600', unidade: 'UN' },
      { codigo: '200026', descricao: 'RÉGUA 30CM', classe_codigo: '600', unidade: 'UN' },
      { codigo: '200027', descricao: 'EXTRATOR DE GRAMPO', classe_codigo: '600', unidade: 'UN' },
      { codigo: '200028', descricao: 'PERFURADOR DE PAPEL', classe_codigo: '600', unidade: 'UN' },
      { codigo: '200029', descricao: 'BLOCO DE ANOTAÇÕES', classe_codigo: '600', unidade: 'UN' },
      { codigo: '200030', descricao: 'POST-IT AMARELO', classe_codigo: '600', unidade: 'UN' },
      // Material de Copa e Cozinha
      { codigo: '300001', descricao: 'COPO DESCARTÁVEL 200ML', classe_codigo: '2050', unidade: 'PCT' },
      { codigo: '300002', descricao: 'COPO DESCARTÁVEL 50ML', classe_codigo: '2050', unidade: 'PCT' },
      { codigo: '300003', descricao: 'COPO DESCARTÁVEL 300ML', classe_codigo: '2050', unidade: 'PCT' },
      { codigo: '300004', descricao: 'GUARDANAPO DE PAPEL', classe_codigo: '2050', unidade: 'PCT' },
      { codigo: '300005', descricao: 'PAPEL TOALHA', classe_codigo: '2050', unidade: 'ROLO' },
      { codigo: '300006', descricao: 'PRATO DESCARTÁVEL', classe_codigo: '2050', unidade: 'PCT' },
      { codigo: '300007', descricao: 'TALHER DESCARTÁVEL', classe_codigo: '2050', unidade: 'PCT' },
      { codigo: '300008', descricao: 'FILTRO DE CAFÉ', classe_codigo: '2050', unidade: 'CX' },
      // Equipamentos de Informática
      { codigo: '400001', descricao: 'COMPUTADOR DESKTOP', classe_codigo: '8', unidade: 'UN' },
      { codigo: '400002', descricao: 'NOTEBOOK', classe_codigo: '8', unidade: 'UN' },
      { codigo: '400003', descricao: 'MONITOR LED 24 POLEGADAS', classe_codigo: '8', unidade: 'UN' },
      { codigo: '400004', descricao: 'MONITOR LED 27 POLEGADAS', classe_codigo: '8', unidade: 'UN' },
      { codigo: '400005', descricao: 'IMPRESSORA MULTIFUNCIONAL', classe_codigo: '8', unidade: 'UN' },
      { codigo: '400006', descricao: 'IMPRESSORA LASER', classe_codigo: '8', unidade: 'UN' },
      { codigo: '400007', descricao: 'TONER PARA IMPRESSORA', classe_codigo: '8', unidade: 'UN' },
      { codigo: '400008', descricao: 'CARTUCHO DE TINTA', classe_codigo: '8', unidade: 'UN' },
      { codigo: '400009', descricao: 'MOUSE USB', classe_codigo: '8', unidade: 'UN' },
      { codigo: '400010', descricao: 'TECLADO USB', classe_codigo: '8', unidade: 'UN' },
      { codigo: '400011', descricao: 'WEBCAM', classe_codigo: '8', unidade: 'UN' },
      { codigo: '400012', descricao: 'HEADSET', classe_codigo: '8', unidade: 'UN' },
      { codigo: '400013', descricao: 'PENDRIVE 32GB', classe_codigo: '8', unidade: 'UN' },
      { codigo: '400014', descricao: 'HD EXTERNO 1TB', classe_codigo: '8', unidade: 'UN' },
      { codigo: '400015', descricao: 'NOBREAK 1400VA', classe_codigo: '8', unidade: 'UN' },
      { codigo: '400016', descricao: 'ROTEADOR WIFI', classe_codigo: '8', unidade: 'UN' },
      { codigo: '400017', descricao: 'SWITCH 24 PORTAS', classe_codigo: '8', unidade: 'UN' },
      { codigo: '400018', descricao: 'CABO DE REDE CAT6', classe_codigo: '8', unidade: 'M' },
      { codigo: '400019', descricao: 'PROJETOR MULTIMÍDIA', classe_codigo: '8', unidade: 'UN' },
      { codigo: '400020', descricao: 'SCANNER DE MESA', classe_codigo: '8', unidade: 'UN' },
    ];

    // Itens de exemplo - Serviços (expandido)
    const itensServicos = [
      // Serviços de Suporte
      { codigo: '500001', descricao: 'SERVIÇO DE LIMPEZA E CONSERVAÇÃO', classe_codigo: '859', unidade: 'MES' },
      { codigo: '500002', descricao: 'SERVIÇO DE VIGILÂNCIA PATRIMONIAL', classe_codigo: '859', unidade: 'MES' },
      { codigo: '500003', descricao: 'SERVIÇO DE VIGILÂNCIA ARMADA', classe_codigo: '859', unidade: 'MES' },
      { codigo: '500004', descricao: 'SERVIÇO DE RECEPÇÃO', classe_codigo: '859', unidade: 'MES' },
      { codigo: '500005', descricao: 'SERVIÇO DE PORTARIA', classe_codigo: '859', unidade: 'MES' },
      { codigo: '500006', descricao: 'SERVIÇO DE COPEIRAGEM', classe_codigo: '859', unidade: 'MES' },
      { codigo: '500007', descricao: 'SERVIÇO DE JARDINAGEM', classe_codigo: '859', unidade: 'MES' },
      { codigo: '500008', descricao: 'SERVIÇO DE DEDETIZAÇÃO', classe_codigo: '859', unidade: 'SV' },
      // Locação
      { codigo: '500010', descricao: 'LOCAÇÃO DE VEÍCULOS', classe_codigo: '14', unidade: 'MES' },
      { codigo: '500011', descricao: 'LOCAÇÃO DE VEÍCULOS COM MOTORISTA', classe_codigo: '14', unidade: 'MES' },
      { codigo: '500012', descricao: 'LOCAÇÃO DE MÁQUINAS COPIADORAS', classe_codigo: '14', unidade: 'MES' },
      { codigo: '500013', descricao: 'LOCAÇÃO DE IMPRESSORAS', classe_codigo: '14', unidade: 'MES' },
      { codigo: '500014', descricao: 'LOCAÇÃO DE EQUIPAMENTOS DE INFORMÁTICA', classe_codigo: '14', unidade: 'MES' },
      { codigo: '500015', descricao: 'LOCAÇÃO DE AR CONDICIONADO', classe_codigo: '14', unidade: 'MES' },
      { codigo: '500016', descricao: 'LOCAÇÃO DE MÓVEIS', classe_codigo: '14', unidade: 'MES' },
      { codigo: '500017', descricao: 'LOCAÇÃO DE TENDAS E ESTRUTURAS', classe_codigo: '14', unidade: 'DIA' },
      { codigo: '500018', descricao: 'LOCAÇÃO DE SOM E ILUMINAÇÃO', classe_codigo: '14', unidade: 'DIA' },
      // Manutenção
      { codigo: '500020', descricao: 'MANUTENÇÃO DE AR CONDICIONADO', classe_codigo: '17', unidade: 'SV' },
      { codigo: '500021', descricao: 'MANUTENÇÃO DE ELEVADORES', classe_codigo: '17', unidade: 'MES' },
      { codigo: '500022', descricao: 'MANUTENÇÃO PREDIAL', classe_codigo: '17', unidade: 'MES' },
      { codigo: '500023', descricao: 'MANUTENÇÃO ELÉTRICA', classe_codigo: '17', unidade: 'SV' },
      { codigo: '500024', descricao: 'MANUTENÇÃO HIDRÁULICA', classe_codigo: '17', unidade: 'SV' },
      { codigo: '500025', descricao: 'MANUTENÇÃO DE VEÍCULOS', classe_codigo: '17', unidade: 'SV' },
      { codigo: '500026', descricao: 'MANUTENÇÃO DE EQUIPAMENTOS DE INFORMÁTICA', classe_codigo: '17', unidade: 'SV' },
      // TIC
      { codigo: '500030', descricao: 'SUPORTE TÉCNICO DE TI', classe_codigo: '166', unidade: 'MES' },
      { codigo: '500031', descricao: 'DESENVOLVIMENTO DE SOFTWARE', classe_codigo: '166', unidade: 'HR' },
      { codigo: '500032', descricao: 'HOSPEDAGEM DE SISTEMAS', classe_codigo: '166', unidade: 'MES' },
      { codigo: '500033', descricao: 'SERVIÇO DE BACKUP EM NUVEM', classe_codigo: '166', unidade: 'MES' },
      { codigo: '500034', descricao: 'LINK DE INTERNET DEDICADO', classe_codigo: '166', unidade: 'MES' },
      { codigo: '500035', descricao: 'CERTIFICADO DIGITAL', classe_codigo: '166', unidade: 'UN' },
      // Consultoria
      { codigo: '500040', descricao: 'CONSULTORIA EM GESTÃO PÚBLICA', classe_codigo: '831', unidade: 'HR' },
      { codigo: '500041', descricao: 'CONSULTORIA JURÍDICA', classe_codigo: '831', unidade: 'HR' },
      { codigo: '500042', descricao: 'CONSULTORIA CONTÁBIL', classe_codigo: '831', unidade: 'MES' },
      { codigo: '500043', descricao: 'ASSESSORIA EM LICITAÇÕES', classe_codigo: '831', unidade: 'MES' },
      { codigo: '500044', descricao: 'AUDITORIA CONTÁBIL', classe_codigo: '831', unidade: 'SV' },
      { codigo: '500045', descricao: 'ELABORAÇÃO DE PROJETOS', classe_codigo: '831', unidade: 'SV' },
    ];

    // Salvar itens
    for (const item of itensMateriais) {
      const existe = await this.itemRepository.findOne({ where: { codigo: item.codigo } });
      if (!existe) {
        const classe = await this.classeRepository.findOne({ where: { codigo: item.classe_codigo } });
        await this.itemRepository.save({
          codigo: item.codigo,
          descricao: item.descricao,
          tipo: 'MATERIAL',
          classe_id: classe?.id,
          codigo_classe: item.classe_codigo,
          unidade_padrao: item.unidade,
          origem: 'COMPRASGOV',
          ativo: true,
        });
      } else {
        // Atualizar codigo_classe se não existir
        if (!existe.codigo_classe) {
          existe.codigo_classe = item.classe_codigo;
          await this.itemRepository.save(existe);
        }
      }
    }

    for (const item of itensServicos) {
      const existe = await this.itemRepository.findOne({ where: { codigo: item.codigo } });
      if (!existe) {
        const classe = await this.classeRepository.findOne({ where: { codigo: item.classe_codigo } });
        await this.itemRepository.save({
          codigo: item.codigo,
          descricao: item.descricao,
          tipo: 'SERVICO',
          classe_id: classe?.id,
          codigo_classe: item.classe_codigo,
          unidade_padrao: item.unidade,
          origem: 'COMPRASGOV',
          ativo: true,
        });
      } else {
        // Atualizar codigo_classe se não existir
        if (!existe.codigo_classe) {
          existe.codigo_classe = item.classe_codigo;
          await this.itemRepository.save(existe);
        }
      }
    }

    this.logger.log('Dados iniciais populados com sucesso!');
  }

  // ============ IMPORTAR ITEM DO CATÁLOGO ============

  async importarItem(itemData: {
    codigo: string;
    descricao: string;
    tipo: 'MATERIAL' | 'SERVICO';
    unidade_padrao?: string;
    codigo_classe?: string;
    origem?: string;
  }): Promise<ItemCatalogo> {
    // Verificar se já existe
    let item = await this.itemRepository.findOne({
      where: { codigo: itemData.codigo },
    });

    if (item) {
      // Atualizar item existente
      item.descricao = itemData.descricao;
      item.tipo = itemData.tipo;
      if (itemData.unidade_padrao) item.unidade_padrao = itemData.unidade_padrao;
      if (itemData.codigo_classe) item.codigo_classe = itemData.codigo_classe;
      item.origem = 'COMPRASGOV';
      await this.itemRepository.save(item);
      this.logger.log(`Item atualizado: ${itemData.codigo} - ${itemData.descricao}`);
    } else {
      // Criar novo item
      item = this.itemRepository.create({
        codigo: itemData.codigo,
        descricao: itemData.descricao,
        tipo: itemData.tipo,
        unidade_padrao: itemData.unidade_padrao || 'UN',
        codigo_classe: itemData.codigo_classe,
        origem: 'COMPRASGOV',
        ativo: true,
      });
      await this.itemRepository.save(item);
      this.logger.log(`Item importado: ${itemData.codigo} - ${itemData.descricao}`);
    }

    // Limpar cache
    this.cacheBuscas.clear();

    return item;
  }
}
