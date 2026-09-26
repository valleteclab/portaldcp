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

/**
 * Entrega 3B — textos que leem SEMPRE os dados do processo (fonte única):
 * número do PA e da dispensa, fundamento legal, teto, sigilo, dotação e leis
 * da reserva, autoridade da configuração e portaria de designação. Mudar o
 * fundamento regera as peças geradas por modelo que não foram editadas à mão.
 */
export const AUTORIZACAO_TEXTO_PADRAO =
  '<p>Considerando a instrução do Processo Administrativo nº {{licitacao.numero_processo}}, cujo objeto é {{licitacao.objeto}}, AUTORIZO o prosseguimento da contratação, com fundamento na {{licitacao.fundamento_legal}}, até o valor máximo (teto) de {{licitacao.teto}}.</p>' +
  '<p>A despesa correrá à conta da dotação: {{reserva.dotacao}}, em conformidade com {{reserva.leis}}.</p>' +
  '<p>{{orgao.cidade}}, {{data_atual}}.</p><p>{{autoridade.nome}}</p>';

/** Texto ANTIGO (Entrega 1) do despacho — o seed troca pelo novo nos modelos do sistema. */
export const AUTORIZACAO_TEXTO_E1 =
  '<p>Considerando a instrução do Processo Administrativo nº {{licitacao.numero_processo}}, AUTORIZO a abertura do procedimento destinado a {{licitacao.objeto}}, com fundamento na {{licitacao.fundamento_legal}}.</p><p>{{orgao.cidade}}, {{data_atual}}.</p>';

export const MINUTA_AVISO_PREAMBULO =
  '<p>{{orgao.nome}}, inscrito no CNPJ sob nº {{orgao.cnpj}}, torna público o procedimento referente ao Processo Administrativo nº {{licitacao.numero_processo}} ({{licitacao.modalidade}} nº {{licitacao.numero_dispensa}}), com fundamento na {{licitacao.fundamento_legal}}, cujo objeto é {{licitacao.objeto}}. Valor estimado: {{licitacao.valor_publico}}.</p>';

/** Texto ANTIGO do preâmbulo da minuta (só "licitação") — o seed troca pelo novo. */
export const MINUTA_AVISO_PREAMBULO_ANTIGO =
  '<p>{{orgao.nome}}, inscrito no CNPJ sob nº {{orgao.cnpj}}, torna público que realizará licitação na modalidade {{licitacao.modalidade}}, referente ao Processo Administrativo nº {{licitacao.numero_processo}}, cujo objeto é {{licitacao.objeto}}.</p>';

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
      { id: 'preambulo', titulo: '1. Preâmbulo', placeholder: 'Identificação do órgão, objeto, modalidade…', obrigatorio: true, fundamento_legal: 'Art. 25', texto_padrao: MINUTA_AVISO_PREAMBULO },
      { id: 'objeto_edital', titulo: '2. Do objeto', placeholder: 'Objeto da licitação…', obrigatorio: true, fundamento_legal: 'Art. 25', texto_padrao: '<p>{{licitacao.objeto}}</p>' },
      { id: 'participacao', titulo: '3. Da participação', placeholder: 'Quem pode participar e vedações…', obrigatorio: true, fundamento_legal: 'Art. 14' },
      { id: 'habilitacao', titulo: '4. Da habilitação', placeholder: 'Documentação necessária para habilitação…', obrigatorio: true, fundamento_legal: 'Art. 62–70' },
      { id: 'julgamento', titulo: '5. Critério de julgamento', placeholder: 'Critério aplicado e justificativa…', obrigatorio: true, fundamento_legal: 'Art. 33', texto_padrao: '<p>{{licitacao.forma_disputa}}</p>' },
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
      { id: 'autorizacao', titulo: 'Autorização da Autoridade Competente', placeholder: 'Autorização formal da autoridade competente para abertura da licitação…', obrigatorio: true, fundamento_legal: 'Art. 18, II', rows: 6, texto_padrao: AUTORIZACAO_TEXTO_PADRAO },
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
      { id: 'amparo_legal', titulo: '1. Amparo legal', placeholder: 'Fundamento legal da contratação direta — vem do campo "Fundamento legal" do processo…', obrigatorio: true, fundamento_legal: 'Art. 74–75', texto_padrao: '<p>Contratação direta com fundamento na {{licitacao.fundamento_legal}}.</p>' },
      { id: 'objeto_contratacao', titulo: '2. Objeto da contratação', placeholder: 'Descrição objetiva do bem, serviço ou obra…', obrigatorio: true, fundamento_legal: 'Art. 75' },
      { id: 'justificativa', titulo: '3. Justificativa da contratação direta', placeholder: 'Razões fáticas e jurídicas que enquadram a contratação na hipótese de dispensa ou inexigibilidade…', obrigatorio: true, fundamento_legal: 'Art. 72, VII', rows: 4 },
      { id: 'caracterizacao', titulo: '4. Caracterização da situação e escolha do fornecedor', placeholder: 'Demonstração objetiva do enquadramento legal, cotações realizadas e escolha do fornecedor…', obrigatorio: true, fundamento_legal: 'Art. 72, VII' },
    ],
  },
  {
    // Entrega 3A — informação orçamentária gerada da RESERVA estruturada
    // (tabelas de dotações e de leis do órgão; linhas por exercício). As
    // variáveis {{reserva.*}} vêm da reserva atual do processo.
    tipo: TipoDocumentoFaseInterna.DOTACAO_ORCAMENTARIA,
    nome: 'Informação orçamentária (reserva de dotação)',
    fundamento_legal: 'Art. 72, IV · Art. 150 · Lei 14.133/2021; LC 101/2000, arts. 15 a 17',
    intro: 'Informa a existência de dotação para a despesa, a classificação orçamentária e a distribuição do valor por exercício.',
    secoes: [
      {
        id: 'solicitacao',
        titulo: '1. Objeto',
        obrigatorio: true,
        fundamento_legal: 'Art. 72, IV',
        texto_padrao:
          '<p>Em atenção ao Processo Administrativo nº {{licitacao.numero_processo}}, cujo objeto é {{licitacao.objeto}}, informamos a existência de dotação orçamentária para a despesa estimada em {{reserva.total}}.</p>',
      },
      {
        id: 'classificacao',
        titulo: '2. Classificação da despesa',
        obrigatorio: true,
        fundamento_legal: 'Lei 4.320/1964',
        texto_padrao:
          '<ul><li>Unidade orçamentária: {{reserva.unidade_orcamentaria}}</li><li>Programa: {{reserva.programa}}</li><li>Projeto/atividade: {{reserva.projeto_atividade}}</li><li>Elemento de despesa: {{reserva.elemento_despesa}}</li><li>Fonte de recurso: {{reserva.fonte_recurso}}</li></ul>',
      },
      {
        id: 'distribuicao',
        titulo: '3. Distribuição por exercício',
        obrigatorio: true,
        fundamento_legal: 'Art. 150',
        texto_padrao: '{{reserva.distribuicao}}',
      },
      {
        id: 'declaracoes',
        titulo: '4. Declarações',
        obrigatorio: true,
        fundamento_legal: 'LC 101/2000, arts. 15, 16 e 17',
        texto_padrao:
          '<p>Declaramos que a despesa tem adequação orçamentária e financeira com a Lei Orçamentária Anual ({{reserva.lei_loa}}) e compatibilidade com a Lei de Diretrizes Orçamentárias ({{reserva.lei_ldo}}) e com o Plano Plurianual ({{reserva.lei_ppa}}), nos termos dos arts. 15, 16 e 17 da Lei Complementar nº 101/2000.</p>',
      },
    ],
  },
  {
    // Entrega 3B — relatório do agente de contratação (razão da escolha,
    // justificativa do preço e enquadramento), lido do processo.
    tipo: TipoDocumentoFaseInterna.RELATORIO_AGENTE,
    nome: 'Relatório do agente de contratação',
    fundamento_legal: 'Art. 72, VI e VII · Lei 14.133/2021',
    intro: 'Relata a instrução, o enquadramento legal, a razão da escolha e a justificativa do preço, a partir dos dados do processo.',
    secoes: [
      {
        id: 'identificacao',
        titulo: '1. Identificação',
        obrigatorio: true,
        fundamento_legal: 'Art. 72',
        texto_padrao:
          '<p>Processo Administrativo nº {{licitacao.numero_processo}} — {{licitacao.modalidade}} nº {{licitacao.numero_dispensa}}. Objeto: {{licitacao.objeto}}.</p><p>Agente de contratação: {{agente.nome}}, {{portaria.designacao}}.</p>',
      },
      {
        id: 'enquadramento',
        titulo: '2. Enquadramento legal',
        obrigatorio: true,
        fundamento_legal: 'Art. 72, VIII · Art. 75',
        texto_padrao:
          '<p>A contratação enquadra-se na {{licitacao.fundamento_legal}}. Limite aplicável no exercício: {{licitacao.limite_dispensa}}.</p>',
      },
      {
        id: 'preco',
        titulo: '3. Justificativa do preço',
        obrigatorio: true,
        fundamento_legal: 'Art. 72, VII · Art. 23',
        texto_padrao:
          '<p>O valor estimado da contratação é de {{licitacao.teto}}, apurado na pesquisa de preços constante dos autos, nos termos do art. 23 da Lei nº 14.133/2021. {{licitacao.sigilo}}</p>',
      },
      {
        id: 'escolha',
        titulo: '4. Razão da escolha do contratado',
        obrigatorio: true,
        fundamento_legal: 'Art. 72, VI',
        placeholder: 'Critério de seleção (menor preço na disputa/propostas, fornecedor exclusivo…) e razão da escolha…',
      },
      {
        id: 'orcamento',
        titulo: '5. Disponibilidade orçamentária',
        obrigatorio: true,
        fundamento_legal: 'Art. 72, IV',
        texto_padrao: '<p>Dotação: {{reserva.dotacao}} (situação: {{reserva.situacao}}; exercícios: {{reserva.exercicios}}).</p>',
      },
      {
        id: 'conclusao',
        titulo: '6. Conclusão',
        obrigatorio: true,
        fundamento_legal: 'Art. 72',
        texto_padrao:
          '<p>Instruído o processo, encaminho os autos para análise jurídica (art. 53 c/c art. 72, III), acompanhados da minuta do aviso e da minuta do contrato.</p><p>{{orgao.cidade}}, {{data_atual}}.</p><p>{{agente.nome}} — {{agente.cargo}}</p>',
      },
    ],
  },
  {
    // Entrega 3B — minuta do contrato com as cláusulas do art. 92 (o roteiro
    // do parecer confere as obrigatórias). A vinculação cita SEMPRE o número
    // do processo e da dispensa lidos do processo (PA 139/2025: o contrato
    // citava o "PA 115/2025" de outro processo).
    tipo: TipoDocumentoFaseInterna.MINUTA_CONTRATO,
    nome: 'Minuta do contrato',
    fundamento_legal: 'Art. 92 · Lei 14.133/2021',
    intro: 'Minuta do termo de contrato com as cláusulas necessárias do art. 92 da Lei 14.133/2021.',
    secoes: [
      { id: 'objeto', titulo: 'Cláusula primeira — Do objeto (art. 92, I)', obrigatorio: true, fundamento_legal: 'Art. 92, I', texto_padrao: '<p>O objeto deste contrato é {{licitacao.objeto}}, conforme especificações do termo de referência.</p>' },
      {
        id: 'vinculacao',
        titulo: 'Cláusula segunda — Da vinculação (art. 92, II)',
        obrigatorio: true,
        fundamento_legal: 'Art. 92, II',
        texto_padrao:
          '<p>Integram este contrato, independentemente de transcrição, o termo de referência, a proposta da contratada e o Processo Administrativo nº {{licitacao.numero_processo}} ({{licitacao.modalidade}} nº {{licitacao.numero_dispensa}}), com fundamento na {{licitacao.fundamento_legal}}, e seus anexos.</p>',
      },
      { id: 'legislacao', titulo: 'Cláusula terceira — Da legislação aplicável (art. 92, III)', obrigatorio: true, fundamento_legal: 'Art. 92, III', texto_padrao: '<p>Este contrato rege-se pela Lei nº 14.133/2021 e pelas demais normas aplicáveis, inclusive nos casos omissos.</p>' },
      { id: 'regime_execucao', titulo: 'Cláusula quarta — Do regime de execução (art. 92, IV)', obrigatorio: true, fundamento_legal: 'Art. 92, IV', placeholder: 'Regime de execução ou forma de fornecimento…' },
      { id: 'preco', titulo: 'Cláusula quinta — Do preço e do reajuste (art. 92, V)', obrigatorio: true, fundamento_legal: 'Art. 92, V', placeholder: 'Preço, condições de pagamento, data-base e critério de reajuste…' },
      { id: 'pagamento', titulo: 'Cláusula sexta — Da medição e do pagamento (art. 92, VI)', obrigatorio: true, fundamento_legal: 'Art. 92, VI', placeholder: 'Critérios e periodicidade da medição, prazo de liquidação e de pagamento…' },
      { id: 'prazos', titulo: 'Cláusula sétima — Dos prazos (art. 92, VII)', obrigatorio: true, fundamento_legal: 'Art. 92, VII', placeholder: 'Prazos de início, execução, conclusão, entrega e recebimento…' },
      { id: 'dotacao', titulo: 'Cláusula oitava — Da dotação orçamentária (art. 92, VIII)', obrigatorio: true, fundamento_legal: 'Art. 92, VIII', texto_padrao: '<p>A despesa correrá à conta da dotação: {{reserva.dotacao}}.</p>' },
      { id: 'garantia', titulo: 'Cláusula nona — Das garantias (art. 92, XII e XIII)', obrigatorio: false, fundamento_legal: 'Art. 92, XII e XIII', placeholder: 'Garantia de execução, se exigida, e prazo de garantia do objeto…' },
      { id: 'obrigacoes', titulo: 'Cláusula décima — Das obrigações e responsabilidades (art. 92, XIV)', obrigatorio: true, fundamento_legal: 'Art. 92, XIV', placeholder: 'Direitos, obrigações e responsabilidades das partes…' },
      { id: 'penalidades', titulo: 'Cláusula décima primeira — Das penalidades (art. 92, XIV)', obrigatorio: true, fundamento_legal: 'Art. 92, XIV · Art. 156', placeholder: 'Infrações, sanções e valores das multas…' },
      { id: 'habilitacao', titulo: 'Cláusula décima segunda — Da manutenção das condições de habilitação (art. 92, XVI)', obrigatorio: true, fundamento_legal: 'Art. 92, XVI', texto_padrao: '<p>A contratada obriga-se a manter, durante toda a execução do contrato, as condições de habilitação e qualificação exigidas.</p>' },
      { id: 'gestao', titulo: 'Cláusula décima terceira — Da gestão e fiscalização (art. 92, XVIII)', obrigatorio: true, fundamento_legal: 'Art. 92, XVIII · Art. 117', placeholder: 'Modelo de gestão, gestor e fiscal do contrato…' },
      { id: 'extincao', titulo: 'Cláusula décima quarta — Da extinção (art. 92, XIX)', obrigatorio: true, fundamento_legal: 'Art. 92, XIX · Art. 137', placeholder: 'Hipóteses de extinção do contrato…' },
      { id: 'foro', titulo: 'Cláusula décima quinta — Do foro (art. 92, §1º)', obrigatorio: true, fundamento_legal: 'Art. 92, §1º', texto_padrao: '<p>Fica eleito o foro da sede da Administração ({{orgao.cidade}}) para dirimir as questões decorrentes deste contrato.</p>' },
    ],
  },
  {
    // Entrega 3B — parecer nº 2, da fase externa (depois da sessão, antes da adjudicação).
    tipo: TipoDocumentoFaseInterna.PARECER_FASE_EXTERNA,
    nome: 'Parecer jurídico da fase externa',
    fundamento_legal: 'Art. 53 · Art. 71 · Lei 14.133/2021',
    intro: 'Análise jurídica da fase externa (julgamento, habilitação e recursos) antes da adjudicação e homologação.',
    secoes: [{ id: 'parecer', titulo: 'Parecer jurídico — fase externa', placeholder: 'Análise da sessão, do julgamento, da habilitação e dos recursos…', obrigatorio: true, fundamento_legal: 'Art. 71', rows: 8 }],
  },
  {
    // Entrega 3B — manifestação do controle interno (opcional por órgão).
    tipo: TipoDocumentoFaseInterna.MANIFESTACAO_CONTROLE_INTERNO,
    nome: 'Manifestação do controle interno',
    fundamento_legal: 'Art. 169, II · Lei 14.133/2021 — regulamento do órgão',
    intro: 'Manifestação da unidade de controle interno sobre a regularidade do processo.',
    secoes: [{ id: 'manifestacao', titulo: 'Manifestação do controle interno', placeholder: 'Análise de regularidade e apontamentos…', obrigatorio: true, fundamento_legal: 'Art. 169, II', rows: 8 }],
  },
];
