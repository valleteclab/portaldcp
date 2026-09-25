import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseInterceptors,
  UploadedFile,
  NotFoundException,
  BadRequestException,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { MedicaoChatService } from './medicao-chat.service';
import { extname, join } from 'path';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { MedicaoService } from './medicao.service';
import { UploadService } from '../upload/upload.service';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Contrato, ModalidadeExecucao } from './entities/contrato.entity';
import { AnexoMedicao, TipoAnexoMedicao } from './entities/anexo-medicao.entity';
import { Medicao, StatusMedicao } from './entities/medicao.entity';
import { MedicaoEquipeService } from './medicao-equipe.service';
import { AcessoLicitacaoService, AtorAtual, SomenteFornecedor, ehUuid } from '../auth/acesso';
import type { Ator } from '../auth/acesso';

// Diretório de uploads — mesmo do UploadModule
const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

/** Remove do disco um upload já gravado pelo multer (recusa após o upload). */
function descartarUpload(file?: Express.Multer.File) {
  try {
    if (file?.path && existsSync(file.path)) unlinkSync(file.path);
  } catch {
    // melhor esforço
  }
}

/**
 * Controller para o Portal do Fornecedor — Medições.
 * Rota base: /api/fornecedor/contratos
 *
 * SEGURANÇA: a identidade do fornecedor vem SOMENTE do token (@AtorAtual).
 * O `fornecedorId`/`fornecedor_id` que o front ainda envia (query/corpo) é
 * legado: se vier diferente do token → 403; se ausente → usa o do token.
 * Todo contrato/medição/anexo acessado precisa ser do fornecedor do token
 * (senão 404 — não confirma a existência do recurso de terceiros).
 * Órgão não usa estas rotas (tem as suas em /api/contratos) → 403.
 *
 * IMPORTANTE: Rotas com segmentos estáticos (ex: medicoes/...) devem vir ANTES
 * de rotas com parâmetros dinâmicos (ex: :contratoId/...) para evitar conflitos
 * de roteamento no NestJS.
 */
@Controller('fornecedor/contratos')
@SomenteFornecedor()
export class FornecedorMedicaoController {
  constructor(
    private readonly medicaoService: MedicaoService,
    private readonly uploadService: UploadService,
    private readonly medicaoChatService: MedicaoChatService,
    private readonly medicaoEquipeService: MedicaoEquipeService,
    private readonly acesso: AcessoLicitacaoService,
    @InjectRepository(Contrato)
    private readonly contratoRepository: Repository<Contrato>,
    @InjectRepository(AnexoMedicao)
    private readonly anexoRepository: Repository<AnexoMedicao>,
    @InjectRepository(Medicao)
    private readonly medicaoRepository: Repository<Medicao>,
  ) { }

  /** Fornecedor do token (id legado divergente → 403). */
  private fornecedor(ator: Ator | null, idInformado?: string | null): string {
    return this.acesso.fornecedorDoToken(ator, idInformado);
  }

  /**
   * Valida que o fornecedor é dono do contrato. De outro fornecedor ou
   * inexistente → 404.
   */
  private async validarAcessoFornecedor(contratoId: string, fornecedorId: string): Promise<Contrato> {
    if (!ehUuid(contratoId)) throw new NotFoundException('Contrato não encontrado');
    const contrato = await this.contratoRepository.findOne({
      where: { id: contratoId, fornecedor_id: fornecedorId },
      relations: ['orgao'],
    });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    return contrato;
  }

  /** Medição cujo contrato é do fornecedor (senão 404). */
  private async medicaoDoFornecedor(medicaoId: string, fornecedorId: string): Promise<Medicao> {
    if (!ehUuid(medicaoId)) throw new NotFoundException('Medição não encontrada');
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
      relations: ['contrato'],
    });
    if (!medicao || !medicao.contrato || medicao.contrato.fornecedor_id !== fornecedorId) {
      throw new NotFoundException('Medição não encontrada');
    }
    return medicao;
  }

  /**
   * Extrai dados da NF (número, data de emissão, valor e retenções destacadas)
   * para pré-preencher a medição no formulário clássico.
   * POST /api/fornecedor/contratos/:contratoId/medicoes/extrair-nf
   */
  @Post(':contratoId/medicoes/extrair-nf')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async extrairNotaFiscal(
    @Param('contratoId') contratoId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { fornecedor_id?: string },
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, body?.fornecedor_id);
    await this.validarAcessoFornecedor(contratoId, fornecedorId);
    if (!file) {
      throw new BadRequestException('Arquivo da nota fiscal é obrigatório');
    }
    return this.medicaoChatService.extrairDadosNotaFiscal(file, contratoId, fornecedorId);
  }

  // ============================================================================
  // CAIXA DE ENTRADA — Mensagens de solicitação de medição
  // ============================================================================

  /**
   * Lista mensagens recebidas (solicitações do órgão).
   * GET /api/fornecedor/contratos/mensagens
   */
  @Get('mensagens')
  async listarMensagens(
    @Query('fornecedorId') fornecedorIdInformado: string,
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, fornecedorIdInformado);
    return this.medicaoService.listarMensagensRecebidas(fornecedorId);
  }

  /**
   * Busca uma mensagem e marca como lida.
   * GET /api/fornecedor/contratos/mensagens/:mensagemId
   */
  @Get('mensagens/:mensagemId')
  async buscarMensagem(
    @Param('mensagemId') mensagemId: string,
    @Query('fornecedorId') fornecedorIdInformado: string,
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, fornecedorIdInformado);
    if (!ehUuid(mensagemId)) throw new NotFoundException('Mensagem não encontrada');
    return this.medicaoService.buscarMensagemEMarcarComoLida(mensagemId, fornecedorId);
  }

  // ============================================================================
  // ROTAS ESTÁTICAS (medicoes/...) — DEVEM VIR PRIMEIRO
  // ============================================================================

  /**
   * Equipe (relação de funcionários) de uma medição.
   * GET /api/fornecedor/contratos/medicoes/:medicaoId/equipe
   */
  @Get('medicoes/:medicaoId/equipe')
  async buscarEquipeMedicao(
    @Param('medicaoId') medicaoId: string,
    @Query('fornecedorId') fornecedorIdInformado: string,
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, fornecedorIdInformado);
    await this.medicaoDoFornecedor(medicaoId, fornecedorId);
    return this.medicaoEquipeService.buscarPorMedicao(medicaoId);
  }

  @Put('medicoes/:medicaoId/equipe')
  async salvarEquipeMedicao(
    @Param('medicaoId') medicaoId: string,
    @Body() body: any,
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, body?.fornecedor_id);
    await this.medicaoDoFornecedor(medicaoId, fornecedorId);
    return this.medicaoEquipeService.salvar(medicaoId, { ...body, fornecedor_id: fornecedorId });
  }

  @Get('medicoes/:medicaoId/equipe/xlsx')
  async baixarEquipeXlsx(
    @Param('medicaoId') medicaoId: string,
    @Query('fornecedorId') fornecedorIdInformado: string,
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, fornecedorIdInformado);
    const medicao = await this.medicaoDoFornecedor(medicaoId, fornecedorId);
    const arquivo = await this.medicaoEquipeService.gerarXlsx(medicaoId);
    return new StreamableFile(arquivo, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="relacao-funcionarios-medicao-${medicao.numero_medicao}.xlsx"`,
    });
  }

  @Get('medicoes/:medicaoId/equipe/pdf')
  async baixarEquipePdf(
    @Param('medicaoId') medicaoId: string,
    @Query('fornecedorId') fornecedorIdInformado: string,
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, fornecedorIdInformado);
    const medicao = await this.medicaoDoFornecedor(medicaoId, fornecedorId);
    const arquivo = await this.medicaoEquipeService.gerarPdf(medicaoId);
    return new StreamableFile(arquivo, {
      type: 'application/pdf',
      disposition: `attachment; filename="relacao-funcionarios-medicao-${medicao.numero_medicao}.pdf"`,
    });
  }

  /**
   * Busca detalhe de uma medição.
   * GET /api/fornecedor/contratos/medicoes/:medicaoId
   */
  @Get('medicoes/:medicaoId')
  async buscarMedicao(
    @Param('medicaoId') medicaoId: string,
    @Query('fornecedorId') fornecedorIdInformado: string,
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, fornecedorIdInformado);
    await this.medicaoDoFornecedor(medicaoId, fornecedorId);
    return this.medicaoService.buscarMedicao(medicaoId);
  }

  /**
   * Fornecedor atualiza uma medição em rascunho/devolvida.
   * PATCH /api/fornecedor/contratos/medicoes/:medicaoId
   */
  @Patch('medicoes/:medicaoId')
  async atualizarMedicao(
    @Param('medicaoId') medicaoId: string,
    @Body() dados: any,
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, dados?.fornecedor_id);
    await this.medicaoDoFornecedor(medicaoId, fornecedorId);
    return this.medicaoService.atualizarRascunhoAssistido(medicaoId, { ...dados, fornecedor_id: fornecedorId });
  }

  /**
   * Obtém ou gera o boletim PDF oficial persistido da medição.
   * GET /api/fornecedor/contratos/medicoes/:medicaoId/boletim-oficial
   */
  @Get('medicoes/:medicaoId/boletim-oficial')
  async obterBoletimOficial(
    @Param('medicaoId') medicaoId: string,
    @Query('fornecedorId') fornecedorIdInformado: string,
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, fornecedorIdInformado);
    await this.medicaoDoFornecedor(medicaoId, fornecedorId);

    // Sempre regenera no backend para garantir que o fornecedor baixe
    // o mesmo boletim oficial (cálculo/estrutura) utilizado pelo órgão.
    return this.medicaoService.gerarPdfOficialMedicao(medicaoId);
  }

  /**
   * Fornecedor atualiza os itens (percentuais/valores) de uma medição DEVOLVIDA.
   * PUT /api/fornecedor/contratos/medicoes/:medicaoId/itens
   */
  @Put('medicoes/:medicaoId/itens')
  async atualizarItensMedicao(
    @Param('medicaoId') medicaoId: string,
    @Body() body: {
      fornecedor_id?: string;
      itens: Array<{ item_id: string; percentual_executado_atual?: number; valor_executado_atual?: number }>;
    },
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, body?.fornecedor_id);
    await this.medicaoDoFornecedor(medicaoId, fornecedorId);
    return this.medicaoService.atualizarItensMedicao(medicaoId, fornecedorId, { itens: body.itens });
  }

  /**
   * Fornecedor submete a medição para análise do fiscal.
   * PATCH /api/fornecedor/contratos/medicoes/:medicaoId/submeter
   */
  @Patch('medicoes/:medicaoId/submeter')
  async submeterMedicao(
    @Param('medicaoId') medicaoId: string,
    @Body() body: {
      fornecedor_id?: string;
      fornecedor_observacoes?: string;
      nota_fiscal_numero?: string;
      nota_fiscal_valor?: number;
      nota_fiscal_data?: string;
    },
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, body?.fornecedor_id);
    await this.medicaoDoFornecedor(medicaoId, fornecedorId);
    await this.medicaoEquipeService.validarObrigatoriaParaContrato(medicaoId);
    return this.medicaoService.submeterMedicao(medicaoId, fornecedorId, body);
  }

  /**
   * Fornecedor exclui uma medição em rascunho ou devolvida.
   * DELETE /api/fornecedor/contratos/medicoes/:medicaoId
   */
  @Delete('medicoes/:medicaoId')
  async excluirMedicao(
    @Param('medicaoId') medicaoId: string,
    @Query('fornecedorId') fornecedorIdInformado: string,
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, fornecedorIdInformado);
    await this.medicaoDoFornecedor(medicaoId, fornecedorId);
    return this.medicaoService.excluirMedicao(medicaoId, fornecedorId);
  }

  /**
   * Upload de anexo (foto ou documento) para uma medição.
   * POST /api/fornecedor/contratos/medicoes/:medicaoId/anexos
   * (o PapelGuard roda antes do multer: só fornecedor autenticado grava em disco;
   * a posse da medição é conferida logo após e o arquivo é descartado se falhar)
   */
  @Post('medicoes/:medicaoId/anexos')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (req: any, file, cb) => {
        const medicaoId = req.params.medicaoId;
        if (!ehUuid(medicaoId)) {
          return cb(new NotFoundException('Medição não encontrada'), '');
        }
        const dir = join(uploadDir, 'medicoes', medicaoId);
        try {
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }
          cb(null, dir);
        } catch (e) {
          cb(e as Error, dir);
        }
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = extname(file.originalname).toLowerCase();
        cb(null, `${uniqueSuffix}${ext}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb: any) => {
      if (!ALLOWED_MIMES.includes(file.mimetype)) {
        return cb(new BadRequestException('Tipo de arquivo não permitido. Use PDF, JPG ou PNG.'), false);
      }
      const ext = extname(file.originalname).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return cb(new BadRequestException(`Extensão ${ext} não permitida.`), false);
      }
      cb(null, true);
    },
  }))
  async uploadAnexo(
    @Param('medicaoId') medicaoId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('tipo') tipo: string,
    @Body('descricao') descricao: string,
    @Body('fornecedor_id') fornecedorIdInformado: string,
    @Body('fornecedor_nome') fornecedorNome: string,
    @AtorAtual() ator: Ator,
  ) {
    let fornecedorId: string;
    let medicao: Medicao;
    try {
      fornecedorId = this.fornecedor(ator, fornecedorIdInformado);
      medicao = await this.medicaoDoFornecedor(medicaoId, fornecedorId);
    } catch (e) {
      descartarUpload(file);
      throw e;
    }

    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    // Validação de segurança: verificar magic bytes do arquivo
    if (file.buffer || file.path) {
      const fs = await import('fs');
      const filePath = file.path;
      if (filePath && fs.existsSync(filePath)) {
        const fd = fs.openSync(filePath, 'r');
        const header = Buffer.alloc(8);
        fs.readSync(fd, header, 0, 8, 0);
        fs.closeSync(fd);

        const isJpeg = header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF;
        const isPng = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47;
        const isPdf = header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46;

        if (!isJpeg && !isPng && !isPdf) {
          // Arquivo suspeito — remover e rejeitar
          fs.unlinkSync(filePath);
          throw new BadRequestException(
            'Arquivo rejeitado: o conteúdo não corresponde a uma imagem (JPG/PNG) ou PDF válido.'
          );
        }
      }
    }

    // Só permite upload em medições RASCUNHO, DEVOLVIDA ou PARCIALMENTE_ATESTADA
    if (!['RASCUNHO', 'DEVOLVIDA', 'PARCIALMENTE_ATESTADA'].includes(medicao.status)) {
      descartarUpload(file);
      throw new BadRequestException('Só é possível enviar anexos em medições com status Rascunho, Devolvida ou Parcialmente Atestada.');
    }

    // Determinar tipo do anexo
    const tipoAnexo = tipo === 'DOCUMENTO' ? TipoAnexoMedicao.DOCUMENTO : TipoAnexoMedicao.FOTO;
    const pastaUpload = `medicoes/${medicaoId}`;
    const fileUrl = this.uploadService.getFileUrl(pastaUpload, file.filename);

    // Salvar registro no banco
    const anexo = this.anexoRepository.create({
      medicao_id: medicaoId,
      tipo: tipoAnexo,
      nome_original: file.originalname,
      nome_arquivo: file.filename,
      mime_type: file.mimetype,
      tamanho_bytes: file.size,
      url: fileUrl,
      descricao: descricao || undefined,
      enviado_por_id: fornecedorId,
      enviado_por_nome: fornecedorNome,
      origem: 'fornecedor',
    });

    return this.anexoRepository.save(anexo);
  }

  /**
   * Lista anexos de uma medição.
   * GET /api/fornecedor/contratos/medicoes/:medicaoId/anexos
   */
  @Get('medicoes/:medicaoId/anexos')
  async listarAnexos(
    @Param('medicaoId') medicaoId: string,
    @Query('fornecedorId') fornecedorIdInformado: string,
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, fornecedorIdInformado);
    await this.medicaoDoFornecedor(medicaoId, fornecedorId);
    return this.anexoRepository.find({
      where: { medicao_id: medicaoId },
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Exclui um anexo de uma medição.
   * DELETE /api/fornecedor/contratos/medicoes/anexos/:anexoId
   */
  @Delete('medicoes/anexos/:anexoId')
  async excluirAnexo(
    @Param('anexoId') anexoId: string,
    @Query('fornecedorId') fornecedorIdInformado: string,
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, fornecedorIdInformado);
    if (!ehUuid(anexoId)) throw new NotFoundException('Anexo não encontrado');
    const anexo = await this.anexoRepository.findOne({
      where: { id: anexoId },
      relations: ['medicao', 'medicao.contrato'],
    });
    if (!anexo || anexo.medicao?.contrato?.fornecedor_id !== fornecedorId) {
      throw new NotFoundException('Anexo não encontrado');
    }

    // Só permite excluir em medições RASCUNHO, DEVOLVIDA ou PARCIALMENTE_ATESTADA
    if (anexo.medicao && !['RASCUNHO', 'DEVOLVIDA', 'PARCIALMENTE_ATESTADA'].includes(anexo.medicao.status)) {
      throw new BadRequestException('Só é possível excluir anexos em medições com status Rascunho, Devolvida ou Parcialmente Atestada.');
    }

    // Excluir arquivo físico
    const pastaUpload = `medicoes/${anexo.medicao_id}`;
    this.uploadService.deleteFile(pastaUpload, anexo.nome_arquivo);

    // Excluir registro
    await this.anexoRepository.remove(anexo);
    return { success: true, message: 'Anexo excluído' };
  }

  // ============================================================================
  // DISCRIMINAÇÃO DE DESPESAS
  // ============================================================================

  /**
   * Retorna sugestão de discriminação (da última medição aprovada do contrato).
   * GET /api/fornecedor/contratos/medicoes/:medicaoId/discriminacoes/sugestao
   */
  @Get('medicoes/:medicaoId/discriminacoes/sugestao')
  async sugestaoDiscriminacoes(
    @Param('medicaoId') medicaoId: string,
    @Query('fornecedorId') fornecedorIdInformado: string,
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, fornecedorIdInformado);
    const medicao = await this.medicaoDoFornecedor(medicaoId, fornecedorId);
    const ignorarAtual =
      medicao.status === StatusMedicao.RASCUNHO ||
      medicao.status === StatusMedicao.DEVOLVIDA
        ? medicao.id
        : undefined;
    return this.medicaoService.sugerirDiscriminacoes(
      medicao.contrato_id,
      ignorarAtual,
    );
  }

  /**
   * Lista discriminações de despesa de uma medição.
   * GET /api/fornecedor/contratos/medicoes/:medicaoId/discriminacoes
   */
  @Get('medicoes/:medicaoId/discriminacoes')
  async listarDiscriminacoes(
    @Param('medicaoId') medicaoId: string,
    @Query('fornecedorId') fornecedorIdInformado: string,
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, fornecedorIdInformado);
    await this.medicaoDoFornecedor(medicaoId, fornecedorId);
    return this.medicaoService.listarDiscriminacoes(medicaoId);
  }

  /**
   * Salva discriminações de despesa (substitui todas).
   * POST /api/fornecedor/contratos/medicoes/:medicaoId/discriminacoes
   */
  @Post('medicoes/:medicaoId/discriminacoes')
  async salvarDiscriminacoes(
    @Param('medicaoId') medicaoId: string,
    @Body() body: {
      fornecedor_id?: string;
      itens: { descricao: string; valor: number; percentual: number }[];
    },
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, body?.fornecedor_id);
    await this.medicaoDoFornecedor(medicaoId, fornecedorId);
    if (!body.itens || !Array.isArray(body.itens)) {
      throw new BadRequestException('itens é obrigatório e deve ser um array');
    }
    return this.medicaoService.salvarDiscriminacoes(medicaoId, fornecedorId, body.itens);
  }

  // ============================================================================
  // ASSINATURA / BOLETIM (medicoes/...)
  // ============================================================================

  /**
   * Registra assinatura digital para o Boletim de Medição (fornecedor).
   * POST /api/fornecedor/contratos/medicoes/:medicaoId/assinar
   * Usa o mesmo módulo de assinaturas das OS/OF. Pelo portal do fornecedor o
   * papel é sempre FORNECEDOR (fiscal/gestor assinam pelas rotas do órgão).
   */
  @Post('medicoes/:medicaoId/assinar')
  async assinarMedicao(
    @Param('medicaoId') medicaoId: string,
    @Body() body: {
      usuario_nome: string;
      usuario_cpf_cnpj?: string;
      usuario_cargo?: string;
    },
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator);
    await this.medicaoDoFornecedor(medicaoId, fornecedorId);
    return this.medicaoService.registrarAssinaturaMedicao(medicaoId, {
      papel: 'FORNECEDOR',
      usuario_nome: body?.usuario_nome || '',
      usuario_cpf_cnpj: body?.usuario_cpf_cnpj || '',
      usuario_cargo: body?.usuario_cargo,
    });
  }

  /**
   * Solicita envio de OTP para assinatura do boletim de medição.
   * POST /api/fornecedor/contratos/medicoes/:medicaoId/solicitar-otp-assinatura
   */
  @Post('medicoes/:medicaoId/solicitar-otp-assinatura')
  async solicitarOtpAssinatura(
    @Param('medicaoId') medicaoId: string,
    @Body() body: { fornecedor_id?: string },
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, body?.fornecedor_id);
    await this.medicaoDoFornecedor(medicaoId, fornecedorId);
    return this.medicaoService.solicitarOtpAssinaturaMedicao(medicaoId, fornecedorId);
  }

  /**
   * Valida OTP, registra assinatura digital e submete a medição.
   * POST /api/fornecedor/contratos/medicoes/:medicaoId/validar-otp-assinatura
   */
  @Post('medicoes/:medicaoId/validar-otp-assinatura')
  async validarOtpAssinatura(
    @Param('medicaoId') medicaoId: string,
    @Body() body: { fornecedor_id?: string; codigo: string },
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, body?.fornecedor_id);
    await this.medicaoDoFornecedor(medicaoId, fornecedorId);
    if (!body.codigo) throw new BadRequestException('codigo é obrigatório');
    await this.medicaoEquipeService.validarObrigatoriaParaContrato(medicaoId);
    return this.medicaoService.validarOtpAssinaturaMedicao(medicaoId, fornecedorId, body.codigo);
  }

  /**
   * Upload do boletim PDF assinado.
   * POST /api/fornecedor/contratos/medicoes/:medicaoId/upload-boletim
   */
  @Post('medicoes/:medicaoId/upload-boletim')
  @UseInterceptors(FileInterceptor('arquivo', {
    limits: { fileSize: 10 * 1024 * 1024 },
  }))
  async uploadBoletim(
    @Param('medicaoId') medicaoId: string,
    @UploadedFile() file: Express.Multer.File,
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator);
    await this.medicaoDoFornecedor(medicaoId, fornecedorId);
    if (!file) throw new BadRequestException('Arquivo PDF é obrigatório');

    // Salvar PDF usando o service (que gerencia o armazenamento)
    const pdfUrl = await this.medicaoService.salvarBoletimPdf(medicaoId, file.buffer);

    return { url: pdfUrl, filename: file.filename };
  }

  // ============================================================================
  // ROTAS COM PARÂMETROS DINÂMICOS (:contratoId/..., :fornecedorId/...)
  // ============================================================================

  /**
   * Lista contratos de medição do fornecedor com resumo.
   * GET /api/fornecedor/contratos/:fornecedorId/medicao
   * (o :fornecedorId da rota precisa ser o do token)
   */
  @Get(':fornecedorId/medicao')
  async listarContratosMedicao(
    @Param('fornecedorId') fornecedorIdInformado: string,
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, fornecedorIdInformado);
    const contratos = await this.contratoRepository.find({
      where: {
        fornecedor_id: fornecedorId,
        modalidade_execucao: In([ModalidadeExecucao.MEDICAO, ModalidadeExecucao.CONTINUADO, ModalidadeExecucao.LICENCA]),
      },
      relations: ['orgao'],
      order: { created_at: 'DESC' },
    });

    // Para cada contrato, buscar resumo de medições
    const resultado = [];
    for (const contrato of contratos) {
      try {
        const resumo = await this.medicaoService.resumoMedicoes(contrato.id);
        resultado.push({
          ...contrato,
          resumo_medicoes: resumo,
        });
      } catch {
        resultado.push({
          ...contrato,
          resumo_medicoes: null,
        });
      }
    }

    return resultado;
  }

  /**
   * Busca um contrato individual do fornecedor.
   * GET /api/fornecedor/contratos/:contratoId/detalhe
   */
  @Get(':contratoId/detalhe')
  async buscarContrato(
    @Param('contratoId') contratoId: string,
    @Query('fornecedorId') fornecedorIdInformado: string,
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, fornecedorIdInformado);
    return this.validarAcessoFornecedor(contratoId, fornecedorId);
  }

  /**
   * Lista etapas do cronograma de um contrato.
   * GET /api/fornecedor/contratos/:contratoId/etapas
   */
  @Get(':contratoId/etapas')
  async listarEtapas(
    @Param('contratoId') contratoId: string,
    @Query('fornecedorId') fornecedorIdInformado: string,
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, fornecedorIdInformado);
    await this.validarAcessoFornecedor(contratoId, fornecedorId);
    return this.medicaoService.listarEtapas(contratoId);
  }

  /**
   * Lista itens do cronograma de um contrato (serviços por quantidade).
   * GET /api/fornecedor/contratos/:contratoId/itens-cronograma
   */
  @Get(':contratoId/itens-cronograma')
  async listarItensCronograma(
    @Param('contratoId') contratoId: string,
    @Query('fornecedorId') fornecedorIdInformado: string,
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, fornecedorIdInformado);
    await this.validarAcessoFornecedor(contratoId, fornecedorId);
    return this.medicaoService.listarItensCronograma(contratoId);
  }

  /**
   * Última equipe informada no contrato (para pré-preencher a próxima medição).
   * GET /api/fornecedor/contratos/:contratoId/equipe/ultima
   */
  @Get(':contratoId/equipe/ultima')
  async buscarUltimaEquipeContrato(
    @Param('contratoId') contratoId: string,
    @Query('fornecedorId') fornecedorIdInformado: string,
    @AtorAtual() ator: Ator,
    @Query('excluirMedicaoId') excluirMedicaoId?: string,
  ) {
    const fornecedorId = this.fornecedor(ator, fornecedorIdInformado);
    await this.validarAcessoFornecedor(contratoId, fornecedorId);
    return this.medicaoEquipeService.buscarUltimaEquipe(
      contratoId,
      excluirMedicaoId,
    );
  }

  /**
   * Lista medições de um contrato do fornecedor.
   * GET /api/fornecedor/contratos/:contratoId/medicoes
   */
  @Get(':contratoId/medicoes')
  async listarMedicoes(
    @Param('contratoId') contratoId: string,
    @Query('fornecedorId') fornecedorIdInformado: string,
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, fornecedorIdInformado);
    await this.validarAcessoFornecedor(contratoId, fornecedorId);
    return this.medicaoService.listarMedicoes(contratoId);
  }

  /**
   * Fornecedor cria um rascunho de medição.
   * POST /api/fornecedor/contratos/:contratoId/medicoes
   */
  @Post(':contratoId/medicoes')
  async criarMedicao(
    @Param('contratoId') contratoId: string,
    @Body() dados: any,
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, dados?.fornecedor_id);
    await this.validarAcessoFornecedor(contratoId, fornecedorId);

    return this.medicaoService.criarMedicao(contratoId, {
      ...dados,
      fornecedor_id: fornecedorId,
      usuario_cadastro_id: fornecedorId,
      usuario_cadastro_nome: dados?.fornecedor_nome,
    });
  }

  /**
   * Resumo de medições de um contrato.
   * GET /api/fornecedor/contratos/:contratoId/medicoes/resumo
   */
  @Get(':contratoId/medicoes/resumo')
  async resumoMedicoes(
    @Param('contratoId') contratoId: string,
    @Query('fornecedorId') fornecedorIdInformado: string,
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, fornecedorIdInformado);
    await this.validarAcessoFornecedor(contratoId, fornecedorId);
    return this.medicaoService.resumoMedicoes(contratoId);
  }

  /**
   * Retorna o resumo de execução fiscal/financeira por item do contrato para o fornecedor.
   * GET /api/fornecedor/contratos/:contratoId/execucao-financeira?medicaoId=xxx
   */
  @Get(':contratoId/execucao-financeira')
  async execucaoFinanceira(
    @Param('contratoId') contratoId: string,
    @Query('fornecedorId') fornecedorIdInformado: string,
    @Query('medicaoId') medicaoId: string,
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.fornecedor(ator, fornecedorIdInformado);
    await this.validarAcessoFornecedor(contratoId, fornecedorId);
    if (medicaoId) {
      const medicao = await this.medicaoDoFornecedor(medicaoId, fornecedorId);
      if (medicao.contrato_id !== contratoId) throw new NotFoundException('Medição não encontrada');
    }
    return this.medicaoService.calcularExecucaoFinanceiraFornecedor(contratoId, medicaoId || undefined);
  }
}
