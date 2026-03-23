import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { PatrimonioService } from './patrimonio.service';
import { PatrimonioEtiquetasService } from './patrimonio-etiquetas.service';
import { PatrimonioRelatoriosService } from './patrimonio-relatorios.service';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { CurrentUser } from '../auth/current-user.decorator';
import { CriarBemDto } from './dto/criar-bem.dto';
import { AtualizarBemDto } from './dto/atualizar-bem.dto';
import { CriarManutencaoDto } from './dto/criar-manutencao.dto';
import { AtualizarManutencaoDto } from './dto/atualizar-manutencao.dto';
import { CriarLocacaoDto } from './dto/criar-locacao.dto';
import { CriarServidorBemDto } from './dto/criar-servidor-bem.dto';
import { CriarComodatoDto } from './dto/criar-comodato.dto';
import { CriarCategoriaDto } from './dto/criar-categoria.dto';
import { GerarEtiquetaDto } from './dto/gerar-etiqueta.dto';
import { TipoBem, StatusBem, StatusManutencao } from './entities/enums';

@Controller('orgaos/:orgaoId/patrimonio')
@RequireModule(ModuloSistema.PATRIMONIO)
export class PatrimonioController {
  constructor(
    private readonly patrimonioService: PatrimonioService,
    private readonly etiquetasService: PatrimonioEtiquetasService,
    private readonly relatoriosService: PatrimonioRelatoriosService,
  ) {}

  // ─── BENS ────────────────────────────────────────────

  @Get()
  async listarBens(
    @Param('orgaoId') orgaoId: string,
    @Query('tipo') tipo?: TipoBem,
    @Query('status') status?: StatusBem,
    @Query('categoria_id') categoria_id?: string,
    @Query('busca') busca?: string,
  ) {
    return this.patrimonioService.listarBens(orgaoId, {
      tipo,
      status,
      categoria_id,
      busca,
    });
  }

  @Get('bem/:id')
  async obterBem(
    @Param('orgaoId') orgaoId: string,
    @Param('id') id: string,
  ) {
    return this.patrimonioService.obterBem(orgaoId, id);
  }

  @Post()
  async criarBem(
    @Param('orgaoId') orgaoId: string,
    @Body() dto: CriarBemDto,
    @CurrentUser() user: any,
  ) {
    return this.patrimonioService.criarBem(
      orgaoId,
      dto,
      user?.nome || 'Sistema',
    );
  }

  @Put('bem/:id')
  async atualizarBem(
    @Param('orgaoId') orgaoId: string,
    @Param('id') id: string,
    @Body() dto: AtualizarBemDto,
    @CurrentUser() user: any,
  ) {
    return this.patrimonioService.atualizarBem(
      orgaoId,
      id,
      dto,
      user?.nome || 'Sistema',
    );
  }

  @Delete('bem/:id')
  @HttpCode(HttpStatus.OK)
  async excluirBem(
    @Param('orgaoId') orgaoId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.patrimonioService.excluirBem(
      orgaoId,
      id,
      user?.nome || 'Sistema',
    );
  }

  // ─── CATEGORIAS ──────────────────────────────────────

  @Get('categorias')
  async listarCategorias(@Param('orgaoId') orgaoId: string) {
    return this.patrimonioService.listarCategorias(orgaoId);
  }

  @Post('categorias')
  async criarCategoria(
    @Param('orgaoId') orgaoId: string,
    @Body() dto: CriarCategoriaDto,
  ) {
    return this.patrimonioService.criarCategoria(orgaoId, dto);
  }

  @Put('categorias/:categoriaId')
  async atualizarCategoria(
    @Param('orgaoId') orgaoId: string,
    @Param('categoriaId') categoriaId: string,
    @Body() dto: CriarCategoriaDto,
  ) {
    return this.patrimonioService.atualizarCategoria(
      orgaoId,
      categoriaId,
      dto,
    );
  }

  @Delete('categorias/:categoriaId')
  async desativarCategoria(
    @Param('orgaoId') orgaoId: string,
    @Param('categoriaId') categoriaId: string,
  ) {
    return this.patrimonioService.desativarCategoria(orgaoId, categoriaId);
  }

  // ─── MANUTENÇÕES ─────────────────────────────────────

  @Get('manutencoes')
  async listarManutencoes(
    @Param('orgaoId') orgaoId: string,
    @Query('status') status?: StatusManutencao,
  ) {
    return this.patrimonioService.listarManutencoes(orgaoId, { status });
  }

  @Get('manutencoes/:manutId')
  async obterManutencao(
    @Param('orgaoId') orgaoId: string,
    @Param('manutId') manutId: string,
  ) {
    return this.patrimonioService.obterManutencao(orgaoId, manutId);
  }

  @Post('bem/:id/manutencoes')
  async criarManutencao(
    @Param('orgaoId') orgaoId: string,
    @Param('id') bemId: string,
    @Body() dto: CriarManutencaoDto,
    @CurrentUser() user: any,
  ) {
    return this.patrimonioService.criarManutencao(
      orgaoId,
      bemId,
      dto,
      user?.nome || 'Sistema',
    );
  }

  @Put('manutencoes/:manutId')
  async atualizarManutencao(
    @Param('orgaoId') orgaoId: string,
    @Param('manutId') manutId: string,
    @Body() dto: AtualizarManutencaoDto,
    @CurrentUser() user: any,
  ) {
    return this.patrimonioService.atualizarManutencao(
      orgaoId,
      manutId,
      dto,
      user?.nome || 'Sistema',
    );
  }

  // ─── LOCAÇÕES ────────────────────────────────────────

  @Get('locacoes')
  async listarLocacoes(@Param('orgaoId') orgaoId: string) {
    return this.patrimonioService.listarLocacoes(orgaoId);
  }

  @Post('bem/:id/locacoes')
  async criarLocacao(
    @Param('orgaoId') orgaoId: string,
    @Param('id') bemId: string,
    @Body() dto: CriarLocacaoDto,
    @CurrentUser() user: any,
  ) {
    return this.patrimonioService.criarLocacao(
      orgaoId,
      bemId,
      dto,
      user?.nome || 'Sistema',
    );
  }

  @Put('locacoes/:locId')
  async atualizarLocacao(
    @Param('orgaoId') orgaoId: string,
    @Param('locId') locId: string,
    @Body() dto: Partial<CriarLocacaoDto>,
  ) {
    return this.patrimonioService.atualizarLocacao(orgaoId, locId, dto);
  }

  // ─── SERVIDORES ──────────────────────────────────────

  @Get('servidores')
  async listarServidores(@Param('orgaoId') orgaoId: string) {
    return this.patrimonioService.listarServidores(orgaoId);
  }

  @Post('bem/:id/servidores')
  async criarServidorBem(
    @Param('orgaoId') orgaoId: string,
    @Param('id') bemId: string,
    @Body() dto: CriarServidorBemDto,
    @CurrentUser() user: any,
  ) {
    return this.patrimonioService.criarServidorBem(
      orgaoId,
      bemId,
      dto,
      user?.nome || 'Sistema',
    );
  }

  @Put('servidores/:servId')
  async atualizarServidorBem(
    @Param('orgaoId') orgaoId: string,
    @Param('servId') servId: string,
    @Body() dto: Partial<CriarServidorBemDto>,
  ) {
    return this.patrimonioService.atualizarServidorBem(
      orgaoId,
      servId,
      dto,
    );
  }

  // ─── COMODATOS ───────────────────────────────────────

  @Get('comodatos')
  async listarComodatos(@Param('orgaoId') orgaoId: string) {
    return this.patrimonioService.listarComodatos(orgaoId);
  }

  @Post('bem/:id/comodatos')
  async criarComodato(
    @Param('orgaoId') orgaoId: string,
    @Param('id') bemId: string,
    @Body() dto: CriarComodatoDto,
    @CurrentUser() user: any,
  ) {
    return this.patrimonioService.criarComodato(
      orgaoId,
      bemId,
      dto,
      user?.nome || 'Sistema',
    );
  }

  @Put('comodatos/:comodId')
  async atualizarComodato(
    @Param('orgaoId') orgaoId: string,
    @Param('comodId') comodId: string,
    @Body() dto: Partial<CriarComodatoDto>,
  ) {
    return this.patrimonioService.atualizarComodato(
      orgaoId,
      comodId,
      dto,
    );
  }

  // ─── ETIQUETAS ───────────────────────────────────────

  @Post('etiquetas/gerar')
  async gerarEtiquetas(
    @Param('orgaoId') orgaoId: string,
    @Body() dto: GerarEtiquetaDto,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.etiquetasService.gerarEtiquetas(
      orgaoId,
      dto,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename=etiquetas-patrimonio.pdf`,
    });
    res.send(pdfBuffer);
  }

  // ─── RELATÓRIOS ──────────────────────────────────────

  @Get('relatorios/resumo')
  async relatorioResumo(@Param('orgaoId') orgaoId: string) {
    return this.relatoriosService.resumo(orgaoId);
  }

  @Get('relatorios/manutencoes')
  async relatorioManutencoes(
    @Param('orgaoId') orgaoId: string,
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
  ) {
    return this.relatoriosService.relatorioManutencoes(
      orgaoId,
      dataInicio,
      dataFim,
    );
  }

  @Get('relatorios/locacoes-vencendo')
  async relatorioLocacoesVencendo(@Param('orgaoId') orgaoId: string) {
    return this.relatoriosService.locacoesVencendo(orgaoId);
  }
}
