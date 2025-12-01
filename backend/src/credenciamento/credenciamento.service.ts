import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Credenciamento, Credenciado, StatusCredenciamento, StatusCredenciado, TipoCredenciamento } from './entities/credenciamento.entity';

@Injectable()
export class CredenciamentoService {
  constructor(
    @InjectRepository(Credenciamento)
    private credenciamentoRepository: Repository<Credenciamento>,
    @InjectRepository(Credenciado)
    private credenciadoRepository: Repository<Credenciado>,
  ) {}

  // ============ CREDENCIAMENTO ============

  async criar(dados: Partial<Credenciamento>): Promise<Credenciamento> {
    const ano = new Date().getFullYear();
    const count = await this.credenciamentoRepository.count({
      where: { orgao_id: dados.orgao_id, ano }
    });

    const credenciamento = this.credenciamentoRepository.create({
      ...dados,
      ano,
      sequencial: count + 1,
      numero_edital: `${count + 1}/${ano}`,
      status: StatusCredenciamento.RASCUNHO,
      amparo_legal: 'Art. 79 da Lei 14.133/2021'
    });

    return this.credenciamentoRepository.save(credenciamento);
  }

  async findAll(filtros?: {
    orgaoId?: string;
    status?: StatusCredenciamento;
    tipo?: TipoCredenciamento;
  }): Promise<Credenciamento[]> {
    const query = this.credenciamentoRepository.createQueryBuilder('c')
      .leftJoinAndSelect('c.orgao', 'orgao')
      .leftJoinAndSelect('c.credenciados', 'credenciados');

    if (filtros?.orgaoId) {
      query.andWhere('c.orgao_id = :orgaoId', { orgaoId: filtros.orgaoId });
    }

    if (filtros?.status) {
      query.andWhere('c.status = :status', { status: filtros.status });
    }

    if (filtros?.tipo) {
      query.andWhere('c.tipo = :tipo', { tipo: filtros.tipo });
    }

    return query.orderBy('c.created_at', 'DESC').getMany();
  }

  async findPublicos(filtros?: {
    tipo?: TipoCredenciamento;
    uf?: string;
  }): Promise<Credenciamento[]> {
    const statusPublicos = [
      StatusCredenciamento.PUBLICADO,
      StatusCredenciamento.EM_ANDAMENTO
    ];

    const query = this.credenciamentoRepository.createQueryBuilder('c')
      .leftJoinAndSelect('c.orgao', 'orgao')
      .where('c.status IN (:...status)', { status: statusPublicos });

    if (filtros?.tipo) {
      query.andWhere('c.tipo = :tipo', { tipo: filtros.tipo });
    }

    if (filtros?.uf) {
      query.andWhere('orgao.uf = :uf', { uf: filtros.uf });
    }

    return query.orderBy('c.data_publicacao', 'DESC').getMany();
  }

  async findOne(id: string): Promise<Credenciamento> {
    const credenciamento = await this.credenciamentoRepository.findOne({
      where: { id },
      relations: ['orgao', 'credenciados']
    });

    if (!credenciamento) {
      throw new NotFoundException('Credenciamento não encontrado');
    }

    return credenciamento;
  }

  async atualizar(id: string, dados: Partial<Credenciamento>): Promise<Credenciamento> {
    const credenciamento = await this.findOne(id);

    if (credenciamento.status === StatusCredenciamento.ENCERRADO) {
      throw new BadRequestException('Não é possível alterar um credenciamento encerrado');
    }

    Object.assign(credenciamento, dados);
    return this.credenciamentoRepository.save(credenciamento);
  }

  async publicar(id: string): Promise<Credenciamento> {
    const credenciamento = await this.findOne(id);

    if (credenciamento.status !== StatusCredenciamento.RASCUNHO) {
      throw new BadRequestException('Apenas credenciamentos em rascunho podem ser publicados');
    }

    credenciamento.status = StatusCredenciamento.PUBLICADO;
    credenciamento.data_publicacao = new Date();

    return this.credenciamentoRepository.save(credenciamento);
  }

  async iniciarInscricoes(id: string): Promise<Credenciamento> {
    const credenciamento = await this.findOne(id);
    credenciamento.status = StatusCredenciamento.EM_ANDAMENTO;
    credenciamento.data_inicio_inscricoes = new Date();
    return this.credenciamentoRepository.save(credenciamento);
  }

  async encerrar(id: string): Promise<Credenciamento> {
    const credenciamento = await this.findOne(id);
    credenciamento.status = StatusCredenciamento.ENCERRADO;
    credenciamento.data_fim_inscricoes = new Date();
    return this.credenciamentoRepository.save(credenciamento);
  }

  // ============ CREDENCIADOS ============

  async inscreverFornecedor(credenciamentoId: string, dados: {
    fornecedor_id: string;
    fornecedor_cnpj: string;
    fornecedor_razao_social: string;
    documentos_enviados?: any;
  }): Promise<Credenciado> {
    const credenciamento = await this.findOne(credenciamentoId);

    if (credenciamento.status !== StatusCredenciamento.PUBLICADO && 
        credenciamento.status !== StatusCredenciamento.EM_ANDAMENTO) {
      throw new BadRequestException('Credenciamento não está aberto para inscrições');
    }

    // Verificar se já está inscrito
    const existente = await this.credenciadoRepository.findOne({
      where: { 
        credenciamento_id: credenciamentoId, 
        fornecedor_id: dados.fornecedor_id 
      }
    });

    if (existente) {
      throw new BadRequestException('Fornecedor já está inscrito neste credenciamento');
    }

    const credenciado = this.credenciadoRepository.create({
      ...dados,
      credenciamento_id: credenciamentoId,
      status: StatusCredenciado.INSCRITO
    });

    return this.credenciadoRepository.save(credenciado);
  }

  async findCredenciados(credenciamentoId: string, status?: StatusCredenciado): Promise<Credenciado[]> {
    const where: any = { credenciamento_id: credenciamentoId };
    if (status) where.status = status;

    return this.credenciadoRepository.find({
      where,
      order: { data_inscricao: 'ASC' }
    });
  }

  async analisarCredenciado(credenciadoId: string, dados: {
    status: StatusCredenciado;
    parecer: string;
    analista_nome: string;
    motivo_reprovacao?: string;
  }): Promise<Credenciado> {
    const credenciado = await this.credenciadoRepository.findOne({
      where: { id: credenciadoId }
    });

    if (!credenciado) {
      throw new NotFoundException('Credenciado não encontrado');
    }

    credenciado.status = dados.status;
    credenciado.parecer = dados.parecer;
    credenciado.analista_nome = dados.analista_nome;
    credenciado.data_analise = new Date();

    if (dados.status === StatusCredenciado.APROVADO) {
      credenciado.data_aprovacao = new Date();
      // Validade de 1 ano por padrão
      const validade = new Date();
      validade.setFullYear(validade.getFullYear() + 1);
      credenciado.data_validade = validade;
    }

    if (dados.status === StatusCredenciado.REPROVADO) {
      credenciado.motivo_reprovacao = dados.motivo_reprovacao || '';
    }

    return this.credenciadoRepository.save(credenciado);
  }

  async getEstatisticas(credenciamentoId: string): Promise<{
    total: number;
    inscritos: number;
    emAnalise: number;
    aprovados: number;
    reprovados: number;
  }> {
    const credenciados = await this.findCredenciados(credenciamentoId);

    return {
      total: credenciados.length,
      inscritos: credenciados.filter(c => c.status === StatusCredenciado.INSCRITO).length,
      emAnalise: credenciados.filter(c => c.status === StatusCredenciado.EM_ANALISE).length,
      aprovados: credenciados.filter(c => c.status === StatusCredenciado.APROVADO).length,
      reprovados: credenciados.filter(c => c.status === StatusCredenciado.REPROVADO).length
    };
  }
}
