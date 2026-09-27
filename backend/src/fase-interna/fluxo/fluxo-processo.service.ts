import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Ator } from '../../auth/acesso/ator';
import { ehFaseInterna } from '../../licitacoes/transicoes/fases';
import { AuditLogService } from '../audit-log.service';
import { DespachoEtapaService } from '../despacho-etapa.service';
import { TipoDocumentoFaseInterna } from '../entities/documento-fase-interna.entity';
import { AcaoLogFaseInterna } from '../entities/log-fase-interna.entity';
import { FaseInternaService } from '../fase-interna.service';
import { MarcaEtapa, PassoCalculado, passosDasEtapas } from '../tarefas/etapas-fase-interna';
import { TarefasService } from '../tarefas/tarefas.service';
import { dependentesDe } from './modelo-fluxo';
import { ModeloFluxoService } from './modelo-fluxo.service';

const dataBr = (iso: string) => iso.split('-').reverse().join('/');
const hojeBrasilia = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

/**
 * AÇÕES DO FLUXO NO PROCESSO (F1 — pedidos do dono, §10 do plano):
 *  - voltar/reabrir etapa (motivo obrigatório; dependentes concluídas ficam "a revisar");
 *  - avançar: registrar a etapa de registro ou confirmar a revisão;
 *  - aprovar a demanda (só quem foi designado no modelo);
 *  - dispensar o parecer jurídico informando o ato (art. 53, §5º).
 * Isolamento: o órgão vem do JWT; a rota com `:licitacaoId` passa pelo
 * DonoFaseInternaGuard (outro órgão: 404 na leitura, 403 na escrita).
 */
@Injectable()
export class FluxoProcessoService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly modeloFluxo: ModeloFluxoService,
    private readonly tarefas: TarefasService,
    private readonly faseInterna: FaseInternaService,
    private readonly auditLog: AuditLogService,
    private readonly despachos: DespachoEtapaService,
  ) {}

  private async processo(licitacaoId: string) {
    const [lic] = await this.ds.query(
      `SELECT id::text AS id, orgao_id::text AS orgao_id, fase::text AS fase, situacao::text AS situacao, numero_processo FROM licitacoes WHERE id::text = $1`,
      [licitacaoId],
    );
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    if (!ehFaseInterna(lic.fase)) throw new ConflictException('A fase interna foi encerrada — as etapas não mudam mais.');
    if (['REVOGADA', 'ANULADA'].includes(lic.situacao)) throw new ConflictException('Processo revogado ou anulado.');
    return lic;
  }

  private async passo(licitacaoId: string, lic: { orgao_id: string; fase: string; situacao: string | null }, codigo: string): Promise<PassoCalculado> {
    await this.tarefas.agendar(licitacaoId);
    const passo = passosDasEtapas(await this.tarefas.etapasCalculadas(licitacaoId, lic)).find((p) => p.passo === codigo);
    if (!passo) throw new NotFoundException('Etapa não encontrada neste processo (desligada no modelo ou sem peça na instrução).');
    return passo;
  }

  private async contexto(licitacaoId: string) {
    const ctx = await this.modeloFluxo.contextoDoProcesso(licitacaoId);
    if (!ctx) throw new NotFoundException('Fluxo do processo não encontrado');
    return ctx;
  }

  private async log(licitacaoId: string, acao: AcaoLogFaseInterna, descricao: string, depois: any, autor: { id: string | null; nome: string | null }) {
    await this.auditLog
      .log({ licitacao_id: licitacaoId, acao, descricao, dados_depois: depois, contexto: { usuario_id: autor.id ?? undefined, usuario_nome: autor.nome ?? undefined } })
      .catch(() => undefined);
  }

  private motivo(v: unknown, rotulo: string): string {
    const t = String(v ?? '').trim().slice(0, 2000);
    if (t.length < 10) throw new BadRequestException(`Informe ${rotulo} (pelo menos 10 caracteres) — vai para o histórico do processo.`);
    return t;
  }

  // ==========================================================================
  // VOLTAR (reabrir etapa)
  // ==========================================================================

  async reabrir(licitacaoId: string, codigo: string, body: any, ator: Ator) {
    const lic = await this.processo(licitacaoId);
    if (!(await this.tarefas.podeConduzirProcesso(ator, licitacaoId))) {
      throw new ForbiddenException('Só quem conduz o processo (agente de contratação, administrador do órgão ou o login do órgão) reabre uma etapa.');
    }
    const motivo = this.motivo(body?.motivo, 'o motivo da reabertura');
    const passo = await this.passo(licitacaoId, lic, codigo);
    if (passo.conclusao === 'DIVULGACAO') throw new ConflictException('A publicação não se reabre por aqui.');
    if (passo.situacao !== 'CONCLUIDO' && passo.situacao !== 'A_REVISAR') {
      throw new ConflictException('Só se reabre uma etapa concluída (esta ainda está em andamento ou aguardando).');
    }
    const ctx = await this.contexto(licitacaoId);
    const autor = await this.tarefas.autor(ator);
    const em = new Date().toISOString();
    const reabertas: Record<string, MarcaEtapa> = { ...(ctx.fluxo.reabertas ?? {}), [codigo]: { em, por_id: autor.id, por_nome: autor.nome, motivo } };
    const aRevisar: Record<string, MarcaEtapa> = { ...(ctx.fluxo.a_revisar ?? {}) };
    delete aRevisar[codigo];
    // As etapas que dependem dela e já estavam concluídas ficam "a revisar" (as peças NÃO são apagadas)
    const etapas = passosDasEtapas(await this.tarefas.etapasCalculadas(licitacaoId, lic));
    const marcadas: string[] = [];
    for (const dep of dependentesDe(ctx.modelo.etapas, codigo)) {
      const p = etapas.find((x) => x.passo === dep);
      if (!p || (p.situacao !== 'CONCLUIDO' && p.situacao !== 'A_REVISAR') || reabertas[dep]) continue;
      aRevisar[dep] = { em, por_id: autor.id, por_nome: autor.nome, origem: codigo, motivo: `"${passo.titulo}" foi reaberta: ${motivo}` };
      marcadas.push(dep);
    }
    const registros = { ...(ctx.fluxo.registros ?? {}) };
    delete registros[codigo];
    await this.modeloFluxo.gravarMarcas(ctx.fluxo.id, { reabertas, a_revisar: aRevisar, registros });
    // Reabrir a demanda desfaz a aprovação (a demanda revista é aprovada de novo)
    const ap = ctx.modelo.aprovacao_demanda;
    const desfez = ap.exigida && codigo === ap.etapa && ctx.fluxo.demanda_aprovada && ctx.fluxo.aprovacao_demanda?.origem !== 'DEMANDA';
    if (desfez) await this.modeloFluxo.desfazerAprovacao(ctx.fluxo.id);
    const titulos = marcadas.map((c) => etapas.find((x) => x.passo === c)?.titulo ?? c);
    await this.log(
      licitacaoId,
      AcaoLogFaseInterna.ETAPA_REABERTA,
      `Etapa "${passo.titulo}" reaberta por ${autor.nome ?? 'usuário'}: ${motivo}${titulos.length ? ` — a revisar: ${titulos.join(', ')}` : ''}${desfez ? ' — a aprovação da demanda foi desfeita' : ''}`,
      { etapa: codigo, motivo, a_revisar: marcadas, aprovacao_desfeita: desfez },
      autor,
    );
    await this.tarefas.agendar(licitacaoId);
    return this.tarefas.etapasDoProcesso(licitacaoId, ator);
  }

  // ==========================================================================
  // AVANÇAR (registro / revisão confirmada)
  // ==========================================================================

  async concluir(licitacaoId: string, codigo: string, body: any, ator: Ator) {
    const lic = await this.processo(licitacaoId);
    const passo = await this.passo(licitacaoId, lic, codigo);
    const ctx = await this.contexto(licitacaoId);
    const etapaModelo = ctx.modelo.etapas.find((e) => e.codigo === codigo);
    const conduz = await this.tarefas.podeConduzirProcesso(ator, licitacaoId);
    const responsavel = !conduz && etapaModelo ? await this.ehResponsavel(ator, ctx.orgao_id, etapaModelo.responsavel) : false;
    if (!conduz && !responsavel) throw new ForbiddenException('Só quem conduz o processo ou o responsável pela etapa conclui a etapa.');
    const texto = this.motivo(body?.texto ?? body?.despacho, passo.conclusao === 'REGISTRO' ? 'o despacho' : 'o que foi revisto');
    const autor = await this.tarefas.autor(ator);
    const em = new Date().toISOString();
    const marca: MarcaEtapa = { em, por_id: autor.id, por_nome: autor.nome, texto };
    const reabertas = { ...(ctx.fluxo.reabertas ?? {}) };
    const aRevisar = { ...(ctx.fluxo.a_revisar ?? {}) };
    const registros = { ...(ctx.fluxo.registros ?? {}) };
    let acao: AcaoLogFaseInterna;
    let descricao: string;
    if (passo.reaberta) {
      delete reabertas[codigo];
      if (passo.conclusao === 'REGISTRO') registros[codigo] = marca;
      acao = AcaoLogFaseInterna.ETAPA_REVISADA;
      descricao = `Etapa "${passo.titulo}" revista (reabertura encerrada) por ${autor.nome ?? 'usuário'}: ${texto}`;
    } else if (passo.situacao === 'A_REVISAR') {
      delete aRevisar[codigo];
      acao = AcaoLogFaseInterna.ETAPA_REVISADA;
      descricao = `Etapa "${passo.titulo}" revista (continua valendo) por ${autor.nome ?? 'usuário'}: ${texto}`;
    } else if (passo.conclusao === 'REGISTRO' && (passo.situacao === 'DISPONIVEL' || passo.situacao === 'AGUARDANDO')) {
      if (passo.pendencias.length) {
        const nomes = passo.pendencias.map((d) => ctx.modelo.etapas.find((e) => e.codigo === d)?.titulo ?? d);
        throw new ConflictException(`Esta etapa depende de outra que ainda não terminou: ${nomes.join(', ')}.`);
      }
      registros[codigo] = marca;
      acao = AcaoLogFaseInterna.ETAPA_REGISTRADA;
      descricao = `Etapa "${passo.titulo}" registrada por ${autor.nome ?? 'usuário'}: ${texto}`;
    } else {
      throw new ConflictException('Nada a concluir aqui: esta etapa conclui quando as peças dela ficam prontas (feitas, assinadas, anexadas ou "não se aplica").');
    }
    // F3: o despacho da etapa de REGISTRO vira folha nos autos (PDF, mesma sequência das peças)
    let despacho: MarcaEtapa['despacho'] = null;
    if (passo.conclusao === 'REGISTRO' && registros[codigo] === marca) {
      const d = await this.despachos.registrar(licitacaoId, { etapa: codigo, titulo_etapa: passo.titulo, texto, autor });
      despacho = { id: d.id, folha_inicial: d.folha_inicial, folha_final: d.folha_final, url: d.url };
      registros[codigo] = { ...marca, despacho };
    }
    await this.modeloFluxo.gravarMarcas(ctx.fluxo.id, { reabertas, a_revisar: aRevisar, registros });
    await this.log(licitacaoId, acao, `${descricao}${despacho ? ` (despacho nos autos, fl. ${despacho.folha_inicial})` : ''}`, { etapa: codigo, texto, despacho }, autor);
    await this.tarefas.agendar(licitacaoId);
    return this.tarefas.etapasDoProcesso(licitacaoId, ator);
  }

  private async ehResponsavel(ator: Ator, orgaoId: string, r: { papel: string | null; setor_id: string | null; usuario_id: string | null }): Promise<boolean> {
    if (ator.tipo !== 'USUARIO' || !ator.usuarioId) return false;
    if (r.usuario_id) return r.usuario_id === ator.usuarioId;
    const [u] = await this.ds.query(`SELECT papeis_fase_interna AS papeis, setor_id::text AS setor_id FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2`, [ator.usuarioId, orgaoId]);
    return (!!r.papel && Array.isArray(u?.papeis) && u.papeis.includes(r.papel)) || (!!r.setor_id && u?.setor_id === r.setor_id);
  }

  // ==========================================================================
  // APROVAÇÃO DA DEMANDA
  // ==========================================================================

  async aprovarDemanda(licitacaoId: string, body: any, ator: Ator) {
    await this.processo(licitacaoId);
    await this.tarefas.agendar(licitacaoId);
    const ctx = await this.contexto(licitacaoId);
    const ap = ctx.modelo.aprovacao_demanda;
    if (!ap.exigida) throw new ConflictException('O modelo de fluxo deste processo não exige a aprovação da demanda.');
    if (ctx.fluxo.demanda_aprovada) throw new ConflictException('A demanda já foi aprovada.');
    if (!(await this.tarefas.podeAprovarDemanda(ator, licitacaoId, ctx.modelo))) {
      throw new ForbiddenException(`Só quem foi designado aprova a demanda: ${this.modeloFluxo.rotuloAprovador(ap.aprovador)}.`);
    }
    const tipos = ctx.modelo.etapas.find((e) => e.codigo === ap.etapa)?.tipos_peca ?? [];
    const itens = (await this.faseInterna.getInstrucao(licitacaoId)).itens.filter((i) => tipos.includes(i.tipo));
    if (!itens.length || !itens.every((i) => i.status === 'OK')) throw new ConflictException('Formalize a demanda (DFD) antes de aprovar.');
    const autor = await this.tarefas.autor(ator);
    const observacao = String(body?.observacao ?? '').trim().slice(0, 1000) || null;
    await this.modeloFluxo.registrarAprovacao(ctx.fluxo.id, { origem: 'MANUAL', por_id: autor.id, por_nome: autor.nome, observacao });
    await this.log(licitacaoId, AcaoLogFaseInterna.DEMANDA_APROVADA, `Demanda aprovada por ${autor.nome ?? 'usuário'}${observacao ? `: ${observacao}` : ''}`, { origem: 'MANUAL', observacao }, autor);
    await this.tarefas.agendar(licitacaoId);
    return this.tarefas.etapasDoProcesso(licitacaoId, ator);
  }

  // ==========================================================================
  // PARECER DISPENSADO POR ATO (art. 53, §5º)
  // ==========================================================================

  async dispensarParecer(licitacaoId: string, body: any, ator: Ator) {
    await this.processo(licitacaoId);
    if (!(await this.tarefas.podeConduzirProcesso(ator, licitacaoId))) {
      throw new ForbiddenException('Só quem conduz o processo (agente de contratação, administrador do órgão ou o login do órgão) registra a dispensa do parecer.');
    }
    const ctx = await this.contexto(licitacaoId);
    const parecer = ctx.modelo.etapas.find((e) => e.codigo === 'PARECER');
    if (!parecer?.dispensavel_por_ato || ctx.tipo === 'LICITACAO') {
      throw new ConflictException('O modelo de fluxo deste processo não permite dispensar o parecer jurídico (art. 53, §5º: só nas hipóteses do ato da autoridade jurídica, quando o órgão as adota).');
    }
    const numero = String(body?.numero_ato ?? '').trim().slice(0, 120);
    if (!numero) throw new BadRequestException('Informe o número do ato da autoridade jurídica que define as hipóteses de dispensa do parecer (art. 53, §5º).');
    const data = String(body?.data_ato ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(new Date(`${data}T12:00:00Z`).getTime())) throw new BadRequestException('Informe a data do ato (AAAA-MM-DD).');
    if (data > hojeBrasilia()) throw new BadRequestException('A data do ato não pode ser futura.');
    const hipotese = String(body?.hipotese ?? '').trim().slice(0, 500) || null;
    const pj = (await this.faseInterna.getInstrucao(licitacaoId)).itens.find((i) => i.tipo === TipoDocumentoFaseInterna.PARECER_JURIDICO);
    if (!pj) throw new ConflictException('O parecer jurídico não está na instrução deste processo.');
    if (pj.status === 'OK') throw new ConflictException('O parecer jurídico já foi juntado ao processo.');
    const autor = await this.tarefas.autor(ator);
    const justificativa = `Parecer jurídico dispensado nos termos do art. 53, §5º, da Lei nº 14.133/2021 — hipótese prevista no ato nº ${numero}, de ${dataBr(data)}, da autoridade jurídica${hipotese ? `: ${hipotese}` : ''}.`;
    await this.faseInterna.marcarNaoSeAplica(licitacaoId, TipoDocumentoFaseInterna.PARECER_JURIDICO, justificativa, { id: autor.id ?? undefined, nome: autor.nome ?? undefined });
    const dispensa = { numero_ato: numero, data_ato: data, hipotese, fundamento: 'art. 53, §5º', por_id: autor.id, por_nome: autor.nome, em: new Date().toISOString() };
    await this.ds.query(
      `UPDATE documentos_fase_interna SET dados_estruturados = COALESCE(dados_estruturados, '{}'::jsonb) || jsonb_build_object('parecer_dispensado', $2::jsonb)
        WHERE licitacao_id::text = $1 AND tipo::text = 'PJ' AND versao_atual = true`,
      [licitacaoId, JSON.stringify(dispensa)],
    );
    await this.log(licitacaoId, AcaoLogFaseInterna.PARECER_DISPENSADO, `Parecer jurídico dispensado (art. 53, §5º) — ato nº ${numero}, de ${dataBr(data)}${hipotese ? ` (${hipotese})` : ''}`, dispensa, autor);
    await this.tarefas.agendar(licitacaoId);
    return this.tarefas.etapasDoProcesso(licitacaoId, ator);
  }
}
