import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MapeamentoAnonimo } from '../sessao/entities/mapeamento-anonimo.entity';
import { SessaoDisputa } from '../sessao/entities/sessao-disputa.entity';

/**
 * Serviço de Anonimização de Fornecedores
 * 
 * Responsável por:
 * - Gerar códigos anônimos para fornecedores (Fornecedor A, B, C...)
 * - Manter consistência do mapeamento durante toda a sessão
 * - Aplicar anonimização nos dados antes de enviar ao frontend
 * 
 * IMPORTANTE: Os dados reais NUNCA saem do backend quando anonimização está ativa
 */
@Injectable()
export class AnonimizacaoService {
  // Letras para códigos anônimos
  private readonly LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  constructor(
    @InjectRepository(MapeamentoAnonimo)
    private readonly mapeamentoRepo: Repository<MapeamentoAnonimo>,
    @InjectRepository(SessaoDisputa)
    private readonly sessaoRepo: Repository<SessaoDisputa>,
  ) {}

  /**
   * Gera código anônimo baseado no índice
   * 1 = "Fornecedor A", 26 = "Fornecedor Z", 27 = "Fornecedor AA"
   */
  private gerarCodigoAnonimo(indice: number): string {
    let codigo = '';
    let num = indice;
    
    while (num > 0) {
      num--;
      codigo = this.LETRAS[num % 26] + codigo;
      num = Math.floor(num / 26);
    }
    
    return `Fornecedor ${codigo}`;
  }

  /**
   * Obtém ou cria código anônimo para um fornecedor em uma sessão
   */
  async obterCodigoAnonimo(sessaoId: string, fornecedorId: string): Promise<string> {
    // Verificar se já existe mapeamento
    let mapeamento = await this.mapeamentoRepo.findOne({
      where: { sessao_id: sessaoId, fornecedor_id: fornecedorId },
    });

    if (mapeamento) {
      return mapeamento.codigo_anonimo;
    }

    // Criar novo mapeamento
    // Buscar próximo índice disponível
    const ultimoMapeamento = await this.mapeamentoRepo.findOne({
      where: { sessao_id: sessaoId },
      order: { indice: 'DESC' },
    });

    const proximoIndice = ultimoMapeamento ? ultimoMapeamento.indice + 1 : 1;
    const codigoAnonimo = this.gerarCodigoAnonimo(proximoIndice);

    mapeamento = this.mapeamentoRepo.create({
      sessao_id: sessaoId,
      fornecedor_id: fornecedorId,
      codigo_anonimo: codigoAnonimo,
      indice: proximoIndice,
    });

    await this.mapeamentoRepo.save(mapeamento);

    return codigoAnonimo;
  }

  /**
   * Obtém mapeamento completo de uma sessão
   * Retorna Map<fornecedorId, codigoAnonimo>
   */
  async obterMapeamentoSessao(sessaoId: string): Promise<Map<string, string>> {
    const mapeamentos = await this.mapeamentoRepo.find({
      where: { sessao_id: sessaoId },
    });

    const map = new Map<string, string>();
    for (const m of mapeamentos) {
      map.set(m.fornecedor_id, m.codigo_anonimo);
    }

    return map;
  }

  /**
   * Verifica se anonimização está ativa para uma sessão
   */
  async isAnonimizacaoAtiva(sessaoId: string): Promise<boolean> {
    const sessao = await this.sessaoRepo.findOne({
      where: { id: sessaoId },
    });

    return sessao?.anonimizacao_ativa ?? true; // Default: ativo
  }

  /**
   * Anonimiza nome do fornecedor se anonimização estiver ativa
   */
  async anonimizarNome(
    sessaoId: string,
    fornecedorId: string,
    nomeReal: string,
    forcarAnonimizacao?: boolean,
  ): Promise<string> {
    // Se forçar anonimização ou se estiver ativa na sessão
    const ativa = forcarAnonimizacao ?? await this.isAnonimizacaoAtiva(sessaoId);
    
    if (!ativa) {
      return nomeReal;
    }

    return this.obterCodigoAnonimo(sessaoId, fornecedorId);
  }

  /**
   * Anonimiza um array de lances
   */
  async anonimizarLances(
    sessaoId: string,
    lances: Array<{ fornecedorId: string; fornecedorNome: string; [key: string]: any }>,
  ): Promise<Array<{ fornecedorId: string; fornecedorNome: string; [key: string]: any }>> {
    const ativa = await this.isAnonimizacaoAtiva(sessaoId);
    
    if (!ativa) {
      return lances;
    }

    // Pré-carregar mapeamento para evitar múltiplas queries
    const mapeamento = await this.obterMapeamentoSessao(sessaoId);

    return Promise.all(lances.map(async (lance) => {
      let codigoAnonimo = mapeamento.get(lance.fornecedorId);
      
      if (!codigoAnonimo) {
        codigoAnonimo = await this.obterCodigoAnonimo(sessaoId, lance.fornecedorId);
      }

      return {
        ...lance,
        fornecedorId: `anonimo-${codigoAnonimo.replace('Fornecedor ', '').toLowerCase()}`,
        fornecedorNome: codigoAnonimo,
      };
    }));
  }

  /**
   * Anonimiza dados de um item (melhorLance, etc)
   */
  async anonimizarItem(
    sessaoId: string,
    item: {
      melhorLance?: { fornecedorId: string; fornecedorNome: string; valor: number };
      [key: string]: any;
    },
  ): Promise<typeof item> {
    const ativa = await this.isAnonimizacaoAtiva(sessaoId);
    
    if (!ativa || !item.melhorLance) {
      return item;
    }

    const codigoAnonimo = await this.obterCodigoAnonimo(
      sessaoId,
      item.melhorLance.fornecedorId,
    );

    return {
      ...item,
      melhorLance: {
        ...item.melhorLance,
        fornecedorId: `anonimo-${codigoAnonimo.replace('Fornecedor ', '').toLowerCase()}`,
        fornecedorNome: codigoAnonimo,
      },
    };
  }

  /**
   * Ativa/desativa anonimização de uma sessão
   * Registra log de auditoria
   */
  async toggleAnonimizacao(
    sessaoId: string,
    ativa: boolean,
    usuarioId: string,
    justificativa?: string,
  ): Promise<void> {
    await this.sessaoRepo.update(sessaoId, {
      anonimizacao_ativa: ativa,
    });

    // TODO: Registrar log de auditoria
    console.log(`[Anonimização] Sessão ${sessaoId} - Anonimização ${ativa ? 'ATIVADA' : 'DESATIVADA'} por ${usuarioId}. Justificativa: ${justificativa || 'N/A'}`);
  }

  /**
   * Limpa mapeamentos de uma sessão (usado ao reiniciar sessão)
   */
  async limparMapeamentos(sessaoId: string): Promise<void> {
    await this.mapeamentoRepo.delete({ sessao_id: sessaoId });
  }
}
