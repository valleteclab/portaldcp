import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentoFaseInterna, StatusDocumento } from './entities/documento-fase-interna.entity';
import { AcaoLogFaseInterna } from './entities/log-fase-interna.entity';
import { AuditLogService, ContextoUsuario } from './audit-log.service';

/**
 * Serviço de publicação de documentos da Fase Interna no PNCP.
 *
 * IMPORTANTE: A integração real com o PNCP envolve fluxo OAuth, payloads
 * específicos (JSON conforme manual) e validações da plataforma. Esta
 * implementação é um MOCK que simula a publicação localmente.
 *
 * TODO: Substituir o mock por chamada HTTP real conforme documentação em
 *       /docs/manual-de-integracao-pncp.pdf. Recomenda-se reaproveitar o
 *       PncpService existente em backend/src/pncp/pncp.service.ts (que já
 *       trata token e credenciais) ao implementar a integração real.
 */
@Injectable()
export class PncpPublicacaoService {
  private readonly logger = new Logger(PncpPublicacaoService.name);

  // URL pública mock — substituir pela URL real ao integrar com PNCP.
  private static readonly PNCP_BASE_URL = 'https://pncp.gov.br/app/editais';

  constructor(
    @InjectRepository(DocumentoFaseInterna)
    private readonly docRepo: Repository<DocumentoFaseInterna>,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Publica documento aprovado no PNCP (atualmente: mock).
   */
  async publicarDocumento(
    documentoId: string,
    contexto?: ContextoUsuario,
  ): Promise<{ pncp_id: string; url: string }> {
    const documento = await this.docRepo.findOne({ where: { id: documentoId } });
    if (!documento) {
      throw new NotFoundException(`Documento ${documentoId} não encontrado.`);
    }

    if (documento.status !== StatusDocumento.APROVADO) {
      throw new BadRequestException(
        'Apenas documentos com status APROVADO podem ser publicados no PNCP.',
      );
    }

    if (!documento.arquivo_pdf_path) {
      throw new BadRequestException(
        'Documento não possui arquivo_pdf_path; não é possível publicar no PNCP.',
      );
    }

    if (documento.publicado_pncp && documento.pncp_id_externo) {
      this.logger.warn(
        `Documento ${documentoId} já está publicado no PNCP (id ${documento.pncp_id_externo}).`,
      );
      return {
        pncp_id: documento.pncp_id_externo,
        url: this.montarUrl(documento.pncp_id_externo),
      };
    }

    return this.executarPublicacaoMock(documento, contexto, AcaoLogFaseInterna.PUBLICADO_PNCP);
  }

  /**
   * Verifica se o documento já foi publicado e retorna metadados.
   */
  async verificarStatusPublicacao(
    documentoId: string,
  ): Promise<{ publicado: boolean; pncp_id?: string; data?: Date }> {
    const documento = await this.docRepo.findOne({ where: { id: documentoId } });
    if (!documento) {
      throw new NotFoundException(`Documento ${documentoId} não encontrado.`);
    }

    return {
      publicado: !!documento.publicado_pncp,
      pncp_id: documento.pncp_id_externo || undefined,
      data: documento.data_publicacao_pncp || undefined,
    };
  }

  /**
   * Republica um documento (em caso de retificação/alteração).
   */
  async republicar(
    documentoId: string,
    contexto?: ContextoUsuario,
  ): Promise<{ pncp_id: string; url: string }> {
    const documento = await this.docRepo.findOne({ where: { id: documentoId } });
    if (!documento) {
      throw new NotFoundException(`Documento ${documentoId} não encontrado.`);
    }

    if (documento.status !== StatusDocumento.APROVADO) {
      throw new BadRequestException(
        'Apenas documentos com status APROVADO podem ser republicados no PNCP.',
      );
    }

    if (!documento.arquivo_pdf_path) {
      throw new BadRequestException(
        'Documento não possui arquivo_pdf_path; não é possível republicar no PNCP.',
      );
    }

    return this.executarPublicacaoMock(documento, contexto, AcaoLogFaseInterna.PUBLICADO_PNCP);
  }

  // =========================================================================
  // Helpers privados
  // =========================================================================

  /**
   * MOCK de publicação. Gera id fake, atualiza entidade e registra auditoria.
   *
   * TODO: substituir por chamada HTTP real ao PNCP conforme
   *       /docs/manual-de-integracao-pncp.pdf.
   */
  private async executarPublicacaoMock(
    documento: DocumentoFaseInterna,
    contexto: ContextoUsuario | undefined,
    acao: AcaoLogFaseInterna,
  ): Promise<{ pncp_id: string; url: string }> {
    this.logger.log(
      `[MOCK] Tentativa de publicação no PNCP — documento=${documento.id} ` +
        `tipo=${documento.tipo} licitacao=${documento.licitacao_id} ` +
        `arquivo=${documento.arquivo_pdf_path}`,
    );

    const pncpId = `PNCP-${(documento.licitacao_id || '').slice(0, 8)}-${documento.tipo}`;
    const dataPublicacao = new Date();

    const dadosAntes = {
      publicado_pncp: documento.publicado_pncp,
      pncp_id_externo: documento.pncp_id_externo,
      data_publicacao_pncp: documento.data_publicacao_pncp,
    };

    documento.publicado_pncp = true;
    documento.pncp_id_externo = pncpId;
    documento.data_publicacao_pncp = dataPublicacao;
    await this.docRepo.save(documento);

    const dadosDepois = {
      publicado_pncp: documento.publicado_pncp,
      pncp_id_externo: documento.pncp_id_externo,
      data_publicacao_pncp: documento.data_publicacao_pncp,
    };

    await this.auditLog.log({
      licitacao_id: documento.licitacao_id,
      documento_id: documento.id,
      acao,
      descricao:
        `[MOCK] Documento ${documento.tipo} publicado no PNCP com id ${pncpId}. ` +
        'Substituir por integração real conforme manual-de-integracao-pncp.pdf.',
      dados_antes: dadosAntes,
      dados_depois: dadosDepois,
      contexto,
    });

    this.logger.log(`[MOCK] Documento ${documento.id} publicado no PNCP como ${pncpId}.`);

    return { pncp_id: pncpId, url: this.montarUrl(pncpId) };
  }

  private montarUrl(pncpId: string): string {
    return `${PncpPublicacaoService.PNCP_BASE_URL}/${pncpId}`;
  }
}
