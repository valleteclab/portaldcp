import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Orgao } from './entities/orgao.entity';
import { CreateOrgaoDto } from './dto/create-orgao.dto';

@Injectable()
export class OrgaosService {
  constructor(
    @InjectRepository(Orgao)
    private readonly orgaoRepository: Repository<Orgao>,
  ) {}

  async create(createOrgaoDto: CreateOrgaoDto): Promise<Orgao> {
    // Verifica duplicidade por CNPJ
    const existingCnpj = await this.orgaoRepository.findOne({
      where: { cnpj: createOrgaoDto.cnpj },
    });
    if (existingCnpj) {
      throw new ConflictException('Já existe um órgão cadastrado com este CNPJ');
    }

    // Verifica duplicidade por código
    const existingCodigo = await this.orgaoRepository.findOne({
      where: { codigo: createOrgaoDto.codigo },
    });
    if (existingCodigo) {
      throw new ConflictException('Já existe um órgão cadastrado com este código');
    }

    const orgao = this.orgaoRepository.create(createOrgaoDto);
    return await this.orgaoRepository.save(orgao);
  }

  async findAll(): Promise<Orgao[]> {
    return await this.orgaoRepository.find({
      where: { ativo: true },
      order: { nome: 'ASC' }
    });
  }

  async findOne(id: string): Promise<Orgao> {
    const orgao = await this.orgaoRepository.findOneBy({ id });
    if (!orgao) {
      throw new NotFoundException(`Órgão com ID ${id} não encontrado`);
    }
    return orgao;
  }

  async findByCodigo(codigo: string): Promise<Orgao> {
    const orgao = await this.orgaoRepository.findOneBy({ codigo });
    if (!orgao) {
      throw new NotFoundException(`Órgão com código ${codigo} não encontrado`);
    }
    return orgao;
  }

  async findByEmail(email: string): Promise<Orgao | null> {
    return await this.orgaoRepository.findOneBy({ email_login: email });
  }

  async update(id: string, updateData: Partial<CreateOrgaoDto>): Promise<Orgao> {
    const orgao = await this.findOne(id);
    Object.assign(orgao, updateData);
    return await this.orgaoRepository.save(orgao);
  }

  async deactivate(id: string): Promise<Orgao> {
    const orgao = await this.findOne(id);
    orgao.ativo = false;
    return await this.orgaoRepository.save(orgao);
  }
}
