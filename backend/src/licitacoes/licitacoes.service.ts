import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Licitacao, FaseLicitacao } from './entities/licitacao.entity';
import { CreateLicitacaoDto, PublicarEditalDto } from './dto/create-licitacao.dto';

@Injectable()
export class LicitacoesService {
  constructor(
    @InjectRepository(Licitacao)
    private readonly licitacaoRepository: Repository<Licitacao>,
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

  async findOne(id: string): Promise<Licitacao> {
    const licitacao = await this.licitacaoRepository.findOne({
      where: { id },
      relations: ['orgao']
    });
    if (!licitacao) {
      throw new NotFoundException(`Licitação com ID ${id} não encontrada`);
    }
    return licitacao;
  }

  async update(id: string, updateData: Partial<CreateLicitacaoDto>): Promise<Licitacao> {
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

    Object.assign(licitacao, updateData);
    return await this.licitacaoRepository.save(licitacao);
  }

  // === GESTÃO DE FASES ===
  async avancarFase(id: string, observacao?: string): Promise<Licitacao> {
    const licitacao = await this.findOne(id);
    const proximaFase = this.getProximaFase(licitacao.fase);

    if (!proximaFase) {
      throw new BadRequestException('Não há próxima fase disponível');
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

    return await this.licitacaoRepository.save(licitacao);
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
    const licitacao = await this.findOne(id);
    
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

    await this.licitacaoRepository.remove(licitacao);
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
