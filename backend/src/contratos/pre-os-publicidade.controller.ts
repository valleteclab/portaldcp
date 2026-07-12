import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Req,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtPayload, UserType } from '../auth/auth.service';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { Contrato } from './entities/contrato.entity';
import { PreOsPublicidadeService } from './pre-os-publicidade.service';
import { TabelaReferenciaService } from './tabela-referencia.service';
import type { LinhaPreOs } from './entities/pre-os-publicidade.entity';

/** Valida que o usuário autenticado é o fornecedor informado (padrão fornecedor-medicao) */
function validarFornecedor(user: JwtPayload, fornecedorId: string) {
  if (!fornecedorId) throw new BadRequestException('fornecedorId é obrigatório');
  if (user?.type === UserType.FORNECEDOR && user.sub !== fornecedorId) {
    throw new ForbiddenException('Sem acesso a este fornecedor');
  }
}

// ============================================================================
// PORTAL DO FORNECEDOR
// ============================================================================
@Controller('fornecedor/contratos')
export class PreOsFornecedorController {
  constructor(
    private readonly service: PreOsPublicidadeService,
    private readonly tabelaReferencia: TabelaReferenciaService,
    @InjectRepository(Contrato)
    private readonly contratoRepo: Repository<Contrato>,
  ) {}

  /** Tabela + remuneração do contrato de publicidade (para o picker do fornecedor). */
  @Get(':contratoId/tabela-publicidade')
  async tabelaPublicidade(
    @Param('contratoId') contratoId: string,
    @Query('fornecedorId') fornecedorId: string,
    @Req() req: { user: JwtPayload },
  ) {
    validarFornecedor(req.user, fornecedorId);
    const contrato = await this.contratoRepo.findOne({
      where: { id: contratoId },
      select: ['id', 'fornecedor_id', 'numero_contrato', 'tabela_referencia_id', 'remuneracao_publicidade'],
    });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    if (contrato.fornecedor_id !== fornecedorId) throw new ForbiddenException('Sem acesso a este contrato');
    const itens = contrato.tabela_referencia_id
      ? await this.tabelaReferencia.listarItens(contrato.tabela_referencia_id)
      : [];
    return {
      numero_contrato: contrato.numero_contrato,
      tabela_referencia_id: contrato.tabela_referencia_id,
      remuneracao_publicidade: contrato.remuneracao_publicidade,
      itens,
    };
  }

  @Get(':contratoId/pre-os')
  async listar(
    @Param('contratoId') contratoId: string,
    @Query('fornecedorId') fornecedorId: string,
    @Req() req: { user: JwtPayload },
  ) {
    validarFornecedor(req.user, fornecedorId);
    return this.service.listarDoFornecedor(contratoId, fornecedorId);
  }

  @Post(':contratoId/pre-os')
  async criar(
    @Param('contratoId') contratoId: string,
    @Query('fornecedorId') fornecedorId: string,
    @Req() req: { user: JwtPayload },
    @Body() body: { titulo: string; justificativa?: string; linhas: LinhaPreOs[] },
  ) {
    validarFornecedor(req.user, fornecedorId);
    return this.service.criarRascunho(contratoId, fornecedorId, body);
  }

  @Put('pre-os/:id')
  async atualizar(
    @Param('id') id: string,
    @Query('fornecedorId') fornecedorId: string,
    @Req() req: { user: JwtPayload },
    @Body() body: { titulo?: string; justificativa?: string; linhas?: LinhaPreOs[] },
  ) {
    validarFornecedor(req.user, fornecedorId);
    return this.service.atualizarRascunho(id, fornecedorId, body);
  }

  @Post('pre-os/:id/enviar')
  async enviar(
    @Param('id') id: string,
    @Query('fornecedorId') fornecedorId: string,
    @Req() req: { user: JwtPayload },
  ) {
    validarFornecedor(req.user, fornecedorId);
    return this.service.enviar(id, fornecedorId);
  }

  @Delete('pre-os/:id')
  async excluir(
    @Param('id') id: string,
    @Query('fornecedorId') fornecedorId: string,
    @Req() req: { user: JwtPayload },
  ) {
    validarFornecedor(req.user, fornecedorId);
    await this.service.excluirRascunho(id, fornecedorId);
    return { ok: true };
  }
}

// ============================================================================
// ÓRGÃO (responsável)
// ============================================================================
@Controller('contratos')
@RequireModule(ModuloSistema.CONTRATOS)
export class PreOsOrgaoController {
  constructor(private readonly service: PreOsPublicidadeService) {}

  private getOrgaoId(user: JwtPayload, orgaoIdParam?: string): string {
    if (user?.type === UserType.ORGAO) return user.sub;
    if (user?.type === UserType.ADMIN && orgaoIdParam) return orgaoIdParam;
    const orgaoId = (user as any)?.orgaoId || (user as any)?.orgao_id;
    if (orgaoId) return orgaoId;
    throw new ForbiddenException('Não foi possível identificar o órgão do usuário');
  }

  @Get(':contratoId/pre-os')
  async listar(@Param('contratoId') contratoId: string, @Req() req: any) {
    const orgaoId = this.getOrgaoId(req.user, req.query?.orgaoId);
    return this.service.listarDoContrato(contratoId, orgaoId);
  }

  @Post('pre-os/:id/devolver')
  async devolver(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { motivo: string },
  ) {
    const orgaoId = this.getOrgaoId(req.user, req.query?.orgaoId);
    return this.service.devolver(id, orgaoId, body?.motivo, (req.user as any)?.nome ?? (req.user as any)?.name);
  }

  @Post('pre-os/:id/aceitar')
  async aceitar(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { linhas?: LinhaPreOs[] },
  ) {
    const orgaoId = this.getOrgaoId(req.user, req.query?.orgaoId);
    return this.service.aceitar(id, orgaoId, (req.user as any)?.nome ?? (req.user as any)?.name, body?.linhas);
  }
}
