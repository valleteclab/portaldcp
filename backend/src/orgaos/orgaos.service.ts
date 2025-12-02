import { Injectable, ConflictException, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Orgao } from './entities/orgao.entity';
import { CreateOrgaoDto } from './dto/create-orgao.dto';
import axios from 'axios';

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

  // ============ VINCULAÇÃO PNCP ============
  // A plataforma LicitaFácil tem UMA credencial no PNCP
  // Aqui gerenciamos quais órgãos estão vinculados à plataforma

  async vincularPNCP(id: string, config: {
    pncp_vinculado: boolean;
    pncp_codigo_unidade: string;
  }): Promise<Orgao> {
    const orgao = await this.findOne(id);
    
    orgao.pncp_vinculado = config.pncp_vinculado;
    orgao.pncp_codigo_unidade = config.pncp_codigo_unidade || '1';
    orgao.pncp_data_vinculacao = config.pncp_vinculado ? new Date() : undefined as any;
    orgao.pncp_status = config.pncp_vinculado ? 'VINCULADO' : 'PENDENTE';
    
    return await this.orgaoRepository.save(orgao);
  }

  async statusPNCP(id: string): Promise<{
    vinculado: boolean;
    codigoUnidade: string;
    dataVinculacao: Date | null;
    ultimoEnvio: Date | null;
    status: string;
  }> {
    const orgao = await this.findOne(id);
    
    return {
      vinculado: orgao.pncp_vinculado || false,
      codigoUnidade: orgao.pncp_codigo_unidade || '1',
      dataVinculacao: orgao.pncp_data_vinculacao || null,
      ultimoEnvio: orgao.pncp_ultimo_envio || null,
      status: orgao.pncp_status || 'PENDENTE'
    };
  }

  async atualizarUltimoEnvio(id: string): Promise<Orgao> {
    const orgao = await this.findOne(id);
    orgao.pncp_ultimo_envio = new Date();
    return await this.orgaoRepository.save(orgao);
  }

  // Buscar todos os órgãos (incluindo inativos) - para admin
  async findAllAdmin(): Promise<Orgao[]> {
    return await this.orgaoRepository.find({
      order: { nome: 'ASC' }
    });
  }

  // Reativar órgão
  async reactivate(id: string): Promise<Orgao> {
    const orgao = await this.findOne(id);
    orgao.ativo = true;
    return await this.orgaoRepository.save(orgao);
  }
}
