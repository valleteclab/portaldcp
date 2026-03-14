import {
  Injectable, UnauthorizedException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { FrotaCredencial, TipoCredencialFrota } from './entities/frota-credencial.entity';
import { FrotaAcessoLog, AcaoFrotaLog } from './entities/frota-acesso-log.entity';
import { FrotaRequisicao, StatusRequisicaoFrota } from './entities/frota-requisicao.entity';
import { Orgao } from '../orgaos/entities/orgao.entity';

export interface FrotaJwtPayload {
  sub: string;         // credencial_id
  type: 'FROTA_POSTO' | 'FROTA_VEREADOR';
  orgaoId: string;
  nome: string;
}

@Injectable()
export class FrotaAuthService {
  constructor(
    @InjectRepository(FrotaCredencial)
    private credencialRepo: Repository<FrotaCredencial>,
    @InjectRepository(FrotaAcessoLog)
    private logRepo: Repository<FrotaAcessoLog>,
    @InjectRepository(FrotaRequisicao)
    private requisicaoRepo: Repository<FrotaRequisicao>,
    @InjectRepository(Orgao)
    private orgaoRepo: Repository<Orgao>,
    private jwtService: JwtService,
  ) {}

  // ================================================================
  // GESTÃO DE CREDENCIAIS (acesso pelo gestor do órgão)
  // ================================================================

  async listarCredenciais(orgaoId: string) {
    return this.credencialRepo.find({
      where: { orgao_id: orgaoId },
      order: { tipo: 'ASC', nome: 'ASC' },
      select: ['id', 'tipo', 'nome', 'codigo_acesso', 'solicitante_cargo',
               'cota_mensal_litros', 'veiculo_ids', 'url_slug', 'ativo', 'ultimo_acesso', 'created_at'],
    });
  }

  async criarCredencial(orgaoId: string, dados: any) {
    const existing = await this.credencialRepo.findOne({
      where: { orgao_id: orgaoId, codigo_acesso: dados.codigo_acesso?.toUpperCase() },
    });
    if (existing) throw new BadRequestException('Código de acesso já cadastrado neste órgão');

    if (!dados.senha) throw new BadRequestException('Senha obrigatória');

    const senha_hash = await bcrypt.hash(dados.senha, 10);
    let url_slug = dados.url_slug;

    if (dados.tipo === TipoCredencialFrota.POSTO && !url_slug) {
      url_slug = await this.gerarSlugUnico(dados.nome, orgaoId);
    }

    const credencial = this.credencialRepo.create({
      tipo: dados.tipo,
      nome: dados.nome,
      codigo_acesso: dados.codigo_acesso?.toUpperCase(),
      senha_hash,
      solicitante_cargo: dados.solicitante_cargo,
      cota_mensal_litros: dados.cota_mensal_litros,
      veiculo_ids: dados.veiculo_ids,
      url_slug,
      ativo: dados.ativo ?? true,
      orgao_id: orgaoId,
    });
    return this.credencialRepo.save(credencial);
  }

  async atualizarCredencial(id: string, orgaoId: string, dados: any) {
    const credencial = await this.credencialRepo.findOne({ where: { id, orgao_id: orgaoId } });
    if (!credencial) throw new NotFoundException('Credencial não encontrada');

    if (dados.senha) {
      dados.senha_hash = await bcrypt.hash(dados.senha, 10);
      delete dados.senha;
    }
    if (dados.codigo_acesso) dados.codigo_acesso = dados.codigo_acesso.toUpperCase();

    Object.assign(credencial, dados);
    return this.credencialRepo.save(credencial);
  }

  async excluirCredencial(id: string, orgaoId: string) {
    const credencial = await this.credencialRepo.findOne({ where: { id, orgao_id: orgaoId } });
    if (!credencial) throw new NotFoundException('Credencial não encontrada');
    await this.credencialRepo.remove(credencial);
  }

  private async gerarSlugUnico(nome: string, orgaoId: string): Promise<string> {
    const base = nome.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20);
    const suffix = orgaoId.slice(0, 6);
    let slug = `${base}-${suffix}`;
    let i = 0;
    while (await this.credencialRepo.findOne({ where: { url_slug: slug } })) {
      slug = `${base}-${suffix}-${++i}`;
    }
    return slug;
  }

  // ================================================================
  // AUTENTICAÇÃO
  // ================================================================

  async login(orgaoId: string, codigoAcesso: string, senha: string, ip: string, userAgent: string) {
    const credencial = await this.credencialRepo.findOne({
      where: { orgao_id: orgaoId, codigo_acesso: codigoAcesso.toUpperCase(), ativo: true },
      relations: ['orgao'],
    });

    const senhaValida = credencial && await bcrypt.compare(senha, credencial.senha_hash);

    if (!credencial || !senhaValida) {
      await this.log(null, orgaoId, ip, userAgent, AcaoFrotaLog.FALHA_LOGIN, { codigo: codigoAcesso }, false);
      throw new UnauthorizedException('Código de acesso ou senha incorretos');
    }

    await this.log(credencial.id, orgaoId, ip, userAgent, AcaoFrotaLog.LOGIN, {}, true);
    credencial.ultimo_acesso = new Date();
    await this.credencialRepo.save(credencial);

    const payload: FrotaJwtPayload = {
      sub: credencial.id,
      type: `FROTA_${credencial.tipo}` as any,
      orgaoId,
      nome: credencial.nome,
    };
    const token = this.jwtService.sign(payload, { expiresIn: '30d' });

    return {
      token,
      credencial: {
        id: credencial.id,
        tipo: credencial.tipo,
        nome: credencial.nome,
        cargo: credencial.solicitante_cargo,
        orgao_nome: credencial.orgao?.nome,
        orgao_id: orgaoId,
        url_slug: credencial.url_slug,
        cota_mensal_litros: credencial.cota_mensal_litros,
        veiculo_ids: credencial.veiculo_ids,
      },
    };
  }

  async loginPorSlug(slug: string, senha: string, ip: string, userAgent: string) {
    const credencial = await this.credencialRepo.findOne({
      where: { url_slug: slug, tipo: TipoCredencialFrota.POSTO, ativo: true },
    });
    if (!credencial) throw new UnauthorizedException('Posto não encontrado ou inativo');
    return this.login(credencial.orgao_id, credencial.codigo_acesso, senha, ip, userAgent);
  }

  async obterInfoPosto(slug: string) {
    const credencial = await this.credencialRepo.findOne({
      where: { url_slug: slug, tipo: TipoCredencialFrota.POSTO, ativo: true },
      relations: ['orgao'],
    });
    if (!credencial) throw new NotFoundException('Posto não encontrado');
    return { nome: credencial.nome, orgao_nome: credencial.orgao?.nome, orgao_id: credencial.orgao_id };
  }

  async alterarSenha(credencialId: string, orgaoId: string, senhaAtual: string, novaSenha: string, ip: string, userAgent: string) {
    const credencial = await this.credencialRepo.findOne({ where: { id: credencialId, orgao_id: orgaoId } });
    if (!credencial) throw new NotFoundException('Credencial não encontrada');
    if (!(await bcrypt.compare(senhaAtual, credencial.senha_hash))) {
      await this.log(credencialId, orgaoId, ip, userAgent, AcaoFrotaLog.ALTERAR_SENHA, {}, false);
      throw new BadRequestException('Senha atual incorreta');
    }
    if (novaSenha.length < 6) throw new BadRequestException('Nova senha deve ter ao menos 6 caracteres');
    credencial.senha_hash = await bcrypt.hash(novaSenha, 10);
    await this.credencialRepo.save(credencial);
    await this.log(credencialId, orgaoId, ip, userAgent, AcaoFrotaLog.ALTERAR_SENHA, {}, true);
    return { message: 'Senha alterada com sucesso' };
  }

  validateFrotaToken(token: string): FrotaJwtPayload {
    try {
      const payload = this.jwtService.verify<FrotaJwtPayload>(token);
      if (!payload.type?.startsWith('FROTA_')) throw new Error('Tipo inválido');
      return payload;
    } catch {
      throw new UnauthorizedException('Token de acesso inválido ou expirado');
    }
  }

  // ================================================================
  // TOKEN QR (gerado na autorização, verificado pelo posto)
  // ================================================================

  gerarTokenAcesso(): { token: string; expiry: Date } {
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias
    return { token, expiry };
  }

  async verificarTokenAcesso(token: string): Promise<FrotaRequisicao> {
    const req = await this.requisicaoRepo.findOne({
      where: { token_acesso: token },
      relations: ['contrato'],
    });
    if (!req) throw new NotFoundException('QR Code inválido ou não encontrado');
    if (req.token_expiry && new Date() > req.token_expiry) {
      throw new BadRequestException('QR Code expirado');
    }
    if (req.status !== StatusRequisicaoFrota.AUTORIZADO) {
      const msgs: Record<string, string> = {
        ABASTECIDO: 'Esta autorização já foi utilizada',
        CANCELADO: 'Esta autorização foi cancelada',
        NEGADO: 'Esta autorização foi negada',
        PENDENTE: 'Esta autorização ainda está pendente de aprovação',
      };
      throw new BadRequestException(msgs[req.status] || `Status: ${req.status}`);
    }
    return req;
  }

  // ================================================================
  // DADOS DO VEREADOR
  // ================================================================

  async obterDadosVereador(credencialId: string, orgaoId: string) {
    const credencial = await this.credencialRepo.findOne({
      where: { id: credencialId, orgao_id: orgaoId },
      relations: ['orgao'],
    });
    if (!credencial) throw new NotFoundException('Credencial não encontrada');

    const mes = new Date().toISOString().slice(0, 7);
    const [ano, m] = mes.split('-');

    const todasRequisicoes = await this.requisicaoRepo.find({
      where: { orgao_id: orgaoId, credencial_solicitante_id: credencialId },
      relations: ['contrato'],
      order: { created_at: 'DESC' },
      take: 50,
    });

    const doMes = todasRequisicoes.filter(r =>
      r.data_requisicao >= `${ano}-${m}-01` && r.data_requisicao <= `${ano}-${m}-31`,
    );

    const litrosUsados = doMes
      .filter(r => r.status === StatusRequisicaoFrota.ABASTECIDO)
      .reduce((s, r) => s + Number(r.quantidade_abastecida || 0), 0);

    const autorizacaoAtiva = todasRequisicoes.find(r => r.status === StatusRequisicaoFrota.AUTORIZADO) || null;

    return {
      credencial: {
        id: credencial.id,
        nome: credencial.nome,
        cargo: credencial.solicitante_cargo,
        orgao_nome: credencial.orgao?.nome,
        cota_mensal_litros: Number(credencial.cota_mensal_litros || 0),
        veiculo_ids: credencial.veiculo_ids || [],
      },
      mes,
      cota_mensal: Number(credencial.cota_mensal_litros || 0),
      litros_usados: litrosUsados,
      autorizacao_ativa: autorizacaoAtiva,
      requisicoes: todasRequisicoes,
    };
  }

  // ================================================================
  // LOGS
  // ================================================================

  async log(credencialId: string | null, orgaoId: string, ip: string, userAgent: string, acao: AcaoFrotaLog, detalhes: object, sucesso: boolean) {
    const entry = this.logRepo.create({
      credencial_id: credencialId,
      orgao_id: orgaoId,
      ip: (ip || 'unknown').slice(0, 50),
      user_agent: (userAgent || '').slice(0, 500),
      acao,
      detalhes: JSON.stringify(detalhes),
      sucesso,
    });
    await this.logRepo.save(entry).catch(() => {/* nunca falhar por causa de log */});
  }

  async listarLogs(orgaoId: string, credencialId?: string, limit = 200) {
    const where: any = { orgao_id: orgaoId };
    if (credencialId) where.credencial_id = credencialId;
    return this.logRepo.find({
      where,
      relations: ['credencial'],
      order: { created_at: 'DESC' },
      take: limit,
    });
  }
}
