import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThanOrEqual, MoreThan } from 'typeorm';
import { Licitacao, FaseLicitacao } from './entities/licitacao.entity';

/**
 * Serviço responsável por atualizar automaticamente as fases das licitações
 * baseado nas datas do cronograma.
 * 
 * Regras de transição (Lei 14.133/2021):
 * 
 * 1. PUBLICADO → ACOLHIMENTO_PROPOSTAS
 *    Quando: data_inicio_acolhimento <= agora
 *    Nota: O período de impugnação é paralelo, não sequencial
 * 
 * 2. ACOLHIMENTO_PROPOSTAS → EM_DISPUTA (ou ANALISE_PROPOSTAS)
 *    Quando: data_abertura_sessao <= agora
 *    Nota: A sessão pode ser aberta manualmente pelo pregoeiro
 * 
 * Os períodos podem se sobrepor:
 * - Impugnação: até 3 dias úteis antes da abertura
 * - Propostas: desde publicação até data_fim_acolhimento
 * - Ambos podem ocorrer simultaneamente
 */
@Injectable()
export class LicitacoesSchedulerService {
  private readonly logger = new Logger(LicitacoesSchedulerService.name);

  constructor(
    @InjectRepository(Licitacao)
    private readonly licitacaoRepository: Repository<Licitacao>,
  ) {}

  /**
   * Executa a cada minuto para verificar transições de fase
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async atualizarFasesAutomaticamente() {
    const agora = new Date();
    
    try {
      // 1. PUBLICADO/IMPUGNACAO → ACOLHIMENTO_PROPOSTAS
      // Quando data_inicio_acolhimento já passou
      await this.transicionarParaAcolhimento(agora);
      
      // 2. ACOLHIMENTO_PROPOSTAS → Aguardando abertura manual
      // A abertura da sessão é feita manualmente pelo pregoeiro
      // Mas podemos marcar como pronto para abertura
      
    } catch (error) {
      this.logger.error('Erro ao atualizar fases automaticamente:', error);
    }
  }

  /**
   * Transiciona licitações para ACOLHIMENTO_PROPOSTAS
   * quando o período de acolhimento já iniciou
   */
  private async transicionarParaAcolhimento(agora: Date) {
    const licitacoes = await this.licitacaoRepository.find({
      where: {
        fase: In([FaseLicitacao.PUBLICADO, FaseLicitacao.IMPUGNACAO]),
        data_inicio_acolhimento: LessThanOrEqual(agora),
        data_fim_acolhimento: MoreThan(agora), // Ainda não encerrou
      }
    });

    for (const licitacao of licitacoes) {
      this.logger.log(`Atualizando licitação ${licitacao.numero_processo} para ACOLHIMENTO_PROPOSTAS`);
      
      licitacao.fase = FaseLicitacao.ACOLHIMENTO_PROPOSTAS;
      await this.licitacaoRepository.save(licitacao);
    }

    if (licitacoes.length > 0) {
      this.logger.log(`${licitacoes.length} licitação(ões) transicionada(s) para ACOLHIMENTO_PROPOSTAS`);
    }
  }

  /**
   * Transiciona licitações para ANALISE_PROPOSTAS
   * quando o período de acolhimento encerrou
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async encerrarAcolhimento() {
    const agora = new Date();

    const licitacoes = await this.licitacaoRepository.find({
      where: {
        fase: FaseLicitacao.ACOLHIMENTO_PROPOSTAS,
        data_fim_acolhimento: LessThanOrEqual(agora),
      }
    });

    for (const licitacao of licitacoes) {
      this.logger.log(`Encerrando acolhimento da licitação ${licitacao.numero_processo}`);
      
      // Vai para análise de propostas, aguardando abertura da sessão
      licitacao.fase = FaseLicitacao.ANALISE_PROPOSTAS;
      await this.licitacaoRepository.save(licitacao);
    }

    if (licitacoes.length > 0) {
      this.logger.log(`${licitacoes.length} licitação(ões) com acolhimento encerrado`);
    }
  }

  /**
   * Método para forçar atualização de uma licitação específica
   * Útil para chamadas manuais ou após edição do cronograma
   */
  async atualizarFaseLicitacao(licitacaoId: string): Promise<Licitacao> {
    const licitacao = await this.licitacaoRepository.findOne({
      where: { id: licitacaoId }
    });

    if (!licitacao) {
      throw new Error(`Licitação ${licitacaoId} não encontrada`);
    }

    const agora = new Date();

    // Verifica transições possíveis
    if (
      [FaseLicitacao.PUBLICADO, FaseLicitacao.IMPUGNACAO].includes(licitacao.fase) &&
      licitacao.data_inicio_acolhimento &&
      new Date(licitacao.data_inicio_acolhimento) <= agora &&
      licitacao.data_fim_acolhimento &&
      new Date(licitacao.data_fim_acolhimento) > agora
    ) {
      licitacao.fase = FaseLicitacao.ACOLHIMENTO_PROPOSTAS;
      await this.licitacaoRepository.save(licitacao);
      this.logger.log(`Licitação ${licitacao.numero_processo} atualizada para ACOLHIMENTO_PROPOSTAS`);
    }

    if (
      licitacao.fase === FaseLicitacao.ACOLHIMENTO_PROPOSTAS &&
      licitacao.data_fim_acolhimento &&
      new Date(licitacao.data_fim_acolhimento) <= agora
    ) {
      licitacao.fase = FaseLicitacao.ANALISE_PROPOSTAS;
      await this.licitacaoRepository.save(licitacao);
      this.logger.log(`Licitação ${licitacao.numero_processo} atualizada para ANALISE_PROPOSTAS`);
    }

    return licitacao;
  }
}
