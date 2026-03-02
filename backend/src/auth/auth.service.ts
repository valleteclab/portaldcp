import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { Usuario, RoleUsuario } from '../usuarios/entities/usuario.entity';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { Role } from './roles.decorator';

export enum UserType {
  ORGAO = 'ORGAO',
  FORNECEDOR = 'FORNECEDOR',
  USUARIO = 'USUARIO',
  ADMIN = 'ADMIN', // Super admin do sistema
}

export interface JwtPayload {
  sub: string; // ID do usuário/órgão/fornecedor
  type: UserType;
  orgaoId?: string; // Para usuários do órgão
  role?: string; // ADMIN, PREGOEIRO, EQUIPE_APOIO (quando Usuario for criado)
  email?: string;
  cnpj?: string;
}

// Número de rounds para bcrypt (10-12 é recomendado)
const BCRYPT_SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(Orgao)
    private readonly orgaoRepository: Repository<Orgao>,
    @InjectRepository(Fornecedor)
    private readonly fornecedorRepository: Repository<Fornecedor>,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
  ) {}

  /**
   * Login para Super Admin do sistema
   * Credenciais definidas via variáveis de ambiente
   */
  async loginAdmin(email: string, senha: string): Promise<{ token: string; admin: { email: string; role: string } }> {
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
    const adminSenha = this.configService.get<string>('ADMIN_PASSWORD');

    if (!adminEmail || !adminSenha) {
      this.logger.error('Credenciais de admin não configuradas (ADMIN_EMAIL, ADMIN_PASSWORD)');
      throw new UnauthorizedException('Sistema não configurado para acesso administrativo');
    }

    if (email !== adminEmail || senha !== adminSenha) {
      this.logger.warn(`Tentativa de login admin falhou: ${email}`);
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    const payload: JwtPayload = {
      sub: 'super-admin',
      type: UserType.ADMIN,
      role: Role.SUPER_ADMIN,
      email: adminEmail,
    };

    const token = this.jwtService.sign(payload);

    this.logger.log(`Login admin bem-sucedido: ${email}`);

    return {
      token,
      admin: {
        email: adminEmail,
        role: Role.SUPER_ADMIN,
      },
    };
  }

  /**
   * Verifica senha com suporte a migração SHA256 -> bcrypt
   * Se a senha estiver em SHA256, migra automaticamente para bcrypt
   */
  private async verificarSenha(
    senhaDigitada: string,
    hashArmazenado: string,
    atualizarHash?: (novoHash: string) => Promise<void>,
  ): Promise<boolean> {
    if (!hashArmazenado) {
      return false;
    }

    // Verifica se é hash bcrypt (começa com $2b$ ou $2a$)
    if (hashArmazenado.startsWith('$2')) {
      return bcrypt.compare(senhaDigitada, hashArmazenado);
    }

    // Fallback: verifica SHA256 (legado)
    const sha256Hash = createHash('sha256').update(senhaDigitada).digest('hex');
    if (sha256Hash === hashArmazenado) {
      // Migra para bcrypt automaticamente
      if (atualizarHash) {
        const novoHash = await bcrypt.hash(senhaDigitada, BCRYPT_SALT_ROUNDS);
        await atualizarHash(novoHash);
      }
      return true;
    }

    return false;
  }

  /**
   * Gera hash bcrypt para nova senha
   */
  async hashSenha(senha: string): Promise<string> {
    return bcrypt.hash(senha, BCRYPT_SALT_ROUNDS);
  }

  /**
   * Valida credenciais de órgão e retorna token JWT
   */
  async loginOrgao(email: string, senha: string): Promise<{ token: string; orgao: Partial<Orgao> }> {
    const orgao = await this.orgaoRepository.findOne({
      where: { email_login: email },
    });

    if (!orgao) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    if (!orgao.ativo) {
      throw new UnauthorizedException('Órgão inativo');
    }

    // Verifica senha com migração automática para bcrypt
    const senhaValida = await this.verificarSenha(
      senha,
      orgao.senha_hash,
      async (novoHash) => {
        await this.orgaoRepository.update(orgao.id, { senha_hash: novoHash });
      },
    );

    if (!senhaValida) {
      this.logger.warn(`Login falhou para órgão: ${email} - senha inválida`);
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    const payload: JwtPayload = {
      sub: orgao.id,
      type: UserType.ORGAO,
      email: orgao.email_login,
      cnpj: orgao.cnpj,
    };

    const token = this.jwtService.sign(payload);

    this.logger.log(`Login bem-sucedido para órgão: ${orgao.nome} (${orgao.cnpj})`);

    // Remove senha do retorno
    const { senha_hash, ...orgaoSemSenha } = orgao;

    // Adiciona compatibilidade com frontend (modulos_ativos)
    const orgaoComModulos = {
      ...orgaoSemSenha,
      modulos_ativos: orgao.modulos_habilitados || [],
    };

    return {
      token,
      orgao: orgaoComModulos,
    };
  }

  /**
   * Valida credenciais de fornecedor por CNPJ e retorna token JWT
   */
  async loginFornecedor(cnpj: string, senha: string): Promise<{ token: string; fornecedor: Partial<Fornecedor> }> {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    const fornecedor = await this.fornecedorRepository.findOne({
      where: { cpf_cnpj: cnpjLimpo },
    });

    if (!fornecedor) {
      throw new UnauthorizedException('CNPJ ou senha inválidos');
    }

    // Verificar se fornecedor está suspenso
    if (fornecedor.status === 'SUSPENSO') {
      this.logger.warn(`Login bloqueado - fornecedor suspenso: ${cnpjLimpo}`);
      throw new UnauthorizedException('Seu cadastro está suspenso. Entre em contato com o suporte para regularizar sua situação.');
    }

    // Verificar se fornecedor está inativo
    if (!fornecedor.ativo) {
      this.logger.warn(`Login bloqueado - fornecedor inativo: ${cnpjLimpo}`);
      throw new UnauthorizedException('Seu cadastro está inativo. Entre em contato com o suporte.');
    }

    if (!fornecedor.senha) {
      throw new UnauthorizedException('Fornecedor não possui senha cadastrada');
    }

    // Verifica senha com migração automática para bcrypt
    const senhaValida = await this.verificarSenha(
      senha,
      fornecedor.senha,
      async (novoHash) => {
        await this.fornecedorRepository.update(fornecedor.id, { senha: novoHash });
      },
    );

    if (!senhaValida) {
      this.logger.warn(`Login falhou para fornecedor CNPJ: ${cnpjLimpo} - senha inválida`);
      throw new UnauthorizedException('CNPJ ou senha inválidos');
    }

    const payload: JwtPayload = {
      sub: fornecedor.id,
      type: UserType.FORNECEDOR,
      cnpj: fornecedor.cpf_cnpj,
      email: fornecedor.email,
    };

    const token = this.jwtService.sign(payload);

    this.logger.log(`Login bem-sucedido para fornecedor: ${fornecedor.razao_social} (${fornecedor.cpf_cnpj})`);

    // Remove senha do retorno
    const { senha: _, ...fornecedorSemSenha } = fornecedor;

    return {
      token,
      fornecedor: fornecedorSemSenha as Partial<Fornecedor>,
    };
  }

  /**
   * Valida credenciais de fornecedor por email e retorna token JWT
   */
  async loginFornecedorPorEmail(email: string, senha: string): Promise<{ token: string; fornecedor: Partial<Fornecedor> }> {
    const fornecedor = await this.fornecedorRepository.findOne({
      where: { email },
    });

    if (!fornecedor) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    // Verificar se fornecedor está suspenso
    if (fornecedor.status === 'SUSPENSO') {
      this.logger.warn(`Login bloqueado - fornecedor suspenso: ${email}`);
      throw new UnauthorizedException('Seu cadastro está suspenso. Entre em contato com o suporte para regularizar sua situação.');
    }

    // Verificar se fornecedor está inativo
    if (!fornecedor.ativo) {
      this.logger.warn(`Login bloqueado - fornecedor inativo: ${email}`);
      throw new UnauthorizedException('Seu cadastro está inativo. Entre em contato com o suporte.');
    }

    if (!fornecedor.senha) {
      throw new UnauthorizedException('Fornecedor não possui senha cadastrada');
    }

    // Verifica senha com migração automática para bcrypt
    const senhaValida = await this.verificarSenha(
      senha,
      fornecedor.senha,
      async (novoHash) => {
        await this.fornecedorRepository.update(fornecedor.id, { senha: novoHash });
      },
    );

    if (!senhaValida) {
      this.logger.warn(`Login falhou para fornecedor email: ${email} - senha inválida`);
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    const payload: JwtPayload = {
      sub: fornecedor.id,
      type: UserType.FORNECEDOR,
      cnpj: fornecedor.cpf_cnpj,
      email: fornecedor.email,
    };

    const token = this.jwtService.sign(payload);

    this.logger.log(`Login bem-sucedido para fornecedor: ${fornecedor.razao_social} (${fornecedor.email})`);

    // Remove senha do retorno
    const { senha: _, ...fornecedorSemSenha } = fornecedor;

    return {
      token,
      fornecedor: fornecedorSemSenha as Partial<Fornecedor>,
    };
  }

  /**
   * Valida token JWT e retorna payload
   */
  async validateToken(payload: JwtPayload): Promise<JwtPayload> {
    // Validações adicionais podem ser feitas aqui
    // Por exemplo, verificar se o usuário ainda existe e está ativo
    
    // Admin não precisa validação adicional
    if (payload.type === UserType.ADMIN) {
      return payload;
    }
    
    if (payload.type === UserType.ORGAO) {
      const orgao = await this.orgaoRepository.findOne({
        where: { id: payload.sub },
      });
      
      if (!orgao || !orgao.ativo) {
        throw new UnauthorizedException('Órgão não encontrado ou inativo');
      }
    } else if (payload.type === UserType.FORNECEDOR) {
      const fornecedor = await this.fornecedorRepository.findOne({
        where: { id: payload.sub },
      });
      
      if (!fornecedor) {
        throw new UnauthorizedException('Fornecedor não encontrado');
      }
    }

    return payload;
  }

  /**
   * Verifica se o usuário pertence ao órgão especificado
   */
  async verificarOrgao(payload: JwtPayload, orgaoId: string): Promise<boolean> {
    // Se o próprio token é de um órgão, verifica se é o mesmo
    if (payload.type === UserType.ORGAO) {
      return payload.sub === orgaoId;
    }

    // Se é um usuário do órgão (quando Usuario for criado)
    if (payload.type === UserType.USUARIO && payload.orgaoId) {
      return payload.orgaoId === orgaoId;
    }

    // Fornecedores não têm acesso a dados de órgãos
    return false;
  }

  /**
   * Processa login via Google OAuth
   * Retorna status para o controller redirecionar corretamente
   */
  async processarGoogleLogin(googleUser: { googleId: string; email: string; firstName: string; lastName: string; picture: string }): Promise<
    | { status: 'ATIVO'; token: string }
    | { status: 'PENDENTE'; tempToken: string; email: string }
    | { status: 'AGUARDANDO_APROVACAO'; email: string }
    | { status: 'BLOQUEADO'; email: string }
  > {
    const usuario = await this.usuarioRepository.findOne({
      where: { email: googleUser.email },
      relations: ['orgao'],
    });

    if (!usuario) {
      // Usuário novo - gerar token temporário com dados do Google para completar cadastro
      const tempPayload = {
        sub: 'google-temp',
        type: 'GOOGLE_TEMP',
        email: googleUser.email,
        nome: `${googleUser.firstName} ${googleUser.lastName}`,
        googleId: googleUser.googleId,
        picture: googleUser.picture,
      };
      const tempToken = this.jwtService.sign(tempPayload, { expiresIn: '10m' });
      return { status: 'PENDENTE', tempToken, email: googleUser.email };
    }

    // Usuário existente - verificar status
    if (usuario.status === 'BLOQUEADO' || usuario.status === 'INATIVO') {
      return { status: 'BLOQUEADO', email: usuario.email };
    }

    if (usuario.status === 'PENDENTE') {
      return { status: 'AGUARDANDO_APROVACAO', email: usuario.email };
    }

    // Atualizar google_id se ainda não vinculado
    if (!usuario.google_id) {
      await this.usuarioRepository.update(usuario.id, {
        google_id: googleUser.googleId,
        google_login: true,
        foto_url: googleUser.picture,
        ultimo_acesso: new Date(),
      });
    } else {
      await this.usuarioRepository.update(usuario.id, { ultimo_acesso: new Date() });
    }

    const payload: JwtPayload = {
      sub: usuario.id,
      type: UserType.USUARIO,
      email: usuario.email,
      role: usuario.role,
      orgaoId: usuario.orgao_id,
    };

    const token = this.jwtService.sign(payload);
    this.logger.log(`Login Google bem-sucedido: ${usuario.email}`);
    return { status: 'ATIVO', token };
  }

  /**
   * Completa o cadastro do usuário Google (seleciona órgão)
   * Cria usuário com status PENDENTE aguardando aprovação admin
   */
  async completarCadastroGoogle(tempToken: string, orgaoId: string, role?: string): Promise<{ mensagem: string; email: string }> {
    let decoded: any;
    try {
      decoded = this.jwtService.verify(tempToken);
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado. Faça login novamente.');
    }

    if (decoded.type !== 'GOOGLE_TEMP') {
      throw new UnauthorizedException('Token inválido');
    }

    const orgao = await this.orgaoRepository.findOne({ where: { id: orgaoId, ativo: true } });
    if (!orgao) {
      throw new UnauthorizedException('Órgão não encontrado ou inativo');
    }

    // Verificar se email já existe
    const existente = await this.usuarioRepository.findOne({ where: { email: decoded.email } });
    if (existente) {
      throw new UnauthorizedException('Este email já está cadastrado no sistema');
    }

    const usuario = this.usuarioRepository.create({
      nome: decoded.nome,
      email: decoded.email,
      senha_hash: createHash('sha256').update(Math.random().toString()).digest('hex'),
      google_id: decoded.googleId,
      google_login: true,
      foto_url: decoded.picture,
      orgao_id: orgaoId,
      role: (role as RoleUsuario) || RoleUsuario.EQUIPE_APOIO,
      ativo: false,
      status: 'PENDENTE',
      data_solicitacao: new Date(),
    });

    await this.usuarioRepository.save(usuario);
    this.logger.log(`Novo usuário Google aguardando aprovação: ${decoded.email} → órgão ${orgao.nome}`);

    return { mensagem: 'Cadastro enviado! Aguarde a aprovação do administrador.', email: decoded.email };
  }

  /**
   * Verifica o status de aprovação de um usuário pelo email
   */
  async verificarStatusUsuario(email: string): Promise<{ status: string; email: string }> {
    const usuario = await this.usuarioRepository.findOne({ where: { email } });
    if (!usuario) {
      return { status: 'NAO_ENCONTRADO', email };
    }
    return { status: usuario.status, email };
  }
}

