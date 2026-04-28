import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    @InjectRepository(Fornecedor)
    private readonly fornecedorRepository: Repository<Fornecedor>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKeyHeader = request.headers['x-api-key'];
    const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;

    if (!apiKey) {
      throw new UnauthorizedException('X-Api-Key header e obrigatorio');
    }

    const hash = createHash('sha256').update(apiKey).digest('hex');
    const fornecedor = await this.fornecedorRepository.findOne({
      where: { api_key_hash: hash },
      select: ['id', 'razao_social', 'cpf_cnpj', 'telefone', 'email'],
    });

    if (!fornecedor) {
      throw new UnauthorizedException('API Key invalida ou revogada');
    }

    request.fornecedor = {
      id: fornecedor.id,
      razao_social: fornecedor.razao_social,
      cpf_cnpj: fornecedor.cpf_cnpj,
      telefone: fornecedor.telefone,
      email: fornecedor.email,
    };
    request.apiKey = apiKey;

    return true;
  }
}
