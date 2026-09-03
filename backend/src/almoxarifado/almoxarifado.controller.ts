import { 
  Controller, 
  Get, 
  Post, 
  Put,
  Patch,
  Delete, 
  Body, 
  Param, 
  Query,
  Req,
  Res,
  ValidationPipe,
  ParseUUIDPipe,
  Logger,
  BadRequestException,
  ForbiddenException,
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
import { NotaFiscalFornecedorService } from './nota-fiscal-fornecedor.service';
import { MatchingIaService } from './matching-ia.service';
import { DossieService } from './dossie.service';
import { TipoAprovador } from './entities/configuracao-aprovacao.entity';
import { GerarOrdemDto, CriarRecebimentoDto, AceitarRecebimentoDto, EditarOrdemDto, CorrigirDatasOrdemDto } from './dto/ordem-fornecimento.dto';
import { 
  CriarRequisicaoDto, 
  AtualizarRequisicaoDto,
  AutorizarRequisicaoDto,
  NegarRequisicaoDto,
  DevolverRequisicaoDto,
  EnviarAoFornecedorDto,
  CorrigirDataAutorizacaoOSDto,
  CriarOsLoteDto,
} from './dto/criar-requisicao.dto';
import { CriarItemContratoDto, AtualizarItemContratoDto } from './dto/criar-item-contrato.dto';
import { StatusRequisicao } from './entities/requisicao.entity';
import { StatusOrdemFornecimento } from './entities/ordem-fornecimento.entity';
import { StatusRecebimento, Recebimento } from './entities/recebimento.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { OrdemFornecimento } from './entities/ordem-fornecimento.entity';
import { MigracaoContratosService, ResultadoImportacao } from './migracao-contratos.service';
import { DadosContratoMigracaoDto } from './dto/migracao-contrato.dto';
import { UseInterceptors, UploadedFile, UploadedFiles } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
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
    private readonly nfFornecedorService: NotaFiscalFornecedorService,
    private readonly matchingIaService: MatchingIaService,
    private readonly dossieService: DossieService,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    @InjectRepository(OrdemFornecimento)
    private readonly ordemRepository: Repository<OrdemFornecimento>,
  ) {}

  // ============================================================================
  // ITENS DO CONTRATO
  // ============================================================================

  @Get('contratos/:contratoId/itens')
  async listarItensContrato(
    @Param('contratoId', ParseUUIDPipe) contratoId: string,
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    await this.itemContratoService.validarPropriedadeContrato(contratoId, orgaoId);
    return this.itemContratoService.findByContrato(contratoId);
  }

  @Get('contratos/:contratoId/itens/disponiveis')
  async listarItensComSaldo(
    @Param('contratoId', ParseUUIDPipe) contratoId: string,
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    await this.itemContratoService.validarPropriedadeContrato(contratoId, orgaoId);
    return this.itemContratoService.findComSaldoDisponivel(contratoId);
  }

  @Get('contratos/:contratoId/saldos')
  async getResumoSaldos(
    @Param('contratoId', ParseUUIDPipe) contratoId: string,
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    await this.itemContratoService.validarPropriedadeContrato(contratoId, orgaoId);
    return this.itemContratoService.getResumoSaldos(contratoId);
  }

  @Post('contratos/:contratoId/itens')
  async criarItemContrato(
    @Param('contratoId', ParseUUIDPipe) contratoId: string,
    @Body(new ValidationPipe()) dto: CriarItemContratoDto,
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    await this.itemContratoService.validarPropriedadeContrato(contratoId, orgaoId);
    return this.itemContratoService.criar({ ...dto, contrato_id: contratoId });
  }

  @Post('contratos/:contratoId/itens/lote')
  async criarItensEmLote(
    @Param('contratoId', ParseUUIDPipe) contratoId: string,
    @Body(new ValidationPipe()) itens: CriarItemContratoDto[],
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    await this.itemContratoService.validarPropriedadeContrato(contratoId, orgaoId);
    return this.itemContratoService.criarEmLote(contratoId, itens);
  }

  @Get('itens-contrato/:id')
  async getItemContrato(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    await this.itemContratoService.validarPropriedadeItem(id, orgaoId);
    return this.itemContratoService.findOne(id);
  }

  @Put('itens-contrato/:id')
  async atualizarItemContrato(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationPipe()) dto: AtualizarItemContratoDto,
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    await this.itemContratoService.validarPropriedadeItem(id, orgaoId);
    return this.itemContratoService.atualizar(id, dto);
  }

  @Delete('itens-contrato/:id')
  async removerItemContrato(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    await this.itemContratoService.validarPropriedadeItem(id, orgaoId);
    await this.itemContratoService.remover(id);
    return { message: 'Item removido com sucesso' };
  }

  @Post('contratos/:contratoId/itens/importar')
  async importarItensContrato(
    @Param('contratoId', ParseUUIDPipe) contratoId: string,
    @Body() body: { itens: any[] },
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    await this.itemContratoService.validarPropriedadeContrato(contratoId, orgaoId);

    if (!body.itens || !Array.isArray(body.itens) || body.itens.length === 0) {
      throw new BadRequestException('Nenhum item para importar');
    }

    const resultados = { importados: 0, erros: [] as string[] };

    for (let i = 0; i < body.itens.length; i++) {
      const row = body.itens[i];
      try {
        const numero_item = parseInt(row.numero_item) || (i + 1);
        const descricao = (row.descricao || '').trim();
        if (!descricao) {
          resultados.erros.push(`Linha ${i + 1}: Descrição obrigatória`);
          continue;
        }

        const unidadeRaw = (row.unidade_medida || 'UNIDADE').toUpperCase().trim();
        const unidadesValidas = ['UNIDADE','PECA','CAIXA','PACOTE','METRO','METRO_QUADRADO',
          'METRO_CUBICO','LITRO','QUILOGRAMA','TONELADA','HORA','DIARIA','MES','ANO','SERVICO','GLOBAL'];
        const unidadeBase = unidadeRaw.split(/\s+/)[0]; // "CAIXA" de "CAIXA COM 50"
        const unidade = unidadesValidas.includes(unidadeRaw)
          ? unidadeRaw
          : unidadesValidas.includes(unidadeBase) ? unidadeBase : 'UNIDADE';

        const valor_unitario = parseFloat(String(row.valor_unitario || '0').replace(',', '.'));
        const quantidade = parseFloat(String(row.quantidade_contratada || '0').replace(',', '.'));

        const tipoItemRaw = (row.tipo_item || 'CONSUMO').toUpperCase().trim();
        const tipo_item = ['CONSUMO', 'PERMANENTE'].includes(tipoItemRaw) ? tipoItemRaw : undefined;

        // Saída de migração: quantidade já consumida/entregue no sistema anterior
        const saida = parseFloat(String(row.saida || '0').replace(',', '.')) || 0;

        if (valor_unitario <= 0 || quantidade <= 0) {
          resultados.erros.push(`Linha ${i + 1} (${descricao}): Valor unitário e quantidade devem ser maiores que zero`);
          continue;
        }

        if (saida < 0 || saida > quantidade) {
          resultados.erros.push(`Linha ${i + 1} (${descricao}): Saída (${saida}) não pode ser negativa ou maior que Quantidade (${quantidade})`);
          continue;
        }

        const marca = (row.marca || '').trim() || undefined;

        const itemCriado = await this.itemContratoService.criar({
          contrato_id: contratoId,
          numero_item,
          descricao,
          marca,
          descricao_detalhada: (row.descricao_detalhada || '').trim() || undefined,
          unidade_medida: unidade as any,
          valor_unitario,
          quantidade_contratada: quantidade,
          tipo_item: tipo_item as any,
          codigo_catalogo: (row.codigo_catalogo || '').trim() || undefined,
          codigo_catalogo_proprio: (row.codigo_catalogo_proprio || '').trim() || undefined,
          lote_numero: row.lote_numero ? parseInt(row.lote_numero) : undefined,
          lote_descricao: (row.lote_descricao || '').trim() || undefined,
          observacoes: (row.observacoes || '').trim() || undefined,
        });

        // Se houver saída de migração, atualiza quantidade_entregue e saldo
        if (saida > 0) {
          await this.itemContratoService.atualizar(itemCriado.id, { quantidade_ja_utilizada: saida });
        }

        resultados.importados++;
      } catch (err) {
        resultados.erros.push(`Linha ${i + 1}: ${err.message || 'Erro desconhecido'}`);
      }
    }

    return resultados;
  }

  @Delete('contratos/:contratoId/itens')
  async removerTodosItensContrato(
    @Param('contratoId', ParseUUIDPipe) contratoId: string,
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.itemContratoService.removerTodosDoContrato(contratoId, orgaoId);
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

  /** Quantidade comprometida por item de cronograma (OS parciais ativas), para a tela de nova OS exibir o saldo real. Retorna { [item_cronograma_id]: quantidade }. */
  @Get('requisicoes/comprometido-os/:contratoId')
  async getComprometidoOS(
    @Param('contratoId', ParseUUIDPipe) contratoId: string,
    @Query('excluirRequisicaoId') excluirRequisicaoId?: string,
  ) {
    const mapa = await this.requisicaoService.somarQuantidadeComprometidaPorItemOS(
      contratoId,
      excluirRequisicaoId,
    );
    return Object.fromEntries(mapa);
  }

  @Get('requisicoes/:id')
  async getRequisicao(@Param('id', ParseUUIDPipe) id: string) {
    return this.requisicaoService.findOne(id);
  }

  @Get('requisicoes/:id/historico')
  async getHistoricoRequisicao(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    await this.requisicaoService.validarOrgaoRequisicao(id, orgaoId);
    return this.requisicaoService.getHistoricoRequisicao(id);
  }

  // --- Itens Avulsos (pós-NF) ---

  @Post('requisicoes/:id/itens-avulsos')
  async adicionarItemAvulso(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: { descricao: string; quantidade: number; valor_unitario: number },
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    await this.requisicaoService.validarOrgaoRequisicao(id, orgaoId);
    return this.requisicaoService.adicionarItemAvulso(id, dados);
  }

  @Delete('requisicoes/:id/itens-avulsos/:itemId')
  async removerItemAvulso(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    await this.requisicaoService.validarOrgaoRequisicao(id, orgaoId);
    return this.requisicaoService.removerItemAvulso(id, itemId);
  }

  @Get('requisicoes/:id/itens-avulsos')
  async listarItensAvulsos(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    await this.requisicaoService.validarOrgaoRequisicao(id, orgaoId);
    return this.requisicaoService.listarItensAvulsos(id);
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

  // --- Criação EM LOTE de OS mensais parciais (uma OS por contrato) ---
  @Post('requisicoes/lote-os')
  async criarOsLote(
    @Req() request: { user: JwtPayload },
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: CriarOsLoteDto,
  ) {
    const user = request.user;
    const orgaoId = this.getOrgaoId(user);

    // Busca usuários do órgão com permissão de aprovação (mesmo padrão do envio individual)
    const usuariosAprovadores = await this.usuarioRepository.find({
      where: { orgao_id: orgaoId, pode_aprovar_requisicoes: true, ativo: true },
      select: ['id', 'email', 'role', 'telefone'],
    });
    const usuariosOrgao = usuariosAprovadores.map(u => ({
      id: u.id,
      perfil: u.role || 'USUARIO',
      email: u.email || undefined,
      telefone: u.telefone || undefined,
    }));

    return this.requisicaoService.criarOsMensalEmLote(
      orgaoId,
      dto,
      user.sub,
      user.email || 'Usuário',
      user.email,
      usuariosOrgao,
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
      select: ['id', 'email', 'role', 'telefone'],
    });

    // Converte para o formato esperado pelo service
    const usuariosOrgao = usuariosAprovadores.map(u => ({
      id: u.id,
      perfil: u.role || 'USUARIO',
      email: u.email || undefined,
      telefone: u.telefone || undefined,
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

  @Post('requisicoes/:id/enviar-ao-fornecedor')
  async enviarAoFornecedor(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @Body(new ValidationPipe({ whitelist: true })) dto?: EnviarAoFornecedorDto,
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    await this.requisicaoService.validarOrgaoRequisicao(id, orgaoId);
    return this.requisicaoService.enviarAoFornecedor(id, dto);
  }

  @Post('requisicoes/:id/regenerar-pdf')
  async regenerarPdfOS(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    await this.requisicaoService.validarOrgaoRequisicao(id, orgaoId);
    return this.requisicaoService.regenerarPdf(id, request.user.sub, request.user.email || 'Sistema');
  }

  @Patch('requisicoes/:id/data-autorizacao')
  async corrigirDataAutorizacaoOS(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @Body(new ValidationPipe({ whitelist: true })) dto: CorrigirDataAutorizacaoOSDto,
  ) {
    if (request.user.type !== UserType.USUARIO) {
      throw new ForbiddenException('Apenas usuários ADMIN do órgão podem corrigir a data de autorização da OS.');
    }

    const usuario = await this.usuarioRepository.findOne({ where: { id: request.user.sub } });
    if (!usuario || usuario.role !== 'ADMIN' || !usuario.orgao_id) {
      throw new ForbiddenException('Apenas usuários ADMIN do órgão podem corrigir a data de autorização da OS.');
    }

    await this.requisicaoService.validarOrgaoRequisicao(id, usuario.orgao_id);
    return this.requisicaoService.corrigirDataAutorizacaoOS(
      id,
      dto,
      usuario.id,
      usuario.nome || request.user.email || 'Admin',
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

  @Post('requisicoes/:id/devolver')
  async devolverRequisicao(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @Body(new ValidationPipe()) dto: DevolverRequisicaoDto,
  ) {
    const user = request.user;
    return this.requisicaoService.devolver(
      id,
      dto,
      user.sub,
      user.email || 'Autorizador',
    );
  }

  @Get('requisicoes/:id/info-exclusao')
  async obterInfoExclusaoRequisicao(@Param('id', ParseUUIDPipe) id: string) {
    return this.requisicaoService.obterInfoExclusao(id);
  }

  @Get('requisicoes/:id/pdf-assinado')
  async downloadPdfAssinado(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const requisicao = await this.requisicaoService.findOne(id);
    if (!requisicao.pdf_assinado_url) {
      throw new BadRequestException('PDF assinado não disponível para esta requisição');
    }

    const { createReadStream, existsSync } = await import('fs');
    const { join } = await import('path');

    const filePath = requisicao.pdf_assinado_url;
    if (!existsSync(filePath)) {
      throw new BadRequestException('Arquivo PDF não encontrado no servidor');
    }

    const filename = `OS_${requisicao.numero.replace(/\//g, '_')}_assinada.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    createReadStream(filePath).pipe(res as any);
  }

  @Post('requisicoes/:id/cancelar')
  async cancelarRequisicao(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @Body('motivo') motivo: string,
  ) {
    // Verifica se usuário tem permissão para cancelar
    const user = await this.usuarioRepository.findOne({
      where: { id: request.user.sub },
    });

    if (!user) {
      throw new BadRequestException('Usuário não encontrado');
    }

    // Busca requisição para verificar status e obter informações ANTES de cancelar
    const requisicao = await this.requisicaoService.findOne(id);
    const infoExclusaoAntes = await this.requisicaoService.obterInfoExclusao(id);
    
    // Verifica se requer permissão especial (AUTORIZADA ou ORDEM_GERADA)
    const statusRequerPermissao = [
      StatusRequisicao.AUTORIZADA,
      StatusRequisicao.ORDEM_GERADA,
    ];

    const requerPermissaoEspecial = statusRequerPermissao.includes(requisicao.status);

    if (requerPermissaoEspecial && !user.pode_cancelar_estornar) {
      throw new BadRequestException(
        'Você não tem permissão para cancelar requisições aprovadas. ' +
        'Apenas usuários autorizados podem realizar esta ação.'
      );
    }
    
    const requisicaoCancelada = await this.requisicaoService.cancelar(
      id, 
      motivo || 'Cancelado pelo usuário',
      requerPermissaoEspecial
    );
    
    // Monta mensagem informativa sobre o que foi excluído
    let mensagem = 'Requisição cancelada com sucesso. ';
    
    if (infoExclusaoAntes.temOrdem) {
      mensagem += `Ordem de fornecimento ${infoExclusaoAntes.ordemNumero} e ${infoExclusaoAntes.recebimentos.length} recebimento(s) relacionado(s) foram excluídos. `;
    }
    
    if (infoExclusaoAntes.saldoReservado) {
      mensagem += 'Saldo reservado foi liberado no contrato.';
    }
    
    return {
      ...requisicaoCancelada,
      mensagem,
    };
  }

  /**
   * OS autorizada cuja execução foi paga fora do sistema (NF liquidada na
   * contabilidade sem medição): marca como ATENDIDA, consome o saldo dos itens
   * e registra o motivo no histórico. Exige a mesma permissão especial do
   * cancelamento de requisições aprovadas.
   */
  @Post('requisicoes/:id/atender-fora-sistema')
  async atenderRequisicaoForaDoSistema(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @Body('motivo') motivo: string,
  ) {
    const user = await this.usuarioRepository.findOne({
      where: { id: request.user.sub },
    });
    if (!user) {
      throw new BadRequestException('Usuário não encontrado');
    }
    if (!user.pode_cancelar_estornar) {
      throw new BadRequestException(
        'Você não tem permissão para esta ação. Apenas usuários autorizados a cancelar/estornar podem marcar OS como atendida fora do sistema.',
      );
    }
    await this.requisicaoService.validarOrgaoRequisicao(id, this.getOrgaoId(request.user));

    const requisicao = await this.requisicaoService.atenderForaDoSistema(
      id,
      motivo,
      user.id,
      user.nome || user.email,
    );
    return {
      ...requisicao,
      mensagem: 'OS marcada como atendida fora do sistema. O saldo dos itens foi consumido e o motivo ficou registrado no histórico.',
    };
  }

  @Post('requisicoes/:id/reativar')
  async reativarRequisicao(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('motivo') motivo: string,
  ) {
    const requisicaoReativada = await this.requisicaoService.reativar(
      id,
      motivo || 'Reativada pelo usuário'
    );
    
    return {
      ...requisicaoReativada,
      mensagem: `Requisição reativada com sucesso. Status: ${requisicaoReativada.status}. ` +
        (requisicaoReativada.saldo_reservado ? 'Saldo re-reservado no contrato.' : ''),
    };
  }

  @Delete('requisicoes/:id')
  async excluirRequisicao(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const user = await this.usuarioRepository.findOne({ where: { id: request.user.sub } });
    if (!user?.pode_cancelar_estornar) {
      throw new BadRequestException(
        'Voce nao tem permissao para excluir requisicoes. Solicite ao administrador a permissao "Cancelar/Estornar".'
      );
    }
    const resultado = await this.requisicaoService.excluir(id);
    return { 
      message: resultado.mensagem,
      detalhes: resultado.detalhes,
    };
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

  @Get('ordens/dossie-fiscal')
  async listarDossiesFiscal(@Req() request: { user: JwtPayload }) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.dossieService.listarDossiesFiscal(orgaoId, request.user.sub);
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
    @Req() request: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body('email_fornecedor') emailFornecedor?: string,
    @Body('observacoes') observacoes?: string,
  ) {
    const user = request.user;
    return this.ordemService.enviarOrdem(
      id, 
      emailFornecedor, 
      observacoes,
      user.sub,
      user.email || 'Usuário',
    );
  }

  @Post('ordens/:id/enviar-ao-fornecedor')
  async enviarOrdemAoFornecedor(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @Body(new ValidationPipe({ whitelist: true })) dto?: { email_fornecedor?: string; telefone_fornecedor?: string; tipo?: 'email' | 'whatsapp' },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    const ordem = await this.ordemService.findOne(id);
    if (ordem.orgao_id !== orgaoId) {
      throw new ForbiddenException('Ordem não pertence ao seu órgão');
    }
    return this.ordemService.enviarAoFornecedor(id, dto);
  }

  @Post('ordens/:id/reenviar')
  async reenviarOrdem(
    @Req() request: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body('email_fornecedor') emailFornecedor?: string,
    @Body('observacoes') observacoes?: string,
  ) {
    const user = request.user;
    return this.ordemService.reenviarOrdem(
      id, 
      emailFornecedor, 
      observacoes,
      user.sub,
      user.email || 'Usuário',
    );
  }

  @Put('ordens/:id')
  async editarOrdem(
    @Req() request: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationPipe({ transform: true })) dto: EditarOrdemDto,
  ) {
    const user = request.user;
    
    // Busca permissão de aprovação do banco de dados
    let temPermissaoAprovacao = false;
    if (user.type === UserType.USUARIO) {
      const usuario = await this.usuarioRepository.findOne({ where: { id: user.sub } });
      temPermissaoAprovacao = usuario?.pode_aprovar_requisicoes || false;
    } else if (user.type === UserType.ORGAO || user.type === UserType.ADMIN) {
      // Órgão (admin) sempre tem permissão
      temPermissaoAprovacao = true;
    }
    
    return this.ordemService.editarOrdem(
      id,
      dto,
      user.sub,
      user.email || 'Usuário',
      temPermissaoAprovacao,
    );
  }

  // --- Corrigir datas (emissão / assinatura) e regenerar PDF da OF ---
  @Post('ordens/:id/corrigir-datas')
  async corrigirDatasOrdem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: CorrigirDatasOrdemDto,
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    const ordem = await this.ordemService.findOne(id);
    if (ordem.orgao_id !== orgaoId) {
      throw new ForbiddenException('Ordem não pertence a este órgão');
    }
    return this.ordemService.corrigirDatas(id, dto, request.user.sub, request.user.email || 'Sistema');
  }

  @Post('ordens/:id/regenerar-pdf')
  async regenerarPdfOrdem(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    const ordem = await this.ordemService.findOne(id);
    if (ordem.orgao_id !== orgaoId) {
      throw new ForbiddenException('Ordem não pertence a este órgão');
    }
    return this.ordemService.regenerarPdf(id);
  }

  @Post('ordens/:id/cancelar')
  async cancelarOrdem(
    @Req() request: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body('motivo') motivo: string,
  ) {
    const user = request.user;
    return this.ordemService.cancelarOrdem(
      id, 
      motivo || 'Cancelada pelo usuário',
      user.sub,
      user.email || 'Usuário',
    );
  }

  @Delete('ordens/:id')
  async excluirOrdem(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const user = await this.usuarioRepository.findOne({ where: { id: request.user.sub } });
    if (!user?.pode_cancelar_estornar) {
      throw new BadRequestException(
        'Voce nao tem permissao para excluir ordens de fornecimento. Solicite ao administrador a permissao "Cancelar/Estornar".'
      );
    }
    await this.ordemService.excluir(id);
    return { message: 'Ordem excluída com sucesso' };
  }

  // --- Itens Avulsos da OF (pos-NF) ---

  @Post('ordens/:id/itens-avulsos')
  async adicionarItemAvulsoOrdem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: { descricao: string; quantidade: number; valor_unitario: number },
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    const ordem = await this.ordemService.findOne(id);
    if (ordem.orgao_id !== orgaoId) {
      throw new ForbiddenException('Ordem nao pertence a este orgao');
    }
    return this.ordemService.adicionarItemAvulso(id, dados);
  }

  @Delete('ordens/:id/itens-avulsos/:itemId')
  async removerItemAvulsoOrdem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    const ordem = await this.ordemService.findOne(id);
    if (ordem.orgao_id !== orgaoId) {
      throw new ForbiddenException('Ordem nao pertence a este orgao');
    }
    return this.ordemService.removerItemAvulso(id, itemId);
  }

  @Get('ordens/:id/historico')
  async getHistoricoOrdem(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordemService.getHistorico(id);
  }

  @Get('ordens/:id/dossie/zip')
  async downloadDossieZip(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @Res() res: Response,
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    const ordem = await this.ordemService.findOne(id);
    if (ordem.orgao_id !== orgaoId) {
      throw new ForbiddenException('Ordem não pertence a este órgão');
    }
    const zipBuffer = await this.dossieService.gerarZip(id);
    const safeNum = ordem.numero.replace(/\//g, '_');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="Dossie_${safeNum}.zip"`);
    return res.send(zipBuffer);
  }

  @Post('ordens/:id/dossie/anexos')
  @UseInterceptors(
    FileInterceptor('arquivo', {
      storage: multer.diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = path.join(process.cwd(), 'uploads', 'dossie_temp');
          if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          cb(null, `dossie-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadDossieAnexo(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Envie um arquivo');
    }
    const orgaoId = this.getOrgaoId(request.user);
    const ordem = await this.ordemService.findOne(id);
    if (ordem.orgao_id !== orgaoId) {
      throw new ForbiddenException('Ordem não pertence a este órgão');
    }
    const usuario = await this.usuarioRepository.findOne({ where: { id: request.user.sub } });
    return this.dossieService.uploadAnexo(
      id,
      file,
      request.user.sub,
      usuario?.nome || request.user.email || 'Usuário',
    );
  }

  @Post('ordens/:id/dossie/entregue-financeiro')
  async marcarEntregueFinanceiro(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    const ordem = await this.ordemService.findOne(id);
    if (ordem.orgao_id !== orgaoId) {
      throw new ForbiddenException('Ordem não pertence a este órgão');
    }
    const usuario = await this.usuarioRepository.findOne({ where: { id: request.user.sub } });
    return this.dossieService.marcarEntregueFinanceiro(
      id,
      request.user.sub,
      usuario?.nome || request.user.email || 'Usuário',
    );
  }

  @Get('ordens/:id/pdf')
  async gerarPdfOrdem(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    try {
      const ordem = await this.ordemService.findOne(id);

      // Sempre regenera para garantir que campos novos (ex: empenhos) apareçam
      const caminhoPdf = await this.pdfOrdemService.gerarPdf(id);
      await this.ordemRepository.update(id, { caminho_pdf: caminhoPdf });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="ordem_${ordem.numero.replace(/\//g, '_')}.pdf"`);
      return res.sendFile(path.resolve(caminhoPdf));
    } catch (error) {
      this.logger.error(`Erro ao gerar PDF da ordem: ${error.message}`);
      throw error;
    }
  }

  @Patch('ordens/:id/empenhos')
  async vincularEmpenhosOrdem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('empenhos') empenhos: string[],
  ) {
    if (!Array.isArray(empenhos)) {
      throw new BadRequestException('empenhos deve ser um array de strings');
    }
    const caminhoPdf = await this.pdfOrdemService.vincularEmpenhos(id, empenhos);
    return { ok: true, pdf_regenerado: !!caminhoPdf };
  }

  @Patch('requisicoes/:id/empenhos')
  async vincularEmpenhosRequisicao(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('empenhos') empenhos: string[],
  ) {
    if (!Array.isArray(empenhos)) {
      throw new BadRequestException('empenhos deve ser um array de strings');
    }
    return this.requisicaoService.vincularEmpenhos(id, empenhos);
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

  @Get('recebimentos/:id/comprovacao-aceite')
  async downloadComprovacaoAceite(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const recebimento = await this.recebimentoService.findOne(id);
    const pdfPath = await this.recebimentoService.getComprovacaoAceitePath(id);
    if (!pdfPath) {
      throw new BadRequestException(
        'Comprovação de aceite não disponível. O documento é gerado automaticamente quando o recebimento é totalmente aceito.',
      );
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ComprovacaoAceite_${recebimento.numero.replace(/\//g, '_')}.pdf"`,
    );
    return res.sendFile(path.resolve(pdfPath));
  }

  @Post('recebimentos/:id/gerar-comprovacao-aceite')
  async gerarComprovacaoAceite(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const user = request.user;
    const usuario = await this.usuarioRepository.findOne({
      where: { id: user.sub },
    });
    return this.recebimentoService.gerarComprovacaoAceiteManualmente(
      id,
      user.sub,
      usuario?.nome || user.email || 'Usuário',
    );
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

  @Post('recebimentos/:id/aceitar-almoxarifado')
  async aceitarAlmoxarifado(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const user = request.user;
    const usuario = await this.usuarioRepository.findOne({
      where: { id: user.sub },
    });
    return this.recebimentoService.aceitarAlmoxarifado(
      id,
      user.sub,
      usuario?.nome || user.email || 'Usuário',
    );
  }

  @Post('recebimentos/:id/aceitar-patrimonio')
  async aceitarPatrimonio(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const user = request.user;
    const usuario = await this.usuarioRepository.findOne({
      where: { id: user.sub },
    });
    return this.recebimentoService.aceitarPatrimonio(
      id,
      user.sub,
      usuario?.nome || user.email || 'Usuário',
    );
  }

  @Post('recebimentos/:id/rejeitar')
  async rejeitarRecebimento(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('motivo') motivo: string,
  ) {
    return this.recebimentoService.rejeitar(id, motivo);
  }

  @Post('recebimentos/:id/estornar')
  async estornarRecebimento(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @Body('motivo') motivo: string,
  ) {
    // Verifica se usuário tem permissão para estornar
    const user = await this.usuarioRepository.findOne({
      where: { id: request.user.sub },
    });

    if (!user) {
      throw new BadRequestException('Usuário não encontrado');
    }

    if (!user.pode_cancelar_estornar) {
      throw new BadRequestException(
        'Você não tem permissão para estornar recebimentos. ' +
        'Apenas usuários autorizados podem realizar esta ação.'
      );
    }

    return this.recebimentoService.estornar(
      id,
      motivo || 'Estornado pelo usuário',
      user.id,
      user.nome,
    );
  }

  @Patch('recebimentos/:id/atualizar-quantidades')
  async atualizarQuantidades(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @Body('itens') itens: { item_contrato_id: string; quantidade_recebida: number }[],
  ) {
    const user = request.user;
    const usuario = await this.usuarioRepository.findOne({ where: { id: user.sub } });
    return this.recebimentoService.atualizarQuantidades(
      id,
      itens,
      user.sub,
      usuario?.nome || user.email || 'Usuário',
    );
  }

  @Post('recebimentos/:id/cancelar')
  async cancelarRecebimento(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @Body('motivo') motivo: string,
  ) {
    const user = await this.usuarioRepository.findOne({ where: { id: request.user.sub } });
    if (!user?.pode_cancelar_estornar) {
      throw new BadRequestException(
        'Você não tem permissão para cancelar recebimentos. ' +
        'Solicite ao administrador a permissão "Cancelar/Estornar".'
      );
    }
    return this.recebimentoService.cancelar(
      id,
      motivo || 'Cancelado pelo usuário',
      user.id,
      user.nome || user.email || 'Usuário',
    );
  }

  @Post('recebimentos/:id/recusar-item')
  async recusarItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @Body('item_contrato_id') itemContratoId: string,
    @Body('motivo') motivo: string,
  ) {
    const user = request.user;
    const usuario = await this.usuarioRepository.findOne({ where: { id: user.sub } });
    return this.recebimentoService.recusarItem(
      id,
      itemContratoId,
      motivo || 'Item recusado',
      user.sub,
      usuario?.nome || user.email || 'Usuário',
    );
  }

  @Delete('recebimentos/:id')
  async excluirRecebimento(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const user = await this.usuarioRepository.findOne({ where: { id: request.user.sub } });
    if (!user?.pode_cancelar_estornar) {
      throw new BadRequestException(
        'Voce nao tem permissao para excluir recebimentos. Solicite ao administrador a permissao "Cancelar/Estornar".'
      );
    }
    await this.recebimentoService.excluir(id);
    return { message: 'Recebimento excluído com sucesso' };
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
  // NOTA FISCAL DO FORNECEDOR
  // ============================================================================

  @Get('ordens/:ordemId/nota-fiscal')
  async getNotaFiscalOrdem(
    @Param('ordemId', ParseUUIDPipe) ordemId: string,
    @Req() request: { user: JwtPayload },
  ) {
    this.getOrgaoId(request.user);
    return this.nfFornecedorService.findByOrdem(ordemId);
  }

  @Delete('notas-fiscais-fornecedor/:id')
  async deleteNotaFiscal(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    this.getOrgaoId(request.user);
    return this.nfFornecedorService.delete(id);
  }

  @Post('notas-fiscais-fornecedor/:id/reenviar-notificacao')
  async reenviarNotificacaoNotaFiscal(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.nfFornecedorService.reenviarNotificacaoNfDisponivel(id, orgaoId);
  }

  @Post('notas-fiscais-fornecedor/:id/recusar')
  async recusarNotaFiscal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { motivo: string },
    @Req() request: { user: JwtPayload },
  ) {
    this.getOrgaoId(request.user);
    const usuario = request.user;
    return this.nfFornecedorService.recusarNF(
      id,
      body.motivo,
      usuario.sub || (usuario as any).id,
      usuario.email || (usuario as any).nome || 'Usuário',
    );
  }

  @Post('ordens/:ordemId/upload-nota-fiscal')
  @UseInterceptors(
    FilesInterceptor('arquivos', 10, {
      storage: multer.diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = path.join(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'), 'notas-fiscais');
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `nf-${uniqueSuffix}${path.extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowed = ['text/xml', 'application/xml', 'application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
        if (allowed.includes(file.mimetype) || file.originalname.endsWith('.xml')) {
          cb(null, true);
        } else {
          cb(new Error('Tipo de arquivo não permitido. Aceitos: XML, PDF, JPG, PNG'), false);
        }
      },
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  async uploadNotaFiscalOrgao(
    @Param('ordemId', ParseUUIDPipe) ordemId: string,
    @Req() request: { user: JwtPayload },
    @UploadedFiles() arquivos: Express.Multer.File[],
  ) {
    const orgaoId = this.getOrgaoId(request.user);

    const xmlFile = arquivos?.find(f =>
      f.mimetype.includes('xml') || f.originalname.endsWith('.xml')
    );
    const pdfFile = arquivos?.find(f => f.mimetype === 'application/pdf');
    const outrosArquivos = arquivos?.filter(f => f !== xmlFile && f !== pdfFile) || [];

    if (!xmlFile) {
      throw new BadRequestException('Arquivo XML é obrigatório');
    }

    const ordem = await this.ordemRepository.findOne({ where: { id: ordemId, orgao_id: orgaoId } });
    if (!ordem) {
      throw new BadRequestException('Ordem não encontrada');
    }

    return this.nfFornecedorService.upload(
      ordemId,
      ordem.fornecedor_id,
      orgaoId,
      xmlFile,
      pdfFile,
      outrosArquivos,
    );
  }

  @Post('ordens/:ordemId/matching-ia')
  async executarMatchingIa(
    @Param('ordemId', ParseUUIDPipe) ordemId: string,
    @Req() request: { user: JwtPayload },
    @Body() body: { nf_id?: string },
  ) {
    this.getOrgaoId(request.user);
    const nf = body.nf_id
      ? await this.nfFornecedorService.findOne(body.nf_id)
      : await this.nfFornecedorService.findByOrdem(ordemId);
    if (!nf || nf.ordem_fornecimento_id !== ordemId) {
      throw new BadRequestException('Nota fiscal não encontrada para esta ordem');
    }
    return this.matchingIaService.matchProdutos(nf.id, ordemId);
  }

  @Post('recebimentos/:id/confirmar-mapeamento')
  async confirmarMapeamento(
    @Param('id', ParseUUIDPipe) nfId: string,
    @Req() request: { user: JwtPayload },
    @Body() body: { mapeamento: any[] },
  ) {
    const user = request.user;
    const nf = await this.nfFornecedorService.confirmarMapeamento(nfId, body.mapeamento, user.sub);

    const recebimento = await this.recebimentoService.criarComNF(
      nf.ordem_fornecimento_id,
      nf,
      body.mapeamento,
      user.sub,
      user.email || 'Usuário',
    );

    return { nf, recebimento };
  }

  @Get('ordens/:id/recebimento-unificado')
  async getRecebimentoUnificado(
    @Param('id', ParseUUIDPipe) ordemId: string,
    @Req() request: { user: JwtPayload },
    @Query('nf_id') nfIdQuery: string | undefined,
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    
    const ordem = await this.ordemRepository.findOne({
      where: { id: ordemId, orgao_id: orgaoId },
      relations: ['fornecedor', 'contrato'],
    });
    if (!ordem) {
      throw new BadRequestException('Ordem não encontrada');
    }

    const notasFiscais = await this.nfFornecedorService.findAllByOrdem(ordemId);
    const recebimentos = await this.recebimentoService.findByOrdem(ordemId);

    // NFs pendentes = sem recebimento aceito (órgão ainda não processou)
    const nfsPendentes = notasFiscais.filter((nf: any) => {
      const rec = recebimentos.find((r: any) => r.nota_fiscal_fornecedor_id === nf.id);
      return !rec || !['ACEITO', 'ACEITO_PARCIAL'].includes(rec.status);
    }).filter((nf: any) => nf.status !== 'RECUSADA');

    // OF aberta e todas as NFs já têm recebimento aceito → aguardando próxima XML
    const valorEntregue = Number(ordem.valor_entregue ?? 0);
    const valorTotal = Number(ordem.valor_total ?? 0);
    const ofAberta = valorTotal > 0 && valorEntregue < valorTotal - 0.01;
    const todasNfsComRecebimentoAceito = notasFiscais.length > 0 && notasFiscais.every((nf: any) => {
      const rec = recebimentos.find((r: any) => r.nota_fiscal_fornecedor_id === nf.id);
      return rec && ['ACEITO', 'ACEITO_PARCIAL'].includes(rec.status);
    });
    const aguardarProximaNf = ofAberta && todasNfsComRecebimentoAceito;

    // notaFiscal: a que o órgão vai processar. Se nf_id na URL, usa essa. Senão: 1 pendente = auto; várias = null (órgão escolhe na fila)
    const notaFiscal = aguardarProximaNf
      ? null
      : (nfIdQuery && nfsPendentes.some((nf: any) => nf.id === nfIdQuery)
        ? nfsPendentes.find((nf: any) => nf.id === nfIdQuery)
        : nfsPendentes.length === 1
          ? nfsPendentes[0]
          : nfsPendentes.length > 1
            ? null
            : null);

    // REQ-ALM-001: itens pendentes (saldo > 0) e já recebidos para o filtro no mapeamento
    const itensPendentes = (ordem.itens || []).filter(
      (i: any) => (Number(i.quantidade_entregue ?? 0) < Number(i.quantidade ?? 0)),
    );
    const itensJaRecebidos = (ordem.itens || []).filter(
      (i: any) => (Number(i.quantidade ?? 0) > 0 && Number(i.quantidade_entregue ?? 0) >= Number(i.quantidade ?? 0)),
    );

    return {
      ordem,
      notaFiscal,
      notasFiscais,
      nfsPendentes,
      recebimentos,
      itensPendentes,
      itensJaRecebidos: itensJaRecebidos.map((i: any) => ({
        item_contrato_id: i.item_contrato_id,
        descricao: i.descricao,
      })),
      aguardarProximaNf: aguardarProximaNf || false,
    };
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
