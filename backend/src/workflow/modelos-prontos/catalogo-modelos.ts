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
    chave: 'inexigibilidade-camara',
    nome: 'Inexigibilidade',
    descricao: 'Contratação direta pelo art. 74 (ex.: capacitação), da demanda à publicação no Diário do Legislativo.',
    origem: 'Autos das inexigibilidades 032 e 033/2026 da Câmara, na ordem das folhas.',
    tipo_processo: 'CONTRATACAO',
    aplicacao: { modalidades: ['INEXIGIBILIDADE'], fundamentos: [], padrao: false },
    etapas: [
      { tipo: 'DFD', nome: 'DFD — pede autorização', setor: ADMINISTRACAO, prazo: 2 },
      { tipo: 'ETP', nome: 'Estudo técnico preliminar', setor: ADMINISTRACAO, prazo: 3 },
      { tipo: 'DOCUMENTO', nome: 'Documentos da empresa (CI do RH)', setor: ['recursos humanos', 'rh', 'pessoal'], prazo: 2 },
      { tipo: 'DOCUMENTO', nome: 'Proposta, folder e beneficiários', setor: ADMINISTRACAO, prazo: 2 },
      { tipo: 'DOCUMENTO', nome: 'Habilitação: certidões e documentos', setor: ADMINISTRACAO, prazo: 2 },
      { tipo: 'RESERVA_ORCAMENTARIA', nome: 'Dotação orçamentária', setor: CONTABILIDADE, prazo: 2 },
      { tipo: 'AUTORIZACAO', nome: 'Despacho da Mesa — autoriza o processo', setor: PRESIDENCIA, prazo: 2 },
      { tipo: 'DOCUMENTO', nome: 'Portaria do agente de contratação', setor: LICITACOES, prazo: 1 },
      { tipo: 'DOCUMENTO', nome: 'Relatório do agente de contratação', setor: LICITACOES, prazo: 2 },
      { tipo: 'PARECER_JURIDICO', nome: 'Parecer jurídico', setor: JURIDICO, prazo: 5 },
      { tipo: 'APROVACAO', nome: 'Adjudicação', setor: PRESIDENCIA, prazo: 1 },
      { tipo: 'APROVACAO', nome: 'Ratificação e homologação', setor: PRESIDENCIA, prazo: 1 },
      { tipo: 'DOCUMENTO', nome: 'Aviso de inexigibilidade', setor: LICITACOES, prazo: 1 },
      { tipo: 'PUBLICACAO', nome: 'Publicação no Diário do Legislativo', setor: LICITACOES, prazo: 2 },
    ],
  },
  {
    chave: 'pregao-eletronico-camara',
    nome: 'Pregão eletrônico',
    descricao: 'Fase interna completa, publicação do edital, sessão na plataforma, parecer da fase externa, adjudicação, homologação e contrato.',
    origem: 'Autos do Pregão Eletrônico 004/2026 da Câmara (folhas 1 a 1060), na ordem das folhas.',
    tipo_processo: 'CONTRATACAO',
    aplicacao: { modalidades: ['PREGAO_ELETRONICO'], fundamentos: [], padrao: false },
    etapas: [
      { tipo: 'DFD', nome: 'DFD', setor: ADMINISTRACAO, prazo: 3 },
      { tipo: 'ETP', nome: 'Estudo técnico preliminar (com análise de riscos)', setor: ADMINISTRACAO, prazo: 5 },
      { tipo: 'TAREFA', nome: 'Consulta ao setor técnico (vistoria)', setor: ['patrim'], prazo: 3 },
      { tipo: 'PESQUISA_PRECO', nome: 'Pesquisa de preços', setor: COMPRAS, prazo: 5 },
      { tipo: 'RESERVA_ORCAMENTARIA', nome: 'Dotação orçamentária', setor: CONTABILIDADE, prazo: 3 },
      { tipo: 'TR', nome: 'Termo de referência', setor: ADMINISTRACAO, prazo: 5 },
      { tipo: 'AUTORIZACAO', nome: 'Despacho da Mesa — autoriza a abertura', setor: PRESIDENCIA, prazo: 2 },
      { tipo: 'DOCUMENTO', nome: 'Portarias do agente e dos fiscais', setor: LICITACOES, prazo: 1 },
      { tipo: 'DOCUMENTO', nome: 'Relatório do agente (modalidade e critérios)', setor: LICITACOES, prazo: 2 },
      { tipo: 'DOCUMENTO', nome: 'Minuta do edital e anexos', setor: LICITACOES, prazo: 5 },
      { tipo: 'PARECER_JURIDICO', nome: 'Parecer jurídico — fase interna', setor: JURIDICO, prazo: 5 },
      { tipo: 'PUBLICACAO', nome: 'Publicação do edital (PNCP, Diário e jornal)', setor: LICITACOES, prazo: 2 },
      { tipo: 'TAREFA', nome: 'Sessão pública, recursos e habilitação', setor: LICITACOES, prazo: 15 },
      { tipo: 'PARECER_JURIDICO', nome: 'Parecer jurídico — fase externa', setor: JURIDICO, prazo: 5 },
      { tipo: 'APROVACAO', nome: 'Adjudicação', setor: PRESIDENCIA, prazo: 2 },
      { tipo: 'APROVACAO', nome: 'Homologação', setor: PRESIDENCIA, prazo: 2 },
      { tipo: 'DOCUMENTO', nome: 'Contrato assinado', setor: LICITACOES, prazo: 5 },
      { tipo: 'PUBLICACAO', nome: 'Extrato e publicação do contrato', setor: LICITACOES, prazo: 2 },
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

export function modeloPronto(chave: string): ModeloPronto | null {
  return MODELOS_PRONTOS.find((m) => m.chave === chave) ?? null;
}
