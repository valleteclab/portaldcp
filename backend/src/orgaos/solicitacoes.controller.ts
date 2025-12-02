import { Controller, Get, Post, Put, Param, Body, Query, HttpException, HttpStatus } from '@nestjs/common';
import { SolicitacoesService } from './solicitacoes.service';
import { StatusSolicitacao } from './entities/solicitacao-acesso.entity';

@Controller('solicitacoes-acesso')
export class SolicitacoesController {
  constructor(private readonly solicitacoesService: SolicitacoesService) {}

  // Endpoint público para órgãos solicitarem acesso
  @Post()
  async criar(@Body() data: {
    cnpj: string;
    razao_social: string;
    email: string;
    nome_responsavel: string;
    telefone?: string;
    cargo_responsavel?: string;
    mensagem?: string;
  }) {
    // Validar CNPJ
    const cnpjLimpo = data.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) {
      throw new HttpException('CNPJ inválido', HttpStatus.BAD_REQUEST);
    }

    // Verificar se já existe solicitação pendente para este CNPJ
    const existente = await this.solicitacoesService.buscarPorCnpj(cnpjLimpo);
    if (existente && existente.status === StatusSolicitacao.PENDENTE) {
      throw new HttpException('Já existe uma solicitação pendente para este CNPJ', HttpStatus.CONFLICT);
    }

    return this.solicitacoesService.criar({
      ...data,
      cnpj: cnpjLimpo
    });
  }

  // Listar todas as solicitações (admin)
  @Get()
  async listar(@Query('status') status?: StatusSolicitacao) {
    return this.solicitacoesService.listar(status);
  }

  // Buscar solicitação por ID
  @Get(':id')
  async buscarPorId(@Param('id') id: string) {
    return this.solicitacoesService.buscarPorId(id);
  }

  // Aprovar solicitação (admin)
  @Put(':id/aprovar')
  async aprovar(
    @Param('id') id: string,
    @Body() data: {
      aprovado_por: string;
      criar_usuario?: boolean;
      email_login?: string;
      senha_temporaria?: string;
    }
  ) {
    return this.solicitacoesService.aprovar(id, data);
  }

  // Rejeitar solicitação (admin)
  @Put(':id/rejeitar')
  async rejeitar(
    @Param('id') id: string,
    @Body() data: {
      motivo_rejeicao: string;
      aprovado_por: string;
    }
  ) {
    return this.solicitacoesService.rejeitar(id, data);
  }

  // Estatísticas (admin)
  @Get('admin/estatisticas')
  async estatisticas() {
    return this.solicitacoesService.estatisticas();
  }
}
