import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, ILike, Like, Or, DataSource } from 'typeorm';
import * as crypto from 'crypto';
import { Veiculo } from './entities/veiculo.entity';
import { Abastecimento } from './entities/abastecimento.entity';
import { Manutencao } from './entities/manutencao.entity';
import { FrotaContrato } from './entities/frota-contrato.entity';
import { FrotaRequisicao, StatusRequisicaoFrota } from './entities/frota-requisicao.entity';
import { ContratosService } from '../contratos/contratos.service';
import { UnidadeMedidaContrato } from '../almoxarifado/entities/item-contrato.entity';
import { fimDoMesBrasil } from './frota.utils';

@Injectable()
export class FrotaService {
  constructor(
    @InjectRepository(Veiculo)
    private veiculoRepository: Repository<Veiculo>,
    @InjectRepository(Abastecimento)
    private abastecimentoRepository: Repository<Abastecimento>,
    @InjectRepository(Manutencao)
    private manutencaoRepository: Repository<Manutencao>,
    @InjectRepository(FrotaContrato)
    private contratoRepository: Repository<FrotaContrato>,
    @InjectRepository(FrotaRequisicao)
    private requisicaoRepository: Repository<FrotaRequisicao>,
    private contratosService: ContratosService,
    private dataSource: DataSource,
  ) {}

  // ============================================================
  // VEÍCULOS
  // ============================================================

  async listarVeiculos(orgaoId: string, search?: string) {
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
    return this.veiculoRepository.find({
      where: { orgao_id: orgaoId },
      order: { created_at: 'DESC' },
    });
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

  // ============================================================
  // ABASTECIMENTOS (registro livre — legado)
  // ============================================================

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
    const valorTotal = dados.valor_total ?? Number(dados.quantidade_litros) * Number(dados.valor_litro);
    const abastecimento = this.abastecimentoRepository.create({ ...dados, valor_total: valorTotal, orgao_id: orgaoId });
    const salvo = await this.abastecimentoRepository.save(abastecimento);
    if (dados.km_hodometro && Number(dados.km_hodometro) > Number(veiculo.km_atual || 0)) {
      veiculo.km_atual = dados.km_hodometro;
      await this.veiculoRepository.save(veiculo);
    }
    return salvo;
  }

  async atualizarAbastecimento(id: string, orgaoId: string, dados: Partial<Abastecimento>) {
    const abastecimento = await this.abastecimentoRepository.findOne({ where: { id, orgao_id: orgaoId } });
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
    const abastecimento = await this.abastecimentoRepository.findOne({ where: { id, orgao_id: orgaoId } });
    if (!abastecimento) throw new NotFoundException('Abastecimento não encontrado');
    await this.abastecimentoRepository.remove(abastecimento);
  }

  // ============================================================
  // MANUTENÇÕES
  // ============================================================

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
    const veiculo = await this.veiculoRepository.findOne({ where: { id: dados.veiculo_id, orgao_id: orgaoId } });
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
    const manutencao = await this.manutencaoRepository.findOne({ where: { id, orgao_id: orgaoId } });
    if (!manutencao) throw new NotFoundException('Manutenção não encontrada');
    Object.assign(manutencao, dados);
    return this.manutencaoRepository.save(manutencao);
  }

  async excluirManutencao(id: string, orgaoId: string) {
    const manutencao = await this.manutencaoRepository.findOne({ where: { id, orgao_id: orgaoId } });
    if (!manutencao) throw new NotFoundException('Manutenção não encontrada');
    await this.manutencaoRepository.remove(manutencao);
  }

  // ============================================================
  // CONTRATOS DE ABASTECIMENTO
  // ============================================================

  async listarContratos(orgaoId: string) {
    const contratos = await this.contratoRepository.find({
      where: { orgao_id: orgaoId },
      order: { data_inicio: 'DESC' },
    });

    // Enriquecer com dados de consumo calculados a partir das requisições
    const consumo = await this.requisicaoRepository
      .createQueryBuilder('r')
      .select('r.contrato_id', 'contrato_id')
      .addSelect('SUM(r.quantidade_abastecida)', 'litros_consumidos')
      .addSelect('SUM(r.valor_total)', 'valor_consumido')
      .where('r.orgao_id = :orgaoId', { orgaoId })
      .andWhere('r.status = :status', { status: StatusRequisicaoFrota.ABASTECIDO })
      .andWhere('r.contrato_id IS NOT NULL')
      .groupBy('r.contrato_id')
      .getRawMany();

    const consumoMap = new Map(consumo.map(c => [c.contrato_id, c]));

    return contratos.map(c => {
      const cons = consumoMap.get(c.id);
      const litros_consumidos = parseFloat(cons?.litros_consumidos || '0');
      const valor_consumido = parseFloat(cons?.valor_consumido || '0');

      // saldo inicial: da soma dos itens importados, ou nulo se só tem limite mensal
      const itens = c.itens || [];
      const saldo_inicial_litros = itens.length > 0
        ? itens.reduce((s, i) => s + Number(i.quantidade_contratada || 0), 0)
        : null;
      const valor_total_contrato = itens.length > 0
        ? itens.reduce((s, i) => s + Number(i.valor_total || 0), 0)
        : null;

      return {
        ...c,
        litros_consumidos,
        valor_consumido,
        saldo_inicial_litros,
        valor_total_contrato,
        saldo_litros: saldo_inicial_litros !== null ? saldo_inicial_litros - litros_consumidos : null,
        saldo_valor: valor_total_contrato !== null ? valor_total_contrato - valor_consumido : null,
      };
    });
  }

  async obterContratoAtivo(orgaoId: string): Promise<FrotaContrato | null> {
    const hoje = new Date().toISOString().split('T')[0];
    const contratos = await this.contratoRepository.find({
      where: { orgao_id: orgaoId, ativo: true },
      order: { data_inicio: 'DESC' },
    });
    return contratos.find(c => c.data_inicio <= hoje && c.data_fim >= hoje) || null;
  }

  async criarContrato(orgaoId: string, dados: Partial<FrotaContrato>) {
    const contrato = this.contratoRepository.create({ ...dados, orgao_id: orgaoId });
    return this.contratoRepository.save(contrato);
  }

  async atualizarContrato(id: string, orgaoId: string, dados: Partial<FrotaContrato>) {
    const contrato = await this.contratoRepository.findOne({ where: { id, orgao_id: orgaoId } });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    Object.assign(contrato, dados);
    return this.contratoRepository.save(contrato);
  }

  async excluirContrato(id: string, orgaoId: string) {
    const contrato = await this.contratoRepository.findOne({ where: { id, orgao_id: orgaoId } });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    await this.contratoRepository.remove(contrato);
  }

  /**
   * Importa um contrato do cadastro de contratos para o módulo de frota.
   * Preenche automaticamente: número, fornecedor, datas de vigência.
   * Se o contrato tiver itens em LITRO, tenta usar o valor_unitario como preço/litro.
   */
  async importarDeContrato(
    orgaoId: string,
    contratoId: string,
    dados: { preco_litro?: number; limite_litros_mensal?: number },
  ): Promise<FrotaContrato> {
    const contrato = await this.contratosService.findOne(contratoId);
    if (contrato.orgao_id !== orgaoId) {
      throw new BadRequestException('Contrato não pertence a este órgão');
    }

    const jaImportado = await this.contratoRepository.findOne({
      where: { contrato_id: contratoId, orgao_id: orgaoId },
    });
    if (jaImportado) {
      throw new BadRequestException(
        `Este contrato já foi importado (Frota: ${jaImportado.numero_contrato})`,
      );
    }

    const itensContrato = (contrato as any).itens || [];
    const itensLitros = itensContrato.filter(
      (i: any) => i.unidade_medida === UnidadeMedidaContrato.LITRO,
    );

    const itensImportados = itensLitros.map((i: any) => {
      const qtdContratada = Number(i.quantidade_contratada) || 0;
      const saldoDisp = Number(i.saldo_disponivel) ?? (
        qtdContratada - Number(i.quantidade_entregue ?? 0) - Number(i.quantidade_empenhada ?? 0)
      );
      const qtdConsumida = Math.max(0, qtdContratada - saldoDisp);
      return {
        descricao: i.descricao || '',
        unidade_medida: i.unidade_medida || 'LITRO',
        preco_litro: Number(i.valor_unitario) || 0,
        quantidade_contratada: qtdContratada,
        quantidade_consumida: qtdConsumida,
        valor_total: Number(i.valor_total) || 0,
        item_contrato_id: i.id,
      };
    });

    let precoLitro: number | null = null;
    if (itensImportados.length > 0) {
      precoLitro = itensImportados[0].preco_litro;
    } else {
      precoLitro = Number(dados.preco_litro) || 0;
      if (precoLitro <= 0) {
        throw new BadRequestException(
          'Informe o preço por litro ou cadastre itens em LITRO no contrato',
        );
      }
    }

    const dataInicio =
      contrato.data_vigencia_inicio instanceof Date
        ? contrato.data_vigencia_inicio.toISOString().split('T')[0]
        : String(contrato.data_vigencia_inicio).split('T')[0];
    const dataFim =
      contrato.data_vigencia_fim instanceof Date
        ? contrato.data_vigencia_fim.toISOString().split('T')[0]
        : String(contrato.data_vigencia_fim).split('T')[0];

    const frotaContrato = this.contratoRepository.create({
      orgao_id: orgaoId,
      contrato_id: contratoId,
      numero_contrato: contrato.numero_contrato,
      fornecedor_nome: contrato.fornecedor_razao_social,
      fornecedor_cnpj: contrato.fornecedor_cnpj || null,
      preco_litro: precoLitro,
      limite_litros_mensal: dados.limite_litros_mensal
        ? Number(dados.limite_litros_mensal)
        : null,
      data_inicio: dataInicio,
      data_fim: dataFim,
      observacoes: contrato.observacoes || null,
      ativo: true,
      itens: itensImportados.length > 0 ? itensImportados : null,
    });

    return this.contratoRepository.save(frotaContrato);
  }

  // ============================================================
  // REQUISIÇÕES DE ABASTECIMENTO
  // ============================================================

  /**
   * Obtém o preço por litro do contrato para um tipo de combustível.
   * Se o contrato tiver itens, busca o item cuja descrição corresponda ao tipo (ex: DIESEL, GASOLINA).
   * Caso contrário, usa preco_litro do contrato (retrocompatibilidade).
   */
  private getPrecoLitroContrato(
    contrato: FrotaContrato | null | undefined,
    tipoCombustivel: string,
  ): number {
    if (!contrato) return 0;
    const itens = contrato.itens;
    if (Array.isArray(itens) && itens.length > 0) {
      const tipo = String(tipoCombustivel || '').toLowerCase();
      const item = itens.find((i) => {
        const desc = String(i.descricao || '').toLowerCase();
        return desc.includes(tipo) || tipo.includes(desc) || desc === tipo;
      });
      if (item && item.preco_litro != null) return Number(item.preco_litro);
    }
    return Number(contrato.preco_litro || 0);
  }

  /**
   * Obtém o saldo disponível em litros do contrato para um tipo de combustível.
   * Retorna Infinity quando o contrato não tem itens (sem controle de saldo).
   */
  private getSaldoDisponivelContrato(
    contrato: FrotaContrato | null | undefined,
    tipoCombustivel: string,
  ): number {
    if (!contrato) return Infinity;
    const itens = contrato.itens;
    if (Array.isArray(itens) && itens.length > 0) {
      const tipo = String(tipoCombustivel || '').toLowerCase();
      const item = itens.find((i) => {
        const desc = String(i.descricao || '').toLowerCase();
        return desc.includes(tipo) || tipo.includes(desc) || desc === tipo;
      });
      if (item) {
        const qtdContratada = Number(item.quantidade_contratada) || 0;
        const qtdConsumida = Number(item.quantidade_consumida ?? 0) || 0;
        return Math.max(0, qtdContratada - qtdConsumida);
      }
    }
    return Infinity;
  }

  private async gerarCodigoRequisicao(orgaoId: string): Promise<string> {
    const ano = new Date().getFullYear();
    const count = await this.requisicaoRepository.count({
      where: { orgao_id: orgaoId, codigo: Like(`REQ-${ano}-%`) },
    });
    const seq = String(count + 1).padStart(4, '0');
    return `REQ-${ano}-${seq}`;
  }

  async listarRequisicoes(orgaoId: string, mes?: string, status?: string) {
    const where: any = { orgao_id: orgaoId };
    if (status && status !== 'TODOS') where.status = status;
    if (mes) {
      const [ano, m] = mes.split('-');
      where.data_requisicao = Between(`${ano}-${m}-01`, `${ano}-${m}-31`);
    }
    return this.requisicaoRepository.find({
      where,
      relations: ['contrato'],
      order: { created_at: 'DESC' },
    });
  }

  async criarRequisicao(orgaoId: string, dados: any) {
    const codigo = await this.gerarCodigoRequisicao(orgaoId);

    // Se informou veiculo_id, preenche dados do veículo automaticamente
    if (dados.veiculo_id) {
      const veiculo = await this.veiculoRepository.findOne({
        where: { id: dados.veiculo_id, orgao_id: orgaoId },
      });
      if (veiculo) {
        dados.veiculo_placa = dados.veiculo_placa || veiculo.placa;
        dados.veiculo_modelo = dados.veiculo_modelo || `${veiculo.modelo} (${veiculo.marca})`;
        dados.veiculo_chassi = dados.veiculo_chassi || veiculo.chassi;
        dados.veiculo_renavam = dados.veiculo_renavam || veiculo.renavam;
        dados.tipo_combustivel = dados.tipo_combustivel || veiculo.tipo_combustivel;
      }
    }

    // Vincula ao contrato ativo se não especificado
    if (!dados.contrato_id) {
      const contratoAtivo = await this.obterContratoAtivo(orgaoId);
      if (contratoAtivo) dados.contrato_id = contratoAtivo.id;
    }

    // Validar saldo disponível
    if (dados.contrato_id) {
      const contrato = await this.contratoRepository.findOne({ where: { id: dados.contrato_id, orgao_id: orgaoId } });
      const qtdAutorizada = Number(dados.quantidade_autorizada) || 0;
      const saldo = this.getSaldoDisponivelContrato(contrato, dados.tipo_combustivel || '');
      if (saldo !== Infinity && qtdAutorizada > saldo) {
        throw new BadRequestException(
          `Saldo insuficiente. Disponível: ${saldo.toLocaleString('pt-BR', { minimumFractionDigits: 3 })} L para ${dados.tipo_combustivel || 'este combustível'}. Solicitado: ${qtdAutorizada.toLocaleString('pt-BR', { minimumFractionDigits: 3 })} L.`,
        );
      }
    }

    const data_requisicao = dados.data_requisicao || new Date().toISOString().split('T')[0];
    // O código é sequencial por contagem: dois pedidos no mesmo instante podem
    // calcular o mesmo número. O índice único barra o segundo — recalcula e tenta de novo.
    let codigoAtual = codigo;
    for (let tentativa = 0; ; tentativa++) {
      const requisicao = this.requisicaoRepository.create({
        ...dados,
        codigo: codigoAtual,
        data_requisicao,
        status: StatusRequisicaoFrota.PENDENTE,
        orgao_id: orgaoId,
      });
      try {
        return await this.requisicaoRepository.save(requisicao);
      } catch (err: any) {
        const colisao = err?.code === '23505' && String(err?.detail || '').includes('(codigo)');
        if (!colisao || tentativa >= 4) throw err;
        codigoAtual = await this.gerarCodigoRequisicao(orgaoId);
      }
    }
  }

  async atualizarRequisicao(id: string, orgaoId: string, dados: any) {
    const req = await this.requisicaoRepository.findOne({ where: { id, orgao_id: orgaoId } });
    if (!req) throw new NotFoundException('Requisição não encontrada');
    if (req.status !== StatusRequisicaoFrota.PENDENTE) {
      throw new BadRequestException('Apenas requisições pendentes podem ser editadas');
    }
    Object.assign(req, dados);
    return this.requisicaoRepository.save(req);
  }

  async autorizarRequisicao(id: string, orgaoId: string, autorizadoPor: string) {
    // Lock na requisição (evita autorizar duas vezes) e no contrato (evita duas
    // autorizações simultâneas passarem na checagem de saldo com o mesmo saldo).
    return this.dataSource.transaction(async (manager) => {
      const req = await manager.findOne(FrotaRequisicao, {
        where: { id, orgao_id: orgaoId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!req) throw new NotFoundException('Requisição não encontrada');
      if (req.status !== StatusRequisicaoFrota.PENDENTE) {
        throw new BadRequestException('Apenas requisições pendentes podem ser autorizadas');
      }
      const contrato = req.contrato_id
        ? await manager.findOne(FrotaContrato, {
            where: { id: req.contrato_id, orgao_id: orgaoId },
            lock: { mode: 'pessimistic_write' },
          })
        : null;
      if (contrato) {
        const saldo = this.getSaldoDisponivelContrato(contrato, req.tipo_combustivel || '');
        const qtdAutorizada = Number(req.quantidade_autorizada) || 0;
        if (saldo !== Infinity && qtdAutorizada > saldo) {
          throw new BadRequestException(
            `Saldo insuficiente. Disponível: ${saldo.toLocaleString('pt-BR', { minimumFractionDigits: 3 })} L para ${req.tipo_combustivel || 'este combustível'}. Solicitado: ${qtdAutorizada.toLocaleString('pt-BR', { minimumFractionDigits: 3 })} L.`,
          );
        }
      }
      req.status = StatusRequisicaoFrota.AUTORIZADO;
      req.data_autorizacao = new Date();
      req.autorizado_por = autorizadoPor;
      // Código curto aleatório para o posto (6 chars, sem caracteres confusos)
      const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
      req.codigo_posto = Array.from(crypto.randomBytes(6))
        .map(b => CHARS[b % CHARS.length])
        .join('');
      // Gera token seguro para QR Code (32 bytes aleatórios = 64 hex chars)
      req.token_acesso = crypto.randomBytes(32).toString('hex');
      // Validade: até o fim do mês da autorização em horário Brasil (regra: usar dentro do mês)
      req.token_expiry = fimDoMesBrasil();
      return manager.save(FrotaRequisicao, req);
    });
  }

  async negarRequisicao(id: string, orgaoId: string, motivoNegacao: string) {
    const req = await this.requisicaoRepository.findOne({ where: { id, orgao_id: orgaoId } });
    if (!req) throw new NotFoundException('Requisição não encontrada');
    if (req.status !== StatusRequisicaoFrota.PENDENTE) {
      throw new BadRequestException('Apenas requisições pendentes podem ser negadas');
    }
    req.status = StatusRequisicaoFrota.NEGADO;
    req.motivo_negacao = motivoNegacao;
    return this.requisicaoRepository.save(req);
  }

  async cancelarRequisicao(id: string, orgaoId: string) {
    const req = await this.requisicaoRepository.findOne({ where: { id, orgao_id: orgaoId } });
    if (!req) throw new NotFoundException('Requisição não encontrada');
    if ([StatusRequisicaoFrota.ABASTECIDO].includes(req.status)) {
      throw new BadRequestException('Não é possível cancelar uma requisição já abastecida');
    }
    req.status = StatusRequisicaoFrota.CANCELADO;
    return this.requisicaoRepository.save(req);
  }

  async excluirRequisicao(id: string, orgaoId: string) {
    const req = await this.requisicaoRepository.findOne({
      where: { id, orgao_id: orgaoId },
      relations: ['contrato'],
    });
    if (!req) throw new NotFoundException('Requisição não encontrada');

    if (req.status === StatusRequisicaoFrota.ABASTECIDO && req.contrato_id && req.contrato?.itens) {
      const qtd = Number(req.quantidade_abastecida ?? req.quantidade_autorizada ?? 0);
      if (qtd > 0) {
        const tipo = String(req.tipo_combustivel || '').toLowerCase();
        const itens = [...req.contrato.itens];
        const idx = itens.findIndex((i) => {
          const desc = String(i.descricao || '').toLowerCase();
          return desc.includes(tipo) || tipo.includes(desc) || desc === tipo;
        });
        if (idx >= 0) {
          itens[idx].quantidade_consumida = Math.max(0, (itens[idx].quantidade_consumida ?? 0) - qtd);
          await this.contratoRepository.update(req.contrato_id, { itens });
        }
      }
    }

    await this.requisicaoRepository.remove(req);
  }

  /**
   * Verificar código. No painel público do posto vale SÓ o código de 6 letras
   * (aleatório): o número interno REQ-AAAA-NNNN é sequencial e permitiria ao
   * posto enumerar autorizações que o vereador não apresentou. O gestor, no
   * próprio painel, pode usar os dois.
   */
  async verificarCodigo(codigo: string, orgaoId: string, permitirCodigoInterno = false) {
    const upper = codigo.trim().toUpperCase();
    const where: any[] = [{ codigo_posto: upper, orgao_id: orgaoId }];
    if (permitirCodigoInterno) where.push({ codigo: upper, orgao_id: orgaoId });
    const req = await this.requisicaoRepository.findOne({ where, relations: ['contrato'] });
    if (!req) throw new NotFoundException('Código não encontrado');
    return req;
  }

  // Painel do posto: confirmar abastecimento
  async confirmarAbastecimento(id: string, orgaoId: string, dados: {
    quantidade_abastecida: number;
    atendente_nome?: string;
    km_hodometro?: number;
    observacoes?: string;
  }) {
    const qtd = Number(dados.quantidade_abastecida);
    if (!Number.isFinite(qtd) || qtd <= 0) {
      throw new BadRequestException('Informe a quantidade abastecida em litros.');
    }
    // Tudo dentro de UMA transação com lock: dois atendentes confirmando a mesma
    // autorização ao mesmo tempo (ou duas confirmações no mesmo contrato) não
    // podem baixar o consumo duas vezes nem abastecer uma requisição já usada.
    return this.dataSource.transaction(async (manager) => {
      const req = await manager.findOne(FrotaRequisicao, {
        where: { id, orgao_id: orgaoId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!req) throw new NotFoundException('Requisição não encontrada');
      if (req.status !== StatusRequisicaoFrota.AUTORIZADO) {
        throw new BadRequestException('Apenas requisições autorizadas podem ser confirmadas');
      }
      // Tolerância de 2% sobre o autorizado (a bomba pode passar alguns centilitros)
      const autorizada = Number(req.quantidade_autorizada) || 0;
      if (autorizada > 0 && qtd > autorizada * 1.02 + 0.0005) {
        throw new BadRequestException(
          `Quantidade abastecida (${qtd.toLocaleString('pt-BR', { minimumFractionDigits: 3 })} L) excede a autorizada (${autorizada.toLocaleString('pt-BR', { minimumFractionDigits: 3 })} L).`,
        );
      }

      const contrato = req.contrato_id
        ? await manager.findOne(FrotaContrato, {
            where: { id: req.contrato_id },
            lock: { mode: 'pessimistic_write' },
          })
        : null;
      const precoLitro = this.getPrecoLitroContrato(contrato, req.tipo_combustivel);

      req.status = StatusRequisicaoFrota.ABASTECIDO;
      req.data_abastecimento = new Date();
      req.quantidade_abastecida = qtd;
      req.valor_total = qtd * precoLitro;
      req.atendente_nome = dados.atendente_nome as any;
      req.km_hodometro = dados.km_hodometro as any;
      req.observacoes = dados.observacoes ?? req.observacoes;
      const salvo = await manager.save(FrotaRequisicao, req);

      // Atualiza quantidade_consumida no contrato (já bloqueado acima)
      if (contrato && Array.isArray(contrato.itens)) {
        const tipo = String(req.tipo_combustivel || '').toLowerCase();
        const itens = [...contrato.itens];
        const idx = itens.findIndex((i) => {
          const desc = String(i.descricao || '').toLowerCase();
          return desc.includes(tipo) || tipo.includes(desc) || desc === tipo;
        });
        if (idx >= 0) {
          itens[idx].quantidade_consumida = (itens[idx].quantidade_consumida ?? 0) + qtd;
          await manager.update(FrotaContrato, contrato.id, { itens });
        }
      }

      // Atualiza KM do veículo se informado
      if (req.veiculo_id && dados.km_hodometro) {
        const veiculo = await manager.findOne(Veiculo, { where: { id: req.veiculo_id } });
        if (veiculo && dados.km_hodometro > Number(veiculo.km_atual || 0)) {
          veiculo.km_atual = dados.km_hodometro;
          await manager.save(Veiculo, veiculo);
        }
      }
      return salvo;
    });
  }

  // ============================================================
  // DASHBOARD DO POSTO
  // ============================================================

  async obterDashboardPosto(orgaoId: string, mes?: string) {
    const mesAtual = mes || new Date().toISOString().slice(0, 7);
    const [ano, m] = mesAtual.split('-');
    const dataInicio = `${ano}-${m}-01`;
    const dataFim = `${ano}-${m}-31`;

    const contratoAtivo = await this.obterContratoAtivo(orgaoId);

    // Requisições do mês
    const requisicoes = await this.requisicaoRepository.find({
      where: { orgao_id: orgaoId, data_requisicao: Between(dataInicio, dataFim) },
      relations: ['contrato'],
      order: { created_at: 'DESC' },
    });

    const abastecidas = requisicoes.filter(r => r.status === StatusRequisicaoFrota.ABASTECIDO);
    const autorizadas = requisicoes.filter(r => r.status === StatusRequisicaoFrota.AUTORIZADO);

    const totalLitros = abastecidas.reduce((s, r) => s + Number(r.quantidade_abastecida || 0), 0);
    const totalValor = abastecidas.reduce((s, r) => s + Number(r.valor_total || 0), 0);
    const precoLitro = contratoAtivo
      ? (contratoAtivo.itens?.[0]?.preco_litro != null
          ? Number(contratoAtivo.itens[0].preco_litro)
          : Number(contratoAtivo.preco_litro || 0))
      : 0;
    const limiteMensal = contratoAtivo ? Number(contratoAtivo.limite_litros_mensal || 0) : 0;
    const percentualUsado = limiteMensal > 0 ? (totalLitros / limiteMensal) * 100 : 0;
    const litrosRestantes = limiteMensal > 0 ? limiteMensal - totalLitros : 0;

    // Consumo por solicitante
    const porSolicitante: Record<string, { litros: number; valor: number }> = {};
    for (const r of abastecidas) {
      const nome = r.solicitante_nome;
      if (!porSolicitante[nome]) porSolicitante[nome] = { litros: 0, valor: 0 };
      porSolicitante[nome].litros += Number(r.quantidade_abastecida || 0);
      porSolicitante[nome].valor += Number(r.valor_total || 0);
    }
    const rankingSolicitantes = Object.entries(porSolicitante)
      .map(([nome, dados]) => ({ nome, ...dados }))
      .sort((a, b) => b.litros - a.litros);

    return {
      mes: mesAtual,
      contrato: contratoAtivo,
      total_litros: totalLitros,
      total_valor: totalValor,
      total_autorizacoes_atendidas: abastecidas.length,
      total_autorizacoes_pendentes: autorizadas.length,
      preco_litro: precoLitro,
      limite_mensal: limiteMensal,
      percentual_usado: percentualUsado,
      litros_restantes: litrosRestantes,
      por_solicitante: rankingSolicitantes,
      requisicoes,
    };
  }

  // ============================================================
  // RELATÓRIO SIGA (dados para exportação)
  // ============================================================

  async gerarDadosRelatorioSiga(orgaoId: string, mes: string) {
    const [ano, m] = mes.split('-');
    const dataInicio = `${ano}-${m}-01`;
    const dataFim = `${ano}-${m}-31`;

    const contratoAtivo = await this.obterContratoAtivo(orgaoId);
    const requisicoes = await this.requisicaoRepository.find({
      where: {
        orgao_id: orgaoId,
        status: StatusRequisicaoFrota.ABASTECIDO,
        data_requisicao: Between(dataInicio, dataFim),
      },
      order: { veiculo_placa: 'ASC', data_abastecimento: 'ASC' },
    });

    // Agrupa por veículo (usa valor_total real das requisições para suportar múltiplos combustíveis)
    const porVeiculo: Record<string, {
      modelo: string; placa: string; chassi: string; renavam: string;
      tipo: string; litros: number; valor_total: number;
    }> = {};

    for (const r of requisicoes) {
      const placa = r.veiculo_placa;
      if (!porVeiculo[placa]) {
        porVeiculo[placa] = {
          modelo: r.veiculo_modelo || '',
          placa,
          chassi: r.veiculo_chassi || '',
          renavam: r.veiculo_renavam || '',
          tipo: r.tipo_combustivel,
          litros: 0,
          valor_total: 0,
        };
      }
      porVeiculo[placa].litros += Number(r.quantidade_abastecida || 0);
      porVeiculo[placa].valor_total += Number(r.valor_total || 0);
    }

    const linhas = Object.values(porVeiculo).map(v => {
      const valorCupom = v.litros > 0 ? v.valor_total / v.litros : 0;
      return {
        ...v,
        valor_cupom: valorCupom,
        acrescimo: 0,
        total_pagar: v.valor_total,
      };
    });

    const subtotal = linhas.reduce((s, l) => s + l.litros, 0);
    const totalValor = linhas.reduce((s, l) => s + l.valor_total, 0);

    return {
      mes,
      orgao_id: orgaoId,
      contrato: contratoAtivo,
      linhas,
      subtotal_litros: subtotal,
      subtotal_valor: totalValor,
      total_geral: totalValor,
    };
  }

  // ============================================================
  // RESUMO GERAL (dashboard principal)
  // ============================================================

  async obterResumo(orgaoId: string, mes?: string) {
    const veiculos = await this.veiculoRepository.count({ where: { orgao_id: orgaoId, ativo: true } });
    const lastDayOfMonth = (y: string, m: string) => {
      const d = new Date(parseInt(y, 10), parseInt(m, 10), 0);
      return String(d.getDate()).padStart(2, '0');
    };
    let filtroData: any = {};
    if (mes) {
      const [ano, m2] = mes.split('-');
      const lastDay = lastDayOfMonth(ano, m2);
      filtroData = { orgao_id: orgaoId, data: Between(`${ano}-${m2}-01`, `${ano}-${m2}-${lastDay}`) };
    } else {
      filtroData = { orgao_id: orgaoId };
    }
    const abastecimentos = await this.abastecimentoRepository.find({ where: filtroData });
    const manutencoes = await this.manutencaoRepository.find({ where: filtroData });

    const reqsAll = await this.requisicaoRepository.find({
      where: { orgao_id: orgaoId, status: StatusRequisicaoFrota.ABASTECIDO },
    });
    const reqsFiltered = mes
      ? reqsAll.filter((r) => {
          const dt = r.data_abastecimento
            ? new Date(r.data_abastecimento).toISOString().slice(0, 7)
            : (r.data_requisicao || '').slice(0, 7);
          return dt === mes;
        })
      : reqsAll;

    const totalLitrosReq = reqsFiltered.reduce((s, r) => s + Number(r.quantidade_abastecida ?? r.quantidade_autorizada ?? 0), 0);
    const totalValorReq = reqsFiltered.reduce((s, r) => s + Number(r.valor_total ?? 0), 0);

    const totalAbastecimentosValor = abastecimentos.reduce((s, a) => s + Number(a.valor_total), 0);
    const totalLitrosManual = abastecimentos.reduce((s, a) => s + Number(a.quantidade_litros), 0);
    const totalManutencoes = manutencoes.reduce((s, m) => s + Number(m.valor), 0);

    return {
      total_veiculos: veiculos,
      total_abastecimentos: abastecimentos.length + reqsFiltered.length,
      total_litros: totalLitrosManual + totalLitrosReq,
      valor_abastecimentos: totalAbastecimentosValor + totalValorReq,
      valor_manutencoes: totalManutencoes,
      valor_total: totalAbastecimentosValor + totalValorReq + totalManutencoes,
    };
  }
}
