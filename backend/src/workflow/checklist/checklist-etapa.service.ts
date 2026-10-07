import { BadRequestException, ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Ator } from '../../auth/acesso/ator';
import { IaService } from '../../ia/ia.service';
import { caminhoLogicoDeUrl, resolverArquivo } from '../../common/arquivos/arquivos';
import { paginasDoArquivo } from '../../fase-interna/conformidade/texto-pdf';
import { WorkflowService } from '../workflow.service';
import { CATALOGO_NOS, definicaoDoNo } from '../nos/catalogo-nos';
import { RegistroNos, type ContextoNo } from '../nos/executor-no';
import { aplicarLeituraDaIa, checklistDoDocumento, marcarItem, pendenciasDoChecklist, resumoDoChecklist, type EstadoChecklist, type ItemChecklist } from './checklist-documento';

/** Etapas com executor próprio (não entram no executor genérico de documento). */
const COM_EXECUTOR_PROPRIO = new Set(['DEMANDA', 'DFD']);
const MAX_TEXTO_IA = 60000;

/**
 * DOCUMENTO E CHECKLIST DAS ETAPAS (mockup aprovado, tela "Contratação 1").
 * - Etapas que produzem documento só concluem com o documento juntado
 *   (escrito, gerado pela IA ou anexado) — peça `no:<acao_id>`.
 * - Etapas com checklist (ETP: art. 18, § 1º) só concluem com os
 *   obrigatórios atendidos e os demais atendidos ou justificados.
 * - A IA lê o documento juntado (texto ou PDF) e marca os elementos que
 *   encontrou; a pessoa confere.
 */
@Injectable()
export class ChecklistEtapaService implements OnModuleInit {
  private readonly logger = new Logger(ChecklistEtapaService.name);

  constructor(
    private readonly ds: DataSource,
    private readonly workflow: WorkflowService,
    private readonly registro: RegistroNos,
    private readonly ia: IaService,
  ) {}

  onModuleInit(): void {
    for (const def of CATALOGO_NOS) {
      if (!def.documento.produz || COM_EXECUTOR_PROPRIO.has(def.tipo) || this.registro.executor(def.tipo)) continue;
      this.registro.registrarExecutor({ tipo: def.tipo, pendencias: (ctx) => this.pendencias(ctx) });
    }
  }

  private async pecaDaEtapa(processoId: string, acaoId: string) {
    const [p] = await this.ds.query(
      `SELECT titulo, texto, arquivo_url FROM processo_pecas WHERE processo_id = $1::uuid AND etapa = $2 ORDER BY numero_peca DESC LIMIT 1`,
      [processoId, `no:${acaoId}`],
    );
    return (p as { titulo: string; texto: string | null; arquivo_url: string | null } | undefined) ?? null;
  }

  private itensDe(tipoNo: string): ItemChecklist[] {
    return checklistDoDocumento(definicaoDoNo(tipoNo)?.tipo_documento);
  }

  private async pendencias(ctx: ContextoNo): Promise<string[]> {
    if (!ctx.processoId) return []; // fluxo sem processo (legado) não tem autos para o documento
    const pend: string[] = [];
    if (!(await this.pecaDaEtapa(ctx.processoId, ctx.acao.id))) pend.push(`Falta o documento da etapa "${ctx.acao.nome}": escreva, use a IA ou anexe.`);
    pend.push(...pendenciasDoChecklist(this.itensDe(ctx.acao.tipo), (ctx.tarefa.resposta as any)?.checklist ?? null));
    return pend;
  }

  async obter(orgaoId: string, instanciaId: string, tarefaId: string) {
    const { instancia, tarefa, acao } = await this.workflow.tarefaDaInstancia(orgaoId, instanciaId, tarefaId);
    const itens = this.itensDe(acao.tipo);
    const estado: EstadoChecklist = (tarefa.resposta as any)?.checklist ?? {};
    const processoId = instancia.vinculo_tipo === 'PROCESSO' ? instancia.vinculo_id : null;
    const documento = processoId ? await this.pecaDaEtapa(processoId, acao.id) : null;
    return { itens, estado, resumo: resumoDoChecklist(itens, estado), documento: documento ? { titulo: documento.titulo } : null };
  }

  private async gravar(tarefaId: string, estado: EstadoChecklist) {
    await this.ds.query(
      `UPDATE workflow_tarefas SET resposta = COALESCE(resposta, '{}'::jsonb) || jsonb_build_object('checklist', $2::jsonb) WHERE id = $1::uuid AND status = 'ABERTA'`,
      [tarefaId, JSON.stringify(estado)],
    );
  }

  async marcar(orgaoId: string, instanciaId: string, tarefaId: string, ator: Ator, body: any) {
    const { tarefa, acao, nomeDoAtor } = await this.workflow.exigirResponsavelDaTarefa(orgaoId, instanciaId, tarefaId, ator);
    const itens = this.itensDe(acao.tipo);
    if (!itens.length) throw new BadRequestException('Esta etapa não tem checklist.');
    const status = body?.status === 'ATENDIDO' || body?.status === 'NAO_SE_APLICA' ? body.status : null;
    let estado: EstadoChecklist;
    try {
      estado = marcarItem(itens, (tarefa.resposta as any)?.checklist ?? {}, String(body?.codigo ?? ''), status, body?.justificativa ?? null, nomeDoAtor);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    await this.gravar(tarefa.id, estado);
    return this.obter(orgaoId, instanciaId, tarefaId);
  }

  /** IA lê o documento juntado na etapa e marca os elementos que encontrou (a pessoa confere). */
  async analisar(orgaoId: string, instanciaId: string, tarefaId: string, ator: Ator) {
    const { instancia, tarefa, acao } = await this.workflow.exigirResponsavelDaTarefa(orgaoId, instanciaId, tarefaId, ator);
    const itens = this.itensDe(acao.tipo);
    if (!itens.length) throw new BadRequestException('Esta etapa não tem checklist.');
    const processoId = instancia.vinculo_tipo === 'PROCESSO' ? instancia.vinculo_id : null;
    const peca = processoId ? await this.pecaDaEtapa(processoId, acao.id) : null;
    if (!peca) throw new BadRequestException('Junte o documento da etapa antes de pedir a leitura pela IA.');
    if (!(await this.ia.configurada())) throw new ConflictException('A IA não está configurada neste servidor. Marque os elementos à mão.');
    let texto = (peca.texto ?? '').trim();
    if (!texto && peca.arquivo_url) {
      const caminho = resolverArquivo(caminhoLogicoDeUrl(peca.arquivo_url));
      const paginas = caminho ? await paginasDoArquivo(caminho, null) : null;
      texto = (paginas ?? []).join('\n').trim();
    }
    if (texto.length < 200) throw new BadRequestException('Não deu para ler o texto do documento (PDF digitalizado como imagem?). Marque os elementos à mão.');
    const sistema =
      'Você confere se um Estudo Técnico Preliminar (Lei nº 14.133/2021, art. 18, § 1º) contém cada elemento listado. ' +
      'Considere presente só o que o texto realmente trata, ainda que com outras palavras. Não invente. ' +
      'Responda APENAS com JSON: {"itens":[{"codigo":"...","presente":true|false,"trecho":"até 200 caracteres do texto que comprova, ou vazio"}]}';
    const usuario = [
      'ELEMENTOS:',
      ...itens.map((i) => `- ${i.codigo}: ${i.rotulo} (${i.fundamento})`),
      '',
      'DOCUMENTO:',
      texto.slice(0, MAX_TEXTO_IA),
    ].join('\n');
    let leitura: Array<{ codigo: string; presente: boolean; trecho?: string | null }>;
    try {
      const r = await this.ia.gerarRascunhoJson(sistema, usuario, { maxTokens: 2500 });
      const bruto = r.texto.slice(r.texto.indexOf('{'), r.texto.lastIndexOf('}') + 1);
      const j = JSON.parse(bruto);
      leitura = Array.isArray(j?.itens) ? j.itens.map((x: any) => ({ codigo: String(x?.codigo ?? ''), presente: x?.presente === true, trecho: x?.trecho ? String(x.trecho) : null })) : [];
    } catch (e) {
      this.logger.warn(`Leitura do checklist pela IA falhou (tarefa ${tarefa.id}): ${(e as Error).message}`);
      throw new ConflictException('A IA não respondeu agora. Tente de novo em instantes ou marque à mão.');
    }
    await this.gravar(tarefa.id, aplicarLeituraDaIa(itens, (tarefa.resposta as any)?.checklist ?? {}, leitura));
    return this.obter(orgaoId, instanciaId, tarefaId);
  }
}
