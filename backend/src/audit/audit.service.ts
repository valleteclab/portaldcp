import { Injectable, Logger } from '@nestjs/common';
import { JwtPayload, UserType } from '../auth/auth.service';

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

  /**
   * Registra uma ação de auditoria
   */
  log(
    action: AuditAction,
    user?: JwtPayload | null,
    options?: {
      resourceType?: string;
      resourceId?: string;
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

    // TODO: Em produção, salvar no banco de dados ou enviar para serviço de logs
    // await this.auditRepository.save(auditLog);
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
