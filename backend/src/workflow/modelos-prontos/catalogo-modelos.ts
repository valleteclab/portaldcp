/**
 * MODELOS PRONTOS DE FLUXO — desenhados a partir dos autos reais da Câmara
 * Municipal de Luís Eduardo Magalhães (digitalização de agosto/2026), na
 * ordem das folhas. O órgão escolhe um modelo e recebe um RASCUNHO para
 * ajustar e ativar: os responsáveis são sugeridos pelo nome dos setores do
 * órgão; o que não encontrar fica em branco (e a ativação pede).
 */
import type { AplicacaoFluxo } from '../aplicacao/aplicacao-fluxo';

export interface EtapaModelo {
  tipo: string;
  nome: string;
  /** Trechos do nome do setor responsável (o primeiro setor do órgão que contiver um deles). */
  setor: string[];
  prazo: number;
  /** Quem abriu o processo faz esta etapa (ex.: prestação de contas da diária). */
  solicitante?: boolean;
}

export interface ModeloPronto {
  chave: string;
  nome: string;
  descricao: string;
  /** De onde veio o desenho (autos conferidos). */
  origem: string;
  tipo_processo: 'CONTRATACAO' | 'ADITIVO' | 'RENOVACAO' | 'AVULSO';
  aplicacao: AplicacaoFluxo | null;
  etapas: EtapaModelo[];
}

const ADMINISTRACAO = ['administra', 'diretoria'];
const PRESIDENCIA = ['presid', 'gabinete', 'mesa'];
const LICITACOES = ['licita', 'contrata'];
const CONTABILIDADE = ['contab', 'financ', 'orçament', 'orcament'];
const JURIDICO = ['jurid', 'jurídic', 'procurad'];
const COMPRAS = ['compra'];

export const MODELOS_PRONTOS: readonly ModeloPronto[] = [
  {
    chave: 'instrucao-contratacao-camara',
    nome: 'Instrução da contratação',
    descricao: 'Parte comum a todas as modalidades: do DFD ao TR, terminando na Definição da modalidade, que leva ao fluxo da modalidade.',
    origem: 'Autos de agosto/2026 da Câmara: inexigibilidades 032 e 033 e Pregão 004/2026 (as peças anteriores ao Despacho da Mesa).',
    tipo_processo: 'CONTRATACAO',
    aplicacao: null,
    etapas: [
      { tipo: 'DFD', nome: 'DFD — pede autorização', setor: ADMINISTRACAO, prazo: 2 },
      { tipo: 'ETP', nome: 'Estudo técnico preliminar', setor: ADMINISTRACAO, prazo: 3 },
      { tipo: 'PESQUISA_PRECO', nome: 'Pesquisa de preços', setor: COMPRAS, prazo: 5 },
      { tipo: 'RESERVA_ORCAMENTARIA', nome: 'Dotação orçamentária', setor: CONTABILIDADE, prazo: 2 },
      { tipo: 'TR', nome: 'Termo de referência', setor: ADMINISTRACAO, prazo: 5 },
      { tipo: 'DEFINICAO_MODALIDADE', nome: 'Definição da modalidade', setor: LICITACOES, prazo: 2 },
    ],
  },
  // Fluxos de MODALIDADE (11/2026, "um motor só"): seguem a ordem que a trava da lei
  // exige — o Despacho da Mesa do início é APROVAÇÃO (autoriza o prosseguimento); a
  // AUTORIZAÇÃO do art. 72, VIII vem depois do relatório do agente (razão da escolha
  // e preço, incs. VI e VII) e do parecer. O fluxo termina na publicação: propostas,
  // disputa, adjudicação, homologação e contrato são atos da licitação, na tela dela.
  {
    chave: 'dispensa-camara',
    nome: 'Dispensa eletrônica',
    descricao: 'Contratação direta pelo art. 75 (dispensa eletrônica): do Despacho da Mesa à divulgação do aviso. Vem depois da instrução; a disputa e o resultado seguem na tela da licitação.',
    origem: 'Portaria 089/2024 da Câmara (arts. 40 a 48) e a ordem das peças da Dispensa 029/2025 (PA 139/2025), ajustada às travas do art. 72.',
    tipo_processo: 'CONTRATACAO',
    aplicacao: { modalidades: ['DISPENSA_ELETRONICA'], fundamentos: [], padrao: false },
    etapas: [
      { tipo: 'APROVACAO', nome: 'Despacho da Mesa — autoriza o prosseguimento', setor: PRESIDENCIA, prazo: 2 },
      { tipo: 'MINUTAS', nome: 'Relatório do agente, minuta do aviso e do contrato', setor: LICITACOES, prazo: 3 },
      { tipo: 'PARECER_JURIDICO', nome: 'Parecer jurídico', setor: JURIDICO, prazo: 5 },
      { tipo: 'AUTORIZACAO', nome: 'Autorização da contratação direta (art. 72, VIII)', setor: PRESIDENCIA, prazo: 2 },
      { tipo: 'PUBLICACAO', nome: 'Divulgação do aviso de dispensa (PNCP e site)', setor: LICITACOES, prazo: 2 },
    ],
  },
  {
    chave: 'inexigibilidade-camara',
    nome: 'Inexigibilidade',
    descricao: 'Contratação direta pelo art. 74 (ex.: capacitação): do Despacho da Mesa à publicação. Vem depois da instrução; adjudicação e ratificação seguem na tela da licitação.',
    origem: 'Autos das inexigibilidades 032 e 033/2026 da Câmara, na ordem das folhas, ajustada às travas do art. 72.',
    tipo_processo: 'CONTRATACAO',
    aplicacao: { modalidades: ['INEXIGIBILIDADE'], fundamentos: [], padrao: false },
    etapas: [
      { tipo: 'APROVACAO', nome: 'Despacho da Mesa — autoriza o prosseguimento', setor: PRESIDENCIA, prazo: 2 },
      { tipo: 'DOCUMENTO', nome: 'Documentos e proposta do fornecedor', setor: ADMINISTRACAO, prazo: 3 },
      { tipo: 'DOCUMENTO', nome: 'Portaria do agente de contratação', setor: LICITACOES, prazo: 1 },
      { tipo: 'MINUTAS', nome: 'Relatório do agente (razão da escolha e preço)', setor: LICITACOES, prazo: 2 },
      { tipo: 'PARECER_JURIDICO', nome: 'Parecer jurídico', setor: JURIDICO, prazo: 5 },
      { tipo: 'AUTORIZACAO', nome: 'Autorização da contratação direta (art. 72, VIII)', setor: PRESIDENCIA, prazo: 2 },
      { tipo: 'PUBLICACAO', nome: 'Aviso de inexigibilidade e publicação', setor: LICITACOES, prazo: 2 },
    ],
  },
  {
    chave: 'pregao-eletronico-camara',
    nome: 'Pregão eletrônico',
    descricao: 'Do Despacho da Mesa à publicação do edital. Vem depois da instrução; sessão pública, recursos, adjudicação, homologação e contrato seguem na tela da licitação.',
    origem: 'Autos do Pregão Eletrônico 004/2026 da Câmara (folhas 1 a 1060), na ordem das folhas, até a publicação do edital.',
    tipo_processo: 'CONTRATACAO',
    aplicacao: { modalidades: ['PREGAO_ELETRONICO'], fundamentos: [], padrao: false },
    etapas: [
      { tipo: 'APROVACAO', nome: 'Despacho da Mesa — autoriza a abertura', setor: PRESIDENCIA, prazo: 2 },
      { tipo: 'DOCUMENTO', nome: 'Portarias do agente e dos fiscais', setor: LICITACOES, prazo: 1 },
      { tipo: 'MINUTAS', nome: 'Relatório do agente e minuta do edital', setor: LICITACOES, prazo: 5 },
      { tipo: 'PARECER_JURIDICO', nome: 'Parecer jurídico — fase interna', setor: JURIDICO, prazo: 5 },
      { tipo: 'AUTORIZACAO', nome: 'Autorização da publicação do edital', setor: PRESIDENCIA, prazo: 2 },
      { tipo: 'PUBLICACAO', nome: 'Publicação do edital (PNCP, Diário e jornal)', setor: LICITACOES, prazo: 2 },
    ],
  },
  {
    chave: 'contratacao-padrao',
    nome: 'Contratação — demais modalidades',
    descricao: 'Fluxo padrão para a modalidade que não tem fluxo próprio: despacho, relatório do agente e minutas, parecer, autorização e publicação.',
    origem: 'Mesma ordem dos fluxos de modalidade da Câmara (Lei 14.133, arts. 53 e 72).',
    tipo_processo: 'CONTRATACAO',
    aplicacao: { modalidades: [], fundamentos: [], padrao: true },
    etapas: [
      { tipo: 'APROVACAO', nome: 'Despacho da Mesa — autoriza o prosseguimento', setor: PRESIDENCIA, prazo: 2 },
      { tipo: 'MINUTAS', nome: 'Relatório do agente e minutas', setor: LICITACOES, prazo: 5 },
      { tipo: 'PARECER_JURIDICO', nome: 'Parecer jurídico', setor: JURIDICO, prazo: 5 },
      { tipo: 'AUTORIZACAO', nome: 'Autorização da autoridade competente', setor: PRESIDENCIA, prazo: 2 },
      { tipo: 'PUBLICACAO', nome: 'Publicação (PNCP e mural)', setor: LICITACOES, prazo: 2 },
    ],
  },
  {
    chave: 'termo-aditivo-camara',
    nome: 'Termo aditivo (prorrogação ou acréscimo)',
    descricao: 'Da solicitação à publicação do extrato e da homologação do termo aditivo.',
    origem: 'Autos do Processo Administrativo 085/2026 da Câmara (4º aditivo do contrato 051/2023), na ordem das folhas.',
    tipo_processo: 'ADITIVO',
    aplicacao: null,
    etapas: [
      { tipo: 'DOCUMENTO', nome: 'Solicitação do aditivo', setor: ADMINISTRACAO, prazo: 2 },
      { tipo: 'DOCUMENTO', nome: 'Manifestação do fiscal do contrato', setor: ['fiscal'], prazo: 3 },
      { tipo: 'DOCUMENTO', nome: 'Pesquisa de vantajosidade', setor: COMPRAS, prazo: 5 },
      { tipo: 'DOCUMENTO', nome: 'Informação de dotação', setor: CONTABILIDADE, prazo: 3 },
      { tipo: 'DOCUMENTO', nome: 'Aceite e regularidade da contratada', setor: ADMINISTRACAO, prazo: 3 },
      { tipo: 'APROVACAO', nome: 'Despacho da Mesa — autoriza o aditivo', setor: PRESIDENCIA, prazo: 2 },
      { tipo: 'DOCUMENTO', nome: 'Justificativa do agente e minuta', setor: LICITACOES, prazo: 2 },
      { tipo: 'PARECER_JURIDICO', nome: 'Parecer jurídico', setor: JURIDICO, prazo: 5 },
      { tipo: 'DOCUMENTO', nome: 'Termo aditivo assinado', setor: LICITACOES, prazo: 3 },
      { tipo: 'APROVACAO', nome: 'Homologação', setor: PRESIDENCIA, prazo: 1 },
      { tipo: 'PUBLICACAO', nome: 'Extrato e publicação', setor: LICITACOES, prazo: 2 },
    ],
  },
  {
    chave: 'pagamento-contrato-camara',
    nome: 'Pagamento de contrato (serviço ou compra)',
    descricao: 'Da nota fiscal ao comprovante: atesto do fiscal, gestor, certidões, liquidação e ordem de pagamento.',
    origem: 'Processos de pagamento orçamentário de agosto/2026 da Câmara (ex.: PP-1204, 1220, 1292). Na ordem de execução: nos autos, as peças contábeis vêm antes nas folhas.',
    tipo_processo: 'AVULSO',
    aplicacao: null,
    etapas: [
      { tipo: 'DOCUMENTO', nome: 'Nota fiscal recebida', setor: ['financ', 'contab'], prazo: 1 },
      { tipo: 'DOCUMENTO', nome: 'Atesto do fiscal (medição ou relatório)', setor: ['fiscal'], prazo: 3 },
      { tipo: 'APROVACAO', nome: 'Gestor do contrato — encaminha para pagamento', setor: ['gestor', 'gestao de contrato', 'contratos'], prazo: 2 },
      { tipo: 'DOCUMENTO', nome: 'Certidões de regularidade', setor: COMPRAS, prazo: 1 },
      { tipo: 'DOCUMENTO', nome: 'Liquidação (recebimento e retenções)', setor: CONTABILIDADE, prazo: 2 },
      { tipo: 'APROVACAO', nome: 'Ordem de pagamento (Presidente e Secretário)', setor: PRESIDENCIA, prazo: 2 },
      { tipo: 'DOCUMENTO', nome: 'Comprovante de pagamento', setor: ['financ', 'tesour'], prazo: 1 },
    ],
  },
  {
    chave: 'diarias-camara',
    nome: 'Diárias (concessão e prestação de contas)',
    descricao: 'Pedido e concessão pela Mesa, reserva, ordem de pagamento, comprovante e prestação de contas da viagem.',
    origem: 'Processos de concessão de diárias de agosto/2026 da Câmara (ex.: PP-1233, 1349).',
    tipo_processo: 'AVULSO',
    aplicacao: null,
    etapas: [
      { tipo: 'APROVACAO', nome: 'Solicitação e concessão da diária', setor: PRESIDENCIA, prazo: 2 },
      { tipo: 'DOCUMENTO', nome: 'Reserva da despesa', setor: CONTABILIDADE, prazo: 1 },
      { tipo: 'APROVACAO', nome: 'Ordem de pagamento (Presidente e Secretário)', setor: PRESIDENCIA, prazo: 1 },
      { tipo: 'DOCUMENTO', nome: 'Comprovante de pagamento', setor: ['financ', 'tesour'], prazo: 1 },
      { tipo: 'DOCUMENTO', nome: 'Prestação de contas da viagem (relatório, notas e certificado)', setor: [], prazo: 5, solicitante: true },
    ],
  },
];

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Primeiro setor do órgão cujo nome contém um dos trechos (sem acento e sem caixa). */
export function setorSugerido(setores: Array<{ id: string; nome: string }>, trechos: string[]): string | null {
  const alvos = trechos.map(semAcento);
  // Siglas curtas ("rh") só como palavra inteira, para não casar no meio de outra palavra
  const casa = (nome: string, t: string) => (t.length <= 3 ? new RegExp(`(^|[^a-z])${t}([^a-z]|$)`).test(nome) : nome.includes(t));
  for (const t of alvos) {
    const achado = setores.find((s) => casa(semAcento(s.nome), t));
    if (achado) return achado.id;
  }
  return null;
}

/** Modelos que formam o fluxo padrão da contratação (ativados sozinhos no órgão que não tem nenhum). */
export const CHAVES_FLUXO_PADRAO_CONTRATACAO = ['instrucao-contratacao-camara', 'dispensa-camara', 'inexigibilidade-camara', 'pregao-eletronico-camara', 'contratacao-padrao'] as const;

export function modeloPronto(chave: string): ModeloPronto | null {
  return MODELOS_PRONTOS.find((m) => m.chave === chave) ?? null;
}
