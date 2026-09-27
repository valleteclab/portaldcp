import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ehFaseInterna } from '../../licitacoes/transicoes/fases';
import { fundamentoEfetivo, textoDoFundamento } from '../../licitacoes/fundamento-legal';
import { DocumentoFaseInterna, OrigemDocumento, StatusDocumento, TipoDocumentoFaseInterna } from '../entities/documento-fase-interna.entity';
import { AcaoLogFaseInterna } from '../entities/log-fase-interna.entity';
import { AuditLogService } from '../audit-log.service';
import { FaseInternaService } from '../fase-interna.service';
import { GeradorDocumentoService } from '../gerador-documento.service';
import { ModeloDocumentoService } from '../modelo-documento.service';
import { TITULO_DOCUMENTO } from '../documentos-obrigatorios';
import { OrcamentoService } from '../orcamento/orcamento.service';
import { avisarPecaAlterada } from '../tarefas/aviso-tarefas';
import { TIPOS_REGERAVEIS, decidirRegeracao, hashSecoes, motivoSigiloInvalido, pecaEditadaAMao, referenciasDivergentes, secoesDaPeca } from './minutas-regras';

export type Autor = { id: string | null; nome: string | null };

/** Peças da etapa 7 do agente (relatório, minuta do aviso e minuta do contrato). */
export const TIPOS_MINUTAS = ['RAG', 'ME', 'MC'] as const;
/** Peças que, geradas aqui, só valem ASSINADAS (o texto ainda não é o ato). */
const EXIGEM_ASSINATURA = new Set<string>(['AA', 'PJ', 'PJE', 'MCI']);

const ROTULO_MOTIVO: Record<string, string> = {
  EDITADA: 'editada à mão depois de gerada',
  ASSINADA: 'já assinada',
  EM_ASSINATURA: 'em assinatura',
  APROVADA: 'já aprovada',
};

/**
 * MINUTAS E RELATÓRIO DO AGENTE (etapa 7, parte do agente — Entrega 3B) e o
 * GERADOR POR MODELO comum às peças da etapa 6 e 7 (despacho de autorização,
 * relatório, minuta do aviso, minuta do contrato).
 *
 * Tudo lido do processo (ModeloDocumentoService.montarContextoVariaveis):
 * número do PA e da dispensa, fundamento legal, teto, sigilo, dotação e leis,
 * portaria de designação. A peça gerada guarda a impressão do texto
 * (`_gerado.hash`): se o processo muda (fundamento, número, sigilo), a gerada e
 * intocada é REGERADA; a editada à mão/assinada ganha o aviso "desatualizada".
 */
@Injectable()
export class MinutasTelaService {
  private readonly logger = new Logger(MinutasTelaService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(DocumentoFaseInterna) private readonly docRepo: Repository<DocumentoFaseInterna>,
    private readonly faseInterna: FaseInternaService,
    private readonly modelos: ModeloDocumentoService,
    private readonly gerador: GeradorDocumentoService,
    private readonly orcamento: OrcamentoService,
    private readonly auditLog: AuditLogService,
  ) {}

  async licitacao(licitacaoId: string) {
    const [lic] = await this.ds.query(
      `SELECT id::text AS id, orgao_id::text AS orgao_id, numero_processo, numero_edital, objeto, modalidade::text AS modalidade,
              tipo_contratacao::text AS tipo_contratacao, fase::text AS fase, situacao::text AS situacao, fundamento_legal,
              valor_total_estimado, sigilo_orcamento, justificativa_sigilo, pregoeiro_id::text AS pregoeiro_id,
              COALESCE(ano, EXTRACT(YEAR FROM created_at))::int AS exercicio
         FROM licitacoes WHERE id::text = $1`,
      [licitacaoId],
    );
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    return lic;
  }

  docAtual(licitacaoId: string, tipo: string): Promise<DocumentoFaseInterna | null> {
    return this.docRepo.findOne({ where: { licitacao_id: licitacaoId, tipo: tipo as TipoDocumentoFaseInterna, versao_atual: true } });
  }

  /** Resumo da peça para as telas (inclui "gerada pelo modelo", "editada" e "desatualizada"). */
  resumoPeca(doc: DocumentoFaseInterna | null) {
    if (!doc) return null;
    const d = doc.dados_estruturados || {};
    return {
      documento_id: doc.id,
      tipo: doc.tipo,
      titulo: doc.titulo,
      versao: doc.versao,
      status: doc.status,
      origem: doc.origem,
      anexada: doc.origem !== OrigemDocumento.INTERNO,
      numero_peca: doc.numero_peca ?? null,
      data_documento: doc.data_documento ?? null,
      folha_inicial: doc.folha_inicial ?? null,
      folha_final: doc.folha_final ?? null,
      tem_arquivo: !!(doc.caminho_arquivo || doc.arquivo_pdf_path),
      nao_se_aplica: !!d.nao_se_aplica,
      gerada_pelo_modelo: !!d._gerado?.hash,
      gerada_em: d._gerado?.em ?? null,
      editada: pecaEditadaAMao(doc),
      desatualizada: d._desatualizada ?? null,
      exige_assinatura: !!d._exige_assinatura,
      signatarios_exigidos: doc.signatarios_exigidos ?? null,
    };
  }

  // ==========================================================================
  // GERAR PELO MODELO (comum às etapas 6 e 7)
  // ==========================================================================

  /**
   * Gera a peça pelo modelo do órgão (ou do sistema) com as variáveis do
   * processo. Versão em elaboração feita no sistema é reescrita; peça
   * assinada, anexada, em assinatura, aprovada ou devolvida ganha VERSÃO NOVA
   * (a anterior fica no histórico). Gera o PDF.
   */
  async gerarPorModelo(
    licitacaoId: string,
    tipoParam: string,
    autor: Autor,
    opcoes: { motivo?: string; extras?: Record<string, unknown> } = {},
  ): Promise<DocumentoFaseInterna> {
    const tipo = String(tipoParam || '').toUpperCase() as TipoDocumentoFaseInterna;
    const lic = await this.licitacao(licitacaoId);
    const modelo = await this.modelos.resolverModelo(lic.orgao_id, tipo);
    if (!modelo) throw new BadRequestException(`Não há modelo para ${TITULO_DOCUMENTO[tipo] ?? tipo}.`);
    const contexto = await this.modelos.montarContextoVariaveis(licitacaoId);
    const secoes: Record<string, string> = {};
    for (const s of modelo.secoes || []) secoes[s.id] = s.texto_padrao ? this.modelos.substituirVariaveis(s.texto_padrao, contexto) : '';
    const fundamento = fundamentoEfetivo(lic);
    const meta = {
      hash: hashSecoes(secoes),
      em: new Date().toISOString(),
      por_id: autor.id,
      por_nome: autor.nome,
      motivo: opcoes.motivo ?? 'GERADA',
      modelo_id: modelo.id,
      fundamento,
      numero_processo: lic.numero_processo,
      sigilo: lic.sigilo_orcamento,
    };
    return this.gravarPecaGerada(licitacaoId, tipo, secoes, modelo.nome || TITULO_DOCUMENTO[tipo] || tipo, autor, {
      extras: { ...(opcoes.extras ?? {}), _gerado: meta },
      log: `${TITULO_DOCUMENTO[tipo] ?? tipo} gerada pelo modelo${opcoes.motivo && opcoes.motivo !== 'GERADA' ? ` (${opcoes.motivo})` : ''}`,
      dadosLog: { fundamento, numero_processo: lic.numero_processo, modelo_id: modelo.id },
    });
  }

  /**
   * Grava o texto gerado como a peça do tipo: a versão em elaboração feita no
   * sistema é reescrita (guarda as chaves internas `_…`); peça assinada,
   * anexada, em assinatura, aprovada ou devolvida ganha VERSÃO NOVA (a
   * anterior fica no histórico). Gera o PDF. `_exige_assinatura` nas peças que
   * só valem assinadas (despacho, parecer, controle interno).
   */
  async gravarPecaGerada(
    licitacaoId: string,
    tipo: TipoDocumentoFaseInterna,
    secoes: Record<string, string>,
    titulo: string,
    autor: Autor,
    opcoes: { extras?: Record<string, unknown>; log?: string; dadosLog?: any } = {},
  ): Promise<DocumentoFaseInterna> {
    const extras = { ...(opcoes.extras ?? {}), ...(EXIGEM_ASSINATURA.has(tipo) ? { _exige_assinatura: true } : {}) };
    const descricao = Object.values(secoes).filter((v) => v && v.trim()).join('\n');
    const doc = await this.ds.transaction(async (m) => {
      await m.query(`SELECT id FROM licitacoes WHERE id::text = $1 FOR UPDATE`, [licitacaoId]);
      const repo = m.getRepository(DocumentoFaseInterna);
      const atual = await repo.findOne({ where: { licitacao_id: licitacaoId, tipo, versao_atual: true } });
      const emElaboracao =
        !!atual &&
        atual.origem === OrigemDocumento.INTERNO &&
        [StatusDocumento.EM_ELABORACAO, StatusDocumento.PENDENTE].includes(atual.status) &&
        !atual.dados_estruturados?.nao_se_aplica;
      const internos = Object.fromEntries(
        Object.entries((emElaboracao && atual!.dados_estruturados) || {}).filter(([k]) => k.startsWith('_') && !['_gerado', '_desatualizada'].includes(k)),
      );
      // Regerar = VERSÃO NOVA (homologação E3): só o rascunho que ainda não
      // virou PDF é reescrito; a versão já gerada fica no histórico (SUBSTITUIDO)
      // e os autos citam "substitui a versão N".
      const reescrever = emElaboracao && !atual!.data_geracao_arquivo;
      if (reescrever) {
        atual!.dados_estruturados = { ...internos, ...secoes, ...extras };
        atual!.descricao = descricao;
        atual!.titulo = titulo || atual!.titulo;
        atual!.status = StatusDocumento.EM_ELABORACAO;
        if (!atual!.criado_por_id && autor.id) Object.assign(atual!, { criado_por_id: autor.id, criado_por_nome: autor.nome });
        return repo.save(atual!);
      }
      if (atual) await repo.update(atual.id, { versao_atual: false, status: StatusDocumento.SUBSTITUIDO });
      return repo.save(
        repo.create({
          licitacao_id: licitacaoId,
          tipo,
          titulo: titulo || TITULO_DOCUMENTO[tipo] || tipo,
          descricao,
          // o histórico das devoluções da autoridade acompanha as versões
          dados_estruturados: {
            ...internos,
            ...(atual?.dados_estruturados?._devolucoes ? { _devolucoes: atual.dados_estruturados._devolucoes } : {}),
            ...secoes,
            ...extras,
          },
          status: StatusDocumento.EM_ELABORACAO,
          origem: OrigemDocumento.INTERNO,
          versao: (atual?.versao ?? 0) + 1,
          versao_anterior_id: (atual?.id ?? null) as any,
          versao_atual: true,
          obrigatorio: atual?.obrigatorio ?? false,
          criado_por_id: (autor.id ?? undefined) as any,
          criado_por_nome: (autor.nome ?? undefined) as any,
        }),
      );
    });
    try {
      await this.gerador.gerarPdf(doc.id, { usuario_id: autor.id ?? undefined, usuario_nome: autor.nome ?? undefined });
    } catch (e: any) {
      this.logger.warn(`PDF da peça ${tipo} não gerado: ${e?.message ?? e}`);
    }
    await this.auditLog
      .log({
        licitacao_id: licitacaoId,
        documento_id: doc.id,
        acao: doc.versao > 1 ? AcaoLogFaseInterna.DOCUMENTO_VERSIONADO : AcaoLogFaseInterna.DOCUMENTO_CRIADO,
        descricao: `${opcoes.log ?? `${TITULO_DOCUMENTO[tipo] ?? tipo} gerada`} — v${doc.versao}, por ${autor.nome ?? 'sistema'}`,
        dados_depois: opcoes.dadosLog ?? null,
        contexto: { usuario_id: autor.id ?? undefined, usuario_nome: autor.nome ?? undefined },
      })
      .catch(() => undefined);
    return this.docRepo.findOneOrFail({ where: { id: doc.id } });
  }

  // ==========================================================================
  // REGERAR QUANDO O PROCESSO MUDA (critério de aceite da SPEC)
  // ==========================================================================

  /**
   * O processo mudou (fundamento legal, número, sigilo): as peças geradas
   * pelo modelo e intocadas são regeradas; as editadas à mão, assinadas ou em
   * assinatura ganham o aviso "desatualizada — regerar?". Idempotente: sem
   * mudança nos dados, o texto regerado é igual (e a marca de desatualizada
   * só é regravada com o mesmo conteúdo).
   */
  async regerarPorMudanca(licitacaoId: string, campos: string[]): Promise<{ regeradas: string[]; desatualizadas: string[] }> {
    const regeradas: string[] = [];
    const desatualizadas: string[] = [];
    const lic = await this.licitacao(licitacaoId).catch(() => null);
    if (!lic) return { regeradas, desatualizadas };
    // Depois da divulgação as minutas viram peças do edital: só o aviso
    if (!ehFaseInterna(lic.fase)) return { regeradas, desatualizadas };
    for (const tipo of TIPOS_REGERAVEIS) {
      const doc = await this.docAtual(licitacaoId, tipo);
      if (!doc) continue;
      const decisao = decidirRegeracao(doc);
      if (decisao.acao === 'REGERAR') {
        // Mesmos dados → mesmo texto: não gera versão/PDF à toa
        const contexto = await this.modelos.montarContextoVariaveis(licitacaoId);
        const modelo = await this.modelos.resolverModelo(lic.orgao_id, tipo as TipoDocumentoFaseInterna);
        const novo: Record<string, string> = {};
        for (const s of modelo?.secoes || []) novo[s.id] = s.texto_padrao ? this.modelos.substituirVariaveis(s.texto_padrao, contexto) : '';
        if (hashSecoes(novo) === doc.dados_estruturados?._gerado?.hash) continue;
        await this.gerarPorModelo(licitacaoId, tipo, { id: 'sistema', nome: 'Sistema' }, { motivo: `regerada: mudou ${campos.join(', ')}` });
        regeradas.push(tipo);
      } else if (decisao.acao === 'MARCAR_DESATUALIZADA') {
        const dados = { ...(doc.dados_estruturados || {}) };
        dados._desatualizada = {
          motivo: decisao.motivo,
          texto: `O processo mudou (${campos.join(', ')}) depois que esta peça foi gerada — ela está ${ROTULO_MOTIVO[decisao.motivo]}. Regerar?`,
          campos,
          em: new Date().toISOString(),
        };
        await this.docRepo.update(doc.id, { dados_estruturados: dados } as any);
        desatualizadas.push(tipo);
      }
    }
    if (regeradas.length || desatualizadas.length) {
      this.logger.log(`Processo ${licitacaoId}: mudou ${campos.join(', ')} → regeradas [${regeradas.join(', ')}], desatualizadas [${desatualizadas.join(', ')}]`);
    }
    return { regeradas, desatualizadas };
  }

  // ==========================================================================
  // TELA DAS MINUTAS
  // ==========================================================================

  async obter(licitacaoId: string) {
    const lic = await this.licitacao(licitacaoId);
    const fundamento = fundamentoEfetivo(lic);
    const instrucao = await this.faseInterna.getInstrucao(licitacaoId);
    const pecas: Record<string, any> = {};
    for (const tipo of TIPOS_MINUTAS) {
      const doc = await this.docAtual(licitacaoId, tipo);
      const secoes = secoesDaPeca(doc?.dados_estruturados);
      const texto = Object.values(secoes).join(' ') || doc?.descricao || '';
      pecas[tipo] = {
        peca: this.resumoPeca(doc),
        secoes,
        instrucao: instrucao.itens.find((i) => i.tipo === tipo) ?? null,
        referencias_divergentes: doc && doc.origem === OrigemDocumento.INTERNO ? referenciasDivergentes(texto, { numero_processo: lic.numero_processo, numero_dispensa: lic.numero_edital }) : [],
      };
    }
    const [dp] = await this.ds.query(
      `SELECT id::text AS id, numero_peca, status::text AS status, documento_orgao_id::text AS documento_orgao_id FROM documentos_fase_interna
        WHERE licitacao_id::text = $1 AND tipo::text = 'DP' AND versao_atual = true LIMIT 1`,
      [licitacaoId],
    );
    const [portaria] = await this.ds.query(
      `SELECT id::text AS id, numero, exercicio FROM documentos_orgao WHERE orgao_id::text = $1 AND tipo::text = 'PORTARIA_DESIGNACAO' AND ativo = true AND exercicio = $2 ORDER BY versao DESC LIMIT 1`,
      [lic.orgao_id, lic.exercicio],
    );
    const [agente] = lic.pregoeiro_id ? await this.ds.query(`SELECT nome FROM usuarios WHERE id::text = $1`, [lic.pregoeiro_id]) : [];
    const itens = await this.ds.query(
      `SELECT COALESCE(SUM(COALESCE(valor_total_estimado, quantidade * COALESCE(valor_unitario_estimado, 0))), 0)::float AS total
         FROM itens_licitacao WHERE licitacao_id::text = $1 AND status::text <> 'CANCELADO'`,
      [licitacaoId],
    );
    return {
      licitacao: {
        id: lic.id,
        numero_processo: lic.numero_processo,
        numero_dispensa: lic.numero_edital ?? null,
        objeto: lic.objeto,
        modalidade: lic.modalidade,
        fase: lic.fase,
        fase_interna: ehFaseInterna(lic.fase),
      },
      contratacao_direta: instrucao.contratacao_direta,
      dados_do_processo: {
        fundamento_legal: { codigo: fundamento, texto: textoDoFundamento(fundamento) },
        valor_estimado: Number(itens?.[0]?.total) || Number(lic.valor_total_estimado) || 0,
        dotacao: await this.orcamento.resumoParaTr(licitacaoId),
        sigilo: { sigiloso: lic.sigilo_orcamento === 'SIGILOSO', justificativa: lic.justificativa_sigilo ?? null },
        agente: agente?.nome ?? null,
        portaria: dp?.numero_peca
          ? { origem: 'PROCESSO', numero: dp.numero_peca, documento_id: dp.id }
          : portaria
            ? { origem: 'ORGAO', numero: portaria.numero, portaria_id: portaria.id }
            : null,
      },
      pecas,
    };
  }

  /** Gera uma minuta (RAG, ME, MC) ou todas ("TODAS") pelo modelo. */
  async gerar(licitacaoId: string, tipoParam: string, autor: Autor) {
    const lic = await this.licitacao(licitacaoId);
    if (!ehFaseInterna(lic.fase)) throw new ConflictException('A fase interna foi encerrada — as minutas não mudam mais (retificação do edital).');
    const tipo = String(tipoParam || '').toUpperCase();
    const tipos = tipo === 'TODAS' ? [...TIPOS_MINUTAS] : [tipo];
    for (const t of tipos) {
      if (!(TIPOS_MINUTAS as readonly string[]).includes(t)) throw new BadRequestException('Gere o relatório do agente (RAG), a minuta do aviso (ME) ou a minuta do contrato (MC).');
      const atual = await this.docAtual(licitacaoId, t);
      if (atual?.dados_estruturados?.nao_se_aplica) {
        if (tipo === 'TODAS') continue;
        throw new ConflictException('A peça está marcada como "não se aplica" — desfaça antes de gerar.');
      }
      await this.gerarPorModelo(licitacaoId, t, autor);
    }
    return this.obter(licitacaoId);
  }

  /**
   * DECISÃO DO SIGILO DO ORÇAMENTO (art. 24) com justificativa. Só na fase
   * interna; muda o texto das minutas geradas (regeração).
   */
  async salvarSigilo(licitacaoId: string, body: any, autor: Autor) {
    const lic = await this.licitacao(licitacaoId);
    if (!ehFaseInterna(lic.fase)) throw new ConflictException('O sigilo do orçamento só se decide na fase interna.');
    const sigiloso = body?.sigiloso === true || body?.sigiloso === 'true';
    const justificativa = String(body?.justificativa ?? '').trim().slice(0, 4000);
    const motivo = motivoSigiloInvalido(sigiloso, justificativa);
    if (motivo) throw new BadRequestException(motivo);
    const novo = sigiloso ? 'SIGILOSO' : 'PUBLICO';
    const mudou = novo !== lic.sigilo_orcamento || (sigiloso && justificativa !== (lic.justificativa_sigilo ?? ''));
    await this.ds.query(`UPDATE licitacoes SET sigilo_orcamento = $2, justificativa_sigilo = $3, updated_at = now() WHERE id::text = $1`, [
      licitacaoId,
      novo,
      sigiloso ? justificativa : null,
    ]);
    if (mudou) {
      await this.auditLog
        .log({
          licitacao_id: licitacaoId,
          acao: AcaoLogFaseInterna.DOCUMENTO_EDITADO,
          descricao: `Orçamento ${sigiloso ? 'SIGILOSO (art. 24)' : 'público'} — decidido por ${autor.nome ?? 'usuário'}${sigiloso ? `: ${justificativa}` : ''}`,
          dados_antes: { sigilo: lic.sigilo_orcamento, justificativa: lic.justificativa_sigilo ?? null },
          dados_depois: { sigilo: novo, justificativa: sigiloso ? justificativa : null },
          contexto: { usuario_id: autor.id ?? undefined, usuario_nome: autor.nome ?? undefined },
        })
        .catch(() => undefined);
      await this.regerarPorMudanca(licitacaoId, ['sigilo do orçamento']);
      // SQL cru não passa pelo gatilho: a conformidade (SIGILO-01) e as tarefas revisam
      avisarPecaAlterada(licitacaoId);
    }
    return this.obter(licitacaoId);
  }
}
