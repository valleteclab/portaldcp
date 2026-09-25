import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DisputaService,
  ItemDisputa,
  LancePainelCancelamento,
  SolicitacaoCancelamentoPendente,
} from '../disputa.service';
import { SessaoDisputa } from '../../sessao/entities/sessao-disputa.entity';
import {
  SalaContexto,
  SalaItemBoard,
  mapearItemBoard,
  montarContextoSessao,
} from './sala-disputa.presenter';

export interface SalaBoard {
  visao: 'PREGOEIRO' | 'FORNECEDOR';
  contexto: SalaContexto;
  colunas: {
    aguardando: SalaItemBoard[];
    emDisputa: SalaItemBoard[];
    encerrados: SalaItemBoard[];
  };
  metricas: {
    totalAguardando: number;
    totalEmDisputa: number;
    totalEncerrados: number;
  };
  /** Somente visão PREGOEIRO: pedidos de cancelamento aguardando decisão */
  solicitacoesCancelamento?: SolicitacaoCancelamentoPendente[];
}

@Injectable()
export class SalaDisputaService {
  constructor(
    @InjectRepository(SessaoDisputa)
    private readonly sessaoRepo: Repository<SessaoDisputa>,
    private readonly disputaService: DisputaService,
  ) {}

  async getContextoSessao(sessaoId: string): Promise<SalaContexto> {
    const sessao = await this.buscarSessao(sessaoId);
    return montarContextoSessao(sessao);
  }

  async getContextoPorLicitacao(
    licitacaoId: string,
  ): Promise<SalaContexto> {
    const sessao = await this.buscarSessaoPorLicitacao(licitacaoId);
    return montarContextoSessao(sessao);
  }

  async getBoardPregoeiro(sessaoId: string, orgaoId?: string): Promise<SalaBoard> {
    const sessao = await this.buscarSessao(sessaoId, orgaoId);
    // Visão do órgão dono (rota já conferida): contagem de lances fechados, sem valores
    const itens = await this.disputaService.getItensPorStatus(sessaoId, undefined, { visaoOrgao: true });
    const solicitacoesCancelamento =
      await this.disputaService.listarSolicitacoesCancelamentoPendentes(sessaoId);

    return {
      visao: 'PREGOEIRO',
      contexto: montarContextoSessao(sessao),
      colunas: {
        aguardando: itens.aguardando.map(mapearItemBoard),
        emDisputa: itens.emDisputa.map(mapearItemBoard),
        encerrados: itens.encerrados.map(mapearItemBoard),
      },
      metricas: {
        totalAguardando: itens.aguardando.length,
        totalEmDisputa: itens.emDisputa.length,
        totalEncerrados: itens.encerrados.length,
      },
      solicitacoesCancelamento,
    };
  }

  async getBoardFornecedor(
    sessaoId: string,
    fornecedorId: string,
  ): Promise<SalaBoard> {
    const sessao = await this.buscarSessao(sessaoId);
    const visaoFornecedor = await this.disputaService.getItensParaFornecedor(
      sessaoId,
      fornecedorId,
    );
    const agrupados = this.agruparItensPorStatus(
      visaoFornecedor.itens as ItemDisputa[],
    );

    return {
      visao: 'FORNECEDOR',
      contexto: montarContextoSessao(sessao),
      colunas: {
        aguardando: agrupados.aguardando.map(mapearItemBoard),
        emDisputa: agrupados.emDisputa.map(mapearItemBoard),
        encerrados: agrupados.encerrados.map(mapearItemBoard),
      },
      metricas: {
        totalAguardando: agrupados.aguardando.length,
        totalEmDisputa: agrupados.emDisputa.length,
        totalEncerrados: agrupados.encerrados.length,
      },
    };
  }

  private async buscarSessao(sessaoId: string, orgaoId?: string): Promise<SessaoDisputa> {
    const sessao = await this.sessaoRepo.findOne({
      where: { id: sessaoId },
      relations: ['licitacao'],
      order: { created_at: 'DESC' },
    });

    if (!sessao) {
      throw new NotFoundException('Sessao nao encontrada');
    }

    if (orgaoId && sessao.licitacao?.orgao_id !== orgaoId) {
      throw new ForbiddenException('Acesso negado a esta sessao');
    }

    return sessao;
  }

  private async buscarSessaoPorLicitacao(
    licitacaoId: string,
  ): Promise<SessaoDisputa> {
    const sessao = await this.sessaoRepo.findOne({
      where: { licitacao_id: licitacaoId },
      relations: ['licitacao'],
      order: { created_at: 'DESC' },
    });

    if (!sessao) {
      throw new NotFoundException('Sessao nao encontrada para esta licitacao');
    }

    return sessao;
  }

  private agruparItensPorStatus(itens: ItemDisputa[]): {
    aguardando: ItemDisputa[];
    emDisputa: ItemDisputa[];
    encerrados: ItemDisputa[];
  } {
    const aguardando: ItemDisputa[] = [];
    const emDisputa: ItemDisputa[] = [];
    const encerrados: ItemDisputa[] = [];

    for (const item of itens) {
      if (item.status === 'EM_DISPUTA') {
        emDisputa.push(item);
        continue;
      }

      if (item.status === 'ENCERRADO') {
        encerrados.push(item);
        continue;
      }

      aguardando.push(item);
    }

    return { aguardando, emDisputa, encerrados };
  }

  listarLancesMeusParaCancelamento(
    sessaoId: string,
    itemId: string,
    fornecedorId: string,
  ): Promise<LancePainelCancelamento[]> {
    return this.disputaService.listarLancesFornecedorParaCancelamento(
      sessaoId,
      itemId,
      fornecedorId,
    );
  }

  cancelarLanceFornecedorImediato(
    sessaoId: string,
    itemId: string,
    lanceId: string,
    fornecedorId: string,
  ) {
    return this.disputaService.cancelarLanceFornecedorImediato(
      sessaoId,
      itemId,
      lanceId,
      fornecedorId,
    );
  }

  solicitarCancelamentoLance(
    sessaoId: string,
    itemId: string,
    lanceId: string,
    fornecedorId: string,
    motivo?: string,
  ) {
    return this.disputaService.solicitarCancelamentoLance(
      sessaoId,
      itemId,
      lanceId,
      fornecedorId,
      motivo,
    );
  }

  pregoeiroCancelarLance(
    sessaoId: string,
    itemId: string,
    lanceId: string,
    orgaoId: string,
    justificativa: string,
  ) {
    return this.disputaService.pregoeiroCancelarLance(
      sessaoId,
      itemId,
      lanceId,
      orgaoId,
      justificativa,
    );
  }
}
