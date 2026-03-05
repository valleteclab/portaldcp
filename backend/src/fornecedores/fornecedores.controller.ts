import { Controller, Get, Post, Put, Delete, Body, Param, Query, ValidationPipe, Req, ForbiddenException } from '@nestjs/common';
import { FornecedoresService } from './fornecedores.service';
import { CreateFornecedorDto, UpdateFornecedorDto } from './dto/create-fornecedor.dto';
import { Fornecedor, NivelCadastro } from './entities/fornecedor.entity';
import { FornecedorDocumento } from './entities/fornecedor-documento.entity';
import { AuthService, JwtPayload, UserType } from '../auth/auth.service';
import { Public } from '../auth/public.decorator';
import { AuditService, AuditAction } from '../audit/audit.service';

@Controller('fornecedores')
export class FornecedoresController {
  constructor(
    private readonly fornecedoresService: FornecedoresService,
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Valida se o usuário autenticado é o dono do recurso
   * Fornecedor só pode acessar/modificar seus próprios dados
   */
  private validarOwnership(user: JwtPayload, fornecedorId: string, req?: any): void {
    if (user.type === UserType.FORNECEDOR && user.sub !== fornecedorId) {
      // Registra tentativa de acesso não autorizado
      this.auditService.logAccessDenied(user, 'Fornecedor', fornecedorId, req?.ip);
      throw new ForbiddenException('Você não tem permissão para acessar/modificar dados de outro fornecedor');
    }
  }

  // === CONSULTA CNPJ ===
  @Public()
  @Get('consultar-cnpj/:cnpj')
  async consultarCnpj(@Param('cnpj') cnpj: string) {
    return await this.fornecedoresService.consultarCnpj(cnpj);
  }

  @Public()
  @Get('verificar-cnpj/:cnpj')
  async verificarCnpjExistente(
    @Param('cnpj') cnpj: string,
    @Query('email') email?: string
  ) {
    return await this.fornecedoresService.verificarCnpjExistente(cnpj, email);
  }

  @Post('orgao/cadastro-rapido')
  async cadastroRapidoOrgao(
    @Body() body: { cnpj: string; razao_social: string }
  ): Promise<Fornecedor> {
    return await this.fornecedoresService.cadastroRapidoOrgao(body.cnpj, body.razao_social);
  }

  @Post('cadastrar-cnpj')
  async createFromCnpj(
    @Body() body: {
      dadosCnpj: any;
      representante_nome: string;
      representante_cpf: string;
      representante_cargo?: string;
      representante_email?: string;
      representante_telefone?: string;
      inscricao_estadual?: string;
      inscricao_municipal?: string;
    }
  ): Promise<Fornecedor> {
    return await this.fornecedoresService.createFromCnpj(body.dadosCnpj, {
      representante_nome: body.representante_nome,
      representante_cpf: body.representante_cpf,
      representante_cargo: body.representante_cargo,
      representante_email: body.representante_email,
      representante_telefone: body.representante_telefone,
      inscricao_estadual: body.inscricao_estadual,
      inscricao_municipal: body.inscricao_municipal,
    });
  }

  @Put(':id/atualizar-cnpj')
  async atualizarDadosCnpj(@Param('id') id: string): Promise<Fornecedor> {
    return await this.fornecedoresService.atualizarDadosCnpj(id);
  }

  // === CRUD ===
  @Post()
  async create(@Body(new ValidationPipe()) createDto: CreateFornecedorDto): Promise<Fornecedor> {
    return await this.fornecedoresService.create(createDto);
  }

  @Get()
  async findAll() {
    return await this.fornecedoresService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.fornecedoresService.findOne(id);
  }

  @Get('cpf-cnpj/:cpfCnpj')
  async findByCpfCnpj(@Param('cpfCnpj') cpfCnpj: string) {
    return await this.fornecedoresService.findByCpfCnpj(cpfCnpj);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ skipMissingProperties: true })) updateDto: UpdateFornecedorDto,
    @Req() req: any
  ) {
    // Valida ownership: fornecedor só pode atualizar seus próprios dados
    this.validarOwnership(req.user, id, req);
    return await this.fornecedoresService.update(id, updateDto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<{ message: string }> {
    await this.fornecedoresService.delete(id);
    return { message: 'Fornecedor excluído com sucesso' };
  }

  // === DOCUMENTOS ===
  @Post(':id/documentos')
  async addDocumento(
    @Param('id') id: string,
    @Body() documento: Partial<FornecedorDocumento>
  ): Promise<FornecedorDocumento> {
    return await this.fornecedoresService.addDocumento(id, documento);
  }

  @Get(':id/documentos')
  async getDocumentos(
    @Param('id') id: string,
    @Query('nivel') nivel?: NivelCadastro
  ): Promise<FornecedorDocumento[]> {
    return await this.fornecedoresService.getDocumentos(id, nivel);
  }

  @Put('documentos/:docId/analisar')
  async analisarDocumento(
    @Param('docId') docId: string,
    @Body() body: { aprovado: boolean; observacao: string; analisadoPor: string }
  ): Promise<FornecedorDocumento> {
    return await this.fornecedoresService.analisarDocumento(
      docId,
      body.aprovado,
      body.observacao,
      body.analisadoPor
    );
  }

  // === STATUS ===
  @Put(':id/aprovar')
  async aprovar(@Param('id') id: string): Promise<Fornecedor> {
    return await this.fornecedoresService.aprovar(id);
  }

  @Put(':id/suspender')
  async suspender(
    @Param('id') id: string,
    @Body() body: { motivo: string }
  ): Promise<Fornecedor> {
    return await this.fornecedoresService.suspender(id, body.motivo);
  }

  @Put(':id/reativar')
  async reativar(@Param('id') id: string): Promise<Fornecedor> {
    return await this.fornecedoresService.reativar(id);
  }

  @Get(':id/habilitacao')
  async verificarHabilitacao(@Param('id') id: string) {
    return await this.fornecedoresService.verificarHabilitacao(id);
  }

  // === AUTENTICAÇÃO ===
  @Public()
  @Post('registro')
  async registro(
    @Body() body: { email: string; senha: string }
  ): Promise<{ fornecedor: Fornecedor; token: string }> {
    const fornecedor = await this.fornecedoresService.registroInicial(body.email, body.senha);
    // Gera JWT válido após registro para permitir acesso autenticado
    const result = await this.authService.loginFornecedorPorEmail(body.email, body.senha);
    return { fornecedor, token: result.token };
  }

  @Put(':id/definir-senha')
  async definirSenha(
    @Param('id') id: string,
    @Body() body: { senha: string }
  ): Promise<{ message: string }> {
    await this.fornecedoresService.definirSenha(id, body.senha);
    return { message: 'Senha definida com sucesso' };
  }

  @Public()
  @Post('login')
  async login(
    @Body() body: { email: string; senha: string }
  ): Promise<{ fornecedor: Fornecedor; token: string }> {
    const result = await this.authService.loginFornecedorPorEmail(body.email, body.senha);
    return {
      fornecedor: result.fornecedor as Fornecedor,
      token: result.token,
    };
  }

  @Public()
  @Post('esqueci-senha')
  async esqueciSenha(
    @Body() body: { email: string; cpfCnpj: string }
  ): Promise<{ message: string }> {
    return await this.fornecedoresService.solicitarResetSenha(body.email, body.cpfCnpj);
  }

  @Public()
  @Post('resetar-senha')
  async resetarSenha(
    @Body() body: { token: string; novaSenha: string }
  ): Promise<{ message: string }> {
    return await this.fornecedoresService.resetarSenha(body.token, body.novaSenha);
  }

  // === CREDENCIAMENTO ===
  @Post('completar-credenciamento')
  async completarCredenciamento(
    @Body() body: {
      email: string;
      dadosCnpj: any;
      representante_nome: string;
      representante_cpf: string;
      representante_cargo?: string;
      representante_email?: string;
      representante_telefone?: string;
      inscricao_estadual?: string;
      inscricao_municipal?: string;
    }
  ): Promise<Fornecedor> {
    return await this.fornecedoresService.completarCredenciamento(body.email, body.dadosCnpj, {
      representante_nome: body.representante_nome,
      representante_cpf: body.representante_cpf,
      representante_cargo: body.representante_cargo,
      representante_email: body.representante_email,
      representante_telefone: body.representante_telefone,
      inscricao_estadual: body.inscricao_estadual,
      inscricao_municipal: body.inscricao_municipal,
    });
  }

  @Get('por-email/:email')
  async findByEmail(@Param('email') email: string, @Req() req: any) {
    // Valida ownership: fornecedor só pode acessar seus próprios dados
    const user = req.user as JwtPayload;
    if (user.type === UserType.FORNECEDOR && user.email !== email) {
      throw new ForbiddenException('Você não tem permissão para acessar dados de outro fornecedor');
    }
    return await this.fornecedoresService.findByEmail(email);
  }

  // === SALVAR DADOS DAS ABAS ===
  @Put(':id/habilitacao-juridica')
  async salvarHabilitacaoJuridica(
    @Param('id') id: string,
    @Body() body: { 
      contratoSocial?: { filename: string; originalname: string; url: string };
      documentoRepresentante?: { filename: string; originalname: string; url: string };
      procuracaoArquivo?: { filename: string; originalname: string; url: string };
      documentoProcurador?: { filename: string; originalname: string; url: string };
    },
    @Req() req: any
  ): Promise<Fornecedor> {
    this.validarOwnership(req.user, id, req);
    return await this.fornecedoresService.salvarHabilitacaoJuridica(id, body);
  }

  @Put(':id/fiscal-federal')
  async salvarFiscalFederal(
    @Param('id') id: string,
    @Body() body: {
      receitaFederal: { tipoComprovante: string; codigoControle: string; dataValidade: string };
      fgts: { tipoComprovante: string; codigoControle: string; dataValidade: string };
      tst: { tipoComprovante: string; codigoControle: string; dataValidade: string };
    },
    @Req() req: any
  ): Promise<Fornecedor> {
    this.validarOwnership(req.user, id, req);
    return await this.fornecedoresService.salvarFiscalFederal(id, body);
  }

  @Put(':id/fiscal-estadual')
  async salvarFiscalEstadual(
    @Param('id') id: string,
    @Body() body: {
      inscricaoEstadual?: string;
      inscricaoMunicipal?: string;
      certidaoEstadual?: { tipoComprovante: string; codigoControle: string; dataValidade: string };
      certidaoMunicipal?: { tipoComprovante: string; codigoControle: string; dataValidade: string };
    },
    @Req() req: any
  ): Promise<Fornecedor> {
    this.validarOwnership(req.user, id, req);
    return await this.fornecedoresService.salvarFiscalEstadual(id, body);
  }

  @Put(':id/qualificacao-tecnica')
  async salvarQualificacaoTecnica(
    @Param('id') id: string,
    @Body() body: { atestados: Array<{ emissor: string; data: string; descricao: string }> },
    @Req() req: any
  ): Promise<Fornecedor> {
    this.validarOwnership(req.user, id, req);
    return await this.fornecedoresService.salvarQualificacaoTecnica(id, body.atestados);
  }

  @Put(':id/qualificacao-economica')
  async salvarQualificacaoEconomica(
    @Param('id') id: string,
    @Body() body: { balancos: Array<{ ano: string; tipo: string; exercicioFinanceiro: string }> },
    @Req() req: any
  ): Promise<Fornecedor> {
    this.validarOwnership(req.user, id, req);
    return await this.fornecedoresService.salvarQualificacaoEconomica(id, body.balancos);
  }

  @Get(':id/completo')
  async findOneComDocumentos(@Param('id') id: string) {
    return await this.fornecedoresService.findOneComDocumentos(id);
  }

  // === ADMIN: GERENCIAMENTO DE FORNECEDORES ===
  
  /**
   * Reset de senha - Gera uma senha temporária para o fornecedor
   * Apenas admin pode executar esta ação
   */
  @Put(':id/admin/reset-senha')
  async resetSenhaAdmin(@Param('id') id: string, @Req() req: any) {
    const user = req.user as JwtPayload;
    // Verifica se é admin
    if (user.type !== UserType.ADMIN && user.role !== 'admin') {
      throw new ForbiddenException('Apenas administradores podem resetar senhas');
    }
    return await this.fornecedoresService.resetSenhaAdmin(id);
  }

  /**
   * Atualização de dados pelo admin (endereço, contato, etc)
   * Apenas admin pode executar esta ação
   */
  @Put(':id/admin/dados')
  async updateAdmin(
    @Param('id') id: string,
    @Body() body: {
      razao_social?: string;
      nome_fantasia?: string;
      logradouro?: string;
      numero?: string;
      complemento?: string;
      bairro?: string;
      cidade?: string;
      uf?: string;
      cep?: string;
      telefone?: string;
      email?: string;
      site?: string;
      representante_nome?: string;
      representante_cpf?: string;
      representante_cargo?: string;
      representante_email?: string;
      representante_telefone?: string;
      observacoes?: string;
      inscricao_estadual?: string;
      inscricao_municipal?: string;
    },
    @Req() req: any
  ) {
    const user = req.user as JwtPayload;
    // Verifica se é admin
    if (user.type !== UserType.ADMIN && user.role !== 'admin') {
      throw new ForbiddenException('Apenas administradores podem alterar dados de fornecedores');
    }
    return await this.fornecedoresService.updateAdmin(id, body);
  }

  /**
   * Alterar nível do fornecedor pelo admin
   */
  @Put(':id/admin/nivel')
  async alterarNivel(
    @Param('id') id: string,
    @Body() body: { nivel: string },
    @Req() req: any
  ) {
    const user = req.user as JwtPayload;
    // Verifica se é admin
    if (user.type !== UserType.ADMIN && user.role !== 'admin') {
      throw new ForbiddenException('Apenas administradores podem alterar níveis');
    }
    return await this.fornecedoresService.alterarNivel(id, body.nivel as any);
  }
}
