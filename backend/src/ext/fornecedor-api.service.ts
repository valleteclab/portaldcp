import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { Contrato } from '../contratos/entities/contrato.entity';
import { Medicao } from '../contratos/entities/medicao.entity';
import { ItemCronograma } from '../contratos/entities/item-cronograma.entity';
import { EtapaCronograma } from '../contratos/entities/etapa-cronograma.entity';
import { AnexoMedicao, TipoAnexoMedicao } from '../contratos/entities/anexo-medicao.entity';
import {
  AssinaturaDigital,
  EntidadeTipo,
  PapelAssinante,
} from '../assinaturas/entities/assinatura-digital.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { MedicaoService } from '../contratos/medicao.service';
import { MedicaoEquipeService } from '../contratos/medicao-equipe.service';
import { UploadService } from '../upload/upload.service';
import {
  OrdemFornecimento,
  StatusOrdemFornecimento,
} from '../almoxarifado/entities/ordem-fornecimento.entity';
import { OrdemFornecimentoService } from '../almoxarifado/ordem-fornecimento.service';
import { NotaFiscalFornecedorService } from '../almoxarifado/nota-fiscal-fornecedor.service';

export type ApiFornecedor = Pick<
  Fornecedor,
  'id' | 'razao_social' | 'cpf_cnpj' | 'telefone' | 'email'
>;

@Injectable()
export class FornecedorApiService {
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
    private readonly medicaoEquipeService: MedicaoEquipeService,
    private readonly uploadService: UploadService,
    private readonly ordemService: OrdemFornecimentoService,
    private readonly nfService: NotaFiscalFornecedorService,
  ) {}

  getMe(fornecedor: ApiFornecedor) {
    return {
      id: fornecedor.id,
      razao_social: fornecedor.razao_social,
      cpf_cnpj: fornecedor.cpf_cnpj,
      email: fornecedor.email || null,
      telefone: fornecedor.telefone || null,
    };
  }

  async listarContratos(fornecedorId: string) {
    const contratos = await this.contratoRepository.find({
      where: { fornecedor_id: fornecedorId },
      order: { created_at: 'DESC' },
      select: [
        'id',
        'numero_contrato',
        'objeto',
        'tipo',
        'modalidade_execucao',
        'valor_global',
        'valor_inicial',
        'valor_executado_anterior',
        'data_vigencia_inicio',
        'data_vigencia_fim',
        'status',
        'numero_processo',
        'created_at',
      ],
    });

    return contratos.map((c) => ({
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

  async getContrato(id: string, fornecedorId: string) {
    const contrato = await this.validarContratoFornecedor(id, fornecedorId);

    const [ultimasMedicoes, etapas, itensCronograma] = await Promise.all([
      this.medicaoRepository.find({
        where: { contrato_id: id },
        order: { numero_medicao: 'DESC' },
        take: 10,
        select: [
          'id',
          'numero_medicao',
          'periodo_inicio',
          'periodo_fim',
          'valor_medido',
          'status',
          'data_submissao',
          'nota_fiscal_numero',
        ],
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
      .filter((m) => String(m.status) === 'APROVADA')
      .reduce((acc, m) => acc + Number(m.valor_medido), 0);
    const valorEmAnalise = ultimasMedicoes
      .filter((m) => !['APROVADA', 'REJEITADA', 'RASCUNHO'].includes(String(m.status)))
      .reduce((acc, m) => acc + Number(m.valor_medido), 0);

    return {
      id: contrato.id,
      numero_contrato: contrato.numero_contrato,
      objeto: contrato.objeto,
      tipo: contrato.tipo,
      modalidade_execucao: contrato.modalidade_execucao,
      valor_global: valorGlobal,
      valor_executado_anterior: valorExecutadoAnterior,
      saldo_disponivel: valorGlobal - valorExecutadoAnterior - valorAprovado - valorEmAnalise,
      data_vigencia_inicio: contrato.data_vigencia_inicio,
      data_vigencia_fim: contrato.data_vigencia_fim,
      status: contrato.status,
      numero_processo: contrato.numero_processo,
      regras_medicao: {
        separar_por_lote: itensCronograma.some(
          (item) => item.lote_numero !== null,
        ),
        equipe_funcionarios: {
          exigida: Boolean(contrato.exige_relacao_funcionarios),
          lote_numero: contrato.lote_relacao_funcionarios,
          obrigatoria_quando_houver_execucao: true,
          posto_automatico: true,
          campos_minimos: [
            'item_cronograma_id',
            'nome',
            'dias_trabalhados',
          ],
        },
      },
      etapas: etapas.map((e) => ({
        id: e.id,
        numero_etapa: e.numero_etapa,
        descricao: e.descricao,
        valor_previsto: Number(e.valor_previsto),
        percentual_executado: Number(e.percentual_executado),
      })),
      itens_cronograma: itensCronograma.map((i) => ({
        id: i.id,
        numero_item: i.numero_item,
        descricao: i.descricao,
        unidade_medida: i.unidade_medida,
        quantidade: Number(i.quantidade),
        quantidade_medida: Number(i.quantidade_medida),
        saldo_quantidade: Number(i.quantidade) - Number(i.quantidade_medida),
        valor_unitario: Number(i.valor_unitario),
        valor_total: Number(i.valor_total),
        lote_numero: i.lote_numero,
        lote_descricao: i.lote_descricao,
      })),
      ultimas_medicoes: ultimasMedicoes,
    };
  }

  async criarMedicao(contratoId: string, fornecedor: ApiFornecedor, body: any) {
    const contrato = await this.validarContratoFornecedor(contratoId, fornecedor.id);
    if (!body.periodo_inicio || !body.periodo_fim) {
      throw new BadRequestException('periodo_inicio e periodo_fim sao obrigatorios');
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

    // Salvar discriminações da despesa, se fornecidas
    if (Array.isArray(body.discriminacoes) && body.discriminacoes.length > 0) {
      await this.medicaoService.salvarDiscriminacoes(
        medicao.id,
        fornecedor.id,
        body.discriminacoes.map((d: any) => ({
          descricao: String(d.descricao || '').trim(),
          valor: Number(d.valor || 0),
          percentual: Number(d.percentual || 0),
        })),
      );
    }

    if (body.equipe?.funcionarios?.length) {
      await this.salvarEquipeMedicao(
        medicao.id,
        fornecedor,
        body.equipe,
        contrato,
      );
    }

    if (body.enviar_imediatamente) {
      return this.submeterMedicao(medicao.id, fornecedor, contrato, undefined);
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

  async submeterMedicao(
    medicaoId: string,
    fornecedor: ApiFornecedor,
    contratoParam?: Contrato,
    apiKey?: string,
  ) {
    const medicao = await this.medicaoRepository.findOne({ where: { id: medicaoId } });
    if (!medicao) throw new NotFoundException('Medicao nao encontrada');

    const contrato =
      contratoParam || (await this.validarContratoFornecedor(medicao.contrato_id, fornecedor.id));

    if (contrato.fornecedor_id !== fornecedor.id) {
      throw new ForbiddenException('Acesso negado');
    }

    await this.medicaoEquipeService.validarObrigatoriaParaContrato(medicaoId);

    const codigoValidacao = this.gerarCodigoValidacao();
    const apiKeyPrefix = apiKey?.slice(0, 8) || 'API';
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
      ip_address: null,
      user_agent: 'portaldcp-api/1.0',
    } as any);
    await this.assinaturaRepository.save(assinatura);

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
      mensagem: 'Medicao submetida com sucesso. Aguardando ateste do fiscal.',
    };
  }

  async salvarEquipeMedicao(
    medicaoId: string,
    fornecedor: ApiFornecedor,
    equipe: any,
    contratoParam?: Contrato,
  ) {
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
    });
    if (!medicao) throw new NotFoundException('Medicao nao encontrada');
    const contrato =
      contratoParam ||
      (await this.validarContratoFornecedor(
        medicao.contrato_id,
        fornecedor.id,
      ));
    if (contrato.fornecedor_id !== fornecedor.id) {
      throw new ForbiddenException('Acesso negado');
    }
    return this.medicaoEquipeService.salvar(medicaoId, {
      ...equipe,
      empresa_nome: fornecedor.razao_social,
      empresa_cnpj: fornecedor.cpf_cnpj,
      competencia: medicao.competencia,
      periodo_inicio: medicao.periodo_inicio,
      periodo_fim: medicao.periodo_fim,
    });
  }

  async buscarUltimaEquipe(contratoId: string, fornecedor: ApiFornecedor) {
    await this.validarContratoFornecedor(contratoId, fornecedor.id);
    return this.medicaoEquipeService.buscarUltimaEquipe(contratoId);
  }

  async getMedicao(medicaoId: string, fornecedorId: string) {
    const medicao = await this.medicaoRepository.findOne({ where: { id: medicaoId } });
    if (!medicao) throw new NotFoundException('Medicao nao encontrada');

    await this.validarContratoFornecedor(medicao.contrato_id, fornecedorId);

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

  async salvarDocumentoMedicao(
    medicaoId: string,
    fornecedor: ApiFornecedor,
    file: Express.Multer.File,
    tipo: string,
    descricao?: string,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');

    const medicao = await this.medicaoRepository.findOne({ where: { id: medicaoId } });
    if (!medicao) throw new NotFoundException('Medicao nao encontrada');
    await this.validarContratoFornecedor(medicao.contrato_id, fornecedor.id);

    if (!['RASCUNHO', 'DEVOLVIDA', 'PARCIALMENTE_ATESTADA'].includes(medicao.status)) {
      throw new BadRequestException(
        'So e possivel enviar anexos em medicoes com status Rascunho, Devolvida ou Parcialmente Atestada.',
      );
    }

    const tipoAnexo =
      tipo === 'NOTA_FISCAL' || tipo === 'DOCUMENTO'
        ? TipoAnexoMedicao.DOCUMENTO
        : TipoAnexoMedicao.FOTO;
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

  async listarAnexosMedicao(medicaoId: string, fornecedorId: string) {
    const medicao = await this.medicaoRepository.findOne({ where: { id: medicaoId } });
    if (!medicao) throw new NotFoundException('Medicao nao encontrada');
    await this.validarContratoFornecedor(medicao.contrato_id, fornecedorId);

    return this.anexoRepository.find({
      where: { medicao_id: medicaoId },
      order: { created_at: 'DESC' },
    });
  }

  async listarOrdens(
    fornecedorId: string,
    status?: StatusOrdemFornecimento,
    contratoId?: string,
  ) {
    return this.ordemService.findByFornecedor(fornecedorId, status, contratoId);
  }

  async getOrdem(ordemId: string, fornecedorId: string) {
    const ordem = await this.validarOrdemFornecedor(ordemId, fornecedorId);
    return ordem;
  }

  async cienciaRecebimento(ordemId: string, fornecedorId: string, observacao?: string) {
    await this.validarOrdemFornecedor(ordemId, fornecedorId);
    return this.ordemService.fornecedorCienciaRecebimento(ordemId, fornecedorId, observacao);
  }

  async cienciaEntrega(
    ordemId: string,
    fornecedorId: string,
    dataEntrega: string,
    observacao?: string,
  ) {
    if (!dataEntrega) throw new BadRequestException('data_entrega e obrigatoria');
    const parsed = new Date(dataEntrega);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('data_entrega invalida');
    }
    await this.validarOrdemFornecedor(ordemId, fornecedorId);
    return this.ordemService.fornecedorCienciaEntrega(ordemId, fornecedorId, parsed, observacao);
  }

  async uploadNotaFiscalOrdem(
    ordemId: string,
    fornecedorId: string,
    arquivos: Express.Multer.File[],
  ) {
    const ordem = await this.validarOrdemFornecedor(ordemId, fornecedorId);
    const xmlFile = arquivos?.find(
      (f) => f.mimetype.includes('xml') || f.originalname.toLowerCase().endsWith('.xml'),
    );
    const pdfFile = arquivos?.find((f) => f.mimetype === 'application/pdf');
    const outrosArquivos = arquivos?.filter((f) => f !== xmlFile && f !== pdfFile) || [];

    if (!xmlFile) throw new BadRequestException('Arquivo XML e obrigatorio');
    if (!pdfFile) throw new BadRequestException('Arquivo PDF da nota fiscal e obrigatorio');

    return this.nfService.upload(
      ordemId,
      fornecedorId,
      ordem.orgao_id,
      xmlFile,
      pdfFile,
      outrosArquivos,
      true,
    );
  }

  async getNotaFiscalOrdem(ordemId: string, fornecedorId: string) {
    await this.validarOrdemFornecedor(ordemId, fornecedorId);
    return this.nfService.findByOrdem(ordemId);
  }

  async listarNotasFiscaisOrdem(ordemId: string, fornecedorId: string) {
    await this.validarOrdemFornecedor(ordemId, fornecedorId);
    return this.nfService.findAllByOrdem(ordemId);
  }

  async getBoletimPdf(medicaoId: string, fornecedorId: string) {
    const medicao = await this.medicaoRepository.findOne({ where: { id: medicaoId } });
    if (!medicao) throw new NotFoundException('Medicao nao encontrada');
    await this.validarContratoFornecedor(medicao.contrato_id, fornecedorId);

    await this.medicaoService.obterOuGerarPdfOficialMedicao(medicaoId);
    const filePath = this.medicaoService.getBoletimPdfFilePath(medicaoId);
    if (!filePath) throw new NotFoundException('Boletim PDF nao encontrado');

    return { filePath, numero_medicao: medicao.numero_medicao };
  }

  private async validarContratoFornecedor(contratoId: string, fornecedorId: string) {
    const contrato = await this.contratoRepository.findOne({ where: { id: contratoId } });
    if (!contrato) throw new NotFoundException('Contrato nao encontrado');
    if (contrato.fornecedor_id !== fornecedorId) throw new ForbiddenException('Acesso negado');
    return contrato;
  }

  private async validarOrdemFornecedor(ordemId: string, fornecedorId: string) {
    const ordem = await this.ordemService.findOne(ordemId);
    if (ordem.fornecedor_id !== fornecedorId) {
      throw new ForbiddenException('Esta ordem nao pertence ao fornecedor autenticado');
    }
    return ordem as OrdemFornecimento;
  }

  private gerarCodigoValidacao() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(16);
    let codigo = '';
    for (let i = 0; i < 16; i++) {
      codigo += chars[bytes[i] % chars.length];
    }
    return codigo;
  }
}
