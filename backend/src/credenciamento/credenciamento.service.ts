import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import {
  FaseLicitacao,
  Licitacao,
  ModalidadeLicitacao,
  SituacaoLicitacao,
  TipoContratacao,
} from '../licitacoes/entities/licitacao.entity';
import { ItemLicitacao, UnidadeMedida } from '../itens/entities/item-licitacao.entity';
import { FASES_INTERNAS } from '../licitacoes/transicoes/fases';
import { TransicoesService } from '../licitacoes/transicoes/transicoes.service';
import { AtoLicitacao, AtorTransicao, atorTransicaoDe } from '../licitacoes/transicoes/transicoes.tipos';
import { HabilitacaoService } from '../habilitacao/habilitacao.service';
import { ContratosService } from '../contratos/contratos.service';
import { CategoriaContrato, StatusContrato, TipoContrato } from '../contratos/entities/contrato.entity';
import { ItemContrato, UnidadeMedidaContrato } from '../almoxarifado/entities/item-contrato.entity';
import { hojeBrasilia, somarDias } from '../atas/regras-arp';
import { calendarioDoOrgao } from '../common/prazos/dias-uteis';
import { conferirSorteio } from '../julgamento/sorteio';
import { editalVigenteSql } from '../publicacao/publicacao.sql';
import { exigenciasDaLicitacaoSql, garantirExigenciasSql } from '../habilitacao/habilitacao.sql';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { PrioridadeNotificacao, TipoNotificacao } from '../notificacoes/entities/notificacao.entity';
import type { Ator } from '../auth/acesso/ator';
import {
  ConfiguracaoCredenciamento,
  ContratacaoCredenciamento,
  InscricaoCredenciamento,
} from './entities/credenciamento.entity';
import {
  CredenciadoNaFila,
  HipoteseCredenciamento,
  IniciativaDescredenciamento,
  MOTIVO_MINIMO_CREDENCIAMENTO,
  REGRAS_POR_HIPOTESE,
  ROTULO_HIPOTESE,
  ROTULO_REGRA,
  RegraDistribuicao,
  StatusInscricao,
  StatusRecursoInscricao,
  STATUS_RECURSO_INSCRICAO_PENDENTES,
  TAMANHO_MINIMO_FUNDAMENTACAO,
  atrasosRecursoInscricao,
  motivoNaoDecideAutoridade,
  motivoNaoReconsidera,
  prazoAutoridadeInscricao,
  prazoReconsideracaoInscricao,
  arred2,
  efeitoDoDescredenciamento,
  ehHipotese,
  ehRegra,
  escolhaDivisaoIgualitaria,
  escolhaPorCotacao,
  motivoInelegivel,
  motivoNaoInscreve,
  motivoRegraIncompativel,
  pendenciasEditalCredenciamento,
  prazoRecursoInscricao,
  proximoDoRodizio,
  regraPadrao,
  sorteioDaDemanda,
  statusEfetivoInscricao,
  validadeDoCredenciado,
} from './regras-credenciamento';
import { estadoEditalCredenciamentoSql } from './credenciamento.sql';
import { aplicarEstadoCompraPncp } from '../pncp/estado-compra-pncp';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ehUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

/** Campos do cadastro do credenciamento (licitação + configuração) editáveis na fase interna. */
export interface DadosCredenciamento {
  numero_processo?: string;
  numero_edital?: string;
  objeto?: string;
  objeto_detalhado?: string | null;
  justificativa?: string | null;
  tipo_contratacao?: string;
  observacoes?: string | null;
  hipotese?: string;
  regra_distribuicao?: string;
  vigencia_inicio?: string | Date | null;
  vigencia_fim?: string | Date | null;
  validade_credenciado_meses?: number | null;
  condicoes_padronizadas?: string | null;
  regras_distribuicao_texto?: string | null;
  prazo_denuncia_dias?: number | null;
  itens?: Array<{ descricao?: string; descricao_detalhada?: string; quantidade?: number; unidade_medida?: string; valor_unitario?: number; tipo_item?: string }>;
}

/** Arquivo das razões do recurso (multipart). */
export interface ArquivoRecurso {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface PedidoContratacao {
  descricao?: string;
  itens?: Array<{ item_id?: string; quantidade?: number }>;
  prazo_execucao_dias?: number;
  /** Hipótese II: escolha do beneficiário (art. 79 II). */
  beneficiario?: { inscricao_id?: string; nome?: string; documento?: string; justificativa?: string };
  /** Hipótese III: cotações de mercado no momento da contratação (art. 79 par. único IV). */
  cotacoes?: Array<{ inscricao_id?: string; valor_unitario?: number; fonte?: string }>;
}

/**
 * ============================================================================
 * CREDENCIAMENTO COMO PROCESSO (plano E7b — Lei 14.133/2021 arts. 6º XLIII,
 * 78 I, 79 e 74 IV)
 * ============================================================================
 *
 *  - PROCESSO: licitação com modalidade CREDENCIAMENTO (fase interna com a
 *    instrução do art. 72, edital real, PNCP pela fila, cockpit, máquina de
 *    estados) + `credenciamento_configuracoes` (hipótese, regra, vigência,
 *    condições padronizadas, valor fixado nos itens, prazo de denúncia).
 *  - INSCRIÇÃO a qualquer tempo durante a vigência (art. 79 par. único I),
 *    documentos pela HABILITAÇÃO da E4 (exigências do edital + registro
 *    cadastral, envio sem substituição, diligência, análise por documento).
 *  - DEFERIR / INDEFERIR (motivo; recurso em 3 dias úteis — art. 165 I) e
 *    DECIDIR_RECURSO; CONTRATAR pela regra do edital (rodízio, sorteio
 *    auditável, divisão igualitária, escolha do beneficiário, cotação) com
 *    contrato por inexigibilidade (art. 74 IV); DESCREDENCIAR / denúncia com
 *    aviso (par. único VI). Todos pela máquina de estados (trava, histórico).
 *  - ENCERRAMENTO: fim da vigência pelo relógio da licitação
 *    (LicitacoesSchedulerService → ENCERRAR_ACOLHIMENTO do fluxo do
 *    credenciamento = situação CONCLUIDA; pendentes arquivadas).
 */
@Injectable()
export class CredenciamentoService {
  private readonly logger = new Logger(CredenciamentoService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly transicoes: TransicoesService,
    private readonly habilitacao: HabilitacaoService,
    private readonly contratos: ContratosService,
    @Optional() private readonly notificacoes?: NotificacoesService,
  ) {}

  // ==========================================================================
  // APOIO
  // ==========================================================================

  private async processo(m: EntityManager, id: string) {
    if (!ehUuid(id)) throw new NotFoundException('Credenciamento não encontrado');
    const [l] = await m.query(
      `SELECT l.id, l.orgao_id::text AS orgao_id, l.numero_processo, l.numero_edital, l.objeto, l.objeto_detalhado, l.justificativa,
              l.tipo_contratacao::text AS tipo_contratacao, l.fase::text AS fase, COALESCE(l.situacao::text, 'ATIVA') AS situacao,
              l.valor_total_estimado, l.data_publicacao_edital, l.data_inicio_acolhimento, l.data_fim_acolhimento,
              l.observacoes, l.created_at, l.fase_interna_concluida
         FROM licitacoes l WHERE l.id::text = $1 AND l.modalidade::text = 'CREDENCIAMENTO'`,
      [id],
    );
    if (!l) throw new NotFoundException('Credenciamento não encontrado');
    return l;
  }

  private async configuracao(m: EntityManager, id: string): Promise<ConfiguracaoCredenciamento | null> {
    return m.findOne(ConfiguracaoCredenciamento, { where: { licitacao_id: id } });
  }

  private async itens(m: EntityManager, id: string) {
    const rows: any[] = await m.query(
      `SELECT id::text AS id, numero_item, descricao_resumida, descricao_detalhada, quantidade, unidade_medida::text AS unidade_medida,
              valor_unitario_estimado, valor_total_estimado, tipo_item
         FROM itens_licitacao WHERE licitacao_id::text = $1 ORDER BY numero_item`,
      [id],
    );
    return rows.map((i) => ({
      ...i,
      numero_item: Number(i.numero_item),
      quantidade: Number(i.quantidade),
      valor_unitario_estimado: Number(i.valor_unitario_estimado),
      valor_total_estimado: Number(i.valor_total_estimado),
    }));
  }

  /** Denúncia com o aviso vencido vira DESCREDENCIADO no banco (o relógio decide; leitura grava). */
  private async normalizarDescredenciamentos(m: EntityManager, licitacaoId: string): Promise<void> {
    // Relógio do Node (as colunas `timestamp` guardam o horário local do app — convenção do projeto)
    await m.query(
      `UPDATE credenciamento_inscricoes SET status = 'DESCREDENCIADO', updated_at = $2
        WHERE licitacao_id::text = $1 AND status = 'CREDENCIADO' AND descredenciamento_efeitos_em IS NOT NULL AND descredenciamento_efeitos_em <= $2`,
      [licitacaoId, new Date()],
    );
  }

  private exigirMotivo(motivo: string | undefined | null, oque: string): string {
    const t = (motivo ?? '').trim();
    if (t.length < MOTIVO_MINIMO_CREDENCIAMENTO) throw new BadRequestException(`Informe ${oque} (mín. ${MOTIVO_MINIMO_CREDENCIAMENTO} caracteres)`);
    return t;
  }

  private dataOuNull(v: unknown, campo: string): Date | null {
    if (v == null || v === '') return null;
    const d = new Date(v as any);
    if (Number.isNaN(d.getTime())) throw new BadRequestException(`${campo} inválida`);
    return d;
  }

  private notificar(licitacaoId: string, orgaoId: string, fornecedorId: string, titulo: string, mensagem: string): void {
    if (!this.notificacoes) return;
    void (async () => {
      try {
        const [f] = await this.ds.query(`SELECT email FROM fornecedores WHERE id::text = $1`, [fornecedorId]);
        await this.notificacoes!.criar({
          orgao_id: orgaoId,
          usuario_id: fornecedorId,
          usuario_email: f?.email ?? undefined,
          tipo: TipoNotificacao.SISTEMA,
          titulo,
          mensagem,
          prioridade: PrioridadeNotificacao.ALTA,
          entidade_tipo: 'licitacao',
          entidade_id: licitacaoId,
          link: `/fornecedor/credenciamentos/${licitacaoId}`,
          enviar_email: !!f?.email,
          metadata: { origem: 'credenciamento' },
        });
      } catch (e: any) {
        this.logger.warn(`Notificação do credenciamento não enviada (${licitacaoId}/${fornecedorId}): ${e?.message ?? e}`);
      }
    })();
  }

  // ==========================================================================
  // CADASTRO (fase interna)
  // ==========================================================================

  private validarConfig(d: DadosCredenciamento, atual?: ConfiguracaoCredenciamento | null) {
    const hipotese = d.hipotese ?? atual?.hipotese ?? HipoteseCredenciamento.PARALELA_NAO_EXCLUDENTE;
    if (!ehHipotese(hipotese)) throw new BadRequestException('Hipótese inválida (PARALELA_NAO_EXCLUDENTE, SELECAO_POR_TERCEIROS ou MERCADO_FLUIDO — art. 79, I a III)');
    let regra = d.regra_distribuicao ?? atual?.regra_distribuicao ?? regraPadrao(hipotese);
    // Mudou a hipótese sem dizer a regra: a regra antiga pode não valer mais
    if (d.hipotese && !d.regra_distribuicao && ehRegra(regra) && !REGRAS_POR_HIPOTESE[hipotese].includes(regra)) regra = regraPadrao(hipotese);
    const incompat = motivoRegraIncompativel(hipotese, regra);
    if (incompat) throw new BadRequestException(incompat);
    const meses = d.validade_credenciado_meses === undefined ? atual?.validade_credenciado_meses ?? null : d.validade_credenciado_meses;
    if (meses != null && (!Number.isInteger(Number(meses)) || Number(meses) < 1)) throw new BadRequestException('Validade do credenciamento: meses inteiros ≥ 1 (ou vazio = até o fim da vigência)');
    const prazo = d.prazo_denuncia_dias === undefined ? atual?.prazo_denuncia_dias ?? null : d.prazo_denuncia_dias;
    if (prazo != null && (!Number.isInteger(Number(prazo)) || Number(prazo) < 1)) throw new BadRequestException('Prazo de aviso da denúncia: dias inteiros ≥ 1');
    const ini = d.vigencia_inicio === undefined ? atual?.vigencia_inicio ?? null : this.dataOuNull(d.vigencia_inicio, 'Início da vigência');
    const fim = d.vigencia_fim === undefined ? atual?.vigencia_fim ?? null : this.dataOuNull(d.vigencia_fim, 'Fim da vigência');
    if (ini && fim && fim.getTime() <= ini.getTime()) throw new BadRequestException('O fim da vigência do edital deve ser posterior ao início');
    return {
      hipotese,
      regra_distribuicao: regra as string,
      vigencia_inicio: ini,
      vigencia_fim: fim,
      validade_credenciado_meses: meses == null ? null : Number(meses),
      prazo_denuncia_dias: prazo == null ? null : Number(prazo),
      condicoes_padronizadas: d.condicoes_padronizadas === undefined ? atual?.condicoes_padronizadas ?? null : (d.condicoes_padronizadas ?? '').trim() || null,
      regras_distribuicao_texto:
        d.regras_distribuicao_texto === undefined ? atual?.regras_distribuicao_texto ?? null : (d.regras_distribuicao_texto ?? '').trim() || null,
    };
  }

  private async gravarItens(m: EntityManager, licitacaoId: string, itens: NonNullable<DadosCredenciamento['itens']>): Promise<number> {
    const unidades = Object.values(UnidadeMedida) as string[];
    let total = 0;
    await m.query(`DELETE FROM itens_licitacao WHERE licitacao_id::text = $1`, [licitacaoId]);
    for (let i = 0; i < itens.length; i++) {
      const e = itens[i] || {};
      const descricao = String(e.descricao ?? '').trim();
      if (!descricao) throw new BadRequestException(`Item ${i + 1}: informe a descrição`);
      const qtd = Number(e.quantidade ?? 1);
      const valor = Number(e.valor_unitario ?? 0);
      if (!(qtd > 0)) throw new BadRequestException(`Item ${i + 1}: quantidade estimada deve ser maior que zero`);
      if (valor < 0 || !Number.isFinite(valor)) throw new BadRequestException(`Item ${i + 1}: valor inválido`);
      const unidade = unidades.includes(String(e.unidade_medida)) ? e.unidade_medida : UnidadeMedida.UNIDADE;
      const tipo = e.tipo_item === 'MATERIAL' ? 'MATERIAL' : 'SERVICO';
      total += qtd * valor;
      await m.save(
        m.create(ItemLicitacao, {
          licitacao_id: licitacaoId,
          numero_item: i + 1,
          descricao_resumida: descricao.slice(0, 255),
          descricao_detalhada: e.descricao_detalhada ?? null,
          quantidade: qtd,
          unidade_medida: unidade,
          valor_unitario_estimado: valor,
          valor_total_estimado: arred2(qtd * valor),
          tipo_item: tipo,
          sem_pca: true,
          justificativa_sem_pca: 'Credenciamento: demanda estimada ao longo da vigência do edital (art. 79).',
        } as any),
      );
    }
    return arred2(total);
  }

  async criar(dados: DadosCredenciamento, orgaoId: string, ator: AtorTransicao) {
    const objeto = String(dados?.objeto ?? '').trim();
    if (objeto.length < 5) throw new BadRequestException('Informe o objeto do credenciamento');
    const cfg = this.validarConfig(dados || {});
    const tipo = (Object.values(TipoContratacao) as string[]).includes(String(dados.tipo_contratacao)) ? dados.tipo_contratacao : TipoContratacao.SERVICO;
    const ano = new Date().getFullYear();
    const id = await this.ds.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`credenciamento-numero:${orgaoId}:${ano}`]);
      const [{ n }] = await m.query(
        `SELECT COUNT(*)::int AS n FROM licitacoes WHERE orgao_id::text = $1 AND modalidade::text = 'CREDENCIAMENTO' AND ano = $2`,
        [orgaoId, ano],
      );
      const seq = Number(n) + 1;
      const numeroProcesso = String(dados.numero_processo ?? '').trim() || `CRED-${String(seq).padStart(3, '0')}/${ano}-${randomUUID().slice(0, 4)}`;
      const [dup] = await m.query(`SELECT 1 FROM licitacoes WHERE numero_processo = $1`, [numeroProcesso]);
      if (dup) throw new ConflictException(`Já existe um processo com o número ${numeroProcesso}`);
      const lic = await m.save(
        m.create(Licitacao, {
          numero_processo: numeroProcesso,
          numero_edital: String(dados.numero_edital ?? '').trim() || `${seq}/${ano}`,
          ano,
          sequencial: seq,
          orgao_id: orgaoId,
          objeto,
          objeto_detalhado: dados.objeto_detalhado ?? null,
          justificativa: dados.justificativa ?? null,
          modalidade: ModalidadeLicitacao.CREDENCIAMENTO,
          tipo_contratacao: tipo as TipoContratacao,
          fase: FaseLicitacao.PLANEJAMENTO,
          situacao: SituacaoLicitacao.ATIVA,
          tratamento_diferenciado_mpe: false,
          tipo_beneficio_mpe: 'NENHUM',
          observacoes: dados.observacoes ?? null,
        } as any),
      );
      await m.save(m.create(ConfiguracaoCredenciamento, { licitacao_id: lic.id, ...cfg, origem: null }));
      if (dados.itens?.length) {
        const total = await this.gravarItens(m, lic.id, dados.itens);
        await m.query(`UPDATE licitacoes SET valor_total_estimado = $2 WHERE id = $1`, [lic.id, total]);
      }
      await this.transicoes.registrarCriacao(lic, ator, m, { origem: 'credenciamento' });
      return lic.id;
    });
    return this.visaoOrgao(id);
  }

  /** Alteração do cadastro — só na fase interna (depois da publicação o edital está divulgado). */
  async atualizar(id: string, dados: DadosCredenciamento) {
    await this.ds.transaction(async (m) => {
      const lic = await this.processo(m, id);
      await m.query(`SELECT 1 FROM licitacoes WHERE id = $1 FOR UPDATE`, [id]);
      if (lic.situacao !== 'ATIVA') throw new ConflictException('Credenciamento encerrado ou suspenso — cadastro não pode ser alterado');
      if (!FASES_INTERNAS.includes(lic.fase as FaseLicitacao)) {
        throw new ConflictException('Edital de credenciamento já publicado: as regras divulgadas não se alteram pelo cadastro (revogue e republique, se for o caso).');
      }
      const atual = await this.configuracao(m, id);
      const cfg = this.validarConfig(dados || {}, atual);
      await m.save(m.create(ConfiguracaoCredenciamento, { ...(atual ?? {}), licitacao_id: id, ...cfg }));
      const campos: Record<string, any> = {};
      for (const c of ['objeto', 'objeto_detalhado', 'justificativa', 'numero_edital', 'observacoes'] as const) {
        if (dados[c] !== undefined) campos[c] = dados[c];
      }
      if (dados.tipo_contratacao && (Object.values(TipoContratacao) as string[]).includes(dados.tipo_contratacao)) campos.tipo_contratacao = dados.tipo_contratacao;
      if (campos.objeto !== undefined && String(campos.objeto ?? '').trim().length < 5) throw new BadRequestException('Informe o objeto do credenciamento');
      if (dados.itens) campos.valor_total_estimado = await this.gravarItens(m, id, dados.itens);
      if (Object.keys(campos).length) await m.getRepository(Licitacao).update({ id }, campos);
    });
    return this.visaoOrgao(id);
  }

  // ==========================================================================
  // LEITURAS
  // ==========================================================================

  private visaoConfig(c: ConfiguracaoCredenciamento | null) {
    if (!c) return null;
    return {
      hipotese: c.hipotese,
      hipotese_rotulo: ROTULO_HIPOTESE[c.hipotese as HipoteseCredenciamento] ?? c.hipotese,
      regra_distribuicao: c.regra_distribuicao,
      regra_rotulo: ROTULO_REGRA[c.regra_distribuicao as RegraDistribuicao] ?? c.regra_distribuicao,
      vigencia_inicio: c.vigencia_inicio,
      vigencia_fim: c.vigencia_fim,
      validade_credenciado_meses: c.validade_credenciado_meses,
      condicoes_padronizadas: c.condicoes_padronizadas,
      regras_distribuicao_texto: c.regras_distribuicao_texto,
      prazo_denuncia_dias: c.prazo_denuncia_dias,
      origem: c.origem,
    };
  }

  private visaoInscricao(i: InscricaoCredenciamento, agora = new Date()) {
    return {
      id: i.id,
      licitacao_id: i.licitacao_id,
      fornecedor_id: i.fornecedor_id,
      fornecedor_cnpj: i.fornecedor_cnpj,
      fornecedor_razao_social: i.fornecedor_razao_social,
      status: statusEfetivoInscricao(i, agora),
      habilitacao_id: i.habilitacao_id,
      inscrita_em: i.inscrita_em,
      decidida_em: i.decidida_em,
      decisao_motivo: i.decisao_motivo,
      credenciado_em: i.credenciado_em,
      validade_ate: i.validade_ate,
      ordem_rodizio: i.ordem_rodizio,
      apto_a_contratar: !motivoInelegivel(i, agora),
      recurso: i.recurso_prazo_ate
        ? {
            prazo_ate: i.recurso_prazo_ate,
            prazo_aberto: !i.recurso_status && agora.getTime() <= new Date(i.recurso_prazo_ate).getTime(),
            status: i.recurso_status,
            razoes: i.recurso_razoes,
            interposto_em: i.recurso_interposto_em,
            arquivo: i.recurso_arquivo_nome ? { nome: i.recurso_arquivo_nome, sha256: i.recurso_arquivo_sha256 } : null,
            prazo_reconsideracao: i.recurso_prazo_reconsideracao,
            reconsideracao: i.recurso_reconsideracao,
            reconsiderado_em: i.recurso_reconsiderado_em,
            prazo_autoridade: i.recurso_prazo_autoridade,
            instancia: i.recurso_instancia,
            autoridade: i.recurso_autoridade_nome ? { nome: i.recurso_autoridade_nome, cargo: i.recurso_autoridade_cargo } : null,
            decisao: i.recurso_decisao,
            decidido_em: i.recurso_decidido_em,
            ...atrasosRecursoInscricao(i, agora),
          }
        : null,
      descredenciamento: i.descredenciamento_iniciativa
        ? {
            iniciativa: i.descredenciamento_iniciativa,
            motivo: i.descredenciamento_motivo,
            pedido_em: i.descredenciamento_pedido_em,
            efeitos_em: i.descredenciamento_efeitos_em,
          }
        : null,
      origem: i.origem,
      legado: i.legado,
    };
  }

  private visaoContratacao(c: ContratacaoCredenciamento, nomes: Map<string, string>) {
    return {
      id: c.id,
      numero: c.numero,
      descricao: c.descricao,
      regra: c.regra,
      regra_rotulo: ROTULO_REGRA[c.regra as RegraDistribuicao] ?? c.regra,
      inscricao_id: c.inscricao_id,
      fornecedor_id: c.fornecedor_id,
      fornecedor_razao_social: nomes.get(c.inscricao_id) ?? null,
      itens: c.itens,
      valor_total: Number(c.valor_total),
      registro: c.registro,
      prazo_execucao_dias: c.prazo_execucao_dias,
      contrato_id: c.contrato_id,
      status: c.status,
      erro: c.erro,
      ato_em: c.ato_em,
    };
  }

  private async estatisticasSql(m: EntityManager, id: string) {
    const [r] = await m.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'PENDENTE')::int AS pendentes,
              COUNT(*) FILTER (WHERE status = 'CREDENCIADO')::int AS credenciados,
              COUNT(*) FILTER (WHERE status = 'INDEFERIDO')::int AS indeferidos,
              COUNT(*) FILTER (WHERE status = 'DESCREDENCIADO')::int AS descredenciados,
              COUNT(*) FILTER (WHERE status = 'ARQUIVADA')::int AS arquivadas
         FROM credenciamento_inscricoes WHERE licitacao_id::text = $1`,
      [id],
    );
    const [c] = await m.query(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(valor_total), 0) AS valor FROM credenciamento_contratacoes WHERE licitacao_id::text = $1`,
      [id],
    );
    return {
      total: r.total,
      pendentes: r.pendentes,
      credenciados: r.credenciados,
      indeferidos: r.indeferidos,
      descredenciados: r.descredenciados,
      arquivadas: r.arquivadas,
      contratacoes: c.n,
      valor_contratado: Number(c.valor),
      // compatibilidade com a tela antiga
      inscritos: r.pendentes,
      emAnalise: r.pendentes,
      aprovados: r.credenciados,
      reprovados: r.indeferidos,
    };
  }

  async estatisticas(id: string) {
    await this.processo(this.ds.manager, id);
    return this.estatisticasSql(this.ds.manager, id);
  }

  /** Visão completa do órgão dono (cockpit do credenciamento). */
  async visaoOrgao(id: string) {
    const m = this.ds.manager;
    const lic = await this.processo(m, id);
    await this.normalizarDescredenciamentos(m, id);
    const [cfg, itens, inscricoes, contratacoes, edital, estat, atos] = await Promise.all([
      this.configuracao(m, id),
      this.itens(m, id),
      m.find(InscricaoCredenciamento, { where: { licitacao_id: id }, order: { inscrita_em: 'ASC' } }),
      m.find(ContratacaoCredenciamento, { where: { licitacao_id: id }, order: { numero: 'ASC' } }),
      editalVigenteSql(m, id),
      this.estatisticasSql(m, id),
      this.transicoes.atosDisponiveis(id),
    ]);
    const agora = new Date();
    const habs = new Map<string, string>();
    const ids = inscricoes.map((i) => i.habilitacao_id).filter(Boolean) as string[];
    if (ids.length) {
      const rows: any[] = await m.query(`SELECT id::text AS id, status FROM habilitacoes_licitante WHERE id::text = ANY($1)`, [ids]);
      rows.forEach((r) => habs.set(r.id, r.status));
    }
    const nomes = new Map(inscricoes.map((i) => [i.id, i.fornecedor_razao_social ?? '']));
    const pend = pendenciasEditalCredenciamento(await estadoEditalCredenciamentoSql(m, id), agora);
    return {
      ...lic,
      valor_total_estimado: lic.valor_total_estimado != null ? Number(lic.valor_total_estimado) : null,
      modalidade: ModalidadeLicitacao.CREDENCIAMENTO,
      configuracao: this.visaoConfig(cfg),
      pendencias_edital: FASES_INTERNAS.includes(lic.fase) ? pend : [],
      itens,
      edital: edital ? { documento_id: edital.documento_id, versao: edital.versao, titulo: edital.titulo, status: edital.status, origem: edital.origem } : null,
      inscricoes: inscricoes.map((i) => ({ ...this.visaoInscricao(i, agora), habilitacao_status: i.habilitacao_id ? habs.get(i.habilitacao_id) ?? null : null })),
      contratacoes: contratacoes.map((c) => this.visaoContratacao(c, nomes)),
      estatisticas: estat,
      inscricoes_abertas: !motivoNaoInscreve(lic, { inicio: cfg?.vigencia_inicio ?? null, fim: cfg?.vigencia_fim ?? null }, agora),
      atos_disponiveis: atos,
      // compatibilidade com a tela antiga
      status: this.statusLegado(lic),
      credenciados: inscricoes.map((i) => this.visaoInscricao(i, agora)),
    };
  }

  /** Status "de vitrine" (a lista antiga usava RASCUNHO/PUBLICADO/EM_ANDAMENTO/ENCERRADO...). */
  private statusLegado(lic: { fase: string; situacao: string }): string {
    if (lic.situacao === 'CONCLUIDA') return 'ENCERRADO';
    if (lic.situacao === 'SUSPENSA') return 'SUSPENSO';
    if (lic.situacao === 'REVOGADA') return 'REVOGADO';
    if (lic.situacao === 'ANULADA') return 'ANULADO';
    if (lic.fase === 'ACOLHIMENTO_PROPOSTAS') return 'EM_ANDAMENTO';
    if (lic.fase === 'PUBLICADO') return 'PUBLICADO';
    if (lic.fase === 'AGUARDANDO_DIVULGACAO') return 'AGUARDANDO_PNCP';
    return 'RASCUNHO';
  }

  async listarDoOrgao(orgaoId: string, filtros: { status?: string } = {}) {
    const rows: any[] = await this.ds.query(
      `SELECT l.id, l.numero_processo, l.numero_edital, l.objeto, l.fase::text AS fase, COALESCE(l.situacao::text, 'ATIVA') AS situacao,
              l.data_publicacao_edital, l.data_inicio_acolhimento, l.data_fim_acolhimento, l.valor_total_estimado, l.created_at,
              c.hipotese, c.regra_distribuicao, c.vigencia_inicio, c.vigencia_fim,
              (SELECT COUNT(*)::int FROM credenciamento_inscricoes i WHERE i.licitacao_id = l.id) AS inscricoes,
              (SELECT COUNT(*)::int FROM credenciamento_inscricoes i WHERE i.licitacao_id = l.id AND i.status = 'PENDENTE') AS pendentes,
              (SELECT COUNT(*)::int FROM credenciamento_inscricoes i WHERE i.licitacao_id = l.id AND i.status = 'CREDENCIADO') AS credenciados,
              (SELECT COUNT(*)::int FROM credenciamento_contratacoes k WHERE k.licitacao_id = l.id) AS contratacoes
         FROM licitacoes l LEFT JOIN credenciamento_configuracoes c ON c.licitacao_id = l.id
        WHERE l.orgao_id::text = $1 AND l.modalidade::text = 'CREDENCIAMENTO'
        ORDER BY l.created_at DESC`,
      [orgaoId],
    );
    const lista = rows.map((r) => ({
      ...r,
      valor_total_estimado: r.valor_total_estimado != null ? Number(r.valor_total_estimado) : null,
      status: this.statusLegado(r),
      hipotese_rotulo: ROTULO_HIPOTESE[r.hipotese as HipoteseCredenciamento] ?? null,
      regra_rotulo: ROTULO_REGRA[r.regra_distribuicao as RegraDistribuicao] ?? null,
    }));
    return filtros.status ? lista.filter((l) => l.status === filtros.status) : lista;
  }

  // --- Público: só o que foi DIVULGADO (fase externa) ---

  private readonly SQL_PUBLICO = `
    SELECT l.id, l.numero_processo, l.numero_edital, l.objeto, l.objeto_detalhado, l.tipo_contratacao::text AS tipo_contratacao,
           l.fase::text AS fase, COALESCE(l.situacao::text, 'ATIVA') AS situacao, l.data_publicacao_edital,
           l.data_inicio_acolhimento, l.data_fim_acolhimento, l.valor_total_estimado, l.link_pncp,
           c.hipotese, c.regra_distribuicao, c.vigencia_inicio, c.vigencia_fim, c.validade_credenciado_meses,
           c.condicoes_padronizadas, c.regras_distribuicao_texto, c.prazo_denuncia_dias,
           o.id::text AS orgao_id, o.nome AS orgao_nome, o.cnpj AS orgao_cnpj, o.cidade AS orgao_cidade, o.uf AS orgao_uf
      FROM licitacoes l
      LEFT JOIN credenciamento_configuracoes c ON c.licitacao_id = l.id
      LEFT JOIN orgaos o ON o.id = l.orgao_id
     WHERE l.modalidade::text = 'CREDENCIAMENTO' AND l.fase::text <> ALL($1::text[])`;

  private visaoPublica(r: any, agora = new Date()) {
    return {
      id: r.id,
      numero_processo: r.numero_processo,
      numero_edital: r.numero_edital,
      objeto: r.objeto,
      objeto_detalhado: r.objeto_detalhado,
      tipo_contratacao: r.tipo_contratacao,
      tipo: 'CREDENCIAMENTO',
      status: this.statusLegado(r),
      situacao: r.situacao,
      fase: r.fase,
      data_publicacao: r.data_publicacao_edital,
      data_inicio_inscricoes: r.vigencia_inicio ?? r.data_inicio_acolhimento,
      data_fim_inscricoes: r.vigencia_fim ?? r.data_fim_acolhimento,
      inscricao_permanente: true,
      inscricoes_abertas: !motivoNaoInscreve(r, { inicio: r.vigencia_inicio ?? r.data_inicio_acolhimento, fim: r.vigencia_fim ?? r.data_fim_acolhimento }, agora),
      valor_estimado: r.valor_total_estimado != null ? Number(r.valor_total_estimado) : null,
      hipotese: r.hipotese,
      hipotese_rotulo: ROTULO_HIPOTESE[r.hipotese as HipoteseCredenciamento] ?? null,
      regra_distribuicao: r.regra_distribuicao,
      regra_rotulo: ROTULO_REGRA[r.regra_distribuicao as RegraDistribuicao] ?? null,
      validade_credenciado_meses: r.validade_credenciado_meses,
      condicoes_padronizadas: r.condicoes_padronizadas,
      regras_distribuicao_texto: r.regras_distribuicao_texto,
      prazo_denuncia_dias: r.prazo_denuncia_dias,
      amparo_legal: 'Lei 14.133/2021, arts. 78, I, e 79; contratação por inexigibilidade (art. 74, IV)',
      link_pncp: r.link_pncp,
      numero_controle_pncp: r.numero_controle_pncp,
      orgao: { id: r.orgao_id, nome: r.orgao_nome, cnpj: r.orgao_cnpj, cidade: r.orgao_cidade, uf: r.orgao_uf },
    };
  }

  /** Credenciamentos DIVULGADOS e ativos (inscrições abertas ou a abrir). */
  async listarPublicos(filtros: { uf?: string; tipo?: string } = {}) {
    if (filtros.tipo && filtros.tipo !== 'CREDENCIAMENTO') return [];
    const params: any[] = [FASES_INTERNAS];
    let sql = `${this.SQL_PUBLICO} AND COALESCE(l.situacao::text, 'ATIVA') = 'ATIVA'`;
    if (filtros.uf) {
      params.push(filtros.uf);
      sql += ` AND o.uf = $2`;
    }
    const rows = await this.ds.query(`${sql} ORDER BY l.data_publicacao_edital DESC NULLS LAST`, params);
    await aplicarEstadoCompraPncp(this.ds.manager, rows);
    return rows.map((r: any) => this.visaoPublica(r));
  }

  /** Detalhe público: edital, regras, tabela de valores, exigências e a relação de credenciados. */
  async publicoPorId(id: string) {
    if (!ehUuid(id)) throw new NotFoundException('Credenciamento público não encontrado');
    const [r] = await this.ds.query(`${this.SQL_PUBLICO} AND l.id::text = $2`, [FASES_INTERNAS, id]);
    if (r) await aplicarEstadoCompraPncp(this.ds.manager, [r]);
    if (!r) throw new NotFoundException('Credenciamento público não encontrado');
    const m = this.ds.manager;
    await this.normalizarDescredenciamentos(m, id);
    const [itens, edital, exigencias, credenciados] = await Promise.all([
      this.itens(m, id),
      editalVigenteSql(m, id),
      exigenciasDaLicitacaoSql(m, id),
      m.query(
        `SELECT fornecedor_razao_social AS razao_social, fornecedor_cnpj AS cnpj, credenciado_em, validade_ate
           FROM credenciamento_inscricoes WHERE licitacao_id::text = $1 AND status = 'CREDENCIADO' ORDER BY ordem_rodizio`,
        [id],
      ),
    ]);
    return {
      ...this.visaoPublica(r),
      itens: itens.map((i) => ({
        numero_item: i.numero_item,
        descricao: i.descricao_resumida,
        descricao_detalhada: i.descricao_detalhada,
        unidade_medida: i.unidade_medida,
        quantidade_estimada: i.quantidade,
        valor_unitario: i.valor_unitario_estimado,
      })),
      edital: edital
        ? {
            titulo: edital.titulo,
            versao: edital.versao,
            arquivo_url: edital.origem === 'DOCUMENTOS_LICITACAO' ? `/api/publicacao/licitacao/${id}/edital/${edital.documento_id}/arquivo` : null,
          }
        : null,
      edital_url: edital?.origem === 'DOCUMENTOS_LICITACAO' ? `/api/publicacao/licitacao/${id}/edital/${edital.documento_id}/arquivo` : null,
      exigencias: exigencias.map((e: any) => ({ id: e.id, categoria: e.categoria, descricao: e.descricao, base_legal: e.base_legal, obrigatorio: e.obrigatorio })),
      credenciados,
    };
  }

  // ==========================================================================
  // PUBLICAÇÃO / VIGÊNCIA (máquina de estados)
  // ==========================================================================

  /**
   * Publica o edital de chamamento: conclui a instrução (art. 72) se ainda na
   * fase interna, PUBLICAR (edital anexado + regras do art. 79 → PNCP pela
   * fila) e, com a vigência já iniciada, abre as inscrições.
   */
  async publicar(id: string, dados: Partial<DadosCredenciamento> | undefined, ator: AtorTransicao) {
    let lic = await this.processo(this.ds.manager, id);
    // As exigências de habilitação integram o edital divulgado (modelo padrão se o órgão não editou — E4)
    await this.ds.transaction((m) => garantirExigenciasSql(m, id));
    const temVigencia = dados && (dados.vigencia_inicio !== undefined || dados.vigencia_fim !== undefined);
    if (temVigencia && FASES_INTERNAS.includes(lic.fase)) {
      await this.atualizar(id, { vigencia_inicio: dados!.vigencia_inicio, vigencia_fim: dados!.vigencia_fim });
    }
    if (FASES_INTERNAS.includes(lic.fase) && lic.fase !== FaseLicitacao.APROVACAO_INTERNA) {
      // Pendências da configuração antes da instrução (mensagem mais útil)
      const pend = pendenciasEditalCredenciamento(await estadoEditalCredenciamentoSql(this.ds.manager, id));
      if (pend.length) throw new BadRequestException({ message: pend.length === 1 ? pend[0] : `Pendências para publicar: ${pend.join(' | ')}`, pendencias: pend });
      await this.transicoes.executar(id, AtoLicitacao.CONCLUIR_FASE_INTERNA, { ator, registro: { origem: 'credenciamento' } });
    }
    await this.transicoes.executar(id, AtoLicitacao.PUBLICAR, { ator, dados: {}, registro: { origem: 'credenciamento' } });
    lic = await this.processo(this.ds.manager, id);
    // Divulgação oficial pelo PNCP (arts. 54 e 174): as inscrições só abrem
    // depois da confirmação (a fila inicia o recebimento ao confirmar).
    if (lic.fase === FaseLicitacao.PUBLICADO && lic.data_inicio_acolhimento && new Date(lic.data_inicio_acolhimento).getTime() <= Date.now()) {
      await this.transicoes.executar(id, AtoLicitacao.INICIAR_ACOLHIMENTO, { ator, ignorarSeJaAplicado: true, registro: { origem: 'credenciamento' } });
    }
    return this.visaoOrgao(id);
  }

  async iniciarInscricoes(id: string, ator: AtorTransicao) {
    await this.processo(this.ds.manager, id);
    await this.transicoes.executar(id, AtoLicitacao.INICIAR_ACOLHIMENTO, { ator });
    return this.visaoOrgao(id);
  }

  /** Encerramento da vigência (o relógio faz sozinho; aqui o pedido manual — mesma pré-condição). */
  async encerrar(id: string, ator: AtorTransicao) {
    await this.processo(this.ds.manager, id);
    await this.transicoes.executar(id, AtoLicitacao.ENCERRAR_ACOLHIMENTO, { ator, registro: { origem: 'credenciamento' } });
    return this.visaoOrgao(id);
  }

  // ==========================================================================
  // INSCRIÇÃO (fornecedor do token)
  // ==========================================================================

  async inscrever(id: string, fornecedorId: string) {
    let inscricaoId = '';
    await this.ds.transaction(async (m) => {
      const lic = await this.processo(m, id);
      // FOR SHARE: SUSPENDER/ENCERRAR concorrente espera a inscrição (e vice-versa)
      await m.query(`SELECT 1 FROM licitacoes WHERE id = $1 FOR SHARE`, [id]);
      const cfg = await this.configuracao(m, id);
      const fechada = motivoNaoInscreve(lic, { inicio: cfg?.vigencia_inicio ?? lic.data_inicio_acolhimento, fim: cfg?.vigencia_fim ?? lic.data_fim_acolhimento });
      if (fechada) throw new ConflictException(fechada);
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`credenciamento-inscricao:${id}:${fornecedorId}`]);
      const anteriores = await m.find(InscricaoCredenciamento, { where: { licitacao_id: id, fornecedor_id: fornecedorId }, order: { inscrita_em: 'DESC' } });
      const agora = new Date();
      for (const a of anteriores) {
        const st = statusEfetivoInscricao(a, agora);
        if (st === StatusInscricao.PENDENTE) throw new ConflictException('Você já tem inscrição em análise neste credenciamento');
        if (st === StatusInscricao.CREDENCIADO) throw new ConflictException('Você já está credenciado neste credenciamento');
        if (a.recurso_status && STATUS_RECURSO_INSCRICAO_PENDENTES.includes(a.recurso_status)) throw new ConflictException('Há recurso pendente contra o indeferimento da sua inscrição anterior');
      }
      const [f] = await m.query(`SELECT cpf_cnpj, razao_social FROM fornecedores WHERE id::text = $1`, [fornecedorId]);
      if (!f) throw new ForbiddenException('Cadastro do fornecedor não encontrado');
      await garantirExigenciasSql(m, id);
      const hab = await this.habilitacao.abrirHabilitacaoDeInscricao(m, {
        licitacaoId: id,
        fornecedorId,
        prazoAte: cfg?.vigencia_fim ?? lic.data_fim_acolhimento ?? null,
      });
      const i = await m.save(
        m.create(InscricaoCredenciamento, {
          licitacao_id: id,
          fornecedor_id: fornecedorId,
          fornecedor_cnpj: f.cpf_cnpj ?? null,
          fornecedor_razao_social: f.razao_social ?? null,
          status: StatusInscricao.PENDENTE,
          habilitacao_id: hab.id,
          inscrita_em: agora,
          origem: null,
        }),
      );
      inscricaoId = i.id;
    });
    this.logger.log(`Inscrição ${inscricaoId} no credenciamento ${id} (fornecedor ${fornecedorId})`);
    return this.minhaInscricao(id, fornecedorId);
  }

  /** Visão do interessado: a própria inscrição (mais recente), habilitação e contratações recebidas. */
  async minhaInscricao(id: string, fornecedorId: string) {
    const m = this.ds.manager;
    const lic = await this.processo(m, id);
    await this.normalizarDescredenciamentos(m, id);
    const cfg = await this.configuracao(m, id);
    const inscricoes = await m.find(InscricaoCredenciamento, { where: { licitacao_id: id, fornecedor_id: fornecedorId }, order: { inscrita_em: 'DESC' } });
    const atual = inscricoes[0] ?? null;
    const habilitacao = atual?.habilitacao_id ? await this.habilitacao.visaoPorId(atual.habilitacao_id, 'FORNECEDOR') : null;
    const contratacoes = await m.find(ContratacaoCredenciamento, { where: { licitacao_id: id, fornecedor_id: fornecedorId }, order: { numero: 'ASC' } });
    const agora = new Date();
    return {
      credenciamento: {
        id: lic.id,
        numero_processo: lic.numero_processo,
        numero_edital: lic.numero_edital,
        objeto: lic.objeto,
        fase: lic.fase,
        situacao: lic.situacao,
        configuracao: this.visaoConfig(cfg),
        inscricoes_abertas: !motivoNaoInscreve(lic, { inicio: cfg?.vigencia_inicio ?? null, fim: cfg?.vigencia_fim ?? null }, agora),
      },
      inscricao: atual ? this.visaoInscricao(atual, agora) : null,
      historico: inscricoes.slice(1).map((i) => this.visaoInscricao(i, agora)),
      habilitacao,
      contratacoes: contratacoes.map((c) => this.visaoContratacao(c, new Map())),
      pode_recorrer: !!atual && atual.status === StatusInscricao.INDEFERIDO && !atual.recurso_status && !!atual.recurso_prazo_ate && agora <= new Date(atual.recurso_prazo_ate),
      pode_denunciar: !!atual && statusEfetivoInscricao(atual, agora) === StatusInscricao.CREDENCIADO && !atual.descredenciamento_iniciativa,
    };
  }

  async minhasInscricoes(fornecedorId: string) {
    const rows: any[] = await this.ds.query(
      `SELECT i.id, i.licitacao_id, i.status, i.inscrita_em, i.credenciado_em, i.validade_ate, i.descredenciamento_efeitos_em,
              l.numero_processo, l.numero_edital, l.objeto, l.fase::text AS fase, COALESCE(l.situacao::text, 'ATIVA') AS situacao,
              o.nome AS orgao_nome,
              (SELECT COUNT(*)::int FROM credenciamento_contratacoes k WHERE k.inscricao_id = i.id) AS contratacoes
         FROM credenciamento_inscricoes i JOIN licitacoes l ON l.id = i.licitacao_id LEFT JOIN orgaos o ON o.id = l.orgao_id
        WHERE i.fornecedor_id = $1 ORDER BY i.inscrita_em DESC`,
      [fornecedorId],
    );
    const agora = new Date();
    return rows.map((r) => ({ ...r, status: statusEfetivoInscricao(r, agora) }));
  }

  /**
   * RECURSO contra o indeferimento (Lei 14.133 art. 165 I "a" e §2º): razões
   * do próprio interessado (token) em 3 dias úteis da decisão, com arquivo
   * opcional (guardado no banco, SHA-256 — nunca na pasta pública). Abre o
   * prazo de RECONSIDERAÇÃO do agente (3 dias úteis, calendário do órgão).
   * Sem contrarrazões: o indeferimento de uma inscrição não afeta outro
   * interessado (credenciamento não excludente).
   */
  async recorrer(inscricaoId: string, fornecedorId: string, razoes: string | undefined, arquivo?: ArquivoRecurso | null) {
    const texto = this.exigirMotivo(razoes, 'as razões do recurso');
    const arq = arquivo?.buffer?.length ? this.validarArquivoRecurso(arquivo) : null;
    let licitacaoId = '';
    await this.ds.transaction(async (m) => {
      const i = await m.findOne(InscricaoCredenciamento, { where: { id: inscricaoId }, lock: { mode: 'pessimistic_write' } });
      if (!i || i.fornecedor_id !== fornecedorId) throw new NotFoundException('Inscrição não encontrada');
      licitacaoId = i.licitacao_id;
      const lic = await this.processo(m, i.licitacao_id);
      if (lic.situacao !== 'ATIVA') throw new ConflictException('Credenciamento encerrado ou suspenso — recurso não pode ser registrado');
      if (i.status !== StatusInscricao.INDEFERIDO) throw new ConflictException('Só cabe recurso contra inscrição indeferida');
      if (i.recurso_status) throw new ConflictException('O recurso já foi interposto');
      if (!i.recurso_prazo_ate || Date.now() > new Date(i.recurso_prazo_ate).getTime()) {
        throw new ConflictException('Prazo recursal encerrado (3 dias úteis — art. 165, I, Lei 14.133/2021)');
      }
      const agora = new Date();
      i.recurso_status = StatusRecursoInscricao.INTERPOSTO;
      i.recurso_razoes = texto;
      i.recurso_interposto_em = agora;
      i.recurso_prazo_reconsideracao = prazoReconsideracaoInscricao(agora, calendarioDoOrgao(lic.orgao_id));
      if (arq) {
        i.recurso_arquivo_nome = arq.nome;
        i.recurso_arquivo_mime = arq.mime;
        i.recurso_arquivo_sha256 = arq.sha256;
        i.recurso_arquivo_conteudo = arq.conteudo;
      }
      await m.save(i);
    });
    return this.minhaInscricao(licitacaoId, fornecedorId);
  }

  private validarArquivoRecurso(a: ArquivoRecurso) {
    const nome = String(a.originalname || 'razoes.pdf').replace(/[^\w.\- ()À-ú]/g, '_').slice(0, 200);
    const ext = (nome.match(/\.[a-z0-9]+$/i)?.[0] || '').toLowerCase();
    if (!['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'].includes(a.mimetype) || !['.pdf', '.png', '.jpg', '.jpeg'].includes(ext)) {
      throw new BadRequestException('Arquivo das razões: PDF, PNG ou JPG');
    }
    if (a.size > 10 * 1024 * 1024) throw new BadRequestException('Arquivo das razões acima de 10 MB');
    return { nome, mime: a.mimetype, sha256: createHash('sha256').update(a.buffer).digest('hex'), conteudo: a.buffer };
  }

  /** Arquivo das razões (órgão dono ou o próprio recorrente — autorização no controller). */
  async arquivoDoRecurso(inscricaoId: string): Promise<{ nome: string; mime: string; conteudo: Buffer }> {
    const i = await this.ds.manager
      .createQueryBuilder(InscricaoCredenciamento, 'i')
      .addSelect('i.recurso_arquivo_conteudo')
      .where('i.id = :id', { id: inscricaoId })
      .getOne();
    if (!i?.recurso_arquivo_conteudo) throw new NotFoundException('Recurso sem arquivo');
    return { nome: i.recurso_arquivo_nome || 'razoes', mime: i.recurso_arquivo_mime || 'application/octet-stream', conteudo: i.recurso_arquivo_conteudo };
  }

  /** Denúncia pelo credenciado (art. 79 par. único VI): efeito depois do aviso prévio do edital. */
  async denunciar(inscricaoId: string, fornecedorId: string, motivo: string | undefined) {
    const dono = await this.donoDaInscricao(inscricaoId);
    if (!dono || dono.fornecedorId !== fornecedorId) throw new NotFoundException('Inscrição não encontrada');
    await this.descredenciarInterno(inscricaoId, IniciativaDescredenciamento.CREDENCIADO_DENUNCIA, motivo, { tipo: 'FORNECEDOR', id: fornecedorId });
    return this.minhaInscricao(dono.licitacaoId, fornecedorId);
  }

  // ==========================================================================
  // ANÁLISE (órgão dono) — atos pela máquina de estados
  // ==========================================================================

  private async inscricaoTravada(m: EntityManager, inscricaoId: string, licitacaoId: string) {
    const i = await m.findOne(InscricaoCredenciamento, { where: { id: inscricaoId, licitacao_id: licitacaoId }, lock: { mode: 'pessimistic_write' } });
    if (!i) throw new NotFoundException('Inscrição não encontrada');
    return i;
  }

  private async credenciarNaTransacao(m: EntityManager, i: InscricaoCredenciamento, ator: AtorTransicao, motivo: string | null) {
    const cfg = await this.configuracao(m, i.licitacao_id);
    const [lic] = await m.query(`SELECT data_fim_acolhimento FROM licitacoes WHERE id = $1`, [i.licitacao_id]);
    const [{ ordem }] = await m.query(
      `SELECT COALESCE(MAX(ordem_rodizio), 0) + 1 AS ordem FROM credenciamento_inscricoes WHERE licitacao_id = $1`,
      [i.licitacao_id],
    );
    const agora = new Date();
    i.status = StatusInscricao.CREDENCIADO;
    i.credenciado_em = agora;
    i.validade_ate = validadeDoCredenciado(agora, cfg?.validade_credenciado_meses ?? null, cfg?.vigencia_fim ?? lic?.data_fim_acolhimento ?? null);
    i.ordem_rodizio = Number(ordem);
    i.decidida_em = agora;
    i.decisao_motivo = motivo;
    i.decidida_por_tipo = ator.tipo;
    i.decidida_por_id = ator.id;
    await m.save(i);
  }

  async deferir(inscricaoId: string, observacao: string | undefined, ator: AtorTransicao) {
    const dono = await this.exigirDono(inscricaoId);
    await this.transicoes.executar(dono.licitacaoId, AtoLicitacao.DEFERIR_CREDENCIAMENTO, {
      ator,
      motivo: (observacao ?? '').trim() || null,
      dados: { inscricao_id: inscricaoId },
      registro: { inscricao_id: inscricaoId, fornecedor_id: dono.fornecedorId },
      aplicar: async (_lic, m) => {
        const i = await this.inscricaoTravada(m, inscricaoId, dono.licitacaoId);
        if (i.status !== StatusInscricao.PENDENTE) throw new ConflictException('A inscrição já foi decidida');
        if (i.habilitacao_id) {
          await this.habilitacao.decidirHabilitacaoDeInscricao(m, i.habilitacao_id, 'HABILITADO', (observacao ?? '').trim() || null, ator);
        } else if (i.origem !== 'LEGADO') {
          throw new ConflictException('Inscrição sem documentação de habilitação');
        }
        await this.credenciarNaTransacao(m, i, ator, (observacao ?? '').trim() || 'Documentação atendeu às exigências do edital.');
      },
    });
    this.notificar(dono.licitacaoId, dono.orgaoId, dono.fornecedorId, 'Credenciamento deferido', 'Sua inscrição foi analisada e você está CREDENCIADO. As demandas serão distribuídas pela regra do edital.');
    return this.visaoOrgao(dono.licitacaoId);
  }

  async indeferir(inscricaoId: string, motivo: string | undefined, ator: AtorTransicao) {
    const texto = this.exigirMotivo(motivo, 'o motivo do indeferimento');
    const dono = await this.exigirDono(inscricaoId);
    await this.transicoes.executar(dono.licitacaoId, AtoLicitacao.INDEFERIR_CREDENCIAMENTO, {
      ator,
      motivo: texto,
      dados: { inscricao_id: inscricaoId },
      registro: { inscricao_id: inscricaoId, fornecedor_id: dono.fornecedorId },
      aplicar: async (_lic, m) => {
        const i = await this.inscricaoTravada(m, inscricaoId, dono.licitacaoId);
        if (i.status !== StatusInscricao.PENDENTE) throw new ConflictException('A inscrição já foi decidida');
        if (i.habilitacao_id) await this.habilitacao.decidirHabilitacaoDeInscricao(m, i.habilitacao_id, 'INABILITADO', texto, ator);
        const agora = new Date();
        i.status = StatusInscricao.INDEFERIDO;
        i.decidida_em = agora;
        i.decisao_motivo = texto;
        i.decidida_por_tipo = ator.tipo;
        i.decidida_por_id = ator.id;
        i.recurso_prazo_ate = prazoRecursoInscricao(agora, calendarioDoOrgao(dono.orgaoId));
        await m.save(i);
      },
    });
    this.notificar(dono.licitacaoId, dono.orgaoId, dono.fornecedorId, 'Inscrição indeferida', `Sua inscrição no credenciamento foi indeferida: ${texto}. Cabe recurso em 3 dias úteis (art. 165, I).`);
    return this.visaoOrgao(dono.licitacaoId);
  }

  /** Provimento (agente ou autoridade): reforma o indeferimento — habilitação HABILITADA e credenciado. */
  private async aplicarProvimento(m: EntityManager, i: InscricaoCredenciamento, ator: AtorTransicao, texto: string) {
    if (i.habilitacao_id) await this.habilitacao.decidirHabilitacaoDeInscricao(m, i.habilitacao_id, 'HABILITADO', `Recurso provido: ${texto}`, ator, { reforma: true });
    await this.credenciarNaTransacao(m, i, ator, `Recurso provido: ${texto}`);
  }

  /**
   * RECONSIDERAÇÃO pelo agente (art. 165 §2º): `reconsiderar = true` →
   * PROVIDO (instância AGENTE) e credenciado; `false` → mantém o indeferimento
   * e ENCAMINHA à autoridade superior, que decide em 10 dias úteis.
   */
  async reconsiderarRecurso(inscricaoId: string, p: { reconsiderar?: boolean; fundamentacao?: string }, ator: AtorTransicao) {
    const texto = this.exigirFundamentacao(p?.fundamentacao);
    if (typeof p?.reconsiderar !== 'boolean') throw new BadRequestException('Informe se reconsidera (true) ou mantém a decisão (false)');
    const dono = await this.exigirDono(inscricaoId);
    let prazoAut: Date | null = null;
    await this.transicoes.executar(dono.licitacaoId, AtoLicitacao.DECIDIR_RECURSO_CREDENCIAMENTO, {
      ator,
      motivo: texto,
      dados: { inscricao_id: inscricaoId, instancia: 'AGENTE', reconsiderar: p.reconsiderar },
      registro: { inscricao_id: inscricaoId, fornecedor_id: dono.fornecedorId, instancia: 'AGENTE', reconsiderar: p.reconsiderar },
      aplicar: async (_lic, m) => {
        const i = await this.inscricaoTravada(m, inscricaoId, dono.licitacaoId);
        const erro = motivoNaoReconsidera(i.recurso_status);
        if (erro) throw new ConflictException(erro);
        const agora = new Date();
        i.recurso_reconsiderado_em = agora;
        i.recurso_reconsideracao = texto;
        i.recurso_reconsideracao_por_tipo = ator.tipo;
        i.recurso_reconsideracao_por_id = ator.id;
        if (p.reconsiderar) {
          i.recurso_status = StatusRecursoInscricao.PROVIDO;
          i.recurso_instancia = 'AGENTE';
          i.recurso_decisao = texto;
          i.recurso_decidido_em = agora;
          i.recurso_decidido_por_tipo = ator.tipo;
          i.recurso_decidido_por_id = ator.id;
          await m.save(i);
          await this.aplicarProvimento(m, i, ator, texto);
        } else {
          i.recurso_status = StatusRecursoInscricao.AGUARDANDO_AUTORIDADE;
          i.recurso_prazo_autoridade = prazoAut = prazoAutoridadeInscricao(agora, calendarioDoOrgao(dono.orgaoId));
          await m.save(i);
        }
      },
    });
    this.notificar(
      dono.licitacaoId,
      dono.orgaoId,
      dono.fornecedorId,
      p.reconsiderar ? 'Recurso provido (reconsideração)' : 'Recurso encaminhado à autoridade superior',
      p.reconsiderar
        ? `O agente reconsiderou o indeferimento: ${texto}`
        : `O agente manteve o indeferimento (${texto}); a autoridade superior decide até ${prazoAut ? new Date(prazoAut).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-'} (art. 165, §2º).`,
    );
    return this.visaoOrgao(dono.licitacaoId);
  }

  /**
   * AUTORIDADE SUPERIOR (art. 165 §2º) decide o recurso mantido pelo agente.
   * Mesma regra do E5 (sessao/recursos.service — exigirAutoridade): conta do
   * ÓRGÃO (com nome e cargo) ou usuário ADMIN do órgão; nunca o usuário que
   * manteve a decisão (segregação, art. 7º §1º); administrador da plataforma
   * e demais papéis → 403.
   */
  async decidirRecursoAutoridade(
    inscricaoId: string,
    p: { provido?: boolean; fundamentacao?: string; nome?: string; cargo?: string },
    atorJwt: Ator,
  ) {
    const texto = this.exigirFundamentacao(p?.fundamentacao);
    if (typeof p?.provido !== 'boolean') throw new BadRequestException('Informe se o recurso é provido (true) ou improvido (false)');
    const ator = atorTransicaoDe(atorJwt);
    const dono = await this.exigirDono(inscricaoId);
    if (atorJwt.admin || atorJwt.tipo === 'ADMIN') throw new ForbiddenException('A decisão do recurso é da autoridade superior do órgão.');
    let nome = String(p?.nome ?? '').trim();
    let cargo = String(p?.cargo ?? '').trim();
    if (atorJwt.tipo === 'USUARIO') {
      const [u] = await this.ds.query(`SELECT role::text AS role, nome, cargo FROM usuarios WHERE id::text = $1`, [atorJwt.usuarioId ?? atorJwt.id]);
      if (u?.role !== 'ADMIN') {
        throw new ForbiddenException('Apenas a autoridade superior (conta do órgão ou usuário administrador do órgão) decide o recurso mantido pelo agente.');
      }
      nome = nome || u?.nome || '';
      cargo = cargo || u?.cargo || 'Administrador do órgão';
    }
    if (!nome || !cargo) throw new BadRequestException('Informe o nome e o cargo da autoridade superior que decide o recurso.');
    await this.transicoes.executar(dono.licitacaoId, AtoLicitacao.DECIDIR_RECURSO_CREDENCIAMENTO, {
      ator,
      motivo: texto,
      dados: { inscricao_id: inscricaoId, instancia: 'AUTORIDADE', provido: p.provido },
      registro: { inscricao_id: inscricaoId, fornecedor_id: dono.fornecedorId, instancia: 'AUTORIDADE', provido: p.provido, autoridade: { nome, cargo } },
      aplicar: async (_lic, m) => {
        const i = await this.inscricaoTravada(m, inscricaoId, dono.licitacaoId);
        const erro = motivoNaoDecideAutoridade(i.recurso_status);
        if (erro) throw new ConflictException(erro);
        if (ator.tipo === 'USUARIO' && i.recurso_reconsideracao_por_tipo === 'USUARIO' && i.recurso_reconsideracao_por_id === ator.id) {
          throw new ForbiddenException('Quem manteve a decisão (agente de contratação) não pode decidir o recurso como autoridade superior (art. 165 §2º).');
        }
        const agora = new Date();
        i.recurso_status = p.provido ? StatusRecursoInscricao.PROVIDO : StatusRecursoInscricao.IMPROVIDO;
        i.recurso_instancia = 'AUTORIDADE';
        i.recurso_decisao = texto;
        i.recurso_decidido_em = agora;
        i.recurso_decidido_por_tipo = ator.tipo;
        i.recurso_decidido_por_id = ator.id;
        i.recurso_autoridade_nome = nome;
        i.recurso_autoridade_cargo = cargo;
        await m.save(i);
        if (p.provido) await this.aplicarProvimento(m, i, ator, texto);
      },
    });
    this.notificar(dono.licitacaoId, dono.orgaoId, dono.fornecedorId, `Recurso ${p.provido ? 'provido' : 'não provido'} pela autoridade superior`, `${nome} (${cargo}): ${texto}`);
    return this.visaoOrgao(dono.licitacaoId);
  }

  private exigirFundamentacao(v: string | undefined | null): string {
    const t = (v ?? '').trim();
    if (t.length < TAMANHO_MINIMO_FUNDAMENTACAO) throw new BadRequestException(`Fundamente a decisão (mín. ${TAMANHO_MINIMO_FUNDAMENTACAO} caracteres)`);
    return t;
  }

  async descredenciar(inscricaoId: string, p: { motivo?: string; iniciativa?: string }, ator: AtorTransicao) {
    const iniciativa =
      p?.iniciativa === IniciativaDescredenciamento.ADMINISTRACAO_DENUNCIA
        ? IniciativaDescredenciamento.ADMINISTRACAO_DENUNCIA
        : IniciativaDescredenciamento.ADMINISTRACAO_DESCUMPRIMENTO;
    const dono = await this.exigirDono(inscricaoId);
    await this.descredenciarInterno(inscricaoId, iniciativa, p?.motivo, ator);
    return this.visaoOrgao(dono.licitacaoId);
  }

  private async descredenciarInterno(inscricaoId: string, iniciativa: IniciativaDescredenciamento, motivo: string | undefined, ator: AtorTransicao) {
    const texto = this.exigirMotivo(motivo, iniciativa === IniciativaDescredenciamento.CREDENCIADO_DENUNCIA ? 'o motivo da denúncia' : 'o motivo do descredenciamento');
    const dono = await this.exigirDono(inscricaoId);
    let efeitos: Date | null = null;
    await this.transicoes.executar(dono.licitacaoId, AtoLicitacao.DESCREDENCIAR, {
      ator,
      motivo: texto,
      dados: { inscricao_id: inscricaoId, iniciativa },
      registro: { inscricao_id: inscricaoId, fornecedor_id: dono.fornecedorId, iniciativa },
      aplicar: async (_lic, m) => {
        const i = await this.inscricaoTravada(m, inscricaoId, dono.licitacaoId);
        if (statusEfetivoInscricao(i) !== StatusInscricao.CREDENCIADO) throw new ConflictException('Só se descredencia quem está credenciado');
        if (i.descredenciamento_iniciativa) throw new ConflictException('Já há denúncia/descredenciamento em curso para este credenciado');
        const cfg = await this.configuracao(m, i.licitacao_id);
        const agora = new Date();
        efeitos = efeitoDoDescredenciamento(iniciativa, agora, cfg?.prazo_denuncia_dias ?? null);
        i.descredenciamento_iniciativa = iniciativa;
        i.descredenciamento_motivo = texto;
        i.descredenciamento_pedido_em = agora;
        i.descredenciamento_efeitos_em = efeitos;
        if (efeitos.getTime() <= agora.getTime()) i.status = StatusInscricao.DESCREDENCIADO;
        await m.save(i);
      },
    });
    if (iniciativa !== IniciativaDescredenciamento.CREDENCIADO_DENUNCIA) {
      this.notificar(dono.licitacaoId, dono.orgaoId, dono.fornecedorId, 'Descredenciamento', `Você foi descredenciado: ${texto}${efeitos ? ` (efeitos a partir de ${new Date(efeitos).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })})` : ''}.`);
    }
  }

  // ==========================================================================
  // CONTRATAÇÃO (distribuição da demanda + contrato por inexigibilidade)
  // ==========================================================================

  async contratar(licitacaoId: string, pedido: PedidoContratacao, atorJwt: Ator) {
    const ator = atorTransicaoDe(atorJwt);
    const lic0 = await this.processo(this.ds.manager, licitacaoId);
    const descricao = String(pedido?.descricao ?? '').trim();
    if (descricao.length < 5) throw new BadRequestException('Descreva a demanda (o que será contratado agora)');
    const itensLic = await this.itens(this.ds.manager, licitacaoId);
    const pedidos = (pedido?.itens ?? []).filter((x) => x && x.item_id);
    if (!pedidos.length) throw new BadRequestException('Informe os itens e as quantidades da demanda');
    const linhas = pedidos.map((p) => {
      const it = itensLic.find((i) => i.id === p.item_id);
      if (!it) throw new BadRequestException('Item não pertence a este credenciamento');
      const qtd = Number(p.quantidade);
      if (!(qtd > 0)) throw new BadRequestException(`Item ${it.numero_item}: quantidade deve ser maior que zero`);
      return { it, qtd };
    });
    if (new Set(linhas.map((l) => l.it.id)).size !== linhas.length) throw new BadRequestException('Item repetido na demanda');
    const prazo = Math.max(1, Math.floor(Number(pedido?.prazo_execucao_dias) || 30));
    const contratacaoId = randomUUID();
    const atoEm = new Date(); // instante do ato registrado ANTES do sorteio (entrada pública)

    await this.transicoes.executar(licitacaoId, AtoLicitacao.CONTRATAR_CREDENCIADO, {
      ator,
      motivo: descricao,
      dados: { contratacao_id: contratacaoId },
      registro: { contratacao_id: contratacaoId },
      aplicar: async (_lic, m) => {
        await this.normalizarDescredenciamentos(m, licitacaoId);
        const cfg = await this.configuracao(m, licitacaoId);
        if (!cfg) throw new ConflictException('Credenciamento sem as regras do edital');
        const regra = cfg.regra_distribuicao as RegraDistribuicao;
        const inscricoes = await m.find(InscricaoCredenciamento, { where: { licitacao_id: licitacaoId, status: StatusInscricao.CREDENCIADO } });
        const agora = new Date();
        const aptas = inscricoes.filter((i) => !motivoInelegivel(i, agora));
        if (!aptas.length) throw new BadRequestException('Nenhum credenciado apto (credenciado, dentro da validade e sem denúncia com efeito) para receber a demanda');
        const somas: any[] = await m.query(
          `SELECT inscricao_id::text AS id, COUNT(*)::int AS n, COALESCE(SUM(valor_total), 0) AS valor
             FROM credenciamento_contratacoes WHERE licitacao_id = $1 GROUP BY inscricao_id`,
          [licitacaoId],
        );
        const soma = new Map(somas.map((s) => [s.id, s]));
        const fila: CredenciadoNaFila[] = aptas.map((i) => ({
          inscricaoId: i.id,
          fornecedorId: i.fornecedor_id,
          ordemRodizio: Number(i.ordem_rodizio ?? 0),
          contratacoes: Number(soma.get(i.id)?.n ?? 0),
          valorContratado: Number(soma.get(i.id)?.valor ?? 0),
        }));
        const nome = new Map(aptas.map((i) => [i.id, i.fornecedor_razao_social ?? i.fornecedor_id]));
        const quem = (c: { inscricaoId: string }) => ({ inscricao_id: c.inscricaoId, razao_social: nome.get(c.inscricaoId) ?? null });

        let escolhido: CredenciadoNaFila;
        let registro: Record<string, any>;
        let valorUnitarioCotado: number | null = null;
        switch (regra) {
          case RegraDistribuicao.RODIZIO: {
            const [ult] = await m.query(
              `SELECT ordem_rodizio FROM credenciamento_contratacoes WHERE licitacao_id = $1 AND regra = 'RODIZIO' ORDER BY numero DESC LIMIT 1`,
              [licitacaoId],
            );
            const ordemDoUltimo = ult?.ordem_rodizio != null ? Number(ult.ordem_rodizio) : null;
            const r = proximoDoRodizio(fila, ordemDoUltimo);
            escolhido = r.escolhido;
            registro = {
              criterio: 'Fila circular na ordem do credenciamento; o próximo depois do último contratado (art. 79, parágrafo único, II).',
              ordem_do_ultimo: ordemDoUltimo,
              fila: r.fila.map((c) => ({ ...quem(c), ordem: c.ordemRodizio })),
            };
            break;
          }
          case RegraDistribuicao.SORTEIO: {
            const s = sorteioDaDemanda({ licitacaoId, contratacaoId, candidatos: fila.map((c) => c.inscricaoId), atoEm });
            escolhido = fila.find((c) => c.inscricaoId === s.ordem[0])!;
            registro = { criterio: 'Sorteio auditável a cada demanda (SHA256-FY-v1).', sorteio: s, candidatos: fila.map(quem) };
            break;
          }
          case RegraDistribuicao.DIVISAO_IGUALITARIA: {
            escolhido = escolhaDivisaoIgualitaria(fila);
            registro = {
              criterio: 'Divisão igualitária: credenciado com o menor valor já contratado (empate: menos contratações; depois, ordem do credenciamento).',
              situacao: fila.map((c) => ({ ...quem(c), valor_contratado: arred2(c.valorContratado), contratacoes: c.contratacoes, ordem: c.ordemRodizio })),
            };
            break;
          }
          case RegraDistribuicao.ESCOLHA_BENEFICIARIO: {
            const b = pedido?.beneficiario ?? {};
            const alvo = fila.find((c) => c.inscricaoId === b.inscricao_id);
            if (!alvo) throw new BadRequestException('Informe o credenciado escolhido pelo beneficiário (credenciado apto deste credenciamento)');
            const nomeBenef = String(b.nome ?? '').trim();
            if (nomeBenef.length < 3) throw new BadRequestException('Informe o beneficiário que fez a escolha (art. 79, II)');
            escolhido = alvo;
            registro = {
              criterio: 'Seleção a critério de terceiros: escolha do beneficiário (art. 79, II).',
              beneficiario: { nome: nomeBenef, documento: String(b.documento ?? '').trim() || null },
              justificativa: String(b.justificativa ?? '').trim() || null,
              aptos: fila.map(quem),
            };
            break;
          }
          case RegraDistribuicao.COTACAO_MERCADO: {
            if (linhas.length !== 1) throw new BadRequestException('Mercado fluido: registre uma demanda por item (a cotação é do item — art. 79, parágrafo único, IV)');
            const cot = (pedido?.cotacoes ?? []).map((c) => ({ inscricaoId: String(c.inscricao_id ?? ''), valorUnitario: Number(c.valor_unitario), fonte: c.fonte ?? null }));
            for (const c of cot) {
              if (!fila.some((f) => f.inscricaoId === c.inscricaoId)) throw new BadRequestException('Cotação de quem não é credenciado apto');
            }
            let melhor;
            try {
              melhor = escolhaPorCotacao(cot);
            } catch (e: any) {
              throw new BadRequestException(e.message);
            }
            escolhido = fila.find((f) => f.inscricaoId === melhor.inscricaoId)!;
            valorUnitarioCotado = Number(melhor.valorUnitario);
            registro = {
              criterio: 'Mercados fluidos: cotações vigentes registradas no momento da contratação; contratada a menor (art. 79, III e parágrafo único, IV).',
              cotacoes: cot.map((c) => ({ ...quem(c), valor_unitario: c.valorUnitario, fonte: c.fonte })),
            };
            break;
          }
          default:
            throw new ConflictException(`Regra de distribuição desconhecida: ${regra}`);
        }
        const itens = linhas.map(({ it, qtd }) => {
          const unit = valorUnitarioCotado ?? Number(it.valor_unitario_estimado);
          if (!(unit > 0)) throw new BadRequestException(`Item ${it.numero_item} sem valor de contratação`);
          return {
            item_licitacao_id: it.id,
            numero_item: it.numero_item,
            descricao: it.descricao_resumida,
            unidade_medida: it.unidade_medida,
            quantidade: qtd,
            valor_unitario: unit,
            valor_total: arred2(unit * qtd),
          };
        });
        const [{ numero }] = await m.query(`SELECT COALESCE(MAX(numero), 0) + 1 AS numero FROM credenciamento_contratacoes WHERE licitacao_id = $1`, [licitacaoId]);
        await m.save(
          m.create(ContratacaoCredenciamento, {
            id: contratacaoId,
            licitacao_id: licitacaoId,
            numero: Number(numero),
            descricao,
            regra,
            inscricao_id: escolhido.inscricaoId,
            fornecedor_id: escolhido.fornecedorId,
            itens,
            valor_total: arred2(itens.reduce((s, x) => s + x.valor_total, 0)),
            registro: { ...registro, escolhido: quem(escolhido), hipotese: cfg.hipotese },
            ordem_rodizio: escolhido.ordemRodizio,
            prazo_execucao_dias: prazo,
            contrato_id: null,
            status: 'AGUARDANDO_CONTRATO',
            erro: null,
            ato_em: atoEm,
            ator_tipo: ator.tipo,
            ator_id: ator.id,
          }),
        );
      },
    });
    // Contrato DEPOIS do commit (o INSERT em contratos referencia a licitação travada)
    await this.gerarContrato(contratacaoId, ator).catch((e) => this.logger.warn(`Contrato da contratação ${contratacaoId} não gerado: ${e?.message ?? e}`));
    const c = await this.ds.manager.findOneOrFail(ContratacaoCredenciamento, { where: { id: contratacaoId } });
    const [ins] = await this.ds.query(`SELECT fornecedor_razao_social FROM credenciamento_inscricoes WHERE id = $1`, [c.inscricao_id]);
    this.notificar(licitacaoId, lic0.orgao_id, c.fornecedor_id, `Demanda nº ${c.numero} do credenciamento`, `Você recebeu a demanda "${descricao}" (${ROTULO_REGRA[c.regra as RegraDistribuicao] ?? c.regra}). O contrato segue para assinatura.`);
    return this.visaoContratacao(c, new Map([[c.inscricao_id, ins?.fornecedor_razao_social ?? '']]));
  }

  /**
   * Contrato da contratação — INEXIGIBILIDADE (art. 74 IV): nasce
   * AGUARDANDO_ASSINATURA com os itens da demanda (valor fixado no edital ou
   * cotado); vai ao PNCP pela fila depois da última assinatura (art. 94),
   * vinculado à compra do credenciamento. Idempotente: refaz se falhou.
   */
  async gerarContrato(contratacaoId: string, ator: AtorTransicao) {
    const c = await this.ds.manager.findOne(ContratacaoCredenciamento, { where: { id: contratacaoId } });
    if (!c) throw new NotFoundException('Contratação não encontrada');
    if (c.contrato_id) return c;
    try {
      const lic = await this.processo(this.ds.manager, c.licitacao_id);
      const cfg = await this.configuracao(this.ds.manager, c.licitacao_id);
      const [ins] = await this.ds.query(`SELECT fornecedor_cnpj, fornecedor_razao_social FROM credenciamento_inscricoes WHERE id = $1`, [c.inscricao_id]);
      const tc = String(lic.tipo_contratacao || '').toUpperCase();
      const inicio = hojeBrasilia();
      const prazo = c.prazo_execucao_dias || 30;
      const inciso = cfg?.hipotese === HipoteseCredenciamento.SELECAO_POR_TERCEIROS ? 'II' : cfg?.hipotese === HipoteseCredenciamento.MERCADO_FLUIDO ? 'III' : 'I';
      const contrato = await this.contratos.criar({
        orgao_id: lic.orgao_id,
        licitacao_id: c.licitacao_id,
        fornecedor_id: c.fornecedor_id,
        fornecedor_cnpj: ins?.fornecedor_cnpj,
        fornecedor_razao_social: ins?.fornecedor_razao_social,
        objeto: `${lic.objeto} — demanda nº ${c.numero}: ${c.descricao}`.slice(0, 2000),
        numero_processo: lic.numero_processo,
        modalidade_licitacao: ModalidadeLicitacao.INEXIGIBILIDADE,
        amparo_legal: `Lei 14.133/2021, art. 74, IV — contratação de credenciado (credenciamento, art. 79, ${inciso})`,
        categoria: tc.includes('OBRA')
          ? CategoriaContrato.OBRAS
          : tc.includes('ENGENHARIA')
            ? CategoriaContrato.SERVICOS_ENGENHARIA
            : tc.includes('SERVICO')
              ? CategoriaContrato.SERVICOS
              : CategoriaContrato.COMPRAS,
        tipo: TipoContrato.CONTRATO,
        valor_inicial: Number(c.valor_total),
        valor_global: Number(c.valor_total),
        data_assinatura: null as any,
        data_vigencia_inicio: inicio as any,
        data_vigencia_fim: somarDias(inicio, prazo) as any,
        prazo_execucao_dias: prazo,
        status: StatusContrato.AGUARDANDO_ASSINATURA,
        observacoes:
          `Contrato decorrente do credenciamento ${lic.numero_processo} (edital ${lic.numero_edital ?? '-'}), demanda nº ${c.numero}, ` +
          `distribuída por ${ROTULO_REGRA[c.regra as RegraDistribuicao] ?? c.regra} — inexigibilidade (art. 74, IV, Lei 14.133/2021).`,
        usuario_cadastro_id: ator.tipo === 'USUARIO' ? ator.id ?? undefined : undefined,
      } as any);
      const unidades = Object.values(UnidadeMedidaContrato) as string[];
      await this.ds.getRepository(ItemContrato).save(
        (c.itens || []).map((x: any) => ({
          contrato_id: contrato.id,
          numero_item: x.numero_item,
          descricao: String(x.descricao || `Item ${x.numero_item}`).slice(0, 255),
          unidade_medida: (unidades.includes(String(x.unidade_medida)) ? x.unidade_medida : 'UNIDADE') as any,
          valor_unitario: Number(x.valor_unitario),
          valor_total: Number(x.valor_total),
          quantidade_contratada: Number(x.quantidade),
          quantidade_empenhada: 0,
          quantidade_entregue: 0,
          saldo_disponivel: Number(x.quantidade),
          item_licitacao_id: x.item_licitacao_id || null,
        })) as any[],
      );
      await this.ds.query(`UPDATE credenciamento_contratacoes SET contrato_id = $2, status = 'CONTRATO_GERADO', erro = NULL, updated_at = now() WHERE id = $1`, [
        contratacaoId,
        contrato.id,
      ]);
    } catch (e: any) {
      await this.ds.query(`UPDATE credenciamento_contratacoes SET status = 'FALHOU', erro = $2, updated_at = now() WHERE id = $1`, [
        contratacaoId,
        String(e?.message ?? e).slice(0, 1000),
      ]);
      throw e;
    }
    return this.ds.manager.findOneOrFail(ContratacaoCredenciamento, { where: { id: contratacaoId } });
  }

  async listarContratacoes(licitacaoId: string) {
    await this.processo(this.ds.manager, licitacaoId);
    const lista = await this.ds.manager.find(ContratacaoCredenciamento, { where: { licitacao_id: licitacaoId }, order: { numero: 'ASC' } });
    const nomes: any[] = await this.ds.query(`SELECT id::text AS id, fornecedor_razao_social FROM credenciamento_inscricoes WHERE licitacao_id::text = $1`, [licitacaoId]);
    const mapa = new Map(nomes.map((n) => [n.id, n.fornecedor_razao_social]));
    return lista.map((c) => this.visaoContratacao(c, mapa));
  }

  /** Refaz a conta do sorteio registrado (qualquer um com acesso confere). */
  async conferirSorteioDaContratacao(contratacaoId: string) {
    const c = await this.ds.manager.findOne(ContratacaoCredenciamento, { where: { id: contratacaoId } });
    if (!c) throw new NotFoundException('Contratação não encontrada');
    const s = c.registro?.sorteio;
    if (!s) throw new BadRequestException('Esta contratação não foi distribuída por sorteio');
    return { contratacao_id: c.id, numero: c.numero, ...s, conferido: conferirSorteio(s) };
  }

  // ==========================================================================
  // DONOS (autorização no controller)
  // ==========================================================================

  async donoDaInscricao(inscricaoId: string): Promise<{ licitacaoId: string; fornecedorId: string; orgaoId: string } | null> {
    if (!ehUuid(inscricaoId)) return null;
    const [r] = await this.ds.query(
      `SELECT i.licitacao_id::text AS licitacao_id, i.fornecedor_id, l.orgao_id::text AS orgao_id
         FROM credenciamento_inscricoes i JOIN licitacoes l ON l.id = i.licitacao_id WHERE i.id::text = $1`,
      [inscricaoId],
    );
    return r ? { licitacaoId: r.licitacao_id, fornecedorId: String(r.fornecedor_id), orgaoId: r.orgao_id } : null;
  }

  private async exigirDono(inscricaoId: string) {
    const d = await this.donoDaInscricao(inscricaoId);
    if (!d) throw new NotFoundException('Inscrição não encontrada');
    return d;
  }

  async donoDaContratacao(contratacaoId: string): Promise<{ licitacaoId: string } | null> {
    if (!ehUuid(contratacaoId)) return null;
    const [r] = await this.ds.query(`SELECT licitacao_id::text AS licitacao_id FROM credenciamento_contratacoes WHERE id::text = $1`, [contratacaoId]);
    return r ? { licitacaoId: r.licitacao_id } : null;
  }

  async habilitacaoDaInscricao(inscricaoId: string): Promise<string | null> {
    if (!ehUuid(inscricaoId)) return null;
    const [r] = await this.ds.query(`SELECT habilitacao_id::text AS id FROM credenciamento_inscricoes WHERE id::text = $1`, [inscricaoId]);
    return r?.id ?? null;
  }

  /** O fornecedor tem (ou teve) inscrição neste credenciamento? */
  async fornecedorInscrito(licitacaoId: string, fornecedorId: string): Promise<boolean> {
    const r = await this.ds.query(`SELECT 1 FROM credenciamento_inscricoes WHERE licitacao_id::text = $1 AND fornecedor_id = $2 LIMIT 1`, [licitacaoId, fornecedorId]);
    return r.length > 0;
  }
}
