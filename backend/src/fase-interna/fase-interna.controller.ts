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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { FaseInternaService } from './fase-interna.service';
import {
  TipoDocumentoFaseInterna,
  OrigemDocumento,
} from './entities/documento-fase-interna.entity';
import { PesquisaPrecosAgentService } from './pesquisa-precos-agent.service';
import { GeradorPpService } from './gerador-pp.service';
import { FontePesquisaTipo } from './types/pesquisa-precos.type';
import { Public } from '../auth/public.decorator';

@Controller('fase-interna')
export class FaseInternaController {
  constructor(
    private readonly faseInternaService: FaseInternaService,
    private readonly pesquisaPrecosAgentService: PesquisaPrecosAgentService,
    private readonly geradorPpService: GeradorPpService,
  ) {}

  // === DOCUMENTOS ===

  @Post(':licitacaoId/documento')
  async criarDocumento(
    @Param('licitacaoId') licitacaoId: string,
    @Body()
    body: {
      tipo: TipoDocumentoFaseInterna;
      titulo: string;
      descricao?: string;
      criadorId?: string;
      criadorNome?: string;
    },
  ) {
    return this.faseInternaService.criarDocumento(
      licitacaoId,
      body.tipo,
      body.titulo,
      body.descricao,
      body.criadorId,
      body.criadorNome,
    );
  }

  @Post(':licitacaoId/importar-documento')
  async importarDocumento(
    @Param('licitacaoId') licitacaoId: string,
    @Body()
    body: {
      tipo: TipoDocumentoFaseInterna;
      titulo: string;
      origem: OrigemDocumento;
      sistemaOrigem: string;
      idExterno: string;
      nomeArquivo?: string;
      caminhoArquivo?: string;
      hashArquivo?: string;
    },
  ) {
    return this.faseInternaService.importarDocumento(
      licitacaoId,
      body.tipo,
      body.titulo,
      body.origem,
      body.sistemaOrigem,
      body.idExterno,
      body.nomeArquivo,
      body.caminhoArquivo,
      body.hashArquivo,
    );
  }

  @Post('importar-processo')
  async importarProcessoCompleto(
    @Body()
    body: {
      sistemaOrigem: string;
      idExterno: string;
      numero_processo: string;
      objeto: string;
      modalidade: string;
      orgaoId: string;
      documentos: Array<{
        tipo: TipoDocumentoFaseInterna;
        titulo: string;
        idExterno: string;
        caminhoArquivo?: string;
      }>;
    },
  ) {
    return this.faseInternaService.importarProcessoCompleto(body);
  }

  @Get(':licitacaoId/documentos')
  async getDocumentos(@Param('licitacaoId') licitacaoId: string) {
    return this.faseInternaService.getDocumentos(licitacaoId);
  }

  @Get(':licitacaoId/documentos/:tipo')
  async getDocumentosPorTipo(
    @Param('licitacaoId') licitacaoId: string,
    @Param('tipo') tipo: TipoDocumentoFaseInterna,
  ) {
    return this.faseInternaService.getDocumentosPorTipo(licitacaoId, tipo);
  }

  /**
   * Auto-save do editor (conteúdo HTML inteiro).
   * Mantido para compatibilidade com o DocumentEditor legado.
   */
  @Patch(':licitacaoId/documentos/:tipo/conteudo')
  async atualizarConteudo(
    @Param('licitacaoId') licitacaoId: string,
    @Param('tipo') tipo: TipoDocumentoFaseInterna,
    @Body() body: { html: string },
  ) {
    return this.faseInternaService.atualizarConteudo(licitacaoId, tipo, body.html);
  }

  /**
   * Auto-save de uma seção específica do editor de seções guiadas.
   * Atualiza dados_estruturados[secaoId] = html.
   * SEM validação — permite salvar rascunhos incompletos.
   */
  @Patch(':licitacaoId/documentos/:tipo/secao/:secaoId')
  async atualizarSecao(
    @Param('licitacaoId') licitacaoId: string,
    @Param('tipo') tipo: TipoDocumentoFaseInterna,
    @Param('secaoId') secaoId: string,
    @Body() body: { html: string },
  ) {
    return this.faseInternaService.atualizarSecao(
      licitacaoId,
      tipo,
      secaoId,
      body.html || '',
    );
  }

  @Get('documento/:id')
  async getDocumento(@Param('id') id: string) {
    return this.faseInternaService.getDocumento(id);
  }

  // === APROVACAO ===

  @Put('documento/:id/submeter')
  async submeterParaAprovacao(@Param('id') id: string) {
    return this.faseInternaService.submeterParaAprovacao(id);
  }

  @Put('documento/:id/aprovar')
  async aprovarDocumento(
    @Param('id') id: string,
    @Body()
    body: { aprovadorId: string; aprovadorNome: string; observacao?: string },
  ) {
    return this.faseInternaService.aprovarDocumento(
      id,
      body.aprovadorId,
      body.aprovadorNome,
      body.observacao,
    );
  }

  @Put('documento/:id/reprovar')
  async reprovarDocumento(
    @Param('id') id: string,
    @Body()
    body: { aprovadorId: string; aprovadorNome: string; observacao: string },
  ) {
    return this.faseInternaService.reprovarDocumento(
      id,
      body.aprovadorId,
      body.aprovadorNome,
      body.observacao,
    );
  }

  // === VERIFICACAO E AVANCO ===

  @Get(':licitacaoId/verificar')
  async verificarFaseCompleta(@Param('licitacaoId') licitacaoId: string) {
    return this.faseInternaService.verificarFaseCompleta(licitacaoId);
  }

  @Get(':licitacaoId/resumo')
  async getResumoFaseInterna(@Param('licitacaoId') licitacaoId: string) {
    return this.faseInternaService.getResumoFaseInterna(licitacaoId);
  }

  @Put(':licitacaoId/avancar')
  async avancarFaseInterna(@Param('licitacaoId') licitacaoId: string) {
    return this.faseInternaService.avancarFaseInterna(licitacaoId);
  }

  // === DASHBOARD ===

  @Get('dashboard')
  async getDashboard(@Query('orgao_id') orgaoId: string) {
    return this.faseInternaService.getDashboard(orgaoId);
  }

  // === RISCOS ===

  @Get(':licitacaoId/riscos')
  async getRiscos(@Param('licitacaoId') licitacaoId: string) {
    return this.faseInternaService.getRiscos(licitacaoId);
  }

  @Post(':licitacaoId/riscos')
  async adicionarRisco(
    @Param('licitacaoId') licitacaoId: string,
    @Body()
    body: {
      descricao: string;
      categoria: string;
      probabilidade: 1 | 2 | 3 | 4 | 5;
      impacto: 1 | 2 | 3 | 4 | 5;
      mitigacao: string;
      responsavel?: string;
      prazo?: string;
    },
  ) {
    return this.faseInternaService.adicionarRisco(licitacaoId, body);
  }

  @Put(':licitacaoId/riscos/:riscoId')
  async atualizarRisco(
    @Param('licitacaoId') licitacaoId: string,
    @Param('riscoId') riscoId: string,
    @Body()
    body: Partial<{
      descricao: string;
      categoria: string;
      probabilidade: 1 | 2 | 3 | 4 | 5;
      impacto: 1 | 2 | 3 | 4 | 5;
      mitigacao: string;
      responsavel: string;
      prazo: string;
      status: 'identificado' | 'mitigado' | 'aceito';
    }>,
  ) {
    return this.faseInternaService.atualizarRisco(licitacaoId, riscoId, body);
  }

  @Delete(':licitacaoId/riscos/:riscoId')
  async removerRisco(
    @Param('licitacaoId') licitacaoId: string,
    @Param('riscoId') riscoId: string,
  ) {
    return this.faseInternaService.removerRisco(licitacaoId, riscoId);
  }

  // === PESQUISA DE PRECOS ===

  @Public()
  @Get('publico/precos/:licitacaoId')
  async getPrecosPublicos(@Param('licitacaoId') licitacaoId: string) {
    return this.faseInternaService.getPrecosPublicos(licitacaoId);
  }

  @Get(':licitacaoId/precos')
  async getPrecos(@Param('licitacaoId') licitacaoId: string) {
    return this.faseInternaService.getPrecos(licitacaoId);
  }

  @Post(':licitacaoId/precos/item')
  async adicionarItemPesquisa(
    @Param('licitacaoId') licitacaoId: string,
    @Body()
    body: {
      descricao: string;
      quantidade: number;
      unidade: string;
      codigo_catalogo?: string;
      codigo_catmat?: string;
      codigo_catser?: string;
      tipo_catalogo?: 'MATERIAL' | 'SERVICO';
    },
  ) {
    const dados = await this.faseInternaService.getPrecos(licitacaoId);
    const proximoNumero = (dados.dados?.itens?.length ?? 0) + 1;
    const codigoCatalogo =
      body.codigo_catalogo || body.codigo_catmat || body.codigo_catser;
    return this.faseInternaService.adicionarItemPesquisa(licitacaoId, {
      item_numero: proximoNumero,
      descricao: body.descricao,
      quantidade: body.quantidade || 1,
      unidade: body.unidade || 'UN',
      codigo_catalogo: codigoCatalogo,
      codigo_catmat:
        body.codigo_catmat ||
        (body.tipo_catalogo === 'MATERIAL' ? codigoCatalogo : undefined),
      codigo_catser:
        body.codigo_catser ||
        (body.tipo_catalogo === 'SERVICO' ? codigoCatalogo : undefined),
      tipo_catalogo: body.tipo_catalogo,
      cotacoes: [],
      metodologia: 'MEDIANA',
      valor_referencial: 0,
    });
  }

  @Delete(':licitacaoId/precos/item/:itemNumero')
  async removerItemPesquisa(
    @Param('licitacaoId') licitacaoId: string,
    @Param('itemNumero') itemNumero: string,
  ) {
    return this.faseInternaService.removerItemPesquisa(
      licitacaoId,
      parseInt(itemNumero),
    );
  }

  @Put(':licitacaoId/precos/metodologia')
  async salvarMetodologia(
    @Param('licitacaoId') licitacaoId: string,
    @Body()
    body: {
      metodologia: 'MEDIA' | 'MEDIANA' | 'MENOR_VALOR' | 'OUTRA';
      justificativa?: string;
      outliers?: Array<{
        item_numero: number;
        cotacao_index: number;
        motivo: string;
      }>;
    },
  ) {
    return this.faseInternaService.salvarMetodologiaPP(
      licitacaoId,
      body.metodologia,
      body.justificativa,
      body.outliers,
    );
  }

  @Put(':licitacaoId/precos/responsavel')
  async salvarResponsavel(
    @Param('licitacaoId') licitacaoId: string,
    @Body()
    body: {
      nome: string;
      cargo: string;
      matricula?: string;
      observacoes?: string;
      data_pesquisa?: string;
    },
  ) {
    return this.faseInternaService.salvarResponsavelPP(
      licitacaoId,
      body,
      body.observacoes,
      body.data_pesquisa,
    );
  }

  @Post(':licitacaoId/precos/fonte')
  async adicionarFontePreco(
    @Param('licitacaoId') licitacaoId: string,
    @Body()
    body: {
      itemNumero: number;
      cotacao: any & {
        fonte: string;
        tipo:
          | 'PNCP'
          | 'PAINEL_PRECOS'
          | 'COTACAO_DIRETA'
          | 'CATALOGO'
          | 'ORCAMENTO';
        valor_unitario: number;
        data_pesquisa: string;
        fornecedor?: string;
        url_referencia?: string;
        observacao?: string;
        valida?: boolean;
      };
    },
  ) {
    return this.faseInternaService.adicionarFontePreco(
      licitacaoId,
      body.itemNumero,
      body.cotacao,
    );
  }

  @Delete(':licitacaoId/precos/fonte')
  async removerFontePreco(
    @Param('licitacaoId') licitacaoId: string,
    @Query('item') itemNumero: string,
    @Query('index') cotacaoIndex: string,
  ) {
    return this.faseInternaService.removerFontePreco(
      licitacaoId,
      parseInt(itemNumero),
      parseInt(cotacaoIndex),
    );
  }

  @Post(':licitacaoId/precos/agente/executar')
  async executarAgentePrecos(
    @Param('licitacaoId') licitacaoId: string,
    @Body()
    body: {
      itemNumero?: number;
      itemNumeros?: number[];
      fontes?: FontePesquisaTipo[];
      maxPorFonte?: number;
      usarBrowserFallback?: boolean;
      autoAprovar?: boolean;
      iniciadoPorId?: string;
      iniciadoPorNome?: string;
    },
  ) {
    const b = body || {};
    // aceita itemNumero singular como alias
    const itemNumeros = b.itemNumeros?.length
      ? b.itemNumeros
      : b.itemNumero != null
        ? [b.itemNumero]
        : undefined;

    const execucao = await this.pesquisaPrecosAgentService.executar(
      licitacaoId,
      { ...b, itemNumeros },
    );

    if (b.autoAprovar && execucao.candidatos?.length) {
      for (const candidato of execucao.candidatos) {
        try {
          await this.pesquisaPrecosAgentService.aprovarCandidato(
            licitacaoId,
            candidato.id,
            { id: b.iniciadoPorId, nome: b.iniciadoPorNome },
          );
        } catch {
          // candidato inválido ou duplicado — ignora
        }
      }
    }

    await this.faseInternaService.removerCotacoesEstimadasDoAgente(licitacaoId);
    return this.faseInternaService.getPrecos(licitacaoId);
  }

  @Post(':licitacaoId/precos/item/:itemNumero/agente/executar')
  async executarAgentePrecosItem(
    @Param('licitacaoId') licitacaoId: string,
    @Param('itemNumero') itemNumero: string,
    @Body()
    body: {
      fontes?: FontePesquisaTipo[];
      maxPorFonte?: number;
      usarBrowserFallback?: boolean;
      autoAprovar?: boolean;
      iniciadoPorId?: string;
      iniciadoPorNome?: string;
    },
  ) {
    return this.executarAgentePrecos(licitacaoId, {
      ...(body || {}),
      itemNumeros: [parseInt(itemNumero)],
    });
  }

  @Get(':licitacaoId/precos/agente/execucoes')
  async listarExecucoesAgentePrecos(@Param('licitacaoId') licitacaoId: string) {
    return this.pesquisaPrecosAgentService.listarExecucoes(licitacaoId);
  }

  @Get(':licitacaoId/precos/agente/execucoes/:execucaoId')
  async obterExecucaoAgentePrecos(
    @Param('licitacaoId') licitacaoId: string,
    @Param('execucaoId') execucaoId: string,
  ) {
    return this.pesquisaPrecosAgentService.obterExecucao(
      licitacaoId,
      execucaoId,
    );
  }

  @Post(':licitacaoId/precos/agente/candidatos/:candidateId/aprovar')
  async aprovarCandidatoPreco(
    @Param('licitacaoId') licitacaoId: string,
    @Param('candidateId') candidateId: string,
    @Body() body: { decisorId?: string; decisorNome?: string },
  ) {
    return this.pesquisaPrecosAgentService.aprovarCandidato(
      licitacaoId,
      candidateId,
      {
        id: body?.decisorId,
        nome: body?.decisorNome,
      },
    );
  }

  @Post(':licitacaoId/precos/agente/candidatos/:candidateId/rejeitar')
  async rejeitarCandidatoPreco(
    @Param('licitacaoId') licitacaoId: string,
    @Param('candidateId') candidateId: string,
    @Body() body: { motivo?: string; decisorId?: string; decisorNome?: string },
  ) {
    return this.pesquisaPrecosAgentService.rejeitarCandidato(
      licitacaoId,
      candidateId,
      body?.motivo || 'Rejeitado pelo usuario',
      { id: body?.decisorId, nome: body?.decisorNome },
    );
  }

  @Post(':licitacaoId/precos/agente/nfe/importar')
  async importarNfeAgentePrecos(
    @Param('licitacaoId') licitacaoId: string,
    @Body()
    body: {
      itemNumero: number;
      descricaoFonte?: string;
      urlReferencia?: string;
      fornecedorCnpj?: string;
      fornecedorRazaoSocial?: string;
      valorUnitario: number;
      dataPesquisa?: string;
      documentoPath?: string;
      documentoHash?: string;
    },
  ) {
    return this.pesquisaPrecosAgentService.importarNfe(licitacaoId, body);
  }

  @Post(':licitacaoId/precos/fonte-precos/csv')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const uploadPath =
            process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
          const destPath = join(
            uploadPath,
            'pesquisa-precos',
            req.params.licitacaoId,
          );
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const fs = require('fs');
          if (!fs.existsSync(destPath))
            fs.mkdirSync(destPath, { recursive: true });
          cb(null, destPath);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(
            null,
            `fonte-precos-${unique}${extname(file.originalname) || '.csv'}`,
          );
        },
      }),
      fileFilter: (_req, file, cb) => {
        const nome = file.originalname.toLowerCase();
        const allowed = [
          'text/csv',
          'application/csv',
          'application/vnd.ms-excel',
          'text/plain',
        ];
        if (!nome.endsWith('.csv') && !allowed.includes(file.mimetype)) {
          return cb(
            new BadRequestException(
              'Apenas arquivos CSV da Fonte de Precos sao aceitos',
            ),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  async importarCsvFontePrecos(
    @Param('licitacaoId') licitacaoId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Arquivo CSV nao enviado');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    const buffer = fs.readFileSync(file.path);
    const relPath = join('pesquisa-precos', licitacaoId, file.filename);
    return this.faseInternaService.importarCsvFontePrecos(
      licitacaoId,
      buffer,
      relPath,
    );
  }

  // === APROVACOES AGREGADAS ===

  @Get('aprovacoes')
  async getAprovacoes(@Query('orgao_id') orgaoId: string) {
    return this.faseInternaService.getAprovacoesOrgao(orgaoId);
  }

  // === WIZARD ===

  @Post(':licitacaoId/wizard')
  async salvarWizard(
    @Param('licitacaoId') licitacaoId: string,
    @Body()
    body: {
      dfd?: string;
      etp?: Record<string, any>;
      riscos?: Array<any>;
      pesquisaPrecos?: Array<any>;
      tr?: Record<string, any>;
      autorizacao?: string;
      edital?: string;
      parecerJuridico?: string;
      criadorId?: string;
      criadorNome?: string;
    },
  ) {
    return this.faseInternaService.salvarWizard(licitacaoId, body);
  }

  // === UPLOAD DE COMPROVANTE POR COTAÇÃO ===

  @Post(':licitacaoId/precos/comprovante')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const uploadPath =
            process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
          const destPath = join(
            uploadPath,
            'pesquisa-precos',
            req.params.licitacaoId,
          );
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const fs = require('fs');
          if (!fs.existsSync(destPath))
            fs.mkdirSync(destPath, { recursive: true });
          cb(null, destPath);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `comprovante-${unique}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'application/pdf',
          'image/jpeg',
          'image/png',
          'image/jpg',
        ];
        if (!allowed.includes(file.mimetype)) {
          return cb(
            new BadRequestException('Apenas PDF, JPG e PNG são aceitos'),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadComprovante(
    @Param('licitacaoId') licitacaoId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { itemNumero: string; cotacaoIndex: string },
  ) {
    if (!file) throw new BadRequestException('Arquivo não enviado');
    const relPath = join('pesquisa-precos', licitacaoId, file.filename);
    await this.faseInternaService.salvarComprovanteCotacao(
      licitacaoId,
      parseInt(body.itemNumero),
      parseInt(body.cotacaoIndex),
      relPath,
    );
    return { url: `/uploads/${relPath}`, path: relPath };
  }

  // === GERAÇÃO DO DOCUMENTO PP (PDF FORMAL) ===

  @Post(':licitacaoId/precos/gerar-documento')
  async gerarDocumentoPP(
    @Param('licitacaoId') licitacaoId: string,
    @Body()
    body: {
      responsavel: { nome: string; cargo: string; matricula?: string };
      metodologia: 'MEDIA' | 'MEDIANA' | 'MENOR_VALOR' | 'OUTRA';
      justificativaMetodologia?: string;
    },
  ) {
    const precosData = await this.faseInternaService.getPrecos(licitacaoId);
    const path = await this.geradorPpService.gerarDocumentoPP(licitacaoId, {
      numeroProcesso: '',
      objeto: '',
      orgao: '',
      itens: precosData.dados?.itens || [],
      metodologia: body.metodologia,
      justificativaMetodologia: body.justificativaMetodologia,
      valorTotalEstimado: precosData.estatisticas?.valorTotal || 0,
      responsavel: body.responsavel,
      dataAssinatura: new Date().toISOString().split('T')[0],
    });
    return { url: `/uploads/${path}`, path };
  }
}
