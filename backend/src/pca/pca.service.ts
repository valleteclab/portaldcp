import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlanoContratacaoAnual, ItemPCA, StatusPCA, StatusItemPCA, CategoriaItemPCA } from './entities/pca.entity';

@Injectable()
export class PcaService {
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
    detalhes: { item: string; status: string; motivo?: string }[];
  }> {
    const pca = await this.findOne(pcaId);

    if (pca.status === StatusPCA.ENVIADO_PNCP) {
      throw new BadRequestException('Não é possível adicionar itens a um PCA já enviado ao PNCP');
    }

    // Buscar itens existentes para verificar duplicidade
    const itensExistentes = await this.itemPcaRepository.find({
      where: { pca_id: pcaId }
    });

    // Criar mapa de itens existentes por código ou descrição
    const mapaCodigos = new Set(
      itensExistentes
        .filter(i => i.codigo_item_catalogo)
        .map(i => i.codigo_item_catalogo)
    );
    
    const mapaDescricoes = new Set(
      itensExistentes.map(i => this.normalizarDescricao(i.descricao_objeto))
    );

    let importados = 0;
    let duplicados = 0;
    let erros = 0;
    const detalhes: { item: string; status: string; motivo?: string }[] = [];

    for (const itemDados of itens) {
      const descricaoResumida = (itemDados.descricao_objeto || '').substring(0, 60);
      
      try {
        // Verificar duplicidade por código
        if (itemDados.codigo_item_catalogo && mapaCodigos.has(itemDados.codigo_item_catalogo)) {
          duplicados++;
          detalhes.push({
            item: descricaoResumida,
            status: 'duplicado',
            motivo: `Código ${itemDados.codigo_item_catalogo} já existe`
          });
          continue;
        }

        // Verificar duplicidade por descrição similar
        const descricaoNormalizada = this.normalizarDescricao(itemDados.descricao_objeto || '');
        if (mapaDescricoes.has(descricaoNormalizada)) {
          duplicados++;
          detalhes.push({
            item: descricaoResumida,
            status: 'duplicado',
            motivo: 'Descrição similar já existe'
          });
          continue;
        }

        // Adicionar item
        await this.adicionarItem(pcaId, itemDados);
        importados++;
        
        // Adicionar ao mapa para evitar duplicatas no mesmo lote
        if (itemDados.codigo_item_catalogo) {
          mapaCodigos.add(itemDados.codigo_item_catalogo);
        }
        mapaDescricoes.add(descricaoNormalizada);

        detalhes.push({
          item: descricaoResumida,
          status: 'importado'
        });

      } catch (error) {
        erros++;
        detalhes.push({
          item: descricaoResumida,
          status: 'erro',
          motivo: error.message || 'Erro desconhecido'
        });
      }
    }

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

  async duplicarParaProximoAno(pcaId: string): Promise<PlanoContratacaoAnual> {
    const pcaOriginal = await this.findOne(pcaId);
    const proximoAno = pcaOriginal.ano_exercicio + 1;

    // Verificar se já existe
    const existente = await this.pcaRepository.findOne({
      where: { orgao_id: pcaOriginal.orgao_id, ano_exercicio: proximoAno }
    });

    if (existente) {
      throw new BadRequestException(`Já existe um PCA para o ano ${proximoAno}`);
    }

    // Criar novo PCA
    const novoPca = await this.criar({
      orgao_id: pcaOriginal.orgao_id,
      ano_exercicio: proximoAno
    });

    // Copiar itens que são renovação ou não foram contratados
    const itensParaCopiar = pcaOriginal.itens.filter(
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
}
