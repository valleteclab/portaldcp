import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Res,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContratosService } from './contratos.service';
import { Contrato, StatusContrato, TipoContrato } from './entities/contrato.entity';
import { TermoAditivo } from './entities/termo-aditivo.entity';
import { TipoDocumentoContrato } from './entities/documento-contrato.entity';
import { AnexoMedicao } from './entities/anexo-medicao.entity';
import { Medicao } from './entities/medicao.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { UploadService } from '../upload/upload.service';
import { Public } from '../auth/public.decorator';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { JwtPayload, UserType } from '../auth/auth.service';

@Controller('contratos')
@RequireModule(ModuloSistema.CONTRATOS)
export class ContratosController {
  constructor(
    private readonly contratosService: ContratosService,
    private readonly uploadService: UploadService,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    @InjectRepository(AnexoMedicao)
    private readonly anexoRepository: Repository<AnexoMedicao>,
    @InjectRepository(Medicao)
    private readonly medicaoRepository: Repository<Medicao>,
  ) {}

  // ============ CRUD CONTRATOS ============

  @Post()
  async criar(@Body() dados: Partial<Contrato>) {
    return this.contratosService.criar(dados);
  }

  @Post('importar')
  async importarContratos(
    @Req() request: { user: JwtPayload },
    @Body() body: { orgaoId?: string; contratos: any[] }
  ) {
    const orgaoId = request.user.type === UserType.ADMIN ? (body.orgaoId || '') : this.getOrgaoId(request.user);
    if (!orgaoId || !body.contratos || !Array.isArray(body.contratos)) {
      throw new BadRequestException('Dados inválidos. Envie contratos (array).');
    }
    return this.contratosService.importarContratos(orgaoId, body.contratos);
  }

  @Post('licitacao/:licitacaoId')
  async criarAPartirDaLicitacao(
    @Param('licitacaoId') licitacaoId: string,
    @Body() dados: Partial<Contrato>
  ) {
    return this.contratosService.criarAPartirDaLicitacao(licitacaoId, dados);
  }

  @Get()
  async findAll(
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
    @Query('fornecedorId') fornecedorIdParam?: string,
    @Query('status') status?: StatusContrato,
    @Query('tipo') tipo?: TipoContrato,
    @Query('ano') ano?: string,
    @Query('vigentes') vigentes?: string
  ) {
    // Fornecedor: lista apenas seus contratos (fornecedorId = sub do JWT)
    if (request.user.type === UserType.FORNECEDOR) {
      const fornecedorId = request.user.sub;
      return this.contratosService.findAll({
        fornecedorId,
        status,
        tipo,
        ano: ano ? parseInt(ano) : undefined,
        vigentes: vigentes === 'true'
      });
    }
    const orgaoId = request.user.type === UserType.ADMIN ? (orgaoIdParam || '') : this.getOrgaoId(request.user);
    return this.contratosService.findAll({
      orgaoId,
      fornecedorId: fornecedorIdParam,
      status,
      tipo,
      ano: ano ? parseInt(ano) : undefined,
      vigentes: vigentes === 'true'
    });
  }

  @Get('estatisticas/status')
  async estatisticasPorStatus(
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    const orgaoId = request.user.type === UserType.ADMIN ? (orgaoIdParam || '') : this.getOrgaoId(request.user);
    return this.contratosService.contarPorStatus(orgaoId);
  }

  @Get('estatisticas/a-vencer')
  async contratosAVencer(
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
    @Query('dias') dias?: string
  ) {
    const orgaoId = request.user.type === UserType.ADMIN ? (orgaoIdParam || '') : this.getOrgaoId(request.user);
    return this.contratosService.contratosAVencer(orgaoId, dias ? parseInt(dias) : 30);
  }

  @Get('estatisticas/valor-total')
  async valorTotal(
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
    @Query('ano') ano?: string
  ) {
    const orgaoId = request.user.type === UserType.ADMIN ? (orgaoIdParam || '') : this.getOrgaoId(request.user);
    const valor = await this.contratosService.valorTotalContratado(
      orgaoId,
      ano ? parseInt(ano) : undefined
    );
    return { valor_total: valor };
  }

  @Get('estatisticas/valores')
  async estatisticasValores(
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    const orgaoId = request.user.type === UserType.ADMIN ? (orgaoIdParam || '') : this.getOrgaoId(request.user);
    if (!orgaoId) {
      throw new BadRequestException('orgaoId é obrigatório para usuários admin');
    }
    return this.contratosService.getEstatisticasValores(orgaoId);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const contrato = await this.contratosService.findOne(id);
    this.validarPropriedade(request.user, contrato.orgao_id);
    return contrato;
  }

  @Get('numero/:numero')
  async findByNumero(
    @Param('numero') numero: string,
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    const orgaoId = request.user.type === UserType.ADMIN ? (orgaoIdParam || '') : this.getOrgaoId(request.user);
    return this.contratosService.findByNumero(numero, orgaoId);
  }

  @Put(':id')
  async atualizar(
    @Param('id') id: string,
    @Body() dados: Partial<Contrato>,
    @Req() request: { user: JwtPayload },
  ) {
    const contrato = await this.contratosService.findOne(id);
    this.validarPropriedade(request.user, contrato.orgao_id);
    const userName = await this.resolveUserName(request.user);
    return this.contratosService.atualizar(id, dados, request.user.sub, userName);
  }

  @Patch(':id/status')
  async alterarStatus(
    @Param('id') id: string,
    @Body('status') status: StatusContrato,
    @Req() request: { user: JwtPayload },
  ) {
    const contrato = await this.contratosService.findOne(id);
    this.validarPropriedade(request.user, contrato.orgao_id);
    const userName = await this.resolveUserName(request.user);
    return this.contratosService.alterarStatus(id, status, request.user.sub, userName);
  }

  // ============ LIBERAÇÃO DE CONTRATOS ============

  @Post(':id/liberar')
  async liberarContrato(
    @Param('id') id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const contrato = await this.contratosService.findOne(id);
    this.validarPropriedade(request.user, contrato.orgao_id);

    // Verifica permissão: órgão (login direto) pode liberar, ou usuário com permissão
    if (request.user.type === UserType.USUARIO) {
      const usuario = await this.usuarioRepository.findOne({ where: { id: request.user.sub } });
      if (!usuario?.pode_liberar_contratos) {
        throw new ForbiddenException('Você não tem permissão para liberar contratos');
      }
      return this.contratosService.liberarContrato(id, usuario.id, usuario.nome);
    }

    // Órgão ou Admin podem liberar diretamente
    const nome = request.user.type === UserType.ADMIN ? 'Administrador' : 'Órgão';
    return this.contratosService.liberarContrato(id, request.user.sub, nome);
  }

  @Post(':id/rejeitar-liberacao')
  async rejeitarLiberacao(
    @Param('id') id: string,
    @Body('motivo') motivo: string,
    @Req() request: { user: JwtPayload },
  ) {
    const contrato = await this.contratosService.findOne(id);
    this.validarPropriedade(request.user, contrato.orgao_id);

    // Mesma verificação de permissão
    if (request.user.type === UserType.USUARIO) {
      const usuario = await this.usuarioRepository.findOne({ where: { id: request.user.sub } });
      if (!usuario?.pode_liberar_contratos) {
        throw new ForbiddenException('Você não tem permissão para rejeitar liberação de contratos');
      }
    }

    const userName = await this.resolveUserName(request.user);
    return this.contratosService.rejeitarLiberacao(id, motivo, request.user.sub, userName);
  }

  // ============ HISTÓRICO ============

  @Get(':id/historico')
  async listarHistorico(
    @Param('id') id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const contrato = await this.contratosService.findOne(id);
    this.validarPropriedade(request.user, contrato.orgao_id);
    return this.contratosService.listarHistorico(id);
  }

  // ============ AJUSTE DE MIGRAÇÃO ============

  @Patch(':id/ajuste-migracao')
  async ajusteMigracao(
    @Param('id') id: string,
    @Body() body: { valor_executado_anterior: number; observacao_ajuste: string },
    @Req() request: { user: JwtPayload },
  ) {
    if (request.user.type === UserType.USUARIO) {
      const usuario = await this.usuarioRepository.findOne({ where: { id: request.user.sub } });
      if (!usuario?.pode_liberar_contratos) {
        throw new ForbiddenException('Você não tem permissão para realizar ajustes de migração');
      }
    } else if (request.user.type !== UserType.ADMIN && request.user.type !== UserType.ORGAO) {
      throw new ForbiddenException('Apenas administradores podem realizar ajustes de migração');
    }
    const contrato = await this.contratosService.findOne(id);
    this.validarPropriedade(request.user, contrato.orgao_id);
    const valor = Number(body.valor_executado_anterior) || 0;
    if (valor < 0) throw new BadRequestException('Valor não pode ser negativo');
    if (valor > Number(contrato.valor_global)) {
      throw new BadRequestException(`Valor executado anterior (R$ ${valor.toFixed(2)}) não pode exceder o valor global do contrato (R$ ${Number(contrato.valor_global).toFixed(2)})`);
    }
    const nome = request.user.type === UserType.ADMIN ? 'Administrador' : request.user.email || request.user.sub;
    return this.contratosService.ajusteMigracao(id, valor, body.observacao_ajuste || '', nome);
  }

  // ============ TERMOS ADITIVOS ============

  @Post(':contratoId/termos')
  async criarTermoAditivo(
    @Param('contratoId') contratoId: string,
    @Body() dados: Partial<TermoAditivo>,
    @Req() request: { user: JwtPayload },
  ) {
    const contrato = await this.contratosService.findOne(contratoId);
    this.validarPropriedade(request.user, contrato.orgao_id);
    return this.contratosService.criarTermoAditivo(contratoId, dados);
  }

  @Get(':contratoId/termos')
  async findTermosAditivos(
    @Param('contratoId') contratoId: string,
    @Req() request: { user: JwtPayload },
  ) {
    const contrato = await this.contratosService.findOne(contratoId);
    this.validarPropriedade(request.user, contrato.orgao_id);
    return this.contratosService.findTermosAditivos(contratoId);
  }

  @Get('termos/:id')
  async findTermoAditivo(@Param('id') id: string) {
    return this.contratosService.findTermoAditivo(id);
  }

  @Patch(':contratoId/termos/:termoId')
  async atualizarTermoAditivo(
    @Param('contratoId') contratoId: string,
    @Param('termoId') termoId: string,
    @Body() dados: Partial<TermoAditivo>,
    @Req() request: { user: JwtPayload },
  ) {
    const contrato = await this.contratosService.findOne(contratoId);
    this.validarPropriedade(request.user, contrato.orgao_id);
    return this.contratosService.atualizarTermoAditivo(contratoId, termoId, dados);
  }

  @Patch(':contratoId/termos/:termoId/cancelar')
  async cancelarTermoAditivo(
    @Param('contratoId') contratoId: string,
    @Param('termoId') termoId: string,
    @Req() request: { user: JwtPayload },
  ) {
    const contrato = await this.contratosService.findOne(contratoId);
    this.validarPropriedade(request.user, contrato.orgao_id);
    return this.contratosService.cancelarTermoAditivo(contratoId, termoId);
  }

  @Delete(':contratoId/termos/:termoId')
  async excluirTermoAditivo(
    @Param('contratoId') contratoId: string,
    @Param('termoId') termoId: string,
    @Req() request: { user: JwtPayload },
  ) {
    const contrato = await this.contratosService.findOne(contratoId);
    this.validarPropriedade(request.user, contrato.orgao_id);
    return this.contratosService.excluirTermoAditivo(contratoId, termoId);
  }

  // ============ DOCUMENTOS DO CONTRATO ============

  @Post(':contratoId/documentos')
  @UseInterceptors(FileInterceptor('arquivo'))
  async uploadDocumento(
    @Param('contratoId') contratoId: string,
    @UploadedFile() arquivo: Express.Multer.File,
    @Body() body: { titulo: string; tipo?: TipoDocumentoContrato; descricao?: string; termo_aditivo_id?: string },
    @Req() request: { user: JwtPayload },
  ) {
    const contrato = await this.contratosService.findOne(contratoId);
    this.validarPropriedade(request.user, contrato.orgao_id);
    return this.contratosService.uploadDocumentoContrato(contratoId, arquivo, {
      titulo: body.titulo,
      tipo: body.tipo,
      descricao: body.descricao,
      termo_aditivo_id: body.termo_aditivo_id,
    });
  }

  @Get(':contratoId/documentos')
  async listarDocumentos(
    @Param('contratoId') contratoId: string,
    @Req() request: { user: JwtPayload },
  ) {
    const contrato = await this.contratosService.findOne(contratoId);
    this.validarPropriedade(request.user, contrato.orgao_id);
    return this.contratosService.listarDocumentosContrato(contratoId);
  }

  @Get(':contratoId/documentos/:docId/download')
  async downloadDocumento(
    @Param('contratoId') contratoId: string,
    @Param('docId') docId: string,
    @Res() res: Response,
    @Req() request: { user: JwtPayload },
  ) {
    const contrato = await this.contratosService.findOne(contratoId);
    this.validarPropriedade(request.user, contrato.orgao_id);
    const { buffer, documento } = await this.contratosService.getDocumentoContratoArquivo(docId);
    if (documento.contrato_id !== contratoId) {
      throw new NotFoundException('Documento não pertence a este contrato');
    }
    res.set({
      'Content-Type': documento.mime_type,
      'Content-Disposition': `attachment; filename="${documento.nome_original}"`,
      'Content-Length': buffer.length,
    });
    res.status(HttpStatus.OK).send(buffer);
  }

  @Delete(':contratoId/documentos/:docId')
  async excluirDocumento(
    @Param('contratoId') contratoId: string,
    @Param('docId') docId: string,
    @Req() request: { user: JwtPayload },
  ) {
    const contrato = await this.contratosService.findOne(contratoId);
    this.validarPropriedade(request.user, contrato.orgao_id);
    const docs = await this.contratosService.listarDocumentosContrato(contratoId);
    const doc = docs.find((d) => d.id === docId);
    if (!doc) throw new NotFoundException('Documento não encontrado');
    await this.contratosService.deleteDocumentoContrato(docId);
    return { message: 'Documento excluído com sucesso' };
  }

  // ============ HELPERS ============

  private async resolveUserName(user: JwtPayload): Promise<string> {
    if (user.type === UserType.ADMIN) return 'Administrador';
    if (user.type === UserType.ORGAO) return 'Órgão';
    if (user.type === UserType.USUARIO) {
      const usuario = await this.usuarioRepository.findOne({ where: { id: user.sub } });
      return usuario?.nome || 'Usuário';
    }
    return 'Sistema';
  }

  private getOrgaoId(user: JwtPayload): string {
    if (user.type === UserType.ORGAO) return user.sub;
    if (user.type === UserType.ADMIN) return ''; // Admin acessa tudo
    const orgaoId = user.orgaoId || (user as any).orgao_id;
    if (orgaoId) return orgaoId;
    throw new ForbiddenException('Órgão não identificado');
  }

  private validarPropriedade(user: JwtPayload, orgaoIdRecurso: string): void {
    if (user.type === UserType.ADMIN) return; // Admin acessa tudo
    const orgaoId = this.getOrgaoId(user);
    if (orgaoId !== orgaoIdRecurso) {
      throw new ForbiddenException('Você não tem permissão para acessar este recurso');
    }
  }

  /**
   * Valida que uma medição pertence a um contrato do órgão do usuário logado.
   */
  private async validarPropriedadeMedicao(user: JwtPayload, medicaoId: string): Promise<void> {
    if (user.type === UserType.ADMIN) return;
    const medicao = await this.medicaoRepository.findOne({
      where: { id: medicaoId },
      relations: ['contrato'],
    });
    if (!medicao) throw new NotFoundException('Medição não encontrada');
    if (medicao.contrato?.orgao_id) {
      this.validarPropriedade(user, medicao.contrato.orgao_id);
    }
  }

  // ============ ENDPOINTS PÚBLICOS ============

  // ============ ANEXOS DE MEDIÇÃO ============

  /**
   * Lista anexos (fotos/documentos) de uma medição.
   * Valida que a medição pertence a um contrato do órgão do usuário.
   * GET /api/contratos/medicoes/:medicaoId/anexos
   */
  @Get('medicoes/:medicaoId/anexos')
  async listarAnexosMedicao(
    @Param('medicaoId') medicaoId: string,
    @Req() request: { user: JwtPayload },
  ) {
    // Validar que a medição pertence ao órgão do usuário
    await this.validarPropriedadeMedicao(request.user, medicaoId);

    return this.anexoRepository.find({
      where: { medicao_id: medicaoId },
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Órgão exclui um anexo de medição (qualquer status).
   * Valida propriedade via órgão do contrato.
   * DELETE /api/contratos/medicoes/anexos/:anexoId
   */
  @Delete('medicoes/anexos/:anexoId')
  async excluirAnexoMedicao(
    @Param('anexoId') anexoId: string,
    @Req() request: { user: JwtPayload },
  ) {
    const anexo = await this.anexoRepository.findOne({
      where: { id: anexoId },
      relations: ['medicao', 'medicao.contrato'],
    });
    if (!anexo) throw new NotFoundException('Anexo não encontrado');

    // Validar que o anexo pertence ao órgão do usuário
    if (anexo.medicao?.contrato?.orgao_id) {
      this.validarPropriedade(request.user, anexo.medicao.contrato.orgao_id);
    }

    // Excluir arquivo físico
    const pastaUpload = `medicoes/${anexo.medicao_id}`;
    this.uploadService.deleteFile(pastaUpload, anexo.nome_arquivo);

    // Excluir registro
    await this.anexoRepository.remove(anexo);
    return { success: true, message: 'Anexo excluído pelo órgão' };
  }

  // ============ ROTAS PÚBLICAS ============

  @Public()
  @Get('publicos/lista')
  async listarPublicos(
    @Query('orgaoId') orgaoId?: string,
    @Query('fornecedorCnpj') fornecedorCnpj?: string,
    @Query('ano') ano?: string,
    @Query('vigentes') vigentes?: string
  ) {
    return this.contratosService.findPublicos({
      orgaoId,
      fornecedorCnpj,
      ano: ano ? parseInt(ano) : undefined,
      vigentes: vigentes === 'true'
    });
  }

  @Public()
  @Get('publicos/:id')
  async findPublicoById(@Param('id') id: string) {
    return this.contratosService.findPublicoById(id);
  }
}
