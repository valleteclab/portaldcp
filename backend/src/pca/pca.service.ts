import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlanoContratacaoAnual, ItemPCA, StatusPCA, StatusItemPCA, CategoriaItemPCA } from './entities/pca.entity';

@Injectable()
export class PcaService {
  private readonly logger = new Logger(PcaService.name);

  constructor(
    @InjectRepository(PlanoContratacaoAnual)
    private pcaRepository: Repository<PlanoContratacaoAnual>,
    @InjectRepository(ItemPCA)
    private itemPcaRepository: Repository<ItemPCA>,
  ) {}

  // ============ PCA ============

  async criar(dados: Partial<PlanoContratacaoAnual>): Promise<PlanoContratacaoAnual> {
    // Verificar se já existe PCA para o ano
    const existente = await this.pcaRepository.findOne({
      where: { orgao_id: dados.orgao_id, ano_exercicio: dados.ano_exercicio }
    });

    if (existente) {
      throw new BadRequestException(`Já existe um PCA para o ano ${dados.ano_exercicio}`);
    }

    const numeroPca = `PCA ${dados.ano_exercicio}`;

    const pca = this.pcaRepository.create({
      ...dados,
      numero_pca: numeroPca,
      status: StatusPCA.RASCUNHO
    });

    return this.pcaRepository.save(pca);
  }

  async findAll(filtros?: {
    orgaoId?: string;
    ano?: number;
    status?: StatusPCA;
  }): Promise<PlanoContratacaoAnual[]> {
    const query = this.pcaRepository.createQueryBuilder('pca')
      .leftJoinAndSelect('pca.orgao', 'orgao')
      .leftJoinAndSelect('pca.itens', 'itens');

    if (filtros?.orgaoId) {
      query.andWhere('pca.orgao_id = :orgaoId', { orgaoId: filtros.orgaoId });
    }

    if (filtros?.ano) {
      query.andWhere('pca.ano_exercicio = :ano', { ano: filtros.ano });
    }

    if (filtros?.status) {
      query.andWhere('pca.status = :status', { status: filtros.status });
    }

    return query.orderBy('pca.ano_exercicio', 'DESC').getMany();
  }

  async findOne(id: string): Promise<PlanoContratacaoAnual> {
    const pca = await this.pcaRepository.findOne({
      where: { id },
      relations: ['orgao', 'itens']
    });

    if (!pca) {
      throw new NotFoundException('PCA não encontrado');
    }

    // Ordenar itens por numero_item
    if (pca.itens && pca.itens.length > 0) {
      pca.itens.sort((a, b) => (a.numero_item || 0) - (b.numero_item || 0));
    }

    return pca;
  }

  async findByAno(orgaoId: string, ano: number): Promise<PlanoContratacaoAnual> {
    const pca = await this.pcaRepository.findOne({
      where: { orgao_id: orgaoId, ano_exercicio: ano },
      relations: ['orgao', 'itens']
    });

    if (!pca) {
      throw new NotFoundException(`PCA do ano ${ano} não encontrado`);
    }

    // Ordenar itens por numero_item
    if (pca.itens && pca.itens.length > 0) {
      pca.itens.sort((a, b) => (a.numero_item || 0) - (b.numero_item || 0));
    }

    return pca;
  }

  async atualizar(id: string, dados: Partial<PlanoContratacaoAnual>): Promise<PlanoContratacaoAnual> {
    const pca = await this.findOne(id);

    if (pca.status === StatusPCA.ENVIADO_PNCP) {
      throw new BadRequestException('Não é possível alterar um PCA já enviado ao PNCP');
    }

    Object.assign(pca, dados);
    return this.pcaRepository.save(pca);
  }

  async excluir(id: string): Promise<{ message: string }> {
    const pca = await this.findOne(id);

    if (pca.enviado_pncp || pca.status === StatusPCA.ENVIADO_PNCP) {
      throw new BadRequestException('Não é possível excluir um PCA já enviado ao PNCP');
    }

    // Excluir itens primeiro
    await this.itemPcaRepository.delete({ pca_id: id });
    
    // Excluir PCA
    await this.pcaRepository.delete(id);

    return { message: `PCA ${pca.ano_exercicio} excluído com sucesso` };
  }

  async aprovar(id: string, responsavel: { id: string; nome: string; cargo: string }): Promise<PlanoContratacaoAnual> {
    const pca = await this.findOne(id);

    if (pca.status !== StatusPCA.EM_ELABORACAO && pca.status !== StatusPCA.RASCUNHO) {
      throw new BadRequestException('PCA precisa estar em elaboração para ser aprovado');
    }

    pca.status = StatusPCA.APROVADO;
    pca.data_aprovacao = new Date();
    pca.responsavel_id = responsavel.id;
    pca.responsavel_nome = responsavel.nome;
    pca.responsavel_cargo = responsavel.cargo;

    return this.pcaRepository.save(pca);
  }

  async publicar(id: string): Promise<PlanoContratacaoAnual> {
    const pca = await this.findOne(id);

    if (pca.status !== StatusPCA.APROVADO) {
      throw new BadRequestException('PCA precisa estar aprovado para ser publicado');
    }

    pca.status = StatusPCA.PUBLICADO;
    pca.data_publicacao = new Date();

    return this.pcaRepository.save(pca);
  }

  async marcarEnviadoPNCP(id: string, numeroControle: string, sequencial: number): Promise<PlanoContratacaoAnual> {
    const pca = await this.findOne(id);

    pca.status = StatusPCA.ENVIADO_PNCP;
    pca.enviado_pncp = true;
    pca.numero_controle_pncp = numeroControle;
    pca.sequencial_pncp = sequencial;
    pca.data_envio_pncp = new Date();

    return this.pcaRepository.save(pca);
  }

  async desmarcarEnviadoPNCP(id: string): Promise<PlanoContratacaoAnual> {
    const pca = await this.findOne(id);

    pca.status = StatusPCA.PUBLICADO;
    pca.enviado_pncp = false;
    pca.numero_controle_pncp = undefined as any;
    pca.sequencial_pncp = undefined as any;
    pca.data_envio_pncp = undefined as any;

    return this.pcaRepository.save(pca);
  }

  // ============ ITENS DO PCA ============

  async adicionarItem(pcaId: string, dados: Partial<ItemPCA>): Promise<ItemPCA> {
    const pca = await this.findOne(pcaId);

    if (pca.status === StatusPCA.ENVIADO_PNCP) {
      throw new BadRequestException('Não é possível adicionar itens a um PCA já enviado ao PNCP');
    }

    // Gerar número do item
    const ultimoItem = await this.itemPcaRepository.findOne({
      where: { pca_id: pcaId },
      order: { numero_item: 'DESC' }
    });

    const numeroItem = ultimoItem ? ultimoItem.numero_item + 1 : 1;

    const item = this.itemPcaRepository.create({
      ...dados,
      pca_id: pcaId,
      numero_item: numeroItem
    });

    const itemSalvo = await this.itemPcaRepository.save(item);

    // Atualizar totais do PCA
    await this.recalcularTotais(pcaId);

    return itemSalvo;
  }

  // ============ IMPORTAÇÃO COM VERIFICAÇÃO DE DUPLICIDADE ============

  async importarItens(pcaId: string, itens: Partial<ItemPCA>[]): Promise<{
    importados: number;
    duplicados: number;
    erros: number;
    detalhes: { item: string; status: string; motivo?: string; linha?: number; dados?: any }[];
  }> {
    this.logger.log(`[IMPORTAR] ========================================`);
    this.logger.log(`[IMPORTAR] Iniciando importação de ${itens.length} itens para PCA ${pcaId}`);
    
    const pca = await this.findOne(pcaId);

    if (pca.status === StatusPCA.ENVIADO_PNCP) {
      throw new BadRequestException('Não é possível adicionar itens a um PCA já enviado ao PNCP');
    }

    // Buscar itens existentes para verificar duplicidade
    const itensExistentes = await this.itemPcaRepository.find({
      where: { pca_id: pcaId }
    });
    
    this.logger.log(`[IMPORTAR] Itens existentes no PCA: ${itensExistentes.length}`);

    // Criar mapa de itens existentes por código ou descrição
    const mapaCodigos = new Set(
      itensExistentes
        .filter(i => i.codigo_item_catalogo)
        .map(i => i.codigo_item_catalogo)
    );
    
    const mapaDescricoes = new Set(
      itensExistentes.map(i => this.normalizarDescricao(i.descricao_objeto))
    );
    
    this.logger.log(`[IMPORTAR] Códigos existentes: ${mapaCodigos.size}, Descrições existentes: ${mapaDescricoes.size}`);

    // Categorias válidas do enum
    const categoriasValidas = Object.values(CategoriaItemPCA);
    this.logger.log(`[IMPORTAR] Categorias válidas: ${categoriasValidas.join(', ')}`);

    let importados = 0;
    let duplicados = 0;
    let erros = 0;
    const detalhes: { item: string; status: string; motivo?: string; linha?: number; dados?: any }[] = [];

    for (let i = 0; i < itens.length; i++) {
      const itemDados = itens[i];
      const descricaoResumida = (itemDados.descricao_objeto || '').substring(0, 60);
      const linhaCSV = i + 2; // +2 porque linha 1 é cabeçalho e array começa em 0
      
      // Log detalhado para cada item
      this.logger.log(`[IMPORTAR] ----------------------------------------`);
      this.logger.log(`[IMPORTAR] Item ${i + 1}/${itens.length} (linha CSV ${linhaCSV})`);
      this.logger.log(`[IMPORTAR] Descrição: ${descricaoResumida}`);
      this.logger.log(`[IMPORTAR] Categoria recebida: "${itemDados.categoria}"`);
      this.logger.log(`[IMPORTAR] Valor estimado: ${itemDados.valor_estimado}`);
      this.logger.log(`[IMPORTAR] Código item: ${itemDados.codigo_item_catalogo || 'N/A'}`);
      
      try {
        // ===== VALIDAÇÃO 1: Descrição obrigatória =====
        if (!itemDados.descricao_objeto || itemDados.descricao_objeto.trim() === '') {
          erros++;
          const motivo = 'Descrição do objeto é obrigatória';
          this.logger.error(`[IMPORTAR] ERRO linha ${linhaCSV}: ${motivo}`);
          detalhes.push({
            item: `Linha ${linhaCSV}: (sem descrição)`,
            status: 'erro',
            motivo,
            linha: linhaCSV
          });
          continue;
        }

        // ===== VALIDAÇÃO 2: Categoria válida =====
        const categoriaRecebida = itemDados.categoria as string;
        if (!categoriaRecebida || !categoriasValidas.includes(categoriaRecebida as CategoriaItemPCA)) {
          erros++;
          const motivo = `Categoria inválida: "${categoriaRecebida}". Valores aceitos: ${categoriasValidas.join(', ')}`;
          this.logger.error(`[IMPORTAR] ERRO linha ${linhaCSV}: ${motivo}`);
          detalhes.push({
            item: descricaoResumida,
            status: 'erro',
            motivo,
            linha: linhaCSV,
            dados: { categoria_recebida: categoriaRecebida }
          });
          continue;
        }

        // ===== VALIDAÇÃO 3: Valor estimado =====
        const valorEstimado = Number(itemDados.valor_estimado);
        if (isNaN(valorEstimado) || valorEstimado < 0) {
          erros++;
          const motivo = `Valor estimado inválido: "${itemDados.valor_estimado}"`;
          this.logger.error(`[IMPORTAR] ERRO linha ${linhaCSV}: ${motivo}`);
          detalhes.push({
            item: descricaoResumida,
            status: 'erro',
            motivo,
            linha: linhaCSV,
            dados: { valor_recebido: itemDados.valor_estimado }
          });
          continue;
        }

        // ===== VERIFICAÇÃO DE DUPLICIDADE POR CÓDIGO =====
        if (itemDados.codigo_item_catalogo && mapaCodigos.has(itemDados.codigo_item_catalogo)) {
          duplicados++;
          this.logger.warn(`[IMPORTAR] Linha ${linhaCSV} DUPLICADO por código: ${itemDados.codigo_item_catalogo}`);
          detalhes.push({
            item: descricaoResumida,
            status: 'duplicado',
            motivo: `Código ${itemDados.codigo_item_catalogo} já existe`,
            linha: linhaCSV
          });
          continue;
        }

        // ===== VERIFICAÇÃO DE DUPLICIDADE POR DESCRIÇÃO =====
        const descricaoNormalizada = this.normalizarDescricao(itemDados.descricao_objeto || '');
        if (mapaDescricoes.has(descricaoNormalizada)) {
          duplicados++;
          this.logger.warn(`[IMPORTAR] Linha ${linhaCSV} DUPLICADO por descrição similar`);
          detalhes.push({
            item: descricaoResumida,
            status: 'duplicado',
            motivo: 'Descrição similar já existe',
            linha: linhaCSV
          });
          continue;
        }

        // ===== PREPARAR DADOS PARA SALVAR =====
        const dadosParaSalvar: Partial<ItemPCA> = {
          ...itemDados,
          categoria: categoriaRecebida as CategoriaItemPCA,
          valor_estimado: valorEstimado,
          descricao_objeto: itemDados.descricao_objeto.trim()
        };

        this.logger.log(`[IMPORTAR] Linha ${linhaCSV}: Salvando item...`);
        
        // Adicionar item
        await this.adicionarItem(pcaId, dadosParaSalvar);
        importados++;
        
        // Adicionar ao mapa para evitar duplicatas no mesmo lote
        if (itemDados.codigo_item_catalogo) {
          mapaCodigos.add(itemDados.codigo_item_catalogo);
        }
        mapaDescricoes.add(descricaoNormalizada);

        this.logger.log(`[IMPORTAR] Linha ${linhaCSV}: ✓ IMPORTADO com sucesso`);
        detalhes.push({
          item: descricaoResumida,
          status: 'importado',
          linha: linhaCSV
        });

      } catch (error) {
        erros++;
        const errorMessage = error.message || 'Erro desconhecido';
        const errorStack = error.stack || '';
        this.logger.error(`[IMPORTAR] ERRO linha ${linhaCSV}: ${errorMessage}`);
        this.logger.error(`[IMPORTAR] Stack: ${errorStack.substring(0, 500)}`);
        detalhes.push({
          item: descricaoResumida,
          status: 'erro',
          motivo: errorMessage,
          linha: linhaCSV,
          dados: {
            categoria: itemDados.categoria,
            valor_estimado: itemDados.valor_estimado,
            codigo_item: itemDados.codigo_item_catalogo
          }
        });
      }
    }

    this.logger.log(`[IMPORTAR] ========================================`);
    this.logger.log(`[IMPORTAR] RESULTADO FINAL:`);
    this.logger.log(`[IMPORTAR]   ✓ Importados: ${importados}`);
    this.logger.log(`[IMPORTAR]   ⚠ Duplicados: ${duplicados}`);
    this.logger.log(`[IMPORTAR]   ✗ Erros: ${erros}`);
    this.logger.log(`[IMPORTAR] ========================================`);
    
    return { importados, duplicados, erros, detalhes };
  }

  private normalizarDescricao(descricao: string): string {
    return descricao
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-z0-9]/g, '') // Remove caracteres especiais
      .substring(0, 100); // Limita tamanho
  }

  async findItens(pcaId: string, filtros?: {
    categoria?: CategoriaItemPCA;
    status?: StatusItemPCA;
    trimestre?: number;
  }): Promise<ItemPCA[]> {
    const query = this.itemPcaRepository.createQueryBuilder('item')
      .where('item.pca_id = :pcaId', { pcaId });

    if (filtros?.categoria) {
      query.andWhere('item.categoria = :categoria', { categoria: filtros.categoria });
    }

    if (filtros?.status) {
      query.andWhere('item.status = :status', { status: filtros.status });
    }

    if (filtros?.trimestre) {
      query.andWhere('item.trimestre_previsto = :trimestre', { trimestre: filtros.trimestre });
    }

    return query.orderBy('item.numero_item', 'ASC').getMany();
  }

  async findItem(itemId: string): Promise<ItemPCA> {
    const item = await this.itemPcaRepository.findOne({
      where: { id: itemId },
      relations: ['pca']
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    return item;
  }

  async atualizarItem(itemId: string, dados: Partial<ItemPCA>): Promise<ItemPCA> {
    const item = await this.findItem(itemId);

    if (item.pca.status === StatusPCA.ENVIADO_PNCP) {
      throw new BadRequestException('Não é possível alterar itens de um PCA já enviado ao PNCP');
    }

    Object.assign(item, dados);
    const itemSalvo = await this.itemPcaRepository.save(item);

    await this.recalcularTotais(item.pca_id);

    return itemSalvo;
  }

  async alterarStatusItem(itemId: string, status: StatusItemPCA, licitacaoId?: string): Promise<ItemPCA> {
    const item = await this.findItem(itemId);

    item.status = status;
    if (licitacaoId) {
      item.licitacao_id = licitacaoId;
    }

    return this.itemPcaRepository.save(item);
  }

  async removerItem(itemId: string): Promise<void> {
    const item = await this.findItem(itemId);

    if (item.pca.status === StatusPCA.ENVIADO_PNCP) {
      throw new BadRequestException('Não é possível remover itens de um PCA já enviado ao PNCP');
    }

    const pcaId = item.pca_id;
    await this.itemPcaRepository.remove(item);
    await this.recalcularTotais(pcaId);
  }

  async limparItens(pcaId: string): Promise<{ removidos: number }> {
    const pca = await this.findOne(pcaId);

    if (pca.status === StatusPCA.ENVIADO_PNCP) {
      throw new BadRequestException('Não é possível remover itens de um PCA já enviado ao PNCP');
    }

    const itens = await this.itemPcaRepository.find({ where: { pca_id: pcaId } });
    const quantidade = itens.length;

    await this.itemPcaRepository.remove(itens);
    await this.recalcularTotais(pcaId);

    return { removidos: quantidade };
  }

  private async recalcularTotais(pcaId: string): Promise<void> {
    const itens = await this.itemPcaRepository.find({
      where: { pca_id: pcaId, status: StatusItemPCA.PLANEJADO }
    });

    const valorTotal = itens.reduce((sum, item) => sum + Number(item.valor_estimado), 0);
    const quantidadeItens = itens.length;

    await this.pcaRepository.update(pcaId, {
      valor_total_estimado: valorTotal,
      quantidade_itens: quantidadeItens
    });
  }

  // ============ ESTATÍSTICAS ============

  async getEstatisticas(pcaId: string): Promise<{
    porCategoria: Record<string, { quantidade: number; valor: number }>;
    porTrimestre: Record<number, { quantidade: number; valor: number }>;
    porStatus: Record<string, number>;
    porPrioridade: Record<number, number>;
  }> {
    const itens = await this.itemPcaRepository.find({ where: { pca_id: pcaId } });

    const porCategoria: Record<string, { quantidade: number; valor: number }> = {};
    const porTrimestre: Record<number, { quantidade: number; valor: number }> = {};
    const porStatus: Record<string, number> = {};
    const porPrioridade: Record<number, number> = {};

    itens.forEach(item => {
      // Por Categoria
      if (!porCategoria[item.categoria]) {
        porCategoria[item.categoria] = { quantidade: 0, valor: 0 };
      }
      porCategoria[item.categoria].quantidade++;
      porCategoria[item.categoria].valor += Number(item.valor_estimado);

      // Por Trimestre
      if (item.trimestre_previsto) {
        if (!porTrimestre[item.trimestre_previsto]) {
          porTrimestre[item.trimestre_previsto] = { quantidade: 0, valor: 0 };
        }
        porTrimestre[item.trimestre_previsto].quantidade++;
        porTrimestre[item.trimestre_previsto].valor += Number(item.valor_estimado);
      }

      // Por Status
      porStatus[item.status] = (porStatus[item.status] || 0) + 1;

      // Por Prioridade
      porPrioridade[item.prioridade] = (porPrioridade[item.prioridade] || 0) + 1;
    });

    return { porCategoria, porTrimestre, porStatus, porPrioridade };
  }

  async getItensPendentes(orgaoId: string): Promise<ItemPCA[]> {
    const anoAtual = new Date().getFullYear();
    
    return this.itemPcaRepository.createQueryBuilder('item')
      .leftJoinAndSelect('item.pca', 'pca')
      .where('pca.orgao_id = :orgaoId', { orgaoId })
      .andWhere('pca.ano_exercicio = :ano', { ano: anoAtual })
      .andWhere('item.status = :status', { status: StatusItemPCA.PLANEJADO })
      .orderBy('item.prioridade', 'ASC')
      .addOrderBy('item.trimestre_previsto', 'ASC')
      .getMany();
  }

  // ============ IMPORTAÇÃO/EXPORTAÇÃO ============

  async duplicarParaProximoAno(pcaId: string, copiarTodosItens: boolean = true): Promise<PlanoContratacaoAnual> {
    const pcaOriginal = await this.findOne(pcaId);
    const proximoAno = pcaOriginal.ano_exercicio + 1;

    // Verificar se já existe
    const existente = await this.pcaRepository.findOne({
      where: { orgao_id: pcaOriginal.orgao_id, ano_exercicio: proximoAno }
    });

    if (existente) {
      throw new BadRequestException(`Já existe um PCA para o ano ${proximoAno}. Exclua-o primeiro ou edite diretamente.`);
    }

    // Criar novo PCA
    const novoPca = await this.criar({
      orgao_id: pcaOriginal.orgao_id,
      ano_exercicio: proximoAno
    });

    // Copiar itens - por padrão copia TODOS os itens
    // Se copiarTodosItens=false, copia apenas renovações e adiados
    const itensParaCopiar = copiarTodosItens 
      ? pcaOriginal.itens 
      : pcaOriginal.itens.filter(
          item => item.renovacao_contrato || item.status === StatusItemPCA.ADIADO
        );

    for (const item of itensParaCopiar) {
      // Ajustar data_desejada_contratacao para o novo ano (mantendo dia e mês)
      let novaDataDesejada: Date | undefined = undefined;
      if (item.data_desejada_contratacao) {
        const dataOriginal = new Date(item.data_desejada_contratacao);
        novaDataDesejada = new Date(proximoAno, dataOriginal.getMonth(), dataOriginal.getDate());
      }

      await this.adicionarItem(novoPca.id, {
        categoria: item.categoria,
        descricao_objeto: item.descricao_objeto,
        justificativa: item.justificativa,
        codigo_classe: item.codigo_classe,
        nome_classe: item.nome_classe,
        codigo_item_catalogo: item.codigo_item_catalogo,
        descricao_item_catalogo: item.descricao_item_catalogo,
        catalogo_utilizado: item.catalogo_utilizado,
        classificacao_catalogo: item.classificacao_catalogo,
        codigo_grupo: item.codigo_grupo,
        nome_grupo: item.nome_grupo,
        unidade_requisitante: item.unidade_requisitante,
        responsavel_demanda: item.responsavel_demanda,
        email_responsavel: item.email_responsavel,
        valor_estimado: item.valor_estimado,
        valor_unitario_estimado: item.valor_unitario_estimado,
        valor_orcamentario_exercicio: item.valor_orcamentario_exercicio,
        quantidade_estimada: item.quantidade_estimada,
        unidade_medida: item.unidade_medida,
        trimestre_previsto: item.trimestre_previsto,
        data_desejada_contratacao: novaDataDesejada as any,
        modalidade_prevista: item.modalidade_prevista,
        srp: item.srp,
        exclusivo_mpe: item.exclusivo_mpe,
        prioridade: item.prioridade,
        renovacao_contrato: item.renovacao_contrato,
        complexidade: item.complexidade,
        objetivo_estrategico: item.objetivo_estrategico,
        meta_ppa: item.meta_ppa
      });
    }

    return this.findOne(novoPca.id);
  }

  // ============ CONSOLIDAR DEMANDAS ============

  async consolidarDemandas(pcaId: string, demandaIds: string[]): Promise<{
    itensAdicionados: number;
    demandasConsolidadas: number;
  }> {
    const pca = await this.findOne(pcaId);

    if (pca.status === StatusPCA.ENVIADO_PNCP) {
      throw new BadRequestException('Não é possível adicionar itens a um PCA já enviado ao PNCP');
    }

    // Buscar demandas aprovadas
    const demandasRepository = this.pcaRepository.manager.connection.getRepository('Demanda');
    const itemDemandaRepository = this.pcaRepository.manager.connection.getRepository('ItemDemanda');

    let itensAdicionados = 0;
    let demandasConsolidadas = 0;

    for (const demandaId of demandaIds) {
      const demanda = await demandasRepository.findOne({
        where: { id: demandaId },
        relations: ['itens']
      }) as any;

      if (!demanda || demanda.status !== 'APROVADA') {
        continue;
      }

      // Adicionar cada item da demanda ao PCA
      for (const itemDemanda of demanda.itens || []) {
        const novoItem = await this.adicionarItem(pcaId, {
          categoria: itemDemanda.categoria,
          descricao_objeto: itemDemanda.descricao_objeto,
          justificativa: itemDemanda.justificativa,
          codigo_classe: itemDemanda.codigo_classe,
          nome_classe: itemDemanda.nome_classe,
          codigo_item_catalogo: itemDemanda.codigo_item_catalogo,
          catalogo_utilizado: itemDemanda.catalogo_utilizado || 'OUTROS',
          unidade_requisitante: demanda.unidade_requisitante,
          responsavel_demanda: demanda.responsavel_nome,
          email_responsavel: demanda.responsavel_email,
          valor_estimado: itemDemanda.valor_total_estimado,
          valor_unitario_estimado: itemDemanda.valor_unitario_estimado,
          quantidade_estimada: itemDemanda.quantidade_estimada,
          unidade_medida: itemDemanda.unidade_medida,
          trimestre_previsto: itemDemanda.trimestre_previsto,
          prioridade: itemDemanda.prioridade,
          renovacao_contrato: itemDemanda.renovacao_contrato ? 'SIM' : 'NAO',
          data_desejada_contratacao: itemDemanda.data_desejada_contratacao
        });

        // Vincular item da demanda ao item do PCA
        await itemDemandaRepository.update(itemDemanda.id, { item_pca_id: novoItem.id });
        itensAdicionados++;
      }

      // Marcar demanda como consolidada
      await demandasRepository.update(demandaId, { 
        status: 'CONSOLIDADA',
        pca_id: pcaId
      });
      demandasConsolidadas++;
    }

    return { itensAdicionados, demandasConsolidadas };
  }

  // Buscar itens do PCA por órgão (para vinculação em licitações)
  async buscarItensPorOrgao(orgaoId: string, ano?: number): Promise<ItemPCA[]> {
    const anoFiltro = ano || new Date().getFullYear();
    
    const query = this.itemPcaRepository.createQueryBuilder('item')
      .leftJoinAndSelect('item.pca', 'pca')
      .where('pca.orgao_id = :orgaoId', { orgaoId })
      .andWhere('pca.ano_exercicio = :ano', { ano: anoFiltro })
      .andWhere('item.status IN (:...status)', { 
        status: [StatusItemPCA.PLANEJADO, StatusItemPCA.EM_PREPARACAO] 
      })
      .orderBy('item.descricao_objeto', 'ASC');

    return query.getMany();
  }

  // ============ MATCHING INTELIGENTE PARA IMPORTAÇÃO ============

  /**
   * Busca itens similares por descrição para enriquecer dados de importação
   * Retorna o item mais similar encontrado ou null
   */
  async buscarItemSimilar(orgaoId: string, descricao: string, anoReferencia?: number): Promise<ItemPCA | null> {
    if (!descricao || descricao.trim().length < 10) {
      return null;
    }

    const descricaoNormalizada = this.normalizarDescricao(descricao);
    
    // Buscar em todos os PCAs do órgão (prioriza ano atual e anterior)
    const anosParaBuscar = anoReferencia 
      ? [anoReferencia, anoReferencia - 1, anoReferencia + 1]
      : [new Date().getFullYear(), new Date().getFullYear() - 1];

    for (const ano of anosParaBuscar) {
      const itens = await this.itemPcaRepository.createQueryBuilder('item')
        .leftJoinAndSelect('item.pca', 'pca')
        .where('pca.orgao_id = :orgaoId', { orgaoId })
        .andWhere('pca.ano_exercicio = :ano', { ano })
        .getMany();

      // Buscar por descrição normalizada similar
      for (const item of itens) {
        const itemDescNorm = this.normalizarDescricao(item.descricao_objeto);
        
        // Match exato
        if (itemDescNorm === descricaoNormalizada) {
          this.logger.log(`[MATCHING] Match exato encontrado: "${descricao.substring(0, 50)}..."`);
          return item;
        }
        
        // Match parcial (80% de similaridade)
        const similaridade = this.calcularSimilaridade(descricaoNormalizada, itemDescNorm);
        if (similaridade > 0.8) {
          this.logger.log(`[MATCHING] Match parcial (${(similaridade * 100).toFixed(0)}%): "${descricao.substring(0, 50)}..."`);
          return item;
        }
      }
    }

    return null;
  }

  /**
   * Busca múltiplos itens similares para uma lista de descrições
   * Retorna mapa de descrição -> item encontrado
   */
  async buscarItensSimilares(
    orgaoId: string, 
    descricoes: string[], 
    anoReferencia?: number
  ): Promise<Map<string, ItemPCA | null>> {
    this.logger.log(`[MATCHING] Buscando matches para ${descricoes.length} itens`);
    
    const resultado = new Map<string, ItemPCA | null>();
    
    // Carregar todos os itens do órgão uma vez
    const anosParaBuscar = anoReferencia 
      ? [anoReferencia, anoReferencia - 1]
      : [new Date().getFullYear(), new Date().getFullYear() - 1];

    const todosItens: ItemPCA[] = [];
    for (const ano of anosParaBuscar) {
      const itens = await this.itemPcaRepository.createQueryBuilder('item')
        .leftJoinAndSelect('item.pca', 'pca')
        .where('pca.orgao_id = :orgaoId', { orgaoId })
        .andWhere('pca.ano_exercicio = :ano', { ano })
        .getMany();
      todosItens.push(...itens);
    }

    this.logger.log(`[MATCHING] ${todosItens.length} itens existentes carregados para comparação`);

    // Criar mapa de descrições normalizadas
    const mapaItensExistentes = new Map<string, ItemPCA>();
    for (const item of todosItens) {
      const descNorm = this.normalizarDescricao(item.descricao_objeto);
      if (!mapaItensExistentes.has(descNorm)) {
        mapaItensExistentes.set(descNorm, item);
      }
    }

    // Buscar matches para cada descrição
    let matchesEncontrados = 0;
    for (const descricao of descricoes) {
      const descNorm = this.normalizarDescricao(descricao);
      
      // Match exato primeiro
      if (mapaItensExistentes.has(descNorm)) {
        resultado.set(descricao, mapaItensExistentes.get(descNorm)!);
        matchesEncontrados++;
        continue;
      }

      // Match parcial
      let melhorMatch: ItemPCA | null = null;
      let melhorSimilaridade = 0;

      for (const [itemDescNorm, item] of mapaItensExistentes) {
        const similaridade = this.calcularSimilaridade(descNorm, itemDescNorm);
        if (similaridade > 0.75 && similaridade > melhorSimilaridade) {
          melhorSimilaridade = similaridade;
          melhorMatch = item;
        }
      }

      resultado.set(descricao, melhorMatch);
      if (melhorMatch) matchesEncontrados++;
    }

    this.logger.log(`[MATCHING] ${matchesEncontrados}/${descricoes.length} matches encontrados`);
    return resultado;
  }

  /**
   * Calcula similaridade entre duas strings normalizadas (0-1)
   * Usa algoritmo de Jaccard com n-gramas
   */
  private calcularSimilaridade(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (!str1 || !str2) return 0;

    // Usar trigramas para comparação
    const trigramas1 = this.gerarNGramas(str1, 3);
    const trigramas2 = this.gerarNGramas(str2, 3);

    const intersecao = trigramas1.filter(t => trigramas2.includes(t)).length;
    const uniao = new Set([...trigramas1, ...trigramas2]).size;

    return uniao > 0 ? intersecao / uniao : 0;
  }

  private gerarNGramas(str: string, n: number): string[] {
    const ngramas: string[] = [];
    for (let i = 0; i <= str.length - n; i++) {
      ngramas.push(str.substring(i, i + n));
    }
    return ngramas;
  }

  /**
   * Importação inteligente: enriquece itens incompletos com dados de itens existentes
   */
  async importarItensInteligente(
    pcaId: string, 
    itens: { descricao: string; quantidade?: number; valor_unitario?: number; valor_total?: number; unidade?: string; renovacao?: string; data_desejada?: string }[]
  ): Promise<{
    importados: number;
    enriquecidos: number;
    novos: number;
    erros: number;
    detalhes: { descricao: string; status: string; motivo?: string; itemBase?: string }[];
  }> {
    this.logger.log(`[IMPORT-INTELIGENTE] ========================================`);
    this.logger.log(`[IMPORT-INTELIGENTE] Iniciando importação inteligente de ${itens.length} itens`);

    const pca = await this.findOne(pcaId);
    if (pca.status === StatusPCA.ENVIADO_PNCP) {
      throw new BadRequestException('Não é possível adicionar itens a um PCA já enviado ao PNCP');
    }

    // Buscar orgaoId do próprio PCA (não receber do frontend)
    const orgaoId = pca.orgao_id;

    // Buscar matches para todas as descrições
    const descricoes = itens.map(i => i.descricao);
    const matches = await this.buscarItensSimilares(orgaoId, descricoes, pca.ano_exercicio);

    let importados = 0;
    let enriquecidos = 0;
    let novos = 0;
    let erros = 0;
    const detalhes: { descricao: string; status: string; motivo?: string; itemBase?: string }[] = [];

    for (const item of itens) {
      const descricaoResumida = item.descricao.substring(0, 60);
      
      try {
        const itemExistente = matches.get(item.descricao);
        
        // Preparar dados do item
        // Converter data sem problema de fuso horário
        let dataDesejada: Date | undefined = undefined;
        if (item.data_desejada) {
          this.logger.log(`[IMPORT-INTELIGENTE] Data recebida: "${item.data_desejada}"`);
          
          // Formato esperado: yyyy-mm-dd
          const match = item.data_desejada.match(/(\d{4})-(\d{2})-(\d{2})/);
          if (match) {
            const ano = parseInt(match[1]);
            const mes = parseInt(match[2]) - 1; // JavaScript meses são 0-indexed
            const dia = parseInt(match[3]);
            
            // Criar data usando componentes locais (não UTC)
            dataDesejada = new Date(ano, mes, dia, 12, 0, 0);
            this.logger.log(`[IMPORT-INTELIGENTE] Data convertida: ano=${ano}, mes=${mes+1}, dia=${dia} -> ${dataDesejada.toISOString()}`);
          } else {
            this.logger.warn(`[IMPORT-INTELIGENTE] Data não reconhecida: "${item.data_desejada}"`);
          }
        }

        const dadosItem: Partial<ItemPCA> = {
          descricao_objeto: item.descricao,
          quantidade_estimada: item.quantidade || 1,
          valor_unitario_estimado: item.valor_unitario || 0,
          valor_estimado: item.valor_total || (item.valor_unitario || 0) * (item.quantidade || 1),
          unidade_medida: item.unidade || 'UN',
          renovacao_contrato: item.renovacao?.toLowerCase().includes('sim') ? 'SIM' : 'NAO',
          data_desejada_contratacao: dataDesejada,
        };

        if (itemExistente) {
          // Enriquecer com dados do item existente
          dadosItem.categoria = itemExistente.categoria;
          dadosItem.catalogo_utilizado = itemExistente.catalogo_utilizado;
          dadosItem.classificacao_catalogo = itemExistente.classificacao_catalogo;
          dadosItem.codigo_classe = itemExistente.codigo_classe;
          dadosItem.nome_classe = itemExistente.nome_classe;
          dadosItem.codigo_pdm = itemExistente.codigo_pdm;
          dadosItem.nome_pdm = itemExistente.nome_pdm;
          dadosItem.codigo_item_catalogo = itemExistente.codigo_item_catalogo;
          dadosItem.descricao_item_catalogo = itemExistente.descricao_item_catalogo;
          dadosItem.codigo_grupo = itemExistente.codigo_grupo;
          dadosItem.nome_grupo = itemExistente.nome_grupo;
          dadosItem.unidade_requisitante = itemExistente.unidade_requisitante;
          dadosItem.justificativa = itemExistente.justificativa || `Baseado em: ${itemExistente.descricao_objeto.substring(0, 100)}`;
          
          this.logger.log(`[IMPORT-INTELIGENTE] ✓ Enriquecido: "${descricaoResumida}..." com dados de item existente`);
          enriquecidos++;
          
          detalhes.push({
            descricao: descricaoResumida,
            status: 'enriquecido',
            itemBase: itemExistente.descricao_objeto.substring(0, 50)
          });
        } else {
          // Item novo - usar categoria padrão SERVICO
          dadosItem.categoria = CategoriaItemPCA.SERVICO;
          dadosItem.catalogo_utilizado = 'OUTROS';
          dadosItem.justificativa = 'Item novo - classificação pendente';
          
          this.logger.log(`[IMPORT-INTELIGENTE] + Novo: "${descricaoResumida}..." (sem match encontrado)`);
          novos++;
          
          detalhes.push({
            descricao: descricaoResumida,
            status: 'novo',
            motivo: 'Nenhum item similar encontrado - classificação padrão aplicada'
          });
        }

        await this.adicionarItem(pcaId, dadosItem);
        importados++;

      } catch (error) {
        erros++;
        this.logger.error(`[IMPORT-INTELIGENTE] ✗ Erro: "${descricaoResumida}..." - ${error.message}`);
        detalhes.push({
          descricao: descricaoResumida,
          status: 'erro',
          motivo: error.message
        });
      }
    }

    this.logger.log(`[IMPORT-INTELIGENTE] ========================================`);
    this.logger.log(`[IMPORT-INTELIGENTE] RESULTADO:`);
    this.logger.log(`[IMPORT-INTELIGENTE]   Total importados: ${importados}`);
    this.logger.log(`[IMPORT-INTELIGENTE]   - Enriquecidos: ${enriquecidos}`);
    this.logger.log(`[IMPORT-INTELIGENTE]   - Novos: ${novos}`);
    this.logger.log(`[IMPORT-INTELIGENTE]   Erros: ${erros}`);
    this.logger.log(`[IMPORT-INTELIGENTE] ========================================`);

    return { importados, enriquecidos, novos, erros, detalhes };
  }
}
