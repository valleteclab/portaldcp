import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlanoContratacaoAnual, ItemPCA, StatusPCA, StatusItemPCA, CategoriaItemPCA } from './entities/pca.entity';
import { ItemCatalogoProprio } from '../catalogo/entities/catalogo-proprio.entity';

@Injectable()
export class PcaService {
  private readonly logger = new Logger(PcaService.name);

  constructor(
    @InjectRepository(PlanoContratacaoAnual)
    private pcaRepository: Repository<PlanoContratacaoAnual>,
    @InjectRepository(ItemPCA)
    private itemPcaRepository: Repository<ItemPCA>,
    @InjectRepository(ItemCatalogoProprio)
    private itemCatalogoRepository: Repository<ItemCatalogoProprio>,
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

    await this.repararCodigosItensConsolidados(pca);

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

    await this.repararCodigosItensConsolidados(pca);

    // Ordenar itens por numero_item
    if (pca.itens && pca.itens.length > 0) {
      pca.itens.sort((a, b) => (a.numero_item || 0) - (b.numero_item || 0));
    }

    return pca;
  }

  private async repararCodigosItensConsolidados(pca: PlanoContratacaoAnual): Promise<void> {
    if (pca.status === StatusPCA.ENVIADO_PNCP || !pca.itens?.length) return;

    const itensSemCodigo = pca.itens.filter((item) =>
      !item.codigo_item_catalogo && !(item.codigo_classe && item.unidade_medida === 'VB')
    );
    if (itensSemCodigo.length === 0) return;

    const itemDemandaRepository = this.pcaRepository.manager.connection.getRepository('ItemDemanda');

    for (const itemPca of itensSemCodigo) {
      const itensDemanda = await itemDemandaRepository.find({
        where: { item_pca_id: itemPca.id } as any,
      }) as any[];

      const codigos = new Set(
        itensDemanda
          .map((item) => item.codigo_item_catalogo?.trim())
          .filter(Boolean),
      );

      if (codigos.size !== 1) continue;

      const descricoes = new Set(
        itensDemanda
          .map((item) => item.descricao_objeto?.trim())
          .filter(Boolean),
      );
      const catalogos = new Set(
        itensDemanda
          .map((item) => item.catalogo_utilizado?.trim())
          .filter(Boolean),
      );

      itemPca.codigo_item_catalogo = Array.from(codigos)[0];
      if (!itemPca.descricao_item_catalogo && descricoes.size === 1) {
        itemPca.descricao_item_catalogo = Array.from(descricoes)[0];
      }
      if (catalogos.size === 1) {
        itemPca.catalogo_utilizado = Array.from(catalogos)[0] as any;
      }

      await this.itemPcaRepository.save(itemPca);
      this.logger.log(`[PCA] Código de item reparado na consolidação: ${itemPca.id} -> ${itemPca.codigo_item_catalogo}`);
    }
  }

  async findPublicoPorCnpjEAno(cnpj: string, ano: number): Promise<Record<string, unknown>> {
    const cnpjLimpo = (cnpj || '').replace(/\D/g, '');

    if (!cnpjLimpo || !ano) {
      throw new BadRequestException('Informe o CNPJ do órgão e o ano do PCA');
    }

    const pca = await this.pcaRepository.createQueryBuilder('pca')
      .leftJoinAndSelect('pca.orgao', 'orgao')
      .leftJoinAndSelect('pca.itens', 'itens')
      .where("regexp_replace(orgao.cnpj, '\\D', '', 'g') = :cnpj", { cnpj: cnpjLimpo })
      .andWhere('pca.ano_exercicio = :ano', { ano })
      .andWhere('pca.status IN (:...statusPublicos)', {
        statusPublicos: [StatusPCA.PUBLICADO, StatusPCA.ENVIADO_PNCP],
      })
      .orderBy('itens.numero_item', 'ASC')
      .getOne();

    if (!pca) {
      throw new NotFoundException('PCA público não encontrado');
    }

    if (pca.itens && pca.itens.length > 0) {
      pca.itens.sort((a, b) => (a.numero_item || 0) - (b.numero_item || 0));
    }

    return this.serializarPcaPublico(pca);
  }

  async listarPublicosPorCnpj(cnpj: string): Promise<Record<string, unknown>> {
    const cnpjLimpo = (cnpj || '').replace(/\D/g, '');

    if (!cnpjLimpo) {
      throw new BadRequestException('Informe o CNPJ do órgão');
    }

    const pcas = await this.pcaRepository.createQueryBuilder('pca')
      .leftJoinAndSelect('pca.orgao', 'orgao')
      .where("regexp_replace(orgao.cnpj, '\\D', '', 'g') = :cnpj", { cnpj: cnpjLimpo })
      .andWhere('pca.status IN (:...statusPublicos)', {
        statusPublicos: [StatusPCA.PUBLICADO, StatusPCA.ENVIADO_PNCP],
      })
      .orderBy('pca.ano_exercicio', 'DESC')
      .getMany();

    if (pcas.length === 0) {
      throw new NotFoundException('Nenhum PCA público encontrado para este órgão');
    }

    const orgao = pcas[0].orgao;

    return {
      orgao: {
        nome: orgao?.nome,
        cnpj: orgao?.cnpj,
        tipo: orgao?.tipo,
        esfera: orgao?.esfera,
        cidade: orgao?.cidade,
        uf: orgao?.uf,
        logo_url: orgao?.logo_url,
      },
      pcas: pcas.map((pca) => ({
        id: pca.id,
        numero_pca: pca.numero_pca,
        ano_exercicio: pca.ano_exercicio,
        status: pca.status,
        data_publicacao: pca.data_publicacao,
        updated_at: pca.updated_at,
        valor_total_estimado: pca.valor_total_estimado,
        quantidade_itens: pca.quantidade_itens,
        codigo_unidade: pca.codigo_unidade,
        nome_unidade: pca.nome_unidade,
      })),
    };
  }

  private serializarPcaPublico(pca: PlanoContratacaoAnual): Record<string, unknown> {
    return {
      id: pca.id,
      numero_pca: pca.numero_pca,
      ano_exercicio: pca.ano_exercicio,
      status: pca.status,
      data_publicacao: pca.data_publicacao,
      updated_at: pca.updated_at,
      valor_total_estimado: pca.valor_total_estimado,
      quantidade_itens: pca.quantidade_itens,
      codigo_unidade: pca.codigo_unidade,
      nome_unidade: pca.nome_unidade,
      orgao: {
        nome: pca.orgao?.nome,
        cnpj: pca.orgao?.cnpj,
        tipo: pca.orgao?.tipo,
        esfera: pca.orgao?.esfera,
        cidade: pca.orgao?.cidade,
        uf: pca.orgao?.uf,
        logo_url: pca.orgao?.logo_url,
      },
      itens: (pca.itens || []).map((item) => ({
        id: item.id,
        numero_item: item.numero_item,
        categoria: item.categoria,
        status: item.status,
        descricao_objeto: item.descricao_objeto,
        catalogo_utilizado: item.catalogo_utilizado,
        classificacao_catalogo: item.classificacao_catalogo,
        codigo_classe: item.codigo_classe,
        nome_classe: item.nome_classe,
        codigo_pdm: item.codigo_pdm,
        nome_pdm: item.nome_pdm,
        codigo_item_catalogo: item.codigo_item_catalogo,
        unidade_medida: item.unidade_medida,
        quantidade_estimada: item.quantidade_estimada,
        valor_unitario_estimado: item.valor_unitario_estimado,
        valor_estimado: item.valor_estimado,
        valor_orcamentario_exercicio: item.valor_orcamentario_exercicio,
        renovacao_contrato: item.renovacao_contrato,
        trimestre_previsto: item.trimestre_previsto,
        unidade_requisitante: item.unidade_requisitante,
        identificador_contratacao: item.identificador_contratacao,
        nome_contratacao: item.nome_contratacao,
        codigo_grupo: item.codigo_grupo,
        nome_grupo: item.nome_grupo,
      })),
    };
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

    const demandasRepository = this.pcaRepository.manager.connection.getRepository('Demanda');
    const itemDemandaRepository = this.pcaRepository.manager.connection.getRepository('ItemDemanda');

    const demandasConsolidadas = await demandasRepository.find({
      where: { pca_id: id } as any,
    }) as any[];

    if (demandasConsolidadas.length > 0) {
      await itemDemandaRepository
        .createQueryBuilder()
        .update()
        .set({ item_pca_id: null } as any)
        .where('demanda_id IN (:...demandaIds)', { demandaIds: demandasConsolidadas.map((demanda) => demanda.id) })
        .execute();

      await demandasRepository
        .createQueryBuilder()
        .update()
        .set({ status: 'APROVADA', pca_id: null } as any)
        .where('pca_id = :pcaId', { pcaId: id })
        .execute();
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

  private montarIdentificadorContratacao(pca: PlanoContratacaoAnual, numeroItem: number): string {
    const unidade = (pca.codigo_unidade || pca.nome_unidade || '1').toString().replace(/\D/g, '') || '1';
    return `${unidade}-${numeroItem}/${pca.ano_exercicio}`;
  }

  private montarNomeContratacao(grupo: {
    categoria: string;
    codigo_classe: string;
    nome_classe: string;
  }): string {
    const nomeClasse = grupo.nome_classe || 'Itens sem classificacao';
    const acao = grupo.categoria === CategoriaItemPCA.MATERIAL || grupo.categoria === 'MATERIAL'
      ? 'Aquisição de'
      : 'Contratação de';

    return `${acao} ${nomeClasse}`;
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

    // Limpar campos que não devem ser atualizados diretamente
    const dadosLimpos = { ...dados };
    delete (dadosLimpos as any).pca;
    delete (dadosLimpos as any).id;
    delete (dadosLimpos as any).pca_id;
    delete (dadosLimpos as any).created_at;
    delete (dadosLimpos as any).updated_at;

    // Converter valores numéricos se vierem como string
    if (dadosLimpos.valor_estimado !== undefined) {
      dadosLimpos.valor_estimado = Number(dadosLimpos.valor_estimado) || 0;
    }
    if (dadosLimpos.valor_unitario_estimado !== undefined) {
      dadosLimpos.valor_unitario_estimado = Number(dadosLimpos.valor_unitario_estimado) || 0;
    }
    if (dadosLimpos.quantidade_estimada !== undefined) {
      dadosLimpos.quantidade_estimada = Number(dadosLimpos.quantidade_estimada) || 1;
    }
    if (dadosLimpos.valor_orcamentario_exercicio !== undefined) {
      dadosLimpos.valor_orcamentario_exercicio = dadosLimpos.valor_orcamentario_exercicio ? Number(dadosLimpos.valor_orcamentario_exercicio) : undefined;
    }
    if (dadosLimpos.trimestre_previsto !== undefined) {
      dadosLimpos.trimestre_previsto = Number(dadosLimpos.trimestre_previsto) || 1;
    }
    if (dadosLimpos.prioridade !== undefined) {
      dadosLimpos.prioridade = Number(dadosLimpos.prioridade) || 3;
    }

    this.logger.log(`[ATUALIZAR-ITEM] Atualizando item ${itemId} com dados:`, JSON.stringify(dadosLimpos));

    // Gerar código do item automaticamente se classificação foi definida mas código está vazio
    if (dadosLimpos.codigo_classe && !dadosLimpos.codigo_item_catalogo && !item.codigo_item_catalogo) {
      // Usar categoria do item (existente ou nova)
      const categoria = dadosLimpos.categoria || item.categoria;
      const codigoGerado = await this.gerarCodigoItemCatalogo(dadosLimpos.codigo_classe, categoria);
      dadosLimpos.codigo_item_catalogo = codigoGerado;
      this.logger.log(`[ATUALIZAR-ITEM] Código do item gerado automaticamente: ${codigoGerado}`);
    }

    try {
      Object.assign(item, dadosLimpos);
      const itemSalvo = await this.itemPcaRepository.save(item);
      await this.recalcularTotais(item.pca_id);
      return itemSalvo;
    } catch (error) {
      this.logger.error(`[ATUALIZAR-ITEM] Erro ao salvar item ${itemId}:`, error.message);
      throw new BadRequestException(`Erro ao atualizar item: ${error.message}`);
    }
  }

  /**
   * Gera código único para item do catálogo baseado na classe e categoria
   * Formato: PREFIXO + CLASSE(4 dígitos) + SEQUENCIAL(4 dígitos)
   * Exemplos: M15000001 (Material classe 1500), S08000001 (Serviço classe 800)
   */
  private async gerarCodigoItemCatalogo(codigoClasse: string, categoria?: CategoriaItemPCA): Promise<string> {
    // Prefixo: M para Material, S para Serviço
    const prefixo = categoria === CategoriaItemPCA.MATERIAL ? 'M' : 'S';
    
    // Normalizar código da classe para 4 dígitos (ex: 800 -> 0800, 1500 -> 1500)
    const classeNormalizada = codigoClasse.padStart(4, '0');
    
    // Padrão de busca: prefixo + classe normalizada + 4 dígitos
    const pattern = `${prefixo}${classeNormalizada}%`;
    
    // Buscar último código usado para esta classe
    const ultimoItem = await this.itemPcaRepository
      .createQueryBuilder('item')
      .where('item.codigo_item_catalogo LIKE :pattern', { pattern })
      .orderBy('item.codigo_item_catalogo', 'DESC')
      .getOne();

    let sequencial = 1;
    if (ultimoItem?.codigo_item_catalogo) {
      // Extrair os últimos 4 dígitos como sequencial
      const match = ultimoItem.codigo_item_catalogo.match(/(\d{4})$/);
      if (match) {
        sequencial = parseInt(match[1]) + 1;
      }
    }

    return `${prefixo}${classeNormalizada}${sequencial.toString().padStart(4, '0')}`;
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
        identificador_contratacao: item.identificador_contratacao,
        nome_contratacao: item.nome_contratacao,
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

    const demandasRepository = this.pcaRepository.manager.connection.getRepository('Demanda');
    const itemDemandaRepository = this.pcaRepository.manager.connection.getRepository('ItemDemanda');

    let demandasConsolidadas = 0;

    // ── Coletar TODOS os itens das demandas selecionadas ──────────────────────
    type ItemComDemanda = {
      item: any;
      demanda: any;
    };
    const todosItens: ItemComDemanda[] = [];

    for (const demandaId of demandaIds) {
      const demanda = await demandasRepository.findOne({
        where: { id: demandaId },
        relations: ['itens'],
      }) as any;

      if (!demanda || demanda.status !== 'APROVADA') continue;

      for (const item of demanda.itens || []) {
        todosItens.push({ item, demanda });
      }
      demandasConsolidadas++;
    }

    // ── Agrupar por classificação (codigo_classe + nome_classe + categoria) ──
    // Itens sem classificação viram grupos individuais (chave = código do item)
    type GrupoClassificacao = {
      codigo_classe: string;
      nome_classe: string;
      categoria: string;
      valor_total: number;
      quantidade_total: number;
      unidade_medida: string;
      prioridade: number; // menor = mais prioritário
      trimestre_previsto: number;
      data_desejada_contratacao?: Date | string;
      renovacao_contrato: boolean;
      justificativas: string[];
      itens_demanda_ids: string[];
      unidades_requisitantes: string[];
      responsaveis: { nome?: string; email?: string }[];
      codigos_item_catalogo: Set<string>;
      descricoes_item_catalogo: Set<string>;
      catalogos_utilizados: Set<string>;
    };

    const grupos = new Map<string, GrupoClassificacao>();

    for (const { item, demanda } of todosItens) {
      // Chave de agrupamento: classificação ou, se ausente, o próprio código do item
      const chave = item.codigo_classe
        ? `classe:${item.codigo_classe}:${item.categoria || 'SERVICO'}`
        : `item:${item.id}`;

      if (!grupos.has(chave)) {
        grupos.set(chave, {
          codigo_classe: item.codigo_classe || '',
          nome_classe: item.nome_classe || item.descricao_objeto,
          categoria: item.categoria || 'SERVICO',
          valor_total: 0,
          quantidade_total: 0,
          unidade_medida: item.unidade_medida || 'UN',
          prioridade: item.prioridade || 3,
          trimestre_previsto: item.trimestre_previsto || 1,
          data_desejada_contratacao: item.data_desejada_contratacao || demanda.data_desejada_contratacao,
          renovacao_contrato: !!(item.renovacao_contrato || demanda.renovacao_contrato),
          justificativas: [],
          itens_demanda_ids: [],
          unidades_requisitantes: [],
          responsaveis: [],
          codigos_item_catalogo: new Set<string>(),
          descricoes_item_catalogo: new Set<string>(),
          catalogos_utilizados: new Set<string>(),
        });
      }

      const grupo = grupos.get(chave)!;
      grupo.valor_total += Number(item.valor_total_estimado) || 0;
      grupo.quantidade_total += Number(item.quantidade_estimada) || 1;
      if (item.prioridade < grupo.prioridade) grupo.prioridade = item.prioridade;
      if (item.trimestre_previsto < grupo.trimestre_previsto)
        grupo.trimestre_previsto = item.trimestre_previsto;
      const dataDesejada = item.data_desejada_contratacao || demanda.data_desejada_contratacao;
      if (dataDesejada && (!grupo.data_desejada_contratacao || new Date(dataDesejada) < new Date(grupo.data_desejada_contratacao))) {
        grupo.data_desejada_contratacao = dataDesejada;
      }
      grupo.renovacao_contrato = grupo.renovacao_contrato || !!(item.renovacao_contrato || demanda.renovacao_contrato);
      if (item.justificativa?.trim())
        grupo.justificativas.push(item.justificativa.trim());
      grupo.itens_demanda_ids.push(item.id);
      if (item.codigo_item_catalogo?.trim()) {
        grupo.codigos_item_catalogo.add(item.codigo_item_catalogo.trim());
      }
      if (item.descricao_objeto?.trim()) {
        grupo.descricoes_item_catalogo.add(item.descricao_objeto.trim());
      }
      if (item.catalogo_utilizado?.trim()) {
        grupo.catalogos_utilizados.add(item.catalogo_utilizado.trim());
      }
      if (demanda.unidade_requisitante && !grupo.unidades_requisitantes.includes(demanda.unidade_requisitante))
        grupo.unidades_requisitantes.push(demanda.unidade_requisitante);
      if (demanda.responsavel_nome)
        grupo.responsaveis.push({ nome: demanda.responsavel_nome, email: demanda.responsavel_email });
    }

    // ── Criar um ItemPCA por grupo de classificação ───────────────────────────
    let itensAdicionados = 0;
    let proximoNumeroContratacao = Math.max(0, ...(pca.itens || []).map((item) => item.numero_item || 0)) + 1;

    for (const [, grupo] of grupos) {
      const descricaoObj = grupo.nome_classe
        ? `${grupo.categoria === 'MATERIAL' ? 'Aquisição de' : 'Contratação de'} ${grupo.nome_classe}`
        : 'Item sem classificação';

      const justificativa = grupo.justificativas.length
        ? [...new Set(grupo.justificativas)].join(' | ')
        : undefined;
      const codigoItemCatalogo =
        !grupo.codigo_classe && grupo.codigos_item_catalogo.size === 1 ? Array.from(grupo.codigos_item_catalogo)[0] : undefined;
      const descricaoItemCatalogo =
        !grupo.codigo_classe && grupo.descricoes_item_catalogo.size === 1 ? Array.from(grupo.descricoes_item_catalogo)[0] : undefined;
      const catalogoUtilizado =
        grupo.catalogos_utilizados.size === 1 ? Array.from(grupo.catalogos_utilizados)[0] : 'COMPRASGOV';
      const identificadorContratacao = this.montarIdentificadorContratacao(pca, proximoNumeroContratacao);
      const nomeContratacao = this.montarNomeContratacao(grupo);

      const novoItemPca = await this.adicionarItem(pcaId, {
        categoria: grupo.categoria as any,
        descricao_objeto: descricaoObj,
        justificativa,
        codigo_classe: grupo.codigo_classe || undefined,
        nome_classe: grupo.nome_classe || undefined,
        catalogo_utilizado: catalogoUtilizado as any,
        codigo_item_catalogo: codigoItemCatalogo,
        descricao_item_catalogo: descricaoItemCatalogo,
        identificador_contratacao: identificadorContratacao,
        nome_contratacao: nomeContratacao,
        codigo_grupo: identificadorContratacao,
        nome_grupo: nomeContratacao,
        unidade_requisitante: grupo.unidades_requisitantes.join(', ') || undefined,
        responsavel_demanda: grupo.responsaveis[0]?.nome,
        email_responsavel: grupo.responsaveis[0]?.email,
        valor_estimado: grupo.valor_total,
        valor_unitario_estimado: grupo.valor_total,
        quantidade_estimada: 1,          // PCA registra por grupo, qtd = 1 contratação
        unidade_medida: 'VB',            // VB = Verba (contratação global)
        trimestre_previsto: grupo.trimestre_previsto,
        data_desejada_contratacao: grupo.data_desejada_contratacao as any,
        prioridade: grupo.prioridade,
        renovacao_contrato: grupo.renovacao_contrato ? 'SIM' : 'NAO',
      });
      proximoNumeroContratacao++;

      // Vincular cada item de demanda ao ItemPCA criado
      for (const itemId of grupo.itens_demanda_ids) {
        await itemDemandaRepository.update(itemId, { item_pca_id: novoItemPca.id });
      }

      itensAdicionados++;
    }

    // ── Marcar demandas como consolidadas ─────────────────────────────────────
    for (const demandaId of demandaIds) {
      const demanda = await demandasRepository.findOne({ where: { id: demandaId } }) as any;
      if (demanda && demanda.status === 'APROVADA') {
        await demandasRepository.update(demandaId, {
          status: 'CONSOLIDADA',
          pca_id: pcaId,
        });
      }
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
   * Busca primeiro no PCA do órgão, depois no catálogo global
   */
  async buscarItensSimilares(
    orgaoId: string, 
    descricoes: string[], 
    anoReferencia?: number
  ): Promise<Map<string, ItemPCA | null>> {
    this.logger.log(`[MATCHING] Buscando matches para ${descricoes.length} itens`);
    
    const resultado = new Map<string, ItemPCA | null>();
    
    // 1. Carregar itens do PCA do órgão
    const anosParaBuscar = anoReferencia 
      ? [anoReferencia, anoReferencia - 1]
      : [new Date().getFullYear(), new Date().getFullYear() - 1];

    const todosItensPCA: ItemPCA[] = [];
    for (const ano of anosParaBuscar) {
      const itens = await this.itemPcaRepository.createQueryBuilder('item')
        .leftJoinAndSelect('item.pca', 'pca')
        .where('pca.orgao_id = :orgaoId', { orgaoId })
        .andWhere('pca.ano_exercicio = :ano', { ano })
        .getMany();
      todosItensPCA.push(...itens);
    }

    this.logger.log(`[MATCHING] ${todosItensPCA.length} itens do PCA do órgão carregados`);

    // 2. Carregar itens do catálogo global (para fallback)
    const itensCatalogoGlobal = await this.itemCatalogoRepository.find({
      where: { ativo: true },
      relations: ['classificacao']
    });
    this.logger.log(`[MATCHING] ${itensCatalogoGlobal.length} itens do catálogo global carregados`);

    // Criar mapa de descrições normalizadas do PCA
    const mapaItensPCA = new Map<string, ItemPCA>();
    for (const item of todosItensPCA) {
      const descNorm = this.normalizarDescricao(item.descricao_objeto);
      if (!mapaItensPCA.has(descNorm)) {
        mapaItensPCA.set(descNorm, item);
      }
    }

    // Criar mapa de descrições normalizadas do catálogo global
    const mapaItensCatalogo = new Map<string, ItemCatalogoProprio>();
    for (const item of itensCatalogoGlobal) {
      const descNorm = this.normalizarDescricao(item.descricao);
      if (!mapaItensCatalogo.has(descNorm)) {
        mapaItensCatalogo.set(descNorm, item);
      }
    }

    // Buscar matches para cada descrição
    let matchesPCA = 0;
    let matchesCatalogo = 0;
    
    for (const descricao of descricoes) {
      const descNorm = this.normalizarDescricao(descricao);
      
      // 1. Tentar match exato no PCA
      if (mapaItensPCA.has(descNorm)) {
        resultado.set(descricao, mapaItensPCA.get(descNorm)!);
        matchesPCA++;
        continue;
      }

      // 2. Tentar match parcial no PCA
      let melhorMatchPCA: ItemPCA | null = null;
      let melhorSimilaridadePCA = 0;

      for (const [itemDescNorm, item] of mapaItensPCA) {
        const similaridade = this.calcularSimilaridade(descNorm, itemDescNorm);
        if (similaridade > 0.75 && similaridade > melhorSimilaridadePCA) {
          melhorSimilaridadePCA = similaridade;
          melhorMatchPCA = item;
        }
      }

      if (melhorMatchPCA) {
        resultado.set(descricao, melhorMatchPCA);
        matchesPCA++;
        continue;
      }

      // 3. Se não encontrou no PCA, buscar no catálogo global
      // Match exato no catálogo
      if (mapaItensCatalogo.has(descNorm)) {
        const itemCatalogo = mapaItensCatalogo.get(descNorm)!;
        // Converter item do catálogo para formato ItemPCA
        const itemConvertido = this.converterCatalogoParaItemPCA(itemCatalogo);
        resultado.set(descricao, itemConvertido);
        matchesCatalogo++;
        continue;
      }

      // 4. Match parcial no catálogo global
      let melhorMatchCatalogo: ItemCatalogoProprio | null = null;
      let melhorSimilaridadeCatalogo = 0;

      for (const [itemDescNorm, item] of mapaItensCatalogo) {
        const similaridade = this.calcularSimilaridade(descNorm, itemDescNorm);
        if (similaridade > 0.70 && similaridade > melhorSimilaridadeCatalogo) {
          melhorSimilaridadeCatalogo = similaridade;
          melhorMatchCatalogo = item;
        }
      }

      if (melhorMatchCatalogo) {
        const itemConvertido = this.converterCatalogoParaItemPCA(melhorMatchCatalogo);
        resultado.set(descricao, itemConvertido);
        matchesCatalogo++;
        continue;
      }

      // Nenhum match encontrado
      resultado.set(descricao, null);
    }

    this.logger.log(`[MATCHING] Resultado: ${matchesPCA} do PCA, ${matchesCatalogo} do catálogo global, ${descricoes.length - matchesPCA - matchesCatalogo} sem match`);
    return resultado;
  }

  /**
   * Converte um item do catálogo próprio para o formato ItemPCA (para enriquecimento)
   */
  private converterCatalogoParaItemPCA(itemCatalogo: ItemCatalogoProprio): ItemPCA {
    const itemPCA = new ItemPCA();
    itemPCA.descricao_objeto = itemCatalogo.descricao;
    itemPCA.categoria = itemCatalogo.tipo === 'MATERIAL' ? CategoriaItemPCA.MATERIAL : CategoriaItemPCA.SERVICO;
    itemPCA.catalogo_utilizado = 'OUTROS'; // Catálogo próprio usa OUTROS
    itemPCA.codigo_item_catalogo = itemCatalogo.codigo;
    itemPCA.unidade_medida = itemCatalogo.unidade_padrao || 'UN';
    
    if (itemCatalogo.classificacao) {
      itemPCA.codigo_classe = itemCatalogo.classificacao.codigo;
      itemPCA.nome_classe = itemCatalogo.classificacao.nome;
      itemPCA.classificacao_catalogo = itemCatalogo.classificacao.nome as any;
    }
    
    if (itemCatalogo.valor_referencia) {
      itemPCA.valor_unitario_estimado = itemCatalogo.valor_referencia;
    }
    
    return itemPCA;
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
    anoPca: number;
    itensDataForaAno: { descricao: string; data: string }[];
    itensSemClassificacao: { descricao: string; numero_item: number }[];
    detalhes: { descricao: string; status: string; motivo?: string; itemBase?: string; numero_item?: number }[];
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
    const detalhes: { descricao: string; status: string; motivo?: string; itemBase?: string; numero_item?: number }[] = [];
    const itensDataForaAno: { descricao: string; data: string }[] = [];
    const itensSemClassificacao: { descricao: string; numero_item: number }[] = [];
    let numeroItemAtual = 0;

    for (const item of itens) {
      numeroItemAtual++;
      const descricaoResumida = item.descricao.substring(0, 60);
      
      try {
        const itemExistente = matches.get(item.descricao);
        
        // Preparar dados do item
        // Passar data como string YYYY-MM-DD para evitar problemas de fuso horário
        let dataDesejadaStr: string | undefined = undefined;
        let anoDataDesejada: number | undefined = undefined;
        
        if (item.data_desejada) {
          this.logger.log(`[IMPORT-INTELIGENTE] Data recebida: "${item.data_desejada}"`);
          
          // Formato esperado: yyyy-mm-dd
          const match = item.data_desejada.match(/(\d{4})-(\d{2})-(\d{2})/);
          if (match) {
            // Manter como string no formato YYYY-MM-DD
            dataDesejadaStr = `${match[1]}-${match[2]}-${match[3]}`;
            anoDataDesejada = parseInt(match[1]);
            this.logger.log(`[IMPORT-INTELIGENTE] Data formatada: ${dataDesejadaStr}`);
            
            // Verificar se a data está fora do ano do PCA
            if (anoDataDesejada !== pca.ano_exercicio) {
              itensDataForaAno.push({
                descricao: descricaoResumida,
                data: `${match[3]}/${match[2]}/${match[1]}` // Formato DD/MM/YYYY para exibição
              });
              this.logger.warn(`[IMPORT-INTELIGENTE] ⚠ Data fora do ano do PCA: ${dataDesejadaStr} (PCA ${pca.ano_exercicio})`);
            }
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
          data_desejada_contratacao: dataDesejadaStr as any,
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
            itemBase: itemExistente.descricao_objeto.substring(0, 50),
            numero_item: numeroItemAtual
          });
        } else {
          // Item novo - usar categoria padrão SERVICO
          dadosItem.categoria = CategoriaItemPCA.SERVICO;
          dadosItem.catalogo_utilizado = 'OUTROS';
          dadosItem.justificativa = 'Item novo - classificação pendente';
          
          this.logger.log(`[IMPORT-INTELIGENTE] + Novo: "${descricaoResumida}..." (sem match encontrado)`);
          novos++;
          
          // Adicionar à lista de itens sem classificação
          itensSemClassificacao.push({
            descricao: descricaoResumida,
            numero_item: numeroItemAtual
          });
          
          detalhes.push({
            descricao: descricaoResumida,
            status: 'novo',
            motivo: 'Nenhum item similar encontrado - classificação padrão aplicada',
            numero_item: numeroItemAtual
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
          motivo: error.message,
          numero_item: numeroItemAtual
        });
      }
    }

    this.logger.log(`[IMPORT-INTELIGENTE] ========================================`);
    this.logger.log(`[IMPORT-INTELIGENTE] RESULTADO:`);
    this.logger.log(`[IMPORT-INTELIGENTE]   Total importados: ${importados}`);
    this.logger.log(`[IMPORT-INTELIGENTE]   - Enriquecidos: ${enriquecidos}`);
    this.logger.log(`[IMPORT-INTELIGENTE]   - Novos (sem classificação): ${novos}`);
    this.logger.log(`[IMPORT-INTELIGENTE]   Erros: ${erros}`);
    this.logger.log(`[IMPORT-INTELIGENTE]   Itens com data fora do ano: ${itensDataForaAno.length}`);
    this.logger.log(`[IMPORT-INTELIGENTE] ========================================`);

    return { 
      importados, 
      enriquecidos, 
      novos, 
      erros, 
      anoPca: pca.ano_exercicio,
      itensDataForaAno,
      itensSemClassificacao,
      detalhes 
    };
  }
}
