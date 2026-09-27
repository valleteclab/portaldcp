import { BadRequestException, Body, Controller, Get, Put, Query } from '@nestjs/common';
import { AtorAtual, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import type { Ator } from '../auth/acesso/ator';
import { NumeroProcessoService } from './numero-processo.service';

/**
 * Numeração do processo administrativo do órgão (Configurações › Parâmetros de
 * licitação). O órgão vem SEMPRE do JWT; `?orgaoId=` só vale para o admin da
 * plataforma. Um órgão não lê nem altera a numeração de outro.
 */
@Controller('numero-processo')
export class NumeroProcessoController {
  constructor(private readonly numeros: NumeroProcessoService) {}

  private orgaoDo(ator: Ator, orgaoIdAdmin?: string): string {
    if (ator.admin) {
      if (!orgaoIdAdmin) throw new BadRequestException('Informe o órgão (?orgaoId=).');
      return orgaoIdAdmin;
    }
    return ator.orgaoId!;
  }

  /** Máscara em uso, a padrão e a PRÉVIA do próximo número (`?mascara=` mostra a prévia de outra máscara, sem gravar). */
  @Get('configuracao')
  @SomenteOrgao()
  configuracao(@AtorAtual() ator: Ator, @Query('mascara') mascara?: string, @Query('orgaoId') orgaoId?: string) {
    return this.numeros.configuracao(this.orgaoDo(ator, orgaoId), mascara);
  }

  /** Grava a máscara do órgão (vazio = volta ao padrão). */
  @Put('configuracao')
  @SomenteOrgao()
  async salvar(@AtorAtual() ator: Ator, @Body() body: { mascara?: string | null }, @Query('orgaoId') orgaoId?: string) {
    const orgao = this.orgaoDo(ator, orgaoId);
    return this.numeros.salvarMascara(orgao, body?.mascara ?? null, await this.numeros.nomeDoAtor(ator));
  }

  /** O número digitado está livre NESTE órgão? (aviso no formulário; a criação confere de novo). */
  @Get('disponivel')
  @SomenteOrgao()
  async disponivel(@AtorAtual() ator: Ator, @Query('numero') numero?: string, @Query('orgaoId') orgaoId?: string) {
    const orgao = this.orgaoDo(ator, orgaoId);
    const normalizado = this.numeros.normalizar(numero);
    if (!normalizado) return { numero: null, disponivel: true, gerado: true };
    try {
      await this.numeros.exigirLivre(orgao, normalizado);
      return { numero: normalizado, disponivel: true, gerado: false };
    } catch {
      return { numero: normalizado, disponivel: false, gerado: false };
    }
  }
}
