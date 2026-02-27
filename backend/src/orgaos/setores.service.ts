import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setor } from './entities/setor.entity';
import { Orgao } from './entities/orgao.entity';
import { Requisicao } from '../almoxarifado/entities/requisicao.entity';
import { CreateSetorDto } from './dto/create-setor.dto';
import { UpdateSetorDto } from './dto/update-setor.dto';

@Injectable()
export class SetoresService {
  constructor(
    @InjectRepository(Setor)
    private readonly setorRepository: Repository<Setor>,
    @InjectRepository(Orgao)
    private readonly orgaoRepository: Repository<Orgao>,
    @InjectRepository(Requisicao)
    private readonly requisicaoRepository: Repository<Requisicao>,
  ) {}

  async findByOrgao(orgaoId: string): Promise<Setor[]> {
    return this.setorRepository.find({
      where: { orgao_id: orgaoId },
      order: { codigo: 'ASC' },
    });
  }

  async findById(id: string): Promise<Setor> {
    const setor = await this.setorRepository.findOne({ where: { id } });
    if (!setor) {
      throw new HttpException('Setor não encontrado', HttpStatus.NOT_FOUND);
    }
    return setor;
  }

  async create(orgaoId: string, dto: CreateSetorDto): Promise<Setor> {
    const orgao = await this.orgaoRepository.findOne({ where: { id: orgaoId } });
    if (!orgao) {
      throw new HttpException('Órgão não encontrado', HttpStatus.NOT_FOUND);
    }

    const existente = await this.setorRepository.findOne({
      where: { orgao_id: orgaoId, codigo: dto.codigo },
    });
    if (existente) {
      throw new HttpException('Já existe um setor com este código', HttpStatus.CONFLICT);
    }

    const setor = this.setorRepository.create({
      orgao_id: orgaoId,
      codigo: dto.codigo,
      nome: dto.nome,
    });
    return this.setorRepository.save(setor);
  }

  async update(orgaoId: string, id: string, dto: UpdateSetorDto): Promise<Setor> {
    const setor = await this.findById(id);
    if (setor.orgao_id !== orgaoId) {
      throw new HttpException('Setor não pertence a este órgão', HttpStatus.FORBIDDEN);
    }

    if (dto.codigo !== undefined) {
      const existente = await this.setorRepository.findOne({
        where: { orgao_id: orgaoId, codigo: dto.codigo },
      });
      if (existente && existente.id !== id) {
        throw new HttpException('Já existe um setor com este código', HttpStatus.CONFLICT);
      }
    }

    Object.assign(setor, dto);
    return this.setorRepository.save(setor);
  }

  async delete(orgaoId: string, id: string): Promise<void> {
    const setor = await this.findById(id);
    if (setor.orgao_id !== orgaoId) {
      throw new HttpException('Setor não pertence a este órgão', HttpStatus.FORBIDDEN);
    }

    // Verificar se o setor está em uso em requisições (setor_solicitante ou codigo_setor)
    const emUso = await this.requisicaoRepository
      .createQueryBuilder('r')
      .where('r.orgao_id = :orgaoId', { orgaoId })
      .andWhere(
        '(r.setor_solicitante = :nome OR r.codigo_setor = :codigo)',
        { nome: setor.nome, codigo: setor.codigo },
      )
      .getCount();

    if (emUso > 0) {
      throw new HttpException(
        `Não é possível excluir. Este setor está vinculado a ${emUso} requisição(ões) ou ordem(ns) de serviço.`,
        HttpStatus.CONFLICT,
      );
    }

    await this.setorRepository.remove(setor);
  }
}
