import { Controller, All, Get, Query, Req, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { randomUUID } from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { Public } from '../auth/public.decorator';
import { Contrato } from '../contratos/entities/contrato.entity';
import { Medicao } from '../contratos/entities/medicao.entity';
import { TermoAditivo } from '../contratos/entities/termo-aditivo.entity';
import { ContratosService } from '../contratos/contratos.service';
import { OrgaoApiKeyService } from './orgao-api-key.service';
import { OrgaoApiKey } from './entities/orgao-api-key.entity';

/**
 * MCP do ÓRGÃO — somente leitura da carteira de contratos (vigências, saldos,
 * medições, aditivos). Streamable HTTP em /api/mcp/orgao.
 * Autenticação: `X-Api-Key: <chave>`, `Authorization: Bearer <chave>` ou `?api_key=`.
 * As chaves são geradas em Configurações do órgão e guardadas como hash.
 */
@Public()
@SkipThrottle()
@Controller('mcp')
export class McpOrgaoController {
  private readonly sessions = new Map<string, StreamableHTTPServerTransport>();

  constructor(
    @InjectRepository(Contrato)
    private readonly contratoRepo: Repository<Contrato>,
    @InjectRepository(Medicao)
    private readonly medicaoRepo: Repository<Medicao>,
    @InjectRepository(TermoAditivo)
    private readonly termoRepo: Repository<TermoAditivo>,
    private readonly contratosService: ContratosService,
    private readonly chaves: OrgaoApiKeyService,
  ) {}

  @All('orgao')
  async handle(
    @Query('api_key') apiKeyQuery: string,
    @Req() req: ExpressRequest,
    @Res() res: ExpressResponse,
  ) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key, Mcp-Session-Id');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.status(204).end();
      return;
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport = sessionId ? this.sessions.get(sessionId) : undefined;
    if (transport) {
      await transport.handleRequest(req as any, res as any, req.body);
      return;
    }
    if (req.method !== 'POST') {
      res.status(400).json({ error: 'Sessão não encontrada. Inicie uma nova conexão.' });
      return;
    }
    if (!isInitializeRequest(req.body)) {
      res.status(400).json({ error: 'Requisição de inicialização inválida.' });
      return;
    }

    // Aceita: X-Api-Key (clientes que só mandam esse header), Authorization: Bearer, ou ?api_key=
    const xApiKey = String(req.headers['x-api-key'] || '').trim();
    const bearer = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
    const chave = await this.chaves.autenticar(xApiKey || bearer || apiKeyQuery);
    if (!chave) {
      res.status(401).json({ error: 'Chave de integração inválida ou revogada.' });
      return;
    }

    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => { this.sessions.set(sid, transport!); },
      onsessionclosed: (sid) => { this.sessions.delete(sid); },
    });
    const server = this.criarServidor(chave);
    await server.connect(transport);
    await transport.handleRequest(req as any, res as any, req.body);
  }

  /**
   * Endpoint para o Copilot Studio (e conectores Power Platform):
   * - STATELESS: cada POST cria transporte + servidor novos (nada de Mcp-Session-Id);
   * - respostas em application/json (o SDK responde em text/event-stream por padrão
   *   e devolve 406 se o cliente não aceitar SSE — o conector manda só application/json);
   * - chave por X-Api-Key, Authorization: Bearer ou ?api_key=.
   * Mesmas ferramentas do /api/mcp/orgao.
   */
  @All('orgao/copilot')
  async handleCopilot(
    @Query('api_key') apiKeyQuery: string,
    @Req() req: ExpressRequest,
    @Res() res: ExpressResponse,
  ) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key, Mcp-Session-Id');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
      res.status(204).end();
      return;
    }
    const xApiKey = String(req.headers['x-api-key'] || '').trim();
    const bearer = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
    const chave = await this.chaves.autenticar(xApiKey || bearer || apiKeyQuery);
    if (!chave) {
      res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Chave de integração inválida ou revogada.' }, id: null });
      return;
    }
    if (req.method === 'DELETE') { res.status(200).json({ ok: true }); return; }
    if (req.method !== 'POST') {
      res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Use POST com JSON-RPC (servidor sem sessão; sem stream GET).' }, id: null });
      return;
    }
    // O SDK exige Accept com application/json E text/event-stream; normaliza para
    // clientes que mandam só um deles (ou nenhum). O adaptador Node do SDK (Hono
    // getRequestListener) monta o Request a partir de req.rawHeaders — é ele que
    // precisa ser reescrito, não só req.headers.
    const raw: string[] = (req as any).rawHeaders || [];
    const filtrados: string[] = [];
    for (let i = 0; i + 1 < raw.length; i += 2) {
      const nome = String(raw[i]).toLowerCase();
      if (nome === 'accept' || nome === 'content-type') continue;
      filtrados.push(raw[i], raw[i + 1]);
    }
    filtrados.push('Accept', 'application/json, text/event-stream', 'Content-Type', 'application/json');
    (req as any).rawHeaders = filtrados;
    req.headers['accept'] = 'application/json, text/event-stream';
    req.headers['content-type'] = 'application/json';

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = this.criarServidor(chave);
    res.on('close', () => { transport.close().catch(() => undefined); server.close().catch(() => undefined); });
    await server.connect(transport);
    await transport.handleRequest(req as any, res as any, req.body);
  }

  /** OpenAPI (Swagger 2.0) do endpoint acima, para criar um conector personalizado no Power Apps. */
  @Get('orgao/copilot/openapi.json')
  openapiCopilot(@Req() req: ExpressRequest, @Res() res: ExpressResponse) {
    const host = String(req.headers['x-forwarded-host'] || req.headers['host'] || 'compras.cmlem.ba.gov.br').split(',')[0].trim();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({
      swagger: '2.0',
      info: {
        title: 'Portal DCP — Contratos do órgão (MCP)',
        description: 'Consulta somente leitura da carteira de contratos do órgão: vigências, saldos, medições, aditivos.',
        version: '1.0.0',
      },
      host,
      basePath: '/',
      schemes: ['https'],
      paths: {
        '/api/mcp/orgao/copilot': {
          post: {
            summary: 'Portal DCP — contratos do órgão',
            'x-ms-agentic-protocol': 'mcp-streamable-1.0',
            operationId: 'InvokeMCP',
            responses: { '200': { description: 'Success' } },
          },
        },
      },
      securityDefinitions: { apiKey: { type: 'apiKey', in: 'header', name: 'X-Api-Key' } },
      security: [{ apiKey: [] }],
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  private criarServidor(chave: OrgaoApiKey): Server {
    const orgaoId = chave.orgao_id;
    const orgaoNome = chave.orgao?.nome || 'órgão';
    const server = new Server(
      { name: 'portaldcp-orgao', version: '1.0.0' },
      { capabilities: { tools: {} }, instructions:
        `Você consulta a carteira de contratos de ${orgaoNome} no Portal DCP. Somente leitura. ` +
        `Datas em ISO (YYYY-MM-DD); valores em reais. Use "contratos_vencendo" para vigências, ` +
        `"contrato" para saldo e detalhes, "medicoes" para pagamentos/medições.` },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'listar_contratos',
          description: 'Lista contratos do órgão com número, fornecedor, objeto, valor global, vigência e status. Filtros opcionais.',
          inputSchema: {
            type: 'object',
            properties: {
              status: { type: 'string', description: 'Ex.: VIGENTE, ENCERRADO, SUSPENSO, RASCUNHO' },
              texto: { type: 'string', description: 'Busca no número, objeto ou fornecedor' },
              fornecedor_cnpj: { type: 'string' },
              limite: { type: 'number', description: 'Padrão 100' },
            },
          },
        },
        {
          name: 'contrato',
          description: 'Detalhe completo de um contrato pelo id ou pelo número (ex.: "011/2025"): valores, saldo disponível, vigência, fiscal/gestor, aditivos e últimas medições.',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'UUID do contrato' },
              numero: { type: 'string', description: 'Número como "011/2025" (aceita sufixo de aditivo)' },
            },
          },
        },
        {
          name: 'contratos_vencendo',
          description: 'Contratos vigentes cuja vigência termina nos próximos N dias (padrão 60), ordenados pelo vencimento. Inclui os já vencidos e ainda marcados como vigentes.',
          inputSchema: {
            type: 'object',
            properties: { dias: { type: 'number', description: 'Janela em dias (padrão 60)' } },
          },
        },
        {
          name: 'medicoes',
          description: 'Medições (boletins) de um contrato ou de todo o órgão, com período, valor, status, nota fiscal e data de aprovação.',
          inputSchema: {
            type: 'object',
            properties: {
              contrato_id: { type: 'string' },
              status: { type: 'string', description: 'RASCUNHO, SUBMETIDA, AGUARDANDO_ATESTE, AGUARDANDO_APROVACAO, APROVADA, REJEITADA, DEVOLVIDA' },
              mes: { type: 'string', description: 'YYYY-MM (mês do fim do período)' },
              limite: { type: 'number', description: 'Padrão 50' },
            },
          },
        },
        {
          name: 'resumo',
          description: 'Visão geral: contratos por status com valor global somado, quantos vencem em 30/60/90 dias e medições aguardando ateste/aprovação.',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params as { name: string; arguments?: any };
      try {
        switch (name) {
          case 'listar_contratos': return this.ok(await this.listarContratos(orgaoId, args));
          case 'contrato': return this.ok(await this.detalheContrato(orgaoId, args));
          case 'contratos_vencendo': return this.ok(await this.contratosVencendo(orgaoId, Number(args.dias) || 60));
          case 'medicoes': return this.ok(await this.listarMedicoes(orgaoId, args));
          case 'resumo': return this.ok(await this.resumo(orgaoId));
          default: return this.erro(`Ferramenta desconhecida: ${name}`);
        }
      } catch (e: any) {
        return this.erro(e?.message || 'Falha ao consultar');
      }
    });

    return server;
  }

  // ───────────────────────────────────────────────────────────────────────
  private resumoContrato(c: Contrato) {
    const fim = c.data_vigencia_fim ? new Date(c.data_vigencia_fim as any) : null;
    const dias = fim ? Math.ceil((fim.getTime() - Date.now()) / 86400000) : null;
    return {
      id: c.id,
      numero: c.numero_contrato,
      fornecedor: c.fornecedor_razao_social,
      fornecedor_cnpj: c.fornecedor_cnpj,
      objeto: (c.objeto || '').slice(0, 300),
      tipo: c.tipo,
      modalidade_execucao: c.modalidade_execucao,
      status: c.status,
      valor_global: Number(c.valor_global) || Number(c.valor_inicial) || 0,
      vigencia_inicio: c.data_vigencia_inicio,
      vigencia_fim: c.data_vigencia_fim,
      dias_para_vencer: dias,
      fiscal: c.fiscal_nome,
      gestor: c.gestor_nome,
    };
  }

  private async listarContratos(orgaoId: string, args: any) {
    const qb = this.contratoRepo.createQueryBuilder('c').where('c.orgao_id = :orgaoId', { orgaoId });
    if (args.status) qb.andWhere('c.status = :status', { status: String(args.status).toUpperCase() });
    if (args.fornecedor_cnpj) qb.andWhere("regexp_replace(c.fornecedor_cnpj, '\\D', '', 'g') = :cnpj", { cnpj: String(args.fornecedor_cnpj).replace(/\D/g, '') });
    if (args.texto) {
      qb.andWhere('(c.numero_contrato ILIKE :t OR c.objeto ILIKE :t OR c.fornecedor_razao_social ILIKE :t)', { t: `%${args.texto}%` });
    }
    qb.orderBy('c.data_vigencia_fim', 'ASC', 'NULLS LAST').take(Math.min(Number(args.limite) || 100, 500));
    const lista = await qb.getMany();
    return { total: lista.length, contratos: lista.map((c) => this.resumoContrato(c)) };
  }

  private async detalheContrato(orgaoId: string, args: any) {
    let contrato: Contrato | null = null;
    if (args.id) contrato = await this.contratoRepo.findOne({ where: { id: String(args.id), orgao_id: orgaoId } });
    else if (args.numero) {
      contrato = await this.contratoRepo.createQueryBuilder('c')
        .where('c.orgao_id = :orgaoId', { orgaoId })
        .andWhere('c.numero_contrato ILIKE :n', { n: `${String(args.numero).trim()}%` })
        .orderBy('c.created_at', 'DESC').getOne();
    }
    if (!contrato) throw new Error('Contrato não encontrado neste órgão');

    // findOne do serviço enriquece com saldo e ciclo (mesma fonte da tela)
    const enriquecido: any = await this.contratosService.findOne(contrato.id).catch(() => contrato);
    const [medicoes, termos] = await Promise.all([
      this.medicaoRepo.find({
        where: { contrato_id: contrato.id },
        order: { numero_medicao: 'DESC' }, take: 12,
        select: ['id', 'numero_medicao', 'periodo_inicio', 'periodo_fim', 'valor_medido', 'status', 'nota_fiscal_numero', 'data_aprovacao'],
      }),
      this.termoRepo.find({ where: { contrato_id: contrato.id } as any }).catch(() => [] as TermoAditivo[]),
    ]);
    const aprovado = medicoes.filter((m) => String(m.status) === 'APROVADA').reduce((s, m) => s + Number(m.valor_medido || 0), 0);
    return {
      ...this.resumoContrato(contrato),
      objeto: contrato.objeto,
      valor_inicial: Number(contrato.valor_inicial) || 0,
      valor_acrescimos: Number(contrato.valor_acrescimos) || 0,
      valor_supressoes: Number(contrato.valor_supressoes) || 0,
      valor_executado_anterior: Number(contrato.valor_executado_anterior) || 0,
      saldo_disponivel: enriquecido?.saldo_total_em_valor ?? enriquecido?.ciclo_ativo?.saldo_disponivel ?? null,
      ciclo_ativo: enriquecido?.ciclo_ativo ?? null,
      prazo_vigencia_meses: contrato.prazo_vigencia_meses,
      data_assinatura: contrato.data_assinatura,
      numero_processo: contrato.numero_processo,
      modalidade_licitacao: contrato.modalidade_licitacao,
      amparo_legal: contrato.amparo_legal,
      dotacao_orcamentaria: contrato.dotacao_orcamentaria,
      fiscal: { nome: contrato.fiscal_nome, matricula: contrato.fiscal_matricula },
      gestor: { nome: contrato.gestor_nome, matricula: contrato.gestor_matricula },
      termos_aditivos: termos.map((t: any) => ({
        id: t.id, numero: t.numero ?? t.numero_termo, tipo: t.tipo, objeto: (t.objeto || t.descricao || '').slice(0, 200),
        valor: t.valor ?? t.valor_aditivo ?? null, nova_vigencia_fim: t.nova_data_vigencia_fim ?? t.data_vigencia_fim ?? null,
        data_assinatura: t.data_assinatura ?? null,
      })),
      medicoes_ultimas: medicoes.map((m) => ({
        id: m.id, numero: m.numero_medicao, periodo_inicio: m.periodo_inicio, periodo_fim: m.periodo_fim,
        valor: Number(m.valor_medido || 0), status: m.status, nota_fiscal: m.nota_fiscal_numero, aprovada_em: m.data_aprovacao,
      })),
      total_medido_aprovado_nas_ultimas: aprovado,
    };
  }

  private async contratosVencendo(orgaoId: string, dias: number) {
    const limite = new Date(); limite.setDate(limite.getDate() + Math.max(1, Math.min(dias, 730)));
    const lista = await this.contratoRepo.find({
      where: { orgao_id: orgaoId, status: 'VIGENTE' as any, data_vigencia_fim: LessThanOrEqual(limite as any) },
      order: { data_vigencia_fim: 'ASC' },
    });
    return { janela_dias: dias, total: lista.length, contratos: lista.map((c) => this.resumoContrato(c)) };
  }

  private async listarMedicoes(orgaoId: string, args: any) {
    const qb = this.medicaoRepo.createQueryBuilder('m')
      .innerJoin('m.contrato', 'c')
      .addSelect(['c.numero_contrato', 'c.fornecedor_razao_social'])
      .where('c.orgao_id = :orgaoId', { orgaoId });
    if (args.contrato_id) qb.andWhere('m.contrato_id = :cid', { cid: String(args.contrato_id) });
    if (args.status) qb.andWhere('m.status = :st', { st: String(args.status).toUpperCase() });
    if (args.mes && /^\d{4}-\d{2}$/.test(args.mes)) qb.andWhere("to_char(m.periodo_fim, 'YYYY-MM') = :mes", { mes: args.mes });
    qb.orderBy('m.created_at', 'DESC').take(Math.min(Number(args.limite) || 50, 300));
    const lista = await qb.getMany();
    return {
      total: lista.length,
      medicoes: lista.map((m: any) => ({
        id: m.id, contrato: m.contrato?.numero_contrato, fornecedor: m.contrato?.fornecedor_razao_social,
        numero: m.numero_medicao, periodo_inicio: m.periodo_inicio, periodo_fim: m.periodo_fim,
        valor: Number(m.valor_medido || 0), status: m.status, nota_fiscal: m.nota_fiscal_numero, aprovada_em: m.data_aprovacao,
      })),
    };
  }

  private async resumo(orgaoId: string) {
    const porStatus = await this.contratoRepo.createQueryBuilder('c')
      .select('c.status', 'status').addSelect('COUNT(*)', 'qtd')
      .addSelect('COALESCE(SUM(COALESCE(c.valor_global, c.valor_inicial, 0)), 0)', 'valor')
      .where('c.orgao_id = :orgaoId', { orgaoId }).groupBy('c.status').getRawMany();
    const vencendo = async (d: number) => (await this.contratosVencendo(orgaoId, d)).total;
    const [v30, v60, v90] = await Promise.all([vencendo(30), vencendo(60), vencendo(90)]);
    const pendentes = await this.medicaoRepo.createQueryBuilder('m')
      .innerJoin('m.contrato', 'c')
      .where('c.orgao_id = :orgaoId', { orgaoId })
      .andWhere('m.status IN (:...st)', { st: ['SUBMETIDA', 'AGUARDANDO_ATESTE', 'PARCIALMENTE_ATESTADA', 'AGUARDANDO_APROVACAO'] })
      .getCount();
    return {
      contratos_por_status: porStatus.map((r) => ({ status: r.status, quantidade: Number(r.qtd), valor_global_total: Number(r.valor) })),
      vencendo: { em_30_dias: v30, em_60_dias: v60, em_90_dias: v90 },
      medicoes_aguardando_ateste_ou_aprovacao: pendentes,
    };
  }

  private ok(dados: unknown) {
    return { content: [{ type: 'text', text: JSON.stringify(dados, null, 2) }] };
  }
  private erro(mensagem: string) {
    return { content: [{ type: 'text', text: `Erro: ${mensagem}` }], isError: true };
  }
}
