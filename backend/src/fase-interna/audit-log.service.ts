import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LogFaseInterna, AcaoLogFaseInterna } from './entities/log-fase-interna.entity';

export interface ContextoUsuario {
  usuario_id?: string;
  usuario_nome?: string;
  usuario_email?: string;
  ip_origem?: string;
  user_agent?: string;
}

/**
 * Serviço de auditoria da Fase Interna.
 * Registra TODAS as ações relevantes em logs_fase_interna.
 * Atende Art. 169 da Lei 14.133/2021 (3 linhas de defesa).
 */
@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(LogFaseInterna)
    private readonly logRepo: Repository<LogFaseInterna>,
  ) {}

  async log(params: {
    licitacao_id: string;
    documento_id?: string;
    acao: AcaoLogFaseInterna;
    descricao?: string;
    dados_antes?: any;
    dados_depois?: any;
    contexto?: ContextoUsuario;
  }): Promise<LogFaseInterna> {
    const log = this.logRepo.create({
      licitacao_id: params.licitacao_id,
      documento_id: params.documento_id,
      acao: params.acao,
      descricao: params.descricao,
      dados_antes: params.dados_antes,
      dados_depois: params.dados_depois,
      usuario_id: params.contexto?.usuario_id,
      usuario_nome: params.contexto?.usuario_nome,
      usuario_email: params.contexto?.usuario_email,
      ip_origem: params.contexto?.ip_origem,
      user_agent: params.contexto?.user_agent,
    });
    return await this.logRepo.save(log);
  }

  async listarPorLicitacao(licitacao_id: string, limit = 200): Promise<LogFaseInterna[]> {
    return await this.logRepo.find({
      where: { licitacao_id },
      order: { created_at: 'DESC' },
      take: limit,
    });
  }

  async listarPorDocumento(documento_id: string): Promise<LogFaseInterna[]> {
    return await this.logRepo.find({
      where: { documento_id },
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Calcula diff JSON simplificado entre dois objetos para registro.
   * Retorna apenas as chaves que mudaram.
   */
  diff(antes: any, depois: any): { antes: any; depois: any } {
    if (!antes || !depois) return { antes, depois };
    const changedAntes: any = {};
    const changedDepois: any = {};
    const keys = new Set([...Object.keys(antes), ...Object.keys(depois)]);
    for (const k of keys) {
      const a = JSON.stringify(antes[k]);
      const d = JSON.stringify(depois[k]);
      if (a !== d) {
        changedAntes[k] = antes[k];
        changedDepois[k] = depois[k];
      }
    }
    return { antes: changedAntes, depois: changedDepois };
  }
}
