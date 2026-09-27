import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { localDoOrgao } from '../textos-documento';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { Ator } from '../../auth/acesso/ator';
import { ehUuid } from '../../auth/acesso/acesso-licitacao.service';
import { FaseLicitacao } from '../../licitacoes/entities/licitacao.entity';
import { ehFaseInterna, indiceFase } from '../../licitacoes/transicoes/fases';
import { definicaoDoFundamento, fundamentoEfetivo, incisoLimiteDoFundamento, textoDoFundamento } from '../../licitacoes/fundamento-legal';
import { DocumentoFaseInterna, OrigemDocumento, StatusDocumento, TipoDocumentoFaseInterna } from '../entities/documento-fase-interna.entity';
import { AcaoLogFaseInterna } from '../entities/log-fase-interna.entity';
import { AuditLogService } from '../audit-log.service';
import { FaseInternaService } from '../fase-interna.service';
import { PecasFaseInternaService } from '../pecas-fase-interna.service';
import { TITULO_DOCUMENTO } from '../documentos-obrigatorios';
import { TarefasService } from '../tarefas/tarefas.service';
import { PapelFaseInterna, PassoFaseInterna, passoDaPeca } from '../tarefas/etapas-fase-interna';
import { Autor, MinutasTelaService } from './minutas-tela.service';
import { ConformidadeService } from '../conformidade/conformidade.service';
import { secoesDaPeca } from './minutas-regras';
import { AnaliseJuridica, Diligencia, FaseAnaliseJuridica } from './parecer.entities';
import {
  ConclusaoParecer,
  ROTULO_CONCLUSAO,
  aplicarMarcacoes,
  podeCancelar,
  podeReabrir,
  podeSanar,
  roteiroFaseExterna,
  roteiroPrevio,
  textoDoParecer,
  validarEmissao,
  validarMarcacoes,
  validarNovaDiligencia,
} from './parecer-regras';

/** Tarefa "o processo voltou à Procuradoria" (uma aberta por análise). */
export const chaveRetornoParecer = (analiseId: string) => `parecer-retorno:${analiseId}`;
export const chaveDiligencia = (id: string) => `diligencia:${id}`;
export const CHAVE_TAREFA_PJE = 'sistema:parecer-fase-externa';

/** Parecer da fase externa: depois da sessão (julgamento) e antes da adjudicação. */
const FASES_PARECER_EXTERNO: string[] = [FaseLicitacao.JULGAMENTO, FaseLicitacao.HABILITACAO, FaseLicitacao.RECURSO];

interface Pessoa {
  id: string;
  nome: string;
  cargo: string | null;
  papeis: string[];
  setor_id: string | null;
  role: string | null;
}

/**
 * PARECER JURÍDICO COM DILIGÊNCIAS (etapa 7, parte da Procuradoria — Entrega
 * 3B; mockup Parecer). À esquerda os AUTOS (peças na ordem, com as folhas); à
 * direita o ROTEIRO de análise (art. 72, art. 75, art. 41, art. 24, art. 92,
 * vinculação). DILIGÊNCIA: tarefa (origem DILIGENCIA) para o responsável pela
 * peça-alvo; o processo "volta" àquela peça sem desfazer nada assinado depois
 * (a peça ganha versão nova); sanada, volta para a Procuradoria (nova tarefa).
 * Emissão (favorável, com ressalvas ou desfavorável) gera o parecer (PJ; PJE
 * na fase externa) e o assina pelo emissor — só quem tem o papel JURÍDICO.
 * O parecer feito fora continua entrando pelo anexo da peça.
 */
@Injectable()
export class ParecerTelaService {
  private readonly logger = new Logger(ParecerTelaService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(DocumentoFaseInterna) private readonly docRepo: Repository<DocumentoFaseInterna>,
    @InjectRepository(AnaliseJuridica) private readonly analiseRepo: Repository<AnaliseJuridica>,
    @InjectRepository(Diligencia) private readonly diligenciaRepo: Repository<Diligencia>,
    private readonly faseInterna: FaseInternaService,
    private readonly minutas: MinutasTelaService,
    private readonly pecas: PecasFaseInternaService,
    private readonly tarefas: TarefasService,
    private readonly auditLog: AuditLogService,
    private readonly conformidade: ConformidadeService,
  ) {}

  // ==========================================================================
  // QUEM PODE
  // ==========================================================================

  /** Usuário do token (ativo, do órgão), com os papéis funcionais. */
  async pessoa(ator: Ator, orgaoId: string): Promise<Pessoa | null> {
    if (!ator.usuarioId || !ehUuid(ator.usuarioId)) return null;
    const [u] = await this.ds.query(
      `SELECT id::text AS id, nome, cargo, papeis_fase_interna AS papeis, setor_id::text AS setor_id, role::text AS role
         FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2 AND ativo = true`,
      [ator.usuarioId, orgaoId],
    );
    return u ? { ...u, papeis: Array.isArray(u.papeis) ? u.papeis : [] } : null;
  }

  /** Só quem tem o papel funcional emite (parecer: JURÍDICO; controle interno: CONTROLE_INTERNO). */
  async exigirPapel(ator: Ator, orgaoId: string, papel: PapelFaseInterna, acao: string): Promise<Pessoa> {
    const p = await this.pessoa(ator, orgaoId);
    if (!p || !p.papeis.includes(papel)) {
      throw new ForbiddenException(`Só quem tem o papel ${papel === PapelFaseInterna.JURIDICO ? 'Jurídico' : 'Controle interno'} ${acao}.`);
    }
    return p;
  }

  // ==========================================================================
  // LEITURA
  // ==========================================================================

  fase(param: unknown): FaseAnaliseJuridica {
    return String(param ?? '').toUpperCase() === 'EXTERNA' ? 'EXTERNA' : 'PREVIA';
  }

  tipoDaFase(fase: FaseAnaliseJuridica): TipoDocumentoFaseInterna {
    return fase === 'EXTERNA' ? TipoDocumentoFaseInterna.PARECER_FASE_EXTERNA : TipoDocumentoFaseInterna.PARECER_JURIDICO;
  }

  /** A fase do processo admite esta análise? (prévia: fase interna; externa: depois da sessão, antes da adjudicação). */
  disponibilidade(fase: FaseAnaliseJuridica, faseProcesso: string): { disponivel: boolean; motivo: string | null } {
    if (fase === 'PREVIA') {
      return ehFaseInterna(faseProcesso) ? { disponivel: true, motivo: null } : { disponivel: false, motivo: 'A fase interna foi encerrada (processo divulgado).' };
    }
    if (FASES_PARECER_EXTERNO.includes(faseProcesso)) return { disponivel: true, motivo: null };
    return indiceFase(faseProcesso) >= indiceFase(FaseLicitacao.ADJUDICACAO)
      ? { disponivel: false, motivo: 'O processo já passou da adjudicação.' }
      : { disponivel: false, motivo: 'O parecer da fase externa é emitido depois da sessão (julgamento) e antes da adjudicação.' };
  }

  private async analiseDe(licitacaoId: string, fase: FaseAnaliseJuridica): Promise<AnaliseJuridica | null> {
    return this.analiseRepo.findOne({ where: { licitacao_id: licitacaoId, fase } });
  }

  private async garantirAnalise(licitacaoId: string, orgaoId: string, fase: FaseAnaliseJuridica): Promise<AnaliseJuridica> {
    await this.ds.query(
      `INSERT INTO analises_juridicas (orgao_id, licitacao_id, fase, status) VALUES ($1, $2, $3, 'EM_ANALISE')
       ON CONFLICT (licitacao_id, fase) DO NOTHING`,
      [orgaoId, licitacaoId, fase],
    );
    return (await this.analiseDe(licitacaoId, fase))!;
  }

  /** Autos: peças atuais na ordem das folhas (sem folha, na ordem da instrução). */
  private async autos(licitacaoId: string, ordemTipos: string[]) {
    const docs = await this.docRepo.find({ where: { licitacao_id: licitacaoId, versao_atual: true } });
    const ordem = (t: string) => {
      const i = ordemTipos.indexOf(t);
      return i < 0 ? 999 : i;
    };
    return docs
      .filter((d) => !d.dados_estruturados?.nao_se_aplica)
      .sort((a, b) => (a.folha_inicial ?? 1e9) - (b.folha_inicial ?? 1e9) || ordem(a.tipo) - ordem(b.tipo))
      .map((d) => ({
        documento_id: d.id,
        tipo: d.tipo,
        titulo: d.titulo || TITULO_DOCUMENTO[d.tipo] || d.tipo,
        versao: d.versao,
        status: d.status,
        anexada: d.origem !== OrigemDocumento.INTERNO,
        numero_peca: d.numero_peca ?? null,
        data_documento: d.data_documento ?? null,
        folha_inicial: d.folha_inicial ?? null,
        folha_final: d.folha_final ?? null,
        total_paginas: d.total_paginas ?? null,
        tem_arquivo: !!(d.caminho_arquivo || d.arquivo_pdf_path),
        secoes: d.origem === OrigemDocumento.INTERNO ? secoesDaPeca(d.dados_estruturados) : {},
        texto: d.origem === OrigemDocumento.INTERNO ? d.descricao ?? '' : '',
      }));
  }

  async obter(licitacaoId: string, faseParam: unknown, ator: Ator) {
    const fase = this.fase(faseParam);
    const lic = await this.minutas.licitacao(licitacaoId);
    const instrucao = await this.faseInterna.getInstrucao(licitacaoId);
    const autos = await this.autos(
      licitacaoId,
      instrucao.itens.map((i) => i.tipo),
    );
    const analise = await this.analiseDe(licitacaoId, fase);
    const diligencias = analise ? await this.diligenciaRepo.find({ where: { analise_id: analise.id }, order: { created_at: 'ASC' } }) : [];
    const fundamento = fundamentoEfetivo(lic);

    let base;
    if (fase === 'PREVIA') {
      // O roteiro LÊ O MOTOR DE CONFORMIDADE (Entrega 4): mesma avaliação da tela da conformidade
      const { avaliacoes } = await this.conformidade.avaliacao(licitacaoId);
      base = roteiroPrevio({
        contratacao_direta: instrucao.contratacao_direta,
        instrucao: instrucao.itens,
        fundamento_referencia: definicaoDoFundamento(fundamento)?.referencia ?? null,
        numero_processo: lic.numero_processo,
        avaliacoes,
      });
    } else {
      const pj = instrucao.itens.find((i) => i.tipo === 'PJ');
      const [venc] = await this.ds.query(
        `SELECT COALESCE(SUM(valor_total_homologado), 0)::float AS v, COUNT(*) FILTER (WHERE fornecedor_vencedor_id IS NOT NULL)::int AS n
           FROM itens_licitacao WHERE licitacao_id::text = $1`,
        [licitacaoId],
      ).catch(() => [{ v: 0, n: 0 }]);
      base = roteiroFaseExterna({
        parecer_previo: pj?.status ?? null,
        tem_vencedor: Number(venc?.n) > 0,
        valor_vencedor: Number(venc?.v) > 0 ? Number(venc.v) : null,
        valor_estimado: Number(lic.valor_total_estimado) || null,
      });
    }
    const itens = aplicarMarcacoes(base, analise?.roteiro ?? null, diligencias);
    const tipoParecer = this.tipoDaFase(fase);
    const parecerDoc = await this.minutas.docAtual(licitacaoId, tipoParecer);
    const pessoa = await this.pessoa(ator, lic.orgao_id);
    const disp = this.disponibilidade(fase, lic.fase);
    const [tarefaPje] = fase === 'EXTERNA'
      ? await this.ds.query(`SELECT id::text AS id, status FROM tarefas WHERE licitacao_id::text = $1 AND chave = $2 ORDER BY created_at DESC LIMIT 1`, [licitacaoId, CHAVE_TAREFA_PJE])
      : [];
    return {
      licitacao: { id: lic.id, numero_processo: lic.numero_processo, numero_dispensa: lic.numero_edital ?? null, objeto: lic.objeto, modalidade: lic.modalidade, fase: lic.fase },
      fase,
      ...disp,
      fundamento_legal: { codigo: fundamento, texto: textoDoFundamento(fundamento), inciso_limite: incisoLimiteDoFundamento(fundamento) },
      autos,
      roteiro: itens,
      analise: analise
        ? { id: analise.id, status: analise.status, conclusao: analise.conclusao, fundamentacao: analise.fundamentacao, ressalvas: analise.ressalvas, emitido_em: analise.emitido_em, emitido_por_nome: analise.emitido_por_nome }
        : null,
      diligencias: diligencias.map((d) => this.diligenciaParaTela(d, autos)),
      diligencias_abertas: diligencias.filter((d) => d.status === 'ABERTA').length,
      parecer: this.minutas.resumoPeca(parecerDoc),
      conclusao_do_parecer: parecerDoc?.dados_estruturados?._parecer?.conclusao ?? null,
      conclusoes: Object.entries(ROTULO_CONCLUSAO).map(([codigo, rotulo]) => ({ codigo, rotulo })),
      minutas_prontas: fase === 'PREVIA' ? ['RAG', 'ME', 'MC'].every((t) => ['OK', 'NAO_SE_APLICA', undefined].includes(instrucao.itens.find((i) => i.tipo === t)?.status)) : true,
      pode_emitir: !!pessoa?.papeis.includes(PapelFaseInterna.JURIDICO),
      tarefa_fase_externa: tarefaPje ?? null,
    };
  }

  private diligenciaParaTela(d: Diligencia, autos: Array<{ tipo: string; documento_id: string; versao: number; folha_inicial: number | null; titulo: string }>) {
    const atual = autos.find((a) => a.tipo === d.tipo_alvo);
    return {
      id: d.id,
      tipo_alvo: d.tipo_alvo,
      titulo_alvo: TITULO_DOCUMENTO[d.tipo_alvo as TipoDocumentoFaseInterna] ?? d.tipo_alvo,
      descricao: d.descricao,
      item_roteiro: d.item_roteiro,
      folha: d.folha ?? atual?.folha_inicial ?? null,
      trecho: d.trecho,
      status: d.status,
      versao_alvo: d.versao_alvo,
      versao_atual: atual?.versao ?? null,
      documento_atual_id: atual?.documento_id ?? null,
      corrigida: !!atual && atual.documento_id !== d.documento_alvo_id,
      resposta: d.resposta,
      versao_corrigida: d.versao_corrigida,
      aberta_por_nome: d.aberta_por_nome,
      created_at: d.created_at,
      sanada_por_nome: d.sanada_por_nome,
      sanada_em: d.sanada_em,
      historico: d.historico ?? [],
    };
  }

  // ==========================================================================
  // ROTEIRO (rascunho da Procuradoria)
  // ==========================================================================

  async salvar(licitacaoId: string, body: any, ator: Ator, autor: Autor) {
    const fase = this.fase(body?.fase);
    const lic = await this.minutas.licitacao(licitacaoId);
    await this.exigirPapel(ator, lic.orgao_id, PapelFaseInterna.JURIDICO, 'analisa o processo e emite o parecer');
    const tela = await this.obter(licitacaoId, fase, ator);
    const v = validarMarcacoes(body?.roteiro, tela.roteiro.map((i) => i.id));
    if (!v.ok) throw new BadRequestException(v.erro);
    const analise = await this.garantirAnalise(licitacaoId, lic.orgao_id, fase);
    const upd: Partial<AnaliseJuridica> = { atualizado_por_id: autor.id, atualizado_por_nome: autor.nome };
    if (body?.roteiro !== undefined) upd.roteiro = { ...(analise.roteiro ?? {}), ...v.valores };
    if (body?.conclusao !== undefined) upd.conclusao = body.conclusao ? String(body.conclusao).toUpperCase().slice(0, 30) : null;
    if (body?.fundamentacao !== undefined) upd.fundamentacao = String(body.fundamentacao ?? '').trim().slice(0, 20000) || null;
    if (body?.ressalvas !== undefined) upd.ressalvas = String(body.ressalvas ?? '').trim().slice(0, 20000) || null;
    await this.analiseRepo.update(analise.id, upd as any);
    return this.obter(licitacaoId, fase, ator);
  }

  // ==========================================================================
  // DILIGÊNCIAS
  // ==========================================================================

  async abrirDiligencia(licitacaoId: string, body: any, ator: Ator, autor: Autor) {
    const fase = this.fase(body?.fase);
    const lic = await this.minutas.licitacao(licitacaoId);
    await this.exigirPapel(ator, lic.orgao_id, PapelFaseInterna.JURIDICO, 'abre diligência');
    const disp = this.disponibilidade(fase, lic.fase);
    if (!disp.disponivel) throw new ConflictException(disp.motivo);
    const tela = await this.obter(licitacaoId, fase, ator);
    const tipoAlvo = String(body?.tipo_alvo ?? '').toUpperCase();
    const erro = validarNovaDiligencia({
      descricao: body?.descricao,
      tipo_alvo: tipoAlvo,
      tipos_do_processo: tela.autos.map((a) => a.tipo),
      item_roteiro: body?.item_roteiro,
      itens_roteiro: tela.roteiro.map((i) => i.id),
    });
    if (erro) throw new BadRequestException(erro);
    const alvo = tela.autos.find((a) => a.tipo === tipoAlvo)!;
    const analise = await this.garantirAnalise(licitacaoId, lic.orgao_id, fase);
    const folha = Number(body?.folha);
    const dil = await this.diligenciaRepo.save(
      this.diligenciaRepo.create({
        orgao_id: lic.orgao_id,
        licitacao_id: licitacaoId,
        analise_id: analise.id,
        tipo_alvo: tipoAlvo,
        documento_alvo_id: alvo.documento_id,
        versao_alvo: alvo.versao,
        folha: Number.isInteger(folha) && folha > 0 ? folha : alvo.folha_inicial,
        trecho: String(body?.trecho ?? '').trim().slice(0, 2000) || null,
        descricao: String(body.descricao).trim().slice(0, 4000),
        item_roteiro: body?.item_roteiro ? String(body.item_roteiro) : null,
        status: 'ABERTA',
        aberta_por_id: autor.id,
        aberta_por_nome: autor.nome,
        historico: [{ acao: 'ABERTA', por: autor.nome, em: new Date().toISOString(), texto: String(body.descricao).trim().slice(0, 500) }],
      }),
    );
    await this.criarTarefaDaDiligencia(licitacaoId, lic.numero_processo, dil, autor);
    await this.log(licitacaoId, alvo.documento_id, AcaoLogFaseInterna.TRAMITACAO_DEVOLVIDA, `Diligência da Procuradoria sobre ${TITULO_DOCUMENTO[tipoAlvo as TipoDocumentoFaseInterna] ?? tipoAlvo}: ${dil.descricao}`, { diligencia_id: dil.id, tipo_alvo: tipoAlvo, versao_alvo: alvo.versao }, autor);
    return this.obter(licitacaoId, fase, ator);
  }

  /** Tarefa (origem DILIGENCIA) para o responsável pela peça-alvo (o do passo da peça). */
  private async criarTarefaDaDiligencia(licitacaoId: string, numeroProcesso: string, d: Diligencia, autor: Autor) {
    const passo = passoDaPeca(d.tipo_alvo, true) ?? PassoFaseInterna.MINUTAS;
    const titulo = TITULO_DOCUMENTO[d.tipo_alvo as TipoDocumentoFaseInterna] ?? d.tipo_alvo;
    await this.tarefas.criarTarefaDoSistema(licitacaoId, {
      chave: chaveDiligencia(d.id),
      passo,
      titulo: `Diligência do parecer — ${titulo}`.slice(0, 250),
      descricao: `Processo ${numeroProcesso}. A Procuradoria (${autor.nome ?? 'jurídico'}) pede: ${d.descricao}${d.trecho ? ` Trecho: "${d.trecho}".` : ''} Corrija a peça (nova versão feita aqui ou anexada) e marque a diligência como sanada — o processo volta para a Procuradoria.`,
      tipo_peca: d.tipo_alvo,
      documento_id: d.documento_alvo_id,
      origem: 'DILIGENCIA',
      origem_id: d.id,
      tipo: 'DILIGENCIA',
    });
  }

  private async diligencia(licitacaoId: string, id: string): Promise<Diligencia> {
    const d = ehUuid(id) ? await this.diligenciaRepo.findOne({ where: { id } }) : null;
    // Diligência de outro processo (ou de outro órgão): não existe para esta rota
    if (!d || d.licitacao_id !== licitacaoId) throw new NotFoundException('Diligência não encontrada');
    return d;
  }

  /**
   * Quem pode SANAR: o responsável pela tarefa da diligência (usuário, papel ou
   * setor), o agente do processo, o administrador do órgão ou o login do órgão.
   */
  private async exigirQuemSana(licitacaoId: string, orgaoId: string, d: Diligencia, ator: Ator) {
    if (ator.admin || ator.tipo === 'ORGAO') return;
    const p = await this.pessoa(ator, orgaoId);
    if (!p) throw new ForbiddenException('Usuário sem acesso a este processo.');
    if (p.role === 'ADMIN') return;
    const [t] = await this.ds.query(
      `SELECT responsavel_usuario_id::text AS u, responsavel_papel AS papel, responsavel_setor_id::text AS setor FROM tarefas
        WHERE licitacao_id::text = $1 AND chave = $2 ORDER BY created_at DESC LIMIT 1`,
      [licitacaoId, chaveDiligencia(d.id)],
    );
    const [lic] = await this.ds.query(`SELECT pregoeiro_id::text AS agente FROM licitacoes WHERE id::text = $1`, [licitacaoId]);
    const ok =
      lic?.agente === p.id ||
      (!!t && (t.u === p.id || (!t.u && ((t.papel && p.papeis.includes(t.papel)) || (t.setor && t.setor === p.setor_id)))));
    if (!ok) throw new ForbiddenException('Só o responsável pela peça (tarefa da diligência), o agente do processo ou o administrador do órgão sana a diligência.');
  }

  async sanar(licitacaoId: string, id: string, body: any, ator: Ator, autor: Autor) {
    const lic = await this.minutas.licitacao(licitacaoId);
    const d = await this.diligencia(licitacaoId, id);
    await this.exigirQuemSana(licitacaoId, lic.orgao_id, d, ator);
    const atual = await this.minutas.docAtual(licitacaoId, d.tipo_alvo);
    const instrucao = await this.faseInterna.getInstrucao(licitacaoId);
    const linha = instrucao.itens.find((i) => i.tipo === d.tipo_alvo);
    const pronta = !!atual && (linha ? ['OK', 'NAO_SE_APLICA'].includes(linha.status) : atual.status !== StatusDocumento.EM_ELABORACAO || !!atual.descricao);
    const resposta = String(body?.resposta ?? '').trim().slice(0, 4000);
    const r = podeSanar(d, { documento_atual_id: atual?.id ?? null, atual_pronta: pronta, sem_alteracao: body?.sem_alteracao === true, resposta });
    if (!r.ok) throw new BadRequestException(r.erro);
    await this.diligenciaRepo.update(d.id, {
      status: 'SANADA',
      resposta: resposta || null,
      documento_corrigido_id: r.corrigida ? atual!.id : null,
      versao_corrigida: r.corrigida ? atual!.versao : null,
      sanada_por_id: autor.id,
      sanada_por_nome: autor.nome,
      sanada_em: new Date(),
      historico: [...(d.historico ?? []), { acao: 'SANADA', por: autor.nome, em: new Date().toISOString(), texto: resposta || (r.corrigida ? `Peça corrigida (versão ${atual!.versao})` : null) }],
    } as any);
    await this.tarefas.concluirTarefaPorChave(licitacaoId, chaveDiligencia(d.id), autor);
    // O processo VOLTA para a Procuradoria
    const analise = await this.analiseRepo.findOneOrFail({ where: { id: d.analise_id } });
    await this.tarefas.criarTarefaDoSistema(licitacaoId, {
      chave: chaveRetornoParecer(analise.id),
      passo: PassoFaseInterna.PARECER,
      titulo: analise.fase === 'EXTERNA' ? 'Diligência sanada — retomar o parecer da fase externa' : 'Diligência sanada — retomar a análise do parecer',
      descricao: `Processo ${lic.numero_processo}. ${autor.nome ?? 'O responsável'} sanou a diligência sobre ${TITULO_DOCUMENTO[d.tipo_alvo as TipoDocumentoFaseInterna] ?? d.tipo_alvo}${r.corrigida ? ` (versão ${atual!.versao})` : ' (esclarecimento, sem alteração)'}${resposta ? `: ${resposta}` : ''}.`,
      tipo_peca: this.tipoDaFase(analise.fase),
      origem: 'DILIGENCIA',
      origem_id: d.id,
      tipo: 'DILIGENCIA',
      // o do passo PARECER (Procuradoria no modo por setor)
    });
    await this.log(licitacaoId, atual?.id, AcaoLogFaseInterna.PROCESSO_TRAMITADO, `Diligência sanada por ${autor.nome ?? 'responsável'} — processo de volta à Procuradoria`, { diligencia_id: d.id, corrigida: r.corrigida, versao: atual?.versao ?? null }, autor);
    return this.obter(licitacaoId, analise.fase, ator);
  }

  async reabrir(licitacaoId: string, id: string, body: any, ator: Ator, autor: Autor) {
    const lic = await this.minutas.licitacao(licitacaoId);
    await this.exigirPapel(ator, lic.orgao_id, PapelFaseInterna.JURIDICO, 'reabre diligência');
    const d = await this.diligencia(licitacaoId, id);
    const erro = podeReabrir(d);
    if (erro) throw new ConflictException(erro);
    const motivo = String(body?.motivo ?? '').trim().slice(0, 2000);
    if (motivo.length < 10) throw new BadRequestException('Explique por que a diligência continua pendente.');
    const atual = await this.minutas.docAtual(licitacaoId, d.tipo_alvo);
    await this.diligenciaRepo.update(d.id, {
      status: 'ABERTA',
      // a próxima correção precisa ser posterior a esta versão
      documento_alvo_id: atual?.id ?? d.documento_alvo_id,
      versao_alvo: atual?.versao ?? d.versao_alvo,
      historico: [...(d.historico ?? []), { acao: 'REABERTA', por: autor.nome, em: new Date().toISOString(), texto: motivo }],
    } as any);
    const nova = await this.diligencia(licitacaoId, id);
    await this.criarTarefaDaDiligencia(licitacaoId, lic.numero_processo, { ...nova, descricao: `${nova.descricao} (reaberta: ${motivo})` } as Diligencia, autor);
    await this.log(licitacaoId, atual?.id, AcaoLogFaseInterna.TRAMITACAO_DEVOLVIDA, `Diligência reaberta pela Procuradoria: ${motivo}`, { diligencia_id: d.id }, autor);
    const analise = await this.analiseRepo.findOneOrFail({ where: { id: d.analise_id } });
    return this.obter(licitacaoId, analise.fase, ator);
  }

  async cancelar(licitacaoId: string, id: string, body: any, ator: Ator, autor: Autor) {
    const lic = await this.minutas.licitacao(licitacaoId);
    await this.exigirPapel(ator, lic.orgao_id, PapelFaseInterna.JURIDICO, 'cancela diligência');
    const d = await this.diligencia(licitacaoId, id);
    const erro = podeCancelar(d);
    if (erro) throw new ConflictException(erro);
    const motivo = String(body?.motivo ?? '').trim().slice(0, 2000) || 'Cancelada pela Procuradoria';
    await this.diligenciaRepo.update(d.id, {
      status: 'CANCELADA',
      motivo_cancelamento: motivo,
      historico: [...(d.historico ?? []), { acao: 'CANCELADA', por: autor.nome, em: new Date().toISOString(), texto: motivo }],
    } as any);
    await this.tarefas.cancelarTarefaPorChave(licitacaoId, chaveDiligencia(d.id), `Diligência cancelada pela Procuradoria: ${motivo}`);
    const analise = await this.analiseRepo.findOneOrFail({ where: { id: d.analise_id } });
    return this.obter(licitacaoId, analise.fase, ator);
  }

  // ==========================================================================
  // EMISSÃO DO PARECER
  // ==========================================================================

  /**
   * EMITE e ASSINA o parecer (PJ; PJE na fase externa): texto montado do
   * roteiro, das diligências e da conclusão; assinado pelo próprio jurista
   * (papel JURÍDICO) no portal de assinaturas. Conclui a tarefa de retorno da
   * Procuradoria (e a do parecer da fase externa); a tarefa da etapa conclui
   * sozinha quando a peça fica assinada.
   */
  async emitir(licitacaoId: string, body: any, ator: Ator, autor: Autor, rede: { ip?: string; userAgent?: string }) {
    const fase = this.fase(body?.fase);
    const lic = await this.minutas.licitacao(licitacaoId);
    const jurista = await this.exigirPapel(ator, lic.orgao_id, PapelFaseInterna.JURIDICO, 'emite o parecer');
    const disp = this.disponibilidade(fase, lic.fase);
    if (!disp.disponivel) throw new ConflictException(disp.motivo);
    const analise = await this.garantirAnalise(licitacaoId, lic.orgao_id, fase);
    const fundamentacao = body?.fundamentacao !== undefined ? String(body.fundamentacao ?? '').trim().slice(0, 20000) : analise.fundamentacao ?? '';
    const ressalvas = body?.ressalvas !== undefined ? String(body.ressalvas ?? '').trim().slice(0, 20000) : analise.ressalvas ?? '';
    const diligencias = await this.diligenciaRepo.find({ where: { analise_id: analise.id }, order: { created_at: 'ASC' } });
    const v = validarEmissao({ conclusao: body?.conclusao ?? analise.conclusao, fundamentacao, ressalvas, diligencias });
    if (!v.ok) throw new BadRequestException(v.erro);
    const tipo = this.tipoDaFase(fase);
    const atual = await this.minutas.docAtual(licitacaoId, tipo);
    if (atual?.status === StatusDocumento.AGUARDANDO_ASSINATURA) throw new ConflictException('O parecer já está em assinatura.');

    const tela = await this.obter(licitacaoId, fase, ator);
    const [orgao] = await this.ds.query(`SELECT cidade, uf FROM orgaos WHERE id::text = $1`, [lic.orgao_id]).catch(() => [{}]);
    const html = textoDoParecer({
      fase,
      numero_processo: lic.numero_processo,
      objeto: lic.objeto,
      fundamento_texto: tela.fundamento_legal.texto,
      itens: tela.roteiro,
      diligencias: diligencias.filter((d) => d.status !== 'CANCELADA'),
      conclusao: v.conclusao,
      fundamentacao: fundamentacao || null,
      ressalvas: ressalvas || null,
      jurista: `${jurista.nome}${jurista.cargo ? ` — ${jurista.cargo}` : ''}`,
      // município do cadastro ("A definir" = sem cidade: só a data)
      cidade: localDoOrgao(orgao),
      data: new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'long', year: 'numeric' }),
    });
    const titulo = fase === 'EXTERNA' ? 'Parecer jurídico da fase externa' : 'Parecer jurídico';
    const doc = await this.minutas.gravarPecaGerada(licitacaoId, tipo, { parecer: html }, titulo, autor, {
      extras: { _parecer: { conclusao: v.conclusao, fase, analise_id: analise.id, diligencias: diligencias.map((d) => ({ id: d.id, status: d.status })) } },
      log: `${titulo} emitido (${ROTULO_CONCLUSAO[v.conclusao as ConclusaoParecer]})`,
      dadosLog: { conclusao: v.conclusao, fase },
    });
    const assinado = await this.pecas.enviarEAssinarComoEmissor(licitacaoId, tipo, ator, jurista.cargo || 'Procuradoria jurídica', rede);
    await this.analiseRepo.update(analise.id, {
      status: 'EMITIDO',
      conclusao: v.conclusao,
      fundamentacao: fundamentacao || null,
      ressalvas: ressalvas || null,
      documento_id: doc.id,
      emitido_por_id: autor.id,
      emitido_por_nome: autor.nome,
      emitido_em: new Date(),
    } as any);
    await this.ds.query(`UPDATE diligencias SET parecer_documento_id = $2, updated_at = now() WHERE analise_id::text = $1 AND parecer_documento_id IS NULL`, [analise.id, doc.id]);
    await this.tarefas.concluirTarefaPorChave(licitacaoId, chaveRetornoParecer(analise.id), autor);
    if (fase === 'EXTERNA') await this.tarefas.concluirTarefaPorChave(licitacaoId, CHAVE_TAREFA_PJE, autor);
    this.logger.log(`Parecer ${tipo} do processo ${licitacaoId} emitido (${v.conclusao}) e ${assinado.status === StatusDocumento.ASSINADO ? 'assinado' : 'em assinatura'}`);
    return this.obter(licitacaoId, fase, ator);
  }

  /** Parecer feito fora (anexo do PJ/PJE): a tarefa de retorno e a da fase externa concluem. */
  async aoAnexarParecer(licitacaoId: string, tipo: string, autor: Autor) {
    const fase: FaseAnaliseJuridica = tipo === 'PJE' ? 'EXTERNA' : 'PREVIA';
    const analise = await this.analiseDe(licitacaoId, fase);
    if (analise) await this.tarefas.concluirTarefaPorChave(licitacaoId, chaveRetornoParecer(analise.id), autor);
    if (fase === 'EXTERNA') await this.tarefas.concluirTarefaPorChave(licitacaoId, CHAVE_TAREFA_PJE, autor);
  }

  /**
   * Pede o PARECER DA FASE EXTERNA (depois da sessão, antes da adjudicação):
   * cria a tarefa da Procuradoria. Não há gatilho automático no fluxo da fase
   * externa — nem todo órgão exige o parecer nº 2 (decisão: pedido explícito).
   */
  async solicitarFaseExterna(licitacaoId: string, autor: Autor) {
    const lic = await this.minutas.licitacao(licitacaoId);
    const disp = this.disponibilidade('EXTERNA', lic.fase);
    if (!disp.disponivel) throw new ConflictException(disp.motivo);
    await this.tarefas.criarTarefaDoSistema(licitacaoId, {
      chave: CHAVE_TAREFA_PJE,
      passo: PassoFaseInterna.PARECER,
      titulo: 'Parecer jurídico da fase externa',
      descricao: `Processo ${lic.numero_processo}. Analise a fase externa (sessão, julgamento, habilitação e recursos) antes da adjudicação — emita o parecer aqui ou anexe o assinado fora.`,
      tipo_peca: 'PJE',
    });
    return { ok: true };
  }

  private async log(licitacaoId: string, documentoId: string | undefined, acao: AcaoLogFaseInterna, descricao: string, dados: any, autor: Autor) {
    await this.auditLog
      .log({ licitacao_id: licitacaoId, documento_id: documentoId, acao, descricao, dados_depois: dados, contexto: { usuario_id: autor.id ?? undefined, usuario_nome: autor.nome ?? undefined } })
      .catch(() => undefined);
  }
}
