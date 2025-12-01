import { Controller, Get, Post, Put, Delete, Body, Param, Query, ValidationPipe } from '@nestjs/common';
import { FornecedoresService } from './fornecedores.service';
import { CreateFornecedorDto, UpdateFornecedorDto } from './dto/create-fornecedor.dto';
import { Fornecedor, NivelCadastro } from './entities/fornecedor.entity';
import { FornecedorDocumento } from './entities/fornecedor-documento.entity';

@Controller('fornecedores')
export class FornecedoresController {
  constructor(private readonly fornecedoresService: FornecedoresService) {}

  // === CONSULTA CNPJ ===
  @Get('consultar-cnpj/:cnpj')
  async consultarCnpj(@Param('cnpj') cnpj: string) {
    return await this.fornecedoresService.consultarCnpj(cnpj);
  }

  @Get('verificar-cnpj/:cnpj')
  async verificarCnpjExistente(@Param('cnpj') cnpj: string) {
    return await this.fornecedoresService.verificarCnpjExistente(cnpj);
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
  async findAll(): Promise<Fornecedor[]> {
    return await this.fornecedoresService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Fornecedor> {
    return await this.fornecedoresService.findOne(id);
  }

  @Get('cpf-cnpj/:cpfCnpj')
  async findByCpfCnpj(@Param('cpfCnpj') cpfCnpj: string): Promise<Fornecedor> {
    return await this.fornecedoresService.findByCpfCnpj(cpfCnpj);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ skipMissingProperties: true })) updateDto: UpdateFornecedorDto
  ): Promise<Fornecedor> {
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
  @Post('registro')
  async registro(
    @Body() body: { email: string; senha: string }
  ): Promise<{ fornecedor: Fornecedor; token: string }> {
    const fornecedor = await this.fornecedoresService.registroInicial(body.email, body.senha);
    const token = Buffer.from(`${fornecedor.id}:${Date.now()}`).toString('base64');
    return { fornecedor, token };
  }

  @Put(':id/definir-senha')
  async definirSenha(
    @Param('id') id: string,
    @Body() body: { senha: string }
  ): Promise<{ message: string }> {
    await this.fornecedoresService.definirSenha(id, body.senha);
    return { message: 'Senha definida com sucesso' };
  }

  @Post('login')
  async login(
    @Body() body: { email: string; senha: string }
  ): Promise<{ fornecedor: Fornecedor; token: string }> {
    return await this.fornecedoresService.loginPorEmail(body.email, body.senha);
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
  async findByEmail(@Param('email') email: string): Promise<Fornecedor | null> {
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
    }
  ): Promise<Fornecedor> {
    return await this.fornecedoresService.salvarHabilitacaoJuridica(id, body);
  }

  @Put(':id/fiscal-federal')
  async salvarFiscalFederal(
    @Param('id') id: string,
    @Body() body: {
      receitaFederal: { tipoComprovante: string; codigoControle: string; dataValidade: string };
      fgts: { tipoComprovante: string; codigoControle: string; dataValidade: string };
      tst: { tipoComprovante: string; codigoControle: string; dataValidade: string };
    }
  ): Promise<Fornecedor> {
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
    }
  ): Promise<Fornecedor> {
    return await this.fornecedoresService.salvarFiscalEstadual(id, body);
  }

  @Put(':id/qualificacao-tecnica')
  async salvarQualificacaoTecnica(
    @Param('id') id: string,
    @Body() body: { atestados: Array<{ emissor: string; data: string; descricao: string }> }
  ): Promise<Fornecedor> {
    return await this.fornecedoresService.salvarQualificacaoTecnica(id, body.atestados);
  }

  @Put(':id/qualificacao-economica')
  async salvarQualificacaoEconomica(
    @Param('id') id: string,
    @Body() body: { balancos: Array<{ ano: string; tipo: string; exercicioFinanceiro: string }> }
  ): Promise<Fornecedor> {
    return await this.fornecedoresService.salvarQualificacaoEconomica(id, body.balancos);
  }

  @Get(':id/completo')
  async findOneComDocumentos(@Param('id') id: string) {
    return await this.fornecedoresService.findOneComDocumentos(id);
  }
}
