import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AtualizacaoSistema } from './entities/atualizacao-sistema.entity';
import { AtualizacaoLida } from './entities/atualizacao-lida.entity';

@Injectable()
export class AtualizacoesService {
  constructor(
    @InjectRepository(AtualizacaoSistema)
    private readonly atualizacaoRepo: Repository<AtualizacaoSistema>,
    @InjectRepository(AtualizacaoLida)
    private readonly lidaRepo: Repository<AtualizacaoLida>,
  ) {}

  /**
   * Busca atualizações não lidas por um fornecedor.
   * Retorna a atualização mais recente que o fornecedor ainda não marcou como lida.
   */
  async buscarNaoLidas(fornecedorId: string): Promise<AtualizacaoSistema[]> {
    const lidas = await this.lidaRepo.find({
      where: { fornecedor_id: fornecedorId },
      select: ['atualizacao_id'],
    });
    const idsLidos = lidas.map((l) => l.atualizacao_id);

    return this.atualizacaoRepo.find({
      where: idsLidos.length > 0
        ? idsLidos.map((id) => ({ id, ativo: true }))
        : { ativo: true },
      order: { versao: 'DESC' },
    }).then((atualizacoes) =>
      atualizacoes.filter((a) => !idsLidos.includes(a.id)),
    );
  }

  /**
   * Busca a atualização mais recente não lida por um fornecedor.
   */
  async buscarUltimaNaoLida(
    fornecedorId: string,
  ): Promise<AtualizacaoSistema | null> {
    const naoLidas = await this.buscarNaoLidas(fornecedorId);
    return naoLidas.length > 0 ? naoLidas[0] : null;
  }

  /**
   * Marca uma atualização como lida por um fornecedor.
   */
  async marcarComoLida(
    fornecedorId: string,
    atualizacaoId: string,
  ): Promise<AtualizacaoLida> {
    const existente = await this.lidaRepo.findOne({
      where: { fornecedor_id: fornecedorId, atualizacao_id: atualizacaoId },
    });
    if (existente) return existente;

    const lida = this.lidaRepo.create({
      fornecedor_id: fornecedorId,
      atualizacao_id: atualizacaoId,
    });
    return this.lidaRepo.save(lida);
  }

  /**
   * Cria uma nova atualização (uso admin).
   */
  async criar(dados: {
    titulo: string;
    conteudo: string;
    publico_alvo?: string;
  }): Promise<AtualizacaoSistema> {
    // Buscar versão máxima e incrementar
    const ultima = await this.atualizacaoRepo.findOne({
      order: { versao: 'DESC' },
    });
    const versao = (ultima?.versao || 0) + 1;

    const atualizacao = this.atualizacaoRepo.create({
      versao,
      titulo: dados.titulo,
      conteudo: dados.conteudo,
      publico_alvo: dados.publico_alvo || 'fornecedor',
      ativo: true,
    });
    return this.atualizacaoRepo.save(atualizacao);
  }

  /**
   * Lista todas as atualizações (uso admin).
   */
  async listar(): Promise<AtualizacaoSistema[]> {
    return this.atualizacaoRepo.find({ order: { versao: 'DESC' } });
  }

  /**
   * Remove uma atualização (uso admin).
   */
  async remover(id: string): Promise<void> {
    await this.atualizacaoRepo.delete(id);
  }
}
