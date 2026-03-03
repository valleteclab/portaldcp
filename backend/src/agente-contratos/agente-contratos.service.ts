import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgenteLog, AgenteAcaoTipo, AgenteStatus } from './entities/agente-log.entity';
import { PortalTransparenciaService } from '../contratos/portal-transparencia.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';

export interface CicloAgenteResult {
  contratos_encontrados: number;
  contratos_importados: number;
  itens_extraidos: number;
  erros: number;
  detalhes: Array<{
    numero: string;
    status: 'sucesso' | 'erro' | 'existe';
    mensagem: string;
    itens?: number;
  }>;
}

@Injectable()
export class AgenteContratosService {
  private readonly logger = new Logger(AgenteContratosService.name);

  constructor(
    @InjectRepository(AgenteLog)
    private readonly agenteLogRepo: Repository<AgenteLog>,
    private readonly portalTransparenciaService: PortalTransparenciaService,
    private readonly notificacoesService: NotificacoesService,
  ) {}

  /**
   * Executa o ciclo diário do agente autônomo
   * Busca contratos no Portal da Transparência e importa com itens
   */
  async executarCicloDiario(orgaoId: string): Promise<CicloAgenteResult> {
    this.logger.log('🤖 Iniciando ciclo diário do Agente Autônomo de Contratos');

    const resultado: CicloAgenteResult = {
      contratos_encontrados: 0,
      contratos_importados: 0,
      itens_extraidos: 0,
      erros: 0,
      detalhes: [],
    };

    try {
      // 1. Buscar contratos no Portal da Transparência
      this.logger.log('🔍 Buscando contratos no Portal da Transparência...');

      const response = await this.portalTransparenciaService.buscarContratos({
        apenas_vigentes: true,
        limit: 100, // Limite por segurança
      });

      resultado.contratos_encontrados = response.data.length;
      this.logger.log(`📋 Encontrados ${response.data.length} contratos vigentes`);

      // Log da busca
      await this.criarLog({
        tipo_acao: 'BUSCA_PORTAL',
        orgao_id: orgaoId,
        status: 'SUCESSO',
        mensagem: `Buscados ${response.data.length} contratos vigentes`,
        detalhes: { total_contratos: response.data.length },
      });

      // 2. Processar cada contrato
      for (const contratoApi of response.data) {
        try {
          this.logger.log(`📄 Processando contrato: ${contratoApi.contratoNumero}`);

          // Importar contrato completo (com PDF e itens)
          const importacao = await this.portalTransparenciaService.importarContratoCompleto(
            orgaoId,
            contratoApi
          );

          if (importacao.mensagem.includes('já existe')) {
            resultado.detalhes.push({
              numero: contratoApi.contratoNumero,
              status: 'existe',
              mensagem: 'Contrato já existe no sistema',
            });
          } else {
            resultado.contratos_importados++;
            resultado.itens_extraidos += importacao.itens_criados;
            resultado.detalhes.push({
              numero: contratoApi.contratoNumero,
              status: 'sucesso',
              mensagem: importacao.mensagem,
              itens: importacao.itens_criados,
            });

            // Log de sucesso
            await this.criarLog({
              tipo_acao: 'IMPORTACAO_CONTRATO',
              orgao_id: orgaoId,
              contrato_numero: contratoApi.contratoNumero,
              contrato_id: importacao.contrato_id,
              cnpj_fornecedor: contratoApi.documento,
              status: 'SUCESSO',
              mensagem: importacao.mensagem,
              detalhes: {
                pdf_baixado: importacao.pdf_baixado,
                itens_extraidos: importacao.itens_extraidos,
                itens_criados: importacao.itens_criados,
              },
            });
          }
        } catch (error) {
          resultado.erros++;
          resultado.detalhes.push({
            numero: contratoApi.contratoNumero,
            status: 'erro',
            mensagem: error.message,
          });

          this.logger.error(`❌ Erro ao processar ${contratoApi.contratoNumero}: ${error.message}`);

          // Log de erro
          await this.criarLog({
            tipo_acao: 'IMPORTACAO_CONTRATO',
            orgao_id: orgaoId,
            contrato_numero: contratoApi.contratoNumero,
            cnpj_fornecedor: contratoApi.documento,
            status: 'ERRO',
            mensagem: error.message,
            detalhes: {
              erro: error.message,
              stack: error.stack,
            },
          });
        }
      }

      // 3. Resumo do ciclo
      this.logger.log('✅ Ciclo diário finalizado');
      this.logger.log(`📊 Resumo: ${resultado.contratos_importados} importados, ${resultado.itens_extraidos} itens, ${resultado.erros} erros`);

      return resultado;
    } catch (error) {
      this.logger.error(`❌ Erro no ciclo diário: ${error.message}`);

      // Log do erro geral
      await this.criarLog({
        tipo_acao: 'BUSCA_PORTAL',
        orgao_id: orgaoId,
        status: 'ERRO',
        mensagem: `Erro no ciclo diário: ${error.message}`,
        detalhes: {
          erro: error.message,
          stack: error.stack,
        },
      });

      throw error;
    }
  }

  /**
   * Cria um log da ação do agente
   */
  private async criarLog(dados: {
    tipo_acao: AgenteAcaoTipo;
    orgao_id: string;
    contrato_numero?: string;
    contrato_id?: string;
    fornecedor_id?: string;
    cnpj_fornecedor?: string;
    status: AgenteStatus;
    mensagem?: string;
    detalhes?: any;
  }): Promise<AgenteLog> {
    const log = this.agenteLogRepo.create(dados);
    return this.agenteLogRepo.save(log);
  }

  /**
   * Retorna os logs recentes do agente
   */
  async obterLogsRecentes(
    orgaoId: string,
    limite: number = 50
  ): Promise<AgenteLog[]> {
    return this.agenteLogRepo.find({
      where: { orgao_id: orgaoId },
      order: { created_at: 'DESC' },
      take: limite,
    });
  }

  /**
   * Retorna estatísticas do agente
   */
  async obterEstatisticas(orgaoId: string): Promise<{
    total_acoes: number;
    sucessos: number;
    erros: number;
    contratos_importados_7dias: number;
    ultima_execucao?: Date;
  }> {
    const seteDiasAtras = new Date();
    seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);

    const [total, sucessos, erros, importacoes7dias] = await Promise.all([
      this.agenteLogRepo.count({ where: { orgao_id: orgaoId } }),
      this.agenteLogRepo.count({ where: { orgao_id: orgaoId, status: 'SUCESSO' } }),
      this.agenteLogRepo.count({ where: { orgao_id: orgaoId, status: 'ERRO' } }),
      this.agenteLogRepo.count({
        where: {
          orgao_id: orgaoId,
          tipo_acao: 'IMPORTACAO_CONTRATO',
          status: 'SUCESSO',
          created_at: seteDiasAtras,
        },
      }),
    ]);

    const ultimaExecucao = await this.agenteLogRepo.findOne({
      where: { orgao_id: orgaoId },
      order: { created_at: 'DESC' },
    });

    return {
      total_acoes: total,
      sucessos,
      erros,
      contratos_importados_7dias: importacoes7dias,
      ultima_execucao: ultimaExecucao?.created_at,
    };
  }
}
