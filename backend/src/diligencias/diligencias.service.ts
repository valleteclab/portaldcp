import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import type { Ator } from '../auth/acesso/ator';
import { orgaoComPrazosDeTeste } from '../common/prazos/prazos-de-teste';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { PrioridadeNotificacao, TipoNotificacao } from '../notificacoes/entities/notificacao.entity';
import { EventoSessao, TipoEvento } from '../sessao/entities/evento-sessao.entity';
import { DiligenciaAnexo, DiligenciaLicitante } from './entities/diligencia.entity';
import {
  FASES_DILIGENCIA,
  PRAZO_MINIMO_DILIGENCIA_GERAL_HORAS,
  ResultadoDiligencia,
  StatusDiligenciaGeral,
  motivoAnexoInvalido,
  motivoNaoAbre,
  motivoNaoEncerra,
  motivoNaoProrroga,
  motivoNaoResponde,
  prazoProrrogado,
  statusEfetivo,
} from './regras-diligencia';

export interface ArquivoRecebido {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Prazo mínimo nos órgãos de teste da homologação: 3 minutos (para ensaiar o vencimento). */
const MINIMO_TESTE_HORAS = 0.05;

@Injectable()
export class DiligenciasService {
  private readonly logger = new Logger(DiligenciasService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly moduleRef: ModuleRef,
    @Optional() private readonly notificacoes?: NotificacoesService,
  ) {}

  // ---------------------------------------------------------------------------
  // Leitura
  // ---------------------------------------------------------------------------

  private apresentar(d: DiligenciaLicitante, anexos: DiligenciaAnexo[], nome: string | null) {
    return {
      id: d.id,
      licitacaoId: d.licitacao_id,
      unidadeId: d.unidade_id,
      unidadeRotulo: d.unidade_rotulo,
      fornecedorId: d.fornecedor_id,
      fornecedorNome: nome,
      fase: d.fase,
      pedido: d.pedido,
      prazoHoras: Number(d.prazo_horas),
      abertaEm: d.aberta_em,
      prazoAte: d.prazo_ate,
      status: statusEfetivo(d),
      // o licitante ainda pode anexar, trocar e atualizar a resposta (prazo correndo e não encerrada)
      podeResponder: !motivoNaoResponde(d),
      resposta: d.resposta,
      respondidaEm: d.respondida_em,
      resultado: d.resultado,
      resultadoMotivo: d.resultado_motivo,
      encerradaEm: d.encerrada_em,
      prorrogacoes: d.prorrogacoes ?? [],
      abertaPor: d.aberta_por_nome,
      anexos: anexos
        .filter((a) => a.diligencia_id === d.id)
        .map((a) => ({ id: a.id, autor: a.autor, autorNome: a.autor_nome, nome: a.arquivo_nome, tamanho: a.arquivo_tamanho, descricao: a.descricao, enviadoEm: a.created_at })),
    };
  }

  /** Diligências da licitação: todas (órgão) ou só as do licitante (`fornecedorId`). */
  async listar(licitacaoId: string, filtro: { fornecedorId?: string | null; unidadeId?: string | null } = {}) {
    const q = this.ds.getRepository(DiligenciaLicitante).createQueryBuilder('d').where('d.licitacao_id = :l', { l: licitacaoId });
    if (filtro.fornecedorId) q.andWhere('d.fornecedor_id = :f', { f: filtro.fornecedorId });
    if (filtro.unidadeId) q.andWhere('(d.unidade_id = :u OR d.unidade_id IS NULL)', { u: filtro.unidadeId });
    const ds = await q.orderBy('d.created_at', 'DESC').getMany();
    if (!ds.length) return [];
    const anexos = await this.ds
      .getRepository(DiligenciaAnexo)
      .createQueryBuilder('a')
      .where('a.diligencia_id IN (:...ids)', { ids: ds.map((d) => d.id) })
      .orderBy('a.created_at', 'ASC')
      .getMany();
    const nomes: Array<{ id: string; razao_social: string }> = await this.ds.query(
      `SELECT id::text AS id, razao_social FROM fornecedores WHERE id::text = ANY($1::text[])`,
      [[...new Set(ds.map((d) => d.fornecedor_id))]],
    );
    const nomeDe = new Map(nomes.map((n) => [n.id, n.razao_social]));
    return ds.map((d) => this.apresentar(d, anexos, nomeDe.get(d.fornecedor_id) ?? null));
  }

  /** Licitantes a quem se pode dirigir a diligência (proposta válida) — só depois dos lances. */
  async licitantes(licitacaoId: string): Promise<Array<{ id: string; nome: string }>> {
    const lic = await this.licitacao(this.ds.manager, licitacaoId);
    const bloqueio = motivoNaoAbre({ fase: lic.fase, modalidade: lic.modalidade, pedido: 'x'.repeat(30), prazoHoras: 24 });
    if (bloqueio) return [];
    return this.ds.query(
      `SELECT DISTINCT f.id::text AS id, f.razao_social AS nome
         FROM propostas p JOIN fornecedores f ON f.id = p.fornecedor_id
        WHERE p.licitacao_id = $1 AND p.status::text NOT IN ('RASCUNHO', 'CANCELADA')
        ORDER BY f.razao_social`,
      [licitacaoId],
    );
  }

  async donoDaDiligencia(id: string): Promise<{ licitacaoId: string; fornecedorId: string } | null> {
    const [d] = await this.ds.query(`SELECT licitacao_id::text AS l, fornecedor_id::text AS f FROM diligencias_licitante WHERE id::text = $1`, [id]);
    return d ? { licitacaoId: d.l, fornecedorId: d.f } : null;
  }

  async donoDoAnexo(anexoId: string): Promise<{ licitacaoId: string; fornecedorId: string; diligenciaId: string } | null> {
    const [d] = await this.ds.query(
      `SELECT d.licitacao_id::text AS l, d.fornecedor_id::text AS f, d.id::text AS id
         FROM diligencias_licitante_anexos a JOIN diligencias_licitante d ON d.id = a.diligencia_id WHERE a.id::text = $1`,
      [anexoId],
    );
    return d ? { licitacaoId: d.l, fornecedorId: d.f, diligenciaId: d.id } : null;
  }

  async arquivo(anexoId: string): Promise<{ conteudo: Buffer; mime: string; nome: string }> {
    const a = await this.ds
      .getRepository(DiligenciaAnexo)
      .createQueryBuilder('a')
      .addSelect('a.arquivo_conteudo')
      .where('a.id = :id', { id: anexoId })
      .getOne();
    if (!a) throw new NotFoundException('Anexo não encontrado');
    return { conteudo: a.arquivo_conteudo, mime: a.arquivo_mime || 'application/octet-stream', nome: a.arquivo_nome };
  }

  // ---------------------------------------------------------------------------
  // Atos do órgão
  // ---------------------------------------------------------------------------

  async abrir(
    licitacaoId: string,
    dados: { fornecedorId: string; unidadeId?: string | null; pedido: string; prazoHoras: number; fase?: string | null },
    ator: Ator,
  ) {
    return this.ds.transaction(async (m) => {
      const lic = await this.licitacao(m, licitacaoId);
      const minimo = orgaoComPrazosDeTeste(lic.orgao_id) ? MINIMO_TESTE_HORAS : PRAZO_MINIMO_DILIGENCIA_GERAL_HORAS;
      const recusa = motivoNaoAbre({ fase: lic.fase, modalidade: lic.modalidade, pedido: dados.pedido, prazoHoras: dados.prazoHoras, minimoHoras: minimo });
      if (recusa) throw new BadRequestException(recusa);
      if (lic.situacao && lic.situacao !== 'ATIVA') throw new ConflictException('A licitação não está ativa.');
      const [p] = await m.query(
        `SELECT 1 FROM propostas WHERE licitacao_id = $1 AND fornecedor_id::text = $2 AND status::text NOT IN ('RASCUNHO', 'CANCELADA') LIMIT 1`,
        [licitacaoId, dados.fornecedorId],
      );
      if (!p) throw new BadRequestException('O licitante indicado não tem proposta nesta licitação.');
      let rotulo: string | null = null;
      if (dados.unidadeId) {
        const [u] = await m.query(
          `SELECT 'Item ' || numero_item AS r FROM itens_licitacao WHERE id::text = $1 AND licitacao_id = $2
           UNION ALL SELECT 'Lote ' || numero AS r FROM lotes_licitacao WHERE id::text = $1 AND licitacao_id = $2`,
          [dados.unidadeId, licitacaoId],
        );
        if (!u) throw new BadRequestException('O item ou lote indicado não é desta licitação.');
        rotulo = u.r;
      }
      const agora = new Date();
      const fase = (FASES_DILIGENCIA as readonly string[]).includes(String(dados.fase)) ? String(dados.fase) : 'OUTRA';
      const nomeAtor = await this.nomeDoAtor(m, ator);
      const d = await m.save(
        m.create(DiligenciaLicitante, {
          licitacao_id: licitacaoId,
          sessao_id: (await this.sessao(m, licitacaoId))?.id ?? null,
          unidade_id: dados.unidadeId || null,
          unidade_rotulo: rotulo,
          fornecedor_id: dados.fornecedorId,
          fase,
          pedido: dados.pedido.trim().slice(0, 4000),
          prazo_horas: Number(dados.prazoHoras),
          aberta_em: agora,
          prazo_ate: new Date(agora.getTime() + Number(dados.prazoHoras) * 3_600_000),
          status: StatusDiligenciaGeral.ABERTA,
          prorrogacoes: [],
          aberta_por_id: ator.usuarioId ?? ator.id,
          aberta_por_nome: nomeAtor,
        }),
      );
      const nome = await this.nomeFornecedor(m, d.fornecedor_id);
      await this.evento(m, d, TipoEvento.MENSAGEM_SISTEMA, `Diligência aberta para ${nome}${rotulo ? ` (${rotulo})` : ''} — art. 64 da Lei 14.133/2021. Pedido: ${d.pedido} Prazo: até ${this.dataHora(d.prazo_ate)}.`, nomeAtor);
      this.notificar(d, 'Diligência: o pregoeiro pediu documento ou esclarecimento', `${d.pedido} Prazo: até ${this.dataHora(d.prazo_ate)}. Responda pela sala da licitação.`);
      this.avisarSala(d);
      return this.apresentar(d, [], nome);
    });
  }

  async prorrogar(id: string, dados: { horas: number; motivo: string }, ator: Ator) {
    return this.ds.transaction(async (m) => {
      const d = await this.travar(m, id);
      const lic = await this.licitacao(m, d.licitacao_id);
      const recusa = motivoNaoProrroga(d, dados.horas, dados.motivo, orgaoComPrazosDeTeste(lic.orgao_id) ? MINIMO_TESTE_HORAS : 1);
      if (recusa) throw new BadRequestException(recusa);
      const nomeAtor = await this.nomeDoAtor(m, ator);
      d.prazo_ate = prazoProrrogado(d.prazo_ate, dados.horas);
      d.prorrogacoes = [...(d.prorrogacoes ?? []), { em: new Date().toISOString(), horas: Number(dados.horas), motivo: dados.motivo.trim().slice(0, 500), por: nomeAtor }];
      await m.save(d);
      const nome = await this.nomeFornecedor(m, d.fornecedor_id);
      await this.evento(m, d, TipoEvento.MENSAGEM_SISTEMA, `Prazo da diligência de ${nome}${d.unidade_rotulo ? ` (${d.unidade_rotulo})` : ''} prorrogado até ${this.dataHora(d.prazo_ate)}. Motivo: ${dados.motivo.trim()}`, nomeAtor);
      this.notificar(d, 'Diligência: prazo prorrogado', `Novo prazo: até ${this.dataHora(d.prazo_ate)}.`);
      this.avisarSala(d);
      return this.apresentar(d, await this.anexosDe(m, d.id), nome);
    });
  }

  async encerrar(id: string, dados: { resultado: string; motivo: string }, ator: Ator) {
    return this.ds.transaction(async (m) => {
      const d = await this.travar(m, id);
      const recusa = motivoNaoEncerra(d, dados.resultado, dados.motivo);
      if (recusa) throw new BadRequestException(recusa);
      const nomeAtor = await this.nomeDoAtor(m, ator);
      d.status = StatusDiligenciaGeral.ENCERRADA;
      d.resultado = dados.resultado;
      d.resultado_motivo = dados.motivo.trim().slice(0, 4000);
      d.encerrada_em = new Date();
      d.encerrada_por_nome = nomeAtor;
      await m.save(d);
      const nome = await this.nomeFornecedor(m, d.fornecedor_id);
      const rotulo = dados.resultado === ResultadoDiligencia.ATENDIDA ? 'ATENDIDA' : 'NÃO ATENDIDA';
      await this.evento(m, d, TipoEvento.MENSAGEM_SISTEMA, `Diligência de ${nome}${d.unidade_rotulo ? ` (${d.unidade_rotulo})` : ''} encerrada: ${rotulo}. ${d.resultado_motivo}`, nomeAtor);
      this.notificar(d, `Diligência encerrada: ${rotulo.toLowerCase()}`, d.resultado_motivo ?? '');
      this.avisarSala(d);
      return this.apresentar(d, await this.anexosDe(m, d.id), nome);
    });
  }

  // ---------------------------------------------------------------------------
  // Anexos (os dois lados) e resposta do licitante
  // ---------------------------------------------------------------------------

  async anexar(id: string, autor: 'FORNECEDOR' | 'ORGAO', arquivo: ArquivoRecebido | null, descricao: string | null, ator: Ator) {
    return this.ds.transaction(async (m) => {
      const d = await this.travar(m, id);
      if (autor === 'FORNECEDOR') {
        const recusa = motivoNaoResponde(d);
        if (recusa) throw new ConflictException(recusa);
      } else if (d.status === StatusDiligenciaGeral.ENCERRADA) {
        throw new ConflictException('Esta diligência já foi encerrada.');
      }
      const existentes = await this.anexosDe(m, d.id);
      const invalido = motivoAnexoInvalido(arquivo ? { nome: arquivo.originalname, tamanho: arquivo.size } : null, existentes.filter((a) => a.autor === autor).length);
      if (invalido) throw new BadRequestException(invalido);
      const nomeAutor = autor === 'ORGAO' ? await this.nomeDoAtor(m, ator) : await this.nomeFornecedor(m, d.fornecedor_id);
      const a = await m.save(
        m.create(DiligenciaAnexo, {
          diligencia_id: d.id,
          autor,
          autor_nome: nomeAutor,
          arquivo_nome: arquivo!.originalname.replace(/[^\w.\- ()À-ú]/g, '_').slice(0, 200),
          arquivo_mime: arquivo!.mimetype,
          arquivo_tamanho: arquivo!.size,
          arquivo_sha256: createHash('sha256').update(arquivo!.buffer).digest('hex'),
          arquivo_conteudo: arquivo!.buffer,
          descricao: (descricao ?? '').trim().slice(0, 300) || null,
          // hora da aplicação (Brasília): o padrão do banco grava em UTC e a tela mostrava 3 h a mais
          created_at: new Date(),
        }),
      );
      await this.evento(
        m,
        d,
        TipoEvento.DOCUMENTO_HABILITACAO_ENVIADO,
        `Anexo em diligência${d.unidade_rotulo ? ` (${d.unidade_rotulo})` : ''} — ${autor === 'ORGAO' ? 'juntado pelo órgão' : 'enviado pelo licitante'}: ${a.arquivo_nome} (SHA-256 ${a.arquivo_sha256.slice(0, 12)}…).`,
        nomeAutor,
      );
      this.avisarSala(d);
      return { id: a.id, autor: a.autor, autorNome: a.autor_nome, nome: a.arquivo_nome, tamanho: a.arquivo_tamanho, descricao: a.descricao, enviadoEm: a.created_at };
    });
  }

  async removerAnexo(anexoId: string, autor: 'FORNECEDOR' | 'ORGAO') {
    return this.ds.transaction(async (m) => {
      const a = await m.findOne(DiligenciaAnexo, { where: { id: anexoId } });
      if (!a) throw new NotFoundException('Anexo não encontrado');
      if (a.autor !== autor) throw new ConflictException('Só quem enviou o anexo pode removê-lo.');
      const d = await this.travar(m, a.diligencia_id);
      if (autor === 'FORNECEDOR') {
        const recusa = motivoNaoResponde(d);
        if (recusa) throw new ConflictException(recusa);
      } else if (d.status === StatusDiligenciaGeral.ENCERRADA) {
        throw new ConflictException('Esta diligência já foi encerrada.');
      }
      await m.delete(DiligenciaAnexo, { id: anexoId });
      await this.evento(
        m,
        d,
        TipoEvento.DOCUMENTO_HABILITACAO_ENVIADO,
        `Anexo removido da diligência${d.unidade_rotulo ? ` (${d.unidade_rotulo})` : ''} dentro do prazo — ${autor === 'ORGAO' ? 'pelo órgão' : 'pelo licitante'}: ${a.arquivo_nome} (SHA-256 ${a.arquivo_sha256.slice(0, 12)}…).`,
        a.autor_nome,
      );
      this.avisarSala(d);
      return { removido: true };
    });
  }

  async responder(id: string, resposta: string) {
    return this.ds.transaction(async (m) => {
      const d = await this.travar(m, id);
      const recusa = motivoNaoResponde(d);
      if (recusa) throw new ConflictException(recusa);
      const texto = (resposta ?? '').trim().slice(0, 4000);
      const anexos = await this.anexosDe(m, d.id);
      if (!texto && !anexos.some((a) => a.autor === 'FORNECEDOR')) throw new BadRequestException('Escreva a resposta ou anexe ao menos um documento antes de responder.');
      const atualizacao = d.status === StatusDiligenciaGeral.RESPONDIDA;
      d.status = StatusDiligenciaGeral.RESPONDIDA;
      d.resposta = texto || null;
      d.respondida_em = new Date();
      await m.save(d);
      const nome = await this.nomeFornecedor(m, d.fornecedor_id);
      const n = anexos.filter((a) => a.autor === 'FORNECEDOR').length;
      await this.evento(m, d, TipoEvento.MENSAGEM_SISTEMA, `${nome} ${atualizacao ? 'atualizou a resposta da' : 'respondeu a'} diligência${d.unidade_rotulo ? ` (${d.unidade_rotulo})` : ''}: ${n} anexo(s).${texto ? ` Resposta: ${texto}` : ''}`, nome);
      this.avisarSala(d);
      return this.apresentar(d, anexos, nome);
    });
  }

  // ---------------------------------------------------------------------------
  // Apoio
  // ---------------------------------------------------------------------------

  private async licitacao(m: EntityManager, id: string): Promise<{ fase: string; modalidade: string; situacao: string | null; orgao_id: string; numero_processo: string | null }> {
    const [l] = await m.query(
      `SELECT fase::text AS fase, modalidade::text AS modalidade, situacao::text AS situacao, orgao_id::text AS orgao_id, numero_processo FROM licitacoes WHERE id::text = $1`,
      [id],
    );
    if (!l) throw new NotFoundException('Licitação não encontrada');
    return l;
  }

  private async sessao(m: EntityManager, licitacaoId: string): Promise<{ id: string } | null> {
    const [s] = await m.query(`SELECT id FROM sessoes_disputa WHERE licitacao_id = $1 ORDER BY created_at DESC LIMIT 1`, [licitacaoId]);
    return s ?? null;
  }

  private async travar(m: EntityManager, id: string): Promise<DiligenciaLicitante> {
    const d = await m.findOne(DiligenciaLicitante, { where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!d) throw new NotFoundException('Diligência não encontrada');
    return d;
  }

  private anexosDe(m: EntityManager, diligenciaId: string): Promise<DiligenciaAnexo[]> {
    return m.find(DiligenciaAnexo, { where: { diligencia_id: diligenciaId }, order: { created_at: 'ASC' } });
  }

  private async nomeFornecedor(m: EntityManager, id: string): Promise<string> {
    const [f] = await m.query(`SELECT razao_social FROM fornecedores WHERE id::text = $1`, [id]);
    return f?.razao_social ?? 'Licitante';
  }

  private async nomeDoAtor(m: EntityManager, ator: Ator): Promise<string> {
    if (ator.usuarioId) {
      const [u] = await m.query(`SELECT nome FROM usuarios WHERE id::text = $1`, [ator.usuarioId]);
      if (u?.nome) return u.nome;
    }
    return 'Pregoeiro/agente de contratação';
  }

  private dataHora(d: Date): string {
    return new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  private async evento(m: EntityManager, d: DiligenciaLicitante, tipo: TipoEvento, descricao: string, usuario: string | null): Promise<void> {
    const sessaoId = d.sessao_id ?? (await this.sessao(m, d.licitacao_id))?.id;
    if (!sessaoId) return; // dispensa sem sessão: o registro fica na própria diligência
    await m.save(
      m.create(EventoSessao, {
        sessao_id: sessaoId,
        tipo,
        descricao: descricao.slice(0, 4000),
        fornecedor_id: d.fornecedor_id,
        fornecedor_identificador: d.fornecedor_id,
        usuario_nome: usuario ?? 'SISTEMA',
        is_sistema: tipo === TipoEvento.MENSAGEM_SISTEMA,
        dados_adicionais: { origem: 'diligencia', diligencia_id: d.id, unidade_id: d.unidade_id },
      }),
    );
  }

  /** Avisa as telas abertas da sala (pregoeiro e licitante) para recarregarem as diligências. */
  private avisarSala(d: DiligenciaLicitante): void {
    if (!d.sessao_id) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DisputaGateway } = require('../disputa/disputa.gateway');
      const gw = this.moduleRef.get(DisputaGateway, { strict: false });
      gw?.server?.to(`sessao:${d.sessao_id}`).emit('diligencia_atualizada', { diligenciaId: d.id, unidadeId: d.unidade_id });
    } catch (e: any) {
      this.logger.debug(`Aviso da diligência não difundido: ${e?.message ?? e}`);
    }
  }

  private notificar(d: DiligenciaLicitante, titulo: string, mensagem: string): void {
    if (!this.notificacoes) return;
    void (async () => {
      try {
        const lic = await this.licitacao(this.ds.manager, d.licitacao_id);
        const [f] = await this.ds.query(`SELECT email FROM fornecedores WHERE id::text = $1`, [d.fornecedor_id]);
        await this.notificacoes!.criar({
          orgao_id: lic.orgao_id,
          usuario_id: d.fornecedor_id,
          usuario_email: f?.email ?? undefined,
          tipo: TipoNotificacao.SISTEMA,
          titulo: `${titulo}${lic.numero_processo ? ` — ${lic.numero_processo}` : ''}`,
          mensagem: mensagem.slice(0, 1000),
          prioridade: PrioridadeNotificacao.ALTA,
          entidade_tipo: 'licitacao',
          entidade_id: d.licitacao_id,
          link: `/fornecedor/licitacoes/${d.licitacao_id}/sala`,
          enviar_email: !!f?.email,
          metadata: { origem: 'diligencia', diligencia_id: d.id },
        });
      } catch (e: any) {
        this.logger.warn(`Notificação da diligência não enviada (${d.id}): ${e?.message ?? e}`);
      }
    })();
  }
}
