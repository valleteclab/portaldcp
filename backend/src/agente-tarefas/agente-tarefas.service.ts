import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SystemConfigService } from '../system-config/system-config.service';
import { UsuariosService } from '../usuarios/usuarios.service';
import { RequisicaoService } from '../almoxarifado/requisicao.service';
import { ItemContratoService } from '../almoxarifado/item-contrato.service';
import { ContratosService } from '../contratos/contratos.service';
import { RelatoriosService } from '../relatorios/relatorios.service';
import { Usuario, RoleUsuario } from '../usuarios/entities/usuario.entity';
import { JwtPayload, UserType } from '../auth/auth.service';
import { StatusRequisicao, TipoRequisicao } from '../almoxarifado/entities/requisicao.entity';
import { CategoriaContrato, StatusContrato } from '../contratos/entities/contrato.entity';

interface OpenRouterTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ChatResult {
  resposta: string;
  tools_usadas: string[];
}

@Injectable()
export class AgenteTarefasService {
  private readonly logger = new Logger(AgenteTarefasService.name);
  private readonly apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
  private readonly defaultModel = 'anthropic/claude-3.5-sonnet';

  constructor(
    private readonly configService: ConfigService,
    private readonly systemConfigService: SystemConfigService,
    private readonly usuariosService: UsuariosService,
    private readonly requisicaoService: RequisicaoService,
    private readonly itemContratoService: ItemContratoService,
    private readonly contratosService: ContratosService,
    private readonly relatoriosService: RelatoriosService,
  ) {}

  private async getApiKey(): Promise<string> {
    const iaConfig = await this.systemConfigService.getIaConfig();
    if (iaConfig.apiKey) return iaConfig.apiKey;
    const key = this.configService.get<string>('OPENROUTER_API_KEY');
    if (!key) throw new Error('API Key de IA não configurada.');
    return key;
  }

  private async getModel(): Promise<string> {
    const iaConfig = await this.systemConfigService.getIaConfig();
    return iaConfig.modelo || this.defaultModel;
  }

  private buildTools(usuario: Usuario): OpenRouterTool[] {
    const tools: OpenRouterTool[] = [];

    // Todos os usuários podem listar e criar requisições
    tools.push({
      type: 'function',
      function: {
        name: 'listar_requisicoes',
        description: 'Lista requisições do órgão. Pode filtrar por status e tipo.',
        parameters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: Object.values(StatusRequisicao),
              description: 'Status da requisição para filtrar (opcional)',
            },
            tipo: {
              type: 'string',
              enum: Object.values(TipoRequisicao),
              description: 'Tipo da requisição para filtrar (opcional)',
            },
            limite: {
              type: 'number',
              description: 'Quantidade máxima de resultados (padrão: 20)',
            },
          },
          required: [],
        },
      },
    });

    tools.push({
      type: 'function',
      function: {
        name: 'listar_contratos',
        description:
          'Lista contratos vigentes do órgão disponíveis para criar requisições. ' +
          'Use SEMPRE antes de criar uma requisição para o usuário escolher o contrato. ' +
          'Filtre por categoria: COMPRAS para materiais, SERVICOS para serviços.',
        parameters: {
          type: 'object',
          properties: {
            categoria: {
              type: 'string',
              enum: Object.values(CategoriaContrato),
              description: 'Categoria do contrato para filtrar (ex: COMPRAS para materiais)',
            },
          },
          required: [],
        },
      },
    });

    tools.push({
      type: 'function',
      function: {
        name: 'listar_itens_contrato',
        description:
          'Lista os itens disponíveis de um contrato específico, com saldo e valor unitário. ' +
          'Use SEMPRE após o usuário escolher o contrato e ANTES de criar a requisição, ' +
          'para o usuário escolher os itens e as quantidades desejadas.',
        parameters: {
          type: 'object',
          properties: {
            contrato_id: {
              type: 'string',
              description: 'ID (UUID) do contrato cujos itens devem ser listados',
            },
          },
          required: ['contrato_id'],
        },
      },
    });

    tools.push({
      type: 'function',
      function: {
        name: 'criar_requisicao',
        description:
          'Cria uma nova requisição de material ou serviço vinculada a um contrato. ' +
          'ATENÇÃO: SEMPRE siga o fluxo: 1) listar_contratos → 2) usuário escolhe o contrato → ' +
          '3) listar_itens_contrato → 4) usuário escolhe itens e quantidades → ' +
          '5) confirmar com o usuário → 6) criar_requisicao. ' +
          'Nunca crie sem contrato_id e itens confirmados pelo usuário.',
        parameters: {
          type: 'object',
          properties: {
            contrato_id: {
              type: 'string',
              description: 'ID (UUID) do contrato selecionado pelo usuário',
            },
            setor_solicitante: {
              type: 'string',
              description: 'Nome do setor solicitante',
            },
            justificativa: {
              type: 'string',
              description: 'Justificativa para a requisição',
            },
            tipo: {
              type: 'string',
              enum: ['MATERIAL', 'SERVICO'],
              description: 'Tipo da requisição',
            },
            prioridade: {
              type: 'string',
              enum: ['BAIXA', 'NORMAL', 'ALTA', 'URGENTE'],
              description: 'Prioridade (padrão: NORMAL)',
            },
            data_necessidade: {
              type: 'string',
              description: 'Data de necessidade no formato YYYY-MM-DD (opcional)',
            },
            itens: {
              type: 'array',
              description: 'Lista de itens do contrato a solicitar (obrigatório)',
              items: {
                type: 'object',
                properties: {
                  item_contrato_id: {
                    type: 'string',
                    description: 'ID (UUID) do item do contrato',
                  },
                  numero_item: {
                    type: 'number',
                    description: 'Número do item no contrato',
                  },
                  descricao: {
                    type: 'string',
                    description: 'Descrição do item',
                  },
                  quantidade_solicitada: {
                    type: 'number',
                    description: 'Quantidade solicitada (não pode exceder o saldo disponível)',
                  },
                  unidade_medida: {
                    type: 'string',
                    description: 'Unidade de medida do item',
                  },
                  valor_unitario: {
                    type: 'number',
                    description: 'Valor unitário do item',
                  },
                },
                required: ['item_contrato_id', 'numero_item', 'descricao', 'quantidade_solicitada'],
              },
            },
          },
          required: ['contrato_id', 'setor_solicitante', 'justificativa', 'tipo', 'itens'],
        },
      },
    });

    // Usuários com permissão de gerenciar OS
    if (usuario.pode_gerenciar_os || usuario.role === RoleUsuario.ADMIN) {
      tools.push({
        type: 'function',
        function: {
          name: 'listar_os',
          description: 'Lista Ordens de Serviço (OS) do órgão, com filtro de status opcional.',
          parameters: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: Object.values(StatusRequisicao),
                description: 'Status da OS para filtrar (opcional)',
              },
              limite: {
                type: 'number',
                description: 'Quantidade máxima de resultados (padrão: 20)',
              },
            },
            required: [],
          },
        },
      });

      tools.push({
        type: 'function',
        function: {
          name: 'criar_os',
          description:
            'Cria uma nova Ordem de Serviço. SEMPRE confirme os dados com o usuário antes de criar.',
          parameters: {
            type: 'object',
            properties: {
              descricao_os: {
                type: 'string',
                description: 'Descrição detalhada da ordem de serviço',
              },
              local_execucao: {
                type: 'string',
                description: 'Local onde o serviço será executado',
              },
              setor_solicitante: {
                type: 'string',
                description: 'Setor que está solicitando a OS',
              },
              prazo_execucao_dias: {
                type: 'number',
                description: 'Prazo em dias para execução do serviço',
              },
              justificativa: {
                type: 'string',
                description: 'Justificativa para abertura da OS',
              },
            },
            required: ['descricao_os', 'local_execucao', 'setor_solicitante', 'justificativa'],
          },
        },
      });
    }

    // Usuários com permissão de aprovar requisições
    if (usuario.pode_aprovar_requisicoes || usuario.role === RoleUsuario.ADMIN) {
      tools.push({
        type: 'function',
        function: {
          name: 'listar_aprovacoes',
          description: 'Lista requisições pendentes de aprovação (status: AGUARDANDO_AUTORIZACAO).',
          parameters: {
            type: 'object',
            properties: {
              limite: {
                type: 'number',
                description: 'Quantidade máxima de resultados (padrão: 20)',
              },
            },
            required: [],
          },
        },
      });

      tools.push({
        type: 'function',
        function: {
          name: 'aprovar_requisicao',
          description: 'Aprova uma requisição pendente de aprovação.',
          parameters: {
            type: 'object',
            properties: {
              requisicao_id: {
                type: 'string',
                description: 'ID (UUID) da requisição a ser aprovada',
              },
              observacao: {
                type: 'string',
                description: 'Observação ou justificativa da aprovação (opcional)',
              },
            },
            required: ['requisicao_id'],
          },
        },
      });

      tools.push({
        type: 'function',
        function: {
          name: 'negar_requisicao',
          description: 'Nega/rejeita uma requisição pendente de aprovação.',
          parameters: {
            type: 'object',
            properties: {
              requisicao_id: {
                type: 'string',
                description: 'ID (UUID) da requisição a ser negada',
              },
              motivo: {
                type: 'string',
                description: 'Motivo da negação (obrigatório)',
              },
            },
            required: ['requisicao_id', 'motivo'],
          },
        },
      });
    }

    // Relatórios: ADMIN ou PREGOEIRO
    if (
      usuario.role === RoleUsuario.ADMIN ||
      usuario.role === RoleUsuario.PREGOEIRO
    ) {
      tools.push({
        type: 'function',
        function: {
          name: 'pedir_relatorio',
          description:
            'Solicita e retorna um relatório do sistema. Tipos: licitacoes (eficiência de compras), contratos (saúde financeira), almoxarifado (consumo).',
          parameters: {
            type: 'object',
            properties: {
              tipo: {
                type: 'string',
                enum: ['licitacoes', 'contratos', 'almoxarifado'],
                description: 'Tipo de relatório a gerar',
              },
              ano: {
                type: 'number',
                description: 'Ano para filtrar o relatório (opcional, padrão: ano atual)',
              },
            },
            required: ['tipo'],
          },
        },
      });
    }

    return tools;
  }

  private buildSystemPrompt(usuario: Usuario): string {
    const permissoes: string[] = ['Ver e criar requisições'];
    if (usuario.pode_gerenciar_os || usuario.role === RoleUsuario.ADMIN) {
      permissoes.push('Gerenciar Ordens de Serviço');
    }
    if (usuario.pode_aprovar_requisicoes || usuario.role === RoleUsuario.ADMIN) {
      permissoes.push('Aprovar/negar requisições');
    }
    if (
      usuario.role === RoleUsuario.ADMIN ||
      usuario.role === RoleUsuario.PREGOEIRO
    ) {
      permissoes.push('Solicitar relatórios');
    }

    const orgaoNome = usuario.orgao?.nome || 'órgão';

    return `Você é o Assistente IA do Portal DCP — um assistente inteligente para gestão pública.

Usuário logado: ${usuario.nome}
Cargo: ${usuario.cargo || usuario.role}
Órgão: ${orgaoNome}
Permissões: ${permissoes.join(', ')}

SUAS RESPONSABILIDADES:
1. Ajudar o usuário a realizar tarefas no sistema usando as ferramentas disponíveis
2. Responder perguntas sobre o sistema de forma clara e objetiva
3. SEMPRE confirmar com o usuário antes de criar ou modificar dados
4. Apresentar listas de dados em formato de tabela Markdown quando houver múltiplos registros

FLUXO OBRIGATÓRIO PARA CRIAR REQUISIÇÃO DE MATERIAL OU SERVIÇO:
Nunca pule etapas. Siga rigorosamente esta ordem:
1. Chame listar_contratos (filtrando por categoria adequada: COMPRAS para material, SERVICOS para serviço)
2. Apresente os contratos disponíveis e AGUARDE o usuário escolher um
3. Chame listar_itens_contrato com o contrato escolhido
4. Apresente os itens disponíveis (com saldo e valor unitário) e AGUARDE o usuário escolher quais itens e as quantidades desejadas
5. Pergunte o setor solicitante, justificativa, prioridade e data de necessidade (se não informados)
6. Confirme TODOS os dados com o usuário (contrato, itens, quantidades, setor, justificativa)
7. Somente após confirmação, chame criar_requisicao com contrato_id e itens preenchidos

REGRAS IMPORTANTES:
- Responda SEMPRE em português brasileiro
- Seja objetivo e direto
- NUNCA chame criar_requisicao sem ter contrato_id e itens confirmados pelo usuário
- Ao apresentar itens, mostre em tabela: Nº | Descrição | Unidade | Saldo disponível | Valor unitário
- Itens com saldo zero não podem ser solicitados — informe isso ao usuário
- Para ações irreversíveis (criar requisição, criar OS, aprovar/negar), sempre confirme antes
- Se o usuário não tiver permissão para uma ação, informe educadamente
- Use os IDs retornados pelas ferramentas para ações subsequentes

Hoje é: ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
  }

  private async executarFerramenta(
    nome: string,
    args: Record<string, unknown>,
    usuario: Usuario,
    orgaoId: string,
  ): Promise<string> {
    try {
      switch (nome) {
        case 'listar_requisicoes': {
          const limite = (args.limite as number) || 20;
          const statusArg = args.status as StatusRequisicao | undefined;
          const tipoArg = args.tipo as TipoRequisicao | undefined;

          const requisicoes = await this.requisicaoService.findAll({
            orgaoId,
            status: statusArg,
          });

          const filtradas = tipoArg
            ? requisicoes.filter((r) => r.tipo === tipoArg).slice(0, limite)
            : requisicoes.slice(0, limite);

          if (filtradas.length === 0) {
            return 'Nenhuma requisição encontrada com os filtros informados.';
          }

          return JSON.stringify(
            filtradas.map((r) => ({
              id: r.id,
              numero: r.numero,
              tipo: r.tipo,
              status: r.status,
              setor: r.setor_solicitante,
              valor_estimado: r.valor_total_estimado,
              data_solicitacao: r.data_solicitacao,
            })),
          );
        }

        case 'listar_os': {
          const limite = (args.limite as number) || 20;
          const statusArg = args.status as StatusRequisicao | undefined;

          const requisicoes = await this.requisicaoService.findAll({
            orgaoId,
            status: statusArg,
          });

          const ordens = requisicoes
            .filter((r) => r.tipo === TipoRequisicao.ORDEM_SERVICO)
            .slice(0, limite);

          if (ordens.length === 0) {
            return 'Nenhuma Ordem de Serviço encontrada.';
          }

          return JSON.stringify(
            ordens.map((r) => ({
              id: r.id,
              numero: r.numero,
              status: r.status,
              descricao: r.descricao_os,
              local_execucao: r.local_execucao,
              setor: r.setor_solicitante,
              data_solicitacao: r.data_solicitacao,
            })),
          );
        }

        case 'listar_aprovacoes': {
          const limite = (args.limite as number) || 20;

          const requisicoes = await this.requisicaoService.findAll({
            orgaoId,
            status: StatusRequisicao.AGUARDANDO_AUTORIZACAO,
          });

          const pendentes = requisicoes.slice(0, limite);

          if (pendentes.length === 0) {
            return 'Nenhuma requisição aguardando aprovação.';
          }

          return JSON.stringify(
            pendentes.map((r) => ({
              id: r.id,
              numero: r.numero,
              tipo: r.tipo,
              setor: r.setor_solicitante,
              valor_estimado: r.valor_total_estimado,
              justificativa: r.justificativa,
              data_solicitacao: r.data_solicitacao,
            })),
          );
        }

        case 'aprovar_requisicao': {
          const requisicaoId = args.requisicao_id as string;
          const observacao = args.observacao as string | undefined;

          const resultado = await this.requisicaoService.autorizar(
            requisicaoId,
            { observacao },
            usuario.id,
            usuario.nome,
            usuario.role,
          );

          return JSON.stringify({
            sucesso: true,
            numero: resultado.numero,
            status: resultado.status,
            mensagem: `Requisição ${resultado.numero} aprovada com sucesso.`,
          });
        }

        case 'negar_requisicao': {
          const requisicaoId = args.requisicao_id as string;
          const motivo = args.motivo as string;

          const resultado = await this.requisicaoService.negar(
            requisicaoId,
            { motivo },
            usuario.id,
            usuario.nome,
            usuario.role,
          );

          return JSON.stringify({
            sucesso: true,
            numero: resultado.numero,
            status: resultado.status,
            mensagem: `Requisição ${resultado.numero} negada com sucesso.`,
          });
        }

        case 'listar_contratos': {
          const categoriaArg = args.categoria as CategoriaContrato | undefined;
          const resultado = await this.contratosService.findAll({
            orgaoId,
            vigentes: true,
            limit: 50,
          });

          const contratos = categoriaArg
            ? resultado.data.filter((c) => c.categoria === categoriaArg)
            : resultado.data;

          if (contratos.length === 0) {
            return categoriaArg
              ? `Nenhum contrato vigente encontrado na categoria ${categoriaArg}.`
              : 'Nenhum contrato vigente encontrado para este órgão.';
          }

          return JSON.stringify(
            contratos.map((c) => ({
              id: c.id,
              numero_contrato: c.numero_contrato,
              objeto: c.objeto,
              categoria: c.categoria,
              fornecedor: c.fornecedor?.razao_social || 'N/D',
              valor_global: c.valor_global,
              saldo_total_em_valor: c.saldo_total_em_valor,
              data_vigencia_inicio: c.data_vigencia_inicio,
              data_vigencia_fim: c.data_vigencia_fim,
            })),
          );
        }

        case 'listar_itens_contrato': {
          const contratoId = args.contrato_id as string;

          await this.itemContratoService.validarPropriedadeContrato(contratoId, orgaoId);

          const itens = await this.itemContratoService.findByContrato(contratoId);

          if (itens.length === 0) {
            return 'Este contrato não possui itens cadastrados.';
          }

          return JSON.stringify(
            itens.map((item) => ({
              id: item.id,
              numero_item: item.numero_item,
              descricao: item.descricao,
              unidade_medida: item.unidade_medida,
              quantidade_contratada: item.quantidade_contratada,
              saldo_disponivel: item.saldo_disponivel,
              valor_unitario: item.valor_unitario,
              valor_total_saldo: Number(item.saldo_disponivel) * Number(item.valor_unitario),
            })),
          );
        }

        case 'criar_requisicao': {
          const itensArgs = (args.itens as Array<{
            item_contrato_id: string;
            numero_item: number;
            descricao: string;
            quantidade_solicitada: number;
            unidade_medida?: string;
            valor_unitario?: number;
          }>) || [];

          const dto: any = {
            contrato_id: args.contrato_id as string,
            setor_solicitante: args.setor_solicitante as string,
            justificativa: args.justificativa as string,
            tipo: (args.tipo as TipoRequisicao) || TipoRequisicao.MATERIAL,
            prioridade: (args.prioridade as string) || 'NORMAL',
            data_necessidade: args.data_necessidade as string | undefined,
            itens: itensArgs.map((item, idx) => ({
              item_contrato_id: item.item_contrato_id,
              numero_item: item.numero_item ?? idx + 1,
              descricao: item.descricao,
              quantidade_solicitada: item.quantidade_solicitada,
              unidade_medida: item.unidade_medida,
              valor_unitario: item.valor_unitario,
            })),
          };

          const resultado = await this.requisicaoService.criar(
            orgaoId,
            dto,
            usuario.id,
            usuario.nome,
            usuario.email,
          );

          return JSON.stringify({
            sucesso: true,
            numero: resultado.numero,
            id: resultado.id,
            status: resultado.status,
            mensagem: `Requisição ${resultado.numero} criada com sucesso (status: ${resultado.status}).`,
          });
        }

        case 'criar_os': {
          const dto: any = {
            setor_solicitante: args.setor_solicitante as string,
            justificativa: args.justificativa as string,
            tipo: TipoRequisicao.ORDEM_SERVICO,
            descricao_os: args.descricao_os as string,
            local_execucao: args.local_execucao as string,
            prazo_execucao_dias: args.prazo_execucao_dias as number | undefined,
          };

          const resultado = await this.requisicaoService.criar(
            orgaoId,
            dto,
            usuario.id,
            usuario.nome,
            usuario.email,
          );

          return JSON.stringify({
            sucesso: true,
            numero: resultado.numero,
            id: resultado.id,
            status: resultado.status,
            mensagem: `Ordem de Serviço ${resultado.numero} criada com sucesso (status: ${resultado.status}).`,
          });
        }

        case 'pedir_relatorio': {
          const tipo = args.tipo as string;
          const ano = (args.ano as number) || new Date().getFullYear();

          let dados: unknown;

          if (tipo === 'licitacoes') {
            dados = await this.relatoriosService.getEficienciaLicitacoes(orgaoId, ano);
          } else if (tipo === 'contratos') {
            dados = await this.relatoriosService.getFinanceiroContratos(orgaoId, ano);
          } else if (tipo === 'almoxarifado') {
            dados = await this.relatoriosService.getConsumoAlmoxarifado(orgaoId, ano);
          } else {
            return 'Tipo de relatório inválido. Use: licitacoes, contratos ou almoxarifado.';
          }

          return JSON.stringify(dados);
        }

        default:
          return `Ferramenta desconhecida: ${nome}`;
      }
    } catch (error: any) {
      this.logger.error(`Erro ao executar ferramenta ${nome}: ${error.message}`);
      return JSON.stringify({ erro: error.message || 'Erro ao executar ação' });
    }
  }

  async processarMensagem(
    jwtUser: JwtPayload,
    mensagem: string,
    historico: Array<{ role: string; content: string }>,
  ): Promise<ChatResult> {
    // Apenas usuários do tipo USUARIO (membros do órgão) podem usar o assistente
    if (jwtUser.type !== UserType.USUARIO) {
      return {
        resposta: 'O Assistente IA está disponível apenas para usuários do órgão.',
        tools_usadas: [],
      };
    }

    // Carregar perfil completo do usuário
    let usuario: Usuario;
    try {
      usuario = await this.usuariosService.findById(jwtUser.sub);
    } catch {
      return {
        resposta: 'Não foi possível carregar o perfil do usuário. Por favor, faça login novamente.',
        tools_usadas: [],
      };
    }

    const orgaoId = usuario.orgao_id || jwtUser.orgaoId;
    if (!orgaoId) {
      return {
        resposta: 'Não foi possível identificar o órgão do usuário. Por favor, faça login novamente.',
        tools_usadas: [],
      };
    }

    const apiKey = await this.getApiKey();
    const model = await this.getModel();
    const tools = this.buildTools(usuario);
    const systemPrompt = this.buildSystemPrompt(usuario);

    const mensagens: OpenRouterMessage[] = [
      ...historico.map((h) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
      { role: 'user', content: mensagem },
    ];

    const toolsUsadas: string[] = [];

    // Primeiro call ao AI com as ferramentas
    let response = await this.chamarOpenRouter(apiKey, model, systemPrompt, mensagens, tools);

    // Loop de tool calling (máximo 5 iterações)
    for (let i = 0; i < 5; i++) {
      const choice = response.choices?.[0];
      if (!choice) break;

      const { message } = choice;
      const toolCalls: ToolCall[] = message.tool_calls || [];

      if (toolCalls.length === 0) {
        // Sem mais tool calls - retorna a resposta final
        return {
          resposta: message.content || 'Não foi possível processar sua solicitação.',
          tools_usadas: toolsUsadas,
        };
      }

      // Adiciona a mensagem do assistant ao histórico
      mensagens.push({
        role: 'assistant',
        content: message.content || null,
        tool_calls: toolCalls,
      });

      // Executa cada tool call
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        toolsUsadas.push(toolName);
        this.logger.log(`Executando ferramenta: ${toolName}`);

        let argsObj: Record<string, unknown> = {};
        try {
          argsObj = JSON.parse(toolCall.function.arguments || '{}');
        } catch {
          argsObj = {};
        }

        const resultado = await this.executarFerramenta(toolName, argsObj, usuario, orgaoId);

        mensagens.push({
          role: 'tool',
          content: resultado,
          tool_call_id: toolCall.id,
          name: toolName,
        });
      }

      // Chama o AI novamente com os resultados das ferramentas
      response = await this.chamarOpenRouter(apiKey, model, systemPrompt, mensagens, tools);
    }

    const finalContent = response.choices?.[0]?.message?.content;
    return {
      resposta: finalContent || 'Não foi possível processar sua solicitação.',
      tools_usadas: toolsUsadas,
    };
  }

  private async chamarOpenRouter(
    apiKey: string,
    model: string,
    systemPrompt: string,
    mensagens: OpenRouterMessage[],
    tools: OpenRouterTool[],
  ): Promise<any> {
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...mensagens],
      temperature: 0.3,
      max_tokens: 4000,
    };

    if (tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://portaldcp.com.br',
        'X-Title': 'Portal DCP',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Erro OpenRouter: ${error}`);
      throw new Error(`Erro na API de IA: ${response.status}`);
    }

    return response.json();
  }
}
