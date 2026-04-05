import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DisputaService,
  ItemDisputa,
  LancePainelCancelamentoV3,
  SolicitacaoCancelamentoPendenteV3,
} from '../disputa-v2/disputa.service';
import { SessaoDisputa } from '../sessao/entities/sessao-disputa.entity';
import {
  DisputaV3Contexto,
  DisputaV3ItemBoard,
  mapearItemBoardV3,
  montarContextoSessaoV3,
} from './disputa-v3.presenter';

export interface DisputaV3Board {
  visao: 'PREGOEIRO' | 'FORNECEDOR';
  contexto: DisputaV3Contexto;
  colunas: {
    aguardando: DisputaV3ItemBoard[];
    emDisputa: DisputaV3ItemBoard[];
    encerrados: DisputaV3ItemBoard[];
  };
  metricas: {
    totalAguardando: number;
    totalEmDisputa: number;
    totalEncerrados: number;
  };
  /** Somente visão PREGOEIRO: pedidos de cancelamento aguardando decisão */
  solicitacoesCancelamento?: SolicitacaoCancelamentoPendenteV3[];
}

@Injectable()
export class DisputaV3Service {
  constructor(
    @InjectRepository(SessaoDisputa)
    private readonly sessaoRepo: Repository<SessaoDisputa>,
    private readonly disputaService: DisputaService,
  ) {}

  async getContextoSessao(sessaoId: string): Promise<DisputaV3Contexto> {
    const sessao = await this.buscarSessao(sessaoId);
    return montarContextoSessaoV3(sessao);
  }

  async getContextoPorLicitacao(
    licitacaoId: string,
  ): Promise<DisputaV3Contexto> {
    const sessao = await this.buscarSessaoPorLicitacao(licitacaoId);
    return montarContextoSessaoV3(sessao);
  }

  async getBoardPregoeiro(sessaoId: string, orgaoId?: string): Promise<DisputaV3Board> {
    const sessao = await this.buscarSessao(sessaoId, orgaoId);
    const itens = await this.disputaService.getItensPorStatus(sessaoId);
    const solicitacoesCancelamento =
      await this.disputaService.listarSolicitacoesCancelamentoPendentesV3(sessaoId);

    return {
      visao: 'PREGOEIRO',
      contexto: montarContextoSessaoV3(sessao),
      colunas: {
        aguardando: itens.aguardando.map(mapearItemBoardV3),
        emDisputa: itens.emDisputa.map(mapearItemBoardV3),
        encerrados: itens.encerrados.map(mapearItemBoardV3),
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
  ): Promise<DisputaV3Board> {
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
      contexto: montarContextoSessaoV3(sessao),
      colunas: {
        aguardando: agrupados.aguardando.map(mapearItemBoardV3),
        emDisputa: agrupados.emDisputa.map(mapearItemBoardV3),
        encerrados: agrupados.encerrados.map(mapearItemBoardV3),
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
  ): Promise<LancePainelCancelamentoV3[]> {
    return this.disputaService.listarLancesFornecedorParaCancelamentoV3(
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
    return this.disputaService.cancelarLanceFornecedorImediatoV3(
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
    return this.disputaService.solicitarCancelamentoLanceV3(
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
    return this.disputaService.pregoeiroCancelarLanceV3(
      sessaoId,
      itemId,
      lanceId,
      orgaoId,
      justificativa,
    );
  }
}
