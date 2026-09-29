import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Ator } from '../../auth/acesso/ator';
import { ehFaseInterna } from '../../licitacoes/transicoes/fases';
import { AuditLogService } from '../audit-log.service';
import { RevisaoIaService } from '../ia-rascunho/revisao-ia.service';
import { DespachoEtapaService } from '../despacho-etapa.service';
import { TipoDocumentoFaseInterna } from '../entities/documento-fase-interna.entity';
import { AcaoLogFaseInterna } from '../entities/log-fase-interna.entity';
import { FaseInternaService } from '../fase-interna.service';
import { DecisaoCondicao, MarcaEtapa, PassoCalculado, RetornoEtapa, passosDasEtapas } from '../tarefas/etapas-fase-interna';
import { TarefasService } from '../tarefas/tarefas.service';
import { dependentesDe } from './modelo-fluxo';
import { alvosDaDevolucao } from './motor-grafo';
import { DeltaMarcas, ModeloFluxoService } from './modelo-fluxo.service';

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
    private readonly revisaoIa: RevisaoIaService,
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

  async reabrir(licitacaoId: string, codigo: string, body: any, ator: Ator, opcoes: { permissaoConferida?: boolean } = {}) {
    const lic = await this.processo(licitacaoId);
    // Quem conduz o processo ou o responsável pela etapa no modelo (homologação: o "Voltar"
    // fica na própria tela da etapa — quem fez a peça pode voltá-la, com motivo)
    if (!opcoes.permissaoConferida && !(await this.podeReabrir(ator, licitacaoId, codigo))) {
      throw new ForbiddenException('Só quem conduz o processo (agente de contratação, administrador do órgão ou o login do órgão) ou o responsável pela etapa reabre uma etapa.');
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
    const reaberta: MarcaEtapa = { em, por_id: autor.id, por_nome: autor.nome, motivo };
    const reabertasAtuais = ctx.fluxo.reabertas ?? {};
    // As etapas que dependem dela e já estavam concluídas ficam "a revisar" (as peças NÃO são apagadas)
    const etapas = passosDasEtapas(await this.tarefas.etapasCalculadas(licitacaoId, lic));
    const marcadas: string[] = [];
    const aRevisarPor: Record<string, MarcaEtapa> = {};
    for (const dep of dependentesDe(ctx.modelo.etapas, codigo)) {
      const p = etapas.find((x) => x.passo === dep);
      if (!p || (p.situacao !== 'CONCLUIDO' && p.situacao !== 'A_REVISAR') || reabertasAtuais[dep]) continue;
      aRevisarPor[dep] = { em, por_id: autor.id, por_nome: autor.nome, origem: codigo, motivo: `"${passo.titulo}" foi reaberta: ${motivo}` };
      marcadas.push(dep);
    }
    // Só o delta desta reabertura vai ao banco (atômico): outra marca posta ao mesmo tempo não se perde.
    // Condição (construtor de fluxo): voltar é desfazer a resposta — o sistema avalia de novo (ou pergunta)
    const condicao = passo.conclusao === 'CONDICAO';
    await this.modeloFluxo.aplicarMarcas(ctx.fluxo.id, {
      ...(condicao ? { decisoes: { remover: [codigo] } } : { reabertas: { por: { [codigo]: reaberta } } }),
      a_revisar: { por: aRevisarPor, remover: [codigo] },
      registros: { remover: [codigo] },
    });
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

  /** Pode voltar (reabrir) esta etapa: quem conduz o processo ou (modo por setor) o responsável pela etapa no modelo. */
  async podeReabrir(ator: Ator, licitacaoId: string, codigo: string): Promise<boolean> {
    if (await this.tarefas.podeConduzirProcesso(ator, licitacaoId)) return true;
    const ctx = await this.modeloFluxo.contextoDoProcesso(licitacaoId).catch(() => null);
    const etapa = ctx?.modelo.etapas.find((e) => e.codigo === codigo);
    if (!ctx || !etapa) return false;
    // Modo SIMPLES: uma pessoa conduz tudo — só ela (e o administrador) volta etapa
    if ((await this.tarefas.configuracao(ctx.orgao_id)).modo !== 'POR_SETOR') return false;
    return this.ehResponsavel(ator, ctx.orgao_id, etapa.responsavel);
  }

  /**
   * "DESFAZER NÃO SE APLICA" (homologação, passo 6: reabria sem motivo e sem
   * marcar as dependentes). Se a etapa da peça está concluída (ou a revisar),
   * desfazer é VOLTAR a etapa: exige o motivo (400 sem ele), a mesma
   * permissão da reabertura (403) e deixa as dependentes concluídas "a
   * revisar". Etapa ainda não concluída: nada a reabrir (o desfazer segue).
   */
  /** Devolve `true` quando a etapa estava concluída e foi reaberta (o "voltar"); `false` quando não era o caso. */
  async reabrirParaDesfazerNaoSeAplica(licitacaoId: string, tipo: string, motivo: unknown, ator: Ator): Promise<boolean> {
    const lic = await this.processo(licitacaoId);
    const [doc] = await this.ds.query(
      `SELECT id, aprovador_id FROM documentos_fase_interna WHERE licitacao_id::text = $1 AND tipo::text = $2 AND versao_atual = true
          AND (dados_estruturados->>'nao_se_aplica')::boolean IS TRUE LIMIT 1`,
      [licitacaoId, tipo],
    );
    if (!doc) return false;
    const ctx = await this.contexto(licitacaoId);
    const etapa = ctx.modelo.etapas.find((e) => e.tipos_peca.includes(tipo));
    if (!etapa) return false;
    const passo = passosDasEtapas(await this.tarefas.etapasCalculadas(licitacaoId, lic)).find((p) => p.passo === etapa.codigo);
    if (!passo || (passo.situacao !== 'CONCLUIDO' && passo.situacao !== 'A_REVISAR')) return false;
    const texto = String(motivo ?? '').trim();
    if (texto.length < 10) {
      throw new BadRequestException(
        `Desfazer o "não se aplica" reabre a etapa "${passo.titulo}", que está concluída: informe o motivo (pelo menos 10 caracteres). As etapas que dependem dela ficam "a revisar".`,
      );
    }
    // Quem marcou o "não se aplica" também desfaz a própria marcação (além de quem conduz e do responsável)
    const marcouEle = !!ator.usuarioId && !!doc.aprovador_id && String(doc.aprovador_id) === ator.usuarioId;
    if (!marcouEle && !(await this.podeReabrir(ator, licitacaoId, etapa.codigo))) {
      throw new ForbiddenException('Só quem conduz o processo, o responsável pela etapa ou quem marcou o "não se aplica" o desfaz depois de a etapa concluir.');
    }
    await this.reabrir(licitacaoId, etapa.codigo, { motivo: `Desfeito o "não se aplica": ${texto}` }, ator, { permissaoConferida: true });
    return true;
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
    if (passo.conclusao === 'CONDICAO') return this.responderCondicao(licitacaoId, passo, body, ator);
    const texto = this.motivo(body?.texto ?? body?.despacho, passo.conclusao === 'REGISTRO' ? 'o despacho' : 'o que foi revisto');
    const autor = await this.tarefas.autor(ator);
    const em = new Date().toISOString();
    const marca: MarcaEtapa = { em, por_id: autor.id, por_nome: autor.nome, texto };
    // Delta desta conclusão (gravado atomicamente — ver ModeloFluxoService.aplicarMarcas)
    const delta: DeltaMarcas = {};
    let registrar = false;
    let acao: AcaoLogFaseInterna;
    let descricao: string;
    if (passo.reaberta) {
      delta.reabertas = { remover: [codigo] };
      registrar = passo.conclusao === 'REGISTRO';
      acao = AcaoLogFaseInterna.ETAPA_REVISADA;
      descricao = `Etapa "${passo.titulo}" revista (reabertura encerrada) por ${autor.nome ?? 'usuário'}: ${texto}`;
    } else if (passo.situacao === 'A_REVISAR') {
      delta.a_revisar = { remover: [codigo] };
      acao = AcaoLogFaseInterna.ETAPA_REVISADA;
      descricao = `Etapa "${passo.titulo}" revista (continua valendo) por ${autor.nome ?? 'usuário'}: ${texto}`;
    } else if (passo.conclusao === 'REGISTRO' && (passo.situacao === 'DISPONIVEL' || passo.situacao === 'AGUARDANDO')) {
      if (passo.pendencias.length) {
        const nomes = passo.pendencias.map((d) => ctx.modelo.etapas.find((e) => e.codigo === d)?.titulo ?? d);
        throw new ConflictException(`Esta etapa depende de outra que ainda não terminou: ${nomes.join(', ')}.`);
      }
      registrar = true;
      acao = AcaoLogFaseInterna.ETAPA_REGISTRADA;
      descricao = `Etapa "${passo.titulo}" registrada por ${autor.nome ?? 'usuário'}: ${texto}`;
    } else {
      throw new ConflictException('Nada a concluir aqui: esta etapa conclui quando as peças dela ficam prontas (feitas, assinadas, anexadas ou "não se aplica").');
    }
    // F3: o despacho da etapa de REGISTRO vira folha nos autos (PDF, mesma sequência das peças)
    let despacho: MarcaEtapa['despacho'] = null;
    if (registrar) {
      const d = await this.despachos.registrar(licitacaoId, { etapa: codigo, titulo_etapa: passo.titulo, texto, autor });
      despacho = { id: d.id, folha_inicial: d.folha_inicial, folha_final: d.folha_final, url: d.url };
      delta.registros = { por: { [codigo]: { ...marca, despacho } } };
    }
    await this.modeloFluxo.aplicarMarcas(ctx.fluxo.id, delta);
    await this.log(licitacaoId, acao, `${descricao}${despacho ? ` (despacho nos autos, fl. ${despacho.folha_inicial})` : ''}`, { etapa: codigo, texto, despacho }, autor);
    // F4a: despacho registrado a partir do texto sugerido pela IA (aceito) → registra quem revisou
    if (passo.conclusao === 'REGISTRO' && despacho) await this.revisaoIa.registrarNaEmissao(licitacaoId, 'REGISTRO', { etapa: codigo, autor, ato: 'registrado' });
    await this.tarefas.agendar(licitacaoId);
    return this.tarefas.etapasDoProcesso(licitacaoId, ator);
  }

  // ==========================================================================
  // CONSTRUTOR DE FLUXO: condição respondida por quem conduz; devolução
  // ==========================================================================

  /**
   * CONDIÇÃO MANUAL (ou automática sem o dado ainda): quem conduz (ou o
   * responsável) responde { resposta: 'sim' | 'nao', texto? }. Só a saída da
   * resposta segue; a outra sai do processo. Fica no histórico.
   */
  private async responderCondicao(licitacaoId: string, passo: PassoCalculado, body: any, ator: Ator) {
    const r = String(body?.resposta ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[^a-z]/g, '');
    if (r !== 'sim' && r !== 'nao') throw new BadRequestException('Responda a pergunta: { "resposta": "sim" } ou { "resposta": "nao" }.');
    if (passo.decisao) throw new ConflictException(`"${passo.titulo}" já foi respondida (${passo.decisao.resposta === 'sim' ? 'sim' : 'não'}). Para mudar, volte a etapa com o motivo.`);
    if (passo.pendencias.length || passo.situacao !== 'DISPONIVEL') throw new ConflictException('O processo ainda não chegou a esta pergunta: as etapas anteriores não terminaram.');
    const ctx = await this.contexto(licitacaoId);
    const autor = await this.tarefas.autor(ator);
    const texto = String(body?.texto ?? body?.justificativa ?? '').trim().slice(0, 2000) || null;
    const decisao: DecisaoCondicao = { resposta: r, automatica: false, em: new Date().toISOString(), por_id: autor.id, por_nome: autor.nome, descricao: texto };
    await this.modeloFluxo.aplicarMarcas(ctx.fluxo.id, { decisoes: { por: { [passo.passo]: decisao } } });
    await this.log(
      licitacaoId,
      AcaoLogFaseInterna.CONDICAO_RESPONDIDA,
      `Condição "${passo.titulo}" respondida por ${autor.nome ?? 'usuário'}: ${r === 'sim' ? 'sim' : 'não'}${texto ? ` — ${texto}` : ''}`,
      { etapa: passo.passo, resposta: r, automatica: false, texto },
      autor,
    );
    await this.tarefas.agendar(licitacaoId);
    return this.tarefas.etapasDoProcesso(licitacaoId, ator);
  }

  /**
   * DEVOLVER (aprovação do fluxo desenhado): { motivo, para?: códigos }. A
   * etapa devolvida volta a andamento (reaberta, sem marcar o que está no
   * meio "a revisar"); quando ela conclui de novo, o processo volta DIRETO
   * para quem devolveu. Sem `para`: as setas "devolve" da aprovação; sem
   * elas, as etapas imediatamente anteriores. O despacho da devolução vai
   * aos autos (folha), como o das etapas de registro.
   */
  async devolver(licitacaoId: string, codigo: string, body: any, ator: Ator) {
    const lic = await this.processo(licitacaoId);
    const passo = await this.passo(licitacaoId, lic, codigo);
    const ctx = await this.contexto(licitacaoId);
    const etapaModelo = ctx.modelo.etapas.find((e) => e.codigo === codigo);
    if (!etapaModelo || etapaModelo.tipo_no !== 'aprovacao') throw new ConflictException('Só uma aprovação do fluxo devolve (esta etapa não é uma aprovação no modelo do processo).');
    const conduz = await this.tarefas.podeConduzirProcesso(ator, licitacaoId);
    const responsavel = !conduz ? await this.ehResponsavel(ator, ctx.orgao_id, etapaModelo.responsavel) : false;
    if (!conduz && !responsavel) throw new ForbiddenException('Só quem conduz o processo ou o responsável pela aprovação devolve.');
    if (passo.situacao !== 'DISPONIVEL' && passo.situacao !== 'EM_ANDAMENTO') {
      throw new ConflictException('Só se devolve uma aprovação que está com alguém agora (disponível ou em andamento).');
    }
    const motivo = this.motivo(body?.motivo, 'o motivo da devolução');
    const permitidos = alvosDaDevolucao(ctx.modelo.etapas, codigo);
    const pedidos: string[] = Array.isArray(body?.para) ? body.para.map((x: unknown) => String(x)) : [];
    const fora = pedidos.filter((c) => !permitidos.includes(c));
    if (fora.length) throw new BadRequestException(`Esta aprovação não devolve para: ${fora.join(', ')}. Pode devolver para: ${permitidos.join(', ') || 'nenhuma etapa'}.`);
    const alvos = pedidos.length ? pedidos : permitidos;
    if (!alvos.length) throw new ConflictException('Esta aprovação não tem para onde devolver.');
    const passos = passosDasEtapas(await this.tarefas.etapasCalculadas(licitacaoId, lic));
    const autor = await this.tarefas.autor(ator);
    const em = new Date().toISOString();
    const titulo = (c: string) => ctx.modelo.etapas.find((e) => e.codigo === c)?.titulo ?? c;
    const reabertas: Record<string, MarcaEtapa> = {};
    const retornos: Record<string, RetornoEtapa> = {};
    for (const t of alvos) {
      const p = passos.find((x) => x.passo === t);
      if (p && (p.situacao === 'CONCLUIDO' || p.situacao === 'A_REVISAR')) {
        reabertas[t] = { em, por_id: autor.id, por_nome: autor.nome, motivo: `Devolvida por "${passo.titulo}": ${motivo}`, origem: codigo };
      }
      retornos[t] = { em, por_id: autor.id, por_nome: autor.nome, motivo, de: codigo, de_titulo: passo.titulo };
    }
    const texto = `Devolva-se a ${alvos.map(titulo).join(', ')} para correção: ${motivo}`;
    const d = await this.despachos.registrar(licitacaoId, { etapa: codigo, titulo_etapa: passo.titulo, texto, autor });
    const despacho = { id: d.id, folha_inicial: d.folha_inicial, folha_final: d.folha_final, url: d.url };
    for (const t of Object.keys(retornos)) retornos[t].despacho = despacho;
    await this.modeloFluxo.aplicarMarcas(ctx.fluxo.id, {
      reabertas: { por: reabertas },
      registros: { remover: Object.keys(reabertas) },
      retornos: { por: retornos },
    });
    await this.log(
      licitacaoId,
      AcaoLogFaseInterna.ETAPA_DEVOLVIDA,
      `"${passo.titulo}" devolvida por ${autor.nome ?? 'usuário'} a ${alvos.map(titulo).join(', ')}: ${motivo} — ao concluir, volta direto para "${passo.titulo}"${despacho.folha_inicial ? ` (despacho nos autos, fl. ${despacho.folha_inicial})` : ''}`,
      { etapa: codigo, para: alvos, motivo, despacho },
      autor,
    );
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
