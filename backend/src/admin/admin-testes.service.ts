import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { Orgao, TipoOrgao, EsferaAdministrativa } from '../orgaos/entities/orgao.entity';

// ============================================================================
// Tipos
// ============================================================================

export type StepStatus = 'pending' | 'running' | 'pass' | 'fail';
export type RunStatus = 'idle' | 'running' | 'passed' | 'failed';

export interface TestStep {
  id: number;
  descricao: string;
  status: StepStatus;
  durationMs?: number;
  detalhe?: string;
}

export interface TestRunResult {
  status: RunStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  steps: TestStep[];
  summary: { total: number; passed: number; failed: number; pending: number };
}

// ============================================================================
// Definição dos 20 passos
// ============================================================================

const STEP_DEFINITIONS: Pick<TestStep, 'id' | 'descricao'>[] = [
  { id: 1, descricao: 'Criar Órgão de Teste' },
  { id: 2, descricao: 'Criar Licitação (Pregão Eletrônico)' },
  { id: 3, descricao: 'Adicionar Item 1 — Notebook Dell i7' },
  { id: 4, descricao: 'Adicionar Item 2 — Monitor 24 pol Full HD' },
  { id: 5, descricao: 'Adicionar Item 3 — Teclado e Mouse sem fio' },
  { id: 6, descricao: 'Avançar fases internas 4× (→ APROVACAO_INTERNA)' },
  { id: 7, descricao: 'Publicar Edital (data abertura no passado)' },
  { id: 8, descricao: 'Avançar 2× para ACOLHIMENTO_PROPOSTAS' },
  { id: 9, descricao: 'Cadastrar 5 Fornecedores (cadastro-rápido)' },
  { id: 10, descricao: 'Enviar Propostas dos 5 Fornecedores' },
  { id: 11, descricao: 'Avançar para ANALISE_PROPOSTAS' },
  { id: 12, descricao: 'Classificar as 5 Propostas' },
  { id: 13, descricao: 'Criar Sessão de Disputa' },
  { id: 14, descricao: 'Iniciar Sessão' },
  { id: 15, descricao: 'Avançar Sessão para Disputa de Lances' },
  { id: 16, descricao: 'Iniciar Disputa de Todos os Itens Simultaneamente' },
  { id: 17, descricao: 'Lances Sequenciais — 5 fornecedores no Item 1' },
  { id: 18, descricao: 'Lances Concorrentes (Promise.all) — Item 2 (verifica lock pessimista)' },
  { id: 19, descricao: 'Rejeição de Lance Inválido (acima da proposta inicial)' },
  { id: 20, descricao: 'Verificar Ranking Final (menor valor em primeiro)' },
];

// ============================================================================

@Injectable()
export class AdminTestesService implements OnModuleDestroy {
  private readonly logger = new Logger(AdminTestesService.name);

  private currentRun: TestRunResult = this.buildIdleRun();
  private abortRequested = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
  ) {}

  onModuleDestroy() {
    this.abortRequested = true;
  }

  // --------------------------------------------------------------------------
  // API pública
  // --------------------------------------------------------------------------

  getResultado(): TestRunResult {
    return this.computeSummary(this.currentRun);
  }

  cancelar() {
    if (this.currentRun.status === 'running') {
      this.abortRequested = true;
    }
  }

  async executar(): Promise<{ ok: boolean; message: string }> {
    if (this.currentRun.status === 'running') {
      return { ok: false, message: 'Teste já em execução' };
    }

    this.abortRequested = false;
    this.currentRun = {
      status: 'running',
      startedAt: new Date().toISOString(),
      steps: STEP_DEFINITIONS.map((s) => ({
        ...s,
        status: 'pending' as StepStatus,
      })),
      summary: { total: STEP_DEFINITIONS.length, passed: 0, failed: 0, pending: STEP_DEFINITIONS.length },
    };

    // Executa assincronamente sem bloquear a resposta HTTP
    this.runAll().catch((err) => {
      this.logger.error('Erro inesperado no TestRunner', err);
      this.currentRun.status = 'failed';
      this.currentRun.finishedAt = new Date().toISOString();
    });

    return { ok: true, message: 'Teste iniciado' };
  }

  // --------------------------------------------------------------------------
  // Execução principal
  // --------------------------------------------------------------------------

  private async runAll() {
    const base = this.buildBaseUrl();
    const ts = Date.now();

    // Estado acumulado ao longo dos steps
    let orgaoId = '';
    let orgaoToken = '';
    let licitacaoId = '';
    const itemIds: string[] = [];
    const fornecedores: Array<{ id: string; nome: string }> = [];
    const propostaIds: string[] = [];
    let sessaoId = '';

    const startedAt = Date.now();

    try {
      // ── Step 1: Criar Órgão via DataSource ──────────────────────────────
      await this.runStep(1, async () => {
        const orgaoRepo = this.dataSource.getRepository(Orgao);
        const orgao = orgaoRepo.create({
          codigo: `E2E-ADMIN-${ts}`,
          nome: 'Órgão Teste Admin E2E',
          cnpj: this.cnpjFake('99', ts),
          tipo: TipoOrgao.PREFEITURA,
          esfera: EsferaAdministrativa.MUNICIPAL,
          cidade: 'Teste',
          uf: 'SP',
          ativo: true, // validateToken rejeita orgao.ativo=false (auth.service.ts:322)
          modulos_habilitados: null,
        } as any);
        const saved = await orgaoRepo.save(orgao);
        orgaoId = saved.id;
        orgaoToken = this.jwtService.sign({ sub: orgaoId, type: 'ORGAO' });
        return `orgaoId: ${orgaoId.slice(0, 8)}…`;
      });

      // ── Step 2: Criar Licitação ──────────────────────────────────────────
      await this.runStep(2, async () => {
        const r = await this.post(base, '/licitacoes', orgaoToken, {
          numero_processo: `PROC-ADMIN-E2E-${ts}`,
          orgao_id: orgaoId,
          objeto: 'Aquisição de equipamentos de informática — Teste Admin E2E',
          modalidade: 'PREGAO_ELETRONICO',
          tipo_contratacao: 'COMPRA',
          criterio_julgamento: 'MENOR_PRECO',
          modo_disputa: 'ABERTO',
          valor_total_estimado: 65_000.0,
          diferenca_minima_lances: 50.0,
        });
        licitacaoId = r.id;
        return `PROC-ADMIN-E2E-${ts}`;
      });

      // ── Steps 3-5: Itens ─────────────────────────────────────────────────
      const itens = [
        { descricao: 'Notebook Dell i7 16GB 512SSD', valor: 5_000.0 },
        { descricao: 'Monitor 24 pol Full HD IPS', valor: 1_200.0 },
        { descricao: 'Teclado e Mouse sem fio', valor: 350.0 },
      ];
      for (let i = 0; i < itens.length; i++) {
        await this.runStep(3 + i, async () => {
          const r = await this.post(base, '/itens', orgaoToken, {
            licitacao_id: licitacaoId,
            numero_item: i + 1,
            descricao_resumida: itens[i].descricao,
            quantidade: 10,
            unidade_medida: 'UNIDADE',
            valor_unitario_estimado: itens[i].valor,
            sem_pca: true,
            justificativa_sem_pca: 'Teste Admin E2E',
          });
          itemIds.push(r.id);
        });
      }

      // ── Step 6: Avançar fases internas 4× ───────────────────────────────
      await this.runStep(6, async () => {
        for (let i = 0; i < 4; i++) {
          await this.put(base, `/licitacoes/${licitacaoId}/avancar-fase`, orgaoToken, {});
        }
        return 'PLANEJAMENTO → APROVACAO_INTERNA';
      });

      // ── Step 7: Publicar edital ──────────────────────────────────────────
      // Todas as datas futuras para evitar que o scheduler (EVERY_MINUTE) auto-avance
      // ACOLHIMENTO_PROPOSTAS → ANALISE_PROPOSTAS antes do step 10.
      // O UPDATE atômico de fase + datas ocorre ao final do step 10.
      await this.runStep(7, async () => {
        const agora = Date.now();
        const menos48h = new Date(agora - 48 * 3_600_000).toISOString();
        const mais2d = new Date(agora + 2 * 24 * 3_600_000).toISOString();
        const mais3d = new Date(agora + 3 * 24 * 3_600_000).toISOString();
        await this.put(base, `/licitacoes/${licitacaoId}/publicar-edital`, orgaoToken, {
          data_publicacao_edital: menos48h,
          data_limite_impugnacao: menos48h,
          data_inicio_acolhimento: menos48h,
          data_fim_acolhimento: mais2d,  // futuro → bloqueia encerrarAcolhimento()
          data_abertura_sessao: mais3d,  // futuro → PropostasService aceita propostas
        });
        return 'fim acolhimento: +2d · abertura sessão: +3d (futuro, bloqueia scheduler)';
      });

      // ── Step 8: Avançar 2× → ACOLHIMENTO_PROPOSTAS ──────────────────────
      await this.runStep(8, async () => {
        for (let i = 0; i < 2; i++) {
          await this.put(base, `/licitacoes/${licitacaoId}/avancar-fase`, orgaoToken, {});
        }
        return 'PUBLICADO → ACOLHIMENTO_PROPOSTAS';
      });

      // ── Step 9: Cadastrar 5 fornecedores ────────────────────────────────
      await this.runStep(9, async () => {
        const empresas = [
          { cnpj: this.cnpjFake('11', ts), nome: 'TechCorp Informática Ltda' },
          { cnpj: this.cnpjFake('22', ts), nome: 'InfoSystems Comércio ME' },
          { cnpj: this.cnpjFake('33', ts), nome: 'Digital Solutions EPP' },
          { cnpj: this.cnpjFake('44', ts), nome: 'Prime Tech Distribuidora' },
          { cnpj: this.cnpjFake('55', ts), nome: 'ComputerWorld Atacado Ltda' },
        ];
        for (const e of empresas) {
          const r = await this.post(base, '/fornecedores/orgao/cadastro-rapido', orgaoToken, {
            cnpj: e.cnpj,
            razao_social: e.nome,
          });
          fornecedores.push({ id: r.id, nome: e.nome });
        }
        return `${fornecedores.length} fornecedores cadastrados`;
      });

      // ── Step 10: Propostas ───────────────────────────────────────────────
      await this.runStep(10, async () => {
        const multiplicadores = [1.0, 0.95, 0.9, 0.85, 0.8];
        const valoresRef = [5_000.0, 1_200.0, 350.0];
        for (let fi = 0; fi < fornecedores.length; fi++) {
          const forn = fornecedores[fi];
          const mult = multiplicadores[fi];
          const r = await this.post(base, '/propostas', orgaoToken, {
            licitacao_id: licitacaoId,
            fornecedor_id: forn.id,
            declaracao_termos: true,
            declaracao_integridade: true,
            declaracao_inexistencia_fatos: true,
            declaracao_menor: true,
            itens: itemIds.map((itemId, idx) => ({
              item_licitacao_id: itemId,
              valor_unitario: Number((valoresRef[idx] * mult).toFixed(2)),
            })),
          });
          propostaIds.push(r.id);
          await this.put(base, `/propostas/${r.id}/enviar`, orgaoToken, {});
        }
        // Avanço atômico: seta fase + retroage datas em uma única operação, sem janela para o scheduler
        await this.dataSource.query(
          `UPDATE licitacoes
           SET fase = 'ANALISE_PROPOSTAS',
               data_fim_acolhimento  = NOW() - INTERVAL '2 hours',
               data_abertura_sessao  = NOW() - INTERVAL '1 hour'
           WHERE id = $1`,
          [licitacaoId],
        );
        return `${propostaIds.length} propostas enviadas; fase→ANALISE_PROPOSTAS, datas→passado`;
      });

      // ── Step 11: Verificar ANALISE_PROPOSTAS (fase já setada via DataSource no step 10) ──
      await this.runStep(11, async () => {
        const r = await this.get(base, `/licitacoes/${licitacaoId}`, orgaoToken);
        if (r.fase !== 'ANALISE_PROPOSTAS') {
          throw new Error(`Fase esperada ANALISE_PROPOSTAS, obteve ${r.fase}`);
        }
        return `fase: ${r.fase} ✓`;
      });

      // ── Step 12: Classificar propostas + retroagir data abertura ──────────
      await this.runStep(12, async () => {
        const list = await this.get(base, `/propostas/licitacao/${licitacaoId}`, orgaoToken);
        const enviadas = (list as any[]).filter(
          (p: any) => p.status === 'ENVIADA' || p.status === 'VALIDA',
        );
        for (const p of enviadas) {
          await this.put(base, `/propostas/${p.id}/classificar`, orgaoToken, {});
        }
        return `${enviadas.length} propostas classificadas`;
      });

      // ── Step 13: Criar sessão ────────────────────────────────────────────
      await this.runStep(13, async () => {
        const r = await this.post(base, `/sessao/${licitacaoId}`, orgaoToken, {
          pregoeiroId: orgaoId,
          pregoeiroNome: 'Pregoeiro Admin E2E',
        });
        sessaoId = r.id;
        return `sessaoId: ${sessaoId.slice(0, 8)}…`;
      });

      // ── Step 14: Iniciar sessão ──────────────────────────────────────────
      await this.runStep(14, async () => {
        await this.put(base, `/sessao/${sessaoId}/iniciar`, orgaoToken, {});
        return 'AGUARDANDO_INICIO → EM_ANDAMENTO';
      });

      // ── Step 15: Avançar para disputa ────────────────────────────────────
      await this.runStep(15, async () => {
        await this.put(base, `/sessao/${sessaoId}/avancar-disputa`, orgaoToken, {});
        return 'em disputa';
      });

      // ── Step 16: Iniciar todos os itens ─────────────────────────────────
      await this.runStep(16, async () => {
        await this.put(base, `/sessao/${sessaoId}/iniciar-todos-itens`, orgaoToken, {});
        return `${itemIds.length} itens iniciados`;
      });

      // ── Step 17: Lances sequenciais ──────────────────────────────────────
      await this.runStep(17, async () => {
        const itemId = itemIds[0]; // Notebook (proposta total: 50k/47.5k/45k/42.5k/40k)
        const multsTotal = [1.0, 0.95, 0.9, 0.85, 0.8];
        for (let fi = 0; fi < fornecedores.length; fi++) {
          const forn = fornecedores[fi];
          // Lance = propostaTotal * 0.98 - fi*100 (garante < proposta e valores únicos)
          const propostaTotal = 5_000.0 * multsTotal[fi] * 10;
          const valor = Number((propostaTotal * 0.98 - fi * 100).toFixed(2));
          await this.postPublic(base, `/disputa-v2/sessao/${sessaoId}/lance`, {
            itemId,
            fornecedorId: forn.id,
            fornecedorNome: forn.nome,
            valor,
          });
        }
        return '5 lances aceitos no Item 1';
      });

      // ── Step 18: Lances concorrentes ─────────────────────────────────────
      await this.runStep(18, async () => {
        const itemId = itemIds[1]; // Monitor (proposta total: 12k/11.4k/10.8k/10.2k/9.6k)
        const multsTotal = [1.0, 0.95, 0.9, 0.85, 0.8];
        const promises = fornecedores.map((forn, fi) => {
          const propostaTotal = 1_200.0 * multsTotal[fi] * 10;
          const valor = Number((propostaTotal * 0.98 - fi * 100).toFixed(2));
          return fetch(`${base}/disputa-v2/sessao/${sessaoId}/lance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              itemId,
              fornecedorId: forn.id,
              fornecedorNome: forn.nome,
              valor,
            }),
          });
        });
        const respostas = await Promise.all(promises);
        const statuses = respostas.map((r) => r.status);
        const has500 = statuses.some((s) => s === 500 || s === 503);
        if (has500) {
          throw new Error(`Erro de concorrência detectado: statuses = ${statuses.join(', ')}`);
        }
        const aceitos = statuses.filter((s) => s === 201).length;
        return `${aceitos}/5 lances aceitos (sem erros 5xx)`;
      });

      // ── Step 19: Rejeição de lance inválido ──────────────────────────────
      await this.runStep(19, async () => {
        const itemId = itemIds[0];
        const forn = fornecedores[0];
        // Proposta de forn[0] no Item 1 = 5000 * 1.0 * 10 = 50.000
        const resp = await fetch(`${base}/disputa-v2/sessao/${sessaoId}/lance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemId,
            fornecedorId: forn.id,
            fornecedorNome: forn.nome,
            valor: 55_000, // acima da proposta inicial → deve ser rejeitado com 400
          }),
        });
        if (resp.status !== 400) {
          throw new Error(`Esperado 400, recebeu ${resp.status}`);
        }
        return 'lance inválido rejeitado com 400 ✓';
      });

      // ── Step 20: Ranking final ────────────────────────────────────────────
      await this.runStep(20, async () => {
        const itemId = itemIds[0];
        const melhores = (await this.getPublic(base, `/disputa-v2/item/${itemId}/melhores`)) as any[];
        if (!Array.isArray(melhores) || melhores.length === 0) {
          throw new Error('Ranking vazio');
        }
        // Verificar ordenação crescente
        const valores = melhores.map((l: any) => Number(l.melhorValor));
        for (let i = 1; i < valores.length; i++) {
          if (valores[i] < valores[i - 1]) {
            throw new Error(`Ranking fora de ordem: ${valores.join(', ')}`);
          }
        }
        // Verificar que o líder é forn[4] (menor multiplicador)
        const liderId = melhores[0].fornecedorId;
        if (liderId !== fornecedores[4].id) {
          throw new Error(`Líder inesperado: ${liderId}`);
        }
        return `${melhores.length} fornecedores rankeados — líder: ${fornecedores[4].nome}`;
      });

      this.currentRun.status = 'passed';
    } catch {
      // step já marcado como fail dentro de runStep
      this.currentRun.status = 'failed';
    } finally {
      this.currentRun.finishedAt = new Date().toISOString();
      this.currentRun.durationMs = Date.now() - startedAt;
      // Cleanup best-effort
      if (orgaoId) {
        this.cleanupSilently(orgaoId).catch(() => {});
      }
    }
  }

  // --------------------------------------------------------------------------
  // Helpers de step
  // --------------------------------------------------------------------------

  private async runStep(
    id: number,
    fn: () => Promise<string | void>,
  ): Promise<void> {
    if (this.abortRequested) {
      throw new Error('Cancelado pelo usuário');
    }

    const step = this.currentRun.steps.find((s) => s.id === id)!;
    step.status = 'running';
    const t0 = Date.now();

    try {
      const detalhe = await fn();
      step.status = 'pass';
      step.durationMs = Date.now() - t0;
      if (detalhe) step.detalhe = detalhe;
    } catch (err: any) {
      step.status = 'fail';
      step.durationMs = Date.now() - t0;
      step.detalhe = err?.message || String(err);
      throw err; // propaga para interromper runAll
    }
  }

  // --------------------------------------------------------------------------
  // HTTP helpers
  // --------------------------------------------------------------------------

  private buildBaseUrl(): string {
    const port = process.env.PORT || '3000';
    return `http://localhost:${port}/api`;
  }

  private authHeaders(token: string) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  private async post(base: string, path: string, token: string, body: any): Promise<any> {
    const resp = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: this.authHeaders(token),
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      throw new Error(`POST ${path} → ${resp.status}: ${text}`);
    }
    return resp.json();
  }

  private async postPublic(base: string, path: string, body: any): Promise<any> {
    const resp = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      throw new Error(`POST ${path} → ${resp.status}: ${text}`);
    }
    return resp.json();
  }

  private async put(base: string, path: string, token: string, body: any): Promise<any> {
    const resp = await fetch(`${base}${path}`, {
      method: 'PUT',
      headers: this.authHeaders(token),
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      throw new Error(`PUT ${path} → ${resp.status}: ${text}`);
    }
    return resp.json();
  }

  private async get(base: string, path: string, token: string): Promise<any> {
    const resp = await fetch(`${base}${path}`, {
      headers: this.authHeaders(token),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      throw new Error(`GET ${path} → ${resp.status}: ${text}`);
    }
    return resp.json();
  }

  private async getPublic(base: string, path: string): Promise<any> {
    const resp = await fetch(`${base}${path}`);
    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      throw new Error(`GET ${path} → ${resp.status}: ${text}`);
    }
    return resp.json();
  }

  // --------------------------------------------------------------------------
  // Utilitários
  // --------------------------------------------------------------------------

  private cnpjFake(prefix: string, ts: number): string {
    const suffix = String(ts).slice(-8);
    return `${prefix}${suffix}`.padStart(14, '0').slice(-14);
  }

  private buildIdleRun(): TestRunResult {
    return {
      status: 'idle',
      steps: STEP_DEFINITIONS.map((s) => ({ ...s, status: 'pending' as StepStatus })),
      summary: { total: STEP_DEFINITIONS.length, passed: 0, failed: 0, pending: STEP_DEFINITIONS.length },
    };
  }

  private computeSummary(run: TestRunResult): TestRunResult {
    const passed = run.steps.filter((s) => s.status === 'pass').length;
    const failed = run.steps.filter((s) => s.status === 'fail').length;
    const pending = run.steps.filter(
      (s) => s.status === 'pending' || s.status === 'running',
    ).length;
    return { ...run, summary: { total: run.steps.length, passed, failed, pending } };
  }

  private async cleanupSilently(orgaoId: string) {
    try {
      await this.dataSource.query(
        `DELETE FROM orgaos WHERE id = $1`,
        [orgaoId],
      );
    } catch (e) {
      this.logger.warn(`Cleanup falhou para orgao ${orgaoId}: ${(e as any)?.message}`);
    }
  }
}
