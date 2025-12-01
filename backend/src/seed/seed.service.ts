import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Orgao, TipoOrgao, EsferaAdministrativa } from '../orgaos/entities/orgao.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import * as crypto from 'crypto';

@Injectable()
export class SeedService {
  constructor(
    @InjectRepository(Orgao)
    private orgaoRepository: Repository<Orgao>,
    @InjectRepository(Fornecedor)
    private fornecedorRepository: Repository<Fornecedor>,
  ) {}

  private hashSenha(senha: string): string {
    return crypto.createHash('sha256').update(senha).digest('hex');
  }

  async seedUsuariosTeste() {
    const resultados = {
      orgaos: [] as any[],
      fornecedores: [] as any[],
    };

    // Criar órgão de teste (Prefeitura)
    const orgaoExistente = await this.orgaoRepository.findOne({
      where: { email_login: 'prefeitura@teste.gov.br' },
    });

    if (!orgaoExistente) {
      const orgao = this.orgaoRepository.create({
        codigo: 'PREF001',
        nome: 'Prefeitura Municipal de Teste',
        cnpj: '12.345.678/0001-90',
        tipo: TipoOrgao.PREFEITURA,
        esfera: EsferaAdministrativa.MUNICIPAL,
        logradouro: 'Rua das Flores',
        numero: '123',
        bairro: 'Centro',
        cidade: 'Cidade Teste',
        uf: 'SP',
        cep: '01234-567',
        telefone: '(11) 1234-5678',
        email: 'contato@prefeitura.gov.br',
        email_login: 'prefeitura@teste.gov.br',
        senha_hash: this.hashSenha('prefeitura123'),
        responsavel_nome: 'João da Silva',
        responsavel_cpf: '123.456.789-00',
        responsavel_cargo: 'Prefeito',
        ativo: true,
      });
      const saved = await this.orgaoRepository.save(orgao);
      resultados.orgaos.push({
        id: saved.id,
        email: saved.email_login,
        nome: saved.nome,
        senha: 'prefeitura123',
      });
    } else {
      resultados.orgaos.push({
        id: orgaoExistente.id,
        email: orgaoExistente.email_login,
        nome: orgaoExistente.nome,
        mensagem: 'Já existia',
      });
    }

    // Criar segundo órgão (Câmara)
    const camaraExistente = await this.orgaoRepository.findOne({
      where: { email_login: 'camara@teste.gov.br' },
    });

    if (!camaraExistente) {
      const camara = this.orgaoRepository.create({
        codigo: 'CAM001',
        nome: 'Câmara Municipal de Teste',
        cnpj: '98.765.432/0001-10',
        tipo: TipoOrgao.CAMARA,
        esfera: EsferaAdministrativa.MUNICIPAL,
        logradouro: 'Praça Central',
        numero: '456',
        bairro: 'Centro',
        cidade: 'Cidade Teste',
        uf: 'SP',
        cep: '01234-568',
        telefone: '(11) 8765-4321',
        email: 'contato@camara.gov.br',
        email_login: 'camara@teste.gov.br',
        senha_hash: this.hashSenha('camara123'),
        responsavel_nome: 'Maria Santos',
        responsavel_cpf: '987.654.321-00',
        responsavel_cargo: 'Presidente',
        ativo: true,
      });
      const saved = await this.orgaoRepository.save(camara);
      resultados.orgaos.push({
        id: saved.id,
        email: saved.email_login,
        nome: saved.nome,
        senha: 'camara123',
      });
    }

    // Criar fornecedor de teste
    const fornecedorExistente = await this.fornecedorRepository.findOne({
      where: { email: 'fornecedor@teste.com' },
    });

    if (!fornecedorExistente) {
      const fornecedor = this.fornecedorRepository.create({
        cpf_cnpj: '11.222.333/0001-44',
        razao_social: 'Empresa Teste LTDA',
        nome_fantasia: 'Teste Comercial',
        email: 'fornecedor@teste.com',
        senha: this.hashSenha('fornecedor123'),
        telefone: '(11) 9999-8888',
        logradouro: 'Av. Comercial',
        numero: '789',
        bairro: 'Industrial',
        cidade: 'São Paulo',
        uf: 'SP',
        cep: '04567-890',
        representante_nome: 'Carlos Oliveira',
        representante_cpf: '111.222.333-44',
        representante_cargo: 'Diretor',
        ativo: true,
      });
      const saved = await this.fornecedorRepository.save(fornecedor);
      resultados.fornecedores.push({
        id: saved.id,
        email: saved.email,
        razaoSocial: saved.razao_social,
        senha: 'fornecedor123',
      });
    } else {
      resultados.fornecedores.push({
        id: fornecedorExistente.id,
        email: fornecedorExistente.email,
        razaoSocial: fornecedorExistente.razao_social,
        mensagem: 'Já existia',
      });
    }

    // Criar segundo fornecedor
    const fornecedor2Existente = await this.fornecedorRepository.findOne({
      where: { email: 'empresa@teste.com' },
    });

    if (!fornecedor2Existente) {
      const fornecedor2 = this.fornecedorRepository.create({
        cpf_cnpj: '55.666.777/0001-88',
        razao_social: 'Distribuidora ABC LTDA',
        nome_fantasia: 'ABC Distribuição',
        email: 'empresa@teste.com',
        senha: this.hashSenha('empresa123'),
        telefone: '(11) 7777-6666',
        logradouro: 'Rua Industrial',
        numero: '1000',
        bairro: 'Distrito Industrial',
        cidade: 'São Paulo',
        uf: 'SP',
        cep: '05678-901',
        representante_nome: 'Ana Paula',
        representante_cpf: '555.666.777-88',
        representante_cargo: 'Gerente',
        ativo: true,
      });
      const saved = await this.fornecedorRepository.save(fornecedor2);
      resultados.fornecedores.push({
        id: saved.id,
        email: saved.email,
        razaoSocial: saved.razao_social,
        senha: 'empresa123',
      });
    }

    return {
      mensagem: 'Seed de usuários executado com sucesso!',
      dados: resultados,
      credenciais: {
        orgaos: [
          { email: 'prefeitura@teste.gov.br', senha: 'prefeitura123' },
          { email: 'camara@teste.gov.br', senha: 'camara123' },
        ],
        fornecedores: [
          { email: 'fornecedor@teste.com', senha: 'fornecedor123' },
          { email: 'empresa@teste.com', senha: 'empresa123' },
        ],
      },
    };
  }

  async getStatus() {
    const totalOrgaos = await this.orgaoRepository.count();
    const totalFornecedores = await this.fornecedorRepository.count();

    return {
      status: 'ok',
      totais: {
        orgaos: totalOrgaos,
        fornecedores: totalFornecedores,
      },
    };
  }
}
