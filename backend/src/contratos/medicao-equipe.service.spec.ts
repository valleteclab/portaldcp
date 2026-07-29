import ExcelJS = require('exceljs');
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { MedicaoEquipeService } from './medicao-equipe.service';

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

describe('MedicaoEquipeService', () => {
  const service = new MedicaoEquipeService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  const perfis = {
    superior: {
      valor: 12681.29,
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
    operacional: {
      valor: 7725.96,
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
    assistente: {
      valor: 13565.2,
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
  };

  const item = (id: string, numero: number, descricao: string, valor: number) =>
    ({
      id,
      contrato_id: 'contrato',
      lote_numero: 1,
      numero_item: numero,
      descricao,
      quantidade: 4,
      valor_unitario: valor,
    }) as any;

  const itens = {
    produtor: item('produtor', 1, 'PRODUTOR DE CONTEÚDO', perfis.superior.valor),
    editorTexto: item('editor-texto', 2, 'EDITOR DE TEXTO', perfis.superior.valor),
    reporter: item('reporter', 3, 'REPÓRTER APRESENTADOR', perfis.superior.valor),
    locutor: item('locutor', 4, 'LOCUTOR DE RÁDIO E TV', perfis.operacional.valor),
    editorImagem: item('editor-imagem', 5, 'EDITOR DE IMAGEM', perfis.operacional.valor),
    cinegrafista: item('cinegrafista', 6, 'CINEGRAFISTA E OPERADOR DE CÂMERA', perfis.operacional.valor),
    tecnico: item('tecnico', 7, 'TÉCNICO EM RADIODIFUSÃO', perfis.operacional.valor),
    assistente: item('assistente', 8, 'ASSISTENTE DE APOIO', perfis.assistente.valor),
  };

  const linha = (
    nome: string,
    itemCronograma: any,
    perfil: (typeof perfis)[keyof typeof perfis],
    dias = 30,
  ) => {
    const fator = dias / 30;
    const proporcional = (valor: number) => round2(valor * fator);
    return (service as any).normalizarLinha(
      {
        item_cronograma_id: itemCronograma.id,
        nome,
        cargo_funcao: itemCronograma.descricao,
        dias_trabalhados: dias,
        carga_horaria_semanal: 30,
        salario_base: perfil.salario_base,
        salario_proporcional: proporcional(perfil.salario_base),
        acumulo_funcao: proporcional(perfil.acumulo_funcao),
        salario_total: round2(
          (perfil.salario_base + perfil.acumulo_funcao) * fator,
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
      },
      itemCronograma,
    );
  };

  const equipeJulho = () => [
    linha('AGNALDO', itens.tecnico, perfis.operacional),
    linha('ANNA', itens.produtor, perfis.superior),
    linha('ARON', itens.editorTexto, perfis.superior),
    linha('BRUNO', itens.tecnico, perfis.operacional),
    linha('CLAUDIMARA', itens.assistente, perfis.assistente),
    linha('DELMAR', itens.locutor, perfis.operacional),
    linha('DOUGLAS', itens.reporter, perfis.superior),
    linha('GABRIELA', itens.produtor, perfis.superior, 10),
    linha('IANN', itens.cinegrafista, perfis.operacional),
    linha('JOSE', itens.produtor, perfis.superior),
    linha('MARIA', itens.reporter, perfis.superior),
    linha('MATHEUS', itens.cinegrafista, perfis.operacional),
    linha('MAXWELL', itens.editorImagem, perfis.operacional, 10),
    linha('MIKAEL', itens.cinegrafista, perfis.operacional),
    linha('RAUANA', itens.editorImagem, perfis.operacional),
    linha('SAMUEL', itens.editorTexto, perfis.superior),
    linha('SEBASTIAO', itens.reporter, perfis.superior),
    linha('THIAGO', itens.produtor, perfis.superior),
    linha('VANESSA', itens.reporter, perfis.superior),
    linha('WALEX', itens.editorImagem, perfis.operacional),
  ].map((funcionario: any) => ({
    ...funcionario,
    item_cronograma: Object.values(itens).find(
      (i: any) => i.id === funcionario.item_cronograma_id,
    ),
  }));

  it('reproduz o total de julho do modelo oficial', () => {
    const funcionarios = equipeJulho();
    const resumo = (service as any).calcularResumo(funcionarios);
    expect(funcionarios).toHaveLength(20);
    expect(funcionarios.find((f: any) => f.nome === 'GABRIELA').valor_total).toBe(
      4227.1,
    );
    expect(funcionarios.find((f: any) => f.nome === 'MAXWELL').valor_total).toBe(
      2575.32,
    );
    expect(resumo.total_geral).toBe(196306.91);
    expect(resumo.remuneracao).toBe(59541.77);
    expect(resumo.encargos).toBe(28058.39);
    expect(resumo.tributos).toBe(12072.91);
  });

  it('gera XLSX com fórmulas e PDF válidos', async () => {
    const funcionarios = equipeJulho();
    const equipe: any = {
      id: 'equipe',
      medicao_id: 'medicao',
      empresa_nome: 'EFFECT PRODUTORA LTDA',
      empresa_cnpj: '10723280000110',
      fechamento_fatura: 'CÂMARA MUNICIPAL DE LUÍS EDUARDO MAGALHÃES-BA',
      competencia: 'JULHO DE 2026',
      periodo_inicio: '2026-07-01',
      periodo_fim: '2026-07-31',
      data_emissao: '2026-07-28',
      responsavel_legal: 'AUGUSTO LOPES DA ROCHA ISENSEE',
      percentual_iss: 2.5,
      percentual_ir: 4.8,
      retencao_inss: 1430.19,
      funcionarios,
      resumo: (service as any).calcularResumo(funcionarios),
    };
    jest.spyOn(service, 'buscarPorMedicao').mockResolvedValue(equipe);

    const xlsx = await service.gerarXlsx('medicao');
    expect(xlsx.length).toBeGreaterThan(10_000);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx as any);
    const planilha = workbook.getWorksheet('Medição Lote 1')!;
    expect(planilha.getCell('U12').formula).toContain("'Parâmetros'!J2");
    expect(planilha.getCell('R4').formula).toBe('SUM(U12:U200)');

    const pdf = await service.gerarPdf('medicao');
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(5_000);
    if (process.env.EXPORT_EQUIPE_QA === '1') {
      const destino = join(process.cwd(), '..', 'tmp', 'equipe-medicao-qa');
      mkdirSync(destino, { recursive: true });
      writeFileSync(join(destino, 'medicao-lote-1-julho.xlsx'), xlsx);
      writeFileSync(join(destino, 'medicao-lote-1-julho.pdf'), pdf);
    }
  });

  it('impede a submissão do Lote 1 sem relação de funcionários', async () => {
    const serviceValidacao = new MedicaoEquipeService(
      { findOne: jest.fn().mockResolvedValue(null) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        find: jest.fn().mockResolvedValue([
          {
            item_cronograma_id: 'produtor',
            quantidade_medida: 1,
            itemCronograma: itens.produtor,
          },
        ]),
      } as any,
    );

    await expect(
      serviceValidacao.validarObrigatoriaParaLote1('medicao'),
    ).rejects.toThrow(
      'Informe a relação mensal de funcionários do Lote 1 antes de submeter a medição',
    );
  });
});
