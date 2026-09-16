import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import ExcelJS = require('exceljs');
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Repository } from 'typeorm';
import { Contrato } from './entities/contrato.entity';
import { ItemCronograma } from './entities/item-cronograma.entity';
import { ItemMedicaoItem } from './entities/item-medicao-item.entity';
import { MedicaoEquipeFuncionario } from './entities/medicao-equipe-funcionario.entity';
import { MedicaoEquipe } from './entities/medicao-equipe.entity';
import { Medicao, StatusMedicao } from './entities/medicao.entity';

export type LinhaEquipeInput = Partial<MedicaoEquipeFuncionario> & {
  item_cronograma_id: string;
  nome: string;
  cargo_funcao?: string;
};

export type EquipeInput = Partial<MedicaoEquipe> & {
  funcionarios: LinhaEquipeInput[];
};

const dinheiro = (valor: unknown) =>
  Math.round((Number(valor) || 0) * 100) / 100;

const dataIso = (valor: Date | string | null | undefined) => {
  if (!valor) return '';
  const data =
    valor instanceof Date ? valor : new Date(`${String(valor).slice(0, 10)}T00:00:00`);
  return Number.isNaN(data.getTime())
    ? ''
    : data.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
};

const formatarCnpj = (valor: string | null | undefined) => {
  const digitos = String(valor || '').replace(/\D/g, '');
  return digitos.length === 14
    ? digitos.replace(
        /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
        '$1.$2.$3/$4-$5',
      )
    : digitos;
};

const composicaoPadrao = (valorUnitario: number) => {
  const padroes = [
    {
      total: 12681.29,
      salario_base: 3904.33,
      acumulo_funcao: 0,
      encargos: 1858.8,
      indenizacao: 122.85,
      ausencias_legais: 622.69,
      aso_farda: 251.83,
      vale_transporte: 0,
      vale_alimentacao: 563.43,
      taxa_administracao_lucro: 4577.46,
      tributos: 779.9,
    },
    {
      total: 7725.96,
      salario_base: 1621,
      acumulo_funcao: 648.4,
      encargos: 1045.05,
      indenizacao: 71.4,
      ausencias_legais: 368.1,
      aso_farda: 144.66,
      vale_transporte: 0,
      vale_alimentacao: 563.43,
      taxa_administracao_lucro: 2788.77,
      tributos: 475.15,
    },
    {
      total: 13565.2,
      salario_base: 4189.69,
      acumulo_funcao: 0,
      encargos: 2000.84,
      indenizacao: 131.83,
      ausencias_legais: 667.12,
      aso_farda: 281.51,
      vale_transporte: 0,
      vale_alimentacao: 563.43,
      taxa_administracao_lucro: 4896.52,
      tributos: 834.26,
    },
  ];
  return (
    padroes.find(
      (padrao) => Math.abs(padrao.total - Number(valorUnitario)) < 0.02,
    ) || {
      total: Number(valorUnitario),
      salario_base: 0,
      acumulo_funcao: 0,
      encargos: 0,
      indenizacao: 0,
      ausencias_legais: 0,
      aso_farda: 0,
      vale_transporte: 0,
      vale_alimentacao: 0,
      taxa_administracao_lucro: Number(valorUnitario),
      tributos: 0,
    }
  );
};

@Injectable()
export class MedicaoEquipeService {
  constructor(
    @InjectRepository(MedicaoEquipe)
    private readonly equipeRepository: Repository<MedicaoEquipe>,
    @InjectRepository(MedicaoEquipeFuncionario)
    private readonly funcionarioRepository: Repository<MedicaoEquipeFuncionario>,
    @InjectRepository(Medicao)
    private readonly medicaoRepository: Repository<Medicao>,
    @InjectRepository(Contrato)
    private readonly contratoRepository: Repository<Contrato>,
    @InjectRepository(ItemCronograma)
    private readonly itemRepository: Repository<ItemCronograma>,
    @InjectRepository(ItemMedicaoItem)
    private readonly itemMedicaoRepository: Repository<ItemMedicaoItem>,
  ) {}

  async buscarPorMedicao(medicaoId: string) {
    const equipe = await this.equipeRepository.findOne({
      where: { medicao_id: medicaoId },
      relations: ['funcionarios', 'funcionarios.item_cronograma'],
    });
    if (!equipe) return null;
    equipe.funcionarios = [...(equipe.funcionarios || [])].sort(
      (a, b) =>
        Number(a.item_cronograma?.numero_item || 0) -
          Number(b.item_cronograma?.numero_item || 0) ||
        Number(a.posto_numero || 0) - Number(b.posto_numero || 0) ||
        a.nome.localeCompare(b.nome, 'pt-BR'),
    );
    return this.comResumo(equipe);
  }

  async buscarUltimaEquipe(contratoId: string, excluirMedicaoId?: string) {
    const query = this.equipeRepository
      .createQueryBuilder('equipe')
      .innerJoinAndSelect('equipe.medicao', 'medicao')
      .leftJoinAndSelect('equipe.funcionarios', 'funcionarios')
      .leftJoinAndSelect('funcionarios.item_cronograma', 'item')
      .where('medicao.contrato_id = :contratoId', { contratoId })
      .orderBy('medicao.periodo_fim', 'DESC')
      .addOrderBy('medicao.numero_medicao', 'DESC');
    if (excluirMedicaoId) {
      query.andWhere('medicao.id <> :excluirMedicaoId', {
        excluirMedicaoId,
      });
    }
    const equipe = await query.getOne();
    return equipe ? this.comResumo(equipe) : null;
  }

  async salvar(medicaoId: string, dados: EquipeInput) {
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
      relations: ['contrato', 'contrato.orgao'],
    });
    if (!medicao) throw new NotFoundException('Medição não encontrada');
    if (
      ![StatusMedicao.RASCUNHO, StatusMedicao.DEVOLVIDA].includes(
        medicao.status,
      )
    ) {
      throw new BadRequestException(
        'A equipe só pode ser alterada enquanto a medição estiver em rascunho ou devolvida',
      );
    }
    if (!Array.isArray(dados.funcionarios) || dados.funcionarios.length === 0) {
      throw new BadRequestException(
        'Informe pelo menos um funcionário',
      );
    }

    const itemIds = [
      ...new Set(dados.funcionarios.map((linha) => linha.item_cronograma_id)),
    ];
    const itens = await this.itemRepository
      .createQueryBuilder('item')
      .where('item.id IN (:...itemIds)', { itemIds })
      .andWhere('item.contrato_id = :contratoId', {
        contratoId: medicao.contrato_id,
      })
      .getMany();
    if (itens.length !== itemIds.length) {
      throw new BadRequestException(
        'Há funcionário vinculado a item que não pertence ao contrato',
      );
    }
    const itemPorId = new Map(itens.map((item) => [item.id, item]));
    const contrato = medicao.contrato;
    if (!contrato.exige_relacao_funcionarios) {
      throw new BadRequestException(
        'Este contrato não está configurado para exigir relação de funcionários',
      );
    }
    const loteConfigurado = contrato.lote_relacao_funcionarios;
    if (
      loteConfigurado !== null &&
      itens.some(
        (item) => Number(item.lote_numero) !== Number(loteConfigurado),
      )
    ) {
      throw new BadRequestException(
        `A relação de funcionários deve conter somente itens do Lote ${loteConfigurado}`,
      );
    }

    const entradasComPosto = this.atribuirPostosAutomaticamente(
      dados.funcionarios,
      itemPorId,
    );
    const linhas = entradasComPosto.map((entrada) => {
      const item = itemPorId.get(entrada.item_cronograma_id)!;
      return this.normalizarLinha(
        this.completarComposicaoFinanceira(entrada, item),
        item,
      );
    });
    this.validarCapacidade(linhas, itemPorId);
    await this.validarConciliacaoLinhas(
      medicaoId,
      linhas,
      loteConfigurado,
    );

    let equipe = await this.equipeRepository.findOne({
      where: { medicao_id: medicaoId },
    });
    const orgaoNome =
      (contrato as any)?.orgao?.razao_social ||
      (contrato as any)?.orgao?.nome_fantasia ||
      'ÓRGÃO CONTRATANTE';
    if (!equipe) {
      equipe = this.equipeRepository.create({ medicao_id: medicaoId });
    }
    equipe.empresa_nome =
      String(dados.empresa_nome || contrato.fornecedor_razao_social || '').trim();
    equipe.empresa_cnpj =
      String(dados.empresa_cnpj || contrato.fornecedor_cnpj || '').replace(
        /\D/g,
        '',
      ) || null;
    equipe.fechamento_fatura = String(
      dados.fechamento_fatura || orgaoNome,
    ).trim();
    equipe.competencia = String(
      dados.competencia || medicao.competencia || '',
    ).trim();
    equipe.periodo_inicio = (dados.periodo_inicio ||
      medicao.periodo_inicio) as Date;
    equipe.periodo_fim = (dados.periodo_fim || medicao.periodo_fim) as Date;
    equipe.data_emissao = (dados.data_emissao || new Date()) as Date;
    equipe.responsavel_legal = dados.responsavel_legal?.trim() || null;
    equipe.percentual_iss = Number(dados.percentual_iss ?? 2.5);
    equipe.percentual_ir = Number(dados.percentual_ir ?? 4.8);
    equipe.retencao_inss = dinheiro(dados.retencao_inss);
    equipe = await this.equipeRepository.save(equipe);

    await this.funcionarioRepository.delete({ equipe_id: equipe.id });
    await this.funcionarioRepository.save(
      linhas.map((linha) =>
        this.funcionarioRepository.create({
          ...linha,
          equipe_id: equipe!.id,
        }),
      ),
    );

    await this.validarConciliacaoMedicao(medicaoId);
    return this.buscarPorMedicao(medicaoId);
  }

  async validarObrigatoriaParaContrato(medicaoId: string) {
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
      relations: ['contrato'],
    });
    if (!medicao) throw new NotFoundException('Medição não encontrada');
    const contrato = medicao.contrato;
    if (!contrato?.exige_relacao_funcionarios) return;

    const itensMedicao = await this.itemMedicaoRepository.find({
      where: { medicao_id: medicaoId },
      relations: ['itemCronograma'],
    });
    const loteConfigurado = contrato.lote_relacao_funcionarios;
    const possuiItemSujeito = itensMedicao.some(
      (item) =>
        (loteConfigurado === null ||
          Number(item.itemCronograma?.lote_numero) ===
            Number(loteConfigurado)) &&
        Number(item.quantidade_medida) > 0,
    );
    if (!possuiItemSujeito) return;

    const equipe = await this.equipeRepository.findOne({
      where: { medicao_id: medicaoId },
      relations: ['funcionarios'],
    });
    if (!equipe || !equipe.funcionarios?.length) {
      const complemento =
        loteConfigurado === null ? '' : ` do Lote ${loteConfigurado}`;
      throw new BadRequestException(
        `Informe a relação mensal de funcionários${complemento} antes de submeter a medição`,
      );
    }
    await this.validarConciliacaoMedicao(medicaoId);
  }

  async validarConciliacaoMedicao(medicaoId: string) {
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
      relations: ['contrato'],
    });
    if (!medicao) throw new NotFoundException('Medição não encontrada');
    const loteConfigurado = medicao.contrato?.lote_relacao_funcionarios;
    const equipe = await this.equipeRepository.findOne({
      where: { medicao_id: medicaoId },
      relations: ['funcionarios'],
    });
    if (!equipe) return;
    const itensMedicao = await this.itemMedicaoRepository.find({
      where: { medicao_id: medicaoId },
      relations: ['itemCronograma'],
    });
    const medicaoPorItem = new Map(
      itensMedicao.map((item) => [item.item_cronograma_id, item]),
    );
    const resumoEquipe = this.agruparPorItem(equipe.funcionarios || []);
    for (const [itemId, resumo] of resumoEquipe) {
      const itemMedicao = medicaoPorItem.get(itemId);
      if (!itemMedicao) {
        throw new BadRequestException(
          'A equipe contém cargo que não foi incluído nos itens da medição',
        );
      }
      if (
        Math.abs(Number(itemMedicao.quantidade_medida) - resumo.quantidade) >
        0.0002
      ) {
        throw new BadRequestException(
          `A quantidade do item não confere com os dias informados para a equipe (${resumo.quantidade.toFixed(4)})`,
        );
      }
      if (
        Math.abs(Number(itemMedicao.valor_medido) - resumo.valor) > 0.05
      ) {
        throw new BadRequestException(
          `O valor medido do item não confere com a composição da equipe (R$ ${resumo.valor.toFixed(2)})`,
        );
      }
    }
    for (const itemMedicao of itensMedicao) {
      if (
        (loteConfigurado === null ||
          Number(itemMedicao.itemCronograma?.lote_numero) ===
            Number(loteConfigurado)) &&
        Number(itemMedicao.quantidade_medida) > 0 &&
        !resumoEquipe.has(itemMedicao.item_cronograma_id)
      ) {
        throw new BadRequestException(
          `O item ${itemMedicao.itemCronograma.numero_item} foi medido, mas não possui funcionários vinculados`,
        );
      }
    }
  }

  private async validarConciliacaoLinhas(
    medicaoId: string,
    linhas: Partial<MedicaoEquipeFuncionario>[],
    loteConfigurado: number | null,
  ) {
    const itensMedicao = await this.itemMedicaoRepository.find({
      where: { medicao_id: medicaoId },
      relations: ['itemCronograma'],
    });
    const medicaoPorItem = new Map(
      itensMedicao.map((item) => [item.item_cronograma_id, item]),
    );
    const resumoEquipe = this.agruparPorItem(
      linhas as MedicaoEquipeFuncionario[],
    );
    for (const [itemId, resumo] of resumoEquipe) {
      const itemMedicao = medicaoPorItem.get(itemId);
      if (!itemMedicao) {
        throw new BadRequestException(
          'A equipe contém cargo que não foi incluído nos itens da medição',
        );
      }
      if (
        Math.abs(Number(itemMedicao.quantidade_medida) - resumo.quantidade) >
        0.0002
      ) {
        throw new BadRequestException(
          `A quantidade do item não confere com os dias informados para a equipe (${resumo.quantidade.toFixed(4)})`,
        );
      }
      if (Math.abs(Number(itemMedicao.valor_medido) - resumo.valor) > 0.05) {
        throw new BadRequestException(
          `O valor medido do item não confere com a composição da equipe (R$ ${resumo.valor.toFixed(2)})`,
        );
      }
    }
    for (const itemMedicao of itensMedicao) {
      if (
        (loteConfigurado === null ||
          Number(itemMedicao.itemCronograma?.lote_numero) ===
            Number(loteConfigurado)) &&
        Number(itemMedicao.quantidade_medida) > 0 &&
        !resumoEquipe.has(itemMedicao.item_cronograma_id)
      ) {
        throw new BadRequestException(
          `O item ${itemMedicao.itemCronograma.numero_item} foi medido, mas não possui funcionários vinculados`,
        );
      }
    }
  }

  async gerarXlsx(medicaoId: string): Promise<Buffer> {
    const equipe = await this.buscarEquipeObrigatoria(medicaoId);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Portal DCP';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Relação funcionários', {
      pageSetup: {
        orientation: 'landscape',
        paperSize: 8 as any,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1,
        margins: {
          left: 0.2,
          right: 0.2,
          top: 0.25,
          bottom: 0.25,
          header: 0.1,
          footer: 0.1,
        },
      },
      views: [{ showGridLines: false }],
    });
    const parametros = workbook.addWorksheet('Parâmetros', {
      state: 'veryHidden',
    });

    this.montarPlanilha(sheet, parametros, equipe);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async gerarPdf(medicaoId: string): Promise<Buffer> {
    const equipe = await this.buscarEquipeObrigatoria(medicaoId);
    const resumo = equipe.resumo;
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [420, 236],
      compress: true,
    });
    const amarelo = [255, 192, 0] as [number, number, number];
    const moedaBr = (valor: number) =>
      Number(valor || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    const card = (
      x: number,
      y: number,
      largura: number,
      titulo: string,
      valor: number,
      altura = 17,
    ) => {
      doc.setDrawColor(0);
      doc.setFillColor(...amarelo);
      doc.rect(x, y, largura, altura, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.5);
      doc.text(titulo, x + largura / 2, y + 6, {
        align: 'center',
        maxWidth: largura - 2,
      });
      doc.setFillColor(255, 255, 255);
      doc.rect(x, y + altura, largura, 7, 'FD');
      doc.setFontSize(6);
      doc.text(`R$ ${moedaBr(valor)}`, x + largura - 1.5, y + altura + 4.8, {
        align: 'right',
      });
    };

    doc.setTextColor(255, 140, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.text('EFFECT', 13, 25);
    doc.setTextColor(0);
    doc.setFontSize(8);
    doc.text('PRODUTORA', 43, 30);

    card(80, 7, 27, 'TOTAL DA FOLHA\n+ ENCARGOS', resumo.total_folha_encargos);
    card(107, 7, 27, 'INSUMOS', resumo.insumos);
    card(134, 7, 30, 'LUCRO +\nADMINISTRAÇÃO', resumo.lucro_administracao);
    card(80, 34, 27, 'REMUNERAÇÃO', resumo.remuneracao);
    card(107, 34, 27, 'ENCARGOS CLT', resumo.encargos);
    card(134, 34, 27, 'TRIBUTOS', resumo.tributos);
    card(
      161,
      34,
      23,
      'RETENÇÃO ISS',
      dinheiro((resumo.total_geral * Number(equipe.percentual_iss)) / 100),
    );
    card(
      184,
      34,
      23,
      'RETENÇÃO IR',
      dinheiro((resumo.total_geral * Number(equipe.percentual_ir)) / 100),
    );
    card(207, 34, 25, 'RETENÇÃO INSS', Number(equipe.retencao_inss));
    card(350, 7, 62, 'TOTAL GERAL NF', resumo.total_geral, 22);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.text(`EMPRESA: ${equipe.empresa_nome}`, 8, 58);
    doc.text(`FECHAMENTO FATURA: ${equipe.fechamento_fatura}`, 8, 62);
    doc.text(`COMPETÊNCIA: ${equipe.competencia}`, 8, 66);
    doc.text(
      `PERÍODO: ${dataIso(equipe.periodo_inicio)} A ${dataIso(equipe.periodo_fim)}`,
      8,
      70,
    );

    const cabecalho = [
      'N°',
      'NOME',
      'CARGO/FUNÇÃO',
      'INÍCIO',
      'LOTAÇÃO',
      'SITUAÇÃO',
      'C.H.',
      'SALÁRIO BASE',
      'DIAS',
      'SAL. PROPORC.',
      'ACÚMULO 40%',
      'SALÁRIO TOTAL',
      'ENCARGOS',
      'INDENIZAÇÃO',
      'AUSÊNCIAS',
      'ASO + FARDA',
      'VT',
      'VA',
      'TAXA ADM + LUCRO',
      'TRIBUTOS',
      'TOTAL',
    ];
    const corpo = (equipe.funcionarios || []).map((funcionario, indice) => [
      indice + 1,
      funcionario.nome,
      funcionario.cargo_funcao,
      dataIso(funcionario.inicio_prestacao_servicos),
      funcionario.lotacao,
      funcionario.situacao,
      Number(funcionario.carga_horaria_semanal).toFixed(0),
      moedaBr(Number(funcionario.salario_base)),
      Number(funcionario.dias_trabalhados).toLocaleString('pt-BR'),
      moedaBr(Number(funcionario.salario_proporcional)),
      moedaBr(Number(funcionario.acumulo_funcao)),
      moedaBr(Number(funcionario.salario_total)),
      moedaBr(Number(funcionario.encargos)),
      moedaBr(Number(funcionario.indenizacao)),
      moedaBr(Number(funcionario.ausencias_legais)),
      moedaBr(Number(funcionario.aso_farda)),
      moedaBr(Number(funcionario.vale_transporte)),
      moedaBr(Number(funcionario.vale_alimentacao)),
      moedaBr(Number(funcionario.taxa_administracao_lucro)),
      moedaBr(Number(funcionario.tributos)),
      `R$ ${moedaBr(Number(funcionario.valor_total))}`,
    ]);
    corpo.push([
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      moedaBr(
        (equipe.funcionarios || []).reduce(
          (s, f) => s + Number(f.salario_base),
          0,
        ),
      ),
      '',
      moedaBr(
        (equipe.funcionarios || []).reduce(
          (s, f) => s + Number(f.salario_proporcional),
          0,
        ),
      ),
      moedaBr(
        (equipe.funcionarios || []).reduce(
          (s, f) => s + Number(f.acumulo_funcao),
          0,
        ),
      ),
      moedaBr(resumo.remuneracao),
      moedaBr(resumo.encargos),
      moedaBr(resumo.indenizacao),
      moedaBr(resumo.ausencias),
      moedaBr(resumo.aso_farda),
      moedaBr(resumo.vale_transporte),
      moedaBr(resumo.vale_alimentacao),
      moedaBr(resumo.lucro_administracao),
      moedaBr(resumo.tributos),
      moedaBr(resumo.total_geral),
    ]);
    autoTable(doc, {
      startY: 74,
      head: [cabecalho],
      body: corpo,
      margin: { left: 5, right: 5 },
      tableWidth: 400,
      styles: {
        font: 'helvetica',
        fontSize: 3.4,
        cellPadding: 0.45,
        lineColor: [0, 0, 0],
        lineWidth: 0.1,
        valign: 'middle',
      },
      headStyles: {
        fillColor: [217, 217, 217],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        halign: 'center',
        minCellHeight: 12,
      },
      columnStyles: {
        0: { cellWidth: 6.5, halign: 'center' },
        1: { cellWidth: 37.5 },
        2: { cellWidth: 46 },
        3: { cellWidth: 18.5, halign: 'center' },
        4: { cellWidth: 27 },
        5: { cellWidth: 14, halign: 'center' },
        6: { cellWidth: 10.5, halign: 'center' },
        7: { cellWidth: 19.5, halign: 'right' },
        8: { cellWidth: 9.5, halign: 'center' },
        9: { cellWidth: 20.5, halign: 'right' },
        10: { cellWidth: 17, halign: 'right' },
        11: { cellWidth: 19.5, halign: 'right' },
        12: { cellWidth: 17, halign: 'right' },
        13: { cellWidth: 17, halign: 'right' },
        14: { cellWidth: 17, halign: 'right' },
        15: { cellWidth: 17, halign: 'right' },
        16: { cellWidth: 10.5, halign: 'right' },
        17: { cellWidth: 14, halign: 'right' },
        18: { cellWidth: 22.5, halign: 'right' },
        19: { cellWidth: 16, halign: 'right' },
        20: { cellWidth: 23, halign: 'right' },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index === corpo.length - 1) {
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });
    const fimTabela = Number((doc as any).lastAutoTable?.finalY || 165);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.text(
      `LUÍS EDUARDO MAGALHÃES-BA, ${dataIso(equipe.data_emissao)}`.toUpperCase(),
      412,
      fimTabela + 10,
      { align: 'right' },
    );
    doc.text(equipe.empresa_nome, 210, fimTabela + 25, { align: 'center' });
    doc.text(`CNPJ.: ${formatarCnpj(equipe.empresa_cnpj)}`, 210, fimTabela + 29, {
      align: 'center',
    });
    doc.text(equipe.responsavel_legal || '', 210, fimTabela + 33, {
      align: 'center',
    });
    doc.text('Responsável Legal', 210, fimTabela + 37, { align: 'center' });
    return Buffer.from(doc.output('arraybuffer'));
  }

  private async buscarEquipeObrigatoria(medicaoId: string) {
    const equipe = await this.buscarPorMedicao(medicaoId);
    if (!equipe) {
      throw new NotFoundException(
        'Relação de funcionários não cadastrada para esta medição',
      );
    }
    return equipe as MedicaoEquipe & {
      resumo: ReturnType<MedicaoEquipeService['calcularResumo']>;
    };
  }

  private normalizarLinha(
    entrada: LinhaEquipeInput,
    item: ItemCronograma,
  ): Partial<MedicaoEquipeFuncionario> {
    const dias = Number(entrada.dias_trabalhados);
    if (!entrada.nome?.trim()) {
      throw new BadRequestException('Todo funcionário deve possuir nome');
    }
    if (!Number.isFinite(dias) || dias <= 0 || dias > 30) {
      throw new BadRequestException(
        `Dias trabalhados inválidos para ${entrada.nome}. Informe de 0,01 a 30`,
      );
    }
    const salarioBase = dinheiro(entrada.salario_base);
    const salarioProporcional = dinheiro(
      entrada.salario_proporcional ?? (salarioBase * dias) / 30,
    );
    const acumulo = dinheiro(entrada.acumulo_funcao);
    const salarioTotal = dinheiro(
      entrada.salario_total ?? salarioProporcional + acumulo,
    );
    const componentes = {
      encargos: dinheiro(entrada.encargos),
      indenizacao: dinheiro(entrada.indenizacao),
      ausencias_legais: dinheiro(entrada.ausencias_legais),
      aso_farda: dinheiro(entrada.aso_farda),
      vale_transporte: dinheiro(entrada.vale_transporte),
      vale_alimentacao: dinheiro(entrada.vale_alimentacao),
      taxa_administracao_lucro: dinheiro(
        entrada.taxa_administracao_lucro,
      ),
      tributos: dinheiro(entrada.tributos),
    };
    const totalCalculado = dinheiro(
      salarioTotal +
        Object.values(componentes).reduce((soma, valor) => soma + valor, 0),
    );
    const valorContrato = dinheiro((Number(item.valor_unitario) * dias) / 30);
    if (Math.abs(totalCalculado - valorContrato) > 0.05) {
      throw new BadRequestException(
        `A composição de ${entrada.nome} totaliza R$ ${totalCalculado.toFixed(2)}, mas o item contratual proporcional corresponde a R$ ${valorContrato.toFixed(2)}`,
      );
    }
    return {
      item_cronograma_id: item.id,
      posto_numero: entrada.posto_numero
        ? Number(entrada.posto_numero)
        : null,
      nome: entrada.nome.trim().toUpperCase(),
      cargo_funcao: String(entrada.cargo_funcao || item.descricao)
        .trim()
        .toUpperCase(),
      inicio_prestacao_servicos:
        (entrada.inicio_prestacao_servicos as Date) || null,
      lotacao: String(entrada.lotacao || 'RADIO E TV CAMARA')
        .trim()
        .toUpperCase(),
      situacao: String(entrada.situacao || 'ATIVO').trim().toUpperCase(),
      carga_horaria_semanal:
        Number(entrada.carga_horaria_semanal) || 30,
      dias_trabalhados: dias,
      salario_base: salarioBase,
      salario_proporcional: salarioProporcional,
      acumulo_funcao: acumulo,
      salario_total: salarioTotal,
      ...componentes,
      // O modelo oficial calcula o total com precisão interna e exibe os
      // componentes arredondados. Em períodos parciais isso pode produzir
      // diferença visual de R$ 0,01 entre a soma das colunas e o total.
      valor_total: valorContrato,
      observacoes: entrada.observacoes?.trim() || null,
    };
  }

  private completarComposicaoFinanceira(
    entrada: LinhaEquipeInput,
    item: ItemCronograma,
  ): LinhaEquipeInput {
    const camposFinanceiros: Array<keyof MedicaoEquipeFuncionario> = [
      'salario_base',
      'salario_proporcional',
      'acumulo_funcao',
      'salario_total',
      'encargos',
      'indenizacao',
      'ausencias_legais',
      'aso_farda',
      'vale_transporte',
      'vale_alimentacao',
      'taxa_administracao_lucro',
      'tributos',
    ];
    if (camposFinanceiros.some((campo) => entrada[campo] !== undefined)) {
      return entrada;
    }

    const dias = Number(entrada.dias_trabalhados);
    const fator = dias / 30;
    const perfil = composicaoPadrao(Number(item.valor_unitario));
    const proporcional = (valor: number) => dinheiro(valor * fator);
    return {
      ...entrada,
      salario_base: perfil.salario_base,
      salario_proporcional: proporcional(perfil.salario_base),
      acumulo_funcao: proporcional(perfil.acumulo_funcao),
      salario_total: proporcional(
        perfil.salario_base + perfil.acumulo_funcao,
      ),
      encargos: proporcional(perfil.encargos),
      indenizacao: proporcional(perfil.indenizacao),
      ausencias_legais: proporcional(perfil.ausencias_legais),
      aso_farda: proporcional(perfil.aso_farda),
      vale_transporte: proporcional(perfil.vale_transporte),
      vale_alimentacao: proporcional(perfil.vale_alimentacao),
      taxa_administracao_lucro: proporcional(
        perfil.taxa_administracao_lucro,
      ),
      tributos: proporcional(perfil.tributos),
    };
  }

  private atribuirPostosAutomaticamente(
    entradas: LinhaEquipeInput[],
    itemPorId: Map<string, ItemCronograma>,
  ): LinhaEquipeInput[] {
    const ocupacao = new Map<string, Map<number, number>>();
    const resultado = entradas.map((entrada) => ({ ...entrada }));

    for (const entrada of resultado) {
      const item = itemPorId.get(entrada.item_cronograma_id)!;
      const limitePostos = Math.max(1, Math.ceil(Number(item.quantidade)));
      const posto = Number(entrada.posto_numero || 0);
      if (!posto) continue;
      if (!Number.isInteger(posto) || posto < 1 || posto > limitePostos) {
        throw new BadRequestException(
          `Posto inválido para ${entrada.nome}. O item permite postos de 1 a ${limitePostos}`,
        );
      }
      const porPosto =
        ocupacao.get(item.id) || new Map<number, number>();
      const diasAcumulados =
        Number(porPosto.get(posto) || 0) +
        Number(entrada.dias_trabalhados || 0);
      if (diasAcumulados > 30.0001) {
        throw new BadRequestException(
          `O posto ${posto} do cargo "${item.descricao}" ultrapassa 30 dias no período`,
        );
      }
      porPosto.set(posto, diasAcumulados);
      ocupacao.set(item.id, porPosto);
    }

    for (const entrada of resultado) {
      if (Number(entrada.posto_numero || 0)) continue;
      const item = itemPorId.get(entrada.item_cronograma_id)!;
      const limitePostos = Math.max(1, Math.ceil(Number(item.quantidade)));
      const dias = Number(entrada.dias_trabalhados || 0);
      const porPosto =
        ocupacao.get(item.id) || new Map<number, number>();
      let postoEscolhido = 0;
      for (let posto = 1; posto <= limitePostos; posto++) {
        if (Number(porPosto.get(posto) || 0) + dias <= 30.0001) {
          postoEscolhido = posto;
          break;
        }
      }
      if (!postoEscolhido) {
        throw new BadRequestException(
          `Não há posto disponível para ${entrada.nome} no cargo "${item.descricao}". Confira os dias trabalhados`,
        );
      }
      entrada.posto_numero = postoEscolhido;
      porPosto.set(
        postoEscolhido,
        Number(porPosto.get(postoEscolhido) || 0) + dias,
      );
      ocupacao.set(item.id, porPosto);
    }
    return resultado;
  }

  private validarCapacidade(
    linhas: Partial<MedicaoEquipeFuncionario>[],
    itemPorId: Map<string, ItemCronograma>,
  ) {
    const agrupado = this.agruparPorItem(
      linhas as MedicaoEquipeFuncionario[],
    );
    for (const [itemId, resumo] of agrupado) {
      const item = itemPorId.get(itemId)!;
      if (resumo.quantidade > Number(item.quantidade) + 0.0002) {
        throw new BadRequestException(
          `A equipe do item "${item.descricao}" equivale a ${resumo.quantidade.toFixed(4)} postos e excede os ${Number(item.quantidade).toFixed(2)} postos contratados`,
        );
      }
    }
  }

  private agruparPorItem(linhas: MedicaoEquipeFuncionario[]) {
    const agrupado = new Map<
      string,
      { quantidade: number; valor: number; funcionarios: number }
    >();
    for (const linha of linhas) {
      const atual = agrupado.get(linha.item_cronograma_id) || {
        quantidade: 0,
        valor: 0,
        funcionarios: 0,
      };
      atual.quantidade += Number(linha.dias_trabalhados) / 30;
      atual.valor = dinheiro(atual.valor + Number(linha.valor_total));
      atual.funcionarios += 1;
      agrupado.set(linha.item_cronograma_id, atual);
    }
    for (const resumo of agrupado.values()) {
      resumo.quantidade =
        Math.round(resumo.quantidade * 1000000) / 1000000;
    }
    return agrupado;
  }

  private calcularResumo(funcionarios: MedicaoEquipeFuncionario[]) {
    const soma = (campo: keyof MedicaoEquipeFuncionario) =>
      dinheiro(
        funcionarios.reduce(
          (total, funcionario) => total + Number(funcionario[campo] || 0),
          0,
        ),
      );
    const remuneracao = soma('salario_total');
    const encargos = soma('encargos');
    const indenizacao = soma('indenizacao');
    const ausencias = soma('ausencias_legais');
    const asoFarda = soma('aso_farda');
    const vt = soma('vale_transporte');
    const va = soma('vale_alimentacao');
    const lucroAdministracao = soma('taxa_administracao_lucro');
    const tributos = soma('tributos');
    const totalGeral = soma('valor_total');
    return {
      remuneracao,
      encargos,
      indenizacao,
      ausencias,
      aso_farda: asoFarda,
      vale_transporte: vt,
      vale_alimentacao: va,
      lucro_administracao: lucroAdministracao,
      tributos,
      total_folha_encargos: dinheiro(
        remuneracao + encargos + indenizacao + ausencias,
      ),
      insumos: dinheiro(asoFarda + vt + va),
      total_geral: totalGeral,
    };
  }

  private comResumo(equipe: MedicaoEquipe) {
    return Object.assign(equipe, {
      resumo: this.calcularResumo(equipe.funcionarios || []),
      itens: Object.fromEntries(
        this.agruparPorItem(equipe.funcionarios || []),
      ),
    });
  }

  private montarPlanilha(
    sheet: ExcelJS.Worksheet,
    parametros: ExcelJS.Worksheet,
    equipe: MedicaoEquipe & {
      resumo: ReturnType<MedicaoEquipeService['calcularResumo']>;
    },
  ) {
    const amarelo = 'FFFFC000';
    const cinza = 'FFD9D9D9';
    const borda: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };
    const moeda = 'R$ #,##0.00';
    const funcionarios = equipe.funcionarios || [];

    sheet.columns = [
      { key: 'numero', width: 5 },
      { key: 'nome', width: 35 },
      { key: 'cargo', width: 38 },
      { key: 'inicio', width: 16 },
      { key: 'lotacao', width: 22 },
      { key: 'situacao', width: 12 },
      { key: 'ch', width: 11 },
      ...Array.from({ length: 14 }, () => ({ width: 14 })),
    ];
    sheet.mergeCells('A1:D5');
    sheet.getCell('A1').value = 'EFFECT\nPRODUTORA';
    sheet.getCell('A1').font = {
      name: 'Arial',
      bold: true,
      size: 28,
      color: { argb: 'FFFF8C00' },
    };
    sheet.getCell('A1').alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    };

    const cards = [
      ['F2:H3', 'TOTAL DA FOLHA\n+ ENCARGOS'],
      ['I2:K3', 'INSUMOS'],
      ['L2:N3', 'LUCRO + ADMINISTRAÇÃO\nDO SERVIÇOS'],
      ['F5:H6', 'REMUNERAÇÃO'],
      ['I5:K6', 'ENCARGOS CLT'],
      ['L5:N6', 'TRIBUTOS'],
      ['O5:P6', 'RETENÇÃO\nISS'],
      ['Q5:R6', 'RETENÇÃO IR'],
      ['S5:U6', 'RETENÇÃO\nINSS'],
      ['R1:U3', 'TOTAL GERAL NF'],
    ];
    for (const [range, label] of cards) {
      sheet.mergeCells(range);
      const cell = sheet.getCell(range.split(':')[0]);
      cell.value = label;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: amarelo } };
      cell.font = { bold: true, name: 'Arial', size: 10 };
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
      cell.border = borda;
    }
    const valoresCards = [
      ['F4:H4', '=SUM(L12:L200)+SUM(M12:M200)+SUM(N12:N200)+SUM(O12:O200)'],
      ['I4:K4', '=SUM(P12:R200)'],
      ['L4:N4', '=SUM(S12:S200)'],
      ['F7:H7', '=SUM(L12:L200)'],
      ['I7:K7', '=SUM(M12:M200)'],
      ['L7:N7', '=SUM(T12:T200)'],
      ['O7:P7', `=ROUND(U4*${Number(equipe.percentual_iss)}/100,2)`],
      ['Q7:R7', `=ROUND(U4*${Number(equipe.percentual_ir)}/100,2)`],
      ['S7:U7', Number(equipe.retencao_inss || 0)],
      ['R4:U4', '=SUM(U12:U200)'],
    ] as const;
    for (const [range, formulaOuValor] of valoresCards) {
      sheet.mergeCells(range);
      const cell = sheet.getCell(range.split(':')[0]);
      cell.value =
        typeof formulaOuValor === 'string'
          ? { formula: formulaOuValor.slice(1) }
          : formulaOuValor;
      cell.numFmt = moeda;
      cell.font = { bold: true, name: 'Arial', size: 10 };
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.border = borda;
    }

    sheet.mergeCells('A8:U8');
    sheet.getCell('A8').value =
      `EMPRESA: ${equipe.empresa_nome}\n` +
      `FECHAMENTO FATURA: ${equipe.fechamento_fatura}\n` +
      `COMPETÊNCIA: ${equipe.competencia}\n` +
      `PERÍODO: ${dataIso(equipe.periodo_inicio)} A ${dataIso(equipe.periodo_fim)}`;
    sheet.getCell('A8').font = { name: 'Arial', size: 9 };
    sheet.getCell('A8').alignment = {
      vertical: 'top',
      horizontal: 'left',
      wrapText: true,
    };
    sheet.getRow(8).height = 58;

    const headers = [
      'N°',
      'NOME',
      'CARGO/FUNÇÃO',
      'INÍCIO DA PRESTAÇÃO DOS SERVIÇOS',
      'LOTAÇÃO',
      'SITUAÇÃO',
      'C.H. SEMANAL',
      'Salário Base',
      'Dias Trabalhados',
      'Salário Proporcional aos dias trabalhados',
      'Acúmulo de função 40%',
      'Salário Total',
      'Encargos',
      'INDENIZAÇÃO',
      'AUSÊNCIAS LEGAIS',
      'ASO + FARDA',
      'VT',
      'VA',
      'TAXA ADM + LUCRO',
      'TRIBUTOS',
      'TOTAL',
    ];
    sheet.getRow(11).values = headers;
    sheet.getRow(11).height = 48;
    sheet.getRow(11).eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cinza } };
      cell.font = { bold: true, name: 'Arial', size: 8 };
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
      cell.border = borda;
    });

    parametros.getRow(1).values = [
      'Acumulo',
      'Encargos',
      'Indenizacao',
      'Ausencias',
      'ASO',
      'VT',
      'VA',
      'Taxa',
      'Tributos',
      'Total contratual',
    ];
    funcionarios.forEach((funcionario, indice) => {
      const row = 12 + indice;
      const fator = Number(funcionario.dias_trabalhados) / 30 || 1;
      const base = (valor: unknown) => dinheiro(Number(valor || 0) / fator);
      parametros.getRow(indice + 2).values = [
        base(funcionario.acumulo_funcao),
        base(funcionario.encargos),
        base(funcionario.indenizacao),
        base(funcionario.ausencias_legais),
        base(funcionario.aso_farda),
        base(funcionario.vale_transporte),
        base(funcionario.vale_alimentacao),
        base(funcionario.taxa_administracao_lucro),
        base(funcionario.tributos),
        Number(funcionario.item_cronograma?.valor_unitario || 0) ||
          base(funcionario.valor_total),
      ];
      sheet.getRow(row).values = [
        indice + 1,
        funcionario.nome,
        funcionario.cargo_funcao,
        funcionario.inicio_prestacao_servicos
          ? new Date(funcionario.inicio_prestacao_servicos)
          : null,
        funcionario.lotacao,
        funcionario.situacao,
        Number(funcionario.carga_horaria_semanal),
        Number(funcionario.salario_base),
        Number(funcionario.dias_trabalhados),
      ];
      sheet.getCell(`J${row}`).value = {
        formula: `ROUND(H${row}*I${row}/30,2)`,
      };
      for (let coluna = 11; coluna <= 20; coluna++) {
        const parametroColuna =
          coluna === 12 ? null : coluna === 11 ? 1 : coluna - 11;
        if (coluna === 12) {
          sheet.getCell(row, coluna).value = {
            formula: `ROUND(J${row}+K${row},2)`,
          };
        } else {
          sheet.getCell(row, coluna).value = {
            formula: `ROUND('Parâmetros'!${String.fromCharCode(
              64 + parametroColuna!,
            )}${indice + 2}*I${row}/30,2)`,
          };
        }
      }
      sheet.getCell(`U${row}`).value = {
        formula: `ROUND('Parâmetros'!J${indice + 2}*I${row}/30,2)`,
      };
      sheet.getRow(row).eachCell((cell, col) => {
        cell.font = { name: 'Arial', size: 8 };
        cell.alignment = {
          vertical: 'middle',
          horizontal: col >= 8 ? 'right' : col === 1 ? 'center' : 'left',
          wrapText: col <= 7,
        };
        cell.border = borda;
        if (col >= 8) cell.numFmt = '#,##0.00';
      });
      sheet.getCell(`D${row}`).numFmt = 'dd/mm/yyyy';
    });

    const totalRow = 12 + funcionarios.length;
    sheet.mergeCells(`A${totalRow}:I${totalRow}`);
    for (let coluna = 10; coluna <= 21; coluna++) {
      const letra = sheet.getCell(1, coluna).address.replace(/\d/g, '');
      sheet.getCell(totalRow, coluna).value = {
        formula: `SUM(${letra}12:${letra}${totalRow - 1})`,
      };
      sheet.getCell(totalRow, coluna).numFmt = '#,##0.00';
      sheet.getCell(totalRow, coluna).font = {
        bold: true,
        name: 'Arial',
        size: 8,
      };
    }
    sheet.getRow(totalRow).eachCell((cell) => {
      cell.border = borda;
    });

    const assinaturaRow = totalRow + 4;
    sheet.mergeCells(`O${assinaturaRow}:U${assinaturaRow}`);
    sheet.getCell(`O${assinaturaRow}`).value =
      `LUÍS EDUARDO MAGALHÃES-BA, ${dataIso(equipe.data_emissao)}`.toUpperCase();
    sheet.getCell(`O${assinaturaRow}`).font = {
      bold: true,
      name: 'Arial',
      size: 8,
    };
    sheet.getCell(`O${assinaturaRow}`).alignment = { horizontal: 'right' };
    sheet.mergeCells(`H${assinaturaRow + 3}:N${assinaturaRow + 6}`);
    sheet.getCell(`H${assinaturaRow + 3}`).value =
      `${equipe.empresa_nome}\nCNPJ.: ${equipe.empresa_cnpj || ''}\n${equipe.responsavel_legal || ''}\nResponsável Legal`;
    sheet.getCell(`H${assinaturaRow + 3}`).font = {
      bold: true,
      name: 'Arial',
      size: 9,
    };
    sheet.getCell(`H${assinaturaRow + 3}`).alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    };
    sheet.autoFilter = `A11:U${totalRow - 1}`;
    sheet.views = [{ state: 'frozen', ySplit: 11, showGridLines: false }];
    sheet.pageSetup.printArea = `A1:U${assinaturaRow + 7}`;
  }
}
