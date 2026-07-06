import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtPayload, UserType } from '../auth/auth.service';
import { AuditLogEntity } from './entities/audit-log.entity';

export enum AuditAction {
  // Autenticação
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  LOGIN_FAILED = 'LOGIN_FAILED',
  
  // Fornecedor
  FORNECEDOR_CADASTRO = 'FORNECEDOR_CADASTRO',
  FORNECEDOR_UPDATE = 'FORNECEDOR_UPDATE',
  FORNECEDOR_DOCUMENTO_UPLOAD = 'FORNECEDOR_DOCUMENTO_UPLOAD',
  
  // Propostas
  PROPOSTA_CRIADA = 'PROPOSTA_CRIADA',
  PROPOSTA_ENVIADA = 'PROPOSTA_ENVIADA',
  PROPOSTA_EXCLUIDA = 'PROPOSTA_EXCLUIDA',
  
  // Lances
  LANCE_ENVIADO = 'LANCE_ENVIADO',
  
  // Licitações
  LICITACAO_CRIADA = 'LICITACAO_CRIADA',
  LICITACAO_PUBLICADA = 'LICITACAO_PUBLICADA',
  LICITACAO_CANCELADA = 'LICITACAO_CANCELADA',
  
  // Sessão
  SESSAO_INICIADA = 'SESSAO_INICIADA',
  SESSAO_ENCERRADA = 'SESSAO_ENCERRADA',
  
  // Segurança
  ACESSO_NEGADO = 'ACESSO_NEGADO',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
}

export interface AuditLog {
  timestamp: Date;
  action: AuditAction;
  userId?: string;
  userType?: UserType;
  userEmail?: string;
  resourceType?: string;
  resourceId?: string;
  ip?: string;
  userAgent?: string;
  details?: Record<string, any>;
  success: boolean;
  errorMessage?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger('AUDIT');

  constructor(
    @Optional()
    @InjectRepository(AuditLogEntity)
    private readonly auditRepo?: Repository<AuditLogEntity>,
  ) {}

  /**
   * Registra uma ação de auditoria.
   * Assinatura síncrona (fire-and-forget) para não exigir await nos chamadores;
   * a persistência em banco acontece em background e nunca derruba a operação.
   */
  log(
    action: AuditAction,
    user?: JwtPayload | null,
    options?: {
      resourceType?: string;
      resourceId?: string;
      orgaoId?: string;
      ip?: string;
      userAgent?: string;
      details?: Record<string, any>;
      success?: boolean;
      errorMessage?: string;
    }
  ): void {
    const auditLog: AuditLog = {
      timestamp: new Date(),
      action,
      userId: user?.sub,
      userType: user?.type,
      userEmail: user?.email,
      resourceType: options?.resourceType,
      resourceId: options?.resourceId,
      ip: options?.ip,
      userAgent: options?.userAgent,
      details: options?.details,
      success: options?.success ?? true,
      errorMessage: options?.errorMessage,
    };

    // Log estruturado para análise
    const logMessage = this.formatLogMessage(auditLog);

    if (auditLog.success) {
      this.logger.log(logMessage);
    } else {
      this.logger.warn(logMessage);
    }

    // Persistência em banco (append-only). Fire-and-forget: falha não propaga.
    if (this.auditRepo) {
      const registro = this.auditRepo.create({
        action,
        user_id: user?.sub,
        user_type: user?.type,
        user_email: user?.email,
        orgao_id: options?.orgaoId ?? user?.orgaoId,
        resource_type: options?.resourceType,
        resource_id: options?.resourceId,
        ip: options?.ip,
        user_agent: options?.userAgent,
        details: options?.details,
        success: auditLog.success,
        error_message: options?.errorMessage,
      });
      this.auditRepo
        .save(registro)
        .catch((e) =>
          this.logger.error(`Falha ao persistir auditoria: ${e.message}`),
        );
    }
  }

  /**
   * Consulta paginada da trilha de auditoria.
   */
  async listar(filtro: {
    orgaoId?: string;
    action?: string;
    resourceType?: string;
    resourceId?: string;
    userId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ itens: AuditLogEntity[]; total: number }> {
    if (!this.auditRepo) return { itens: [], total: 0 };
    const page = Math.max(1, filtro.page || 1);
    const limit = Math.min(200, filtro.limit || 50);
    const qb = this.auditRepo
      .createQueryBuilder('a')
      .orderBy('a.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (filtro.orgaoId) qb.andWhere('a.orgao_id = :o', { o: filtro.orgaoId });
    if (filtro.action) qb.andWhere('a.action = :a', { a: filtro.action });
    if (filtro.resourceType)
      qb.andWhere('a.resource_type = :rt', { rt: filtro.resourceType });
    if (filtro.resourceId)
      qb.andWhere('a.resource_id = :ri', { ri: filtro.resourceId });
    if (filtro.userId) qb.andWhere('a.user_id = :u', { u: filtro.userId });
    const [itens, total] = await qb.getManyAndCount();
    return { itens, total };
  }

  /**
   * Registra tentativa de login
   */
  logLogin(email: string, success: boolean, ip?: string, userAgent?: string, errorMessage?: string): void {
    this.log(
      success ? AuditAction.LOGIN : AuditAction.LOGIN_FAILED,
      null,
      {
        details: { email },
        ip,
        userAgent,
        success,
        errorMessage,
      }
    );
  }

  /**
   * Registra acesso negado (ownership violation)
   */
  logAccessDenied(user: JwtPayload, resourceType: string, resourceId: string, ip?: string): void {
    this.log(
      AuditAction.ACESSO_NEGADO,
      user,
      {
        resourceType,
        resourceId,
        ip,
        success: false,
        errorMessage: 'Tentativa de acesso a recurso de outro usuário',
      }
    );
  }

  /**
   * Registra ação em proposta
   */
  logProposta(action: AuditAction, user: JwtPayload, propostaId: string, licitacaoId?: string): void {
    this.log(action, user, {
      resourceType: 'Proposta',
      resourceId: propostaId,
      details: { licitacaoId },
    });
  }

  /**
   * Registra ação em licitação
   */
  logLicitacao(action: AuditAction, user: JwtPayload, licitacaoId: string, details?: Record<string, any>): void {
    this.log(action, user, {
      resourceType: 'Licitacao',
      resourceId: licitacaoId,
      details,
    });
  }

  private formatLogMessage(auditLog: AuditLog): string {
    const parts = [
      `[${auditLog.action}]`,
      auditLog.userEmail ? `user=${auditLog.userEmail}` : 'user=anonymous',
      auditLog.userType ? `type=${auditLog.userType}` : '',
      auditLog.resourceType ? `resource=${auditLog.resourceType}` : '',
      auditLog.resourceId ? `id=${auditLog.resourceId}` : '',
      auditLog.ip ? `ip=${auditLog.ip}` : '',
      auditLog.success ? 'status=SUCCESS' : 'status=FAILED',
      auditLog.errorMessage ? `error="${auditLog.errorMessage}"` : '',
    ].filter(Boolean);

    return parts.join(' | ');
  }
}
