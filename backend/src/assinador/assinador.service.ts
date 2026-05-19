import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { DocumentoAssinatura, StatusDocumentoAssinatura } from '../assinaturas/entities/documento-assinatura.entity';
import { SignatarioDocumento, StatusAssinaturaSignatario } from '../assinaturas/entities/signatario-documento.entity';
import { PortalAssinaturasService } from '../portal-assinaturas/portal-assinaturas.service';

@Injectable()
export class AssinadorService {
  constructor(
    @InjectRepository(DocumentoAssinatura)
    private readonly documentoRepo: Repository<DocumentoAssinatura>,
    @InjectRepository(SignatarioDocumento)
    private readonly signatarioRepo: Repository<SignatarioDocumento>,
    private readonly portalService: PortalAssinaturasService,
  ) {}

  // Delegate methods
  listarDocumentos(orgaoId: string) {
    return this.portalService.listarDocumentos(orgaoId);
  }

  obterDocumento(id: string, orgaoId: string) {
    return this.portalService.obterDocumento(id, orgaoId);
  }

  criarDocumento(orgaoId: string, usuarioId: string, dados: any, arquivoUrl: string) {
    return this.portalService.criarDocumento(orgaoId, usuarioId, dados, arquivoUrl);
  }

  dispararNotificacoes(documentoId: string) {
    return this.portalService.dispararNotificacoesAssinatura(documentoId);
  }

  listarPendentes(orgaoId: string, email: string) {
    return this.portalService.listarPendentesDoUsuario(orgaoId, email);
  }

  solicitarOtp(documentoId: string, signatarioId: string, usuario: any) {
    return this.portalService.solicitarOtpInterno(documentoId, signatarioId, usuario);
  }

  assinarDocumento(documentoId: string, signatarioId: string, usuario: any, ip: string, userAgent: string, codigoOtp?: string) {
    return this.portalService.assinarComoOrgaoUser(documentoId, signatarioId, usuario, ip, userAgent, codigoOtp);
  }

  cancelarDocumento(id: string, orgaoId: string) {
    return this.portalService.cancelarDocumento(id, orgaoId);
  }

  reenviarNotificacoes(id: string, orgaoId: string) {
    return this.portalService.reenviarNotificacoes(id, orgaoId);
  }

  adicionarSignatario(id: string, orgaoId: string, body: any) {
    return this.portalService.adicionarSignatario(id, orgaoId, body);
  }

  // New methods

  async obterKpis(orgaoId: string, email: string) {
    const suaVez = await this.signatarioRepo
      .createQueryBuilder('sig')
      .innerJoin('sig.documento', 'doc')
      .where('doc.orgao_id = :orgaoId', { orgaoId })
      .andWhere('sig.email = :email', { email })
      .andWhere('sig.is_orgao_user = true')
      .andWhere('sig.status = :status', { status: StatusAssinaturaSignatario.PENDENTE })
      .getCount();

    const aguardandoOutros = await this.documentoRepo.count({
      where: {
        orgao_id: orgaoId,
        status: StatusDocumentoAssinatura.AGUARDANDO_ASSINATURAS,
      },
    });

    const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const concluidos30d = await this.documentoRepo.count({
      where: {
        orgao_id: orgaoId,
        status: StatusDocumentoAssinatura.CONCLUIDO,
        updated_at: MoreThan(trintaDiasAtras),
      },
    });

    return {
      sua_vez: suaVez,
      aguardando_outros: aguardandoOutros,
      concluidos_30d: concluidos30d,
    };
  }

  async obterAuditoria(orgaoId: string, page = 1, limit = 50) {
    const offset = (page - 1) * limit;

    const signatarios = await this.signatarioRepo
      .createQueryBuilder('sig')
      .innerJoinAndSelect('sig.documento', 'doc')
      .where('doc.orgao_id = :orgaoId', { orgaoId })
      .andWhere('sig.status = :status', { status: StatusAssinaturaSignatario.ASSINADO })
      .orderBy('sig.data_assinatura', 'DESC')
      .skip(offset)
      .take(limit)
      .getMany();

    return signatarios.map(sig => ({
      quando: sig.data_assinatura,
      acao: 'ASSINOU',
      pessoa: sig.nome,
      documento: sig.documento?.titulo || 'Documento',
      documento_id: sig.documento_id,
      ip: sig.ip_address || '—',
    }));
  }

  async validarDocumentoPorCodigo(codigo: string) {
    const signatario = await this.signatarioRepo.findOne({
      where: { codigo_validacao: codigo },
      relations: ['documento', 'documento.orgao'],
    });

    if (!signatario) {
      return { valido: false };
    }

    const documento = signatario.documento;
    const todosSignatarios = await this.signatarioRepo.find({
      where: { documento_id: documento.id },
    });

    const mascarar = (cpf: string) => {
      if (!cpf) return '***';
      if (cpf.length === 11) return `${cpf.slice(0, 3)}.***.***-${cpf.slice(-2)}`;
      return `${cpf.slice(0, 2)}.***.***/${cpf.slice(-4, -2)}-${cpf.slice(-2)}`;
    };

    return {
      valido: true,
      documento: {
        id: documento.id,
        titulo: documento.titulo,
        descricao: documento.descricao,
        hash: documento.documento_hash,
        status: documento.status,
        orgao_nome: documento.orgao?.nome || 'Câmara Municipal',
        arquivo_assinado_url: documento.arquivo_assinado_url,
        created_at: documento.created_at,
      },
      assinaturas: todosSignatarios
        .filter(s => s.status === StatusAssinaturaSignatario.ASSINADO)
        .map(s => ({
          nome: s.nome,
          cpf_cnpj_mascarado: mascarar(s.cpf_cnpj),
          data_assinatura: s.data_assinatura,
          ip: s.ip_address ? s.ip_address.replace(/\.\d+$/, '.***') : '—',
          codigo_validacao: s.codigo_validacao,
        })),
    };
  }

  async buscarUsuariosOrg(orgaoId: string, q?: string) {
    // Returns users from the org for signer selection
    const qb = this.documentoRepo.manager
      .getRepository('usuarios')
      .createQueryBuilder('u')
      .select(['u.id', 'u.nome', 'u.email', 'u.cargo', 'u.cpf'])
      .where('u.orgao_id = :orgaoId', { orgaoId })
      .andWhere('u.ativo = true');

    if (q) {
      qb.andWhere('(LOWER(u.nome) LIKE :q OR LOWER(u.email) LIKE :q)', { q: `%${q.toLowerCase()}%` });
    }

    return qb.limit(20).getMany();
  }
}
