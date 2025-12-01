import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Impugnacao, StatusImpugnacao } from './impugnacao.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';

@Injectable()
export class ImpugnacoesService {
  constructor(
    @InjectRepository(Impugnacao)
    private impugnacaoRepository: Repository<Impugnacao>,
    @InjectRepository(Licitacao)
    private licitacaoRepository: Repository<Licitacao>,
  ) {}

  async findByLicitacao(licitacaoId: string): Promise<Impugnacao[]> {
    return this.impugnacaoRepository.find({
      where: { licitacao_id: licitacaoId },
      relations: ['fornecedor'],
      order: { created_at: 'DESC' }
    });
  }

  async findOne(id: string): Promise<Impugnacao> {
    const impugnacao = await this.impugnacaoRepository.findOne({
      where: { id },
      relations: ['fornecedor', 'licitacao']
    });
    if (!impugnacao) {
      throw new NotFoundException('Impugnação não encontrada');
    }
    return impugnacao;
  }

  async create(data: Partial<Impugnacao>): Promise<Impugnacao> {
    // Verifica se a licitação existe e está em fase de impugnação
    const licitacao = await this.licitacaoRepository.findOne({
      where: { id: data.licitacao_id }
    });

    if (!licitacao) {
      throw new NotFoundException('Licitação não encontrada');
    }

    // Verifica se está no prazo de impugnação
    const fasesPermitidas = ['PUBLICADO', 'IMPUGNACAO'];
    if (!fasesPermitidas.includes(licitacao.fase)) {
      throw new BadRequestException('Fora do prazo para impugnação. A licitação deve estar na fase de Publicação ou Impugnação.');
    }

    const impugnacao = this.impugnacaoRepository.create({
      ...data,
      status: StatusImpugnacao.PENDENTE
    });

    return this.impugnacaoRepository.save(impugnacao);
  }

  async responder(id: string, data: {
    resposta: string;
    status: StatusImpugnacao;
    respondido_por: string;
    altera_edital?: boolean;
    alteracoes_edital?: string;
  }): Promise<Impugnacao> {
    const impugnacao = await this.findOne(id);

    if (impugnacao.status !== StatusImpugnacao.PENDENTE && impugnacao.status !== StatusImpugnacao.EM_ANALISE) {
      throw new BadRequestException('Esta impugnação já foi respondida');
    }

    impugnacao.resposta = data.resposta;
    impugnacao.status = data.status;
    impugnacao.respondido_por = data.respondido_por;
    impugnacao.data_resposta = new Date();
    impugnacao.altera_edital = data.altera_edital || false;
    if (data.alteracoes_edital) {
      impugnacao.alteracoes_edital = data.alteracoes_edital;
    }

    return this.impugnacaoRepository.save(impugnacao);
  }

  async marcarEmAnalise(id: string): Promise<Impugnacao> {
    const impugnacao = await this.findOne(id);
    impugnacao.status = StatusImpugnacao.EM_ANALISE;
    return this.impugnacaoRepository.save(impugnacao);
  }

  async countPendentes(licitacaoId: string): Promise<number> {
    return this.impugnacaoRepository.count({
      where: { 
        licitacao_id: licitacaoId,
        status: StatusImpugnacao.PENDENTE
      }
    });
  }
}
