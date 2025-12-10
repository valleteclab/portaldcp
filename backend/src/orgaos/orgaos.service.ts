import { Injectable, ConflictException, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Orgao } from './entities/orgao.entity';
import { CreateOrgaoDto } from './dto/create-orgao.dto';
import axios from 'axios';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class OrgaosService {
  constructor(
    @InjectRepository(Orgao)
    private readonly orgaoRepository: Repository<Orgao>,
  ) {}

  // ============ CRIPTOGRAFIA ============
  
  private getEncryptionKey(): string {
    // Chave de criptografia do ambiente (em produção, usar variável de ambiente)
    return process.env.PNCP_ENCRYPTION_KEY || 'licitafacil-pncp-encryption-key-32';
  }

  private encryptText(text: string): string {
    const key = Buffer.from(this.getEncryptionKey().padEnd(32, '0').substring(0, 32));
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decryptText(encryptedText: string): string {
    const key = Buffer.from(this.getEncryptionKey().padEnd(32, '0').substring(0, 32));
    const textParts = encryptedText.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encrypted = textParts.join(':');
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

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

  async findByCnpj(cnpj: string): Promise<Orgao | null> {
    return await this.orgaoRepository.findOneBy({ cnpj });
  }

  async resetCredenciais(cnpj: string, email: string, senha: string): Promise<Orgao> {
    const cnpjLimpo = cnpj.replace(/\D/g, '');

    // Busca órgão ignorando máscara do CNPJ
    const todos = await this.orgaoRepository.find();
    const orgao = todos.find(o => (o.cnpj || '').replace(/\D/g, '') === cnpjLimpo);

    if (!orgao) {
      throw new NotFoundException(`Órgão com CNPJ ${cnpj} não encontrado`);
    }

    // Atualiza credenciais de acesso
    orgao.email_login = email;
    orgao.senha_hash = createHash('sha256').update(senha).digest('hex');
    orgao.ativo = true;

    return await this.orgaoRepository.save(orgao);
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
