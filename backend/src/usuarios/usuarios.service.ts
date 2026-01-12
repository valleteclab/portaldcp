import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { Usuario, RoleUsuario } from './entities/usuario.entity';

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
  ) {}

  async create(data: {
    nome: string;
    email: string;
    senha: string;
    cpf?: string;
    telefone?: string;
    cargo?: string;
    role?: RoleUsuario;
    orgao_id?: string;
  }): Promise<Usuario> {
    const existente = await this.usuarioRepository.findOneBy({ email: data.email });
    if (existente) {
      throw new ConflictException('Email já cadastrado');
    }

    const senhaHash = createHash('sha256').update(data.senha).digest('hex');

    const usuario = this.usuarioRepository.create({
      nome: data.nome,
      email: data.email,
      senha_hash: senhaHash,
      cpf: data.cpf,
      telefone: data.telefone,
      cargo: data.cargo,
      role: data.role || RoleUsuario.EQUIPE_APOIO,
      orgao_id: data.orgao_id,
      ativo: true,
    });

    return await this.usuarioRepository.save(usuario);
  }

  async findAll(orgaoId?: string): Promise<Usuario[]> {
    const where: any = {};
    if (orgaoId) {
      where.orgao_id = orgaoId;
    }
    return await this.usuarioRepository.find({
      where,
      relations: ['orgao'],
      order: { nome: 'ASC' },
    });
  }

  async findById(id: string): Promise<Usuario> {
    const usuario = await this.usuarioRepository.findOne({
      where: { id },
      relations: ['orgao'],
    });
    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return usuario;
  }

  async findByEmail(email: string): Promise<Usuario | null> {
    return await this.usuarioRepository.findOne({
      where: { email },
      relations: ['orgao'],
    });
  }

  async findPregoeiros(orgaoId: string): Promise<Usuario[]> {
    return await this.usuarioRepository.find({
      where: {
        orgao_id: orgaoId,
        role: RoleUsuario.PREGOEIRO,
        ativo: true,
      },
      order: { nome: 'ASC' },
    });
  }

  async update(id: string, data: Partial<{
    nome: string;
    email: string;
    cpf: string;
    telefone: string;
    cargo: string;
    role: RoleUsuario;
    orgao_id: string;
    ativo: boolean;
  }>): Promise<Usuario> {
    const usuario = await this.findById(id);

    if (data.email && data.email !== usuario.email) {
      const existente = await this.usuarioRepository.findOneBy({ email: data.email });
      if (existente) {
        throw new ConflictException('Email já cadastrado');
      }
    }

    // Se orgao_id mudou, limpar a relação para forçar reload
    if (data.orgao_id && data.orgao_id !== usuario.orgao_id) {
      usuario.orgao = null as any;
    }

    Object.assign(usuario, data);
    const saved = await this.usuarioRepository.save(usuario);
    
    // Recarregar com a relação atualizada
    return await this.findById(saved.id);
  }

  async alterarSenha(id: string, senhaAtual: string, novaSenha: string): Promise<void> {
    const usuario = await this.findById(id);

    const senhaAtualHash = createHash('sha256').update(senhaAtual).digest('hex');
    if (usuario.senha_hash !== senhaAtualHash) {
      throw new BadRequestException('Senha atual incorreta');
    }

    usuario.senha_hash = createHash('sha256').update(novaSenha).digest('hex');
    await this.usuarioRepository.save(usuario);
  }

  async login(email: string, senha: string): Promise<Usuario> {
    const usuario = await this.findByEmail(email);
    if (!usuario) {
      throw new BadRequestException('Email ou senha inválidos');
    }

    if (!usuario.ativo) {
      throw new BadRequestException('Usuário inativo');
    }

    const senhaHash = createHash('sha256').update(senha).digest('hex');
    if (usuario.senha_hash !== senhaHash) {
      throw new BadRequestException('Email ou senha inválidos');
    }

    usuario.ultimo_acesso = new Date();
    await this.usuarioRepository.save(usuario);

    return usuario;
  }

  async delete(id: string): Promise<void> {
    const usuario = await this.findById(id);
    await this.usuarioRepository.remove(usuario);
  }

  async desativar(id: string): Promise<Usuario> {
    const usuario = await this.findById(id);
    usuario.ativo = false;
    return await this.usuarioRepository.save(usuario);
  }
}
