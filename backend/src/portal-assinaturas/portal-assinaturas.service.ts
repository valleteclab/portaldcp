import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { DocumentoAssinatura, StatusDocumentoAssinatura } from '../assinaturas/entities/documento-assinatura.entity';
import { SignatarioDocumento, StatusAssinaturaSignatario } from '../assinaturas/entities/signatario-documento.entity';
import { CriarDocumentoDto } from './dto/criar-documento.dto';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { TipoNotificacao } from '../notificacoes/entities/notificacao.entity';
import { AssinaturasService } from '../assinaturas/assinaturas.service';
import { EntidadeTipo, PapelAssinante } from '../assinaturas/entities/assinatura-digital.entity';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';

@Injectable()
export class PortalAssinaturasService {
  private readonly logger = new Logger(PortalAssinaturasService.name);
  private readonly uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');

  constructor(
    @InjectRepository(DocumentoAssinatura)
    private readonly documentoRepository: Repository<DocumentoAssinatura>,
    @InjectRepository(SignatarioDocumento)
    private readonly signatarioRepository: Repository<SignatarioDocumento>,
    private readonly dataSource: DataSource,
    private readonly notificacoesService: NotificacoesService,
    private readonly assinaturasService: AssinaturasService,
  ) {}

  // =============================================
  // GESTÃO DE DOCUMENTOS (Órgão)
  // =============================================

  async listarDocumentos(orgaoId: string) {
    return await this.documentoRepository.find({
      where: { orgao_id: orgaoId },
      relations: ['signatarios'],
      order: { created_at: 'DESC' },
    });
  }

  async obterDocumento(id: string, orgaoId: string) {
    const doc = await this.documentoRepository.findOne({
      where: { id, orgao_id: orgaoId },
      relations: ['signatarios'],
    });

    if (!doc) {
      throw new NotFoundException('Documento não encontrado');
    }

    return doc;
  }

  async criarDocumento(
    orgaoId: string,
    usuarioId: string,
    dados: CriarDocumentoDto,
    arquivoUrl: string
  ): Promise<DocumentoAssinatura> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Calcular SHA-256 do arquivo
      let documentoHash: string | undefined;
      try {
        const filePath = join(this.uploadDir, arquivoUrl);
        if (existsSync(filePath)) {
          const fileBuffer = readFileSync(filePath);
          documentoHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        }
      } catch (e) {
        this.logger.warn(`Erro ao calcular hash do arquivo: ${e.message}`);
      }

      // 1. Criar o documento principal
      const documento = this.documentoRepository.create({
        orgao_id: orgaoId,
        titulo: dados.titulo,
        descricao: dados.descricao,
        arquivo_original_url: arquivoUrl,
        documento_hash: documentoHash,
        status: StatusDocumentoAssinatura.AGUARDANDO_ASSINATURAS,
        criado_por_id: usuarioId,
      });

      const docSalvo = await queryRunner.manager.save(DocumentoAssinatura, documento);

      // 2. Criar os signatários
      if (dados.signatarios && dados.signatarios.length > 0) {
        const signatarios = dados.signatarios.map(sig => {
          const entity = new SignatarioDocumento();
          entity.documento_id = docSalvo.id;
          entity.nome = sig.nome;
          entity.cpf_cnpj = (sig.cpf_cnpj ?? '').replace(/\D/g, '');
          entity.email = (sig.email ?? '') as string;
          entity.telefone = sig.telefone ? sig.telefone.replace(/\D/g, '') : null;
          entity.status = StatusAssinaturaSignatario.PENDENTE;
          entity.token_acesso = crypto.randomBytes(32).toString('hex');
          entity.pagina_assinatura = sig.pagina_assinatura as number;
          entity.pos_x = sig.pos_x as number;
          entity.pos_y = sig.pos_y as number;
          entity.is_orgao_user = sig.is_orgao_user ?? false;
          return entity;
        });

        await queryRunner.manager.save(SignatarioDocumento, signatarios);
      }

      await queryRunner.commitTransaction();

      // Recarregar com relações
      return await this.obterDocumento(docSalvo.id, orgaoId);

    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Erro ao criar documento de assinatura: ${error.message}`, error.stack);
      throw new BadRequestException('Não foi possível criar o documento para assinatura');
    } finally {
      await queryRunner.release();
    }
  }

  async dispararNotificacoesAssinatura(documentoId: string) {
    const doc = await this.documentoRepository.findOne({
      where: { id: documentoId },
      relations: ['signatarios', 'orgao'],
    });

    if (!doc) return;

    const baseUrl = this.getFrontendUrl();

    for (const signatario of doc.signatarios) {
      if (signatario.status !== StatusAssinaturaSignatario.PENDENTE) continue;

      if (signatario.is_orgao_user) {
        // Usuário interno: notificação no portal (sem link externo)
        const linkPortal = `${baseUrl}/orgao/portal-assinaturas`;
        const mensagemHtml = `
          <p>Olá, <strong>${signatario.nome}</strong>,</p>
          <p>Você foi adicionado como signatário do documento <strong>"${doc.titulo}"</strong>.</p>
          <p>Acesse o <a href="${linkPortal}">Portal de Assinaturas</a> para assinar diretamente pelo sistema.</p>
        `;
        await this.notificacoesService.criar({
          orgao_id: doc.orgao_id,
          usuario_id: 'SYSTEM',
          usuario_email: signatario.email,
          tipo: TipoNotificacao.SISTEMA,
          titulo: `Assinatura Pendente: ${doc.titulo}`,
          mensagem: mensagemHtml,
          enviar_email: !!signatario.email,
          metadata: { is_internal: true },
        }).catch(err =>
          this.logger.error(`Erro ao notificar interno ${signatario.nome}: ${err.message}`),
        );
      } else {
        // Usuário externo: link de assinatura pública
        const link = `${baseUrl}/assinar-documento/${signatario.token_acesso}`;
        const mensagemTexto = `Olá, ${signatario.nome}. Você foi solicitado a assinar o documento "${doc.titulo}" pelo órgão ${doc.orgao.nome}. Acesse: ${link}`;
        const mensagemHtml = `
          <p>Olá, <strong>${signatario.nome}</strong>,</p>
          <p>Você foi solicitado a assinar eletronicamente o documento <strong>"${doc.titulo}"</strong> emitido pelo órgão <strong>${doc.orgao.nome}</strong>.</p>
          <p style="text-align:center;margin:30px 0;">
            <a href="${link}" style="background:#2563eb;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;">Revisar e Assinar Documento</a>
          </p>
          <p>Ou acesse: <a href="${link}">${link}</a></p>
          <hr style="border:1px solid #eee;margin:20px 0;">
          <p style="font-size:12px;color:#666;">Mensagem automática do Portal DCP.</p>
        `;
        await this.notificacoesService.criar({
          orgao_id: doc.orgao_id,
          usuario_id: 'SYSTEM',
          usuario_email: signatario.email,
          usuario_telefone: signatario.telefone ?? undefined,
          tipo: TipoNotificacao.SISTEMA,
          titulo: `Assinatura Pendente: ${doc.titulo}`,
          mensagem: mensagemHtml,
          enviar_email: !!signatario.email,
          metadata: { is_external: true, whatsapp_text: mensagemTexto, whatsapp_url: link },
        }).catch(err =>
          this.logger.error(`Erro ao notificar ${signatario.nome}: ${err.message}`),
        );
      }
    }
  }

  async listarPendentesDoUsuario(orgaoId: string, email: string) {
    const signatarios = await this.signatarioRepository.find({
      where: {
        email,
        is_orgao_user: true,
        status: StatusAssinaturaSignatario.PENDENTE,
      },
      relations: ['documento'],
    });

    return signatarios
      .filter(s => s.documento?.orgao_id === orgaoId)
      .map(s => ({
        signatario_id: s.id,
        documento_id: s.documento.id,
        titulo: s.documento.titulo,
        descricao: s.documento.descricao,
        arquivo_original_url: s.documento.arquivo_original_url,
        status_documento: s.documento.status,
        created_at: s.documento.created_at,
      }));
  }

  async solicitarOtpInterno(
    documentoId: string,
    signatarioId: string,
  ): Promise<{ canal: string }> {
    const signatario = await this.signatarioRepository.findOne({
      where: { id: signatarioId, documento_id: documentoId },
      relations: ['documento'],
    });
    if (!signatario) throw new NotFoundException('Signatário não encontrado');
    if (signatario.status === StatusAssinaturaSignatario.ASSINADO) {
      throw new BadRequestException('Você já assinou este documento');
    }
    if (!signatario.email) {
      throw new BadRequestException('Signatário sem e-mail cadastrado');
    }

    const orgaoId = signatario.documento.orgao_id;
    await this.assinaturasService.solicitarOtpEmail(orgaoId, signatario.email, signatario.nome);
    return { canal: 'email' };
  }

  async assinarComoOrgaoUser(
    documentoId: string,
    signatarioId: string,
    usuarioId: string,
    ip: string,
    userAgent: string,
    codigoOtp?: string,
  ): Promise<{ sucesso: boolean; pdf_url?: string }> {
    const signatario = await this.signatarioRepository.findOne({
      where: { id: signatarioId, documento_id: documentoId },
      relations: ['documento', 'documento.orgao', 'documento.signatarios'],
    });
    if (!signatario) throw new NotFoundException('Signatário não encontrado');
    if (signatario.status === StatusAssinaturaSignatario.ASSINADO) {
      throw new BadRequestException('Você já assinou este documento');
    }

    const orgaoId = signatario.documento.orgao_id;

    // Validar OTP se fornecido
    if (codigoOtp && signatario.email) {
      await this.assinaturasService.validarOtpEmail(orgaoId, signatario.email, codigoOtp);
    }

    const codigoValidacao = this.gerarCodigoValidacao();

    signatario.status = StatusAssinaturaSignatario.ASSINADO;
    signatario.data_assinatura = new Date();
    signatario.ip_address = ip;
    signatario.user_agent = userAgent;
    signatario.codigo_validacao = codigoValidacao;
    await this.signatarioRepository.save(signatario);

    // Salvar na tabela assinaturas_digitais para validação pública
    try {
      await this.assinaturasService.registrarAssinatura({
        orgao_id: orgaoId,
        entidade_tipo: EntidadeTipo.DOCUMENTO_AVULSO,
        entidade_id: signatario.documento.id,
        usuario_nome: signatario.nome,
        usuario_cpf_cnpj: signatario.cpf_cnpj,
        usuario_telefone: signatario.telefone || undefined,
        papel_assinante: PapelAssinante.SIGNATARIO,
        ip_address: ip,
        user_agent: userAgent,
        documento_hash: signatario.documento.documento_hash || undefined,
        codigo_validacao_override: codigoValidacao,
      });
    } catch (e) {
      this.logger.error(`Erro ao registrar assinatura digital: ${e.message}`);
    }

    // Verificar se todos assinaram
    const todosSignatarios = signatario.documento.signatarios;
    const todosAssinaram = todosSignatarios.every(
      s => s.id === signatario.id || s.status === StatusAssinaturaSignatario.ASSINADO,
    );

    let pdfUrl: string | undefined;
    if (todosAssinaram) {
      pdfUrl = await this.gerarPdfFinalAssinado(signatario.documento);
      await this.documentoRepository.update(signatario.documento.id, {
        status: StatusDocumentoAssinatura.CONCLUIDO,
        arquivo_assinado_url: pdfUrl,
      });
    }

    // Notificar após assinatura (assíncrono)
    this.notificarAssinatura(signatario, signatario.documento, todosAssinaram).catch((err: any) =>
      this.logger.error(`Erro ao notificar assinatura: ${err.message}`),
    );

    return { sucesso: true, pdf_url: pdfUrl };
  }

  async obterDocumentoPorToken(token: string) {
    const signatario = await this.signatarioRepository.findOne({
      where: { token_acesso: token },
      relations: ['documento', 'documento.orgao'],
    });
    if (!signatario) throw new NotFoundException('Link de assinatura inválido ou expirado.');

    const { documento } = signatario;
    return {
      ja_assinado: signatario.status === StatusAssinaturaSignatario.ASSINADO,
      signatario: {
        id: signatario.id,
        nome: signatario.nome,
        status: signatario.status,
        tem_email: !!signatario.email,
        tem_telefone: !!signatario.telefone,
      },
      documento: {
        id: documento.id,
        titulo: documento.titulo,
        descricao: documento.descricao,
        orgao_nome: documento.orgao?.nome,
        status: documento.status,
        arquivo_original_url: documento.arquivo_original_url,
        arquivo_assinado_url: documento.arquivo_assinado_url,
      },
    };
  }

  async solicitarCodigoAssinatura(token: string, cpfCnpj: string): Promise<{ canal: string }> {
    const signatario = await this.signatarioRepository.findOne({
      where: { token_acesso: token },
      relations: ['documento', 'documento.orgao'],
    });
    if (!signatario) throw new NotFoundException('Link inválido.');
    if (signatario.status === StatusAssinaturaSignatario.ASSINADO) {
      throw new BadRequestException('Este documento já foi assinado por você.');
    }

    const cpfLimpo = cpfCnpj.replace(/\D/g, '');
    if (signatario.cpf_cnpj !== cpfLimpo) {
      throw new BadRequestException('CPF/CNPJ não confere com o cadastrado para este link.');
    }

    const orgaoId = signatario.documento.orgao_id;

    if (signatario.telefone) {
      await this.assinaturasService.solicitarOtp(orgaoId, signatario.telefone, signatario.nome);
      return { canal: 'whatsapp' };
    } else if (signatario.email) {
      await this.assinaturasService.solicitarOtpEmail(orgaoId, signatario.email, signatario.nome);
      return { canal: 'email' };
    } else {
      throw new BadRequestException('Signatário sem telefone nem e-mail cadastrado.');
    }
  }

  async assinarDocumento(
    token: string,
    cpfCnpj: string,
    codigoOtp: string,
    ip: string,
    userAgent: string,
  ): Promise<{ sucesso: boolean; pdf_url?: string }> {
    const signatario = await this.signatarioRepository.findOne({
      where: { token_acesso: token },
      relations: ['documento', 'documento.orgao', 'documento.signatarios'],
    });
    if (!signatario) throw new NotFoundException('Link inválido.');
    if (signatario.status === StatusAssinaturaSignatario.ASSINADO) {
      throw new BadRequestException('Você já assinou este documento.');
    }

    const cpfLimpo = cpfCnpj.replace(/\D/g, '');
    if (signatario.cpf_cnpj !== cpfLimpo) {
      throw new BadRequestException('CPF/CNPJ não confere.');
    }

    const orgaoId = signatario.documento.orgao_id;

    if (signatario.telefone) {
      await this.assinaturasService.validarOtp(orgaoId, signatario.telefone, codigoOtp);
    } else if (signatario.email) {
      await this.assinaturasService.validarOtpEmail(orgaoId, signatario.email, codigoOtp);
    }

    const codigoValidacao = this.gerarCodigoValidacao();

    signatario.status = StatusAssinaturaSignatario.ASSINADO;
    signatario.data_assinatura = new Date();
    signatario.ip_address = ip;
    signatario.user_agent = userAgent;
    signatario.codigo_validacao = codigoValidacao;
    await this.signatarioRepository.save(signatario);

    // Salvar na tabela assinaturas_digitais para validação pública
    try {
      await this.assinaturasService.registrarAssinatura({
        orgao_id: orgaoId,
        entidade_tipo: EntidadeTipo.DOCUMENTO_AVULSO,
        entidade_id: signatario.documento.id,
        usuario_nome: signatario.nome,
        usuario_cpf_cnpj: signatario.cpf_cnpj,
        usuario_telefone: signatario.telefone || undefined,
        papel_assinante: PapelAssinante.SIGNATARIO,
        ip_address: ip,
        user_agent: userAgent,
        documento_hash: signatario.documento.documento_hash || undefined,
        codigo_validacao_override: codigoValidacao,
      });
    } catch (e) {
      this.logger.error(`Erro ao registrar assinatura digital: ${e.message}`);
    }

    // Verificar se todos assinaram
    const todosSignatarios = signatario.documento.signatarios;
    const todosAssinaram = todosSignatarios.every(
      s => s.id === signatario.id || s.status === StatusAssinaturaSignatario.ASSINADO,
    );

    let pdfUrl: string | undefined;
    if (todosAssinaram) {
      pdfUrl = await this.gerarPdfFinalAssinado(signatario.documento);
      await this.documentoRepository.update(signatario.documento.id, {
        status: StatusDocumentoAssinatura.CONCLUIDO,
        arquivo_assinado_url: pdfUrl,
      });
    }

    // Notificar após assinatura (assíncrono)
    this.notificarAssinatura(signatario, signatario.documento, todosAssinaram).catch((err: any) =>
      this.logger.error(`Erro ao notificar assinatura: ${err.message}`),
    );

    return { sucesso: true, pdf_url: pdfUrl };
  }

  // =============================================
  // CANCELAR / REENVIAR
  // =============================================

  async cancelarDocumento(documentoId: string, orgaoId: string): Promise<{ sucesso: boolean }> {
    const doc = await this.documentoRepository.findOne({
      where: { id: documentoId, orgao_id: orgaoId },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado');
    if (doc.status === StatusDocumentoAssinatura.CONCLUIDO) {
      throw new BadRequestException('Documento já concluído, não pode ser cancelado.');
    }
    await this.documentoRepository.update(documentoId, {
      status: StatusDocumentoAssinatura.CANCELADO,
    });
    return { sucesso: true };
  }

  async reenviarNotificacoes(documentoId: string, orgaoId: string): Promise<{ enviados: number }> {
    const doc = await this.documentoRepository.findOne({
      where: { id: documentoId, orgao_id: orgaoId },
      relations: ['signatarios'],
    });
    if (!doc) throw new NotFoundException('Documento não encontrado');
    if (doc.status !== StatusDocumentoAssinatura.AGUARDANDO_ASSINATURAS) {
      throw new BadRequestException('Documento não está aguardando assinaturas.');
    }

    const pendentes = doc.signatarios.filter(s => s.status === StatusAssinaturaSignatario.PENDENTE);
    if (pendentes.length === 0) {
      throw new BadRequestException('Não há signatários pendentes.');
    }

    await this.dispararNotificacoesAssinatura(documentoId);
    return { enviados: pendentes.length };
  }

  // =============================================
  // GERAÇÃO DO PDF FINAL (pdf-lib)
  // =============================================

  private async gerarPdfFinalAssinado(documento: DocumentoAssinatura): Promise<string> {
    const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

    const originalPath = join(this.uploadDir, documento.arquivo_original_url);
    if (!existsSync(originalPath)) {
      throw new BadRequestException('Arquivo original do documento não encontrado.');
    }

    const pdfBytes = readFileSync(originalPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const signatarios = await this.signatarioRepository.find({
      where: { documento_id: documento.id, status: StatusAssinaturaSignatario.ASSINADO },
      order: { data_assinatura: 'ASC' },
    });

    const baseUrl = this.getFrontendUrl();
    const urlValidacao = `${baseUrl}/validar-documento`;
    const pages = pdfDoc.getPages();

    // ── Tentar carregar logo do órgão ──
    let logoImage: any = null;
    try {
      const logoUrl = documento.orgao?.logo_url;
      if (logoUrl) {
        const logoPath = join(this.uploadDir, logoUrl);
        if (existsSync(logoPath)) {
          const logoBytes = readFileSync(logoPath);
          const ext = logoUrl.toLowerCase();
          if (ext.endsWith('.png')) {
            logoImage = await pdfDoc.embedPng(logoBytes);
          } else if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) {
            logoImage = await pdfDoc.embedJpg(logoBytes);
          }
        }
      }
    } catch (e) {
      this.logger.warn('Erro ao carregar logo do órgão: ' + e.message);
    }

    // ── 1. Inserir assinatura compacta (estilo gov.br) na posição marcada ──
    for (const sig of signatarios) {
      const pageIndex = (sig.pagina_assinatura || 1) - 1;
      const targetPage = pages[pageIndex] || pages[pages.length - 1];
      const { width: pw, height: ph } = targetPage.getSize();

      const boxW = 200;
      const boxH = 38;
      const x = (sig.pos_x ?? 0.05) * pw;
      const y = ph - ((sig.pos_y ?? 0.9) * ph) - boxH;

      // Borda fina cinza
      targetPage.drawRectangle({
        x, y, width: boxW, height: boxH,
        borderColor: rgb(0.75, 0.75, 0.75),
        borderWidth: 0.5,
      });

      // Logo do órgão (lado esquerdo)
      const logoW = logoImage ? 28 : 0;
      const textX = x + (logoImage ? logoW + 4 : 4);
      if (logoImage) {
        const dims = logoImage.scale(1);
        const ratio = Math.min(26 / dims.width, 30 / dims.height);
        const lw = dims.width * ratio;
        const lh = dims.height * ratio;
        targetPage.drawImage(logoImage, { x: x + 3, y: y + (boxH - lh) / 2, width: lw, height: lh });
      }

      // Texto: "Documento assinado digitalmente"
      targetPage.drawText('Documento assinado digitalmente', {
        x: textX, y: y + boxH - 9, size: 5.5, font: helvetica, color: rgb(0.3, 0.3, 0.3),
      });
      // Nome em negrito
      const nomeDisplay = sig.nome.length > 35 ? sig.nome.substring(0, 35) + '...' : sig.nome;
      targetPage.drawText(nomeDisplay.toUpperCase(), {
        x: textX, y: y + boxH - 18, size: 6, font: helveticaBold, color: rgb(0.07, 0.07, 0.07),
      });
      // Data
      const dataStr = new Date(sig.data_assinatura).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      targetPage.drawText(`Data: ${dataStr}`, {
        x: textX, y: y + boxH - 26, size: 5, font: helvetica, color: rgb(0.35, 0.35, 0.35),
      });
      // Verificação
      targetPage.drawText(`Verifique em ${urlValidacao}`, {
        x: textX, y: y + boxH - 34, size: 4.5, font: helvetica, color: rgb(0.15, 0.39, 0.93),
      });
    }

    // ── 2. Página resumo (quadro de assinaturas) no final ──
    const summaryPage = pdfDoc.addPage([595, 842]);
    const { width, height } = summaryPage.getSize();

    // Cabeçalho com logo
    let headerTextX = 50;
    if (logoImage) {
      const dims = logoImage.scale(1);
      const ratio = Math.min(40 / dims.width, 40 / dims.height);
      const lw = dims.width * ratio;
      const lh = dims.height * ratio;
      summaryPage.drawImage(logoImage, { x: 35, y: height - 75, width: lw, height: lh });
      headerTextX = 35 + lw + 10;
    }

    summaryPage.drawText('QUADRO DE ASSINATURAS ELETRÔNICAS', {
      x: headerTextX, y: height - 50, size: 13, font: helveticaBold, color: rgb(0.12, 0.25, 0.69),
    });
    summaryPage.drawText('Documento assinado eletronicamente conforme Lei nº 14.063/2020', {
      x: headerTextX, y: height - 64, size: 8, font: helvetica, color: rgb(0.4, 0.4, 0.4),
    });
    if (documento.orgao?.nome) {
      summaryPage.drawText(`Órgão: ${documento.orgao.nome}`, {
        x: headerTextX, y: height - 76, size: 8, font: helvetica, color: rgb(0.3, 0.3, 0.3),
      });
    }

    // Linha separadora
    summaryPage.drawRectangle({ x: 30, y: height - 90, width: width - 60, height: 1, color: rgb(0.8, 0.8, 0.8) });

    let yPos = height - 105;
    for (const sig of signatarios) {
      const cardH = 52;
      summaryPage.drawRectangle({
        x: 30, y: yPos - cardH, width: width - 60, height: cardH,
        color: rgb(0.97, 0.97, 0.98), borderColor: rgb(0.88, 0.88, 0.88), borderWidth: 0.5,
      });

      let sigTextX = 45;
      if (logoImage) {
        const dims = logoImage.scale(1);
        const ratio = Math.min(22 / dims.width, 22 / dims.height);
        const lw = dims.width * ratio;
        const lh = dims.height * ratio;
        summaryPage.drawImage(logoImage, { x: 38, y: yPos - cardH + (cardH - lh) / 2, width: lw, height: lh });
        sigTextX = 38 + lw + 8;
      }

      summaryPage.drawText('Documento assinado digitalmente', {
        x: sigTextX, y: yPos - 12, size: 7, font: helvetica, color: rgb(0.4, 0.4, 0.4),
      });
      summaryPage.drawText(sig.nome.toUpperCase(), {
        x: sigTextX, y: yPos - 23, size: 9, font: helveticaBold, color: rgb(0.07, 0.07, 0.07),
      });
      const dataFmt = new Date(sig.data_assinatura).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      summaryPage.drawText(`Data: ${dataFmt}`, {
        x: sigTextX, y: yPos - 34, size: 7.5, font: helvetica, color: rgb(0.3, 0.3, 0.3),
      });
      summaryPage.drawText(`Verifique em ${urlValidacao}/${sig.codigo_validacao}`, {
        x: sigTextX, y: yPos - 45, size: 6.5, font: helvetica, color: rgb(0.15, 0.39, 0.93),
      });

      yPos -= cardH + 8;
    }

    // Rodapé com QR Code
    if (signatarios.length > 0) {
      const qrUrl = `${urlValidacao}/${signatarios[0].codigo_validacao}`;
      try {
        const qrBuffer: Buffer = await QRCode.toBuffer(qrUrl, { type: 'png', width: 80 });
        const qrImage = await pdfDoc.embedPng(qrBuffer);
        summaryPage.drawImage(qrImage, { x: width - 100, y: 25, width: 60, height: 60 });
      } catch (e) {
        this.logger.warn('Erro ao gerar QR Code: ' + e.message);
      }
      summaryPage.drawText('Verifique a autenticidade em:', { x: 30, y: 70, size: 8, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) });
      summaryPage.drawText(urlValidacao, { x: 30, y: 58, size: 8, font: helvetica, color: rgb(0.15, 0.39, 0.93) });
      summaryPage.drawText(`Documento: ${documento.titulo}`, { x: 30, y: 44, size: 7, font: helvetica, color: rgb(0.4, 0.4, 0.4) });
      if (documento.documento_hash) {
        summaryPage.drawText(`Hash SHA-256: ${documento.documento_hash}`, { x: 30, y: 32, size: 6, font: helvetica, color: rgb(0.5, 0.5, 0.5) });
      }
    }

    const signedBytes = await pdfDoc.save();
    const filename = `assinado_${documento.id}_${Date.now()}.pdf`;
    const outDir = join(this.uploadDir, 'documentos_assinatura_avulsos');
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, filename);
    writeFileSync(outPath, signedBytes);

    return `documentos_assinatura_avulsos/${filename}`;
  }

  // =============================================
  // NOTIFICAÇÃO PÓS-ASSINATURA
  // =============================================

  private async notificarAssinatura(
    signatario: SignatarioDocumento,
    documento: DocumentoAssinatura,
    todosAssinaram: boolean,
  ): Promise<void> {
    const baseUrl = this.getFrontendUrl();
    const orgaoNome = documento.orgao?.nome || 'Órgão';

    // 1. Notificar o signatário que acabou de assinar (confirmação)
    if (signatario.email) {
      const mensagemHtml = `
        <p>Olá, <strong>${signatario.nome}</strong>,</p>
        <p>Sua assinatura no documento <strong>"${documento.titulo}"</strong> foi registrada com sucesso.</p>
        <p>Código de validação: <strong>${signatario.codigo_validacao}</strong></p>
        <p>Verifique em: <a href="${baseUrl}/validar-documento/${signatario.codigo_validacao}">${baseUrl}/validar-documento/${signatario.codigo_validacao}</a></p>
        <hr style="border:1px solid #eee;margin:20px 0;">
        <p style="font-size:12px;color:#666;">Mensagem automática do Portal DCP.</p>
      `;
      await this.notificacoesService.criar({
        orgao_id: documento.orgao_id,
        usuario_id: 'SYSTEM',
        usuario_email: signatario.email,
        usuario_telefone: signatario.telefone ?? undefined,
        tipo: TipoNotificacao.SISTEMA,
        titulo: `Assinatura Confirmada: ${documento.titulo}`,
        mensagem: mensagemHtml,
        enviar_email: true,
        metadata: {
          whatsapp_text: `Olá ${signatario.nome}, sua assinatura no documento "${documento.titulo}" foi registrada. Código: ${signatario.codigo_validacao}. Verifique em: ${baseUrl}/validar-documento/${signatario.codigo_validacao}`,
        },
      }).catch((err: any) => this.logger.error(`Erro notificação confirmação: ${err.message}`));
    }

    // 2. Notificar o criador do documento (via sistema)
    if (documento.criado_por_id) {
      const mensagemCriador = `
        <p>O signatário <strong>${signatario.nome}</strong> assinou o documento <strong>"${documento.titulo}"</strong>.</p>
        ${todosAssinaram ? '<p style="color:#16a34a;font-weight:bold;">✅ Todos os signatários assinaram! O documento está concluído.</p>' : '<p>Ainda há signatários pendentes.</p>'}
        <p><a href="${baseUrl}/orgao/portal-assinaturas">Ver no Portal de Assinaturas</a></p>
      `;
      await this.notificacoesService.criar({
        orgao_id: documento.orgao_id,
        usuario_id: documento.criado_por_id,
        tipo: TipoNotificacao.SISTEMA,
        titulo: todosAssinaram
          ? `Documento Concluído: ${documento.titulo}`
          : `Assinatura Recebida: ${documento.titulo}`,
        mensagem: mensagemCriador,
        enviar_email: false,
        metadata: { documento_id: documento.id },
      }).catch((err: any) => this.logger.error(`Erro notificação criador: ${err.message}`));
    }
  }

  // =============================================
  // ADICIONAR SIGNATÁRIO A DOCUMENTO EXISTENTE
  // =============================================

  async adicionarSignatario(
    documentoId: string,
    orgaoId: string,
    dados: {
      nome: string;
      cpf_cnpj: string;
      email?: string;
      telefone?: string;
      is_orgao_user?: boolean;
      pagina_assinatura?: number;
      pos_x?: number;
      pos_y?: number;
    },
  ): Promise<SignatarioDocumento> {
    const doc = await this.documentoRepository.findOne({
      where: { id: documentoId, orgao_id: orgaoId },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado');
    if (doc.status === StatusDocumentoAssinatura.CANCELADO) {
      throw new BadRequestException('Documento cancelado, não é possível adicionar signatários.');
    }

    // Se o documento já estava CONCLUIDO, voltar para AGUARDANDO_ASSINATURAS
    if (doc.status === StatusDocumentoAssinatura.CONCLUIDO) {
      await this.documentoRepository.update(documentoId, {
        status: StatusDocumentoAssinatura.AGUARDANDO_ASSINATURAS,
      });
    }

    const entity = new SignatarioDocumento();
    entity.documento_id = documentoId;
    entity.nome = dados.nome;
    entity.cpf_cnpj = (dados.cpf_cnpj ?? '').replace(/\D/g, '');
    entity.email = (dados.email ?? '') as string;
    entity.telefone = dados.telefone ? dados.telefone.replace(/\D/g, '') : null;
    entity.status = StatusAssinaturaSignatario.PENDENTE;
    entity.token_acesso = crypto.randomBytes(32).toString('hex');
    entity.pagina_assinatura = dados.pagina_assinatura as number;
    entity.pos_x = dados.pos_x as number;
    entity.pos_y = dados.pos_y as number;
    entity.is_orgao_user = dados.is_orgao_user ?? false;

    const saved = await this.signatarioRepository.save(entity);

    // Disparar notificação para o novo signatário
    this.dispararNotificacoesAssinatura(documentoId).catch((err: any) =>
      this.logger.error(`Erro ao notificar novo signatário: ${err.message}`),
    );

    return saved;
  }

  // =============================================
  // HELPERS
  // =============================================

  private gerarCodigoValidacao(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let codigo = '';
    for (let i = 0; i < 16; i++) codigo += chars.charAt(Math.floor(Math.random() * chars.length));
    return codigo;
  }

  private mascararDoc(doc: string): string {
    if (!doc) return '';
    const l = doc.replace(/\D/g, '');
    if (l.length === 11) return `***.${l.slice(3, 6)}.${l.slice(6, 9)}-**`;
    if (l.length === 14) return `**.***.${l.slice(5, 8)}/****-**`;
    return '***';
  }

  private mascararIP(ip: string): string {
    if (!ip) return '';
    const p = ip.split('.');
    return p.length === 4 ? `${p[0]}.${p[1]}.***.***` : '***.***.***.***';
  }

  private getFrontendUrl(): string {
    if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL.replace(/\/$/, '');
    return 'https://www.portaldcp.com.br';
  }
}