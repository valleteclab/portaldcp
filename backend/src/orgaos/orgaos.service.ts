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

  // ============ CONFIGURAÇÃO PNCP ============

  async configurarPNCP(id: string, config: {
    pncp_habilitado: boolean;
    pncp_login: string;
    pncp_senha: string;
    pncp_ambiente: string;
    pncp_codigo_unidade: string;
  }): Promise<Orgao> {
    const orgao = await this.findOne(id);
    
    orgao.pncp_habilitado = config.pncp_habilitado;
    orgao.pncp_login = config.pncp_login;
    orgao.pncp_senha = config.pncp_senha;
    orgao.pncp_ambiente = config.pncp_ambiente || 'TREINO';
    orgao.pncp_codigo_unidade = config.pncp_codigo_unidade || '1';
    orgao.pncp_status_conexao = 'NAO_TESTADO';
    
    return await this.orgaoRepository.save(orgao);
  }

  async testarConexaoPNCP(id: string): Promise<{
    sucesso: boolean;
    mensagem: string;
    detalhes?: any;
  }> {
    const orgao = await this.findOne(id);
    
    if (!orgao.pncp_login || !orgao.pncp_senha) {
      throw new HttpException('Credenciais PNCP não configuradas para este órgão', HttpStatus.BAD_REQUEST);
    }

    const apiUrl = orgao.pncp_ambiente === 'PRODUCAO' 
      ? 'https://pncp.gov.br/api/pncp/v1'
      : 'https://treina.pncp.gov.br/api/pncp/v1';

    try {
      const response = await axios.post(
        `${apiUrl}/usuarios/login`,
        { 
          login: orgao.pncp_login, 
          senha: orgao.pncp_senha 
        }
      );

      const token = response.headers['authorization'];
      
      if (token) {
        // Atualizar status no banco
        orgao.pncp_ultimo_teste = new Date();
        orgao.pncp_status_conexao = 'OK';
        await this.orgaoRepository.save(orgao);

        return {
          sucesso: true,
          mensagem: 'Conexão com PNCP realizada com sucesso!',
          detalhes: {
            ambiente: orgao.pncp_ambiente,
            cnpj: orgao.cnpj,
            dataUltimoTeste: orgao.pncp_ultimo_teste
          }
        };
      } else {
        throw new Error('Token não retornado');
      }
    } catch (error: any) {
      // Atualizar status de erro
      orgao.pncp_ultimo_teste = new Date();
      orgao.pncp_status_conexao = 'ERRO';
      await this.orgaoRepository.save(orgao);

      const mensagemErro = error.response?.data?.message || error.message || 'Erro desconhecido';
      
      return {
        sucesso: false,
        mensagem: `Falha na conexão: ${mensagemErro}`,
        detalhes: {
          ambiente: orgao.pncp_ambiente,
          erro: mensagemErro
        }
      };
    }
  }

  async statusPNCP(id: string): Promise<{
    habilitado: boolean;
    configurado: boolean;
    ambiente: string;
    ultimoTeste: Date | null;
    statusConexao: string;
  }> {
    const orgao = await this.findOne(id);
    
    return {
      habilitado: orgao.pncp_habilitado || false,
      configurado: !!(orgao.pncp_login && orgao.pncp_senha),
      ambiente: orgao.pncp_ambiente || 'NAO_CONFIGURADO',
      ultimoTeste: orgao.pncp_ultimo_teste || null,
      statusConexao: orgao.pncp_status_conexao || 'NAO_TESTADO'
    };
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
