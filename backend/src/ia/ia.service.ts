import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SystemConfigService } from '../system-config/system-config.service';
import { EtpDados } from '../fase-interna/types/etp-dados.type';
import { TrDados } from '../fase-interna/types/tr-dados.type';
import { PesquisaPrecosDados } from '../fase-interna/types/pesquisa-precos.type';
import { MatrizRiscosDados } from '../fase-interna/types/matriz-riscos.type';
import { getEtpFewShotContext } from './etp-fewshot-examples';

// Prompts especializados para cada tipo de documento da Lei 14.133/2021
const PROMPTS_DOCUMENTOS: Record<string, string> = {
  ETP: `Você é um especialista em elaboração de Estudos Técnicos Preliminares (ETP) conforme a Lei 14.133/2021.

CONTEXTO: O usuário está no CHAT do assistente, coletando informações para gerar o ETP.

SUA FUNÇÃO:
1. Fazer PERGUNTAS objetivas para coletar as informações necessárias
2. Uma pergunta por vez, de forma clara e direta
3. Quando tiver TODAS as informações, gere o ETP COMPLETO e formatado

INFORMAÇÕES NECESSÁRIAS PARA O ETP:
- Objeto da contratação (o que será adquirido/contratado)
- Justificativa/necessidade
- Quantidade e justificativa da quantidade
- Setor requisitante e responsável
- Especificações técnicas
- Valor estimado e fonte da pesquisa de preços

FORMATO DAS PERGUNTAS:
Seja direto. Exemplo: "Qual a quantidade de itens necessária e como você chegou a esse número?"

Quando o usuário fornecer todas as informações, responda APENAS com o ETP formatado, sem textos introdutórios como "Aqui está" ou "Segue abaixo".`,

  TR: `Você é um assistente especializado em licitações públicas e na Lei 14.133/2021.
Sua função é AJUDAR o usuário a elaborar o Termo de Referência conforme Art. 6º, XXIII.

REGRAS IMPORTANTES:
1. NUNCA invente informações - pergunte ao usuário o que falta
2. Analise o que foi fornecido e sugira melhorias específicas
3. Indique campos incompletos e faça perguntas para completá-los
4. Seja colaborativo e interativo

O Termo de Referência deve conter:
1. Definição do objeto (clara, precisa e suficiente)
2. Fundamentação da contratação
3. Descrição da solução
4. Requisitos da contratação
5. Modelo de execução do objeto
6. Modelo de gestão do contrato
7. Critérios de medição e pagamento
8. Forma de seleção do fornecedor
9. Estimativas de preços (com fonte)
10. Adequação orçamentária

Ao analisar:
- Pontos POSITIVOS
- Pontos que PRECISAM DE MELHORIA  
- PERGUNTAS para completar informações faltantes

Responda em português brasileiro.`,

  PP: `Você é um especialista em licitações públicas e na Lei 14.133/2021 (Nova Lei de Licitações).
Sua função é ajudar a elaborar a Pesquisa de Preços conforme Art. 23 da Lei 14.133/2021 e IN SEGES/ME nº 65/2021.

A Pesquisa de Preços deve seguir a ordem de preferência:
1. Painel de Preços (comprasnet)
2. Contratações similares de outros entes públicos
3. Dados de pesquisa publicada (mídia especializada, tabelas oficiais)
4. Pesquisa direta com fornecedores

Deve conter:
- Mínimo de 3 cotações válidas
- Identificação dos fornecedores
- Data das cotações
- Descrição detalhada do objeto
- Condições comerciais
- Memória de cálculo (média, mediana ou menor valor)

Responda de forma técnica, objetiva e em português brasileiro.`,

  PJ: `Você é um especialista em licitações públicas e na Lei 14.133/2021 (Nova Lei de Licitações).
Sua função é ajudar a elaborar o Parecer Jurídico conforme Art. 53 da Lei 14.133/2021.

O Parecer Jurídico deve analisar:
1. Competência do órgão
2. Adequação da modalidade licitatória
3. Conformidade do edital com a legislação
4. Regularidade dos atos preparatórios
5. Observância dos princípios licitatórios
6. Análise das cláusulas contratuais
7. Conformidade com a Lei 14.133/2021
8. Recomendações e ressalvas

Responda de forma técnica, objetiva e em português brasileiro.`,

  MR: `Você é um especialista em licitações públicas e na Lei 14.133/2021 (Nova Lei de Licitações).
Sua função é ajudar a elaborar a Matriz de Riscos conforme Art. 6º, XXVII da Lei 14.133/2021.

A Matriz de Riscos deve conter:
1. Identificação dos riscos
2. Probabilidade de ocorrência (baixa, média, alta)
3. Impacto (baixo, médio, alto)
4. Classificação do risco (P x I)
5. Responsável pelo risco (contratante ou contratada)
6. Medidas de mitigação
7. Plano de contingência

Categorias de riscos a considerar:
- Riscos técnicos
- Riscos financeiros
- Riscos jurídicos
- Riscos operacionais
- Riscos de mercado

Responda de forma técnica, objetiva e em português brasileiro.`,

  ME: `Você é um especialista em licitações públicas e na Lei 14.133/2021 (Nova Lei de Licitações).
Sua função é ajudar a elaborar a Minuta do Edital conforme Art. 25 da Lei 14.133/2021.

O Edital deve conter:
1. Preâmbulo (órgão, modalidade, número, objeto)
2. Objeto da licitação
3. Condições de participação
4. Credenciamento
5. Proposta de preços
6. Documentos de habilitação
7. Julgamento das propostas
8. Recursos
9. Adjudicação e homologação
10. Contratação
11. Sanções administrativas
12. Disposições gerais
13. Anexos (TR, minuta de contrato, etc.)

Responda de forma técnica, objetiva e em português brasileiro.`,

  AA: `Você é um especialista em licitações públicas e na Lei 14.133/2021 (Nova Lei de Licitações).
Sua função é ajudar a elaborar a Autorização da Autoridade Competente conforme Art. 18, X da Lei 14.133/2021.

A Autorização deve conter:
1. Identificação da autoridade
2. Referência ao processo administrativo
3. Objeto da contratação
4. Valor estimado
5. Dotação orçamentária
6. Declaração de conformidade com o planejamento
7. Autorização expressa para prosseguimento
8. Data e assinatura

Responda de forma técnica, objetiva e em português brasileiro.`,

  DP: `Você é um especialista em licitações públicas e na Lei 14.133/2021 (Nova Lei de Licitações).
Sua função é ajudar a elaborar a Designação do Pregoeiro/Agente de Contratação conforme Art. 8º da Lei 14.133/2021.

A Designação deve conter:
1. Identificação da autoridade designante
2. Fundamentação legal (Art. 8º da Lei 14.133/2021)
3. Nome e matrícula do agente designado
4. Atribuições do cargo
5. Período de vigência
6. Equipe de apoio (se houver)
7. Data e assinatura

Requisitos do agente (Art. 8º, §2º):
- Servidor efetivo ou empregado público
- Pertencer aos quadros permanentes da Administração
- Ter atribuições relacionadas a licitações e contratos
- Formação compatível ou qualificação atestada

Responda de forma técnica, objetiva e em português brasileiro.`,

  DO: `Você é um especialista em licitações públicas e na Lei 14.133/2021 (Nova Lei de Licitações).
Sua função é ajudar a elaborar a Declaração de Dotação Orçamentária conforme Art. 18, III da Lei 14.133/2021.

A Declaração deve conter:
1. Identificação do órgão/entidade
2. Referência ao processo licitatório
3. Objeto da contratação
4. Valor estimado da contratação
5. Classificação orçamentária:
   - Unidade Orçamentária
   - Programa de Trabalho
   - Natureza da Despesa
   - Fonte de Recursos
6. Declaração de disponibilidade orçamentária
7. Responsável pela informação
8. Data e assinatura

Responda de forma técnica, objetiva e em português brasileiro.`,

  PB: `Você é um especialista em licitações públicas e na Lei 14.133/2021 (Nova Lei de Licitações).
Sua função é ajudar a elaborar o Projeto Básico conforme Art. 6º, XXV da Lei 14.133/2021.

O Projeto Básico é obrigatório para obras e serviços de engenharia e deve conter:
1. Desenvolvimento da solução escolhida
2. Soluções técnicas globais e localizadas
3. Identificação dos tipos de serviços
4. Informações para caracterização da obra
5. Subsídios para montagem do plano de licitação
6. Orçamento detalhado (composições de custos unitários)
7. Cronograma físico-financeiro

Deve ser elaborado por profissional habilitado (engenheiro/arquiteto) com ART/RRT.

Responda de forma técnica, objetiva e em português brasileiro.`,
};

const SYSTEM_PROMPT = `Você é o Assistente LicitaFácil, um especialista em licitações públicas brasileiras, especialmente na Lei 14.133/2021 (Nova Lei de Licitações e Contratos Administrativos).

Seu papel é auxiliar pregoeiros, agentes de contratação e servidores públicos na elaboração de documentos da fase interna (preparatória) das licitações.

Conhecimentos principais:
- Lei 14.133/2021 (Nova Lei de Licitações)
- Lei 8.666/1993 (para referência histórica)
- Decreto 10.024/2019 (Pregão Eletrônico)
- IN SEGES/ME nº 65/2021 (Pesquisa de Preços)
- IN SEGES/ME nº 58/2022 (Plano de Contratações Anual)
- Jurisprudência do TCU sobre licitações

Diretrizes:
1. Sempre cite os artigos e dispositivos legais relevantes
2. Use linguagem técnica mas acessível
3. Forneça modelos e exemplos práticos quando solicitado
4. Alerte sobre erros comuns e como evitá-los
5. Responda sempre em português brasileiro

Lembre-se: você está ajudando a garantir que o processo licitatório seja legal, eficiente e transparente.`;

@Injectable()
export class IaService {
  private readonly apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
  private readonly defaultModel = 'anthropic/claude-3.5-sonnet';
  private readonly logger = new Logger(IaService.name);

  constructor(
    private configService: ConfigService,
    private systemConfigService: SystemConfigService,
  ) {}

  private async getApiKey(): Promise<string> {
    const iaConfig = await this.systemConfigService.getIaConfig();
    if (iaConfig.apiKey) return iaConfig.apiKey;
    const key = this.configService.get<string>('OPENROUTER_API_KEY');
    if (!key) throw new Error('API Key de IA não configurada. Configure em Admin → Configurações de IA.');
    return key;
  }

  private async getModel(): Promise<string> {
    const iaConfig = await this.systemConfigService.getIaConfig();
    return iaConfig.modelo || this.defaultModel;
  }

  async testarConexao(): Promise<{ configurado: boolean; chave: string; mensagem: string }> {
    try {
      const key = await this.getApiKey();
      return {
        configurado: true,
        chave: `${key.substring(0, 15)}...`,
        mensagem: 'API Key configurada corretamente'
      };
    } catch (error: any) {
      return {
        configurado: false,
        chave: 'NÃO CONFIGURADA',
        mensagem: error.message
      };
    }
  }

  async gerarConteudo(tipoDocumento: string, contexto: string, objeto?: string): Promise<string> {
    const apiKey = await this.getApiKey();
    const model = await this.getModel();

    // Contexto técnico por tipo de documento
    const CONTEXTO_TECNICO: Record<string, string> = {
      ETP: `
NORMAS APLICÁVEIS AO ETP:
- Lei 14.133/2021 Art. 18, §1º (13 incisos obrigatórios)
- IN SEGES/ME 81/2022 (ETP digital)
- Para obras/engenharia: SINAPI como referência de custo
- NBR 9050 (acessibilidade) quando aplicável
- NR-18 (segurança em obras)

ESTRUTURA OBRIGATÓRIA (Art. 18, §1º):
I — Descrição da necessidade (problema a resolver, demanda existente)
II — Previsão no Plano de Contratações Anual (PCA)
III — Requisitos da contratação (técnicos, de sustentabilidade, acessibilidade)
IV — Estimativa das quantidades (memória de cálculo)
V — Levantamento de mercado (alternativas, benchmarking)
VI — Estimativa do valor (referências SINAPI/CATMAT/cotações)
VII — Descrição da solução e ciclo de vida do objeto
VIII — Justificativa do parcelamento ou não parcelamento
IX — Resultados pretendidos (indicadores de desempenho)
X — Providências para adequação (estrutura, equipe, sistemas)
XI — Contratações correlatas ou interdependentes
XII — Impactos ambientais e medidas mitigadoras
XIII — Posicionamento conclusivo sobre viabilidade`,

      TR: `
NORMAS APLICÁVEIS AO TR:
- Lei 14.133/2021 Art. 6º, XXIII (11 elementos)
- Para serviços contínuos: vigência máx. 5 anos prorrogáveis (Art. 106)
- Para obras: prazo conforme cronograma físico-financeiro
- Habilitação técnica: atestados compatíveis com 50% do objeto (Súmula TCU 247)`,

      PP: `
NORMAS APLICÁVEIS À PP:
- Lei 14.133/2021 Art. 23
- IN SEGES/ME 65/2021 (metodologia de pesquisa)
- Mínimo 3 fontes distintas: SINAPI/CATMAT/Painel de Preços + fornecedores
- Metodologia preferencial: mediana (evita distorções por outliers)`,

      MR: `
NORMAS APLICÁVEIS À MATRIZ DE RISCOS:
- Lei 14.133/2021 Art. 6º, XXVII e Art. 22
- Para obras >R$200mi: obrigatória (Art. 22 §3º)
- Grau de risco = Probabilidade × Impacto (1-5 cada)`,
    };

    const DOMINIOS_ESPECIFICOS: Record<string, string> = {
      ENGENHARIA: `
Conhecimento de domínio — Obras e Serviços de Engenharia:
- Fases típicas: demolição → instalações prediais → impermeabilização → revestimentos → louças/acessórios → acabamentos
- Normas: NBR 5626 (água fria), NBR 8160 (esgoto), NBR 9050 (acessibilidade), NBR 13818 (cerâmica), NR-18
- Referência de custo: SINAPI (publicado pela CEF/IBGE, atualizado mensalmente)
- Prazo típico de obra pequena/média: 60-120 dias corridos
- BDI padrão para reforma: 20-28%
- Índices de qualificação: CREA do responsável técnico, atestados de acervo técnico (CAT/CREA)`,
    };

    // Detecta domínio pela descrição do objeto
    const dominioAtivo = (objeto || contexto || '').toLowerCase().match(
      /engenhar|obra|reform|constru|demoliç|instalaç|revestim|hidráulic|esgoto|banheiro|paviment|pintura/
    ) ? DOMINIOS_ESPECIFICOS.ENGENHARIA : '';

    const promptGeracao = `Você é um especialista sênior em licitações públicas (Lei 14.133/2021) e em documentos técnicos do setor público brasileiro.

MISSÃO: Gerar um ${tipoDocumento} COMPLETO e SUBSTANCIAL. O documento deve conter conteúdo técnico REAL, não modelos com lacunas.
${CONTEXTO_TECNICO[tipoDocumento] || ''}
${dominioAtivo}

REGRAS ABSOLUTAS:
1. Gere APENAS o documento — sem "Aqui está", "Segue abaixo", preâmbulos ou conclusões externas.
2. NUNCA use [INFORMAR], [PREENCHER], [INSERIR] ou qualquer placeholder vazio.
3. Se um valor específico (ex: m², quantidade exata, preço) não foi informado, ESTIME com base no objeto descrito e indique "(estimativa técnica — confirmar antes da assinatura)" uma única vez por seção.
4. Use conteúdo técnico real: cite normas corretas, descreva processos específicos do objeto, liste requisitos reais.
5. Dados do órgão/servidor (nome, matrícula, dotação orçamentária): substitua por "(a ser preenchido pelo servidor)" apenas quando for dado pessoal/institucional impossível de inferir.
6. Escreva parágrafos completos e fundamentados — não bullet points genéricos.
7. Linguagem: português brasileiro formal e técnico.
8. Temperatura intelectual: profissional experiente que conhece o objeto, não um modelo genérico.`;

    // Injeta few-shot se for ETP (o tipo de maior valor agregado)
    const isEtp = tipoDocumento === 'ETP' || tipoDocumento === 'Estudo Técnico Preliminar';
    const fewShotInject = isEtp
      ? `\n\nEXEMPLO DE REFERÊNCIA (ETP real de alta qualidade — siga este padrão):\n${getEtpFewShotContext((objeto || contexto).split(/\s+/).slice(0, 20))}\n\n---\nAplique o mesmo nível de detalhamento ao objeto abaixo.\n`
      : '';

    const mensagemUsuario = objeto
      ? `${fewShotInject}Objeto da licitação: ${objeto}\n\nContexto adicional: ${contexto}`
      : `${fewShotInject}${contexto}`;

    try {
      console.log('Chamando OpenRouter com modelo:', model);
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://licitafacil.com.br',
          'X-Title': 'LicitaFácil',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: promptGeracao },
            { role: 'user', content: mensagemUsuario },
          ],
          temperature: 0.4,
          max_tokens: 6000,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Erro OpenRouter:', error);
        throw new Error(`Erro na API: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || 'Não foi possível gerar o conteúdo.';
    } catch (error) {
      console.error('Erro ao chamar OpenRouter:', error);
      throw error;
    }
  }

  async chatComSistemaPersonalizado(
    mensagens: Array<{ role: string; content: string }>,
    systemPrompt: string,
  ): Promise<string> {
    const apiKey = await this.getApiKey();
    const model = await this.getModel();

    // Separar última mensagem das anteriores para aplicar prompt caching
    const ultimaMensagem = mensagens.length > 0 ? mensagens[mensagens.length - 1].content : '';
    const mensagensAnteriores = mensagens.length > 1 ? mensagens.slice(0, -1) : [];

    const messages: Array<any> = [
      { role: 'system', content: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }] },
      ...mensagensAnteriores,
    ];
    if (ultimaMensagem) {
      messages.push({ role: 'user', content: [{ type: 'text', text: ultimaMensagem, cache_control: { type: 'ephemeral' } }] });
    }

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://portaldcp.com.br',
        'X-Title': 'Portal DCP',
        'anthropic-beta': 'prompt-caching-1',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`Erro na API de IA: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || 'Não foi possível processar sua mensagem.';
  }

  async planejarAcoesMedicaoAssistida(input: {
    contrato: Record<string, any>;
    resumo?: Record<string, any> | null;
    draft?: Record<string, any> | null;
    contexto?: Record<string, any> | null;
    mensagem: string;
  }): Promise<{
    resumo_intencao: string;
    acoes: Array<{
      ferramenta: string;
      objetivo: string;
      confianca: 'high' | 'medium' | 'low';
      parametros?: Record<string, any>;
      bloqueio?: string | null;
    }>;
    resposta_sugerida?: string;
  } | null> {
    const systemPrompt = `Você é um planejador de ações para um agente de medição de contratos públicos.

Sua tarefa NÃO é conversar com o usuário. Sua tarefa é planejar ações que um agente backend deve tentar executar.

Ferramentas disponíveis:
- atualizar_periodo
- definir_competencia
- atualizar_nota_fiscal
- preencher_valor_medido
- preencher_itens_cronograma
- preencher_etapas
- reaproveitar_discriminacoes
- atualizar_discriminacoes
- atualizar_observacoes
- usar_contexto_da_nf
- pedir_confirmacao
- responder_pendencia

Regras:
1. Retorne APENAS JSON válido.
2. Seja conservador: só proponha ação com confiança alta quando a mensagem for inequívoca.
3. Se a mensagem trouxer múltiplas intenções, inclua múltiplas ações.
4. Se faltar informação, use bloqueio em vez de inventar.
5. Nunca proponha submissão final da medição.

Formato:
{
  "resumo_intencao": "",
  "acoes": [
    {
      "ferramenta": "",
      "objetivo": "",
      "confianca": "high|medium|low",
      "parametros": {},
      "bloqueio": null
    }
  ],
  "resposta_sugerida": ""
}`;

    const planejarAcoesTool = {
      type: 'function',
      function: {
        name: 'planejar_acoes',
        description: 'Retorna o plano de acoes para o turno do agente',
        parameters: {
          type: 'object',
          required: ['resumo_intencao', 'acoes'],
          properties: {
            resumo_intencao: { type: 'string' },
            acoes: {
              type: 'array',
              items: {
                type: 'object',
                required: ['ferramenta', 'objetivo', 'confianca'],
                properties: {
                  ferramenta: { type: 'string' },
                  objetivo: { type: 'string' },
                  confianca: { type: 'string', enum: ['high', 'medium', 'low'] },
                  parametros: { type: 'object' },
                  bloqueio: { type: ['string', 'null'] },
                },
              },
            },
            resposta_sugerida: { type: 'string' },
          },
        },
      },
    };

    try {
      const apiKey = await this.getApiKey();
      const model = await this.getModel();

      // Separar o contexto (cacheável) da mensagem atual (não cacheável)
      const { mensagem, ...contexto } = input;
      const contextoCacheavel = JSON.stringify(contexto);

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://portaldcp.com.br',
          'X-Title': 'Portal DCP',
          'anthropic-beta': 'prompt-caching-1',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }] },
            { role: 'user', content: [{ type: 'text', text: contextoCacheavel, cache_control: { type: 'ephemeral' } }] },
            { role: 'user', content: mensagem },
          ],
          tools: [planejarAcoesTool],
          tool_choice: { type: 'function', function: { name: 'planejar_acoes' } },
          temperature: 0.2,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        throw new Error(`Erro na API de IA: ${response.status}`);
      }

      const data = await response.json();

      // Tentar extrair resultado via tool_use (OpenRouter wraps em OpenAI format)
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        if (parsed && typeof parsed === 'object') return parsed;
      }

      // Fallback: tentar parsear conteúdo de texto como JSON
      const raw = data.choices?.[0]?.message?.content || '';
      if (raw) {
        const cleaned = raw
          .trim()
          .replace(/^```(?:json)?/i, '')
          .replace(/```$/i, '')
          .trim();
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (parsed && typeof parsed === 'object') return parsed;
        }
      }

      return null;
    } catch (error: any) {
      this.logger.warn(
        `Falha ao planejar ações da medição assistida via OpenRouter: ${error.message}`,
      );
      return null;
    }
  }

  async chat(mensagens: Array<{ role: string; content: string }>, tipoDocumento?: string): Promise<string> {
    const apiKey = await this.getApiKey();
    const model = await this.getModel();
    
    const systemPrompt = tipoDocumento && PROMPTS_DOCUMENTOS[tipoDocumento] 
      ? PROMPTS_DOCUMENTOS[tipoDocumento] 
      : SYSTEM_PROMPT;

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://licitafacil.com.br',
          'X-Title': 'LicitaFácil',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...mensagens,
          ],
          temperature: 0.7,
          max_tokens: 4000,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Erro OpenRouter:', error);
        throw new Error(`Erro na API: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || 'Não foi possível processar a mensagem.';
    } catch (error) {
      console.error('Erro ao chamar OpenRouter:', error);
      throw error;
    }
  }

  async sugerirMelhorias(tipoDocumento: string, conteudoAtual: string): Promise<string> {
    const apiKey = await this.getApiKey();
    const model = await this.getModel();
    
    const promptRevisao = `Você é um revisor especializado em documentos de licitação conforme a Lei 14.133/2021.

Revise o ${tipoDocumento} abaixo e gere uma VERSÃO MELHORADA do documento.

REGRAS:
1. Mantenha TODAS as informações fornecidas pelo usuário
2. Melhore a redação e formatação
3. Adicione elementos obrigatórios que estejam faltando (com marcador [INFORMAR] onde necessário)
4. Corrija erros de estrutura conforme a Lei 14.133/2021
5. Gere APENAS o documento revisado, sem comentários ou explicações
6. O documento deve estar pronto para uso oficial

DOCUMENTO ATUAL:
${conteudoAtual}

Gere a versão revisada e melhorada:`;

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://licitafacil.com.br',
          'X-Title': 'LicitaFácil',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'user', content: promptRevisao },
          ],
          temperature: 0.5,
          max_tokens: 4000,
        }),
      });

      if (!response.ok) {
        throw new Error(`Erro na API: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || conteudoAtual;
    } catch (error) {
      console.error('Erro ao revisar documento:', error);
      throw error;
    }
  }

  async chatComArquivoComMaxTokens(
    systemPrompt: string,
    imagemBase64?: string,
    mimeType?: string,
    textoExtraido?: string,
    maxTokens = 4000,
  ): Promise<string> {
    return this.chatComArquivo(systemPrompt, imagemBase64, mimeType, textoExtraido, maxTokens);
  }

  async chatComArquivo(
    systemPrompt: string,
    imagemBase64?: string,
    mimeType?: string,
    textoExtraido?: string,
    maxTokens = 4000,
  ): Promise<string> {
    const apiKey = await this.getApiKey();
    const model = await this.getModel();

    let userContent: string | Array<any>;

    if (imagemBase64 && mimeType) {
      if (mimeType === 'application/pdf') {
        userContent = [
          {
            type: 'text',
            text: systemPrompt,
          },
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: imagemBase64,
            },
          },
        ];
      } else {
        userContent = [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imagemBase64}` } },
          { type: 'text', text: systemPrompt },
        ];
      }
    } else {
      userContent = systemPrompt + (textoExtraido ? '\n\nCONTEÚDO DO CONTRATO:\n' + textoExtraido : '');
    }

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://portaldcp.com.br',
          'X-Title': 'Portal DCP',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'user', content: userContent },
          ],
          temperature: 0.2,
          max_tokens: maxTokens,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Erro OpenRouter (chatComArquivo):', error);
        throw new Error(`Erro na API: ${response.status}`);
      }

      const data = await response.json();
      // finish_reason 'length' = a resposta bateu no teto de max_tokens e foi
      // cortada no meio. Sem este aviso o corte passava despercebido: o parser de
      // recuperação salvava os itens completos e os demais sumiam em silêncio
      // (contrato de 38 itens importava 25).
      const finishReason = data.choices?.[0]?.finish_reason;
      if (finishReason === 'length') {
        this.logger.warn(
          `[chatComArquivo] resposta truncada pelo limite de ${maxTokens} tokens — ` +
            'a lista extraída pode estar incompleta',
        );
      }
      return data.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('Erro ao chamar OpenRouter (chatComArquivo):', error);
      throw error;
    }
  }

  /**
   * Extrai texto de um PDF usando pdfjs-dist ou pdf-parse
   */
  async extrairTextoDoPdf(buffer: Buffer): Promise<string> {
    this.logger.log(`[extrairTextoDoPdf] Iniciando extração. Tamanho: ${buffer.length} bytes`);

    // Tentativa 1: pdf-parse (mais compatível com Node.js)
    try {
      this.logger.log('[extrairTextoDoPdf] Tentando pdf-parse...');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParseModule = require('pdf-parse');
      const pdfParse = pdfParseModule?.default || pdfParseModule;

      if (typeof pdfParse !== 'function') {
        throw new Error('pdf-parse não exporta uma função válida');
      }
      
      const result = await pdfParse(buffer, {
        max: 0, // todas as páginas
      });
      
      const textoLimpo = result?.text?.trim() || '';
      this.logger.log(`[extrairTextoDoPdf] pdf-parse extraído: ${textoLimpo.length} caracteres`);
      
      if (textoLimpo.length > 0) {
        return textoLimpo;
      }
    } catch (err: any) {
      this.logger.warn(`[extrairTextoDoPdf] pdf-parse falhou: ${err.message}`);
    }

    // Tentativa 2: pdfjs-dist com configuração mínima
    try {
      this.logger.log('[extrairTextoDoPdf] Tentando pdfjs-dist...');
      
      // Mock de APIs do browser necessárias para pdfjs-dist no Node.js
      if (typeof (globalThis as any).DOMMatrix === 'undefined') {
        (globalThis as any).DOMMatrix = class DOMMatrix {
          a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
          constructor(init?: any) {}
          multiply() { return this; }
          inverse() { return this; }
          translate() { return this; }
          scale() { return this; }
          rotate() { return this; }
        };
      }
      
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfjsLib = require('pdfjs-dist');
      
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
      const pdfDoc = await loadingTask.promise;
      this.logger.log(`[extrairTextoDoPdf] PDF carregado: ${pdfDoc.numPages} páginas`);
      
      let text = '';
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item: any) => item.str || '').join(' ');
        text += pageText + '\n';
      }
      
      const textoLimpo = text.trim();
      this.logger.log(`[extrairTextoDoPdf] pdfjs-dist extraído: ${textoLimpo.length} caracteres`);
      
      if (textoLimpo.length > 0) {
        return textoLimpo;
      }
    } catch (err: any) {
      this.logger.warn(`[extrairTextoDoPdf] pdfjs-dist falhou: ${err.message}`);
    }

    // Tentativa 3: Usar Python (PyPDF2) via exec
    try {
      this.logger.log('[extrairTextoDoPdf] Tentando extrair via Python...');
      const textoViaPython = await this.extrairViaPython(buffer);
      if (textoViaPython.length > 0) {
        return textoViaPython;
      }
    } catch (err: any) {
      this.logger.warn(`[extrairTextoDoPdf] Python falhou: ${err.message}`);
    }

    this.logger.warn('[extrairTextoDoPdf] ⚠️ PDF ESCANEADO DETECTADO: Nenhum texto nativo extraído — todas as 3 tentativas retornaram vazio. Este PDF provavelmente contém apenas imagens escaneadas.');
    return '';
  }

  /**
   * Extrai texto via script Python (PyPDF2) com resolução robusta de path e binário.
   */
  private async extrairViaPython(buffer: Buffer): Promise<string> {
    const os = require('os');
    const path = require('path');
    const fs = require('fs');
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);

    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `pdf-${Date.now()}.pdf`);
    fs.writeFileSync(tempFile, buffer);

    try {
      const scriptCandidates = [
        path.resolve(__dirname, '../../docs/contratos/extrair_texto_pdf.py'),
        path.resolve(process.cwd(), 'docs/contratos/extrair_texto_pdf.py'),
        '/app/docs/contratos/extrair_texto_pdf.py',
      ];

      let pythonScript: string | null = null;
      for (const candidate of scriptCandidates) {
        if (fs.existsSync(candidate)) {
          pythonScript = candidate;
          break;
        }
      }

      if (!pythonScript) {
        throw new Error(`Script Python não encontrado. Candidatos: ${scriptCandidates.join(', ')}`);
      }

      const pythonBinaries = ['python3', 'python'];
      let lastError: Error | null = null;

      for (const bin of pythonBinaries) {
        try {
          const { stdout, stderr } = await execPromise(`${bin} "${pythonScript}" "${tempFile}"`, {
            timeout: 30000,
            maxBuffer: 10 * 1024 * 1024,
          });

          if (stderr && !stdout) {
            throw new Error(stderr);
          }

          const textoLimpo = stdout?.trim() || '';
          this.logger.log(`[extrairViaPython] ${bin} extraído: ${textoLimpo.length} caracteres`);
          return textoLimpo;
        } catch (err: any) {
          lastError = err;
          this.logger.warn(`[extrairViaPython] ${bin} falhou: ${err.message}`);
        }
      }

      throw lastError || new Error('Nenhum binário Python disponível');
    } finally {
      try { fs.unlinkSync(tempFile); } catch { /* ignora */ }
    }
  }

  /**
   * Converte páginas de PDF em imagens PNG usando pdftoppm (poppler-utils).
   * Retorna array de strings base64 (uma por página).
   * Retorna array vazio se pdftoppm não estiver disponível.
   */
  async converterPdfParaImagens(buffer: Buffer, maxPaginas = 15): Promise<string[]> {
    const os = require('os');
    const path = require('path');
    const fs = require('fs');
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-img-'));
    const tempPdf = path.join(tempDir, 'input.pdf');
    const outputPrefix = path.join(tempDir, 'page');

    fs.writeFileSync(tempPdf, buffer);

    try {
      // JPEG a 150 DPI no lugar de PNG a 200: página de contrato escaneado sai
      // com algumas centenas de KB em vez de vários MB, e a leitura por Vision
      // não perde qualidade. Com PNG, 10 páginas estouravam o teto de 30 MB por
      // requisição da API e voltavam 413.
      await execPromise(
        `pdftoppm -jpeg -jpegopt quality=80 -r 150 -l ${maxPaginas} "${tempPdf}" "${outputPrefix}"`,
        { timeout: 60000 },
      );

      const files = fs.readdirSync(tempDir)
        .filter((f: string) => f.startsWith('page') && (f.endsWith('.jpg') || f.endsWith('.jpeg')))
        .sort();

      const imagens: string[] = [];
      for (const file of files) {
        const imgBuffer = fs.readFileSync(path.join(tempDir, file));
        imagens.push(imgBuffer.toString('base64'));
      }

      const totalMb = imagens.reduce((soma, img) => soma + img.length, 0) / (1024 * 1024);
      this.logger.log(
        `[converterPdfParaImagens] Convertidas ${imagens.length} páginas para JPEG (${totalMb.toFixed(1)} MB em base64)`,
      );
      return imagens;
    } catch (err: any) {
      this.logger.warn(`[converterPdfParaImagens] pdftoppm não disponível ou falhou: ${err.message}`);
      return [];
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignora */ }
    }
  }

  /**
   * Envia múltiplas imagens (páginas de PDF) para a IA Vision.
   * Tenta enviar todas de uma vez; se exceder limite, divide em lotes e faz merge de JSON.
   */
  async chatComImagensPdf(
    systemPrompt: string,
    imagensBase64: string[],
    instrucaoBatch = 'Extraia TODOS os itens que encontrar nestas páginas.',
  ): Promise<string> {
    const apiKey = await this.getApiKey();
    const model = await this.getModel();

    if (imagensBase64.length === 0) {
      throw new Error('Nenhuma imagem fornecida para Vision');
    }

    // A API recusa acima de 30 MB por requisição (413). Contar páginas não
    // protege disso — uma página pesada vale por várias leves —, então o lote é
    // fechado por PESO acumulado, com margem para o texto do prompt.
    const MAX_BYTES_POR_LOTE = 20 * 1024 * 1024;
    const MAX_PAGINAS_POR_LOTE = 10;
    const tamanhoDe = (img: string) => Math.ceil((img.length * 3) / 4); // base64 → bytes

    const lotes: string[][] = [];
    let atual: string[] = [];
    let bytesAtual = 0;
    for (const img of imagensBase64) {
      const bytes = tamanhoDe(img);
      const estouraPeso = atual.length > 0 && bytesAtual + bytes > MAX_BYTES_POR_LOTE;
      const estouraPaginas = atual.length >= MAX_PAGINAS_POR_LOTE;
      if (estouraPeso || estouraPaginas) {
        lotes.push(atual);
        atual = [];
        bytesAtual = 0;
      }
      atual.push(img);
      bytesAtual += bytes;
    }
    if (atual.length > 0) lotes.push(atual);

    if (lotes.length === 1) {
      return this.enviarLoteImagens(apiKey, model, systemPrompt, lotes[0]);
    }

    this.logger.log(
      `[chatComImagensPdf] PDF com ${imagensBase64.length} páginas — dividido em ${lotes.length} lotes por tamanho`,
    );
    const partes: string[] = [];

    let paginaInicial = 0;
    for (let idx = 0; idx < lotes.length; idx++) {
      const lote = lotes[idx];
      const i = paginaInicial;
      paginaInicial += lote.length;
      const numeroParte = idx + 1;
      const totalPartes = lotes.length;

      const promptLote = `${systemPrompt}\n\n[Parte ${numeroParte} de ${totalPartes} — páginas ${i + 1} a ${i + lote.length} de ${imagensBase64.length}. ${instrucaoBatch}]`;

      this.logger.log(`[chatComImagensPdf] Enviando lote ${numeroParte}/${totalPartes} (${lote.length} imagens)`);
      const resposta = await this.enviarLoteImagens(apiKey, model, promptLote, lote);
      if (resposta) partes.push(resposta);
    }

    return this.mergeRespostasJson(partes);
  }

  /**
   * Envia um lote de imagens para a API Vision.
   */
  private async enviarLoteImagens(
    apiKey: string,
    model: string,
    prompt: string,
    imagens: string[],
  ): Promise<string> {
    const userContent: Array<any> = [
      { type: 'text', text: prompt },
      ...imagens.map((img) => ({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${img}` },
      })),
    ];

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://portaldcp.com.br',
        'X-Title': 'Portal DCP',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: userContent }],
        temperature: 0.2,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`[enviarLoteImagens] Erro API: ${response.status} — ${error}`);
      throw new Error(`Erro na API: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }

  /**
   * Faz merge inteligente de respostas JSON de múltiplos lotes.
   * Junta arrays de "itens" de cada resposta em um único JSON.
   * Se não for JSON, concatena como texto.
   */
  private mergeRespostasJson(partes: string[]): string {
    if (partes.length === 1) return partes[0];

    const todosItens: any[] = [];
    let observacoes: string[] = [];
    let algumJsonParsed = false;
    let camposBase: Record<string, any> = {};

    for (const parte of partes) {
      try {
        const jsonLimpo = parte.replace(/```json\n?|```/g, '').trim();
        const parsed = JSON.parse(jsonLimpo);

        // Preserve all non-itens/non-observacoes fields from the first successfully parsed batch
        if (!algumJsonParsed) {
          const { itens: _i, observacoes: _o, ...outros } = parsed;
          camposBase = outros;
        }

        algumJsonParsed = true;

        if (Array.isArray(parsed.itens)) {
          todosItens.push(...parsed.itens);
        }
        if (parsed.observacoes) {
          observacoes.push(parsed.observacoes);
        }
      } catch {
        this.logger.warn(`[mergeRespostasJson] Lote não é JSON válido, incluindo como texto`);
        observacoes.push(parte.substring(0, 200));
      }
    }

    if (algumJsonParsed) {
      this.logger.log(`[mergeRespostasJson] Merge de ${partes.length} lotes → ${todosItens.length} itens total`);
      return JSON.stringify({
        ...camposBase,
        itens: todosItens,
        observacoes: observacoes.join(' | '),
      });
    }

    return partes.join('\n\n');
  }

  /**
   * Fallback completo para PDFs escaneados:
   * 1. Tenta converter PDF em imagens via pdftoppm
   * 2. Envia imagens para Vision AI página por página
   * 3. Se pdftoppm não disponível, envia PDF como document (comportamento atual)
   */
  async chatComPdfEscaneado(
    systemPrompt: string,
    pdfBuffer: Buffer,
    instrucaoBatch?: string,
  ): Promise<string> {
    this.logger.log('[chatComPdfEscaneado] PDF escaneado detectado — tentando fallback via imagens');

    const imagens = await this.converterPdfParaImagens(pdfBuffer);

    if (imagens.length > 0) {
      this.logger.log(`[chatComPdfEscaneado] Usando Vision com ${imagens.length} imagens JPEG`);
      return this.chatComImagensPdf(systemPrompt, imagens, instrucaoBatch);
    }

    this.logger.warn('[chatComPdfEscaneado] pdftoppm indisponível — enviando PDF como document (fallback)');
    const pdfBase64 = pdfBuffer.toString('base64');
    return this.chatComArquivo(systemPrompt, pdfBase64, 'application/pdf');
  }

  /**
   * Analisa contrato via chat com IA (suporta PDFs digitais e escaneados)
   */
  async analisarContrato(
    pergunta: string,
    pdfBase64: string,
    pdfTexto?: string,
    historico?: Array<{ role: string; content: string }>,
  ): Promise<string> {
    const apiKey = await this.getApiKey();
    // Usar modelo NVIDIA que suporta PDF nativamente e funcionou nos testes
    const model = 'nvidia/nemotron-3-nano-30b-a3b:free';

    this.logger.log(`[analisarContrato] Iniciando análise. PDF tem texto: ${pdfTexto ? pdfTexto.length : 0} chars. Modelo: ${model}`);

    try {
      let messages: Array<{ role: string; content: any }> = [];

      // Se tem texto suficiente no PDF, usar texto em vez de Vision
      if (pdfTexto && pdfTexto.length >= 50) {
        this.logger.log('[analisarContrato] Usando modo TEXTO (PDF pesquisável)');
        
        const promptTexto = `Você é um especialista em análise de contratos administrativos brasileiros (Lei 14.133/2021).

=== CONTRATO FORNECIDO ===
${pdfTexto.substring(0, 12000)}

=== PERGUNTA DO USUÁRIO ===
${pergunta}

=== INSTRUÇÕES ===
Responda à pergunta acima baseado APENAS no conteúdo do contrato fornecido.
Se a informação não estiver no contrato, diga explicitamente: "Esta informação não foi encontrada no contrato."
Para extração de itens/serviços, liste em formato de tabela markdown.
Use formatação markdown para estruturar a resposta.`;

        messages = [
          { role: 'user', content: promptTexto }
        ];
      } else {
        this.logger.log('[analisarContrato] Usando modo VISION (PDF escaneado) — tentando conversão para imagens');

        const promptVision = `Analise o contrato PDF abaixo e responda:

PERGUNTA: ${pergunta}

INSTRUÇÕES:
- Leia TODO o documento antes de responder
- Responda baseado APENAS no conteúdo do PDF
- Se não encontrar a informação, diga explicitamente
- Para itens/serviços, use tabela markdown
- Destaque valores e datas em negrito`;

        const pdfBuffer = Buffer.from(pdfBase64, 'base64');
        const imagens = await this.converterPdfParaImagens(pdfBuffer);

        if (imagens.length > 0) {
          this.logger.log(`[analisarContrato] Usando ${imagens.length} imagens JPEG para Vision`);
          const userContent: Array<any> = [
            { type: 'text', text: promptVision },
            ...imagens.map((img) => ({
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${img}` },
            })),
          ];
          messages = [{ role: 'user', content: userContent }];
        } else {
          this.logger.warn('[analisarContrato] pdftoppm indisponível — enviando PDF como document (fallback)');
          const userContent = [
            { type: 'text', text: promptVision },
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64,
              },
            },
          ];
          messages = [{ role: 'user', content: userContent }];
        }
      }

      // Adicionar histórico se existir (apenas as últimas 4 mensagens para não estourar contexto)
      if (historico && historico.length > 0) {
        const ultimasMensagens = historico.slice(-4);
        // Inserir histórico antes da última mensagem
        messages = [
          ...ultimasMensagens.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
          messages[0]
        ];
      }

      this.logger.log(`[analisarContrato] Enviando ${messages.length} mensagens para API`);

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://portaldcp.com.br',
          'X-Title': 'Portal DCP',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          max_tokens: 4000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`[analisarContrato] Erro API: ${response.status} - ${errorText}`);
        throw new Error(`Erro na API: ${response.status}`);
      }

      const data = await response.json();
      const resposta = data.choices[0]?.message?.content || 'Não foi possível analisar o contrato.';
      
      this.logger.log(`[analisarContrato] Resposta recebida: ${resposta.length} caracteres`);
      
      return resposta;
    } catch (error) {
      this.logger.error(`[analisarContrato] Erro: ${error.message}`);
      throw error;
    }
  }

  // =========================================================================
  // GERAÇÃO ESTRUTURADA (JSON tipado) — Lei 14.133/2021
  // =========================================================================

  /**
   * Extrai JSON de uma resposta da IA, removendo cercas markdown (```json ... ```)
   * e textos antes/depois do bloco JSON, retornando objeto tipado.
   */
  extrairJsonDeResposta<T>(resposta: string): T {
    if (!resposta || typeof resposta !== 'string') {
      throw new Error('Resposta vazia ou inválida da IA');
    }

    let limpo = resposta.trim();

    // Remove cercas markdown ```json ... ``` ou ``` ... ```
    limpo = limpo.replace(/^```(?:json|JSON)?\s*/i, '').replace(/```\s*$/i, '').trim();

    // Tenta parse direto
    try {
      return JSON.parse(limpo) as T;
    } catch {
      // Fallback: extrai primeiro objeto/array JSON balanceado
      const matchObj = limpo.match(/\{[\s\S]*\}/);
      const matchArr = limpo.match(/\[[\s\S]*\]/);
      const candidato = matchObj?.[0] || matchArr?.[0];
      if (!candidato) {
        throw new Error('Resposta da IA não contém JSON válido');
      }
      try {
        return JSON.parse(candidato) as T;
      } catch (err: any) {
        throw new Error(`Falha ao fazer parse do JSON da IA: ${err.message}`);
      }
    }
  }

  /**
   * Invoca a IA solicitando uma resposta estritamente em JSON.
   * Reaproveita a configuração padrão (OpenRouter) sem alterar o chat conversacional.
   */
  private async chatJson(systemPrompt: string, userPrompt: string): Promise<string> {
    const apiKey = await this.getApiKey();
    const model = await this.getModel();

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://portaldcp.com.br',
        'X-Title': 'Portal DCP',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`[chatJson] Erro OpenRouter: ${response.status} — ${error}`);
      throw new Error(`Erro na API de IA: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  /**
   * Gera ETP estruturado (JSON tipado conforme EtpDados — 13 incisos do Art. 18, §1º).
   */
  async gerarEtpEstruturado(contexto: string): Promise<EtpDados> {
    const systemPrompt = `Você é um especialista sênior em Estudos Técnicos Preliminares (ETP) conforme a Lei 14.133/2021 (Art. 18, §1º) e IN SEGES/ME 81/2022.

Sua tarefa é PREENCHER um JSON estruturado contendo TODOS os 13 incisos do ETP com conteúdo técnico REAL e SUBSTANCIAL.

REGRAS ABSOLUTAS:
1. Retorne APENAS um objeto JSON válido — SEM markdown, SEM cercas \`\`\`, SEM texto antes ou depois do JSON.
2. NUNCA use "[INFORMAR]", "[PREENCHER]" ou qualquer placeholder. Gere conteúdo técnico real baseado no objeto.
3. Para valores numéricos desconhecidos (valor total, quantidades exatas): use estimativa técnica razoável; o campo "metodo_calculo" deve mencionar "estimativa baseada em referências SINAPI/mercado — confirmar na pesquisa de preços".
4. Para dados pessoais/institucionais (nome, matrícula, dotação): use string vazia "" — o formulário tem campos separados para isso.
5. Para textos: mínimo 80 caracteres por campo, conteúdo específico ao objeto (cite normas, processos, requisitos reais).
6. Cite artigos da Lei 14.133/2021 e normas técnicas aplicáveis (ex: SINAPI, NBR 9050, NR-18).
7. Se o objeto envolve engenharia/obras: aplique conhecimento técnico de engenharia civil (NBR 5626, NBR 8160, CREA, BDI, fases de obra).

SCHEMA EXATO (chaves obrigatórias):
{
  "descricao_necessidade": "string (I — Art. 18, §1º)",
  "previsao_pca": {
    "consta_no_pca": boolean,
    "pca_id": "string opcional",
    "item_pca": "string opcional",
    "justificativa_se_nao": "string opcional (obrigatória se consta_no_pca=false)"
  },
  "requisitos_contratacao": "string (III)",
  "estimativas_quantidades": {
    "descricao": "string (IV)",
    "memoria_calculo": "string",
    "documentos_suporte": ["string"]
  },
  "levantamento_mercado": {
    "alternativas_analisadas": [
      { "descricao": "string", "vantagens": "string", "desvantagens": "string" }
    ],
    "solucao_escolhida": "string",
    "justificativa_tecnica": "string",
    "justificativa_economica": "string"
  },
  "estimativa_valor": {
    "valor_total": number,
    "moeda": "BRL",
    "metodo_calculo": "string",
    "referencia_pesquisa_id": "string opcional"
  },
  "descricao_solucao": "string (VII)",
  "justificativa_parcelamento": {
    "tipo": "PARCELADO" | "INTEGRAL",
    "justificativa": "string"
  },
  "resultados_pretendidos": "string (IX)",
  "providencias_previas": "string (X)",
  "contratacoes_correlatas": [
    { "numero_processo": "string opcional", "descricao": "string", "tipo_relacao": "CORRELATA" | "INTERDEPENDENTE" }
  ],
  "impactos_ambientais": {
    "aplicavel": boolean,
    "impactos_identificados": "string opcional",
    "medidas_mitigadoras": "string opcional",
    "criterios_sustentabilidade": "string opcional"
  },
  "posicionamento_conclusivo": {
    "contratacao_viavel": boolean,
    "justificativa": "string",
    "recomendacoes": "string opcional"
  }
}`;

    // Seleciona o exemplo few-shot mais relevante para o domínio do objeto
    const palavrasChave = contexto.split(/\s+/).slice(0, 30);
    const fewShot = getEtpFewShotContext(palavrasChave);

    const userPrompt = `EXEMPLOS DE REFERÊNCIA (ETPs reais de alta qualidade — siga este padrão de conteúdo):
${fewShot}

---
Agora gere o ETP para o seguinte OBJETO:
${contexto}

IMPORTANTE:
- Adapte o conteúdo ao objeto específico acima — não copie os exemplos
- Siga o mesmo nível de detalhamento técnico e substancial dos exemplos
- Retorne APENAS o JSON válido conforme o schema. Sem markdown. Sem texto fora do JSON.`;

    const resposta = await this.chatJson(systemPrompt, userPrompt);
    return this.extrairJsonDeResposta<EtpDados>(resposta);
  }

  /**
   * Gera TR estruturado (JSON tipado conforme TrDados — 11 elementos do Art. 6º, XXIII).
   */
  async gerarTrEstruturado(contexto: string): Promise<TrDados> {
    const systemPrompt = `Você é um especialista sênior em Termo de Referência (TR) conforme a Lei 14.133/2021 (Art. 6º, XXIII).

Sua tarefa é PREENCHER um JSON estruturado com conteúdo técnico REAL e SUBSTANCIAL para todos os 11 elementos do TR.

REGRAS ABSOLUTAS:
1. Retorne APENAS um objeto JSON válido — SEM markdown, SEM cercas \`\`\`, SEM texto antes/depois.
2. NUNCA use "[INFORMAR]", "[PREENCHER]" ou placeholders. Gere conteúdo específico ao objeto.
3. Para dados pessoais (nome do fiscal, gestor): use string vazia "" — são preenchidos pelo servidor.
4. Para dotação orçamentária, elemento de despesa: use valores típicos da natureza do objeto (ex: obras=44905139, serviços=33903900).
5. Textos: mínimo 80 caracteres, específicos ao domínio do objeto. Cite normas reais.
6. Prazo de pagamento: 30 dias após medição (padrão mercado público).
7. Se objeto é obra/serviço de engenharia: use modalidade CONCORRENCIA ou DISPENSA_ELETRONICA conforme valor, periodicidade POR_ETAPA.

SCHEMA EXATO:
{
  "definicao_objeto": {
    "natureza": "string",
    "descricao_detalhada": "string",
    "prazo_contrato_meses": number,
    "permite_prorrogacao": boolean,
    "limite_prorrogacao": "string opcional"
  },
  "fundamentacao_contratacao": "string",
  "descricao_solucao": "string",
  "requisitos_contratacao": {
    "requisitos_gerais": "string",
    "sustentabilidade": "string opcional",
    "acessibilidade": "string opcional",
    "seguranca": "string opcional"
  },
  "modelo_execucao": "string",
  "modelo_gestao": {
    "descricao": "string",
    "fiscal_titular": "string opcional",
    "fiscal_substituto": "string opcional",
    "gestor_contrato": "string opcional"
  },
  "criterios_medicao_pagamento": {
    "forma_medicao": "string",
    "periodicidade": "MENSAL" | "QUINZENAL" | "POR_ENTREGA" | "POR_ETAPA" | "OUTRA",
    "forma_pagamento": "string",
    "prazo_pagamento_dias": number,
    "instrumento_medicao": "string opcional"
  },
  "forma_criterios_selecao": {
    "modalidade": "string (PREGAO, DISPENSA_ELETRONICA, CONCORRENCIA, etc.)",
    "criterio_julgamento": "string (MENOR_PRECO, TECNICA_E_PRECO, etc.)",
    "modo_disputa": "string",
    "requisitos_habilitacao": {
      "juridica": ["string"],
      "fiscal_trabalhista": ["string"],
      "tecnica": ["string"],
      "economica_financeira": ["string"]
    }
  },
  "estimativas_valor": {
    "valor_total": number,
    "valor_unitario_medio": number,
    "referencia_pesquisa_id": "string opcional",
    "sigilo_orcamento": boolean,
    "justificativa_sigilo": "string opcional (obrigatória se sigilo_orcamento=true)"
  },
  "adequacao_orcamentaria": {
    "fonte_recurso": "string",
    "elemento_despesa": "string",
    "dotacao_orcamentaria": "string",
    "exercicio_financeiro": number
  },
  "quantitativos": [
    { "item_numero": number, "descricao": "string", "quantidade": number, "unidade": "string", "valor_unitario_estimado": number }
  ]
}`;

    const userPrompt = `Com base no CONTEXTO abaixo, gere o TR completo em JSON conforme o schema do system prompt.

CONTEXTO:
${contexto}

Retorne APENAS o JSON. Sem markdown. Sem texto fora do JSON.`;

    const resposta = await this.chatJson(systemPrompt, userPrompt);
    return this.extrairJsonDeResposta<TrDados>(resposta);
  }

  /**
   * Gera Pesquisa de Preços estruturada (JSON tipado conforme PesquisaPrecosDados — Art. 23 + IN 65/2021).
   */
  async gerarPesquisaPrecosEstruturada(contexto: string): Promise<PesquisaPrecosDados> {
    const systemPrompt = `Você é um especialista em Pesquisa de Preços para licitações conforme Art. 23 da Lei 14.133/2021 e IN SEGES/ME 65/2021.

Sua tarefa é PREENCHER um JSON estruturado com itens e cotações REAIS de mercado para o objeto descrito.

REGRAS ABSOLUTAS:
1. Retorne APENAS um objeto JSON válido — SEM markdown, SEM cercas \`\`\`, SEM texto fora do JSON.
2. Cada item deve ter EXATAMENTE 3 cotações de fontes DISTINTAS — obrigatório.
3. Para CNPJs: use "" (vazio) — o usuário preencherá após pesquisa real.
4. Para valores: estime com base em referências SINAPI ou preços típicos de mercado para o objeto; registre a fonte em "descricao_fonte".
5. Use data_pesquisa = data atual aproximada (formato YYYY-MM-DD).
6. Metodologia padrão: MEDIANA (mais robusta que média em contratos públicos).
7. Gere itens que façam sentido para o objeto — não gere itens genéricos.

Tipos válidos para "fonte":
PAINEL_DE_PRECOS, PNCP, CONTRATO_VIGENTE_SISTEMA, MIDIA_ESPECIALIZADA, FORNECEDOR_DIRETO, NOTA_FISCAL_ELETRONICA, OUTRA

SCHEMA EXATO:
{
  "itens": [
    {
      "item_numero": number,
      "descricao": "string",
      "quantidade": number,
      "unidade": "string",
      "cotacoes": [
        {
          "fonte": "PAINEL_DE_PRECOS|PNCP|CONTRATO_VIGENTE_SISTEMA|MIDIA_ESPECIALIZADA|FORNECEDOR_DIRETO|NOTA_FISCAL_ELETRONICA|OUTRA",
          "descricao_fonte": "string",
          "url_referencia": "string opcional",
          "data_pesquisa": "YYYY-MM-DD",
          "fornecedor_cnpj": "string opcional (obrigatório se fonte=FORNECEDOR_DIRETO)",
          "fornecedor_razao_social": "string opcional",
          "valor_unitario": number,
          "observacao": "string opcional"
        }
      ],
      "metodologia": "MEDIA" | "MEDIANA" | "MENOR_VALOR" | "OUTRA",
      "justificativa_metodologia": "string opcional (obrigatória se OUTRA)",
      "valor_referencial": number
    }
  ],
  "metodologia_geral": "string opcional",
  "observacoes": "string opcional",
  "valor_total_estimado": number
}`;

    const userPrompt = `Com base no CONTEXTO abaixo, gere a Pesquisa de Preços completa em JSON conforme o schema do system prompt.

CONTEXTO:
${contexto}

Retorne APENAS o JSON. Sem markdown. Sem texto fora do JSON.`;

    const resposta = await this.chatJson(systemPrompt, userPrompt);
    return this.extrairJsonDeResposta<PesquisaPrecosDados>(resposta);
  }

  /**
   * Gera Matriz de Riscos estruturada (JSON tipado conforme MatrizRiscosDados — Art. 22 da Lei 14.133/2021).
   */
  async gerarMatrizRiscosEstruturada(contexto: string): Promise<MatrizRiscosDados> {
    const systemPrompt = `Você é um especialista em Gestão de Riscos em Contratos Públicos conforme Art. 22 da Lei 14.133/2021.

Sua tarefa é PREENCHER um JSON estruturado com riscos ESPECÍFICOS ao objeto descrito, com probabilidade e impacto fundamentados.

REGRAS ABSOLUTAS:
1. Retorne APENAS um objeto JSON válido — SEM markdown, SEM cercas \`\`\`, SEM texto fora do JSON.
2. Gere mínimo 6 riscos realistas e específicos ao domínio do objeto.
3. Cubra pelo menos 4 categorias distintas de risco.
4. probabilidade e impacto: inteiros de 1 a 5 (1=muito baixa/o, 5=muito alta/o). Calcule grau = P×I.
5. Ações preventivas e de contingência: conteúdo técnico real, não genérico.
6. Para obras: inclua riscos de segurança do trabalho (NR-18), prazo, custo de materiais, interferência de terceiros.
5. Cada risco deve ter descricao, causa, consequencia, acoes_preventivas e acoes_contingencia preenchidos.

Categorias válidas:
TECNICO, JURIDICO, ECONOMICO_FINANCEIRO, OPERACIONAL, AMBIENTAL, SEGURANCA_TRABALHO, IMAGEM_REPUTACAO, EXTERNO_FORCA_MAIOR

Responsável (alocação Art. 22, §1º): CONTRATANTE | CONTRATADO | AMBOS
Fase aplicável: PLANEJAMENTO | SELECAO | EXECUCAO | TODAS
Status: IDENTIFICADO | EM_TRATAMENTO | MITIGADO | MATERIALIZADO | ENCERRADO

SCHEMA EXATO:
{
  "riscos": [
    {
      "id": "string (UUID ou identificador)",
      "numero": number,
      "categoria": "TECNICO|JURIDICO|ECONOMICO_FINANCEIRO|OPERACIONAL|AMBIENTAL|SEGURANCA_TRABALHO|IMAGEM_REPUTACAO|EXTERNO_FORCA_MAIOR",
      "descricao": "string (o que pode acontecer)",
      "causa": "string (por que pode acontecer)",
      "consequencia": "string (impacto se ocorrer)",
      "fase_aplicavel": "PLANEJAMENTO|SELECAO|EXECUCAO|TODAS",
      "probabilidade": 1|2|3|4|5,
      "impacto": 1|2|3|4|5,
      "responsavel": "CONTRATANTE|CONTRATADO|AMBOS",
      "acoes_preventivas": "string",
      "acoes_contingencia": "string",
      "responsavel_monitoramento": "string opcional",
      "status": "IDENTIFICADO|EM_TRATAMENTO|MITIGADO|MATERIALIZADO|ENCERRADO",
      "observacoes": "string opcional"
    }
  ],
  "resumo_executivo": "string opcional"
}`;

    const userPrompt = `Com base no CONTEXTO abaixo, gere a Matriz de Riscos completa em JSON conforme o schema do system prompt.

CONTEXTO:
${contexto}

Retorne APENAS o JSON. Sem markdown. Sem texto fora do JSON.`;

    const resposta = await this.chatJson(systemPrompt, userPrompt);
    return this.extrairJsonDeResposta<MatrizRiscosDados>(resposta);
  }
}
