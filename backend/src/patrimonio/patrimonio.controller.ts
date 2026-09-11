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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { join, extname } from 'path';
import { mkdirSync } from 'fs';
import type { Response } from 'express';
import { GerarZplDto } from './dto/gerar-etiqueta.dto';

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
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
    @Query('setor_id') setor_id?: string,
    @Query('busca') busca?: string,
  ) {
    return this.patrimonioService.listarBens(orgaoId, {
      tipo,
      status,
      categoria_id,
      setor_id,
      busca,
    });
  }

  /** Próximo número de plaqueta (para mostrar no formulário antes de salvar). */
  @Get('proxima-plaqueta')
  async proximaPlaqueta(@Param('orgaoId') orgaoId: string) {
    return { plaqueta: await this.patrimonioService.proximaPlaqueta(orgaoId) };
  }

  /** Carga inicial por planilha (xlsx/xls/csv). */
  @Post('importar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname || '');
        cb(ok ? null : new BadRequestException('Envie uma planilha .xlsx, .xls ou .csv'), ok);
      },
    }),
  )
  async importar(
    @Param('orgaoId') orgaoId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    if (!file?.buffer) throw new BadRequestException('Nenhum arquivo enviado');
    return this.patrimonioService.importarPlanilha(orgaoId, file.buffer, user?.nome || 'Sistema');
  }

  /** Foto do bem (jpg/png até 10 MB), servida em /api/uploads/patrimonio/<orgao>/<arquivo>. */
  @Post('bem/:id/foto')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const dir = join(UPLOAD_DIR, 'patrimonio', String(req.params.orgaoId).replace(/[^a-zA-Z0-9-]/g, ''));
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const ext = (extname(file.originalname || '') || '.jpg').toLowerCase();
          cb(null, `${String(req.params.id).replace(/[^a-zA-Z0-9-]/g, '')}-${Date.now()}${ext}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'].includes(file.mimetype);
        cb(ok ? null : new BadRequestException('Envie uma imagem JPG, PNG ou WEBP'), ok);
      },
    }),
  )
  async foto(
    @Param('orgaoId') orgaoId: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    if (!file) throw new BadRequestException('Nenhuma imagem enviada');
    const url = `/api/uploads/patrimonio/${orgaoId}/${file.filename}`;
    return this.patrimonioService.salvarFoto(orgaoId, id, url, user?.nome || 'Sistema');
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

  /** Arquivo ZPL para a impressora de etiquetas Zebra do órgão. */
  @Post('etiquetas/zpl')
  async gerarZpl(
    @Param('orgaoId') orgaoId: string,
    @Body() dto: GerarZplDto,
    @Res() res: Response,
  ) {
    const zpl = await this.etiquetasService.gerarZpl(orgaoId, dto);
    res.set({
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename=plaquetas-${dto.bem_ids.length}.zpl`,
    });
    res.send(zpl);
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

  /** Posição de depreciação linear por categoria e por bem (NBC TSP 07). */
  @Get('relatorios/depreciacao')
  async relatorioDepreciacao(
    @Param('orgaoId') orgaoId: string,
    @Query('data') data?: string,
  ) {
    return this.relatoriosService.depreciacao(orgaoId, data);
  }

  @Get('relatorios/locacoes-vencendo')
  async relatorioLocacoesVencendo(@Param('orgaoId') orgaoId: string) {
    return this.relatoriosService.locacoesVencendo(orgaoId);
  }
}
