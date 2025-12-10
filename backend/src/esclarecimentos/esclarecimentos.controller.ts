import { Controller, Get, Post, Put, Body, Param, UseInterceptors, UploadedFile, Res, HttpStatus, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { EsclarecimentosService } from './esclarecimentos.service';
import { StatusEsclarecimento } from './esclarecimento.entity';

// Configuração do Multer para upload de PDF
const uploadConfig = {
  storage: diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = './uploads/esclarecimentos';
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, `esclarecimento-${uniqueSuffix}${ext}`);
    }
  }),
  fileFilter: (req: any, file: any, cb: any) => {
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

@Controller('esclarecimentos')
export class EsclarecimentosController {
  constructor(private readonly esclarecimentosService: EsclarecimentosService) {}

  @Get('licitacao/:licitacaoId')
  findByLicitacao(@Param('licitacaoId') licitacaoId: string) {
    return this.esclarecimentosService.findByLicitacao(licitacaoId);
  }

  @Get('licitacao/:licitacaoId/pendentes')
  countPendentes(@Param('licitacaoId') licitacaoId: string) {
    return this.esclarecimentosService.countPendentes(licitacaoId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.esclarecimentosService.findOne(id);
  }

  // Download do documento do esclarecimento
  @Get(':id/documento')
  async downloadDocumento(@Param('id') id: string, @Res() res: Response) {
    const esclarecimento = await this.esclarecimentosService.findOne(id);
    
    if (!esclarecimento.documento_caminho) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: 'Documento não encontrado' });
    }

    const caminhoCompleto = path.join(process.cwd(), esclarecimento.documento_caminho);
    
    if (!fs.existsSync(caminhoCompleto)) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: 'Arquivo não encontrado no servidor' });
    }

    res.set({
      'Content-Type': esclarecimento.documento_mime_type || 'application/pdf',
      'Content-Disposition': `attachment; filename="${esclarecimento.documento_nome}"`,
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
      nome_solicitante?: string;
      cpf_cnpj_solicitante?: string;
      email_solicitante?: string;
      is_cidadao?: string;
      texto_esclarecimento: string;
      item_edital_referencia?: string;
    },
    @UploadedFile() documento?: Express.Multer.File
  ) {
    const dadosEsclarecimento: any = {
      ...data,
      is_cidadao: data.is_cidadao === 'true'
    };

    if (documento) {
      dadosEsclarecimento.documento_nome = documento.originalname;
      dadosEsclarecimento.documento_caminho = documento.path;
      dadosEsclarecimento.documento_tamanho = documento.size;
      dadosEsclarecimento.documento_mime_type = documento.mimetype;
    }

    return this.esclarecimentosService.create(dadosEsclarecimento);
  }

  @Put(':id/responder')
  async responder(
    @Param('id') id: string,
    @Body() data: { resposta: string; respondido_por: string }
  ) {
    return this.esclarecimentosService.responder(id, data.resposta, data.respondido_por);
  }

  @Put(':id/arquivar')
  async arquivar(@Param('id') id: string) {
    return this.esclarecimentosService.arquivar(id);
  }
}
