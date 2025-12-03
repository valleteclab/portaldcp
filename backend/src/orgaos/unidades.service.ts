import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnidadeOrgao } from './entities/unidade-orgao.entity';
import { Orgao } from './entities/orgao.entity';

@Injectable()
export class UnidadesService {
  constructor(
    @InjectRepository(UnidadeOrgao)
    private unidadeRepository: Repository<UnidadeOrgao>,
    @InjectRepository(Orgao)
    private orgaoRepository: Repository<Orgao>,
  ) {}

  // Listar unidades de um órgão
  async listarPorOrgao(orgaoId: string): Promise<UnidadeOrgao[]> {
    return this.unidadeRepository.find({
      where: { orgao_id: orgaoId, ativo: true },
      order: { principal: 'DESC', codigo_unidade: 'ASC' }
    });
  }

  // Buscar unidade por ID
  async buscarPorId(id: string): Promise<UnidadeOrgao> {
    const unidade = await this.unidadeRepository.findOne({ where: { id } });
    if (!unidade) {
      throw new HttpException('Unidade não encontrada', HttpStatus.NOT_FOUND);
    }
    return unidade;
  }

  // Buscar unidade por código
  async buscarPorCodigo(orgaoId: string, codigoUnidade: string): Promise<UnidadeOrgao | null> {
    return this.unidadeRepository.findOne({
      where: { orgao_id: orgaoId, codigo_unidade: codigoUnidade }
    });
  }

  // Criar unidade
  async criar(data: Partial<UnidadeOrgao>): Promise<UnidadeOrgao> {
    if (!data.orgao_id || !data.codigo_unidade) {
      throw new HttpException('orgao_id e codigo_unidade são obrigatórios', HttpStatus.BAD_REQUEST);
    }

    // Verificar se órgão existe
    const orgao = await this.orgaoRepository.findOne({ where: { id: data.orgao_id } });
    if (!orgao) {
      throw new HttpException('Órgão não encontrado', HttpStatus.NOT_FOUND);
    }

    // Verificar se já existe unidade com mesmo código
    const existente = await this.buscarPorCodigo(data.orgao_id, data.codigo_unidade);
    if (existente) {
      throw new HttpException('Já existe uma unidade com este código', HttpStatus.CONFLICT);
    }

    // Se for a primeira unidade, marcar como principal
    const unidadesExistentes = await this.listarPorOrgao(data.orgao_id);
    if (unidadesExistentes.length === 0) {
      data.principal = true;
    }

    const unidade = this.unidadeRepository.create(data);
    return this.unidadeRepository.save(unidade);
  }

  // Atualizar unidade
  async atualizar(id: string, data: Partial<UnidadeOrgao>): Promise<UnidadeOrgao> {
    const unidade = await this.buscarPorId(id);
    
    // Se está marcando como principal, desmarcar as outras
    if (data.principal === true) {
      await this.unidadeRepository.update(
        { orgao_id: unidade.orgao_id, principal: true },
        { principal: false }
      );
    }

    Object.assign(unidade, data);
    return this.unidadeRepository.save(unidade);
  }

  // Excluir unidade
  async excluir(id: string): Promise<void> {
    const unidade = await this.buscarPorId(id);
    
    // Não permitir excluir a unidade principal se houver outras
    if (unidade.principal) {
      const outras = await this.unidadeRepository.count({
        where: { orgao_id: unidade.orgao_id, ativo: true }
      });
      if (outras > 1) {
        throw new HttpException(
          'Não é possível excluir a unidade principal. Defina outra como principal primeiro.',
          HttpStatus.BAD_REQUEST
        );
      }
    }

    await this.unidadeRepository.remove(unidade);
  }

  // Definir unidade como principal
  async definirPrincipal(id: string): Promise<UnidadeOrgao> {
    const unidade = await this.buscarPorId(id);
    
    // Desmarcar todas as outras
    await this.unidadeRepository.update(
      { orgao_id: unidade.orgao_id },
      { principal: false }
    );

    // Marcar esta como principal
    unidade.principal = true;
    return this.unidadeRepository.save(unidade);
  }

  // Sincronizar unidades do PNCP (criar unidades locais baseado nos dados do PNCP)
  async sincronizarDoPncp(orgaoId: string, unidadesPncp: any[]): Promise<UnidadeOrgao[]> {
    const unidadesCriadas: UnidadeOrgao[] = [];

    for (const unidadePncp of unidadesPncp) {
      const existente = await this.buscarPorCodigo(orgaoId, unidadePncp.codigoUnidade);
      
      if (existente) {
        // Atualizar dados
        existente.nome = unidadePncp.nomeUnidade || existente.nome;
        existente.pncp_codigo_ibge = unidadePncp.codigoIbge;
        existente.pncp_poder = unidadePncp.codigoPoder;
        existente.pncp_esfera = unidadePncp.codigoEsfera;
        await this.unidadeRepository.save(existente);
        unidadesCriadas.push(existente);
      } else {
        // Criar nova
        const nova = await this.criar({
          orgao_id: orgaoId,
          codigo_unidade: unidadePncp.codigoUnidade,
          nome: unidadePncp.nomeUnidade || `Unidade ${unidadePncp.codigoUnidade}`,
          pncp_codigo_ibge: unidadePncp.codigoIbge,
          pncp_poder: unidadePncp.codigoPoder,
          pncp_esfera: unidadePncp.codigoEsfera,
        });
        unidadesCriadas.push(nova);
      }
    }

    return unidadesCriadas;
  }

  // Obter ou criar unidade padrão (código "1")
  async obterOuCriarUnidadePadrao(orgaoId: string): Promise<UnidadeOrgao> {
    let unidade = await this.buscarPorCodigo(orgaoId, '1');
    
    if (!unidade) {
      const orgao = await this.orgaoRepository.findOne({ where: { id: orgaoId } });
      unidade = await this.criar({
        orgao_id: orgaoId,
        codigo_unidade: '1',
        nome: orgao?.nome || 'Unidade Principal',
        principal: true,
      });
    }

    return unidade;
  }
}
