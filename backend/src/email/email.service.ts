import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import { createDecipheriv } from 'crypto';
import { Resend } from 'resend';
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

  private normalizarEmailFrom(from: string): string {
    if (!from) return '';
    from = from.trim();
    
    // Se tem formato "Nome <email@dominio.com>", normalizar só o email
    const match = from.match(/^(.*)<([^>]+)>\s*$/);
    if (match) {
      const displayName = match[1].trim();
      const emailAddress = match[2].trim().toLowerCase();
      return `${displayName} <${emailAddress}>`;
    }
    
    // Se é só o email sem display name, converter tudo para lowercase
    return from.toLowerCase();
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
      cache: false,
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

  async getResendConfig(orgaoId: string): Promise<{
    apiKey: string;
    from: string;
  } | null> {
    // 1. Tenta configuração do órgão
    const orgao = await this.orgaoRepository.findOne({
      where: { id: orgaoId },
      select: ['id', 'email_resend_api_key', 'email_resend_from'],
      cache: false,
    });
    
    this.logger.log(`Resend config para orgao ${orgaoId}: email_resend_api_key=${orgao?.email_resend_api_key ? '***' : 'null'}, email_resend_from=${orgao?.email_resend_from || 'null'}`);
    
    if (orgao?.email_resend_api_key && orgao?.email_resend_from) {
      const apiKey = orgao.email_resend_api_key ? this.decryptText(orgao.email_resend_api_key) : '';
      // Normalizar apenas o endereço de email para lowercase, manter display name
      const fromEmail = this.normalizarEmailFrom(orgao.email_resend_from);
      this.logger.log(`Usando config do orgao: from=${fromEmail}`);
      return {
        apiKey,
        from: fromEmail,
      };
    }
    
    // 2. Fallback para variável de ambiente global (como WhatsApp)
    if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
      const fromEmail = this.normalizarEmailFrom(process.env.RESEND_FROM_EMAIL);
      this.logger.log(`Usando config global: from=${fromEmail}`);
      return {
        apiKey: process.env.RESEND_API_KEY,
        from: fromEmail,
      };
    }
    
    return null;
  }

  async getEmailConfig(orgaoId: string): Promise<{
    metodo: 'SMTP' | 'RESEND';
    config: any;
  } | null> {
    const orgao = await this.orgaoRepository.findOne({
      where: { id: orgaoId },
      select: ['id', 'email_metodo'],
      cache: false,
    });
    
    // Debug: log do objeto completo
    this.logger.log(`[DEBUG] Orgao lido do banco: ${JSON.stringify(orgao)}`);
    
    // Default to SMTP for backwards compatibility
    const metodo = orgao?.email_metodo || 'SMTP';
    this.logger.log(`Email config para orgao ${orgaoId}: metodo=${metodo}`);

    if (metodo === 'RESEND') {
      const config = await this.getResendConfig(orgaoId);
      if (!config) {
        this.logger.warn(`Resend config incompleto para orgao ${orgaoId}`);
        return null;
      }
      return { metodo: 'RESEND', config };
    } else {
      const config = await this.getSmtpConfig(orgaoId);
      if (!config) {
        this.logger.warn(`SMTP config incompleto para orgao ${orgaoId}`);
        return null;
      }
      return { metodo: 'SMTP', config };
    }
  }

  async enviar(orgaoId: string, dto: EnviarEmailDto): Promise<boolean> {
    const emailConfig = await this.getEmailConfig(orgaoId);
    if (!emailConfig) {
      this.logger.warn(`Email nao configurado para orgao ${orgaoId}, email nao enviado`);
      return false;
    }

    try {
      if (emailConfig.metodo === 'RESEND') {
        return await this.enviarResend(emailConfig.config, dto);
      } else {
        return await this.enviarSmtp(emailConfig.config, dto);
      }
    } catch (error: any) {
      this.logger.error(`Erro ao enviar email (${emailConfig.metodo}, orgao ${orgaoId}): ${error.message}`);
      throw error;
    }
  }

  private async enviarSmtp(config: any, dto: EnviarEmailDto): Promise<boolean> {
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
      // Forçar IPv4 para evitar ENETUNREACH em redes sem IPv6
      family: 4,
    } as any);

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
    this.logger.log(`Email SMTP enviado para ${to}: ${info.messageId}`);
    return true;
  }

  private async enviarResend(config: any, dto: EnviarEmailDto): Promise<boolean> {
    const resend = new Resend(config.apiKey);
    
    const to = Array.isArray(dto.to) ? dto.to[0] : dto.to;
    
    // Normalizar apenas o endereço de email para lowercase, manter display name
    const fromEmail = this.normalizarEmailFrom(config.from);
    
    this.logger.log(`Enviando email via Resend: from=${fromEmail}, to=${to}`);
    
    const emailOptions: any = {
      from: fromEmail,
      to: to,
      subject: dto.subject,
    };

    if (dto.html) {
      emailOptions.html = dto.html;
    } else if (dto.text) {
      emailOptions.text = dto.text;
    }

    if (dto.replyTo) {
      emailOptions.replyTo = dto.replyTo;
    }

    // Resend API suporta attachments - converter para base64
    if (dto.attachments && dto.attachments.length > 0) {
      emailOptions.attachments = dto.attachments.map(att => ({
        filename: att.filename,
        content: att.content.toString('base64'),
      }));
      this.logger.log(`Anexando ${dto.attachments.length} arquivo(s) ao email via Resend`);
    }

    const { data, error } = await resend.emails.send(emailOptions);
    
    if (error) {
      throw new Error(`Resend API error: ${error.message}`);
    }

    this.logger.log(`Email Resend enviado para ${to}: ${data.id}`);
    return true;
  }

  async testarConexao(orgaoId: string, emailTeste?: string): Promise<{ sucesso: boolean; mensagem: string }> {
    const emailConfig = await this.getEmailConfig(orgaoId);
    if (!emailConfig) {
      return { sucesso: false, mensagem: 'Email nao configurado para este orgao' };
    }

    const destino = emailTeste || (emailConfig.metodo === 'RESEND' ? emailConfig.config.from : emailConfig.config.user);
    
    try {
      await this.enviar(orgaoId, {
        to: destino,
        subject: '[Teste] Configuracao de email - Portal DCP',
        text: 'Este e um email de teste. Se voce recebeu, a configuracao esta correta.',
        html: '<p>Este e um email de teste. Se voce recebeu, a configuracao esta correta.</p>',
      });
      return { sucesso: true, mensagem: `Email de teste enviado para ${destino} via ${emailConfig.metodo}` };
    } catch (error: any) {
      return { sucesso: false, mensagem: error.message || `Erro ao enviar email de teste via ${emailConfig.metodo}` };
    }
  }
}
