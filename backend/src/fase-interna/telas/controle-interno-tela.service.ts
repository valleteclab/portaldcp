import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { Ator } from '../../auth/acesso/ator';
import { ehFaseInterna } from '../../licitacoes/transicoes/fases';
import { StatusDocumento, TipoDocumentoFaseInterna } from '../entities/documento-fase-interna.entity';
import { FaseInternaService } from '../fase-interna.service';
import { PecasFaseInternaService } from '../pecas-fase-interna.service';
import { TarefasService } from '../tarefas/tarefas.service';
import { PapelFaseInterna } from '../tarefas/etapas-fase-interna';
import { Autor, MinutasTelaService } from './minutas-tela.service';
import { ParecerTelaService } from './parecer-tela.service';

const MCI = TipoDocumentoFaseInterna.MANIFESTACAO_CONTROLE_INTERNO;
export type ConclusaoControleInterno = 'FAVORAVEL' | 'COM_APONTAMENTOS';
const ROTULO: Record<ConclusaoControleInterno, string> = { FAVORAVEL: 'Favorável', COM_APONTAMENTOS: 'Com apontamentos' };

const esc = (s: unknown) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);

/** Valida a manifestação do controle interno (regra pura). */
export function validarManifestacao(body: any): { ok: true; conclusao: ConclusaoControleInterno; texto: string; apontamentos: string } | { ok: false; erro: string } {
  const conclusao = String(body?.conclusao ?? '').toUpperCase() as ConclusaoControleInterno;
  if (conclusao !== 'FAVORAVEL' && conclusao !== 'COM_APONTAMENTOS') return { ok: false, erro: 'Escolha: favorável ou com apontamentos.' };
  const apontamentos = String(body?.apontamentos ?? '').trim().slice(0, 20000);
  if (conclusao === 'COM_APONTAMENTOS' && apontamentos.length < 10) return { ok: false, erro: 'Descreva os apontamentos.' };
  return { ok: true, conclusao, texto: String(body?.texto ?? '').trim().slice(0, 20000), apontamentos };
}

/**
 * CONTROLE INTERNO (opcional por órgão — Entrega 3B; decisão 3 do dono). Com
 * `controle_interno_ativo` na configuração, a etapa aparece entre o parecer e
 * a publicação: manifestação favorável ou com apontamentos, feita aqui
 * (assinada por quem tem o papel CONTROLE_INTERNO) ou anexada. É AVISO, não
 * bloqueio (a peça não é obrigatória para publicar). Desativado: a leitura
 * responde `ativo: false` (a etapa não aparece) e a escrita, 409.
 */
@Injectable()
export class ControleInternoTelaService {
  constructor(
    private readonly faseInterna: FaseInternaService,
    private readonly minutas: MinutasTelaService,
    private readonly pecas: PecasFaseInternaService,
    private readonly tarefas: TarefasService,
    private readonly parecer: ParecerTelaService,
  ) {}

  async obter(licitacaoId: string, ator: Ator) {
    const lic = await this.minutas.licitacao(licitacaoId);
    // F1: o controle interno ligado vem do modelo de fluxo do processo
    if (!(await this.tarefas.controleInternoAtivoNoProcesso(licitacaoId))) {
      return { ativo: false, licitacao: { id: lic.id, numero_processo: lic.numero_processo, objeto: lic.objeto, fase: lic.fase } };
    }
    const instrucao = await this.faseInterna.getInstrucao(licitacaoId);
    const doc = await this.minutas.docAtual(licitacaoId, MCI);
    const pj = instrucao.itens.find((i) => i.tipo === 'PJ') ?? null;
    const pessoa = await this.parecer.pessoa(ator, lic.orgao_id);
    return {
      ativo: true,
      licitacao: { id: lic.id, numero_processo: lic.numero_processo, objeto: lic.objeto, fase: lic.fase, fase_interna: ehFaseInterna(lic.fase) },
      instrucao: instrucao.itens.find((i) => i.tipo === 'MCI') ?? null,
      peca: this.minutas.resumoPeca(doc),
      manifestacao: doc?.dados_estruturados?._manifestacao ?? null,
      parecer: pj,
      pode_manifestar: !!pessoa?.papeis.includes(PapelFaseInterna.CONTROLE_INTERNO),
      aviso: 'A manifestação do controle interno é AVISO, não bloqueio: a publicação não depende dela (o órgão pode torná-la obrigatória na Entrega 4/5).',
    };
  }

  /** Manifestação feita aqui: gera a peça MCI e a assina pelo emissor (papel CONTROLE_INTERNO). */
  async manifestar(licitacaoId: string, body: any, ator: Ator, autor: Autor, rede: { ip?: string; userAgent?: string }) {
    const lic = await this.minutas.licitacao(licitacaoId);
    if (!(await this.tarefas.controleInternoAtivoNoProcesso(licitacaoId))) throw new ConflictException('O controle interno está desativado para este órgão.');
    if (!ehFaseInterna(lic.fase)) throw new ConflictException('A fase interna foi encerrada.');
    const emissor = await this.parecer.exigirPapel(ator, lic.orgao_id, PapelFaseInterna.CONTROLE_INTERNO, 'se manifesta pelo controle interno');
    const v = validarManifestacao(body);
    if (!v.ok) throw new BadRequestException(v.erro);
    const atual = await this.minutas.docAtual(licitacaoId, MCI);
    if (atual?.status === StatusDocumento.AGUARDANDO_ASSINATURA) throw new ConflictException('A manifestação já está em assinatura.');
    const data = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'long', year: 'numeric' });
    const html =
      `<p>Processo Administrativo nº ${esc(lic.numero_processo)} — ${esc(lic.objeto)}.</p>` +
      (v.texto ? `<p>${esc(v.texto)}</p>` : '<p>A unidade de controle interno examinou a instrução do processo quanto à regularidade formal.</p>') +
      (v.apontamentos ? `<p><strong>Apontamentos.</strong> ${esc(v.apontamentos)}</p>` : '') +
      `<p><strong>Conclusão:</strong> manifestação ${ROTULO[v.conclusao].toUpperCase()}.</p><p>${esc(data)}.</p><p>${esc(emissor.nome)}${emissor.cargo ? ` — ${esc(emissor.cargo)}` : ''}</p>`;
    await this.minutas.gravarPecaGerada(licitacaoId, MCI, { manifestacao: html }, 'Manifestação do controle interno', autor, {
      extras: { _manifestacao: { conclusao: v.conclusao, apontamentos: v.apontamentos || null, por_nome: autor.nome, em: new Date().toISOString() } },
      log: `Manifestação do controle interno (${ROTULO[v.conclusao]})`,
      dadosLog: { conclusao: v.conclusao },
    });
    await this.pecas.enviarEAssinarComoEmissor(licitacaoId, MCI, ator, emissor.cargo || 'Controle interno', rede);
    return this.obter(licitacaoId, ator);
  }
}
