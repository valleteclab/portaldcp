import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Esclarecimento, StatusEsclarecimento } from './esclarecimento.entity';

@Injectable()
export class EsclarecimentosService {
  constructor(
    @InjectRepository(Esclarecimento)
    private esclarecimentoRepository: Repository<Esclarecimento>,
  ) {}

  async findByLicitacao(licitacaoId: string): Promise<Esclarecimento[]> {
    return this.esclarecimentoRepository.find({
      where: { licitacao_id: licitacaoId },
      relations: ['fornecedor'],
      order: { created_at: 'DESC' }
    });
  }

  async findOne(id: string): Promise<Esclarecimento> {
    const esclarecimento = await this.esclarecimentoRepository.findOne({
      where: { id },
      relations: ['fornecedor', 'licitacao']
    });
    if (!esclarecimento) {
      throw new NotFoundException(`Esclarecimento com ID ${id} não encontrado`);
    }
    return esclarecimento;
  }

  async create(data: Partial<Esclarecimento>): Promise<Esclarecimento> {
    const esclarecimento = this.esclarecimentoRepository.create({
      ...data,
      status: StatusEsclarecimento.PENDENTE
    });
    return this.esclarecimentoRepository.save(esclarecimento);
  }

  async responder(id: string, resposta: string, respondidoPor: string): Promise<Esclarecimento> {
    const esclarecimento = await this.findOne(id);
    esclarecimento.resposta = resposta;
    esclarecimento.respondido_por = respondidoPor;
    esclarecimento.data_resposta = new Date();
    esclarecimento.status = StatusEsclarecimento.RESPONDIDO;
    return this.esclarecimentoRepository.save(esclarecimento);
  }

  async arquivar(id: string): Promise<Esclarecimento> {
    const esclarecimento = await this.findOne(id);
    esclarecimento.status = StatusEsclarecimento.ARQUIVADO;
    return this.esclarecimentoRepository.save(esclarecimento);
  }

  async findByFornecedor(fornecedorId: string): Promise<Esclarecimento[]> {
    return this.esclarecimentoRepository.find({
      where: { fornecedor_id: fornecedorId },
      relations: ['licitacao'],
      order: { created_at: 'DESC' }
    });
  }

  async countPendentes(licitacaoId: string): Promise<number> {
    return this.esclarecimentoRepository.count({
      where: { 
        licitacao_id: licitacaoId,
        status: StatusEsclarecimento.PENDENTE
      }
    });
  }
}
