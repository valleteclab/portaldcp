import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { PrioridadeNotificacao, TipoNotificacao } from '../notificacoes/entities/notificacao.entity';
import { hojeBrasilia } from './regras-habilitacao';

const ROTULO_TIPO: Record<string, string> = {
  CND_RECEITA_FEDERAL_PGFN: 'Certidão federal (RFB/PGFN)',
  CRF_FGTS: 'CRF do FGTS',
  CNDT_TST: 'CNDT (Justiça do Trabalho)',
  CND_ESTADUAL: 'Certidão estadual',
  CND_MUNICIPAL: 'Certidão municipal',
  CERTIDAO_FALENCIA_RECUPERACAO: 'Certidão de falência/recuperação',
  REGISTRO_CONSELHO_CLASSE: 'Registro no conselho profissional',
};

/**
 * VENCIMENTO DOS DOCUMENTOS DO REGISTRO CADASTRAL (plano E4 item 5).
 *
 * Todo dia (03:30, Brasília) marca VENCIDO o documento do cadastro com
 * `data_validade` anterior a hoje; a pré-checagem da habilitação (art. 70)
 * usa só documento APROVADO e dentro da validade — este job mantém o cadastro
 * coerente para as demais telas. O fornecedor é avisado pela notificação do
 * portal (e e-mail do órgão da licitação mais recente em que participou,
 * quando houver — a notificação exige um órgão). Nenhuma integração nova.
 */
@Injectable()
export class VencimentoDocumentosService {
  private readonly logger = new Logger(VencimentoDocumentosService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() private readonly notificacoes?: NotificacoesService,
  ) {}

  @Cron('0 30 3 * * *', { name: 'habilitacao-vencimento-documentos', timeZone: 'America/Sao_Paulo' })
  async executarAgendado(): Promise<void> {
    try {
      const r = await this.marcarVencidos();
      if (r.vencidos) this.logger.log(`Documentos do cadastro vencidos hoje: ${r.vencidos} (${r.fornecedores} fornecedor(es))`);
    } catch (e: any) {
      this.logger.error(`Job de vencimento de documentos falhou: ${e?.message ?? e}`);
    }
  }

  /** Marca VENCIDO e avisa cada fornecedor (uma notificação por fornecedor). Idempotente. */
  async marcarVencidos(agora: Date = new Date()): Promise<{ vencidos: number; fornecedores: number }> {
    const hoje = hojeBrasilia(agora);
    const bruto: any = await this.dataSource.query(
      `UPDATE fornecedor_documentos SET status = 'VENCIDO', updated_at = now()
        WHERE data_validade IS NOT NULL AND data_validade < $1::date AND status::text <> 'VENCIDO'
        RETURNING fornecedor_id::text AS fornecedor_id, tipo::text AS tipo, to_char(data_validade, 'DD/MM/YYYY') AS validade`,
      [hoje],
    );
    // UPDATE ... RETURNING no driver do Postgres (TypeORM) volta como [linhas, afetadas]
    const rows: any[] = Array.isArray(bruto) && Array.isArray(bruto[0]) ? bruto[0] : bruto;
    const porFornecedor = new Map<string, Array<{ tipo: string; validade: string }>>();
    for (const r of rows) {
      const l = porFornecedor.get(r.fornecedor_id) ?? [];
      l.push({ tipo: r.tipo, validade: r.validade });
      porFornecedor.set(r.fornecedor_id, l);
    }
    for (const [fornecedorId, docs] of porFornecedor) await this.avisar(fornecedorId, docs);
    return { vencidos: rows.length, fornecedores: porFornecedor.size };
  }

  private async avisar(fornecedorId: string, docs: Array<{ tipo: string; validade: string }>): Promise<void> {
    if (!this.notificacoes) return;
    try {
      const [f] = await this.dataSource.query(`SELECT email FROM fornecedores WHERE id::text = $1`, [fornecedorId]);
      const [p] = await this.dataSource.query(
        `SELECT l.orgao_id FROM propostas p JOIN licitacoes l ON l.id = p.licitacao_id
          WHERE p.fornecedor_id::text = $1 ORDER BY p.created_at DESC LIMIT 1`,
        [fornecedorId],
      );
      if (!p?.orgao_id) return; // notificação do portal exige um órgão de contexto
      const lista = docs.map((d) => `• ${ROTULO_TIPO[d.tipo] ?? d.tipo} (validade ${d.validade})`).join('\n');
      await this.notificacoes.criar({
        orgao_id: p.orgao_id,
        usuario_id: fornecedorId,
        usuario_email: f?.email ?? undefined,
        tipo: TipoNotificacao.SISTEMA,
        titulo: 'Documento(s) do cadastro vencido(s)',
        mensagem:
          `Os documentos abaixo do seu registro cadastral venceram e deixaram de valer para a habilitação nas licitações ` +
          `(Lei 14.133/2021, art. 70). Atualize-os no portal do fornecedor:\n${lista}`,
        prioridade: PrioridadeNotificacao.ALTA,
        entidade_tipo: 'fornecedor',
        entidade_id: fornecedorId,
        link: '/fornecedor/cadastro',
        enviar_email: !!f?.email,
        metadata: { origem: 'vencimento-documentos', documentos: docs },
      });
    } catch (e: any) {
      this.logger.warn(`Aviso de vencimento não enviado ao fornecedor ${fornecedorId}: ${e?.message ?? e}`);
    }
  }
}
