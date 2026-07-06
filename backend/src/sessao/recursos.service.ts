import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  RecursoAdministrativo,
  StatusRecurso,
} from './entities/recurso-administrativo.entity';
import { SessaoDisputa, EtapaSessao } from './entities/sessao-disputa.entity';
import { EventoSessao, TipoEvento } from './entities/evento-sessao.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { ParametrosLicitacaoService } from '../parametros-licitacao/parametros-licitacao.service';

/**
 * Ciclo de recursos administrativos (Art. 165, Lei 14.133/2021):
 * intenção → admissibilidade → razões → contrarrazões → decisão.
 * Prazos vêm da parametrização do órgão (prazo_recursal / prazo_contrarrazoes).
 */
@Injectable()
export class RecursosService {
  constructor(
    @InjectRepository(RecursoAdministrativo)
    private readonly recursoRepo: Repository<RecursoAdministrativo>,
    @InjectRepository(SessaoDisputa)
    private readonly sessaoRepo: Repository<SessaoDisputa>,
    @InjectRepository(EventoSessao)
    private readonly eventoRepo: Repository<EventoSessao>,
    @InjectRepository(Licitacao)
    private readonly licitacaoRepo: Repository<Licitacao>,
    private readonly parametrosService: ParametrosLicitacaoService,
  ) {}

  private async registrarEvento(
    sessaoId: string,
    tipo: TipoEvento,
    descricao: string,
    fornecedorId?: string,
    usuarioNome?: string,
    dados?: Record<string, any>,
  ) {
    await this.eventoRepo.save(
      this.eventoRepo.create({
        sessao_id: sessaoId,
        tipo,
        descricao,
        fornecedor_identificador: fornecedorId,
        usuario_nome: usuarioNome,
        is_sistema: !usuarioNome,
        dados_adicionais: dados,
      }),
    );
  }

  private diasUteisAFrente(dias: number): Date {
    const d = new Date();
    let restantes = dias;
    while (restantes > 0) {
      d.setDate(d.getDate() + 1);
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) restantes--; // pula sáb/dom
    }
    return d;
  }

  /**
   * Pregoeiro admite a intenção de recurso (juízo de admissibilidade) e abre o
   * prazo para razões. Cria o recurso formal e leva a sessão a PRAZO_RECURSAL.
   */
  async admitirIntencao(
    sessaoId: string,
    fornecedorId: string,
    opts: { fornecedorNome?: string; itemId?: string; motivacao?: string },
  ): Promise<RecursoAdministrativo> {
    const sessao = await this.sessaoRepo.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    const parametros = await this.parametrosService.resolver(
      (await this.licitacaoRepo.findOneBy({ id: sessao.licitacao_id }))?.orgao_id,
    );

    const recurso = await this.recursoRepo.save(
      this.recursoRepo.create({
        sessao_id: sessaoId,
        licitacao_id: sessao.licitacao_id,
        item_id: opts.itemId,
        fornecedor_id: fornecedorId,
        fornecedor_nome: opts.fornecedorNome,
        motivacao_intencao: opts.motivacao,
        data_intencao: new Date(),
        intencao_aceita: true,
        status: StatusRecurso.AGUARDANDO_RAZOES,
        prazo_razoes: this.diasUteisAFrente(parametros.prazo_recursal_dias_uteis),
      }),
    );

    sessao.etapa = EtapaSessao.PRAZO_RECURSAL;
    await this.sessaoRepo.save(sessao);

    await this.registrarEvento(
      sessaoId,
      TipoEvento.INTENCAO_RECURSO_ACEITA,
      `Intenção de recurso ADMITIDA. Prazo de ${parametros.prazo_recursal_dias_uteis} dias úteis para razões.`,
      fornecedorId,
      sessao.pregoeiro_nome,
    );
    return recurso;
  }

  /** Pregoeiro não admite a intenção (intempestiva/sem fundamentação). */
  async recusarIntencao(
    sessaoId: string,
    fornecedorId: string,
    motivo: string,
    opts?: { fornecedorNome?: string; itemId?: string },
  ): Promise<RecursoAdministrativo> {
    const sessao = await this.sessaoRepo.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    const recurso = await this.recursoRepo.save(
      this.recursoRepo.create({
        sessao_id: sessaoId,
        licitacao_id: sessao.licitacao_id,
        item_id: opts?.itemId,
        fornecedor_id: fornecedorId,
        fornecedor_nome: opts?.fornecedorNome,
        data_intencao: new Date(),
        intencao_aceita: false,
        motivo_recusa_intencao: motivo,
        status: StatusRecurso.NAO_CONHECIDO,
      }),
    );

    await this.registrarEvento(
      sessaoId,
      TipoEvento.INTENCAO_RECURSO_RECUSADA,
      `Intenção de recurso NÃO ADMITIDA. Motivo: ${motivo}`,
      fornecedorId,
      sessao.pregoeiro_nome,
    );
    return recurso;
  }

  /** Recorrente apresenta as razões dentro do prazo recursal. */
  async apresentarRazoes(recursoId: string, razoes: string): Promise<RecursoAdministrativo> {
    const recurso = await this.obter(recursoId);
    if (recurso.status !== StatusRecurso.AGUARDANDO_RAZOES) {
      throw new BadRequestException('Este recurso não está aguardando razões.');
    }
    if (!razoes?.trim()) throw new BadRequestException('As razões são obrigatórias.');

    const parametros = await this.parametrosService.resolver(
      (await this.licitacaoRepo.findOneBy({ id: recurso.licitacao_id }))?.orgao_id,
    );

    recurso.razoes = razoes.trim();
    recurso.data_razoes = new Date();
    recurso.status = StatusRecurso.CONTRARRAZOES;
    recurso.prazo_contrarrazoes = this.diasUteisAFrente(
      parametros.prazo_contrarrazoes_dias_uteis,
    );
    await this.recursoRepo.save(recurso);

    await this.registrarEvento(
      recurso.sessao_id,
      TipoEvento.RECURSO_REGISTRADO,
      `Razões de recurso apresentadas por ${recurso.fornecedor_nome || recurso.fornecedor_id}. ` +
        `Aberto prazo de ${parametros.prazo_contrarrazoes_dias_uteis} dias úteis para contrarrazões.`,
      recurso.fornecedor_id,
      recurso.fornecedor_nome,
    );
    return recurso;
  }

  /** Demais licitantes apresentam contrarrazões. */
  async apresentarContrarrazoes(
    recursoId: string,
    dados: { fornecedorId: string; fornecedorNome?: string; texto: string },
  ): Promise<RecursoAdministrativo> {
    const recurso = await this.obter(recursoId);
    if (recurso.status !== StatusRecurso.CONTRARRAZOES) {
      throw new BadRequestException('Este recurso não está em fase de contrarrazões.');
    }
    if (!dados.texto?.trim()) throw new BadRequestException('O texto é obrigatório.');

    recurso.contrarrazoes = [
      ...(recurso.contrarrazoes || []),
      {
        fornecedor_id: dados.fornecedorId,
        fornecedor_nome: dados.fornecedorNome,
        texto: dados.texto.trim(),
        data: new Date().toISOString(),
      },
    ];
    await this.recursoRepo.save(recurso);

    await this.registrarEvento(
      recurso.sessao_id,
      TipoEvento.CONTRARRAZOES_REGISTRADAS,
      `Contrarrazões apresentadas por ${dados.fornecedorNome || dados.fornecedorId}.`,
      dados.fornecedorId,
      dados.fornecedorNome,
    );
    return recurso;
  }

  /**
   * Decisão do recurso (juízo de retratação do pregoeiro ou decisão da
   * autoridade superior). Ao decidir o último recurso pendente da sessão,
   * a sessão avança para ADJUDICAÇÃO.
   */
  async decidir(
    recursoId: string,
    dados: {
      provido: boolean;
      decisao: string;
      decididoPor?: string;
      decididoPorCargo?: string;
    },
  ): Promise<RecursoAdministrativo> {
    const recurso = await this.obter(recursoId);
    if (
      ![StatusRecurso.CONTRARRAZOES, StatusRecurso.RAZOES_APRESENTADAS, StatusRecurso.EM_ANALISE].includes(
        recurso.status,
      )
    ) {
      throw new BadRequestException('Este recurso não está em fase de decisão.');
    }
    if (!dados.decisao?.trim()) throw new BadRequestException('A fundamentação da decisão é obrigatória.');

    recurso.status = dados.provido ? StatusRecurso.PROVIDO : StatusRecurso.IMPROVIDO;
    recurso.decisao = dados.decisao.trim();
    recurso.decidido_por = dados.decididoPor ?? null;
    recurso.decidido_por_cargo = dados.decididoPorCargo ?? null;
    recurso.data_decisao = new Date();
    await this.recursoRepo.save(recurso);

    await this.registrarEvento(
      recurso.sessao_id,
      dados.provido ? TipoEvento.RECURSO_PROVIDO : TipoEvento.RECURSO_IMPROVIDO,
      `Recurso de ${recurso.fornecedor_nome || recurso.fornecedor_id} ${dados.provido ? 'PROVIDO' : 'IMPROVIDO'}. ${dados.decisao}`,
      recurso.fornecedor_id,
      dados.decididoPor,
      { provido: dados.provido },
    );

    // Se todos os recursos da sessão foram decididos, avança para adjudicação.
    const pendentes = await this.recursoRepo.count({
      where: [
        { sessao_id: recurso.sessao_id, status: StatusRecurso.AGUARDANDO_RAZOES },
        { sessao_id: recurso.sessao_id, status: StatusRecurso.CONTRARRAZOES },
        { sessao_id: recurso.sessao_id, status: StatusRecurso.RAZOES_APRESENTADAS },
        { sessao_id: recurso.sessao_id, status: StatusRecurso.EM_ANALISE },
      ],
    });
    if (pendentes === 0) {
      const sessao = await this.sessaoRepo.findOneBy({ id: recurso.sessao_id });
      if (sessao) {
        sessao.etapa = EtapaSessao.ADJUDICACAO;
        await this.sessaoRepo.save(sessao);
        await this.registrarEvento(
          sessao.id,
          TipoEvento.MENSAGEM_SISTEMA,
          'Todos os recursos foram julgados. Sessão avançou para adjudicação (Art. 71).',
          undefined,
          sessao.pregoeiro_nome,
        );
      }
    }
    return recurso;
  }

  async listarPorSessao(sessaoId: string): Promise<RecursoAdministrativo[]> {
    return this.recursoRepo.find({
      where: { sessao_id: sessaoId },
      order: { created_at: 'ASC' },
    });
  }

  private async obter(id: string): Promise<RecursoAdministrativo> {
    const recurso = await this.recursoRepo.findOneBy({ id });
    if (!recurso) throw new NotFoundException('Recurso não encontrado');
    return recurso;
  }
}
