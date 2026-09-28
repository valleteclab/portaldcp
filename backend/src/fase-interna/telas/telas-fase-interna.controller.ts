import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import * as fs from 'fs';
import { AtorAtual } from '../../auth/acesso/acesso.decorators';
import type { Ator } from '../../auth/acesso/ator';
import { DonoFaseInternaGuard } from '../dono-fase-interna.guard';
import { TarefasService } from '../tarefas/tarefas.service';
import { OrcamentoService } from '../orcamento/orcamento.service';
import { DocumentosTelaService } from './documentos-tela.service';
import { PesquisaTelaService } from './pesquisa-tela.service';
import { TrabalhoNaEtapa, TrabalhoNaEtapaGuard } from '../fluxo/trabalho-na-etapa.guard';

const UPLOAD_EVIDENCIA = FileInterceptor('arquivo', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

/**
 * TELAS POR ETAPA DA FASE INTERNA (Entrega 3A — DFD, ETP, TR, pesquisa de
 * preços e reserva orçamentária). DonoFaseInternaGuard na classe: anônimo
 * 401, fornecedor 403; `:licitacaoId` exige o órgão DONO (leitura de outro
 * órgão 404; escrita 403). Autor sempre do JWT.
 */
@Controller('fase-interna')
@UseGuards(DonoFaseInternaGuard, TrabalhoNaEtapaGuard)
export class TelasFaseInternaController {
  constructor(
    private readonly documentos: DocumentosTelaService,
    private readonly pesquisa: PesquisaTelaService,
    private readonly orcamento: OrcamentoService,
    private readonly tarefas: TarefasService,
  ) {}

  private autor(ator: Ator) {
    return this.tarefas.autor(ator);
  }

  // === DFD ===

  @Get(':licitacaoId/dfd')
  obterDfd(@Param('licitacaoId') id: string) {
    return this.documentos.obterDfd(id);
  }

  @TrabalhoNaEtapa({ passo: 'DFD', acao: 'salvar a demanda' })
  @Put(':licitacaoId/dfd')
  async salvarDfd(@Param('licitacaoId') id: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.documentos.salvarDfd(id, body ?? {}, await this.autor(ator));
  }

  /** Gera a peça pelo modelo (completa as seções vazias pela derivação) e o PDF — DFD, ETP e TR. */
  @TrabalhoNaEtapa({ tipoParam: 'tipo', acao: 'gerar a peça' })
  @Post(':licitacaoId/documentos/:tipo/gerar')
  async gerar(@Param('licitacaoId') id: string, @Param('tipo') tipo: string, @AtorAtual() ator: Ator) {
    return this.documentos.gerar(id, tipo, await this.autor(ator));
  }

  // === ETP ===

  @Get(':licitacaoId/etp')
  obterEtp(@Param('licitacaoId') id: string) {
    return this.documentos.obterEtp(id);
  }

  /** Assistente do ETP: { acao: ANALISAR | RASCUNHO | REESCREVER_MARCA, secao_id?, trecho? } — só sugere. */
  @TrabalhoNaEtapa({ passo: 'ETP', acao: 'assistente do ETP' })
  @Post(':licitacaoId/etp/assistente')
  async assistente(@Param('licitacaoId') id: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.documentos.assistente(id, body ?? {}, await this.autor(ator));
  }

  /** Justificativa formal da indicação de marca (art. 41, I). */
  @TrabalhoNaEtapa({ passo: 'ETP', acao: 'justificativa de marca' })
  @Put(':licitacaoId/etp/marca')
  async justificativaMarca(@Param('licitacaoId') id: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.documentos.salvarJustificativaMarca(id, body ?? {}, await this.autor(ator));
  }

  // === TR ===

  @Get(':licitacaoId/tr')
  obterTr(@Param('licitacaoId') id: string) {
    return this.documentos.obterTr(id);
  }

  // === PESQUISA DE PREÇOS ===

  @Get(':licitacaoId/pesquisa')
  obterPesquisa(@Param('licitacaoId') id: string) {
    return this.pesquisa.obter(id);
  }

  /** Parâmetro do art. 23, §1º: { situacao: CONSULTADO | SEM_RETORNO | NAO_CONSULTADO, data_consulta, resultado }. */
  @TrabalhoNaEtapa({ passo: 'PESQUISA', acao: 'registrar consulta da pesquisa' })
  @Put(':licitacaoId/pesquisa/parametros/:inciso')
  async salvarParametro(@Param('licitacaoId') id: string, @Param('inciso') inciso: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.pesquisa.salvarParametro(id, inciso, body ?? {}, await this.autor(ator));
  }

  @TrabalhoNaEtapa({ passo: 'PESQUISA', acao: 'registrar consulta da pesquisa' })
  @Post(':licitacaoId/pesquisa/parametros/:inciso/evidencia')
  @UseInterceptors(UPLOAD_EVIDENCIA)
  async evidencia(@Param('licitacaoId') id: string, @Param('inciso') inciso: string, @UploadedFile() arquivo: Express.Multer.File, @AtorAtual() ator: Ator) {
    return this.pesquisa.anexarEvidencia(id, inciso, arquivo, await this.autor(ator));
  }

  /** Proposta (cotação direta): { fornecedor, cnpj, data_emissao, validade_ate, itens: [{ item_numero, valor_unitario }] }. */
  @TrabalhoNaEtapa({ passo: 'PESQUISA', acao: 'registrar cotação' })
  @Post(':licitacaoId/pesquisa/propostas')
  async adicionarProposta(@Param('licitacaoId') id: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.pesquisa.adicionarProposta(id, body ?? {}, await this.autor(ator));
  }

  @TrabalhoNaEtapa({ passo: 'PESQUISA', acao: 'remover cotação' })
  @Delete(':licitacaoId/pesquisa/propostas/:grupoId')
  async removerProposta(@Param('licitacaoId') id: string, @Param('grupoId') grupoId: string, @AtorAtual() ator: Ator) {
    return this.pesquisa.removerProposta(id, grupoId, await this.autor(ator));
  }

  @TrabalhoNaEtapa({ passo: 'PESQUISA', acao: 'registrar cotação' })
  @Post(':licitacaoId/pesquisa/propostas/:grupoId/comprovante')
  @UseInterceptors(UPLOAD_EVIDENCIA)
  async comprovante(@Param('licitacaoId') id: string, @Param('grupoId') grupoId: string, @UploadedFile() arquivo: Express.Multer.File, @AtorAtual() ator: Ator) {
    return this.pesquisa.anexarComprovante(id, grupoId, arquivo, await this.autor(ator));
  }

  /** { metodo: MENOR | MEDIA | MEDIANA, justificativa_metodo, justificativa_fornecedores, justificativa_menos_de_tres, publicacao_prevista, solicitacao_enviada_em }. */
  @TrabalhoNaEtapa({ passo: 'PESQUISA', acao: 'método da pesquisa' })
  @Put(':licitacaoId/pesquisa/metodo')
  salvarMetodo(@Param('licitacaoId') id: string, @Body() body: any) {
    return this.pesquisa.salvarMetodo(id, body ?? {});
  }

  /** Emite o mapa e a certidão (400 com `pendencias` quando falta algo). */
  @TrabalhoNaEtapa({ passo: 'PESQUISA', acao: 'emitir mapa e certidão' })
  @Post(':licitacaoId/pesquisa/emitir')
  async emitirPesquisa(@Param('licitacaoId') id: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.pesquisa.emitir(id, body ?? {}, await this.autor(ator));
  }

  /** Pesquisa feita fora: { itens: [{ item_id, valor_unitario }] } (o mapa vai pelo anexo da peça PP). */
  @TrabalhoNaEtapa({ passo: 'PESQUISA', acao: 'valores dos itens' })
  @Put(':licitacaoId/pesquisa/valores-itens')
  async valoresItens(@Param('licitacaoId') id: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.pesquisa.salvarValoresItens(id, body ?? {}, await this.autor(ator));
  }

  /** Evidência (por inciso), comprovante (por proposta) ou certidão — só o órgão dono. */
  @Get(':licitacaoId/pesquisa/arquivos/:tipo/:chave')
  async arquivoPesquisa(@Param('licitacaoId') id: string, @Param('tipo') tipo: string, @Param('chave') chave: string, @Res() res: Response) {
    if (!['evidencia', 'comprovante', 'certidao'].includes(tipo)) throw new BadRequestException('Tipo de arquivo inválido');
    const a = await this.pesquisa.arquivo(id, tipo, chave);
    res.setHeader('Content-Type', a.mime);
    res.setHeader('Content-Disposition', `inline; filename="${a.nome}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(fs.readFileSync(a.caminho));
  }

  // === RESERVA ORÇAMENTÁRIA ===

  @Get(':licitacaoId/reserva')
  obterReserva(@Param('licitacaoId') id: string) {
    return this.orcamento.obter(id);
  }

  /** Autosave: { dotacao_id, lei_ldo_id, lei_loa_id, lei_ppa_id, linhas: [{ exercicio, valor, situacao }], declaracao_adequacao, declaracao_lrf, observacao }. */
  @TrabalhoNaEtapa({ passo: 'RESERVA', acao: 'salvar a reserva' })
  @Put(':licitacaoId/reserva')
  async salvarReserva(@Param('licitacaoId') id: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.orcamento.salvar(id, body ?? {}, await this.autor(ator));
  }

  @TrabalhoNaEtapa({ passo: 'RESERVA', acao: 'emitir e reservar' })
  @Post(':licitacaoId/reserva/emitir')
  async emitirReserva(@Param('licitacaoId') id: string, @AtorAtual() ator: Ator) {
    return this.orcamento.emitir(id, await this.autor(ator));
  }

  /** Nova versão para corrigir a classificação: { motivo }. */
  @TrabalhoNaEtapa({ passo: 'RESERVA', acao: 'retificar a reserva' })
  @Post(':licitacaoId/reserva/retificar')
  async retificarReserva(@Param('licitacaoId') id: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.orcamento.novaVersao(id, 'RETIFICAR', body ?? {}, await this.autor(ator));
  }

  /** Renovar dotação (virada do exercício): { exercicio?, motivo? } — nova versão + tarefa da Contabilidade. */
  @TrabalhoNaEtapa({ passo: 'RESERVA', acao: 'renovar a dotação' })
  @Post(':licitacaoId/reserva/renovar')
  async renovarReserva(@Param('licitacaoId') id: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.orcamento.novaVersao(id, 'RENOVAR', body ?? {}, await this.autor(ator));
  }

  /** Devolver sem saldo: { motivo }. */
  @TrabalhoNaEtapa({ passo: 'RESERVA', acao: 'devolver sem dotação' })
  @Post(':licitacaoId/reserva/devolver')
  async devolverReserva(@Param('licitacaoId') id: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.orcamento.devolver(id, body ?? {}, await this.autor(ator));
  }
}

function orgaoDoAtor(ator: Ator, informado?: string): string {
  if (ator.admin) {
    if (!informado) throw new BadRequestException('Informe ?orgao_id= (administrador da plataforma)');
    return informado;
  }
  return ator.orgaoId!;
}

/**
 * TABELAS ORÇAMENTÁRIAS DO ÓRGÃO (dotações e leis LDO/LOA/PPA) — Entrega 3A.
 * Sempre o órgão do token (admin da plataforma com ?orgao_id=). Qualquer
 * servidor do órgão cadastra (a Contabilidade faz o cadastro rápido na tela
 * da reserva); registro de outro órgão: 403 na escrita.
 */
@Controller('orcamento')
@UseGuards(DonoFaseInternaGuard)
export class OrcamentoController {
  constructor(
    private readonly orcamento: OrcamentoService,
    private readonly tarefas: TarefasService,
  ) {}

  @Get('dotacoes')
  dotacoes(@AtorAtual() ator: Ator, @Query('exercicio') exercicio?: string, @Query('todas') todas?: string, @Query('orgao_id') orgaoId?: string) {
    return this.orcamento.listarDotacoes(orgaoDoAtor(ator, orgaoId), { exercicio: exercicio ? Number(exercicio) : undefined, todas: todas === 'true' });
  }

  @Post('dotacoes')
  async criarDotacao(@AtorAtual() ator: Ator, @Body() body: any, @Query('orgao_id') orgaoId?: string) {
    return this.orcamento.criarDotacao(orgaoDoAtor(ator, orgaoId), body ?? {}, await this.tarefas.autor(ator));
  }

  @Put('dotacoes/:id')
  atualizarDotacao(@AtorAtual() ator: Ator, @Param('id') id: string, @Body() body: any, @Query('orgao_id') orgaoId?: string) {
    return this.orcamento.atualizarDotacao(orgaoDoAtor(ator, orgaoId), id, body ?? {});
  }

  @Get('leis')
  leis(@AtorAtual() ator: Ator, @Query('tipo') tipo?: string, @Query('todas') todas?: string, @Query('orgao_id') orgaoId?: string) {
    return this.orcamento.listarLeis(orgaoDoAtor(ator, orgaoId), { tipo, todas: todas === 'true' });
  }

  @Post('leis')
  criarLei(@AtorAtual() ator: Ator, @Body() body: any, @Query('orgao_id') orgaoId?: string) {
    return this.orcamento.criarLei(orgaoDoAtor(ator, orgaoId), body ?? {});
  }

  @Put('leis/:id')
  atualizarLei(@AtorAtual() ator: Ator, @Param('id') id: string, @Body() body: any, @Query('orgao_id') orgaoId?: string) {
    return this.orcamento.atualizarLei(orgaoDoAtor(ator, orgaoId), id, body ?? {});
  }
}
