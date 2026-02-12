import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contrato, ModalidadeExecucao } from './entities/contrato.entity';
import { LicencaControle, StatusLicenca } from './entities/licenca-controle.entity';

@Injectable()
export class LicencaControleService {
  private readonly logger = new Logger(LicencaControleService.name);

  constructor(
    @InjectRepository(Contrato)
    private contratoRepository: Repository<Contrato>,
    @InjectRepository(LicencaControle)
    private licencaRepository: Repository<LicencaControle>,
  ) {}

  // ============================================================================
  // CRUD LICENÇAS
  // ============================================================================

  async criarLicenca(contratoId: string, dados: Partial<LicencaControle>): Promise<LicencaControle> {
    await this.validarContratoLicenca(contratoId);

    const licenca = this.licencaRepository.create({
      ...dados,
      contrato_id: contratoId,
      status: StatusLicenca.ATIVA,
    });

    return this.licencaRepository.save(licenca);
  }

  async listarLicencas(contratoId: string): Promise<LicencaControle[]> {
    return this.licencaRepository.find({
      where: { contrato_id: contratoId },
      order: { created_at: 'ASC' },
    });
  }

  async buscarLicenca(licencaId: string): Promise<LicencaControle> {
    const licenca = await this.licencaRepository.findOne({ where: { id: licencaId } });
    if (!licenca) throw new NotFoundException('Licença não encontrada');
    return licenca;
  }

  async atualizarLicenca(licencaId: string, dados: Partial<LicencaControle>): Promise<LicencaControle> {
    const licenca = await this.buscarLicenca(licencaId);
    Object.assign(licenca, dados);
    return this.licencaRepository.save(licenca);
  }

  async excluirLicenca(licencaId: string): Promise<void> {
    const licenca = await this.buscarLicenca(licencaId);
    if (licenca.quantidade_ativa > 0) {
      throw new BadRequestException('Não é possível excluir licença com ativações em uso');
    }
    await this.licencaRepository.remove(licenca);
  }

  // ============================================================================
  // CONTROLE DE ATIVAÇÃO
  // ============================================================================

  async ativarLicencas(licencaId: string, quantidade: number): Promise<LicencaControle> {
    const licenca = await this.buscarLicenca(licencaId);

    if (licenca.status !== StatusLicenca.ATIVA) {
      throw new BadRequestException(`Licença não está ativa (status: ${licenca.status})`);
    }

    const disponivel = licenca.quantidade_contratada - licenca.quantidade_ativa;
    if (quantidade > disponivel) {
      throw new BadRequestException(
        `Quantidade solicitada (${quantidade}) excede o disponível (${disponivel})`
      );
    }

    licenca.quantidade_ativa += quantidade;

    this.logger.log(
      `Licença "${licenca.descricao}": +${quantidade} ativadas (total ativo: ${licenca.quantidade_ativa}/${licenca.quantidade_contratada})`
    );

    return this.licencaRepository.save(licenca);
  }

  async desativarLicencas(licencaId: string, quantidade: number): Promise<LicencaControle> {
    const licenca = await this.buscarLicenca(licencaId);

    if (quantidade > licenca.quantidade_ativa) {
      throw new BadRequestException(
        `Quantidade a desativar (${quantidade}) excede o ativo (${licenca.quantidade_ativa})`
      );
    }

    licenca.quantidade_ativa -= quantidade;

    this.logger.log(
      `Licença "${licenca.descricao}": -${quantidade} desativadas (total ativo: ${licenca.quantidade_ativa}/${licenca.quantidade_contratada})`
    );

    return this.licencaRepository.save(licenca);
  }

  async suspenderLicenca(licencaId: string): Promise<LicencaControle> {
    const licenca = await this.buscarLicenca(licencaId);
    licenca.status = StatusLicenca.SUSPENSA;
    return this.licencaRepository.save(licenca);
  }

  async reativarLicenca(licencaId: string): Promise<LicencaControle> {
    const licenca = await this.buscarLicenca(licencaId);
    if (licenca.status !== StatusLicenca.SUSPENSA) {
      throw new BadRequestException('Apenas licenças suspensas podem ser reativadas');
    }
    licenca.status = StatusLicenca.ATIVA;
    return this.licencaRepository.save(licenca);
  }

  // ============================================================================
  // RESUMO E ALERTAS
  // ============================================================================

  async resumoLicencas(contratoId: string) {
    const contrato = await this.validarContratoLicenca(contratoId);
    const licencas = await this.listarLicencas(contratoId);

    const totalContratadas = licencas.reduce((sum, l) => sum + l.quantidade_contratada, 0);
    const totalAtivas = licencas.reduce((sum, l) => sum + l.quantidade_ativa, 0);
    const valorTotal = licencas.reduce((sum, l) => sum + Number(l.valor_total_contratado), 0);

    const hoje = new Date();
    const licencasExpirandoEm30Dias = licencas.filter(l => {
      const expiracao = new Date(l.data_expiracao);
      const diff = (expiracao.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);
      return diff > 0 && diff <= 30;
    });

    const licencasExpiradas = licencas.filter(l => {
      return new Date(l.data_expiracao) < hoje && l.status !== StatusLicenca.EXPIRADA;
    });

    return {
      contrato_id: contratoId,
      total_licencas: licencas.length,
      total_contratadas: totalContratadas,
      total_ativas: totalAtivas,
      total_disponiveis: totalContratadas - totalAtivas,
      valor_total_contratado: valorTotal,
      licencas_expirando_30_dias: licencasExpirandoEm30Dias.length,
      licencas_expiradas: licencasExpiradas.length,
      licencas,
    };
  }

  async verificarExpiracoes(contratoId: string): Promise<LicencaControle[]> {
    const licencas = await this.listarLicencas(contratoId);
    const hoje = new Date();
    const atualizadas: LicencaControle[] = [];

    for (const licenca of licencas) {
      if (licenca.status === StatusLicenca.ATIVA && new Date(licenca.data_expiracao) < hoje) {
        licenca.status = StatusLicenca.EXPIRADA;
        await this.licencaRepository.save(licenca);
        atualizadas.push(licenca);
        this.logger.warn(`Licença "${licenca.descricao}" expirada automaticamente`);
      }
    }

    return atualizadas;
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async validarContratoLicenca(contratoId: string): Promise<Contrato> {
    const contrato = await this.contratoRepository.findOne({ where: { id: contratoId } });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');

    if (contrato.modalidade_execucao !== ModalidadeExecucao.LICENCA) {
      throw new BadRequestException(
        `Contrato ${contrato.numero_contrato} não é da modalidade LICENCA (atual: ${contrato.modalidade_execucao})`
      );
    }

    return contrato;
  }
}
