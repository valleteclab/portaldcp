import { Injectable, ConflictException, NotFoundException, BadRequestException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Licitacao, FaseLicitacao } from './entities/licitacao.entity';
import { CreateLicitacaoDto, PublicarEditalDto } from './dto/create-licitacao.dto';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import { LoteLicitacao } from '../lotes/entities/lote-licitacao.entity';
import { ContratosService } from '../contratos/contratos.service';

// Formata Date para string ISO local (sem conversão UTC)
// Garante que 21:00 em Brasília seja retornado como "2025-12-10T21:00:00"
function formatarDataLocal(date: Date | null | undefined): string | null {
  if (!date) return null;
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  const hora = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const seg = String(date.getSeconds()).padStart(2, '0');
  return `${ano}-${mes}-${dia}T${hora}:${min}:${seg}`;
}

@Injectable()
export class LicitacoesService {
  private readonly logger = new Logger(LicitacoesService.name);

  constructor(
    @InjectRepository(Licitacao)
    private readonly licitacaoRepository: Repository<Licitacao>,
    @InjectRepository(ItemLicitacao)
    private readonly itemRepository: Repository<ItemLicitacao>,
    @InjectRepository(LoteLicitacao)
    private readonly loteRepository: Repository<LoteLicitacao>,
    @Inject(forwardRef(() => ContratosService))
    private readonly contratosService: ContratosService,
  ) {}

  // === CRUD ===
  async create(createDto: CreateLicitacaoDto): Promise<Licitacao> {
    const existing = await this.licitacaoRepository.findOne({
      where: { numero_processo: createDto.numero_processo },
    });

    if (existing) {
      throw new ConflictException(
        `Já existe uma licitação com o processo ${createDto.numero_processo}`,
      );
    }

    // Gera ano e sequencial
    const ano = new Date().getFullYear();
    const count = await this.licitacaoRepository.count({
      where: { ano }
    });

    const licitacao = this.licitacaoRepository.create({
      ...createDto,
      ano,
      sequencial: count + 1,
      fase: FaseLicitacao.PLANEJAMENTO,
      data_abertura_processo: new Date(),
    });

    return await this.licitacaoRepository.save(licitacao);
  }

  async findAll(filtros?: { fase?: FaseLicitacao; orgao_id?: string }): Promise<Licitacao[]> {
    const where: any = {};
    if (filtros?.fase) where.fase = filtros.fase;
    if (filtros?.orgao_id) where.orgao_id = filtros.orgao_id;

    return await this.licitacaoRepository.find({
      where,
      relations: ['orgao'],
      order: { created_at: 'DESC' }
    });
  }

  async findOne(id: string): Promise<any> {
    const licitacao = await this.licitacaoRepository.findOne({
      where: { id },
      relations: ['orgao', 'itens', 'itens.item_pca', 'itens.item_pca.pca', 'lotes', 'lotes.item_pca', 'lotes.item_pca.pca', 'item_pca', 'item_pca.pca']
    });
    if (!licitacao) {
      throw new NotFoundException(`Licitação com ID ${id} não encontrada`);
    }
    
    // Formatar datas do cronograma como strings ISO locais (sem conversão UTC)
    // Isso garante que o frontend receba exatamente o horário de Brasília
    const resultado = {
      ...licitacao,
      data_publicacao_edital: formatarDataLocal(licitacao.data_publicacao_edital),
      data_limite_impugnacao: formatarDataLocal(licitacao.data_limite_impugnacao),
      data_inicio_acolhimento: formatarDataLocal(licitacao.data_inicio_acolhimento),
      data_fim_acolhimento: formatarDataLocal(licitacao.data_fim_acolhimento),
      data_abertura_sessao: formatarDataLocal(licitacao.data_abertura_sessao),
    };
    
    return resultado;
  }

  async update(id: string, updateData: Partial<CreateLicitacaoDto> & { itens?: any[]; lotes?: any[] }): Promise<Licitacao> {
    const licitacao = await this.findOne(id);
    
    // Não permite alterar se já está em fase externa avançada
    const fasesProtegidas = [
      FaseLicitacao.EM_DISPUTA,
      FaseLicitacao.JULGAMENTO,
      FaseLicitacao.HABILITACAO,
      FaseLicitacao.ADJUDICACAO,
      FaseLicitacao.HOMOLOGACAO,
      FaseLicitacao.CONCLUIDO
    ];

    if (fasesProtegidas.includes(licitacao.fase)) {
      throw new BadRequestException('Não é possível alterar licitação nesta fase');
    }

    // Extrair itens e lotes do updateData
    const { itens, lotes, ...dadosLicitacao } = updateData;

    // Atualizar dados da licitação
    Object.assign(licitacao, dadosLicitacao);
    await this.licitacaoRepository.save(licitacao);

    // Função auxiliar para validar UUID
    const isValidUUID = (str: string): boolean => {
      if (!str) return false;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      return uuidRegex.test(str);
    };

    // Salvar itens se fornecidos
    if (itens && Array.isArray(itens)) {
      // Buscar itens existentes
      const itensExistentes = await this.itemRepository.find({ where: { licitacao_id: id } });
      
      // Verificar se há propostas vinculadas aos itens (via proposta_itens)
      // Se houver, não podemos deletar - apenas atualizar
      let temPropostasVinculadas = false;
      if (itensExistentes.length > 0) {
        const idsItens = itensExistentes.map(i => i.id);
        const countPropostas = await this.itemRepository.manager
          .createQueryBuilder()
          .select('COUNT(*)', 'count')
          .from('proposta_itens', 'pi')
          .where('pi.item_licitacao_id IN (:...ids)', { ids: idsItens })
          .getRawOne();
        temPropostasVinculadas = parseInt(countPropostas?.count || '0') > 0;
      }
      
      if (temPropostasVinculadas) {
        // Há propostas vinculadas - atualizar itens existentes ao invés de deletar/recriar
        for (let i = 0; i < itens.length; i++) {
          const item = itens[i];
          const valorUnitario = item.valor_unitario || item.valor_unitario_estimado || 0;
          const quantidade = item.quantidade || 1;
          const loteId = isValidUUID(item.lote_id) ? item.lote_id : undefined;
          const numeroItem = item.numero || item.numero_item || (i + 1);
          
          // Buscar item existente pelo número ou id
          let itemExistente = itensExistentes.find(ie => 
            ie.id === item.id || ie.numero_item === numeroItem
          );
          
          if (itemExistente) {
            // Atualizar item existente
            Object.assign(itemExistente, {
              numero_item: numeroItem,
              descricao_resumida: item.descricao || item.descricao_resumida || itemExistente.descricao_resumida,
              descricao_detalhada: item.descricao_detalhada ?? itemExistente.descricao_detalhada,
              quantidade: quantidade,
              unidade_medida: item.unidade || item.unidade_medida || itemExistente.unidade_medida,
              valor_unitario_estimado: valorUnitario,
              valor_total_estimado: quantidade * valorUnitario,
              codigo_catalogo: item.codigo_catalogo || item.codigo_catmat || item.codigo_catser,
              codigo_catmat: item.codigo_catmat,
              codigo_catser: item.codigo_catser,
              codigo_pdm: item.codigo_pdm,
              nome_pdm: item.nome_pdm,
              classe_catalogo: item.classe_catalogo,
              codigo_grupo: item.codigo_grupo,
              nome_grupo: item.nome_grupo,
              lote_id: loteId,
              numero_lote: item.lote_numero || item.numero_lote,
              item_pca_id: isValidUUID(item.item_pca_id) ? item.item_pca_id : undefined,
              sem_pca: item.sem_pca || false,
              justificativa_sem_pca: item.justificativa_sem_pca,
              tipo_participacao: item.tipo_participacao || 'AMPLA',
              margem_preferencia: item.margem_preferencia || false,
              percentual_margem: item.percentual_margem,
              status: item.status || 'ATIVO',
              observacoes: item.observacoes,
            });
            await this.itemRepository.save(itemExistente);
          }
          // Nota: não criamos novos itens quando há propostas vinculadas
          // para evitar inconsistências
        }
      } else {
        // Não há propostas vinculadas - comportamento original (deletar e recriar)
        await this.itemRepository.delete({ licitacao_id: id });
        
        // Criar novos itens com mapeamento de campos
        for (let i = 0; i < itens.length; i++) {
          const item = itens[i];
          const valorUnitario = item.valor_unitario || item.valor_unitario_estimado || 0;
          const quantidade = item.quantidade || 1;
          
          // Validar lote_id - só usar se for UUID válido
          const loteId = isValidUUID(item.lote_id) ? item.lote_id : undefined;
          
          const novoItem = this.itemRepository.create({
            licitacao_id: id,
            numero_item: item.numero || item.numero_item || (i + 1),
            descricao_resumida: item.descricao || item.descricao_resumida || 'Item sem descrição',
            descricao_detalhada: item.descricao_detalhada,
            quantidade: quantidade,
            unidade_medida: item.unidade || item.unidade_medida || 'UNIDADE',
            valor_unitario_estimado: valorUnitario,
            valor_total_estimado: quantidade * valorUnitario,
            // Dados do Catálogo de Compras (compras.gov.br)
            codigo_catalogo: item.codigo_catalogo || item.codigo_catmat || item.codigo_catser,
            codigo_catmat: item.codigo_catmat,
            codigo_catser: item.codigo_catser,
            codigo_pdm: item.codigo_pdm,
            nome_pdm: item.nome_pdm,
            classe_catalogo: item.classe_catalogo,
            codigo_grupo: item.codigo_grupo,
            nome_grupo: item.nome_grupo,
            // Vinculação com lote e PCA
            lote_id: loteId,
            numero_lote: item.lote_numero || item.numero_lote,
            item_pca_id: isValidUUID(item.item_pca_id) ? item.item_pca_id : undefined,
            sem_pca: item.sem_pca || false,
            justificativa_sem_pca: item.justificativa_sem_pca,
            tipo_participacao: item.tipo_participacao || 'AMPLA',
            margem_preferencia: item.margem_preferencia || false,
            percentual_margem: item.percentual_margem,
            status: item.status || 'ATIVO',
            observacoes: item.observacoes,
          });
          await this.itemRepository.save(novoItem);
        }
      }
    }

    // Salvar lotes se fornecidos
    if (lotes && Array.isArray(lotes)) {
      // Remover lotes antigos
      await this.loteRepository.delete({ licitacao_id: id });
      
      // Criar novos lotes
      for (const lote of lotes) {
        // Extrair itens do lote (não deve ser salvo diretamente na entidade)
        const { itens: itensDoLote, item_pca, ...dadosLote } = lote;
        
        const novoLote = this.loteRepository.create({
          ...dadosLote,
          licitacao_id: id,
          id: undefined,
        });
        await this.loteRepository.save(novoLote);
      }
    }

    // Retornar licitação atualizada com itens
    const result = await this.licitacaoRepository.findOne({
      where: { id },
      relations: ['itens', 'lotes']
    });
    return result!;
  }

  // === GESTÃO DE FASES ===
  async avancarFase(id: string, observacao?: string): Promise<Licitacao> {
    const licitacao = await this.findOne(id);
    const proximaFase = this.getProximaFase(licitacao.fase);

    if (!proximaFase) {
      throw new BadRequestException('Não há próxima fase disponível');
    }

    // Validação especial: ANALISE_PROPOSTAS -> EM_DISPUTA
    // Deve validar data de abertura e verificar se há propostas
    if (licitacao.fase === FaseLicitacao.ANALISE_PROPOSTAS && proximaFase === FaseLicitacao.EM_DISPUTA) {
      console.log(`[avancarFase] Validando transição ANALISE_PROPOSTAS -> EM_DISPUTA para licitação ${id}`);
      
      // Validar data de abertura da sessão
      if (licitacao.data_abertura_sessao) {
        const agora = new Date();
        const dataAbertura = new Date(licitacao.data_abertura_sessao);
        console.log(`[avancarFase] Data abertura: ${dataAbertura}, Agora: ${agora}`);
        
        if (agora < dataAbertura) {
          const dataFormatada = dataAbertura.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          throw new BadRequestException(
            `A sessão de disputa só pode ser iniciada a partir de ${dataFormatada}. Aguarde a data de abertura programada.`
          );
        }
      }

      // Verificar se há propostas válidas
      try {
        const propostas = await this.licitacaoRepository.manager.query(`
          SELECT COUNT(*) as total FROM propostas 
          WHERE licitacao_id = $1 AND status IN ('ENVIADA', 'VALIDA', 'CLASSIFICADA')
        `, [id]);
        
        console.log(`[avancarFase] Propostas encontradas:`, propostas);
        
        if (parseInt(propostas[0]?.total || '0') === 0) {
          throw new BadRequestException(
            'Não é possível iniciar a disputa sem propostas válidas. Verifique se há propostas classificadas.'
          );
        }
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        console.error(`[avancarFase] Erro ao buscar propostas:`, err);
        // Se der erro na query, continua sem validar propostas
      }

      // Registra data de início da disputa
      licitacao.data_inicio_disputa = new Date();
    }

    licitacao.fase = proximaFase;
    licitacao.observacoes = observacao || licitacao.observacoes;

    // Registra datas conforme a fase
    this.registrarDataFase(licitacao, proximaFase);

    return await this.licitacaoRepository.save(licitacao);
  }

  async retrocederFase(id: string, motivo: string): Promise<Licitacao> {
    const licitacao = await this.findOne(id);
    const faseAnterior = this.getFaseAnterior(licitacao.fase);

    if (!faseAnterior) {
      throw new BadRequestException('Não há fase anterior disponível');
    }

    licitacao.fase = faseAnterior;
    licitacao.observacoes = `Retrocedido: ${motivo}`;

    return await this.licitacaoRepository.save(licitacao);
  }

  async publicarEdital(id: string, dados: PublicarEditalDto): Promise<Licitacao> {
    const licitacao = await this.findOne(id);

    // Valida se está na fase correta
    if (licitacao.fase !== FaseLicitacao.APROVACAO_INTERNA) {
      throw new BadRequestException('Licitação precisa estar aprovada internamente para publicar edital');
    }

    licitacao.fase = FaseLicitacao.PUBLICADO;
    licitacao.data_publicacao_edital = new Date(dados.data_publicacao_edital);
    licitacao.data_limite_impugnacao = new Date(dados.data_limite_impugnacao);
    licitacao.data_inicio_acolhimento = new Date(dados.data_inicio_acolhimento);
    licitacao.data_fim_acolhimento = new Date(dados.data_fim_acolhimento);
    licitacao.data_abertura_sessao = new Date(dados.data_abertura_sessao);
    if (dados.link_pncp) {
      licitacao.link_pncp = dados.link_pncp;
    }

    return await this.licitacaoRepository.save(licitacao);
  }

  async iniciarDisputa(id: string): Promise<Licitacao> {
    const licitacao = await this.findOne(id);

    if (licitacao.fase !== FaseLicitacao.ANALISE_PROPOSTAS) {
      throw new BadRequestException('Licitação precisa estar na fase de análise de propostas');
    }

    // Validar data de abertura da sessão
    if (licitacao.data_abertura_sessao) {
      const agora = new Date();
      const dataAbertura = new Date(licitacao.data_abertura_sessao);
      
      if (agora < dataAbertura) {
        const dataFormatada = dataAbertura.toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        throw new BadRequestException(
          `A sessão só pode ser iniciada a partir de ${dataFormatada}. Aguarde a data de abertura programada.`
        );
      }
    }

    licitacao.fase = FaseLicitacao.EM_DISPUTA;
    licitacao.data_inicio_disputa = new Date();

    return await this.licitacaoRepository.save(licitacao);
  }

  async encerrarDisputa(id: string): Promise<Licitacao> {
    const licitacao = await this.findOne(id);

    if (licitacao.fase !== FaseLicitacao.EM_DISPUTA) {
      throw new BadRequestException('Licitação não está em disputa');
    }

    licitacao.fase = FaseLicitacao.JULGAMENTO;
    licitacao.data_fim_disputa = new Date();

    return await this.licitacaoRepository.save(licitacao);
  }

  async homologar(id: string, valorHomologado: number): Promise<Licitacao> {
    const licitacao = await this.findOne(id);

    licitacao.fase = FaseLicitacao.HOMOLOGACAO;
    licitacao.valor_homologado = valorHomologado;
    licitacao.data_homologacao = new Date();

    const licitacaoSalva = await this.licitacaoRepository.save(licitacao);

    // Gera contratos automaticamente após homologação (1 por fornecedor vencedor)
    try {
      const contratos = await this.contratosService.gerarContratoAutomatico(id);
      if (contratos.length > 0) {
        const numeros = contratos.map((c) => c.numero_contrato).join(', ');
        this.logger.log(
          `${contratos.length} contrato(s) gerado(s) automaticamente para licitação ${id}: ${numeros}`,
        );
      }
    } catch (error) {
      // Não falha a homologação se houver erro na geração dos contratos
      this.logger.error(`Erro ao gerar contratos automaticamente para licitação ${id}:`, error);
    }

    return licitacaoSalva;
  }

  async suspender(id: string, motivo: string): Promise<Licitacao> {
    const licitacao = await this.findOne(id);
    licitacao.fase = FaseLicitacao.SUSPENSO;
    licitacao.observacoes = `Suspenso: ${motivo}`;
    return await this.licitacaoRepository.save(licitacao);
  }

  async revogar(id: string, motivo: string): Promise<Licitacao> {
    const licitacao = await this.findOne(id);
    licitacao.fase = FaseLicitacao.REVOGADO;
    licitacao.observacoes = `Revogado: ${motivo}`;
    return await this.licitacaoRepository.save(licitacao);
  }

  async anular(id: string, motivo: string): Promise<Licitacao> {
    const licitacao = await this.findOne(id);
    licitacao.fase = FaseLicitacao.ANULADO;
    licitacao.observacoes = `Anulado: ${motivo}`;
    return await this.licitacaoRepository.save(licitacao);
  }

  async retomar(id: string, faseDestino?: string): Promise<Licitacao> {
    const licitacao = await this.findOne(id);
    
    if (licitacao.fase !== FaseLicitacao.SUSPENSO) {
      throw new BadRequestException('Apenas licitações suspensas podem ser retomadas');
    }

    // Determina a fase de retorno (padrão: ACOLHIMENTO_PROPOSTAS)
    const fasesValidas = [
      FaseLicitacao.PUBLICADO,
      FaseLicitacao.IMPUGNACAO,
      FaseLicitacao.ACOLHIMENTO_PROPOSTAS,
      FaseLicitacao.ANALISE_PROPOSTAS,
      FaseLicitacao.EM_DISPUTA,
    ];

    if (faseDestino && fasesValidas.includes(faseDestino as FaseLicitacao)) {
      licitacao.fase = faseDestino as FaseLicitacao;
    } else {
      licitacao.fase = FaseLicitacao.ACOLHIMENTO_PROPOSTAS;
    }

    licitacao.observacoes = `Retomado em ${new Date().toLocaleDateString('pt-BR')}. ${licitacao.observacoes || ''}`;
    return await this.licitacaoRepository.save(licitacao);
  }

  async delete(id: string): Promise<void> {
    const licitacao = await this.licitacaoRepository.findOne({ where: { id } });
    if (!licitacao) {
      throw new NotFoundException(`Licitação com ID ${id} não encontrada`);
    }
    
    // Regras de exclusão conforme Lei 14.133/2021
    // Só pode excluir se estiver em fase interna (antes da publicação)
    const fasesPermitidas = [
      FaseLicitacao.PLANEJAMENTO,
      FaseLicitacao.TERMO_REFERENCIA,
      FaseLicitacao.PESQUISA_PRECOS,
      FaseLicitacao.ANALISE_JURIDICA,
      FaseLicitacao.APROVACAO_INTERNA,
    ];

    if (!fasesPermitidas.includes(licitacao.fase)) {
      throw new BadRequestException(
        'Não é possível excluir uma licitação após a publicação do edital. Use as opções de Revogar ou Anular.'
      );
    }

    await this.licitacaoRepository.manager.transaction(async (manager) => {
      // Registros da fase interna podem ter FKs sem cascade em bancos existentes.
      // Remover filhos primeiro evita erro 500 por violação de constraint.
      //
      // Ordem correta para respeitar as FKs:
      //   pesquisa_preco_candidatos → FK para pesquisa_preco_execucoes (sem guarantee de cascade no DB)
      //   pesquisa_preco_execucoes  → FK para documentos_fase_interna (sem cascade)
      //   logs_fase_interna         → FK para licitacao
      //   documentos_fase_interna   → FK para licitacao
      await manager.query(
        `DELETE FROM pesquisa_preco_candidatos WHERE execucao_id IN (
          SELECT id FROM pesquisa_preco_execucoes WHERE licitacao_id = $1
        )`,
        [id],
      );
      await manager.delete('pesquisa_preco_execucoes', { licitacao_id: id });
      await manager.delete('logs_fase_interna', { licitacao_id: id });
      await manager.delete('documentos_fase_interna', { licitacao_id: id });
      await manager.delete('documentos_licitacao', { licitacao_id: id });
      await manager.delete('pncp_sync', { licitacao_id: id });
      await manager.delete(ItemLicitacao, { licitacao_id: id });
      await manager.delete(LoteLicitacao, { licitacao_id: id });
      await manager.delete(Licitacao, id);
    });
  }

  // === HELPERS ===
  private getProximaFase(faseAtual: FaseLicitacao): FaseLicitacao | null {
    const fluxo: FaseLicitacao[] = [
      FaseLicitacao.PLANEJAMENTO,
      FaseLicitacao.TERMO_REFERENCIA,
      FaseLicitacao.PESQUISA_PRECOS,
      FaseLicitacao.ANALISE_JURIDICA,
      FaseLicitacao.APROVACAO_INTERNA,
      FaseLicitacao.PUBLICADO,
      FaseLicitacao.IMPUGNACAO,
      FaseLicitacao.ACOLHIMENTO_PROPOSTAS,
      FaseLicitacao.ANALISE_PROPOSTAS,
      FaseLicitacao.EM_DISPUTA,
      FaseLicitacao.JULGAMENTO,
      FaseLicitacao.HABILITACAO,
      FaseLicitacao.RECURSO,
      FaseLicitacao.ADJUDICACAO,
      FaseLicitacao.HOMOLOGACAO,
      FaseLicitacao.CONCLUIDO,
    ];

    const indexAtual = fluxo.indexOf(faseAtual);
    if (indexAtual === -1 || indexAtual === fluxo.length - 1) return null;
    return fluxo[indexAtual + 1];
  }

  private getFaseAnterior(faseAtual: FaseLicitacao): FaseLicitacao | null {
    const fluxo: FaseLicitacao[] = [
      FaseLicitacao.PLANEJAMENTO,
      FaseLicitacao.TERMO_REFERENCIA,
      FaseLicitacao.PESQUISA_PRECOS,
      FaseLicitacao.ANALISE_JURIDICA,
      FaseLicitacao.APROVACAO_INTERNA,
      FaseLicitacao.PUBLICADO,
      FaseLicitacao.IMPUGNACAO,
      FaseLicitacao.ACOLHIMENTO_PROPOSTAS,
      FaseLicitacao.ANALISE_PROPOSTAS,
      FaseLicitacao.EM_DISPUTA,
      FaseLicitacao.JULGAMENTO,
      FaseLicitacao.HABILITACAO,
      FaseLicitacao.RECURSO,
      FaseLicitacao.ADJUDICACAO,
      FaseLicitacao.HOMOLOGACAO,
      FaseLicitacao.CONCLUIDO,
    ];

    const indexAtual = fluxo.indexOf(faseAtual);
    if (indexAtual <= 0) return null;
    return fluxo[indexAtual - 1];
  }

  private registrarDataFase(licitacao: Licitacao, fase: FaseLicitacao): void {
    switch (fase) {
      case FaseLicitacao.TERMO_REFERENCIA:
        licitacao.data_aprovacao_tr = new Date();
        break;
      case FaseLicitacao.ANALISE_JURIDICA:
        licitacao.data_parecer_juridico = new Date();
        break;
      case FaseLicitacao.APROVACAO_INTERNA:
        licitacao.data_autorizacao = new Date();
        break;
      case FaseLicitacao.ADJUDICACAO:
        licitacao.data_adjudicacao = new Date();
        break;
    }
  }

  // === CONSULTAS PÚBLICAS ===
  async findPublicas(filtros?: { 
    modalidade?: string; 
    orgao_id?: string; 
    uf?: string 
  }): Promise<Licitacao[]> {
    // Apenas licitações em fases públicas (após publicação do edital)
    const fasesPublicas = [
      FaseLicitacao.PUBLICADO,
      FaseLicitacao.IMPUGNACAO,
      FaseLicitacao.ACOLHIMENTO_PROPOSTAS,
      FaseLicitacao.ANALISE_PROPOSTAS,
      FaseLicitacao.EM_DISPUTA,
      FaseLicitacao.JULGAMENTO,
      FaseLicitacao.HABILITACAO,
      FaseLicitacao.RECURSO,
      FaseLicitacao.ADJUDICACAO,
      FaseLicitacao.HOMOLOGACAO,
      FaseLicitacao.CONCLUIDO,
      FaseLicitacao.DESERTO,
      FaseLicitacao.FRACASSADO,
      FaseLicitacao.REVOGADO,
      FaseLicitacao.ANULADO
    ];

    const query = this.licitacaoRepository.createQueryBuilder('licitacao')
      .leftJoinAndSelect('licitacao.orgao', 'orgao')
      .leftJoinAndSelect('licitacao.itens', 'itens')
      .where('licitacao.fase IN (:...fases)', { fases: fasesPublicas });

    if (filtros?.modalidade) {
      query.andWhere('licitacao.modalidade = :modalidade', { modalidade: filtros.modalidade });
    }

    if (filtros?.orgao_id) {
      query.andWhere('licitacao.orgao_id = :orgao_id', { orgao_id: filtros.orgao_id });
    }

    if (filtros?.uf) {
      query.andWhere('orgao.uf = :uf', { uf: filtros.uf });
    }

    return query.orderBy('licitacao.data_abertura_sessao', 'DESC').getMany();
  }
}
