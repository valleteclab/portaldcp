import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemCatalogo, CatalogoSyncLog } from './entities/catalogo.entity';
import * as fs from 'fs';
import * as path from 'path';
import * as iconv from 'iconv-lite';

@Injectable()
export class CatalogoImportService {
  private readonly logger = new Logger(CatalogoImportService.name);

  constructor(
    @InjectRepository(ItemCatalogo)
    private itemCatalogoRepository: Repository<ItemCatalogo>,
    @InjectRepository(CatalogoSyncLog)
    private syncLogRepository: Repository<CatalogoSyncLog>,
  ) {}

  /**
   * Importa itens do catálogo a partir de um CSV do ComprasGov
   * Formato esperado: Código do Grupo;Nome do Grupo;Código da Classe;Nome da Classe;Código do PDM;Nome do PDM;Código do Item;Descrição do Item;Código NCM;
   */
  async importarCSV(
    filePath: string,
    tipo: 'MATERIAL' | 'SERVICO',
  ): Promise<{ sucesso: boolean; mensagem: string; estatisticas: any }> {
    const log = this.syncLogRepository.create({
      tipo: tipo === 'MATERIAL' ? 'MATERIAIS' : 'SERVICOS',
      status: 'INICIADO',
    });
    await this.syncLogRepository.save(log);

    const inicio = Date.now();
    let registrosProcessados = 0;
    let registrosNovos = 0;
    let registrosAtualizados = 0;
    let registrosErro = 0;

    try {
      // Ler arquivo CSV com encoding correto (Windows-1252/Latin1)
      const buffer = fs.readFileSync(filePath);
      const conteudo = iconv.decode(buffer, 'win1252');
      const linhas = conteudo.split('\n');

      this.logger.log(`Iniciando importação de ${linhas.length} linhas do arquivo ${filePath}`);

      // Pular cabeçalho (2 primeiras linhas)
      const batch: Partial<ItemCatalogo>[] = [];
      const batchSize = 1000;

      for (let i = 2; i < linhas.length; i++) {
        const linha = linhas[i].trim();
        if (!linha) continue;

        try {
          // Separador é ponto e vírgula
          const campos = linha.split(';');
          
          if (campos.length < 8) {
            registrosErro++;
            continue;
          }

          const [
            codigoGrupo,
            nomeGrupo,
            codigoClasse,
            nomeClasse,
            codigoPdm,
            nomePdm,
            codigoItem,
            descricaoItem,
            codigoNcm,
          ] = campos;

          if (!codigoItem || !descricaoItem) {
            registrosErro++;
            continue;
          }

          batch.push({
            codigo: codigoItem.trim(),
            descricao: descricaoItem.trim(),
            codigo_grupo: codigoGrupo?.trim() || undefined,
            nome_grupo: nomeGrupo?.trim() || undefined,
            codigo_classe: codigoClasse?.trim() || undefined,
            nome_classe: nomeClasse?.trim() || undefined,
            codigo_pdm: codigoPdm?.trim() || undefined,
            nome_pdm: nomePdm?.trim() || undefined,
            codigo_ncm: codigoNcm?.trim() === '-' ? undefined : codigoNcm?.trim() || undefined,
            tipo,
            origem: 'COMPRASGOV',
            ativo: true,
            ultima_sincronizacao: new Date(),
          });

          registrosProcessados++;

          // Processar em lotes
          if (batch.length >= batchSize) {
            const resultado = await this.processarBatch(batch);
            registrosNovos += resultado.novos;
            registrosAtualizados += resultado.atualizados;
            batch.length = 0;

            if (registrosProcessados % 10000 === 0) {
              this.logger.log(`Processados ${registrosProcessados} registros...`);
            }
          }
        } catch (error) {
          registrosErro++;
          this.logger.warn(`Erro na linha ${i}: ${error.message}`);
        }
      }

      // Processar batch restante
      if (batch.length > 0) {
        const resultado = await this.processarBatch(batch);
        registrosNovos += resultado.novos;
        registrosAtualizados += resultado.atualizados;
      }

      const duracao = Math.round((Date.now() - inicio) / 1000);

      // Atualizar log
      log.status = 'SUCESSO';
      log.registros_processados = registrosProcessados;
      log.registros_novos = registrosNovos;
      log.registros_atualizados = registrosAtualizados;
      log.registros_erro = registrosErro;
      log.duracao_segundos = duracao;
      await this.syncLogRepository.save(log);

      const mensagem = `Importação concluída: ${registrosNovos} novos, ${registrosAtualizados} atualizados, ${registrosErro} erros em ${duracao}s`;
      this.logger.log(mensagem);

      return {
        sucesso: true,
        mensagem,
        estatisticas: {
          processados: registrosProcessados,
          novos: registrosNovos,
          atualizados: registrosAtualizados,
          erros: registrosErro,
          duracao_segundos: duracao,
        },
      };
    } catch (error) {
      const duracao = Math.round((Date.now() - inicio) / 1000);
      
      log.status = 'ERRO';
      log.mensagem_erro = error.message;
      log.registros_processados = registrosProcessados;
      log.registros_novos = registrosNovos;
      log.registros_atualizados = registrosAtualizados;
      log.registros_erro = registrosErro;
      log.duracao_segundos = duracao;
      await this.syncLogRepository.save(log);

      this.logger.error(`Erro na importação: ${error.message}`);
      throw error;
    }
  }

  private async processarBatch(
    batch: Partial<ItemCatalogo>[],
  ): Promise<{ novos: number; atualizados: number }> {
    let novos = 0;
    let atualizados = 0;

    // Usar upsert para inserir ou atualizar
    for (const item of batch) {
      const existente = await this.itemCatalogoRepository.findOne({
        where: { codigo: item.codigo, tipo: item.tipo },
      });

      if (existente) {
        await this.itemCatalogoRepository.update(existente.id, item);
        atualizados++;
      } else {
        await this.itemCatalogoRepository.save(item);
        novos++;
      }
    }

    return { novos, atualizados };
  }

  /**
   * Busca itens do catálogo com filtros
   */
  async buscarItens(params: {
    termo?: string;
    tipo?: 'MATERIAL' | 'SERVICO';
    codigoGrupo?: string;
    codigoClasse?: string;
    limite?: number;
    offset?: number;
  }): Promise<{ itens: ItemCatalogo[]; total: number }> {
    const { termo, tipo, codigoGrupo, codigoClasse, limite = 50, offset = 0 } = params;

    const query = this.itemCatalogoRepository
      .createQueryBuilder('item')
      .where('item.ativo = :ativo', { ativo: true });

    if (tipo) {
      query.andWhere('item.tipo = :tipo', { tipo });
    }

    if (codigoGrupo) {
      query.andWhere('item.codigo_grupo = :codigoGrupo', { codigoGrupo });
    }

    if (codigoClasse) {
      query.andWhere('item.codigo_classe = :codigoClasse', { codigoClasse });
    }

    if (termo) {
      const termoNormalizado = termo.trim().toLowerCase();
      const palavras = termoNormalizado.split(/\s+/).filter(p => p.length >= 2);
      
      if (palavras.length > 1) {
        // Busca com múltiplas palavras: todas devem estar presentes
        const conditions = palavras.map((_, i) => 
          `(LOWER(item.descricao) LIKE :palavra${i} OR LOWER(item.nome_pdm) LIKE :palavra${i})`
        ).join(' AND ');
        
        const params: Record<string, string> = {};
        palavras.forEach((p, i) => {
          params[`palavra${i}`] = `%${p}%`;
        });
        
        query.andWhere(`(${conditions})`, params);
      } else {
        // Busca simples
        query.andWhere(
          '(LOWER(item.descricao) LIKE LOWER(:termo) OR item.codigo ILIKE :termo OR LOWER(item.nome_pdm) LIKE LOWER(:termo))',
          { termo: `%${termoNormalizado}%` },
        );
      }
    }

    // Ordenação inteligente: prioriza itens que começam com o termo
    if (termo) {
      const termoLimpo = termo.trim().replace(/'/g, "''");
      query.orderBy(`CASE WHEN LOWER(item.descricao) LIKE LOWER('${termoLimpo}%') THEN 0 ELSE 1 END`, 'ASC');
      query.addOrderBy('item.descricao', 'ASC');
    } else {
      query.orderBy('item.descricao', 'ASC');
    }

    const [itens, total] = await query
      .skip(offset)
      .take(limite)
      .getManyAndCount();

    return { itens, total };
  }

  /**
   * Retorna estatísticas do catálogo
   */
  async getEstatisticas(): Promise<{
    totalMateriais: number;
    totalServicos: number;
    ultimaSincronizacao: Date | null;
  }> {
    const totalMateriais = await this.itemCatalogoRepository.count({
      where: { tipo: 'MATERIAL', ativo: true },
    });

    const totalServicos = await this.itemCatalogoRepository.count({
      where: { tipo: 'SERVICO', ativo: true },
    });

    const ultimoLog = await this.syncLogRepository.findOne({
      where: { status: 'SUCESSO' },
      order: { created_at: 'DESC' },
    });

    return {
      totalMateriais,
      totalServicos,
      ultimaSincronizacao: ultimoLog?.created_at || null,
    };
  }
}
