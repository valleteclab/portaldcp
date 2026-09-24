import { Controller, Get, Post, Put, Body, Param, UseInterceptors, UploadedFile, Res, HttpStatus, BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { ImpugnacoesService } from './impugnacoes.service';
import { StatusImpugnacao } from './impugnacao.entity';
import { Public } from '../auth/public.decorator';
import { AcessoLicitacaoService, ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { AtorAtual, AutenticacaoOpcional, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import { ehFornecedor } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';
import { aplicarVisao, licitacaoResumo, visaoDaManifestacao } from './manifestacao-acesso.util';

/** Campos que identificam quem impugnou (fora da visão pública). */
const IDENTIDADE_IMPUGNANTE = ['nome_impugnante', 'cpf_cnpj_impugnante', 'email_impugnante'];

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

/**
 * AUTORIZAÇÃO (E1a):
 *  - enviar impugnação: continua aberto a qualquer autenticado (art. 164);
 *    se for fornecedor, a identidade é a do token (fornecedor_id divergente → 403);
 *  - responder / marcar em análise: somente o órgão DONO da licitação (403);
 *  - listar / ler: órgão dono vê tudo; fornecedor vê as próprias + as já
 *    respondidas (sem identificar o impugnante); público: só as respondidas
 *    de licitação divulgada. Fora disso → 404;
 *  - arquivo anexado: só órgão dono e o próprio autor.
 */
@Controller('impugnacoes')
export class ImpugnacoesController {
  constructor(
    private readonly impugnacoesService: ImpugnacoesService,
    private readonly acesso: AcessoLicitacaoService,
    private readonly dataSource: DataSource,
  ) {}

  /** Impugnação + visão do ator (404 se o ator não pode vê-la). */
  private async legivel(id: string, ator: Ator | null) {
    if (!ehUuid(id)) throw new NotFoundException('Impugnação não encontrada');
    const impugnacao = await this.impugnacoesService.findOne(id);
    const lic = await licitacaoResumo(this.dataSource, impugnacao.licitacao_id);
    const visao = visaoDaManifestacao(ator, lic, impugnacao);
    if (!visao) throw new NotFoundException('Impugnação não encontrada');
    return { impugnacao, visao };
  }

  @AutenticacaoOpcional()
  @Get('licitacao/:licitacaoId')
  async findByLicitacao(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator | null) {
    const lic = await licitacaoResumo(this.dataSource, licitacaoId);
    if (!lic) return [];
    const todas = await this.impugnacoesService.findByLicitacao(licitacaoId);
    const visiveis: any[] = [];
    for (const imp of todas) {
      const visao = visaoDaManifestacao(ator, lic, imp);
      if (visao) visiveis.push(aplicarVisao(imp, visao, IDENTIDADE_IMPUGNANTE));
    }
    return visiveis;
  }

  @AutenticacaoOpcional()
  @Get(':id')
  async findOne(@Param('id') id: string, @AtorAtual() ator: Ator | null) {
    const { impugnacao, visao } = await this.legivel(id, ator);
    return aplicarVisao(impugnacao, visao, IDENTIDADE_IMPUGNANTE);
  }

  // Download do documento da impugnação (órgão dono ou o próprio autor)
  @AutenticacaoOpcional()
  @Get(':id/documento')
  async downloadDocumento(@Param('id') id: string, @AtorAtual() ator: Ator | null, @Res() res: Response) {
    const { impugnacao, visao } = await this.legivel(id, ator);
    if (visao === 'PUBLICO' || !impugnacao.documento_caminho) {
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
    @AtorAtual() ator: Ator,
    @UploadedFile() documento?: Express.Multer.File
  ) {
    if (!ehUuid(data?.licitacao_id)) throw new NotFoundException('Licitação não encontrada');
    // Preparar dados com informações do documento
    const dadosImpugnacao: any = {
      ...data,
      is_cidadao: data.is_cidadao === 'true'
    };
    // Identidade do fornecedor SEMPRE do token; quem não é fornecedor não
    // impugna em nome de um.
    if (ehFornecedor(ator)) {
      dadosImpugnacao.fornecedor_id = this.acesso.fornecedorDoToken(ator, data.fornecedor_id);
    } else {
      delete dadosImpugnacao.fornecedor_id;
    }
    // Campos controlados pelo sistema/órgão
    for (const k of ['id', 'status', 'resposta', 'respondido_por', 'data_resposta', 'altera_edital', 'alteracoes_edital', 'documento_caminho']) {
      delete dadosImpugnacao[k];
    }

    if (documento) {
      dadosImpugnacao.documento_nome = documento.originalname;
      dadosImpugnacao.documento_caminho = documento.path;
      dadosImpugnacao.documento_tamanho = documento.size;
      dadosImpugnacao.documento_mime_type = documento.mimetype;
    }

    return this.impugnacoesService.create(dadosImpugnacao);
  }

  @Put(':id/responder')
  @SomenteOrgao()
  async responder(
    @Param('id') id: string,
    @Body() data: {
      resposta: string;
      status: StatusImpugnacao;
      respondido_por: string;
      altera_edital?: boolean;
      alteracoes_edital?: string;
    },
    @AtorAtual() ator: Ator,
  ) {
    await this.assertDono(ator, id);
    return this.impugnacoesService.responder(id, data);
  }

  @Put(':id/em-analise')
  @SomenteOrgao()
  async marcarEmAnalise(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.assertDono(ator, id);
    return this.impugnacoesService.marcarEmAnalise(id);
  }

  @Public()
  @Get('licitacao/:licitacaoId/pendentes/count')
  countPendentes(@Param('licitacaoId') licitacaoId: string) {
    if (!ehUuid(licitacaoId)) return 0;
    return this.impugnacoesService.countPendentes(licitacaoId);
  }

  /** Ato do órgão dono da licitação da impugnação (outro órgão → 403). */
  private async assertDono(ator: Ator, id: string) {
    if (!ehUuid(id)) throw new NotFoundException('Impugnação não encontrada');
    const impugnacao = await this.impugnacoesService.findOne(id);
    await this.acesso.assertOrgaoDaLicitacao(ator, impugnacao.licitacao_id);
  }
}
