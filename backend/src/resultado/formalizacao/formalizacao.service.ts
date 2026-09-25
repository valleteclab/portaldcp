import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import type { Ator } from '../../auth/acesso/ator';
import { RankingService } from '../../julgamento/ranking.service';
import { PortalAssinaturasService } from '../../portal-assinaturas/portal-assinaturas.service';
import { diretorioDeGravacao, resolverArquivoDeUrl } from '../../common/arquivos/arquivos';
import { STATUS_ITEM_COM_RESULTADO, arred } from '../regras-resultado';
import { AutoridadeOrgao, FormalizacaoResultado } from './formalizacao.entities';
import {
  AutoridadeDoAto,
  ModoFormalizacao,
  ROTULO_MODO,
  StatusFormalizacao,
  TipoFormalizacao,
  autoridadeAssinaPorLinkExterno,
  modoDoOrgao,
  modoValido,
  motivoCadastroAutoridadeInvalido,
  podeConfigurar,
  resolverAutoridade,
} from './regras-formalizacao';
import { DadosTermoResultado, LinhaTermo, POSICAO_ASSINATURA_AUTORIDADE, gerarTermoResultadoPdf } from './termo-resultado-pdf';

/** Pasta SENSÍVEL dos termos (dono: órgão da licitação — AcessoArquivosService). */
export const PASTA_TERMOS = 'resultados';

/** Plano de adjudicação (prévia) — mesmo formato de ResultadoService.planoAdjudicacao. */
export interface PlanoParaTermo {
  unidades: Array<{ unidadeId: string; fornecedorId: string; valores: Array<{ itemId: string; valorUnitario: number; valorTotal: number; quantidade: number }> }>;
}

/**
 * FORMALIZAÇÃO DO RESULTADO — cadastro das autoridades e do modo do órgão,
 * termo em PDF, arquivos (pasta sensível `resultados/<licitacao>/`) e o
 * documento no assinador. A ORQUESTRAÇÃO do ato (efeito imediato, pendente de
 * assinatura, termo externo) fica no ResultadoService, que usa este serviço.
 */
@Injectable()
export class FormalizacaoService {
  private readonly logger = new Logger(FormalizacaoService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly ranking: RankingService,
    private readonly assinaturas: PortalAssinaturasService,
  ) {}

  // ==========================================================================
  // CONFIGURAÇÃO (modo + autoridades)
  // ==========================================================================

  async modoDoOrgao(orgaoId: string | null | undefined, m: EntityManager = this.ds.manager): Promise<ModoFormalizacao> {
    if (!orgaoId) return modoDoOrgao(null);
    const [o] = await m.query(`SELECT modo_formalizacao_resultado AS modo FROM orgaos WHERE id::text = $1`, [orgaoId]);
    return modoDoOrgao(o?.modo);
  }

  async listarAutoridades(orgaoId: string, incluirInativas = false): Promise<AutoridadeOrgao[]> {
    const where: any = { orgao_id: orgaoId };
    if (!incluirInativas) where.ativo = true;
    return this.ds.getRepository(AutoridadeOrgao).find({ where, order: { padrao: 'DESC', nome: 'ASC' } });
  }

  async configuracao(orgaoId: string) {
    const modo = await this.modoDoOrgao(orgaoId);
    return {
      modo,
      modos: Object.values(ModoFormalizacao).map((v) => ({ valor: v, rotulo: ROTULO_MODO[v] })),
      autoridades: await this.listarAutoridades(orgaoId),
    };
  }

  private assertConfigurador(ator: Ator) {
    if (!podeConfigurar(ator)) {
      throw new ForbiddenException('A configuração da formalização (modo e autoridades) é feita pela conta do órgão ou por um ADMIN do órgão.');
    }
  }

  async definirModo(orgaoId: string, modo: unknown, ator: Ator) {
    this.assertConfigurador(ator);
    if (!modoValido(modo)) throw new BadRequestException(`Modo inválido — use ${Object.values(ModoFormalizacao).join(', ')}.`);
    if (modo === ModoFormalizacao.ASSINATURA_ELETRONICA) {
      const [padrao] = (await this.listarAutoridades(orgaoId)).filter((a) => a.padrao);
      if (padrao && !padrao.email) {
        throw new BadRequestException(`Assinatura eletrônica: informe o e-mail da autoridade padrão (${padrao.nome}) antes de ativar o modo.`);
      }
    }
    await this.ds.query(`UPDATE orgaos SET modo_formalizacao_resultado = $2 WHERE id::text = $1`, [orgaoId, modo]);
    return this.configuracao(orgaoId);
  }

  async salvarAutoridade(orgaoId: string, dados: Partial<AutoridadeOrgao>, ator: Ator, id?: string) {
    this.assertConfigurador(ator);
    const repo = this.ds.getRepository(AutoridadeOrgao);
    let alvo: AutoridadeOrgao | null = null;
    if (id) {
      alvo = await repo.findOne({ where: { id, orgao_id: orgaoId } });
      if (!alvo) throw new NotFoundException('Autoridade não encontrada');
    }
    const merged = { ...(alvo ?? {}), ...this.camposEditaveis(dados) } as Partial<AutoridadeOrgao>;
    const invalido = motivoCadastroAutoridadeInvalido(merged as any);
    if (invalido) throw new BadRequestException(invalido);
    return this.ds.transaction(async (m) => {
      const r = m.getRepository(AutoridadeOrgao);
      const existentes = await r.count({ where: { orgao_id: orgaoId, ativo: true } });
      const querPadrao = dados.padrao === true || (!alvo && existentes === 0);
      const salvo = await r.save(
        r.create({
          ...(alvo ?? {}),
          ...merged,
          orgao_id: orgaoId,
          ativo: true,
          padrao: querPadrao ? true : alvo ? alvo.padrao && dados.padrao !== false : false,
        }),
      );
      if (querPadrao) {
        await m.query(`UPDATE autoridades_orgao SET padrao = false, updated_at = now() WHERE orgao_id = $1 AND id <> $2 AND padrao = true`, [orgaoId, salvo.id]);
      }
      return salvo;
    });
  }

  /** Desativa (o retrato já gravado nos atos permanece); promove outra a padrão se preciso. */
  async removerAutoridade(orgaoId: string, id: string, ator: Ator) {
    this.assertConfigurador(ator);
    const repo = this.ds.getRepository(AutoridadeOrgao);
    const a = await repo.findOne({ where: { id, orgao_id: orgaoId } });
    if (!a) throw new NotFoundException('Autoridade não encontrada');
    await repo.update(id, { ativo: false, padrao: false });
    if (a.padrao) {
      const [prox] = await this.listarAutoridades(orgaoId);
      if (prox) await repo.update(prox.id, { padrao: true });
    }
    return { sucesso: true };
  }

  private camposEditaveis(d: Partial<AutoridadeOrgao>): Partial<AutoridadeOrgao> {
    const s = (v: unknown, n: number) => (v == null ? null : String(v).trim().slice(0, n) || null);
    const out: Partial<AutoridadeOrgao> = {};
    if (d.nome !== undefined) out.nome = String(d.nome ?? '').trim().slice(0, 200);
    if (d.cargo !== undefined) out.cargo = String(d.cargo ?? '').trim().slice(0, 200);
    if (d.cpf !== undefined) out.cpf = d.cpf ? String(d.cpf).replace(/\D/g, '').slice(0, 14) || null : null;
    if (d.email !== undefined) out.email = s(d.email, 200)?.toLowerCase() ?? null;
    if (d.ato_delegacao_numero !== undefined) out.ato_delegacao_numero = s(d.ato_delegacao_numero, 120);
    if (d.ato_delegacao_data !== undefined) out.ato_delegacao_data = d.ato_delegacao_data ? String(d.ato_delegacao_data).slice(0, 10) : null;
    return out;
  }

  /** Autoridade do ato (escolhida, padrão ou responsável do órgão). 400 se a escolhida não é do órgão. */
  async autoridadeDoAto(orgaoId: string, escolhidaId?: string | null, m: EntityManager = this.ds.manager): Promise<AutoridadeDoAto> {
    const cadastro = await m.getRepository(AutoridadeOrgao).find({ where: { orgao_id: orgaoId, ativo: true } });
    const [orgao] = await m.query(`SELECT nome, responsavel_nome, responsavel_cargo, responsavel_cpf FROM orgaos WHERE id::text = $1`, [orgaoId]);
    try {
      return resolverAutoridade(cadastro as any, escolhidaId, orgao ?? null);
    } catch (e: any) {
      throw new BadRequestException(e?.message ?? String(e));
    }
  }

  /** Nome de quem opera (usuário do token, conta do órgão ou administrador). */
  async nomeOperador(ator: Ator, m: EntityManager = this.ds.manager): Promise<string> {
    if (ator.tipo === 'USUARIO') {
      const [u] = await m.query(`SELECT nome, role::text AS role FROM usuarios WHERE id::text = $1`, [ator.usuarioId ?? ator.id]);
      const papel = String(u?.role ?? ator.role ?? '').toUpperCase();
      const rot = papel === 'PREGOEIRO' ? 'agente de contratação/pregoeiro' : papel === 'ADMIN' ? 'administrador do órgão' : papel.toLowerCase();
      return `${u?.nome || 'Usuário do órgão'}${rot ? ` (${rot})` : ''}`.slice(0, 200);
    }
    if (ator.tipo === 'ORGAO' && ator.orgaoId) {
      const [o] = await m.query(`SELECT nome FROM orgaos WHERE id::text = $1`, [ator.orgaoId]);
      return `Conta do órgão ${o?.nome ?? ''}`.trim().slice(0, 200);
    }
    return 'Administrador da plataforma';
  }

  // ==========================================================================
  // TERMO (PDF)
  // ==========================================================================

  /**
   * Linhas do quadro do termo: com `plano` (ato pendente — prévia da
   * adjudicação), os valores do plano; sem, os itens gravados com vencedor
   * (ADJUDICADO/HOMOLOGADO).
   */
  async linhasDoTermo(licitacaoId: string, plano?: PlanoParaTermo | null, m: EntityManager = this.ds.manager): Promise<{ linhas: LinhaTermo[]; total: number }> {
    const unidades = await this.ranking.unidades(licitacaoId, m);
    const itensDb: any[] = await m.query(
      `SELECT id::text AS id, status::text AS status, fornecedor_vencedor_id, valor_unitario_homologado, valor_total_homologado
         FROM itens_licitacao WHERE licitacao_id = $1`,
      [licitacaoId],
    );
    const porItem = new Map(itensDb.map((i) => [String(i.id), i]));
    const idsForn = new Set<string>();
    itensDb.forEach((i) => i.fornecedor_vencedor_id && idsForn.add(String(i.fornecedor_vencedor_id)));
    plano?.unidades.forEach((u) => idsForn.add(String(u.fornecedorId)));
    const forn: any[] = idsForn.size
      ? await m.query(`SELECT id::text AS id, razao_social, cpf_cnpj FROM fornecedores WHERE id::text = ANY($1)`, [[...idsForn]])
      : [];
    const cad = new Map(forn.map((f) => [String(f.id), f]));
    const linhas: LinhaTermo[] = [];
    for (const u of unidades) {
      const rotulo = `${u.tipo === 'LOTE' ? 'Lote' : 'Item'} ${u.numero}`;
      const doPlano = plano?.unidades.find((e) => e.unidadeId === u.id);
      for (const i of u.itens) {
        let fornecedorId: string | null = null;
        let unit = 0;
        let total = 0;
        if (plano) {
          const v = doPlano?.valores.find((x) => x.itemId === i.id);
          if (!doPlano || !v) continue;
          fornecedorId = doPlano.fornecedorId;
          unit = v.valorUnitario;
          total = v.valorTotal;
        } else {
          const db = porItem.get(i.id);
          if (!db?.fornecedor_vencedor_id || !STATUS_ITEM_COM_RESULTADO.includes(String(db.status))) continue;
          fornecedorId = String(db.fornecedor_vencedor_id);
          unit = Number(db.valor_unitario_homologado);
          total = Number(db.valor_total_homologado);
        }
        const f = cad.get(String(fornecedorId));
        linhas.push({
          unidade: rotulo,
          numeroItem: i.numero,
          descricao: i.descricao,
          quantidade: i.quantidade,
          unidadeMedida: i.unidadeMedida,
          fornecedor: f?.razao_social ?? String(fornecedorId),
          cnpj: f?.cpf_cnpj ?? '',
          valorUnitario: unit,
          valorTotal: total,
        });
      }
    }
    return { linhas, total: arred(linhas.reduce((s, l) => s + Number(l.valorTotal || 0), 0), 2) };
  }

  /** Dados completos do termo de uma formalização (ou da prévia). */
  async dadosDoTermo(
    licitacaoId: string,
    f: Pick<FormalizacaoResultado, 'tipo' | 'modo' | 'operador_nome' | 'created_at' | 'efetivado_em' | 'status'> & { autoridade: AutoridadeDoAto },
    opts: { plano?: PlanoParaTermo | null; previa?: boolean } = {},
    m: EntityManager = this.ds.manager,
  ): Promise<DadosTermoResultado> {
    const [lic] = await m.query(
      `SELECT orgao_id, numero_processo, numero_edital, objeto, modalidade::text AS modalidade, srp, data_adjudicacao FROM licitacoes WHERE id = $1`,
      [licitacaoId],
    );
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    const [orgao] = await m.query(`SELECT nome, cnpj, cidade, uf FROM orgaos WHERE id::text = $1`, [lic.orgao_id]);
    const { linhas, total } = await this.linhasDoTermo(licitacaoId, opts.plano ?? null, m);
    const pendente = f.status === StatusFormalizacao.PENDENTE_ASSINATURA || f.modo === ModoFormalizacao.ASSINATURA_ELETRONICA;
    return {
      tipo: f.tipo as TipoFormalizacao,
      orgao: orgao ?? {},
      licitacao: { ...lic, srp: !!lic.srp },
      linhas,
      total,
      autoridade: f.autoridade,
      dataAto: pendente && !f.efetivado_em ? null : (f.efetivado_em ?? new Date()),
      dataAdjudicacao: lic.data_adjudicacao ?? null,
      operador: { nome: f.operador_nome, em: f.created_at ?? new Date() },
      modo: f.modo,
      previa: opts.previa,
    };
  }

  autoridadeDaFormalizacao(f: FormalizacaoResultado): AutoridadeDoAto {
    return {
      id: f.autoridade_id,
      nome: f.autoridade_nome,
      cargo: f.autoridade_cargo,
      cpf: f.autoridade_cpf,
      email: f.autoridade_email,
      ato_delegacao_numero: f.autoridade_ato_delegacao_numero,
      ato_delegacao_data: f.autoridade_ato_delegacao_data ? String(f.autoridade_ato_delegacao_data).slice(0, 10) : null,
    };
  }

  gerarPdf(dados: DadosTermoResultado) {
    return gerarTermoResultadoPdf(dados);
  }

  /** Grava o PDF gerado na pasta sensível e registra na formalização. */
  async gravarTermo(f: FormalizacaoResultado, buffer: Buffer): Promise<string> {
    const nome = `termo-${f.tipo === TipoFormalizacao.ADJUDICACAO ? 'adjudicacao' : 'adjudicacao-homologacao'}-${f.id}.pdf`;
    const rel = this.gravar(f.licitacao_id, nome, buffer);
    await this.ds.query(`UPDATE formalizacoes_resultado SET arquivo_termo = $2, updated_at = now() WHERE id = $1`, [f.id, rel]);
    f.arquivo_termo = rel;
    return rel;
  }

  /** Termo externo (assinado/publicação no DO) enviado pelo operador. */
  gravarArquivoExterno(licitacaoId: string, formalizacaoId: string, arquivo: { buffer: Buffer; originalname?: string }): string {
    const ext = (String(arquivo.originalname ?? '').toLowerCase().split('.').pop() || 'pdf').replace(/[^a-z0-9]/g, '').slice(0, 5) || 'pdf';
    return this.gravar(licitacaoId, `termo-externo-${formalizacaoId}.${ext}`, arquivo.buffer);
  }

  private gravar(licitacaoId: string, nome: string, buffer: Buffer): string {
    const dir = path.join(diretorioDeGravacao(PASTA_TERMOS), licitacaoId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, nome), buffer);
    return `${PASTA_TERMOS}/${licitacaoId}/${nome}`;
  }

  /** Caminho físico de um arquivo da formalização (privado → legado). */
  caminhoFisico(rel: string | null | undefined): string | null {
    return rel ? resolverArquivoDeUrl(rel) : null;
  }

  // ==========================================================================
  // ASSINADOR
  // ==========================================================================

  /**
   * Cria o documento no assinador com a AUTORIDADE como signatária (e-mail do
   * cadastro). Com CPF → link externo (CPF + código por e-mail); sem CPF →
   * portal interno de assinaturas do órgão.
   */
  async criarDocumentoAssinatura(f: FormalizacaoResultado, rel: string, ultimaPagina: number, criadoPorId: string, lic: { numero_processo?: string; objeto?: string }) {
    const a = this.autoridadeDaFormalizacao(f);
    const externo = autoridadeAssinaPorLinkExterno(a);
    const titulo = `${f.tipo === TipoFormalizacao.ADJUDICACAO ? 'Termo de Adjudicação' : 'Termo de Adjudicação e Homologação'} — processo ${lic.numero_processo ?? ''}`.slice(0, 250);
    const doc = await this.assinaturas.criarDocumento(
      f.orgao_id,
      criadoPorId,
      {
        titulo,
        descricao:
          `${titulo} (${String(lic.objeto ?? '').slice(0, 120)}). Ato da autoridade competente — Lei nº 14.133/2021, art. 71, IV. ` +
          `Registrado no sistema por ${f.operador_nome}; o ato só produz efeito com esta assinatura.`,
        signatarios: [
          {
            nome: a.nome,
            cpf_cnpj: a.cpf ?? undefined,
            email: a.email ?? undefined,
            is_orgao_user: !externo,
            pagina_assinatura: ultimaPagina,
            ...POSICAO_ASSINATURA_AUTORIDADE,
          },
        ],
      } as any,
      rel,
    );
    await this.assinaturas.dispararNotificacoesAssinatura(doc.id).catch((e: any) =>
      this.logger.warn(`Notificação de assinatura do termo (${f.tipo}) não enviada: ${e?.message ?? e}`),
    );
    return doc;
  }

  /** Situação do documento de assinatura (painel). */
  async situacaoAssinatura(f: FormalizacaoResultado) {
    if (!f.documento_assinatura_id) return null;
    const doc = await this.assinaturas.obterDocumento(f.documento_assinatura_id, f.orgao_id).catch(() => null);
    if (!doc) return null;
    return {
      documento_id: doc.id,
      status: doc.status,
      signatarios: (doc.signatarios || []).map((s: any) => ({
        nome: s.nome,
        status: s.status,
        interno: !!s.is_orgao_user,
        data_assinatura: s.data_assinatura ?? null,
      })),
    };
  }

  async cancelarDocumento(f: FormalizacaoResultado) {
    if (!f.documento_assinatura_id) return;
    await this.assinaturas.cancelarDocumento(f.documento_assinatura_id, f.orgao_id).catch((e: any) =>
      this.logger.warn(`Documento de assinatura ${f.documento_assinatura_id} não cancelado: ${e?.message ?? e}`),
    );
  }

  registrarAoConcluir(ouvinte: (documentoId: string, arquivoAssinadoUrl?: string) => Promise<void>) {
    this.assinaturas.registrarAoConcluir(ouvinte);
  }
}
