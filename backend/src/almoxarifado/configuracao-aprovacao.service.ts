import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfiguracaoAprovacao, TipoAprovador } from './entities/configuracao-aprovacao.entity';

export interface CriarConfiguracaoDto {
  nivel: number;
  nome: string;
  descricao?: string;
  valor_minimo: number;
  valor_maximo?: number;
  tipo_aprovador: TipoAprovador;
  perfis_permitidos?: string[];
  usuarios_aprovadores_ids?: string[];
  bloquear_auto_aprovacao?: boolean;
  exigir_justificativa_aprovacao?: boolean;
  exigir_justificativa_negacao?: boolean;
  notificar_email_aprovador?: boolean;
  notificar_email_solicitante?: boolean;
}

export interface VerificarPermissaoResult {
  pode_aprovar: boolean;
  motivo?: string;
  configuracao?: ConfiguracaoAprovacao;
}

@Injectable()
export class ConfiguracaoAprovacaoService {
  private readonly logger = new Logger(ConfiguracaoAprovacaoService.name);

  constructor(
    @InjectRepository(ConfiguracaoAprovacao)
    private readonly configRepository: Repository<ConfiguracaoAprovacao>,
  ) {}

  /**
   * Cria uma nova configuração de aprovação
   */
  async criar(orgaoId: string, dto: CriarConfiguracaoDto): Promise<ConfiguracaoAprovacao> {
    // Verifica se já existe configuração para este nível
    const existente = await this.configRepository.findOne({
      where: { orgao_id: orgaoId, nivel: dto.nivel, ativo: true },
    });

    if (existente) {
      throw new BadRequestException(`Já existe uma configuração ativa para o nível ${dto.nivel}`);
    }

    // Valida ranges de valor
    if (dto.valor_maximo && dto.valor_minimo >= dto.valor_maximo) {
      throw new BadRequestException('Valor mínimo deve ser menor que valor máximo');
    }

    const config = this.configRepository.create({
      orgao_id: orgaoId,
      ...dto,
      perfis_permitidos: dto.perfis_permitidos || null,
      usuarios_aprovadores_ids: dto.usuarios_aprovadores_ids || null,
    });

    return this.configRepository.save(config);
  }

  /**
   * Lista configurações de um órgão
   */
  async listar(orgaoId: string): Promise<ConfiguracaoAprovacao[]> {
    return this.configRepository.find({
      where: { orgao_id: orgaoId },
      order: { nivel: 'ASC' },
    });
  }

  /**
   * Lista apenas configurações ativas
   */
  async listarAtivas(orgaoId: string): Promise<ConfiguracaoAprovacao[]> {
    return this.configRepository.find({
      where: { orgao_id: orgaoId, ativo: true },
      order: { nivel: 'ASC' },
    });
  }

  /**
   * Atualiza uma configuração
   */
  async atualizar(
    id: string,
    orgaoId: string,
    dto: Partial<CriarConfiguracaoDto>,
  ): Promise<ConfiguracaoAprovacao> {
    const config = await this.configRepository.findOne({
      where: { id, orgao_id: orgaoId },
    });

    if (!config) {
      throw new NotFoundException('Configuração não encontrada');
    }

    Object.assign(config, dto);
    return this.configRepository.save(config);
  }

  /**
   * Desativa uma configuração
   */
  async desativar(id: string, orgaoId: string): Promise<void> {
    const config = await this.configRepository.findOne({
      where: { id, orgao_id: orgaoId },
    });

    if (!config) {
      throw new NotFoundException('Configuração não encontrada');
    }

    config.ativo = false;
    await this.configRepository.save(config);
  }

  /**
   * Encontra a configuração aplicável para um valor
   */
  async encontrarConfiguracao(
    orgaoId: string,
    valorRequisicao: number,
  ): Promise<ConfiguracaoAprovacao | null> {
    const configs = await this.listarAtivas(orgaoId);

    // Encontra a configuração que se aplica ao valor
    for (const config of configs) {
      const valorMin = Number(config.valor_minimo);
      const valorMax = config.valor_maximo ? Number(config.valor_maximo) : Infinity;

      if (valorRequisicao >= valorMin && valorRequisicao <= valorMax) {
        return config;
      }
    }

    // Se não encontrou configuração específica, retorna a primeira (nível mais baixo)
    return configs.length > 0 ? configs[0] : null;
  }

  /**
   * Verifica se um usuário pode aprovar uma requisição
   */
  async verificarPermissaoAprovacao(
    orgaoId: string,
    usuarioId: string,
    usuarioPerfil: string,
    solicitanteId: string,
    valorRequisicao: number,
  ): Promise<VerificarPermissaoResult> {
    // Busca configuração aplicável
    const config = await this.encontrarConfiguracao(orgaoId, valorRequisicao);

    // Se não há configuração, permite qualquer usuário
    if (!config) {
      this.logger.log(`Nenhuma configuração de aprovação encontrada para órgão ${orgaoId}, permitindo aprovação`);
      return { pode_aprovar: true };
    }

    // Verifica auto-aprovação
    if (config.bloquear_auto_aprovacao && usuarioId === solicitanteId) {
      return {
        pode_aprovar: false,
        motivo: 'Você não pode aprovar sua própria requisição',
        configuracao: config,
      };
    }

    // Verifica tipo de aprovador
    switch (config.tipo_aprovador) {
      case TipoAprovador.QUALQUER_USUARIO:
        return { pode_aprovar: true, configuracao: config };

      case TipoAprovador.PERFIL_ESPECIFICO:
        if (config.perfis_permitidos?.includes(usuarioPerfil)) {
          return { pode_aprovar: true, configuracao: config };
        }
        return {
          pode_aprovar: false,
          motivo: `Apenas usuários com perfil ${config.perfis_permitidos?.join(' ou ')} podem aprovar requisições nesta faixa de valor`,
          configuracao: config,
        };

      case TipoAprovador.USUARIO_ESPECIFICO:
        if (config.usuarios_aprovadores_ids?.includes(usuarioId)) {
          return { pode_aprovar: true, configuracao: config };
        }
        return {
          pode_aprovar: false,
          motivo: 'Você não está na lista de aprovadores autorizados para requisições nesta faixa de valor',
          configuracao: config,
        };

      case TipoAprovador.GESTOR_SETOR:
        // TODO: Implementar verificação de gestor do setor
        // Por enquanto, permite
        return { pode_aprovar: true, configuracao: config };

      default:
        return { pode_aprovar: true, configuracao: config };
    }
  }

  /**
   * Cria configuração padrão para um órgão (se não existir)
   */
  async criarConfiguracaoPadrao(orgaoId: string): Promise<ConfiguracaoAprovacao[]> {
    const existentes = await this.listarAtivas(orgaoId);
    
    if (existentes.length > 0) {
      return existentes;
    }

    // Cria configuração padrão: qualquer usuário pode aprovar, bloqueando auto-aprovação
    const configPadrao = await this.criar(orgaoId, {
      nivel: 1,
      nome: 'Aprovação Padrão',
      descricao: 'Qualquer usuário com acesso ao módulo pode aprovar, exceto o próprio solicitante',
      valor_minimo: 0,
      valor_maximo: undefined,
      tipo_aprovador: TipoAprovador.QUALQUER_USUARIO,
      bloquear_auto_aprovacao: true,
      exigir_justificativa_aprovacao: false,
      exigir_justificativa_negacao: true,
      notificar_email_aprovador: true,
      notificar_email_solicitante: true,
    });

    return [configPadrao];
  }

  /**
   * Lista usuários que podem aprovar uma requisição com determinado valor
   * Útil para saber quem notificar
   */
  async listarAprovadores(
    orgaoId: string,
    valorRequisicao: number,
    usuariosOrgao: { id: string; perfil: string; email?: string }[],
    solicitanteId: string,
  ): Promise<{ id: string; email?: string }[]> {
    const config = await this.encontrarConfiguracao(orgaoId, valorRequisicao);

    if (!config) {
      // Sem configuração = todos podem aprovar, exceto solicitante
      return usuariosOrgao
        .filter(u => u.id !== solicitanteId)
        .map(u => ({ id: u.id, email: u.email }));
    }

    let aprovadores = usuariosOrgao;

    // Filtra por tipo de aprovador
    switch (config.tipo_aprovador) {
      case TipoAprovador.PERFIL_ESPECIFICO:
        aprovadores = aprovadores.filter(u => 
          config.perfis_permitidos?.includes(u.perfil)
        );
        break;

      case TipoAprovador.USUARIO_ESPECIFICO:
        aprovadores = aprovadores.filter(u => 
          config.usuarios_aprovadores_ids?.includes(u.id)
        );
        break;
    }

    // Remove solicitante se bloquear auto-aprovação
    if (config.bloquear_auto_aprovacao) {
      aprovadores = aprovadores.filter(u => u.id !== solicitanteId);
    }

    return aprovadores.map(u => ({ id: u.id, email: u.email }));
  }
}
