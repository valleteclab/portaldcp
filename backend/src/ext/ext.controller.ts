import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { Public } from '../auth/public.decorator';
import { Contrato } from '../contratos/entities/contrato.entity';
import { Medicao } from '../contratos/entities/medicao.entity';
import { ItemCronograma } from '../contratos/entities/item-cronograma.entity';
import { EtapaCronograma } from '../contratos/entities/etapa-cronograma.entity';
import { AnexoMedicao, TipoAnexoMedicao } from '../contratos/entities/anexo-medicao.entity';
import { AssinaturaDigital, EntidadeTipo, PapelAssinante } from '../assinaturas/entities/assinatura-digital.entity';
import { MedicaoService } from '../contratos/medicao.service';
import { UploadService } from '../upload/upload.service';

const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/png'];
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

@Public()
@Controller('ext/v1')
@UseGuards(ApiKeyGuard)
export class ExtController {
  constructor(
    @InjectRepository(Contrato)
    private readonly contratoRepository: Repository<Contrato>,
    @InjectRepository(Medicao)
    private readonly medicaoRepository: Repository<Medicao>,
    @InjectRepository(ItemCronograma)
    private readonly itemCronogramaRepository: Repository<ItemCronograma>,
    @InjectRepository(EtapaCronograma)
    private readonly etapaRepository: Repository<EtapaCronograma>,
    @InjectRepository(AnexoMedicao)
    private readonly anexoRepository: Repository<AnexoMedicao>,
    @InjectRepository(AssinaturaDigital)
    private readonly assinaturaRepository: Repository<AssinaturaDigital>,
    private readonly medicaoService: MedicaoService,
    private readonly uploadService: UploadService,
  ) {}

  // ============================================================
  // GET /ext/v1/contratos
  // Lista contratos do fornecedor autenticado
  // ============================================================
  @Get('contratos')
  async listarContratos(@Req() req: any) {
    const fornecedorId: string = req.fornecedor.id;

    const contratos = await this.contratoRepository.find({
      where: { fornecedor_id: fornecedorId },
      order: { created_at: 'DESC' },
      select: [
        'id', 'numero_contrato', 'objeto', 'tipo', 'modalidade_execucao',
        'valor_global', 'valor_inicial', 'valor_executado_anterior',
        'data_vigencia_inicio', 'data_vigencia_fim', 'status',
        'numero_processo', 'created_at',
      ],
    });

    return contratos.map(c => ({
      id: c.id,
      numero_contrato: c.numero_contrato,
      objeto: c.objeto,
      tipo: c.tipo,
      modalidade_execucao: c.modalidade_execucao,
      valor_global: Number(c.valor_global) || Number(c.valor_inicial) || 0,
      data_vigencia_inicio: c.data_vigencia_inicio,
      data_vigencia_fim: c.data_vigencia_fim,
      status: c.status,
      numero_processo: c.numero_processo,
    }));
  }

  // ============================================================
  // GET /ext/v1/contratos/:id
  // Detalhes do contrato + itens + últimas medições
  // ============================================================
  @Get('contratos/:id')
  async getContrato(@Param('id') id: string, @Req() req: any) {
    const fornecedorId: string = req.fornecedor.id;

    const contrato = await this.contratoRepository.findOne({ where: { id } });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    if (contrato.fornecedor_id !== fornecedorId) throw new ForbiddenException('Acesso negado');

    const [ultimasMedicoes, etapas, itensCronograma] = await Promise.all([
      this.medicaoRepository.find({
        where: { contrato_id: id },
        order: { numero_medicao: 'DESC' },
        take: 10,
        select: ['id', 'numero_medicao', 'periodo_inicio', 'periodo_fim', 'valor_medido', 'status', 'data_submissao', 'nota_fiscal_numero'],
      }),
      this.etapaRepository.find({
        where: { contrato_id: id },
        order: { numero_etapa: 'ASC' },
      }),
      this.itemCronogramaRepository.find({
        where: { contrato_id: id },
        order: { numero_item: 'ASC' } as any,
      }),
    ]);

    const valorGlobal = Number(contrato.valor_global) || Number(contrato.valor_inicial) || 0;
    const valorExecutadoAnterior = Number(contrato.valor_executado_anterior) || 0;
    const valorAprovado = ultimasMedicoes
      .filter(m => String(m.status) === 'APROVADA')
      .reduce((acc, m) => acc + Number(m.valor_medido), 0);
    const valorEmAnalise = ultimasMedicoes
      .filter(m => !['APROVADA', 'REJEITADA', 'RASCUNHO'].includes(String(m.status)))
      .reduce((acc, m) => acc + Number(m.valor_medido), 0);
    const saldoDisponivel = valorGlobal - valorExecutadoAnterior - valorAprovado - valorEmAnalise;

    return {
      id: contrato.id,
      numero_contrato: contrato.numero_contrato,
      objeto: contrato.objeto,
      tipo: contrato.tipo,
      modalidade_execucao: contrato.modalidade_execucao,
      valor_global: valorGlobal,
      valor_executado_anterior: valorExecutadoAnterior,
      saldo_disponivel: saldoDisponivel,
      data_vigencia_inicio: contrato.data_vigencia_inicio,
      data_vigencia_fim: contrato.data_vigencia_fim,
      status: contrato.status,
      numero_processo: contrato.numero_processo,
      etapas: etapas.map(e => ({
        id: e.id,
        numero_etapa: e.numero_etapa,
        descricao: e.descricao,
        valor_previsto: Number(e.valor_previsto),
        percentual_executado: Number(e.percentual_executado),
      })),
      itens_cronograma: itensCronograma.map(i => ({
        id: i.id,
        numero_item: i.numero_item,
        descricao: i.descricao,
        unidade_medida: i.unidade_medida,
        quantidade: Number(i.quantidade),
        quantidade_medida: Number(i.quantidade_medida),
        saldo_quantidade: Number(i.quantidade) - Number(i.quantidade_medida),
        valor_unitario: Number(i.valor_unitario),
        valor_total: Number(i.valor_total),
      })),
      ultimas_medicoes: ultimasMedicoes,
    };
  }

  // ============================================================
  // POST /ext/v1/contratos/:id/medicoes
  // Cria medição (rascunho). Se enviar_imediatamente=true, submete direto.
  // ============================================================
  @Post('contratos/:id/medicoes')
  async criarMedicao(
    @Param('id') contratoId: string,
    @Body() body: {
      periodo_inicio: string;
      periodo_fim: string;
      nota_fiscal_numero?: string;
      nota_fiscal_valor?: number;
      nota_fiscal_data?: string;
      observacoes?: string;
      valor_medido?: number;
      itens?: Array<{ item_cronograma_id: string; quantidade_medida: number }>;
      enviar_imediatamente?: boolean;
    },
    @Req() req: any,
  ) {
    const fornecedor = req.fornecedor;

    const contrato = await this.contratoRepository.findOne({ where: { id: contratoId } });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    if (contrato.fornecedor_id !== fornecedor.id) throw new ForbiddenException('Acesso negado');

    if (!body.periodo_inicio || !body.periodo_fim) {
      throw new BadRequestException('periodo_inicio e periodo_fim são obrigatórios');
    }

    const medicao = await this.medicaoService.criarMedicao(
      contratoId,
      {
        periodo_inicio: body.periodo_inicio,
        periodo_fim: body.periodo_fim,
        nota_fiscal_numero: body.nota_fiscal_numero,
        nota_fiscal_valor: body.nota_fiscal_valor,
        nota_fiscal_data: body.nota_fiscal_data,
        observacoes: body.observacoes,
        valor_medido: body.valor_medido,
        fornecedor_id: fornecedor.id,
        fornecedor_nome: fornecedor.razao_social,
        itens: body.itens as any,
      },
      { skipOSCheck: true },
    );

    if (body.enviar_imediatamente) {
      return await this.submeterMedicaoInterna(medicao.id, fornecedor, contrato, req);
    }

    return {
      id: medicao.id,
      numero_medicao: medicao.numero_medicao,
      status: medicao.status,
      valor_medido: Number(medicao.valor_medido),
      periodo_inicio: medicao.periodo_inicio,
      periodo_fim: medicao.periodo_fim,
    };
  }

  // ============================================================
  // POST /ext/v1/medicoes/:id/enviar
  // Registra assinatura digital (sem OTP) + submete medição
  // ============================================================
  @Post('medicoes/:id/enviar')
  async enviarMedicao(@Param('id') medicaoId: string, @Req() req: any) {
    const fornecedor = req.fornecedor;

    const medicao = await this.medicaoRepository.findOne({ where: { id: medicaoId } });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    const contrato = await this.contratoRepository.findOne({ where: { id: medicao.contrato_id } });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    if (contrato.fornecedor_id !== fornecedor.id) throw new ForbiddenException('Acesso negado');

    return await this.submeterMedicaoInterna(medicaoId, fornecedor, contrato, req);
  }

  // ============================================================
  // POST /ext/v1/medicoes/:id/documentos
  // Upload de anexo para a medição
  // ============================================================
  @Post('medicoes/:id/documentos')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
          const pasta = path.join(uploadDir, `medicoes/${req.params.id}`);
          fs.mkdirSync(pasta, { recursive: true });
          cb(null, pasta);
        },
        filename: (req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase();
          const uniqueSuffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
          cb(null, `${uniqueSuffix}${ext}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
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
    }),
  )
  async uploadDocumento(
    @Param('id') medicaoId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('tipo') tipo: string,
    @Body('descricao') descricao: string,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');

    const fornecedor = req.fornecedor;

    const medicao = await this.medicaoRepository.findOne({ where: { id: medicaoId } });
    if (!medicao) {
      if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      throw new NotFoundException('Medição não encontrada');
    }

    const contrato = await this.contratoRepository.findOne({ where: { id: medicao.contrato_id } });
    if (!contrato || contrato.fornecedor_id !== fornecedor.id) {
      if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      throw new ForbiddenException('Acesso negado');
    }

    if (!['RASCUNHO', 'DEVOLVIDA', 'PARCIALMENTE_ATESTADA'].includes(medicao.status)) {
      if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      throw new BadRequestException('Só é possível enviar anexos em medições com status Rascunho, Devolvida ou Parcialmente Atestada.');
    }

    const tipoAnexo = tipo === 'NOTA_FISCAL' || tipo === 'DOCUMENTO' ? TipoAnexoMedicao.DOCUMENTO : TipoAnexoMedicao.FOTO;
    const pastaUpload = `medicoes/${medicaoId}`;
    const fileUrl = this.uploadService.getFileUrl(pastaUpload, file.filename);

    const anexo = this.anexoRepository.create({
      medicao_id: medicaoId,
      tipo: tipoAnexo,
      nome_original: file.originalname,
      nome_arquivo: file.filename,
      mime_type: file.mimetype,
      tamanho_bytes: file.size,
      url: fileUrl,
      descricao: descricao || undefined,
      enviado_por_id: fornecedor.id,
      enviado_por_nome: fornecedor.razao_social,
      origem: 'fornecedor',
    });

    const saved = await this.anexoRepository.save(anexo);
    return { id: saved.id, url: saved.url, nome_original: saved.nome_original, tipo: saved.tipo };
  }

  // ============================================================
  // GET /ext/v1/medicoes/:id
  // Status da medição
  // ============================================================
  @Get('medicoes/:id')
  async getMedicao(@Param('id') medicaoId: string, @Req() req: any) {
    const fornecedorId: string = req.fornecedor.id;

    const medicao = await this.medicaoRepository.findOne({ where: { id: medicaoId } });
    if (!medicao) throw new NotFoundException('Medição não encontrada');

    const contrato = await this.contratoRepository.findOne({ where: { id: medicao.contrato_id } });
    if (!contrato || contrato.fornecedor_id !== fornecedorId) throw new ForbiddenException('Acesso negado');

    return {
      id: medicao.id,
      numero_medicao: medicao.numero_medicao,
      contrato_id: medicao.contrato_id,
      periodo_inicio: medicao.periodo_inicio,
      periodo_fim: medicao.periodo_fim,
      valor_medido: Number(medicao.valor_medido),
      nota_fiscal_numero: medicao.nota_fiscal_numero,
      nota_fiscal_valor: medicao.nota_fiscal_valor ? Number(medicao.nota_fiscal_valor) : null,
      status: medicao.status,
      data_submissao: medicao.data_submissao,
      data_aprovacao: medicao.data_aprovacao,
      motivo_devolucao: medicao.motivo_devolucao,
      observacoes: medicao.observacoes,
    };
  }

  // ============================================================
  // Método interno: assina programaticamente e submete
  // ============================================================
  private async submeterMedicaoInterna(
    medicaoId: string,
    fornecedor: { id: string; razao_social: string; cpf_cnpj: string; telefone?: string },
    contrato: Contrato,
    req: any,
  ) {
    // Gerar código de validação único (16 chars)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let codigoValidacao = '';
    for (let i = 0; i < 16; i++) {
      codigoValidacao += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Registrar assinatura digital programática (sem OTP)
    const apiKeyPrefix = (req.headers['x-api-key'] as string)?.slice(0, 8) || 'API';
    const assinatura = this.assinaturaRepository.create({
      orgao_id: contrato.orgao_id,
      entidade_tipo: EntidadeTipo.MEDICAO,
      entidade_id: medicaoId,
      usuario_id: null as any,
      usuario_nome: fornecedor.razao_social,
      usuario_cpf_cnpj: fornecedor.cpf_cnpj,
      usuario_cargo: `Assinatura via API Key - ${apiKeyPrefix}***`,
      usuario_telefone: fornecedor.telefone || null,
      papel_assinante: PapelAssinante.FORNECEDOR,
      codigo_validacao: codigoValidacao,
      ip_address: req.ip || null,
      user_agent: 'portaldcp-api/1.0',
    });
    await this.assinaturaRepository.save(assinatura);

    // Submeter medição
    const medicaoAtualizada = await this.medicaoService.submeterMedicao(
      medicaoId,
      fornecedor.id,
    );

    return {
      id: medicaoAtualizada.id,
      numero_medicao: medicaoAtualizada.numero_medicao,
      status: medicaoAtualizada.status,
      valor_medido: Number(medicaoAtualizada.valor_medido),
      data_submissao: medicaoAtualizada.data_submissao,
      codigo_validacao: codigoValidacao,
      mensagem: 'Medição submetida com sucesso. Aguardando ateste do fiscal.',
    };
  }
}
