import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AvisosService } from '../avisos/avisos.service';
import { montarMensagemNotificar } from '../avisos/mensagens';
import { ConfigNotificar } from '../avisos/destinatarios';
import { ContextoNo, ExecutorNo, RegistroNos } from './executor-no';

/**
 * Nó "Notificar": avisa os destinatários configurados em
 * `acao.configuracao.notificar` e segue — é `automatico` no catálogo, o
 * motor conclui a tarefa sozinho depois de `executarAutomatico` terminar.
 */
@Injectable()
export class NotificarExecutor implements ExecutorNo, OnModuleInit {
  readonly tipo = 'NOTIFICAR';
  private readonly logger = new Logger(NotificarExecutor.name);

  constructor(private readonly registro: RegistroNos, private readonly avisos: AvisosService) {}

  onModuleInit() {
    this.registro.registrarExecutor(this);
  }

  async executarAutomatico(ctx: ContextoNo): Promise<void> {
    const config = ctx.acao.configuracao?.notificar as ConfigNotificar | undefined;
    if (!config?.destinatarios?.length || !config.canais?.length) {
      this.logger.warn(`Nó Notificar sem configuração (ação ${ctx.acao.id}) — nada a enviar`);
      return;
    }
    const mensagem = montarMensagemNotificar({ numero: ctx.instancia.numero, acaoNome: ctx.acao.nome, mensagem: config.mensagem });
    const listas = await Promise.all(
      config.destinatarios.map((d) => this.avisos.resolverContatos(ctx.orgaoId, d.tipo, d.id ? [d.id] : [], ctx.instancia.iniciado_por_id)),
    );
    const destinatarios = listas.flat();
    await this.avisos.enviar({
      orgaoId: ctx.orgaoId,
      destinatarios,
      canais: config.canais,
      teamsCanalId: config.teams_canal_id,
      mensagem,
      instanciaId: ctx.instancia.id,
      card: {
        titulo: 'Aviso do processo',
        numero: ctx.instancia.numero,
        etapa: ctx.acao.nome,
        setor: '—',
        prazo: null,
        link: ctx.processoId ? `${(process.env.FRONTEND_URL || 'https://www.portaldcp.com.br').replace(/\/$/, '')}/orgao/processo/${ctx.processoId}` : null,
      },
    });
  }
}
