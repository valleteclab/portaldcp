import { Controller, Get, Post, Put, Delete, Body, Param, ValidationPipe, UnauthorizedException } from '@nestjs/common';
import { OrgaosService } from './orgaos.service';
import { CreateOrgaoDto } from './dto/create-orgao.dto';
import { Orgao } from './entities/orgao.entity';
import { createHash } from 'crypto';

@Controller('orgaos')
export class OrgaosController {
  constructor(private readonly orgaosService: OrgaosService) {}

  @Post()
  async create(@Body(new ValidationPipe()) createOrgaoDto: CreateOrgaoDto): Promise<Orgao> {
    return await this.orgaosService.create(createOrgaoDto);
  }

  @Post('login')
  async login(@Body() body: { email: string; senha: string }) {
    const { email, senha } = body;
    
    if (!email || !senha) {
      throw new UnauthorizedException('Email e senha são obrigatórios');
    }

    const orgao = await this.orgaosService.findByEmail(email);
    if (!orgao) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    const senhaHash = createHash('sha256').update(senha).digest('hex');
    if (orgao.senha_hash !== senhaHash) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    // Remove senha do retorno
    const { senha_hash, ...orgaoSemSenha } = orgao;
    
    return {
      success: true,
      orgao: orgaoSemSenha,
      token: `orgao_${orgao.id}_${Date.now()}`, // Token simples para dev
    };
  }

  @Post('registro')
  async registro(@Body() body: { email: string; senha: string; nome: string; cnpj: string; codigo: string }) {
    const { email, senha, nome, cnpj, codigo } = body;
    
    // Verifica se email já existe
    const existente = await this.orgaosService.findByEmail(email);
    if (existente) {
      throw new UnauthorizedException('Email já cadastrado');
    }

    const senhaHash = createHash('sha256').update(senha).digest('hex');
    
    const orgao = await this.orgaosService.create({
      email_login: email,
      senha_hash: senhaHash,
      nome,
      cnpj,
      codigo,
      tipo: 'PREFEITURA',
      esfera: 'MUNICIPAL',
      logradouro: 'A definir',
      bairro: 'A definir',
      cidade: 'A definir',
      uf: 'SP',
      cep: '00000000',
      responsavel_nome: 'A definir',
      responsavel_cpf: '000.000.000-00',
    } as any);

    const { senha_hash: _, ...orgaoSemSenha } = orgao;
    
    return {
      success: true,
      orgao: orgaoSemSenha,
    };
  }

  @Get()
  async findAll(): Promise<Orgao[]> {
    return await this.orgaosService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Orgao> {
    return await this.orgaosService.findOne(id);
  }

  @Get('codigo/:codigo')
  async findByCodigo(@Param('codigo') codigo: string): Promise<Orgao> {
    return await this.orgaosService.findByCodigo(codigo);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ skipMissingProperties: true })) updateData: Partial<CreateOrgaoDto>
  ): Promise<Orgao> {
    return await this.orgaosService.update(id, updateData);
  }

  @Delete(':id')
  async deactivate(@Param('id') id: string): Promise<Orgao> {
    return await this.orgaosService.deactivate(id);
  }

  // ============ VINCULAÇÃO PNCP ============
  // A plataforma LicitaFácil tem UMA credencial no PNCP
  // Aqui gerenciamos quais órgãos estão vinculados à plataforma

  @Put(':id/pncp')
  async vincularPNCP(
    @Param('id') id: string,
    @Body() config: {
      pncp_vinculado: boolean;
      pncp_codigo_unidade: string;
    }
  ): Promise<Orgao> {
    return await this.orgaosService.vincularPNCP(id, config);
  }

  @Get(':id/pncp/status')
  async statusPNCP(@Param('id') id: string) {
    return await this.orgaosService.statusPNCP(id);
  }
}
