/**
 * FIXTURE DO CASO REAL — PA 139/2025, Dispensa Eletrônica 029/2025 da Câmara
 * Municipal de Luís Eduardo Magalhães (software da TV Câmara, R$ 61.753,44;
 * 184 folhas — plano §2.1 e mockup Conformidade). Os erros são os dos autos:
 *  - enquadramento I × II (relatório do agente — 1ª via — e minuta do aviso
 *    citam o inciso I; despacho, 2ª via do relatório e parecer, o II);
 *  - minuta do contrato vinculada ao "PA 115/2025 / Dispensa 025/2025";
 *  - ETP e TR pedem solução "similar ou superior ao ARION (SNEWS)";
 *  - estimativa igual à proposta da DMNEWS (menor preço, sem justificativa);
 *  - cotação da Legado vencendo antes da publicação (13/01/2026);
 *  - informação orçamentária datada (04/12/2025) antes da pesquisa (10/12);
 *    ETP (14/11) antes do DFD (10/12);
 *  - LOA citada como 1.141/2024 no despacho e 1.151/2024 no parecer;
 *  - reserva de 2025 com a publicação em 2026;
 *  - relatório do agente juntado duas vezes (fls. 14–16 e 38–40);
 *  - despacho da Mesa sem data;
 *  - 98,4% do limite do art. 75, II (R$ 62.725,59 — Dec. 12.343/2024).
 * `pa139Corrigido()` é o mesmo processo com tudo corrigido. As variantes
 * (`comVariante`) cobrem as regras cujo erro não estava nos autos (prazo,
 * marca sem "similar", cotação velha, sigilo, minuta desatualizada…).
 */
import { calendarioDoOrgao } from '../../../common/prazos/dias-uteis';
import type { ConsumoDoLimiteProcesso } from '../../../parametros-licitacao/consumo-limite.service';
import { percentualDoLimite } from '../../../parametros-licitacao/limites-dispensa';
import type { DocumentoLinha, EntradaContexto } from '../contexto';

const LIMITE_II_2025 = 62_725.59;
const VALOR = 61_753.44;

/** Consumo do limite no ramo do software (classe CATSER + unidade gestora). */
export function consumo(total: number, deste = VALOR): ConsumoDoLimiteProcesso {
  const ramo = { classe: 'SERVICO:0859', unidade_gestora: '' };
  return {
    aplicavel: true,
    fundamento: 'ART75_II',
    fundamento_referencia: 'art. 75, II',
    exercicio: 2025,
    inciso: 'II',
    limite: { valor: LIMITE_II_2025, ato_normativo: 'Dec. 12.343/2024', exercicio: 2025, provisorio: false },
    ramos: [
      {
        ramo,
        total,
        deste_processo: deste,
        outros_processos: Math.round((total - deste) * 100) / 100,
        quantidade_processos: total > deste ? 2 : 1,
        percentual: percentualDoLimite(total, LIMITE_II_2025),
        excede: total > LIMITE_II_2025,
      },
    ],
    maior: null,
  };
}

const anexada = (id: string, tipo: string, dia: string | null, folha: number, paginas: number, extra: Partial<DocumentoLinha> = {}): DocumentoLinha => ({
  id,
  tipo,
  titulo: tipo,
  versao: 1,
  status: 'IMPORTADO',
  origem: 'ARQUIVO',
  data_documento: dia ? `${dia}T12:00:00-03:00` : null,
  folha_inicial: folha,
  folha_final: folha + paginas - 1,
  hash_arquivo: `hash-${id}`,
  dados_estruturados: null,
  ...extra,
});

const linha = (tipo: string, status = 'OK', obrigatorio = false) => ({ tipo, titulo: tipo, status, obrigatorio, documento_id: `doc-${tipo}` });

/** Cotações diretas (propostas) — solicitação de 17/11/2025. */
function cotacao(fornecedor: string, cnpj: string, valor: number, validade: string, emissao = '2025-11-17') {
  return {
    fonte: 'FORNECEDOR_DIRETO' as const,
    descricao_fonte: fornecedor,
    data_pesquisa: emissao,
    fornecedor_razao_social: fornecedor,
    fornecedor_cnpj: cnpj,
    valor_unitario: valor,
    grupo_id: `g-${fornecedor.toLowerCase()}`,
    data_emissao: emissao,
    validade_ate: validade,
  };
}

export function pa139Real(): EntradaContexto {
  const textos: Record<string, string[]> = {
    'doc-DFD': ['Documento de Formalização de Demanda. Processo Administrativo nº 139/2025. Contratação de software de gestão de conteúdo da TV Câmara, valor estimado de R$ 61.753,44 conforme pesquisa.'],
    'doc-ETP': [
      '2.3 A solução deverá ser similar ou superior ao software ARION (SNEWS), com integração ao ambiente de broadcast.',
      'Levantamento de mercado.',
      'Estimativa.',
      'Parcelamento.',
      'Resultados.',
      '8.5 Requisito: similar ou superior ao ARION (SNEWS) em funcionalidades de redação.',
    ],
    'doc-TR': ['Termo de referência. O sistema deverá ser similar ou superior ao ARION (SNEWS).'],
    'doc-RAG': ['Relatório do agente de contratação. A contratação enquadra-se no art. 75, inciso I, da Lei 14.133/2021, cujo limite é de R$ 125.451,15.', 'Razão da escolha.', 'Conclusão.'],
    'doc-PP': ['Certidão de pesquisa de preços. Painéis sem resultado; três cotações diretas; adotado o menor preço (DMNEWS).'],
    'doc-DO': ['Informação orçamentária. Há dotação na Lei Orçamentária Anual nº 1.141/2024 (LOA 2025), exercício de 2025.'],
    'doc-AA': ['Despacho da Mesa Diretora. Autorizo a contratação com fundamento no art. 75, inciso II, até o teto de R$ 61.753,44, na dotação da Lei Orçamentária Anual nº 1.141/2024.'],
    'doc-RAG2': ['Relatório do agente de contratação. A contratação enquadra-se no art. 75, inciso II, da Lei 14.133/2021.', 'Razão da escolha.', 'Conclusão.'],
    'doc-ME': ['Minuta do aviso de contratação direta. Dispensa Eletrônica nº 029/2025, com fundamento no art. 75, I, da Lei 14.133/2021.'],
    'doc-MC': ['Minuta do contrato. 2.1.2 Integram este contrato o termo de referência e o PA 115/2025 / Dispensa 025/2025.'],
    'doc-PJ': [
      'Parecer jurídico nº 1. Processo Administrativo nº 139/2025.',
      'Enquadramento no art. 75, inciso II (limite de R$ 62.725,59).',
      'Dotação na Lei Orçamentária Anual nº 1.151/2024.',
    ],
  };
  const documentos: DocumentoLinha[] = [
    anexada('doc-DFD', 'DFD', '2025-12-10', 1, 1),
    anexada('doc-ETP', 'ETP', '2025-11-14', 5, 6),
    anexada('doc-TR', 'TR', '2025-12-10', 11, 1),
    anexada('doc-RAG', 'RAG', '2025-12-10', 14, 3),
    anexada('doc-PP', 'PP', '2025-12-10', 17, 1),
    anexada('doc-DO', 'DO', '2025-12-04', 27, 1),
    anexada('doc-AA', 'AA', null, 35, 1), // o despacho da Mesa sem data
    anexada('doc-RAG2', 'RAG', '2025-12-10', 38, 3), // relatório juntado de novo, com outro texto
    anexada('doc-ME', 'ME', '2025-12-10', 41, 1),
    anexada('doc-MC', 'MC', '2025-12-10', 63, 1),
    anexada('doc-PJ', 'PJ', '2025-12-17', 75, 3),
  ];
  return {
    agora: new Date('2025-12-18T12:00:00-03:00'),
    licitacao: {
      id: 'lic-139',
      orgao_id: 'camara-lem',
      numero_processo: '139/2025',
      numero_edital: '029/2025',
      objeto: 'Software de gestão de conteúdo da TV Câmara',
      modalidade: 'DISPENSA_ELETRONICA',
      tipo_contratacao: 'SERVICO',
      criterio_julgamento: 'MENOR_PRECO',
      fase: 'APROVACAO_INTERNA',
      situacao: 'ATIVA',
      fundamento_legal: 'ART75_II',
      sigilo_orcamento: 'SIGILOSO',
      justificativa_sigilo: 'Evitar a ancoragem dos preços na disputa (art. 24 da Lei 14.133/2021).',
      valor_total_estimado: VALOR,
      exercicio: 2025,
      data_publicacao_edital: '2026-01-13T09:00:00-03:00',
      data_inicio_acolhimento: '2026-01-14T00:00:00-03:00',
      data_fim_acolhimento: '2026-01-20T08:00:00-03:00',
    },
    valor_itens: VALOR,
    instrucao: {
      contratacao_direta: true,
      itens: [linha('DFD', 'OK', true), linha('PP', 'OK', true), linha('AA', 'OK', true), linha('ETP'), linha('TR'), linha('AR', 'NAO_SE_APLICA'), linha('PJ'), linha('DO'), linha('JC', 'NAO_SE_APLICA'), linha('DP'), linha('RAG'), linha('MC'), linha('ME')],
    },
    documentos,
    textos_pdf: textos,
    anexos_avulsos: [],
    pesquisa_dados: {
      metodo: 'MENOR',
      justificativa_metodo: '',
      publicacao_prevista: '2026-01-13',
      itens: [
        {
          item_numero: 1,
          descricao: 'Licença de uso do software de gestão da TV (12 meses)',
          quantidade: 12,
          unidade: 'MESES',
          metodologia: 'MENOR_VALOR',
          valor_referencial: 5146.12,
          cotacoes: [
            cotacao('DMNEWS', '11.222.333/0001-81', 5146.12, '2026-03-31'),
            cotacao('SNEWS', '22.333.444/0001-05', 5400, '2026-03-31'),
            cotacao('Legado', '33.444.555/0001-10', 5800, '2025-12-31'), // vence antes da publicação
          ],
        },
      ],
    },
    reserva: { status: 'EMITIDA', exercicio_base: 2025, documento_id: 'doc-DO', linhas: [{ exercicio: 2025, valor: 5146.12, situacao: 'RESERVADO' }, { exercicio: 2026, valor: 56607.32, situacao: 'PREVISAO' }], leis: { LOA: '1.141/2024' } },
    limite: consumo(VALOR),
    calendario: calendarioDoOrgao(null),
    ato_pretendido: null,
  };
}

/** O mesmo processo com os autos corrigidos: nenhuma regra dispara. */
export function pa139Corrigido(): EntradaContexto {
  const e = pa139Real();
  const t = e.textos_pdf!;
  t['doc-ETP'] = ['2.3 A solução deverá gerenciar a redação, a pauta e a exibição da TV, com integração ao ambiente de broadcast.', 'Levantamento.', 'Estimativa.', 'Parcelamento.', 'Resultados.', '8.5 Requisito: módulo de redação com fluxo de aprovação.'];
  t['doc-TR'] = ['Termo de referência. O sistema deverá gerenciar a redação, a pauta e a exibição da TV.'];
  t['doc-ME'] = ['Minuta do aviso de contratação direta. Dispensa Eletrônica nº 029/2025, com fundamento no art. 75, II, da Lei 14.133/2021.'];
  t['doc-MC'] = ['Minuta do contrato. 2.1.2 Integram este contrato o termo de referência e o Processo Administrativo nº 139/2025 / Dispensa nº 029/2025.'];
  t['doc-PJ'] = ['Parecer jurídico nº 1. Processo Administrativo nº 139/2025.', 'Enquadramento no art. 75, inciso II (limite de R$ 62.725,59).', 'Dotação na Lei Orçamentária Anual nº 1.141/2024.'];
  // relatório só uma vez (a 1ª via, com o inciso I, anulada por despacho)
  e.documentos = e.documentos.filter((d) => d.id !== 'doc-RAG');
  delete t['doc-RAG'];
  // datas em ordem: DFD antes do ETP; informação orçamentária depois da pesquisa; despacho datado
  e.documentos = e.documentos.map((d) =>
    d.id === 'doc-DFD'
      ? { ...d, data_documento: '2025-11-10T12:00:00-03:00' }
      : d.id === 'doc-DO'
        ? { ...d, data_documento: '2025-12-10T12:00:00-03:00' }
        : d.id === 'doc-AA'
          ? { ...d, data_documento: '2025-12-10T12:00:00-03:00' }
          : d,
  );
  e.pesquisa_dados.justificativa_metodo = 'Menor preço: as três propostas atendem igualmente ao TR (IN SEGES 65/2021, art. 6º).';
  e.pesquisa_dados.itens[0].cotacoes[2].validade_ate = '2026-02-28';
  // dotação renovada para 2026 (o exercício da publicação e do contrato)
  e.reserva = { ...e.reserva!, exercicio_base: 2026, linhas: [{ exercicio: 2026, valor: 61753.44, situacao: 'RESERVADO' }] };
  // limite: o valor final ficou abaixo de 80% do limite do ramo
  e.limite = consumo(45_000, 45_000);
  e.valor_itens = 45_000;
  e.pesquisa_dados.itens[0].cotacoes[0].valor_unitario = 3750;
  return e;
}
