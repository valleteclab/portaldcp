import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SystemConfigService } from '../system-config/system-config.service';

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
    
    // Prompt específico para GERAÇÃO de documento (botão "Gerar com IA")
    const promptGeracao = `Você é um especialista em documentos de licitação conforme a Lei 14.133/2021.

Gere um ${tipoDocumento} COMPLETO e PROFISSIONAL com base nas informações fornecidas pelo usuário.

REGRAS:
1. Gere APENAS o documento, sem introduções como "Aqui está", "Segue abaixo", etc.
2. Use formatação profissional com seções numeradas
3. Preencha todos os campos obrigatórios do ${tipoDocumento}
4. Use as informações fornecidas pelo usuário
5. Para campos não informados, use marcadores como [INFORMAR] para o usuário completar depois
6. O documento deve estar pronto para uso oficial

Estrutura do ETP conforme Art. 18, §1º da Lei 14.133/2021:
1. DESCRIÇÃO DA NECESSIDADE
2. ÁREA REQUISITANTE
3. REQUISITOS DA CONTRATAÇÃO
4. ESTIMATIVA DE QUANTIDADES
5. LEVANTAMENTO DE MERCADO
6. ESTIMATIVA DE VALOR
7. DESCRIÇÃO DA SOLUÇÃO
8. JUSTIFICATIVA DO PARCELAMENTO
9. RESULTADOS PRETENDIDOS
10. ANÁLISE DE RISCOS
11. PROVIDÊNCIAS PARA ADEQUAÇÃO`;
    
    const mensagemUsuario = objeto 
      ? `Objeto da licitação: ${objeto}\n\nInformações fornecidas: ${contexto}`
      : contexto;

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
      return data.choices[0]?.message?.content || 'Não foi possível gerar o conteúdo.';
    } catch (error) {
      console.error('Erro ao chamar OpenRouter:', error);
      throw error;
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

  async chatComArquivo(
    systemPrompt: string,
    imagemBase64?: string,
    mimeType?: string,
    textoExtraido?: string,
  ): Promise<string> {
    const apiKey = await this.getApiKey();
    const model = await this.getModel();

    let userContent: string | Array<any>;

    if (imagemBase64 && mimeType) {
      if (mimeType === 'application/pdf') {
        // Claude/OpenRouter aceita PDF como tipo "document"
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
        // Imagem (JPG, PNG, etc.)
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
          max_tokens: 4000,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Erro OpenRouter (chatComArquivo):', error);
        throw new Error(`Erro na API: ${response.status}`);
      }

      const data = await response.json();
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

    // Tentativa 1: pdfjs-dist - usar caminho correto para v5.x
    try {
      this.logger.log('[extrairTextoDoPdf] Tentando pdfjs-dist...');
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

    // Tentativa 2: pdf-parse
    try {
      this.logger.log('[extrairTextoDoPdf] Tentando pdf-parse...');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('pdf-parse');
      const fn = typeof mod === 'function' ? mod : (mod.default ?? null);
      if (fn) {
        const result = await fn(buffer);
        const textoLimpo = result?.text?.trim() || '';
        this.logger.log(`[extrairTextoDoPdf] pdf-parse extraído: ${textoLimpo.length} caracteres`);
        if (textoLimpo.length > 0) return textoLimpo;
      }
    } catch (err: any) {
      this.logger.warn(`[extrairTextoDoPdf] pdf-parse falhou: ${err.message}`);
    }

    this.logger.warn('[extrairTextoDoPdf] Nenhum texto extraído');
    return '';
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
        // PDF escaneado - usar formato nativo de documento do Claude
        this.logger.log('[analisarContrato] Usando modo VISION (PDF escaneado)');
        
        // Formato nativo do Claude para documentos (funciona com :beta)
        const userContent = [
          {
            type: 'text',
            text: `Analise o contrato PDF abaixo e responda:

PERGUNTA: ${pergunta}

INSTRUÇÕES:
- Leia TODO o documento antes de responder
- Responda baseado APENAS no conteúdo do PDF
- Se não encontrar a informação, diga explicitamente
- Para itens/serviços, use tabela markdown
- Destaque valores e datas em negrito`,
          },
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
}
