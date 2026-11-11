import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AcessoLicitacaoService, ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { AtorAtual, OrgaoOuFornecedor, SomenteFornecedor, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import { ehFornecedor } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';
import { ComprovantesService } from '../comprovantes/comprovantes.service';
import { DiligenciasService } from './diligencias.service';
import { TAMANHO_MAXIMO_ANEXO } from './regras-diligencia';

const ARQUIVO = FileInterceptor('arquivo', { storage: memoryStorage(), limits: { fileSize: TAMANHO_MAXIMO_ANEXO, files: 1 } });

/**
 * DILIGÊNCIA GERAL (Lei 14.133/2021, art. 64) — pedido do pregoeiro/agente a
 * um licitante, com prazo; resposta com texto e anexos.
 *  - órgão dono: abre, anexa, prorroga, encerra, vê todas;
 *  - licitante: vê e responde só as suas; outro fornecedor recebe 404.
 */
@Controller('diligencias')
export class DiligenciasController {
  constructor(
    private readonly diligencias: DiligenciasService,
    private readonly acesso: AcessoLicitacaoService,
    private readonly comprovantes: ComprovantesService,
  ) {}

  private id(...ids: string[]) {
    for (const i of ids) if (!ehUuid(i)) throw new BadRequestException('Identificador inválido');
  }

  @OrgaoOuFornecedor()
  @Get('licitacao/:licitacaoId')
  async listar(@Param('licitacaoId') licitacaoId: string, @Query('unidadeId') unidadeId: string | undefined, @AtorAtual() ator: Ator) {
    this.id(licitacaoId);
    if (ehFornecedor(ator)) {
      const fid = await this.acesso.assertFornecedorParticipa(ator, licitacaoId);
      return { papel: 'FORNECEDOR', diligencias: await this.diligencias.listar(licitacaoId, { fornecedorId: fid }) };
    }
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId, 'leitura');
    return {
      papel: 'ORGAO',
      diligencias: await this.diligencias.listar(licitacaoId, { unidadeId: unidadeId && ehUuid(unidadeId) ? unidadeId : null }),
      licitantes: await this.diligencias.licitantes(licitacaoId),
    };
  }

  @SomenteOrgao()
  @Post('licitacao/:licitacaoId')
  async abrir(
    @Param('licitacaoId') licitacaoId: string,
    @Body() body: { fornecedorId: string; unidadeId?: string | null; pedido: string; prazoHoras: number; fase?: string },
    @AtorAtual() ator: Ator,
  ) {
    this.id(licitacaoId, body?.fornecedorId);
    if (body?.unidadeId) this.id(body.unidadeId);
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId);
    return this.diligencias.abrir(licitacaoId, { fornecedorId: body.fornecedorId, unidadeId: body.unidadeId ?? null, pedido: String(body?.pedido ?? ''), prazoHoras: Number(body?.prazoHoras), fase: body?.fase ?? null }, ator);
  }

  @SomenteOrgao()
  @Post(':id/prorrogar')
  async prorrogar(@Param('id') id: string, @Body() body: { horas: number; motivo: string }, @AtorAtual() ator: Ator) {
    await this.orgaoDa(id, ator);
    return this.diligencias.prorrogar(id, { horas: Number(body?.horas), motivo: String(body?.motivo ?? '') }, ator);
  }

  @SomenteOrgao()
  @Post(':id/encerrar')
  async encerrar(@Param('id') id: string, @Body() body: { resultado: string; motivo: string }, @AtorAtual() ator: Ator) {
    await this.orgaoDa(id, ator);
    return this.diligencias.encerrar(id, { resultado: String(body?.resultado ?? ''), motivo: String(body?.motivo ?? '') }, ator);
  }

  @OrgaoOuFornecedor()
  @Post(':id/anexos')
  @UseInterceptors(ARQUIVO)
  async anexar(@Param('id') id: string, @UploadedFile() arquivo: Express.Multer.File, @Body() body: { descricao?: string }, @AtorAtual() ator: Ator) {
    if (ehFornecedor(ator)) {
      const dono = await this.fornecedorDa(id, ator);
      const r = await this.diligencias.anexar(id, 'FORNECEDOR', arquivo ?? null, body?.descricao ?? null, ator);
      await this.comprovantes
        .emitir({ licitacaoId: dono.licitacaoId, fornecedorId: dono.fornecedorId, tipo: 'DOCUMENTO_ANEXADO', descricao: `Anexado "${arquivo?.originalname ?? 'documento'}" — resposta a diligência` })
        .catch(() => undefined);
      return r;
    }
    await this.orgaoDa(id, ator);
    return this.diligencias.anexar(id, 'ORGAO', arquivo ?? null, body?.descricao ?? null, ator);
  }

  @OrgaoOuFornecedor()
  @Delete('anexos/:anexoId')
  async removerAnexo(@Param('anexoId') anexoId: string, @AtorAtual() ator: Ator) {
    this.id(anexoId);
    const dono = await this.diligencias.donoDoAnexo(anexoId);
    if (!dono) throw new NotFoundException('Anexo não encontrado');
    if (ehFornecedor(ator)) {
      if (this.acesso.fornecedorDoToken(ator) !== dono.fornecedorId) throw new NotFoundException('Anexo não encontrado');
      return this.diligencias.removerAnexo(anexoId, 'FORNECEDOR');
    }
    await this.acesso.assertOrgaoDaLicitacao(ator, dono.licitacaoId);
    return this.diligencias.removerAnexo(anexoId, 'ORGAO');
  }

  @SomenteFornecedor()
  @Post(':id/responder')
  async responder(@Param('id') id: string, @Body() body: { resposta?: string }, @AtorAtual() ator: Ator) {
    await this.fornecedorDa(id, ator);
    return this.diligencias.responder(id, String(body?.resposta ?? ''));
  }

  @OrgaoOuFornecedor()
  @Get('anexos/:anexoId/arquivo')
  async arquivo(@Param('anexoId') anexoId: string, @AtorAtual() ator: Ator) {
    this.id(anexoId);
    const dono = await this.diligencias.donoDoAnexo(anexoId);
    if (!dono) throw new NotFoundException('Anexo não encontrado');
    if (ehFornecedor(ator)) {
      if (this.acesso.fornecedorDoToken(ator) !== dono.fornecedorId) throw new NotFoundException('Anexo não encontrado');
    } else {
      await this.acesso.assertOrgaoDaLicitacao(ator, dono.licitacaoId, 'leitura');
    }
    const a = await this.diligencias.arquivo(anexoId);
    return new StreamableFile(a.conteudo, { type: a.mime, disposition: `attachment; filename="${encodeURIComponent(a.nome)}"` });
  }

  private async orgaoDa(id: string, ator: Ator) {
    this.id(id);
    const dono = await this.diligencias.donoDaDiligencia(id);
    if (!dono) throw new NotFoundException('Diligência não encontrada');
    await this.acesso.assertOrgaoDaLicitacao(ator, dono.licitacaoId);
    return dono;
  }

  /** A diligência é do licitante autenticado — de outro, 404 (não revela a existência). */
  private async fornecedorDa(id: string, ator: Ator) {
    this.id(id);
    const dono = await this.diligencias.donoDaDiligencia(id);
    if (!dono || this.acesso.fornecedorDoToken(ator) !== dono.fornecedorId) throw new NotFoundException('Diligência não encontrada');
    return dono;
  }
}
