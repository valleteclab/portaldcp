import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssinaturaDigital, EntidadeTipo, PapelAssinante } from './entities/assinatura-digital.entity';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import * as crypto from 'crypto';

@Injectable()
export class AssinaturasService {
  private readonly logger = new Logger(AssinaturasService.name);
  
  // Cache OTP na memória (para produção seria ideal Redis)
  private otpCache: Map<string, { codigo: string; expiracao: number; tentativas: number }> = new Map();

  constructor(
    @InjectRepository(AssinaturaDigital)
    private readonly assinaturaRepository: Repository<AssinaturaDigital>,
    private readonly whatsappService: WhatsAppService,
  ) {}

  // ==========================================
  // 1. Geração e Envio de OTP via WhatsApp
  // ==========================================

  async solicitarOtp(orgaoId: string, telefone: string, usuarioNome: string): Promise<boolean> {
    const telefoneLimpo = telefone.replace(/\D/g, '');
    if (telefoneLimpo.length < 10) {
      throw new BadRequestException('Número de telefone inválido para envio de WhatsApp.');
    }

    // Configuração de anti-spam: máximo 3 tentativas por número a cada 5 min
    const cacheKey = `otp_${orgaoId}_${telefoneLimpo}`;
    const otpExistente = this.otpCache.get(cacheKey);
    
    if (otpExistente && otpExistente.expiracao > Date.now() && otpExistente.tentativas >= 3) {
      throw new BadRequestException('Muitas tentativas. Aguarde 5 minutos antes de solicitar novo código.');
    }

    // Gera código 6 dígitos aleatório
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const expiracao = Date.now() + 5 * 60 * 1000; // 5 minutos
    
    this.otpCache.set(cacheKey, {
      codigo,
      expiracao,
      tentativas: otpExistente ? otpExistente.tentativas + 1 : 1
    });

    const mensagem = `Olá, *${usuarioNome}*.\n\nSeu código de confirmação para *Assinatura Eletrônica* no Portal DCP é: *${codigo}*\n\nEste código expira em 5 minutos. Não o compartilhe com ninguém.`;

    const enviado = await this.whatsappService.enviar(orgaoId, {
      to: telefoneLimpo,
      mensagem,
    });

    if (!enviado) {
      this.logger.error(`Falha ao enviar OTP para ${telefoneLimpo}`);
      throw new BadRequestException('Não foi possível enviar o código via WhatsApp. Verifique se o número está correto e possui WhatsApp ativo.');
    }

    this.logger.log(`OTP enviado via WhatsApp para ${telefoneLimpo}`);
    return true;
  }

  // ==========================================
  // 2. Validação do OTP
  // ==========================================

  async validarOtp(orgaoId: string, telefone: string, codigo: string): Promise<boolean> {
    const telefoneLimpo = telefone.replace(/\D/g, '');
    const cacheKey = `otp_${orgaoId}_${telefoneLimpo}`;
    const otpData = this.otpCache.get(cacheKey);

    if (!otpData) {
      throw new BadRequestException('Nenhum código ativo encontrado para este número. Solicite um novo código.');
    }

    if (Date.now() > otpData.expiracao) {
      this.otpCache.delete(cacheKey);
      throw new BadRequestException('O código expirou. Solicite um novo código.');
    }

    if (otpData.codigo !== codigo) {
      throw new BadRequestException('Código incorreto.');
    }

    // Se validou com sucesso, limpa do cache para não ser reusado
    this.otpCache.delete(cacheKey);
    return true;
  }

  // ==========================================
  // 3. Registro da Assinatura no Banco
  // ==========================================

  /** Gera código de 16 caracteres (sem hífens) para caber em varchar(16) */
  private gerarCodigoValidacao(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sem O/0/1/I para evitar confusão
    let codigo = '';
    for (let i = 0; i < 16; i++) {
      codigo += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return codigo;
  }

  /** Formata código para exibição: XXXX-XXXX-XXXX-XXXX */
  formatarCodigoValidacao(codigo: string): string {
    const limpo = (codigo || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
    if (limpo.length < 16) return codigo;
    return `${limpo.slice(0,4)}-${limpo.slice(4,8)}-${limpo.slice(8,12)}-${limpo.slice(12,16)}`;
  }

  async registrarAssinatura(dados: {
    orgao_id: string;
    entidade_tipo: EntidadeTipo;
    entidade_id: string;
    usuario_id?: string;
    usuario_nome: string;
    usuario_cpf_cnpj: string;
    usuario_telefone?: string;
    papel_assinante: PapelAssinante;
    ip_address?: string;
    user_agent?: string;
    documento_hash?: string;
  }): Promise<AssinaturaDigital> {
    
    const assinatura = this.assinaturaRepository.create({
      ...dados,
      codigo_validacao: this.gerarCodigoValidacao(),
    });

    return await this.assinaturaRepository.save(assinatura);
  }

  // ==========================================
  // 4. Portal Público: Validação e Busca
  // ==========================================

  async validarDocumentoPublico(codigoValidacao: string): Promise<{ documentoValido: boolean; assinaturas: AssinaturaDigital[] }> {
    const codigoDecodificado = typeof codigoValidacao === 'string' ? decodeURIComponent(codigoValidacao) : codigoValidacao;
    const codigoLimpo = codigoDecodificado.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);

    // Busca a assinatura baseada no código (armazenado sem hífens)
    const assinaturaOrigem = await this.assinaturaRepository.findOne({
      where: { codigo_validacao: codigoLimpo }
    });

    if (!assinaturaOrigem) {
      throw new NotFoundException('Documento não encontrado ou código de validação inválido.');
    }

    // Busca todas as assinaturas do MESMO documento (entidade_id)
    const assinaturasDoc = await this.assinaturaRepository.find({
      where: { 
        entidade_tipo: assinaturaOrigem.entidade_tipo,
        entidade_id: assinaturaOrigem.entidade_id,
        orgao_id: assinaturaOrigem.orgao_id
      },
      order: { data_assinatura: 'ASC' }
    });

    // Mascarar CPF/CNPJ por privacidade na rota pública
    const assinaturasPublicas = assinaturasDoc.map(ass => ({
      ...ass,
      usuario_cpf_cnpj: this.mascararDocumento(ass.usuario_cpf_cnpj),
      ip_address: this.mascararIP(ass.ip_address),
    }));

    return {
      documentoValido: true,
      assinaturas: assinaturasPublicas
    };
  }

  private mascararDocumento(doc: string): string {
    if (!doc) return '';
    const limpo = doc.replace(/\D/g, '');
    if (limpo.length === 11) { // CPF
      return `***.${limpo.substring(3, 6)}.${limpo.substring(6, 9)}-**`;
    }
    if (limpo.length === 14) { // CNPJ
      return `**.***.${limpo.substring(5, 8)}/****-**`;
    }
    return '***';
  }

  private mascararIP(ip: string): string {
    if (!ip) return '';
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.***.***`;
    }
    return '***.***.***.***';
  }
}
