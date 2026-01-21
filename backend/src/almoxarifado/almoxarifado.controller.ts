import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  Query,
  Req,
  Res,
  ValidationPipe,
  ParseUUIDPipe,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { JwtPayload, UserType } from '../auth/auth.service';
import { RequisicaoService } from './requisicao.service';
import { ItemContratoService } from './item-contrato.service';
import { OrdemFornecimentoService } from './ordem-fornecimento.service';
import { RecebimentoService } from './recebimento.service';
import { ConfiguracaoAprovacaoService } from './configuracao-aprovacao.service';
import { PdfOrdemService } from './pdf-ordem.service';
import { CriarConfiguracaoAprovacaoDto, AtualizarConfiguracaoAprovacaoDto } from './dto/configuracao-aprovacao.dto';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { TipoAprovador } from './entities/configuracao-aprovacao.entity';
import { GerarOrdemDto, CriarRecebimentoDto, AceitarRecebimentoDto } from './dto/ordem-fornecimento.dto';
import { 
  CriarRequisicaoDto, 
  AtualizarRequisicaoDto,
  AutorizarRequisicaoDto,
  NegarRequisicaoDto,
} from './dto/criar-requisicao.dto';
import { CriarItemContratoDto, AtualizarItemContratoDto } from './dto/criar-item-contrato.dto';
import { StatusRequisicao } from './entities/requisicao.entity';
import { StatusOrdemFornecimento } from './entities/ordem-fornecimento.entity';
import { StatusRecebimento } from './entities/recebimento.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { OrdemFornecimento } from './entities/ordem-fornecimento.entity';
import { MigracaoContratosService, ResultadoImportacao } from './migracao-contratos.service';
import { DadosContratoMigracaoDto } from './dto/migracao-contrato.dto';
import { UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';

@Controller('almoxarifado')
@RequireModule(ModuloSistema.ALMOXARIFADO)
export class AlmoxarifadoController {
  private readonly logger = new Logger(AlmoxarifadoController.name);

  constructor(
    private readonly requisicaoService: RequisicaoService,
    private readonly itemContratoService: ItemContratoService,
    private readonly ordemService: OrdemFornecimentoService,
    private readonly recebimentoService: RecebimentoService,
    private readonly configAprovacaoService: ConfiguracaoAprovacaoService,
    private readonly pdfOrdemService: PdfOrdemService,
    private readonly notificacoesService: NotificacoesService,
    private readonly migracaoContratosService: MigracaoContratosService,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    @InjectRepository(OrdemFornecimento)
    private readonly ordemRepository: Repository<OrdemFornecimento>,
  ) {}

  // ============================================================================
  // ITENS DO CONTRATO
  // ============================================================================

  @Get('contratos/:contratoId/itens')
  async listarItensContrato(@Param('contratoId', ParseUUIDPipe) contratoId: string) {
    return this.itemContratoService.findByContrato(contratoId);
  }

  @Get('contratos/:contratoId/itens/disponiveis')
  async listarItensComSaldo(@Param('contratoId', ParseUUIDPipe) contratoId: string) {
    return this.itemContratoService.findComSaldoDisponivel(contratoId);
  }

  @Get('contratos/:contratoId/saldos')
  async getResumoSaldos(@Param('contratoId', ParseUUIDPipe) contratoId: string) {
    return this.itemContratoService.getResumoSaldos(contratoId);
  }

  @Post('contratos/:contratoId/itens')
  async criarItemContrato(
    @Param('contratoId', ParseUUIDPipe) contratoId: string,
    @Body(new ValidationPipe()) dto: CriarItemContratoDto,
  ) {
    return this.itemContratoService.criar({ ...dto, contrato_id: contratoId });
  }

  @Post('contratos/:contratoId/itens/lote')
  async criarItensEmLote(
    @Param('contratoId', ParseUUIDPipe) contratoId: string,
    @Body(new ValidationPipe()) itens: CriarItemContratoDto[],
  ) {
    return this.itemContratoService.criarEmLote(contratoId, itens);
  }

  @Get('itens-contrato/:id')
  async getItemContrato(@Param('id', ParseUUIDPipe) id: string) {
    return this.itemContratoService.findOne(id);
  }

  @Put('itens-contrato/:id')
  async atualizarItemContrato(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationPipe()) dto: AtualizarItemContratoDto,
  ) {
    return this.itemContratoService.atualizar(id, dto);
  }

  @Delete('itens-contrato/:id')
  async removerItemContrato(@Param('id', ParseUUIDPipe) id: string) {
    await this.itemContratoService.remover(id);
    return { message: 'Item removido com sucesso' };
  }

  // ============================================================================
  // REQUISIÇÕES
  // ============================================================================

  @Get('requisicoes')
  async listarRequisicoes(
    @Req() request: { user: JwtPayload },
    @Query('status') status?: StatusRequisicao,
    @Query('contratoId') contratoId?: string,
    @Query('setor') setor?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.requisicaoService.findAll({
      orgaoId,
      status,
      contratoId,
      setor,
    });
  }

  @Get('requisicoes/pendentes')
  async listarPendentesAutorizacao(@Req() request: { user: JwtPayload }) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.requisicaoService.findPendentesAutorizacao(orgaoId);
  }

  @Get('requisicoes/estatisticas')
  async getEstatisticasRequisicoes(@Req() request: { user: JwtPayload }) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.requisicaoService.getEstatisticas(orgaoId);
  }

  @Get('requisicoes/:id')
  async getRequisicao(@Param('id', ParseUUIDPipe) id: string) {
    return this.requisicaoService.findOne(id);
  }

  @Post('requisicoes')
  async criarRequisicao(
    @Req() request: { user: JwtPayload },
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: CriarRequisicaoDto,
  ) {
    const user = request.user;
    const orgaoId = this.getOrgaoId(user);
    
    return this.requisicaoService.criar(
      orgaoId,
      dto,
      user.sub,
      user.email || 'Usuário',
      user.email,
    );
  }

  @Put('requisicoes/:id')
  async atualizarRequisicao(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationPipe()) dto: AtualizarRequisicaoDto,
  ) {
    return this.requisicaoService.atualizar(id, dto);
  }

  @Post('requisicoes/:id/enviar')
  async enviarParaAutorizacao(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    
    // Busca usuários do órgão com permissão de aprovação
    const usuariosAprovadores = await this.usuarioRepository.find({
      where: {
        orgao_id: orgaoId,
        pode_aprovar_requisicoes: true,
        ativo: true,
      },
      select: ['id', 'email', 'role'],
    });

    // Converte para o formato esperado pelo service
    const usuariosOrgao = usuariosAprovadores.map(u => ({
      id: u.id,
      perfil: u.role || 'USUARIO',
      email: u.email || undefined,
    }));

    return this.requisicaoService.enviarParaAutorizacao(id, usuariosOrgao);
  }

  @Post('requisicoes/:id/autorizar')
  async autorizarRequisicao(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @Body(new ValidationPipe()) dto: AutorizarRequisicaoDto,
  ) {
    const user = request.user;
    return this.requisicaoService.autorizar(
      id,
      dto,
      user.sub,
      user.email || 'Autorizador',
    );
  }

  @Post('requisicoes/:id/negar')
  async negarRequisicao(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @Body(new ValidationPipe()) dto: NegarRequisicaoDto,
  ) {
    const user = request.user;
    return this.requisicaoService.negar(
      id,
      dto,
      user.sub,
      user.email || 'Autorizador',
    );
  }

  @Post('requisicoes/:id/cancelar')
  async cancelarRequisicao(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('motivo') motivo: string,
  ) {
    return this.requisicaoService.cancelar(id, motivo || 'Cancelado pelo usuário');
  }

  // ============================================================================
  // ORDENS DE FORNECIMENTO
  // ============================================================================

  @Get('ordens')
  async listarOrdens(
    @Req() request: { user: JwtPayload },
    @Query('status') status?: StatusOrdemFornecimento,
    @Query('contratoId') contratoId?: string,
    @Query('fornecedorId') fornecedorId?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.ordemService.findAll({
      orgaoId,
      status,
      contratoId,
      fornecedorId,
    });
  }

  @Get('ordens/pendentes-envio')
  async listarPendentesEnvio(@Req() request: { user: JwtPayload }) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.ordemService.findPendentesEnvio(orgaoId);
  }

  @Get('ordens/em-andamento')
  async listarEmAndamento(@Req() request: { user: JwtPayload }) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.ordemService.findEmAndamento(orgaoId);
  }

  @Get('ordens/estatisticas')
  async getEstatisticasOrdens(@Req() request: { user: JwtPayload }) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.ordemService.getEstatisticas(orgaoId);
  }

  @Get('ordens/:id')
  async getOrdem(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordemService.findOne(id);
  }

  @Post('ordens/gerar')
  async gerarOrdem(
    @Req() request: { user: JwtPayload },
    @Body(new ValidationPipe()) dto: GerarOrdemDto,
  ) {
    const user = request.user;
    return this.ordemService.gerarOrdem(
      dto,
      user.sub,
      user.email || 'Usuário',
    );
  }

  @Post('ordens/:id/enviar')
  async enviarOrdem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('email_fornecedor') emailFornecedor?: string,
    @Body('observacoes') observacoes?: string,
  ) {
    return this.ordemService.enviarOrdem(id, emailFornecedor, observacoes);
  }

  @Post('ordens/:id/cancelar')
  async cancelarOrdem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('motivo') motivo: string,
  ) {
    return this.ordemService.cancelarOrdem(id, motivo || 'Cancelada pelo usuário');
  }

  @Get('ordens/:id/pdf')
  async gerarPdfOrdem(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    try {
      const ordem = await this.ordemService.findOne(id);
      
      // Se já tem PDF gerado, retorna ele
      if (ordem.caminho_pdf && fs.existsSync(ordem.caminho_pdf)) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="ordem_${ordem.numero.replace(/\//g, '_')}.pdf"`);
        return res.sendFile(path.resolve(ordem.caminho_pdf));
      }
      
      // Gera novo PDF
      const caminhoPdf = await this.pdfOrdemService.gerarPdf(id);
      
      // Atualiza ordem com caminho do PDF
      await this.ordemRepository.update(id, { caminho_pdf: caminhoPdf });
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="ordem_${ordem.numero.replace(/\//g, '_')}.pdf"`);
      return res.sendFile(path.resolve(caminhoPdf));
    } catch (error) {
      this.logger.error(`Erro ao gerar PDF da ordem: ${error.message}`);
      throw error;
    }
  }

  // ============================================================================
  // RECEBIMENTOS
  // ============================================================================

  @Get('recebimentos')
  async listarRecebimentos(
    @Req() request: { user: JwtPayload },
    @Query('status') status?: StatusRecebimento,
    @Query('ordemId') ordemId?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.recebimentoService.findAll({
      orgaoId,
      status,
      ordemId,
    });
  }

  @Get('recebimentos/pendentes-conferencia')
  async listarPendentesConferencia(@Req() request: { user: JwtPayload }) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.recebimentoService.findPendentesConferencia(orgaoId);
  }

  @Get('recebimentos/pendentes-aceite')
  async listarPendentesAceite(@Req() request: { user: JwtPayload }) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.recebimentoService.findPendentesAceite(orgaoId);
  }

  @Get('recebimentos/:id')
  async getRecebimento(@Param('id', ParseUUIDPipe) id: string) {
    return this.recebimentoService.findOne(id);
  }

  @Post('recebimentos')
  async criarRecebimento(
    @Req() request: { user: JwtPayload },
    @Body(new ValidationPipe()) dto: CriarRecebimentoDto,
  ) {
    const user = request.user;
    const orgaoId = this.getOrgaoId(user);
    return this.recebimentoService.criar(
      orgaoId,
      dto,
      user.sub,
      user.email || 'Usuário',
    );
  }

  @Post('recebimentos/:id/conferir')
  async conferirRecebimento(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const user = request.user;
    return this.recebimentoService.conferir(
      id,
      user.sub,
      user.email || 'Conferente',
    );
  }

  @Post('recebimentos/:id/aceitar')
  async aceitarRecebimento(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @Body(new ValidationPipe()) dto: AceitarRecebimentoDto,
  ) {
    const user = request.user;
    return this.recebimentoService.aceitar(
      id,
      dto,
      user.sub,
      user.email || 'Fiscal',
    );
  }

  @Post('recebimentos/:id/rejeitar')
  async rejeitarRecebimento(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('motivo') motivo: string,
  ) {
    return this.recebimentoService.rejeitar(id, motivo);
  }

  // ============================================================================
  // CONFIGURAÇÃO DE APROVAÇÃO
  // ============================================================================

  @Get('configuracoes/aprovacao')
  async listarConfiguracoesAprovacao(
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    // Admin pode passar orgaoId como parâmetro, usuário comum usa seu próprio órgão
    const orgaoId = orgaoIdParam || this.getOrgaoId(request.user);
    return this.configAprovacaoService.listar(orgaoId);
  }

  @Post('configuracoes/aprovacao')
  async criarConfiguracaoAprovacao(
    @Req() request: { user: JwtPayload },
    @Body(new ValidationPipe()) dto: CriarConfiguracaoAprovacaoDto,
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    const orgaoId = orgaoIdParam || this.getOrgaoId(request.user);
    return this.configAprovacaoService.criar(orgaoId, dto);
  }

  @Put('configuracoes/aprovacao/:id')
  async atualizarConfiguracaoAprovacao(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @Body(new ValidationPipe()) dto: AtualizarConfiguracaoAprovacaoDto,
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    const orgaoId = orgaoIdParam || this.getOrgaoId(request.user);
    return this.configAprovacaoService.atualizar(id, orgaoId, dto);
  }

  @Delete('configuracoes/aprovacao/:id')
  async desativarConfiguracaoAprovacao(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    const orgaoId = orgaoIdParam || this.getOrgaoId(request.user);
    await this.configAprovacaoService.desativar(id, orgaoId);
    return { success: true };
  }

  @Post('configuracoes/aprovacao/padrao')
  async criarConfiguracaoPadrao(
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    const orgaoId = orgaoIdParam || this.getOrgaoId(request.user);
    return this.configAprovacaoService.criarConfiguracaoPadrao(orgaoId);
  }

  @Get('configuracoes/aprovacao/tipos-aprovador')
  async listarTiposAprovador() {
    return {
      tipos: Object.values(TipoAprovador),
      descricoes: {
        [TipoAprovador.QUALQUER_USUARIO]: 'Qualquer usuário com acesso ao módulo',
        [TipoAprovador.PERFIL_ESPECIFICO]: 'Usuários com perfil específico',
        [TipoAprovador.USUARIO_ESPECIFICO]: 'Usuários específicos',
        [TipoAprovador.GESTOR_SETOR]: 'Gestor do setor solicitante',
      },
    };
  }

  @Post('requisicoes/:id/verificar-permissao-aprovacao')
  async verificarPermissaoAprovacao(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const user = request.user;
    const orgaoId = this.getOrgaoId(user);
    
    const requisicao = await this.requisicaoService.findOne(id);
    
    return this.configAprovacaoService.verificarPermissaoAprovacao(
      orgaoId,
      user.sub,
      (user as any).perfil || 'USUARIO',
      requisicao.usuario_solicitante_id,
      Number(requisicao.valor_total_estimado),
    );
  }

  // ============================================================================
  // MIGRAÇÃO DE CONTRATOS
  // ============================================================================

  @Post('migracao/contratos/importar-csv')
  @UseInterceptors(
    FileInterceptor('arquivo', {
      storage: multer.diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = path.join(process.cwd(), 'uploads', 'migracao');
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `contrato-${uniqueSuffix}${path.extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
          cb(null, true);
        } else {
          cb(new Error('Apenas arquivos CSV são permitidos'), false);
        }
      },
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  async importarContratoCSV(
    @UploadedFile() arquivo: Express.Multer.File,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dadosContrato: DadosContratoMigracaoDto,
    @Req() request: { user: JwtPayload },
  ): Promise<ResultadoImportacao> {
    if (!arquivo) {
      throw new Error('Arquivo CSV é obrigatório');
    }

    const user = request.user;
    const orgaoId = this.getOrgaoId(user);

    const resultado = await this.migracaoContratosService.importarContratoCSV(
      arquivo.path,
      {
        ...dadosContrato,
        data_assinatura: dadosContrato.data_assinatura ? new Date(dadosContrato.data_assinatura) : undefined,
        data_vigencia_inicio: dadosContrato.data_vigencia_inicio ? new Date(dadosContrato.data_vigencia_inicio) : undefined,
        data_vigencia_fim: dadosContrato.data_vigencia_fim ? new Date(dadosContrato.data_vigencia_fim) : undefined,
      },
      orgaoId,
    );

    // Remove arquivo após importação
    try {
      fs.unlinkSync(arquivo.path);
    } catch (error) {
      this.logger.warn(`Erro ao remover arquivo temporário: ${error.message}`);
    }

    return resultado;
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private getOrgaoId(user: JwtPayload): string {
    if (user.type === UserType.ORGAO) {
      return user.sub;
    }
    const orgaoId = user.orgaoId || (user as any).orgao_id;
    if (orgaoId) {
      return orgaoId;
    }
    throw new Error('Órgão não identificado');
  }
}
