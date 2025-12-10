import { Controller, Get, Post, Put, Body, Param, Query, UseInterceptors, UploadedFile, Res, HttpStatus, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { ImpugnacoesService } from './impugnacoes.service';
import { StatusImpugnacao } from './impugnacao.entity';

// Configuração do Multer para upload de PDF
const uploadConfig = {
  storage: diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = './uploads/impugnacoes';
      // Criar diretório se não existir
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, `impugnacao-${uniqueSuffix}${ext}`);
    }
  }),
  fileFilter: (req: any, file: any, cb: any) => {
    // Aceitar apenas PDF
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new BadRequestException('Apenas arquivos PDF são permitidos'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB máximo
  }
};

@Controller('impugnacoes')
export class ImpugnacoesController {
  constructor(private readonly impugnacoesService: ImpugnacoesService) {}

  @Get('licitacao/:licitacaoId')
  findByLicitacao(@Param('licitacaoId') licitacaoId: string) {
    return this.impugnacoesService.findByLicitacao(licitacaoId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.impugnacoesService.findOne(id);
  }

  // Download do documento da impugnação
  @Get(':id/documento')
  async downloadDocumento(@Param('id') id: string, @Res() res: Response) {
    const impugnacao = await this.impugnacoesService.findOne(id);
    
    if (!impugnacao.documento_caminho) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: 'Documento não encontrado' });
    }

    const caminhoCompleto = path.join(process.cwd(), impugnacao.documento_caminho);
    
    if (!fs.existsSync(caminhoCompleto)) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: 'Arquivo não encontrado no servidor' });
    }

    res.set({
      'Content-Type': impugnacao.documento_mime_type || 'application/pdf',
      'Content-Disposition': `attachment; filename="${impugnacao.documento_nome}"`,
    });

    const fileStream = fs.createReadStream(caminhoCompleto);
    fileStream.pipe(res);
  }

  @Post()
  @UseInterceptors(FileInterceptor('documento', uploadConfig))
  async create(
    @Body() data: {
      licitacao_id: string;
      fornecedor_id?: string;
      nome_impugnante?: string;
      cpf_cnpj_impugnante?: string;
      email_impugnante?: string;
      is_cidadao?: string;
      texto_impugnacao: string;
      item_edital_impugnado?: string;
      fundamentacao_legal?: string;
    },
    @UploadedFile() documento?: Express.Multer.File
  ) {
    // Preparar dados com informações do documento
    const dadosImpugnacao: any = {
      ...data,
      is_cidadao: data.is_cidadao === 'true'
    };

    if (documento) {
      dadosImpugnacao.documento_nome = documento.originalname;
      dadosImpugnacao.documento_caminho = documento.path;
      dadosImpugnacao.documento_tamanho = documento.size;
      dadosImpugnacao.documento_mime_type = documento.mimetype;
    }

    return this.impugnacoesService.create(dadosImpugnacao);
  }

  @Put(':id/responder')
  responder(
    @Param('id') id: string,
    @Body() data: {
      resposta: string;
      status: StatusImpugnacao;
      respondido_por: string;
      altera_edital?: boolean;
      alteracoes_edital?: string;
    }
  ) {
    return this.impugnacoesService.responder(id, data);
  }

  @Put(':id/em-analise')
  marcarEmAnalise(@Param('id') id: string) {
    return this.impugnacoesService.marcarEmAnalise(id);
  }

  @Get('licitacao/:licitacaoId/pendentes/count')
  countPendentes(@Param('licitacaoId') licitacaoId: string) {
    return this.impugnacoesService.countPendentes(licitacaoId);
  }
}
