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
import { ComprovantesService } from '../comprovantes/comprovantes.service';
import { planilhaModeloDaProposta } from './planilha-modelo';
import { AcessoLicitacaoService } from '../auth/acesso/acesso-licitacao.service';
import { AtorAtual, AutenticacaoOpcional, OrgaoOuFornecedor, SomenteFornecedor, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import { ehFornecedor } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';
import { SigiloDisputaService } from '../disputa/sigilo-disputa.service';

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
    private readonly comprovantes: ComprovantesService,
    private readonly sigilo: SigiloDisputaService,
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
    // Classificar, desclassificar ou marcar vencedora só depois do prazo de
    // propostas (relógio do servidor): antes, o órgão nem conhece o conteúdo.
    if (await this.propostasService.emSigiloDePropostas(dono.licitacao_id)) {
      throw new ForbiddenException('As propostas estão sob sigilo até o fim do prazo de envio');
    }
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

  /**
   * Situação do próprio fornecedor na licitação quando está fora da disputa
   * (desclassificado ou inabilitado): motivo e data. `null` = não é o caso.
   */
  @SomenteFornecedor()
  @Get('licitacao/:licitacaoId/minha-situacao')
  async minhaSituacao(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator) {
    return { foraDaDisputa: await this.acesso.situacaoForaDaDisputa(this.acesso.fornecedorDoToken(ator), licitacaoId) };
  }

  /**
   * Planilha-modelo da proposta (dono, 10/11/2026 — como a BLL): o fornecedor
   * baixa, preenche o valor unitário, a marca e o modelo, e importa na tela da
   * proposta. Só para licitação divulgada; valor de referência fora se o orçamento for sigiloso.
   */
  @Public()
  @Get('licitacao/:licitacaoId/planilha-modelo')
  async planilhaModelo(@Param('licitacaoId') licitacaoId: string, @Res() res: Response) {
    const { nome, conteudo } = await planilhaModeloDaProposta(this.propostasService.manager(), licitacaoId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.send(conteudo);
  }

  /** Pública; o órgão dono (Bearer) recebe a visão dele, os demais só depois do fim dos lances. */
  @AutenticacaoOpcional()
  @Get('licitacao/:licitacaoId')
  async findByLicitacao(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator | null): Promise<Proposta[]> {
    const dono = await this.ehOrgaoDono(ator, licitacaoId);
    const lista = await this.propostasService.findByLicitacao(licitacaoId, dono);
    // Órgão dono: conteúdo depois do prazo de envio; quem é quem só depois dos lances
    return dono ? this.sigilo.paraOrgao(lista, licitacaoId) : lista;
  }

  private async ehOrgaoDono(ator: Ator | null, licitacaoId: string | null | undefined): Promise<boolean> {
    if (!ator || !licitacaoId) return false;
    const relacao = await this.acesso.relacaoComLicitacao(ator, licitacaoId);
    return relacao === 'ORGAO_DONO' || relacao === 'ADMIN';
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
    const proposta = await this.propostasService.findOneVisao(id, visao);
    return visao === 'FORNECEDOR' ? proposta : this.sigilo.paraOrgao(proposta, proposta.licitacao_id);
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

  @AutenticacaoOpcional()
  @Get('ranking/item/:itemId')
  async getRankingPorItem(@Param('itemId') itemId: string, @AtorAtual() ator: Ator | null) {
    const licitacaoId = await this.propostasService.licitacaoDoItem(itemId);
    const dono = await this.ehOrgaoDono(ator, licitacaoId);
    const ranking = await this.propostasService.getRankingPorItem(itemId, dono);
    return dono ? this.sigilo.paraOrgao(ranking, licitacaoId) : ranking;
  }

  @Put(':id/enviar')
  @SomenteFornecedor()
  async enviar(@Param('id') id: string, @AtorAtual() ator: Ator): Promise<Proposta> {
    const dono = await this.fornecedorDono(ator, id);
    const proposta = await this.propostasService.enviar(id);
    // Comprovante do que ficou gravado (dono, 10/11/2026): garantia para o fornecedor
    await this.comprovantes.emitir({ licitacaoId: dono.licitacao_id, fornecedorId: dono.fornecedor_id, tipo: 'PROPOSTA_ENVIADA' });
    return proposta;
  }

  @Put(':id/classificar')
  @SomenteOrgao()
  async classificar(@Param('id') id: string, @AtorAtual() ator: Ator): Promise<Proposta> {
    await this.orgaoDono(ator, id);
    const dono = await this.propostasService.donoDaProposta(id);
    return this.sigilo.paraOrgao(await this.propostasService.classificar(id), dono.licitacao_id);
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

    const donoP = await this.propostasService.donoDaProposta(id);
    return this.sigilo.paraOrgao(await this.propostasService.desclassificar(id, dados), donoP.licitacao_id);
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
    const dono = await this.propostasService.donoDaProposta(id);
    return this.sigilo.paraOrgao(await this.propostasService.marcarVencedora(id), dono.licitacao_id);
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
    const dono = await this.fornecedorDono(ator, id);
    const proposta = await this.propostasService.update(id, dados);
    // A tela grava os itens e fecha com esta chamada: um comprovante por "Salvar"
    await this.comprovantes.emitir({ licitacaoId: dono.licitacao_id, fornecedorId: dono.fornecedor_id, tipo: 'PROPOSTA_ALTERADA' });
    return proposta;
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
    const fornecedorId = this.acesso.fornecedorDoToken(ator);
    // Retrato tirado ANTES de apagar: o comprovante mostra o que foi excluído
    const dono = await this.propostasService.donoDaProposta(id).catch(() => null);
    const retrato = dono && dono.fornecedor_id === fornecedorId ? await this.comprovantes.retrato(dono.licitacao_id, fornecedorId).catch(() => null) : null;
    await this.propostasService.remove(id, fornecedorId);
    if (dono && retrato) {
      await this.comprovantes.emitir({ licitacaoId: dono.licitacao_id, fornecedorId, tipo: 'PROPOSTA_EXCLUIDA', retratoPronto: retrato });
    }
    return { ok: true };
  }
}
