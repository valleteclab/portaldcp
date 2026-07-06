import { TipoDocumentoFaseInterna } from './entities/documento-fase-interna.entity';
import { SecaoModelo } from './entities/modelo-documento.entity';

/**
 * Modelos padrão do sistema (seed) — espelham os templates da Lei 14.133/2021
 * usados pelo editor (frontend/src/lib/fase-interna/secoes-template.ts).
 * Órgãos personalizam duplicando esses modelos em `modelos_documento`.
 */
export interface ModeloPadraoDef {
  tipo: TipoDocumentoFaseInterna;
  nome: string;
  fundamento_legal: string;
  intro: string;
  secoes: SecaoModelo[];
}

export const CABECALHO_PADRAO_HTML = `
<div style="text-align:center">
  <strong>{{orgao.nome}}</strong><br/>
  CNPJ: {{orgao.cnpj}}<br/>
  Processo Administrativo nº {{licitacao.numero_processo}}
</div>`.trim();

export const RODAPE_PADRAO_HTML = `
<div style="text-align:center; font-size:10px">
  Documento produzido eletronicamente no Portal DCP em {{data_atual}} — Lei nº 14.133/2021
</div>`.trim();

export const MODELOS_PADRAO: ModeloPadraoDef[] = [
  {
    tipo: TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA,
    nome: 'Documento de Formalização da Demanda (DFD)',
    fundamento_legal: 'Art. 18, I · Lei 14.133/2021',
    intro:
      'Formaliza a necessidade da contratação. Deve identificar a demanda, justificar e vincular ao planejamento institucional.',
    secoes: [
      { id: 'demanda', titulo: '1. Descrição da necessidade', placeholder: 'Descreva o problema ou demanda institucional que justifica a contratação…', obrigatorio: true, fundamento_legal: 'Art. 18, I' },
      { id: 'quantidade', titulo: '2. Quantidade estimada', placeholder: 'Volume estimado, unidade de medida e justificativa do quantitativo…', obrigatorio: true, fundamento_legal: 'Art. 18, I' },
      { id: 'previsao', titulo: '3. Previsão no PCA', placeholder: 'Vinculação ao Plano de Contratações Anual (Art. 12, §1º)…', obrigatorio: false, fundamento_legal: 'Art. 12, §1º' },
      { id: 'data', titulo: '4. Data prevista de conclusão', placeholder: 'Prazo estimado para conclusão da contratação…', obrigatorio: false, fundamento_legal: 'Art. 18, I' },
    ],
  },
  {
    tipo: TipoDocumentoFaseInterna.ESTUDO_TECNICO_PRELIMINAR,
    nome: 'Estudo Técnico Preliminar (ETP)',
    fundamento_legal: 'Art. 18, §1º (I–XIII) · Lei 14.133/2021',
    intro:
      'Analisa a viabilidade técnica e econômica da contratação. Os incisos I, IV, VI, VIII e XIII são de presença obrigatória (Art. 18, §2º). Os demais exigem justificativa quando ausentes.',
    secoes: [
      { id: 'necessidade', titulo: '1. Descrição da necessidade (inc. I) *', placeholder: 'Necessidade fundamentada em estudos que caracteriza o interesse público envolvido…', obrigatorio: true, fundamento_legal: 'Art. 18, §1º, I' },
      { id: 'previsao_pca', titulo: '2. Previsão no PCA (inc. II)', placeholder: 'Referência ao Plano de Contratações Anual (Art. 12, §1º). Se não constar, justificar…', obrigatorio: false, fundamento_legal: 'Art. 18, §1º, II' },
      { id: 'requisitos', titulo: '3. Requisitos da contratação (inc. III)', placeholder: 'Requisitos técnicos, de sustentabilidade (Art. 5º, IV), qualidade e desempenho…', obrigatorio: false, fundamento_legal: 'Art. 18, §1º, III' },
      { id: 'estimativa', titulo: '4. Estimativa de quantidades (inc. IV) *', placeholder: 'Memória de cálculo, parâmetros utilizados e documentos de suporte para as quantidades…', obrigatorio: true, fundamento_legal: 'Art. 18, §1º, IV' },
      { id: 'levantamento', titulo: '5. Levantamento de mercado (inc. V)', placeholder: 'Alternativas de mercado analisadas, solução escolhida e justificativa técnica/econômica…', obrigatorio: false, fundamento_legal: 'Art. 18, §1º, V' },
      { id: 'estimativa_valor', titulo: '6. Estimativa de valor referencial (inc. VI) *', placeholder: 'Valor total estimado com metodologia, composição de preços e referências utilizadas (distinto da PP)…', obrigatorio: true, fundamento_legal: 'Art. 18, §1º, VI', rows: 4 },
      { id: 'solucao', titulo: '7. Descrição da solução escolhida (inc. VII)', placeholder: 'Descrição detalhada da solução técnica adotada e justificativa da escolha…', obrigatorio: false, fundamento_legal: 'Art. 18, §1º, VII' },
      { id: 'parcelamento', titulo: '8. Parcelamento ou não (inc. VIII) *', placeholder: 'Justificativa para parcelar ou não o objeto (Art. 40, §3º). Se não parcelado, razões técnicas/econômicas…', obrigatorio: true, fundamento_legal: 'Art. 18, §1º, VIII' },
      { id: 'beneficios', titulo: '9. Resultados e benefícios esperados (inc. IX)', placeholder: 'Resultados pretendidos em termos quantitativos e qualitativos com a contratação…', obrigatorio: false, fundamento_legal: 'Art. 18, §1º, IX' },
      { id: 'providencias', titulo: '10. Providências prévias necessárias (inc. X)', placeholder: 'Licenças, autorizações, certificações ou ações administrativas a serem adotadas previamente…', obrigatorio: false, fundamento_legal: 'Art. 18, §1º, X' },
      { id: 'correlatas', titulo: '11. Contratações correlatas (inc. XI)', placeholder: 'Contratos vigentes ou a serem celebrados que guardem relação de interdependência com esta contratação…', obrigatorio: false, fundamento_legal: 'Art. 18, §1º, XI' },
      { id: 'sustentabilidade', titulo: '12. Impactos ambientais e sustentabilidade (inc. XII)', placeholder: 'Critérios de sustentabilidade (Art. 5º, IV), impactos ambientais identificados e medidas mitigadoras…', obrigatorio: false, fundamento_legal: 'Art. 18, §1º, XII' },
      { id: 'viabilidade', titulo: '13. Posicionamento conclusivo (inc. XIII) *', placeholder: 'Conclusão sobre a viabilidade técnica e econômica da contratação e recomendações…', obrigatorio: true, fundamento_legal: 'Art. 18, §1º, XIII' },
    ],
  },
  {
    tipo: TipoDocumentoFaseInterna.TERMO_REFERENCIA,
    nome: 'Termo de Referência (TR)',
    fundamento_legal: 'Art. 6º, XXIII · Art. 40 · Lei 14.133/2021',
    intro:
      'Consolida tudo o que foi estudado e define com precisão o objeto, requisitos, modelo de execução e fiscalização. Deve conter todos os elementos do Art. 6º, XXIII, alíneas a–j.',
    secoes: [
      { id: 'objeto', titulo: '1. Objeto (alínea a)', placeholder: 'Descrição precisa do objeto da contratação…', obrigatorio: true, fundamento_legal: 'Art. 6º, XXIII, a' },
      { id: 'fundamentacao', titulo: '2. Fundamentação e justificativa (alínea b)', placeholder: 'Base legal e justificativa da necessidade da contratação…', obrigatorio: true, fundamento_legal: 'Art. 6º, XXIII, b' },
      { id: 'descricao', titulo: '3. Descrição da solução (alínea c)', placeholder: 'Solução técnica completa, incluindo os resultados esperados…', obrigatorio: true, fundamento_legal: 'Art. 6º, XXIII, c' },
      { id: 'requisitos', titulo: '4. Requisitos da contratação (alínea d)', placeholder: 'Requisitos técnicos, qualidade, desempenho, sustentabilidade e outras condicionantes…', obrigatorio: true, fundamento_legal: 'Art. 6º, XXIII, d' },
      { id: 'modelo_execucao', titulo: '5. Modelo de execução do objeto (alínea e)', placeholder: 'Prazos, locais de entrega/execução, dinâmica de execução e demais condições práticas…', obrigatorio: true, fundamento_legal: 'Art. 6º, XXIII, e' },
      { id: 'modelo_gestao', titulo: '6. Modelo de gestão e fiscalização (alínea f)', placeholder: 'Estrutura de gestão, designação de fiscais, indicadores de desempenho e penalidades…', obrigatorio: true, fundamento_legal: 'Art. 6º, XXIII, f' },
      { id: 'pagamento', titulo: '7. Critérios de medição e pagamento (alínea g)', placeholder: 'Forma, condições, prazos e critérios objetivos de medição e pagamento…', obrigatorio: true, fundamento_legal: 'Art. 6º, XXIII, g' },
      { id: 'selecao_habilitacao', titulo: '8. Critérios de seleção e habilitação (alínea h)', placeholder: 'Forma de seleção do fornecedor, modalidade, critério de julgamento, modo de disputa e requisitos de habilitação…', obrigatorio: true, fundamento_legal: 'Art. 6º, XXIII, h' },
      { id: 'estimativa_valor_tr', titulo: '9. Estimativa de valor e sigilo (alínea i)', placeholder: 'Estimativa do valor do objeto com metodologia utilizada. Se aplicável, indicar sigilo do orçamento (Art. 24, §1º)…', obrigatorio: true, fundamento_legal: 'Art. 6º, XXIII, i · Art. 24', rows: 4 },
      { id: 'dotacao_orcamentaria_tr', titulo: '10. Adequação orçamentária (alínea j)', placeholder: 'Elemento de despesa, fonte de recurso, programa/ação e dotação orçamentária…', obrigatorio: true, fundamento_legal: 'Art. 6º, XXIII, j · Art. 167, CF/88' },
    ],
  },
  {
    tipo: TipoDocumentoFaseInterna.MINUTA_EDITAL,
    nome: 'Minuta do Edital',
    fundamento_legal: 'Art. 25 · Lei 14.133/2021',
    intro: 'A minuta consolida as regras da licitação, vinculada ao TR e aos demais documentos da fase interna.',
    secoes: [
      { id: 'preambulo', titulo: '1. Preâmbulo', placeholder: 'Identificação do órgão, objeto, modalidade…', obrigatorio: true, fundamento_legal: 'Art. 25', texto_padrao: '<p>{{orgao.nome}}, inscrito no CNPJ sob nº {{orgao.cnpj}}, torna público que realizará licitação na modalidade {{licitacao.modalidade}}, referente ao Processo Administrativo nº {{licitacao.numero_processo}}, cujo objeto é {{licitacao.objeto}}.</p>' },
      { id: 'objeto_edital', titulo: '2. Do objeto', placeholder: 'Objeto da licitação…', obrigatorio: true, fundamento_legal: 'Art. 25', texto_padrao: '<p>{{licitacao.objeto}}</p>' },
      { id: 'participacao', titulo: '3. Da participação', placeholder: 'Quem pode participar e vedações…', obrigatorio: true, fundamento_legal: 'Art. 14' },
      { id: 'habilitacao', titulo: '4. Da habilitação', placeholder: 'Documentação necessária para habilitação…', obrigatorio: true, fundamento_legal: 'Art. 62–70' },
      { id: 'julgamento', titulo: '5. Critério de julgamento', placeholder: 'Critério aplicado e justificativa…', obrigatorio: true, fundamento_legal: 'Art. 33' },
      { id: 'recursos', titulo: '6. Dos recursos', placeholder: 'Prazos e procedimentos recursais…', obrigatorio: true, fundamento_legal: 'Art. 165' },
      { id: 'contratacao', titulo: '7. Da contratação', placeholder: 'Condições e prazos de contratação…', obrigatorio: true, fundamento_legal: 'Art. 90' },
    ],
  },
  {
    tipo: TipoDocumentoFaseInterna.PARECER_JURIDICO,
    nome: 'Parecer Jurídico',
    fundamento_legal: 'Art. 53 · Lei 14.133/2021',
    intro: 'Análise jurídica da minuta do edital e dos atos que a instruem, verificando a legalidade do processo.',
    secoes: [
      { id: 'parecer', titulo: 'Parecer Jurídico', placeholder: 'Análise jurídica do processo licitatório, verificando a conformidade com a Lei 14.133/2021 e legislação correlata…', obrigatorio: true, fundamento_legal: 'Art. 53', rows: 8 },
    ],
  },
  {
    tipo: TipoDocumentoFaseInterna.AUTORIZACAO_ABERTURA,
    nome: 'Autorização para Abertura',
    fundamento_legal: 'Art. 18, II · Lei 14.133/2021',
    intro: 'Ato formal da autoridade competente autorizando o início da fase externa da licitação.',
    secoes: [
      { id: 'autorizacao', titulo: 'Autorização da Autoridade Competente', placeholder: 'Autorização formal da autoridade competente para abertura da licitação…', obrigatorio: true, fundamento_legal: 'Art. 18, II', rows: 6, texto_padrao: '<p>Considerando a instrução do Processo Administrativo nº {{licitacao.numero_processo}}, AUTORIZO a abertura do procedimento licitatório destinado a {{licitacao.objeto}}, nos termos do Art. 18, II, da Lei nº 14.133/2021.</p><p>{{orgao.cidade}}, {{data_atual}}.</p>' },
    ],
  },
  {
    tipo: TipoDocumentoFaseInterna.DESIGNACAO_PREGOEIRO,
    nome: 'Designação do Agente de Contratação/Pregoeiro',
    fundamento_legal: 'Art. 8º · Lei 14.133/2021',
    intro: 'Ato de designação do agente de contratação (pregoeiro) e equipe de apoio responsáveis pela condução do certame.',
    secoes: [
      { id: 'designacao', titulo: 'Ato de Designação', placeholder: 'Designação do agente de contratação/pregoeiro e equipe de apoio, com identificação dos servidores…', obrigatorio: true, fundamento_legal: 'Art. 8º', rows: 6 },
    ],
  },
  {
    tipo: TipoDocumentoFaseInterna.JUSTIFICATIVA_CONTRATACAO,
    nome: 'Aviso de Contratação Direta',
    fundamento_legal: 'Art. 74–75 · Art. 54, §1º · Lei 14.133/2021',
    intro:
      'Publicação obrigatória no PNCP e no Diário Oficial para contratações por dispensa eletrônica ou inexigibilidade. Substitui a minuta do edital nestes casos.',
    secoes: [
      { id: 'amparo_legal', titulo: '1. Amparo legal', placeholder: 'Fundamento legal da contratação direta. Ex: Art. 75, I – valor abaixo do limite…', obrigatorio: true, fundamento_legal: 'Art. 74–75' },
      { id: 'objeto_contratacao', titulo: '2. Objeto da contratação', placeholder: 'Descrição objetiva do bem, serviço ou obra…', obrigatorio: true, fundamento_legal: 'Art. 75' },
      { id: 'justificativa', titulo: '3. Justificativa da contratação direta', placeholder: 'Razões fáticas e jurídicas que enquadram a contratação na hipótese de dispensa ou inexigibilidade…', obrigatorio: true, fundamento_legal: 'Art. 72, VII', rows: 4 },
      { id: 'caracterizacao', titulo: '4. Caracterização da situação e escolha do fornecedor', placeholder: 'Demonstração objetiva do enquadramento legal, cotações realizadas e escolha do fornecedor…', obrigatorio: true, fundamento_legal: 'Art. 72, VII' },
    ],
  },
];
