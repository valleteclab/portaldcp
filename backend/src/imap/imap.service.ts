import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImapFlow } from 'imapflow';
import { createDecipheriv } from 'crypto';
import { Orgao } from '../orgaos/entities/orgao.entity';

export interface EmailResumido {
  uid: number;
  subject: string;
  from: string;
  date: Date;
  seen: boolean;
}

export interface EmailDetalhe {
  uid: number;
  subject: string;
  from: string;
  to: string[];
  date: Date;
  seen: boolean;
  text?: string;
  html?: string;
}

@Injectable()
export class ImapService {
  private readonly logger = new Logger(ImapService.name);

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

  async getImapConfig(orgaoId: string): Promise<{
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  } | null> {
    const orgao = await this.orgaoRepository.findOne({
      where: { id: orgaoId },
      select: ['id', 'email_imap_host', 'email_imap_port', 'email_imap_user', 'email_imap_senha'],
    });
    if (!orgao?.email_imap_host || !orgao?.email_imap_user) return null;
    const senha = orgao.email_imap_senha ? this.decryptText(orgao.email_imap_senha) : '';
    return {
      host: orgao.email_imap_host,
      port: orgao.email_imap_port || 993,
      secure: true,
      user: orgao.email_imap_user,
      pass: senha,
    };
  }

  private createClient(config: { host: string; port: number; secure: boolean; user: string; pass: string }): ImapFlow {
    return new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
      logger: false,
    });
  }

  async listarEmails(
    orgaoId: string,
    pasta = 'INBOX',
    limit = 50,
    offset = 0,
  ): Promise<{ emails: EmailResumido[]; total: number }> {
    const config = await this.getImapConfig(orgaoId);
    if (!config) {
      throw new NotFoundException('IMAP não configurado para este órgão');
    }

    const client = this.createClient(config);
    try {
      await client.connect();
      const lock = await client.getMailboxLock(pasta);
      try {
        const mailbox = client.mailbox;
        const total = mailbox && typeof mailbox === 'object' ? mailbox.exists : 0;
        if (total === 0) {
          return { emails: [], total: 0 };
        }

        // IMAP sequence: 1:50 = primeiros 50, *:-50 = últimos 50
        // offset/limit: buscar últimos (limit+offset) e depois fatiar
        const seq = offset === 0 ? `*:-${limit}` : `*:-${offset + limit}`;
        const messages = await client.fetchAll(seq, {
          envelope: true,
          flags: true,
        });

        const emails: EmailResumido[] = messages.map((msg) => {
          const fromAddr = msg.envelope?.from?.[0];
          const from = fromAddr
            ? fromAddr.name
              ? `${fromAddr.name} <${fromAddr.address}>`
              : fromAddr.address || ''
            : '';
          return {
            uid: msg.uid,
            subject: msg.envelope?.subject || '(sem assunto)',
            from,
            date: msg.envelope?.date ? new Date(msg.envelope.date) : new Date(),
            seen: msg.flags?.has('\\Seen') ?? false,
          };
        });

        const sliced = emails.slice(offset, offset + limit).reverse();
        return { emails: sliced, total };
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  }

  async obterEmail(orgaoId: string, uid: number, pasta = 'INBOX'): Promise<EmailDetalhe> {
    const config = await this.getImapConfig(orgaoId);
    if (!config) {
      throw new NotFoundException('IMAP não configurado para este órgão');
    }

    const client = this.createClient(config);
    try {
      await client.connect();
      const lock = await client.getMailboxLock(pasta);
      try {
        const msg = await client.fetchOne(String(uid), {
          envelope: true,
          flags: true,
          bodyStructure: true,
          source: true,
        });
        if (!msg) {
          throw new NotFoundException(`Email com UID ${uid} não encontrado`);
        }

        const fromAddr = msg.envelope?.from?.[0];
        const from = fromAddr
          ? fromAddr.name
            ? `${fromAddr.name} <${fromAddr.address}>`
            : fromAddr.address || ''
          : '';
        const to = (msg.envelope?.to || []).map((a) => (a.name ? `${a.name} <${a.address}>` : a.address || ''));

        let text: string | undefined;
        let html: string | undefined;
        if (msg.source) {
          const raw = msg.source.toString();
          // Parse simples: procurar por text/plain e text/html
          const textMatch = raw.match(/Content-Type:\s*text\/plain[^]*?(\r?\n\r?\n)([^]*?)(?=\r?\n--|\r?\nContent-Type:|$)/is);
          const htmlMatch = raw.match(/Content-Type:\s*text\/html[^]*?(\r?\n\r?\n)([^]*?)(?=\r?\n--|\r?\nContent-Type:|$)/is);
          if (textMatch) text = textMatch[2].trim();
          if (htmlMatch) html = htmlMatch[2].trim();
          if (!text && !html) text = raw.slice(0, 5000);
        }

        return {
          uid: msg.uid,
          subject: msg.envelope?.subject || '(sem assunto)',
          from,
          to,
          date: msg.envelope?.date ? new Date(msg.envelope.date) : new Date(),
          seen: msg.flags?.has('\\Seen') ?? false,
          text,
          html,
        };
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  }

  async marcarComoLido(orgaoId: string, uid: number, pasta = 'INBOX'): Promise<void> {
    const config = await this.getImapConfig(orgaoId);
    if (!config) {
      throw new NotFoundException('IMAP não configurado para este órgão');
    }

    const client = this.createClient(config);
    try {
      await client.connect();
      const lock = await client.getMailboxLock(pasta);
      try {
        await client.messageFlagsAdd({ uid: String(uid) }, ['\\Seen']);
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  }

  async testarConexao(orgaoId: string): Promise<{ sucesso: boolean; mensagem: string }> {
    const config = await this.getImapConfig(orgaoId);
    if (!config) {
      return { sucesso: false, mensagem: 'IMAP não configurado para este órgão' };
    }

    const client = this.createClient(config);
    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        const mailbox = client.mailbox;
        const existe = mailbox && typeof mailbox === 'object' ? mailbox.exists : 0;
        return { sucesso: true, mensagem: `Conexão OK. INBOX tem ${existe} mensagem(ns)` };
      } finally {
        lock.release();
      }
    } catch (error: any) {
      return { sucesso: false, mensagem: error.message || 'Erro ao conectar ao servidor IMAP' };
    } finally {
      try {
        await client.logout();
      } catch {
        // ignora erro de logout
      }
    }
  }
}
