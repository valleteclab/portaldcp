import { Controller, Get, Post, Put, Delete, Body, Param, ValidationPipe, UseInterceptors, UploadedFile, Res, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { Response } from 'express';
import { createReadStream, existsSync, unlinkSync } from 'fs';
import { PropostasService, DonoProposta, VisaoProposta } from './propostas.service';
import { CreatePropostaDto, DesclassificarPropostaDto } from './dto/create-proposta.dto';
import { Proposta } from './entities/proposta.entity';
import { PropostaItem } from './entities/proposta-item.entity';
import { Public } from '../auth/public.decorator';
import { AcessoLicitacaoService } from '../auth/acesso/acesso-licitacao.service';
import { AtorAtual, OrgaoOuFornecedor, SomenteFornecedor, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import { ehFornecedor } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';

/**
 * PROPOSTAS — regras de acesso (E1a):
 *  - criar/enviar/alterar/retirar/excluir: só o fornecedor DONO (identidade do
 *    token; `fornecedor_id` do corpo diferente → 403), nas fases permitidas;
 *  - ler por id (e itens): o fornecedor dono, ou o órgão dono da licitação
 *    (durante o sigilo, só existência/autoria); qualquer outro → 404;
 *  - classificar/desclassificar/vencedora: só o órgão dono da licitação;
 *  - lista pública e ranking por item: rotas públicas com o sigilo das
 *    propostas (art. 55/63; art. 75 §3º) aplicado no service.
 */
@Controller('propostas')
export class PropostasController {
  constructor(
    private readonly propostasService: PropostasService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  // ---------------------------------------------------------------------------
  // Checagens de dono
  // ---------------------------------------------------------------------------

  /** Fornecedor do token é o dono da proposta (escrita → 403 se não for). */
  private async fornecedorDono(ator: Ator, propostaId: string): Promise<DonoProposta> {
    const fornecedorId = this.acesso.fornecedorDoToken(ator);
    const dono = await this.propostasService.donoDaProposta(propostaId);
    if (dono.fornecedor_id !== fornecedorId) {
      throw new ForbiddenException('Apenas o fornecedor da proposta pode alterá-la');
    }
    return dono;
  }

  /** Órgão dono da licitação da proposta (escrita → 403 se for de outro órgão). */
  private async orgaoDono(ator: Ator, propostaId: string): Promise<DonoProposta> {
    const dono = await this.propostasService.donoDaProposta(propostaId);
    await this.acesso.assertOrgaoDaLicitacao(ator, dono.licitacao_id, 'escrita');
    return dono;
  }

  /**
   * Leitura por id: fornecedor dono → visão completa; órgão dono → completa
   * depois do sigilo, só autoria durante; demais → 404.
   */
  private async visaoDeLeitura(ator: Ator, propostaId: string): Promise<VisaoProposta> {
    const dono = await this.propostasService.donoDaProposta(propostaId);
    if (ehFornecedor(ator)) {
      if (dono.fornecedor_id !== ator.fornecedorId) {
        throw new NotFoundException(`Proposta com ID ${propostaId} não encontrada`);
      }
      return 'FORNECEDOR';
    }
    await this.acesso.assertOrgaoDaLicitacao(ator, dono.licitacao_id, 'leitura');
    return (await this.propostasService.emSigiloDePropostas(dono.licitacao_id)) ? 'ORGAO_SIGILO' : 'ORGAO';
  }

  // ---------------------------------------------------------------------------

  @Post()
  @SomenteFornecedor()
  async create(
    @Body(new ValidationPipe()) createDto: CreatePropostaDto,
    @AtorAtual() ator: Ator,
  ): Promise<Proposta> {
    const fornecedorId = this.acesso.fornecedorDoToken(ator, createDto.fornecedor_id);
    return await this.propostasService.create(createDto, fornecedorId);
  }

  @Public()
  @Get('licitacao/:licitacaoId')
  async findByLicitacao(@Param('licitacaoId') licitacaoId: string): Promise<Proposta[]> {
    return await this.propostasService.findByLicitacao(licitacaoId);
  }

  /** Propostas do fornecedor autenticado. */
  @Get('minhas')
  @SomenteFornecedor()
  async minhas(@AtorAtual() ator: Ator): Promise<Proposta[]> {
    return await this.propostasService.findByFornecedor(this.acesso.fornecedorDoToken(ator));
  }

  /** Legado: só o próprio fornecedor (id diferente do token → 403). Prefira GET /propostas/minhas. */
  @Get('fornecedor/:fornecedorId')
  @SomenteFornecedor()
  async findByFornecedor(@Param('fornecedorId') fornecedorId: string, @AtorAtual() ator: Ator): Promise<Proposta[]> {
    return await this.propostasService.findByFornecedor(this.acesso.fornecedorDoToken(ator, fornecedorId));
  }

  @Get('orgao/:orgaoId/fornecedores')
  @SomenteOrgao()
  async findFornecedoresByOrgao(@Param('orgaoId') orgaoId: string, @AtorAtual() ator: Ator): Promise<any[]> {
    this.acesso.assertProprioOrgao(ator, orgaoId, 'leitura');
    return await this.propostasService.findFornecedoresByOrgao(orgaoId);
  }

  @Get(':id')
  @OrgaoOuFornecedor()
  async findOne(@Param('id') id: string, @AtorAtual() ator: Ator): Promise<Proposta> {
    const visao = await this.visaoDeLeitura(ator, id);
    return await this.propostasService.findOneVisao(id, visao);
  }

  @Get(':id/itens')
  @OrgaoOuFornecedor()
  async getItens(@Param('id') id: string, @AtorAtual() ator: Ator): Promise<PropostaItem[]> {
    const visao = await this.visaoDeLeitura(ator, id);
    if (visao === 'ORGAO_SIGILO') {
      throw new ForbiddenException('Conteúdo da proposta sob sigilo até o fim do acolhimento');
    }
    return await this.propostasService.getItens(id);
  }

  @Public()
  @Get('ranking/item/:itemId')
  async getRankingPorItem(@Param('itemId') itemId: string) {
    return await this.propostasService.getRankingPorItem(itemId);
  }

  @Put(':id/enviar')
  @SomenteFornecedor()
  async enviar(@Param('id') id: string, @AtorAtual() ator: Ator): Promise<Proposta> {
    await this.fornecedorDono(ator, id);
    return await this.propostasService.enviar(id);
  }

  @Put(':id/classificar')
  @SomenteOrgao()
  async classificar(@Param('id') id: string, @AtorAtual() ator: Ator): Promise<Proposta> {
    await this.orgaoDono(ator, id);
    return await this.propostasService.classificar(id);
  }

  @Put(':id/desclassificar')
  @SomenteOrgao()
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
    @AtorAtual() ator: Ator,
    @UploadedFile() documento?: Express.Multer.File
  ): Promise<Proposta> {
    // O upload acontece antes do handler: se o órgão não é o dono, descarta o arquivo.
    try {
      await this.orgaoDono(ator, id);
    } catch (e) {
      if (documento?.path) {
        try {
          unlinkSync(documento.path);
        } catch {
          /* arquivo já removido */
        }
      }
      throw e;
    }

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

  /** Documento da desclassificação: fornecedor dono ou órgão dono. */
  @Get(':id/documento-desclassificacao')
  @OrgaoOuFornecedor()
  async downloadDocumentoDesclassificacao(
    @Param('id') id: string,
    @AtorAtual() ator: Ator,
    @Res() res: Response
  ) {
    await this.visaoDeLeitura(ator, id);
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
  @SomenteOrgao()
  async marcarVencedora(@Param('id') id: string, @AtorAtual() ator: Ator): Promise<Proposta> {
    await this.orgaoDono(ator, id);
    return await this.propostasService.marcarVencedora(id);
  }

  @Put(':id/cancelar')
  @SomenteFornecedor()
  async cancelar(@Param('id') id: string, @AtorAtual() ator: Ator): Promise<Proposta> {
    await this.fornecedorDono(ator, id);
    return await this.propostasService.cancelar(id);
  }

  @Put(':id')
  @SomenteFornecedor()
  async update(
    @Param('id') id: string,
    @Body() dados: { valor_total_proposta?: number },
    @AtorAtual() ator: Ator,
  ): Promise<Proposta> {
    await this.fornecedorDono(ator, id);
    return await this.propostasService.update(id, dados);
  }

  @Put('item/:itemId')
  @SomenteFornecedor()
  async updateItem(
    @Param('itemId') itemId: string,
    @Body() dados: { valor_unitario?: number; marca?: string; modelo?: string },
    @AtorAtual() ator: Ator,
  ): Promise<PropostaItem> {
    const fornecedorId = this.acesso.fornecedorDoToken(ator);
    const dono = await this.propostasService.donoDoItemDaProposta(itemId);
    if (dono.fornecedor_id !== fornecedorId) {
      throw new ForbiddenException('Apenas o fornecedor da proposta pode alterá-la');
    }
    return await this.propostasService.updateItem(itemId, dados);
  }

  /** Exclusão pelo fornecedor dono (identidade do token; não aceita ?fornecedorId). */
  @Delete(':id')
  @SomenteFornecedor()
  async remove(@Param('id') id: string, @AtorAtual() ator: Ator): Promise<{ ok: true }> {
    await this.propostasService.remove(id, this.acesso.fornecedorDoToken(ator));
    return { ok: true };
  }
}
