import { Injectable, HttpException, HttpStatus, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SolicitacaoAcesso, StatusSolicitacao } from './entities/solicitacao-acesso.entity';
import { Orgao, TipoOrgao, EsferaAdministrativa } from './entities/orgao.entity';
import { createHash } from 'crypto';

@Injectable()
export class SolicitacoesService {
  constructor(
    @InjectRepository(SolicitacaoAcesso)
    private solicitacaoRepository: Repository<SolicitacaoAcesso>,
    @InjectRepository(Orgao)
    private orgaoRepository: Repository<Orgao>
  ) {}

  async criar(data: {
    cnpj: string;
    razao_social: string;
    email: string;
    nome_responsavel: string;
    telefone?: string;
    cargo_responsavel?: string;
    mensagem?: string;
  }): Promise<SolicitacaoAcesso> {
    const solicitacao = this.solicitacaoRepository.create({
      ...data,
      status: StatusSolicitacao.PENDENTE
    });
    return this.solicitacaoRepository.save(solicitacao);
  }

  async listar(status?: StatusSolicitacao): Promise<SolicitacaoAcesso[]> {
    const where = status ? { status } : {};
    return this.solicitacaoRepository.find({
      where,
      order: { created_at: 'DESC' }
    });
  }

  async buscarPorId(id: string): Promise<SolicitacaoAcesso> {
    const solicitacao = await this.solicitacaoRepository.findOne({ where: { id } });
    if (!solicitacao) {
      throw new HttpException('Solicitação não encontrada', HttpStatus.NOT_FOUND);
    }
    return solicitacao;
  }

  async buscarPorCnpj(cnpj: string): Promise<SolicitacaoAcesso | null> {
    return this.solicitacaoRepository.findOne({ 
      where: { cnpj },
      order: { created_at: 'DESC' }
    });
  }

  async aprovar(id: string, data: {
    aprovado_por: string;
    criar_usuario?: boolean;
    email_login?: string;
    senha_temporaria?: string;
  }): Promise<{ solicitacao: SolicitacaoAcesso; orgao?: any; credenciais?: any }> {
    const solicitacao = await this.buscarPorId(id);

    if (solicitacao.status !== StatusSolicitacao.PENDENTE) {
      throw new HttpException('Solicitação já foi processada', HttpStatus.BAD_REQUEST);
    }

    // Criar o órgão no sistema
    let orgao;
    let credenciais;

    try {
      // Verificar se órgão já existe
      const orgaoExistente = await this.orgaoRepository.findOne({ where: { cnpj: solicitacao.cnpj } });
      
      if (orgaoExistente) {
        orgao = orgaoExistente;
      } else {
        // Gerar senha temporária (ou usar a informada pelo admin)
        const senhaTemporaria = data.senha_temporaria || this.gerarSenhaTemporaria();
        const senhaHash = createHash('sha256').update(senhaTemporaria).digest('hex');
        
        // Criar novo órgão com campos obrigatórios preenchidos
        const novoOrgao = this.orgaoRepository.create({
          codigo: solicitacao.cnpj.substring(0, 10),
          nome: solicitacao.razao_social,
          cnpj: solicitacao.cnpj,
          tipo: TipoOrgao.PREFEITURA,
          esfera: EsferaAdministrativa.MUNICIPAL,
          logradouro: 'A definir',
          bairro: 'A definir',
          cidade: 'A definir',
          uf: 'XX',
          cep: '00000-000',
          email: solicitacao.email,
          telefone: solicitacao.telefone || '',
          responsavel_nome: solicitacao.nome_responsavel,
          responsavel_cpf: '000.000.000-00',
          responsavel_cargo: solicitacao.cargo_responsavel || '',
          email_login: data.email_login || solicitacao.email,
          senha_hash: senhaHash,
          ativo: true
        });

        orgao = await this.orgaoRepository.save(novoOrgao);

        credenciais = {
          email: data.email_login || solicitacao.email,
          senha: senhaTemporaria
        };
      }
    } catch (error: any) {
      console.error('Erro ao criar órgão:', error);
      throw new HttpException('Erro ao criar órgão: ' + error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // Atualizar solicitação
    solicitacao.status = StatusSolicitacao.APROVADA;
    solicitacao.aprovado_por = data.aprovado_por;
    solicitacao.data_aprovacao = new Date();
    solicitacao.orgao_id = orgao.id;

    await this.solicitacaoRepository.save(solicitacao);

    return { solicitacao, orgao, credenciais };
  }

  async rejeitar(id: string, data: {
    motivo_rejeicao: string;
    aprovado_por: string;
  }): Promise<SolicitacaoAcesso> {
    const solicitacao = await this.buscarPorId(id);

    if (solicitacao.status !== StatusSolicitacao.PENDENTE) {
      throw new HttpException('Solicitação já foi processada', HttpStatus.BAD_REQUEST);
    }

    solicitacao.status = StatusSolicitacao.REJEITADA;
    solicitacao.motivo_rejeicao = data.motivo_rejeicao;
    solicitacao.aprovado_por = data.aprovado_por;
    solicitacao.data_aprovacao = new Date();

    return this.solicitacaoRepository.save(solicitacao);
  }

  async estatisticas(): Promise<{
    total: number;
    pendentes: number;
    aprovadas: number;
    rejeitadas: number;
  }> {
    const [total, pendentes, aprovadas, rejeitadas] = await Promise.all([
      this.solicitacaoRepository.count(),
      this.solicitacaoRepository.count({ where: { status: StatusSolicitacao.PENDENTE } }),
      this.solicitacaoRepository.count({ where: { status: StatusSolicitacao.APROVADA } }),
      this.solicitacaoRepository.count({ where: { status: StatusSolicitacao.REJEITADA } })
    ]);

    return { total, pendentes, aprovadas, rejeitadas };
  }

  private gerarSenhaTemporaria(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let senha = '';
    for (let i = 0; i < 12; i++) {
      senha += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return senha;
  }
}
