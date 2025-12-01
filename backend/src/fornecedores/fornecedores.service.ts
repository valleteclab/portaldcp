import { Injectable, ConflictException, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Fornecedor, NivelCadastro, StatusCadastro, PorteEmpresa } from './entities/fornecedor.entity';
import { FornecedorDocumento, StatusDocumento } from './entities/fornecedor-documento.entity';
import { FornecedorSocio } from './entities/fornecedor-socio.entity';
import { FornecedorAtividade } from './entities/fornecedor-atividade.entity';
import { CreateFornecedorDto, UpdateFornecedorDto } from './dto/create-fornecedor.dto';
import { CnpjService, DadosCnpjFormatados } from './cnpj.service';

@Injectable()
export class FornecedoresService {
  constructor(
    @InjectRepository(Fornecedor)
    private readonly fornecedorRepository: Repository<Fornecedor>,
    @InjectRepository(FornecedorDocumento)
    private readonly documentoRepository: Repository<FornecedorDocumento>,
    @InjectRepository(FornecedorSocio)
    private readonly socioRepository: Repository<FornecedorSocio>,
    @InjectRepository(FornecedorAtividade)
    private readonly atividadeRepository: Repository<FornecedorAtividade>,
    private readonly cnpjService: CnpjService,
  ) {}

  // === CRUD BÁSICO ===
  async create(createDto: CreateFornecedorDto): Promise<Fornecedor> {
    // Verifica duplicidade por CPF/CNPJ
    const existing = await this.fornecedorRepository.findOne({
      where: { cpf_cnpj: createDto.cpf_cnpj },
    });
    if (existing) {
      throw new ConflictException('Já existe um fornecedor cadastrado com este CPF/CNPJ');
    }

    const fornecedor = this.fornecedorRepository.create({
      ...createDto,
      nivel_atual: NivelCadastro.NIVEL_I,
      nivel_i_completo: true, // Ao criar, nível I já está completo
      status: StatusCadastro.PENDENTE,
    });

    return await this.fornecedorRepository.save(fornecedor);
  }

  async findAll(): Promise<Fornecedor[]> {
    return await this.fornecedorRepository.find({
      where: { ativo: true },
      order: { razao_social: 'ASC' }
    });
  }

  async findOne(id: string): Promise<Fornecedor> {
    const fornecedor = await this.fornecedorRepository.findOneBy({ id });
    if (!fornecedor) {
      throw new NotFoundException(`Fornecedor com ID ${id} não encontrado`);
    }
    return fornecedor;
  }

  async findByCpfCnpj(cpf_cnpj: string): Promise<Fornecedor> {
    const fornecedor = await this.fornecedorRepository.findOneBy({ cpf_cnpj });
    if (!fornecedor) {
      throw new NotFoundException(`Fornecedor com CPF/CNPJ ${cpf_cnpj} não encontrado`);
    }
    return fornecedor;
  }

  async update(id: string, updateDto: UpdateFornecedorDto): Promise<Fornecedor> {
    const fornecedor = await this.findOne(id);
    Object.assign(fornecedor, updateDto);
    return await this.fornecedorRepository.save(fornecedor);
  }

  async delete(id: string): Promise<void> {
    const fornecedor = await this.findOne(id);
    // Deleta relacionamentos primeiro
    await this.socioRepository.delete({ fornecedor_id: id });
    await this.atividadeRepository.delete({ fornecedor_id: id });
    await this.documentoRepository.delete({ fornecedor_id: id });
    // Deleta o fornecedor
    await this.fornecedorRepository.remove(fornecedor);
  }

  // === REGISTRO INICIAL (Landing Page) ===
  async registroInicial(email: string, senha: string): Promise<Fornecedor> {
    // Verifica se já existe fornecedor com este email
    const existing = await this.fornecedorRepository.findOne({
      where: { email },
    });
    if (existing) {
      throw new ConflictException('Já existe um cadastro com este email');
    }

    // Cria fornecedor apenas com email e senha (dados mínimos)
    const fornecedor = this.fornecedorRepository.create({
      email,
      senha: this.hashSenha(senha),
      // Campos obrigatórios com valores temporários
      cpf_cnpj: `TEMP_${Date.now()}`,
      razao_social: 'Cadastro Pendente',
      logradouro: '',
      bairro: '',
      cidade: '',
      uf: '',
      cep: '',
      telefone: '',
      representante_nome: '',
      representante_cpf: '',
      nivel_atual: NivelCadastro.NIVEL_I,
      status: StatusCadastro.PENDENTE,
    });

    return await this.fornecedorRepository.save(fornecedor);
  }

  async findByEmail(email: string): Promise<Fornecedor | null> {
    const fornecedor = await this.fornecedorRepository.findOne({ 
      where: { email },
      relations: ['documentos', 'atividades', 'socios']
    });
    return fornecedor;
  }

  // === GESTÃO DE DOCUMENTOS ===
  async addDocumento(fornecedorId: string, documento: Partial<FornecedorDocumento>): Promise<FornecedorDocumento> {
    await this.findOne(fornecedorId); // Valida existência

    const doc = this.documentoRepository.create({
      ...documento,
      fornecedor_id: fornecedorId,
      status: StatusDocumento.PENDENTE,
    });

    return await this.documentoRepository.save(doc);
  }

  async getDocumentos(fornecedorId: string, nivel?: NivelCadastro): Promise<FornecedorDocumento[]> {
    const where: any = { fornecedor_id: fornecedorId };
    if (nivel) where.nivel = nivel;

    return await this.documentoRepository.find({
      where,
      order: { created_at: 'DESC' }
    });
  }

  async analisarDocumento(
    documentoId: string, 
    aprovado: boolean, 
    observacao: string, 
    analisadoPor: string
  ): Promise<FornecedorDocumento> {
    const doc = await this.documentoRepository.findOneBy({ id: documentoId });
    if (!doc) throw new NotFoundException('Documento não encontrado');

    doc.status = aprovado ? StatusDocumento.APROVADO : StatusDocumento.REJEITADO;
    doc.observacao_analise = observacao;
    doc.analisado_por = analisadoPor;
    doc.data_analise = new Date();

    await this.documentoRepository.save(doc);

    // Verifica se todos os documentos do nível estão aprovados
    await this.verificarConclusaoNivel(doc.fornecedor_id, doc.nivel);

    return doc;
  }

  // === PROGRESSÃO DE NÍVEIS ===
  async verificarConclusaoNivel(fornecedorId: string, nivel: NivelCadastro): Promise<void> {
    const docs = await this.documentoRepository.find({
      where: { fornecedor_id: fornecedorId, nivel }
    });

    // Se não tem documentos, não pode concluir
    if (docs.length === 0) return;

    // Verifica se todos estão aprovados
    const todosAprovados = docs.every(d => d.status === StatusDocumento.APROVADO);
    if (!todosAprovados) return;

    const fornecedor = await this.findOne(fornecedorId);

    // Marca o nível como completo
    switch (nivel) {
      case NivelCadastro.NIVEL_II:
        fornecedor.nivel_ii_completo = true;
        break;
      case NivelCadastro.NIVEL_III:
        fornecedor.nivel_iii_completo = true;
        break;
      case NivelCadastro.NIVEL_IV:
        fornecedor.nivel_iv_completo = true;
        break;
      case NivelCadastro.NIVEL_V:
        fornecedor.nivel_v_completo = true;
        break;
      case NivelCadastro.NIVEL_VI:
        fornecedor.nivel_vi_completo = true;
        break;
    }

    // Atualiza o nível atual para o próximo disponível
    fornecedor.nivel_atual = this.calcularNivelAtual(fornecedor);

    // Se todos os níveis estão completos, aprova o cadastro
    if (this.todosNiveisCompletos(fornecedor)) {
      fornecedor.status = StatusCadastro.APROVADO;
      // Validade de 1 ano
      fornecedor.data_validade_cadastro = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    }

    await this.fornecedorRepository.save(fornecedor);
  }

  private calcularNivelAtual(fornecedor: Fornecedor): NivelCadastro {
    if (!fornecedor.nivel_i_completo) return NivelCadastro.NIVEL_I;
    if (!fornecedor.nivel_ii_completo) return NivelCadastro.NIVEL_II;
    if (!fornecedor.nivel_iii_completo) return NivelCadastro.NIVEL_III;
    if (!fornecedor.nivel_iv_completo) return NivelCadastro.NIVEL_IV;
    if (!fornecedor.nivel_v_completo) return NivelCadastro.NIVEL_V;
    if (!fornecedor.nivel_vi_completo) return NivelCadastro.NIVEL_VI;
    return NivelCadastro.NIVEL_VI; // Todos completos
  }

  private todosNiveisCompletos(fornecedor: Fornecedor): boolean {
    return fornecedor.nivel_i_completo &&
           fornecedor.nivel_ii_completo &&
           fornecedor.nivel_iii_completo &&
           fornecedor.nivel_iv_completo &&
           fornecedor.nivel_v_completo &&
           fornecedor.nivel_vi_completo;
  }

  // === STATUS E VALIDAÇÃO ===
  async suspender(id: string, motivo: string): Promise<Fornecedor> {
    const fornecedor = await this.findOne(id);
    fornecedor.status = StatusCadastro.SUSPENSO;
    fornecedor.observacoes = motivo;
    return await this.fornecedorRepository.save(fornecedor);
  }

  async reativar(id: string): Promise<Fornecedor> {
    const fornecedor = await this.findOne(id);
    fornecedor.status = StatusCadastro.APROVADO;
    return await this.fornecedorRepository.save(fornecedor);
  }

  async verificarHabilitacao(id: string): Promise<{ habilitado: boolean; pendencias: string[] }> {
    const fornecedor = await this.findOne(id);
    const pendencias: string[] = [];

    if (fornecedor.status !== StatusCadastro.APROVADO) {
      pendencias.push(`Status do cadastro: ${fornecedor.status}`);
    }

    if (fornecedor.data_validade_cadastro && new Date() > fornecedor.data_validade_cadastro) {
      pendencias.push('Cadastro vencido');
    }

    // Verifica documentos vencidos
    const docsVencidos = await this.documentoRepository.find({
      where: { 
        fornecedor_id: id, 
        status: StatusDocumento.VENCIDO 
      }
    });

    if (docsVencidos.length > 0) {
      pendencias.push(`${docsVencidos.length} documento(s) vencido(s)`);
    }

    return {
      habilitado: pendencias.length === 0,
      pendencias
    };
  }

  // === CONSULTA CNPJ ===
  
  /**
   * Consulta dados do CNPJ na API externa
   */
  async consultarCnpj(cnpj: string): Promise<DadosCnpjFormatados> {
    return await this.cnpjService.consultarCnpj(cnpj);
  }

  /**
   * Verifica se CNPJ já está cadastrado
   */
  async verificarCnpjExistente(cnpj: string): Promise<{ existe: boolean; fornecedor?: Fornecedor }> {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    const fornecedor = await this.fornecedorRepository.findOne({
      where: { cpf_cnpj: cnpjLimpo },
    });
    
    return {
      existe: !!fornecedor,
      fornecedor: fornecedor || undefined,
    };
  }

  /**
   * Cria fornecedor a partir dos dados da API CNPJ
   */
  async createFromCnpj(
    dadosCnpj: DadosCnpjFormatados,
    dadosAdicionais: {
      representante_nome: string;
      representante_cpf: string;
      representante_cargo?: string;
      representante_email?: string;
      representante_telefone?: string;
      inscricao_estadual?: string;
      inscricao_municipal?: string;
    }
  ): Promise<Fornecedor> {
    const cnpjLimpo = dadosCnpj.cnpj.replace(/\D/g, '');
    
    // Verifica duplicidade
    const existing = await this.fornecedorRepository.findOne({
      where: { cpf_cnpj: cnpjLimpo },
    });
    if (existing) {
      throw new ConflictException('Já existe um fornecedor cadastrado com este CNPJ');
    }

    // Mapeia o porte
    const porteMap: Record<string, PorteEmpresa> = {
      'MEI': PorteEmpresa.MEI,
      'ME': PorteEmpresa.ME,
      'EPP': PorteEmpresa.EPP,
      'MEDIO': PorteEmpresa.MEDIO,
      'GRANDE': PorteEmpresa.GRANDE,
    };

    // Cria o fornecedor usando objeto parcial
    const fornecedorData: Partial<Fornecedor> = {
      cpf_cnpj: cnpjLimpo,
      razao_social: dadosCnpj.razao_social,
      nome_fantasia: dadosCnpj.nome_fantasia || undefined,
      porte: porteMap[dadosCnpj.porte] || undefined,
      
      // Endereço
      tipo_logradouro: dadosCnpj.endereco.tipo_logradouro,
      logradouro: `${dadosCnpj.endereco.tipo_logradouro} ${dadosCnpj.endereco.logradouro}`,
      numero: dadosCnpj.endereco.numero,
      complemento: dadosCnpj.endereco.complemento || undefined,
      bairro: dadosCnpj.endereco.bairro,
      cidade: dadosCnpj.endereco.cidade,
      uf: dadosCnpj.endereco.uf,
      cep: dadosCnpj.endereco.cep,
      
      // Contato
      telefone: dadosCnpj.telefone || '',
      telefone_secundario: dadosCnpj.telefone_secundario || undefined,
      email: dadosCnpj.email || '',
      
      // Representante Legal
      representante_nome: dadosAdicionais.representante_nome,
      representante_cpf: dadosAdicionais.representante_cpf,
      representante_cargo: dadosAdicionais.representante_cargo || undefined,
      representante_email: dadosAdicionais.representante_email || undefined,
      representante_telefone: dadosAdicionais.representante_telefone || undefined,
      
      // Inscrições
      inscricao_estadual: dadosAdicionais.inscricao_estadual || undefined,
      inscricao_municipal: dadosAdicionais.inscricao_municipal || undefined,
      
      // Dados da API
      natureza_juridica: dadosCnpj.natureza_juridica,
      capital_social: dadosCnpj.capital_social,
      data_inicio_atividade: dadosCnpj.data_inicio_atividade ? new Date(dadosCnpj.data_inicio_atividade) : undefined,
      tipo_estabelecimento: dadosCnpj.tipo_estabelecimento,
      
      // Situação cadastral
      situacao_cadastral: dadosCnpj.situacao.nome,
      data_situacao_cadastral: dadosCnpj.situacao.data ? new Date(dadosCnpj.situacao.data) : undefined,
      motivo_situacao_cadastral: dadosCnpj.situacao.motivo,
      
      // Simples Nacional
      optante_simples: dadosCnpj.simples.optante,
      data_opcao_simples: dadosCnpj.simples.data_opcao ? new Date(dadosCnpj.simples.data_opcao) : undefined,
      data_exclusao_simples: dadosCnpj.simples.data_exclusao ? new Date(dadosCnpj.simples.data_exclusao) : undefined,
      
      // MEI
      optante_mei: dadosCnpj.mei.optante,
      data_opcao_mei: dadosCnpj.mei.data_opcao ? new Date(dadosCnpj.mei.data_opcao) : undefined,
      data_exclusao_mei: dadosCnpj.mei.data_exclusao ? new Date(dadosCnpj.mei.data_exclusao) : undefined,
      
      // CNAEs (códigos)
      cnaes: [
        dadosCnpj.atividade_principal.codigo,
        ...dadosCnpj.atividades_secundarias.map(a => a.codigo)
      ],
      
      // Controle
      data_consulta_cnpj: new Date(),
      nivel_atual: NivelCadastro.NIVEL_I,
      nivel_i_completo: true,
      status: StatusCadastro.PENDENTE,
    };

    const fornecedor = this.fornecedorRepository.create(fornecedorData);
    const fornecedorSalvo = await this.fornecedorRepository.save(fornecedor);

    // Salva os sócios
    if (dadosCnpj.socios && dadosCnpj.socios.length > 0) {
      for (const socio of dadosCnpj.socios) {
        const novoSocio = this.socioRepository.create({
          fornecedor_id: fornecedorSalvo.id,
          nome: socio.nome,
          cpf_cnpj: socio.cpf_cnpj,
          data_entrada: socio.data_entrada ? new Date(socio.data_entrada) : undefined,
          qualificacao: socio.qualificacao,
        });
        await this.socioRepository.save(novoSocio);
      }
    }

    // Salva as atividades
    // Atividade principal
    const atividadePrincipal = this.atividadeRepository.create({
      fornecedor_id: fornecedorSalvo.id,
      codigo: dadosCnpj.atividade_principal.codigo,
      descricao: dadosCnpj.atividade_principal.descricao,
      principal: true,
    });
    await this.atividadeRepository.save(atividadePrincipal);
    
    // Atividades secundárias
    for (const ativ of dadosCnpj.atividades_secundarias) {
      const atividadeSecundaria = this.atividadeRepository.create({
        fornecedor_id: fornecedorSalvo.id,
        codigo: ativ.codigo,
        descricao: ativ.descricao,
        principal: false,
      });
      await this.atividadeRepository.save(atividadeSecundaria);
    }

    // Retorna o fornecedor com relacionamentos
    return await this.findOneCompleto(fornecedorSalvo.id);
  }

  /**
   * Busca fornecedor com todos os relacionamentos
   */
  async findOneCompleto(id: string): Promise<Fornecedor> {
    const fornecedor = await this.fornecedorRepository.findOne({
      where: { id },
      relations: ['socios', 'atividades'],
    });
    if (!fornecedor) {
      throw new NotFoundException(`Fornecedor com ID ${id} não encontrado`);
    }
    return fornecedor;
  }

  /**
   * Atualiza dados do fornecedor consultando novamente a API
   */
  async atualizarDadosCnpj(id: string): Promise<Fornecedor> {
    const fornecedor = await this.findOne(id);
    const dadosCnpj = await this.cnpjService.consultarCnpj(fornecedor.cpf_cnpj);

    // Atualiza dados básicos
    fornecedor.razao_social = dadosCnpj.razao_social;
    if (dadosCnpj.nome_fantasia) {
      fornecedor.nome_fantasia = dadosCnpj.nome_fantasia;
    }
    fornecedor.natureza_juridica = dadosCnpj.natureza_juridica;
    fornecedor.capital_social = dadosCnpj.capital_social;
    fornecedor.situacao_cadastral = dadosCnpj.situacao.nome;
    if (dadosCnpj.situacao.data) {
      fornecedor.data_situacao_cadastral = new Date(dadosCnpj.situacao.data);
    }
    fornecedor.motivo_situacao_cadastral = dadosCnpj.situacao.motivo;
    fornecedor.optante_simples = dadosCnpj.simples.optante;
    fornecedor.optante_mei = dadosCnpj.mei.optante;
    fornecedor.data_consulta_cnpj = new Date();

    await this.fornecedorRepository.save(fornecedor);

    // Atualiza sócios (remove antigos e adiciona novos)
    await this.socioRepository.delete({ fornecedor_id: id });
    if (dadosCnpj.socios && dadosCnpj.socios.length > 0) {
      for (const socio of dadosCnpj.socios) {
        const novoSocio = this.socioRepository.create({
          fornecedor_id: id,
          nome: socio.nome,
          cpf_cnpj: socio.cpf_cnpj,
          data_entrada: socio.data_entrada ? new Date(socio.data_entrada) : undefined,
          qualificacao: socio.qualificacao,
        });
        await this.socioRepository.save(novoSocio);
      }
    }

    return await this.findOneCompleto(id);
  }

  // === AUTENTICAÇÃO ===
  private hashSenha(senha: string): string {
    return crypto.createHash('sha256').update(senha).digest('hex');
  }

  async definirSenha(id: string, senha: string): Promise<void> {
    const fornecedor = await this.findOne(id);
    fornecedor.senha = this.hashSenha(senha);
    await this.fornecedorRepository.save(fornecedor);
  }

  async login(cnpj: string, senha: string): Promise<{ fornecedor: Fornecedor; token: string }> {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    const fornecedor = await this.fornecedorRepository.findOne({
      where: { cpf_cnpj: cnpjLimpo },
    });

    if (!fornecedor) {
      throw new UnauthorizedException('CNPJ ou senha inválidos');
    }

    if (!fornecedor.senha) {
      throw new UnauthorizedException('Fornecedor não possui senha cadastrada');
    }

    const senhaHash = this.hashSenha(senha);
    if (fornecedor.senha !== senhaHash) {
      throw new UnauthorizedException('CNPJ ou senha inválidos');
    }

    // Token simples (em produção usar JWT)
    const token = Buffer.from(`${fornecedor.id}:${Date.now()}`).toString('base64');

    // Remove a senha do retorno
    const { senha: _, ...fornecedorSemSenha } = fornecedor;

    return {
      fornecedor: fornecedorSemSenha as Fornecedor,
      token,
    };
  }

  /**
   * Completa o credenciamento de um fornecedor existente (que fez registro inicial por email)
   */
  async completarCredenciamento(
    email: string,
    dadosCnpj: DadosCnpjFormatados,
    dadosAdicionais: {
      representante_nome: string;
      representante_cpf: string;
      representante_cargo?: string;
      representante_email?: string;
      representante_telefone?: string;
      inscricao_estadual?: string;
      inscricao_municipal?: string;
    }
  ): Promise<Fornecedor> {
    // Busca o fornecedor pelo email
    const fornecedor = await this.fornecedorRepository.findOne({
      where: { email },
    });

    if (!fornecedor) {
      throw new NotFoundException('Fornecedor não encontrado');
    }

    const cnpjLimpo = dadosCnpj.cnpj.replace(/\D/g, '');

    // Verifica se o CNPJ já está em uso por outro fornecedor
    const cnpjExistente = await this.fornecedorRepository.findOne({
      where: { cpf_cnpj: cnpjLimpo },
    });
    if (cnpjExistente && cnpjExistente.id !== fornecedor.id) {
      throw new ConflictException('Este CNPJ já está cadastrado para outro fornecedor');
    }

    // Mapeia o porte
    const porteMap: Record<string, PorteEmpresa> = {
      'MEI': PorteEmpresa.MEI,
      'ME': PorteEmpresa.ME,
      'EPP': PorteEmpresa.EPP,
      'MEDIO': PorteEmpresa.MEDIO,
      'GRANDE': PorteEmpresa.GRANDE,
    };

    // Atualiza os dados do fornecedor
    fornecedor.cpf_cnpj = cnpjLimpo;
    fornecedor.razao_social = dadosCnpj.razao_social;
    if (dadosCnpj.nome_fantasia) fornecedor.nome_fantasia = dadosCnpj.nome_fantasia;
    if (porteMap[dadosCnpj.porte]) fornecedor.porte = porteMap[dadosCnpj.porte];
    
    // Endereço
    if (dadosCnpj.endereco.tipo_logradouro) fornecedor.tipo_logradouro = dadosCnpj.endereco.tipo_logradouro;
    fornecedor.logradouro = `${dadosCnpj.endereco.tipo_logradouro || ''} ${dadosCnpj.endereco.logradouro}`.trim();
    if (dadosCnpj.endereco.numero) fornecedor.numero = dadosCnpj.endereco.numero;
    if (dadosCnpj.endereco.complemento) fornecedor.complemento = dadosCnpj.endereco.complemento;
    fornecedor.bairro = dadosCnpj.endereco.bairro;
    fornecedor.cidade = dadosCnpj.endereco.cidade;
    fornecedor.uf = dadosCnpj.endereco.uf;
    fornecedor.cep = dadosCnpj.endereco.cep;
    
    // Contato
    fornecedor.telefone = dadosCnpj.telefone || '';
    if (dadosCnpj.telefone_secundario) fornecedor.telefone_secundario = dadosCnpj.telefone_secundario;
    
    // Representante Legal
    fornecedor.representante_nome = dadosAdicionais.representante_nome;
    fornecedor.representante_cpf = dadosAdicionais.representante_cpf;
    if (dadosAdicionais.representante_cargo) fornecedor.representante_cargo = dadosAdicionais.representante_cargo;
    if (dadosAdicionais.representante_email) fornecedor.representante_email = dadosAdicionais.representante_email;
    if (dadosAdicionais.representante_telefone) fornecedor.representante_telefone = dadosAdicionais.representante_telefone;
    
    // Inscrições
    if (dadosAdicionais.inscricao_estadual) fornecedor.inscricao_estadual = dadosAdicionais.inscricao_estadual;
    if (dadosAdicionais.inscricao_municipal) fornecedor.inscricao_municipal = dadosAdicionais.inscricao_municipal;
    
    // Dados da API
    fornecedor.natureza_juridica = dadosCnpj.natureza_juridica;
    fornecedor.capital_social = dadosCnpj.capital_social;
    if (dadosCnpj.data_inicio_atividade) fornecedor.data_inicio_atividade = new Date(dadosCnpj.data_inicio_atividade);
    fornecedor.tipo_estabelecimento = dadosCnpj.tipo_estabelecimento;
    
    // Situação cadastral
    fornecedor.situacao_cadastral = dadosCnpj.situacao.nome;
    if (dadosCnpj.situacao.data) fornecedor.data_situacao_cadastral = new Date(dadosCnpj.situacao.data);
    fornecedor.motivo_situacao_cadastral = dadosCnpj.situacao.motivo;
    
    // Simples Nacional
    fornecedor.optante_simples = dadosCnpj.simples.optante;
    if (dadosCnpj.simples.data_opcao) fornecedor.data_opcao_simples = new Date(dadosCnpj.simples.data_opcao);
    if (dadosCnpj.simples.data_exclusao) fornecedor.data_exclusao_simples = new Date(dadosCnpj.simples.data_exclusao);
    
    // MEI
    fornecedor.optante_mei = dadosCnpj.mei.optante;
    if (dadosCnpj.mei.data_opcao) fornecedor.data_opcao_mei = new Date(dadosCnpj.mei.data_opcao);
    if (dadosCnpj.mei.data_exclusao) fornecedor.data_exclusao_mei = new Date(dadosCnpj.mei.data_exclusao);
    
    // CNAEs
    fornecedor.cnaes = [
      dadosCnpj.atividade_principal.codigo,
      ...dadosCnpj.atividades_secundarias.map(a => a.codigo)
    ];
    
    // Controle
    fornecedor.data_consulta_cnpj = new Date();
    fornecedor.nivel_atual = NivelCadastro.NIVEL_I;
    fornecedor.nivel_i_completo = true;

    await this.fornecedorRepository.save(fornecedor);

    // Remove sócios antigos e adiciona novos
    await this.socioRepository.delete({ fornecedor_id: fornecedor.id });
    if (dadosCnpj.socios && dadosCnpj.socios.length > 0) {
      for (const socio of dadosCnpj.socios) {
        const novoSocio = this.socioRepository.create({
          fornecedor_id: fornecedor.id,
          nome: socio.nome,
          cpf_cnpj: socio.cpf_cnpj,
          data_entrada: socio.data_entrada ? new Date(socio.data_entrada) : undefined,
          qualificacao: socio.qualificacao,
        });
        await this.socioRepository.save(novoSocio);
      }
    }

    // Remove atividades antigas e adiciona novas
    await this.atividadeRepository.delete({ fornecedor_id: fornecedor.id });
    
    // Atividade principal
    const atividadePrincipal = this.atividadeRepository.create({
      fornecedor_id: fornecedor.id,
      codigo: dadosCnpj.atividade_principal.codigo,
      descricao: dadosCnpj.atividade_principal.descricao,
      principal: true,
    });
    await this.atividadeRepository.save(atividadePrincipal);
    
    // Atividades secundárias
    for (const ativ of dadosCnpj.atividades_secundarias) {
      const atividadeSecundaria = this.atividadeRepository.create({
        fornecedor_id: fornecedor.id,
        codigo: ativ.codigo,
        descricao: ativ.descricao,
        principal: false,
      });
      await this.atividadeRepository.save(atividadeSecundaria);
    }

    return await this.findOneCompleto(fornecedor.id);
  }

  /**
   * Salva dados da Habilitação Jurídica (Nível II)
   */
  async salvarHabilitacaoJuridica(
    fornecedorId: string,
    dados: {
      contratoSocial?: { filename: string; originalname: string; url: string };
      documentoRepresentante?: { filename: string; originalname: string; url: string };
      procuracaoArquivo?: { filename: string; originalname: string; url: string };
      documentoProcurador?: { filename: string; originalname: string; url: string };
    }
  ): Promise<Fornecedor> {
    console.log('=== salvarHabilitacaoJuridica ===');
    console.log('fornecedorId:', fornecedorId);
    console.log('dados recebidos:', JSON.stringify(dados, null, 2));
    
    const fornecedor = await this.findOne(fornecedorId);

    // Remove documentos antigos do nível II
    await this.documentoRepository.delete({ 
      fornecedor_id: fornecedorId, 
      nivel: NivelCadastro.NIVEL_II 
    });

    // Salva Contrato Social
    if (dados.contratoSocial?.filename) {
      const doc = this.documentoRepository.create({
        fornecedor_id: fornecedorId,
        nivel: NivelCadastro.NIVEL_II,
        tipo: 'CONTRATO_SOCIAL' as any,
        nome_arquivo: dados.contratoSocial.originalname,
        caminho_arquivo: dados.contratoSocial.url,
        status: 'PENDENTE' as any,
      });
      await this.documentoRepository.save(doc);
    }

    // Salva Documento do Representante
    if (dados.documentoRepresentante?.filename) {
      const doc = this.documentoRepository.create({
        fornecedor_id: fornecedorId,
        nivel: NivelCadastro.NIVEL_II,
        tipo: 'DOCUMENTO_IDENTIDADE_REPRESENTANTE' as any,
        nome_arquivo: dados.documentoRepresentante.originalname,
        caminho_arquivo: dados.documentoRepresentante.url,
        status: 'PENDENTE' as any,
      });
      await this.documentoRepository.save(doc);
    }

    // Salva Procuração
    if (dados.procuracaoArquivo?.filename) {
      const doc = this.documentoRepository.create({
        fornecedor_id: fornecedorId,
        nivel: NivelCadastro.NIVEL_II,
        tipo: 'PROCURACAO' as any,
        nome_arquivo: dados.procuracaoArquivo.originalname,
        caminho_arquivo: dados.procuracaoArquivo.url,
        status: 'PENDENTE' as any,
      });
      await this.documentoRepository.save(doc);
    }

    // Salva Documento do Procurador
    if (dados.documentoProcurador?.filename) {
      const doc = this.documentoRepository.create({
        fornecedor_id: fornecedorId,
        nivel: NivelCadastro.NIVEL_II,
        tipo: 'DOCUMENTO_IDENTIDADE_PROCURADOR' as any,
        nome_arquivo: dados.documentoProcurador.originalname,
        caminho_arquivo: dados.documentoProcurador.url,
        status: 'PENDENTE' as any,
      });
      await this.documentoRepository.save(doc);
    }

    fornecedor.nivel_ii_completo = true;
    await this.fornecedorRepository.save(fornecedor);
    return fornecedor;
  }

  /**
   * Salva dados da Regularidade Fiscal Federal (Nível III)
   */
  async salvarFiscalFederal(
    fornecedorId: string,
    dados: {
      receitaFederal: { tipoComprovante: string; codigoControle: string; dataValidade: string; arquivoInfo?: { filename: string; originalname: string; url: string } };
      fgts: { tipoComprovante: string; codigoControle: string; dataValidade: string; arquivoInfo?: { filename: string; originalname: string; url: string } };
      tst: { tipoComprovante: string; codigoControle: string; dataValidade: string; arquivoInfo?: { filename: string; originalname: string; url: string } };
    }
  ): Promise<Fornecedor> {
    const fornecedor = await this.findOne(fornecedorId);

    // Remove documentos antigos do nível III
    await this.documentoRepository.delete({ 
      fornecedor_id: fornecedorId, 
      nivel: NivelCadastro.NIVEL_III 
    });

    // Salva Receita Federal
    if (dados.receitaFederal.codigoControle || dados.receitaFederal.arquivoInfo) {
      const doc = this.documentoRepository.create({
        fornecedor_id: fornecedorId,
        nivel: NivelCadastro.NIVEL_III,
        tipo: 'CND_RECEITA_FEDERAL_PGFN' as any,
        tipo_comprovante: dados.receitaFederal.tipoComprovante as any,
        codigo_controle: dados.receitaFederal.codigoControle,
        data_validade: dados.receitaFederal.dataValidade ? new Date(dados.receitaFederal.dataValidade) : undefined,
        nome_arquivo: dados.receitaFederal.arquivoInfo?.originalname,
        caminho_arquivo: dados.receitaFederal.arquivoInfo?.url,
        status: 'PENDENTE' as any,
      });
      await this.documentoRepository.save(doc);
    }

    // Salva FGTS
    if (dados.fgts.codigoControle || dados.fgts.arquivoInfo) {
      const doc = this.documentoRepository.create({
        fornecedor_id: fornecedorId,
        nivel: NivelCadastro.NIVEL_III,
        tipo: 'CRF_FGTS' as any,
        tipo_comprovante: dados.fgts.tipoComprovante as any,
        codigo_controle: dados.fgts.codigoControle,
        data_validade: dados.fgts.dataValidade ? new Date(dados.fgts.dataValidade) : undefined,
        nome_arquivo: dados.fgts.arquivoInfo?.originalname,
        caminho_arquivo: dados.fgts.arquivoInfo?.url,
        status: 'PENDENTE' as any,
      });
      await this.documentoRepository.save(doc);
    }

    // Salva TST
    if (dados.tst.codigoControle || dados.tst.arquivoInfo) {
      const doc = this.documentoRepository.create({
        fornecedor_id: fornecedorId,
        nivel: NivelCadastro.NIVEL_III,
        tipo: 'CNDT_TST' as any,
        tipo_comprovante: dados.tst.tipoComprovante as any,
        codigo_controle: dados.tst.codigoControle,
        data_validade: dados.tst.dataValidade ? new Date(dados.tst.dataValidade) : undefined,
        nome_arquivo: dados.tst.arquivoInfo?.originalname,
        caminho_arquivo: dados.tst.arquivoInfo?.url,
        status: 'PENDENTE' as any,
      });
      await this.documentoRepository.save(doc);
    }

    fornecedor.nivel_iii_completo = true;
    await this.fornecedorRepository.save(fornecedor);
    return fornecedor;
  }

  /**
   * Salva dados da Regularidade Fiscal Estadual/Municipal (Nível IV)
   */
  async salvarFiscalEstadual(
    fornecedorId: string,
    dados: {
      inscricaoEstadual?: string;
      inscricaoMunicipal?: string;
      inscricaoEstadualArquivoInfo?: { filename: string; originalname: string; url: string };
      inscricaoMunicipalArquivoInfo?: { filename: string; originalname: string; url: string };
      certidaoEstadual?: { tipoComprovante: string; codigoControle: string; dataValidade: string; arquivoInfo?: { filename: string; originalname: string; url: string } };
      certidaoMunicipal?: { tipoComprovante: string; codigoControle: string; dataValidade: string; arquivoInfo?: { filename: string; originalname: string; url: string } };
    }
  ): Promise<Fornecedor> {
    const fornecedor = await this.findOne(fornecedorId);

    // Atualiza inscrições
    if (dados.inscricaoEstadual) fornecedor.inscricao_estadual = dados.inscricaoEstadual;
    if (dados.inscricaoMunicipal) fornecedor.inscricao_municipal = dados.inscricaoMunicipal;

    // Remove documentos antigos do nível IV
    await this.documentoRepository.delete({ 
      fornecedor_id: fornecedorId, 
      nivel: NivelCadastro.NIVEL_IV 
    });

    // Salva arquivo da Inscrição Estadual
    if (dados.inscricaoEstadualArquivoInfo?.filename) {
      const doc = this.documentoRepository.create({
        fornecedor_id: fornecedorId,
        nivel: NivelCadastro.NIVEL_IV,
        tipo: 'INSCRICAO_ESTADUAL_ARQUIVO' as any,
        nome_arquivo: dados.inscricaoEstadualArquivoInfo.originalname,
        caminho_arquivo: dados.inscricaoEstadualArquivoInfo.url,
        status: 'PENDENTE' as any,
      });
      await this.documentoRepository.save(doc);
    }

    // Salva arquivo da Inscrição Municipal
    if (dados.inscricaoMunicipalArquivoInfo?.filename) {
      const doc = this.documentoRepository.create({
        fornecedor_id: fornecedorId,
        nivel: NivelCadastro.NIVEL_IV,
        tipo: 'INSCRICAO_MUNICIPAL_ARQUIVO' as any,
        nome_arquivo: dados.inscricaoMunicipalArquivoInfo.originalname,
        caminho_arquivo: dados.inscricaoMunicipalArquivoInfo.url,
        status: 'PENDENTE' as any,
      });
      await this.documentoRepository.save(doc);
    }

    // Salva Certidão Estadual
    if (dados.certidaoEstadual?.codigoControle || dados.certidaoEstadual?.arquivoInfo) {
      const doc = this.documentoRepository.create({
        fornecedor_id: fornecedorId,
        nivel: NivelCadastro.NIVEL_IV,
        tipo: 'CND_ESTADUAL' as any,
        tipo_comprovante: dados.certidaoEstadual.tipoComprovante as any,
        codigo_controle: dados.certidaoEstadual.codigoControle,
        data_validade: dados.certidaoEstadual.dataValidade ? new Date(dados.certidaoEstadual.dataValidade) : undefined,
        nome_arquivo: dados.certidaoEstadual.arquivoInfo?.originalname,
        caminho_arquivo: dados.certidaoEstadual.arquivoInfo?.url,
        status: 'PENDENTE' as any,
      });
      await this.documentoRepository.save(doc);
    }

    // Salva Certidão Municipal
    if (dados.certidaoMunicipal?.codigoControle || dados.certidaoMunicipal?.arquivoInfo) {
      const doc = this.documentoRepository.create({
        fornecedor_id: fornecedorId,
        nivel: NivelCadastro.NIVEL_IV,
        tipo: 'CND_MUNICIPAL' as any,
        tipo_comprovante: dados.certidaoMunicipal.tipoComprovante as any,
        codigo_controle: dados.certidaoMunicipal.codigoControle,
        data_validade: dados.certidaoMunicipal.dataValidade ? new Date(dados.certidaoMunicipal.dataValidade) : undefined,
        nome_arquivo: dados.certidaoMunicipal.arquivoInfo?.originalname,
        caminho_arquivo: dados.certidaoMunicipal.arquivoInfo?.url,
        status: 'PENDENTE' as any,
      });
      await this.documentoRepository.save(doc);
    }

    fornecedor.nivel_iv_completo = true;
    await this.fornecedorRepository.save(fornecedor);
    return fornecedor;
  }

  /**
   * Salva dados da Qualificação Técnica (Nível V)
   */
  async salvarQualificacaoTecnica(
    fornecedorId: string,
    atestados: Array<{
      emissor: string;
      data: string;
      descricao: string;
      arquivoInfo?: { filename: string; originalname: string; url: string };
    }>
  ): Promise<Fornecedor> {
    const fornecedor = await this.findOne(fornecedorId);

    // Remove atestados antigos
    await this.documentoRepository.delete({ 
      fornecedor_id: fornecedorId, 
      nivel: NivelCadastro.NIVEL_V,
      tipo: 'ATESTADO_CAPACIDADE_TECNICA' as any,
    });

    // Salva novos atestados
    for (const atestado of atestados) {
      if (atestado.emissor || atestado.arquivoInfo) {
        const doc = this.documentoRepository.create({
          fornecedor_id: fornecedorId,
          nivel: NivelCadastro.NIVEL_V,
          tipo: 'ATESTADO_CAPACIDADE_TECNICA' as any,
          atestado_emissor: atestado.emissor,
          atestado_data: atestado.data ? new Date(atestado.data) : undefined,
          atestado_descricao: atestado.descricao,
          nome_arquivo: atestado.arquivoInfo?.originalname,
          caminho_arquivo: atestado.arquivoInfo?.url,
          status: 'PENDENTE' as any,
        });
        await this.documentoRepository.save(doc);
      }
    }

    fornecedor.nivel_v_completo = true;
    await this.fornecedorRepository.save(fornecedor);
    return fornecedor;
  }

  /**
   * Salva dados da Qualificação Econômica (Nível VI)
   */
  async salvarQualificacaoEconomica(
    fornecedorId: string,
    balancos: Array<{
      ano: string;
      tipo: string;
      exercicioFinanceiro: string;
      demonstracaoContabil?: string;
      arquivoInfo?: { filename: string; originalname: string; url: string };
    }>
  ): Promise<Fornecedor> {
    const fornecedor = await this.findOne(fornecedorId);

    // Remove balanços antigos
    await this.documentoRepository.delete({ 
      fornecedor_id: fornecedorId, 
      nivel: NivelCadastro.NIVEL_VI,
      tipo: 'BALANCO_PATRIMONIAL' as any,
    });

    // Salva novos balanços
    for (const balanco of balancos) {
      const doc = this.documentoRepository.create({
        fornecedor_id: fornecedorId,
        nivel: NivelCadastro.NIVEL_VI,
        tipo: 'BALANCO_PATRIMONIAL' as any,
        balanco_tipo: balanco.tipo,
        balanco_exercicio: balanco.exercicioFinanceiro,
        balanco_demonstracao_contabil: balanco.demonstracaoContabil || balanco.ano,
        nome_arquivo: balanco.arquivoInfo?.originalname,
        caminho_arquivo: balanco.arquivoInfo?.url,
        status: 'PENDENTE' as any,
      });
      await this.documentoRepository.save(doc);
    }

    fornecedor.nivel_vi_completo = true;
    await this.fornecedorRepository.save(fornecedor);
    return fornecedor;
  }

  /**
   * Busca fornecedor completo com documentos
   */
  async findOneComDocumentos(id: string): Promise<any> {
    const fornecedor = await this.fornecedorRepository.findOne({
      where: { id },
      relations: ['socios', 'atividades'],
    });
    if (!fornecedor) {
      throw new NotFoundException(`Fornecedor com ID ${id} não encontrado`);
    }

    const documentos = await this.documentoRepository.find({
      where: { fornecedor_id: id },
      order: { nivel: 'ASC', created_at: 'DESC' },
    });

    return {
      ...fornecedor,
      documentos,
    };
  }

  async loginPorEmail(email: string, senha: string): Promise<{ fornecedor: Fornecedor; token: string }> {
    const fornecedor = await this.fornecedorRepository.findOne({
      where: { email },
    });

    if (!fornecedor) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    if (!fornecedor.senha) {
      throw new UnauthorizedException('Fornecedor não possui senha cadastrada');
    }

    const senhaHash = this.hashSenha(senha);
    if (fornecedor.senha !== senhaHash) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    // Token simples (em produção usar JWT)
    const token = Buffer.from(`${fornecedor.id}:${Date.now()}`).toString('base64');

    // Remove a senha do retorno
    const { senha: _, ...fornecedorSemSenha } = fornecedor;

    return {
      fornecedor: fornecedorSemSenha as Fornecedor,
      token,
    };
  }
}
