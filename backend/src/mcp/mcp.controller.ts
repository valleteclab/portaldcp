import {
  Controller,
  All,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { Public } from '../auth/public.decorator';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { Contrato } from '../contratos/entities/contrato.entity';
import { Medicao } from '../contratos/entities/medicao.entity';
import { ItemCronograma } from '../contratos/entities/item-cronograma.entity';
import { EtapaCronograma } from '../contratos/entities/etapa-cronograma.entity';
import { AnexoMedicao } from '../contratos/entities/anexo-medicao.entity';
import { AssinaturaDigital, EntidadeTipo, PapelAssinante } from '../assinaturas/entities/assinatura-digital.entity';
import { MedicaoService } from '../contratos/medicao.service';
import { FornecedorApiService } from '../ext/fornecedor-api.service';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';

@Public()
@SkipThrottle()
@Controller('mcp')
export class McpController {
  // sessionId → transport (StreamableHTTP manages its own session lifecycle)
  private readonly sessions = new Map<string, StreamableHTTPServerTransport>();

  constructor(
    @InjectRepository(Fornecedor)
    private readonly fornecedorRepo: Repository<Fornecedor>,
    @InjectRepository(Contrato)
    private readonly contratoRepo: Repository<Contrato>,
    @InjectRepository(Medicao)
    private readonly medicaoRepo: Repository<Medicao>,
    @InjectRepository(ItemCronograma)
    private readonly itemCronogramaRepo: Repository<ItemCronograma>,
    @InjectRepository(EtapaCronograma)
    private readonly etapaRepo: Repository<EtapaCronograma>,
    @InjectRepository(AnexoMedicao)
    private readonly anexoRepo: Repository<AnexoMedicao>,
    @InjectRepository(AssinaturaDigital)
    private readonly assinaturaRepo: Repository<AssinaturaDigital>,
    private readonly medicaoService: MedicaoService,
    private readonly fornecedorApiService: FornecedorApiService,
  ) {}

  // ===========================================================
  // /api/mcp/sse  — trata GET, POST e DELETE (protocolo Streamable HTTP)
  // ===========================================================
  @All('sse')
  async handleMcp(
    @Query('api_key') apiKey: string,
    @Req() req: ExpressRequest,
    @Res() res: ExpressResponse,
  ) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');

    // OPTIONS preflight (browser / Cursor via webview)
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.status(204).end();
      return;
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport = sessionId ? this.sessions.get(sessionId) : undefined;

    if (transport) {
      // Sessão existente — encaminha a requisição ao transporte correto
      await transport.handleRequest(req as any, res as any, req.body);
      return;
    }

    // Sem sessão: deve ser uma requisição de inicialização (POST com initialize)
    if (req.method !== 'POST') {
      res.status(400).json({ error: 'Sessão não encontrada. Inicie uma nova conexão.' });
      return;
    }

    if (!isInitializeRequest(req.body)) {
      res.status(400).json({ error: 'Requisição de inicialização inválida.' });
      return;
    }

    // Autentica via api_key na query
    const fornecedor = await this.autenticar(apiKey);
    if (!fornecedor) {
      res.status(401).json({ error: 'API key inválida ou revogada.' });
      return;
    }

    // Cria transporte com gerenciamento de sessão
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        this.sessions.set(sid, transport!);
      },
      onsessionclosed: (sid) => {
        this.sessions.delete(sid);
      },
    });

    const server = this.criarServidorMcp(fornecedor, apiKey);
    await server.connect(transport);

    await transport.handleRequest(req as any, res as any, req.body);
  }

  // ===========================================================
  // Autenticação via API key (query param)
  // ===========================================================
  private async autenticar(apiKey: string): Promise<Fornecedor | null> {
    if (!apiKey) return null;
    const hash = createHash('sha256').update(apiKey).digest('hex');
    return this.fornecedorRepo.findOne({
      where: { api_key_hash: hash },
      select: ['id', 'razao_social', 'cpf_cnpj', 'telefone', 'email'],
    });
  }

  // ===========================================================
  // Criação do servidor MCP com as ferramentas
  // ===========================================================
  private criarServidorMcp(fornecedor: Fornecedor, apiKey: string): Server {
    const server = new Server(
      { name: 'portaldcp-mcp', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'list_contracts',
          description: 'Lista todos os contratos vinculados ao fornecedor autenticado.',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
        {
          name: 'get_contract',
          description: 'Retorna detalhes completos de um contrato: itens do cronograma, etapas, saldo e últimas medições.',
          inputSchema: {
            type: 'object',
            properties: { contract_id: { type: 'string', description: 'UUID do contrato' } },
            required: ['contract_id'],
          },
        },
        {
          name: 'create_measurement',
          description:
            'Cria uma nova medição. Se enviar_imediatamente=true, assina e submete para o fiscal em uma única operação.',
          inputSchema: {
            type: 'object',
            properties: {
              contract_id: { type: 'string' },
              periodo_inicio: { type: 'string', description: 'YYYY-MM-DD' },
              periodo_fim: { type: 'string', description: 'YYYY-MM-DD' },
              nota_fiscal_numero: { type: 'string' },
              nota_fiscal_valor: { type: 'number' },
              nota_fiscal_data: { type: 'string' },
              observacoes: { type: 'string' },
              valor_medido: { type: 'number', description: 'Para contratos de serviço continuado' },
              itens: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    item_cronograma_id: { type: 'string' },
                    quantidade_medida: { type: 'number' },
                  },
                  required: ['item_cronograma_id', 'quantidade_medida'],
                },
              },
              enviar_imediatamente: { type: 'boolean' },
            },
            required: ['contract_id', 'periodo_inicio', 'periodo_fim'],
          },
        },
        {
          name: 'submit_measurement',
          description: 'Assina digitalmente e envia a medição para aprovação do fiscal.',
          inputSchema: {
            type: 'object',
            properties: { measurement_id: { type: 'string' } },
            required: ['measurement_id'],
          },
        },
        {
          name: 'get_measurement_status',
          description: 'Retorna o status atual de uma medição.',
          inputSchema: {
            type: 'object',
            properties: { measurement_id: { type: 'string' } },
            required: ['measurement_id'],
          },
        },
      ],
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;

      try {
        switch (name) {
          case 'list_contracts': {
            const contratos = await this.contratoRepo.find({
              where: { fornecedor_id: fornecedor.id },
              order: { created_at: 'DESC' },
              select: [
                'id', 'numero_contrato', 'objeto', 'tipo', 'modalidade_execucao',
                'valor_global', 'valor_inicial', 'data_vigencia_inicio',
                'data_vigencia_fim', 'status',
              ],
            });
            const lista = contratos.map((c) => ({
              id: c.id,
              numero_contrato: c.numero_contrato,
              objeto: c.objeto,
              modalidade_execucao: c.modalidade_execucao,
              valor_global: Number(c.valor_global) || Number(c.valor_inicial) || 0,
              data_vigencia_inicio: c.data_vigencia_inicio,
              data_vigencia_fim: c.data_vigencia_fim,
              status: c.status,
            }));
            return { content: [{ type: 'text', text: JSON.stringify(lista, null, 2) }] };
          }

          case 'get_contract': {
            const { contract_id } = args as { contract_id: string };
            const contrato = await this.contratoRepo.findOne({ where: { id: contract_id } });
            if (!contrato) return this.erro('Contrato não encontrado');
            if (contrato.fornecedor_id !== fornecedor.id) return this.erro('Acesso negado');

            const [medicoes, etapas, itens] = await Promise.all([
              this.medicaoRepo.find({
                where: { contrato_id: contract_id },
                order: { numero_medicao: 'DESC' },
                take: 10,
                select: ['id', 'numero_medicao', 'periodo_inicio', 'periodo_fim', 'valor_medido', 'status'],
              }),
              this.etapaRepo.find({ where: { contrato_id: contract_id }, order: { numero_etapa: 'ASC' } }),
              this.itemCronogramaRepo.find({ where: { contrato_id: contract_id }, order: { numero_item: 'ASC' } as any }),
            ]);

            const valorGlobal = Number(contrato.valor_global) || Number(contrato.valor_inicial) || 0;
            const valorExecAnterior = Number(contrato.valor_executado_anterior) || 0;
            const valorAprovado = medicoes
              .filter((m) => String(m.status) === 'APROVADA')
              .reduce((s, m) => s + Number(m.valor_medido), 0);
            const valorEmAnalise = medicoes
              .filter((m) => !['APROVADA', 'REJEITADA', 'RASCUNHO'].includes(String(m.status)))
              .reduce((s, m) => s + Number(m.valor_medido), 0);

            const resultado = {
              id: contrato.id,
              numero_contrato: contrato.numero_contrato,
              objeto: contrato.objeto,
              modalidade_execucao: contrato.modalidade_execucao,
              valor_global: valorGlobal,
              saldo_disponivel: valorGlobal - valorExecAnterior - valorAprovado - valorEmAnalise,
              data_vigencia_inicio: contrato.data_vigencia_inicio,
              data_vigencia_fim: contrato.data_vigencia_fim,
              status: contrato.status,
              etapas: etapas.map((e) => ({
                id: e.id,
                numero_etapa: e.numero_etapa,
                descricao: e.descricao,
                valor_previsto: Number(e.valor_previsto),
              })),
              itens_cronograma: itens.map((i) => ({
                id: i.id,
                numero_item: i.numero_item,
                descricao: i.descricao,
                unidade_medida: i.unidade_medida,
                quantidade: Number(i.quantidade),
                saldo_quantidade: Number(i.quantidade) - Number(i.quantidade_medida),
                valor_unitario: Number(i.valor_unitario),
              })),
              ultimas_medicoes: medicoes,
            };
            return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
          }

          case 'create_measurement': {
            const { contract_id, enviar_imediatamente, ...dadosMedicao } = args as any;
            const contrato = await this.contratoRepo.findOne({ where: { id: contract_id } });
            if (!contrato) return this.erro('Contrato não encontrado');
            if (contrato.fornecedor_id !== fornecedor.id) return this.erro('Acesso negado');

            const medicao = await this.medicaoService.criarMedicao(
              contract_id,
              { ...dadosMedicao, fornecedor_id: fornecedor.id, fornecedor_nome: fornecedor.razao_social },
              { skipOSCheck: true },
            );

            if (enviar_imediatamente) {
              const resultado = await this.submeterMedicaoInterna(medicao.id, fornecedor, contrato, apiKey);
              return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
            }

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  id: medicao.id,
                  numero_medicao: medicao.numero_medicao,
                  status: medicao.status,
                  valor_medido: Number(medicao.valor_medido),
                  mensagem: 'Rascunho criado. Use submit_measurement para enviar ao fiscal.',
                }, null, 2),
              }],
            };
          }

          case 'submit_measurement': {
            const { measurement_id } = args as { measurement_id: string };
            const medicao = await this.medicaoRepo.findOne({ where: { id: measurement_id } });
            if (!medicao) return this.erro('Medição não encontrada');
            const contrato = await this.contratoRepo.findOne({ where: { id: medicao.contrato_id } });
            if (!contrato || contrato.fornecedor_id !== fornecedor.id) return this.erro('Acesso negado');

            const resultado = await this.submeterMedicaoInterna(measurement_id, fornecedor, contrato, apiKey);
            return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
          }

          case 'get_measurement_status': {
            const { measurement_id } = args as { measurement_id: string };
            const medicao = await this.medicaoRepo.findOne({ where: { id: measurement_id } });
            if (!medicao) return this.erro('Medição não encontrada');
            const contrato = await this.contratoRepo.findOne({ where: { id: medicao.contrato_id } });
            if (!contrato || contrato.fornecedor_id !== fornecedor.id) return this.erro('Acesso negado');

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  id: medicao.id,
                  numero_medicao: medicao.numero_medicao,
                  status: medicao.status,
                  valor_medido: Number(medicao.valor_medido),
                  data_submissao: medicao.data_submissao,
                  motivo_devolucao: medicao.motivo_devolucao,
                }, null, 2),
              }],
            };
          }

          default:
            return this.erro(`Ferramenta desconhecida: ${name}`);
        }
      } catch (err: any) {
        return this.erro(err?.message || 'Erro interno ao executar ferramenta');
      }
    });

    return server;
  }

  // ===========================================================
  // Assina programaticamente e submete a medição (sem OTP)
  // ===========================================================
  private async submeterMedicaoInterna(
    medicaoId: string,
    fornecedor: Fornecedor,
    contrato: Contrato,
    apiKey: string,
  ) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let codigoValidacao = '';
    for (let i = 0; i < 16; i++) {
      codigoValidacao += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const apiKeyPrefix = apiKey?.slice(0, 8) || 'API';
    const assinatura = this.assinaturaRepo.create({
      orgao_id: contrato.orgao_id,
      entidade_tipo: EntidadeTipo.MEDICAO,
      entidade_id: medicaoId,
      usuario_id: null as any,
      usuario_nome: fornecedor.razao_social,
      usuario_cpf_cnpj: fornecedor.cpf_cnpj,
      usuario_cargo: `Assinatura via API Key - ${apiKeyPrefix}***`,
      usuario_telefone: fornecedor.telefone || null,
      papel_assinante: PapelAssinante.FORNECEDOR,
      codigo_validacao: codigoValidacao,
      ip_address: null,
      user_agent: 'portaldcp-mcp/1.0',
    } as any);
    await this.assinaturaRepo.save(assinatura);

    const medicaoAtualizada = await this.medicaoService.submeterMedicao(medicaoId, fornecedor.id);

    return {
      id: medicaoAtualizada.id,
      numero_medicao: medicaoAtualizada.numero_medicao,
      status: medicaoAtualizada.status,
      valor_medido: Number(medicaoAtualizada.valor_medido),
      data_submissao: medicaoAtualizada.data_submissao,
      codigo_validacao: codigoValidacao,
      mensagem: 'Medição submetida com sucesso. Aguardando ateste do fiscal.',
    };
  }

  private erro(mensagem: string) {
    return { content: [{ type: 'text', text: `Erro: ${mensagem}` }], isError: true };
  }
}
