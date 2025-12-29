import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { createHash } from 'crypto';

export enum UserType {
  ORGAO = 'ORGAO',
  FORNECEDOR = 'FORNECEDOR',
  USUARIO = 'USUARIO', // Para futuro quando entidade Usuario for criada
}

export interface JwtPayload {
  sub: string; // ID do usuário/órgão/fornecedor
  type: UserType;
  orgaoId?: string; // Para usuários do órgão
  role?: string; // ADMIN, PREGOEIRO, EQUIPE_APOIO (quando Usuario for criado)
  email?: string;
  cnpj?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(Orgao)
    private readonly orgaoRepository: Repository<Orgao>,
    @InjectRepository(Fornecedor)
    private readonly fornecedorRepository: Repository<Fornecedor>,
  ) {}

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

    const senhaHash = createHash('sha256').update(senha).digest('hex');
    if (orgao.senha_hash !== senhaHash) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    const payload: JwtPayload = {
      sub: orgao.id,
      type: UserType.ORGAO,
      email: orgao.email_login,
      cnpj: orgao.cnpj,
    };

    const token = this.jwtService.sign(payload);

    // Remove senha do retorno
    const { senha_hash, ...orgaoSemSenha } = orgao;

    return {
      token,
      orgao: orgaoSemSenha,
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

    if (!fornecedor.senha) {
      throw new UnauthorizedException('Fornecedor não possui senha cadastrada');
    }

    const senhaHash = createHash('sha256').update(senha).digest('hex');
    if (fornecedor.senha !== senhaHash) {
      throw new UnauthorizedException('CNPJ ou senha inválidos');
    }

    const payload: JwtPayload = {
      sub: fornecedor.id,
      type: UserType.FORNECEDOR,
      cnpj: fornecedor.cpf_cnpj,
      email: fornecedor.email,
    };

    const token = this.jwtService.sign(payload);

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

    if (!fornecedor.senha) {
      throw new UnauthorizedException('Fornecedor não possui senha cadastrada');
    }

    const senhaHash = createHash('sha256').update(senha).digest('hex');
    if (fornecedor.senha !== senhaHash) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    const payload: JwtPayload = {
      sub: fornecedor.id,
      type: UserType.FORNECEDOR,
      cnpj: fornecedor.cpf_cnpj,
      email: fornecedor.email,
    };

    const token = this.jwtService.sign(payload);

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
}

