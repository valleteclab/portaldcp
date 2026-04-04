/**
 * ============================================================================
 * TESTE E2E - PREGÃO ELETRÔNICO - FLUXO COMPLETO
 * ============================================================================
 *
 * Cobre o fluxo de ponta a ponta de um pregão eletrônico conforme
 * Lei 14.133/2021 e IN SEGES/ME 73/2022:
 *
 * 1. Órgão cria licitação + itens
 * 2. Avanço pelas fases internas (PLANEJAMENTO → APROVACAO_INTERNA)
 * 3. Publicação do edital com datas (incluindo abertura no passado)
 * 4. Avanço para ACOLHIMENTO_PROPOSTAS
 * 5. 5 fornecedores cadastrados e propostas enviadas
 * 6. Avanço para ANALISE_PROPOSTAS e classificação das propostas
 * 7. Criação, início e avanço da sessão de disputa
 * 8. Lances sequenciais e concorrentes com verificação de locking pessimista
 * 9. Validação do ranking final
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { Orgao, TipoOrgao, EsferaAdministrativa } from '../src/orgaos/entities/orgao.entity';
import { UserType } from '../src/auth/auth.service';
import { UnidadeMedida } from '../src/itens/entities/item-licitacao.entity';
import {
  ModalidadeLicitacao,
  ModoDisputa,
  CriterioJulgamento,
  TipoContratacao,
} from '../src/licitacoes/entities/licitacao.entity';

// O fluxo completo inclui chamadas de rede ao banco — timeout generoso
jest.setTimeout(120_000);

// ============================================================================
// Helpers
// ============================================================================

/** Gera CNPJ numérico único de 14 dígitos (sem formatação) */
function cnpjFake(prefix: string): string {
  const ts = Date.now().toString().slice(-8);
  return `${prefix}${ts}`.padStart(14, '0').slice(-14);
}

// ============================================================================

describe('Pregão Eletrônico — Fluxo Completo E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  // Estado acumulado ao longo dos testes
  let orgaoToken: string;
  let orgaoId: string;

  let licitacaoId: string;
  // itemIds[i] = ID do ItemLicitacao (usado para lances)
  let itemIds: string[] = [];

  /** Cada fornecedor: { id, nome, token, propostaId } */
  let fornecedores: Array<{
    id: string;
    nome: string;
    token: string;
    propostaId?: string;
  }> = [];

  let sessaoId: string;

  // Valores de referência por item (valor_unitario_estimado × quantidade=10)
  // Serve como teto para validação dos lances
  const ITEMS_REF = [
    { descricao: 'Notebook Dell i7 16GB 512SSD', valorUnitario: 5_000.0 },
    { descricao: 'Monitor 24 pol Full HD IPS', valorUnitario: 1_200.0 },
    { descricao: 'Teclado e Mouse sem fio', valorUnitario: 350.0 },
  ];
  const QTD_POR_ITEM = 10;

  // ============================================================================
  // Setup / Teardown
  // ============================================================================

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Replicar configuração do main.ts relevante para validação
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
      }),
    );
    await app.init();

    dataSource = app.get(DataSource);
    jwtService = app.get(JwtService);

    // Criar órgão diretamente via DataSource
    // modulos_habilitados = null → ModuloGuard em modo compatibilidade (permite tudo)
    const orgaoRepo = dataSource.getRepository(Orgao);
    const ts = Date.now();
    const orgao = orgaoRepo.create({
      codigo: `E2E-${ts}`,
      nome: 'Prefeitura Municipal de Teste E2E',
      cnpj: cnpjFake('99'),
      tipo: TipoOrgao.PREFEITURA,
      esfera: EsferaAdministrativa.MUNICIPAL,
      modulos_habilitados: null,
    } as any);
    const salvo = await orgaoRepo.save(orgao);
    orgaoId = salvo.id;

    // Token JWT do órgão
    orgaoToken = jwtService.sign({ sub: orgaoId, type: UserType.ORGAO });
  });

  afterAll(async () => {
    await app.close();
  });

  // ============================================================================
  // BLOCO 1 — Criação da Licitação e Itens
  // ============================================================================

  describe('Bloco 1 — Criação da Licitação', () => {
    it('cria licitação de pregão eletrônico em modo aberto', async () => {
      const resp = await request(app.getHttpServer())
        .post('/api/licitacoes')
        .set('Authorization', `Bearer ${orgaoToken}`)
        .send({
          numero_processo: `PROC-E2E-${Date.now()}`,
          orgao_id: orgaoId,
          objeto:
            'Aquisição de equipamentos de informática para o Departamento de TI',
          modalidade: ModalidadeLicitacao.PREGAO_ELETRONICO,
          tipo_contratacao: TipoContratacao.COMPRA,
          criterio_julgamento: CriterioJulgamento.MENOR_PRECO,
          modo_disputa: ModoDisputa.ABERTO,
          valor_total_estimado: 65_000.0,
          // Decremento mínimo de R$ 50 (Art. 56 §3º — exposto via DisputaV3Cronometria)
          diferenca_minima_lances: 50.0,
        })
        .expect(201);

      licitacaoId = resp.body.id;
      expect(licitacaoId).toBeTruthy();
      expect(resp.body.fase).toBe('PLANEJAMENTO');
    });

    it('adiciona 3 itens à licitação', async () => {
      for (let i = 0; i < ITEMS_REF.length; i++) {
        const item = ITEMS_REF[i];
        const resp = await request(app.getHttpServer())
          .post('/api/itens')
          .set('Authorization', `Bearer ${orgaoToken}`)
          .send({
            licitacao_id: licitacaoId,
            numero_item: i + 1,
            descricao_resumida: item.descricao,
            quantidade: QTD_POR_ITEM,
            unidade_medida: UnidadeMedida.UNIDADE,
            valor_unitario_estimado: item.valorUnitario,
            sem_pca: true,
            justificativa_sem_pca: 'Item incluído para teste E2E',
          })
          .expect(201);

        itemIds.push(resp.body.id);
      }

      expect(itemIds).toHaveLength(3);
    });
  });

  // ============================================================================
  // BLOCO 2 — Avanço de Fases Internas e Publicação
  // ============================================================================

  describe('Bloco 2 — Fase Interna e Publicação do Edital', () => {
    it('avança 4x pelas fases internas até APROVACAO_INTERNA', async () => {
      // PLANEJAMENTO → TERMO_REFERENCIA → PESQUISA_PRECOS
      //   → ANALISE_JURIDICA → APROVACAO_INTERNA
      for (let i = 0; i < 4; i++) {
        await request(app.getHttpServer())
          .put(`/api/licitacoes/${licitacaoId}/avancar-fase`)
          .set('Authorization', `Bearer ${orgaoToken}`)
          .send({})
          .expect(200);
      }

      const resp = await request(app.getHttpServer())
        .get(`/api/licitacoes/${licitacaoId}`)
        .expect(200);

      expect(resp.body.fase).toBe('APROVACAO_INTERNA');
    });

    it('publica edital com data de abertura da sessão no passado', async () => {
      // Datas no passado permitem iniciar a disputa imediatamente no teste
      // sem aguardar o cronômetro real
      const agora = new Date();
      const menos48h = new Date(agora.getTime() - 48 * 3_600_000).toISOString();
      const menos24h = new Date(agora.getTime() - 24 * 3_600_000).toISOString();
      const menos2h = new Date(agora.getTime() - 2 * 3_600_000).toISOString();

      const resp = await request(app.getHttpServer())
        .put(`/api/licitacoes/${licitacaoId}/publicar-edital`)
        .set('Authorization', `Bearer ${orgaoToken}`)
        .send({
          data_publicacao_edital: menos48h,
          data_limite_impugnacao: menos48h,
          data_inicio_acolhimento: menos48h,
          data_fim_acolhimento: menos24h,
          data_abertura_sessao: menos2h, // passado → não bloqueia início da disputa
        })
        .expect(200);

      expect(resp.body.fase).toBe('PUBLICADO');
    });

    it('avança 2x para ACOLHIMENTO_PROPOSTAS (PUBLICADO → IMPUGNACAO → ACOLHIMENTO)', async () => {
      for (let i = 0; i < 2; i++) {
        await request(app.getHttpServer())
          .put(`/api/licitacoes/${licitacaoId}/avancar-fase`)
          .set('Authorization', `Bearer ${orgaoToken}`)
          .send({})
          .expect(200);
      }

      const resp = await request(app.getHttpServer())
        .get(`/api/licitacoes/${licitacaoId}`)
        .expect(200);

      expect(resp.body.fase).toBe('ACOLHIMENTO_PROPOSTAS');
    });
  });

  // ============================================================================
  // BLOCO 3 — Cadastro de Fornecedores e Envio de Propostas
  // ============================================================================

  describe('Bloco 3 — Fornecedores e Propostas', () => {
    it('cadastra 5 fornecedores via cadastro-rápido do órgão', async () => {
      const empresas = [
        { cnpj: cnpjFake('11'), nome: 'TechCorp Informática Ltda' },
        { cnpj: cnpjFake('22'), nome: 'InfoSystems Comércio ME' },
        { cnpj: cnpjFake('33'), nome: 'Digital Solutions EPP' },
        { cnpj: cnpjFake('44'), nome: 'Prime Tech Distribuidora' },
        { cnpj: cnpjFake('55'), nome: 'ComputerWorld Atacado Ltda' },
      ];

      for (const empresa of empresas) {
        const resp = await request(app.getHttpServer())
          .post('/api/fornecedores/orgao/cadastro-rapido')
          .set('Authorization', `Bearer ${orgaoToken}`)
          .send({ cnpj: empresa.cnpj, razao_social: empresa.nome })
          .expect(201);

        fornecedores.push({
          id: resp.body.id,
          nome: empresa.nome,
          token: jwtService.sign({ sub: resp.body.id, type: UserType.FORNECEDOR }),
        });
      }

      expect(fornecedores).toHaveLength(5);
    });

    it('envia proposta para cada fornecedor com preços progressivamente menores', async () => {
      /**
       * Multiplicadores de preço por fornecedor (forn[0] = mais caro, forn[4] = mais barato)
       * Garante ranking determinístico para verificação posterior.
       *
       * Proposta total de cada fornecedor para o item i:
       *   valor_total = ITEMS_REF[i].valorUnitario × mult × QTD_POR_ITEM
       *
       * Ex.: forn[4] para Notebook: 5000 × 0.80 × 10 = R$ 40.000 (menor lance possível)
       */
      const multiplicadores = [1.0, 0.95, 0.90, 0.85, 0.80];

      for (let fi = 0; fi < fornecedores.length; fi++) {
        const forn = fornecedores[fi];
        const mult = multiplicadores[fi];

        const propostaResp = await request(app.getHttpServer())
          .post('/api/propostas')
          .set('Authorization', `Bearer ${orgaoToken}`)
          .send({
            licitacao_id: licitacaoId,
            fornecedor_id: forn.id,
            // Declarações obrigatórias (Art. 63 Lei 14.133/2021)
            declaracao_termos: true,
            declaracao_integridade: true,
            declaracao_inexistencia_fatos: true,
            declaracao_menor: true,
            itens: itemIds.map((itemId, idx) => ({
              item_licitacao_id: itemId,
              valor_unitario: Number(
                (ITEMS_REF[idx].valorUnitario * mult).toFixed(2),
              ),
            })),
          })
          .expect(201);

        const propostaId = propostaResp.body.id;
        forn.propostaId = propostaId;

        // Submete a proposta para o status ENVIADA
        await request(app.getHttpServer())
          .put(`/api/propostas/${propostaId}/enviar`)
          .set('Authorization', `Bearer ${orgaoToken}`)
          .expect(200);
      }
    });
  });

  // ============================================================================
  // BLOCO 4 — Análise e Classificação + Criação da Sessão
  // ============================================================================

  describe('Bloco 4 — Análise de Propostas e Sessão de Disputa', () => {
    it('avança para ANALISE_PROPOSTAS', async () => {
      const resp = await request(app.getHttpServer())
        .put(`/api/licitacoes/${licitacaoId}/avancar-fase`)
        .set('Authorization', `Bearer ${orgaoToken}`)
        .send({})
        .expect(200);

      expect(resp.body.fase).toBe('ANALISE_PROPOSTAS');
    });

    it('classifica todas as propostas enviadas (habilita lances)', async () => {
      const propostasResp = await request(app.getHttpServer())
        .get(`/api/propostas/licitacao/${licitacaoId}`)
        .expect(200);

      const enviadas = propostasResp.body.filter(
        (p: any) => p.status === 'ENVIADA' || p.status === 'VALIDA',
      );
      expect(enviadas.length).toBeGreaterThanOrEqual(5);

      for (const proposta of enviadas) {
        await request(app.getHttpServer())
          .put(`/api/propostas/${proposta.id}/classificar`)
          .set('Authorization', `Bearer ${orgaoToken}`)
          .expect(200);
      }
    });

    it('cria a sessão de disputa para a licitação', async () => {
      const resp = await request(app.getHttpServer())
        .post(`/api/sessao/${licitacaoId}`)
        .set('Authorization', `Bearer ${orgaoToken}`)
        .send({
          pregoeiroId: orgaoId,
          pregoeiroNome: 'Pregoeiro Teste E2E',
        })
        .expect(201);

      sessaoId = resp.body.id;
      expect(sessaoId).toBeTruthy();
    });

    it('inicia a sessão e avança para disputa de lances', async () => {
      // Abre a sessão (AGUARDANDO_INICIO → EM_ANDAMENTO)
      await request(app.getHttpServer())
        .put(`/api/sessao/${sessaoId}/iniciar`)
        .set('Authorization', `Bearer ${orgaoToken}`)
        .expect(200);

      // Avança para fase de disputa de lances
      await request(app.getHttpServer())
        .put(`/api/sessao/${sessaoId}/avancar-disputa`)
        .set('Authorization', `Bearer ${orgaoToken}`)
        .expect(200);
    });

    it('inicia disputa de TODOS os itens simultaneamente', async () => {
      // PUT /api/sessao/:id/iniciar-todos-itens → cada item recebe seu próprio cronômetro
      const resp = await request(app.getHttpServer())
        .put(`/api/sessao/${sessaoId}/iniciar-todos-itens`)
        .set('Authorization', `Bearer ${orgaoToken}`)
        .expect(200);

      // A resposta deve conter os itens iniciados
      expect(resp.body).toBeDefined();
    });
  });

  // ============================================================================
  // BLOCO 5 — Lances
  // ============================================================================

  describe('Bloco 5 — Lances da Disputa', () => {
    /**
     * Calcula valor de lance válido para o fornecedor fi no item idx.
     *
     * Regras que precisamos satisfazer:
     *   (a) valor < propostaInicial  (valor_total = valorUnitario × mult × QTD)
     *   (b) valor ≠ melhor lance atual
     *   (c) valor < meu último lance (só se já tiver dado lance antes)
     *
     * Estratégia: lance = (propostaTotal × 0.98) - (fi * 100)
     * Isso garante que cada fornecedor tenha um valor único e < sua proposta inicial.
     */
    function calcLance(itemIdx: number, fIdx: number): number {
      const mult = [1.0, 0.95, 0.9, 0.85, 0.8][fIdx];
      const propostaTotal =
        ITEMS_REF[itemIdx].valorUnitario * mult * QTD_POR_ITEM;
      return Number((propostaTotal * 0.98 - fIdx * 100).toFixed(2));
    }

    it('aceita lances sequenciais de 5 fornecedores no Item 1 (Notebook)', async () => {
      const itemId = itemIds[0];

      // Lances de forn[0] (mais caro) até forn[4] (mais barato), em sequência
      // Cada valor é único e < a proposta inicial do respectivo fornecedor
      for (let fi = 0; fi < fornecedores.length; fi++) {
        const forn = fornecedores[fi];
        const valor = calcLance(0, fi);

        await request(app.getHttpServer())
          .post(`/api/disputa-v2/sessao/${sessaoId}/lance`)
          .send({
            itemId,
            fornecedorId: forn.id,
            fornecedorNome: forn.nome,
            valor,
          })
          .expect(201);
      }

      // O melhor lance deve ser o de forn[4] (menor multiplicador = menor valor)
      const melhoresResp = await request(app.getHttpServer())
        .get(`/api/disputa-v2/item/${itemId}/melhores`)
        .expect(200);

      expect(Array.isArray(melhoresResp.body)).toBe(true);
      expect(melhoresResp.body.length).toBeGreaterThanOrEqual(1);

      // Verificar ordenação: menor primeiro
      const valores: number[] = melhoresResp.body.map((l: any) => Number(l.melhorValor));
      for (let i = 1; i < valores.length; i++) {
        expect(valores[i]).toBeGreaterThanOrEqual(valores[i - 1]);
      }
    });

    it('processa lances CONCORRENTES simultâneos sem erros de concorrência (lock pessimista)', async () => {
      /**
       * Este teste valida que o SELECT FOR UPDATE no registrarLance serializa
       * os acessos e nenhuma requisição retorna 500 (deadlock / race condition).
       *
       * Todas as 5 requisições são disparadas com Promise.all.
       * Cada fornecedor usa um valor único < sua proposta inicial.
       */
      const itemId = itemIds[1]; // Monitor — proposta mínima: 9600 (forn[4])

      const lancesSimultaneos = fornecedores.map((forn, fi) =>
        request(app.getHttpServer())
          .post(`/api/disputa-v2/sessao/${sessaoId}/lance`)
          .send({
            itemId,
            fornecedorId: forn.id,
            fornecedorNome: forn.nome,
            valor: calcLance(1, fi),
          }),
      );

      const respostas = await Promise.all(lancesSimultaneos);

      // INVARIANTE PRINCIPAL: nenhum 500 (falha de infraestrutura/concorrência)
      for (const resp of respostas) {
        expect(resp.status).not.toBe(500);
        expect(resp.status).not.toBe(503);
      }

      // Ao menos um lance deve ter sido aceito (201)
      const aceitos = respostas.filter((r) => r.status === 201);
      expect(aceitos.length).toBeGreaterThanOrEqual(1);
    });

    it('rejeita lance com valor acima da proposta inicial do fornecedor', async () => {
      const itemId = itemIds[0];
      const forn = fornecedores[0];
      // Proposta inicial forn[0] para Notebook: 5000 × 1.0 × 10 = R$ 50.000
      const valorInvalido = 55_000;

      const resp = await request(app.getHttpServer())
        .post(`/api/disputa-v2/sessao/${sessaoId}/lance`)
        .send({
          itemId,
          fornecedorId: forn.id,
          fornecedorNome: forn.nome,
          valor: valorInvalido,
        });

      // Deve ser rejeitado com 400 (BadRequest) — não com 500
      expect(resp.status).toBe(400);
      expect(resp.body.message).toMatch(/proposta inicial|inicial/i);
    });

    it('rejeita lance igual ao melhor lance atual', async () => {
      const itemId = itemIds[0];
      const forn = fornecedores[2];

      // Busca o melhor lance atual
      const melhoresResp = await request(app.getHttpServer())
        .get(`/api/disputa-v2/item/${itemId}/melhores`)
        .expect(200);

      const melhorValor = Number(melhoresResp.body[0]?.melhorValor);
      expect(melhorValor).toBeGreaterThan(0);

      // Tenta dar lance igual ao melhor (deve ser rejeitado)
      const resp = await request(app.getHttpServer())
        .post(`/api/disputa-v2/sessao/${sessaoId}/lance`)
        .send({
          itemId,
          fornecedorId: forn.id,
          fornecedorNome: forn.nome,
          valor: melhorValor,
        });

      expect(resp.status).toBe(400);
    });

    it('verifica histórico completo de lances — ao menos 5 no Item 1', async () => {
      const resp = await request(app.getHttpServer())
        .get(`/api/disputa-v2/item/${itemIds[0]}/lances`)
        .expect(200);

      // Deve haver ao menos 5 lances (um de cada fornecedor, do bloco anterior)
      expect(resp.body.length).toBeGreaterThanOrEqual(5);
    });

    it('verifica ranking final do Item 1 — menor valor em primeiro', async () => {
      const resp = await request(app.getHttpServer())
        .get(`/api/disputa-v2/item/${itemIds[0]}/melhores`)
        .expect(200);

      expect(Array.isArray(resp.body)).toBe(true);
      expect(resp.body.length).toBeGreaterThanOrEqual(1);

      // forn[4] deve ser o líder (menor multiplicador = menor proposta = menor lance)
      const lider = resp.body[0];
      expect(lider.fornecedorId).toBe(fornecedores[4].id);
    });
  });

  // ============================================================================
  // BLOCO 6 — Integridade da Sessão V3
  // ============================================================================

  describe('Bloco 6 — Contexto V3 (disputa-v3)', () => {
    it('retorna contexto V3 com modo ABERTO e base legal correta', async () => {
      const resp = await request(app.getHttpServer())
        .get(`/api/disputa-v3/sessao/${sessaoId}/contexto`)
        .set('Authorization', `Bearer ${orgaoToken}`)
        .expect(200);

      const ctx = resp.body;
      expect(ctx.modo).toBe('ABERTO');
      expect(ctx.cronometria.baseLegal).toContain('art. 23');
      expect(ctx.cronometria.requerFluxoEspecificoNaV3).toBe(false);
      // diferencaMinimaLances deve ser propagado da licitação (configuramos R$ 50)
      expect(ctx.cronometria.diferencaMinimaLances).toBe(50);
    });

    it('bloqueia acesso do fornecedor ao board do pregoeiro', async () => {
      /**
       * Valida correção de segurança aplicada no controller:
       * fornecedor que omite ?fornecedorId= deve receber a visão do PRÓPRIO fornecedor,
       * não a do pregoeiro (que contém solicitações de cancelamento em fase sigilosa).
       */
      const forn = fornecedores[0];

      // Com token de FORNECEDOR, sem query param → deve retornar visão do fornecedor
      const resp = await request(app.getHttpServer())
        .get(`/api/disputa-v3/sessao/${sessaoId}/board`)
        .set('Authorization', `Bearer ${forn.token}`)
        .expect(200);

      // Visão do fornecedor NÃO deve conter solicitacoesCancelamento (campo do pregoeiro)
      expect(resp.body.solicitacoesCancelamento).toBeUndefined();
    });
  });
});
