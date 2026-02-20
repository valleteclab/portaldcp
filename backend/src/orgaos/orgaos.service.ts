import { Injectable, ConflictException, NotFoundException, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Orgao } from './entities/orgao.entity';
import { CreateOrgaoDto } from './dto/create-orgao.dto';
import { ModuloSistema } from './enums/modulos.enum';
import { Usuario, RoleUsuario } from '../usuarios/entities/usuario.entity';
import { UploadService } from '../upload/upload.service';
import axios from 'axios';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class OrgaosService {
  private readonly logger = new Logger(OrgaosService.name);

  constructor(
    @InjectRepository(Orgao)
    private readonly orgaoRepository: Repository<Orgao>,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    private readonly uploadService: UploadService,
  ) {}

  // ============ CRIPTOGRAFIA ============
  
  private getEncryptionKey(): string {
    // Chave de criptografia do ambiente (em produção, usar variável de ambiente)
    return process.env.PNCP_ENCRYPTION_KEY || 'licitafacil-pncp-encryption-key-32';
  }

  private encryptText(text: string): string {
    const key = Buffer.from(this.getEncryptionKey().padEnd(32, '0').substring(0, 32));
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decryptText(encryptedText: string): string {
    const key = Buffer.from(this.getEncryptionKey().padEnd(32, '0').substring(0, 32));
    const textParts = encryptedText.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encrypted = textParts.join(':');
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  async create(createOrgaoDto: CreateOrgaoDto): Promise<Orgao> {
    // Normaliza CNPJ (remove formatação)
    const cnpjNormalizado = createOrgaoDto.cnpj?.replace(/\D/g, '') || '';
    console.log('[OrgaosService] Criando órgão com CNPJ:', cnpjNormalizado);
    
    // Verifica duplicidade por CNPJ (comparando sem formatação)
    const orgaos = await this.orgaoRepository.find();
    const existingCnpj = orgaos.find(o => o.cnpj?.replace(/\D/g, '') === cnpjNormalizado);
    if (existingCnpj) {
      console.log('[OrgaosService] CNPJ duplicado encontrado:', existingCnpj.id);
      throw new ConflictException('Já existe um órgão cadastrado com este CNPJ');
    }

    // Verifica duplicidade por código
    const existingCodigo = await this.orgaoRepository.findOne({
      where: { codigo: createOrgaoDto.codigo },
    });
    if (existingCodigo) {
      throw new ConflictException('Já existe um órgão cadastrado com este código');
    }

    // Prepara dados com valores padrão
    const { senha, ...restDto } = createOrgaoDto;
    const dadosOrgao: any = {
      ...restDto,
      cnpj: cnpjNormalizado,
      logradouro: createOrgaoDto.logradouro || 'A definir',
      bairro: createOrgaoDto.bairro || 'Centro',
      cep: createOrgaoDto.cep || '00000-000',
      responsavel_nome: createOrgaoDto.responsavel_nome || 'A definir',
      responsavel_cpf: createOrgaoDto.responsavel_cpf || '000.000.000-00',
      ativo: createOrgaoDto.ativo !== undefined ? createOrgaoDto.ativo : true,
    };

    // Hash da senha antes de salvar
    if (senha) {
      dadosOrgao.senha_hash = createHash('sha256').update(senha).digest('hex');
    }
    
    const orgao = this.orgaoRepository.create(dadosOrgao);
    const orgaoSalvo = await this.orgaoRepository.save(orgao) as any as Orgao;

    // Criar usuário ADMIN inicial vinculado ao órgão
    if (createOrgaoDto.email_login && senha) {
      try {
        const existeUsuario = await this.usuarioRepository.findOneBy({ email: createOrgaoDto.email_login });
        if (!existeUsuario) {
          const usuario = this.usuarioRepository.create({
            nome: createOrgaoDto.responsavel_nome || orgaoSalvo.nome,
            email: createOrgaoDto.email_login,
            senha_hash: createHash('sha256').update(senha).digest('hex'),
            cpf: createOrgaoDto.responsavel_cpf || undefined,
            cargo: createOrgaoDto.responsavel_cargo || 'Administrador',
            role: RoleUsuario.ADMIN,
            orgao_id: orgaoSalvo.id,
            ativo: true,
          });
          await this.usuarioRepository.save(usuario);
          this.logger.log(`Usuário ADMIN inicial criado para órgão ${orgaoSalvo.nome}: ${createOrgaoDto.email_login}`);
        }
      } catch (error) {
        this.logger.warn(`Não foi possível criar usuário inicial para órgão ${orgaoSalvo.nome}: ${error.message}`);
      }
    }

    return orgaoSalvo;
  }

  async findAll(includeInactive = false): Promise<Orgao[]> {
    const where = includeInactive ? {} : { ativo: true };
    return await this.orgaoRepository.find({
      where,
      order: { nome: 'ASC' }
    });
  }

  async findOne(id: string): Promise<Orgao> {
    const orgao = await this.orgaoRepository.findOneBy({ id });
    if (!orgao) {
      throw new NotFoundException(`Órgão com ID ${id} não encontrado`);
    }
    return orgao;
  }

  async findByCodigo(codigo: string): Promise<Orgao> {
    const orgao = await this.orgaoRepository.findOneBy({ codigo });
    if (!orgao) {
      throw new NotFoundException(`Órgão com código ${codigo} não encontrado`);
    }
    return orgao;
  }

  async findByEmail(email: string): Promise<Orgao | null> {
    return await this.orgaoRepository.findOneBy({ email_login: email });
  }

  async findByCnpj(cnpj: string): Promise<Orgao | null> {
    return await this.orgaoRepository.findOneBy({ cnpj });
  }

  async resetCredenciais(cnpj: string, email: string, senha: string): Promise<Orgao> {
    const cnpjLimpo = cnpj.replace(/\D/g, '');

    // Busca órgão ignorando máscara do CNPJ
    const todos = await this.orgaoRepository.find();
    const orgao = todos.find(o => (o.cnpj || '').replace(/\D/g, '') === cnpjLimpo);

    if (!orgao) {
      throw new NotFoundException(`Órgão com CNPJ ${cnpj} não encontrado`);
    }

    // Atualiza credenciais de acesso
    orgao.email_login = email;
    orgao.senha_hash = createHash('sha256').update(senha).digest('hex');
    orgao.ativo = true;

    return await this.orgaoRepository.save(orgao);
  }

  async update(id: string, updateData: Partial<CreateOrgaoDto>): Promise<Orgao> {
    const orgao = await this.findOne(id);
    const { senha, ...restData } = updateData;
    Object.assign(orgao, restData);

    // Hash da senha se fornecida
    if (senha) {
      orgao.senha_hash = createHash('sha256').update(senha).digest('hex');
    }

    return await this.orgaoRepository.save(orgao);
  }

  async deactivate(id: string): Promise<Orgao> {
    const orgao = await this.findOne(id);
    orgao.ativo = false;
    return await this.orgaoRepository.save(orgao);
  }

  // ============ VINCULAÇÃO PNCP ============
  // A plataforma LicitaFácil tem UMA credencial no PNCP
  // Aqui gerenciamos quais órgãos estão vinculados à plataforma

  async vincularPNCP(id: string, config: {
    pncp_vinculado: boolean;
    pncp_codigo_unidade: string;
  }): Promise<Orgao> {
    const orgao = await this.findOne(id);
    
    orgao.pncp_vinculado = config.pncp_vinculado;
    orgao.pncp_codigo_unidade = config.pncp_codigo_unidade || '1';
    orgao.pncp_data_vinculacao = config.pncp_vinculado ? new Date() : undefined as any;
    orgao.pncp_status = config.pncp_vinculado ? 'VINCULADO' : 'PENDENTE';
    
    return await this.orgaoRepository.save(orgao);
  }

  async statusPNCP(id: string): Promise<{
    vinculado: boolean;
    codigoUnidade: string;
    dataVinculacao: Date | null;
    ultimoEnvio: Date | null;
    status: string;
  }> {
    const orgao = await this.findOne(id);
    
    return {
      vinculado: orgao.pncp_vinculado || false,
      codigoUnidade: orgao.pncp_codigo_unidade || '1',
      dataVinculacao: orgao.pncp_data_vinculacao || null,
      ultimoEnvio: orgao.pncp_ultimo_envio || null,
      status: orgao.pncp_status || 'PENDENTE'
    };
  }

  async atualizarUltimoEnvio(id: string): Promise<Orgao> {
    const orgao = await this.findOne(id);
    orgao.pncp_ultimo_envio = new Date();
    return await this.orgaoRepository.save(orgao);
  }

  // Buscar todos os órgãos (incluindo inativos) - para admin
  async findAllAdmin(): Promise<Orgao[]> {
    return await this.orgaoRepository.find({
      order: { nome: 'ASC' }
    });
  }

  // Reativar órgão
  async reactivate(id: string): Promise<Orgao> {
    const orgao = await this.findOne(id);
    orgao.ativo = true;
    return await this.orgaoRepository.save(orgao);
  }

  // ============ GESTÃO DE MÓDULOS ============

  /**
   * Retorna todos os módulos disponíveis no sistema
   */
  getModulosDisponiveis(): Array<{ codigo: ModuloSistema; nome: string; descricao: string }> {
    const { ModuloSistema: ModuloEnum, MODULOS_DESCRICAO } = require('./enums/modulos.enum');
    return Object.values(ModuloEnum).map(codigo => ({
      codigo: codigo as ModuloSistema,
      nome: MODULOS_DESCRICAO[codigo as ModuloSistema],
      descricao: MODULOS_DESCRICAO[codigo as ModuloSistema],
    }));
  }

  /**
   * Retorna os módulos habilitados de um órgão
   * Sempre retorna do banco de dados (fonte da verdade)
   */
  async getModulosOrgao(id: string): Promise<ModuloSistema[]> {
    const orgao = await this.findOne(id);
    
    // Retorna os módulos do banco de dados exatamente como estão salvos
    // Se não tiver módulos definidos (null ou array vazio), retorna array vazio
    if (!orgao.modulos_habilitados || orgao.modulos_habilitados.length === 0) {
      return [];
    }
    
    // Retorna os módulos exatamente como estão no banco
    return [...orgao.modulos_habilitados];
  }

  // ============ CONFIGURAÇÃO EMAIL (SMTP) ============

  async getEmailConfig(id: string): Promise<{
    email_smtp_host: string | null;
    email_smtp_port: number | null;
    email_smtp_secure: boolean | null;
    email_smtp_user: string | null;
    email_from: string | null;
    configurado: boolean;
    email_imap_host: string | null;
    email_imap_port: number | null;
    email_imap_user: string | null;
    imap_configurado: boolean;
  }> {
    const orgao = await this.findOne(id);
    return {
      email_smtp_host: orgao.email_smtp_host || null,
      email_smtp_port: orgao.email_smtp_port ?? null,
      email_smtp_secure: orgao.email_smtp_secure ?? null,
      email_smtp_user: orgao.email_smtp_user || null,
      email_from: orgao.email_from || null,
      configurado: !!(orgao.email_smtp_host && orgao.email_smtp_user),
      email_imap_host: orgao.email_imap_host || null,
      email_imap_port: orgao.email_imap_port ?? null,
      email_imap_user: orgao.email_imap_user || null,
      imap_configurado: !!(orgao.email_imap_host && orgao.email_imap_user),
    };
  }

  async atualizarEmailConfig(id: string, config: {
    email_smtp_host?: string;
    email_smtp_port?: number;
    email_smtp_secure?: boolean;
    email_smtp_user?: string;
    email_smtp_senha?: string;
    email_from?: string;
    email_imap_host?: string;
    email_imap_port?: number;
    email_imap_user?: string;
    email_imap_senha?: string;
  }): Promise<Orgao> {
    const orgao = await this.findOne(id);
    if (config.email_smtp_host !== undefined) orgao.email_smtp_host = config.email_smtp_host;
    if (config.email_smtp_port !== undefined) orgao.email_smtp_port = config.email_smtp_port;
    if (config.email_smtp_secure !== undefined) orgao.email_smtp_secure = config.email_smtp_secure;
    if (config.email_smtp_user !== undefined) orgao.email_smtp_user = config.email_smtp_user;
    if (config.email_from !== undefined) orgao.email_from = config.email_from;
    if (config.email_smtp_senha !== undefined && config.email_smtp_senha !== '') {
      orgao.email_smtp_senha = this.encryptText(config.email_smtp_senha);
    }
    if (config.email_imap_host !== undefined) orgao.email_imap_host = config.email_imap_host;
    if (config.email_imap_port !== undefined) orgao.email_imap_port = config.email_imap_port;
    if (config.email_imap_user !== undefined) orgao.email_imap_user = config.email_imap_user;
    if (config.email_imap_senha !== undefined && config.email_imap_senha !== '') {
      orgao.email_imap_senha = this.encryptText(config.email_imap_senha);
    }
    return await this.orgaoRepository.save(orgao);
  }

  async getWhatsAppConfig(id: string): Promise<{
    whatsapp_provider: string | null;
    whatsapp_instance_id: string | null;
    configurado: boolean;
  }> {
    const orgao = await this.findOne(id);
    return {
      whatsapp_provider: orgao.whatsapp_provider || null,
      whatsapp_instance_id: orgao.whatsapp_instance_id || null,
      configurado: !!(orgao.whatsapp_instance_id && orgao.whatsapp_token && orgao.whatsapp_client_token),
    };
  }

  async atualizarWhatsAppConfig(id: string, config: {
    whatsapp_provider?: string;
    whatsapp_instance_id?: string;
    whatsapp_token?: string;
    whatsapp_client_token?: string;
  }): Promise<Orgao> {
    const orgao = await this.findOne(id);
    if (config.whatsapp_provider !== undefined) orgao.whatsapp_provider = config.whatsapp_provider;
    if (config.whatsapp_instance_id !== undefined) orgao.whatsapp_instance_id = config.whatsapp_instance_id;
    if (config.whatsapp_token !== undefined && config.whatsapp_token !== '') {
      orgao.whatsapp_token = this.encryptText(config.whatsapp_token);
    }
    if (config.whatsapp_client_token !== undefined && config.whatsapp_client_token !== '') {
      orgao.whatsapp_client_token = this.encryptText(config.whatsapp_client_token);
    }
    return await this.orgaoRepository.save(orgao);
  }

  /**
   * Atualiza os módulos habilitados de um órgão
   * Permite que qualquer módulo seja habilitado/desabilitado, incluindo LICITACOES
   */
  async atualizarModulos(id: string, modulos: ModuloSistema[]): Promise<Orgao> {
    const orgao = await this.findOne(id);
    
    // Remove duplicatas e salva exatamente como enviado pelo frontend
    const modulosAtualizados = [...new Set(modulos)];
    
    // Debug: log antes de salvar
    console.log(`[OrgaosService] Salvando módulos para órgão ${id}:`, modulosAtualizados);
    
    // Se não houver módulos, salva array vazio ao invés de null
    orgao.modulos_habilitados = modulosAtualizados.length > 0 ? modulosAtualizados : [];
    
    const orgaoSalvo = await this.orgaoRepository.save(orgao);
    
    // Debug: log após salvar
    console.log(`[OrgaosService] Módulos salvos no banco:`, orgaoSalvo.modulos_habilitados);
    
    return orgaoSalvo;
  }

  /**
   * Atualiza a logo do órgão. O arquivo já foi salvo pelo Multer em uploads/logos/.
   */
  async uploadLogo(orgaoId: string, file: Express.Multer.File): Promise<Orgao> {
    const orgao = await this.findOne(orgaoId);

    // Remove logo anterior se existir
    if (orgao.logo_url) {
      const match = orgao.logo_url.match(/\/api\/uploads\/logos\/(.+)$/);
      if (match?.[1]) {
        try {
          this.uploadService.deleteFile('logos', match[1]);
        } catch (e) {
          this.logger.warn(`Erro ao remover logo anterior: ${(e as Error).message}`);
        }
      }
    }

    const logoUrl = this.uploadService.getFileUrl('logos', file.filename);
    orgao.logo_url = logoUrl;
    await this.orgaoRepository.save(orgao);

    this.logger.log(`Logo do órgão ${orgaoId} atualizada: ${logoUrl}`);
    return orgao;
  }
}
