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
  Req,
  UseInterceptors,
  UploadedFile,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtPayload, UserType } from '../auth/auth.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { MedicaoService } from './medicao.service';
import { ContratosService } from './contratos.service';
import { UploadService } from '../upload/upload.service';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Contrato, ModalidadeExecucao } from './entities/contrato.entity';
import { AnexoMedicao, TipoAnexoMedicao } from './entities/anexo-medicao.entity';
import { Medicao, StatusMedicao } from './entities/medicao.entity';

// Diretório de uploads — mesmo do UploadModule
const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

/**
 * Controller para o Portal do Fornecedor — Medições.
 * Todos os endpoints garantem que o fornecedor só acessa seus próprios contratos.
 * Rota base: /api/fornecedor/contratos
 *
 * IMPORTANTE: Rotas com segmentos estáticos (ex: medicoes/...) devem vir ANTES
 * de rotas com parâmetros dinâmicos (ex: :contratoId/...) para evitar conflitos
 * de roteamento no NestJS.
 */
@Controller('fornecedor/contratos')
export class FornecedorMedicaoController {
  constructor(
    private readonly medicaoService: MedicaoService,
    private readonly contratosService: ContratosService,
    private readonly uploadService: UploadService,
    @InjectRepository(Contrato)
    private readonly contratoRepository: Repository<Contrato>,
    @InjectRepository(AnexoMedicao)
    private readonly anexoRepository: Repository<AnexoMedicao>,
    @InjectRepository(Medicao)
    private readonly medicaoRepository: Repository<Medicao>,
  ) { }

  /**
   * Valida que o fornecedor é dono do contrato.
   */
  private async validarAcessoFornecedor(contratoId: string, fornecedorId: string): Promise<Contrato> {
    const contrato = await this.contratoRepository.findOne({
      where: { id: contratoId },
      relations: ['orgao'],
    });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    if (contrato.fornecedor_id !== fornecedorId) {
      throw new ForbiddenException('Você não tem acesso a este contrato');
    }
    return contrato;
  }

  // ============================================================================
  // CAIXA DE ENTRADA — Mensagens de solicitação de medição
  // ============================================================================

  /**
   * Lista mensagens recebidas (solicitações do órgão).
   * GET /api/fornecedor/contratos/mensagens?fornecedorId=X
   */
  @Get('mensagens')
  async listarMensagens(
    @Query('fornecedorId') fornecedorId: string,
    @Req() request: { user: JwtPayload },
  ) {
    if (!fornecedorId) throw new BadRequestException('fornecedorId é obrigatório');
    if (request.user.type === UserType.FORNECEDOR && request.user.sub !== fornecedorId) {
      throw new ForbiddenException('Acesso negado');
    }
    return this.medicaoService.listarMensagensRecebidas(fornecedorId);
  }

  /**
   * Busca uma mensagem e marca como lida.
   * GET /api/fornecedor/contratos/mensagens/:mensagemId?fornecedorId=X
   */
  @Get('mensagens/:mensagemId')
  async buscarMensagem(
    @Param('mensagemId') mensagemId: string,
    @Query('fornecedorId') fornecedorId: string,
    @Req() request: { user: JwtPayload },
  ) {
    if (!fornecedorId) throw new BadRequestException('fornecedorId é obrigatório');
    if (request.user.type === UserType.FORNECEDOR && request.user.sub !== fornecedorId) {
      throw new ForbiddenException('Acesso negado');
    }
    return this.medicaoService.buscarMensagemEMarcarComoLida(mensagemId, fornecedorId);
  }

  // ============================================================================
  // ROTAS ESTÁTICAS (medicoes/...) — DEVEM VIR PRIMEIRO
  // ============================================================================

  /**
   * Busca detalhe de uma medição.
   * GET /api/fornecedor/contratos/medicoes/:medicaoId
   */
  @Get('medicoes/:medicaoId')
  async buscarMedicao(@Param('medicaoId') medicaoId: string) {
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
  ) {
    if (!dados.fornecedor_id) {
      throw new BadRequestException('fornecedor_id é obrigatório');
    }

    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
    });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    await this.validarAcessoFornecedor(medicao.contrato_id, dados.fornecedor_id);
    return this.medicaoService.atualizarRascunhoAssistido(medicaoId, dados);
  }

  /**
   * Obtém ou gera o boletim PDF oficial persistido da medição.
   * GET /api/fornecedor/contratos/medicoes/:medicaoId/boletim-oficial?fornecedorId=X
   */
  @Get('medicoes/:medicaoId/boletim-oficial')
  async obterBoletimOficial(
    @Param('medicaoId') medicaoId: string,
    @Query('fornecedorId') fornecedorId: string,
  ) {
    if (!fornecedorId) throw new BadRequestException('fornecedorId é obrigatório');

    const medicao = await this.medicaoService.buscarMedicao(medicaoId);
    await this.validarAcessoFornecedor(medicao.contrato_id, fornecedorId);

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
      fornecedor_id: string;
      itens: Array<{ item_id: string; percentual_executado_atual?: number; valor_executado_atual?: number }>;
    },
  ) {
    if (!body.fornecedor_id) {
      throw new BadRequestException('fornecedor_id é obrigatório');
    }
    return this.medicaoService.atualizarItensMedicao(medicaoId, body.fornecedor_id, { itens: body.itens });
  }

  /**
   * Fornecedor submete a medição para análise do fiscal.
   * PATCH /api/fornecedor/contratos/medicoes/:medicaoId/submeter
   */
  @Patch('medicoes/:medicaoId/submeter')
  async submeterMedicao(
    @Param('medicaoId') medicaoId: string,
    @Body() body: {
      fornecedor_id: string;
      fornecedor_observacoes?: string;
      nota_fiscal_numero?: string;
      nota_fiscal_valor?: number;
      nota_fiscal_data?: string;
    },
  ) {
    return this.medicaoService.submeterMedicao(medicaoId, body.fornecedor_id, body);
  }

  /**
   * Fornecedor exclui uma medição em rascunho ou devolvida.
   * DELETE /api/fornecedor/contratos/medicoes/:medicaoId
   */
  @Delete('medicoes/:medicaoId')
  async excluirMedicao(
    @Param('medicaoId') medicaoId: string,
    @Query('fornecedorId') fornecedorId: string,
  ) {
    if (!fornecedorId) {
      throw new BadRequestException('fornecedorId é obrigatório');
    }
    return this.medicaoService.excluirMedicao(medicaoId, fornecedorId);
  }

  /**
   * Upload de anexo (foto ou documento) para uma medição.
   * POST /api/fornecedor/contratos/medicoes/:medicaoId/anexos
   */
  @Post('medicoes/:medicaoId/anexos')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (req: any, file, cb) => {
        const medicaoId = req.params.medicaoId;
        const dir = join(uploadDir, 'medicoes', medicaoId);
        console.log(`[DEBUG UPLOAD] uploadDir: ${uploadDir}`);
        console.log(`[DEBUG UPLOAD] Destino: ${dir}`);
        try {
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
            console.log(`[DEBUG UPLOAD] Diretório criado: ${dir}`);
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
    @Body('fornecedor_id') fornecedorId: string,
    @Body('fornecedor_nome') fornecedorNome: string,
  ) {
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

    // Verificar se a medição existe
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
      relations: ['contrato'],
    });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    // Só permite upload em medições RASCUNHO, DEVOLVIDA ou PARCIALMENTE_ATESTADA
    if (!['RASCUNHO', 'DEVOLVIDA', 'PARCIALMENTE_ATESTADA'].includes(medicao.status)) {
      // Remover arquivo salvo em disco antes de rejeitar
      if (file.path) {
        const fs = await import('fs');
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      }
      throw new BadRequestException('Só é possível enviar anexos em medições com status Rascunho, Devolvida ou Parcialmente Atestada.');
    }

    // Validar acesso do fornecedor
    if (fornecedorId && medicao.contrato) {
      await this.validarAcessoFornecedor(medicao.contrato.id, fornecedorId);
    }

    // Determinar tipo do anexo
    const tipoAnexo = tipo === 'DOCUMENTO' ? TipoAnexoMedicao.DOCUMENTO : TipoAnexoMedicao.FOTO;
    const pastaUpload = `medicoes/${medicaoId}`;
    const fileUrl = this.uploadService.getFileUrl(pastaUpload, file.filename);
    
    console.log(`[DEBUG UPLOAD] Arquivo salvo em: ${file.path}`);
    console.log(`[DEBUG UPLOAD] URL gerada: ${fileUrl}`);
    console.log(`[DEBUG UPLOAD] pastaUpload: ${pastaUpload}`);
    console.log(`[DEBUG UPLOAD] filename: ${file.filename}`);

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
  async listarAnexos(@Param('medicaoId') medicaoId: string) {
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
    @Query('fornecedorId') fornecedorId: string,
  ) {
    const anexo = await this.anexoRepository.findOne({
      where: { id: anexoId },
      relations: ['medicao', 'medicao.contrato'],
    });
    if (!anexo) throw new NotFoundException('Anexo não encontrado');

    // Só permite excluir em medições RASCUNHO, DEVOLVIDA ou PARCIALMENTE_ATESTADA
    if (anexo.medicao && !['RASCUNHO', 'DEVOLVIDA', 'PARCIALMENTE_ATESTADA'].includes(anexo.medicao.status)) {
      throw new BadRequestException('Só é possível excluir anexos em medições com status Rascunho, Devolvida ou Parcialmente Atestada.');
    }

    // Validar acesso
    if (fornecedorId && anexo.medicao?.contrato) {
      await this.validarAcessoFornecedor(anexo.medicao.contrato.id, fornecedorId);
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
    @Query('fornecedorId') fornecedorId: string,
  ) {
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
      relations: ['contrato'],
    });
    if (!medicao) throw new NotFoundException('Medição não encontrada');
    if (fornecedorId && medicao.contrato) {
      await this.validarAcessoFornecedor(medicao.contrato.id, fornecedorId);
    }
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
    @Query('fornecedorId') fornecedorId: string,
  ) {
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
      relations: ['contrato'],
    });
    if (!medicao) throw new NotFoundException('Medição não encontrada');
    if (fornecedorId && medicao.contrato) {
      await this.validarAcessoFornecedor(medicao.contrato.id, fornecedorId);
    }
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
      fornecedor_id: string;
      itens: { descricao: string; valor: number; percentual: number }[];
    },
  ) {
    if (!body.fornecedor_id) throw new BadRequestException('fornecedor_id é obrigatório');
    if (!body.itens || !Array.isArray(body.itens)) {
      throw new BadRequestException('itens é obrigatório e deve ser um array');
    }
    return this.medicaoService.salvarDiscriminacoes(medicaoId, body.fornecedor_id, body.itens);
  }

  // ============================================================================
  // ROTAS COM PARÂMETROS DINÂMICOS (:contratoId/..., :fornecedorId/...)
  // ============================================================================

  /**
   * Lista contratos de medição do fornecedor com resumo.
   * GET /api/fornecedor/contratos/:fornecedorId/medicao
   */
  @Get(':fornecedorId/medicao')
  async listarContratosMedicao(@Param('fornecedorId') fornecedorId: string) {
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
   * GET /api/fornecedor/contratos/:contratoId/detalhe?fornecedorId=X
   */
  @Get(':contratoId/detalhe')
  async buscarContrato(
    @Param('contratoId') contratoId: string,
    @Query('fornecedorId') fornecedorId: string,
  ) {
    const contrato = await this.contratoRepository.findOne({
      where: { id: contratoId },
      relations: ['orgao'],
    });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    if (fornecedorId && contrato.fornecedor_id !== fornecedorId) {
      throw new ForbiddenException('Você não tem acesso a este contrato');
    }
    return contrato;
  }

  /**
   * Lista etapas do cronograma de um contrato.
   * GET /api/fornecedor/contratos/:contratoId/etapas?fornecedorId=X
   */
  @Get(':contratoId/etapas')
  async listarEtapas(
    @Param('contratoId') contratoId: string,
    @Query('fornecedorId') fornecedorId: string,
  ) {
    if (fornecedorId) {
      await this.validarAcessoFornecedor(contratoId, fornecedorId);
    }
    return this.medicaoService.listarEtapas(contratoId);
  }

  /**
   * Lista itens do cronograma de um contrato (serviços por quantidade).
   * GET /api/fornecedor/contratos/:contratoId/itens-cronograma?fornecedorId=X
   */
  @Get(':contratoId/itens-cronograma')
  async listarItensCronograma(
    @Param('contratoId') contratoId: string,
    @Query('fornecedorId') fornecedorId: string,
  ) {
    if (fornecedorId) {
      await this.validarAcessoFornecedor(contratoId, fornecedorId);
    }
    return this.medicaoService.listarItensCronograma(contratoId);
  }

  /**
   * Lista medições de um contrato (filtrado pelo fornecedor).
   * GET /api/fornecedor/contratos/:contratoId/medicoes?fornecedorId=X
   */
  @Get(':contratoId/medicoes')
  async listarMedicoes(
    @Param('contratoId') contratoId: string,
  ) {
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
  ) {
    // Validar acesso
    if (dados.fornecedor_id) {
      await this.validarAcessoFornecedor(contratoId, dados.fornecedor_id);
    }

    return this.medicaoService.criarMedicao(contratoId, {
      ...dados,
      usuario_cadastro_id: dados.fornecedor_id,
      usuario_cadastro_nome: dados.fornecedor_nome,
    });
  }

  /**
   * Resumo de medições de um contrato.
   * GET /api/fornecedor/contratos/:contratoId/medicoes/resumo
   */
  @Get(':contratoId/medicoes/resumo')
  async resumoMedicoes(@Param('contratoId') contratoId: string) {
    return this.medicaoService.resumoMedicoes(contratoId);
  }

  /**
   * Registra assinatura digital para o Boletim de Medição (fornecedor).
   * POST /api/fornecedor/contratos/medicoes/:medicaoId/assinar
   * Usa o mesmo módulo de assinaturas das OS/OF.
   */
  @Post('medicoes/:medicaoId/assinar')
  async assinarMedicao(
    @Param('medicaoId') medicaoId: string,
    @Body() body: {
      papel: 'FORNECEDOR' | 'FISCAL' | 'GESTOR';
      usuario_nome: string;
      usuario_cpf_cnpj?: string;
      usuario_cargo?: string;
    },
  ) {
    return this.medicaoService.registrarAssinaturaMedicao(medicaoId, {
      papel: body.papel,
      usuario_nome: body.usuario_nome || '',
      usuario_cpf_cnpj: body.usuario_cpf_cnpj || '',
      usuario_cargo: body.usuario_cargo,
    });
  }

  /**
   * Solicita envio de OTP para assinatura do boletim de medição.
   * POST /api/fornecedor/contratos/medicoes/:medicaoId/solicitar-otp-assinatura
   */
  @Post('medicoes/:medicaoId/solicitar-otp-assinatura')
  async solicitarOtpAssinatura(
    @Param('medicaoId') medicaoId: string,
    @Body() body: { fornecedor_id: string },
  ) {
    if (!body.fornecedor_id) throw new BadRequestException('fornecedor_id é obrigatório');
    return this.medicaoService.solicitarOtpAssinaturaMedicao(medicaoId, body.fornecedor_id);
  }

  /**
   * Valida OTP, registra assinatura digital e submete a medição.
   * POST /api/fornecedor/contratos/medicoes/:medicaoId/validar-otp-assinatura
   */
  @Post('medicoes/:medicaoId/validar-otp-assinatura')
  async validarOtpAssinatura(
    @Param('medicaoId') medicaoId: string,
    @Body() body: { fornecedor_id: string; codigo: string },
  ) {
    if (!body.fornecedor_id) throw new BadRequestException('fornecedor_id é obrigatório');
    if (!body.codigo) throw new BadRequestException('codigo é obrigatório');
    return this.medicaoService.validarOtpAssinaturaMedicao(medicaoId, body.fornecedor_id, body.codigo);
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
  ) {
    if (!file) throw new BadRequestException('Arquivo PDF é obrigatório');
    
    // Salvar PDF usando o service (que gerencia o armazenamento)
    const pdfUrl = await this.medicaoService.salvarBoletimPdf(medicaoId, file.buffer);
    
    return { url: pdfUrl, filename: file.filename };
  }

  /**
   * Retorna o resumo de execução fiscal/financeira por item do contrato para o fornecedor.
   * GET /api/fornecedor/contratos/:contratoId/execucao-financeira?fornecedorId=xxx&medicaoId=xxx
   */
  @Get(':contratoId/execucao-financeira')
  async execucaoFinanceira(
    @Param('contratoId') contratoId: string,
    @Query('fornecedorId') fornecedorId: string,
    @Query('medicaoId') medicaoId: string,
  ) {
    console.log('DEBUG: Endpoint execucaoFinanceira chamado');
    console.log('DEBUG: contratoId:', contratoId);
    console.log('DEBUG: fornecedorId:', fornecedorId);
    console.log('DEBUG: medicaoId:', medicaoId);
    
    if (!fornecedorId) {
      console.log('DEBUG: fornecedorId não fornecido');
      throw new BadRequestException('fornecedorId é obrigatório');
    }
    
    // Validar acesso do fornecedor
    console.log('DEBUG: Validando acesso do fornecedor...');
    await this.validarAcessoFornecedor(contratoId, fornecedorId);
    console.log('DEBUG: Acesso validado com sucesso');
    
    const resultado = await this.medicaoService.calcularExecucaoFinanceiraFornecedor(contratoId, medicaoId || undefined);
    console.log('DEBUG: Resultado calculado:', resultado);
    
    return resultado;
  }
}
