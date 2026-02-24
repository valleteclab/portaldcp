import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { Usuario, RoleUsuario } from './entities/usuario.entity';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { Orgao } from '../orgaos/entities/orgao.entity';

@Injectable()
export class UsuariosService {
  private readonly logger = new Logger(UsuariosService.name);

  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    @InjectRepository(Orgao)
    private readonly orgaoRepository: Repository<Orgao>,
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
    pode_aprovar_requisicoes?: boolean;
    pode_cancelar_estornar?: boolean;
    pode_liberar_contratos?: boolean;
    pode_excluir_medicao?: boolean;
    eh_fiscal_contrato?: boolean;
    pode_gerenciar_os?: boolean;
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
      pode_aprovar_requisicoes: data.pode_aprovar_requisicoes || false,
      pode_cancelar_estornar: data.pode_cancelar_estornar || false,
      pode_liberar_contratos: data.pode_liberar_contratos || false,
      pode_excluir_medicao: data.pode_excluir_medicao || false,
      eh_fiscal_contrato: data.eh_fiscal_contrato || false,
      pode_gerenciar_os: data.pode_gerenciar_os || false,
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
    pode_aprovar_requisicoes: boolean;
    pode_cancelar_estornar: boolean;
    pode_liberar_contratos: boolean;
    pode_excluir_medicao: boolean;
    eh_fiscal_contrato: boolean;
    pode_gerenciar_os: boolean;
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

  // ============ MÓDULOS DO USUÁRIO ============

  /**
   * Retorna os módulos habilitados para o usuário.
   * Se o usuário não tem módulos configurados, retorna os módulos do órgão.
   */
  async getModulosUsuario(id: string): Promise<{
    modulos_usuario: ModuloSistema[];
    modulos_orgao: ModuloSistema[];
    modulos_efetivos: ModuloSistema[];
    herdaDoOrgao: boolean;
  }> {
    const usuario = await this.findById(id);
    
    // Buscar módulos do órgão
    let modulosOrgao: ModuloSistema[] = [];
    if (usuario.orgao_id) {
      const orgao = await this.orgaoRepository.findOne({
        where: { id: usuario.orgao_id },
      });
      modulosOrgao = orgao?.modulos_habilitados || [];
    }

    const modulosUsuario = usuario.modulos_habilitados || [];
    const herdaDoOrgao = modulosUsuario.length === 0;

    // Módulos efetivos: interseção se usuário tem módulos, senão herda do órgão
    let modulosEfetivos: ModuloSistema[];
    if (herdaDoOrgao) {
      modulosEfetivos = modulosOrgao;
    } else {
      // Interseção: usuário só pode ter acesso aos módulos que o órgão tem
      modulosEfetivos = modulosUsuario.filter(m => modulosOrgao.includes(m));
    }

    return {
      modulos_usuario: modulosUsuario,
      modulos_orgao: modulosOrgao,
      modulos_efetivos: modulosEfetivos,
      herdaDoOrgao,
    };
  }

  /**
   * Atualiza os módulos habilitados para o usuário.
   * Os módulos devem ser um subconjunto dos módulos do órgão.
   */
  async atualizarModulos(id: string, modulos: ModuloSistema[]): Promise<Usuario> {
    const usuario = await this.findById(id);

    // Se o usuário está vinculado a um órgão, validar que os módulos
    // são um subconjunto dos módulos do órgão
    if (usuario.orgao_id && modulos.length > 0) {
      const orgao = await this.orgaoRepository.findOne({
        where: { id: usuario.orgao_id },
      });
      const modulosOrgao = orgao?.modulos_habilitados || [];

      // Verificar se todos os módulos solicitados estão disponíveis no órgão
      const modulosInvalidos = modulos.filter(m => !modulosOrgao.includes(m));
      if (modulosInvalidos.length > 0) {
        throw new BadRequestException(
          `Os seguintes módulos não estão habilitados para o órgão: ${modulosInvalidos.join(', ')}`
        );
      }
    }

    // Remove duplicatas
    const modulosUnicos = [...new Set(modulos)];
    
    // Se passar array vazio, salva null (herda do órgão)
    usuario.modulos_habilitados = modulosUnicos.length > 0 ? modulosUnicos : (null as any);
    
    this.logger.log(`[UsuariosService] Módulos atualizados para usuário ${id}: ${modulosUnicos}`);
    
    return await this.usuarioRepository.save(usuario);
  }
}
