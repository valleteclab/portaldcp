#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const client_js_1 = require("./client.js");
const server = new index_js_1.Server({
    name: 'portaldcp-mcp',
    version: '1.1.0',
}, {
    capabilities: { tools: {} },
});
const TEAM_SCHEMA = {
    type: 'object',
    description: 'Relação mensal exigida somente quando regras_medicao.equipe_funcionarios.exigida=true e houver execução no lote configurado.',
    properties: {
        fechamento_fatura: { type: 'string' },
        responsavel_legal: { type: 'string' },
        data_emissao: {
            type: 'string',
            description: 'Data no formato YYYY-MM-DD',
        },
        percentual_iss: { type: 'number', default: 2.5 },
        percentual_ir: { type: 'number', default: 4.8 },
        retencao_inss: { type: 'number', default: 0 },
        funcionarios: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    item_cronograma_id: {
                        type: 'string',
                        description: 'UUID do item/cargo sujeito à relação de funcionários',
                    },
                    nome: { type: 'string' },
                    posto_numero: {
                        type: 'number',
                        description: 'Opcional. Se omitido, o Portal DCP distribui os postos automaticamente.',
                    },
                    inicio_prestacao_servicos: {
                        type: 'string',
                        description: 'Data YYYY-MM-DD',
                    },
                    lotacao: { type: 'string' },
                    situacao: { type: 'string', default: 'ATIVO' },
                    carga_horaria_semanal: {
                        type: 'number',
                        default: 30,
                    },
                    dias_trabalhados: {
                        type: 'number',
                        description: 'Quantidade de dias no mês, entre 0,01 e 30',
                    },
                },
                required: [
                    'item_cronograma_id',
                    'nome',
                    'dias_trabalhados',
                ],
            },
        },
    },
    required: ['funcionarios'],
};
const TOOLS = [
    {
        name: 'list_contracts',
        description: 'Lista todos os contratos vinculados ao fornecedor autenticado. ' +
            'Retorna id, numero_contrato, objeto, valor_global, saldo_disponivel, status e datas de vigência.',
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
    },
    {
        name: 'get_contract',
        description: 'Retorna detalhes completos de um contrato: itens do cronograma com saldos, ' +
            'lote_numero, regras_medicao, etapas, saldo disponível e as últimas 10 medições. ' +
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
        description: 'Cria uma nova medição (rascunho) para um contrato. ' +
            'Se enviar_imediatamente=true, assina digitalmente e submete para aprovação do fiscal em uma única operação. ' +
            'Para contratos CONTINUADO (serviço mensal), informe valor_medido. ' +
            'Para contratos ITEM_QUANTIDADE, informe itens[] com item_cronograma_id e quantidade_medida. ' +
            'Informe equipe somente quando regras_medicao.equipe_funcionarios.exigida=true e houver execução no lote configurado.',
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
                equipe: TEAM_SCHEMA,
                enviar_imediatamente: {
                    type: 'boolean',
                    description: 'Se true, assina e envia a medição para aprovação do fiscal imediatamente após criar o rascunho. ' +
                        'Padrão: false (cria apenas o rascunho).',
                },
            },
            required: ['contract_id', 'periodo_inicio', 'periodo_fim'],
        },
    },
    {
        name: 'get_previous_team',
        description: 'Retorna a última relação mensal de funcionários de um contrato. ' +
            'Use como base quando o fornecedor quiser copiar a equipe do mês anterior; revise nomes, datas e dias antes de salvar.',
        inputSchema: {
            type: 'object',
            properties: {
                contract_id: {
                    type: 'string',
                    description: 'UUID do contrato',
                },
            },
            required: ['contract_id'],
        },
    },
    {
        name: 'save_measurement_team',
        description: 'Cria ou atualiza a relação de funcionários de uma medição cujo contrato exige esse controle. ' +
            'A composição financeira e os números dos postos são calculados automaticamente quando omitidos.',
        inputSchema: {
            type: 'object',
            properties: {
                measurement_id: {
                    type: 'string',
                    description: 'UUID da medição em rascunho ou devolvida',
                },
                equipe: TEAM_SCHEMA,
            },
            required: ['measurement_id', 'equipe'],
        },
    },
    {
        name: 'submit_measurement',
        description: 'Registra a assinatura digital (sem OTP — a API Key já prova a identidade) e envia a medição ' +
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
        description: 'Envia um arquivo local (PDF, JPG ou PNG) como anexo de uma medição. ' +
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
                    description: 'Caminho absoluto do arquivo no sistema de arquivos local. Ex: "/home/user/NF_janeiro.pdf"',
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
        description: 'Retorna o status atual de uma medição: RASCUNHO, SUBMETIDA, AGUARDANDO_ATESTE, ' +
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
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    try {
        let result;
        switch (name) {
            case 'list_contracts': {
                const contracts = await (0, client_js_1.listContracts)();
                result = contracts;
                break;
            }
            case 'get_contract': {
                const { contract_id } = args;
                result = await (0, client_js_1.getContract)(contract_id);
                break;
            }
            case 'create_measurement': {
                const { contract_id, ...dados } = args;
                result = await (0, client_js_1.createMeasurement)(contract_id, dados);
                break;
            }
            case 'get_previous_team': {
                const { contract_id } = args;
                result = await (0, client_js_1.getPreviousTeam)(contract_id);
                break;
            }
            case 'save_measurement_team': {
                const { measurement_id, equipe } = args;
                result = await (0, client_js_1.saveMeasurementTeam)(measurement_id, equipe);
                break;
            }
            case 'submit_measurement': {
                const { measurement_id } = args;
                result = await (0, client_js_1.submitMeasurement)(measurement_id);
                break;
            }
            case 'upload_document': {
                const { measurement_id, file_path, tipo, descricao } = args;
                result = await (0, client_js_1.uploadDocument)(measurement_id, file_path, tipo, descricao);
                break;
            }
            case 'get_measurement_status': {
                const { measurement_id } = args;
                result = await (0, client_js_1.getMeasurementStatus)(measurement_id);
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
    }
    catch (err) {
        return {
            content: [{ type: 'text', text: `Erro: ${err.message}` }],
            isError: true,
        };
    }
});
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    process.stderr.write('[portaldcp-mcp] Servidor MCP iniciado via stdio\n');
}
main().catch((err) => {
    process.stderr.write(`[portaldcp-mcp] Erro fatal: ${err.message}\n`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map