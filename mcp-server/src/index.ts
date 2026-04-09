#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import {
  listContracts,
  getContract,
  createMeasurement,
  submitMeasurement,
  uploadDocument,
  getMeasurementStatus,
} from './client.js';

const server = new Server(
  {
    name: 'portaldcp-mcp',
    version: '1.0.0',
  },
  {
    capabilities: { tools: {} },
  },
);

const TOOLS: Tool[] = [
  {
    name: 'list_contracts',
    description:
      'Lista todos os contratos vinculados ao fornecedor autenticado. ' +
      'Retorna id, numero_contrato, objeto, valor_global, saldo_disponivel, status e datas de vigência.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_contract',
    description:
      'Retorna detalhes completos de um contrato: itens do cronograma com saldos, ' +
      'etapas, saldo disponível e as últimas 10 medições. ' +
      'Use para saber o item_cronograma_id antes de criar uma medição.',
    inputSchema: {
      type: 'object',
      properties: {
        contract_id: {
          type: 'string',
          description: 'UUID do contrato (obtido via list_contracts)',
        },
      },
      required: ['contract_id'],
    },
  },
  {
    name: 'create_measurement',
    description:
      'Cria uma nova medição (rascunho) para um contrato. ' +
      'Se enviar_imediatamente=true, assina digitalmente e submete para aprovação do fiscal em uma única operação. ' +
      'Para contratos CONTINUADO (serviço mensal), informe valor_medido. ' +
      'Para contratos ITEM_QUANTIDADE, informe itens[] com item_cronograma_id e quantidade_medida.',
    inputSchema: {
      type: 'object',
      properties: {
        contract_id: {
          type: 'string',
          description: 'UUID do contrato',
        },
        periodo_inicio: {
          type: 'string',
          description: 'Data de início do período no formato YYYY-MM-DD',
        },
        periodo_fim: {
          type: 'string',
          description: 'Data de fim do período no formato YYYY-MM-DD',
        },
        nota_fiscal_numero: {
          type: 'string',
          description: 'Número da nota fiscal (ex: "000123")',
        },
        nota_fiscal_valor: {
          type: 'number',
          description: 'Valor da nota fiscal em reais',
        },
        nota_fiscal_data: {
          type: 'string',
          description: 'Data de emissão da nota fiscal no formato YYYY-MM-DD',
        },
        observacoes: {
          type: 'string',
          description: 'Observações do fornecedor sobre a medição',
        },
        valor_medido: {
          type: 'number',
          description: 'Valor medido em reais (para contratos de serviço continuado/mensal)',
        },
        itens: {
          type: 'array',
          description: 'Itens medidos (para contratos por item/quantidade)',
          items: {
            type: 'object',
            properties: {
              item_cronograma_id: {
                type: 'string',
                description: 'UUID do item do cronograma (obtido via get_contract)',
              },
              quantidade_medida: {
                type: 'number',
                description: 'Quantidade executada neste período',
              },
            },
            required: ['item_cronograma_id', 'quantidade_medida'],
          },
        },
        enviar_imediatamente: {
          type: 'boolean',
          description:
            'Se true, assina e envia a medição para aprovação do fiscal imediatamente após criar o rascunho. ' +
            'Padrão: false (cria apenas o rascunho).',
        },
      },
      required: ['contract_id', 'periodo_inicio', 'periodo_fim'],
    },
  },
  {
    name: 'submit_measurement',
    description:
      'Registra a assinatura digital (sem OTP — a API Key já prova a identidade) e envia a medição ' +
      'para aprovação do fiscal. Status muda de RASCUNHO para SUBMETIDA.',
    inputSchema: {
      type: 'object',
      properties: {
        measurement_id: {
          type: 'string',
          description: 'UUID da medição a ser enviada',
        },
      },
      required: ['measurement_id'],
    },
  },
  {
    name: 'upload_document',
    description:
      'Envia um arquivo local (PDF, JPG ou PNG) como anexo de uma medição. ' +
      'Tipos aceitos: NOTA_FISCAL, DOCUMENTO, FOTO.',
    inputSchema: {
      type: 'object',
      properties: {
        measurement_id: {
          type: 'string',
          description: 'UUID da medição',
        },
        file_path: {
          type: 'string',
          description:
            'Caminho absoluto do arquivo no sistema de arquivos local. Ex: "/home/user/NF_janeiro.pdf"',
        },
        tipo: {
          type: 'string',
          enum: ['NOTA_FISCAL', 'DOCUMENTO', 'FOTO'],
          description: 'Tipo do documento. Use NOTA_FISCAL para notas fiscais, FOTO para evidências fotográficas.',
        },
        descricao: {
          type: 'string',
          description: 'Descrição opcional do documento (ex: "Nota Fiscal de Janeiro")',
        },
      },
      required: ['measurement_id', 'file_path', 'tipo'],
    },
  },
  {
    name: 'get_measurement_status',
    description:
      'Retorna o status atual de uma medição: RASCUNHO, SUBMETIDA, AGUARDANDO_ATESTE, ' +
      'AGUARDANDO_APROVACAO, APROVADA, REJEITADA ou DEVOLVIDA.',
    inputSchema: {
      type: 'object',
      properties: {
        measurement_id: {
          type: 'string',
          description: 'UUID da medição',
        },
      },
      required: ['measurement_id'],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    let result: any;

    switch (name) {
      case 'list_contracts': {
        const contracts = await listContracts();
        result = contracts;
        break;
      }

      case 'get_contract': {
        const { contract_id } = args as { contract_id: string };
        result = await getContract(contract_id);
        break;
      }

      case 'create_measurement': {
        const { contract_id, ...dados } = args as {
          contract_id: string;
          periodo_inicio: string;
          periodo_fim: string;
          nota_fiscal_numero?: string;
          nota_fiscal_valor?: number;
          nota_fiscal_data?: string;
          observacoes?: string;
          valor_medido?: number;
          itens?: Array<{ item_cronograma_id: string; quantidade_medida: number }>;
          enviar_imediatamente?: boolean;
        };
        result = await createMeasurement(contract_id, dados);
        break;
      }

      case 'submit_measurement': {
        const { measurement_id } = args as { measurement_id: string };
        result = await submitMeasurement(measurement_id);
        break;
      }

      case 'upload_document': {
        const { measurement_id, file_path, tipo, descricao } = args as {
          measurement_id: string;
          file_path: string;
          tipo: string;
          descricao?: string;
        };
        result = await uploadDocument(measurement_id, file_path, tipo, descricao);
        break;
      }

      case 'get_measurement_status': {
        const { measurement_id } = args as { measurement_id: string };
        result = await getMeasurementStatus(measurement_id);
        break;
      }

      default:
        return {
          content: [{ type: 'text', text: `Ferramenta desconhecida: ${name}` }],
          isError: true,
        };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Erro: ${err.message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[portaldcp-mcp] Servidor MCP iniciado via stdio\n');
}

main().catch((err) => {
  process.stderr.write(`[portaldcp-mcp] Erro fatal: ${err.message}\n`);
  process.exit(1);
});
