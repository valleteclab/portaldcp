import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AtorAtual } from '../../auth/acesso/acesso.decorators';
import type { Ator } from '../../auth/acesso/ator';
import { DonoFaseInternaGuard } from '../dono-fase-interna.guard';
import { AbaCaixa, TarefasService } from './tarefas.service';

const ABAS: AbaCaixa[] = ['para-mim', 'aguardando', 'concluidas'];

/** Administração do órgão: login do órgão, usuário com papel ADMIN ou admin da plataforma. */
function exigirAdminDoOrgao(ator: Ator) {
  if (ator.admin || ator.tipo === 'ORGAO' || (ator.tipo === 'USUARIO' && ator.role === 'ADMIN')) return;
  throw new ForbiddenException('Só o administrador do órgão altera a configuração da fase interna');
}

function orgaoDoAtor(ator: Ator, informado?: string): string {
  if (ator.admin) {
    if (!informado) throw new BadRequestException('Informe orgao_id');
    return informado;
  }
  return ator.orgaoId!;
}

/**
 * CAIXA DE TAREFAS (Entrega 2). Só o lado da Administração (anônimo 401,
 * fornecedor 403 — DonoFaseInternaGuard). Sempre o órgão e o usuário do
 * token: a caixa mostra as tarefas do usuário e as do papel/setor dele, dentro
 * do órgão dele. Tarefa de outro órgão: 403 na escrita.
 */
@Controller('tarefas')
@UseGuards(DonoFaseInternaGuard)
export class TarefasController {
  constructor(private readonly tarefas: TarefasService) {}

  /** ?aba=para-mim (padrão) | aguardando | concluidas. Admin da plataforma: ?orgao_id=. */
  @Get()
  caixa(@AtorAtual() ator: Ator, @Query('aba') aba?: string, @Query('orgao_id') orgaoId?: string) {
    const a = (ABAS.includes(aba as AbaCaixa) ? aba : 'para-mim') as AbaCaixa;
    return this.tarefas.caixa(ator, a, orgaoId);
  }

  /** Badge do menu: abertas para mim e atrasadas. */
  @Get('contagem')
  contagem(@AtorAtual() ator: Ator, @Query('orgao_id') orgaoId?: string) {
    return this.tarefas.contagem(ator, orgaoId);
  }

  /** Reatribui a outra pessoa do MESMO órgão ({ usuario_id, motivo? }). */
  @Post(':id/reatribuir')
  reatribuir(@Param('id') id: string, @Body() body: { usuario_id?: string; motivo?: string }, @AtorAtual() ator: Ator) {
    return this.tarefas.reatribuir(ator, id, body ?? {});
  }

  /** "Assumir tarefa do setor": a tarefa do meu papel/setor passa a ser minha. */
  @Post(':id/assumir')
  assumir(@Param('id') id: string, @AtorAtual() ator: Ator) {
    return this.tarefas.assumir(ator, id);
  }
}

/**
 * CONFIGURAÇÃO DA FASE INTERNA DO ÓRGÃO e PAPÉIS dos usuários (Entrega 2).
 * Leitura: qualquer usuário do órgão (a tela de reatribuir lista as pessoas).
 * Escrita: só o administrador do órgão. Sempre o órgão do token.
 */
@Controller('fase-interna/configuracao')
@UseGuards(DonoFaseInternaGuard)
export class ConfiguracaoFaseInternaController {
  constructor(private readonly tarefas: TarefasService) {}

  @Get()
  obter(@AtorAtual() ator: Ator, @Query('orgao_id') orgaoId?: string) {
    return this.tarefas.configuracaoParaTela(orgaoDoAtor(ator, orgaoId));
  }

  @Put()
  async salvar(@AtorAtual() ator: Ator, @Body() body: any, @Query('orgao_id') orgaoId?: string) {
    exigirAdminDoOrgao(ator);
    return this.tarefas.salvarConfiguracao(orgaoDoAtor(ator, orgaoId), body, await this.tarefas.autor(ator));
  }

  @Get('usuarios')
  usuarios(@AtorAtual() ator: Ator, @Query('orgao_id') orgaoId?: string) {
    return this.tarefas.usuariosDoOrgao(orgaoDoAtor(ator, orgaoId));
  }

  /** { papeis: PapelFaseInterna[], setor_id: string | null } */
  @Put('usuarios/:usuarioId')
  atualizarPapeis(
    @Param('usuarioId') usuarioId: string,
    @Body() body: { papeis?: string[]; setor_id?: string | null },
    @AtorAtual() ator: Ator,
    @Query('orgao_id') orgaoId?: string,
  ) {
    exigirAdminDoOrgao(ator);
    return this.tarefas.atualizarPapeis(orgaoDoAtor(ator, orgaoId), usuarioId, body ?? {});
  }
}

/** Etapas da fase interna na tela do processo (órgão dono; outro órgão 404). */
@Controller('fase-interna')
@UseGuards(DonoFaseInternaGuard)
export class EtapasFaseInternaController {
  constructor(private readonly tarefas: TarefasService) {}

  @Get(':licitacaoId/etapas')
  etapas(@Param('licitacaoId') licitacaoId: string) {
    return this.tarefas.etapasDoProcesso(licitacaoId);
  }
}
