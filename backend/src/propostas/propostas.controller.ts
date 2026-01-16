import { Controller, Get, Post, Put, Delete, Body, Param, Query, ValidationPipe, UseInterceptors, UploadedFile, Res, NotFoundException, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { Response } from 'express';
import { createReadStream, existsSync } from 'fs';
import { PropostasService } from './propostas.service';
import { CreatePropostaDto, DesclassificarPropostaDto } from './dto/create-proposta.dto';
import { Proposta } from './entities/proposta.entity';
import { PropostaItem } from './entities/proposta-item.entity';
import { Public } from '../auth/public.decorator';

@Controller('propostas')
export class PropostasController {
  constructor(private readonly propostasService: PropostasService) {}

  @Post()
  async create(@Body(new ValidationPipe()) createDto: CreatePropostaDto): Promise<Proposta> {
    return await this.propostasService.create(createDto);
  }

  @Public()
  @Get('licitacao/:licitacaoId')
  async findByLicitacao(@Param('licitacaoId') licitacaoId: string): Promise<Proposta[]> {
    return await this.propostasService.findByLicitacao(licitacaoId);
  }

  @Get('fornecedor/:fornecedorId')
  async findByFornecedor(@Param('fornecedorId') fornecedorId: string): Promise<Proposta[]> {
    return await this.propostasService.findByFornecedor(fornecedorId);
  }

  @Get('orgao/:orgaoId/fornecedores')
  async findFornecedoresByOrgao(@Param('orgaoId') orgaoId: string): Promise<any[]> {
    return await this.propostasService.findFornecedoresByOrgao(orgaoId);
  }

  @Public()
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Proposta> {
    return await this.propostasService.findOne(id);
  }

  @Public()
  @Get(':id/itens')
  async getItens(@Param('id') id: string): Promise<PropostaItem[]> {
    return await this.propostasService.getItens(id);
  }

  @Public()
  @Get('ranking/item/:itemId')
  async getRankingPorItem(@Param('itemId') itemId: string) {
    return await this.propostasService.getRankingPorItem(itemId);
  }

  @Put(':id/enviar')
  async enviar(@Param('id') id: string): Promise<Proposta> {
    return await this.propostasService.enviar(id);
  }

  @Put(':id/classificar')
  async classificar(@Param('id') id: string): Promise<Proposta> {
    return await this.propostasService.classificar(id);
  }

  @Put(':id/desclassificar')
  @UseInterceptors(FileInterceptor('documento', {
    storage: diskStorage({
      destination: './uploads/desclassificacoes',
      filename: (req, file, cb) => {
        const uniqueSuffix = uuidv4();
        const ext = extname(file.originalname);
        cb(null, `${uniqueSuffix}${ext}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
      const ext = extname(file.originalname).toLowerCase();
      if (allowedTypes.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error('Tipo de arquivo não permitido'), false);
      }
    },
  }))
  async desclassificar(
    @Param('id') id: string,
    @Body('motivo') motivo: string,
    @UploadedFile() documento?: Express.Multer.File
  ): Promise<Proposta> {
    console.log('[desclassificar] Motivo recebido:', motivo);
    console.log('[desclassificar] Documento recebido:', documento ? documento.originalname : 'nenhum');
    
    // Validar motivo manualmente (FormData não passa pelo ValidationPipe)
    if (!motivo || typeof motivo !== 'string' || motivo.trim() === '') {
      throw new BadRequestException('O motivo da desclassificação é obrigatório');
    }
    
    const dados: DesclassificarPropostaDto = {
      motivo: motivo.trim(),
    };
    
    if (documento) {
      dados.documento_nome = documento.originalname;
      dados.documento_path = documento.path;
      dados.documento_tipo = documento.mimetype;
      dados.documento_tamanho = documento.size;
    }
    
    return await this.propostasService.desclassificar(id, dados);
  }

  @Public()
  @Get(':id/documento-desclassificacao')
  async downloadDocumentoDesclassificacao(
    @Param('id') id: string,
    @Res() res: Response
  ) {
    const proposta = await this.propostasService.findOne(id);
    
    if (!proposta.documento_desclassificacao_path) {
      throw new NotFoundException('Documento de desclassificação não encontrado');
    }
    
    const filePath = proposta.documento_desclassificacao_path;
    
    if (!existsSync(filePath)) {
      throw new NotFoundException('Arquivo não encontrado no servidor');
    }
    
    res.setHeader('Content-Type', proposta.documento_desclassificacao_tipo || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${proposta.documento_desclassificacao_nome}"`);
    
    const fileStream = createReadStream(filePath);
    fileStream.pipe(res);
  }

  @Put(':id/vencedora')
  async marcarVencedora(@Param('id') id: string): Promise<Proposta> {
    return await this.propostasService.marcarVencedora(id);
  }

  @Put(':id/cancelar')
  async cancelar(@Param('id') id: string): Promise<Proposta> {
    return await this.propostasService.cancelar(id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dados: { valor_total_proposta?: number }
  ): Promise<Proposta> {
    return await this.propostasService.update(id, dados);
  }

  @Put('item/:itemId')
  async updateItem(
    @Param('itemId') itemId: string,
    @Body() dados: { valor_unitario?: number; marca?: string; modelo?: string }
  ): Promise<PropostaItem> {
    return await this.propostasService.updateItem(itemId, dados);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Query('fornecedorId') fornecedorId: string,
  ): Promise<{ ok: true }> {
    await this.propostasService.remove(id, fornecedorId);
    return { ok: true };
  }
}
