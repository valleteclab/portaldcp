import { Controller, Get, Post, Put, Body, Param, UseInterceptors, UploadedFile, Res, HttpStatus, BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { EsclarecimentosService } from './esclarecimentos.service';
import { StatusEsclarecimento } from './esclarecimento.entity';
import { Public } from '../auth/public.decorator';
import { AcessoLicitacaoService, ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { AtorAtual, AutenticacaoOpcional, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import { ehFornecedor } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';
import { aplicarVisao, licitacaoResumo, visaoDaManifestacao } from '../impugnacoes/manifestacao-acesso.util';

/** Campos que identificam quem pediu o esclarecimento (fora da visão pública). */
const IDENTIDADE_SOLICITANTE = ['nome_solicitante', 'cpf_cnpj_solicitante', 'email_solicitante'];

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

/**
 * AUTORIZAÇÃO (E1a):
 *  - pedir esclarecimento: continua aberto a qualquer autenticado;
 *    se for fornecedor, a identidade é a do token (fornecedor_id divergente → 403);
 *  - responder / arquivar: somente o órgão DONO da licitação (403);
 *  - listar / ler: órgão dono vê tudo; fornecedor vê os próprios + os já
 *    respondidos (sem identificar o solicitante); público: só os respondidos
 *    de licitação divulgada. Fora disso → 404;
 *  - arquivo anexado: só órgão dono e o próprio autor.
 */
@Controller('esclarecimentos')
export class EsclarecimentosController {
  constructor(
    private readonly esclarecimentosService: EsclarecimentosService,
    private readonly acesso: AcessoLicitacaoService,
    private readonly dataSource: DataSource,
  ) {}

  /** Esclarecimento + visão do ator (404 se o ator não pode vê-lo). */
  private async legivel(id: string, ator: Ator | null) {
    if (!ehUuid(id)) throw new NotFoundException('Esclarecimento não encontrado');
    const esclarecimento = await this.esclarecimentosService.findOne(id);
    const lic = await licitacaoResumo(this.dataSource, esclarecimento.licitacao_id);
    const visao = visaoDaManifestacao(ator, lic, esclarecimento);
    if (!visao) throw new NotFoundException('Esclarecimento não encontrado');
    return { esclarecimento, visao };
  }

  @AutenticacaoOpcional()
  @Get('licitacao/:licitacaoId')
  async findByLicitacao(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator | null) {
    const lic = await licitacaoResumo(this.dataSource, licitacaoId);
    if (!lic) return [];
    const todos = await this.esclarecimentosService.findByLicitacao(licitacaoId);
    const visiveis: any[] = [];
    for (const esc of todos) {
      const visao = visaoDaManifestacao(ator, lic, esc);
      if (visao) visiveis.push(aplicarVisao(esc, visao, IDENTIDADE_SOLICITANTE));
    }
    return visiveis;
  }

  @Public()
  @Get('licitacao/:licitacaoId/pendentes')
  countPendentes(@Param('licitacaoId') licitacaoId: string) {
    if (!ehUuid(licitacaoId)) return 0;
    return this.esclarecimentosService.countPendentes(licitacaoId);
  }

  @AutenticacaoOpcional()
  @Get(':id')
  async findOne(@Param('id') id: string, @AtorAtual() ator: Ator | null) {
    const { esclarecimento, visao } = await this.legivel(id, ator);
    return aplicarVisao(esclarecimento, visao, IDENTIDADE_SOLICITANTE);
  }

  // Download do documento do esclarecimento (órgão dono ou o próprio autor)
  @AutenticacaoOpcional()
  @Get(':id/documento')
  async downloadDocumento(@Param('id') id: string, @AtorAtual() ator: Ator | null, @Res() res: Response) {
    const { esclarecimento, visao } = await this.legivel(id, ator);
    if (visao === 'PUBLICO' || !esclarecimento.documento_caminho) {
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
    @AtorAtual() ator: Ator,
    @UploadedFile() documento?: Express.Multer.File
  ) {
    if (!ehUuid(data?.licitacao_id)) throw new NotFoundException('Licitação não encontrada');
    const dadosEsclarecimento: any = {
      ...data,
      is_cidadao: data.is_cidadao === 'true'
    };
    // Identidade do fornecedor SEMPRE do token; quem não é fornecedor não
    // pede esclarecimento em nome de um.
    if (ehFornecedor(ator)) {
      dadosEsclarecimento.fornecedor_id = this.acesso.fornecedorDoToken(ator, data.fornecedor_id);
    } else {
      delete dadosEsclarecimento.fornecedor_id;
    }
    // Campos controlados pelo sistema/órgão
    for (const k of ['id', 'status', 'resposta', 'respondido_por', 'data_resposta', 'documento_caminho']) {
      delete dadosEsclarecimento[k];
    }

    if (documento) {
      dadosEsclarecimento.documento_nome = documento.originalname;
      dadosEsclarecimento.documento_caminho = documento.path;
      dadosEsclarecimento.documento_tamanho = documento.size;
      dadosEsclarecimento.documento_mime_type = documento.mimetype;
    }

    return this.esclarecimentosService.create(dadosEsclarecimento);
  }

  @Put(':id/responder')
  @SomenteOrgao()
  async responder(
    @Param('id') id: string,
    @Body() data: { resposta: string; respondido_por: string },
    @AtorAtual() ator: Ator,
  ) {
    await this.assertDono(ator, id);
    return this.esclarecimentosService.responder(id, data.resposta, data.respondido_por);
  }

  @Put(':id/arquivar')
  @SomenteOrgao()
  async arquivar(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.assertDono(ator, id);
    return this.esclarecimentosService.arquivar(id);
  }

  /** Ato do órgão dono da licitação do esclarecimento (outro órgão → 403). */
  private async assertDono(ator: Ator, id: string) {
    if (!ehUuid(id)) throw new NotFoundException('Esclarecimento não encontrado');
    const esclarecimento = await this.esclarecimentosService.findOne(id);
    await this.acesso.assertOrgaoDaLicitacao(ator, esclarecimento.licitacao_id);
  }
}
