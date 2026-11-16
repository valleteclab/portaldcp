import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { EmailService } from '../../email/email.service';
import { WhatsAppService } from '../../whatsapp/whatsapp.service';
import { WorkflowHistorico } from '../workflow.entities';
import { EventoFluxo, OuvinteFluxo, RegistroNos } from '../nos/executor-no';
import { TeamsService, DadosCardAviso } from './teams.service';
import { montarMensagemChegada } from './mensagens';
import { CanalAviso, ConfigAvisos, TipoDestinatario } from './destinatarios';

export interface DestinatarioResolvido {
  email: string | null;
  telefone: string | null;
}

export interface EnvioAviso {
  orgaoId: string;
  destinatarios: DestinatarioResolvido[];
  canais: CanalAviso[];
  teamsCanalId?: string | null;
  mensagem: string;
  card: DadosCardAviso;
  /** Para registrar no histórico quando pular por falta de contato. */
  instanciaId: string;
}

const FRONTEND_URL = () => (process.env.FRONTEND_URL || 'https://www.portaldcp.com.br').replace(/\/$/, '');

/**
 * Ouvinte de `TAREFA_CRIADA`: avisa, na chegada da etapa, os responsáveis
 * pelos canais marcados em `acao.configuracao.avisos`. Também é o ponto
 * usado pelo scheduler de véspera de prazo e pelo executor do nó Notificar
 * — os três só diferem em QUEM avisar e QUANDO; o "como enviar" é só aqui.
 */
@Injectable()
export class AvisosService implements OuvinteFluxo, OnModuleInit {
  private readonly logger = new Logger(AvisosService.name);

  constructor(
    private readonly registro: RegistroNos,
    private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
    private readonly whatsappService: WhatsAppService,
    private readonly teamsService: TeamsService,
    @InjectRepository(WorkflowHistorico) private readonly historico: Repository<WorkflowHistorico>,
  ) {}

  onModuleInit() {
    this.registro.registrarOuvinte(this);
  }

  async aoEvento(evento: EventoFluxo): Promise<void> {
    if (evento.tipo !== 'TAREFA_CRIADA') return;
    const { ctx } = evento;
    const avisos = ctx.acao.configuracao?.avisos as ConfigAvisos | undefined;
    if (!avisos?.chegada || !avisos.canais?.length) return;

    const responsaveis = Array.isArray(ctx.tarefa.responsaveis) ? ctx.tarefa.responsaveis : [];
    const tipo = ctx.tarefa.responsavel_tipo as TipoDestinatario;
    const [destinatarios, label] = await Promise.all([
      this.resolverContatos(ctx.orgaoId, tipo, responsaveis, ctx.instancia.iniciado_por_id),
      this.resolverLabel(ctx.orgaoId, tipo, responsaveis),
    ]);

    const mensagem = montarMensagemChegada({ numero: ctx.instancia.numero, acaoNome: ctx.acao.nome, responsavelLabel: label, prazo: ctx.tarefa.prazo_em });
    await this.enviar({
      orgaoId: ctx.orgaoId,
      destinatarios,
      canais: avisos.canais,
      teamsCanalId: avisos.teams_canal_id,
      mensagem,
      instanciaId: ctx.instancia.id,
      card: {
        titulo: 'Processo aguarda providência',
        numero: ctx.instancia.numero,
        etapa: ctx.acao.nome,
        setor: label,
        prazo: ctx.tarefa.prazo_em ? ctx.tarefa.prazo_em.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null,
        link: ctx.processoId ? `${FRONTEND_URL()}/orgao/processo/${ctx.processoId}` : null,
      },
    });
  }

  /** Nome(s) para o texto do aviso: setor(es), pessoa(s) ou "o solicitante". */
  async resolverLabel(orgaoId: string, tipo: TipoDestinatario, ids: string[]): Promise<string> {
    if (tipo === 'SOLICITANTE') return 'o solicitante';
    if (!ids.length) return tipo === 'SETOR' ? 'o setor responsável' : 'o responsável';
    const tabela = tipo === 'SETOR' ? 'setores' : 'usuarios';
    const linhas: Array<{ nome: string }> = await this.dataSource.query(
      `SELECT nome FROM ${tabela} WHERE orgao_id::text = $1 AND id::text = ANY($2::text[])`,
      [orgaoId, ids],
    );
    const nomes = linhas.map((l) => l.nome).filter(Boolean);
    if (!nomes.length) return tipo === 'SETOR' ? 'o setor responsável' : 'o responsável';
    return nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
  }

  /** Contatos reais (e-mail/telefone) de quem deve receber — setor expande para os usuários ativos dele. */
  async resolverContatos(orgaoId: string, tipo: TipoDestinatario, ids: string[], solicitanteId: string | null): Promise<DestinatarioResolvido[]> {
    if (tipo === 'SOLICITANTE') {
      if (!solicitanteId) return [];
      const linhas: Array<{ email: string | null; telefone: string | null }> = await this.dataSource.query(
        `SELECT email, telefone FROM usuarios WHERE orgao_id::text = $1 AND id::text = $2 AND ativo = true`,
        [orgaoId, solicitanteId],
      );
      return linhas;
    }
    if (!ids.length) return [];
    if (tipo === 'USUARIO') {
      return this.dataSource.query(
        `SELECT email, telefone FROM usuarios WHERE orgao_id::text = $1 AND id::text = ANY($2::text[]) AND ativo = true`,
        [orgaoId, ids],
      );
    }
    // SETOR: todos os usuários ativos dos setores informados.
    return this.dataSource.query(
      `SELECT email, telefone FROM usuarios WHERE orgao_id::text = $1 AND setor_id::text = ANY($2::text[]) AND ativo = true`,
      [orgaoId, ids],
    );
  }

  /** Envia pelos canais marcados; falha de um canal/pessoa não impede os demais. */
  async enviar(dados: EnvioAviso): Promise<void> {
    const semContato: string[] = [];
    if (dados.canais.includes('WHATSAPP')) {
      for (const d of dados.destinatarios) {
        if (!d.telefone) { semContato.push('WHATSAPP'); continue; }
        try { await this.whatsappService.enviar(dados.orgaoId, { to: d.telefone, mensagem: dados.mensagem }); }
        catch (e) { this.logger.warn(`Aviso por WhatsApp falhou: ${(e as Error).message}`); }
      }
    }
    if (dados.canais.includes('EMAIL')) {
      for (const d of dados.destinatarios) {
        if (!d.email) { semContato.push('EMAIL'); continue; }
        try { await this.emailService.enviar(dados.orgaoId, { to: d.email, subject: dados.card.titulo, text: dados.mensagem }); }
        catch (e) { this.logger.warn(`Aviso por e-mail falhou: ${(e as Error).message}`); }
      }
    }
    if (dados.canais.includes('TEAMS') && dados.teamsCanalId) {
      await this.teamsService.enviarCard(dados.orgaoId, dados.teamsCanalId, dados.card);
    }
    if (semContato.length) {
      await this.historico.save(this.historico.create({
        instancia_id: dados.instanciaId,
        evento: 'AVISO_SEM_CONTATO',
        descricao: `Aviso não enviado por falta de contato: ${[...new Set(semContato)].join(', ')}`,
        ator_id: null,
        detalhes: { canais: semContato },
      }));
    }
  }
}
