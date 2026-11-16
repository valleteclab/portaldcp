import { TipoDocumentoFaseInterna } from '../fase-interna/entities/documento-fase-interna.entity';
import type { ModeloPadraoDef } from '../fase-interna/modelos-padrao';

/**
 * MODELOS PADRÃO das peças do processo eletrônico (aditivo/renovação),
 * semeados em `modelos_documento` como os da fase interna. Uma seção só
 * (o texto da peça); variáveis {{processo.*}}, {{contrato.*}}, {{orgao.nome}},
 * {{setor.nome}}, {{autor.*}}, {{data_atual}}; o que o órgão precisa decidir
 * fica como lacuna <mark>…</mark>. O órgão duplica/cria os seus na tela
 * "Modelos de documento" ou salva direto do editor da peça.
 */
const secao = (titulo: string, texto_padrao: string) => [{ id: 'texto', titulo, texto_padrao, obrigatorio: true }];

export const MODELOS_PADRAO_PROCESSO: ModeloPadraoDef[] = [
  {
    tipo: TipoDocumentoFaseInterna.OFICIO,
    nome: 'Ofício',
    fundamento_legal: '',
    intro: 'Comunicação oficial entre setores ou para fora do órgão. O número sai na sequência do setor ao assinar.',
    secoes: secao(
      'Texto do ofício',
      '<h3 style="text-align:center">OFÍCIO Nº [número do ofício]</h3>' +
        '<p>{{setor.nome}}</p>' +
        '<p>Ao(À) <mark>setor ou autoridade de destino</mark></p>' +
        '<p><strong>Assunto:</strong> {{processo.objeto}}</p>' +
        '<p>Senhor(a),</p>' +
        '<p><mark>texto do ofício: o que se comunica ou solicita, e por quê</mark>.</p>' +
        '<p>Atenciosamente,</p>',
    ),
  },
  {
    tipo: TipoDocumentoFaseInterna.PEDIDO_ADITIVO,
    nome: 'Pedido de termo aditivo',
    fundamento_legal: 'Arts. 124 e 125 · Lei 14.133/2021',
    intro: 'Pedido do gestor do contrato que abre o processo de aditivo.',
    secoes: secao(
      'Pedido de aditivo e justificativa',
      '<h3 style="text-align:center">PEDIDO DE TERMO ADITIVO</h3>' +
        '<p>Ao <mark>setor responsável pela reserva de recurso</mark>.</p>' +
        '<p>Solicitamos a formalização de termo aditivo ao contrato nº {{contrato.numero}}, firmado com {{contrato.fornecedor}}, cujo objeto é {{contrato.objeto}}, para <mark>o que se pede: acréscimo, supressão ou prorrogação, com valores e prazos</mark>.</p>' +
        '<p>Justificativa: <mark>por que o aditivo é necessário e por que não cabe nova contratação</mark>.</p>' +
        '<p>O pedido observa os limites do art. 125 da Lei nº 14.133/2021 e a vigência do contrato.</p>',
    ),
  },
  {
    tipo: TipoDocumentoFaseInterna.VANTAJOSIDADE_RENOVACAO,
    nome: 'Demonstração de vantajosidade da renovação',
    fundamento_legal: 'Art. 107 · Lei 14.133/2021',
    intro: 'Abre o processo de renovação: por que prorrogar é vantajoso.',
    secoes: secao(
      'Demonstração de vantajosidade',
      '<h3 style="text-align:center">DEMONSTRAÇÃO DE VANTAJOSIDADE DA RENOVAÇÃO</h3>' +
        '<p>Trata-se da prorrogação do contrato nº {{contrato.numero}}, firmado com {{contrato.fornecedor}} ({{contrato.objeto}}), por novo ciclo de <mark>prazo</mark>, com fundamento no art. 107 da Lei nº 14.133/2021.</p>' +
        '<p>Os preços praticados permanecem vantajosos para a Administração, conforme <mark>pesquisa de preços ou comparação com o mercado</mark>.</p>' +
        '<p>O serviço foi prestado a contento, sem registro de <mark>penalidades ou ocorrências relevantes</mark>, e permanece a necessidade da contratação.</p>',
    ),
  },
  {
    tipo: TipoDocumentoFaseInterna.RESERVA_DOTACAO_PROCESSO,
    nome: 'Reserva de dotação orçamentária',
    fundamento_legal: 'Art. 72, IV · Lei 14.133/2021',
    intro: 'Informação do setor de orçamento sobre a disponibilidade da despesa.',
    secoes: secao(
      'Reserva de dotação orçamentária',
      '<h3 style="text-align:center">RESERVA DE DOTAÇÃO ORÇAMENTÁRIA</h3>' +
        '<p>Ao Setor de Contratos.</p>' +
        '<p>Em atenção ao pedido constante dos autos do processo nº {{processo.numero}}, informamos que há disponibilidade orçamentária para a despesa relativa ao contrato nº {{contrato.numero}}, firmado com {{contrato.fornecedor}}, no valor de <mark>valor</mark>, conforme:</p>' +
        '<ul><li>Unidade orçamentária: <mark>unidade</mark></li><li>Funcional programática: <mark>funcional programática</mark></li><li>Elemento de despesa: <mark>elemento</mark></li></ul>' +
        '<p>Fica reservado o valor indicado para o exercício de <mark>ano</mark>.</p>',
    ),
  },
  {
    tipo: TipoDocumentoFaseInterna.PARECER_PROCESSO,
    nome: 'Parecer jurídico (aditivo/renovação)',
    fundamento_legal: 'Art. 53 · Lei 14.133/2021',
    intro: 'Parecer da assessoria jurídica sobre o aditivo ou a renovação.',
    secoes: secao(
      'Parecer jurídico',
      '<h3 style="text-align:center">PARECER JURÍDICO</h3>' +
        '<p><strong>Assunto:</strong> {{processo.tipo}} — contrato nº {{contrato.numero}}, firmado com {{contrato.fornecedor}}. Processo nº {{processo.numero}}.</p>' +
        '<p><strong>Relatório.</strong> <mark>Resumo do que consta nos autos: pedido, reserva de recurso e documentos</mark>.</p>' +
        '<p><strong>Fundamentação.</strong> <mark>Análise à luz da Lei nº 14.133/2021 (arts. 104 a 107, 124 e 125) e das cláusulas do contrato</mark>.</p>' +
        '<p><strong>Conclusão.</strong> Opina-se pela <mark>possibilidade ou impossibilidade</mark> da formalização, <mark>com as recomendações cabíveis</mark>.</p>',
    ),
  },
  {
    tipo: TipoDocumentoFaseInterna.AUTORIZACAO_PROCESSO,
    nome: 'Autorização da autoridade competente',
    fundamento_legal: 'Art. 72, VIII · Lei 14.133/2021',
    intro: 'Despacho da autoridade que autoriza a lavratura do termo.',
    secoes: secao(
      'Autorização',
      '<h3 style="text-align:center">AUTORIZAÇÃO</h3>' +
        '<p>À vista do que consta nos autos do processo nº {{processo.numero}}, em especial do parecer jurídico, <strong>autorizo</strong> a formalização do termo relativo ao contrato nº {{contrato.numero}}, firmado com {{contrato.fornecedor}}.</p>' +
        '<p>Encaminhe-se ao Setor de Contratos para a lavratura do termo.</p>',
    ),
  },
];
