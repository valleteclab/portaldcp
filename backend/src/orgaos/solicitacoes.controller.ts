import { Controller, Get, Post, Put, Param, Body, Query, HttpException, HttpStatus, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminGuard } from '../auth/admin.guard';
import { Public } from '../auth/public.decorator';
import { SolicitacoesService } from './solicitacoes.service';
import { StatusSolicitacao } from './entities/solicitacao-acesso.entity';

@Controller('solicitacoes-acesso')
export class SolicitacoesController {
  constructor(private readonly solicitacoesService: SolicitacoesService) {}

  /**
   * Pedido PÚBLICO de acesso de um órgão (tela /solicitar-acesso, sem login).
   * Só registra a solicitação PENDENTE — nenhum órgão/login é criado até o
   * admin da plataforma aprovar. Limite de 5 pedidos/min por IP; só os campos
   * do formulário são aceitos (status, órgão e aprovação nunca vêm do corpo).
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post()
  async criar(@Body() data: Record<string, unknown>) {
    const texto = (campo: string, max: number, obrigatorio = false): string | undefined => {
      const v = data?.[campo];
      if (v === undefined || v === null || v === '') {
        if (obrigatorio) throw new HttpException(`Campo obrigatório: ${campo}`, HttpStatus.BAD_REQUEST);
        return undefined;
      }
      if (typeof v !== 'string') throw new HttpException(`Campo inválido: ${campo}`, HttpStatus.BAD_REQUEST);
      const t = v.trim();
      if (obrigatorio && !t) throw new HttpException(`Campo obrigatório: ${campo}`, HttpStatus.BAD_REQUEST);
      if (t.length > max) throw new HttpException(`Campo muito longo: ${campo} (máx. ${max})`, HttpStatus.BAD_REQUEST);
      return t || undefined;
    };

    const cnpjLimpo = (texto('cnpj', 20, true) as string).replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) {
      throw new HttpException('CNPJ inválido', HttpStatus.BAD_REQUEST);
    }
    const email = texto('email', 200, true) as string;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpException('E-mail inválido', HttpStatus.BAD_REQUEST);
    }
    const dados = {
      cnpj: cnpjLimpo,
      razao_social: texto('razao_social', 300, true) as string,
      email,
      nome_responsavel: texto('nome_responsavel', 200, true) as string,
      telefone: texto('telefone', 30),
      cargo_responsavel: texto('cargo_responsavel', 120),
      mensagem: texto('mensagem', 2000),
    };

    // Verificar se já existe solicitação pendente para este CNPJ
    const existente = await this.solicitacoesService.buscarPorCnpj(cnpjLimpo);
    if (existente && existente.status === StatusSolicitacao.PENDENTE) {
      throw new HttpException('Já existe uma solicitação pendente para este CNPJ', HttpStatus.CONFLICT);
    }

    return this.solicitacoesService.criar(dados);
  }

  // Listar todas as solicitações (admin)
  @Get()
  @UseGuards(AdminGuard)
  async listar(@Query('status') status?: StatusSolicitacao) {
    return this.solicitacoesService.listar(status);
  }

  // Buscar solicitação por ID
  @Get(':id')
  @UseGuards(AdminGuard)
  async buscarPorId(@Param('id') id: string) {
    return this.solicitacoesService.buscarPorId(id);
  }

  // Aprovar solicitação (admin)
  @Put(':id/aprovar')
  @UseGuards(AdminGuard)
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
  @UseGuards(AdminGuard)
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
  @UseGuards(AdminGuard)
  async estatisticas() {
    return this.solicitacoesService.estatisticas();
  }
}
