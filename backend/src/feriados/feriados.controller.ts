import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { AtorAtual, AutenticacaoOpcional, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import { ehOrgao } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';
import { ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { AutorFeriado, DadosFeriado, FeriadosService } from './feriados.service';

function anoValido(v: any): number {
  const ano = Number(v) || new Date().getFullYear();
  if (ano < 2000 || ano > 2100) throw new BadRequestException('Ano inválido');
  return ano;
}

/**
 * CALENDÁRIO DE FERIADOS (plano E7a) — /api/feriados.
 *  - órgão (conta do órgão ou usuário): lê o próprio calendário, cadastra/
 *    edita/remove os PRÓPRIOS feriados (municipais, estaduais que observa,
 *    pontos facultativos) e adota pontos facultativos nacionais/estaduais;
 *  - administrador da plataforma: cadastra feriados nacionais/estaduais;
 *  - leitura pública dos dias sem expediente de um órgão (feriado não é
 *    segredo — as telas de prazo mostram o porquê da data mínima).
 */
@Controller('feriados')
export class FeriadosController {
  constructor(private readonly feriados: FeriadosService) {}

  private autor(ator: Ator): AutorFeriado {
    return { orgaoId: ehOrgao(ator) ? ator.orgaoId : null, admin: !!ator?.admin, nome: ator?.id ?? null };
  }

  @Get()
  @SomenteOrgao()
  async meuCalendario(@AtorAtual() ator: Ator, @Query('ano') ano?: string) {
    return this.feriados.calendarioDoAno(ehOrgao(ator) ? ator.orgaoId : null, anoValido(ano));
  }

  @Get('orgao/:orgaoId')
  @AutenticacaoOpcional()
  async calendarioPublico(@Param('orgaoId') orgaoId: string, @Query('ano') ano?: string) {
    if (!ehUuid(orgaoId)) throw new BadRequestException('Órgão inválido');
    const c = await this.feriados.calendarioDoAno(orgaoId, anoValido(ano));
    return { ano: c.ano, dias_sem_expediente: c.dias_sem_expediente };
  }

  @Post()
  @SomenteOrgao()
  async criar(@AtorAtual() ator: Ator, @Body() body: DadosFeriado) {
    return this.feriados.criar(this.autor(ator), body ?? ({} as any));
  }

  @Put(':id')
  @SomenteOrgao()
  async atualizar(@AtorAtual() ator: Ator, @Param('id') id: string, @Body() body: Partial<DadosFeriado> & { ativo?: boolean }) {
    if (!ehUuid(id)) throw new BadRequestException('Feriado inválido');
    return this.feriados.atualizar(this.autor(ator), id, body ?? {});
  }

  @Delete(':id')
  @SomenteOrgao()
  async remover(@AtorAtual() ator: Ator, @Param('id') id: string) {
    if (!ehUuid(id)) throw new BadRequestException('Feriado inválido');
    await this.feriados.remover(this.autor(ator), id);
    return { ok: true };
  }

  @Put(':id/adocao')
  @SomenteOrgao()
  async adotar(@AtorAtual() ator: Ator, @Param('id') id: string, @Body() body: { adotar?: boolean }) {
    if (!ehUuid(id)) throw new BadRequestException('Feriado inválido');
    if (!ehOrgao(ator)) throw new BadRequestException('Adoção de ponto facultativo é do órgão.');
    return this.feriados.adotar(ator.orgaoId, id, body?.adotar !== false);
  }
}
