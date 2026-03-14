import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, ILike } from 'typeorm';
import { Veiculo } from './entities/veiculo.entity';
import { Abastecimento } from './entities/abastecimento.entity';
import { Manutencao } from './entities/manutencao.entity';

@Injectable()
export class FrotaService {
  constructor(
    @InjectRepository(Veiculo)
    private veiculoRepository: Repository<Veiculo>,
    @InjectRepository(Abastecimento)
    private abastecimentoRepository: Repository<Abastecimento>,
    @InjectRepository(Manutencao)
    private manutencaoRepository: Repository<Manutencao>,
  ) {}

  // ========== VEÍCULOS ==========

  async listarVeiculos(orgaoId: string, search?: string) {
    const where: any = { orgao_id: orgaoId };
    if (search) {
      return this.veiculoRepository.find({
        where: [
          { orgao_id: orgaoId, placa: ILike(`%${search}%`) },
          { orgao_id: orgaoId, modelo: ILike(`%${search}%`) },
          { orgao_id: orgaoId, marca: ILike(`%${search}%`) },
        ],
        order: { created_at: 'DESC' },
      });
    }
    return this.veiculoRepository.find({ where, order: { created_at: 'DESC' } });
  }

  async criarVeiculo(orgaoId: string, dados: Partial<Veiculo>) {
    const placaExistente = await this.veiculoRepository.findOne({
      where: { placa: dados.placa, orgao_id: orgaoId },
    });
    if (placaExistente) {
      throw new BadRequestException(`Já existe um veículo com a placa ${dados.placa}`);
    }
    const veiculo = this.veiculoRepository.create({ ...dados, orgao_id: orgaoId });
    return this.veiculoRepository.save(veiculo);
  }

  async atualizarVeiculo(id: string, orgaoId: string, dados: Partial<Veiculo>) {
    const veiculo = await this.veiculoRepository.findOne({ where: { id, orgao_id: orgaoId } });
    if (!veiculo) throw new NotFoundException('Veículo não encontrado');
    if (dados.placa && dados.placa !== veiculo.placa) {
      const placaExistente = await this.veiculoRepository.findOne({
        where: { placa: dados.placa, orgao_id: orgaoId },
      });
      if (placaExistente) throw new BadRequestException(`Já existe um veículo com a placa ${dados.placa}`);
    }
    Object.assign(veiculo, dados);
    return this.veiculoRepository.save(veiculo);
  }

  async excluirVeiculo(id: string, orgaoId: string) {
    const veiculo = await this.veiculoRepository.findOne({ where: { id, orgao_id: orgaoId } });
    if (!veiculo) throw new NotFoundException('Veículo não encontrado');
    await this.veiculoRepository.remove(veiculo);
  }

  // ========== ABASTECIMENTOS ==========

  async listarAbastecimentos(orgaoId: string, veiculoId?: string, dataInicio?: string, dataFim?: string) {
    const where: any = { orgao_id: orgaoId };
    if (veiculoId) where.veiculo_id = veiculoId;
    if (dataInicio && dataFim) where.data = Between(dataInicio, dataFim);
    return this.abastecimentoRepository.find({
      where,
      relations: ['veiculo'],
      order: { data: 'DESC', created_at: 'DESC' },
    });
  }

  async criarAbastecimento(orgaoId: string, dados: Partial<Abastecimento>) {
    const veiculo = await this.veiculoRepository.findOne({
      where: { id: dados.veiculo_id, orgao_id: orgaoId },
    });
    if (!veiculo) throw new NotFoundException('Veículo não encontrado');

    const valorTotal =
      dados.valor_total ?? Number(dados.quantidade_litros) * Number(dados.valor_litro);

    const abastecimento = this.abastecimentoRepository.create({
      ...dados,
      valor_total: valorTotal,
      orgao_id: orgaoId,
    });
    const salvo = await this.abastecimentoRepository.save(abastecimento);

    // Atualiza km do veículo se informado
    if (dados.km_hodometro && Number(dados.km_hodometro) > Number(veiculo.km_atual || 0)) {
      veiculo.km_atual = dados.km_hodometro;
      await this.veiculoRepository.save(veiculo);
    }
    return salvo;
  }

  async atualizarAbastecimento(id: string, orgaoId: string, dados: Partial<Abastecimento>) {
    const abastecimento = await this.abastecimentoRepository.findOne({
      where: { id, orgao_id: orgaoId },
    });
    if (!abastecimento) throw new NotFoundException('Abastecimento não encontrado');
    if (dados.quantidade_litros !== undefined || dados.valor_litro !== undefined) {
      const qtd = Number(dados.quantidade_litros ?? abastecimento.quantidade_litros);
      const vlr = Number(dados.valor_litro ?? abastecimento.valor_litro);
      dados.valor_total = dados.valor_total ?? qtd * vlr;
    }
    Object.assign(abastecimento, dados);
    return this.abastecimentoRepository.save(abastecimento);
  }

  async excluirAbastecimento(id: string, orgaoId: string) {
    const abastecimento = await this.abastecimentoRepository.findOne({
      where: { id, orgao_id: orgaoId },
    });
    if (!abastecimento) throw new NotFoundException('Abastecimento não encontrado');
    await this.abastecimentoRepository.remove(abastecimento);
  }

  // ========== MANUTENÇÕES ==========

  async listarManutencoes(orgaoId: string, veiculoId?: string, dataInicio?: string, dataFim?: string) {
    const where: any = { orgao_id: orgaoId };
    if (veiculoId) where.veiculo_id = veiculoId;
    if (dataInicio && dataFim) where.data = Between(dataInicio, dataFim);
    return this.manutencaoRepository.find({
      where,
      relations: ['veiculo'],
      order: { data: 'DESC', created_at: 'DESC' },
    });
  }

  async criarManutencao(orgaoId: string, dados: Partial<Manutencao>) {
    const veiculo = await this.veiculoRepository.findOne({
      where: { id: dados.veiculo_id, orgao_id: orgaoId },
    });
    if (!veiculo) throw new NotFoundException('Veículo não encontrado');
    const manutencao = this.manutencaoRepository.create({ ...dados, orgao_id: orgaoId });
    const salvo = await this.manutencaoRepository.save(manutencao);
    if (dados.km_hodometro && Number(dados.km_hodometro) > Number(veiculo.km_atual || 0)) {
      veiculo.km_atual = dados.km_hodometro;
      await this.veiculoRepository.save(veiculo);
    }
    return salvo;
  }

  async atualizarManutencao(id: string, orgaoId: string, dados: Partial<Manutencao>) {
    const manutencao = await this.manutencaoRepository.findOne({
      where: { id, orgao_id: orgaoId },
    });
    if (!manutencao) throw new NotFoundException('Manutenção não encontrada');
    Object.assign(manutencao, dados);
    return this.manutencaoRepository.save(manutencao);
  }

  async excluirManutencao(id: string, orgaoId: string) {
    const manutencao = await this.manutencaoRepository.findOne({
      where: { id, orgao_id: orgaoId },
    });
    if (!manutencao) throw new NotFoundException('Manutenção não encontrada');
    await this.manutencaoRepository.remove(manutencao);
  }

  // ========== RESUMO / DASHBOARD ==========

  async obterResumo(orgaoId: string, mes?: string) {
    const veiculos = await this.veiculoRepository.count({ where: { orgao_id: orgaoId, ativo: true } });

    let filtroData: any = {};
    if (mes) {
      const [ano, m] = mes.split('-');
      const inicio = `${ano}-${m}-01`;
      const fim = `${ano}-${m}-31`;
      filtroData = { orgao_id: orgaoId, data: Between(inicio, fim) };
    } else {
      filtroData = { orgao_id: orgaoId };
    }

    const abastecimentos = await this.abastecimentoRepository.find({ where: filtroData });
    const manutencoes = await this.manutencaoRepository.find({ where: filtroData });

    const totalAbastecimentos = abastecimentos.reduce((s, a) => s + Number(a.valor_total), 0);
    const totalLitros = abastecimentos.reduce((s, a) => s + Number(a.quantidade_litros), 0);
    const totalManutencoes = manutencoes.reduce((s, m) => s + Number(m.valor), 0);
    const totalGeral = totalAbastecimentos + totalManutencoes;

    return {
      total_veiculos: veiculos,
      total_abastecimentos: abastecimentos.length,
      total_litros: totalLitros,
      valor_abastecimentos: totalAbastecimentos,
      valor_manutencoes: totalManutencoes,
      valor_total: totalGeral,
    };
  }
}
