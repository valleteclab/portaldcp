import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import * as dns from 'dns/promises';
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
      // Resolve host para IPv4 para evitar ENETUNREACH em redes sem IPv6
      let hostToUse = config.host;
      try {
        const addrs = await dns.resolve4(config.host);
        if (addrs.length > 0) hostToUse = addrs[0];
      } catch {
        // mantém hostname se resolve4 falhar (ex: host já é IP)
      }

      // Porta 587 = STARTTLS (secure: false). Porta 465 = SSL implícito (secure: true).
      // Usar secure: true na 587 causa "wrong version number".
      const secure = config.port === 465 ? true : false;

      const transport = nodemailer.createTransport({
        host: hostToUse,
        port: config.port,
        secure,
        auth: { user: config.user, pass: config.pass },
        tls: hostToUse !== config.host ? { servername: config.host } : undefined,
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
      let mensagem = error.message || 'Erro ao enviar email de teste';
      if (mensagem.includes('Invalid greeting') || mensagem.includes('Gpop') || mensagem.includes('POP')) {
        mensagem = 'Servidor incorreto: você configurou POP3 ou IMAP na aba SMTP. Para ENVIAR emails use smtp.gmail.com (porta 587) ou smtp.office365.com (porta 587). pop.gmail.com e imap.gmail.com são para RECEBER.';
      }
      if (mensagem.includes('ENETUNREACH') || mensagem.includes('ETIMEDOUT')) {
        mensagem = 'Rede inacessível. O servidor pode não ter IPv6. Já configuramos para usar IPv4. Verifique firewall, proxy ou se o host permite conexões SMTP na porta 587.';
      }
      if (mensagem.includes('wrong version number') || mensagem.includes('ssl3_get_record')) {
        mensagem = 'Erro SSL: na porta 587 use SSL/TLS desligado (STARTTLS). Na porta 465 ligue SSL/TLS. Corrija a configuração e tente novamente.';
      }
      if (mensagem.includes('Application-specific password') || mensagem.includes('InvalidSecondFactor') || mensagem.includes('534-5.7.9')) {
        mensagem = 'Gmail com 2FA exige Senha de app (não a senha normal). Acesse https://myaccount.google.com/apppasswords — ative 2FA se necessário, gere uma senha de app e use os 16 caracteres no campo Senha.';
      }
      return { sucesso: false, mensagem };
    }
  }
}
