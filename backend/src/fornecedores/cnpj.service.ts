import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Interface para resposta da API
export interface CnpjApiResponse {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  natureza_juridica: string;
  capital_social: string;
  data_inicio: string;
  porte: string;
  tipo: string;
  telefone1: string | null;
  telefone2: string | null;
  email: string | null;
  situacao: {
    nome: string;
    data: string;
    motivo: string;
  };
  endereco: {
    tipo_logradouro: string;
    logradouro: string;
    numero: string;
    complemento: string | null;
    bairro: string;
    cep: string;
    uf: string;
    municipio: string;
  };
  simples: {
    optante_simples: string;
    data_opcao: string | null;
    data_exclusao: string | null;
  };
  mei: {
    optante_mei: string;
    data_opcao: string | null;
    data_exclusao: string | null;
  };
  socios: Array<{
    nome: string;
    cpf_cnpj: string;
    data_entrada: string;
    qualificacao: string;
  }>;
  atividade_principal: {
    codigo: string;
    descricao: string;
  };
  atividades_secundarias: Array<{
    codigo: string;
    descricao: string;
  }>;
}

// Interface para dados formatados para o frontend
export interface DadosCnpjFormatados {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  natureza_juridica: string;
  capital_social: number;
  data_inicio_atividade: string;
  porte: string;
  tipo_estabelecimento: string;
  telefone: string | null;
  telefone_secundario: string | null;
  email: string | null;
  situacao: {
    nome: string;
    data: string;
    motivo: string;
  };
  endereco: {
    tipo_logradouro: string;
    logradouro: string;
    numero: string;
    complemento: string | null;
    bairro: string;
    cep: string;
    uf: string;
    cidade: string;
  };
  simples: {
    optante: boolean;
    data_opcao: string | null;
    data_exclusao: string | null;
  };
  mei: {
    optante: boolean;
    data_opcao: string | null;
    data_exclusao: string | null;
  };
  socios: Array<{
    nome: string;
    cpf_cnpj: string;
    data_entrada: string;
    qualificacao: string;
  }>;
  atividade_principal: {
    codigo: string;
    descricao: string;
  };
  atividades_secundarias: Array<{
    codigo: string;
    descricao: string;
  }>;
}

@Injectable()
export class CnpjService {
  private readonly apiUrl = 'https://api.invertexto.com/v1/cnpj';
  private readonly apiToken: string;

  constructor(private configService: ConfigService) {
    // Token pode vir do .env ou usar o fornecido
    this.apiToken = this.configService.get<string>('CNPJ_API_TOKEN') || '23152|7Qqld5p4WFyYwMv2cKkVs6teNiYTBBs2';
  }

  /**
   * Remove caracteres não numéricos do CNPJ
   */
  private limparCnpj(cnpj: string): string {
    return cnpj.replace(/\D/g, '');
  }

  /**
   * Valida formato do CNPJ
   */
  private validarCnpj(cnpj: string): boolean {
    const cnpjLimpo = this.limparCnpj(cnpj);
    
    if (cnpjLimpo.length !== 14) return false;
    
    // Verifica se todos os dígitos são iguais
    if (/^(\d)\1+$/.test(cnpjLimpo)) return false;
    
    // Validação dos dígitos verificadores
    let tamanho = cnpjLimpo.length - 2;
    let numeros = cnpjLimpo.substring(0, tamanho);
    const digitos = cnpjLimpo.substring(tamanho);
    let soma = 0;
    let pos = tamanho - 7;
    
    for (let i = tamanho; i >= 1; i--) {
      soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    
    let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    if (resultado !== parseInt(digitos.charAt(0))) return false;
    
    tamanho = tamanho + 1;
    numeros = cnpjLimpo.substring(0, tamanho);
    soma = 0;
    pos = tamanho - 7;
    
    for (let i = tamanho; i >= 1; i--) {
      soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    
    resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    if (resultado !== parseInt(digitos.charAt(1))) return false;
    
    return true;
  }

  /**
   * Consulta dados do CNPJ na API externa
   */
  async consultarCnpj(cnpj: string): Promise<DadosCnpjFormatados> {
    const cnpjLimpo = this.limparCnpj(cnpj);
    
    if (!this.validarCnpj(cnpjLimpo)) {
      throw new BadRequestException('CNPJ inválido');
    }

    try {
      const url = `${this.apiUrl}/${cnpjLimpo}?token=${this.apiToken}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new BadRequestException('CNPJ não encontrado na base da Receita Federal');
        }
        if (response.status === 429) {
          throw new BadRequestException('Limite de consultas excedido. Tente novamente mais tarde.');
        }
        throw new BadRequestException('Erro ao consultar CNPJ. Tente novamente.');
      }

      const dados: CnpjApiResponse = await response.json();
      
      return this.formatarDados(dados);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('Erro ao consultar API CNPJ:', error);
      throw new BadRequestException('Erro ao consultar CNPJ. Verifique sua conexão.');
    }
  }

  /**
   * Formata os dados da API para o formato do sistema
   */
  private formatarDados(dados: CnpjApiResponse): DadosCnpjFormatados {
    return {
      cnpj: dados.cnpj,
      razao_social: dados.razao_social,
      nome_fantasia: dados.nome_fantasia,
      natureza_juridica: dados.natureza_juridica,
      capital_social: parseFloat(dados.capital_social) || 0,
      data_inicio_atividade: dados.data_inicio,
      porte: this.mapearPorte(dados.porte),
      tipo_estabelecimento: dados.tipo,
      telefone: dados.telefone1,
      telefone_secundario: dados.telefone2,
      email: dados.email,
      situacao: {
        nome: dados.situacao.nome,
        data: dados.situacao.data,
        motivo: dados.situacao.motivo,
      },
      endereco: {
        tipo_logradouro: dados.endereco.tipo_logradouro,
        logradouro: dados.endereco.logradouro,
        numero: dados.endereco.numero,
        complemento: dados.endereco.complemento,
        bairro: dados.endereco.bairro,
        cep: dados.endereco.cep,
        uf: dados.endereco.uf,
        cidade: dados.endereco.municipio,
      },
      simples: {
        optante: dados.simples.optante_simples === 'S',
        data_opcao: dados.simples.data_opcao,
        data_exclusao: dados.simples.data_exclusao,
      },
      mei: {
        optante: dados.mei.optante_mei === 'S',
        data_opcao: dados.mei.data_opcao,
        data_exclusao: dados.mei.data_exclusao,
      },
      socios: dados.socios.map(socio => ({
        nome: socio.nome,
        cpf_cnpj: socio.cpf_cnpj,
        data_entrada: socio.data_entrada,
        qualificacao: socio.qualificacao,
      })),
      atividade_principal: {
        codigo: dados.atividade_principal.codigo,
        descricao: dados.atividade_principal.descricao,
      },
      atividades_secundarias: dados.atividades_secundarias.map(ativ => ({
        codigo: ativ.codigo,
        descricao: ativ.descricao,
      })),
    };
  }

  /**
   * Mapeia o porte da empresa para o enum do sistema
   */
  private mapearPorte(porte: string): string {
    const porteNormalizado = porte.toLowerCase();
    
    if (porteNormalizado.includes('mei') || porteNormalizado.includes('microempreendedor')) {
      return 'MEI';
    }
    if (porteNormalizado.includes('micro empresa') || porteNormalizado.includes('microempresa')) {
      return 'ME';
    }
    if (porteNormalizado.includes('pequeno porte') || porteNormalizado.includes('epp')) {
      return 'EPP';
    }
    if (porteNormalizado.includes('médio') || porteNormalizado.includes('medio')) {
      return 'MEDIO';
    }
    if (porteNormalizado.includes('grande')) {
      return 'GRANDE';
    }
    
    return porte; // Retorna original se não mapear
  }
}
