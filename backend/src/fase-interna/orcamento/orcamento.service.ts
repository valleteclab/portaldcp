import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ehUuid } from '../../auth/acesso/acesso-licitacao.service';
import {
  DocumentoFaseInterna,
  OrigemDocumento,
  StatusDocumento,
  TipoDocumentoFaseInterna,
} from '../entities/documento-fase-interna.entity';
import { AcaoLogFaseInterna } from '../entities/log-fase-interna.entity';
import { AuditLogService } from '../audit-log.service';
import { GeradorDocumentoService } from '../gerador-documento.service';
import { ModeloDocumentoService } from '../modelo-documento.service';
import { TarefasService } from '../tarefas/tarefas.service';
import { PassoFaseInterna } from '../tarefas/etapas-fase-interna';
import { hojeEmBrasilia } from '../peca-regras';
import { DotacaoOrcamentaria, LeiOrcamentaria, ReservaOrcamentaria, ReservaOrcamentariaLinha, TipoLeiOrcamentaria } from './orcamento.entities';
import { LinhaReserva, conferirParaEmitir, linhasNaEmissao, planoRenovacao, precisaRenovar, totalDasLinhas, validarLinhas } from '../telas/reserva-regras';

type Autor = { id: string | null; nome: string | null };

const BRL = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const texto = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);
const TIPOS_LEI: TipoLeiOrcamentaria[] = ['LDO', 'LOA', 'PPA'];

/** Chave da tarefa do sistema "Renovar dotação" (uma aberta por processo). */
export const CHAVE_TAREFA_RENOVACAO = 'sistema:renovar-dotacao';

/**
 * ORÇAMENTO (Entrega 3A):
 *  - tabelas do órgão: dotações (por exercício) e leis orçamentárias (tabela
 *    única LDO/LOA/PPA) — o órgão cadastra em Configurações ou no cadastro
 *    rápido da própria tela da reserva;
 *  - RESERVA ORÇAMENTÁRIA do processo: classificação escolhida da tabela,
 *    linhas por exercício (RESERVADO/PREVISAO), emissão da informação
 *    orçamentária (peça DO pelo modelo) e "Renovar dotação" na virada do
 *    exercício (nova versão + tarefa da Contabilidade).
 * Autorização: órgão do token nas tabelas; órgão dono da licitação na
 * reserva (DonoFaseInternaGuard no controller).
 */
@Injectable()
export class OrcamentoService {
  private readonly logger = new Logger(OrcamentoService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(DotacaoOrcamentaria) private readonly dotacaoRepo: Repository<DotacaoOrcamentaria>,
    @InjectRepository(LeiOrcamentaria) private readonly leiRepo: Repository<LeiOrcamentaria>,
    @InjectRepository(ReservaOrcamentaria) private readonly reservaRepo: Repository<ReservaOrcamentaria>,
    @InjectRepository(ReservaOrcamentariaLinha) private readonly linhaRepo: Repository<ReservaOrcamentariaLinha>,
    @InjectRepository(DocumentoFaseInterna) private readonly docRepo: Repository<DocumentoFaseInterna>,
    private readonly modelos: ModeloDocumentoService,
    private readonly gerador: GeradorDocumentoService,
    private readonly tarefas: TarefasService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Exercício corrente (Brasília). */
  exercicioCorrente(agora = new Date()): number {
    return Number(hojeEmBrasilia(agora).slice(0, 4));
  }

  // ==========================================================================
  // TABELAS DO ÓRGÃO
  // ==========================================================================

  async listarDotacoes(orgaoId: string, filtro: { exercicio?: number; todas?: boolean } = {}) {
    const qb = this.dotacaoRepo.createQueryBuilder('d').where('d.orgao_id = :orgaoId', { orgaoId });
    if (!filtro.todas) qb.andWhere('d.ativo = true');
    if (filtro.exercicio) qb.andWhere('d.exercicio = :e', { e: filtro.exercicio });
    return qb.orderBy('d.exercicio', 'DESC').addOrderBy('d.projeto_atividade', 'ASC').addOrderBy('d.elemento_despesa', 'ASC').getMany();
  }

  private dadosDotacao(body: any, parcial = false): Partial<DotacaoOrcamentaria> {
    const d: Partial<DotacaoOrcamentaria> = {};
    const obrig = (campo: string, rotulo: string) => {
      const v = texto(body?.[campo]);
      if (!v && !parcial) throw new BadRequestException(`Informe ${rotulo}.`);
      return v;
    };
    if (!parcial || body?.exercicio !== undefined) {
      const e = Number(body?.exercicio);
      if (!Number.isInteger(e) || e < 2000 || e > 2100) throw new BadRequestException('Exercício inválido.');
      d.exercicio = e;
    }
    for (const [campo, rotulo] of [
      ['unidade_orcamentaria', 'a unidade orçamentária'],
      ['projeto_atividade', 'o projeto/atividade'],
      ['elemento_despesa', 'o elemento de despesa'],
      ['fonte_recurso', 'a fonte de recurso'],
    ] as const) {
      if (!parcial || body?.[campo] !== undefined) {
        const v = obrig(campo, rotulo);
        if (v) (d as any)[campo] = v;
      }
    }
    if (body?.programa !== undefined) d.programa = texto(body.programa) || null;
    if (body?.saldo !== undefined) {
      const s = body.saldo === null || body.saldo === '' ? null : Number(body.saldo);
      if (s !== null && (!Number.isFinite(s) || s < 0)) throw new BadRequestException('Saldo inválido.');
      d.saldo = s === null ? null : s.toFixed(2);
    }
    if (body?.ativo !== undefined) d.ativo = !!body.ativo;
    return d;
  }

  async criarDotacao(orgaoId: string, body: any, autor: Autor) {
    const d = this.dadosDotacao(body);
    return this.dotacaoRepo.save(this.dotacaoRepo.create({ ...d, orgao_id: orgaoId, ativo: true, criado_por_nome: autor.nome }));
  }

  /** Escrita em registro de outro órgão: 403 (inexistente: 404). */
  private async dotacaoDoOrgaoParaEscrita(id: string, orgaoId: string) {
    const d = ehUuid(id) ? await this.dotacaoRepo.findOne({ where: { id } }) : null;
    if (!d) throw new NotFoundException('Dotação não encontrada');
    if (d.orgao_id !== orgaoId) throw new ForbiddenException('Dotação de outro órgão');
    return d;
  }

  async atualizarDotacao(orgaoId: string, id: string, body: any) {
    const d = await this.dotacaoDoOrgaoParaEscrita(id, orgaoId);
    Object.assign(d, this.dadosDotacao(body, true));
    return this.dotacaoRepo.save(d);
  }

  async listarLeis(orgaoId: string, filtro: { tipo?: string; todas?: boolean } = {}) {
    const qb = this.leiRepo.createQueryBuilder('l').where('l.orgao_id = :orgaoId', { orgaoId });
    if (!filtro.todas) qb.andWhere('l.ativo = true');
    if (filtro.tipo) qb.andWhere('l.tipo = :t', { t: String(filtro.tipo).toUpperCase() });
    return qb.orderBy('l.exercicio', 'DESC').addOrderBy('l.tipo', 'ASC').getMany();
  }

  private dadosLei(body: any, parcial = false): Partial<LeiOrcamentaria> {
    const l: Partial<LeiOrcamentaria> = {};
    if (!parcial || body?.tipo !== undefined) {
      const t = String(body?.tipo ?? '').toUpperCase() as TipoLeiOrcamentaria;
      if (!TIPOS_LEI.includes(t)) throw new BadRequestException('Tipo de lei deve ser LDO, LOA ou PPA.');
      l.tipo = t;
    }
    if (!parcial || body?.numero !== undefined) {
      const n = texto(body?.numero, 40);
      if (!n) throw new BadRequestException('Informe o número da lei.');
      l.numero = n;
    }
    if (!parcial || body?.exercicio !== undefined) {
      const e = Number(body?.exercicio);
      if (!Number.isInteger(e) || e < 2000 || e > 2100) throw new BadRequestException('Exercício inválido.');
      l.exercicio = e;
    }
    if (body?.exercicio_fim !== undefined) {
      const f = body.exercicio_fim === null || body.exercicio_fim === '' ? null : Number(body.exercicio_fim);
      if (f !== null && (!Number.isInteger(f) || f < 2000 || f > 2100)) throw new BadRequestException('Exercício final inválido.');
      l.exercicio_fim = f;
    }
    if (body?.data_publicacao !== undefined) {
      const dp = texto(body.data_publicacao, 10);
      if (dp && !/^\d{4}-\d{2}-\d{2}$/.test(dp)) throw new BadRequestException('Data de publicação inválida (AAAA-MM-DD).');
      l.data_publicacao = dp || null;
    }
    if (body?.ementa !== undefined) l.ementa = texto(body.ementa, 2000) || null;
    if (body?.ativo !== undefined) l.ativo = !!body.ativo;
    return l;
  }

  async criarLei(orgaoId: string, body: any) {
    return this.leiRepo.save(this.leiRepo.create({ ...this.dadosLei(body), orgao_id: orgaoId, ativo: true }));
  }

  async atualizarLei(orgaoId: string, id: string, body: any) {
    const l = ehUuid(id) ? await this.leiRepo.findOne({ where: { id } }) : null;
    if (!l) throw new NotFoundException('Lei não encontrada');
    if (l.orgao_id !== orgaoId) throw new ForbiddenException('Lei de outro órgão');
    Object.assign(l, this.dadosLei(body, true));
    return this.leiRepo.save(l);
  }

  /** "Lei nº 1.234/2024 (LDO 2025)". */
  rotuloLei(l: LeiOrcamentaria | null | undefined): string {
    if (!l) return '—';
    const periodo = l.tipo === 'PPA' && l.exercicio_fim ? `${l.exercicio}–${l.exercicio_fim}` : `${l.exercicio}`;
    return `Lei nº ${l.numero} (${l.tipo} ${periodo})`;
  }

  // ==========================================================================
  // RESERVA DO PROCESSO
  // ==========================================================================

  private async licitacao(licitacaoId: string) {
    const [lic] = await this.ds.query(
      `SELECT id::text AS id, orgao_id::text AS orgao_id, numero_processo, objeto, fase::text AS fase, situacao::text AS situacao,
              valor_total_estimado, sigilo_orcamento
         FROM licitacoes WHERE id::text = $1`,
      [licitacaoId],
    );
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    return lic as { id: string; orgao_id: string; numero_processo: string; objeto: string; fase: string; situacao: string; valor_total_estimado: string | null; sigilo_orcamento: string };
  }

  async reservaAtual(licitacaoId: string): Promise<ReservaOrcamentaria | null> {
    return this.reservaRepo.findOne({ where: { licitacao_id: licitacaoId, versao_atual: true }, relations: ['linhas'] });
  }

  private linhasDe(r: ReservaOrcamentaria | null): LinhaReserva[] {
    return (r?.linhas || [])
      .map((l) => ({ exercicio: l.exercicio, valor: Number(l.valor), situacao: l.situacao, numero_reserva: l.numero_reserva }))
      .sort((a, b) => a.exercicio - b.exercicio);
  }

  /** Valor da pesquisa (total adotado) — base do total esperado. */
  private async valorEstimado(licitacaoId: string, lic: { valor_total_estimado: string | null }): Promise<number | null> {
    const v = Number(lic.valor_total_estimado);
    return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
  }

  private async leisPorId(ids: Array<string | null | undefined>): Promise<Map<string, LeiOrcamentaria>> {
    const validos = ids.filter((x): x is string => !!x && ehUuid(x));
    if (!validos.length) return new Map();
    const leis = await this.leiRepo.createQueryBuilder('l').where('l.id IN (:...ids)', { ids: validos }).getMany();
    return new Map(leis.map((l) => [l.id, l]));
  }

  /** Tela da reserva: atual, histórico de versões, opções das tabelas, conferência e peça DO. */
  async obter(licitacaoId: string) {
    const lic = await this.licitacao(licitacaoId);
    const atual = await this.reservaAtual(licitacaoId);
    const versoes = await this.reservaRepo.find({ where: { licitacao_id: licitacaoId }, relations: ['linhas'], order: { versao: 'DESC' } });
    const exercicio = this.exercicioCorrente();
    const [dotacoes, leis] = await Promise.all([this.listarDotacoes(lic.orgao_id), this.listarLeis(lic.orgao_id)]);
    const leisMapa = await this.leisPorId(versoes.flatMap((v) => [v.lei_ldo_id, v.lei_loa_id, v.lei_ppa_id]));
    const valorEstimado = await this.valorEstimado(licitacaoId, lic);
    const linhas = this.linhasDe(atual);
    const conferencia = atual
      ? conferirParaEmitir(
          {
            dotacao_ok: !!atual.dotacao_id,
            lei_ldo_ok: !!atual.lei_ldo_id,
            linhas,
            declaracao_adequacao: atual.declaracao_adequacao,
            declaracao_lrf: atual.declaracao_lrf,
          },
          { exercicio_corrente: exercicio, valor_estimado: valorEstimado },
        )
      : null;
    const [doc] = await this.ds.query(
      `SELECT id::text AS id, status::text AS status, origem::text AS origem, versao, numero_peca, data_documento, folha_inicial, folha_final,
              (caminho_arquivo IS NOT NULL OR arquivo_pdf_path IS NOT NULL) AS tem_arquivo, dados_estruturados->>'reserva_id' AS reserva_id
         FROM documentos_fase_interna WHERE licitacao_id::text = $1 AND tipo::text = 'DO' AND versao_atual = true`,
      [licitacaoId],
    );
    const [tarefa] = await this.ds.query(
      `SELECT id::text AS id, titulo, status FROM tarefas WHERE licitacao_id::text = $1 AND chave = $2 AND status = 'ABERTA'`,
      [licitacaoId, CHAVE_TAREFA_RENOVACAO],
    );
    const paraTela = (r: ReservaOrcamentaria) => {
      const ls = this.linhasDe(r);
      return {
        id: r.id,
        versao: r.versao,
        versao_atual: r.versao_atual,
        status: r.status,
        exercicio_base: r.exercicio_base,
        dotacao_id: r.dotacao_id,
        unidade_orcamentaria: r.unidade_orcamentaria,
        programa: r.programa,
        projeto_atividade: r.projeto_atividade,
        elemento_despesa: r.elemento_despesa,
        fonte_recurso: r.fonte_recurso,
        lei_ldo_id: r.lei_ldo_id,
        lei_loa_id: r.lei_loa_id,
        lei_ppa_id: r.lei_ppa_id,
        lei_ldo: r.lei_ldo_id ? this.rotuloLei(leisMapa.get(r.lei_ldo_id)) : null,
        lei_loa: r.lei_loa_id ? this.rotuloLei(leisMapa.get(r.lei_loa_id)) : null,
        lei_ppa: r.lei_ppa_id ? this.rotuloLei(leisMapa.get(r.lei_ppa_id)) : null,
        declaracao_adequacao: r.declaracao_adequacao,
        declaracao_lrf: r.declaracao_lrf,
        observacao: r.observacao,
        motivo_renovacao: r.motivo_renovacao,
        motivo_devolucao: r.motivo_devolucao,
        documento_id: r.documento_id,
        emitida_em: r.emitida_em,
        emitida_por_nome: r.emitida_por_nome,
        linhas: ls,
        total: totalDasLinhas(ls),
        substitui_reserva_id: r.substitui_reserva_id,
        created_at: r.created_at,
      };
    };
    return {
      licitacao: { id: lic.id, numero_processo: lic.numero_processo, objeto: lic.objeto, fase: lic.fase, sigiloso: lic.sigilo_orcamento === 'SIGILOSO' },
      exercicio_corrente: exercicio,
      valor_estimado: valorEstimado,
      atual: atual ? paraTela(atual) : null,
      historico: versoes.filter((v) => !v.versao_atual).map(paraTela),
      precisa_renovar: atual ? precisaRenovar(atual, exercicio) : false,
      conferencia,
      peca: doc
        ? {
            documento_id: doc.id,
            status: doc.status,
            origem: doc.origem,
            anexada: doc.origem !== 'INTERNO',
            versao: doc.versao,
            numero_peca: doc.numero_peca,
            data_documento: doc.data_documento,
            folha_inicial: doc.folha_inicial,
            folha_final: doc.folha_final,
            tem_arquivo: !!doc.tem_arquivo,
            da_reserva_atual: !!atual && doc.reserva_id === atual.id,
          }
        : null,
      tarefa_renovacao: tarefa ?? null,
      opcoes: {
        dotacoes: dotacoes.map((d) => ({
          id: d.id,
          exercicio: d.exercicio,
          unidade_orcamentaria: d.unidade_orcamentaria,
          programa: d.programa,
          projeto_atividade: d.projeto_atividade,
          elemento_despesa: d.elemento_despesa,
          fonte_recurso: d.fonte_recurso,
          saldo: d.saldo === null ? null : Number(d.saldo),
        })),
        leis: leis.map((l) => ({ id: l.id, tipo: l.tipo, numero: l.numero, exercicio: l.exercicio, exercicio_fim: l.exercicio_fim, rotulo: this.rotuloLei(l) })),
      },
    };
  }

  /** Dotação do órgão (400 se não for dele — o id vem do formulário). */
  private async dotacaoDoOrgao(id: string, orgaoId: string): Promise<DotacaoOrcamentaria> {
    const d = ehUuid(id) ? await this.dotacaoRepo.findOne({ where: { id, orgao_id: orgaoId } }) : null;
    if (!d) throw new BadRequestException('Dotação não encontrada na tabela do órgão.');
    return d;
  }

  private async leiDoOrgao(id: string, orgaoId: string, tipo: TipoLeiOrcamentaria): Promise<LeiOrcamentaria> {
    const l = ehUuid(id) ? await this.leiRepo.findOne({ where: { id, orgao_id: orgaoId } }) : null;
    if (!l) throw new BadRequestException(`Lei (${tipo}) não encontrada na tabela do órgão.`);
    if (l.tipo !== tipo) throw new BadRequestException(`A lei escolhida não é uma ${tipo}.`);
    return l;
  }

  /**
   * AUTOSAVE da reserva em rascunho. Emitida não se edita (use "Retificar" ou
   * "Renovar dotação", que criam versão nova). Devolvida volta a rascunho.
   */
  async salvar(licitacaoId: string, body: any, autor: Autor) {
    const lic = await this.licitacao(licitacaoId);
    let r = await this.reservaAtual(licitacaoId);
    if (r && r.status === 'EMITIDA') {
      throw new ConflictException('A informação orçamentária já foi emitida. Para alterar, use "Retificar" ou "Renovar dotação" (nova versão).');
    }
    if (!r) {
      r = this.reservaRepo.create({
        orgao_id: lic.orgao_id,
        licitacao_id: licitacaoId,
        versao: 1,
        versao_atual: true,
        status: 'RASCUNHO',
        criado_por_id: autor.id,
        criado_por_nome: autor.nome,
        linhas: [],
      });
    }
    if (body?.dotacao_id !== undefined) {
      if (body.dotacao_id) {
        const d = await this.dotacaoDoOrgao(String(body.dotacao_id), lic.orgao_id);
        Object.assign(r, {
          dotacao_id: d.id,
          unidade_orcamentaria: d.unidade_orcamentaria,
          programa: d.programa,
          projeto_atividade: d.projeto_atividade,
          elemento_despesa: d.elemento_despesa,
          fonte_recurso: d.fonte_recurso,
        });
      } else {
        Object.assign(r, { dotacao_id: null, unidade_orcamentaria: null, programa: null, projeto_atividade: null, elemento_despesa: null, fonte_recurso: null });
      }
    }
    for (const [campo, tipo] of [
      ['lei_ldo_id', 'LDO'],
      ['lei_loa_id', 'LOA'],
      ['lei_ppa_id', 'PPA'],
    ] as const) {
      if (body?.[campo] === undefined) continue;
      (r as any)[campo] = body[campo] ? (await this.leiDoOrgao(String(body[campo]), lic.orgao_id, tipo)).id : null;
    }
    if (body?.declaracao_adequacao !== undefined) r.declaracao_adequacao = !!body.declaracao_adequacao;
    if (body?.declaracao_lrf !== undefined) r.declaracao_lrf = !!body.declaracao_lrf;
    if (body?.observacao !== undefined) r.observacao = texto(body.observacao, 4000) || null;
    if (r.status === 'DEVOLVIDA') r.status = 'RASCUNHO';

    let linhasNovas: LinhaReserva[] | null = null;
    if (body?.linhas !== undefined) {
      const v = validarLinhas(body.linhas);
      if (!v.ok) throw new BadRequestException(v.erro);
      linhasNovas = v.linhas;
    }
    await this.ds.transaction(async (m) => {
      const { linhas: _l, ...semLinhas } = r as any;
      const salvo = await m.getRepository(ReservaOrcamentaria).save(semLinhas);
      r!.id = salvo.id;
      if (linhasNovas) {
        await m.getRepository(ReservaOrcamentariaLinha).delete({ reserva_id: salvo.id });
        for (const l of linhasNovas) {
          await m.getRepository(ReservaOrcamentariaLinha).save(
            m.getRepository(ReservaOrcamentariaLinha).create({ reserva_id: salvo.id, exercicio: l.exercicio, valor: l.valor.toFixed(2), situacao: l.situacao, numero_reserva: l.numero_reserva ?? null }),
          );
        }
      }
    });
    return this.obter(licitacaoId);
  }

  /** Contexto {{reserva.*}} do modelo da informação orçamentária. */
  private async variaveisDaReserva(r: ReservaOrcamentaria, linhas: LinhaReserva[]): Promise<Record<string, string>> {
    const leis = await this.leisPorId([r.lei_ldo_id, r.lei_loa_id, r.lei_ppa_id]);
    const loa = r.lei_loa_id ? this.rotuloLei(leis.get(r.lei_loa_id)) : null;
    const tabela =
      '<table><tr><th>Exercício</th><th>Valor</th><th>Situação</th></tr>' +
      linhas
        .map(
          (l) =>
            `<tr><td>${l.exercicio}</td><td>${BRL(l.valor)}</td><td>${l.situacao === 'RESERVADO' ? `Reservado${l.numero_reserva ? ` (reserva nº ${l.numero_reserva})` : ''}` : 'Previsão — a confirmar na LOA do exercício'}</td></tr>`,
        )
        .join('') +
      `<tr><td><strong>Total</strong></td><td><strong>${BRL(totalDasLinhas(linhas))}</strong></td><td></td></tr></table>`;
    return {
      'reserva.total': BRL(totalDasLinhas(linhas)),
      'reserva.unidade_orcamentaria': r.unidade_orcamentaria || '—',
      'reserva.programa': r.programa || '—',
      'reserva.projeto_atividade': r.projeto_atividade || '—',
      'reserva.elemento_despesa': r.elemento_despesa || '—',
      'reserva.fonte_recurso': r.fonte_recurso || '—',
      'reserva.distribuicao': tabela,
      'reserva.lei_ldo': r.lei_ldo_id ? this.rotuloLei(leis.get(r.lei_ldo_id)) : '—',
      'reserva.lei_loa': loa || '—',
      'reserva.lei_ppa': r.lei_ppa_id ? this.rotuloLei(leis.get(r.lei_ppa_id)) : '—',
      'reserva.exercicio': String(r.exercicio_base ?? ''),
    };
  }

  /**
   * EMITIR a informação orçamentária: confere (dotação, LDO, declarações,
   * linhas), marca a linha do exercício corrente como RESERVADO, gera a peça
   * DO pelo MODELO (nova versão; a anterior fica no histórico) e o PDF. A peça
   * gerada conta como pronta: a tarefa da reserva conclui sozinha; havendo
   * tarefa de renovação aberta, ela é concluída aqui.
   */
  async emitir(licitacaoId: string, autor: Autor) {
    const lic = await this.licitacao(licitacaoId);
    const r = await this.reservaAtual(licitacaoId);
    if (!r) throw new BadRequestException('Preencha a reserva antes de emitir.');
    if (r.status === 'EMITIDA') throw new ConflictException('Esta versão já foi emitida.');
    const exercicio = this.exercicioCorrente();
    const conf = conferirParaEmitir(
      { dotacao_ok: !!r.dotacao_id, lei_ldo_ok: !!r.lei_ldo_id, linhas: this.linhasDe(r), declaracao_adequacao: r.declaracao_adequacao, declaracao_lrf: r.declaracao_lrf },
      { exercicio_corrente: exercicio, valor_estimado: await this.valorEstimado(licitacaoId, lic) },
    );
    if (conf.bloqueios.length) {
      throw new BadRequestException({ message: `Não é possível emitir: ${conf.bloqueios.join(' ')}`, pendencias: conf.bloqueios });
    }
    const linhas = linhasNaEmissao(this.linhasDe(r), exercicio);
    r.exercicio_base = exercicio;
    const vars = await this.variaveisDaReserva(r, linhas);

    // Conteúdo da peça pelo modelo (órgão → sistema)
    const contexto = { ...(await this.modelos.montarContextoVariaveis(licitacaoId)), ...vars };
    const modelo = await this.modelos.resolverModelo(lic.orgao_id, TipoDocumentoFaseInterna.DOTACAO_ORCAMENTARIA);
    const secoes: Record<string, string> = {};
    for (const s of modelo?.secoes || []) secoes[s.id] = s.texto_padrao ? this.modelos.substituirVariaveis(s.texto_padrao, contexto) : '';
    if (!Object.keys(secoes).length) {
      secoes.distribuicao = vars['reserva.distribuicao'];
    }
    if (r.observacao) secoes.observacao = `<p>${r.observacao.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!)}</p>`;

    const doc = await this.ds.transaction(async (m) => {
      await m.query(`SELECT id FROM licitacoes WHERE id::text = $1 FOR UPDATE`, [licitacaoId]);
      const repo = m.getRepository(DocumentoFaseInterna);
      const anterior = await repo.findOne({ where: { licitacao_id: licitacaoId, tipo: TipoDocumentoFaseInterna.DOTACAO_ORCAMENTARIA, versao_atual: true } });
      if (anterior) await repo.update(anterior.id, { versao_atual: false, status: StatusDocumento.SUBSTITUIDO });
      const novo = await repo.save(
        repo.create({
          licitacao_id: licitacaoId,
          tipo: TipoDocumentoFaseInterna.DOTACAO_ORCAMENTARIA,
          titulo: modelo?.nome || 'Informação orçamentária',
          descricao: Object.values(secoes).filter(Boolean).join('\n'),
          dados_estruturados: { ...secoes, reserva_id: r.id, reserva_versao: r.versao },
          status: StatusDocumento.EM_ELABORACAO,
          origem: OrigemDocumento.INTERNO,
          versao: (anterior?.versao ?? 0) + 1,
          versao_anterior_id: (anterior?.id ?? null) as any,
          versao_atual: true,
          obrigatorio: anterior?.obrigatorio ?? false,
          criado_por_id: (autor.id ?? undefined) as any,
          criado_por_nome: (autor.nome ?? undefined) as any,
        }),
      );
      await m.getRepository(ReservaOrcamentariaLinha).delete({ reserva_id: r.id });
      for (const l of linhas) {
        await m.getRepository(ReservaOrcamentariaLinha).save(
          m.getRepository(ReservaOrcamentariaLinha).create({ reserva_id: r.id, exercicio: l.exercicio, valor: l.valor.toFixed(2), situacao: l.situacao, numero_reserva: l.numero_reserva ?? null }),
        );
      }
      await m.getRepository(ReservaOrcamentaria).update(r.id, {
        status: 'EMITIDA',
        exercicio_base: exercicio,
        documento_id: novo.id,
        emitida_em: new Date(),
        emitida_por_id: autor.id,
        emitida_por_nome: autor.nome,
        motivo_devolucao: null,
      });
      return novo;
    });
    try {
      await this.gerador.gerarPdf(doc.id, { usuario_id: autor.id ?? undefined, usuario_nome: autor.nome ?? undefined });
    } catch (e: any) {
      this.logger.warn(`PDF da informação orçamentária não gerado: ${e?.message ?? e}`);
    }
    await this.auditLog
      .log({
        licitacao_id: licitacaoId,
        documento_id: doc.id,
        acao: AcaoLogFaseInterna.DOCUMENTO_CRIADO,
        descricao: `Informação orçamentária emitida (reserva v${r.versao}, ${BRL(totalDasLinhas(linhas))}) por ${autor.nome ?? 'usuário'}`,
        dados_depois: { reserva_id: r.id, linhas },
        contexto: { usuario_id: autor.id ?? undefined, usuario_nome: autor.nome ?? undefined },
      })
      .catch(() => undefined);
    await this.tarefas.concluirTarefaPorChave(licitacaoId, CHAVE_TAREFA_RENOVACAO, autor);
    return this.obter(licitacaoId);
  }

  /**
   * Nova versão da reserva emitida (a atual vira SUBSTITUIDA, nunca some):
   *  - RETIFICAR: mesma distribuição, para corrigir a classificação;
   *  - RENOVAR (virada do exercício): o valor do exercício encerrado passa para
   *    o novo, tudo volta a PREVISÃO, a dotação do exercício anterior não é
   *    aproveitada (a Contabilidade escolhe a da nova LOA) e nasce a tarefa da
   *    Contabilidade "Renovar a informação orçamentária".
   */
  async novaVersao(licitacaoId: string, modo: 'RETIFICAR' | 'RENOVAR', body: any, autor: Autor) {
    const lic = await this.licitacao(licitacaoId);
    const atual = await this.reservaAtual(licitacaoId);
    if (!atual) throw new BadRequestException('Não há reserva para versionar.');
    if (atual.status !== 'EMITIDA') throw new ConflictException('Só a informação orçamentária emitida gera versão nova (a atual ainda é rascunho).');
    const motivo = texto(body?.motivo, 2000);
    let linhas = this.linhasDe(atual);
    let novoExercicio: number | null = null;
    if (modo === 'RENOVAR') {
      const base = atual.exercicio_base ?? this.exercicioCorrente();
      novoExercicio = body?.exercicio !== undefined && body?.exercicio !== null && body?.exercicio !== '' ? Number(body.exercicio) : Math.max(this.exercicioCorrente(), base + 1);
      if (!Number.isInteger(novoExercicio) || novoExercicio <= base || novoExercicio > base + 5) {
        throw new BadRequestException(`O novo exercício precisa ser posterior a ${base}.`);
      }
      linhas = planoRenovacao(linhas, novoExercicio);
    } else if (motivo.length < 5) {
      throw new BadRequestException('Informe o motivo da retificação.');
    }
    // Renovação: procura a dotação equivalente (mesma classificação) do novo exercício e a LDO dele
    let dotacaoNova: DotacaoOrcamentaria | null = null;
    let ldoNova: LeiOrcamentaria | null = null;
    if (modo === 'RENOVAR' && novoExercicio) {
      dotacaoNova = await this.dotacaoRepo.findOne({
        where: {
          orgao_id: lic.orgao_id,
          exercicio: novoExercicio,
          ativo: true,
          projeto_atividade: atual.projeto_atividade ?? '',
          elemento_despesa: atual.elemento_despesa ?? '',
          fonte_recurso: atual.fonte_recurso ?? '',
        },
      });
      ldoNova = await this.leiRepo.findOne({ where: { orgao_id: lic.orgao_id, tipo: 'LDO', exercicio: novoExercicio, ativo: true } });
    }
    const nova = await this.ds.transaction(async (m) => {
      await m.getRepository(ReservaOrcamentaria).update(atual.id, { versao_atual: false, status: 'SUBSTITUIDA' });
      const repo = m.getRepository(ReservaOrcamentaria);
      const n = await repo.save(
        repo.create({
          orgao_id: atual.orgao_id,
          licitacao_id: licitacaoId,
          versao: atual.versao + 1,
          versao_atual: true,
          substitui_reserva_id: atual.id,
          status: 'RASCUNHO',
          exercicio_base: null,
          ...(modo === 'RENOVAR'
            ? {
                dotacao_id: dotacaoNova?.id ?? null,
                unidade_orcamentaria: dotacaoNova?.unidade_orcamentaria ?? null,
                programa: dotacaoNova?.programa ?? null,
                projeto_atividade: dotacaoNova?.projeto_atividade ?? null,
                elemento_despesa: dotacaoNova?.elemento_despesa ?? null,
                fonte_recurso: dotacaoNova?.fonte_recurso ?? null,
                lei_ldo_id: ldoNova?.id ?? null,
                lei_loa_id: null,
                lei_ppa_id: atual.lei_ppa_id,
                declaracao_adequacao: false,
                declaracao_lrf: false,
                motivo_renovacao: motivo || `Renovação da dotação para o exercício ${novoExercicio} (virada do exercício).`,
              }
            : {
                dotacao_id: atual.dotacao_id,
                unidade_orcamentaria: atual.unidade_orcamentaria,
                programa: atual.programa,
                projeto_atividade: atual.projeto_atividade,
                elemento_despesa: atual.elemento_despesa,
                fonte_recurso: atual.fonte_recurso,
                lei_ldo_id: atual.lei_ldo_id,
                lei_loa_id: atual.lei_loa_id,
                lei_ppa_id: atual.lei_ppa_id,
                declaracao_adequacao: atual.declaracao_adequacao,
                declaracao_lrf: atual.declaracao_lrf,
                motivo_renovacao: `Retificação: ${motivo}`,
              }),
          observacao: atual.observacao,
          criado_por_id: autor.id,
          criado_por_nome: autor.nome,
        } as Partial<ReservaOrcamentaria>),
      );
      for (const l of linhas) {
        await m.getRepository(ReservaOrcamentariaLinha).save(
          m.getRepository(ReservaOrcamentariaLinha).create({ reserva_id: n.id, exercicio: l.exercicio, valor: l.valor.toFixed(2), situacao: l.situacao, numero_reserva: l.numero_reserva ?? null }),
        );
      }
      return n;
    });
    await this.auditLog
      .log({
        licitacao_id: licitacaoId,
        documento_id: atual.documento_id ?? undefined,
        acao: AcaoLogFaseInterna.DOCUMENTO_VERSIONADO,
        descricao:
          modo === 'RENOVAR'
            ? `Dotação renovada para ${novoExercicio}: nova versão (v${nova.versao}) da informação orçamentária por ${autor.nome ?? 'usuário'}`
            : `Informação orçamentária retificada: nova versão (v${nova.versao}) por ${autor.nome ?? 'usuário'}`,
        dados_antes: { reserva_id: atual.id, versao: atual.versao, linhas: this.linhasDe(atual) },
        dados_depois: { reserva_id: nova.id, versao: nova.versao, linhas, motivo },
        contexto: { usuario_id: autor.id ?? undefined, usuario_nome: autor.nome ?? undefined },
      })
      .catch(() => undefined);
    let tarefaId: string | null = null;
    if (modo === 'RENOVAR') {
      tarefaId = await this.tarefas.criarTarefaDoSistema(licitacaoId, {
        chave: CHAVE_TAREFA_RENOVACAO,
        passo: PassoFaseInterna.RESERVA,
        titulo: `Renovar a informação orçamentária (exercício ${novoExercicio})`,
        descricao: `Processo ${lic.numero_processo}: a informação orçamentária foi emitida para ${atual.exercicio_base}. Escolha a dotação da LOA de ${novoExercicio}, confira a distribuição por exercício e emita a nova informação (ou anexe a feita fora).`,
        tipo_peca: TipoDocumentoFaseInterna.DOTACAO_ORCAMENTARIA,
        documento_id: atual.documento_id,
      });
    }
    return { ...(await this.obter(licitacaoId)), tarefa_criada_id: tarefaId };
  }

  /** "Devolver sem saldo": a Contabilidade registra que não há dotação suficiente. */
  async devolver(licitacaoId: string, body: any, autor: Autor) {
    const r = await this.reservaAtual(licitacaoId);
    if (!r) throw new BadRequestException('Não há reserva em preparação.');
    if (r.status !== 'RASCUNHO') throw new ConflictException('Só a reserva em rascunho pode ser devolvida.');
    const motivo = texto(body?.motivo, 2000);
    if (motivo.length < 5) throw new BadRequestException('Informe o motivo da devolução.');
    await this.reservaRepo.update(r.id, { status: 'DEVOLVIDA', motivo_devolucao: motivo });
    await this.auditLog
      .log({
        licitacao_id: licitacaoId,
        acao: AcaoLogFaseInterna.DOCUMENTO_EDITADO,
        descricao: `Pedido de reserva devolvido sem saldo por ${autor.nome ?? 'usuário'}: ${motivo}`,
        dados_depois: { reserva_id: r.id, motivo },
        contexto: { usuario_id: autor.id ?? undefined, usuario_nome: autor.nome ?? undefined },
      })
      .catch(() => undefined);
    return this.obter(licitacaoId);
  }

  /**
   * Anexo da informação orçamentária feita fora (peça DO) enquanto há
   * renovação pendente: conclui a tarefa de renovação e marca a versão em
   * rascunho como emitida pelo anexo.
   */
  async aoAnexarInformacaoOrcamentaria(licitacaoId: string, documentoId: string, autor: Autor) {
    const r = await this.reservaAtual(licitacaoId);
    if (r && r.status !== 'EMITIDA' && r.versao > 1) {
      await this.reservaRepo.update(r.id, {
        status: 'EMITIDA',
        exercicio_base: this.exercicioCorrente(),
        documento_id: documentoId,
        emitida_em: new Date(),
        emitida_por_id: autor.id,
        emitida_por_nome: autor.nome,
      });
    }
    await this.tarefas.concluirTarefaPorChave(licitacaoId, CHAVE_TAREFA_RENOVACAO, autor);
  }

  /** Há renovação de dotação pendente (tarefa aberta)? — permite o anexo da DO depois da divulgação. */
  async renovacaoPendente(licitacaoId: string): Promise<boolean> {
    const [t] = await this.ds.query(`SELECT 1 FROM tarefas WHERE licitacao_id::text = $1 AND chave = $2 AND status = 'ABERTA'`, [licitacaoId, CHAVE_TAREFA_RENOVACAO]);
    return !!t;
  }

  /** Resumo para o TR (alínea j) e para a derivação: "UO · projeto · elemento · fonte; 2025: R$ …". */
  async resumoParaTr(licitacaoId: string): Promise<{ status: string; texto: string; linhas: LinhaReserva[] } | null> {
    const r = await this.reservaAtual(licitacaoId);
    if (!r || !r.projeto_atividade) return null;
    const linhas = this.linhasDe(r);
    const classif = [r.unidade_orcamentaria, r.programa ? `Programa ${r.programa}` : null, r.projeto_atividade, r.elemento_despesa, `Fonte ${r.fonte_recurso}`].filter(Boolean).join(' · ');
    const dist = linhas.map((l) => `${l.exercicio}: ${BRL(l.valor)} (${l.situacao === 'RESERVADO' ? 'reservado' : 'previsão'})`).join('; ');
    return { status: r.status, texto: `${classif}${dist ? ` — ${dist}` : ''}`, linhas };
  }
}
