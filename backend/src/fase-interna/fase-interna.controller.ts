import {
  Controller,
  Get,
  Post,
  Put,
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
import { PesquisaPrecosAgenteService, BuscaPrecoInput } from './pesquisa-precos-agente.service';
import { GeradorPpService } from './gerador-pp.service';
import { TipoDocumentoFaseInterna, OrigemDocumento } from './entities/documento-fase-interna.entity';

// Configuração de storage para comprovantes de pesquisa de preços
const comprovanteStorage = (licitacaoId: string) =>
  diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
      const destPath = join(uploadPath, 'pesquisa-precos', req.params.licitacaoId || licitacaoId);
      const fs = require('fs');
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      cb(null, destPath);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, `comprovante-${uniqueSuffix}${extname(file.originalname)}`);
    },
  });

@Controller('fase-interna')
export class FaseInternaController {
  constructor(
    private readonly faseInternaService: FaseInternaService,
    private readonly pesquisaPrecosAgente: PesquisaPrecosAgenteService,
    private readonly geradorPpService: GeradorPpService,
  ) {}

  // === DOCUMENTOS ===

  @Post(':licitacaoId/documento')
  async criarDocumento(
    @Param('licitacaoId') licitacaoId: string,
    @Body() body: {
      tipo: TipoDocumentoFaseInterna;
      titulo: string;
      descricao?: string;
      criadorId?: string;
      criadorNome?: string;
    }
  ) {
    return this.faseInternaService.criarDocumento(
      licitacaoId,
      body.tipo,
      body.titulo,
      body.descricao,
      body.criadorId,
      body.criadorNome
    );
  }

  @Post(':licitacaoId/importar-documento')
  async importarDocumento(
    @Param('licitacaoId') licitacaoId: string,
    @Body() body: {
      tipo: TipoDocumentoFaseInterna;
      titulo: string;
      origem: OrigemDocumento;
      sistemaOrigem: string;
      idExterno: string;
      nomeArquivo?: string;
      caminhoArquivo?: string;
      hashArquivo?: string;
    }
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
      body.hashArquivo
    );
  }

  @Post('importar-processo')
  async importarProcessoCompleto(
    @Body() body: {
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
    }
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
    @Param('tipo') tipo: TipoDocumentoFaseInterna
  ) {
    return this.faseInternaService.getDocumentosPorTipo(licitacaoId, tipo);
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
    @Body() body: { aprovadorId: string; aprovadorNome: string; observacao?: string }
  ) {
    return this.faseInternaService.aprovarDocumento(
      id,
      body.aprovadorId,
      body.aprovadorNome,
      body.observacao
    );
  }

  @Put('documento/:id/reprovar')
  async reprovarDocumento(
    @Param('id') id: string,
    @Body() body: { aprovadorId: string; aprovadorNome: string; observacao: string }
  ) {
    return this.faseInternaService.reprovarDocumento(
      id,
      body.aprovadorId,
      body.aprovadorNome,
      body.observacao
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
    @Body() body: {
      descricao: string;
      categoria: string;
      probabilidade: 1 | 2 | 3 | 4 | 5;
      impacto: 1 | 2 | 3 | 4 | 5;
      mitigacao: string;
      responsavel?: string;
      prazo?: string;
    }
  ) {
    return this.faseInternaService.adicionarRisco(licitacaoId, body);
  }

  @Put(':licitacaoId/riscos/:riscoId')
  async atualizarRisco(
    @Param('licitacaoId') licitacaoId: string,
    @Param('riscoId') riscoId: string,
    @Body() body: Partial<{
      descricao: string;
      categoria: string;
      probabilidade: 1 | 2 | 3 | 4 | 5;
      impacto: 1 | 2 | 3 | 4 | 5;
      mitigacao: string;
      responsavel: string;
      prazo: string;
      status: 'identificado' | 'mitigado' | 'aceito';
    }>
  ) {
    return this.faseInternaService.atualizarRisco(licitacaoId, riscoId, body);
  }

  @Delete(':licitacaoId/riscos/:riscoId')
  async removerRisco(
    @Param('licitacaoId') licitacaoId: string,
    @Param('riscoId') riscoId: string
  ) {
    return this.faseInternaService.removerRisco(licitacaoId, riscoId);
  }

  // === PESQUISA DE PRECOS ===

  @Get(':licitacaoId/precos')
  async getPrecos(@Param('licitacaoId') licitacaoId: string) {
    return this.faseInternaService.getPrecos(licitacaoId);
  }

  @Post(':licitacaoId/precos/fonte')
  async adicionarFontePreco(
    @Param('licitacaoId') licitacaoId: string,
    @Body() body: {
      itemNumero: number;
      cotacao: {
        fonte: string;
        tipo: 'PNCP' | 'PAINEL_PRECOS' | 'COTACAO_DIRETA' | 'CATALOGO' | 'ORCAMENTO';
        valor_unitario: number;
        data_pesquisa: string;
        fornecedor?: string;
        url_referencia?: string;
        observacao?: string;
        valida?: boolean;
      };
    }
  ) {
    return this.faseInternaService.adicionarFontePreco(licitacaoId, body.itemNumero, body.cotacao);
  }

  @Delete(':licitacaoId/precos/fonte')
  async removerFontePreco(
    @Param('licitacaoId') licitacaoId: string,
    @Query('item') itemNumero: string,
    @Query('index') cotacaoIndex: string
  ) {
    return this.faseInternaService.removerFontePreco(
      licitacaoId,
      parseInt(itemNumero),
      parseInt(cotacaoIndex)
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
    @Body() body: {
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
    }
  ) {
    return this.faseInternaService.salvarWizard(licitacaoId, body);
  }

  // === PESQUISA DE PREÇOS AUTOMÁTICA (PNCP + Painel de Preços + IA) ===

  /**
   * Pesquisa preços de um item nas fontes governamentais (PNCP, Painel de Preços) e IA.
   * POST /fase-interna/precos/pesquisar
   */
  @Post('precos/pesquisar')
  async pesquisarPrecoItem(@Body() body: BuscaPrecoInput) {
    return this.pesquisaPrecosAgente.pesquisarPrecos(body);
  }

  /**
   * Pesquisa preços de múltiplos itens em batch.
   * POST /fase-interna/precos/pesquisar-batch
   */
  @Post('precos/pesquisar-batch')
  async pesquisarPrecosBatch(@Body() body: { itens: BuscaPrecoInput[] }) {
    return this.pesquisaPrecosAgente.pesquisarItens(body.itens);
  }

  /**
   * Pesquisa preços para os itens de uma licitação e salva no documento de PP.
   * POST /fase-interna/:licitacaoId/precos/pesquisar-e-salvar
   */
  @Post(':licitacaoId/precos/pesquisar-e-salvar')
  async pesquisarESalvar(
    @Param('licitacaoId') licitacaoId: string,
    @Body() body: { itens: BuscaPrecoInput[] },
  ) {
    const { itens: itensResultado, resumo } = await this.pesquisaPrecosAgente.pesquisarItens(body.itens);

    // Salva cada cotação encontrada no documento de PP da licitação
    for (let idx = 0; idx < itensResultado.length; idx++) {
      const item = itensResultado[idx];
      const itemNumero = idx + 1;

      // Cria o item se ainda não existe
      try {
        await this.faseInternaService.adicionarItemPesquisa(licitacaoId, {
          item_numero: itemNumero,
          descricao: item.descricao || body.itens[idx]?.descricao || '',
          quantidade: item.quantidade || 1,
          unidade: item.unidade || 'UN',
          cotacoes: item.cotacoes || [],
          metodologia: 'MEDIANA',
          valor_referencial: item.valor_referencial || 0,
        });
      } catch {
        // Item pode já existir — adiciona cotações individualmente
        for (const cotacao of item.cotacoes || []) {
          try {
            await this.faseInternaService.adicionarFontePreco(licitacaoId, itemNumero, cotacao);
          } catch { /* ignora duplicatas */ }
        }
      }
    }

    const dadosAtualizados = await this.faseInternaService.getPrecos(licitacaoId);
    return { ...dadosAtualizados, resumo };
  }

  /**
   * Upload de comprovante para uma cotação específica.
   * POST /fase-interna/:licitacaoId/precos/comprovante
   */
  @Post(':licitacaoId/precos/comprovante')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: comprovanteStorage(''),
      fileFilter: (req, file, cb) => {
        const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
        if (!allowed.includes(file.mimetype)) {
          return cb(new BadRequestException('Apenas PDF, JPG e PNG são permitidos!'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  async uploadComprovante(
    @Param('licitacaoId') licitacaoId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('itemNumero') itemNumeroStr: string,
    @Body('cotacaoIndex') cotacaoIndexStr: string,
  ) {
    if (!file) {
      throw new BadRequestException('O arquivo é obrigatório.');
    }
    if (!itemNumeroStr || !cotacaoIndexStr) {
      throw new BadRequestException('itemNumero e cotacaoIndex são obrigatórios.');
    }

    const itemNumero = parseInt(itemNumeroStr, 10);
    const cotacaoIndex = parseInt(cotacaoIndexStr, 10);

    if (isNaN(itemNumero) || isNaN(cotacaoIndex)) {
      throw new BadRequestException('itemNumero e cotacaoIndex devem ser números inteiros.');
    }

    // Caminho relativo a partir de uploads/
    const relativePath = `pesquisa-precos/${licitacaoId}/${file.filename}`;

    await this.faseInternaService.salvarComprovanteCotacao(
      licitacaoId,
      itemNumero,
      cotacaoIndex,
      relativePath,
    );

    return {
      url: `/api/uploads/${relativePath}`,
      path: relativePath,
    };
  }

  /**
   * Gera o PDF formal da Pesquisa de Preços.
   * POST /fase-interna/:licitacaoId/precos/gerar-documento
   */
  @Post(':licitacaoId/precos/gerar-documento')
  async gerarDocumentoPP(
    @Param('licitacaoId') licitacaoId: string,
    @Body() body: {
      responsavel: { nome: string; cargo: string; matricula?: string };
      metodologia: 'MEDIA' | 'MEDIANA' | 'MENOR_VALOR' | 'OUTRA';
      justificativaMetodologia?: string;
    },
  ) {
    // Carrega dados da pesquisa de preços
    const { dados, estatisticas } = await this.faseInternaService.getPrecos(licitacaoId);

    const dataAssinatura = new Date().toLocaleDateString('pt-BR');

    const relativePath = await this.geradorPpService.gerarDocumentoPP(licitacaoId, {
      // Os dados de processo/objeto/orgão são carregados dentro do GeradorPpService via licitacaoRepository
      numeroProcesso: licitacaoId, // será sobrescrito dentro do gerador
      objeto: '',
      orgao: '',
      itens: dados.itens,
      metodologia: body.metodologia,
      justificativaMetodologia: body.justificativaMetodologia,
      valorTotalEstimado: estatisticas?.valorTotal || 0,
      responsavel: body.responsavel,
      dataAssinatura,
    });

    return {
      url: `/api/uploads/${relativePath}`,
      path: relativePath,
    };
  }
}
