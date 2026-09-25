import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { AtaRegistroPreco, ItemAta, OrigemAta, StatusAta } from './entities/ata-registro-preco.entity';
import { AdesaoAta, AdesaoAtaItem, OrigemConsumoAta, StatusAdesao, StatusReserva } from './entities/arp.entities';
import {
  HIPOTESES_CANCELAMENTO,
  PRAZO_CADASTRO_RESERVA_DIAS,
  arred2,
  arred4,
  ataVencida,
  dataIso,
  fimVigencia,
  hojeBrasilia,
  mesesVigenciaAta,
  motivoCancelamentoInvalido,
  motivoConsumoInvalido,
  motivoLimiteAdesao,
  motivoProrrogacaoInvalida,
  ordenarCandidatosReserva,
  prazoContratacaoAdesao,
  proximoDaReserva,
  saldoItem,
  somarDias,
  somarMeses,
} from './regras-arp';
import { recalcularSaldoAta } from './saldo-ata.sql';
import { POSICAO_ASSINATURA_FORNECEDOR, POSICAO_ASSINATURA_GERENCIADOR, gerarTermoAtaPdf } from './ata-pdf';
import type { AtaGerada, GeradorAtaRegistroPreco } from '../resultado/gerador-ata';
import { marcarContratado } from '../resultado/status-demanda-pca.sql';
import type { AtorTransicao } from '../licitacoes/transicoes/transicoes.tipos';
import { atorTransicaoDe } from '../licitacoes/transicoes/transicoes.tipos';
import type { Ator } from '../auth/acesso/ator';
import { ehFornecedor, ehOrgao } from '../auth/acesso/ator';
import { AcessoLicitacaoService, ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { ContratosService } from '../contratos/contratos.service';
import { CategoriaContrato, StatusContrato, TipoContrato } from '../contratos/entities/contrato.entity';
import { ItemContrato, UnidadeMedidaContrato } from '../almoxarifado/entities/item-contrato.entity';
import { PortalAssinaturasService } from '../portal-assinaturas/portal-assinaturas.service';
import { PncpService } from '../pncp/pncp.service';
import { basesDeLeitura, diretorioUploads } from '../common/arquivos/arquivos';

const STATUS_CONSUMIVEL = [StatusAta.VIGENTE, StatusAta.ESGOTADA];
const STATUS_ADESAO_ATIVA = [
  StatusAdesao.SOLICITADA,
  StatusAdesao.ANUENCIA_GERENCIADOR,
  StatusAdesao.ACEITE_FORNECEDOR,
  StatusAdesao.AUTORIZADA,
];

export interface ItemPedido {
  item_ata_id: string;
  quantidade: number;
}

/**
 * ============================================================================
 * ATA DE REGISTRO DE PREÇOS — ciclo completo (plano E6, parte ARP)
 * Lei 14.133/2021 arts. 82–86; Decreto 11.462/2023 (regulamento federal usado
 * como referência — o município pode adotá-lo).
 * ============================================================================
 *
 *  - GERAÇÃO (gancho `GERADOR_ATA_REGISTRO_PRECO`, chamado pela homologação do
 *    SRP): UMA ATA POR FORNECEDOR VENCEDOR (prática do Dec. 11.462 — a ata é
 *    firmada com cada fornecedor, com os itens que ele venceu), itens com o
 *    preço homologado e a quantidade do item da licitação, vigência provisória
 *    (recontada da última assinatura; 12 meses por padrão, máx. 12 — art. 84),
 *    cadastro de reserva (demais licitantes não excluídos, na ordem do
 *    ranking, convocados a cotar ao preço do vencedor), AGUARDANDO_ASSINATURA.
 *    Idempotente (lock da licitação; devolve as atas existentes).
 *  - ASSINATURA pelo assinador do sistema (termo em PDF; órgão + fornecedor);
 *    na última assinatura → VIGENTE, data de assinatura/vigência reais,
 *    demanda/PCA → CONTRATADA/CONTRATADO e publicação no PNCP (pncp_sync).
 *  - SALDO por item = registrado − consumido; consumo (`ata_consumos`) com
 *    LOCK DA ATA (FOR UPDATE): contratar a partir da ata decrementa e recusa
 *    além do saldo; adesões têm contadores separados.
 *  - ADESÃO (art. 86): pedido do órgão não participante → anuência do
 *    gerenciador → aceite do fornecedor → autorização; limites 50% por órgão e
 *    2× no total, por item, conferidos em cada ato.
 *  - VIGÊNCIA: job diário → VENCIDA; prorrogação única (≤ 12 meses, motivo,
 *    antes do fim); cancelamento do registro (Dec. 11.462 arts. 28–29) →
 *    convocação do próximo do cadastro de reserva (nova ata com o saldo, ao
 *    mesmo preço, até o fim da vigência original).
 */
@Injectable()
export class ArpService implements GeradorAtaRegistroPreco, OnModuleInit {
  private readonly logger = new Logger(ArpService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly acesso: AcessoLicitacaoService,
    private readonly contratos: ContratosService,
    private readonly assinaturas: PortalAssinaturasService,
    private readonly pncp: PncpService,
  ) {}

  onModuleInit(): void {
    // Termo da ata concluído no assinador → VIGENTE + PNCP (sem dependência circular)
    this.assinaturas.registrarAoConcluir((docId, url) => this.aoConcluirAssinatura(docId, url));
  }

  // ==========================================================================
  // APOIO
  // ==========================================================================

  private async ata(m: EntityManager, id: string, lock = false): Promise<AtaRegistroPreco> {
    if (!ehUuid(id)) throw new NotFoundException('Ata não encontrada');
    const rows: any[] = await m.query(`SELECT * FROM atas_registro_preco WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
    if (!rows[0]) throw new NotFoundException('Ata não encontrada');
    return rows[0];
  }

  private async itensDaAta(m: EntityManager, ataId: string, lock = false): Promise<any[]> {
    return m.query(`SELECT * FROM itens_ata WHERE ata_id = $1 ORDER BY numero_item${lock ? ' FOR UPDATE' : ''}`, [ataId]);
  }

  private orgaoDoAtor(ator: Ator): string {
    if (!ehOrgao(ator)) throw new ForbiddenException('Ação exclusiva do órgão');
    return ator.orgaoId;
  }

  /** Gerenciador (órgão dono da ata) ou ADMIN. */
  private assertGerenciador(ator: Ator, ata: { orgao_id: string }, modo: 'leitura' | 'escrita' = 'escrita'): void {
    this.acesso.assertMesmoOrgao(ator, ata.orgao_id, modo, 'Ata');
  }

  // ==========================================================================
  // GERAÇÃO (gancho do ResultadoService)
  // ==========================================================================

  async gerarAtaRegistroPreco(licitacaoId: string, ctx: { ator: AtorTransicao }): Promise<AtaGerada[]> {
    const atas = await this.ds.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`arp:${licitacaoId}`]);
      const [lic] = await m.query(
        `SELECT id, orgao_id, srp, fase::text AS fase, objeto, numero_processo, ata_vigencia_meses,
                base_lance::text AS base_lance
           FROM licitacoes WHERE id = $1`,
        [licitacaoId],
      );
      if (!lic) throw new NotFoundException('Licitação não encontrada');
      if (!lic.srp) throw new BadRequestException('Licitação não é do Sistema de Registro de Preços — o instrumento é o contrato.');
      if (lic.fase !== 'HOMOLOGACAO') throw new ConflictException('A ata de registro de preços só é gerada a partir da licitação homologada.');

      const existentes: any[] = await m.query(
        `SELECT id, numero_ata, fornecedor_id, valor_total FROM atas_registro_preco
          WHERE licitacao_id = $1 AND origem = 'HOMOLOGACAO' ORDER BY sequencial`,
        [licitacaoId],
      );
      if (existentes.length) return existentes;

      const itens: any[] = await m.query(
        `SELECT * FROM itens_licitacao
          WHERE licitacao_id = $1 AND status::text = 'HOMOLOGADO' AND fornecedor_vencedor_id IS NOT NULL
          ORDER BY numero_item`,
        [licitacaoId],
      );
      if (!itens.length) throw new BadRequestException('Nenhum item homologado com vencedor — nada a registrar em ata.');

      const porFornecedor = new Map<string, any[]>();
      for (const it of itens) {
        const f = String(it.fornecedor_vencedor_id);
        if (!porFornecedor.has(f)) porFornecedor.set(f, []);
        porFornecedor.get(f)!.push(it);
      }

      const meses = mesesVigenciaAta(lic.ata_vigencia_meses);
      const hoje = hojeBrasilia();
      const prazoReserva = new Date(Date.now() + PRAZO_CADASTRO_RESERVA_DIAS * 86_400_000);
      const criadas: any[] = [];
      for (const [fornecedorId, itensF] of porFornecedor) {
        const [forn] = await m.query(`SELECT id, cpf_cnpj, razao_social, nome_fantasia FROM fornecedores WHERE id::text = $1`, [fornecedorId]);
        if (!forn) throw new BadRequestException(`Fornecedor vencedor ${fornecedorId} não encontrado — ata não gerada.`);
        const ata = await this.novaAta(m, {
          orgaoId: lic.orgao_id,
          licitacaoId,
          fornecedor: forn,
          objeto: lic.objeto,
          meses,
          inicio: hoje,
          fim: fimVigencia(hoje, meses),
          origem: OrigemAta.HOMOLOGACAO,
          ataOrigemId: null,
          prazoReserva,
          observacoes: `Gerada pela homologação da licitação ${lic.numero_processo} (Lei 14.133/2021 art. 82; ${porFornecedor.size > 1 ? `${porFornecedor.size} fornecedores vencedores — uma ata por fornecedor` : 'fornecedor vencedor'}).`,
          ator: ctx.ator,
          itens: itensF.map((it) => {
            const qtd = Number(it.quantidade) || 0;
            const unit =
              it.valor_unitario_homologado != null
                ? Number(it.valor_unitario_homologado)
                : qtd
                  ? Number(it.valor_total_homologado) / qtd
                  : 0;
            return {
              numero_item: Number(it.numero_item),
              descricao: String(it.descricao_resumida || it.descricao_detalhada || `Item ${it.numero_item}`).slice(0, 255),
              descricao_detalhada: it.descricao_detalhada || null,
              codigo_catalogo: it.codigo_catmat || it.codigo_catser || null,
              unidade_medida: String(it.unidade_medida || 'UNIDADE'),
              quantidade_registrada: qtd,
              valor_unitario: arred4(unit),
              valor_total: it.valor_total_homologado != null ? Number(it.valor_total_homologado) : arred2(unit * qtd),
              marca: it.marca_vencedora || null,
              item_licitacao_id: it.id,
            };
          }),
        });
        // Cadastro de reserva por item: demais licitantes da UNIDADE (item, ou lote na disputa por lote)
        const itensAta: any[] = await m.query(`SELECT id, item_licitacao_id FROM itens_ata WHERE ata_id = $1`, [ata.id]);
        for (const ia of itensAta) {
          const itLic = itensF.find((x) => x.id === ia.item_licitacao_id);
          const unidadeId = lic.base_lance === 'TOTAL_LOTE' && itLic?.lote_id ? itLic.lote_id : ia.item_licitacao_id;
          const cands: any[] = await m.query(
            `SELECT fornecedor_id, situacao, posicao_final, valor_final FROM licitantes_unidade
              WHERE licitacao_id = $1 AND unidade_id::text = $2 AND fornecedor_id <> $3`,
            [licitacaoId, String(unidadeId), fornecedorId],
          );
          const ordem = ordenarCandidatosReserva(
            cands.map((c) => ({
              fornecedorId: String(c.fornecedor_id),
              posicao: c.posicao_final != null ? Number(c.posicao_final) : null,
              valor: c.valor_final != null ? Number(c.valor_final) : null,
              situacao: String(c.situacao),
            })),
          );
          for (const c of ordem) {
            await m.query(
              `INSERT INTO ata_cadastro_reserva (id, ata_id, item_ata_id, fornecedor_id, posicao, valor_ofertado, status, prazo_resposta, created_at, updated_at)
               VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'PENDENTE', $6, now(), now())
               ON CONFLICT (item_ata_id, fornecedor_id) DO NOTHING`,
              [ata.id, ia.id, c.fornecedorId, c.ordem, c.valor, prazoReserva],
            );
          }
        }
        criadas.push(ata);
      }
      return criadas;
    });
    return atas.map((a: any) => ({ id: a.id, numero: a.numero_ata, fornecedorId: String(a.fornecedor_id), valorTotal: Number(a.valor_total) }));
  }

  /** Cria a ata (número sequencial por órgão/ano, sob lock) e os itens. */
  private async novaAta(
    m: EntityManager,
    p: {
      orgaoId: string;
      licitacaoId: string;
      fornecedor: any;
      objeto: string;
      meses: number;
      inicio: string;
      fim: string;
      origem: OrigemAta;
      ataOrigemId: string | null;
      prazoReserva: Date | null;
      observacoes: string;
      ator: AtorTransicao;
      itens: Array<Partial<ItemAta> & { item_licitacao_id?: string | null }>;
    },
  ): Promise<AtaRegistroPreco> {
    const ano = Number(p.inicio.slice(0, 4));
    await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`ata-numero:${p.orgaoId}:${ano}`]);
    const [{ seq }] = await m.query(
      `SELECT COALESCE(MAX(sequencial), 0) + 1 AS seq FROM atas_registro_preco WHERE orgao_id = $1 AND ano = $2`,
      [p.orgaoId, ano],
    );
    const valorTotal = arred2(p.itens.reduce((s, i) => s + Number(i.valor_total || 0), 0));
    const repo = m.getRepository(AtaRegistroPreco);
    const ata = await repo.save(
      repo.create({
        numero_ata: `${String(seq).padStart(3, '0')}/${ano}`,
        ano,
        sequencial: Number(seq),
        orgao_id: p.orgaoId,
        licitacao_id: p.licitacaoId,
        fornecedor_id: String(p.fornecedor.id),
        fornecedor_cnpj: p.fornecedor.cpf_cnpj || '',
        fornecedor_razao_social: p.fornecedor.razao_social || p.fornecedor.nome_fantasia || '',
        status: StatusAta.AGUARDANDO_ASSINATURA,
        objeto: p.objeto,
        valor_total: valorTotal,
        valor_utilizado: 0,
        valor_saldo: valorTotal,
        data_assinatura: null,
        data_vigencia_inicio: p.inicio as any,
        data_vigencia_fim: p.fim as any,
        prazo_vigencia_meses: p.meses,
        permite_adesao: true,
        limite_adesao_percentual: 50,
        origem: p.origem,
        ata_origem_id: p.ataOrigemId,
        prazo_cadastro_reserva: p.prazoReserva,
        observacoes: p.observacoes,
        usuario_cadastro_id: p.ator.id ?? undefined,
        usuario_cadastro_nome: p.ator.tipo === 'SISTEMA' ? 'Sistema' : undefined,
      } as Partial<AtaRegistroPreco>),
    );
    const itemRepo = m.getRepository(ItemAta);
    await itemRepo.save(
      p.itens.map((i) =>
        itemRepo.create({
          ...i,
          ata_id: ata.id,
          quantidade_utilizada: 0,
          quantidade_saldo: i.quantidade_registrada,
          quantidade_adesao_autorizada: 0,
          quantidade_adesao_utilizada: 0,
        } as Partial<ItemAta>),
      ),
    );
    return ata;
  }

  // ==========================================================================
  // CADASTRO DE RESERVA (art. 82 VII; Dec. 11.462 art. 18)
  // ==========================================================================

  /** Pendentes com prazo vencido → EXPIRADO (idempotente). */
  async expirarReservasVencidas(m: EntityManager = this.ds.manager, ataId?: string): Promise<number> {
    const r = await m.query(
      `UPDATE ata_cadastro_reserva SET status = 'EXPIRADO', updated_at = now()
        WHERE status = 'PENDENTE' AND prazo_resposta IS NOT NULL AND prazo_resposta < now()
          ${ataId ? 'AND ata_id = $1' : ''}`,
      ataId ? [ataId] : [],
    );
    return Array.isArray(r) ? Number(r[1] ?? 0) : 0;
  }

  /** Convocações do fornecedor (cadastro de reserva) — com os dados públicos da ata. */
  async reservasDoFornecedor(ator: Ator) {
    if (!ehFornecedor(ator)) throw new ForbiddenException('Ação exclusiva de fornecedor');
    await this.expirarReservasVencidas();
    return this.ds.query(
      `SELECT r.id, r.ata_id, r.status, r.posicao, r.prazo_resposta, r.respondido_em, r.valor_ofertado,
              a.numero_ata, a.objeto, a.status::text AS status_ata, a.fornecedor_razao_social AS titular,
              i.numero_item, i.descricao, i.valor_unitario AS preco_registrado, i.quantidade_registrada,
              o.nome AS orgao_nome
         FROM ata_cadastro_reserva r
         JOIN atas_registro_preco a ON a.id = r.ata_id
         JOIN itens_ata i ON i.id = r.item_ata_id
         JOIN orgaos o ON o.id::text = a.orgao_id::text
        WHERE r.fornecedor_id = $1
        ORDER BY r.created_at DESC, i.numero_item`,
      [ator.fornecedorId],
    );
  }

  /**
   * O licitante declara se cota ao preço do vencedor (todos os itens em que
   * foi convocado nesta ata, ou os informados). Só dentro do prazo.
   */
  async responderReserva(ataId: string, ator: Ator, body: { aderir: boolean; itens?: string[] }) {
    if (!ehFornecedor(ator)) throw new ForbiddenException('Ação exclusiva de fornecedor');
    return this.ds.transaction(async (m) => {
      await this.ata(m, ataId, true);
      await this.expirarReservasVencidas(m, ataId);
      const linhas: any[] = await m.query(
        `SELECT * FROM ata_cadastro_reserva WHERE ata_id = $1 AND fornecedor_id = $2 FOR UPDATE`,
        [ataId, ator.fornecedorId],
      );
      if (!linhas.length) throw new NotFoundException('Você não foi convocado para o cadastro de reserva desta ata.');
      const alvo = linhas.filter((l) => !body?.itens?.length || body.itens.includes(l.item_ata_id));
      const pendentes = alvo.filter((l) => l.status === StatusReserva.PENDENTE);
      if (!pendentes.length) {
        const expirado = alvo.some((l) => l.status === StatusReserva.EXPIRADO);
        throw new BadRequestException(
          expirado ? 'O prazo para aderir ao cadastro de reserva terminou.' : 'Não há convocação pendente de resposta nesta ata.',
        );
      }
      const status = body?.aderir ? StatusReserva.ADERIU : StatusReserva.RECUSOU;
      await m.query(
        `UPDATE ata_cadastro_reserva SET status = $2, respondido_em = now(), updated_at = now() WHERE id = ANY($1::uuid[])`,
        [pendentes.map((l) => l.id), status],
      );
      return { ata_id: ataId, status, itens: pendentes.length };
    });
  }

  // ==========================================================================
  // ASSINATURA (assinador do sistema — mesmo fluxo do contrato)
  // ==========================================================================

  /** Signatário do órgão: o próprio usuário logado (dados do cadastro). */
  private async signatarioDoOrgao(ator: Ator): Promise<{ id: string; nome: string; cpf?: string; email?: string; telefone?: string }> {
    if (ator.tipo === 'USUARIO' && ator.usuarioId) {
      const [u] = await this.ds.query(`SELECT id, nome, cpf, email, telefone FROM usuarios WHERE id::text = $1`, [ator.usuarioId]);
      if (u) return { id: u.id, nome: u.nome, cpf: u.cpf || undefined, email: u.email || undefined, telefone: u.telefone || undefined };
    }
    const [o] = await this.ds.query(
      `SELECT id, nome, responsavel_nome, responsavel_cpf, email_login, email FROM orgaos WHERE id::text = $1`,
      [ator.orgaoId],
    );
    return {
      id: ator.id,
      nome: o?.responsavel_nome || o?.nome || 'Responsável do órgão',
      cpf: o?.responsavel_cpf || undefined,
      email: o?.email_login || o?.email || undefined,
    };
  }

  /**
   * Gera o termo da ata em PDF e solicita as assinaturas (órgão gerenciador +
   * fornecedor). Idempotente. Enquanto houver licitante com prazo aberto para
   * aderir ao cadastro de reserva, aguarda (a reserva integra a ata).
   */
  async solicitarAssinaturas(ataId: string, ator: Ator) {
    const ata = await this.ata(this.ds.manager, ataId);
    this.assertGerenciador(ator, ata);
    if (ata.status !== StatusAta.AGUARDANDO_ASSINATURA) {
      throw new ConflictException(`A ata não aguarda assinatura (situação ${ata.status}).`);
    }
    if (ata.documento_assinatura_id) {
      const doc = await this.assinaturas.obterDocumento(ata.documento_assinatura_id, ata.orgao_id).catch(() => null);
      if (doc && doc.status !== 'CANCELADO') {
        return {
          ja_existente: true,
          documento_assinatura_id: doc.id,
          status: doc.status,
          signatarios: (doc.signatarios || []).map((s: any) => ({ nome: s.nome, status: s.status })),
        };
      }
    }
    await this.expirarReservasVencidas(this.ds.manager, ataId);
    const [{ n }] = await this.ds.query(`SELECT COUNT(*)::int AS n FROM ata_cadastro_reserva WHERE ata_id = $1 AND status = 'PENDENTE'`, [ataId]);
    if (n > 0) {
      throw new BadRequestException(
        `Há ${n} convocação(ões) do cadastro de reserva com prazo em curso (até ${new Date(ata.prazo_cadastro_reserva as any).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}). ` +
          'Aguarde as respostas ou o fim do prazo — o cadastro de reserva integra a ata (Dec. 11.462 art. 18).',
      );
    }

    const [orgao] = await this.ds.query(`SELECT * FROM orgaos WHERE id::text = $1`, [ata.orgao_id]);
    const [lic] = await this.ds.query(`SELECT numero_processo, numero_edital, objeto, modalidade::text AS modalidade FROM licitacoes WHERE id = $1`, [ata.licitacao_id]);
    const [forn] = await this.ds.query(`SELECT id, cpf_cnpj, razao_social, email, telefone FROM fornecedores WHERE id::text = $1`, [ata.fornecedor_id]);
    const itens = await this.itensDaAta(this.ds.manager, ataId);
    const reserva: any[] = await this.ds.query(
      `SELECT i.numero_item, r.posicao, f.razao_social, f.cpf_cnpj
         FROM ata_cadastro_reserva r JOIN itens_ata i ON i.id = r.item_ata_id
         JOIN fornecedores f ON f.id::text = r.fornecedor_id
        WHERE r.ata_id = $1 AND r.status = 'ADERIU' ORDER BY i.numero_item, r.posicao`,
      [ataId],
    );
    const ataOrigem = ata.ata_origem_id
      ? (await this.ds.query(`SELECT numero_ata, cancelamento_motivo FROM atas_registro_preco WHERE id = $1`, [ata.ata_origem_id]))[0]
      : null;
    const resp = await this.signatarioDoOrgao(ator);

    const { buffer, ultimaPagina } = gerarTermoAtaPdf({ ata, orgao, licitacao: lic, itens, reserva, responsavel_orgao: { nome: resp.nome }, ataOrigem });
    const dir = path.join(diretorioUploads(), 'atas', ataId);
    fs.mkdirSync(dir, { recursive: true });
    const nomeArq = `termo-ata-${String(ata.numero_ata).replace(/[^\w-]/g, '_')}.pdf`;
    fs.writeFileSync(path.join(dir, nomeArq), buffer);
    const relPath = `atas/${ataId}/${nomeArq}`;

    const docAss = await this.assinaturas.criarDocumento(
      ata.orgao_id,
      resp.id,
      {
        titulo: `Ata de Registro de Preços ${ata.numero_ata} — ${String(ata.objeto || '').slice(0, 80)}`,
        descricao: `Ata de registro de preços ${ata.numero_ata} (processo ${lic?.numero_processo || '—'}). Assinatura eletrônica das partes — Lei nº 14.133/2021 arts. 82–86.`,
        signatarios: [
          {
            nome: resp.nome,
            cpf_cnpj: resp.cpf,
            email: resp.email,
            telefone: resp.telefone,
            is_orgao_user: true,
            pagina_assinatura: ultimaPagina,
            ...POSICAO_ASSINATURA_GERENCIADOR,
          },
          {
            nome: forn?.razao_social || ata.fornecedor_razao_social,
            cpf_cnpj: forn?.cpf_cnpj || ata.fornecedor_cnpj,
            email: forn?.email,
            telefone: forn?.telefone,
            is_orgao_user: false,
            pagina_assinatura: ultimaPagina,
            ...POSICAO_ASSINATURA_FORNECEDOR,
          },
        ],
      } as any,
      relPath,
    );
    await this.assinaturas.dispararNotificacoesAssinatura(docAss.id).catch((e: any) =>
      this.logger.warn(`Notificações de assinatura da ata ${ata.numero_ata}: ${e?.message ?? e}`),
    );
    await this.ds.query(`UPDATE atas_registro_preco SET documento_assinatura_id = $2, arquivo_ata = $3, updated_at = now() WHERE id = $1`, [
      ataId,
      docAss.id,
      relPath,
    ]);
    return {
      sucesso: true,
      documento_assinatura_id: docAss.id,
      termo_url: `/uploads/${relPath}`,
      signatarios: (docAss.signatarios || []).map((s: any) => ({ nome: s.nome, status: s.status })),
    };
  }

  /**
   * Última assinatura do termo (ouvinte do portal de assinaturas): VIGENTE,
   * data de assinatura e vigência reais (da ata de reserva: até o fim da
   * original), demanda/PCA contratado e publicação no PNCP.
   */
  async aoConcluirAssinatura(documentoId: string, arquivoAssinadoUrl?: string): Promise<void> {
    const [ata] = await this.ds.query(`SELECT * FROM atas_registro_preco WHERE documento_assinatura_id = $1`, [documentoId]);
    if (!ata) return;
    if (ata.status === StatusAta.AGUARDANDO_ASSINATURA) {
      const hoje = hojeBrasilia();
      const fim = ata.origem === OrigemAta.RESERVA ? dataIso(ata.data_vigencia_fim) : fimVigencia(hoje, mesesVigenciaAta(ata.prazo_vigencia_meses));
      await this.ds.query(
        `UPDATE atas_registro_preco
            SET status = 'VIGENTE', data_assinatura = $2, data_vigencia_inicio = $2, data_vigencia_fim = $3,
                arquivo_ata = COALESCE($4, arquivo_ata), updated_at = now()
          WHERE id = $1`,
        [ata.id, hoje, fim, arquivoAssinadoUrl || null],
      );
      this.logger.log(`Ata ${ata.numero_ata}: assinada por todas as partes — VIGENTE até ${fim}`);
      await recalcularSaldoAta(this.ds, ata.id);
    }
    if (ata.licitacao_id) {
      await marcarContratado(this.ds, ata.licitacao_id).catch((e: any) =>
        this.logger.warn(`Status da demanda/PCA não atualizado: ${e?.message ?? e}`),
      );
    }
    await this.publicarNoPncp(ata.id).catch((e: any) => this.logger.warn(`[PNCP] Ata ${ata.numero_ata}: ${e?.message ?? e}`));
  }

  // ==========================================================================
  // PNCP (art. 94 — registro em pncp_sync; a fila com reenvio é a E7)
  // ==========================================================================

  async publicarNoPncp(ataId: string): Promise<{ enviado: boolean; erro?: string }> {
    const ata = await this.ata(this.ds.manager, ataId);
    if (ata.enviado_pncp) return { enviado: true };
    if (!['VIGENTE', 'ESGOTADA'].includes(ata.status)) return { enviado: false, erro: 'Ata ainda não assinada' };
    const registrarErro = async (msg: string) => {
      await this.ds.query(
        `INSERT INTO pncp_sync (id, tipo, entidade_id, licitacao_id, orgao_id, status, erro_mensagem, tentativas, ultima_tentativa, created_at, updated_at)
         VALUES (gen_random_uuid(), 'ATA', $1, $2, $3, 'ERRO', $4, 1, now(), now(), now())`,
        [ata.id, ata.licitacao_id, ata.orgao_id, msg],
      );
      return { enviado: false, erro: msg };
    };
    const [compra] = await this.ds.query(
      `SELECT ano_compra, sequencial_compra, numero_controle_pncp FROM pncp_sync
        WHERE licitacao_id = $1 AND tipo = 'COMPRA' AND status = 'ENVIADO' ORDER BY created_at DESC LIMIT 1`,
      [ata.licitacao_id],
    );
    if (!compra) return registrarErro('Compra não enviada ao PNCP — a ata será publicada depois do envio da compra (reenvie pela tela da ata).');
    const [orgao] = await this.ds.query(`SELECT cnpj, pncp_cnpj_orgao, pncp_codigo_unidade FROM orgaos WHERE id::text = $1`, [ata.orgao_id]);
    let arquivo: Buffer | undefined;
    if (ata.arquivo_ata) {
      const rel = String(ata.arquivo_ata).replace(/^\/?(api\/)?uploads\//, '');
      for (const base of basesDeLeitura()) {
        const p = path.join(base, rel);
        if (fs.existsSync(p)) {
          arquivo = fs.readFileSync(p);
          break;
        }
      }
    }
    const iso = (d: any) => dataIso(d);
    try {
      const r: any = await this.pncp.incluirAtaRegistroPreco(String(compra.ano_compra), String(compra.sequencial_compra), {
        cnpj_orgao: String(orgao?.pncp_cnpj_orgao || orgao?.cnpj || '').replace(/\D/g, '') || undefined,
        licitacao_id: ata.licitacao_id,
        entidade_id: ata.id,
        numero_controle_compra: compra.numero_controle_pncp,
        numero_ata: ata.numero_ata,
        ano_ata: ata.ano,
        data_assinatura: iso(ata.data_assinatura),
        data_vigencia_inicio: iso(ata.data_vigencia_inicio),
        data_vigencia_fim: iso(ata.data_vigencia_fim),
        possibilidade_adesao: !!ata.permite_adesao,
        codigo_unidade: orgao?.pncp_codigo_unidade || '1',
        arquivo_buffer: arquivo,
        nome_arquivo: `ata-${String(ata.numero_ata).replace(/[^\w-]/g, '_')}.pdf`,
      });
      const seq = r?.dados?.sequencialAta ? Number(r.dados.sequencialAta) : null;
      await this.ds.query(
        `UPDATE atas_registro_preco SET enviado_pncp = true, data_envio_pncp = now(), data_publicacao = COALESCE(data_publicacao, $2::date),
            sequencial_pncp = $3, numero_controle_pncp = $4, updated_at = now() WHERE id = $1`,
        [ata.id, hojeBrasilia(), seq, compra.numero_controle_pncp && seq ? `${compra.numero_controle_pncp}-${String(seq).padStart(6, '0')}` : null],
      );
      this.logger.log(`[PNCP] Ata ${ata.numero_ata} publicada (sequencial ${seq ?? '—'})`);
      return { enviado: true };
    } catch (e: any) {
      return registrarErro(`Erro ao publicar a ata no PNCP: ${e?.message ?? e}`);
    }
  }

  // ==========================================================================
  // SALDO E CONSUMO (lock da ata)
  // ==========================================================================

  /**
   * Consome saldo DENTRO da transação `m`, com a linha da ata travada
   * (FOR UPDATE) — todo consumo da mesma ata passa por aqui em série.
   *  - sem adesão: saldo do gerenciador/participantes (registrado − consumido);
   *  - com adesão: o autorizado na adesão (AUTORIZADA, do órgão consumidor,
   *    dentro do prazo de contratação) − o já consumido por ela.
   */
  async consumir(
    m: EntityManager,
    p: {
      ataId: string;
      itens: ItemPedido[];
      origem: OrigemConsumoAta;
      orgaoConsumidorId: string;
      adesaoId?: string | null;
      contratoId?: string | null;
      ator: AtorTransicao;
      observacao?: string | null;
    },
  ): Promise<{ ata: AtaRegistroPreco; consumos: any[]; valorTotal: number }> {
    const ata = await this.ata(m, p.ataId, true);
    if (!STATUS_CONSUMIVEL.includes(ata.status as StatusAta)) {
      throw new BadRequestException(`A ata não admite contratação na situação ${ata.status}.`);
    }
    if (ataVencida(ata.data_vigencia_fim)) {
      throw new BadRequestException('A vigência da ata terminou — não há mais contratação a partir dela (art. 84).');
    }
    if (!Array.isArray(p.itens) || !p.itens.length) throw new BadRequestException('Informe os itens e as quantidades.');
    const itens = await this.itensDaAta(m, ata.id);
    const porId = new Map(itens.map((i) => [i.id, i]));
    let adesao: any = null;
    const autorizadoAdesao = new Map<string, number>();
    if (p.adesaoId) {
      if (!ehUuid(p.adesaoId)) throw new NotFoundException('Adesão não encontrada');
      [adesao] = await m.query(`SELECT * FROM adesoes_ata WHERE id = $1 AND ata_id = $2 FOR UPDATE`, [p.adesaoId, ata.id]);
      if (!adesao) throw new NotFoundException('Adesão não encontrada');
      if (adesao.orgao_aderente_id !== p.orgaoConsumidorId) throw new ForbiddenException('A adesão pertence a outro órgão.');
      if (adesao.status !== StatusAdesao.AUTORIZADA) throw new BadRequestException(`A adesão não está autorizada (situação ${adesao.status}).`);
      if (adesao.prazo_contratacao && (dataIso(adesao.prazo_contratacao) as string) < hojeBrasilia()) {
        throw new BadRequestException('O prazo para contratar pela adesão terminou (90 dias da autorização).');
      }
      const ais: any[] = await m.query(`SELECT item_ata_id, quantidade FROM adesoes_ata_itens WHERE adesao_id = $1`, [adesao.id]);
      for (const ai of ais) autorizadoAdesao.set(ai.item_ata_id, Number(ai.quantidade));
    } else if (p.orgaoConsumidorId !== ata.orgao_id) {
      throw new ForbiddenException('Órgão não participante só contrata pela adesão autorizada (art. 86).');
    }

    const consumidoRows: any[] = await m.query(
      p.adesaoId
        ? `SELECT item_ata_id, SUM(quantidade) AS q FROM ata_consumos WHERE ata_id = $1 AND adesao_id = $2 GROUP BY item_ata_id`
        : `SELECT item_ata_id, SUM(quantidade) AS q FROM ata_consumos WHERE ata_id = $1 AND adesao_id IS NULL GROUP BY item_ata_id`,
      p.adesaoId ? [ata.id, p.adesaoId] : [ata.id],
    );
    const consumido = new Map(consumidoRows.map((r) => [r.item_ata_id, Number(r.q)]));
    const pedidoPorItem = new Map<string, number>();
    for (const it of p.itens) {
      if (!porId.has(it.item_ata_id)) throw new BadRequestException(`Item ${it.item_ata_id} não pertence a esta ata.`);
      pedidoPorItem.set(it.item_ata_id, arred4((pedidoPorItem.get(it.item_ata_id) ?? 0) + Number(it.quantidade)));
    }
    const erros: string[] = [];
    for (const [itemId, qtd] of pedidoPorItem) {
      const item = porId.get(itemId)!;
      const rotulo = `Item ${item.numero_item}`;
      if (item.ativo === false) {
        erros.push(`${rotulo}: item inativo.`);
        continue;
      }
      const saldo = p.adesaoId
        ? saldoItem(autorizadoAdesao.get(itemId) ?? 0, consumido.get(itemId) ?? 0)
        : saldoItem(Number(item.quantidade_registrada), consumido.get(itemId) ?? 0);
      if (p.adesaoId && !autorizadoAdesao.has(itemId)) {
        erros.push(`${rotulo}: não faz parte da adesão autorizada.`);
        continue;
      }
      const e = motivoConsumoInvalido({ quantidade: qtd, saldo, rotulo });
      if (e) erros.push(e);
    }
    if (erros.length) throw new BadRequestException(erros.join(' '));

    const hoje = hojeBrasilia();
    const consumos: any[] = [];
    let valorTotal = 0;
    for (const [itemId, qtd] of pedidoPorItem) {
      const item = porId.get(itemId)!;
      const unit = Number(item.valor_unitario);
      const total = arred2(unit * qtd);
      valorTotal += total;
      const [c] = await m.query(
        `INSERT INTO ata_consumos (id, ata_id, item_ata_id, quantidade, valor_unitario, valor_total, origem, adesao_id,
                                   orgao_consumidor_id, contrato_id, data, ator_tipo, ator_id, observacao, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now()) RETURNING *`,
        [ata.id, itemId, qtd, unit, total, p.origem, p.adesaoId ?? null, p.orgaoConsumidorId, p.contratoId ?? null, hoje, p.ator.tipo, p.ator.id, p.observacao ?? null],
      );
      consumos.push({ ...c, numero_item: item.numero_item, descricao: item.descricao, unidade_medida: item.unidade_medida, item });
    }
    await recalcularSaldoAta(m, ata.id);
    return { ata, consumos, valorTotal: arred2(valorTotal) };
  }

  /** Rota antiga `itens/:id/utilizar` — vira consumo MANUAL do gerenciador (sem instrumento). */
  async utilizarItemManual(itemId: string, quantidade: number, ator: Ator) {
    const [item] = await this.ds.query(`SELECT id, ata_id FROM itens_ata WHERE id = $1`, [itemId]);
    if (!item) throw new NotFoundException('Item não encontrado');
    await this.ds.transaction(async (m) => {
      const ata = await this.ata(m, item.ata_id);
      await this.consumir(m, {
        ataId: item.ata_id,
        itens: [{ item_ata_id: itemId, quantidade: Number(quantidade) }],
        origem: OrigemConsumoAta.MANUAL,
        orgaoConsumidorId: ata.orgao_id,
        ator: atorTransicaoDe(ator),
        observacao: 'Utilização registrada sem instrumento (rota de utilização manual)',
      });
    });
    const [atualizado] = await this.ds.query(`SELECT * FROM itens_ata WHERE id = $1`, [itemId]);
    return atualizado;
  }

  /**
   * CONTRATAR A PARTIR DA ATA: consome o saldo (lock) e cria o contrato ou a
   * ordem pelo cadastro de contratos (AGUARDANDO_ASSINATURA, itens da ata).
   * Gerenciador consome o saldo da ata; órgão não participante, a adesão
   * AUTORIZADA (`adesao_id`). Se a criação do instrumento falhar, o consumo é
   * desfeito (compensação) — o saldo nunca fica consumido sem instrumento.
   */
  async contratarAPartirDaAta(
    ataId: string,
    atorJwt: Ator,
    body: { tipo?: 'CONTRATO' | 'ORDEM'; itens: ItemPedido[]; adesao_id?: string | null; prazo_execucao_dias?: number; objeto?: string },
  ) {
    const orgaoId = this.orgaoDoAtor(atorJwt);
    const ator = atorTransicaoDe(atorJwt);
    const ataAntes = await this.ata(this.ds.manager, ataId);
    const ehGerenciador = ataAntes.orgao_id === orgaoId;
    if (!ehGerenciador && !body?.adesao_id) {
      // outro órgão sem adesão: não enxerga a gestão da ata
      throw new ForbiddenException('Órgão não participante só contrata pela adesão autorizada (art. 86).');
    }
    const tipo = body?.tipo === 'ORDEM' ? 'ORDEM' : 'CONTRATO';
    const origem = tipo === 'ORDEM' ? OrigemConsumoAta.ORDEM : OrigemConsumoAta.CONTRATO;

    const r = await this.ds.transaction((m) =>
      this.consumir(m, {
        ataId,
        itens: body?.itens,
        origem,
        orgaoConsumidorId: orgaoId,
        adesaoId: ehGerenciador ? null : body.adesao_id,
        ator,
        observacao: null,
      }),
    );

    const ata = r.ata;
    try {
      const [lic] = await this.ds.query(
        `SELECT numero_processo, tipo_contratacao::text AS tipo_contratacao, modalidade::text AS modalidade FROM licitacoes WHERE id = $1`,
        [ata.licitacao_id],
      );
      const [gerenciador] = ehGerenciador ? [null] : await this.ds.query(`SELECT nome FROM orgaos WHERE id::text = $1`, [ata.orgao_id]);
      const tc = String(lic?.tipo_contratacao || '').toUpperCase();
      const ehServico = tc.includes('SERVICO') || tc.includes('OBRA');
      const prazo = Math.max(1, Math.floor(Number(body?.prazo_execucao_dias) || 30));
      const inicio = hojeBrasilia();
      const contrato = await this.contratos.criar({
        orgao_id: orgaoId,
        licitacao_id: ehGerenciador ? ata.licitacao_id : (null as any),
        ata_registro_preco_id: ata.id,
        fornecedor_id: ata.fornecedor_id,
        fornecedor_cnpj: ata.fornecedor_cnpj,
        fornecedor_razao_social: ata.fornecedor_razao_social,
        objeto: body?.objeto || ata.objeto,
        numero_processo: lic?.numero_processo,
        modalidade_licitacao: lic?.modalidade,
        categoria: tc.includes('OBRA')
          ? CategoriaContrato.OBRAS
          : tc.includes('ENGENHARIA')
            ? CategoriaContrato.SERVICOS_ENGENHARIA
            : tc.includes('SERVICO')
              ? CategoriaContrato.SERVICOS
              : CategoriaContrato.COMPRAS,
        tipo: tipo === 'ORDEM' ? (ehServico ? TipoContrato.ORDEM_SERVICO : TipoContrato.ORDEM_FORNECIMENTO) : TipoContrato.CONTRATO,
        valor_inicial: r.valorTotal,
        valor_global: r.valorTotal,
        data_assinatura: null as any,
        data_vigencia_inicio: inicio as any,
        data_vigencia_fim: somarDias(inicio, prazo) as any,
        prazo_execucao_dias: prazo,
        status: StatusContrato.AGUARDANDO_ASSINATURA,
        observacoes: ehGerenciador
          ? `${tipo === 'ORDEM' ? 'Ordem' : 'Contrato'} a partir da Ata de Registro de Preços nº ${ata.numero_ata} (Lei 14.133/2021 art. 83).`
          : `${tipo === 'ORDEM' ? 'Ordem' : 'Contrato'} por ADESÃO (art. 86) à Ata de Registro de Preços nº ${ata.numero_ata} do órgão gerenciador ${gerenciador?.nome || ''}.`,
        usuario_cadastro_id: ator.id ?? undefined,
      } as any);
      const unidades = Object.values(UnidadeMedidaContrato) as string[];
      const itemRepo = this.ds.getRepository(ItemContrato);
      await itemRepo.save(
        r.consumos.map((c) => ({
            contrato_id: contrato.id,
            numero_item: c.numero_item,
            descricao: String(c.descricao || `Item ${c.numero_item}`).slice(0, 255),
            descricao_detalhada: c.item.descricao_detalhada || null,
            codigo_catalogo: c.item.codigo_catalogo || null,
            marca: c.item.marca || null,
            unidade_medida: (unidades.includes(String(c.unidade_medida)) ? c.unidade_medida : 'UNIDADE') as any,
            valor_unitario: Number(c.valor_unitario),
            valor_total: Number(c.valor_total),
            quantidade_contratada: Number(c.quantidade),
            quantidade_empenhada: 0,
            quantidade_entregue: 0,
            saldo_disponivel: Number(c.quantidade),
            item_licitacao_id: c.item.item_licitacao_id || null,
        })) as any[],
      );
      await this.ds.query(`UPDATE ata_consumos SET contrato_id = $2 WHERE id = ANY($1::uuid[])`, [r.consumos.map((c) => c.id), contrato.id]);
      return {
        contrato: { id: contrato.id, numero_contrato: contrato.numero_contrato, tipo: contrato.tipo, status: contrato.status, valor_global: Number(contrato.valor_global) },
        consumos: r.consumos.map((c) => ({ id: c.id, item_ata_id: c.item_ata_id, numero_item: c.numero_item, quantidade: Number(c.quantidade), valor_total: Number(c.valor_total) })),
        valor_total: r.valorTotal,
      };
    } catch (e) {
      // Compensação: o saldo não fica consumido sem instrumento
      await this.ds.transaction(async (m) => {
        await this.ata(m, ataId, true);
        await m.query(`DELETE FROM ata_consumos WHERE id = ANY($1::uuid[])`, [r.consumos.map((c) => c.id)]);
        await recalcularSaldoAta(m, ataId);
      });
      throw e;
    }
  }

  // ==========================================================================
  // ADESÃO (carona — art. 86)
  // ==========================================================================

  /** Quantidades já pedidas (adesões ativas) por item: do órgão e no total — dentro da transação. */
  private async somasAdesoes(m: EntityManager, ataId: string, orgaoId: string, excluirAdesaoId?: string | null) {
    const rows: any[] = await m.query(
      `SELECT ai.item_ata_id,
              SUM(ai.quantidade) AS total,
              SUM(ai.quantidade) FILTER (WHERE ad.orgao_aderente_id = $2) AS do_orgao
         FROM adesoes_ata_itens ai JOIN adesoes_ata ad ON ad.id = ai.adesao_id
        WHERE ad.ata_id = $1 AND ad.status = ANY($3::varchar[]) AND ($4::uuid IS NULL OR ad.id <> $4::uuid)
        GROUP BY ai.item_ata_id`,
      [ataId, orgaoId, STATUS_ADESAO_ATIVA, excluirAdesaoId ?? null],
    );
    return new Map(rows.map((r) => [r.item_ata_id, { total: Number(r.total || 0), doOrgao: Number(r.do_orgao || 0) }]));
  }

  private async conferirLimites(m: EntityManager, ata: any, orgaoAderente: string, itens: ItemPedido[], excluirAdesaoId?: string | null) {
    const itensAta = await this.itensDaAta(m, ata.id);
    const porId = new Map(itensAta.map((i) => [i.id, i]));
    const somas = await this.somasAdesoes(m, ata.id, orgaoAderente, excluirAdesaoId);
    const erros: string[] = [];
    const vistos = new Set<string>();
    for (const it of itens) {
      const item = porId.get(it.item_ata_id);
      if (!item) {
        erros.push(`Item ${it.item_ata_id} não pertence a esta ata.`);
        continue;
      }
      if (vistos.has(it.item_ata_id)) {
        erros.push(`Item ${item.numero_item} repetido no pedido.`);
        continue;
      }
      vistos.add(it.item_ata_id);
      const s = somas.get(it.item_ata_id) ?? { total: 0, doOrgao: 0 };
      const e = motivoLimiteAdesao({
        rotulo: `Item ${item.numero_item}`,
        quantidadeRegistrada: Number(item.quantidade_registrada),
        solicitada: Number(it.quantidade),
        jaDoOrgao: s.doOrgao,
        jaTotal: s.total,
      });
      if (e) erros.push(e);
    }
    if (erros.length) throw new BadRequestException(erros.join(' '));
  }

  /** Pedido de adesão de órgão NÃO participante (justificativa de vantagem; limites do art. 86). */
  async solicitarAdesao(ataId: string, atorJwt: Ator, body: { justificativa_vantagem: string; itens: ItemPedido[] }) {
    const orgaoId = this.orgaoDoAtor(atorJwt);
    const ator = atorTransicaoDe(atorJwt);
    return this.ds.transaction(async (m) => {
      const ata = await this.ata(m, ataId, true);
      if (ata.orgao_id === orgaoId) throw new BadRequestException('O órgão gerenciador não adere à própria ata — contrate a partir dela.');
      if (!STATUS_CONSUMIVEL.includes(ata.status as StatusAta) || ataVencida(ata.data_vigencia_fim)) {
        throw new BadRequestException('Só se adere a ata vigente.');
      }
      if (!ata.permite_adesao) throw new BadRequestException('Esta ata não admite adesão de órgãos não participantes.');
      const just = String(body?.justificativa_vantagem || '').trim();
      if (just.length < 20) {
        throw new BadRequestException('Apresente a justificativa e a demonstração da vantagem da adesão (art. 86 §2º I e II).');
      }
      if (!Array.isArray(body?.itens) || !body.itens.length) throw new BadRequestException('Informe os itens e as quantidades da adesão.');
      await this.conferirLimites(m, ata, orgaoId, body.itens);
      const repo = m.getRepository(AdesaoAta);
      const adesao = await repo.save(
        repo.create({
          ata_id: ata.id,
          orgao_gerenciador_id: ata.orgao_id,
          orgao_aderente_id: orgaoId,
          justificativa_vantagem: just,
          status: StatusAdesao.SOLICITADA,
          ator_tipo: ator.tipo,
          ator_id: ator.id,
        }),
      );
      const itemRepo = m.getRepository(AdesaoAtaItem);
      await itemRepo.save(body.itens.map((i) => itemRepo.create({ adesao_id: adesao.id, item_ata_id: i.item_ata_id, quantidade: arred4(Number(i.quantidade)) })));
      return this.adesaoDetalhe(m, adesao.id);
    });
  }

  private async adesaoDetalhe(m: EntityManager, adesaoId: string) {
    const [a] = await m.query(
      `SELECT ad.*, og.nome AS orgao_gerenciador_nome, oa.nome AS orgao_aderente_nome,
              at.numero_ata, at.objeto, at.fornecedor_razao_social, at.fornecedor_id, at.status::text AS status_ata,
              at.data_vigencia_fim
         FROM adesoes_ata ad
         JOIN atas_registro_preco at ON at.id = ad.ata_id
         LEFT JOIN orgaos og ON og.id::text = ad.orgao_gerenciador_id
         LEFT JOIN orgaos oa ON oa.id::text = ad.orgao_aderente_id
        WHERE ad.id = $1`,
      [adesaoId],
    );
    if (!a) throw new NotFoundException('Adesão não encontrada');
    const itens = await m.query(
      `SELECT ai.id, ai.item_ata_id, ai.quantidade, ai.quantidade_utilizada, i.numero_item, i.descricao, i.unidade_medida,
              i.valor_unitario, i.quantidade_registrada
         FROM adesoes_ata_itens ai JOIN itens_ata i ON i.id = ai.item_ata_id
        WHERE ai.adesao_id = $1 ORDER BY i.numero_item`,
      [adesaoId],
    );
    return {
      ...a,
      itens: itens.map((i: any) => ({
        ...i,
        quantidade: Number(i.quantidade),
        quantidade_utilizada: Number(i.quantidade_utilizada),
        saldo: saldoItem(Number(i.quantidade), Number(i.quantidade_utilizada)),
        valor_unitario: Number(i.valor_unitario),
        quantidade_registrada: Number(i.quantidade_registrada),
      })),
    };
  }

  /** Lê a adesão: gerenciador, aderente ou fornecedor da ata (demais → 404). */
  async obterAdesao(adesaoId: string, ator: Ator) {
    if (!ehUuid(adesaoId)) throw new NotFoundException('Adesão não encontrada');
    const d = await this.adesaoDetalhe(this.ds.manager, adesaoId);
    const pode =
      ator?.admin ||
      (ehOrgao(ator) && (ator.orgaoId === d.orgao_gerenciador_id || ator.orgaoId === d.orgao_aderente_id)) ||
      (ehFornecedor(ator) && ator.fornecedorId === String(d.fornecedor_id));
    if (!pode) throw new NotFoundException('Adesão não encontrada');
    return d;
  }

  private async adesaoParaAto(m: EntityManager, adesaoId: string) {
    if (!ehUuid(adesaoId)) throw new NotFoundException('Adesão não encontrada');
    const [ad] = await m.query(`SELECT * FROM adesoes_ata WHERE id = $1`, [adesaoId]);
    if (!ad) throw new NotFoundException('Adesão não encontrada');
    const ata = await this.ata(m, ad.ata_id, true); // lock da ata (serializa limites e consumo)
    const [adLock] = await m.query(`SELECT * FROM adesoes_ata WHERE id = $1 FOR UPDATE`, [adesaoId]);
    return { ad: adLock, ata };
  }

  private async itensDaAdesao(m: EntityManager, adesaoId: string): Promise<ItemPedido[]> {
    const rows: any[] = await m.query(`SELECT item_ata_id, quantidade FROM adesoes_ata_itens WHERE adesao_id = $1`, [adesaoId]);
    return rows.map((r) => ({ item_ata_id: r.item_ata_id, quantidade: Number(r.quantidade) }));
  }

  /** Anuência (ou recusa) do órgão gerenciador (art. 86 §2º III). */
  async anuirAdesao(adesaoId: string, atorJwt: Ator, body: { aceitar: boolean; motivo?: string }) {
    const ator = atorTransicaoDe(atorJwt);
    return this.ds.transaction(async (m) => {
      const { ad, ata } = await this.adesaoParaAto(m, adesaoId);
      this.acesso.assertMesmoOrgao(atorJwt, ata.orgao_id, 'escrita', 'Adesão');
      if (ad.status !== StatusAdesao.SOLICITADA) throw new ConflictException(`A adesão não aguarda a anuência do gerenciador (situação ${ad.status}).`);
      if (body?.aceitar) {
        await this.conferirLimites(m, ata, ad.orgao_aderente_id, await this.itensDaAdesao(m, ad.id), ad.id);
        await m.query(`UPDATE adesoes_ata SET status = $2, anuencia_em = now(), ator_tipo = $3, ator_id = $4, updated_at = now() WHERE id = $1`, [
          ad.id,
          StatusAdesao.ANUENCIA_GERENCIADOR,
          ator.tipo,
          ator.id,
        ]);
      } else {
        await this.recusar(m, ad.id, 'GERENCIADOR', body?.motivo, ator);
      }
      return this.adesaoDetalhe(m, ad.id);
    });
  }

  /** Aceite (ou recusa) do FORNECEDOR da ata (art. 86 §2º III) — pelo próprio login. */
  async responderAdesaoFornecedor(adesaoId: string, atorJwt: Ator, body: { aceitar: boolean; motivo?: string }) {
    if (!ehFornecedor(atorJwt)) throw new ForbiddenException('Ação exclusiva do fornecedor da ata');
    const ator = atorTransicaoDe(atorJwt);
    return this.ds.transaction(async (m) => {
      const { ad, ata } = await this.adesaoParaAto(m, adesaoId);
      if (String(ata.fornecedor_id) !== atorJwt.fornecedorId) throw new NotFoundException('Adesão não encontrada');
      if (ad.status !== StatusAdesao.ANUENCIA_GERENCIADOR) {
        throw new ConflictException(`A adesão não aguarda o aceite do fornecedor (situação ${ad.status}).`);
      }
      if (body?.aceitar) {
        await m.query(`UPDATE adesoes_ata SET status = $2, aceite_fornecedor_em = now(), ator_tipo = $3, ator_id = $4, updated_at = now() WHERE id = $1`, [
          ad.id,
          StatusAdesao.ACEITE_FORNECEDOR,
          ator.tipo,
          ator.id,
        ]);
      } else {
        await this.recusar(m, ad.id, 'FORNECEDOR', body?.motivo, ator);
      }
      return this.adesaoDetalhe(m, ad.id);
    });
  }

  /** Autorização final do gerenciador (limites conferidos de novo) — o aderente passa a contratar. */
  async autorizarAdesao(adesaoId: string, atorJwt: Ator) {
    const ator = atorTransicaoDe(atorJwt);
    return this.ds.transaction(async (m) => {
      const { ad, ata } = await this.adesaoParaAto(m, adesaoId);
      this.acesso.assertMesmoOrgao(atorJwt, ata.orgao_id, 'escrita', 'Adesão');
      if (ad.status !== StatusAdesao.ACEITE_FORNECEDOR) {
        throw new ConflictException(`A adesão só é autorizada depois do aceite do fornecedor (situação ${ad.status}).`);
      }
      if (!STATUS_CONSUMIVEL.includes(ata.status as StatusAta) || ataVencida(ata.data_vigencia_fim)) {
        throw new BadRequestException('A ata não está vigente — adesão não autorizada.');
      }
      await this.conferirLimites(m, ata, ad.orgao_aderente_id, await this.itensDaAdesao(m, ad.id), ad.id);
      const hoje = hojeBrasilia();
      await m.query(
        `UPDATE adesoes_ata SET status = $2, autorizada_em = now(), prazo_contratacao = $3, ator_tipo = $4, ator_id = $5, updated_at = now() WHERE id = $1`,
        [ad.id, StatusAdesao.AUTORIZADA, prazoContratacaoAdesao(hoje, ata.data_vigencia_fim), ator.tipo, ator.id],
      );
      await recalcularSaldoAta(m, ata.id);
      return this.adesaoDetalhe(m, ad.id);
    });
  }

  /** Desistência do aderente (antes da autorização). */
  async cancelarAdesao(adesaoId: string, atorJwt: Ator, body: { motivo?: string }) {
    const orgaoId = this.orgaoDoAtor(atorJwt);
    const ator = atorTransicaoDe(atorJwt);
    return this.ds.transaction(async (m) => {
      const { ad } = await this.adesaoParaAto(m, adesaoId);
      if (ad.orgao_aderente_id !== orgaoId) throw new NotFoundException('Adesão não encontrada');
      if (![StatusAdesao.SOLICITADA, StatusAdesao.ANUENCIA_GERENCIADOR, StatusAdesao.ACEITE_FORNECEDOR].includes(ad.status)) {
        throw new ConflictException(`A adesão não pode ser cancelada na situação ${ad.status}.`);
      }
      await m.query(
        `UPDATE adesoes_ata SET status = 'CANCELADA', motivo_recusa = $2, recusada_por = 'ADERENTE', recusada_em = now(), ator_tipo = $3, ator_id = $4, updated_at = now() WHERE id = $1`,
        [ad.id, body?.motivo || 'Desistência do órgão aderente', ator.tipo, ator.id],
      );
      return this.adesaoDetalhe(m, ad.id);
    });
  }

  private async recusar(m: EntityManager, adesaoId: string, por: 'GERENCIADOR' | 'FORNECEDOR', motivo: string | undefined, ator: AtorTransicao) {
    if (!motivo || String(motivo).trim().length < 5) throw new BadRequestException('Informe o motivo da recusa.');
    await m.query(
      `UPDATE adesoes_ata SET status = 'RECUSADA', motivo_recusa = $2, recusada_por = $3, recusada_em = now(), ator_tipo = $4, ator_id = $5, updated_at = now() WHERE id = $1`,
      [adesaoId, String(motivo).trim(), por, ator.tipo, ator.id],
    );
  }

  /** Adesões do órgão como ADERENTE (vê só as suas + dados públicos da ata). */
  async minhasAdesoes(atorJwt: Ator) {
    const orgaoId = this.orgaoDoAtor(atorJwt);
    const ids: any[] = await this.ds.query(`SELECT id FROM adesoes_ata WHERE orgao_aderente_id = $1 ORDER BY created_at DESC`, [orgaoId]);
    const out: any[] = [];
    for (const r of ids) out.push(await this.adesaoDetalhe(this.ds.manager, r.id));
    return out;
  }

  /** Adesões pedidas às atas do órgão GERENCIADOR (todas as atas dele). */
  async adesoesRecebidas(atorJwt: Ator) {
    const orgaoId = this.orgaoDoAtor(atorJwt);
    const ids: any[] = await this.ds.query(`SELECT id FROM adesoes_ata WHERE orgao_gerenciador_id = $1 ORDER BY created_at DESC`, [orgaoId]);
    const out: any[] = [];
    for (const r of ids) out.push(await this.adesaoDetalhe(this.ds.manager, r.id));
    return out;
  }

  // ==========================================================================
  // VIGÊNCIA: expiração, prorrogação, cancelamento do registro
  // ==========================================================================

  /** Job diário: VIGENTE/ESGOTADA com fim de vigência passado → VENCIDA; reservas vencidas → EXPIRADO. */
  async expirarAtasVencidas(hoje: string = hojeBrasilia()): Promise<{ vencidas: string[]; reservasExpiradas: number }> {
    const r = await this.ds.query(
      `UPDATE atas_registro_preco SET status = 'VENCIDA', updated_at = now()
        WHERE status::text IN ('VIGENTE','ESGOTADA') AND data_vigencia_fim < $1::date
        RETURNING id, numero_ata`,
      [hoje],
    );
    const linhas: any[] = Array.isArray(r) && Array.isArray(r[0]) ? r[0] : r;
    const reservasExpiradas = await this.expirarReservasVencidas();
    if (linhas.length) this.logger.log(`Vigência: ${linhas.length} ata(s) → VENCIDA (${linhas.map((l) => l.numero_ata).join(', ')})`);
    return { vencidas: linhas.map((l) => l.id), reservasExpiradas };
  }

  /** Prorrogação única, ≤ 12 meses, com motivo, antes do fim da vigência (art. 84). */
  async prorrogar(ataId: string, atorJwt: Ator, body: { meses: number; motivo: string }) {
    return this.ds.transaction(async (m) => {
      const ata = await this.ata(m, ataId, true);
      this.assertGerenciador(atorJwt, ata);
      const meses = Number(body?.meses);
      const erro = motivoProrrogacaoInvalida({
        status: ata.status,
        prorrogada: !!ata.prorrogada,
        dataVigenciaFim: ata.data_vigencia_fim,
        meses,
        motivo: body?.motivo,
      });
      if (erro) throw new BadRequestException(erro);
      const fimAtual = dataIso(ata.data_vigencia_fim) as string;
      const novoFim = somarDias(somarMeses(somarDias(fimAtual, 1), meses), -1);
      await m.query(
        `UPDATE atas_registro_preco SET prorrogada = true, prorrogacao_meses = $2, prorrogacao_motivo = $3, prorrogada_em = now(),
            data_vigencia_fim_original = data_vigencia_fim, data_vigencia_fim = $4, updated_at = now() WHERE id = $1`,
        [ata.id, meses, String(body.motivo).trim(), novoFim],
      );
      return { id: ata.id, numero_ata: ata.numero_ata, data_vigencia_fim_anterior: fimAtual, data_vigencia_fim: novoFim, prorrogacao_meses: meses };
    });
  }

  /**
   * Cancelamento do REGISTRO do fornecedor (Dec. 11.462 arts. 28–29): ata
   * CANCELADA (nada mais se consome; adesões em andamento recusadas) e, por
   * item com saldo, convocação do PRÓXIMO do cadastro de reserva que aderiu
   * ao preço do vencedor → nova ata (AGUARDANDO_ASSINATURA) com o saldo, ao
   * mesmo preço, até o fim da vigência original; os demais da reserva seguem
   * na ordem na nova ata.
   */
  async cancelarRegistro(ataId: string, atorJwt: Ator, body: { hipotese: string; motivo: string }) {
    const ator = atorTransicaoDe(atorJwt);
    const r = await this.ds.transaction(async (m) => {
      const ata = await this.ata(m, ataId, true);
      this.assertGerenciador(atorJwt, ata);
      const erro = motivoCancelamentoInvalido({ status: ata.status, hipotese: body?.hipotese, motivo: body?.motivo });
      if (erro) throw new BadRequestException(erro);
      await this.expirarReservasVencidas(m, ataId);
      await m.query(
        `UPDATE atas_registro_preco SET status = 'CANCELADA', cancelamento_hipotese = $2, cancelamento_motivo = $3, cancelada_em = now(), updated_at = now() WHERE id = $1`,
        [ata.id, body.hipotese, String(body.motivo).trim()],
      );
      await m.query(
        `UPDATE adesoes_ata SET status = 'RECUSADA', recusada_por = 'GERENCIADOR', recusada_em = now(),
            motivo_recusa = 'Registro do fornecedor cancelado na ata', updated_at = now()
          WHERE ata_id = $1 AND status IN ('SOLICITADA','ANUENCIA_GERENCIADOR','ACEITE_FORNECEDOR')`,
        [ata.id],
      );

      const itens = await this.itensDaAta(m, ata.id);
      const reservas: any[] = await m.query(`SELECT * FROM ata_cadastro_reserva WHERE ata_id = $1 FOR UPDATE`, [ata.id]);
      const convocacoes = new Map<string, Array<{ item: any; reserva: any; seguintes: any[] }>>();
      const itensSemReserva: number[] = [];
      for (const item of itens) {
        const saldo = saldoItem(Number(item.quantidade_registrada), Number(item.quantidade_utilizada));
        if (saldo <= 0) continue;
        const doItem = reservas.filter((x) => x.item_ata_id === item.id);
        const prox = proximoDaReserva(doItem.map((x) => ({ ...x, posicao: Number(x.posicao) })));
        if (!prox) {
          itensSemReserva.push(Number(item.numero_item));
          continue;
        }
        const seguintes = doItem.filter((x) => x.status === StatusReserva.ADERIU && Number(x.posicao) > Number(prox.posicao));
        const lista = convocacoes.get(prox.fornecedor_id) ?? [];
        lista.push({ item: { ...item, saldo }, reserva: prox, seguintes });
        convocacoes.set(prox.fornecedor_id, lista);
      }

      const novas: any[] = [];
      const hoje = hojeBrasilia();
      for (const [fornecedorId, lista] of convocacoes) {
        const [forn] = await m.query(`SELECT id, cpf_cnpj, razao_social, nome_fantasia FROM fornecedores WHERE id::text = $1`, [fornecedorId]);
        if (!forn) continue;
        const nova = await this.novaAta(m, {
          orgaoId: ata.orgao_id,
          licitacaoId: ata.licitacao_id,
          fornecedor: forn,
          objeto: ata.objeto,
          meses: ata.prazo_vigencia_meses,
          inicio: hoje,
          fim: dataIso(ata.data_vigencia_fim) as string,
          origem: OrigemAta.RESERVA,
          ataOrigemId: ata.id,
          prazoReserva: null,
          observacoes: `Convocação do cadastro de reserva: registro do fornecedor ${ata.fornecedor_razao_social} cancelado na Ata ${ata.numero_ata} (${HIPOTESES_CANCELAMENTO[body.hipotese]}).`,
          ator,
          itens: lista.map(({ item }) => ({
            numero_item: item.numero_item,
            descricao: item.descricao,
            descricao_detalhada: item.descricao_detalhada,
            codigo_catalogo: item.codigo_catalogo,
            unidade_medida: item.unidade_medida,
            quantidade_registrada: item.saldo,
            valor_unitario: Number(item.valor_unitario),
            valor_total: arred2(item.saldo * Number(item.valor_unitario)),
            marca: null as any,
            item_licitacao_id: item.item_licitacao_id,
          })),
        });
        const itensNova: any[] = await m.query(`SELECT id, item_licitacao_id, numero_item FROM itens_ata WHERE ata_id = $1`, [nova.id]);
        for (const { item, reserva, seguintes } of lista) {
          await m.query(`UPDATE ata_cadastro_reserva SET status = 'CONVOCADO', ata_convocada_id = $2, updated_at = now() WHERE id = $1`, [reserva.id, nova.id]);
          const alvo = itensNova.find((x) => Number(x.numero_item) === Number(item.numero_item));
          for (const s of seguintes) {
            await m.query(
              `INSERT INTO ata_cadastro_reserva (id, ata_id, item_ata_id, fornecedor_id, posicao, valor_ofertado, status, prazo_resposta, respondido_em, created_at, updated_at)
               VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'ADERIU', NULL, $6, now(), now())
               ON CONFLICT (item_ata_id, fornecedor_id) DO NOTHING`,
              [nova.id, alvo.id, s.fornecedor_id, s.posicao, s.valor_ofertado, s.respondido_em],
            );
          }
        }
        novas.push({ id: nova.id, numero_ata: nova.numero_ata, fornecedor_id: fornecedorId, fornecedor_razao_social: nova.fornecedor_razao_social, itens: lista.map((x) => x.item.numero_item) });
      }
      return { ata, novas, itensSemReserva };
    });
    // Termo não assinado do titular: cancela o documento de assinatura (melhor esforço)
    if (r.ata.documento_assinatura_id && r.ata.status === StatusAta.AGUARDANDO_ASSINATURA) {
      await this.assinaturas.cancelarDocumento(r.ata.documento_assinatura_id, r.ata.orgao_id).catch(() => undefined);
    }
    return {
      id: r.ata.id,
      numero_ata: r.ata.numero_ata,
      status: StatusAta.CANCELADA,
      hipotese: body.hipotese,
      convocadas: r.novas,
      itens_sem_reserva: r.itensSemReserva,
    };
  }

  // ==========================================================================
  // LEITURA
  // ==========================================================================

  /** Painel do GERENCIADOR: itens/saldo, consumos, adesões, reserva, assinatura, vigência. */
  async painel(ataId: string, atorJwt: Ator) {
    const ata = await this.ata(this.ds.manager, ataId);
    this.assertGerenciador(atorJwt, ata, 'leitura');
    await this.expirarReservasVencidas(this.ds.manager, ataId);
    return this.montarPainel(ata, { completo: true });
  }

  private async montarPainel(ata: any, opts: { completo: boolean; fornecedorId?: string }) {
    const itens = (await this.itensDaAta(this.ds.manager, ata.id)).map((i) => ({
      ...i,
      quantidade_registrada: Number(i.quantidade_registrada),
      quantidade_utilizada: Number(i.quantidade_utilizada),
      quantidade_saldo: Number(i.quantidade_saldo),
      quantidade_adesao_autorizada: Number(i.quantidade_adesao_autorizada),
      quantidade_adesao_utilizada: Number(i.quantidade_adesao_utilizada),
      limite_adesao_por_orgao: arred4(Number(i.quantidade_registrada) * 0.5),
      limite_adesao_total: arred4(Number(i.quantidade_registrada) * 2),
      valor_unitario: Number(i.valor_unitario),
      valor_total: Number(i.valor_total),
    }));
    const [lic] = await this.ds.query(`SELECT id, numero_processo, numero_edital, modalidade::text AS modalidade, objeto FROM licitacoes WHERE id = $1`, [ata.licitacao_id]);
    const [orgao] = await this.ds.query(`SELECT id, nome, cnpj, cidade, uf FROM orgaos WHERE id::text = $1`, [ata.orgao_id]);
    const adesoes = (
      await this.ds.query(`SELECT id FROM adesoes_ata WHERE ata_id = $1 ORDER BY created_at DESC`, [ata.id])
    ) as any[];
    const adesoesDet: any[] = [];
    for (const a of adesoes) adesoesDet.push(await this.adesaoDetalhe(this.ds.manager, a.id));
    const assinatura = ata.documento_assinatura_id
      ? (
          await this.ds.query(
            `SELECT d.id, d.status::text AS status, d.arquivo_assinado_url,
                    COALESCE(json_agg(json_build_object('nome', s.nome, 'status', s.status::text, 'is_orgao_user', s.is_orgao_user,
                      'data_assinatura', s.data_assinatura) ORDER BY s.is_orgao_user DESC) FILTER (WHERE s.id IS NOT NULL), '[]') AS signatarios
               FROM documentos_assinatura d LEFT JOIN signatarios_documento s ON s.documento_id = d.id
              WHERE d.id = $1 GROUP BY d.id`,
            [ata.documento_assinatura_id],
          )
        )[0] ?? null
      : null;
    const base: any = {
      ata: {
        ...ata,
        valor_total: Number(ata.valor_total),
        valor_utilizado: Number(ata.valor_utilizado),
        valor_saldo: Number(ata.valor_saldo),
        vencida: ataVencida(ata.data_vigencia_fim),
      },
      orgao,
      licitacao: lic ?? null,
      itens,
      assinatura,
      adesoes: opts.fornecedorId ? adesoesDet.filter((a) => a.status !== StatusAdesao.SOLICITADA) : adesoesDet,
      hipoteses_cancelamento: HIPOTESES_CANCELAMENTO,
    };
    if (opts.completo) {
      base.consumos = await this.ds.query(
        `SELECT c.id, c.item_ata_id, i.numero_item, c.quantidade::float AS quantidade, c.valor_unitario::float AS valor_unitario,
                c.valor_total::float AS valor_total, c.origem, c.adesao_id, c.orgao_consumidor_id, o.nome AS orgao_consumidor_nome,
                c.contrato_id, ct.numero_contrato, ct.tipo::text AS contrato_tipo, ct.status::text AS contrato_status, c.data, c.observacao
           FROM ata_consumos c JOIN itens_ata i ON i.id = c.item_ata_id
           LEFT JOIN orgaos o ON o.id::text = c.orgao_consumidor_id
           LEFT JOIN contratos ct ON ct.id = c.contrato_id
          WHERE c.ata_id = $1 ORDER BY c.created_at DESC`,
        [ata.id],
      );
      base.reserva = await this.ds.query(
        `SELECT r.id, r.item_ata_id, i.numero_item, r.fornecedor_id, f.razao_social, f.cpf_cnpj, r.posicao, r.status,
                r.valor_ofertado::float AS valor_ofertado, r.prazo_resposta, r.respondido_em, r.ata_convocada_id
           FROM ata_cadastro_reserva r JOIN itens_ata i ON i.id = r.item_ata_id
           LEFT JOIN fornecedores f ON f.id::text = r.fornecedor_id
          WHERE r.ata_id = $1 ORDER BY i.numero_item, r.posicao`,
        [ata.id],
      );
      base.atas_relacionadas = await this.ds.query(
        `SELECT id, numero_ata, status::text AS status, fornecedor_razao_social, origem FROM atas_registro_preco
          WHERE (ata_origem_id = $1 OR id = $2) AND id <> $1`,
        [ata.id, ata.ata_origem_id],
      );
    }
    return base;
  }

  /** Painel do FORNECEDOR (só a própria ata): itens/saldo, adesões para aceite e o link de assinatura. */
  async painelFornecedor(ataId: string, atorJwt: Ator) {
    if (!ehFornecedor(atorJwt)) throw new ForbiddenException('Ação exclusiva de fornecedor');
    const ata = await this.ata(this.ds.manager, ataId);
    if (String(ata.fornecedor_id) !== atorJwt.fornecedorId) throw new NotFoundException('Ata não encontrada');
    const p = await this.montarPainel(ata, { completo: false, fornecedorId: atorJwt.fornecedorId });
    let link_assinatura: string | null = null;
    if (ata.documento_assinatura_id) {
      const [forn] = await this.ds.query(`SELECT cpf_cnpj FROM fornecedores WHERE id::text = $1`, [atorJwt.fornecedorId]);
      const [s] = await this.ds.query(
        `SELECT token_acesso, status::text AS status FROM signatarios_documento
          WHERE documento_id = $1 AND is_orgao_user = false AND cpf_cnpj = $2`,
        [ata.documento_assinatura_id, String(forn?.cpf_cnpj || '').replace(/\D/g, '')],
      );
      if (s && s.status !== 'ASSINADO') link_assinatura = `/assinar-documento/${s.token_acesso}`;
    }
    return { ...p, link_assinatura };
  }
}
