import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { DocumentoAssinatura, StatusDocumentoAssinatura } from '../assinaturas/entities/documento-assinatura.entity';
import { SignatarioDocumento, StatusAssinaturaSignatario } from '../assinaturas/entities/signatario-documento.entity';
import { CriarDocumentoDto } from './dto/criar-documento.dto';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { TipoNotificacao } from '../notificacoes/entities/notificacao.entity';
import { AssinaturasService } from '../assinaturas/assinaturas.service';
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
      // 1. Criar o documento principal
      const documento = this.documentoRepository.create({
        orgao_id: orgaoId,
        titulo: dados.titulo,
        descricao: dados.descricao,
        arquivo_original_url: arquivoUrl,
        status: StatusDocumentoAssinatura.AGUARDANDO_ASSINATURAS,
        criado_por_id: usuarioId,
      });

      const docSalvo = await queryRunner.manager.save(DocumentoAssinatura, documento);

      // 2. Criar os signatários
      if (dados.signatarios && dados.signatarios.length > 0) {
        const signatarios = dados.signatarios.map(sig => {
          return this.signatarioRepository.create({
            documento_id: docSalvo.id,
            nome: sig.nome,
            cpf_cnpj: sig.cpf_cnpj.replace(/\D/g, ''),
            email: sig.email,
            telefone: sig.telefone ? sig.telefone.replace(/\D/g, '') : null,
            status: StatusAssinaturaSignatario.PENDENTE,
            token_acesso: crypto.randomBytes(32).toString('hex'),
          });
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

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    for (const signatario of doc.signatarios) {
      if (signatario.status !== StatusAssinaturaSignatario.PENDENTE) continue;

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
        metadata: { is_external: true, whatsapp_text: mensagemTexto },
      }).catch(err =>
        this.logger.error(`Erro ao notificar ${signatario.nome}: ${err.message}`),
      );
    }
  }

  // =============================================
  // FLUXO PÚBLICO (Signatário)
  // =============================================

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

    return { sucesso: true, pdf_url: pdfUrl };
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

    const page = pdfDoc.addPage([595, 842]); // A4
    const { width, height } = page.getSize();

    // Cabeçalho azul
    page.drawRectangle({ x: 30, y: height - 90, width: width - 60, height: 60, color: rgb(0.12, 0.25, 0.69) });
    page.drawText('QUADRO DE ASSINATURAS ELETRÔNICAS', {
      x: 50, y: height - 58, size: 13, font: helveticaBold, color: rgb(1, 1, 1),
    });
    page.drawText('Documento assinado eletronicamente conforme Lei n 14.063/2020', {
      x: 50, y: height - 74, size: 9, font: helvetica, color: rgb(0.9, 0.9, 0.9),
    });

    const signatarios = await this.signatarioRepository.find({
      where: { documento_id: documento.id, status: StatusAssinaturaSignatario.ASSINADO },
      order: { data_assinatura: 'ASC' },
    });

    let yPos = height - 110;
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    for (const sig of signatarios) {
      page.drawRectangle({ x: 30, y: yPos - 70, width: width - 60, height: 68, color: rgb(0.96, 0.97, 0.98), borderColor: rgb(0.88, 0.88, 0.88), borderWidth: 1 });
      page.drawText(`Assinado por: ${sig.nome}`, { x: 45, y: yPos - 18, size: 11, font: helveticaBold, color: rgb(0.07, 0.07, 0.07) });
      page.drawText(`CPF/CNPJ: ${this.mascararDoc(sig.cpf_cnpj)}`, { x: 45, y: yPos - 33, size: 9, font: helvetica, color: rgb(0.3, 0.3, 0.3) });
      page.drawText(`Data/Hora: ${new Date(sig.data_assinatura).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, { x: 45, y: yPos - 46, size: 9, font: helvetica, color: rgb(0.3, 0.3, 0.3) });
      page.drawText(`Codigo: ${sig.codigo_validacao}  |  IP: ${this.mascararIP(sig.ip_address)}`, { x: 45, y: yPos - 59, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5) });
      yPos -= 82;
    }

    // Rodapé com QR Code
    if (signatarios.length > 0) {
      const urlValidacao = `${baseUrl}/validar-documento/${signatarios[0].codigo_validacao}`;
      try {
        const qrBuffer: Buffer = await QRCode.toBuffer(urlValidacao, { type: 'png', width: 80 });
        const qrImage = await pdfDoc.embedPng(qrBuffer);
        page.drawImage(qrImage, { x: width - 110, y: 30, width: 70, height: 70 });
      } catch (e) {
        this.logger.warn('Erro ao gerar QR Code: ' + e.message);
      }
      page.drawText('Verifique a autenticidade em:', { x: 30, y: 90, size: 9, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) });
      page.drawText(`${baseUrl}/validar-documento`, { x: 30, y: 78, size: 9, font: helvetica, color: rgb(0.15, 0.39, 0.93) });
    }

    const signedBytes = await pdfDoc.save();
    const filename = `assinado_${documento.id}_${Date.now()}.pdf`;
    const outDir = join(this.uploadDir, 'documentos_assinatura_avulsos');
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, filename);
    writeFileSync(outPath, signedBytes);

    return `documentos_assinatura_avulsos/${filename}`;
  }

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
}