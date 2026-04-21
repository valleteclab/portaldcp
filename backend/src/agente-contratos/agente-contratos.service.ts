import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import {
  AgenteLog,
  AgenteAcaoTipo,
  AgenteStatus,
} from './entities/agente-log.entity';
import { PortalTransparenciaService } from '../contratos/portal-transparencia.service';
import {
  Contrato,
  StatusContrato,
} from '../contratos/entities/contrato.entity';
import {
  StatusTermoAditivo,
  TermoAditivo,
} from '../contratos/entities/termo-aditivo.entity';

interface AditivoPortal {
  nome: string;
  tipo: string;
  valor: string;
  vigencia: string;
  fiscal: string;
  pdf_url: string;
}

export interface ContratoComPendenciaAditivo {
  contrato_id: string;
  numero_contrato: string;
  status_contrato: StatusContrato;
  fornecedor_nome: string;
  data_vigencia_fim?: Date | null;
  aditivos_portal_total: number;
  termos_cadastrados_total: number;
  pendentes_total: number;
  link_contrato: string;
  aditivos_pendentes: AditivoPortal[];
}

export interface CicloAgenteResult {
  contratos_analisados: number;
  contratos_com_pendencias: number;
  contratos_sem_pendencias: number;
  contratos_sem_aditivos_no_portal: number;
  erros: number;
  pendencias: ContratoComPendenciaAditivo[];
  detalhes: Array<{
    numero_contrato: string;
    status: 'pendencia' | 'sem_pendencia' | 'sem_aditivos' | 'erro';
    mensagem: string;
  }>;
}

@Injectable()
export class AgenteContratosService {
  private readonly logger = new Logger(AgenteContratosService.name);

  constructor(
    @InjectRepository(AgenteLog)
    private readonly agenteLogRepo: Repository<AgenteLog>,
    @InjectRepository(Contrato)
    private readonly contratoRepo: Repository<Contrato>,
    private readonly portalTransparenciaService: PortalTransparenciaService,
  ) {}

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Erro inesperado';
  }

  async executarCicloDiario(orgaoId: string): Promise<CicloAgenteResult> {
    this.logger.log(
      `[AgenteContratos] Iniciando verificacao de aditivos pendentes para orgao ${orgaoId}`,
    );

    const resultado: CicloAgenteResult = {
      contratos_analisados: 0,
      contratos_com_pendencias: 0,
      contratos_sem_pendencias: 0,
      contratos_sem_aditivos_no_portal: 0,
      erros: 0,
      pendencias: [],
      detalhes: [],
    };

    const contratosAlvo = await this.contratoRepo
      .createQueryBuilder('contrato')
      .leftJoinAndSelect('contrato.fornecedor', 'fornecedor')
      .leftJoinAndSelect('contrato.termos_aditivos', 'termo')
      .where('contrato.orgao_id = :orgaoId', { orgaoId })
      .andWhere('contrato.status IN (:...statuses)', {
        statuses: [StatusContrato.VENCIDO, StatusContrato.ENCERRADO],
      })
      .orderBy('contrato.data_vigencia_fim', 'DESC')
      .getMany();
    resultado.contratos_analisados = contratosAlvo.length;

    await this.criarLog({
      tipo_acao: 'BUSCA_PORTAL',
      orgao_id: orgaoId,
      status: 'SUCESSO',
      mensagem: `Varredura iniciada para ${contratosAlvo.length} contrato(s) vencido(s)/encerrado(s)`,
      detalhes: {
        contratos_analisados: contratosAlvo.length,
      },
    });

    for (const contrato of contratosAlvo) {
      try {
        const respostaPortal =
          await this.portalTransparenciaService.buscarAditivosPorContratoId(
            contrato.id,
          );
        const termosValidos = (contrato.termos_aditivos || []).filter(
          (termo) => termo.status !== StatusTermoAditivo.CANCELADO,
        );

        if (!respostaPortal.aditivos.length) {
          resultado.contratos_sem_aditivos_no_portal++;
          resultado.detalhes.push({
            numero_contrato: contrato.numero_contrato,
            status: 'sem_aditivos',
            mensagem:
              'Nenhum termo aditivo encontrado no Portal de Transparencia.',
          });
          continue;
        }

        const aditivosPendentes = respostaPortal.aditivos.filter(
          (aditivo) => !this.aditivoJaCadastrado(aditivo, termosValidos),
        );

        if (!aditivosPendentes.length) {
          resultado.contratos_sem_pendencias++;
          resultado.detalhes.push({
            numero_contrato: contrato.numero_contrato,
            status: 'sem_pendencia',
            mensagem: `${respostaPortal.aditivos.length} aditivo(s) encontrado(s) e todos ja cadastrados no sistema.`,
          });
          continue;
        }

        resultado.contratos_com_pendencias++;
        resultado.pendencias.push({
          contrato_id: contrato.id,
          numero_contrato: contrato.numero_contrato,
          status_contrato: contrato.status,
          fornecedor_nome:
            contrato.fornecedor?.razao_social ||
            contrato.fornecedor?.nome_fantasia ||
            'Fornecedor nao identificado',
          data_vigencia_fim: contrato.data_vigencia_fim || null,
          aditivos_portal_total: respostaPortal.aditivos.length,
          termos_cadastrados_total: termosValidos.length,
          pendentes_total: aditivosPendentes.length,
          link_contrato: `/orgao/contratos/${contrato.id}?tab=termos`,
          aditivos_pendentes: aditivosPendentes,
        });
        resultado.detalhes.push({
          numero_contrato: contrato.numero_contrato,
          status: 'pendencia',
          mensagem: `${aditivosPendentes.length} aditivo(s) encontrado(s) no Portal e ainda nao cadastrado(s) no sistema.`,
        });

        await this.criarLog({
          tipo_acao: 'ANALISE',
          orgao_id: orgaoId,
          contrato_id: contrato.id,
          contrato_numero: contrato.numero_contrato,
          status: 'AVISO',
          mensagem: `${aditivosPendentes.length} termo(s) aditivo(s) pendente(s) para cadastro`,
          detalhes: {
            aditivos_portal_total: respostaPortal.aditivos.length,
            termos_cadastrados_total: termosValidos.length,
            pendentes_total: aditivosPendentes.length,
            aditivos_pendentes: aditivosPendentes.map((aditivo) => ({
              nome: aditivo.nome,
              tipo: aditivo.tipo,
              vigencia: aditivo.vigencia,
              pdf_url: aditivo.pdf_url,
            })),
          },
        });
      } catch (error: unknown) {
        const mensagemErro = this.getErrorMessage(error);
        resultado.erros++;
        resultado.detalhes.push({
          numero_contrato: contrato.numero_contrato,
          status: 'erro',
          mensagem: mensagemErro,
        });

        await this.criarLog({
          tipo_acao: 'ANALISE',
          orgao_id: orgaoId,
          contrato_id: contrato.id,
          contrato_numero: contrato.numero_contrato,
          status: 'ERRO',
          mensagem: `Erro ao verificar aditivos pendentes: ${mensagemErro}`,
          detalhes: {
            erro: mensagemErro,
          },
        });
      }
    }

    await this.criarLog({
      tipo_acao: 'ANALISE',
      orgao_id: orgaoId,
      status: resultado.contratos_com_pendencias > 0 ? 'AVISO' : 'SUCESSO',
      mensagem:
        resultado.contratos_com_pendencias > 0
          ? `${resultado.contratos_com_pendencias} contrato(s) com termo(s) aditivo(s) pendente(s) de cadastro`
          : 'Nenhum termo aditivo pendente encontrado nos contratos analisados',
      detalhes: {
        contratos_analisados: resultado.contratos_analisados,
        contratos_com_pendencias: resultado.contratos_com_pendencias,
        contratos_sem_pendencias: resultado.contratos_sem_pendencias,
        contratos_sem_aditivos_no_portal:
          resultado.contratos_sem_aditivos_no_portal,
        erros: resultado.erros,
      },
    });

    return resultado;
  }

  private extrairSequencialPortal(nome: string): number | null {
    const match =
      (nome || '').match(/(\d+)\s*[ºo]/i) || (nome || '').match(/^(\d+)/);
    return match ? Number(match[1]) : null;
  }

  private normalizarTexto(valor?: string | null): string {
    return (valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase();
  }

  private aditivoJaCadastrado(
    aditivoPortal: AditivoPortal,
    termos: TermoAditivo[],
  ): boolean {
    const sequencialPortal = this.extrairSequencialPortal(aditivoPortal.nome);
    const nomePortalNormalizado = this.normalizarTexto(aditivoPortal.nome);

    return termos.some((termo) => {
      const numeroTermoNormalizado = this.normalizarTexto(termo.numero_termo);
      const objetoNormalizado = this.normalizarTexto(termo.objeto);

      if (sequencialPortal !== null && termo.sequencial === sequencialPortal) {
        return true;
      }

      if (
        numeroTermoNormalizado &&
        nomePortalNormalizado.includes(numeroTermoNormalizado)
      ) {
        return true;
      }

      if (
        objetoNormalizado &&
        nomePortalNormalizado.includes(objetoNormalizado)
      ) {
        return true;
      }

      return false;
    });
  }

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

  async obterLogsRecentes(
    orgaoId: string,
    limite: number = 50,
  ): Promise<AgenteLog[]> {
    return this.agenteLogRepo.find({
      where: { orgao_id: orgaoId },
      order: { created_at: 'DESC' },
      take: limite,
    });
  }

  async obterEstatisticas(orgaoId: string): Promise<{
    total_acoes: number;
    sucessos: number;
    avisos: number;
    erros: number;
    contratos_com_pendencias_7dias: number;
    ultima_execucao?: Date;
  }> {
    const seteDiasAtras = new Date();
    seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);

    const [total, sucessos, avisos, erros, pendencias7dias, ultimaExecucao] =
      await Promise.all([
        this.agenteLogRepo.count({ where: { orgao_id: orgaoId } }),
        this.agenteLogRepo.count({
          where: { orgao_id: orgaoId, status: 'SUCESSO' },
        }),
        this.agenteLogRepo.count({
          where: { orgao_id: orgaoId, status: 'AVISO' },
        }),
        this.agenteLogRepo.count({
          where: { orgao_id: orgaoId, status: 'ERRO' },
        }),
        this.agenteLogRepo.count({
          where: {
            orgao_id: orgaoId,
            tipo_acao: 'ANALISE',
            status: 'AVISO',
            created_at: MoreThanOrEqual(seteDiasAtras),
          },
        }),
        this.agenteLogRepo.findOne({
          where: { orgao_id: orgaoId },
          order: { created_at: 'DESC' },
        }),
      ]);

    return {
      total_acoes: total,
      sucessos,
      avisos,
      erros,
      contratos_com_pendencias_7dias: pendencias7dias,
      ultima_execucao: ultimaExecucao?.created_at,
    };
  }
}
