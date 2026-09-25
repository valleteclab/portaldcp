import { Controller, Get, Post, Put, Delete, Body, Param, Query, ValidationPipe, Req, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { FornecedoresService } from './fornecedores.service';
import { CreateFornecedorDto, UpdateFornecedorDto } from './dto/create-fornecedor.dto';
import { Fornecedor, NivelCadastro } from './entities/fornecedor.entity';
import { FornecedorDocumento } from './entities/fornecedor-documento.entity';
import { AuthService, JwtPayload, UserType } from '../auth/auth.service';
import { Public } from '../auth/public.decorator';
import { AuditService, AuditAction } from '../audit/audit.service';
import { AcessoLicitacaoService } from '../auth/acesso/acesso-licitacao.service';
import { atorDaRequisicao, ehFornecedor, ehOrgao } from '../auth/acesso/ator';
import { SomenteOrgao } from '../auth/acesso/acesso.decorators';

@Controller('fornecedores')
export class FornecedoresController {
  constructor(
    private readonly fornecedoresService: FornecedoresService,
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  /**
   * Leitura do REGISTRO CADASTRAL com documentos (dados pessoais/fiscais e
   * caminho dos arquivos): o próprio fornecedor, ADMIN ou órgão com VÍNCULO
   * (proposta numa licitação do órgão ou contrato). Demais → 404.
   */
  private async assertPodeVerCadastro(req: any, fornecedorId: string): Promise<void> {
    const ator = atorDaRequisicao(req);
    if (!ator) throw new UnauthorizedException('Autenticação necessária');
    if (ator.admin) return;
    if (ehFornecedor(ator) && ator.fornecedorId === fornecedorId) return;
    if (ehOrgao(ator) && (await this.acesso.orgaoTemVinculoComFornecedor(ator.orgaoId, fornecedorId))) return;
    throw new NotFoundException('Fornecedor não encontrado');
  }

  /**
   * Valida se o usuário autenticado é o dono do recurso
   * Fornecedor só pode acessar/modificar seus próprios dados
   */
  /** Só o ADMIN da plataforma (token ADMIN). Fornecedor, órgão e usuário do órgão → 403. */
  private exigirAdmin(req: any, mensagem: string): void {
    const ator = atorDaRequisicao(req);
    if (!ator) throw new UnauthorizedException('Autenticação necessária');
    if (!ator.admin) throw new ForbiddenException(mensagem);
  }

  /** Órgão (ORGAO/USUARIO) ou ADMIN — fornecedor nunca. */
  private exigirOrgaoOuAdmin(req: any, mensagem = 'Ação exclusiva do órgão ou da administração da plataforma'): void {
    const ator = atorDaRequisicao(req);
    if (!ator) throw new UnauthorizedException('Autenticação necessária');
    if (!ator.admin && !ehOrgao(ator)) throw new ForbiddenException(mensagem);
  }

  /**
   * Ato do órgão SOBRE um fornecedor (contato, reset de senha): ADMIN ou órgão
   * com VÍNCULO (proposta numa licitação do órgão ou contrato). Sem isso,
   * qualquer órgão trocaria o e-mail de qualquer fornecedor e pediria o reset.
   */
  private async exigirOrgaoComVinculo(req: any, fornecedorId: string): Promise<void> {
    this.exigirOrgaoOuAdmin(req, 'Acesso não autorizado');
    const ator = atorDaRequisicao(req)!;
    if (ator.admin) return;
    if (!(await this.acesso.orgaoTemVinculoComFornecedor(ator.orgaoId, fornecedorId))) {
      throw new ForbiddenException('Fornecedor sem vínculo (proposta ou contrato) com o seu órgão');
    }
  }

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
  @SomenteOrgao()
  async cadastroRapidoOrgao(
    @Body() body: { cnpj: string; razao_social: string },
    @Req() req: any,
  ): Promise<Fornecedor> {
    this.exigirOrgaoOuAdmin(req);
    return await this.fornecedoresService.cadastroRapidoOrgao(body.cnpj, body.razao_social);
  }

  @Post('cadastrar-cnpj')
  @SomenteOrgao()
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
    },
    @Req() req: any,
  ): Promise<Fornecedor> {
    // fornecedor não cria outros fornecedores (o próprio cadastro é por /registro e /completar-credenciamento)
    this.exigirOrgaoOuAdmin(req);
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
  async atualizarDadosCnpj(@Param('id') id: string, @Req() req: any): Promise<Fornecedor> {
    this.validarOwnership(req.user, id, req);
    return await this.fornecedoresService.atualizarDadosCnpj(id);
  }

  // === CRUD ===
  @Post()
  @SomenteOrgao() // guard antes do ValidationPipe: fornecedor recebe 403, não 400
  async create(@Body(new ValidationPipe()) createDto: CreateFornecedorDto, @Req() req: any): Promise<Fornecedor> {
    this.exigirOrgaoOuAdmin(req);
    return await this.fornecedoresService.create(createDto);
  }

  @Get()
  async findAll() {
    return await this.fornecedoresService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: any) {
    const f: any = await this.fornecedoresService.findOne(id);
    // nunca devolve hash de senha/API key; chave da Spedy só ao próprio fornecedor ou ADMIN
    const { senha: _s, api_key_hash: _k, ...resto } = f;
    const ator = atorDaRequisicao(req);
    if (!(ator?.admin || (ehFornecedor(ator) && ator.fornecedorId === id))) delete resto.spedy_api_key;
    return resto;
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
    // Órgão (tela de contrato) só corrige o nome; contato/e-mail/credenciais
    // pelo órgão só em /:id/orgao/contato (com vínculo) — nunca aqui.
    // A correção do nome também exige VÍNCULO (proposta numa licitação do
    // órgão, contrato ou inscrição em credenciamento): o registro cadastral é
    // da plataforma, e sem isso qualquer órgão renomearia qualquer fornecedor.
    // Na tela de contrato o vínculo nasce ao salvar o contrato — a correção
    // do nome é enviada depois disso.
    const ator = atorDaRequisicao(req);
    if (ehOrgao(ator) && !ator.admin) {
      const permitidos = ['razao_social', 'nome_fantasia'];
      const outros = Object.keys(updateDto || {}).filter((k) => (updateDto as any)[k] !== undefined && !permitidos.includes(k));
      if (outros.length) throw new ForbiddenException(`O órgão não altera estes dados do fornecedor: ${outros.join(', ')}`);
      if (!(await this.acesso.orgaoTemVinculoComFornecedor(ator!.orgaoId, id))) {
        throw new ForbiddenException(
          'Fornecedor sem vínculo (proposta, contrato ou credenciamento) com o seu órgão — solicite a correção ao fornecedor ou à administração da plataforma',
        );
      }
    }
    return await this.fornecedoresService.update(id, updateDto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: { user: JwtPayload }): Promise<{ message: string }> {
    if (req.user.type !== UserType.ADMIN) {
      throw new ForbiddenException('Apenas administradores podem excluir fornecedores');
    }
    await this.fornecedoresService.delete(id);
    return { message: 'Fornecedor excluído com sucesso' };
  }

  /**
   * Migra vínculos (contratos etc.) de um fornecedor TEMP_ para o fornecedor real
   * baseado no fornecedor_cnpj (snapshot) armazenado em cada registro.
   * Útil quando o cadastro foi criado como pendente mas o CNPJ real já existe.
   */
  @Post(':id/migrar-vinculos')
  async migrarVinculos(@Param('id') id: string, @Req() req: { user: JwtPayload }) {
    if (req.user.type !== UserType.ADMIN) {
      throw new ForbiddenException('Apenas administradores podem migrar vínculos de fornecedores');
    }
    return this.fornecedoresService.migrarVinculos(id);
  }

  // === DOCUMENTOS ===
  @Post(':id/documentos')
  async addDocumento(
    @Param('id') id: string,
    @Body() documento: Partial<FornecedorDocumento>,
    @Req() req: any,
  ): Promise<FornecedorDocumento> {
    // só o próprio fornecedor (ou órgão/admin, como antes) grava no cadastro
    this.validarOwnership(req.user, id, req);
    return await this.fornecedoresService.addDocumento(id, documento);
  }

  @Get(':id/documentos')
  async getDocumentos(
    @Param('id') id: string,
    @Req() req: any,
    @Query('nivel') nivel?: NivelCadastro,
  ): Promise<FornecedorDocumento[]> {
    await this.assertPodeVerCadastro(req, id);
    return await this.fornecedoresService.getDocumentos(id, nivel);
  }

  /**
   * Análise de documento do REGISTRO CADASTRAL: vale para todos os órgãos da
   * plataforma (a habilitação usa o documento aprovado — art. 70), então é
   * ato do ADMIN da plataforma (tela /admin). Fornecedor nunca (nem o próprio
   * documento); órgão analisa o documento NA habilitação da sua licitação
   * (/api/habilitacao/documentos/:id/analisar). O analista gravado vem do
   * token; o nome informado no corpo fica só como rótulo.
   */
  @Put('documentos/:docId/analisar')
  async analisarDocumento(
    @Param('docId') docId: string,
    @Body() body: { aprovado: boolean; observacao: string; analisadoPor: string },
    @Req() req: any,
  ): Promise<FornecedorDocumento> {
    this.exigirAdmin(req, 'A análise do registro cadastral é exclusiva da administração da plataforma');
    const user = req.user as JwtPayload;
    const identidade = `ADMIN ${user.email || user.sub}`;
    const rotulo = typeof body?.analisadoPor === 'string' ? body.analisadoPor.trim().slice(0, 120) : '';
    return await this.fornecedoresService.analisarDocumento(
      docId,
      body.aprovado,
      body.observacao,
      rotulo ? `${rotulo} [${identidade}]` : identidade,
    );
  }

  // === STATUS ===
  @Put(':id/aprovar')
  async aprovar(@Param('id') id: string, @Req() req: any): Promise<Fornecedor> {
    this.exigirAdmin(req, 'Apenas administradores podem aprovar fornecedores');
    return await this.fornecedoresService.aprovar(id);
  }

  @Put(':id/suspender')
  async suspender(
    @Param('id') id: string,
    @Body() body: { motivo: string },
    @Req() req: any,
  ): Promise<Fornecedor> {
    this.exigirAdmin(req, 'Apenas administradores podem suspender fornecedores');
    return await this.fornecedoresService.suspender(id, body.motivo);
  }

  @Put(':id/reativar')
  async reativar(@Param('id') id: string, @Req() req: any): Promise<Fornecedor> {
    this.exigirAdmin(req, 'Apenas administradores podem reativar fornecedores');
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

  @Public()
  @Post('reivindicar-conta')
  async reivindicarConta(
    @Body() body: { cnpj: string; email: string; senha: string }
  ): Promise<{ fornecedor: Fornecedor; token: string }> {
    await this.fornecedoresService.reivindicarConta(body.cnpj, body.email, body.senha);
    const result = await this.authService.loginFornecedorPorEmail(body.email, body.senha);
    return { fornecedor: result.fornecedor as Fornecedor, token: result.token };
  }

  @Post('vincular-cnpj')
  async vincularCnpj(
    @Body() body: { cnpj: string },
    @Req() req: any
  ): Promise<Fornecedor> {
    const user: JwtPayload = req.user;
    return await this.fornecedoresService.vincularCnpj(user.sub, body.cnpj);
  }

  @Put(':id/definir-senha')
  async definirSenha(
    @Param('id') id: string,
    @Body() body: { senha: string },
    @Req() req: any,
  ): Promise<{ message: string }> {
    // só o próprio fornecedor (ou ADMIN): antes qualquer login trocava a senha de qualquer fornecedor
    const ator = atorDaRequisicao(req);
    if (!ator) throw new UnauthorizedException('Autenticação necessária');
    if (!ator.admin && !(ehFornecedor(ator) && ator.fornecedorId === id)) {
      throw new ForbiddenException('Você não tem permissão para definir a senha deste fornecedor');
    }
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
    },
    @Req() req: any,
  ): Promise<Fornecedor> {
    // credenciamento do PRÓPRIO cadastro (e-mail do token) — ou ADMIN
    const user = req.user as JwtPayload;
    if (user?.type !== UserType.ADMIN) {
      if (user?.type !== UserType.FORNECEDOR || String(user.email || '').toLowerCase() !== String(body?.email || '').toLowerCase()) {
        throw new ForbiddenException('Você só pode completar o credenciamento do seu próprio cadastro');
      }
    }
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
    const fornecedor = await this.fornecedoresService.findByEmail(email);
    // órgão só vê o cadastro (com documentos) de fornecedor com quem tem vínculo
    if (fornecedor && user.type !== UserType.FORNECEDOR) await this.assertPodeVerCadastro(req, fornecedor.id);
    return fornecedor;
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
  async findOneComDocumentos(@Param('id') id: string, @Req() req: any) {
    await this.assertPodeVerCadastro(req, id);
    return await this.fornecedoresService.findOneComDocumentos(id);
  }

  // === ADMIN: GERENCIAMENTO DE FORNECEDORES ===
  
  /**
   * Reset de senha - Gera uma senha temporária para o fornecedor
   * Apenas admin pode executar esta ação
   */
  @Put(':id/admin/reset-senha')
  async resetSenhaAdmin(@Param('id') id: string, @Req() req: any) {
    // só o ADMIN da plataforma (o antigo `role === 'admin'` deixava passar papel de outro contexto)
    this.exigirAdmin(req, 'Apenas administradores podem resetar senhas');
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
    // só o ADMIN da plataforma (o antigo `role === 'admin'` deixava passar papel de outro contexto)
    this.exigirAdmin(req, 'Apenas administradores podem alterar dados de fornecedores');
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
    // só o ADMIN da plataforma (o antigo `role === 'admin'` deixava passar papel de outro contexto)
    this.exigirAdmin(req, 'Apenas administradores podem alterar níveis');
    return await this.fornecedoresService.alterarNivel(id, body.nivel as any);
  }

  // === ORGÃO: GESTÃO DE FORNECEDORES CONTRATADOS ===

  /**
   * Solicita reset de senha para um fornecedor — acessível pelo órgão contratante.
   * Envia e-mail com link de redefinição. Não expõe nem altera a senha diretamente.
   * POST /api/fornecedores/:id/orgao/solicitar-reset
   */
  @Post(':id/orgao/solicitar-reset')
  async solicitarResetPorOrgao(
    @Param('id') id: string,
    @Body() body: { canal?: 'email' | 'whatsapp' | 'ambos' },
    @Req() req: any,
  ) {
    const user = req.user as JwtPayload;
    await this.exigirOrgaoComVinculo(req, id);
    const orgaoId = user.type === UserType.ORGAO ? user.sub : (user as any).orgaoId || (user as any).orgao_id;
    return await this.fornecedoresService.solicitarResetPorOrgao(id, orgaoId, body?.canal || 'email');
  }

  /**
   * Atualiza dados de contato do fornecedor — acessível pelo órgão contratante.
   * Permite editar: nome_fantasia, email, telefone, representante_whatsapp, representante_nome, representante_cargo.
   * PUT /api/fornecedores/:id/orgao/contato
   */
  @Put(':id/orgao/contato')
  async atualizarContatoOrgao(
    @Param('id') id: string,
    @Body() body: {
      nome_fantasia?: string;
      email?: string;
      telefone?: string;
      representante_whatsapp?: string;
      representante_nome?: string;
      representante_cargo?: string;
    },
    @Req() req: any,
  ) {
    await this.exigirOrgaoComVinculo(req, id);
    return await this.fornecedoresService.atualizarContatoOrgao(id, body);
  }

  // === API KEY (acesso externo / MCP) ===

  /**
   * Retorna se o fornecedor possui API Key ativa (sem expor o valor).
   * GET /api/fornecedores/:id/api-key
   */
  @Get(':id/api-key')
  async statusApiKey(@Param('id') id: string, @Req() req: any) {
    this.validarOwnership(req.user, id, req);
    return await this.fornecedoresService.statusApiKey(id);
  }

  /**
   * Gera uma nova API Key para o fornecedor.
   * Retorna o plaintext APENAS UMA VEZ.
   * POST /api/fornecedores/:id/api-key
   */
  @Post(':id/api-key')
  async gerarApiKey(@Param('id') id: string, @Req() req: any) {
    this.validarOwnership(req.user, id, req);
    return await this.fornecedoresService.gerarApiKey(id);
  }

  /**
   * Revoga a API Key do fornecedor.
   * DELETE /api/fornecedores/:id/api-key
   */
  @Delete(':id/api-key')
  async revogarApiKey(@Param('id') id: string, @Req() req: any) {
    this.validarOwnership(req.user, id, req);
    await this.fornecedoresService.revogarApiKey(id);
    return { message: 'API Key revogada com sucesso' };
  }
}
