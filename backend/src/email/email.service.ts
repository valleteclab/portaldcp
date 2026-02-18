import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Orgao } from '../orgaos/entities/orgao.entity';

export interface EnviarEmailDto {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{ filename: string; content: Buffer | string }>;
  replyTo?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @InjectRepository(Orgao)
    private readonly orgaoRepository: Repository<Orgao>,
  ) {}

  private getEncryptionKey(): string {
    return process.env.PNCP_ENCRYPTION_KEY || 'licitafacil-pncp-encryption-key-32';
  }

  private decryptText(encryptedText: string): string {
    if (!encryptedText || !encryptedText.includes(':')) return encryptedText;
    try {
      const key = Buffer.from(this.getEncryptionKey().padEnd(32, '0').substring(0, 32));
      const textParts = encryptedText.split(':');
      const iv = Buffer.from(textParts.shift()!, 'hex');
      const encrypted = textParts.join(':');
      const decipher = createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      return encryptedText;
    }
  }

  async getSmtpConfig(orgaoId: string): Promise<{
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
  } | null> {
    const orgao = await this.orgaoRepository.findOne({
      where: { id: orgaoId },
      select: ['id', 'email_smtp_host', 'email_smtp_port', 'email_smtp_secure', 'email_smtp_user', 'email_smtp_senha', 'email_from'],
    });
    if (!orgao?.email_smtp_host || !orgao?.email_smtp_user) return null;
    const senha = orgao.email_smtp_senha ? this.decryptText(orgao.email_smtp_senha) : '';
    return {
      host: orgao.email_smtp_host,
      port: orgao.email_smtp_port || 587,
      secure: orgao.email_smtp_secure ?? false,
      user: orgao.email_smtp_user,
      pass: senha,
      from: orgao.email_from || orgao.email_smtp_user,
    };
  }

  async enviar(orgaoId: string, dto: EnviarEmailDto): Promise<boolean> {
    const config = await this.getSmtpConfig(orgaoId);
    if (!config) {
      this.logger.warn(`SMTP não configurado para órgão ${orgaoId}, email não enviado`);
      return false;
    }

    try {
      const transport = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.user, pass: config.pass },
      });

      const to = Array.isArray(dto.to) ? dto.to.join(', ') : dto.to;
      const mailOptions: nodemailer.SendMailOptions = {
        from: config.from,
        to,
        subject: dto.subject,
        text: dto.text,
        html: dto.html,
        attachments: dto.attachments,
        replyTo: dto.replyTo,
      };

      const info = await transport.sendMail(mailOptions);
      this.logger.log(`Email enviado para ${to}: ${info.messageId}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Erro ao enviar email (orgao ${orgaoId}): ${error.message}`);
      throw error;
    }
  }

  async testarConexao(orgaoId: string, emailTeste?: string): Promise<{ sucesso: boolean; mensagem: string }> {
    const config = await this.getSmtpConfig(orgaoId);
    if (!config) {
      return { sucesso: false, mensagem: 'SMTP não configurado para este órgão' };
    }

    const destino = emailTeste || config.user;
    try {
      await this.enviar(orgaoId, {
        to: destino,
        subject: '[Teste] Configuração de email - Portal DCP',
        text: 'Este é um email de teste. Se você recebeu, a configuração SMTP está correta.',
        html: '<p>Este é um email de teste. Se você recebeu, a configuração SMTP está correta.</p>',
      });
      return { sucesso: true, mensagem: `Email de teste enviado para ${destino}` };
    } catch (error: any) {
      return { sucesso: false, mensagem: error.message || 'Erro ao enviar email de teste' };
    }
  }
}
