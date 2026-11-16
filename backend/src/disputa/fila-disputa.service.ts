import { AtoLicitacao } from '../licitacoes/transicoes/transicoes.tipos';
import { TransicoesService } from '../licitacoes/transicoes/transicoes.service';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SessaoDisputa, StatusSessao } from '../sessao/entities/sessao-disputa.entity';
import { EventoSessao, TipoEvento } from '../sessao/entities/evento-sessao.entity';
import { atorSistema, type AtorTransicao } from '../licitacoes/transicoes/transicoes.tipos';
import { DisputaService } from './disputa.service';
import { DisputaGateway } from './disputa.gateway';
import { BaseLance } from './modelo-lance';
import { erroConfiguracaoFila, proximaAcaoDaFila } from './fila-disputa.regras';

const STATUS_SEM_FILA = [StatusSessao.SUSPENSA, StatusSessao.ENCERRADA, StatusSessao.CANCELADA];

/**
 * FILA AUTOMÁTICA DE LOTES/ITENS (dono, 09/11/2026): a pregoeira liga a fila
 * com o máximo de unidades simultâneas e o aviso prévio; o relógio da disputa
 * (a cada segundo) aplica `proximaAcaoDaFila` — anuncia, abre, conclui.
 */
@Injectable()
export class FilaDisputaService {
  private readonly logger = new Logger(FilaDisputaService.name);
  private readonly ocupadas = new Set<string>();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly disputa: DisputaService,
    private readonly gateway: DisputaGateway,
    private readonly transicoes: TransicoesService,
  ) {}

  async estado(sessaoId: string) {
    const s = await this.ds.getRepository(SessaoDisputa).findOne({ where: { id: sessaoId } });
    if (!s) throw new BadRequestException('Sessão não encontrada');
    const { aguardando, emDisputa } = await this.unidades(s);
    return {
      ativa: s.fila_ativa,
      maxSimultaneos: s.fila_max_simultaneos,
      avisoMinutos: s.fila_aviso_minutos,
      proximaUnidadeId: s.fila_proxima_unidade_id,
      proximaAberturaEm: s.fila_proxima_abertura_em,
      aguardando: aguardando.length,
      emDisputa,
    };
  }

  async ligar(sessaoId: string, cfg: { maxSimultaneos?: unknown; avisoMinutos?: unknown }, ator: AtorTransicao & { nome?: string | null }) {
    const erro = erroConfiguracaoFila(cfg.maxSimultaneos, cfg.avisoMinutos ?? 0);
    if (erro) throw new BadRequestException(erro);
    const s = await this.ds.getRepository(SessaoDisputa).findOne({ where: { id: sessaoId } });
    if (!s) throw new BadRequestException('Sessão não encontrada');
    if (STATUS_SEM_FILA.includes(s.status)) throw new BadRequestException('A fila não pode ser ligada com a sessão suspensa ou encerrada.');
    const max = Number(cfg.maxSimultaneos);
    const aviso = Number(cfg.avisoMinutos ?? 0);
    // Nenhuma unidade aberta ainda: confere AGORA se os lances podem começar (ex.: inversão de fases com
    // habilitação pendente). Antes, a recusa vinha depois de a fila já estar gravada como ligada — ela
    // ficava tentando a cada segundo e abria os itens sozinha quando a pendência sumia (pregão 2026/00073).
    const { aguardando, total } = await this.unidades(s);
    if (aguardando.length > 0 && aguardando.length === total) {
      // Só enquanto a licitação ainda está na análise das propostas: "Concluir análise" já a leva a
      // EM_DISPUTA, e aí a conferência recusava a fila com "precisa estar na fase de análise de
      // propostas" — a fila não ligava em pregão nenhum sem inversão (ensaio 2026/00075, 10/11/2026)
      const [lic] = await this.ds.query(`SELECT fase::text AS fase FROM licitacoes WHERE id = $1`, [s.licitacao_id]);
      if (lic?.fase === 'ANALISE_PROPOSTAS') await this.transicoes.verificar(s.licitacao_id, AtoLicitacao.INICIAR_DISPUTA, { ator });
    }
    const repo = this.ds.getRepository(SessaoDisputa);
    await repo.update(sessaoId, { fila_ativa: true, fila_max_simultaneos: max, fila_aviso_minutos: aviso, fila_proxima_unidade_id: null, fila_proxima_abertura_em: null });
    try {
      await this.processar({ ...s, fila_ativa: true, fila_max_simultaneos: max, fila_aviso_minutos: aviso, fila_proxima_unidade_id: null, fila_proxima_abertura_em: null } as SessaoDisputa, ator);
    } catch (e) {
      // A primeira abertura foi recusada: a fila não fica ligada pela metade
      await repo.update(sessaoId, { fila_ativa: false, fila_proxima_unidade_id: null, fila_proxima_abertura_em: null });
      throw e;
    }
    await this.mensagem(
      sessaoId,
      `Fila automática ligada: até ${max} ${max === 1 ? 'unidade' : 'unidades'} em disputa ao mesmo tempo, na ordem da numeração` +
        (aviso ? `, com aviso prévio de ${aviso} min antes de cada abertura.` : ', abrindo assim que houver vaga.'),
    );
    return this.estado(sessaoId);
  }

  async desligar(sessaoId: string) {
    await this.ds.getRepository(SessaoDisputa).update(sessaoId, { fila_ativa: false, fila_proxima_unidade_id: null, fila_proxima_abertura_em: null });
    await this.mensagem(sessaoId, 'Fila automática desligada: a abertura das próximas unidades volta a ser feita pela pregoeira.');
    return this.estado(sessaoId);
  }

  /** Chamado pelo relógio a cada segundo para as sessões com a fila ligada. */
  async processarSessoesComFila(): Promise<void> {
    const sessoes = await this.ds.getRepository(SessaoDisputa).find({ where: { fila_ativa: true } });
    for (const s of sessoes) {
      if (STATUS_SEM_FILA.includes(s.status)) continue;
      await this.processar(s, atorSistema('fila-automatica')).catch((e) => this.logger.warn(`Fila da sessão ${s.id}: ${e?.message ?? e}`));
    }
  }

  private async processar(s: SessaoDisputa, ator: AtorTransicao): Promise<void> {
    if (this.ocupadas.has(s.id)) return;
    this.ocupadas.add(s.id);
    try {
      const { aguardando, emDisputa, rotulo } = await this.unidades(s);
      const acao = proximaAcaoDaFila({
        maxSimultaneos: s.fila_max_simultaneos ?? 1,
        avisoMinutos: s.fila_aviso_minutos ?? 0,
        emDisputa,
        aguardando: aguardando.map((u) => u.id),
        proxima: s.fila_proxima_unidade_id && s.fila_proxima_abertura_em ? { unidadeId: s.fila_proxima_unidade_id, em: new Date(s.fila_proxima_abertura_em) } : null,
        agora: new Date(),
      });
      const nome = (id: string) => `${rotulo} ${aguardando.find((u) => u.id === id)?.numero ?? ''}`.trim();
      if (acao.tipo === 'CONCLUIR') {
        await this.ds.getRepository(SessaoDisputa).update(s.id, { fila_ativa: false, fila_proxima_unidade_id: null, fila_proxima_abertura_em: null });
        await this.mensagem(s.id, 'Fila automática concluída: todas as unidades já passaram pela disputa.');
      } else if (acao.tipo === 'AVISAR') {
        await this.ds.getRepository(SessaoDisputa).update(s.id, { fila_proxima_unidade_id: acao.unidadeId, fila_proxima_abertura_em: acao.em });
        const hora = acao.em.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
        await this.mensagem(s.id, `Aviso: o ${nome(acao.unidadeId)} abre para lances às ${hora} (em ${s.fila_aviso_minutos} min).`);
      } else if (acao.tipo === 'INICIAR') {
        const r = await this.disputa.iniciarDisputa(s.id, acao.ids, ator);
        await this.ds.getRepository(SessaoDisputa).update(s.id, { fila_proxima_unidade_id: null, fila_proxima_abertura_em: null });
        await this.gateway.emitirItensPorVisao(s.id, s.licitacao_id, 'itens_iniciados', { itensIniciados: r.itensIniciados });
        await this.mensagem(s.id, `Aberto(s) para lances pela fila automática: ${acao.ids.map(nome).join(', ')}.`);
      }
    } finally {
      this.ocupadas.delete(s.id);
    }
  }

  /** Unidades da sessão: aguardando (na ordem da numeração) e quantas estão em disputa. */
  private async unidades(s: SessaoDisputa): Promise<{ aguardando: Array<{ id: string; numero: number }>; emDisputa: number; total: number; rotulo: string }> {
    const params = await this.disputa.parametrosDaSessao(s.id);
    const porLote = params.baseLance === BaseLance.TOTAL_LOTE;
    const linhas: Array<{ id: string; numero: number; st: string | null }> = porLote
      ? await this.ds.query(`SELECT id::text AS id, numero, status_disputa::text AS st FROM lotes_licitacao WHERE licitacao_id = $1 ORDER BY numero`, [s.licitacao_id])
      : await this.ds.query(
          `SELECT id::text AS id, numero_item AS numero, status_disputa::text AS st FROM itens_licitacao
            WHERE licitacao_id = $1 AND status::text NOT IN ('DESERTO','FRACASSADO','CANCELADO') ORDER BY numero_item`,
          [s.licitacao_id],
        );
    return {
      aguardando: linhas.filter((l) => !l.st || l.st === 'AGUARDANDO').map((l) => ({ id: l.id, numero: Number(l.numero) })),
      emDisputa: linhas.filter((l) => l.st === 'EM_DISPUTA' || l.st === 'TEMPO_ALEATORIO').length,
      total: linhas.length,
      rotulo: porLote ? 'Lote' : 'Item',
    };
  }

  /** Mensagem do sistema no chat da sessão (fica na ata) — chega às salas na hora. */
  private async mensagem(sessaoId: string, conteudo: string) {
    const repo = this.ds.getRepository(EventoSessao);
    const ev = await repo.save(repo.create({ sessao_id: sessaoId, tipo: TipoEvento.MENSAGEM_SISTEMA, descricao: conteudo, usuario_nome: 'SISTEMA', is_sistema: true }));
    this.gateway.server?.to(`sessao:${sessaoId}`).emit('nova_mensagem', { id: ev?.id, tipo: 'SISTEMA', remetente: 'SISTEMA', conteudo, dataHora: ev?.created_at ?? new Date() });
  }
}
