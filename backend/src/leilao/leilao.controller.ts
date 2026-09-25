import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { createReadStream } from 'fs';
import { AcessoLicitacaoService, ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { AtorAtual, AutenticacaoOpcional, OrgaoOuFornecedor, SomenteFornecedor, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import { ehFornecedor, ehOrgao } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';
import { atorTransicaoDe } from '../licitacoes/transicoes/transicoes.tipos';
import { LeilaoService, TAMANHO_MAXIMO_COMPROVANTE, TAMANHO_MAXIMO_FOTO, VisaoLeilao } from './leilao.service';

/**
 * LEILÃO (Lei 14.133 art. 31; plano E7c) — `/api/leilao/licitacao/:id/...`
 *
 * AUTORIZAÇÃO (E1a):
 *  - edital (configuração, bens, fotos), declaração de arrematantes,
 *    convocação/confirmação do pagamento, inadimplência → órgão DONO;
 *  - comprovante de pagamento → o ARREMATANTE do token (a própria arrematação);
 *  - painel: órgão dono (tudo); arrematante (as suas arrematações); público
 *    (edital publicado: bens, avaliação, preço mínimo, fotos; resultado só
 *    depois da homologação). Comprovante e termo: órgão dono ou o arrematante.
 */
@Controller('leilao/licitacao/:licitacaoId')
export class LeilaoController {
  constructor(
    private readonly leilao: LeilaoService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  private async existe(id: string): Promise<string> {
    if (!ehUuid(id) || !(await this.acesso.orgaoDaLicitacao(id))) throw new NotFoundException('Leilão não encontrado');
    return id;
  }

  private async visao(ator: Ator | null, id: string): Promise<VisaoLeilao> {
    if (ator && ehOrgao(ator)) {
      const orgao = await this.acesso.orgaoDaLicitacao(id);
      if (orgao === ator.orgaoId) return { tipo: 'ORGAO' };
    }
    if (ator?.admin) return { tipo: 'ORGAO' };
    if (ator && ehFornecedor(ator)) return { tipo: 'FORNECEDOR', fornecedorId: ator.fornecedorId };
    return { tipo: 'PUBLICO' };
  }

  @AutenticacaoOpcional()
  @Get()
  async painel(@Param('licitacaoId') id: string, @AtorAtual() ator: Ator | null) {
    return this.leilao.painel(await this.existe(id), await this.visao(ator, id));
  }

  // --- Edital (fase interna) -----------------------------------------------

  @SomenteOrgao()
  @Put('configuracao')
  async configuracao(@Param('licitacaoId') id: string, @Body() body: Record<string, any>, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    return this.leilao.salvarConfiguracao(id, body ?? {});
  }

  @SomenteOrgao()
  @Put('bens/:itemId')
  async bem(@Param('licitacaoId') id: string, @Param('itemId') itemId: string, @Body() body: Record<string, any>, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    if (!ehUuid(itemId)) throw new NotFoundException('Item não encontrado');
    return this.leilao.salvarBem(id, itemId, body ?? {});
  }

  @SomenteOrgao()
  @Post('bens/:itemId/fotos')
  @UseInterceptors(FileInterceptor('arquivo', { storage: memoryStorage(), limits: { fileSize: TAMANHO_MAXIMO_FOTO, files: 1 } }))
  async foto(@Param('licitacaoId') id: string, @Param('itemId') itemId: string, @UploadedFile() arquivo: Express.Multer.File, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    if (!ehUuid(itemId)) throw new NotFoundException('Item não encontrado');
    return this.leilao.adicionarFoto(id, itemId, arquivo ?? null);
  }

  @SomenteOrgao()
  @Delete('bens/:itemId/fotos')
  async removerFoto(@Param('licitacaoId') id: string, @Param('itemId') itemId: string, @Query('url') url: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    return this.leilao.removerFoto(id, itemId, String(url ?? ''));
  }

  // --- Julgamento e pagamento ---------------------------------------------

  @SomenteOrgao()
  @Post('arrematantes/declarar')
  async declarar(@Param('licitacaoId') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    return this.leilao.declararArrematantes(id, atorTransicaoDe(ator));
  }

  @SomenteOrgao()
  @Post('pagamento/convocar')
  async convocar(@Param('licitacaoId') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    return this.leilao.convocarPagamento(id, atorTransicaoDe(ator));
  }

  @SomenteFornecedor()
  @Post('arrematacoes/:arrId/pagamento')
  @UseInterceptors(FileInterceptor('comprovante', { storage: memoryStorage(), limits: { fileSize: TAMANHO_MAXIMO_COMPROVANTE, files: 1 } }))
  async informarPagamento(
    @Param('licitacaoId') id: string,
    @Param('arrId') arrId: string,
    @UploadedFile() arquivo: Express.Multer.File,
    @AtorAtual() ator: Ator,
  ) {
    if (!ehUuid(arrId)) throw new NotFoundException('Arrematação não encontrada');
    return this.leilao.informarPagamento(await this.existe(id), arrId, this.acesso.fornecedorDoToken(ator), arquivo ?? null);
  }

  @SomenteOrgao()
  @Post('arrematacoes/:arrId/confirmar-pagamento')
  async confirmar(@Param('licitacaoId') id: string, @Param('arrId') arrId: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    if (!ehUuid(arrId)) throw new NotFoundException('Arrematação não encontrada');
    return this.leilao.confirmarPagamento(id, arrId, atorTransicaoDe(ator));
  }

  @SomenteOrgao()
  @Post('arrematacoes/:arrId/inadimplencia')
  async inadimplencia(@Param('licitacaoId') id: string, @Param('arrId') arrId: string, @Body() body: { motivo?: string }, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    if (!ehUuid(arrId)) throw new NotFoundException('Arrematação não encontrada');
    return this.leilao.declararInadimplencia(id, arrId, body?.motivo ?? '', atorTransicaoDe(ator));
  }

  @OrgaoOuFornecedor()
  @Get('arrematacoes/:arrId/comprovante')
  async comprovante(@Param('licitacaoId') id: string, @Param('arrId') arrId: string, @AtorAtual() ator: Ator) {
    if (!ehUuid(arrId)) throw new NotFoundException('Comprovante não encontrado');
    const a = await this.leilao.comprovante(await this.existe(id), arrId, await this.visao(ator, id));
    return new StreamableFile(a.conteudo, { type: a.mime, disposition: `inline; filename="${encodeURIComponent(a.nome)}"` });
  }

  /** Termo de arrematação (órgão dono ou o arrematante). */
  @SomenteOrgao()
  @Post('termos')
  async gerarTermos(@Param('licitacaoId') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id);
    return this.leilao.gerarTermos(id, atorTransicaoDe(ator));
  }

  @OrgaoOuFornecedor()
  @Get('arrematacoes/:arrId/termo')
  async termo(@Param('licitacaoId') id: string, @Param('arrId') arrId: string, @AtorAtual() ator: Ator) {
    if (!ehUuid(arrId)) throw new NotFoundException('Termo não encontrado');
    const t = await this.leilao.arquivoTermo(await this.existe(id), arrId, await this.visao(ator, id));
    return new StreamableFile(createReadStream(t.caminho), { type: 'application/pdf', disposition: `inline; filename="${t.nome}"` });
  }
}
